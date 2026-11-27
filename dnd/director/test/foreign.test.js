import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dropForeign } from '../brain/foreign.js';

test('a word from another script slipped into English narration is dropped (iq3_s, 27 Nov)', () => {
  assert.equal(dropForeign("Ila's mace carves a弧 through frozen air and finds nothing."), "Ila's mace carves through frozen air and finds nothing.");
  assert.equal(dropForeign('The guardian answers — 是的 — and waits.'), 'The guardian answers — and waits.');
  assert.equal(dropForeign('A plain line, café and naïve kept.'), 'A plain line, café and naïve kept.');
  assert.equal(dropForeign('氷の洞窟に入る。冷たい風が吹く。'), '氷の洞窟に入る。冷たい風が吹く。', 'a game in another language is left alone');
  assert.equal(dropForeign(''), '');
});
