import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { allowed, audit, inventory } from '../scripts/publication.mjs';

test('publication defaults to rejecting runtime data and arbitrary assets',()=>{
  for(const file of ['data/larsta.sqlite','server/data/saved.json','uploads/avatar.png','backups/copy.json','README.old.md','REPORT.md','.env','src/.env.local','src/secret.key','public/portrait.svg','public/portrait.png','scripts/extract-i18n.mjs'])assert.equal(allowed(file),false,file);
  for(const file of ['README.md','README.ru.md','.gitignore','src/App.tsx','shared/translations.ts','scripts/publication.mjs','examples/character-v2.json','public/favicon.svg'])assert.equal(allowed(file),true,file);
});

test('publication audit detects private profiles, text, saved settings, and secrets without exposing matches',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'larsta-publication-'));
  try{
    const root=path.join(dir,'source'),privateDir=path.join(dir,'private');fs.mkdirSync(root);fs.mkdirSync(privateDir);
    const name='PrivacyFixtureIdentity',model='fixture/private-saved-model',secret='local-fixture-secret-value',code='98765432';
    const story='This entirely synthetic privacy fixture describes a hidden violet notebook beside an imaginary clock tower. It is never a real conversation.';
    const db=new DatabaseSync(path.join(privateDir,'larsta.sqlite'));
    db.exec('CREATE TABLE characters(id TEXT,card TEXT,summary TEXT); CREATE TABLE messages(id TEXT,content TEXT,reasoning TEXT); CREATE TABLE settings(value TEXT)');
    db.prepare('INSERT INTO characters VALUES(?,?,?)').run('fixture-private-record',JSON.stringify({data:{name,alternate_greetings:[story]}}),'');
    db.prepare('INSERT INTO messages VALUES(?,?,?)').run('fixture-message-record',story,'');
    db.prepare('INSERT INTO settings VALUES(?)').run(JSON.stringify({mainModel:model}));db.close();
    fs.writeFileSync(path.join(privateDir,'server-secrets.json'),JSON.stringify({apiKey:secret,connectionCode:code}));
    fs.writeFileSync(path.join(root,'README.md'),'Clean synthetic application source.');
    assert.deepEqual(audit(root,{privateDir}).violations,[]);
    const privateBytes=fs.readFileSync(path.join(privateDir,'larsta.sqlite'));
    for(const value of [name,model,secret,code,story.slice(0,96)]){
      fs.writeFileSync(path.join(root,'README.md'),value);const result=audit(root,{privateDir});
      assert(result.violations.length>0);assert(!JSON.stringify(result.violations).includes(value));assert.equal(result.privateRecordsCompared,2);
    }
    assert.deepEqual(fs.readFileSync(path.join(privateDir,'larsta.sqlite')),privateBytes,'audit must not mutate the private database');
    fs.writeFileSync(path.join(root,'README.md'),'Clean source');fs.mkdirSync(path.join(root,'data'));fs.writeFileSync(path.join(root,'data','saved.json'),'{}');
    assert(audit(root).violations.some(item=>item.file==='data/saved.json'));
    assert.deepEqual(inventory(root,true),['README.md']);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('publication rejects unmarked credentials and binary content',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'larsta-token-audit-'));
  try{
    const filename=path.join(dir,'README.md');
    fs.writeFileSync(filename,['sk','or','v1','x'.repeat(40)].join('-'));assert(audit(dir).violations.length);
    fs.writeFileSync(filename,Buffer.from([65,0,66]));assert(audit(dir).violations.some(item=>item.rule==='unexpected binary content'));
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('publication detects every provider key without a token prefix and private connection metadata',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'larsta-provider-publication-'));
  try{
    const root=path.join(dir,'source'),privateDir=path.join(dir,'private');fs.mkdirSync(root);fs.mkdirSync(privateDir);
    const db=new DatabaseSync(path.join(privateDir,'larsta.sqlite'));db.exec('CREATE TABLE providers(id TEXT,value TEXT)');
    const metadata={id:'fixture-private-provider-id',name:'Fixture Private Connection',baseUrl:'https://private.fixture.invalid/custom',lastModel:'fixture-private-model'};
    db.prepare('INSERT INTO providers VALUES(?,?)').run(metadata.id,JSON.stringify(metadata));db.close();
    const key='arbitrary-fixture-credential-without-vendor-prefix';fs.writeFileSync(path.join(privateDir,'server-secrets.json'),JSON.stringify({version:2,connectionCode:'87654321',providerKeys:{[metadata.id]:{key,origin:'https://private.fixture.invalid'}}}));
    for(const value of [key,metadata.id,metadata.name,metadata.baseUrl,metadata.lastModel]){fs.writeFileSync(path.join(root,'README.md'),value);const result=audit(root,{privateDir});assert(result.violations.length>0);assert(!JSON.stringify(result.violations).includes(value));}
    fs.writeFileSync(path.join(root,'README.md'),'Clean source');assert.deepEqual(audit(root,{privateDir}).violations,[]);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
