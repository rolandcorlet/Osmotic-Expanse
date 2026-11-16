// The Ninth Shift as data. Numbers and facts are taken from the Vector; section cites are to
// "The Osmotic Expanse - THE NINTH SHIFT". Same shape as first-carve.js:
//   where / zones / exits  -> shown to everyone on arrival
//   host                   -> Director-only notes (never sent to player screens)
import { kit } from './kit/ninth-shift.kit.js';
import { HANDS_L4 } from './levelled-hands.js';

const hands = HANDS_L4;

// §3 The three Clocks, shown to the players.
const clocks = [
  {
    id: 'SHIFT', name: 'SHIFT', segments: 6, says: 'The district is seizing up, one step each working day. The pressure clock.',
    stages: ['the district is running', 'prices move: vials x3, graft re-tuning 25%', 'registered gear is "scheduled for maintenance": a licensed graft may be suspended for a scene', 'the pump-villi cramp: Drifts cost +1 PP, the medium thickens', 'organs sit down: THE SILENCE spreads through the Row', 'the Print Convoy arrives with THE RELIEF; the Row is now obstructing licensed production', 'Shift Nine is dissolved; the Line is cut into four organs and sold'],
  },
  {
    id: 'BADGE', name: 'BADGE', segments: 5, says: 'How much the Belt reads the Cohort as the bosses\' people. A brass disc anyone can hand to someone else.',
    stages: ['Kin of the Row', 'The Temp: harmless, rented', 'The Contractor: a badge and a rate', 'Nine-Badges: you have chosen', 'The Bailiff\'s Friend', 'The Convoy\'s Own'],
  },
  {
    id: 'PAPER', name: 'PAPER', segments: 4, says: 'The court\'s timetable. The decision is already written. The law clock.',
    stages: ['nothing filed', 'a summons arrives', 'the Auditors request one witness: someone the Cohort has been kind to', 'the hearing is moved forward by a Beat', 'the decision is issued'],
  },
];

const district = 'The Foundry Belt\'s Shift Nine: four hundred living machines (foundry-organs) stopped mid-task in waste brine, one printing line still running with nobody running it, a picket row of workers who will never attack you but will stop serving you, and a licence court that has already written its decision. Nobody here is evil. Everyone is at work, on a deadline, and the deadline is the problem.';

