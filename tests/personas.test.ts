import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../server/app.js';
import { RouterClient } from '../server/openrouter.js';
import { defaults } from '../server/domain.js';
import type { Card, Chat, Persona } from '../shared/types.js';

const card=JSON.parse(readFileSync('examples/character-v2.json','utf8')) as Card;
const fields={name:'Test Reader',appearance:'Blue coat, silver pin',personality:'Спокойный',description:'Любит лес'};
async function fixture() {
  const dir=mkdtempSync(path.join(os.tmpdir(),'larsta-personas-')),calls:any[]=[];
  const router=new RouterClient(async(url,options)=>{
    if(String(url).endsWith('/models'))return Response.json({data:['main:free','aux:free'].map(id=>({id,name:id,context_length:32768,pricing:{prompt:'0',completion:'0'},supported_parameters:['max_tokens','temperature','reasoning']}))});
    const body=JSON.parse(String(options?.body));calls.push(body);
    return new Response(new ReadableStream<Uint8Array>({async start(controller){
      const emit=(value:unknown)=>controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(value)}\n\n`));
      emit({choices:[{delta:{content:'*Я подхожу ближе.*'},finish_reason:null}]});
      emit({choices:[{delta:{},finish_reason:'stop'}]});controller.close();
    }}),{headers:{'Content-Type':'text/event-stream'}});
  });
  let runtime=createApp({dataDir:dir,router}),server=runtime.app.listen(0,'127.0.0.1');
  await new Promise<void>(r=>server.once('listening',r));
  let address=server.address();assert(address&&typeof address!=='string');let base=`http://127.0.0.1:${address.port}`,cookie='';
  const auth=await fetch(base+'/api/auth',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:runtime.secrets.connectionCode})});cookie=auth.headers.get('set-cookie')!.split(';')[0];
  async function call(endpoint:string,method='GET',body?:unknown,signal?:AbortSignal){return fetch(base+'/api'+endpoint,{method,signal,headers:{Cookie:cookie,...(body instanceof FormData?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:body instanceof FormData?body:JSON.stringify(body)})});}
  runtime.store.saveSettings({...defaults,mainModel:'main:free',auxiliaryModel:'aux:free'});runtime.secrets.setKey('test-not-a-real-key');
  const character=runtime.store.saveCharacter({...card,data:{...card.data,first_mes:'Привет, {{user}}.'}},'');
  async function restart(){server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));runtime.store.close();runtime=createApp({dataDir:dir,router});server=runtime.app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));address=server.address();assert(address&&typeof address!=='string');base=`http://127.0.0.1:${address.port}`;}
  return {call,calls,character,restart,get store(){return runtime.store;},get active(){return runtime.active;},async close(){for(const c of runtime.active.values())c.abort('disconnect');server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));runtime.store.close();rmSync(dir,{recursive:true,force:true});}};
}
test('personas CRUD, safe avatar uploads, default and independent chat snapshots survive restart',async()=>{
  const f=await fixture();try{
    const initial=await (await f.call('/personas')).json() as Persona[];assert.equal(initial.length,1);
    assert.equal((await f.call('/personas','POST',{name:' '})).status,400);
    const p=await (await f.call('/personas','POST',fields)).json() as Persona;
    const image=new FormData();image.append('avatar',new Blob([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lZkAAAAASUVORK5CYII=','base64')],{type:'image/png'}),'avatar.png');
    const uploaded=await (await f.call(`/personas/${p.id}/avatar`,'POST',image)).json() as Persona;assert.match(uploaded.avatar!,/^\/uploads\//);
    const invalid=new FormData();invalid.append('avatar',new Blob(['<svg/>'],{type:'image/svg+xml'}),'bad.svg');assert.equal((await f.call(`/personas/${p.id}/avatar`,'POST',invalid)).status,400);
    const avatar=await f.call(uploaded.avatar!.replace('/uploads/','/../uploads/'));assert.equal(avatar.status,200);
    assert.equal((await f.call(`/personas/${p.id}/default`,'POST',{})).status,200);
    const a=await (await f.call('/chats','POST',{characterId:f.character.id})).json() as Chat;
    const b=await (await f.call('/chats','POST',{characterId:f.character.id,personaId:p.id})).json() as Chat;
    assert.equal(a.persona?.name,'Test Reader');assert.equal(a.persona?.avatar,uploaded.avatar);assert.equal(f.store.messages(a.id)[0].content,'Привет, Test Reader.');
    await f.call(`/personas/${p.id}`,'PUT',{...fields,name:'Другая роль'});
    assert.equal(f.store.chat(a.id).persona?.name,'Test Reader');assert.equal(f.store.chat(b.id).persona?.name,'Test Reader');
    const edited=await (await f.call(`/chats/${a.id}/persona`,'PUT',{...fields,name:'Test Reader в будущем',appearance:'Blue coat, gold pin'})).json() as Chat;
    assert.equal(edited.persona?.name,'Test Reader в будущем');assert.equal(f.store.chat(b.id).persona?.appearance,fields.appearance);
    await f.call(`/personas/${p.id}`,'DELETE');assert.equal(f.store.chat(a.id).persona?.name,'Test Reader в будущем');
    assert.equal((await f.call(`/personas/${initial[0].id}`,'DELETE')).status,400);
    await f.restart();assert.equal(f.store.chat(a.id).persona?.appearance,'Blue coat, gold pin');assert.equal(f.store.messages(a.id)[0].content,'Привет, Test Reader.');
  }finally{await f.close();}
});
test('main generation uses the independent persona of the current chat',async()=>{
  const f=await fixture();try{
    const p=await (await f.call('/personas','POST',fields)).json() as Persona;
    const chat=await (await f.call('/chats','POST',{characterId:f.character.id,personaId:p.id})).json() as Chat;
    const last=f.store.addMessage(chat.id,'user','Привет.');
    const generated=await f.call(`/chats/${chat.id}/generate`,'POST',{expectedLastId:last.id});await generated.text();
    assert.equal(f.calls.length,1);assert.equal(f.calls[0].model,'main:free');assert.match(f.calls[0].messages[0].content,/Test Reader/);assert.match(f.calls[0].messages[0].content,/silver pin/);
    assert.equal(f.store.messages(chat.id).at(-1)?.role,'assistant');
  }finally{await f.close();}
});
test('removed draft assistant returns 404 without invoking a model or changing messages',async()=>{
  const f=await fixture();try{
    const chat=f.store.createChat(f.character.id),before=f.store.messages(chat.id),updated=f.store.chat(chat.id).updatedAt;
    for(const action of ['continue','describe','rephrase','reactions']){
      const response=await f.call(`/chats/${chat.id}/assist`,'POST',{action,draft:'Мой черновик',expectedLastId:before.at(-1)!.id});assert.equal(response.status,404);
    }
    assert.equal(f.calls.length,0);assert.deepEqual(f.store.messages(chat.id),before);assert.equal(f.store.chat(chat.id).updatedAt,updated);assert.equal(f.store.settings().auxiliaryModel,'aux:free');assert.equal(f.active.size,0);
  }finally{await f.close();}
});
