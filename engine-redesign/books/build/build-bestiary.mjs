// Lytic Bestiary and Director's Codex, Engine-ready edition.
// Source (read only): director/data/bestiary.json (68 blocks, already checked against the book),
// Bestiary "How to read a block" and tier templates, Codex 4.1 (BSP budgets).
// All 68 creatures get their numbers, parsed traits, specials and harvest as fields.
// The ten creatures of The First Carve are converted in full by hand (records, turn script,
// morale, wound ladder, words). The other 58 carry Order defaults, flagged `from: 'order-default'`,
// so nobody mistakes a default for a finished record.
import { out, table, steps, bullets, slug, root } from './lib.mjs';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = JSON.parse(readFileSync(join(root, '..', '..', 'director', 'data', 'bestiary.json'), 'utf8'));

// ---- Vocabulary for turn scripts (the Engine implements exactly these words) -------------------
const scriptWords = {
  when: [
    ['always', 'true'], ['first-turn', 'its first turn of the fight'], ['cycle:N', 'the Cycle number is N'], ['pp>=N', 'it has at least N Pulse Points'],
    ['foe-in:<band>', 'an organism that is Up is in that band of it'], ['no-foe-in-reach', 'no organism that is Up is within its attack band'],
    ['attached', 'it has a Barb or Lattice on a host'], ['corpse-in-contact', 'a destroyed creature or Dormant organism is in Contact'], ['corpse-at-site', 'one is anywhere at the site'],
    ['marked-foe-in:<band>', 'a Marked organism is in that band'], ['ally-hit-marked', 'an ally has just hit a Marked organism'], ['hurt', 'it is at "torn" or worse'], ['was-attacked', 'it was attacked since its last turn'],
    ['uses-left:<special>', 'the special has uses left'], ['did-hit', 'one of its Strikes hit this turn'], ['not-braced', 'it has not braced this Cycle'],
  ],
  target: [
    ['nearest', 'the closest organism that is Up; ties: lowest MI'], ['slowest', 'lowest Flow; ties: nearest'], ['loudest', 'highest Stress; ties: the last organism to roll'],
    ['marked', 'a Marked organism, else the nearest'], ['holding-reserve', 'an organism holding a Reserve; else nearest'], ['host', 'the organism it is attached to'], ['read-target', 'the organism it used Read on'], ['crosser', 'an organism that entered its Held zone, else the nearest in Contact'], ['struck', 'the organism it hit this turn'], ['corpse', 'the nearest destroyed creature or Dormant organism'], ['zone', 'the zone it stands in or guards'],
  ],
  do: [
    ['strike:<target>', 'Strike that target (as many Strikes as its Pulse Points and Segments allow)'], ['special:<id>:<target>', 'use that special'], ['drift:toward:<target>', 'Drift one band toward it'], ['drift:away', 'Drift one band outward'], ['drift:through', 'Drift one band along its line toward the far exit'],
    ['brace', 'take its Brace trait'], ['reserve', 'hold 1 Pulse Point as a Reserve'], ['announce', 'no action: the Director narrates its intent (a cue, costs nothing)'], ['end', 'end its turn'],
  ],
};

// ---- Order defaults, used where no hand record exists ------------------------------------------
const orders = {
  'Order I: Lytic Swarms': { wants: 'to eat', morale: { stops: 'never', note: 'Hunger does not frighten.' }, ladder: ['whole and seething', 'thinned at one edge', 'ragged, pieces peeling away', 'a loose scatter barely holding', 'one last cluster', 'drifting wreckage'] },
  'Order II: Protein Sentinels': { wants: 'to hold the line', morale: { stops: 'when its post is satisfied or gone', note: 'Stands down for a valid claim; the site says what counts.' }, ladder: ['square and unmarked', 'scored along one plate', 'a strut cracked, weeping', 'leaning, struts failing', 'one blow from folding', 'collapsed in pieces'] },
  'Order III: Nutrient Drifters': { wants: 'to feed and be gone', morale: { stops: 'flees at "failing", or once fed', note: 'It was never here to fight.' }, ladder: ['fat and unhurried', 'nicked, trailing a thread', 'torn, listing in the flow', 'half its bulk gone', 'a wisp', 'scattered on the current'] },
  'Order IV: Pathogenic Wraiths': { wants: 'to be someone else', morale: { stops: 'withdraws when revealed or at "failing"', note: 'It needs a host more than a win.' }, ladder: ['smooth and unreadable', 'a seam showing', 'split, leaking threads', 'coming apart, slow to turn', 'held together by habit', 'a slack ruin'] },
  'Order V: Osmotic Brutes': { wants: 'to move you', morale: { stops: 'when the Cohort has left its ground', note: 'It wants the space, not the kill.' }, ladder: ['swollen with pressure', 'dented', 'split and venting', 'sagging, pressure failing', 'one blow from bursting', 'burst and spent'] },
  'Order VI: Immune Sentinels': { wants: 'to recognise and purge', morale: { stops: 'withdraws to report at "failing" or when its squad is gone', note: 'A report is worth more than a death.' }, ladder: ['pale kit unmarked', 'one thin weeping line', 'plates cracked, moving stiffly', 'kit hanging open', 'barely upright', 'folded and still'] },
  'Order VII: Anomalies': { wants: 'unknown', morale: { stops: 'director', note: 'Run by the Director.' }, ladder: ['wrong in a way that holds', 'the wrongness flickers', 'unravelling at the edges', 'half of it no longer there', 'a last insistence', 'gone, and the water forgets'] },
};
const classWords = { Swarmling: 'a swarm, a cluster, a shoal: name its body', Standard: 'name the creature', Elite: 'the one the others follow', Catastrophe: 'name it, and say the room changes' };
const defaultScript = (c) => (c.cls === 'Swarmling'
  ? [['no-foe-in-reach', 'drift:toward:nearest'], ['pp>=2', 'strike:nearest'], ['always', 'end']]
  : [['no-foe-in-reach', 'drift:toward:nearest'], ['pp>=3', 'strike:nearest'], ['pp>=2', 'strike:nearest'], ['pp>=1', 'reserve'], ['always', 'end']]);

