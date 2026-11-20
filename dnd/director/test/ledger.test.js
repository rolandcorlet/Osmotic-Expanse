import test from 'node:test';
import assert from 'node:assert/strict';
import { apply, viewFor, RuleError } from '../engine/ledger.js';
import { table, hero, srd } from './helpers.js';

test('a player joins and builds a character', () => {
  const T = table();
  const pc = hero(T, 'p1', 'Bryn');
  assert.equal(pc.level, 1);
  assert.equal(pc.maxHp, 10 + 2); // d10 + Con +2 (human 14)
  assert.equal(T.s.players.p1.pcId, pc.id);
  assert.throws(() => T.as('p1', { type: 'pc.create', input: { ...pc.input, name: 'Again' } }), RuleError);
});

test('a requested check is rolled by its own player, and the DC stays hidden from players', () => {
  const T = table();
  const pc = hero(T, 'p1', 'Bryn');
  T.ai({ type: 'roll.ask', pcId: pc.id, kind: 'check', skill: 'athletics', dc: 12, reason: 'Climb the wall' });
  const q = T.s.requests[0];
  assert.equal(viewFor(T.s, 'player', 'p1').requests[0].dc, null);
  assert.equal(viewFor(T.s, 'player', 'p2').requests.length, 0);
  assert.throws(() => T.as('p2', { type: 'roll.make', id: q.id }), RuleError);
  T.as('p1', { type: 'roll.make', id: q.id });
  const r = T.s.rolls.at(-1);
  assert.equal(r.total, r.dice[0] + pc.mods.str + (pc.skills.includes('athletics') ? pc.prof : 0));
  assert.equal(r.success, r.total >= 12);
  assert.equal(T.s.requests.length, 0);
});

test('a fight: initiative, turns, attacks that hit by AC, and XP at the end', () => {
  const T = table(3);
  const pc = hero(T, 'p1', 'Bryn');
  T.host({ type: 'foe.add', monster: 'goblin', count: 2 });
  T.ai({ type: 'fight.start' });
  assert.equal(T.s.fight.phase, 'initiative');
  const q = T.s.requests.find((x) => x.kind === 'initiative');
  T.as('p1', { type: 'roll.make', id: q.id });
  assert.equal(T.s.fight.phase, 'turns');
  assert.equal(T.s.fight.round, 1);
  let guard = 0;
  while (Object.values(T.s.foes).some((f) => !f.dead) && guard++ < 60) {
    const cur = T.s.fight.order[T.s.fight.turn].key;
    if (cur === `pc:${pc.id}`) {
      const foe = Object.values(T.s.foes).find((f) => !f.dead);
      T.as('p1', { type: 'attack', pcId: pc.id, attack: T.s.pcs[pc.id].attacks[0].id, target: `foe:${foe.id}` });
      const r = T.s.rolls.at(-1);
      assert.equal(r.success, r.dice[0] === 20 || (r.dice[0] !== 1 && r.total >= foe.ac));
      const still = Object.values(T.s.foes).find((f) => !f.dead);
      if (still) assert.throws(() => T.as('p1', { type: 'attack', pcId: pc.id, attack: T.s.pcs[pc.id].attacks[0].id, target: `foe:${still.id}` }), /used their action/);
      T.as('p1', { type: 'fight.next' });
    } else {
      const foeId = cur.split(':')[1];
      assert.throws(() => T.as('p1', { type: 'fight.next' }), RuleError);
      if (T.s.pcs[pc.id].hp > 0) T.ai({ type: 'foe.act', foeId, action: 'Scimitar', target: `pc:${pc.id}` });
      T.ai({ type: 'fight.next' });
    }
    if (T.s.pcs[pc.id].hp <= 0) T.host({ type: 'heal', target: `pc:${pc.id}`, amount: 20 });
  }
  T.ai({ type: 'fight.end' });
  assert.equal(T.s.fight, null);
  assert.equal(T.s.pcs[pc.id].xp, 100);
});

