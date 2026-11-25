// The quick fight simulation (engine/simulate.js): every place's fight, played many times through the
// real Engine with scripted heroes, before any GPU time is spent.
//
//   node tools/simulate.mjs                         every adventure, the party each place is written for
//   node tools/simulate.mjs lantern --party 5x2     two 5th-level heroes (fighter, cleric)
//   node tools/simulate.mjs ashen-crown --party fighter:3,cleric:3,rogue:3 --runs 100
//   --scale auto|down|off                           how fights are fitted (default: auto, as in play)
//   --no-library                                    the SRD alone
// A wipe in more than one run in ten sets the exit code to 1.

import { readFileSync, existsSync } from 'node:fs';
import { ADVENTURES, adventureById } from '../data/adventures/index.js';
import { prepareSrd } from '../engine/library.js';
import { simulateAdventure, partyOf, simText } from '../engine/simulate.js';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const srd = JSON.parse(readFileSync(new URL('../../data/srd.engine.json', import.meta.url), 'utf8'));
const lib = new URL('../library/library.json', import.meta.url);
prepareSrd(srd, { adventures: ADVENTURES, libraryFile: !args.includes('--no-library') && existsSync(lib) ? lib.pathname : null });
const which = args.find((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
const list = which ? [adventureById(which)].filter(Boolean) : ADVENTURES.filter((a) => (a.sites || []).some((s) => (s.foes || []).length));
const runs = Number(opt('--runs', 50)) || 50;
let bad = 0;
for (const adv of list) {
  const res = simulateAdventure({ adventure: adv, srd, party: partyOf(opt('--party', '')), runs, scale: opt('--scale', 'auto') });
  const t = simText(res);
  console.log(`${adv.name} (${adv.id}): ${t.problems} wipe${t.problems === 1 ? '' : 's'}, ${t.warnings} risky\n${t.text}`);
  bad += t.problems;
}
process.exit(bad ? 1 : 0);
