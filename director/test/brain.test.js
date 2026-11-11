// The Director's brain, tested with a scripted stand-in for the model.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { newSession, apply } from '../engine/ledger.js';
import { makeRng } from '../engine/dice.js';
import { scenario } from '../data/first-carve.js';
import { toolbox, TOOLS } from '../brain/tools.js';
import { directorTurn, briefing, checkNarration } from '../brain/director.js';
import { createDirector } from '../brain/manager.js';
import { gemini, pickDefaultModel } from '../brain/gemini.js';

const bestiary = JSON.parse(readFileSync(new URL('../data/bestiary.json', import.meta.url), 'utf8'));
const rng = makeRng(11);
const ctx = (role, pid) => ({ role, pid, rng, now: 0, scenario, bestiary });

function seated() {
  let s = newSession(scenario);
  s = apply(s, { type: 'join', name: 'Roly' }, ctx('player', 'p1'));
  s = apply(s, { type: 'claim', organismId: 'wall', name: 'Bresk of the Sixth Choir' }, ctx('player', 'p1'));
  s = apply(s, { type: 'join', name: 'Sam' }, ctx('player', 'p2'));
  s = apply(s, { type: 'claim', organismId: 'eyes', name: 'Brost of the Third Current' }, ctx('player', 'p2'));
  return s;
}

// A stand-in model: plays back a script of tool calls and text.
function scripted(script) {
  const seen = [];
  const steps = script.slice();
  const next = () => {
    const step = steps.shift() || { text: 'The water waits. Bresk, what do you do?' };
    return { text: step.text || '', calls: (step.calls || []).map((c, i) => ({ id: `c${i}`, name: c[0], args: c[1] || {} })), usage: { in: 100, out: 20 } };
  };
  const make = () => ({
    id: 'scripted', model: 'scripted', listModels: async () => [{ id: 'gemini-9.9-flash', name: 'Scripted' }],
    start: () => ({ send: async (t) => { seen.push(t); return next(); }, results: async (r) => { seen.push(r); return next(); } }),
  });
  make.seen = seen;
  return make;
}

test('a turn works on a copy: the live Ledger is untouched until committed', async () => {
  const s = apply(seated(), { type: 'say', text: 'I shoulder through the wound lip.' }, ctx('player', 'p1'));
  const make = scripted([
    { calls: [['ask_for_roll', { organism: 'wall', baseline: 'VSC', pathway: 'Pressure Tolerance', threshold: 12, what_for: 'Cross the wound lip' }]] },
    { text: 'The flap is closing and the current wants you back out. Bresk, roll to force the lip?' },
  ]);
  const r = await directorTurn({ state: s, scenario, bestiary, provider: make(), rng });
  assert.equal(s.requests.length, 0);
  assert.equal(s.story.length, 1);
  assert.equal(r.state.requests.length, 1);
  assert.equal(r.state.requests[0].pool.dice, 6);
  assert.equal(r.state.story.at(-1).kind, 'narration');
  assert.equal(r.refusals, 0);
  assert.deepEqual(r.flags, []);
  // The briefing carried the Director-only notes and the player's words.
  assert.match(make.seen[0], /Director-only notes/);
  assert.match(make.seen[0], /I shoulder through the wound lip/);
  assert.match(make.seen[0], /NO PULSE WAR/);
});

test('unhurried and within Baseline: the tool answers that no roll is needed', () => {
  const T = toolbox({ state: seated(), scenario, bestiary, rng });
  const out = T.run('ask_for_roll', { organism: 'Brost', baseline: 'OSM', pathway: 'Chemoreception', threshold: 12, what_for: 'Taste the water', unhurried: true });
  assert.equal(out.no_roll_needed, true);
  assert.equal(T.state.requests.length, 0);
});

