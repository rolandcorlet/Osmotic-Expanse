// Core Rulebook, Engine-ready edition. Source: "The Osmotic Expanse - CORE RULEBOOK.md"
// (chapters I, II.4, IV, V, VII.4, VIII.3, XI.4). Section numbers are the book's own.
// status: 'book' = stated in the book; 'house' = a ruling already made in play and coded in
// director/; 'proposed' = the book is silent or unclear and Roly has not ruled yet.
import { out, table, steps, bullets } from './lib.mjs';

const core = {
  meta: {
    title: 'The Catalytic Engine: Core Rulebook, Engine-ready edition',
    version: '0.1 draft, 15 November 2026',
    source: 'The Osmotic Expanse - CORE RULEBOOK.md',
    converted: ['I Resolution', 'II.4 Specimens', 'IV The Pulse Economy', 'V Breach, Stress and Lysis', 'VII.4 Hazards', 'VIII.3 Harvest', 'XI.4 Oaths'],
    notConverted: ['II.1-3 and II.5 economies in full', 'III Pathways', 'VI Bursts (24 records to write)', 'VII.1-3, 5-6 the fluid medium', 'VIII colony life', 'IX gear', 'X harvest table', 'XI.1-3, 5-7 dialogue', 'XII legacy'],
  },

  timing: [
    { id: 'turn', name: 'Turn', starts: 'an organism or creature receives its Pulse Points', ends: 'it ends its turn or has no Pulse Points and no pending roll', status: 'book', cite: '4.2' },
    { id: 'cycle', name: 'Pulse Cycle', starts: 'the first actor in Frequency order begins', ends: 'the last actor has ended its turn', note: 'About six seconds. Unspent Pulse Points and unspent Reserves are lost at the end.', status: 'book', cite: '4.2, 4.10' },
    { id: 'scene', name: 'Scene', starts: 'the Cohort arrives at a site, or the purpose or the people present change', ends: 'the place, the purpose or the people change', status: 'house', cite: '8.1; ledger hazard budget' },
    { id: 'fugue', name: 'Fugue Interval', starts: 'declared rest', ends: 'about an hour later', status: 'book', cite: '5.10' },
    { id: 'dormant-cycle', name: 'Dormant Cycle', starts: 'rest in a secured nest or cyst', ends: 'six hours later', status: 'book', cite: '5.10' },
    { id: 'beat', name: 'Metabolic Beat', starts: 'set by the Vector', ends: 'set by the Vector', note: 'A unit of downtime; each Vector states how long one is.', status: 'book', cite: '8.1' },
  ],
  oncePer: [
    { limit: 'once per Cycle', means: 'at most one use between the start of one Cycle and the start of the next; outside a Pulse War it is read as once per scene', status: 'house' },
    { limit: 'once per scene', means: 'at most one use until the scene ends', status: 'house' },
    { limit: 'once per encounter', means: 'refreshed only by a Dormant Cycle', status: 'book', cite: '5.10' },
  ],

  roll: {
    cite: '1.1',
    pool: 'Baseline Grade + Pathway Rank + modifiers (capped at +5 / -5 dice); never fewer than 1 die',
    poolMin: { value: 1, status: 'house', note: 'Ruling of 12 Nov 2026: a player always rolls something.' },
    read: ['Each 1 is an Inhibitor: it scores 0 and marks 1 Stress on the roller.', 'Total = sum of the other dice.', 'Success if Total >= Threshold.', 'Overflow = Total - Threshold, on a success.', 'Runaway Catalysis: no 1s and at least two 6s. Effect Value counts twice (before soak) and the Rider applies.'],
    noRoll: { name: 'Homeostatic Baseline', rule: 'Unopposed and unhurried: succeed without rolling if pool x 3 >= Threshold.', cite: '1.6' },
    onFailure: { cite: '1.9', choose: ['cost: it works, at a printed price', 'turn: it fails and the situation moves', 'complication: it works for the wrong party'], note: 'The site or creature record should print which applies; if none is printed the default is "turn".', status: 'proposed' },
    contest: { cite: '1.5', rule: 'Both roll. Higher total wins; ties go to the defender. The winner gets the difference as Overflow. Attacks are never contests: they roll against Membrane Threshold.' },
  },

  ladder: [
    { at: 8, id: 'common', name: 'Common', when: 'Any organism with the Pathway can do this under pressure.' },
    { at: 12, id: 'standard', name: 'Standard', when: 'A competent specialist does this more often than not.' },
    { at: 16, id: 'severe', name: 'Severe', when: 'Needs real mastery, good tools or a plan.' },
    { at: 20, id: 'extreme', name: 'Extreme', when: 'Hegemony engineering; colony-wide effort.' },
    { at: 24, id: 'nucleoid', name: 'Nucleoid', when: 'The Sacred Code itself leans in.' },
    { at: 28, id: 'apotheotic', name: 'Apotheotic', when: 'One organism per generation.' },
  ],
  ladderRule: { rule: 'A Threshold for a task is always a rung of the ladder, a creature\'s printed number, or a number printed on a site. Odd numbers (14, 15) come only from printed records. The Director picks a rung by name, never a number.', status: 'proposed', why: 'Benches showed Thresholds of 14 and 16 chosen on the spot; 1.2 already says difficulty is fixed.' },

  // The closed list. by: 'engine' = applied automatically from state; 'site' = printed on the site
  // or zone; 'gear' = printed on the item; 'director' = the Director may pick it, by id, when its
  // trigger is true. Nothing outside this list may change a pool.
  modifiers: [
    { id: 'stress', label: 'Injured (Stress 3 / 5 / 6)', dice: [-1, -2, -3], by: 'engine', trigger: 'the roller\'s Stress track', cite: '1.3, 5.8' },
    { id: 'tool', label: 'Tool made for the task', dice: [1, 2], by: 'gear', trigger: 'the item names the task', cite: '1.3' },
    { id: 'assist', label: 'Assisted by a trained ally', dice: [1], max: 2, by: 'engine', trigger: 'an ally with the same Pathway, in reach, says they help', cite: '1.3, 1.7' },
    { id: 'advantage', label: 'Good position or prepared reagents', dice: [1], by: 'director', trigger: 'the player has used a zone, an interactable or an earlier success that the site record tags as an advantage for this action', cite: '1.3', status: 'proposed', why: 'Kept as a Director choice but tied to a printed tag, so it cannot be invented.' },
    { id: 'wrong-tonic', label: 'Working in the wrong tonic', dice: [-1, -2], by: 'site', trigger: 'the site\'s tonic against the roller\'s Lineage', cite: '1.3, 7.2' },
    { id: 'cover-partial', label: 'Target in partial cover', dice: [-2], by: 'site', trigger: 'the target\'s zone grants partial cover', cite: '1.3' },
    { id: 'cover-heavy', label: 'Target in heavy cover', dice: [-4], by: 'site', trigger: 'the target\'s zone grants heavy cover', cite: '1.3' },
    { id: 'squeezed', label: 'Squeezed, pinned or in a vortex', dice: [-2], by: 'engine', trigger: 'the roller is in a zone, or under a condition, tagged squeezed', cite: '1.3' },
    { id: 'catalysed', label: 'Catalysed', dice: [1], by: 'engine', trigger: 'a Vial, ally Burst or graft names this roll', extra: 're-roll one 6 if it comes up 1', cite: '1.3' },
    { id: 'momentum', label: 'Momentum', dice: [2, 3], by: 'engine', trigger: 'Drifted 3+ Drifts in a line then Struck in the same Cycle (+3 if the Drift began in a Nutrient Current); the Strike becomes Kinetic', cite: '4.3' },
    { id: 'marked', label: 'Target is Marked', dice: [2], by: 'engine', trigger: 'the target has Marked', cite: '4.7' },
    { id: 'overdrive-atp', label: 'Overdrive (4 ATP)', dice: [2], by: 'engine', uncapped: true, trigger: 'the roller pays; once per roll', cite: '1.8' },
    { id: 'overdrive-mi', label: 'Overdrive (4 MI)', dice: [4], by: 'engine', uncapped: true, trigger: 'the roller pays and marks 1 Stress; once per roll', cite: '1.8' },
    { id: 'inhibited', label: 'Inhibited by a foe', dice: [-2], by: 'engine', trigger: 'a foe spends 3 ATP and a Reserve', cite: '1.8, 4.10' },
    { id: 'flank', label: 'Flank Breach', overflow: 1, by: 'engine', trigger: 'a free Strike on a foe leaving Contact', cite: '4.11' },
  ],

  overflow: [
    { attempt: 'attack', buys: 'extra damage, 1 for 1', by: 'engine' },
    { attempt: 'movement or pursuit', buys: 'extra Drifts, or one band of distance', by: 'engine' },
    { attempt: 'manipulation or crafting', buys: 'one grade of quality per 4 Overflow', by: 'engine' },
    { attempt: 'social', buys: 'one concession from the record\'s printed list', by: 'director' },
    { attempt: 'stealth', buys: '-1 to be noticed per 2 Overflow', by: 'engine' },
    { attempt: 'repair', buys: 'extra MI restored, 1 for 1', by: 'engine' },
  ],

  bands: [
    { id: 'contact', name: 'Contact', drifts: '0', reach: 'touch, lash, engulf' },
    { id: 'near', name: 'Near', drifts: '1-3', reach: 'short lash, thrown spore' },
    { id: 'mid', name: 'Mid', drifts: '4-9', reach: 'projector, spray, lunge' },
    { id: 'far', name: 'Far', drifts: '10-20', reach: 'arc, torrent, cascade; turbid fluid cuts it to Near' },
    { id: 'loose', name: 'Loose', drifts: '21+', reach: 'area, current-borne or scent-borne effects only' },
  ],
  bandShift: { rule: 'A band shift moves a body one band along contact > near > mid > far > loose. Outward unless the record names a direction. Two shifts from different effects in the same step add together; a body cannot go past Loose or inside Contact.', status: 'proposed' },

  actions: [
    { id: 'drift', name: 'Drift', pp: 1, does: 'Move up to Flow (3 + DFF Drifts). Also: stand, draw a graft, pass a Vial, break a hold (contested VSC).', legal: 'own turn, has 1 PP, not Sequestered or Encysted' },
    { id: 'vent', name: 'Vent', pp: 1, atp: 2, does: 'Stress -2. Ends Turgid and Overclocked.', legal: 'own turn' },
    { id: 'sense', name: 'Sense', pp: 1, does: 'OSM + Chemoreception against hidden things; a success against a Masked foe ends Masked.', legal: 'own turn' },
    { id: 'strike', name: 'Strike', pp: 2, ppExtra: 'Heavy Apparatus +1', does: 'One attack against Membrane Threshold.', legal: 'own turn; target in the weapon\'s reach' },
    { id: 'synthesise', name: 'Synthesise', pp: 2, does: 'Apply a Vial, seal a pore (ends Leaking), patch Brittle, remove a Lodged weapon, stabilise a Dormant ally at Contact, harvest, set a trap.', legal: 'own turn' },
    { id: 'burst', name: 'Burst', pp: '3-5', atp: 'same as PP', does: 'Activate an Enzymatic Burst.', legal: 'own turn; not Locked' },
    { id: 'reserve', name: 'Reserve', pp: 1, does: 'Hold 1 PP for one reaction this Cycle.', legal: 'own turn; one Reserve held at a time' },
    { id: 'end-turn', name: 'End turn', pp: 0, does: 'Unspent PP are lost unless Split Frequency is declared.', legal: 'own turn, no pending roll' },
    { id: 'yield', name: 'Yield', pp: 'all', does: 'Signal surrender for the whole Cycle. Killing a yielding organism marks 2 Stress on every witness and Cohesion -1.', legal: 'own turn' },
  ],
  reactions: [
    { id: 'deflect', name: 'Deflect', cost: '1 held PP', does: 'Membrane Threshold +4 against one incoming attack.', when: 'an attack is declared on you' },
    { id: 'inhibit', name: 'Inhibit', cost: '1 held PP (+3 ATP for the stronger form)', does: 'An attacker in Contact or Near re-rolls one die; or, for 3 ATP, rolls 2 fewer dice.', when: 'a hostile roll is declared and you can perceive it' },
    { id: 'brace', name: 'Brace', cost: '1 held PP', does: 'Halve Kinetic and Osmotic damage from one effect (after soak, round down, minimum 1); ignore its push.', when: 'damage is about to land' },
    { id: 'shed', name: 'Shed', cost: '1 held PP', does: 'End Locked, Turgid or Marked on yourself.', when: 'any time in the Cycle' },
    { id: 'flank-breach', name: 'Flank Breach', cost: '1 held PP', does: 'One free Strike at +1 Overflow.', when: 'a foe Drifts out of your Contact band' },
  ],
  reactionRule: 'One reaction per Cycle per body. A held Reserve not spent is lost at the end of the Cycle.',

  // mods: numbers the Engine applies while the condition is on. ends: every way it comes off.
  conditions: [
    { id: 'Leaking', mods: { miPerTurn: -1 }, ends: ['Synthesise action', 'Somatic Burst'], say: 'losing itself into the water, leaving a trail' },
    { id: 'Turgid', mods: { dff: -2, mt: -2, tempMi: 5 }, ends: ['tonic normalises', 'Vent', 'Shed'], say: 'swollen tight' },
    { id: 'Flaccid', mods: { vsc: -2, reachBands: -1 }, ends: ['end of next Cycle'], timed: true, say: 'gone slack and small' },
    { id: 'Jostled', mods: { pp: -1, mt: -2 }, ends: ['end of next Cycle'], timed: true, say: 'knocked off its line' },
    { id: 'Denatured', mods: { rtc: -2, burstEffect: 'half' }, ends: ['RTC save at end of own turn'], say: 'chemistry scrambled' },
    { id: 'Catabolic', mods: { atpCost: 1, atpRegen: 'half' }, ends: ['Reconstitution'], say: 'burning through itself' },
    { id: 'Locked', mods: { noBurst: true }, ends: ['save each Cycle', 'Shed'], say: 'one of its tools held shut' },
    { id: 'Sequestered', mods: { cannotAct: true }, ends: ['an ally breaks the cage', 'VSC save at -2 dice each Cycle'], say: 'caged' },
    { id: 'Hijacked', mods: { reserveStolen: true }, ends: ['OSM save', 'the hijacker is killed or revealed'], say: 'something else has a hand on it' },
    { id: 'Masked', mods: { untargetableByScent: true }, ends: ['you Strike', 'a foe\'s successful Sense'], say: 'gone from the water\'s taste' },
    { id: 'Marked', mods: { attackersDice: 2, cannotGain: ['Masked'] }, ends: ['the marker is killed', '2-ATP scrub', 'Shed'], say: 'lit up for everyone' },
    { id: 'Brittle', mods: { soakVsKinetic: 'half', lyticIgnoresSoak: 2 }, ends: ['Synthesise action with a Lipid patch'], say: 'crazed like old glass' },
    { id: 'Overclocked', mods: { pp: 1, stressPerCycle: 2 }, ends: ['Vent', '3 Cycles pass'], say: 'running too hot' },
    { id: 'Encysted', mods: { damage: 'half', cannotAct: true, cannotBeMoved: true }, ends: ['3 ATP from self or an ally'], say: 'sealed in a shell' },
    { id: 'Bloom', mods: { miPerCycle: 2, sensedWithin: 'mid' }, ends: ['Reconstitution', 'hostile scrub'], say: 'flowering, loud to every nose' },
    { id: 'Lodged', mods: { dff: -1 }, ends: ['Synthesise action (removal deals 4 damage)'], say: 'a weapon stuck in it', status: 'house', note: 'From the Apparatus property; coded in director/.' },
    { id: 'Braced', mods: { usesBracedSoak: true }, ends: ['you Drift'], say: 'set and not moving', status: 'house' },
  ],
  conditionRule: { rule: 'A condition is on or off: the same condition does not stack. A new application of a timed condition restarts its timer.', status: 'proposed' },

  damage: {
    cite: '4.8, 5.2',
    hit: 'Total >= target Membrane Threshold',
    formula: 'Overflow + Effect Value (twice on a Runaway) + Apparatus BD - Soak, minimum 1',
    membraneThreshold: '10 + DFF + graft, size, cover and condition modifiers; a stationary object 5, or 8 if braced',
    breach: 'A hit that exceeds remaining MI by 8 or more: straight to Dormant and mark 1 Countdown box at once.',
    swarm: 'A hit on a swarm removes ceil(Overflow / 3) + 1 Segments instead of MI. A swarm gets 1 Strike per 2 Segments.',
  },
  damageTypes: [
    { id: 'Kinetic', consequences: ['push 1 Drift per 4 Overflow', 'break a graft slot', 'Jostled'] },
    { id: 'Lytic', consequences: ['Brittle', '-1 soak until repaired (max -3)', 'dissolve one Vial'] },
    { id: 'Osmotic', consequences: ['Turgid or Flaccid', 'knock into the next band', 'Fluid Navigation save or be swept by the nearest current'] },
    { id: 'Thermic', consequences: ['the target\'s zone is a Hazard for 1 Cycle', 'Catabolic', 'cannot be healed next Cycle'] },
    { id: 'Voltaic', consequences: ['Locked or Overclocked', 'interrupt a Sustained Reaction', 'Marked'] },
    { id: 'Genetic', consequences: ['Hijacked', 'steal one Vial or held Specimen', 'Sequence save or lose a class feature for 2 Cycles'] },
  ],
  consequenceRule: { rule: 'On a hit the attacker picks one consequence from the type\'s list. A creature\'s record prints which one it always picks, so the Engine applies it and the Director never sets a condition by hand.', status: 'proposed', why: 'Benches: the Director called set_condition itself after creature hits (Brittle, Jostled).' },
  typeNote: { text: 'The book writes both "Thermal" (4.8, 5.3) and "Thermic" (4.9) for the same type. One id is needed.', status: 'proposed', proposal: 'Thermic' },

  // What a body may do in each state. The Engine offers only what is allowed.
  states: [
    { id: 'up', name: 'Up', may: ['act', 'react', 'roll', 'harvest', 'speak', 'be healed'], cite: '5.1' },
    { id: 'dormant', name: 'Dormant (0 MI)', may: ['speak one short signal', 'make a save at Baseline 1 when an effect forces one', 'be moved or carried', 'be stabilised'], mayNot: ['take any action', 'react', 'harvest', 'be asked for a throw of its own', 'be healed above 0 except by stabilisation'], each: 'At the start of each of its turns: lose 1 MI (already 0) and mark 1 Countdown box.', cite: '5.4', note: 'Whether a Dormant organism can speak is not stated: proposed as one short signal.', status: 'proposed' },
    { id: 'stabilised', name: 'Stabilised', may: ['everything Up may'], note: 'Back above 0 MI. Countdown boxes stay marked until a Dormant Cycle.', cite: '5.5' },
    { id: 'lysed', name: 'Total Lysis', may: ['be harvested at full value'], mayNot: ['anything else'], cite: '5.6' },
  ],
  stabilise: { action: 'synthesise', where: 'Contact', pool: 'RTC + Synthesis', threshold: '12 + target Level', success: 'target MI = Overflow + 4; close 1 Countdown box', cite: '5.4' },
  countdown: { boxes: 'VSC + ceil(Hull / 2) + 2', fill: 'Total Lysis', marks: ['1 per turn while Dormant', '1 on a Breach', '2 on Autophagic Collapse', '+1 per Cycle in Autophagy', '2 on breaking an Oath'], cite: '5.5' },
  stress: {
    cite: '5.8', max: 8,
    track: [{ at: 3, dice: -1 }, { at: 5, dice: -2, note: 'no Overclocked benefit' }, { at: 6, dice: -3, atpCost: 1 }, { at: 7, note: 'next failed roll: roll on the Cascade table' }, { at: 8, note: 'Autophagic Collapse: mark 2 Countdown boxes, Stress drops to 5' }],
    clear: ['-1 at the end of a Cycle with no ATP spent and no damage taken', '-2 for a Vent', 'all at a Reconstitution', 'all at a Chemotactic Rite'],
    cascade: ['Spill: lose 1d6 ATP; next Burst this scene +2 ATP', 'Seizure: lose all PP this Cycle; no Reserve until next turn', 'Misfire: the failed action resolves at half value against you or the nearest ally', 'Flare: Marked until the end of the next Cycle; no Concealment this scene', 'Tear: 1d6 damage ignoring soak, and Leaking', 'Runaway Inhibition: mark 1 more Stress'],
  },
  recovery: [
    { id: 'vent', time: '1 PP, 2 ATP', does: 'Stress -2' },
    { id: 'reconstitution', time: '1 Fugue Interval', does: 'Full ATP; Stress 0; heal VSC + Hull MI; clears Catabolic and Bloom' },
    { id: 'dormant-cycle', time: '6 hours, secured', does: 'Full MI; clear Countdown boxes; refresh once-per-encounter features' },
  ],

  pulseWar: {
    cite: '4.1, 4.2, 4.14',
    states: [
      { id: 'detection', does: 'Each side: OSM + Chemoreception against the other\'s DFF + Concealment. Win by 4+: First Volley (that side acts once, no reactions). Tie: both startled, skip a Cycle.', next: ['frequency'] },
      { id: 'frequency', does: 'Each body rolls d6 + DFF + Pulse Discipline once for the encounter. Highest first; ties: more unspent PP, higher OSM, players.', next: ['cycle-start'] },
      { id: 'cycle-start', does: 'Timed conditions tick. Hazard budget for the Cycle opens.', next: ['turn'] },
      { id: 'turn', does: 'The actor receives PP = 2 + DFF + modifiers, then spends them on actions until it ends its turn.', next: ['turn', 'cycle-end'] },
      { id: 'cycle-end', does: 'Unspent PP and Reserves are lost. Stress -1 for bodies that spent no ATP and took no damage. Check the end conditions.', next: ['cycle-start', 'ended'] },
      { id: 'ended', does: 'Pulse Points stop existing. Pending rolls from the fight are cancelled.', next: [] },
    ],
    mayEndWhen: ['every creature at the site is destroyed, stood down (yielded, fled, has what it wanted) or was never hostile', 'every organism is Dormant, yielded or at Loose and unobserved for a Cycle'],
    endRule: { rule: 'The Engine ends the war by itself the moment an end condition is true. Nobody calls it.', status: 'proposed', why: 'Benches: end_pulse_war was called early eight times.' },
  },
  chase: {
    cite: '4.14',
    steps: ['Each Cycle, each side makes one Fluid Navigation roll at the terrain\'s Threshold.', 'The lower result (or the only failure) shifts one band in the pursuer\'s favour; if both fail, no change.', 'The pursued escape at Loose + 2 bands. The pursuers win at Contact.', 'After 6 Cycles in terrain the pursued knows better, the pursued escape.'],
    gaps: ['Who rolls for a group: the best pool with +1 per helper (as 1.7), or everyone? Proposed: each organism rolls for itself, and a carried Dormant body gives its carrier -1 die.', 'What happens to a Dormant, uncarried body: proposed, it is left behind and the site record says what that means.', 'The book says "the party escapes at Contact (grapple)", which reads as the pursuers catching up; proposed reading used above.'],
    status: 'proposed',
  },

  hazards: {
    cite: '7.4',
    numbers: 'damage 4 + 2 x tier per exposure; save 8 + 2 x tier',
    record: ['id', 'name', 'trigger (an event id, never a sentence)', 'clockGate {clock, at} or null', 'amount', 'type', 'targets: one | zone | site', 'save {pool, threshold, onSuccess: none | half} or null', 'conditions [ids]', 'bandShift', 'frequency: per-cycle | per-scene | once', 'afterFiring (what the scene becomes: e.g. start a chase)', 'counter (what a player can do about it)', 'exploit (how it can be turned)'],
    budget: { rule: 'A hazard fires at most once per Cycle inside a Pulse War and once per scene outside one, unless its record says "once". It never fires as the price of a successful roll.', status: 'house' },
    generic: [
      { id: 'pore-charge', trigger: 'pressure plate', effect: '8 + 2 x tier Osmotic, push 1 band', note: 'Detect: OSM at Standard.' },
      { id: 'enzyme-mine', trigger: 'contact', effect: 'Lytic; graft -1 soak' },
      { id: 'cavitation-snap', trigger: 'sudden pressure change', effect: 'Kinetic; Jostled' },
      { id: 'osmotic-sluice', trigger: 'a membrane gate opens', effect: 'everyone in the sluice: DFF save or thrown 2 bands and Osmotic damage' },
      { id: 'collapse', trigger: 'structure failure', effect: 'Kinetic; Sequestered (escape: VSC at 14)' },
      { id: 'necrotic-wind', trigger: 'current from a dead zone', effect: 'no regeneration; Catabolic' },
    ],
  },

  harvest: {
    cite: '2.4, 8.3',
    who: 'one organism that is Up, at Contact with the body or the site feature',
    cost: 'a Synthesise action in a fight, or 10 minutes outside one; 1 Bulk',
    pool: 'OSM or RTC (the harvester chooses), + Synthesis',
    threshold: 'tier x 4 + 8, or the record\'s printed number',
    noRoll: 'outside a fight and unhurried: Homeostatic Baseline applies',
    success: 'the record\'s Specimens by grade',
    failure: 'the sample is ruined: Substrate instead (1 Common = 5 S)',
    sharing: { rule: 'Specimens go round a remembered picking order, one offer per item; each player takes or passes.', status: 'house' },
    grades: [{ id: 'C', name: 'Common Tissue' }, { id: 'G', name: 'Greater Organ' }, { id: 'P', name: 'Pristine Sequence' }, { id: 'T', name: 'Terminal Codon' }],
  },

  oaths: {
    cite: '11.4',
    steps: ['A player states the promise in their own words and to whom it is owed.', 'A witness with OSM 3+ must be present; the site record lists who can witness there.', 'Encoding takes a Chemotactic Rite: 1 Fugue Interval and 10 Substrate. The swearer marks Oath boxes = AFF.', 'The Engine files the Oath: words, owed to, witness, site.', 'Kept at a real cost: +1 Cohesion that scene.', 'Broken: mark 2 Countdown boxes, the witness faction drops one rung, roll Legacy Scarring.'],
    gaps: ['The First Carve lets a promise pay a toll on the spot, with no hour-long Rite. The Vector record should say when a quick oath is allowed and what it costs.', 'A promise "owed to nobody" cannot be filed: the step-2 witness is required.'],
    status: 'proposed',
  },

  // What the Director may say. never: must not be spoken to players in any form.
  tableWords: [
    { term: 'Reagent Pool, dice counts', say: 'how sure the hand is', never: true },
    { term: 'Activation Threshold, Membrane Threshold', say: 'how hard it is; how hard it is to land a blow', never: true },
    { term: 'Overflow', say: 'how cleanly it went', never: true },
    { term: 'Inhibitor', say: 'a hitch, a tremor', never: false },
    { term: 'Runaway Catalysis', say: 'the reaction feeds itself; it goes better than anyone meant', never: true },
    { term: 'Pulse Points', say: 'breath, what you have left this moment', never: false, note: 'A player may be told how many of their own they have.' },
    { term: 'Reserve / Reactive Osmosis', say: 'holding something back', never: false },
    { term: 'Membrane Integrity (a creature\'s)', say: 'its wound-ladder phrase', never: true },
    { term: 'Membrane Integrity (a player\'s own)', say: 'the number is theirs to hear', never: false },
    { term: 'Soak, BD, Effect Value', say: 'how much the armour took; how heavy the blow', never: true },
    { term: 'Metabolic Stress', say: 'the strain, the shake in the hands', never: false },
    { term: 'Autophagic Collapse', say: 'the body turns on itself', never: true },
    { term: 'Lysis Countdown', say: 'how long the body can hold', never: false },
    { term: 'Dormant', say: 'gone dark, drifting', never: false },
    { term: 'Lodged, Heavy, Braced (properties)', say: 'the blade stays in; it is slow to swing; it has set itself', never: true },
    { term: 'Minion, Standard, Elite, Boss; tier; BSP', say: 'nothing: describe the creature', never: true },
    { term: 'Encounter codes (E1-E5), section numbers, "the page"', say: 'nothing', never: true },
    { term: 'Deadly (encounter rating)', say: '"This is Deadly" before it starts, in those words', never: false },
    { term: 'Clocks (CARCASS, TOLL, HUNGER)', say: 'by name and by segment: players see them', never: false },
    { term: 'Bands (Contact, Near, Mid, Far, Loose)', say: 'by name', never: false },
    { term: 'Cycle', say: 'by name, or "a moment"', never: false },
  ],
  tableWordsStatus: 'proposed',

  rulings: [
    { id: 'pool-min-1', text: 'A pool never falls below one die.', status: 'house', date: '12 Nov 2026' },
    { id: 'brace-after-soak', text: 'Brace halves after soak, rounds down, never below 1.', status: 'house' },
    { id: 'creature-numbers', text: 'A creature\'s numbers are never shown or spoken to players.', status: 'house', date: '13 Nov 2026' },
    { id: 'hazard-budget', text: 'A hazard fires once per Cycle in a Pulse War, once per scene outside one.', status: 'house' },
    { id: 'hazard-not-on-success', text: 'A hazard never fires as the cost of a successful roll.', status: 'house' },
    { id: 'picking-order', text: 'Harvested Specimens are offered round a remembered picking order.', status: 'house' },
  ],

  openQuestions: [
    'Thermal or Thermic: which is the one name for the type?',
    'Can a Dormant organism speak? (Proposed: one short signal.)',
    'Chase: who rolls for a group, and what happens to a Dormant body nobody carries?',
    'Quick oaths: may a Vector let a promise be filed without the hour-long Rite, and at what cost?',
    'On a failed roll with no printed outcome, is the default "turn" (it fails and the scene moves)?',
    'Should the Engine end a Pulse War by itself when an end condition is met?',
    'Should each creature print its fixed Signature Consequence, so no condition is ever set by hand?',
    'The "advantage" modifier: is tying it to a printed tag acceptable, or should the Director keep free use of +1?',
    'Two band shifts at once: do they add? (Proposed: yes.)',
    'Do conditions stack with themselves? (Proposed: no; a timed one restarts.)',
  ],
};

