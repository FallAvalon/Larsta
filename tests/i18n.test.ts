import test from 'node:test';
import assert from 'node:assert/strict';
import { translate } from '../shared/translations.js';
test('UI translation preserves placeholders, spacing, and arbitrary user strings',()=>{
  assert.equal(translate('Настройки','en'),'Settings');assert.equal(translate('Настройки','ru'),'Настройки');
  assert.equal(translate(' · Вы: ','en'),' · You: ');
  assert.equal(translate('Написать {0}…','en',{0:'Настройки'}),'Message Настройки…');
  assert.equal(translate('A user-authored sentence.','en'),'A user-authored sentence.');
  assert.equal(translate('Вариант 2 из 4','en'),'Variant 2 of 4');
  assert.equal(translate('OpenRouter отклонил запрос: проверьте разрешения ключа и ограничения модели. provider details','en'),'OpenRouter rejected the request. Check the key permissions and model restrictions. provider details');
});
