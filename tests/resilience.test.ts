import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync, mkdirSync, copyFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createApp } from '../server/app.js';
import { RouterClient } from '../server/openrouter.js';
import { defaults } from '../server/domain.js';
import { Store } from '../server/store.js';
import { createBackup, verifyBackup, restoreBackup } from '../server/backups.js';
import { lockDataDirectory } from '../server/data-lock.js';

const card=JSON.parse(readFileSync('examples/character-v2.json','utf8'));
const pause=(ms=5)=>new Promise(resolve=>setTimeout(resolve,ms));
async function waitFor(check:()=>boolean){for(let i=0;i<100&&!check();i++)await pause();assert(check(),'condition timed out');}
function events(text:string){return text.split('\n\n').filter(frame=>frame.startsWith('event:')).map(frame=>({event:frame.split('\n')[0].slice(7),value:JSON.parse(frame.split('\ndata: ')[1])}));}

async function fixture(){
  const dir=mkdtempSync(path.join(tmpdir(),'larsta-resilience-'));
  let calls=0,emit=(text:string)=>{},finish=()=>{};
  const router=new RouterClient(async(url,options)=>{
    if(String(url).endsWith('/models'))return Response.json({data:[{id:'test/local',name:'Fixture',context_length:32000,pricing:{prompt:'0',completion:'0'},supported_parameters:['max_tokens']}]});
    calls++;
    return new Response(new ReadableStream({start(controller){
      const chunk=(value:unknown)=>controller.enqueue(new TextEncoder().encode('data: '+JSON.stringify(value)+'\n\n'));
      emit=text=>chunk({choices:[{delta:{content:text}}]});
      finish=()=>{chunk({choices:[{delta:{},finish_reason:'stop'}]});controller.close();};
      options?.signal?.addEventListener('abort',()=>controller.error(new DOMException('Aborted','AbortError')),{once:true});
    }}),{headers:{'Content-Type':'text/event-stream'}});
  });
  const runtime=createApp({dataDir:dir,router});
  runtime.secrets.setKey('fixture-only');runtime.store.saveSettings({...defaults,mainModel:'test/local'});
  const character=runtime.store.saveCharacter({...card,data:{...card.data,first_mes:'Привет.'}},'');
  const chat=runtime.store.createChat(character.id);
  const server=runtime.app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));
  const base='http://127.0.0.1:'+((server.address() as {port:number}).port);
  const auth=await fetch(base+'/api/auth',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:runtime.secrets.connectionCode})});
  const cookie=auth.headers.get('set-cookie')!.split(';')[0];
  const call=(route:string,method='GET',body?:unknown,signal?:AbortSignal)=>fetch(base+'/api'+route,{method,headers:{Cookie:cookie,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal});
  return {dir,runtime,chat,character,call,get calls(){return calls;},emit:(text:string)=>emit(text),finish:()=>finish(),async close(){
    for(const controller of runtime.active.values())controller.abort('user');
    await waitFor(()=>runtime.active.size===0);server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));runtime.store.close();rmSync(dir,{recursive:true,force:true});
  }};
}

test('a disconnected phone can reattach to the same generation; retries never start another provider request',async()=>{
  const f=await fixture();try{
    const message=await (await f.call('/chats/'+f.chat.id+'/messages','POST',{content:'Продолжим',requestId:'message-request-1'})).json();
    const body={expectedLastId:message.id,requestId:'generation-request-1'};
    const disconnected=new AbortController();
    const response=await f.call('/chats/'+f.chat.id+'/generate?limit=50','POST',body,disconnected.signal);
    const reader=response.body!.getReader();await reader.read();await waitFor(()=>f.calls===1);
    f.emit('Начало. ');await waitFor(()=>f.runtime.store.messages(f.chat.id).at(-1)?.content==='Начало. ');
    disconnected.abort();await reader.cancel().catch(()=>{});await pause(20);
    assert(f.runtime.active.has(f.chat.id),'browser disconnect must not cancel the model');
    const reattached=await f.call('/chats/'+f.chat.id+'/events?limit=50');
    const copy=await f.call('/chats/'+f.chat.id+'/generate?limit=50','POST',body);
    f.emit('Продолжение.');f.finish();
    const received=events(await reattached.text()),duplicate=events(await copy.text());
    assert.equal(received[0].event,'start');assert.equal(received[0].value.content,'Начало. ');
    assert.equal(received.find(event=>event.event==='done')!.value.messages.at(-1).content,'Начало. Продолжение.');
    assert.equal(duplicate.at(-1)!.value.status,'complete');assert.equal(f.calls,1);
    const replay=events(await (await f.call('/chats/'+f.chat.id+'/generate','POST',body)).text());
    assert.equal(replay.at(-1)!.value.status,'complete');assert.equal(f.calls,1);
    assert.equal((await f.call('/chats/'+f.chat.id+'/generate','POST',{...body,wish:'Другой запрос'})).status,409);
  }finally{await f.close();}
});

