// Creature blocks that belong to one Vector rather than to the Lytic Bestiary. Numbers are the ones
// each Vector's own "blocks" chapter prints; the Engine merges them into the Bestiary at start-up.
// Same shape as data/bestiary.json (see tools/build-bestiary.mjs).
const block = (b) => ({
  bracedSoak: 0, bracedMt: 0, freqMod: 0, segments: null, flow: null, special: [], tactics: '', traits: '', weakness: '', harvest: '',
  ...b,
  statLine: b.statLine || `${b.cls} · T${b.tier} · MT ${b.mt} · MI ${b.mi} · soak ${b.soak} · BD ${b.bd} ${b.type} · pool ${b.pool}d · PP ${b.pp}${b.segments ? ` · Segments ${b.segments}` : ''}${b.flow ? ` · Flow ${b.flow}` : ''}`,
});

export const NINTH_SHIFT_BLOCKS = {
  'print-crew-construct': block({
    id: 'print-crew-construct', name: 'Print-Crew Construct', order: 'Constructs (The Ninth Shift)', cls: 'Standard', tier: 2, size: 'Mesoscopic',
    mt: 13, mi: 24, soak: 1, bd: 3, type: 'Kinetic', pool: 5, pp: 2, flow: 4,
    traits: 'Specification-Bound (they act on a specification; they cannot initiate against valid chemistry or valid paperwork, and they stop mid-Special if a document contradicts the specification: Synthesis or SEMANTIC AT 12) · Two-Fold Pricing (the Belt buys constructs and parts at 2x; the Row buys them at cost and calls it theft) · Not Workers (equipment to the Hegemony; on the wage book to the Row)',
    special: ['Special — Assist (2 PP): one adjacent organism\'s Strike or Burst gains +2 dice (a fold held in shape). It cannot do this for itself, finds this unfair, and says so mildly every Cycle.'],
    weakness: 'Contradictory specification freezes them (hand one a valid, contradictory specification and both freeze; Synthesis or SEMANTIC AT 12, one Box of the Form as the document). Dry Zones cost them 1 PP per Cycle. A Quiet Apron makes them read you as in-frame. Killing one is legal and costs you the Row.',
    harvest: 'C4 / G1 · Codon 7 · BSP 2 (parts are worth 2x in the Belt)',
    tactics: 'They do not fight; they complete. A fight with constructs is a fight with a deadline wearing brass.',
  }),
  'labour-construct': block({
    id: 'labour-construct', name: 'Labour Construct', order: 'Constructs (The Ninth Shift)', cls: 'Swarmling', tier: 2, size: 'Mesoscopic',
    mt: 13, mi: 14, soak: 0, bd: 2, type: 'Kinetic', pool: 4, pp: 2, segments: 8,
    traits: 'Specification-Bound (as the Print-Crew Construct) · Two-Fold Pricing · Not Workers',
    special: ['Special — Carry (free): a Labour Construct moves an organism one band, 0 damage, no contest. It is not an attack and not a defence: Hush\'s crew evacuates people.'],
    weakness: 'Contradictory specification freezes them; Dry Zones cost 1 PP per Cycle.',
    harvest: 'C4 / G1 · Codon 3.5 · BSP 1 (parts are worth 2x in the Belt)',
    tactics: 'They do not fight; they complete. Hush\'s crew moves things, including the Cohort, gently, out of the alley.',
  }),
  'acid-resistant-tank': block({
    id: 'acid-resistant-tank', name: 'Registered Acid-Resistant Tank', order: 'Colonists (The Ninth Shift)', cls: 'Standard', tier: 2, size: 'Macroscopic',
    mt: 14, mi: 30, soak: 2, bd: 3, type: 'Kinetic', pool: 5, pp: 3, flow: 4,
    traits: 'Registered (a licensed colonist working for the Relief crew: killing it is a Hegemony incident) · Soaks for Brack: when Brack Nine-Badges is struck in Contact, the Tank may take the hit instead (1 PP)',
    weakness: 'It is on an hourly rate and the invoice has a cap: make the job cost more than it pays.',
    harvest: 'C5 / G1 · Codon 7 · BSP 2 (and a lien if you take it)',
    tactics: 'It stands where the invoice says and does not chase.',
  }),
  'brack-nine-badges': block({
    id: 'brack-nine-badges', name: 'Brack Nine-Badges (the Relief)', order: 'Colonists (The Ninth Shift)', cls: 'Elite', tier: 2, size: 'Macroscopic',
    mt: 15, mi: 60, soak: 4, bd: 4, type: 'Osmotic', pool: 6, pp: 4, flow: 5,
    traits: 'Billable (for every object, structure or graft they damage, add its Substrate price to their invoice: their next Strike gains +1 die per 100 S billed, and the same total advances BADGE) · Invoice cap 400 S (when the running total passes it THE RELIEF stops fighting, produces the invoice and leaves) · Routs at 40% MI, because the invoice has a cap',
    special: ['Special — Push (4 PP): Osmotic throw: everything in the compartment moves 1 band, 8 Osmotic, +4 Kinetic against a wall. They do it to clear a corridor, and write down the wall\'s price.', 'Special — Charge (free): they state a register reason. It is the wrong reason. It is a charge, which means an escort, which means the Cohort chooses: run a scene, or start a Pulse War in a corridor with forty witnesses and a clerk taking notes.'],
    weakness: 'The cap. Break enough that the invoice passes 400 S and THE RELIEF stops fighting, produces the invoice, and leaves, because the assignment is now unprofitable and they are professionals. Make them expensive.',
    harvest: 'C8 / G3 / P2 / T1 · Codon 14 · BSP 4 (harvesting THE RELIEF is a Hegemony incident: a lien and a patent claim on anything you took)',
    tactics: 'They work while you fight them. They are not trying to win; they are trying to finish the assignment under budget.',
  }),
};

