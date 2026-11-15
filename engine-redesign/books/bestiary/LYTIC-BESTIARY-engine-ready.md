# The Lytic Bestiary, Engine-ready edition

Version 0.1 draft, 15 November 2026. The data is in `bestiary.json`; this file is the same content for reading. No creature's numbers were changed.

**State of the conversion.** All 68 creatures have their numbers, harvest, class word and a wound ladder in data. The **10 creatures of The First Carve are converted in full**: traits and specials as records, a turn script the Engine can run, morale triggers, a wound ladder written for that body, hit and miss words, and what a careful look reveals. The other 58 have their traits and specials split out by name and cost but the effects are still the book's sentences; they carry an Order-default ladder and morale until someone writes theirs.

## 1. Conventions

- A creature's MI already includes its size class.
- Standards, Elites and Catastrophes may Deflect (Membrane Threshold +4) for a held Pulse Point; swarm clusters may, single Segments may not.
- A creature's damage is Overflow + BD + Effect Value - target soak, minimum 1, as for organisms.
- Creatures spend Pulse Points exactly as players do. One that has spent them all has no Reserve.
- A swarm makes one Strike per two live Segments, at most three. Segments return 1 per Cycle unless the ground is Dry or the swarm is Brittle.
- A wound-ladder step is chosen by the Engine from the share of MI (or Segments) left: over 80%, 60-80%, 35-60%, 15-35%, under 15%, destroyed. The Director is given the phrase, never the number.

## 2. Class words and tier templates

| Class | Say aloud | BSP | MT | MI | BD | Soak | Pool | PP | Segments |
| :-- | :-- | :-- | :-- | :-- | :-- | :-- | :-- | :-- | :-- |
| Swarmling | a swarm, a cluster, a shoal: name its body | 1 | 11+T | 6+4T | T | floor((T-1)/2) | 2+T | 2 | 4+2T |
| Standard | name the creature | 2 | 12+T | 14+8T | 1+T | T | 3+T | 3 |  |
| Elite | the one the others follow | 4 | 13+T | 28+16T | 2+T | T+2 | 4+T | 4 |  |
| Catastrophe | name it, and say the room changes | 10 | 10+T | 70+40T | 4+T | T+3 | 4+T | 5 |  |

## 3. Encounter budgets (Codex 4.1), per Cohort of four

| Levels | Tier | Easy | Standard | Hard | Deadly |
| :-- | :-- | :-- | :-- | :-- | :-- |
| 1-4 | 1 | 5 | 7 | 10 | 13 |
| 5-8 | 2 | 7 | 9 | 12 | 15 |
| 9-12 | 3 | 8 | 10 | 12 | 16 |
| 13-16 | 4 | 9 | 11 | 14 | 17 |
| 17-20 | 5 | 10 | 12 | 14 | 16 |

Cohort of three x0.75, five x1.2, six or more x1.4.

## 4. Turn-script words

A script is an ordered list; the Engine takes the first line whose condition is true, does it, and reads the list again until the creature ends its turn.

**Conditions:** `always` (true); `first-turn` (its first turn of the fight); `cycle:N` (the Cycle number is N); `pp>=N` (it has at least N Pulse Points); `foe-in:<band>` (an organism that is Up is in that band of it); `no-foe-in-reach` (no organism that is Up is within its attack band); `attached` (it has a Barb or Lattice on a host); `corpse-in-contact` (a destroyed creature or Dormant organism is in Contact); `corpse-at-site` (one is anywhere at the site); `marked-foe-in:<band>` (a Marked organism is in that band); `ally-hit-marked` (an ally has just hit a Marked organism); `hurt` (it is at "torn" or worse); `was-attacked` (it was attacked since its last turn); `uses-left:<special>` (the special has uses left); `did-hit` (one of its Strikes hit this turn); `not-braced` (it has not braced this Cycle).

**Targets:** `nearest` (the closest organism that is Up; ties: lowest MI); `slowest` (lowest Flow; ties: nearest); `loudest` (highest Stress; ties: the last organism to roll); `marked` (a Marked organism, else the nearest); `holding-reserve` (an organism holding a Reserve; else nearest); `host` (the organism it is attached to); `read-target` (the organism it used Read on); `crosser` (an organism that entered its Held zone, else the nearest in Contact); `struck` (the organism it hit this turn); `corpse` (the nearest destroyed creature or Dormant organism); `zone` (the zone it stands in or guards).

**Actions:** `strike:<target>` (Strike that target (as many Strikes as its Pulse Points and Segments allow)); `special:<id>:<target>` (use that special); `drift:toward:<target>` (Drift one band toward it); `drift:away` (Drift one band outward); `drift:through` (Drift one band along its line toward the far exit); `brace` (take its Brace trait); `reserve` (hold 1 Pulse Point as a Reserve); `announce` (no action: the Director narrates its intent (a cue, costs nothing)); `end` (end its turn).

## 5. The Director's closed lists

| Ruling | Allowed answers |
| :-- | :-- |
| How a creature reacts when spoken to | ignores; listens; names its price (from its record); turns hostile |
| What a creature does when its script says "announce" | states its aim in world words: narration only |
| A Director-run creature's turn | only the actions and specials its record lists, with their printed costs |
| Standing a creature down | only when a "stops" trigger in its record is true; the Engine does it, the Director narrates it |

## 6. Order defaults *(proposed)*

Used by any creature without its own record.

