import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createApp } from '../server/app.js';
import { OpenAIClient, normalizeModels } from '../server/provider-client.js';
import { normalizeBaseUrl } from '../server/providers.js';
import { Secrets } from '../server/secrets.js';
import { Store } from '../server/store.js';
import { defaults } from '../server/domain.js';
import { providerPresets, isFreeModel } from '../shared/providers.js';
import type { Provider, ProviderKind, Model } from '../shared/types.js';
import { translate } from '../shared/translations.js';
import { listBackups, verifyBackup } from '../server/backups.js';

const card=JSON.parse(readFileSync('examples/character-v2.json','utf8'));
const frame=(value:unknown)=>'data: '+JSON.stringify(value)+'\n\n';
type Call={url:string;headers:Headers;body:any};
async function fixture(){
  const dir=mkdtempSync(path.join(tmpdir(),'larsta-providers-')),calls:Call[]=[];
  const catalogs=new Map<string,unknown[]>(),catalogStatus=new Map<string,number>(),status=new Map<string,number>(),hold=new Set<string>();
  let catalogCalls=0;
  const fetcher:typeof fetch=async(input,options)=>{
    const url=new URL(String(input)),headers=new Headers(options?.headers);
    assert.equal(options?.redirect,'error','credentials must never follow a redirect');
    if(url.pathname.endsWith('/models')){catalogCalls++;const code=catalogStatus.get(url.origin);if(code)return Response.json({error:{message:'fixture private error'}},{status:code});return Response.json({data:catalogs.get(url.origin)??[{id:'same/model:tag',name:url.hostname,context_length:16384,supported_parameters:['temperature','max_tokens']}]});}
    if(url.pathname.endsWith('/key'))return Response.json({}, {status:headers.get('Authorization')?.includes('invalid')?401:200});
    assert(url.pathname.endsWith('/chat/completions'));
    const body=JSON.parse(String(options?.body));calls.push({url:String(input),headers,body});
    if(hold.has(url.origin))return new Response(new ReadableStream<Uint8Array>({start(controller){controller.enqueue(new TextEncoder().encode(frame({choices:[{delta:{content:'fixture partial'}}]})));options?.signal?.addEventListener('abort',()=>controller.error(new DOMException('Aborted','AbortError')),{once:true});}}),{headers:{'Content-Type':'text/event-stream'}});
    if(status.has(url.origin))return Response.json({error:{message:'echo '+headers.get('Authorization')+' private prompt',metadata:{provider_code:'fixture-private-token'}}},{status:status.get(url.origin)});
    return new Response(frame({choices:[{delta:{reasoning_content:'fixture thought'}}]})+frame({choices:[{delta:{content:'fixture response from '+url.hostname},finish_reason:'stop'}]}),{headers:{'Content-Type':'text/event-stream'}});
  };
  let runtime=createApp({dataDir:dir,fetcher}),server=runtime.app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));
  let address=server.address();assert(address&&typeof address!=='string');let base='http://127.0.0.1:'+address.port+'/api';
  const auth=await fetch(base+'/auth',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:runtime.secrets.connectionCode})}),cookie=auth.headers.get('set-cookie')!.split(';')[0];
  const call=(endpoint:string,method='GET',body?:unknown,language='ru')=>fetch(base+endpoint,{method,headers:{Cookie:cookie,'Content-Type':'application/json','Accept-Language':language},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const character=runtime.store.saveCharacter(card,''),chat=runtime.store.createChat(character.id);
  async function add(kind:ProviderKind='custom',suffix='a',key?:string):Promise<Provider>{const result=await call('/providers','POST',{...providerPresets[kind],name:'Fixture '+suffix,baseUrl:'https://'+suffix+'.fixture.invalid/api/v1',auth:key?'bearer':'none',...(key?{apiKey:key}:{})});assert.equal(result.status,201);return result.json();}
  async function generate(id=chat.id){const user=runtime.store.addMessage(id,'user','fixture private prompt');return call('/chats/'+id+'/generate','POST',{expectedLastId:user.id});}
  async function restart(){server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));runtime.store.close();runtime=createApp({dataDir:dir,fetcher});server=runtime.app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));address=server.address();assert(address&&typeof address!=='string');base='http://127.0.0.1:'+address.port+'/api';}
  return {dir,calls,call,add,generate,restart,chat,character,catalogs,catalogStatus,status,hold,get catalogCalls(){return catalogCalls;},get runtime(){return runtime;},async close(){for(const c of runtime.active.values())c.abort('user');server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));runtime.store.close();rmSync(dir,{recursive:true,force:true});}};
}

