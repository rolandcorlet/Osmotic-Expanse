// Every Vector the table can play. To add one: write its data file in the shape of
// first-carve.js (an exported scenario and publicScenario), then add a line here.

import * as firstCarve from './first-carve.js';

export const VECTORS = [
  {
    id: 'first-carve',
    title: 'The First Carve',
    blurb: 'A dead whale in the Toll Reach, five sites from the wound to the Gut Stone. The teaching Vector: two to six new organisms, Level 1.',
    scenario: firstCarve.scenario,
    publicScenario: firstCarve.publicScenario,
  },
];

export const DEFAULT_VECTOR = 'first-carve';

export function vectorById(id) {
  return VECTORS.find((v) => v.id === id) || null;
}

// What the host's picker needs: no Director notes, nothing a player should not see.
export function vectorList() {
  return VECTORS.map((v) => ({ id: v.id, title: v.title, blurb: v.blurb, sites: v.scenario.sites.length, hands: v.scenario.hands.length }));
}
