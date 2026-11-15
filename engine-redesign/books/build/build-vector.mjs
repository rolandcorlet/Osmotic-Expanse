// The Vector format, and The First Carve converted into it.
// Source (read only): director/data/first-carve.js, which holds the Vector's facts with section
// cites, and the seven bench logs for what the format has to prevent.
// A field with `gap:` is something the Vector leaves to the Director today; the value beside it is
// my proposal and needs Roly's yes. The builder collects every gap into one list and runs the
// validator checklist against the Engine-ready Core and Bestiary in this folder.
import { out, table, steps, bullets, root } from './lib.mjs';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const core = JSON.parse(readFileSync(join(root, 'core', 'core-rules.json'), 'utf8'));
const bestiary = JSON.parse(readFileSync(join(root, 'bestiary', 'bestiary.json'), 'utf8'));
const players = JSON.parse(readFileSync(join(root, 'players', 'players.json'), 'utf8'));

// ---- The schema, as the list of fields a Vector must fill -------------------------------------
const schema = [
  ['header', 'id, title, levels, cohortSize, hands[], sessionZero[], premise (2 sentences, read aloud)', 'Engine, players'],
  ['clocks[]', 'id, segments, shownToPlayers, says, stages[], atFull (ending id)', 'Engine, players'],
  ['clockTriggers[]', 'event, clock, change, limit (per-scene | per-session | none), site (or "any")', 'Engine. Nothing else moves a Clock except the Director\'s one discretionary segment per Clock per session.'],
  ['events', 'The closed list of event ids that triggers, hazards and awards may name.', 'Engine'],
  ['sites[].id, name, readAloud', '2 to 4 sentences of what a body sees on arrival', 'players'],
  ['sites[].medium', 'tonic, viscosity, flow, modifiers[] (Core modifier ids the site applies)', 'Engine'],
  ['sites[].zones[]', 'id, name, band, tags[] (cover, squeezed, current, difficult, advantage:<action>), note', 'Engine, players'],
  ['sites[].exits[]', 'to (site id or ending id), name, open (always | not-in-fight | needs:<flag>), oneWay', 'Engine'],
  ['sites[].creatures[]', 'block, count, band, present (on-arrival | on:<event>), stance (hostile | guarding | hunting | indifferent | will-talk), hostileOn[] (events), standsDownOn[] (flags or events), leavesOn[]', 'Engine'],
  ['sites[].npcs[]', 'id, name, wants, offers[] {id, gives, price}, says[] (facts it will state, and for what)', 'Director briefing; prices to Engine'],
  ['sites[].interactables[]', 'id, name, action (Core action id), pool, threshold (ladder id or {printed}), unhurried, needs, onSuccess[], onFailure[], reveals (secret tier), once', 'Engine builds the Director\'s tools from this list'],
  ['sites[].nothingElse', 'A sentence the Director may use when a player tries something unlisted.', 'Director'],
  ['sites[].hazards[]', 'id, name, tier, discovery, trigger[] (event ids), clockGate, amount, type, targets (one | zone:<id> | site), save, conditions[], bandShift, soak, frequency (per-cycle | per-scene | once | standing), counter[], afterFiring', 'Engine'],
  ['sites[].harvest', 'site {what, tier, threshold, yield, event} or null; creatures pay what the Bestiary prints', 'Engine'],
  ['sites[].awards[]', 'id, on (event or flag), codon, once', 'Engine'],
  ['sites[].secrets[]', 'tier (1 seen on arrival, 2 on a look or taste, 3 on a successful read), text', 'Director briefing, released by the Engine'],
  ['sites[].danger', 'rating (Easy | Standard | Hard | Deadly), bsp, announce (true when the rating must be said aloud first)', 'Engine checks it against the Codex budget'],
  ['sites[].lesson', 'What the site teaches the table.', 'Director'],
  ['setPieces[]', 'id, kind (chase | countdown | exchange), steps[], rolls, win, lose', 'Engine'],
  ['endings[]', 'id, when (state test), says', 'Engine'],
];

const events = [
  ['arrive:<site>', 'the Cohort enters a site'], ['pulse-war-starts', 'a Pulse War begins (the Vector calls this "loud")'], ['strike', 'any Strike is made at the site'], ['kinetic-hit', 'a Kinetic hit lands'], ['momentum', 'a Momentum Strike is made'],
  ['enter-zone:<zone>', 'a body enters the zone'], ['in-zone:<zone>', 'a body starts its turn in the zone'], ['body-cut', 'a destroyed creature or the site is harvested'], ['body-left', 'the Cohort leaves a site with a destroyed creature uncut'],
  ['panel-opens', 'a site harvest opens new tissue'], ['oath-filed', 'an Oath is filed'], ['oath-kept', 'a filed Oath is kept at a cost'], ['toll-refused', 'a body crosses the gate with no claim'], ['toll-settled', 'the toll is paid or sworn'],
  ['pump-opened', 'the pump is seized or opened'], ['brood-cut', 'the brood is harvested'], ['brood-registered', 'the claim is signed'], ['clock:<id>:<n>', 'that Clock reaches n'], ['reconstitution', 'the Cohort takes a Fugue Interval rest'], ['loud:<site>', 'a Breach, a Dormancy or a Countdown box at that site'],
];

