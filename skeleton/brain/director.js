// The AI Director: one turn at a time. It reads a briefing, calls tools (the Engine does the rules),
// and ends with narration for the table. The same code runs for every game module: the module
// supplies the words (instructions.md is filled in from module.json and rules.json).

import { readFileSync } from 'node:fs';
import { toolbox, TOOLS, charLine } from './tools.js';
import { term, ladderName } from '../engine/module.js';
import { currentKey } from '../engine/ledger.js';

const TEMPLATE = readFileSync(new URL('./instructions.md', import.meta.url), 'utf8');
const MAX_STEPS = 14;

export function instructions(mod) {
  const T = mod.module.terms;
  const fill = {
    name: mod.module.name, tagline: mod.module.tagline, tone: mod.module.tone,
    snag: T.snag, surge: T.surge, strain: T.strain, difficulty: T.difficulty, overflow: T.overflow.toLowerCase(), health: T.health,
    ladder: (mod.rules.ladder || []).map((r) => `${r.name} ${r.at}`).join(', '),
    actions: String(mod.rules.combat.actionsPerTurn),
    terms: Object.entries(mod.module.rawTerms || {}).map(([k, v]) => `${v} (${k})`).join(', ') || 'the plain words',
  };
  return TEMPLATE.replace(/\{\{(\w+)\}\}/g, (m, k) => (k in fill ? fill[k] : m));
}

const site = (s, mod) => ((mod.ix.adventure[s.adventureId] || {}).sites || []).find((x) => x.id === s.scene.siteId) || {};

// Everything the Director needs this turn, in words.
export function briefing(s, mod, { reason = '', hostNote = '' } = {}) {
  const adv = mod.ix.adventure[s.adventureId];
  const here = site(s, mod);
  const L = [];
  L.push(`ADVENTURE: ${adv.name}. ${adv.pitch}`);
  L.push(`SECRETS (yours): ${adv.secrets}`);
  L.push(`\nPLACE: ${here.name} (${here.id}). Exits: ${(here.exits || []).map((e) => { const x = adv.sites.find((y) => y.id === e); return x ? `${x.id} (${x.name})` : e; }).join(', ') || 'none'}.`);
  L.push(`What they see: ${here.read}`);
  if (here.notes) L.push(`Your notes: ${here.notes}`);
  for (const h of here.hazards || []) L.push(`Hazard: ${h.name}: ${h.stat}${h.skill ? ` + ${h.skill}` : ''} against ${ladderName(mod, h.at)}; on a failure: ${h.fail || 'it costs them'}.`);
  if ((here.clues || []).length) L.push(`Clues to find: ${here.clues.join(' / ')}`);
  const ks = Object.values(s.creatures).filter((k) => k.siteId === s.scene.siteId);
  if (ks.length) L.push(`Creatures here: ${ks.map((k) => { const b = mod.ix.creature[k.base]; return `${k.id} ${k.name}${k.down ? ' (DOWN, out of the fight)' : k.hidden ? ' (hidden: reveal_creatures when found)' : ''}: ${k.health}/${k.healthMax} ${term(mod, 'health')}${k.conds.length ? `, ${k.conds.join(', ')}` : ''}; attacks ${b.attacks.map((x) => x.name).join(', ')}; tactics: ${b.tactics || ''}`; }).join(' | ')}`);
  L.push(`\nTHE PARTY:`);
  for (const c of Object.values(s.chars)) L.push(`- ${charLine(mod, c)}`);
  if (!Object.keys(s.chars).length) L.push('- Nobody has a character yet. Welcome the table and ask who they will play.');
  if (s.quests.length) L.push(`\nQUESTS: ${s.quests.map((q) => `${q.id} ${q.text}${q.done ? ' (done)' : ''}`).join('; ')}`);
  if (s.clocks.length) L.push(`CLOCKS: ${s.clocks.map((c) => { const d = (adv.clocks || []).find((x) => x.id === c.id); return `${c.id} ${c.name} ${c.filled}/${c.size}${d ? ` (ticks: ${d.ticks}; when full: ${d.fills})` : ''}`; }).join('; ')}`);
  if (s.fight) {
    const cur = currentKey(s);
    const [kind, id] = (cur || ':').split(':');
    const o = kind === 'char' ? s.chars[id] : s.creatures[id];
    L.push(`\nFIGHT: round ${s.fight.round}. Order: ${s.fight.order.map((x) => { const [k2, i2] = x.key.split(':'); return (k2 === 'char' ? s.chars[i2] : s.creatures[i2] || {}).name; }).join(', ')}. Acting now: ${o ? `${o.name} (${id})` : 'nobody'}${kind === 'creature' ? ': play it now, then end_turn.' : ': describe the moment and ask that player what they do.'}`);
  }
  if (s.requests.length) L.push(`\nROLLS WAITING: ${s.requests.map((q) => `${(s.chars[q.charId] || {}).name} (${q.stat}${q.skill ? ` + ${q.skill}` : ''}, ${ladderName(mod, q.at)}: ${q.reason})`).join('; ')}. Do not move on past them.`);
  const recent = s.story.filter((e) => e.kind !== 'host' && !e.quiet).slice(-14);
  L.push(`\nTHE STORY SO FAR (latest last):`);
  for (const e of recent) L.push(`${e.who || e.kind}: ${e.text.slice(0, 500)}`);
  if (hostNote) L.push(`\nTHE HOST ASKS: ${hostNote}`);
  L.push(`\nNOW: ${reason || 'Continue the scene.'}`);
  return L.join('\n');
}

