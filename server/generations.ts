import type { Response } from 'express';
import { translate } from '../shared/translations.js';

type Snapshot = Record<string, unknown> & {content: string; reasoning: string};
type Listener = {response: Response; limit?: number; heartbeat: ReturnType<typeof setInterval>};
type Task = {snapshot: Snapshot | null; listeners: Set<Listener>};

/** The provider request belongs to the server. Browsers only subscribe to it. */
export class GenerationStreams {
  private tasks = new Map<string, Task>();

  begin(chatId: string) { this.tasks.set(chatId, {snapshot:null, listeners:new Set()}); }

  subscribe(chatId: string, response: Response, limit?: number): boolean {
    const task = this.tasks.get(chatId);
    if (!task) return false;
    if (response.destroyed) return true;
    response.status(200).set({
      'Content-Type':'text/event-stream; charset=utf-8', 'Cache-Control':'no-cache, no-transform',
      'Connection':'keep-alive', 'X-Accel-Buffering':'no'
    });
    response.flushHeaders();
    const heartbeat = setInterval(() => {
      if (!response.destroyed) response.write(': keep-alive\n\n');
    }, 15000);
    heartbeat.unref();
    const listener = {response, limit, heartbeat};
    task.listeners.add(listener);
    response.once('close', () => { clearInterval(heartbeat); task.listeners.delete(listener); });
    if (task.snapshot) this.write(listener, 'start', task.snapshot);
    return true;
  }

  publish(chatId: string, event: string, value: Record<string, unknown>) {
    const task = this.tasks.get(chatId);
    if (!task) return;
    if (event === 'start') task.snapshot = {content:'', reasoning:'', ...value};
    if (event === 'delta' && task.snapshot) task.snapshot.content += String(value.content || '');
    if (event === 'reasoning' && task.snapshot) task.snapshot.reasoning += String(value.content || '');
    for (const listener of task.listeners) this.write(listener, event, value);
  }

  finish(chatId: string, value: Record<string, unknown>) {
    const task = this.tasks.get(chatId);
    if (!task) return;
    for (const listener of task.listeners) {
      this.write(listener, 'done', value);
      clearInterval(listener.heartbeat);
      listener.response.end();
    }
    this.tasks.delete(chatId);
  }

  private write({response, limit}: Listener, event: string, value: Record<string, unknown>) {
    if (response.destroyed) return;
    // A suspended/slow phone must not buffer an unbounded copy of the answer.
    if (response.writableLength > 1024 * 1024) { response.destroy(); return; }
    let payload = value;
    if(event==='error'&&typeof value.message==='string')payload={...value,message:translate(value.message,response.locals.language||'ru')};
    if (event === 'done' && limit && Array.isArray(value.messages)) {
      payload = {...value, messages:value.messages.slice(-limit), hasMore:value.messages.length > limit};
    }
    response.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
  }
}
