const {Buffer}=require('node:buffer');
function loopback(value) {
  const url=new URL(value);
  if(url.protocol!=='http:' || !['localhost','127.0.0.1','[::1]'].includes(url.hostname)) {
    throw new Error('Local AI must use an HTTP loopback address.');
  }
  return url.origin;
}
async function request(base,route,body,type,signal,fetcher=fetch) {
  const timeout=Number(process.env.LOCAL_AI_TIMEOUT_MS || 180000);
  const combined=AbortSignal.any([AbortSignal.timeout(timeout),...(signal?[signal]:[])]);
  let response;
  try {
    response=await fetcher(loopback(base)+route,{method:'POST',headers:{'Content-Type':type,
      ...(route.startsWith('/audio/')?{'X-Local-Token':process.env.LOCAL_AUDIO_TOKEN || ''}:{})},body,signal:combined});
  } catch(e) {
    if(signal?.aborted) throw e;
    throw new Error(`Local AI connection failed (${route}). Start with npm start; check Ollama and the audio-service window. ${e.name}`);
  }
  if(!response.ok) {
    const error=new Error(`Local AI ${route}: HTTP ${response.status}. ${(await response.text()).slice(0,400)}`);
    error.status=response.status;throw error;
  }
  return response;
}
function audioBase(){return `http://127.0.0.1:${process.env.LOCAL_AUDIO_PORT || '8765'}`;}
async function chat(requestBody,signal,fetcher=fetch) {
  const model=process.env.OLLAMA_MODEL || 'qwen3:4b-instruct';
  if(model.includes('cloud')) throw new Error('Choose a downloaded local Ollama model, not a cloud model.');
  const response=await request(process.env.OLLAMA_URL || 'http://127.0.0.1:11434','/api/chat',JSON.stringify({
    model,messages:requestBody.messages,stream:false,think:false,keep_alive:'10m',
    options:{num_ctx:Number(process.env.OLLAMA_CONTEXT || 4096),num_predict:requestBody.max_completion_tokens || 180,temperature:0.7}
  }),'application/json',signal,fetcher);
  const result=await response.json();
  const text=result.message?.content?.trim();
  if(!text) throw new Error(`Ollama returned no final answer (reason=${result.done_reason || 'unknown'}). Try a shorter question.`);
  return text;
}
async function transcribe(wav,signal,fetcher=fetch) {
  const response=await request(audioBase(),'/audio/transcribe',wav,'audio/wav',signal,fetcher);
  return response.json();
}
async function speech(text,signal,fetcher=fetch) {
  const response=await request(audioBase(),'/audio/speech',JSON.stringify({text}),'application/json',signal,fetcher);
  return Buffer.from(await response.arrayBuffer());
}
module.exports={chat,transcribe,speech,loopback};
