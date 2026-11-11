// Apparatus, from the Core Rulebook §9.3. bd is the Damage ladder for tiers 1 to 5.
const row = (id, name, cls, band, bd, bonus, type, props, cost) => ({ id, name, cls, band, bd, bonus, type, props, cost });

export const APPARATUS = {
  'chitin-flail': row('chitin-flail', 'Chitin Flail', 'Weight', 'Contact', [4, 6, 8, 10, 12], 1, 'Kinetic', ['Heavy', 'Braced'], 15),
  'osmotic-maul': row('osmotic-maul', 'Osmotic Maul', 'Weight', 'Contact', [4, 6, 8, 10, 12], 0, 'Osmotic', ['Heavy', 'Pushing'], 25),
  'pressure-ram': row('pressure-ram', 'Pressure Ram', 'Weight', 'Contact', [5, 7, 9, 11, 13], -1, 'Kinetic', ['Heavy', 'Two-handed', 'Braced'], 60),
  'peptide-blade': row('peptide-blade', 'Peptide Blade', 'Lash', 'Contact', [3, 5, 7, 9, 11], 1, 'Lytic', ['Fluid', 'Silent'], 20),
  'cilia-saw': row('cilia-saw', 'Cilia Saw', 'Lash', 'Contact', [3, 5, 7, 9, 11], 1, 'Kinetic', ['Fluid', 'Serrated'], 35),
  'flagellar-whip': row('flagellar-whip', 'Flagellar Whip', 'Lash', 'Mid', [2, 4, 6, 8, 10], 0, 'Kinetic', ['Reach', 'Sweeping'], 45),
  'needle-dagger': row('needle-dagger', 'Needle Dagger', 'Lash', 'Contact', [2, 4, 6, 8, 10], 2, 'any', ['Finesse', 'Lodged', 'Silent'], 40),
  'spore-pistol': row('spore-pistol', 'Spore Pistol', 'Projector', 'Mid', [2, 4, 6, 8, 10], 1, 'Lytic', ['Reload'], 30),
  'barbed-launcher': row('barbed-launcher', 'Barbed Launcher', 'Projector', 'Far', [3, 5, 7, 9, 11], 0, 'Kinetic', ['Lodged', 'Braced'], 55),
  'harvest-claw': row('harvest-claw', 'Harvest Claw', 'Lash', 'Contact', [2, 4, 6, 8, 10], 0, 'Kinetic', ['Harvesting'], 90),
  'grapple-tendril': row('grapple-tendril', 'Grapple Tendril', 'Lash', 'Near', [1, 2, 3, 4, 5], 1, 'Kinetic', ['Pull', 'Anchor'], 110),
};

export const PROPERTY_RULES = {
  Heavy: 'Costs 1 extra PP to Strike; needs VSC 3 or more.',
  Braced: '+1 die if you did not Drift this Cycle; no Momentum.',
  Fluid: 'Usable while grappled, Sequestered or pinned.',
  Silent: 'Does not break Masked; no Flank Breach from using it.',
  Serrated: 'Overflow 2 or more also inflicts Brittle (once per target per fight).',
  Lodged: 'On a hit it stays in: target -1 DFF until removed; removing it deals 4 damage.',
  Finesse: 'A light, precise Apparatus.',
  Reload: 'One Vial of spores per 3 shots.',
  Reach: 'Its band shifts one step outward; -1 die at that band.',
  Harvesting: 'Harvest checks +2 dice; one free Harvest per Pulse War.',
  Pushing: 'Push +1 band.',
  Sweeping: 'Hits all in Contact on a Runaway.',
  Pull: 'Drag the target 1 band.',
  Anchor: 'You cannot be pushed.',
  'Two-handed': 'Needs VSC 4 or more.',
};
