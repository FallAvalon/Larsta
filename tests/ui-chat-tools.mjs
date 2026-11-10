import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import express from 'express';
import { createApp } from '../dist-server/server/app.js';
import { RouterClient } from '../dist-server/server/openrouter.js';
import { defaults } from '../dist-server/server/domain.js';

const {chromium}=await import(process.env.LARSTA_PLAYWRIGHT_MODULE?pathToFileURL(process.env.LARSTA_PLAYWRIGHT_MODULE).href:'playwright');
const dir=mkdtempSync(path.join(tmpdir(),'larsta-ui-chat-tools-')),calls=[];
let holdNext=false,releaseStream;
const router=new RouterClient(async(url,options)=>{
  if(String(url).endsWith('/models'))return Response.json({data:['test/main','test/other'].map(id=>({id,name:id,context_length:65536,pricing:{prompt:'0',completion:'0'},supported_parameters:['temperature','max_tokens']}))});
  calls.push(JSON.parse(String(options.body)));
  return new Response(new ReadableStream({async start(controller){
    const emit=value=>controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(value)}\n\n`));
    emit({choices:[{delta:{content:' Продолжение сцены.'},finish_reason:null}]});
    if(holdNext){holdNext=false;await new Promise(resolve=>{releaseStream=resolve;});}
    await new Promise(resolve=>setTimeout(resolve,100));
    emit({choices:[{delta:{content:' — Я слушаю тебя.'},finish_reason:null}]});
    emit({choices:[{delta:{},finish_reason:'stop'}]});controller.close();
  }}),{headers:{'Content-Type':'text/event-stream'}});
});
const {app,store,secrets,active}=createApp({dataDir:dir,router});
store.saveSettings({...defaults,mainModel:'test/main',contextBudget:65536});secrets.setKey('ui-test-key-not-real');
app.use(express.static(path.resolve('dist')));
const card=JSON.parse(readFileSync('examples/character-v2.json','utf8'));
const character=store.saveCharacter({...card,data:{...card.data,name:'Sample Guide',first_mes:'Привет.'}},'');
const chat=store.createChat(character.id);
for(let index=0;index<18;index++){
  store.addMessage(chat.id,'user',`Моя реплика ${index}.`);
  store.addMessage(chat.id,'assistant',`Ответ ${index}. *Sample Guide смотрит на тебя.* ${'История продолжается. '.repeat(12)}`);
}
const original=store.messages(chat.id).at(-1);
store.transaction(()=>store.beginVariant(original,'Другой ответ. *Sample Guide улыбается.*','test/main','ui-variant'));
store.updateMessage(original.id,'Другой ответ. *Sample Guide улыбается.*','complete');
const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
const base=`http://127.0.0.1:${server.address().port}`;
let browser,page;
try{
  browser=await chromium.launch({headless:true,channel:process.env.LARSTA_BROWSER_CHANNEL||'chrome'});
  const context=await browser.newContext({locale:'ru-RU',viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  await context.request.post(base+'/api/auth',{data:{code:secrets.connectionCode}});
  page=await context.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(`${base}/#chat/${chat.id}`);
  await page.locator('.message').last().waitFor();
  const draft=page.getByRole('textbox',{name:'Ваше сообщение',exact:true});
  const settle=async()=>{await page.waitForFunction(()=>!document.querySelector('.stop-button'));await page.waitForTimeout(120);};
  const menu=async name=>{await page.getByRole('button',{name:'Действия с чатом',exact:true}).click();await page.getByRole('button',{name,exact:true}).click();};
  const layout=async label=>{
    await page.waitForFunction(()=>{const composer=document.querySelector('.composer'),footer=document.querySelector('.tool-panel footer');return composer&&composer.getBoundingClientRect().bottom<=visualViewport.height+1&&(!footer||footer.getBoundingClientRect().bottom<=visualViewport.height+1);},null,{timeout:5000});
    const bounds=await page.evaluate(()=>({width:innerWidth,document:document.documentElement.scrollWidth,footer:document.querySelector('.tool-panel footer')?.getBoundingClientRect().bottom,composer:document.querySelector('.composer').getBoundingClientRect().bottom,height:visualViewport.height}));
    assert(bounds.document<=bounds.width,`${label}: horizontal overflow`);assert(bounds.composer<=bounds.height+1,`${label}: composer outside viewport`);if(bounds.footer)assert(bounds.footer<=bounds.height+1,`${label}: modal actions outside viewport`);
  };

  // Restore a message anchor rather than jumping to the last message on reopen.
  await page.locator('.messages').evaluate(element=>{element.scrollTop=900;element.dispatchEvent(new Event('scroll'));});
  await page.waitForTimeout(250);
  const before=await page.locator('.messages').evaluate(element=>element.scrollTop);
  await page.reload();await page.locator('.message').last().waitFor();await page.waitForTimeout(150);
  const after=await page.locator('.messages').evaluate(element=>element.scrollTop);assert(Math.abs(before-after)<5,`reading position ${before} -> ${after}`);
  await page.evaluate(()=>localStorage.setItem('larsta-chat-appearance-v1',JSON.stringify({animations:false})));await page.reload();await page.locator('.message').last().waitFor();
  await page.getByRole('button',{name:'К последним сообщениям',exact:true}).click();
  await page.getByRole('button',{name:'Продолжить ответ',exact:true}).click();await settle();
  assert.equal(store.messages(chat.id).at(-1).content,'Другой ответ. *Sample Guide улыбается.* Продолжение сцены. — Я слушаю тебя.');assert.equal(store.messages(chat.id).at(-1).variants.length,3);

  // A real touch gesture must leave vertical scrolling available and select the previous variant.
  const text=page.locator('.message').last().locator('.message-text');await text.scrollIntoViewIfNeeded();
  const box=await text.boundingBox();const session=await context.newCDPSession(page),y=Math.max(box.y+20,95),start=Math.min(box.x+25,180);
  await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:start,y}]});
  for(let offset=30;offset<=120;offset+=30)await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:start+offset,y}]});
  await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await page.waitForFunction(()=>document.querySelector('.message:last-child .variant-count')?.textContent==='2 / 3');
  assert.equal(store.messages(chat.id).at(-1).content,'Другой ответ. *Sample Guide улыбается.*');

  await page.getByRole('button',{name:'Посмотреть варианты ответа',exact:true}).last().click();
  await page.locator('.variant-preview').nth(2).waitFor();assert.equal(await page.locator('.variant-preview').count(),3);await layout('variant previews');
  mkdirSync('test-results',{recursive:true});await page.screenshot({path:'test-results/chat-tools-variants.png'});
  await page.getByRole('button',{name:'Выбрать вариант 1',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('.tool-panel'));
  assert.equal(store.messages(chat.id).at(-1).content,original.content);

  await page.getByRole('button',{name:'Перегенерировать ответ',exact:true}).last().click();
  assert.equal(await page.locator('.tool-panel').evaluate(el=>getComputedStyle(el).borderWidth),'0px');
  await page.getByRole('button',{name:'Больше диалога',exact:true}).click();
  assert.equal(await page.getByRole('button',{name:'Больше диалога',exact:true}).getAttribute('aria-pressed'),'true');
  await page.getByRole('button',{name:'Больше диалога',exact:true}).click();
  assert.equal(await page.getByRole('textbox',{name:'Пожелание к ответу',exact:true}).inputValue(),'');
  await page.getByRole('button',{name:'Больше диалога',exact:true}).click();
  await page.getByRole('textbox',{name:'Пожелание к ответу',exact:true}).fill('Коротко и без моих действий');
  await page.screenshot({path:'test-results/borderless-regenerate-phone.png'});
  await page.setViewportSize({width:320,height:410});await layout('regenerate 320x410');
  assert(await page.locator('.regenerate-panel .modal-scroll').evaluate(el=>el.clientHeight>=180),'short viewport should leave enough room to write and scroll');
  assert.equal(await page.getByRole('textbox',{name:'Пожелание к ответу',exact:true}).evaluate(el=>getComputedStyle(el).borderWidth),'0px');
  await page.screenshot({path:'test-results/borderless-regenerate-320.png'});
  await page.getByRole('button',{name:'Получить вариант',exact:true}).click();await settle();assert.match(calls.at(-1).messages.at(-1).content,/Коротко и без моих действий/);
  await page.setViewportSize({width:390,height:844});

  await page.getByRole('button',{name:'Модель и ответы',exact:true}).click();
  await page.getByRole('button',{name:'Общие',exact:true}).waitFor();await page.screenshot({path:'test-results/borderless-model-inherited-phone.png'});
  await page.getByRole('button',{name:'Для этого чата',exact:true}).click();
  await page.getByRole('combobox',{name:'Модель этого чата',exact:true}).selectOption('test/other');
  await page.getByRole('combobox',{name:'Длина ответа',exact:true}).selectOption('custom');
  await page.getByRole('spinbutton',{name:'Лимит ответа этого чата',exact:true}).fill('8192');
  await page.getByRole('combobox',{name:'Длина ответа',exact:true}).selectOption('2048');
  assert.equal(await page.getByRole('spinbutton',{name:'Лимит ответа этого чата',exact:true}).count(),0);
  assert.equal(await page.locator('.tool-panel').evaluate(el=>[el,...el.querySelectorAll('header,footer,button,input,textarea,select,fieldset')].every(node=>['borderTopWidth','borderRightWidth','borderBottomWidth','borderLeftWidth'].every(side=>getComputedStyle(node)[side]==='0px'))),true);
  await layout('chat model settings');await page.screenshot({path:'test-results/chat-tools-model.png'});
  await page.getByRole('button',{name:'Сохранить',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('.tool-panel'));
  assert.equal(store.chat(chat.id).generation.mainModel,'test/other');
  await page.getByRole('button',{name:'Продолжить ответ',exact:true}).click();await settle();assert.equal(calls.at(-1).model,'test/other');assert.equal(calls.at(-1).max_tokens,2048);assert(!JSON.stringify(calls.at(-1).messages).includes('Коротко и без моих действий'));

  const sourceContents=store.messages(chat.id).map(message=>message.content);
  const historicMessage=page.locator('.message').nth(2);
  assert.equal(await historicMessage.getByRole('button',{name:'Редактировать сообщение',exact:true}).isVisible(),false);
  await historicMessage.getByRole('button',{name:'Действия с сообщением',exact:true}).click();
  await page.getByRole('region',{name:'Действия с сообщением',exact:true}).getByRole('button',{name:'Продолжить отсюда в новой ветке',exact:true}).click();
  await page.waitForURL(url=>url.hash.startsWith('#chat/')&&url.hash!==`#chat/${chat.id}`);
  const branchId=page.url().split('#chat/')[1];await page.locator(`[data-chat-id="${branchId}"]`).waitFor();
  assert.equal(store.messages(branchId).length,3);assert.equal(store.chat(branchId).generation.mainModel,'test/other');assert.deepEqual(store.messages(chat.id).map(message=>message.content),sourceContents);
  await menu('Ветки истории');
  await page.locator('.branch-list').getByText(chat.title,{exact:true}).click();await page.waitForURL(`${base}/#chat/${chat.id}`);await page.locator(`[data-chat-id="${chat.id}"]`).waitFor();

  await draft.fill('Мой несохранённый черновик');await menu('Откатить ход');await page.getByRole('button',{name:'Откатить ход',exact:true}).click();
  await page.waitForFunction(()=>!document.querySelector('.tool-panel'));
  assert.match(await draft.inputValue(),/Моя реплика 17/);assert.match(await draft.inputValue(),/Мой несохранённый черновик/);assert.equal(store.messages(chat.id).length,35);
  await menu('Ветки истории');await page.locator('.branch-list button').filter({hasText:'до отката'}).waitFor();await layout('branches');await page.screenshot({path:'test-results/chat-tools-branches.png'});
  await page.locator('.branch-list button').filter({hasText:'до отката'}).click();await page.waitForURL(url=>url.hash!==`#chat/${chat.id}`);await page.locator(`[data-chat-id="${page.url().split('#chat/')[1]}"]`).waitFor();
  assert.deepEqual(store.messages(page.url().split('#chat/')[1]).map(message=>message.content),sourceContents);
  await page.setViewportSize({width:1280,height:900});await layout('desktop');
  await page.setViewportSize({width:320,height:568});await layout('narrow phone');
  await page.screenshot({path:'test-results/chat-tools-phone.png'});
  // Non-modal settings must coexist safely with a streamed reply and a new draft.
  await page.getByRole('button',{name:'Модель и ответы',exact:true}).click();
  const modelPanel=page.getByRole('region',{name:'Модель и ответы',exact:true});await modelPanel.waitFor();
  await modelPanel.getByRole('button',{name:'Сохранить',exact:true}).waitFor();
  await draft.fill('Реплика при открытой панели');holdNext=true;
  await draft.evaluate(element=>element.form.requestSubmit());
  await page.getByRole('button',{name:'Остановить ответ',exact:true}).waitFor();
  assert(await modelPanel.isVisible());assert(await modelPanel.getByRole('button',{name:'Сохранить',exact:true}).isDisabled());
  await draft.fill('Следующий черновик');
  await page.waitForFunction(()=>document.querySelector('.message:last-child .message-text')?.textContent.includes('Продолжение сцены.'));
  assert.equal(typeof releaseStream,'function');releaseStream();await settle();
  assert.equal(await draft.inputValue(),'Следующий черновик');assert(await modelPanel.isVisible());assert(await modelPanel.getByRole('button',{name:'Сохранить',exact:true}).isEnabled());
  await modelPanel.getByRole('button',{name:'Закрыть панель',exact:true}).click();
  assert.deepEqual(errors,[]);
  console.log('Chat tools UI passed: continuation, one-use wishes, variant previews and real touch swipe, chat model/length, fork and return, undo with draft preservation, reading-position reload, 320px/short viewport/desktop.');
}catch(error){if(page){mkdirSync('test-results',{recursive:true});await page.screenshot({path:'test-results/chat-tools-failure.png'}).catch(()=>{});}throw error;}
finally{releaseStream?.();await browser?.close();for(const controller of active.values())controller.abort('disconnect');server.closeAllConnections();await new Promise(resolve=>server.close(resolve));store.close();}