// The Long Swallow, Vector chapter 10. The Churn and the Nodule are abiotic hazards (text only, on the site).
export const LONG_SWALLOW_BLOCKS = {
  'gastric-sentinel': block({
    id: 'gastric-sentinel', name: 'Gastric Sentinel', order: 'Order VI: Immune Sentinels (The Long Swallow)', cls: 'Standard', tier: 3, size: 'Mesoscopic',
    mt: 15, mi: 38, soak: 3, bd: 4, type: 'Osmotic', pool: 6, pp: 3, flow: 4,
    traits: 'Self-Read (inside a Host it always knows which organisms are not Host tissue; only chemistry fools it, never appearance) · Engulf (absorbs an attack aimed at another Sentinel, then contests VSC to Sequester the attacker in gastric gel: 4 Lytic per Cycle while held) · Challenge (free: states the register reason; a Cohort that answers chemically avoids the fight entirely)',
    special: ['Special — Name the Foreign (3 PP): one target is Marked and IMMUNE advances 1. It is buying recognition, not damage.'],
    weakness: 'Will not initiate against valid chemistry. Desiccation and Cold end it (a Dry zone: no Engulf, no Osmotic push). It is loyal to its sponsor: if the Congregation withdraws sponsorship of the compartment the squad stands down and files a report.',
    harvest: 'C6 / G3 / P2 · Codon 15 · BSP 2 (the Pristine is a Tolerance fragment, the material of every Hive Mask and Antigen Hood)',
    tactics: 'Challenges first, Marks second, holds third, and never pursues into another compartment: it is a border, not a hunter.',
  }),
  'ninth-response': block({
    id: 'ninth-response', name: 'Ninth Response (the Host\'s immune authority)', order: 'Order VI: Immune Sentinels (The Long Swallow)', cls: 'Elite', tier: 3, size: 'Macroscopic',
    mt: 16, mi: 76, soak: 5, bd: 5, type: 'Voltaic', pool: 7, pp: 4,
    flow: 5,
    traits: 'Cascade Reserves (holds 4; roughly doubles the action economy of any Sentinel squad it leads) · Nine Cycles of Files (it can name every organism that has been inside, including the Cohort\'s own previous sins, in order: a social attack, not a fight) · Tolerant Until Proven (it opens every encounter by parley: an Antigen Rite, a valid token, a Mend offer, an Argument or the honest answer all end the scene; it will not strike first)',
    special: ['Special — Membrane Attack (5 PP, once per Pulse War): up to three Marked creatures within Mid are Sequestered in a protein lattice (escape AT 18, or destroy integrity 50); allied attacks gain +2 dice. Inside the Host the lattice is gastric: it heats.', 'Special — Cascade (1 PP each): an ally\'s hit on a Marked target frees a second Sentinel Strike at +1 Overflow.', 'Special — Sponsor\'s Word (free, once): it may grant the Cohort provisional self-chemistry for one movement, for exactly one of: carrying the foreign object out, healing the Weep, or promising to come back to be judged.'],
    weakness: 'No lattice if it is alone. Silence gear or a Signal Dampener denies Broadcast and Cascade. It cannot Mark what is honest: Precept 4 plus a clean Tolerance win at AT 14 strips its whole kit for a scene.',
    harvest: 'C10 / G4 / P3 / T1 · Codon 30 · BSP 4 (the T1 is a Tolerance Codon, the only known material that restores a revoked graft)',
    tactics: 'Files, challenges, Marks, Cascades, and retreats to report: a squad leader, not a monster.',
  }),
  'foreman-sulk': block({
    id: 'foreman-sulk', name: 'Foreman Sulk Nine-Yards (the Second Intake)', order: 'Colonists (The Long Swallow)', cls: 'Elite', tier: 3, size: 'Macroscopic',
    mt: 16, mi: 76, soak: 5, bd: 5, type: 'Lytic', pool: 7, pp: 4, flow: 5,
    traits: 'Type Reader (each Cycle it names one damage type, Lytic, Osmotic or Thermal, and its own Strikes become that type) · Swallow (as the Acid Tank phenotype: absorbs a ranged Lytic or Thermal effect aimed at it or an ally in Contact for 0 damage, +1 Acid charge)',
    special: ['Special — Harvest Cut (2 PP): it cuts a piece of the Host, gains a Specimen (G) and IMMUNE advances 1. Bait it into cutting, then leave with the haul.', 'Special — Contract Law (free): it may produce paperwork at any point; the Cohort\'s violence against a licensed crew advances the Colony Clock in the Wastes.'],
    weakness: 'Three Cycles of hard commitment and he routs at 40% MI and will negotiate: he wants to retire. Mucoid grafts nullify his Acid charges. Naming the crime (no Warden counter-signature for interior cuts) ends the encounter with him sitting down.',
    harvest: 'C10 / G4 / P3 / T1 · Codon 30 · BSP 4 (harvesting a Brine contractor is a Hegemony incident: a 1,200 S lien and a patent claim on anything you took)',
    tactics: 'He works while you fight him; he is trying to finish his shift, not to win.',
  }),
};
