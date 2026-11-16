// The Bestiary the table plays with: the Lytic Bestiary plus each Vector's own blocks.
import { readFileSync } from 'node:fs';
import { NINTH_SHIFT_BLOCKS, LONG_SWALLOW_BLOCKS } from './vector-blocks.js';

export function loadBestiary() {
  const lytic = JSON.parse(readFileSync(new URL('./bestiary.json', import.meta.url), 'utf8'));
  return { ...lytic, ...NINTH_SHIFT_BLOCKS, ...LONG_SWALLOW_BLOCKS };
}
