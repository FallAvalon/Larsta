import { t, uiLocale } from './i18n';
import { useEffect, useRef, useState } from 'react';
import { ArrowRight, ChevronLeft, ChevronRight, MessageSquare, Plus, Search, SlidersHorizontal, X } from 'lucide-react';
import type { Character, Chat } from '../shared/types';
import { api } from './api';
import { Avatar, ErrorBox, Loading } from './components';
import { useReadingHeader } from './useReadingHeader';

export type ChatPage = {items:Chat[]; total:number; offset:number; limit:number};
const pageSize=20;
const excerpt=(value:string)=>value.replace(/[*_`>#]/g,'').replace(/\s+/g,' ').trim();

export default function ChatsPage({chats,characters,onOpen,onBrowse}:{
  chats:Chat[];characters:Character[];onOpen:(id:string)=>void;onBrowse:()=>void;
}) {
  const [query,setQuery]=useState(''),[characterId,setCharacterId]=useState(''),[sort,setSort]=useState('recent');
  const [page,setPage]=useState(0),[filters,setFilters]=useState(false);
  const [result,setResult]=useState<ChatPage|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(true);
  const list=useRef<HTMLDivElement>(null),header=useRef<HTMLDivElement>(null);
  const pinned=!!query||filters||!!characterId||sort!=='recent'||loading||!!error;
  const hidden=useReadingHeader(list,header,pinned);
  useEffect(()=>{if(list.current)list.current.scrollTop=0;},[query,characterId,sort,page]);
  useEffect(()=>{
    const controller=new AbortController();
    const timer=setTimeout(()=>{
      setLoading(true);
      const params=new URLSearchParams({limit:String(pageSize),offset:String(page*pageSize),q:query,characterId,sort});
      void api<ChatPage>('/chats?'+params,{signal:controller.signal}).then(value=>{
        if(!controller.signal.aborted){
          if(page>0&&value.items.length===0&&value.total>0){setPage(Math.max(0,Math.ceil(value.total/pageSize)-1));return;}
          setResult(value);setError('');
        }
      }).catch(e=>{if(!controller.signal.aborted)setError(e.message);}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    },query?180:0);
    return()=>{clearTimeout(timer);controller.abort();};
  },[query,characterId,sort,page,chats]);
  const recent=chats[0],featured=!query&&!characterId&&sort==='recent'&&page===0?recent:undefined;
  const characterMap=new Map(characters.map(c=>[c.id,c]));
  const items=result?.items.filter(chat=>chat.id!==featured?.id)||[];
  return <div className="page conversations-page">
    <div ref={header} className={'conversations-header'+(hidden?' is-hidden':'')}><div>
    <a className="mobile-wordmark" href="#chats">Larsta<span>.</span></a>
    <div className="conversations-heading"><div><h1>{t("Чаты ")}<span className="count">{result?.total??chats.length}</span></h1><p>{t("Возвращайтесь туда, где остановилась история.")}</p></div><button className="icon-button page-add" aria-label={t("Новая история")} title={t("Новая история")} onClick={onBrowse}><Plus size={24}/></button></div>
    <div className="conversations-toolbar">
      <div className="conversation-search"><Search size={19}/><input aria-label={t("Поиск чатов")} placeholder={t("Найти историю")} value={query} onChange={e=>{setQuery(e.target.value);setPage(0);}}/>{query&&<button className="icon-button" aria-label={t("Очистить поиск чатов")} onClick={()=>{setQuery('');setPage(0);}}><X size={17}/></button>}</div>
      <button className={'icon-button filter-toggle '+(filters||characterId||sort!=='recent'?'selected':'')} aria-label={t("Фильтры чатов")} aria-expanded={filters} onClick={()=>setFilters(!filters)}><SlidersHorizontal size={20}/></button>
    </div>
    {filters&&<div className="conversation-filters"><label>{t("Персонаж")}<select aria-label={t("Чаты с персонажем")} value={characterId} onChange={e=>{setCharacterId(e.target.value);setPage(0);}}><option value="">{t("Все персонажи")}</option>{characters.map(c=><option key={c.id} value={c.id}>{c.card.data.name}</option>)}</select></label><label>{t("Порядок")}<select aria-label={t("Порядок чатов")} value={sort} onChange={e=>{setSort(e.target.value);setPage(0);}}><option value="recent">{t("Недавние")}</option><option value="oldest">{t("Сначала старые")}</option><option value="name">{t("По названию")}</option></select></label></div>}
    </div></div>
    <ErrorBox text={error}/>
    <div ref={list} className="conversation-scroll" aria-busy={loading} tabIndex={0}>
      {featured&&<section className="resume-section"><div className="section-eyebrow">{t("ПРОДОЛЖИТЬ")}</div><article className="resume-card"><div className="resume-portrait">{featured.avatar?<img src={featured.avatar} alt=""/>:<span>{(featured.characterName||'L').slice(0,1)}</span>}</div><div className="resume-content"><h2>{featured.title}</h2><span>{featured.characterName}</span><p>{excerpt(featured.lastMessage||t("Ваша история ждёт продолжения."))}</p><button className="button primary" onClick={()=>onOpen(featured.id)}>{t("Продолжить")}<ArrowRight size={18}/></button></div></article></section>}
      {featured&&items.length>0&&<h2 className="list-heading">{t("Недавние истории")}</h2>}
      {loading&&!result?<Loading/>:items.length>0?<div className="conversation-list" aria-label={t("Список чатов")}>{items.map(chat=><button className="conversation-row" key={chat.id} onClick={()=>onOpen(chat.id)}>
        <Avatar character={characterMap.get(chat.characterId)}/><div className="conversation-content"><div className="conversation-title"><h2>{chat.title}</h2><time dateTime={chat.updatedAt}>{new Date(chat.updatedAt).toLocaleDateString(uiLocale(),{day:'numeric',month:'short'})}</time></div><p>{excerpt(chat.lastMessage||t("Новая история"))}</p><small>{chat.characterName}{chat.personaName?t(" · Вы: ")+chat.personaName:''}</small></div><ChevronRight size={17}/>
      </button>)}</div>:!featured&&!loading?<div className="empty-simple"><MessageSquare size={35}/><h2>{query||characterId?t("Истории не найдены"):t("С чего начнётся ваша история?")}</h2><p>{query||characterId?t("Попробуйте другой запрос или персонажа."):t("Выберите персонажа и начните разговор.")}</p><button className="button primary" onClick={()=>{if(query||characterId){setQuery('');setCharacterId('');setPage(0);}else onBrowse();}}>{query||characterId?t("Сбросить фильтры"):t("К персонажам")}<ArrowRight size={17}/></button></div>:null}
    </div>
    {!!result&&result.total>pageSize&&<nav className="conversation-pagination" aria-label={t("Страницы чатов")}><span>{page*pageSize+1}–{Math.min((page+1)*pageSize,result.total)} {t(" из ")}{result.total}</span><div><button className="icon-button" aria-label={t("Предыдущая страница чатов")} disabled={page===0||loading} onClick={()=>setPage(page-1)}><ChevronLeft size={19}/></button><span>{page+1} / {Math.ceil(result.total/pageSize)}</span><button className="icon-button" aria-label={t("Следующая страница чатов")} disabled={(page+1)*pageSize>=result.total||loading} onClick={()=>setPage(page+1)}><ChevronRight size={19}/></button></div></nav>}
  </div>;
}