test('the Engine refuses what is off the page', () => {
  const T = toolbox({ state: seated(), scenario, bestiary, rng });
  assert.match(T.run('bring_creatures', { block: 'protease-warden', count: 1 }).refused, /not printed for The Toll-Vent/);
  assert.match(T.run('bring_creatures', { block: 'gnaw-swarm', count: 3 }).refused, /prints 2/);
  assert.match(T.run('ask_for_roll', { organism: 'wall', baseline: 'VSC', threshold: 5, what_for: 'x' }).refused, /between 8 and 28/);
  assert.match(T.run('ask_for_roll', { organism: 'rider', baseline: 'DFF', threshold: 12, what_for: 'x' }).refused, /No organism/);
  assert.match(T.run('change_site', { site: 'gut-stone' }).refused, /cannot be reached/);
  assert.match(T.run('award', { codon: 500, why: 'x' }).refused, /at most/);
  assert.match(T.run('creature_strike', { creature: 'ghost', target: 'wall' }).refused, /No creature/);
  assert.equal(T.run('move_clock', { clock: 'TOLL', change: 1, why: 'a loud fight' }).now, '1/5');
  assert.match(T.run('move_clock', { clock: 'TOLL', change: 1, why: 'again' }).refused, /at most one segment per session/);
  assert.equal(T.run('move_clock', { clock: 'TOLL', change: -1, why: 'a toll chit' }).now, '0/5');
  assert.match(T.run('rest', {}).rested ? 'ok' : 'no', /ok/);
  assert.equal(T.refusals, 8);
  assert.equal(Object.keys(T.state.creatures).length, 0);
});

test('a creature\'s turn: move, strike with real dice, bite within the swarm allowance, end turn', () => {
  let s = seated();
  s = apply(s, { type: 'fight.start', creatures: [{ blockId: 'gnaw-swarm', count: 1, band: 'far' }], ownDice: { wall: 1, eyes: 1, 'Order I: Lytic Swarms': 6 } }, ctx('host'));
  const T = toolbox({ state: s, scenario, bestiary, rng });
  const cid = Object.keys(s.creatures)[0];
  assert.match(T.run('creature_strike', { creature: cid, target: 'wall' }).refused, /must Drift closer/);
  assert.equal(T.run('creature_move', { creature: cid, band: 'contact' }).pulse_points_left, 1);
  assert.match(T.run('creature_strike', { creature: cid, target: 'wall' }).refused, /costs 2 PP/);
  T.do({ type: 'set', target: { kind: 'cre', id: cid }, field: 'pp', value: 2 });
  const hit = T.run('creature_strike', { creature: 'Gnaw Swarm', target: 'Bresk' });
  assert.equal(typeof hit.hit, 'boolean');
  assert.equal(hit.dice.length, 3);
  assert.equal(hit.pulse_points_left, 0);
  assert.equal(typeof T.run('creature_strike', { creature: cid, target: 'eyes' }).hit, 'boolean'); // second bite: no PP
  const after = T.run('end_creature_turn', { creature: cid });
  assert.match(after.acting_is, /a player/);
});

test('narration checks', () => {
  const s = seated();
  const kinds = (t) => checkNarration(t, s).map((f) => f.kind);
  assert.deepEqual(kinds('The swarm drinks. Bresk, what do you do?'), []);
  assert.deepEqual(kinds('The swarm has MT 12 and rolls 3d. Bresk, what do you do?'), ['leak']);
  assert.deepEqual(kinds('The swarm drinks.'), ['style']);
  assert.deepEqual(kinds('Do you fight? Or do you offer water?'), ['style']);
  assert.deepEqual(kinds('You have your Pulse Points back. Brost, what now?'), ['style']);
});

function managed(mode, script) {
  let state = apply(seated(), { type: 'say', text: 'What can I taste?' }, ctx('player', 'p2'));
  const commits = [];
  const d = createDirector({
    getState: () => state, commit: (n) => { commits.push(n); state = n; }, scenario, bestiary, rng,
    saveDir: mkdtempSync(join(tmpdir(), 'oxd-')), onChange: () => {}, makeProvider: scripted(script),
  });
  return { d, commits, get state() { return state; }, set state(v) { state = v; } };
}
const settle = async (d) => { for (let i = 0; i < 200 && d.view('host').phase === 'thinking'; i++) await new Promise((r) => setTimeout(r, 5)); };

