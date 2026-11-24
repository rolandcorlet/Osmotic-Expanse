// Merging into the SRD, with no file access, so the browser-only Assistants can use it too:
// your private book library (engine/library.js loads it on the server) and every adventure's own
// monsters. Merge before anything indexes the SRD (R.index caches on the object).

// An index built before the merge would miss what was added: R.index rebuilds it when asked.
const dropIndex = (srd) => { if (Object.prototype.hasOwnProperty.call(srd, '_ix')) delete srd._ix; };
const lower = (s) => String(s || '').toLowerCase();

export function mergeLibrary(srd, lib) {
  if (!lib) { Object.defineProperty(srd, 'libRules', { value: [], enumerable: false, configurable: true, writable: true }); return null; }
  const add = (list, items) => {
    const ids = new Set(list.map((x) => x.id)); let n = 0;
    for (const x of items || []) if (x && x.id && !ids.has(x.id)) { list.push(x); ids.add(x.id); n += 1; }
    return n;
  };
  const added = { spells: add(srd.spells, lib.spells), monsters: add(srd.monsters, lib.monsters), backgrounds: add(srd.backgrounds, lib.backgrounds), subraces: 0, subclasses: 0, rules: (lib.rules || []).length };
  for (const r of lib.races || []) {
    const race = srd.races.find((x) => x.id === r.id);
    if (!race) continue;
    race.subraces = race.subraces || [];
    for (const s of r.subraces || []) if (!race.subraces.some((x) => x.id === s.id || lower(x.name).includes(lower(s.name)) || lower(s.name).includes(lower(x.name)))) { race.subraces.push(s); added.subraces += 1; }
  }
  for (const c of lib.classes || []) {
    const cls = srd.classes.find((x) => x.id === c.id);
    if (!cls) continue;
    for (const s of c.subclasses || []) {
      const dup = cls.subclasses.some((x) => x.id === s.id || lower(s.name).includes(lower(x.name)) || lower(x.name).includes(lower(s.name)));
      if (!dup) { cls.subclasses.push(s); added.subclasses += 1; }
    }
  }
  // Rules text stays on the server: look-ups search it, and it is never sent to a browser.
  Object.defineProperty(srd, 'libRules', { value: lib.rules || [], enumerable: false, configurable: true, writable: true });
  srd.library = { source: lib.source || 'Your own books', builtAt: lib.builtAt || '', books: lib.books || [], added };
  dropIndex(srd);
  return added;
}

// Every adventure's own creatures (ids start with the adventure's prefix), added once.
export function mergeAdventureMonsters(srd, adventures) {
  const ids = new Set(srd.monsters.map((m) => m.id));
  let n = 0;
  for (const a of adventures || []) for (const m of a.monsters || []) if (!ids.has(m.id)) { srd.monsters.push({ ...m, adventure: a.id }); ids.add(m.id); n += 1; }
  if (n) dropIndex(srd);
  return n;
}
