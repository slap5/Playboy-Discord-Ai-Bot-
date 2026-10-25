const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {pcmToWav,resolveTrack,tracks}=require('../src/util');
test('Discord PCM is wrapped as 48kHz stereo 16-bit WAV',()=>{
 const pcm=Buffer.alloc(192000);const wav=pcmToWav(pcm);
 assert.equal(wav.length,192044);assert.equal(wav.toString('ascii',0,4),'RIFF');
 assert.equal(wav.readUInt32LE(24),48000);assert.equal(wav.readUInt16LE(22),2);
 assert.equal(wav.readUInt16LE(34),16);assert.equal(wav.readUInt32LE(40),pcm.length);
 assert.equal(wav.readUInt32LE(4),wav.length-8);
});
test('music lookup handles ambiguity and rejects traversal and symlinks',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'bot-test-'));
 try {
  await fs.writeFile(path.join(root,'Song One.mp3'),'');await fs.writeFile(path.join(root,'Song Two.wav'),'');
  await fs.writeFile(path.join(root,'secret.txt'),'');
  await fs.symlink(path.join(root,'secret.txt'),path.join(root,'link.mp3'));
  assert.deepEqual(await tracks(root),['Song One.mp3','Song Two.wav']);
  assert.equal((await resolveTrack(root,'song one')).name,'Song One.mp3');
  await assert.rejects(resolveTrack(root,'song'),/Several/);
  await assert.rejects(resolveTrack(root,'../secret.txt'),/not found/);
  await assert.rejects(resolveTrack(root,'link.mp3'),/not found/);
  await assert.rejects(resolveTrack(root,''));
 } finally {await fs.rm(root,{recursive:true,force:true});}
});
const {speechChunks}=require('../src/util');
const {speechText}=require('../src/util');
const {stripEmojis}=require('../src/util');
test('emoji removal handles joined emoji, flags, keycaps and Discord markup without deleting digits',()=>{
 assert.equal(stripEmojis('Hey 😎 👨‍👩‍👧‍👦 👍🏽 🇺🇸 1️⃣ ❤️'),'Hey');
 assert.equal(stripEmojis('Hello <:wave:12345><a:dance:67890>'),'Hello');
 assert.equal(stripEmojis('Version 123 #tag *bold* café'),'Version 123 #tag *bold* café');
 assert.equal(speechText('**Hey** 😎'),'Hey');
 assert.equal(stripEmojis('😎'),'');
});
test('speech removes formatting marks while keeping the spoken words',()=>{
 assert.equal(speechText('**Hey**, *homie*! Try `!skip`.'),'Hey, homie! Try !skip.');
 assert.equal(speechText('# Hello\n- __Good__ idea.\n[Details](https://example.com)'),'Hello Good idea. Details');
 assert.equal(speechText('***'),'');
 assert.equal(speechText('Code: ```js\nsecret()\n``` Done.'),'Code: Done.');
});
test('speech chunks respect character limits without dropping words',()=>{
 const text='A helpful answer with several words. '.repeat(30).trim();
 const chunks=speechChunks(text);
 assert.ok(chunks.length>1);assert.ok(chunks.every(x=>x.length<=190 && x.length>0));
 assert.equal(chunks.join(' '),text);
 assert.deepEqual(speechChunks('   '),[]);
 const long='😀'.repeat(220);
 assert.equal(speechChunks(long).join(''),long);
 assert.ok(speechChunks(long).every(x=>x.length<=190));
 assert.equal(speechChunks('a'.repeat(500)).join(''),'a'.repeat(500));
});
const {parseMusicCommand,resolveVoiceTrack}=require('../src/util');
test('spoken music commands are explicit and respect wake-word prefixes',()=>{
 assert.deepEqual(parseMusicCommand('Play my song.'),{action:'play',query:'my song'});
 assert.deepEqual(parseMusicCommand('Please stop the music!'),{action:'stop'});
 assert.deepEqual(parseMusicCommand('Stop'),{action:'stop'});
 assert.deepEqual(parseMusicCommand('Hey Buddy, play my song please.','buddy'),{action:'play',query:'my song'});
 assert.deepEqual(parseMusicCommand('A+B, stop music','a+b'),{action:'stop'});
 assert.equal(parseMusicCommand('Play my song','buddy'),null);
 assert.equal(parseMusicCommand('Why did you stop music?'),null);
 assert.equal(parseMusicCommand('Explain how to play chess'),null);
});
test('voice filename lookup normalizes punctuation and refuses ambiguous matches',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'voice-music-test-'));
 try {
  for(const name of ['My_Song.mp3','Other-song.wav','Other-song.flac']) await fs.writeFile(path.join(root,name),'');
  assert.equal((await resolveVoiceTrack(root,'my song')).name,'My_Song.mp3');
  await assert.rejects(resolveVoiceTrack(root,'other song'),/Several/);
  await assert.rejects(resolveVoiceTrack(root,'nonexistent'),/No matching/);
  await assert.rejects(resolveVoiceTrack(root,''),/No matching/);
 } finally {await fs.rm(root,{recursive:true,force:true});}
});
const {activatedRequest}=require('../src/util');
test('Playboy activation strips the address, stays silent alone, and rejects incidental mentions',()=>{
 assert.equal(activatedRequest('Playboy, tell me a joke.'),'tell me a joke.');
 assert.equal(activatedRequest('Hey Playboy! Play my song.'),'Play my song.');
 assert.equal(activatedRequest('play boy stop music'),'stop music');
 assert.equal(activatedRequest('Hey! Playboy, can you hear me?'),'can you hear me?');
 assert.equal(activatedRequest('“Play-boy: tell me a joke.'),'tell me a joke.');
 assert.equal(activatedRequest('Okay, play  boy, hello'),'hello');
 assert.equal(activatedRequest('Hi, Playboy!'),null);
 assert.equal(activatedRequest('I said hey Playboy tell me a joke'),null);
 for(const text of ['Playboy','Playboy!','hey playboy...','Tell me about Playboy','playboys are here','hello there']) assert.equal(activatedRequest(text),null);
 assert.deepEqual(parseMusicCommand(activatedRequest('Playboy, stop music.')),{action:'stop'});
});
