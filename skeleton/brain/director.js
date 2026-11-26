// The AI Director: one turn at a time. It reads a briefing, calls tools (the Engine does the rules),
// and ends with narration for the table. The same code runs for every game module: the module
// supplies the words (instructions.md is filled in from module.json and rules.json).

import { readFileSync } from 'node:fs';
import { toolbox, toolsFor, charLine } from './tools.js';
import { term, ladderName } from '../engine/module.js';
import { getSystem } from '../engine/dicesystems.js';
import { currentKey } from '../engine/ledger.js';
import { rulesAt, ruleWords } from '../engine/triggers.js';
import * as SEEDS from '../engine/seeds.js';

const TEMPLATE = readFileSync(new URL('./instructions.md', import.meta.url), 'utf8');
const MAX_STEPS = 14;

export function instructions(mod) {
  const T = mod.module.terms;
  const fill = {
    name: mod.module.name, tagline: mod.module.tagline, tone: mod.module.tone,
    snag: T.snag, surge: T.surge, strain: T.strain, difficulty: T.difficulty, overflow: T.overflow.toLowerCase(), health: T.health,
    ladder: (mod.rules.ladder || []).map((r) => `${r.name} ${r.at}`).join(', '),
    middle: ((mod.rules.ladder || [])[1] || (mod.rules.ladder || [])[0] || {}).name || 'the middle difficulty',
    actions: String(mod.rules.combat.actionsPerTurn),
    terms: Object.entries(mod.module.rawTerms || {}).map(([k, v]) => `${v} (${k})`).join(', ') || 'the plain words',
  };
  const S = getSystem(mod.rules);
  fill.dice = S.sys.describe(S.o, T);
  fill.diceName = S.name;
  return TEMPLATE.replace(/\{\{(\w+)\}\}/g, (m, k) => (k in fill ? fill[k] : m));
}

const site = (s, mod) => ((mod.ix.adventure[s.adventureId] || {}).sites || []).find((x) => x.id === s.scene.siteId) || {};

// Everything the Director needs this turn, in words.
export function briefing(s, mod, { reason = '', hostNote = '', lastSeq = -1 } = {}) {
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
  // The adventure's own rules here: the Engine carries them out itself; the Director only narrates them.
  const rules = rulesAt(adv, here.id).filter((r) => !(r.once && (s.fired || {})[r.key]));
  if (rules.length) L.push(`Rules here (the Engine does these by itself when they happen; just narrate them): ${rules.map(ruleWords).join(' | ')}`);
  const ks = Object.values(s.creatures).filter((k) => k.siteId === s.scene.siteId);
  if (ks.length) L.push(`Creatures here: ${ks.map((k) => { const b = mod.ix.creature[k.base]; return `${k.id} ${k.name}${k.down ? ' (DOWN, out of the fight)' : k.hidden ? ' (hidden: reveal_creatures when found)' : ''}: ${k.health}/${k.healthMax} ${term(mod, 'health')}${k.conds.length ? `, ${k.conds.join(', ')}` : ''}; attacks ${b.attacks.map((x) => x.name).join(', ')}; tactics: ${b.tactics || ''}`; }).join(' | ')}`);
  L.push(`\nTHE PARTY:`);
  for (const c of Object.values(s.chars)) L.push(`- ${charLine(mod, c)}`);
  if (!Object.keys(s.chars).length) L.push('- Nobody has a character yet. Welcome the table and ask who they will play.');
  if (s.quests.length) L.push(`\nQUESTS: ${s.quests.map((q) => `${q.id} ${q.text}${q.done ? ' (done)' : ''}`).join('; ')}`);
  // Quests finished here (the Gull Rock bench, 26 Nov: the rite was stopped and the Choir Master fell, but nobody
  // called complete_quest): the Director is told which, so it marks them done when the scene does it.
  const here2 = (adv.quests || []).filter((q) => (q.doneAt || []).includes(here.id) && !(s.quests.find((x) => x.id === q.id) || {}).done);
  if (here2.length) L.push(`QUESTS THAT END HERE (call complete_quest the moment the story finishes one): ${here2.map((q) => `${q.id} ${q.text}`).join('; ')}`);
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
  // A seed that has just come into play (the Engine's moment or the Director's own choice): play it now.
  const now = s.seedNow && s.seedNow.seq > lastSeq ? (s.seeds || []).find((x) => x.id === s.seedNow.id) : null;
  if (now) L.push(`\nA STORY SEED COMES INTO PLAY NOW (${s.seedNow.by === 'engine' ? `its moment came: ${s.seedNow.why}` : 'your choice'}). Bring it into the scene this turn${s.seedNow.foes.length ? `; these have arrived: ${s.seedNow.foes.join(', ')}` : ''}${s.fight ? ' (the fight is on)' : ''}:\n${now.text}`);
  const seeds = (s.seeds || []).filter((x) => x.on && (!now || x.id !== now.id) && SEEDS.seedFree(x, s, here.id));
  if (seeds.length) L.push(`\nSTORY SEEDS (the host's; call use_seed with the id when its moment comes or it fits; the Engine brings in "getting nowhere" and "camp" ones by itself):\n${seeds.map((x) => `[${x.id}] ${SEEDS.whenWords(SEEDS.seedPlan(x.text))}:\n${x.text}`).join('\n---\n')}`);
  if (hostNote) L.push(`\nTHE HOST ASKS: ${hostNote}`);
  L.push(`\nNOW: ${reason || 'Continue the scene.'}`);
  return L.join('\n');
}