test('Co-pilot: the host sees a proposal, may edit it, and only then does the table change', async () => {
  const m = managed('copilot', [{ text: 'Sweet, warm, and not whale. Brost, where do you follow it?' }]);
  await m.d.op({ op: 'config', mode: 'copilot', apiKey: 'k' });
  assert.equal(m.d.view('host').model, 'gemini-9.9-flash');
  await m.d.op({ op: 'run' });
  await settle(m.d);
  const v = m.d.view('host');
  assert.equal(v.phase, 'proposal');
  assert.equal(m.commits.length, 0);
  assert.equal(m.d.view('player').thinking, true);
  assert.equal(m.d.view('player').proposal, undefined);
  await m.d.op({ op: 'approve', text: 'Sweet and warm. Brost, where do you follow it?' });
  assert.equal(m.commits.length, 1);
  assert.equal(m.state.story.at(-1).text, 'Sweet and warm. Brost, where do you follow it?');
  assert.equal(m.d.view('host').phase, 'idle');
});

test('Auto: a clean turn goes straight to the table; a suspected leak is held for the host', async () => {
  const m = managed('auto', [{ text: 'The floor hums. Brost, do you tell Bresk?' }, { text: 'The Sentinel has MT 13 and soak 1. Brost, what now?' }]);
  await m.d.op({ op: 'config', mode: 'auto', apiKey: 'k' });
  await m.d.op({ op: 'run' });
  await settle(m.d);
  assert.equal(m.commits.length, 1);
  await m.d.op({ op: 'run' });
  await settle(m.d);
  assert.equal(m.commits.length, 1);
  assert.equal(m.d.view('host').proposal.held, true);
  await m.d.op({ op: 'discard' });
  assert.equal(m.d.view('host').phase, 'idle');
});

test('Gemini requests are shaped as the API documents, and thought signatures are sent back', async () => {
  const sent = [];
  const replies = [
    { candidates: [{ content: { role: 'model', parts: [{ functionCall: { name: 'rest', args: {} }, thoughtSignature: 'SIG-A' }] } }], usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 2 } },
    { candidates: [{ content: { role: 'model', parts: [{ text: 'Done. ' }, { text: 'What next?', thoughtSignature: 'SIG-B' }] } }] },
  ];
  const fetchImpl = async (url, init) => { sent.push({ url, init, body: JSON.parse(init.body) }); return { ok: true, status: 200, json: async () => replies.shift() }; };
  const chat = gemini({ apiKey: 'KEY', model: 'gemini-9.9-flash', fetchImpl }).start({ system: 'SYS', tools: TOOLS });
  const a = await chat.send('briefing');
  assert.deepEqual(a.calls, [{ id: null, name: 'rest', args: {} }]);
  const b = await chat.results([{ call: a.calls[0], result: { rested: true } }]);
  assert.equal(b.text, 'Done. What next?');
  assert.match(sent[0].url, /\/v1beta\/models\/gemini-9\.9-flash:generateContent$/);
  assert.equal(sent[0].init.headers['x-goog-api-key'], 'KEY');
  assert.equal(sent[0].body.systemInstruction.parts[0].text, 'SYS');
  assert.equal(sent[0].body.tools[0].functionDeclarations.length, TOOLS.length);
  assert.deepEqual(sent[1].body.contents[1], { role: 'model', parts: [{ functionCall: { name: 'rest', args: {} }, thoughtSignature: 'SIG-A' }] });
  assert.deepEqual(sent[1].body.contents[2], { role: 'user', parts: [{ functionResponse: { name: 'rest', response: { result: { rested: true } } } }] });
  assert.equal(pickDefaultModel([{ id: 'gemini-2.5-pro' }, { id: 'gemini-3.5-flash' }, { id: 'gemini-3.7-flash' }, { id: 'gemini-3.5-flash-lite' }]), 'gemini-3.7-flash');
});

test('the briefing changes with the site and never carries another site\'s notes', () => {
  let s = seated();
  const one = briefing(s, scenario, bestiary);
  assert.match(one, /The Toll-Vent/);
  assert.ok(!one.includes('Nine-Folds'));
  s = apply(s, { type: 'scene.set', siteId: 'soft-field' }, ctx('host'));
  const two = briefing(s, scenario, bestiary);
  assert.match(two, /Glaze Medusa/);
  assert.match(two, /CLAIM VOID/);
});