test('all provider presets route the exact model and isolate credentials and OpenRouter extensions',async()=>{
  const f=await fixture();try{
    for(const kind of Object.keys(providerPresets) as ProviderKind[]){
      const p=await f.add(kind,kind,'fixture-key-'+kind);
      assert.equal((await f.call('/chats/'+f.chat.id+'/generation','PUT',{generation:{providerId:p.id,mainModel:'same/model:tag'}})).status,200);
      const response=await f.generate();assert.equal(response.status,200);assert.match(await response.text(),/fixture response/);
      const request=f.calls.at(-1)!;assert.equal(request.url,p.baseUrl+'/chat/completions');assert.equal(request.headers.get('Authorization'),'Bearer fixture-key-'+kind);assert.equal(request.body.model,'same/model:tag');
      assert.equal(request.headers.has('X-Title'),kind==='openrouter');assert.equal('provider' in request.body,kind==='openrouter');
      const answer=f.runtime.store.messages(f.chat.id).at(-1)!;assert.equal(answer.providerId,p.id);assert.equal(answer.providerName,p.name);
    }
    const keys=f.runtime.store.db.prepare('SELECT value FROM providers').all();assert(!JSON.stringify(keys).includes('fixture-key-'));
    assert(!JSON.stringify(await (await f.call('/providers')).json()).includes('fixture-key-'));
    assert(!JSON.stringify(await (await f.call('/settings')).json()).includes('fixture-key-'));
  }finally{await f.close();}
});

test('multiple OpenRouter accounts and key rotation use independent catalogs',async()=>{
  const f=await fixture();try{
    const a=await f.add('openrouter','account-a','fixture-key-a'),b=await f.add('openrouter','account-b','fixture-key-b');
    for(const p of [a,b])assert.equal((await f.call('/models?providerId='+p.id)).status,200);
    const n=f.catalogCalls;await f.call('/models?providerId='+a.id);assert.equal(f.catalogCalls,n);
    const edited=await (await f.call('/providers/'+a.id,'PUT',{...a,apiKey:'fixture-key-rotated'})).json();
    assert.equal(edited.revision,a.revision+1);assert.equal((await f.call('/providers/'+a.id,'PUT',{...a,name:'Stale'})).status,409);
    await f.call('/models?providerId='+a.id);assert.equal(f.catalogCalls,n+1);await f.call('/models?providerId='+b.id);assert.equal(f.catalogCalls,n+1);
    assert.equal(f.runtime.secrets.key(a.id,a.baseUrl),'fixture-key-rotated');assert.equal(f.runtime.secrets.key(b.id,b.baseUrl),'fixture-key-b');
  }finally{await f.close();}
});

test('cached model bounds survive saving a selection; metadata and models do not cross providers',async()=>{
  const f=await fixture();try{
    const a=await f.add('custom','small'),b=await f.add('custom','large');
    f.catalogs.set(new URL(a.baseUrl).origin,[{id:'same/model:tag',context_length:8192,top_provider:{max_completion_tokens:128},supported_parameters:['max_tokens']}]);
    f.catalogs.set(new URL(b.baseUrl).origin,[{id:'same/model:tag',context_length:65536,supported_parameters:['temperature','max_tokens']}]);
    await f.call('/models?providerId='+a.id);await f.call('/models?providerId='+b.id);
    const result=await f.call('/settings','PUT',{...defaults,providerId:a.id,mainModel:'same/model:tag',maxTokens:2048});assert.equal(result.status,200);
    const n=f.catalogCalls;await (await f.generate()).text();assert.equal(f.catalogCalls,n);assert.equal(f.calls.at(-1)!.body.max_tokens,128);assert(!('temperature' in f.calls.at(-1)!.body));
    const other=f.runtime.store.createChat(f.character.id);await f.call('/chats/'+other.id+'/generation','PUT',{generation:{providerId:b.id,mainModel:'same/model:tag'}});await (await f.generate(other.id)).text();assert.equal(f.calls.at(-1)!.body.max_tokens,2048);assert.equal(f.calls.at(-1)!.body.temperature,defaults.temperature);
  }finally{await f.close();}
});

