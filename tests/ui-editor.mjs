import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import express from 'express';
import { createApp } from '../dist-server/server/app.js';
import { RouterClient } from '../dist-server/server/openrouter.js';

const {chromium} = await import(process.env.LARSTA_PLAYWRIGHT_MODULE ? pathToFileURL(process.env.LARSTA_PLAYWRIGHT_MODULE).href : 'playwright');
const dir = mkdtempSync(path.join(tmpdir(), 'larsta-editor-'));
const {app, store, secrets} = createApp({dataDir: dir, router: new RouterClient(async () => { throw Error('No external requests in editor checks'); })});
const card = JSON.parse(readFileSync('examples/character-v2.json','utf8'));
const story = Array.from({length:16},(_,i)=>`*В библиотеке тихо шелестят страницы. За окном идёт дождь.*\n\n— Это глава ${i+1}. Здесь достаточно места для длинной истории, пауз и небольших деталей.`).join('\n\n');
const character = store.saveCharacter({...card,data:{...card.data,name:'Sample Guide',description:story,first_mes:story}},'Хранительница архива');
const chat = store.createChat(character.id);
const original = store.messages(chat.id)[0];
const persona = store.personas()[0];
store.savePersona({...persona,description:story},persona.id);
app.use(express.static(path.resolve('dist')));
const server = app.listen(0,'127.0.0.1'); await new Promise(resolve=>server.once('listening',resolve));
const base = 'http://127.0.0.1:'+server.address().port;
mkdirSync('test-results',{recursive:true});
let browser,page; const errors=[];
try {
  browser = await chromium.launch({headless:true,channel:process.env.LARSTA_BROWSER_CHANNEL||'chrome'});
  const context = await browser.newContext({locale:'ru-RU',viewport:{width:1440,height:960},reducedMotion:'no-preference'});
  await context.request.post(base+'/api/auth',{data:{code:secrets.connectionCode}});
  page=await context.newPage(); page.on('pageerror',e=>errors.push(e.message));
  const editor = () => page.getByRole('dialog',{name:'Редактировать сообщение',exact:true});
  const openEdit = async () => {
    await page.locator('.message').first().getByRole('button',{name:'Действия с сообщением',exact:true}).click();
    await page.getByRole('region',{name:'Действия с сообщением',exact:true}).getByRole('button',{name:'Редактировать сообщение',exact:true}).click();
    await editor().waitFor();
    await page.waitForFunction(()=>document.querySelector('.text-editor').getAnimations().length===0);
  };
  const layout = async (minHeight) => {
    await page.waitForFunction(()=>{const box=document.querySelector('.editor-backdrop').getBoundingClientRect();return Math.abs(box.width-visualViewport.width)<1&&Math.abs(box.height-visualViewport.height)<1;});
    const bounds=await page.locator('.text-editor').evaluate(el=>{
      const text=el.querySelector('textarea'),footer=el.querySelector('footer'),box=el.getBoundingClientRect(),v=visualViewport;
      return {width:box.width,top:box.top,bottom:box.bottom,right:box.right,text:text.clientHeight,footer:footer.getBoundingClientRect().bottom,outerScroll:el.scrollHeight-el.clientHeight,formScroll:el.querySelector('form').scrollHeight-el.querySelector('form').clientHeight,vtop:v.offsetTop,vbottom:v.offsetTop+v.height,vright:v.offsetLeft+v.width,border:getComputedStyle(el).borderWidth,background:getComputedStyle(el).backgroundColor,inputBackground:getComputedStyle(text).backgroundColor};
    });
    assert(bounds.text>=minHeight,JSON.stringify(bounds));
    assert(bounds.top>=bounds.vtop-1 && bounds.bottom<=bounds.vbottom+1 && bounds.footer<=bounds.vbottom+1 && bounds.right<=bounds.vright+1,JSON.stringify(bounds));
    assert(bounds.outerScroll<=1 && bounds.formScroll<=1,'only the text area should scroll');
    assert.equal(bounds.border,'0px'); assert.equal(bounds.background,'rgba(28, 30, 34, 0.98)');
    assert.equal(bounds.inputBackground,'rgb(39, 42, 48)'); return bounds;
  };
  await page.goto(base+'/#chat/'+chat.id);await openEdit();
  assert((await layout(550)).width>=850);
  const text=page.getByRole('textbox',{name:'Текст сообщения',exact:true});assert.equal(await text.inputValue(),story);
  assert.equal(await text.evaluate(el=>getComputedStyle(el).fontSize),'18px');
  await page.screenshot({path:'test-results/editor-desktop.png'});
  await text.fill(story+'\n\nНесохранённая строка');await page.keyboard.press('Escape');
  await editor().getByRole('button',{name:'Продолжить правку',exact:true}).waitFor();
  await page.keyboard.press('Escape');assert.match(await text.inputValue(),/Несохранённая/);
  await editor().getByRole('button',{name:'Отмена',exact:true}).click();
  await editor().getByRole('button',{name:'Не сохранять',exact:true}).click();await editor().waitFor({state:'hidden'});
  assert.equal(store.messages(chat.id)[0].content,story);
  assert(await page.locator('.message').first().getByRole('button',{name:'Действия с сообщением',exact:true}).evaluate(el=>el===document.activeElement),'closing restores the message action trigger');

  // Errors retain the draft; retry saves and creates the existing history branch.
  await openEdit();await text.fill(story+'\n\nСохранённая строка');
  const endpoint=base+'/api/chats/'+chat.id+'/messages/'+original.id+'?limit=50';
  await page.route(endpoint,route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Тестовая ошибка сохранения'})}));
  await editor().getByRole('button',{name:'Сохранить',exact:true}).click();await editor().getByRole('alert').waitFor();assert.match(await text.inputValue(),/Сохранённая/);
  await page.unroute(endpoint);await text.focus();await page.keyboard.press('Control+Enter');await editor().waitFor({state:'hidden'});
  assert.match(store.messages(chat.id)[0].content,/Сохранённая строка/);
  assert(store.db.prepare('SELECT count(*) AS n FROM chats').get().n>1,'old history preserved in a branch');

  const saved=store.messages(chat.id)[0];
  store.transaction(()=>store.beginVariant(saved,story+'\n\nДругой вариант.','test/main','editor-variant'));
  store.updateMessage(saved.id,story+'\n\nДругой вариант.','complete');
  await page.reload();await page.getByRole('button',{name:'Предыдущий вариант ответа',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('.message-text')?.getAnimations().length>0);
  await page.waitForFunction(()=>document.querySelector('.message-text')?.getAnimations().length===0);
  assert.match(await page.locator('.message-text').first().innerText(),/Сохранённая строка/);

  // Parent forms remain open and unsaved when the expanded field is applied.
  await page.goto(base+'/#personas');await page.getByRole('button',{name:'Изменить персону '+persona.name,exact:true}).click();
  const parent=page.getByRole('dialog',{name:'Редактировать персону',exact:true});
  await parent.getByRole('button',{name:'Развернуть: Описание и важные детали',exact:true}).click();
  const expanded=page.getByRole('dialog',{name:'Описание и важные детали',exact:true});await expanded.waitFor();
  await expanded.getByRole('textbox').fill('Expanded persona draft');
  await page.keyboard.press('Escape');assert(await parent.count()===1);
  await expanded.getByRole('button',{name:'Продолжить правку',exact:true}).click();
  await expanded.getByRole('button',{name:'Применить',exact:true}).click();await expanded.waitFor({state:'hidden'});
  assert(await parent.isVisible());assert.equal(await parent.getAttribute('inert'),null);
  assert.equal(await parent.getByRole('textbox',{name:'Описание и важные детали',exact:true}).inputValue(),'Expanded persona draft');
  assert.equal(store.persona(persona.id).description,story,'Apply must not submit the parent form');
  await parent.getByRole('button',{name:'Сохранить персону',exact:true}).click();await parent.waitFor({state:'hidden'});
  assert.equal(store.persona(persona.id).description,'Expanded persona draft');

  await page.goto(base+'/#library');await page.getByRole('button',{name:'Открыть Sample Guide',exact:true}).click();
  await page.getByRole('dialog',{name:'Карточка персонажа',exact:true}).getByRole('button',{name:'Изменить',exact:true}).click();
  const characterEditor=page.getByRole('dialog',{name:'Редактировать персонажа',exact:true});
  await characterEditor.getByRole('button',{name:'Развернуть: Полное описание',exact:true}).click();
  const description=page.getByRole('dialog',{name:'Полное описание',exact:true});await description.getByRole('textbox').fill('Local character draft');
  await description.getByRole('button',{name:'Применить',exact:true}).click();await description.waitFor({state:'hidden'});
  assert.equal(await characterEditor.getByRole('textbox',{name:'Полное описание',exact:true}).inputValue(),'Local character draft');
  assert.equal(store.character(character.id).card.data.description,story);
  await characterEditor.getByRole('button',{name:'Отмена',exact:true}).click();

  // Expansion inside a non-modal chat panel must not dismiss the panel.
  await page.goto(base+'/#chat/'+chat.id);await page.getByRole('button',{name:'Моя персона',exact:true}).click();
  const local=page.getByRole('region',{name:'Моя персона в этом чате',exact:true});
  await local.getByRole('button',{name:'Развернуть: Внешность',exact:true}).click();
  const appearance=page.getByRole('dialog',{name:'Внешность',exact:true});await appearance.getByRole('textbox').fill('Local appearance');
  await appearance.getByRole('button',{name:'Применить',exact:true}).click();await appearance.waitFor({state:'hidden'});
  assert(await local.isVisible());assert.equal(await local.getByRole('textbox',{name:'Внешность',exact:true}).inputValue(),'Local appearance');
  await local.getByRole('button',{name:'Отмена',exact:true}).click();await local.waitFor({state:'hidden'});

  const mobile=await browser.newContext({locale:'ru-RU',viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  await mobile.request.post(base+'/api/auth',{data:{code:secrets.connectionCode}});page=await mobile.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/#chat/'+chat.id);await openEdit();await layout(600);
  await page.screenshot({path:'test-results/editor-mobile.png'});
  // Simulated visual viewport keyboard: retain full layout viewport, shrink and pan visible area.
  await page.evaluate(()=>{
    Object.defineProperty(visualViewport,'height',{configurable:true,value:410});Object.defineProperty(visualViewport,'offsetTop',{configurable:true,value:55});
    visualViewport.dispatchEvent(new Event('resize'));visualViewport.dispatchEvent(new Event('scroll'));
  });
  await layout(220);await page.screenshot({path:'test-results/editor-keyboard-simulation.png'});
  await page.evaluate(()=>{delete visualViewport.height;delete visualViewport.offsetTop;visualViewport.dispatchEvent(new Event('resize'));});
  for(const viewport of [{width:320,height:568},{width:320,height:360},{width:844,height:390}]){await page.setViewportSize(viewport);await layout(150);}
  await page.setViewportSize({width:390,height:844});
  await page.emulateMedia({reducedMotion:'reduce'});
  await editor().getByRole('button',{name:'Отмена',exact:true}).click();await editor().waitFor({state:'hidden'});await openEdit();
  assert.equal(await editor().evaluate(el=>el.getAnimations().length),0);
  await page.keyboard.press('Tab');assert(await editor().evaluate(el=>el.contains(document.activeElement)));
  await page.keyboard.press('Shift+Tab');assert(await editor().evaluate(el=>el.contains(document.activeElement)));
  assert.deepEqual(errors,[]);
  console.log('Editor UI passed: large desktop/mobile editor, palette/borders, keyboard viewport simulation, narrow/landscape layouts, discard/continue, error retry, saved branch, nested persona/character fields, isolated chat persona, focus and reduced motion.');
} catch(error) { await page?.screenshot({path:'test-results/editor-failure.png'}).catch(()=>{});throw error; }
finally { await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));store.close();rmSync(dir,{recursive:true,force:true}); }
