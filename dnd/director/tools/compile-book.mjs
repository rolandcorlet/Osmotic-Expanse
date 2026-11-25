#!/usr/bin/env node
// The book compiler: makes the engine version of a rules book, beside the book itself.
//
//   node tools/compile-book.mjs                 the SRD: data/srd.json -> data/srd.engine.json
//   node tools/compile-book.mjs --library       your private library (library/library.json, made by
//                                               tools/import-books.mjs) -> library/library.engine.json
//   node tools/compile-book.mjs <book.json>     any book in the same shape -> <book>.engine.json
//   ... --check                                 only say whether the engine version is up to date
//
// The book keeps its words; the engine version is the same book with the rules written as fields
// (engine/book.js says which), so the Engine never has to read a sentence during play. Hand readings
// for what the words do not say plainly go in <book>.engine-fixes.json, and everything the compiler
// could not read is listed in <book>.engine-gaps.md for a person to settle there.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileBook, ENGINE_VERSION } from '../engine/book.js';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const file = args.find((x) => !x.startsWith('--')) || (flag('--library') ? join(here, '..', 'library', 'library.json') : join(here, '..', '..', 'data', 'srd.json'));
const stem = file.replace(/\.json$/, '');
const out = `${stem}.engine.json`;
const fixesFile = `${stem}.engine-fixes.json`;
const gapsFile = `${stem}.engine-gaps.md`;

export function compileFile(bookFile) {
  const s = bookFile.replace(/\.json$/, '');
  const book = JSON.parse(readFileSync(bookFile, 'utf8'));
  const fx = existsSync(`${s}.engine-fixes.json`) ? JSON.parse(readFileSync(`${s}.engine-fixes.json`, 'utf8')) : null;
  const gaps = compileBook(book, fx);
  book.engine = { version: ENGINE_VERSION, from: basename(bookFile), fixes: fx ? basename(`${s}.engine-fixes.json`) : '', gaps: gaps.length };
  return { text: JSON.stringify(book), gaps, book };
}

function gapsReport(gaps, name) {
  const lines = [`# What the book compiler could not read: ${name}`, '',
    `Made by \`node tools/compile-book.mjs\`. Each line is a rule the words do not say plainly enough to turn into numbers.`,
    `The Engine still plays these from their words through the Director; to give it the numbers, add a hand reading to`,
    `\`${basename(fixesFile)}\` (for example \`{"spells": {"wish": {"how": "mishap"}}}\` or \`{"monsters": {"hydra": {"Multiattack": {"multi": [{"Bite": 5}]}}}}\`) and compile again.`, ''];
  if (!gaps.length) lines.push('Nothing: every damage roll, save, multiattack and spell list was read.');
  const kinds = [...new Set(gaps.map((g) => g.kind))];
  for (const k of kinds) {
    lines.push(`## ${k[0].toUpperCase()}${k.slice(1)}s`, '');
    for (const g of gaps.filter((x) => x.kind === k)) lines.push(`- **${g.name}** (\`${g.id}\`): ${g.what}`);
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  if (!existsSync(file)) { console.log(`No book at ${file}.`); process.exit(1); }
  const { text, gaps, book } = compileFile(file);
  if (flag('--check')) {
    const same = existsSync(out) && readFileSync(out, 'utf8') === text;
    console.log(same ? `${basename(out)} is up to date.` : `${basename(out)} is out of date: run node tools/compile-book.mjs${flag('--library') ? ' --library' : ''}.`);
    process.exit(same ? 0 : 1);
  }
  writeFileSync(out, text);
  writeFileSync(gapsFile, gapsReport(gaps, basename(file)));
  const n = (k, f) => (book[k] || []).filter(f).length;
  const acts = (book.monsters || []).flatMap((m) => [...(m.actions || []), ...(m.legendary || []), ...(m.reactions || [])]);
  console.log(`${basename(out)}: ${n('spells', (x) => x.dmgSlot || x.dmgLevel)} damaging spells, ${n('spells', (x) => x.save)} with saves, `
    + `${acts.filter((a) => a.multi).length} multiattacks, ${acts.filter((a) => a.rider).length} saves after a hit, `
    + `${n('monsters', (m) => (m.traits || []).some((t) => t.spells))} spellcasters; ${gaps.length} gap${gaps.length === 1 ? '' : 's'} (${basename(gapsFile)}).`);
}
