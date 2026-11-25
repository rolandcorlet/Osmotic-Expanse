// Check adventure files before playing or benching them: wrong ids, missing monsters, places that cannot
// be reached, broken zones, quests that cannot finish, heroes that do not build, and how hard each fight is.
//
//   node tools/check-adventure.mjs                 every adventure the Director offers
//   node tools/check-adventure.mjs lantern         one, by id
//   node tools/check-adventure.mjs my-quest.js     a file (its default export)
//   --quiet                                        errors and warnings only, no notes
//   --library                                      with your private book library's monsters
//
// Exit code 1 when any adventure has errors.

import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { ADVENTURES } from '../data/adventures/index.js';
import { prepareSrd } from '../engine/library.js';
import { checkAdventure, reportText } from '../engine/check.js';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const quiet = args.includes('--quiet');
const srd = JSON.parse(readFileSync(join(here, '..', '..', 'data', 'srd.json'), 'utf8'));
const wanted = args.filter((a) => !a.startsWith('--'));
const list = [];
for (const w of wanted) {
  if (/\.m?js$/.test(w)) list.push((await import(pathToFileURL(resolve(w)).href)).default);
  else { const a = ADVENTURES.find((x) => x.id === w); if (!a) { console.log(`No adventure "${w}". Adventures: ${ADVENTURES.map((x) => x.id).join(', ')}`); process.exit(1); } list.push(a); }
}
if (!list.length) list.push(...ADVENTURES);
prepareSrd(srd, { libraryFile: args.includes('--library') ? join(here, '..', 'library', 'library.json') : null, adventures: list });
let bad = 0;
for (const a of list) {
  const r = checkAdventure(a, srd);
  bad += r.errors.length;
  console.log(`${reportText(r, { notes: !quiet })}\n`);
}
process.exitCode = bad ? 1 : 0;
