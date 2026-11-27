// The book compiler (engine/book.js, tools/compile-book.mjs): the engine version of the SRD is up to
// date, every damage roll, save, multiattack and spell list in it was read, and the Engine plays them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compileFile } from '../tools/compile-book.mjs';
import * as BOOK from '../engine/book.js';
import { table, hero, srd } from './helpers.js';

const bookFile = new URL('../../data/srd.json', import.meta.url).pathname;
const engFile = new URL('../../data/srd.engine.json', import.meta.url).pathname;
const by = (list) => Object.fromEntries(list.map((x) => [x.id, x]));
const S = by(srd.spells);
const M = by(srd.monsters);
const act = (m, n) => [...M[m].actions, ...M[m].traits, ...(M[m].legendary || []), ...(M[m].reactions || [])].find((a) => a.n === n);

test('the engine version of the SRD is up to date, and the book keeps its words', () => {
  const { text, gaps } = compileFile(bookFile);
  assert.equal(readFileSync(engFile, 'utf8'), text, 'data/srd.engine.json is out of date: run node tools/compile-book.mjs');
  assert.deepEqual(gaps, [], 'everything in the SRD was read (see data/srd.engine-gaps.md)');
  const book = JSON.parse(readFileSync(bookFile, 'utf8'));
  assert.equal(book.spells.find((x) => x.id === 'fireball').desc, S.fireball.desc);
  assert.ok(!('dmgSlot' in book.spells.find((x) => x.id === 'fireball')), 'the book itself is unchanged');
});

