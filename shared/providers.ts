import type { Model, ProviderConfig, ProviderKind } from './types.js';

export const providerPresets: Record<ProviderKind, Omit<ProviderConfig, 'id' | 'revision' | 'lastModel'>> = {
  openrouter: {kind:'openrouter',name:'OpenRouter',baseUrl:'https://openrouter.ai/api/v1',auth:'bearer',compatibility:{tokenLimit:'max_tokens',temperature:true,reasoning:'reasoning'}},
  lmstudio: {kind:'lmstudio',name:'LM Studio',baseUrl:'http://localhost:1234/v1',auth:'none',compatibility:{tokenLimit:'max_tokens',temperature:true,reasoning:'none'}},
  ollama: {kind:'ollama',name:'Ollama',baseUrl:'http://localhost:11434/v1',auth:'none',compatibility:{tokenLimit:'max_tokens',temperature:true,reasoning:'reasoning_effort'}},
  omniroute: {kind:'omniroute',name:'OmniRoute',baseUrl:'http://localhost:20128/v1',auth:'none',compatibility:{tokenLimit:'max_tokens',temperature:true,reasoning:'reasoning_effort'}},
  polza: {kind:'polza',name:'Polza.ai',baseUrl:'https://polza.ai/api/v1',auth:'bearer',compatibility:{tokenLimit:'max_tokens',temperature:true,reasoning:'reasoning'}},
  custom: {kind:'custom',name:'OpenAI-compatible',baseUrl:'',auth:'bearer',compatibility:{tokenLimit:'max_tokens',temperature:true,reasoning:'none'}}
};
export const legacyProvider: ProviderConfig = {...providerPresets.openrouter,id:'openrouter',revision:1,lastModel:''};
export function isFreeModel(model: Model) { return [model.pricing.prompt,model.pricing.completion,model.pricing.request??'0'].every(value=>Number.isFinite(Number(value))&&Number(value)===0); }
