// A book's pictures in play (engine/pictures.js and the Ledger's art.*, 28 Nov 2026): linked by their words to a
// creature or a place, shown once by themselves on arrival or at the fight, and by the host at any time.
import test from 'node:test';
import assert from 'node:assert/strict';
import { linkArt, cleanPictures, artFor } from '../engine/pictures.js';
import { viewFor } from '../engine/ledger.js';
import { mod, table, diver } from './helpers.js';

const adv = mod.adventures[0];
const P = (n) => `/maps/${String(n).repeat(24)}.png`;
adv.pictures = cleanPictures([
  { url: P(1), w: 800, h: 600, about: 'Glass eels coil in the flooded road', page: 3 },
  { url: P(2), w: 800, h: 600, about: 'The Sunken Causeway at low water', page: 4 },
  { url: P(3), w: 800, h: 600, about: 'An old map of the coast', page: 9 },
  { url: 'http://elsewhere/x.png', w: 1, h: 1, about: 'not ours' },
]);
linkArt(adv, mod);

test('pictures are linked by their words: a creature first, else a place', () => {
  assert.equal(adv.pictures.length, 3, 'only the picture store\'s own addresses are kept');
  assert.deepEqual(adv.pictures[0].link && [adv.pictures[0].link.kind, adv.pictures[0].link.id], ['creature', 'glass-eel']);
  assert.deepEqual(adv.pictures[1].link && [adv.pictures[1].link.kind, adv.pictures[1].link.id], ['site', 'causeway']);
  assert.equal(adv.pictures[2].link, undefined);
  assert.equal(artFor(adv, 'site', 'causeway').length, 1);
  adv.pictures[2].show = 'site:nave'; linkArt(adv, mod);
  assert.equal(artFor(adv, 'site', 'nave')[0].url, P(3));
});

test('a place\'s picture shows the first time the party arrives, a creature\'s at the fight, and the host shows any', () => {
  const T = table(3);
  diver(T, 'p1', 0);
  T.host({ type: 'site.move', siteId: 'causeway' });
  assert.equal(T.s.art.now.url, P(2));
  T.host({ type: 'art.close' });
  assert.equal(T.s.art.now, null);
  T.host({ type: 'fight.start' });
  assert.equal(T.s.art.now.url, P(1));
  assert.throws(() => T.as('p1', { type: 'art.show', url: P(3) }), /Only the Director/);
  T.host({ type: 'art.show', url: P(3) });
  assert.equal(T.s.art.now.url, P(3));
  assert.throws(() => T.host({ type: 'art.show', url: P(7) }), /not one of this adventure/);
  const v = viewFor(T.s, 'player');
  assert.equal(v.art.now.url, P(3));
  assert.equal(v.art.shown, undefined);
});
