import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import express from 'express';
import { createApp } from '../dist-server/server/app.js';

const { chromium } = await import(process.env.LARSTA_PLAYWRIGHT_MODULE ? pathToFileURL(process.env.LARSTA_PLAYWRIGHT_MODULE).href : 'playwright');
const dir = mkdtempSync(path.join(tmpdir(), 'larsta-wallpaper-'));
const { app, store, secrets } = createApp({ dataDir: dir });
const card = JSON.parse(readFileSync('examples/character-v2.json', 'utf8'));
const character = store.saveCharacter(card, '');
const avatar = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
store.db.prepare('UPDATE characters SET avatar=? WHERE id=?').run(avatar, character.id);
const chat = store.createChat(character.id);
app.use(express.static(path.resolve('dist')));
const server = app.listen(0, '127.0.0.1');
await new Promise(resolve => server.once('listening', resolve));
const base = 'http://127.0.0.1:' + server.address().port;
let browser;
try {
  browser = await chromium.launch({ headless: true, channel: process.env.LARSTA_BROWSER_CHANNEL || 'chrome' });
  mkdirSync('test-results', { recursive: true });
  for (const width of [1440, 390, 320]) {
    const context = await browser.newContext({ locale: 'ru-RU', viewport: { width, height: 900 }, isMobile: width < 500, hasTouch: width < 500, reducedMotion: 'reduce' });
    await context.request.post(base + '/api/auth', { data: { code: secrets.connectionCode } });
    const page = await context.newPage();
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(base + '/#chat/' + chat.id);
    const background = page.locator('.chat-page > .chat-wallpaper img');
    await background.waitFor(); assert.equal(await background.getAttribute('src'), avatar);
    const open = async () => { await page.getByRole('button', { name: 'Настройки чата', exact: true }).click(); await page.getByRole('heading', { name: 'Обои чата', exact: true }).waitFor(); };
    await open();
    const image = await page.evaluate(() => {
      const canvas = document.createElement('canvas'); canvas.width = 2400; canvas.height = 1600;
      const ctx = canvas.getContext('2d'); ctx.fillStyle = '#416380'; ctx.fillRect(0, 0, 2400, 1600);
      return canvas.toDataURL('image/png').split(',')[1];
    });
    const input = page.getByLabel('Выбрать обои', { exact: true });
    await input.setInputFiles({ name: 'phone-photo.png', mimeType: 'image/png', buffer: Buffer.from(image, 'base64') });
    await page.getByRole('button', { name: 'Вернуть аватарку', exact: true }).waitFor();
    const saved = await background.getAttribute('src'); assert(saved.startsWith('data:image/jpeg;base64,'));
    assert.equal(await page.locator('.appearance-preview .chat-wallpaper img').getAttribute('src'), saved);
    assert.equal(await background.evaluate(image => image.naturalWidth), 1920);
    await input.setInputFiles({ name: 'broken.png', mimeType: 'image/png', buffer: Buffer.from('broken') });
    await page.getByRole('alert').filter({ hasText: 'Не удалось открыть изображение' }).waitFor();
    assert.equal(await background.getAttribute('src'), saved);
    // Storage failures preserve the previous image and are visible to the user.
    await page.evaluate(() => { window.originalSetItem = Storage.prototype.setItem; Storage.prototype.setItem = function () { throw new DOMException('full', 'QuotaExceededError'); }; });
    await input.setInputFiles({ name: 'retry.png', mimeType: 'image/png', buffer: Buffer.from(image, 'base64') });
    await page.getByRole('alert').filter({ hasText: 'Не удалось сохранить обои' }).waitFor();
    assert.equal(await background.getAttribute('src'), saved);
    await page.evaluate(() => { Storage.prototype.setItem = window.originalSetItem; });
    await page.reload(); await background.waitFor(); assert.equal(await background.getAttribute('src'), saved);
    await open();
    await page.getByRole('button', { name: 'Загрузить свои обои', exact: true }).scrollIntoViewIfNeeded();
    const bounds = await page.getByRole('button', { name: 'Загрузить свои обои', exact: true }).boundingBox();
    assert(bounds.x >= 0 && bounds.x + bounds.width <= width);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: `test-results/wallpaper-${width}.png` });
    await page.getByLabel('Показывать обои', { exact: true }).uncheck(); assert.equal(await background.count(), 0);
    await page.getByRole('button', { name: 'Вернуть аватарку', exact: true }).click();
    await background.waitFor(); assert.equal(await background.getAttribute('src'), avatar);
    await page.reload(); await background.waitFor(); assert.equal(await background.getAttribute('src'), avatar);
    assert.deepEqual(errors, []);
    await context.close();
  }
  console.log('Wallpaper UI passed: desktop/mobile, avatar default, upload, resize, preview, persistence, errors, quota failure, toggle and restore.');
} finally {
  await browser?.close(); await new Promise(resolve => server.close(resolve)); store.close(); rmSync(dir, { recursive: true, force: true });
}
