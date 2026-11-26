// The converter behind the DM's Books tab: what you paste (a monster book, spells, a chapter of rules,
// a campaign) becomes data the Engine can use, beside the words you pasted, which are kept unchanged.
//
//   1. What is it? sniffKind() guesses: stat blocks, spells, rules text, a campaign, or engine-ready JSON.
//   2. The book reader reads standard 5e layouts at once, with no AI (readStatBlocks, readSpells, readRules).
//   3. The AI from the Director tab reads what the reader could not (aiReadEntries), and writes a whole
//      campaign as an adventure, place by place, checked by the adventure checker (aiCampaign).
//   4. The book compiler (engine/book.js) turns the words into the Engine's numbers; summarise() lists,
//      entry by entry, what was read and what was not, for the DM to see before saving.
//   5. Saved books go to library/converted/<id>/ (the original words, the book, its engine version and
//      its gaps), saved campaigns to library/adventures/. Both are private and load at start-up.
//   A PDF's pictures (public/pdfread.js cuts them out) are looked at by the AI first, if it can see
//   (seePictures): the words in a stat block, a scanned page or a handout join the text before it is
//   read, and a campaign's maps go to its places (matchMaps). Without a model that can see, the DM says
//   what each picture is on the Books tab.
import * as OPT from './options.js';
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import * as BOOK from '../engine/book.js';
import { checkAdventure } from '../engine/check.js';

export const KINDS = [
  ['auto', 'Work it out'],
  ['monsters', 'Monsters (stat blocks)'],
  ['spells', 'Spells'],
  ['options', 'Character options (races, backgrounds, feats)'],
  ['rules', 'Rules text'],
  ['campaign', 'A campaign or adventure'],
  ['json', 'Engine-ready data (JSON)'],
];
const KIND_IDS = KINDS.map(([k]) => k);
export const MAX_PASTE = 4_000_000; // characters: a whole book

export const slug = (t) => String(t || '').toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').replace(/-+/g, '-').slice(0, 60) || 'untitled';
const clean = (t) => String(t || '').replace(/\r/g, '').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[−–—]/g, (c) => (c === '—' ? '—' : '-')).replace(/ /g, ' ');
const SIZES = 'Tiny|Small|Medium|Large|Huge|Gargantuan';
const ABN = { str: 'Strength', dex: 'Dexterity', con: 'Constitution', int: 'Intelligence', wis: 'Wisdom', cha: 'Charisma' };
const ABS = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
const CR_XP = { 0: 10, 0.125: 25, 0.25: 50, 0.5: 100, 1: 200, 2: 450, 3: 700, 4: 1100, 5: 1800, 6: 2300, 7: 2900, 8: 3900, 9: 5000, 10: 5900, 11: 7200, 12: 8400, 13: 10000, 14: 11500, 15: 13000, 16: 15000, 17: 18000, 18: 20000, 19: 22000, 20: 25000, 21: 33000, 22: 41000, 23: 50000, 24: 62000, 25: 75000, 26: 90000, 27: 105000, 28: 120000, 29: 135000, 30: 155000 };
const crNum = (t) => { const s = String(t || '').trim(); if (/^\d+\/\d+$/.test(s)) { const [a, b] = s.split('/').map(Number); return a / b; } return Number(s) || 0; };
const pbOf = (cr) => (cr < 5 ? 2 : cr < 9 ? 3 : cr < 13 ? 4 : cr < 17 ? 5 : cr < 21 ? 6 : cr < 25 ? 7 : cr < 29 ? 8 : 9);

