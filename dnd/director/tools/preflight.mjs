// Everything that can be checked before a bench spends GPU time, in about a minute, with no model:
//   0. the engine version of the rules book is up to date (tools/compile-book.mjs);
//   1. the adventure checker (engine/check.js): ids, exits, monsters, zones, clocks, quests, rules, heroes;
//   2. the fight simulation (engine/simulate.js): every fight played 40 times through the real Engine, for
//      the party it is written for and for the bench's party, to catch wipes;
//   3. replay and fuzz (brain/replay.js): the tool calls models made in earlier benches, through today's
//      code, and bad arguments thrown at every tool;
//   4. a generated bench script (engine/script-gen.js) played once with the stand-in model, so the bench
//      itself cannot trip on the adventure.
//
//   node tools/preflight.mjs                    every adventure
//   node tools/preflight.mjs lantern --party 3x2 --runs 40
// Exit code 1 when the checker finds errors, a replayed call regresses, a tool crashes or the bench crashes.
// Wipes in the simulation are reported, not gated: a hard fight may be meant (the checker says when
// one is deadly as written), and the simulation plays both sides simply.

import { compileFile } from './compile-book.mjs';
import { readFileSync, existsSync, mkdtempSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ADVENTURES } from '../data/adventures/index.js';
import { withConverted, findAdventure } from './adventures.mjs';
import { prepareSrd } from '../engine/library.js';
import { checkAdventure, reportText } from '../engine/check.js';
import { simulateAdventure, partyOf, simText } from '../engine/simulate.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const srd = JSON.parse(readFileSync(join(root, '..', 'data', 'srd.engine.json'), 'utf8'));
const lib = join(root, 'library', 'library.json');
const conv = ADVENTURES.length;
withConverted(); // and those converted on the Books tab (library/adventures): checked when named, or all of them
prepareSrd(srd, { adventures: ADVENTURES, libraryFile: existsSync(lib) ? lib : null });
const which = args.find((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
const list = which ? [findAdventure(which)].filter(Boolean) : ADVENTURES.slice(0, conv).filter((a) => (a.sites || []).length > 1);
if (!list.length) { console.log(`No adventure "${which}". Adventures: ${ADVENTURES.map((a) => a.id).join(', ')}.`); process.exit(2); }
const runs = Number(opt('--runs', 40)) || 40;
// The bench's party: two heroes at each place's own level, the level the story has reached there (the
// bench plays the story's levels since 26 Nov).
const benchParty = partyOf(opt('--party', '2'));
let fail = 0;
const t0 = Date.now();

// 0. The engine version of the rules book is made from today's book and compiler (compile-book.mjs).
{
  const { text, gaps } = compileFile(join(root, '..', 'data', 'srd.json'));
  const fresh = readFileSync(join(root, '..', 'data', 'srd.engine.json'), 'utf8') === text;
  console.log(`0. Rules book: data/srd.engine.json ${fresh ? 'is up to date' : 'is OUT OF DATE: run node tools/compile-book.mjs'}; ${gaps.length} rule${gaps.length === 1 ? '' : 's'} not read.`);
  if (!fresh) fail++;
}

for (const adv of list) {
  console.log(`\n=== ${adv.name} (${adv.id}) ===`);
  // 1. The checker.
  const c = checkAdventure(adv, srd);
  console.log(`1. Checker: ${c.errors.length} errors, ${c.warnings.length} warnings.`);
  if (c.errors.length || c.warnings.length) console.log(reportText(c, { notes: false }).split('\n').slice(1).join('\n'));
  fail += c.errors.length;
  // 2. The simulation, for the party it is written for and for the bench's.
  if ((adv.sites || []).some((x) => (x.foes || []).length)) {
    for (const [label, party] of [['the party it is written for', null], [`the bench's party (${opt('--party', '2') === '2' ? 'two at each place\'s level' : opt('--party', '2')})`, benchParty]]) {
      const t = simText(simulateAdventure({ adventure: adv, srd, party, runs }));
      console.log(`2. Simulation, ${label}: ${t.problems} place${t.problems === 1 ? '' : 's'} with wipes, ${t.warnings} risky.`);
      console.log(t.text);
    }
  }
  // 4. A generated script, once, with the stand-in model.
  const tmp = mkdtempSync(join(tmpdir(), 'preflight-'));
  const log = join(tmp, `gen-${adv.id}.log`);
  const r = spawnSync(process.execPath, [join(here, 'bench.mjs'), '--fake', '--script', 'gen', '--adventure', adv.id, '--runs', '1', '--log', log, '--quiet'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const text = existsSync(log) ? readFileSync(log, 'utf8') : '';
  const crashed = /BENCH ERROR|CRASH/.test(text) || r.status !== 0; // the stand-in's gate counts only errors
  const lines = (text.match(/Generated script \([^)]*\)/) || [''])[0];
  console.log(`4. Generated bench script: ${crashed ? 'THE BENCH TRIPPED' : 'plays through'} ${lines.replace(/^Generated script /, '').replace(/\)$/, ', stand-in model)') || '(no script)'}.`);
  if (crashed) { fail += 1; console.log(text.split('\n').filter((l) => /BENCH ERROR|CRASH|at /.test(l)).slice(0, 8).join('\n')); }
}

// 3. Replay and fuzz, once for all adventures.
const rp = spawnSync(process.execPath, [join(here, 'replay.mjs')], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const rlines = (rp.stdout || '').trim().split('\n');
console.log(`\n3. Replay and fuzz:\n${rlines.filter((l) => /^Replay:|^Fuzz:|REGRESSION|FUZZ/.test(l)).slice(0, 30).map((l) => `  ${l.trim()}`).join('\n')}`);
const recorded = [root, join(root, 'test', 'replay')].filter(existsSync).flatMap((d) => readdirSync(d).filter((f) => /\.calls\.jsonl$/.test(f)));
if (!recorded.length) console.log('  (No bench has been recorded yet: the next bench with --log writes <log>.calls.jsonl for the replay.)');
if (rp.status) fail += 1;

console.log(`\nPREFLIGHT: ${fail ? 'FAIL' : 'PASS'} in ${Math.round((Date.now() - t0) / 1000)} s.${fail ? ' Fix these before spending GPU time.' : ' Ready for a bench.'}`);
process.exit(fail ? 1 : 0);