// ---- the other providers: each request is shaped as its API expects --------------
const { build, PROVIDERS, pickDefaultModel: pickFor, testConnection } = await import('../brain/providers.js');
const { writeFileSync: writeF } = await import('node:fs');
const recorder = (replies) => {
  const sent = [];
  const fetchImpl = async (url, init) => {
    sent.push({ url, init, body: init.body ? JSON.parse(init.body) : null });
    const r = replies.shift();
    return { ok: !r.status || r.status < 400, status: r.status || 200, json: async () => r.body ?? r };
  };
  return { sent, fetchImpl };
};

test('OpenAI-style requests: tools, bearer key, tool results by id, and a retry without temperature', async () => {
  const { sent, fetchImpl } = recorder([
    { status: 400, body: { error: { message: "Unsupported value: 'temperature' does not support 0.8 with this model." } } },
    { choices: [{ message: { role: 'assistant', content: null, tool_calls: [{ id: 'call_9', type: 'function', function: { name: 'rest', arguments: '{}' } }], refusal: null } }], usage: { prompt_tokens: 10, completion_tokens: 2 } },
    { choices: [{ message: { role: 'assistant', content: '<think>hm</think>Done. What next?' } }] },
  ]);
  const chat = build({ provider: 'openai', apiKey: 'KEY', model: 'gpt-x', fetchImpl }).start({ system: 'SYS', tools: TOOLS });
  const a = await chat.send('briefing');
  assert.deepEqual(a.calls, [{ id: 'call_9', name: 'rest', args: {} }]);
  const b = await chat.results([{ call: a.calls[0], result: { rested: true } }]);
  assert.equal(b.text, 'Done. What next?');
  assert.equal(sent[0].url, 'https://api.openai.com/v1/chat/completions');
  assert.equal(sent[0].init.headers.authorization, 'Bearer KEY');
  assert.equal(sent[0].body.temperature, 0.8);
  assert.ok(!('temperature' in sent[1].body));
  assert.equal(sent[1].body.tools.length, TOOLS.length);
  assert.equal(sent[1].body.tools[0].type, 'function');
  assert.deepEqual(sent[2].body.messages.map((m) => m.role), ['system', 'user', 'assistant', 'tool']);
  assert.deepEqual(Object.keys(sent[2].body.messages[2]).sort(), ['content', 'role', 'tool_calls']); // nothing a strict server rejects
  assert.deepEqual(sent[2].body.messages[3], { role: 'tool', tool_call_id: 'call_9', content: '{"rested":true}' });
});

test('local OpenAI-style servers need no key, and the address may be changed', async () => {
  const { sent, fetchImpl } = recorder([{ data: [{ id: 'qwen-tools' }, { id: 'text-embedding-3' }] }]);
  const list = await build({ provider: 'lmstudio', baseUrl: 'http://192.168.1.50:1234/v1/', fetchImpl }).listModels();
  assert.deepEqual(list, [{ id: 'qwen-tools', name: 'qwen-tools' }]);
  assert.equal(sent[0].url, 'http://192.168.1.50:1234/v1/models');
  assert.equal(sent[0].init.headers.authorization, undefined);
  assert.throws(() => build({ provider: 'custom', model: 'x' }), /No address/);
  assert.throws(() => build({ provider: 'groq', model: 'x' }), /API key/);
});

test('OpenRouter lists only models that can call tools', async () => {
  const { fetchImpl } = recorder([{ data: [{ id: 'a/tools', name: 'A', supported_parameters: ['tools', 'temperature'] }, { id: 'b/plain', name: 'B', supported_parameters: ['temperature'] }] }]);
  assert.deepEqual(await build({ provider: 'openrouter', apiKey: 'K', fetchImpl }).listModels(), [{ id: 'a/tools', name: 'A' }]);
});

