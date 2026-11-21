// The skeleton's dice core: the same for every game module (the words are in schema.js, DICE).
//   A pool of d6. A 1 scores nothing and is a snag (a penalty: 1 strain each).
//   Two or more 6s and no 1s is a surge (a bonus: the weapon counts twice on an attack).
//   Total against a difficulty; what is left over is overflow.

export const MOD_CAP = 5;

// stat + skill dice, plus modifiers ({ label, dice }), capped at +/-5 together, never under 1 die.
export function buildPool({ stat = 0, skill = 0, mods = [] } = {}) {
  const list = mods.filter((m) => m && Number(m.dice)).map((m) => ({ label: m.label || 'Modifier', dice: Number(m.dice) }));
  const raw = list.reduce((a, m) => a + m.dice, 0);
  const applied = Math.max(-MOD_CAP, Math.min(MOD_CAP, raw));
  const base = Math.max(0, Number(stat) || 0) + Math.max(0, Number(skill) || 0);
  return { dice: Math.max(1, base + applied), base, mods: list, modsRaw: raw, modsApplied: applied, capped: raw !== applied };
}

export function readRoll(dice, at = null) {
  const snags = dice.filter((d) => d === 1).length;
  const sixes = dice.filter((d) => d === 6).length;
  const total = dice.reduce((a, d) => a + (d === 1 ? 0 : d), 0);
  const surge = snags === 0 && sixes >= 2;
  const out = { dice: dice.slice(), snags, sixes, total, surge };
  if (at != null) {
    out.at = at;
    out.success = total >= at;
    out.overflow = out.success ? total - at : 0;
    out.shortBy = out.success ? 0 : at - total;
  }
  return out;
}

// Unopposed and unhurried: take pool x 3.
export const steady = (dice) => dice * 3;

// Damage = overflow + weapon - soak, at least 1. A surge counts the weapon twice.
export function damage({ overflow = 0, weapon = 0, soak = 0, surge = false }) {
  return Math.max(1, overflow + (surge ? weapon * 2 : weapon) - soak);
}

// The strain penalty in dice at a given strain, from the module's strain.penalties.
export function strainPenalty(rules, strain) {
  let d = 0;
  for (const p of (rules.strain && rules.strain.penalties) || []) if (strain >= p.at) d = Math.min(d, p.dice);
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

export function maxHealth(rules, stats, level = 1) {
  const h = rules.health || {};
  return Math.max(1, (h.base || 0) + (Number(stats[h.stat]) || 0) * (h.perStat || 0) + (h.perLevel || 0) * Math.max(0, level - 1));
}
