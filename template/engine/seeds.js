// The host's story seeds in play (the Seeds tab), for every Skeleton game. A seed is plain text; these lines say
// when the Engine brings it in by itself:
//
//   When: lost (after 6 turns)            the party has gone that many Director turns without getting anywhere
//   When: camp in the wild                 a long rest somewhere that is not safe (the place says safe: true, or is
//                                          an inn, a town, a home)
//   When: the party picks a fight with Auntie Pell
//                                          trouble picked with someone who is not a creature here (the Director
//                                          says so with use_seed)
//   When: any (or no When line)            only when the Director judges it fits (use_seed)
//   Chance: 25%                            the Engine rolls d100 when the moment comes (default 100%)
//   Limit: once | daily | always           how often it may happen (default: once; a camp seed: daily)
//   Encounter: glass-eel x2                who arrives (bestiary ids and counts); "any" lets the Engine choose
//                                          from the bestiary by the party's level; "none" for a meeting
//
// Browser-safe, no state: this reads seeds and chooses creatures; engine/ledger.js runs them. The D&D
// Director has the same (dnd/director/engine/seeds.js).

import { sizeGroups, weightOf, partyPower } from './scale.js';

const lineOf = (t, k) => ((new RegExp(`^${k}:\\s*(.*)$`, 'mi').exec(t) || [])[1] || '').trim();

export function seedPlan(text) {
  const t = String(text || '');
  const title = ((/^#\s*(?:Seed:\s*)?(.+)$/m.exec(t) || [])[1] || t.split('\n')[0] || '').trim().slice(0, 60);
  const when = lineOf(t, 'When');
  const w = when.toLowerCase();
  let kind = 'any';
  if (/\b(lost|stuck|off[- ]track|astray|wander|aimless|going nowhere)\b/.test(w)) kind = 'lost';
  else if (/\b(camp|rest|sleep|night)\b/.test(w)) kind = 'camp';
  else if (/\b(fight|attack|harass|threat|bully|provok|pick|rob|steal from|insult)\w*/.test(w)) kind = 'provoke';
  const turns = Number((/(\d+)\s*turns?/.exec(w) || [])[1]) || 6;
  const who = kind === 'provoke' ? ((/\b(?:with|on|against|harass(?:es|ing)?|threaten(?:s|ing)?|attack(?:s|ing)?|rob(?:s|bing)?)\s+(?:the\s+)?(.+)$/i.exec(when) || [])[1] || '').replace(/[.;].*$/, '').trim() : '';
  const pct = /(\d{1,3})\s*%/.exec(lineOf(t, 'Chance') || when);
  const chance = pct ? Math.max(1, Math.min(100, Number(pct[1]))) : 100;
  const lim = (lineOf(t, 'Limit') || lineOf(t, 'Repeat')).toLowerCase();
  const limit = /always|every|each time|any time/.test(lim) ? 'always' : /day|daily|night/.test(lim) ? 'daily' : /once/.test(lim) ? 'once' : kind === 'camp' ? 'daily' : 'once';
  const enc = lineOf(t, 'Encounter');
  const choose = /^(any|random|choose|pick)\b/i.test(enc) || (!enc && kind === 'camp');
  const creatures = choose || !enc || /^none\b/i.test(enc) ? [] : enc.split(/,|;|\band\b/).map((x) => x.trim()).filter(Boolean).map((x) => {
    const m = /^(?:(\d+)\s+)?([a-z][a-z0-9' -]*?)(?:\s*[x×]\s*(\d+))?(?:\s*\(([^)]*)\))?$/i.exec(x) || [];
    return { id: String(m[2] || x).toLowerCase().trim().replace(/\s+/g, '-'), count: Number(m[3] || m[1] || 1) };
  });
  return { title, where: lineOf(t, 'Where').toLowerCase().split(/[\s(]/)[0] || 'any', when, kind, turns, who, chance, limit, creatures, choose };
}

export function whenWords(p) {
  const odds = p.chance < 100 ? `, ${p.chance}% chance` : '';
  const how = p.limit === 'always' ? '' : p.limit === 'daily' ? ', at most once a day' : ', once';
  if (p.kind === 'lost') return `when the party is getting nowhere (${p.turns} turns)${odds}${how}`;
  if (p.kind === 'camp') return `when the party camps somewhere unsafe${odds}${how}`;
  if (p.kind === 'provoke') return `when the party picks a fight with ${p.who || 'someone who is not a foe'}${odds}${how}`;
  return `when you judge it fits${how}`;
}

// The Skeleton has no calendar: "daily" means once between long rests (s.restCount).
export function seedFree(seed, s, siteId) {
  if (!seed || !seed.on) return false;
  const p = seedPlan(seed.text);
  if (p.where && p.where !== 'any' && p.where !== siteId) return false;
  const fired = (s.seedLog || []).filter((x) => x.id === seed.id && x.fired);
  if (p.limit === 'once' && fired.length) return false;
  if (p.limit === 'daily' && fired.some((x) => x.rest === (s.restCount || 0))) return false;
  return true;
}

export function safePlace(site) {
  if (!site) return false;
  if (site.safe === true) return true;
  if (site.safe === false) return false;
  if ((site.creatures || []).length || (site.hazards || []).length) return false;
  const words = `${site.name || ''} ${String(site.read || '').slice(0, 200)}`;
  return /\b(inn|tavern|town|village|city|hamlet|home|house|temple|monastery|guildhall|camp(?:site)?|harbou?r|dock|station|base|outpost)\b/i.test(words);
}

// "any": a creature from the bestiary a party of this level can meet without harm (lowest tiers first),
// preferring those the adventure already uses.
export function anyCreatures(mod, adv, levels, rng = Math.random) {
  const all = (mod.bestiary.creatures || []).filter((c) => c && c.id);
  if (!all.length) return [];
  const lv = levels.length ? levels.reduce((a, b) => a + b, 0) / levels.length : 1;
  const top = Math.max(1, Math.min(5, 1 + Math.floor((lv - 1) / 3)));
  const used = new Set(((adv && adv.sites) || []).flatMap((x) => (x.creatures || []).map((c) => c.id)));
  let pool = all.filter((c) => (c.tier || 1) <= top);
  if (!pool.length) pool = all.slice().sort((a, b) => (a.tier || 1) - (b.tier || 1)).slice(0, 1);
  const known = pool.filter((c) => used.has(c.id));
  const from = known.length ? known : pool;
  const c = from[Math.floor(rng() * from.length) % from.length];
  const n = Math.max(1, Math.floor(partyPower(levels) / weightOf(c)));
  return [{ id: c.id, count: Math.min(4, n) }];
}

export { sizeGroups };
