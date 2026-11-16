// Ready-made organisms for the higher Vectors. The four Hands of The First Carve are the Atlas builds
// at Level 1; here the same four have grown, with every number worked out by the Atlas's own formulas
// (Atlas 1 Step 7 and 4.1-4.3) so none is typed by hand:
//   MI = 12 + 4xVSC + Hull + 2 per Growth + 6 per Stage change + Adaptations + worn gear
//   ATP = 8 + 2xRTC      PP = 2 + DFF      MT = 10 + DFF      Flow = 3 + DFF + adjustments
//   Countdown boxes = VSC + ceil(Hull / 2) + 2      Oath boxes = AFF
// Growth is a Synthesis Choice each (Atlas 4.1); a Stage change also gives one free choice, +6 max MI,
// +1 Graft Slot and +2 to a Baseline or +1 Pathway rank (4.3). The Cohort's Codon is set to the Level.
import { APPARATUS } from './apparatus.js';

const w = (id, extra = {}) => ({ ...APPARATUS[id], ...extra });
export const CODON_AT = { 1: 0, 2: 40, 3: 100, 4: 180, 5: 280, 6: 400, 7: 540, 8: 700, 9: 880, 10: 1080, 11: 1300 };

export function growHand(h, g) {
  const base = { ...h.base };
  for (const [k, v] of Object.entries(g.baseAdd || {})) base[k] += v;
  const pathways = { ...h.pathways };
  for (const [k, v] of Object.entries(g.pathAdd || {})) pathways[k] = (pathways[k] || 0) + v;
  const hull = h.hull;
  const growths = g.level - 1 - (g.level >= 6 ? 0 : 0);
  const stages = (g.level >= 6 ? 1 : 0) + (g.level >= 11 ? 1 : 0) + (g.level >= 16 ? 1 : 0);
  const gearMi = h.gearMi == null ? 5 : h.gearMi; // the Lipid Weave Wrap the Level-1 Hands wear
  const mi = 12 + 4 * base.VSC + hull + 2 * growths + 6 * stages + (g.adaptMi || 0) + gearMi + (g.gearMi || 0);
  return {
    ...h,
    level: g.level,
    base,
    pathways,
    mi,
    atp: 8 + 2 * base.RTC + (g.atpAdd || 0),
    pp: 2 + base.DFF,
    mt: 10 + base.DFF,
    flow: 3 + base.DFF + (g.flowAdd || 0),
    countdown: base.VSC + Math.ceil(hull / 2) + 2,
    oath: base.AFF + (g.oathAdd || 0),
    soak: (h.soak || 0) + (g.soakAdd || 0),
    substrate: g.substrate ?? 60,
    codon: CODON_AT[g.level] || 0,
    weapons: g.weapons || h.weapons,
    kit: g.kit || h.kit,
    adaptations: g.adaptations || [],
    choices: g.choices || [],
    features: g.features || '',
    tie: g.tie || h.tie,
    firstMove: g.firstMove || h.firstMove,
    notes: g.notes || h.notes,
  };
}

// The Level-1 sheets, as the Atlas prints them (the same arithmetic as The First Carve's Hands, minus the arithmetic done by hand).
const L1 = {
  wall: { id: 'wall', hand: 'The Wall', phenotype: 'Immunan Phagocyte Guard', base: { VSC: 4, AFF: 5, DFF: 3, OSM: 3, RTC: 1 }, hull: 6, soak: 1, pathways: { 'Pressure Tolerance': 2, 'Membrane Penetration': 1, Vigour: 1, Chemoreception: 1 }, weapons: [w('chitin-flail')], kit: ['Lipid Weave Wrap (soak 1, +5 MI, already counted)'] },
  ledger: { id: 'ledger', hand: 'The Ledger', phenotype: 'Epithalian Amino Acid Smith', base: { RTC: 4, VSC: 5, DFF: 2, OSM: 3, AFF: 2 }, hull: 4, soak: 0, gearMi: 0, pathways: { Synthesis: 2, Chemoreception: 1, Vigour: 1, 'Membrane Penetration': 1 }, weapons: [w('harvest-claw', { choice: 'main', carried: true }), w('chitin-flail', { choice: 'main', carried: false })], kit: ['Harvest Claw (licence loan, 90 S owed)'] },
  rider: { id: 'rider', hand: 'The Rider', phenotype: 'Flagellan Current Rider', base: { DFF: 5, OSM: 4, RTC: 3, AFF: 3, VSC: 1 }, hull: 4, soak: 1, pathways: { 'Fluid Navigation': 2, 'Pulse Discipline': 1, Concealment: 1, 'Signal Discourse': 1 }, weapons: [w('peptide-blade')], kit: ['Lipid Weave Wrap (soak 1, +5 MI, already counted)'] },
  eyes: { id: 'eyes', hand: 'The Eyes', phenotype: 'Lysosan Pathogen Scout', base: { OSM: 5, DFF: 4, RTC: 3, VSC: 3, AFF: 1 }, hull: 3, soak: 0, gearMi: 0, pathways: { Chemoreception: 2, Concealment: 2, Synthesis: 1, 'Sequence Reading': 1 }, weapons: [w('needle-dagger', { choice: 'main', carried: true }), w('spore-pistol', { choice: 'main', carried: false })], kit: ['Substrate Foam (10 S: out of combat, 1 S restores 1 MI)', 'Amino Drip (heal 6 MI, mark 1 Stress)'] },
};
export const LEVEL1 = L1;

