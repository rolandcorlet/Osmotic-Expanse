#!/usr/bin/env node
// Builds library/library.json from your own text exports of the 5e books (Player's Handbook,
// Monster Manual, Dungeon Master's Guide, the PHB spell list and the character generator).
//   node tools/import-books.mjs [--from <folder of .txt books>] [--out <library.json>]
// Each .txt file is recognised by what is in it; a second copy of the same book is skipped.
// The library is private: library/ is git-ignored and the server never sends its rules text out.
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sniff, parseSpellList, parseCharGen, parseMonsters, parseRulesBook } from './books.js';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf(name); return i >= 0 && args[i + 1] ? args[i + 1] : dflt; };
const from = opt('--from', join(here, '..', 'library', 'books'));
const outFile = opt('--out', join(here, '..', 'library', 'library.json'));

if (!existsSync(from)) { console.log(`No books folder at ${from}. Put your .txt books there, or pass --from <folder>.`); process.exit(1); }
const lib = { source: 'Built from your own copies of the 5e books. Private: do not share or commit it.', builtAt: new Date().toISOString(), books: [], spells: [], monsters: [], races: [], classes: [], backgrounds: [], rules: [] };
const done = new Set();
for (const f of readdirSync(from).filter((x) => /\.txt$/i.test(x)).sort()) {
  const text = readFileSync(join(from, f), 'utf8');
  const kind = sniff(text);
  if (!kind) { console.log(`  skipped ${f} (not a book the importer knows)`); continue; }
  if (done.has(kind)) { console.log(`  skipped ${f} (a second copy of the ${kind} book)`); continue; }
  done.add(kind);
  if (kind === 'spells') lib.spells = parseSpellList(text);
  if (kind === 'chargen') Object.assign(lib, parseCharGen(text));
  if (kind === 'monsters') lib.monsters = parseMonsters(text);
  if (kind === 'phb') lib.rules.push(...parseRulesBook(text, 'PHB'));
  if (kind === 'dmg') lib.rules.push(...parseRulesBook(text, 'DMG'));
  lib.books.push({ file: f, kind });
  console.log(`  read ${f} as ${kind}`);
}
mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, JSON.stringify(lib));
const subs = (k) => lib[k].reduce((n, x) => n + (x.subraces || x.subclasses || []).length, 0);
console.log(`Library: ${lib.spells.length} spells, ${lib.monsters.length} monsters, ${subs('races')} subraces, ${subs('classes')} subclasses, ${lib.backgrounds.length} backgrounds, ${lib.rules.length} rules sections → ${outFile}`);
