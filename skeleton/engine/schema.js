// The shape of a game module: what every game built on the skeleton must provide.
// One template per section. The validator (module.js), the converter and the two prompts
// all read these, so the format is written down in exactly one place.
//
// A module is a folder under modules/ with one JSON file per section:
//   module.json      who the game is: name, tone, what the table calls things
//   rules.json       the core rules: stats, skills, the difficulty ladder, tracks, combat, conditions
//   handbook.json    the players' book: origins, callings, abilities, gear, pregenerated characters
//   bestiary.json    the creatures
//   lore.json        the world, and a glossary
//   adventures/*.json  one file per adventure or campaign chapter
//
// The dice are NOT in the module. Every game on the skeleton rolls the same way (see DICE below);
// a module only names the parts and says what a snag costs and what a surge earns.

export const FORMAT = 'skeleton-module/1';

// The dice core, fixed for every module. Kept as words here so prompts can quote it.
export const DICE = `THE DICE (fixed by the skeleton; a module cannot change them)
- Every roll is a pool of six-sided dice: a stat (1 to 5 dice) plus a skill (0 to 3 dice) plus or minus
  modifiers (conditions, strain, help, gear). Modifiers together never go past +5 or -5, and a pool is
  never smaller than 1 die.
- Add up the dice. A 1 scores nothing.
- Each 1 is a SNAG: a penalty. Every snag marks 1 point on the strain track, whether the roll succeeds or
  fails. A failed roll with snags may also cost something more (the module's snag table).
- Two or more 6s and no 1s is a SURGE: a bonus. On an attack, the weapon's value counts twice; on any
  other roll the module's surge effect applies (an extra benefit, chosen from its surge list).
- Compare the total to a DIFFICULTY from the module's ladder (8 is easy, 12 standard, 16 hard,
  20 extreme, 24 legendary). Meet or beat it to succeed. What is left over is OVERFLOW: how well it went.
- Damage = overflow + the weapon's value - the target's soak, at least 1. A surge counts the weapon twice.
- When nobody opposes the roll and there is no hurry, the Director may take the pool x 3 as the total.`;

