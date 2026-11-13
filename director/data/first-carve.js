// The First Carve as data. Numbers and facts are taken from the Vector; section
// cites are to "The Osmotic Expanse - THE FIRST CARVE". Each site has two halves:
//   where / zones / exits  -> shown to everyone on arrival (what a body can see)
//   host                   -> Director-only notes (never sent to player screens)
import { APPARATUS } from './apparatus.js';

const w = (id, extra = {}) => ({ ...APPARATUS[id], ...extra });

// §5.2 The Four Hands: Level-1 organisms with the arithmetic already done.
const hands = [
  {
    id: 'wall', hand: 'The Wall', phenotype: 'Immunan Phagocyte Guard', level: 1,
    base: { VSC: 4, AFF: 5, DFF: 3, OSM: 3, RTC: 1 }, hull: 6,
    mi: 39, atp: 10, pp: 5, mt: 13, flow: 6, countdown: 9, soak: 1, oath: 5, substrate: 5,
    pathways: { 'Pressure Tolerance': 2, 'Membrane Penetration': 1, Vigour: 1, Chemoreception: 1 },
    weapons: [w('chitin-flail')],
    kit: ['Lipid Weave Wrap (soak 1, +5 MI, already counted)'],
    tie: 'Your name is on the toll manifest as the escort for the whale\'s last cargo.',
    firstMove: '"I put myself between."',
    notes: 'MI is 34, or 39 with the Wrap. Purse: 40 S less the Flail (15) and the Wrap (20).',
  },
  {
    id: 'ledger', hand: 'The Ledger', phenotype: 'Epithalian Amino Acid Smith', level: 1,
    base: { RTC: 4, VSC: 5, DFF: 2, OSM: 3, AFF: 2 }, hull: 4,
    mi: 36, atp: 16, pp: 4, mt: 12, flow: 5, countdown: 9, soak: 0, oath: null, substrate: 40,
    pathways: { Synthesis: 2, Chemoreception: 1, Vigour: 1, 'Membrane Penetration': 1 },
    weapons: [w('harvest-claw', { choice: 'main', carried: true }), w('chitin-flail', { choice: 'main', carried: false })],
    kit: ['Harvest Claw on a licence loan (90 S owed), or the Chitin Flail and 2 Vials'],
    tie: 'You quoted the price of this carcass out loud, in front of a Guild claim-runner.',
    firstMove: '"Let me do it properly."',
    notes: 'Harvest pool: RTC 4 + Synthesis 2 = 6 dice, or 8 with the Harvest Claw. Oath boxes are not printed for this Hand.',
  },
  {
    id: 'rider', hand: 'The Rider', phenotype: 'Flagellan Current Rider', level: 1,
    base: { DFF: 5, OSM: 4, RTC: 3, AFF: 3, VSC: 1 }, hull: 4,
    mi: 25, atp: 14, pp: 7, mt: 15, flow: 8, countdown: 5, soak: 1, oath: null, substrate: 0,
    pathways: { 'Fluid Navigation': 2, 'Pulse Discipline': 1, Concealment: 1, 'Signal Discourse': 1 },
    weapons: [w('peptide-blade')],
    kit: ['Lipid Weave Wrap (soak 1, +5 MI, already counted)'],
    tie: 'You were riding the whale when its gut locked. You are the only witness.',
    firstMove: '"Get on."',
    notes: 'MI is 20, or 25 with the Wrap. Purse: 40 S less the Blade (20) and the Wrap (20). Oath boxes are not printed for this Hand.',
  },
  {
    id: 'eyes', hand: 'The Eyes', phenotype: 'Lysosan Pathogen Scout', level: 1,
    base: { OSM: 5, DFF: 4, RTC: 3, VSC: 3, AFF: 1 }, hull: 3,
    mi: 27, atp: 14, pp: 6, mt: 14, flow: 7, countdown: 7, soak: 0, oath: null, substrate: 0,
    pathways: { Chemoreception: 2, Concealment: 2, Synthesis: 1, 'Sequence Reading': 1 },
    weapons: [w('needle-dagger', { choice: 'main', carried: true }), w('spore-pistol', { choice: 'main', carried: false })],
    kit: ['Substrate Foam (10 S: out of combat, 1 S restores 1 MI)', 'Amino Drip (heal 6 MI, mark 1 Stress)'],
    tie: 'Someone in Tallow Ring paid you in advance to bring back one specific thing.',
    firstMove: '"Something in there is not whale."',
    notes: 'Needle Dagger (40 S, the whole purse) or Spore Pistol (30 S). Oath boxes are not printed for this Hand.',
  },
];