test('Claude requests: system at the top, tool_use and tool_result blocks', async () => {
  const { sent, fetchImpl } = recorder([
    { content: [{ type: 'text', text: 'Resting them.' }, { type: 'tool_use', id: 'toolu_7', name: 'rest', input: {} }], usage: { input_tokens: 10, output_tokens: 3 } },
    { content: [{ type: 'text', text: 'Done. What next?' }] },
  ]);
  const chat = build({ provider: 'anthropic', apiKey: 'KEY', model: 'claude-x', fetchImpl }).start({ system: 'SYS', tools: TOOLS });
  const a = await chat.send('briefing');
  assert.deepEqual(a.calls, [{ id: 'toolu_7', name: 'rest', args: {} }]);
  assert.deepEqual(a.usage, { in: 10, out: 3 });
  await chat.results([{ call: a.calls[0], result: { rested: true } }]);
  assert.equal(sent[0].url, 'https://api.anthropic.com/v1/messages');
  assert.equal(sent[0].init.headers['x-api-key'], 'KEY');
  assert.equal(sent[0].init.headers['anthropic-version'], '2023-06-01');
  assert.equal(sent[0].body.system, 'SYS');
  assert.ok(sent[0].body.max_tokens > 0);
  assert.ok(sent[0].body.tools[0].input_schema);
  assert.deepEqual(sent[1].body.messages[2], { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_7', content: '{"rested":true}' }] });
});

test('Ollama requests use its own API with the context size, and say so when a model cannot use tools', async () => {
  const { sent, fetchImpl } = recorder([
    { message: { role: 'assistant', content: '', tool_calls: [{ function: { name: 'rest', arguments: {} } }] }, prompt_eval_count: 9, eval_count: 2 },
    { message: { role: 'assistant', content: 'Done. What next?' } },
    { status: 400, body: { error: 'registry.ollama.ai/library/tiny:1b does not support tools' } },
  ]);
  const p = build({ provider: 'ollama', baseUrl: 'http://box:11434/v1', model: 'm:14b', numCtx: 32768, fetchImpl });
  const chat = p.start({ system: 'SYS', tools: TOOLS });
  const a = await chat.send('briefing');
  assert.deepEqual(a.calls, [{ id: null, name: 'rest', args: {} }]);
  await chat.results([{ call: a.calls[0], result: { rested: true } }]);
  assert.equal(sent[0].url, 'http://box:11434/api/chat');
  assert.equal(sent[0].body.stream, false);
  assert.equal(sent[0].body.options.num_ctx, 32768);
  assert.deepEqual(sent[1].body.messages[3], { role: 'tool', tool_name: 'rest', content: '{"rested":true}' });
  await assert.rejects(() => p.start({ system: 'S', tools: TOOLS }).send('x'), /cannot call tools/);
});

test('the connection test passes only when the model really uses a tool', async () => {
  const good = recorder([
    { choices: [{ message: { role: 'assistant', content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'ring_bell', arguments: '{"times":2}' } }] } }] },
    { choices: [{ message: { role: 'assistant', content: 'ready' } }] },
  ]);
  assert.equal((await testConnection(build({ provider: 'custom', baseUrl: 'http://x/v1', model: 'm', fetchImpl: good.fetchImpl }))).ok, true);
  const bad = recorder([{ choices: [{ message: { role: 'assistant', content: 'I ring the bell twice. Ready.' } }] }]);
  assert.equal((await testConnection(build({ provider: 'custom', baseUrl: 'http://x/v1', model: 'm', fetchImpl: bad.fetchImpl }))).ok, false);
});