| Order | Wants | Stops fighting | Wound ladder (unhurt to destroyed) |
| :-- | :-- | :-- | :-- |
| Order I: Lytic Swarms | to eat | never. Hunger does not frighten. | whole and seething / thinned at one edge / ragged, pieces peeling away / a loose scatter barely holding / one last cluster / drifting wreckage |
| Order II: Protein Sentinels | to hold the line | when its post is satisfied or gone. Stands down for a valid claim; the site says what counts. | square and unmarked / scored along one plate / a strut cracked, weeping / leaning, struts failing / one blow from folding / collapsed in pieces |
| Order III: Nutrient Drifters | to feed and be gone | flees at "failing", or once fed. It was never here to fight. | fat and unhurried / nicked, trailing a thread / torn, listing in the flow / half its bulk gone / a wisp / scattered on the current |
| Order IV: Pathogenic Wraiths | to be someone else | withdraws when revealed or at "failing". It needs a host more than a win. | smooth and unreadable / a seam showing / split, leaking threads / coming apart, slow to turn / held together by habit / a slack ruin |
| Order V: Osmotic Brutes | to move you | when the Cohort has left its ground. It wants the space, not the kill. | swollen with pressure / dented / split and venting / sagging, pressure failing / one blow from bursting / burst and spent |
| Order VI: Immune Sentinels | to recognise and purge | withdraws to report at "failing" or when its squad is gone. A report is worth more than a death. | pale kit unmarked / one thin weeping line / plates cracked, moving stiffly / kit hanging open / barely upright / folded and still |
| Order VII: Anomalies | unknown | director. Run by the Director. | wrong in a way that holds / the wrongness flickers / unravelling at the edges / half of it no longer there / a last insistence / gone, and the water forgets |

## 7. Fully converted creatures (The First Carve)

### Gnaw Swarm

*Order I: Lytic Swarms · Swarmling · Tier 1 · Mesoscopic cluster · run by the Engine*

| MT | MI | Soak | BD | Pool | PP | Segments | Flow |
| :-- | :-- | :-- | :-- | :-- | :-- | :-- | :-- |
| 12 | 10 | 0 | 1 Lytic | 3 | 2 | 6 |  |

**Traits**
- **Scent-Led:** cannotStay Blind, longerThan 1 Cycle, if it has smelled the target
- **Corrodes:** onHit targetSoak -1, until repaired, max -3

**Specials**
| Special | PP | When | Target | Save | Effect |
| :-- | :-- | :-- | :-- | :-- | :-- |
| Swarm Over | 2 |  | one organism in Contact | none | strikes one per live Segment, dice -2 |

**On a hit it always takes:** Lytic: -1 soak until repaired (its Corrodes trait)

**Turn script** (first line whose condition is true)
1. if `no-foe-in-reach` then `drift:toward:nearest`
2. if `pp>=2 and foe-in:contact` then `special:swarm-over:nearest`
3. if `pp>=2` then `strike:nearest`
4. if `always` then `end`

**Wants:** to eat. **Stops fighting:** never; whatever the site says it wants (at the Toll-Vent: water).
**Weak to:** area damage; Dry Zones; Thermic: each removes Segments 1 for 1.

**How hurt it looks:** unhurt: "a tight, seething coat of soft segments" · marked: "a few segments peeled loose" · torn: "ragged, shedding pieces in the current" · failing: "a torn net of stragglers" · one blow from gone: "one last clump still biting" · destroyed: "soft pieces tumbling apart"

**Words:** hit: "it flows over the limb and bites", "a dozen small mouths find the seam" · miss: "it breaks around the blow and re-forms", "it bites water"

**A careful look tells the players:** (1) It is many small things in one slime coat; a solid blow takes pieces off it. (2) It bites slowly and eats armour; it cannot be frightened. (3) Heat, dry ground or anything that hits a whole area undoes it fastest.

**Harvest:** C3 / G1 · Codon 1.5 · Threshold 12 · destroyed; harvester Up and at Contact · the C is worth 15 S; a Cohort that ignores these bodies is throwing money away

### Detritus Feeder

*Order I: Lytic Swarms · Swarmling · Tier 1 · run by the Engine*

| MT | MI | Soak | BD | Pool | PP | Segments | Flow |
| :-- | :-- | :-- | :-- | :-- | :-- | :-- | :-- |
| 12 | 10 | 0 | 1 Lytic | 3 | 2 | 6 |  |

**Traits**
- **Acid-Immune:** damageTaken Lytic 0
- **Harvest Instinct:** prefers a corpse over an organism

**Specials**
| Special | PP | When | Target | Save | Effect |
| :-- | :-- | :-- | :-- | :-- | :-- |
| Render | 2 |  | a corpse in Contact | none | corpseHarvestGrade -1, selfSegments 2 |

**On a hit it always takes:** Lytic: -1 soak until repaired

**Turn script** (first line whose condition is true)
1. if `corpse-in-contact and pp>=2` then `special:render:corpse`
2. if `corpse-at-site` then `drift:toward:corpse`
3. if `foe-in:contact and pp>=2` then `strike:nearest`
4. if `always` then `end`

**Wants:** to eat. **Stops fighting:** when no corpse is left at the site: it drifts off; unless one stands on a corpse or strikes it.
**Weak to:** having no corpses to eat: burn, salt or take them.

**How hurt it looks:** unhurt: "fat and busy" · marked: "a swath torn out of it" · torn: "split, leaking what it ate" · failing: "a sagging sack dragging itself" · one blow from gone: "a husk, one blow from flat" · destroyed: "two deflated halves"

**Words:** hit: "it rasps across whatever is nearest", "it bites in passing" · miss: "it is not really aiming at you", "it turns back to the dead"