test('explicit stop still cancels a detached generation and retains the partial answer',async()=>{
  const f=await fixture();try{
    const message=await (await f.call('/chats/'+f.chat.id+'/messages','POST',{content:'Дальше'})).json();
    const controller=new AbortController();const response=await f.call('/chats/'+f.chat.id+'/generate','POST',{expectedLastId:message.id},controller.signal);
    await response.body!.getReader().read();await waitFor(()=>f.calls===1);f.emit('Полученная часть');
    await waitFor(()=>f.runtime.store.messages(f.chat.id).at(-1)?.content==='Полученная часть');controller.abort();
    await f.call('/chats/'+f.chat.id+'/stop','POST',{});await waitFor(()=>f.runtime.active.size===0);
    const last=f.runtime.store.messages(f.chat.id).at(-1)!;assert.equal(last.status,'stopped');assert.equal(last.content,'Полученная часть');
  }finally{await f.close();}
});

test('message request identity survives lost acknowledgements, stale revisions and server restart',async()=>{
  const f=await fixture();let copy:Store|undefined;try{
    const body={content:'Одна реплика',requestId:'stable-message-1',expectedRevision:f.runtime.store.chat(f.chat.id).revision};
    const first=await (await f.call('/chats/'+f.chat.id+'/messages','POST',body)).json();
    const second=await (await f.call('/chats/'+f.chat.id+'/messages','POST',body)).json();
    assert.equal(first.id,second.id);assert.equal(f.runtime.store.messages(f.chat.id).length,2);
    assert.equal((await f.call('/chats/'+f.chat.id+'/messages','POST',{...body,content:'Иная реплика'})).status,409);
    const backup=createBackup(f.dir,f.runtime.store.db);
    const restored=mkdtempSync(path.join(tmpdir(),'larsta-identity-'));
    try{
      copyFileSync(path.join(f.dir,'backups',backup.id,'larsta.sqlite'),path.join(restored,'larsta.sqlite'));
      copy=new Store(restored);
      const fingerprint=createHash('sha256').update(body.content).digest('hex');
      assert.equal(copy.operation(f.chat.id,body.requestId,'message',fingerprint).id,first.id);
      copy.saveOperation(f.chat.id,'unfinished-request','generate','fingerprint',{status:'running'});copy.close();copy=new Store(restored);
      assert.equal(copy.operation(f.chat.id,'unfinished-request','generate','fingerprint').status,'interrupted');
      copy.close();copy=undefined;
    }finally{copy?.close();copy=undefined;rmSync(restored,{recursive:true,force:true});}
  }finally{copy?.close();await f.close();}
});

test('bounded message pages retain ordering, cursor isolation and the full generation history',async()=>{
  const f=await fixture();try{
    for(let i=0;i<125;i++)f.runtime.store.addMessage(f.chat.id,i%2?'assistant':'user','Реплика '+i);
    const last=await (await f.call('/chats/'+f.chat.id+'?limit=50')).json();
    assert.equal(last.messages.length,50);assert.equal(last.messages.at(-1).content,'Реплика 124');assert.equal(last.hasMore,true);
    const older=await (await f.call('/chats/'+f.chat.id+'?limit=50&before='+last.messages[0].id)).json();
    assert.equal(older.messages.length,50);assert.equal(older.hasNewer,true);assert.equal(older.messages.at(-1).content,'Реплика 74');
    const next=await (await f.call('/chats/'+f.chat.id+'?limit=50&after='+older.messages.at(-1).id)).json();
    assert.deepEqual(next.messages.map((m:{id:string})=>m.id),last.messages.map((m:{id:string})=>m.id));
    const anchor=await (await f.call('/chats/'+f.chat.id+'?limit=30&anchor='+older.messages[10].id)).json();assert(anchor.messages.some((m:{id:string})=>m.id===older.messages[10].id));
    const other=f.runtime.store.createChat(f.character.id);
    assert.equal((await f.call('/chats/'+other.id+'?limit=10&before='+last.messages[0].id)).status,404);
    assert.equal((await f.call('/chats/'+f.chat.id+'?limit=101')).status,400);
    assert.equal((await (await f.call('/chats/'+f.chat.id)).json()).messages.length,126);
  }finally{await f.close();}
});

test('server chat search is paginated, case insensitive for Russian and treats wildcard characters literally',async()=>{
  const f=await fixture();try{
    f.runtime.store.db.prepare('UPDATE chats SET title=? WHERE id=?').run('Вечер в БИБЛИОТЕКЕ',f.chat.id);
    for(let i=0;i<24;i++)f.runtime.store.createChat(f.character.id);
    const found=await (await f.call('/chats?limit=10&q='+encodeURIComponent('библиотеке'))).json();assert.equal(found.total,1);
    const literal=await (await f.call('/chats?limit=10&q=%25')).json();assert.equal(literal.total,0);
    const page=await (await f.call('/chats?limit=10&offset=20')).json();assert.equal(page.total,25);assert.equal(page.items.length,5);
  }finally{await f.close();}
});

