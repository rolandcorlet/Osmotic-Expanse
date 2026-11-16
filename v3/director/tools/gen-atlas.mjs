// Reads the original Player's Atlas and writes the parts of the v3 edition that are the book's own text
// in a fixed shape: the six lineages, the twenty-four Phenotypes, the Adaptations and the six builds.
// Nothing is retyped by hand, so no number can drift from the printed book.
//   node tools/gen-atlas.mjs      ->  data/kit/atlas.generated.js
import { readFileSync, writeFileSync } from 'node:fs';

const src = readFileSync(new URL('../../../The Osmotic Expanse - PLAYER\'S ATLAS.md', import.meta.url), 'utf8').replace(/\r/g, '');
const lines = src.split('\n');
const clean = (t) => String(t || '').replace(/\*\*/g, '').replace(/(^|[^*])\*([^*\n]+)\*/g, '$1$2').replace(/`/g, '').replace(/\s+/g, ' ').trim();
const slug = (t) => clean(t).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const at = (re, from = 0) => { for (let i = from; i < lines.length; i++) if (re.test(lines[i])) return i; return -1; };
const block = (a, b) => lines.slice(a, b < 0 ? lines.length : b);

// ---- lineages (chapter 2)
const lineageStart = at(/^# 2 · THE SIX LINEAGES/);
const phenoStart = at(/^# 3 · THE TWENTY-FOUR PHENOTYPES/);
const LINEAGES = [];
{
  const heads = [];
  for (let i = lineageStart; i < phenoStart; i++) if (/^## [A-Z]+ — /.test(lines[i])) heads.push(i);
  heads.forEach((h, k) => {
    const body = block(h, k + 1 < heads.length ? heads[k + 1] : phenoStart);
    const m = body[0].match(/^## ([A-Z]+) — \*(.+)\*/);
    const name = m[1][0] + m[1].slice(1).toLowerCase();
    const para = clean(body.slice(1).find((l) => l.trim() && !l.startsWith('*')) || '');
    const bullets = body.filter((l) => l.startsWith('* ')).map((l) => clean(l.slice(2)));
    const get = (key) => (bullets.find((x) => x.startsWith(key)) || '').replace(key, '').replace(/^[:\s—-]+/, '').trim();
    LINEAGES.push({ id: `lineage-${slug(name)}`, name, epithet: m[2], para, bullets });
  });
}

// ---- phenotypes (chapter 3)
const PHENOS = [];
const TRADITIONS = [];
{
  const end = at(/^# 4 · ADVANCEMENT/);
  let tradition = '';
  const heads = [];
  for (let i = phenoStart; i < end; i++) {
    if (/^## THE [A-Z]+ TRADITION/.test(lines[i])) {
      const m = lines[i].match(/^## THE ([A-Z]+) TRADITION — \*(.+)\*/);
      tradition = m[1][0] + m[1].slice(1).toLowerCase();
      const intro = clean(lines.slice(i + 1, i + 6).find((l) => l.trim() && !l.startsWith('#')) || '');
      TRADITIONS.push({ name: tradition, tagline: m[2], intro });
    }
    if (/^### [A-Z -]+$/.test(lines[i])) heads.push({ i, tradition });
  }
  heads.forEach((h, k) => {
    const body = block(h.i, k + 1 < heads.length ? heads[k + 1].i : end).filter((l) => l.trim() !== '---');
    // stop at the next tradition heading
    const stop = body.findIndex((l, j) => j > 0 && /^## /.test(l));
    const b = stop > 0 ? body.slice(0, stop) : body;
    const name = clean(b[0].replace(/^### /, '')).replace(/(^|[ -])([A-Z])([A-Z]*)/g, (_, sep, a, c) => sep + a + c.toLowerCase());
    const meta = clean(b.find((l) => /^\*.+·.+\*$/.test(l.trim())) || '');
    const pathways = clean((b.find((l) => l.startsWith('**Granted Pathways:**')) || '').replace('**Granted Pathways:**', ''));
    const sigAt = b.findIndex((l) => l.startsWith('**Signature Mechanic'));
    const sigName = sigAt >= 0 ? clean(b[sigAt]).match(/Signature Mechanic\s*[—-]\s*([^.]+)\./) : null;
    const sigLines = [];
    for (let j = sigAt; j >= 0 && j < b.length && !b[j].startsWith('**Stage I'); j++) {
      const l = b[j];
      if (!l.trim() || /^\|\s*:?-/.test(l) || /^\|\s*(Spend|Cost|Slip buys)/i.test(l)) continue;
      if (l.startsWith('|')) { const cells = l.split('|').map((c) => clean(c)).filter(Boolean); sigLines.push(`${cells[0]}: ${cells.slice(1).join(' ')}`); continue; }
      sigLines.push(clean(l).replace(/^Signature Mechanic\s*[—-]\s*[^.]+\.\s*/, ''));
    }
    const stages = b.filter((l) => /^\*\*Stage (I|II|III|IV)\b/.test(l)).map((l) => clean(l));
    const field = (key) => clean((b.find((l) => l.startsWith(`**${key}:**`)) || '').replace(`**${key}:**`, ''));
    PHENOS.push({ id: `pheno-${slug(name)}`, name, tradition: h.tradition, meta, pathways, sigName: sigName ? sigName[1].trim() : '', sig: sigLines.filter(Boolean), stages, kit: field('Kit'), play: field('How to play'), links: field('Links') });
  });
}

// ---- adaptations (4.2)
const ADAPT = [];
{
  const a = at(/^## 4\.2 Adaptations/);
  const b = at(/^## 4\.3 /);
  for (let i = a; i < b; i++) {
    if (!/^\| \*\*/.test(lines[i])) continue;
    const c = lines[i].split('|').map((x) => clean(x));
    ADAPT.push({ name: c[1], cost: c[2], effect: c[3], wants: c[4] });
  }
}

// ---- builds (5.2)
const BUILDS = [];
{
  const a = at(/^## 5\.2 Six builds/);
  const b = at(/^## 5\.3 /);
  const heads = [];
  for (let i = a; i < b; i++) if (/^\*\*\d · /.test(lines[i])) heads.push(i);
  heads.forEach((h, k) => {
    const body = block(h, k + 1 < heads.length ? heads[k + 1] : b).map(clean).filter(Boolean);
    const m = body[0].match(/^(\d) · (.+?) — (.+)$/);
    BUILDS.push({ id: `build-${m[1]}-${slug(m[2])}`, n: Number(m[1]), name: m[2], who: m[3], lines: body.slice(1) });
  });
}

const out = `// GENERATED by tools/gen-atlas.mjs from "The Osmotic Expanse - PLAYER'S ATLAS.md". Do not edit by hand:
// change the book, then run the generator. These are the book's own words and numbers.
export const ATLAS_LINEAGES = ${JSON.stringify(LINEAGES, null, 1)};
export const ATLAS_TRADITIONS = ${JSON.stringify(TRADITIONS, null, 1)};
export const ATLAS_PHENOTYPES = ${JSON.stringify(PHENOS, null, 1)};
export const ATLAS_ADAPTATIONS = ${JSON.stringify(ADAPT, null, 1)};
export const ATLAS_BUILDS = ${JSON.stringify(BUILDS, null, 1)};
`;
writeFileSync(new URL('../data/kit/atlas.generated.js', import.meta.url), out);
console.log(`${LINEAGES.length} lineages, ${TRADITIONS.length} traditions, ${PHENOS.length} phenotypes, ${ADAPT.length} adaptations, ${BUILDS.length} builds`);
const bad = PHENOS.filter((p) => p.stages.length !== 4 || !p.kit || !p.play || !p.links || !p.pathways || !p.meta || !p.sigName);
for (const p of bad) console.log('CHECK', p.name, { stages: p.stages.length, kit: !!p.kit, play: !!p.play, links: !!p.links, pathways: !!p.pathways, meta: !!p.meta, sig: p.sigName });
for (const l of LINEAGES) if (l.bullets.length < 6) console.log('CHECK lineage', l.name, l.bullets.length);
