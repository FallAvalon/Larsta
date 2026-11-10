import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../server/app.js';
import { RouterClient } from '../server/openrouter.js';
import { defaults } from '../server/domain.js';
import { Store } from '../server/store.js';
import type { Card, Chat, Message } from '../shared/types.js';

const card=JSON.parse(readFileSync('examples/character-v2.json','utf8')) as Card;
async function fixture() {
  const dir=mkdtempSync(path.join(os.tmpdir(),'larsta-chat-tools-')),calls:any[]=[];
  let mode:'ok'|'fail'|'empty'|'partial'|'slow'='ok';
  const router=new RouterClient(async(url,options)=>{
    if(String(url).endsWith('/models'))return Response.json({data:['test/main','test/other'].map(id=>({id,name:id,context_length:32768,pricing:{prompt:'0',completion:'0'},supported_parameters:['temperature','max_tokens']}))});
    calls.push(JSON.parse(String(options?.body)));
    if(mode==='fail')return Response.json({error:{}},{status:503});
    const selected=mode,number=calls.length;
    return new Response(new ReadableStream<Uint8Array>({async start(controller){
      const emit=(value:unknown)=>controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(value)}\n\n`));
      if(selected==='slow')await new Promise(resolve=>setTimeout(resolve,160));
      if(options?.signal?.aborted){controller.error(new DOMException('Aborted','AbortError'));return;}
      if(selected!=='empty')emit({choices:[{delta:{content:` Продолжение ${number}.`},finish_reason:null}]});
      if(selected==='partial'){emit({error:{code:503}});controller.close();return;}
      emit({choices:[{delta:{},finish_reason:'stop'}]});controller.close();
    }}),{headers:{'Content-Type':'text/event-stream'}});
  });
  let runtime=createApp({dataDir:dir,router}),server=runtime.app.listen(0,'127.0.0.1');
  await new Promise<void>(resolve=>server.once('listening',resolve));
  let address=server.address();assert(address&&typeof address!=='string');let base=`http://127.0.0.1:${address.port}`;
  const auth=await fetch(base+'/api/auth',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:runtime.secrets.connectionCode})});
  const cookie=auth.headers.get('set-cookie')!.split(';')[0];
  async function call(endpoint:string,method='GET',body?:unknown){return fetch(base+'/api'+endpoint,{method,headers:{Cookie:cookie,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});}
  runtime.store.saveSettings({...defaults,mainModel:'test/main'});runtime.secrets.setKey('test-key-not-real');
  const character=runtime.store.saveCharacter({...card,data:{...card.data,first_mes:'Привет.'}},'');
  const chat=runtime.store.createChat(character.id);
  async function detail(id=chat.id):Promise<{chat:Chat;messages:Message[]}>{return (await call(`/chats/${id}`)).json();}
  async function generate(kind='reply',extra:Record<string,unknown>={},id=chat.id){const before=await detail(id),last=before.messages.at(-1)!;const response=await call(`/chats/${id}/generate`,'POST',{mode:kind,expectedLastId:last.id,expectedRevision:before.chat.revision,...(kind!=='reply'?{expectedVariantId:last.selectedVariantId??null}:{}),...extra});const text=await response.text();return {response,text};}
  async function say(content='Я отвечаю.',id=chat.id){const before=await detail(id);const response=await call(`/chats/${id}/messages`,'POST',{content,expectedRevision:before.chat.revision});assert.equal(response.status,201);return response.json();}
  async function restart(){server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));runtime.store.close();runtime=createApp({dataDir:dir,router});server=runtime.app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));address=server.address();assert(address&&typeof address!=='string');base=`http://127.0.0.1:${address.port}`;}
  return {dir,call,detail,generate,say,restart,chat,character,calls,setMode:(value:typeof mode)=>{mode=value;},get store(){return runtime.store;},get active(){return runtime.active;},async close(){for(const controller of runtime.active.values())controller.abort('user');server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));runtime.store.close();rmSync(dir,{recursive:true,force:true});}};
}

