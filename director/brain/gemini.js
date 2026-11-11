// Google Gemini, through the Gemini API with an API key.
// Every provider offers the same small surface, so others (a local model, Claude)
// can be added beside this one:
//   listModels()            -> [{ id, name }]
//   start({ system, tools }) -> a chat with  send(text)  and  results([{ call, result }])
//   each returns { text, calls: [{ id, name, args }], usage }

// The address can be overridden for testing against a stand-in.
const BASE = process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta';

export class ProviderError extends Error {}

async function call(path, apiKey, body, fetchImpl) {
  let res;
  try {
    res = await fetchImpl(`${BASE}/${path}`, {
      method: body ? 'POST' : 'GET',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(90000),
    });
  } catch (e) {
    throw new ProviderError(e.name === 'TimeoutError' ? 'Gemini did not answer within 90 seconds.' : `Could not reach Gemini: ${e.message}. Is this computer online?`);
  }
  let data = null;
  try { data = await res.json(); } catch (e) { /* not JSON: handled below */ }
  if (!res.ok) {
    const msg = data && data.error && data.error.message ? data.error.message : `HTTP ${res.status}`;
    if (res.status === 400 && /API key/i.test(msg)) throw new ProviderError('Gemini says the API key is not valid.');
    if (res.status === 403) throw new ProviderError(`Gemini refused the request (403): ${msg}`);
    if (res.status === 404) throw new ProviderError(`Gemini does not know that model (404): ${msg}`);
    if (res.status === 429) throw new ProviderError(`Gemini says the quota or rate limit is used up (429): ${msg}`);
    throw new ProviderError(`Gemini error ${res.status}: ${msg}`);
  }
  return data;
}

export function gemini({ apiKey, model, fetchImpl = fetch, temperature = 0.8 }) {
  if (!apiKey) throw new ProviderError('No Gemini API key has been entered yet.');

  async function listModels() {
    const out = [];
    let token = '';
    for (let page = 0; page < 5; page++) {
      const data = await call(`models?pageSize=200${token ? `&pageToken=${encodeURIComponent(token)}` : ''}`, apiKey, null, fetchImpl);
      for (const m of data.models || []) {
        if (!(m.supportedGenerationMethods || []).includes('generateContent')) continue;
        const id = String(m.name || '').replace(/^models\//, '');
        if (!/^gemini-/.test(id) || /image|tts|audio|live|embedding|robotics|computer-use/i.test(id)) continue;
        out.push({ id, name: m.displayName || id });
      }
      token = data.nextPageToken || '';
      if (!token) break;
    }
    return out;
  }

  function start({ system, tools }) {
    if (!model) throw new ProviderError('No Gemini model has been chosen yet.');
    const contents = [];
    const declarations = tools.map((t) => ({ name: t.name, description: t.description, parameters: t.parameters }));

    async function turn() {
      const body = {
        systemInstruction: { parts: [{ text: system }] },
        contents,
        generationConfig: { temperature },
      };
      if (declarations.length) body.tools = [{ functionDeclarations: declarations }];
      const data = await call(`models/${encodeURIComponent(model)}:generateContent`, apiKey, body, fetchImpl);
      const cand = (data.candidates || [])[0];
      if (!cand || !cand.content || !Array.isArray(cand.content.parts)) {
        const why = (data.promptFeedback && data.promptFeedback.blockReason) || (cand && cand.finishReason) || 'no content';
        throw new ProviderError(`Gemini returned nothing to use (${why}).`);
      }
      // Keep the model's content exactly as sent: Gemini 3 models attach a
      // thoughtSignature to parts and reject the next request if it is missing.
      contents.push({ role: 'model', parts: cand.content.parts });
      const text = cand.content.parts.filter((p) => typeof p.text === 'string' && !p.thought).map((p) => p.text).join('').trim();
      const calls = cand.content.parts.filter((p) => p.functionCall).map((p) => ({ id: p.functionCall.id || null, name: p.functionCall.name, args: p.functionCall.args || {} }));
      const u = data.usageMetadata || {};
      return { text, calls, usage: { in: u.promptTokenCount || 0, out: (u.candidatesTokenCount || 0) + (u.thoughtsTokenCount || 0) } };
    }

    return {
      send(text) {
        contents.push({ role: 'user', parts: [{ text }] });
        return turn();
      },
      results(list) {
        contents.push({
          role: 'user',
          parts: list.map(({ call: c, result }) => {
            const fr = { name: c.name, response: { result } };
            if (c.id) fr.id = c.id;
            return { functionResponse: fr };
          }),
        });
        return turn();
      },
    };
  }

  return { id: 'gemini', model, listModels, start };
}

// Choose a sensible default from the account's own list: the newest plain Flash model.
export function pickDefaultModel(models) {
  const score = (id) => {
    const m = id.match(/^gemini-(\d+(?:\.\d+)?)-flash$/);
    return m ? Number(m[1]) : -1;
  };
  const best = models.slice().sort((a, b) => score(b.id) - score(a.id))[0];
  return best && score(best.id) > 0 ? best.id : (models[0] ? models[0].id : '');
}
