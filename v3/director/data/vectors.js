// Every Vector the table can play. To add one: write its data file in the shape of
// first-carve.js (an exported scenario and publicScenario), then add a line here.

import * as firstCarve from './first-carve.js';
import * as ninthShift from './ninth-shift.js';
import * as longSwallow from './long-swallow.js';


export const VECTORS = [
  {
    id: 'first-carve',
    title: 'The First Carve',
    blurb: 'A dead whale in the Toll Reach, five sites from the wound to the Gut Stone. The teaching Vector: two to six new organisms, Level 1.',
    scenario: firstCarve.scenario,
    publicScenario: firstCarve.publicScenario,
  },
  {
    id: 'ninth-shift',
    title: 'The Ninth Shift',
    blurb: 'A comedy about a strike that officially is not one: a queue, a form, a machine nobody told to stop, a court that has written its decision, and something nearly finished in an alley. Four organisms, Levels 4 to 6.',
    scenario: ninthShift.scenario,
    publicScenario: ninthShift.publicScenario,
  },
  {
    id: 'long-swallow',
    title: 'The Long Swallow',
    blurb: 'A living person so vast there is a town in its wound, and six days before it is legally dissolved. It asked for you. Four organisms, Levels 7 to 11.',
    scenario: longSwallow.scenario,
    publicScenario: longSwallow.publicScenario,
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
