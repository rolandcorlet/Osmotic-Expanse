import { test } from 'node:test';
import assert from 'node:assert/strict';
import { suggestArt } from '../brain/art.js';

const url = (c) => `/maps/${c.repeat(24)}.jpg`;
const adv = {
  monsters: [{ id: 'eitf-tomb-tapper', name: 'Tomb Tapper', size: 'Huge', type: 'construct' }],
  sites: [{ id: 'town', name: 'Caer-Dineval Harbor', read: 'A snowy waterfront town.' }, { id: 'lair', name: 'Yeti Lair', foes: [{ monster: 'yeti', name: 'Yeti Family' }] }],
  pictures: [
    { url: url('a'), kind: 'art', about: 'A tall gaunt creature with a vertical mouth, holding a stone hammer.' },
    { url: url('b'), kind: 'art', about: 'A snowy waterfront town at night.' },
    { url: url('c'), kind: 'art', about: 'A golden circlet.' },
    { url: url('d'), kind: 'art', about: 'Already linked.', link: { kind: 'site', id: 'lair' } },
    { url: url('e'), kind: 'stat-block', about: 'A stat block.' }],
};

test('the AI\'s matches come back as suggestions; none, unknown codes and linked pictures are left out', async () => {
  let asked = '';
  const ask = async (system, user) => { asked = user; return '{"links":[{"n":1,"to":"M1"},{"n":2,"to":"P1"},{"n":3,"to":"none"},{"n":4,"to":"M9"}]}'; };
  const out = await suggestArt({ ask, adv, srd: { monsters: [{ id: 'yeti', name: 'Yeti', size: 'Large', type: 'monstrosity' }] } });
  assert.deepEqual(out, [{ url: url('a'), show: 'monster:eitf-tomb-tapper', label: 'Tomb Tapper' }, { url: url('b'), show: 'site:town', label: 'Caer-Dineval Harbor' }]);
  assert.match(asked, /M2\. Yeti \(large monstrosity\)/);
  assert.doesNotMatch(asked, /Already linked|stat block/);
});

test('nothing to ask about: no call', async () => {
  const out = await suggestArt({ ask: async () => { throw new Error('asked'); }, adv: { sites: [], pictures: [] }, srd: {} });
  assert.deepEqual(out, []);
});
