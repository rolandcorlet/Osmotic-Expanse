// One Director turn: brief the model from the Ledger, let it act through the
// tools on a sandbox copy, and hand back the proposed new Ledger with its
// narration. Nothing here touches the live table: the caller decides whether to
// commit the result (Auto) or show it to the host first (Co-pilot).

import { readFileSync } from 'node:fs';
import { TOOLS, toolbox, orgMT } from './tools.js';
import { ProviderError } from './net.js';
import * as R from '../engine/rules.js';

export const INSTRUCTIONS = readFileSync(new URL('./instructions.md', import.meta.url), 'utf8');
const MAX_STEPS = 10;

// ---- the briefing: everything the model may know, rebuilt from data every turn ----
export function briefing(state, scenario, bestiary, { reason = '', hostNote = '' } = {}) {
  const site = scenario.sites.find((x) => x.id === state.scene.siteId) || scenario.sites[0];
  const L = [];
  const h = site.host || {};
  L.push(`# SITE ${site.n} of ${scenario.sites.length}: ${site.name} (id ${site.id}) — ${site.short}`);
  L.push(`In the whale: ${site.inWhale}`);
  L.push(`What it is: ${site.where}`);
  L.push(`In front: ${site.front}`);
  L.push(`Fluid: tonic ${site.tonic}; viscosity ${site.visc}; flow ${site.flow}`);
  L.push(`Zones: ${site.zones.map((z) => `${z.name}${z.band ? ` (${z.band})` : ''}${z.note ? `: ${z.note}` : ''}`).join(' | ')}`);
  L.push(`Exits: ${site.exits.join(' | ')}`);
  const near = scenario.sites.filter((x) => Math.abs(x.n - site.n) === 1).map((x) => `${x.name} = "${x.id}"`);
  L.push(`Reachable with change_site: ${near.join(', ')}`);
  L.push('');
  L.push('## Director-only notes for this site (never read these out)');
  for (const [k, label] of [['play', 'Play'], ['danger', 'Danger'], ['wants', 'Wants'], ['weakness', 'Weakness'], ['hazard', 'Hazard'], ['pays', 'Pays'], ['tells', 'Tells'], ['lesson', 'Lesson']]) {
    if (h[k]) L.push(`${label}: ${h[k]}`);
  }
  if ((site.encounter || []).length) {
    L.push('');
    L.push('## Creatures printed for this site (bring_creatures uses these block ids)');
    for (const e of site.encounter) {
      const b = bestiary[e.blockId];
      if (!b) continue;
      L.push(`- ${e.count} x ${b.name} (block "${b.id}"): ${b.statLine}`);
      if (b.traits) L.push(`  Traits: ${b.traits}`);
      for (const sp of b.special || []) L.push(`  ${sp}`);
      if (b.weakness) L.push(`  Weakness: ${b.weakness}`);
      if (b.tactics) L.push(`  Tactics: ${b.tactics}`);
    }
  }

  L.push('');
  L.push('# THE COHORT (organisms in play)');
  const orgs = Object.values(state.organisms).filter((o) => o.playerId);
  if (!orgs.length) L.push('Nobody has joined yet.');
  for (const o of orgs) {
    const paths = Object.entries(o.pathways).map(([n, r]) => `${n} ${r}`).join(', ');
    const weps = o.weapons.filter((w) => w.carried !== false).map((w) => `${w.name} (${w.type}, ${w.props.join('/')})`).join(', ');
    L.push(`- ${o.name} (id "${o.id}", ${o.hand}, ${o.phenotype}; played by ${(state.players[o.playerId] || {}).name || '?'})`);
    L.push(`  Baselines VSC ${o.base.VSC} DFF ${o.base.DFF} RTC ${o.base.RTC} OSM ${o.base.OSM} AFF ${o.base.AFF} | Pathways: ${paths}`);
    L.push(`  MI ${o.mi}/${o.miMax} | ATP ${o.atp}/${o.atpMax} | Stress ${o.stress} (${R.stressNote(o.stress)}) | MT ${orgMT(o)} | soak ${o.soak} | Lysis boxes ${o.countdown}/${o.countdownMax}${o.dormant ? ' | DORMANT' : ''}`);
    L.push(`  Carries: ${weps || 'nothing'}; ${o.kit.join('; ')} | Substrate ${o.substrate} S | Codon ${o.codon}${o.oath != null ? ` | Oath boxes ${o.oath}/${o.oathMax}` : ''}${o.conditions.length ? ` | Conditions: ${o.conditions.map((c) => c.name).join(', ')}` : ''}`);
    L.push(`  Tie: ${o.tie}`);
  }

  L.push('');
  L.push('# CREATURES IN THE SCENE');
  const here = Object.values(state.creatures).filter((c) => c.siteId === site.id);
  if (!here.length) L.push('None are present yet.');
  for (const c of here) {
    const health = c.segments != null ? `Segments ${c.segments}/${c.segMax}` : `MI ${c.mi}/${c.miMax}`;
    if (c.down) { L.push(`- ${c.name} (id "${c.cid}"): DESTROYED. It is out of the scene: it cannot act, block the way or be struck. Describe it only as wreckage.`); continue; }
    L.push(`- ${c.name} (id "${c.cid}", block ${c.blockId}): ${health}; band ${c.band}${c.conditions.length ? `; ${c.conditions.map((x) => x.name).join(', ')}` : ''}`);
  }
  const downNow = here.filter((c) => c.down);
  if (downNow.length && !here.some((c) => !c.down)) L.push('Every creature here is destroyed. Do not describe any of them as alive, standing or holding a line.');

  L.push('');
  const paidHere = (state.paid || []).filter((p) => p.site === site.id);
  if (paidHere.length) {
    const byWhy = {};
    for (const p of paidHere) (byWhy[p.why] = byWhy[p.why] || []).push((state.organisms[p.org] || {}).name || p.org);
    L.push(`# ALREADY PAID AT THIS SITE (do not pay these again): ${Object.entries(byWhy).map(([w, who]) => `"${w}" to ${who.join(' and ')}`).join('; ')}`);
    L.push('');
  }
  L.push(`# CLOCKS (the players can see these): ${Object.values(state.clocks).map((c) => `${c.name} ${c.filled}/${c.segments}${c.aiAdvanced ? ' (already advanced this session)' : ''}`).join(' · ')}`);
  L.push('CARCASS advances when a Beat passes with nothing shipped, a new panel is opened, a pump starts, or the Cohort rests; rewinds when a panel is salted or a chamber drained. TOLL advances when the Cohort is loud in the channels (a Pulse War) or refuses the law; rewinds when it produces paper (a toll chit, a stamp). HUNGER advances when a body is left unharvested or the Cohort fights loudly; rewinds when it harvests what it kills.');

  L.push('');
  const f = state.fight;
  if (f) {
    L.push(`# PULSE WAR — Cycle ${f.cycle}`);
    for (const k of f.order) {
      const a = f.actors[k];
      const body = a.kind === 'org' ? state.organisms[a.id] : state.creatures[a.id];
      if (!body) continue;
      L.push(`- ${body.name} (${a.kind === 'org' ? 'player' : 'creature'}): ${a.status}${a.status === 'acting' || a.status === 'holding' ? `, ${a.pp} Pulse Points left` : ''}${a.reserve ? ', holding a Reserve' : ''}${f.turn === k ? '  <= ACTING NOW' : ''}`);
    }
    const cur = f.turn ? f.actors[f.turn] : null;
    L.push('Creature costs: a Strike 2 Pulse Points, a Drift 1, a Reserve 1. A creature with fewer Pulse Points left than an action costs cannot take it: end its turn instead.');
    const up = Object.values(state.creatures).filter((c) => c.siteId === state.scene.siteId && !c.down);
    if (up.length) L.push(`Still up: ${up.map((c) => c.name).join(', ')}. While any creature is up you cannot end the Pulse War or change site: if a player wants to leave, say the creatures block the way and ask what they do.`);
    if (cur && cur.kind === 'cre') L.push('It is a creature\'s turn: act for it now, then end its turn.');
    else if (cur) L.push('It is a player\'s turn: they act on their own screen. Do not use any creature tool now (no creature_move, creature_strike, creature_special, creature_reserve): creatures act only on their own turns. Narrate and ask.');
  } else {
    L.push('# NO PULSE WAR. Pulse Points do not exist right now: do not mention them.');
  }

  L.push('');
  L.push('# ROLLS WAITING');
  if (!state.requests.length) L.push('None.');
  for (const q of state.requests) L.push(`- ${q.actor.name}: ${q.label} — ${q.pool.dice} dice against ${q.at ?? 'no Threshold'}${q.kind === 'incoming' ? ' (waiting on the target\'s reaction)' : ' (waiting for the player to roll)'}`);

  const rolls = state.rolls.filter((r) => r.kind !== 'frequency').slice(-3);
  if (rolls.length) {
    L.push('');
    L.push('# LATEST ROLLS (oldest first)');
    for (const r of rolls) {
      const res = r.source === 'baseline' ? 'no roll needed: passed on Baseline (no Overflow)'
        : r.at == null ? `dice ${r.dice.join(',')} total ${r.total}`
          : `dice ${r.dice.join(',')} = ${r.total} against ${r.at}: ${r.success ? `SUCCESS, Overflow ${r.overflow}` : `FAILED, short by ${r.shortBy}`}`;
      L.push(`- ${r.who} — ${r.label}: ${res}${r.runaway ? ' — RUNAWAY CATALYSIS (say so)' : ''}${r.stressMarked ? ` — marked ${r.stressMarked} Stress, now ${r.stressNow}` : ''}${r.damage != null && r.segments == null ? ` — ${r.damage} damage` : ''}${r.segments != null ? ` — ${r.segments} Segments removed` : ''}`);
    }
  }

  L.push('');
  L.push('# THE STORY SO FAR (most recent last)');
  const story = (state.story || []).slice(-16);
  if (!story.length) L.push('Nothing yet. This is the opening: set the scene for the Cohort.');
  for (const e of story) L.push(`${e.kind === 'narration' ? 'DIRECTOR' : e.who.toUpperCase()}: ${e.text}`);
  const recent = state.log.slice(-8).filter((l) => ['act', 'hit', 'clock', 'scene', 'rest', 'award', 'danger'].includes(l.kind));
  if (recent.length) {
    L.push('');
    L.push('# WHAT THE ENGINE JUST RECORDED');
    for (const l of recent) L.push(`- ${l.text}`);
  }

  L.push('');
  if (hostNote) L.push(`# NOTE FROM THE HOST (follow it): ${hostNote}`);
  L.push(`# YOUR MOVE${reason ? ` (${reason})` : ''}. Use tools if the world must change, then narrate in plain text and end on one question.`);
  return L.join('\n');
}

