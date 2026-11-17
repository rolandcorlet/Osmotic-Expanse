// Dice for the Catalytic Engine. Every roll in the game is d6.
// The generator is seedable so tests and replays are repeatable.

export function makeRng(seed) {
  // mulberry32: small, fast, good enough for table dice.
  let a = (seed >>> 0) || 0x9e3779b9;
  return function rng() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function systemRng() {
  // Uses the platform's cryptographic source when there is one.
  const c = globalThis.crypto;
  if (c && c.getRandomValues) {
    const buf = new Uint32Array(1);
    return () => {
      c.getRandomValues(buf);
      return buf[0] / 4294967296;
    };
  }
  return Math.random;
}

export function d6(rng) {
  return 1 + Math.floor(rng() * 6);
}

export function rollDice(n, rng) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(d6(rng));
  return out;
}

// Dice a player rolled at the table and typed in. Returns a clean array or throws.
export function checkOwnDice(dice, n) {
  if (!Array.isArray(dice) || dice.length !== n) {
    throw new Error(`Expected ${n} dice, got ${Array.isArray(dice) ? dice.length : 0}.`);
  }
  return dice.map((d) => {
    const v = Number(d);
    if (!Number.isInteger(v) || v < 1 || v > 6) throw new Error('Each die must be a whole number from 1 to 6.');
    return v;
  });
}
