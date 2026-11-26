// The adventures the tools check, simulate and bench: the built-in ones, and those converted on the Books
// tab (library/adventures), as the server lists them. A converted one joins before the rules book is
// prepared, so its own monsters are there.
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ADVENTURES } from '../data/adventures/index.js';
import { loadAdventures } from '../brain/convert.js';

const LIB = join(dirname(fileURLToPath(import.meta.url)), '..', 'library', 'adventures');

export function withConverted(on = true) {
  if (on) for (const a of loadAdventures(LIB)) if (!ADVENTURES.some((x) => x.id === a.id)) ADVENTURES.push(a);
  return ADVENTURES;
}
// By its id, or nothing: never the default adventure in its place (a mistyped id must not bench another).
export const findAdventure = (id) => ADVENTURES.find((a) => a.id === id) || null;
