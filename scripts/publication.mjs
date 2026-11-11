import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const rootFiles=new Set(['.gitignore','.gitattributes','README.md','README.ru.md','SECURITY.md','index.html','package.json','package-lock.json','start.cmd','start.sh','tsconfig.json','tsconfig.server.json','tsconfig.test.json','vite.config.ts']);
const codeFolders=new Set(['src','server','shared','tests','scripts']);
const codeExtensions=new Set(['.ts','.tsx','.mjs','.css','.json']);
const normalize=value=>String(value).normalize('NFKC').toLowerCase().replace(/\\[nrt]/g,' ').replace(/\s+/g,' ').trim();
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const privatePath=/(^|\/)(data|uploads|backups|before-restore[^/]*|restore-[^/]*|test-results|node_modules|dist|dist-server|\.test-build|\.codex|\.agents|\.aws)(\/|$)|\.(sqlite(?:-wal|-shm)?|db|bak|pem|key|p12|log|zip|png|jpe?g|gif|webp|mp4)$/i;
export function allowed(file){
  if(privatePath.test(file)||file.split('/').some(part=>part.startsWith('.env'))||/server-secrets|report\.md|i18n-keys\.json|extract-i18n\.mjs/i.test(file))return false;
  if(rootFiles.has(file))return true;
  if(file==='public/favicon.svg'||file==='examples/character-v2.json')return true;
  return codeFolders.has(file.split('/')[0])&&codeExtensions.has(path.extname(file))&&!file.split('/').some(part=>part.startsWith('.'));
}
export function inventory(root,onlyAllowed=false){
  const result=[];
  function walk(dir,prefix=''){
    for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
      if(entry.name==='.git')continue;
      const relative=prefix+entry.name,full=path.join(dir,entry.name);
      if(entry.isSymbolicLink())throw new Error('Symbolic links are forbidden in publication input.');
      if(entry.isDirectory()){
        if(onlyAllowed&&!['src','server','shared','tests','scripts','public','examples'].includes(relative.split('/')[0]))continue;
        walk(full,relative+'/');
      }else if(!onlyAllowed||allowed(relative))result.push(relative);
    }
  }
  walk(root);return result.sort();
}
function privateReferences(dataDir){
  const exact=new Map(),fragments=new Set();let records=0;
  const identity=(value,kind)=>{if(typeof value==='string'&&value.trim().length>=3&&!['you','вы'].includes(normalize(value)))exact.set(normalize(value),kind);};
  const text=value=>{
    if(typeof value!=='string')return;
    const valueNorm=normalize(value);if(valueNorm.length<64)return;
    for(let i=0;i+64<=valueNorm.length;i+=32)fragments.add(valueNorm.slice(i,i+64));
  };
  const allText=value=>{if(typeof value==='string')text(value);else if(value&&typeof value==='object')Object.values(value).forEach(allText);};
  const profile=value=>{if(!value||typeof value!=='object')return;identity(value.name,'private profile name');if(typeof value.name==='string')identity(value.name.split(/[·—|]/)[0].trim(),'private profile name');allText(value);if(value.avatar)identity(path.basename(value.avatar),'private upload filename');};
  const dbFile=path.join(dataDir,'larsta.sqlite');
  if(fs.existsSync(dbFile)){
    const db=new DatabaseSync(dbFile,{readOnly:true});
    try{
      db.exec('PRAGMA query_only=ON; BEGIN;');
      const tables=new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(row=>row.name));
      for(const table of ['characters','personas','chats','messages','message_variants','sessions']){
        if(!tables.has(table))continue;
        for(const row of db.prepare(`SELECT * FROM ${table}`).iterate()){
          records++;identity(row.id,'private record identifier');identity(row.hash,'private session hash');
          if(table==='characters')profile(JSON.parse(row.card).data);
          if(table==='personas')profile(JSON.parse(row.value));
          if(table==='chats'){if(row.persona)profile(JSON.parse(row.persona));if(row.title?.length>=12)identity(row.title,'private chat title');}
          text(row.content);text(row.reasoning);text(row.summary);
          if(row.avatar)identity(path.basename(row.avatar),'private upload filename');
        }
      }
      if(tables.has('settings'))for(const row of db.prepare('SELECT value FROM settings').all()){
        const settings=JSON.parse(row.value);identity(settings.personaName,'private setting');text(settings.personaDescription);text(settings.systemPrompt);
        if(settings.mainModel)identity(settings.mainModel,'saved model setting');
        if(settings.auxiliaryModel)identity(settings.auxiliaryModel,'saved model setting');
      }
      if(tables.has('providers'))for(const row of db.prepare('SELECT id,value FROM providers').all()){
        records++;const provider=JSON.parse(row.value);if(row.id!=='openrouter')identity(row.id,'private provider identifier');
        identity(provider.lastModel,'saved provider model');
        if(!['OpenRouter','LM Studio','Ollama','OmniRoute','Polza.ai','OpenAI-compatible'].includes(provider.name))identity(provider.name,'private provider name');
        const presets=new Set(['https://openrouter.ai/api/v1','http://localhost:1234/v1','http://localhost:11434/v1','http://localhost:20128/v1','https://polza.ai/api/v1']);
        if(provider.baseUrl&&!presets.has(provider.baseUrl))identity(provider.baseUrl,'private provider address');
      }
      db.exec('ROLLBACK;');
    }finally{db.close();}
  }
  const secretFile=path.join(dataDir,'server-secrets.json');
  if(fs.existsSync(secretFile)){const secrets=JSON.parse(fs.readFileSync(secretFile,'utf8'));identity(secrets.apiKey,'private API key');identity(secrets.connectionCode,'private connection code');for(const value of Object.values(secrets.providerKeys??{}))identity(value?.key,'private provider API key');}
  if(process.env.OPENROUTER_API_KEY)identity(process.env.OPENROUTER_API_KEY,'private environment key');
  return {exact,fragments,records};
}
export function audit(root,{privateDir,workspace=false}={}){
  const files=inventory(root,workspace),violations=[],refs=privateDir?privateReferences(path.resolve(privateDir)):null;
  const manifest=[];
  for(const file of files){
    if(!allowed(file)){violations.push({file,rule:'not on publication allowlist'});continue;}
    const bytes=fs.readFileSync(path.join(root,file));manifest.push({file,bytes:bytes.length,sha256:hash(bytes)});
    if(bytes.includes(0)){violations.push({file,rule:'unexpected binary content'});continue;}
    const content=bytes.toString('utf8'),value=normalize(content);
    const patterns=[/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,/\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})\b/,/\bsk-(?:or-v1-|proj-|ant-api\d+-)?[A-Za-z0-9_-]{24,}/g,/(?:data:image\/[^;]+;base64,)[A-Za-z0-9+/=]{2000}/];
    for(const pattern of patterns)for(const match of content.matchAll(new RegExp(pattern.source,pattern.flags.includes('g')?pattern.flags:pattern.flags+'g'))){
      if(match[0].includes('not-a-real')||match[0].includes('fixture'))continue;
      violations.push({file,rule:'possible credential or embedded private asset'});break;
    }
    if(refs){
      for(const [needle,kind]of refs.exact){
        if(!value.includes(needle))continue;
        if(/^[\p{L}\p{N} _.-]+$/u.test(needle)&&needle.length<40){
          const escaped=needle.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');if(!new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`,'u').test(value))continue;
        }
        violations.push({file,rule:kind});
      }
      for(let i=0;i+64<=value.length;i++)if(refs.fragments.has(value.slice(i,i+64))){violations.push({file,rule:'private content fingerprint'});break;}
    }
  }
  return {files:manifest.length,privateRecordsCompared:refs?.records??0,violations:[...new Map(violations.map(item=>[item.file+'|'+item.rule,item])).values()],manifest};
}
if(path.resolve(process.argv[1]||'')===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2),read=name=>{const index=args.indexOf(name);return index>=0?args[index+1]:undefined;};
  try{
    const root=path.resolve(read('--root')||'.'),result=audit(root,{privateDir:read('--private-dir'),workspace:args.includes('--workspace')});
    if(read('--manifest'))fs.writeFileSync(read('--manifest'),JSON.stringify(result,null,2));
    console.log(JSON.stringify({files:result.files,privateRecordsCompared:result.privateRecordsCompared,violations:result.violations},null,2));
    if(result.violations.length)process.exitCode=1;
  }catch{console.error('Publication audit failed. No private values were printed.');process.exitCode=1;}
}
