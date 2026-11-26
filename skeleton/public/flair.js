// Small pieces of the player and table screens with a little life in them (the D&D Director and the Skeleton
// share this file, like scene.js): a hit-point vial that sloshes and drains, gems for spell slots (or Strain)
// that crack when spent, a sigil for the character's class or calling, a wax seal on a finished quest, a satchel
// for the party's loot, a glow when a level is ready, and the story as a journal (flair.css). Every colour is a
// CSS variable the Colours tab can change; with the Effects setting on Off they keep still (flair.css).
//
//   vial(key, frac, { label, title })        a vial of 0..1; drains with a ghost of what was lost
//   gems(key, rows, { title, cls })          rows: [{ label, max, used }]; a gem spent since last time cracks
//   sigil(name, { small })                   an SVG emblem for a class or calling (by the words in its name)
//   seal(id, done)                           a wax seal for a finished quest (stamped when it is new)
//   satchel(key, items, { title })           items: [{ name, qty }]; it jumps when something is added
//   levelReady(key, ready)                   true once when a level becomes ready: flash it (levelFlash)
//   levelFlash(text)                         a golden flare over the screen, with a word or two
//
// All return HTML strings, escaped. Browser-safe; nothing is kept but what changed since the last render.

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const seen = { vial: new Map(), gems: new Map(), seals: null, sealAt: new Map(), satchel: new Map(), level: new Map() };
const HOLD = 1600;
const now = () => Date.now();
// The value last time, and the one before it while a change is still fresh (HOLD ms).
function mark(map, key, v, same = (a, b) => a === b) {
  const m = map.get(key);
  if (!m) { const n = { v, was: v, at: 0 }; map.set(key, n); return n; }
  if (!same(m.v, v)) { m.was = m.v; m.v = v; m.at = now(); }
  if (now() - m.at > HOLD) m.was = m.v;
  return m;
}

export function vial(key, frac, { label = '', title = '' } = {}) {
  const f = Math.max(0, Math.min(1, Number(frac) || 0));
  // What changed, kept for a moment so a render in between does not cut the animation short.
  const m = mark(seen.vial, key, f);
  const was = m.was;
  const lvl = (x) => `${(x * 100).toFixed(1)}%`;
  const state = f <= 0 ? ' empty' : f <= 0.25 ? ' low' : f <= 0.5 ? ' mid' : '';
  // A drop: a ghost of what was there shrinks after the liquid. A rise: the liquid fills with a shimmer.
  const ghost = was > f ? `<i class="vial-ghost" style="--from:${lvl(was)};--to:${lvl(f)}"></i>` : '';
  const rise = f > was ? ' rise' : '';
  return `<div class="vial${state}${rise}" title="${esc(title)}"><div class="vial-glass">${ghost}<div class="vial-liquid" style="width:${lvl(f)}"><i class="vial-b"></i><i class="vial-b"></i><i class="vial-b"></i></div></div>${label ? `<span class="vial-label">${esc(label)}</span>` : ''}</div>`;
}

export function gems(key, rows, { title = '', cls = '' } = {}) {
  const cur = Object.fromEntries(rows.filter((r) => r && r.max > 0).map((r) => [r.label, Math.max(0, Math.min(r.max, r.used || 0))]));
  const m = mark(seen.gems, key, cur, (a, b) => JSON.stringify(a) === JSON.stringify(b));
  const was = m.was || {};
  const html = rows.filter((r) => r && r.max > 0).map((r) => {
    const used = Math.max(0, Math.min(r.max, r.used || 0));
    const before = was[r.label] == null ? used : was[r.label];
    // Lit gems first, spent ones after: one spent since the last look cracks; one restored glints back.
    const lit = r.max - used; const litBefore = r.max - before;
    const cells = Array.from({ length: r.max }, (_, n) => {
      const on = n < lit;
      return `<i class="gem${on ? '' : ' spent'}${!on && n < litBefore ? ' crack' : ''}${on && n >= litBefore ? ' back' : ''}"></i>`;
    }).join('');
    return `<div class="gem-row"><span class="gem-l">${esc(r.label)}</span><span class="gem-set">${cells}</span></div>`;
  }).join('');
  return html ? `<div class="gems${cls ? ` ${cls}` : ''}" title="${esc(title)}">${html}</div>` : '';
}