// Each section: a template (an example of every field, with notes) and the checks it must pass.
// In templates, "?" after a key means optional. Text after // is a note, not part of the JSON.
export const TEMPLATES = {
  module: `{
  "format": "skeleton-module/1",
  "id": "saltglass",                       // lower-case-with-dashes; the folder name
  "name": "Saltglass",
  "tagline": "Salvage divers in a drowned city of glass.",
  "tone": "Wet, cold, wondrous; danger is real but the city is beautiful.",  // how the Director should sound
  "audience?": "Teens and adults",
  "credits?": "Who made it, and what it was converted from",
  "terms": {                                // what the table calls the skeleton's parts
    "difficulty": "Depth", "snag": "Crack", "surge": "Gleam",
    "health": "Breath", "strain": "Strain", "character": "Diver", "creature": "Thing below",
    "xp": "Salvage", "level": "Dive rank"
  }
}`,
  rules: `{
  "stats": [                                // 3 to 6 stats; a character rates each from 1 to 5 dice
    { "id": "brawn", "name": "Brawn", "about": "Strength, endurance, holding your breath." }
  ],
  "statPoints": { "start": 1, "spend": 8, "max": 4 },   // every stat starts at 'start'; spend 'spend' more; none above 'max' at creation
  "skills": [                               // 6 to 16 skills; ranks 0 to 3 add dice to the stat they use
    { "id": "swim", "name": "Swim", "stat": "brawn", "about": "Moving fast or far in water." }
  ],
  "skillPoints": { "spend": 6, "max": 2 },   // ranks to spend at creation, and the most in one skill then
  "ladder": [                               // difficulties, lowest first; keep the 8/12/16/20/24 spacing
    { "at": 8, "name": "Easy" }, { "at": 12, "name": "Standard" }, { "at": 16, "name": "Hard" },
    { "at": 20, "name": "Extreme" }, { "at": 24, "name": "Legendary" }
  ],
  "snag": {
    "effect": "Each Crack marks 1 Strain.",
    "table": [                              // optional extra cost on a FAILED roll, by number of snags (1, 2, 3+)
      { "snags": 1, "name": "Slip", "effect": "Drop or lose something small." },
      { "snags": 2, "name": "Tangle", "effect": "You are Snared until you spend an action." },
      { "snags": 3, "name": "Blackout", "effect": "Lose 1d6 Breath." }
    ]
  },
  "surge": {
    "effect": "A Gleam: the weapon counts twice on an attack; otherwise choose one bonus.",
    "options": ["Do it in half the time.", "Learn a secret about the place.", "An ally gains +2 dice on their next roll."]
  },
  "health": { "name": "Breath", "base": 10, "stat": "brawn", "perStat": 2, "perLevel": 2 },  // max = base + stat x perStat + perLevel x (level - 1)
  "strain": {
    "name": "Strain", "max": 6,
    "penalties": [ { "at": 3, "dice": -1 }, { "at": 5, "dice": -2 } ],   // dice lost from every pool at that much strain
    "atMax": "Breakdown: you are Shaken until you rest, and Strain drops to 3."
  },
  "defence": { "base": 8, "stat": "wits", "note?": "Difficulty to hit a character = base + stat + armour's defence bonus" },
  "initiative": { "stat": "wits", "skill?": "sense" },
  "combat": {
    "actionsPerTurn": 2,
    "actions": [ { "id": "strike", "name": "Strike", "cost": 1, "does": "Attack once with a weapon." } ]
  },
  "conditions": [                            // the states the Engine can put on anyone
    { "id": "shaken", "name": "Shaken", "effect": "-1 die on every roll.", "dice": -1, "ends": "A rest, or an ally steadies you (Standard Nerve)." }
  ],
  "rest": { "short": "Recover half your Breath; clear 2 Strain.", "long": "Recover all Breath; clear all Strain and conditions." },
  "advancement": { "xpPerLevel": 10, "maxLevel": 10, "perLevel": "+1 skill rank; every 3rd level +1 stat (max 5)." },
  "rulings?": [ { "q": "Can two divers roll together?", "a": "One rolls; each helper adds 1 die (max +2)." } ]
}`,
  handbook: `{
  "intro": "What the players need to know before they make a character.",
  "origins": [                               // where a character comes from; 2 to 8
    { "id": "reefborn", "name": "Reefborn", "about": "Raised on the stilt-towns.", "stats": { "brawn": 1 }, "gift": "Hold your breath twice as long." }
  ],
  "callings": [                              // what a character does; 2 to 8 (classes, careers, paths)
    { "id": "hookhand", "name": "Hookhand", "about": "Salvage fighter.", "skills": ["fight", "swim"], "gear": ["gaff-hook"], "abilities": ["brace-the-line"] }
  ],
  "abilities": [                             // special moves; callings name them by id
    { "id": "brace-the-line", "name": "Brace the Line", "level": 1, "cost": "1 Strain",
      "roll?": { "stat": "brawn", "skill": "swim" }, "effect": "Anchor an ally: they ignore the next current or push." }
  ],
  "gear": [                                  // weapons need "weapon"; armour needs "soak" (and may add "defence")
    { "id": "gaff-hook", "name": "Gaff hook", "kind": "weapon", "weapon": 3, "stat": "brawn", "skill": "fight", "about": "Hook and blade." },
    { "id": "diving-leathers", "name": "Diving leathers", "kind": "armour", "soak": 1, "about": "" }
  ],
  "chargen": ["Choose an origin.", "Choose a calling.", "Spend stat points.", "Spend skill ranks.", "Name your character and say one thing they want."],
  "pregens": [                               // ready-made characters for a quick start; 2 to 6
    { "name": "Moll Tarrow", "origin": "reefborn", "calling": "hookhand",
      "stats": { "brawn": 4 }, "skills": { "fight": 2, "swim": 2 }, "look": "Scarred hands, quick grin.", "want": "Pay off the boat." }
  ]
}`,
  bestiary: `{
  "creatures": [
    { "id": "glass-eel", "name": "Glass eel", "tier": 1,          // tier 1 (a nuisance) to 5 (a legend)
      "about": "What it is and how it lives.", "look": "What the players see.",
      "health": 8, "soak": 0, "defence": 10,                       // defence = difficulty to hit it
      "attacks": [ { "name": "Bite", "dice": 4, "weapon": 2, "kind": "melee", "effect?": "On a surge: Bleeding." } ],
      "abilities?": [ { "name": "Clear as water", "effect": "Hard to see: Sense rolls against it are Hard." } ],
      "tactics": "How it fights and when it runs.",
      "xp": 2 }
  ]
}`,
  lore: `{
  "world": "The setting in a paragraph: what the players can know.",
  "sections": [ { "title": "The Drowned City", "text": "..." } ],
  "glossary": [ { "term": "Gleam", "means": "Two 6s and no 1s." } ]
}`,
  adventure: `{
  "id": "bell-under-brine", "name": "The Bell Under Brine",
  "pitch": "One sentence the players hear.",
  "level": 1, "party": "2 to 4 characters",
  "intro": "Read aloud at the start (players see this).",
  "secrets": "What is really going on (Director only).",
  "start": "dock",                            // the first site's id
  "sites": [
    { "id": "dock", "name": "Lamp Dock",
      "read": "What the players see on arrival (read aloud).",
      "notes": "Director only: what is here, who wants what, what a roll can find.",
      "exits": ["nave"],
      "creatures?": [ { "id": "glass-eel", "count": 2, "hidden": true } ],
      "hazards?": [ { "name": "Cold current", "stat": "brawn", "skill": "swim", "at": 12, "fail": "Lose 3 Breath." } ],
      "clues?": ["A broken lamp with a guild mark."] }
  ],
  "quests": [ { "id": "bell", "text": "Raise the glass bell.", "doneAt?": ["dock"] } ],
  "clocks?": [ { "id": "tide", "name": "The Tide", "size": 6, "ticks": "Every time the divers rest or fail loudly.", "fills": "The city floods." } ],
  "npcs?": [ { "name": "Auntie Pell", "role": "Dock boss", "want": "Her share.", "voice": "Dry, slow.", "secret": "She sold the map twice." } ],
  "ending": "How it can end, and what changes.",
  "reward": { "xp": 10, "other?": "A favour from the guild." }
}`,
};

