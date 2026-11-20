// The Player's Atlas in playable cards (v3). Every rule and number is from "The Player's Atlas" and is
// unchanged; the lineages, Phenotypes, Adaptations and builds are generated from the book itself
// (tools/gen-atlas.mjs) so no number can drift. What is new is the delivery: plain words, when you use
// it, who does the work, the rule as short steps, and how it sounds at the table. look_up searches
// these, and v3/books/PLAYERS-ATLAS-v3.md is built from this file.
import { ATLAS_LINEAGES, ATLAS_TRADITIONS, ATLAS_PHENOTYPES, ATLAS_ADAPTATIONS, ATLAS_BUILDS } from './atlas.generated.js';

const MAKING = [
  { id: 'make-organism', ch: 'Atlas 1', name: 'Making an organism: the eight steps', plain: 'You build your character in about twenty minutes: pick a body plan and a class, spread your scores, choose a few skills, buy kit, and write down a name, a promise and a job.',
    when: 'Creating a character, or helping someone who is.', who: 'Player chooses at every step; Director answers questions; the Engine adds up the numbers.',
    rule: ['1. Choose a Lineage (your body plan and people).', '2. Place the array 4, 4, 3, 3, 2 on your five Baselines, then apply your Lineage.', '3. Choose a Phenotype (your class).', '4. Take its Pathway ranks, then two more at rank 1.', '5. Buy kit with 40 Substrate.', '6. Write three things: a chemical name, one Oath, one Vector.', '7. Work out your derived numbers.', '8. Starting above Level 1? Add the higher-Stage features and money (Step 8 card).'],
    table: 'Director: "Start with the body. Do you want to be fast, tough, clever, sharp-eyed or good with people?" Player: "Fast." Director: "Then Flagellan is where most fast people start."', keys: 'character creation chargen new player make build step' },
  { id: 'make-baselines', ch: 'Atlas 1 · Step 2', name: 'Step 2: spread your five Baselines', plain: 'Your five core scores. You get the numbers 4, 4, 3, 3 and 2 to spread across them, then your Lineage nudges one up and one down.',
    when: 'Making a character, or re-reading one.', who: 'Player places the numbers. The Engine applies the Lineage change.',
    rule: ['Place 4, 4, 3, 3, 2 on VSC, DFF, RTC, OSM and AFF, then apply your Lineage +1 and -1. No Baseline starts above 5 or below 1.', 'Be unbreakable or break others: raise VSC, lower DFF or RTC.', 'Be fast, precise, untouchable: raise DFF, lower VSC.', 'Catalyse, craft, burst: raise RTC, lower VSC or AFF.', 'Notice, know, be unfooled: raise OSM, lower AFF or VSC.', 'Lead, bond, command, negotiate: raise AFF, lower OSM or DFF.', 'Grade ladder: 1 starved, 2 workable, 3 competent, 4 specialist, 5 colony-famous, 6 Nucleoid-grade (not available at creation).'],
    table: 'Player: "I want to be hard to catch." Director: "Then Diffusion goes up and Viscosity pays for it. That is a thin body."', keys: 'VSC DFF RTC OSM AFF array grade baseline score' },
  { id: 'make-phenotype', ch: 'Atlas 1 · Step 3', name: 'Step 3: choose a Phenotype (your class)', plain: 'A Phenotype is what you are good at doing with your body. It gives you a Hull, set Pathway ranks, one resource only you have, and a new feature at each Stage.',
    when: 'Making a character, or considering a change of direction.', who: 'Player chooses; Director says what it costs if it is outside the Lineage.',
    rule: ['Twenty-four Phenotypes, grouped by Lineage tradition.', 'Each gives a Hull (3, 4 or 6, part of your MI), class Pathways at fixed ranks, a Signature Mechanic, one feature per Stage (I at Level 1, II at 6, III at 11, IV at 16), a Bonded Domain (which may override your Lineage), and a starting kit.', 'A Phenotype outside your Lineage is legal but costs you: your Lineage Gift works once per Tide instead of once per scene, and one faction two rungs away notices.', 'Mixed organisms are common in the Hegemony and suspicious everywhere else.'],
    table: 'Player: "Can a Barophil be a Current Rider?" Director: "Yes. Your Hardened gift will only work once a Tide, and someone in the Flow Guilds is going to wonder why."', keys: 'class phenotype hull signature outside lineage multiclass' },
  { id: 'make-pathways-kit', ch: 'Atlas 1 · Steps 4-5', name: 'Steps 4 and 5: Pathways and kit', plain: 'Your Phenotype gives you skills at set ranks; you choose two more. Then you spend 40 Substrate on gear, or go into debt for more.',
    when: 'Making a character.', who: 'Player chooses; Engine totals the cost.',
    rule: ['Take your Phenotype\'s Pathway ranks, then choose two additional Pathways at rank 1 (Expressed). Maximum rank 4 (Sovereign), never above 2 at creation.', 'You have 40 Substrate at Level 1. You may buy one Apparatus, one graft and Vials.', 'If you cannot afford your idea, write the debt: a Hegemony licence loan is 100 S at 5 S per Beat and cannot be escaped by dying (Core XII).'],
    table: 'Player: "I want the Harvest Claw but it is ninety." Director: "Then take the loan. Starting in debt is a good way to give me a story to tell you."', keys: 'kit substrate loan licence debt starting gear pathway rank expressed' },
  { id: 'make-three-things', ch: 'Atlas 1 · Step 6', name: 'Step 6: a name, an Oath and a Vector', plain: 'Three things to write down that make your character belong to the world: what they smell like, one promise they have already made, and the job that sent them.',
    when: 'Making a character. The Director uses all three through play.', who: 'Player writes; Director holds them to it.',
    rule: ['A chemical name: a scent-phrase. "Siss-of-the-Nine-Smells" is a name; "Bob" is a rumour.', 'One Oath: a promise already folded into your chromatin. You have Oath boxes equal to your AFF Grade; this Oath uses one. Say what it forbids.', 'One Vector: the task that transmits you. Who hired you, what you were paid, and why you have not finished it.'],
    table: 'Player: "My Oath is that I deliver what I am given, even to a hostile." Director: "Good. I will test it on you."', keys: 'name oath vector job backstory' },
  { id: 'make-derived', ch: 'Atlas 1 · Step 7', name: 'Step 7: work out your derived numbers', plain: 'The numbers you actually use at the table, all worked out from your Baselines and Hull.',
    when: 'Making a character. The Engine does this for you in the game; at a paper table, do it once.', who: 'Engine, or the player on paper.',
    rule: ['MI = 12 + (VSC x 4) + Hull + 0 (at Level 1).', 'ATP max = 8 + (RTC x 2).', 'PP = 2 + DFF (typically 4).', 'MT = 10 + DFF + graft modifiers.', 'Flow = 3 + DFF Drifts.', 'Countdown boxes = VSC + ceil(Hull / 2) + 2.', 'Graft Slots = 1.', 'Homeostatic Baseline per pool = 3 x dice.', 'Stress track = 0 of 8.'],
    table: 'Player: "How many hits can I take?" Director: "That is your MI. Viscosity times four, plus your Hull, plus twelve."', keys: 'MI ATP PP MT flow countdown slots stress derived numbers formula' },
  { id: 'make-higher', ch: 'Atlas 1 · Step 8', name: 'Step 8: starting higher than Level 1', plain: 'A table can begin at a higher Stage. You take every Stage feature up to that point, more money, one better graft, and more Codon.',
    when: 'Starting a game above Level 1.', who: 'Director sets the Level; player takes the features.',
    rule: ['Level 6 (Stage II): Stage I and II features, 150 S, one Uncommon graft, Codon 400.', 'Level 11 (Stage III): Stage I to III features, 500 S, one Rare graft, Codon 1300.', 'Level 16 (Stage IV): everything, 1,600 S, one Very Rare item, Codon 2700.', 'Every Stage transition also grants +2 to one Baseline or +1 to a Pathway rank, and +6 max MI (Stage feature).'],
    table: 'Director: "We start at Level 6. You get both Stage features, a hundred and fifty Substrate and an Uncommon graft."', keys: 'higher level start stage 6 11 16 codon' },
  { id: 'worked-example', ch: 'Atlas 1', name: 'Worked example: Siss-of-the-Nine-Smells', plain: 'A whole character built step by step: a courier who delivers messages into places messages are not wanted, and who is very good at arriving fast and loudly.',
    when: 'You want to see the eight steps done once.', who: 'Player reads it.',
    rule: ['Lineage Flagellan (the Rowed): +1 DFF, -1 VSC; Gifts Current Sense and Rides It Out; Frailty Obligate Drifter; Bonded Domain Osmotic.', 'Baselines from 4, 4, 3, 3, 2: DFF 5, RTC 4, OSM 3, AFF 3, VSC 1. VSC 1 is a real cost: thin MI, and Siss cannot be pushed around without consequence.', 'Phenotype Current Rider: Hull 4, Bonded Osmotic, Fluid Navigation 2, Pulse Discipline 1, Concealment 1. Signature Mechanic: Slipstream.', 'Extra Pathways: Signal Discourse 1, Chemoreception 1.', 'Kit (40 S): Peptide Blade (20 S), Lipid Weave Wrap (20 S, free slot, soak 1, +5 MI).', 'Oath: "I will deliver what I am given, even to a hostile." Vector: a sealed packet addressed to a colony that officially does not exist.', 'Derived: MI 25 (12 + 4 + 4 + 5 from the Wrap), ATP 16, PP 7, MT 15, Flow 8 Drifts, Countdown 5, Slots 1.', 'In play: Siss is extremely hard to catch, hits for 3 BD with a blade, survives about six solid hits, and cannot win a shoving contest with a door.'],
    table: 'Director: "The first time something corners Siss, the whole table should hold its breath."', keys: 'siss example courier rider character' },
];

