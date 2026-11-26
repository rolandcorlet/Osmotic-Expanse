// The adventure checker: everything about an adventure file that can be checked without playing it.
// Run it before a bench or a game (tools/check-adventure.mjs, the bench's first line, the DM's Adventure
// tab), so a wrong id, a missing monster, an unreachable place or a fight that will kill a small party
// shows up in seconds instead of hours into a bench. Browser-safe: no files, no network.
//
//   checkAdventure(adventure, srd) -> { id, name, errors: [...], warnings: [...], notes: [...], fights: [...] }
//
// Errors break play (the Engine or the Director will trip on them). Warnings are likely mistakes.
// Notes are worth knowing: fight difficulty, and rules that live only in prose.

import * as R from './rules.js';
import * as MAP from './map.js';
import { completeBuild } from './pregen.js';
import * as TRIG from './triggers.js';
import * as SCALE from './scale.js';
import * as BOOK from './book.js';

const lower = (s) => String(s == null ? '' : s).toLowerCase();
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DICE = /^\s*\d*d\d+(?:\s*[+-]\s*\d+)?\s*$|^\s*\d+\s*$/i;

// The adventure's level range ("1 to 3", "1-10", "any"), as numbers.
export function levelRange(text) {
  const nums = String(text || '').match(/\d+/g);
  if (!nums) return [1, 5];
  const a = Number(nums[0]); const b = Number(nums[nums.length - 1]);
  return [Math.max(1, Math.min(a, b)), Math.min(20, Math.max(a, b))];
}

// Phrases in a place's notes that describe a rule the Engine cannot see: the Director has to remember
// them, unless the place's `rules` cover it (engine/triggers.js). The last part says which rules do.
const PROSE_RULES = [
  [/\bflee(?:s|ing)?\b|\bruns? away\b|\bretreats?\b/i, 'when someone flees', (r) => r.do === 'flee'],
  [/\bsurprise\b/i, 'surprise', (r) => !!r.surprise],
  [/\bwhen (?:the party|anyone|someone|a character|they) (?:enter|arrive|reach|approach|open|touch|step)/i, 'what happens on arrival', (r) => r.when.ev === 'enter'],
  [/\bon a (?:failed|failure)\b|\bor (?:fall|be knocked|take)\b/i, 'what a failed roll does', (r) => r.when.ev === 'fail'],
  [/\bmilestone\b|\baward \d+ ?xp\b/i, 'a milestone', (r) => !!(r.xp || r.level)],
  [/\bround \d\b|\bend of (?:its|their|the) (?:turn|round)\b/i, 'timing in a fight', (r) => r.when.ev === 'round'],
  [/\bbelow half\b|\bhalf (?:its|his|her|their) hit points\b|\bif (?:two|three|both|all) .* fall\b/i, 'morale', (r) => r.when.ev === 'hurt' || r.when.ev === 'down'],
  [/\bdifficult terrain\b|\blightly obscured\b|\bheavily obscured\b/i, 'terrain or light', () => false],
];

