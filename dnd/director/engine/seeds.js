// The DM's story seeds in play (the Seeds tab). A seed is plain text in a fixed layout (brain/seedwriter.js);
// these lines say when the Engine brings it in by itself:
//
//   When: lost (after 6 turns)            the party has gone that many Director turns without getting anywhere
//   When: camp in the wild                 a long rest somewhere that is not safe (an inn, a town)
//   When: the party picks a fight with Bailiff Thorne
//                                          the party attacks or harasses someone who is not a foe (the Director
//                                          says so with use_seed; an attack where nobody here is a foe sets it off too)
//   When: any (or no When line)            only when the Director judges it fits (use_seed)
//   Chance: 25%                            the Engine rolls d100 when the moment comes (default 100%)
//   Limit: once | daily | always           how often it may happen (default: once; a camp seed: daily)
//   Encounter: wolf x2, dire-wolf x1       who arrives (SRD ids and counts); "any" lets the Engine choose by
//                                          the party's level and the place; "none" for a meeting with no fight
//
// Browser-safe, no state: this reads seeds and chooses foes; engine/ledger.js runs them.

import * as R from './rules.js';
import * as SCALE from './scale.js';

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
  const monsters = choose || !enc || /^none\b/i.test(enc) ? [] : enc.split(/,|;|\band\b/).map((x) => x.trim()).filter(Boolean).map((x) => {
    const m = /^(?:(\d+)\s+)?([a-z][a-z0-9' -]*?)(?:\s*[x×]\s*(\d+))?(?:\s*\(([^)]*)\))?$/i.exec(x) || [];
    return { id: String(m[2] || x).toLowerCase().trim().replace(/\s+/g, '-'), count: Number(m[3] || m[1] || 1), name: (m[4] || '').trim() };
  });
  return { title, where: lineOf(t, 'Where').toLowerCase().split(/[\s(]/)[0] || 'any', when, kind, turns, who, chance, limit, monsters, choose };
}

// In words, for the Seeds tab and the Director's briefing.
export function whenWords(p) {
  const odds = p.chance < 100 ? `, ${p.chance}% chance` : '';
  const how = p.limit === 'always' ? '' : p.limit === 'daily' ? ', at most once a day' : ', once';
  if (p.kind === 'lost') return `when the party is getting nowhere (${p.turns} turns)${odds}${how}`;
  if (p.kind === 'camp') return `when the party camps somewhere unsafe${odds}${how}`;
  if (p.kind === 'provoke') return `when the party picks a fight with ${p.who || 'someone who is not a foe'}${odds}${how}`;
  return `when you judge it fits${how}`;
}

// May this seed happen now? (switched on, at this place, not used up)
export function seedFree(seed, s, siteId) {
  if (!seed || !seed.on) return false;
  const p = seedPlan(seed.text);
  if (p.where && p.where !== 'any' && p.where !== siteId) return false;
  const fired = (s.seedLog || []).filter((x) => x.id === seed.id && x.fired);
  if (p.limit === 'once' && fired.length) return false;
  if (p.limit === 'daily' && fired.some((x) => x.day === ((s.time || {}).day || 1))) return false;
  return true;
}

// A place where a night's rest is safe: the adventure says so (safe: true), or it is a town, an inn or the
// like with nothing hostile written there.
export function safePlace(site) {
  if (!site) return false;
  if (site.safe === true) return true;
  if (site.safe === false) return false;
  if ((site.foes || []).length) return false;
  const words = `${site.name || ''} ${site.region || ''} ${String(site.notes || '').slice(0, 160)}`;
  return /\b(inn|tavern|town|village|city|capital|hamlet|hub|temple|monastery|guildhall|rooms?)\b/i.test(words);
}

// Who may turn up when a seed leaves it to the Engine: by the lie of the land, then the party's level.
const BY_LAND = [
  [/forest|wood|grove|glade|thicket/i, ['wolf', 'boar', 'giant-spider', 'brown-bear', 'dire-wolf', 'owlbear', 'bandit', 'goblin']],
  [/marsh|bog|fen|swamp|river|lake|ford|mire/i, ['giant-frog', 'giant-rat', 'crocodile', 'lizardfolk', 'bandit', 'giant-toad', 'ghoul', 'will-o-wisp']],
  [/mountain|crag|peak|hill|pass|cliff|gorge/i, ['wolf', 'orc', 'goblin', 'hobgoblin', 'ogre', 'griffon', 'giant-goat', 'worg']],
  [/crypt|barrow|tomb|ruin|cave|vault|mine|dungeon|under/i, ['giant-rat', 'skeleton', 'zombie', 'giant-bat', 'ghoul', 'shadow', 'giant-spider', 'wight']],
];
const ROADSIDE = ['bandit', 'goblin', 'wolf', 'hobgoblin', 'gnoll', 'orc', 'thug', 'bandit-captain', 'worg', 'ogre'];
export function wildFoes(site, levels, srd, rng = Math.random) {
  const ix = R.index(srd);
  const words = `${(site && site.name) || ''} ${(site && site.region) || ''}`;
  const list = (BY_LAND.find(([re]) => re.test(words)) || [null, ROADSIDE])[1];
  const lv = levels.length ? levels.reduce((a, b) => a + b, 0) / levels.length : 1;
  const top = Math.max(0.25, lv / 2);
  const fit = list.map((id) => ix.monster[id]).filter((m) => m && Number(m.cr) <= top);
  const pool = fit.length ? fit : list.map((id) => ix.monster[id]).filter(Boolean).sort((a, b) => a.cr - b.cr).slice(0, 1);
  if (!pool.length) return [];
  const m = pool[Math.floor(rng() * pool.length) % pool.length];
  return [{ id: m.id, count: Math.max(1, Math.round(levels.length * (Number(m.cr) <= 0.25 ? 1.5 : 1))), name: '' }];
}

// How many of each, so the meeting is a minor one: easy at the most (a camp, a wanderer), medium for the
// guards who come out when the party starts trouble. Fewer foes first, then hit points (never under half).
export function sizeFoes(groups, levels, srd, rating = 'easy') {
  if (!groups.length || !levels.length) return { groups, hp: 1 };
  const ix = R.index(srd);
  const xpOf = (g) => SCALE.fightXp(ix.monster[g.id]) || 0;
  const cap = R.encounterDifficulty(levels, [1], srd).thresholds[rating === 'medium' ? 1 : 0];
  const out = groups.map((g) => ({ ...g, count: Math.max(1, Math.min(12, g.count)) }));
  const adj = () => R.encounterDifficulty(levels, out.flatMap((g) => Array(g.count).fill(xpOf(g))), srd).adjusted;
  while (adj() > cap) {
    const most = out.slice().sort((a, b) => b.count - a.count)[0];
    if (most.count > 1) { most.count -= 1; continue; }
    if (out.length > 1) { out.splice(out.indexOf(out.slice().sort((a, b) => xpOf(a) - xpOf(b))[0]), 1); continue; }
    break;
  }
  const now = adj();
  const hp = now > cap ? Math.max(0.5, Math.round((cap / now) * 20) / 20) : 1;
  return { groups: out, hp };
}