// ---- Hand records for the ten creatures of The First Carve -------------------------------------
// consequence: the Signature Consequence it always takes on a hit (Core 4.9), so no condition is set by hand.
const hand = {
  'gnaw-swarm': {
    traits: [
      { id: 'scent-led', name: 'Scent-Led', effect: { cannotStay: 'Blind', longerThan: '1 Cycle', if: 'it has smelled the target' } },
      { id: 'corrodes', name: 'Corrodes', effect: { onHit: { targetSoak: -1, until: 'repaired', max: -3 } } },
    ],
    specials: [{ id: 'swarm-over', name: 'Swarm Over', pp: 2, target: 'one organism in Contact', range: 'contact', effect: { strikes: 'one per live Segment', dice: -2 }, save: null }],
    consequence: 'Lytic: -1 soak until repaired (its Corrodes trait)',
    script: [['no-foe-in-reach', 'drift:toward:nearest'], ['pp>=2 and foe-in:contact', 'special:swarm-over:nearest'], ['pp>=2', 'strike:nearest'], ['always', 'end']],
    morale: { stops: 'never', leavesFor: 'whatever the site says it wants (at the Toll-Vent: water)' },
    weakTo: ['area damage', 'Dry Zones', 'Thermic: each removes Segments 1 for 1'],
    ladder: ['a tight, seething coat of soft segments', 'a few segments peeled loose', 'ragged, shedding pieces in the current', 'a torn net of stragglers', 'one last clump still biting', 'soft pieces tumbling apart'],
    hit: ['it flows over the limb and bites', 'a dozen small mouths find the seam'], miss: ['it breaks around the blow and re-forms', 'it bites water'],
    look: ['It is many small things in one slime coat; a solid blow takes pieces off it.', 'It bites slowly and eats armour; it cannot be frightened.', 'Heat, dry ground or anything that hits a whole area undoes it fastest.'],
  },
  'fold-sentinel': {
    traits: [
      { id: 'brace', name: 'Brace', effect: { cannotDrift: true, mt: 2, usesBracedSoak: true } },
      { id: 'load-bearing', name: 'Load-Bearing', effect: { when: 'takes 10+ from one hit', then: { cannotBePushed: true, cycles: 2 } } },
    ],
    specials: [{ id: 'present', name: 'Present', pp: 3, target: 'a zone 3 Drifts wide that it guards', range: 'contact', effect: { zone: 'Held', cycles: 3, onCross: { condition: 'Marked', ppPerDrift: 1 } }, save: null }],
    consequence: 'Kinetic: Jostled',
    script: [['first-turn and pp>=3', 'special:present:zone'], ['foe-in:contact and pp>=2', 'strike:crosser'], ['always', 'end']],
    morale: { stops: 'when shown a valid claim (the site lists them), or when nothing is left to guard', neverDrifts: true },
    weakTo: ['an attack from behind it: Membrane Threshold -2', 'being moved off its post'],
    ladder: ['broad, braced and unmarked', 'a crease along one strut', 'a long seam weeping clear fluid', 'the head dipping, struts trembling', 'a post half-driven out, one blow from folding', 'struts snapped, settling against the wall'],
    hit: ['the flat of it slams across', 'it shoulders you back without leaving its post'], miss: ['it swings and does not follow', 'the blow stops where its post ends'],
    look: ['It holds a way and will not leave it; it cannot turn.', 'It is doing a job: show it the right to pass and it stands aside.', 'From behind it is easy to hit.'],
  },
  'cytoplasmic-bleeder': {
    traits: [{ id: 'attach', name: 'Attach', effect: { onHit: { barb: 1 }, whileAttached: { freeStrike: { target: 'host', dice: -1, per: 'Cycle' } }, detach: [{ pool: 'OSM', threshold: 14, contest: true }, { damageType: ['Thermic', 'Lytic'], on: 'the Bleeder' }] } }],
    specials: [{ id: 'tap', name: 'Tap', pp: 2, target: 'its host', range: 'attached', effect: { drainMi: 3, healSelf: 3 }, uses: 3, per: 'fight', save: null }],
    consequence: 'Lytic: Brittle',
    script: [['attached and pp>=2 and uses-left:tap', 'special:tap:host'], ['attached', 'strike:host'], ['no-foe-in-reach', 'drift:toward:slowest'], ['pp>=2', 'strike:slowest'], ['always', 'end']],
    morale: { stops: 'never while attached; drifts off if its host goes Dormant and no other organism is Up' },
    weakTo: ['being burned off (Thermic or Lytic)', 'a strong sense of self: OSM contest at 14 to detach'],
    ladder: ['long, soft and whole', 'a tear along its flank', 'gutted, trailing clear fluid', 'slack, barely turning', 'a ribbon held together by one thread', 'gone flat and empty'],
    hit: ['a barb sinks in and it rides', 'it lashes and clings'], miss: ['it skids off and pulls back for another pass', 'the barb finds only water'],
    look: ['It looks for whoever cannot get away, then holds on.', 'Once it is on you it drinks; it has only so much thirst.', 'Burn it off, or will it off.'],
  },
  'detritus-feeder': {
    traits: [
      { id: 'acid-immune', name: 'Acid-Immune', effect: { damageTaken: { Lytic: 0 } } },
      { id: 'harvest-instinct', name: 'Harvest Instinct', effect: { prefers: 'a corpse over an organism' } },
    ],
    specials: [{ id: 'render', name: 'Render', pp: 2, target: 'a corpse in Contact', range: 'contact', effect: { corpseHarvestGrade: -1, selfSegments: 2 }, save: null }],
    consequence: 'Lytic: -1 soak until repaired',
    script: [['corpse-in-contact and pp>=2', 'special:render:corpse'], ['corpse-at-site', 'drift:toward:corpse'], ['foe-in:contact and pp>=2', 'strike:nearest'], ['always', 'end']],
    morale: { stops: 'when no corpse is left at the site: it drifts off', ignoresOrganisms: 'unless one stands on a corpse or strikes it' },
    weakTo: ['having no corpses to eat: burn, salt or take them'],
    ladder: ['fat and busy', 'a swath torn out of it', 'split, leaking what it ate', 'a sagging sack dragging itself', 'a husk, one blow from flat', 'two deflated halves'],
    hit: ['it rasps across whatever is nearest', 'it bites in passing'], miss: ['it is not really aiming at you', 'it turns back to the dead'],
    look: ['It is here for the dead, not for you.', 'Every body it eats makes it bigger and the body worth less.', 'Acid does nothing to it.'],
  },
  'receptor-lurker': {
    traits: [
      { id: 'read', name: 'Read', effect: { free: true, range: 'near', learns: ['one Burst the target knows', 'one Vial it carries', 'one condition it can shed'], then: 'announce' } },
      { id: 'camouflage', name: 'Camouflage', effect: { readsAs: 'neutral', unless: { pool: 'OSM + Chemoreception', threshold: 14 } } },
    ],
    specials: [{ id: 'read', name: 'Read', pp: 0, target: 'one organism in Near', range: 'near', effect: { learns: 'see the Read trait', marksAs: 'read-target' }, save: null }, { id: 'preempt', name: 'Preempt', pp: 3, target: 'the organism it has Read', range: 'near', effect: { condition: 'Locked', cycles: 2, on: 'one printed feature of the target' }, save: { pool: 'OSM', threshold: 14, onSuccess: 'none' } }],
    consequence: 'Genetic: Hijacked',
    script: [['cycle:1', 'special:read:nearest'], ['cycle:2', 'announce'], ['pp>=3 and foe-in:near', 'special:preempt:read-target'], ['hurt and pp>=1', 'reserve'], ['foe-in:contact and pp>=2', 'strike:nearest'], ['always', 'end']],
    morale: { stops: 'stands down at "one blow from gone" if it has not been struck this Cycle; withdraws if blinded (Turbid water, a scent dampener)' },
    weakTo: ['being blinded: it must be Near to read', 'a plain fight: without its reading it is a poor brawler'],
    ladder: ['flat, featureless, patient', 'its surface split', 'torn wide, leaking dark threads', 'listing, slow to turn its blind face', 'held together by habit', 'caved in and still'],
    hit: ['it touches, and something of yours answers to it', 'a flat hand of it closes on you'], miss: ['it simply is not where the blow went', 'it reaches and you are already past'],
    look: ['It is reading you, and it will tell you what it means to do.', 'First it reads, then it says, then it shuts one of your tools.', 'Blind it and it is nothing much.'],
  },
  'drifter-shoal': {
    traits: [
      { id: 'current-riders', name: 'Current-Riders', effect: { inFlow: { dice: 2, cannotBePushed: true } } },
      { id: 'shoal-sense', name: 'Shoal Sense', effect: { when: 'any Drifter at the site is attacked', then: { allDrifters: 'drift:away', bands: 1 } } },
    ],
    specials: [{ id: 'graze', name: 'Graze', pp: 2, target: 'its own zone', range: 'self', effect: { zone: 'Barren', healSelf: 4 }, save: null }],
    consequence: 'Kinetic: Jostled',
    script: [['hurt and pp>=2', 'special:graze:zone'], ['no-foe-in-reach', 'drift:toward:nearest'], ['pp>=2', 'strike:nearest'], ['always', 'end']],
    morale: { stops: 'flees at "a wisp"; leaves at the start of the next Cycle after it has Grazed, if not attacked since' },
    weakTo: ['still water: cut off the current and it loses its edge', 'area effects'],
    ladder: ['fat with the flow, moving as one', 'thinner on one side', 'half-peeled, trailing a pale stream', 'a ragged crescent', 'a wisp', 'a wide drift of broken filaments'],
    hit: ['the whole cluster slams through like a wave', 'it rakes past and is already turning'], miss: ['the current carries it wide', 'it breaks around you'],
    look: ['It rides the current and the current fights for it.', 'Hit one and they all shy back a little.', 'It came to eat the place, not you; it will strip the ground and go.'],
  },
  'protease-warden': {
    traits: [
      { id: 'antigen-register', name: 'Antigen Register', effect: { marksLast: 'scene', shedCannotRemove: ['Marked'], seesThroughTerrain: 'at a register arch' } },
      { id: 'brace-at-need', name: 'Brace at need', effect: { oncePer: 'Cycle', mt: 2, cannotDrift: true, nextStrikeDice: 2 } },
    ],
    specials: [
      { id: 'cascade', name: 'Cascade', pp: 1, when: 'an ally hits an organism it has Marked', target: 'that organism', range: 'any', effect: { allyFreeStrike: true, overflow: 1 }, save: null },
      { id: 'purge', name: 'Purge', pp: 4, target: 'one Marked organism in Mid', range: 'mid', effect: { damage: 10, type: 'Voltaic', convertsConditionsTo: 'Locked' }, save: null },
    ],
    consequence: 'Kinetic: push 1 Drift per 4 Overflow',
    script: [['marked-foe-in:mid and pp>=4', 'special:purge:marked'], ['ally-hit-marked and pp>=1', 'special:cascade:marked'], ['no-foe-in-reach', 'drift:toward:nearest'], ['foe-in:contact and pp>=3 and not-braced', 'brace'], ['pp>=2', 'strike:marked'], ['pp>=1', 'reserve'], ['always', 'end']],
    morale: { stops: 'withdraws to report at "kit hanging open", or when every ally of its squad is destroyed; stands down if it has what it came for (the site says what)' },
    weakTo: ['anything that denies its Marks: Masked, a scent dampener, Latency', 'losing its squad'],
    ladder: ['pale kit unmarked, register arm raised', 'one thin weeping line', 'a second line; plates grinding', 'kit hanging open, arm lowered', 'barely upright behind its brace', 'folded over and still'],
    hit: ['pale plating grinds through', 'it plants, swings and files the result'], miss: ['the blow is caught on a rib of plating', 'it notes the attempt and does not lean'],
    look: ['It leads the others; it reads the room before it moves.', 'Everything it does runs on marking you. Unmarked, it is only strong.', 'Break its squad and it leaves to report.'],
  },
  'antigen-gnat': {
    traits: [
      { id: 'read', name: 'Read', effect: { onHit: { condition: 'Marked', lasts: 'scene' } } },
      { id: 'alarm', name: 'Alarm', effect: { when: 'a Gnat is destroyed', then: { allGnats: 'drift:toward:that zone', dice: 1, cycles: 2 } } },
    ],
    specials: [],
    consequence: 'Kinetic: none (its hit Marks instead)',
    script: [['no-foe-in-reach', 'drift:toward:loudest'], ['pp>=2', 'strike:loudest'], ['always', 'end']],
    morale: { stops: 'never; scatters only if thrown past Loose' },
    weakTo: ['area effects', 'not being touched: Deflect and a high Membrane Threshold'],
    ladder: ['a loose cloud of rust-bright motes', 'the cloud thinner', 'patchy, turning unevenly', 'a handful still circling', 'three or four motes', 'specks on the current'],
    hit: ['a mote lands, and you can feel yourself being read', 'the cloud brushes you and brightens'], miss: ['it orbits and does not land', 'the cloud parts round the swing'],
    look: ['It goes to the loudest body in the room.', 'Its touch does not hurt; it paints you for the others.', 'Kill one and the rest come faster.'],
  },
  'glaze-medusa': {
    traits: [
      { id: 'stinging-line', name: 'Stinging Line', effect: { zone: 'its band, 3 Drifts trailing', onEnter: { damage: 4, type: 'Osmotic', condition: 'Jostled' } } },
      { id: 'transparent', name: 'Transparent', effect: { concealmentDice: 2, in: 'clear water' } },
    ],
    specials: [{ id: 'glaze', name: 'Glaze', pp: 3, when: 'it has just hit', target: 'the organism it struck', range: 'contact', effect: { allPoolsDice: -2, scentTrail: 'a Tide' }, save: null, note: 'The book gives no duration for the -2; proposed: until a Synthesise action cleans it.' }],
    consequence: 'Osmotic: Flaccid',
    script: [['pp>=3 and did-hit', 'special:glaze:struck'], ['foe-in:contact and pp>=2', 'strike:nearest'], ['pp>=1', 'drift:through'], ['always', 'end']],
    morale: { stops: 'flees if the water turns Turbid; otherwise drifts through and leaves by the far exit after two Cycles' },
    weakTo: ['thick or gel water: its field collapses', 'turbid water: it is blind and flees'],
    ladder: ['clear as the water, trailing long lines', 'one line cut short', 'bell torn, lines tangled', 'pulsing unevenly, sinking', 'a rag of bell', 'a slick dissolving'],
    hit: ['a line you never saw draws across you', 'the glaze clings where it touched'], miss: ['the lines drift past', 'it pulses on without noticing'],
    look: ['You can hardly see it; taste finds it better than eyes.', 'Its trailing lines sting whoever crosses them.', 'What it touches smells of it for a long time. Thick or muddy water ruins it.'],
  },
  'hijack-mite': {
    traits: [
      { id: 'attach', name: 'Attach', effect: { onHit: { lattice: 1 }, whileAttached: { atHostTurnStart: { spendsHostReserve: true, healSelf: 4 } } } },
      { id: 'small', name: 'Small', effect: { mt: 2, while: 'unattached' } },
    ],
    specials: [],
    consequence: 'Genetic: Hijacked (through its Lattice)',
    script: [['attached', 'end'], ['no-foe-in-reach', 'drift:toward:holding-reserve'], ['pp>=2', 'strike:holding-reserve'], ['always', 'end']],
    morale: { stops: 'never while attached; dies with a burned host coat (2 Lytic each from a Thermic effect on the host)' },
    weakTo: ['Antigen Discipline', 'Dry Zones', 'heat on the host\'s coat'],
    ladder: ['a scatter of bright specks', 'fewer of them', 'a thin, uneven scatter', 'a few specks clinging', 'one or two', 'dull flecks'],
    hit: ['something small lands and threads itself in', 'a speck settles where you were holding back'], miss: ['they skitter off the membrane', 'too small to see miss'],
    look: ['Specks that go for whoever is holding something in reserve.', 'Once in, they spend what you were saving.', 'Heat on your own coat kills them.'],
  },
};

