import { existsSync, readFileSync, writeFileSync, renameSync, unlinkSync } from 'node:fs';
import { randomInt, randomUUID } from 'node:crypto';
import path from 'node:path';
import { AppError } from './domain.js';
type SecretData = { version: 2; connectionCode: string; providerKeys: Record<string,{key:string;origin:string}> };
const routerOrigin='https://openrouter.ai';
export class Secrets {
  private value: SecretData;
  private file: string;
  constructor(dir: string) {
    this.file=path.join(dir,'server-secrets.json');
    const old=existsSync(this.file)?JSON.parse(readFileSync(this.file,'utf8')):null;
    this.value={version:2,connectionCode:old?.connectionCode??String(randomInt(10_000_000,100_000_000)),providerKeys:old?.providerKeys??{}};
    if(old?.apiKey&&!this.value.providerKeys.openrouter)this.value.providerKeys.openrouter={key:old.apiKey,origin:routerOrigin};
    if(old?.version!==2)this.save(this.value);
  }
  get connectionCode() { return this.value.connectionCode; }
  get apiKey() { return this.key('openrouter',routerOrigin); }
  setKey(key: string) { this.setProviderKey('openrouter',routerOrigin,key); }
  source(id:string,baseUrl:string): 'environment'|'saved'|'none' {
    const origin=new URL(baseUrl).origin;
    if(id==='openrouter'&&origin===routerOrigin&&process.env.OPENROUTER_API_KEY)return 'environment';
    return this.value.providerKeys[id]?.origin===origin&&this.value.providerKeys[id]?.key?'saved':'none';
  }
  key(id:string,baseUrl:string) {const source=this.source(id,baseUrl);return source==='environment'?process.env.OPENROUTER_API_KEY!:source==='saved'?this.value.providerKeys[id].key:'';}
  setProviderKey(id:string,baseUrl:string,key:string) {
    if(/[\u0000-\u001f\u007f]/.test(key)||key.length>4096)throw new AppError(400,'API-ключ должен занимать одну строку.');
    const next=structuredClone(this.value);
    if(key)next.providerKeys[id]={key,origin:new URL(baseUrl).origin};else delete next.providerKeys[id];
    this.save(next);this.value=next;
  }
  private save(value:SecretData) {
    const temporary=this.file+'.'+randomUUID()+'.tmp';
    try {writeFileSync(temporary,JSON.stringify(value,null,2),{mode:0o600,flag:'wx'});renameSync(temporary,this.file);}
    finally {if(existsSync(temporary))unlinkSync(temporary);}
  }
}