// ---- The First Carve --------------------------------------------------------------------------
const T = (id) => id; // a ladder rung by id
const vector = {
  id: 'first-carve', title: 'The First Carve', levels: '1', cohortSize: 4, hands: players.hands.map((h) => h.id),
  premise: 'A whale lies dead across the channel with a wound cut in its flank. Everything worth having is inward and upstream, and the way back out is the same way.',
  sessionZero: ['Players see all three Clocks.', 'Nothing carried out is worth anything unless it passed a Tally Post.', 'The Gut Stone is Deadly and will be announced as such.'],
  clocks: [
    { id: 'CARCASS', segments: 6, shownToPlayers: true, says: 'The whale is digesting itself. The value clock.', stages: ['fresh', 'weeping', 'bloated', 'sloughing', 'sour', 'gaslock', 'the whale goes over'], atFull: 'whale-goes-over' },
    { id: 'TOLL', segments: 5, shownToPlayers: true, says: 'The Render Charge is on a schedule. The law clock.', stages: [], atFull: null, note: 'At 5 the Render Charge fires (Gut Stone hazard).' },
    { id: 'HUNGER', segments: 4, shownToPlayers: true, says: 'Everything in the Reach can smell a wound. The danger clock.', stages: ['only tells', 'signs at every panel', 'Gnaw Swarms at the wounds', 'Detritus Feeders render the dead', 'the Render Cascade'], atFull: 'render-cascade' },
  ],
  clockTriggers: [
    { event: 'panel-opens', clock: 'CARCASS', change: 1, limit: 'per-scene', site: 'any', cite: '3.1' },
    { event: 'reconstitution', clock: 'CARCASS', change: 1, limit: 'none', site: 'any' },
    { event: 'pulse-war-starts', clock: 'TOLL', change: 1, limit: 'none', site: 'any', cite: '3.2' },
    { event: 'pulse-war-starts', clock: 'HUNGER', change: 1, limit: 'none', site: 'any', cite: '3.3' },
    { event: 'body-cut', clock: 'HUNGER', change: 1, limit: 'none', site: 'any', cite: '3.3', gap: 'The coded Vector names HUNGER for a body cut and for a body left, without the sign. Proposed +1 for each, once per site for "left".' },
    { event: 'body-left', clock: 'HUNGER', change: 1, limit: 'per-scene', site: 'any', cite: '3.3' },
    { event: 'oath-kept', clock: 'TOLL', change: -1, limit: 'none', site: 'any', gap: 'The sign is not in the coded data. Proposed -1: a kept promise buys time with the law.' },
    { event: 'toll-refused', clock: 'TOLL', change: 1, limit: 'per-scene', site: 'toll-vent', cite: '8.1' },
    { event: 'toll-settled', clock: 'TOLL', change: -1, limit: 'per-scene', site: 'toll-vent', cite: '8.1 (the toll chit)' },
    { event: 'pump-opened', clock: 'CARCASS', change: -1, limit: 'per-session', site: 'render-hall', cite: '8.3' },
    { event: 'pump-opened', clock: 'HUNGER', change: 1, limit: 'per-session', site: 'render-hall', cite: '8.3' },
    { event: 'pump-opened', clock: 'TOLL', change: 1, limit: 'per-session', site: 'render-hall', cite: '8.3', gap: '"TOLL +1 if the Guild sees it": the barge crew are Guild-licensed and present, so proposed always, unless the crew have been sent away.' },
    { event: 'brood-cut', clock: 'HUNGER', change: 2, limit: 'per-scene', site: 'brood', cite: '8.4' },
    { event: 'brood-cut', clock: 'TOLL', change: 1, limit: 'per-scene', site: 'brood', cite: '8.4' },
  ],
  directorClockAllowance: 'one segment per Clock per session (Vector 3.4)',

  sites: [
    {
      id: 'toll-vent', name: 'The Toll-Vent', cite: '8.1',
      readAloud: 'A torn flank panel the size of a town square, the channel\'s current running through it. Folded out of the whale\'s own gristle is a customs post: a chitin gate, a queue of drones, a toll board priced in Specimens. Beyond the gate a cut-lane runs down into the carcass.',
      medium: { tonic: 'isotonic', viscosity: 1, flow: 2, modifiers: [] },
      zones: [
        { id: 'wound-lip', name: 'The wound lip', band: 'near', tags: [], note: 'the torn edge you must cross; the gas pocket is under it' },
        { id: 'customs-fold', name: 'The drone customs fold', band: 'contact', tags: [], note: 'the gate' },
      ],
      exits: [
        { to: 'soft-field', name: 'the cut-lane down', open: 'needs:way-open', note: 'way-open is set by toll-settled, by crossing, or when the Sentinel is destroyed' },
        { to: 'walked-away', name: 'back out to the Toll Reach', open: 'not-in-fight' },
      ],
      creatures: [
        { block: 'fold-sentinel', count: 1, band: 'contact', present: 'on-arrival', stance: 'guarding', hostileOn: ['toll-refused'], standsDownOn: ['toll-settled'], note: 'It does not start the fight. If the Cohort has paid or sworn it stands aside even after a strike.' },
        { block: 'gnaw-swarm', count: 2, band: 'near', present: 'on-arrival', stance: 'indifferent', hostileOn: ['strike'], leavesOn: ['offer-water'], note: 'They want drink, not violence.' },
      ],
      npcs: [{ id: 'gate-drones', name: 'the customs drones', wants: 'the toll, in any printed form', offers: [], says: ['the three prices on the board'] }],
      interactables: [
        { id: 'taste-water', name: 'Taste the water from the wound', action: 'sense', pool: 'OSM + Chemoreception', threshold: T('standard'), unhurried: true, onSuccess: ['reveal:2', 'discover:gas-pocket'], onFailure: ['nothing'] },
        { id: 'pay-specimens', name: 'Pay the toll in Specimens', action: null, needs: '2 C per body', onSuccess: ['flag:toll-settled', 'flag:way-open', 'event:toll-settled'], once: true },
        { id: 'pay-substrate', name: 'Pay the toll in Substrate', action: null, needs: '15 S per body', onSuccess: ['flag:toll-settled', 'flag:way-open', 'event:toll-settled'], once: true },
        { id: 'swear-toll', name: 'Swear a promise at the witness-seam', action: 'swear', needs: 'a free Oath box; the promise in the player\'s words; owed to Order II', onSuccess: ['oath:file', 'flag:toll-settled', 'flag:way-open', 'event:toll-settled'], once: true, gap: 'The Core Rite takes an hour and 10 S; here the promise is taken on the spot. Proposed: a quick oath is allowed at a printed witness-seam, costs the Oath box only, and the answer to "what do you promise?" is filed at once.' },
        { id: 'force-gate', name: 'Shoulder through the gate', action: 'drift', pool: 'VSC + Vigour', threshold: T('standard'), onAttempt: ['event:toll-refused'], onSuccess: ['flag:way-open'], onFailure: ['the Sentinel Strikes the crosser'], cite: 'lesson 1: the crossing at AT 12' },
        { id: 'offer-water', name: 'Give the swarms water', action: 'synthesise', needs: 'clean water: one Vial of any kind emptied, or 1 S of foam', onSuccess: ['leaves:gnaw-swarm'], gap: 'The Vector says a swarm offered water leaves but not where the water comes from. Proposed cost as shown.' },
        { id: 'vent-pocket', name: 'Vent the gas pocket slowly', action: 'synthesise', needs: 'discovered:gas-pocket', onSuccess: ['disarm:gas-pocket'] },
      ],
      nothingElse: 'The drones sell nothing and there is no other way through the flank here.',
      hazards: [{ id: 'gas-pocket', name: 'Gas pocket under the lip', tier: 1, discovery: 'taste-water', trigger: ['kinetic-hit', 'strike', 'momentum'], clockGate: null, amount: 6, type: 'Kinetic', targets: 'site', save: null, conditions: ['Jostled'], bandShift: 1, frequency: 'per-cycle', counter: ['vent-pocket', 'Brace reaction: no damage halved twice, and 2 free Drifts'], afterFiring: null }],
      harvest: { site: null },
      awards: [{ id: 'in-clean', on: 'arrive:soft-field with flag:toll-settled and fold-sentinel not destroyed', codon: 15, once: true }],
      secrets: [{ tier: 1, text: 'Bare patches of old biomass on the wound lip.' }, { tier: 2, text: 'The floor is humming: something light is welling up under the lip.' }, { tier: 2, text: 'The drone fold faces the wrong way: its gate points inward.' }],
      danger: { rating: 'Easy', bsp: 6, announce: false }, lesson: 'The roll.',
    },
    {
      id: 'soft-field', name: 'The Soft Field', cite: '8.2, 7.2',
      readAloud: 'Hanging sheets of lipid, cut lanes sweet with Guild claim-line, tally-sleds empty on their cable. At the centre stands the Tally Post, where a cut is weighed, graded and stamped. The tools are stacked and unblooded.',
      medium: { tonic: 'isotonic', viscosity: 1, flow: 1, modifiers: [] },
      zones: [
        { id: 'near-panels', name: 'The near panels', band: 'mid', tags: [], note: 'the Medusa nest is in one of them' },
        { id: 'far-panels', name: 'The far panels', band: 'far', tags: [], note: 'clean, unclaimed' },
        { id: 'tally-post', name: 'The Tally Post', band: 'near', tags: [], note: 'centre of the field' },
        { id: 'slough', name: 'Slough patches', band: 'mid', tags: ['difficult'], note: 'visible after CARCASS 1' },
      ],
      exits: [{ to: 'render-hall', name: 'the cut-lane to the stomach', open: 'not-in-fight' }, { to: 'left-with-cut', name: 'the sled-cable to the surface', open: 'not-in-fight' }, { to: 'toll-vent', name: 'back up the cut-lane', open: 'not-in-fight' }],
      creatures: [
        { block: 'glaze-medusa', count: 2, band: 'mid', present: 'on-arrival', stance: 'guarding', hostileOn: ['enter-zone:near-panels', 'strike'], note: 'Defending a nest. A Cohort that takes the far panels gets the same harvest with less blood.' },
        { block: 'hijack-mite', count: 2, band: 'mid', present: 'on:enter-zone:near-panels', stance: 'hostile' },
        { block: 'hijack-mite', count: 2, band: 'mid', present: 'on:enter-zone:near-panels', stance: 'hostile', needs: 'visited:render-hall', gap: '"Add 2 more Mites once the Cohort has got Lesson 4." Proposed test: the Render Hall has been visited.' },
      ],
      npcs: [{ id: 'tally-clerk', name: 'the Tally Post clerk', wants: 'a cut it can stamp under some claim', offers: [{ id: 'priced-choice', gives: 'a stamp', price: 'one row of the d12 table, rolled once' }], says: ['the ledger\'s last entry: CLAIM VOID - SEE NETH', 'unstamped, the cut is worth nothing outside'] }],
      pricedChoice: {
        roll: 'd12, once, when the Cohort first reaches the post', rows: [
          { on: [1, 2], offer: 'stamp under the first crew\'s void claim', effects: ['flag:claim-void-crew'], price: 'the Ash call it grave-robbing; the Guild will not notice for two Beats' },
          { on: [3, 4], offer: 'stamp under Tallow Ring\'s second sale', effects: ['flag:claim-second-sale'], price: 'free; the first buyer\'s crew will come to collect' },
          { on: [5, 6], offer: 'a Guild tally-stamp', effects: ['haul:-1/3', 'clock:TOLL:-1', 'flag:claim-guild'], price: 'a third of the haul' },
          { on: [7, 8], offer: 'an Ash Unwasted seal on the panel being cut', effects: ['grade:+1', 'flag:claim-ash'], price: 'the cut is slower: that panel does not rewind CARCASS', gap: '"CARCASS -1 for that panel only" is unclear. Proposed: the panel-opens trigger is skipped for that cut.' },
          { on: [9], offer: 'a drone licence: Order II stamps it', effects: ['clock:TOLL:-1', 'flag:registered-order-ii'], price: 'the drones consider you registered, including for what the brood needs' },
          { on: [10], offer: 'no stamp: the clerk is a client of Neth', effects: [], price: 'a Signal Discourse roll at Standard, or 10 to 30 S in samples, fixes it', gap: 'The contest is not specified. Proposed: AFF + Signal Discourse at Standard, or pay 20 S.' },
          { on: [11], offer: 'a stamp now for a favour at the Gut Stone', effects: ['flag:claim-favour', 'flag:owes-clerk'], price: 'the favour arrives at the Gut Stone' },
          { on: [12], offer: 'the post is empty, the scale still warm', effects: ['clock:HUNGER:+1', 'reveal:pump-shaft-open'], price: 'someone was here minutes ago' },
        ],
      },
      interactables: [
        { id: 'read-ledger', name: 'Read the post\'s ledger', action: null, onSuccess: ['reveal:2', 'roll:priced-choice'] },
        { id: 'scout-far', name: 'Scout the far panels', action: 'sense', pool: 'DFF + Fluid Navigation', threshold: T('common'), unhurried: true, onSuccess: ['flag:far-lane-marked', 'advantage:cut-panel'], gap: 'No Threshold is printed. Proposed Common.' },
        { id: 'cut-panel', name: 'Cut a hanging panel', action: 'harvest', pool: 'OSM or RTC + Synthesis', threshold: T('standard'), unhurried: true, needs: 'far panels, or the nest dealt with', onSuccess: ['yield:site', 'event:panel-opens'], onFailure: ['yield:substrate-only'], cite: 'Tier 1: AT 12' },
        { id: 'stamp-cut', name: 'Have the cut weighed and stamped', action: null, needs: 'unstamped Specimens and any claim flag', onSuccess: ['stamp:all', 'award:stamped'], once: false },
        { id: 'drop-panel', name: 'Cut a panel loose to cloud the lane', action: 'strike', needs: 'a Kinetic hit with 4+ Overflow on a panel', onSuccess: ['site-modifier:all pools -2 dice', 'blind:glaze-medusa'], cite: '8.2 weakness' },
        { id: 'salt-slough', name: 'Salt a slough patch', action: 'synthesise', needs: 'salt', onSuccess: ['disarm:slough'] },
        { id: 'salt-cache', name: 'Take the first crew\'s salt cache', action: null, needs: 'found:salt-cache', onSuccess: ['gain:60 S of salt', 'note: salt spent rewinds CARCASS by 1'], gap: 'Where the cache is and how it is found is not in the coded data. Proposed: revealed by scout-far.' },
      ],
      nothingElse: 'The stacked tools are ordinary and the sleds are empty; nothing else here can be worked.',
      hazards: [{ id: 'slough', name: 'Slough patches', tier: 1, discovery: 'seen once CARCASS is 1 or more', trigger: ['in-zone:slough'], clockGate: { clock: 'CARCASS', at: 3 }, amount: 1, type: 'Lytic', targets: 'zone:slough', save: null, conditions: [], bandShift: 0, soak: 1, frequency: 'standing', counter: ['cross on the hanging panels', 'salt-slough'], afterFiring: null, note: 'Below CARCASS 3 it only slows: -1 Drift per move, and soak 1 for a body standing in it.' }],
      harvest: { site: { what: 'the hanging lipid panels', tier: 1, threshold: T('standard'), yield: 'C1 to each organism in the picking order per panel; grade by CARCASS', event: 'panel-opens', gap: 'The grade-by-CARCASS table is in Vector 7.2 and was not in the coded data. The yield shown is what the benches paid.' } },
      awards: [{ id: 'stamped', on: 'stamp-cut', codon: 20, once: true }],
      secrets: [{ tier: 1, text: 'A tally-sled loaded with nothing but tools.' }, { tier: 2, text: 'A sweet current coming up from deeper in.' }, { tier: 2, text: 'A drone escort moving into the whale, not out.' }, { tier: 3, text: 'A stamped cut is 40 to 120 S, only if the claim stands.' }],
      danger: { rating: 'Easy', bsp: 6, announce: false }, lesson: 'The harvest. This is the Ledger\'s room.',
    },
    {
      id: 'render-hall', name: 'The Render Hall', cite: '8.3',
      readAloud: 'The stomach is still warm and still churning; the fluid pulls at you. A Hegemony pump barge and its crew of nine run a hose near the entrance. Dry ribs line the wall. At the bottom lies the still, hot and quiet.',
      medium: { tonic: 'hypertonic', viscosity: 2, flow: 3, modifiers: [{ id: 'wrong-tonic', dice: -1, unless: 'prepared', gap: 'Printed as "-1 to -2 unless prepared". Proposed: -1; -2 for a body in the churn; a Neutraliser or an Osmotic Filter counts as prepared.' }] },
      zones: [
        { id: 'pump', name: 'The pump', band: 'near', tags: [], note: 'the barge and its hose; loud' },
        { id: 'churn', name: 'The churn', band: 'mid', tags: ['current', 'difficult'], note: 'drags a body 1 band per Cycle unless it wins Fluid Navigation at Standard' },
        { id: 'enzyme-floor', name: 'The mid floor', band: 'mid', tags: [], note: 'the Enzyme Field' },
        { id: 'dry-ribs', name: 'The dry ribs', band: 'mid', tags: ['advantage:strike'], note: 'walkable along the wall, out of the field and the churn' },
        { id: 'still', name: 'The still', band: 'contact', tags: [], note: 'at the bottom; the first crew\'s four bodies' },
      ],
      exits: [{ to: 'brood', name: 'the pyloric channels, up', open: 'not-in-fight' }, { to: 'left-with-cut', name: 'the pump shaft', open: 'not-in-fight' }, { to: 'soft-field', name: 'back down the cut-lane', open: 'not-in-fight' }],
      creatures: [
        { block: 'cytoplasmic-bleeder', count: 3, band: 'mid', present: 'on-arrival', stance: 'hunting', hostileOn: ['enter-zone:enzyme-floor', 'enter-zone:churn', 'strike', 'pump-opened'], note: 'They want the warm fluid and the plasma in it.' },
        { block: 'detritus-feeder', count: 2, band: 'contact', present: 'on-arrival', stance: 'indifferent', hostileOn: ['strike'], note: 'At the still, on the first crew. In a fight they Render the four bodies, one each per turn.' },
      ],
      npcs: [
        { id: 'barge-crew', name: 'the Hegemony pump crew (nine)', wants: 'to finish the shift', offers: [], says: ['what the pump does', 'they are Guild-licensed and will see who touched it'] },
        { id: 'osk', name: 'Pump-Hand Osk', wants: 'not to die', stats: { mt: 12, mi: 24 }, scripted: 'Taken by the churn on the Cycle after loud:render-hall: he goes Dormant with a Countdown running.', offers: [], says: ['once stabilised: where the Gut Stone lies'] },
      ],
      interactables: [
        { id: 'taste-haze', name: 'Taste the haze on the mid floor', action: 'sense', pool: 'OSM + Chemoreception', threshold: { printed: 14 }, unhurried: true, onSuccess: ['discover:enzyme-field', 'reveal:2'] },
        { id: 'walk-ribs', name: 'Go along the dry ribs', action: 'drift', onSuccess: ['move:dry-ribs'], note: 'No roll. Avoids the field and the churn.' },
        { id: 'open-pump', name: 'Seize or open the pump', action: 'synthesise', pool: 'RTC + Synthesis, or VSC + Vigour to seize it', threshold: T('standard'), onSuccess: ['event:pump-opened', 'disarm:enzyme-field', 'site-modifier:creatures -2 dice', 'reveal:pump-shaft-open'], onFailure: ['the crew turn hostile to the attempt'], gap: 'No pool or Threshold is printed, nor a number for "both Orders lose their footing". Proposed as shown.' },
        { id: 'read-dead', name: 'Read the first crew\'s bodies', action: 'sense', pool: 'OSM + Sequence Reading', threshold: T('standard'), unhurried: true, needs: 'at the still; a body not yet Rendered', onSuccess: ['reveal:3', 'flag:knows-stone'], gap: 'Printed as "worth a read, not a haul" with no roll. Proposed as shown. Benches: the Feeders Rendered all four before anyone read them.' },
        { id: 'stabilise-osk', name: 'Stabilise Osk', action: 'stabilise', pool: 'RTC + Synthesis', threshold: { printed: 13 }, needs: 'Osk Dormant; at Contact', onSuccess: ['flag:knows-stone', 'award:stranger'], cite: 'AT 12 + Level' },
      ],
      nothingElse: 'Only the pump can be worked here; the ribs, the hose and the barge do nothing else.',
      hazards: [
        { id: 'enzyme-field', name: 'Enzyme Field', tier: 2, discovery: 'taste-haze', trigger: ['enter-zone:enzyme-floor', 'strike:in-zone:enzyme-floor'], clockGate: null, amount: 8, type: 'Lytic', targets: 'one', save: null, conditions: [], bandShift: 0, soakLoss: 1, frequency: 'per-cycle', counter: ['open-pump', 'walk-ribs'], afterFiring: null },
        { id: 'churn-drag', name: 'The churn', tier: 2, discovery: 'seen', trigger: ['in-zone:churn'], clockGate: null, amount: 0, type: null, targets: 'one', save: { pool: 'DFF + Fluid Navigation', threshold: T('standard'), onSuccess: 'none' }, conditions: [], bandShift: 1, frequency: 'per-cycle', counter: ['walk-ribs'], afterFiring: null },
      ],
      harvest: { site: null },
      awards: [{ id: 'stranger', on: 'stabilise-osk', codon: 20, once: true }],
      secrets: [{ tier: 1, text: 'Everything in the stomach is scoured clean except one warm, swollen plug.' }, { tier: 2, text: 'The haze has a sheen: it strips membrane.' }, { tier: 3, text: 'From the still you can see where the plug lies: the far curve of the gut.' }],
      danger: { rating: 'Standard', bsp: 8, announce: false }, lesson: 'The Pulse War: terrain is the main character.',
    },
    {
      id: 'brood', name: 'The Brood of the Not-Whale', cite: '8.4',
      readAloud: 'A chamber that should not exist in a dead animal: warm, lit and sweet. Three hundred blind juveniles, whale-shaped but wrong, circle a warm shard of slag. At the gate a grey drone elder has set up a customs post, with forms.',
      medium: { tonic: 'isotonic', viscosity: 1, flow: 1, modifiers: [] },
      zones: [{ id: 'customs-post', name: 'The customs post', band: 'contact', tags: [], note: 'at the gate' }, { id: 'brood-channels', name: 'The brood-channels', band: 'mid', tags: ['current'], note: 'a sweet current' }, { id: 'nursery', name: 'The fold-nursery', band: 'far', tags: [], note: 'around the warm shard' }],
      exits: [{ to: 'gut-stone', name: 'the pyloric duct', open: 'not-in-fight' }, { to: 'render-hall', name: 'back the way you came', open: 'not-in-fight' }],
      creatures: [
        { block: 'receptor-lurker', count: 2, band: 'near', present: 'on:brood-cut', stance: 'hostile', alsoPresentOn: ['strike'] },
        { block: 'drifter-shoal', count: 3, band: 'mid', present: 'on:brood-cut', stance: 'hostile', alsoPresentOn: ['strike'] },
      ],
      npcs: [{ id: 'nine-folds', name: 'Nine-Folds, the drone elder', wants: 'the brood registered: a witness, a signature, and a body that can hold paper', offers: [{ id: 'register', gives: 'a Name, the Choir\'s goodwill and a G Specimen', price: 'the Cohort signs the claim of what the not-whale is' }, { id: 'tell', gives: 'what the brood is', price: 'a registration signature' }], says: ['what the brood is worth cut: 400 to 900 S, and what it costs'] }],
      interactables: [
        { id: 'smell-brood', name: 'Smell what the brood is', action: 'sense', pool: 'OSM + Chemoreception', threshold: T('standard'), unhurried: true, onSuccess: ['reveal:3', 'award:not-whale', 'flag:knows-brood'], gap: 'No Threshold printed. Proposed Standard.' },
        { id: 'register', name: 'Register the brood', action: null, needs: 'flag:knows-brood or Nine-Folds\' telling; one organism signs', setPiece: 'registration', onSuccess: ['event:brood-registered', 'flag:named', 'gain:1 G'] },
        { id: 'cut-brood', name: 'Cut the brood', action: 'harvest', pool: 'OSM or RTC + Synthesis', threshold: T('standard'), onAttempt: ['event:brood-cut'], onSuccess: ['gain:400 + 100 x Overflow S, to 900'], gap: '"400 to 900 S" has no rule for the amount. Proposed: 400 plus 100 per point of Overflow, capped at 900.' },
      ],
      nothingElse: 'The shard is only warm; the forms mean nothing unless signed.',
      hazards: [], harvest: { site: null },
      awards: [{ id: 'not-whale', on: 'smell-brood or offer:tell', codon: 25, once: true }],
      secrets: [{ tier: 1, text: 'The juveniles have six fins where a Drifter has four.' }, { tier: 2, text: 'The room feels like being asked questions.' }, { tier: 3, text: 'The brood\'s chemistry matches the slag, not the whale: the whale was herding it.' }],
      danger: { rating: 'Standard', bsp: 7, announce: false, note: 'Only if the brood is startled.' }, lesson: 'The law and the ledger.',
    },
    {
      id: 'gut-stone', name: 'The Gut Stone', cite: '8.5',
      readAloud: 'A plug of fused slag, gut-crud and salt, thirty Drifts across, wedged in the curve of the gut. It is warm. A field of shards drifts before it and an acid halo clings to its face. One shaft leads up.',
      medium: { tonic: 'mixed', viscosity: 3, flow: 4, modifiers: [] },
      zones: [
        { id: 'stone-face', name: 'The stone face', band: 'contact', tags: [], note: 'inside the acid halo' },
        { id: 'shard-field', name: 'The shard field', band: 'mid', tags: ['difficult'], note: 'everything cuts', gap: '"Difficult ground; everything cuts" has no numbers. Proposed: Drifting through costs 1 extra Pulse Point; no damage.' },
        { id: 'exit-shaft', name: 'The exit shaft', band: 'far', tags: [], note: 'up to the Render Hall\'s pump' },
      ],
      exits: [{ to: 'escaped', name: 'the exit shaft', open: 'always', note: 'during the chase this is the finish line' }, { to: 'brood', name: 'the pyloric duct', open: 'not-in-fight' }],
      creatures: [
        { block: 'protease-warden', count: 1, band: 'mid', present: 'on-arrival', stance: 'will-talk', hostileOn: ['strike', 'take:canister'], standsDownOn: ['flag:serial-carried', 'clock:TOLL:5'], note: 'It wants the canister intact. Neither claimant is evil.' },
        { block: 'cytoplasmic-bleeder', count: 2, band: 'mid', present: 'on-arrival', stance: 'guarding', hostileOn: ['strike'] },
        { block: 'antigen-gnat', count: 4, band: 'far', present: 'on-arrival', stance: 'guarding', hostileOn: ['strike'] },
        { block: 'lattice-guardian', count: 1, band: 'contact', present: 'on:take:canister', stance: 'guarding', standsDownOn: ['flag:job-complete'], gap: 'The play note names a Lattice Guardian folded around the print job, but it is not in the encounter list or the 12 BSP. Proposed: it wakes only if the canister is taken, and is not counted in the rating.' },
      ],
      npcs: [{ id: 'warden', name: 'the Protease Warden\'s recovery team', wants: 'the canister intact', offers: [{ id: 'carry-serial', gives: '200 + 50 x Overflow S, to 400, on delivery', price: 'carry the serial into a Hegemony office and say it aloud' }], says: ['a price, once the serial is said aloud'] }],
      interactables: [
        { id: 'find-serial', name: 'Taste the halo and find the serial', action: 'sense', pool: 'OSM + Chemoreception', threshold: T('standard'), unhurried: true, onSuccess: ['reveal:3', 'flag:knows-serial'], gap: 'No Threshold printed. Proposed Standard.' },
        { id: 'say-serial', name: 'Say the serial aloud to the Warden', action: null, needs: 'flag:knows-serial', onSuccess: ['offer:carry-serial'] },
        { id: 'accept-carry', name: 'Agree to carry the serial', action: 'swear', needs: 'offer:carry-serial', onSuccess: ['oath:file', 'flag:serial-carried'] },
        { id: 'slip-past', name: 'Mask the Cohort and slip to the stone face', action: 'drift', pool: 'OSM + Concealment', threshold: T('severe'), onSuccess: ['move:stone-face unseen'], onFailure: ['all organisms Marked'], gap: 'No Threshold printed. Proposed Severe (the Warden reads the room for a living); failure Marks the Cohort.' },
        { id: 'convince-guardian', name: 'Convince the Guardian the job is complete', action: null, needs: 'the Guardian awake', setPiece: 'registration', onSuccess: ['flag:job-complete'], gap: 'No procedure printed. Proposed: the same three-exchange procedure as the brood.' },
      ],
      nothingElse: 'The stone itself cannot be cut: slag, salt and acid.',
      hazards: [{ id: 'render-charge', name: 'The Render Charge', tier: null, discovery: 'the TOLL Clock; players see it', trigger: ['clock:TOLL:5'], clockGate: { clock: 'TOLL', at: 5 }, amount: 20, type: 'Kinetic', targets: 'site', save: null, conditions: [], bandShift: 2, frequency: 'once', counter: ['be gone before TOLL 5'], afterFiring: 'setPiece:the-race' }],
      harvest: { site: null },
      awards: [],
      secrets: [{ tier: 1, text: 'The stone is warm, and something inside it leaks.' }, { tier: 2, text: 'Two things claim this room: an armoured recovery team, and something folded still inside the stone.' }, { tier: 3, text: 'The canister\'s serial is in a format retired before your lineage was written.' }],
      danger: { rating: 'Deadly', bsp: 12, announce: true }, lesson: 'The ending.',
    },
  ],

  setPieces: [
    { id: 'the-race', kind: 'chase', cite: 'Core 4.14', steps: ['The Pulse War ends. Creatures not at the stone face stand down; the Warden leaves with the flow.', 'Each Cycle every organism that is Up rolls DFF + Fluid Navigation at Standard. A carrier of a Dormant body rolls 1 die fewer.', 'Success: move one band toward the exit shaft. Failure: stay.', 'An organism at the shaft is out. After 3 Cycles the curve closes: anyone not out is lost with the carcass.'], rolls: 'DFF + Fluid Navigation, Standard', win: 'ending:escaped', lose: 'ending:carcass-ends', gap: 'The Vector says only "Not survived: raced", and the Core chase is three lines. Benches improvised it and asked a Dormant organism for a throw. Proposed procedure as shown; the 3-Cycle limit is mine.' },
    { id: 'registration', kind: 'exchange', cite: 'Core 11.2 (Stakes Ladder)', steps: ['The Director states what success buys before any roll.', 'Three exchanges. In each, one organism speaks and rolls AFF + Signal Discourse at Standard.', 'Two successes: the claim is signed. Fewer: the offer stands but its price rises one step.'], rolls: 'AFF + Signal Discourse, Standard', win: 'the interactable\'s onSuccess', lose: 'no change; may be tried once more at a cost', gap: 'The Vector says "three exchanges, Stakes Ladder visible" with no roll. Proposed as shown.' },
  ],
  endings: [
    { id: 'escaped', when: 'at least one organism leaves by the exit shaft after the Render Charge', says: 'Out of the whale, with whatever you carried.' },
    { id: 'left-with-cut', when: 'the Cohort leaves by the sled-cable or pump shaft', says: 'You leave with your cut; stamped or not decides what it was worth.' },
    { id: 'walked-away', when: 'the Cohort leaves by the Toll Reach', says: 'The queue closes behind you.' },
    { id: 'carcass-ends', when: 'the race is lost, or every organism is Dormant when the Render Charge fires', says: 'The carcass ends with you in it.' },
    { id: 'whale-goes-over', when: 'CARCASS is full', says: 'The whale goes over; nothing left in it is worth cutting.', gap: 'What "the whale goes over" does to a Cohort still inside is not in the coded data.' },
    { id: 'render-cascade', when: 'HUNGER is full', says: 'The Render Cascade: everything in the Reach arrives at once.', gap: 'No procedure in the coded data.' },
  ],
};