// ---- Level 4 (three Growths): The Ninth Shift. Choices follow the Atlas's own build progressions (5.2).
export const HANDS_L4 = [
  growHand(L1.wall, {
    level: 4, adaptMi: 6, flowAdd: -1, pathAdd: { 'Pressure Tolerance': 1 },
    adaptations: ['Denser Wall (+6 MI, -1 Flow)', 'Twin Reserve (hold 2 Reserve PP)'], choices: ['Adaptation: Denser Wall', 'Adaptation: Twin Reserve', '+1 Pathway rank: Pressure Tolerance 3'],
    tie: 'You are on the Filing Gate\'s list as the escort for a wage nobody has paid.', firstMove: '"I put myself between."',
    notes: 'Level 4. Phagocyte Guard: you are the only one who can remove an enemy from a fight without killing it; say who you want alive.',
  }),
  growHand(L1.ledger, {
    level: 4, pathAdd: { Synthesis: 1, 'Sequence Reading': 1 },
    adaptations: ['Harvest Hands (+2 dice on Harvest; Overflow 4+ gives an extra Specimen grade)', 'Chemical Literacy (+1 Sequence Reading, one Burst free)'], choices: ['Adaptation: Harvest Hands', 'Adaptation: Chemical Literacy', '+1 Pathway rank: Synthesis 3'],
    tie: 'You quoted the price of Shift Nine\'s output out loud, in front of an Auditor.', firstMove: '"Let me read the small print."',
    notes: 'Level 4. Amino Acid Smith: your gear is worth double and theirs worth nothing. Harvest pool RTC 4 + Synthesis 3 = 7 dice, 9 with the Claw.',
  }),
  growHand(L1.rider, {
    level: 4, adaptMi: 6, flowAdd: -1 + 2, pathAdd: {},
    adaptations: ['Denser Wall (+6 MI, -1 Flow)', 'Momentum Banker', 'Current Reader (currents never force saves; +2 Drifts in any Flow)'], choices: ['Adaptation: Denser Wall', 'Adaptation: Momentum Banker', 'Adaptation: Current Reader'],
    tie: 'You can carry people out of a stopped district faster than anyone, and the Row knows it.', firstMove: '"Get on."',
    notes: 'Level 4. Flagellan, so Rides It Out: each Inhibitor marks Stress three times in four. Current Reader gives +2 Drifts in any Flow (counted in Flow).',
  }),
  growHand(L1.eyes, {
    level: 4, pathAdd: { Chemoreception: 1, Concealment: 1, 'Sequence Reading': 1 },
    adaptations: ['Chemical Literacy (+1 Sequence Reading, one Burst free)'], choices: ['Adaptation: Chemical Literacy', '+1 Pathway rank: Chemoreception 3', '+1 Pathway rank: Concealment 3'],
    tie: 'Someone at the Court paid you in advance to bring back one specific document.', firstMove: '"Something in here is not paperwork."',
    notes: 'Level 4. Pathogen Scout: you smell the inherited trait on the exhibit; the Court cannot. Chemoreception 3 reads a lineage trait on sight.',
  }),
];

