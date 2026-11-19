// The AI Director's turn: build the briefing, let the model use its tools, check what it wants to
// say, and hand back the new state and the narration. The model never touches the Ledger directly.

import { readFileSync } from 'node:fs';
import { TOOLS, toolbox, statLine } from './tools.js';
import * as R from '../engine/rules.js';
import { ProviderError } from './net.js';

export const INSTRUCTIONS = readFileSync(new URL('./instructions.md', import.meta.url), 'utf8');
const MAX_STEPS = 14;
const ATTEMPTS = 2;

const pcLine = (s, p, srd) => {
  const pl = p.playerId && s.players[p.playerId] ? `played by ${s.players[p.playerId].name}` : 'no player: you play them';
  const hp = p.dead ? 'DEAD' : p.hp <= 0 ? (p.stable ? 'at 0 hp, unconscious but stable' : `at 0 hp and DYING (${p.death.s} successes, ${p.death.f} failures)`) : `HP ${p.hp}/${p.maxHp}${p.tempHp ? ` +${p.tempHp} temp` : ''}`;
  const bits = [
    `${p.name} (id ${p.id}, ${pl}): level ${p.level} ${p.raceName} ${p.clsName}${p.subclassName ? ` (${p.subclassName})` : ''}`,
    hp, `AC ${p.ac}`, `passive Perception ${p.passive}`,
    p.conds.length ? `conditions: ${p.conds.join(', ')}` : '', p.exhaustion ? `exhaustion ${p.exhaustion}` : '',
    p.conc ? `concentrating on ${p.conc.name}` : '', p.raging ? 'raging' : '',
    p.cast ? `spell save DC ${p.cast.dc}` : '', p.inspiration ? 'has inspiration' : '',
    `skills: ${p.skills.map((x) => (R.index(srd).skill[x] || {}).name || x).join(', ')}`,
  ];
  return `- ${bits.filter(Boolean).join('; ')}.`;
};

