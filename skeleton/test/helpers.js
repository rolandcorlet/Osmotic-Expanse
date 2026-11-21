import { makeRng } from '../engine/dice.js';
import { loadModule } from '../engine/module.js';
import { newSession, apply } from '../engine/ledger.js';

export const mod = loadModule(new URL('../modules', import.meta.url).pathname, 'saltglass');
export function table(seed = 7) {
  const rng = makeRng(seed);
  let now = 1000;
  const ctx = (role, pid, extra = {}) => ({ role, pid, rng, now: (now += 1000), mod, ...extra });
  const T = {
    s: newSession(mod),
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
