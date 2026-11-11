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
