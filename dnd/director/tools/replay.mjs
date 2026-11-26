// Replay the tool calls real models made in earlier benches through today's code, and fuzz every tool,
// without a model (brain/replay.js says how). Run it after any change to the Engine, the tools or the
// Director, before spending GPU time.
//
//   node tools/replay.mjs                       every *.calls.jsonl here and in test/replay/, then the fuzz
//   node tools/replay.mjs bench-part3-3.calls.jsonl other.calls.jsonl
//   --no-fuzz                                   replay only
//   -v                                          every call, not only the changes
// A regression (a call that worked and is now refused, or any tool crash) sets the exit code to 1.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ADVENTURES } from '../data/adventures/index.js';
import { withConverted, findAdventure } from './adventures.mjs';
import { prepareSrd } from '../engine/library.js';
import { replayRecord, fuzzTools, unpackState } from '../brain/replay.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const args = process.argv.slice(2);
const verbose = args.includes('-v');
const srd = JSON.parse(readFileSync(join(root, '..', 'data', 'srd.engine.json'), 'utf8'));
const lib = join(root, 'library', 'library.json');
// The converted adventures (library/adventures) join first, so a recorded converted campaign replays against its own places.
withConverted(true);
prepareSrd(srd, { adventures: ADVENTURES, libraryFile: existsSync(lib) ? lib : null });

const files = args.filter((a) => !a.startsWith('-'));
if (!files.length) {
  for (const d of [root, join(root, 'test', 'replay')]) if (existsSync(d)) for (const f of readdirSync(d)) if (/\.calls\.jsonl$/.test(f)) files.push(join(d, f));
}
let calls = 0; let regressions = 0; let fixed = 0; let turns = 0;
const sample = [];
for (const f of files) {
  const lines = readFileSync(f, 'utf8').split('\n').filter(Boolean);
  let fr = 0;
  for (const line of lines) {
    let rec;
    try { rec = JSON.parse(line); } catch (e) { continue; }
    const adventure = findAdventure(rec.adventure);
    if (!adventure) continue;
    turns += 1;
    const out = replayRecord(rec, { adventure, srd });
    for (const c of out) {
      calls += 1;
      if (c.regression) { regressions += 1; fr += 1; console.log(`  REGRESSION ${f.split(/[\\/]/).pop()} run ${rec.run} ${rec.label}: ${c.name}(${JSON.stringify(c.args).slice(0, 140)}) was ${c.was}, now ${c.now}: ${c.text.slice(0, 200)}`); }
      else if (c.fixed) { fixed += 1; if (verbose) console.log(`  fixed ${rec.label}: ${c.name} was refused, now ${c.now}`); }
      else if (verbose) console.log(`  ${rec.label}: ${c.name} ${c.was} -> ${c.now}`);
    }
    if (sample.length < 6) sample.push(unpackState(rec.state));
  }
  console.log(`${f.split(/[\\/]/).pop()}: ${lines.length} turns, ${fr} regression${fr === 1 ? '' : 's'}`);
}
console.log(`Replay: ${files.length} file${files.length === 1 ? '' : 's'}, ${turns} turns, ${calls} calls: ${regressions} regression${regressions === 1 ? '' : 's'}, ${fixed} that used to be refused now work.`);

let fuzzBad = 0;
if (!args.includes('--no-fuzz')) {
  // The fuzz runs on recorded games when there are any, and always on a fight at the Lantern's mill.
  const { fuzzGame } = await import('../brain/fuzz-game.js');
  const games = [...sample.map((s) => ({ s, adventure: findAdventure(s.adventure) || findAdventure('lantern') })), ...fuzzGame(srd)];
  let cases = 0;
  for (const g of games) {
    const r = fuzzTools(g.s, { adventure: g.adventure, srd });
    cases += r.cases;
    for (const b of r.bad.slice(0, 20)) { fuzzBad += 1; console.log(`  FUZZ ${b.name}(${JSON.stringify(b.args).slice(0, 120)}): ${b.kind} ${b.text.slice(0, 160)}`); }
  }
  console.log(`Fuzz: ${cases} bad calls on ${games.length} game${games.length === 1 ? '' : 's'}: ${fuzzBad} crashed or answered nothing.`);
}
process.exit(regressions || fuzzBad ? 1 : 0);
