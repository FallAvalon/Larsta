import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Provider, ProviderConfig, ProviderProbe, Settings } from '../shared/types.js';
import { AppError } from './domain.js';
import { Store } from './store.js';
import { Secrets } from './secrets.js';
import { OpenAIClient, type Fetcher } from './provider-client.js';

const providerSchema=z.object({
  kind:z.enum(['openrouter','lmstudio','ollama','omniroute','polza','custom']),name:z.string().trim().min(1).max(80),baseUrl:z.string().trim().min(1).max(2000),
  auth:z.enum(['bearer','none']),lastModel:z.string().trim().max(500).default(''),
  compatibility:z.object({tokenLimit:z.enum(['max_tokens','max_completion_tokens','none']),temperature:z.boolean(),reasoning:z.enum(['none','reasoning','reasoning_effort'])}),
  revision:z.number().int().positive().optional(),id:z.string().max(100).optional(),apiKey:z.string().trim().max(4096).optional(),clearApiKey:z.boolean().optional()
});
export function normalizeBaseUrl(input:string):string {
  let url:URL;try{url=new URL(input);}catch{throw new AppError(400,'Введите полный Base URL, включая http:// или https://.');}
  if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.search||url.hash)throw new AppError(400,'Base URL должен быть HTTP(S)-адресом без ключа, пароля, параметров и фрагмента.');
  if(/\/(?:chat\/completions|models)\/?$/i.test(url.pathname))throw new AppError(400,'Укажите базовый адрес API без /chat/completions или /models.');
  return url.toString().replace(/\/+$/,'');
}
export class Providers {
  private clients=new Map<string,{stamp:string;client:OpenAIClient}>();
  readonly busy=new Map<string,string>();
  constructor(private store:Store,private secrets:Secrets,private fetcher:Fetcher=fetch,private legacy?:OpenAIClient) {}
  list():Provider[] {const selected=this.store.settings().providerId;return this.store.providers().map(p=>({...p,hasApiKey:!!this.secrets.key(p.id,p.baseUrl),keySource:this.secrets.source(p.id,p.baseUrl),chatCount:this.store.providerChatCount(p.id),isDefault:p.id===selected}));}
  private unlocked(id:string){if([...this.busy.values()].includes(id))throw new AppError(409,'Это подключение используется генерацией. Сначала остановите ответ.');}
  prepare(input:unknown,id?:string){
    const parsed=providerSchema.parse(input),previous=id?this.store.provider(id):undefined;
    if(previous&&parsed.revision!==previous.revision)throw new AppError(409,'Подключение изменилось на другом устройстве. Откройте настройки заново.');
    const baseUrl=normalizeBaseUrl(parsed.baseUrl),config:ProviderConfig={id:previous?.id??randomUUID(),kind:parsed.kind,name:parsed.name,baseUrl,auth:parsed.auth,lastModel:parsed.lastModel,compatibility:parsed.compatibility,revision:(previous?.revision??0)+1};
    if(parsed.apiKey&&/[\u0000-\u001f\u007f]/.test(parsed.apiKey))throw new AppError(400,'API-ключ должен занимать одну строку.');
    if(previous&&this.secrets.source(id!,previous.baseUrl)==='environment'&&(parsed.clearApiKey||parsed.apiKey||new URL(baseUrl).origin!==new URL(previous.baseUrl).origin||config.auth!==previous.auth))throw new AppError(400,'Ключ задан переменной окружения сервера. Удалите её и перезапустите сервер.');
    if(previous&&new URL(baseUrl).origin!==new URL(previous.baseUrl).origin&&this.secrets.key(id!,previous.baseUrl)&&!parsed.apiKey&&!parsed.clearApiKey)throw new AppError(400,'Адрес сервера изменился. Введите новый ключ или явно удалите прежний.');
    const key=parsed.clearApiKey?'':parsed.apiKey|| (previous?this.secrets.key(previous.id,baseUrl):'');
    return {config,parsed,key};
  }
  save(input:unknown,id?:string){
    if(id)this.unlocked(id);
    const {config,parsed}=this.prepare(input,id),previous=id?this.store.provider(id):undefined;
    const previousKey=previous?this.secrets.key(previous.id,previous.baseUrl):'';let keyWritten=false;
    // Keys are origin-bound. A failed cross-file commit can never send one to another host.
    try{this.store.transaction(()=>{this.store.saveProvider(config);if(parsed.clearApiKey||parsed.apiKey){this.secrets.setProviderKey(config.id,config.baseUrl,parsed.clearApiKey?'':parsed.apiKey!);keyWritten=true;}});}
    catch(error){if(keyWritten)this.secrets.setProviderKey(config.id,previous?.baseUrl??config.baseUrl,previousKey);throw error;}
    this.clients.delete(config.id);return this.list().find(p=>p.id===config.id)!;
  }
  remove(id:string,revision:number){
    this.unlocked(id);const provider=this.store.provider(id);
    if(provider.revision!==revision)throw new AppError(409,'Подключение изменилось на другом устройстве. Откройте настройки заново.');
    if(this.store.settings().providerId===id||this.store.providerChatCount(id))throw new AppError(409,'Подключение используется в настройках или чатах. Сначала выберите для них другого провайдера.');
    if(this.secrets.source(id,provider.baseUrl)==='environment')throw new AppError(400,'Ключ задан переменной окружения сервера. Удалите её и перезапустите сервер.');
    const key=this.secrets.key(id,provider.baseUrl);let keyWritten=false;
    try{this.store.transaction(()=>{this.store.db.prepare('DELETE FROM providers WHERE id=?').run(id);this.secrets.setProviderKey(id,provider.baseUrl,'');keyWritten=true;});}
    catch(error){if(keyWritten)this.secrets.setProviderKey(id,provider.baseUrl,key);throw error;}
    this.clients.delete(id);
  }
  client(config:ProviderConfig,key=this.secrets.key(config.id,config.baseUrl)):OpenAIClient {
    if(config.id==='openrouter'&&this.legacy)return this.legacy;
    const stamp=createHash('sha256').update(JSON.stringify({kind:config.kind,baseUrl:config.baseUrl,auth:config.auth,compatibility:config.compatibility})+key).digest('hex'),cached=this.clients.get(config.id);
    if(cached?.stamp===stamp)return cached.client;
    const client=new OpenAIClient(this.fetcher,config.baseUrl,config);this.clients.set(config.id,{stamp,client});return client;
  }
  resolve(id:string){const provider=this.store.provider(id),key=provider.auth==='none'?'':this.secrets.key(id,provider.baseUrl);if(provider.auth==='bearer'&&!key)throw new AppError(400,'Добавьте API-ключ выбранного провайдера в настройках. Ваша реплика сохранена.','PROVIDER_KEY_MISSING');return {provider,key,client:this.client(provider,key)};}
  models(id:string,force=false){const p=this.store.provider(id);return this.client(p).models(force,p.auth==='none'?'':this.secrets.key(id,p.baseUrl));}
  async probe(input:unknown,generation=false,profile:Settings['clientProfile']='larsta',signal?:AbortSignal):Promise<ProviderProbe & {text?:string}> {
    const start=Date.now(),raw=input as {id?:string;model?:string}, {config,key}=this.prepare(input,raw.id);
    if(config.auth==='bearer'&&!key)throw new AppError(400,'Добавьте API-ключ выбранного провайдера в настройках. Ваша реплика сохранена.','PROVIDER_KEY_MISSING');
    const client=new OpenAIClient(this.fetcher,config.baseUrl,config),deadline=signal?AbortSignal.any([signal,AbortSignal.timeout(generation?60_000:15_000)]):AbortSignal.timeout(generation?60_000:15_000);
    if(generation){
      const model=z.string().trim().min(1).max(500).parse(raw.model);let text='',size=0;
      const output=(delta:string)=>{size+=delta.length;if(size>16000)throw new AppError(502,'Тестовый ответ превысил допустимый размер.');text+=delta;};
      await client.stream(config.auth==='none'?'':key,{model,messages:[{role:'user',content:'Reply with the word OK.'}],max_tokens:32},deadline,output,delta=>{size+=delta.length;if(size>16000)throw new AppError(502,'Тестовый ответ превысил допустимый размер.');},profile);
      return {connected:true,catalog:'unavailable',models:0,authentication:config.auth==='none'?'none':'verified',elapsedMs:Date.now()-start,text:text.slice(0,240)};
    }
    let authentication:ProviderProbe['authentication']=config.auth==='none'?'none':'not-verified';
    if(config.auth==='bearer'&&['openrouter','polza'].includes(config.kind)){await client.verifyKey(key,deadline);authentication='verified';}
    try{const models=await client.models(true,config.auth==='none'?'':key,deadline,1);return {connected:true,catalog:'ok',models:models.length,authentication,elapsedMs:Date.now()-start};}
    catch(e){if(e instanceof AppError&&e.code==='CATALOG_UNAVAILABLE'&&e.message.includes('HTTP_404'))return {connected:true,catalog:'unavailable',models:0,authentication,elapsedMs:Date.now()-start,warning:'Каталог недоступен. Введите ID модели и проверьте генерацию.'};throw e;}
  }
}
