// Plays The First Carve from start to finish through the real table, with scripted players and the
// model you choose, and reports speed and how often the Engine had to speak instead of the model.
//   node tools/bench.mjs --provider custom --url http://localhost:8080/v1 --model qwen --thinking off --log v2.log
//   node tools/bench.mjs --route fight --narrate beats
//   node tools/bench.mjs --provider mock            (no model: checks the plumbing in a second)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadData, applyOverlay, legalMoves } from '../src/engine.mjs';
import { Table } from '../src/table.mjs';
import { build, mock } from '../src/providers.mjs';
import { choose } from '../../engine-v2/tools/autoplay.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : d; };
let cfg = {}; try { cfg = JSON.parse(fs.readFileSync(path.join(here, '..', 'saves', 'config.json'), 'utf8')); } catch (e) { /* none saved */ }
const pid = opt('--provider', cfg.provider || 'none');
const provider = pid === 'mock' ? mock() : build({ provider: pid, model: opt('--model', cfg.model), url: opt('--url', cfg.url), thinking: opt('--thinking', cfg.thinking || 'off'), apiKey: (cfg.keys || {})[pid] || '' });
const route = opt('--route', 'peaceful');
const sayEvery = Number(opt('--say-every', 5)); // every Nth move is typed in the player's own words instead of pressed
const logFile = opt('--log', '');
const out = [];
const log = (s = '') => { console.log(s); out.push(s); };

const table = new Table({ D: applyOverlay(loadData()), provider, narrate: opt('--narrate', 'all'), seed: Number(opt('--seed', 7)) });
const names = { wall: 'Ana', eyes: 'Ben', ledger: 'Cy', rider: 'Dee' };
const toks = {};
for (const id of Object.keys(table.g.s.orgs)) { toks[id] = table.join(table.code, names[id] || id); table.claim(toks[id], id); }
const anyTok = Object.values(toks)[0];
log(`===== Director v2 bench: ${provider.id}${provider.model ? ` · ${provider.model}` : ''} · route ${route} · narrate ${table.narrate} =====`);

let shown = 0; let steps = 0; let said = 0; let understood = 0;
const flush = () => { for (const e of table.story.slice(shown)) log(e.kind === 'player' ? `\n${e.who.toUpperCase()}: ${e.text}` : e.kind === 'director' ? `  DIRECTOR: ${e.text}` : e.kind === 'ask' ? `  ASK: ${e.text}` : `  (${e.kind}) ${e.text}`); shown = table.story.length; };
const t0 = Date.now();
if (route === 'fight') { await table.move(anyTok, 'begin'); const a = legalMoves(table.g).find((m) => m.kind === 'attack'); if (a) await table.move(toks[a.who], a.id); }
while (!table.g.s.ended && steps < 500) {
  const m = choose(table.g, undefined, route === 'fight' ? 'fight' : 'peaceful');
  if (!m) break;
  const tok = m.who ? toks[m.who] : anyTok;
  steps += 1;
  if (provider.id !== 'none' && sayEvery && steps % sayEvery === 0 && m.kind !== 'begin') {
    const before = table.g.s.log.length; said += 1;
    await table.say(tok, `I want to ${m.label.replace(/^./, (c) => c.toLowerCase())}.`);
    if (table.g.s.log.length > before || table.g.s.ended) understood += 1; else await table.move(tok, m.id);
  } else await table.move(tok, m.id);
  flush();
}
flush();
const st = table.stats; const secs = (Date.now() - t0) / 1000;
log(`\nEnded: ${table.g.s.ended || 'did not end'} after ${steps} player moves in ${secs.toFixed(0)} s.`);
log(`Speed: ${st.calls} model calls${st.calls ? `, ${(st.ms / st.calls / 1000).toFixed(1)} s each; ${Math.round(st.in / st.calls)} tokens in and ${Math.round(st.out / st.calls)} out per call; ${(st.out / (st.ms / 1000)).toFixed(1)} tok/s out` : ''}`);
log(`Engine spoke instead of the model: ${st.fallbacks} time(s)${st.error ? ` (last reason: ${st.error})` : ''}`);
if (said) log(`Own-words moves understood: ${understood} of ${said}`);
log(`Clocks: ${Object.entries(table.g.s.clocks).map(([k, c]) => `${k} ${c.n}/${c.max}`).join(', ')}`);
log(`Hard rescues: 0 by construction (no refusals, no held leaks: a bad line is replaced by the Engine's own).`);
if (logFile) fs.writeFileSync(logFile, out.join('\n'), 'utf8');
