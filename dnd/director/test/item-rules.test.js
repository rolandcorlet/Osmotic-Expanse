// Rules on items and objects (engine/triggers.js, run by engine/ledger.js): a character using something
// (the chest), a character stepping into an area while carrying something, the party's token deciding how
// the foes meet them when a fight starts, and a foe's turn decided by what the party has.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../engine/dice.js';
import { rulesHere } from '../engine/ledger.js';
import * as TRIG from '../engine/triggers.js';
import { checkAdventure } from '../engine/check.js';
import { toolbox } from '../brain/tools.js';
import { briefing } from '../brain/director.js';
import { srd, table, hero } from './helpers.js';

const vault = {
  id: 'vault', name: 'The Vault', levels: '1', party: { size: [1, 4], level: 1 }, quests: ['Open the vault.'],
  intro: 'A road.', blurb: '', ending: '',
  sites: [
    { id: 'road', name: 'The Road', level: 1, read: 'A road.', exits: [{ to: 'hall', label: 'in' }] },
    { id: 'hall', name: 'The Hall', level: 1, read: 'A hall.', exits: [{ to: 'road', label: 'out' }, { to: 'crypt', label: 'down' }],
      zones: [{ name: 'Door', x: 0.05, y: 0.3, w: 0.4, h: 0.4, entry: true, links: ['altar'] }, { name: 'Altar', x: 0.55, y: 0.3, w: 0.4, h: 0.4, links: ['door'] }],
      objects: [{ name: 'Iron chest', note: 'Locked.' }, 'Lever'],
      foes: [{ monster: 'goblin', count: 2, name: 'Goblin' }],
      rules: [
        { id: 'arrive', when: 'enter', do: 'say', say: 'Dust everywhere.', once: false },
        { id: 'chest', when: 'use iron chest', do: 'give', item: 'Silver key', gold: 40, say: 'Under the rags: a silver key.' },
        { id: 'needle', when: 'use iron chest', if: 'not carries gloves', do: 'say', say: 'A needle pricks the hand that opened it.' },
        { id: 'altar', when: 'enter Altar', if: 'carries silver key', do: 'say', say: 'The altar flares.' },
        { id: 'token', when: 'fight', if: 'has chieftain token', do: 'calm', target: 'Goblin', say: 'They know the token and lower their spears.' },
      ] },
    { id: 'crypt', name: 'The Crypt', level: 1, read: 'Bones.', exits: [{ to: 'hall', label: 'up' }],
      foes: [{ monster: 'skeleton', count: 1, name: 'Bone guard' }],
      rules: [{ id: 'recoil', when: 'turn Bone guard', if: 'has sun disc', do: 'say', say: 'It will not touch the bearer of the Sun Disc.' }] },
  ],
};
const rules = (T) => T.s.log.filter((l) => l.kind === 'rule').map((l) => l.text);
const inv = (T, pc) => T.s.pcs[pc.id].inventory.map((x) => `${x.qty} ${x.name}`);
function party(seed = 3) {
  const T = table(seed, { adv: vault });
  const bryn = hero(T, 'p1', 'Bryn');
  const ila = hero(T, 'p2', 'Ila', 'rogue');
  T.host({ type: 'site.move', siteId: 'hall' });
  return { T, bryn, ila };
}

