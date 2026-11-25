import { readFileSync } from 'node:fs';
import { makeRng } from '../engine/dice.js';
import { newSession, apply } from '../engine/ledger.js';
import { adventureById } from '../data/adventures/index.js';

export const srd = JSON.parse(readFileSync(new URL('../../data/srd.json', import.meta.url), 'utf8'));
export const adventure = adventureById('lantern');
export const BASE = { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 };
// Fights are kept as written here (the fitting has its own tests); the adventure's rules run as in play.
export function table(seed = 7, { auto = { rules: true, scale: 'off' }, adv = adventure } = {}) {
  const rng = makeRng(seed);
  let now = 1000;
  const ctx = (role, pid, extra = {}) => ({ role, pid, rng, now: (now += 1000), adventure: adv, srd, ...extra });
  const T = {
    s: { ...newSession(adv), auto: { ...auto } },
    host(action) { T.s = apply(T.s, action, ctx('host', null)); return T.s; },
    ai(action) { T.s = apply(T.s, action, ctx('host', null, { ai: true })); return T.s; },
    as(pid, action) { T.s = apply(T.s, action, ctx('player', pid)); return T.s; },
  };
  return T;
}
export function hero(T, pid, name, cls = 'fighter', extra = {}) {
  const c = srd.classes.find((x) => x.id === cls);
  T.as(pid, { type: 'join', name: `${name}'s player` });
  T.as(pid, { type: 'pc.create', input: { name, race: 'human', class: cls, method: 'standard', base: BASE, skills: c.skillFrom.slice(0, c.skillChoose), background: 'acolyte', ...extra } });
  return Object.values(T.s.pcs).find((p) => p.name === name);
}