export function briefing(state, adventure, srd, { reason = '', hostNote = '', chapters = [] } = {}) {
  const s = state;
  const site = (adventure.sites || []).find((x) => x.id === s.scene.siteId) || (adventure.sites || [])[0] || {};
  const lastNarr = [...s.story].reverse().find((e) => e.kind === 'narration');
  const lastSeq = lastNarr ? lastNarr.seq : 0;
  const narrHere = s.story.filter((e) => e.kind === 'narration' && e.site === site.id).length;
  const out = [];
  out.push(`WHY YOU ARE TAKING A TURN: ${reason || 'the table is waiting for the DM'}.`);
  if (hostNote) out.push(`A NOTE FROM THE HUMAN HOST (follow it): ${hostNote}`);
  out.push(`ADVENTURE: ${adventure.name}.${!s.started ? ` This is the very start of the game. Open with the adventure's introduction in your own words: ${adventure.intro}` : ''}`);
  out.push(`TIME: day ${s.time.day}, ${String(Math.floor(s.time.hour)).padStart(2, '0')}:00.`);

  out.push(`\nWHERE THE PARTY IS: ${site.name} (id ${site.id}).`);
  if (narrHere === 0) out.push(`They have just arrived. Describe it once now (read-aloud, put in your own words if you like): ${site.read}`);
  else out.push(`You have already described this place (${narrHere} narration${narrHere > 1 ? 's' : ''} here). Do not describe it again: only what changes.`);
  out.push(`NOTES FOR THIS PLACE (for you only, never read out): ${site.notes || 'none'}`);
  if ((site.npcs || []).length) out.push(`PEOPLE HERE:\n${site.npcs.map((n) => `- ${n.name}: ${n.who}. Voice: ${n.voice}. Wants: ${n.wants}.`).join('\n')}`);
  if ((site.checks || []).length) out.push(`WHAT A SUCCESSFUL CHECK REVEALS HERE:\n${site.checks.map((c) => `- ${(R.index(srd).skill[c.skill] || {}).name || c.skill} DC ${c.dc}: ${c.find}`).join('\n')}`);
  if (site.treasure) out.push(`TREASURE HERE (give it when found): ${site.treasure}`);
  out.push(`EXITS: ${(site.exits || []).map((e) => `${e.to} (${e.label})`).join('; ') || 'none'}`);

  const foes = Object.values(s.foes).filter((f) => f.siteId === site.id);
  if (foes.length) {
    out.push(`\nMONSTERS HERE:\n${foes.map((f) => `- ${f.name} (id ${f.id}, ${f.mid})${f.dead ? `: ${f.fled ? 'fled' : 'down'}` : `: HP ${f.hp}/${f.maxHp}, AC ${f.ac}${f.conds.length ? `, ${f.conds.join(', ')}` : ''}${f.hidden ? ', HIDDEN (the players have not seen it)' : ''}${Object.keys(f.spent || {}).length ? `, used: ${Object.keys(f.spent).join(', ')}` : ''}`}${f.note ? `. ${f.note}` : ''}`).join('\n')}`);
    const kinds = [...new Set(foes.filter((f) => !f.dead).map((f) => f.mid))];
    const ix = R.index(srd);
    if (kinds.length) out.push(`STAT BLOCKS (for you only):\n${kinds.map((k) => `- ${statLine(ix.monster[k])}`).join('\n')}`);
  }

  const pcs = Object.values(s.pcs);
  out.push(`\nTHE PARTY:\n${pcs.length ? pcs.map((p) => pcLine(s, p, srd)).join('\n') : '- Nobody has made a character yet. Welcome the table and ask them to make their characters.'}`);
  const players = Object.values(s.players).filter((p) => !p.pcId);
  if (players.length) out.push(`At the table without a character yet: ${players.map((p) => p.name).join(', ')}.`);

  if (s.fight) {
    const f = s.fight;
    const nm = (k) => { const [kind, id] = k.split(':'); return kind === 'pc' ? s.pcs[id].name : s.foes[id].name; };
    if (f.phase === 'initiative') out.push(`\nFIGHT: waiting for initiative rolls from ${s.requests.filter((q) => q.kind === 'initiative').map((q) => s.pcs[q.pcId].name).join(', ')}. Describe the moment battle is joined; do not take turns yet.`);
    else {
      const cur = f.order[f.turn].key;
      const pc = cur.startsWith('pc:') ? s.pcs[cur.slice(3)] : null;
      out.push(`\nFIGHT, round ${f.round}. Order: ${f.order.map((o) => `${nm(o.key)} (${o.init})`).join(', ')}.`);
      out.push(`ACTING NOW: ${nm(cur)}: ${pc ? (pc.playerId ? 'a player. Describe the moment and ask them what they do. Do not act for them.' : 'a character with no player: you choose what they do (use their sheet), then end_turn.') : 'a monster. Act for it with monster_action (or another tool), then end_turn. Then, if the next in the order is also a monster, act for it too; stop when a player is up.'}`);
      if (pc && pc.hp <= 0 && !pc.dead && !pc.stable) out.push(`${pc.name} is dying: the death save is on their screen.`);
    }
  }

  if (s.requests.length) out.push(`\nROLLS WAITING (do not narrate their outcome yet): ${s.requests.map((q) => `${(s.pcs[q.pcId] || {}).name}: ${q.kind === 'initiative' ? 'initiative' : q.kind === 'death' ? 'death save' : q.skill ? `${(R.index(srd).skill[q.skill] || {}).name} check DC ${q.dc}` : `${R.ABILITY_NAMES[q.ability]} ${q.kind} DC ${q.dc}`}${q.reason ? ` (${q.reason})` : ''}`).join('; ')}.`);

  const fresh = s.rolls.filter((r) => r.seq > lastSeq);
  if (fresh.length) out.push(`\nROLLS SINCE YOUR LAST NARRATION:\n${fresh.slice(-16).map((r) => `- ${r.who}: ${r.label}${r.reason ? ` (${r.reason})` : ''}: ${r.total}${r.at != null ? ` against ${r.at}` : ''}${r.success === true ? ', SUCCESS' : r.success === false ? ', FAILURE' : ''}${r.crit ? ', critical' : ''}${r.dmg && r.dmg.total != null ? `, ${r.dmg.total} damage` : ''}`).join('\n')}`);

  const open = s.quests.filter((q) => !q.done);
  if (s.quests.length) out.push(`\nQUESTS: ${s.quests.map((q) => `${q.id} ${q.done ? '(done) ' : ''}${q.text}`).join('; ')}`);
  void open;
  if (s.loot.length) out.push(`PARTY LOOT NOT YET CLAIMED: ${s.loot.map((x) => `${x.qty > 1 ? `${x.qty} ` : ''}${x.name}`).join(', ')}.`);
  const seeds = (s.seeds || []).filter((x) => x.on);
  if (seeds.length) out.push(`\nTHE DM'S OWN STORY SEEDS (weave in when they fit):\n${seeds.map((x) => x.text).join('\n---\n')}`);
  if (chapters.length) out.push(`\nTHE STORY SO FAR:\n${chapters.map((c) => `- ${c.site}: ${c.text}`).join('\n')}`);

  const recent = s.story.slice(-16);
  if (recent.length) out.push(`\nRECENTLY AT THE TABLE (newest last; lines after your last narration are new):\n${recent.map((e) => `${e.seq > lastSeq ? '* ' : '  '}${e.who ? `${e.who}: ` : ''}${e.text}`).join('\n')}`);
  out.push('\nNow take your turn: use any tools you need, then narrate, ending on one question to one named character.');
  return out.join('\n');
}

// ---- checking what the model wants to say -------------------------------------------------------
export const LEAK = /\bthe notes\b|\bbriefing\b|\bthe Engine\b|\bthe Ledger\b|\bthe tools?\b|\bread-aloud\b|\bfor you only\b|\bstat block\b|\bDM only\b/i;
// Bench, 20 Nov: "only two hit-points of spite left in him" (a goblin's hit points, in words) got through.
const NUM = '(?:\\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|a few|a couple of)';
const NUMBERS = new RegExp(`\\b(?:AC|Armou?r Class)\\s*(?:of\\s*)?\\d+|\\bDC\\s*\\d+|\\b${NUM}\\s*(?:hit[- ]points?|hp)\\b|\\+\\d+\\s*to hit\\b`, 'i');
const ROLL_WORDS = /\b(?:make|roll|give me|i need|let's see)\b[^.?!]{0,40}\b(?:check|saving throw|save|roll)\b|\broll (?:a|for|me)\b/i;

export function checkNarration(text, state, { asked = false } = {}) {
  const flags = [];
  const t = String(text || '');
  if (LEAK.test(t)) flags.push({ kind: 'leak', text: `Mentions the machinery ("${(t.match(LEAK) || [])[0]}").` });
  if (NUMBERS.test(t)) flags.push({ kind: 'leak', text: `Gives away a number the players should not hear ("${(t.match(NUMBERS) || [])[0]}").` });
  const words = t.split(/\s+/).filter(Boolean).length;
  if (words > 170) flags.push({ kind: 'style', text: `Long: ${words} words.` });
  const outside = t.replace(/"[^"]*"|“[^”]*”/g, '');
  if (!/\?\s*["”]?\s*$/.test(t.trim())) flags.push({ kind: 'style', text: 'Does not end on a question.' });
  const q = (outside.match(/\?/g) || []).length;
  if (q > 2) flags.push({ kind: 'style', text: `Asks ${q} questions.` });
  if (/\*\*|^#+\s|^\s*[-*]\s/m.test(t)) flags.push({ kind: 'style', text: 'Uses formatting.' });
  if (!asked && ROLL_WORDS.test(outside)) flags.push({ kind: 'roll', text: 'Asks for a roll in words.' });
  for (const p of Object.values(state.pcs || {})) {
    if (p.dead) continue;
    if (new RegExp(`\\b${p.name.split(/\s+/)[0]}\\b[^.?!]{0,40}\\b(?:dies|is dead|lies dead|breathes (?:his|her|their) last)\\b`, 'i').test(t)) flags.push({ kind: 'rule', text: `Says ${p.name} is dead, but they are alive.` });
  }
  return flags;
}

export function asksRollInWords(text) { return ROLL_WORDS.test(String(text || '').replace(/"[^"]*"|“[^”]*”/g, '')); }

// Whose turn it is, for the closing question in a fight.
function actingPlayer(state) {
  const f = state.fight;
  if (!f || f.phase !== 'turns') return null;
  const k = (f.order[f.turn] || {}).key || '';
  return k.startsWith('pc:') ? state.pcs[k.slice(3)] : null;
}

export async function directorTurn(args) {
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const done = await oneAttempt(args);
    if (done) return done;
  }
  throw new ProviderError('The Director used its tools but never said anything to the table, even after a second try. Press "Take a turn" again.');
}

async function oneAttempt({ state, adventure, srd, provider, rng, now = 0, reason = '', hostNote = '', memory = null }) {
  const T = toolbox({ state, adventure, srd, rng, now, memory });
  const chat = provider.start({ system: INSTRUCTIONS, tools: TOOLS });
  const calls = [];
  const usage = { in: 0, out: 0 };
  let reply = await chat.send(briefing(state, adventure, srd, { reason, hostNote, chapters: memory ? memory.chapters : [] }));
  let narration = '';
  let nudged = false;
  let rollNudged = false;
  const maxSteps = MAX_STEPS + 3 * Math.min(10, Object.values(state.foes || {}).filter((f) => !f.dead && f.siteId === state.scene.siteId).length);
  for (let step = 0; step < maxSteps; step++) {
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
    narration = String(reply.text || '').trim();
    const asked = T.state.requests.length > state.requests.length || calls.some((c) => c.name === 'ask_for_roll' && !c.result.refused);
    if (narration && !rollNudged && !asked && asksRollInWords(narration)) {
      rollNudged = true;
      narration = '';
      reply = await chat.send('You asked for a roll in words, but nothing is on the player\'s screen. Call ask_for_roll now for that roll, then give your narration again, ending on one question. If no roll is needed, narrate again without asking for one.');
      continue;
    }
    if (narration || nudged) break;
    nudged = true;
    reply = await chat.send('You have not said anything to the table yet. Narrate now, in plain text, and end on one question to one named character.');
  }
  if (!narration) {
    try {
      const last = await chat.send('Stop calling tools. Say now, in two to four short sentences of plain text, what the party sees, and end on one question to one named character.');
      usage.in += last.usage.in; usage.out += last.usage.out;
      narration = String(last.text || '').trim();
    } catch (e) { /* fall through */ }
  }
  if (!narration) {
    const who = actingPlayer(T.state);
    narration = who ? `${who.name}, it is your turn. What do you do?` : 'What do you do?';
    calls.push({ name: '(plain line)', args: {}, result: { note: 'The Director said nothing; the Engine asked the table what is next.' } });
  }
  narration = narration.replace(/\*\*/g, '').trim();
  const askedNow = T.state.requests.length > 0;
  let flags = checkNarration(narration, T.state, { asked: askedNow });
  const fixable = flags.filter((f) => f.kind !== 'roll');
  if (fixable.length) {
    const asks = [];
    if (flags.some((f) => f.kind === 'leak')) asks.push(`It gives away something the players must not hear: ${flags.filter((f) => f.kind === 'leak').map((f) => f.text).join(' ')} Leave out monsters' numbers (AC, hit points, DCs, bonuses) and never mention notes, briefings, tools or the Engine. Describe what the characters see instead.`);
    if (flags.some((f) => /^Long/.test(f.text))) asks.push('It is too long: keep it under 110 words.');
    if (flags.some((f) => /^Asks \d+ questions/.test(f.text))) asks.push('Ask exactly one question, to one named character.');
    if (flags.some((f) => /^Uses formatting/.test(f.text))) asks.push('Write plain sentences only: no lists, headings or bold.');
    if (flags.some((f) => f.kind === 'rule')) asks.push('A character you called dead is alive: only the rules can kill a character. Keep them alive.');
    const who = actingPlayer(T.state);
    if (flags.some((f) => /^Does not end/.test(f.text))) asks.push(`End on exactly one question to one named character${who ? ` (it is ${who.name}'s turn)` : ''}.`);
    try {
      const fix = await chat.send(`Rewrite your whole reply. ${asks.join(' ')} Keep the same events and any roll you asked for. Do not call any tools.`);
      usage.in += fix.usage.in; usage.out += fix.usage.out;
      const text = String(fix.text || '').replace(/\*\*/g, '').trim();
      if (text && !(fix.calls || []).length) {
        const again = checkNarration(text, T.state, { asked: askedNow });
        const bad = (l) => l.filter((f) => f.kind !== 'note').length;
        if (bad(again) < bad(flags) || (!again.some((f) => f.kind === 'leak') && flags.some((f) => f.kind === 'leak'))) {
          narration = text;
          flags = [...again, { kind: 'note', text: 'Rewritten once before anyone saw it.' }];
        }
      }
    } catch (e) { /* keep the first draft and its flags */ }
  }
  // A leak that survived the rewrite: cut the sentences that carry it.
  if (flags.some((f) => f.kind === 'leak')) {
    const parts = narration.split(/(?<=[.!?])\s+/);
    const kept = parts.filter((p) => !LEAK.test(p) && !NUMBERS.test(p));
    if (kept.length && kept.length < parts.length) {
      narration = kept.join(' ');
      flags = checkNarration(narration, T.state, { asked: askedNow }).concat([{ kind: 'note', text: 'The Engine cut a sentence that gave something away.' }]);
    }
  }
  // In a fight, the closing question goes to the player whose turn it is. Local models often ask the
  // last speaker instead (bench, 20 Nov): the Engine knows whose turn it is, so it sets the question.
  {
    const who = actingPlayer(T.state);
    const waiting = (T.state.requests || []).some((q) => !who || q.pcId !== who.id);
    if (who && who.playerId && !waiting) {
      const parts = narration.split(/(?<=[.!?]["”]?)\s+/);
      const lastQ = parts.length ? parts[parts.length - 1] : '';
      if (!new RegExp(`\\b${who.name.split(/\s+/)[0]}\\b`).test(lastQ)) {
        const body = /\?["”]?$/.test(lastQ.trim()) && !/^["“]/.test(lastQ.trim()) ? parts.slice(0, -1) : parts;
        narration = `${body.join(' ')} ${who.name}, what do you do?`.trim();
        flags = flags.filter((f) => !/^Does not end/.test(f.text)).concat([{ kind: 'note', text: `The Engine set the closing question to ${who.name}, whose turn it is.` }]);
      }
    }
  }
  if (T.refusals) flags.push({ kind: 'rule', text: `The Engine refused ${T.refusals} thing${T.refusals > 1 ? 's' : ''} the Director tried. Nothing refused took effect.` });
  T.do({ type: 'narrate', text: narration });
  return { state: T.state, narration, calls, flags, usage, refusals: T.refusals };
}
