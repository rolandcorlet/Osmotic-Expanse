// Rules read from core-rules.json / players.json. Nothing here parses a sentence.
import { dice } from './rng.mjs';

export const BAND_ORDER = ['contact', 'near', 'mid', 'far', 'loose'];
export const bandIdx = (b) => BAND_ORDER.indexOf(b);
export const bandAt = (i) => BAND_ORDER[Math.max(0, Math.min(BAND_ORDER.length - 1, i))];

export function threshold(D, t) {
  if (t && typeof t === 'object' && t.printed != null) return t.printed;
  const row = D.core.ladder.find((l) => l.id === t);
  if (!row) throw new Error(`Threshold "${t}" is not on the ladder`);
  return row.at;
}

export function stressDice(D, stress) {
  let d = 0;
  for (const t of D.core.stress.track) if (t.dice != null && stress >= t.at) d = t.dice;
  return d;
}

// Standing modifiers an organism or creature carries from its conditions (the Engine's, never the model's).
export function conditionMods(D, body) {
  const m = {};
  for (const c of body.conditions || []) {
    const rec = D.conditions[c.id];
    if (!rec) continue;
    for (const [k, v] of Object.entries(rec.mods || {})) if (typeof v === 'number') m[k] = (m[k] || 0) + v;
    else m[k] = v;
  }
  return m;
}

// Pool = baseline + pathway + modifiers (capped at +5 / -5, Stress counted inside the cap, ruling 3), never under 1.
export function buildPool(D, { base = 0, path = 0, mods = [], stress = 0 }) {
  const list = [...mods];
  const sd = stressDice(D, stress);
  if (sd) list.push({ id: 'stress', dice: sd });
  let sum = list.reduce((a, m) => a + m.dice, 0);
  const cap = 5;
  const capped = Math.max(-cap, Math.min(cap, sum));
  const pool = Math.max(D.core.roll.poolMin.value, base + path + capped);
  return { pool, mods: list, capped };
}

export function homeostatic(pool, at) { return pool * 3 >= at; }

// "Each 1 is an Inhibitor and scores 0 and marks 1 Stress. Runaway = no 1s and at least two 6s."
export function rollPool(g, pool, at = null) {
  const ds = dice(g, pool);
  const inhibitors = ds.filter((x) => x === 1).length;
  const total = ds.reduce((a, x) => a + (x === 1 ? 0 : x), 0);
  const runaway = inhibitors === 0 && ds.filter((x) => x === 6).length >= 2;
  const out = { dice: ds, total, inhibitors, runaway, at };
  if (at != null) { out.success = total >= at; out.overflow = out.success ? total - at : 0; out.shortBy = out.success ? 0 : at - total; }
  return out;
}

// Words, never numbers. Player bands come from players.json; creature ladders from the record.
export function miWord(D, mi, miMax) {
  if (mi <= 0) return 'gone dark';
  const r = mi / miMax;
  return r > 0.75 ? 'whole' : r > 0.5 ? 'marked' : r > 0.25 ? 'torn' : 'failing';
}
export function stressWord(s) { return s <= 2 ? 'steady' : s <= 4 ? 'strained' : s === 5 ? 'shaking' : 'coming apart'; }
export function ppWord(pp, ppMax) { return pp >= ppMax ? 'fresh' : pp >= 2 ? 'something left' : pp === 1 ? 'one breath' : 'spent'; }
export function countdownWord(marked, max) { return marked === 0 ? 'holding' : marked >= max - 1 ? 'at the edge' : marked * 2 >= max ? 'thinning' : 'holding'; }

// "over 80%, 60-80%, 35-60%, 15-35%, under 15%, destroyed"
export function ladderStep(share) { return share > 0.8 ? 0 : share > 0.6 ? 1 : share > 0.35 ? 2 : share > 0.15 ? 3 : 4; }
export function creatureLook(c) {
  if (c.down) return c.ladder[5];
  const share = c.segMax ? c.seg / c.segMax : c.mi / c.miMax;
  return c.ladder[ladderStep(share)];
}
