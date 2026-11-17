import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadData, applyOverlay, legalMoves } from '../src/engine.mjs';
import { Table } from '../src/table.mjs';
import { guard, prompt, INSTRUCTIONS } from '../src/brain.mjs';
import { mock, parseReply } from '../src/providers.mjs';
import { choose } from '../../engine-v2/tools/autoplay.mjs';

const D = applyOverlay(loadData());
const seated = (provider = mock(), narrate = 'all') => {
  const t = new Table({ D, provider, narrate, seed: 7 });
  const toks = {};
  const called = { wall: 'Bresk of the Sixth Choir', eyes: 'Brost', ledger: 'Ilm', rider: 'Vash' };
  for (const id of Object.keys(t.g.s.orgs)) { toks[id] = t.join(t.code, `P-${id}`); t.claim(toks[id], id, called[id]); }
  return { t, toks };
};

test('joining needs the table code; a seat is one name and one token', () => {
  const t = new Table({ D, seed: 1 });
  assert.throws(() => t.join('WRONG1', 'Eve'), /code/);
  const tok = t.join(t.code.toLowerCase(), '  Ana\u0007  ');
  assert.equal(t.seat(tok).name, 'Ana');
  assert.equal(t.seat('nope'), null);
  assert.equal(t.seat('__proto__'), null);
});

test('an organism has one player, and a player presses only their own buttons', async () => {
  const { t, toks } = seated();
  const late = t.join(t.code, 'Late');
  assert.throws(() => t.claim(late, 'wall'), /already playing/);
  await t.move(toks.wall, 'begin');
  const theirs = legalMoves(t.g).find((m) => m.who === 'eyes');
  await assert.rejects(t.move(toks.wall, theirs.id), /another organism/);
  t.release(toks.rider, 'rider');
  assert.ok(t.movesFor(late).some((m) => m.who === 'rider'), 'an open seat can be played by anyone at the table');
  assert.ok(!t.movesFor(late).some((m) => m.who === 'eyes'));
  await assert.rejects(t.move(toks.wall, 'do:wall:buy-a-harpoon'), /cannot be done/);
  await t.move(t.hostKey, theirs.id); // the host may press for an empty or slow seat
});

test('what a screen is shown never carries a creature number', async () => {
  const { t, toks } = seated();
  await t.move(toks.wall, 'begin');
  const v = t.view(toks.wall);
  assert.ok(v.creatures.length > 0);
  for (const c of v.creatures) { assert.deepEqual(Object.keys(c).sort(), ['band', 'cut', 'id', 'look', 'name', 'state']); assert.ok(!/\d/.test(c.look + c.state + c.band)); }
  assert.equal(v.hostInfo, undefined, 'a player never gets the table code or the host panel');
  assert.ok(t.view(t.hostKey).hostInfo.code);
});

test('the guard keeps what may be said and drops the rest', () => {
  const { t } = seated();
  const g = t.g;
  assert.equal(guard('The gate folds aside. What do you do?', g).text, 'The gate folds aside.');
  assert.equal(guard('**The gate** folds aside.', g).text, 'The gate folds aside.');
  assert.match(guard('The swarm takes 3 damage.', g).drop, /number/);
  assert.match(guard('It rolls four dice at you.', g).drop, /counted/);
  assert.match(guard('The Engine says the gate is shut.', g).drop, /machinery/);
  assert.match(guard('Its Membrane Integrity is low.', g).drop, /machinery/);
  assert.match(guard('Bresk dissolves into the halo.', g).drop, /buries/);
  assert.ok(guard("Bresk's flail hangs where the swarm died.", g).text);
  assert.match(guard('What do you do?', g).drop, /question/);
  assert.match(guard('', g).drop, /empty/);
});

test('the prompt is small and holds no creature number', async () => {
  const { t, toks } = seated();
  await t.move(toks.wall, 'begin');
  for (const s of D.vector.sites) {
    t.g.s.scene.siteId = s.id;
    const p = prompt(t.g, { lines: ['A thing happened.'], story: t.story });
    assert.ok((INSTRUCTIONS.length + p.length) / 4 < 2000, `${s.id}: ${(INSTRUCTIONS.length + p.length) / 4}`);
  }
  t.g.s.scene.siteId = 'toll-vent';
  const here = prompt(t.g, {}).split('\n').find((l) => l.startsWith('HERE:'));
  assert.ok(here && !/\d/.test(here));
});

