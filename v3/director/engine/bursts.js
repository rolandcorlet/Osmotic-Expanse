// The 30 universal Bursts (CORE §6.4), with what each one does in words and the part the Engine
// applies by itself. A Burst is paid (ATP and PP, as printed), then rolled: RTC + the domain's
// Pathway against the target's Membrane Threshold, or against the printed number. What the Engine
// cannot place on a map (zones, walls, terrain, pushes) it hands to the Director as a note.
//
// apply: dmg     damage = Effect Value + Overflow - soak, of the domain's type
//        ignore  soak ignored: a number, or 'all'
//        plusSoak  Total Dissolution: the target's soak is added, not taken away
//        cond    conditions put on the target on a success
//        soakDown  the target's soak drops by this much until repaired
//        heal    heal Effect Value + Overflow MI (Substrate Patch)
//        temp    temporary MI on the target (Lattice Shield)
//        revive  Resynthesis Call: a Dormant organism returns at half MI
//        mend    Mend Function: end one condition
//        rally   Cascade Protocol: every ally recovers ATP = Overflow + 6 and clears Stress
//        self    what the caster pays besides ATP and PP: { stress, mi, substrate }
//        rider   what Runaway Catalysis adds that the Engine applies: { cond }

export const EV = { 1: 4, 2: 6, 3: 8, 4: 10 }; // CORE §6.1: Effect Value by Tier
export const BONDED_EXTRA = { atp: 2, stress: 1 }; // a Burst outside your Bonded Domain
export const DOMAIN = {
  PROTEAN: { type: 'Kinetic', paths: ['Protean Folding', 'Synthesis'] },
  LYTIC: { type: 'Lytic', paths: ['Catalysis'] },
  OSMOTIC: { type: 'Osmotic', paths: ['Pressure Folding', 'Fluid Navigation'] },
  THERMIC: { type: 'Thermal', paths: ['Catalysis'] },
  GALVANIC: { type: 'Voltaic', paths: ['Signal Discourse'] },
  SOMATIC: { type: 'Genetic', paths: ['Somatic Shaping', 'Synthesis'] },
};

