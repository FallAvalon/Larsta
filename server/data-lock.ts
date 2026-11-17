import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

/**
 * Windows recycles PIDs: `process.kill(pid, 0)` returns EPERM (not ESRCH) when the
 * PID now belongs to a protected or system process (e.g. a service like svchost.exe),
 * which says nothing about whether it is our server. Identify the process before
 * deciding the lock is alive; a stale lock must not wedge every future launch.
 */
function queryProcessOwner(pid:number):'larsta'|'other'|'gone'|'unknown' {
  if(process.platform!=='win32')return 'unknown';
  try{
    const out=execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',
      `$p=Get-CimInstance Win32_Process -Filter 'ProcessId = ${pid}' -ErrorAction SilentlyContinue; if($p){[pscustomobject]@{name=$p.Name;cmd=[string]$p.CommandLine}|ConvertTo-Json -Compress}`,
    ],{encoding:'utf8',timeout:15000,windowsHide:true,maxBuffer:1024*1024}).trim();
    if(!out)return 'gone';
    const info=JSON.parse(out) as {name?:unknown;cmd?:unknown};
    const name=String(info.name??'').toLowerCase();
    const cmd=String(info.cmd??'').toLowerCase();
    if(name!=='node.exe'&&name!=='node')return 'other';
    if(!cmd)return 'unknown';
    return /dist-server[\/\\]server[\/\\]|backup-cli|larsta/i.test(cmd)?'larsta':'other';
  }catch{return 'unknown';}
}

function processAlive(pid:number):boolean {
  try{process.kill(pid,0);return true;}
  catch(error){
    const code=(error as NodeJS.ErrnoException).code;
    if(code==='ESRCH')return false;
    if(code==='EPERM'||code==='EACCES'){
      const owner=queryProcessOwner(pid);
      return owner==='larsta'||owner==='unknown';
    }
    throw error;
  }
}

/** A second process must not migrate, restore, or interrupt the same database. */
export function lockDataDirectory(dataDir:string):()=>void {
  mkdirSync(dataDir,{recursive:true});
  const file=path.join(dataDir,'server.lock'), token=randomUUID();
  for(let attempt=0;attempt<2;attempt++) {
    try {
      writeFileSync(file,JSON.stringify({pid:process.pid,token}),{flag:'wx',mode:0o600});
      return ()=>{
        try {if(JSON.parse(readFileSync(file,'utf8')).token===token)unlinkSync(file);} catch {/* Already released. */}
      };
    } catch(error) {
      if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;
      // Only one process may recover a stale lock; otherwise two launches could
      // accidentally remove each other's newly acquired lock.
      const recovery=file+'.recovery';
      try{writeFileSync(recovery,JSON.stringify({pid:process.pid,token}),{flag:'wx',mode:0o600});}
      catch{throw new Error('Другая копия Larsta проверяет блокировку данных. Повторите запуск.');}
      try{
        if(!existsSync(file))continue;
        let pid:number;
        try{pid=JSON.parse(readFileSync(file,'utf8')).pid;}catch{throw new Error('Не удалось проверить блокировку данных. Проверьте, что Larsta остановлена, и удалите data/server.lock.');}
        if(!Number.isInteger(pid)||pid<1)throw new Error('Некорректная блокировка данных.');
        if(processAlive(pid))throw new Error(`Эта папка данных уже используется (pid ${pid}). Остановите Larsta перед восстановлением или повторным запуском. Если Larsta остановлен, а pid ${pid} принадлежит другой программе, удалите data/server.lock и запустите снова.`);
        console.warn(`Larsta: устаревшая блокировка данных удалена (pid ${pid} — не запущенный процесс Larsta).`);
        try{const current=JSON.parse(readFileSync(file,'utf8')) as {pid?:unknown};if(current.pid!==pid)continue;}catch{/* Lock vanished or changed; remove it as usual. */}
        unlinkSync(file);
      }finally{unlinkSync(recovery);}
    }
  }
  throw new Error('Не удалось заблокировать папку данных.');
}