test('every damage roll, save, multiattack and spell list in the SRD has its numbers', () => {
  const DMG = /\d+d\d+(?:\s*\+\s*\d+)?\s+(?:acid|bludgeoning|cold|fire|force|lightning|necrotic|piercing|poison|psychic|radiant|slashing|thunder) damage/i;
  for (const sp of srd.spells) {
    if (DMG.test(sp.desc)) assert.ok(sp.dmgSlot || sp.dmgLevel, `${sp.name}: damage`);
    if (sp.dmgSlot || sp.dmgLevel) assert.ok(sp.how, `${sp.name}: how its damage lands`);
    if (sp.how === 'attack') assert.ok(sp.attack, `${sp.name}: attack`);
    if (sp.how === 'save') assert.ok(sp.save && sp.save.ability, `${sp.name}: save`);
  }
  for (const m of srd.monsters) {
    for (const a of [...m.actions, ...(m.legendary || []), ...(m.reactions || [])]) {
      if (/Hit: \d+ \(\d+d\d+/.test(a.d) && !/saving throw/.test(a.d.split('Hit:')[1].split('.')[0])) assert.ok(a.dmg, `${m.name}: ${a.n} damage`);
      if (/^(?:Melee|Ranged)/.test(a.d)) assert.ok(a.kind && a.hit != null, `${m.name}: ${a.n} attack`);
      if (/DC \d+ \w+ saving throw/.test(a.d)) assert.ok(a.dc || a.rider, `${m.name}: ${a.n} save`);
      if (/^Multiattack/.test(a.n)) assert.ok(a.multi && a.multi.length, `${m.name}: Multiattack`);
    }
    for (const t of m.traits) if (/Spellcasting/.test(t.n)) assert.ok(t.spells && t.spells.list.length, `${m.name}: spells`);
  }
  for (const c of srd.conditions) if (c.id !== 'exhaustion') assert.ok(c.fx, `${c.name}: what it does`);
});

test('the numbers read from the words match the rules', () => {
  assert.deepEqual([S.fireball.dmgSlot[3], S.fireball.dmgSlot[9], S.fireball.how, S.fireball.save.success], ['8d6', '14d6', 'save', 'half']);
  assert.deepEqual([S['fire-bolt'].dmgLevel[1], S['fire-bolt'].dmgLevel[5], S['fire-bolt'].dmgLevel[17]], ['1d10', '2d10', '4d10']);
  assert.deepEqual([S['magic-missile'].dmgSlot[1], S['magic-missile'].count[1], S['magic-missile'].count[3], S['magic-missile'].how], ['1d4+1', 3, 5, 'auto']);
  assert.deepEqual([S['scorching-ray'].count[2], S['scorching-ray'].count[4], S['scorching-ray'].attack], [3, 5, 'ranged']);
  assert.deepEqual(S['eldritch-blast'].countLevel, { 1: 1, 5: 2, 11: 3, 17: 4 });
  assert.deepEqual([S['spiritual-weapon'].dmgSlot[2], S['spiritual-weapon'].dmgSlot[4]], ['1d8+MOD', '2d8+MOD']);
  assert.equal(S.moonbeam.dmgSlot[3], '3d10', 'the SRD\'s "1dl0" is read as 1d10');
  assert.equal(S['vampiric-touch'].drain, 'half');
  assert.deepEqual(S['hold-person'].save, { ability: 'wis', success: 'none' });
  assert.equal(S.web.how, 'incidental', 'burning webs are not the spell\'s harm (srd.engine-fixes.json)');
  assert.deepEqual(act('owlbear', 'Multiattack').multi, [{ Beak: 1, Claws: 1 }]);
  assert.deepEqual(act('bandit-captain', 'Multiattack').multi[0], { Scimitar: 2, Dagger: 1 });
  assert.deepEqual(act('adult-red-dragon', 'Multiattack').multi[0], { 'Frightful Presence': 1, Bite: 1, Claw: 2 });
  const bite = act('giant-spider', 'Bite');
  assert.deepEqual(bite.dmg, [['1d8+3', 'piercing']], 'the poison is the save\'s, not the hit\'s');
  assert.deepEqual([bite.rider.ability, bite.rider.dc, bite.rider.dmg, bite.rider.half, bite.rider.cond], ['con', 11, [['2d8', 'poison']], true, '']);
  assert.deepEqual([act('wolf', 'Bite').rider.cond, act('wolf', 'Bite').rider.dc], ['prone', 11]);
  // A versatile weapon: one damage or the other, never both (the book had none for these: hits for nothing).
  assert.deepEqual(act('guard', 'Spear').dmg, [['1d6+1', 'piercing']]);
  assert.deepEqual(act('guard', 'Spear').dmgAlt, [['1d8+1', 'piercing', 'if used with two hands to make a melee attack']]);
  assert.deepEqual(act('balor', 'Longsword').dmg, [['3d8+8', 'slashing'], ['3d8', 'lightning']], 'plus is more damage');
  assert.deepEqual([act('giant-spider', 'Web').onHit, act('giant-octopus', 'Tentacles').escape], [['restrained'], 16]);
  const sc = act('acolyte', 'Spellcasting').spells;
  assert.deepEqual([sc.ability, sc.dc, sc.hit, sc.slots[1], sc.list.length], ['wis', 12, 4, 3, 6]);
  assert.deepEqual(act('lamia', 'Innate Spellcasting').spells.list.find((x) => x.id === 'geas'), { id: 'geas', name: 'geas', level: null, use: '1/day' });
  assert.deepEqual(by(srd.conditions).restrained.fx.save, { dex: 'dis' });
});

test('a book of your own is read the same way, and its fixes win', () => {
  const book = {
    spells: [{ id: 'frost-lance', name: 'Frost Lance', level: 2, desc: 'Make a ranged spell attack. On a hit, the target takes 3d8 cold damage and is restrained until the end of its next turn.', higher: 'The damage increases by 1d8 for each slot level above 2nd.' }],
    monsters: [{ id: 'bog-hag', name: 'Bog Hag', traits: [], actions: [
      { n: 'Multiattack', d: 'The hag makes two claw attacks and one bite attack.' },
      { n: 'Claw', d: 'Melee Weapon Attack: +5 to hit, reach 5 ft., one target. Hit: 7 (1d8 + 3) slashing damage.' },
      { n: 'Bite', d: 'Melee Weapon Attack: +5 to hit, reach 5 ft., one target. Hit: 6 (1d6 + 3) piercing damage, and the target must succeed on a DC 13 Constitution saving throw or be poisoned for 1 minute.' },
    ] }],
  };
  const gaps = BOOK.compileBook(book, { spells: { 'frost-lance': { dmgType: 'cold' } } });
  assert.deepEqual(gaps, []);
  const fl = book.spells[0];
  assert.deepEqual([fl.attack, fl.dmgSlot[2], fl.dmgSlot[4], fl.how, fl.conds], ['ranged', '3d8', '5d8', 'attack', ['restrained']]);
  const [multi, claw, bite] = book.monsters[0].actions;
  assert.deepEqual(multi.multi, [{ Claw: 2, Bite: 1 }]);
  assert.deepEqual([claw.hit, claw.dmg, claw.kind, claw.reach], [5, [['1d8+3', 'slashing']], 'melee', 5]);
  assert.deepEqual([bite.rider.cond, bite.rider.dc, bite.rider.ability], ['poisoned', 13, 'con']);
  assert.equal(BOOK.compileSpell(fl), fl, 'read once');
});

test('the Engine plays the numbers: multiattack, rays and darts', () => {
  const T = table(21);
  const pc = hero(T, 'p1', 'Ila', 'wizard', { level: 3, spells: { cantrips: ['fire-bolt', 'light', 'mage-hand'], known: ['magic-missile', 'scorching-ray', 'shield', 'detect-magic', 'burning-hands', 'mage-armor', 'misty-step', 'sleep'], prepared: ['magic-missile', 'scorching-ray'] } });
  T.host({ type: 'foe.add', monster: 'ogre', count: 1 });
  const ogre = Object.values(T.s.foes)[0];
  let n = T.s.rolls.length;
  T.as('p1', { type: 'spell.cast', pcId: pc.id, spell: 'scorching-ray', targets: [`foe:${ogre.id}`] });
  assert.equal(T.s.rolls.slice(n).filter((r) => r.kind === 'attack').length, 3, 'three rays, three attack rolls');
  const hp = T.s.foes[ogre.id].hp;
  T.as('p1', { type: 'spell.cast', pcId: pc.id, spell: 'magic-missile', targets: [`foe:${ogre.id}`] });
  assert.ok(T.s.foes[ogre.id].hp <= hp - 6 || T.s.foes[ogre.id].dead, 'three darts of 1d4+1 never miss');
  // An owlbear's Multiattack: its beak and its claws, both rolled by the Engine.
  T.host({ type: 'foe.add', monster: 'owlbear', count: 1 });
  const bear = Object.values(T.s.foes).find((f) => f.mid === 'owlbear');
  n = T.s.rolls.length;
  T.host({ type: 'foe.act', foeId: bear.id, action: 'Multiattack', target: `pc:${pc.id}` });
  const labels = T.s.rolls.slice(n).filter((r) => r.kind === 'attack').map((r) => r.label.split(' vs ')[0]);
  assert.ok(labels.length >= 1 && labels[0] === 'Beak', `beak first: ${labels}`);
  assert.ok(labels.length === 2 || T.s.pcs[pc.id].hp <= 0, 'then the claws, unless the beak dropped her');
});

test('a giant spider\'s bite: the hit\'s damage, then a save against the poison', () => {
  const T = table(5);
  const pc = hero(T, 'p1', 'Bran', 'fighter');
  T.host({ type: 'foe.add', monster: 'giant-spider', count: 1 });
  const sp = Object.values(T.s.foes)[0];
  for (let k = 0; k < 12 && !T.s.requests.some((q) => q.kind === 'save'); k++) {
    T.s.pcs[pc.id].hp = T.s.pcs[pc.id].maxHp;
    T.host({ type: 'foe.act', foeId: sp.id, action: 'Bite', target: `pc:${pc.id}` });
  }
  const q = T.s.requests.find((x) => x.kind === 'save');
  assert.ok(q, 'a hit asks for a save');
  assert.deepEqual([q.ability, q.dc, q.effect.type, q.effect.half], ['con', 11, 'poison', true]);
});

test('after its Multiattack, a monster has no attacks left this turn', () => {
  const T = table(8);
  const pc = hero(T, 'p1', 'Bran', 'fighter');
  T.host({ type: 'foe.add', monster: 'owlbear', count: 1 });
  const bear = Object.values(T.s.foes)[0];
  T.host({ type: 'fight.start', autoRoll: true });
  if (T.s.fight.phase === 'initiative') T.host({ type: 'fight.begin' });
  for (let k = 0; k < 4 && T.s.fight.order[T.s.fight.turn].key !== `foe:${bear.id}`; k++) T.host({ type: 'fight.next' });
  assert.equal(T.s.fight.order[T.s.fight.turn].key, `foe:${bear.id}`);
  T.s.pcs[pc.id].hp = 200; T.s.pcs[pc.id].maxHp = 200;
  T.ai({ type: 'foe.act', foeId: bear.id, action: 'Multiattack', target: `pc:${pc.id}` });
  assert.throws(() => T.ai({ type: 'foe.act', foeId: bear.id, action: 'Claws', target: `pc:${pc.id}` }), /made all its attacks this turn/);
});

test('"bludgeoning or force damage (its choice)" is read as the first type (Encounters in the Far North, 27 Nov)', async () => {
  const { compileMonster } = await import('../engine/book.js');
  const mon = { id: 't', name: 'Tomb Tapper', actions: [{ n: 'Sledgehammer', d: "Melee or Ranged Weapon Attack: +10 to hit, reach 15 ft. or range 30/120 ft., one target. Hit: 27 (6d6 + 6) bludgeoning or force damage (tomb tapper's choice)." }] };
  compileMonster(mon, []);
  assert.deepEqual(mon.actions[0].dmg, [['6d6+6', 'bludgeoning']]);
});

test('two features a book export ran together become two, a list of choices stays whole (the yeti, 27 Nov)', async () => {
  const { splitGlued, compileMonster } = await import('../engine/book.js');
  const yeti = { id: 'yeti', name: 'Yeti', ab: [18, 13, 16, 8, 12, 7], traits: [], actions: [
    { n: 'Claw', d: 'Melee Weapon Attack: +6 to hit, reach 5 ft., one target. Hit: 7 (1d6 + 4) slashing damage plus 3 (1d6) cold damage. Chilling Gaze. The yeti targets one creature it can see within 30 feet of it. If the target can see the yeti, the target must succeed on a DC 13 Constitution saving throw against this magic or take 10 (3d6) cold damage and then be paralyzed for 1 minute.' }] };
  compileMonster(yeti);
  assert.deepEqual(yeti.actions.map((a) => a.n), ['Claw', 'Chilling Gaze']);
  assert.deepEqual(yeti.actions[0].dmg, [['1d6+4', 'slashing'], ['1d6', 'cold']], 'the claw no longer deals the gaze\'s 3d6');
  const breath = [{ n: 'Breath Weapons (Recharge 5-6)', d: 'The dragon uses one of the following breath weapons. Fire Breath. The dragon exhales fire in a 20-foot line. Sleep Breath. The dragon exhales sleep gas.' }];
  assert.equal(splitGlued(breath).length, 1);
  const grab = [{ n: 'Tentacle', d: 'Hit: 9 (2d6 + 2) bludgeoning damage, and the target is grappled (escape DC 13). Until this grapple ends, the target is Restrained. The kraken can grapple one target.' }];
  assert.equal(splitGlued(grab).length, 1);
});