const LINEAGE_PLAIN = {
  Amoeban: 'The shapeshifters. No fixed body, brilliant chemists and thieves, and nobody quite trusts them.',
  Epithalian: 'The builders. They grow in layers, make the walls and sign the toll contracts, and are hard to move.',
  Flagellan: 'The swimmers. Fast, restless couriers who shrug off strain, but who lose their turn if they stand still.',
  Lysosan: 'The carriers. Spies and information brokers who can hold a condition for later, and whom every gate can tell is not standard.',
  Immunan: 'The registrars. They mark who belongs and who does not, they are the law, and they cannot lie.',
  Barophil: 'The extremophiles. Slow, dense and patient, hardly troubled by the environment, and rarely first to act.',
};

const lineageCards = ATLAS_LINEAGES.map((l) => ({
  id: l.id, ch: 'Atlas 2', name: `${l.name}, ${l.epithet}`,
  plain: LINEAGE_PLAIN[l.name] || l.para,
  when: `Choosing a Lineage, or a player has a ${l.name}.`, who: 'Player chooses; Engine applies the Baseline change and the Gift.',
  rule: [l.para, ...l.bullets],
  table: l.bullets.find((b) => /^Viewed as/.test(b)) || '', keys: `${l.name} ${l.epithet} lineage gift frailty body plan`,
}));