test('settings: each provider keeps its own key and model, old Gemini settings carry over, keys never reach a screen', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'oxd-'));
  writeF(join(dir, 'director.json'), JSON.stringify({ mode: 'copilot', provider: 'gemini', apiKey: 'OLD-GEMINI-KEY', model: 'gemini-3.7-flash' }));
  const seen = [];
  const makeProvider = (o) => { seen.push(o); return { listModels: async () => (o.provider === 'ollama' ? [{ id: 'local:14b', name: 'local:14b' }] : o.provider === 'gemini' ? [{ id: 'gemini-3.7-flash', name: 'F' }] : [{ id: 'gpt-a', name: 'A' }, { id: 'gpt-b', name: 'B' }]), start: () => ({}) }; };
  const d = createDirector({ getState: () => seated(), commit: () => {}, scenario, bestiary, rng, saveDir: dir, onChange: () => {}, makeProvider });
  let v = d.view('host');
  assert.equal(v.keySet, true);
  assert.equal(v.model, 'gemini-3.7-flash');
  assert.equal(v.providers.length, PROVIDERS.length);
  await d.op({ op: 'config', provider: 'ollama' });
  v = d.view('host');
  assert.equal(v.usable, true); // no key needed
  assert.equal(v.model, 'local:14b'); // the only local model is chosen
  assert.equal(d.view('player').on, true);
  await d.op({ op: 'config', baseUrl: 'ftp://nope' });
  assert.match(d.view('host').error, /http/);
  await d.op({ op: 'config', baseUrl: 'http://192.168.1.50:11434', numCtx: 32768 });
  assert.equal(seen[seen.length - 1].baseUrl, 'http://192.168.1.50:11434');
  assert.equal(d.view('host').numCtx, 32768);
  await d.op({ op: 'config', provider: 'openai' });
  assert.equal(d.view('host').usable, false);
  await d.op({ op: 'config', apiKey: 'OPENAI-KEY' });
  assert.equal(d.view('host').model, ''); // a cloud catalogue: the host chooses
  await d.op({ op: 'config', model: 'gpt-b' });
  await d.op({ op: 'config', provider: 'gemini' });
  assert.equal(d.view('host').model, 'gemini-3.7-flash');
  assert.equal(seen[seen.length - 1]?.apiKey ?? 'OLD-GEMINI-KEY', 'OLD-GEMINI-KEY');
  assert.ok(!JSON.stringify(d.view('host')).includes('KEY'));
  assert.equal(pickFor('anthropic', [{ id: 'claude-opus-9' }, { id: 'claude-sonnet-9' }]), 'claude-sonnet-9');
});

test('the leak check catches a creature\'s numbers in words, as the Run 3 bench did', () => {
  const s = seated();
  const kinds = (t) => checkNarration(t, s).map((f) => f.kind);
  assert.deepEqual(kinds('They test with a pool of three dice against a Membrane Threshold of 12. Bresk, what now?'), ['leak']);
  assert.deepEqual(kinds('The mites roll three dice against a tough shell. Bresk, what now?'), ['leak']);
  // The player's own Threshold, as the Director asks for a roll, is not a leak.
  assert.deepEqual(kinds('Roll Osmosis against Threshold 12, Brost. How deep do you cast?'), []);
});

test('the Engine pays a printed reward once per organism per site, for the Director only', () => {
  const s = seated();
  const T = toolbox({ state: s, scenario, bestiary, rng, now: 0 });
  assert.deepEqual(T.run('award', { why: 'Entering legally under an Order II oath', codon: 15, organisms: ['wall'] }), { paid: true });
  const again = T.run('award', { why: 'Entering legally under an Order II oath', codon: 15, organisms: ['wall'] });
  assert.match(again.refused, /already been paid/);
  assert.equal(T.state.organisms.wall.codon, 15); // the refused payment did not happen
  // A different reason is a different payment, and the host may still pay by hand.
  assert.deepEqual(T.run('award', { why: 'Finding the stamp', codon: 5, organisms: ['wall'] }), { paid: true });
  let h = apply(s, { type: 'award', codon: 15, why: 'Entering legally under an Order II oath', organismIds: ['wall'] }, ctx('host', null));
  h = apply(h, { type: 'award', codon: 15, why: 'Entering legally under an Order II oath', organismIds: ['wall'] }, ctx('host', null));
  assert.equal(h.organisms.wall.codon, 30);
});

test('the Director cannot end a Pulse War while a creature on the site is still up', () => {
  let s = seated();
  s = apply(s, { type: 'fight.start', creatures: [{ blockId: 'gnaw-swarm', count: 1, band: 'mid' }] }, ctx('host', null));
  const T = toolbox({ state: s, scenario, bestiary, rng, now: 0 });
  const no = T.run('end_pulse_war', {});
  assert.match(no.refused, /still up on this site/);
  assert.ok(T.state.fight, 'the Pulse War is still running');
  // The host may end it by hand, and once the creatures are down the Director may too.
  for (const c of Object.values(s.creatures)) c.down = true;
  const T2 = toolbox({ state: s, scenario, bestiary, rng, now: 0 });
  assert.deepEqual(T2.run('end_pulse_war', {}), { ended: true });
  const hostEnds = apply(apply(seated(), { type: 'fight.start', creatures: [{ blockId: 'gnaw-swarm', count: 1, band: 'mid' }] }, ctx('host', null)), { type: 'fight.end' }, ctx('host', null));
  assert.equal(hostEnds.fight, null);
});

