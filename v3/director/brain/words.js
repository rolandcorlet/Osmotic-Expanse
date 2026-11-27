// Plain words (a human player, 27 Nov: "the terminology was hard to understand with all the in-the-know
// terms"). Three parts share this file:
//   - which setting words the table has already had explained (the Ledger keeps them in state.words);
//   - the briefing lines that tell the Director which words are known and which are new;
//   - the check that sends a reply back once when it uses a new word without saying what it means,
//     or piles on more than two new words at once.
// The player screen also lets anyone tap a setting word in the story to see it in plain words.

import { termsIn } from '../engine/words.js';
export { termsIn };

// Is this use of a word explained where it stands? Lenient on purpose: a bracket, a dash, a comma or
// colon straight after it, "is/means/meaning", or "called/known as" just before it.
export function glossedAt(text, hit) {
  // Past a possessive: "the Belt's, the factory district's" is explained (Ninth Shift bench, 27 Nov).
  const after = text.slice(hit.end, hit.end + 70).replace(/^['’]s\b/, '');
  const before = text.slice(Math.max(0, hit.index - 30), hit.index);
  if (/^\s*(?:\(|[,:;—–]|\s-\s|\s+(?:is|are|was|were|means|meaning|that is|or)\b)/.test(after)) return true;
  if (/\((?:[^)]*)$/.test(before) || /\b(?:called|call it|call them|known as|named|the word)\s+(?:the\s+|a\s+|an\s+)?$/i.test(before)) return true;
  return false;
}

export const namesIn = (state) => [
  ...Object.values(state.organisms || {}).map((o) => o.name),
  ...Object.values(state.creatures || {}).map((c) => c.name),
  ...Object.values(state.cast || {}).map((c) => c.name),
].filter(Boolean);

const known = (state) => new Set((state.words || []).map((w) => String(w).toLowerCase()));

// The style flags for one reply: new words with no plain meaning, and too many new words at once.
export function wordFlags(text, glossary, state) {
  if (!glossary || !glossary.length) return [];
  const have = known(state);
  const hits = termsIn(text, glossary, namesIn(state)).filter((h) => !have.has(h.word.toLowerCase()));
  const flags = [];
  const bare = hits.filter((h) => !glossedAt(text, h));
  if (bare.length) flags.push({ kind: 'style', text: `Uses a setting word the table has not been told yet without saying what it means: ${bare.map((h) => h.word).join(', ')}.`, words: bare.map((h) => ({ word: h.word, plain: h.plain })) });
  // Too many new words at once is reported, not sent back on its own (bench 27 Nov: the rewrite ran on two
  // turns in five, which costs a whole model call each time on a local model).
  if (hits.length > 2) flags.push({ kind: 'note', text: `Uses ${hits.length} new setting words in one reply (${hits.map((h) => h.word).join(', ')}); two at most.`, words: hits.map((h) => ({ word: h.word, plain: h.plain })) });
  return flags;
}

// A meaning short enough to sit in brackets: the first sentence, cut at a colon if it runs long.
export function shortPlain(plain) {
  let s = String(plain || '').split(/(?<=\.)\s/)[0].replace(/\.$/, '').trim();
  if (s.length > 70) s = s.split(/[:;]/)[0].trim();
  if (/^(?:The|A|An)\s/.test(s) || (/^[A-Z][a-z]+\b/.test(s) && !/^[A-Z][a-z]+\s+[A-Z]/.test(s))) s = s[0].toLowerCase() + s.slice(1);
  return s;
}

// The Engine's own fix for a new word left bare: its plain meaning in brackets straight after it.
// No model call (one bare word is not worth a rewrite), and nothing else in the reply changes.
export function glossInline(text, glossary, state) {
  const have = known(state);
  const bare = termsIn(text, glossary, namesIn(state)).filter((h) => !have.has(h.word.toLowerCase()) && !glossedAt(text, h));
  let out = String(text);
  // After a possessive, not inside it: "the Belt's (the factory district) wage", never "the Belt (…)'s".
  for (const h of [...bare].sort((a, b) => b.index - a.index)) {
    const at = h.end + ((/^['’]s\b/.exec(out.slice(h.end)) || [''])[0].length);
    out = `${out.slice(0, at)} (${shortPlain(h.plain)})${out.slice(at)}`;
  }
  return { text: out, words: bare.map((h) => h.word) };
}

// The ask that goes with those flags in the one rewrite.
export function wordAsk(flags) {
  const bare = flags.find((f) => /^Uses a setting word/.test(f.text));
  const many = flags.find((f) => /^Uses \d+ new setting words/.test(f.text));
  const parts = [];
  if (bare) parts.push(`New players do not know these words yet: ${bare.words.map((w) => `${w.word} (${w.plain})`).join('; ')}. The first time you use one, say what it means in a few plain words in the same sentence ("the Churn, the Host's slow digestion, ..."), or use plain words instead.`);
  if (many) parts.push('Use at most two setting words the table has not met yet; say the rest in everyday words.');
  return parts.join(' ');
}

// Every setting word in the final reply: from now on the table has met it (and could tap it).
export function wordsUsed(text, glossary, state) {
  return termsIn(text, glossary || [], namesIn(state)).map((h) => h.word);
}

// The briefing's lines: what the table already knows, and the new words this place is likely to need.
export function wordsBrief(state, scenario, site) {
  const gl = ((scenario || {}).kit || {}).glossary || [];
  if (!gl.length) return [];
  const have = known(state);
  const knownList = gl.filter((g) => have.has(g.word.toLowerCase())).map((g) => g.word);
  const here = termsIn(JSON.stringify(site || {}), gl).filter((h) => !have.has(h.word.toLowerCase())).slice(0, 8);
  const L = [`# PLAIN WORDS: the players are new to this world. ${knownList.length ? `Already explained to this table (use freely): ${knownList.join(', ')}.` : 'No setting word has been explained to this table yet.'} Any other setting word is new to them: the first time, say what it means in a few plain words in the same sentence, and use at most two new ones in a reply. When an everyday word will do, use it.`];
  if (here.length) L.push(`New words this place may need, in plain words: ${here.map((h) => `${h.word} = ${h.plain}`).join(' | ')}`);
  return L;
}
