// The Director contract: what the model is given and what it may send back, per phase.
import { site, orgs, upOrgs, creaturesHere, liveCreatures } from './world.mjs';
import { legalMoves, play } from './moves.mjs';
import { creatureLook } from './rules.mjs';
import { crewLine, clockWord, question, rollResult } from './lines.mjs';
import { currentActor } from './fight.mjs';

export const INSTRUCTIONS = `You are the Director of a tabletop game. The Engine owns every number, rule and turn; you describe.
- Speak only in the world: what the organisms see, taste and sense. Never say a number about a creature, a throw, a Threshold or damage.
- Use only the words given under LOOKS for how hurt a creature is.
- You may only do what is in LEGAL MOVES. If a player asks for anything else, say that nothing here does that.
- Reply with JSON: {"narration": "two to four short sentences", "choose": "<one id from LEGAL MOVES, or null>"}.
- Do not ask a question: the Engine adds it.`;

export function phaseOf(g) {
  const s = g.s;
  if (s.ended) return 'ended';
  if (!s.scene.siteId) return 'opening';
  if (s.pending) return 'reaction';
  if (s.chase) return 'chase';
  if (s.fight) return 'fight';
  return 'explore';
}

export function briefing(g, { recent = 4 } = {}) {
  const s = g.s;
  const ph = phaseOf(g);
  const L = [];
  const sit = s.scene.siteId ? site(g) : null;
  L.push(`PHASE: ${ph}`);
  if (sit) {
    L.push(`SITE: ${sit.name}. ${sit.readAloud}`);
    const here = creaturesHere(g).filter((c) => c.stoodDown !== 'left-behind' && c.stoodDown !== 'left');
    if (here.length) L.push(`HERE: ${here.map((c) => `${c.name} (${c.down ? 'destroyed' : c.stoodDown ? 'stood down' : c.stance}; ${creatureLook(c)})`).join('; ')}`);
    const npcs = (sit.npcs || []).map((n) => `${n.name} wants ${n.wants}`).join('; ');
    if (npcs) L.push(`WHO: ${npcs}`);
    L.push(`NOTHING ELSE: ${sit.nothingElse || 'nothing else here does anything.'}`);
  }
  L.push(`CLOCKS (the players see these): ${Object.keys(s.clocks).map((id) => clockWord(g, id)).join('; ')}`);
  L.push(`CREW: ${orgs(g).map(crewLine).join('; ')}`);
  const moves = legalMoves(g);
  L.push(`LEGAL MOVES (choose by id): ${moves.map((m) => `${m.id} = ${m.label}`).join(' | ')}`);
  const tail = s.log.filter((x) => !['arrive'].includes(x.kind)).slice(-recent).map((x) => x.text);
  if (tail.length) L.push(`JUST NOW: ${tail.join(' ')}`);
  return L.join('\n');
}

export const estimateTokens = (text) => Math.ceil(String(text).length / 4);

// Tools are built from the legal moves, so an illegal id cannot be sent.
export function replySchema(g) {
  const ids = legalMoves(g).map((m) => m.id);
  return {
    type: 'object', required: ['narration'],
    properties: { narration: { type: 'string', maxLength: 600 }, choose: { enum: [...ids, null] } },
  };
}

export function applyReply(g, reply) {
  const out = { text: String(reply.narration || '').trim(), played: null };
  if (reply.choose) {
    const r = play(g, reply.choose);
    if (!r.ok) return { ...out, rejected: r };
    out.played = r;
  }
  const q = question(g);
  if (q) out.text = `${out.text} ${q}`.trim();
  return out;
}
