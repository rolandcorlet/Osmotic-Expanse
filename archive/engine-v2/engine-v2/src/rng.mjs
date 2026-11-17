// Seeded dice. State lives in the game object (g.s.rngState) so a game can be saved, cloned and replayed.
export function rnd(g) {
  g.s.rngState = (g.s.rngState + 0x6d2b79f5) >>> 0;
  let t = g.s.rngState;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
export const d6 = (g) => 1 + Math.floor(rnd(g) * 6);
export const dice = (g, n) => Array.from({ length: Math.max(0, n) }, () => d6(g));
