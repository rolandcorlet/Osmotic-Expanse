// One Director turn: brief the model from the Ledger, let it act through the
// tools on a sandbox copy, and hand back the proposed new Ledger with its
// narration. Nothing here touches the live table: the caller decides whether to
// commit the result (Auto) or show it to the host first (Co-pilot).

import { readFileSync } from 'node:fs';
import { TOOLS, toolbox, orgMT } from './tools.js';
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
    L.push(`- ${c.name} (id "${c.cid}", block ${c.blockId}): ${c.down ? 'DOWN' : health}; band ${c.band}${c.conditions.length ? `; ${c.conditions.map((x) => x.name).join(', ')}` : ''}`);
  }

  L.push('');
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
    if (cur && cur.kind === 'cre') L.push('It is a creature\'s turn: act for it now, then end its turn.');
    else if (cur) L.push('It is a player\'s turn: they act on their own screen.');
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
export function checkNarration(text, state) {
  const flags = [];
  if (/\bBSP\b|\bMT\s*\d|\bsoak\s*\d|\bpool\s*\d|\b\d+d\b|\bSegments?\s+\d+\s*\/|\bblock\b/i.test(text)) flags.push({ kind: 'leak', text: 'May be reading out a creature\'s block or numbers.' });
  if (/Director-only|site notes|briefing|tool\b|ask_for_roll|the Engine/i.test(text)) flags.push({ kind: 'leak', text: 'Mentions the machinery (notes, briefing, tools).' });
  const q = (text.match(/\?/g) || []).length;
  if (q === 0) flags.push({ kind: 'style', text: 'Does not end on a question.' });
  if (q > 1) flags.push({ kind: 'style', text: `Asks ${q} questions; it should ask one.` });
  const words = text.split(/\s+/).filter(Boolean).length;
  if (words > 170) flags.push({ kind: 'style', text: `Long: ${words} words.` });
  if (!state.fight && /\bPulse Points?\b|\bPP\b/.test(text)) flags.push({ kind: 'style', text: 'Mentions Pulse Points outside a Pulse War.' });
  if (/[*_#]{2,}|^\s*[-*]\s/m.test(text)) flags.push({ kind: 'style', text: 'Uses formatting; it should be plain text.' });
  return flags;
}

// ---- one turn -------------------------------------------------------------------
export async function directorTurn({ state, scenario, bestiary, provider, rng, now = 0, reason = '', hostNote = '' }) {
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
  if (!narration) throw new Error('The Director used its tools but never narrated. Try again.');
  narration = narration.replace(/\*\*/g, '').trim();
  const flags = checkNarration(narration, T.state);
  if (T.refusals) flags.push({ kind: 'rule', text: `The Engine refused ${T.refusals} thing${T.refusals > 1 ? 's' : ''} the Director tried. Nothing refused took effect.` });
  T.do({ type: 'narrate', text: narration, by: 'ai' });
  return { state: T.state, narration, calls, flags, usage, refusals: T.refusals };
}