// on: 'creature' (an enemy, against its MT), 'ally' (an organism of the Cohort, or yourself),
// 'self', 'zone' (a place: rolled against the printed number), 'allies' (the whole Cohort).
export const BURSTS = [
  // PROTEAN
  { n: 'Peptide Snare', d: 'PROTEAN', t: 1, atp: 3, pp: 2, band: 'Mid', on: 'creature', vs: 'MT',
    e: 'Sticky lattice: the target is at -2 DFF and anchored (cannot Drift) until it wins a VSC contest or sheds. Overflow extends it 1 Cycle per 4.',
    r: 'A second target in Near is caught too.', apply: {}, note: 'Anchored and -2 DFF: it cannot Drift until it wins a VSC contest.' },
  { n: 'Lattice Shield', d: 'PROTEAN', t: 1, atp: 3, pp: 2, band: 'Self/ally', on: 'ally', vs: 12,
    e: '+5 temporary MI and +2 soak against Kinetic for 2 Cycles.', r: 'It lasts until your next Reconstitution.', apply: { temp: 5 }, note: '+2 soak against Kinetic for 2 Cycles.' },
  { n: 'Bridge Fold', d: 'PROTEAN', t: 2, atp: 5, pp: 3, band: 'Zone', on: 'zone', vs: 14,
    e: 'Fold a protein bridge across a gap of up to 8 Drifts, or a wall 3 Drifts long (MI 20 + 4 x Tier). Enemies must break it or go around.', apply: {}, note: 'Place the bridge or wall in the scene.' },
  { n: 'Tensile Cage', d: 'PROTEAN', t: 3, atp: 7, pp: 3, band: 'Mid', on: 'creature', vs: 'MT',
    e: 'Encloses one target: Sequestered. Breaking free is AT 16 + the Overflow of your cast.', r: 'The cage is a hazard too: 3 Kinetic damage to anyone attacking through it.', apply: { cond: ['Sequestered'] } },
  { n: 'Cytoskeletal Fortress', d: 'PROTEAN', t: 4, atp: 10, pp: 4, band: 'Zone', on: 'zone', vs: 20,
    e: 'A living scaffold, permanent until dismantled: cover for 6 organisms, and any ally inside gains +1 PP. Alters the map.', apply: {}, note: 'Place the fortress in the scene.' },
  // LYTIC
  { n: 'Enzyme Spit', d: 'LYTIC', t: 1, atp: 2, pp: 2, band: 'Mid', on: 'creature', vs: 'MT',
    e: 'Lytic damage: Effect Value + Overflow. The target is at -1 soak until repaired.', apply: { dmg: true, soakDown: 1 } },
  { n: 'Lytic Fog', d: 'LYTIC', t: 2, atp: 5, pp: 3, band: 'Zone (3 Drifts)', on: 'zone', vs: 12,
    e: 'A cloud: 4 + Overflow / 2 Lytic damage per Cycle to anything inside; crossing costs 2 PP per Drift; Masked creatures cannot hide in it. Lasts Tier Cycles.', apply: {}, note: 'Each Cycle, deal the fog\'s damage to everything inside.' },
  { n: 'Digest Armour', d: 'LYTIC', t: 2, atp: 4, pp: 2, band: 'Mid', on: 'creature', vs: 'MT',
    e: 'No damage. The target\'s graft loses all its soak for 3 Cycles and it is Brittle.', r: 'The dissolved graft yields 5 S of Substrate to you.', apply: { cond: ['Brittle'], soakZero: true } },
  { n: 'Corrosive Catalyst', d: 'LYTIC', t: 3, atp: 7, pp: 3, band: 'Mid', on: 'creature', vs: 'MT',
    e: 'Lytic damage ignoring all soak, and the target is Brittle. Any surface hit becomes difficult terrain for good.', apply: { dmg: true, ignore: 'all', cond: ['Brittle'] } },
  { n: 'Total Dissolution', d: 'LYTIC', t: 4, atp: 10, pp: 5, band: 'Contact/Mid', on: 'creature', vs: 'MT',
    e: 'Damage = Effect Value + Overflow + the target\'s remaining soak. A non-Catastrophe target taken below 0 MI is erased: no Harvest, no Re-Synthesis.', apply: { dmg: true, plusSoak: true, erase: true } },
  // OSMOTIC
  { n: 'Pressure Slap', d: 'OSMOTIC', t: 1, atp: 2, pp: 2, band: 'Near', on: 'creature', vs: 'MT', alt: 'VSC',
    e: 'Osmotic damage; push the target 1 Drift + 1 per 4 Overflow. A target that hits a wall takes +4 Kinetic.', apply: { dmg: true }, note: 'Push it 1 Drift, +1 per 4 Overflow; +4 Kinetic if it hits a wall.' },
  { n: 'Turgid Injection', d: 'OSMOTIC', t: 1, atp: 3, pp: 2, band: 'Contact', on: 'creature', vs: 'MT',
    e: 'The target is Turgid (+5 temporary MI, -2 DFF) for 2 + Overflow / 4 Cycles, then takes 4 Osmotic damage as the water leaves.', apply: { cond: ['Turgid'] }, note: 'When Turgid ends, it takes 4 Osmotic damage.' },
  { n: 'Hypertonic Field', d: 'OSMOTIC', t: 2, atp: 5, pp: 3, band: 'Zone (4 Drifts)', on: 'zone', vs: 14,
    e: 'Inside the field: DFF pools -2, PP -1, and each organism marks 1 Stress per Cycle unless it pays 1 ATP. Lasts Tier Cycles.', apply: {}, note: 'Mark the field in the scene.' },
  { n: 'Vortex Lure', d: 'OSMOTIC', t: 3, atp: 7, pp: 3, band: 'Zone', on: 'zone', vs: 'MT',
    e: 'Everything in the zone must win Fluid Navigation or be dragged to the centre band and Jostled. The zone becomes a Current for allies.', apply: {}, note: 'Each target in the zone rolls Fluid Navigation; losers are Jostled.' },
  { n: 'Osmotic Collapse', d: 'OSMOTIC', t: 4, atp: 10, pp: 4, band: 'Mid', on: 'creature', vs: 'MT',
    e: 'Massive Osmotic damage; the membrane ruptures inward: -1 VSC and -1 DFF for good (at most -3, repairable by Mend).', apply: { dmg: true }, note: 'The target is at -1 VSC and -1 DFF for good.' },
  // THERMIC
  { n: 'Exotherm Touch', d: 'THERMIC', t: 1, atp: 2, pp: 2, band: 'Contact', on: 'creature', vs: 'MT',
    e: 'Thermal damage; the target\'s next Drift leaves a scalded wake (a hazard, 2 damage, 1 Cycle).', apply: { dmg: true } },
  { n: 'Flash Steam', d: 'THERMIC', t: 1, atp: 3, pp: 2, band: 'Zone (2 Drifts)', on: 'zone', vs: 12,
    e: 'Push everything in the zone 1 band; then the zone is turbid (ranged attacks -2) for 2 Cycles.', apply: {}, note: 'Push everything in the zone 1 band.' },
  { n: 'Thermal Lance', d: 'THERMIC', t: 2, atp: 5, pp: 3, band: 'Far', on: 'creature', vs: 'MT',
    e: 'Thermal damage at Far, ignoring 2 soak. The target\'s band becomes a hazard for 1 Cycle.', apply: { dmg: true, ignore: 2 } },
  { n: 'Cold Shock', d: 'THERMIC', t: 3, atp: 7, pp: 3, band: 'Zone', on: 'zone', vs: 16,
    e: 'Everything in the zone makes a VSC save or is Jostled and loses its Reserve; movement there costs +1 PP for 3 Cycles.', apply: {}, note: 'Each target in the zone saves on VSC; losers are Jostled.' },
  { n: 'Supernova Vent', d: 'THERMIC', t: 4, atp: 12, pp: 4, band: 'Self (zone 5 Drifts)', on: 'creature', vs: 'MT',
    e: 'Thermal damage to everything in the zone = Effect Value + Overflow - your own soak. You mark 3 Stress and pay 4 MI.', apply: { dmg: true, ownSoak: true, self: { stress: 3, mi: 4 } }, note: 'The same damage hits everything else in the zone.' },
  // GALVANIC
  { n: 'Signal Knife', d: 'GALVANIC', t: 1, atp: 2, pp: 2, band: 'Mid', on: 'creature', vs: 'MT',
    e: 'Voltaic damage, and it interrupts a Sustained Reaction on the target.', r: 'The target is Marked.', apply: { dmg: true, rider: { cond: ['Marked'] } } },
  { n: 'Lock Sequence', d: 'GALVANIC', t: 1, atp: 3, pp: 2, band: 'Mid', on: 'creature', vs: 'MT',
    e: 'The target is Locked (cannot begin Bursts). Each Cycle it may win an OSM save at your Overflow + 10 to end it.', apply: { cond: ['Locked'] } },
  { n: 'Chain Cascade', d: 'GALVANIC', t: 2, atp: 5, pp: 3, band: 'Mid', on: 'creature', vs: 'MT',
    e: 'Voltaic damage; then one ally in Near may make a free Strike at +1 Overflow against the same target.', apply: { dmg: true }, note: 'One ally in Near may Strike it now for free, at +1 Overflow.' },
  { n: 'False Scent', d: 'GALVANIC', t: 3, atp: 6, pp: 2, band: 'Zone', on: 'zone', vs: 16,
    e: 'Hostiles in the zone must win OSM or waste a Cycle on phantom positions; their attacks on the phantom fail.', r: 'They attack each other at -2.', apply: {}, note: 'Each hostile in the zone saves on OSM; losers waste their Cycle.' },
  { n: 'Cascade Protocol', d: 'GALVANIC', t: 4, atp: 10, pp: 4, band: 'All allies', on: 'allies', vs: 20,
    e: 'Every ally within Far recovers ATP = Overflow + 6, clears Stress to 0, and may take one free Burst at -1 PP this Cycle. You mark 2 Stress.', apply: { rally: true, self: { stress: 2 } } },
  // SOMATIC
  { n: 'Substrate Patch', d: 'SOMATIC', t: 1, atp: 3, pp: 2, band: 'Contact', on: 'ally', vs: 10,
    e: 'Heal Effect Value + Overflow MI and close one Lysis Countdown box. Costs 1 Substrate.', apply: { heal: true, closeBox: true, self: { substrate: 1 } } },
  { n: 'Vigour Surge', d: 'SOMATIC', t: 1, atp: 3, pp: 2, band: 'Self/ally', on: 'ally', vs: 10,
    e: '+1 PP and +3 Flow for 3 Cycles, with no Stress from the surge.', apply: {}, note: '+1 PP and +3 Flow for 3 Cycles.' },
  { n: 'Knock-on Mitosis', d: 'SOMATIC', t: 2, atp: 5, pp: 2, band: 'Contact', on: 'ally', vs: 12,
    e: 'Heal 4 + Overflow / 3 at the start of each of the next 3 Cycles.', r: 'A second adjacent ally heals half as much.', apply: { regen: true } },
  { n: 'Mend Function', d: 'SOMATIC', t: 3, atp: 7, pp: 2, band: 'Contact', on: 'ally', vs: 16,
    e: 'End one condition, one Uncommon-or-lower scar, or one Leaking or pore effect. Costs a Common Tissue Specimen.', apply: { mend: true } },
  { n: 'Resynthesis Call', d: 'SOMATIC', t: 4, atp: 12, pp: 3, band: 'Contact', on: 'ally', vs: 20,
    e: 'A Dormant organism that has not Total-Lysed returns at half its MI, Stress cleared and one Countdown box closed. Costs 1 Pristine Sequence Specimen.', apply: { revive: true } },
];

export const burstByName = (name) => BURSTS.find((b) => b.n.toLowerCase() === String(name || '').trim().toLowerCase()) || null;
