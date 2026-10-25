const {test}=require('node:test');
const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const {PassThrough}=require('node:stream');
const {searchArgs,parseResult,resolve,openStream}=require('../src/web-music');
const {recommend,resolveId}=require('../src/web-music');
test('autoplay excludes history and live results without downloading files',async()=>{
 let child;
 const pending=recommend({artist:'Artist'},['aaaaaaaaaaa'],undefined,(exe,args)=>{
  assert.equal(args.at(-1),'ytsearch8:Artist music');
  assert.ok(args.includes('--flat-playlist'));assert.ok(args.includes('--skip-download'));
  assert.ok(!args.includes('-f'));child=fakeChild();return child;
 });
 child.stdout.write(JSON.stringify({entries:[{id:'aaaaaaaaaaa'},{id:'bbbbbbbbbbb',is_live:true},{id:'ccccccccccc',title:'Next song'}]}));child.emit('close',0);
 assert.equal((await pending).id,'ccccccccccc');
 await assert.rejects(resolveId('https://invalid'),/identifier/);
});
function fakeChild(){const child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();child.kill=()=>{child.killed=true;};return child;}
test('song names are passed as one argument with no file downloads or user configuration',()=>{
 const args=searchArgs('Artist song; $(echo hi)');
 assert.equal(args.at(-1),'ytsearch1:Artist song; $(echo hi)');
 assert.ok(args.includes('--skip-download'));assert.ok(args.includes('--ignore-config'));
 assert.ok(args.includes('--no-cache-dir'));assert.ok(args.includes('--no-plugin-dirs'));
 assert.throws(()=>searchArgs('https://example.com/audio'),/song name/);
});
test('only supported public audio hosts are accepted; live sources rejected',()=>{
 const base={title:'A song',url:'https://rr1.googlevideo.com/videoplayback?x=1'};
 assert.equal(parseResult(JSON.stringify({entries:[base]})).name,'A song');
 assert.throws(()=>parseResult(JSON.stringify({...base,url:'http://127.0.0.1/private'})),/supported/);
 assert.throws(()=>parseResult(JSON.stringify({...base,url:'https://googlevideo.com.evil.test/audio'})),/supported/);
 assert.throws(()=>parseResult(JSON.stringify({...base,is_live:true})),/Live/);
});
test('metadata search resolves and cancellation kills pending work',async()=>{
 let child;
 const spawn=(file,args,opts)=>{assert.notEqual(opts.shell,true);child=fakeChild();return child;};
 const pending=resolve('a song',undefined,spawn);
 child.stdout.write(JSON.stringify({entries:[{title:'Song',url:'https://a.googlevideo.com/audio'}]}));child.emit('close',0);
 assert.equal((await pending).name,'Song');
 const controller=new AbortController();const cancelled=resolve('another song',controller.signal,spawn);
 controller.abort();await assert.rejects(cancelled,/cancelled/);assert.equal(child.killed,true);
});
test('FFmpeg streams PCM to memory and stops its process on cleanup',()=>{
 let args,child;
 const opened=openStream({url:'https://a.googlevideo.com/audio',userAgent:'test'},(exe,argv,opts)=>{
  assert.equal(exe,'ffmpeg');assert.notEqual(opts.shell,true);args=argv;child=fakeChild();return child;
 });
 assert.equal(args.at(-1),'pipe:1');assert.ok(args.includes('s16le'));
 assert.equal(opened.stream,child.stdout);opened.stop();assert.equal(child.killed,true);
});
