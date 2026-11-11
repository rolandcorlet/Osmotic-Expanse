// A stand-in for every kind of AI the Director can talk to, for testing the
// screens without a key or the internet. It speaks four shapes on one port:
//   Gemini          GEMINI_BASE_URL=http://localhost:8799/v1beta node server.js      (key TESTKEY)
//   Claude          OXD_ANTHROPIC_BASE_URL=http://localhost:8799/v1 node server.js       (key TESTKEY)
//   OpenAI-style    choose "Other" on the Director tab, address http://localhost:8799/v1
//   Ollama          choose "Ollama", address http://localhost:8799
//   node tools/fake-ai.mjs 8799
// Its "Director" is a three-line script: narrate, bring two swarms, narrate.
import http from 'node:http';

const port = Number(process.argv[2] || 8799);
const OPEN = 'The wound lip flexes with the current, and the drones at their gate turn to taste you. Brost, what do you taste in the water?';
const AFTER = 'Two swarms pour out of the torn flap, tasting for you. They want drink, not a fight. Bresk, what do you do?';
const SWARMS = { block: 'gnaw-swarm', count: 2, band: 'near' };
// What to do next, from the briefing text and whether a tool result has just come back.
function plan(briefing, afterTool, tools) {
  if (afterTool) return tools.includes('ring_bell') ? { text: 'ready' } : { text: AFTER };
  if (tools.includes('ring_bell')) return { call: 'ring_bell', args: { times: 2 } };
  if (/None are present yet/.test(briefing) && /# THE STORY SO FAR[\s\S]*[A-Z]+: /.test(briefing)) return { call: 'bring_creatures', args: SWARMS };
  return { text: OPEN };
}

http.createServer((req, res) => {
  let raw = '';
  req.on('data', (c) => { raw += c; });
  req.on('end', () => {
    const send = (code, body) => setTimeout(() => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); }, req.method === 'GET' ? 0 : 400);
    const path = req.url.split('?')[0];
    const body = raw ? JSON.parse(raw) : {};

    if (path.startsWith('/v1beta/')) { // ---- Gemini
      if (req.headers['x-goog-api-key'] !== 'TESTKEY') return send(400, { error: { message: 'API key not valid. Please pass a valid API key.' } });
      if (req.method === 'GET') return send(200, { models: [
        { name: 'models/gemini-3.7-flash', displayName: 'Gemini 3.7 Flash', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/gemini-3.5-flash-lite', displayName: 'Gemini 3.5 Flash-Lite', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/gemini-embedding-001', displayName: 'Embedding', supportedGenerationMethods: ['embedContent'] },
      ] });
      const part = body.contents[body.contents.length - 1].parts[0];
      const tools = ((body.tools || [])[0] || { functionDeclarations: [] }).functionDeclarations.map((t) => t.name);
      if (part.functionResponse && body.contents[body.contents.length - 2].parts[0].thoughtSignature !== 'SIG') return send(400, { error: { message: 'Function call is missing a thought_signature.' } });
      const p = plan(part.text || '', !!part.functionResponse, tools);
      const parts = p.call ? [{ functionCall: { name: p.call, args: p.args }, thoughtSignature: 'SIG' }] : [{ text: p.text }];
      return send(200, { candidates: [{ content: { role: 'model', parts }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 2100, candidatesTokenCount: 40 } });
    }

    if (path === '/v1/messages' || (path === '/v1/models' && req.headers['anthropic-version'])) { // ---- Claude
      if (req.headers['x-api-key'] !== 'TESTKEY') return send(401, { type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } });
      if (req.method === 'GET') return send(200, { data: [{ id: 'claude-opus-9', display_name: 'Claude Opus 9' }, { id: 'claude-sonnet-9', display_name: 'Claude Sonnet 9' }] });
      const last = body.messages[body.messages.length - 1];
      const afterTool = Array.isArray(last.content) && last.content.some((b) => b.type === 'tool_result');
      const p = plan(typeof last.content === 'string' ? last.content : '', afterTool, (body.tools || []).map((t) => t.name));
      const content = p.call ? [{ type: 'tool_use', id: 'toolu_1', name: p.call, input: p.args }] : [{ type: 'text', text: p.text }];
      return send(200, { role: 'assistant', content, stop_reason: p.call ? 'tool_use' : 'end_turn', usage: { input_tokens: 2100, output_tokens: 40 } });
    }

    if (path === '/api/tags') return send(200, { models: [{ name: 'storyteller:14b', details: { parameter_size: '14.8B', quantization_level: 'Q4_K_M' } }, { name: 'nomic-embed-text:latest', details: {} }] });
    if (path === '/api/chat') { // ---- Ollama
      const last = body.messages[body.messages.length - 1];
      if (body.model === 'no-tools:1b') return send(400, { error: 'registry.ollama.ai/library/no-tools:1b does not support tools' });
      const p = plan(last.content || '', last.role === 'tool', (body.tools || []).map((t) => t.function.name));
      const message = p.call ? { role: 'assistant', content: '', tool_calls: [{ function: { name: p.call, arguments: p.args } }] } : { role: 'assistant', content: p.text };
      return send(200, { model: body.model, message, done: true, prompt_eval_count: 2100, eval_count: 40 });
    }

    if (path === '/v1/models') return send(200, { object: 'list', data: [{ id: 'local-storyteller' }, { id: 'text-embedding-small' }] });
    if (path === '/v1/chat/completions') { // ---- OpenAI-style
      const last = body.messages[body.messages.length - 1];
      const p = plan(last.content || '', last.role === 'tool', (body.tools || []).map((t) => t.function.name));
      const message = p.call ? { role: 'assistant', content: null, tool_calls: [{ id: 'call_1', type: 'function', function: { name: p.call, arguments: JSON.stringify(p.args) } }] } : { role: 'assistant', content: p.text };
      return send(200, { choices: [{ index: 0, message, finish_reason: p.call ? 'tool_calls' : 'stop' }], usage: { prompt_tokens: 2100, completion_tokens: 40 } });
    }
    return send(404, { error: { message: `The stand-in has nothing at ${path}` } });
  });
}).listen(port, () => console.log(`Stand-in AI on ${port} (Gemini, Claude, OpenAI-style and Ollama shapes)`));
