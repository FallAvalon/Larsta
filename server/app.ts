import express from 'express';
import multer from 'multer';
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { isIP } from 'node:net';
import path from 'node:path';
import { z, ZodError } from 'zod';
import { Store } from './store.js';
import { Secrets } from './secrets.js';
import { AppError, parseCard, personaSchema, settingsSchema } from './domain.js';
import { buildContext, withPersona } from './context.js';
import { RouterClient } from './openrouter.js';
import { Providers } from './providers.js';
import type { Fetcher } from './provider-client.js';
import { supportsParameter } from '../shared/types.js';
import { GenerationStreams } from './generations.js';
import { createBackup, listBackups, verifyBackup } from './backups.js';
import { translate } from '../shared/translations.js';

export function addresses(port: number) {
  const privateIP=(ip:string)=>ip.startsWith('192.168.')||ip.startsWith('10.')||/^172\.(1[6-9]|2\d|3[01])\./.test(ip);
  const ips=Object.values(networkInterfaces()).flatMap(list=>(list||[]).filter(i=>i.family==='IPv4'&&!i.internal).map(i=>i.address)).sort((a,b)=>Number(privateIP(b))-Number(privateIP(a)));
  return [`http://localhost:${port}`, ...ips.map(ip=>`http://${ip}:${port}`)];
}
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const sessionAge = 30*24*3600*1000;
export function createApp({ dataDir, router, fetcher=fetch, port = 3000 }: {dataDir:string; router?:RouterClient; fetcher?:Fetcher; port?:number}) {
  const store = new Store(dataDir), secrets = new Secrets(dataDir), app = express();
  const providers=new Providers(store,secrets,fetcher,router);
  const active = new Map<string,AbortController>();
  const streams = new GenerationStreams();
  const pageLimit=(req:express.Request)=>z.coerce.number().int().min(1).max(100).optional().parse(req.query.limit);
  const requestId=(req:express.Request)=>z.string().min(8).max(100).regex(/^[a-zA-Z0-9_-]+$/).optional().parse(req.body.requestId);
  const attempts = new Map<string,{count:number;at:number}>();
  const uploads = path.join(dataDir,'uploads'); mkdirSync(uploads,{recursive:true});
  app.disable('x-powered-by');
  app.use((req,res,next)=>{
    res.locals.language=req.headers['accept-language']?.toLowerCase().startsWith('en')?'en':'ru';
    const send=res.json.bind(res);res.json=((body:unknown)=>{
      if(res.statusCode>=400&&body&&typeof body==='object'&&'error' in body&&typeof body.error==='string')body={...body,error:translate(body.error,res.locals.language)};
      return send(body);
    }) as typeof res.json;next();
  });
  app.use((req,res,next)=>{
    let hostname: string;
    try { hostname = new URL(`http://${req.headers.host}`).hostname.replace(/^\[|\]$/g,''); } catch { return res.status(400).json({error:'Неверный адрес сервера.'}); }
    if(hostname !== 'localhost' && !isIP(hostname)) return res.status(403).json({error:'Используйте localhost или IP-адрес домашнего сервера.'});
    res.setHeader('X-Content-Type-Options','nosniff'); res.setHeader('Referrer-Policy','no-referrer'); res.setHeader('X-Frame-Options','DENY');
    if(req.path.startsWith('/api') || req.path.startsWith('/uploads')) res.setHeader('Cache-Control','no-store');
    if(!['GET','HEAD','OPTIONS'].includes(req.method) && req.headers.origin && req.headers.origin !== `http://${req.headers.host}` && req.headers.origin !== `https://${req.headers.host}`) return res.status(403).json({error:'Запрос с другого сайта запрещён.'});
    next();
  });
  app.use(express.json({limit:'2mb'}));
  const authenticated: express.RequestHandler = (req,res,next)=>{
    const token = /(?:^|;\s*)larsta_session=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie||'')?.[1];
    if(!token || !store.db.prepare('SELECT 1 FROM sessions WHERE hash=? AND expires>?').get(hash(token),Date.now())) return res.status(401).json({error:'Введите код подключения из окна сервера.'});
    next();
  };
  app.get('/api/auth',authenticated,(_req,res)=>res.json({authenticated:true}));
  app.post('/api/auth', (req,res)=>{
    const ip = req.socket.remoteAddress || 'unknown', now = Date.now(), previous = attempts.get(ip);
    const attempt = previous && now-previous.at < 900_000 ? previous : {count:0,at:now};
    if(attempt.count>=5) return res.status(429).json({error:'Слишком много попыток. Повторите подключение через 15 минут.'});
    const code = typeof req.body?.code === 'string' ? req.body.code : '';
    if(!/^\d{8}$/.test(code) || !timingSafeEqual(Buffer.from(code),Buffer.from(secrets.connectionCode))) {
      attempt.count++; attempts.set(ip,attempt);
      // Bound this in-memory rate limiter even on an untrusted LAN.
      if(attempts.size>1000) for(const [k,v] of attempts) if(now-v.at>900_000) attempts.delete(k);
      return res.status(401).json({error:'Код не подошёл. Посмотрите код в окне запущенного сервера.'});
    }
    attempts.delete(ip); const token = randomBytes(32).toString('hex');
    store.db.prepare('DELETE FROM sessions WHERE expires < ?').run(now);
    store.db.prepare('INSERT INTO sessions VALUES(?,?)').run(hash(token), now+sessionAge);
    res.cookie('larsta_session',token,{httpOnly:true,sameSite:'strict',maxAge:sessionAge,path:'/'}).json({ok:true});
  });
  app.use('/api',authenticated);
  app.use('/uploads',authenticated,express.static(uploads,{dotfiles:'deny',maxAge:0}));
  app.post('/api/logout',(req,res)=>{ const token = /larsta_session=([a-f0-9]{64})/.exec(req.headers.cookie||'')?.[1]; if(token) store.db.prepare('DELETE FROM sessions WHERE hash=?').run(hash(token)); res.clearCookie('larsta_session',{path:'/'}).json({ok:true}); });
  app.get('/api/connection',(_req,res)=>res.json({urls:addresses(port)}));
  app.get('/api/backups',(_req,res)=>res.json(listBackups(dataDir).map(({id,createdAt,reason,files})=>({id,createdAt,reason,bytes:files.reduce((sum,file)=>sum+file.bytes,0)}))));
  app.post('/api/backups',(_req,res)=>{
    if(active.size)throw new AppError(409,'Дождитесь завершения ответов перед созданием копии.');
    const {id,createdAt,reason,files}=createBackup(dataDir,store.db);
    res.status(201).json({id,createdAt,reason,bytes:files.reduce((sum,file)=>sum+file.bytes,0)});
  });
  app.post('/api/backups/:id/verify',(req,res)=>{verifyBackup(dataDir,req.params.id);res.json({ok:true});});
  app.get('/api/providers',(_req,res)=>res.json(providers.list()));
  app.post('/api/providers',(req,res)=>res.status(201).json(providers.save(req.body)));
  app.put('/api/providers/:id',(req,res)=>res.json(providers.save(req.body,req.params.id)));
  app.delete('/api/providers/:id',(req,res)=>{providers.remove(req.params.id,z.coerce.number().int().positive().parse(req.query.revision));res.json({ok:true});});
  app.post('/api/providers/test',async(req,res)=>{
    if(providers.busy.size>=6)throw new AppError(429,'Дождитесь завершения текущих проверок и ответов.');
    const generation=req.body.generation===true,controller=new AbortController(),operation=randomUUID();
    providers.busy.set(operation,typeof req.body.id==='string'?req.body.id:'draft');
    if(generation)active.set(operation,controller);
    res.once('close',()=>controller.abort());
    try{const result=await providers.probe(req.body,generation,store.settings().clientProfile,controller.signal);if(result.warning)result.warning=translate(result.warning,res.locals.language);if(!res.destroyed)res.json(result);}
    catch(e){if(e instanceof Error&&e.name==='TimeoutError')throw new AppError(504,'Время ожидания проверки истекло. Проверьте адрес сервера и модель.');throw e;}
    finally{providers.busy.delete(operation);active.delete(operation);}
  });
  app.get('/api/settings',(_req,res)=>res.json({...store.settings(),hasApiKey:!!secrets.apiKey}));
  app.put('/api/settings',(req,res)=>{
    const input = settingsSchema.parse({...req.body,providerId:req.body.providerId??store.settings().providerId});
    const selectedProvider=store.provider(input.providerId);
    const apiKey = z.string().trim().max(1024).optional().parse(req.body.apiKey);
    if(apiKey?.includes('\n') || apiKey?.includes('\r')) throw new AppError(400,'API-ключ должен занимать одну строку.');
    if(apiKey !== undefined && apiKey !== '') secrets.setKey(apiKey);
    if(req.body.clearApiKey === true) { if(process.env.OPENROUTER_API_KEY) throw new AppError(400,'Ключ задан переменной окружения сервера. Удалите её и перезапустите сервер.'); secrets.setKey(''); }
    store.transaction(()=>{store.saveSettings(input);if(selectedProvider.lastModel!==input.mainModel)store.saveProvider({...selectedProvider,lastModel:input.mainModel,revision:selectedProvider.revision+1});});res.json({...input,hasApiKey:!!secrets.apiKey});
  });
  app.get('/api/models',async(req,res)=>res.json(await providers.models(z.string().max(100).default(store.settings().providerId).parse(req.query.providerId),req.query.refresh==='1')));
  const unlocked = (id:string)=>{ if(active.has(id)) throw new AppError(409,'В этом чате идёт генерация. Сначала остановите её.'); };
  const checkRevision = (chat: ReturnType<Store['chat']>, body: Record<string,unknown>) => {
    if (body.expectedRevision !== undefined && z.number().int().parse(body.expectedRevision) !== chat.revision) throw new AppError(409,'Чат изменился на другом устройстве. Обновите переписку.');
  };
  const characterUnlocked = (id:string)=>{ for(const c of store.chats().filter(c=>c.characterId===id)) unlocked(c.id); };
  app.get('/api/characters',(req,res)=>res.json(req.query.compact==='1'?store.characterSummaries():store.characters()));
  app.get('/api/characters/:id',(req,res)=>res.json(store.character(req.params.id)));
  app.post('/api/characters',(req,res)=>{
    const card = parseCard(req.body.card); const summary = z.string().max(600).parse(req.body.summary || '');
    res.status(201).json(store.saveCharacter(card,summary));
  });
  app.post('/api/characters/import',(req,res)=>{
    const card = parseCard(req.body); const ext = card.data.extensions.larsta;
    const summary = ext && typeof ext==='object' && 'summary' in ext && typeof ext.summary==='string' ? ext.summary.slice(0,600) : card.data.description.slice(0,180);
    res.status(201).json(store.saveCharacter(card,summary));
  });
  app.get('/api/characters/:id/export',(req,res)=>{
    const c = store.character(req.params.id); const old = c.card.data.extensions.larsta;
    const card = {...c.card, data:{...c.card.data,extensions:{...c.card.data.extensions,larsta:{...(old && typeof old==='object' ? old : {}),summary:c.summary}}}};
    res.attachment('character-v2.json').json(card);
  });
  app.put('/api/characters/:id',(req,res)=>{
    store.character(req.params.id); characterUnlocked(req.params.id);
    res.json(store.saveCharacter(parseCard(req.body.card),z.string().max(600).parse(req.body.summary||''),req.params.id));
  });
  app.patch('/api/characters/:id/favorite',(req,res)=>{store.character(req.params.id); store.db.prepare('UPDATE characters SET favorite=? WHERE id=?').run(z.boolean().parse(req.body.favorite)?1:0,req.params.id);res.json(store.character(req.params.id));});
  app.delete('/api/characters/:id',(req,res)=>{ store.character(req.params.id); characterUnlocked(req.params.id); store.db.prepare('DELETE FROM characters WHERE id=?').run(req.params.id);res.json({ok:true}); });
  const upload = multer({storage:multer.memoryStorage(), limits:{fileSize:8*1024*1024,files:1,fields:0}});
  function saveAvatar(req:express.Request) {
    const b = req.file?.buffer;
    if(!b) throw new AppError(400,'Выберите изображение PNG, JPEG, GIF или WebP до 8 МБ.');
    const ext = b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ? 'png' : b[0]===255&&b[1]===216&&b[2]===255 ? 'jpg' : /^GIF8[79]a$/.test(b.subarray(0,6).toString()) ? 'gif' : b.subarray(0,4).toString()==='RIFF'&&b.subarray(8,12).toString()==='WEBP' ? 'webp' : null;
    if(!ext) throw new AppError(400,'Неподдерживаемое изображение. Используйте PNG, JPEG, GIF или WebP; SVG запрещён.');
    const filename = `${randomUUID()}.${ext}`; writeFileSync(path.join(uploads,filename),b);
    return `/uploads/${filename}`;
  }
  app.post('/api/characters/:id/avatar',upload.single('avatar'),(req,res)=>{
    const characterId=String(req.params.id);store.character(characterId);const avatar=saveAvatar(req);
    store.db.prepare('UPDATE characters SET avatar=? WHERE id=?').run(avatar,characterId);res.json(store.character(characterId));
  });
  app.get('/api/personas',(_req,res)=>res.json(store.personas()));
  app.post('/api/personas',(req,res)=>res.status(201).json(store.savePersona({...personaSchema.parse(req.body),avatar:null})));
  app.put('/api/personas/:id',(req,res)=>{const p=store.persona(req.params.id);res.json(store.savePersona({...personaSchema.parse(req.body),avatar:p.avatar},p.id));});
  app.post('/api/personas/:id/default',(req,res)=>res.json(store.defaultPersona(req.params.id)));
  app.delete('/api/personas/:id',(req,res)=>{store.deletePersona(req.params.id);res.json({ok:true});});
  app.post('/api/personas/:id/avatar',upload.single('avatar'),(req,res)=>{const p=store.persona(String(req.params.id));res.json(store.savePersona({...p,avatar:saveAvatar(req)},p.id));});
  app.put('/api/chats/:id/persona',(req,res)=>{
    const chat=store.chat(req.params.id);unlocked(chat.id);checkRevision(chat,req.body);
    const sourceId=z.string().nullable().optional().parse(req.body.sourceId);
    let avatar=chat.persona?.avatar||null;
    if(sourceId&&sourceId!==chat.persona?.sourceId)avatar=store.persona(sourceId).avatar;
    else if(sourceId){const source=store.personas().find(p=>p.id===sourceId);if(source)avatar=source.avatar;}
    const value=req.body.personaId!==undefined?store.snapshot(store.persona(z.string().parse(req.body.personaId))):{...personaSchema.parse(req.body),avatar,sourceId:sourceId===undefined?chat.persona?.sourceId||null:sourceId};
    store.db.prepare('UPDATE chats SET persona=?,updated_at=? WHERE id=?').run(JSON.stringify(value),new Date().toISOString(),chat.id);
    store.touch(chat.id);
    res.json(store.chat(chat.id));
  });
  app.get('/api/chats',(req,res)=>{
    const limit=pageLimit(req);
    res.json(limit?store.chatPage({limit,offset:z.coerce.number().int().min(0).max(1_000_000).default(0).parse(req.query.offset),query:z.string().max(300).default('').parse(req.query.q),characterId:z.string().max(100).default('').parse(req.query.characterId),sort:z.enum(['recent','oldest','name']).default('recent').parse(req.query.sort)}):store.chats());
  });
  app.post('/api/chats',(req,res)=>res.status(201).json(store.createChat(z.string().parse(req.body.characterId),z.string().optional().parse(req.body.personaId))));
  app.get('/api/chats/:id',(req,res)=>{
    const chat=store.chat(req.params.id),limit=pageLimit(req);
    const page=limit?store.messagePage(chat.id,{limit,before:z.string().optional().parse(req.query.before),after:z.string().optional().parse(req.query.after),anchor:z.string().optional().parse(req.query.anchor)}):{messages:store.messages(chat.id),hasMore:false,hasNewer:false};
    const latestMessageId=(store.db.prepare('SELECT id FROM messages WHERE chat_id=? ORDER BY seq DESC LIMIT 1').get(chat.id) as {id:string}|undefined)?.id;
    res.json({chat,...page,latestMessageId,generating:active.has(chat.id),supportsVariants:true});
  });
  const completed=(req:express.Request,res:express.Response,status='complete')=>{
    const chat=store.chat(String(req.params.id)),limit=pageLimit(req);
    const page=limit?store.messagePage(chat.id,{limit}):{messages:store.messages(chat.id),hasMore:false,hasNewer:false};
    res.status(200).set({'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-cache, no-transform','X-Accel-Buffering':'no'});
    res.end(`event: done\ndata: ${JSON.stringify({status,chat,...page,latestMessageId:page.messages.at(-1)?.id})}\n\n`);
  };
  app.get('/api/chats/:id/events',(req,res)=>{
    store.chat(req.params.id);
    if(!streams.subscribe(req.params.id,res,pageLimit(req)))completed(req,res);
  });
  app.patch('/api/chats/:id',(req,res)=>{const chat=store.chat(req.params.id);unlocked(chat.id);checkRevision(chat,req.body);store.db.prepare('UPDATE chats SET title=? WHERE id=?').run(z.string().trim().min(1).max(120).parse(req.body.title),chat.id);store.touch(chat.id);res.json(store.chat(chat.id));});
  app.put('/api/chats/:id/generation',(req,res)=>{
    const chat=store.chat(req.params.id);unlocked(chat.id);checkRevision(chat,req.body);
    const generation=z.object({providerId:z.string().min(1).max(100).optional(),mainModel:z.string().trim().min(1).max(500).optional(),temperature:z.number().min(0).max(2).optional(),maxTokens:z.number().int().min(64).max(32768).optional()}).strict().parse(req.body.generation);
    if(generation.mainModel&&!generation.providerId)generation.providerId='openrouter';
    if(generation.providerId){store.provider(generation.providerId);if(!generation.mainModel)throw new AppError(400,'Выберите модель для этого провайдера.');}
    store.db.prepare('UPDATE chats SET generation=? WHERE id=?').run(JSON.stringify(generation),chat.id);store.touch(chat.id);res.json(store.chat(chat.id));
  });
  app.get('/api/chats/:id/branches',(req,res)=>{
    const chat=store.chat(req.params.id), group=chat.branchGroupId||chat.id;
    res.json(store.chats().filter(c=>c.id===group||c.branchGroupId===group));
  });
  app.post('/api/chats/:id/fork',(req,res)=>{
    const chat=store.chat(req.params.id);unlocked(chat.id);checkRevision(chat,req.body);
    const messageId=z.string().optional().parse(req.body.messageId);
    res.status(201).json(store.transaction(()=>store.copyChat(chat.id,messageId)));
  });
  app.post('/api/chats/:id/undo',(req,res)=>{
    const limit=pageLimit(req);
    const chat=store.chat(req.params.id);unlocked(chat.id);checkRevision(chat,req.body);
    const messages=store.messages(chat.id);
    if(!messages.length||messages.at(-1)?.id!==req.body.expectedLastId)throw new AppError(409,'Чат изменился. Обновите переписку.');
    const user=[...messages].reverse().find(m=>m.role==='user');
    if(!user)throw new AppError(400,'В этом чате ещё нет хода для отката.');
    const backup=store.transaction(()=>{
      const saved=store.copyChat(chat.id,undefined,'до отката');
      store.db.prepare('DELETE FROM messages WHERE chat_id=? AND seq>=(SELECT seq FROM messages WHERE id=?)').run(chat.id,user.id);
      store.touch(chat.id);return saved;
    });
    const page=limit?store.messagePage(chat.id,{limit}):{messages:store.messages(chat.id),hasMore:false,hasNewer:false};
    res.json({chat:store.chat(chat.id),...page,latestMessageId:page.messages.at(-1)?.id,draft:user.content,backup});
  });
  app.delete('/api/chats/:id',(req,res)=>{unlocked(req.params.id);store.db.prepare('DELETE FROM chats WHERE id=?').run(req.params.id);res.json({ok:true});});
  app.post('/api/chats/:id/messages',(req,res)=>{
    const chat=store.chat(req.params.id),key=requestId(req),content=z.string().trim().min(1).max(50000).parse(req.body.content),fingerprint=hash(content);
    const previous=key?store.operation(chat.id,key,'message',fingerprint):undefined;
    if(previous)return res.status(200).json(previous);
    unlocked(chat.id);checkRevision(chat,req.body);
    const result=store.transaction(()=>{
      const message=store.addMessage(chat.id,'user',content),result={...message,chatRevision:store.chat(chat.id).revision};
      if(key)store.saveOperation(chat.id,key,'message',fingerprint,result);
      return result;
    });
    res.status(201).json(result);
  });
  app.patch('/api/chats/:id/messages/:messageId',(req,res)=>{
    const limit=pageLimit(req);
    checkRevision(store.chat(req.params.id),req.body);unlocked(req.params.id);
    const messages = store.messages(req.params.id), index = messages.findIndex(m=>m.id===req.params.messageId);
    if(index<0) throw new AppError(404,'Сообщение не найдено.');
    if(index<messages.length-1 && req.body.confirmTruncate!==true) throw new AppError(409,'Изменение удалит все последующие сообщения. Подтвердите удаление.');
    const content = z.string().trim().min(1).max(50000).parse(req.body.content);
    store.transaction(()=>{
      store.copyChat(req.params.id,undefined,'до правки');
      store.db.prepare("UPDATE messages SET content=?,status='complete' WHERE id=?").run(content,req.params.messageId);
      store.db.prepare("UPDATE message_variants SET content=?,status='complete' WHERE id=(SELECT selected_variant_id FROM messages WHERE id=?)").run(content,req.params.messageId);
      store.db.prepare('DELETE FROM messages WHERE chat_id=? AND seq>(SELECT seq FROM messages WHERE id=?)').run(req.params.id,req.params.messageId);store.touch(req.params.id);
    });res.json(limit?store.messagePage(req.params.id,{limit}).messages:store.messages(req.params.id));
  });
  app.post('/api/chats/:id/messages/:messageId/variant',(req,res)=>{
    const limit=pageLimit(req);
    checkRevision(store.chat(req.params.id),req.body); unlocked(req.params.id);
    const messages=store.messages(req.params.id),index=messages.findIndex(m=>m.id===req.params.messageId),message=messages[index];
    if(!message || message.role!=='assistant') throw new AppError(404,'Ответ персонажа не найден.');
    if(messages.at(-1)?.id!==req.body.expectedLastId || (message.selectedVariantId??null)!==req.body.expectedVariantId) throw new AppError(409,'Чат или выбранный вариант изменился на другом устройстве. Обновите переписку.');
    const variantId=z.string().min(1).max(100).parse(req.body.variantId);
    if(!message.variants?.some(v=>v.id===variantId)) throw new AppError(404,'Вариант ответа не найден.');
    if(variantId!==message.selectedVariantId){
      if(index<messages.length-1 && req.body.confirmTruncate!==true) throw new AppError(409,'Смена старого ответа удалит все последующие сообщения. Подтвердите удаление.');
      store.transaction(()=>{
        if(index<messages.length-1)store.copyChat(req.params.id,undefined,'другое продолжение');
        store.selectVariant(message.id,variantId);
        store.db.prepare('DELETE FROM messages WHERE chat_id=? AND seq>(SELECT seq FROM messages WHERE id=?)').run(req.params.id,message.id);
        store.touch(req.params.id);
      });
    }
    res.json(limit?store.messagePage(req.params.id,{limit}).messages:store.messages(req.params.id));
  });
  app.get('/api/chats/:id/messages/:messageId/variants',(req,res)=>{
    store.chat(req.params.id);
    if(!store.messages(req.params.id).some(m=>m.id===req.params.messageId))throw new AppError(404,'Сообщение не найдено.');
    res.json(store.db.prepare('SELECT id,content,reasoning,status,model,created_at AS createdAt,provider_id AS providerId,provider_name AS providerName FROM message_variants WHERE message_id=? ORDER BY seq').all(req.params.messageId));
  });
  app.post('/api/chats/:id/stop',(req,res)=>{active.get(req.params.id)?.abort('user');res.json({ok:true});});
  app.post('/api/chats/:id/generate',async(req,res)=>{
    const limit=pageLimit(req);
    const chat = store.chat(req.params.id),key=requestId(req);
    const fingerprint=hash(JSON.stringify({mode:req.body.mode||'reply',wish:req.body.wish||'',last:req.body.expectedLastId,target:req.body.targetMessageId,variant:req.body.expectedVariantId,confirm:req.body.confirmTruncate}));
    const previous=key?store.operation(chat.id,key,'generate',fingerprint):undefined;
    if(previous){
      if(previous.status==='interrupted')throw new AppError(409,'Сервер был перезапущен во время этой попытки. Обновите чат и явно запросите новый ответ.');
      if(previous.status==='running'){
        if(!streams.subscribe(chat.id,res,limit))throw new AppError(409,'Попытка уже завершилась. Обновите чат.');
      } else if(previous.httpStatus)res.status(previous.httpStatus).json({error:previous.error});
      else completed(req,res,previous.status);
      return;
    }
    unlocked(chat.id);checkRevision(chat,req.body);
    const settings = withPersona({...store.settings(),...chat.generation},chat.persona); if(!settings.mainModel) throw new AppError(400,'Выберите основную модель в настройках. Ваша реплика сохранена.');
    const {provider,key:providerKey,client}=providers.resolve(settings.providerId);
    const origin={providerId:provider.id,providerName:provider.name};
    const mode=z.enum(['reply','regenerate','continue']).parse(req.body.mode||'reply');
    const wish=z.string().trim().max(1200).default('').parse(req.body.wish);
    if(wish&&mode!=='regenerate')throw new AppError(400,'Пожелание доступно при перегенерации ответа.');
    const allMessages = store.messages(chat.id); let history = allMessages; const last = history.at(-1);
    if(!last || last.id!==req.body.expectedLastId) throw new AppError(409,'Чат изменился на другом устройстве. Обновите переписку перед генерацией.');
    const replace = mode==='continue'?last:mode==='regenerate' ? allMessages.find(m=>m.id===(req.body.targetMessageId || last.id)) : null;
    if(mode!=='reply' && (!replace || replace.role!=='assistant')) throw new AppError(400,'Выберите ответ персонажа.');
    if(mode==='continue'&&!last.content.trim())throw new AppError(400,'В ответе пока нет текста для продолжения.');
    if(replace) {
      if((replace.selectedVariantId??null)!==(req.body.expectedVariantId??null)) throw new AppError(409,'Выбранный вариант изменился. Обновите переписку.');
      const index=allMessages.findIndex(m=>m.id===replace.id);
      if(index<allMessages.length-1 && req.body.confirmTruncate!==true) throw new AppError(409,'Перегенерация старого ответа удалит все последующие сообщения. Подтвердите удаление.');
      if(mode==='regenerate')history=allMessages.slice(0,index);
    }
    if(mode!=='continue'&&history.at(-1)?.role!=='user') throw new AppError(400,'Для ответа нужна последняя реплика пользователя.');
    const controller = new AbortController();
    if(key)store.saveOperation(chat.id,key,'generate',fingerprint,{status:'running'});
    active.set(chat.id,controller);streams.begin(chat.id);
    providers.busy.set(chat.id,provider.id);
    // Allow slow reasoning models up to 15 minutes. OpenRouter can still enforce its own upstream idle timeout.
    const timeout = setTimeout(()=>controller.abort('timeout'),900_000);
    const id = replace?.id || randomUUID(), variantId=randomUUID(); let content = mode==='continue'?last.content:'', reasoning = '', inserted = false, status: 'complete'|'stopped'|'error' = 'complete', lastSave = 0;
    let failure:{httpStatus?:number;error?:string}={};
    const emit = (event:string,value:Record<string,unknown>)=>streams.publish(chat.id,event,value);
    try {
      const model=client.peekModels().find(m=>m.id===settings.mainModel);
      if(controller.signal.aborted) throw new Error('Aborted');
      const instruction=mode==='continue'?'Continue your last response as the character. Return only new text to append to the existing response, with any necessary leading space or newline. Do not repeat earlier text or decide the user\'s actions. Use the language of the conversation.':wish?`User guidance for this response variant (this attempt only):\n${wish}`:'';
      const context = buildContext(settings,store.character(chat.characterId).card,history,model,{instruction,continuation:mode==='continue'});
      streams.subscribe(chat.id,res,limit);
      emit('start',{id,model:settings.mainModel,...origin,omitted:context.omitted,contextBytes:context.estimatedBytes,contextLimit:context.contextLimit,replaceMessageId:replace?.id || null,content:mode==='continue'?last.content:''});
      const body: Record<string,unknown> = {model:settings.mainModel,messages:context.messages};
      if(supportsParameter(model,'max_tokens')||model?.supported_parameters.includes('max_completion_tokens')) body[model?.parametersKnown&& !model.supported_parameters.includes('max_tokens')&&model.supported_parameters.includes('max_completion_tokens')?'max_completion_tokens':'max_tokens'] = context.maxTokens;
      if(supportsParameter(model,'temperature')) body.temperature=settings.temperature;
      if(settings.reasoningEffort!=='auto' && (supportsParameter(model,'reasoning')||model?.supported_parameters.includes('reasoning_effort'))) body.reasoning={effort:settings.reasoningEffort};
      await client.stream(providerKey,body,controller.signal,delta=>{
        content += delta;
        if(Buffer.byteLength(content)>2_000_000) {controller.abort('limit');throw new AppError(502,'Ответ превысил допустимый размер. Полученная часть сохранена.');}
        if(!inserted) store.transaction(()=>{
          if(replace) {
            if(allMessages.at(-1)?.id!==replace.id)store.copyChat(chat.id,undefined,'другое продолжение');
            store.beginVariant(replace,content,settings.mainModel,variantId,reasoning,origin);
            store.db.prepare('DELETE FROM messages WHERE chat_id=? AND seq>(SELECT seq FROM messages WHERE id=?)').run(chat.id,replace.id);
          } else store.addMessage(chat.id,'assistant',content,'streaming',settings.mainModel,id,origin);
          inserted=true;
        });
        if(Date.now()-lastSave>250) {store.updateMessage(id,content,'streaming',reasoning);lastSave=Date.now();}
        emit('delta',{content:delta});
      },delta=>{
        reasoning += delta;
        if(Buffer.byteLength(reasoning)>2_000_000) {controller.abort('limit');throw new AppError(502,'Размышление модели превысило допустимый размер. Полученная часть сохранена.');}
        if(inserted && Date.now()-lastSave>250) {store.updateMessage(id,content,'streaming',reasoning);lastSave=Date.now();}
        emit('reasoning',{content:delta});
      },settings.clientProfile);
    } catch(e) {
      status = controller.signal.aborted && ['user','disconnect'].includes(controller.signal.reason) ? 'stopped' : 'error';
      const message = controller.signal.reason==='timeout' ? 'Время ожидания ответа истекло. Полученная часть сохранена.' : e instanceof AppError ? e.message : 'Поток прерван. Полученная часть и ваша реплика сохранены.';
      if(!res.headersSent) { failure={httpStatus:e instanceof AppError&&e.status!==401 ? e.status : 502,error:message};if(!res.destroyed)res.status(failure.httpStatus!).json({error:message,...(e instanceof AppError?{code:e.code,upstreamStatus:e.upstreamStatus}:{})}); }
      if(status==='error') emit('error',{message});
    } finally {
      clearTimeout(timeout);
      try {
        // Preserve a new reasoning-only attempt without replacing an existing answer or deleting descendants.
        if(!inserted && !replace && reasoning){store.addMessage(chat.id,'assistant','',status,settings.mainModel,id,origin);inserted=true;}
        if(inserted) {store.updateMessage(id,content,status,reasoning);store.touch(chat.id);}
      } finally {active.delete(chat.id);providers.busy.delete(chat.id);}
      if(key)store.saveOperation(chat.id,key,'generate',fingerprint,{status,...failure,messageId:inserted?id:null});
      streams.finish(chat.id,{status,messages:store.messages(chat.id),chat:store.chat(chat.id)});
    }
  });
  app.use('/api',(_req,res)=>res.status(404).json({error:'Метод API не найден.'}));
  const errors: express.ErrorRequestHandler = (err,_req,res,_next)=>{
    if(res.headersSent) {res.end();return;}
    const message = err instanceof AppError ? err.message : err instanceof ZodError ? `Проверьте поле «${err.issues[0].path.join('.')}»: неверный тип или допустимый диапазон.` : err instanceof multer.MulterError ? 'Не удалось загрузить файл. Допустимо одно изображение до 8 МБ.' : err.type==='entity.too.large' ? 'Файл или запрос слишком большой. Максимум JSON — 2 МБ.' : err instanceof SyntaxError ? 'Некорректный JSON. Проверьте синтаксис файла.' : 'Внутренняя ошибка сервера. Данные уже сохранённых сообщений не потеряны.';
    res.status(err instanceof AppError ? err.status : err instanceof ZodError || err instanceof SyntaxError || err instanceof multer.MulterError || err.type==='entity.too.large' ? 400 : 500).json({error:message,...(err instanceof AppError?{code:err.code,upstreamStatus:err.upstreamStatus}:{})});
  };
  app.use(errors);
  return {app,store,secrets,active,providers};
}
