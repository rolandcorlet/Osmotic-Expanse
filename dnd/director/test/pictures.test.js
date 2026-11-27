import { test } from 'node:test';
import assert from 'node:assert/strict';
import { linkArt, artFor } from '../engine/pictures.js';

const pic = (about, page = 1, extra = {}) => ({ url: `/maps/${'a'.repeat(24)}.jpg`, w: 10, h: 10, kind: 'art', about, page, ...extra });
const adv = (pictures) => ({
  sites: [{ id: 'town', name: 'Snowy Waterfront Town', foes: [{ monster: 'yeti' }] }, { id: 'lair', name: 'Yeti Lair', foes: [{ monster: 'eitf-tomb-tapper' }] }],
  monsters: [{ id: 'eitf-tomb-tapper', name: 'Tomb Tapper' }, { id: 'eitf-ice-troll', name: 'Ice Troll' }],
  pictures,
});

test('a picture is linked by the words that describe it', () => {
  const a = linkArt(adv([pic('A yeti attacks a traveler in a snowy mountain pass.'), pic('Two ice trolls feasting.'), pic('A snowy waterfront town at night.')]));
  assert.deepEqual(a.pictures.map((p) => p.link && `${p.link.kind}:${p.link.id}`), ['monster:yeti', 'monster:eitf-ice-troll', 'site:town']);
  assert.equal(artFor(a, 'monster', 'yeti').length, 1);
});

test('a picture whose words name nothing is not linked by a guess', () => {
  const a = linkArt(adv([pic('A gaunt creature holding a stone hammer.', 8)]));
  assert.equal(a.pictures[0].link, undefined);
});

test('covers, other kinds and the DM saying never are not linked; the DM\'s choice wins', () => {
  const a = linkArt(adv([pic('The cover, with a yeti.'), pic('A yeti.', 1, { kind: 'stat-block' }), pic('A yeti.', 1, { show: 'never' }), pic('A yeti.', 1, { show: 'site:lair' })]));
  assert.deepEqual(a.pictures.map((p) => p.link && p.link.id), [undefined, undefined, undefined, 'lair']);
});

test('an adventure with no pictures is left as it is', () => {
  assert.doesNotThrow(() => linkArt({ sites: [] }));
  assert.deepEqual(artFor({ sites: [] }, 'site', 'x'), []);
});