// ---- Validator checklist ----------------------------------------------------------------------
const rungs = core.ladder.map((r) => r.id);
const siteIds = vector.sites.map((s) => s.id);
const endIds = vector.endings.map((e) => e.id);
const blocks = Object.fromEntries(bestiary.creatures.map((c) => [c.id, c]));
const checks = [];
const check = (name, bad) => checks.push({ name, ok: bad.length === 0, detail: bad.join('; ') });
check('Every exit leads to a site or an ending', vector.sites.flatMap((s) => s.exits.filter((e) => !siteIds.includes(e.to) && !endIds.includes(e.to)).map((e) => `${s.id} -> ${e.to}`)));
check('Every creature exists in the Bestiary', vector.sites.flatMap((s) => s.creatures.filter((c) => !blocks[c.block]).map((c) => `${s.id}: ${c.block}`)));
check('Every creature used is fully converted (the Engine can run it)', [...new Set(vector.sites.flatMap((s) => s.creatures.filter((c) => blocks[c.block] && blocks[c.block].converted !== 'full').map((c) => c.block)))]);
check('Every Threshold is a ladder rung or a printed number', vector.sites.flatMap((s) => s.interactables.filter((i) => i.pool && !(rungs.includes(i.threshold) || (i.threshold && typeof i.threshold.printed === 'number'))).map((i) => `${s.id}/${i.id}`)));
const hz = ['id', 'trigger', 'amount', 'type', 'targets', 'frequency', 'counter', 'bandShift'];
check('Every hazard has all its fields', vector.sites.flatMap((s) => s.hazards.flatMap((h) => hz.filter((f) => h[f] === undefined).map((f) => `${s.id}/${h.id}: ${f}`))));
check('Every hazard that hits the whole site says how often', vector.sites.flatMap((s) => s.hazards.filter((h) => h.targets === 'site' && !['per-cycle', 'per-scene', 'once'].includes(h.frequency)).map((h) => `${s.id}/${h.id}`)));
const budget = bestiary.budgets.perCohortOfFour[0];
const rate = (bsp) => (bsp >= budget.deadly - 1 ? 'Deadly' : bsp >= budget.hard ? 'Hard' : bsp >= budget.standard ? 'Standard' : 'Easy');
const bspOf = (s) => s.creatures.filter((c) => !c.gap && !c.needs).reduce((a, c) => a + c.count * bestiary.budgets.bsp[blocks[c.block].cls], 0);
check('Printed BSP matches the creature list', vector.sites.filter((s) => bspOf(s) !== s.danger.bsp).map((s) => `${s.id}: printed ${s.danger.bsp}, counted ${bspOf(s)}`));
check('Deadly sites are announced', vector.sites.filter((s) => s.danger.rating === 'Deadly' && !s.danger.announce).map((s) => s.id));
check('Every award is a number', vector.sites.flatMap((s) => s.awards.filter((a) => typeof a.codon !== 'number').map((a) => `${s.id}/${a.id}`)));
check('Every Clock trigger names a real Clock', vector.clockTriggers.filter((t) => !vector.clocks.some((c) => c.id === t.clock)).map((t) => t.event));
check('Every site has a nothing-else line and a read-aloud', vector.sites.filter((s) => !s.nothingElse || !s.readAloud).map((s) => s.id));
const words = (t) => String(t).split(/\s+/).filter(Boolean).length;