test('the new rules read in words, and the checker knows them', () => {
  assert.equal(checkAdventure(vault, srd).errors.length, 0, JSON.stringify(checkAdventure(vault, srd).errors));
  const w = (r, site = 'hall') => TRIG.ruleWords(TRIG.normRule(r, site, 0), vault);
  assert.equal(w(vault.sites[1].rules[1]), 'When a character uses the iron chest: Silver key and 40 gp goes to that character. Under the rags: a silver key.');
  assert.match(w(vault.sites[1].rules[3]), /^When a character enters Altar, if that character carries silver key: The altar flares\./);
  assert.match(w(vault.sites[1].rules[4]), /^When a fight starts here \(before anyone acts\), if the party has got chieftain token: Goblin stands down/);
  assert.match(w(vault.sites[2].rules[0], 'crypt'), /^When Bone guard's turn begins, if the party has got sun disc:/);
  assert.equal(TRIG.normRule(vault.sites[2].rules[0], 'crypt', 0).once, false, 'a turn rule happens every turn');
  assert.deepEqual(TRIG.parseWhen('opens the iron chest'), { ev: 'use', arg: 'iron chest', raw: 'opens the iron chest' });
  const bad = { ...vault, sites: [vault.sites[0], { ...vault.sites[1], rules: [{ when: 'use', do: 'say', say: 'x' }, { when: 'enter Vestry', do: 'say', say: 'x' }, { when: 'use lever', do: 'give' }, { when: 'use lever', if: 'carries', do: 'say', say: 'x' }, { when: 'use wardrobe', do: 'say', say: 'x' }] }, vault.sites[2]] };
  const c = checkAdventure(bad, srd);
  const text = [...c.errors, ...c.warnings].map((e) => e.text).join('\n');
  for (const re of [/say what is used/, /no zone "Vestry" here \(zones: Door, Altar\)/, /say what is given/, /name the item \("carries silver key"\)/, /no object here is called "wardrobe"/]) assert.match(text, re);
});

test('opening the chest: what is in it goes to whoever opened it, once; the trap fires; undo takes it back', () => {
  const { T, bryn, ila } = party();
  T.as('p1', { type: 'object.use', who: `pc:${bryn.id}`, object: 'Iron chest', how: 'open' });
  assert.ok(T.s.story.some((e) => e.text === 'Bryn opens the Iron chest.'));
  assert.ok(inv(T, bryn).includes('1 Silver key'));
  const gold = T.s.pcs[bryn.id].gold;
  assert.ok(rules(T).some((l) => /^Bryn gets Silver key and 40 gp\. Under the rags: a silver key\. \[rule hall\/chest\]$/.test(l)));
  assert.ok(rules(T).some((l) => /A needle pricks the hand that opened it\. \[rule hall\/needle\]/.test(l)));
  // A player cannot use the chest for someone else's character; the second opening gives nothing more.
  assert.throws(() => T.as('p1', { type: 'object.use', who: `pc:${ila.id}`, object: 'Iron chest' }), /not your character/);
  T.as('p2', { type: 'object.use', who: `pc:${ila.id}`, object: 'chest' });
  assert.ok(!inv(T, ila).some((x) => /Silver key/.test(x)));
  assert.equal(rules(T).filter((l) => /hall\/chest/.test(l)).length, 1);
  // Something with no rule is only a story line: the Director says what happens.
  const before = rules(T).length;
  T.host({ type: 'object.use', who: 'Ila', object: 'Lever', how: 'pulls' });
  assert.ok(T.s.story.some((e) => e.text === 'Ila pulls the Lever.'));
  assert.equal(rules(T).length, before);
  // Undone: the key and the gold go back.
  T.host({ type: 'rule.override', id: 'hall/chest', reason: 'it was empty after all' });
  assert.ok(!inv(T, bryn).some((x) => /Silver key/.test(x)));
  assert.equal(T.s.pcs[bryn.id].gold, gold - 40);
});

test('stepping into the altar: only a character carrying the key sets it off, and the arrival is not repeated', () => {
  const { T, bryn, ila } = party();
  T.host({ type: 'loot.give', pcId: bryn.id, item: 'Silver key' });
  const arrivals = rules(T).filter((l) => /hall\/arrive/.test(l)).length;
  T.host({ type: 'map.move', who: `pc:${ila.id}`, zone: 'Altar' });
  assert.ok(!rules(T).some((l) => /hall\/altar/.test(l)), 'Ila has no key');
  T.host({ type: 'map.move', who: `pc:${bryn.id}`, zone: 'Altar' });
  assert.ok(rules(T).some((l) => /^\(Bryn carries silver key\.\) The altar flares\. \[rule hall\/altar\]$/.test(l)), rules(T).join('\n'));
  assert.equal(rules(T).filter((l) => /hall\/arrive/.test(l)).length, arrivals, 'moving between zones is not arriving');
  assert.equal(rulesHere(T.s, vault).find((r) => r.id === 'altar').status, 'done');
});

test('the token: the goblins stand down when the fight starts; attacking them starts a real one', () => {
  const { T, bryn } = party();
  T.host({ type: 'loot.give', item: 'Chieftain token' });
  T.host({ type: 'foe.reveal' });
  T.host({ type: 'rule.event', event: 'attack', by: `pc:${bryn.id}` });
  assert.equal(T.s.fight, null, 'the fight is over before it began');
  const gobs = Object.values(T.s.foes).filter((f) => f.siteId === 'hall');
  assert.ok(gobs.every((f) => f.calm && !f.dead), 'standing, and standing down');
  assert.ok(rules(T).some((l) => /^Goblin 1, Goblin 2 stand down: no fight with them unless the party attacks\. They know the token and lower their spears\. \[rule hall\/token\]$/.test(l)), rules(T).join('\n'));
  assert.ok(rules(T).some((l) => /No foe is still fighting: the fight is over/.test(l)));
  assert.equal(T.s.pcs[bryn.id].xp || 0, 0, 'no XP for a fight not fought');
  assert.match(briefing(T.s, vault, srd), /STANDING DOWN/);
  // They are attacked anyway: a new fight, and the token rule has had its say.
  T.as('p1', { type: 'attack', pcId: bryn.id, attack: bryn.attacks[0].id, target: `foe:${gobs[0].id}` });
  assert.ok(T.s.fight, 'a fight is on');
  assert.ok(Object.values(T.s.foes).filter((f) => f.siteId === 'hall').every((f) => !f.calm));
  // Without the token, the fight is an ordinary one.
  const U = party(5);
  U.T.host({ type: 'foe.reveal' });
  U.T.host({ type: 'rule.event', event: 'attack', by: `pc:${U.bryn.id}` });
  assert.ok(U.T.s.fight);
  assert.ok(!rules(U.T).some((l) => /hall\/token/.test(l)));
});

test('a foe\'s turn: the rule is told each turn while the party has the Sun Disc', () => {
  const { T, bryn } = party();
  T.host({ type: 'loot.give', pcId: bryn.id, item: 'Sun disc' });
  T.host({ type: 'site.move', siteId: 'crypt' });
  T.host({ type: 'foe.reveal' });
  T.host({ type: 'fight.start', autoRoll: true });
  for (let n = 0; n < 6 && T.s.fight; n++) T.host({ type: 'fight.next' });
  const told = rules(T).filter((l) => /crypt\/recoil/.test(l));
  assert.ok(told.length >= 2, `told each turn (${told.length})`);
  assert.match(told[0], /^\(Bryn carries sun disc\.\) It will not touch the bearer of the Sun Disc\./);
});

test('the Director\'s use_object: the briefing lists the things here, and the chest\'s rules come back', () => {
  const { T } = party();
  const text = briefing(T.s, vault, srd);
  assert.match(text, /THINGS HERE A CHARACTER CAN USE.*\n- Iron chest: Locked\.\n- Lever/);
  assert.match(text, /a rule on a character using something happens when you call use_object/);
  const tb = toolbox({ state: T.s, adventure: vault, srd, rng: makeRng(1), now: 1 });
  const out = tb.run('use_object', { character: 'Ila', object: 'iron chest', how: 'searches' });
  assert.ok(out.ok, JSON.stringify(out));
  assert.ok(out.adventure_rules.some((l) => /Ila gets Silver key/.test(l)), JSON.stringify(out));
  assert.match(tb.run('use_object', { character: 'Nobody', object: 'lever' }).refused, /nobody called "Nobody"/);
});

test('an object named with a hyphen ("hatch-lever") is the hatch lever the Director names', () => {
  const adv = { ...vault, sites: vault.sites.map((s) => (s.id === 'hall' ? { ...s, rules: [{ id: 'lever', when: 'use hatch-lever', do: 'say', say: 'The grate drops.' }] } : s)) };
  const T = table(3, { adv });
  hero(T, 'p1', 'Bryn');
  T.host({ type: 'site.move', siteId: 'hall' });
  T.host({ type: 'object.use', who: 'Bryn', object: 'hatch lever', how: 'pulls' });
  assert.ok(rules(T).some((l) => /The grate drops\. \[rule hall\/lever\]/.test(l)));
});

test('the fight simulation plays a place whose own rule starts the fight on arrival', async () => {
  const { simulatePlace } = await import('../engine/simulate.js');
  const adv = { id: 'pool', name: 'Pool', party: { size: [2, 2], level: 3 }, sites: [{ id: 'road', name: 'Road', exits: [{ to: 'pool', label: 'on' }] }, { id: 'pool', name: 'Pool', level: 3, exits: [], foes: [{ monster: 'wolf', count: 1 }], rules: [{ id: 'bites', when: 'enter', do: 'fight' }] }] };
  const r = simulatePlace({ adventure: adv, srd, siteId: 'pool', party: [{ cls: 'fighter', level: 3 }, { cls: 'cleric', level: 3 }], runs: 3 });
  assert.equal(r.runs, 3, 'simulated, not skipped');
});