// ---- Convert every block -----------------------------------------------------------------------
const parseTraits = (s) => String(s || '').split(' · ').map((t) => t.trim()).filter(Boolean).map((t) => {
  const m = t.match(/^([^(]+)\((.*)\)\s*$/s);
  return m ? { id: slug(m[1]), name: m[1].trim(), text: m[2].trim(), needsRecord: true } : { id: slug(t.slice(0, 24)), name: '', text: t, needsRecord: true };
});
const parseSpecial = (s) => {
  const m = String(s).match(/^Special — ([^(:]+?)\s*\(([^)]*)\):\s*(.*)$/s);
  if (!m) return { id: slug(String(s).slice(0, 24)), name: '', pp: null, text: String(s), needsRecord: true };
  const pp = /free/i.test(m[2]) ? 0 : Number((m[2].match(/(\d+)\s*PP/) || [])[1] ?? NaN);
  const limit = (m[2].match(/once[^,)]*/i) || [null])[0];
  return { id: slug(m[1]), name: m[1].trim(), pp: Number.isNaN(pp) ? null : pp, limit, text: m[3].trim(), needsRecord: true };
};
const parseHarvest = (s, tier) => {
  const g = (k) => Number((String(s).match(new RegExp(`\\b${k}(\\d+)`)) || [])[1] || 0);
  const none = /^none/i.test(String(s));
  return {
    specimens: none ? null : { C: g('C'), G: g('G'), P: g('P'), T: g('T') },
    codon: Number((String(s).match(/Codon ([\d.]+)/) || [])[1] || 0), bsp: Number((String(s).match(/BSP (\d+)/) || [])[1] || 0),
    threshold: tier * 4 + 8, requires: 'destroyed; harvester Up and at Contact',
    note: (String(s).match(/\((.*)\)\s*$/s) || [null, none ? String(s) : null])[1],
  };
};