test('own words: the model may pick only the speaker\'s own legal move, and nothing when it picks badly', async () => {
  let seen = [];
  const m = mock({ pick: (ids) => { seen = ids; return ids.find((i) => i.startsWith('do:wall:swear-toll')) || null; }, text: 'Bresk steps to the witness-seam and speaks.' });
  const { t, toks } = seated(m);
  await t.move(toks.wall, 'begin');
  await t.say(toks.wall, 'I swear the toll in front of the fold.');
  assert.ok(seen.every((id) => !/^do:(eyes|ledger|rider):/.test(id)), 'only the speaker\'s moves are offered');
  assert.ok(t.g.s.flags['toll-settled']);
  const last = t.story.filter((e) => e.kind === 'director').pop();
  assert.match(last.text, /^Bresk steps to the witness-seam/);
  const bad = mock({ pick: () => 'do:eyes:taste-water' });
  const b = seated(bad);
  await b.t.move(b.toks.wall, 'begin');
  const n = b.t.g.s.log.length;
  await b.t.say(b.toks.wall, 'Brost should taste the water.');
  assert.equal(b.t.g.s.log.length, n, 'a move that is not the speaker\'s is not played');
});

test('a model that fails, leaks or goes silent never stalls the table: the Engine speaks', async () => {
  for (const provider of [
    { id: 'x', model: 'x', ask: async () => { throw new Error('connection refused'); } },
    { id: 'x', model: 'x', ask: async () => ({ narration: 'The swarm has 3 MI left.', choose: null, usage: { in: 1, out: 1 }, ms: 5 }) },
    { id: 'x', model: 'x', ask: async () => ({ narration: '', choose: null, usage: { in: 1, out: 1 }, ms: 5 }) },
  ]) {
    const { t, toks } = seated(provider);
    await t.move(toks.wall, 'begin');
    const d = t.story.filter((e) => e.kind === 'director').pop();
    assert.match(d.text, /torn flank panel/);
    assert.ok(t.stats.fallbacks >= 1);
    assert.ok(!/\d MI/.test(JSON.stringify(t.story)));
  }
});

test('every Director line is followed by exactly one Engine question, to whoever is on turn', async () => {
  const { t, toks } = seated();
  await t.move(toks.wall, 'begin');
  const a = legalMoves(t.g).find((m) => m.kind === 'attack');
  await t.move(toks[a.who], a.id);
  let steps = 0;
  while (t.g.s.fight && steps++ < 60) {
    const m = choose(t.g, undefined, 'fight');
    await t.move(toks[m.who] || toks.wall, m.id);
    const v = t.view(toks.wall);
    const last = t.story[t.story.length - 1];
    if (t.g.s.ended) break;
    assert.equal(last.kind, 'ask');
    assert.equal(t.story[t.story.length - 2].kind, 'director');
    if (v.turn) assert.ok(last.text.startsWith(v.turn.name.split(' ')[0]), `${last.text} / ${v.turn.name}`);
  }
});

test('the whole module plays through the table on both routes, with the model speaking on every move', async () => {
  for (const route of ['peaceful', 'fight']) for (const seed of [3, 7, 11]) {
    const m = mock();
    const t = new Table({ D, provider: m, seed });
    const toks = {};
    for (const id of Object.keys(t.g.s.orgs)) { toks[id] = t.join(t.code, id); t.claim(toks[id], id); }
    if (route === 'fight') { await t.move(toks.wall, 'begin'); const a = legalMoves(t.g).find((x) => x.kind === 'attack'); await t.move(toks[a.who], a.id); }
    let steps = 0;
    while (!t.g.s.ended && steps++ < 500) { const mv = choose(t.g, undefined, route); await t.move(mv.who ? toks[mv.who] : toks.wall, mv.id); }
    assert.ok(t.g.s.ended, `${route} seed ${seed}`);
    assert.equal(t.stats.fallbacks, 0);
    assert.ok(m.calls <= steps + 2, 'one call a move, none for creature turns');
  }
});

test('key-moments mode calls the model far less, and "off" not at all', async () => {
  const calls = {};
  for (const mode of ['all', 'beats', 'off']) {
    const m = mock(); const t = new Table({ D, provider: m, narrate: mode, seed: 7 });
    const toks = {}; for (const id of Object.keys(t.g.s.orgs)) { toks[id] = t.join(t.code, id); t.claim(toks[id], id); }
    await t.move(toks.wall, 'begin'); const a = legalMoves(t.g).find((x) => x.kind === 'attack'); await t.move(toks[a.who], a.id);
    let steps = 0; while (!t.g.s.ended && steps++ < 500) { const mv = choose(t.g, undefined, 'fight'); await t.move(mv.who ? toks[mv.who] : toks.wall, mv.id); }
    calls[mode] = m.calls;
  }
  assert.equal(calls.off, 0);
  assert.ok(calls.beats < calls.all, JSON.stringify(calls));
});

