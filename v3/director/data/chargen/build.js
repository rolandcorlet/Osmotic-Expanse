// Build your own organism (v3). The phone sends choices; this builds the organism the Engine seats,
// using the Players Assistant's own maths (model.generated.js), so the numbers match the printed books.
import { ATLAS, OSMOTIC, blank } from './model.generated.js';
import { APPARATUS } from '../apparatus.js';

// A custom organism takes one of the Vector's four seats, so the Director's per-seat notes still apply.
export const SEATS = [
  { id: 'wall', role: 'tough', plain: 'The one who stands in front', keys: ['VSC', 'AFF'] },
  { id: 'ledger', role: 'clever', plain: 'The one who makes, mends and reads the small print', keys: ['RTC', 'VSC'] },
  { id: 'rider', role: 'fast', plain: 'The one who moves through anything', keys: ['DFF', 'OSM'] },
  { id: 'eyes', role: 'sharp', plain: 'The one who notices', keys: ['OSM', 'DFF'] },
];
const KEYS = ['VSC', 'DFF', 'RTC', 'OSM', 'AFF'];
const byName = (list, n) => list.find((x) => x.n === n) || null;
const num = (v) => Math.max(0, Math.round(Number(v) || 0));

// Choices -> the model's sheet. Unknown fields are ignored; nothing the phone sends becomes a number directly.
export function sheetFrom(c = {}, level = 1) {
  const S = blank();
  S.lineage = byName(ATLAS.lineages, c.lineage) ? c.lineage : S.lineage;
  S.phenotype = byName(ATLAS.phenotypes, c.phenotype) ? c.phenotype : S.phenotype;
  S.array = Object.fromEntries(KEYS.map((k) => [k, num((c.array || {})[k])]));
  S.grown = Object.fromEntries(KEYS.map((k) => [k, num((c.grown || {})[k])]));
  S.extras = Object.fromEntries([].concat(c.extras || []).filter((n) => typeof n === 'string').map((n) => [n, 1]));
  S.rankBumps = Object.fromEntries(Object.entries(c.rankBumps || {}).map(([k, v]) => [k, num(v)]).filter(([, v]) => v));
  S.level = Math.max(1, Math.min(20, Math.trunc(Number(level) || 1)));
  const kit = c.kit || {};
  const one = (v) => (v ? { [v]: 1 } : {});
  S.kit = { apparatus: one(kit.apparatus), grafts: one(kit.graft), vials: Object.fromEntries(Object.entries(kit.vials || {}).map(([k, v]) => [k, num(v)]).filter(([, v]) => v)) };
  S.bursts = [].concat(c.bursts || []).filter((n) => typeof n === 'string');
  S.adaptations = [].concat(c.adaptations || []).filter((n) => typeof n === 'string');
  S.outsideLineage = !!c.outsideLineage;
  S.debt = !!c.debt;
  return S;
}

// The full model plus the problems that stop a build (the model's own warnings, plus v3's checks).
export function preview(c = {}, level = 1) {
  const S = sheetFrom(c, level);
  const m = OSMOTIC.model(ATLAS, S);
  const problems = m.warnings.slice();
  if (!byName(ATLAS.lineages, c.lineage)) problems.unshift('Choose a Lineage.');
  if (!byName(ATLAS.phenotypes, c.phenotype)) problems.unshift('Choose a Phenotype.');
  else if (!c.outsideLineage && m.phenotype.t !== m.lineage.n) problems.push(`${m.phenotype.n} is a ${m.phenotype.t} Phenotype; a ${m.lineage.n} takes one of its own (ATLAS §1 Step 3).`);
  // Adaptations cost Substrate as well as a Synthesis Choice (ATLAS §4.2); the model counts only the Choice.
  let adaptS = 0;
  for (const n of S.adaptations) {
    const a = byName(ATLAS.adaptations, n);
    if (!a) { problems.push(`${n} is not an Adaptation.`); continue; }
    if (/\+\s*\d/.test(a.s)) problems.push(`${n} also needs a Specimen (${a.s}), which is earned in play, not at creation.`);
    adaptS += parseInt(a.s, 10) || 0;
  }
  if (S.adaptations.length && S.level === 1) problems.push('Level 1 organisms start with no Adaptations (ATLAS §4.1).');
  if (S.bursts.length && S.level === 1) problems.push('Level 1 organisms start with no catalogue Bursts (ATLAS §4.1).');
  for (const n of S.bursts) if (!byName(ATLAS.bursts, n)) problems.push(`${n} is not a Burst.`);
  for (const p of m.pw) if (p.rank > 4) problems.push(`${p.n} rank ${p.rank}: Sovereign (4) is the highest rank.`);
  if (m.choicesSpent < m.growthChoices) problems.push(`Spend ${m.growthChoices - m.choicesSpent} more Synthesis Choice${m.growthChoices - m.choicesSpent === 1 ? '' : 's'} (one per Level above 1, ATLAS §1 Step 8).`);
  m.adaptS = adaptS;
  if (m.spent + adaptS > m.budget) problems.push(`${adaptS ? 'The kit and Adaptations cost' : 'The kit costs'} ${m.spent + adaptS} S and you have ${m.budget} S (ATLAS §1 Step 5).`);
  for (const n of Object.keys(S.extras)) if (!byName(ATLAS.pathways, n)) problems.push(`${n} is not a Pathway you can choose.`);
  return { m, problems };
}

