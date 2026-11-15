// Copies the creature pictures out of the Players Assistant into public/creatures/, one small
// .webp per Bestiary block, so the player and table screens can show what is in the scene.
// Run again whenever new art is added to the Players Assistant: node tools/build-creature-art.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const src = readFileSync(new URL('../../../players/index.html', import.meta.url), 'utf8');
const out = new URL('../public/creatures/', import.meta.url);
mkdirSync(out, { recursive: true });
let n = 0;
for (const m of src.matchAll(/"((?:m-|order-)[A-Za-z0-9-]+)":\s*"data:image\/webp;base64,([A-Za-z0-9+/=]+)"/g)) {
  writeFileSync(new URL(`${m[1].replace(/^m-/, '')}.webp`, out), Buffer.from(m[2], 'base64'));
  n += 1;
}
console.log(`${n} pictures written to public/creatures/`);