**A careful look tells the players:** (1) It is here for the dead, not for you. (2) Every body it eats makes it bigger and the body worth less. (3) Acid does nothing to it.

**Harvest:** C3 / G1 · Codon 1.5 · Threshold 12 · destroyed; harvester Up and at Contact · run it as Tier 2 in the Wastes and it yields C4 / G1, Codon 3.5 — which is why Reclaimer crews count the ground before they count the swarm

### Cytoplasmic Bleeder

*Order I: Lytic Swarms · Standard · Tier 1 · Microscopic-Mesoscopic · run by the Engine*

| MT | MI | Soak | BD | Pool | PP | Segments | Flow |
| :-- | :-- | :-- | :-- | :-- | :-- | :-- | :-- |
| 13 | 22 | 1 | 2 Lytic | 4 | 3 |  | 4 |

**Traits**
- **Attach:** onHit barb 1, whileAttached freeStrike target host, dice -1, per Cycle, detach [pool OSM, threshold 14, contest true, damageType [Thermic, Lytic], on the Bleeder]

**Specials**
| Special | PP | When | Target | Save | Effect |
| :-- | :-- | :-- | :-- | :-- | :-- |
| Tap | 2 |  | its host | none | drainMi 3, healSelf 3; 3 uses per fight |

**On a hit it always takes:** Lytic: Brittle

**Turn script** (first line whose condition is true)
1. if `attached and pp>=2 and uses-left:tap` then `special:tap:host`
2. if `attached` then `strike:host`
3. if `no-foe-in-reach` then `drift:toward:slowest`
4. if `pp>=2` then `strike:slowest`
5. if `always` then `end`

**Wants:** to eat. **Stops fighting:** never while attached; drifts off if its host goes Dormant and no other organism is Up.
**Weak to:** being burned off (Thermic or Lytic); a strong sense of self: OSM contest at 14 to detach.

**How hurt it looks:** unhurt: "long, soft and whole" · marked: "a tear along its flank" · torn: "gutted, trailing clear fluid" · failing: "slack, barely turning" · one blow from gone: "a ribbon held together by one thread" · destroyed: "gone flat and empty"

**Words:** hit: "a barb sinks in and it rides", "it lashes and clings" · miss: "it skids off and pulls back for another pass", "the barb finds only water"

**A careful look tells the players:** (1) It looks for whoever cannot get away, then holds on. (2) Once it is on you it drinks; it has only so much thirst. (3) Burn it off, or will it off.

**Harvest:** C4 / G1 / P1 · Codon 3 · Threshold 12 · destroyed; harvester Up and at Contact · its Greater Organ is the Tap Valve: Lytic family, +2 soak, and a Minor Cost of hunger

### Fold Sentinel

*Order II: Protein Sentinels · Standard · Tier 1 · Macroscopic · run by the Engine*

| MT | MI | Soak | BD | Pool | PP | Segments | Flow |
| :-- | :-- | :-- | :-- | :-- | :-- | :-- | :-- |
| 13 | 22 | 1 (braced 2) | 2 Kinetic | 4 | 3 |  | 3 |

**Traits**
- **Brace:** cannotDrift true, mt 2, usesBracedSoak true
- **Load-Bearing:** when takes 10+ from one hit, then cannotBePushed true, cycles 2

**Specials**
| Special | PP | When | Target | Save | Effect |
| :-- | :-- | :-- | :-- | :-- | :-- |
| Present | 3 |  | a zone 3 Drifts wide that it guards | none | zone Held, cycles 3, onCross condition Marked, ppPerDrift 1 |

**On a hit it always takes:** Kinetic: Jostled

**Turn script** (first line whose condition is true)
1. if `first-turn and pp>=3` then `special:present:zone`
2. if `foe-in:contact and pp>=2` then `strike:crosser`
3. if `always` then `end`

**Wants:** to hold the line. **Stops fighting:** when shown a valid claim (the site lists them), or when nothing is left to guard; true.
**Weak to:** an attack from behind it: Membrane Threshold -2; being moved off its post.

**How hurt it looks:** unhurt: "broad, braced and unmarked" · marked: "a crease along one strut" · torn: "a long seam weeping clear fluid" · failing: "the head dipping, struts trembling" · one blow from gone: "a post half-driven out, one blow from folding" · destroyed: "struts snapped, settling against the wall"

**Words:** hit: "the flat of it slams across", "it shoulders you back without leaving its post" · miss: "it swings and does not follow", "the blow stops where its post ends"

**A careful look tells the players:** (1) It holds a way and will not leave it; it cannot turn. (2) It is doing a job: show it the right to pass and it stands aside. (3) From behind it is easy to hit.

**Harvest:** C4 / G1 / P1 · Codon 3 · Threshold 12 · destroyed; harvester Up and at Contact · the Greater Organ is a Brace Node: +2 soak, −1 Flow, Fibrous

### Drifter Shoal

*Order III: Nutrient Drifters · Swarmling · Tier 1 · Microscopic each, Mesoscopic cluster · run by the Engine*

| MT | MI | Soak | BD | Pool | PP | Segments | Flow |
| :-- | :-- | :-- | :-- | :-- | :-- | :-- | :-- |
| 12 | 10 | 0 | 1 Kinetic | 3 | 2 | 8 | 6 |

**Traits**
- **Current-Riders:** inFlow dice 2, cannotBePushed true
- **Shoal Sense:** when any Drifter at the site is attacked, then allDrifters drift away, bands 1

**Specials**
| Special | PP | When | Target | Save | Effect |
| :-- | :-- | :-- | :-- | :-- | :-- |
| Graze | 2 |  | its own zone | none | zone Barren, healSelf 4 |

