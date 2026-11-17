// Phase 1 gate: the Engine must reproduce the odds table printed in the
// Director's Codex §2.4 ("exact, from enumeration").
import test from 'node:test';
import assert from 'node:assert/strict';
import { successChance, meanOverflowOnSuccess, runawayChance, inhibitorChance, outcomeTable } from '../engine/odds.js';

const ATS = [8, 10, 12, 14, 16, 18, 20, 22, 24, 28];

// Pool: [success % at each AT..., Runaway %, >=1 Inhibitor %]
const SUCCESS = {
  2: [42, 17, 3, 0, 0, 0, 0, 0, 0, 0, 2.8, 30.6],
  3: [77, 57, 35, 16, 5, 0, 0, 0, 0, 0, 6.0, 42.1],
  4: [93, 83, 68, 50, 30, 15, 5, 1, 0, 0, 8.7, 51.8],
  5: [98, 94, 87, 76, 61, 44, 27, 14, 6, 0, 10.6, 59.8],
  6: [99, 98, 96, 91, 82, 70, 55, 39, 24, 6, 11.5, 66.5],
  7: [100, 100, 99, 97, 93, 86, 77, 64, 50, 22, 11.8, 72.1],
  8: [100, 100, 100, 99, 97, 95, 90, 82, 72, 45, 11.6, 76.7],
  9: [100, 100, 100, 100, 99, 98, 96, 92, 86, 67, 10.9, 80.6],
  10: [100, 100, 100, 100, 100, 99, 99, 97, 94, 82, 10.1, 83.8],
};

const OVERFLOW = {
  2: [1.3, 0.7, 0, 0, 0, 0, 0, 0, 0, 0],
  3: [3.4, 2.4, 1.6, 1.0, 0.5, 0, 0, 0, 0, 0],
  4: [6.0, 4.6, 3.4, 2.5, 1.8, 1.3, 0.8, 0.4, 0, 0],
  5: [8.9, 7.2, 5.7, 4.5, 3.5, 2.7, 2.0, 1.5, 1.0, 0.3],
  6: [12.1, 10.2, 8.5, 6.9, 5.6, 4.4, 3.5, 2.8, 2.2, 1.2],
  7: [15.4, 13.4, 11.5, 9.7, 8.1, 6.7, 5.4, 4.4, 3.6, 2.3],
  8: [18.7, 16.7, 14.7, 12.8, 11.0, 9.3, 7.8, 6.5, 5.3, 3.6],
  9: [22.0, 20.0, 18.0, 16.1, 14.1, 12.3, 10.6, 9.0, 7.6, 5.3],
  10: [25.3, 23.3, 21.3, 19.4, 17.4, 15.4, 13.6, 11.8, 10.1, 7.3],
};

const INHIBITORS = {
  3: [42.1, 7.4, 0.5, 0],
  4: [51.8, 13.2, 1.6, 0.1],
  5: [59.8, 19.6, 3.5, 0.3],
  6: [66.5, 26.3, 6.2, 0.9],
  7: [72.1, 33.0, 9.6, 1.8],
  8: [76.7, 39.5, 13.5, 3.1],
  10: [83.8, 51.5, 22.5, 7.0],
};

// Collected so a run prints every cell that differs from the book, not only the first.
export function compareWithCodex() {
  const diffs = [];
  const near = (a, b, tol) => Math.abs(a - b) <= tol + 1e-9;
  for (const [pool, row] of Object.entries(SUCCESS)) {
    const n = Number(pool);
    ATS.forEach((at, i) => {
      const got = successChance(n, at) * 100;
      if (!near(got, row[i], 0.5)) diffs.push(`success  pool ${n} AT ${at}: book ${row[i]}, engine ${got.toFixed(2)}`);
    });
    const run = runawayChance(n) * 100;
    if (!near(run, row[10], 0.05)) diffs.push(`runaway  pool ${n}: book ${row[10]}, engine ${run.toFixed(2)}`);
    const inh = inhibitorChance(n, 1) * 100;
    if (!near(inh, row[11], 0.05)) diffs.push(`inhibitor>=1 pool ${n}: book ${row[11]}, engine ${inh.toFixed(2)}`);
  }
  for (const [pool, row] of Object.entries(OVERFLOW)) {
    const n = Number(pool);
    ATS.forEach((at, i) => {
      const got = meanOverflowOnSuccess(n, at);
      // The book prints 0 where success is under half a percent.
      if (row[i] === 0 && successChance(n, at) < 0.005) return;
      if (!near(got, row[i], 0.05)) diffs.push(`overflow pool ${n} AT ${at}: book ${row[i]}, engine ${got.toFixed(2)}`);
    });
  }
  for (const [pool, row] of Object.entries(INHIBITORS)) {
    const n = Number(pool);
    row.forEach((v, i) => {
      const got = inhibitorChance(n, i + 1) * 100;
      if (!near(got, v, 0.05)) diffs.push(`inhibitors>=${i + 1} pool ${n}: book ${v}, engine ${got.toFixed(2)}`);
    });
  }
  return diffs;
}

test('outcome table counts every outcome', () => {
  for (let n = 0; n <= 10; n++) {
    const t = outcomeTable(n);
    const sum = t.byTotal.reduce((a, c) => a + c, 0);
    assert.equal(sum, Math.pow(6, n));
    assert.equal(t.byInhibitors.reduce((a, c) => a + c, 0), Math.pow(6, n));
  }
});

test('hand-checked cases', () => {
  // Two dice, AT 8: 15 of 36 outcomes.
  assert.equal(successChance(2, 8), 15 / 36);
  // Two dice: only 6,6 is a Runaway.
  assert.equal(runawayChance(2), 1 / 36);
  // Two dice: 11 of 36 contain a 1.
  assert.equal(inhibitorChance(2, 1), 11 / 36);
  // CORE §1.2: a pool of 4 fails about a third of the time at 12.
  assert.ok(Math.abs(successChance(4, 12) - 0.68) < 0.005);
});

test('reproduces CODEX §2.4', () => {
  const diffs = compareWithCodex();
  assert.deepEqual(diffs, []);
});
