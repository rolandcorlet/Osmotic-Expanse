// Pictures for the maps (a travel map, a place's battle map), kept beside the saved games in saves/maps.
// Each is named by its contents: the same picture imported twice is kept once, and no name can be guessed.

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const MAX_PICTURE = 25 * 1024 * 1024;
export const TYPES = { png: 'image/png', jpg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' };
const NAME = /^[a-f0-9]{24}\.(?:png|jpg|gif|webp)$/;

// What the bytes really are, whatever the file was called. Only these four are ever kept or served.
export function sniffImage(b) {
  if (!b || b.length < 12) return null;
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'png';
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg';
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) return 'gif';
  if (b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  return null;
}

export function createMapStore(dir) {
  return {
    put(bytes) {
      const ext = sniffImage(bytes);
      if (!ext) throw new Error('That is not a picture the maps can use (PNG, JPEG, WebP or GIF).');
      const name = `${createHash('sha256').update(bytes).digest('hex').slice(0, 24)}.${ext}`;
      mkdirSync(dir, { recursive: true });
      const file = join(dir, name);
      if (!existsSync(file)) writeFileSync(file, bytes);
      return `/maps/${name}`;
    },
    get(name) {
      if (!NAME.test(String(name || ''))) return null;
      const file = join(dir, name);
      if (!existsSync(file)) return null;
      return { bytes: readFileSync(file), type: TYPES[name.split('.').pop()] };
    },
  };
}