**On a hit it always takes:** Kinetic: Jostled

**Turn script** (first line whose condition is true)
1. if `hurt and pp>=2` then `special:graze:zone`
2. if `no-foe-in-reach` then `drift:toward:nearest`
3. if `pp>=2` then `strike:nearest`
4. if `always` then `end`

**Wants:** to feed and be gone. **Stops fighting:** flees at "a wisp"; leaves at the start of the next Cycle after it has Grazed, if not attacked since.
**Weak to:** still water: cut off the current and it loses its edge; area effects.

**How hurt it looks:** unhurt: "fat with the flow, moving as one" · marked: "thinner on one side" · torn: "half-peeled, trailing a pale stream" · failing: "a ragged crescent" · one blow from gone: "a wisp" · destroyed: "a wide drift of broken filaments"

**Words:** hit: "the whole cluster slams through like a wave", "it rakes past and is already turning" · miss: "the current carries it wide", "it breaks around you"

**A careful look tells the players:** (1) It rides the current and the current fights for it. (2) Hit one and they all shy back a little. (3) It came to eat the place, not you; it will strip the ground and go.

**Harvest:** C3 / G1 · Codon 1.5 · Threshold 12 · destroyed; harvester Up and at Contact

### Glaze Medusa

*Order III: Nutrient Drifters · Standard · Tier 1 · Macroscopic · run by the Engine*

| MT | MI | Soak | BD | Pool | PP | Segments | Flow |
| :-- | :-- | :-- | :-- | :-- | :-- | :-- | :-- |
| 13 | 22 | 1 | 2 Osmotic | 4 | 3 |  | 5 |

**Traits**
- **Stinging Line:** zone its band,  3 Drifts trailing, onEnter damage 4, type Osmotic, condition Jostled
- **Transparent:** concealmentDice 2, in clear water

**Specials**
| Special | PP | When | Target | Save | Effect |
| :-- | :-- | :-- | :-- | :-- | :-- |
| Glaze | 3 | it has just hit | the organism it struck | none | allPoolsDice -2, scentTrail a Tide (The book gives no duration for the -2; proposed: until a Synthesise action cleans it.) |

**On a hit it always takes:** Osmotic: Flaccid

**Turn script** (first line whose condition is true)
1. if `pp>=3 and did-hit` then `special:glaze:struck`
2. if `foe-in:contact and pp>=2` then `strike:nearest`
3. if `pp>=1` then `drift:through`
4. if `always` then `end`

**Wants:** to feed and be gone. **Stops fighting:** flees if the water turns Turbid; otherwise drifts through and leaves by the far exit after two Cycles.
**Weak to:** thick or gel water: its field collapses; turbid water: it is blind and flees.

**How hurt it looks:** unhurt: "clear as the water, trailing long lines" · marked: "one line cut short" · torn: "bell torn, lines tangled" · failing: "pulsing unevenly, sinking" · one blow from gone: "a rag of bell" · destroyed: "a slick dissolving"

**Words:** hit: "a line you never saw draws across you", "the glaze clings where it touched" · miss: "the lines drift past", "it pulses on without noticing"

**A careful look tells the players:** (1) You can hardly see it; taste finds it better than eyes. (2) Its trailing lines sting whoever crosses them. (3) What it touches smells of it for a long time. Thick or muddy water ruins it.

**Harvest:** C4 / G1 / P1 · Codon 3 · Threshold 12 · destroyed; harvester Up and at Contact · the sting-line specimen is the basis of Needle Dagger barbs and of the Glaze Vial

### Hijack Mite

*Order IV: Pathogenic Wraiths · Swarmling · Tier 1 · Microscopic · run by the Engine*

| MT | MI | Soak | BD | Pool | PP | Segments | Flow |
| :-- | :-- | :-- | :-- | :-- | :-- | :-- | :-- |
| 12 | 10 | 0 | 1 Genetic | 3 | 2 | 4 | 5 |

**Traits**
- **Attach:** onHit lattice 1, whileAttached atHostTurnStart spendsHostReserve true, healSelf 4
- **Small:** mt 2, while unattached

**Specials**
- none

**On a hit it always takes:** Genetic: Hijacked (through its Lattice)

**Turn script** (first line whose condition is true)
1. if `attached` then `end`
2. if `no-foe-in-reach` then `drift:toward:holding-reserve`
3. if `pp>=2` then `strike:holding-reserve`
4. if `always` then `end`

**Wants:** to be someone else. **Stops fighting:** never while attached; dies with a burned host coat (2 Lytic each from a Thermic effect on the host).
**Weak to:** Antigen Discipline; Dry Zones; heat on the host's coat.

**How hurt it looks:** unhurt: "a scatter of bright specks" · marked: "fewer of them" · torn: "a thin, uneven scatter" · failing: "a few specks clinging" · one blow from gone: "one or two" · destroyed: "dull flecks"

**Words:** hit: "something small lands and threads itself in", "a speck settles where you were holding back" · miss: "they skitter off the membrane", "too small to see miss"

**A careful look tells the players:** (1) Specks that go for whoever is holding something in reserve. (2) Once in, they spend what you were saving. (3) Heat on your own coat kills them.

**Harvest:** C3 / G1 · Codon 1.5 · Threshold 12 · destroyed; harvester Up and at Contact · the sequence is worth more than the body: an Underground forger pays 60 S for an intact Mite lattice

### Receptor Lurker

*Order IV: Pathogenic Wraiths · Standard · Tier 1 · Mesoscopic · run by the Engine*

