// Anthropic's Claude, through the Messages API with an API key.

import { ProviderError, request, errorText, refusal, trimUrl } from './net.js';

const VERSION = '2023-06-01';

export function anthropic({ apiKey, model, baseUrl, fetchImpl = fetch, temperature = 0.8 }) {
  if (!apiKey) throw new ProviderError('No Anthropic API key has been entered yet.');
  const base = trimUrl(baseUrl || process.env.OXD_ANTHROPIC_BASE_URL || 'https://api.anthropic.com/v1');
  const headers = { 'x-api-key': apiKey, 'anthropic-version': VERSION };
  const call = (path, body) => request({ url: `${base}/${path}`, headers, body, fetchImpl, who: 'Claude' });

  async function listModels() {
    const r = await call('models?limit=1000');
    if (!r.ok) throw refusal('Claude', r.status, errorText(r.data, r.status));
    return ((r.data && r.data.data) || []).map((m) => ({ id: m.id, name: m.display_name || m.id }));
  }

  function start({ system, tools }) {
    if (!model) throw new ProviderError('No Claude model has been chosen yet.');
    const messages = [];
    const defs = tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters }));
    let useTemp = true;

    async function turn() {
      const body = { model, max_tokens: 2048, system, messages };
      if (defs.length) body.tools = defs;
      if (useTemp) body.temperature = temperature;
      let r = await call('messages', body);
      if (!r.ok && r.status === 400 && useTemp && /temperature/i.test(errorText(r.data, r.status))) {
        useTemp = false;
        delete body.temperature;
        r = await call('messages', body);
      }
      if (!r.ok) throw refusal('Claude', r.status, errorText(r.data, r.status));
      const blocks = r.data && Array.isArray(r.data.content) ? r.data.content : null;
      if (!blocks) throw new ProviderError('Claude returned nothing to use.');
      messages.push({ role: 'assistant', content: blocks }); // exactly as sent, so tool ids line up
      const text = blocks.filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
      const calls = blocks.filter((b) => b.type === 'tool_use').map((b) => ({ id: b.id, name: b.name, args: b.input || {} }));
      const u = r.data.usage || {};
      return { text, calls, usage: { in: u.input_tokens || 0, out: u.output_tokens || 0 } };
    }

    return {
      send(text) { messages.push({ role: 'user', content: text }); return turn(); },
      results(list) {
        messages.push({ role: 'user', content: list.map(({ call: c, result }) => ({ type: 'tool_result', tool_use_id: c.id, content: JSON.stringify(result) })) });
        return turn();
      },
    };
  }

  return { id: 'anthropic', model, listModels, start };
}