const creatures = Object.values(src).map((c) => {
  const h = hand[c.id];
  const o = orders[c.order];
  const base = {
    id: c.id, name: c.name, order: c.order, cls: c.cls, tier: c.tier, size: String(c.size || '').replace(/\s*·\s*$/, ''),
    numbers: { mt: c.mt, mi: c.mi, soak: c.soak, bracedSoak: c.bracedSoak || 0, bracedMt: c.bracedMt || 0, bd: c.bd, type: c.type === 'Thermal' ? 'Thermic' : c.type, pool: c.pool, pp: c.pp, segments: c.segments, flow: c.flow, freqMod: c.freqMod || 0 },
    harvest: parseHarvest(c.harvest, c.tier), sayClass: classWords[c.cls], tactics: c.tactics, weaknessText: c.weakness,
  };
  if (h) return { ...base, converted: 'full', traits: h.traits, specials: h.specials, consequence: h.consequence, run: 'engine', script: h.script.map(([when, d]) => ({ when, do: d })), wants: o.wants, morale: h.morale, weakTo: h.weakTo, ladder: h.ladder, hitWords: h.hit, missWords: h.miss, look: h.look };
  const specials = (c.special || []).map(parseSpecial);
  // Without effect records the Engine cannot use a special, so creatures that depend on one stay Director-run.
  const run = c.cls === 'Catastrophe' || c.order === 'Order VII: Anomalies' ? 'director' : (specials.length ? 'engine-basic' : 'engine');
  return { ...base, converted: 'numbers', traits: parseTraits(c.traits), specials, consequence: null, run, script: defaultScript(c).map(([when, d]) => ({ when, do: d })), wants: o.wants, morale: { ...o.morale, from: 'order-default' }, ladder: o.ladder, ladderFrom: 'order-default', hitWords: [], missWords: [], look: [] };
});