| MT | MI | Soak | BD | Pool | PP | Segments | Flow |
| :-- | :-- | :-- | :-- | :-- | :-- | :-- | :-- |
| 13 | 22 | 1 | 2 Genetic | 4 | 3 |  | 4 |

**Traits**
- **Read:** free true, range near, learns [one Burst the target knows, one Vial it carries, one condition it can shed], then announce
- **Camouflage:** readsAs neutral, unless pool OSM + Chemoreception, threshold 14

**Specials**
| Special | PP | When | Target | Save | Effect |
| :-- | :-- | :-- | :-- | :-- | :-- |
| Read | 0 |  | one organism in Near | none | learns see the Read trait, marksAs read-target |
| Preempt | 3 |  | the organism it has Read | OSM at 14 | condition Locked, cycles 2, on one printed feature of the target |

**On a hit it always takes:** Genetic: Hijacked

**Turn script** (first line whose condition is true)
1. if `cycle:1` then `special:read:nearest`
2. if `cycle:2` then `announce`
3. if `pp>=3 and foe-in:near` then `special:preempt:read-target`
4. if `hurt and pp>=1` then `reserve`
5. if `foe-in:contact and pp>=2` then `strike:nearest`
6. if `always` then `end`

**Wants:** to be someone else. **Stops fighting:** stands down at "one blow from gone" if it has not been struck this Cycle; withdraws if blinded (Turbid water, a scent dampener).
**Weak to:** being blinded: it must be Near to read; a plain fight: without its reading it is a poor brawler.

**How hurt it looks:** unhurt: "flat, featureless, patient" · marked: "its surface split" · torn: "torn wide, leaking dark threads" · failing: "listing, slow to turn its blind face" · one blow from gone: "held together by habit" · destroyed: "caved in and still"

**Words:** hit: "it touches, and something of yours answers to it", "a flat hand of it closes on you" · miss: "it simply is not where the blow went", "it reaches and you are already past"

**A careful look tells the players:** (1) It is reading you, and it will tell you what it means to do. (2) First it reads, then it says, then it shuts one of your tools. (3) Blind it and it is nothing much.

**Harvest:** C4 / G1 / P1 · Codon 3 · Threshold 12 · destroyed; harvester Up and at Contact · receptor tissue: the base of Antigen Hood and of every Immune Sentinel graft

### Antigen Gnat

*Order VI: Immune Sentinels · Swarmling · Tier 1 · Microscopic · run by the Engine*

| MT | MI | Soak | BD | Pool | PP | Segments | Flow |
| :-- | :-- | :-- | :-- | :-- | :-- | :-- | :-- |
| 12 | 10 | 0 | 1 Kinetic | 3 | 2 | 4 | 6 |

**Traits**
- **Read:** onHit condition Marked, lasts scene
- **Alarm:** when a Gnat is destroyed, then allGnats drift toward that zone, dice 1, cycles 2

**Specials**
- none

**On a hit it always takes:** Kinetic: none (its hit Marks instead)

**Turn script** (first line whose condition is true)
1. if `no-foe-in-reach` then `drift:toward:loudest`
2. if `pp>=2` then `strike:loudest`
3. if `always` then `end`

**Wants:** to recognise and purge. **Stops fighting:** never; scatters only if thrown past Loose.
**Weak to:** area effects; not being touched: Deflect and a high Membrane Threshold.

**How hurt it looks:** unhurt: "a loose cloud of rust-bright motes" · marked: "the cloud thinner" · torn: "patchy, turning unevenly" · failing: "a handful still circling" · one blow from gone: "three or four motes" · destroyed: "specks on the current"

**Words:** hit: "a mote lands, and you can feel yourself being read", "the cloud brushes you and brightens" · miss: "it orbits and does not land", "the cloud parts round the swing"

**A careful look tells the players:** (1) It goes to the loudest body in the room. (2) Its touch does not hurt; it paints you for the others. (3) Kill one and the rest come faster.

**Harvest:** C3 / G1 · Codon 1.5 · Threshold 12 · destroyed; harvester Up and at Contact · Warden inquisitors buy intact Gnats at 25 S: they are reagents, and a Cohort that harvests them is technically selling surveillance equipment

### Protease Warden

*Order VI: Immune Sentinels · Elite · Tier 2 · Macroscopic · run by the Engine*

| MT | MI | Soak | BD | Pool | PP | Segments | Flow |
| :-- | :-- | :-- | :-- | :-- | :-- | :-- | :-- |
| 15 | 60 | 4 | 4 Kinetic | 6 | 4 |  | 5 |

**Traits**
- **Antigen Register:** marksLast scene, shedCannotRemove [Marked], seesThroughTerrain at a register arch
- **Brace at need:** oncePer Cycle, mt 2, cannotDrift true, nextStrikeDice 2

**Specials**
| Special | PP | When | Target | Save | Effect |
| :-- | :-- | :-- | :-- | :-- | :-- |
| Cascade | 1 | an ally hits an organism it has Marked | that organism | none | allyFreeStrike true, overflow 1 |
| Purge | 4 |  | one Marked organism in Mid | none | damage 10, type Voltaic, convertsConditionsTo Locked |

**On a hit it always takes:** Kinetic: push 1 Drift per 4 Overflow

**Turn script** (first line whose condition is true)
1. if `marked-foe-in:mid and pp>=4` then `special:purge:marked`
2. if `ally-hit-marked and pp>=1` then `special:cascade:marked`
3. if `no-foe-in-reach` then `drift:toward:nearest`
4. if `foe-in:contact and pp>=3 and not-braced` then `brace`
5. if `pp>=2` then `strike:marked`
6. if `pp>=1` then `reserve`
7. if `always` then `end`

