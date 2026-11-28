// The dice systems a module can choose (rules.json "dice": { "system": "...", ...options }).
// Every system answers the same questions, so the Engine, the Director and the screens never need
// to know which one a game uses:
//   ranges(o)            the numbers that make sense for stats, skills, difficulties, attacks, defences, modifiers
//   bonus(o, value)      a stat as a flat number, for health and defence ("Brawn 4" -> 4; "STR 14" -> +2)
//   spec(o, {...})       what to roll: the dice, what is added, the target; spec.label is "4d6", "d20+5", "62%"
//   roll(o, spec, at, d) roll it against a difficulty: { total, success, partial, margin, degrees, snags, surge, faces, shown }
//   describe(o, T)       the rules in words, in the module's own terms
// A SNAG is the system's penalty (each marks 1 strain); a SURGE is its bonus (an attack's weapon counts twice).
// Pure JavaScript with no Node imports: the screens load this file too.

import { makeRng } from './dice.js';
import { successChance } from './odds.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const signed = (n) => (n >= 0 ? `+${n}` : `${n}`);
function sumMods(mods, cap) {
  const raw = (mods || []).reduce((a, m) => a + (Number(m && (m.dice ?? m.mod)) || 0), 0);
  return { raw, applied: clamp(raw, -cap, cap) };
}