test('the host can take a move back, start again and change the code; a player cannot', async () => {
  const { t, toks } = seated();
  await t.move(toks.wall, 'begin');
  await t.move(toks.wall, 'do:wall:swear-toll');
  assert.ok(t.g.s.flags['toll-settled']);
  await t.hostDo(t.hostKey, 'undo');
  assert.ok(!t.g.s.flags['toll-settled']);
  assert.throws(() => t.hostDo(toks.wall, 'new'), /Host only/);
  const old = t.code; await t.hostDo(t.hostKey, 'code'); assert.notEqual(t.code, old);
  await t.hostDo(t.hostKey, 'new'); assert.equal(t.g.s.scene.siteId, null);
});

test('a saved table comes back as it was', async () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'oe2-')), 'table.json');
  const t = new Table({ D, provider: mock(), seed: 5, file });
  const tok = t.join(t.code, 'Ana'); t.claim(tok, 'wall'); await t.move(tok, 'begin');
  const t2 = new Table({ D, provider: mock(), file });
  assert.equal(t2.code, t.code); assert.equal(t2.g.s.scene.siteId, 'toll-vent'); assert.deepEqual(t2.seat(tok).orgIds, ['wall']);
  assert.equal(t2.story.length, t.story.length);
});

test('replies are read leniently', () => {
  assert.deepEqual(parseReply('```json\n{"narration":"Hi.","choose":null}\n```'), { narration: 'Hi.', choose: null });
  assert.deepEqual(parseReply('<think>hmm {x}</think>{"narration":"A.","choose":"exit:soft-field"} trailing'), { narration: 'A.', choose: 'exit:soft-field' });
  assert.equal(parseReply('Just words.').narration, 'Just words.');
});

test('over the wire: codes, tokens, limits and the host console', async () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const saves = fs.mkdtempSync(path.join(os.tmpdir(), 'oe2s-'));
  const port = 20000 + Math.floor(Math.random() * 20000);
  const child = spawn(process.execPath, [path.join(here, '..', 'server.mjs'), '--port', String(port), '--saves', saves, '--provider', 'none'], { stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    const banner = await new Promise((resolve, reject) => { let buf = ''; child.stdout.on('data', (c) => { buf += c; if (/narrating:/.test(buf)) resolve(buf); }); child.on('exit', () => reject(new Error(`server exited: ${buf}`))); setTimeout(() => reject(new Error('no banner')), 8000); });
    const code = banner.match(/Table code for players:\s+(\w{6})/)[1];
    const key = banner.match(/key=([\w-]+)/)[1];
    assert.match(banner, /forward TCP port/);
    const base = `http://127.0.0.1:${port}`;
    const call = async (p, body, tok) => { const r = await fetch(base + p, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', ...(tok ? { authorization: `Bearer ${tok}` } : {}) }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, headers: r.headers, json: await r.json().catch(() => null) }; };
    const page = await fetch(base + '/');
    assert.equal(page.status, 200); assert.match(page.headers.get('content-security-policy'), /default-src 'self'/); assert.equal(page.headers.get('referrer-policy'), 'no-referrer');
    assert.equal((await call('/api/state')).status, 401);
    assert.equal((await call('/api/state', null, 'made-up')).status, 401);
    assert.equal((await call('/api/join', { code: 'AAAAAA', name: 'x' })).status, 403);
    const j = await call('/api/join', { code, name: 'Ana' });
    assert.equal(j.status, 200);
    const tok = j.json.token;
    assert.equal((await call('/api/claim', { org: 'wall' }, tok)).status, 200);
    assert.equal((await call('/api/move', { id: 'begin' }, tok)).status, 200);
    const st = await call('/api/state', null, tok);
    assert.equal(st.json.site.id, 'toll-vent'); assert.equal(st.json.hostInfo, undefined);
    assert.equal((await call('/api/host', { action: 'new' }, tok)).status, 403);
    assert.equal((await call('/api/host', { action: 'info' }, key)).json.port, port);
    assert.equal((await call('/api/move', { id: 'x'.repeat(20000) }, tok)).status, 413);
    for (let i = 0; i < 7; i++) await call('/api/join', { code: 'BBBBBB', name: 'x' });
    assert.equal((await call('/api/join', { code, name: 'late' })).status, 429, 'eight wrong codes lock that address out for a while');
  } finally { child.kill(); }
});
