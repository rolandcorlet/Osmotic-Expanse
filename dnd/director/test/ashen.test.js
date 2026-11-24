// The Ashen Crown of Sundermark: the adventure holds together, its ten heroes build, and the
// take-over, clock and custom-monster machinery it relies on works.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeRng } from '../engine/dice.js';
import { newSession, apply, viewFor, openAdventure, monsterSpells, RuleError } from '../engine/ledger.js';
import * as R from '../engine/rules.js';
import * as PG from '../engine/pregen.js';
import { ADVENTURES, adventureById, DEFAULT_ADVENTURE } from '../data/adventures/index.js';
import { prepareSrd } from '../engine/library.js';
import { toolbox, lookUp } from '../brain/tools.js';
import { briefing } from '../brain/director.js';

const srd = JSON.parse(readFileSync(new URL('../../data/srd.json', import.meta.url), 'utf8'));
prepareSrd(srd, { adventures: ADVENTURES }); // no library: the adventure must play on the SRD alone
const adv = adventureById('ashen-crown');
const ix = R.index(srd);

function table(seed = 3) {
  const rng = makeRng(seed);
  let now = 1000;
  const ctx = (role, pid, extra = {}) => ({ role, pid, rng, now: (now += 1000), adventure: adv, srd, ...extra });
  const T = {
    s: openAdventure(newSession(adv), adv, ctx('host', null)),
    host(a) { T.s = apply(T.s, a, ctx('host', null)); return T.s; },
    ai(a) { T.s = apply(T.s, a, ctx('host', null, { ai: true })); return T.s; },
    as(pid, a) { T.s = apply(T.s, a, ctx('player', pid)); return T.s; },
    ctx,
  };
  return T;
}

test('The Ashen Crown is the default adventure, and every place, exit, monster and quest fence is sound', () => {
  assert.equal(DEFAULT_ADVENTURE, 'ashen-crown');
  const ids = new Set(adv.sites.map((x) => x.id));
  assert.equal(ids.size, adv.sites.length, 'site ids are unique');
  assert.equal(adv.sites[0].id, 'highbridge', 'the game opens on the bridge');
  for (const site of adv.sites) {
    for (const e of site.exits || []) assert.ok(ids.has(e.to), `${site.id} exit to ${e.to}`);
    for (const f of site.foes || []) assert.ok(ix.monster[f.monster], `${site.id}: monster ${f.monster}`);
    for (const c of site.checks || []) assert.ok(ix.skill[c.skill], `${site.id}: skill ${c.skill}`);
    for (const c of site.clocks || []) assert.ok(c.name && c.size >= 2 && c.size <= 12, `${site.id}: clock ${c.name}`);
    assert.ok(site.read && site.notes, `${site.id} has read-aloud text and notes`);
  }
  for (const q of adv.questDone) {
    assert.equal(q.match, q.match.toLowerCase(), 'quest matches are lower case');
    for (const at of q.at) assert.ok(ids.has(at), `quest "${q.match}" closes at ${at}`);
  }
  // Every site can be reached from the start.
  const seen = new Set(['highbridge']); const todo = ['highbridge'];
  while (todo.length) { const id = todo.pop(); for (const e of (adv.sites.find((x) => x.id === id).exits || [])) if (!seen.has(e.to)) { seen.add(e.to); todo.push(e.to); } }
  assert.deepEqual([...ids].filter((x) => !seen.has(x)), []);
});

test('the adventure\'s own monsters are well formed and act through the Engine', () => {
  for (const m of adv.monsters) {
    assert.ok(m.id.startsWith('ac-') && ix.monster[m.id], m.id);
    assert.equal(m.ab.length, 6);
    assert.ok(m.actions.length && m.hp > 0 && m.ac > 0 && m.xp > 0, m.id);
    for (const a of [...m.actions, ...(m.legendary || [])]) if (a.hit != null) assert.ok((a.dmg || []).length, `${m.id} ${a.n} has damage`);
  }
  const snikt = monsterSpells(ix.monster['ac-snikt'], srd);
  assert.equal(snikt.dc, 12);
  assert.equal(snikt.slots[1], 4);
  assert.ok(snikt.spells.every((x) => x.data), 'Snikt\'s spells are all SRD spells');
});