const ROLL_WORDS = /\b(roll|make a|give me a|test your)\b[^.?!]*\b(check|roll|save|test)\b/i;
const LEAK = /\b(the engine|the briefing|your notes|the notes|tools?|ask_for_roll|creature_attack|difficulty \d+|defen[cs]e \d+|\d+\s*(?:health|hit points|hp)\b)/i;

// Light checks of a draft: what a table would notice at once.
export function checkNarration(text, s, mod) {
  const flags = [];
  const words = text.split(/\s+/).filter(Boolean).length;
  if (words > 140) flags.push({ kind: 'style', text: `Long: ${words} words.` });
  if (!/\?\s*["'’”]?\s*$/.test(text.trim())) flags.push({ kind: 'style', text: 'Does not end on a question.' });
  if (LEAK.test(text)) flags.push({ kind: 'leak', text: `Names the machinery or a hidden number ("${(text.match(LEAK) || [''])[0]}").` });
  if (/[*#]{2,}|^\s*[-*] /m.test(text)) flags.push({ kind: 'style', text: 'Uses formatting.' });
  for (const k of Object.values(s.creatures)) {
    if (k.down || k.siteId !== s.scene.siteId) continue;
    const n = k.name.replace(/\s+\d+$/, '').toLowerCase();
    if (new RegExp(`${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^.]{0,40}\\b(dies|is dead|falls dead|lies still|is destroyed|collapses for good)`, 'i').test(text)) flags.push({ kind: 'rule', text: `Says ${k.name} is finished, but the Engine has it still standing.` });
  }
  void mod;
  return flags;
}

// One turn. provider: the chat provider (brain/providers.js build()).
export async function directorTurn({ state, mod, provider, rng, now = 0, reason = '', hostNote = '' }) {
  const T = toolbox({ state, mod, rng, now });
  const chat = provider.start({ system: instructions(mod), tools: TOOLS.map(({ name, description, parameters }) => ({ name, description, parameters })) });
  const calls = [];
  const usage = { in: 0, out: 0 };
  let reply = await chat.send(briefing(state, mod, { reason, hostNote }));
  let narration = '';
  let rollNudged = false;
  let silentNudged = false;
  for (let step = 0; step < MAX_STEPS + 2 * Object.keys(state.creatures).length; step++) {
    usage.in += reply.usage.in; usage.out += reply.usage.out;
    if (reply.calls.length) {
      const results = reply.calls.map((c) => { const result = T.run(c.name, c.args); calls.push({ name: c.name, args: c.args, result }); return { call: c, result }; });
      reply = await chat.results(results);
      continue;
    }
    narration = String(reply.text || '').trim();
    if (narration && !rollNudged && ROLL_WORDS.test(narration) && T.state.requests.length === state.requests.length) {
      rollNudged = true; narration = '';
      reply = await chat.send('You asked for a roll in words, but nothing is on anyone\'s screen. Call ask_for_roll for it now, then narrate again, ending on one question. If no roll is needed, narrate again without asking for one.');
      continue;
    }
    if (narration || silentNudged) break;
    silentNudged = true;
    reply = await chat.send('You have not said anything to the table yet. Narrate now, in plain text, and end on one question.');
  }
  let flags = narration ? checkNarration(narration, T.state, mod) : [];
  // One rewrite before anyone sees it.
  if (flags.length) {
    try {
      const fix = await chat.send(`Rewrite your whole reply: ${flags.map((f) => f.text).join(' ')} Keep the same events, plain text, two to five sentences, ending on one question to one named character. Do not call any tools.`);
      usage.in += fix.usage.in; usage.out += fix.usage.out;
      const text = String(fix.text || '').trim();
      if (text && !(fix.calls || []).length) {
        const again = checkNarration(text, T.state, mod);
        if (again.length < flags.length) { narration = text; flags = [...again, { kind: 'note', text: 'Rewritten once.' }]; }
      }
    } catch (e) { /* keep the draft */ }
  }
  if (!narration) {
    const cur = currentKey(T.state);
    const who = cur && cur.startsWith('char:') ? T.state.chars[cur.slice(5)].name : '';
    narration = who ? `${who}, it is your turn. What do you do?` : 'What do you do?';
    flags.push({ kind: 'rule', text: 'The Director said nothing; the Engine asked the table what is next.' });
  }
  if (T.refusals) flags.push({ kind: 'rule', text: `The Engine refused ${T.refusals} thing${T.refusals > 1 ? 's' : ''} the Director tried. Nothing refused took effect.` });
  T.do({ type: 'narrate', text: narration.replace(/\*\*/g, '') });
  return { state: T.state, narration, calls, flags, usage, refusals: T.refusals };
}
