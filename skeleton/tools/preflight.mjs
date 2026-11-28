#!/usr/bin/env node
// Everything that can be checked before a bench spends model time, for a Skeleton module:
//   1. the module checker (engine/schema.js checkAll): every section and every adventure;
//   2. each adventure's places: exits that lead nowhere, places nobody can reach, creatures not in the
//      bestiary, quests done at places that do not exist;
//   2. the fights at each place, simulated (engine/simulate.js): how often the party wins or is wiped out;
//   3. a script written from each adventure, played once with the stand-in (tools/bench.mjs --fake):
//      the bench and the Engine play every step without an error;
//   4. replay and fuzz (tools/replay.mjs): earlier benches' calls through today's tools, and bad calls.
//   node tools/preflight.mjs [--module saltglass] [--adventure <id>]
// Exit code 1 when anything fails.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadModule, check, moduleHome, defaultModule } from '../engine/module.js';
import { simulateAdventure, simText } from '../engine/simulate.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const id = opt('--module', defaultModule(root));
const mod = loadModule(moduleHome(root, id), id);
if (!mod || !mod.module || !mod.module.name) { console.log(`There is no module "${id}" in modules/.`); process.exit(2); }
const t0 = Date.now();
let fail = 0;

console.log(`=== ${mod.module.name} (${id}) ===`);
const c = check(mod);
console.log(`1. Module checker: ${c.errors.length} error${c.errors.length === 1 ? '' : 's'}.`);
for (const e of c.errors.slice(0, 40)) console.log(`  - ${e}`);
fail += c.errors.length;
// Advice (28 Nov benches): valid, but the Director is likely to stumble there. Reported, not failed.
if ((c.advice || []).length) { console.log(`   Advice, ${c.advice.length} (valid, but worth fixing before a bench):`); for (const a of c.advice.slice(0, 30)) console.log(`  ~ ${a}`); }

export function mapProblems(mod, adv) {
  const out = [];
  const ids = new Set((adv.sites || []).map((x) => x.id));
  if (!ids.has(adv.start)) out.push(`the start "${adv.start}" is not a place`);
  for (const s of adv.sites || []) {
    for (const e of s.exits || []) if (!ids.has(e)) out.push(`${s.id}: the exit "${e}" leads to no place`);
    for (const k of s.creatures || []) if (!mod.ix.creature[k.id]) out.push(`${s.id}: the creature "${k.id}" is not in the bestiary`);
  }
  const seen = new Set([adv.start]); const q = [adv.start];
  const byId = Object.fromEntries((adv.sites || []).map((x) => [x.id, x]));
  while (q.length) { const x = byId[q.shift()]; for (const e of (x && x.exits) || []) if (!seen.has(e) && byId[e]) { seen.add(e); q.push(e); } }
  for (const s of adv.sites || []) if (!seen.has(s.id)) out.push(`${s.id}: no way leads here from the start`);
  for (const qd of adv.quests || []) for (const p of qd.doneAt || []) if (!ids.has(p)) out.push(`quest ${qd.id}: it is done at "${p}", which is not a place`);
  return out;
}

const advs = opt('--adventure', '') ? mod.adventures.filter((a) => a.id === opt('--adventure', '')) : mod.adventures;
if (!advs.length) { console.log(`There is no adventure "${opt('--adventure', '')}". Adventures: ${mod.adventures.map((a) => a.id).join(', ')}.`); process.exit(2); }
for (const adv of advs) {
  console.log(`\n--- ${adv.name} (${adv.id}) ---`);
  const p = mapProblems(mod, adv);
  console.log(`2. Places: ${p.length ? `${p.length} problem${p.length > 1 ? 's' : ''}` : 'every place reachable, every exit and creature known'}.`);
  for (const x of p) console.log(`  - ${x}`);
  fail += p.length;
  // The fights, for two characters and for the party the adventure is written for (reported, not failed:
  // a deadly fight may be meant).
  for (const heroes of [2, Math.max(2, Math.min(4, (mod.handbook.pregens || []).length))].filter((x, i, a) => a.indexOf(x) === i)) {
    const t = simText(simulateAdventure({ mod, adventure: adv, heroes, runs: 40 }));
    console.log(`2. Fights, ${heroes} characters: ${t.problems} place${t.problems === 1 ? '' : 's'} with wipes, ${t.warnings} risky.`);
    if (t.text) console.log(t.text);
  }
  const log = join(mkdtempSync(join(tmpdir(), 'sk-preflight-')), `gen-${adv.id}.log`);
  const r = spawnSync(process.execPath, [join(here, 'bench.mjs'), '--fake', '--module', id, '--adventure', adv.id, '--runs', '1', '--log', log, '--quiet'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const text = existsSync(log) ? readFileSync(log, 'utf8') : '';
  const lines = (/Script: (\d+) lines/.exec(text) || [0, '?'])[1];
  const tripped = r.status !== 0 || /BENCH ERROR/.test(text);
  console.log(`3. Generated bench script: ${tripped ? 'THE BENCH TRIPPED' : 'plays through'} (${lines} lines, stand-in model).`);
  if (tripped) { fail += 1; console.log((text.split('\n').filter((l) => /ERROR|BENCH/.test(l)).slice(0, 8).join('\n')) || (r.stderr || '').slice(0, 800)); }
}
// 4. Replay and fuzz, once for all modules (tools/replay.mjs).
{
  const rp = spawnSync(process.execPath, [join(here, 'replay.mjs')], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const ls = (rp.stdout || '').trim().split('\n').filter((l) => /^Replay:|^Fuzz:|REGRESSION|CRASH|FUZZ/.test(l));
  console.log(`\n4. Replay and fuzz:\n${ls.slice(0, 30).map((l) => `  ${l.trim()}`).join('\n')}`);
  if (rp.status) fail += 1;
}
console.log(`\nPREFLIGHT: ${fail ? 'FAIL' : 'PASS'} in ${Math.round((Date.now() - t0) / 1000)} s.${fail ? ' Fix these before spending model time.' : ' Ready for a bench.'}`);
process.exit(fail ? 1 : 0);
