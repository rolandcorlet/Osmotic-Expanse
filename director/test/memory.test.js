// The table's memory: the transcript, search, the cast, the chronicle, and how the Director uses them.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { newSession, apply, viewFor } from '../engine/ledger.js';
import { makeRng } from '../engine/dice.js';
import { scenario } from '../data/first-carve.js';
import { createMemory, tokens } from '../brain/memory.js';
import { parseChronicle, plainChapter } from '../brain/chronicle.js';
import { briefing } from '../brain/director.js';
import { toolbox, TOOLS } from '../brain/tools.js';
import { createDirector } from '../brain/manager.js';

const bestiary = JSON.parse(readFileSync(new URL('../data/bestiary.json', import.meta.url), 'utf8'));
const rng = makeRng(5);
const ctx = (role, pid, ai = false) => ({ role, pid, rng, now: Date.parse('2026-11-12T09:00:00Z'), scenario, bestiary, ai });

function seated() {
  let s = newSession(scenario);
  for (const [pid, name, org] of [['p1', 'Roly', 'wall'], ['p2', 'Sam', 'eyes']]) {
    s = apply(s, { type: 'join', name }, ctx('player', pid));
    s = apply(s, { type: 'zero.agree' }, ctx('player', pid));
    s = apply(s, { type: 'claim', organismId: org }, ctx('player', pid));
  }
  return s;
}

// Play a few lines through a memory store, the way the server does.
function played() {
  const mem = createMemory({ dir: mkdtempSync(join(tmpdir(), 'oxm-')) });
  let s = seated();
  mem.observe(null, s);
  const step = (a, role = 'host', pid = null) => { const n = apply(s, a, ctx(role, pid)); mem.observe(s, n); s = n; return s; };
  step({ type: 'say', text: 'I ask the drone clerk what it costs to get in.' }, 'player', 'p1');
  step({ type: 'narrate', text: 'The drone clerk, a folded thing called Nine-Folds, reads the manifest and names the toll: two Specimens a body, or a witnessed promise.' });
  step({ type: 'say', text: 'We promise. Witnessed and filed.' }, 'player', 'p1');
  step({ type: 'narrate', text: 'Nine-Folds files the oath and mutters that Neth still owes the post for the first crew.' });
  return { mem, get s() { return s; }, step };
}

test('the transcript keeps every line, and search finds what was said', () => {
  const t = played();
  const r = t.mem.search(t.s.gameId, 'what did the clerk say about the toll');
  assert.ok(r.hits.length >= 1);
  assert.match(r.hits[0].text, /drone clerk|Nine-Folds/);
  assert.equal(r.hits[0].site, 'toll-vent');
  // Stemming: "promised" finds "promise".
  assert.ok(t.mem.search(t.s.gameId, 'promised').hits.some((h) => /promise/i.test(h.text)));
  assert.deepEqual(tokens('The drones were harvesting'), ['dron', 'harvest']);
  assert.deepEqual(tokens('promised'), tokens('promise'));
});

test('answering a player: only what the table was told comes back', () => {
  const t = played();
  t.step({ type: 'request.check', organismId: 'wall', label: 'Shove the clerk', baseline: 'VSC', at: 12 });
  t.step({ type: 'roll', requestId: t.s.requests[0].id }, 'player', 'p1');
  assert.ok(t.mem.search(t.s.gameId, 'shove clerk').hits.some((h) => h.kind === 'roll'), 'the host can find the roll');
  t.step({ type: 'cast.remember', name: 'Nine-Folds', kind: 'person', fact: 'Secretly a client of Neth', seen: false });
  t.step({ type: 'cast.remember', name: 'Nine-Folds', kind: 'person', fact: 'Runs the drone customs post' });
  const host = t.mem.search(t.s.gameId, 'Nine-Folds Neth client', { cast: t.s.cast });
  const players = t.mem.search(t.s.gameId, 'Nine-Folds Neth client', { cast: t.s.cast, forPlayers: true });
  assert.ok(host.hits.some((h) => /Secretly a client of Neth/.test(h.text)));
  assert.ok(!players.hits.some((h) => /Secretly/.test(h.text)), 'a fact the players were not told stays with the host');
  assert.ok(players.hits.some((h) => /Runs the drone customs post/.test(h.text)));
  assert.ok(!players.hits.some((h) => h.kind === 'roll' || h.kind === 'event'), 'no dice and no Engine records for players');
});

test('an Undo takes lines back; the Ledger trimming old lines does not', () => {
  const t = played();
  const before = t.s;
  const after = apply(before, { type: 'narrate', text: 'The clerk tears up the oath in front of everyone.' }, ctx('host', null));
  t.mem.observe(before, after);
  assert.equal(t.mem.search(after.gameId, 'tears').hits.length, 1);
  // Undo: the server restores the old Ledger and tells memory where it stood.
  t.mem.observe(after, { ...before, seq: after.seq + 1 }, { undoneAfter: before.seq });
  assert.equal(t.mem.search(after.gameId, 'tears').hits.length, 0, 'an undone line is gone from search');
  // The same store reopened from disk agrees.
  assert.ok(t.mem.size(after.gameId).lines > 4);
});