test('continuation appends to a saved variant, including greetings, and errors retain the original',async()=>{
  const f=await fixture();try{
    const original=await f.detail();
    assert.equal((await f.generate('continue')).response.status,200);
    let detail=await f.detail(),answer=detail.messages.at(-1)!;
    assert.equal(detail.messages.length,1);assert.equal(answer.content,'Привет. Продолжение 1.');assert.equal(answer.variants?.length,2);
    assert.equal(f.calls[0].messages.filter((message:any)=>message.role==='user').length,0);
    assert.equal(f.calls[0].messages.find((message:any)=>message.role==='assistant').content,original.messages[0].content);
    assert.match(f.calls[0].messages.at(-1).content,/only new text/);
    for(const mode of ['fail','empty'] as const){f.setMode(mode);await f.generate('continue');assert.deepEqual((await f.detail()).messages,detail.messages);}
    f.setMode('partial');await f.generate('continue');detail=await f.detail();answer=detail.messages.at(-1)!;
    assert.equal(answer.content,'Привет. Продолжение 1. Продолжение 4.');assert.equal(answer.status,'error');assert.equal(answer.variants?.length,3);
    const variants=await (await f.call(`/chats/${f.chat.id}/messages/${answer.id}/variants`)).json();
    assert.equal(variants[0].content,'Привет.');assert.equal(variants[1].content,'Привет. Продолжение 1.');
    await f.restart();assert.deepEqual((await f.detail()).messages,detail.messages);
  }finally{await f.close();}
});

test('regeneration wishes apply to one request and per-chat settings remain independent across restart',async()=>{
  const f=await fixture();try{
    await f.say();await f.generate();let detail=await f.detail();
    const settings={mainModel:'test/other',maxTokens:2048,temperature:0.4};
    assert.equal((await f.call(`/chats/${f.chat.id}/generation`,'PUT',{generation:settings,expectedRevision:detail.chat.revision})).status,200);
    await f.generate('regenerate',{wish:'Больше диалога и не описывай мои действия'});
    const request=f.calls.at(-1);assert.equal(request.model,'test/other');assert.equal(request.max_tokens,2048);assert.equal(request.temperature,0.4);assert.match(request.messages.at(-1).content,/Больше диалога/);
    detail=await f.detail();assert(!detail.messages.some(message=>message.content.includes('Больше диалога')));
    await f.say('Дальше.');await f.generate();assert(!JSON.stringify(f.calls.at(-1).messages).includes('Больше диалога'));
    const other=f.store.createChat(f.character.id);await f.say('Иная история.',other.id);await f.generate('reply',{},other.id);assert.equal(f.calls.at(-1).model,'test/main');assert.equal(f.store.settings().mainModel,'test/main');
    await f.restart();assert.deepEqual((await f.detail()).chat.generation,settings);
    assert.equal((await f.call(`/chats/${f.chat.id}/generation`,'PUT',{generation:{maxTokens:1}})).status,400);
    assert.equal((await f.call(`/chats/${f.chat.id}/generation`,'PUT',{generation:{hasApiKey:true}})).status,400);
    assert.equal((await f.call(`/chats/${f.chat.id}/generation`,'PUT',{generation:{}})).status,200);
    await f.say();await f.generate();assert.equal(f.calls.at(-1).model,'test/main');
  }finally{await f.close();}
});

