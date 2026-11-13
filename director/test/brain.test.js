// The Director's brain, tested with a scripted stand-in for the model.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { newSession, apply, restart, hazardBudget } from '../engine/ledger.js';
import { makeRng } from '../engine/dice.js';
import { scenario } from '../data/first-carve.js';
import { toolbox, TOOLS, hazardSpec } from '../brain/tools.js';
import { directorTurn, briefing, checkNarration, asksRollInWords, MACHINERY, BRIEFING_LEAK } from '../brain/director.js';
import { createDirector } from '../brain/manager.js';
import { gemini, pickDefaultModel } from '../brain/gemini.js';

const bestiary = JSON.parse(readFileSync(new URL('../data/bestiary.json', import.meta.url), 'utf8'));
const rng = makeRng(11);
const ctx = (role, pid) => ({ role, pid, rng, now: 0, scenario, bestiary });

// Share out the harvest the quick way: whoever is offered takes it.
function shareAll(s) {
  for (let i = 0; i < 60 && s.loot && s.loot.offer; i++) s = apply(s, { type: 'loot.take' }, ctx('host', null));
  return s;
}
const held = (s, k) => Object.values(s.organisms).reduce((a, o) => a + ((o.specimens || {})[k] || 0), 0);

function seated() {
  let s = newSession(scenario);
  for (const [pid, who, hand, name] of [['p1', 'Roly', 'wall', 'Bresk of the Sixth Choir'], ['p2', 'Sam', 'eyes', 'Brost of the Third Current'], ['p3', 'Ana', 'ledger', 'Ilm of the Open Hand'], ['p4', 'Kit', 'rider', 'Vash of the Long Reach']].slice(0, 2)) {
    s = apply(s, { type: 'join', name: who }, ctx('player', pid));
    s = apply(s, { type: 'zero.agree' }, ctx('player', pid));
    s = apply(s, { type: 'claim', organismId: hand, name }, ctx('player', pid));
  }
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
  // The briefing carried the site's private notes and the player's words.
  assert.match(make.seen[0], /FOR YOU ALONE AT THIS SITE/);
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
  // Asking for more than is printed brings what is printed; asking again changes nothing and is not an error.
  T.run('bring_creatures', { block: 'gnaw-swarm', count: 3 });
  assert.equal(Object.values(T.state.creatures).filter((c) => c.blockId === 'gnaw-swarm').length, 2);
  assert.match(T.run('bring_creatures', { block: 'gnaw-swarm', count: 1 }).note, /already in the scene/);
  assert.match(T.run('end_pulse_war', {}).note, /no Pulse War running/);
  assert.match(T.run('ask_for_roll', { organism: 'wall', baseline: 'VSC', threshold: 5, what_for: 'x' }).refused, /between 8 and 28/);
  assert.match(T.run('ask_for_roll', { organism: 'rider', baseline: 'DFF', threshold: 12, what_for: 'x' }).refused, /No organism/);
  assert.match(T.run('change_site', { site: 'gut-stone' }).refused, /cannot be reached/);
  assert.match(T.run('award', { codon: 500, why: 'x' }).refused, /not printed for this site/);
  assert.match(T.run('creature_strike', { creature: 'ghost', target: 'wall' }).refused, /No creature/);
  assert.equal(T.run('move_clock', { clock: 'TOLL', change: 1, why: 'a loud fight' }).now, '1/5');
  assert.match(T.run('move_clock', { clock: 'TOLL', change: 1, why: 'again' }).note, /already taken your one advance/);
  assert.equal(T.run('move_clock', { clock: 'TOLL', change: -1, why: 'a toll chit' }).now, '0/5');
  assert.match(T.run('rest', {}).rested ? 'ok' : 'no', /ok/);
  assert.equal(T.refusals, 6, 'repeats of what is already true are notes, not refusals');
  assert.equal(Object.keys(T.state.creatures).length, 2, 'only the printed two swarms came in');
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
  const m = managed('auto', [{ text: 'The floor hums. Brost, do you tell Bresk?' }, { text: 'The Sentinel has MT 13 and soak 1. Brost, what now?' }, { text: 'Its Membrane Threshold is 13. Brost, what now?' }]);
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
  const f = apply(s, { type: 'fight.start', creatures: [{ blockId: 'gnaw-swarm', count: 1, band: 'near' }] }, ctx('host', null));
  const fk = (t) => checkNarration(t, f).map((x) => x.kind);
  assert.ok(fk('The swarm rolls three dice against a tough shell. Bresk, what now?').includes('leak'));
  // The player's own dice are not a leak; outside a fight they are a style flag.
  assert.ok(!fk('Brost, the crossing itself: four dice against twelve. Do you cross?').includes('leak'));
  assert.deepEqual(kinds('Brost, the crossing itself: four dice against twelve. Do you cross?'), ['style']);
  // The player's own Threshold, as the Director asks for a roll, is not a leak.
  assert.ok(!kinds('Roll Osmosis against Threshold 12, Brost. How deep do you cast?').includes('leak'));
});

test('the Engine pays a printed reward once per organism per site, for the Director only', () => {
  const s = seated();
  const T = toolbox({ state: s, scenario, bestiary, rng, now: 0 });
  assert.deepEqual(T.run('award', { why: 'Entering legally under an Order II oath', codon: 15, organisms: ['wall'] }), { paid: true });
  const again = T.run('award', { why: 'Entering legally under an Order II oath', codon: 15, organisms: ['wall'] });
  assert.match(again.refused, /already been paid/);
  assert.equal(T.state.organisms.wall.codon, 15); // the refused payment did not happen
  // A different reason is a different payment, and the host may still pay by hand.
  // The per-swarm Codon is the Engine's to pay at harvest, never an award. The refusal is worded in
  // table language, not "paid by the Engine": the Director repeats what it is told (13 Nov leak).
  assert.match(T.run('award', { why: 'A swarm given water and gone', codon: 1.5, organisms: ['wall'] }).refused, /is paid when a gnaw swarm is harvested: harvest a destroyed one/);
  assert.match(T.run('award', { why: 'Finding the stamp', codon: 5, organisms: ['wall'] }).refused, /5 Codon is not printed for this site/);
  let h = apply(s, { type: 'award', codon: 15, why: 'Entering legally under an Order II oath', organismIds: ['wall'] }, ctx('host', null));
  h = apply(h, { type: 'award', codon: 15, why: 'Entering legally under an Order II oath', organismIds: ['wall'] }, ctx('host', null));
  assert.equal(h.organisms.wall.codon, 30);
});

test('the Director cannot end a Pulse War while a creature on the site is still up', () => {
  let s = seated();
  s = apply(s, { type: 'fight.start', creatures: [{ blockId: 'gnaw-swarm', count: 1, band: 'mid' }] }, ctx('host', null));
  const T = toolbox({ state: s, scenario, bestiary, rng, now: 0 });
  const no = T.run('end_pulse_war', {});
  assert.match(no.refused, /still up and fighting on this site/);
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
  // The bite below is real, so the "damage the Engine never paid" check stays out of this test's way.
  s = apply(s, { type: 'damage', target: { kind: 'org', id: 'wall' }, amount: 6, dtype: 'Kinetic' }, ctx('host', null));
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
  assert.match(briefing(s, scenario, bestiary, {}), /Still fighting: Gnaw Swarm.*cannot end the Pulse War or change site/);
});

test('the briefing lists what has already been paid at this site', () => {
  const T = toolbox({ state: seated(), scenario, bestiary, rng, now: 0 });
  assert.ok(!/ALREADY PAID/.test(briefing(T.state, scenario, bestiary, {})));
  T.run('award', { why: 'Getting inside without making an enemy of Order II', codon: 15 });
  assert.match(briefing(T.state, scenario, bestiary, {}), /ALREADY PAID AT THIS SITE.*"getting inside without making an enemy of order ii" to Bresk of the Sixth Choir and Brost of the Third Current/);
});

test('a leaked creature number gets one rewrite; a clean rewrite replaces it', async () => {
  const s = apply(seated(), { type: 'say', text: 'How many dice does the swarm roll?' }, ctx('player', 'p2'));
  const make = scripted([
    { text: 'A Gnaw Swarm rolls three dice, and its Membrane Threshold is 12. Brost, what now?' },
    { text: 'The swarm is a brittle, frantic cloud that wants water more than a fight. Brost, what now?' },
  ]);
  const r = await directorTurn({ state: s, scenario, bestiary, provider: make(), rng, reason: 'test' });
  assert.match(r.narration, /brittle, frantic cloud/);
  assert.ok(!r.flags.some((f) => f.kind === 'leak'));
  assert.ok(r.flags.some((f) => f.kind === 'note'));
  assert.match(String(make.seen.at(-1)), /Rewrite your whole reply/);
});

test('a rewrite that still leaks keeps the original and its leak flag', async () => {
  const s = apply(seated(), { type: 'say', text: 'How many dice does the swarm roll?' }, ctx('player', 'p2'));
  const make = scripted([
    { text: 'A Gnaw Swarm has a pool of three dice. Brost, what now?' },
    { text: 'Fine: it has a Membrane Threshold of 12. Brost, what now?' },
  ]);
  const r = await directorTurn({ state: s, scenario, bestiary, provider: make(), rng, reason: 'test' });
  assert.match(r.narration, /pool of three dice/);
  assert.ok(r.flags.some((f) => f.kind === 'leak'));
});

test('"the creatures block the lane" is not a leak', () => {
  const s = seated();
  const kinds = (t) => checkNarration(t, s).map((f) => f.kind);
  assert.deepEqual(kinds('You cannot slip past while they block the lane. Brost, do you strike again?'), []);
  assert.deepEqual(kinds('Its stat block says it is tough. Brost, what now?'), ['leak']);
});

test('a reply that runs long or has no question gets one rewrite', async () => {
  const s = apply(seated(), { type: 'say', text: 'What can I taste?' }, ctx('player', 'p2'));
  const long = Array.from({ length: 60 }, () => 'The brine drifts slowly.').join(' ');
  const make = scripted([{ text: long }, { text: 'The brine tastes of salt and old fat. Brost, what do you do?' }]);
  const r = await directorTurn({ state: s, scenario, bestiary, provider: make(), rng, reason: 'test' });
  assert.match(r.narration, /salt and old fat/);
  assert.ok(!r.flags.some((f) => f.kind === 'style'));
  assert.match(r.flags.find((f) => f.kind === 'note').text, /ran long, read out dice, or did not end on a question/);
  // A rewrite that is no better is not used.
  const make2 = scripted([{ text: 'The brine drifts.' }, { text: 'The brine still drifts.' }]);
  const r2 = await directorTurn({ state: s, scenario, bestiary, provider: make2(), rng, reason: 'test' });
  assert.equal(r2.narration, 'The brine drifts.');
  assert.ok(r2.flags.some((f) => f.kind === 'style'));
});

