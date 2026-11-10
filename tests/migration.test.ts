import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../server/store.js';

test('version 1 database migrates additively without changing existing messages or sessions',()=>{
  const dir=mkdtempSync(path.join(os.tmpdir(),'larsta-migration-'));
  let store:Store|undefined;
  try{
    const old=new DatabaseSync(path.join(dir,'larsta.sqlite'));
    old.exec(`CREATE TABLE messages(seq INTEGER PRIMARY KEY AUTOINCREMENT,id TEXT UNIQUE NOT NULL,chat_id TEXT NOT NULL,role TEXT NOT NULL,content TEXT NOT NULL,status TEXT NOT NULL,model TEXT,created_at TEXT NOT NULL);
      CREATE TABLE sessions(hash TEXT PRIMARY KEY,expires INTEGER NOT NULL);PRAGMA user_version=1;`);
    old.prepare('INSERT INTO messages(id,chat_id,role,content,status,model,created_at) VALUES(?,?,?,?,?,?,?)').run('saved','chat','assistant','Существующая переписка.','complete','model','2026-10-25T10:00:00Z');
    old.prepare('INSERT INTO sessions VALUES(?,?)').run('session-hash',Date.now()+60000);old.close();
    store=new Store(dir);const messages=store.messages('chat');
    assert.equal(messages.length,1);assert.equal(messages[0].id,'saved');assert.equal(messages[0].content,'Существующая переписка.');assert.equal(messages[0].selectedVariantId,null);
    assert(store.db.prepare('SELECT 1 FROM sessions WHERE hash=?').get('session-hash'));
    assert.equal((store.db.prepare('PRAGMA user_version').get() as {user_version:number}).user_version,6);
    store.close();store=undefined;
    store=new Store(dir);assert.equal(store.messages('chat')[0].content,'Существующая переписка.');
  }finally{store?.close();rmSync(dir,{recursive:true,force:true});}
});

test('version 2 selected variants and existing settings survive reasoning migration',()=>{
  const dir=mkdtempSync(path.join(os.tmpdir(),'larsta-migration-v2-'));let store:Store|undefined;
  try {
    const old=new DatabaseSync(path.join(dir,'larsta.sqlite'));
    old.exec(`CREATE TABLE messages(seq INTEGER PRIMARY KEY AUTOINCREMENT,id TEXT UNIQUE NOT NULL,chat_id TEXT NOT NULL,role TEXT NOT NULL,content TEXT NOT NULL,status TEXT NOT NULL,model TEXT,created_at TEXT NOT NULL,selected_variant_id TEXT);
      CREATE TABLE message_variants(seq INTEGER PRIMARY KEY AUTOINCREMENT,id TEXT UNIQUE NOT NULL,message_id TEXT NOT NULL,content TEXT NOT NULL,status TEXT NOT NULL,model TEXT,created_at TEXT NOT NULL);
      CREATE TABLE settings(id INTEGER PRIMARY KEY,value TEXT NOT NULL);PRAGMA user_version=2;`);
    old.prepare('INSERT INTO messages(id,chat_id,role,content,status,model,created_at,selected_variant_id) VALUES(?,?,?,?,?,?,?,?)').run('reply','chat','assistant','Второй ответ','complete','selected-model','2026-10-25T10:00:00Z','second');
    const insert=old.prepare('INSERT INTO message_variants(id,message_id,content,status,model,created_at) VALUES(?,?,?,?,?,?)');
    insert.run('first','reply','Первый ответ','complete','old-model','2026-10-25T09:00:00Z');
    insert.run('second','reply','Второй ответ','complete','selected-model','2026-10-25T10:00:00Z');
    old.prepare('INSERT INTO settings VALUES(1,?)').run(JSON.stringify({mainModel:'selected-model',personaName:'Сохранённое имя'}));old.close();
    store=new Store(dir);let [message]=store.messages('chat');
    assert.equal(message.selectedVariantId,'second');assert.equal(message.variants?.length,2);assert.equal(message.content,'Второй ответ');
    assert.equal(store.settings().mainModel,'selected-model');assert.equal(store.settings().reasoningEffort,'auto');
    store.selectVariant('reply','first');[message]=store.messages('chat');assert.equal(message.content,'Первый ответ');assert.equal(message.reasoning||'','');
    store.updateMessage('reply','Первый ответ','complete','Сохранённое размышление');store.close();store=undefined;
    store=new Store(dir);[message]=store.messages('chat');assert.equal(message.reasoning,'Сохранённое размышление');assert.equal(message.selectedVariantId,'first');
  } finally {store?.close();rmSync(dir,{recursive:true,force:true});}
});

test('version 3 moves the old global persona into existing chat snapshots exactly once',()=>{
  const dir=mkdtempSync(path.join(os.tmpdir(),'larsta-migration-v3-'));let store:Store|undefined;
  try{
    store=new Store(dir);
    store.saveSettings({...store.settings(),personaName:'Test Reader',personaDescription:'Blue coat; silver pin',auxiliaryModel:'fixture/unused'});
    const character=store.saveCharacter(JSON.parse(readFileSync('examples/character-v2.json','utf8')),'');
    const chat=store.createChat(character.id);store.addMessage(chat.id,'user','Существующая история');
    const messages=store.messages(chat.id);
    store.db.exec('ALTER TABLE chats DROP COLUMN persona; DROP TABLE personas; PRAGMA user_version=3;');store.close();store=undefined;
    store=new Store(dir);assert.equal(store.personas().length,1);assert.equal(store.personas()[0].name,'Test Reader');assert.equal(store.chat(chat.id).persona?.description,'Blue coat; silver pin');assert.deepEqual(store.messages(chat.id),messages);
    const saved=store.chat(chat.id).persona!;
    store.db.prepare('UPDATE chats SET persona=? WHERE id=?').run(JSON.stringify({...saved,description:'Изменено только в чате'}),chat.id);
    store.saveSettings({...store.settings(),personaName:'Другое глобальное имя'});store.close();store=undefined;
    store=new Store(dir);assert.equal(store.personas().length,1);assert.equal(store.chat(chat.id).persona?.name,'Test Reader');assert.equal(store.chat(chat.id).persona?.description,'Изменено только в чате');assert.equal(store.settings().auxiliaryModel,'fixture/unused');assert.deepEqual(store.messages(chat.id),messages);
  }finally{store?.close();rmSync(dir,{recursive:true,force:true});}
});