const TRADITION_CARD = {
  id: 'traditions', ch: 'Atlas 3', name: 'The six traditions of Phenotypes', plain: 'Each Lineage has a usual path of four classes. Taking one from another tradition is legal, costly and visible.',
  when: 'Picking a Phenotype, or explaining the shape of the classes.', who: 'Player chooses.',
  rule: ATLAS_TRADITIONS.map((t) => `${t.name} (${t.tagline}): ${t.intro}`),
  table: 'Player: "Why are there six lots of four?" Director: "One tradition for each Lineage. Step outside yours and someone notices."', keys: 'tradition phenotype class list lineage path',
};

const phenoCards = ATLAS_PHENOTYPES.map((p) => {
  const first = p.play.replace(/^you are /i, 'You are ');
  return {
    id: p.id, ch: `Atlas 3 · ${p.tradition} tradition`, name: p.name,
    plain: first.charAt(0).toUpperCase() + first.slice(1),
    when: `Choosing or running a ${p.name}.`, who: 'Player runs the Signature Mechanic track; Engine counts it.',
    rule: [p.meta, `Granted Pathways: ${p.pathways}`, `Signature Mechanic, ${p.sigName}: ${p.sig[0] || ''}`, ...p.sig.slice(1).map((r) => `${/^\d/.test(r) ? 'Spend ' : ''}${r}`), ...p.stages, `Kit: ${p.kit}`],
    table: p.links ? `Works with: ${p.links}` : '', keys: `${p.name} ${p.tradition} ${p.sigName} ${p.stages.map((s) => s.replace(/^Stage [IV]+ — /, '').split('.')[0]).join(' ')}`,
  };
});

