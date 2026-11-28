// Plain words (a human player of The Osmotic Expanse, 27 Nov: the setting's in-the-know words were hard to
// follow). A module's own words come from lore.json "glossary" ({ term, means }). Shared by the Director
// (brain/director.js) and the screens (public/app.js):
//   - the screens underline a glossary word's first use in a piece of narration; a tap shows what it means;
//   - the Ledger keeps the words the table has met (state.words), and the briefing names them;
//   - a new word the Director left unexplained gets its short meaning in brackets, added by the Engine.

const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// The module's words as { word, plain }.
export const glossaryOf = (mod) => ((mod && mod.lore && mod.lore.glossary) || [])
  .filter((g) => g && g.term && g.means).map((g) => ({ word: String(g.term), plain: String(g.means) }));

// Every glossary word in the text, first use only, longest first. A module's words are often plain English
// ("Health", "Truth", "Depth"), so a word counts only as written, capitalised, and not at the start of a
// sentence; names of people and creatures are blanked first.
export function termsIn(text, glossary = [], names = []) {
  let t = String(text || '');
  for (const n of names.filter(Boolean).sort((a, b) => b.length - a.length)) {
    t = t.replace(new RegExp(`\\b${escRe(n)}\\b`, 'g'), (m) => ' '.repeat(m.length));
  }
  const out = [];
  for (const g of [...glossary].sort((a, b) => b.word.length - a.word.length)) {
    const re = new RegExp(`(?<![\\w-])${escRe(g.word.replace(/^The /, ''))}s?(?![\\w-])`, 'g');
    let m;
    while ((m = re.exec(t))) {
      if (/(?:^|[.!?]["”’]?\s+|\n\s*)$/.test(t.slice(0, m.index))) continue;
      out.push({ word: g.word, plain: g.plain, index: m.index, end: m.index + m[0].length });
      t = t.slice(0, m.index) + ' '.repeat(m[0].length) + t.slice(m.index + m[0].length);
      break;
    }
  }
  return out.sort((a, b) => a.index - b.index);
}

// Is this use explained where it stands: a bracket, dash, comma or colon after it, "is/means" after it,
// or "called/known as" before it.
export function glossedAt(text, hit) {
  // Past a possessive: "the Belt's, the factory district's" is explained (Ninth Shift bench, 27 Nov).
  const after = text.slice(hit.end, hit.end + 70).replace(/^['’]s\b/, '');
  const before = text.slice(Math.max(0, hit.index - 30), hit.index);
  if (/^\s*(?:\(|[,:;—–]|-\s|(?:is|are|was|were|means|meaning|that is)\b)/.test(after)) return true;
  return /\([^)]*$/.test(before) || /\b(?:called|known as|named|the word)\s+(?:the\s+|a\s+|an\s+)?$/i.test(before);
}

// A meaning short enough for brackets: its first sentence, cut at a colon if long, first word lower case.
export function shortPlain(plain) {
  let s = String(plain || '').split(/(?<=\.)\s/)[0].replace(/\.$/, '').trim();
  if (s.length > 70) s = s.split(/[:;]/)[0].trim();
  if (/^(?:The|A|An)\s/.test(s) || (/^[A-Z][a-z]+\b/.test(s) && !/^[A-Z][a-z]+\s+[A-Z]/.test(s))) s = s[0].toLowerCase() + s.slice(1);
  return s;
}

export const namesIn = (s) => [...Object.values(s.chars || {}), ...Object.values(s.creatures || {})].map((x) => x.name).filter(Boolean);
const known = (s) => new Set((s.words || []).map((w) => String(w).toLowerCase()));

// The new words a reply leaves unexplained get their meaning in brackets; nothing else changes.
export function glossInline(text, glossary, s) {
  const have = known(s);
  const bare = termsIn(text, glossary, namesIn(s)).filter((h) => !have.has(h.word.toLowerCase()) && !glossedAt(text, h));
  let out = String(text);
  // After a possessive, not inside it: "the Belt's (the factory district) wage", never "the Belt (…)'s".
  for (const h of [...bare].sort((a, b) => b.index - a.index)) {
    const at = h.end + ((/^['’]s\b/.exec(out.slice(h.end)) || [''])[0].length);
    out = `${out.slice(0, at)} (${shortPlain(h.plain)})${out.slice(at)}`;
  }
  return { text: out, words: bare.map((h) => h.word) };
}

export const wordsUsed = (text, glossary, s) => termsIn(text, glossary, namesIn(s)).map((h) => h.word);

// The briefing's line: what the table knows, and the new words this place may need, with their meanings.
export function wordsBrief(s, glossary, place) {
  if (!glossary.length) return [];
  const have = known(s);
  const knownList = glossary.filter((g) => have.has(g.word.toLowerCase())).map((g) => g.word);
  const blob = JSON.stringify(place || {});
  const here = glossary.filter((g) => !have.has(g.word.toLowerCase()) && blob.includes(g.word)).slice(0, 6);
  const L = [`\nPLAIN WORDS: ${knownList.length ? `the table already knows ${knownList.join(', ')}.` : 'the table has not been told any of this game\'s own words yet.'} The first time you use one of the game's own words, say what it means in a few plain words in the same sentence; prefer everyday words.`];
  if (here.length) L.push(`Words this place may need: ${here.map((g) => `${g.word} = ${g.plain}`).join(' | ')}`);
  return L;
}
