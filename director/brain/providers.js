// Every brain the Director can use. Each one offers the same small surface:
//   listModels()             -> [{ id, name }]
//   start({ system, tools }) -> a chat with  send(text)  and  results([{ call, result }])
//   each returns { text, calls: [{ id, name, args }], usage: { in, out } }
// so the Director, the checks and the bench do not care which is in use.

import { ProviderError } from './net.js';
import { gemini, pickDefaultModel as pickGemini } from './gemini.js';
import { openaiLike } from './openai.js';
import { anthropic } from './anthropic.js';
import { ollama } from './ollama.js';

// key: 'required' | 'optional' | 'none'.   url: true when the host may edit the address.
export const PROVIDERS = [
  { id: 'gemini', name: 'Google Gemini', group: 'cloud', kind: 'gemini', key: 'required', keyFrom: 'aistudio.google.com', env: 'GEMINI_API_KEY',
    hint: 'A Flash model is quick and cheap; a Pro model follows the rules more carefully.' },
  { id: 'anthropic', name: 'Anthropic Claude', group: 'cloud', kind: 'anthropic', key: 'required', keyFrom: 'console.anthropic.com', env: 'ANTHROPIC_API_KEY',
    hint: 'A Haiku model is the quick one, Sonnet the middle, Opus the most careful.' },
  { id: 'openai', name: 'OpenAI', group: 'cloud', kind: 'openai', base: 'https://api.openai.com/v1', key: 'required', keyFrom: 'platform.openai.com', env: 'OPENAI_API_KEY',
    hint: 'Choose a chat model. The "mini" models are the quick, cheap ones.' },
  { id: 'openrouter', name: 'OpenRouter (many makers, one key)', group: 'cloud', kind: 'openai', base: 'https://openrouter.ai/api/v1', key: 'required', keyFrom: 'openrouter.ai/keys', env: 'OPENROUTER_API_KEY',
    hint: 'Only models that can call tools are listed. Some are free, with tight limits.' },
  { id: 'groq', name: 'Groq (very fast)', group: 'cloud', kind: 'openai', base: 'https://api.groq.com/openai/v1', key: 'required', keyFrom: 'console.groq.com', env: 'GROQ_API_KEY',
    hint: 'Open models served very quickly. Good for keeping the table moving.' },
  { id: 'mistral', name: 'Mistral', group: 'cloud', kind: 'openai', base: 'https://api.mistral.ai/v1', key: 'required', keyFrom: 'console.mistral.ai', env: 'MISTRAL_API_KEY', hint: '' },
  { id: 'deepseek', name: 'DeepSeek', group: 'cloud', kind: 'openai', base: 'https://api.deepseek.com/v1', key: 'required', keyFrom: 'platform.deepseek.com', env: 'DEEPSEEK_API_KEY', hint: '' },
  { id: 'xai', name: 'xAI Grok', group: 'cloud', kind: 'openai', base: 'https://api.x.ai/v1', key: 'required', keyFrom: 'console.x.ai', env: 'XAI_API_KEY', hint: '' },
  { id: 'ollama', name: 'Ollama', group: 'local', kind: 'ollama', base: 'http://localhost:11434', key: 'none', url: true, ctx: true,
    hint: 'Runs on your own computer: nothing leaves the house and nothing is billed. The model must be one that can call tools.' },
  { id: 'lmstudio', name: 'LM Studio', group: 'local', kind: 'openai', base: 'http://localhost:1234/v1', key: 'none', url: true,
    hint: 'In LM Studio, load a model and start the local server (Developer tab). Set the context length to 16,000 or more there.' },
  { id: 'llamacpp', name: 'llama.cpp server', group: 'local', kind: 'openai', base: 'http://localhost:8080/v1', key: 'optional', url: true,
    hint: 'Start llama-server with --jinja so tools work, and -c 16384 or more for the context.' },
  { id: 'custom', name: 'Other (any OpenAI-compatible address)', group: 'local', kind: 'openai', base: '', key: 'optional', url: true,
    hint: 'For vLLM, KoboldCpp, text-generation-webui, Jan, a work gateway, or any service that speaks the OpenAI chat shape. The address usually ends in /v1.' },
];

export const providerInfo = (id) => PROVIDERS.find((p) => p.id === id) || PROVIDERS[0];

// What the screens may know: no keys, no secrets.
export const publicProviders = () => PROVIDERS.map((p) => ({ id: p.id, name: p.name, group: p.group, key: p.key, keyFrom: p.keyFrom || '', url: !!p.url, ctx: !!p.ctx, base: p.base || '', hint: p.hint || '' }));

export function build({ provider = 'gemini', apiKey = '', baseUrl = '', model = '', numCtx, fetchImpl }) {
  const p = providerInfo(provider);
  const extra = fetchImpl ? { fetchImpl } : {};
  if (p.key === 'required' && !apiKey) throw new ProviderError(`No ${p.name} API key has been entered yet.`);
  if (p.kind === 'gemini') return gemini({ apiKey, model, ...extra });
  if (p.kind === 'anthropic') return anthropic({ apiKey, model, ...extra });
  if (p.kind === 'ollama') return ollama({ baseUrl: baseUrl || p.base, model, apiKey, numCtx, ...extra });
  return openaiLike({ id: p.id, name: p.name.replace(/ \(.*$/, ''), baseUrl: (p.url && baseUrl) || p.base, apiKey, model, local: p.group === 'local', ...extra });
}

// A sensible first choice from the account's own list. Where no safe guess exists
// (a cloud catalogue of dozens), nothing is chosen and the host picks.
export function pickDefaultModel(provider, models) {
  const p = providerInfo(provider);
  if (!models.length) return '';
  if (p.kind === 'gemini') return pickGemini(models);
  if (p.kind === 'anthropic') return (models.find((m) => /sonnet/i.test(m.id)) || models[0]).id;
  if (p.group === 'local') return models[0].id;
  return models.length === 1 ? models[0].id : '';
}

// A one-question check that a connection works and the model can call a tool.
export async function testConnection(provider) {
  const tool = { name: 'ring_bell', description: 'Rings the table bell. Call this once when asked to.', parameters: { type: 'object', properties: { times: { type: 'integer', description: 'How many rings.' } }, required: ['times'] } };
  const t0 = Date.now();
  const chat = provider.start({ system: 'You are being tested. When asked to ring the bell, call the ring_bell tool. Do not describe the call: make it.', tools: [tool] });
  let reply = await chat.send('Ring the bell twice, then say "ready" in one word.');
  const called = reply.calls.some((c) => c.name === 'ring_bell');
  if (called) reply = await chat.results(reply.calls.map((c) => ({ call: c, result: { ok: true, rang: Number(c.args.times) || 0 } })));
  return { ok: called, ms: Date.now() - t0, said: String(reply.text || '').slice(0, 120) };
}

export { ProviderError };