// The checks. Each returns a list of problems in plain words.
const isId = (x) => typeof x === 'string' && /^[a-z0-9][a-z0-9-]{0,40}$/.test(x);
const text = (x) => typeof x === 'string' && x.trim().length > 0;
const num = (x, lo, hi) => typeof x === 'number' && Number.isFinite(x) && x >= lo && x <= hi;

function list(errs, where, arr, { min = 0, max = 999, ids = true, label = 'name' } = {}) {
  if (!Array.isArray(arr)) { errs.push(`${where} must be a list.`); return []; }
  if (arr.length < min) errs.push(`${where} needs at least ${min} entr${min === 1 ? 'y' : 'ies'} (has ${arr.length}).`);
  if (arr.length > max) errs.push(`${where} has more than ${max} entries (${arr.length}).`);
  if (ids) {
    const seen = new Set();
    arr.forEach((x, i) => {
      if (!x || typeof x !== 'object') { errs.push(`${where}[${i}] is not an object.`); return; }
      if (!isId(x.id)) errs.push(`${where}[${i}] needs an "id" in lower-case-with-dashes (got ${JSON.stringify(x.id)}).`);
      else if (seen.has(x.id)) errs.push(`${where} has the id "${x.id}" twice.`);
      seen.add(x.id);
      if (!text(x[label])) errs.push(`${where} "${x.id || i}" needs a "${label}".`);
    });
  }
  return arr.filter((x) => x && typeof x === 'object');
}