test('the history is per game and on disk', () => {
  const dir = mkdtempSync(join(tmpdir(), 'oxm-'));
  const mem = createMemory({ dir });
  let s = seated();
  mem.observe(null, s);
  const n = apply(s, { type: 'narrate', text: 'The lip of the wound is warm as breath.' }, ctx('host', null));
  mem.observe(s, n);
  assert.ok(existsSync(join(dir, s.gameId, 'transcript.jsonl')));
  const again = createMemory({ dir });
  assert.equal(again.search(s.gameId, 'wound lip breath').hits.length, 1, 'read back from disk');
  const other = newSession(scenario);
  assert.notEqual(other.gameId, s.gameId);
  assert.equal(again.search(other.gameId, 'wound lip').hits.length, 0, 'another game starts empty');
});

test('the cast: cards by name, origin, facts, and never on a player screen', () => {
  let s = seated();
  s = apply(s, { type: 'cast.remember', name: 'Neth', kind: 'person', fact: 'Voided the first crew\'s claim' }, ctx('host', null, true));
  s = apply(s, { type: 'cast.remember', name: 'Ossa the cutter', kind: 'person', fact: 'Offered Bresk a job' }, ctx('host', null, true));
  s = apply(s, { type: 'cast.remember', name: 'the drone clerk', fact: 'Asked for two Specimens' }, ctx('host', null));
  s = apply(s, { type: 'cast.remember', name: 'The Drone Clerk', fact: 'Asked for two Specimens' }, ctx('host', null));
  const cards = Object.values(s.cast);
  const by = (n) => cards.find((c) => c.name.toLowerCase().includes(n));
  assert.equal(by('neth').origin, 'page', 'printed in the Vector');
  assert.equal(by('ossa').origin, 'improvised', 'the Director made it up');
  assert.equal(by('drone clerk').origin, 'table', 'the host wrote it down');
  assert.equal(by('drone clerk').facts.length, 1, 'same name, same card, no repeated fact');
  assert.equal(viewFor(s, 'player', 'p1').cast, undefined);
  assert.equal(viewFor(s, 'table').cast, undefined);
  s = apply(s, { type: 'cast.forget', id: by('ossa').id }, ctx('host', null));
  assert.ok(!Object.values(s.cast).some((c) => /Ossa/.test(c.name)));
  // Only the host decides how far the Director may go.
  assert.throws(() => apply(s, { type: 'improv.set', improv: 'page' }, ctx('host', null, true)), /Only the host/);
  assert.throws(() => apply(s, { type: 'improv.set', improv: 'adlib' }, ctx('host', null)), /not built yet/);
  assert.equal(apply(s, { type: 'improv.set', improv: 'page' }, ctx('host', null)).improv, 'page');
});

