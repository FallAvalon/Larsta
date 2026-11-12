import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import express from 'express';
import { createApp } from '../dist-server/server/app.js';

const {chromium}=await import(process.env.LARSTA_PLAYWRIGHT_MODULE?pathToFileURL(process.env.LARSTA_PLAYWRIGHT_MODULE).href:'playwright');
const dir=mkdtempSync(path.join(tmpdir(),'larsta-reading-layout-'));
const {app,store,secrets}=createApp({dataDir:dir});
const card=JSON.parse(readFileSync('examples/character-v2.json','utf8'));
const character=store.saveCharacter({...card,data:{...card.data,name:'Sample Guide',first_mes:'Добро пожаловать в архив.'}},'');
let chat;
for(let i=0;i<30;i++){
  chat=store.createChat(character.id);
  store.db.prepare('UPDATE chats SET title=? WHERE id=?').run('История '+i,chat.id);
}
for(let i=0;i<15;i++)store.addMessage(chat.id,i%2?'user':'assistant','Запись '+i+'. В архиве тихо. Здесь хранятся истории путешественников.');
app.use(express.static(path.resolve('dist')));
const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
const base='http://127.0.0.1:'+server.address().port;
mkdirSync('test-results',{recursive:true});
let browser,page;const errors=[];
try{
  browser=await chromium.launch({headless:true,channel:process.env.LARSTA_BROWSER_CHANNEL||'chrome'});
  const context=await browser.newContext({locale:'ru-RU',viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  await context.request.post(base+'/api/auth',{data:{code:secrets.connectionCode}});
  page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base);await page.locator('.conversation-row').first().waitFor();
  const list=page.locator('.conversation-scroll'),header=page.locator('.conversations-header');
  const settled=()=>page.waitForFunction(()=>document.querySelector('.conversation-scroll')?.getAttribute('aria-busy')==='false'&&document.querySelector('.conversations-header')?.getAnimations().length===0);
  const hidden=()=>header.evaluate(el=>el.classList.contains('is-hidden'));
  const scroll=async(delta)=>{const box=await list.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+Math.min(80,box.height/2));await page.mouse.wheel(0,delta);await page.waitForTimeout(330);};
  await settled();assert.equal(await page.locator('.mobile-wordmark').count(),1);
  await page.waitForFunction(()=>document.querySelector('.conversations-page').getAnimations().length===0);
  const expandedHeight=(await list.boundingBox()).height;
  assert((await header.boundingBox()).height<190,'compact mobile header');
  await page.screenshot({path:'test-results/reading-chats-mobile.png'});
  // Programmatic scrolling must not be mistaken for a gesture.
  await list.evaluate(el=>{el.scrollTop=200;});await page.waitForTimeout(100);assert.equal(await hidden(),false);
  await scroll(180);assert.equal(await hidden(),true);
  assert((await list.boundingBox()).height>expandedHeight+100,'hidden panel gives its space to the list');
  await page.screenshot({path:'test-results/reading-chats-scrolled.png'});
  await scroll(-5);assert.equal(await hidden(),true,'tiny direction changes do not flicker');
  await scroll(-100);assert.equal(await hidden(),false);
  // A keyboard user can reveal the collapsed controls with focus.
  await scroll(180);assert.equal(await hidden(),true);
  await header.locator('a').focus();await settled();assert.equal(await hidden(),false);
  await page.evaluate(()=>document.activeElement.blur());
  const search=page.getByRole('textbox',{name:'Поиск чатов',exact:true});
  await search.focus();await scroll(220);assert.equal(await hidden(),false,'focused search stays available');
  await search.fill('История');await settled();await search.blur();await scroll(220);assert.equal(await hidden(),false,'nonempty search pins panel');
  await page.getByRole('button',{name:'Очистить поиск чатов',exact:true}).click();await settled();
  await page.getByRole('button',{name:'Фильтры чатов',exact:true}).click();await scroll(220);assert.equal(await hidden(),false);
  await page.getByRole('combobox',{name:'Порядок чатов',exact:true}).selectOption('oldest');await settled();
  await page.getByRole('button',{name:'Фильтры чатов',exact:true}).click();await page.evaluate(()=>document.activeElement.blur());
  await scroll(220);assert.equal(await hidden(),false,'active filter pins panel even after closing filters');
  await page.reload();await settled();await scroll(220);assert.equal(await hidden(),true);
  await page.evaluate(()=>visualViewport.dispatchEvent(new Event('resize')));await settled();assert.equal(await hidden(),false,'keyboard/viewport changes reveal panel');
  await page.getByRole('button',{name:'Фильтры чатов',exact:true}).click();
  await page.getByRole('button',{name:'Фильтры чатов',exact:true}).click();
  await page.waitForTimeout(280);await scroll(220);assert.equal(await hidden(),true,'a pointer-clicked button does not pin the header indefinitely');
  await scroll(-100);assert.equal(await hidden(),false);
  await page.getByRole('button',{name:'Следующая страница чатов',exact:true}).click();await settled();assert.equal(await hidden(),false);assert.equal(await list.evaluate(el=>el.scrollTop),0);
  for(const viewport of [{width:320,height:568},{width:844,height:390}]){
    await page.setViewportSize(viewport);await settled();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    assert((await list.boundingBox()).height>70,'list usable on short screens');
  }
  await page.setViewportSize({width:390,height:844});await page.goto(base+'/#chat/'+chat.id);
  const draft=page.getByRole('textbox',{name:'Ваше сообщение',exact:true});await draft.waitFor();
  assert((await page.locator('.chat-header').boundingBox()).height<=60);
  const initial=await page.locator('.chat-header').boundingBox();
  await draft.fill('Черновик остаётся на месте.');
  await page.locator('.messages').evaluate(el=>el.scrollTop=0);
  assert.deepEqual(await page.locator('.chat-header').boundingBox(),initial,'chat header stays fixed during reading and typing');
  await page.screenshot({path:'test-results/reading-chat-mobile.png'});
  await page.setViewportSize({width:390,height:410});
  await page.waitForFunction(()=>document.querySelector('.composer-toolbar').getBoundingClientRect().bottom<=visualViewport.height+1);
  assert.equal(await draft.inputValue(),'Черновик остаётся на месте.');
  assert((await page.locator('.chat-header').boundingBox()).height<=60);
  await page.setViewportSize({width:1440,height:960});await page.goto(base);await settled();
  await scroll(220);assert.equal(await hidden(),false,'desktop controls always visible');
  await page.screenshot({path:'test-results/reading-chats-desktop.png'});
  await page.setViewportSize({width:390,height:844});await page.emulateMedia({reducedMotion:'reduce'});
  await scroll(220);await settled();assert.equal(await header.evaluate(el=>el.getAnimations().length),0);
  assert.deepEqual(errors,[]);
  console.log('Reading layout passed: directional scrolling, thresholds, reclaimed space, focus/search/filter locks, pagination, viewport resize, compact persistent chat header, draft preservation, narrow/landscape/desktop and reduced motion.');
}catch(error){await page?.screenshot({path:'test-results/reading-layout-failure.png'}).catch(()=>{});throw error;}
finally{await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));store.close();rmSync(dir,{recursive:true,force:true});}
