// "Suggest links" on the Run tab's Pictures strip: the AI matches each picture nobody has linked yet to a
// monster or a place of the adventure, once, from the line that describes it. Nothing is kept until the DM
// says Use: a guess never shows a picture by itself (engine/pictures.js).
//
//   suggestArt({ ask, adv, srd }) -> [{ url, show: 'site:<id>' | 'monster:<id>', label }]
import { parseJson } from './convert.js';
import { isArt } from '../engine/pictures.js';

const SYSTEM = `You match pictures from a tabletop roleplaying book to the monster or the place each one shows. Answer only with JSON, no other words:
{"links":[{"n":1,"to":"M3"},{"n":2,"to":"P5"},{"n":3,"to":"none"}]}
"to" is one code from the lists: M for a monster, P for a place, or "none" when the picture shows neither clearly (an item, a person who is neither, a scene of somewhere not listed). Pick only what the picture's words clearly fit; "none" is better than a guess.`;

export function artCandidates(adv, srd) {
  const ix = new Map(((srd && srd.monsters) || []).map((m) => [m.id, m]));
  const mons = new Map();
  for (const m of adv.monsters || []) mons.set(m.id, m);
  for (const s of adv.sites || []) for (const f of s.foes || []) if (!mons.has(f.monster)) mons.set(f.monster, ix.get(f.monster) || { id: f.monster, name: f.name || f.monster });
  return {
    monsters: [...mons.values()].map((m) => ({ id: m.id, name: m.name, what: [m.size, m.type].filter(Boolean).join(' ').toLowerCase() })),
    places: (adv.sites || []).map((s) => ({ id: s.id, name: s.name, what: String(s.read || s.notes || '').replace(/\s+/g, ' ').slice(0, 110) })),
  };
}

export async function suggestArt({ ask, adv, srd }) {
  const pics = ((adv && adv.pictures) || []).filter((p) => isArt(p) && !p.link && p.show !== 'never' && p.about);
  if (!pics.length) return [];
  const C = artCandidates(adv, srd);
  const user = `PICTURES\n${pics.map((p, i) => `${i + 1}. ${p.about}`).join('\n')}\n\nMONSTERS\n${C.monsters.map((m, i) => `M${i + 1}. ${m.name}${m.what ? ` (${m.what})` : ''}`).join('\n')}\n\nPLACES\n${C.places.map((s, i) => `P${i + 1}. ${s.name}${s.what ? `: ${s.what}` : ''}`).join('\n')}`;
  const r = parseJson(await ask(SYSTEM, user));
  const out = [];
  for (const l of (r && r.links) || []) {
    const p = pics[Number(l.n) - 1];
    const m = /^([MP])(\d+)$/i.exec(String(l.to || '').trim());
    if (!p || !m || out.some((x) => x.url === p.url)) continue;
    const c = (m[1].toUpperCase() === 'M' ? C.monsters : C.places)[Number(m[2]) - 1];
    if (!c) continue;
    out.push({ url: p.url, show: `${m[1].toUpperCase() === 'M' ? 'monster' : 'site'}:${c.id}`, label: c.name });
  }
  return out;
}
