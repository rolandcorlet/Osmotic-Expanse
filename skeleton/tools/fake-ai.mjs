#!/usr/bin/env node
// A stand-in AI for trying the screens and the converter without a key or the internet.
// It speaks the OpenAI chat shape. On the AI tab choose "Other", address http://localhost:8799/v1, model "fake".
//   node tools/fake-ai.mjs [port]
// As the Director it asks the first character for a roll, then narrates. As the converter it copies the
// sample module (Saltglass) section by section, under the id "fake-game".
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { existsSync as hasFile } from 'node:fs';
// The worked example: modules/saltglass in the Skeleton, example/saltglass in the template.
const SALT = hasFile(new URL('../example/saltglass/module.json', import.meta.url)) ? 'example' : 'modules';

const port = Number(process.argv[2] || 8799);
const read = (f) => JSON.parse(readFileSync(new URL(`../${SALT}/saltglass/${f}`, import.meta.url), 'utf8'));
const SECTIONS = { module: () => ({ ...read('module.json'), id: 'fake-game', name: 'Fake Game' }), rules: () => read('rules.json'), handbook: () => read('handbook.json'), bestiary: () => read('bestiary.json'), lore: () => read('lore.json'), adventure: () => read('adventures/bell-under-brine.json') };

function reply(body) {
  const msgs = body.messages || [];
  const last = msgs[msgs.length - 1] || {};
  if (!(body.tools || []).length) { // the converter
    const text = String(last.content || '');
    if (/has problems/.test(text)) return { content: '{}' };
    const s = (text.match(/SECTION: (\w+)/) || [])[1];
    return { content: '```json\n' + JSON.stringify(SECTIONS[s] ? SECTIONS[s]() : {}) + '\n```' };
  }
  const names = body.tools.map((t) => t.function.name);
  if (names.includes('ring_bell')) return last.role === 'tool' ? { content: 'ready' } : { tool_calls: [{ id: 'c1', type: 'function', function: { name: 'ring_bell', arguments: '{"times":2}' } }] };
  if (last.role === 'tool') return { content: 'The lamplight trembles on the water, and something below turns to look. What do you do next?' };
  const brief = String(last.content || '');
  const who = (brief.match(/^- (c\d+) /m) || [])[1];
  if (who && /A player spoke/.test(brief) && !/ROLLS WAITING/.test(brief)) return { tool_calls: [{ id: 'c1', type: 'function', function: { name: 'ask_for_roll', arguments: JSON.stringify({ characters: [who], stat: 'wits', skill: 'sense', difficulty: 'Standard', reason: 'what moves in the dark' }) } }] };
  return { content: 'The tide breathes against the pilings and the bell below rings once, very softly. What do you do?' };
}

http.createServer((req, res) => {
  let raw = '';
  req.on('data', (c) => { raw += c; });
  req.on('end', () => {
    const send = (x) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(x)); };
    if (req.method === 'GET') return send({ data: [{ id: 'fake', name: 'Fake model' }] });
    const m = reply(raw ? JSON.parse(raw) : {});
    send({ choices: [{ message: { role: 'assistant', content: m.content ?? null, tool_calls: m.tool_calls } }], usage: { prompt_tokens: 100, completion_tokens: 20 } });
  });
}).listen(port, () => console.log(`Fake AI on http://localhost:${port}/v1`));