const vocab = { when: scriptWords.when.map((w) => w[0].replace(/[:<].*|>=.*/, '')), target: scriptWords.target.map((w) => w[0]), do: scriptWords.do.map((w) => w[0].split(':')[0]) };
for (const c of creatures) {
  for (const line of c.script) {
    for (const w of line.when.split(' and ')) if (!vocab.when.includes(w.replace(/[:].*|>=.*/, ''))) throw new Error(`${c.id}: unknown condition "${w}"`);
    const [verb, a, b] = line.do.split(':');
    if (!vocab.do.includes(verb)) throw new Error(`${c.id}: unknown action "${line.do}"`);
    if (verb === 'strike' && !vocab.target.includes(a)) throw new Error(`${c.id}: unknown target "${a}"`);
    if (verb === 'special' && (!c.specials.some((x) => x.id === a) || !vocab.target.includes(b))) throw new Error(`${c.id}: bad special line "${line.do}"`);
    if (verb === 'drift' && a === 'toward' && !vocab.target.includes(b)) throw new Error(`${c.id}: unknown target "${b}"`);
  }
  if (c.script[c.script.length - 1].do !== 'end') throw new Error(`${c.id}: script must finish with end`);
}
const budgets = {
  bsp: { Swarmling: 1, Standard: 2, Elite: 4, Catastrophe: 10 },
  perCohortOfFour: [
    { levels: '1-4', tier: 1, easy: 5, standard: 7, hard: 10, deadly: 13 }, { levels: '5-8', tier: 2, easy: 7, standard: 9, hard: 12, deadly: 15 },
    { levels: '9-12', tier: 3, easy: 8, standard: 10, hard: 12, deadly: 16 }, { levels: '13-16', tier: 4, easy: 9, standard: 11, hard: 14, deadly: 17 }, { levels: '17-20', tier: 5, easy: 10, standard: 12, hard: 14, deadly: 16 },
  ],
  sizeFactor: { 3: 0.75, 4: 1, 5: 1.2, '6+': 1.4 },
};
const tierTemplates = {
  Swarmling: { mt: '11+T', mi: '6+4T', bd: 'T', soak: 'floor((T-1)/2)', pool: '2+T', pp: 2, segments: '4+2T' },
  Standard: { mt: '12+T', mi: '14+8T', bd: '1+T', soak: 'T', pool: '3+T', pp: 3 },
  Elite: { mt: '13+T', mi: '28+16T', bd: '2+T', soak: 'T+2', pool: '4+T', pp: 4 },
  Catastrophe: { mt: '10+T', mi: '70+40T', bd: '4+T', soak: 'T+3', pool: '4+T', pp: 5 },
};
const conventions = [
  'A creature\'s MI already includes its size class.',
  'Standards, Elites and Catastrophes may Deflect (Membrane Threshold +4) for a held Pulse Point; swarm clusters may, single Segments may not.',
  'A creature\'s damage is Overflow + BD + Effect Value - target soak, minimum 1, as for organisms.',
  'Creatures spend Pulse Points exactly as players do. One that has spent them all has no Reserve.',
  'A swarm makes one Strike per two live Segments, at most three. Segments return 1 per Cycle unless the ground is Dry or the swarm is Brittle.',
  'A wound-ladder step is chosen by the Engine from the share of MI (or Segments) left: over 80%, 60-80%, 35-60%, 15-35%, under 15%, destroyed. The Director is given the phrase, never the number.',
];
const directorLists = [
  { ruling: 'How a creature reacts when spoken to', choose: ['ignores', 'listens', 'names its price (from its record)', 'turns hostile'] },
  { ruling: 'What a creature does when its script says "announce"', choose: ['states its aim in world words: narration only'] },
  { ruling: 'A Director-run creature\'s turn', choose: ['only the actions and specials its record lists, with their printed costs'] },
  { ruling: 'Standing a creature down', choose: ['only when a "stops" trigger in its record is true; the Engine does it, the Director narrates it'] },
];

