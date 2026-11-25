// The adventure's own rules (engine/triggers.js, run by engine/ledger.js), the Engine's two defaults (an
// attack with no fight on starts one; a fight ends when no foe is left), overriding a rule, and fights
// fitted to the party at the table (engine/scale.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeRng } from '../engine/dice.js';
import { newSession, apply, openAdventure, rulesHere } from '../engine/ledger.js';
import * as TRIG from '../engine/triggers.js';
import { checkAdventure } from '../engine/check.js';
import { ADVENTURES, adventureById } from '../data/adventures/index.js';
import { prepareSrd } from '../engine/library.js';
import * as PG from '../engine/pregen.js';
import { toolbox } from '../brain/tools.js';
import { briefing, directorTurn, declaresAttack } from '../brain/director.js';
import { srd, adventure, table, hero } from './helpers.js';

const srdAll = JSON.parse(readFileSync(new URL('../../data/srd.engine.json', import.meta.url), 'utf8'));
prepareSrd(srdAll, { adventures: ADVENTURES });
const ashen = adventureById('ashen-crown');

const foesAt = (T, site, base) => Object.values(T.s.foes).filter((f) => f.siteId === site && (!base || f.base === base));
const ruleLines = (T) => T.s.log.filter((l) => l.kind === 'rule').map((l) => l.text);
// Every roll on the table comes out the same: a fail (1) or a success (20).
function forceRolls(T, pid, nat) { for (const q of T.s.requests.slice()) { const p = Object.values(T.s.players).find((x) => x.pcId === q.pcId); T.as(p ? p.id : pid, { type: 'roll.make', id: q.id, own: [nat] }); } }

test('rules read and describe themselves, and the checker finds broken ones', () => {
  const r = TRIG.normRule({ when: 'fail:perception', do: 'fight', surprise: 'the party' }, 'mill-road', 0);
  assert.deepEqual(r.when, { ev: 'fail', arg: 'perception', raw: 'fail perception' });
  assert.equal(r.surprise, 'party');
  assert.equal(r.key, 'mill-road/r1');
  assert.match(TRIG.ruleWords(r, adventure), /^When a Perception check here fails: a fight starts, and the party is surprised\./);
  const d = TRIG.normRule({ when: 'down', who: 'Goblin scout', count: 2, do: 'flee', to: 'tower-gate' }, 'mill-road', 1);
  assert.match(TRIG.ruleWords(d, adventure), /When two of Goblin scout are down: Goblin scout flees to The Tumbledown Gate/);
  assert.equal(TRIG.normRule({ when: 'round', do: 'tick', clock: 'X' }, 'a', 0).once, false, 'every round, not once');
  const bad = { id: 'bad', name: 'Bad', sites: [{ id: 'a', name: 'A', exits: [], foes: [{ monster: 'goblin', count: 2, name: 'Goblin' }],
    rules: [{ when: 'sunrise', do: 'fight' }, { when: 'down', do: 'explode' }, { when: 'enter', do: 'tick', clock: 'Nope' }, { when: 'enter', do: 'flee', who: 'Goblin', to: 'nowhere' }, { when: 'fail stealthiness', do: 'fight' }] }] };
  const c = checkAdventure(bad, srd);
  const text = c.errors.map((e) => e.text).join('\n');
  for (const re of [/"sunrise" is not something a rule can wait for/, /"explode" is not something a rule can do/, /say who/, /no clock is called "Nope"/, /no place "nowhere"/, /"stealthiness" is not a skill/]) assert.match(text, re);
  for (const a of [adventure, ashen]) assert.equal(checkAdventure(a, srdAll).errors.length, 0, `${a.id} checks clean`);
});

