// How strong a fight is, for every Skeleton game: a creature weighs by its tier (tier 1 a minion, tier 5 a
// legend), a party by its characters and their levels. The same for every dice system, because the module
// format already ties a tier to its numbers in that system (rules.json, the converter's tables). Used to
// size a story seed's meeting (engine/seeds.js) and to fit an adventure's fights to the party at the table.
// Browser-safe, no state.
//
//   weightOf(creature)                   1, 2, 4, 7 or 11 for tiers 1 to 5
//   partyPower(levels)                   one a character, half again for each level past the first
//   sizeGroups(groups, levels, ix, how)  fewer of each until the fight is 'easy', 'medium' or 'hard' at most;
//                                        then health (never under half) for a lone creature still too strong
//   designedParty(adventure)             { size: [low, high], level } the adventure is written for
//   planFight({ groups, designed, levels, ix })  the plan for a place's fight, or null if it is right as written

export const TIER_WEIGHT = [0, 1, 2, 4, 7, 11];
export const weightOf = (b) => TIER_WEIGHT[Math.max(1, Math.min(5, Math.trunc(Number((b || {}).tier) || 1)))];
export const partyPower = (levels) => levels.reduce((n, l) => n + 1 + (Math.max(1, Number(l) || 1) - 1) * 0.5, 0);
const CAP = { easy: 1, medium: 1.5, hard: 2 };
const weigh = (groups, ix) => groups.reduce((n, g) => n + g.count * weightOf(ix[g.id]), 0);
export function rate(weight, levels) {
  const p = partyPower(levels) || 1;
  const r = weight / p;
  return r <= CAP.easy ? 'Easy' : r <= CAP.medium ? 'Medium' : r <= CAP.hard ? 'Hard' : 'Deadly';
}

export function sizeGroups(groups, levels, ix, how = 'easy') {
  const out = groups.filter((g) => ix[g.id]).map((g) => ({ ...g, count: Math.max(1, Math.min(12, Math.trunc(g.count) || 1)) }));
  if (!out.length || !levels.length) return { groups: out, health: 1 };
  const cap = partyPower(levels) * (CAP[how] || 1);
  while (weigh(out, ix) > cap) {
    const most = out.slice().sort((a, b) => b.count - a.count)[0];
    if (most.count > 1) { most.count -= 1; continue; }
    if (out.length > 1) { const light = out.slice().sort((a, b) => weightOf(ix[a.id]) - weightOf(ix[b.id]))[0]; out.splice(out.indexOf(light), 1); continue; }
    break;
  }
  const w = weigh(out, ix);
  const health = w > cap ? Math.max(0.5, Math.round((cap / w) * 20) / 20) : 1;
  return { groups: out, health };
}

// The party an adventure is written for: its own `party` ({ size: 4 or [3, 5], level }), else three to five
// characters of the adventure's first level.
export function designedParty(adv) {
  let p = (adv && adv.party) || {};
  // Written as words ("2 to 4 divers", "four investigators of level 2"): the numbers in it.
  if (typeof p === 'string') {
    const words = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 };
    const t = p.toLowerCase().replace(/\b(one|two|three|four|five|six)\b/g, (m) => words[m]);
    const lvm = /level\s*(\d+)|(\d+)(?:st|nd|rd|th)[- ]level/.exec(t);
    const nums = t.replace(/level\s*\d+|\d+(?:st|nd|rd|th)[- ]level/g, '').match(/\d+/g) || [];
    p = { size: nums.length ? [Number(nums[0]), Number(nums[nums.length - 1])] : undefined, level: lvm ? Number(lvm[1] || lvm[2]) : undefined };
  }
  const sz = Array.isArray(p.size) ? p.size.map(Number) : p.size ? [Number(p.size), Number(p.size)] : [3, 5];
  const lv = Number(p.level) || Number(adv && adv.level) || Number(String((adv && adv.levels) || '').match(/\d+/)) || 1;
  return { size: [Math.max(1, Math.min(...sz)), Math.max(1, Math.max(...sz))], level: Math.max(1, Math.trunc(lv)) };
}

// A place's fight for the party at the table: the same share of the party's power as it was of the party it is
// written for, never past medium-to-hard for a party smaller than written (it has no one to fall back on). A
// party inside the written size and level is left alone. Numbers first (a group may shrink, never the toughest
// below one), then health, then the blows (a lone creature too strong for a small party: never under half).
export function planFight({ groups, designed, levels, ix }) {
  if (!groups.length || !levels.length) return null;
  const [lo, hi] = designed.size;
  if (levels.length >= lo && levels.length <= hi && levels.every((l) => l === designed.level)) return null;
  const asWritten = weigh(groups, ix) / partyPower(Array(lo).fill(designed.level));
  let target = asWritten * partyPower(levels);
  if (levels.length < lo) target = Math.min(target, partyPower(levels) * 1.75);
  const top = groups.reduce((a, b) => (weightOf(ix[b.id]) > weightOf(ix[a.id]) ? b : a));
  let best = null;
  for (let k = 0.1; k <= 3.001; k += 0.05) {
    const c = groups.map((g) => {
      const most = levels.length < lo ? g.count : Math.min(12, g.count * 2);
      const canGo = levels.length < lo && g !== top && groups.length > 1;
      return { ...g, count: g.scalable === false ? g.count : Math.max(canGo ? 0 : 1, Math.min(most, Math.round(g.count * k))) };
    });
    const w = weigh(c, ix);
    if (c.reduce((n, g) => n + g.count, 0) > 12) continue;
    const d = Math.abs(w - target) + (w > target * 1.1 ? 1e3 : 0);
    if (!best || d < best.d - 1e-9) best = { c, w, d };
  }
  const w = best.w || 1;
  let health = Math.max(0.5, Math.min(1.5, target / w));
  if (Math.abs(health - 1) < 0.15) health = 1;
  health = Math.round(health * 20) / 20;
  const raw = target / w;
  let blows = raw < 0.5 && health === 0.5 ? Math.max(0.5, Math.round((raw / 0.5) * 20) / 20) : 1;
  if (blows > 0.9) blows = 1;
  // A lone creature against a party smaller than written gets all its blows on one or two of them, which the
  // weights do not count: softened again, never under 0.3 (the D&D simulation, 26 Nov: Venyx and Kragg).
  const lone = best.c.reduce((n, g) => n + g.count, 0) === 1;
  if (lone && levels.length < lo && w > partyPower(levels)) blows = Math.max(0.3, Math.round(blows * (w > partyPower(levels) * 2 ? 0.5 : 0.65) * 20) / 20); // twice the party: halved
  const counts = Object.fromEntries(best.c.map((g) => [g.key, g.count]));
  const changed = groups.some((g) => counts[g.key] !== g.count) || health !== 1 || blows !== 1;
  if (!changed) return null;
  const pp = Array(lo).fill(designed.level);
  return { counts, health, blows, ratingAsWritten: rate(weigh(groups, ix), pp), ratingBefore: rate(weigh(groups, ix), levels), rating: rate(w * health * blows, levels) };
}