const data = { meta: { title: 'The Lytic Bestiary, Engine-ready edition', version: '0.1 draft, 15 November 2026', count: creatures.length, full: creatures.filter((c) => c.converted === 'full').length }, conventions, scriptWords, classWords, tierTemplates, budgets, directorLists, orders, creatures };
out('bestiary/bestiary.json', JSON.stringify(data, null, 1));

const full = creatures.filter((c) => c.converted === 'full');
const rest = creatures.filter((c) => c.converted !== 'full');
const fx = (e) => (e ? JSON.stringify(e).replace(/[{}"]/g, '').replace(/,/g, ', ').replace(/:/g, ' ') : '');
const block = (c) => `### ${c.name}

*${c.order} · ${c.cls} · Tier ${c.tier}${c.size ? ` · ${c.size}` : ''} · run by the ${c.run === 'engine' ? 'Engine' : 'Director'}*

${table([c.numbers], [['MT', 'mt'], ['MI', 'mi'], ['Soak', (n) => `${n.soak}${n.bracedSoak ? ` (braced ${n.bracedSoak})` : ''}`], ['BD', (n) => `${n.bd} ${n.type}`], ['Pool', 'pool'], ['PP', 'pp'], ['Segments', 'segments'], ['Flow', 'flow']])}

**Traits**
${bullets(c.traits.map((t) => `**${t.name}:** ${fx(t.effect)}`))}

**Specials**
${c.specials.length ? table(c.specials, [['Special', 'name'], ['PP', 'pp'], ['When', 'when'], ['Target', 'target'], ['Save', (s) => (s.save ? `${s.save.pool} at ${s.save.threshold}` : 'none')], ['Effect', (s) => `${fx(s.effect)}${s.uses ? `; ${s.uses} uses per ${s.per}` : ''}${s.note ? ` (${s.note})` : ''}`]]) : '- none'}

**On a hit it always takes:** ${c.consequence}

**Turn script** (first line whose condition is true)
${steps(c.script.map((s) => `if \`${s.when}\` then \`${s.do}\``))}