test('the Mill Road: a failed Perception check springs the ambush, a success reveals the scouts', () => {
  for (const [nat, want] of [[1, 'ambush'], [20, 'spotted']]) {
    const T = table(4);
    const bryn = hero(T, 'p1', 'Bryn');
    T.host({ type: 'site.move', siteId: 'mill-road' });
    T.ai({ type: 'roll.ask', pcIds: [bryn.id], kind: 'check', skill: 'perception', dc: 12, reason: 'Anything watching the road?' });
    forceRolls(T, 'p1', nat);
    if (want === 'ambush') {
      assert.ok(T.s.fight, 'a fight starts');
      assert.deepEqual(T.s.fight.surprised, [`pc:${bryn.id}`], 'the party is surprised');
      assert.ok(foesAt(T, 'mill-road').every((f) => !f.hidden));
    } else {
      assert.equal(T.s.fight, null);
      assert.ok(foesAt(T, 'mill-road').every((f) => !f.hidden), 'the scouts are seen');
    }
    assert.ok(ruleLines(T).some((l) => l.includes(`[rule mill-road/${want}]`)), want);
  }
});

test('two scouts down: the last runs to the watchtower, and is there when the party arrives', () => {
  const T = table(5);
  hero(T, 'p1', 'Bryn');
  T.host({ type: 'site.move', siteId: 'mill-road' });
  const [a, b, c] = foesAt(T, 'mill-road', 'Goblin scout');
  T.host({ type: 'damage', target: `foe:${a.id}`, amount: 99 });
  assert.ok(!T.s.foes[c.id].dead);
  T.host({ type: 'damage', target: `foe:${b.id}`, amount: 99 });
  assert.ok(T.s.foes[c.id].fled, 'the third scout flees');
  const there = foesAt(T, 'tower-gate', 'Goblin scout');
  assert.equal(there.length, 1);
  assert.ok(there[0].hidden && !there[0].dead && /fled here from The Mill Road/.test(there[0].note));
  assert.ok(ruleLines(T).some((l) => /Goblin scout 3 flees toward The Tumbledown Gate/.test(l)));
});

test('an attack with no fight on starts one; the fight ends by itself when the last foe falls', () => {
  const T = table(6);
  const bryn = hero(T, 'p1', 'Bryn');
  T.host({ type: 'site.move', siteId: 'mill-road' });
  T.host({ type: 'foe.reveal' });
  const g = foesAt(T, 'mill-road')[0];
  T.as('p1', { type: 'attack', pcId: bryn.id, attack: bryn.attacks[0].id, target: `foe:${g.id}` });
  assert.ok(T.s.fight, 'the attack started the fight');
  assert.ok(T.s.log.some((l) => /A fight starts here \(Bryn struck first\)\. \[rule \*\/attack\]/.test(l.text)));
  for (const f of foesAt(T, 'mill-road')) if (!f.dead) T.host({ type: 'damage', target: `foe:${f.id}`, amount: 99 });
  assert.equal(T.s.fight, null, 'the fight ended by itself');
  assert.ok(T.s.pcs[bryn.id].xp > 0, 'and paid its XP');
});

test('the watchtower: Grisk sells out and runs when hurt with his goblin down; the milestone is paid once', () => {
  const T = table(7);
  hero(T, 'p1', 'Bryn');
  for (const site of ['mill-road', 'tower-gate', 'watchtower']) T.host({ type: 'site.move', siteId: site });
  const grisk = foesAt(T, 'watchtower', 'Grisk')[0];
  const guard = foesAt(T, 'watchtower', 'Goblin guard')[0];
  T.host({ type: 'fight.start', autoRoll: true });
  T.host({ type: 'damage', target: `foe:${grisk.id}`, amount: Math.ceil(grisk.maxHp / 2) + 1 });
  assert.ok(!T.s.foes[grisk.id].dead, 'hurt, but his goblin still stands: he fights on');
  const xp0 = Object.values(T.s.pcs)[0].xp;
  T.host({ type: 'damage', target: `foe:${guard.id}`, amount: 99 });
  assert.ok(T.s.foes[grisk.id].fled, 'now he runs');
  assert.equal(T.s.fight, null, 'nobody is left: the fight ends');
  const pc = Object.values(T.s.pcs)[0];
  assert.ok(pc.xp >= xp0 + 300, 'the 300 XP milestone is paid (with the fight XP)');
  // The Director paying the same milestone again changes nothing.
  const tb = toolbox({ state: T.s, adventure, srd, rng: makeRng(1), now: 1 });
  const out = tb.run('award_xp', { amount: 300, each: true, why: 'Nell freed' });
  assert.match(out.note, /already awarded here/);
  assert.equal(tb.state.pcs[pc.id].xp, pc.xp);
});

