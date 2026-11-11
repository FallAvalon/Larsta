import { useCallback, useEffect, useState } from 'react';
import { Check, RefreshCw } from 'lucide-react';
import type { Model, Provider } from '../shared/types';
import { isFreeModel } from '../shared/providers';
import { api } from './api';
import { ErrorBox, Loading } from './components';
import { t, uiLocale } from './i18n';

const empty:Model[]=[];
export function providersChanged(){window.dispatchEvent(new Event('larsta-providers-changed'));}
export function useProviders(){
  const [providers,setProviders]=useState<Provider[]>([]),[error,setError]=useState(''),[revision,setRevision]=useState(0);
  const refresh=useCallback(()=>setRevision(v=>v+1),[]);
  useEffect(()=>{window.addEventListener('larsta-providers-changed',refresh);return()=>window.removeEventListener('larsta-providers-changed',refresh);},[refresh]);
  useEffect(()=>{const controller=new AbortController();void api<Provider[]>('/providers',{signal:controller.signal}).then(value=>{if(!controller.signal.aborted){setProviders(value);setError('');}}).catch(e=>{if(!controller.signal.aborted)setError(e.message);});return()=>controller.abort();},[revision]);
  return {providers,error,refresh};
}
export function modelPrice(model:Model){
  if(isFreeModel(model))return t('Бесплатно');
  if(Number(model.pricing.prompt)<0||Number(model.pricing.completion)<0)return t('Цена не указана');
  return t('{0} {1} / 1М вх.',{0:(Number(model.pricing.prompt)*1e6).toLocaleString(uiLocale(),{maximumFractionDigits:3}),1:model.pricing.currency??'USD'});
}
export default function ProviderModels({providerId,modelId,onChange,onModels,compact=false}:{providerId:string;modelId:string;onChange:(id:string)=>void;onModels?:(models:Model[])=>void;compact?:boolean}){
  const [catalog,setCatalog]=useState<{providerId:string;models:Model[]}>({providerId:'',models:[]}),[loading,setLoading]=useState(false),[error,setError]=useState(''),[refresh,setRefresh]=useState(0),[search,setSearch]=useState(''),[free,setFree]=useState(false);
  const models=catalog.providerId===providerId?catalog.models:empty;
  useEffect(()=>{const invalidate=()=>setRefresh(v=>v+1);window.addEventListener('larsta-providers-changed',invalidate);return()=>window.removeEventListener('larsta-providers-changed',invalidate);},[]);
  useEffect(()=>{setSearch('');setFree(false);},[providerId]);
  useEffect(()=>{
    if(!providerId)return;const controller=new AbortController();setLoading(true);setError('');
    void api<Model[]>(`/models?providerId=${encodeURIComponent(providerId)}${refresh?'&refresh=1':''}`,{signal:controller.signal}).then(value=>{if(!controller.signal.aborted)setCatalog({providerId,models:value});}).catch(e=>{if(!controller.signal.aborted)setError(e.message);}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return()=>controller.abort();
  },[providerId,refresh]);
  useEffect(()=>{onModels?.(models);},[models,onModels]);
  const shown=models.filter(m=>(!free||isFreeModel(m))&&`${m.name} ${m.id}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  return <div className={`provider-models${compact?' compact':''}`}>
    <div className="provider-catalog-heading"><label htmlFor={compact?'chat-model-search':'settings-model-search'}>{t('Каталог моделей')}</label><button type="button" className="button small" disabled={loading||!providerId} onClick={()=>setRefresh(v=>v+1)}><RefreshCw size={14} className={loading?'spin':''}/>{t('Каталог')}</button></div>
    <div className="model-controls"><input id={compact?'chat-model-search':'settings-model-search'} aria-label={t('Поиск моделей')} placeholder={t('Поиск по названию или ID модели')} value={search} onChange={e=>setSearch(e.target.value)}/>{!compact&&<label className="check-label"><input type="checkbox" checked={free} onChange={e=>setFree(e.target.checked)}/>{t('Только бесплатные')}</label>}</div>
    <ErrorBox text={error}/>
    {compact?<label className="provider-model-select">{t('Модель')}<select aria-label={t('Модель этого чата')} value={models.some(m=>m.id===modelId)?modelId:''} onChange={e=>{if(e.target.value)onChange(e.target.value);}}><option value="">{loading?t('Загрузка моделей…'):t('Выбрать из каталога')}</option>{shown.map(model=><option key={model.id} value={model.id}>{model.name}</option>)}</select></label>:<div className="model-list" aria-label={t('Каталог моделей')}>
      {loading&&models.length===0?<Loading/>:shown.slice(0,80).map(model=><button type="button" key={model.id} className={`model-option ${modelId===model.id?'selected':''}`} onClick={()=>onChange(model.id)}><span><strong>{model.name}</strong><small>{model.id}</small></span><span className="model-price">{modelPrice(model)}{modelId===model.id&&<Check size={16}/>}</span></button>)}
      {!loading&&!shown.length&&<p className="muted">{t('Модели не найдены. Можно ввести ID ниже.')}</p>}{shown.length>80&&<p className="field-help">{t('Найдено моделей: {0}. Уточните поиск.',{0:shown.length})}</p>}
    </div>}
    <label>{compact?t('ID модели'):t('Основная модель · ID')}<input aria-label={compact?t('ID модели этого чата'):t('Основная модель · ID')} maxLength={500} value={modelId} onChange={e=>onChange(e.target.value.trim())} placeholder="model-id"/></label>
    <p className="field-help">{t('ID можно указать вручную, даже если каталог недоступен. Модель не заменяется автоматически.')}</p>
  </div>;
}