test('manual IDs work without a catalog and connection tests never generate or alter stories',async()=>{
  const f=await fixture();try{
    const p=await f.add('custom','manual');f.catalogStatus.set(new URL(p.baseUrl).origin,404);
    const before=f.runtime.store.messages(f.chat.id),probe=await f.call('/providers/test','POST',p);assert.equal(probe.status,200);assert.equal((await probe.json()).catalog,'unavailable');assert.equal(f.calls.length,0);
    const live=await f.call('/providers/test','POST',{...p,generation:true,model:'manual/id:exact'});assert.equal(live.status,200);assert.match((await live.json()).text,/fixture response/);assert.equal(f.calls.at(-1)!.body.model,'manual/id:exact');assert.equal(f.calls.at(-1)!.body.max_tokens,32);assert.deepEqual(f.runtime.store.messages(f.chat.id),before);
    await f.call('/chats/'+f.chat.id+'/generation','PUT',{generation:{providerId:p.id,mainModel:'not/in/catalog'}});const n=f.catalogCalls;const response=await f.generate();assert.equal(response.status,200);await response.text();assert.equal(f.catalogCalls,n);assert.equal(f.calls.at(-1)!.body.model,'not/in/catalog');
  }finally{await f.close();}
});

test('provider 401 keeps the Larsta session and never exposes upstream keys or prompt echoes',async()=>{
  const f=await fixture();try{
    const p=await f.add('custom','denied','fixture-private-key');f.status.set(new URL(p.baseUrl).origin,401);
    await f.call('/chats/'+f.chat.id+'/generation','PUT',{generation:{providerId:p.id,mainModel:'manual'}});
    const response=await f.generate();const text=await response.text(),errorEvent=text.split('\n\n').find(frame=>frame.startsWith('event: error'))!;assert(errorEvent);assert(!text.includes('fixture-private-key'));assert(!errorEvent.includes('fixture private prompt'));assert.match(errorEvent,/не принял API-ключ/);
    assert.equal((await f.call('/auth')).status,200);assert.equal(f.runtime.store.messages(f.chat.id).at(-1)!.role,'user');
    const probe=await f.call('/providers/test','POST',{...p,generation:true,model:'manual'},'en');assert.equal(probe.status,502);const error=await probe.json();assert.equal(error.code,'PROVIDER_AUTH');assert.equal(error.upstreamStatus,401);assert(!/[а-яё]/i.test(error.error));
  }finally{await f.close();}
});

test('compatibility settings control token naming, temperature and reasoning without changing model ID',async()=>{
  const f=await fixture();try{
    let p=await f.add();p=await (await f.call('/providers/'+p.id,'PUT',{...p,compatibility:{tokenLimit:'max_completion_tokens',temperature:false,reasoning:'reasoning_effort'}})).json();
    await f.call('/settings','PUT',{...defaults,providerId:p.id,mainModel:'strict/model',reasoningEffort:'low'});await (await f.generate()).text();
    const body=f.calls.at(-1)!.body;assert.equal(body.model,'strict/model');assert.equal(body.max_completion_tokens,1024);assert(!('max_tokens' in body));assert(!('temperature' in body));assert(!('reasoning' in body));assert.equal(body.reasoning_effort,'low');assert(!f.calls.at(-1)!.headers.has('Authorization'));
  }finally{await f.close();}
});

