// The converter: turns a rule book, a players' handbook, a monster book, a campaign, or a few
// ideas, into a Skeleton module. It writes one section at a time (each is one AI call), checks it
// with the same validator the game uses, and sends the problems back once to be fixed.
//
// Any provider from brain/providers.js works (tools are not needed). The same guide is in
// CONVERTER-PROMPT.md, for pasting into a chat with Claude or another AI by hand.

import { readFileSync } from 'node:fs';
import { DICE, TEMPLATES, checkModule, checkRules, checkHandbook, checkBestiary, checkLore, checkAdventure, FORMAT } from '../engine/schema.js';
import { prepare, check } from '../engine/module.js';
import { SYSTEMS, getSystem } from '../engine/dicesystems.js';
import { checkRules as checkAdventureRules } from '../engine/triggers.js';

export const GUIDE = readFileSync(new URL('./convert-guide.md', import.meta.url), 'utf8').replace('{{DICE}}', DICE);
export const MODES = {
  convert: 'Convert existing material (rules, handbook, monsters, campaign) into a whole module.',
  invent: 'Invent a whole new game from a few ideas.',
  extend: 'Add to an existing module: new creatures and/or a new adventure.',
};
const MAX_SOURCE = 90000; // characters of source text sent with each section

// Pulls the JSON object out of a reply (models sometimes wrap it in a fence or a sentence).
export function parseJson(text) {
  const t = String(text || '').replace(/^﻿/, '');
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(t);
  const body = fence ? fence[1] : t;
  const a = body.indexOf('{');
  const b = body.lastIndexOf('}');
  if (a < 0 || b <= a) throw new Error('The reply had no JSON object in it.');
  const raw = body.slice(a, b + 1);
  try { return JSON.parse(raw); } catch (e) {
    // The usual small slips: trailing commas, // comments.
    const fixed = raw.replace(/\/\/[^\n"]*$/gm, '').replace(/,\s*([}\]])/g, '$1');
    return JSON.parse(fixed);
  }
}

function checker(section, made) {
  if (section === 'module') return (x) => checkModule({ ...x, format: FORMAT });
  if (section === 'rules') return (x) => checkRules(x);
  if (section === 'handbook') return (x) => checkHandbook(x, made.rules);
  if (section === 'bestiary') return (x) => checkBestiary(x, made.rules);
  if (section === 'lore') return (x) => checkLore(x);
  // An adventure's own rules are checked too (a rule about a creature or clock it does not have), so
  // the model is sent them to fix with the rest.
  return (x) => {
    const errs = checkAdventure(x, { bestiary: made.bestiary, rules: made.rules });
    if (errs.length || !(x.rules || (x.sites || []).some((st) => (st.rules || []).length))) return errs;
    let mod = null;
    try { mod = prepare({ module: made.module, rules: made.rules, handbook: made.handbook, bestiary: made.bestiary, lore: made.lore, adventures: [x] }); } catch (e) { return errs; }
    return mod && mod.ix ? checkAdventureRules(mod, x) : errs;
  };
}

// What has been made so far, briefly: the ids later sections must use.
function madeSoFar(made) {
  const L = [];
  if (made.module) L.push(`module: ${made.module.name} (${made.module.id}). Terms: ${JSON.stringify(made.module.terms || {})}`);
  if (made.rules) {
    const S = getSystem(made.rules);
    const R = S.ranges;
    L.push(`dice system: ${S.id} (${S.name}). In it: stats ${R.stat[0]}-${R.stat[1]}, skills 0-${R.skill[1]}, difficulties ${R.at[0]}-${R.at[1]} (ladder: ${(made.rules.ladder || []).map((x) => `${x.name} ${x.at}`).join(', ')}), creature attack ratings ${R.rating[0]}-${R.rating[1]}, creature defences ${R.defence[0]}-${R.defence[1]}, modifiers ${R.mod[0]} to ${R.mod[1]}.`);
    L.push(`stats: ${(made.rules.stats || []).map((s) => s.id).join(', ')}`);
    L.push(`skills: ${(made.rules.skills || []).map((s) => `${s.id} (${s.stat})`).join(', ')}`);
    L.push(`conditions: ${(made.rules.conditions || []).map((s) => s.id).join(', ')}`);
    L.push(`strain: ${(made.rules.strain || {}).name}; health: ${(made.rules.health || {}).name}`);
  }
  if (made.handbook) {
    L.push(`origins: ${(made.handbook.origins || []).map((s) => s.id).join(', ')}`);
    L.push(`callings: ${(made.handbook.callings || []).map((s) => s.id).join(', ')}`);
    L.push(`gear: ${(made.handbook.gear || []).map((s) => s.id).join(', ')}`);
  }
  if (made.bestiary) L.push(`creatures: ${(made.bestiary.creatures || []).map((c) => `${c.id} (tier ${c.tier})`).join(', ')}`);
  if (made.adventures && made.adventures.length) L.push(`adventures already: ${made.adventures.map((a) => a.id).join(', ')}`);
  return L.join('\n');
}

const ASK = {
  module: 'Write module.json: who the game is, its tone, and what it calls the skeleton\'s parts (terms).',
  rules: 'Write rules.json: the core rules.',
  handbook: 'Write handbook.json: the players\' book, with 2 to 4 ready-made characters (pregens) whose stats and skills are final values.',
  bestiary: 'Write bestiary.json: the creatures. Convert every creature in the source (up to 30); when inventing, make 5 to 10 across tiers 1 to 4.',
  lore: 'Write lore.json: the world, a few sections, and a glossary of the game\'s own words.',
  adventure: 'Write one adventure file. When converting a campaign, convert its first chapter or adventure (or the one named in the notes); when inventing, write a first adventure for one evening. Give places "rules" for what happens by itself (an ambush, a countdown, followers who flee, a quest done when a creature falls).',
};

// A whole book is longer than one section can be sent. Each section gets the parts of the source that fit it
// best (27 Nov 2026, for PDFs): the opening (what the game is), then the pages with the most of that section's
// words, kept in the book's own order and marked where pages were left out.
const WANT = {
  module: /\b(introduction|overview|setting|tone|genre|welcome|this (game|book)|what is)\b/gi,
  rules: /\b(roll|dice|d\d+|check|test|success|fail(ure)?|difficulty|target number|modifier|bonus|penalty|damage|health|wound|condition|initiative|turn|action|rest|advantage)\b/gi,
  handbook: /\b(character|class|calling|career|origin|background|ancestry|species|skill|talent|ability|abilities|gear|equipment|weapon|armou?r|level|advancement|experience)\b/gi,
  bestiary: /\b(creature|monster|beast|enemy|foe|npc|attack|bite|claw|hit points|health|armou?r|tier|threat|stat(istic)?s?|horde|spawn)\b/gi,
  lore: /\b(history|world|land|kingdom|city|god|gods|faction|people|culture|religion|legend|age|war|map|region|glossary)\b/gi,
  adventure: /\b(adventure|scenario|chapter|scene|room|area|location|encounter|clue|quest|hook|npc|treasure|read aloud|boxed text|the party|the players|when the)\b/gi,
};
export function pickSource(source, section, max = MAX_SOURCE) {
  const text = String(source || '');
  if (text.length <= max) return { text, cut: false };
  // Pieces: the PDF reader's pages and files, else paragraphs gathered to about 3,000 characters.
  let parts = text.split(/\n(?=--- (?:Page \d+|A (?:scanned page|picture) on page \d+)|=== .+ ===)/);
  if (parts.length < 4) {
    parts = []; let cur = '';
    for (const para of text.split(/\n\s*\n/)) { if (cur.length + para.length > 3000 && cur) { parts.push(cur); cur = ''; } cur += `${cur ? '\n\n' : ''}${para}`; }
    if (cur) parts.push(cur);
  }
  const re = WANT[section] || WANT.rules;
  const score = parts.map((t) => ((t.match(re) || []).length * 1000) / Math.max(400, t.length));
  const keep = new Set();
  let used = 0;
  // The opening: up to a seventh of the room.
  for (let i = 0; i < parts.length && used + parts[i].length <= max / 7; i++) { keep.add(i); used += parts[i].length + 1; }
  for (const i of parts.map((_, i) => i).sort((a, b) => score[b] - score[a] || a - b)) {
    if (keep.has(i) || used + parts[i].length > max) continue;
    keep.add(i); used += parts[i].length + 1;
  }
  const out = []; let gap = false;
  parts.forEach((t, i) => { if (keep.has(i)) { if (gap) out.push('[… pages left out …]'); out.push(t); gap = false; } else gap = true; });
  if (gap) out.push('[… pages left out …]');
  return { text: out.join('\n'), cut: true };
}

// sections: which to write, in this order. existing: a module to extend (its sections are kept).
export async function convert({ provider, mode = 'invent', source = '', ideas = '', name = '', notes = '', sections, existing = null, dice = '', onProgress = () => {} }) {
  if (!MODES[mode]) throw new Error(`Mode must be one of: ${Object.keys(MODES).join(', ')}.`);
  if (!String(source).trim() && !String(ideas).trim()) throw new Error('Give the converter some material: source text, ideas, or both.');
  const order = sections && sections.length ? sections : mode === 'extend' ? ['bestiary', 'adventure'] : ['module', 'rules', 'handbook', 'bestiary', 'lore', 'adventure'];
  const made = existing ? {
    module: existing.module && { ...existing.module, terms: existing.module.rawTerms || existing.module.terms },
    rules: existing.rules, handbook: existing.handbook, bestiary: existing.bestiary, lore: existing.lore, adventures: [...(existing.adventures || [])],
  } : { adventures: [] };
  const log = [];
  const usage = { in: 0, out: 0 };
  const material = (section) => { const src = pickSource(source, section); return [
    mode === 'convert' ? 'TASK: convert the SOURCE into a Skeleton module.' : mode === 'extend' ? 'TASK: extend the existing module with new material.' : 'TASK: invent a new game from the IDEAS.',
    name ? `NAME: ${name}` : '',
    dice && SYSTEMS[dice] ? `DICE SYSTEM: use "${dice}" (${SYSTEMS[dice].name}) in rules.json "dice", with numbers in its ranges.` : mode !== 'extend' ? 'DICE SYSTEM: keep the source\'s own dice if a system in THE SYSTEMS matches it; otherwise choose the best fit (the d6 pool when unsure), and say which in module.json "credits".' : '',
    ideas ? `IDEAS:\n${ideas}` : '',
    notes ? `NOTES FROM THE DESIGNER:\n${notes}` : '',
    src.text ? `SOURCE${src.cut ? ` (the parts of a longer source that fit this section best; the opening first)` : ''}:\n${src.text}` : '',
  ].filter(Boolean).join('\n\n'); };

  for (const section of order) {
    onProgress({ section, stage: 'writing' });
    const chat = provider.start({ system: GUIDE, tools: [] });
    const extendNote = mode === 'extend' && section === 'bestiary' ? ' Keep every creature already in the bestiary and add the new ones after them.' : mode === 'extend' && section === 'adventure' ? ' Write a new adventure with a new id, using the existing creatures and any new ones.' : '';
    const msg = `${material(section)}\n\nALREADY MADE (use these ids):\n${madeSoFar(made) || 'nothing yet'}\n\nSECTION: ${section}\n${ASK[section]}${extendNote}\nTEMPLATE (an example of every field; "?" marks an optional key; text after // is a note):\n${TEMPLATES[section]}\n${mode === 'extend' && section === 'bestiary' && made.bestiary ? `\nTHE BESTIARY NOW:\n${JSON.stringify(made.bestiary)}\n` : ''}\nReply with the JSON object only.`;
    let reply = await chat.send(msg);
    usage.in += reply.usage.in; usage.out += reply.usage.out;
    let obj = null;
    let errs = [];
    for (let attempt = 0; attempt < 2; attempt++) {
      try { obj = parseJson(reply.text); errs = checker(section, made)(obj); } catch (e) { obj = null; errs = [e.message]; }
      if (!errs.length) break;
      if (attempt === 1) break;
      onProgress({ section, stage: 'fixing', errors: errs });
      reply = await chat.send(`That ${section} JSON has problems:\n- ${errs.slice(0, 25).join('\n- ')}\nReply with the whole corrected JSON object only.`);
      usage.in += reply.usage.in; usage.out += reply.usage.out;
    }
    log.push({ section, ok: !errs.length, errors: errs });
    onProgress({ section, stage: errs.length ? 'problems' : 'done', errors: errs });
    if (!obj) continue;
    if (section === 'module') made.module = { ...obj, format: FORMAT };
    else if (section === 'adventure') made.adventures = [...made.adventures.filter((a) => a.id !== obj.id), obj];
    else made[section] = obj;
  }
  const mod = prepare({ module: made.module, rules: made.rules, handbook: made.handbook, bestiary: made.bestiary, lore: made.lore, adventures: made.adventures });
  const result = check(mod);
  return { mod, ok: result.ok, errors: result.errors, log, usage };
}