// ---- 1. what is it ------------------------------------------------------------------------------
export function sniffKind(text) {
  const t = clean(text).trim();
  if (/^[[{]/.test(t)) { try { JSON.parse(t); return { kind: 'json', why: 'it is JSON' }; } catch { /* not JSON after all */ } }
  const count = (rx) => (t.match(rx) || []).length;
  const blocks = Math.min(count(/^\s*Armou?r Class\b/gim), count(/^\s*Hit Points\b/gim));
  const spells = count(/^\s*Casting Time\s*:/gim);
  const story = count(/\b(read aloud|the characters|the party|Dungeon Master|DM\b|chapter \d|part \d|encounter|adventure hook|quest)\b/gi);
  const places = count(/^\s*(?:[A-Z]?\d{1,2}[a-z]?\.|Area \d+)\s+[A-Z]/gm);
  if (t.length > 1500 && story >= 6 && (story + places * 2) * 1500 > t.length * (blocks + spells > 0 ? 0.6 : 0.3)) return { kind: 'campaign', why: `it reads like an adventure (${story} mentions of the party, encounters, chapters)` };
  if (blocks && blocks >= spells) return { kind: 'monsters', why: `${blocks} stat block${blocks > 1 ? 's' : ''} (Armor Class and Hit Points)` };
  if (spells) return { kind: 'spells', why: `${spells} spell${spells > 1 ? 's' : ''} (Casting Time)` };
  const opts = OPT.optionMarks(t);
  if (opts >= 3) return { kind: 'options', why: `${opts} character options (Ability Score Increase, Skill Proficiencies, feats)` };
  return { kind: 'rules', why: 'plain rules text' };
}

// ---- 2. the book reader: stat blocks -----------------------------------------------------------
// The standard 5e layout, as copied from a PDF or a web page: a name, "Medium fey, neutral evil", Armor
// Class, Hit Points, Speed, the six scores, the lines after them, then traits, Actions, Bonus Actions,
// Reactions and Legendary Actions, each entry "Name. What it does."
export function readStatBlocks(text, { prefix = '', taken = new Set() } = {}) {
  const L = clean(text).split('\n').map((x) => twice(x.trim())); // "ActionsActions": a heading drawn twice
  const starts = [];
  for (let i = 0; i < L.length; i++) {
    if (!new RegExp(`^(${SIZES})\\b[^,]*,`, 'i').test(L[i])) continue;
    let k = i - 1;
    while (k >= 0 && !L[k]) k--;
    if (k < 0 || L[k].length > 60 || /[.:]$/.test(L[k])) continue;
    if (L.slice(i, i + 6).some((x) => /^Armou?r Class\b/i.test(x))) starts.push({ name: k, size: i });
  }
  // A block also ends where something else begins: a spell ("Frost Lance / 2nd-level evocation /
  // Casting Time"), or a heading.
  const stops = [];
  for (let i = 1; i < L.length; i++) {
    if (/^(?:\d(?:st|nd|rd|th)[- ]level\s+\w+|\w+\s+cantrip)(\s*\(ritual\))?$/i.test(L[i]) && L.slice(i, i + 4).some((x) => /^Casting Time\s*:/i.test(x))) stops.push(i - 1);
    if (/^#{1,4}\s/.test(L[i])) stops.push(i);
    // The book's legal pages: a last stat block ran on into the Open Game License (Vault of the Runemark's
    // skeleton had "Product Identity" among its actions, 26 Nov).
    if (/^(?:OPEN GAME LICEN[CS]E\b|Open Game License Version\b|This (?:material|product) is (?:being )?released (?:using|under)|COPYRIGHT NOTICE\b|Legal (?:Text|Information)$)/i.test(L[i])) stops.push(i);
  }
  const monsters = [];
  const leftovers = [];
  starts.forEach((s, n) => {
    const end = Math.min(n + 1 < starts.length ? starts[n + 1].name : L.length, ...stops.filter((x) => x > s.size));
    const lines = L.slice(s.size, end).filter(Boolean);
    const m = statBlock(twice(L[s.name]), lines);
    if (!m) { leftovers.push([L[s.name], ...lines].join('\n')); return; }
    // The same creature twice (its page as text and as a picture, or an appendix repeating it): the fuller
    // reading is kept, once.
    const same = monsters.findIndex((x) => slug(x.name) === slug(m.name));
    m.words = [L[s.name], ...lines].join('\n');
    if (same >= 0) { if (fullness(m) > fullness(monsters[same])) { m.id = monsters[same].id; monsters[same] = m; } return; }
    m.id = uniqueId(slug(m.name), taken, prefix);
    monsters.push(m);
  });
  if (!starts.length && /Armou?r Class/i.test(text)) leftovers.push(clean(text));
  return { monsters, leftovers };
}
// "Dire WolfDire Wolf" (a heading drawn twice) is the Dire Wolf.
const twice = (t) => { const s = String(t || '').trim(); const n = s.length; return n >= 6 && n % 2 === 0 && s.slice(0, n / 2) === s.slice(n / 2) ? s.slice(0, n / 2).trim() : s; };
// How much of a stat block was read: its six scores, its actions and traits.
export const fullness = (m) => (m.ab && m.ab.some((v) => v !== 10) ? 10 : 0) + Math.min(6, (m.actions || []).length) * 4 + Math.min(4, (m.traits || []).length) + (m.hp ? 1 : 0);
// An id nobody has yet: the name's, then with the book's prefix, then numbered.
function uniqueId(id, taken, prefix) {
  let out = id;
  if (taken.has(out)) out = `${prefix || 'x'}-${id}`;
  for (let n = 2; taken.has(out); n++) out = `${prefix || 'x'}-${id}-${n}`;
  taken.add(out);
  return out;
}
// A saved adventure's monsters with one per id (the fullest), so the places' foes still find theirs.
export function oneById(list) {
  const by = new Map();
  for (const m of list || []) if (m && m.id && (!by.has(m.id) || fullness(m) > fullness(by.get(m.id)))) by.set(m.id, m);
  return [...by.values()];
}
// One of each creature, the fullest reading kept; ids made unique. A name read twice over ("WolfWolf") gives
// way to the clean one's id.
export function oneEach(list) {
  const by = new Map();
  for (const m of list || []) {
    const name = twice(m.name || m.id);
    const clean = name === String(m.name || '').trim();
    const k = slug(name);
    const had = by.get(k);
    if (!had) { by.set(k, { m: { ...m, name }, id: m.id, clean }); continue; }
    if (fullness(m) > fullness(had.m)) had.m = { ...m, name };
    if (!had.clean && clean) { had.id = m.id; had.clean = true; }
  }
  const seen = new Set();
  return [...by.values()].map(({ m, id }) => { let x = id; for (let n = 2; seen.has(x); n++) x = `${id}-${n}`; seen.add(x); return { ...m, id: x }; });
}

// "RUNE WRAITH" (a heading in capitals) is the Rune Wraith; a name as written otherwise stays as it is.
const titleCase = (t) => (/[a-z]/.test(t) || !/[A-Z]/.test(t) ? t : t.toLowerCase().replace(/(^|[\s(-])([a-z])/g, (m, a, b) => a + b.toUpperCase()));
function statBlock(name, lines) {
  const head = /^(Tiny|Small|Medium|Large|Huge|Gargantuan)\s+([^,(]+?)(?:\s*\(([^)]*)\))?\s*,\s*(.+)$/i.exec(lines[0]);
  if (!head) return null;
  const all = lines.join('\n');
  const grab = (rx) => { const x = rx.exec(all); return x ? x[1].trim() : ''; };
  const ac = /Armou?r Class\s+(\d+)(?:\s*\(([^)]*)\))?/i.exec(all);
  const hp = /Hit Points\s+(\d+)(?:\s*\(([^)]*)\))?/i.exec(all);
  if (!ac || !hp) return null;
  // The six scores: "16 (+3) 12 (+1) ..." after STR DEX CON..., on one line or six.
  const scoreStart = all.search(/\bSTR\b/);
  // A score that disagrees with its modifier was misread ("2 (-1)" for 9, by a text reader): the modifier wins.
  const scores = [...all.slice(Math.max(0, scoreStart)).matchAll(/(\d{1,2})\s*\(\s*([+\-–−]?)\s*(\d{1,2})\s*\)?/g)].slice(0, 6).map((x) => {
    const s = Number(x[1]);
    if (!x[2]) return s;
    const mod = (x[2] === '+' ? 1 : -1) * Number(x[3]);
    return Math.floor((s - 10) / 2) === mod ? s : 10 + 2 * mod;
  });
  const crm = /Challenge\s+([\d/]+)(?:\s*\(([\d,]+)\s*XP\))?/i.exec(all);
  const cr = crm ? crNum(crm[1]) : 0;
  const pbm = /Proficiency Bonus\s*\+?(\d+)/i.exec(all);
  const listOf = (label) => grab(new RegExp(`^${label}\\s+(.+)$`, 'im')).split(/[;,]\s*/).map((x) => x.trim().toLowerCase()).filter(Boolean);
  const bonuses = (label) => Object.fromEntries(grab(new RegExp(`^${label}\\s+(.+)$`, 'im')).split(/,\s*/).map((x) => /^([A-Za-z ]+?)\s*([+-]\d+)/.exec(x.trim())).filter(Boolean).map((x) => [x[1].trim(), Number(x[2])]));
  const saves = Object.fromEntries(Object.entries(bonuses('Saving Throws')).map(([k, v]) => [k.slice(0, 3).toLowerCase(), v]).filter(([k]) => ABS.includes(k)));
  // Sections: traits first, then each heading's entries.
  const out = {
    name: titleCase(name.replace(/\s+/g, ' ').trim()), size: head[1][0].toUpperCase() + head[1].slice(1).toLowerCase(), type: head[2].trim().toLowerCase(), sub: (head[3] || '').trim(),
    align: head[4].trim(), ac: Number(ac[1]), acNote: (ac[2] || '').trim(), hp: Number(hp[1]), hd: (hp[2] || '').replace(/\s+/g, ''),
    speed: grab(/^Speed\s+(.+)$/im), ab: scores.length === 6 ? scores : [10, 10, 10, 10, 10, 10], saves, skills: bonuses('Skills'),
    vuln: listOf('Damage Vulnerabilities'), res: listOf('Damage Resistances'), imm: listOf('Damage Immunities'), cimm: listOf('Condition Immunities'),
    senses: grab(/^Senses\s+(.+)$/im), lang: grab(/^Languages\s+(.+)$/im) || '-', cr, xp: crm && crm[2] ? Number(crm[2].replace(/,/g, '')) : CR_XP[cr] || 0, pb: pbm ? Number(pbm[1]) : pbOf(cr),
    traits: [], actions: [],
  };
  const statLine = /^(Armou?r Class|Hit Points|Speed|STR\b|DEX\b|CON\b|INT\b|WIS\b|CHA\b|Saving Throws|Skills|Damage|Condition Immunities|Senses|Languages|Challenge|Proficiency Bonus|\d{1,2}\s*\()/i;
  const HEAD = /^(Actions|Bonus Actions|Reactions|Legendary Actions|Mythic Actions|Lair Actions)[^A-Za-z]*$/i; // "ACTIONS ~~~ 0": a text reader's specks after it
  let sec = 'traits';
  let cur = null;
  let pastStats = false;
  for (const line of lines.slice(1)) {
    // A page's furniture inside a block that runs on over the page: its footer, its number, its marker.
    if (/^(?:Not for resale|Permission (?:is )?granted to|Copyright\b|©)|^--- Page \d+ ---$|^\d{1,3}$/i.test(line)) { cur = null; continue; }
    if (/^\[[^\]]*\bpicture \d+\b[^\]]*\]$/.test(line)) break; // the words of a picture follow: another source
    if (!pastStats) { if (/^Challenge\b|^Proficiency Bonus\b/i.test(line)) { pastStats = true; continue; } if (statLine.test(line)) continue; }
    const h = HEAD.exec(line);
    if (h) {
      const w = h[1].toLowerCase();
      sec = w.startsWith('bonus') ? 'actions' : w.startsWith('reaction') ? 'reactions' : w.startsWith('legendary') || w.startsWith('mythic') ? 'legendary' : w.startsWith('lair') ? 'lair' : 'actions';
      cur = null;
      pastStats = true;
      continue;
    }
    // "Claw. Melee Weapon Attack..." or "Fire Breath (Recharge 5-6). ..." starts an entry; anything else continues one.
    const e = /^([A-Z][\w'’ ,/-]{0,50}?(?:\s*\([^)]{1,40}\))?)\.\s+(.+)$/.exec(line);
    if (e && e[1].split(/\s+/).length <= 8 && !/^(Hit|Each|The|If|On|At|When|This|It|A|An)$/.test(e[1])) {
      pastStats = true;
      if (sec === 'lair') continue;
      const use = /\((Recharge [\d-]+|Recharges after [^)]*|\d+\/Day(?: each)?|Costs \d+ Actions)\)/i.exec(e[1]);
      cur = { n: e[1].replace(/\s*\((?:Recharge|Recharges|\d+\/Day|Costs)[^)]*\)/i, '').trim(), d: e[2].trim() };
      if (use) cur.use = use[1].replace(/Day/i, 'day').replace(/Recharge (\d)-6/i, 'Recharge $1-6');
      if (/Spellcasting/i.test(cur.n) && use && !/Recharge/i.test(use[1])) cur.n = `${cur.n} (${use[1]})`;
      // "Breath Weapons (Recharge 5-6). The dragon uses one of the following breath weapons." The options
      // that follow are actions of their own, sharing its recharge.
      const prev = (out[sec] || []).slice().reverse().find((x) => /one of the following/i.test(x.d) && !x.of);
      if (prev && !cur.use && /one of the following/i.test(prev.d) && (out[sec] || []).indexOf(prev) >= (out[sec] || []).length - 3) { cur.of = prev.n; if (prev.use) cur.use = prev.use; }
      (out[sec] = out[sec] || []).push(cur);
    } else if (cur) {
      cur.d += /^(?:-|•|Cantrips|\d(?:st|nd|rd|th) level|At will|\d+\/day)/i.test(line) ? `\n${line.replace(/^[•-]\s*/, '')}` : ` ${line}`;
    } else if (sec === 'legendary' && !cur) {
      // the paragraph before the legendary options
    }
  }
  if (out.legendary && !out.legendary.length) delete out.legendary;
  return out;
}

// ---- the book reader: spells -------------------------------------------------------------------
// "Frost Lance / 2nd-level evocation / Casting Time: 1 action / Range / Components / Duration / words /
// At Higher Levels. ..."
export function readSpells(text, { prefix = '', taken = new Set() } = {}) {
  const L = clean(text).split('\n').map((x) => x.trim());
  const LEVEL = /^(?:(\d)(?:st|nd|rd|th)[- ]level\s+(\w+)|(\w+)\s+cantrip)(\s*\(ritual\))?\s*$/i;
  const starts = [];
  for (let i = 1; i < L.length; i++) if (LEVEL.test(L[i]) && L[i - 1] && L.slice(i, i + 4).some((x) => /^Casting Time\s*:/i.test(x))) starts.push(i - 1);
  const spells = [];
  starts.forEach((s, n) => {
    const lines = L.slice(s, n + 1 < starts.length ? starts[n + 1] : L.length);
    const lv = LEVEL.exec(lines[1]);
    const get = (label) => { const x = lines.find((y) => new RegExp(`^${label}\\s*:`, 'i').test(y)); return x ? x.replace(/^[^:]*:\s*/, '').trim() : ''; };
    const body = lines.slice(2).filter((x) => x && !/^(Casting Time|Range|Components|Duration|Classes)\s*:/i.test(x));
    const words = body.join('\n');
    const hi = words.search(/At Higher Levels\.?/i);
    const comp = get('Components');
    const dur = get('Duration');
    let id = slug(lines[0]);
    if (taken.has(id)) id = `${prefix || 'x'}-${id}`;
    taken.add(id);
    spells.push({
      id, name: lines[0], level: lv[1] ? Number(lv[1]) : 0, school: (lv[2] || lv[3] || '').replace(/^\w/, (c) => c.toUpperCase()),
      time: get('Casting Time'), range: get('Range'), comp: (comp.match(/\b[VSM]\b/g) || []).join(''), mat: (/\(([^)]*)\)/.exec(comp) || [0, ''])[1],
      dur: dur.replace(/^Concentration,\s*/i, '').replace(/^up to/i, 'Up to'), conc: /concentration/i.test(dur), ritual: !!lv[4],
      classes: get('Classes').split(/,\s*/).map((x) => x.toLowerCase()).filter(Boolean),
      desc: (hi >= 0 ? words.slice(0, hi) : words).replace(/\n(?=[a-z])/g, ' ').trim(), higher: hi >= 0 ? words.slice(hi).replace(/^At Higher Levels\.?\s*/i, '').trim() : '',
      words: lines.join('\n'),
    });
  });
  return { spells, leftovers: [] };
}

