import { existsSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { randomInt } from 'node:crypto';
import path from 'node:path';
export class Secrets {
  private value: { connectionCode: string; apiKey: string };
  private file: string;
  constructor(dir: string) {
    this.file = path.join(dir, 'server-secrets.json');
    this.value = existsSync(this.file) ? JSON.parse(readFileSync(this.file,'utf8')) : { connectionCode: String(randomInt(10_000_000, 100_000_000)), apiKey: '' };
    this.save();
  }
  get connectionCode() { return this.value.connectionCode; }
  get apiKey() { return process.env.OPENROUTER_API_KEY || this.value.apiKey; }
  setKey(key: string) { this.value.apiKey = key; this.save(); }
  private save() { writeFileSync(this.file+'.tmp',JSON.stringify(this.value,null,2),{mode:0o600}); renameSync(this.file+'.tmp',this.file); }
}
