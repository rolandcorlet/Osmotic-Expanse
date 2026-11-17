// The Director's voice. The Engine has already decided everything; the model is asked for two to four
// sentences and, when a player spoke in their own words, for which legal move (if any) they meant.
// One call a beat, no tools, no rewrites: a reply that breaks a rule is dropped and the Engine's own
// lines are used instead, so the table never waits on a second try and never needs a host to step in.
import { site, orgs, legalMoves, creaturesHere, creatureLook, clockWord, crewLine, phaseOf, question } from './engine.mjs';

export const INSTRUCTIONS = `You are the Director of The Osmotic Expanse, a tabletop game played by single-celled organisms in a drowned, microscopic world. A rules Engine owns every number, roll, rule and turn. You are its voice.

How to speak:
- Two to four short sentences, plain text, present tense, in the world: what the organisms see, taste and feel in the water.
- Describe only what ENGINE LINES say happened. Do not add harm, deaths, arrivals, Clock movement or rewards of your own.
- Never say a number. Not for a creature, a throw, damage, distance or a Clock. For how hurt a creature is, use only the words given after its name under HERE.
- A player's organism is alive unless ENGINE LINES say it went down or was lost.
- Do not ask a question and do not tell anyone whose turn it is. The Engine adds that.
- Do not mention the Engine, these notes, moves, ids, dice or rules.

When a PLAYER SAYS something:
- If they are trying to do one of the things under YOU MAY CHOOSE, set "choose" to that id and narrate the attempt only, not its outcome (the Engine rolls it next).
- If they are only asking or talking, set "choose" to null and answer from SITE, HERE and WHO. If nothing printed covers it, say plainly that nothing here does that, in the world's voice.
- Never choose for a player who did not ask for it.

Reply with JSON only: {"narration": "...", "choose": "<an id from YOU MAY CHOOSE, or null>"}`;

const first = (name) => (/^the\s/i.test(String(name)) ? String(name) : String(name).split(/\s+/)[0]);

// What the model is told. Small on purpose: the whole thing stays under about 1,500 tokens.
export function prompt(g, { lines = [], said = null, choices = [], story = [] } = {}) {
  const s = g.s;
  const L = [];
  const sit = s.scene.siteId ? site(g) : null;
  L.push(`MOMENT: ${phaseOf(g)}${s.ended ? ` (the module has ended: ${s.ended})` : ''}`);
  if (sit) {
    L.push(`SITE: ${sit.name}. ${sit.readAloud}`);
    const zones = (sit.zones || []).map((z) => `${z.name}${z.note ? ` (${z.note})` : ''}`).join('; ');
    if (zones) L.push(`PLACES: ${zones}`);
    const here = creaturesHere(g).filter((c) => c.stoodDown !== 'left' && c.stoodDown !== 'left-behind');
    if (here.length) L.push(`HERE: ${here.map((c) => `${c.name}: ${c.down ? 'destroyed' : c.stoodDown ? 'standing aside' : c.stance}; ${creatureLook(c)}`).join(' | ')}`);
    const who = (sit.npcs || []).map((n) => `${n.name} wants ${n.wants}${(n.says || []).length ? `; will say: ${n.says.join(' / ')}` : ''}`).join(' | ');
    if (who) L.push(`WHO: ${who}`);
    if (sit.nothingElse) L.push(`NOTHING ELSE: ${sit.nothingElse}`);
  } else L.push(`PREMISE: ${g.D.vector.premise}`);
  L.push(`CLOCKS: ${Object.keys(s.clocks).map((id) => clockWord(g, id).replace(/ \d+ of \d+/, '')).join('; ')}`);
  L.push(`COHORT: ${orgs(g).map(crewLine).join('; ')}`);
  const tail = story.filter((e) => e.kind === 'director' || e.kind === 'player').slice(-4).map((e) => `${e.kind === 'director' ? 'DIRECTOR' : e.who.toUpperCase()}: ${e.text}`);
  if (tail.length) L.push(`THE LAST FEW LINES AT THE TABLE:\n${tail.join('\n')}`);
  if (lines.length) L.push(`ENGINE LINES (this is what just happened; narrate exactly this):\n- ${lines.join('\n- ')}`);
  if (said) {
    L.push(`PLAYER SAYS (${said.who}): "${said.text}"`);
    L.push(`YOU MAY CHOOSE: ${choices.length ? choices.map((m) => `${m.id} = ${m.label}`).join(' | ') : '(nothing: answer only)'}`);
  } else L.push('Set "choose" to null.');
  return L.join('\n');
}