**Wants:** to recognise and purge. **Stops fighting:** withdraws to report at "kit hanging open", or when every ally of its squad is destroyed; stands down if it has what it came for (the site says what).
**Weak to:** anything that denies its Marks: Masked, a scent dampener, Latency; losing its squad.

**How hurt it looks:** unhurt: "pale kit unmarked, register arm raised" · marked: "one thin weeping line" · torn: "a second line; plates grinding" · failing: "kit hanging open, arm lowered" · one blow from gone: "barely upright behind its brace" · destroyed: "folded over and still"

**Words:** hit: "pale plating grinds through", "it plants, swings and files the result" · miss: "the blow is caught on a rib of plating", "it notes the attempt and does not lean"

**A careful look tells the players:** (1) It leads the others; it reads the room before it moves. (2) Everything it does runs on marking you. Unmarked, it is only strong. (3) Break its squad and it leaves to report.

**Harvest:** C8 / G3 / P2 / T1 · Codon 14 · Threshold 16 · destroyed; harvester Up and at Contact · the Antigen Register Pristine Sequence: Hive Mask material, and the single most requested Specimen in the Atlas


## 8. The other 58 creatures: numbers and names, effects still to convert

"Run" says who would play it today: `engine` (no specials, default script), `engine-basic` (default script; specials need records first), `director`.

