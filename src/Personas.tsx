import { t, uiLocale } from './i18n';
import { ToolPanel } from './ToolPanel';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Check, ImagePlus, MoreHorizontal, Pencil, Plus, Save, Star, Trash2, UserRound } from 'lucide-react';
import type { Chat, ChatPersona, Persona, PersonaData } from '../shared/types';
import { api, json } from './api';
import { ErrorBox, Modal } from './components';
import { Presence } from './motion';
import { ExpandableTextField } from './TextEditor';

const empty:PersonaData={name:'',appearance:'',personality:'',description:'',avatar:null};
export function PersonaAvatar({persona}:{persona?:Pick<PersonaData,'name'|'avatar'>}) {
  return <div className="avatar user-avatar">{persona?.avatar?<img src={persona.avatar} alt=""/>:<span>{persona?.name.slice(0,1).toUpperCase()||<UserRound size={17}/>}</span>}</div>;
}
function Fields({value,onChange}:{value:PersonaData;onChange:(value:PersonaData)=>void}) {
  return <div className="persona-fields"><label className="persona-name-field">{t("Имя персоны")}<input required maxLength={120} value={value.name} onChange={e=>onChange({...value,name:e.target.value})}/></label>{(['appearance','personality','description'] as const).map((key,index)=><ExpandableTextField className={'persona-field-'+key} key={key} label={[t("Внешность"),t("Характер"),t("Описание и важные детали")][index]} rows={key==='description'?6:3} maxLength={key==='description'?20000:6000} value={value[key]} onChange={text=>onChange({...value,[key]:text})} placeholder={[t("Рост, внешность, одежда и другие приметы"),t("Манера общения, привычки, ценности"),t("Биография, способности, отношения — что собеседнику нужно знать")][index]}/>)}</div>;
}
function PersonaEditor({persona,onClose,onSaved}:{persona?:Persona;onClose:()=>void;onSaved:()=>void}) {
  const [value,setValue]=useState<PersonaData>(persona||empty),[file,setFile]=useState<File|null>(null),[preview,setPreview]=useState(persona?.avatar||''),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const id=useRef(persona?.id);
  useEffect(()=>{if(!file)return;const url=URL.createObjectURL(file);setPreview(url);return()=>URL.revokeObjectURL(url);},[file]);
  async function save(e:React.FormEvent){e.preventDefault();if(busy)return;setBusy(true);setError('');try{
    const p=await api<Persona>(id.current?`/personas/${id.current}`:'/personas',{method:id.current?'PUT':'POST',body:json(value)});id.current=p.id;
    if(file){const body=new FormData();body.append('avatar',file);try{await api(`/personas/${p.id}/avatar`,{method:'POST',body});}catch(e){onSaved();throw new Error(t("Персона сохранена, но аватар не загружен. {0}",{0:(e as Error).message}));}}
    onSaved();onClose();
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  return <Modal title={persona?t("Редактировать персону"):t("Новая персона")} onClose={()=>{if(!busy)onClose();}}><form className="persona-editor-form" onSubmit={e=>void save(e)}><div className="modal-scroll"><p className="muted">{t("Профиль используется для новых чатов. Уже начатые истории хранят свою копию.")}</p><label className="persona-avatar-upload">{preview?<img src={preview} alt={t("Аватар персоны")}/>:<ImagePlus size={25}/>}<span>{t("Выбрать аватар")}<small>{t("PNG, JPEG, WebP или GIF · до 8 МБ")}</small></span><input aria-label={t("Аватар персоны")} type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={e=>{const f=e.target.files?.[0];if(f&&f.size>8*1024*1024){setError(t("Максимальный размер — 8 МБ."));e.target.value='';return;}setFile(f||null);}}/></label><Fields value={value} onChange={setValue}/><ErrorBox text={error}/></div><footer><button type="button" className="button" disabled={busy} onClick={onClose}>{t("Отмена")}</button><button className="button primary" disabled={busy}><Save size={16}/>{busy?t("Сохраняем…"):t("Сохранить персону")}</button></footer></form></Modal>;
}
export default function PersonasPage({personas,onUpdated,notify}:{personas:Persona[];onUpdated:()=>void;notify:(text:string)=>void}) {
  const [editor,setEditor]=useState<Persona|'new'|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState('');
  async function action(p:Persona,mode:'default'|'delete') {
    if(mode==='delete'&&!window.confirm(t("Удалить персону «{0}»? Её копии в существующих чатах останутся.",{0:p.name})))return;
    setBusy(p.id);setError('');try{await api(`/personas/${p.id}${mode==='default'?'/default':''}`,{method:mode==='default'?'POST':'DELETE',...(mode==='default'?{body:'{}'}:{})});onUpdated();}catch(e){setError((e as Error).message);}finally{setBusy('');}
  }
  return <div className="page personas-page">
    <header className="personas-heading"><div><h1>{t("Персоны")}</h1><p>{t("Ваши роли в разговорах с персонажами.")}</p></div><button className="button primary" aria-label={t("Создать персону")} onClick={()=>setEditor('new')}><Plus size={18}/><span>{t("Создать персону")}</span></button></header>
    <ErrorBox text={error}/>
    <div className="persona-list">{personas.map(p=><article className="persona-row" aria-label={p.name} key={p.id}>
      <PersonaAvatar persona={p}/>
      <div className="persona-info"><div className="persona-heading"><h2>{p.name}</h2>{p.isDefault&&<span className="persona-default"><Check size={12}/>{t("По умолчанию")}</span>}</div><p>{p.appearance||p.description||p.personality||t("Добавьте внешность, характер и другие детали своей роли.")}</p></div>
      <div className="persona-row-actions"><button className="button persona-edit" onClick={()=>setEditor(p)} aria-label={t("Изменить персону {0}",{0:p.name})}><Pencil size={16}/><span>{t("Изменить")}</span></button><PersonaMenu persona={p} busy={!!busy} canDelete={personas.length>1} onAction={mode=>void action(p,mode)}/></div>
    </article>)}</div>
    <p className="personas-note">{t("Персона по умолчанию выбирается для новых чатов. В каждой истории можно настроить её отдельную копию.")}</p>
    <Presence present={!!editor}>{editor&&<PersonaEditor key={editor==='new'?'new':editor.id} persona={editor==='new'?undefined:editor} onClose={()=>setEditor(null)} onSaved={()=>{onUpdated();notify(t("Персона сохранена"));}}/>}</Presence>
  </div>;
}
function PersonaMenu({persona,busy,canDelete,onAction}:{persona:Persona;busy:boolean;canDelete:boolean;onAction:(mode:'default'|'delete')=>void}) {
  const [open,setOpen]=useState(false),root=useRef<HTMLDivElement>(null),trigger=useRef<HTMLButtonElement>(null);
  useLayoutEffect(()=>{
    if(!open)return;
    const place=()=>{
      const menu=root.current?.querySelector<HTMLElement>('[role=menu]'),rect=trigger.current?.getBoundingClientRect();if(!menu||!rect)return;
      const viewport=window.visualViewport,bottom=(viewport?.offsetTop||0)+(viewport?.height||innerHeight);
      const nav=document.querySelector('.bottom-nav')?.getBoundingClientRect(),edge=nav&&nav.height?Math.min(bottom,nav.top):bottom;
      const above=rect.bottom+menu.offsetHeight+10>edge&&rect.top>menu.offsetHeight+10;
      menu.style.top=above?'auto':'calc(100% + 6px)';menu.style.bottom=above?'calc(100% + 6px)':'auto';
    };
    place();window.addEventListener('resize',place);window.addEventListener('scroll',place,true);window.visualViewport?.addEventListener('resize',place);
    return()=>{window.removeEventListener('resize',place);window.removeEventListener('scroll',place,true);window.visualViewport?.removeEventListener('resize',place);};
  },[open]);
  useEffect(()=>{
    if(!open)return;
    root.current?.querySelector<HTMLButtonElement>('[role=menuitem]:not(:disabled)')?.focus();
    const outside=(e:PointerEvent)=>{if(!root.current?.contains(e.target as Node))setOpen(false);};
    const escape=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();setOpen(false);trigger.current?.focus();}};
    document.addEventListener('pointerdown',outside);document.addEventListener('keydown',escape);
    return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape);};
  },[open]);
  return <div className="persona-menu" ref={root} onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget))setOpen(false);}}>
    <button ref={trigger} className="icon-button" aria-label={t("Действия с персоной {0}",{0:persona.name})} aria-haspopup="menu" aria-expanded={open} aria-controls={'persona-menu-'+persona.id} disabled={busy} onClick={()=>setOpen(!open)} onKeyDown={e=>{if(e.key==='ArrowDown'){e.preventDefault();setOpen(true);}}}><MoreHorizontal size={21}/></button>
    {open&&<div id={'persona-menu-'+persona.id} role="menu" aria-label={t("Действия с персоной {0}",{0:persona.name})} onKeyDown={e=>{
      const items=Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('[role=menuitem]:not(:disabled)')),index=items.indexOf(document.activeElement as HTMLButtonElement);
      const next=e.key==='Home'?0:e.key==='End'?items.length-1:e.key==='ArrowDown'?(index+1)%items.length:e.key==='ArrowUp'?(index-1+items.length)%items.length:-1;
      if(next>=0){e.preventDefault();items[next]?.focus();}
    }}>
      <button role="menuitem" aria-label={t("По умолчанию: {0}",{0:persona.name})} disabled={busy||persona.isDefault} onClick={()=>{setOpen(false);trigger.current?.focus();onAction('default');}}><Star size={16}/>{persona.isDefault?t("Уже по умолчанию"):t("Выбрать по умолчанию")}</button>
      <button role="menuitem" className="danger-hover" aria-label={t("Удалить персону {0}",{0:persona.name})} disabled={busy||!canDelete} onClick={()=>{setOpen(false);trigger.current?.focus();onAction('delete');}}><Trash2 size={16}/>{t("Удалить персону")}</button>
    </div>}
  </div>;
}
export function ChatPersonaPanel({chat,onClose,onSaved}:{chat:Chat;onClose:()=>void;onSaved:(chat:Chat)=>void}) {
  const initial:ChatPersona=chat.persona||{...empty,name:t("Вы"),sourceId:null};
  const [value,setValue]=useState<ChatPersona>(initial),[personas,setPersonas]=useState<Persona[]>([]),[selected,setSelected]=useState(''),[custom,setCustom]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
  useEffect(()=>{api<Persona[]>('/personas').then(setPersonas).catch(e=>setError(e.message));},[]);
  async function save(e:React.FormEvent){e.preventDefault();if(busy)return;setBusy(true);setError('');try{
    const body=selected&&!custom?{personaId:selected}:{...value,...(selected?{sourceId:selected}:{})};
    const result=await api<Chat>(`/chats/${chat.id}/persona`,{method:'PUT',body:json({...body,expectedRevision:chat.revision})});onSaved(result);onClose();
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  return <ToolPanel title={t("Моя персона в этом чате")} onClose={()=>{if(!busy)onClose();}}><form onSubmit={e=>void save(e)}><div className="modal-scroll"><p className="muted">{t("Изменения действуют только в этой истории со следующего ответа. Переписка сохраняется.")}</p><label>{t("Взять профиль из библиотеки")}<select value={selected} onChange={e=>{setSelected(e.target.value);setCustom(false);const p=personas.find(p=>p.id===e.target.value);setValue(p?{...p,sourceId:p.id}:initial);}}><option value="">{t("Текущая копия чата")}</option>{personas.map(p=><option key={p.id} value={p.id}>{p.name}{p.isDefault?t(" · по умолчанию"):''}</option>)}</select></label><div className="persona-current"><PersonaAvatar persona={value}/><span>{value.name||t("Ваша персона")}</span></div><Fields value={value} onChange={v=>{setValue({...value,...v});setCustom(true);}}/><ErrorBox text={error}/></div><footer><button type="button" className="button" disabled={busy} onClick={onClose}>{t("Отмена")}</button><button className="button primary" disabled={busy}>{busy?t("Сохраняем…"):t("Сохранить для чата")}</button></footer></form></ToolPanel>;
}