test('forks copy selected and unselected variants, settings and persona with independent identities',async()=>{
  const f=await fixture();try{
    await f.say();await f.generate();await f.generate('regenerate');const before=await f.detail(),answer=before.messages.at(-1)!;
    f.store.db.prepare('UPDATE chats SET generation=? WHERE id=?').run(JSON.stringify({maxTokens:2048}),f.chat.id);
    await f.say('Это продолжение останется только в исходном чате.');
    const source=await f.detail();
    const response=await f.call(`/chats/${f.chat.id}/fork`,'POST',{messageId:answer.id,expectedRevision:source.chat.revision});assert.equal(response.status,201);
    const branch=await response.json() as Chat,copy=await f.detail(branch.id);
    assert.equal(copy.messages.length,before.messages.length);assert.deepEqual(copy.chat.persona,source.chat.persona);assert.deepEqual(copy.chat.generation,{maxTokens:2048});assert.equal(copy.chat.branchGroupId,f.chat.id);
    assert.deepEqual(copy.messages.map(message=>message.content),before.messages.map(message=>message.content));assert.notEqual(copy.messages.at(-1)!.id,answer.id);assert.equal(copy.messages.at(-1)!.variants?.length,2);
    const copied=copy.messages.at(-1)!;assert(copied.variants?.some(variant=>variant.id===copied.selectedVariantId));assert(!answer.variants?.some(variant=>variant.id===copied.selectedVariantId));
    const previews=await (await f.call(`/chats/${branch.id}/messages/${copied.id}/variants`)).json();assert.equal(previews.length,2);
    assert.equal((await f.call(`/chats/${branch.id}/messages/${answer.id}/variants`)).status,404);
    const groups=await (await f.call(`/chats/${branch.id}/branches`)).json();assert.equal(groups.length,2);
    await f.restart();assert.deepEqual((await f.detail(branch.id)).messages,copy.messages);assert.deepEqual((await f.detail()).messages,source.messages);
  }finally{await f.close();}
});

test('older regeneration and variant selection preserve descendants atomically in discoverable branches',async()=>{
  const f=await fixture();try{
    await f.say();await f.generate();const old=(await f.detail()).messages.at(-1)!;
    await f.say('Продолжение');await f.generate();let original=await f.detail();
    f.setMode('fail');await f.generate('regenerate',{targetMessageId:old.id,expectedVariantId:null,confirmTruncate:true});
    assert.equal((await (await f.call(`/chats/${f.chat.id}/branches`)).json()).length,1);assert.deepEqual((await f.detail()).messages,original.messages);
    f.setMode('ok');await f.generate('regenerate',{targetMessageId:old.id,expectedVariantId:null,confirmTruncate:true});
    let groups=await (await f.call(`/chats/${f.chat.id}/branches`)).json() as Chat[];assert.equal(groups.length,2);
    let saved=groups.find(chat=>chat.id!==f.chat.id)!;assert.deepEqual((await f.detail(saved.id)).messages.map(message=>message.content),original.messages.map(message=>message.content));
    await f.say('Иное продолжение');await f.generate();original=await f.detail();
    const answer=original.messages.find(message=>message.id===old.id)!;
    const selection=await f.call(`/chats/${f.chat.id}/messages/${old.id}/variant`,'POST',{variantId:answer.variants![0].id,expectedVariantId:answer.selectedVariantId,expectedLastId:original.messages.at(-1)!.id,expectedRevision:original.chat.revision,confirmTruncate:true});assert.equal(selection.status,200);
    groups=await (await f.call(`/chats/${f.chat.id}/branches`)).json();assert.equal(groups.length,3);
    saved=groups.find(chat=>chat.id!==f.chat.id&&chat.id!==saved.id)!;assert.deepEqual((await f.detail(saved.id)).messages.map(message=>message.content),original.messages.map(message=>message.content));
    assert.equal((await f.detail()).messages.at(-1)!.content,old.content);
  }finally{await f.close();}
});

