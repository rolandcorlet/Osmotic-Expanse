// The private book library and the adventures' own monsters, merged into the SRD before anything
// indexes it (R.index caches on the object). library/library.json is built on your machine by
// tools/import-books.mjs from your own copies of the books; git ignores it, so it is never shared.
import { readFileSync, existsSync, statSync } from 'node:fs';

export function loadLibrary(file) {
  if (!file || !existsSync(file)) return null;
  // Its engine version (tools/compile-book.mjs --library), when it was made from this library.
  const eng = file.replace(/\.json$/, '.engine.json');
  if (eng !== file && existsSync(eng) && statSync(eng).mtimeMs >= statSync(file).mtimeMs) file = eng;
  try { return JSON.parse(readFileSync(file, 'utf8')); } catch (e) { console.log(`The book library could not be read (${e.message}); playing with the SRD alone.`); return null; }
}

import { mergeLibrary, mergeAdventureMonsters } from './merge.js';

export { mergeLibrary, mergeAdventureMonsters };

// Both, in the right order, for the server, the bench and the tests.
export function prepareSrd(srd, { libraryFile = null, adventures = [] } = {}) {
  const added = mergeLibrary(srd, loadLibrary(libraryFile));
  const own = mergeAdventureMonsters(srd, adventures);
  return { library: added, adventureMonsters: own };
}