const ADVANCE = [
  { id: 'growth', ch: 'Atlas 4.1', name: 'Growth and Synthesis Choices', plain: 'When you earn enough Codon you grow at the next rest, and you get to choose one way to change.',
    when: 'Your Codon total crosses the next threshold.', who: 'Player chooses; Engine applies.',
    rule: ['You Grow when your Codon crosses the next threshold (Core II 2.3). Growth happens at the next Reconstitution.', 'You always get +2 max MI, +1 Bulk capacity, and any Phenotype features for your new Level.', 'Then choose one Synthesis Choice: +1 Baseline Grade (max 6, one per Growth); +1 Pathway rank (max 4); learn a Burst; take an Adaptation; take a Harvest trait from a Specimen you hold (a graft that takes a Slot); craft or buy gear at a discount.'],
    table: 'Director: "You reached a thousand Codon. At the next rest you grow. What changes?"', keys: 'level up growth codon synthesis choice advancement' },
  { id: 'adaptations', ch: 'Atlas 4.2', name: 'Adaptations', plain: 'One-time body decisions that are permanent and cheap, and the fastest way to make two organisms of the same class play differently.',
    when: 'Taking a Synthesis Choice.', who: 'Player chooses and pays; Engine applies.',
    rule: ['Each Adaptation costs one Synthesis Choice plus the Substrate or Specimens listed.', ...ATLAS_ADAPTATIONS.map((a) => `${a.name} (${a.cost}): ${a.effect} Wants it: ${a.wants}.`), 'Chimeric Growth is the multiclass rule. It grants one Stage I feature, not the class\'s Hull, and cannot be taken twice for the same Phenotype. At Stage IV a second Chimeric Growth for the same Phenotype gives its Stage II feature.'],
    table: 'Player: "I want to survive being pushed." Director: "Denser Wall, sixty Substrate, six more MI, one less Flow."', keys: 'adaptation multiclass chimeric growth denser wall twin reserve second organ' },
  { id: 'stage-change', ch: 'Atlas 4.3', name: 'Stage transitions', plain: 'At Levels 6, 11 and 16 your body changes. You get a new class feature, more MI and a free choice, and other people start treating you differently.',
    when: 'You reach Level 6, 11 or 16.', who: 'Player describes the change; Director uses it.',
    rule: ['Your Phenotype\'s Stage feature unlocks.', '+6 max MI and +1 Graft Slot.', 'One free Synthesis Choice that does not compete with your normal one.', 'Describe the change and choose one visible consequence the Director may use: a new scent, a changed size class, a readable Oath mark, a limp that is actually a weapon. Say who notices.', 'At Level 20 you are Stage IV, and the Core\'s Apotheosis track (Ch. XII) becomes available.'],
    table: 'Director: "Level six. Your body changes. What do people see, and who sees it first?"', keys: 'stage level 6 11 16 20 transition apotheosis body event' },
  { id: 'striker-progression', ch: 'Atlas 4.4', name: 'Worked progression: Kinetic Striker, Levels 1 to 20', plain: 'One class followed from start to finish, so you can see what a campaign does to a character.',
    when: 'Planning your growth path.', who: 'Player reads it.',
    rule: ['Level 1: Stage I Long Run. DFF 4, Momentum at 2 Drifts, Flow 6.', 'Level 2: Adaptation Momentum Banker. Level 3: Membrane Penetration 3 (attack pool 7d). Level 4: Burst Pressure Slap. Level 5: DFF 5 (PP 7, MT 15).', 'Level 6: Stage II Riposte of Arrival, +6 MI, +1 Slot; Adaptation Twin Reserve.', 'Levels 7 to 10: VSC 4, Membrane Penetration 4, Denser Wall, Burst Hypertonic Field (Vortex Lure at 11).', 'Level 11: Stage III Cascade Collection; Adaptation Overdrive Training.', 'Levels 12 to 15: VSC 5, Harvest Hands, +1 AFF, Graft Mastery.', 'Level 16: Stage IV Unanswered Motion; Adaptation Second Organ (a free death).', 'Levels 17 to 20: Baselines to 6, Pathway to Sovereign, Chimeric Growth (Osmotic Brute Stage I: Immovable).'],
    table: 'Player: "What does a Striker look like at the end?" Director: "One who cannot be pushed and arrives twice."', keys: 'kinetic striker progression levels example' },
];

