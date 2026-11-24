#!/usr/bin/env node
// The chance of success in a dice system, for every rating against every difficulty on its ladder.
// For tuning a game: how hard is Standard for a starting character? How dangerous is a tier 2 creature?
//   node tools/dice-lab.mjs                       every system, briefly
//   node tools/dice-lab.mjs --system d20          one system (options: --perRank 3 and so on)
//   node tools/dice-lab.mjs --module saltglass    a module's own system and ladder
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SYSTEMS, getSystem, chance } from '../engine/dicesystems.js';
import { loadModule } from '../engine/module.js';

const argv = process.argv.slice(2);
const flag = (k) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : ''; };
const ROOT = fileURLToPath(new URL('../', import.meta.url));

function table(rules, ladder, title) {
  const S = getSystem(rules);
  const R = S.ranges;
  const span = R.rating[1] - R.rating[0];
  const stepBy = S.id === 'percentile' ? 10 : S.id === 'step' ? 2 : span > 20 ? 2 : 1;
  const ratings = [];
  for (let v = Math.max(R.rating[0], S.id === 'percentile' ? 10 : R.rating[0]); v <= R.rating[1] && ratings.length < 14; v += stepBy) ratings.push(v);
  console.log(`\n${title}: ${S.name}${Object.keys(rules.dice || {}).length > 1 ? ` ${JSON.stringify(rules.dice)}` : ''}`);
  const w = ladder.map((l) => Math.max(10, `${l.name} ${l.at}`.length + 2));
  console.log(`${'rolls'.padEnd(22)}${ladder.map((l, i) => `${l.name} ${l.at}`.padStart(w[i])).join('')}`);
  for (const v of ratings) {
    const spec = S.sys.spec(S.o, { rating: v });
    console.log(`${spec.label.padEnd(22)}${ladder.map((l, i) => `${Math.round(chance(S, spec, l.at, 6000) * 100)}%`.padStart(w[i])).join('')}`);
  }
}

if (flag('module')) {
  const mod = loadModule(join(ROOT, 'modules'), flag('module'));
  table(mod.rules, mod.rules.ladder, mod.module.name);
} else {
  const ids = flag('system') ? [flag('system')] : Object.keys(SYSTEMS);
  for (const id of ids) {
    if (!SYSTEMS[id]) { console.log(`No system "${id}". Systems: ${Object.keys(SYSTEMS).join(', ')}.`); process.exit(1); }
    const dice = { system: id };
    for (let i = 0; i < argv.length; i++) if (argv[i].startsWith('--') && !['--system', '--module'].includes(argv[i])) { const v = argv[i + 1]; dice[argv[i].slice(2)] = Number.isNaN(Number(v)) ? (v === 'true' ? true : v === 'false' ? false : v) : Number(v); }
    table({ dice }, SYSTEMS[id].ladder, id);
  }
}
