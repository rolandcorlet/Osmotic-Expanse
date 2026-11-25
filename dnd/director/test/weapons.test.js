// How each weapon is held and which ability it attacks with, as the character builder shows it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { derive } from '../engine/rules.js';
import { srd } from './helpers.js';

const fighter = (base, kit, kitPick) => derive({ name: 'Test', race: 'human', class: 'fighter', method: 'standard', base, skills: ['athletics', 'perception'], background: 'soldier', style: 'defense', kit, kitPick }, srd);
const atk = (pc, id) => pc.attacks.find((a) => a.id === `w:${id}`);

test('weapons say how they are held and which ability they use (finesse, two-handed, light, thrown)', () => {
  const pc = fighter({ str: 10, dex: 16, con: 14, int: 8, wis: 12, cha: 13 }, [0, 1, 1], { '1:0': ['rapier', 'greatsword'] });
  const rapier = atk(pc, 'rapier');
  assert.equal(rapier.ability, 'dex');
  assert.equal(rapier.choice, true, 'finesse: STR or DEX');
  assert.equal(rapier.hands, 1);
  const gs = atk(pc, 'greatsword');
  assert.equal(gs.ability, 'str');
  assert.equal(gs.hands, 2);
  assert.equal(gs.choice, false);
  const axe = atk(pc, 'handaxe');
  assert.equal(axe.light, true);
  assert.equal(axe.thrown, '20/60');
  assert.equal(axe.ability, 'str', 'a thrown melee weapon uses STR');
});

test('a ranged weapon uses DEX even when STR and DEX are equal; a versatile weapon says so', () => {
  const pc = fighter({ str: 14, dex: 14, con: 14, int: 8, wis: 12, cha: 13 }, [1, 0, 0], { '1:0': ['longsword'] });
  assert.equal(atk(pc, 'longbow').ability, 'dex');
  assert.equal(atk(pc, 'longbow').hands, 2);
  assert.equal(atk(pc, 'longsword').hands, 'versatile');
  assert.match(atk(pc, 'longsword').versatile, /^1d10/);
});
