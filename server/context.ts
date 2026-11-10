import type { Card, ChatPersona, Message, Model, Settings } from '../shared/types.js';
import { AppError, substitute } from './domain.js';
export type PromptMessage = { role: 'system' | 'user' | 'assistant'; content: string };
// Conservative UTF-8 byte budget, independent of provider tokenizers. Reserve output separately.
export const estimate = (s: string) => Buffer.byteLength(s, 'utf8') + 16;
export function withPersona(settings: Omit<Settings,'hasApiKey'>, persona?: ChatPersona): Omit<Settings,'hasApiKey'> {
  if (!persona) return settings;
  return { ...settings, personaName: persona.name, personaDescription: [persona.appearance && `Appearance: ${persona.appearance}`, persona.personality && `Personality: ${persona.personality}`, persona.description].filter(Boolean).join('\n\n') };
}
export function buildContext(settings: Omit<Settings,'hasApiKey'>, card: Card, history: Message[], model?: Model, options: {instruction?: string; continuation?: boolean} = {}) {
  const d = card.data;
  const fill = (s: string) => substitute(s, d.name, settings.personaName || 'Вы');
  const system = fill([
    settings.systemPrompt,
    'Continuity: check names, quantities, appearance, relationships, and events against the character card and supplied history. Preserve established facts. Do not call a known fact unknown. Apply requested changes relative to the latest known state and story events. Changing models or skipping time does not reset the story. Do not invent missing facts.',
    d.system_prompt ? d.system_prompt.replace(/\{\{original\}\}/g, () => settings.systemPrompt) : '',
    `Character: ${d.name}`, `Description: ${d.description}`, `Personality: ${d.personality}`,
    `Scenario: ${d.scenario}`, d.mes_example ? `Example dialogue (style reference, not events in this conversation):\n${d.mes_example}` : '',
    `User name: ${settings.personaName}`, `User persona: ${settings.personaDescription}`
  ].filter(Boolean).join('\n\n'));
  const tail = [d.post_history_instructions ? fill(d.post_history_instructions.replace(/\{\{original\}\}/g, '')) : '', options.instruction].filter(Boolean).join('\n\n');
  const maxTokens = Math.min(settings.maxTokens, model?.top_provider?.max_completion_tokens || settings.maxTokens);
  const totalBudget = Math.min(settings.contextBudget, model?.context_length || settings.contextBudget);
  const available = totalBudget - maxTokens - 256;
  const fixed = estimate(system) + (tail ? estimate(tail) : 0);
  if (fixed >= available) throw new AppError(400,'Карточка и системные инструкции превышают бюджет контекста. Сократите их или увеличьте бюджет в настройках.');
  const usable=history.filter(message=>message.content.trim());
  const kept: PromptMessage[] = []; let used = fixed;
  for (let i = usable.length - 1; i >= 0; i--) {
    const m = usable[i], content = fill(m.content), cost = estimate(content);
    if (used + cost > available) {
      if (!kept.length) throw new AppError(400,'Последнее сообщение не помещается в бюджет контекста. Сократите его или увеличьте бюджет.');
      break;
    }
    kept.unshift({role:m.role,content}); used += cost;
  }
  if (kept.length < usable.length) while (kept.length > 1 && kept[0].role === 'assistant') used-=estimate(kept.shift()!.content);
  if (!options.continuation && !kept.some(m=>m.role==='user')) throw new AppError(400,'В контексте нет реплики пользователя. Увеличьте бюджет контекста.');
  return { messages: [{role:'system',content:system}, ...kept, ...(tail ? [{role:'system' as const,content:tail}] : [])] as PromptMessage[], omitted: usable.length-kept.length, maxTokens, estimatedBytes:used, contextLimit:totalBudget };
}