const KITS = [
  { id: 'starting-packs', ch: 'Atlas 5.1', name: 'Starting packs', plain: 'Six ready-made shopping lists for 40 Substrate, for players who do not want to browse.',
    when: 'Buying kit at Level 1.', who: 'Player chooses.',
    rule: ['Waller: Chitin Flail (15), Lipid Weave (20), 1 Glucose Ampule (3). For Guard, Tank, Brute.', 'Lash: Peptide Blade (20), Reinforced Weave (60, take the loan), 2 Amino Drip (12). For Corrosor, Striker, Splicer.', 'Shot: Spore Pistol (30), 1 spore reload (3), Lipid Bead Vial. For Archer, Scout, Navigator.', 'Hand: Harvest Claw (90, loan), Glucose Fragment kit, Scribe Slug symbiote later. For Reclaimer, Smith, Constructor.', 'Signal: Needle Dagger (40), Pheromone Trace x2 (10), Signal Dampener Sac (55, loan). For Messenger, Detector, Mimic.', 'Deep: Barbed Launcher (55), Salt Bloom (10), Osmotic Filter Scrap (55, loan). For Diver, Desiccation, Rider.', 'Loans are play: a Hegemony licence loan is 100 S at 5 S per Beat, chemical and permanent until paid. Starting in debt is the best way to give the Director a Vector.'],
    table: 'Player: "What should a Guard buy?" Director: "The Waller pack. Flail, wrap and a snack."', keys: 'pack waller lash shot hand signal deep starting gear loan' },
];

const buildCards = ATLAS_BUILDS.map((b) => ({
  id: b.id, ch: 'Atlas 5.2', name: `Build ${b.n}: ${b.name}`, plain: `${b.who}. ${(b.lines.find((l) => /^The one thing/.test(l)) || '').replace(/^The one thing:\s*/, '')}`,
  when: 'Looking for an example of a finished character.', who: 'Player reads it.',
  rule: b.lines, table: (b.lines.find((l) => /^Watch/.test(l)) || '').replace(/^Watch:\s*/, 'Watch for: '), keys: `build example ${b.who} ${b.name}`,
}));

