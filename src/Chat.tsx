import { t, uiLocale, uiLanguage } from './i18n';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowLeft, MessageSquare, Pencil, RefreshCw, ArrowUp, Square, Trash2, Settings as SettingsIcon, ChevronDown, ArrowDown, MoreHorizontal, UserRound, Undo2, GitBranch, SlidersHorizontal } from 'lucide-react';
import MessageMarkdown from './MessageMarkdown';
import ThinkingBlock from './ThinkingBlock';
import { TextEditor } from './TextEditor';
import MessageActions, { MessageActionPanel } from './MessageActions';
import { ToolPanel, ToolPanelAnchorContext } from './ToolPanel';
import { Presence, useMotionEnabled } from './motion';
import type { Character, Chat as ChatType, Message, Settings } from '../shared/types';
import { api, copyText, json, operationId, readStream } from './api';
import { Avatar, ErrorBox, Loading } from './components';
import ChatAppearanceSettings from './ChatAppearance';
import { ChatPersonaPanel, PersonaAvatar } from './Personas';
import { appearanceStyle, useChatAppearance } from './appearance';
import { BranchesPanel, GenerationPanel, RegeneratePanel, VariantsPanel } from './ChatTools';
import { useReadingPosition } from './useReadingPosition';
import { useProviders } from './ProviderModels';
type Tool = 'message'|'generation'|'regenerate'|'variants'|'branches'|'undo'|'persona'|'appearance'|'edit'|'rename';
type ChatData = {chat:ChatType;messages:Message[];generating:boolean;supportsVariants?:boolean;hasMore?:boolean;hasNewer?:boolean;latestMessageId?:string};
function readDraft(id:string):string {try{return localStorage.getItem(`larsta-draft-${id}`)||'';}catch{return '';}}
function writeDraft(id:string,value:string):boolean {try{if(value)localStorage.setItem(`larsta-draft-${id}`,value);else localStorage.removeItem(`larsta-draft-${id}`);return true;}catch{return false;}}
export default function Chat({id,characters,onBack,onOpen,onUpdated,notify}:{id:string;characters:Character[];onBack:()=>void;onOpen:(id:string)=>void;onUpdated:()=>void;notify:(s:string)=>void}) {
  const {providers}=useProviders();
  const [globalGeneration,setGlobalGeneration]=useState<Settings|null>(null);
  useEffect(()=>{const controller=new AbortController();const refresh=()=>{void api<Settings>('/settings',{signal:controller.signal}).then(v=>{if(!controller.signal.aborted)setGlobalGeneration(v);}).catch(()=>{});};refresh();window.addEventListener('larsta-providers-changed',refresh);return()=>{controller.abort();window.removeEventListener('larsta-providers-changed',refresh);};},[id]);
  const [data,setData]=useState<ChatData|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[sending,setSending]=useState(false),[stopping,setStopping]=useState(false);
  const [draft,setDraft]=useState(()=>readDraft(id)),[stream,setStream]=useState<Message|null>(null),[omitted,setOmitted]=useState(0),[contextStats,setContextStats]=useState<{used:number;limit:number}|null>(null);
  const [edit,storeEdit]=useState<Message|null>(null),[title,setTitle]=useState(''),[renameBusy,setRenameBusy]=useState(false),[renameError,setRenameError]=useState('');
  const {appearance}=useChatAppearance();
  const motion=useMotionEnabled();
  const [variantBusy,setVariantBusy]=useState(false),[paging,setPaging]=useState(false),[reconnect,setReconnect]=useState(0);
  const variantTransition=useRef<{id:string;top:number;direction:number}|null>(null);
  const paginationPosition=useRef<{top:number;height:number}|null>(null);
  const pendingSend=useRef<{requestId:string;content:string;revision?:number}|null>(null);
  const [atBottom,setAtBottom]=useState(true),[menuOpen,setMenuOpen]=useState(false);
  const [tool,setTool]=useState<Tool|null>(null),[actionMessageId,setActionMessageId]=useState<string|null>(null);
  const [regenerateTarget,storeRegenerateTarget]=useState<Message|null>(null),[previewTarget,storePreviewTarget]=useState<Message|null>(null);
  const activeTrigger=useRef<HTMLElement|null>(null),[toolAnchor,setToolAnchor]=useState<HTMLElement|null>(null);
  function setPanel(kind:Tool,show:boolean){
    if(show&&activeTrigger.current?.isConnected)setToolAnchor(activeTrigger.current);
    setTool(current=>show?kind:current===kind?null:current);
  }
  const appearanceOpen=tool==='appearance',personaOpen=tool==='persona',generationOpen=tool==='generation',branchesOpen=tool==='branches',undoOpen=tool==='undo',rename=tool==='rename';
  const setAppearanceOpen=(show:boolean)=>setPanel('appearance',show),setPersonaOpen=(show:boolean)=>setPanel('persona',show),setGenerationOpen=(show:boolean)=>setPanel('generation',show),setBranchesOpen=(show:boolean)=>setPanel('branches',show),setUndoOpen=(show:boolean)=>setPanel('undo',show),setRename=(show:boolean)=>setPanel('rename',show);
  function setEdit(message:Message|null){storeEdit(message);setPanel('edit',!!message);}
  function setRegenerateTarget(message:Message|null){storeRegenerateTarget(message);setPanel('regenerate',!!message);}
  function setPreviewTarget(message:Message|null){storePreviewTarget(message);setPanel('variants',!!message);}
  function setActionsTarget(message:Message|null){setActionMessageId(message?.id||null);setPanel('message',!!message);}
  const actionsTarget=data?.messages.find(message=>message.id===actionMessageId);
  const effectiveProvider=providers.find(p=>p.id===(data?.chat.generation?.providerId??globalGeneration?.providerId));
  const effectiveModel=data?.chat.generation?.mainModel??globalGeneration?.mainModel;
  const modelLabel=effectiveModel&&effectiveProvider?effectiveProvider.name+' · '+effectiveModel:t('Модель и ответы');
  const persona=data?.chat.persona||{name:t("Вы"),avatar:null};
  const controller=useRef<AbortController|null>(null),alive=useRef(true),scroll=useRef<HTMLDivElement>(null),follow=useRef(true),input=useRef<HTMLTextAreaElement>(null),draftWarningSent=useRef(false);
  const gesture=useRef<{messageId:string;x:number;y:number}|null>(null);
  useReadingPosition(id,!!data,scroll,follow,setAtBottom);
  const load=useCallback(async(restore=false)=>{
    let anchor='';
    if(restore)try{const saved=JSON.parse(localStorage.getItem('larsta-reading-'+id)||'null');if(saved&&!saved.bottom&&typeof saved.messageId==='string')anchor=saved.messageId;}catch{}
    let result:ChatData;
    try{result=await api<ChatData>('/chats/'+id+'?limit=50'+(anchor?'&anchor='+encodeURIComponent(anchor):''));}
    catch(error){if(!anchor)throw error;result=await api<ChatData>('/chats/'+id+'?limit=50');}
    if(result.generating&&result.hasNewer)result=await api<ChatData>('/chats/'+id+'?limit=50');
    if(alive.current)setData(result);return result;
  },[id]);
  useEffect(()=>{
    alive.current=true;void load(true).catch(e=>setError(e.message));
    try{pendingSend.current=JSON.parse(localStorage.getItem('larsta-pending-send-'+id)||'null');}catch{}
    return()=>{alive.current=false;controller.current?.abort();};
  },[load,id]);
  const handleStream=useCallback((event:string,value:any)=>{
    if(!alive.current)return;
    if(event==='start'){
      setError('');setOmitted(Number.isInteger(value.omitted)?value.omitted:0);
      setContextStats(Number.isFinite(value.contextBytes)&&Number.isFinite(value.contextLimit)?{used:value.contextBytes,limit:value.contextLimit}:null);
      setStream({id:value.id,chatId:id,role:'assistant',content:value.content||'',reasoning:value.reasoning||'',status:'streaming',model:value.model,providerId:value.providerId,providerName:value.providerName,createdAt:new Date().toISOString()});
    }
    if(event==='delta')setStream(s=>s?{...s,content:s.content+value.content}:s);
    if(event==='reasoning')setStream(s=>s?{...s,reasoning:(s.reasoning||'')+value.content}:s);
    if(event==='error')setError(value.message);
    if(event==='done'){
      setData(d=>d?{...d,chat:value.chat||d.chat,messages:value.messages,generating:false,hasMore:value.hasMore??false,hasNewer:false,latestMessageId:value.messages.at(-1)?.id}:d);
      setStream(null);
    }
  },[id]);
  useEffect(()=>{
    if(!data?.generating||busy)return;
    const subscription=new AbortController();let retryTimer:ReturnType<typeof setTimeout>|undefined;
    const watch=async()=>{
      let delay=500;
      while(!subscription.signal.aborted){
        try{
          await readStream(await fetch('/api/chats/'+id+'/events?limit=50',{headers:{'Accept-Language':uiLanguage()},signal:subscription.signal}),handleStream);
          if(!subscription.signal.aborted){await load();onUpdated();}return;
        }catch{
          if(subscription.signal.aborted)return;
          setError(t("Связь прервалась. Ответ готовится на сервере — переподключаемся…"));
          await new Promise<void>(resolve=>{retryTimer=setTimeout(resolve,delay);});
          if(subscription.signal.aborted)return;
          try{const current=await load();if(!current.generating){setError('');return;}}catch{}
          delay=Math.min(delay*2,8000);
        }
      }
    };
    void watch().catch(()=>{});
    return()=>{subscription.abort();clearTimeout(retryTimer);};
  },[data?.generating,busy,id,handleStream,load,reconnect]);
  useEffect(()=>{
    const resume=()=>{if(document.visibilityState==='hidden')return;void load().then(result=>{if(result.generating)setReconnect(n=>n+1);}).catch(()=>{});};
    window.addEventListener('online',resume);window.addEventListener('focus',resume);document.addEventListener('visibilitychange',resume);
    return()=>{window.removeEventListener('online',resume);window.removeEventListener('focus',resume);document.removeEventListener('visibilitychange',resume);};
  },[load]);
  useLayoutEffect(()=>{
    const saved=paginationPosition.current,element=scroll.current;
    const change=variantTransition.current;
    if(change&&element){
      const node=Array.from(element.querySelectorAll<HTMLElement>('[data-message-id]')).find(node=>node.dataset.messageId===change.id);
      if(node){
        element.scrollTop+=node.getBoundingClientRect().top-change.top;
        if(motion)node.querySelector('.message-text')?.animate([{opacity:.35,translate:`${change.direction*5}px 0`},{opacity:1,translate:'0 0'}],{duration:180,easing:'ease-out'});
      }
      variantTransition.current=null;
    }
    if(saved&&element){element.scrollTop=saved.top+element.scrollHeight-saved.height;paginationPosition.current=null;}
  },[data?.messages]);
  async function pageMessages(direction:'before'|'after'){
    if(!data||paging||generating)return;
    const message=direction==='before'?data.messages[0]:data.messages.at(-1);if(!message)return;
    setPaging(true);setError('');
    try{
      const result=await api<ChatData>('/chats/'+id+'?limit=50&'+direction+'='+encodeURIComponent(message.id));
      if(!alive.current)return;
      if(result.chat.revision!==data.chat.revision){await load();return;}
      const element=scroll.current;follow.current=false;
      if(direction==='before'&&element)paginationPosition.current={top:element.scrollTop,height:element.scrollHeight};
      setData(current=>current?{...current,messages:direction==='before'?[...result.messages,...current.messages]:[...current.messages,...result.messages],hasMore:direction==='before'?result.hasMore:current.hasMore,hasNewer:direction==='after'?result.hasNewer:current.hasNewer}:current);
    }catch(e){setError((e as Error).message);}finally{if(alive.current)setPaging(false);}
  }
  async function jumpToLatest(){follow.current=true;if(data?.hasNewer)await load();scroll.current?.scrollTo({top:scroll.current.scrollHeight,behavior:'instant'});setAtBottom(true);}
  useEffect(()=>{if(!writeDraft(id,draft)&&!draftWarningSent.current){draftWarningSent.current=true;notify(t("Браузер не сохраняет черновик. До отправки не закрывайте страницу."));}},[draft,id,notify]);
  useLayoutEffect(()=>{const el=input.current;if(!el)return;const resize=()=>{el.style.height='0px';const wanted=el.scrollHeight;el.style.height=`${Math.min(Math.max(wanted,24),120)}px`;el.style.overflowY=wanted>120?'auto':'hidden';if(follow.current)scroll.current?.scrollTo({top:scroll.current.scrollHeight,behavior:'instant'});};resize();window.addEventListener('resize',resize);return()=>window.removeEventListener('resize',resize);},[draft,data?.chat.id]);
  useEffect(()=>{if(follow.current){scroll.current?.scrollTo({top:scroll.current.scrollHeight,behavior:'instant'});setAtBottom(true);}},[data?.messages,stream]);

  useLayoutEffect(()=>{const el=scroll.current;if(!el)return;const observer=new ResizeObserver(()=>{if(follow.current)el.scrollTo({top:el.scrollHeight,behavior:'instant'});});observer.observe(el);return()=>observer.disconnect();},[data?.chat.id]);
  useEffect(()=>{if(!menuOpen)return;const close=(e:KeyboardEvent)=>{if(e.key==='Escape')setMenuOpen(false);};document.addEventListener('keydown',close);return()=>document.removeEventListener('keydown',close);},[menuOpen]);
  const generating=busy||!!data?.generating;
  const c=characters.find(c=>c.id===data?.chat.characterId);
  async function generate(messages:Message[],mode='reply',target?:Message,wish='',revision=data?.chat.revision) {
    if(generating||sending||variantBusy)return;
    const last=messages.at(-1);if(!last)return;
    const replacing=mode==='regenerate'||mode==='continue'?(target||last):null;
    if(replacing && !data?.supportsVariants){setError(t("Для сохранения вариантов ответа перезапустите сервер через start.cmd и обновите страницу."));return;}
    const index=replacing?messages.findIndex(m=>m.id===replacing.id):-1;
    const subsequent=replacing?messages.length-index-1+(data?.hasNewer?1:0):0;
    setBusy(true);setError('');setOmitted(0);follow.current=true;controller.current=new AbortController();
    try {
      const response=await fetch(`/api/chats/${id}/generate?limit=50`,{method:'POST',headers:{'Content-Type':'application/json','Accept-Language':uiLanguage()},body:json({requestId:operationId(),expectedLastId:mode==='reply'?last.id:data?.latestMessageId||last.id,expectedRevision:revision,mode,wish,...(replacing?{targetMessageId:replacing.id,expectedVariantId:replacing.selectedVariantId??null,confirmTruncate:subsequent>0}:{})}),signal:controller.current.signal});
      await readStream(response,handleStream);
    }catch(e){if(alive.current && (e as Error).name!=='AbortError')setError((e as Error).message||t("Не удалось связаться с сервером. Ваша реплика сохранена."));}
    finally {controller.current=null;if(alive.current){setBusy(false);setStopping(false);setStream(null);await load().catch(e=>setError(e.message));onUpdated();}}
  }
  async function send(e:React.FormEvent){
    e.preventDefault();if(!data||!draft.trim()||generating||sending||variantBusy)return;
    const text=draft,normalized=text.trim();
    if(pendingSend.current?.content!==normalized)pendingSend.current={requestId:operationId(),content:normalized,revision:data.chat.revision};
    const request=pendingSend.current!;
    try{localStorage.setItem('larsta-pending-send-'+id,JSON.stringify(request));}catch{}
    setSending(true);setError('');
    try{
      const message=await api<Message&{chatRevision:number}>('/chats/'+id+'/messages',{method:'POST',body:json({content:request.content,requestId:request.requestId,expectedRevision:request.revision})});
      pendingSend.current=null;try{localStorage.removeItem('larsta-pending-send-'+id);}catch{}
      const current=await load(),messages=current.messages;
      setDraft(value=>{if(value===text){writeDraft(id,'');return '';}return value;});follow.current=true;setSending(false);
      if(messages.at(-1)?.id===message.id&&!current.generating)await generate(messages,'reply',undefined,'',current.chat.revision);
    }catch(e){setError((e as Error).message);await load().catch(()=>{});}finally{if(alive.current)setSending(false);}
  }
  async function stop(){setStopping(true);try{await api(`/chats/${id}/stop`,{method:'POST',body:'{}'});if(!busy){await load();setStopping(false);}}catch(e){setError((e as Error).message);setStopping(false);}}
  async function saveEdit(content:string){
    if(!edit||!data||generating||sending||variantBusy)throw new Error(t("Дождитесь завершения текущего действия."));
    const pos=data.messages.findIndex(m=>m.id===edit.id),subsequent=data.messages.length-pos-1+(data.hasNewer?1:0);
    await api<Message[]>(`/chats/${id}/messages/${edit.id}?limit=50`,{method:'PATCH',body:json({content,confirmTruncate:subsequent>0,expectedRevision:data.chat.revision})});
    await load();onUpdated();notify(t("Сохранено. Прежняя версия доступна в ветках истории."));return true;
  }
  async function chooseVariant(message:Message,variantId:string){
    if(!data||generating||variantBusy||sending)return;
    const subsequent=data.messages.length-data.messages.findIndex(m=>m.id===message.id)-1+(data.hasNewer?1:0);
    setVariantBusy(true);setError('');follow.current=false;
    try{await api<Message[]>(`/chats/${id}/messages/${message.id}/variant?limit=50`,{method:'POST',body:json({variantId,expectedVariantId:message.selectedVariantId??null,expectedLastId:data.latestMessageId||data.messages.at(-1)?.id,confirmTruncate:subsequent>0,expectedRevision:data.chat.revision})});
      const node=Array.from(scroll.current?.querySelectorAll<HTMLElement>('[data-message-id]')||[]).find(node=>node.dataset.messageId===message.id);
      if(node){const variants=message.variants||[];variantTransition.current={id:message.id,top:node.getBoundingClientRect().top,direction:variants.findIndex(v=>v.id===variantId)>variants.findIndex(v=>v.id===message.selectedVariantId)?1:-1};}
      await load();setPreviewTarget(null);onUpdated();if(subsequent>0)notify(t("Прежнее продолжение сохранено в ветках истории."));}
    catch(e){variantTransition.current=null;setPreviewTarget(null);setError((e as Error).message);await load().catch(()=>{});}
    finally{setVariantBusy(false);}
  }
  async function fork(message:Message){if(!data||generating||variantBusy||sending)return;setVariantBusy(true);setError('');try{const branch=await api<ChatType>(`/chats/${id}/fork`,{method:'POST',body:json({messageId:message.id,expectedRevision:data.chat.revision})});onUpdated();onOpen(branch.id);notify(t("Открыта новая ветка. Исходная история сохранена."));}catch(e){setError((e as Error).message);}finally{setVariantBusy(false);}}
  async function undo(){if(!data||generating||variantBusy)return;setVariantBusy(true);setError('');try{const result=await api<ChatData&{draft:string}>(`/chats/${id}/undo?limit=50`,{method:'POST',body:json({expectedLastId:data.latestMessageId||data.messages.at(-1)?.id,expectedRevision:data.chat.revision})});setData({...data,chat:result.chat,messages:result.messages,hasMore:result.hasMore,hasNewer:result.hasNewer,latestMessageId:result.latestMessageId});setDraft(current=>current.trim()&&current!==result.draft?`${result.draft}\n\n${current}`:result.draft);follow.current=true;setUndoOpen(false);onUpdated();notify(t("Ход возвращён в поле ввода. Прежняя версия — в ветках."));input.current?.focus();}catch(e){setUndoOpen(false);setError((e as Error).message);await load().catch(()=>{});}finally{setVariantBusy(false);}}
  function swipe(message:Message,x:number,y:number){const start=gesture.current;gesture.current=null;if(!start||start.messageId!==message.id||generating||variantBusy||window.getSelection()?.toString())return;const dx=x-start.x,dy=y-start.y;if(Math.abs(dx)<75||Math.abs(dy)>35)return;const variants=message.variants||[],index=variants.findIndex(v=>v.id===message.selectedVariantId),next=variants[index+(dx<0?1:-1)];if(next)void chooseVariant(message,next.id);}
  async function remove(){if(!window.confirm(t("Удалить этот чат и всю его переписку?")))return;try{await api(`/chats/${id}`,{method:'DELETE'});writeDraft(id,'');onUpdated();onBack();}catch(e){setError((e as Error).message);}}
  if(!data)return <div className="page"><ErrorBox text={error}/>{!error&&<Loading/>}<button className="button" onClick={onBack}>{t("К списку чатов")}</button></div>;
  const last=data.messages.at(-1);
  const replacementIndex=stream?data.messages.findIndex(m=>m.id===stream.id):-1;
  const messages=stream?[...(replacementIndex>=0?data.messages.slice(0,replacementIndex):data.messages),stream]:data.messages;
  return <div className="chat-page" data-chat-id={id} style={appearanceStyle(appearance)} onClickCapture={event=>{const trigger=(event.target as Element).closest('button');if(trigger&&!trigger.closest('.tool-panel'))activeTrigger.current=trigger.closest('.chat-menu-items')?document.querySelector<HTMLElement>('.chat-menu>.icon-button'):trigger;}}>{appearance.wallpaper&&c?.avatar&&<div className="chat-wallpaper" aria-hidden="true"><img key={c.avatar} src={c.avatar} alt="" onError={e=>{e.currentTarget.style.visibility='hidden';}}/></div>}<header className="chat-header"><button className="icon-button" aria-label={t("К списку чатов")} onClick={onBack}><ArrowLeft size={20}/></button><Avatar character={c}/><div className="grow"><h2>{data.chat.title}</h2><div className="chat-subtitle" aria-live="polite">{generating?<><span className="writing-dot"/>{t("Пишет…")}</>:<>{c?.card.data.name} {t(" · Вы: ")}{persona.name}</>}</div></div><button className="icon-button chat-settings-button" title={t("Настройки чата")} aria-label={t("Настройки чата")} onClick={()=>setAppearanceOpen(true)}><SettingsIcon size={19}/></button><div className="chat-menu"><button className="icon-button" aria-label={t("Действия с чатом")} aria-expanded={menuOpen} onClick={()=>setMenuOpen(!menuOpen)}><MoreHorizontal size={20}/></button><Presence present={menuOpen}>{menuOpen&&<><button className="chat-menu-dismiss" aria-label={t("Закрыть действия с чатом")} onClick={()=>setMenuOpen(false)}/><div className="chat-menu-items"><button disabled={generating||variantBusy||sending} onClick={()=>{setMenuOpen(false);setGenerationOpen(true);}}><SlidersHorizontal size={16}/>{t("Модель и ответы")}</button><button disabled={generating||variantBusy||sending} onClick={()=>{setMenuOpen(false);setBranchesOpen(true);}}><GitBranch size={16}/>{t("Ветки истории")}</button><button disabled={generating||variantBusy||sending||!data.messages.some(m=>m.role==='user')} onClick={()=>{setMenuOpen(false);setUndoOpen(true);}}><Undo2 size={16}/>{t("Откатить ход")}</button><button disabled={generating||variantBusy||sending} onClick={()=>{setMenuOpen(false);setPersonaOpen(true);}}><UserRound size={16}/>{t("Моя персона")}</button><button disabled={generating||variantBusy||sending} onClick={()=>{setMenuOpen(false);setTitle(data.chat.title);setRenameError('');setRename(true);}}><Pencil size={16}/>{t("Переименовать")}</button><button className="danger-hover" disabled={generating||variantBusy||sending} onClick={()=>{setMenuOpen(false);void remove();}}><Trash2 size={16}/>{t("Удалить чат")}</button></div></>}</Presence></div></header>
  <div className="messages" ref={scroll} onScroll={()=>{const el=scroll.current;if(el){follow.current=el.scrollHeight-el.scrollTop-el.clientHeight<100;setAtBottom(follow.current);}}}><div className="messages-inner">{data.hasMore&&<button className="button history-page-button" disabled={paging||generating} onClick={()=>void pageMessages('before')}>{paging?t("Загружаем…"):t("Предыдущие сообщения")}</button>}<div className="chat-beginning" hidden={!!data.hasMore}><span><MessageSquare size={16}/></span><p>{t("Начало вашей истории")}</p><small>{new Date(data.chat.createdAt).toLocaleDateString(uiLocale(),{day:'numeric',month:'long',year:'numeric'})}</small></div>{!messages.length&&<div className="chat-empty"><h2>{t("Первое слово — за вами")}</h2><p>{t("Напишите персонажу и начните вашу историю.")}</p></div>}{messages.map(m=><article key={m.id} data-message-id={m.id} className={`message ${m.role}`}><div className="message-avatar">{m.role==='assistant'?<Avatar character={c}/>:<PersonaAvatar persona={persona}/>}</div><div className="message-body"><div className="message-meta"><strong>{m.role==='assistant'?c?.card.data.name:persona.name}</strong><time>{new Date(m.createdAt).toLocaleTimeString(uiLocale(),{hour:'2-digit',minute:'2-digit'})}</time>{m.status==='stopped'&&<small>{t("Остановлено")}</small>}{m.status==='error'&&<small className="error-text">{t("Ответ прерван")}</small>}</div>{m.role==='assistant'&&!!m.reasoning&&<ThinkingBlock reasoning={m.reasoning} active={m.status==='streaming'&&!m.content} latest={m.id===messages.at(-1)?.id&&!data.hasNewer} scroll={scroll} follow={follow}/>} <div className={`message-text ${(m.variants?.length||0)>1?'swipe-message':''}`} onPointerDown={e=>{if(e.pointerType==='touch'&&e.isPrimary&&m.role==='assistant'&&(m.variants?.length||0)>1&&!(e.target as HTMLElement).closest('pre,a,button,code'))gesture.current={messageId:m.id,x:e.clientX,y:e.clientY};}} onPointerUp={e=>{if(e.pointerType==='touch'&&e.isPrimary)swipe(m,e.clientX,e.clientY);}} onPointerCancel={()=>{gesture.current=null;}}>{m.content?<MessageMarkdown content={m.content} streaming={m.status==='streaming'&&motion}/>:m.status==='streaming'?<span className="typing"><i/><i/><i/></span>:<span className="muted">{t("Текст ответа не получен. Можно повторить генерацию.")}</span>}{m.status==='streaming'&&m.content&&<span className="stream-cursor"/>}</div>{m.status!=='streaming'&&<MessageActions message={m} latest={m.id===last?.id&&!data.hasNewer} canRegenerate={m.role==='assistant'&&data.messages[data.messages.findIndex(x=>x.id===m.id)-1]?.role==='user'} locked={generating||variantBusy||sending} open={tool==='message'&&actionsTarget?.id===m.id} onOpen={()=>setActionsTarget(tool==='message'&&actionsTarget?.id===m.id?null:m)}
    onCopy={()=>void copyText(m.content).then(()=>notify(t("Сообщение скопировано"))).catch(e=>setError(e.message))}
    onEdit={()=>{setEdit(m);}}
    onRegenerate={()=>setRegenerateTarget(m)} onContinue={()=>void generate(data.messages,'continue',m)} onFork={()=>void fork(m)} onPreview={()=>setPreviewTarget(m)} onVariant={variantId=>void chooseVariant(m,variantId)}/>}</div></article>)}{data.hasNewer&&<button className="button history-page-button" disabled={paging||generating} onClick={()=>void pageMessages('after')}>{paging?t("Загружаем…"):t("Следующие сообщения")}</button>}</div></div>
  <Presence present={!atBottom||!!data.hasNewer}>{(!atBottom||data.hasNewer)&&<button className="jump-to-bottom" aria-label={t("К последним сообщениям")} onClick={()=>void jumpToLatest().catch(e=>setError(e.message))}><ArrowDown size={17}/>{t("Вниз")}</button>}</Presence>
  <div className="composer-area"><div className="composer-inner"><ErrorBox text={error}/>{omitted>0&&<p className="context-note" title={contextStats?t("Оценка контекста: {0} из {1} единиц бюджета",{0:contextStats.used.toLocaleString(uiLocale()),1:contextStats.limit.toLocaleString(uiLocale())}):undefined}>{t("Модель не видит ")}{omitted} {t(" старых реплик из-за лимита контекста. Они сохранены в чате.")}</p>}{!generating&&!data.hasNewer&&last?.role==='user'&&<div className="composer-retry-row"><button className="button small" disabled={sending||variantBusy} onClick={()=>void generate(data.messages)}><RefreshCw size={13}/>{t("Получить ответ")}</button></div>}<form className="composer" onSubmit={e=>void send(e)}><button className="composer-persona icon-button" type="button" aria-label={t("Моя персона")} title={t("Персона: {0}",{0:persona.name})} disabled={generating||variantBusy||sending} onClick={()=>setPersonaOpen(true)}><PersonaAvatar persona={persona}/></button><textarea ref={input} aria-label={t("Ваше сообщение")} value={draft} maxLength={50000} rows={1} title={t("Enter — отправить, Shift+Enter — новая строка")} placeholder={t("Написать {0}…",{0:c?.card.data.name||'персонажу'})} onChange={e=>setDraft(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing&&window.matchMedia('(pointer: fine)').matches){e.preventDefault();e.currentTarget.form?.requestSubmit();}}}/>{generating?<button className="send-button stop-button" type="button" aria-label={t("Остановить ответ")} title={t("Остановить ответ")} disabled={stopping} onClick={()=>void stop()}><Square size={16}/></button>:<button className="send-button" type="submit" aria-label={t("Отправить сообщение")} title={t("Отправить")} disabled={!draft.trim()||sending||variantBusy}><ArrowUp size={21}/></button>}</form><div className="composer-toolbar"><button className="composer-model" aria-label={t("Модель и ответы")} aria-controls="chat-tools" aria-expanded={generationOpen} disabled={generating||variantBusy||sending} onClick={()=>setGenerationOpen(!generationOpen)}><SlidersHorizontal size={14}/><span title={modelLabel}>{modelLabel}</span><ChevronDown size={13}/></button><span className="composer-key-hint">{t("Enter — отправить ")}<span>·</span> {t(" Shift+Enter — новая строка")}</span></div></div></div>
{tool==='edit'&&edit&&<TextEditor key={edit.id} title={t("Редактировать сообщение")} initialValue={edit.content} returnFocus={toolAnchor} maxLength={50000} message onSave={saveEdit} onClose={()=>setEdit(null)}/>}
{tool==='regenerate'&&regenerateTarget&&<RegeneratePanel key={regenerateTarget.id} draftKey={id+':'+regenerateTarget.id} returnFocus={toolAnchor} locked={generating||sending||variantBusy} onClose={()=>setRegenerateTarget(null)} onGenerate={wish=>{const target=regenerateTarget;setRegenerateTarget(null);void generate(data.messages,'regenerate',target,wish);}}/>}
<ToolPanelAnchorContext.Provider value={{anchor:toolAnchor,open:!!tool,style:appearanceStyle(appearance)}}><div className="tool-panel-slot"><Presence present={!!tool&&tool!=='edit'&&tool!=='regenerate'}>
  {tool==='message'&&actionsTarget&&<MessageActionPanel message={actionsTarget} canRegenerate={actionsTarget.role==='assistant'&&data.messages[data.messages.findIndex(message=>message.id===actionsTarget.id)-1]?.role==='user'} locked={generating||variantBusy||sending} onClose={()=>setActionsTarget(null)}
    onCopy={()=>void copyText(actionsTarget.content).then(()=>notify(t("Сообщение скопировано"))).catch(e=>setError(e.message))}
    onEdit={()=>{setEdit(actionsTarget);}}
    onRegenerate={()=>setRegenerateTarget(actionsTarget)} onPreview={()=>setPreviewTarget(actionsTarget)} onFork={()=>void fork(actionsTarget)}/>}

  <>{tool==='variants'&&previewTarget&&<VariantsPanel locked={generating||sending} chatId={id} message={previewTarget} onClose={()=>setPreviewTarget(null)} onChoose={variantId=>chooseVariant(previewTarget,variantId)} busy={variantBusy}/>}</>
  <>{generationOpen&&<GenerationPanel locked={generating||sending||variantBusy} chat={data.chat} onClose={()=>setGenerationOpen(false)} onSaved={chat=>{setData(d=>d?{...d,chat}:d);setGenerationOpen(false);onUpdated();notify(t("Настройки ответов сохранены"));}}/>}</>
  <>{branchesOpen&&<BranchesPanel chatId={id} onClose={()=>setBranchesOpen(false)} onOpen={onOpen}/>}</>
  <>{undoOpen&&<ToolPanel title={t("Откатить последний ход?")} onClose={()=>{if(!variantBusy)setUndoOpen(false);}}><div className="modal-scroll"><p className="muted">{t("Последняя ваша реплика вернётся в поле ввода, а ответы после неё будут убраны из текущей истории. Вся прежняя переписка останется в ветке «до отката».")}</p>{draft.trim()&&<p className="field-help">{t("Текущий черновик будет добавлен ниже возвращённой реплики.")}</p>}</div><footer><button className="button" disabled={variantBusy} onClick={()=>setUndoOpen(false)}>{t("Отмена")}</button><button className="button primary" disabled={variantBusy||generating||sending} onClick={()=>void undo()}><Undo2 size={16}/>{variantBusy?t("Откатываем…"):t("Откатить ход")}</button></footer></ToolPanel>}</>
  <>{personaOpen&&<ChatPersonaPanel chat={data.chat} onClose={()=>setPersonaOpen(false)} onSaved={chat=>{setData(d=>d?{...d,chat}:d);onUpdated();notify(t("Персона этого чата сохранена"));}}/>}</>
  <>{appearanceOpen&&<ToolPanel title={t("Настройки чата")} onClose={()=>setAppearanceOpen(false)}><div className="modal-scroll"><ChatAppearanceSettings avatar={c?.avatar||undefined}/></div><footer><button className="button primary" onClick={()=>setAppearanceOpen(false)}>{t("Готово")}</button></footer></ToolPanel>}</>

  <>{rename&&<ToolPanel title={t("Название чата")} onClose={()=>{if(!renameBusy)setRename(false);}}><form onSubmit={e=>{e.preventDefault();if(renameBusy)return;setRenameBusy(true);setRenameError('');void api<ChatType>(`/chats/${id}`,{method:'PATCH',body:json({title,expectedRevision:data.chat.revision})}).then(chat=>{setData(d=>d?{...d,chat}:d);setRename(false);onUpdated();}).catch(e=>setRenameError(e.message)).finally(()=>setRenameBusy(false));}}><div className="modal-scroll"><label>{t("Название")}<input required maxLength={120} value={title} onChange={e=>setTitle(e.target.value)}/></label><ErrorBox text={renameError}/></div><footer><button className="button primary" disabled={renameBusy||generating||sending}>{renameBusy?t("Сохраняем…"):t("Сохранить")}</button></footer></form></ToolPanel>}</>
  </Presence></div></ToolPanelAnchorContext.Provider></div>;
}
