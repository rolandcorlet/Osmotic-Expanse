// Builds the two D&D Assistants as single web pages that work offline, from the AI Director's own
// screens running in "local" mode (dnd/director/public/local.js):
//   dnd/dm/index.html       the Dungeon Master's Assistant
//   dnd/players/index.html  the Players' Assistant
//
//   npm i --no-save esbuild && node dnd/assistants/build.mjs
//
// The rules data (data/srd.json, SRD 5.1, CC-BY-4.0) and the adventures are baked into each page.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const director = join(root, 'director');
const require = createRequire(import.meta.url);
let esbuild;
try { esbuild = require('esbuild'); } catch (e) { esbuild = require(process.env.ESBUILD_PATH || '/tmp/esb/node_modules/esbuild'); }

const css = readFileSync(join(director, 'public', 'app.css'), 'utf8');
const FAVICON = readFileSync(join(director, 'public', 'index.html'), 'utf8').match(/<link rel="icon" href="([^"]+)">/)[1];

const PAGES = [
  { role: 'host', out: join(root, 'dm', 'index.html'), title: 'D&D 5e · Dungeon Master\'s Assistant', storeKey: 'dnd.assist.dm' },
  { role: 'player', out: join(root, 'players', 'index.html'), title: 'D&D 5e · Players\' Assistant', storeKey: 'dnd.assist.player' },
];

const alias = {
  name: 'abs-paths',
  setup(b) {
    b.onResolve({ filter: /^\/engine\// }, (a) => ({ path: join(director, a.path) }));
  },
};

for (const p of PAGES) {
  const entry = `
    import srd from ${JSON.stringify(join(root, 'data', 'srd.json'))};
    import { ADVENTURES } from ${JSON.stringify(join(director, 'data', 'adventures', 'index.js'))};
    window.DND_LOCAL = { role: ${JSON.stringify(p.role)}, srd, adventures: ADVENTURES, storeKey: ${JSON.stringify(p.storeKey)} };
    import(${JSON.stringify(join(director, 'public', 'app.js'))});
  `;
  const res = await esbuild.build({
    stdin: { contents: entry, resolveDir: director, loader: 'js' },
    bundle: true, write: false, format: 'iife', target: 'es2020', minify: true, legalComments: 'none', plugins: [alias],
  });
  const js = res.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#14110e">
<title>${p.title}</title>
<link rel="icon" href="${FAVICON}">
<!-- Includes material from the System Reference Document 5.1 by Wizards of the Coast LLC, licensed under CC-BY-4.0. -->
<style>${css}</style>
</head>
<body>
<div id="app" class="app"><header id="head"></header><main id="main"></main><nav id="nav"></nav></div>
<div id="fx" class="fx" hidden></div>
<div id="toast" class="toast" hidden></div>
<script>${js}</script>
</body>
</html>
`;
  mkdirSync(dirname(p.out), { recursive: true });
  writeFileSync(p.out, html);
  console.log(`${p.out}: ${(html.length / 1024).toFixed(0)} KB`);
}
