// The Long Swallow as data. Numbers and facts are taken from the Vector; section cites are to
// "The Osmotic Expanse - THE LONG SWALLOW". Same shape as first-carve.js and ninth-shift.js.
import { kit } from './kit/long-swallow.kit.js';
import { HANDS_L7 } from './levelled-hands.js';

const hands = HANDS_L7;

const clocks = [
  {
    id: 'LICENCE', name: 'LICENCE', segments: 6, says: 'Six days until the crews open the Host and dissolve it. The pressure clock.',
    stages: ['quiet', 'crews mustering', 'prices rise; the Choir begins a vigil at the Weep', 'the first cut: the Weep gains an enzyme wash (3 Lytic per Cycle) until the Cohort is past it', 'the Chapel floods with runoff; the ferry stops; your sponsor is now inside with you', 'the Churn is decoupled: it fills every Cycle and throws two bands', 'dissolution: the escape, with the Receipt in someone\'s hands'],
  },
  {
    id: 'IMMUNE', name: 'IMMUNE', segments: 5, says: 'What the Host\'s body has learned about the Cohort. Every cut, blow or harvest inside it adds one. The price of loot.',
    stages: ['unnoticed', 'scented: something has read you', 'filed: a Sentinel issues the first challenge (Tolerance, AT 14)', 'Marked: one Cohort member is flagged; Goodwill drops a rung', 'cascade: Antigen Gnats in every villus; any lost challenge Marks another', 'COMPLETE: Ninth Response arrives and the Host can no longer open an exit for you'],
  },
  {
    id: 'GOODWILL', name: 'GOODWILL', segments: 4, start: 2, track: true, says: 'The Host\'s mood toward the Cohort, from Hostile to Kin. A mood, not a wall: small signals decide whether it clears you or files you.',
    stages: ['Hostile', 'Wary', 'Curious', 'Client', 'Kin'],
  },
  {
    id: 'CHURN', name: 'CHURN', segments: 4, says: 'The digestion timetable. Each time it fills, everything in the compartment is pushed one room deeper.',
    stages: ['quiet', 'the walls groan', 'the fluid goes flat and sweet', 'the pump primes', 'fill: everything is pushed one band deeper and takes 6 Osmotic'],
  },
];

const host0 = 'The Unread: a Barophil Osmotic Brute half-digested in the Wastes for nine Great Cycles, so vast that a shanty town stands in its wound. The Reclaimers\' Ash have posted a licence to dissolve it in six Beats, because something unlisted is inside it. It asked for the Cohort.';