test('ten Sundermark heroes, each a valid build at 1st and 5th level', () => {
  assert.equal(adv.pregens.length, 10);
  assert.equal(new Set(adv.pregens.map((p) => p.input.class)).size, 10, 'ten different classes');
  for (const p of adv.pregens) for (const lvl of [1, 5]) {
    const b = PG.pregenBuild(p, srd, lvl);
    assert.deepEqual(R.validateInput(b, srd), [], `${p.id} at level ${lvl}`);
    const pc = R.newCharacter(b, srd);
    assert.equal(pc.name, p.input.name);
    assert.equal(pc.level, lvl);
    if (p.input.bgName) assert.equal(pc.background, p.input.bgName);
    // The same build every time.
    assert.deepEqual(PG.pregenBuild(p, srd, lvl), b);
  }
  assert.equal(PG.pregenBuild('kesh', srd, 1, adv.pregens).name, 'Kesh Varran');
  assert.equal(PG.pregenBuild('aldric', srd, 1, adv.pregens).name, 'Aldric Vane', 'the builder\'s own six still work');
});

test('a new game opens mid-ambush: the raiders are placed out of sight and the bridge clocks start', () => {
  const T = table();
  const foes = Object.values(T.s.foes);
  assert.equal(foes.length, 5);
  assert.ok(foes.every((f) => f.hidden && f.siteId === 'highbridge'));
  assert.deepEqual(T.s.clocks.map((c) => [c.name, c.size, c.filled]), [['The burning bridge', 6, 0], ['The portcullis winch', 3, 0]]);
  const brief = briefing(T.s, adv, srd, { reason: 'the game begins' });
  assert.match(brief, /HOW TO RUN THIS ADVENTURE: This campaign never railroads/);
  assert.match(brief, /CLOCKS .*The burning bridge \(id k\d+\): 0 of 6/);
});

test('clocks fill, show on every screen and are fenced by the Engine', () => {
  const T = table();
  const k = T.s.clocks[0].id;
  assert.throws(() => T.as('p1', { type: 'clock.tick', id: k }), RuleError);
  for (let n = 0; n < 6; n++) T.ai({ type: 'clock.tick', id: k });
  const c = T.s.clocks[0];
  assert.equal(c.filled, 6); assert.ok(c.done);
  assert.match(T.s.story.at(-1).text, /The burning bridge: the clock is full/);
  assert.throws(() => T.ai({ type: 'clock.tick', id: k }), /already full/);
  T.host({ type: 'clock.add', name: 'Secret plan', size: 4, hidden: true, note: 'The plan springs.' });
  const view = viewFor(T.s, 'player', 'p1');
  assert.ok(!view.clocks.some((x) => x.name === 'Secret plan'), 'hidden clocks stay hidden');
  assert.equal(view.clocks.find((x) => x.name === 'The portcullis winch').note, '', 'what a clock warns of is shown only when it fills');
  // The Director's tool.
  const tb = toolbox({ state: T.s, adventure: adv, srd, rng: makeRng(1), now: 1 });
  const out = tb.run('clock', { action: 'tick', name: 'portcullis winch', by: 3 });
  assert.match(out.clock, /3 of 3\. FULL/);
  // Clocks the Director names but the Ledger does not hold are notes, not refusals (bench part 4, 24 Nov).
  assert.ok(!tb.run('clock', { action: 'tick', name: 'no such clock' }).refused);
  assert.match(tb.run('clock', { action: 'tick', name: 'no such clock' }).note, /No clock called/);
  // Starting a clock that is still running is a note; the duplicate guard in the Ledger is for live clocks only.
  assert.match(tb.run('clock', { action: 'start', name: 'Secret plan', size: 4 }).note, /Already running/);
  // Clearing a clock twice: the first removes it, the second is a note, and the Ledger ends up without it.
  const before = tb.state.clocks.length;
  assert.ok(!tb.run('clock', { action: 'clear', name: 'Burning Bridge' }).refused);
  assert.equal(tb.state.clocks.length, before - 1);
  assert.ok(!tb.state.clocks.some((x) => x.name === 'The burning bridge'));
  assert.match(tb.run('clock', { action: 'clear', name: 'Burning Bridge' }).note, /Nothing to clear/);
  // Moving to a place with its own clock starts it, once. A place's clocks stay with it: in Oakhurst
  // the bridge's clocks are out of the briefing and off the players' screens; Brindol's runs everywhere.
  T.host({ type: 'site.move', siteId: 'oakhurst' });
  assert.ok(!/CLOCKS[^\n]*burning bridge/.test(briefing(T.s, adv, srd, { reason: 'x' })));
  assert.equal(viewFor(T.s, 'player', 'p1').clocks.length, 0);
  T.host({ type: 'site.move', siteId: 'brindol' });
  const inv = T.s.clocks.find((x) => x.name === 'The invasion of Brindol');
  assert.ok(inv && !inv.siteId, 'the invasion clock runs everywhere');
  T.host({ type: 'site.move', siteId: 'karak-tor' });
  assert.match(briefing(T.s, adv, srd, { reason: 'x' }), /The invasion of Brindol/);
});