// ---- checks on what the Director wrote, before anyone sees it --------------------
const NUM = '(?:\\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|zero|a single point)';
const HEALTH = new RegExp(`\\b(?:integrity|MI)\\b[^.?!]{0,30}\\b${NUM}\\b|\\b${NUM}\\b[^.?!]{0,12}\\b(?:Membrane )?(?:Integrity|MI)\\b`, 'i');

// moved: the Cohort changed site this turn, so the narration is one sentence of travel.
export function checkNarration(text, state, { moved = false } = {}) {
  const flags = [];
  // A creature's health in numbers ("its integrity drops to seven"). A player's own MI may be said.
  const kinds = [...new Set(Object.values(state.creatures || {}).map((c) => String(c.name).replace(/\s+[A-Z]$/, '').split(/\s+/).pop().toLowerCase()).filter((w) => w.length > 2))];
  const people = Object.values(state.organisms || {}).filter((o) => o.playerId).map((o) => String(o.name).split(/\s+/)[0].toLowerCase());
  // Whoever is named last before the number owns it: "bites Bresk, down to 34 MI" is Bresk's.
  const creatureOwns = (sn) => {
    const m = sn.match(HEALTH);
    if (!m) return false;
    const before = sn.slice(0, m.index + m[0].length).toLowerCase();
    const last = (words) => Math.max(-1, ...words.map((w) => before.lastIndexOf(w)));
    return last(kinds) > last(people);
  };
  const sentences = text.split(/(?<=[.?!])\s+/);
  if (kinds.length && sentences.some(creatureOwns)) {
    flags.push({ kind: 'leak', text: 'Gives a creature\'s Membrane Integrity as a number.' });
  }
  if (/\bBSP\b|\bMT\s*\d|\bsoak\s*\d|\bpool\s*\d|\b\d+d\b|\bSegments?\s+\d+\s*\/|\bstat[- ]block\b/i.test(text)
    // A creature's own numbers in words: "a pool of three dice", "its Membrane Threshold of 12".
    || /Membrane Threshold|\bpool of (?:\w+ )?dice\b|\b(?:one|two|three|four|five|six|seven|eight|nine|ten|\d+) dice (?:against|to beat)\b/i.test(text)) {
    flags.push({ kind: 'leak', text: 'May be reading out a creature\'s block or numbers.' });
  }
  if (/Director-only|site notes|briefing|tool\b|ask_for_roll|the Engine/i.test(text)) flags.push({ kind: 'leak', text: 'Mentions the machinery (notes, briefing, tools).' });
  const q = (text.match(/\?/g) || []).length;
  if (q === 0 && !moved) flags.push({ kind: 'style', text: 'Does not end on a question.' });
  if (q > 1) flags.push({ kind: 'style', text: `Asks ${q} questions; it should ask one.` });
  const words = text.split(/\s+/).filter(Boolean).length;
  if (words > 170) flags.push({ kind: 'style', text: `Long: ${words} words.` });
  if (!state.fight && /\bPulse Points?\b|\bPP\b/.test(text)) flags.push({ kind: 'style', text: 'Mentions Pulse Points outside a Pulse War.' });
  if (/[*_#]{2,}|^\s*[-*]\s/m.test(text)) flags.push({ kind: 'style', text: 'Uses formatting; it should be plain text.' });
  return flags;
}

// ---- one turn -------------------------------------------------------------------
// A turn may be tried again from the same table: a model that uses its tools and
// then says nothing gets one fresh attempt before the host sees a problem.
const ATTEMPTS = 2;

export async function directorTurn(args) {
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const done = await oneAttempt(args);
    if (done) return done;
  }
  throw new ProviderError('The Director used its tools but never said anything to the table, even after a second try. Press "Take a turn" again.');
}

// Returns null when the model never narrated, so the caller can try again.
async function oneAttempt({ state, scenario, bestiary, provider, rng, now = 0, reason = '', hostNote = '' }) {
  const T = toolbox({ state, scenario, bestiary, rng, now });
  const chat = provider.start({ system: INSTRUCTIONS, tools: TOOLS });
  const calls = [];
  const usage = { in: 0, out: 0 };
  let reply = await chat.send(briefing(state, scenario, bestiary, { reason, hostNote }));
  let narration = '';
  let nudged = false;
  for (let step = 0; step < MAX_STEPS; step++) {
    usage.in += reply.usage.in;
    usage.out += reply.usage.out;
    if (reply.calls.length) {
      const results = reply.calls.map((c) => {
        const result = T.run(c.name, c.args);
        calls.push({ name: c.name, args: c.args, result });
        return { call: c, result };
      });
      reply = await chat.results(results);
      continue;
    }
    narration = reply.text;
    if (narration || nudged) break;
    nudged = true;
    reply = await chat.send('You have not said anything to the table yet. Narrate now, in plain text, and end on one question.');
  }
  if (!narration) return null;
  narration = narration.replace(/\*\*/g, '').trim();
  const moved = T.state.scene.siteId !== state.scene.siteId;
  let flags = checkNarration(narration, T.state, { moved });
  // One rewrite before anyone sees it, for a suspected leak, a reply that runs long, or one that
  // does not end on a question. A better rewrite replaces the draft; otherwise the draft and its
  // flags stand (and a leak is held for the host).
  const isLeak = (f) => f.kind === 'leak';
  const fixable = (f) => f.kind === 'style' && /^(Long|Does not end)/.test(f.text);
  if (flags.some((f) => isLeak(f) || fixable(f))) {
    const asks = [];
    if (flags.some(isLeak)) asks.push(`It gave away something the table must not hear: ${flags.filter(isLeak).map((f) => f.text).join(' ')} Leave out every creature number (no dice, Thresholds, Membrane Integrity or soak) and do not name the briefing, notes or tools; describe what the organisms can see or sense instead.`);
    if (flags.some((f) => /^Long/.test(f.text))) asks.push('It is too long: use two to four short sentences, under 90 words, keeping only what the players need to act.');
    if (flags.some((f) => /^Does not end/.test(f.text))) asks.push('It does not end on a question: end on exactly one question, put to one named organism.');
    try {
      const fix = await chat.send(`Rewrite your whole reply. ${asks.join(' ')} Keep the same events and any roll you asked for, in plain text, ending on one question. Do not call any tools.`);
      usage.in += fix.usage.in;
      usage.out += fix.usage.out;
      const text = String(fix.text || '').replace(/\*\*/g, '').trim();
      const again = text && !(fix.calls || []).length ? checkNarration(text, T.state, { moved }) : null;
      const bad = (list) => list.filter((f) => isLeak(f) || f.kind === 'style').length;
      if (again && !again.some(isLeak) && bad(again) < bad(flags)) {
        const why = flags.some(isLeak) ? 'the first draft gave away a creature\'s numbers or the machinery' : 'the first draft ran long or did not end on a question';
        narration = text;
        flags = [...again, { kind: 'note', text: `Rewritten once: ${why}.` }];
      }
    } catch (e) { /* the rewrite failed: keep the original and its flags */ }
  }
  if (T.refusals) flags.push({ kind: 'rule', text: `The Engine refused ${T.refusals} thing${T.refusals > 1 ? 's' : ''} the Director tried. Nothing refused took effect.` });
  T.do({ type: 'narrate', text: narration, by: 'ai' });
  return { state: T.state, narration, calls, flags, usage, refusals: T.refusals };
}
