// Writes QUORUM v3 from the same cards the Director looks up. Run: node v3/books/build-quorum.mjs
import { writeFileSync } from 'node:fs';
import { QUORUM } from '../director/data/kit/quorum.js';

const L = [];
L.push('# QUORUM — Colonies, Kin, and Law · v3 table edition', '');
L.push('*The society book of The Osmotic Expanse, in the v3 format. Every rule and number here is taken from QUORUM (rev 2) and is unchanged; the section is given on each card so you can find the full text. What is new is the delivery: each part says what it is in plain words, when you use it, the rule as short steps, and how it sounds at the table. The AI Director looks these same cards up during play.*', '');
L.push('*This edition covers what a table needs to run society in play. QUORUM (rev 2) remains the full reference for the Colony Sheet and Colony Builder, lineages in society, culture, the three sample settlements, and the tables of ideas (chapters 2.6–2.8, 8, 14, 16.2–17, 18).*', '');
L.push('## How to use this book', '', 'You never need to announce which rule you are using. A player says what their character does, in their own words. The Director decides which card it falls under, says what is at stake, and calls a roll only if the outcome is in doubt. Most society scenes need no roll at all: they need someone who wants something.', '');
L.push('## Contents', '', ...QUORUM.map((q, i) => `${i + 1}. ${q.name}`), '');
QUORUM.forEach((q, i) => {
  L.push(`## ${i + 1} · ${q.name}`, '', `*QUORUM ${q.ch}*`, '');
  L.push(`**In plain words.** ${q.plain}`, '');
  L.push(`**You use this when:** ${q.when}`, '');
  L.push('**The rule**', '', ...q.rule.map((r) => `- ${r}`), '');
  L.push(`**At the table.** ${q.table}`, '');
});
writeFileSync(new URL('./QUORUM-v3.md', import.meta.url), L.join('\n'));
console.log('QUORUM-v3.md', L.join('\n').length);
