// Writes the Director's Codex v3 table edition from the cards the Director uses.
import { writeFileSync } from 'node:fs';
import { CODEX, CODEX_CHAPTERS } from '../director/data/kit/codex.js';
import { GLOSSARY } from '../director/data/kit/glossary.js';

const A = ['# The Director\'s Codex · v3 table edition', '',
 '*Running The Osmotic Expanse: judging rolls, running fights, building encounters, the living world, regions, factions, sites, rewards and the tables. Every rule, table and number is the printed Codex\'s own and is unchanged; each section cites its number. What is new is the delivery: each section opens with a plain-words line and when to reach for it. In the AI Director game the Director finds these sections itself with look_up.*', '',
 '## Contents', '', ...Object.entries(CODEX_CHAPTERS).map(([n, t]) => `${n}. ${t}`), ''];
for (const [n, title] of Object.entries(CODEX_CHAPTERS)) {
  A.push(`# ${n} · ${title}`, '');
  for (const q of CODEX.filter((c) => c.chapter === n)) {
    if (q.id !== `codex-${n}`) A.push(`## ${q.name}`, '');
    A.push(`**In plain words.** ${q.plain}`, '', `**You use this when:** ${q.when}`, '', ...q.rule.map((r) => (/^\(.* \| .*\)$/.test(r) ? `**${r.slice(1, -1)}**` : `- ${r}`)), '');
  }
}
A.push('## Words', '', '| Word | In plain words |', '|---|---|', ...GLOSSARY.map((g) => `| ${g.word} | ${g.plain} |`), '');
writeFileSync(new URL('./DIRECTORS-CODEX-v3.md', import.meta.url), A.join('\n'));
console.log('codex', A.join('\n').length, 'chars,', CODEX.length, 'cards');
