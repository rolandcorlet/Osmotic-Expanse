# The Vector format

Version 0.1 draft, 15 November 2026. A Vector is a playable module. This format puts every fact the Engine must enforce into fields, and leaves prose only where a person or the Director reads it. The worked example is `THE-FIRST-CARVE-engine-ready.md` (data: `first-carve.json`).

## 1. Fields

| Part | Holds | Read by |
| :-- | :-- | :-- |
| header | id, title, levels, cohortSize, hands[], sessionZero[], premise (2 sentences, read aloud) | Engine, players |
| clocks[] | id, segments, shownToPlayers, says, stages[], atFull (ending id) | Engine, players |
| clockTriggers[] | event, clock, change, limit (per-scene / per-session / none), site (or "any") | Engine. Nothing else moves a Clock except the Director's one discretionary segment per Clock per session. |
| events | The closed list of event ids that triggers, hazards and awards may name. | Engine |
| sites[].id, name, readAloud | 2 to 4 sentences of what a body sees on arrival | players |
| sites[].medium | tonic, viscosity, flow, modifiers[] (Core modifier ids the site applies) | Engine |
| sites[].zones[] | id, name, band, tags[] (cover, squeezed, current, difficult, advantage:<action>), note | Engine, players |
| sites[].exits[] | to (site id or ending id), name, open (always / not-in-fight / needs:<flag>), oneWay | Engine |
| sites[].creatures[] | block, count, band, present (on-arrival / on:<event>), stance (hostile / guarding / hunting / indifferent / will-talk), hostileOn[] (events), standsDownOn[] (flags or events), leavesOn[] | Engine |
| sites[].npcs[] | id, name, wants, offers[] {id, gives, price}, says[] (facts it will state, and for what) | Director briefing; prices to Engine |
| sites[].interactables[] | id, name, action (Core action id), pool, threshold (ladder id or {printed}), unhurried, needs, onSuccess[], onFailure[], reveals (secret tier), once | Engine builds the Director's tools from this list |
| sites[].nothingElse | A sentence the Director may use when a player tries something unlisted. | Director |
| sites[].hazards[] | id, name, tier, discovery, trigger[] (event ids), clockGate, amount, type, targets (one / zone:<id> / site), save, conditions[], bandShift, soak, frequency (per-cycle / per-scene / once / standing), counter[], afterFiring | Engine |
| sites[].harvest | site {what, tier, threshold, yield, event} or null; creatures pay what the Bestiary prints | Engine |
| sites[].awards[] | id, on (event or flag), codon, once | Engine |
| sites[].secrets[] | tier (1 seen on arrival, 2 on a look or taste, 3 on a successful read), text | Director briefing, released by the Engine |
| sites[].danger | rating (Easy / Standard / Hard / Deadly), bsp, announce (true when the rating must be said aloud first) | Engine checks it against the Codex budget |
| sites[].lesson | What the site teaches the table. | Director |
| setPieces[] | id, kind (chase / countdown / exchange), steps[], rolls, win, lose | Engine |
| endings[] | id, when (state test), says | Engine |

## 2. Events: the closed list

Triggers, hazards, awards and creature stances may name only these.

| Event | Means |
| :-- | :-- |
| arrive:<site> | the Cohort enters a site |
| pulse-war-starts | a Pulse War begins (the Vector calls this "loud") |
| strike | any Strike is made at the site |
| kinetic-hit | a Kinetic hit lands |
| momentum | a Momentum Strike is made |
| enter-zone:<zone> | a body enters the zone |
| in-zone:<zone> | a body starts its turn in the zone |
| body-cut | a destroyed creature or the site is harvested |
| body-left | the Cohort leaves a site with a destroyed creature uncut |
| panel-opens | a site harvest opens new tissue |
| oath-filed | an Oath is filed |
| oath-kept | a filed Oath is kept at a cost |
| toll-refused | a body crosses the gate with no claim |
| toll-settled | the toll is paid or sworn |
| pump-opened | the pump is seized or opened |
| brood-cut | the brood is harvested |
| brood-registered | the claim is signed |
| clock:<id>:<n> | that Clock reaches n |
| reconstitution | the Cohort takes a Fugue Interval rest |
| loud:<site> | a Breach, a Dormancy or a Countdown box at that site |

## 3. Rules of the format

- A Threshold is a rung of the Core ladder by name, or a number the Vector prints. The Director never picks a number.
- A hazard is a record. One that hits the whole site is one firing for everyone, and says how often it may fire.
- A Clock moves only on a listed trigger, or on the Director's one discretionary segment per Clock per session.
- Creatures are placed by the Vector: where they start, how they stand toward the Cohort, what turns them, what stands them down. The Director does not bring creatures in.
- Each site lists what can be acted on. The Director's tools at that site are built from the list; anything else gets the site's "nothing else" line.
- Prices and awards are numbers. A printed range comes with the rule for picking within it.
- A set piece (a chase, a negotiation) is a procedure with steps, a roll, and a win and a lose state.
- The Director is given a generated briefing per site of at most 300 words, with creature wound-ladder words and no creature numbers.

## 4. Validator checklist

A program runs these on any Vector before it is played. Results for The First Carve:

| Check | Result |
| :-- | :-- |
| Every exit leads to a site or an ending | pass |
| Every creature exists in the Bestiary | pass |
| Every creature used is fully converted (the Engine can run it) | FAIL: lattice-guardian |
| Every Threshold is a ladder rung or a printed number | pass |
| Every hazard has all its fields | pass |
| Every hazard that hits the whole site says how often | pass |
| Printed BSP matches the creature list | FAIL: toll-vent: printed 6, counted 4 |
| Deadly sites are announced | pass |
| Every award is a number | pass |
| Every Clock trigger names a real Clock | pass |
| Every site has a nothing-else line and a read-aloud | pass |
| Every site briefing is 300 words or fewer | pass |

## 5. What each bench error maps to

| Bench error | Field that prevents it |
| :-- | :-- |
| Hazard called once per organism, then every Cycle | hazards[].targets and hazards[].frequency |
| Hazard fired early or after a success | hazards[].trigger and clockGate |
| Clocks moved on judgement | clockTriggers[] |
| Move to the site already occupied; asked instead of moved | exits[] with an open test; the Engine moves on a stated exit |
| Invented pump, goods, routes | interactables[] and nothingElse |
| Thresholds and modifiers chosen on the spot | interactables[].threshold; medium.modifiers; zone tags |
| Prices and awards as sentences | npcs[].offers, pricedChoice.rows[].effects, awards[] |
| Creatures brought in unasked | creatures[].present and stance |
| The ending improvised | setPieces[] and endings[] |
| Encounter code said aloud | danger.announce: the Engine says "This is Deadly" |

## 6. Not yet tested

The format has been filled for one Vector. The Long Swallow, The Ninth Shift and What the Water Owed have not been converted, so whether the fields are enough for them is unknown.
