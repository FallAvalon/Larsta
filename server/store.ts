import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import type { Card, Character, Chat, Message, MessageVariant, Settings, Persona, PersonaData, ChatPersona } from '../shared/types.js';
import { AppError, defaults } from './domain.js';
import { createBackup } from './backups.js';

type Row = Record<string, any>;
export class Store {
  db: DatabaseSync;
  constructor(public dir: string) {
    mkdirSync(dir, { recursive: true });
    const existed=existsSync(path.join(dir,'larsta.sqlite'));
    this.db = new DatabaseSync(path.join(dir, 'larsta.sqlite'));
    const version=Number((this.db.prepare('PRAGMA user_version').get() as Row).user_version);
    if(version>6){this.db.close();throw new Error('База создана более новой версией Larsta. Обновите приложение.');}
    if(existed&&version<6&&this.db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='chats'").get()) {
      try {createBackup(dir,this.db,'before-migration');} catch(error){this.db.close();throw error;}
    }
    this.db.function('casefold',{deterministic:true},value=>String(value??'').toLocaleLowerCase('ru'));
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS characters (id TEXT PRIMARY KEY, card TEXT NOT NULL, summary TEXT NOT NULL, avatar TEXT, favorite INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS chats (id TEXT PRIMARY KEY, character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE, title TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS messages (seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT UNIQUE NOT NULL, chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE, role TEXT NOT NULL, content TEXT NOT NULL, status TEXT NOT NULL, model TEXT, created_at TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS messages_chat ON messages(chat_id, seq);
      CREATE TABLE IF NOT EXISTS settings (id INTEGER PRIMARY KEY CHECK(id=1), value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS sessions (hash TEXT PRIMARY KEY, expires INTEGER NOT NULL);`);
    // Additive migration: existing message IDs, content, order and sessions remain intact.
    this.transaction(() => {
      const columns = this.db.prepare('PRAGMA table_info(messages)').all() as Row[];
      if (!columns.some(c => c.name === 'selected_variant_id')) this.db.exec('ALTER TABLE messages ADD COLUMN selected_variant_id TEXT');
      this.db.exec(`CREATE TABLE IF NOT EXISTS message_variants (
        seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT UNIQUE NOT NULL,
        message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
        content TEXT NOT NULL, status TEXT NOT NULL, model TEXT, created_at TEXT NOT NULL,
        reasoning TEXT NOT NULL DEFAULT '');
      CREATE INDEX IF NOT EXISTS variants_message ON message_variants(message_id, seq);`);
      const messageColumns = this.db.prepare('PRAGMA table_info(messages)').all() as Row[];
      if (!messageColumns.some(c => c.name === 'reasoning')) this.db.exec("ALTER TABLE messages ADD COLUMN reasoning TEXT NOT NULL DEFAULT ''");
      const variantColumns = this.db.prepare('PRAGMA table_info(message_variants)').all() as Row[];
      if (!variantColumns.some(c => c.name === 'reasoning')) this.db.exec("ALTER TABLE message_variants ADD COLUMN reasoning TEXT NOT NULL DEFAULT ''");
      const chatColumns = this.db.prepare('PRAGMA table_info(chats)').all() as Row[];
      this.db.exec(`CREATE TABLE IF NOT EXISTS personas (id TEXT PRIMARY KEY, value TEXT NOT NULL, is_default INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);`);
      if (!chatColumns.some(c => c.name === 'persona')) {
        this.db.exec('ALTER TABLE chats ADD COLUMN persona TEXT');
        const settings = this.settings(), time = new Date().toISOString(), id = randomUUID();
        const value:PersonaData = {name:settings.personaName||'Вы',description:settings.personaDescription,appearance:'',personality:'',avatar:null};
        this.db.prepare('INSERT INTO personas VALUES(?,?,?,?,?)').run(id,JSON.stringify(value),1,time,time);
        this.db.prepare('UPDATE chats SET persona=?').run(JSON.stringify({...value,sourceId:id}));
      }
      if (!chatColumns.some(c => c.name === 'generation')) this.db.exec("ALTER TABLE chats ADD COLUMN generation TEXT NOT NULL DEFAULT '{}'");
      if (!chatColumns.some(c => c.name === 'branch_group')) this.db.exec('ALTER TABLE chats ADD COLUMN branch_group TEXT');
      if (!chatColumns.some(c => c.name === 'revision')) this.db.exec('ALTER TABLE chats ADD COLUMN revision INTEGER NOT NULL DEFAULT 0');
      this.db.exec(`CREATE TABLE IF NOT EXISTS operations (
        chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
        request_id TEXT NOT NULL, kind TEXT NOT NULL, fingerprint TEXT NOT NULL,
        result TEXT NOT NULL, PRIMARY KEY(chat_id,request_id,kind));
        CREATE INDEX IF NOT EXISTS chats_updated ON chats(updated_at);
        CREATE INDEX IF NOT EXISTS chats_character ON chats(character_id);
        PRAGMA user_version=6;`);
    });
    this.db.prepare("UPDATE messages SET status='stopped' WHERE status='streaming'").run();
    this.db.prepare("UPDATE message_variants SET status='stopped' WHERE status='streaming'").run();
    this.db.prepare("UPDATE operations SET result=json_set(result,'$.status','interrupted') WHERE kind='generate' AND json_extract(result,'$.status')='running'").run();
    this.db.prepare('DELETE FROM sessions WHERE expires < ?').run(Date.now());
  }
  transaction<T>(fn: () => T): T { this.db.exec('BEGIN IMMEDIATE'); try { const result = fn(); this.db.exec('COMMIT'); return result; } catch (e) { this.db.exec('ROLLBACK'); throw e; } }
  settings(): Omit<Settings, 'hasApiKey'> { const row = this.db.prepare('SELECT value FROM settings WHERE id=1').get() as Row | undefined; return { ...defaults, ...(row ? JSON.parse(row.value) : {}) }; }
  saveSettings(value: Omit<Settings, 'hasApiKey'>) { this.db.prepare('INSERT INTO settings VALUES(1, ?) ON CONFLICT(id) DO UPDATE SET value=excluded.value').run(JSON.stringify(value)); }
  personas(): Persona[] { return (this.db.prepare('SELECT * FROM personas ORDER BY is_default DESC,updated_at DESC,rowid DESC').all() as Row[]).map(row=>({...JSON.parse(row.value),id:row.id,isDefault:!!row.is_default,createdAt:row.created_at,updatedAt:row.updated_at})); }
  persona(id: string): Persona { const p=this.personas().find(p=>p.id===id);if(!p)throw new AppError(404,'Персона не найдена.');return p; }
  savePersona(value: PersonaData, id: string = randomUUID()): Persona {
    const time=new Date().toISOString();
    value={name:value.name,appearance:value.appearance,personality:value.personality,description:value.description,avatar:value.avatar};
    this.db.prepare('INSERT INTO personas(id,value,is_default,created_at,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at').run(id,JSON.stringify(value),this.personas().length?0:1,time,time);
    return this.persona(id);
  }
  defaultPersona(id: string) { this.persona(id);this.transaction(()=>{this.db.prepare('UPDATE personas SET is_default=0').run();this.db.prepare('UPDATE personas SET is_default=1 WHERE id=?').run(id);});return this.persona(id); }
  deletePersona(id: string) {
    const p=this.persona(id);if(this.personas().length<=1)throw new AppError(400,'Оставьте хотя бы одну персону. Можно изменить её имя и описание.');
    this.transaction(()=>{this.db.prepare('DELETE FROM personas WHERE id=?').run(id);if(p.isDefault)this.db.prepare('UPDATE personas SET is_default=1 WHERE id=(SELECT id FROM personas ORDER BY updated_at DESC LIMIT 1)').run();});
  }
  snapshot(persona: Persona): ChatPersona { return {sourceId:persona.id,name:persona.name,appearance:persona.appearance,personality:persona.personality,description:persona.description,avatar:persona.avatar}; }
  characterRow(row: Row): Character { return { id: row.id, card: JSON.parse(row.card), summary: row.summary, avatar: row.avatar, favorite: !!row.favorite, createdAt: row.created_at, updatedAt: row.updated_at }; }
  characters(): Character[] { return (this.db.prepare('SELECT * FROM characters ORDER BY updated_at DESC, rowid DESC').all() as Row[]).map(r => this.characterRow(r)); }
  characterSummaries(): Character[] {
    const rows=this.db.prepare(`SELECT id,summary,avatar,favorite,created_at,updated_at,
      json_extract(card,'$.data.name') AS name,json_extract(card,'$.data.description') AS description,
      json_extract(card,'$.data.tags') AS tags,json_extract(card,'$.data.creator') AS creator
      FROM characters ORDER BY updated_at DESC,rowid DESC`).all() as Row[];
    return rows.map(row=>({id:row.id,summary:row.summary,avatar:row.avatar,favorite:!!row.favorite,createdAt:row.created_at,updatedAt:row.updated_at,
      card:{spec:'chara_card_v2',spec_version:'2.0',data:{name:row.name,description:row.description,tags:JSON.parse(row.tags||'[]'),creator:row.creator||'',personality:'',scenario:'',first_mes:'',mes_example:'',creator_notes:'',system_prompt:'',post_history_instructions:'',alternate_greetings:[],character_version:'',extensions:{}}}}));
  }
  character(id: string): Character { const row = this.db.prepare('SELECT * FROM characters WHERE id=?').get(id) as Row; if (!row) throw new AppError(404, 'Персонаж не найден.'); return this.characterRow(row); }
  saveCharacter(card: Card, summary: string, id: string = randomUUID()): Character {
    const time = new Date().toISOString();
    this.db.prepare('INSERT INTO characters(id,card,summary,created_at,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET card=excluded.card,summary=excluded.summary,updated_at=excluded.updated_at').run(id, JSON.stringify(card), summary, time, time);
    return this.character(id);
  }
  chat(id: string): Chat { const row = this.db.prepare('SELECT * FROM chats WHERE id=?').get(id) as Row; if (!row) throw new AppError(404, 'Чат не найден.'); return { id: row.id, characterId: row.character_id, title: row.title, createdAt: row.created_at, updatedAt: row.updated_at, persona:row.persona?JSON.parse(row.persona):undefined, generation:JSON.parse(row.generation), branchGroupId:row.branch_group, revision:row.revision }; }
  chats(): Chat[] {
    return (this.db.prepare(`SELECT c.*, ch.avatar, json_extract(ch.card,'$.data.name') AS name,
      (SELECT content FROM messages WHERE chat_id=c.id ORDER BY seq DESC LIMIT 1) AS last_message
      FROM chats c JOIN characters ch ON ch.id=c.character_id ORDER BY c.updated_at DESC, c.rowid DESC`).all() as Row[]).map(r => ({ id:r.id, characterId:r.character_id, title:r.title, avatar:r.avatar, characterName:r.name, createdAt:r.created_at, updatedAt:r.updated_at, lastMessage:r.last_message,personaName:r.persona?JSON.parse(r.persona).name:undefined,branchGroupId:r.branch_group,revision:r.revision }));
  }
  chatPage({limit,offset=0,query='',characterId='',sort='recent'}:{limit:number;offset?:number;query?:string;characterId?:string;sort?:string}) {
    const where:string[]=[],params:(string|number)[]=[];
    if(characterId){where.push('c.character_id=?');params.push(characterId);}
    if(query){where.push("instr(casefold(c.title||' '||json_extract(ch.card,'$.data.name')||' '||coalesce(json_extract(c.persona,'$.name'),'')||' '||coalesce((SELECT content FROM messages WHERE chat_id=c.id ORDER BY seq DESC LIMIT 1),'')),?)>0");params.push(query.toLocaleLowerCase('ru'));}
    const from=`FROM chats c JOIN characters ch ON ch.id=c.character_id ${where.length?'WHERE '+where.join(' AND '):''}`;
    const total=Number((this.db.prepare(`SELECT count(*) AS count ${from}`).get(...params) as Row).count);
    const order=sort==='name'?'casefold(c.title),c.rowid':sort==='oldest'?'c.updated_at,c.rowid':'c.updated_at DESC,c.rowid DESC';
    const rows=this.db.prepare(`SELECT c.id,c.character_id,c.title,c.created_at,c.updated_at,c.branch_group,c.revision,
      json_extract(c.persona,'$.name') AS persona_name,ch.avatar,json_extract(ch.card,'$.data.name') AS name,
      substr((SELECT content FROM messages WHERE chat_id=c.id ORDER BY seq DESC LIMIT 1),1,180) AS last_message
      ${from} ORDER BY ${order} LIMIT ? OFFSET ?`).all(...params,limit,offset) as Row[];
    const items=rows.map(row=>({id:row.id,characterId:row.character_id,title:row.title,createdAt:row.created_at,updatedAt:row.updated_at,
      branchGroupId:row.branch_group,revision:row.revision,avatar:row.avatar,characterName:row.name,lastMessage:row.last_message,personaName:row.persona_name}));
    return {items,total,offset,limit};
  }
  operation(chatId:string,requestId:string,kind:string,fingerprint:string):any|undefined {
    const row=this.db.prepare('SELECT fingerprint,result FROM operations WHERE chat_id=? AND request_id=? AND kind=?').get(chatId,requestId,kind) as Row|undefined;
    if(!row)return undefined;
    if(row.fingerprint!==fingerprint)throw new AppError(409,'Этот идентификатор запроса уже использован для другого действия.');
    return JSON.parse(row.result);
  }
  saveOperation(chatId:string,requestId:string,kind:string,fingerprint:string,result:unknown) {
    this.db.prepare('INSERT INTO operations VALUES(?,?,?,?,?) ON CONFLICT(chat_id,request_id,kind) DO UPDATE SET result=excluded.result').run(chatId,requestId,kind,fingerprint,JSON.stringify(result));
  }
  createChat(characterId: string, personaId?: string): Chat {
    const c = this.character(characterId), id = randomUUID(), time = new Date().toISOString();
    const persona=this.snapshot(personaId?this.persona(personaId):this.personas()[0]);
    return this.transaction(() => {
      this.db.prepare('INSERT INTO chats(id,character_id,title,created_at,updated_at,persona) VALUES(?,?,?,?,?,?)').run(id, characterId, c.card.data.name, time, time,JSON.stringify(persona));
      if (c.card.data.first_mes) this.addMessage(id, 'assistant', c.card.data.first_mes.replace(/\{\{char\}\}/gi, () => c.card.data.name).replace(/\{\{user\}\}/gi, () => persona.name));
      return this.chat(id);
    });
  }
  messagePage(chatId:string,{limit,before,after,anchor}:{limit:number;before?:string;after?:string;anchor?:string}) {
    let rows:Row[];
    const cursor=before||after||anchor;
    const seq=cursor?(this.db.prepare('SELECT seq FROM messages WHERE id=? AND chat_id=?').get(cursor,chatId) as Row|undefined)?.seq:undefined;
    if(cursor&&seq===undefined)throw new AppError(404,'Место в переписке не найдено.');
    if(anchor){
      const count=Number((this.db.prepare('SELECT count(*) AS n FROM messages WHERE chat_id=? AND seq<?').get(chatId,seq) as Row).n);
      rows=this.db.prepare('SELECT * FROM messages WHERE chat_id=? ORDER BY seq LIMIT ? OFFSET ?').all(chatId,limit,Math.max(0,count-10)) as Row[];
    } else if(after) rows=this.db.prepare('SELECT * FROM messages WHERE chat_id=? AND seq>? ORDER BY seq LIMIT ?').all(chatId,seq,limit) as Row[];
    else if(before) rows=(this.db.prepare('SELECT * FROM messages WHERE chat_id=? AND seq<? ORDER BY seq DESC LIMIT ?').all(chatId,seq,limit) as Row[]).reverse();
    else rows=(this.db.prepare('SELECT * FROM messages WHERE chat_id=? ORDER BY seq DESC LIMIT ?').all(chatId,limit) as Row[]).reverse();
    const hasMore=!!rows.length&&!!this.db.prepare('SELECT 1 FROM messages WHERE chat_id=? AND seq<? LIMIT 1').get(chatId,rows[0].seq);
    const hasNewer=!!rows.length&&!!this.db.prepare('SELECT 1 FROM messages WHERE chat_id=? AND seq>? LIMIT 1').get(chatId,rows.at(-1)!.seq);
    return {messages:this.messages(chatId,rows),hasMore,hasNewer};
  }
  messages(chatId: string, selectedRows?:Row[]): Message[] {
    const rows = selectedRows || this.db.prepare('SELECT * FROM messages WHERE chat_id=? ORDER BY seq').all(chatId) as Row[];
    if(!rows.length)return [];
    const variants = this.db.prepare(`SELECT v.id,v.message_id,v.status,v.model,v.created_at FROM message_variants v
      JOIN messages m ON m.id=v.message_id WHERE m.chat_id=? ${selectedRows?`AND m.id IN (${rows.map(()=>'?').join(',')})`:''} ORDER BY v.seq`).all(chatId,...(selectedRows?rows.map(r=>r.id):[])) as Row[];
    const grouped = new Map<string, MessageVariant[]>();
    for (const row of variants) {
      const list = grouped.get(row.message_id) || [];
      list.push({ id:row.id, status:row.status, model:row.model, createdAt:row.created_at }); grouped.set(row.message_id,list);
    }
    return rows.map(r=>({ id:r.id, chatId:r.chat_id, role:r.role, content:r.content, ...(r.role==='assistant'&&r.reasoning?{reasoning:r.reasoning}:{}), status:r.status, model:r.model, createdAt:r.created_at,
      ...(r.role==='assistant'?{selectedVariantId:r.selected_variant_id || null, variants:grouped.get(r.id) || []}:{}) }));
  }
  // Call inside the same transaction as the edit/selection so the backup and mutation are atomic.
  copyChat(chatId: string, throughId?: string, suffix = 'ветка'): Chat {
    const source = this.chat(chatId), messages = this.messages(chatId);
    const index = throughId ? messages.findIndex(m => m.id === throughId) : messages.length - 1;
    if (throughId && index < 0) throw new AppError(404, 'Сообщение не найдено.');
    const id = randomUUID(), time = new Date().toISOString(), group = source.branchGroupId || source.id;
    this.db.prepare('UPDATE chats SET branch_group=? WHERE id=?').run(group, source.id);
    this.db.prepare('INSERT INTO chats(id,character_id,title,created_at,updated_at,persona,generation,branch_group) VALUES(?,?,?,?,?,?,?,?)')
      .run(id, source.characterId, `${source.title.slice(0,90)} · ${suffix}`, time, time, JSON.stringify(source.persona || null), JSON.stringify(source.generation || {}), group);
    for (const message of messages.slice(0,index + 1)) {
      const messageId = randomUUID();
      this.db.prepare('INSERT INTO messages(id,chat_id,role,content,status,model,created_at,reasoning) VALUES(?,?,?,?,?,?,?,?)')
        .run(messageId,id,message.role,message.content,message.status==='streaming'?'stopped':message.status,message.model,message.createdAt,message.reasoning || '');
      const variants = this.db.prepare('SELECT * FROM message_variants WHERE message_id=? ORDER BY seq').all(message.id) as Row[];
      for (const variant of variants) {
        const variantId = randomUUID();
        this.db.prepare('INSERT INTO message_variants(id,message_id,content,status,model,created_at,reasoning) VALUES(?,?,?,?,?,?,?)')
          .run(variantId,messageId,variant.content,variant.status==='streaming'?'stopped':variant.status,variant.model,variant.created_at,variant.reasoning || '');
        if (variant.id === message.selectedVariantId) this.db.prepare('UPDATE messages SET selected_variant_id=? WHERE id=?').run(variantId,messageId);
      }
    }
    return this.chat(id);
  }
  beginVariant(message: Message, content: string, model: string, variantId: string, reasoning = '') {
    if (!message.selectedVariantId) {
      this.db.prepare('INSERT INTO message_variants(id,message_id,content,status,model,created_at,reasoning) VALUES(?,?,?,?,?,?,?)')
        .run(randomUUID(),message.id,message.content,message.status,message.model,message.createdAt,message.reasoning||'');
    }
    const time = new Date().toISOString();
    this.db.prepare('INSERT INTO message_variants(id,message_id,content,status,model,created_at,reasoning) VALUES(?,?,?,?,?,?,?)')
      .run(variantId,message.id,content,'streaming',model,time,reasoning);
    this.db.prepare("UPDATE messages SET content=?,reasoning=?,status='streaming',model=?,created_at=?,selected_variant_id=? WHERE id=?")
      .run(content,reasoning,model,time,variantId,message.id);
  }
  updateMessage(id: string, content: string, status: Message['status'], reasoning?: string) {
    this.transaction(() => {
      if (reasoning===undefined) {
        this.db.prepare('UPDATE messages SET content=?,status=? WHERE id=?').run(content,status,id);
        this.db.prepare('UPDATE message_variants SET content=?,status=? WHERE id=(SELECT selected_variant_id FROM messages WHERE id=?)').run(content,status,id);
      } else {
        this.db.prepare('UPDATE messages SET content=?,reasoning=?,status=? WHERE id=?').run(content,reasoning,status,id);
        this.db.prepare('UPDATE message_variants SET content=?,reasoning=?,status=? WHERE id=(SELECT selected_variant_id FROM messages WHERE id=?)').run(content,reasoning,status,id);
      }
    });
  }
  selectVariant(messageId: string, variantId: string) {
    const variant = this.db.prepare('SELECT * FROM message_variants WHERE id=? AND message_id=?').get(variantId,messageId) as Row | undefined;
    if (!variant) throw new AppError(404,'Вариант ответа не найден.');
    this.db.prepare('UPDATE messages SET content=?,reasoning=?,status=?,model=?,created_at=?,selected_variant_id=? WHERE id=?')
      .run(variant.content,variant.reasoning||'',variant.status,variant.model,variant.created_at,variant.id,messageId);
  }
  addMessage(chatId: string, role: Message['role'], content: string, status: Message['status'] = 'complete', model: string | null = null, id: string = randomUUID()): Message {
    const time = new Date().toISOString();
    this.db.prepare('INSERT INTO messages(id,chat_id,role,content,status,model,created_at) VALUES(?,?,?,?,?,?,?)').run(id,chatId,role,content,status,model,time);
    this.touch(chatId);
    return { id,chatId,role,content,status,model,createdAt:time };
  }
  touch(id: string) { this.db.prepare('UPDATE chats SET updated_at=?,revision=revision+1 WHERE id=?').run(new Date().toISOString(),id); }
  close() { this.db.close(); }
}