test('undo restores the last user turn to a draft, retains all variants in backup, and rejects stale requests',async()=>{
  const f=await fixture();try{
    await f.say('Вернуть эту реплику');await f.generate();await f.generate('continue');const original=await f.detail();
    const request={expectedRevision:original.chat.revision,expectedLastId:original.messages.at(-1)!.id};
    const response=await f.call(`/chats/${f.chat.id}/undo`,'POST',request);assert.equal(response.status,200);const result=await response.json();
    assert.equal(result.draft,'Вернуть эту реплику');assert.equal(result.messages.length,1);assert.equal(result.messages[0].content,'Привет.');
    const saved=await f.detail(result.backup.id);assert.equal(saved.messages.at(-1)!.variants?.length,2);assert.deepEqual(saved.messages.map(message=>message.content),original.messages.map(message=>message.content));
    assert.equal((await f.call(`/chats/${f.chat.id}/undo`,'POST',request)).status,409);
    assert.equal((await f.call(`/chats/${f.chat.id}/messages`,'POST',{content:'Устаревшая отправка',expectedRevision:original.chat.revision})).status,409);
    const current=await f.detail();assert.equal((await f.call(`/chats/${f.chat.id}/undo`,'POST',{expectedLastId:current.messages[0].id,expectedRevision:current.chat.revision})).status,400);
    await f.restart();assert.deepEqual((await f.detail(result.backup.id)).messages,saved.messages);
  }finally{await f.close();}
});

test('edits preserve the previous chat and generation locks protect all new mutations',async()=>{
  const f=await fixture();try{
    await f.say();await f.generate();const before=await f.detail(),user=before.messages.find(message=>message.role==='user')!;
    assert.equal((await f.call(`/chats/${f.chat.id}/messages/${user.id}`,'PATCH',{content:'Другая реплика',confirmTruncate:true,expectedRevision:before.chat.revision})).status,200);
    const groups=await (await f.call(`/chats/${f.chat.id}/branches`)).json() as Chat[];
    assert.deepEqual((await f.detail(groups.find(chat=>chat.id!==f.chat.id)!.id)).messages.map(message=>message.content),before.messages.map(message=>message.content));
    f.setMode('slow');const pending=f.generate();
    for(let i=0;i<30&&!f.active.size;i++)await new Promise(resolve=>setTimeout(resolve,5));assert(f.active.size);
    for(const [endpoint,method,body] of [['generation','PUT',{generation:{}}],['fork','POST',{}],['undo','POST',{}]] as const){assert.equal((await f.call(`/chats/${f.chat.id}/${endpoint}`,method,body)).status,409);}
    await pending;
    const count=f.calls.length;assert.equal((await f.generate('regenerate',{wish:'x'.repeat(1201)})).response.status,400);assert.equal(f.calls.length,count);
  }finally{await f.close();}
});

test('version 4 migrates without altering messages, personas, selected variants or paired sessions',()=>{
  const dir=mkdtempSync(path.join(os.tmpdir(),'larsta-v4-'));let store:Store|undefined;
  try{
    store=new Store(dir);const character=store.saveCharacter(card,''),chat=store.createChat(character.id),user=store.addMessage(chat.id,'user','Существующая реплика'),answer=store.addMessage(chat.id,'assistant','Первый ответ');
    store.transaction(()=>store!.beginVariant(answer,'Выбранный ответ','test/main','variant-id','Размышление'));store.updateMessage(answer.id,'Выбранный ответ','complete','Размышление');
    store.db.prepare('INSERT INTO sessions VALUES(?,?)').run('session-hash',Date.now()+60_000);
    const messages=store.messages(chat.id),persona=store.chat(chat.id).persona;
    store.db.exec('ALTER TABLE chats DROP COLUMN generation; ALTER TABLE chats DROP COLUMN branch_group; ALTER TABLE chats DROP COLUMN revision; PRAGMA user_version=4;');store.close();
    store=new Store(dir);assert.deepEqual(store.messages(chat.id),messages);assert.deepEqual(store.chat(chat.id).persona,persona);assert.deepEqual(store.chat(chat.id).generation,{});assert.equal(store.chat(chat.id).revision,0);assert(store.db.prepare('SELECT 1 FROM sessions WHERE hash=?').get('session-hash'));assert.equal(store.messages(chat.id).find(message=>message.id===user.id)?.content,'Существующая реплика');
    store.close();store=new Store(dir);assert.deepEqual(store.messages(chat.id),messages);
  }finally{store?.close();rmSync(dir,{recursive:true,force:true});}
});
