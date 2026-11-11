import { t, uiLocale } from './i18n';
import { useEffect, useState } from 'react';
import { ArrowUpRight, Check, GitBranch, RefreshCw } from 'lucide-react';
import type { Chat, ChatGenerationSettings, Message, MessageVariantPreview, Model, Settings } from '../shared/types';
import { api, json } from './api';
import { ErrorBox, Loading } from './components';
import { ToolPanel } from './ToolPanel';
import MessageMarkdown from './MessageMarkdown';
import ProviderModels, { useProviders } from './ProviderModels';
import { supportsParameter } from '../shared/types';

const suggestions=['Короче','Больше диалога','Больше деталей','Не описывай мои действия'];
const lengths=[512,1024,2048,4096];
export function RegeneratePanel({onClose,onGenerate,locked=false}:{onClose:()=>void;onGenerate:(wish:string)=>void;locked?:boolean}) {
  const [wish,setWish]=useState('');
  const parts=wish.split(/[;\n]/).map(part=>part.trim()).filter(Boolean);
  function toggle(text:string){
    const exists=parts.some(part=>part.toLowerCase()===text.toLowerCase());
    setWish((exists?parts.filter(part=>part.toLowerCase()!==text.toLowerCase()):[...parts,text]).join('; '));
  }
  return <ToolPanel title={t("Другой ответ")} className="regenerate-panel" onClose={onClose}><form onSubmit={e=>{e.preventDefault();if(!locked)onGenerate(wish.trim());}}><div className="modal-scroll">
    <label>{t("Что изменить?")}<textarea aria-label={t("Пожелание к ответу")} rows={3} maxLength={1200} disabled={locked} placeholder={t("Например, больше диалога и меньше описаний")} value={wish} onChange={e=>setWish(e.target.value)}/></label>
    <div className="wish-chips" aria-label={t("Быстрые пожелания")}>{suggestions.map(key=>{const text=t(key);return <button className="button small" type="button" key={text} disabled={locked} aria-pressed={parts.some(part=>part.toLowerCase()===text.toLowerCase())} onClick={()=>toggle(text)}>{text}</button>;})}</div>
    <p className="field-help">{t("Пожелание необязательно и действует один раз. Прежний ответ останется в вариантах, а его продолжение — в отдельной ветке.")}</p>
  </div><footer><button className="button" type="button" onClick={onClose}>{t("Отмена")}</button><button className="button primary" disabled={locked}><RefreshCw size={16}/>{t("Получить вариант")}</button></footer></form></ToolPanel>;
}

export function VariantsPanel({chatId,message,onClose,onChoose,busy,locked=false}:{chatId:string;message:Message;onClose:()=>void;onChoose:(id:string)=>Promise<void>;busy:boolean;locked?:boolean}) {
  const [variants,setVariants]=useState<MessageVariantPreview[]|null>(null),[error,setError]=useState('');
  useEffect(()=>{let alive=true;void api<MessageVariantPreview[]>(`/chats/${chatId}/messages/${message.id}/variants`).then(value=>{if(alive)setVariants(value);}).catch(e=>{if(alive)setError(e.message);});return()=>{alive=false;};},[chatId,message.id]);
  return <ToolPanel title={t("Варианты ответа")} onClose={()=>{if(!busy)onClose();}} wide><div className="modal-scroll variant-previews"><ErrorBox text={error}/>{!variants&&!error&&<Loading/>}
    {variants?.map((variant,index)=><section className={`variant-preview ${variant.id===message.selectedVariantId?'selected':''}`} key={variant.id}>
      <div className="variant-preview-heading"><strong>{t("Вариант ")}{index+1}</strong>{variant.id===message.selectedVariantId&&<span><Check size={14}/>{t("Выбран")}</span>}<small>{variant.status==='stopped'?t("Остановлен"):variant.status==='error'?t("Ответ прерван"):''}</small></div>
      <div className="variant-preview-text message-text" tabIndex={0} role="region" aria-label={t("Текст варианта {0}",{0:index+1})}><MessageMarkdown content={variant.content||t("Текст ответа не получен.")} streaming={false}/></div>
      <div className="variant-preview-footer"><small>{[variant.providerName,variant.model].filter(Boolean).join(' · ')}</small><button className="button small" disabled={busy||locked||variant.id===message.selectedVariantId} onClick={()=>void onChoose(variant.id)}>{t("Выбрать вариант ")}{index+1}</button></div>
    </section>)}
    <p className="field-help">{t("На телефоне варианты также переключаются горизонтальным свайпом по тексту ответа. Если ниже уже есть переписка, она сохранится в другой ветке.")}</p>
  </div><footer><button className="button" disabled={busy} onClick={onClose}>{t("Закрыть")}</button></footer></ToolPanel>;
}

