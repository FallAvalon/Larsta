import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Server } from 'node:http';
import { request as httpRequest } from 'node:http';
import { createApp } from '../server/app.js';
import { RouterClient } from '../server/openrouter.js';
import { buildContext, estimate } from '../server/context.js';
import { defaults, parseCard } from '../server/domain.js';
import type { Card, Message, Model } from '../shared/types.js';

const card = JSON.parse(readFileSync(path.resolve('examples/character-v2.json'),'utf8')) as Card;
const model:Model={id:'test/free:free',name:'Test model',context_length:16384,pricing:{prompt:'0',completion:'0'},supported_parameters:['temperature','max_tokens']};
type Scenario = 'ok'|'rate'|'unavailable'|'network'|'mid-error'|'truncated'|'slow'|'empty'|'reason-only';
function fakeRouter() {
  let scenario:Scenario='ok'; const calls:{body:any;key:string;headers:Headers}[]=[];
  const fetcher:typeof fetch=async(input,options)=>{
    if(String(input).endsWith('/models'))return Response.json({data:[model,{...model,id:'test/other:free',context_length:32768}]});
    calls.push({body:JSON.parse(String(options?.body)),key:String((options?.headers as Record<string,string>).Authorization),headers:new Headers(options?.headers)});
    if(scenario==='rate')return Response.json({error:{message:'provider timeout for sk-or-v1-fixture-not-a-real-key-0123456789',metadata:{error_type:'rate_limit_exceeded',provider_code:'idle_timeout'}}},{status:429,headers:{'retry-after':'30'}});
    if(scenario==='unavailable')return Response.json({error:{}},{status:503});
    if(scenario==='network')throw new TypeError('secret raw error');
    const selected=scenario;
    const stream=new ReadableStream<Uint8Array>({ async start(controller){
      const put=(s:string)=>controller.enqueue(new TextEncoder().encode(s));
      put(': OPENROUTER PROCESSING\r\n\r\n');
      if(selected==='empty'){put('data: [DONE]\n\n');controller.close();return;}
      const thought=`Сверяю факты перед ответом (вариант ${calls.length}).`;
      put(`data: ${JSON.stringify({choices:[{delta:{reasoning:thought},finish_reason:null}]})}\n\n`);
      if(selected==='reason-only'){put('data: {"choices":[{"delta":{},"finish_reason":"length"}]}\n\n');controller.close();return;}
      const chunks=[`*Sample Guide улыбается (вариант ${calls.length}).* `,'— История продолжается.'];
      for(const s of chunks){
        if(selected==='slow')await new Promise(r=>setTimeout(r,100));
        if(options?.signal?.aborted){controller.error(new DOMException('Aborted','AbortError'));return;}
        const event=`data: ${JSON.stringify({choices:[{delta:{content:s},finish_reason:null}]})}\r\n\r\n`;
        const bytes=new TextEncoder().encode(event);controller.enqueue(bytes.subarray(0,45));controller.enqueue(bytes.subarray(45));
        if(selected==='mid-error'){put('data: {"error":{"code":503},"choices":[]}\n\n');controller.close();return;}
      }
      if(selected!=='truncated')put('data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n');
      controller.close();
    },cancel(){}});
    return new Response(stream,{headers:{'Content-Type':'text/event-stream'}});
  };
  return {router:new RouterClient(fetcher),set:(s:Scenario)=>{scenario=s;},calls};
}
async function listen(server:Server){await new Promise<void>(r=>server.once('listening',r));const address=server.address();assert(address&&typeof address!=='string');return `http://127.0.0.1:${address.port}`;}
async function fixture() {
  const dir=mkdtempSync(path.join(os.tmpdir(),'larsta-test-')),fake=fakeRouter();
  let runtime=createApp({dataDir:dir,router:fake.router}),server=runtime.app.listen(0,'127.0.0.1'),base=await listen(server),cookie='';
  async function call(endpoint:string,method='GET',body?:unknown,headers:Record<string,string>={}){
    return fetch(base+'/api'+endpoint,{method,headers:{...(body instanceof FormData?{}:{'Content-Type':'application/json'}),...(cookie?{Cookie:cookie}:{}),...headers},...(body===undefined?{}:{body:body instanceof FormData?body:JSON.stringify(body)})});
  }
  async function login(){const res=await call('/auth','POST',{code:runtime.secrets.connectionCode});assert.equal(res.status,200);cookie=res.headers.get('set-cookie')!.split(';')[0];}
  async function close(){server.closeAllConnections();await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));runtime.store.close();}
  async function restart(){await close();runtime=createApp({dataDir:dir,router:fake.router});server=runtime.app.listen(0,'127.0.0.1');base=await listen(server);}
  async function configure(){const res=await call('/settings','PUT',{...defaults,mainModel:model.id,auxiliaryModel:'unused/model',apiKey:'test-key-not-real'});assert.equal(res.status,200);}
  async function character(){const res=await call('/characters/import','POST',card);assert.equal(res.status,201);return await res.json();}
  async function chat(characterId:string){return (await call('/chats','POST',{characterId})).json();}
  async function say(id:string,content='Письмо датировано завтрашним днём.'){return (await call(`/chats/${id}/messages`,'POST',{content})).json();}
  const foreignHost = ()=>new Promise<number>((resolve,reject)=>{const req=httpRequest(base+'/api/settings',{headers:{Host:'evil.example',Cookie:cookie}},res=>{res.resume();resolve(res.statusCode||0);});req.on('error',reject);req.end();});
  return {call,login,configure,character,chat,say,fake,restart,foreignHost,get runtime(){return runtime;},async cleanup(){await close();rmSync(dir,{recursive:true,force:true});}};
}
test('device authentication, rate limiting, secrets, CSRF and private uploads',async()=>{
  const f=await fixture();try {
    assert.equal((await f.call('/characters')).status,401);
    assert.equal((await f.call('/settings')).status,401);
    const wrong=await f.call('/auth','POST',{code:'00000000'});assert.equal(wrong.status,401);
    await f.login();await f.configure();
    const response=await f.call('/settings'),text=await response.text();assert(!text.includes('test-key-not-real'));assert(!text.includes('connectionCode'));assert.equal(JSON.parse(text).hasApiKey,true);
    assert.equal((await f.call('/characters/import','POST',card,{Origin:'https://evil.example'})).status,403);
    assert.equal(await f.foreignHost(),403);
    const c=await f.character();const form=new FormData();form.append('avatar',new Blob([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5xkAAAAASUVORK5CYII=','base64')],{type:'image/png'}),'avatar.png');
    const upload=await f.call(`/characters/${c.id}/avatar`,'POST',form);assert.equal(upload.status,200);const uploaded=await upload.json();assert(uploaded.avatar.endsWith('.png'));
    const bad=new FormData();bad.append('avatar',new Blob(['<svg onload="alert(1)"/>'],{type:'image/svg+xml'}),'x.svg');assert.equal((await f.call(`/characters/${c.id}/avatar`,'POST',bad)).status,400);
    for(let i=0;i<5;i++)assert.equal((await f.call('/auth','POST',{code:'00000000'})).status,401);
    assert.equal((await f.call('/auth','POST',{code:'00000000'})).status,429);
  }finally{await f.cleanup();}
});
test('create, update, favorite, import copies, export unknown V2 data, reopen SQLite',async()=>{
  const f=await fixture();try {
    await f.login();
    assert.equal((await f.call('/characters/import','POST',{spec:'bad'})).status,400);
    const original={...structuredClone(card),extra_metadata:{retained:true}};original.data.extensions.foreign={nested:['keep me']};
    const c=await (await f.call('/characters/import','POST',original)).json();
    const copy=await (await f.call('/characters/import','POST',original)).json();assert.notEqual(c.id,copy.id);
    const exported=await (await f.call(`/characters/${c.id}/export`)).json();assert.deepEqual(exported.data.extensions.foreign,{nested:['keep me']});assert.deepEqual(exported.extra_metadata,{retained:true});assert.equal(exported.data.extensions.larsta.summary,c.summary);
    assert.equal((await f.call(`/characters/${c.id}`,'PUT',{card:{...original,data:{...original.data,name:'Sample Guide'}},summary:'Обновлённая карточка'})).status,200);
    await f.call(`/characters/${c.id}/favorite`,'PATCH',{favorite:true});
    const a=await f.chat(c.id),b=await f.chat(c.id);assert.notEqual(a.id,b.id);
    let detail=await (await f.call(`/chats/${a.id}`)).json();assert.equal(detail.messages.length,1);assert.equal(detail.messages[0].role,'assistant');
    await f.say(a.id); await f.configure();
    await f.restart(); // New express app, secrets instance and SQLite connection; session remains valid.
    detail=await (await f.call(`/chats/${a.id}`)).json();assert.equal(detail.messages.length,2);assert.equal(detail.messages[1].content,'Письмо датировано завтрашним днём.');
    const settings=await (await f.call('/settings')).json();assert.equal(settings.mainModel,model.id);assert.equal(settings.auxiliaryModel,'unused/model');assert.equal(settings.hasApiKey,true);
    const all=await (await f.call('/characters')).json();assert.equal(all.find((x:any)=>x.id===c.id).favorite,true);
    const bData=await (await f.call(`/chats/${b.id}`)).json();assert.equal(bData.messages.length,1);
    await f.call(`/characters/${c.id}`,'DELETE');assert.equal((await f.call(`/chats/${a.id}`)).status,404);
  }finally{await f.cleanup();}
});
test('client identity is opt-in, persists across restart and changes headers without changing the roleplay request',async()=>{
  const f=await fixture();try{
    await f.login();await f.configure();
    assert.equal((await (await f.call('/settings')).json()).clientProfile,'larsta');
    const character=await f.character(),chat=await f.chat(character.id),message=await f.say(chat.id);
    await (await f.call(`/chats/${chat.id}/generate`,'POST',{expectedLastId:message.id})).text();
    const original=f.fake.calls.at(-1)!;assert.equal(original.headers.get('X-Title'),'Larsta');assert.equal(original.headers.has('HTTP-Referer'),false);
    const settings=await (await f.call('/settings')).json();
    assert.equal((await f.call('/settings','PUT',{...settings,clientProfile:'unknown'})).status,400);
    assert.equal((await f.call('/settings','PUT',{...settings,clientProfile:'opencode'})).status,200);
    await f.restart();assert.equal((await (await f.call('/settings')).json()).clientProfile,'opencode');
    const reply=f.runtime.store.messages(chat.id).at(-1)!;
    await (await f.call(`/chats/${chat.id}/generate`,'POST',{mode:'regenerate',expectedLastId:reply.id,expectedVariantId:reply.selectedVariantId})).text();
    const compatible=f.fake.calls.at(-1)!;
    assert.equal(compatible.headers.get('HTTP-Referer'),'https://opencode.ai/');assert.equal(compatible.headers.get('X-Title'),'opencode');
    assert.equal(compatible.key,original.key);assert.deepEqual(compatible.body,original.body);
    await f.call('/settings','PUT',{...settings,clientProfile:'larsta'});
    const latest=f.runtime.store.messages(chat.id).at(-1)!;
    await (await f.call(`/chats/${chat.id}/generate`,'POST',{mode:'regenerate',expectedLastId:latest.id,expectedVariantId:latest.selectedVariantId})).text();
    assert.equal(f.fake.calls.at(-1)!.headers.has('HTTP-Referer'),false);assert.equal(f.fake.calls.at(-1)!.headers.get('X-Title'),'Larsta');
  }finally{await f.cleanup();}
});

test('stream response, regenerate, edit confirmation, stop and retained API failures',async()=>{
  const f=await fixture();try {
    await f.login();const c=await f.character(),t=await f.chat(c.id),m=await f.say(t.id);
    const noKey=await f.call(`/chats/${t.id}/generate`,'POST',{expectedLastId:m.id});assert.equal(noKey.status,400);
    let detail=await (await f.call(`/chats/${t.id}`)).json();assert.equal(detail.messages.at(-1).id,m.id);
    await f.configure();
    let response=await f.call(`/chats/${t.id}/generate`,'POST',{expectedLastId:m.id});assert.equal(response.status,200);let stream=await response.text();assert(stream.includes('История продолжается.'));assert(stream.includes('event: reasoning'));assert(stream.includes('event: done'));
    detail=await (await f.call(`/chats/${t.id}`)).json();assert.equal(detail.messages.length,3);const oldAssistant=detail.messages.at(-1);assert.equal(oldAssistant.status,'complete');assert.equal(oldAssistant.reasoning,'Сверяю факты перед ответом (вариант 1).');
    assert.equal(f.fake.calls[0].body.model,model.id);assert.equal(f.fake.calls[0].body.provider.allow_fallbacks,true);assert.equal(f.fake.calls[0].body.temperature,defaults.temperature);assert(!JSON.stringify(f.fake.calls[0].body).includes('unused/model'));
    f.fake.set('rate');response=await f.call(`/chats/${t.id}/generate`,'POST',{mode:'regenerate',expectedLastId:oldAssistant.id});stream=await response.text();assert(stream.includes('лимит'));assert(stream.includes('30'));assert(stream.includes('idle_timeout'));assert(!stream.includes('sk-or-v1-'));
    detail=await (await f.call(`/chats/${t.id}`)).json();assert.equal(detail.messages.at(-1).id,oldAssistant.id); // Failed regeneration keeps previous reply.
    f.fake.set('ok');await (await f.call(`/chats/${t.id}/generate`,'POST',{mode:'regenerate',expectedLastId:oldAssistant.id})).text();detail=await (await f.call(`/chats/${t.id}`)).json();assert.equal(detail.messages.length,3);assert.equal(detail.messages.at(-1).id,oldAssistant.id);assert.equal(detail.messages.at(-1).variants.length,2);
    assert.equal((await f.call(`/chats/${t.id}/messages/${m.id}`,'PATCH',{content:'Изменение'})).status,409);
    const edited=await f.call(`/chats/${t.id}/messages/${m.id}`,'PATCH',{content:'Изменение',confirmTruncate:true});assert.equal(edited.status,200);assert.equal((await edited.json()).length,2);
    for(const scenario of ['mid-error','truncated','network','unavailable','empty'] as Scenario[]){
      f.fake.set(scenario);detail=await (await f.call(`/chats/${t.id}`)).json();const last=detail.messages.at(-1);
      stream=await (await f.call(`/chats/${t.id}/generate`,'POST',{mode:last.role==='assistant'?'regenerate':'reply',expectedLastId:last.id,expectedVariantId:last.selectedVariantId??null})).text();assert(stream.includes('error'));assert(!stream.includes('secret raw error'));detail=await (await f.call(`/chats/${t.id}`)).json();assert.equal(detail.messages.find((x:any)=>x.id===m.id).content,'Изменение');
    }
    // Stop while a provider is streaming; editing/concurrent generation are locked.
    f.fake.set('slow');detail=await (await f.call(`/chats/${t.id}`)).json();const last=detail.messages.at(-1);
    const generating=await f.call(`/chats/${t.id}/generate`,'POST',{mode:last.role==='assistant'?'regenerate':'reply',expectedLastId:last.id,expectedVariantId:last.selectedVariantId??null});const reading=generating.text();
    assert.equal((await f.call(`/chats/${t.id}/messages/${m.id}`,'PATCH',{content:'forbidden',confirmTruncate:true})).status,409);
    await new Promise(r=>setTimeout(r,130));await f.call(`/chats/${t.id}/stop`,'POST',{});await reading;
    detail=await (await f.call(`/chats/${t.id}`)).json();assert.equal(detail.messages.at(-1).status,'stopped');assert(detail.messages.at(-1).content.includes('Sample Guide'));
  }finally{await f.cleanup();}
});
test('bounded context retains instructions, persona and newest user; trims only request',()=>{
  const history:Message[]=Array.from({length:80},(_,i)=>({id:String(i),chatId:'x',role:i%2?'user':'assistant',content:`message ${i} `+'слово '.repeat(40),status:'complete',model:null,createdAt:new Date().toISOString()}));
  const context=buildContext({...defaults,personaName:'Test Reader',personaDescription:'Любит дождь',contextBudget:7000,maxTokens:1024},card,history,model);
    assert(context.omitted>0);assert(context.messages[0].content.includes('Любит дождь'));assert(context.messages[0].content.includes(card.data.personality));assert(context.messages[0].content.includes('Preserve established facts'));assert(context.messages.at(-1)!.content.includes('message 79'));assert.equal(history.length,80);assert(context.messages.reduce((n,m)=>n+estimate(m.content),0)<7000-1024);
  const facts:Message[]=[
    {id:'fact-user',chatId:'fact',role:'user',content:'The test traveler carries 8 copper coins. Remember this inventory.',status:'complete',model:null,createdAt:'2026-10-01T00:00:00Z'},
    {id:'fact-assistant',chatId:'fact',role:'assistant',content:'Noted: the test traveler carries 8 copper coins.',status:'complete',model:'old/model',createdAt:'2026-10-01T00:01:00Z'},
    {id:'fact-latest',chatId:'fact',role:'user',content:'One month later: what is in the test inventory?',status:'complete',model:null,createdAt:'2026-10-02T00:00:00Z'}
  ];
  const switched=buildContext({...defaults,contextBudget:32768,maxTokens:1024},card,facts,{...model,id:'new/model',context_length:32768});
  assert(switched.messages.some(m=>m.content.includes('the test traveler carries 8 copper coins.')));assert.equal(switched.omitted,0);
  assert.throws(()=>buildContext({...defaults,contextBudget:2048,maxTokens:1024},card,history),/бюджет/);
  assert.throws(()=>parseCard({...card,data:{...card.data,name:''}}),/data.name/);
});

test('reasoning-only token exhaustion is explained, saved and can be regenerated',async()=>{
  const f=await fixture();try {
    await f.login();await f.configure();const c=await f.character(),chat=await f.chat(c.id),user=await f.say(chat.id);
    f.fake.set('reason-only');
    const stream=await (await f.call(`/chats/${chat.id}/generate`,'POST',{expectedLastId:user.id})).text();assert(stream.includes('лимит токенов на рассуждение'));
    let detail=await (await f.call(`/chats/${chat.id}`)).json();const empty=detail.messages.at(-1);
    assert.equal(empty.content,'');assert.equal(empty.status,'error');assert(empty.reasoning);assert.equal(detail.generating,false);
    await f.restart();detail=await (await f.call(`/chats/${chat.id}`)).json();assert.equal(detail.messages.at(-1).reasoning,empty.reasoning);
    f.fake.set('ok');await (await f.call(`/chats/${chat.id}/generate`,'POST',{mode:'regenerate',expectedLastId:empty.id,expectedVariantId:null})).text();
    detail=await (await f.call(`/chats/${chat.id}`)).json();assert(detail.messages.at(-1).content);assert.equal(detail.messages.at(-1).variants.length,2);
    const next=await f.say(chat.id,'Продолжим.');await (await f.call(`/chats/${chat.id}/generate`,'POST',{expectedLastId:next.id})).text();
    assert(f.fake.calls.at(-1)!.body.messages.every((m:any)=>m.content.trim().length>0));
  } finally {await f.cleanup();}
});

test('changing the saved model preserves the exact conversation sent for regeneration',async()=>{
  const f=await fixture();try {
    await f.login();await f.configure();const c=await f.character(),chat=await f.chat(c.id);
    const user=await f.say(chat.id,'Test inventory: 8 copper coins. One month later, use this saved inventory.');
    await (await f.call(`/chats/${chat.id}/generate`,'POST',{expectedLastId:user.id})).text();
    const firstRequest=f.fake.calls.at(-1)!.body;
    const before=await (await f.call(`/chats/${chat.id}`)).json(),answer=before.messages.at(-1);
    const settings=await (await f.call('/settings')).json();
    assert.equal((await f.call('/settings','PUT',{...settings,mainModel:'test/other:free'})).status,200);
    await (await f.call(`/chats/${chat.id}/generate`,'POST',{mode:'regenerate',expectedLastId:answer.id,expectedVariantId:null})).text();
    const secondRequest=f.fake.calls.at(-1)!.body;
    assert.equal(secondRequest.model,'test/other:free');assert.deepEqual(secondRequest.messages,firstRequest.messages);
    assert(secondRequest.messages.some((m:any)=>m.content===user.content));
    const after=await (await f.call(`/chats/${chat.id}`)).json();
    assert.equal(after.messages.length,before.messages.length);assert.equal(after.messages.at(-1).variants.length,2);
    assert.equal(after.messages.at(-1).model,'test/other:free');
  } finally {await f.cleanup();}
});

test('regeneration retains selectable variants, selected context and variants survive restart',async()=>{
  const f=await fixture();try {
    await f.login();await f.configure();const c=await f.character(),chat=await f.chat(c.id),user=await f.say(chat.id);
    const endpoint=`/chats/${chat.id}`;
    await (await f.call(`${endpoint}/generate`,'POST',{expectedLastId:user.id})).text();
    let detail=await (await f.call(endpoint)).json();const original=detail.messages.at(-1);
    await (await f.call(`${endpoint}/generate`,'POST',{mode:'regenerate',expectedLastId:original.id,expectedVariantId:null})).text();
    detail=await (await f.call(endpoint)).json();let answer=detail.messages.at(-1);
    assert.equal(answer.id,original.id);assert.equal(answer.variants.length,2);assert.notEqual(answer.content,original.content);assert.equal(answer.reasoning,'Сверяю факты перед ответом (вариант 2).');
    const first=answer.variants[0].id,second=answer.selectedVariantId,newContent=answer.content;
    const choose=async(variantId:string,expectedVariantId:string,expectedLastId=original.id,confirmTruncate=false)=>f.call(`${endpoint}/messages/${original.id}/variant`,'POST',{variantId,expectedVariantId,expectedLastId,confirmTruncate});
    assert.equal((await choose(first,second)).status,200);
    detail=await (await f.call(endpoint)).json();assert.equal(detail.messages.at(-1).content,original.content);assert.equal(detail.messages.at(-1).reasoning,'Сверяю факты перед ответом (вариант 1).');
    assert.equal((await choose(second,second)).status,409); // Another tab has stale selected variant.
    assert.equal((await choose(second,first)).status,200);
    await f.restart();detail=await (await f.call(endpoint)).json();answer=detail.messages.at(-1);
    assert.equal(detail.supportsVariants,true);assert.equal(answer.selectedVariantId,second);assert.equal(answer.variants.length,2);assert.equal(answer.content,newContent);assert.equal(answer.reasoning,'Сверяю факты перед ответом (вариант 2).');
    // Editing affects the selected variant, preserving other alternatives.
    assert.equal((await f.call(`${endpoint}/messages/${answer.id}`,'PATCH',{content:'Исправленный вариант.'})).status,200);
    await choose(first,second);detail=await (await f.call(endpoint)).json();assert.equal(detail.messages.at(-1).content,original.content);
    await choose(second,first);detail=await (await f.call(endpoint)).json();assert.equal(detail.messages.at(-1).content,'Исправленный вариант.');
    const next=await f.say(chat.id,'Продолжим.');
    await (await f.call(`${endpoint}/generate`,'POST',{expectedLastId:next.id})).text();
    assert(f.fake.calls.at(-1)!.body.messages.some((m:any)=>m.role==='assistant'&&m.content==='Исправленный вариант.'));
    assert(!JSON.stringify(f.fake.calls.at(-1)!.body.messages).includes('Сверяю факты перед ответом'));
    assert(!f.fake.calls.at(-1)!.body.messages.some((m:any)=>m.content===original.content));
    detail=await (await f.call(endpoint)).json();const tail=detail.messages.at(-1);
    assert.equal((await choose(first,second,tail.id)).status,409); // No silent loss of following messages.
    assert.equal((await choose(first,second,tail.id,true)).status,200);
    detail=await (await f.call(endpoint)).json();assert.equal(detail.messages.length,3);assert.equal(detail.messages.at(-1).content,original.content);
    assert.equal(detail.messages.at(-1).variants.length,2);
  }finally{await f.cleanup();}
});

test('older regeneration requires confirmation, preserves descendants on error, and deletes them only after first token',async()=>{
  const f=await fixture();try {
    await f.login();await f.configure();const c=await f.character(),chat=await f.chat(c.id),user=await f.say(chat.id);
    const endpoint=`/chats/${chat.id}`;
    await (await f.call(`${endpoint}/generate`,'POST',{expectedLastId:user.id})).text();
    let detail=await (await f.call(endpoint)).json();const original=detail.messages.at(-1);
    const next=await f.say(chat.id,'Другая реплика после ответа.');
    const body={mode:'regenerate',targetMessageId:original.id,expectedLastId:next.id,expectedVariantId:null};
    assert.equal((await f.call(`${endpoint}/generate`,'POST',body)).status,409);
    f.fake.set('rate');await (await f.call(`${endpoint}/generate`,'POST',{...body,confirmTruncate:true})).text();
    detail=await (await f.call(endpoint)).json();assert.equal(detail.messages.at(-1).id,next.id);assert.equal(detail.messages[2].content,original.content);
    f.fake.set('ok');await (await f.call(`${endpoint}/generate`,'POST',{...body,confirmTruncate:true})).text();
    detail=await (await f.call(endpoint)).json();assert.equal(detail.messages.length,3);assert.equal(detail.messages.at(-1).id,original.id);assert.equal(detail.messages.at(-1).variants.length,2);
    const foreign=await f.chat(c.id),foreignUser=await f.say(foreign.id);
    const cross=await f.call(`${endpoint}/messages/${original.id}/variant`,'POST',{variantId:foreignUser.id,expectedVariantId:detail.messages.at(-1).selectedVariantId,expectedLastId:original.id});assert.equal(cross.status,404);
  }finally{await f.cleanup();}
});
