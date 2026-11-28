// Loading, saving and reading a game module (the folder format is in schema.js).

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { checkAll, FORMAT } from './schema.js';
import { getSystem } from './dicesystems.js';
import { linkArt } from './pictures.js';

// What the skeleton calls its parts when a module does not rename them.
export const DEFAULT_TERMS = {
  difficulty: 'Difficulty', snag: 'Snag', surge: 'Surge', health: 'Health', strain: 'Strain',
  character: 'Character', creature: 'Creature', xp: 'XP', level: 'Level', overflow: 'Overflow',
};

const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));

export function listModules(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(dir, d.name, 'module.json')))
    .map((d) => {
      try { const m = readJson(join(dir, d.name, 'module.json')); return { id: d.name, name: m.name || d.name, tagline: m.tagline || '' }; } catch (e) { return { id: d.name, name: d.name, tagline: '(module.json is not valid JSON)' }; }
    });
}

// Where a module lives: the game's own modules/, else the worked example in example/ (the template ships
// with an empty modules/ and Saltglass in example/, so it starts, tests and converts before any game exists).
export function moduleHome(root, id) {
  const own = join(root, 'modules');
  return existsSync(join(own, String(id), 'module.json')) || !existsSync(join(root, 'example', String(id), 'module.json')) ? own : join(root, 'example');
}
export function allModules(root) {
  const own = listModules(join(root, 'modules'));
  const ex = listModules(join(root, 'example')).filter((m) => !own.some((o) => o.id === m.id)).map((m) => ({ ...m, example: true, name: `${m.name} (example)` }));
  return [...own, ...ex];
}
// The module a tool uses when none is named: the first of the game's own, else the example.
export const defaultModule = (root) => ((allModules(root)[0] || {}).id || 'saltglass');

export function loadModule(dir, id) {
  const root = join(dir, id);
  const part = (f) => { const p = join(root, f); return existsSync(p) ? readJson(p) : null; };
  const advDir = join(root, 'adventures');
  const adventures = existsSync(advDir) ? readdirSync(advDir).filter((f) => f.endsWith('.json')).sort().map((f) => readJson(join(advDir, f))) : [];
  return prepare({ module: part('module.json'), rules: part('rules.json'), handbook: part('handbook.json'), bestiary: part('bestiary.json'), lore: part('lore.json'), adventures });
}

export function saveModule(dir, mod) {
  const id = mod.module.id;
  const root = join(dir, id);
  mkdirSync(join(root, 'adventures'), { recursive: true });
  const w = (f, x) => writeFileSync(join(root, f), JSON.stringify(x, null, 2) + '\n');
  const { terms, ...head } = mod.module;
  w('module.json', { ...head, format: FORMAT, terms: mod.module.rawTerms || terms });
  w('rules.json', mod.rules);
  w('handbook.json', mod.handbook);
  w('bestiary.json', mod.bestiary);
  w('lore.json', mod.lore);
  for (const a of mod.adventures) w(join('adventures', `${a.id}.json`), a);
  return root;
}

// Fills defaults and adds look-up tables. Never throws on a bad module: check() says what is wrong.
export function prepare(raw) {
  const mod = { ...raw };
  const m = { ...(raw.module || {}) };
  m.rawTerms = m.terms || {};
  m.terms = { ...DEFAULT_TERMS, ...(m.terms || {}) };
  mod.module = m;
  mod.rules = raw.rules || {};
  mod.handbook = raw.handbook || {};
  mod.bestiary = raw.bestiary || { creatures: [] };
  mod.lore = raw.lore || {};
  mod.adventures = raw.adventures || [];
  const by = (arr) => Object.fromEntries((arr || []).filter((x) => x && x.id).map((x) => [x.id, x]));
  mod.ix = {
    stat: by(mod.rules.stats), skill: by(mod.rules.skills), cond: by(mod.rules.conditions),
    origin: by(mod.handbook.origins), calling: by(mod.handbook.callings), ability: by(mod.handbook.abilities),
    gear: by(mod.handbook.gear), creature: by(mod.bestiary.creatures), adventure: by(mod.adventures),
  };
  // A book's pictures, each linked by its words to the creature or the place it shows (engine/pictures.js).
  for (const a of mod.adventures) { try { linkArt(a, mod); } catch (e) { /* a broken picture list shows nothing */ } }
  return mod;
}

export const check = (mod) => checkAll(mod);

export const term = (mod, key) => (mod && mod.module && mod.module.terms[key]) || DEFAULT_TERMS[key] || key;

// "Hard (16)" for a number, using the module's ladder.
export function ladderName(mod, at) {
  const rung = ((mod.rules && mod.rules.ladder) || []).find((r) => r.at === at);
  return rung ? `${rung.name} (${at})` : String(at);
}

