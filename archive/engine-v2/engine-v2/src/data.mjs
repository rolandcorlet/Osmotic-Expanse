// Loads and checks the four Engine-ready data files. The Engine reads only these (never the prose books).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const BOOKS = path.resolve(here, '..', '..', 'books');
const rd = (p) => JSON.parse(fs.readFileSync(path.join(BOOKS, p), 'utf8'));

export function loadData(vectorFile = 'vectors/first-carve.json') {
  const core = rd('core/core-rules.json');
  const players = rd('players/players.json');
  const bestiary = rd('bestiary/bestiary.json');
  const vector = rd(vectorFile);
  const blocks = Object.fromEntries(bestiary.creatures.map((c) => [c.id, c]));
  const hands = Object.fromEntries(players.hands.map((h) => [h.id, h]));
  const apparatus = Object.fromEntries(players.apparatus.map((a) => [a.id, a]));
  const grafts = Object.fromEntries(players.grafts.map((a) => [a.id, a]));
  const sites = Object.fromEntries(vector.sites.map((s) => [s.id, s]));
  const conditions = Object.fromEntries(core.conditions.map((c) => [c.id, c]));
  return { core, players, bestiary, vector, blocks, hands, apparatus, grafts, sites, conditions };
}

// ---- the small grammars the data uses (closed vocabularies, not sentences) ----
export function parseWhen(expr) {
  return String(expr).split(' and ').map((t) => {
    const s = t.trim();
    let m;
    if (s === 'always') return { t: 'always' };
    if (s === 'first-turn') return { t: 'first-turn' };
    if ((m = s.match(/^pp>=(\d+)$/))) return { t: 'pp', n: +m[1] };
    if ((m = s.match(/^cycle:(\d+)$/))) return { t: 'cycle', n: +m[1] };
    if ((m = s.match(/^foe-in:(\w+)$/))) return { t: 'foe-in', band: m[1] };
    if ((m = s.match(/^marked-foe-in:(\w+)$/))) return { t: 'marked-foe-in', band: m[1] };
    if ((m = s.match(/^uses-left:([\w-]+)$/))) return { t: 'uses-left', id: m[1] };
    if (['no-foe-in-reach', 'attached', 'corpse-in-contact', 'corpse-at-site', 'ally-hit-marked', 'hurt', 'was-attacked', 'did-hit', 'not-braced'].includes(s)) return { t: s };
    return { t: 'unknown', raw: s };
  });
}
export function parseDo(expr) {
  const s = String(expr);
  let m;
  if ((m = s.match(/^strike:([\w-]+)$/))) return { a: 'strike', target: m[1] };
  if ((m = s.match(/^special:([\w-]+):([\w-]+)$/))) return { a: 'special', id: m[1], target: m[2] };
  if ((m = s.match(/^drift:toward:([\w-]+)$/))) return { a: 'drift-toward', target: m[1] };
  if (s === 'drift:away' || s === 'drift:through') return { a: s.replace(':', '-') };
  if (['brace', 'reserve', 'announce', 'end'].includes(s)) return { a: s };
  return { a: 'unknown', raw: s };
}

// Effect tokens on interactables. Returns {kind, ...} or {kind:'unparsed', raw}.
export function parseEffect(tok) {
  const s = String(tok);
  let m;
  if ((m = s.match(/^(flag|event|discover|disarm|leaves|award|reveal|oath|offer|move|yield|stamp|advantage|blind|roll|strike-by|hostile|condition|rewind|gain-overflow):(.+)$/))) return { kind: m[1], arg: m[2] };
  if (s === 'nothing') return { kind: 'nothing' };
  if ((m = s.match(/^site-modifier:(.+)$/))) return { kind: 'site-modifier', arg: m[1] };
  if ((m = s.match(/^gain:(\d+) ([SCGPT])$/))) return { kind: 'gain', n: +m[1], unit: m[2] };
  if ((m = s.match(/^gain:(\d+) ([SCGPT]) of salt$/))) return { kind: 'unparsed', raw: s };
  return { kind: 'unparsed', raw: s };
}

export function validate(D) {
  const errors = [];
  const gaps = [];
  const sw = D.bestiary.scriptWords;
  const known = new Set(['always', 'first-turn', 'pp', 'cycle', 'foe-in', 'marked-foe-in', 'uses-left', 'no-foe-in-reach', 'attached', 'corpse-in-contact', 'corpse-at-site', 'ally-hit-marked', 'hurt', 'was-attacked', 'did-hit', 'not-braced']);
  for (const c of D.bestiary.creatures) {
    for (const r of c.script || []) {
      for (const w of parseWhen(r.when)) if (w.t === 'unknown' || !known.has(w.t)) errors.push(`${c.id}: script condition "${w.raw || w.t}" is not in the vocabulary`);
      if (parseDo(r.do).a === 'unknown') errors.push(`${c.id}: script action "${r.do}" is not in the vocabulary`);
    }
  }
  for (const s of D.vector.sites) {
    for (const cr of s.creatures) if (!D.blocks[cr.block]) errors.push(`${s.id}: creature block ${cr.block} is not in the Bestiary`);
    for (const e of s.exits) {
      const ends = new Set(D.vector.endings.map((x) => x.id));
      if (!D.sites[e.to] && !ends.has(e.to)) errors.push(`${s.id}: exit to ${e.to} is neither a site nor an ending`);
    }
    for (const i of s.interactables) {
      for (const k of ['onAttempt', 'onSuccess', 'onFailure']) for (const t of i[k] || []) {
        if (parseEffect(t).kind === 'unparsed') gaps.push({ where: `${s.id}/${i.id}.${k}`, text: t, why: 'effect is a sentence, not a token' });
      }
      if (i.needs && !/^(flag:|discovered:|found:|offer:|manual:|oath-box$|water$|salt$|unstamped$)|^\d+ [CS] per body$/.test(i.needs)) gaps.push({ where: `${s.id}/${i.id}.needs`, text: i.needs, why: 'cost or condition is a sentence, not a token' });
    }
    for (const h of s.hazards) {
      if (typeof h.amount !== 'number' || !h.type && h.amount) errors.push(`${s.id}: hazard ${h.id} has no numeric amount/type`);
    }
  }
  return { errors, gaps };
}