// ---- the d6 pool (the Osmotic Expanse's own): kept exactly as it was ----------------------------
export const MOD_CAP = 5;
export function buildPool({ stat = 0, skill = 0, mods = [] } = {}) {
  const list = mods.filter((m) => m && Number(m.dice ?? m.mod)).map((m) => ({ label: m.label || 'Modifier', dice: Number(m.dice ?? m.mod) }));
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

// One die from a source: the player's own typed dice first (in order), then the random generator.
// sides: a number, or 'F' for a Fate die (-1, 0, +1).
export function makeSource(rng, own = null) {
  const queue = Array.isArray(own) ? own.slice() : [];
  const src = (sides) => {
    if (queue.length) {
      const raw = queue.shift();
      const v = sides === 'F' ? ({ '-': -1, '+': 1, 0: 0 }[String(raw).trim()] ?? Number(raw)) : Number(raw);
      const ok = sides === 'F' ? [-1, 0, 1].includes(v) : Number.isInteger(v) && v >= 1 && v <= sides;
      if (!ok) throw new Error(sides === 'F' ? 'Each Fate die is -, 0 or +.' : `Each d${sides} is a whole number from 1 to ${sides}.`);
      return v;
    }
    if (own && own.length && src.strict) throw new Error('Type every die you rolled.');
    return sides === 'F' ? Math.floor(rng() * 3) - 1 : 1 + Math.floor(rng() * sides);
  };
  src.left = () => queue.length;
  return src;
}
function explode(src, sides, on, cap = 10) {
  const faces = [src(sides)];
  while (on && faces[faces.length - 1] >= on && faces.length < cap) faces.push(src(sides));
  return faces;
}
const face = (v, sides, mark = '') => ({ v, sides, mark });

export const SYSTEMS = {
  'd6-pool': {
    name: 'd6 pool (the Skeleton\'s own)',
    for: 'The Osmotic Expanse, Saltglass; any game that wants dice that pile up as you get better.',
    defaults: { modCap: 5, damageAdd: 'margin' },
    ladder: [{ at: 8, name: 'Easy' }, { at: 12, name: 'Standard' }, { at: 16, name: 'Hard' }, { at: 20, name: 'Extreme' }, { at: 24, name: 'Legendary' }],
    ranges: () => ({ stat: [1, 5], skill: [0, 3], at: [2, 40], rating: [1, 15], defence: [2, 40], mod: [-5, 5] }),
    bonus: (o, v) => Number(v) || 0,
    spec(o, { stat = 0, skill = 0, rating = null, mods = [] }) {
      const p = buildPool({ stat: rating ?? stat, skill: rating != null ? 0 : skill, mods });
      return { n: p.dice, label: `${p.dice}d6`, dice: Array(p.dice).fill(6), capped: p.capped };
    },
    roll(o, spec, at, src) {
      const dice = spec.dice.map(() => src(6));
      const r = readRoll(dice, at);
      return { total: r.total, success: r.success, partial: false, margin: r.total - at, degrees: r.success ? Math.floor(r.overflow / 4) : 0, snags: r.snags, surge: r.surge,
        faces: dice.map((d) => face(d, 6, d === 1 ? 'snag' : d === 6 ? 'six' : '')), shown: `${r.total} against ${at}` };
    },
    exact: (o, spec, at) => successChance(spec.n, at),
    describe: (o, T) => `Every roll is a pool of six-sided dice: a stat (1 to 5 dice) plus a skill (0 to 3) plus or minus modifiers (each modifier is a die; together at most +5 or -5; never fewer than 1 die). Add up the dice; a 1 scores nothing. Each 1 is a ${T.snag}: it marks 1 ${T.strain}. Two or more 6s and no 1s is a ${T.surge}. Meet or beat the ${T.difficulty} (8 easy, 12 standard, 16 hard, 20 extreme, 24 legendary); what is left over is ${T.overflow.toLowerCase()}. Damage = ${T.overflow.toLowerCase()} + weapon - soak (a ${T.surge} counts the weapon twice).`,
  },

  d20: {
    name: 'd20 + modifier',
    for: 'D&D, Pathfinder, the OSR, Starfinder, and most d20 games.',
    defaults: { statMode: 'score', perRank: 2, crit: 20, fumble: 1, autoCrit: true, damageAdd: 'none', modCap: 10 },
    ladder: [{ at: 5, name: 'Very easy' }, { at: 10, name: 'Easy' }, { at: 15, name: 'Medium' }, { at: 20, name: 'Hard' }, { at: 25, name: 'Very hard' }, { at: 30, name: 'Nearly impossible' }],
    ranges: (o) => ({ stat: o.statMode === 'bonus' ? [-5, 10] : [1, 30], skill: [0, 4], at: [1, 40], rating: [-5, 25], defence: [5, 35], mod: [-10, 10] }),
    bonus: (o, v) => (o.statMode === 'bonus' ? Number(v) || 0 : Math.floor(((Number(v) || 10) - 10) / 2)),
    spec(o, { stat = 10, skill = 0, rating = null, mods = [] }) {
      const base = rating ?? (SYSTEMS.d20.bonus(o, stat) + (Number(skill) || 0) * o.perRank);
      const add = base + sumMods(mods, o.modCap).applied;
      return { add, label: `d20${add ? signed(add) : ''}`, dice: [20] };
    },
    roll(o, spec, at, src) {
      const d = src(20);
      const total = d + spec.add;
      const surge = d >= o.crit;
      const snag = d <= o.fumble;
      const success = o.autoCrit && surge ? true : o.autoCrit && snag ? false : total >= at;
      const margin = total - at;
      return { total, success, partial: false, margin, degrees: success ? Math.max(0, Math.floor(margin / 5)) : 0, snags: snag ? 1 : 0, surge,
        faces: [face(d, 20, surge ? 'surge' : snag ? 'snag' : '')], shown: `${d}${spec.add ? signed(spec.add) : ''} = ${total} against ${at}` };
    },
    describe: (o, T) => `Roll a d20 and add a modifier: the stat's bonus (${o.statMode === 'bonus' ? 'written as a bonus' : 'a score of 10 is +0, every 2 points above or below is +1 or -1'}) plus ${o.perRank} for each skill rank, plus or minus situational modifiers. Meet or beat the ${T.difficulty} (5 very easy, 10 easy, 15 medium, 20 hard, 25 very hard, 30 nearly impossible). A natural ${o.crit} is a ${T.surge}${o.autoCrit ? ' and always succeeds' : ''}: on an attack the weapon's dice count twice. A natural ${o.fumble} is a ${T.snag}${o.autoCrit ? ' and always fails' : ''}: it marks 1 ${T.strain}. Damage = the weapon's dice${o.damageAdd === 'degrees' ? ' + 1 per 5 the roll beat the target by' : ''} - soak, at least 1.`,
  },

  percentile: {
    name: 'Percentile (roll under)',
    for: 'Call of Cthulhu, RuneQuest and Basic Roleplaying, Warhammer Fantasy, Delta Green.',
    defaults: { fumbleFrom: 96, extremeDiv: 5, levels: 'fractions', damageAdd: 'degrees', modCap: 60 },
    ladder: [{ at: -20, name: 'Easy' }, { at: 0, name: 'Regular' }, { at: 20, name: 'Hard' }, { at: 40, name: 'Very hard' }],
    ranges: () => ({ stat: [1, 99], skill: [0, 99], at: [-60, 90], rating: [1, 99], defence: [-40, 60], mod: [-60, 60] }),
    bonus: (o, v) => Math.floor((Number(v) || 0) / 10),
    spec(o, { stat = 0, skill = 0, rating = null, mods = [] }) {
      const target = clamp((rating ?? ((Number(stat) || 0) + (Number(skill) || 0))) + sumMods(mods, o.modCap).applied, 1, 99);
      return { target, label: `${target}%`, dice: [100] };
    },
    roll(o, spec, at, src) {
      const d = src(100);
      const eff = clamp(spec.target - at, 1, 99);
      const success = d <= eff;
      const surge = success && d <= Math.max(1, Math.floor(eff / o.extremeDiv));
      const snag = !success && d >= (eff < 50 ? o.fumbleFrom : 100);
      const degrees = !success ? 0 : o.levels === 'tens' ? Math.floor(eff / 10) - Math.floor(d / 10) : (d <= Math.floor(eff / o.extremeDiv) ? 2 : d <= Math.floor(eff / 2) ? 1 : 0);
      return { total: d, success, partial: false, margin: eff - d, degrees: Math.max(0, degrees), snags: snag ? 1 : 0, surge,
        faces: [face(d, 100, surge ? 'surge' : snag ? 'snag' : '')], shown: `rolled ${d} against ${eff}%` };
    },
    describe: (o, T) => `Roll d100 (1 to 100) and try to roll at or under your chance: the stat plus the skill, as a percentage, plus or minus modifiers. The ${T.difficulty} lowers the chance (Regular 0, Hard -20, Very hard -40; Easy adds 20). Rolling a fifth of your chance or less is a ${T.surge}: on an attack the weapon's dice count twice. A failed roll of ${o.fumbleFrom} or more (100 when the chance is 50 or more) is a ${T.snag}: it marks 1 ${T.strain}. ${o.levels === 'tens' ? 'Each 10 you roll under adds a degree of success.' : 'Half your chance or less is a hard success (1 degree); a fifth or less an extreme one (2).'} Damage = the weapon's dice${o.damageAdd === 'degrees' ? ' + 1 per degree' : ''} - soak, at least 1.`,
  },

  '2d6': {
    name: '2d6 + modifier',
    for: 'Powered by the Apocalypse (Apocalypse World, Dungeon World, Monster of the Week), Traveller.',
    defaults: { partial: 3, damageAdd: 'none', modCap: 4 },
    ladder: [{ at: 6, name: 'Easy' }, { at: 8, name: 'Routine' }, { at: 10, name: 'Standard' }, { at: 12, name: 'Hard' }, { at: 14, name: 'Formidable' }],
    ranges: () => ({ stat: [-3, 5], skill: [0, 3], at: [2, 16], rating: [-3, 8], defence: [2, 16], mod: [-4, 4] }),
    bonus: (o, v) => Number(v) || 0,
    spec(o, { stat = 0, skill = 0, rating = null, mods = [] }) {
      const add = (rating ?? ((Number(stat) || 0) + (Number(skill) || 0))) + sumMods(mods, o.modCap).applied;
      return { add, label: `2d6${add ? signed(add) : ''}`, dice: [6, 6] };
    },
    roll(o, spec, at, src) {
      const a = src(6); const b = src(6);
      const total = a + b + spec.add;
      const full = total >= at;
      const success = full || (o.partial > 0 && total >= at - o.partial);
      const snag = a === 1 && b === 1;
      const surge = a === 6 && b === 6;
      return { total, success, partial: success && !full, margin: total - at, degrees: full ? Math.floor((total - at) / 2) : 0, snags: snag ? 1 : 0, surge,
        faces: [face(a, 6, snag ? 'snag' : surge ? 'surge' : ''), face(b, 6, snag ? 'snag' : surge ? 'surge' : '')], shown: `${a}+${b}${spec.add ? signed(spec.add) : ''} = ${total} against ${at}` };
    },
    describe: (o, T) => `Roll two six-sided dice and add the stat and skill (and any modifiers). Meet or beat the ${T.difficulty} (10 standard) for a full success${o.partial ? `; up to ${o.partial} short is a partial success: you do it, at a cost, a hard choice or a worse position` : ''}; lower is a miss, and the Director makes a move. Double 1s is a ${T.snag} (1 ${T.strain}); double 6s is a ${T.surge}: on an attack the weapon counts twice. Damage = the weapon - soak, at least 1.`,
  },

  'success-pool': {
    name: 'Pool of successes',
    for: 'World of Darkness and Vampire (d10, 8+), Shadowrun (d6, 5+), Year Zero games (d6, 6s), Blades-like pools.',
    defaults: { sides: 10, target: 8, explode: 10, onesCancel: false, snagOnes: false, surgeExtra: 3, damageAdd: 'degrees', modCap: 5 },
    ladder: [{ at: 1, name: 'Easy' }, { at: 2, name: 'Standard' }, { at: 3, name: 'Hard' }, { at: 4, name: 'Very hard' }, { at: 5, name: 'Extreme' }],
    ranges: () => ({ stat: [1, 6], skill: [0, 5], at: [1, 10], rating: [1, 20], defence: [1, 8], mod: [-5, 5] }),
    bonus: (o, v) => Number(v) || 0,
    spec(o, { stat = 0, skill = 0, rating = null, mods = [] }) {
      const n = Math.max(1, (rating ?? ((Number(stat) || 0) + (Number(skill) || 0))) + sumMods(mods, o.modCap).applied);
      return { n, label: `${n}d${o.sides}`, dice: Array(n).fill(o.sides), explode: o.explode };
    },
    roll(o, spec, at, src) {
      const groups = spec.dice.map(() => explode(src, o.sides, o.explode || 0));
      const all = groups.flat();
      const ones = all.filter((d) => d === 1).length;
      let hits = all.filter((d) => d >= o.target).length;
      if (o.onesCancel) hits = Math.max(0, hits - ones);
      const success = hits >= at;
      const botch = hits === 0 && ones > 0;
      return { total: hits, success, partial: false, margin: hits - at, degrees: success ? hits - at : 0, snags: o.snagOnes ? ones : botch ? 1 : 0, surge: success && hits - at >= o.surgeExtra,
        faces: all.map((d) => face(d, o.sides, d >= o.target ? 'hit' : d === 1 ? 'snag' : '')), shown: `${hits} success${hits === 1 ? '' : 'es'}, needed ${at}` };
    },
    describe: (o, T) => `Roll a pool of d${o.sides}s: the stat plus the skill, plus or minus modifiers (each a die). Every die showing ${o.target} or more is a success${o.explode ? `; a ${o.explode} also rolls another die` : ''}${o.onesCancel ? '; each 1 cancels a success' : ''}. The ${T.difficulty} is how many successes you need (1 easy, 2 standard, 3 hard). ${o.snagOnes ? `Each 1 is a ${T.snag}: 1 ${T.strain}.` : `No successes and at least one 1 is a botch, a ${T.snag}: 1 ${T.strain}.`} ${o.surgeExtra} or more successes over what you needed is a ${T.surge}: on an attack the weapon counts twice. Damage = the weapon${o.damageAdd === 'degrees' ? ' + 1 per extra success' : ''} - soak, at least 1.`,
  },

  fate: {
    name: 'Fate dice (4dF)',
    for: 'Fate Core, Fate Accelerated, and games on the Fate ladder.',
    defaults: { style: 3, damageAdd: 'margin', modCap: 4 },
    ladder: [{ at: 0, name: 'Mediocre' }, { at: 1, name: 'Average' }, { at: 2, name: 'Fair' }, { at: 3, name: 'Good' }, { at: 4, name: 'Great' }, { at: 5, name: 'Superb' }, { at: 6, name: 'Fantastic' }],
    ranges: () => ({ stat: [0, 5], skill: [0, 5], at: [-2, 8], rating: [0, 8], defence: [-2, 8], mod: [-4, 4] }),
    bonus: (o, v) => Number(v) || 0,
    spec(o, { stat = 0, skill = 0, rating = null, mods = [] }) {
      const add = (rating ?? ((Number(stat) || 0) + (Number(skill) || 0))) + sumMods(mods, o.modCap).applied;
      return { add, label: `4dF${add ? signed(add) : ''}`, dice: ['F', 'F', 'F', 'F'] };
    },
    roll(o, spec, at, src) {
      const dice = [src('F'), src('F'), src('F'), src('F')];
      const sum = dice.reduce((a, b) => a + b, 0);
      const total = sum + spec.add;
      const margin = total - at;
      return { total, success: margin >= 0, partial: margin === 0, margin, degrees: Math.max(0, margin), snags: sum === -4 ? 1 : 0, surge: margin >= o.style,
        faces: dice.map((d) => face(d, 'F', d > 0 ? 'six' : d < 0 ? 'snag' : '')), shown: `[${dice.map((d) => (d > 0 ? '+' : d < 0 ? '-' : '0')).join(' ')}] ${signed(spec.add)} = ${total} against ${at}` };
    },
    describe: (o, T) => `Roll four Fate dice (each -, blank or +) and add the stat and skill. Compare to the ${T.difficulty} on the ladder (0 Mediocre, 1 Average, 2 Fair, 3 Good, 4 Great, 5 Superb, 6 Fantastic). Beat it to succeed; tie it to succeed at a minor cost; beat it by ${o.style} or more for success with style, a ${T.surge}: on an attack the weapon counts twice. Four minuses is a ${T.snag}: 1 ${T.strain}. Damage = the shifts you beat it by + the weapon - soak, at least 1.`,
  },

  step: {
    name: 'Step dice (d4 to d12)',
    for: 'Savage Worlds, Cortex-style games, and any game where better means a bigger die.',
    defaults: { wild: 6, raise: 4, unskilled: -2, damageAdd: 'none', modCap: 4 },
    ladder: [{ at: 2, name: 'Easy' }, { at: 4, name: 'Standard' }, { at: 6, name: 'Hard' }, { at: 8, name: 'Very hard' }, { at: 10, name: 'Heroic' }],
    ranges: () => ({ stat: [4, 12], skill: [0, 12], at: [2, 14], rating: [4, 12], defence: [2, 14], mod: [-4, 4] }),
    bonus: (o, v) => Math.floor((Number(v) || 4) / 2),
    spec(o, { stat = 4, skill = 0, rating = null, mods = [] }) {
      const die = rating ?? (Number(skill) || Number(stat) || 4);
      const add = (rating == null && !Number(skill) ? o.unskilled : 0) + sumMods(mods, o.modCap).applied;
      return { die, add, label: `d${die}${o.wild ? ` + wild d${o.wild}` : ''}${add ? signed(add) : ''}`, dice: o.wild ? [die, o.wild] : [die], explode: true };
    },
    roll(o, spec, at, src) {
      const trait = explode(src, spec.die, spec.die);
      const wild = o.wild ? explode(src, o.wild, o.wild) : null;
      const t = trait.reduce((a, b) => a + b, 0);
      const w = wild ? wild.reduce((a, b) => a + b, 0) : -Infinity;
      const total = Math.max(t, w) + spec.add;
      const success = total >= at;
      const raises = success ? Math.floor((total - at) / o.raise) : 0;
      const snag = trait[0] === 1 && (!wild || wild[0] === 1);
      return { total, success, partial: false, margin: total - at, degrees: raises, snags: snag ? 1 : 0, surge: raises >= 1,
        faces: [...trait.map((d) => face(d, spec.die, snag ? 'snag' : '')), ...(wild || []).map((d) => face(d, o.wild, snag ? 'snag' : 'wild'))], shown: `${total} against ${at}${raises ? ` (${raises} raise${raises > 1 ? 's' : ''})` : ''}` };
    },
    describe: (o, T) => `Stats and skills are dice: d4, d6, d8, d10 or d12. Roll the skill's die (or the stat's, at ${o.unskilled}, if you have no skill)${o.wild ? `, and a wild d${o.wild} beside it; keep the higher` : ''}. A die that rolls its highest face rolls again and adds. Meet the ${T.difficulty} (4 standard) to succeed; every ${o.raise} over it is a raise, and a raise is a ${T.surge}: on an attack the weapon counts twice. Rolling 1s on every die is a ${T.snag}: 1 ${T.strain}. Damage = the weapon - soak, at least 1.`,
  },

  'roll-under': {
    name: 'Roll under (3d6 or d20)',
    for: 'GURPS (3d6 under skill), old-school d20 roll-under games, and simple roll-under systems.',
    defaults: { n: 3, sides: 6, crit: 4, fumble: 17, damageAdd: 'degrees', modCap: 10 },
    ladder: [{ at: -4, name: 'Easy' }, { at: 0, name: 'Average' }, { at: 2, name: 'Hard' }, { at: 4, name: 'Very hard' }, { at: 6, name: 'Extreme' }],
    ranges: (o) => ({ stat: [1, o.n * o.sides], skill: [0, o.n * o.sides], at: [-10, 10], rating: [1, o.n * o.sides], defence: [-10, 10], mod: [-10, 10] }),
    bonus: (o, v) => Math.floor(((Number(v) || 10) - 10) / 2),
    spec(o, { stat = 10, skill = 0, rating = null, mods = [] }) {
      const target = (rating ?? ((Number(stat) || 0) + (Number(skill) || 0))) + sumMods(mods, o.modCap).applied;
      return { target, label: `${o.n}d${o.sides} under ${target}`, dice: Array(o.n).fill(o.sides) };
    },
    roll(o, spec, at, src) {
      const dice = Array.from({ length: o.n }, () => src(o.sides));
      const sum = dice.reduce((a, b) => a + b, 0);
      const eff = spec.target - at;
      const surge = sum <= o.crit;
      const snag = sum >= o.fumble;
      const success = surge || (!snag && sum <= eff);
      return { total: sum, success, partial: false, margin: eff - sum, degrees: success ? Math.max(0, Math.floor((eff - sum) / 2)) : 0, snags: snag ? 1 : 0, surge,
        faces: dice.map((d) => face(d, o.sides, surge ? 'surge' : snag ? 'snag' : '')), shown: `rolled ${sum} against ${eff}` };
    },
    describe: (o, T) => `Roll ${o.n}d${o.sides} and try to roll at or under your target: the stat plus the skill, plus or minus modifiers. The ${T.difficulty} lowers the target (Average 0, Hard -2, Very hard -4; Easy adds 4). A roll of ${o.crit} or less is a ${T.surge}: it always succeeds, and on an attack the weapon counts twice. A roll of ${o.fumble} or more is a ${T.snag}: it always fails and marks 1 ${T.strain}. Damage = the weapon${o.damageAdd === 'degrees' ? ' + 1 per 2 you rolled under by' : ''} - soak, at least 1.`,
  },
};

// The system a module uses, with its options filled in. No "dice" block: the d6 pool.
export function getSystem(rules) {
  const d = (rules && rules.dice) || {};
  const id = SYSTEMS[d.system] ? d.system : 'd6-pool';
  const sys = SYSTEMS[id];
  const o = { ...sys.defaults, ...d, system: id };
  return { id, sys, o, ranges: sys.ranges(o), name: sys.name };
}

// The chance (0..1) of success: exact for the d6 pool, counted over many seeded rolls otherwise.
export function chance(S, spec, at, n = 4000) {
  if (S.sys.exact) { try { return S.sys.exact(S.o, spec, at); } catch (e) { /* fall through */ } }
  const rng = makeRng(12345);
  const src = makeSource(rng);
  let ok = 0;
  for (let i = 0; i < n; i++) if (S.sys.roll(S.o, spec, at, src).success) ok += 1;
  return ok / n;
}

// What to type when rolling your own dice.
export function ownDiceHint(spec) {
  const counts = {};
  for (const d of spec.dice) counts[d] = (counts[d] || 0) + 1;
  const list = Object.entries(counts).map(([s, n]) => (s === 'F' ? `${n} Fate dice (- 0 +)` : `${n}d${s}`)).join(' and ');
  return `${list}${spec.explode ? ', then any extra dice that exploded' : ''}`;
}

// Weapon damage: a number, or dice like "1d8+2". A surge counts the number (or the dice) twice.
export function weaponDamage(weapon, surge, rng) {
  if (typeof weapon === 'number') return surge ? weapon * 2 : weapon;
  const m = /^\s*(\d*)d(\d+)\s*([+-]\s*\d+)?\s*$/i.exec(String(weapon || ''));
  if (!m) return Number(weapon) || 0;
  const n = (Number(m[1]) || 1) * (surge ? 2 : 1);
  let t = 0;
  for (let i = 0; i < n; i++) t += 1 + Math.floor(rng() * Number(m[2]));
  return t + (Number((m[3] || '').replace(/\s/g, '')) || 0);
}
export const validWeapon = (w) => (typeof w === 'number' && w >= 0 && w <= 30) || /^\s*(\d*)d(\d+)\s*([+-]\s*\d+)?\s*$/i.test(String(w || ''));

// The words for the prompts: every system, what it suits, and its options.
export function catalogue() {
  return Object.entries(SYSTEMS).map(([id, s]) => {
    const r = s.ranges(s.defaults);
    return `- "${id}": ${s.name}. For ${s.for} Options and defaults: ${JSON.stringify(s.defaults)}. Stats ${r.stat[0]} to ${r.stat[1]}; skills 0 to ${r.skill[1]}; difficulties ${r.at[0]} to ${r.at[1]} (default ladder: ${s.ladder.map((x) => `${x.name} ${x.at}`).join(', ')}); a creature attack's "rating" ${r.rating[0]} to ${r.rating[1]}; a creature's "defence" ${r.defence[0]} to ${r.defence[1]}; a condition's "mod" ${r.mod[0]} to ${r.mod[1]}.`;
  }).join('\n');
}