const sites = [
  {
    id: 'weep', n: 1, name: 'The Weep', short: 'the wound, and the town built in it',
    inWhale: 'The Vat Road end of the Unread: a torn band of muscle the width of a street, folded into a shanty town.',
    where: 'A tear in the Host\'s side as wide as a street, its edges folded into a shanty town. Water sellers, an abandoned toll booth still fining nobody, and a Hermit who knows the Host\'s timetable.',
    front: 'The Hermit\'s stall, the toll booth muttering fines to nobody, and the wall of the Host, breathing.',
    tonic: 'hypertonic, tinged acid', visc: 1, flow: 2,
    zones: [
      { name: 'The water sellers', band: 'Contact', note: 'three Barophils; water is 2 S a Drift and is currency' },
      { name: 'The toll booth', band: 'Near', note: 'a Warden booth still reading passers-by and fining no one' },
      { name: 'The Hermit\'s stall', band: 'Near', note: 'knows the outflow; trades for something you have' },
      { name: 'The old scar', band: 'Mid', note: 'the break-in of an earlier Cohort: gear and a chemical record' },
    ],
    exits: ['Inward to the Chapel (a Beat)', 'Back to the Vat Road'],
    encounter: [{ blockId: 'flaccid-haunter', count: 2 }, { blockId: 'gnaw-swarm', count: 1 }],
    harvestPays: { 'flaccid-haunter': { codon: 7 }, 'gnaw-swarm': { codon: 1.5 } },
    host: {
      cite: 'Vector §7.1, §9 E1',
      play: 'The scene\'s question: how do we get inside, and what do we owe for it? The notice is read aloud each Beat and the Host says "six" the first time anyone speaks to it. The Cohort chooses its own Intake; nothing is ever done to a Cohort member by force.',
      danger: 'E1: 2 Flaccid Haunters + 1 Gnaw Swarm = 5 BSP, Easy. They are thirsty, not evil: 20 S of sealed water ends it in one sentence.',
      wants: 'The Hermit wants something you have, never coin. The scavengers want water. The Host wants to be allowed to stop.',
      weakness: 'Water. Offer it and the fight is over.',
      hazard: 'None here; the hazard is a bill. (From LICENCE 3 the Weep gains an enzyme wash, 3 Lytic per Cycle until the Cohort is past it.)',
      pays: '17.5 Codon each for the Haunters in a fight; 30 S and water rights worth more than the gear. The Churn schedule and the Hermit\'s price list are the real pay. The earlier break-in\'s record says: the Nodule answers to a name.',
      tells: 'Item fourteen on the notice board is a cradle. The Congregation counts flushes as prayer. A cut was made from the inside by a licensed tool.',
      lesson: 'Water is currency, and the first thing the Host teaches is that you owe it.',
    },
  },
  {
    id: 'chapel', n: 2, name: 'The Chapel of the Unwasted', short: 'a swallowed shrine, now a ferry stop',
    inWhale: 'A swallowed Deep Choir shrine turned granary, hospital, graveyard and now a ferry terminus with a notice board.',
    where: 'Pews of folded membrane, a bell nobody rings because ringing it tells the body where everyone is, and about forty pilgrims being digested slowly on purpose.',
    front: 'The notice board, the ferry pilots, and forty pilgrims who will sell you sponsorship for a true name.',
    tonic: 'isotonic, sweetish', visc: 1, flow: 1,
    zones: [
      { name: 'The pews', band: 'Contact', note: 'folded membrane; the Congregation hides one Cohort member once' },
      { name: 'The notice board and ferry', band: 'Near', note: 'numbered sacs: the inventory of everything the body has taken in' },
      { name: 'The bell', band: 'Mid', note: 'do not ring it' },
      { name: 'The fresh cut in the wall', band: 'Far', note: 'made from inside, Hegemony tool-marks and a charge-slug' },
    ],
    exits: ['Deeper to the Churn (half a Beat; the Churn does the rest)', 'Back to the Weep'],
    encounter: [{ blockId: 'gastric-sentinel', count: 1 }, { blockId: 'antigen-gnat', count: 3 }],
    harvestPays: { 'gastric-sentinel': { codon: 15 }, 'antigen-gnat': { codon: 1.5 } },
    host: {
      cite: 'Vector §7.2, §9 E2',
      play: 'No forced combat. The Undissolvable Congregation runs the interior here and sells sponsorship (Intake 9), a hiding place (once) and the truth about what is deeper. Their price is always a name, and always a true one. A Cohort with Form 11-B, a token, a warrant or an honest Precept-4 answer cannot lose this fight and should walk out with a Sentinel escort.',
      danger: 'E2: 1 Gastric Sentinel + 3 Antigen Gnats = 5 BSP, only if the Cohort is hostile, loud or Lytic. Loss is IMMUNE 1, not death.',
      wants: 'The pilgrims want to be left to be digested on purpose. The Sentinel wants to know whether you belong.',
      weakness: 'Sentinels will not initiate against valid chemistry. Desiccation or Cold ends them; withdrawn sponsorship stands the squad down.',
      hazard: 'The bell: ringing it tells the body where everyone is (IMMUNE +1).',
      pays: '30 Codon for the objective (three clues, sponsorship, or a rite); 19.5 Codon if E2 turns. The ferry ledger. No gold, one favour. A Sentinel\'s Pristine fragment is worth 200 S and a bad reputation.',
      tells: 'The Churn\'s log kept by pilgrims: the pump has tried to finish one object for nine Great Cycles. Numbered sacs, one of them Ock\'s missing crew\'s. A fresh cut with a Brine Office charge-slug.',
      lesson: 'A guard that tells you honestly what it would take for you to belong here.',
    },
  },
  {
    id: 'churn', n: 3, name: 'The Nine-Cycle Churn', short: 'the digestion, still trying',
    inWhale: 'The Host\'s digestion mid-action: muscle walls on a schedule, enzyme sheets, a pump-villus the size of a flywheel and a bolus that never finishes.',
    where: 'A channel of contracting muscle, sheets of enzyme, a pump-villus the size of a foundry flywheel, and a pale lump the size of a house going round and round.',
    front: 'The walls, closing like a fist and opening again, and the lump in the gap.',
    tonic: 'acidic, hypertonic, turbid', visc: 2, flow: 4,
    zones: [
      { name: 'The channel', band: 'Contact', note: 'viscous (2 PP per Drift, 3 in the deep channel); Flow 4 toward the Shelf' },
      { name: 'The pump-villus', band: 'Near', note: 'jam it: Synthesis AT 14 and 20 S' },
      { name: 'The deep channel', band: 'Mid', note: 'enzyme sheets, 4 Lytic per Cycle; Turbid, OSM contests at -1 die' },
      { name: 'The Shelf approach', band: 'Far', note: 'where the fill throws everything' },
    ],
    exits: ['With the flow to the Shelf (free, and grants Momentum; if the pump is jammed, swim it: 2 PP per Drift through still water, and the way is open)', 'Against the flow, back to the Chapel (Fluid Navigation AT 12, 14 in the Churn proper, or 2 PP per band)'],
    encounter: [{ blockId: 'gastric-sentinel', count: 2 }, { blockId: 'protease-locusts', count: 2 }],
    harvestPays: { 'gastric-sentinel': { codon: 15 }, 'protease-locusts': { codon: 3.5 } },
    host: {
      cite: 'Vector §6.3, §7.3, §9 E3, §10.5',
      play: 'A terrain puzzle with a schedule. Say the spine aloud: this room has a direction and a schedule. Three working answers, never gated on one: jam the pump; reverse a band (a Navigator\'s shear or Tidal Anchor behaviour); be patient (an Anchor or Immovable build rides it for free). Say the Sentinels\' printed weakness in Cycle 1.',
      danger: 'E3: THE CHURN (hazard, 2 BSP) + 2 Gastric Sentinels + 2 Protease Locusts = 8 BSP, Standard at Levels 9-12, Easy at 7. At the fill, everyone is thrown toward the Shelf; a Cohort that fights against the flow is fighting the map.',
      wants: 'The Churn wants to finish its one job. The Sentinels want a reason.',
      weakness: 'It is a muscle: jam the pump (Synthesis AT 14, 20 S) and it stops; Desiccation halves its push; a Tidal Anchor declines to be moved; a PC who goes limp with the flow takes nothing.',
      hazard: 'Trigger: entering or lingering in the deep channel. Effect: 4 Lytic damage per Cycle (the enzyme sheets; they are a hazard, never a wall: anyone can swim through and pay it). THE CHURN fill, on the CHURN Clock (abiotic, 2 BSP, integrity 60, MT 5, 8 braced): everything in the compartment is pushed 1 band and takes 6 Osmotic (+4 Kinetic into a wall; Brace, Anchor or Immovable negates). At LICENCE 5 it fills every Cycle and throws two bands. Over-prime at LICENCE 5: 3 bands and 14 Osmotic. Cutting the pump-villus pays C3 / G1 but ends the compartment\'s movement forever, stranding everyone inside.',
      pays: '37 Codon for the room. C14 / G6 and a Nine-Cycle Sample if the pump is cut. A jammed pump is a safe dead-water room where the Cohort can rest, trade or be trapped.',
      tells: 'The fluid goes flat and sweet; the walls groan one Cycle early and the Congregation counts it aloud. Free warning, always.',
      lesson: 'Every good site has a direction, and this one has a schedule.',
    },
  },
  {
    id: 'shelf', n: 4, name: 'The Shelf of Not-Finished Things', short: 'everything it could not bring itself to end',
    inWhale: 'The cost room. Everything the Host decided not to dissolve, held in nodules of slow tissue, alive and aware.',
    where: 'Cargo wrecks still broadcasting their owners\' oaths, a Vat Crew of twelve who are still in there thinking, Drift Whale calves, and Pristine Sequences stacked like cordwood.',
    front: 'Slow tissue holding living things politely, and a foreman with a clipboard.',
    tonic: 'isotonic, still', visc: 1, flow: 1,
    zones: [
      { name: 'The crowd of organs', band: 'Contact', note: 'not a fight: a crowd that has learned to live as organs' },
      { name: 'Ock\'s crew', band: 'Near', note: 'twelve Ash workers, alive and thinking; their licence calls them salvage' },
      { name: 'The Pristine stacks', band: 'Mid', note: 'the best haul in the Vector; each cut is IMMUNE +1 and Goodwill -1' },
      { name: 'The Nodule path', band: 'Far', note: 'toward the chapel-sized nodule at the centre' },
    ],
    exits: ['Onward to the Nodule', 'Back up the flow (against the Churn)'],
    encounter: [{ blockId: 'foreman-sulk', count: 1 }, { blockId: 'enzymatic-horror', count: 2 }],
    harvestPays: { 'foreman-sulk': { codon: 30 }, 'enzymatic-horror': { codon: 7 } },
    host: {
      cite: 'Vector §7.4, §9 E4, §10.4',
      play: 'The moral room, and it must be playable. The inhabitants are a crowd, not a fight (one OSM/AFF contest, AT 12 mixed, 16 hostile). Harvesting is possible and is the best haul in the Vector. The Ash\'s licence will dissolve this room first, so anything wanted from it must be asked for, bought, taken or argued for now. Let the table find out for itself that any deal with Ock is a deal about what happens to the twelve.',
      danger: 'E4: Foreman Sulk Nine-Yards (Elite) + 2 Enzymatic Horrors + the Churn hazard = 10 BSP, Standard/Hard. Sulk parleys if named the crime (no Warden counter-signature for interior cuts); the Horrors walk at the armoured Cohort member.',
      wants: 'Sulk wants to retire and finish his shift. Ock wants his crew back. The crowd wants to be asked.',
      weakness: 'Sulk routs at 40% MI and will negotiate. Mucoid grafts nullify his Acid charges. Naming the crime sits him down.',
      hazard: 'The Churn hazard reaches this room at the fill.',
      pays: '50 Codon for the truth about Ock\'s crew (C21 / G13 across twelve claim-holding bodies); E4 44 Codon, 220 S in feed stock, G8 and a Pristine Acid Gland. Harvesting Sulk is a Hegemony incident: a 1,200 S lien.',
      tells: 'Oaths broadcast by cargo wrecks. Twelve workers who answer when addressed. Pristine Sequences stacked like cordwood.',
      lesson: 'The horror is not acid. It is politeness: the Host spent nine Great Cycles not finishing things.',
    },
  },
  {
    id: 'nodule', n: 5, name: 'The Nodule', short: 'the promise, and its keeper',
    inWhale: 'A sealed knot of slow tissue at the centre of the Shelf, older than the Wastes\' politics and never touched by enzyme.',
    where: 'A sealed knot of tissue the size of a chapel, untouched by digestion. The Host\'s own immune authority stands before it.',
    front: 'The sealed door with no handle, and the guardian that bows.',
    tonic: 'isotonic, clean', visc: 1, flow: 1,
    zones: [
      { name: 'The Nodule face', band: 'Contact', note: 'integrity 90, MT 5 (8 braced); sealed to a person: Precept 6 applies' },
      { name: 'Ninth Response', band: 'Near', note: 'opens by parley' },
      { name: 'The Sentinel squad', band: 'Mid', note: 'stands down if the guardian does' },
      { name: 'The way out', band: 'Far', note: 'whichever of the three exits was earned' },
    ],
    exits: ['The door that opens (Goodwill Client or better)', 'Ride the Churn out (Synthesis AT 12 to rig a catch; costs Bulk and 6 Osmotic)', 'The Breach (cut your own door; costs 60 S of acid or a charge; IMMUNE +2, LICENCE +1, Goodwill Hostile)'],
    encounter: [{ blockId: 'ninth-response', count: 1 }, { blockId: 'gastric-sentinel', count: 3 }, { blockId: 'protease-locusts', count: 2 }],
    harvestPays: { 'ninth-response': { codon: 30 }, 'gastric-sentinel': { codon: 15 }, 'protease-locusts': { codon: 3.5 } },
    host: {
      cite: 'Vector §7.5, §9 E5, §10.3, §10.6',
      play: 'The yield, defended by its owner. Ninth Response opens by parley: it will trade a route and a safe exit for the foreign object leaving the body, which is what the Host wants and the opposite of what three factions pay for. Three ways to open the Nodule, all printed: cut it, unseal it (valid token or Kin), be named to it. The Undersigned can be carried out as a witness or harvested as a document, never both, and its Harvest line is deliberately absent.',
      danger: 'E5: Ninth Response (Elite) + 3 Gastric Sentinels + 2 Protease Locusts = 12 BSP, Hard. At IMMUNE 5, +2 Sentinels = 16, Deadly: say out loud that somebody\'s body gets harvested.',
      wants: 'Ninth Response wants the foreign thing out and the Host unharmed. The Undersigned wants its oath heard. The Host wants to stop.',
      weakness: 'No lattice if Ninth Response is alone. Silence gear denies Broadcast and Cascade. Precept 4 plus a clean Tolerance win at AT 14 strips its whole kit for a scene.',
      hazard: 'THE NODULE (abiotic, 2 BSP): Lytic damage against it is reduced to 0. Cut: Synthesis AT 20, a Breacher\'s charge or 30 S of acid (IMMUNE +2, Goodwill -1). Unseal: a valid token (AT 14) or Kin, free. Be named: free, +1 on the next contest, costs a CORE segment.',
      pays: '60 Codon for the Receipt and the campaign-revealing object; E5 82 Codon; ending objectives 60-200 Codon. Ninth Response yields a Tolerance Codon.',
      tells: 'The enzyme stops: Lytic apparatus goes quiet and corpses nearby are whole. The guardian bows. The Nodule answers to a name.',
      lesson: 'A promise, kept in the only place a body can keep one: inside itself.',
    },
  },
];

