// Fitting an adventure's fights to the party at the table. An adventure is written for a party (four
// characters of 1st level, say); the table may have two of 4th. The 5e encounter budget (DMG: XP
// thresholds by level, the multiplier for numbers, one step up for a party of fewer than three) says how
// hard each fight was meant to be for the party it was written for, and this finds the same difficulty
// for the real party: the number of foes first, then their hit points. Browser-safe, no state.
//
//   designedParty(adventure, siteId) -> { size: [low, high], level }
//   planFight({ groups, designed, actual, srd, mode }) -> null (nothing to change) or a plan

import * as R from './rules.js';

// The adventure's level range ("1 to 3", "1-10"), as numbers.
export function levelRange(text) {
  const nums = String(text || '').match(/\d+/g);
  if (!nums) return [1, 5];
  const a = Number(nums[0]); const b = Number(nums[nums.length - 1]);
  return [Math.max(1, Math.min(a, b)), Math.min(20, Math.max(a, b))];
}

// The level a place is written for: its own `level`, or by how deep it lies from the start.
export function siteLevel(adv, siteId) {
  const sites = (adv && adv.sites) || [];
  const site = sites.find((x) => x.id === siteId);
  if (site && Number(site.level) >= 1) return Math.min(20, Math.trunc(Number(site.level)));
  const [minL, maxL] = adv && adv.party && Number(adv.party.level) >= 1 && !adv.levels ? [Number(adv.party.level), Number(adv.party.level)] : levelRange(adv && adv.levels);
  if (!sites.length || minL === maxL) return minL;
  const depth = { [sites[0].id]: 0 };
  const q = [sites[0].id];
  while (q.length) {
    const cur = q.shift();
    const s = sites.find((x) => x.id === cur);
    for (const e of (s && s.exits) || []) if (sites.some((x) => x.id === e.to) && !(e.to in depth)) { depth[e.to] = depth[cur] + 1; q.push(e.to); }
  }
  const deepest = Math.max(1, ...Object.values(depth));
  return Math.max(minL, Math.min(maxL, Math.round(minL + ((maxL - minL) * (depth[siteId] || 0)) / deepest)));
}

// The party a place is written for: the adventure's `party` ({ size: 4 or [4, 5], level }), the place's level.
export function designedParty(adv, siteId) {
  const p = (adv && adv.party) || {};
  const sz = Array.isArray(p.size) ? p.size.map(Number) : [Number(p.size) || 4, Number(p.size) || 4];
  const size = [Math.max(1, Math.min(...sz)), Math.max(1, Math.max(...sz))];
  return { size, level: siteLevel(adv, siteId) };
}

const NUM = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
const count = (n) => NUM[n] || String(n);
export function partyWords({ size, level }) {
  const n = Array.isArray(size) ? (size[0] === size[1] ? count(size[0]) : `${count(size[0])} to ${count(size[1])}`) : count(size);
  return `${n} characters of ${R.ordinal(level)} level`;
}
export function tableWords(levels) {
  const lv = [...new Set(levels)].sort((a, b) => a - b);
  return `${count(levels.length)} of ${lv.length === 1 ? `${R.ordinal(lv[0])}` : `${lv.map((x) => R.ordinal(x)).join(' and ')}`} level`;
}

// A book's own monster is fitted by the larger of its printed XP and what its numbers are worth (DMG,
// Monster Statistics by Challenge Rating: hit points and AC for defence, damage a round and attack bonus
// for offence, averaged). Vault of the Runemark prints its skeletons as CR 1/4 with 39 hit points and
// AC 15; two of them wiped two 2nd-level heroes in 37% of simulated fights (26 Nov). Never lowers a
// printed XP, and leaves the SRD's own monsters alone.
const CR_ROWS = [ // cr, xp, ac, hp up to, attack bonus, damage a round up to
  [0, 10, 13, 6, 3, 1], [0.125, 25, 13, 35, 3, 3], [0.25, 50, 13, 49, 3, 5], [0.5, 100, 13, 70, 3, 8],
  [1, 200, 13, 85, 3, 14], [2, 450, 13, 100, 3, 20], [3, 700, 13, 115, 4, 26], [4, 1100, 14, 130, 5, 32],
  [5, 1800, 15, 145, 6, 38], [6, 2300, 15, 160, 6, 44], [7, 2900, 15, 175, 6, 50], [8, 3900, 16, 190, 7, 56],
  [9, 5000, 16, 205, 7, 62], [10, 5900, 17, 220, 7, 68]];