function weaponFor(name) {
  const known = Object.values(APPARATUS).find((w) => w.name === name);
  if (known) return { ...known };
  const a = byName(ATLAS.apparatus, name);
  if (!a) return null;
  const bonus = /^[+−-]?\d/.test(a.x) ? Number(String(a.x).replace('−', '-')) : 0;
  const props = String(a.pr || '').split(/,\s*/).map((p) => p.split(/[ (;]/)[0]).filter(Boolean);
  return { id: name.toLowerCase().replace(/[^a-z]+/g, '-'), name, cls: a.c, band: String(a.b || 'Contact').split(/[ (]/)[0], bd: String(a.bd).split('/').map(Number), bonus, type: a.ty, props, cost: a.s };
}

// Build the organism for a seat. Throws an Error whose .problems lists everything to fix.
export function buildHand(c = {}, { level = 1, seat = 'wall' } = {}) {
  const { m, problems } = preview(c, level);
  if (!SEATS.some((s) => s.id === seat)) problems.push('Choose a seat.');
  if (problems.length) { const e = new Error(problems[0]); e.problems = problems; throw e; }
  const weapons = m.bought.filter((b) => byName(ATLAS.apparatus, b.n)).map((b) => weaponFor(b.n)).filter(Boolean);
  const kit = m.bought.filter((b) => !byName(ATLAS.apparatus, b.n)).map((b) => {
    const g = byName(ATLAS.grafts, b.n), v = byName(ATLAS.vials, b.n);
    if (g) return `${g.n} (soak ${g.so ?? 0}${g.mi ? `, +${g.mi} MI, already counted` : ''})`;
    return v ? `${v.n}${b.q > 1 ? ` x${b.q}` : ''} (${v.e})` : b.n;
  });
  for (const n of m.bursts || []) { const b = byName(ATLAS.bursts, n); if (b) kit.push(`Burst: ${b.n} (${b.d[0]}${b.d.slice(1).toLowerCase()}, Tier ${b.t}, cost ${b.c}, ${b.b})`); }
  for (const n of m.adaptations || []) { const a = byName(ATLAS.adaptations, n); if (a) kit.push(`Adaptation: ${a.n} (${a.e})`); }
  const lin = m.lineage, ph = m.phenotype;
  return {
    id: seat, hand: 'Your own', custom: true, choices: JSON.parse(JSON.stringify(c)),
    phenotype: `${lin.n} ${ph.n}`, level: m.stage.level,
    base: { ...m.eff }, hull: ph.h,
    mi: m.mi, atp: m.atpMax, pp: m.pp, mt: m.mt, flow: m.flow, countdown: m.countdown, soak: m.soak,
    oath: m.oathBoxes, substrate: m.budget - m.spent - (m.adaptS || 0), codon: m.codon,
    pathways: Object.fromEntries(m.pw.filter((p) => p.rank > 0).map((p) => [p.n, p.rank])),
    weapons, kit,
    name: String(c.name || '').trim().slice(0, 40) || undefined,
    tie: String(c.tie || '').slice(0, 200), firstMove: String(c.firstMove || '').slice(0, 120),
    notes: `${lin.n} (${lin.e}): Gift ${lin.gift}; Frailty ${lin.fr}. ${ph.n}: ${ph.r}; signature ${ph.s}.`,
  };
}
