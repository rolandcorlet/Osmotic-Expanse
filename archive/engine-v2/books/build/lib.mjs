// Shared helpers for the Engine-ready book builders. Each builder holds one book's data as plain
// objects and writes two files from it: the JSON the Engine would load, and the readable edition.
// Nothing here reads or writes outside engine-redesign/books/.
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = join(dirname(fileURLToPath(import.meta.url)), '..');

export function out(rel, text) {
  const p = join(root, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, text.endsWith('\n') ? text : `${text}\n`);
  console.log(`wrote ${rel} (${text.length} chars)`);
}

const cell = (v) => {
  if (v == null || v === '') return '';
  if (Array.isArray(v)) return v.map(cell).join('; ');
  if (typeof v === 'object') return Object.entries(v).map(([k, x]) => `${k} ${cell(x)}`).join(', ');
  return String(v).replace(/\|/g, '/').replace(/\n/g, ' ');
};

// table(rows, [['Heading', 'field' | (row) => value], ...])
export function table(rows, cols) {
  const head = `| ${cols.map((c) => c[0]).join(' | ')} |`;
  const rule = `| ${cols.map(() => ':--').join(' | ')} |`;
  const body = rows.map((r) => `| ${cols.map((c) => cell(typeof c[1] === 'function' ? c[1](r) : r[c[1]])).join(' | ')} |`);
  return [head, rule, ...body].join('\n');
}

export const steps = (list) => list.map((s, i) => `${i + 1}. ${s}`).join('\n');
export const bullets = (list) => list.map((s) => `- ${s}`).join('\n');

// Read-only access to the published books, for conversion at build time.
import { readFileSync } from 'node:fs';
export const book = (name) => readFileSync(join(root, '..', '..', name), 'utf8');
export const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const plain = (s) => String(s).replace(/\*\*/g, '').replace(/\\\|/g, '/').trim();

// The first markdown table after a heading that matches `after`. Rows come back keyed by header.
export function mdTable(text, after) {
  const lines = text.split('\n');
  let i = lines.findIndex((l) => after.test(l));
  if (i < 0) return [];
  while (i < lines.length && !/^\|/.test(lines[i])) i += 1;
  const cells = (l) => l.replace(/^\||\|$/g, '').split('|').map(plain);
  const head = cells(lines[i]);
  const rows = [];
  for (i += 2; i < lines.length && /^\|/.test(lines[i]); i += 1) {
    const c = cells(lines[i]);
    rows.push(Object.fromEntries(head.map((h, k) => [h, c[k] || ''])));
  }
  return rows;
}
export const num = (s) => { const m = String(s).replace(/,/g, '').match(/-?\d+/); return m ? Number(m[0]) : null; };