test('taking over a character: a ready-made hero with no player, an offered one, and handing it back', () => {
  const T = table();
  const bram = PG.pregenBuild(adv.pregens[0], srd, 1);
  T.host({ type: 'pc.create', input: bram });
  const pc = Object.values(T.s.pcs)[0];
  assert.equal(pc.playerId, null);
  assert.ok(pc.open, 'a character the DM adds is free to take over');
  T.as('p1', { type: 'join', name: 'Roly' });
  T.as('p2', { type: 'join', name: 'Keith' });
  T.as('p1', { type: 'pc.take', pcId: pc.id });
  assert.equal(T.s.pcs[pc.id].playerId, 'p1');
  assert.equal(T.s.players.p1.pcId, pc.id);
  assert.throws(() => T.as('p2', { type: 'pc.take', pcId: pc.id }), /has not offered/);
  assert.throws(() => T.as('p2', { type: 'pc.open', pcId: pc.id }), /your own/);
  T.as('p1', { type: 'pc.open', pcId: pc.id, open: true });
  T.as('p2', { type: 'pc.take', pcId: pc.id });
  assert.equal(T.s.pcs[pc.id].playerId, 'p2');
  assert.equal(T.s.players.p1.pcId, null);
  assert.deepEqual(T.s.pcs[pc.id].borrow, { from: 'p1', name: 'Roly' });
  assert.match(T.s.story.at(-1).text, /Keith takes over Bram Ostlund from Roly/);
  T.as('p2', { type: 'pc.return', pcId: pc.id });
  assert.equal(T.s.pcs[pc.id].playerId, 'p1', 'it goes back to its owner');
  assert.equal(T.s.players.p2.pcId, null);
  // Stepping back: the DM plays them, and anyone may take them.
  T.as('p1', { type: 'pc.open', pcId: pc.id, open: true, leave: true });
  assert.equal(T.s.pcs[pc.id].playerId, null);
  T.as('p2', { type: 'pc.take', pcId: pc.id });
  assert.equal(T.s.pcs[pc.id].playerId, 'p2');
  // A player with a living character of their own cannot take another.
  T.as('p1', { type: 'pc.create', input: PG.pregenBuild(adv.pregens[1], srd, 1) });
  T.host({ type: 'pc.create', input: PG.pregenBuild(adv.pregens[2], srd, 1) });
  const pell = Object.values(T.s.pcs).find((x) => x.name === 'Pell Dunnock');
  assert.throws(() => T.as('p1', { type: 'pc.take', pcId: pell.id }), /already play/);
});