export function schema(choices) {
  return { type: 'object', additionalProperties: false, required: ['narration', 'choose'],
    properties: { narration: { type: 'string' }, choose: choices.length ? { anyOf: [{ type: 'string', enum: choices.map((m) => m.id) }, { type: 'null' }] } : { type: 'null' } } };
}

const NUMW = 'one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|twenty|thirty|a dozen|half a dozen';
const COUNTED = new RegExp(`\\b(?:${NUMW})\\s+(?:more\\s+)?(?:dice|d6|points?|pulse points?|segments?|sections?|MI|damage|boxes|kinetic|lytic|osmotic|of\\s+(?:${NUMW}))\\b`, 'i');
const MACHINERY = /\b(?:the engine|engine lines?|briefing|legal moves?|json|the notes|the rules say|threshold|membrane integrity|pulse points?|stat ?block|\bMT\b|\bMI\b|\bPP\b|\bATP\b|d6)\b/i;
const BURIAL = '(?:dissolv(?:es|ed|ing)|(?:is|was) (?:dead|gone|lost|no more)|dies|died|is destroyed|stops being|ceases to be)';

// Returns { text } when the narration may be said, or { drop: reason } when the Engine should speak instead.
export function guard(narration, g) {
  let t = String(narration || '').replace(/\*\*|__|^#+\s*/gm, '').replace(/\s+/g, ' ').trim();
  if (!t) return { drop: 'empty' };
  // The Engine asks the one question: cut any the model wrote.
  let sentences = t.match(/[^.!?]+[.!?]+["')\]]*|[^.!?]+$/g) || [t];
  sentences = sentences.map((x) => x.trim()).filter((x) => x && !/\?["')\]]*$/.test(x));
  if (!sentences.length) return { drop: 'only a question' };
  if (sentences.length > 5) sentences = sentences.slice(0, 5);
  t = sentences.join(' ');
  if (/\d/.test(t)) return { drop: 'a number' };
  if (COUNTED.test(t)) return { drop: 'a counted number' };
  if (MACHINERY.test(t)) return { drop: 'machinery' };
  if (/[぀-ヿ㐀-鿿가-힯Ѐ-ӿ]/.test(t)) return { drop: 'another script' };
  for (const o of orgs(g)) {
    if (o.state !== 'up') continue;
    const fn = first(o.name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`\\b${fn}\\b(?!['’]s)[^.]{0,40}\\b${BURIAL}\\b`, 'i').test(t)) return { drop: `buries ${first(o.name)}` };
  }
  if (t.split(/\s+/).length > 130) return { drop: 'too long' };
  return { text: t };
}

// The beats worth a model call when the host has chosen "key moments only".
export const isBeat = (kinds) => kinds.some((k) => ['arrive', 'fight', 'down', 'hazard', 'collapse', 'ending', 'set-piece', 'award', 'stance'].includes(k));

// One beat. Never throws: any failure comes back as { text: Engine lines, fallback: reason }.
export async function speak(provider, g, { lines = [], said = null, choices = [], story = [] } = {}) {
  const plain = lines.join(' ');
  if (!provider || provider.id === 'none') return { text: plain, choose: null, fallback: 'no model', usage: { in: 0, out: 0 }, ms: 0 };
  try {
    const r = await provider.ask({ system: INSTRUCTIONS, user: prompt(g, { lines, said, choices, story }), schema: schema(choices) });
    if (!r) return { text: plain, choose: null, fallback: 'no model', usage: { in: 0, out: 0 }, ms: 0 };
    const choose = r.choose && choices.some((m) => m.id === r.choose) ? r.choose : null;
    const ok = guard(r.narration, g);
    return ok.text ? { text: ok.text, choose, usage: r.usage, ms: r.ms } : { text: plain, choose, fallback: ok.drop, dropped: r.narration, usage: r.usage, ms: r.ms };
  } catch (e) {
    return { text: plain, choose: null, fallback: `model error: ${String(e.message || e).slice(0, 160)}`, usage: { in: 0, out: 0 }, ms: 0 };
  }
}

export { question };
