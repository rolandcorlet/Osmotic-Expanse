// The bench's status file: what someone not watching the console reads to tell a working bench from
// one that finished, crashed, was closed, died without a word or is stuck on the model.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createStatus, describe, parseNvidiaSmi, gpuReader, statusPaths, STUCK_SECS } from '../tools/bench-watch.mjs';

const dir = dirname(fileURLToPath(import.meta.url));
const at = (s) => new Date(`2026-11-25T10:${s}Z`);

function fakeStatus(start = '00:00') {
  let t = at(start);
  const writes = [];
  const w = createStatus('x.status.json', { part: 3, runs: 3 }, { now: () => t, write: (f, text) => writes.push(JSON.parse(text)) });
  return { w, writes, set: (s) => { t = at(s); } };
}

test('the status follows runs, steps, model calls and the gate line', () => {
  const { w, writes, set } = fakeStatus();
  assert.equal(writes.length, 1, 'written once at the start');
  w.line('\n=== Run 2 of 3 ===\n');
  assert.equal(w.get().run, 2);
  set('01:00'); w.waiting('step 9, model call 1');
  assert.equal(w.get().waitingOn, 'step 9, model call 1');
  set('01:20'); w.idle();
  assert.equal(w.get().waitingOn, '');
  w.line('  [step 9] start_combat, reveal_monsters\n    DM: The skeletons rise. Bryn, what do you do?\n');
  assert.equal(w.get().step, 'step 9');
  assert.equal(w.get().progressAt, at('01:20').toISOString());
  w.line('GATE: PASS\n');
  assert.equal(w.get().gate, 'PASS');
  w.end('finished', { exitCode: 0 });
  w.end('crashed', { error: 'late' });
  assert.equal(w.get().state, 'finished', 'the first ending stands');
  assert.equal(writes.at(-1).exitCode, 0);
});

test('describe: running, stuck on the model, gone, and each way of ending', () => {
  const { w, set } = fakeStatus();
  w.line('=== Run 1 of 3 ===\n  [step 4] move_party\n');
  set('02:00'); w.waiting('step 5, model call 2'); w.beat();
  assert.equal(describe(w.get(), at('02:40')).verdict, 'running');
  assert.match(describe(w.get(), at('02:40')).text, /waiting on the model for 40 s at step 5, model call 2/);
  // Alive (fresh heartbeat) but one call past the 5-minute limit: stuck.
  set('08:30'); w.beat();
  assert.equal(describe(w.get(), at('08:40')).verdict, 'stuck');
  assert.ok(STUCK_SECS > 300);
  // No heartbeat for a long while: gone, whatever it was doing.
  assert.equal(describe(w.get(), at('20:00')).verdict, 'gone');
  assert.match(describe(w.get(), at('20:00')).text, /no heartbeat for 12 min.*run 1 of 3, after step 4/);
  // The window closed in the middle of a model call: the report says which.
  w.end('closed', { exitCode: 129 });
  const d = describe(w.get(), at('21:00'));
  assert.equal(d.verdict, 'closed');
  assert.match(d.text, /console window was closed.*run 1 of 3, after step 4, during step 5, model call 2/);
  const c = fakeStatus();
  c.w.end('crashed', { error: 'TypeError: x is undefined\n    at turn (bench.mjs:250)', exitCode: 3 });
  assert.match(describe(c.w.get()).text, /^Crashed at .*: TypeError: x is undefined$/m);
  const f = fakeStatus();
  f.w.line('GATE: FAIL. Send this log to Sponge.\n');
  f.w.end('finished', { exitCode: 1 });
  assert.match(describe(f.w.get()).text, /Finished at .*GATE FAIL \(exit code 1\)/);
});

test('GPU readings: nvidia-smi rows are read, logged to a CSV, and a missing nvidia-smi is noted once', () => {
  const rows = parseNvidiaSmi('0, NVIDIA GeForce RTX 3090, 64, 97, 20480, 24576, 287.51\n1, NVIDIA GeForce RTX 3060, 41, [N/A], 1024, 12288, [N/A]\n');
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], { index: 0, name: 'NVIDIA GeForce RTX 3090', tempC: 64, loadPct: 97, memUsedMiB: 20480, memTotalMiB: 24576, powerW: 287.51 });
  assert.equal(rows[1].loadPct, null);
  const tmp = mkdtempSync(join(tmpdir(), 'gpu-'));
  const csv = join(tmp, 'b.gpu.csv');
  const ok = gpuReader({ csvFile: csv, run: (cmd, a, o, cb) => cb(null, '0, NVIDIA GeForce RTX 3090, 64, 97, 20480, 24576, 287.51\n') });
  let got;
  ok((g) => { got = g; });
  ok(() => {});
  assert.equal(got[0].tempC, 64);
  const lines = readFileSync(csv, 'utf8').trim().split('\n');
  assert.equal(lines.length, 3, 'one header and a row for each reading');
  assert.match(lines[1], /,0,"NVIDIA GeForce RTX 3090",64,97,20480,24576,287.51$/);
  let calls = 0;
  const none = gpuReader({ run: (cmd, a, o, cb) => { calls += 1; const e = new Error('spawn nvidia-smi ENOENT'); e.code = 'ENOENT'; cb(e); } });
  const notes = [];
  none((g, n) => notes.push(n));
  none((g, n) => notes.push(n));
  assert.equal(calls, 1, 'not tried again');
  assert.deepEqual(notes, ['nvidia-smi not found', 'nvidia-smi not found']);
  const st = { state: 'running', gpus: rows, heartbeatAt: new Date().toISOString(), progressAt: new Date().toISOString(), run: 1 };
  assert.match(describe(st).text, /GPUs: 0 RTX 3090 64°C, 97% load, 20\.0\/24 GB, 288 W; 1 RTX 3060 41°C, \?% load/);
});

test('the bench keeps its status file: a finished run, and a crash with its error', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'bench-'));
  const bench = join(dir, '..', 'tools', 'bench.mjs');
  const log = join(tmp, 'bench-x.log');
  const r = spawnSync(process.execPath, [bench, '--fake', '--part', '3', '--runs', '1', '--log', log], { encoding: 'utf8' });
  const st = JSON.parse(readFileSync(statusPaths(log).status, 'utf8'));
  assert.equal(st.state, 'finished');
  assert.match(st.gate, /^(PASS|FAIL)$/);
  assert.equal(st.exitCode, r.status);
  assert.equal(st.run, 1);
  assert.match(readFileSync(log, 'utf8'), /GATE: (PASS|FAIL)/);
  const log2 = join(tmp, 'bench-y.log');
  const c = spawnSync(process.execPath, [bench, '--fake', '--part', '3', '--runs', '1', '--log', log2, '--crash-at', 'step 9'], { encoding: 'utf8' });
  assert.equal(c.status, 3);
  const st2 = JSON.parse(readFileSync(statusPaths(log2).status, 'utf8'));
  assert.equal(st2.state, 'crashed');
  assert.match(st2.error, /--crash-at step 9: a test crash/);
  assert.match(readFileSync(log2, 'utf8'), /CRASH: Error: --crash-at step 9/);
  assert.ok(!existsSync(`${statusPaths(log2).status}.tmp`), 'no temporary file left behind');
});
