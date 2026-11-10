import { useSyncExternalStore } from 'react';
import { translate,type Language } from '../shared/translations';
const storageKey='larsta-ui-language';
const listeners=new Set<()=>void>();
function read():Language{try{const saved=localStorage.getItem(storageKey);if(saved==='ru'||saved==='en')return saved;}catch{}return navigator.language.toLowerCase().startsWith('ru')?'ru':'en';}
let current=read();
function subscribe(listener:()=>void){listeners.add(listener);return()=>listeners.delete(listener);}
export function setLanguage(language:Language){current=language;try{localStorage.setItem(storageKey,language);}catch{}listeners.forEach(listener=>listener());}
window.addEventListener('storage',event=>{if(event.key===storageKey||event.key===null){current=read();listeners.forEach(listener=>listener());}});
export function useLanguage(){return {language:useSyncExternalStore(subscribe,()=>current),setLanguage};}
export const uiLanguage=()=>current;
export const uiLocale=()=>current==='ru'?'ru-RU':'en-US';
export const t=(text:string,values?:Record<string,string|number>)=>translate(text,current,values);