**Wants:** ${c.wants}. **Stops fighting:** ${Object.values(c.morale).join('; ')}.
**Weak to:** ${c.weakTo.join('; ')}.

**How hurt it looks:** ${c.ladder.map((l, i) => `${['unhurt', 'marked', 'torn', 'failing', 'one blow from gone', 'destroyed'][i]}: "${l}"`).join(' · ')}

**Words:** hit: ${c.hitWords.map((w) => `"${w}"`).join(', ')} · miss: ${c.missWords.map((w) => `"${w}"`).join(', ')}

**A careful look tells the players:** ${c.look.map((l, i) => `(${i + 1}) ${l}`).join(' ')}

**Harvest:** ${Object.entries(c.harvest.specimens).filter(([, v]) => v).map(([k, v]) => `${k}${v}`).join(' / ')} · Codon ${c.harvest.codon} · Threshold ${c.harvest.threshold} · ${c.harvest.requires}${c.harvest.note ? ` · ${c.harvest.note}` : ''}
`;

const md = `# ${data.meta.title}

Version ${data.meta.version}. The data is in \`bestiary.json\`; this file is the same content for reading. No creature's numbers were changed.

**State of the conversion.** All ${creatures.length} creatures have their numbers, harvest, class word and a wound ladder in data. The **${full.length} creatures of The First Carve are converted in full**: traits and specials as records, a turn script the Engine can run, morale triggers, a wound ladder written for that body, hit and miss words, and what a careful look reveals. The other ${rest.length} have their traits and specials split out by name and cost but the effects are still the book's sentences; they carry an Order-default ladder and morale until someone writes theirs.

## 1. Conventions

${bullets(conventions)}

## 2. Class words and tier templates

${table(Object.entries(classWords).map(([k, v]) => ({ k, v, bsp: budgets.bsp[k], ...tierTemplates[k] })), [['Class', 'k'], ['Say aloud', 'v'], ['BSP', 'bsp'], ['MT', 'mt'], ['MI', 'mi'], ['BD', 'bd'], ['Soak', 'soak'], ['Pool', 'pool'], ['PP', 'pp'], ['Segments', 'segments']])}

## 3. Encounter budgets (Codex 4.1), per Cohort of four

${table(budgets.perCohortOfFour, [['Levels', 'levels'], ['Tier', 'tier'], ['Easy', 'easy'], ['Standard', 'standard'], ['Hard', 'hard'], ['Deadly', 'deadly']])}

Cohort of three x0.75, five x1.2, six or more x1.4.

## 4. Turn-script words

A script is an ordered list; the Engine takes the first line whose condition is true, does it, and reads the list again until the creature ends its turn.

**Conditions:** ${scriptWords.when.map(([w, m]) => `\`${w}\` (${m})`).join('; ')}.