test('the sanctum and home: Aldane leaps, the captives are freed, and the lantern goes home', () => {
  const T = table(8);
  hero(T, 'p1', 'Bryn');
  for (const site of ['causeway', 'chapel', 'crypt', 'sanctum']) T.host({ type: 'site.move', siteId: site });
  const aldane = foesAt(T, 'sanctum', 'Brother Aldane')[0];
  T.host({ type: 'fight.start', autoRoll: true });
  T.host({ type: 'damage', target: `foe:${aldane.id}`, amount: aldane.hp - 5 });
  assert.ok(T.s.foes[aldane.id].fled, 'below 10 hit points he leaps into the pool');
  for (const f of foesAt(T, 'sanctum')) if (!f.dead) T.host({ type: 'damage', target: `foe:${f.id}`, amount: 99 });
  assert.ok(T.s.quests.find((q) => /vanished/.test(q.text)).done, 'the vanished are found');
  assert.ok(!T.s.quests.find((q) => /lantern/i.test(q.text)).done, 'the lantern is not home yet');
  assert.ok(ruleLines(T).some((l) => /ring of keys frees the four villagers/.test(l)));
  // Home: the watchtower was never visited in this game, so the lantern rule waits.
  T.host({ type: 'site.move', siteId: 'thornwick' });
  assert.ok(!T.s.quests.find((q) => /lantern/i.test(q.text)).done);
  // With the watchtower behind them, coming home finishes it.
  const U = table(9);
  hero(U, 'p1', 'Bryn');
  for (const site of ['mill-road', 'tower-gate', 'watchtower', 'causeway', 'chapel', 'crypt', 'sanctum', 'thornwick']) U.host({ type: 'site.move', siteId: site });
  assert.ok(U.s.quests.find((q) => /lantern/i.test(q.text)).done);
});

test('overrides: a rule switched off never fires; one that fired is undone; a fight an attack started is called off', () => {
  const T = table(10);
  hero(T, 'p1', 'Bryn');
  for (const site of ['mill-road', 'tower-gate', 'watchtower']) T.host({ type: 'site.move', siteId: site });
  // They talked Grisk down: his rule is off.
  T.ai({ type: 'rule.override', id: 'watchtower/grisk-sells', reason: 'they made a deal with Grisk' });
  assert.equal(rulesHere(T.s, adventure).find((r) => r.id === 'grisk-sells').status, 'off');
  const grisk = foesAt(T, 'watchtower', 'Grisk')[0];
  const guard = foesAt(T, 'watchtower', 'Goblin guard')[0];
  T.host({ type: 'damage', target: `foe:${guard.id}`, amount: 99 });
  T.host({ type: 'damage', target: `foe:${grisk.id}`, amount: grisk.maxHp - 2 });
  assert.ok(!T.s.foes[grisk.id].fled, 'Grisk does not run');
  // The milestone fired when he fell: undone, the XP comes back off.
  T.host({ type: 'damage', target: `foe:${grisk.id}`, amount: 99 });
  const pc = Object.values(T.s.pcs)[0];
  const xp = pc.xp;
  T.ai({ type: 'rule.override', id: 'milestone', reason: 'Nell is not freed yet' });
  assert.equal(T.s.pcs[pc.id].xp, xp - 300);
  assert.ok(T.s.log.some((l) => /Rule watchtower\/milestone undone \(Nell is not freed yet\): the milestone XP is taken back/.test(l.text)));
  // A fight started by an attack can be called off.
  const U = table(11);
  const bryn = hero(U, 'p1', 'Bryn');
  U.host({ type: 'site.move', siteId: 'mill-road' });
  U.ai({ type: 'rule.event', event: 'attack', by: `pc:${bryn.id}` });
  assert.ok(U.s.fight);
  const tb = toolbox({ state: U.s, adventure, srd, rng: makeRng(1), now: 1 });
  const out = tb.run('override_rule', { rule: '*/attack', reason: 'it was a feint' });
  assert.ok(out.ok && !out.refused);
  assert.equal(tb.state.fight, null);
  assert.ok(out.adventure_rules.some((l) => /the fight is called off/.test(l)));
  // A rule that is not there is a real no, with the rules that are.
  const bad = tb.run('override_rule', { rule: 'the dragon wakes', reason: 'x' });
  assert.match(bad.refused, /There is no rule "the dragon wakes" here\. .*Choose from: mill-road\/ambush/);
});