test('deletion requires explicit reassignment and does not remove historical messages or resurrect accounts',async()=>{
  const f=await fixture();try{
    const p=await f.add();await f.call('/chats/'+f.chat.id+'/generation','PUT',{generation:{providerId:p.id,mainModel:'same/model:tag'}});await (await f.generate()).text();
    assert.equal((await f.call('/providers/'+p.id+'?revision='+p.revision,'DELETE')).status,409);
    await f.call('/chats/'+f.chat.id+'/generation','PUT',{generation:{}});
    const messages=f.runtime.store.messages(f.chat.id);assert.equal((await f.call('/providers/'+p.id+'?revision='+p.revision,'DELETE')).status,200);
    await f.restart();assert.deepEqual(f.runtime.store.messages(f.chat.id),messages);assert(!f.runtime.store.providers().some(v=>v.id===p.id));
    assert.equal((await f.call('/providers/openrouter?revision=1','DELETE')).status,409);
  }finally{await f.close();}
});

test('endpoint changes require explicit credentials; failed database commits restore keys',async()=>{
  const f=await fixture();try{
    const p=await f.add('custom','origin','fixture-origin-key'),changed={...p,baseUrl:'https://other.fixture.invalid/v1'};
    assert.equal((await f.call('/providers/'+p.id,'PUT',changed)).status,400);assert.equal(f.runtime.secrets.key(p.id,changed.baseUrl),'');
    const transaction=f.runtime.store.transaction.bind(f.runtime.store);
    f.runtime.store.transaction=(fn)=>transaction(()=>{fn();throw Error('fixture commit failure');});
    assert.equal((await f.call('/providers/'+p.id,'PUT',{...changed,apiKey:'fixture-replacement-key'})).status,500);
    f.runtime.store.transaction=transaction;assert.equal(f.runtime.secrets.key(p.id,p.baseUrl),'fixture-origin-key');assert.equal(f.runtime.secrets.key(p.id,changed.baseUrl),'');assert.equal(f.runtime.store.provider(p.id).baseUrl,p.baseUrl);
    const updated=await (await f.call('/providers/'+p.id,'PUT',{...changed,clearApiKey:true})).json();assert.equal(updated.hasApiKey,false);
  }finally{await f.close();}
});

test('active provider edits are locked while another chat can generate with independent settings',async()=>{
  const f=await fixture();try{
    const a=await f.add('custom','holding','fixture-holding-key'),b=await f.add('custom','independent');f.hold.add(new URL(a.baseUrl).origin);
    await f.call('/chats/'+f.chat.id+'/generation','PUT',{generation:{providerId:a.id,mainModel:'fixture/pinned-a'}});
    const stream=await f.generate();assert(f.runtime.active.has(f.chat.id));
    assert.equal((await f.call('/providers/'+a.id,'PUT',{...a,apiKey:'fixture-rotated-key'})).status,409);
    const other=f.runtime.store.createChat(f.character.id);await f.call('/settings','PUT',{...defaults,providerId:b.id,mainModel:'fixture/pinned-b'});await (await f.generate(other.id)).text();assert.equal(f.calls.at(-1)!.body.model,'fixture/pinned-b');assert(f.runtime.active.has(f.chat.id));
    await f.call('/chats/'+f.chat.id+'/stop','POST',{});await stream.text();const answer=f.runtime.store.messages(f.chat.id).at(-1)!;assert.equal(answer.content,'fixture partial');assert.equal(answer.providerId,a.id);assert.equal(answer.model,'fixture/pinned-a');assert.equal(answer.status,'stopped');
  }finally{await f.close();}
});