// ---- Gap list and briefings -------------------------------------------------------------------
const gaps = [];
(function walk(node, path) {
  if (Array.isArray(node)) return node.forEach((x, i) => walk(x, `${path}/${(x && (x.id || x.block || x.event)) || i}`));
  if (node && typeof node === 'object') {
    if (node.gap) gaps.push({ where: path.replace(/^\/sites\//, '').replace(/^\//, ''), gap: node.gap });
    for (const [k, v] of Object.entries(node)) if (v && typeof v === 'object') walk(v, k === 'sites' || /^(interactables|hazards|creatures|zones|rows|modifiers)$/.test(k) ? path : `${path}/${k}`);
  }
}(vector, ''));

const ladderWord = (c) => blocks[c.block].ladder[0];
const brief = (s) => [
  `SITE: ${s.name}. ${s.readAloud}`,
  `HERE: ${s.creatures.filter((c) => c.present === 'on-arrival').map((c) => `${c.count} ${blocks[c.block].name} (${c.stance}; looks: ${ladderWord(c)})`).join('; ') || 'no creatures in sight'}.`,
  s.npcs.length ? `WHO: ${s.npcs.map((n) => `${n.name} wants ${n.wants}`).join('; ')}.` : '',
  `CAN BE DONE: ${s.interactables.map((i) => i.name).join('; ')}. ${s.nothingElse}`,
  `WAYS OUT: ${s.exits.map((e) => e.name).join('; ')}.`,
  `SEEN ON ARRIVAL: ${s.secrets.filter((x) => x.tier === 1).map((x) => x.text).join(' ')}`,
  s.danger.announce ? 'SAY FIRST: "This is Deadly."' : '',
  `TEACHES: ${s.lesson}`,
].filter(Boolean).join('\n');
const briefings = Object.fromEntries(vector.sites.map((s) => [s.id, brief(s)]));
check('Every site briefing is 300 words or fewer', vector.sites.filter((s) => words(briefings[s.id]) > 300).map((s) => `${s.id}: ${words(briefings[s.id])}`));

out('vectors/first-carve.json', JSON.stringify({ ...vector, briefings }, null, 1));
out('vectors/vector-schema.json', JSON.stringify({ fields: schema.map(([field, holds, usedBy]) => ({ field, holds, usedBy })), events: events.map(([id, means]) => ({ id, means })) }, null, 1));

// ---- Documents ----------------------------------------------------------------------------------
const fmt = `# The Vector format

Version 0.1 draft, 15 November 2026. A Vector is a playable module. This format puts every fact the Engine must enforce into fields, and leaves prose only where a person or the Director reads it. The worked example is \`THE-FIRST-CARVE-engine-ready.md\` (data: \`first-carve.json\`).

## 1. Fields

${table(schema.map(([field, holds, usedBy]) => ({ field, holds, usedBy })), [['Part', 'field'], ['Holds', 'holds'], ['Read by', 'usedBy']])}

## 2. Events: the closed list

Triggers, hazards, awards and creature stances may name only these.

${table(events.map(([id, means]) => ({ id, means })), [['Event', 'id'], ['Means', 'means']])}

## 3. Rules of the format

${bullets([
  'A Threshold is a rung of the Core ladder by name, or a number the Vector prints. The Director never picks a number.',
  'A hazard is a record. One that hits the whole site is one firing for everyone, and says how often it may fire.',
  'A Clock moves only on a listed trigger, or on the Director\'s one discretionary segment per Clock per session.',
  'Creatures are placed by the Vector: where they start, how they stand toward the Cohort, what turns them, what stands them down. The Director does not bring creatures in.',
  'Each site lists what can be acted on. The Director\'s tools at that site are built from the list; anything else gets the site\'s "nothing else" line.',
  'Prices and awards are numbers. A printed range comes with the rule for picking within it.',
  'A set piece (a chase, a negotiation) is a procedure with steps, a roll, and a win and a lose state.',
  'The Director is given a generated briefing per site of at most 300 words, with creature wound-ladder words and no creature numbers.',
])}

## 4. Validator checklist

A program runs these on any Vector before it is played. Results for The First Carve:

${table(checks, [['Check', 'name'], ['Result', (c) => (c.ok ? 'pass' : `FAIL: ${c.detail}`)]])}

## 5. What each bench error maps to

${table([
  ['Hazard called once per organism, then every Cycle', 'hazards[].targets and hazards[].frequency'],
  ['Hazard fired early or after a success', 'hazards[].trigger and clockGate'],
  ['Clocks moved on judgement', 'clockTriggers[]'],
  ['Move to the site already occupied; asked instead of moved', 'exits[] with an open test; the Engine moves on a stated exit'],
  ['Invented pump, goods, routes', 'interactables[] and nothingElse'],
  ['Thresholds and modifiers chosen on the spot', 'interactables[].threshold; medium.modifiers; zone tags'],
  ['Prices and awards as sentences', 'npcs[].offers, pricedChoice.rows[].effects, awards[]'],
  ['Creatures brought in unasked', 'creatures[].present and stance'],
  ['The ending improvised', 'setPieces[] and endings[]'],
  ['Encounter code said aloud', 'danger.announce: the Engine says "This is Deadly"'],
].map(([e, f]) => ({ e, f })), [['Bench error', 'e'], ['Field that prevents it', 'f']])}

## 6. Not yet tested

The format has been filled for one Vector. The Long Swallow, The Ninth Shift and What the Water Owed have not been converted, so whether the fields are enough for them is unknown.
`;
out('vectors/VECTOR-FORMAT.md', fmt);

const siteMd = (s) => `## ${s.name} *(Vector ${s.cite})*

> ${s.readAloud}

**Medium:** ${s.medium.tonic}, viscosity ${s.medium.viscosity}, flow ${s.medium.flow}${s.medium.modifiers.length ? `; ${s.medium.modifiers.map((m) => `${m.id} ${m.dice} dice unless ${m.unless}`).join('; ')}` : ''}. **Danger:** ${s.danger.rating}, ${s.danger.bsp} BSP${s.danger.announce ? ', announced before it starts' : ''}${s.danger.note ? ` (${s.danger.note})` : ''}. **Teaches:** ${s.lesson}

${table(s.zones, [['Zone', 'name'], ['Band', 'band'], ['Tags', 'tags'], ['Note', 'note']])}

**Exits:** ${s.exits.map((e) => `${e.name} -> \`${e.to}\` (${e.open})`).join('; ')}.

**Creatures**
${table(s.creatures, [['Creature', (c) => `${c.count} x ${blocks[c.block] ? blocks[c.block].name : c.block}`], ['Band', 'band'], ['Present', 'present'], ['Stance', 'stance'], ['Turns hostile on', 'hostileOn'], ['Stands down or leaves on', (c) => [...(c.standsDownOn || []), ...(c.leavesOn || [])]], ['Note', 'note']])}

${s.npcs.length ? `**Who is here**\n${table(s.npcs, [['Who', 'name'], ['Wants', 'wants'], ['Offers', (n) => n.offers.map((o) => `${o.gives} for ${o.price}`)], ['Will say', 'says']])}\n` : ''}
${s.pricedChoice ? `**The priced choice** (${s.pricedChoice.roll})\n${table(s.pricedChoice.rows, [['d12', (r) => r.on.join('-')], ['Offer', 'offer'], ['Price', 'price'], ['Engine effects', 'effects']])}\n` : ''}
**What can be done here**
${table(s.interactables, [['Action', 'name'], ['Pool', 'pool'], ['Threshold', (i) => (i.pool ? (i.threshold.printed ? `${i.threshold.printed} (printed)` : i.threshold) : 'no roll')], ['Unhurried', (i) => (i.unhurried ? 'yes' : '')], ['Needs', 'needs'], ['On success', (i) => [...(i.onAttempt || []).map((x) => `on the attempt: ${x}`), ...(i.onSuccess || [])]], ['On failure', 'onFailure']])}

*Anything else:* ${s.nothingElse}

${s.hazards.length ? `**Hazards**\n${table(s.hazards, [['Hazard', 'name'], ['Trigger', 'trigger'], ['Clock gate', (h) => (h.clockGate ? `${h.clockGate.clock} ${h.clockGate.at}` : '')], ['Effect', (h) => `${h.amount ? `${h.amount} ${h.type}` : 'no damage'}${h.conditions.length ? `, ${h.conditions.join(', ')}` : ''}${h.bandShift ? `, ${h.bandShift}-band shift` : ''}${h.soakLoss ? `, soak -${h.soakLoss} until repaired` : ''}`], ['Hits', 'targets'], ['Save', (h) => (h.save ? `${h.save.pool} at ${h.save.threshold}` : 'none')], ['How often', 'frequency'], ['Counter', 'counter'], ['Then', 'afterFiring']])}\n` : '**Hazards:** none.\n'}
${s.harvest.site ? `**Site harvest:** ${s.harvest.site.what}; Threshold ${s.harvest.site.threshold}; yields ${s.harvest.site.yield}; fires \`${s.harvest.site.event}\`.\n` : ''}
${s.awards.length ? `**Awards:** ${s.awards.map((a) => `${a.codon} Codon on ${a.on}`).join('; ')}.\n` : ''}
**Secrets:** ${s.secrets.map((x) => `(${x.tier}) ${x.text}`).join(' ')}

**Director briefing (${words(briefings[s.id])} words)**

\`\`\`
${briefings[s.id]}
\`\`\`
`;

const fc = `# The First Carve, in the Vector format

Version 0.1 draft, 15 November 2026. Built from the Vector's facts as coded in \`director/data/first-carve.js\`. The story and the balance are unchanged. Data: \`first-carve.json\`.

> ${vector.premise}

**Hands:** ${vector.hands.join(', ')} (see the Player's Atlas edition). **Session zero:** ${vector.sessionZero.join(' ')}

## Clocks

${table(vector.clocks, [['Clock', 'id'], ['Segments', 'segments'], ['Says', 'says'], ['Stages', 'stages'], ['When full', (c) => c.atFull || c.note]])}

**What moves a Clock.** Nothing else does, except ${vector.directorClockAllowance}.

${table(vector.clockTriggers, [['Event', 'event'], ['Clock', 'clock'], ['Change', (t) => (t.change > 0 ? `+${t.change}` : t.change)], ['Limit', 'limit'], ['Where', 'site'], ['Vector', 'cite']])}

${vector.sites.map(siteMd).join('\n')}

## Set pieces

${vector.setPieces.map((p) => `### ${p.id} *(${p.kind}; ${p.cite})*\n\n${steps(p.steps)}\n\n**Roll:** ${p.rolls}. **Win:** ${p.win}. **Lose:** ${p.lose}.`).join('\n\n')}

## Endings

${table(vector.endings, [['Ending', 'id'], ['When', 'when'], ['Says', 'says']])}

## Gap list: ${gaps.length} facts the Vector leaves to the Director today

Each is filled above with a proposal. None is decided.

${table(gaps, [['Where', 'where'], ['Gap and proposal', 'gap']])}

## Validator

${table(checks, [['Check', 'name'], ['Result', (c) => (c.ok ? 'pass' : `FAIL: ${c.detail}`)]])}
`;
out('vectors/THE-FIRST-CARVE-engine-ready.md', fc);
console.log('gaps', gaps.length, 'checks', checks.map((c) => (c.ok ? 'ok' : `FAIL ${c.name}: ${c.detail}`)).join(' | '));
console.log('briefing words', vector.sites.map((s) => words(briefings[s.id])).join(','));
