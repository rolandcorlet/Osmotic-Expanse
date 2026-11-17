// Writes the Player's Atlas v3 table edition from the cards the Director uses.
import { writeFileSync } from 'node:fs';
import { ATLAS } from '../director/data/kit/atlas.js';
import { GLOSSARY } from '../director/data/kit/glossary.js';
import { rulingsSection } from './rulings-section.mjs';

const A = [];
A.push('# The Player\'s Atlas · v3 table edition', '');
A.push('*Making an organism, the six Lineages, the twenty-four Phenotypes, advancement and kits, in the v3 format. Every rule and number is from the Player\'s Atlas and is unchanged; each card cites its chapter so you can find the full text. What is new is the delivery: in plain words, when you use it, the rule as short steps, and how it sounds at the table. The Lineages, Phenotypes, Adaptations and builds are generated from the book itself.*', '');
A.push('## How to use this book', '', '- **New to the game?** Read "Making an organism: the eight steps", then the Lineage that sounds like you, then the Phenotypes of its tradition.', '- **In the AI Director game?** You do not need to do the sums. Choose a Lineage and Phenotype; the Engine works out your numbers.', '- **Running a table on paper?** Every formula is in the Step 7 card, and the ten questions players ask are answered at the end.', '');
const groups = [
  ['Making an organism', (q) => /^make-|^worked-example/.test(q.id)],
  ['The six Lineages', (q) => /^lineage-/.test(q.id)],
  ['The twenty-four Phenotypes', (q) => q.id === 'traditions' || /^pheno-/.test(q.id)],
  ['Advancement', (q) => ['growth', 'adaptations', 'stage-change', 'striker-progression'].includes(q.id)],
  ['Kits, builds and the sheet', (q) => /^(starting-packs|build-|cohort-jobs|the-sheet|table-questions)/.test(q.id)],
];
A.push('## Contents', '', ...groups.map(([g], i) => `${i + 1}. ${g}`), '');
let n = 0;
for (const [title, test] of groups) {
  A.push(`# ${title}`, '');
  for (const q of ATLAS.filter(test)) {
    n += 1;
    A.push(`## ${n} · ${q.name}`, '', `*${q.ch}*`, '', `**In plain words.** ${q.plain}`, '', `**You use this when:** ${q.when}`, '', `**Who does the work:** ${q.who}`, '', '**The rule**', '', ...q.rule.map((r) => `- ${r}`), '');
    if (q.table) A.push(`**At the table.** ${q.table}`, '');
  }
}
const used = new Set(groups.flatMap(([, t]) => ATLAS.filter(t).map((q) => q.id)));
const lost = ATLAS.filter((q) => !used.has(q.id));
if (lost.length) { console.error('cards in no group:', lost.map((q) => q.id).join(', ')); process.exit(1); }
A.push('## Words', '', '| Word | In plain words |', '|---|---|', ...GLOSSARY.map((g) => `| ${g.word} | ${g.plain} |`), '');
A.push(...rulingsSection('atlas'));
writeFileSync(new URL('./PLAYERS-ATLAS-v3.md', import.meta.url), A.join('\n'));
console.log('atlas', A.join('\n').length, 'chars,', ATLAS.length, 'cards');
