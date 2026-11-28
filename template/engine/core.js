// The skeleton's rule core. The dice themselves live in dicesystems.js (one module per game chooses
// its system); this file holds what every system shares: damage, strain penalties, the snag table,
// health. The d6 pool's own helpers are re-exported for older code and tests.

import { getSystem, weaponDamage, makeSource, buildPool, readRoll, MOD_CAP } from './dicesystems.js';

export { buildPool, readRoll, MOD_CAP, getSystem, makeSource };

// Unopposed and unhurried, in the d6 pool: take pool x 3.
export const steady = (dice) => dice * 3;

// Damage = the weapon (a number, or dice; a surge counts it twice) + what the system adds for how well
// the roll went (the d6 pool: overflow; success pools: extra successes) - soak, at least 1.
export function damage({ overflow = 0, weapon = 0, soak = 0, surge = false, rng = Math.random }) {
  return Math.max(1, weaponDamage(weapon, surge, rng) + overflow - soak);
}
export function damageFromRoll(rules, r, weapon, soak, rng) {
  const { o } = getSystem(rules);
  const add = o.damageAdd === 'margin' ? Math.max(0, r.margin) : o.damageAdd === 'degrees' ? Math.max(0, r.degrees) : 0;
  return damage({ overflow: add, weapon, soak, surge: r.surge, rng });
}

// The strain penalty (in the system's units) at a given strain, from the module's strain.penalties.
export function strainPenalty(rules, strain) {
  let d = 0;
  for (const p of (rules.strain && rules.strain.penalties) || []) if (strain >= p.at) d = Math.min(d, p.dice ?? p.mod ?? 0);
  return d;
}

// The snag table row for a failed roll with n snags (the highest row not above n).
export function snagRow(rules, n) {
  if (!n) return null;
  const rows = ((rules.snag && rules.snag.table) || []).slice().sort((a, b) => a.snags - b.snags);
  let pick = null;
  for (const r of rows) if (n >= r.snags) pick = r;
  return pick;
}

// A stat as a flat number, by the dice system (d6 pool: the dice; d20: the score's bonus).
export const statBonus = (rules, v) => { const S = getSystem(rules); return S.sys.bonus(S.o, v); };

export function maxHealth(rules, stats, level = 1) {
  const h = rules.health || {};
  return Math.max(1, (h.base || 0) + statBonus(rules, stats[h.stat]) * (h.perStat || 0) + (h.perLevel || 0) * Math.max(0, level - 1));
}
