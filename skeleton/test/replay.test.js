// Replay and fuzz (tools/replay.mjs): a recorded turn is replayed through today's tools, and a call that
// worked then and is refused now is reported; no bad call makes a tool crash.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { mod, table, diver } from './helpers.js';

const replay = fileURLToPath(new URL('../tools/replay.mjs', import.meta.url));
const rec = (calls) => {
  const T = table(4); diver(T, 'p1', 0);
  return JSON.stringify({ v: 1, module: 'saltglass', adventure: mod.adventures[0].id, run: 1, label: 'step 1', state: gzipSync(JSON.stringify(T.s)).toString('base64'), calls });
};

test('a call that worked and still works passes; one that worked and is now refused is a regression', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sk-replay-'));
  writeFileSync(join(dir, 'good.calls.jsonl'), `${rec([{ name: 'move_party', args: { place: 'causeway' }, was: 'ok' }])}\n`);
  const ok = spawnSync(process.execPath, [replay, join(dir, 'good.calls.jsonl')], { encoding: 'utf8' });
  assert.match(ok.stdout, /1 turns, 1 calls: 0 regressions/);
  assert.match(ok.stdout, /Fuzz: \d+ bad calls on \d+ games: 0 crashed/);
  assert.equal(ok.status, 0);
  writeFileSync(join(dir, 'bad.calls.jsonl'), `${rec([{ name: 'move_party', args: { place: 'bell' }, was: 'ok' }])}\n`);
  const bad = spawnSync(process.execPath, [replay, join(dir, 'bad.calls.jsonl')], { encoding: 'utf8' });
  assert.match(bad.stdout, /REGRESSION .*move_party/);
  assert.equal(bad.status, 1);
});
