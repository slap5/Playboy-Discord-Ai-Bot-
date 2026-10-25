const {spawn}=require('node:child_process');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
function searchArgs(query) {
  if(typeof query!=='string' || !query.trim() || query.length>200) throw new Error('Use a song name between 1 and 200 characters.');
  if(/https?:\/\//i.test(query)) throw new Error('Use a song name and artist rather than a URL.');
  return ['-m','yt_dlp','--ignore-config','--no-plugin-dirs','--no-cache-dir','--no-playlist',
    '--no-warnings','--no-progress','--skip-download','--dump-single-json','--socket-timeout','15',
    '--retries','1','--extractor-retries','1','--js-runtimes',`node:${process.execPath}`,
    '-f','bestaudio[protocol=https]/best[protocol=https]','--',`ytsearch1:${query.trim()}`];
}
function parseResult(json) {
  const result=JSON.parse(json), item=result.entries ? result.entries.find(Boolean) : result;
  if(!item?.url) throw new Error('No playable result found. Try adding the artist name.');
  const url=new URL(item.url);
  if(url.protocol!=='https:' || !url.hostname.endsWith('.googlevideo.com')) throw new Error('Search did not return a supported YouTube audio stream.');
  if(item.is_live || item.live_status==='is_live') throw new Error('Live streams are not supported. Request a specific song.');
  return {id:item.id,artist:String(item.artist || item.uploader || '').slice(0,140),url:url.href,name:String(item.title || 'Online song').slice(0,160),
    userAgent:String(item.http_headers?.['User-Agent'] || '').replace(/[\r\n]/g,'')};
}
function runJSON(args,signal,spawnProcess=spawn) {
  if(signal?.aborted) return Promise.reject(new Error('Music request cancelled'));
  const python=path.join(root,'.venv',process.platform==='win32'?'Scripts/python.exe':'bin/python');
  return new Promise((resolve,reject)=>{
    const child=spawnProcess(python,args,{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe']});
    let stdout='',stderr='',done=false;
    const finish=(error,value)=>{if(done)return;done=true;clearTimeout(timer);signal?.removeEventListener('abort',cancel);error?reject(error):resolve(value);};
    const cancel=()=>{child.kill();finish(new Error('Music request cancelled'));};
    const timer=setTimeout(()=>{child.kill();finish(new Error('Song search timed out. Try again with the song and artist.'));},60000);
    signal?.addEventListener('abort',cancel,{once:true});
    child.stdout.on('data',chunk=>{stdout+=chunk;if(stdout.length>8*1024*1024){child.kill();finish(new Error('Song search response was too large.'));}});
    child.stderr.on('data',chunk=>{stderr=(stderr+chunk).slice(-4000);});
    child.on('error',()=>finish(new Error('Could not launch song search. Run UPDATE-MUSIC.cmd first.')));
    child.on('close',code=>{
      if(done)return;
      if(code!==0) {
        const missing=/No module named yt_dlp/.test(stderr);
        finish(new Error(missing?'Run UPDATE-MUSIC.cmd to install song search.':'YouTube search/stream unavailable. Try a different song or run UPDATE-MUSIC.cmd. Sign-in or restricted results are not supported.'));
        return;
      }
      try{finish(null,stdout);}catch(e){finish(e);}
    });
  });
}
async function resolve(query,signal,spawnProcess=spawn) {
  return parseResult(await runJSON(searchArgs(query),signal,spawnProcess));
}
async function resolveId(id,signal,spawnProcess=spawn) {
  if(!/^[A-Za-z0-9_-]{11}$/.test(id)) throw new Error('Invalid autoplay video identifier.');
  const args=searchArgs('music');args[args.length-1]=`https://www.youtube.com/watch?v=${id}`;
  return parseResult(await runJSON(args,signal,spawnProcess));
}
function chooseCandidate(result,seen=[]) {
  return (result.entries || []).find(x=>x && /^[A-Za-z0-9_-]{11}$/.test(x.id) &&
    !seen.includes(x.id) && !x.is_live && x.live_status!=='is_live') || null;
}
async function recommend(last,seen,signal,spawnProcess=spawn) {
  const query=`${last.artist || last.query || last.name} music`.slice(0,200);
  const args=searchArgs(query);args.splice(args.indexOf('-f'),2);args.splice(args.indexOf('--'),0,'--flat-playlist');
  args[args.length-1]=`ytsearch8:${query}`;
  const result=JSON.parse(await runJSON(args,signal,spawnProcess));
  const candidate=chooseCandidate(result,seen);
  return candidate ? {kind:'web',id:candidate.id,query:candidate.title || query,
    name:candidate.title || 'Autoplay song',artist:last.artist,automatic:true} : null;
}
function openStream(track,spawnProcess=spawn) {
  const args=['-nostdin','-hide_banner','-loglevel','error','-rw_timeout','15000000',
    '-reconnect','1','-reconnect_streamed','1','-reconnect_delay_max','5'];
  if(track.userAgent) args.push('-user_agent',track.userAgent);
  args.push('-i',track.url,'-vn','-f','s16le','-ar','48000','-ac','2','pipe:1');
  const proc=spawnProcess('ffmpeg',args,{windowsHide:true,stdio:['ignore','pipe','ignore']});
  // These errors are consumed by the Discord audio-resource pipeline.
  proc.on('error',()=>proc.stdout.destroy(new Error('FFmpeg could not start.')));
  proc.on('close',code=>{if(code && !proc.killed) proc.stdout.destroy(new Error('Online stream ended unexpectedly.'));});
  return {stream:proc.stdout,stop:()=>{proc.stdout.destroy();proc.kill();}};
}
module.exports={resolve,resolveId,recommend,chooseCandidate,openStream,searchArgs,parseResult};
