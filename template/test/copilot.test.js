import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeProposal, approveProposal, proposalView } from '../brain/copilot.js';

const base = { seq: 4, story: [{ kind: 'narration', seq: 3, text: 'Earlier.' }] };
const after = { seq: 6, story: [...base.story, { kind: 'event', seq: 4, text: 'The gull rises.' }, { kind: 'narration', seq: 5, text: 'Wind howls. What do you do?' }] };
const out = { state: after, calls: [{ name: 'reveal', result: {} }, { name: 'attack', result: { refused: 'No such target.' } }], flags: [{ kind: 'note', text: 'x' }, { kind: 'style', text: 'Too long.' }] };

test('a proposal holds the Director\'s turn; approving it gives its state, with the host\'s words if edited', () => {
  const p = makeProposal(out, base, 1);
  assert.equal(p.narration, 'Wind howls. What do you do?');
  const v = proposalView(p, base);
  assert.deepEqual(v.calls, ['reveal', 'attack (refused)']);
  assert.deepEqual(v.flags, ['Too long.']);
  assert.deepEqual(v.events, ['The gull rises.']);
  assert.equal(v.stale, false);
  assert.equal(approveProposal(p, base).state.story.at(-1).text, 'Wind howls. What do you do?');
  const edited = approveProposal(p, base, 'The wind drops. Ana, what now?').state;
  assert.equal(edited.story.at(-1).text, 'The wind drops. Ana, what now?');
  assert.equal(edited.story.at(-1).edited, true);
  assert.equal(p.state.story.at(-1).text, 'Wind howls. What do you do?', 'the proposal itself is untouched');
});

test('a proposal is stale once the table has moved on', () => {
  const p = makeProposal(out, base, 2);
  assert.deepEqual(approveProposal(p, { ...base, seq: 5 }), { stale: true });
  assert.equal(proposalView(p, { seq: 5 }).stale, true);
  assert.ok(approveProposal(null, base).error);
});
