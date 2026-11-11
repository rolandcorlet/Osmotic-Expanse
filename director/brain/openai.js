// Any service that speaks the OpenAI "chat completions" shape: OpenAI itself,
// OpenRouter, Groq, Mistral, DeepSeek, xAI, and local servers such as LM Studio
// and llama.cpp. The address and the key are the only differences.

import { ProviderError, request, errorText, refusal, trimUrl } from './net.js';

const NOT_CHAT = /embed|whisper|tts|dall-e|image|audio|realtime|moderation|transcri|sora|babbage|davinci|rerank|guard|speech|ocr/i;

export function openaiLike({ id = 'openai', name = 'OpenAI', baseUrl, apiKey = '', model, local = false, fetchImpl = fetch, temperature = 0.8, timeoutMs }) {
  const base = trimUrl(baseUrl);
  if (!base) throw new ProviderError(`No address has been entered for ${name} yet.`);
  const headers = apiKey ? { authorization: `Bearer ${apiKey}` } : {};
  const wait = timeoutMs || (local ? 300000 : 90000);
  const call = async (path, body) => {
    const r = await request({ url: `${base}/${path}`, headers, body, fetchImpl, who: name, timeoutMs: wait, local });
    return r;
  };

  async function listModels() {
    const r = await call('models');
    if (!r.ok) throw refusal(name, r.status, errorText(r.data, r.status));
    const list = Array.isArray(r.data) ? r.data : (r.data && (r.data.data || r.data.models)) || [];
    return list
      .filter((m) => m && m.id && !NOT_CHAT.test(m.id))
      // OpenRouter says which models can call tools; the Director cannot work without them.
      .filter((m) => !Array.isArray(m.supported_parameters) || m.supported_parameters.includes('tools'))
      .map((m) => ({ id: m.id, name: m.name || m.display_name || m.id }))
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  function start({ system, tools }) {
    if (!model) throw new ProviderError(`No ${name} model has been chosen yet.`);
    const messages = [{ role: 'system', content: system }];
    const fns = tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } }));
    let useTemp = true;

    async function turn() {
      const body = { model, messages };
      if (fns.length) body.tools = fns;
      if (useTemp) body.temperature = temperature;
      let r = await call('chat/completions', body);
      // Some reasoning models accept only their own temperature: ask again without it.
      if (!r.ok && r.status === 400 && useTemp && /temperature/i.test(errorText(r.data, r.status))) {
        useTemp = false;
        delete body.temperature;
        r = await call('chat/completions', body);
      }
      if (!r.ok) {
        const msg = errorText(r.data, r.status);
        if (/tool/i.test(msg) && /support/i.test(msg)) throw new ProviderError(`${name}: the model "${model}" cannot call tools, and the Director needs them. Choose another model.`);
        throw refusal(name, r.status, msg);
      }
      const m = r.data && r.data.choices && r.data.choices[0] && r.data.choices[0].message;
      if (!m) throw new ProviderError(`${name} returned nothing to use.`);
      // Send back what the Director needs and nothing a strict server would reject.
      const keep = { role: 'assistant', content: m.content ?? null };
      if (Array.isArray(m.tool_calls) && m.tool_calls.length) keep.tool_calls = m.tool_calls;
      if (m.reasoning_details) keep.reasoning_details = m.reasoning_details; // OpenRouter: reasoning models need it returned
      if (id === 'deepseek' && m.reasoning_content && keep.tool_calls) keep.reasoning_content = m.reasoning_content;
      messages.push(keep);
      const text = typeof m.content === 'string' ? m.content.replace(/<think>[\s\S]*?<\/think>/g, '').trim()
        : Array.isArray(m.content) ? m.content.filter((p) => p.type === 'text').map((p) => p.text).join('').trim() : '';
      const calls = (m.tool_calls || []).filter((c) => c.function).map((c) => {
        let args = {};
        try { args = typeof c.function.arguments === 'string' ? JSON.parse(c.function.arguments || '{}') : (c.function.arguments || {}); } catch (e) { args = {}; }
        return { id: c.id || null, name: c.function.name, args };
      });
      const u = r.data.usage || {};
      return { text, calls, usage: { in: u.prompt_tokens || 0, out: u.completion_tokens || 0 } };
    }

    return {
      send(text) { messages.push({ role: 'user', content: text }); return turn(); },
      results(list) {
        for (const { call: c, result } of list) messages.push({ role: 'tool', tool_call_id: c.id || c.name, content: JSON.stringify(result) });
        return turn();
      },
    };
  }

  return { id, model, listModels, start };
}
