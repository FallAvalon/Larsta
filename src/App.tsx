import { t, uiLocale, useLanguage } from './i18n';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowDownToLine, ArrowRight, BookOpen, Bookmark, ChevronDown, ChevronRight, Clock3, Import, LogOut, MessageCircle, MessageSquare, Plus, Search, Settings as SettingsIcon, ShieldCheck, Sparkles, SlidersHorizontal, Trash2, UserRound, Users, Wifi, X, Pencil } from 'lucide-react';
import type { Character, Chat as ChatType, Persona } from '../shared/types';
import { api, json } from './api';
import { CharacterEditor, ErrorBox, ImportModal, Loading, Modal } from './components';
import Settings from './Settings';
import Chat from './Chat';
import ChatsPage, { type ChatPage } from './ChatsPage';
import PersonasPage from './Personas';
import { Presence, useButtonFeedback, useMotionEnabled } from './motion';

function Logo(){return <div className="brand"><img src="/favicon.svg" alt=""/><span>Larsta<span className="brand-dot">.</span></span></div>;}
function Login({onConnect}:{onConnect:()=>void}) {
  const [code,setCode]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  return <div className="login-page"><div className="login-glow"/><div className="login-card"><Logo/><div className="login-icon"><ShieldCheck size={31}/></div><div className="eyebrow">{t("ЛИЧНОЕ ПРОСТРАНСТВО ДЛЯ ИСТОРИЙ")}</div><h1>{t("Ваши персонажи.")}<br/>{t("Ваши миры.")}</h1><p>{t("Подключитесь к домашнему серверу,")}<br/>{t("чтобы продолжить историю.")}</p><form onSubmit={e=>{e.preventDefault();setBusy(true);setError('');void api('/auth',{method:'POST',body:json({code})}).then(onConnect).catch(e=>setError(e.message)).finally(()=>setBusy(false));}}><label>{t("Код подключения")}<input aria-label={t("Код подключения")} className="code-input" inputMode="numeric" pattern="[0-9]{8}" maxLength={8} required autoComplete="off" value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,''))} placeholder="········"/></label><ErrorBox text={error}/><button className="button primary" disabled={busy||code.length!==8}>{busy?t("Подключаемся…"):t("Войти в Larsta")}<ArrowRight size={18}/></button></form><div className="login-note"><Wifi size={16}/><span>{t("Код отображается в окне запущенного сервера.")}<br/>{t("Каждое новое устройство подключается отдельно.")}</span></div></div><span className="login-bottom">{t("Одна история. На всех ваших устройствах.")}</span></div>;
}

