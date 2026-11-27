// A converted adventure's art in play: each picture is linked to one monster or one place, with no AI, so
// the players see it the first time they fight that monster or reach that place (engine/ledger.js art.*).
//
//   linkArt(adv)             sets picture.link = { kind: 'monster' | 'site', id, why } where one is clear
//   artFor(adv, kind, id)    the pictures linked to that monster or place
//
// How a picture is linked, the first that gives one answer:
//   1. the DM's choice on the Run tab's Pictures strip: show 'site:<id>', 'monster:<id>' or 'never';
//   2. its words ("A yeti attacks a traveler..."): a monster's name, singular or plural, the longest; else a
//      place's whole name;
// A guess from the book's page was tried (27 Nov) and was wrong more often than right (the art sits beside
// other monsters' words), so the rest are the DM's to give on the Run tab's Pictures strip.
// Never covers, credits, logos, stat blocks, pages, handouts or decorations.

const NOT_ART = /\b(cover|credits?|title page|logo|foreword|table of contents|contents page)\b/i;
const words = (x) => String(x || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const phraseRx = (p) => new RegExp(`\\b${p.split(' ').map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+')}(?:s|es)?\\b`, 'gi');
const count = (text, p) => (p ? (String(text).match(phraseRx(p)) || []).length : 0);

// The monsters this adventure fights or brings: id -> the phrases that name it.
function monsterNames(adv) {
  const out = new Map();
  const add = (id, name) => {
    if (!id) return;
    const set = out.get(id) || new Set();
    const own = String(id).replace(/^[a-z]{2,5}-(?=[a-z])/, (m) => ((adv.monsters || []).some((x) => x.id === id) ? '' : m));
    for (const p of [words(name), words(own)]) if (p && p.length > 2) set.add(p);
    out.set(id, set);
  };
  for (const m of adv.monsters || []) add(m.id, m.name);
  for (const s of adv.sites || []) for (const f of s.foes || []) add(f.monster, '');
  return out;
}
const siteNames = (adv) => (adv.sites || []).map((s) => [s.id, words(s.name).replace(/^the /, '')]).filter(([, n]) => n.length > 3);

// The one best of [key, score]: the highest, and strictly higher than the next. Else null.
function best(scored, min) {
  const s = scored.filter(([, n]) => n >= min).sort((a, b) => b[1] - a[1]);
  return s.length && (s.length === 1 || s[0][1] > s[1][1]) ? s[0][0] : null;
}

export function linkArt(adv) {
  if (!adv || !Array.isArray(adv.pictures)) return adv;
  const mons = monsterNames(adv);
  const sites = siteNames(adv);
  for (const p of adv.pictures) {
    delete p.link;
    const show = String(p.show || '');
    if (show === 'never') continue;
    const chosen = /^(site|monster):(.+)$/.exec(show);
    if (chosen) { p.link = { kind: chosen[1], id: chosen[2], why: 'the DM' }; continue; }
    if (p.kind !== 'art' || NOT_ART.test(p.about || '')) continue;
    const about = words(p.about);
    // 2. its words: the longest monster name in them, else a place's whole name
    let hit = null;
    for (const [id, names] of mons) for (const n of names) if (count(about, n) && (!hit || n.length > hit.n.length)) hit = { id, n };
    if (hit) { p.link = { kind: 'monster', id: hit.id, why: `its words name ${hit.n}` }; continue; }
    const place = best(sites.map(([id, n]) => [id, count(about, n) ? n.length : 0]), 1);
    if (place) p.link = { kind: 'site', id: place, why: 'its words name the place' };
  }
  return adv;
}

export const artFor = (adv, kind, id) => ((adv && adv.pictures) || []).filter((p) => p.link && p.link.kind === kind && p.link.id === id);