export function checkModule(m) {
  const errs = [];
  if (!m || typeof m !== 'object') return ['module.json is missing.'];
  if (m.format !== FORMAT) errs.push(`module.json "format" must be "${FORMAT}".`);
  if (!isId(m.id)) errs.push('module.json needs an "id" in lower-case-with-dashes.');
  for (const k of ['name', 'tagline', 'tone']) if (!text(m[k])) errs.push(`module.json needs "${k}".`);
  if (m.terms != null && typeof m.terms !== 'object') errs.push('module.json "terms" must be an object.');
  return errs;
}

export function checkRules(r) {
  const errs = [];
  if (!r || typeof r !== 'object') return ['rules.json is missing.'];
  const stats = list(errs, 'rules.stats', r.stats, { min: 3, max: 6 });
  const statIds = new Set(stats.map((s) => s.id));
  const sp = r.statPoints || {};
  if (!num(sp.start, 1, 3) || !num(sp.spend, 0, 20) || !num(sp.max, 2, 5)) errs.push('rules.statPoints needs "start" (1-3), "spend" (0-20) and "max" (2-5).');
  const skills = list(errs, 'rules.skills', r.skills, { min: 4, max: 24 });
  for (const s of skills) if (!statIds.has(s.stat)) errs.push(`rules.skills "${s.id}" uses the stat "${s.stat}", which is not in rules.stats.`);
  const kp = r.skillPoints || {};
  if (!num(kp.spend, 0, 30) || !num(kp.max, 1, 3)) errs.push('rules.skillPoints needs "spend" (0-30) and "max" (1-3).');
  if (!Array.isArray(r.ladder) || r.ladder.length < 3) errs.push('rules.ladder needs at least 3 difficulties.');
  else {
    r.ladder.forEach((x, i) => { if (!x || !num(x.at, 2, 40) || !text(x.name)) errs.push(`rules.ladder[${i}] needs "at" (a number) and "name".`); });
    for (let i = 1; i < r.ladder.length; i++) if (r.ladder[i] && r.ladder[i - 1] && r.ladder[i].at <= r.ladder[i - 1].at) errs.push('rules.ladder must go from lowest to highest.');
  }
  if (!r.snag || !text(r.snag.effect)) errs.push('rules.snag needs an "effect" (what a 1 costs).');
  if (r.snag && r.snag.table != null && !Array.isArray(r.snag.table)) errs.push('rules.snag.table must be a list.');
  if (!r.surge || !text(r.surge.effect)) errs.push('rules.surge needs an "effect" (what two 6s and no 1s earn).');
  const h = r.health || {};
  if (!text(h.name) || !num(h.base, 1, 100) || !statIds.has(h.stat) || !num(h.perStat ?? 0, 0, 20) || !num(h.perLevel ?? 0, 0, 20)) errs.push('rules.health needs "name", "base", a "stat" from rules.stats, "perStat" and "perLevel".');
  const st = r.strain || {};
  if (!text(st.name) || !num(st.max, 2, 20)) errs.push('rules.strain needs "name" and "max" (2-20).');
  if (st.penalties != null && (!Array.isArray(st.penalties) || st.penalties.some((p) => !p || !num(p.at, 1, 20) || !num(p.dice, -5, 0)))) errs.push('rules.strain.penalties is a list of { "at": number, "dice": 0 to -5 }.');
  const d = r.defence || {};
  if (!num(d.base, 2, 30) || !statIds.has(d.stat)) errs.push('rules.defence needs "base" and a "stat" from rules.stats.');
  if (!r.initiative || !statIds.has(r.initiative.stat)) errs.push('rules.initiative needs a "stat" from rules.stats.');
  const c = r.combat || {};
  if (!num(c.actionsPerTurn, 1, 5)) errs.push('rules.combat.actionsPerTurn must be 1 to 5.');
  list(errs, 'rules.combat.actions', c.actions, { min: 1 });
  const conds = list(errs, 'rules.conditions', r.conditions, { min: 1 });
  for (const x of conds) {
    if (!text(x.effect)) errs.push(`rules.conditions "${x.id}" needs an "effect".`);
    if (x.dice != null && !num(x.dice, -5, 5)) errs.push(`rules.conditions "${x.id}" "dice" must be -5 to 5.`);
  }
  if (!r.rest || !text(r.rest.short) || !text(r.rest.long)) errs.push('rules.rest needs "short" and "long".');
  const a = r.advancement || {};
  if (!num(a.xpPerLevel, 1, 1000) || !num(a.maxLevel, 1, 30)) errs.push('rules.advancement needs "xpPerLevel" and "maxLevel".');
  return errs;
}