| Creature | Order | Class | T | MT | MI | Soak | BD | Pool | PP | Seg | Traits | Specials (PP) | Harvest | Codon | Run |
| :-- | :-- | :-- | :-- | :-- | :-- | :-- | :-- | :-- | :-- | :-- | :-- | :-- | :-- | :-- | :-- |
| Protease Locusts | I | Swarmling | 2 | 13 | 14 | 0 | 2 Lytic | 4 | 2 | 8 | Cloud Flight, Enzyme Rain | Bloom Chorus (3, once per Pulse War) | C4/G1 | 3.5 | engine-basic |
| Enzymatic Horror | I | Standard | 2 | 14 | 30 | 2 | 3 Lytic | 5 | 3 |  | Acidic Surge, (unnamed), Testate-Soft | Dissolve Armour (3) | C5/G2/P1 | 7 | engine-basic |
| Autolytic Hulk | I | Standard | 3 | 15 | 38 | 3 | 4 Lytic | 6 | 3 |  | Autophagic, Segment Split | Rupture Burst (4, once) | C6/G3/P2 | 15 | engine-basic |
| Swarm Of Nine Mouths | I | Elite | 2 | 15 | 60 | 4 | 4 Lytic | 6 | 4 |  | Nine Digestions, (unnamed) | Devour (5, once per Pulse War) | C8/G3/P2/T1 | 14 | engine-basic |
| Lysophage | I | Elite | 3 | 16 | 76 | 5 | 5 Lytic | 7 | 4 |  | Enzyme Corridor, Graft-Eater | Digest Apparatus (3) | C10/G4/P3/T1 | 30 | engine-basic |
| Recession Feeder | I | Standard | 4 | 16 | 46 | 4 | 5 Lytic | 7 | 3 |  | Anti-Bloom, Starving | Draw In (4) | C7/G4/P2 | 30 | engine-basic |
| Bloom Matriarch | I | Catastrophe | 2 | 12 | 60 | 5 | 6 Lytic | 6 | 5 |  | Brood Sac, Rooted | Bloom Surge (5, once per phase), Chemical Veil (3) | C12/G7/P3/T1 | 21 | director |
| Chaperone Drone | II | Swarmling | 1 | 12 | 10 | 0 | 1 Kinetic | 3 | 2 | 4 | Folding, Loyal to Structure | Assist Fold (2) | C3/G1 | 1.5 | engine-basic |
| Ribbon Warden | II | Standard | 2 | 14 | 30 | 2 | 3 Kinetic | 5 | 3 |  | Bridge-Bound, Tether | Shear Call (3) | C5/G2/P1 | 7 | engine-basic |
| Lattice Guardian | II | Elite | 2 | 15 | 60 | 4 | 4 Kinetic | 6 | 4 |  | Zone Claim, Unmoving Order | Cage Fold (4), Chain of Command (1) | C8/G3/P2/T1 | 14 | engine-basic |
| Tensile Jailer | II | Standard | 3 | 15 | 38 | 3 | 4 Kinetic | 6 | 3 |  | Restraint, Wall-Build | Deliver (3) | C6/G3/P2 | 15 | engine-basic |
| Knot Marshal | II | Elite | 3 | 16 | 76 | 5 | 5 Kinetic | 7 | 4 |  | Traffic Law, Register Eye | Queue (5, once), File (2) | C10/G4/P3/T1 | 30 | engine-basic |
| Cathedral Warden | II | Catastrophe | 3 | 13 | 80 | 6 | 7 Kinetic | 7 | 5 |  | Living Structure, Sacred Ground | Consecrate (5) | C15/G9/P4/T2 | 45 | director |
| Prion Husk | II | Elite | 4 | 17 | 92 | 6 | 6 Kinetic | 8 | 4 |  | Misfold, Wrongness Immunity | Template (4) | C12/G5/P4/T2 | 60 | engine-basic |
| Amyloid Bulwark | II | Elite | 4 | 17 | 92 | 8 | 6 Osmotic | 6 | 4 |  | Wall, Sediment | Set (5, once per Pulse War) | C12/G5/P4/T2 | 60 | engine-basic |
| Bridge Builder | II | Standard | 2 | 14 | 30 | 2 | 3  | 5 | 3 |  | Not hostile unless its work is interfered with. It prints ribbon: 10 Drifts of new bridge per Fugue Interval, and its ribbon is load-bearing law | Offer (0) | C5/G2/P1 | 0 | engine-basic |
| Plankton Cloud | III | Swarmling | 1 | 12 | 10 | 0 | 1 Lytic | 3 | 2 | 8 | Bloom-Threshold, Blind Filter-Feed |  | C3/G1 | 1.5 | engine |
| Yolk Bloom | III | Swarmling | 2 | 13 | 14 | 0 | 2 Osmotic | 4 | 2 | 8 | Brood-Sac, Rich |  | C4/G1 | 3.5 | engine |
| Grazing Leech | III | Standard | 1 | 13 | 22 | 1 | 2 Kinetic | 4 | 3 |  | Slow Thirst, Slippery | Engorge (3) | C4/G1/P1 | 3 | engine-basic |
| Vacuum Ray | III | Standard | 2 | 14 | 30 | 2 | 3 Osmotic | 5 | 3 |  | Intake, Fast Angler | Drain Field (4) | C5/G2/P1 | 7 | engine-basic |
| Filter Back | III | Standard | 3 | 15 | 38 | 3 | 4 Osmotic | 6 | 3 |  | Living Sieve, Slow | Vent (3), Clog (0) | C6/G3/P2 | 15 | engine-basic |
| Tidal Strainer | III | Elite | 3 | 16 | 76 | 5 | 5 Osmotic | 7 | 4 |  | Current-Binder, Deep-Lung | Lock (5, once per Pulse War), Filter Feed (2) | C10/G4/P3/T1 | 30 | engine-basic |
| The Fat Cardinal | III | Elite | 4 | 17 | 92 | 6 | 6 Osmotic | 8 | 4 |  | Hoard-Body, Gluttony | Gorge (4), Ransom (0) | C12/G5/P4/T2 | 60 | engine-basic |
| Drift Whale | III | Catastrophe | 4 | 14 | 90 | 7 | 8 Osmotic | 8 | 5 |  | Mass, Ecosystem, Protected | Breach (5, once per phase), Song (0) | C18/G11/P5/T2 | 90 | director |
| Lattice Leech | IV | Swarmling | 2 | 13 | 14 | 0 | 2 Genetic | 4 | 2 | 6 | Signal Thief, Detachable | Spend (2) | C4/G1 | 3.5 | engine-basic |
| Signal Wraith | IV | Standard | 2 | 14 | 30 | 2 | 3 Genetic | 5 | 3 |  | Voice-Theft, False Flag | Counter-Signal (3), Wear the Dead (4, once) | C5/G2/P1 | 7 | engine-basic |
| False Self | IV | Elite | 2 | 15 | 60 | 4 | 4 Genetic | 6 | 4 |  | (unnamed) | Alibi (0) | C8/G3/P2/T1 | 14 | engine-basic |
| Mimicry Bloom | IV | Standard | 3 | 15 | 38 | 3 | 4 Genetic | 6 | 3 |  | Adaptive Coat, Spores | Learn (3) | C6/G3/P2 | 15 | engine-basic |
| The Alms | IV | Standard | 3 | 15 | 38 | 3 | 4 Genetic | 6 | 3 |  | (unnamed) | Charitable (2) | C6/G3/P2 | 0 | engine-basic |
| Retroviral Choir | IV | Elite | 3 | 16 | 76 | 5 | 5 Genetic | 7 | 4 |  | Congregation, Inheritance | Chorus (4, once per Pulse War), Mend the Host (2) | C10/G4/P3/T1 | 30 | engine-basic |
| Prion Shepherd | IV | Elite | 4 | 17 | 92 | 6 | 6 Genetic | 8 | 4 |  | Wrongness, Herd | Rewrite (5, once per Pulse War), Cull (3) | C12/G5/P4/T2 | 60 | engine-basic |
| Vector Baron | IV | Catastrophe | 4 | 14 | 80 | 7 | 8 Genetic | 8 | 5 |  | Region-Speaker, Latent Court | Bloom Trigger (5), Grant Audience (0) | C18/G11/P5/T2 | 90 | director |
| Crystal Growth | V | Swarmling | 2 | 13 | 14 | 0 | 2 Osmotic | 4 | 2 | 6 | Salt-Bloom, Brittle |  | C4/G1 | 3.5 | engine |
| Turgor Ram | V | Standard | 1 | 13 | 22 | 1 | 2 Kinetic | 4 | 3 |  | Charge, Dense | Gore-and-Throw (3) | C4/G1/P1 | 3 | engine-basic |
| Flaccid Haunter | V | Standard | 2 | 14 | 30 | 2 | 3 Osmotic | 5 | 3 |  | Wither, Leak | Pressure Drain (4) | C5/G2/P1 | 7 | engine-basic |
| Pore Breaker | V | Standard | 2 | 14 | 30 | 2 | 3 Kinetic | 5 | 3 |  | Membrane-Eater, Breacher | Flood (5, once) | C5/G2/P1 | 7 | engine-basic |
| Tidal Anchor | V | Standard | 3 | 15 | 38 | 3 | 4 Osmotic | 6 | 3 |  | Immoveable, Channel | Undertow (4) | C6/G3/P2 | 15 | engine-basic |
| Salt Horror | V | Elite | 3 | 16 | 76 | 5 | 5 Osmotic | 7 | 4 |  | Desiccating Aura, Salt Armour | Brine Lance (3), Ransom (0) | C10/G4/P3/T1 | 30 | engine-basic |
| Desiccation Hulk | V | Elite | 3 | 16 | 76 | 5 | 5 Kinetic | 7 | 4 |  | Thirst Body, Slaking | Dry Out (5, once per Pulse War) | C10/G4/P3/T1 | 30 | engine-basic |
| Brine Colossus | V | Elite | 4 | 17 | 92 | 6 | 6 Osmotic | 8 | 4 |  | Weight of the World, Layered | Ballast (3), Rime (2) | C12/G5/P4/T2 | 60 | engine-basic |
| Deep Pressure Horror | V | Elite | 5 | 18 | 108 | 7 | 7 Kinetic | 9 | 4 |  | Pressure Legibility, Barophil-Hard | Implosion (5, once per Pulse War), Brace Denial (3) | C14/G6/P5/T2 | 120 | engine-basic |
| Vacuole Behemoth | V | Catastrophe | 5 | 15 | 100 | 8 | 9 Osmotic | 9 | 5 |  | Living Vault, Pressure Store | Empty the Sac (5), Storage Law (0) | C21/G13/P6/T3 | 180 | director |
| Clonal Sentinel | VI | Standard | 1 | 13 | 22 | 1 | 2 Voltaic | 4 | 3 |  | Clone-Sync, Recognise | Escalate (2) | C4/G1/P1 | 3 | engine-basic |
| Phagocyte Marshal | VI | Standard | 2 | 14 | 30 | 2 | 3 Kinetic | 5 | 3 |  | Bulwark, Engulfment | Detain (3) | C5/G2/P1 | 7 | engine-basic |
| Cytokine Screamer | VI | Standard | 3 | 15 | 38 | 3 | 4 Voltaic | 6 | 3 |  | Broadcast, Inflammation Field | Call the Response (3), Fever (4) | C6/G3/P2 | 15 | engine-basic |
| Graft Inquisitor | VI | Standard | 4 | 16 | 46 | 4 | 5 Kinetic | 7 | 3 |  | Audit, Contraband | Revoke (4, once), Parley (0) | C7/G4/P2 | 30 | engine-basic |
| Complement Herald | VI | Elite | 3 | 16 | 76 | 5 | 5 Voltaic | 7 | 4 |  | Cascade Reserves, Membrane Lattice | Membrane Attack (5, once per Pulse War) | C10/G4/P3/T1 | 30 | engine-basic |
| Inflammatory Tempest | VI | Elite | 4 | 17 | 92 | 6 | 6 Thermic | 8 | 4 |  | Recruitment, Fevered Ground, Swelling | Storm (5) | C12/G5/P4/T2 | 60 | engine-basic |
| Tolerance Priest | VI | Elite | 5 | 18 | 108 | 7 | 7 Genetic | 9 | 4 |  | Self/Kin, Absolute, Tolerance | Forgiveness (4), Autoimmune Word (5, once per Pulse War) | C14/G6/P5/T2 | 120 | engine-basic |
| Clonal Line | VI | Catastrophe | 3 | 13 | 80 | 6 | 7 Kinetic | 7 | 5 |  | One Antigen, Registered Ground | Response (5) | C15/G9/P4/T2 | 45 | director |
| Rulebreak Instance | VII | Standard | 3 | 15 | 38 | 3 | 4  | 6 | 3 |  |  | Absorb (2) | C6/G3/P2 | 15 | director |
| The Same, Twice | VII | Standard | 4 | 16 | 46 | 4 | 5 Kinetic | 7 | 3 |  |  | Choose (3) | C7/G4/P2 | 30 | director |
| The Unnumbered | VII | Elite | 3 | 16 | 76 | 5 | 5 Osmotic | 7 | 4 |  |  | Borrow a Number (4) | C10/G4/P3/T1 | 30 | director |
| Reverse Bloom | VII | Elite | 4 | 17 | 92 | 6 | 6 Lytic | 8 | 4 |  |  | Unmake (5) | C12/G5/P4/T2 | 60 | director |
| Inverted Lung | VII | Elite | 4 | 17 | 92 | 6 | 6 Osmotic | 8 | 4 |  |  | Suffocate (3) | C12/G5/P4/T2 | 60 | director |
| The Long Echo | VII | Elite | 5 | 18 | 108 | 7 | 7 any | 9 | 4 |  |  | Repeat (4) | C14/G6/P5/T2 | 120 | director |
| The Quiet | VII | Catastrophe | 4 | 14 | 80 | 7 | 8 Genetic | 8 | 5 |  |  | Silence (5) | C18/G11/P5/T2 | 90 | director |
| Curator Manifestation | VII | Catastrophe | 5 | 15 | 110 | 9 | 9 Genetic | 10 | 5 |  |  | Filing (5, once per phase) | none | 0 | director |

## 9. Questions for Roly

1. A Swarmling has 2 Pulse Points and a Strike costs 2, yet a swarm may Strike once per two Segments (up to three). Do a swarm's extra Strikes cost Pulse Points? The scripts assume the Engine's current behaviour.
2. Each fully converted creature now names one fixed Signature Consequence. Are these the right picks (for example the Bleeder: Brittle; the Sentinel: Jostled)?
3. Glaze gives -2 to all pools with no printed end. Proposed: until a Synthesise action cleans it.
4. The Gnat goes for "the biggest chemical signal". Proposed measure: highest Stress, then the last organism to roll.
5. The wound-ladder steps are cut at 80 / 60 / 35 / 15 percent. Is that the right feel?
6. Morale triggers are mine, read from each block's tactics and weakness lines. Each needs a yes or a correction.
7. Should the remaining 58 be converted Order by Order, or only as Vectors need them?
