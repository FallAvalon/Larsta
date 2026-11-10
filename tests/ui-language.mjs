import assert from 'node:assert/strict';
import { mkdtempSync,readFileSync,rmSync,mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import express from 'express';
import { createApp } from '../dist-server/server/app.js';
import { RouterClient } from '../dist-server/server/openrouter.js';
import { defaults } from '../dist-server/server/domain.js';
const {chromium}=await import(process.env.LARSTA_PLAYWRIGHT_MODULE?pathToFileURL(process.env.LARSTA_PLAYWRIGHT_MODULE).href:'playwright');
const dir=mkdtempSync(path.join(tmpdir(),'larsta-language-'));
const router=new RouterClient(async url=>{if(String(url).endsWith('/models'))return Response.json({data:[{id:'fixture/story',name:'Fixture story model',context_length:32000,pricing:{prompt:'0',completion:'0'},supported_parameters:['temperature','max_tokens']}]});throw new Error('No generation in language checks');});
const {app,store,secrets}=createApp({dataDir:dir,router});store.saveSettings({...defaults,mainModel:'fixture/story'});
const character=store.saveCharacter(JSON.parse(readFileSync('examples/character-v2.json','utf8')),'Public example');
const chat=store.createChat(character.id);store.addMessage(chat.id,'user','A fictional test message.');store.addMessage(chat.id,'assistant','A fictional test response.');
app.use(express.static(path.resolve('dist')));const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));const base='http://127.0.0.1:'+server.address().port;
let browser,page;
try{
  browser=await chromium.launch({headless:true,channel:process.env.LARSTA_BROWSER_CHANNEL||'chrome'});
  const context=await browser.newContext({locale:'en-US',viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'});
  page=await context.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));
  async function englishOnly(){
    const leaked=await page.evaluate(()=>{
      const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT),texts=[];let node;
      while(node=walker.nextNode()){
        const parent=node.parentElement;if(!parent||parent.closest('option,script,style,.message-text'))continue;
        if(parent.getClientRects().length&&getComputedStyle(parent).visibility!=='hidden'&&/[а-яё]/i.test(node.textContent))texts.push(node.textContent.trim());
      }return texts;
    });assert.deepEqual(leaked,[],'English interface must not contain untranslated Russian labels');
  }
  await page.goto(base);await page.getByRole('textbox',{name:'Connection code',exact:true}).waitFor();await englishOnly();
  await page.getByRole('textbox',{name:'Connection code',exact:true}).fill(secrets.connectionCode);await page.getByRole('button',{name:'Connect to Larsta',exact:true}).click();
  await page.getByRole('button',{name:'Continue',exact:true}).waitFor();await englishOnly();
  const nav=page.getByRole('navigation',{name:'Main navigation',exact:true});
  await nav.getByRole('button',{name:'Settings',exact:true}).click();await page.getByRole('combobox',{name:'Interface language',exact:true}).waitFor();
  assert.equal(await page.getByRole('combobox',{name:'Interface language',exact:true}).inputValue(),'en');await englishOnly();
  await page.getByRole('tab',{name:'Model',exact:true}).click();await page.getByRole('combobox',{name:'OpenRouter client profile',exact:true}).selectOption('opencode');await englishOnly();
  await page.getByRole('tab',{name:'Appearance',exact:true}).click();await page.getByRole('combobox',{name:'Interface language',exact:true}).selectOption('ru');
  await page.getByRole('heading',{name:'Настройки',exact:true}).waitFor();assert.equal(await page.locator('html').getAttribute('lang'),'ru');
  await page.getByRole('tab',{name:'Модель',exact:true}).click();assert.equal(await page.getByRole('combobox',{name:'Профиль клиента OpenRouter',exact:true}).inputValue(),'opencode');
  await page.getByRole('tab',{name:'Оформление',exact:true}).click();await page.getByRole('combobox',{name:'Язык интерфейса',exact:true}).selectOption('en');
  await page.getByRole('button',{name:'Save changes',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('.settings-actions'));
  await page.getByRole('tab',{name:'Story',exact:true}).click();await englishOnly();
  await page.getByRole('tab',{name:'Server',exact:true}).click();await englishOnly();
  await page.reload();await page.getByRole('tab',{name:'Appearance',exact:true}).waitFor();assert.equal(await page.locator('html').getAttribute('lang'),'en');
  await nav.getByRole('button',{name:'Characters',exact:true}).click();await page.getByRole('button',{name:'Open Sample Guide',exact:true}).click();await page.getByRole('dialog',{name:'Character card',exact:true}).waitFor();await englishOnly();
  await page.getByRole('button',{name:'Edit',exact:true}).click();await page.getByRole('dialog',{name:'Edit character',exact:true}).waitFor();await englishOnly();
  await page.getByRole('button',{name:'Cancel',exact:true}).click();await page.getByRole('button',{name:'Create character',exact:true}).click();await page.getByRole('textbox',{name:'Name',exact:true}).waitFor();await englishOnly();await page.getByRole('button',{name:'Cancel',exact:true}).click();
  await nav.getByRole('button',{name:'Personas',exact:true}).click();await page.getByRole('button',{name:'Create persona',exact:true}).click();await page.getByRole('textbox',{name:'Persona name',exact:true}).waitFor();await englishOnly();await page.getByRole('button',{name:'Cancel',exact:true}).click();
  await page.goto(base+'/#chat/'+chat.id);await page.getByRole('textbox',{name:'Your message',exact:true}).waitFor();await englishOnly();
  await page.getByRole('button',{name:'Model and responses',exact:true}).click();await page.getByRole('button',{name:'This chat',exact:true}).click();await page.getByRole('combobox',{name:'Model for this chat',exact:true}).waitFor();await englishOnly();await page.getByRole('button',{name:'Cancel',exact:true}).click();
  await page.getByRole('button',{name:'Regenerate response',exact:true}).last().click();await page.getByRole('textbox',{name:'Response guidance',exact:true}).waitFor();await englishOnly();
  await page.getByRole('button',{name:'More dialogue',exact:true}).click();assert.equal(await page.getByRole('textbox',{name:'Response guidance',exact:true}).inputValue(),'More dialogue');await page.getByRole('button',{name:'Cancel',exact:true}).click();
  const response=await context.request.get(base+'/api/characters/missing',{headers:{'Accept-Language':'en'}});assert.equal(response.status(),404);assert.equal((await response.json()).error,'Character not found.');
  const ru=await browser.newContext({locale:'ru-RU',storageState:await context.storageState()});const saved=await ru.newPage();await saved.goto(base+'/#settings');await saved.getByRole('heading',{name:'Settings',exact:true}).waitFor();
  const freshRu=await browser.newContext({locale:'ru-RU'});await freshRu.request.post(base+'/api/auth',{data:{code:secrets.connectionCode}});const local=await freshRu.newPage();await local.goto(base+'/#settings');await local.getByRole('heading',{name:'Настройки',exact:true}).waitFor();
  assert.deepEqual(errors,[]);mkdirSync('test-results',{recursive:true});await saved.screenshot({path:'test-results/language-en-settings.png'});
  console.log('Language UI passed: English and Russian defaults, instant switch, saved device preference, dirty settings preserved, English dialogs/tools/errors, and isolated device language.');
}catch(error){mkdirSync('test-results',{recursive:true});await page?.screenshot({path:'test-results/language-failure.png'}).catch(()=>{});throw error;}
finally{await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));store.close();rmSync(dir,{recursive:true,force:true});}