test('the briefing carries the chronicle and the cast, and the callback rule', () => {
  let s = seated();
  s = apply(s, { type: 'cast.remember', name: 'Nine-Folds', kind: 'person', fact: 'Filed Bresk\'s oath' }, ctx('host', null));
  s = apply(s, { type: 'cast.remember', name: 'Nine-Folds', fact: 'Owed by Neth', seen: false }, ctx('host', null));
  const text = briefing(s, scenario, bestiary, { chapters: [{ site: 'The Toll-Vent', why: 'left', text: 'The Cohort swore its way past the drones.' }] });
  assert.match(text, /# EARLIER IN THIS GAME[^\n]*\n- The Toll-Vent: The Cohort swore its way past the drones\./);
  assert.match(text, /# PEOPLE, PLACES AND THREADS THE TABLE HAS MET \(1 on record/);
  assert.match(text, /Nine-Folds \(person[^\n]*Filed Bresk's oath; Owed by Neth \[players not told\]/);
  assert.match(text, /They are people, not encounters/);
  const page = briefing(apply(s, { type: 'improv.set', improv: 'page' }, ctx('host', null)), scenario, bestiary, {});
  assert.match(page, /kept this game on the page/);
  assert.ok(!/EARLIER IN THIS GAME/.test(briefing(seated(), scenario, bestiary, {})), 'nothing is sent when there is nothing');
});

test('the recall and remember tools', () => {
  const t = played();
  const mem = { chapters: [], search: (q, o = {}) => t.mem.search(t.s.gameId, q, { ...o, cast: T.state.cast }) };
  const T = toolbox({ state: t.s, scenario, bestiary, rng, now: 0, memory: mem });
  const tool = (n) => TOOLS.find((x) => x.name === n);
  const r = tool('recall').run({ query: 'Nine-Folds Neth', for_players: true }, T);
  assert.ok(r.hits.some((h) => /Neth still owes/.test(h.text)));
  const none = tool('recall').run({ query: 'harpoon merchant' }, T);
  assert.match(none.note, /Do not invent it/);
  const m = tool('remember').run({ name: 'Nine-Folds', kind: 'person', fact: 'Holds a grudge against Neth' }, T);
  assert.equal(m.remembered, true);
  assert.equal(m.card.origin, 'page', 'Nine-Folds is printed in the Vector');
  assert.ok(Object.values(T.state.cast).some((c) => c.facts.some((f) => /grudge/.test(f.text))));
  // Without a store, recall says so rather than failing.
  const bare = toolbox({ state: t.s, scenario, bestiary, rng, now: 0 });
  assert.match(tool('recall').run({ query: 'anything' }, bare).note, /no history/);
});

test('a chronicle reply is read; a plain chapter is written without a model', () => {
  const p = parseChronicle('CHAPTER:\nThe Cohort paid the toll with a promise.\nCAST:\n```json\n[{"name":"Nine-Folds","kind":"person","fact":"Filed the oath"}]\n```');
  assert.equal(p.chapter, 'The Cohort paid the toll with a promise.');
  assert.deepEqual(p.cast, [{ name: 'Nine-Folds', kind: 'person', fact: 'Filed the oath' }]);
  assert.deepEqual(parseChronicle('CHAPTER: Just a paragraph.\nCAST: not json').cast, []);
  const plain = plainChapter({ siteName: 'The Toll-Vent', lines: [
    { kind: 'narration', text: 'The clerk reads the manifest and nods slowly. Then it speaks.' },
    { kind: 'event', text: 'Bresk swears an Oath: "We pay at the Gut Stone".' },
    { kind: 'say', text: 'hello' },
  ] });
  assert.match(plain, /^At The Toll-Vent: The clerk reads the manifest and nods slowly\. Bresk swears an Oath/);
});

test('the Director writes a chapter when the Cohort leaves a site, and its cast lands in the Ledger', async () => {
  const t = played();
  let state = t.s;
  const sent = [];
  const make = () => ({
    id: 'scripted', model: 'm', listModels: async () => [{ id: 'gemini-9.9-flash', name: 'm' }],
    start: ({ system }) => ({ send: async (text) => { sent.push({ system, text }); return { text: 'CHAPTER:\nThe Cohort swore past Nine-Folds.\nCAST:\n[{"name":"Nine-Folds","kind":"person","fact":"Filed the oath"}]', calls: [], usage: { in: 50, out: 10 } }; } }),
  });
  const d = createDirector({
    getState: () => state, commit: (n) => { state = n; }, act: (a) => { state = apply(state, a, ctx('host', null)); },
    memory: t.mem, scenario, bestiary, rng, saveDir: mkdtempSync(join(tmpdir(), 'oxd-')), onChange: () => {}, makeProvider: make,
  });
  await d.op({ op: 'config', mode: 'copilot', apiKey: 'k' });
  d.chapter({ siteId: 'toll-vent', why: 'left' });
  for (let i = 0; i < 100 && d.view('host').writing; i++) await new Promise((r) => setTimeout(r, 5));
  assert.match(sent[0].system, /You keep the chronicle/);
  assert.match(sent[0].text, /Nine-Folds files the oath/);
  const ch = d.view('host').chronicle;
  assert.equal(ch.length, 1);
  assert.equal(ch[0].text, 'The Cohort swore past Nine-Folds.');
  assert.equal(ch[0].by, 'ai');
  assert.ok(Object.values(state.cast).some((c) => c.name === 'Nine-Folds' && c.origin === 'page'));
  // Nothing new said since: no second chapter.
  d.chapter({ siteId: 'toll-vent', why: 'night' });
  for (let i = 0; i < 100 && d.view('host').writing; i++) await new Promise((r) => setTimeout(r, 5));
  assert.equal(d.view('host').chronicle.length, 1);
  // The host can drop a chapter.
  await d.op({ op: 'chapter.drop', id: ch[0].id });
  assert.equal(d.view('host').chronicle.length, 0);
});

test('with the Director off, the chapter is written plainly and costs nothing', async () => {
  const t = played();
  let called = 0;
  const make = () => ({ id: 'x', model: 'm', listModels: async () => [], start: () => ({ send: async () => { called += 1; return { text: '' }; } }) });
  const d = createDirector({ getState: () => t.s, commit: () => {}, memory: t.mem, scenario, bestiary, rng, saveDir: mkdtempSync(join(tmpdir(), 'oxd-')), onChange: () => {}, makeProvider: make });
  await d.op({ op: 'chapter' });
  for (let i = 0; i < 100 && d.view('host').writing; i++) await new Promise((r) => setTimeout(r, 5));
  assert.equal(called, 0);
  const ch = d.view('host').chronicle;
  assert.equal(ch.length, 1);
  assert.equal(ch[0].why, 'night');
  assert.match(ch[0].text, /^At The Toll-Vent: The drone clerk, a folded thing called Nine-Folds/);
  assert.ok(!/plays/.test(ch[0].text), 'seating is not story');
});