// ---- the book reader: rules text ---------------------------------------------------------------
// Sections by their headings ("# Combat", "CHAPTER 9: COMBAT", a short Title Case line on its own), for
// the Director's look_up_rules, cited by book.
export function readRules(text, book) {
  const L = clean(text).split('\n');
  const out = [];
  let cur = null;
  const push = () => {
    if (!cur) return;
    const t = cur.lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
    if (t.length < 40) return;
    for (let k = 0, part = 0; k < t.length; k += 2400, part++) out.push({ id: `${slug(book)}-${out.length + 1}`, name: `${cur.name}${part ? ` (${part + 1})` : ''}`, book, page: 0, text: t.slice(k, k + 2600) });
  };
  const isHead = (line, next) => {
    const s = line.trim();
    if (/^#{1,4}\s+\S/.test(s)) return s.replace(/^#+\s*/, '');
    if (s.length < 3 || s.length > 60 || /[.,;:!?]$/.test(s) || /^\d+$/.test(s)) return '';
    const words = s.split(/\s+/);
    const caps = words.filter((w) => /^[A-Z0-9(]/.test(w)).length;
    if ((s === s.toUpperCase() && /[A-Z]{3}/.test(s)) || (caps >= Math.ceil(words.length * 0.7) && words.length <= 8 && next && next.trim().length > 60)) return s;
    return '';
  };
  L.forEach((line, i) => {
    const h = isHead(line, L[i + 1]);
    if (h) { push(); cur = { name: h.replace(/\b\w+/g, (w) => (w === w.toUpperCase() && w.length > 3 ? w[0] + w.slice(1).toLowerCase() : w)), lines: [] }; return; }
    if (!cur) cur = { name: book, lines: [] };
    cur.lines.push(line);
  });
  push();
  return out;
}

// ---- engine-ready JSON ---------------------------------------------------------------------------
// A book in the SRD's shape ({ spells, monsters, rules }), a list of monsters or spells, or an adventure.
export function readJson(text) {
  const x = JSON.parse(clean(text).trim());
  if (Array.isArray(x)) {
    if (x.every((e) => e && (e.ac != null || e.actions))) return { monsters: x };
    if (x.every((e) => e && (e.level != null && (e.school || e.time)))) return { spells: x };
    return { rules: x.filter((e) => e && e.text) };
  }
  if (x && x.sites) return { adventure: x };
  return { spells: x.spells || [], monsters: x.monsters || [], rules: x.rules || [], magicItems: x.magicItems || [] };
}

// ---- 4. the engine version and what to show -------------------------------------------------------
const ord = (n) => (n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`);
function monsterFacts(m) {
  const cr = m.cr === 0.125 ? '1/8' : m.cr === 0.25 ? '1/4' : m.cr === 0.5 ? '1/2' : m.cr;
  const f = [`AC ${m.ac}${m.acNote ? ` (${m.acNote})` : ''}, ${m.hp} hp${m.hd ? ` (${m.hd})` : ''}, speed ${m.speed || '?'}, CR ${cr} (${m.xp} XP)`,
    ABS.map((a, k) => `${a.toUpperCase()} ${m.ab[k]}`).join(' ')];
  for (const sec of ['traits', 'actions', 'reactions', 'legendary']) {
    for (const a of m[sec] || []) {
      if (a.multi) { f.push(`${a.n}: ${a.multi.map((c) => Object.entries(c).map(([k, v]) => `${v} × ${k}`).join(', ')).join(', or ')}`); continue; }
      if (a.spells) { f.push(`${a.n}: ${a.spells.dc ? `save DC ${a.spells.dc}, ` : ''}${a.spells.hit ? `+${a.spells.hit} to hit, ` : ''}${a.spells.list.map((x) => x.name).join(', ')}`); continue; }
      const bits = [];
      if (a.hit != null) bits.push(`${a.hit >= 0 ? '+' : ''}${a.hit} to hit${a.reach ? `, reach ${a.reach} ft` : a.range ? `, range ${a.range} ft` : ''}`);
      if (a.dmg) bits.push(a.dmg.map(([d, t]) => `${d} ${t}`).join(' + '));
      if (a.dc) bits.push(`DC ${a.dc[1]} ${ABN[a.dc[0]] || a.dc[0]} save${a.dc[2] === 'half' ? ', half on a success' : ''}${a.cond ? `, or ${a.cond}` : ''}`);
      if (a.rider) bits.push(`then DC ${a.rider.dc} ${ABN[a.rider.ability] || a.rider.ability} save${a.rider.cond ? ` or ${a.rider.cond}` : ''}${a.rider.dmg.length ? ` (${a.rider.dmg.map(([d, t]) => `${d} ${t}`).join(' + ')}${a.rider.half ? ', half on a success' : ''})` : ''}`);
      if (a.onHit) bits.push(`on a hit: ${a.onHit.join(', ')}${a.escape ? ` (escape DC ${a.escape})` : ''}`);
      if (a.use) bits.push(a.use);
      if (bits.length) f.push(`${a.n}: ${bits.join('; ')}`);
    }
  }
  return f;
}
function spellFacts(s) {
  const f = [`${s.level ? `${ord(s.level)}-level` : 'cantrip'} ${String(s.school || '').toLowerCase()}, ${s.time || '?'}, ${s.range || '?'}${s.conc ? ', concentration' : ''}`];
  const dmg = s.dmgSlot ? s.dmgSlot[s.level] : s.dmgLevel ? s.dmgLevel[1] : '';
  if (dmg) f.push(`${dmg.replace('+MOD', ' + modifier')} ${s.dmgType === 'chosen' ? (s.dmgTypes || []).join('/') || 'chosen' : s.dmgType}${s.count ? ` × ${s.count[s.level]}` : s.countLevel ? ' × beams by level' : ''}${s.dmgSlot && s.dmgSlot[9] !== dmg ? `, ${s.dmgSlot[9]} at 9th` : ''}${s.dmgLevel && s.dmgLevel[17] ? `, ${s.dmgLevel[17]} at 17th` : ''}`);
  if (s.how) f.push(`lands by: ${s.how}${s.attack ? ` (${s.attack} spell attack)` : ''}${s.save ? ` (${ABN[s.save.ability] || s.save.ability} save${s.save.success === 'half' ? ', half on a success' : ''})` : ''}`);
  else if (s.save) f.push(`${ABN[s.save.ability]} save`);
  if (s.heal) f.push(`heals ${String(s.heal[s.level] || '').replace('+MOD', ' + modifier')}`);
  if (s.conds) f.push(`conditions: ${s.conds.join(', ')}`);
  return f;
}

// The engine version of what was read, and a line per entry for the screen.
const raceFacts = (r) => [Object.entries(r.bonus || {}).map(([a, n]) => `${a.toUpperCase()} +${n}`).join(', ') + (r.bonusChoice ? `${Object.keys(r.bonus || {}).length ? ', ' : ''}+1 to ${r.bonusChoice} of choice` : '') || 'no ability increase found',
  ...(r.speed ? [`${r.size}, speed ${r.speed} ft.`] : []), `${(r.traits || []).length} trait${(r.traits || []).length === 1 ? '' : 's'}: ${(r.traits || []).map((t) => t.name).join(', ') || 'none'}`];
export function summarise(book) {
  const eng = JSON.parse(JSON.stringify({ spells: book.spells || [], monsters: book.monsters || [], magicItems: book.magicItems || [] }));
  for (const x of [...eng.spells, ...eng.monsters]) delete x.words;
  const gaps = BOOK.compileBook(eng);
  const gapsOf = (id) => gaps.filter((g) => g.id === id).map((g) => g.what);
  const entries = [];
  (book.monsters || []).forEach((m, k) => {
    const e = eng.monsters[k];
    const warn = [];
    if (e.ab.every((v) => v === 10)) warn.push('its six ability scores were not found');
    if (!e.actions.length) warn.push('it has no actions');
    entries.push({ kind: 'monster', id: e.id, name: e.name, facts: monsterFacts(e), gaps: [...warn, ...gapsOf(e.id)], words: m.words || '' });
  });
  (book.spells || []).forEach((s, k) => {
    const e = eng.spells[k];
    entries.push({ kind: 'spell', id: e.id, name: e.name, facts: spellFacts(e), gaps: gapsOf(e.id), words: s.words || `${s.desc}${s.higher ? `\nAt Higher Levels. ${s.higher}` : ''}` });
  });
  for (const r of book.races || []) entries.push({ kind: 'race', id: r.id, name: r.name, facts: raceFacts(r), gaps: [], words: r.traits.map((x) => `${x.name}. ${x.desc}`).join('\n') });
  for (const r of book.subraces || []) entries.push({ kind: 'subrace', id: r.id, name: r.name, facts: [`a subrace of ${r.race}`, ...raceFacts(r)], gaps: [], words: r.traits.map((x) => `${x.name}. ${x.desc}`).join('\n') });
  for (const b of book.backgrounds || []) entries.push({ kind: 'background', id: b.id, name: b.name, facts: [`skills: ${b.skills.join(', ') || 'none found'}`, `tools: ${b.tools}`, `${b.languages} language${b.languages === 1 ? '' : 's'} of choice`, `${b.gold} gp`], gaps: b.skills.length < 2 ? ['fewer than two skills were found'] : [], words: `${b.feature.name ? `Feature: ${b.feature.name}. ${b.feature.desc}\n` : ''}Equipment: ${b.kitText}` });
  for (const sc of book.subclasses || []) entries.push({ kind: 'subclass', id: sc.id, name: sc.name, facts: [`${sc.flavor || 'subclass'} of the ${sc.cls}`, ...sc.levels.map((l) => `level ${l.level}: ${l.features.join(', ')}`)], gaps: sc.levels.length < 2 ? ['only one level of features was found'] : [], words: Object.entries(sc.features || {}).map(([k, v]) => `${k}. ${v}`).join('\n').slice(0, 1500) });
  for (const f of book.feats || []) entries.push({ kind: 'feat', id: f.id, name: f.name, facts: f.prereq ? [`prerequisite: ${f.prereq}`] : ['no prerequisite'], gaps: f.desc.length < 40 ? ['its words look cut short'] : [], words: f.desc });
  for (const r of book.rules || []) entries.push({ kind: 'rule', id: r.id, name: r.name, facts: [`${r.text.split(/\s+/).length} words, for the Director's rules look-ups`], gaps: [], words: r.text.slice(0, 1500) });
  return { engine: { ...eng, rules: book.rules || [], races: book.races || [], subraces: book.subraces || [], backgrounds: book.backgrounds || [], feats: book.feats || [], subclasses: book.subclasses || [] }, gaps, entries };
}

// ---- 3. the AI: what the reader could not read, and whole campaigns ----------------------------------
export function parseJson(text) {
  const t = String(text || '');
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(t);
  const body = fence ? fence[1] : t;
  const a = body.search(/[[{]/);
  const close = body[a] === '[' ? ']' : '}';
  const b = body.lastIndexOf(close);
  if (a < 0 || b <= a) throw new Error('The AI answered without the JSON asked for.');
  const raw = body.slice(a, b + 1);
  try { return JSON.parse(raw); } catch { return JSON.parse(raw.replace(/\/\/[^\n"]*$/gm, '').replace(/,\s*([}\]])/g, '$1')); }
}
// Pieces of about `size` characters, cut between paragraphs.
export function chunks(text, size = 18000) {
  const out = [];
  let cur = '';
  for (const p of clean(text).split(/\n{2,}/)) {
    if (cur && cur.length + p.length > size) { out.push(cur); cur = ''; }
    cur += (cur ? '\n\n' : '') + (p.length > size ? p.slice(0, size) : p);
  }
  if (cur.trim()) out.push(cur);
  return out;
}

const MONSTER_SHAPE = '{"name":"Bog Hag","size":"Medium","type":"fey","sub":"","align":"neutral evil","ac":16,"acNote":"natural armor","hp":60,"hd":"11d8+11","speed":"30 ft., swim 30 ft.","ab":[16,12,13,12,14,13],"saves":{"wis":4},"skills":{"Stealth":3},"vuln":[],"res":[],"imm":[],"cimm":[],"senses":"darkvision 60 ft., passive Perception 12","lang":"Common, Sylvan","cr":3,"xp":700,"traits":[{"n":"Amphibious","d":"The hag can breathe air and water."}],"actions":[{"n":"Multiattack","d":"The hag makes two claw attacks."},{"n":"Claw","d":"Melee Weapon Attack: +5 to hit, reach 5 ft., one target. Hit: 7 (1d8 + 3) slashing damage."},{"n":"Fetid Breath","use":"Recharge 5-6","d":"The hag exhales in a 15-foot cone. Each creature in it must make a DC 12 Constitution saving throw, taking 14 (4d6) poison damage on a failed save, or half as much damage on a successful one."}]}';
const SPELL_SHAPE = '{"name":"Frost Lance","level":2,"school":"Evocation","time":"1 action","range":"90 feet","comp":"VS","mat":"","dur":"Instantaneous","conc":false,"ritual":false,"classes":["wizard"],"desc":"Make a ranged spell attack against a creature within range. On a hit, the target takes 3d8 cold damage.","higher":"When you cast this spell using a spell slot of 3rd level or higher, the damage increases by 1d8 for each slot level above 2nd."}';

// Stat blocks or spells in a layout the reader does not know: the AI writes them in the SRD's shape, keeping
// every rule in the words ("d"), which the book compiler then reads like any other.
export async function aiReadEntries({ ask, kind, text, prefix = '', taken = new Set(), onProgress = () => {} }) {
  const shape = kind === 'spells' ? SPELL_SHAPE : MONSTER_SHAPE;
  const what = kind === 'spells' ? 'spell' : 'monster stat block';
  const system = `You turn tabletop role-playing text into data for a Dungeons & Dragons 5e rules engine. Answer only with a JSON array, no other words. Each ${what} becomes one object in exactly this shape:\n${shape}\nKeep every rule in the words: each trait, action and reaction keeps its full text in "d", in the standard 5e wording ("Melee Weapon Attack: +5 to hit, reach 5 ft., one target. Hit: 7 (1d8 + 3) slashing damage."), because the engine reads its numbers from those words. Copy numbers exactly; never invent anything the text does not give.`;
  const parts = chunks(text, 9000);
  const out = [];
  const problems = [];
  for (let i = 0; i < parts.length; i++) {
    onProgress({ step: `Reading ${kind} with the AI`, at: i + 1, of: parts.length });
    try {
      const reply = parseJson(await ask(system, `Turn every ${what} in this text into the JSON array:\n\n${parts[i]}`));
      for (const e of Array.isArray(reply) ? reply : [reply]) {
        if (!e || !e.name) continue;
        let id = slug(e.name);
        if (taken.has(id)) id = `${prefix || 'x'}-${id}`;
        taken.add(id);
        if (kind === 'spells') out.push({ id, ...e, level: Number(e.level) || 0, classes: e.classes || [], words: '' });
        else out.push({ id, ...e, ab: Array.isArray(e.ab) && e.ab.length === 6 ? e.ab.map(Number) : [10, 10, 10, 10, 10, 10], cr: crNum(e.cr), xp: Number(e.xp) || CR_XP[crNum(e.cr)] || 0, pb: pbOf(crNum(e.cr)), traits: e.traits || [], actions: e.actions || [], words: '' });
      }
    } catch (e) { problems.push(`Part ${i + 1}: ${e.message}`); }
  }
  return { entries: out, problems };
}

// Character options in a layout the reader does not know (a homebrew page, a web copy with no headings): the
// AI writes them in the SRD's shapes, the same ones the reader makes, so they merge the same way.
const OPTIONS_SHAPE = '{"races":[{"name":"Mossfolk","speed":25,"size":"Small","bonus":{"wis":2},"bonusChoice":0,"languages":["Common","Sylvan"],"traits":[{"name":"Bog Stride","desc":"Difficult terrain of mud or shallow water costs you no extra movement."}]}],"subraces":[{"race":"mossfolk","name":"Deep Moss","bonus":{"con":1},"traits":[{"name":"Spongy Hide","desc":"You have resistance to poison damage."}]}],"backgrounds":[{"name":"Bog Warden","skills":["survival","nature"],"tools":"Herbalism kit","languages":1,"gold":12,"kitText":"A pole, a lantern, common clothes and a pouch with 12 gp","feature":{"name":"Paths of the Fen","desc":"You always know a safe path through a marsh."}}],"feats":[{"name":"Bogborn","prereq":"","desc":"You gain the following benefits:\\n- Increase your Constitution score by 1.\\n- You can hold your breath for an hour."}],"subclasses":[{"cls":"druid","name":"Circle of Spores","flavor":"Druid Circle","desc":"Druids who find beauty in decay.","features":[{"name":"Halo of Spores","level":2,"desc":"You are surrounded by necrotic spores..."}]}]}';
export async function aiReadOptions({ ask, text, onProgress = () => {} }) {
  const system = `You turn tabletop role-playing text into data for a Dungeons & Dragons 5e rules engine. Answer only with one JSON object, no other words, in exactly this shape (leave out any list with nothing in it):\n${OPTIONS_SHAPE}\nRaces and subraces are what a player is born as; backgrounds what they did before; feats what they can take in place of an ability increase; subclasses the paths a class chooses (cls is the class's id: barbarian, bard, cleric, druid, fighter, monk, paladin, ranger, rogue, sorcerer, warlock or wizard), each feature with the class level it comes at. Abilities are str, dex, con, int, wis, cha; skills are lower case with dashes (sleight-of-hand). Keep each rule's full words; copy numbers exactly; never invent anything the text does not give.`;
  const out = { races: [], subraces: [], backgrounds: [], feats: [], subclasses: [] };
  const problems = [];
  const parts = chunks(text, 9000);
  for (let i = 0; i < parts.length; i++) {
    onProgress({ step: 'Reading character options with the AI', at: i + 1, of: parts.length });
    try {
      const r = parseJson(await ask(system, `Turn every race, subrace, background, feat and subclass in this text into the JSON object:\n\n${parts[i]}`)) || {};
      for (const x of r.races || []) if (x && x.name) out.races.push({ id: slug(x.name), name: x.name, speed: Number(x.speed) || 30, size: x.size || 'Medium', bonus: x.bonus || {}, bonusChoice: Number(x.bonusChoice) || 0, languages: x.languages || ['Common'], langDesc: '', age: '', alignment: '', sizeDesc: '', traits: (x.traits || []).filter((y) => y && y.name), subraces: [] });
      for (const x of r.subraces || []) if (x && x.name && x.race) out.subraces.push({ race: slug(x.race), id: slug(x.name), name: x.name, desc: x.desc || '', bonus: x.bonus || {}, traits: (x.traits || []).filter((y) => y && y.name) });
      for (const x of r.backgrounds || []) if (x && x.name) out.backgrounds.push({ id: slug(x.name), name: x.name, skills: (x.skills || []).map((k) => slug(k)), tools: x.tools || 'None', languages: Number(x.languages) || 0, gold: Number(x.gold) || 0, items: [], kitText: x.kitText || '', feature: x.feature && x.feature.name ? x.feature : { name: '', desc: '' } });
      for (const x of r.feats || []) if (x && x.name) out.feats.push({ id: slug(x.name), name: x.name, ...(x.prereq ? { prereq: x.prereq } : {}), desc: String(x.desc || '') });
      for (const x of r.subclasses || []) {
        const feats = (x && x.features || []).filter((f) => f && f.name && Number(f.level));
        if (!x || !x.name || !x.cls || !feats.length) continue;
        const levels = [...new Set(feats.map((f) => Number(f.level)))].sort((a, b) => a - b).map((lv) => ({ level: lv, features: feats.filter((f) => Number(f.level) === lv).map((f) => f.name) }));
        out.subclasses.push({ cls: slug(x.cls), id: slug(x.name), name: x.name, flavor: x.flavor || '', desc: x.desc || '', levels, features: Object.fromEntries(feats.map((f) => [f.name, String(f.desc || '')])) });
      }
    } catch (e) { problems.push(`Part ${i + 1}: ${e.message}`); }
  }
  return { options: out, problems };
}

// A whole campaign, as an adventure for the Director, in steps a small local model can take:
// what is in each part of the text; the adventure's frame; each place in full; the campaign's own stat
// blocks read by the book reader; then the adventure checker, and its problems sent back once.
export const CAMPAIGN_GUIDE = (() => {
  const t = readFileSync(new URL('../docs/CONVERTER-PROMPT.md', import.meta.url), 'utf8');
  const i = t.indexOf('\n---\n');
  return (i >= 0 ? t.slice(i + 5) : t).trim();
})();
const NO_TALK = 'This time do not show an outline, ask questions or write JavaScript: answer only with the JSON asked for, no other words. Where the source leaves something open, choose what fits and say so in the notes.';

export async function aiCampaign({ ask, text, name = '', srd, onProgress = () => {} }) {
  const parts = chunks(text, 16000);
  const system = `${CAMPAIGN_GUIDE}\n\n${NO_TALK}`;
  // The campaign's own stat blocks: the book reader first, the AI for those it cannot read.
  const prefix = slug(name || 'adv').split('-').map((w) => w[0]).join('').slice(0, 4) || 'adv';
  const srdIds = new Set((srd.monsters || []).map((m) => m.id));
  // Stat blocks the reader cannot read, or reads without their scores or actions (one read from a picture
  // with slips in it), go to the AI, so every monster the campaign fights with comes with its numbers.
  const sb = readStatBlocks(text, { prefix, taken: new Set(srdIds) });
  const weak = (m) => m.ab.every((v) => v === 10) || !(m.actions || []).length;
  const read = sb.monsters.filter((m) => !weak(m)).map(({ words, ...m }) => m);
  const again = [...sb.leftovers, ...sb.monsters.filter(weak).map((m) => m.words)];
  if (again.length) {
    let got = [];
    try { got = (await aiReadEntries({ ask, kind: 'monsters', text: again.join('\n\n'), prefix, taken: new Set([...srdIds, ...read.map((m) => m.id)]), onProgress })).entries.map(({ words, ...m }) => m); } catch { /* kept as the reader read them */ }
    read.push(...got);
    for (const m of sb.monsters.filter(weak)) if (!got.some((g) => slug(g.name) === slug(m.name))) { const { words, ...x } = m; read.push(x); }
  }
  const own = oneEach(read.map((m) => ({ ...m, id: srdIds.has(m.id) ? `${prefix}-${m.id}` : m.id.startsWith(`${prefix}-`) ? m.id : `${prefix}-${m.id}` })));
  const wordsOf = new Map(sb.monsters.map((m) => [slug(m.name), m.words]));
  // 1. what each part holds
  const found = { places: [], people: [], monsters: [], quests: [] };
  for (let i = 0; i < parts.length; i++) {
    onProgress({ step: 'Reading the campaign', at: i + 1, of: parts.length });
    try {
      const r = parseJson(await ask(system, `Part ${i + 1} of ${parts.length} of the source. List what it holds, as JSON {"places":[{"name":"","summary":""}],"people":[{"name":"","who":""}],"monsters":[{"name":"","srd":"the SRD id if one fits, else empty"}],"quests":[""]}.\n\n${parts[i]}`));
      for (const k of Object.keys(found)) for (const x of r[k] || []) { const key = typeof x === 'string' ? x : x.name; if (key && !found[k].some((y) => (typeof y === 'string' ? y : y.name) === key)) found[k].push(x); }
    } catch (e) { /* a part the model could not list: the places step still sees the whole list so far */ }
  }
  // 2. the frame
  onProgress({ step: 'Writing the adventure\'s frame', at: 1, of: 1 });
  const ownList = own.map((m) => `${m.id} (${m.name}, CR ${m.cr})`).join(', ') || 'none';
  const frame = parseJson(await ask(system, `What the whole source holds:\n${JSON.stringify(found)}\n\nThe campaign's own monsters (use these ids): ${ownList}. Other monsters: 5e SRD ids, lower case with hyphens (goblin, giant-rat, cult-fanatic).\n\nWrite the adventure's frame as JSON: {"id":"lower-case-id","name":"","levels":"1 to 3","party":{"size":[4,5],"level":1},"blurb":"","intro":"","director":"","quests":[""],"questDone":[{"match":"","at":["site-id"],"when":""}],"sites":[{"id":"","name":"","region":"","level":1,"travelHours":1,"exits":[{"to":"site-id","label":""}]}],"ending":""}. One site per place the party can stand; every exit names another site's id.\n\nThe start of the source:\n${parts[0].slice(0, 8000)}`));
  const adv = { ...frame, id: slug(frame.id || frame.name || name), name: frame.name || name || 'A converted adventure', monsters: own, sites: [] };
  // 3. each place, from the parts that mention it
  const sites = frame.sites || [];
  for (let i = 0; i < sites.length; i++) {
    const s = sites[i];
    onProgress({ step: `Writing the places (${s.name || s.id})`, at: i + 1, of: sites.length });
    const words = String(s.name || '').toLowerCase().split(/\W+/).filter((w) => w.length > 3);
    const where = parts.filter((p) => words.some((w) => p.toLowerCase().includes(w))).slice(0, 2).join('\n\n...\n\n') || parts[0];
    try {
      const full = parseJson(await ask(system, `The adventure: ${adv.name}. Its places: ${sites.map((x) => `${x.id} (${x.name})`).join(', ')}. The campaign's own monsters: ${ownList}.\n\nWrite the whole site "${s.id}" (${s.name}) as JSON in the format: {"id":"${s.id}","name":"","region":"","level":${s.level || 1},"travelHours":${s.travelHours || 1},"read":"","notes":"","npcs":[{"name":"","who":"","voice":"","wants":""}],"checks":[{"skill":"perception","dc":12,"find":""}],"foes":[{"monster":"srd-or-own-id","count":1,"name":"","note":""}],"clocks":[],"rules":[{"id":"","when":"","do":""}],"treasure":"","exits":${JSON.stringify(s.exits || [])}}. Leave out what the place does not have.\n\nThe source, where it describes this place:\n${where}`));
      adv.sites.push({ ...s, ...full, id: s.id, exits: full.exits || s.exits || [] });
    } catch (e) { adv.sites.push({ ...s, read: '', notes: `Not converted: ${e.message}`, exits: s.exits || [] }); }
  }
  // 4. the checker, and its problems sent back once, place by place
  const book = { ...srd, monsters: [...(srd.monsters || []), ...own] };
  fixQuestDone(adv);
  let check = checkAdventure(adv, book);
  const bySite = {};
  // A rule's problem is reported under "rules" as "<site>: rule <id>: ...": it goes back with its place too.
  for (const e of check.errors) { const id = (ruleProblem(e) || {}).site || (/^([a-z0-9-]+)/.exec(e.where) || [])[1]; if (adv.sites.some((s) => s.id === id)) (bySite[id] = bySite[id] || []).push(e.text); }
  const fix = Object.entries(bySite);
  for (let i = 0; i < fix.length; i++) {
    const [id, problems] = fix[i];
    onProgress({ step: 'Fixing what the checker found', at: i + 1, of: fix.length });
    const k = adv.sites.findIndex((s) => s.id === id);
    try {
      const again = parseJson(await ask(system, `The adventure checker found these problems in the site "${id}":\n- ${problems.join('\n- ')}\nThe places: ${adv.sites.map((x) => x.id).join(', ')}. The campaign's own monsters: ${ownList}.\nSend the whole site again as JSON, fixed:\n${JSON.stringify(adv.sites[k])}`));
      adv.sites[k] = { ...adv.sites[k], ...again, id };
    } catch { /* kept as it was: the checker's findings are shown */ }
  }
  check = checkAdventure(adv, book);
  // What the AI could not make into a rule the Engine runs stays in the story, as a note for the Director.
  const moved = rulesToNotes(adv, check);
  if (moved) check = checkAdventure(adv, book);
  // The campaign's own monsters as the screen shows a book's: each with its words beside what the Engine uses.
  const entries = summarise({ monsters: (adv.monsters || []).map((m) => ({ ...m, words: wordsOf.get(slug(m.name)) || '' })), spells: [], rules: [] }).entries;
  return { adventure: adv, check, entries, moved };
}

// "beach: rule alarm-stealth: ..." -> { site: 'beach', id: 'alarm-stealth' } (an adventure-wide rule has no site).
export function ruleProblem(e) {
  const m = /^(?:([a-z0-9-]+): )?rule ([^:]+?): /.exec(String((e && e.text) || ''));
  return e && e.where === 'rules' && m ? { site: m[1] || '', id: m[2] } : null;
}
// A rule the Engine cannot run (a time of day, "damage taken", any check) is not lost: it moves into its
// place's notes, in words, for the Director. Returns how many moved.
export function rulesToNotes(adv, check) {
  const bad = new Map();
  for (const e of (check && check.errors) || []) { const p = ruleProblem(e); if (p) bad.set(`${p.site}/${p.id}`, p); }
  let moved = 0;
  const words = (r) => `when ${r.when || '?'}${r.if ? `, if ${[].concat(r.if).join(' and ')}` : ''}: ${[r.say, r.do && r.do !== 'say' ? `(${[r.do, r.target || r.who, r.to && `to ${r.to}`, r.clock, r.quest, r.item].filter(Boolean).join(' ')})` : ''].filter(Boolean).join(' ')}`;
  for (const { site, id } of bad.values()) {
    const holder = site ? (adv.sites || []).find((s) => s.id === site) : adv;
    const r = holder && (holder.rules || []).find((x) => String(x.id || '') === id);
    if (!r) continue;
    holder.rules = holder.rules.filter((x) => x !== r);
    const into = site ? holder : (adv.sites || [])[0];
    if (into) into.notes = `${into.notes || ''}\n\nFor the Director (a rule the Engine cannot run by itself): ${words(r)}`.trim();
    moved++;
  }
  return moved;
}
// A questDone whose words are in no quest is matched to the quest it shares most words with.
export function fixQuestDone(adv) {
  const quests = (adv.quests || []).map((q) => String(q).toLowerCase());
  const sig = (t) => new Set(String(t || '').toLowerCase().match(/[a-z']{4,}/g) || []);
  for (const qd of adv.questDone || []) {
    const m = String(qd.match || '').toLowerCase().trim();
    if (m && quests.some((q) => q.includes(m))) { qd.match = m; continue; }
    const want = sig(`${m} ${qd.when || ''}`);
    let best = null; let score = 0;
    for (const q of quests) { const n = [...sig(q)].filter((w) => want.has(w)).length; if (n > score) { score = n; best = q; } }
    if (best && score >= 1) qd.match = best.replace(/[.!?]+$/, '').split(/\s+/).slice(0, 5).join(' ');
  }
}

// ---- 5. saving and loading ---------------------------------------------------------------------------
export function saveBook(dir, { name, kind, original, book, pictures = [], files = [] }) {
  mkdirSync(dir, { recursive: true });
  let id = slug(name);
  for (let n = 2; existsSync(join(dir, id)); n++) id = `${slug(name)}-${n}`;
  const at = join(dir, id);
  mkdirSync(at, { recursive: true });
  const clean = { spells: (book.spells || []).map(({ words, ...x }) => x), monsters: (book.monsters || []).map(({ words, ...x }) => x), rules: book.rules || [], magicItems: book.magicItems || [],
    races: book.races || [], subraces: book.subraces || [], backgrounds: book.backgrounds || [], feats: book.feats || [], subclasses: book.subclasses || [] };
  const { engine, gaps } = summarise(clean);
  const options = clean.races.length + clean.subraces.length + clean.backgrounds.length + clean.feats.length + clean.subclasses.length;
  const meta = { id, name, kind, savedAt: new Date().toISOString(), counts: { monsters: clean.monsters.length, spells: clean.spells.length, rules: clean.rules.length, ...(options ? { options } : {}) }, gaps: gaps.length };
  writeFileSync(join(at, 'original.txt'), String(original || ''));
  writeFileSync(join(at, 'book.json'), JSON.stringify({ ...meta, ...clean, ...(pictures.length ? { pictures } : {}) }));
  writePictures(join(at, 'pictures'), files);
  writeFileSync(join(at, 'book.engine.json'), JSON.stringify({ ...meta, ...engine, engine: { version: BOOK.ENGINE_VERSION, from: 'book.json', gaps: gaps.length } }));
  writeFileSync(join(at, 'gaps.md'), [`# What the book compiler could not read: ${name}`, '', ...(gaps.length ? gaps.map((g) => `- **${g.name}** (\`${g.id}\`): ${g.what}`) : ['Nothing: everything was read.']), ''].join('\n'));
  return meta;
}
export function listBooks(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((d) => !d.startsWith('_') && existsSync(join(dir, d, 'book.engine.json'))).map((d) => {
    try { const b = JSON.parse(readFileSync(join(dir, d, 'book.engine.json'), 'utf8')); return { id: b.id || d, name: b.name || d, kind: b.kind || '', savedAt: b.savedAt || '', counts: b.counts || {}, gaps: b.gaps || 0 }; } catch { return null; }
  }).filter(Boolean).sort((a, b) => String(b.savedAt).localeCompare(String(a.savedAt)));
}
export function loadBooks(dir) {
  return listBooks(dir).map((b) => JSON.parse(readFileSync(join(dir, b.id, 'book.engine.json'), 'utf8')));
}
// Set aside, never deleted: library/converted/_removed/<id>.
export function removeBook(dir, id) {
  const from = join(dir, slug(id));
  if (!existsSync(from)) return false;
  mkdirSync(join(dir, '_removed'), { recursive: true });
  renameSync(from, join(dir, '_removed', `${slug(id)}-${Date.now()}`));
  return true;
}
// A converted book joins the rules the Engine uses: monsters and spells the SRD (and the library) lack,
// and its rules text for look-ups. Returns what it added.
export function mergeBook(srd, book) {
  const add = (list, items) => { const ids = new Set(list.map((x) => x.id)); let n = 0; for (const x of items || []) if (x && x.id && !ids.has(x.id)) { list.push({ ...x, lib: book.name, conv: book.id }); ids.add(x.id); n++; } return n; };
  const added = { monsters: add(srd.monsters, book.monsters), spells: add(srd.spells, book.spells) };
  // Character options: new races, subraces of races already there, backgrounds and feats; never one the
  // rules already have (the SRD's own, or another book's), so character creation lists each once.
  const lower = (x) => String(x || '').toLowerCase();
  added.options = add(srd.races, (book.races || []).map((r) => ({ ...r, subraces: (r.subraces || []).map((s) => ({ ...s, lib: book.name, conv: book.id })) })))
    + add(srd.backgrounds, book.backgrounds) + add(srd.feats = srd.feats || [], book.feats);
  for (const s of book.subraces || []) {
    const race = srd.races.find((r) => r.id === s.race);
    if (!race) continue;
    race.subraces = race.subraces || [];
    if (race.subraces.some((x) => x.id === s.id || lower(x.name) === lower(s.name))) continue;
    const { race: _r, ...sub } = s;
    race.subraces.push({ ...sub, lib: book.name, conv: book.id });
    added.options += 1;
  }
  // Subclasses: a new one joins its class; one the rules know by name but without its features (your
  // library lists the Handbook's that way) gets them, and gets its old self back when the book goes.
  const flat = (x) => lower(x).replace(/[^a-z]/g, '');
  for (const sc of book.subclasses || []) {
    const cls = (srd.classes || []).find((c) => c.id === sc.cls);
    if (!cls) continue;
    cls.features = cls.features || {};
    const featureNames = [];
    for (const [k, v] of Object.entries(sc.features || {})) if (!(k in cls.features)) { cls.features[k] = v; featureNames.push(k); }
    const was = (cls.subclasses || []).find((x) => x.id === sc.id || flat(x.name) === flat(sc.name));
    if (was && (was.levels || []).length) continue; // the SRD's own, written out already
    if (was) { was.was = { levels: was.levels || [], desc: was.desc || '' }; Object.assign(was, { levels: sc.levels, desc: sc.desc || was.desc, conv: book.id, convFeatures: featureNames }); }
    else cls.subclasses.push({ id: sc.id, name: sc.name, flavor: sc.flavor, desc: sc.desc, levels: sc.levels, lib: book.name, conv: book.id, convFeatures: featureNames });
    added.options += 1;
  }
  const rules = [...(srd.libRules || []), ...(book.rules || []).map((r) => ({ ...r, book: r.book || book.name, conv: book.id }))];
  Object.defineProperty(srd, 'libRules', { value: rules, enumerable: false, configurable: true, writable: true });
  added.rules = (book.rules || []).length;
  if (!added.options) delete added.options;
  if (Object.prototype.hasOwnProperty.call(srd, '_ix')) delete srd._ix;
  return added;
}

// A converted book leaves the rules at once (removed, or replaced by a new conversion).
export function unmergeBook(srd, id) {
  const keep = (x) => !(x && x.conv === id);
  const before = srd.monsters.length + srd.spells.length;
  srd.monsters.splice(0, srd.monsters.length, ...srd.monsters.filter(keep));
  srd.spells.splice(0, srd.spells.length, ...srd.spells.filter(keep));
  for (const k of ['races', 'backgrounds', 'feats']) if (srd[k]) srd[k].splice(0, srd[k].length, ...srd[k].filter(keep));
  for (const r of srd.races || []) if (r.subraces) r.subraces = r.subraces.filter(keep);
  for (const c of srd.classes || []) {
    for (const sc of (c.subclasses || []).filter((x) => x.conv === id)) for (const k of sc.convFeatures || []) delete (c.features || {})[k];
    c.subclasses = (c.subclasses || []).filter((x) => x.conv !== id || x.was).map((x) => {
      if (x.conv !== id) return x;
      const { was, conv, convFeatures, ...rest } = x;
      return { ...rest, levels: was.levels, desc: was.desc };
    });
  }
  if (srd.libRules) Object.defineProperty(srd, 'libRules', { value: srd.libRules.filter(keep), enumerable: false, configurable: true, writable: true });
  if (Object.prototype.hasOwnProperty.call(srd, '_ix')) delete srd._ix;
  return before - srd.monsters.length - srd.spells.length;
}
// A converted adventure's own monsters leave the rules (removed, or replaced by a new conversion).
export function unmergeAdventure(srd, id) {
  const n = srd.monsters.length;
  srd.monsters.splice(0, srd.monsters.length, ...srd.monsters.filter((m) => m.adventure !== id));
  if (Object.prototype.hasOwnProperty.call(srd, '_ix')) delete srd._ix;
  return n - srd.monsters.length;
}
// Set aside, never deleted: library/adventures/_removed/<id>-<time>.* (its words and pictures with it).
export function removeAdventure(dir, id) {
  const k = slug(id);
  if (!existsSync(join(dir, `${k}.json`))) return false;
  const to = join(dir, '_removed');
  mkdirSync(to, { recursive: true });
  const stamp = Date.now();
  for (const f of [`${k}.json`, `${k}.original.txt`, `${k}.pictures`]) if (existsSync(join(dir, f))) renameSync(join(dir, f), join(to, f.replace(k, `${k}-${stamp}`)));
  return true;
}
// The words a book or an adventure was converted from, to convert again.
export function originalOf(dir, what, id) {
  const k = slug(id);
  const f = what === 'adventure' ? join(dir, `${k}.original.txt`) : join(dir, k, 'original.txt');
  return existsSync(f) ? readFileSync(f, 'utf8') : null;
}

export function saveAdventure(dir, adv, original = '', files = []) {
  mkdirSync(dir, { recursive: true });
  let id = slug(adv.id || adv.name);
  const fixed = { ...adv, id, converted: new Date().toISOString() };
  writeFileSync(join(dir, `${id}.json`), JSON.stringify(fixed, null, 1));
  if (original) writeFileSync(join(dir, `${id}.original.txt`), String(original));
  writePictures(join(dir, `${id}.pictures`), files);
  return fixed;
}
export function loadAdventures(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => { try { return JSON.parse(readFileSync(join(dir, f), 'utf8')); } catch { return null; } }).filter((a) => a && a.id && Array.isArray(a.sites))
    .map((a) => (Array.isArray(a.monsters) ? { ...a, monsters: oneById(a.monsters) } : a));
}

// ---- pictures ---------------------------------------------------------------------------------------
// pictures: [{ n, page, w, h, mime, data (base64), scanned }] -> what each one is, and what to do with it:
// use 'keep' (kept with the book or adventure), 'skip', 'travel' (the adventure's travel map) or
// 'site:<id>' (that place's map). The DM can change any of them before saving.
export const PICTURE_KINDS = [
  ['map', 'Map of a place'],
  ['travel', 'Travel or region map'],
  ['stat-block', 'Stat block'],
  ['page', 'Scanned page'],
  ['handout', 'Handout'],
  ['art', 'Picture'],
  ['decoration', 'Decoration'],
];
const PIC_KIND = Object.fromEntries(PICTURE_KINDS);
const WORDY = new Set(['stat-block', 'page', 'handout']);
export const SEE_GUIDE = `You look at one picture from a tabletop roleplaying book (Dungeons & Dragons 5th edition or a game like it) so that a program can use it. Answer only with JSON, no other words:
{"kind":"map|travel|stat-block|page|handout|art|decoration","about":"one short line: what it shows","place":"for a map, the place's name as the picture or its caption gives it; else empty","grid":{"cols":0,"rows":0},"text":"for a stat block, a page or a handout: every word in it, line by line, as written; else empty"}
map: a map of one place the party can be in (a building, a dungeon level, a cave, a ship, a village, a battle map with squares). travel: a map of a region, a country or a world with several places on it. stat-block: a creature's or a character's statistics (Armor Class, Hit Points, the six abilities, actions). page: a page of a book that is mostly words. handout: a letter, a note, a poster, a sign or a riddle meant to be shown to the players. art: a picture of a person, a creature, an item or a scene. decoration: a border, an ornament, a logo or a background.
grid: for a map with squares drawn on it, how many squares across and down; else 0 and 0.
In "text", write a stat block in the usual layout: the name on its own line, then "Armor Class 13", "Hit Points 22 (4d8 + 4)", "Speed 30 ft.", the six scores "STR DEX CON INT WIS CHA" with their numbers, then Senses, Languages, Challenge, and each trait and action as "Name. Words."`;

// A picture's words as the browser's word reader (Tesseract, public/pdfread.js) read them, with no AI: a
// stat block is known by its Armor Class and Hit Points; a scanned page or a long text is a page.
export function fromWords(o, words) {
  const w = String(words || '').replace(/\r/g, '').trim().slice(0, 12000);
  if (!w) return o;
  const first = w.split('\n').map((l) => l.trim()).find(Boolean) || '';
  if (/Armou?r Class/i.test(w) && /Hit Points/i.test(w)) { o.kind = 'stat-block'; o.about = `Stat block: ${first.slice(0, 60)}`; } else if (o.kind === 'page' || w.length > 600) { o.kind = 'page'; o.about = `Words: ${first.slice(0, 60)}`; } else o.about = `Words: ${first.slice(0, 60)}`;
  o.text = w;
  o.ocr = true;
  return o;
}

export async function seePictures({ ask, pictures, near = () => '', canSee = null, onProgress = () => {} }) {
  const out = pictures.map((p) => fromWords({ n: p.n, page: p.page, w: p.w, h: p.h, kind: p.scanned ? 'page' : '', about: '', place: '', grid: null, text: '', seen: false, use: 'keep' }, p.words));
  const notes = [];
  if (!pictures.length) return { pictures: out, notes };
  const read = out.filter((o) => o.ocr);
  const readNote = () => (read.length ? `The words in ${read.length} picture${read.length > 1 ? 's' : ''} (${read.map((o) => o.about.replace(/^(?:Stat block|Words): /, '')).slice(0, 4).join('; ')}) were read without the AI and joined the text.` : '');
  if (!ask || canSee === false) {
    for (const o of out) o.use = defaultUse(o);
    const rest = out.length - read.length;
    if (read.length) notes.push(readNote());
    if (rest) notes.push(`${rest} picture${rest > 1 ? 's were' : ' was'} kept, not looked at: ${ask ? 'the AI set up on the Director tab cannot see pictures (choose one that can, such as Gemini, Claude, GPT-4o, or an Ollama vision model like gemma3 or qwen2.5vl)' : 'set up an AI on the Director tab to have them looked at'}. Say what each one is below.`);
    return { pictures: out, notes };
  }
  let looked = 0;
  let failed = 0;
  let why = '';
  for (let i = 0; i < pictures.length; i++) {
    const p = pictures[i];
    const o = out[i];
    onProgress({ step: 'Looking at the pictures', at: i + 1, of: pictures.length });
    try {
      const words = String(near(p.page) || '').replace(/\s+/g, ' ').trim().slice(0, 1500);
      const ocr = o.ocr ? `\nThe words a text reader found in the picture (it makes mistakes: correct them from what you see): ${o.text.slice(0, 4000)}` : '';
      const r = parseJson(await ask(SEE_GUIDE, `${p.scanned ? `Page ${p.page} of the book, scanned: the whole page is this picture.` : `A picture on page ${p.page} of the book, ${p.w} by ${p.h} pixels.`}\nThe words on that page: ${words || '(none)'}${ocr}`, [{ mime: p.mime || 'image/jpeg', data: p.data }]));
      const before = { text: o.text };
      o.kind = PIC_KIND[r.kind] ? r.kind : p.scanned ? 'page' : 'art';
      o.about = String(r.about || '').replace(/\s+/g, ' ').trim().slice(0, 200);
      o.place = o.kind === 'map' || o.kind === 'travel' ? String(r.place || '').replace(/\s+/g, ' ').trim().slice(0, 80) : '';
      const g = r.grid || {};
      o.grid = Number(g.cols) > 0 && Number(g.rows) > 0 ? { cols: Math.min(200, Math.trunc(g.cols)), rows: Math.min(200, Math.trunc(g.rows)) } : null;
      o.text = WORDY.has(o.kind) ? String(r.text || '').replace(/\r/g, '').trim().slice(0, 12000) || before.text : '';
      o.ocr = !!before.text && o.text === before.text;
      // A stat block the word reader found stays one, whatever a model that may not really see says.
      if (/Armou?r Class/i.test(before.text) && /Hit Points/i.test(before.text) && !/Armou?r Class/i.test(o.text)) { o.kind = 'stat-block'; o.text = before.text; o.ocr = true; }
      o.seen = true;
      looked++;
    } catch (e) {
      failed++;
      why = why || String(e.message || e).slice(0, 160);
      if (!looked && failed >= 2) break; // the model cannot see, or cannot answer: no point asking for every picture
    }
  }
  for (const o of out) o.use = defaultUse(o);
  if (looked) notes.push(`The AI looked at ${looked} picture${looked > 1 ? 's' : ''}${out.some((o) => o.text) ? `; the words in ${out.filter((o) => o.text).length} of them were read with the text` : ''}.`);
  if (failed && !looked && read.length) notes.push(readNote());
  if (failed) notes.push(looked ? `${failed} picture${failed > 1 ? 's' : ''} could not be looked at (${why}): say what they are below.` : `The AI could not look at the pictures (${why}). ${read.length ? 'Say what the others are below.' : 'Say what each one is below.'}`);
  return { pictures: out, notes };
}
const defaultUse = (o) => (o.kind === 'decoration' || o.kind === 'stat-block' || (o.kind === 'page' && o.text) ? 'skip' : 'keep');

// The words the AI read in the pictures, put into the text after their page, so the readers and the
// campaign writer see them where the book has them. A map leaves a line, so the campaign knows of it.
// A picture whose words are already on its page (a scanned page over a text layer, a stat block the PDF also
// has as text) adds only its line, or the campaign would read every monster twice (X Marks the Spot).
const tokens = (t) => String(t || '').toLowerCase().match(/[a-z0-9]+/g) || [];
export function alreadyIn(words, pageText) {
  const w = tokens(words);
  if (w.length < 8) return false;
  const have = new Map();
  for (const t of tokens(pageText)) have.set(t, (have.get(t) || 0) + 1);
  let hit = 0;
  for (const t of w) { const n = have.get(t) || 0; if (n) { hit++; have.set(t, n - 1); } }
  return hit / w.length >= 0.7;
}
export function addPictureWords(text, pics) {
  const pageOf = (n) => { const m = new RegExp(`^--- Page ${n} ---$([\\s\\S]*?)(?=^--- Page \\d+ ---$|(?![\\s\\S]))`, 'm').exec(String(text)); return m ? m[1] : ''; };
  for (const p of pics || []) if (p.text && alreadyIn(p.text, pageOf(p.page))) p.inText = true;
  const line = (p) => (p.inText ? `\n[${PIC_KIND[p.kind] || 'Picture'}, picture ${p.n}${p.about ? `: ${p.about}` : ''}; its words are in the text above]\n` : p.text ? `\n[${PIC_KIND[p.kind] || 'Picture'}, picture ${p.n}${p.about ? `: ${p.about}` : ''}]\n${p.text}\n` : `\n[${PIC_KIND[p.kind]}, picture ${p.n}${p.about ? `: ${p.about}` : ''}${p.place ? ` (${p.place})` : ''}]\n`);
  const add = (pics || []).filter((p) => p.text || (p.seen && (p.kind === 'map' || p.kind === 'travel' || p.kind === 'handout')));
  if (!add.length) return text;
  const marks = [...String(text).matchAll(/^--- Page (\d+) ---$/gm)].map((m) => ({ page: Number(m[1]), at: m.index }));
  if (!marks.length) return `${text}\n\n${add.map(line).join('')}`;
  let out = String(text);
  const ends = marks.map((m, i) => ({ page: m.page, end: i + 1 < marks.length ? marks[i + 1].at : out.length }));
  const lost = [];
  for (const e of ends.slice().reverse()) {
    const here = add.filter((p) => p.page === e.page);
    if (here.length) out = `${out.slice(0, e.end).replace(/\s*$/, '')}\n${here.map(line).join('')}\n${out.slice(e.end)}`;
  }
  for (const p of add) if (!ends.some((e) => e.page === p.page)) lost.push(p);
  return lost.length ? `${out}\n\n${lost.map(line).join('')}` : out;
}

// A campaign's maps to its places: a map whose place (or caption) shares most of a site's name goes to
// that site, one map a site; the first travel map is the adventure's.
const STOP = new Set(['the', 'and', 'map', 'of', 'a', 'an', 'to', 'in', 'at', 'on']);
const sig = (t) => new Set(String(t || '').toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').split(/[\s-]+/).filter((w) => w.length > 1 && !STOP.has(w)));
export function matchMaps(adv, pics) {
  const sites = (adv && adv.sites) || [];
  const taken = new Set();
  let travel = false;
  const placed = [];
  for (const p of pics) {
    if (p.kind === 'travel' && !travel) { p.use = 'travel'; travel = true; continue; }
    if (p.kind !== 'map') continue;
    const want = sig(p.place || p.about);
    let best = null;
    let score = 0;
    for (const s of sites) {
      if (taken.has(s.id)) continue;
      const have = sig(`${s.name} ${String(s.id).replace(/-/g, ' ')}`);
      const hit = [...have].filter((w) => want.has(w)).length / Math.max(1, have.size);
      if (hit > score) { score = hit; best = s; }
    }
    if (best && score >= 0.5) { p.use = `site:${best.id}`; taken.add(best.id); placed.push(`${p.place || p.about || `picture ${p.n}`} → ${best.name || best.id}`); }
  }
  return placed;
}
// What the DM may choose for one picture.
export function pictureUses(result) {
  const out = [['keep', result && result.adventure ? 'Keep with the adventure' : 'Keep with the book'], ['skip', 'Leave out']];
  if (result && result.adventure) {
    out.push(['travel', 'The travel map']);
    for (const s of result.adventure.sites || []) out.push([`site:${s.id}`, `Map of ${s.name || s.id}`]);
  }
  return out;
}
// The pictures kept beside saved books and adventures, so they can be served again after the saves
// folder is cleared: library/converted/<id>/pictures/ and library/adventures/<id>.pictures/.
export function writePictures(dir, files) {
  if (!files || !files.length) return;
  mkdirSync(dir, { recursive: true });
  for (const f of files) if (/^[a-f0-9]{16,64}\.(?:png|jpg|gif|webp)$/.test(f.name) && !existsSync(join(dir, f.name))) writeFileSync(join(dir, f.name), f.bytes);
}
export function libraryPictures(lib) {
  const out = [];
  const conv = join(lib, 'converted');
  const advs = join(lib, 'adventures');
  const files = (d) => (existsSync(d) ? readdirSync(d).filter((f) => /\.(?:png|jpg|gif|webp)$/.test(f)).map((f) => join(d, f)) : []);
  if (existsSync(conv)) for (const d of readdirSync(conv)) if (!d.startsWith('_')) out.push(...files(join(conv, d, 'pictures')));
  if (existsSync(advs)) for (const d of readdirSync(advs)) if (d.endsWith('.pictures')) out.push(...files(join(advs, d)));
  return out;
}

// ---- the whole job ----------------------------------------------------------------------------------
// text, kind ('auto' or one of KINDS), name, how ('reader' | 'ai' | 'both'), ask(system, user, images) ->
// reply text (null without an AI), srd for ids and checks, a PDF's pictures (see seePictures) and whether
// the AI can see them. Returns what the screen shows.
export async function convertText({ text, kind = 'auto', name = '', how = 'both', ask = null, srd, pictures = [], canSee = null, onProgress = () => {} }) {
  const notes = [];
  let pics = [];
  let words = clean(text);
  if (pictures.length) {
    const page = (n) => { const m = new RegExp(`^--- Page ${n} ---$([\\s\\S]*?)(?=^--- Page \\d+ ---$|(?![\\s\\S]))`, 'm').exec(words); return m ? m[1] : ''; };
    const seen = await seePictures({ ask, pictures, near: page, canSee, onProgress });
    pics = seen.pictures;
    notes.push(...seen.notes);
    words = addPictureWords(words, pics);
  }
  if (!words.trim()) throw new Error(pics.length ? 'There are no words to read: the PDF is all pictures, and the AI could not read words in them.' : 'Paste some text first.');
  const sniffed = sniffKind(words);
  const k = KIND_IDS.includes(kind) && kind !== 'auto' ? kind : sniffed.kind;
  const book = { name: name || 'Pasted text', spells: [], monsters: [], rules: [] };
  const prefix = slug(book.name).split('-').map((w) => w[0]).join('').slice(0, 4) || 'x';
  const taken = new Set([...(srd.monsters || []), ...(srd.spells || [])].map((x) => x.id));
  if (k === 'campaign') {
    if (!ask) throw new Error('A campaign is converted by the AI: set it up on the Director tab first.');
    const r = await aiCampaign({ ask, text: words, name, srd, onProgress });
    if (r.moved) notes.push(`${r.moved} rule${r.moved > 1 ? 's' : ''} the Engine could not run (a time of day, a check of any kind, damage taken) ${r.moved > 1 ? 'were' : 'was'} moved into the places' notes for the Director.`);
    const placed = matchMaps(r.adventure, pics);
    if (placed.length) notes.push(`Maps given to their places: ${placed.join('; ')}.`);
    return { kind: k, sniffed, name: r.adventure.name, adventure: r.adventure, check: r.check, entries: r.entries || [], notes, pictures: pics, words: pics.length ? words : undefined };
  }
  if (k === 'json') {
    const j = readJson(words);
    if (j.adventure) {
      const own = j.adventure.monsters || [];
      return { kind: 'campaign', sniffed, name: j.adventure.name, adventure: j.adventure, check: checkAdventure(j.adventure, { ...srd, monsters: [...srd.monsters, ...own] }), entries: [], notes };
    }
    Object.assign(book, j);
  }
  // "Work it out" on a mix (a bestiary with a few spells): every reader that finds something runs.
  const auto = kind === 'auto' && (k === 'monsters' || k === 'spells');
  const runMonsters = k === 'monsters' || (auto && /^\s*Armou?r Class\b/im.test(words));
  const runSpells = k === 'spells' || (auto && /^\s*Casting Time\s*:/im.test(words));
  if (runMonsters) {
    const r = how === 'ai' ? { monsters: [], leftovers: [words] } : readStatBlocks(words, { prefix, taken });
    if (!r.monsters.length && !r.leftovers.length) r.leftovers.push(words); // nothing in the usual layout: all of it for the AI
    book.monsters.push(...r.monsters);
    if (r.monsters.length) notes.push(`The book reader read ${r.monsters.length} stat block${r.monsters.length > 1 ? 's' : ''}.`);
    if (r.leftovers.length && ask && how !== 'reader') {
      const ai = await aiReadEntries({ ask, kind: 'monsters', text: r.leftovers.join('\n\n'), prefix, taken, onProgress });
      book.monsters.push(...ai.entries);
      notes.push(`The AI read ${ai.entries.length} more.`, ...ai.problems);
    } else if (r.leftovers.length) notes.push(`${r.leftovers.length} stat block${r.leftovers.length > 1 ? 's were' : ' was'} not in a layout the reader knows${ask ? '' : ': set up the AI on the Director tab to read them'}.`);
  }
  if (runSpells) {
    const r = how === 'ai' ? { spells: [] } : readSpells(words, { prefix, taken });
    book.spells.push(...r.spells);
    if (r.spells.length) notes.push(`The book reader read ${r.spells.length} spell${r.spells.length > 1 ? 's' : ''}.`);
    const expected = (words.match(/^\s*Casting Time\s*:/gim) || []).length;
    if ((how === 'ai' || r.spells.length < expected || !r.spells.length) && ask && how !== 'reader') {
      const ai = await aiReadEntries({ ask, kind: 'spells', text: words, prefix, taken: new Set([...taken]), onProgress });
      const have = new Set(book.spells.map((s) => s.name.toLowerCase()));
      const more = ai.entries.filter((s) => !have.has(String(s.name).toLowerCase()));
      book.spells.push(...more);
      notes.push(`The AI read ${more.length} more.`, ...ai.problems);
    }
  }
  if (k === 'options' || (kind === 'auto' && OPT.optionMarks(words) >= 3)) {
    const o = OPT.readOptions(words, { srd });
    Object.assign(book, o);
    const n = o.races.length + o.subraces.length + o.backgrounds.length + o.feats.length + o.subclasses.length;
    const said = [[o.races.length, 'race'], [o.subraces.length, 'subrace'], [o.backgrounds.length, 'background'], [o.feats.length, 'feat'], [o.subclasses.length, 'subclass']].filter(([c]) => c).map(([c, w]) => `${c} ${w}${c > 1 ? 's' : ''}`);
    notes.push(n ? `The book reader read ${said.join(', ')}: character creation lists them once the book is saved.` : 'No races, backgrounds, feats or subclasses were found in the usual layout (Ability Score Increase, Skill Proficiencies, a feats chapter, features "Starting at 3rd level").');
    // The AI for what the reader could not read: when it found nothing, or when asked for the AI alone.
    if ((how === 'ai' || (!n && k === 'options')) && ask && how !== 'reader') {
      const ai = await aiReadOptions({ ask, text: words, onProgress });
      const have = (list) => new Set((list || []).map((x) => x.id));
      let more = 0;
      for (const key of ['races', 'subraces', 'backgrounds', 'feats', 'subclasses']) {
        const seen = have(book[key]);
        const add = ai.options[key].filter((x) => !seen.has(x.id));
        book[key] = [...(book[key] || []), ...add];
        more += add.length;
      }
      notes.push(`The AI read ${more} character option${more === 1 ? '' : 's'}.`, ...ai.problems);
    } else if (!n && k === 'options' && !ask) notes.push('Set up the AI on the Director tab to read them in another layout.');
  }
  if (k === 'rules') {
    book.rules.push(...readRules(words, book.name));
    notes.push(`${book.rules.length} section${book.rules.length === 1 ? '' : 's'} of rules text, for the Director's rules look-ups.`);
  }
  const { entries, gaps } = summarise(book);
  return { kind: k, sniffed, name: book.name, book, entries, gaps: gaps.length, notes, pictures: pics, words: pics.length ? words : undefined };
}
