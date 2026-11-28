import { fileURLToPath } from 'node:url';
import { makeRng } from '../engine/dice.js';
import { loadModule, moduleHome } from '../engine/module.js';
import { newSession, apply } from '../engine/ledger.js';

export const mod = loadModule(moduleHome(fileURLToPath(new URL('..', import.meta.url)), 'saltglass'), 'saltglass');
export function table(seed = 7) {
  const rng = makeRng(seed);
  let now = 1000;
  const ctx = (role, pid, extra = {}) => ({ role, pid, rng, now: (now += 1000), mod, ...extra });
  const T = {
    s: { ...newSession(mod), fitOff: true }, // fights as written here; the fitting has its own tests
    host(a) { T.s = apply(T.s, a, ctx('host', null)); return T.s; },
    ai(a) { T.s = apply(T.s, a, ctx('host', null, { ai: true })); return T.s; },
    as(pid, a) { T.s = apply(T.s, a, ctx('player', pid)); return T.s; },
  };
  return T;
}
export function diver(T, pid, index = 0) {
  T.as(pid, { type: 'join', name: `Player ${pid}` });
  T.as(pid, { type: 'char.pregen', index });
  return T.s.chars[T.s.players[pid].charId];
}
