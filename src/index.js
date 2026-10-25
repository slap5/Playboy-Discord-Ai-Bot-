require('dotenv').config();
const {Client, GatewayIntentBits, Events, PermissionsBitField, ChannelType} = require('discord.js');
const {joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus,
  StreamType, VoiceConnectionStatus, NoSubscriberBehavior, entersState, EndBehaviorType} = require('@discordjs/voice');
const prism = require('prism-media');
const localAI = require('./local-ai');
const webMusic = require('./web-music');
const autoplay = require('./autoplay');
const {Readable} = require('node:stream');
const path = require('node:path');
const {pcmToWav, tracks, resolveTrack, stripEmojis, speechText, speechChunks, parseMusicCommand, resolveVoiceTrack, activatedRequest} = require('./util');
for (const k of ['DISCORD_TOKEN','DISCORD_GUILD_ID']) {
  if (!process.env[k]) throw new Error(`Set ${k} in .env first. See README.md.`);
}
const client = new Client({intents:[GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates,
  GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent], allowedMentions:{parse:[], repliedUser:false}});
const prefix = process.env.BOT_PREFIX || '!';
const {Levels,voiceEligible}=require('./levels');
const levels=new Levels(path.join(__dirname,'..','data','levels.json'));
function syncVoiceXP(guild,tick=false) {
  if(guild.id!==process.env.DISCORD_GUILD_ID)return;
  try {if(tick)levels.tick(voiceEligible(guild));else levels.reconcile(voiceEligible(guild));}
  catch(e){report('XP saving',e);}
}
const musicRoot = path.join(__dirname, '..', 'music');
const sessions = new Map(), chats = new Map(), busyChats = new Set(), cooldown = new Map();
// Never log transcripts, API request bodies, or secrets.
function report(where, e) {
  let detail = String(e?.error?.message || e?.message || 'No details');
  for (const secret of [process.env.LOCAL_AUDIO_TOKEN, process.env.DISCORD_TOKEN]) {
    if (secret) detail = detail.split(secret).join('[REDACTED]');
  }
  console.error(`${where}: status ${e?.status || 'n/a'} — ${detail}`);
}
function notice(s, text) { return s.textChannel.send(text).catch(() => {}); }
function valid(s, id) { return !s.closed && s.consent.has(id) && s.guild.members.cache.get(id)?.voice.channelId === s.channelId; }
function alive(s) { return !s.closed && sessions.get(s.guild.id) === s; }
async function answer(history, text, voice=false, signal) {
  const raw = await localAI.chat({
    messages:[{role:'system', content:'You are a friendly, relaxed AI gaming companion in Discord. Give concise, useful, accurate answers with occasional light humor. Keep technical instructions clear. Never claim to be a human or impersonate a real person. Do not invent personal facts about the developer. You cannot browse, run code, or control music; music requests are handled separately by the bot. Do not include emojis, emoji shortcodes, or decorative emoticons. The voice activation keyword is removed before requests reach you; do not announce activation. '+
      (voice ? 'Reply with only words meant to be spoken, usually in 1 to 3 sentences. Do not use Markdown, asterisks, formatting labels, or roleplay stage directions such as *laughs*. Do not say asterisk or astric to mark emphasis.' : 'Use concise Discord-friendly formatting.')},
    ...history, {role:'user', content:text.slice(0,4000)}], max_completion_tokens:voice ? 180 : 500}, signal);
  const out = stripEmojis(raw) || 'Could you say that another way?';
  history.push({role:'user',content:text.slice(0,4000)}, {role:'assistant',content:out});
  history.splice(0, Math.max(0,history.length-12));
  return out;
}
async function musicSelection(query,voice=false) {
  if(!query.trim()) throw new Error('Say or type a song name, preferably with the artist.');
  try {return await (voice ? resolveVoiceTrack(musicRoot,query) : resolveTrack(musicRoot,query));}
  catch(e) {
    if(!/No matching music file|Track not found/.test(e.message)) throw e;
    webMusic.searchArgs(query); // Validate before accepting the queue entry.
    return {kind:'web',query,name:`Search: ${query}`};
  }
}
function releaseMusic(s) {
  s.musicJob?.abort(); s.musicJob=null;
  s.webStream?.stop(); s.webStream=null;
}
function haltMusic(s,clear=true) {
  releaseMusic(s);
  s.current=null;
  if(clear) {s.queue=[];s.autoplayStopped=true;}
  // stop() emits Idle for an active track. While searching, there is no active player.
  if(!s.music.stop(true) && !clear) void next(s);
}
async function next(s) {
  if (!alive(s)) return;
  releaseMusic(s);
  let track=s.queue.shift() || null;
  const job=new AbortController(); s.musicJob=job;
  s.current=track || {name:'Finding next song...',autofill:true};
  try {
    if(!track) {
      const candidate=await autoplay.select(s,musicRoot,job.signal);
      if(job.signal.aborted || !alive(s)) return;
      track=s.queue.shift() || candidate; // A manual request takes priority.
      s.current=track;
      if(!track) return;
    }
    let resource;
    if(track.kind==='web') {
      await notice(s,`Searching online: ${track.query}`);
      const resolved=await (track.id ? webMusic.resolveId(track.id,job.signal) : webMusic.resolve(track.query,job.signal));
      if(job.signal.aborted || !alive(s) || s.current!==track) return;
      track.name=resolved.name;track.id=resolved.id;track.artist=resolved.artist || track.artist;
      s.webStream=webMusic.openStream(resolved);
      resource=createAudioResource(s.webStream.stream,{inputType:StreamType.Raw,inlineVolume:true});
      // Announce the actual selected result instead of claiming an exact match.
      void notice(s,`Now streaming: ${track.name}`);
    } else resource=createAudioResource(track.path,{inlineVolume:true});
    resource.volume.setVolume(s.volume);
    autoplay.remember(s,track);
    s.music.play(resource);
    if (s.musicPaused || s.speaking) s.music.pause();
  } catch(e) {
    if(job.signal.aborted || !alive(s) || (track && s.current!==track)) return;
    s.autoplayStopped=true; // Avoid endless searches after an extraction/playback failure.
    report('music',e); await notice(s,e.message || 'Music playback failed.');
    if(!job.signal.aborted && alive(s)) {s.current=null;if(s.queue.length) setImmediate(()=>next(s));}
  }
}
function setAutoplay(s,enabled) {
  s.autoplay=enabled;
  if(enabled) {
    s.autoplayStopped=false;
    if(!s.current && s.lastTrack) void next(s);
  } else if(s.current?.autofill) {
    releaseMusic(s);s.current=null;
    if(s.queue.length) void next(s);
  }
}
function close(s) {
  if (s.closed) return;
  s.closed=true;
  releaseMusic(s);
  for (const c of [...s.captures.values()]) c(false);
  s.abort?.abort(); s.consent.clear(); s.histories.clear(); s.queue=[];
  s.speech.stop(true); s.music.stop(true);
  if (s.connection.state.status !== VoiceConnectionStatus.Destroyed) s.connection.destroy();
  if (sessions.get(s.guild.id) === s) sessions.delete(s.guild.id);
}
async function speak(s, text, signal, authorized) {
  if (!alive(s) || !authorized() || signal.aborted) return;
  s.speaking=true; s.music.pause(); s.connection.subscribe(s.speech);
  try {
    // Generate short local speech chunks so long replies can be stopped between chunks.
    // Keep music paused across every chunk and recheck consent at each boundary.
    for (const input of speechChunks(speechText(text).slice(0,2000),450)) {
      if (!alive(s) || !authorized() || signal.aborted) break;
      const bytes = await localAI.speech(input,signal);
      if (!alive(s) || !authorized() || signal.aborted) break;
    await new Promise((resolve,reject) => {
      const finish = e => { clearTimeout(timer); s.speech.off('error',onError); s.speech.off(AudioPlayerStatus.Idle,onIdle); e ? reject(e) : resolve(); };
      const onError = e=>finish(e), onIdle=()=>finish();
      const timer=setTimeout(()=>{s.speech.stop(true); finish(new Error('Playback timeout'));},90000);
      s.speech.once('error',onError); s.speech.once(AudioPlayerStatus.Idle,onIdle);
      try { s.speech.play(createAudioResource(Readable.from([bytes]))); } catch(e) { finish(e); }
    });
    }
  } finally {
    s.speaking=false;
    if (alive(s)) {s.connection.subscribe(s.music); if (!s.musicPaused) s.music.unpause();}
  }
}
async function voiceTurn(s,id,pcm) {
  if (!valid(s,id) || s.processing || s.listeningPaused || pcm.length < 67200) return;
  s.voiceStatus.set(id,'Audio received; transcribing locally.');
  s.voiceStage='transcription';
  s.processing=true; s.activeUser=id; s.abort=new AbortController();
  try {
    const signal=s.abort.signal;
    const tr=await localAI.transcribe(pcmToWav(pcm),signal);
    if (!valid(s,id) || s.listeningPaused) return;
    const text=activatedRequest(tr.text || '');
    s.voiceStatus.set(id,text ? 'Activation matched; processing your request.' : (tr.text?.trim() ? 'Speech recognized, but no leading Playboy + request matched. Say both in one sentence.' : 'No speech recognized. Check your microphone level and reduce background music.'));
    if (!text) return; // Only a prefixed request activates a response; the keyword alone is silent.
    const musicCommand=parseMusicCommand(text);
    if(musicCommand) {
      s.voiceStage='music command';
      // Execute explicit commands directly; the chat model cannot invoke playback.
      if(musicCommand.action==='stop') {
        haltMusic(s,true);
        await notice(s,'Music stopped by voice; queue cleared.');
      } else if(musicCommand.action==='skip') {
        haltMusic(s,false);await notice(s,'Skipped.');
      } else if(musicCommand.action==='autoplay') {
        setAutoplay(s,musicCommand.enabled);await notice(s,`Autoplay ${musicCommand.enabled?'on':'off'}.`);
      } else {
        try {
          if(s.queue.length>=50) throw new Error('Music queue is full (50 tracks).');
          webMusic.searchArgs(musicCommand.query);
          const track={kind:'web',query:musicCommand.query,name:`Search: ${musicCommand.query}`};
          s.voiceStatus.set(id,`Music search queued: ${musicCommand.query}`);
          // Consent/channel membership can change while the folder is being read.
          if(!valid(s,id) || s.listeningPaused || signal.aborted) return;
          s.queue.push(track); s.autoplayStopped=false; s.musicPaused=false;
          if(!s.current) void next(s);
          else if(!s.speaking) s.music.unpause();
          await notice(s,`Queued by voice: ${track.name}`);
        } catch(e) {
          if(valid(s,id)) await notice(s,e.message);
        }
      }
      return;
    }
    const history=s.histories.get(id) || []; s.histories.set(id,history);
    s.voiceStage='chat';
    const reply=await answer(history,text,true,signal);
    s.voiceStage='speech generation/playback';
    if (valid(s,id) && !s.listeningPaused) await speak(s,reply,signal,()=>valid(s,id) && !s.listeningPaused);
  } catch(e) {if (e.name !== 'AbortError' && e.name !== 'APIUserAbortError') {s.voiceStatus.set(id,`Request failed during ${s.voiceStage || 'voice processing'}; check the console.`);report(`voice ${s.voiceStage || 'unknown stage'}`,e); if(alive(s)) notice(s,'Voice reply failed. Check the local AI services, FFmpeg, and the bot console.');}}
  finally {if(s.voiceStatus.get(id)==='Activation matched; processing your request.') s.voiceStatus.set(id,'Activation matched; request finished.');s.processing=false; s.activeUser=null; s.abort=null;}
}
function capture(s,id) {
  if (!valid(s,id) || s.processing || s.speaking || s.listeningPaused || s.captures.has(id) || s.captures.size>=4) return;
  const opus=s.connection.receiver.subscribe(id,{end:{behavior:EndBehaviorType.AfterSilence,duration:1600}});
  const decoder=new prism.opus.Decoder({rate:48000,channels:2,frameSize:960});
  let chunks=[], size=0, done=false;
  const finish=send=>{
    if(done) return; done=true; clearTimeout(timer); s.captures.delete(id);
    opus.unpipe(decoder); opus.destroy(); decoder.destroy();
    const pcm=send ? Buffer.concat(chunks) : null; chunks=[];
    if(pcm) void voiceTurn(s,id,pcm);
  };
  // Bounded memory and duration, including a speaker who never stops talking.
  const timer=setTimeout(()=>finish(true),15000);
  s.captures.set(id,finish);
  decoder.on('data',chunk=>{size+=chunk.length; if(size<=192000*15) chunks.push(chunk); else finish(true);});
  decoder.once('end',()=>finish(true));
  decoder.once('error',()=>finish(false)); opus.once('error',()=>finish(false));
  opus.pipe(decoder);
}
function autoListen(s,member) {
  if(!member || member.user.bot || s.optedOut.has(member.id)) return false;
  s.consent.add(member.id);return true;
}
async function join(message) {
  const channel=message.member?.voice.channel;
  if(!channel || channel.type !== ChannelType.GuildVoice) return message.reply('Join a normal server voice channel first.');
  const old=sessions.get(message.guild.id);
  if(old) return message.reply(old.channelId===channel.id ? 'Already here. Listening is automatic unless you used !listen off. Start your request with Playboy.' : 'Already in another call. Disconnect me there first.');
  const permissions=channel.permissionsFor(message.guild.members.me);
  if(!permissions?.has([PermissionsBitField.Flags.Connect, PermissionsBitField.Flags.Speak])) return message.reply('I need Connect and Speak permissions.');
  const connection=joinVoiceChannel({channelId:channel.id,guildId:message.guild.id,adapterCreator:message.guild.voiceAdapterCreator,selfDeaf:false,selfMute:false});
  const s={guild:message.guild,channelId:channel.id,textChannel:message.channel,connection,
    music:createAudioPlayer({behaviors:{noSubscriber:NoSubscriberBehavior.Pause}}),speech:createAudioPlayer(),
    consent:new Set(),optedOut:new Set(),voiceStatus:new Map(),histories:new Map(),captures:new Map(),queue:[],autoplay:true,autoplayStopped:false,recent:[],volume:0.4,closed:false,musicPaused:false};
  sessions.set(message.guild.id,s); connection.subscribe(s.music);
  s.music.on(AudioPlayerStatus.Idle,()=>next(s));
  s.music.on('error',e=>{s.autoplayStopped=true;report('music',e);notice(s,'Music playback failed. Check the stream/file or run UPDATE-MUSIC.cmd.');});
  s.speech.on('error',e=>report('speech playback',e));
  connection.on('error',e=>{report('voice connection',e);close(s);});
  connection.on(VoiceConnectionStatus.Destroyed,()=>close(s));
  connection.on(VoiceConnectionStatus.Disconnected,async()=>{
    try {await Promise.race([entersState(connection,VoiceConnectionStatus.Signalling,5000),entersState(connection,VoiceConnectionStatus.Connecting,5000)]);}
    catch {close(s);}
  });
  connection.receiver.speaking.on('start',id=>capture(s,id));
  try {await entersState(connection,VoiceConnectionStatus.Ready,20000);}
  catch(e) {close(s);throw e;}
  if(!alive(s)) return;
  await message.reply('Joined! My voice is AI-generated. Listening is automatic for people in this call. Audio is processed locally on the bot host for transcription; start requests with Playboy. `!listen off` stops listening to you for this bot session, and `!listen on` enables it again. Music: `!tracks`, `!play song name`.');
  for(const member of channel.members.values()) autoListen(s,member);
}
function revoke(s,id) {
  s.consent.delete(id); s.voiceStatus.delete(id); s.histories.delete(id); s.captures.get(id)?.(false);
  if(s.activeUser===id) {s.abort?.abort();s.speech.stop(true);}
}
client.on(Events.VoiceStateUpdate,(before,after)=>{
  syncVoiceXP(after.guild);
  const s=sessions.get(before.guild.id); if(!s) return;
  if(before.channelId===s.channelId && after.channelId!==s.channelId) revoke(s,before.id);
  if(after.channelId===s.channelId && before.channelId!==s.channelId && autoListen(s,after.member)) {
    void notice(s,`Listening is automatic for new participants in this call, including ${after.member.displayName}. Speech is transcribed locally; start requests with Playboy. Use !listen off to opt out.`);
  }
  if(after.id===client.user.id && after.channelId!==s.channelId) close(s);
  const channel=s.guild.channels.cache.get(s.channelId);
  if(!channel?.members.some(m=>!m.user.bot)) close(s);
});
const help='**Levels**: `!rank`, `!rank @user`, `!leaderboard`\n**AI**: `!ask question`, `!forget`\n**Voice**: `!join`, `!voice`, `!listen on`, `!listen off`, `!pause`, `!resume`, `!leave`\n**Music**: `!tracks`, `!play song name`, `!queue`, `!skip`, `!stop`, `!autoplay on/off`, `!mpause`, `!mresume`, `!volume 0-100`\nVoice and music controls require being in my call. Say “Playboy, play song name” or “Playboy, stop music” once I join. Music pauses during spoken replies. Voice listening is automatic; !listen off opts you out. Listening pauses while I answer.';
client.on(Events.MessageCreate,async message=>{
  if(message.author.bot || message.guildId!==process.env.DISCORD_GUILD_ID) return;
  if(!message.content.startsWith(prefix)) {
    try {levels.chat(message.author.id,message.content);}catch(e){report('XP saving',e);}
    return;
  }
  const body=message.content.slice(prefix.length).trim(), cut=body.indexOf(' ');
  const command=(cut<0?body:body.slice(0,cut)).toLowerCase(), arg=cut<0?'':body.slice(cut+1).trim();
  const id=message.author.id, key=`${message.channelId}:${id}`;
  try {
    if(command==='rank' || command==='level' || command==='xp') {
      const target=message.mentions.users.first() || message.author;
      const r=levels.get(target.id);
      return void await message.reply(`${target.username}: Level ${r.level} | ${r.xp} XP total | ${r.progress}/${r.needed} XP toward level ${r.level+1}`);
    }
    if(command==='leaderboard' || command==='lb') {
      const rows=levels.top();
      return void await message.reply(rows.length ? rows.map((r,i)=>`${i+1}. <@${r.id}> — Level ${r.level}, ${r.xp} XP`).join('\n') : 'No XP earned yet. Start chatting or join a call with a friend.');
    }
    if(command==='help') return void await message.reply(help.replaceAll('!',prefix));
    if(command==='forget') {chats.delete(key);return void await message.reply('Text history cleared for you in this channel.');}
    if(command==='ask') {
      if(!arg) return void await message.reply(`Use ${prefix}ask followed by a question.`);
      if(busyChats.has(key) || Date.now()-(cooldown.get(id)||0)<5000) return void await message.reply('Wait for the current reply or try again in a few seconds.');
      cooldown.set(id,Date.now());busyChats.add(key);
      try {
        if(!chats.has(key)) {if(chats.size>=200) chats.delete(chats.keys().next().value);chats.set(key,[]);}
        await message.channel.sendTyping();
        const out=await answer(chats.get(key),arg);
        for(let i=0;i<out.length;i+=1900) await message.reply(out.slice(i,i+1900));
      } finally {busyChats.delete(key);}
      return;
    }
    if(command==='join') return void await join(message);
    if(command==='tracks') {const names=await tracks(musicRoot);return void await message.reply(names.length ? names.join('\n').slice(0,1900) : 'Add MP3/WAV/OGG/FLAC/M4A files to the bot’s music folder first.');}
    const known=['voice','listen','pause','resume','leave','play','queue','skip','stop','autoplay','mpause','mresume','volume'];
    if(!known.includes(command)) return;
    const s=sessions.get(message.guild.id);
    if(!s || message.member?.voice.channelId!==s.channelId) return void await message.reply('Join my voice channel first. Use !join if I am not connected.');
    if(command==='leave') {close(s);return void await message.reply('Disconnected. Voice history and opt-ins cleared.');}
    if(command==='voice') return void await message.reply(`Listening to you: ${s.consent.has(id)?'on':'OFF — type !listen on'}\nListening: ${s.listeningPaused?'paused — type !resume':s.speaking?'waiting for the bot to finish speaking':s.processing?'busy processing a request':'ready'}\nServer deafened: ${s.guild.members.me?.voice.serverDeaf?'YES — ask a moderator to undeafen me':'no'}\nLast result: ${s.voiceStatus.get(id)||'No completed voice clip received from you yet.'}`);
    if(command==='listen') {
      if(arg==='on') {s.optedOut.delete(id);s.consent.add(id);return void await message.reply('You opted in: your speech will be processed locally on the bot host. Start each spoken request with Playboy. Say the request in the same sentence, after the bot finishes answering. Use !listen off to stop.');}
      if(arg==='off') {s.optedOut.add(id);revoke(s,id);return void await message.reply('Listening to you stopped and your voice history cleared.');}
      return void await message.reply('Use !listen on or !listen off.');
    }
    if(command==='pause') {s.listeningPaused=true; for(const c of [...s.captures.values()]) c(false);s.abort?.abort();s.speech.stop(true);return void await message.reply('Voice listening paused for this call.');}
    if(command==='resume') {s.listeningPaused=false;return void await message.reply('Voice listening resumed for opted-in speakers.');}
    if(command==='play') {
      if(s.queue.length>=50) return void await message.reply('Queue is full (50 tracks).');
      const track=await musicSelection(arg); if(!alive(s)) return;
      s.queue.push(track); s.autoplayStopped=false; if(!s.current) void next(s);
      return void await message.reply(`Queued: ${track.name}`);
    }
    if(command==='queue') return void await message.reply(`Now: ${s.current?.name || 'Nothing'}\n${s.queue.map((t,i)=>`${i+1}. ${t.name}`).join('\n') || 'Queue is empty.'}`.slice(0,1900));
    if(command==='autoplay') {
      if(!['on','off'].includes(arg.toLowerCase())) return void await message.reply(`Autoplay is ${s.autoplay?'on':'off'}. Use !autoplay on or !autoplay off.`);
      setAutoplay(s,arg.toLowerCase()==='on');return void await message.reply(`Autoplay ${s.autoplay?'on':'off'}.`);
    }
    if(command==='skip') {haltMusic(s,false);return void await message.reply('Skipped.');}
    if(command==='stop') {haltMusic(s,true);return void await message.reply('Music stopped; queue cleared.');}
    if(command==='mpause') {s.musicPaused=true;s.music.pause();return void await message.reply('Music paused.');}
    if(command==='mresume') {s.musicPaused=false;if(!s.speaking) s.music.unpause();return void await message.reply('Music resumed.');}
    if(command==='volume') {
      const v=Number(arg); if(!arg || !Number.isFinite(v) || v<0 || v>100) return void await message.reply('Use !volume 0 through 100.');
      s.volume=v/100;s.music.state.resource?.volume?.setVolume(s.volume);return void await message.reply(`Music volume: ${v}%`);
    }
  } catch(e) {report('command',e);await message.reply(command==='play' ? e.message : 'Something failed. Check the local AI services and the bot console.').catch(()=>{});}
});
setInterval(()=>{const now=Date.now();for(const [id,t] of cooldown) if(now-t>60000) cooldown.delete(id);},60000).unref();
client.once(Events.ClientReady,c=>{
  console.log(`Ready as ${c.user.tag}. Type ${prefix}help.`);
  const guild=c.guilds.cache.get(process.env.DISCORD_GUILD_ID);
  if(guild)syncVoiceXP(guild);
  setInterval(()=>{const g=c.guilds.cache.get(process.env.DISCORD_GUILD_ID);if(g)syncVoiceXP(g,true);},15000).unref();
});
for(const event of ['SIGINT','SIGTERM']) process.on(event,()=>{for(const s of sessions.values()) close(s);client.destroy();process.exit(0);});
client.login(process.env.DISCORD_TOKEN).catch(e=>{report('login',e);process.exitCode=1;});
