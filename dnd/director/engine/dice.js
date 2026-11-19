// Dice for D&D 5e. Every roll the table sees comes from here, through an rng the server owns,
// so a roll can be replayed in tests from a seed.

export function makeRng(seed) {
  let a = (Number(seed) >>> 0) || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function systemRng() {
  const buf = new Uint32Array(1);
  const c = globalThis.crypto;
  return () => {
    if (c && c.getRandomValues) { c.getRandomValues(buf); return buf[0] / 4294967296; }
    return Math.random();
  };
}

export const die = (sides, rng) => 1 + Math.floor(rng() * sides);

// A d20 with advantage, disadvantage or neither. Both cancel out, as the rules say.
export function d20(rng, { adv = false, dis = false, own = null } = {}) {
  const mode = adv && !dis ? 'adv' : dis && !adv ? 'dis' : '';
  const roll = () => die(20, rng);
  const first = own && own[0] ? clampD20(own[0]) : roll();
  if (!mode) return { rolls: [first], kept: first, mode };
  const second = own && own[1] ? clampD20(own[1]) : roll();
  const kept = mode === 'adv' ? Math.max(first, second) : Math.min(first, second);
  return { rolls: [first, second], kept, mode };
}
function clampD20(v) {
  const n = Math.trunc(Number(v));
  if (!(n >= 1 && n <= 20)) throw new Error('A d20 shows a number from 1 to 20.');
  return n;
}

// "2d6+3", "1d8 + 2", "3d4+1d6-1", "8". Returns null when the text is not dice.
export function parseDice(expr) {
  const s = String(expr || '').replace(/\s+/g, '').toLowerCase();
  if (!s || !/^[+-]?(\d*d\d+|\d+)([+-](\d*d\d+|\d+))*$/.test(s)) return null;
  const terms = [];
  for (const m of s.matchAll(/([+-]?)(\d*)d(\d+)|([+-]?)(\d+)/g)) {
    if (m[3]) terms.push({ n: Number(m[2] || 1) * (m[1] === '-' ? -1 : 1), sides: Number(m[3]) });
    else if (m[5]) terms.push({ flat: Number(m[5]) * (m[4] === '-' ? -1 : 1) });
  }
  return terms;
}

// Rolls an expression. A critical hit rolls the dice twice over (not the flat part).
export function rollDice(expr, rng, { crit = false, extraMod = 0 } = {}) {
  const terms = parseDice(expr);
  if (!terms) throw new Error(`"${expr}" is not a dice amount.`);
  const dice = [];
  let flat = extraMod;
  for (const t of terms) {
    if (t.flat != null) { flat += t.flat; continue; }
    const count = Math.abs(t.n) * (crit ? 2 : 1);
    for (let i = 0; i < count; i++) dice.push((t.n < 0 ? -1 : 1) * die(t.sides, rng));
  }
  const total = Math.max(0, dice.reduce((a, b) => a + b, 0) + flat);
  return { expr, dice, flat, total, crit };
}

// The average of an expression, rounded down (how a stat block prints damage).
export function average(expr) {
  const terms = parseDice(expr);
  if (!terms) return 0;
  return Math.floor(terms.reduce((a, t) => a + (t.flat != null ? t.flat : t.n * (t.sides + 1) / 2), 0));
}
