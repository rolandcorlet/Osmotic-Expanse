// A converted adventure's pictures in play (from the D&D Director's engine/pictures.js, 28 Nov 2026): each
// picture kept from the book is linked to one creature or one place by its words, with no AI, so the table
// sees it the first time the party meets that creature or reaches that place (engine/ledger.js art.*).
//
//   linkArt(adv, mod)        sets picture.link = { kind: 'creature' | 'site', id, why } where one is clear
//   artFor(adv, kind, id)    the pictures linked to that creature or place
//
// A picture's words are what the PDF reader read in it, or the caption the host typed on the Converter tab.
// The host's own choice (picture.show: 'site:<id>', 'creature:<id>' or 'never') comes first.

const words = (x) => String(x || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const phraseRx = (p) => new RegExp(`\\b${p.split(' ').map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+')}(?:s|es)?\\b`, 'gi');
const count = (text, p) => (p ? (String(text).match(phraseRx(p)) || []).length : 0);
export const PICTURE_URL = /^\/maps\/[a-f0-9]{16,64}\.(?:png|jpg|gif|webp)$/;

// The creatures this adventure brings: id -> the names that call it.
function creatureNames(adv, mod) {
  const out = new Map();
  const ix = (mod && mod.ix && mod.ix.creature) || {};
  for (const s of adv.sites || []) {
    for (const c of s.creatures || []) {
      const id = c.id || c.base; if (!id) continue;
      const set = out.get(id) || new Set();
      for (const p of [words((ix[id] || {}).name), words(id.replace(/-/g, ' '))]) if (p && p.length > 2) set.add(p);
      out.set(id, set);
    }
  }
  return out;
}
export function linkArt(adv, mod) {
  if (!adv || !Array.isArray(adv.pictures)) return adv;
  const mons = creatureNames(adv, mod);
  const sites = (adv.sites || []).map((s) => [s.id, words(s.name).replace(/^the /, '')]).filter(([, n]) => n.length > 3);
  for (const p of adv.pictures) {
    delete p.link;
    const show = String(p.show || '');
    if (show === 'never') continue;
    const chosen = /^(site|creature):(.+)$/.exec(show);
    if (chosen) { p.link = { kind: chosen[1], id: chosen[2], why: 'the host' }; continue; }
    const about = words(p.about);
    let hit = null;
    for (const [id, names] of mons) for (const n of names) if (count(about, n) && (!hit || n.length > hit.n.length)) hit = { id, n };
    if (hit) { p.link = { kind: 'creature', id: hit.id, why: `its words name ${hit.n}` }; continue; }
    const places = sites.filter(([, n]) => count(about, n)).sort((a, b) => b[1].length - a[1].length);
    if (places.length && (places.length === 1 || places[0][1].length > places[1][1].length)) p.link = { kind: 'site', id: places[0][0], why: 'its words name the place' };
  }
  return adv;
}
export const artFor = (adv, kind, id) => ((adv && adv.pictures) || []).filter((p) => p.link && p.link.kind === kind && p.link.id === id);
// Pictures the converter brings, made safe: a picture store address, a size, a few words.
export function cleanPictures(list) {
  return (Array.isArray(list) ? list : []).filter((p) => p && PICTURE_URL.test(String(p.url || ''))).slice(0, 120).map((p) => ({
    url: String(p.url), w: Math.max(0, Math.trunc(Number(p.w) || 0)), h: Math.max(0, Math.trunc(Number(p.h) || 0)),
    about: String(p.about || '').replace(/\s+/g, ' ').trim().slice(0, 300), page: Math.max(0, Math.trunc(Number(p.page) || 0)),
  }));
}
