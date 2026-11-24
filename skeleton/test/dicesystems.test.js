import test from 'node:test';
import assert from 'node:assert/strict';
import { SYSTEMS, getSystem, makeSource, chance, weaponDamage } from '../engine/dicesystems.js';
import { check } from '../engine/module.js';
import { newSession, apply } from '../engine/ledger.js';
import { makeRng } from '../engine/dice.js';
import { instructions } from '../brain/director.js';

import { TUNE, variant } from './variants.js';

test('every system rolls, reads typed dice, and gives sane odds', () => {
  const typed = { 'd6-pool': [[6, 6, 3, 2], 12], d20: [[20], 15], percentile: [[3], 0], '2d6': [[6, 6], 10], 'success-pool': [[10, 9, 8, 8, 2, 3], 1], fate: [['+', '+', '+', '0'], 1], step: [[8, 3, 2], 4], 'roll-under': [[1, 1, 2], 0] };
  for (const id of Object.keys(SYSTEMS)) {
    const S = getSystem({ dice: { system: id } });
    const vals = { 'd6-pool': { stat: 3, skill: 1 }, d20: { stat: 14, skill: 1 }, percentile: { stat: 40, skill: 20 }, '2d6': { stat: 1, skill: 1 }, 'success-pool': { stat: 3, skill: 2 }, fate: { stat: 2, skill: 1 }, step: { stat: 6, skill: 8 }, 'roll-under': { stat: 10, skill: 2 } }[id];
    const spec = S.sys.spec(S.o, vals);
    const [own, at] = typed[id];
    const r = S.sys.roll(S.o, spec, at, makeSource(makeRng(1), own));
    assert.equal(r.success, true, `${id}: ${r.shown}`);
    assert.equal(r.surge, true, `${id} should surge: ${r.shown}`);
    const p = chance(S, spec, at);
    assert.ok(p > 0 && p <= 1, `${id} chance ${p}`);
    assert.ok(S.sys.describe(S.o, { snag: 'Snag', surge: 'Surge', strain: 'Strain', difficulty: 'Difficulty', overflow: 'Overflow' }).length > 100);
  }
});
test('penalties: a natural 1, a fumble, snake eyes, a botch, four minuses, all 1s, an 18', () => {
  const cases = [['d20', { stat: 14 }, [1], 5], ['percentile', { stat: 30 }, [99], 0], ['2d6', { stat: 1 }, [1, 1], 10], ['success-pool', { stat: 3 }, [1, 2, 3], 2], ['fate', { stat: 2 }, ['-', '-', '-', '-'], 1], ['step', { stat: 6, skill: 6 }, [1, 1], 4], ['roll-under', { stat: 12 }, [6, 6, 6], 0]];
  for (const [id, v, own, at] of cases) {
    const S = getSystem({ dice: { system: id } });
    const r = S.sys.roll(S.o, S.sys.spec(S.o, v), at, makeSource(makeRng(1), own));
    assert.equal(r.success, false, `${id}: ${r.shown}`);
    assert.equal(r.snags, 1, `${id} should snag: ${r.shown}`);
  }
});
test('2d6 has partial successes; Fate ties are partial', () => {
  const S = getSystem({ dice: { system: '2d6' } });
  const r = S.sys.roll(S.o, S.sys.spec(S.o, { stat: 1 }), 10, makeSource(makeRng(1), [3, 4]));
  assert.equal(r.success, true); assert.equal(r.partial, true);
  const F = getSystem({ dice: { system: 'fate' } });
  const f = F.sys.roll(F.o, F.sys.spec(F.o, { stat: 2 }), 2, makeSource(makeRng(1), ['0', '0', '0', '0']));
  assert.equal(f.partial, true);
});
test('weapons can be numbers or dice; a surge counts them twice', () => {
  assert.equal(weaponDamage(3, true, Math.random), 6);
  const rng = makeRng(4);
  for (let i = 0; i < 50; i++) { const d = weaponDamage('1d8+2', false, rng); assert.ok(d >= 3 && d <= 10); }
  for (let i = 0; i < 50; i++) { const d = weaponDamage('1d6', true, rng); assert.ok(d >= 2 && d <= 12); }
});
test('a wrongly typed die is refused in plain words', () => {
  const S = getSystem({ dice: { system: 'd20' } });
  assert.throws(() => S.sys.roll(S.o, S.sys.spec(S.o, { stat: 10 }), 10, makeSource(makeRng(1), [21])), /d20 is a whole number from 1 to 20/);
});

for (const system of Object.keys(TUNE)) {
  test(`${system}: Saltglass re-tuned is valid and plays a roll and a whole fight`, () => {
    const mod = variant(system);
    assert.deepEqual(check(mod).errors, []);
    assert.match(instructions(mod), new RegExp(getSystem(mod.rules).name.replace(/[()+]/g, '.')));
    const rng = makeRng(9);
    let s = newSession(mod);
    const A = (a, role = 'host', pid = null, ai = false) => { s = apply(s, a, { role, pid, rng, now: 1, mod, ai }); };
    A({ type: 'join', name: 'Ann' }, 'player', 'p1');
    A({ type: 'char.pregen', index: 0 }, 'player', 'p1');
    const ch = Object.values(s.chars)[0];
    A({ type: 'roll.ask', charIds: [ch.id], stat: 'brawn', skill: 'swim', at: mod.rules.ladder[2].name, reason: 'the current', fail: { damage: 1 } });
    A({ type: 'roll.make', id: s.requests[0].id }, 'player', 'p1');
    const r = s.rolls.at(-1);
    assert.equal(r.system, system); assert.ok(r.pool); assert.ok(Array.isArray(r.faces) && r.faces.length);
    A({ type: 'site.move', siteId: 'causeway' });
    A({ type: 'fight.start' });
    for (let i = 0; i < 80 && s.fight; i++) {
      const [kind, id] = s.fight.order[s.fight.turn].key.split(':');
      if (kind === 'char') {
        const foe = Object.values(s.creatures).find((k) => !k.down && k.siteId === 'causeway');
        if (foe && !s.chars[id].down) A({ type: 'attack', charId: id, target: foe.id }, 'player', 'p1');
        A({ type: 'fight.next' }, 'player', 'p1');
      } else {
        if (!s.chars[ch.id].down) A({ type: 'creature.act', creature: id, target: ch.id }, 'host', null, true);
        A({ type: 'fight.next' }, 'host', null, true);
      }
      if (!Object.values(s.creatures).some((k) => !k.down && k.siteId === 'causeway') || s.chars[ch.id].down) A({ type: 'fight.end' });
    }
    assert.equal(s.fight, null);
    assert.ok(s.rolls.filter((x) => x.kind === 'attack').length >= 2);
  });
}
