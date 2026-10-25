const {test}=require('node:test');
const assert=require('node:assert/strict');
const {chat,transcribe,speech,loopback}=require('../src/local-ai');
test('chat sends a bounded, non-thinking request only to local Ollama',async()=>{
 const result=await chat({messages:[{role:'user',content:'hello'}],max_completion_tokens:180},undefined,async(url,opts)=>{
  assert.equal(new URL(url).hostname,'127.0.0.1');assert.equal(new URL(url).pathname,'/api/chat');
  const b=JSON.parse(opts.body);assert.equal(b.stream,false);assert.equal(b.think,false);
  assert.equal(b.options.num_ctx,4096);assert.equal(b.options.num_predict,180);
  return Response.json({message:{content:'Hello.'}});
 });assert.equal(result,'Hello.');
});
test('audio calls carry local authentication and preserve WAV responses',async()=>{
 process.env.LOCAL_AUDIO_TOKEN='test-only-token';
 const fake=async(url,opts)=>{
  assert.equal(opts.headers['X-Local-Token'],'test-only-token');
  if(url.endsWith('/transcribe')) {assert.equal(opts.headers['Content-Type'],'audio/wav');return Response.json({text:'play my song'});}
  assert.equal(JSON.parse(opts.body).text,'Hello');return new Response(Buffer.from('RIFF'));
 };
 assert.equal((await transcribe(Buffer.alloc(44),undefined,fake)).text,'play my song');
 assert.equal((await speech('Hello',undefined,fake)).toString(),'RIFF');
 delete process.env.LOCAL_AUDIO_TOKEN;
});
test('remote endpoints, empty completions, and server errors fail clearly',async()=>{
 assert.throws(()=>loopback('https://example.com'),/loopback/);
 await assert.rejects(chat({messages:[]},undefined,async()=>Response.json({message:{content:''}})),/no final answer/);
 await assert.rejects(speech('hi',undefined,async()=>new Response('busy',{status:503})),/HTTP 503/);
});
test('cancellation is passed to the local transport',async()=>{
 const abort=new AbortController();abort.abort();
 await assert.rejects(chat({messages:[]},abort.signal,async(url,options)=>{
  assert.equal(options.signal.aborted,true);throw abort.signal.reason;
 }),{name:'AbortError'});
});