// An emblem drawn for this game (no one's artwork): a few strokes each, picked by the words of the name.
const G = {
  sword: '<path d="M12 2l2 3v10h-4V5z"/><path d="M7 15h10M12 15v5M10 21h4"/>',
  axe: '<path d="M8 3v18"/><path d="M8 5c5 0 9 2 9 6s-4 6-9 6"/>',
  staff: '<path d="M12 9v13"/><path d="M12 2l1.6 3.3 3.6.5-2.6 2.5.6 3.6L12 10.2 8.8 11.9l.6-3.6L6.8 5.8l3.6-.5z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/>',
  leaf: '<path d="M5 19C5 9 11 4 20 4c0 9-5 15-15 15z"/><path d="M5 19L14 10"/>',
  fist: '<circle cx="12" cy="12" r="9"/><path d="M8 13h8M9 10h6M9 16h6"/>',
  shield: '<path d="M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5z"/><path d="M12 7v10M8 11h8"/>',
  bow: '<path d="M6 3c8 3 8 15 0 18"/><path d="M6 3v18M4 12h16M17 9l3 3-3 3"/>',
  dagger: '<path d="M12 2l1.5 3v9h-3V5z"/><path d="M8.5 14h7M12 14v4"/><circle cx="12" cy="20" r="1.6"/>',
  flame: '<path d="M12 2c1 4 6 6 6 12a6 6 0 0 1-12 0c0-3 2-5 3-6 0 3 1 4 2 4 0-4-1-6 1-10z"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  lute: '<ellipse cx="9" cy="15" rx="5" ry="6"/><path d="M12 11L20 3M17 3l3 3"/><circle cx="9" cy="15" r="1.5"/>',
  book: '<path d="M4 4h7a2 2 0 0 1 2 2v14a2 2 0 0 0-2-2H4zM20 4h-7a2 2 0 0 0-2 2"/><path d="M20 4v14h-7"/>',
  hook: '<path d="M12 2v12a4 4 0 1 1-8 0"/><path d="M9 6h6"/>',
  lantern: '<path d="M9 5h6l1 3v9l-1 3H9l-1-3V8z"/><path d="M10 2h4M12 10v4"/>',
  wave: '<path d="M2 9c3-3 5 3 8 0s5 3 8 0 3 0 4 0M2 15c3-3 5 3 8 0s5 3 8 0 3 0 4 0"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9L7 7M17 17l2.1 2.1M19.1 4.9L17 7M7 17l-2.1 2.1"/>',
  quill: '<path d="M20 3C10 5 6 11 5 21"/><path d="M20 3c-1 7-6 10-11 11"/>',
  skull: '<path d="M5 11a7 7 0 1 1 14 0v4h-3v3H8v-3H5z"/><circle cx="9.5" cy="11" r="1.5"/><circle cx="14.5" cy="11" r="1.5"/>',
  hammer: '<path d="M5 5h9v5H5z"/><path d="M11 10v11"/>',
  cross: '<path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z"/>',
};
const SIGILS = [
  [/barbarian|berserk|brute|reaver/i, 'axe'], [/bard|minstrel|singer|skald|choir/i, 'lute'], [/cleric|priest|chaplain|acolyte|saint|nun/i, 'sun'],
  [/druid|warden|herbal|witch|shaman/i, 'leaf'], [/fighter|soldier|knight|warrior|guard|mercenar/i, 'sword'], [/monk|brawl|boxer/i, 'fist'],
  [/paladin|templar|crusad|defender|protector/i, 'shield'], [/ranger|hunter|scout|archer|tracker/i, 'bow'], [/rogue|thief|smuggler|spy|assassin|cutpurse/i, 'dagger'],
  [/sorcer|pyro|elemental/i, 'flame'], [/warlock|occult|seer|medium|psychic|oracle/i, 'eye'], [/physician|medic|nurse|healer|surgeon|apothecar/i, 'cross'], [/wizard|mage|arcan|scholar|sage|professor|doctor|investigator/i, 'staff'],
  [/journalist|writer|reporter|scribe|clerk/i, 'quill'], [/diver|sailor|fisher|salvage|swimmer|mariner/i, 'hook'], [/keeper|lamp|light|guide/i, 'lantern'],
  [/smith|engineer|tinker|mechanic|artificer/i, 'gear'], [/necro|grave|undertaker/i, 'skull'], [/labour|miner|builder|dwarf/i, 'hammer'], [/tide|sea|water|storm/i, 'wave'], [/lore|librar|student/i, 'book'],
];
export function sigil(name, { title = '', small = false } = {}) {
  const hit = SIGILS.find(([re]) => re.test(String(name || '')));
  // No emblem for these words: the name's first letter, full size.
  const inner = hit ? `<g class="sigil-g" transform="translate(4.8 4.8) scale(.6)">${G[hit[1]]}</g>`
    : `<text x="12" y="16.2" text-anchor="middle" font-size="11.5" font-weight="700" stroke="none" fill="currentColor" font-family="Georgia, serif">${esc(String(name || '?').trim().charAt(0).toUpperCase())}</text>`;
  return `<span class="sigil${small ? ' sm' : ''}" title="${esc(title || name || '')}"><svg viewBox="0 0 24 24" aria-hidden="true"><circle class="sigil-ring" cx="12" cy="12" r="11.2"/>${inner}</svg></span>`;
}