// §3 The three Clocks. Shown to the players: the schedule is not a secret.
const clocks = [
  {
    id: 'CARCASS', name: 'CARCASS', segments: 6, says: 'The whale is digesting itself. The value clock.',
    stages: ['fresh', 'weeping', 'bloated', 'sloughing', 'sour', 'gaslock', 'the whale goes over'],
  },
  { id: 'TOLL', name: 'TOLL', segments: 5, says: 'The Render Charge is on a schedule. The law clock.', stages: [] },
  {
    id: 'HUNGER', name: 'HUNGER', segments: 4, says: 'Everything in the Reach can smell a wound. The danger clock.',
    stages: ['only tells', 'signs at every panel', 'Gnaw Swarms at the wounds', 'Detritus Feeders render the dead', 'the Render Cascade'],
  },
];

// §8 The whale, and the five sites.
const whale = 'The carcass lies across the channel, head downstream, mouth open into the Reach. A wound 40 Drifts wide has been cut in the flank near the head. Everything you need is inward and upstream: wound, soft field, stomach, pyloric channels, then the stone in the far curve of the gut. The way back out is the same way.';

const sites = [
  {
    id: 'toll-vent', n: 1, name: 'The Toll-Vent', short: 'the wound mouth',
    inWhale: 'Outside the whale, at the wound in its flank near the head.',
    where: 'A torn flank panel the size of a town square, with the channel\'s current running through it. Folded out of the whale\'s own gristle is a Chaperone Drone customs post: three Drifts of folded membrane, a chitin gate, a queue of drones, and a toll board with prices in Specimens.',
    front: 'The wound lip, then the drones\' gate. Beyond the gate a cut-lane runs down into the carcass.',
    tonic: 'isotonic', visc: 1, flow: 2,
    zones: [
      { name: 'The wound lip', band: 'Near', note: 'the torn edge you must cross' },
      { name: 'The drone customs fold', band: 'Contact', note: 'once you step up to the gate' },
      { name: 'Cut-markers', band: '', note: 'claim-line markers along the flank' },
    ],
    exits: ['Inward: the cut-lane down to the Soft Field', 'Back out to the Toll Reach and its queue of skiffs'],
    encounter: [{ blockId: 'gnaw-swarm', count: 2 }, { blockId: 'fold-sentinel', count: 1 }],
    // Paid by the Engine when one of these is harvested, never by the Director's award.
    harvestPays: { 'gnaw-swarm': { codon: 1.5 }, 'fold-sentinel': { codon: 3 } },
    host: {
      cite: 'Vector §8.1',
      play: 'The wound is legal only with a Guild stamp, a drone licence, or a toll paid: 2 C Specimens per body, 15 S per body, or a promise (an Oath box, witnessed by an Order II fold). Refusing and fighting is a decision: it costs TOLL a segment.',
      danger: '2 Gnaw Swarms + 1 Fold Sentinel = 6 BSP. The Fold Sentinel does not start the fight: it demands the Cohort show its claim. If the Cohort has paid or sworn, it stands aside even after a strike.',
      wants: 'Drink, not violence. A Gnaw Swarm offered water leaves in one sentence.',
      weakness: 'Area effects. A Lytic Fog, a shove into the current, or the pump wash removes Segments by the handful.',
      hazard: 'Gas pocket under the lip (Tier 1). Discovery: Sense, Chemoreception AT 12 ("the floor is humming"). Trigger: a Kinetic hit, a Strike, Momentum. Effect: 6 Kinetic, Jostled, 1 band shift to all in the chamber. Counter: vent it slowly (Synthesise, 2 PP), or Brace and ride it for 2 free Drifts.',
      pays: 'The toll chit (TOLL -1), a legal route in, the Specimens printed in the Bestiary for each harvested swarm (C3 / G1 with the harvest tool; 1.5 Codon each), and 15 Codon for getting inside without making an enemy of Order II.',
      tells: 'Bare patches of old biomass on the wound lip. The drone fold faces the wrong way: its gate points inward. (First clue to the brood.)',
      lesson: 'Lesson 1, the roll: the drone\'s own roll at the lip, then the crossing at AT 12.',
    },
  },
  {
    id: 'soft-field', n: 2, name: 'The Soft Field', short: 'the licensed cut-ground, and the Tally Post',
    harvest: { tier: 1, what: 'the hanging lipid panels' }, post: true,
    // The priced choice (THE FIRST CARVE 8.2): a d12, rolled once when the Cohort reaches the post.
    pricedChoice: [
      { lo: 1, hi: 2, offer: 'stamp your cut under the first crew\'s void claim', price: 'the Ash will call it a grave-robbing; the Guild will not notice for two Beats' },
      { lo: 3, hi: 4, offer: 'stamp it under Tallow Ring\'s second sale', price: 'free, and the first buyer\'s crew will come to collect' },
      { lo: 5, hi: 6, offer: 'a Guild tally-stamp', price: 'the Guild takes a third of the haul, and TOLL -1', takeOneIn: 3 },
      { lo: 7, hi: 8, offer: 'an Ash Unwasted seal over the panel you are cutting', price: 'the cut is slower (CARCASS -1 for that panel only) and worth one grade more' },
      { lo: 9, hi: 9, offer: 'drone licence: Order II stamps it', price: 'TOLL -1, and the drones now consider you registered, including for what the brood needs' },
      { lo: 10, hi: 10, offer: 'no stamp: the clerk is a client of Neth, and refuses', price: 'the cut is worth nothing legally; a contest or a Bribery in samples (10 to 30 S) fixes it' },
      { lo: 11, hi: 11, offer: 'the clerk will trade: a stamp now, a favour at the Gut Stone later', price: 'you owe; the favour arrives at the Gut Stone' },
      { lo: 12, hi: 12, offer: 'the post is empty, and the scale is still warm', price: 'someone was here minutes ago; HUNGER +1, and a Reveal: the pump shaft is open' },
    ],
    inWhale: 'Inside the flank, just in from the wound.',
    where: 'The good part of the whale: hanging sheets of lipid and connective tissue, cut lanes marked with Guild claim-line pheromone, and tally-sleds on a cable line. At the centre stands the Tally Post, where a cut is weighed, graded and stamped. Tools are stacked, unblooded. The sleds are empty.',
    front: 'The hanging panels and the cut lanes between them, with the Tally Post in the middle of the field.',
    tonic: 'isotonic', visc: 1, flow: 1,
    zones: [
      { name: 'Hanging panels', band: 'Mid', note: 'sheets of lipid; you can cross on them' },
      { name: 'Cut lanes', band: '', note: 'marked with Guild claim-line pheromone' },
      { name: 'The tally-sled line', band: '', note: 'a cable line back to the surface' },
      { name: 'The Tally Post', band: '', note: 'centre of the field' },
    ],
    exits: ['Onward: the cut-lane to the stomach (the Render Hall)', 'Out: the sled-cable back to the surface', 'Back: up the cut-lane to the Toll-Vent'],
    encounter: [{ blockId: 'glaze-medusa', count: 2 }, { blockId: 'hijack-mite', count: 2 }],
    // Paid by the Engine when one of these is harvested, never by the Director's award.
    harvestPays: { 'glaze-medusa': { codon: 3 }, 'hijack-mite': { codon: 1.5 } },
    // 8.2, priced in the Weakness line below: "Cut a panel loose (a Kinetic hit, 4+ Overflow) and the
    // lane goes opaque: every contest in the room is -2 dice for everyone." It is a property of the
    // place rather than of each body, so the Engine keeps it on the scene and every pool here reads it.
    panelCloud: { overflow: 4, dice: -2, why: 'the lane is opaque with dissolved lipid' },
    host: {
      cite: 'Vector §8.2, §7.2',
      play: 'Nothing carried out of this Vector is worth anything unless it passed a post. Say it out loud here. The post\'s ledger has the first crew\'s last entry: CLAIM VOID - SEE NETH. When they reach the post, roll the d12 priced choice (§8.2).',
      danger: '2 Glaze Medusa + 2 Hijack Mites = 6 BSP. Add 2 more Mites (8 BSP) once the Cohort has got Lesson 4. The Medusa are nesting in a hanging panel: a Cohort that backs off and takes the far panels gets the same harvest with less blood.',
      wants: 'The Medusa are defending a nest.',
      weakness: 'The Medusa\'s glaze needs line of sight; turbid fluid kills it. Cut a panel loose (a Kinetic hit, 4+ Overflow) and the lane goes opaque: every contest in the room is -2 dice for everyone.',
      hazard: 'Slough patches (Tier 1), visible after CARCASS 1. Standing in it: soak 1 for you, -1 Drift per Move; at CARCASS 3+, 1 Lytic damage per Cycle. Counter: cross on the hanging panels, or salt it.',
      pays: 'The harvest proper: loose tissue is Tier 1, so the check is AT 12 and the grade depends on CARCASS (§7.2). A stamped cut is 40 to 120 S, only if the claim stands. The first crew\'s salt cache (60 S of salt = a CARCASS rewind). 20 Codon for getting a cut stamped rather than merely taken.',
      tells: 'The sweet current coming up from the pyloric channels; a drone escort moving into the whale, not out; a tally-sled loaded with nothing but tools.',
      lesson: 'Lesson 3, the harvest. This is the Ledger\'s room.',
    },
  },
  {
    id: 'render-hall', n: 3, name: 'The Render Hall', short: 'the stomach, still running',
    inWhale: 'Deep inside: the whale\'s main stomach.',
    where: 'The stomach is still warm, and it is churning. The fluid here is hypertonic: it pulls at you. A Hegemony pump barge and its crew of nine are running a hose, draining fluid. Dry ribs run along the stomach wall. At the bottom is the still, hot and quiet.',
    front: 'The churn across the middle of the chamber, with the pump barge near you and the still below.',
    tonic: 'hypertonic (-1 to -2 dice unless prepared)', visc: 2, flow: 3,
    zones: [
      { name: 'The pump', band: 'Near', note: 'the Hegemony barge and its hose; loud' },
      { name: 'The churn', band: 'Mid', note: 'every Drift is a contest if you are in it' },
      { name: 'The dry ribs', band: 'Mid', note: 'walkable along the wall, Mid band the whole way' },
      { name: 'The still', band: 'Contact', note: 'at the bottom; hot' },
    ],
    exits: ['Onward: the pyloric channels (warm, sweet, going up)', 'Out: the pump shaft', 'Back: the cut-lane to the Soft Field'],
    encounter: [{ blockId: 'cytoplasmic-bleeder', count: 3 }, { blockId: 'detritus-feeder', count: 2 }],
    // Paid by the Engine when one of these is harvested, never by the Director's award.
    harvestPays: { 'cytoplasmic-bleeder': { codon: 3 }, 'detritus-feeder': { codon: 1.5 } },
    host: {
      cite: 'Vector §8.3',
      play: 'The Pulse War room: terrain is the main character. The pump is the best object in the Vector: seizing or opening it drains a chamber (CARCASS -1, the Enzyme Field dies) but it is loud (HUNGER +1, and TOLL +1 if the Guild sees it).',
      danger: '3 Cytoplasmic Bleeders + 2 Detritus Feeders = 8 BSP, plus the Enzyme Field and the churn. The Bleeders attach (break with a contested VSC, 1 PP) and drink. The Feeders Render any corpse in the water.',
      wants: 'The Bleeders want the warm fluid and the plasma in it. The Feeders want corpses.',
      weakness: 'Drain the chamber and both Orders lose their footing. A Braced Cohort on the dry ribs turns the fight into a shooting gallery.',
      hazard: 'Enzyme Field across the mid floor (Tier 2). Discovery: Sense AT 14, the haze has a sheen. Trigger: entering Mid band, or a Strike inside it. Effect: 8 Lytic, -1 soak until repaired. Counter: drain the chamber, or walk the dry ribs. The churn drags 1 band per Cycle unless you win Fluid Navigation.',
      pays: 'The first hard fact (the Gut Stone\'s location, visible from the still). The first crew\'s four bodies, worth a read, not a haul. 20 Codon for stabilising a stranger and getting the fact in the same room.',
      tells: 'Everything in the stomach is stone-clean except one plug, which is warm. The sweet current starts here.',
      lesson: 'Lesson 4, the Pulse War. Rehearsal: Pump-Hand Osk (MT 12, MI 24) is taken by the churn on the Cycle after the Cohort does something loud: a Breach, Dormancy, a Countdown box, then the stabilisation (RTC + Synthesis against AT 12 + Level).',
    },
  },
  {
    id: 'brood', n: 4, name: 'The Brood of the Not-Whale', short: 'the cost room',
    inWhale: 'Past the stomach, where the pyloric channels open out.',
    where: 'A chamber that should not exist in a dead animal: warm, lit and sweet. Three hundred or more blind juveniles swim here, whale-shaped but wrong, with six fins where a Drifter has four. They cluster round a warm shard of slag. The room feels like being asked questions. At the chamber\'s gate a Chaperone Drone elder has set up a customs post, with forms and toll receipts.',
    front: 'The customs post at the gate, then the brood-channels and the nursery beyond.',
    tonic: 'isotonic, warm', visc: 1, flow: 1,
    zones: [
      { name: 'The customs post', band: '', note: 'at the gate' },
      { name: 'Brood-channels', band: 'Mid', note: 'a sweet current' },
      { name: 'The fold-nursery', band: 'Contact', note: 'around the warm shard' },
    ],
    exits: ['Onward: the pyloric duct to the Gut Stone', 'Back: out the way you came'],
    encounter: [{ blockId: 'receptor-lurker', count: 2 }, { blockId: 'drifter-shoal', count: 3 }],
    // Paid by the Engine when one of these is harvested, never by the Director's award.
    harvestPays: { 'receptor-lurker': { codon: 3 }, 'drifter-shoal': { codon: 1.5 } },
    // 8.4 prices this room's cut the other way round from 3.3's cleanup row: "if the brood is
    // registered, a Name. If harvested instead: 400 to 900 S, HUNGER +2, TOLL +1. Both are legitimate
    // play: charge for both." The page prices the *act*, so `oncePerScene`: the first body cut in the
    // brood pays both Clocks and the rest of the shoal does not stack them. A site's row replaces the
    // Vector's row for that event here, because this is not the Cohort cleaning the water.
    clockTriggers: { bodyCut: { HUNGER: 2, TOLL: 1, oncePerScene: true } },
    host: {
      cite: 'Vector §8.4',
      play: 'Nothing here wants to fight. What is here wants to be legal. Run the room as Lesson 5: three exchanges, Stakes Ladder visible, and state what success buys first. The drone elder is Nine-Folds.',
      danger: 'Only if the Cohort startles the brood: 2 Receptor Lurkers + 3 Drifter Shoal = 7 BSP. A Lurker reads you for free, then announces what it intends to do. Its Camouflage reads as neutral to Chemoreception at AT 14.',
      wants: 'To be registered. A claim needs a witness, a signature, and a body that can hold paper.',
      weakness: 'A Lurker must be near to read: blind it with turbid water or a Scent Dampener. Preempt is saved by OSM at AT 14.',
      hazard: 'None, which is the point.',
      pays: '25 Codon for learning what the not-whale actually is; a G Specimen; the Choir\'s goodwill; and, if the brood is registered, a Name. If harvested instead: 400 to 900 S, HUNGER +2, TOLL +1. Both are legitimate play: charge for both.',
      tells: 'The Eyes can smell that the brood\'s chemistry matches the slag, not the whale. Nine-Folds will say it for a registration signature. The Ash read shows the whale herding something into the Reach.',
      lesson: 'Lesson 5, the law and the ledger.',
    },
  },
  {
    id: 'gut-stone', n: 5, name: 'The Gut Stone', short: 'the yield, the owner, and the schedule',
    inWhale: 'The far curve of the gut: as deep as the carcass goes.',
    where: 'A plug of fused slag, gut-crud and salt, 30 Drifts across, wedged in the curve of the gut. It is warm. Around it lies a field of shards, everything cutting loose, and an acid halo where something inside leaks. One shaft leads up.',
    front: 'The shard field, then the face of the stone.',
    tonic: 'mixed: acid at the stone', visc: 3, flow: 4,
    zones: [
      { name: 'The stone face', band: 'Contact', note: 'inside the acid halo' },
      { name: 'The shard field', band: 'Mid', note: 'difficult ground; everything cuts' },
      { name: 'The exit shaft', band: 'Far', note: 'up to the Render Hall\'s pump' },
    ],
    exits: ['Out: the exit shaft up to the pump', 'Back: the pyloric duct to the Brood'],
    encounter: [{ blockId: 'protease-warden', count: 1 }, { blockId: 'cytoplasmic-bleeder', count: 2 }, { blockId: 'antigen-gnat', count: 4 }],
    // Paid by the Engine when one of these is harvested, never by the Director's award.
    harvestPays: { 'protease-warden': { codon: 14 }, 'cytoplasmic-bleeder': { codon: 3 }, 'antigen-gnat': { codon: 1.5 } },
    host: {
      cite: 'Vector §8.5',
      play: 'Two things claim this room and neither is evil: a Lattice Guardian folded around the print job, and a Hegemony recovery team under a Protease Warden. Announce E5 as Deadly before it starts. The exit is the scene: if TOLL hits 5 the Render Charge fires and the last ten minutes are a chase.',
      danger: 'E5, Deadly: 1 Protease Warden + 2 Cytoplasmic Bleeders + 4 Antigen Gnats = 12 BSP, against a Deadly budget of 13 for a Cohort of four.',
      wants: 'The Warden wants the canister intact. The Guardian wants the job complete.',
      weakness: 'The Warden\'s kit runs on Marks: Masked, Latency or a scent dampener turns it into a plain bruiser. Break its supports and it withdraws to report. Convince the Guardian the job is complete and it goes quiet.',
      hazard: 'The Render Charge: on a Clock, fires at TOLL 5. 20 Kinetic, 2-band shift, the carcass ends. Not survived: raced.',
      pays: 'The recovery crew will pay 200 to 400 S for a Cohort willing to carry the serial into a Hegemony office and say it out loud.',
      tells: 'The canister\'s serial is in a format retired before your lineage was written.',
      lesson: 'The ending. Chase rules: parallel Fluid Navigation contests, loser shifts a band, escape at Loose + 2 bands (CORE §4.14).',
    },
  },
];