test('the DM can turn the rules off, and fights are left as written or only made easier', () => {
  const T = table(12);
  hero(T, 'p1', 'Bryn');
  T.host({ type: 'auto.set', rules: false });
  T.host({ type: 'site.move', siteId: 'mill-road' });
  const [a, b, c] = foesAt(T, 'mill-road');
  T.host({ type: 'damage', target: `foe:${a.id}`, amount: 99 });
  T.host({ type: 'damage', target: `foe:${b.id}`, amount: 99 });
  assert.ok(!T.s.foes[c.id].fled, 'nothing happens by itself');
  assert.throws(() => T.host({ type: 'auto.set', scale: 'sideways' }), /Fit fights/);
});

test('fights are fitted to the party at the table: numbers first, then hit points, once per place', () => {
  // Two 5th-level heroes at the chapel (written for four or five of 2nd level): a party smaller than
  // written never gets more foes (the simulation wiped them half the time), it gets tougher ones.
  const T = table(13, { auto: { rules: true, scale: 'auto' } });
  hero(T, 'p1', 'Bryn', 'fighter', { level: 5 });
  hero(T, 'p2', 'Ila', 'cleric', { level: 5 });
  T.s.started = true;
  for (const site of ['causeway', 'chapel']) T.host({ type: 'site.move', siteId: site });
  const zombies = foesAt(T, 'chapel', 'Drowned villager');
  assert.equal(zombies.length, 3, 'the three written');
  assert.ok(zombies[0].maxHp > 22, 'with more hit points');
  assert.match(T.s.fits.chapel.text, /written for four to five characters of 2nd level, the party here is two of 5th level\. hit points ×1\.5/);
  // A bigger party than written gets more foes.
  const B = table(20, { auto: { rules: true, scale: 'auto' } });
  for (const [pid, nm] of [['p1', 'A'], ['p2', 'B'], ['p3', 'C'], ['p4', 'D'], ['p5', 'E'], ['p6', 'F']]) hero(B, pid, nm, 'fighter', { level: 3 });
  B.s.started = true;
  for (const site of ['causeway', 'chapel']) B.host({ type: 'site.move', siteId: site });
  assert.ok(foesAt(B, 'chapel', 'Drowned villager').length > 3, 'six 3rd-level heroes meet more of the drowned');
  const b = briefing(T.s, adventure, srd, { reason: 'test' });
  assert.match(b, /FITTED TO THIS PARTY: .*Describe the numbers as they are here/);
  // One 1st-level hero at the sanctum: a skeleton less and thinner hit points; the boss stays one.
  const U = table(14, { auto: { rules: true, scale: 'auto' } });
  hero(U, 'p1', 'Bryn');
  U.s.started = true;
  for (const site of ['causeway', 'chapel', 'crypt', 'sanctum']) U.host({ type: 'site.move', siteId: site });
  assert.equal(foesAt(U, 'sanctum', 'Brother Aldane').length, 1);
  assert.ok(foesAt(U, 'sanctum', 'Sanctum skeleton').length < 2);
  assert.ok(foesAt(U, 'sanctum', 'Brother Aldane')[0].maxHp < 33, 'hit points scaled down');
  // "down" only ever makes it easier; "off" leaves it as written.
  const V = table(15, { auto: { rules: true, scale: 'down' } });
  hero(V, 'p1', 'Bryn', 'fighter', { level: 5 }); hero(V, 'p2', 'Ila', 'cleric', { level: 5 });
  V.s.started = true;
  for (const site of ['causeway', 'chapel']) V.host({ type: 'site.move', siteId: site });
  assert.equal(foesAt(V, 'chapel', 'Drowned villager').length, 3);
  // A fight on the first place is fitted when it starts.
  const W = { s: openAdventure({ ...newSession(ashen), auto: { rules: true, scale: 'auto' } }, ashen, { role: 'host', pid: null, rng: makeRng(2), now: 1, adventure: ashen, srd: srdAll }) };
  const act = (a, role = 'host', pid = null) => { W.s = apply(W.s, a, { role, pid, rng: makeRng(3), now: 2, adventure: ashen, srd: srdAll }); };
  for (const [pid, id] of [['p1', 'bram'], ['p2', 'hilde'], ['p3', 'pell']]) { act({ type: 'join', name: pid }, 'player', pid); act({ type: 'pc.create', input: PG.pregenBuild(id, srdAll, 3, ashen.pregens) }, 'player', pid); }
  assert.equal(Object.values(W.s.foes).filter((f) => f.base === 'Iron Brand goblin').length, 4, 'not fitted before the game starts');
  act({ type: 'rules.run', starting: true });
  assert.ok(W.s.fight, 'the ambush starts the game');
  assert.equal(Object.values(W.s.foes).filter((f) => f.base === 'Iron Brand goblin').length, 2, 'three 3rd-level heroes (fewer than the four written): two goblins fewer');
});

