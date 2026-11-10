import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import os from 'node:os';
import path from 'node:path';
test('separate server process restarts with same messages and paired device session; LAN interface responds',async()=>{
  const dir=mkdtempSync(path.join(os.tmpdir(),'larsta-process-'));let processHandle:ChildProcess|undefined;
  async function start(){
    processHandle=spawn(process.execPath,[path.resolve('.test-build/tests/process-fixture.js')],{cwd:process.cwd(),env:{...process.env,OPENROUTER_API_KEY:'',LARSTA_DATA_DIR:dir},stdio:['ignore','pipe','pipe']});
    const port=await new Promise<number>((resolve,reject)=>{let out='';processHandle!.on('error',reject);processHandle!.on('exit',code=>reject(new Error(`Fixture exited: ${code}`)));processHandle!.stdout!.on('data',b=>{out+=String(b);if(out.includes('\n'))resolve(JSON.parse(out.trim()).port);});});
    return port;
  }
  async function stop(){if(!processHandle)return;const exit=once(processHandle,'exit');processHandle.kill('SIGTERM');await exit;processHandle=undefined;}
  try {
    let port=await start();let base=`http://127.0.0.1:${port}/api`;
    const secrets=JSON.parse(readFileSync(path.join(dir,'server-secrets.json'),'utf8'));
    const auth=await fetch(base+'/auth',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:secrets.connectionCode})});assert.equal(auth.status,200);
    const cookie=auth.headers.get('set-cookie')!.split(';')[0];
    const headers={Cookie:cookie,'Content-Type':'application/json'};
    const card=JSON.parse(readFileSync(path.resolve('examples/character-v2.json'),'utf8'));
    const character=await (await fetch(base+'/characters/import',{method:'POST',headers,body:JSON.stringify(card)})).json();
    const chat=await (await fetch(base+'/chats',{method:'POST',headers,body:JSON.stringify({characterId:character.id})})).json();
    await fetch(base+`/chats/${chat.id}/messages`,{method:'POST',headers,body:JSON.stringify({content:'Сохранится даже после перезапуска процесса.'})});
    await stop();port=await start();base=`http://127.0.0.1:${port}/api`;
    const result=await fetch(base+`/chats/${chat.id}`,{headers});assert.equal(result.status,200);const data=await result.json();assert.equal(data.messages.length,2);assert.equal(data.messages[1].content,'Сохранится даже после перезапуска процесса.');
    const wifi=Object.values(os.networkInterfaces()).flat().find(i=>i?.family==='IPv4'&&!i.internal&&i.address.startsWith('192.168.'));
    if(wifi){const lan=await fetch(`http://${wifi.address}:${port}/api/chats/${chat.id}`,{headers,signal:AbortSignal.timeout(5000)});assert.equal(lan.status,200);}
  }finally{await stop();rmSync(dir,{recursive:true,force:true});}
});

test('launching on an occupied port leaves the data directory unopened',async()=>{
  const temporary=mkdtempSync(path.join(os.tmpdir(),'larsta-port-')),dataDir=path.join(temporary,'must-not-be-created');
  const holder=createServer();await new Promise<void>(resolve=>holder.listen(0,'0.0.0.0',resolve));
  const address=holder.address();assert(address&&typeof address!=='string');
  try{
    const child=spawn(process.execPath,[path.resolve('.test-build/server/index.js')],{cwd:process.cwd(),env:{...process.env,OPENROUTER_API_KEY:'',PORT:String(address.port),LARSTA_DATA_DIR:dataDir},stdio:'ignore'});
    const [code]=await once(child,'exit');assert.equal(code,1);assert.equal(existsSync(dataDir),false);
  }finally{await new Promise<void>(resolve=>holder.close(()=>resolve()));rmSync(temporary,{recursive:true,force:true});}
});
