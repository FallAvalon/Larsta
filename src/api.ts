import { t, uiLanguage } from './i18n';
import { createParser } from 'eventsource-parser';
export async function api<T>(url:string, options:RequestInit = {}):Promise<T> {
  let res: Response;
  const headers=new Headers(options.headers);headers.set('Accept-Language',uiLanguage());
  if(!(options.body instanceof FormData)&&!headers.has('Content-Type'))headers.set('Content-Type','application/json');
  try {res = await fetch(`/api${url}`,{...options,headers});}
  catch {throw new Error(t("Сервер недоступен. Проверьте, что он запущен и устройства подключены к одной сети."));}
  const value = await res.json().catch(()=>({error:'Сервер вернул некорректный ответ.'}));
  if(!res.ok) {if(res.status===401 && url!=='/auth') window.dispatchEvent(new Event('larsta-unauthorized'));throw new Error(value.error || t("Ошибка запроса."));}
  return value as T;
}
export const json = (value:unknown) => JSON.stringify(value);
export function operationId():string {
  if(typeof globalThis.crypto?.randomUUID==='function')return crypto.randomUUID();
  const bytes=crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes,value=>value.toString(16).padStart(2,'0')).join('');
}
export async function readStream(res:Response, handler:(event:string,data:any)=>void, incompleteMessage=t("Соединение прервано. Обновите чат: сервер сохранит полученную часть ответа.")) {
  if(!res.ok) {if(res.status===401)window.dispatchEvent(new Event('larsta-unauthorized'));const data = await res.json().catch(()=>({}));throw new Error(data.error || t("Ошибка генерации."));}
  if(!res.body) throw new Error(t("Поток ответа недоступен."));
  let doneEvent = false;
  const parser = createParser({onEvent(e){const data=JSON.parse(e.data);if(e.event==='done') doneEvent=true;handler(e.event||'message',data);}});
  const reader = res.body.getReader(), decoder = new TextDecoder();
  try {while(true) {const {done,value}=await reader.read();if(done)break;parser.feed(decoder.decode(value,{stream:true}));}parser.feed(decoder.decode());}
  finally {reader.releaseLock();}
  if(!doneEvent) throw new Error(incompleteMessage);
}
export async function copyText(text:string) {
  if(navigator.clipboard && window.isSecureContext) {try{await navigator.clipboard.writeText(text);return;}catch{/* Some mobile browsers deny clipboard permission; try the selection fallback. */}}
  const previous=document.activeElement as HTMLElement|null;
  const selection=previous instanceof HTMLTextAreaElement||previous instanceof HTMLInputElement?{start:previous.selectionStart,end:previous.selectionEnd}:null;
  const el = document.createElement('textarea');el.value=text;el.style.position='fixed';el.style.opacity='0';document.body.append(el);el.select();
  let success=false;try{success=document.execCommand('copy');}finally{el.remove();previous?.focus({preventScroll:true});if(selection&&selection.start!==null&&selection.end!==null&&(previous instanceof HTMLTextAreaElement||previous instanceof HTMLInputElement))previous.setSelectionRange(selection.start,selection.end); }if(!success) throw new Error(t("Копирование недоступно. Выделите и скопируйте текст вручную."));
}
