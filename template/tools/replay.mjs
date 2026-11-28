#!/usr/bin/env node
// Replay and fuzz, with no model: run after any change to the Engine or the tools.
//   Replay: every tool call a real model made in an earlier bench (<log>.calls.jsonl in this folder and in
//   test/replay), from the state it was made in, through today's tools. A call that worked then and is
//   refused now is a REGRESSION; one refused then that works now is counted as fixed.
//   Fuzz: every tool, from several states of the sample games, with arguments a confused model might send
//   (nothing, wrong types, unknown names, huge numbers). Each must answer (ok, a note or a refusal) and
//   never crash.
//   node tools/replay.mjs [files...] [-v]
// Exit code 1 on a regression or a crash.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadModule, listModules, moduleHome, allModules } from '../engine/module.js';
import { newSession, apply } from '../engine/ledger.js';
import { makeRng } from '../engine/dice.js';
import { toolbox, TOOLS } from '../brain/tools.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const args = process.argv.slice(2);
const verbose = args.includes('-v');
const mods = {};
const modOf = (id) => { if (!(id in mods)) { try { mods[id] = loadModule(moduleHome(root, id), id); } catch (e) { mods[id] = null; } } return mods[id]; };

const files = args.filter((a) => !a.startsWith('-'));
if (!files.length) for (const d of [root, join(root, 'test', 'replay')]) if (existsSync(d)) for (const f of readdirSync(d)) if (/\.calls\.jsonl$/.test(f)) files.push(join(d, f));
let turns = 0; let calls = 0; let regressions = 0; let fixed = 0; let crashes = 0;
for (const f of files) {
  for (const line of readFileSync(f, 'utf8').split('\n').filter(Boolean)) {
    let rec; try { rec = JSON.parse(line); } catch (e) { continue; }
    if (!rec.state || !rec.calls) continue; // an older line with no state
    const mod = modOf(rec.module);
    if (!mod) continue;
    turns += 1;
    const T = toolbox({ state: JSON.parse(gunzipSync(Buffer.from(rec.state, 'base64')).toString('utf8')), mod, rng: makeRng(1), now: 1 });
    for (const c of rec.calls) {
      // The Engine's own notes in the record ("(engine)": a roll withdrawn), not a call the model made.
      if (/^\(/.test(c.name || '')) continue;
      calls += 1;
      const out = T.run(c.name, c.args);
      const now = out && out.refused ? 'refused' : 'ok';
      if (out && out.crashed) { crashes += 1; console.log(`  CRASH ${f.split(/[\\/]/).pop()} ${rec.label}: ${c.name}(${JSON.stringify(c.args).slice(0, 120)}): ${out.crashed}`); }
      if (c.was === 'ok' && now === 'refused') { regressions += 1; console.log(`  REGRESSION ${f.split(/[\\/]/).pop()} run ${rec.run} ${rec.label}: ${c.name}(${JSON.stringify(c.args).slice(0, 120)}) was ok, now refused: ${String(out.refused).slice(0, 200)}`); }
      if (c.was === 'refused' && now === 'ok') { fixed += 1; if (verbose) console.log(`  fixed ${rec.label}: ${c.name}`); }
    }
  }
}
console.log(`Replay: ${files.length} file${files.length === 1 ? '' : 's'}, ${turns} turns, ${calls} calls: ${regressions} regressions, ${fixed} that used to be refused now work.`);

// ---- fuzz
const BAD = [undefined, null, '', 0, -1, 1e9, 'nobody', 'k999', 'c999', [], {}, true, '🙂', 'a'.repeat(3000)];
function states(mod) {
  const rng = makeRng(3); let now = 1;
  const ctx = (role, pid) => ({ role, pid, rng, now: (now += 1), mod });
  const out = [];
  for (const adv of mod.adventures) {
    let s = newSession(mod, adv.id);
    out.push(s);
    try {
      for (const pid of ['p1', 'p2']) { s = apply(s, { type: 'join', name: pid }, ctx('player', pid)); s = apply(s, { type: 'char.pregen', index: pid === 'p1' ? 0 : 1 }, ctx('player', pid)); }
      out.push(s);
      const next = (adv.sites.find((x) => x.id === adv.start) || {}).exits || [];
      if (next[0]) { s = apply(s, { type: 'site.move', siteId: next[0] }, ctx('host', null)); out.push(s); }
      try { s = apply(s, { type: 'fight.start' }, ctx('host', null)); out.push(s); } catch (e) { /* nothing to fight */ }
    } catch (e) { /* as far as it got */ }
  }
  return out;
}
let tries = 0; let bad = 0; let games = 0;
for (const id of allModules(root).map((m) => m.id || m)) {
  const mod = modOf(id);
  if (!mod) continue;
  for (const st of states(mod)) {
    games += 1;
    for (const tool of TOOLS) {
      const keys = Object.keys((tool.parameters || {}).properties || {});
      const sets = [{}, ...BAD.map((v) => Object.fromEntries(keys.map((k) => [k, v]))), ...keys.flatMap((k) => BAD.map((v) => ({ [k]: v })))];
      for (const a of sets) {
        tries += 1;
        const T = toolbox({ state: st, mod, rng: makeRng(tries), now: 1 });
        let out;
        try { out = T.run(tool.name, a); } catch (e) { out = { crashed: e.message }; }
        if (!out || out.crashed) { bad += 1; if (bad <= 20) console.log(`  FUZZ ${tool.name}(${JSON.stringify(a).slice(0, 100)}): ${out ? out.crashed : 'answered nothing'}`); }
      }
    }
  }
}
console.log(`Fuzz: ${tries} bad calls on ${games} games: ${bad} crashed or answered nothing.`);
process.exit(regressions || crashes || bad ? 1 : 0);
