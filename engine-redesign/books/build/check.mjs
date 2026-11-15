// Cross-checks the Engine-ready data against the working Engine's own tables (read only), so a
// conversion slip shows up as a difference. Run after the four builders.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { root } from './lib.mjs';
const load = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));
const core = load('core/core-rules.json'); const players = load('players/players.json'); const best = load('bestiary/bestiary.json'); const vec = load('vectors/first-carve.json');
const R = await import(join(root, '..', '..', 'director', 'engine', 'rules.js'));
const { APPARATUS } = await import(join(root, '..', '..', 'director', 'data', 'apparatus.js'));
const src = load('../../director/data/bestiary.json');
const res = [];
const eq = (name, a, b) => res.push([name, JSON.stringify(a) === JSON.stringify(b) ? 'same' : `DIFFERENT: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`]);
eq('Threshold ladder', core.ladder.map((r) => [r.at, r.name]), R.LADDER.map((r) => [r.at, r.name]));
eq('Condition names', core.conditions.map((c) => c.id).sort(), Object.keys(R.CONDITIONS).sort());
eq('Condition MT and PP numbers', core.conditions.filter((c) => c.mods.mt || c.mods.pp).map((c) => [c.id, c.mods.mt || 0, c.mods.pp || 0]), Object.entries(R.CONDITIONS).filter(([, v]) => v.mt || v.pp).map(([k, v]) => [k, v.mt || 0, v.pp || 0]));
eq('Band names', core.bands.map((b) => b.id), R.BANDS.map((b) => b.id));
eq('Action costs', core.actions.filter((a) => R.ACTIONS[a.id]).map((a) => [a.id, a.pp === '3-5' ? 3 : a.pp]), Object.entries(R.ACTIONS).map(([k, v]) => [k, v.cost]));
eq('Stress penalties', [3, 5, 6].map((s) => core.stress.track.find((t) => t.at === s).dice), [3, 5, 6].map((s) => R.stressPenalty(s)));
const o = { VSC: 4, DFF: 3, RTC: 1, hull: 6, level: 1 };
eq('Derived-number formulas (sample body)', players.hands.find((h) => h.id === 'wall').derived.countdown, R.countdownBoxes(4, 6));
eq('Apparatus the Engine already codes (BD, dice, cost)', Object.values(APPARATUS).map((a) => [a.id, a.bd, a.bonus, a.cost]), Object.values(APPARATUS).map((a) => { const p = players.apparatus.find((x) => x.id === a.id); return p ? [p.id, p.bd, p.bonusDice, p.cost] : [a.id, 'missing']; }));
eq('Creature numbers (all 68)', best.creatures.map((c) => [c.id, c.numbers.mt, c.numbers.mi, c.numbers.soak, c.numbers.bd, c.numbers.pool, c.numbers.pp, c.numbers.segments]), Object.values(src).map((c) => [c.id, c.mt, c.mi, c.soak, c.bd, c.pool, c.pp, c.segments]));
eq('Hands match their formulas', players.hands.map((h) => h.mismatch.length), [0, 0, 0, 0]);
eq('First Carve creature counts per site', vec.sites.map((s) => s.creatures.filter((c) => !c.gap && !c.needs).map((c) => `${c.count} ${c.block}`).sort()), (await import(join(root, '..', '..', 'director', 'data', 'first-carve.js'))).scenario.sites.map((s) => s.encounter.map((e) => `${e.count} ${e.blockId}`).sort()));
for (const [n, r] of res) console.log(`${r === 'same' ? 'ok  ' : 'DIFF'} ${n}${r === 'same' ? '' : `\n     ${r.slice(0, 400)}`}`);
