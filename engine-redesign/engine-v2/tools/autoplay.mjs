// A scripted Director and scripted players that play the module through legal moves only, with no model.
import { legalMoves, play, orgs, upOrgs, clone } from '../src/index.mjs';
import { poolFor } from '../src/world.mjs';

export const PEACEFUL = {
  'toll-vent': ['swear-toll'],
  'soft-field': ['scout-far', 'cut-panel', 'stamp-cut'],
  'render-hall': ['taste-haze', 'open-pump'],
  'brood': ['smell-brood', 'register'],
  'gut-stone': ['find-serial', 'say-serial', 'accept-carry'],
};
export const ROUTE = ['toll-vent', 'soft-field', 'render-hall', 'brood', 'gut-stone'];

export function choose(g, plan = PEACEFUL, mode = 'peaceful') {
  const s = g.s;
  const moves = legalMoves(g);
  if (!moves.length) return null;
  const by = (k) => moves.filter((m) => m.kind === k);
  if (by('begin').length) return by('begin')[0];
  if (s.pending) return moves.find((m) => m.id === 'react:deflect');
  if (s.chase) return by('race')[0];
  if (s.fight) {
    const strikes = by('strike');
    if (strikes.length) { const m = strikes.find((x) => x.target === s.cres && false) || strikes[0]; return m; }
    const dormant = by('stabilise'); if (dormant.length && mode === 'fight') return dormant[0];
    const drift = by('drift'); if (drift.length) return drift[0];
    return by('end-turn')[0];
  }
  const siteId = s.scene.siteId;
  for (const id of plan[siteId] || []) {
    const ms = moves.filter((m) => m.kind === 'interact' && m.interact === id);
    if (!ms.length) continue;
    const it = g.D.sites[siteId].interactables.find((x) => x.id === id);
    const score = (m) => { const p = it.pool ? poolFor(g, s.orgs[m.who], it.pool) : null; return p ? p.pool : 0; };
    ms.sort((a, b) => score(b) - score(a));
    const tries = (s.tries ||= {});
    const k = `${siteId}/${id}`;
    if ((tries[k] || 0) >= 4) continue;
    tries[k] = (tries[k] || 0) + 1;
    return ms[0];
  }
  const next = ROUTE[ROUTE.indexOf(siteId) + 1];
  const ex = by('exit');
  return ex.find((m) => m.to === next) || ex.find((m) => m.to === 'escaped') || ex[0];
}

export function run(g, { plan = PEACEFUL, mode = 'peaceful', maxSteps = 600, onStep = null } = {}) {
  let steps = 0;
  while (!g.s.ended && steps < maxSteps) {
    const m = choose(g, plan, mode);
    if (!m) break;
    const r = play(g, m.id);
    if (!r.ok) throw new Error(`autoplay chose an illegal move ${m.id}: ${r.error}`);
    if (onStep) onStep(m, r);
    steps++;
  }
  return steps;
}
