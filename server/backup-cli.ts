import path from 'node:path';
import { translate } from '../shared/translations.js';
import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';
import { createBackup, listBackups, restoreBackup, verifyBackup } from './backups.js';
import { lockDataDirectory } from './data-lock.js';

const [action='list',id,...flags]=process.argv.slice(2);
const dataDir=path.resolve(process.env.LARSTA_DATA_DIR||'data');
try {
  if(action==='list')console.log(JSON.stringify(listBackups(dataDir).map(({id,createdAt,reason})=>({id,createdAt,reason})),null,2));
  else if(action==='verify'){if(!id)throw new Error('Provide a backup ID.');verifyBackup(dataDir,id);console.log('Backup verified: '+id);}
  else if(action==='create'||action==='restore') {
    if(action==='create'&&!existsSync(path.join(dataDir,'larsta.sqlite')))throw new Error('Database not found.');
    const release=lockDataDirectory(dataDir);
    try {
      if(action==='restore') {
        if(!id||!flags.includes('--confirm'))throw new Error('Restore: npm run backup -- restore ID --confirm. Stop the server first.');
        const rollback=restoreBackup(dataDir,id);console.log('Restored. Previous data preserved at: '+rollback);
      } else {
        const db=new DatabaseSync(path.join(dataDir,'larsta.sqlite'));
        try{console.log('Backup created: '+createBackup(dataDir,db).id);}finally{db.close();}
      }
    } finally {release();}
  } else throw new Error('Available commands: list, create, verify ID, restore ID --confirm.');
} catch(error) {console.error(error instanceof Error?translate(error.message,'en'):'Backup operation failed.');process.exitCode=1;}