function currentRoute(){try{return decodeURIComponent(window.location.hash.slice(1))||'chats';}catch{return 'chats';}}
export default function App() {
  const {language}=useLanguage();
  useEffect(()=>{document.documentElement.lang=language;},[language]);
  const motion=useMotionEnabled();
  useButtonFeedback(motion);
  useEffect(()=>{document.documentElement.dataset.motion=motion?'on':'off';},[motion]);
  const [auth,setAuth]=useState<boolean|null>(null),[route,setRoute]=useState(currentRoute);
  const [characters,setCharacters]=useState<Character[]>([]),[chats,setChats]=useState<ChatType[]>([]),[chatCount,setChatCount]=useState(0),[personas,setPersonas]=useState<Persona[]>([]),[newPersonaId,setNewPersonaId]=useState('');
  const [loading,setLoading]=useState(true),[error,setError]=useState(''),[toast,setToast]=useState('');
  const [editor,setEditor]=useState<Character|'new'|null>(null),[importing,setImporting]=useState(false),[detail,setDetail]=useState<Character|null>(null),[starting,setStarting]=useState(false);
  const [detailChats,setDetailChats]=useState<ChatType[]>([]),[detailChatTotal,setDetailChatTotal]=useState(0),[detailChatPage,setDetailChatPage]=useState(0);
  const [detailError,setDetailError]=useState(''),[opening,setOpening]=useState<string|null>(null);
  const characterRequest=useRef<AbortController|null>(null);
  const [libraryFilters,setLibraryFilters]=useState(false);
  const [search,setSearch]=useState(''),[tag,setTag]=useState('Все'),[tab,setTab]=useState('all'),[sort,setSort]=useState('updated');
  const searchInput=useRef<HTMLInputElement>(null),toastTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const isChat=route.startsWith('chat/'),library=['library','favorites','mine'].includes(route);
  useEffect(()=>{const keys=(e:KeyboardEvent)=>{if(e.key==='/'&&library&&!['INPUT','TEXTAREA','SELECT'].includes((e.target as HTMLElement).tagName)){e.preventDefault();searchInput.current?.focus();}};document.addEventListener('keydown',keys);return()=>document.removeEventListener('keydown',keys);},[library]);
  useEffect(()=>{
    const viewport=window.visualViewport;let frame=0;
    const resize=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{document.documentElement.style.setProperty('--visible-height',String(viewport?.height??window.innerHeight)+'px');document.documentElement.style.setProperty('--visible-top',String(viewport?.offsetTop??0)+'px');});};
    resize();viewport?.addEventListener('resize',resize);viewport?.addEventListener('scroll',resize);window.addEventListener('resize',resize);
    return()=>{cancelAnimationFrame(frame);viewport?.removeEventListener('resize',resize);viewport?.removeEventListener('scroll',resize);window.removeEventListener('resize',resize);};
  },[]);
  const notify=useCallback((text:string)=>{setToast(text);if(toastTimer.current)clearTimeout(toastTimer.current);toastTimer.current=setTimeout(()=>setToast(''),3500);},[]);
  useEffect(()=>()=>{if(toastTimer.current)clearTimeout(toastTimer.current);},[]);
  const refresh=useCallback(async()=>{
    try{const [cs,ts,ps]=await Promise.all([api<Character[]>('/characters?compact=1'),api<ChatPage>('/chats?limit=20'),api<Persona[]>('/personas')]);setCharacters(cs);setChats(ts.items);setChatCount(ts.total);setPersonas(ps);setError('');}
    catch(e){setError((e as Error).message);}finally{setLoading(false);}
  },[]);
  useEffect(()=>{
    void api('/auth').then(()=>setAuth(true)).catch(()=>setAuth(false));
    const change=()=>setRoute(currentRoute()),unauth=()=>setAuth(false);
    window.addEventListener('hashchange',change);window.addEventListener('larsta-unauthorized',unauth);
    return()=>{window.removeEventListener('hashchange',change);window.removeEventListener('larsta-unauthorized',unauth);};
  },[]);
  useEffect(()=>{if(auth)void refresh();},[auth,refresh]);
  useEffect(()=>{if(auth&&['chats','personas'].includes(route))void refresh();},[auth,route,refresh]);
  const go=(path:string)=>{window.location.hash=path;};
  useEffect(()=>{characterRequest.current?.abort();setOpening(null);return()=>characterRequest.current?.abort();},[route]);
  useEffect(()=>{
    if(!detail){setDetailChats([]);setDetailChatTotal(0);return;}
    const controller=new AbortController();setDetailError('');
    void api<ChatPage>('/chats?limit=10&characterId='+encodeURIComponent(detail.id)+'&offset='+detailChatPage*10,{signal:controller.signal}).then(result=>{if(!controller.signal.aborted){setDetailChats(result.items);setDetailChatTotal(result.total);}}).catch(e=>{if(!controller.signal.aborted)setDetailError(e.message);});
    return()=>controller.abort();
  },[detail?.id,detailChatPage]);
  async function openCharacter(c:Character){
    characterRequest.current?.abort();const controller=new AbortController();characterRequest.current=controller;setOpening(c.id);
    try{const value=await api<Character>('/characters/'+c.id,{signal:controller.signal});if(!controller.signal.aborted){setDetailChatPage(0);setDetail(value);}}
    catch(e){if(!controller.signal.aborted)notify((e as Error).message);}finally{if(characterRequest.current===controller)setOpening(null);}
  }
  async function favorite(c:Character){try{const updated=await api<Character>('/characters/'+c.id+'/favorite',{method:'PATCH',body:json({favorite:!c.favorite})});setCharacters(cs=>cs.map(x=>x.id===c.id?updated:x));if(detail?.id===c.id)setDetail(updated);}catch(e){notify((e as Error).message);}}
  async function start(c:Character){setStarting(true);try{const chat=await api<ChatType>('/chats',{method:'POST',body:json({characterId:c.id,personaId:(personas.find(p=>p.id===newPersonaId)||personas[0])?.id})});setDetail(null);await refresh();go('chat/'+chat.id);}catch(e){notify((e as Error).message);}finally{setStarting(false);}}
  async function remove(c:Character){if(!window.confirm(t("Удалить персонажа «")+c.card.data.name+t("» и ВСЕ его чаты? Это действие нельзя отменить.")))return;try{await api('/characters/'+c.id,{method:'DELETE'});setDetail(null);await refresh();notify(t("Персонаж удалён"));}catch(e){notify((e as Error).message);}}
  const saved=(c:Character)=>{setCharacters(cs=>[c,...cs.filter(x=>x.id!==c.id)]);if(detail?.id===c.id)setDetail(c);notify(t("Персонаж сохранён"));void refresh();};
  async function logout(){try{await api('/logout',{method:'POST',body:'{}'});setAuth(false);setCharacters([]);setChats([]);setPersonas([]);}catch(e){notify((e as Error).message);}}
  if(auth===null)return <div className="boot"><Logo/><Loading/></div>;
  if(!auth)return <Login onConnect={()=>{setAuth(true);setLoading(true);}}/>;
  const tags=[...new Set(characters.flatMap(c=>c.card.data.tags))].sort((a,b)=>a.localeCompare(b,uiLocale()));
  let visible=characters.filter(c=>(c.card.data.name+' '+c.summary+' '+c.card.data.description).toLowerCase().includes(search.toLowerCase())&&(tag==='Все'||c.card.data.tags.includes(tag))&&(!(route==='favorites'||tab==='favorites')||c.favorite));
  if(tab==='recent')visible=visible.filter(c=>chats.some(t=>t.characterId===c.id));
  visible=[...visible].sort((a,b)=>sort==='name'?a.card.data.name.localeCompare(b.card.data.name,uiLocale()):sort==='created'?b.createdAt.localeCompare(a.createdAt):b.updatedAt.localeCompare(a.updatedAt));
  const destinations=[{id:'chats',label:'Чаты',icon:MessageSquare,count:chatCount},{id:'library',label:'Персонажи',icon:BookOpen,count:characters.length},{id:'personas',label:'Персоны',icon:Users,count:personas.length},{id:'settings',label:'Настройки',icon:SettingsIcon,count:0}];
  const section=library?'library':isChat?'chats':route;
  return <div className={'app '+(isChat?'in-chat':'')}>
    <aside className="sidebar" aria-label={t("Боковая навигация")}>
      <a className="rail-brand" href="#chats" aria-label={t("Larsta — чаты")} title="Larsta"><Logo/></a>
      <nav>{destinations.map(item=><button key={item.id} className={section===item.id?'active':''} aria-label={t(item.label)} title={t(item.label)} aria-current={section===item.id?'page':undefined} onClick={()=>{if(item.id==='library'){setTab('all');setTag('Все');}go(item.id);}}><item.icon size={22}/><span className="nav-label">{t(item.label)}</span></button>)}</nav>
      <div className="sidebar-bottom"><span className="rail-state" title={error?t("Сервер недоступен"):t("Сервер подключён")} aria-label={error?t("Сервер недоступен"):t("Сервер подключён")}><span className={'status-dot '+(error?'offline':'')}/></span><button className="icon-button rail-logout" aria-label={t("Отключить устройство")} title={t("Отключить устройство")} onClick={()=>void logout()}><LogOut size={20}/></button></div>
    </aside>
    <main className="main">{!isChat&&<a className="mobile-wordmark" href="#chats">Larsta<span>.</span></a>}
      {isChat?<Chat key={route} id={route.slice(5)} characters={characters} onBack={()=>go('chats')} onOpen={id=>go('chat/'+id)} onUpdated={()=>void refresh()} notify={notify}/>
      :route==='personas'?<PersonasPage personas={personas} onUpdated={()=>void refresh()} notify={notify}/>
      :route==='settings'?<Settings notify={notify} onLogout={()=>void logout()}/>
      :route==='chats'?<ChatsPage chats={chats} characters={characters} onOpen={id=>go('chat/'+id)} onBrowse={()=>go('library')}/>
      :<div className="page library-page">
        <div className="page-heading"><div><h1>{t("Персонажи ")}<span className="count">{characters.length}</span></h1></div><button className="icon-button page-add" aria-label={t("Создать персонажа")} title={t("Создать персонажа")} onClick={()=>setEditor('new')}><Plus size={24}/></button></div>
        <div className="library-search-row"><div className="library-search conversation-search"><Search size={19}/><input ref={searchInput} aria-label={t("Поиск персонажей")} placeholder={t("Найти персонажа")} value={search} onChange={e=>setSearch(e.target.value)}/>{search&&<button className="icon-button" onClick={()=>setSearch('')} aria-label={t("Очистить поиск")}><X size={17}/></button>}</div><button className={"icon-button filter-toggle "+(libraryFilters||tag!=='Все'||sort!=='updated'?'selected':'')} aria-label={t("Фильтры персонажей")} aria-expanded={libraryFilters} onClick={()=>setLibraryFilters(!libraryFilters)}><SlidersHorizontal size={20}/></button></div>
        <div className="tabs">{[['all','Все'],['favorites',t("Избранное")],['recent',t("Недавние")]].map(([id,label])=><button key={id} className={tab===id?'active':''} aria-pressed={tab===id} onClick={()=>{setTab(id);if(route==='favorites')go('library');}}>{t(label)}</button>)}</div>
        {libraryFilters&&<div className="filterbar">{tags.length>0?<div className="tag-filters"><button className={tag==='Все'?'selected':''} onClick={()=>setTag('Все')}>{t("Все жанры")}</button>{tags.map(t=><button key={t} className={tag===t?'selected':''} onClick={()=>setTag(t)}>{t}</button>)}</div>:<span/>}<div className="sort-select"><select aria-label={t("Порядок персонажей")} value={sort} onChange={e=>setSort(e.target.value)}><option value="updated">{t("Недавние")}</option><option value="created">{t("Сначала новые")}</option><option value="name">{t("По имени")}</option></select><ChevronDown size={15}/></div></div>}
        <ErrorBox text={error}/>
        {loading?<Loading/>:characters.length===0?<div className="library-empty"><div className="empty-symbol"><BookOpen size={39} strokeWidth={1.2}/></div><h2>{t("Добавьте первого персонажа")}</h2><p>{t("Создайте карточку или импортируйте JSON.")}</p><button className="button primary" onClick={()=>setEditor('new')}><Plus size={18}/>{t("Создать персонажа")}</button></div>
        :visible.length===0?<div className="empty-simple"><Search size={32}/><h2>{t("Персонажи не найдены")}</h2><p>{t("Попробуйте другой запрос или фильтр.")}</p><button className="button" onClick={()=>{setSearch('');setTag('Все');setTab('all');go('library');}}>{t("Сбросить фильтры")}</button></div>
        :<div className="character-grid">{visible.map((c,i)=><article className="character-card" key={c.id} style={{animationDelay:String(Math.min(i,7)*35)+'ms'}}><div className="character-portrait"><button className={'card-cover color-'+c.card.data.name.charCodeAt(0)%4} disabled={opening===c.id} onClick={()=>void openCharacter(c)} aria-label={t("Открыть ")+c.card.data.name}>{c.avatar?<img src={c.avatar} alt={c.card.data.name} loading="lazy"/>:<div className="cover-placeholder"><span>{c.card.data.name.slice(0,1)}</span><Sparkles size={22}/></div>}</button><button className={'icon-button card-bookmark '+(c.favorite?'is-favorite':'')} aria-label={c.favorite?t("Убрать из избранного"):t("В избранное")} onClick={()=>void favorite(c)}><Bookmark size={19} fill={c.favorite?'currentColor':'none'}/></button></div><div className="card-info"><button className="card-name" disabled={opening===c.id} onClick={()=>void openCharacter(c)}><h2>{c.card.data.name}</h2></button><p>{c.summary||c.card.data.description||t("Ваша следующая история")}</p><div className="card-tags">{c.card.data.tags.slice(0,2).map(t=><button key={t} onClick={()=>setTag(t)}>{t}</button>)}{c.card.data.tags.length>2&&<span>+{c.card.data.tags.length-2}</span>}</div></div></article>)}</div>}
        <button className="button import-library" aria-label={t("Импорт JSON")} onClick={()=>setImporting(true)}><Import size={18}/>{t("Импорт персонажа")}</button>
        
      </div>}
    </main>
    {!isChat&&<nav className="bottom-nav" aria-label={t("Основная навигация")}>{destinations.map(item=><button key={item.id} className={section===item.id?'active':''} aria-current={section===item.id?'page':undefined} onClick={()=>{if(item.id==='library'){setTab('all');setTag('Все');}go(item.id);}}><item.icon size={22}/><span>{t(item.label)}</span></button>)}</nav>}
    <Presence present={!!editor}>{editor&&<CharacterEditor key={editor==='new'?'new':editor.id} character={editor==='new'?undefined:editor} onClose={()=>setEditor(null)} onSaved={saved}/>}</Presence>
    <Presence present={importing}>{importing&&<ImportModal onClose={()=>setImporting(false)} onImported={saved}/>}</Presence>
  <Presence present={!!detail}>{detail&&<Modal title={t("Карточка персонажа")} className="character-details" onClose={()=>setDetail(null)} wide>
      <div className="modal-scroll detail-content">
        <div className="detail-hero">
          {detail.avatar?<img src={detail.avatar} alt=""/>:<div className="detail-placeholder">{detail.card.data.name.slice(0,1)}</div>}
          <div className="detail-hero-copy"><h2>{detail.card.data.name}</h2>{detail.summary&&<p>{detail.summary}</p>}
            <div className="card-tags">{detail.card.data.tags.map(t=><span key={t}>{t}</span>)}</div>
            <button className={'icon-button detail-favorite '+(detail.favorite?'is-favorite':'')} aria-label={detail.favorite?t("В избранном"):t("В избранное")} aria-pressed={detail.favorite} title={detail.favorite?t("Убрать из избранного"):t("В избранное")} onClick={()=>void favorite(detail)}><Bookmark size={21} fill={detail.favorite?'currentColor':'none'}/></button>
          </div>
        </div>
        <div className="detail-start"><label className="new-chat-persona">{t("Ваша персона")}<select aria-label={t("Персона нового чата")} value={(personas.find(p=>p.id===newPersonaId)||personas[0])?.id||''} onChange={e=>setNewPersonaId(e.target.value)}>{personas.map(p=><option key={p.id} value={p.id}>{p.name}{p.isDefault?t(" · по умолчанию"):''}</option>)}</select></label>
          <button className="button primary" disabled={starting} onClick={()=>void start(detail)}><MessageCircle size={18}/>{starting?t("Создаём чат…"):t("Начать новый чат")}</button>
        </div>
        <div className="character-sections">{([
          ['description',t("О персонаже")],['personality',t("Характер")],['scenario',t("Сценарий")],['first_mes',t("Первое сообщение")],['creator_notes',t("Заметки автора")]
        ] as const).map(([key,label])=>detail.card.data[key]&&<details className="character-section" key={key} open={key==='description'}><summary>{t(label)}<ChevronDown size={17}/></summary><div>{key==='first_mes'?<blockquote className="pre-wrap">{detail.card.data[key]}</blockquote>:<p className="pre-wrap">{detail.card.data[key]}</p>}</div></details>)}</div>
        <ErrorBox text={detailError}/>
        {detailChatTotal>0&&<details className="character-section character-histories"><summary><span>{t("Истории с персонажем ")}<small>{detailChatTotal}</small></span><ChevronDown size={17}/></summary>
          <div className="detail-chats">{detailChats.map(t=><button key={t.id} onClick={()=>{setDetail(null);go('chat/'+t.id);}}><MessageSquare size={17}/><span>{t.title}<small>{t.lastMessage}</small></span><ChevronRight size={17}/></button>)}</div>
          {detailChatTotal>10&&<div className="detail-chat-pages"><button className="button small" disabled={detailChatPage===0} onClick={()=>setDetailChatPage(n=>n-1)}>{t("Назад")}</button><span>{detailChatPage+1} / {Math.ceil(detailChatTotal/10)}</span><button className="button small" disabled={(detailChatPage+1)*10>=detailChatTotal} onClick={()=>setDetailChatPage(n=>n+1)}>{t("Далее")}</button></div>}
        </details>}
      </div>
      <footer className="detail-footer"><button className="button danger" aria-label={t("Удалить персонажа")} title={t("Удалить персонажа")} onClick={()=>void remove(detail)}><Trash2 size={16}/><span>{t("Удалить")}</span></button><div><a className="button" href={`/api/characters/${detail.id}/export`} download={`${detail.card.data.name}.json`}><ArrowDownToLine size={16}/><span>{t("Экспорт")}</span></a><button className="button" onClick={()=>{setEditor(detail);setDetail(null);}}><Pencil size={16}/><span>{t("Изменить")}</span></button></div></footer>
    </Modal>}</Presence>
    <Presence present={!!toast}>{toast&&<div className="toast" role="status"><span className="status-dot"/>{toast}<button className="icon-button" aria-label={t("Скрыть уведомление")} onClick={()=>setToast('')}><X size={15}/></button></div>}</Presence>
  </div>;
}
