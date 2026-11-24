// Says what a bench is doing or how it ended, from the status file it keeps beside its log.
//
//   node tools/bench-status.mjs                      every bench*.status.json here, newest first
//   node tools/bench-status.mjs bench-part3-3.log    one bench (its log or its status file)
//
// Verdicts: running, stuck (alive, but one model call has run past the 5-minute limit), gone (no
// heartbeat: ended or froze without a word), finished, crashed, closed, interrupted, killed, ended.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { describe, statusPaths } from './bench-watch.mjs';

const args = process.argv.slice(2);
const files = args.length
  ? args.map((f) => (/\.status\.json$/i.test(f) ? f : statusPaths(f).status))
  : readdirSync('.').filter((f) => /^bench.*\.status\.json$/i.test(f)).sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
if (!files.length) console.log('No bench status files here.');
for (const f of files) {
  let st;
  try { st = JSON.parse(readFileSync(f, 'utf8')); } catch (e) { console.log(`${f}: cannot read (${e.code || e.message})`); continue; }
  const { verdict, text } = describe(st, new Date());
  console.log(`${f} [${verdict}] part ${st.part ?? '?'}, ${st.model || '?'}, started ${String(st.startedAt || '?').replace('T', ' ').replace(/\.\d+Z$/, ' UTC')}\n  ${text.replace(/\n/g, '\n  ')}`);
}
