// Saltglass re-tuned for each dice system (as a converter or designer would): for tests and screen checks.
import { readFileSync } from 'node:fs';
import { getSystem } from '../engine/dicesystems.js';
import { prepare } from '../engine/module.js';
import { existsSync as hasFile } from 'node:fs';
// The worked example: modules/saltglass in the Skeleton, example/saltglass in the template.
const SALT = hasFile(new URL('../example/saltglass/module.json', import.meta.url)) ? 'example' : 'modules';

const read = (f) => JSON.parse(readFileSync(new URL(`../${SALT}/saltglass/${f}`, import.meta.url)));
const base = () => ({ module: read('module.json'), rules: read('rules.json'), handbook: read('handbook.json'), bestiary: read('bestiary.json'), lore: read('lore.json'), adventures: [read('adventures/bell-under-brine.json')] });

// Saltglass, re-tuned for each dice system: what a converter or a designer would do.
export const TUNE = {
  d20: { stat: (v) => 8 + 2 * v, points: { start: 8, spend: 16, max: 15 }, skill: { spend: 4, max: 2 }, defence: { base: 10, stat: 'grace' }, rating: (t) => 2 + 2 * t, cdef: (t) => 11 + t, weapon: (t) => `1d${4 + 2 * t}`, mod: (m) => m * 2, at: 12 },
  percentile: { stat: (v) => 12 * v, skillx: (r) => 15 * r, points: { start: 20, spend: 100, max: 60, step: 5 }, skill: { spend: 90, max: 40, step: 5 }, defence: { base: 0 }, rating: (t) => 30 + 10 * t, cdef: (t) => 5 * t, weapon: (t) => `1d${4 + 2 * t}`, mod: (m) => m * 20, at: 0 },
  '2d6': { stat: (v) => v - 2, points: { start: -1, spend: 6, max: 2 }, skill: { spend: 4, max: 2 }, defence: { base: 7, stat: 'grace' }, rating: (t) => t, cdef: (t) => 7 + t, weapon: (t) => t + 1, mod: (m) => m, at: 10 },
  'success-pool': { stat: (v) => v, points: { start: 1, spend: 6, max: 4 }, skill: { spend: 6, max: 2 }, defence: { base: 1 }, rating: (t) => 3 + t, cdef: (t) => 1 + Math.floor(t / 2), weapon: (t) => t + 1, mod: (m) => m, at: 2 },
  fate: { stat: (v) => v - 1, points: { start: 0, spend: 4, max: 3 }, skill: { spend: 6, max: 2 }, defence: { base: 0, stat: 'grace' }, rating: (t) => 1 + t, cdef: (t) => t, weapon: (t) => t, mod: (m) => m, at: 2 },
  step: { stat: (v) => 2 + 2 * v, skillx: (r) => (r ? 4 + 2 * r : 0), points: { start: 4, spend: 8, max: 10, step: 2 }, skill: { spend: 18, max: 8, step: 2 }, defence: { base: 2, stat: 'grace' }, rating: (t) => 4 + 2 * t, cdef: (t) => 4 + t, weapon: (t) => `2d${2 + 2 * t}`, mod: (m) => m, at: 4 },
  'highest-die': { stat: (v) => Math.min(4, Math.max(0, v - 1)), points: { start: 0, spend: 4, max: 3 }, skill: { spend: 6, max: 2 }, defence: { base: 3, stat: 'grace' }, rating: (t) => 1 + t, cdef: (t) => Math.min(7, 4 + Math.floor(t / 2)), weapon: (t) => t + 1, mod: (m) => Math.max(-3, Math.min(3, m)), at: 6 },
  'roll-keep': { stat: (v) => v + 1, points: { start: 2, spend: 6, max: 5 }, skill: { spend: 6, max: 3 }, defence: { base: 10, stat: 'grace' }, rating: (t) => Math.min(12, 3 + 2 * t), cdef: (t) => 10 + 3 * t, weapon: (t) => t + 1, mod: (m) => Math.max(-3, Math.min(3, m)), at: 15 },
  'roll-under': { stat: (v) => 8 + v, points: { start: 8, spend: 10, max: 14 }, skill: { spend: 6, max: 2 }, defence: { base: 0 }, rating: (t) => 9 + t, cdef: (t) => t, weapon: (t) => t + 1, mod: (m) => m, at: 0 },
};
export function variant(system) {
  const t = TUNE[system];
  const m = base();
  const S = getSystem({ dice: { system } });
  m.module.id = `saltglass-${system}`;
  Object.assign(m.rules, { dice: { system }, statPoints: t.points, skillPoints: t.skill, ladder: S.sys.ladder, defence: t.defence });
  for (const c of m.rules.conditions) if (c.dice) c.dice = t.mod(c.dice);
  for (const p of m.rules.strain.penalties) p.dice = t.mod(p.dice);
  for (const p of m.handbook.pregens) {
    for (const k of Object.keys(p.stats)) p.stats[k] = t.stat(p.stats[k]);
    if (t.skillx) for (const k of Object.keys(p.skills)) p.skills[k] = t.skillx(p.skills[k]);
  }
  for (const c of m.bestiary.creatures) { c.defence = t.cdef(c.tier); for (const a of c.attacks) { delete a.dice; a.rating = t.rating(c.tier); a.weapon = t.weapon(c.tier); } }
  for (const s of m.adventures[0].sites) for (const h of s.hazards || []) h.at = t.at;
  return prepare(m);
}
export function variantRaw(system) { const p = variant(system); return { module: { ...p.module, terms: p.module.rawTerms }, rules: p.rules, handbook: p.handbook, bestiary: p.bestiary, lore: p.lore, adventures: p.adventures }; }