const sites = [
  {
    id: 'filing-gate', n: 1, name: 'The Filing Gate', short: 'a queue, a form and a wage',
    inWhale: 'The approach to the district: a hiring gate under an official arch.',
    where: 'A hiring gate under an official arch. A kind clerk, a rack of nine hundred warm brass badges, an insurance desk, a blank notice board and a queue forty-one long.',
    front: 'The front of the queue, a clerk with a badge and a form, and the arch above you.',
    tonic: 'hypertonic waste brine, turbid', visc: 1, flow: 2,
    zones: [
      { name: 'The queue', band: 'Near', note: 'forty-one long; waiting here is a resource' },
      { name: 'The arch and the clerk\'s desk', band: 'Contact', note: 'a Warden arch reads the register, free and unavoidable' },
      { name: 'The badge rack and the notice board', band: '', note: 'nine hundred badges; nine Beats of blank notices' },
      { name: 'The Mutuality desk', band: '', note: 'the Fund\'s insurer, 20 S of coverage' },
    ],
    exits: ['The brine-walk to the Picket Hearth'],
    encounter: [{ blockId: 'print-crew-construct', count: 2 }, { blockId: 'antigen-gnat', count: 2 }],
    harvestPays: { 'print-crew-construct': { codon: 7 }, 'antigen-gnat': { codon: 1.5 } },
    host: {
      cite: 'Vector §7.1',
      play: 'The scene\'s question: which door are we standing in front of, and what will we sign to be let through it? A clerk is already holding out a badge and a Form with eleven boxes, and the clerk is kind, and the kindness is the problem. Read the boxes aloud one at a time; ticking a box is a legal act and some are Keys or Gene-Debt segments. Three boxes are lies about the Foundry, not about the players. Waiting in the queue is a resource: a Beat in the queue rewinds one Clock segment. Say so in the first minute.',
      danger: 'E1: 2 Print-Crew Constructs + 2 Antigen Gnats = 6 BSP, Easy. It ends in one sentence if anybody presents a Wage properly. Nobody here is evil; the clerk is trying to help. If it goes loud the punishment is PAPER +1, not death.',
      wants: 'The clerk wants everyone through the gate with the right form, and fears being asked to swear to anything.',
      weakness: 'Print-Crew Constructs cannot start a labour action: hand one a valid, contradictory specification and both freeze (Synthesis or SEMANTIC AT 12, one Box of the Form as the document).',
      hazard: 'None, which is the point: the hazard here is a signature.',
      pays: '15 Codon for arriving with a Wage chosen, the Form filled and said out loud; 10 more if they catch the clerk\'s arithmetic mistake. 30 S in unclaimed wage float if they find the Mutuality\'s error. The dead queue-member\'s unclaimed licence is worth 100 S and a conversation.',
      tells: 'The crossed-out name in the badge ledger; the dead queue-member\'s licence; the clerk\'s five unspent Oath boxes, visible and wrong for a clerk (a clerk told not to swear is a fact about the Court).',
      lesson: 'The Wage and the Form: choosing a side is a legal act, and the queue pays.',
    },
  },
  {
    id: 'picket-hearth', n: 2, name: 'The Picket Hearth', short: 'the workers\' row, silent',
    inWhale: 'The Row: the workers\' neighbourhood, under four hundred stopped foundry-organs.',
    where: 'Four hundred living machines stopped mid-task, and a hearth with soup that is not good and is enough. An alley behind organ 41 has a light on.',
    front: 'The hearth, a bowl of hot chemistry held out to you, and four hundred silent organs overhead.',
    tonic: 'hypertonic waste brine, turbid; Dry where the Silence lies', visc: 1, flow: 2,
    zones: [
      { name: 'The hearth', band: 'Contact', note: 'a shared meal is +1 Cohesion, once per movement' },
      { name: 'The silent organs', band: 'Mid', note: 'four hundred, mid-cycle; some hold a half-printed fold' },
      { name: 'Organ 118\'s maintenance cage', band: 'Near', note: 'a collapsed organ, a Pristine Sequence inside' },
      { name: 'The mouth of the alley behind organ 41', band: 'Far', note: 'a light that should not be on' },
    ],
    exits: ['Service alley to the Print Floor (a Warden arch: Badge 2+ passes, Badge 0-1 must be escorted)', 'Back to the Filing Gate', 'The alley behind organ 41'],
    encounter: [{ blockId: 'gnaw-swarm', count: 1 }, { blockId: 'detritus-feeder', count: 2 }],
    harvestPays: { 'gnaw-swarm': { codon: 1.5 }, 'detritus-feeder': { codon: 1.5 } },
    host: {
      cite: 'Vector §7.2, §10.8',
      play: 'The scene\'s question: can we buy anything here, and are we willing to be seen buying it? Someone hands the Cohort a bowl and asks loudly and politely whose wage they are on. Nobody on the Row will attack the Cohort, ever, even at Badge 5: the Row\'s weapon is service denial (no repairs, no Vials, no lies on your behalf, no soup). The hearth pays Cohesion; if the Cohort eats there at Badge 3 or more, the soup is still given and nobody speaks: protect that image. Detritus Feeders are eating the strike off the silent organs and the Row has domesticated two.',
      danger: 'E2: THE SILENCE (hazard, 2 BSP) + 1 Gnaw Swarm + 2 Detritus Feeders = 5 BSP, Easy. The Feeders want the corpses, not you. If the Cohort denies them corpses they become a nuisance; if the Cohort feeds them, the Row adopts them.',
      wants: 'The Row wants to be left alone and to be paid. Steward Nine-Grudge did not organise the strike and has been made responsible for it.',
      weakness: 'THE SILENCE is an absence of a process: any running Line ends it in one compartment (a Print Floor brought back up, Synthesis AT 16 with the three observations; or an improvised print, AT 16, 40 S, one Specimen, which the Row will tell you for free).',
      hazard: 'THE SILENCE (abiotic, 2 BSP): Dry, no print, no repair, no re-fold. Synthesis contests are at -2 dice; graft Minor Costs cannot be repaired; Brittle and misfolded marks do not clear; Vials go stale at the end of the scene; swarm segment regeneration stops. It does no damage. Say what it does the first time it matters, in one sentence, and never threaten it.',
      pays: 'A Quiet Apron from the scrap bins (free); a Pristine Sequence in organ 118\'s claim cage (200 S, assessment-bound); the fold a silent organ was holding when it stopped (unlisted, worth a conversation with Kel-Vasht). E2 pays 4.5 Codon.',
      tells: 'A light in the alley that should not be on. Any worker on the Row says the Line has never been told to stop. The wage book with Steward Nine-Grudge\'s signature.',
      lesson: 'Service denial is a mechanical condition: being unpopular in a district of services.',
    },
  },
  {
    id: 'print-floor', n: 3, name: 'The Print Floor of Shift Nine', short: 'the problem room, still running',
    inWhale: 'The heart of Shift Nine: the one room that has not stopped.',
    where: 'The Line, running, with nobody running it; the output stacked on the far table, folded and nearly finished; and the Fold Parlour, which is in every respect a spa.',
    front: 'The Line, humming, and the far table with nine Beats of the same folded thing in pieces.',
    tonic: 'hypertonic waste brine; warm (the Parlour\'s waste heat)', visc: 1, flow: 2,
    zones: [
      { name: 'The Line', band: 'Near', note: 'abiotic; prints on a schedule or when disturbed' },
      { name: 'The output shelf', band: 'Mid', note: 'stacked, folded and legible' },
      { name: 'The Fold Parlour', band: 'Mid', note: 'towels, an appointment book, an apologetic attendant' },
      { name: 'The pump-lift', band: 'Far', note: 'stopped; 2 PP per Drift through the stiff medium' },
    ],
    exits: ['The pump-lift to the Licence Court', 'Back by the service alley to the Picket Hearth'],
    encounter: [{ blockId: 'print-crew-construct', count: 1 }, { blockId: 'protease-locusts', count: 1 }],
    harvestPays: { 'print-crew-construct': { codon: 7 }, 'protease-locusts': { codon: 3.5 } },
    host: {
      cite: 'Vector §7.3, §10.1-10.3',
      play: 'The scene\'s question: do we stop the machine, feed it, or ask it what it is making? The Line has run nine Beats on a specification nobody signed; it is the third party, not haunted, not malicious. Roll its output on the d10 table the first time anyone asks what it has made, and again whenever anyone is loud near it. Overseer Kel-Vasht (Level 12) is not a fight at these Levels; argue with it at AT 16 and lose correctly: it wants the Cohort to testify the Nine Tune is prior art, because the trait is its own and the receipt for buying it is folded in its membrane. The Fold Parlour is where Level 6 happens: stage the growth there, printed, folded, warrantied, and registered, and have the warranty read aloud. THE RELIEF arrives on Beat 3, on time.',
      danger: 'E3: THE LINE (hazard) + (at Level 4) 1 Print-Crew Construct + 1 Protease Locusts. Standard at Levels 1-4, Easy at 5-8. The Line is the third enemy and the easiest to use: its output table fires whenever anyone is loud near it.',
      wants: 'The Line wants to finish its specification. The Overseer wants someone else to say the patent is dead. The Parlour attendant (Second-to-Nine) wants appointments kept.',
      weakness: 'THE LINE prints what it is fed: feed it a fold it cannot make (a forged sequence, a Row grievance, a Pristine Sequence from the cage; a lineage trait, which the Belt\'s grammar does not permit to be licensed) and it stalls with the fold half-done, the only physical evidence the Court cannot refuse. Cutting it (Kinetic, 4 hits at Overflow 3+) destroys the evidence and ends the strike.',
      hazard: 'THE LINE (abiotic, 2 BSP, integrity 60): one print output per Fugue Interval, or when disturbed. Chaperone exhaust: Lytic-family grafts are fine here and Osmotic builds lose their signature. It does no damage; its output is the danger and the gift.',
      pays: 'The jam fixed (three observations, Synthesis AT 16): 25 Codon, advances SHIFT and BADGE. The Line\'s shelf (d10): Specimens, a Pristine Sequence (200 S), forms, and one object that must be played as a person. Construct parts at 2x. E3 pays 17.5 Codon.',
      tells: 'The Line\'s own output is nine Beats of the same thing, in pieces. Kel-Vasht\'s long pause when the word "mine" is nearly said. The Line was never told to stop.',
      lesson: 'The thing that is hurting you is not malicious, it is running.',
    },
  },
  {
    id: 'licence-court', n: 4, name: 'The Licence Court', short: 'where the answer is already written',
    inWhale: 'The Court of the Belt, across the Row from the Print Floor.',
    where: 'Three Auditors, a scanning arch at the door, a public gallery of forty with numbered tickets, a wall schedule with the decision date already on it, and the patented shape on display as evidence.',
    front: 'The arch at the door, reading each of you aloud, and three Auditors with a drafted decision.',
    tonic: 'hypertonic waste brine, turbid', visc: 1, flow: 2,
    zones: [
      { name: 'The arch', band: 'Contact', note: 'scans every organism and graft; finds licensed gear' },
      { name: 'The bench', band: 'Near', note: 'three Auditors, two of whom never speak' },
      { name: 'The gallery', band: 'Mid', note: 'forty organisms holding numbered shells' },
      { name: 'The corridor outside', band: 'Far', note: 'where THE RELIEF will escort you' },
    ],
    exits: ['Out across the Row to the alley behind organ 41', 'The pump-lift back to the Print Floor'],
    encounter: [{ blockId: 'brack-nine-badges', count: 1 }, { blockId: 'print-crew-construct', count: 2 }, { blockId: 'acid-resistant-tank', count: 1 }],
    harvestPays: { 'brack-nine-badges': { codon: 14 }, 'print-crew-construct': { codon: 7 }, 'acid-resistant-tank': { codon: 7 } },
    host: {
      cite: 'Vector §7.4, §10.5-10.6',
      play: 'The scene\'s question: do we win by their rules, and are we willing to become the kind of organism that does? The hearing runs as three exchanges, no persuasion rolls: SEMANTIC (AFF + Signal Discourse vs OSM + Chemoreception) for facts and clauses; AFFECTIVE for the gallery, the Steward and the Overseer\'s dignity; DECEPTIVE for the filing error if they want to commit it rather than find it. State what a win buys before exchange one; Overflow buys rungs. A stalemate is information: PAPER +1 and the Cohort learns which Auditor wrote the decision. The exhibit is a body sample of a lineage trait, and anyone with Chemoreception 2 can tell. If the Cohort proves prior art, the Auditors issue the licence with a counter-claim that needs a surety, and the Cohort is the only eligible one.',
      danger: 'E4: BRACK NINE-BADGES (Elite) + 2 Print-Crew Constructs + 1 registered Acid-Resistant Tank = 10 BSP, Hard at Levels 1-4. They rout at 40% MI because their invoice has a cap of 400 S. Fighting them advances BADGE as much as anything, because the district pays the invoice. Never a new creature type: the same three constructs, better at finding you.',
      wants: 'Auditor Eleven-Brief wants to be helped and not be proved wrong in public (the same sentence, said differently). The Auditors want someone to have found the decision.',
      weakness: 'The cap: make the Relief more expensive than the assignment is worth and they stop fighting, produce the invoice and leave. The patent filing names the wrong building (organ 118, not 41); the Auditor will say it if asked.',
      hazard: 'The arch hums louder near licensed gear and reads out what you carry and what you are. It does no damage.',
      pays: 'The hearing won by document, not by force: 50 Codon, the patent\'s fate, the Clerk\'s Oath, and the counter-claim. E4 ended under the cap: 15 Codon and the invoice (the district pays); if it goes loud and ends in kills: 35 Codon, C8/G3/P2/T1 from Brack, and a Hegemony lien plus a patent claim on anything taken.',
      tells: 'Small print on the exhibit document in the wrong handwriting; Auditor Eleven-Brief\'s signature mark reads "organ 118"; the exhibit smells inherited, not printed.',
      lesson: 'The Court is not defeated by being out-argued. It is defeated by being handed a better document by someone willing to co-sign a person.',
    },
  },
  {
    id: 'alley-41', n: 5, name: 'The Alley behind Organ 41', short: 'the yield, defended by nobody',
    inWhale: 'The swept alley behind organ 41, past the Row.',
    where: 'A swept alley, a cradle, a stack of neatly folded towels, and the oldest machine in the district working very quietly.',
    front: 'The cradle, and the thing in it tidying up and asking whether it is finished.',
    tonic: 'isotonic, warm and clean', visc: 1, flow: 1,
    zones: [
      { name: 'The cradle', band: 'Contact', note: 'the Unlisted Print, nine Beats in the making' },
      { name: 'The alley', band: 'Near', note: 'swept; folded towels' },
      { name: 'The wall of offers', band: 'Mid', note: 'four factions have pinned up prices' },
      { name: 'The drainage channel', band: 'Far', note: 'Hush\'s route, forgotten by the pump-villi' },
    ],
    exits: ['The drainage channel (free; the print follows if it wants to)', 'Hush\'s route through organ 41 (120 S of a construct\'s parts, or one Pristine Sequence)', 'The front door (Badge 4+, or a warrant)'],
    encounter: [],
    harvestPays: {},
    host: {
      cite: 'Vector §7.5, §10.7, §10.9',
      play: 'The scene\'s question: is the thing in the cradle a what or a who, and who says which out loud? The print is tidying. It has been waiting nine Beats for someone to tell it whether it is finished, and it is polite. Foundry Mother Hush (Level 15) is not a fight: she has been waiting for someone to ask her to print something nobody has licensed, and will do it freely and explain exactly why that is a terrible idea. This scene has a Harvest line and it has a face: do not let the Harvest line be the joke. The joke is the price, the paperwork and the four factions that have already made offers. Play the print sincere, curious, slightly embarrassed about the mess. Rule of the Driest Thing, to the last line.',
      danger: 'No encounter is budgeted: the alley is a decision. If it goes loud: 1 Locust swarm + Hush\'s Labour Constructs (as Swarmlings x4) + the cradle (6-8 BSP). The print does not fight; Hush does not strike; her constructs move things, including the Cohort, gently, out of the alley.',
      wants: 'Hush wants to print something nobody has licensed. The print wants to know whether it is finished and whether it has made a mess.',
      weakness: 'Hush will not print against a person. Finishing the print gives it a registration and therefore no Harvest value at all (Precept 3): completion is the counter to the price, and Hush does it free in nine Cycles if the Cohort stays and signs the application, which is better than signing nothing.',
      hazard: 'None.',
      pays: 'The alley seen, priced and decided about: 25 Codon. Hush, asked properly: 20 Codon, one printed item free, one re-fold free, and one thing you did not ask for. Endings pay 40-120 Codon. The print\'s printed Harvest line (C9 / G5 / P2 / T1, Codon 21) is the Hegemony\'s own price on paper; if the Cohort takes the money, they name the number aloud as they hand it over.',
      tells: 'A light in the alley that should not be on; nine Beats of the same thing in pieces; an application on the Court\'s schedule in Hush\'s hand.',
      lesson: 'What happens when something prints a person and the only law about it is a price.',
    },
  },
];

export const scenario = {
  id: 'ninth-shift',
  title: 'The Ninth Shift',
  whale: district,
  placeLabel: 'In the district',
  zeroLine: 'This is a comedy for adults about a strike that officially is not one. It is about paperwork, queues and a machine nobody told to stop, and it gets close to the question of what a person is worth on a form.',
  hands,
  clocks,
  sites,
  kit,
  rules: {
    // 3.1: SHIFT advances one segment per Beat, paid by the Engine when the day ends (end_beat).
    beatClocks: ['SHIFT'],
    // 3.3: the Court\'s hearing is convened at the end of Beat 4; the decision is issued.
    beatSets: { 4: { PAPER: 4 } },
    // BADGE and PAPER move on printed triggers many times. SHIFT moves on the Beat (the Engine pays it) and
    // for its printed non-day triggers, e.g. the jam fixed (7.3) - the Director's, twice a session at most.
    aiAdvanceCap: { BADGE: 6, PAPER: 4, SHIFT: 2 },
    // 3.3: any loud success, seizure or destroyed construct advances PAPER (the Cohort is seen).
    clockTriggers: { loud: ['PAPER'] },
    loudChance: { PAPER: 1 },
    lawClock: 'PAPER',
    valueClock: 'NONE',
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