test('the Ashen Crown bridge: the bridge burns each round and the captain runs at the end of round 2', () => {
  const W = { s: openAdventure({ ...newSession(ashen), auto: { rules: true, scale: 'off' } }, ashen, { role: 'host', pid: null, rng: makeRng(2), now: 1, adventure: ashen, srd: srdAll }) };
  const act = (a, role = 'host', pid = null) => { W.s = apply(W.s, a, { role, pid, rng: makeRng(4), now: 2, adventure: ashen, srd: srdAll }); };
  act({ type: 'join', name: 'p1' }, 'player', 'p1');
  act({ type: 'pc.create', input: PG.pregenBuild('bram', srdAll, 1, ashen.pregens) }, 'player', 'p1');
  act({ type: 'rules.run', starting: true });
  act({ type: 'fight.begin' });
  const clock = () => (W.s.clocks.find((c) => c.name === 'The burning bridge') || {}).filled;
  assert.equal(clock(), 0, 'not before the first round has ended');
  for (let i = 0; i < 40 && W.s.fight.round < 3; i++) act({ type: 'fight.next' });
  assert.equal(clock(), 2, 'one segment at the end of each round');
  const cap = Object.values(W.s.foes).find((f) => f.base === 'Iron Brand captain');
  assert.ok(cap.fled, 'the captain is gone through the postern');
  assert.ok(W.s.log.some((l) => /\[rule highbridge\/captain-runs\]/.test(l.text)));
});

test('a player\'s declared attack is heard; questions, refusals and harmless doors are not', () => {
  const T = table(16);
  hero(T, 'p1', 'Bryn');
  T.host({ type: 'site.move', siteId: 'mill-road' });
  for (const yes of ['I draw my battleaxe and charge the mill door!', 'Enough talk. I attack Grisk!', 'I swing at the nearest goblin!', 'I kick in the door and attack the nearest scout!', 'We shoot them before they move.'])
    assert.ok(declaresAttack(yes, T.s), yes);
  for (const no of ['Should we attack?', 'I do not attack: I raise my hands.', 'I kick the door open.', 'We hit the road at dawn.', 'I strike a bargain with the scouts.', 'If they move, I attack.'])
    assert.ok(!declaresAttack(no, T.s), no);
  // Nobody here to fight: nothing to hear.
  const U = table(17);
  hero(U, 'p1', 'Bryn');
  assert.ok(!declaresAttack('I attack!', U.s));
});

