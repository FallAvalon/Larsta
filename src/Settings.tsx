import { t, uiLocale, useLanguage } from './i18n';
import { useEffect, useState } from 'react';
import { Paintbrush, SlidersHorizontal, BookOpen, HardDrive, Copy, LoaderCircle, Save, ShieldCheck, Wifi } from 'lucide-react';
import type { Settings as SettingsType } from '../shared/types';
import { api, copyText, json } from './api';
import { ErrorBox, Loading } from './components';
import ChatAppearanceSettings from './ChatAppearance';
import ProviderSettings from './ProviderSettings';
import { providersChanged } from './ProviderModels';
type SettingsTab='appearance'|'model'|'story'|'server';
export default function Settings({notify,onLogout}:{notify:(s:string)=>void;onLogout?:()=>void}) {
  const {language,setLanguage}=useLanguage();
  const [section,setSection]=useState<SettingsTab>('appearance');
  const [saved,setSaved]=useState<SettingsType|null>(null);
  const [value,setValue]=useState<SettingsType|null>(null),[urls,setUrls]=useState<string[]>([]);
  const [error,setError]=useState(''),[busy,setBusy]=useState(false);
  const set=<K extends keyof SettingsType>(key:K,v:SettingsType[K])=>setValue(s=>s?{...s,[key]:v}:s);
  useEffect(()=>{api<SettingsType>('/settings').then(result=>{setValue(result);setSaved(result);}).catch(e=>setError(e.message));api<{urls:string[]}>('/connection').then(v=>setUrls(v.urls)).catch(()=>{});},[]);
  async function save(e:React.FormEvent){e.preventDefault();setBusy(true);setError('');try{const result=await api<SettingsType>('/settings',{method:'PUT',body:json(value)});setValue(result);setSaved(result);providersChanged();notify(t("Настройки сохранены"));}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  if(!value)return <><ErrorBox text={error}/><Loading/></>;
  const dirty=!!saved&&(JSON.stringify(value)!==JSON.stringify(saved));
  const tabs:{id:SettingsTab;label:string;icon:typeof Paintbrush}[]=[
    {id:'appearance',label:'Оформление',icon:Paintbrush},{id:'model',label:'Модель',icon:SlidersHorizontal},
    {id:'story',label:'История',icon:BookOpen},{id:'server',label:'Сервер',icon:HardDrive}
  ];
  return <div className="settings-page">
    <header className="settings-heading"><h1>{t("Настройки")}</h1></header>
    <div className="settings-workspace">
      <nav className="settings-index" role="tablist" aria-label={t("Разделы настроек")}>{tabs.map((tab,index)=><button key={tab.id} id={'settings-tab-'+tab.id} role="tab" aria-selected={section===tab.id} aria-controls="settings-content" tabIndex={section===tab.id?0:-1} onClick={()=>setSection(tab.id)} onKeyDown={event=>{
        const direction=['ArrowDown','ArrowRight'].includes(event.key)?1:['ArrowUp','ArrowLeft'].includes(event.key)?-1:0;
        const next=event.key==='Home'?0:event.key==='End'?tabs.length-1:direction?(index+direction+tabs.length)%tabs.length:-1;
        if(next>=0){event.preventDefault();setSection(tabs[next].id);document.getElementById('settings-tab-'+tabs[next].id)?.focus();}
      }}><tab.icon size={18}/><span>{t(tab.label)}</span></button>)}</nav>
      <form className="settings-body" onSubmit={save}>
        <div id="settings-content" className="settings-panel" role="tabpanel" aria-labelledby={'settings-tab-'+section}>
          <fieldset disabled={busy}>
            {section==='appearance'&&<section className="settings-section"><div className="section-title"><div className="section-number">Aa</div><div><h2>{t("Оформление чата")}</h2><p>{t("Изменения сохраняются на этом устройстве сразу.")}</p></div></div><label className="language-setting">{t("Язык интерфейса")}<select aria-label={t("Язык интерфейса")} value={language} onChange={e=>setLanguage(e.target.value as 'ru'|'en')}><option value="ru">Русский</option><option value="en">English</option></select><small>{t("Язык сохраняется только на этом устройстве.")}</small></label><ChatAppearanceSettings/></section>}
            {section==='model'&&<ProviderSettings value={value} onChange={setValue} notify={notify}/>}
            {section==='story'&&<section className="settings-section"><div className="section-title"><div className="section-number">03</div><div><h2>{t("Правила истории")}</h2><p>{t("Общие инструкции для всех новых ответов.")}</p></div></div><label>{t("Системный промпт")}<textarea rows={8} value={value.systemPrompt} maxLength={50000} onChange={e=>set('systemPrompt',e.target.value)}/></label><p className="field-help">{t("Доступны подстановки ")}{'{{char}}'} {t(" и ")}{'{{user}}'}{t(". Карточка и персона добавляются отдельно. Изменения действуют со следующего ответа.")}</p></section>}
            {section==='server'&&<><section className="settings-section"><div className="section-title"><Wifi size={21}/><div><h2>{t("Открыть на телефоне")}</h2><p>{t("Подключите устройства к одной сети Wi‑Fi.")}</p></div></div><div className="network-addresses">{urls.map((url,i)=><div key={url}><span><small>{i===0?t("На этом компьютере"):t("Адрес в локальной сети")}</small><code>{url}</code></span><button type="button" className="icon-button" aria-label={t("Скопировать {0}",{0:url})} onClick={()=>void copyText(url).then(()=>notify(t("Адрес скопирован"))).catch(e=>notify(e.message))}><Copy size={17}/></button></div>)}</div><p className="field-help">{t("Введите на телефоне код из окна сервера. Подключённое устройство получает доступ ко всем чатам и настройкам. Используйте доверенную домашнюю сеть: соединение HTTP. Не открывайте порт в интернет. Если адресов несколько, выберите адрес Wi‑Fi адаптера.")}</p></section><BackupSettings notify={notify}/>{onLogout&&<div className="device-settings"><div><h3>{t("Это устройство")}</h3><p>{t("После отключения для входа понадобится код сервера.")}</p></div><button className="button" type="button" onClick={onLogout}>{t("Отключить")}</button></div>}</>}
          </fieldset>
        </div>
        <ErrorBox text={error}/>
        {dirty&&<footer className="settings-actions"><span>{t("Есть несохранённые изменения")}</span><button className="button primary" disabled={busy}>{busy?<LoaderCircle size={17} className="spin"/>:<Save size={17}/>}{t("Сохранить изменения")}</button></footer>}
      </form>
    </div>
  </div>;
}

type Backup={id:string;createdAt:string;reason:string;bytes:number};
function BackupSettings({notify}:{notify:(text:string)=>void}){
  const [copies,setCopies]=useState<Backup[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const refresh=()=>api<Backup[]>('/backups').then(setCopies);
  useEffect(()=>{void refresh().catch(e=>setError(e.message));},[]);
  async function create(){
    setBusy(true);setError('');
    try{await api('/backups',{method:'POST',body:'{}'});await refresh();notify(t("Резервная копия создана и проверена."));}
    catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  async function verify(id:string){
    setBusy(true);setError('');
    try{await api('/backups/'+id+'/verify',{method:'POST',body:'{}'});notify(t("Резервная копия прошла проверку."));}
    catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  return <section className="settings-section backup-section"><div className="section-title"><ShieldCheck size={21}/><div><h2>{t("Резервные копии")}</h2><p>{t("Переписка, персонажи и изображения.")}</p></div></div><p className="field-help">{t("Копии создаются ежедневно во время работы сервера и перед обновлением базы. Они хранятся на домашнем сервере. Восстановление выполняется при остановленном сервере.")}</p><ErrorBox text={error}/><button className="button" type="button" disabled={busy} onClick={()=>void create()}>{busy?<LoaderCircle size={17} className="spin"/>:<Save size={17}/>}{t("Создать резервную копию")}</button><div className="backup-list">{copies.slice(0,5).map(copy=><div className="backup-row" key={copy.id}><div><strong>{new Date(copy.createdAt).toLocaleString(uiLocale(),{day:'numeric',month:'long',hour:'2-digit',minute:'2-digit'})}</strong><small>{copy.reason==='daily'?t("Ежедневная"):copy.reason==='before-migration'?t("Перед обновлением"):t("Ручная")} · {(copy.bytes/1024/1024).toFixed(1)} {t(" МБ")}</small></div><button type="button" className="button small" disabled={busy} onClick={()=>void verify(copy.id)}>{t("Проверить")}</button></div>)}</div>{!copies.length&&<p className="field-help">{t("Пока нет сохранённых копий.")}</p>}</section>;
}