// A difficulty given as a number or as a ladder name ("hard", "Standard").
export function difficulty(mod, x) {
  if (x == null || String(x).trim() === '') return null;
  const n = Number(x);
  if (Number.isFinite(n)) return Math.round(n);
  const ladder = (mod.rules && mod.rules.ladder) || [];
  const w = String(x || '').trim().toLowerCase().replace(/\s*\(.*\)$/, '').replace(/\s+[+-]?\d+%?$/, '');
  // The exact name, or the one word that tells it apart ("Hard" for "Hard Peril": the Gull Rock bench, 26 Nov,
  // 13 of 14 refusals), or a name with a number after it ("Hard 20").
  const rung = ladder.find((r) => r.name.toLowerCase() === w)
    || ladder.find((r) => r.name.toLowerCase() === w.replace(/\s+-?\d+$/, ''))
    || (() => { const l = ladder.filter((r) => r.name.toLowerCase().split(/\s+/).includes(w) || r.name.toLowerCase().startsWith(`${w} `)); return l.length === 1 ? l[0] : null; })()
    || byPlace(ladder, w);
  return rung ? rung.at : null;
}
// A common name for a difficulty in a game that calls it something else ("Standard" or "Very hard" in Gull Rock,
// whose ladder runs Routine, Regular, Hard, Dire Peril: the bench, 26 Nov): the rung in the same place on its ladder.
const PLACES = [
  [/^(trivial|very easy|simple|easy|routine|basic)$/, 0],
  [/^(standard|regular|normal|average|medium|moderate|ordinary)$/, 1 / 3],
  [/^(hard|difficult|tough|challenging)$/, 2 / 3],
  [/^(very hard|very difficult|extreme|extremely hard|heroic|formidable|dire|daunting|nearly impossible|impossible|legendary)$/, 1],
];
function byPlace(ladder, w) {
  if (!ladder.length) return null;
  const p = PLACES.find(([re]) => re.test(w));
  if (!p) return null;
  const sorted = ladder.slice().sort((a, b) => a.at - b.at);
  return sorted[Math.round(p[1] * (sorted.length - 1))];
}

