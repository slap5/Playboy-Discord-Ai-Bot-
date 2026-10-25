const path=require('node:path');
const fs=require('node:fs');
const {spawn}=require('node:child_process');
const {randomBytes}=require('node:crypto');
const root=path.resolve(__dirname,'..');
process.chdir(root);
require('dotenv').config({path:path.join(root,'.env')});
const {loopback}=require('../src/local-ai');
const children=new Set();
let stopping=false;
function stop(code=0) {
  if(stopping) return;stopping=true;
  for(const child of children) child.kill();
  process.exitCode=code;
}
function child(file,args) {
  const proc=spawn(file,args,{cwd:root,env:process.env,stdio:'inherit',windowsHide:true});
  children.add(proc);
  proc.on('error',e=>{console.error(`Could not launch ${path.basename(file)}: ${e.message}`);stop(1);});
  proc.on('exit',code=>{children.delete(proc);if(!stopping) {console.error(`A bot component exited (${code}). Stopping remaining components.`);stop(code || 1);}});
  return proc;
}
for(const event of ['SIGINT','SIGTERM']) process.on(event,()=>stop(0));
async function main() {
  for(const key of ['DISCORD_TOKEN','DISCORD_GUILD_ID']) if(!process.env[key]) throw new Error(`Set ${key} in .env first.`);
  const python=path.join(root,'.venv',process.platform==='win32'?'Scripts/python.exe':'bin/python');
  if(!fs.existsSync(python)) throw new Error('Run SETUP-WINDOWS.cmd first (Python environment missing).');
  const ollama=loopback(process.env.OLLAMA_URL || 'http://127.0.0.1:11434');
  let res;
  try {res=await fetch(ollama+'/api/tags',{signal:AbortSignal.timeout(5000)});}
  catch {throw new Error('Open the Ollama application, then start the bot again.');}
  if(!res.ok) throw new Error('Ollama is not responding correctly. Restart Ollama.');
  const model=process.env.OLLAMA_MODEL || 'qwen3:4b-instruct';
  const tags=await res.json();
  if(!tags.models?.some(x=>x.name===model || x.model===model)) throw new Error(`Download the configured model first: ollama pull ${model}`);
  process.env.LOCAL_AUDIO_TOKEN=randomBytes(32).toString('hex');
  child(python,['-u',path.join(__dirname,'voice_service.py')]);
  const deadline=Date.now()+180000;
  while(Date.now()<deadline && !stopping) {
    try {
      const health=await fetch(`http://127.0.0.1:${process.env.LOCAL_AUDIO_PORT || 8765}/health`,{
        headers:{'X-Local-Token':process.env.LOCAL_AUDIO_TOKEN},signal:AbortSignal.timeout(2000)});
      if(health.ok) {
        console.log('Local speech ready. Starting Discord bot. Ctrl+C stops both.');
        child(process.execPath,[path.join(root,'src','index.js')]);return;
      }
    } catch {}
    await new Promise(resolve=>setTimeout(resolve,500));
  }
  if(!stopping) throw new Error('Speech startup timed out. Run setup again and inspect the error above.');
}
main().catch(e=>{console.error(e.message);stop(1);});
