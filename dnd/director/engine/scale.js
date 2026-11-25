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
  const seen = new Map();
  for (let k = 0.1; k <= 3.001; k += 0.05) {
    const c = {};
    for (const g of groups) {
      // A party smaller than written never gets more foes (more attacks than it can answer: the simulation
      // wiped two 5th-level heroes against six drowned villagers half the time); it gets tougher ones.
      const most = mode === 'down' || actual.length < lo ? g.count : Math.min(12, g.count * 2);
      c[g.key] = g.scalable ? Math.max(1, Math.min(most, Math.round(g.count * k))) : g.count;
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
  if (mode === 'down') hp = Math.min(1, hp);
  hp = Math.max(0.5, Math.min(1.5, hp));
  if (Math.abs(hp - 1) < 0.15) hp = 1;
  hp = Math.round(hp * 20) / 20;
  const changed = groups.some((g) => best.counts[g.key] !== g.count) || hp !== 1;
  if (!changed) return null;
  const after = Math.round(best.adjusted * hp);
  const names = ['Easy', 'Medium', 'Hard', 'Deadly'];
  let rating = 'Trivial';
  for (let n = 0; n < 4; n++) if (after >= forUs.thresholds[n]) rating = names[n];
  return { counts: best.counts, hp, target: Math.round(target), before: forUs.adjusted, after, ratingAsWritten: asWritten.rating, ratingBefore: forUs.rating, rating };
}