// The module as text sections, for the Director's look-up tool and the screens' rule books.
// Director-only text (adventure secrets and notes) is marked hidden.
export function books(mod) {
  const out = [];
  const add = (book, title, text, hidden = false) => { if (text) out.push({ book, title, text: String(text), hidden }); };
  const r = mod.rules;
  const T = mod.module.terms;
  add('Rules', 'Stats', (r.stats || []).map((s) => `${s.name}: ${s.about || ''}`).join('\n'));
  add('Rules', 'Skills', (r.skills || []).map((s) => `${s.name} (${(mod.ix.stat[s.stat] || {}).name || s.stat}): ${s.about || ''}`).join('\n'));
  { const S = getSystem(r); add('Rules', `The dice: ${S.name}`, S.sys.describe(S.o, T)); }
  add('Rules', `${T.difficulty} ladder`, (r.ladder || []).map((x) => `${x.at} ${x.name}${x.about ? `: ${x.about}` : ''}`).join('\n'));
  add('Rules', `${T.snag}s (1s)`, [r.snag && r.snag.effect, ...((r.snag && r.snag.table) || []).map((t) => `${t.snags}${t.snags >= 3 ? '+' : ''} on a failed roll, ${t.name}: ${t.effect}`)].filter(Boolean).join('\n'));
  add('Rules', `${T.surge} (two 6s, no 1s)`, [r.surge && r.surge.effect, ...((r.surge && r.surge.options) || []).map((o) => `- ${o}`)].filter(Boolean).join('\n'));
  if (r.health) add('Rules', T.health, `Maximum ${T.health} = ${r.health.base} + ${(mod.ix.stat[r.health.stat] || {}).name || r.health.stat} x ${r.health.perStat || 0} + ${r.health.perLevel || 0} per ${T.level.toLowerCase()} after the first.`);
  if (r.strain) add('Rules', T.strain, `${T.strain} runs from 0 to ${r.strain.max}. ${(r.strain.penalties || []).map((p) => `At ${p.at}: ${p.dice} dice on every roll.`).join(' ')} ${r.strain.atMax || ''}`);
  if (r.defence) add('Rules', 'Defence', `Difficulty to hit a ${T.character.toLowerCase()} = ${r.defence.base} + ${(mod.ix.stat[r.defence.stat] || {}).name || r.defence.stat} + armour. ${r.defence.note || ''}`);
  if (r.combat) add('Rules', 'Combat', `${r.combat.actionsPerTurn} actions a turn.\n${(r.combat.actions || []).map((a) => `${a.name} (${a.cost}): ${a.does}`).join('\n')}`);
  for (const c of r.conditions || []) add('Rules', `Condition: ${c.name}`, `${c.effect}${c.ends ? ` Ends: ${c.ends}` : ''}`);
  if (r.rest) add('Rules', 'Rest', `Short: ${r.rest.short}\nLong: ${r.rest.long}`);
  if (r.advancement) add('Rules', 'Advancement', `${r.advancement.xpPerLevel} ${T.xp} per ${T.level.toLowerCase()} (up to ${r.advancement.maxLevel}). ${r.advancement.perLevel || ''}`);
  for (const q of r.rulings || []) add('Rules', `Ruling: ${q.q}`, q.a);
  const hb = mod.handbook;
  add('Handbook', 'Introduction', hb.intro);
  add('Handbook', 'Making a character', (hb.chargen || []).map((s, i) => `${i + 1}. ${s}`).join('\n'));
  for (const o of hb.origins || []) add('Handbook', `Origin: ${o.name}`, `${o.about || ''} ${Object.entries(o.stats || {}).map(([k, v]) => `${(mod.ix.stat[k] || {}).name || k} ${v > 0 ? '+' : ''}${v}`).join(', ')}. ${o.gift ? `Gift: ${o.gift}` : ''}`);
  for (const c of hb.callings || []) add('Handbook', `Calling: ${c.name}`, `${c.about || ''} Skills: ${(c.skills || []).map((k) => (mod.ix.skill[k] || {}).name || k).join(', ')}. Gear: ${(c.gear || []).map((k) => (mod.ix.gear[k] || {}).name || k).join(', ')}. Abilities: ${(c.abilities || []).map((k) => (mod.ix.ability[k] || {}).name || k).join(', ')}.`);
  for (const a of hb.abilities || []) add('Handbook', `Ability: ${a.name}`, `${T.level} ${a.level || 1}. Cost: ${a.cost || 'none'}. ${a.roll ? `Roll ${(mod.ix.stat[a.roll.stat] || {}).name || a.roll.stat}${a.roll.skill ? ` + ${(mod.ix.skill[a.roll.skill] || {}).name || a.roll.skill}` : ''}. ` : ''}${a.effect}`);
  for (const g of hb.gear || []) add('Handbook', `Gear: ${g.name}`, `${g.kind || ''}${g.weapon != null ? `, weapon ${g.weapon}` : ''}${g.soak != null ? `, soak ${g.soak}` : ''}${g.defence ? `, defence +${g.defence}` : ''}. ${g.about || ''}`);
  for (const c of mod.bestiary.creatures || []) add('Bestiary', c.name, `Tier ${c.tier}. ${c.about || ''} ${c.look || ''}\n${T.health} ${c.health}, soak ${c.soak || 0}, defence ${c.defence}.\nAttacks: ${(c.attacks || []).map((a) => `${a.name} rating ${a.rating ?? a.dice}, weapon ${a.weapon || 0}${a.effect ? ` (${a.effect})` : ''}`).join('; ')}.\n${(c.abilities || []).map((a) => `${a.name}: ${a.effect}`).join('\n')}\nTactics: ${c.tactics || ''}`);
  add('Lore', 'The world', mod.lore.world);
  for (const s of mod.lore.sections || []) add('Lore', s.title, s.text);
  if ((mod.lore.glossary || []).length) add('Lore', 'Glossary', mod.lore.glossary.map((g) => `${g.term}: ${g.means}`).join('\n'));
  for (const a of mod.adventures) {
    add('Adventure', `${a.name}: secrets`, a.secrets, true);
    for (const s of a.sites || []) add('Adventure', `${a.name}: ${s.name}`, `${s.notes || ''}${(s.clues || []).length ? `\nClues: ${s.clues.join(' / ')}` : ''}`, true);
    for (const n of a.npcs || []) add('Adventure', `${a.name}: ${n.name}`, `${n.role || ''}. Wants ${n.want || '?'}. Voice: ${n.voice || ''}. Secret: ${n.secret || 'none'}.`, true);
  }
  return out;
}

// A quick word search over the books: the best few sections for a question.
export function lookUp(mod, query, { hidden = true, limit = 4 } = {}) {
  const words = String(query || '').toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2);
  if (!words.length) return [];
  return books(mod)
    .filter((b) => hidden || !b.hidden)
    .map((b) => {
      const t = `${b.title} ${b.text}`.toLowerCase();
      const head = b.title.toLowerCase();
      const score = words.reduce((a, w) => a + (head.includes(w) ? 3 : 0) + (t.includes(w) ? 1 : 0), 0);
      return { ...b, score };
    })
    .filter((b) => b.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
