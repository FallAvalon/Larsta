import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

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
        try{process.kill(pid,0);throw new Error('Эта папка данных уже используется. Остановите Larsta перед восстановлением или повторным запуском.');}
        catch(error){if((error as NodeJS.ErrnoException).code!=='ESRCH')throw error;}
        unlinkSync(file);
      }finally{unlinkSync(recovery);}
    }
  }
  throw new Error('Не удалось заблокировать папку данных.');
}