export function checkHandbook(hb, rules) {
  const errs = [];
  if (!hb || typeof hb !== 'object') return ['handbook.json is missing.'];
  const statIds = new Set(((rules && rules.stats) || []).map((s) => s.id));
  const skillIds = new Set(((rules && rules.skills) || []).map((s) => s.id));
  const origins = list(errs, 'handbook.origins', hb.origins, { min: 1 });
  for (const o of origins) for (const k of Object.keys(o.stats || {})) if (!statIds.has(k)) errs.push(`handbook.origins "${o.id}" raises "${k}", which is not a stat.`);
  const abilities = list(errs, 'handbook.abilities', hb.abilities || [], {});
  const abIds = new Set(abilities.map((a) => a.id));
  for (const a of abilities) {
    if (!text(a.effect)) errs.push(`handbook.abilities "${a.id}" needs an "effect".`);
    if (a.roll && (!statIds.has(a.roll.stat) || (a.roll.skill && !skillIds.has(a.roll.skill)))) errs.push(`handbook.abilities "${a.id}" rolls a stat or skill that does not exist.`);
  }
  const gear = list(errs, 'handbook.gear', hb.gear || [], {});
  const gearIds = new Set(gear.map((g) => g.id));
  for (const g of gear) {
    if (g.kind === 'weapon' && (!num(g.weapon, 0, 20) || !statIds.has(g.stat))) errs.push(`handbook.gear "${g.id}" is a weapon: it needs "weapon" (a number) and a "stat".`);
    if (g.skill && !skillIds.has(g.skill)) errs.push(`handbook.gear "${g.id}" uses the skill "${g.skill}", which does not exist.`);
    if (g.kind === 'armour' && !num(g.soak, 0, 10)) errs.push(`handbook.gear "${g.id}" is armour: it needs "soak".`);
  }
  const callings = list(errs, 'handbook.callings', hb.callings, { min: 1 });
  for (const c of callings) {
    for (const k of c.skills || []) if (!skillIds.has(k)) errs.push(`handbook.callings "${c.id}" names the skill "${k}", which does not exist.`);
    for (const k of c.gear || []) if (!gearIds.has(k)) errs.push(`handbook.callings "${c.id}" names the gear "${k}", which is not in handbook.gear.`);
    for (const k of c.abilities || []) if (!abIds.has(k)) errs.push(`handbook.callings "${c.id}" names the ability "${k}", which is not in handbook.abilities.`);
  }
  const oIds = new Set(origins.map((o) => o.id));
  const cIds = new Set(callings.map((c) => c.id));
  (hb.pregens || []).forEach((p, i) => {
    if (!p || !text(p.name)) { errs.push(`handbook.pregens[${i}] needs a "name".`); return; }
    if (!oIds.has(p.origin)) errs.push(`handbook.pregens "${p.name}" has an origin that is not in handbook.origins.`);
    if (!cIds.has(p.calling)) errs.push(`handbook.pregens "${p.name}" has a calling that is not in handbook.callings.`);
    for (const k of Object.keys(p.stats || {})) if (!statIds.has(k)) errs.push(`handbook.pregens "${p.name}" rates "${k}", which is not a stat.`);
    for (const k of Object.keys(p.skills || {})) if (!skillIds.has(k)) errs.push(`handbook.pregens "${p.name}" has the skill "${k}", which does not exist.`);
  });
  return errs;
}

