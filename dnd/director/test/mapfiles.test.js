import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sniffImage, createMapStore } from '../mapfiles.js';

const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
test('map pictures: only real images are kept, named by their contents', () => {
  assert.equal(sniffImage(PNG), 'png');
  assert.equal(sniffImage(Buffer.from('ffd8ffe000104a464946000101', 'hex')), 'jpg');
  assert.equal(sniffImage(Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBPVP8 ')])), 'webp');
  assert.equal(sniffImage(Buffer.from('<svg onload="alert(1)"></svg>')), null);
  const store = createMapStore(join(mkdtempSync(join(tmpdir(), 'maps-')), 'maps'));
  const url = store.put(PNG);
  assert.match(url, /^\/maps\/[a-f0-9]{24}\.png$/);
  assert.equal(store.put(PNG), url);
  assert.deepEqual(store.get(url.slice(6)).bytes, PNG);
  assert.equal(store.get('../session.json'), null);
  assert.throws(() => store.put(Buffer.from('<html>hello there</html>')), /not a picture/);
});
