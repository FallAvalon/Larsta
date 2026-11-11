export interface CardData {
  name: string; description: string; personality: string; scenario: string;
  first_mes: string; mes_example: string; creator_notes: string; system_prompt: string;
  post_history_instructions: string; alternate_greetings: string[]; tags: string[];
  creator: string; character_version: string; extensions: Record<string, unknown>;
  [key: string]: unknown;
}
export interface Card { spec: 'chara_card_v2'; spec_version: '2.0'; data: CardData; [key: string]: unknown }
export interface Character { id: string; card: Card; summary: string; avatar: string | null; favorite: boolean; createdAt: string; updatedAt: string }
export interface PersonaData { name: string; appearance: string; personality: string; description: string; avatar: string | null }
export interface Persona extends PersonaData { id: string; isDefault: boolean; createdAt: string; updatedAt: string }
export interface ChatPersona extends PersonaData { sourceId: string | null }
export type ChatGenerationSettings = Partial<Pick<Settings, 'providerId' | 'mainModel' | 'temperature' | 'maxTokens'>>;
export interface Chat { id: string; characterId: string; title: string; createdAt: string; updatedAt: string; persona?: ChatPersona; personaName?: string; lastMessage?: string; characterName?: string; avatar?: string | null; generation?: ChatGenerationSettings; branchGroupId?: string | null; revision?: number }
export type MessageStatus = 'complete' | 'streaming' | 'stopped' | 'error';
export interface ProviderOrigin { providerId?: string; providerName?: string }
export interface MessageVariant extends ProviderOrigin { id: string; status: MessageStatus; model: string | null; createdAt: string }
export interface MessageVariantPreview extends MessageVariant { content: string; reasoning?: string }
export interface Message extends ProviderOrigin { id: string; chatId: string; role: 'user' | 'assistant'; content: string; reasoning?: string; status: MessageStatus; model: string | null; createdAt: string; selectedVariantId?: string | null; variants?: MessageVariant[] }
export interface Settings { providerId: string; mainModel: string; auxiliaryModel: string; clientProfile: 'larsta' | 'opencode'; temperature: number; reasoningEffort: 'auto' | 'none' | 'low' | 'medium' | 'high'; maxTokens: number; contextBudget: number; systemPrompt: string; personaName: string; personaDescription: string; hasApiKey: boolean }
export interface Model { id: string; providerId?: string; name: string; context_length: number; pricing: { prompt: string; completion: string; request?: string; currency?: string }; supported_parameters: string[]; parametersKnown?: boolean; top_provider?: { max_completion_tokens?: number | null }; architecture?: { output_modalities?: string[] } }
export type ProviderKind = 'openrouter' | 'lmstudio' | 'ollama' | 'omniroute' | 'polza' | 'custom';
export interface ProviderCompatibility { tokenLimit: 'max_tokens' | 'max_completion_tokens' | 'none'; temperature: boolean; reasoning: 'none' | 'reasoning' | 'reasoning_effort' }
export interface ProviderConfig { id: string; kind: ProviderKind; name: string; baseUrl: string; auth: 'bearer' | 'none'; lastModel: string; compatibility: ProviderCompatibility; revision: number }
export interface Provider extends ProviderConfig { hasApiKey: boolean; keySource: 'saved' | 'environment' | 'none'; chatCount: number; isDefault: boolean }
export interface ProviderProbe { connected: boolean; catalog: 'ok' | 'unavailable'; models: number; authentication: 'verified' | 'not-verified' | 'none'; elapsedMs: number; warning?: string }
export function supportsParameter(model: Model | undefined, parameter: string) { return !model || model.parametersKnown === false || model.supported_parameters.includes(parameter); }