export function GenerationPanel({chat,onClose,onSaved,locked=false}:{chat:Chat;onClose:()=>void;onSaved:(chat:Chat)=>void;locked?:boolean}) {
  const {providers,error:providerError}=useProviders();
  const [settings,setSettings]=useState<Settings|null>(null),[models,setModels]=useState<Model[]>([]);
  const [value,setValue]=useState<ChatGenerationSettings>(chat.generation||{}),[inherit,setInherit]=useState(!Object.keys(chat.generation||{}).length),[error,setError]=useState(''),[busy,setBusy]=useState(false),[customLimit,setCustomLimit]=useState(false);
  useEffect(()=>{const controller=new AbortController();void api<Settings>('/settings',{signal:controller.signal}).then(result=>{if(!controller.signal.aborted){setSettings(result);setValue({providerId:chat.generation?.providerId??result.providerId,mainModel:chat.generation?.mainModel??result.mainModel,maxTokens:chat.generation?.maxTokens??result.maxTokens,temperature:chat.generation?.temperature??result.temperature});}}).catch(e=>{if(!controller.signal.aborted)setError(e.message);});return()=>controller.abort();},[chat.id]);
  async function save(){if(locked||busy)return;if(!inherit&&!value.mainModel?.trim()){setError(t('Выберите модель для этого провайдера.'));return;}setBusy(true);setError('');try{const updated=await api<Chat>('/chats/'+chat.id+'/generation',{method:'PUT',body:json({generation:inherit?{}:value,expectedRevision:chat.revision})});onSaved(updated);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  const selected=models.find(model=>model.id===value.mainModel),provider=providers.find(p=>p.id===value.providerId),globalProvider=providers.find(p=>p.id===settings?.providerId);
  const showLimit=customLimit||!lengths.includes(value.maxTokens??1024),disabled=busy||locked;
  return <ToolPanel title={t('Модель и ответы')} className="generation-panel" onClose={()=>{if(!busy)onClose();}}><form onSubmit={e=>{e.preventDefault();void save();}}><div className="modal-scroll generation-settings"><ErrorBox text={error||providerError}/>{!settings&&!error&&<Loading/>}{settings&&<>
    <div className="generation-scope segmented-control" role="group" aria-label={t('Источник настроек')}><button type="button" aria-pressed={inherit} disabled={disabled} onClick={()=>setInherit(true)}>{t('Общие')}</button><button type="button" aria-pressed={!inherit} disabled={disabled} onClick={()=>setInherit(false)}>{t('Для этого чата')}</button></div>
    {inherit?<div className="generation-summary"><small>{t('Провайдер')}</small><strong>{globalProvider?.name||t('Подключение недоступно')}</strong><small>{t('Модель')}</small><strong>{settings.mainModel||t('Модель пока не выбрана')}</strong><div className="generation-summary-meta"><span>{t('До ')}{settings.maxTokens.toLocaleString(uiLocale())}{t(' токенов')}</span><span>{t('Температура ')}{settings.temperature.toFixed(2)}</span></div><p className="field-help">{t('Используются общие настройки приложения.')}</p></div>:<fieldset disabled={disabled} className="generation-fields">
      <label>{t('Провайдер')}<select aria-label={t('Провайдер этого чата')} value={value.providerId||''} onChange={e=>{const next=providers.find(p=>p.id===e.target.value);if(next)setValue(v=>({...v,providerId:next.id,mainModel:next.lastModel}));}}>{!provider&&<option value={value.providerId||''}>{t('Подключение недоступно')}</option>}{providers.map(p=><option value={p.id} key={p.id}>{p.name}</option>)}</select></label>
      <ProviderModels providerId={value.providerId||''} modelId={value.mainModel||''} onChange={id=>setValue(v=>({...v,mainModel:id}))} onModels={setModels} compact/>
      <label>{t('Длина ответа')}<select aria-label={t('Длина ответа')} value={showLimit?'custom':value.maxTokens} onChange={e=>{setCustomLimit(e.target.value==='custom');if(e.target.value!=='custom')setValue(v=>({...v,maxTokens:Number(e.target.value)}));}}><option value="512">{t('Короткий · до 512 токенов')}</option><option value="1024">{t('Обычный · до 1024 токенов')}</option><option value="2048">{t('Подробный · до 2048 токенов')}</option><option value="4096">{t('Длинный · до 4096 токенов')}</option><option value="custom">{t('Свой лимит')}</option></select></label>
      {showLimit&&<label>{t('Максимум токенов')}<input aria-label={t('Лимит ответа этого чата')} type="number" min={64} max={32768} required value={value.maxTokens??1024} onChange={e=>setValue(v=>({...v,maxTokens:Number(e.target.value)}))}/></label>}
      <label className="generation-temperature"><span>{t('Температура ')}<output>{(value.temperature??0.85).toFixed(2)}</output></span><input aria-label={t('Температура этого чата')} type="range" min={0} max={2} step={0.05} disabled={!supportsParameter(selected,'temperature')||provider?.compatibility.temperature===false} value={value.temperature??0.85} onChange={e=>setValue(v=>({...v,temperature:Number(e.target.value)}))}/></label>
      <p className="field-help">{t('Только для этой истории и её новых веток. Рассуждения модели тоже входят в лимит ответа.')}</p>
    </fieldset>}
  </>}</div><footer><button type="button" className="button" disabled={busy} onClick={onClose}>{t('Отмена')}</button><button className="button primary" disabled={disabled||!settings}>{busy?t('Сохраняем…'):t('Сохранить')}</button></footer></form></ToolPanel>;
}

export function BranchesPanel({chatId,onClose,onOpen}:{chatId:string;onClose:()=>void;onOpen:(id:string)=>void}) {
  const [branches,setBranches]=useState<Chat[]|null>(null),[error,setError]=useState('');
  useEffect(()=>{let alive=true;void api<Chat[]>(`/chats/${chatId}/branches`).then(value=>{if(alive)setBranches(value);}).catch(e=>{if(alive)setError(e.message);});return()=>{alive=false;};},[chatId]);
  return <ToolPanel title={t("Ветки истории")} onClose={onClose}>
    <div className="modal-scroll"><p className="field-help">{t("Выберите, с какого продолжения вернуться к истории.")}</p><ErrorBox text={error}/>{!branches&&!error&&<Loading/>}
      <div className="branch-list">{branches?.map(branch=>{
        const current=branch.id===chatId;
        const scene=branch.lastMessage?.replace(/[*_`>#]/g,'').replace(/\s+/g,' ').trim().slice(0,240)||t("Первое слово ещё впереди.");
        return <button key={branch.id} className={current?'current':''} aria-current={current?'true':undefined} onClick={()=>{if(!current)onOpen(branch.id);else onClose();}}>
          <span className="branch-icon"><GitBranch size={17}/></span>
          <span className="branch-content">
            <span className="branch-topline"><strong>{branch.title}</strong><time dateTime={branch.updatedAt}>{new Date(branch.updatedAt).toLocaleString(uiLocale(),{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}</time></span>
            <span className="branch-scene">{scene}</span>
            <span className="branch-status">{current?<><Check size={13}/>{t("Сейчас здесь")}</>:<>{t("Открыть продолжение")}<ArrowUpRight size={13}/></>}</span>
          </span>
        </button>;
      })}</div>
    </div><footer><button className="button" onClick={onClose}>{t("Закрыть")}</button></footer>
  </ToolPanel>;
}