test('secrets migrate exactly once and environment keys stay bound to the original OpenRouter origin',()=>{
  const dir=mkdtempSync(path.join(tmpdir(),'larsta-secret-migration-')),previous=process.env.OPENROUTER_API_KEY;
  try{
    writeFileSync(path.join(dir,'server-secrets.json'),JSON.stringify({connectionCode:'12345678',apiKey:'fixture-old-secret'}));
    const secrets=new Secrets(dir);assert.equal(secrets.connectionCode,'12345678');assert.equal(secrets.apiKey,previous||'fixture-old-secret');assert(!('apiKey' in JSON.parse(readFileSync(path.join(dir,'server-secrets.json'),'utf8'))));
    process.env.OPENROUTER_API_KEY='fixture-environment-secret';assert.equal(secrets.key('openrouter','https://openrouter.ai/api/v1'),'fixture-environment-secret');assert.equal(secrets.key('another-openrouter','https://openrouter.ai/api/v1'),'');assert.equal(secrets.key('openrouter','https://other.fixture.invalid/v1'),'');
    delete process.env.OPENROUTER_API_KEY;secrets.setKey('');assert.equal(new Secrets(dir).apiKey,'');
  }finally{if(previous===undefined)delete process.env.OPENROUTER_API_KEY;else process.env.OPENROUTER_API_KEY=previous;rmSync(dir,{recursive:true,force:true});}
});

test('version 6 migration preserves every old table value, sessions and avatars; verified backup precedes changes',()=>{
  const dir=mkdtempSync(path.join(tmpdir(),'larsta-v6-provider-migration-'));let store:Store|undefined;
  try{
    store=new Store(dir);store.saveSettings({...defaults,mainModel:'fixture/legacy',auxiliaryModel:'fixture/unused'});const c=store.saveCharacter(card,'fixture summary'),chat=store.createChat(c.id);store.addMessage(chat.id,'user','fixture history');store.addMessage(chat.id,'assistant','fixture response','complete','fixture/legacy');
    store.db.prepare('UPDATE chats SET generation=? WHERE id=?').run(JSON.stringify({mainModel:'fixture/pinned',temperature:0.3}),chat.id);store.db.prepare('INSERT INTO sessions VALUES(?,?)').run(createHash('sha256').update('fixture-session').digest('hex'),Date.now()+86400000);
    mkdirSync(path.join(dir,'uploads'));writeFileSync(path.join(dir,'uploads','fixture-avatar.png'),Buffer.from([1,2,3]));
    store.db.exec("UPDATE settings SET value=json_remove(value,'$.providerId'); DROP TABLE providers; ALTER TABLE messages DROP COLUMN provider_id; ALTER TABLE messages DROP COLUMN provider_name; ALTER TABLE message_variants DROP COLUMN provider_id; ALTER TABLE message_variants DROP COLUMN provider_name; PRAGMA user_version=6;");store.close();store=undefined;
    const old=new DatabaseSync(path.join(dir,'larsta.sqlite'),{readOnly:true}),tables=old.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all() as {name:string}[];
    const before=tables.map(({name})=>({name,columns:old.prepare('PRAGMA table_info('+name+')').all().map(v=>String(v.name)),rows:old.prepare('SELECT * FROM '+name+' ORDER BY rowid').all()}));old.close();
    store=new Store(dir);assert.equal((store.db.prepare('PRAGMA user_version').get() as {user_version:number}).user_version,7);assert.equal(store.provider('openrouter').lastModel,'fixture/legacy');assert.equal(store.chat(chat.id).generation?.providerId,'openrouter');
    for(const table of before){if(table.name==='settings'||table.name==='chats')continue;const columns=table.columns.map(c=>'"'+c+'"').join(',');assert.deepEqual(store.db.prepare('SELECT '+columns+' FROM '+table.name+' ORDER BY rowid').all(),table.rows);}
    assert.equal(store.settings().auxiliaryModel,'fixture/unused');assert.equal(store.chat(chat.id).generation?.mainModel,'fixture/pinned');assert.equal(store.messages(chat.id).at(-1)?.providerId,'openrouter');assert.deepEqual(readFileSync(path.join(dir,'uploads','fixture-avatar.png')),Buffer.from([1,2,3]));
    const backup=listBackups(dir).find(b=>b.reason==='before-migration')!;assert.equal(backup.schemaVersion,6);verifyBackup(dir,backup.id);assert(!backup.files.some(f=>f.name.includes('secret')));
    const messages=store.messages(chat.id);store.close();store=new Store(dir);assert.deepEqual(store.messages(chat.id),messages);assert.equal(store.providers().length,1);
  }finally{store?.close();rmSync(dir,{recursive:true,force:true});}
});