export function checkAdventure(adv, srd) {
  const errors = []; const warnings = []; const notes = []; const fights = [];
  const E = (where, text) => errors.push({ where, text });
  const W = (where, text) => warnings.push({ where, text });
  const N = (where, text) => notes.push({ where, text });
  if (!adv || typeof adv !== 'object') { E('adventure', 'There is no adventure to check.'); return { id: '', name: '', errors, warnings, notes, fights }; }
  const id = adv.id || '';
  if (!id || !SLUG.test(id)) E('adventure', `Its id "${id}" must be lower-case words joined by dashes.`);
  if (!adv.name) E('adventure', 'It has no name.');
  if (!adv.intro) W('adventure', 'It has no intro: the Director opens the game with it.');
  if (!adv.levels) W('adventure', 'It does not say which levels it is for ("1 to 3").');
  const sites = Array.isArray(adv.sites) ? adv.sites : [];
  if (!sites.length) { E('adventure', 'It has no places (sites).'); return { id, name: adv.name || '', errors, warnings, notes, fights }; }
  const [minL, maxL] = levelRange(adv.levels);

  // The monsters it can use: the SRD (with the book library, when merged) and its own.
  const ix = R.index(srd);
  const own = new Map((adv.monsters || []).map((m) => [m.id, m]));
  const monster = (ref) => {
    const k = lower(ref).trim();
    return own.get(k) || ix.monster[k] || ix.monster[k.replace(/\s+/g, '-')] || (srd.monsters || []).find((x) => lower(x.name) === k) || null;
  };
  const skills = new Set((srd.skills || []).map((x) => x.id));

  // ---- places, exits, and whether every place can be reached ------------------------------------
  const ids = new Set();
  for (const s of sites) {
    const at = s.id || s.name || '?';
    if (!s.id) { E(at, 'A place has no id.'); continue; }
    if (!SLUG.test(s.id)) E(at, `Its id "${s.id}" must be lower-case words joined by dashes.`);
    if (ids.has(s.id)) E(at, `Two places share the id "${s.id}".`);
    ids.add(s.id);
    if (!s.name) E(at, 'It has no name.');
    if (!s.read) W(at, 'It has no read-aloud text: the Director describes it from the notes alone.');
    if (s.travelHours != null && !(Number(s.travelHours) >= 0)) E(at, `travelHours "${s.travelHours}" is not a number of hours.`);
    if (s.map && !(Number(s.map.x) >= 0 && Number(s.map.x) <= 1 && Number(s.map.y) >= 0 && Number(s.map.y) <= 1)) E(at, 'Its map position needs x and y between 0 and 1.');
  }
  for (const s of sites) {
    for (const e of s.exits || []) {
      if (!e || !e.to) { E(s.id, 'An exit has no "to".'); continue; }
      if (!ids.has(e.to)) E(s.id, `An exit leads to "${e.to}", which is not a place. Places: ${[...ids].join(', ')}.`);
      if (e.to === s.id) W(s.id, 'An exit leads back to the same place.');
      if (!e.label) W(s.id, `The exit to ${e.to} has no label: the Director names exits by their labels.`);
    }
  }
  const seen = new Set([sites[0].id]);
  const q = [sites[0].id];
  while (q.length) { const cur = q.shift(); const s = sites.find((x) => x.id === cur); for (const e of (s && s.exits) || []) if (ids.has(e.to) && !seen.has(e.to)) { seen.add(e.to); q.push(e.to); } }
  for (const s of sites) if (s.id && !seen.has(s.id)) W(s.id, `It cannot be reached from ${sites[0].name || sites[0].id} by any exit.`);
  if (sites.length > 1) for (const s of sites) if (!(s.exits || []).length) N(s.id, 'No exits lead on from here (fine for an ending).');
  // How deep each place sits, for a rough level the party will have reached there.
  const depth = { [sites[0].id]: 0 };
  const dq = [sites[0].id];
  while (dq.length) { const cur = dq.shift(); const s = sites.find((x) => x.id === cur); for (const e of (s && s.exits) || []) if (ids.has(e.to) && !(e.to in depth)) { depth[e.to] = depth[cur] + 1; dq.push(e.to); } }
  const deepest = Math.max(1, ...Object.values(depth));

  // ---- the adventure's own monsters --------------------------------------------------------------
  const ownIds = new Set();
  for (const m of adv.monsters || []) {
    const at = `monster ${m.id || m.name || '?'}`;
    if (!m.id) { E(at, 'One of its own monsters has no id.'); continue; }
    if (ownIds.has(m.id)) E(at, `Two of its monsters share the id "${m.id}".`);
    ownIds.add(m.id);
    if (!m.name) E(at, 'It has no name.');
    if (!(Number(m.hp) > 0)) E(at, 'It needs hit points (hp).');
    if (!(Number(m.ac) > 0)) E(at, 'It needs an Armor Class (ac).');
    if (!Array.isArray(m.ab) || m.ab.length !== 6) E(at, 'It needs six ability scores (ab).');
    if (m.xp == null) W(at, 'It has no XP value: fights with it pay nothing.');
    // What the book compiler cannot turn into numbers: the Engine would have to leave it to the Director.
    const gaps = [];
    BOOK.compileMonster(JSON.parse(JSON.stringify(m)), gaps);
    for (const g of gaps) W(at, `The Engine cannot read ${g.name.replace(/^[^:]*: /, '')}: ${g.what}. Give it as fields (docs/AUTHORING.md, "Monsters").`);
    for (const a of m.actions || []) {
      if (!a.n) E(at, 'An action has no name (n).');
      if (!a.d) W(at, `${a.n || 'An action'} has no description (d).`);
      if (a.hit != null) {
        if (!Number.isFinite(Number(a.hit))) E(at, `${a.n}'s attack bonus (hit) is not a number.`);
        // A hit whose harm is all in the save that follows ("Hit: The target must make a DC 13 Constitution
        // saving throw, taking 18 (4d8) poison damage") has its damage in the rider.
        const viaSave = (a.rider && (a.rider.dmg || []).length) || /\bHit:[^.]*saving throw[^.]*taking \d+ \(\d+d\d+/i.test(a.d || '');
        if ((!Array.isArray(a.dmg) || !a.dmg.length) && !viaSave) E(at, `${a.n} is an attack with no damage (dmg: [["1d6+2", "slashing"]]).`);
        for (const d of a.dmg || []) if (!Array.isArray(d) || !DICE.test(String(d[0])) || !d[1]) E(at, `${a.n}'s damage ${JSON.stringify(d)} should be like ["1d6+2", "slashing"].`);
        if (!/Melee|Ranged/.test(a.d || '')) W(at, `${a.n}'s description should start "Melee Weapon Attack" or "Ranged Weapon Attack": the map uses it to know whether it must step up to its target.`);
      }
    }
  }

  // ---- people, checks, monsters, clocks and zones at each place -----------------------------------
  const pregenNames = new Set((adv.pregens || []).map((p) => lower(p.name || (p.input || {}).name)).filter(Boolean));
  const globalClocks = new Map();
  for (const s of sites) {
    if (!s.id) continue;
    const at = s.id;
    for (const n of s.npcs || []) {
      if (!n.name) { E(at, 'A person has no name.'); continue; }
      for (const k of ['who', 'voice', 'wants']) if (!n[k]) W(at, `${n.name} has no "${k}": the Director's briefing shows "${k}: undefined".`);
      if (pregenNames.has(lower(n.name))) W(at, `${n.name} has the same name as a ready-made hero: the Director will confuse them.`);
    }
    for (const c of s.checks || []) {
      if (!c.skill || !skills.has(lower(c.skill))) E(at, `A check uses the skill "${c.skill}", which is not a skill. Skills: ${[...skills].join(', ')}.`);
      if (!(Number(c.dc) >= 1 && Number(c.dc) <= 30)) E(at, `A ${c.skill} check has DC "${c.dc}": give a number from 1 to 30.`);
      if (!c.find) W(at, `The ${c.skill} check does not say what it finds.`);
    }
    // Zones (the map): written ones are checked as written, before the Engine tidies them.
    let zones = null;
    if (Array.isArray(s.zones) && s.zones.length) {
      zones = MAP.normZones(s.zones);
      const zIds = new Set(zones.map((z) => z.id));
      const byName = new Map(zones.map((z) => [MAP.slug(z.name), z.id]));
      s.zones.forEach((z, k) => {
        if (!z.name && !z.id) E(at, `Zone ${k + 1} has no name.`);
        for (const l of z.links || []) if (!zIds.has(MAP.slug(l)) && !byName.has(MAP.slug(l))) W(at, `Zone "${z.name || z.id}" links to "${l}", which is not a zone here.`);
        for (const f of [].concat(z.from || [])) if (!ids.has(f)) E(at, `Zone "${z.name || z.id}" says the party comes in from "${f}", which is not a place.`);
        for (const t of z.tags || []) if (!MAP.TAGS[t]) W(at, `Zone "${z.name || z.id}" has the tag "${t}". Tags: ${Object.keys(MAP.TAGS).join(', ')}.`);
        if (['x', 'y', 'w', 'h'].some((key) => z[key] != null) && !['x', 'y', 'w', 'h'].every((key) => Number.isFinite(Number(z[key])))) W(at, `Zone "${z.name}" gives only part of its box (x, y, w, h): it is laid out automatically.`);
      });
      const ins = new Set(zones.flatMap((z) => z.from || []));
      for (const e of sites.filter((o) => (o.exits || []).some((x) => x.to === s.id))) if (!ins.has(e.id) && zones.length > 1) N(at, `Arriving from ${e.id}, the party starts in "${MAP.entryZone(zones).name}" (no zone names it in "from").`);
      for (const z of zones) if (zones.length > 1 && !(z.links || []).length) W(at, `Zone "${z.name}" has no way in or out.`);
    }
    // Monsters placed here.
    const names = new Map();
    const xps = [];
    for (const f of s.foes || []) {
      const m = monster(f.monster);
      if (!m) { E(at, `The monster "${f.monster}" is not in the SRD${adv.monsters ? ' or the adventure\'s own monsters' : ''}.`); continue; }
      const n = Math.trunc(Number(f.count == null ? 1 : f.count));
      if (!(n >= 1 && n <= 12)) E(at, `${f.name || m.name}: count ${f.count} should be 1 to 12.`);
      const label = lower(f.name || m.name);
      if (names.has(label)) W(at, `Two groups here are both called "${f.name || m.name}": their numbers will run together.`);
      names.set(label, true);
      if (pregenNames.has(label)) E(at, `A monster is called "${f.name}", like a ready-made hero.`);
      if (f.zone) {
        if (!zones) W(at, `${f.name || m.name} has zone "${f.zone}", but the place has no zones of its own (it gets near side, middle and far side).`);
        else if (!MAP.findZone(zones, f.zone)) E(at, `${f.name || m.name} starts in zone "${f.zone}", which is not a zone here. Zones: ${zones.map((z) => z.name).join(', ')}.`);
      }
      for (let k = 0; k < Math.max(1, Math.min(12, n || 1)); k++) xps.push(Number(m.xp) || 0);
    }
    // How hard the fight is for the party it is written for, at the level it has reached by here (a
    // place's own `level`, or by how deep it lies). In play it is fitted to the real party (engine/scale.js).
    if (s.level != null && !(Number(s.level) >= 1 && Number(s.level) <= 20)) E(at, `level ${s.level} should be 1 to 20.`);
    if (xps.length) {
      const designed = SCALE.designedParty(adv, s.id);
      const lv = designed.level;
      const sz = designed.size[0];
      const written = R.encounterDifficulty(Array(sz).fill(lv), xps, srd);
      const two = R.encounterDifficulty([lv, lv], xps, srd);
      fights.push({ site: s.id, level: lv, monsters: xps.length, xp: written.base, four: written.rating, two: two.rating, size: sz });
      N(at, `Fight: ${xps.length} monster${xps.length > 1 ? 's' : ''}, ${written.base} XP. For ${SCALE.partyWords(designed)}: ${written.rating.toLowerCase()} (fitted to the party in play).`);
      // How far past the deadly line: a place can say a deadly fight is meant (deadly: true), and then it is a note.
      const over = written.thresholds[3] ? written.adjusted / written.thresholds[3] : 0;
      if (written.rating === 'Deadly') {
        const words = `deadly for ${SCALE.partyWords(designed)}, the party it is written for (${over.toFixed(1)} times the deadly line)`;
        if (s.deadly) N(at, `The fight here is ${words}, as the place says it is meant to be.`);
        else W(at, `The fight here is ${words}: check it is meant to be, and say so with deadly: true.`);
      }
    }
    for (const c of s.clocks || []) {
      if (!c.name) { E(at, 'A clock has no name.'); continue; }
      const size = Math.trunc(Number(c.size));
      if (!(size >= 2 && size <= 12)) E(at, `The clock "${c.name}" has size ${c.size}: give 2 to 12 segments.`);
      if (!c.note) W(at, `The clock "${c.name}" does not say what happens when it fills.`);
      if (c.global) { if (globalClocks.has(c.name)) E(at, `The clock "${c.name}" runs everywhere and is also started at ${globalClocks.get(c.name)}.`); globalClocks.set(c.name, at); }
    }
    const names2 = (s.clocks || []).map((c) => c.name);
    if (new Set(names2).size !== names2.length) E(at, 'Two clocks here share a name.');
    // Rules that live only in the notes (none of the place's own rules covers them).
    const own = TRIG.rulesAt({ sites: [s] }, s.id);
    const found = PROSE_RULES.filter(([re, , covers]) => re.test(s.notes || '') && !own.some(covers)).map(([, what]) => what);
    if (found.length) N(at, `Rules only in the notes (the Director must remember them; a rules field would let the Engine do it): ${found.join(', ')}.`);
  }

  // ---- the adventure's own rules (engine/triggers.js) ------------------------------------------------
  {
    const rr = TRIG.checkRules(adv, { skills: (srd.skills || []).map((x) => x.id) });
    for (const t of rr.errors) E('rules', t);
    for (const t of rr.warnings) W('rules', t);
  }
  if (adv.party != null) {
    const p = adv.party;
    const sz = Array.isArray(p.size) ? p.size : [p.size];
    if (!sz.every((n) => Number(n) >= 1 && Number(n) <= 10)) E('party', 'party.size should be a number of characters (or [fewest, most]), 1 to 10.');
    if (p.level != null && !(Number(p.level) >= 1 && Number(p.level) <= 20)) E('party', 'party.level should be 1 to 20.');
  } else N('party', 'No `party` says who it is written for: four characters is assumed when fights are fitted to the table.');

  // ---- quests --------------------------------------------------------------------------------------
  const quests = Array.isArray(adv.quests) ? adv.quests : [];
  for (const qd of adv.questDone || []) {
    if (!qd.match) { E('quests', 'A questDone entry has no "match".'); continue; }
    if (qd.match !== lower(qd.match)) E('quests', `questDone "${qd.match}" must be lower case: it is matched against the quest's words in lower case.`);
    const hits = quests.filter((x) => lower(x).includes(lower(qd.match)));
    if (!hits.length) N('quests', `questDone "${qd.match}" matches none of the starting quests: it applies to a quest added in play with those words.`);
    if (hits.length > 1) W('quests', `questDone "${qd.match}" matches ${hits.length} quests.`);
    for (const a of qd.at || []) if (!ids.has(a)) E('quests', `questDone "${qd.match}" can finish at "${a}", which is not a place.`);
  }
  for (const x of quests) if (!(adv.questDone || []).some((qd) => lower(x).includes(lower(qd.match)))) N('quests', `"${x}" has no questDone entry: the Director may close it anywhere.`);

  // ---- ready-made heroes ---------------------------------------------------------------------------
  const pNames = new Set();
  for (const p of adv.pregens || []) {
    const nm = p.name || (p.input || {}).name || p.id;
    if (pNames.has(lower(nm))) E(`hero ${nm}`, 'Two ready-made heroes share a name.');
    pNames.add(lower(nm));
    for (const lv of [...new Set([minL, maxL])]) {
      try {
        let n = 0;
        const input = completeBuild({ ...(p.input || {}), level: lv }, srd, () => ((n = (n * 9301 + 49297) % 233280) / 233280));
        R.derive(input, srd);
      } catch (e) { E(`hero ${nm}`, `Does not build at level ${lv}: ${e.message}`); }
    }
  }
  return { id, name: adv.name || '', errors, warnings, notes, fights };
}

// The report as text, for the command line and the bench.
export function reportText(r, { notes = true } = {}) {
  const out = [`${r.name || r.id} (${r.id}): ${r.errors.length} error${r.errors.length === 1 ? '' : 's'}, ${r.warnings.length} warning${r.warnings.length === 1 ? '' : 's'}`];
  const list = (title, xs) => { if (xs.length) { out.push(`  ${title}`); for (const x of xs) out.push(`  - ${x.where}: ${x.text}`); } };
  list('ERRORS (fix these: play will trip on them)', r.errors);
  list('WARNINGS (probably mistakes)', r.warnings);
  if (notes) list('NOTES', r.notes);
  return out.join('\n');
}