test('a turn that uses its tools and never speaks gets one fresh try', async () => {
  const s = apply(seated(), { type: 'say', text: 'What can I taste?' }, ctx('player', 'p2'));
  // Attempt one: the model says nothing, twice (the nudge too). Attempt two: it narrates.
  const make = scripted([{ text: '' }, { text: '' }]);
  const r = await directorTurn({ state: s, scenario, bestiary, provider: make(), rng, reason: 'test' });
  assert.match(r.narration, /water waits/);
});

test('a turn that never speaks in either try says so plainly', async () => {
  const s = apply(seated(), { type: 'say', text: 'What can I taste?' }, ctx('player', 'p2'));
  const make = scripted([{ text: '' }, { text: '' }, { text: '' }, { text: '' }]);
  await assert.rejects(directorTurn({ state: s, scenario, bestiary, provider: make(), rng, reason: 'test' }), /never said anything/);
});

test('the briefing gives the creature costs during a Pulse War', () => {
  let s = seated();
  s = apply(s, { type: 'fight.start', creatures: [{ blockId: 'gnaw-swarm', count: 1, band: 'mid' }] }, ctx('host', null));
  const text = briefing(s, scenario, bestiary, {});
  assert.match(text, /Creature costs: a Strike 2 Pulse Points, a Drift 1, a Reserve 1/);
  assert.ok(!/Creature costs/.test(briefing(seated(), scenario, bestiary, {})), 'no costs when no Pulse War is running');
});

test('the Director may not ask for an unhurried roll during a Pulse War', () => {
  let s = seated();
  s = apply(s, { type: 'fight.start', creatures: [{ blockId: 'gnaw-swarm', count: 1, band: 'mid' }] }, ctx('host', null));
  const T = toolbox({ state: s, scenario, bestiary, rng, now: 0 });
  const no = T.run('ask_for_roll', { organism: 'eyes', baseline: 'OSM', pathway: 'Chemoreception', threshold: 12, what_for: 'Taste the water', unhurried: true });
  assert.match(no.refused, /Not unhurried during a Pulse War/);
  // Outside a fight the same unhurried check is allowed.
  const T2 = toolbox({ state: seated(), scenario, bestiary, rng, now: 0 });
  const ok = T2.run('ask_for_roll', { organism: 'eyes', baseline: 'OSM', pathway: 'Chemoreception', threshold: 12, what_for: 'Taste the water', unhurried: true });
  assert.ok(!ok.refused, `not refused outside a fight: ${ok.refused}`);
});

test('the leak check catches a creature\'s health as a number, but not a player\'s', () => {
  let s = seated();
  s = apply(s, { type: 'fight.start', creatures: [{ blockId: 'fold-sentinel', count: 1, band: 'near' }, { blockId: 'gnaw-swarm', count: 1, band: 'near' }] }, ctx('host', null));
  const kinds = (t) => checkNarration(t, s).map((f) => f.kind);
  assert.deepEqual(kinds('The Fold Sentinel groans as its integrity drops to seven. Brost, what now?'), ['leak']);
  assert.deepEqual(kinds('The sentinel oozes brine down to a single point of MI. Bresk, what now?'), ['leak']);
  assert.deepEqual(kinds('The swarm bites Bresk for 5 Kinetic, down to 34 MI. Bresk, what now?'), []);
});

test('a travel turn may end without a question', () => {
  const s = seated();
  assert.deepEqual(checkNarration('You drift down the cut-lane into the Soft Field.', s, { moved: true }), []);
  assert.deepEqual(checkNarration('You drift down the cut-lane into the Soft Field.', s).map((f) => f.kind), ['style']);
});

test('during a Pulse War the briefing says who is still up and that the Cohort cannot leave', () => {
  let s = seated();
  s = apply(s, { type: 'fight.start', creatures: [{ blockId: 'gnaw-swarm', count: 1, band: 'mid' }] }, ctx('host', null));
  assert.match(briefing(s, scenario, bestiary, {}), /Still up: Gnaw Swarm.*cannot end the Pulse War or change site/);
});