test('the AI cannot act for a monster out of turn', () => {
  const T = table(5);
  const pc = hero(T, 'p1', 'Bryn');
  T.host({ type: 'foe.add', monster: 'goblin', count: 1 });
  T.ai({ type: 'fight.start', autoRoll: true });
  const cur = T.s.fight.order[T.s.fight.turn].key;
  const foe = Object.values(T.s.foes)[0];
  if (cur.startsWith('pc:')) assert.throws(() => T.ai({ type: 'foe.act', foeId: foe.id, action: 'Scimitar', target: `pc:${pc.id}` }), /not Goblin's turn/);
  else T.ai({ type: 'foe.act', foeId: foe.id, action: 'Scimitar', target: `pc:${pc.id}` });
});

test('dropping to 0: unconscious, death saves on their turn, three failures kill', () => {
  const T = table(11);
  const pc = hero(T, 'p1', 'Bryn');
  T.host({ type: 'foe.add', monster: 'goblin', count: 1 });
  T.host({ type: 'fight.start', autoRoll: true });
  T.host({ type: 'damage', target: pc.id, amount: pc.maxHp + 2 });
  let me = T.s.pcs[pc.id];
  assert.equal(me.hp, 0);
  assert.ok(me.conds.includes('unconscious'));
  assert.ok(!me.dead);
  T.host({ type: 'damage', target: pc.id, amount: 1 });
  T.host({ type: 'damage', target: pc.id, amount: 1 });
  T.host({ type: 'damage', target: pc.id, amount: 1 });
  assert.ok(T.s.pcs[pc.id].dead);
});

test('massive damage kills outright', () => {
  const T = table();
  const pc = hero(T, 'p1', 'Bryn');
  T.host({ type: 'damage', target: pc.id, amount: pc.maxHp * 2 });
  assert.ok(T.s.pcs[pc.id].dead);
});

test('a death save on the dying character\'s turn', () => {
  const T = table(2);
  const pc = hero(T, 'p1', 'Bryn');
  T.host({ type: 'foe.add', monster: 'goblin', count: 1 });
  T.host({ type: 'fight.start', autoRoll: true });
  T.host({ type: 'damage', target: pc.id, amount: pc.maxHp });
  for (let k = 0; k < 4 && !T.s.requests.some((q) => q.kind === 'death'); k++) T.host({ type: 'fight.next' });
  const q = T.s.requests.find((x) => x.kind === 'death');
  assert.ok(q);
  T.as('p1', { type: 'roll.make', id: q.id, own: [15] });
  assert.equal(T.s.pcs[pc.id].death.s, 1);
});

test('spells spend slots, keep concentration, and refuse when slots run out', () => {
  const T = table(9);
  const pc = hero(T, 'p1', 'Ila', 'wizard', { spells: { cantrips: ['fire-bolt', 'light', 'mage-hand'], known: ['magic-missile', 'sleep', 'shield', 'detect-magic', 'burning-hands', 'mage-armor'], prepared: ['magic-missile', 'detect-magic'] } });
  T.host({ type: 'foe.add', monster: 'goblin', count: 1 });
  const foe = Object.values(T.s.foes)[0];
  T.as('p1', { type: 'spell.cast', pcId: pc.id, spell: 'magic-missile', targets: [`foe:${foe.id}`] });
  assert.ok(T.s.foes[foe.id].hp < 7 || T.s.foes[foe.id].dead);
  T.as('p1', { type: 'spell.cast', pcId: pc.id, spell: 'detect-magic' });
  assert.equal(T.s.pcs[pc.id].conc.id, 'detect-magic');
  assert.throws(() => T.as('p1', { type: 'spell.cast', pcId: pc.id, spell: 'magic-missile', targets: [`foe:${foe.id}`] }), /no 1st-level spell slots left/);
  T.as('p1', { type: 'spell.cast', pcId: pc.id, spell: 'fire-bolt', targets: [`foe:${foe.id}`] }); // cantrips are free
  assert.throws(() => T.as('p1', { type: 'spell.cast', pcId: pc.id, spell: 'sleep' }), /does not have Sleep prepared/);
  T.host({ type: 'rest.long' });
  assert.deepEqual(T.s.pcs[pc.id].cast.slots[0], [2, 0]);
});

test('damage while concentrating asks for a Constitution save', () => {
  const T = table(4);
  const pc = hero(T, 'p1', 'Ila', 'wizard', { spells: { cantrips: [], known: ['detect-magic'], prepared: ['detect-magic'] } });
  T.as('p1', { type: 'spell.cast', pcId: pc.id, spell: 'detect-magic' });
  T.host({ type: 'damage', target: pc.id, amount: 3 });
  const q = T.s.requests.find((x) => x.kind === 'save' && x.ability === 'con');
  assert.equal(q.dc, 10);
  T.as('p1', { type: 'roll.make', id: q.id, own: [1] });
  assert.equal(T.s.pcs[pc.id].conc, null);
});

test('a monster ability with a saving throw asks the player to roll, then applies the result', () => {
  const T = table(6);
  const pc = hero(T, 'p1', 'Bryn');
  T.host({ type: 'foe.add', monster: 'young-red-dragon', count: 1 });
  const foe = Object.values(T.s.foes)[0];
  T.host({ type: 'foe.act', foeId: foe.id, action: 'Fire Breath', targets: [pc.id] });
  const q = T.s.requests.find((x) => x.kind === 'save');
  assert.equal(q.ability, 'dex');
  assert.equal(q.dc, 17);
  T.as('p1', { type: 'roll.make', id: q.id, own: [2] });
  assert.ok(T.s.pcs[pc.id].hp <= 0);
  assert.throws(() => T.host({ type: 'foe.act', foeId: foe.id, action: 'Fire Breath', targets: [pc.id] }), /not recharged/);
});

test('players see monsters as words, never numbers, and never hidden monsters', () => {
  const T = table();
  hero(T, 'p1', 'Bryn');
  T.host({ type: 'foe.add', monster: 'goblin', count: 1 });
  T.host({ type: 'foe.add', monster: 'bugbear', count: 1, hidden: true });
  const v = viewFor(T.s, 'player', 'p1');
  const foes = Object.values(v.foes);
  assert.equal(foes.length, 1);
  assert.equal(foes[0].hp, undefined);
  assert.equal(foes[0].ac, undefined);
  assert.equal(foes[0].health, 'Unhurt');
  assert.equal(v.notes, undefined);
});

test('moving to a new place places its monsters out of sight, and the AI must use an exit', () => {
  const T = table();
  hero(T, 'p1', 'Bryn');
  assert.throws(() => T.ai({ type: 'site.move', siteId: 'sanctum' }), /cannot be reached/);
  T.ai({ type: 'site.move', siteId: 'mill-road' });
  const here = Object.values(T.s.foes).filter((f) => f.siteId === 'mill-road');
  assert.equal(here.length, 3);
  assert.ok(here.every((f) => f.hidden));
  T.ai({ type: 'site.move', siteId: 'thornwick' });
  T.ai({ type: 'site.move', siteId: 'mill-road' });
  assert.equal(Object.values(T.s.foes).filter((f) => f.siteId === 'mill-road').length, 3);
});

test('levelling up needs the XP, and keeps damage taken', () => {
  const T = table();
  const pc = hero(T, 'p1', 'Bryn');
  assert.throws(() => T.as('p1', { type: 'pc.rebuild', pcId: pc.id, input: { level: 2 } }), /needs 300 XP/);
  T.host({ type: 'xp.award', amount: 300 });
  T.host({ type: 'damage', target: pc.id, amount: 4 });
  T.as('p1', { type: 'pc.rebuild', pcId: pc.id, input: { level: 2 } });
  const me = T.s.pcs[pc.id];
  assert.equal(me.level, 2);
  assert.equal(me.maxHp, 12 + 6 + 2);
  assert.equal(me.hp, me.maxHp - 4);
  assert.ok(me.resources.some((r) => r.id === 'surge'));
});

test('short rests spend hit dice; second wind and rage work', () => {
  const T = table(12);
  const pc = hero(T, 'p1', 'Bryn');
  T.host({ type: 'damage', target: pc.id, amount: 8 });
  T.as('p1', { type: 'resource.use', pcId: pc.id, id: 'secondwind' });
  assert.ok(T.s.pcs[pc.id].hp > pc.maxHp - 8);
  assert.throws(() => T.as('p1', { type: 'resource.use', pcId: pc.id, id: 'secondwind' }), /no Second Wind left/);
  T.as('p1', { type: 'rest.short', pcId: pc.id, dice: 1 });
  assert.equal(T.s.pcs[pc.id].hitDiceUsed, 1);
  assert.equal(T.s.pcs[pc.id].resources.find((r) => r.id === 'secondwind').used, 0);
  const b = hero(T, 'p2', 'Ruk', 'barbarian');
  T.as('p2', { type: 'resource.use', pcId: b.id, id: 'rage' });
  assert.ok(T.s.pcs[b.id].raging);
  T.host({ type: 'damage', target: b.id, amount: 6, damageType: 'slashing' });
  assert.equal(T.s.pcs[b.id].hp, T.s.pcs[b.id].maxHp - 3);
});

test('zombies can refuse to fall unless the blow is radiant', () => {
  const T = table(1);
  hero(T, 'p1', 'Bryn');
  T.host({ type: 'foe.add', monster: 'zombie', count: 1 });
  const z = Object.values(T.s.foes)[0];
  T.host({ type: 'damage', target: `foe:${z.id}`, amount: 22, damageType: 'radiant' });
  assert.ok(T.s.foes[z.id].dead);
});

test('unknown actions and bad targets are refused in plain words', () => {
  const T = table();
  assert.throws(() => apply(T.s, { type: 'nope' }, { role: 'host' }), /Unknown action/);
  assert.throws(() => T.ai({ type: 'roll.ask', pcId: 'zz', kind: 'check', skill: 'stealth', dc: 10 }), /Name a character/);
  assert.throws(() => T.host({ type: 'foe.add', monster: 'beholder' }), /no monster called/);
  void srd;
});

test('a monster casts the spells in its Spellcasting trait, and runs out of slots', () => {
  const T = table(11);
  const pc = hero(T, 'p1', 'Ila');
  T.host({ type: 'foe.add', monster: 'cult-fanatic', count: 1 });
  const foe = Object.values(T.s.foes)[0];
  T.host({ type: 'foe.act', foeId: foe.id, action: 'Hold Person', target: `pc:${pc.id}` });
  const q = T.s.requests.find((r) => r.pcId === pc.id && r.kind === 'save');
  assert.ok(q, 'a Wisdom save is asked for');
  assert.equal(q.ability, 'wis');
  assert.equal(q.dc, 11);
  assert.equal(q.effect.cond, 'paralyzed');
  T.host({ type: 'foe.act', foeId: foe.id, action: 'cast spiritual weapon', target: `pc:${pc.id}` });
  T.host({ type: 'foe.act', foeId: foe.id, action: 'Sacred Flame', target: `pc:${pc.id}` });
  T.host({ type: 'foe.act', foeId: foe.id, action: 'Hold Person', target: `pc:${pc.id}` });
  assert.throws(() => T.host({ type: 'foe.act', foeId: foe.id, action: 'Hold Person', target: `pc:${pc.id}` }), /no 2nd-level spell slots left/);
  assert.throws(() => T.host({ type: 'foe.act', foeId: foe.id, action: 'Fireball', target: `pc:${pc.id}` }), /Spells it can cast: .*Hold Person/);
});

test('hold person: the held character saves at the end of each turn, and the hold ends when the caster falls', () => {
  let T; let pc; let foe;
  for (let seed = 1; seed < 200; seed++) {
    T = table(seed);
    pc = hero(T, 'p1', 'Bryn');
    T.host({ type: 'foe.add', monster: 'cult-fanatic', count: 1 });
    foe = Object.values(T.s.foes)[0];
    T.host({ type: 'foe.act', foeId: foe.id, action: 'Hold Person', target: `pc:${pc.id}` });
    const q = T.s.requests.find((r) => r.pcId === pc.id);
    T.as('p1', { type: 'roll.make', id: q.id });
    if (T.s.pcs[pc.id].conds.includes('paralyzed')) break;
  }
  assert.ok(T.s.pcs[pc.id].conds.includes('paralyzed'));
  assert.equal(T.s.pcs[pc.id].held.length, 1);
  // The caster falls: the hold ends at once.
  const snap = structuredClone(T.s);
  T.host({ type: 'damage', target: `foe:${foe.id}`, amount: 999, dmgType: 'force' });
  assert.ok(!T.s.pcs[pc.id].conds.includes('paralyzed'), 'the hold ends when the caster falls');
  T.s = snap;
  T.host({ type: 'fight.start', autoRoll: true });
  // End turns until Bryn's turn has ended once: a repeat save is rolled for him.
  const before = T.s.rolls.length;
  for (let i = 0; i < 3 && !T.s.rolls.slice(before).some((r) => /end of turn/.test(r.reason || '')); i++) T.host({ type: 'fight.next' });
  assert.ok(T.s.rolls.slice(before).some((r) => /end of turn: Hold Person/.test(r.reason || '')), 'a repeat save was rolled');
  T.host({ type: 'fight.end' });
  assert.equal((T.s.pcs[pc.id].held || []).length, 0);
});
