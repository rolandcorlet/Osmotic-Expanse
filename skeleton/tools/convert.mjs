#!/usr/bin/env node
// The converter from the command line.
//
//   node tools/convert.mjs --mode invent --ideas "Sky whales, a city of kites, smugglers" --name "Kitefall"
//   node tools/convert.mjs --mode convert --source my-rules.md my-monsters.txt my-campaign.md
//   node tools/convert.mjs --mode extend --base saltglass --source new-monsters.txt --sections bestiary
//   node tools/convert.mjs --mode invent --dice percentile --ideas-file ideas.txt --name "Gull Rock"   (a dice system: d6-pool, d20, percentile, fate, step)
//   node tools/convert.mjs --check saltglass
//
// It uses the AI chosen on the host console (saves/director.json), or --provider, --model and --key.
// Source files are plain text or Markdown (save a PDF or Word file as text first).

import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { convert } from '../brain/converter.js';
import { createSettings } from '../brain/settings.js';
import { build } from '../brain/providers.js';
import { loadModule, saveModule, listModules, check, moduleHome, allModules } from '../engine/module.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const MOD_DIR = join(ROOT, 'modules');
const argv = process.argv.slice(2);
const flag = (k) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : ''; };
const many = (k) => { const i = argv.indexOf(`--${k}`); if (i < 0) return []; const out = []; for (let j = i + 1; j < argv.length && !argv[j].startsWith('--'); j++) out.push(argv[j]); return out; };

if (flag('check')) {
  const r = check(loadModule(moduleHome(ROOT, flag('check')), flag('check')));
  console.log(r.ok ? `${flag('check')}: valid.` : `${flag('check')}: ${r.errors.length} problem(s):\n- ${r.errors.join('\n- ')}`);
  if ((r.advice || []).length) console.log(`Advice (valid, but the Director is likely to stumble there):\n~ ${r.advice.join('\n~ ')}`);
  process.exit(r.ok ? 0 : 1);
}

const mode = flag('mode') || (many('source').length ? 'convert' : 'invent');
const source = many('source').map((f) => `=== ${f} ===\n${readFileSync(f, 'utf8')}`).join('\n\n');
const ideas = flag('ideas') || (flag('ideas-file') ? readFileSync(flag('ideas-file'), 'utf8') : '');
const provider = flag('provider')
  ? build({ provider: flag('provider'), model: flag('model'), apiKey: flag('key') || '', baseUrl: flag('url') })
  : createSettings({ saveDir: join(ROOT, 'saves') }).provider();

const t0 = Date.now();
const out = await convert({
  provider, mode, source, ideas, name: flag('name'), notes: flag('notes'), dice: flag('dice'),
  sections: flag('sections') ? flag('sections').split(',') : undefined,
  existing: mode === 'extend' ? loadModule(moduleHome(ROOT, flag('base')), flag('base')) : null,
  onProgress: (p) => console.log(`  ${p.section}: ${p.stage}${p.errors && p.errors.length ? ` (${p.errors.length} problem${p.errors.length > 1 ? 's' : ''})` : ''}`),
});
if (mode !== 'extend') {
  const taken = new Set(allModules(ROOT).map((m) => m.id));
  let id = out.mod.module.id;
  for (let n = 2; taken.has(id); n++) id = `${out.mod.module.id}-${n}`;
  out.mod.module.id = id;
}
const dir = saveModule(MOD_DIR, out.mod);
console.log(`\nSaved to ${dir} in ${Math.round((Date.now() - t0) / 1000)} s (${out.usage.in} tokens in, ${out.usage.out} out).`);
console.log(out.ok ? 'The module is valid: start the host and choose it under New game.' : `Still ${out.errors.length} problem(s) to fix by hand or by running again:\n- ${out.errors.join('\n- ')}`);
if ((out.advice || []).length) console.log(`Advice (valid, but the Director is likely to stumble there):\n~ ${out.advice.join('\n~ ')}`);
