// Grapples (engine/ledger.js): a bite that grapples remembers who holds whom; the holder cannot bite
// anyone else, its "not grappled by" attack cannot target the one it holds, and the hold ends when the
// holder falls or the character breaks free. A lone boss fitted to a small party also hits for less
// (engine/scale.js): hit points alone left X Marks' crocodile wiping two heroes 75% of the time.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as SCALE from '../engine/scale.js';
import { srd, table, hero } from './helpers.js';

function croc(seed) {
  const T = table(seed);
  const a = hero(T, 'p1', 'Bryn');
  const b = hero(T, 'p2', 'Ila', 'cleric');
  T.host({ type: 'foe.add', monster: 'giant-crocodile', count: 1, name: 'Croc' });
  const f = Object.values(T.s.foes).find((x) => x.name.startsWith('Croc'));
  return { T, a, b, f };
}
function biteUntilHeld(T, f, pc) {
  for (let k = 0; k < 40 && !T.s.pcs[pc.id].grappledBy; k++) {
    T.s.pcs[pc.id].hp = T.s.pcs[pc.id].maxHp;
    T.host({ type: 'foe.act', foeId: f.id, action: 'Bite', target: `pc:${pc.id}` });
  }
  return T.s.pcs[pc.id];
}

test('a grappling bite records the hold, and the holder cannot bite or tail-strike the wrong one', () => {
  const { T, a, b, f } = croc(3);
  const held = biteUntilHeld(T, f, a);
  assert.equal(held.grappledBy.foeId, f.id);
  assert.ok(held.conds.includes('grappled') && held.conds.includes('restrained'));
  assert.throws(() => T.host({ type: 'foe.act', foeId: f.id, action: 'Bite', target: `pc:${b.id}` }), /holding Bryn/);
  assert.throws(() => T.host({ type: 'foe.act', foeId: f.id, action: 'Tail', target: `pc:${a.id}` }), /cannot target Bryn/);
});

test('the hold ends when the holder falls', () => {
  const { T, a, f } = croc(3);
  biteUntilHeld(T, f, a);
  T.host({ type: 'damage', target: `foe:${f.id}`, amount: 999, damageType: 'slashing', why: 'test' });
  const pc = T.s.pcs[a.id];
  assert.ok(!pc.conds.includes('grappled') && !pc.conds.includes('restrained'));
  assert.equal(pc.grappledBy, undefined);
});

test('a character can try to break free, and on a success is no longer held', () => {
  for (let seed = 1; seed < 30; seed++) {
    const { T, a, f } = croc(seed);
    biteUntilHeld(T, f, a);
    T.as('p1', { type: 'pc.escape', pcId: a.id });
    const pc = T.s.pcs[a.id];
    const r = T.s.rolls[T.s.rolls.length - 1];
    assert.match(r.label, /Escape the grapple/);
    assert.equal(pc.conds.includes('grappled'), !r.success);
    if (r.success) return;
  }
  assert.fail('no escape succeeded in 29 tries');
});

test('a lone boss too strong for a small party hits for less as well as having fewer hit points', () => {
  const plan = SCALE.planFight({ groups: [{ key: 'k', name: 'Croc', xp: 1800, count: 1, scalable: false }],
    designed: { size: [4, 5], level: 4 }, actual: [4, 4], srd });
  assert.equal(plan.hp, 0.5);
  // Softened again for being alone against two heroes (Ashen Crown simulation, 26 Nov), never under 0.3.
  assert.ok(plan.dmg < 0.7 && plan.dmg >= 0.3, `dmg ${plan.dmg}`);
  const even = SCALE.planFight({ groups: [{ key: 'k', name: 'Ogre', xp: 450, count: 1, scalable: false }],
    designed: { size: [4, 5], level: 2 }, actual: [2, 2, 2], srd });
  assert.ok(!even || !even.dmg || even.dmg === 1);
});
