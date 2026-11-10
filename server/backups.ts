import { DatabaseSync } from 'node:sqlite';
import { createHash, randomBytes } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { AppError } from './domain.js';

type FileReceipt = {name:string; bytes:number; sha256:string};
export type BackupInfo = {id:string; createdAt:string; reason:string; files:FileReceipt[]; schemaVersion:number; version:1};
const validId = /^\d{8}T\d{6}Z-[a-f0-9]{8}$/;
const digest = (file:string) => createHash('sha256').update(readFileSync(file)).digest('hex');

function location(dataDir:string, id:string) {
  if (!validId.test(id)) throw new AppError(400, 'Неверный идентификатор резервной копии.');
  return path.join(path.resolve(dataDir), 'backups', id);
}

export function listBackups(dataDir:string): BackupInfo[] {
  const root=path.join(dataDir,'backups');
  if (!existsSync(root)) return [];
  return readdirSync(root).filter(id=>validId.test(id)).flatMap(id=>{
    try { const info=JSON.parse(readFileSync(path.join(root,id,'manifest.json'),'utf8')) as BackupInfo; return info.version===1&&info.id===id&&Number.isFinite(Date.parse(info.createdAt))&&typeof info.reason==='string'&&Array.isArray(info.files)?[info]:[]; }
    catch { return []; }
  }).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
}

export function verifyBackup(dataDir:string, id:string): BackupInfo {
  const dir=location(dataDir,id);
  if (!existsSync(path.join(dir,'manifest.json'))) throw new AppError(404,'Резервная копия не найдена.');
  const info=JSON.parse(readFileSync(path.join(dir,'manifest.json'),'utf8')) as BackupInfo;
  if (info.version!==1 || info.id!==id || !Array.isArray(info.files) || !info.files.some(f=>f.name==='larsta.sqlite')) throw new AppError(400,'Некорректная резервная копия.');
  for (const file of info.files) {
    if (file.name!=='larsta.sqlite' && !/^uploads\/[a-zA-Z0-9_.-]+$/.test(file.name)) throw new AppError(400,'Некорректный путь в резервной копии.');
    const target=path.join(dir,file.name);
    if (!existsSync(target) || statSync(target).size!==file.bytes || digest(target)!==file.sha256) throw new AppError(400,'Проверка резервной копии не пройдена: файл изменён или отсутствует.');
  }
  const db=new DatabaseSync(path.join(dir,'larsta.sqlite'),{readOnly:true});
  try {
    const checks=db.prepare('PRAGMA quick_check').all() as Record<string,unknown>[];
    if (checks.length!==1 || checks[0].quick_check!=='ok' || db.prepare('PRAGMA foreign_key_check').all().length) throw new AppError(400,'Проверка целостности базы не пройдена.');
  } finally { db.close(); }
  return info;
}

/** VACUUM INTO includes committed WAL data. Secret files are never copied. */
export function createBackup(dataDir:string, db:DatabaseSync, reason='manual'): BackupInfo {
  const createdAt=new Date().toISOString();
  const id=createdAt.slice(0,19).replace(/[-:]/g,'')+'Z-'+randomBytes(4).toString('hex');
  const dir=location(dataDir,id), staging=dir+'.pending';
  mkdirSync(path.join(staging,'uploads'),{recursive:true});
  try {
    const snapshot=path.join(staging,'larsta.sqlite');
    db.exec(`VACUUM INTO '${snapshot.replace(/'/g,"''")}'`);
    const names=['larsta.sqlite'];
    const uploads=path.join(dataDir,'uploads');
    if (existsSync(uploads)) for (const file of readdirSync(uploads,{withFileTypes:true})) {
      if (!file.isFile() || !/^[a-zA-Z0-9_.-]+$/.test(file.name)) continue;
      copyFileSync(path.join(uploads,file.name),path.join(staging,'uploads',file.name));
      names.push('uploads/'+file.name);
    }
    const info:BackupInfo={version:1,id,createdAt,reason,schemaVersion:Number((db.prepare('PRAGMA user_version').get() as {user_version:number}).user_version),files:names.map(name=>({name,bytes:statSync(path.join(staging,name)).size,sha256:digest(path.join(staging,name))}))};
    writeFileSync(path.join(staging,'manifest.json'),JSON.stringify(info,null,2));
    renameSync(staging,dir);
    verifyBackup(dataDir,id);
    // Only our own validated backup directories can be pruned.
    for (const old of listBackups(dataDir).filter(b=>b.reason==='daily').slice(14)) rmSync(location(dataDir,old.id),{recursive:true});
    return info;
  } catch (error) {
    rmSync(staging,{recursive:true,force:true});
    throw error;
  }
}

/** Offline restore retains the old files in a rollback directory. */
export function restoreBackup(dataDir:string, id:string): string {
  const info=verifyBackup(dataDir,id), source=location(dataDir,id);
  const root=path.resolve(dataDir), rollback=path.join(root,'before-restore-'+Date.now());
  mkdirSync(rollback);
  const staged=path.join(root,'restore-'+randomBytes(8).toString('hex'));
  mkdirSync(path.join(staged,'uploads'),{recursive:true});
  for (const file of info.files) copyFileSync(path.join(source,file.name),path.join(staged,file.name));
  const previous=['larsta.sqlite','larsta.sqlite-wal','larsta.sqlite-shm','uploads'];
  const moved:string[]=[];
  const installed:string[]=[];
  try {
    for (const name of previous) if (existsSync(path.join(root,name))) {renameSync(path.join(root,name),path.join(rollback,name));moved.push(name);}
    renameSync(path.join(staged,'larsta.sqlite'),path.join(root,'larsta.sqlite'));
    installed.push('larsta.sqlite');
    renameSync(path.join(staged,'uploads'),path.join(root,'uploads'));
    installed.push('uploads');
  } catch (error) {
    // Never overwrite an original if installation failed partway through.
    for (const name of installed) renameSync(path.join(root,name),path.join(staged,'failed-'+name));
    for (const name of moved) renameSync(path.join(rollback,name),path.join(root,name));
    throw error;
  }
  rmSync(staged,{recursive:true});
  return rollback;
}