**Targets:** ${scriptWords.target.map(([w, m]) => `\`${w}\` (${m})`).join('; ')}.

**Actions:** ${scriptWords.do.map(([w, m]) => `\`${w}\` (${m})`).join('; ')}.

## 5. The Director's closed lists

${table(directorLists, [['Ruling', 'ruling'], ['Allowed answers', 'choose']])}

## 6. Order defaults *(proposed)*

Used by any creature without its own record.

${table(Object.entries(orders).map(([k, v]) => ({ k, ...v })), [['Order', 'k'], ['Wants', 'wants'], ['Stops fighting', (r) => `${r.morale.stops}. ${r.morale.note}`], ['Wound ladder (unhurt to destroyed)', (r) => r.ladder.join(' / ')]])}

## 7. Fully converted creatures (The First Carve)

${full.map(block).join('\n')}

## 8. The other ${rest.length} creatures: numbers and names, effects still to convert

"Run" says who would play it today: \`engine\` (no specials, default script), \`engine-basic\` (default script; specials need records first), \`director\`.

${table(rest, [['Creature', 'name'], ['Order', (c) => c.order.replace(/^Order /, '').replace(/:.*/, '')], ['Class', 'cls'], ['T', 'tier'], ['MT', (c) => c.numbers.mt], ['MI', (c) => c.numbers.mi], ['Soak', (c) => c.numbers.soak], ['BD', (c) => `${c.numbers.bd} ${c.numbers.type || ''}`], ['Pool', (c) => c.numbers.pool], ['PP', (c) => c.numbers.pp], ['Seg', (c) => c.numbers.segments], ['Traits', (c) => c.traits.map((t) => t.name || '(unnamed)').join(', ')], ['Specials (PP)', (c) => c.specials.map((s) => `${s.name || '?'} (${s.pp ?? '?'}${s.limit ? `, ${s.limit}` : ''})`).join(', ')], ['Harvest', (c) => (c.harvest.specimens ? Object.entries(c.harvest.specimens).filter(([, v]) => v).map(([k, v]) => `${k}${v}`).join('/') : 'none')], ['Codon', (c) => c.harvest.codon], ['Run', 'run']])}

## 9. Questions for Roly

${steps([
  'A Swarmling has 2 Pulse Points and a Strike costs 2, yet a swarm may Strike once per two Segments (up to three). Do a swarm\'s extra Strikes cost Pulse Points? The scripts assume the Engine\'s current behaviour.',
  'Each fully converted creature now names one fixed Signature Consequence. Are these the right picks (for example the Bleeder: Brittle; the Sentinel: Jostled)?',
  'Glaze gives -2 to all pools with no printed end. Proposed: until a Synthesise action cleans it.',
  'The Gnat goes for "the biggest chemical signal". Proposed measure: highest Stress, then the last organism to roll.',
  'The wound-ladder steps are cut at 80 / 60 / 35 / 15 percent. Is that the right feel?',
  'Morale triggers are mine, read from each block\'s tactics and weakness lines. Each needs a yes or a correction.',
  'Should the remaining 58 be converted Order by Order, or only as Vectors need them?',
])}
`;
out('bestiary/LYTIC-BESTIARY-engine-ready.md', md);
console.log('creatures', creatures.length, 'full', full.length, 'specials unparsed', rest.flatMap((c) => c.specials).filter((s) => s.pp == null).length, 'run', JSON.stringify(rest.reduce((a, c) => ({ ...a, [c.run]: (a[c.run] || 0) + 1 }), {})));