export const scenario = {
  id: 'long-swallow',
  title: 'The Long Swallow',
  whale: host0,
  placeLabel: 'In the Host',
  zeroLine: 'You will go inside a living person who asked for you. Nothing is ever done to your organism by force: no swallowing, dissolving or implanting unless you chose it. Say if anything is too much and we will change it.',
  hands,
  clocks,
  sites,
  kit,
  rules: {
    // 3: LICENCE advances one segment per Beat (the Engine pays it when the day ends).
    beatClocks: ['LICENCE'],
    // A Beat is the Wastes' working day; the Engine closes one if the Director has not.
    beatAfterTurns: 10,
    // IMMUNE moves on loud, noticed actions; CHURN on schedule (the Director says when it fills). LICENCE on the
    // Beat, and once for a printed non-day trigger (6.4: a Breach advances LICENCE 1).
    aiAdvanceCap: { IMMUNE: 5, CHURN: 4, LICENCE: 1, GOODWILL: 8 },
    // 6.2: a loud success is what the body notices (never a failed roll).
    clockTriggers: { loud: ['IMMUNE'] },
    valueClock: 'IMMUNE',
    // 6.1-6.4 and 3, paid by the Engine.
    stateAt: {
      LICENCE: {
        3: { siteHazard: { weep: { amount: 3, dtype: 'Lytic', why: 'The enzyme wash in the Weep' } }, note: 'the first cut is made: the Weep has an enzyme wash, 3 Lytic per Cycle to anyone in it (the Engine pays it each Cycle and on arrival). If the Cohort did nothing to stop it, Goodwill drops a rung: move it yourself.' },
        4: { note: 'the Chapel floods with runoff and the ferry stops; the Cohort\'s sponsor is inside with them.' },
        5: { churnBands: 2, churnEveryCycle: true, note: 'the Churn is decoupled: CHURN moves every Cycle inside the body and each fill throws 2 bands (the Engine pays both).' },
      },
      IMMUNE: {
        2: { note: 'filed: a Gastric Sentinel may challenge (a Tolerance contest; see the Threshold below).' },
        4: { note: 'cascade: Antigen Gnats in every villus; a lost challenge Marks another organism; Congregation sponsorship costs double.' },
        5: { goodwillCap: 2, note: 'COMPLETE: Ninth Response arrives, and the Host can no longer open an exit. GOODWILL cannot rise above Curious (the Engine holds it there). The way out is the Breach. Say this exactly, at the table.' },
      },
    },
    stateBelow: {
      GOODWILL: {
        0: { churnBands: 2, note: 'GOODWILL is Hostile: the Host stops being a place. Every CHURN fill throws 2 bands and the exit is the Breach.' },
        1: { toleranceAT: 18 },
      },
    },
    // 6.2: at IMMUNE 3 one organism is Marked and Goodwill drops a rung, paid once.
    onStage: { IMMUNE: { 3: { mark: 1, track: { GOODWILL: -1 } } } },
    // 6.3: the Churn's fill. Everything inside the body is pushed 1 band (2 at LICENCE 5 or Hostile) and
    // takes 6 Osmotic; Braced holds. A jammed pump stops the Clock.
    churn: { clock: 'CHURN', sites: ['chapel', 'churn', 'shelf', 'nodule'], amount: 6, dtype: 'Osmotic', bands: 1 },
    // 6.4: a Tolerance contest is AT 14, AT 10 if sponsored, AT 18 if the Host is Wary or worse.
    tolerance: { base: 14, sponsored: 10 },
  },
};

export function publicScenario(sc = scenario) {
  return {
    id: sc.id,
    title: sc.title,
    whale: sc.whale,
    clocks: sc.clocks,
    hasBeat: !!(sc.rules && (sc.rules.beatClocks || sc.rules.beatSets)),
    restClock: (sc.rules && sc.rules.reconstitutionCostsClock) || '',
    placeLabel: sc.placeLabel || '',
    zeroLine: sc.zeroLine || '',
    pitch: sc.kit ? sc.kit.pitch : '',
    glossary: sc.kit ? sc.kit.glossary : [],
    handsPlain: sc.kit ? sc.kit.hands : {},
    starts: sc.kit ? Object.fromEntries(Object.entries(sc.kit.sites).map(([id, k]) => [id, k.start])) : {},
    sites: sc.sites.map(({ host, encounter, pricedChoice, ...open }) => open),
  };
}
