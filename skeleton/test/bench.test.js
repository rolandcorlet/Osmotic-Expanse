// The bench (tools/bench.mjs) and its script (engine/script.js): a script written from the sample
// adventure walks its places, tries its hazards, fights its creatures and finishes the quest where it is
// done; the stand-in plays it through without an error, and the files beside the log are written.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateScript } from '../engine/script.js';
import { mod } from './helpers.js';

const adv = mod.adventures[0];

test('the script walks the places, tries the hazards, fights and finishes the quest at its place', () => {
  const s = generateScript(mod, adv, { places: 6, heroes: 2 });
  const says = s.filter((x) => x.say);
  assert.ok(says.some((x) => x.expect.includes('move_party')));
  assert.ok(says.some((x) => x.expect.includes('ask_for_roll')), 'a hazard is tried');
  assert.ok(says.some((x) => x.expect.includes('start_combat')), 'a fight is picked');
  const q = says.find((x) => x.expect.includes('complete_quest'));
  assert.ok(q, 'a quest is finished');
  const quest = adv.quests.find((x) => (x.doneAt || []).includes(q.at));
  assert.ok(quest, 'at a place the quest is done at');
  assert.ok(says.every((x) => x.pid === 'p1' || x.pid === 'p2'));
});

test('the stand-in plays the script through, and the status, exit and calls files are written', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sk-bench-'));
  const log = join(dir, 'b.log');
  const bench = fileURLToPath(new URL('../tools/bench.mjs', import.meta.url));
  const r = spawnSync(process.execPath, [bench, '--fake', '--runs', '1', '--log', log, '--quiet'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const text = readFileSync(log, 'utf8');
  assert.match(text, /GATE: PASS/);
  assert.equal(JSON.parse(readFileSync(join(dir, 'b.status.json'), 'utf8')).state, 'finished');
  assert.ok(existsSync(join(dir, 'b.exit.txt')) && existsSync(join(dir, 'b.calls.jsonl')));
});
