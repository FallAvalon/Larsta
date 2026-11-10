import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RouterClient, routerError } from '../server/openrouter.js';

const encoder=new TextEncoder();
const frame=(value:unknown)=>`data: ${typeof value==='string'?value:JSON.stringify(value)}\n\n`;
test('catalog retries temporary connection errors and server failures',async()=>{
  let calls=0;
  const router=new RouterClient(async()=>{
    calls++;
    if(calls===1)throw Object.assign(new TypeError('private network details'),{cause:{code:'ECONNRESET'}});
    if(calls===2)return new Response(null,{status:503});
    return Response.json({data:[{id:'fixture/story',pricing:{prompt:'0',completion:'0'}}]});
  });
  const models=await router.models();assert.equal(calls,3);assert.equal(models[0].id,'fixture/story');
  await router.models();assert.equal(calls,3,'successful result should be cached');
});

test('catalog reports a safe diagnostic and does not retry permanent errors',async()=>{
  let calls=0;
  const denied=new RouterClient(async()=>{calls++;return new Response('private provider details',{status:403});});
  await assert.rejects(()=>denied.models(true),error=>error instanceof Error&&error.message.includes('HTTP_403')&&!error.message.includes('private provider details'));
  assert.equal(calls,1);
  const broken=new RouterClient(async()=>{throw Object.assign(new TypeError('secret raw details'),{cause:{code:'ECONNRESET'}});});
  await assert.rejects(()=>broken.models(true),error=>error instanceof Error&&error.message.includes('ECONNRESET')&&!error.message.includes('secret raw details'));
});
test('terminal SSE markers finish and release a connection even when the provider leaves it open',async()=>{
  for(const terminal of ['[DONE]',{choices:[{delta:{},finish_reason:'stop'}]}]) {
    let timer:ReturnType<typeof setTimeout>,cancelled=false;
    const response=new Response(new ReadableStream<Uint8Array>({
      start(controller){
        controller.enqueue(encoder.encode(frame({choices:[{delta:{content:'Ответ'},finish_reason:null}]})));
        controller.enqueue(encoder.encode(frame(terminal)));
        timer=setTimeout(()=>controller.error(new Error('The completed connection was left waiting')),1000);
      },cancel(){cancelled=true;clearTimeout(timer);}
    }),{headers:{'Content-Type':'text/event-stream'}});
    const router=new RouterClient(async()=>response);let content='';
    await router.stream('unused',{},new AbortController().signal,delta=>content+=delta);
    assert.equal(content,'Ответ');assert(cancelled);
  }
});

test('HTTP 200 JSON errors are decoded and metadata cannot expose credentials',async()=>{
  const secret='sk-or-v1-not-a-real-key-0123456789';
  const router=new RouterClient(async()=>Response.json({error:{code:529,message:'Provider overloaded',metadata:{error_type:secret,provider_code:'Bearer '+secret}}}));
  await assert.rejects(()=>router.stream('unused',{},new AbortController().signal,()=>{}),error=>{
    assert(error instanceof Error);assert(error.message.includes('перегружен'));assert(!error.message.includes(secret));return true;
  });
  const html=new RouterClient(async()=>new Response('<html>secret raw provider page</html>',{headers:{'Content-Type':'text/html'}}));
  await assert.rejects(()=>html.stream('unused',{},new AbortController().signal,()=>{}),error=>{
    assert(error instanceof Error);assert(error.message.includes('не в формате потока'));assert(!error.message.includes('secret raw'));return true;
  });
});

test('malformed SSE and interrupted sockets produce actionable errors after retaining received text',async()=>{
  const malformed=new RouterClient(async()=>new Response(frame(null),{headers:{'Content-Type':'text/event-stream'}}));
  await assert.rejects(()=>malformed.stream('unused',{},new AbortController().signal,()=>{}),/некорректный поток/);
  let step=0,content='';
  const broken=new RouterClient(async()=>new Response(new ReadableStream<Uint8Array>({pull(controller){
    if(step++===0)controller.enqueue(encoder.encode(frame({choices:[{delta:{content:'Сохранённый фрагмент'}}]})));
    else controller.error(Object.assign(new Error('secret raw socket message'),{code:'ECONNRESET'}));
  }}),{headers:{'Content-Type':'text/event-stream'}}));
  await assert.rejects(()=>broken.stream('unused',{},new AbortController().signal,delta=>content+=delta),error=>{
    assert(error instanceof Error);assert(error.message.includes('ECONNRESET'));assert(!error.message.includes('secret raw'));return true;
  });
  assert.equal(content,'Сохранённый фрагмент');
});

test('reasoning formats do not duplicate text and catalog numeric limits remain usable',async()=>{
  const router=new RouterClient(async(input)=>String(input).endsWith('/models')?
    Response.json({data:[{id:'sample',context_length:'32768',top_provider:{max_completion_tokens:'4096'},supported_parameters:['reasoning']}]}) :
    new Response([
      frame({choices:[{delta:{reasoning:'Один',reasoning_details:[{text:'Один'}]}}]}),
      frame({choices:[{delta:{reasoning_details:[{type:'reasoning.text',text:' два'},{type:'reasoning.encrypted',data:'opaque'}]}}]}),
      frame({choices:[{delta:{content:'Ответ'},finish_reason:'stop'}]})
    ].join(''),{headers:{'Content-Type':'text/event-stream'}}));
  const [model]=await router.models();assert.equal(model.context_length,32768);assert.equal(model.top_provider?.max_completion_tokens,4096);
  let reasoning='';await router.stream('unused',{},new AbortController().signal,()=>{},delta=>reasoning+=delta);assert.equal(reasoning,'Один два');
  const retry=routerError(429,new Date(Date.now()+30000).toUTCString());assert.match(retry.message,/Повторите через \d+ с\./);
});