out('core/core-rules.json', JSON.stringify(core, null, 1));

const st = (r) => (r.status && r.status !== 'book' ? ` *(${r.status})*` : '');
const md = `# ${core.meta.title}

Version ${core.meta.version}. Built from \`${core.meta.source}\`. The data is in \`core-rules.json\`; this file is the same content for reading.

This edition does not change how the game plays. It restates the rules the Engine must enforce as tables and steps, so nothing has to be read from a sentence at run time. Each entry is marked where it is not plain book text: *(house)* is a ruling already made in play, *(proposed)* is my reading where the book is silent and needs Roly's decision.

**Converted:** ${core.meta.converted.join('; ')}.
**Not yet converted:** ${core.meta.notConverted.join('; ')}.

## 1. Timing

${table(core.timing, [['Unit', 'name'], ['Starts when', 'starts'], ['Ends when', 'ends'], ['Note', (r) => `${r.note || ''}${st(r)}`], ['Core', 'cite']])}

${table(core.oncePer, [['Limit', 'limit'], ['Means', (r) => `${r.means}${st(r)}`]])}

## 2. The one roll (Core ${core.roll.cite})

**Pool:** ${core.roll.pool}.

${steps(core.roll.read)}

**No roll needed (${core.roll.noRoll.name}, Core ${core.roll.noRoll.cite}):** ${core.roll.noRoll.rule}

**Contests (Core ${core.roll.contest.cite}):** ${core.roll.contest.rule}

**On a failure (Core ${core.roll.onFailure.cite}):** one of: ${core.roll.onFailure.choose.join('; ')}. ${core.roll.onFailure.note} *(proposed)*

## 3. The Threshold ladder

${table(core.ladder, [['Threshold', 'at'], ['Name', 'name'], ['When', 'when']])}

${core.ladderRule.rule} *(proposed: ${core.ladderRule.why})*

## 4. Modifiers: the closed list

Modifiers add or remove dice, to a cap of +5 / -5. Bought dice (Overdrive) sit outside the cap. **Nothing outside this list may change a pool.** "Applied by" says who adds it: the Engine from state, the site or gear record, or the Director by picking its id when the trigger is true.

${table(core.modifiers, [['Id', 'id'], ['Modifier', 'label'], ['Dice', (r) => (r.dice ? r.dice.map((d) => (d > 0 ? `+${d}` : d)).join(' / ') : `Overflow +${r.overflow}`)], ['Applied by', 'by'], ['Trigger', (r) => `${r.trigger}${r.extra ? `; ${r.extra}` : ''}${st(r)}`], ['Core', 'cite']])}

## 5. Overflow

${table(core.overflow, [['Attempt', 'attempt'], ['Overflow buys', 'buys'], ['Decided by', 'by']])}

## 6. Bands

${table(core.bands, [['Band', 'name'], ['Drifts', 'drifts'], ['Reach', 'reach']])}

${core.bandShift.rule} *(proposed)*

## 7. Actions and reactions

${table(core.actions, [['Action', 'name'], ['PP', (r) => `${r.pp}${r.ppExtra ? ` (${r.ppExtra})` : ''}`], ['ATP', 'atp'], ['What it does', 'does'], ['Legal when', 'legal']])}

${table(core.reactions, [['Reaction', 'name'], ['Cost', 'cost'], ['What it does', 'does'], ['When', 'when']])}

${core.reactionRule}

## 8. Conditions

The numbers in "Engine applies" are added by the Engine while the condition is on. "Say" is the table word.

${table(core.conditions, [['Condition', (r) => `${r.id}${st(r)}`], ['Engine applies', 'mods'], ['Ends when', 'ends'], ['Say', 'say']])}

${core.conditionRule.rule} *(proposed)*

## 9. Attacks and damage (Core ${core.damage.cite})

- **Hit:** ${core.damage.hit}.
- **Damage:** ${core.damage.formula}.
- **Membrane Threshold:** ${core.damage.membraneThreshold}.
- **Breach:** ${core.damage.breach}
- **Swarms:** ${core.damage.swarm}

${table(core.damageTypes, [['Type', 'id'], ['Signature Consequences (the attacker picks one)', 'consequences']])}

${core.consequenceRule.rule} *(proposed: ${core.consequenceRule.why})*

${core.typeNote.text} *(proposed: use "${core.typeNote.proposal}")*

## 10. States of a body

${table(core.states, [['State', (r) => `${r.name}${st(r)}`], ['May', 'may'], ['May not', 'mayNot'], ['Note', (r) => [r.each, r.note].filter(Boolean).join(' ')], ['Core', 'cite']])}

**Stabilise (Core ${core.stabilise.cite}):** a ${core.stabilise.action} action at ${core.stabilise.where}; ${core.stabilise.pool} against ${core.stabilise.threshold}; on a success ${core.stabilise.success}.

**Lysis Countdown (Core ${core.countdown.cite}):** boxes = ${core.countdown.boxes}. Marks: ${core.countdown.marks.join('; ')}. When full: ${core.countdown.fill}.

## 11. Stress (Core ${core.stress.cite})

${table(core.stress.track, [['Stress', 'at'], ['Dice', 'dice'], ['ATP cost', 'atpCost'], ['Note', 'note']])}

**Clearing:** ${core.stress.clear.join('; ')}.

**Cascade (d6):** ${core.stress.cascade.map((c, i) => `${i + 1} ${c}`).join('. ')}.

## 12. Recovery

${table(core.recovery, [['Rest', 'id'], ['Time', 'time'], ['Does', 'does']])}

## 13. The Pulse War as states (Core ${core.pulseWar.cite})

${table(core.pulseWar.states, [['State', 'id'], ['What happens', 'does'], ['Next', 'next']])}

**The war may end when:**
${bullets(core.pulseWar.mayEndWhen)}

${core.pulseWar.endRule.rule} *(proposed: ${core.pulseWar.endRule.why})*

## 14. Chase (Core ${core.chase.cite}) *(proposed reading)*

${steps(core.chase.steps)}

Gaps in the book:
${bullets(core.chase.gaps)}

## 15. Hazards (Core ${core.hazards.cite})

**Numbers:** ${core.hazards.numbers}.

**A hazard record has these fields:** ${core.hazards.record.join('; ')}.

${core.hazards.budget.rule} *(house)*

${table(core.hazards.generic, [['Hazard', 'id'], ['Trigger', 'trigger'], ['Effect', 'effect'], ['Note', 'note']])}

## 16. Harvest (Core ${core.harvest.cite})

${table([core.harvest], [['Who', 'who'], ['Cost', 'cost'], ['Pool', 'pool'], ['Threshold', 'threshold']])}

- **No roll:** ${core.harvest.noRoll}.
- **Success:** ${core.harvest.success}. **Failure:** ${core.harvest.failure}.
- **Sharing:** ${core.harvest.sharing.rule} *(house)*
- **Grades:** ${core.harvest.grades.map((g) => `${g.id} ${g.name}`).join(', ')}.

## 17. Oaths (Core ${core.oaths.cite}) *(proposed steps)*

${steps(core.oaths.steps)}

Gaps:
${bullets(core.oaths.gaps)}

## 18. Table words *(proposed)*

What the Director says instead of the rules term. "Never" means the term or its number is not spoken to players in any form.

${table(core.tableWords, [['Rules term', 'term'], ['Say instead', 'say'], ['Never aloud', (r) => (r.never ? 'never' : 'allowed')], ['Note', 'note']])}

## 19. Rulings already made

${table(core.rulings, [['Id', 'id'], ['Ruling', 'text'], ['Date', 'date']])}

## 20. Open questions for Roly

${steps(core.openQuestions)}
`;
out('core/CORE-RULEBOOK-engine-ready.md', md);
