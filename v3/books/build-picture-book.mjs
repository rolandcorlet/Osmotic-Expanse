// Writes the v3 picture book: every lineage and every creature with its picture.
// The art already exists in the Players Assistant and the character generator; this reads it
// from there (read-only) and lays it out as one self-contained page that also prints well.
// Run: node v3/books/build-picture-book.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const root = new URL('../../', import.meta.url);
const players = readFileSync(new URL('players/index.html', root), 'utf8');
const chargen = readFileSync(new URL('chargen/osmotic-generator.html', root), 'utf8');
const best = JSON.parse(readFileSync(new URL('v3/director/data/bestiary.json', root), 'utf8'));

const img = {};
for (const m of players.matchAll(/"([^"]{1,40})":\s*"(data:image\/webp;base64,[A-Za-z0-9+/=]+)"/g)) img[m[1]] = m[2];
const at = chargen.indexOf('var OXX = ') + 10;
let depth = 0, end = at, inStr = false, esc = false;
for (let i = at; i < chargen.length; i++) {
  const ch = chargen[i];
  if (inStr) { if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === '"') inStr = false; continue; }
  if (ch === '"') inStr = true; else if (ch === '{') depth += 1; else if (ch === '}') { depth -= 1; if (!depth) { end = i + 1; break; } }
}
const lin = JSON.parse(chargen.slice(at, end)).lin;

const e = (t) => String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const ORDER_PLAIN = {
  'Order I: Lytic Swarms': 'Hunger that learned to move. They dissolve things before eating them.',
  'Order II: Protein Sentinels': 'Parts of a building that defend it. They hold ground and rarely chase.',
  'Order III: Nutrient Drifters': 'The grazing herds. Huge, slow, and mostly unwilling to fight.',
  'Order IV: Pathogenic Wraiths': 'Things that turn your own abilities against you.',
  'Order V: Osmotic Brutes': 'Pressure with an opinion. They win by moving you.',
  'Order VI: Immune Sentinels': 'The world\'s police. They recognise, mark and report.',
  'Order VII: Anomalies': 'Places where the rules have broken, wearing a body.',
};
const missing = [];
const H = [];
H.push(`<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>The Osmotic Expanse — Picture Book</title><style>
:root{--bg:#10141a;--panel:#18202a;--line:#2a3644;--ink:#e8eef5;--dim:#9db0c4;--accent:#6fd3c0}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.5 system-ui,Segoe UI,Roboto,sans-serif}
header.cover{position:relative;min-height:340px;display:flex;align-items:flex-end;background:#000 center/cover no-repeat}
header.cover .t{width:100%;padding:28px 24px;background:linear-gradient(transparent,rgba(0,0,0,.85))}
h1{margin:0;font-size:38px}h2{margin:44px 0 6px;font-size:26px;border-bottom:1px solid var(--line);padding-bottom:6px}h3{margin:0 0 4px;font-size:19px}
main{max-width:1180px;margin:0 auto;padding:8px 20px 60px}p{margin:6px 0}.dim{color:var(--dim)}.small{font-size:13px}
nav{display:flex;flex-wrap:wrap;gap:8px;margin:18px 0}nav a{color:var(--accent);text-decoration:none;border:1px solid var(--line);border-radius:999px;padding:4px 12px;font-size:14px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:16px;margin-top:14px}
.card{background:var(--panel);border:1px solid var(--line);border-radius:12px;overflow:hidden;break-inside:avoid}
.card img{display:block;width:100%;aspect-ratio:1/1;object-fit:cover;background:#000}.card .noimg{aspect-ratio:1/1;display:flex;align-items:center;justify-content:center;color:var(--dim);background:#0b0f14;font-size:14px;text-align:center;padding:16px}
.card .b{padding:12px 14px}.tag{display:inline-block;font-size:12px;color:var(--accent);border:1px solid var(--line);border-radius:999px;padding:1px 8px;margin-bottom:6px}
.lin{grid-template-columns:repeat(auto-fill,minmax(330px,1fr))}.stat{font-family:ui-monospace,Consolas,monospace;font-size:12px;color:var(--dim);margin-top:8px}
@media print{:root{--bg:#fff;--panel:#fff;--line:#bbb;--ink:#111;--dim:#444;--accent:#065}nav{display:none}.grid{grid-template-columns:repeat(3,1fr)}h2{break-before:page}header.cover{min-height:200px}}
</style></head><body>`);
H.push(`<header class="cover" style="background-image:url('${img['banner-world'] || ''}')"><div class="t"><h1>The Osmotic Expanse</h1><p>Picture Book · v3 · the six lineages and every creature of the Lytic Bestiary</p></div></header><main>`);
const orders = [...new Set(Object.values(best).map((c) => c.order))];
H.push(`<nav><a href="#lineages">Lineages</a>${orders.map((o, i) => `<a href="#o${i}">${e(o)}</a>`).join('')}</nav>`);
H.push('<p class="dim">Everyone in this world is a single living cell the size of a person. The six lineages are the peoples you can play. The creatures are what you meet. Numbers are kept small and last: this is a book for looking.</p>');
H.push('<h2 id="lineages">The six lineages</h2><p class="dim">The peoples of the Expanse. You choose one when you make a character.</p><div class="grid lin">');
for (const [name, L] of Object.entries(lin)) {
  H.push(`<div class="card"><img alt="${e(name)}" src="${L.portrait || img[`lineage-${name.toLowerCase()}`] || ''}"><div class="b"><h3>${e(name)}</h3><p>${e(L.intro)}</p>${L.gift ? `<p class="small"><b>Gift.</b> ${e(L.gift)}</p>` : ''}${L.frailty ? `<p class="small"><b>Frailty.</b> ${e(L.frailty)}</p>` : ''}${name === 'Flagellan' ? '<p class="small"><b>Rides It Out (v3).</b> A rolled 1 marks Stress only three times in four.</p>' : ''}</div></div>`);
}
H.push('</div>');
orders.forEach((o, i) => {
  const list = Object.values(best).filter((c) => c.order === o).sort((a, b) => (a.tier - b.tier) || a.name.localeCompare(b.name));
  H.push(`<h2 id="o${i}">${e(o)}</h2><p class="dim">${e(ORDER_PLAIN[o] || '')}</p><div class="grid">`);
  for (const c of list) {
    const own = img[`m-${c.id}`];
    const shared = !own && /Order II/.test(o) ? img['order-II'] : '';
    if (!own) missing.push(c.name + (shared ? ' (shows the Order picture)' : ' (no picture)'));
    H.push(`<div class="card">${own || shared ? `<img alt="${e(c.name)}" src="${own || shared}">` : '<div class="noimg">No picture yet</div>'}<div class="b"><span class="tag">${e(c.cls)} · Tier ${e(c.tier)}</span><h3>${e(c.name)}</h3>${shared ? '<p class="small dim">Picture: the Order as a whole. This creature has no portrait of its own yet.</p>' : ''}${c.tactics ? `<p><b>In a fight:</b> ${e(c.tactics)}</p>` : ''}${c.weakness ? `<p class="small"><b>Weak point:</b> ${e(c.weakness)}</p>` : ''}<div class="stat">${e(c.statLine)}</div></div></div>`);
  }
  H.push('</div>');
});
H.push('</main></body></html>');
writeFileSync(new URL('./PICTURE-BOOK-v3.html', import.meta.url), H.join('\n'));
console.log('PICTURE-BOOK-v3.html', Math.round(H.join('\n').length / 1024), 'KB;', Object.keys(lin).length, 'lineages;', Object.keys(best).length, 'creatures;', missing.length, 'without their own picture:', missing.join(', '));
