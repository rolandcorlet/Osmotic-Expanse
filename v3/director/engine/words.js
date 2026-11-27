// Finding the setting's words in a piece of text. Shared by the Director (brain/words.js) and the
// screens (public/app.js), which let a player tap a word in the story to see it in plain words.

// Ordinary English words that are only the setting's word when capitalised mid-sentence ("the Churn",
// "a Beat"). At the start of a sentence they are left alone: "Harvest it now" is just English.
export const COMMON = new Set(['hand', 'site', 'clock', 'strike', 'harvest', 'oath', 'ash', 'cycle', 'soak', 'breach', 'specimen',
  'guild', 'pathway', 'host', 'beat', 'marked', 'receipt', 'intake', 'goodwill', 'churn', 'director', 'stress',
  'condition', 'cohort', 'organism', 'vector', 'baseline', 'overflow', 'sentinel', 'nodule', 'precept', 'congregation',
  'lattice', 'tonic', 'dormancy', 'flagellan', 'inhibitor', 'line', 'row', 'fold', 'badge', 'patent', 'grievance',
  'cohesion', 'drift', 'warden', 'lineage', 'synthesis', 'belt', 'weep', 'wastes', 'expanse', 'antigen']);
// Words the table needs no telling about in a story: the game's own furniture.
export const SKIP = new Set(['director', 'site', 'vector', 'hand']);

const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Every setting word in the text, first use only, longest words first so "Great Cycle" is not also "Cycle".
// Names of people, creatures and organisms are blanked first: "Ash Warden Pell" is a name.
export function termsIn(text, glossary = [], names = []) {
  let t = String(text || '');
  for (const n of names.filter(Boolean).sort((a, b) => b.length - a.length)) {
    t = t.replace(new RegExp(`\\b${escRe(n)}\\b`, 'g'), (m) => ' '.repeat(m.length));
  }
  const out = [];
  const words = [...glossary].filter((g) => g && g.word && !SKIP.has(g.word.toLowerCase())).sort((a, b) => b.word.length - a.word.length);
  for (const g of words) {
    // "The Line" is written with its article; in a sentence it is "the Line".
    const re = new RegExp(`(?<![\\w-])${escRe(g.word.replace(/^The /, ''))}s?(?![\\w-])`, 'g');
    let m;
    while ((m = re.exec(t))) {
      const before = t.slice(0, m.index);
      const sentenceStart = /(?:^|[.!?]["”’]?\s+|\n\s*)$/.test(before);
      if (sentenceStart && COMMON.has(g.word.toLowerCase())) continue;
      out.push({ word: g.word, plain: g.plain, index: m.index, end: m.index + m[0].length });
      t = t.slice(0, m.index) + ' '.repeat(m[0].length) + t.slice(m.index + m[0].length);
      break;
    }
  }
  return out.sort((a, b) => a.index - b.index);
}