// A quest's seal: stamped (an animation) only when it is newly done, not on the first look at the screen.
export function seal(id, done) {
  if (!done) return '<span class="seal-none">•</span>';
  // Every quest already done when the screen first draws is old news: no stamp for those.
  if (seen.seals === null) { seen.seals = new Set(); seen.sealStart = now(); }
  if (!seen.seals.has(id) && now() - seen.sealStart > 800) seen.sealAt.set(id, now());
  seen.seals.add(id);
  const fresh = now() - (seen.sealAt.get(id) || 0) < HOLD;
  return `<span class="seal${fresh ? ' fresh' : ''}" title="Done"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 12.5l3.2 3.2L17 9"/></svg></span>`;
}

export function satchel(key, items, { title = 'Party loot' } = {}) {
  const n = items.reduce((t, x) => t + (Number(x.qty) || 1), 0);
  const was = mark(seen.satchel, key, n).was;
  if (!n) return '';
  return `<div class="satchel${n > was ? ' fresh' : ''}" title="${esc(title)}"><span class="satchel-bag"><svg viewBox="0 0 32 32" aria-hidden="true"><path class="bag" d="M7 12h18l2 15H5z"/><path class="flap" d="M7 12c0-4 4-7 9-7s9 3 9 7c-3 2-6 3-9 3s-6-1-9-3z"/><circle class="clasp" cx="16" cy="14" r="1.8"/></svg><b class="satchel-n">${n}</b></span><span class="satchel-list">${items.map((x) => `<span class="satchel-item">${x.qty > 1 ? `${esc(x.qty)} × ` : ''}${esc(x.name)}</span>`).join('')}</span></div>`;
}

export function levelReady(key, ready) {
  const was = seen.level.get(key);
  seen.level.set(key, !!ready);
  return !!ready && was === false;
}
export function levelFlash(text = 'Level up!') {
  if (typeof document === 'undefined' || !document.body.classList.contains('fx-on')) return;
  const el = document.createElement('div');
  el.className = 'lvl-flash';
  el.innerHTML = `<i></i><b>${esc(text)}</b>`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2800);
}
