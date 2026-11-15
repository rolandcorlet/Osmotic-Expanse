// Lines the Engine writes itself, with no model call. The model is asked only when there is something to describe.
import { miWord, stressWord, ppWord, countdownWord, creatureLook } from './rules.mjs';
import { upOrgs, orgs, site, liveCreatures, creaturesHere } from './world.mjs';
import { currentActor } from './fight.mjs';

export function rollResult(o, r) {
  return `${o.name.split(' ')[0]} throws ${r.dice.join(', ')}: ${r.total} against ${r.at}. ${r.success ? `Success${r.overflow ? `, ${r.overflow} over` : ''}` : `Short by ${r.shortBy}`}${r.runaway ? '. The reaction feeds itself' : ''}.`;
}

export function handover(g) {
  const key = currentActor(g);
  if (!key || !key.startsWith('org:')) return null;
  const o = g.s.orgs[key.slice(4)];
  return `${o.name.split(' ')[0]}, you are ${ppWord(o.pp, o.ppMax)}. What do you do?`;
}

// The one closing question, always appended by the Engine (never written by the model).
export function question(g) {
  const s = g.s;
  if (s.ended) return null;
  if (s.pending) { const o = s.orgs[s.pending.target]; return `${o.name.split(' ')[0]}, something is coming at you and you are holding something back. Do you meet it, or take it?`; }
  if (s.chase) { const o = upOrgs(g).find((x) => !s.chase.out.includes(x.id) && !(s.chase.rolled || {})[x.id]); return o ? `${o.name.split(' ')[0]}, the gut is closing. How do you get out?` : 'What does the Cohort do?'; }
  const h = handover(g);
  return h || 'What does the Cohort do?';
}

export function crewLine(o) {
  return `${o.name}: ${miWord(null, o.mi, o.miMax)}, ${stressWord(o.stress)}${o.state === 'dormant' ? ', down' : o.state === 'lysed' ? ', lost' : ''}`;
}

export function clockWord(g, id) {
  const rec = g.D.vector.clocks.find((c) => c.id === id);
  const c = g.s.clocks[id];
  const stage = rec.stages && rec.stages.length ? rec.stages[Math.min(c.n, rec.stages.length - 1)] : null;
  return `${id} ${c.n} of ${c.max}${stage ? `, ${stage}` : ''}`;
}
