const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const vm=require('node:vm');
const autoplay=require('../src/autoplay');
const {parseMusicCommand}=require('../src/util');
test('spoken skipping and autoplay controls',()=>{
  assert.deepEqual(parseMusicCommand('skip this song'),{action:'skip'});
  assert.deepEqual(parseMusicCommand('next song'),{action:'skip'});
  assert.deepEqual(parseMusicCommand('auto play off'),{action:'autoplay',enabled:false});
  assert.deepEqual(parseMusicCommand('turn autoplay on'),{action:'autoplay',enabled:true});
});
test('local autoplay avoids repeats and obeys stop and off',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'bot-auto-'));
  try {
    for(const name of ['one.mp3','two.mp3']) await fs.writeFile(path.join(root,name),'');
    const s={autoplay:true};autoplay.remember(s,{path:path.join(root,'one.mp3')});
    assert.equal((await autoplay.select(s,root)).name,'two.mp3');
    s.autoplayStopped=true;assert.equal(await autoplay.select(s,root),null);
    s.autoplayStopped=false;s.autoplay=false;assert.equal(await autoplay.select(s,root),null);
    for(let i=0;i<40;i++)autoplay.remember(s,{kind:'web',id:String(i)});
    assert.equal(s.recent.length,30);
  } finally {await fs.rm(root,{recursive:true,force:true});}
});
test('queue advances on idle, skip advances, and stop suppresses autoplay',async()=>{
  const source=await fs.readFile(path.join(__dirname,'../src/index.js'),'utf8');
  let selected=0;
  const context=vm.createContext({AbortController,setImmediate,musicRoot:'unused',
    alive:s=>!s.closed,notice:async()=>{},report:()=>{},
    autoplay:{remember:autoplay.remember,select:async s=>{
      if(s.autoplayStopped || !s.autoplay)return null;
      selected++;return {path:'automatic.mp3',name:'Automatic'};
    }},createAudioResource:p=>({path:p,volume:{setVolume(){}}})});
  vm.runInContext(source.slice(source.indexOf('function releaseMusic'),source.indexOf('function close')),context);
  const s={queue:[{path:'one.mp3'},{path:'two.mp3'}],autoplay:true,volume:0.4};
  let active=false;
  s.music={play:r=>{active=true;s.played=r.path;},pause(){},stop(){
    if(!active)return false;active=false;void context.next(s);return true;
  }};
  await context.next(s);assert.equal(s.played,'one.mp3');assert.equal(selected,0);
  context.haltMusic(s,false);assert.equal(s.played,'two.mp3');assert.equal(selected,0);
  active=false;await context.next(s);assert.equal(s.played,'automatic.mp3');
  context.haltMusic(s,true);await new Promise(setImmediate);
  assert.equal(s.current,null);assert.equal(s.queue.length,0);assert.equal(selected,1);
});
