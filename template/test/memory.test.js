// The table's long memory (brain/memory.js, from the D&D Director): what was said kept and searched, an Undo
// taken back, the chronicle's chapters, and the Director's recall and briefing using them (upgrade plan step 4).
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createMemory } from '../brain/memory.js';
import { plainChapter, parseChronicle } from '../brain/chronicle.js';
import { briefing } from '../brain/director.js';
import { toolbox } from '../brain/tools.js';
import { makeRng } from '../engine/dice.js';
import { mod, table, diver } from './helpers.js';

test('everything said is kept and found again; what an Undo took back is not', () => {
  const memory = createMemory({ dir: mkdtempSync(join(tmpdir(), 'skmem-')) });
  const T = table(2);
  diver(T, 'p1', 0);
  let seen = null;
  const watch = () => { memory.observe(seen, T.s); seen = T.s; };
  watch();
  T.host({ type: 'narrate', text: 'Auntie Pell slides the brass compass across the barrel. What do you do?' }); watch();
  const before = T.s;
  T.host({ type: 'narrate', text: 'A green lantern sinks under the pier.' });
  memory.observe(seen, T.s); seen = T.s;
  const found = memory.search(T.s.gameId, 'compass');
  assert.equal(found.hits.length, 1);
  assert.match(found.hits[0].text, /brass compass/);
  // The lantern line is undone.
  memory.observe(T.s, before, { undoneAfter: before.seq - 1 }); // as server.js: a line carries the seq before its change
  assert.equal(memory.search(T.s.gameId, 'lantern').hits.length, 0);
  // A second memory on the same folder reads it back from disk.
  assert.equal(memory.linesSince(T.s.gameId, 0).filter((l) => l.kind === 'narration').length, 1);
});

test('chapters are kept, dropped, and searched with the rest', () => {
  const dir = mkdtempSync(join(tmpdir(), 'skmem-'));
  const memory = createMemory({ dir });
  const id = memory.addChapter('g1', { t: 1, siteId: 'dock', site: 'Lamp Dock', why: 'left', text: 'The divers took Auntie Pell\'s map of the drowned cathedral.' });
  assert.equal(createMemory({ dir }).chapters('g1').length, 1, 'kept on disk');
  assert.equal(memory.search('g1', 'cathedral map').hits[0].from, 'chronicle');
  memory.dropChapter('g1', id);
  assert.equal(memory.chapters('g1').length, 0);
});

test('a plain chapter from the narration when no AI writes one; the AI\'s answer is read', () => {
  const lines = [{ kind: 'narration', text: 'The tide turns and the bell beneath the dock begins to ring. What now?' }, { kind: 'event', text: 'Moll Tarrow gets Brass key.' }, { kind: 'say', text: 'I wave.' }];
  assert.match(plainChapter({ siteName: 'Lamp Dock', lines }), /^At Lamp Dock: The tide turns.*Moll Tarrow gets Brass key\./);
  assert.equal(parseChronicle('CHAPTER:\n  They left   the dock.').chapter, 'They left the dock.');
});

test('the Director reads the latest chapters, and its recall searches the whole history', () => {
  const T = table(3);
  diver(T, 'p1', 0);
  const chapters = [{ site: 'Lamp Dock', why: 'night', text: 'They promised Auntie Pell the bell.' }];
  assert.match(briefing(T.s, mod, { chapters }), /THE STORY SO FAR.*\n- Lamp Dock \(end of a night\): They promised Auntie Pell the bell\./);
  const tb = toolbox({ state: T.s, mod, rng: makeRng(1), now: 1, memory: { chapters, search: () => ({ hits: [{ from: 'chronicle', site: 'dock', text: 'They promised Auntie Pell the bell.' }], more: 0 }) } });
  assert.deepEqual(tb.run('recall', { query: 'Pell' }).found, ['Chronicle (at dock): They promised Auntie Pell the bell.']);
});