test('compact character catalog preserves search fields while full detail retains all prompt data',async()=>{
  const f=await fixture();try{
    const data={...card.data,name:'Архивариус',description:'Редкая примета для поиска',scenario:'Сценарий. '.repeat(2000),system_prompt:'Правила персонажа',mes_example:'Пример диалога',extensions:{custom:{kept:true}}};
    const character=f.runtime.store.saveCharacter({...card,data},'Краткое описание');
    const summaries=await (await f.call('/characters?compact=1')).json(),summary=summaries.find((c:{id:string})=>c.id===character.id);
    assert.equal(summary.card.data.description,data.description);assert.equal(summary.card.data.scenario,'');
    const full=await (await f.call('/characters/'+character.id)).json();
    assert.deepEqual(full.card.data,data);assert.equal(JSON.stringify(summaries).includes('Правила персонажа'),false);
    assert.equal((await f.call('/characters/missing-character')).status,404);
  }finally{await f.close();}
});

test('invalid response page limits are rejected before editing or undoing history',async()=>{
  const f=await fixture();try{
    f.runtime.store.addMessage(f.chat.id,'user','Реплика');f.runtime.store.addMessage(f.chat.id,'assistant','Ответ');
    const before=f.runtime.store.messages(f.chat.id),chat=f.runtime.store.chat(f.chat.id),count=f.runtime.store.chats().length;
    const root='/chats/'+f.chat.id,last=before.at(-1)!;
    assert.equal((await f.call(root+'/messages/'+last.id+'?limit=101','PATCH',{content:'Другое',expectedRevision:chat.revision})).status,400);
    assert.equal((await f.call(root+'/undo?limit=0','POST',{expectedLastId:last.id,expectedRevision:chat.revision})).status,400);
    assert.equal((await f.call(root+'/messages/'+last.id+'/variant?limit=abc','POST',{})).status,400);
    assert.deepEqual(f.runtime.store.messages(f.chat.id),before);assert.equal(f.runtime.store.chat(f.chat.id).revision,chat.revision);assert.equal(f.runtime.store.chats().length,count);
  }finally{await f.close();}
});

test('backup snapshots include WAL and images, exclude secrets, verify checksums and restore with a rollback copy',()=>{
  const dir=mkdtempSync(path.join(tmpdir(),'larsta-backup-'));let store:Store|undefined;
  try{
    store=new Store(dir);const character=store.saveCharacter(card,''),chat=store.createChat(character.id);
    store.addMessage(chat.id,'user','До копии');
    // Small binary fixture, never a personal avatar.
    const uploads=path.join(dir,'uploads');mkdirSync(uploads,{recursive:true});writeFileSync(path.join(uploads,'fixture.png'),Buffer.from([1,2,3]));
    writeFileSync(path.join(dir,'server-secrets.json'),'not-in-the-backup');
    const copy=createBackup(dir,store.db);assert.equal(verifyBackup(dir,copy.id).files.length,2);
    assert(!existsSync(path.join(dir,'backups',copy.id,'server-secrets.json')));
    store.addMessage(chat.id,'user','После копии');store.close();store=undefined;
    const rollback=restoreBackup(dir,copy.id);assert(existsSync(path.join(rollback,'larsta.sqlite')));
    store=new Store(dir);assert.equal(store.messages(chat.id).at(-1)!.content,'До копии');assert.equal(readFileSync(path.join(uploads,'fixture.png')).length,3);
    writeFileSync(path.join(dir,'backups',copy.id,'uploads','fixture.png'),'corrupt');assert.throws(()=>verifyBackup(dir,copy.id),/не пройдена/);
  }finally{store?.close();rmSync(dir,{recursive:true,force:true});}
});

test('data directory locking excludes a second server and newer schemas are refused without changes',()=>{
  const dir=mkdtempSync(path.join(tmpdir(),'larsta-lock-'));try{
    const release=lockDataDirectory(dir);assert.throws(()=>lockDataDirectory(dir),/уже используется/);release();lockDataDirectory(dir)();
    const store=new Store(dir);store.db.exec('PRAGMA user_version=99');store.close();
    assert.throws(()=>new Store(dir),/более новой/);
    const db=new DatabaseSync(path.join(dir,'larsta.sqlite'),{readOnly:true});try{assert.equal((db.prepare('PRAGMA user_version').get() as {user_version:number}).user_version,99);}finally{db.close();}
  }finally{rmSync(dir,{recursive:true,force:true});}
});
