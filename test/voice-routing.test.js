const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {activatedRequest,parseMusicCommand}=require('../src/util');
test('natural play requests keep the song query and avoid ordinary chat',()=>{
 for(const request of ['play My Song by Artist','can you play My Song by Artist','could you please play My Song by Artist','play, My Song by Artist','put on My Song by Artist','queue My Song by Artist']) {
  assert.deepEqual(parseMusicCommand(request),{action:'play',query:'My Song by Artist'});
 }
 assert.deepEqual(parseMusicCommand('can you play'),{action:'play',query:''});
 assert.equal(parseMusicCommand('How do I play guitar?'),null);
});
test('spoken polite play is queued online without calling the chat model',async()=>{
 const source=fs.readFileSync(path.join(__dirname,'../src/index.js'),'utf8');
 let searches=0;
 const context=vm.createContext({AbortController,activatedRequest,parseMusicCommand,
  valid:()=>true,alive:()=>true,pcmToWav:x=>x,
  localAI:{transcribe:async()=>({text:'Playboy, could you please play My Song by Artist?'})},
  webMusic:{searchArgs:q=>{assert.equal(q,'My Song by Artist');searches++;}},
  notice:async()=>{},next:()=>{},answer:()=>{assert.fail('Music must not reach chat');},report:()=>{assert.fail('Unexpected voice error');}
 });
 vm.runInContext(source.slice(source.indexOf('async function voiceTurn'),source.indexOf('function capture')),context);
 const s={voiceStatus:new Map(),queue:[],music:{},histories:new Map()};
 await context.voiceTurn(s,'1',Buffer.alloc(70000));
 assert.equal(searches,1);assert.equal(s.queue[0].kind,'web');
 assert.equal(s.queue[0].query,'My Song by Artist');
});