test('the bridge fight: custom monsters attack, breathe and fall through the Engine', () => {
  const T = table(11);
  T.as('p1', { type: 'join', name: 'Roly' });
  T.as('p1', { type: 'pc.create', input: PG.pregenBuild(adv.pregens[0], srd, 1) });
  const pc = Object.values(T.s.pcs)[0];
  T.host({ type: 'foe.reveal' });
  const cap = Object.values(T.s.foes).find((f) => f.mid === 'ac-iron-brand-captain');
  T.host({ type: 'foe.act', foeId: cap.id, action: 'Scimitar', target: `pc:${pc.id}` });
  assert.equal(T.s.rolls.at(-1).kind, 'attack');
  // Malakor's breath asks for Dexterity saves; his Ash Wing knocks prone.
  T.host({ type: 'foe.add', monster: 'ac-malakor', name: 'Lord Malakor Vane' });
  const mal = Object.values(T.s.foes).find((f) => f.mid === 'ac-malakor');
  assert.equal(mal.legendary, 3);
  T.host({ type: 'foe.act', foeId: mal.id, action: 'Fire Breath', targets: [`pc:${pc.id}`] });
  const q = T.s.requests.at(-1);
  assert.equal(q.kind, 'save'); assert.equal(q.ability, 'dex'); assert.equal(q.dc, 16); assert.ok(q.effect.half);
  T.as('p1', { type: 'roll.make', id: q.id });
  assert.throws(() => T.host({ type: 'foe.act', foeId: mal.id, action: 'Fire Breath', targets: [`pc:${pc.id}`] }), /recharged/);
  T.host({ type: 'foe.act', foeId: mal.id, action: 'Ash Wing', targets: [`pc:${pc.id}`] });
  assert.equal(T.s.requests.at(-1).effect.cond, 'prone');
});

test('bench part 4: harming or healing someone the Engine does not track, or nobody, is a note', () => {
  const T = table();
  const tb = toolbox({ state: T.s, adventure: adv, srd, rng: makeRng(2), now: 1 });
  for (const [tool, args] of [['deal_damage', { target: 'Halia Vance', dice: '1d4', damage_type: 'piercing' }], ['heal', { target: 'none', dice: '0' }], ['heal', { target: 'Halia', dice: '1d8' }]]) {
    const out = tb.run(tool, args);
    assert.ok(out.note && !out.refused, `${tool} ${JSON.stringify(args)}`);
  }
  assert.equal(tb.refusals, 0);
});

test('look-ups find the adventure\'s monsters, and rules topics say where they come from', () => {
  const k = lookUp(srd, 'Taskmaster Kragg');
  assert.match(k.monster, /Taskmaster Kragg .*AC 17, 65 hp/);
  const g = lookUp(srd, 'grappling');
  assert.ok(g.rules && g.source === 'SRD');
});

test('healing a character who has died is a note, not a refusal (bench part 3, 24 Nov)', () => {
  const T = table();
  T.host({ type: 'pc.create', input: PG.pregenBuild(adv.pregens[0], srd, 1) });
  const pc = Object.values(T.s.pcs)[0];
  T.s.pcs[pc.id] = { ...pc, dead: true, hp: 0 };
  const tb = toolbox({ state: T.s, adventure: adv, srd, rng: makeRng(1), now: 1 });
  const out = tb.run('heal', { target: pc.name, dice: '1', why: 'the lantern' });
  assert.ok(!out.refused, 'no refusal');
  assert.match(out.note, /is dead/);
});

test('a save with no ability named is asked, not refused: the reason decides, dexterity by default (bench part 3, 24 Nov)', () => {
  const T = table();
  T.host({ type: 'pc.create', input: PG.pregenBuild(adv.pregens[0], srd, 1) });
  const pc = Object.values(T.s.pcs)[0];
  const tb = toolbox({ state: T.s, adventure: adv, srd, rng: makeRng(1), now: 1 });
  const out = tb.run('ask_for_roll', { characters: [pc.name], kind: 'save', dc: 12, reason: 'Keep your footing on the slick causeway planks' });
  assert.ok(!out.refused, 'no refusal');
  assert.ok(out.asked, 'the roll is asked');
  const asked = tb.state.requests.find((q) => q.pcId === pc.id);
  assert.equal(asked.ability, 'dex');
  const tb2 = toolbox({ state: T.s, adventure: adv, srd, rng: makeRng(2), now: 2 });
  const out2 = tb2.run('ask_for_roll', { characters: [pc.name], kind: 'save', dc: 13, reason: 'Resist the charm in the cult\'s chant' });
  assert.ok(!out2.refused);
  assert.equal(tb2.state.requests.find((q) => q.pcId === pc.id && q.reason.includes('charm')).ability, 'wis');
});