export const scenario = {
  id: 'first-carve',
  title: 'The First Carve',
  whale,
  hands,
  clocks,
  sites,
  rules: {
    reconstitutionCostsClock: 'CARCASS',
    // 3.1-3.3 print what the place pays on its own, so the Ledger pays them when the event happens
    // in play. 3.4's cap on the Director's discretionary advance (one segment per Clock per
    // session) is untouched: these are the carcass reacting, not the host choosing. A Clock named
    // here is a claim this Vector makes, and one row may name more than one: §3.2 prices "the Cohort
    // is loud in the channels (a Pulse War...)" on TOLL and §3.3 prices "the Cohort fights loudly" on
    // HUNGER, so a Pulse War in the open moves both. Naming only TOLL is the 13 Nov afternoon gate's
    // defect — the Director told the table HUNGER had moved, which is what the book prints, and the
    // Engine had paid nothing to HUNGER at all.
    clockTriggers: { panelOpens: 'CARCASS', bodyCut: 'HUNGER', bodyLeft: 'HUNGER', loud: ['TOLL', 'HUNGER'], oathKept: 'TOLL' },
    // 3.1 prices "the Cohort opens a new panel" on CARCASS. Both runs of the 13 Nov evening gate paid
    // that row twice for one panel — the Director's discretionary advance and the site cut — so this
    // Vector says how many panel openings one scene pays for. 1 keeps the Clock honest to the scene;
    // set it to 0 and every panel cracked loose pays its own segment.
    panelOpensPerScene: 1,
  },
};

// The half of the scenario that player screens may load: no Director notes.
export function publicScenario(sc = scenario) {
  return {
    id: sc.id,
    title: sc.title,
    whale: sc.whale,
    clocks: sc.clocks,
    sites: sc.sites.map(({ host, encounter, pricedChoice, ...open }) => open), // the priced-choice table stays behind the screen
  };
}
