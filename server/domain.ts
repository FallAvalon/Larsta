import { z } from 'zod';
import type { Card, Settings } from '../shared/types.js';

export class AppError extends Error { constructor(public status: number, message: string) { super(message); } }
export const personaSchema = z.object({
  name: z.string().trim().min(1).max(120), appearance: z.string().max(6000).default(''),
  personality: z.string().max(6000).default(''), description: z.string().max(20000).default('')
});
const text = z.string().max(100_000);
export const cardSchema = z.object({
  spec: z.literal('chara_card_v2'), spec_version: z.literal('2.0'),
  data: z.object({
    name: z.string().trim().min(1).max(120), description: text, personality: text, scenario: text,
    first_mes: text, mes_example: text, creator_notes: text.default(''), system_prompt: text.default(''),
    post_history_instructions: text.default(''), alternate_greetings: z.array(text).max(100).default([]),
    tags: z.array(z.string().trim().min(1).max(80)).max(50).default([]), creator: z.string().max(200).default(''),
    character_version: z.string().max(100).default('1.0'), extensions: z.record(z.string(), z.unknown()).default({}),
    character_book: z.object({ entries: z.array(z.object({ keys: z.array(z.string()), content: text, enabled: z.boolean(), insertion_order: z.number(), extensions: z.record(z.string(), z.unknown()).default({}) }).passthrough()).max(1000), extensions: z.record(z.string(), z.unknown()).default({}) }).passthrough().optional()
  }).passthrough()
}).passthrough();
export function parseCard(input: unknown): Card {
  const result = cardSchema.safeParse(input);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new AppError(400, `Некорректная карточка Character Card V2: проверьте поле «${issue.path.join('.')}». Нужны spec: chara_card_v2, spec_version: 2.0 и объект data. Сверьтесь с examples/character-v2.json.`);
  }
  return result.data;
}
export const settingsSchema = z.object({
  mainModel: z.string().trim().max(200), auxiliaryModel: z.string().trim().max(200),
  clientProfile: z.enum(['larsta','opencode']).default('larsta'),
  temperature: z.number().min(0).max(2), reasoningEffort: z.enum(['auto','none','low','medium','high']).default('auto'), maxTokens: z.number().int().min(64).max(32768),
  contextBudget: z.number().int().min(2048).max(131072), systemPrompt: z.string().max(50000),
  personaName: z.string().trim().max(120), personaDescription: z.string().max(20000)
});
export const defaults: Omit<Settings, 'hasApiKey'> = {
  mainModel: '', auxiliaryModel: '', clientProfile: 'larsta', temperature: 0.85, reasoningEffort: 'auto', maxTokens: 1024, contextBudget: 16384,
  personaName: 'You', personaDescription: '',
  systemPrompt: 'Write a collaborative fictional story as {{char}}. Keep the character\'s voice, motives, and knowledge consistent with the supplied card. Follow established events. Let {{user}} control their own choices, thoughts, dialogue, and actions. Use the language the user is speaking. Use *italics* for actions when helpful. Stay in character unless asked otherwise.'
};
export const substitute = (s: string, char: string, user: string) => s.replace(/\{\{char\}\}/gi, () => char).replace(/\{\{user\}\}/gi, () => user);
