import test from 'node:test';
import assert from 'node:assert/strict';
import { checkAdventure, levelRange } from '../engine/check.js';
import { ADVENTURES } from '../data/adventures/index.js';
import { srd } from './helpers.js';

test('the adventures that ship have no errors', () => {
  for (const a of ADVENTURES) {
    const r = checkAdventure(a, srd);
    assert.deepEqual(r.errors, [], `${a.id}: ${JSON.stringify(r.errors)}`);
  }
});

test('the checker finds what would trip play', () => {
  const bad = {
    id: 'Bad Quest', name: 'Bad', levels: '1 to 3', intro: 'x',
    quests: ['Find the Lost Bell.'],
    questDone: [{ match: 'Lost Bell', at: ['nowhere'] }],
    pregens: [{ id: 'h1', name: 'Grisk', input: { name: 'Grisk', race: 'human', class: 'fighter' } }],
    sites: [
      { id: 'start', name: 'Start', read: 'r', exits: [{ to: 'hall', label: 'in' }, { to: 'attic', label: 'up' }], checks: [{ skill: 'lockpicking', dc: 12, find: 'x' }] },
      { id: 'hall', name: 'Hall', read: 'r', exits: [{ to: 'start', label: 'out' }],
        zones: [{ name: 'Door', from: ['start', 'moon'] }, { name: 'Dais', links: ['balcony'] }],
        foes: [{ monster: 'goblin', count: 2, name: 'Grisk', zone: 'pit' }, { monster: 'gelatinous-dragon', count: 1 }],
        clocks: [{ name: 'Alarm', size: 40 }],
        npcs: [{ name: 'Old Bren', who: 'a lamplighter' }] },
      { id: 'cellar', name: 'Cellar', read: 'r', exits: [] },
    ],
  };
  const r = checkAdventure(bad, srd);
  const all = (xs) => xs.map((x) => `${x.where}: ${x.text}`).join('\n');
  const E = all(r.errors); const W = all(r.warnings);
  assert.match(E, /adventure: Its id "Bad Quest"/);
  assert.match(E, /start: An exit leads to "attic"/);
  assert.match(E, /start: A check uses the skill "lockpicking"/);
  assert.match(E, /hall: Zone "Door" says the party comes in from "moon"/);
  assert.match(E, /hall: Grisk starts in zone "pit", which is not a zone here/);
  assert.match(E, /hall: The monster "gelatinous-dragon" is not in the SRD/);
  assert.match(E, /hall: A monster is called "Grisk", like a ready-made hero/);
  assert.match(E, /hall: The clock "Alarm" has size 40/);
  assert.match(E, /quests: questDone "Lost Bell" must be lower case/);
  assert.match(E, /quests: questDone "Lost Bell" can finish at "nowhere"/);
  assert.match(W, /cellar: It cannot be reached/);
  assert.match(W, /hall: Old Bren has no "voice"/);
  assert.match(W, /hall: Zone "Dais" links to "balcony", which is not a zone here/);
  assert.ok(r.fights.length === 1 && r.fights[0].site === 'hall');
});

test('level ranges', () => {
  assert.deepEqual(levelRange('1 to 3'), [1, 3]);
  assert.deepEqual(levelRange('levels 1–10'), [1, 10]);
  assert.deepEqual(levelRange('any'), [1, 5]);
});
