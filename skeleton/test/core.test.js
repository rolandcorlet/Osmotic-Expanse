import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPool, readRoll, damage, strainPenalty, snagRow } from '../engine/core.js';
import { mod } from './helpers.js';
import { check } from '../engine/module.js';

test('a 1 scores nothing and is a snag; two 6s and no 1s is a surge', () => {
  const r = readRoll([1, 6, 6, 4], 12);
  assert.equal(r.total, 16); assert.equal(r.snags, 1); assert.equal(r.surge, false); assert.equal(r.success, true); assert.equal(r.overflow, 4);
  const s = readRoll([6, 6, 3], 12);
  assert.equal(s.surge, true); assert.equal(s.snags, 0);
  assert.equal(readRoll([6, 2], 12).surge, false);
});
test('modifiers cap at +/-5 and a pool is never below 1 die', () => {
  assert.equal(buildPool({ stat: 2, skill: 1, mods: [{ dice: 9 }] }).dice, 8);
  assert.equal(buildPool({ stat: 1, mods: [{ dice: -4 }] }).dice, 1);
});
test('damage: overflow + weapon - soak, at least 1; a surge counts the weapon twice', () => {
  assert.equal(damage({ overflow: 3, weapon: 2, soak: 1 }), 4);
  assert.equal(damage({ overflow: 3, weapon: 2, soak: 1, surge: true }), 6);
  assert.equal(damage({ overflow: 0, weapon: 0, soak: 5 }), 1);
});
test('strain penalties and the snag table come from the module', () => {
  assert.equal(strainPenalty(mod.rules, 2), 0);
  assert.equal(strainPenalty(mod.rules, 3), -1);
  assert.equal(strainPenalty(mod.rules, 6), -2);
  assert.equal(snagRow(mod.rules, 1).name, 'Slip');
  assert.equal(snagRow(mod.rules, 5).name, 'Blackout');
});
test('the sample module is valid', () => { assert.deepEqual(check(mod).errors, []); });
