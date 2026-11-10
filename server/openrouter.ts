import { createParser } from 'eventsource-parser';
import type { Model, Settings } from '../shared/types.js';
import { AppError } from './domain.js';
export type Fetcher = typeof fetch;
export class RouterClient {
  private cache: { models: Model[]; at: number } | null = null;
  constructor(private fetcher: Fetcher = fetch, private base = 'https://openrouter.ai/api/v1') {}
  async models(force = false): Promise<Model[]> {
    if (!force && this.cache && Date.now()-this.cache.at < 300_000) return this.cache.models;
    let diagnostic='';
    for(let attempt=0;attempt<3;attempt++) {
      let retry=true;
      try {
      const res = await this.fetcher(`${this.base}/models`, {signal:AbortSignal.timeout(15_000)});
      if (!res.ok) {
        diagnostic=`HTTP_${res.status}`;
        retry=res.status===429 || res.status>=500;
        await res.body?.cancel().catch(()=>{});
        if(!retry)break;
      } else {
      const json = await res.json() as {data:Model[]};
      if (!Array.isArray(json?.data)) {diagnostic='INVALID_RESPONSE';break;}
      const models = json.data.filter(m=>m && typeof m.id==='string' && (!Array.isArray(m.architecture?.output_modalities) || m.architecture.output_modalities.includes('text'))).map(m=>({
        id:m.id, name:typeof m.name==='string'?m.name:m.id,
        context_length:positiveNumber(m.context_length)??0,
        pricing:{prompt:String(m.pricing?.prompt??'-1'),completion:String(m.pricing?.completion??'-1'),request:String(m.pricing?.request??'0')},
        supported_parameters:Array.isArray(m.supported_parameters)?m.supported_parameters.filter(p=>typeof p==='string'):[],
        ...(positiveNumber(m.top_provider?.max_completion_tokens)?{top_provider:{max_completion_tokens:positiveNumber(m.top_provider?.max_completion_tokens)}}:{})
      }));
      this.cache = { models, at:Date.now() }; return models;
      }
      } catch(error) {
        if(error instanceof SyntaxError) {diagnostic='INVALID_RESPONSE';retry=false;}
        else if(error instanceof Error && error.name==='TimeoutError') diagnostic='TIMEOUT';
        else {
          const cause=error && typeof error==='object' ? (error as {code?:unknown;cause?:{code?:unknown}}) : undefined;
          const code=cause?.code??cause?.cause?.code;
          diagnostic=typeof code==='string' && /^(?:E[A-Z0-9_]{1,40}|UND_ERR_[A-Z0-9_]{1,40}|CERT_[A-Z0-9_]{1,40}|DEPTH_ZERO_SELF_SIGNED_CERT|UNABLE_TO_[A-Z0-9_]{1,40})$/.test(code)?code:'NETWORK_ERROR';
        }
      }
      if(!retry || attempt===2)break;
      await new Promise(resolve=>setTimeout(resolve,300*(attempt+1)));
    }
    throw new AppError(502,`Не удалось загрузить каталог OpenRouter. Проверьте интернет или введите ID модели вручную.${diagnostic?` Код сбоя: ${diagnostic}.`:''}`);
  }
  async stream(key: string, body: Record<string, unknown>, signal: AbortSignal, delta: (value:string)=>void, reasoning: (value:string)=>void = ()=>{}, clientProfile: Settings['clientProfile'] = 'larsta') {
    let res: Response;
    // OpenRouter may try another provider endpoint for this exact model ID if the first
    // endpoint times out. The model slug remains fixed, so this never changes to another model.
    const identity:Record<string,string>=clientProfile==='opencode'?{'HTTP-Referer':'https://opencode.ai/','X-Title':'opencode'}:{'X-Title':'Larsta'};
    try { res = await this.fetcher(`${this.base}/chat/completions`, { method:'POST', headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json',...identity}, body:JSON.stringify({...body,stream:true,provider:{allow_fallbacks:true}}), signal }); }
    catch (e) { if(signal.aborted) throw e; const detail=safeErrorKind(e); throw new AppError(502,`Нет соединения с OpenRouter. Проверьте интернет.${detail?` Код сбоя: ${detail}.`:''}`); }
    if (!res.ok) {
      const payload=await errorPayload(res);
      const detail=payload && typeof payload==='object' ? (payload as {error?:unknown}).error : undefined;
      throw routerError(res.status, res.headers.get('retry-after'), detail);
    }
    if (!res.body) throw new AppError(502,'OpenRouter вернул пустой ответ. Повторите запрос.');
    const contentType=res.headers.get('content-type')||'';
    if(!contentType.toLowerCase().includes('text/event-stream')) {
      const parsed=await errorPayload(res);
      const detail=parsed && typeof parsed==='object' ? (parsed as {error?:unknown}).error : undefined;
      if(detail) {
        const status=Number((detail as {code?:unknown})?.code)||res.status;
        throw routerError(status,res.headers.get('retry-after'),detail);
      }
      throw new AppError(502,`OpenRouter вернул ответ не в формате потока (HTTP ${res.status}, ${safeDetail(contentType)||'тип не указан'}). Повторите запрос позже.`);
    }
    let completed = false, emitted = false, reasoned = false, finishReason: string | null = null, streamError: Error | null = null;
    const parser = createParser({ onEvent(event) {
      if (streamError || completed) return;
      if (event.data === '[DONE]') { completed = true; return; }
      let chunk;
      try { chunk = JSON.parse(event.data); if(!chunk || typeof chunk!=='object' || Array.isArray(chunk))throw new Error(); }
      catch { streamError = new AppError(502,'OpenRouter прислал некорректный поток. Полученная часть ответа сохранена.'); return; }
      if (chunk.error || chunk.choices?.[0]?.finish_reason === 'error') { streamError = routerError(Number(chunk.error?.code) || 502, null, chunk.error); return; }
      const update = chunk.choices?.[0]?.delta;
      const thought = typeof update?.reasoning==='string' ? update.reasoning : typeof update?.reasoning_content==='string' ? update.reasoning_content : Array.isArray(update?.reasoning_details) ? update.reasoning_details.map((item:any)=>typeof item?.text==='string'?item.text:'').join('') : '';
      if(thought) {reasoned=true;reasoning(thought);}
      const content = update?.content;
      if (typeof content === 'string' && content) { emitted = true; delta(content); }
      if (chunk.choices?.[0]?.finish_reason) {finishReason=chunk.choices[0].finish_reason;completed=true;}
    }});
    const reader = res.body.getReader(), decoder = new TextDecoder();
    try {
      while (true) { const {done,value} = await reader.read(); if(done) break; parser.feed(decoder.decode(value,{stream:true})); if(streamError) throw streamError; if(completed)break; }
      parser.feed(decoder.decode());
      if(streamError) throw streamError;
      if(!completed) throw new AppError(502,'Соединение оборвалось до завершения ответа. Полученная часть сохранена.');
      if(!emitted && reasoned && finishReason==='length') throw new AppError(502,'Модель израсходовала лимит токенов на рассуждение и не дошла до ответа. Увеличьте максимум токенов ответа в настройках или снизьте уровень рассуждения.');
      if(!emitted) throw new AppError(502,reasoned?'Модель передала рассуждение, но не вернула текст ответа. Повторите запрос или увеличьте максимум токенов ответа.':'Модель не вернула текст. Проверьте ограничения модели и повторите запрос.');
    } catch(e) {
      if(e instanceof AppError || signal.aborted) throw e;
      const detail=safeErrorKind(e);
      throw new AppError(502,`Поток OpenRouter оборвался. Полученная часть ответа сохранена.${detail?` Код сбоя: ${detail}.`:''}`);
    } finally { await reader.cancel().catch(()=>{}); reader.releaseLock(); }
  }
}
export function routerError(status: number, retryAfter?: string | null, detail?: unknown) {
  const error = detail && typeof detail === 'object' ? detail as {message?:unknown;metadata?:{error_type?:unknown;provider_code?:unknown}} : undefined;
  // OpenRouter error messages are useful for diagnosing provider-side failures. Keep them
  // short, strip control characters and credentials, and never log them server-side.
  const safeMessage = safeDetail(error?.message);
  const errorType = safeDetail(error?.metadata?.error_type);
  const providerCode = safeDetail(error?.metadata?.provider_code);
  const diagnostic = [errorType, providerCode].filter(Boolean).join(' / ');
  const messages: Record<number,string> = {
    400:'OpenRouter отклонил параметры. Проверьте ID модели, длину контекста и настройки ответа.',
    401:'OpenRouter не принял API-ключ. Обновите ключ в настройках.',
    402:'Недостаточно средств или исчерпан бюджет ключа OpenRouter. Выберите доступную бесплатную модель самостоятельно.',
    403:'OpenRouter отклонил запрос: проверьте разрешения ключа и ограничения модели.',
    404:'Модель не найдена. Обновите каталог или проверьте её ID.',
    408:'OpenRouter не успел ответить. Повторите запрос позже.',
    413:'Запрос слишком большой для провайдера. Уменьшите бюджет контекста или размер карточки.',
    422:'Модель отклонила параметры запроса. Проверьте режим рассуждения и лимит ответа.',
    429:'Достигнут лимит запросов OpenRouter. Подождите перед повторной попыткой.',
    500:'Внутренняя ошибка OpenRouter или провайдера. Попробуйте позже.',
    502:'Провайдер модели вернул ошибку. Попробуйте позже или самостоятельно выберите другую модель.',
    503:'Выбранная модель сейчас недоступна. Попробуйте позже или выберите другую модель.',
    504:'Провайдер модели не успел ответить. Полученная часть сохранена; повторите запрос позже.',
    524:'Провайдер модели превысил время ожидания. Полученная часть сохранена; повторите запрос позже.',
    529:'Провайдер перегружен. Повторите запрос позже или выберите другую модель вручную.'
  };
  const known = messages[status];
  const fallback = status>=400 && status<=599 ? `OpenRouter вернул ошибку ${status}. Реплика и полученная часть ответа сохранены.` : 'OpenRouter прервал поток. Реплика и полученная часть ответа сохранены.';
  const retryText=retrySeconds(retryAfter);
  const message = [known || fallback, diagnostic, safeMessage, retryText!==null?`Повторите через ${retryText} с.`:'' ].filter(Boolean).join(' ');
  return new AppError(status>=400 && status<=599 ? status : 502, message);
}
function parseJson(text:string):unknown { try{return JSON.parse(text);}catch{return undefined;} }
async function errorPayload(response:Response):Promise<unknown> {
  if(!response.body)return undefined;
  const reader=response.body.getReader(),decoder=new TextDecoder();let text='',size=0;
  try {
    while(size<65536){const {done,value}=await reader.read();if(done)break;const part=value.subarray(0,65536-size);size+=part.byteLength;text+=decoder.decode(part,{stream:true});}
    return parseJson(text+decoder.decode());
  } catch {return undefined;} finally {await reader.cancel().catch(()=>{});reader.releaseLock();}
}
function safeDetail(value:unknown):string {
  const raw=value instanceof Error?`${value.name}: ${value.message}`:typeof value==='string'?value:'';
  return raw.replace(/[\u0000-\u001f\u007f]/g,' ').replace(/sk-or-v1-[A-Za-z0-9_-]+/gi,'[ключ скрыт]')
    .replace(/Bearer\s+\S+/gi,'Bearer [скрыто]').replace(/(authorization|api[_ -]?key)\s*[:=]\s*\S+/gi,'$1=[скрыто]').replace(/\s+/g,' ').trim().slice(0,240);
}
function safeErrorKind(value:unknown):string {
  if(!value || typeof value!=='object')return '';
  const error=value as {name?:unknown;code?:unknown;cause?:{code?:unknown}};
  const name=typeof error.name==='string'?error.name:'';
  const candidate=error.code??error.cause?.code;
  const code=typeof candidate==='string'||typeof candidate==='number'?String(candidate):'';
  return safeDetail([name,code].filter(Boolean).join(' / ')).slice(0,100);
}
function retrySeconds(value?:string|null):number|null {
  if(!value)return null;
  if(/^\d+$/.test(value))return Number(value);
  const at=Date.parse(value);return Number.isFinite(at)?Math.max(0,Math.ceil((at-Date.now())/1000)):null;
}
function positiveNumber(value:unknown):number|null {
  if(typeof value!=='number'&&typeof value!=='string')return null;
  const number=Number(value);return Number.isFinite(number)&&number>0?number:null;
}
