import path from 'node:path';
import { existsSync } from 'node:fs';
import { createServer as createPortProbe } from 'node:net';
import express from 'express';
import { createApp, addresses } from './app.js';
import { createBackup, listBackups } from './backups.js';
import { lockDataDirectory } from './data-lock.js';
const port = Number(process.env.PORT || 3000);
if(!Number.isInteger(port) || port<1 || port>65535) throw new Error('PORT must be an integer from 1 to 65535.');
// A second launch must not open/migrate the live database or mark its stream stopped.
try {
  await new Promise<void>((resolve,reject)=>{
    const probe=createPortProbe();probe.once('error',reject);
    probe.listen(port,'0.0.0.0',()=>probe.close(error=>error?reject(error):resolve()));
  });
} catch(e) {
  console.error((e as NodeJS.ErrnoException).code==='EADDRINUSE'?`Port ${port} is already in use. Stop the previous server with Ctrl+C and restart Larsta.`:'Could not open the server port.');
  process.exit(1);
}
const dataDir=path.resolve(process.env.LARSTA_DATA_DIR||'data');
const release=lockDataDirectory(dataDir);
process.once('exit',release);
const {app,store,secrets,active} = createApp({dataDir,port});
if(process.argv.includes('--dev')) {
  const {createServer} = await import('vite');
  const vite = await createServer({server:{middlewareMode:true},appType:'spa'}); app.use(vite.middlewares);
} else {
  const dist = path.resolve('dist');
  if(!existsSync(path.join(dist,'index.html'))) throw new Error('Run npm run build or start.cmd first.');
  app.use((_req,res,next)=>{res.setHeader('Content-Security-Policy',"default-src 'self'; img-src 'self' blob: data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; base-uri 'self'; frame-ancestors 'none'; object-src 'none'");next();});
  app.use(express.static(dist));app.get('/{*splat}',(_req,res)=>res.sendFile(path.join(dist,'index.html')));
}
const server = app.listen(port,'0.0.0.0',()=>{
  console.log('\n  LARSTA · your story space\n');
  addresses(port).forEach((url,i)=>console.log(`  ${i===0?'Computer':'Wi-Fi / phone'}: ${url}`));
  console.log(`\n  Connection code: ${secrets.connectionCode}\n  Keep this code private: it grants access to the app and settings.\n  Stop the server: Ctrl+C\n`);
});
const dailyBackup=()=>{
  if(active.size)return;
  try {
    const last=listBackups(dataDir).find(copy=>copy.reason==='daily');
    if(!last||Date.now()-Date.parse(last.createdAt)>=24*3600_000)createBackup(dataDir,store.db,'daily');
  } catch {console.error('Could not create the daily backup. Check free disk space and the Backups section.');}
};
const backupTimer=setInterval(dailyBackup,3600_000);backupTimer.unref();
setImmediate(dailyBackup);
server.on('error',(e:NodeJS.ErrnoException)=>{console.error(e.code==='EADDRINUSE'?`Port ${port} is already in use. Stop the other server or set PORT.`:'Could not start the server.');process.exitCode=1;store.close();});
let closing = false;
function shutdown() {
  if(closing)return;closing=true;clearInterval(backupTimer);
  for(const controller of active.values())controller.abort('disconnect');
  let closed=false;
  const drain=()=>{if(closed&&active.size===0){clearInterval(waiting);store.close();release();process.exit(0);}};
  const waiting=setInterval(drain,25);
  server.close(()=>{closed=true;drain();});
  setTimeout(()=>process.exit(0),5000).unref();
}
process.on('SIGINT',shutdown);process.on('SIGTERM',shutdown);