test('the Director: the Engine starts the fight a player declared before the model\'s turn, and says so', async () => {
  const T = table(18);
  const bryn = hero(T, 'p1', 'Bryn');
  T.host({ type: 'site.move', siteId: 'mill-road' });
  T.host({ type: 'narrate', text: 'The mill is quiet. Bryn, what do you do?' });
  T.as('p1', { type: 'say', text: 'I draw my battleaxe and charge the mill door!' });
  const seen = [];
  const provider = { start() { return { send(t) { seen.push(t); return Promise.resolve({ text: 'Goblins spill out of the mill, blades drawn! Bryn, roll for initiative on your screen.', calls: [], usage: { in: 1, out: 1 } }); }, results() { return Promise.resolve({ text: 'x', calls: [], usage: { in: 1, out: 1 } }); } }; } };
  const out = await directorTurn({ state: T.s, adventure, srd, provider, rng: makeRng(1), reason: 'a player spoke' });
  assert.ok(out.state.fight, 'the fight is on');
  assert.equal(out.calls[0].name, '(a player attacks)');
  assert.match(seen[0], /THE ENGINE DID THIS BY ITSELF SINCE YOUR LAST NARRATION \(narrate it\): A fight starts here \(Bryn struck first\)/);
  assert.match(seen[0], /THE ADVENTURE'S RULES HERE .*\n- \[mill-road\/ambush\] When a Perception check here fails/);
  assert.equal(out.refusals, 0);
  void bryn;
});

test('a hero\'s damage spells do harm: the damage is read from the spell\'s words (found by the simulation)', () => {
  const T = table(19);
  const w = hero(T, 'p1', 'Wyn', 'wizard', { level: 5, spells: { cantrips: ['fire-bolt', 'light', 'mage-hand'], known: ['fireball', 'magic-missile', 'shield', 'sleep', 'burning-hands', 'thunderwave'], prepared: ['fireball', 'magic-missile', 'shield', 'burning-hands'] } });
  T.host({ type: 'foe.add', monster: 'ogre', count: 1 });
  const ogre = Object.values(T.s.foes)[0];
  T.as('p1', { type: 'spell.cast', pcId: w.id, spell: 'fireball', targets: [`foe:${ogre.id}`] });
  assert.ok(T.s.foes[ogre.id].hp < ogre.maxHp, 'the fireball burns');
  assert.match(T.s.story.filter((e) => /Fireball/.test(e.text)).at(-1).text, /\d+ fire damage/);
});

test('the AI Director ending a won fight with a foe still standing in the record: it counts as beaten, and the place\'s rules follow', () => {
  const T = table(22);
  hero(T, 'p1', 'Bryn');
  for (const site of ['causeway', 'chapel']) T.host({ type: 'site.move', siteId: site });
  T.host({ type: 'fight.start', autoRoll: true });
  const [a, b, c] = foesAt(T, 'chapel');
  T.host({ type: 'damage', target: `foe:${a.id}`, amount: 99 });
  T.host({ type: 'damage', target: `foe:${b.id}`, amount: 99 });
  T.host({ type: 'damage', target: `foe:${c.id}`, amount: 5 });
  const xp = Object.values(T.s.pcs)[0].xp;
  T.ai({ type: 'fight.end' });
  assert.equal(T.s.fight, null);
  assert.ok(T.s.foes[c.id].dead && T.s.foes[c.id].beaten, 'the last one is beaten');
  assert.ok(T.s.log.some((l) => /\[rule chapel\/milestone\]/.test(l.text)), 'the milestone for clearing the chapel is paid');
  assert.ok(Object.values(T.s.pcs)[0].xp >= xp + 150 + 150, 'the fight XP (all three) and the milestone');
  // A party that flees leaves them standing.
  const U = table(23);
  hero(U, 'p1', 'Bryn');
  U.host({ type: 'site.move', siteId: 'mill-road' });
  U.host({ type: 'fight.start', autoRoll: true });
  U.ai({ type: 'fight.end', award: false });
  assert.ok(foesAt(U, 'mill-road').every((f) => !f.dead));
});
