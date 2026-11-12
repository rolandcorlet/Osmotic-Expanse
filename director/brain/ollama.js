// Ollama, on this computer or another one on the network, through its own API.
// The native API is used (not the OpenAI-style one) because it lets the Director
// set the context size: the briefing and the tools do not fit in a small default.

import { ProviderError, request, errorText, trimUrl } from './net.js';

export function ollama({ baseUrl, model, apiKey = '', numCtx = 16384, fetchImpl = fetch, temperature = 0.8, thinking = 'default' }) {
  // Accept the address with or without a trailing /v1 or /api.
  const base = trimUrl(baseUrl || 'http://localhost:11434').replace(/\/(v1|api)$/, '');
  const headers = apiKey ? { authorization: `Bearer ${apiKey}` } : {};
  const call = (path, body) => request({ url: `${base}/api/${path}`, headers, body, fetchImpl, who: 'Ollama', timeoutMs: 300000, local: true });

  async function listModels() {
    const r = await call('tags');
    if (!r.ok) throw new ProviderError(`Ollama error ${r.status}: ${errorText(r.data, r.status)}`);
    return ((r.data && r.data.models) || [])
      .filter((m) => !/embed/i.test(m.name || ''))
      .map((m) => {
        const d = m.details || {};
        const bits = [d.parameter_size, d.quantization_level].filter(Boolean).join(', ');
        return { id: m.name, name: bits ? `${m.name} · ${bits}` : m.name };
      });
  }

  function start({ system, tools }) {
    if (!model) throw new ProviderError('No Ollama model has been chosen yet. Pull one with "ollama pull <name>", then press Refresh.');
    const messages = [{ role: 'system', content: system }];
    const fns = tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } }));

    async function turn() {
      const body = { model, messages, stream: false, options: { temperature, num_ctx: Number(numCtx) || 16384 } };
      if (fns.length) body.tools = fns;
      if (thinking === 'off') body.think = false;
      if (thinking === 'low') body.think = 'low';
      let r = await call('chat', body);
      // A model that cannot switch thinking says so: ask again without the setting.
      if (!r.ok && body.think !== undefined && /think/i.test(errorText(r.data, r.status))) { delete body.think; r = await call('chat', body); }
      if (!r.ok) {
        const msg = errorText(r.data, r.status);
        if (/does not support tools/i.test(msg)) throw new ProviderError(`Ollama: the model "${model}" cannot call tools, and the Director needs them. Choose a model that lists "tools" on ollama.com.`);
        if (r.status === 404) throw new ProviderError(`Ollama does not have the model "${model}". Pull it with "ollama pull ${model}".`);
        throw new ProviderError(`Ollama error ${r.status}: ${msg}`);
      }
      const m = r.data && r.data.message;
      if (!m) throw new ProviderError('Ollama returned nothing to use.');
      const keep = { role: 'assistant', content: m.content || '' };
      if (Array.isArray(m.tool_calls) && m.tool_calls.length) keep.tool_calls = m.tool_calls;
      messages.push(keep);
      const text = String(m.content || '').replace(/<think>[\s\S]*?<\/think>/g, '').trim();
      const calls = (m.tool_calls || []).filter((c) => c.function).map((c) => {
        let args = c.function.arguments || {};
        if (typeof args === 'string') { try { args = JSON.parse(args); } catch (e) { args = {}; } }
        return { id: null, name: c.function.name, args };
      });
      return { text, calls, usage: { in: r.data.prompt_eval_count || 0, out: r.data.eval_count || 0 } };
    }

    return {
      send(text) { messages.push({ role: 'user', content: text }); return turn(); },
      results(list) {
        for (const { call: c, result } of list) messages.push({ role: 'tool', tool_name: c.name, content: JSON.stringify(result) });
        return turn();
      },
    };
  }

  return { id: 'ollama', model, listModels, start };
}