export function checkBestiary(b) {
  const errs = [];
  if (!b || typeof b !== 'object') return ['bestiary.json is missing.'];
  const cs = list(errs, 'bestiary.creatures', b.creatures, { min: 1 });
  for (const c of cs) {
    if (!num(c.tier, 1, 5)) errs.push(`bestiary "${c.id}" needs a "tier" from 1 to 5.`);
    if (!num(c.health, 1, 500)) errs.push(`bestiary "${c.id}" needs "health".`);
    if (!num(c.defence, 2, 40)) errs.push(`bestiary "${c.id}" needs "defence" (the difficulty to hit it).`);
    if (c.soak != null && !num(c.soak, 0, 20)) errs.push(`bestiary "${c.id}" "soak" must be 0 to 20.`);
    if (!Array.isArray(c.attacks) || !c.attacks.length) errs.push(`bestiary "${c.id}" needs at least one attack.`);
    else c.attacks.forEach((a, i) => { if (!a || !text(a.name) || !num(a.dice, 1, 15) || !num(a.weapon ?? 0, 0, 20)) errs.push(`bestiary "${c.id}" attack ${i + 1} needs "name", "dice" (1-15) and "weapon".`); });
  }
  return errs;
}

export function checkLore(l) {
  if (!l || typeof l !== 'object') return ['lore.json is missing.'];
  const errs = [];
  if (!text(l.world)) errs.push('lore.world needs a paragraph about the setting.');
  if (l.sections != null && !Array.isArray(l.sections)) errs.push('lore.sections must be a list.');
  if (l.glossary != null && !Array.isArray(l.glossary)) errs.push('lore.glossary must be a list.');
  return errs;
}

export function checkAdventure(a, { bestiary, rules } = {}) {
  const errs = [];
  if (!a || typeof a !== 'object') return ['The adventure is missing.'];
  const tag = `adventure "${a.id || '?'}"`;
  if (!isId(a.id)) errs.push('An adventure needs an "id" in lower-case-with-dashes.');
  for (const k of ['name', 'pitch', 'intro', 'secrets', 'ending']) if (!text(a[k])) errs.push(`${tag} needs "${k}".`);
  const sites = list(errs, `${tag} sites`, a.sites, { min: 1 });
  const siteIds = new Set(sites.map((s) => s.id));
  if (!siteIds.has(a.start)) errs.push(`${tag} "start" must be one of its site ids.`);
  const beasts = new Set(((bestiary && bestiary.creatures) || []).map((c) => c.id));
  const statIds = new Set(((rules && rules.stats) || []).map((s) => s.id));
  for (const s of sites) {
    if (!text(s.read)) errs.push(`${tag} site "${s.id}" needs "read" (what the players see).`);
    for (const e of s.exits || []) if (!siteIds.has(e)) errs.push(`${tag} site "${s.id}" has an exit to "${e}", which is not a site.`);
    for (const c of s.creatures || []) if (!c || !beasts.has(c.id)) errs.push(`${tag} site "${s.id}" places "${c && c.id}", which is not in the bestiary.`);
    for (const h of s.hazards || []) if (!h || !text(h.name) || !statIds.has(h.stat) || !num(h.at, 2, 40)) errs.push(`${tag} site "${s.id}" hazard needs "name", a "stat" and "at".`);
  }
  list(errs, `${tag} quests`, a.quests, { min: 1, label: 'text' });
  for (const q of a.quests || []) for (const s of (q && q.doneAt) || []) if (!siteIds.has(s)) errs.push(`${tag} quest "${q.id}" is done at "${s}", which is not a site.`);
  for (const c of a.clocks || []) if (!c || !isId(c.id) || !text(c.name) || !num(c.size, 2, 12)) errs.push(`${tag} clocks need "id", "name" and "size" (2-12).`);
  return errs;
}

// Everything at once: { errors: [..], ok }.
export function checkAll(mod) {
  const errors = [
    ...checkModule(mod.module),
    ...checkRules(mod.rules),
    ...checkHandbook(mod.handbook, mod.rules),
    ...checkBestiary(mod.bestiary),
    ...checkLore(mod.lore),
  ];
  if (!Array.isArray(mod.adventures) || !mod.adventures.length) errors.push('The module needs at least one adventure.');
  for (const a of mod.adventures || []) errors.push(...checkAdventure(a, mod));
  return { ok: errors.length === 0, errors };
}

export const SECTIONS = ['module', 'rules', 'handbook', 'bestiary', 'lore', 'adventure'];
