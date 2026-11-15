// Plain words for the setting's words. Shown to players on the Words tab and given to the
// Director, who glosses a term the first time it comes up. Keep each line short enough to say aloud.
export const GLOSSARY = [
  // the table
  ['Director', 'The one who runs the game and plays the world (the "dungeon master").'],
  ['Cohort', 'Your group. The party.'],
  ['Organism', 'Your character. Everyone here is a single cell the size of a person.'],
  ['Hand', 'A ready-made character you can pick up and play: the Wall, the Ledger, the Rider, the Eyes.'],
  ['Vector', 'One adventure.'],
  ['Site', 'One place in the adventure. A scene.'],
  // the body
  ['MI', 'Membrane Integrity. Your health. At zero your wall is breached.'],
  ['ATP', 'Your energy. Spend it on special abilities (Bursts).'],
  ['Stress', 'Strain you build up, mostly from rolling 1s. Too much makes every roll harder.'],
  ['Breach', 'Your wall has been broken open (MI at zero). You are in real trouble.'],
  ['Dormancy', 'Knocked out. You curl up and stop.'],
  ['Lysis', 'Death: the cell bursts. A Lysis Countdown is how many bad turns you have left when dying.'],
  ['Soak', 'Armour. Takes this much off every hit.'],
  // the dice
  ['Baseline', 'One of your five core scores: VSC, DFF, RTC, OSM, AFF.'],
  ['VSC', 'Viscosity. Strength and toughness.'],
  ['DFF', 'Diffusion. Speed and agility.'],
  ['RTC', 'Reactivity. Cleverness with chemistry: making, mending, working things out.'],
  ['OSM', 'Osmosis. Senses and instinct. Noticing, and not being fooled.'],
  ['AFF', 'Affinity. Presence. Talking, leading, bonding.'],
  ['Pathway', 'A skill. It adds dice to a roll when it fits what you are doing.'],
  ['AT', 'Action Threshold. The number your dice must reach. Higher is harder.'],
  ['MT', 'Membrane Threshold. How hard you are to hit.'],
  ['Overflow', 'How far you beat the number by. More Overflow buys a better result.'],
  ['Inhibitor', 'A die that rolled 1. It counts for nothing and gives you 1 Stress. (Flagellans take that Stress only three times in four.)'],
  ['Flagellan', 'One of the six lineages: the fast, restless people of the great currents. They ride out strain: a rolled 1 costs them Stress only three times in four.'],
  // fights
  ['Pulse War', 'A fight, played in turns.'],
  ['Cycle', 'One round of a fight: everyone acts once.'],
  ['PP', 'Pulse Points. What you spend to act on your turn. Moving, striking and defending all cost some.'],
  ['Strike', 'An attack.'],
  ['Band', 'How far apart two things are: Contact, Near, Mid or Far.'],
  ['Drift', 'One step of distance.'],
  ['Brace', 'Dig in. Harder to move and to hurt until your next turn.'],
  ['Condition', 'A lasting effect such as Jostled (knocked off balance) or Masked (hidden).'],
  // the world
  ['Substrate', 'Money. Written S.'],
  ['Codon', 'Experience. What your character learns and grows from.'],
  ['Specimen', 'A cut sample of something valuable. Graded C (common), G (good), P (prime), T (treasure).'],
  ['Harvest', 'Cutting something valuable out of a body or a place.'],
  ['Tally Post', 'A weighing house. A cut is worth nothing until a post has weighed and stamped it.'],
  ['Oath', 'A promise written into your body. Keeping it earns trust; breaking it scars you.'],
  ['Clock', 'A countdown everyone can see. When it fills, something big happens.'],
  ['Tonic', 'How salty the water is compared with you. The wrong kind pulls at you and makes things harder.'],
  ['Hegemony', 'The big government. Engineers, pumps, soldiers and paperwork.'],
  ['Guild', 'The licensed traders. They decide whose claim is legal.'],
  ['Ash', 'The keepers of the dead. Nothing that dies should be wasted.'],
  ['Chaperone Drone', 'A small folded-membrane official. Drones run tolls, gates and forms.'],
  ['Order II', 'The drones\' own service. Their stamp makes a thing legal.'],
  ['Lattice', 'Ancient machinery that can print living things. Nobody fully understands it.'],
].map(([word, plain]) => ({ word, plain }));

export function gloss(word) {
  const k = String(word || '').trim().toLowerCase();
  return GLOSSARY.find((g) => g.word.toLowerCase() === k) || null;
}
