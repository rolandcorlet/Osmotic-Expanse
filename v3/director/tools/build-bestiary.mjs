// Reads the Lytic Bestiary (the book is the source of truth) and writes
// data/bestiary.json: one entry per printed block, numbers only where printed.
// Run:  node tools/build-bestiary.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, '..', '..', 'The Osmotic Expanse - LYTIC BESTIARY.md');
const out = join(here, '..', 'data', 'bestiary.json');
const lines = readFileSync(src, 'utf8').split(/\r?\n/);

const slug = (s) => s.toLowerCase().replace(/\(.*?\)/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const title = (s) => s.toLowerCase().replace(/(^|[\s-])([a-z])/g, (m, a, b) => a + b.toUpperCase());
const num = (re, text) => { const m = text.match(re); return m ? Number(m[1]) : null; };
const plain = (s) => s.replace(/\*\*/g, '').replace(/\*/g, '').trim();

const blocks = {};
let order = '';
for (let i = 0; i < lines.length; i++) {
  const l = lines[i];
  const oh = l.match(/^# (ORDER [IVX]+ — .+|ABIOTIC.+|COLONISTS.+)$/);
  if (oh) { const m = oh[1].match(/^ORDER ([IVX]+) — (.+)$/); order = m ? `Order ${m[1]}: ${title(m[2])}` : title(oh[1]); }
  const h = l.match(/^### (.+)$/);
  if (!h) continue;
  const stat = lines[i + 1] || '';
  if (!/MT\s+\d+/.test(stat) || !/pool\s+\d+d/.test(stat)) continue; // templates and non-creatures
  const name = title(h[1].trim());
  const head = plain(stat.split('**')[0]);
  const body = [];
  for (let j = i + 2; j < lines.length && !/^#{1,3} /.test(lines[j]) && !/^---/.test(lines[j]); j++) body.push(lines[j]);
  const field = (label) => {
    const row = body.find((b) => b.startsWith(`**${label}`));
    return row ? plain(row.replace(/^\*\*[^*]+\*\*/, '')).replace(/^[:\s]+/, '') : '';
  };
  const special = body.filter((b) => b.startsWith('**Special')).map((b) => plain(b));
  const bd = stat.match(/BD\s+(\d+)\s*\(?([A-Za-z]+)?/);
  const soakBraced = stat.match(/soak\s+\d+\s*\(\+(\d+) while braced\)/);
  const block = {
    id: slug(name),
    name,
    order,
    cls: (head.split('·')[0] || '').trim(),
    tier: num(/T(\d)/, head) || 1,
    size: (head.split('·').slice(2).join('·') || '').trim(),
    mt: num(/MT\s+(\d+)/, stat),
    mi: num(/MI\s+(\d+)/, stat),
    soak: num(/soak\s+(\d+)/, stat) || 0,
    bracedSoak: soakBraced ? Number(soakBraced[1]) : 0,
    bracedMt: num(/Brace \([^)]*MT \+(\d)/, body.join(' ')) || 0,
    bd: bd ? Number(bd[1]) : 0,
    type: bd && bd[2] && !/^(type|never|it)$/i.test(bd[2]) ? bd[2] : '',
    pool: num(/pool\s+(\d+)d/, stat),
    pp: num(/PP\s+(\d+)/, stat),
    segments: /Swarmling/.test(head) ? num(/Segments\s+(\d+)/, stat) : null,
    flow: num(/Flow\s+(\d+)/, stat),
    freqMod: num(/Frequency\s+([+−-]\d+)/, body.join(' ').replace(/−/g, '-')) || 0,
    statLine: plain(stat),
    traits: field('Traits'),
    special,
    weakness: field('Weakness'),
    harvest: field('HARVEST'),
    tactics: field('Tactics'),
  };
  blocks[block.id] = block;
}
writeFileSync(out, JSON.stringify(blocks, null, 1));
console.log(`Wrote ${Object.keys(blocks).length} blocks to data/bestiary.json`);