test('the briefing marks a downed creature as destroyed', () => {
  let s = seated();
  s = apply(s, { type: 'fight.start', creatures: [{ blockId: 'fold-sentinel', count: 1, band: 'near' }] }, ctx('host', null));
  assert.ok(!/DESTROYED/.test(briefing(s, scenario, bestiary, {})));
  for (const c of Object.values(s.creatures)) c.down = true;
  const text = briefing(s, scenario, bestiary, {});
  assert.match(text, /Fold Sentinel \(id "[^"]+"\): DESTROYED/);
  assert.match(text, /Every creature here is destroyed/);
});

test('unhurried sent as the text "False" is not treated as true', () => {
  const T = toolbox({ state: seated(), scenario, bestiary, rng, now: 0 });
  T.run('ask_for_roll', { organism: 'eyes', baseline: 'OSM', pathway: 'Chemoreception', threshold: 12, what_for: 'Taste the water', unhurried: 'False' });
  assert.equal(T.state.requests.length, 1, 'a roll is waiting, not skipped on Baseline');
});

test('stand down: a creature that is not fighting leaves the fight, and striking it brings it back', () => {
  let s = seated();
  s = apply(s, { type: 'fight.start', creatures: [{ blockId: 'fold-sentinel', count: 1, band: 'near' }] }, ctx('host', null));
  const T = toolbox({ state: s, scenario, bestiary, rng, now: 0 });
  const cid = Object.keys(T.state.creatures)[0];
  assert.match(T.run('end_pulse_war', {}).refused, /stand it down first/);
  assert.match(T.run('creature_stand_down', { creature: cid }).refused || '', /why/i);
  const ok = T.run('creature_stand_down', { creature: cid, why: 'it honours the filed oath' });
  assert.equal(ok.stood_down, 'Fold Sentinel');
  assert.equal(T.state.fight.turn && T.state.fight.actors[T.state.fight.turn].kind, 'org', 'the turn is a player\'s: the Sentinel takes none');
  assert.match(briefing(T.state, scenario, bestiary, {}), /STOOD DOWN \(it honours the filed oath\)/);
  assert.ok(!/Still fighting/.test(briefing(T.state, scenario, bestiary, {})));
  assert.match(T.run('creature_strike', { creature: cid, target: 'wall' }).refused, /stood down/);
  // A player strikes it: it is back in, and the fight cannot be ended by the Director.
  const who = T.state.fight.actors[T.state.fight.turn].id;
  const pid = T.state.organisms[who].playerId;
  T.state = apply(T.state, { type: 'strike', organismId: who, targetId: cid }, ctx('player', pid));
  assert.equal(T.state.creatures[cid].stoodDown, null);
  assert.match(T.run('end_pulse_war', {}).refused, /still up and fighting/);
  // Stood down again, the Director may end the fight.
  T.state.requests = [];
  T.run('creature_stand_down', { creature: cid, why: 'it yields' });
  assert.deepEqual(T.run('end_pulse_war', {}), { ended: true });
});

test('ending the turn of a stood-down creature is not a refusal', () => {
  let s = seated();
  s = apply(s, { type: 'fight.start', creatures: [{ blockId: 'fold-sentinel', count: 1, band: 'near' }] }, ctx('host', null));
  const T = toolbox({ state: s, scenario, bestiary, rng, now: 0 });
  const cid = Object.keys(T.state.creatures)[0];
  T.run('creature_stand_down', { creature: cid, why: 'it honours the filed oath' });
  const r = T.run('end_creature_turn', { creature: cid });
  assert.ok(!r.refused);
  assert.match(r.note, /out of the fight/);
  assert.equal(T.refusals, 0);
});

test('the briefing says whether the acting creature can Strike', () => {
  let s = seated();
  s = apply(s, { type: 'fight.start', creatures: [{ blockId: 'gnaw-swarm', count: 1, band: 'contact' }] }, ctx('host', null));
  const cid = Object.keys(s.creatures)[0];
  for (let i = 0; i < 20 && s.fight.turn !== `cre:${cid}`; i++) s = apply(s, { type: 'turn.next' }, ctx('host', null));
  assert.match(briefing(s, scenario, bestiary, {}), /Gnaw Swarm[^\n]*can Strike now/);
  s.fight.actors[`cre:${cid}`].pp = 1;
  assert.match(briefing(s, scenario, bestiary, {}), /CANNOT Strike now \(a Strike costs 2 and it has 1\)/);
  s.creatures[cid].segments = 1;
  assert.match(briefing(s, scenario, bestiary, {}), /too few Segments left to Strike at all/);
});

test('after a hit the briefing says whether the target is still up or destroyed', () => {
  let s = seated();
  s = apply(s, { type: 'fight.start', creatures: [{ blockId: 'fold-sentinel', count: 1, band: 'contact' }] }, ctx('host', null));
  const cid = Object.keys(s.creatures)[0];
  for (let i = 0; i < 20 && s.fight.turn !== 'org:wall'; i++) s = apply(s, { type: 'turn.next' }, ctx('host', null));
  s = apply(s, { type: 'strike', organismId: 'wall', targetId: cid }, ctx('player', 'p1'));
  const n = s.requests[0].pool.dice;
  s = apply(s, { type: 'roll', requestId: s.requests[0].id, dice: [6, 5, ...Array(n - 2).fill(2)] }, ctx('player', 'p1'));
  assert.equal(s.creatures[cid].down, false);
  assert.match(briefing(s, scenario, bestiary, {}), /Fold Sentinel is STILL UP after this: describe it hurt, never destroyed/);
  s.creatures[cid].mi = 1;
  for (let i = 0; i < 20 && s.fight.turn !== 'org:eyes'; i++) s = apply(s, { type: 'turn.next' }, ctx('host', null));
  s = apply(s, { type: 'strike', organismId: 'eyes', targetId: cid }, ctx('player', 'p2'));
  const m = s.requests[0].pool.dice;
  s = apply(s, { type: 'roll', requestId: s.requests[0].id, dice: Array(m).fill(6) }, ctx('player', 'p2'));
  assert.equal(s.creatures[cid].down, true);
  assert.match(briefing(s, scenario, bestiary, {}), /Fold Sentinel is DESTROYED by this/);
});

test('an Oath spends a box and records the promise; Hands without boxes cannot swear', () => {
  // The promise is Bresk's own words, said at the table first: swear_oath refuses a promise the
  // Director made up (bench run 3 of 13 Nov swore `... - to be asked what is promised.`).
  const s = apply(seated(), { type: 'say', text: 'We will carry the last cargo out under stamp' }, ctx('player', 'p1'));
  const T = toolbox({ state: s, scenario, bestiary, rng, now: 0 });
  const r = T.run('swear_oath', { organism: 'wall', promise: 'We will carry the last cargo out under stamp', witness: 'the Order II fold' });
  assert.deepEqual(r, { sworn: true, oath_boxes_left: '4/5' });
  assert.equal(T.state.organisms.wall.oaths[0].promise, 'We will carry the last cargo out under stamp');
  assert.match(briefing(T.state, scenario, bestiary, {}), /Oath OPEN \(id "v\d+"\): "We will carry the last cargo out under stamp" \(witnessed by the Order II fold\)/);
  assert.match(T.run('swear_oath', { organism: 'eyes', promise: 'x' }).refused, /no Oath boxes printed/);
  assert.match(T.run('swear_oath', { organism: 'wall', promise: '' }).refused, /what is promised/);
});

test('settling an Oath that is already closed is a note, not a refusal', () => {
  // Run 2 of the 13 Nov evening gate: it settled the Oath kept after the crossing, then tried to settle
  // the same one broken on the way out of the site, and took a refusal for restating its own record.
  const s = apply(seated(), { type: 'say', text: 'We will carry the last cargo out under stamp' }, ctx('player', 'p1'));
  const T = toolbox({ state: s, scenario, bestiary, rng, now: 0 });
  T.run('swear_oath', { organism: 'wall', promise: 'We will carry the last cargo out under stamp', witness: 'the Order II fold' });
  assert.equal(T.run('settle_oath', { organism: 'wall', kept: true, why: 'it went out under stamp' }).settled, 'kept');
  const again = T.run('settle_oath', { organism: 'wall', kept: false, why: 'walked away' });
  assert.equal(again.refused, undefined, 'the Oath is closed: restating it is not a rule break');
  assert.match(String(again.note), /already closed/);
  assert.equal(T.refusals, 0, 'and it does not mark the run against the gate');
});

test('open_panel lets the site pay for a panel, and a second one in the scene is answered, not refused', () => {
  // Run 3 of the afternoon gate and both evening runs: the Director spent its one Clock advance on a
  // panel the Vector was paying for as well. There is now a call for the event itself, and the second
  // call in a scene teaches the model instead of marking the run.
  const T = toolbox({ state: apply(seated(), { type: 'scene.set', siteId: 'soft-field' }, ctx('host')), scenario, bestiary, rng, now: 0 });
  const one = T.run('open_panel', { what: 'a hanging lipid panel' });
  assert.equal(one.panel_opened, 'a hanging lipid panel', JSON.stringify(one));
  assert.equal(one.clock, 'CARCASS 1/6');
  const two = T.run('open_panel', { what: 'another panel down the lane' });
  assert.equal(two.refused, undefined, 'a restatement is not a rule break');
  assert.equal(two.already_paid, true);
  assert.match(String(two.note), /do not spend your own advance/);
  // The site cut is the same event: it must not pay the row a second time in one scene.
  T.run('harvest', { organism: 'eyes' });
  for (const q of [...T.state.requests]) T.state = apply(T.state, { type: 'roll', requestId: q.id, dice: Array(q.pool.dice).fill(6) }, ctx('player', 'p2'));
  assert.equal(T.state.clocks.CARCASS.filled, 1, 'one panel opening, one segment, one scene');
  assert.equal(T.refusals, 0, 'and nothing in that sequence counts against the run');
});

test('narration that reverses a throw the page passed is flagged', () => {
  // Run 2 of the 13 Nov evening gate: 16 against 12 — SUCCESS, Overflow 4 — narrated as the lip folding
  // over Bresk instead of parting, in the same turn that settled his Oath as kept.
  const T = toolbox({ state: seated(), scenario, bestiary, rng, now: 0 });
  T.run('ask_for_roll', { organism: 'wall', baseline: 'DFF', pathway: 'Membrane Penetration', threshold: 12, what_for: 'Shoulder through the wound lip before it closes' });
  const q = T.state.requests[0];
  const since = T.state.seq;
  T.state = apply(T.state, { type: 'roll', requestId: q.id, dice: Array(q.pool.dice).fill(6) }, ctx('player', 'p1'));
  assert.ok(T.state.rolls.at(-1).success, 'the throw passed');
  const flags = checkNarration('The lip folds over Bresk instead of parting, and the current takes him sideways. Bresk, what do you do?', T.state, { moved: false, since });
  assert.ok(flags.some((f) => f.kind === 'rule' && /^Reverses Bresk/.test(f.text)), JSON.stringify(flags));
  // A success at a price is what a Cost looks like: not a reversal.
  assert.ok(!checkNarration('The lip gives and Bresk is through, though the current keeps a hand on him. Bresk, what now?', T.state, { moved: false, since }).some((f) => /^Reverses /.test(f.text)));
  // And prose about somebody else holding still is nobody's reversal.
  assert.ok(!checkNarration('The Fold Sentinel has not moved an inch at the chokepoint. Bresk, what do you do?', T.state, { moved: false, since }).some((f) => /^Reverses /.test(f.text)));
});

test("counting a swarm's Segments out loud is a leak, printed or invented", () => {
  // The evening gate's Director said "each swarm is six small segments" and "two small bodies' worth of
  // it left of what was a dozen". Segments are a swarm's health track (the block prints MI 10 and
  // Segments 6 in the same line), so counting them is the same fault as reading out MI. What stays
  // legal is how the thing looks and how much is left in the fiction.
  // A swarm in the scene, because that is the state the false positives were found against: the same
  // word "sections" is what the Cohort's own cut is made of, and the saved gate logs are full of it.
  const s = apply(seated(), { type: 'creature.add', creatures: [{ blockId: 'gnaw-swarm', count: 1, band: 'near' }] }, ctx('host', null));
  const said = (t) => checkNarration(t, s, { moved: true }).map((f) => f.text);
  assert.ok(said('Each swarm is six small segments wearing a wet look. Bresk, what now?').some((f) => /health track/.test(f)));
  assert.ok(said('Two sections of it are left, still scenting you. Bresk, what now?').some((f) => /health track/.test(f)));
  assert.ok(said('The needle rakes the far side of the swarm: four of its six sections torn away. Bresk, what now?').some((f) => /health track/.test(f)));
  assert.ok(said('They are small and many: six slow segments apiece, more drinking than hunting. Brost, what now?').some((f) => /health track/.test(f)));
  // Not the creature's numbers: appearance, and the Cohort's own harvest.
  assert.ok(!said('A dozen small ones wearing a slime coat, half of them peeling away into the current. Bresk, what now?').some((f) => /health track/.test(f)));
  assert.ok(!said('It is a brittle, frantic cloud and anything that spreads takes pieces off it. Bresk, what now?').some((f) => /health track/.test(f)));
  assert.ok(!said('Ilm works the far sheet slowly, and four cut sections lie in the cradle of the current, unstamped. Bresk, what now?').some((f) => /health track/.test(f)), 'the cut is made of sections too');
  assert.ok(!said('The wreck of the first one lies in sections at Vash\'s feet, cuttable. Bresk, what now?').some((f) => /health track/.test(f)), 'and a body at a player\'s feet is not a health readout');
});

test('an Oath the Director swears has to be owed to somebody the table can see', () => {
  // The evening gate filed `I shoulder through the wound lip before the flap closes` as a promise with
  // no party owed, and the next roll settled it. A promise is what somebody is being held to.
  const s = apply(seated(), { type: 'say', text: 'We will carry the last cargo out under stamp' }, ctx('player', 'p1'));
  const T = toolbox({ state: s, scenario, bestiary, rng, now: 0 });
  assert.match(String(T.run('swear_oath', { organism: 'wall', promise: 'We will carry the last cargo out under stamp' }).refused), /who witnesses it/);
  const ok = T.run('swear_oath', { organism: 'wall', promise: 'We will carry the last cargo out under stamp', witness: 'the Order II fold at the gate' });
  assert.equal(ok.sworn, true, JSON.stringify(ok));
  assert.equal(T.refusals, 1, 'the unowed one is the only refusal in the run');
});

test('a hazard is only what this site prints, and a creature is not one', () => {
  // Run 1 of the 13 Nov evening gate priced the Glaze Medusas' trailing field as a hazard (4 Osmotic)
  // with no Pulse War running. The page refused and quoted the site's own Hazard line, which fixed it
  // on the next call — so the wording now says it up front, where it is read before the attempt.
  const d = TOOLS.find((t) => t.name === 'hazard_damage').description;
  assert.match(d, /only the hazard this site prints/);
  assert.match(d, /sting or trailing field is not a hazard/);
});

test('the Director may not swear an Oath the table never said', () => {
  // Bench run 3 of 13 Nov: it swore `Bresk's own words: "..." - to be asked what is promised.`,
  // the Oath went into the record with that in it, and `recall` later read it back to Bresk as his
  // own promise. The words have to have reached the table.
  const said = apply(seated(), { type: 'say', text: 'We have no stamp. We offer a promise, witnessed and filed.' }, ctx('player', 'p1'));
  const T = toolbox({ state: said, scenario, bestiary, rng, now: 0 });
  const scaffold = T.run('swear_oath', { organism: 'wall', promise: 'Bresk\'s own words: "We have no stamp. We offer a promise, witnessed and filed." \u2014 to be asked what is promised.', witness: 'the Order II fold' });
  assert.match(scaffold.refused, /Director asking itself/);
  const invented = T.run('swear_oath', { organism: 'wall', promise: 'We will pay the toll in Specimens at the gate', witness: 'the Order II fold' });
  assert.match(invented.refused, /No player said that/);
  const clean = T.run('swear_oath', { organism: 'wall', promise: 'We have no stamp. We offer a promise, witnessed and filed.', witness: 'the Order II fold' });
  assert.equal(clean.sworn, true, 'their words, exactly, go in');
  assert.equal(T.state.organisms.wall.oath, 4, 'and only the clean one spent a box');
});

test('a roll asked for in words is sent back once to use the roll tool', async () => {
  const s = apply(seated(), { type: 'say', text: 'I taste the water.' }, ctx('player', 'p2'));
  assert.equal(asksRollInWords('Brost, roll OSM and Chemoreception against Threshold 12. What do you look for?', s), true);
  assert.equal(asksRollInWords('The swarm rolls over itself in the current. Brost, what now?', s), false);
  const make = scripted([
    { text: 'Brost, roll OSM and Chemoreception against Threshold 12. What do you look for?' },
    { calls: [['ask_for_roll', { organism: 'eyes', baseline: 'OSM', pathway: 'Chemoreception', threshold: 12, what_for: 'Taste the water' }]] },
    { text: 'The water is thick with it. Brost, roll it on your screen: what are you hoping to find?' },
  ]);
  const r = await directorTurn({ state: s, scenario, bestiary, provider: make(), rng, reason: 'test' });
  assert.equal(r.state.requests.length, 1, 'the roll is now waiting on a screen');
  assert.ok(!r.flags.some((f) => /in words/.test(f.text)));
  assert.match(String(make.seen[1]), /did not call ask_for_roll/);
});

test('the host can stand a creature down and put it back', () => {
  let s = seated();
  s = apply(s, { type: 'fight.start', creatures: [{ blockId: 'fold-sentinel', count: 1, band: 'near' }] }, ctx('host', null));
  const cid = Object.keys(s.creatures)[0];
  s = apply(s, { type: 'creature.standDown', cid }, ctx('host', null));
  assert.equal(s.creatures[cid].stoodDown.why, 'it is not fighting');
  s = apply(s, { type: 'creature.standDown', cid, off: true }, ctx('host', null));
  assert.equal(s.creatures[cid].stoodDown, null);
});

test('modifiers sent as JSON text are read', () => {
  const T = toolbox({ state: seated(), scenario, bestiary, rng, now: 0 });
  T.run('ask_for_roll', { organism: 'eyes', baseline: 'DFF', threshold: 12, what_for: 'Cross', modifiers: '[{"label": "current", "dice": -1}, {"label": "read the water", "dice": +1}, {"label": "help", "dice": 1}]' });
  const base = toolbox({ state: seated(), scenario, bestiary, rng, now: 0 });
  base.run('ask_for_roll', { organism: 'eyes', baseline: 'DFF', threshold: 12, what_for: 'Cross' });
  assert.equal(T.state.requests[0].pool.dice, base.state.requests[0].pool.dice + 1);
});

test('harvest: a destroyed creature yields its printed Specimens, costs Bulk, and only once', () => {
  let s = seated();
  s = apply(s, { type: 'creature.add', creatures: [{ blockId: 'gnaw-swarm', count: 1, band: 'near' }] }, ctx('host', null));
  const cid = Object.keys(s.creatures)[0];
  const T = toolbox({ state: s, scenario, bestiary, rng, now: 0 });
  assert.match(T.run('harvest', { organism: 'eyes', creature: cid }).refused, /still up/);
  T.state.creatures[cid].down = true;
  assert.match(briefing(T.state, scenario, bestiary, {}), /Not yet harvested/);
  const r = T.run('harvest', { organism: 'eyes', creature: cid });
  if (r.waiting_for) {
    const q = T.state.requests[0];
    assert.equal(q.at, 12); // tier 1 x 4 + 8
    T.state = apply(T.state, { type: 'roll', requestId: q.id, dice: Array(q.pool.dice).fill(5) }, ctx('player', 'p2'));
  }
  // The four Specimens wait to be shared out, offered first to the front of the picking order.
  assert.equal(T.state.loot.queue.length, 4);
  assert.equal(T.state.loot.offer.orgId, 'wall');
  T.state = shareAll(T.state);
  assert.equal(held(T.state, 'C'), 3); // Bestiary: C3 / G1
  assert.equal(held(T.state, 'G'), 1);
  assert.deepEqual(T.state.organisms.wall.specimens, { C: 2, G: 0, P: 0, T: 0 }, 'wall, eyes, wall, eyes: rotating');
  assert.deepEqual(T.state.organisms.eyes.specimens, { C: 1, G: 1, P: 0, T: 0 });
  const o = T.state.organisms.eyes;
  assert.equal(o.bulk, 1);
  assert.equal(T.state.creatures[cid].harvested, true);
  assert.match(T.run('harvest', { organism: 'wall', creature: cid }).refused, /already been harvested/);
  assert.match(briefing(T.state, scenario, bestiary, {}), /Specimens unstamped: 1 C, 1 G; stamped: none; Bulk carried 1 of/);
  // The Toll-Vent prints 1.5 Codon a harvested swarm: the Engine pays it, to each in the Cohort.
  for (const id of ['wall', 'eyes']) assert.equal(T.state.organisms[id].codon, 1.5);
  assert.ok(T.state.log.some((l) => /1\.5 Codon each for harvesting Gnaw Swarm/.test(l.text)));
});

test('harvest: a failed roll ruins the sample and gives Substrate instead', () => {
  let s = seated();
  s = apply(s, { type: 'fight.start', creatures: [{ blockId: 'gnaw-swarm', count: 1, band: 'near' }] }, ctx('host', null));
  const cid = Object.keys(s.creatures)[0];
  s.creatures[cid].down = true;
  for (let i = 0; i < 20 && s.fight.turn !== 'org:eyes'; i++) s = apply(s, { type: 'turn.next' }, ctx('host', null));
  const pp = s.fight.actors['org:eyes'].pp;
  const before = s.organisms.eyes.substrate;
  s = apply(s, { type: 'harvest', organismId: 'eyes', cid }, ctx('player', 'p2'));
  assert.equal(s.fight.actors['org:eyes'].pp, pp - 2, 'a Synthesise action costs 2 Pulse Points');
  const q = s.requests[0];
  s = apply(s, { type: 'roll', requestId: q.id, dice: Array(q.pool.dice).fill(1) }, ctx('player', 'p2'));
  assert.equal(s.organisms.eyes.substrate, before + 15); // 5 S for each of the 3 printed C
  assert.deepEqual(s.organisms.eyes.specimens, { C: 0, G: 0, P: 0, T: 0 });
  assert.equal(s.creatures[cid].harvested, true);
});

test('harvest: the Soft Field can be cut, the Toll-Vent cannot; the Tally Post stamps the cut', () => {
  const T = toolbox({ state: seated(), scenario, bestiary, rng, now: 0 });
  assert.match(T.run('harvest', { organism: 'eyes' }).refused, /Nothing is printed to cut/);
  assert.match(T.run('stamp_cut', {}).refused, /no Tally Post/);
  T.run('change_site', { site: 'soft-field' });
  assert.match(briefing(T.state, scenario, bestiary, {}), /This site can be cut[\s\S]*A Tally Post stands here/);
  const r = T.run('harvest', { organism: 'eyes' });
  if (r.waiting_for) { const q = T.state.requests[0]; T.state = apply(T.state, { type: 'roll', requestId: q.id, dice: Array(q.pool.dice).fill(5) }, ctx('player', 'p2')); }
  T.state = apply(T.state, { type: 'post.offer', roll: 9 }, ctx('host', null)); // a row with no share taken
  assert.match(T.run('stamp_cut', {}).refused, /still being shared out/);
  T.state = shareAll(T.state);
  assert.equal(held(T.state, 'C') + held(T.state, 'G'), 4);
  assert.equal(T.run('stamp_cut', {}).stamped, true);
  const stamped = Object.values(T.state.organisms).reduce((a, o) => a + ((o.stamped || {}).C || 0) + ((o.stamped || {}).G || 0), 0);
  assert.equal(stamped, 4);
  assert.equal(held(T.state, 'C') + held(T.state, 'G'), 0);
  assert.match(T.run('stamp_cut', {}).refused, /unstamped cut/);
});

test('rulings of 12 Nov: a pool never falls below one die; Substrate awards must be printed', () => {
  const T = toolbox({ state: seated(), scenario, bestiary, rng, now: 0 });
  T.run('ask_for_roll', { organism: 'wall', baseline: 'RTC', threshold: 12, what_for: 'Shove', modifiers: [{ label: 'a', dice: -5 }] });
  assert.equal(T.state.requests[0].pool.dice, 1);
  assert.match(T.run('award', { why: 'x', substrate: 50 }).refused, /50 S is not printed/);
  T.run('change_site', { site: 'soft-field' });
  assert.deepEqual(T.run('award', { why: 'A stamped cut', substrate: 60 }), { paid: true });
  assert.match(T.run('award', { why: 'A stamped cut, again', substrate: 500 }).refused, /Printed here: 40 to 120 S, 60 S/);
});

test('the Tally Post\'s priced choice is rolled once, from the printed table, before any stamp', () => {
  const T = toolbox({ state: seated(), scenario, bestiary, rng, now: 0 });
  assert.match(T.run('tally_post_offer', {}).refused, /no Tally Post/);
  T.run('change_site', { site: 'soft-field' });
  assert.match(briefing(T.state, scenario, bestiary, {}), /priced choice has not been rolled/);
  const r = T.run('harvest', { organism: 'eyes' });
  if (r.waiting_for) { const q = T.state.requests[0]; T.state = apply(T.state, { type: 'roll', requestId: q.id, dice: Array(q.pool.dice).fill(5) }, ctx('player', 'p2')); }
  T.state = shareAll(T.state);
  assert.match(T.run('stamp_cut', {}).refused, /priced choice first/);
  const offer = T.run('tally_post_offer', {});
  assert.ok(offer.roll >= 1 && offer.roll <= 12 && offer.offer && offer.price);
  assert.deepEqual(T.run('tally_post_offer', {}), offer, 'the offer does not change');
  assert.match(briefing(T.state, scenario, bestiary, {}), /priced choice was rolled \(d12 = \d+\): the clerk offers/);
  assert.equal(T.run('stamp_cut', {}).stamped, true);
  // Every face of the d12 has a row.
  const site = scenario.sites.find((x) => x.id === 'soft-field');
  for (let n = 1; n <= 12; n++) assert.ok(site.pricedChoice.some((row) => n >= row.lo && n <= row.hi), `d12 = ${n}`);
});

test('a Guild tally-stamp takes its third off the cut as it is stamped', () => {
  const T = toolbox({ state: seated(), scenario, bestiary, rng, now: 0 });
  T.run('change_site', { site: 'soft-field' });
  T.state.organisms.eyes.specimens = { C: 10, G: 2, P: 0, T: 0 };
  T.state = apply(T.state, { type: 'post.offer', roll: 5 }, ctx('host', null));
  const r = T.run('stamp_cut', {});
  assert.deepEqual(T.state.organisms.eyes.stamped, { C: 7, G: 2, P: 0, T: 0 }); // a third of 10 C, rounded down, is 3; a third of 2 G is 0
  assert.deepEqual(r.now_holding, ['Brost of the Third Current: 7 C, 2 G stamped']);
});

test('outside a fight, reading out dice or a Threshold is a style flag, not a leak', () => {
  const s = apply(seated(), { type: 'request.check', organismId: 'wall', baseline: 'RTC', at: 12, label: 'Cross' }, ctx('host', null));
  const kinds = (t) => checkNarration(t, s).map((f) => f.kind);
  assert.deepEqual(kinds('Pressure Tolerance, three dice, AT 12. Do you go straight through?'), ['style']);
  assert.deepEqual(kinds('The lip hums under your shoulder. Do you go straight through?'), []);
});

test('thinking setting: sent to local servers only, and dropped if the server objects', async () => {
  const ok = { choices: [{ message: { role: 'assistant', content: 'Ready. What now?' } }], usage: {} };
  // Off: the chat template is told not to think.
  let r = recorder([ok]);
  await build({ provider: 'custom', baseUrl: 'http://box:8000/v1', model: 'm', thinking: 'off', fetchImpl: r.fetchImpl }).start({ system: 'S', tools: [] }).send('hi');
  assert.deepEqual(r.sent[0].body.chat_template_kwargs, { enable_thinking: false });
  // Low: the least effort.
  r = recorder([ok]);
  await build({ provider: 'lmstudio', model: 'm', thinking: 'low', fetchImpl: r.fetchImpl }).start({ system: 'S', tools: [] }).send('hi');
  assert.equal(r.sent[0].body.reasoning_effort, 'low');
  // A server that rejects the field gets the request again without it.
  r = recorder([{ status: 400, body: { error: { message: 'Unrecognized request argument: chat_template_kwargs' } } }, ok]);
  const reply = await build({ provider: 'custom', baseUrl: 'http://box:8000/v1', model: 'm', thinking: 'off', fetchImpl: r.fetchImpl }).start({ system: 'S', tools: [] }).send('hi');
  assert.equal(reply.text, 'Ready. What now?');
  assert.equal(r.sent[1].body.chat_template_kwargs, undefined);
  // Cloud providers never get it.
  r = recorder([ok]);
  await build({ provider: 'openai', apiKey: 'K', model: 'm', thinking: 'off', fetchImpl: r.fetchImpl }).start({ system: 'S', tools: [] }).send('hi');
  assert.equal(r.sent[0].body.chat_template_kwargs, undefined);
  // Medium: the middle setting, sent the same way as low.
  r = recorder([ok]);
  await build({ provider: 'lmstudio', model: 'm', thinking: 'medium', fetchImpl: r.fetchImpl }).start({ system: 'S', tools: [] }).send('hi');
  assert.equal(r.sent[0].body.reasoning_effort, 'medium');
  assert.equal(r.sent[0].body.chat_template_kwargs, undefined);
  // Default: nothing is sent, and the model keeps its own.
  r = recorder([ok]);
  await build({ provider: 'lmstudio', model: 'm', thinking: 'default', fetchImpl: r.fetchImpl }).start({ system: 'S', tools: [] }).send('hi');
  assert.equal(r.sent[0].body.reasoning_effort, undefined);
  assert.equal(r.sent[0].body.chat_template_kwargs, undefined);
  // Cloud providers never get it.
  r = recorder([ok]);
  await build({ provider: 'openai', apiKey: 'K', model: 'm', thinking: 'medium', fetchImpl: r.fetchImpl }).start({ system: 'S', tools: [] }).send('hi');
  assert.equal(r.sent[0].body.reasoning_effort, undefined);
  // Ollama uses its own switch, for every setting that is not the model's default.
  for (const [set, want] of [['off', false], ['low', 'low'], ['medium', 'medium']]) {
    r = recorder([{ message: { role: 'assistant', content: 'Ready. What now?' } }]);
    await build({ provider: 'ollama', model: 'm', thinking: set, fetchImpl: r.fetchImpl }).start({ system: 'S', tools: [] }).send('hi');
    assert.equal(r.sent[0].body.think, want, `ollama think for ${set}`);
  }
  r = recorder([{ message: { role: 'assistant', content: 'Ready. What now?' } }]);
  await build({ provider: 'ollama', model: 'm', thinking: 'default', fetchImpl: r.fetchImpl }).start({ system: 'S', tools: [] }).send('hi');
  assert.equal(r.sent[0].body.think, undefined);
});

test('the briefing lists what can be harvested now, and nothing else', () => {
  let s = seated();
  s = apply(s, { type: 'creature.add', creatures: [{ blockId: 'gnaw-swarm', count: 2, band: 'near' }] }, ctx('host', null));
  const [a, b] = Object.keys(s.creatures);
  assert.ok(!/Can be harvested now/.test(briefing(s, scenario, bestiary, {})), 'nothing while both are up');
  s = apply(s, { type: 'damage', target: { kind: 'cre', id: a }, amount: 40 }, ctx('host', null));
  s = apply(s, { type: 'creature.standDown', cid: b }, ctx('host', null));
  const text = briefing(s, scenario, bestiary, {});
  assert.match(text, /Can be harvested now \(destroyed, not yet cut\): Gnaw Swarm A\./);
  assert.ok(!text.includes('Gnaw Swarm B.'), 'a stood-down creature is not offered');
});

test('the briefing carries session zero, and it outranks the page', () => {
  let s = seated();
  assert.ok(!/SESSION ZERO/.test(briefing(s, scenario, bestiary, {})));
  s = apply(s, { type: 'zero.set', pauseWord: 'Slack Water', tone: 'Body horror is in; cruelty to animals is out.' }, ctx('host', null));
  s = apply(s, { type: 'zero.line', text: 'Drowning' }, ctx('player', 'p1'));
  const text = briefing(s, scenario, bestiary, {});
  assert.match(text, /SESSION ZERO \(agreed by the table: this outranks the page\)/);
  assert.match(text, /Body horror is in; cruelty to animals is out\./);
  assert.match(text, /Off the page, never put these in a scene[^\n]*Drowning/);
  assert.match(text, /pause word \(Slack Water\), stop at once/);
});

test('an open Oath is settled kept or broken, and the briefing will not let it be forgotten', () => {
  let s = seated();
  s = apply(s, { type: 'oath.swear', organismId: 'wall', promise: 'I shoulder through before the flap closes', witness: 'the Order II fold' }, ctx('host', null));
  const before = briefing(s, scenario, bestiary, {});
  assert.match(before, /# OATHS STILL OPEN: Bresk[^\n]*shoulder through before the flap closes/);
  assert.match(before, /Oath-breaking is a plot, not a punishment/);
  const boxes = s.organisms.wall.oath;

  // Broken: two Lysis boxes and a scar. The box is not handed back.
  let b = apply(s, { type: 'oath.settle', organismId: 'wall', kept: false, why: 'the Cohort took the lane and left it' }, ctx('host', null));
  assert.equal(b.organisms.wall.countdown, 2);
  assert.ok(b.organisms.wall.conditions.some((c) => c.name === 'Oath-scar'));
  assert.equal(b.organisms.wall.oath, boxes);
  assert.ok(!/# OATHS STILL OPEN/.test(briefing(b, scenario, bestiary, {})));
  assert.match(briefing(b, scenario, bestiary, {}), /Oath BROKEN/);
  assert.throws(() => apply(b, { type: 'oath.settle', organismId: 'wall', kept: true }, ctx('host', null)), /no Oath open/);

  // Kept: the table gains a Cohesion, and nothing is marked.
  const k = apply(s, { type: 'oath.settle', organismId: 'wall', kept: true, why: 'he went through first' }, ctx('host', null));
  assert.equal(k.cohesion, 1);
  assert.equal(k.organisms.wall.countdown, 0);
  assert.match(briefing(k, scenario, bestiary, {}), /Oath kept/);
});

test('the briefing says what the page pays here and nobody has been given, and names creatures not in the scene', () => {
  let s = seated();
  // The Toll-Vent prints 15 Codon for getting inside without an enemy of Order II. Its 1.5 a swarm
  // is paid by the Engine at harvest, so it is not the Director's to pay and is not listed.
  assert.match(briefing(s, scenario, bestiary, {}), /# PRINTED AND NOT YET PAID AT THIS SITE: 15 Codon\./);
  s = apply(s, { type: 'award', codon: 15, why: 'inside without an enemy of Order II' }, ctx('host', null));
  const after = briefing(s, scenario, bestiary, {});
  assert.ok(!/NOT YET PAID/.test(after), 'what has been paid drops off the list');

  // The Danger line names a Fold Sentinel; until it is brought in it cannot act.
  const text = briefing(s, scenario, bestiary, {});
  assert.match(text, /PRINTED HERE BUT NOT YET IN THE SCENE: [^\n]*Fold Sentinel/);
  assert.match(text, /never tell a player they are not/, 'a printed creature is never denied');
  assert.match(text, /A player who attacks one starts the Pulse War: bring it in, then start_pulse_war/);
  const withIt = apply(s, { type: 'creature.add', creatures: [{ blockId: 'fold-sentinel', count: 1, band: 'near' }] }, ctx('host', null));
  assert.ok(!/NOT YET IN THE SCENE[^\n]*Fold Sentinel/.test(briefing(withIt, scenario, bestiary, {})));
});

test('sharing out the harvest: a rotating picking order, take or pass, kept for the game', () => {
  let s = seated();
  for (const [pid, who, hand] of [['p3', 'Ana', 'ledger']]) {
    s = apply(s, { type: 'join', name: who }, ctx('player', pid));
    s = apply(s, { type: 'zero.agree' }, ctx('player', pid));
    s = apply(s, { type: 'claim', organismId: hand }, ctx('player', pid));
  }
  assert.deepEqual(s.loot.order, ['wall', 'eyes', 'ledger'], 'in the order they sat down');
  s = apply(s, { type: 'creature.add', creatures: [{ blockId: 'gnaw-swarm', count: 1, band: 'near' }] }, ctx('host', null));
  const cid = Object.keys(s.creatures)[0];
  s.creatures[cid].down = true;
  s = apply(s, { type: 'harvest', organismId: 'ledger', cid }, ctx('player', 'p3'));
  if (s.requests.length) s = apply(s, { type: 'roll', requestId: s.requests[0].id, dice: Array(s.requests[0].pool.dice).fill(5) }, ctx('player', 'p3'));
  assert.equal(s.loot.queue.length, 4);
  // Only the one offered may choose; the Director never chooses for anyone.
  assert.equal(s.loot.offer.orgId, 'wall');
  assert.throws(() => apply(s, { type: 'loot.take' }, ctx('player', 'p2')), /Bresk of the Sixth Choir's choice/);
  assert.throws(() => apply(s, { type: 'loot.take' }, { ...ctx('host', null), ai: true }), /players choose/);
  // Bresk takes: he goes to the back.
  s = apply(s, { type: 'loot.take' }, ctx('player', 'p1'));
  assert.deepEqual(s.loot.order, ['eyes', 'ledger', 'wall']);
  // Brost passes: he loses his place too, and the same item goes to the next.
  const item = s.loot.offer.itemId;
  s = apply(s, { type: 'loot.pass' }, ctx('player', 'p2'));
  assert.deepEqual(s.loot.order, ['ledger', 'wall', 'eyes']);
  assert.equal(s.loot.offer.itemId, item);
  assert.equal(s.loot.offer.orgId, 'ledger');
  // Everyone passes the same item: it is left in the water.
  s = apply(s, { type: 'loot.pass' }, ctx('player', 'p3'));
  s = apply(s, { type: 'loot.pass' }, ctx('player', 'p1'));
  assert.equal(s.loot.queue.length, 2);
  assert.ok(s.log.some((l) => /left in the water/.test(l.text)));
  assert.notEqual(s.loot.offer.itemId, item);
  // The order is kept, and comes through a new game with the table seated.
  const again = restart(s, scenario, { keepPlayers: true });
  assert.deepEqual(again.loot.order, s.loot.order);
  assert.deepEqual(again.loot.queue, []);
  // The host can set it by hand; the Director cannot.
  const h = apply(s, { type: 'loot.order', order: ['ledger', 'eyes', 'wall'] }, ctx('host', null));
  assert.deepEqual(h.loot.order, ['ledger', 'eyes', 'wall']);
  assert.throws(() => apply(s, { type: 'loot.order', order: ['ledger', 'eyes', 'wall'] }, { ...ctx('host', null), ai: true }), /not the Director's/);
});

test('a standing choice answers in turn: "take every C that comes to me" never takes out of turn', () => {
  let s = seated(); // wall, eyes
  const harvestSwarm = (st) => {
    st = apply(st, { type: 'creature.add', creatures: [{ blockId: 'gnaw-swarm', count: 1, band: 'near' }] }, ctx('host', null));
    const cid = Object.keys(st.creatures).find((k) => !st.creatures[k].down);
    st.creatures[cid].down = true;
    st = apply(st, { type: 'harvest', organismId: 'eyes', cid }, ctx('player', 'p2'));
    if (st.requests.length) st = apply(st, { type: 'roll', requestId: st.requests[0].id, dice: Array(st.requests[0].pool.dice).fill(5) }, ctx('player', 'p2'));
    return st;
  };
  // Bresk: "take it, and every C after". Brost will choose by hand.
  s = harvestSwarm(s); // C C C G, Bresk first
  s = apply(s, { type: 'loot.take', always: true }, ctx('player', 'p1'));
  assert.equal(s.loot.auto.wall.C, 'take');
  // Brost is offered the second C by hand: the standing choice did not jump the queue.
  assert.equal(s.loot.offer.orgId, 'eyes');
  s = apply(s, { type: 'loot.take' }, ctx('player', 'p2'));
  // Third C comes to Bresk and is taken by his standing choice; the G then goes to Brost by hand.
  assert.equal(s.organisms.wall.specimens.C, 2);
  assert.equal(s.loot.offer.orgId, 'eyes');
  assert.equal(s.loot.queue[0].grade, 'G');
  s = apply(s, { type: 'loot.pass' }, ctx('player', 'p2'));
  // Bresk has no rule for G: he is asked.
  assert.equal(s.loot.offer.orgId, 'wall');
  // Everyone passing by standing choice still ends: the item is left in the water.
  s = apply(s, { type: 'loot.auto', grade: 'G', rule: 'pass' }, ctx('player', 'p1'));
  assert.equal(s.loot.offer, null, 'Bresk passed by rule; Brost had passed already; it is left');
  assert.ok(s.log.some((l) => /left in the water/.test(l.text)));
  // A whole harvest with both on standing choices resolves at once, still in rotation.
  s = apply(s, { type: 'loot.auto', grade: 'C', rule: 'take' }, ctx('player', 'p2'));
  s = apply(s, { type: 'loot.auto', grade: 'G', rule: 'take' }, ctx('player', 'p2'));
  const before = { w: s.organisms.wall.specimens.C, e: s.organisms.eyes.specimens.C };
  s = harvestSwarm(s);
  assert.equal(s.loot.offer, null);
  assert.equal(s.organisms.wall.specimens.C - before.w + s.organisms.eyes.specimens.C - before.e, 3);
  assert.ok(Math.abs((s.organisms.wall.specimens.C - before.w) - (s.organisms.eyes.specimens.C - before.e)) <= 1, 'still shared in turn');
  // Cleared, and only the player (or the host) may set it.
  s = apply(s, { type: 'loot.auto', grade: 'C', rule: null }, ctx('player', 'p1'));
  assert.equal(s.loot.auto.wall.C, undefined);
  assert.throws(() => apply(s, { type: 'loot.auto', grade: 'C', rule: 'take' }, { ...ctx('host', null), ai: true }), /players choose/);
});

// ---- faults seen at the table and in the 12 Nov bench run -----------------------

test('the thinking setting and the "thinking right now" flag are different things on the host screen', async () => {
  // Both used to be spelled `thinking` in the same object, so the setting was silently replaced by
  // the busy flag and the host's Thinking buttons always showed "Model default".
  const d = createDirector({ getState: () => seated(), commit: () => {}, scenario, bestiary, rng, saveDir: mkdtempSync(join(tmpdir(), 'oxd-')), onChange: () => {} });
  await d.op({ op: 'config', thinking: 'low' });
  const v = d.view('host');
  assert.equal(v.thinkingLevel, 'low', 'the button the host pressed is the one that comes back lit');
  assert.equal(v.thinking, false, 'the mid-turn flag is not the setting');
});

test('the briefing says there is no Tally Post at the Toll-Vent, and names where the nearest one is', () => {
  const b = briefing(seated(), scenario, bestiary, {});
  assert.match(b, /No Tally Post at this site/);
  assert.match(b, /nearest Tally Post is The Soft Field \(site 2 of 5\)/);
  assert.ok(!/A Tally Post stands here/.test(b), 'no post line where there is no post');
});

test('the briefing says the cut itself pays the printed harvest Codon, so it is never an award', () => {
  // The site's Pays prose names "1.5 Codon each", and twice in the bench the Director tried to
  // pay what the cut had already paid. Wording matters here: this line is read by the model and can
  // be repeated at the table, so it names no machinery (see the briefing sweep).
  const b = briefing(seated(), scenario, bestiary, {});
  assert.match(b, /Paid at the cut, to the whole Cohort: 1.5 Codon for each harvested gnaw swarm; 3 Codon for each harvested fold sentinel/);
  assert.match(b, /the cut itself does the paying/);
  assert.match(b, /Never call award for these amounts/);
  assert.match(b, /Killing one pays nothing/);
});

test('the Director never says how many dice a creature rolls, least of all in a Pulse War', () => {
  // Ruling from Roly, 13 Nov 2026. Inside a fight the bare count used to pass with no flag at all.
  let s = seated();
  s = apply(s, { type: 'creature.add', creatures: [{ blockId: 'gnaw-swarm', count: 1, band: 'mid' }] }, ctx('host', null));
  s = apply(s, { type: 'fight.start' }, ctx('host', null));
  assert.ok(s.fight, 'a Pulse War is running');
  const kinds = (t) => checkNarration(t, s).map((f) => f.kind);
  assert.deepEqual(kinds('It rolls three dice at you. Bresk of the Sixth Choir, what now?'), ['leak']);
  assert.deepEqual(kinds('The swarm rolls 3 dice. Bresk of the Sixth Choir, what do you do?'), ['leak']);
  assert.deepEqual(kinds('Its Membrane Threshold is 12. Bresk of the Sixth Choir, what now?'), ['leak']);
  // The players own their own dice: saying those is not a leak.
  assert.ok(!kinds('You have six dice in the pool, Bresk of the Sixth Choir. What do you spend them on?').includes('leak'));
});

test('a site that prints nothing to cut is told so, instead of being left to try', () => {
  // Bench run of 13 Nov: at the Toll-Vent the Director called harvest with no creature, because
  // the briefing only ever said where a site CAN be cut.
  const b = briefing(seated(), scenario, bestiary, {});
  assert.match(b, /Nothing at this site can be cut for yield/);
  assert.match(b, /harvest is only ever for a destroyed creature/);
  const T = toolbox({ state: seated(), scenario, bestiary, rng, now: 0 });
  T.run('change_site', { site: 'soft-field' });
  const there = briefing(T.state, scenario, bestiary, {});
  assert.match(there, /This site can be cut: the hanging lipid panels/);
  assert.ok(!/Nothing at this site can be cut/.test(there), 'the negative line belongs to sites that print no harvest');
});

test('every creature printed for a site pays the Codon its Bestiary page prints', () => {
  // The Engine pays harvest Codon from the site's harvestPays and `award` refuses any amount the
  // site does not print, so a creature missing from harvestPays simply never gets paid its Codon.
  for (const s of scenario.sites) {
    for (const block of new Set((s.encounter || []).map((x) => x.blockId))) {
      const m = String((bestiary[block] || {}).harvest || '').match(/Codon ([0-9.]+)/);
      if (!m) continue;
      const want = Number(m[1]);
      assert.equal(((s.harvestPays || {})[block] || {}).codon, want,
        `${s.name}: harvesting ${block} must pay the printed ${want} Codon`);
    }
  }
});

test('while a throw is in the air, the briefing holds the beat and the narration is pulled back to it', () => {
  const s = apply(seated(), { type: 'request.check', organismId: 'eyes', baseline: 'OSM', pathway: 'Chemoreception', at: 12, label: 'Taste the outflow' }, ctx('host', null));
  assert.equal(s.requests.length, 1);
  const b = briefing(s, scenario, bestiary, {});
  assert.match(b, /NOTHING HAS BEEN THROWN YET: Brost of the Third Current still has dice in the air/);
  const movedOn = checkNarration('The outflow thickens against your receptors. Bresk of the Sixth Choir, do you push for the gate?', s);
  assert.match((movedOn.find((f) => f.kind === 'style') || {}).text || '', /Puts a new question to Bresk of the Sixth Choir while Brost of the Third Current still has a throw in the air/);
  const held = checkNarration('The outflow thickens against your receptors. Brost, do you let it run over you?', s);
  assert.ok(!held.some((f) => /throw in the air/.test(f.text)), 'a question put to whoever is throwing is not a fault');
});

test('the rewrite for a moved-past throw keeps the question with the thrower', async () => {
  const script = [
    { calls: [['ask_for_roll', { organism: 'eyes', baseline: 'OSM', pathway: 'Chemoreception', threshold: 12, what_for: 'Taste the outflow' }]] },
    { text: 'The current combs across his receptors. Bresk of the Sixth Choir, do you push for the gate?' },
    { text: 'The current combs across his receptors, and the taste is already gathering. Brost, do you let it run over you?' },
  ];
  const m = managed('auto', script);
  await m.d.op({ op: 'config', mode: 'auto', apiKey: 'k' });
  await m.d.op({ op: 'run' });
  await settle(m.d);
  const last = m.d.view('host').last;
  assert.ok(last, 'the turn completed');
  assert.match(last.narration, /Brost, do you let it run over you\?/, 'the draft that moved on was rewritten');
  assert.ok(last.flags.some((f) => /Rewritten once/.test(f.text)), 'the rewrite is noted for the host');
});

test('harvest: naming the site where a creature belongs is a slip, not a refusal', () => {
  // Run 2 of the bench: harvest was called with creature: "soft-field", the site's own id.
  const T = toolbox({ state: seated(), scenario, bestiary, rng, now: 0 });
  T.run('change_site', { site: 'soft-field' });
  const slip = T.run('harvest', { organism: 'eyes', creature: 'soft-field' });
  assert.match(slip.note, /the site, not a creature/);
  assert.equal(slip.refused, undefined, 'a wrong argument shape is not an illegal act');
  assert.equal(T.refusals, 0, 'and it does not count against the gate');
  assert.match(T.run('harvest', { organism: 'eyes', creature: 'no-such-thing' }).refused, /No creature called/);
  const r = T.run('harvest', { organism: 'eyes' });
  assert.ok(!r.refused, 'cutting the site is harvest with no creature');
});

test('hazards are held to the page: the printed Trigger clause and the printed Effect number', () => {
  // The Toll-Vent prints: Trigger: a Kinetic hit, a Strike, Momentum. Effect: 6 Kinetic, Jostled.
  const T = toolbox({ state: seated(), scenario, bestiary, rng, now: 0 });
  assert.match(T.run('hazard_damage', { organism: 'wall', amount: 9, trigger: 'a Strike', why: 'the pocket' }).refused, /does 6 Kinetic, not 9/);
  assert.match(T.run('hazard_damage', { organism: 'wall', amount: 6, trigger: 'the flail swung wide', why: 'the pocket' }).refused, /is not a printed trigger[\s\S]*a Kinetic hit, a Strike, Momentum/);
  assert.match(T.run('hazard_damage', { organism: 'wall', amount: 6, why: 'the pocket' }).refused, /Name what set the hazard off/);
  assert.equal(T.run('hazard_damage', { organism: 'wall', amount: 6, type: 'Kinetic', trigger: 'a Strike', why: 'a Strike under the lip sets the pocket off' }).organism, 'Bresk of the Sixth Choir');
});

test('a hazard may be the Cost of a throw that failed, but never the price of one that landed', () => {
  const failed = toolbox({ state: seated(), scenario, bestiary, rng, now: 0 });
  failed.run('ask_for_roll', { organism: 'eyes', baseline: 'OSM', threshold: 16, what_for: 'Taste the outflow' });
  const q = failed.state.requests[0];
  failed.state = apply(failed.state, { type: 'roll', requestId: q.id, dice: Array(q.pool.dice).fill(1) }, ctx('player', 'p2'));
  assert.equal(failed.state.rolls[failed.state.rolls.length - 1].success, false, 'the stand-in throw misses');
  assert.ok(!failed.run('hazard_damage', { organism: 'eyes', amount: 6, type: 'Kinetic', trigger: 'failed roll', why: 'the Cost: the pocket goes off' }).refused);

  const landed = toolbox({ state: seated(), scenario, bestiary, rng, now: 0 });
  landed.run('ask_for_roll', { organism: 'eyes', baseline: 'OSM', threshold: 12, what_for: 'Taste the outflow' });
  const q2 = landed.state.requests[0];
  landed.state = apply(landed.state, { type: 'roll', requestId: q2.id, dice: Array(q2.pool.dice).fill(6) }, ctx('player', 'p2'));
  assert.match(landed.run('hazard_damage', { organism: 'eyes', amount: 6, trigger: 'failed roll', why: 'the pocket' }).refused, /succeeded[\s\S]*a hazard is not its price/);
});

test('the later rooms answer the Director: what is printed there can be brought and is policed', () => {
  // Nothing has ever been called at the Render Hall in a bench run: every saved gate stops at the
  // arrival line. So the tool layer is checked against the room directly - the creatures the page
  // prints there, the hazard it prices there, and the site policing that keeps another room's
  // creatures out of it.
  const T = toolbox({ state: seated(), scenario, bestiary, rng, now: 0 });
  T.run('change_site', { site: 'soft-field' });
  T.run('change_site', { site: 'render-hall' }); // the cut-lane is the only way into the stomach
  const brought = T.run('bring_creatures', { block: 'cytoplasmic-bleeder', count: 3, band: 'near' });
  assert.equal(brought.refused, undefined, '3 Cytoplasmic Bleeders are printed for the stomach');
  assert.ok(Object.values(T.state.creatures).filter((c) => c.siteId === 'render-hall').length >= 3, 'and they are in the scene');
  assert.match(T.run('bring_creatures', { block: 'gnaw-swarm', count: 1 }).refused, /not printed for The Render Hall[\s\S]*cytoplasmic-bleeder/, 'another room\'s swarm cannot be brought here');
  // 8.3: "Trigger: entering Mid band, or a Strike inside it. Effect: 8 Lytic, -1 soak until repaired."
  assert.match(T.run('hazard_damage', { organism: 'wall', amount: 9, type: 'Lytic', trigger: 'a Strike', why: 'the field' }).refused, /does 8 Lytic, not 9/, 'the field is the page\'s number');
  assert.match(T.run('hazard_damage', { organism: 'wall', amount: 8, type: 'Lytic', trigger: 'Momentum', why: 'the field' }).refused, /not a printed trigger[\s\S]*entering Mid band/, "and the page's trigger, not the Toll-Vent's");
  assert.equal(T.run('hazard_damage', { organism: 'wall', amount: 8, type: 'Lytic', trigger: 'a Strike', why: 'a Strike inside the haze' }).refused, undefined, 'one firing lands');
  assert.match(T.run('hazard_damage', { organism: 'eyes', amount: 8, type: 'Lytic', trigger: 'a Strike', why: 'again' }).refused, /already gone off|not again/, 'and it is one firing per scene outside a Pulse War');
  // The Brood: its own printed encounter can be brought, even though it prints no hazard.
  T.run('change_site', { site: 'brood' });
  assert.equal(T.run('bring_creatures', { block: 'drifter-shoal', count: 3, band: 'mid' }).refused, undefined, 'the shoal is printed here');
});

test('a site that prints no hazard cannot hurt anyone by hazard', () => {
  const T = toolbox({ state: seated(), scenario, bestiary, rng, now: 0 });
  T.state = apply(T.state, { type: 'scene.set', siteId: 'brood' }, ctx('host', null));
  assert.match(T.run('hazard_damage', { organism: 'wall', amount: 6, trigger: 'a Strike', why: 'x' }).refused, /No hazard is printed for The Brood of the Not-Whale/);
});

test('a hazard the page prices for the chamber pays every body in one firing', () => {
  // The Toll-Vent pocket prints "Effect: 6 Kinetic, Jostled, 1 band shift to all in the chamber".
  // Bench 13 Nov, run 3: the Director called it once per player and took three refusals for it.
  const T = toolbox({ state: seated(), scenario, bestiary, rng, now: 0 });
  const first = T.run('hazard_damage', { organism: 'wall', amount: 6, type: 'Kinetic', trigger: 'a Strike', why: 'the pocket lets go under the chamber' });
  assert.equal(first.refused, undefined);
  assert.match((first.also_paid || []).join(' '), /Brost of the Third Current MI 21\/27/, 'the other body at the site was paid in the same firing');
  const again = T.run('hazard_damage', { organism: 'eyes', amount: 6, type: 'Kinetic', trigger: 'a Strike', why: 'the pocket again' });
  assert.match(again.refused, /already gone off in this scene[\s\S]*one call pays every body/);
  assert.equal(T.refusals, 1, 'the second firing is one refusal, not one per body');
});

test('a condition the page prices for the chamber is one set_condition, not one per body', () => {
  // Bench 13 Nov: after the pocket went off, the Director put Jostled on one player at a time.
  // The same Effect clause prices it for the chamber, so one call covers the chamber.
  const T = toolbox({ state: seated(), scenario, bestiary, rng, now: 0 });
  const r = T.run('set_condition', { target: 'wall', condition: 'Jostled', on: true, all_bodies: true });
  assert.equal(r.refused, undefined);
  assert.equal(r.area, true, 'the tool says it was an area call');
  assert.match((r.bodies || []).join(' '), /Bresk of the Sixth Choir: Jostled/, 'the body it was named for');
  assert.match((r.bodies || []).join(' '), /Brost of the Third Current: Jostled/, 'and the other one, in the same call');
  assert.equal(T.refusals, 0, 'one call, nothing refused');
  assert.equal(T.state.organisms.wall.conditions.filter((c) => c.name === 'Jostled').length, 1, 'no body is double-stacked');
  // The same call lifts it off the chamber, and says so in terms the Director can read out.
  const off = T.run('set_condition', { target: 'wall', condition: 'Jostled', on: false, all_bodies: true });
  assert.match((off.bodies || []).join(' '), /Brost of the Third Current: clear/);
  assert.equal(T.state.organisms.eyes.conditions.filter((c) => c.name === 'Jostled').length, 0);
  // And it is the page's doing, not a rule the Director chose: only the Toll-Vent prices a
  // condition in its Hazard note, and its Counter clause ("Brace and ride it") is not a price.
  assert.deepEqual(hazardSpec(scenario.sites.find((x) => x.id === 'toll-vent')).conditions, ['Jostled']);
  assert.deepEqual(hazardSpec(scenario.sites.find((x) => x.id === 'soft-field')).conditions, [], 'the slough prints damage and Drift, no condition');
  // The same clause throws: "1 band shift to all in the chamber" at the Toll-Vent, "2-band shift" on
  // the Gut Stone's Render Charge, and nothing at all for the slough patches.
  assert.equal(hazardSpec(scenario.sites.find((x) => x.id === 'toll-vent')).bands, 1);
  assert.equal(hazardSpec(scenario.sites.find((x) => x.id === 'gut-stone')).bands, 2, 'the charge throws twice as far');
  assert.equal(hazardSpec(scenario.sites.find((x) => x.id === 'soft-field')).bands, 0, 'standing ground is not a blast');
  // A body name that matches nothing still points at the area form rather than a dead end.
  const solo = toolbox({ state: seated(), scenario, bestiary, rng, now: 0 });
  assert.match(solo.run('set_condition', { target: 'no-one-here', condition: 'Jostled', on: true }).refused, /set all_bodies/);
});

test('the briefing tells the Director the hazard pays Jostled with the firing', () => {
  const text = briefing(seated(), scenario, bestiary, {});
  assert.match(text, /ALSO PRICES JOSTLED/, 'the site that prints it says so');
  assert.match(text, /hazard_damage puts it on every body at the site/);
  assert.ok(!/briefing|the notes|the Engine|\bthe Ledger\b/.test(text.split('ALSO PRICES')[1].split('\n')[0]), 'and the line itself is in words the table may hear');
  const away = apply(seated(), { type: 'scene.set', siteId: 'soft-field' }, ctx('host', null));
  assert.ok(!/ALSO PRICES/.test(briefing(away, scenario, bestiary, {})), 'and a site that prints no condition says nothing');
});

test('a hazard pays the condition its own Effect clause prints, on every body it hurts', () => {
  // The 13 Nov gate, run 3: the pocket went off a second time (a fresh Cycle in a Pulse War) with no
  // set_condition after it, so the printed Jostled never landed and no flag existed to notice.
  const T = toolbox({ state: seated(), scenario, bestiary, rng, now: 0 });
  const first = T.run('hazard_damage', { organism: 'wall', amount: 6, type: 'Kinetic', trigger: 'a Strike', why: 'the pocket lets go under the chamber' });
  assert.equal(first.refused, undefined);
  assert.match((first.also_set || []).join(' '), /Jostled on every body at the site/, 'the tool says what else the firing paid');
  for (const id of ['wall', 'eyes']) {
    const o = T.state.organisms[id];
    assert.ok(o.mi < o.miMax, `${o.name} took the printed 6 Kinetic`);
    assert.ok(o.conditions.some((c) => c.name === 'Jostled'), `${o.name} carries the Jostled from the same clause, with no second call`);
  }
  assert.equal(T.refusals, 0, 'one firing, one price, nothing refused');

  // And a second firing in a new Cycle pays it again, which is where run 3 lost it.
  let s = apply(seated(), { type: 'fight.start', creatures: [{ blockId: 'gnaw-swarm', count: 1, band: 'near' }], ownDice: { wall: 6, eyes: 6, 'Order I: Lytic Swarms': 1 } }, ctx('host', null));
  const F = toolbox({ state: s, scenario, bestiary, rng, now: 0 });
  assert.equal(F.run('hazard_damage', { organism: 'wall', amount: 6, type: 'Kinetic', trigger: 'Momentum', why: 'the pocket, Cycle 1' }).refused, undefined);
  F.state = apply(F.state, { type: 'cycle.end' }, ctx('host', null));
  assert.equal(F.run('hazard_damage', { organism: 'eyes', amount: 6, type: 'Kinetic', trigger: 'Momentum', why: 'the pocket, Cycle 2' }).refused, undefined, 'a new Cycle re-arms the detonation');
  for (const id of ['wall', 'eyes']) {
    assert.ok(F.state.organisms[id].conditions.some((c) => c.name === 'Jostled'), `${F.state.organisms[id].name} is Jostled by the second firing too`);
  }
  assert.equal(F.refusals, 0);
});

test('nothing we say to the Director teaches it the words we then flag at the table', () => {
  // 13 Nov gate, run 1's single leak: the Director told the players "Next briefing will carry the Soft
  // Field", which is the change_site description quoted back. The guard cannot fix a vocabulary we
  // supply ourselves, so the schema and the refusals are held to the same rule as the narration.
  const T = toolbox({ state: seated(), scenario, bestiary, rng, now: 0 });
  const heard = [];
  for (const [name, args] of [
    ['harvest', { organism: 'nope' }],
    ['harvest', { organism: 'eyes', creature: 'nope' }],
    ['ask_for_roll', { organism: 'nope', baseline: 'OSM', threshold: 12, what_for: 'x' }],
    ['creature_strike', { creature: 'nope', target: 'wall' }],
    ['creature_stand_down', { creature: 'nope', why: 'x' }],
    ['hazard_damage', { organism: 'nope', amount: 6, trigger: 'a Strike', why: 'x' }],
    ['hazard_damage', { organism: 'wall', amount: 6, trigger: 'the flail', why: 'x' }],
    ['set_condition', { target: 'nope', condition: 'Jostled', on: true }],
    ['award', { why: 'A swarm given water and gone', codon: 1.5, organisms: ['wall'] }],
    ['award', { why: 'Finding the stamp', codon: 5, organisms: ['wall'] }],
    ['change_site', { site: 'soft-field' }],
    ['change_site', { site: 'nope' }],
    ['move_clock', { clock: 'TOLL', change: 1, why: 'x' }],
  ]) {
    const r = T.run(name, args);
    // Only what the model is told, not the name of the thing it called: the tool names themselves
    // are in MACHINERY, and prefixing them here would flag our own test.
    for (const k of ['refused', 'note']) if (r[k]) heard.push([name, r[k]]);
  }
  assert.ok(heard.length >= 8, 'the sweep actually reached the refusal paths');
  for (const [name, line] of heard) assert.ok(!MACHINERY.test(line), `${name} would teach a leak: ${line}`);
  // The schema, too: every description the model reads before it speaks.
  for (const t of TOOLS) {
    const words = [t.description, ...Object.values(t.parameters.properties).flatMap((p) => [p.description, p.items && p.items.description].filter(Boolean))];
    for (const d of words) assert.ok(!MACHINERY.test(String(d)), `${t.name}: "${d}" names the machinery`);
  }
});

test('the briefing we write about this site holds to the same rule as the narration', () => {
  // The leaks the gate has caught are all sentences of ours: "Next briefing will carry the Soft
  // Field" was the change_site description quoted back at the players. The tool strings are swept
  // above; the briefing is the biggest block of our own prose the model reads, so its lines are
  // swept here — across the branches that only show up mid-scene, where a stale sentence hides.
  const sweep = (text, label) => {
    for (const line of text.split('\n')) assert.ok(!BRIEFING_LEAK.test(line), `${label}: the briefing would teach a leak — ${line}`);
  };

  sweep(briefing(seated(), scenario, bestiary, {}), 'the Toll-Vent: no post, nothing paid');
  sweep(briefing(apply(seated(), { type: 'scene.set', siteId: 'soft-field' }, ctx('host')), scenario, bestiary, {}), 'the Soft Field: post, priced choice, creatures printed but not in the scene');

  // A Pulse War with the hazard already spent: the ALL-CAPS condition line, the budget line, the
  // acting-creature lines and the log block at the bottom.
  const war = apply(seated(), { type: 'fight.start', creatures: [{ blockId: 'gnaw-swarm', count: 1, band: 'near' }], ownDice: { wall: 6, eyes: 6, 'Order I: Lytic Swarms': 1 } }, ctx('host', null));
  const H = toolbox({ state: war, scenario, bestiary, rng, now: 0 });
  H.run('hazard_damage', { organism: 'wall', amount: 6, type: 'Kinetic', trigger: 'Momentum', why: 'the pocket' });
  H.state = apply(H.state, { type: 'fight.end' }, ctx('host', null));
  sweep(briefing(H.state, scenario, bestiary, {}), 'a spent hazard and a closed fight');

  // A body down and uncut, which is where the harvest invitation is written.
  const D = toolbox({ state: apply(seated(), { type: 'creature.add', creatures: [{ blockId: 'gnaw-swarm', count: 1, band: 'near' }] }, ctx('host', null)), scenario, bestiary, rng, now: 0 });
  D.state.creatures[Object.keys(D.state.creatures)[0]].down = true;
  sweep(briefing(D.state, scenario, bestiary, {}), 'a destroyed creature');

  // A site cut, the sharing queue with a player offered, and a printed reward paid at this site.
  const A = toolbox({ state: apply(seated(), { type: 'scene.set', siteId: 'soft-field' }, ctx('host')), scenario, bestiary, rng, now: 0 });
  A.run('harvest', { organism: 'eyes' });
  for (const q of [...A.state.requests]) {
    A.state = apply(A.state, { type: 'roll', requestId: q.id, dice: Array(q.pool.dice).fill(6) }, ctx('player', 'p2'));
  }
  if (A.state.loot && A.state.loot.offer) sweep(briefing(A.state, scenario, bestiary, {}), 'the harvest going round the Cohort');
  A.state = shareAll(A.state);
  A.run('award', { why: 'a clean crossing', codon: 20, organisms: ['eyes'] });
  sweep(briefing(A.state, scenario, bestiary, {}), 'already paid at this site');

  // The memory blocks, a host note and the reason the turn was called.
  sweep(briefing(seated(), scenario, bestiary, { reason: 'the table answered', hostNote: 'Keep it quiet.', chapters: [{ site: 'The Toll-Vent', text: 'The Cohort got in under a promise.' }] }), 'chronicle, host note and reason');
});

test('the Engine budgets a hazard per Cycle inside a Pulse War, and per scene outside one', () => {
  let s = apply(seated(), { type: 'fight.start', creatures: [{ blockId: 'gnaw-swarm', count: 1, band: 'near' }], ownDice: { wall: 6, eyes: 6, 'Order I: Lytic Swarms': 1 } }, ctx('host', null));
  const T = toolbox({ state: s, scenario, bestiary, rng, now: 0 });
  assert.equal(T.run('hazard_damage', { organism: 'wall', amount: 6, type: 'Kinetic', trigger: 'Momentum', why: 'the pocket' }).refused, undefined, 'Cycle 1 pays');
  assert.match(T.run('hazard_damage', { organism: 'eyes', amount: 6, type: 'Kinetic', trigger: 'Momentum', why: 'the pocket again' }).refused, /already gone off in Cycle 1/);
  T.state = apply(T.state, { type: 'cycle.end' }, ctx('host', null));
  assert.equal(T.run('hazard_damage', { organism: 'wall', amount: 6, type: 'Kinetic', trigger: 'a Strike', why: 'the pocket, next Cycle' }).refused, undefined, 'a new Cycle re-arms it');
  // And outside a fight it waits for a new scene.
  T.state = apply(T.state, { type: 'fight.end' }, ctx('host', null));
  T.state = apply(T.state, { type: 'scene.set', siteId: 'soft-field' }, ctx('host', null));
  assert.equal(hazardBudget(T.state, 'toll-vent').open, true, 'leaving the Toll-Vent spends nothing that has to be re-armed');
});

test('a hazard note that prints no "Effect:" clause is still held to its page number and its Clock', () => {
  // 8.2's slough patches: "at CARCASS 3+, 1 Lytic damage per Cycle" — no Effect: label, and the
  // damage waits for the Clock. The Engine checked nothing here before (bench 13 Nov).
  const T = toolbox({ state: seated(), scenario, bestiary, rng, now: 0 });
  T.state = apply(T.state, { type: 'scene.set', siteId: 'soft-field' }, ctx('host', null));
  assert.match(T.run('hazard_damage', { organism: 'eyes', amount: 4, type: 'Lytic', trigger: 'standing in the slough', why: 'the patch' }).refused, /does 1 Lytic, not 4/);
  assert.match(T.run('hazard_damage', { organism: 'eyes', amount: 1, type: 'Lytic', trigger: 'standing in the slough', why: 'the patch' }).refused, /fires this hazard at CARCASS 3, and CARCASS is at 0/);
  T.state = apply(T.state, { type: 'clock', id: 'CARCASS', delta: 3 }, ctx('host', null));
  const paid = T.run('hazard_damage', { organism: 'eyes', amount: 1, type: 'Lytic', trigger: 'standing in the slough', why: 'the patch' });
  assert.equal(paid.refused, undefined, 'once the Clock reaches what the page prints, it hurts');
  assert.match(paid.spent, /spent until the scene changes/);
});

test('the Render Charge at the Gut Stone is the printed 20 Kinetic and waits for TOLL 5', () => {
  // 8.5 prints it with no "Effect:" clause: "on a Clock, fires at TOLL 5. 20 Kinetic, 2-band
  // shift, the carcass ends." Before this the Engine checked nothing at this site.
  const T = toolbox({ state: seated(), scenario, bestiary, rng, now: 0 });
  T.state = apply(T.state, { type: 'scene.set', siteId: 'gut-stone' }, ctx('host', null));
  assert.match(T.run('hazard_damage', { organism: 'eyes', amount: 6, type: 'Kinetic', trigger: 'the charge fires', why: 'the schedule' }).refused, /does 20 Kinetic, not 6/);
  assert.match(T.run('hazard_damage', { organism: 'eyes', amount: 20, type: 'Kinetic', trigger: 'the charge fires', why: 'the schedule' }).refused, /fires this hazard at TOLL 5, and TOLL is at 0/);
  T.state = apply(T.state, { type: 'clock', id: 'TOLL', delta: 5 }, ctx('host', null));
  const r = T.run('hazard_damage', { organism: 'eyes', amount: 20, type: 'Kinetic', trigger: 'the charge fires', why: 'the Render Charge' });
  assert.equal(r.refused, undefined, 'at TOLL 5 the page lets it go off');
  assert.ok(r.mi.split('/')[0] < 27, `20 Kinetic through the Eyes: MI ${r.mi}`);
});

test('naming the Engine or the Ledger is a leak; saying "the page prints nothing for that" is not', () => {
  // Roly's ruling, 13 Nov, on the four leak flags those three runs produced. Every sentence here is
  // quoted from the bench transcript, including the Tally Post's own physical ledger, which is a
  // thing in the world and must not be mistaken for the Engine.
  const s = seated();
  const kinds = (t) => checkNarration(t, s, { moved: true }).map((f) => f.kind);
  assert.ok(kinds('Neither, in numbers. The Ledger keeps the rest to itself, and it stays kept.').includes('leak'));
  assert.ok(kinds('You did exactly that before the flap closed, and the Engine has it written as kept.').includes('leak'));
  assert.deepEqual(kinds('The page has nothing printed for buying a harpoon gun: there is no seller at the Toll-Vent. Ilm, what do you do?'), []);
  assert.deepEqual(kinds("The Ledger's stylus hovers over the cradle, and unstamped this cut is worth nothing outside. Ilm, what do you do?"), []);
});

test('narration about damage the Engine never paid is flagged, and paid damage is not', () => {
  // Bench 13 Nov, run 2: the pocket was described going off a second time — "six kinetic punch
  // back up through Bresk's leading membrane" — with no tool behind it. The table heard a
  // number that never happened.
  const s = seated();
  const flags = checkNarration('Six kinetic punch back up through Bresk, and the pocket lets go again.', s, { moved: false, since: s.seq });
  assert.ok(flags.some((f) => f.kind === 'rule' && /damage the Engine never paid/.test(f.text)), JSON.stringify(flags));
  const paid = apply(s, { type: 'damage', target: { kind: 'org', id: 'wall' }, amount: 6, dtype: 'Kinetic' }, ctx('host', null));
  assert.ok(!checkNarration('Six kinetic punch back up through Bresk.', paid, { moved: false, since: s.seq }).some((f) => f.kind === 'rule'), 'a tool paid for this one');
});

test('a Clock named as moving in narration is checked against what the page paid for', () => {
  // 13 Nov afternoon gate, run 2: "the noise of it is being counted: HUNGER moves a segment for a
  // fight this loud". HUNGER sat at 0. §3.3 does print that row, so the fix is in two places: the
  // Ledger pays it (see ledger.test.js), and the narration is checked for a Clock nothing moved.
  const s = seated();
  const flags = checkNarration('Somewhere behind you the noise is being counted: HUNGER moves a segment for a fight this loud. Bresk, what do you do?', s, { moved: false, since: s.seq });
  assert.ok(flags.some((f) => f.kind === 'rule' && /^Names HUNGER/.test(f.text)), JSON.stringify(flags));

  // Naming a Clock the page just moved is §3.4's instruction, not a fault.
  const T = toolbox({ state: s, scenario, bestiary, rng, now: 0 });
  T.run('move_clock', { clock: 'TOLL', change: 1, why: 'a Pulse War in the open' });
  const paid = checkNarration('TOLL moves to one: the channels are loud, and the drones have stopped moving. Bresk, what do you do?', T.state, { moved: false, since: s.seq });
  assert.ok(!paid.some((f) => /^Names TOLL/.test(f.text)), JSON.stringify(paid));
  // A beat later is still faithful: the window is recent log lines, not only this turn, or every
  // restatement of a paid Clock would burn a rewrite.
  assert.ok(!checkNarration('TOLL moves to one, and the queue has gone quiet. Bresk, what do you do?', T.state, { moved: false, since: T.state.seq }).some((f) => /^Names TOLL/.test(f.text)), 'the next turn may name a Clock the page already moved');

  // No claim that it moved, no flag — and a lowercase "toll" in prose is the board, not the Clock.
  assert.ok(!checkNarration('The toll board hangs above an empty queue, and CARCASS is at two of six. Bresk, what do you do?', s, { moved: false, since: s.seq }).some((f) => /^Names /.test(f.text)));
});

test('outside a Pulse War the briefing says no creature acts on a turn', () => {
  // Run 2 of the 13 Nov afternoon gate called creature_move with no fight running and was refused;
  // nothing we said to the model had told it that was coming.
  const b = briefing(seated(), scenario, bestiary, {});
  assert.match(b, /NO PULSE WAR[\s\S]{0,500}creature_move/);
  const T = toolbox({ state: seated(), scenario, bestiary, rng, now: 0 });
  T.run('bring_creatures', { block: 'gnaw-swarm', count: 1, band: 'near' });
  const cid = Object.keys(T.state.creatures)[0];
  assert.match(String(T.run('creature_move', { creature: cid, band: 'mid' }).refused), /no Pulse War/i);
});

test('standing a creature down twice is a note, not a refusal', () => {
  // Run 2's third refusal: the model restated a swarm it had already stood down and was told no.
  let s = apply(seated(), { type: 'creature.add', creatures: [{ blockId: 'gnaw-swarm', count: 1, band: 'near' }] }, ctx('host', null));
  s = apply(s, { type: 'fight.start', ownDice: { wall: 6, eyes: 6, 'Order I: Lytic Swarms': 1 } }, ctx('host', null));
  const cid = Object.keys(s.creatures)[0];
  const T = toolbox({ state: s, scenario, bestiary, rng, now: 0 });
  const first = T.run('creature_stand_down', { creature: cid, why: 'it was never fighting' });
  assert.equal(first.refused, undefined, JSON.stringify(first));
  assert.ok(first.stood_down, 'it stands down');
  const again = T.run('creature_stand_down', { creature: cid, why: 'it was never fighting' });
  assert.equal(again.refused, undefined, 'restating it is not a rule break');
  assert.match(String(again.note), /already stood down/);
  assert.equal(T.refusals, 0, 'and the gate does not count it against the run');
});

test('while a throw is in the air, a beat that only holds it needs no question', () => {
  const s = apply(seated(), { type: 'request.check', organismId: 'eyes', baseline: 'OSM', at: 12, label: 'Taste the outflow' }, ctx('host', null));
  assert.deepEqual(checkNarration('Hold still on the cut, Brost. Nothing else moves until it lands.', s), []);
  assert.deepEqual(checkNarration('The current slackens and the lane waits.', seated()).map((f) => f.kind), ['style'], 'with nobody waiting, one question is still required');
});

// ---- Bench of 14 Nov (thinking low, four runs): what the checks and tools got wrong ----
test('14 Nov: a clerk\'s quoted question is not the Director\'s, but two real questions are', () => {
  const s = seated();
  const st = (t) => checkNarration(t, s).filter((f) => f.kind === 'style').map((f) => f.text);
  assert.deepEqual(st('The clerk sets down its stylus. "You want stamped, or you want to talk?" Its tone says it suspects both.\n\nBrost, what do you say to the clerk?'), []);
  assert.deepEqual(st('The drone looks up. "Escort pays or vouches. Which is it?"\n\nBresk, what do you put down?'), []);
  assert.ok(st('Do you step to the plate with paper? Or do you finish what Bresk started?').some((t) => /^Asks 2 questions/.test(t)));
  // A question that is only ever spoken aloud does not end the beat on a question to the table.
  assert.ok(st('The clerk says, "Well, which is it?" and waits.').some((t) => /^Does not end/.test(t)));
});

test('14 Nov: a Clock\'s segment is not a creature\'s health track, and "tool" is a word in the fiction', () => {
  const f = apply(seated(), { type: 'fight.start', creatures: [{ blockId: 'gnaw-swarm', count: 1, band: 'near' }] }, ctx('host', null));
  const leaks = (t) => checkNarration(t, f).filter((x) => x.kind === 'leak').map((x) => x.text);
  assert.deepEqual(leaks('The claw pulls the sheet free. CARCASS ticks forward one segment. Brost, what do you do?'), []);
  assert.deepEqual(leaks('Your Needle Dagger is fine and silent, maybe the better tool here. What do you do?'), []);
  assert.ok(leaks('It has six slow segments apiece. Brost, what do you do?').length === 1);
  assert.ok(leaks('The tool call returned a refusal. Brost, what do you do?').length === 1);
});

test('14 Nov: a paragraph repeated word for word after a different roll is flagged', () => {
  const s = seated();
  const line = 'The blade carves in twice more and the mite\'s membrane pre-flexes both times, that held-back tension catching the edge and shoving it off-course like a stone skipping off water.';
  const withStory = { ...s, story: [{ kind: 'narration', text: line, id: 's1' }] };
  const kinds = (t, st) => checkNarration(t, st).filter((f) => f.kind === 'style').map((f) => f.text);
  assert.ok(kinds(`${line} Vash, what now?`, withStory).some((t) => /^Repeats/.test(t)));
  assert.ok(!kinds('The edge finds a seam this time and the water around the mite clouds with its own milk. Vash, what now?', withStory).some((t) => /^Repeats/.test(t)));
});

test('14 Nov: out-of-turn creature calls say who is up, and ending a turn it is not taking is a note', () => {
  let s = seated();
  s = apply(s, { type: 'fight.start', creatures: [{ blockId: 'gnaw-swarm', count: 1, band: 'near' }] }, ctx('host', null));
  const T = toolbox({ state: s, scenario, bestiary, rng });
  const cid = Object.keys(T.state.creatures)[0];
  const cur = T.state.fight.actors[T.state.fight.turn];
  if (cur.kind === 'cre') assert.ok(!T.run('end_creature_turn', { creature: cid }).refused); // its turn is over: now it waits
  const r = T.run('creature_move', { creature: cid, band: 'mid' });
  assert.match(r.refused, /not .* turn[\s\S]*Acting now:/);
  const e = T.run('end_creature_turn', { creature: cid });
  assert.ok(!e.refused && /no turn to end/.test(e.note), 'ending a turn it is not taking is a note');
});
