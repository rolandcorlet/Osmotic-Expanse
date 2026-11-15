// Model clients. One job: send a system prompt and a user prompt, get back { narration, choose }.
// No tools: the reply is a small JSON object whose "choose" is limited to the legal move ids.
// No dependencies; uses the fetch built into Node 18+.

export const PROVIDERS = [
  { id: 'none', name: 'No model (the Engine speaks its own lines)', kind: 'none' },
  { id: 'custom', name: 'Any OpenAI-compatible address (llama.cpp, vLLM, a tunnel)', kind: 'openai', base: 'http://localhost:8080/v1', url: true },
  { id: 'lmstudio', name: 'LM Studio', kind: 'openai', base: 'http://localhost:1234/v1', url: true },
  { id: 'ollama', name: 'Ollama', kind: 'openai', base: 'http://localhost:11434/v1', url: true },
  { id: 'anthropic', name: 'Anthropic Claude', kind: 'anthropic', env: 'ANTHROPIC_API_KEY', key: true },
  { id: 'openai', name: 'OpenAI', kind: 'openai', base: 'https://api.openai.com/v1', env: 'OPENAI_API_KEY', key: true },
  { id: 'openrouter', name: 'OpenRouter', kind: 'openai', base: 'https://openrouter.ai/api/v1', env: 'OPENROUTER_API_KEY', key: true },
  { id: 'groq', name: 'Groq', kind: 'openai', base: 'https://api.groq.com/openai/v1', env: 'GROQ_API_KEY', key: true },
];
export const providerInfo = (id) => PROVIDERS.find((p) => p.id === id) || PROVIDERS[0];

export class ProviderError extends Error {}

// Pull the first JSON object out of whatever the model wrote (fences, thinking, stray prose).
export function parseReply(text) {
  const t = String(text || '').replace(/<think>[\s\S]*?<\/think>/g, '');
  const a = t.indexOf('{');
  if (a < 0) return { narration: t.trim(), choose: null };
  for (let b = t.lastIndexOf('}'); b > a; b = t.lastIndexOf('}', b - 1)) {
    try { const o = JSON.parse(t.slice(a, b + 1)); if (o && typeof o === 'object') return { narration: String(o.narration || ''), choose: o.choose == null || o.choose === 'null' ? null : String(o.choose) }; } catch (e) { /* try a shorter slice */ }
  }
  return { narration: t.replace(/[{}"]/g, ' ').trim(), choose: null };
}

async function post(url, headers, body, timeoutMs) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body), signal: ac.signal });
    const text = await res.text();
    if (!res.ok) throw new ProviderError(`${res.status}: ${text.slice(0, 300)}`);
    return JSON.parse(text);
  } catch (e) {
    if (e instanceof ProviderError) throw e;
    throw new ProviderError(e.name === 'AbortError' ? `no answer in ${Math.round(timeoutMs / 1000)} s` : String(e.message || e));
  } finally { clearTimeout(timer); }
}

// build({ provider, model, url, apiKey, thinking, timeoutMs }) -> { id, model, ask({ system, user, schema }) }
// ask resolves to { narration, choose, usage: { in, out }, ms }.
export function build(cfg = {}) {
  const info = providerInfo(cfg.provider || 'none');
  const timeoutMs = cfg.timeoutMs || 90000;
  if (info.kind === 'none') return { id: 'none', model: '', ask: async () => null };
  const apiKey = cfg.apiKey || (info.env && process.env[info.env]) || '';
  if (info.key && !apiKey) throw new ProviderError(`${info.name} needs a key: save one on the Host tab or set ${info.env}.`);
  if (!cfg.model) throw new ProviderError('Choose a model first.');

  if (info.kind === 'anthropic') {
    return {
      id: info.id, model: cfg.model,
      async ask({ system, user, maxTokens = 400 }) {
        const t0 = Date.now();
        const j = await post('https://api.anthropic.com/v1/messages', { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
          { model: cfg.model, max_tokens: maxTokens, system, messages: [{ role: 'user', content: user }, { role: 'assistant', content: '{' }] }, timeoutMs);
        const text = `{${(j.content || []).map((c) => c.text || '').join('')}`;
        return { ...parseReply(text), usage: { in: (j.usage || {}).input_tokens || 0, out: (j.usage || {}).output_tokens || 0 }, ms: Date.now() - t0 };
      },
    };
  }
  // OpenAI-compatible. Structured output where the server supports it; plain JSON-by-instruction where it does not.
  const base = String(cfg.url || info.base).replace(/\/+$/, '');
  let mode = 'schema';
  return {
    id: info.id, model: cfg.model,
    async ask({ system, user, schema, maxTokens = 400 }) {
      const t0 = Date.now();
      const body = { model: cfg.model, max_tokens: maxTokens, temperature: 0.8, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] };
      if (cfg.thinking === 'off') { body.chat_template_kwargs = { enable_thinking: false }; body.reasoning_effort = 'none'; }
      else if (cfg.thinking === 'low' || cfg.thinking === 'medium') body.reasoning_effort = cfg.thinking;
      const headers = apiKey ? { authorization: `Bearer ${apiKey}` } : {};
      let j;
      for (;;) {
        const b = { ...body };
        if (mode === 'schema' && schema) b.response_format = { type: 'json_schema', json_schema: { name: 'reply', strict: true, schema } };
        else if (mode === 'object') b.response_format = { type: 'json_object' };
        try { j = await post(`${base}/chat/completions`, headers, b, timeoutMs); break; } catch (e) {
          // A server that does not know json_schema answers 400: step down once, then once more.
          if (/^(400|422)/.test(e.message) && mode !== 'plain') { mode = mode === 'schema' ? 'object' : 'plain'; continue; }
          throw e;
        }
      }
      const msg = ((j.choices || [])[0] || {}).message || {};
      return { ...parseReply(msg.content || ''), usage: { in: (j.usage || {}).prompt_tokens || 0, out: (j.usage || {}).completion_tokens || 0 }, ms: Date.now() - t0 };
    },
  };
}

// A model that needs no network, for tests and for trying the table: it narrates the Engine's own lines
// and, asked to choose, takes the first legal move whose label shares a word with what the player said.
export function mock({ pick = null, text = null } = {}) {
  return {
    id: 'mock', model: 'mock', calls: 0,
    async ask({ user }) {
      this.calls += 1;
      const ids = ((user.match(/YOU MAY CHOOSE: (.*)/) || [])[1] || '').split(' | ').map((x) => x.split(' = ')[0]).filter(Boolean);
      const choose = pick ? pick(ids, user) : null;
      return { narration: text || 'The water moves, and the Cohort moves with it.', choose, usage: { in: Math.ceil(user.length / 4), out: 20 }, ms: 1 };
    },
  };
}
