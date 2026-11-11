import assert from 'node:assert/strict';
import { mkdtempSync,readFileSync,rmSync,mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import express from 'express';
import { createApp } from '../dist-server/server/app.js';
import { defaults } from '../dist-server/server/domain.js';

const {chromium}=await import(process.env.LARSTA_PLAYWRIGHT_MODULE?pathToFileURL(process.env.LARSTA_PLAYWRIGHT_MODULE).href:'playwright');
const dir=mkdtempSync(path.join(tmpdir(),'larsta-ui-providers-')),calls=[];
let slowCatalog=false;
const fetcher=async(input,options)=>{
  const url=new URL(String(input)),headers=new Headers(options?.headers),local=url.hostname==='localhost';
  if(url.pathname.endsWith('/key'))return Response.json({}, {status:headers.get('Authorization')?.includes('invalid')?401:200});
  if(url.pathname.endsWith('/models')){
    if(local&&slowCatalog)await new Promise(r=>setTimeout(r,250));
    if(url.hostname==='manual.fixture.invalid')return Response.json({error:{}},{status:404});
    return Response.json({data:[{id:'shared/model:tag',name:local?'Local story':url.hostname==='polza.ai'?'Cloud story':'Story model',...(url.hostname==='polza.ai'?{top_provider:{pricing:{currency:'RUB',prompt_per_million:15.5,completion_per_million:62}},context_length:64000}:local?{}:{context_length:32768,pricing:{prompt:'0',completion:'0'},supported_parameters:['temperature','max_tokens']})}]});
  }
  assert(url.pathname.endsWith('/chat/completions'));calls.push({url:String(input),headers,body:JSON.parse(String(options.body))});
  if(headers.get('Authorization')?.includes('invalid'))return Response.json({error:{message:'fixture echo '+headers.get('Authorization')}},{status:401});
  return new Response('data: '+JSON.stringify({choices:[{delta:{content:'OK'},finish_reason:'stop'}]})+'\n\n',{headers:{'Content-Type':'text/event-stream'}});
};
const runtime=createApp({dataDir:dir,fetcher}),{app,store,secrets}=runtime;
store.saveSettings({...defaults,mainModel:'shared/model:tag'});secrets.setKey('fixture-original-key');
const character=store.saveCharacter(JSON.parse(readFileSync('examples/character-v2.json','utf8')),''),chat=store.createChat(character.id),other=store.createChat(character.id);
app.use(express.static(path.resolve('dist')));const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port;
let browser,page;const errors=[];
try{
  browser=await chromium.launch({headless:true,channel:process.env.LARSTA_BROWSER_CHANNEL||'chrome'});
  const context=await browser.newContext({locale:'ru-RU',viewport:{width:1440,height:1000},reducedMotion:'reduce'});
  await context.request.post(base+'/api/auth',{data:{code:secrets.connectionCode}});page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(12000);
  await page.goto(base+'/#settings');await page.getByRole('tab',{name:'Модель',exact:true}).click();await page.locator('.provider-row').waitFor();
  async function add(kind,name,key){
    await page.getByRole('button',{name:'Добавить',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Новое подключение',exact:true});await dialog.waitFor();
    await dialog.getByRole('combobox',{name:'Провайдер',exact:true}).selectOption(kind);await dialog.getByRole('textbox',{name:'Название подключения',exact:true}).fill(name);
    if(key)await dialog.getByLabel('API-ключ',{exact:true}).fill(key);
    return dialog;
  }
  let dialog=await add('openrouter','Second OpenRouter','fixture-secondary-key');
  await dialog.getByRole('textbox',{name:'Модель для проверки',exact:true}).fill('shared/model:tag');
  const before=store.messages(chat.id);await dialog.getByRole('button',{name:'Проверить подключение',exact:true}).click();await dialog.getByText('Ключ подтверждён',{exact:true}).waitFor();assert.equal(calls.length,0);
  await dialog.getByRole('button',{name:'Проверить генерацию',exact:true}).click();await dialog.getByText('Генерация работает',{exact:true}).waitFor();assert.equal(calls.length,1);assert.equal(calls[0].body.model,'shared/model:tag');assert.deepEqual(store.messages(chat.id),before);
  await dialog.getByRole('button',{name:'Сохранить подключение',exact:true}).click();await dialog.waitFor({state:'hidden'});await page.waitForFunction(()=>document.querySelectorAll('.provider-row').length===2);assert.equal(store.settings().providerId,'openrouter');assert.equal(store.settings().mainModel,'shared/model:tag');
  dialog=await add('ollama','Local stories');await dialog.getByRole('button',{name:'Сохранить подключение',exact:true}).click();await dialog.waitFor({state:'hidden'});await page.getByRole('button',{name:'Выбрать провайдера Local stories',exact:true}).click();
  await page.getByRole('button',{name:/Local story/}).click();assert(await page.getByRole('slider').isEnabled());assert(await page.getByText('Цена не указана',{exact:true}).isVisible());
  await page.getByRole('button',{name:'Сохранить изменения',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('.settings-actions'));
  const local=store.providers().find(p=>p.name==='Local stories');assert.equal(store.settings().providerId,local.id);
  dialog=await add('polza','Cloud stories','fixture-cloud-key');await dialog.getByRole('button',{name:'Сохранить подключение',exact:true}).click();await dialog.waitFor({state:'hidden'});await page.getByRole('button',{name:'Выбрать провайдера Cloud stories',exact:true}).click();
  await page.getByRole('button',{name:/Cloud story/}).click();assert.match(await page.locator('.model-price').innerText(),/RUB/);assert(!/USD/.test(await page.locator('.model-price').innerText()));
  await page.getByRole('button',{name:'Сохранить изменения',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('.settings-actions'));
  const cloud=store.providers().find(p=>p.name==='Cloud stories');assert.equal(store.settings().providerId,cloud.id);
  mkdirSync('test-results',{recursive:true});await page.screenshot({path:'test-results/providers-desktop.png'});
  slowCatalog=true;await page.getByRole('button',{name:'Выбрать провайдера Local stories',exact:true}).click();await page.getByRole('button',{name:'Каталог',exact:true}).click();await page.getByRole('button',{name:'Выбрать провайдера Cloud stories',exact:true}).click();await page.getByRole('button',{name:/Cloud story/}).waitFor();await page.waitForFunction(()=>!document.querySelector('.provider-models .spin'));assert(!/Local story/.test(await page.locator('.model-list').innerText()));slowCatalog=false;
  await page.goto(base+'/#chat/'+chat.id);await page.getByRole('button',{name:'Модель и ответы',exact:true}).click();await page.getByRole('button',{name:'Для этого чата',exact:true}).click();await page.getByRole('combobox',{name:'Провайдер этого чата',exact:true}).selectOption(local.id);await page.getByRole('combobox',{name:'Модель этого чата',exact:true}).selectOption('shared/model:tag');await page.getByRole('button',{name:'Сохранить',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('.tool-panel'));
  assert.equal(store.chat(chat.id).generation.providerId,local.id);
  await page.getByRole('textbox',{name:'Ваше сообщение',exact:true}).fill('Fixture story message');await page.getByRole('button',{name:'Отправить сообщение',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.message:last-child .message-text')?.textContent==='OK');assert.match(calls.at(-1).url,/localhost:11434/);assert(!calls.at(-1).headers.has('Authorization'));
  await page.goto(base+'/#chat/'+other.id);await page.getByRole('textbox',{name:'Ваше сообщение',exact:true}).fill('Another fixture story');await page.getByRole('button',{name:'Отправить сообщение',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.message:last-child .message-text')?.textContent==='OK');assert.match(calls.at(-1).url,/polza.ai/);assert.equal(calls.at(-1).headers.get('Authorization'),'Bearer fixture-cloud-key');assert.equal(store.settings().providerId,cloud.id);
  for(const width of [390,320]){
    await page.setViewportSize({width,height:844});await page.goto(base+'/#settings');await page.getByRole('tab',{name:'Модель',exact:true}).click();await page.locator('.provider-row').first().waitFor();await page.screenshot({path:'test-results/providers-mobile-'+width+'.png'});
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    await page.getByRole('button',{name:'Изменить подключение Cloud stories',exact:true}).click();dialog=page.getByRole('dialog',{name:'Изменить подключение',exact:true});await dialog.waitFor();await page.screenshot({path:'test-results/provider-editor-'+width+'.png'});assert(await dialog.evaluate(el=>el.getBoundingClientRect().width<=innerWidth));
    await page.setViewportSize({width,height:440});await page.waitForFunction(()=>document.querySelector('.provider-editor')?.getBoundingClientRect().height<=innerHeight);assert(await dialog.evaluate(el=>el.getBoundingClientRect().height<=innerHeight));await dialog.getByRole('button',{name:'Отмена',exact:true}).click();await page.setViewportSize({width,height:844});
  }
  await page.getByRole('tab',{name:'Оформление',exact:true}).click();await page.getByRole('combobox',{name:'Язык интерфейса',exact:true}).selectOption('en');await page.getByRole('tab',{name:'Model',exact:true}).click();
  await page.getByRole('button',{name:'Edit connection Second OpenRouter',exact:true}).click();dialog=page.getByRole('dialog',{name:'Edit connection',exact:true});await dialog.waitFor();
  const key=dialog.getByLabel('API key',{exact:true});assert.equal(await key.inputValue(),'');await key.fill('fixture-invalid-key');await dialog.getByRole('textbox',{name:'Test model',exact:true}).fill('shared/model:tag');await dialog.getByRole('button',{name:'Test generation',exact:true}).click();await dialog.getByRole('alert').waitFor();assert(!/fixture-invalid-key/.test(await dialog.getByRole('alert').innerText()));assert(!/[а-яё]/i.test(await dialog.innerText()));assert.equal((await context.request.get(base+'/api/auth')).status(),200);
  await dialog.getByRole('button',{name:'Cancel',exact:true}).click();await page.getByRole('button',{name:'Edit connection Second OpenRouter',exact:true}).click();dialog=page.getByRole('dialog',{name:'Edit connection',exact:true});await dialog.getByRole('button',{name:'Delete connection',exact:true}).click();await dialog.getByRole('button',{name:'Confirm deletion',exact:true}).click();await dialog.waitFor({state:'hidden'});assert(!store.providers().some(p=>p.name==='Second OpenRouter'));
  await page.getByRole('button',{name:'Add',exact:true}).click();dialog=page.getByRole('dialog',{name:'New connection',exact:true});await dialog.getByRole('combobox',{name:'Provider',exact:true}).selectOption('custom');await dialog.getByRole('textbox',{name:'Connection name',exact:true}).fill('Manual server');await dialog.getByRole('textbox',{name:'Base URL',exact:true}).fill('https://manual.fixture.invalid/api');await dialog.getByRole('combobox',{name:'Authentication',exact:true}).selectOption('none');await dialog.getByRole('button',{name:'Test connection',exact:true}).click();await dialog.getByText('Catalog unavailable. Enter a model ID and test generation.',{exact:true}).waitFor();await dialog.getByRole('textbox',{name:'Test model',exact:true}).fill('fixture/manual:exact');await dialog.getByRole('button',{name:'Test generation',exact:true}).click();await dialog.getByText('Generation works',{exact:true}).waitFor();await dialog.getByRole('button',{name:'Save connection',exact:true}).click();await dialog.waitFor({state:'hidden'});
  await page.getByRole('button',{name:'Select provider Manual server',exact:true}).click();await page.getByRole('button',{name:'Edit connection Manual server',exact:true}).click();dialog=page.getByRole('dialog',{name:'Edit connection',exact:true});await dialog.getByRole('textbox',{name:'Base URL',exact:true}).fill('http://localhost:11434/v1');await dialog.getByRole('button',{name:'Save connection',exact:true}).click();await dialog.waitFor({state:'hidden'});await page.getByRole('button',{name:/Local story/}).waitFor();assert.equal(await page.getByRole('textbox',{name:'Main model · ID',exact:true}).inputValue(),'');
  assert(!await page.evaluate(()=>JSON.stringify(localStorage).includes('fixture-cloud-key')));assert.deepEqual(errors,[]);
  console.log('Provider UI passed: CRUD, multiple accounts, connection and generation probes, no key disclosure/logout, RUB/unknown prices, chat routing, stale catalogs, manual IDs, both languages and 320px/390px/short/desktop layouts.');
}catch(error){await page?.screenshot({path:'test-results/providers-failure.png'}).catch(()=>{});throw error;}
finally{await browser?.close();for(const c of runtime.active.values())c.abort('user');server.closeAllConnections();await new Promise(r=>server.close(r));store.close();rmSync(dir,{recursive:true,force:true});}
