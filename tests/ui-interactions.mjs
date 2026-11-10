import assert from 'node:assert/strict';
import { mkdtempSync,readFileSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import express from 'express';
import { createApp } from '../dist-server/server/app.js';
import { RouterClient } from '../dist-server/server/openrouter.js';

const {chromium}=await import(process.env.LARSTA_PLAYWRIGHT_MODULE?pathToFileURL(process.env.LARSTA_PLAYWRIGHT_MODULE).href:'playwright');
const dir=mkdtempSync(path.join(tmpdir(),'larsta-interactions-'));
const {app,store,secrets}=createApp({dataDir:dir,router:new RouterClient(async()=>{throw new Error('No model requests in interaction checks');})});
const character=store.saveCharacter(JSON.parse(readFileSync('examples/character-v2.json','utf8')),'Тестовый профиль');
const chat=store.createChat(character.id);
app.use(express.static(path.resolve('dist')));
const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
const base='http://127.0.0.1:'+server.address().port;
let browser;const errors=[];
try{
  browser=await chromium.launch({headless:true,channel:process.env.LARSTA_BROWSER_CHANNEL||'chrome'});
  const context=await browser.newContext({locale:'ru-RU',viewport:{width:1280,height:900},reducedMotion:'no-preference'});
  await context.request.post(base+'/api/auth',{data:{code:secrets.connectionCode}});
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  await page.goto(base+'/#library');await page.waitForFunction(()=>document.documentElement.dataset.motion==='on');
  const filter=page.getByRole('button',{name:'Фильтры персонажей',exact:true});await filter.waitFor();
  await filter.hover();await page.waitForFunction(()=>Number(getComputedStyle(document.querySelector('.filter-toggle')).scale)>1.02);
  const box=await filter.boundingBox();await page.mouse.down();
  await page.waitForFunction(()=>Number(getComputedStyle(document.querySelector('.filter-toggle')).scale)<.98);
  await page.mouse.up();assert.equal(await filter.getAttribute('aria-expanded'),'true');
  assert(await filter.evaluate(el=>el.getAnimations().length>0),'release should animate while the action already worked');
  await page.mouse.move(1000,700);await page.waitForFunction(()=>document.querySelector('.filter-toggle').getAnimations().length===0);
  const restored=await filter.boundingBox();assert(Math.abs(restored.width-box.width/1.045)<2,'button returns to its normal size');
  await filter.focus();await page.keyboard.press('Enter');assert.equal(await filter.getAttribute('aria-expanded'),'false');
  assert(await filter.evaluate(el=>el.getAnimations().length>0),'keyboard activation has the same release feedback');

  await page.goto(base+'/#chat/'+chat.id);const send=page.getByRole('button',{name:'Отправить сообщение',exact:true});await send.waitFor();
  assert(await send.isDisabled());
  assert.equal(await send.evaluate(el=>{el.click();return el.getAnimations().length;}),0,'empty composer does not animate or send');

  await page.goto(base+'/#settings');const animations=page.getByRole('checkbox',{name:'Плавные анимации',exact:true});await animations.waitFor();
  await page.waitForFunction(()=>document.querySelector('.settings-page').getAnimations().length===0);
  assert.equal(await animations.evaluate(el=>Math.round(el.getBoundingClientRect().width)),42);
  await animations.uncheck();await page.waitForFunction(()=>document.documentElement.dataset.motion==='off');
  assert.equal(await animations.evaluate(el=>getComputedStyle(el,'::before').transitionDuration),'0s');
  await page.goto(base+'/#library');await filter.waitFor();await filter.hover();
  assert.equal(await filter.evaluate(el=>getComputedStyle(el).scale),'none');
  await filter.click();assert.equal(await filter.evaluate(el=>el.getAnimations().length),0);
  assert.equal(await filter.getAttribute('aria-expanded'),'true','motion preference never disables the action');

  await page.goto(base+'/#settings');await animations.check();await page.waitForFunction(()=>document.documentElement.dataset.motion==='on');
  await page.emulateMedia({reducedMotion:'reduce'});await page.waitForFunction(()=>document.documentElement.dataset.motion==='off');
  await page.goto(base+'/#library');await filter.waitFor();await filter.click();assert.equal(await filter.evaluate(el=>el.getAnimations().length),0);

  const phone=await browser.newContext({locale:'ru-RU',viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'no-preference'});
  await phone.request.post(base+'/api/auth',{data:{code:secrets.connectionCode}});
  const touch=await phone.newPage();touch.on('pageerror',error=>errors.push(error.message));await touch.goto(base+'/#library');
  const touchFilter=touch.getByRole('button',{name:'Фильтры персонажей',exact:true});await touchFilter.waitFor();
  assert.equal(await touch.evaluate(()=>matchMedia('(hover:hover) and (pointer:fine)').matches),false);
  await touchFilter.tap();assert.equal(await touchFilter.getAttribute('aria-expanded'),'true');
  assert(await touchFilter.evaluate(el=>el.getAnimations().length>0),'touch activation gets a visible response');
  await touch.waitForFunction(()=>document.querySelector('.filter-toggle').getAnimations().length===0);
  assert.equal(await touchFilter.evaluate(el=>Number(getComputedStyle(el).scale)),1,'touch must not leave a sticky hover scale');
  assert.equal(await touch.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  assert.deepEqual(errors,[]);
  console.log('Interactions UI passed: mouse hover/hold/release, immediate action, keyboard activation, disabled send, animated switches, saved motion preference, OS reduced motion and touch without sticky hover.');
}finally{
  await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));store.close();rmSync(dir,{recursive:true,force:true});
}
