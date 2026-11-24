// The adventures the host can start. Add a file here and list it to offer another.
import lantern from './lantern.js';
import ashenCrown from './ashen-crown.js';

// A blank adventure for the DM's own campaign: one starting place, and the story seeds do the rest.
const freeform = {
  id: 'freeform',
  name: 'Your own campaign (blank)',
  levels: 'any',
  blurb: 'One starting place and nothing else. Write your own places and people as story seeds on the Seeds tab, or run the AI Director from your own notes.',
  intro: 'The party has gathered. Where are they, and what brought them together?',
  quests: [],
  sites: [
    { id: 'start', name: 'The Crossroads Inn', region: 'Anywhere', read: 'A warm inn at a crossroads, busy with travellers.', notes: 'A blank place to begin. Ask the players what brought them here, then introduce the first hook from the DM\'s story seeds.', exits: [] },
  ],
  ending: '',
};

export const ADVENTURES = [ashenCrown, lantern, freeform];
export const DEFAULT_ADVENTURE = 'ashen-crown';
export const adventureById = (id) => ADVENTURES.find((a) => a.id === id) || ADVENTURES.find((a) => a.id === DEFAULT_ADVENTURE);
export const adventureList = () => ADVENTURES.map((a) => ({ id: a.id, name: a.name, levels: a.levels, blurb: a.blurb }));
