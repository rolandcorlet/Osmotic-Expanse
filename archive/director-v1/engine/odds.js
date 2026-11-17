// Exact odds for a pool of n d6 where 1s score zero (CORE §1.1, CODEX §2.4).
// Nothing here is simulated: every figure is counted from all 6^n outcomes.

const cache = new Map();

// Returns the full outcome table for n dice:
//   byTotal[t]            = number of outcomes with that total
//   byTotalRunaway[t]     = of those, outcomes that are a Runaway (no 1s, two or more 6s)
//   byInhibitors[k]       = number of outcomes with exactly k Inhibitors
//   outcomes              = 6^n
export function outcomeTable(n) {
  if (!Number.isInteger(n) || n < 0 || n > 30) throw new Error('Pool must be a whole number of dice from 0 to 30.');
  if (cache.has(n)) return cache.get(n);
  const maxTotal = 6 * n;
  // state key: total, ones (0..n), sixes capped at 2
  // counts[ones][sixes][total]
  let counts = [];
  const blank = () => {
    const a = [];
    for (let o = 0; o <= n; o++) {
      a.push([new Float64Array(maxTotal + 1), new Float64Array(maxTotal + 1), new Float64Array(maxTotal + 1)]);
    }
    return a;
  };
  counts = blank();
  counts[0][0][0] = 1;
  for (let die = 0; die < n; die++) {
    const next = blank();
    for (let o = 0; o <= die; o++) {
      for (let s = 0; s < 3; s++) {
        const row = counts[o][s];
        for (let t = 0; t <= 6 * die; t++) {
          const c = row[t];
          if (!c) continue;
          next[o + 1][s][t] += c; // a 1: an Inhibitor, scores nothing
          for (let face = 2; face <= 5; face++) next[o][s][t + face] += c;
          next[o][Math.min(2, s + 1)][t + 6] += c; // a 6
        }
      }
    }
    counts = next;
  }
  const byTotal = new Float64Array(maxTotal + 1);
  const byTotalRunaway = new Float64Array(maxTotal + 1);
  const byInhibitors = new Float64Array(n + 1);
  for (let o = 0; o <= n; o++) {
    for (let s = 0; s < 3; s++) {
      for (let t = 0; t <= maxTotal; t++) {
        const c = counts[o][s][t];
        if (!c) continue;
        byTotal[t] += c;
        byInhibitors[o] += c;
        if (o === 0 && s === 2) byTotalRunaway[t] += c;
      }
    }
  }
  const table = { n, outcomes: Math.pow(6, n), byTotal, byTotalRunaway, byInhibitors };
  cache.set(n, table);
  return table;
}

// Chance (0..1) that the pool meets or beats the Threshold.
export function successChance(n, at) {
  const t = outcomeTable(n);
  let hit = 0;
  for (let total = Math.max(0, at); total < t.byTotal.length; total++) hit += t.byTotal[total];
  if (at <= 0) return 1;
  return hit / t.outcomes;
}

// Mean Overflow, counted over successful rolls only. 0 when success is impossible.
export function meanOverflowOnSuccess(n, at) {
  const t = outcomeTable(n);
  let hit = 0;
  let sum = 0;
  for (let total = Math.max(0, at); total < t.byTotal.length; total++) {
    hit += t.byTotal[total];
    sum += t.byTotal[total] * (total - at);
  }
  return hit ? sum / hit : 0;
}

// Chance of Runaway Catalysis: no Inhibitors and at least two 6s.
export function runawayChance(n) {
  const t = outcomeTable(n);
  let c = 0;
  for (let i = 0; i < t.byTotalRunaway.length; i++) c += t.byTotalRunaway[i];
  return c / t.outcomes;
}

// Chance of at least k Inhibitors (1s).
export function inhibitorChance(n, k = 1) {
  const t = outcomeTable(n);
  let c = 0;
  for (let i = Math.max(0, k); i <= n; i++) c += t.byInhibitors[i];
  return c / t.outcomes;
}

// One call for a screen: everything a player's odds card shows.
export function oddsCard(n, at) {
  return {
    dice: n,
    at,
    success: successChance(n, at),
    meanOverflow: meanOverflowOnSuccess(n, at),
    runaway: runawayChance(n),
    anyInhibitor: inhibitorChance(n, 1),
  };
}
