import { createParser } from 'eventsource-parser';
import type { Model, Settings, ProviderConfig } from '../shared/types.js';
import { AppError } from './domain.js';
export type Fetcher = typeof fetch;
export class OpenAIClient {
  private cache: { models: Model[]; at: number } | null = null;
  constructor(private fetcher: Fetcher = fetch, private base = 'https://openrouter.ai/api/v1', private provider?: ProviderConfig) {this.base=base.replace(/\/+$/,'');}
  peekModels():Model[] {return this.cache?.models??[];}
  private headers(key:string,profile:Settings['clientProfile']='larsta'):Record<string,string> {
    const headers:Record<string,string>={'Content-Type':'application/json'};
    if(key&&this.provider?.auth!=='none')headers.Authorization=`Bearer ${key}`;
    if(!this.provider||this.provider.kind==='openrouter')Object.assign(headers,profile==='opencode'?{'HTTP-Referer':'https://opencode.ai/','X-Title':'opencode'}:{'X-Title':'Larsta'});
    return headers;
  }
  async verifyKey(key:string,signal:AbortSignal) {
    let response:Response;
    try{response=await this.fetcher(`${this.base}/key`,{headers:this.headers(key),signal,redirect:'error'});}
    catch(e){if(signal.aborted)throw e;throw new AppError(502,'Нет соединения с провайдером. Проверьте адрес и запущен ли сервер.','PROVIDER_NETWORK');}
    const payload=await errorPayload(response);
    if(signal.aborted)throw signal.reason;
    if(!response.ok)throw providerError(response.status,response.headers.get('retry-after'));
    if(!payload||typeof payload!=='object'||Array.isArray(payload)||'error' in payload)throw new AppError(502,'Провайдер вернул некорректный ответ проверки ключа.','PROVIDER_INVALID_RESPONSE');
  }
  async models(force = false,key='',signal?:AbortSignal,attempts=3): Promise<Model[]> {
    if (!force && this.cache && Date.now()-this.cache.at < 300_000) return this.cache.models;
    let diagnostic='';
    for(let attempt=0;attempt<attempts;attempt++) {
      let retry=true;
      try {
      const res = await this.fetcher(`${this.base}/models`, {headers:this.headers(key),signal:signal?AbortSignal.any([signal,AbortSignal.timeout(15_000)]):AbortSignal.timeout(15_000),redirect:'error'});
      if (!res.ok) {
        diagnostic=`HTTP_${res.status}`;
        retry=res.status===429 || res.status>=500;
        await res.body?.cancel().catch(()=>{});
        if(this.provider&&[401,403].includes(res.status))throw providerError(res.status);
        if(!retry)break;
      } else {
      const json = await res.json() as {data:Model[]};
      if (!Array.isArray(json?.data)) {diagnostic='INVALID_RESPONSE';break;}
      const models = normalizeModels(json.data,this.provider);
      this.cache = { models, at:Date.now() }; return models;
      }
      } catch(error) {
        if(error instanceof AppError||signal?.aborted)throw error;
        if(error instanceof SyntaxError) {diagnostic='INVALID_RESPONSE';retry=false;}
        else if(error instanceof Error && error.name==='TimeoutError') diagnostic='TIMEOUT';
        else {
          const cause=error && typeof error==='object' ? (error as {code?:unknown;cause?:{code?:unknown}}) : undefined;
          const code=cause?.code??cause?.cause?.code;
          diagnostic=typeof code==='string' && /^(?:E[A-Z0-9_]{1,40}|UND_ERR_[A-Z0-9_]{1,40}|CERT_[A-Z0-9_]{1,40}|DEPTH_ZERO_SELF_SIGNED_CERT|UNABLE_TO_[A-Z0-9_]{1,40})$/.test(code)?code:'NETWORK_ERROR';
        }
      }
      if(!retry || attempt===attempts-1)break;
      await new Promise(resolve=>setTimeout(resolve,300*(attempt+1)));
    }
    throw new AppError(502,`${this.provider?'Не удалось загрузить каталог провайдера. Проверьте адрес или введите ID модели вручную.':'Не удалось загрузить каталог OpenRouter. Проверьте интернет или введите ID модели вручную.'}${diagnostic?` Код сбоя: ${diagnostic}.`:''}`,'CATALOG_UNAVAILABLE');
  }
  async stream(key: string, body: Record<string, unknown>, signal: AbortSignal, delta: (value:string)=>void, reasoning: (value:string)=>void = ()=>{}, clientProfile: Settings['clientProfile'] = 'larsta') {
    let res: Response;
    // OpenRouter may try another provider endpoint for this exact model ID if the first
    // endpoint times out. The model slug remains fixed, so this never changes to another model.
    const failure=this.provider?providerError:routerError;
    const request:Record<string,unknown>={...body,stream:true};
    if(!this.provider||this.provider.kind==='openrouter')request.provider={allow_fallbacks:true};
    if(this.provider){const options=this.provider.compatibility;
      if(options.tokenLimit!=='max_tokens'){if(options.tokenLimit!=='none'&&request.max_tokens!==undefined)request[options.tokenLimit]=request.max_tokens;delete request.max_tokens;}
      if(options.tokenLimit==='none')delete request.max_completion_tokens;
      if(!options.temperature)delete request.temperature;
      if(options.reasoning==='none')delete request.reasoning;
      else if(options.reasoning==='reasoning_effort'&&request.reasoning){request.reasoning_effort=(request.reasoning as {effort:string}).effort;delete request.reasoning;}
    }
    try { res = await this.fetcher(`${this.base}/chat/completions`, { method:'POST', headers:this.headers(key,clientProfile), body:JSON.stringify(request), signal,redirect:'error' }); }
    catch (e) { if(signal.aborted) throw e; const detail=safeErrorKind(e); throw new AppError(502,`${this.provider?'Нет соединения с провайдером. Проверьте адрес и запущен ли сервер.':'Нет соединения с OpenRouter. Проверьте интернет.'}${detail?` Код сбоя: ${detail}.`:''}`,'PROVIDER_NETWORK'); }
    if (!res.ok) {
      const payload=await errorPayload(res);
      const detail=payload && typeof payload==='object' ? (payload as {error?:unknown}).error : undefined;
      throw failure(res.status, res.headers.get('retry-after'), detail);
    }
    if (!res.body) throw new AppError(502,'Провайдер вернул пустой ответ. Повторите запрос.');
    const contentType=res.headers.get('content-type')||'';
    if(!contentType.toLowerCase().includes('text/event-stream')) {
      const parsed=await errorPayload(res,2_000_000) as {error?:unknown;choices?:{message?:{content?:unknown;reasoning?:unknown}}[]} | undefined;
      const detail=parsed && typeof parsed==='object' ? (parsed as {error?:unknown}).error : undefined;
      if(detail) {
        const status=errorStatus(detail,res.status);
        throw failure(status,res.headers.get('retry-after'),detail);
      }
      const message=parsed?.choices?.[0]?.message;
      if(typeof message?.content==='string'&&message.content){if(typeof message.reasoning==='string')reasoning(message.reasoning);delta(message.content);return;}
      throw new AppError(502,`Провайдер вернул ответ не в формате потока (HTTP ${res.status}). Повторите запрос позже.`);
    }
    let completed = false, emitted = false, reasoned = false, finishReason: string | null = null, streamError: Error | null = null;
    const parser = createParser({ onEvent(event) {
      if (streamError || completed) return;
      if (event.data === '[DONE]') { completed = true; return; }
      let chunk;
      try { chunk = JSON.parse(event.data); if(!chunk || typeof chunk!=='object' || Array.isArray(chunk))throw new Error(); }
      catch { streamError = new AppError(502,'Провайдер прислал некорректный поток. Полученная часть ответа сохранена.'); return; }
      if (chunk.error || chunk.choices?.[0]?.finish_reason === 'error') { streamError = failure(errorStatus(chunk.error,502), null, chunk.error); return; }
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
      throw new AppError(502,`Поток провайдера оборвался. Полученная часть ответа сохранена.${detail?` Код сбоя: ${detail}.`:''}`);
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
function errorStatus(detail:unknown,fallback:number){
  const code=detail&&typeof detail==='object'?(detail as {code?:unknown}).code:undefined;
  const names:Record<string,number>={BAD_REQUEST:400,UNAUTHORIZED:401,INVALID_API_KEY:401,INSUFFICIENT_BALANCE:402,FORBIDDEN:403,NOT_FOUND:404,TOO_MANY_REQUESTS:429,SERVICE_UNAVAILABLE:503};
  return typeof code==='string'&&Object.hasOwn(names,code)?names[code]:Number(code)||fallback;
}
async function errorPayload(response:Response,limit=65536):Promise<unknown> {
  if(!response.body)return undefined;
  const reader=response.body.getReader(),decoder=new TextDecoder();let text='',size=0;
  try {
    while(size<limit){const {done,value}=await reader.read();if(done)break;const part=value.subarray(0,limit-size);size+=part.byteLength;text+=decoder.decode(part,{stream:true});}
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
  const name=typeof error.name==='string'&&/^(?:TypeError|Error|TimeoutError|AbortError)$/.test(error.name)?error.name:'';
  const candidate=error.code??error.cause?.code;
  const code=typeof candidate==='string'&&/^(?:E[A-Z0-9_]{1,40}|UND_ERR_[A-Z0-9_]{1,40}|CERT_[A-Z0-9_]{1,40})$/.test(candidate)?candidate:'';
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
export function normalizeModels(input:unknown[],provider?:ProviderConfig):Model[] {
  const result:Model[]=[],seen=new Set<string>();
  for(const value of input){
    if(!value||typeof value!=='object')continue;
    const m=value as Record<string,any>;
    if(typeof m.id!=='string'||!m.id.trim()||m.id.length>500||seen.has(m.id))continue;
    if((Array.isArray(m.architecture?.output_modalities)&&!m.architecture.output_modalities.includes('text'))||['embedding','image','audio','video','rerank'].includes(m.type))continue;
    const top=m.top_provider,polza=provider?.kind==='polza',price=polza?(top?.pricing??m.pricing):m.pricing;
    const number=(v:unknown)=>{if(typeof v!=='number'&&typeof v!=='string')return '-1';const n=Number(v);return v!==''&&Number.isFinite(n)&&n>=0?String(n):'-1';};
    const perToken=(v:unknown)=>{const n=number(v);return Number(n)>=0?String(Number(n)/1e6):'-1';};
    const parameters=Array.isArray(m.supported_parameters)?m.supported_parameters:Array.isArray(top?.supported_parameters)?top.supported_parameters:undefined;
    const completion=positiveNumber(m.max_completion_tokens??top?.max_completion_tokens);
    result.push({id:m.id,name:typeof m.name==='string'?m.name:m.id,...(provider?{providerId:provider.id}:{}),context_length:positiveNumber(m.context_length??top?.context_length)??0,
      pricing:{prompt:polza?perToken(price?.prompt_per_million):number(price?.prompt),completion:polza?perToken(price?.completion_per_million):number(price?.completion),request:polza?(price?.request_per_thousand==null?'0':number(price.request_per_thousand)==='-1'?'-1':String(Number(price.request_per_thousand)/1000)):number(price?.request??'0'),currency:typeof price?.currency==='string'?price.currency:polza?'RUB':'USD'},
      supported_parameters:parameters?.filter((p:unknown)=>typeof p==='string')??[],parametersKnown:!!parameters,...(completion?{top_provider:{max_completion_tokens:completion}}:{})});seen.add(m.id);
  }return result;
}

// Only our own descriptions and bounded status codes cross the API boundary.
// Upstream prose can echo a key or an entire private prompt.
export function providerError(status:number,retryAfter?:string|null,_detail?:unknown):AppError {
  const messages:Record<number,string>={
    400:'Провайдер отклонил параметры. Проверьте ID модели и настройки совместимости.',
    401:'Провайдер не принял API-ключ. Обновите ключ подключения.',
    402:'Недостаточно средств или исчерпан бюджет ключа провайдера.',
    403:'Провайдер отклонил доступ. Проверьте разрешения ключа и модели.',
    404:'Модель или адрес API не найдены. Проверьте Base URL и ID модели.',
    408:'Провайдер не успел ответить. Повторите запрос позже.',
    413:'Запрос слишком большой для провайдера. Уменьшите бюджет контекста или размер карточки.',
    422:'Модель отклонила параметры запроса. Проверьте режим рассуждения и лимит ответа.',
    429:'Достигнут лимит запросов провайдера. Подождите перед повторной попыткой.',
    503:'Выбранная модель сейчас недоступна. Попробуйте позже или выберите другую модель.',
    504:'Провайдер не успел ответить. Полученная часть сохранена.',
    529:'Провайдер перегружен. Повторите запрос позже.'
  };
  const seconds=retrySeconds(retryAfter),safeStatus=Number.isInteger(status)&&status>=400&&status<=599?status:502;
  return new AppError(safeStatus===401||safeStatus===403?502:safeStatus,[messages[safeStatus]??'Провайдер вернул ошибку. Ваша реплика и полученная часть ответа сохранены.',`HTTP_${safeStatus}.`,seconds!==null?`Повторите через ${Math.min(seconds,86400)} с.`:''].filter(Boolean).join(' '),safeStatus===401?'PROVIDER_AUTH':'PROVIDER_ERROR',safeStatus);
}