const avgDice = (expr) => String(expr || '').split('+').reduce((a, t) => {
  const d = /^\s*(\d+)d(\d+)\s*$/.exec(t);
  return a + (d ? (Number(d[1]) * (Number(d[2]) + 1)) / 2 : Number(t) || 0);
}, 0);
const rowAt = (n) => Math.max(0, Math.min(CR_ROWS.length - 1, n));
export function statsXp(m) {
  if (!m || !m.adventure || !(Number(m.hp) > 0)) return 0;
  const hpRow = CR_ROWS.findIndex((r) => m.hp <= r[3]);
  if (hpRow < 0) return 0; // past the table: the book's word stands
  const def = rowAt(hpRow + Math.trunc(((Number(m.ac) || 13) - CR_ROWS[hpRow][2]) / 2));
  const weapons = (m.actions || []).filter((a) => a.hit != null && (a.dmg || []).length);
  if (!weapons.length) return CR_ROWS[def][1];
  const multi = (m.actions || []).find((a) => /^multiattack$/i.test(a.n || ''));
  const times = multi ? (/\bfour\b/i.test(multi.d) ? 4 : /\bthree\b/i.test(multi.d) ? 3 : 2) : 1;
  const best = weapons.map((a) => ({ hit: Number(a.hit) || 0, dmg: a.dmg.reduce((t, [e]) => t + avgDice(e), 0) })).sort((a, b) => b.dmg - a.dmg)[0];
  const dpr = best.dmg * times;
  let offRow = CR_ROWS.findIndex((r) => dpr <= r[5]);
  if (offRow < 0) return 0;
  const off = rowAt(offRow + Math.trunc((best.hit - CR_ROWS[offRow][4]) / 2));
  return CR_ROWS[Math.round((def + off) / 2)][1];
}
export const fightXp = (m) => Math.max(Number(m && m.xp) || 0, statsXp(m));

