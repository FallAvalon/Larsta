import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import express from 'express';
import { createApp } from '../dist-server/server/app.js';
import { RouterClient } from '../dist-server/server/openrouter.js';
import { defaults } from '../dist-server/server/domain.js';

const {chromium}=await import(process.env.LARSTA_PLAYWRIGHT_MODULE?pathToFileURL(process.env.LARSTA_PLAYWRIGHT_MODULE).href:'playwright');
const dir=mkdtempSync(path.join(tmpdir(),'larsta-design-'));
const router=new RouterClient(async url=>{
  assert(String(url).endsWith('/models'),'design checks must not generate real replies');
  return Response.json({data:[{id:'test/story',name:'Тестовая модель',context_length:32768,pricing:{prompt:'0',completion:'0'},supported_parameters:['temperature','max_tokens']}]});
});
const {app,store}=createApp({dataDir:dir,router});
store.saveSettings({...defaults,mainModel:'test/story'});
app.use(express.static(path.resolve('dist')));
// A synthetic portrait fixture, never a personal image or a production asset.
writeFileSync(path.join(dir,'uploads','fixture.svg'),'<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1000"><defs><linearGradient id="bg" x2="1" y2="1"><stop stop-color="#8e709c"/><stop offset="1" stop-color="#2d4964"/></linearGradient></defs><path fill="url(#bg)" d="M0 0h800v1000H0z"/><circle cx="400" cy="310" r="170" fill="#282b45"/><ellipse cx="400" cy="345" rx="125" ry="155" fill="#c6a398"/><path d="M255 335V260q145-195 290 0v75q-50-115-160-80-30 65-130 80" fill="#353247"/><path d="M130 1000V780q15-235 270-235t270 235v220" fill="#263e59"/><path d="m340 555 60 110 60-110" fill="#b99891"/><path d="M90 1000h620" stroke="#c6a1ad" stroke-width="80" opacity=".15"/></svg>');
const card=JSON.parse(readFileSync('examples/character-v2.json','utf8'));
const character=store.saveCharacter({...card,data:{...card.data,name:'Sample Guide',first_mes:'*Sample Guide отрывается от книги и освобождает место у окна.*\n\n— Успел до дождя? Садись, чай ещё тёплый.'}},'');
store.db.prepare('UPDATE characters SET avatar=? WHERE id=?').run('/uploads/fixture.svg',character.id);
const persona=store.personas()[0];store.savePersona({...persona,name:'Test Reader'},persona.id);
const chat=store.createChat(character.id);store.db.prepare('UPDATE chats SET title=?,generation=? WHERE id=?').run('Вечер в библиотеке',JSON.stringify({mainModel:'test/story',maxTokens:2048}),chat.id);
store.addMessage(chat.id,'user','*Снимаю мокрую куртку и сажусь напротив.*\n\nПочти успел. Что читаешь?');
store.addMessage(chat.id,'assistant','*Она переворачивает книгу обложкой вниз, придерживая пальцем страницу. За стеклом дождь рисует тонкие дорожки, и библиотека кажется ещё тише.*\n\n— Историю о человеке, который всё время уезжал. А потом однажды остался.\n\n*Sample Guide пододвигает к тебе вторую чашку.*\n\n— Пока не решила, какая часть мне нравится больше.');
store.addMessage(chat.id,'user','Тогда давай пока никуда не уезжать. *Беру чашку и улыбаюсь.*');
const answer=store.addMessage(chat.id,'assistant','*Sample Guide улыбается в ответ и устраивается поудобнее.*\n\n— Давай. У нас есть чай, целая полка непрочитанных книг и, кажется, очень дождливый вечер.');
store.transaction(()=>store.beginVariant(answer,'*На мгновение она прячет улыбку за краем чашки.*\n\n— Хороший план.\n\n*Книга остаётся закрытой. Sample Guide смотрит на дождь, потом снова на тебя.*\n\n— Расскажешь, как прошёл твой день?','test/story','design-second'));
store.updateMessage(answer.id,store.messages(chat.id).at(-1).content,'complete');
store.transaction(()=>store.beginVariant(store.messages(chat.id).at(-1),'— Останемся. *Sample Guide кивает и тянется за чайником.*','test/story','design-third'));
store.updateMessage(answer.id,'— Останемся. *Sample Guide кивает и тянется за чайником.*','complete');store.selectVariant(answer.id,'design-second');
const branch=store.transaction(()=>store.copyChat(chat.id,undefined,'у окна'));store.db.prepare('UPDATE chats SET title=? WHERE id=?').run('Ещё немного тишины',branch.id);
const original=store.messages(chat.id);
const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
const base=`http://127.0.0.1:${server.address().port}`;
let browser,page;
const errors=[];
try{
  browser=await chromium.launch({headless:true,channel:process.env.LARSTA_BROWSER_CHANNEL||'chrome'});
  async function openContext(options){
    const context=await browser.newContext({locale:'ru-RU',timezoneId:'Europe/Moscow',...options});
    const secrets=JSON.parse(readFileSync(path.join(dir,'server-secrets.json'),'utf8'));
    await context.request.post(base+'/api/auth',{data:{code:secrets.connectionCode}});
    await context.addInitScript(()=>{if(!localStorage.getItem('larsta-chat-appearance-v1'))localStorage.setItem('larsta-chat-appearance-v1',JSON.stringify({animations:false}));});
    const target=await context.newPage();target.on('pageerror',error=>errors.push(error.message));
    await target.goto(`${base}/#chat/${chat.id}`);await target.locator(`[data-chat-id="${chat.id}"]`).waitFor();
    return {context,target};
  }
  const mobile=await openContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});page=mobile.target;
  mkdirSync('test-results',{recursive:true});
  const messageLayout=await page.locator('.message').evaluateAll(elements=>elements.map(element=>({left:element.getBoundingClientRect().left,background:getComputedStyle(element.querySelector('.message-body')).backgroundColor,radius:getComputedStyle(element.querySelector('.message-body')).borderRadius})));
  assert(messageLayout.every(message=>message.background==='rgba(0, 0, 0, 0)'&&message.radius==='0px'),'messages must remain transparent blocks');
  assert(messageLayout.every(message=>Math.abs(message.left-messageLayout[0].left)<1),'user and character messages must share the original alignment');
  const draft=page.getByRole('textbox',{name:'Ваше сообщение',exact:true});
  const chatBounds=()=>page.locator('.messages').evaluate(element=>({left:element.offsetLeft,top:element.offsetTop,width:element.clientWidth,height:element.clientHeight}));
  let before=await chatBounds();
  const checkPopover=async label=>{
    const result=await page.evaluate(()=>{
      const panel=document.querySelector('.tool-panel'),button=document.querySelector('[aria-controls="chat-tools"][aria-expanded=true]');
      const bounds=panel.getBoundingClientRect(),trigger=button.getBoundingClientRect(),style=getComputedStyle(panel);
      return {overlay:!!document.querySelector('.modal-backdrop'),modal:panel.getAttribute('aria-modal'),position:style.position,above:bounds.bottom<=trigger.top-7&&bounds.bottom>=trigger.top-9,aligned:Math.abs(bounds.right-trigger.right)<1||Math.abs(bounds.left-trigger.left)<1,inside:bounds.left>=9&&bounds.right<=innerWidth-9&&bounds.top>=9&&bounds.bottom<=innerHeight-9,blur:style.backdropFilter,background:style.backgroundColor};
    });
    assert.equal(result.overlay,false,label);assert.equal(result.modal,null);assert.equal(result.position,'fixed');assert(result.above,label+': panel must appear directly above its button');assert(result.aligned,label+': panel must align with its button');assert(result.inside,label+': panel must fit the viewport');assert.match(result.blur,/blur\(/);assert.match(result.background,/rgba/);
    assert.deepEqual(await chatBounds(),before,label+': opening the popover must not move or resize the chat');
  };
  await draft.fill('*Согреваю ладони о чашку.* С чего начать?');
  await page.screenshot({path:'test-results/design-phone.png'});
  const first=page.locator('.message').first();
  assert.equal(await first.getByRole('button',{name:'Редактировать сообщение',exact:true}).isVisible(),false);
  before=await chatBounds();
  const last=page.locator('.message').last();
  await last.getByRole('button',{name:'Действия с сообщением',exact:true}).click();
  const actions=page.getByRole('region',{name:'Действия с сообщением',exact:true});await actions.waitFor();
  await checkPopover('mobile actions');
  await page.screenshot({path:'test-results/design-actions.png'});
  await draft.click();await actions.waitFor({state:'hidden'});
  assert.equal(await draft.evaluate(element=>element===document.activeElement),true,'outside click must reach the composer');
  await first.getByRole('button',{name:'Действия с сообщением',exact:true}).click();await actions.waitFor();
  await actions.getByRole('button',{name:'Редактировать сообщение',exact:true}).click();
  assert.equal(await page.getByRole('textbox',{name:'Текст сообщения',exact:true}).inputValue(),original[0].content);
  await page.getByRole('button',{name:'Отмена',exact:true}).click();
  await first.getByRole('button',{name:'Действия с сообщением',exact:true}).focus();await page.keyboard.press('Enter');
  await actions.waitFor();await page.keyboard.press('Escape');await actions.waitFor({state:'hidden'});
  assert.equal(await first.getByRole('button',{name:'Действия с сообщением',exact:true}).evaluate(element=>element===document.activeElement),true);

  // Existing personal reading preferences still work after changing the surrounding UI.
  await page.getByRole('button',{name:'Настройки чата',exact:true}).click();
  await page.getByRole('slider',{name:'Размер текста чата',exact:true}).fill('20');
  await page.getByRole('textbox',{name:'HEX: Основной текст',exact:true}).fill('#d8c6ad');
  await page.getByRole('button',{name:'Готово',exact:true}).click();
  await page.reload();await page.locator(`[data-chat-id="${chat.id}"]`).waitFor();
  assert.equal(await page.locator('.message-text').first().evaluate(element=>getComputedStyle(element).fontSize),'20px');
  assert.equal(await page.locator('.message-text').first().evaluate(element=>getComputedStyle(element).color),'rgb(216, 198, 173)');
  assert.match(await draft.inputValue(),/Согреваю ладони/);

  for(const viewport of [{width:320,height:568},{width:320,height:410},{width:844,height:390}]){
    await page.setViewportSize(viewport);
    await page.waitForFunction(()=>document.querySelector('.composer-toolbar').getBoundingClientRect().bottom<=visualViewport.height+1);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await page.locator('.message').first().getByRole('button',{name:'Действия с сообщением',exact:true}).click();
    await page.waitForFunction(()=>{const bounds=document.querySelector('.tool-panel').getBoundingClientRect();return bounds.top>=9&&bounds.bottom<=visualViewport.height-9;});
    await page.keyboard.press('Escape');await actions.waitFor({state:'hidden'});
  }
  await page.setViewportSize({width:390,height:844});
  await page.getByRole('button',{name:'Действия с чатом',exact:true}).click();await page.getByRole('button',{name:'Ветки истории',exact:true}).click();
  await page.locator('.branch-list [aria-current=true]').waitFor();assert.equal(await page.locator('.branch-list [aria-current=true]').count(),1);
  assert.equal(await page.locator('.branch-list [aria-current=true]').getByText('Сейчас здесь',{exact:true}).count(),1);
  await page.screenshot({path:'test-results/design-branches.png'});
  await page.getByRole('region',{name:'Ветки истории',exact:true}).locator('footer').getByRole('button',{name:'Закрыть',exact:true}).click();

  const desktop=await openContext({viewport:{width:1440,height:960}});page=desktop.target;
  const historic=page.locator('.message').nth(2),quickEdit=historic.getByRole('button',{name:'Редактировать сообщение',exact:true});
  assert.equal(await quickEdit.isVisible(),false);await historic.hover();assert.equal(await quickEdit.isVisible(),true);
  await quickEdit.click();assert.equal(await page.getByRole('textbox',{name:'Текст сообщения',exact:true}).inputValue(),original[2].content);
  await page.getByRole('button',{name:'Отмена',exact:true}).click();
  await page.locator('.messages').evaluate(element=>{element.scrollTop=element.scrollHeight;});
  await page.mouse.move(300,100);await page.screenshot({path:'test-results/design-desktop.png'});
  await page.setViewportSize({width:1440,height:640});
  await page.waitForFunction(()=>document.querySelector('.messages').clientHeight<500);
  await page.locator('.messages').evaluate(element=>{element.scrollTop=80;element.dispatchEvent(new Event('scroll'));});
  assert(await page.locator('.messages').evaluate(element=>element.scrollHeight-element.clientHeight-element.scrollTop>100),'anchor check must read older messages rather than follow the bottom');
  const readingAnchor=await page.locator('.messages').evaluate(element=>{const top=element.getBoundingClientRect().top,node=[...element.querySelectorAll('[data-message-id]')].find(message=>message.getBoundingClientRect().bottom>top);return {id:node.dataset.messageId,offset:node.getBoundingClientRect().top-top};});
  before=await chatBounds();
  await page.getByRole('button',{name:'Модель и ответы',exact:true}).click();
  const modelPanel=page.getByRole('region',{name:'Модель и ответы',exact:true});await modelPanel.waitFor();await checkPopover('desktop model');
  await page.waitForFunction(anchor=>{const element=document.querySelector('.messages'),node=[...element.querySelectorAll('[data-message-id]')].find(message=>message.dataset.messageId===anchor.id);return Math.abs(node.getBoundingClientRect().top-element.getBoundingClientRect().top-anchor.offset)<3;},readingAnchor);
  await page.setViewportSize({width:1440,height:960});
  await page.getByRole('button',{name:'Общие',exact:true}).waitFor();
  await page.getByRole('textbox',{name:'Ваше сообщение',exact:true}).fill('Черновик с открытыми настройками');assert(await modelPanel.isVisible());
  await page.screenshot({path:'test-results/design-glass-desktop.png'});
  await modelPanel.getByRole('button',{name:'Закрыть панель',exact:true}).click();
  assert.deepEqual(store.messages(chat.id),original);assert.deepEqual(errors,[]);
  console.log('Chat design UI passed: anchored glass popovers above their buttons on mobile and desktop, unchanged chat layout, outside click dismissal, transparent aligned message blocks, edit target, keyboard/focus return, reading preferences, 320px/short/landscape layout, branches, hover actions.');
}catch(error){if(page)await page.screenshot({path:'test-results/design-failure.png'}).catch(()=>{});throw error;}
finally{await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));store.close();}