// ---- Level 7 (six Growths and the Stage II change at Level 6): The Long Swallow. The Atlas's own build
// progressions again (5.2), cumulative from Level 1, and the Stage II change's +1 Pathway rank taken in each.
export const HANDS_L7 = [
  growHand(L1.wall, {
    level: 7, adaptMi: 6, flowAdd: -1, baseAdd: { VSC: 1 }, pathAdd: { 'Pressure Tolerance': 1, 'Membrane Penetration': 1, Vigour: 1 }, oathAdd: 1, substrate: 80,
    adaptations: ['Denser Wall (+6 MI, -1 Flow)', 'Twin Reserve (hold 2 Reserve PP)', 'Antigen Discipline (+2 dice on saves against Genetic effects and Hijacks)', 'Oathkeeper (+1 Oath box; keeping a costly Oath gives +1 Cohesion and clears 1 Stress)'],
    choices: ['Denser Wall', 'Twin Reserve', 'Pressure Tolerance 3', 'Antigen Discipline', 'VSC 5', 'Membrane Penetration 2', 'Oathkeeper (Stage II free choice)', 'Stage II +1 Pathway: Vigour 2'],
    features: 'Stage II Phagocyte Guard feature (Atlas 3, Immunan tradition).',
    tie: 'The Warden Circles trust your register, and the Congregation trusts your oath.', firstMove: '"I put myself between."',
    notes: 'Level 7. Phagocyte Guard: say who you want alive. Antigen Discipline helps against the Sentinels\' Hijacks.',
  }),
  growHand(L1.ledger, {
    level: 7, baseAdd: { RTC: 1 }, pathAdd: { Synthesis: 2, 'Sequence Reading': 1, Chemoreception: 1, 'Membrane Penetration': 1 }, substrate: 80,
    adaptations: ['Harvest Hands (+2 dice on Harvest; Overflow 4+ gives an extra Specimen grade)', 'Chemical Literacy (+1 Sequence Reading, one Burst free)', 'Graft Mastery (+1 Graft Slot)'],
    choices: ['Harvest Hands', 'Chemical Literacy', 'Synthesis 3', 'Graft Mastery', 'RTC 5', 'Chemoreception 2', 'Membrane Penetration 2', 'Stage II +1 Pathway: Synthesis 4'],
    features: 'Stage II Amino Acid Smith feature (Atlas 3, Epithalian tradition).',
    tie: 'You priced a body inside the Host out loud, and the Host was listening.', firstMove: '"Let me read the small print."',
    notes: 'Level 7. Amino Acid Smith: your gear is worth double, theirs nothing. Harvest pool RTC 5 + Synthesis 4 = 9 dice, 11 with the Claw. Every harvest cut in this Vector moves IMMUNE: ask the Host first.',
  }),
  growHand(L1.rider, {
    level: 7, adaptMi: 6, flowAdd: -1 + 2, baseAdd: { VSC: 1 }, pathAdd: { 'Fluid Navigation': 1, 'Pulse Discipline': 1 }, substrate: 80,
    adaptations: ['Denser Wall (+6 MI, -1 Flow)', 'Momentum Banker', 'Current Reader (currents never force saves; +2 Drifts in any Flow)', 'Twin Reserve (hold 2 Reserve PP)'],
    choices: ['Denser Wall', 'Momentum Banker', 'Current Reader', 'Twin Reserve', 'VSC 2', 'Fluid Navigation 3', 'Burst: Vortex Lure (Stage II free choice)', 'Stage II +1 Pathway: Pulse Discipline 2'],
    features: 'Stage II Wake Cutter: leaving a Contact band provokes no Flank Breach; Momentum needs only 2 Drifts and grants +1 PP. Flagellan, so Rides It Out.',
    tie: 'The ferry pilots know your name, and the Churn does not slow you.', firstMove: '"Get on."',
    notes: 'Level 7. Flagellan: each Inhibitor marks Stress three times in four. The Churn flows with you: moving deeper is free and grants Momentum.',
  }),
  growHand(L1.eyes, {
    level: 7, baseAdd: { VSC: 1 }, pathAdd: { Chemoreception: 2, Concealment: 1, 'Sequence Reading': 2 }, oathAdd: 1, substrate: 80,
    adaptations: ['Chemical Literacy (+1 Sequence Reading, one Burst free)', 'Antigen Discipline (+2 dice on saves against Genetic effects and Hijacks)', 'Oathkeeper (+1 Oath box; keeping a costly Oath gives +1 Cohesion and clears 1 Stress)'],
    choices: ['Chemical Literacy', 'Chemoreception 3', 'Concealment 3', 'Antigen Discipline', 'VSC 4', 'Chemoreception 4', 'Oathkeeper (Stage II free choice)', 'Stage II +1 Pathway: Sequence Reading 3'],
    features: 'Stage II Latent Period (Atlas 3, Lysosan tradition).',
    tie: 'You can smell what the Nodule answers to, and you have not told anyone.', firstMove: '"Something in here is not tissue."',
    notes: 'Level 7. Pathogen Scout: Chemoreception 4 reads the whole interior; Concealment 3 is the Tolerance contest\'s best friend.',
  }),
];
