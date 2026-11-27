// The table's memory (engine/ledger.js cast.*, from v3, 28 Nov 2026): the people, factions, places and threads
// the party meets, one card each, written by the Director and kept the same all game.
import test from 'node:test';
import assert from 'node:assert/strict';
import { viewFor } from '../engine/ledger.js';
import { briefing } from '../brain/director.js';
import { toolbox } from '../brain/tools.js';
import { makeRng } from '../engine/dice.js';
import { mod, table, diver } from './helpers.js';

test('a card per name, facts added to it, the party kept out, the host forgets', () => {
  const T = table(4);
  const a = diver(T, 'p1', 0);
  T.host({ type: 'cast.remember', name: 'Old Harl', kind: 'person', fact: 'Runs the lamp dock; owes the divers money.' });
  T.host({ type: 'cast.remember', name: 'old harl', kind: 'person', fact: 'Afraid of the bell.' });
  const cards = Object.values(T.s.cast);
  assert.equal(cards.length, 1);
  assert.equal(cards[0].facts.length, 2);
  assert.equal(cards[0].origin, 'table');
  assert.throws(() => T.host({ type: 'cast.remember', name: a.name, kind: 'person', fact: 'x' }), /party/);
  T.host({ type: 'cast.forget', id: cards[0].id, fact: 0 });
  assert.deepEqual(T.s.cast[cards[0].id].facts.map((f) => f.text), ['Afraid of the bell.']);
  assert.equal(viewFor(T.s, 'player').cast, undefined, 'players never see the table\'s memory');
  T.host({ type: 'cast.forget', id: cards[0].id });
  assert.deepEqual(T.s.cast, {});
});

test('the Director remembers with its tool, and reads the cards in its briefing', () => {
  const T = table(4);
  diver(T, 'p1', 0);
  const tb = toolbox({ state: T.s, mod, rng: makeRng(1) });
  const r = tb.run('remember', { name: 'The Brine Choir', kind: 'faction', fact: 'They want the bell rung at low tide.' });
  assert.equal(r.remembered, true);
  const b = briefing(tb.state, mod, {});
  assert.match(b, /PEOPLE, PLACES AND THREADS THE TABLE HAS MET \(1 on record/);
  assert.match(b, /The Brine Choir \(faction.*They want the bell rung at low tide/);
});