test('model normalization distinguishes unknown parameters and pricing, currencies and non-chat types',()=>{
  const provider={...providerPresets.polza,id:'fixture-polza',revision:1,lastModel:''};
  const [polza]=normalizeModels([{id:'fixture/model',top_provider:{pricing:{currency:'RUB',prompt_per_million:'15.5',completion_per_million:'62'},supported_parameters:['temperature']},context_length:'32768'}],provider);
  assert.equal(polza.pricing.currency,'RUB');assert.equal(Number(polza.pricing.prompt)*1e6,15.5);assert.equal(polza.context_length,32768);assert(polza.parametersKnown);
  const [generic]=normalizeModels([{id:'plain'},{id:'embedding',type:'embedding'},{id:'image',architecture:{output_modalities:['image']}},{id:'plain'}]);assert.equal(generic.parametersKnown,false);assert(!isFreeModel(generic));assert.equal(normalizeModels([{id:'same'},{id:'same'}]).length,1);
  const [zero]=normalizeModels([{id:'free',pricing:{prompt:'0',completion:'0'}}]);assert(isFreeModel(zero));
  const [unknownRequest]=normalizeModels([{id:'unknown',top_provider:{pricing:{prompt_per_million:0,completion_per_million:0,request_per_thousand:{}}}}],provider);assert(!isFreeModel(unknownRequest));
});

test('base URLs preserve arbitrary prefixes and forbid embedded credentials or full endpoints',()=>{
  assert.equal(normalizeBaseUrl('http://localhost:1234/v1/'),'http://localhost:1234/v1');assert.equal(normalizeBaseUrl('https://fixture.invalid/custom/api'),'https://fixture.invalid/custom/api');
  for(const url of ['file:///private','https://user:secret@fixture.invalid/v1','https://fixture.invalid/v1?key=private','https://fixture.invalid/v1#private','https://fixture.invalid/v1/models','https://fixture.invalid/v1/chat/completions'])assert.throws(()=>normalizeBaseUrl(url));
});

test('compatible JSON completions and fragmented UTF-8 SSE preserve exact text and cancel readers',async()=>{
  const p={...providerPresets.custom,id:'fixture',revision:1,lastModel:''};let text='';
  await new OpenAIClient(async()=>Response.json({choices:[{message:{content:'fixture JSON'}}]}),'https://fixture.invalid/v1',p).stream('',{model:'same'},new AbortController().signal,delta=>text+=delta);assert.equal(text,'fixture JSON');
  const bytes=new TextEncoder().encode(frame({choices:[{delta:{content:'Привет 👋'},finish_reason:'stop'}]}));let cancelled=false;text='';
  const response=new Response(new ReadableStream({start(c){for(const b of bytes)c.enqueue(new Uint8Array([b]));},cancel(){cancelled=true;}}),{headers:{'Content-Type':'text/event-stream'}});
  await new OpenAIClient(async()=>response,'https://fixture.invalid/v1',p).stream('',{},new AbortController().signal,delta=>text+=delta);assert.equal(text,'Привет 👋');assert(cancelled);
});

test('new provider labels and dynamic errors translate without altering user content',()=>{
  for(const label of ['Провайдеры','Проверить генерацию','API-ключ · Bearer','Провайдер не принял API-ключ. Обновите ключ подключения. HTTP_401.','Не удалось загрузить каталог провайдера. Проверьте адрес или введите ID модели вручную. Код сбоя: HTTP_404.'])assert(!/[а-яё]/i.test(translate(label,'en')));
  assert.equal(translate('Моделей в каталоге: {0}','en',{0:12}),'Models in catalog: 12');
});