// A quest that ends at this place, not done yet, when every roll since the last narration succeeded and the
// Director has not called complete_quest this turn.
function questWon(s, mod, sinceSeq, calls) {
  if (calls.some((c) => c.name === 'complete_quest')) return null;
  const adv = mod.ix.adventure[s.adventureId];
  if (!adv) return null;
  const open = (adv.quests || []).find((q) => (q.doneAt || []).includes(s.scene.siteId) && !(s.quests.find((x) => x.id === q.id) || {}).done);
  if (!open) return null;
  const rolls = s.story.filter((e) => e.roll && e.seq > sinceSeq && / rolls /.test(e.text));
  if (!rolls.length || rolls.some((e) => /fail/i.test(e.text)) || !rolls.every((e) => /success/i.test(e.text))) return null;
  return open;
}
const ROLL_WORDS = /\b(roll|make a|give me a|test your)\b[^.?!]*\b(check|roll|save|test)\b/i;
const LEAK = /\b(the engine|the briefing|your notes|the notes|tools?|ask_for_roll|creature_attack|difficulty \d+|defen[cs]e \d+|\d+\s*(?:health|hit points|hp)\b)/i;

// The narration takes the party to a place along an exit, but nobody called move_party (the D&D bench, 26 Nov):
// the place it names, or null. A name in talk ("the bell is in the nave") is not travel: travel words must
// come before it, within a sentence or two.
const TRAVEL_WORDS = /\b(set (?:off|out)|head(?:s|ed|ing)? (?:off|out|for|to|toward|towards|down|up|back)|make (?:your|their|our) way|travel(?:s|led|ling)?|walk(?:s|ed|ing)?|ride|rode|march(?:es|ed)?|climb(?:s|ed)?|descend(?:s|ed)?|cross(?:es|ed)?|follow(?:s|ed)? the|arriv(?:e|es|ed|ing)|reach(?:es|ed)?|come to|came to|you are (?:now )?(?:at|in)|step (?:into|out onto)|lead(?:s)? (?:you|them) (?:to|into|down|up))\b/i;
export function travelledInWords(text, s, mod) {
  const adv = mod.ix.adventure[s.adventureId];
  const here = site(s, mod);
  const t = String(text || '');
  for (const id of here.exits || []) {
    const x = (adv.sites || []).find((y) => y.id === id);
    if (!x) continue;
    const name = x.name.replace(/^the\s+/i, '');
    const at = t.toLowerCase().indexOf(name.toLowerCase());
    if (at < 0) continue;
    if (TRAVEL_WORDS.test(t.slice(Math.max(0, at - 220), at + name.length + 40))) return x;
  }
  return null;
}

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
  // Before the model's turn: is the party getting anywhere? (a "getting nowhere" seed), and trouble picked
  // with nobody here to fight (a "picks a fight" seed may bring someone out).
  const lastNarr = [...state.story].reverse().find((e) => e.kind === 'narration');
  if (lastNarr) {
    const said = state.story.filter((e) => e.kind === 'say' && e.seq > lastNarr.seq).map((e) => e.text).join(' ');
    const nobody = !Object.values(state.creatures).some((k) => k.siteId === state.scene.siteId && !k.down);
    if (said && nobody && /\b(attack|punch|hit|stab|shove|grab|throttle|draw (?:my|his|her) (?:sword|knife|blade|gun))\b/i.test(said)) T.do({ type: 'seed.check', event: 'provoke', text: said });
    T.do({ type: 'seed.check' });
  }
  const chat = provider.start({ system: instructions(mod), tools: toolsFor(mod) });
  const calls = [];
  const usage = { in: 0, out: 0 };
  let reply = await chat.send(briefing(T.state, mod, { reason, hostNote, lastSeq: lastNarr ? lastNarr.seq : -1 }));
  let narration = '';
  let rollNudged = false;
  let silentNudged = false;
  let moveNudged = false;
  let questNudged = false;
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
    // A journey told in words, with the party still where it was: once, ask for the move (or what stops them).
    const went = narration && !moveNudged && !T.state.fight && T.state.scene.siteId === state.scene.siteId ? travelledInWords(narration, T.state, mod) : null;
    if (went) {
      moveNudged = true; narration = '';
      reply = await chat.send(`Your narration takes the party toward ${went.name}, but they are still at ${site(T.state, mod).name}. If they have arrived there or are close enough to see it, call move_party with place "${went.id}" now, then narrate again. If something stops them on the way, keep them where they are and say what stops them. End on one question.`);
      continue;
    }
    // Rolls that all succeeded where a quest ends, and no complete_quest (the Gull Rock bench, 27 Nov: three
    // successes at the keeper's cottage found the diary, the blood and the cave-sand, and the quest stayed open):
    // once, ask whether that finishes it.
    const open = narration && !questNudged && !T.state.fight ? questWon(T.state, mod, lastNarr ? lastNarr.seq : -1, calls) : null;
    if (open) {
      questNudged = true; narration = '';
      reply = await chat.send(`Those rolls all succeeded here. Does that finish the quest "${open.text}" (${open.id})? If it does, call complete_quest with quest "${open.id}" now, then narrate again. If something is still left to do, narrate again as you would have and say what is left. End on one question.`);
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
  // A creature that attacked on its turn and was left standing in it (Gull Rock, 27 Nov: the keeper swung his
  // hatchet and the turn never ended): the Engine ends that turn, so the fight does not stall.
  const startKey = currentKey(state);
  if (T.state.fight && startKey && startKey.startsWith('creature:') && currentKey(T.state) === startKey
    && calls.some((c) => c.name === 'creature_attack' && c.result && !c.result.refused) && !T.do({ type: 'fight.next' })) {
    flags.push({ kind: 'note', text: 'The creature had acted; the Engine ended its turn.' });
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