// groups: [{ key, name, xp, count, scalable }] as written; designed: { size, level }; actual: the living
// characters' levels; mode: 'auto' (either way), 'down' (only ever easier) or 'off'.
// The plan: { counts: { key: n }, hp: factor, ... }, or null when the fight is right as it stands.
export function planFight({ groups, designed, actual, srd, mode = 'auto' }) {
  if (mode === 'off' || !actual.length || !groups.length) return null;
  const [lo, hi] = designed.size;
  if (actual.length >= lo && actual.length <= hi && actual.every((l) => l === designed.level)) return null;
  const base = Object.fromEntries(groups.map((g) => [g.key, g.count]));
  const xpsOf = (c) => groups.flatMap((g) => Array(c[g.key]).fill(Number(g.xp) || 0));
  const writtenFor = Array(lo).fill(designed.level);
  const asWritten = R.encounterDifficulty(writtenFor, xpsOf(base), srd);
  if (!asWritten.base) return null;
  const forUs = R.encounterDifficulty(actual, xpsOf(base), srd);
  // The same share of the party's medium budget as the fight was of the written party's; never harder
  // as 'down'. A party smaller than written has no one to fall back on and faces more attacks than the
  // budget counts: never past halfway between medium and hard for it (bench 26 Nov: three 3rd-level heroes
  // wiped by Blackreed's six River Rats, "hard" by the budget; the simulation agreed, 15% wipes, now 3%).
  let target = (asWritten.adjusted / Math.max(1, asWritten.thresholds[1])) * forUs.thresholds[1];
  if (actual.length < lo) target = Math.min(target, (forUs.thresholds[1] + forUs.thresholds[2]) / 2);
  if (mode === 'down') target = Math.min(target, forUs.adjusted);
  // Numbers first: every group that may change is scaled by the same factor, so the mix stays.
  // For a party smaller than written, a lesser group may go altogether (the goblin guard beside Grisk:
  // two 1st-level heroes wiped a third of the time against both, 26 Nov); the toughest foe always stays.
  const top = groups.reduce((a, b) => ((Number(b.xp) || 0) > (Number(a.xp) || 0) ? b : a));
  const seen = new Map();
  for (let k = 0.1; k <= 3.001; k += 0.05) {
    const c = {};
    for (const g of groups) {
      // A party smaller than written never gets more foes (more attacks than it can answer: the simulation
      // wiped two 5th-level heroes against six drowned villagers half the time); it gets tougher ones.
      const most = mode === 'down' || actual.length < lo ? g.count : Math.min(12, g.count * 2);
      const canGo = actual.length < lo && g !== top && groups.length > 1 && !g.fixed;
      c[g.key] = g.scalable || canGo ? Math.max(canGo ? 0 : 1, Math.min(most, Math.round(g.count * k))) : g.count;
    }
    const total = Object.values(c).reduce((a, b) => a + b, 0);
    const sig = JSON.stringify(c);
    if (total > 12 || seen.has(sig)) continue;
    seen.set(sig, { counts: c, total, adjusted: R.encounterDifficulty(actual, xpsOf(c), srd).adjusted });
  }
  const opts = [...seen.values()];
  const under = opts.filter((o) => o.adjusted <= target * 1.1);
  const pool = under.length ? under : [opts.reduce((a, b) => (b.adjusted < a.adjusted ? b : a))];
  const best = pool.reduce((a, b) => {
    const da = Math.abs(a.adjusted - target); const db = Math.abs(b.adjusted - target);
    return db < da - 1e-9 || (Math.abs(db - da) <= 1e-9 && b.total < a.total) ? b : a;
  });
  // Then hit points, for what the numbers could not reach (a lone boss cannot be halved).
  let hp = best.adjusted ? target / best.adjusted : 1;
  const rawHp = hp;
  if (mode === 'down') hp = Math.min(1, hp);
  hp = Math.max(0.5, Math.min(1.5, hp));
  if (Math.abs(hp - 1) < 0.15) hp = 1;
  hp = Math.round(hp * 20) / 20;
  // Then damage, for what hit points could not reach: halving a lone boss's hit points does not soften
  // its blows (X Marks' giant crocodile, CR 5, against two 4th-level heroes: 35 damage a round, 75%
  // wipes in the simulation at half hit points). Its attacks hit for less, never under half.
  let dmg = 1;
  if (rawHp < 0.5 && hp === 0.5) dmg = Math.round(Math.max(0.5, rawHp / 0.5) * 20) / 20;
  // A lone foe against a party smaller than written gets every one of its attacks on one or two heroes,
  // which the budget does not count: its blows are softened further, never under 0.3 (Ashen Crown, two
  // heroes: Venyx at Starfall wiped 25% of simulated fights at half damage, 5% at 0.35; Kragg at
  // Ironfang 18% at 0.7, 8% at 0.5, 3% at 0.45; 26 Nov).
  const lone = Object.values(best.counts).reduce((a, b) => a + b, 0) === 1;
  if (lone && actual.length < lo && dmg < 1) dmg = Math.max(0.3, Math.round(dmg * 0.65 * 20) / 20);
  if (dmg > 0.9) dmg = 1;
  const changed = groups.some((g) => best.counts[g.key] !== g.count) || hp !== 1 || dmg !== 1;
  if (!changed) return null;
  const after = Math.round(best.adjusted * hp * dmg);
  const names = ['Easy', 'Medium', 'Hard', 'Deadly'];
  let rating = 'Trivial';
  for (let n = 0; n < 4; n++) if (after >= forUs.thresholds[n]) rating = names[n];
  return { counts: best.counts, hp, dmg, target: Math.round(target), before: forUs.adjusted, after, ratingAsWritten: asWritten.rating, ratingBefore: forUs.rating, rating };
}