const TAIL = [
  { id: 'cohort-jobs', ch: 'Atlas 5.3', name: 'Cohort composition: the seven jobs', plain: 'A group of four needs seven jobs covered. Not by four people: by coverage.',
    when: 'The table is choosing characters together.', who: 'Players, with the Director pointing out gaps.',
    rule: ['Anchor (soaks, protects): Phagocyte Guard, Acid-Resistant Tank, Osmotic Brute. Cheap: Epithalian Draw Tight, a Waller pack.', 'Opener (breaks defence): Membrane Breacher, Acidic Corrosor, Osmotic Brute. Cheap: Antigen Detector\'s epitope call.', 'Damage: Antibody Archer, Kinetic Striker, Thermal Diver. Cheap: Replicator Buds, Constructs.', 'Control (moves the map): Turbulence Navigator, Protein Weaver, Desiccation Specialist. Cheap: Bursts Vortex Lure, Tensile Cage, Hypertonic Field.', 'Support (dice and healing): Amino Acid Smith, Pheromological Messenger, Enzymatic Splicer. Cheap: Nurse Polyp symbiote, Cohesion spending.', 'Information (knows things): Antigen Detector, Ribozyme Engineer, Viral Mimic. Cheap: Chemoreception 2 on anyone, Memory Vials.', 'Face (talks, owes, swears): Pheromological Messenger, Complement Commander, Ribozyme Engineer. Cheap: an Oath and 20 S of samples.', 'The most dangerous gap is Information. A Cohort with no one who can read a Bestiary block fights Blind, and Blind costs Codon.'],
    table: 'Director: "Who in this group can read what the creature is? No one? Then buy someone a Chemoreception rank before the gate."', keys: 'cohort party composition anchor opener damage control support information face jobs roles' },
  { id: 'the-sheet', ch: 'Atlas 5.4', name: 'The sheet, field by field', plain: 'What to write where. The Expanse punishes forgetting.',
    when: 'Setting up a sheet, or the Director asks for a number.', who: 'Player keeps it; in the game the Engine keeps it for you.',
    rule: ['Top: name, Lineage, Phenotype, Stage, Level.', 'Baselines VSC, DFF, RTC, OSM, AFF, and a pool cheat line (Membrane Penetration, Catalysis, Fluid Navigation, Chemoreception).', 'MI current and maximum, Soak and its family, MT, PP, Flow.', 'ATP current and maximum, the Stress track, Countdown boxes, Slots used and total.', 'Codon, Substrate, Bulk, Specimens by grade (C, G, P, T).', 'Oath boxes, Bonds, Cohesion (group, out of 10).', 'Your Signature Mechanic track (Etch, Slip, Locks, Turgor, Gradient, Vectors and so on).', 'Grafts slot by slot with family and Minor Cost; conditions right now (cross them out when shed).', 'The three most-forgotten numbers are Stress, Countdown boxes and your Signature Mechanic\'s track. The Director may ask for them at any time and may remind you loudly.'],
    table: 'Director: "Where is your Stress right now?" Player: "Four." Director: "Good. Write it down before you ask for another roll."', keys: 'sheet character sheet fields stress countdown signature track' },
  { id: 'table-questions', ch: 'Atlas 5.5', name: 'Ten questions the table asks', plain: 'The ten rules questions players ask most, with the printed answers.',
    when: 'A player asks how a rule works.', who: 'Director answers.',
    rule: ['Do 1s still count as Inhibitors on a Burst? Yes, always. Bursts poison you too.', 'Can I spend Overflow on movement and damage? No. Overflow applies to the one attempt you made. Spend it where the attempt was.', 'Is my Homeostatic Baseline usable in combat? No. It requires unhurried and unopposed.', 'Do I get PP back if I Split Frequency? You keep unspent PP and re-enter later. It is gone at Cycle end either way.', 'Can Reactive Osmosis defend an ally? Only if a feature says so (Phagocyte Guard, Bonds, Twin Reserve with a Bond relay).', 'Does Soak apply to Overflow and BD separately? No. Once, to the total, after Overflow is counted. Minimum 1 damage on a hit.', 'Can I heal a Dormant ally? Only by stabilisation (RTC + Synthesis at AT 12 + their Level). Substrate Patch does not work on Dormant targets; Resynthesis Call does.', 'Do I keep gear when I Total-Lyse? The dead carries it. Carry them, or it stays with the body, and bodies are harvestable.', 'Can a Parasitic Graft be removed for free? No. Graft Antidote + Synthesis contest AT 16+, or a Nucleoid ritual.', 'What if I have no idea what to do in a Pulse War? In order: Vent, Drift to a better band, Sense, spend Cohesion to pass a die to someone else, then Strike. Never "wait". Waiting in a fluid is how you get dissolved.'],
    table: 'Player: "I have no idea what to do." Director: "Vent, drift to a better band, sense, pass a die to someone, then strike. Never wait."', keys: 'faq questions inhibitor overflow homeostatic split frequency soak dormant heal total lysis graft pulse war stuck' },
];

export const ATLAS = [...MAKING, ...lineageCards, TRADITION_CARD, ...phenoCards, ...ADVANCE, ...KITS, ...buildCards, ...TAIL];
