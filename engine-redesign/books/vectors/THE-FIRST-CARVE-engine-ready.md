# The First Carve, in the Vector format

Version 0.1 draft, 15 November 2026. Built from the Vector's facts as coded in `director/data/first-carve.js`. The story and the balance are unchanged. Data: `first-carve.json`.

> A whale lies dead across the channel with a wound cut in its flank. Everything worth having is inward and upstream, and the way back out is the same way.

**Hands:** wall, ledger, rider, eyes (see the Player's Atlas edition). **Session zero:** Players see all three Clocks. Nothing carried out is worth anything unless it passed a Tally Post. The Gut Stone is Deadly and will be announced as such.

## Clocks

| Clock | Segments | Says | Stages | When full |
| :-- | :-- | :-- | :-- | :-- |
| CARCASS | 6 | The whale is digesting itself. The value clock. | fresh; weeping; bloated; sloughing; sour; gaslock; the whale goes over | whale-goes-over |
| TOLL | 5 | The Render Charge is on a schedule. The law clock. |  | At 5 the Render Charge fires (Gut Stone hazard). |
| HUNGER | 4 | Everything in the Reach can smell a wound. The danger clock. | only tells; signs at every panel; Gnaw Swarms at the wounds; Detritus Feeders render the dead; the Render Cascade | render-cascade |

**What moves a Clock.** Nothing else does, except one segment per Clock per session (Vector 3.4).

| Event | Clock | Change | Limit | Where | Vector |
| :-- | :-- | :-- | :-- | :-- | :-- |
| panel-opens | CARCASS | +1 | per-scene | any | 3.1 |
| reconstitution | CARCASS | +1 | none | any |  |
| pulse-war-starts | TOLL | +1 | none | any | 3.2 |
| pulse-war-starts | HUNGER | +1 | none | any | 3.3 |
| body-cut | HUNGER | +1 | none | any | 3.3 |
| body-left | HUNGER | +1 | per-scene | any | 3.3 |
| oath-kept | TOLL | -1 | none | any |  |
| toll-refused | TOLL | +1 | per-scene | toll-vent | 8.1 |
| toll-settled | TOLL | -1 | per-scene | toll-vent | 8.1 (the toll chit) |
| pump-opened | CARCASS | -1 | per-session | render-hall | 8.3 |
| pump-opened | HUNGER | +1 | per-session | render-hall | 8.3 |
| pump-opened | TOLL | +1 | per-session | render-hall | 8.3 |
| brood-cut | HUNGER | +2 | per-scene | brood | 8.4 |
| brood-cut | TOLL | +1 | per-scene | brood | 8.4 |

## The Toll-Vent *(Vector 8.1)*

> A torn flank panel the size of a town square, the channel's current running through it. Folded out of the whale's own gristle is a customs post: a chitin gate, a queue of drones, a toll board priced in Specimens. Beyond the gate a cut-lane runs down into the carcass.

**Medium:** isotonic, viscosity 1, flow 2. **Danger:** Easy, 6 BSP. **Teaches:** The roll.

| Zone | Band | Tags | Note |
| :-- | :-- | :-- | :-- |
| The wound lip | near |  | the torn edge you must cross; the gas pocket is under it |
| The drone customs fold | contact |  | the gate |

**Exits:** the cut-lane down -> `soft-field` (needs:way-open); back out to the Toll Reach -> `walked-away` (not-in-fight).

**Creatures**
| Creature | Band | Present | Stance | Turns hostile on | Stands down or leaves on | Note |
| :-- | :-- | :-- | :-- | :-- | :-- | :-- |
| 1 x Fold Sentinel | contact | on-arrival | guarding | toll-refused | toll-settled | It does not start the fight. If the Cohort has paid or sworn it stands aside even after a strike. |
| 2 x Gnaw Swarm | near | on-arrival | indifferent | strike | offer-water | They want drink, not violence. |

**Who is here**
| Who | Wants | Offers | Will say |
| :-- | :-- | :-- | :-- |
| the customs drones | the toll, in any printed form |  | the three prices on the board |


**What can be done here**
| Action | Pool | Threshold | Unhurried | Needs | On success | On failure |
| :-- | :-- | :-- | :-- | :-- | :-- | :-- |
| Taste the water from the wound | OSM + Chemoreception | standard | yes |  | reveal:2; discover:gas-pocket | nothing |
| Pay the toll in Specimens |  | no roll |  | 2 C per body | flag:toll-settled; flag:way-open; event:toll-settled |  |
| Pay the toll in Substrate |  | no roll |  | 15 S per body | flag:toll-settled; flag:way-open; event:toll-settled |  |
| Swear a promise at the witness-seam |  | no roll |  | a free Oath box; the promise in the player's words; owed to Order II | oath:file; flag:toll-settled; flag:way-open; event:toll-settled |  |
| Shoulder through the gate | VSC + Vigour | standard |  |  | on the attempt: event:toll-refused; flag:way-open | the Sentinel Strikes the crosser |
| Give the swarms water |  | no roll |  | clean water: one Vial of any kind emptied, or 1 S of foam | leaves:gnaw-swarm |  |
| Vent the gas pocket slowly |  | no roll |  | discovered:gas-pocket | disarm:gas-pocket |  |

*Anything else:* The drones sell nothing and there is no other way through the flank here.

**Hazards**
| Hazard | Trigger | Clock gate | Effect | Hits | Save | How often | Counter | Then |
| :-- | :-- | :-- | :-- | :-- | :-- | :-- | :-- | :-- |
| Gas pocket under the lip | kinetic-hit; strike; momentum |  | 6 Kinetic, Jostled, 1-band shift | site | none | per-cycle | vent-pocket; Brace reaction: no damage halved twice, and 2 free Drifts |  |


**Awards:** 15 Codon on arrive:soft-field with flag:toll-settled and fold-sentinel not destroyed.

**Secrets:** (1) Bare patches of old biomass on the wound lip. (2) The floor is humming: something light is welling up under the lip. (2) The drone fold faces the wrong way: its gate points inward.

**Director briefing (164 words)**

```
SITE: The Toll-Vent. A torn flank panel the size of a town square, the channel's current running through it. Folded out of the whale's own gristle is a customs post: a chitin gate, a queue of drones, a toll board priced in Specimens. Beyond the gate a cut-lane runs down into the carcass.
HERE: 1 Fold Sentinel (guarding; looks: broad, braced and unmarked); 2 Gnaw Swarm (indifferent; looks: a tight, seething coat of soft segments).
WHO: the customs drones wants the toll, in any printed form.
CAN BE DONE: Taste the water from the wound; Pay the toll in Specimens; Pay the toll in Substrate; Swear a promise at the witness-seam; Shoulder through the gate; Give the swarms water; Vent the gas pocket slowly. The drones sell nothing and there is no other way through the flank here.
WAYS OUT: the cut-lane down; back out to the Toll Reach.
SEEN ON ARRIVAL: Bare patches of old biomass on the wound lip.
TEACHES: The roll.
```

## The Soft Field *(Vector 8.2, 7.2)*

> Hanging sheets of lipid, cut lanes sweet with Guild claim-line, tally-sleds empty on their cable. At the centre stands the Tally Post, where a cut is weighed, graded and stamped. The tools are stacked and unblooded.

**Medium:** isotonic, viscosity 1, flow 1. **Danger:** Easy, 6 BSP. **Teaches:** The harvest. This is the Ledger's room.

| Zone | Band | Tags | Note |
| :-- | :-- | :-- | :-- |
| The near panels | mid |  | the Medusa nest is in one of them |
| The far panels | far |  | clean, unclaimed |
| The Tally Post | near |  | centre of the field |
| Slough patches | mid | difficult | visible after CARCASS 1 |

**Exits:** the cut-lane to the stomach -> `render-hall` (not-in-fight); the sled-cable to the surface -> `left-with-cut` (not-in-fight); back up the cut-lane -> `toll-vent` (not-in-fight).

**Creatures**
| Creature | Band | Present | Stance | Turns hostile on | Stands down or leaves on | Note |
| :-- | :-- | :-- | :-- | :-- | :-- | :-- |
| 2 x Glaze Medusa | mid | on-arrival | guarding | enter-zone:near-panels; strike |  | Defending a nest. A Cohort that takes the far panels gets the same harvest with less blood. |
| 2 x Hijack Mite | mid | on:enter-zone:near-panels | hostile |  |  |  |
| 2 x Hijack Mite | mid | on:enter-zone:near-panels | hostile |  |  |  |

**Who is here**
| Who | Wants | Offers | Will say |
| :-- | :-- | :-- | :-- |
| the Tally Post clerk | a cut it can stamp under some claim | a stamp for one row of the d12 table, rolled once | the ledger's last entry: CLAIM VOID - SEE NETH; unstamped, the cut is worth nothing outside |

**The priced choice** (d12, once, when the Cohort first reaches the post)
| d12 | Offer | Price | Engine effects |
| :-- | :-- | :-- | :-- |
| 1-2 | stamp under the first crew's void claim | the Ash call it grave-robbing; the Guild will not notice for two Beats | flag:claim-void-crew |
| 3-4 | stamp under Tallow Ring's second sale | free; the first buyer's crew will come to collect | flag:claim-second-sale |
| 5-6 | a Guild tally-stamp | a third of the haul | haul:-1/3; clock:TOLL:-1; flag:claim-guild |
| 7-8 | an Ash Unwasted seal on the panel being cut | the cut is slower: that panel does not rewind CARCASS | grade:+1; flag:claim-ash |
| 9 | a drone licence: Order II stamps it | the drones consider you registered, including for what the brood needs | clock:TOLL:-1; flag:registered-order-ii |
| 10 | no stamp: the clerk is a client of Neth | a Signal Discourse roll at Standard, or 10 to 30 S in samples, fixes it |  |
| 11 | a stamp now for a favour at the Gut Stone | the favour arrives at the Gut Stone | flag:claim-favour; flag:owes-clerk |
| 12 | the post is empty, the scale still warm | someone was here minutes ago | clock:HUNGER:+1; reveal:pump-shaft-open |

**What can be done here**
| Action | Pool | Threshold | Unhurried | Needs | On success | On failure |
| :-- | :-- | :-- | :-- | :-- | :-- | :-- |
| Read the post's ledger |  | no roll |  |  | reveal:2; roll:priced-choice |  |
| Scout the far panels | DFF + Fluid Navigation | common | yes |  | flag:far-lane-marked; advantage:cut-panel |  |
| Cut a hanging panel | OSM or RTC + Synthesis | standard | yes | far panels, or the nest dealt with | yield:site; event:panel-opens | yield:substrate-only |
| Have the cut weighed and stamped |  | no roll |  | unstamped Specimens and any claim flag | stamp:all; award:stamped |  |
| Cut a panel loose to cloud the lane |  | no roll |  | a Kinetic hit with 4+ Overflow on a panel | site-modifier:all pools -2 dice; blind:glaze-medusa |  |
| Salt a slough patch |  | no roll |  | salt | disarm:slough |  |
| Take the first crew's salt cache |  | no roll |  | found:salt-cache | gain:60 S of salt; note: salt spent rewinds CARCASS by 1 |  |

*Anything else:* The stacked tools are ordinary and the sleds are empty; nothing else here can be worked.

**Hazards**
| Hazard | Trigger | Clock gate | Effect | Hits | Save | How often | Counter | Then |
| :-- | :-- | :-- | :-- | :-- | :-- | :-- | :-- | :-- |
| Slough patches | in-zone:slough | CARCASS 3 | 1 Lytic | zone:slough | none | standing | cross on the hanging panels; salt-slough |  |

**Site harvest:** the hanging lipid panels; Threshold standard; yields C1 to each organism in the picking order per panel; grade by CARCASS; fires `panel-opens`.

**Awards:** 20 Codon on stamp-cut.

**Secrets:** (1) A tally-sled loaded with nothing but tools. (2) A sweet current coming up from deeper in. (2) A drone escort moving into the whale, not out. (3) A stamped cut is 40 to 120 S, only if the claim stands.

**Director briefing (156 words)**

```
SITE: The Soft Field. Hanging sheets of lipid, cut lanes sweet with Guild claim-line, tally-sleds empty on their cable. At the centre stands the Tally Post, where a cut is weighed, graded and stamped. The tools are stacked and unblooded.
HERE: 2 Glaze Medusa (guarding; looks: clear as the water, trailing long lines).
WHO: the Tally Post clerk wants a cut it can stamp under some claim.
CAN BE DONE: Read the post's ledger; Scout the far panels; Cut a hanging panel; Have the cut weighed and stamped; Cut a panel loose to cloud the lane; Salt a slough patch; Take the first crew's salt cache. The stacked tools are ordinary and the sleds are empty; nothing else here can be worked.
WAYS OUT: the cut-lane to the stomach; the sled-cable to the surface; back up the cut-lane.
SEEN ON ARRIVAL: A tally-sled loaded with nothing but tools.
TEACHES: The harvest. This is the Ledger's room.
```

## The Render Hall *(Vector 8.3)*

> The stomach is still warm and still churning; the fluid pulls at you. A Hegemony pump barge and its crew of nine run a hose near the entrance. Dry ribs line the wall. At the bottom lies the still, hot and quiet.

**Medium:** hypertonic, viscosity 2, flow 3; wrong-tonic -1 dice unless prepared. **Danger:** Standard, 8 BSP. **Teaches:** The Pulse War: terrain is the main character.

| Zone | Band | Tags | Note |
| :-- | :-- | :-- | :-- |
| The pump | near |  | the barge and its hose; loud |
| The churn | mid | current; difficult | drags a body 1 band per Cycle unless it wins Fluid Navigation at Standard |
| The mid floor | mid |  | the Enzyme Field |
| The dry ribs | mid | advantage:strike | walkable along the wall, out of the field and the churn |
| The still | contact |  | at the bottom; the first crew's four bodies |

**Exits:** the pyloric channels, up -> `brood` (not-in-fight); the pump shaft -> `left-with-cut` (not-in-fight); back down the cut-lane -> `soft-field` (not-in-fight).

**Creatures**
| Creature | Band | Present | Stance | Turns hostile on | Stands down or leaves on | Note |
| :-- | :-- | :-- | :-- | :-- | :-- | :-- |
| 3 x Cytoplasmic Bleeder | mid | on-arrival | hunting | enter-zone:enzyme-floor; enter-zone:churn; strike; pump-opened |  | They want the warm fluid and the plasma in it. |
| 2 x Detritus Feeder | contact | on-arrival | indifferent | strike |  | At the still, on the first crew. In a fight they Render the four bodies, one each per turn. |

**Who is here**
| Who | Wants | Offers | Will say |
| :-- | :-- | :-- | :-- |
| the Hegemony pump crew (nine) | to finish the shift |  | what the pump does; they are Guild-licensed and will see who touched it |
| Pump-Hand Osk | not to die |  | once stabilised: where the Gut Stone lies |


**What can be done here**
| Action | Pool | Threshold | Unhurried | Needs | On success | On failure |
| :-- | :-- | :-- | :-- | :-- | :-- | :-- |
| Taste the haze on the mid floor | OSM + Chemoreception | 14 (printed) | yes |  | discover:enzyme-field; reveal:2 |  |
| Go along the dry ribs |  | no roll |  |  | move:dry-ribs |  |
| Seize or open the pump | RTC + Synthesis, or VSC + Vigour to seize it | standard |  |  | event:pump-opened; disarm:enzyme-field; site-modifier:creatures -2 dice; reveal:pump-shaft-open | the crew turn hostile to the attempt |
| Read the first crew's bodies | OSM + Sequence Reading | standard | yes | at the still; a body not yet Rendered | reveal:3; flag:knows-stone |  |
| Stabilise Osk | RTC + Synthesis | 13 (printed) |  | Osk Dormant; at Contact | flag:knows-stone; award:stranger |  |

*Anything else:* Only the pump can be worked here; the ribs, the hose and the barge do nothing else.

**Hazards**
| Hazard | Trigger | Clock gate | Effect | Hits | Save | How often | Counter | Then |
| :-- | :-- | :-- | :-- | :-- | :-- | :-- | :-- | :-- |
| Enzyme Field | enter-zone:enzyme-floor; strike:in-zone:enzyme-floor |  | 8 Lytic, soak -1 until repaired | one | none | per-cycle | open-pump; walk-ribs |  |
| The churn | in-zone:churn |  | no damage, 1-band shift | one | DFF + Fluid Navigation at standard | per-cycle | walk-ribs |  |


**Awards:** 20 Codon on stabilise-osk.

**Secrets:** (1) Everything in the stomach is scoured clean except one warm, swollen plug. (2) The haze has a sheen: it strips membrane. (3) From the still you can see where the plug lies: the far curve of the gut.

**Director briefing (162 words)**

```
SITE: The Render Hall. The stomach is still warm and still churning; the fluid pulls at you. A Hegemony pump barge and its crew of nine run a hose near the entrance. Dry ribs line the wall. At the bottom lies the still, hot and quiet.
HERE: 3 Cytoplasmic Bleeder (hunting; looks: long, soft and whole); 2 Detritus Feeder (indifferent; looks: fat and busy).
WHO: the Hegemony pump crew (nine) wants to finish the shift; Pump-Hand Osk wants not to die.
CAN BE DONE: Taste the haze on the mid floor; Go along the dry ribs; Seize or open the pump; Read the first crew's bodies; Stabilise Osk. Only the pump can be worked here; the ribs, the hose and the barge do nothing else.
WAYS OUT: the pyloric channels, up; the pump shaft; back down the cut-lane.
SEEN ON ARRIVAL: Everything in the stomach is scoured clean except one warm, swollen plug.
TEACHES: The Pulse War: terrain is the main character.
```

## The Brood of the Not-Whale *(Vector 8.4)*

> A chamber that should not exist in a dead animal: warm, lit and sweet. Three hundred blind juveniles, whale-shaped but wrong, circle a warm shard of slag. At the gate a grey drone elder has set up a customs post, with forms.

**Medium:** isotonic, viscosity 1, flow 1. **Danger:** Standard, 7 BSP (Only if the brood is startled.). **Teaches:** The law and the ledger.

| Zone | Band | Tags | Note |
| :-- | :-- | :-- | :-- |
| The customs post | contact |  | at the gate |
| The brood-channels | mid | current | a sweet current |
| The fold-nursery | far |  | around the warm shard |

**Exits:** the pyloric duct -> `gut-stone` (not-in-fight); back the way you came -> `render-hall` (not-in-fight).

**Creatures**
| Creature | Band | Present | Stance | Turns hostile on | Stands down or leaves on | Note |
| :-- | :-- | :-- | :-- | :-- | :-- | :-- |
| 2 x Receptor Lurker | near | on:brood-cut | hostile |  |  |  |
| 3 x Drifter Shoal | mid | on:brood-cut | hostile |  |  |  |

**Who is here**
| Who | Wants | Offers | Will say |
| :-- | :-- | :-- | :-- |
| Nine-Folds, the drone elder | the brood registered: a witness, a signature, and a body that can hold paper | a Name, the Choir's goodwill and a G Specimen for the Cohort signs the claim of what the not-whale is; what the brood is for a registration signature | what the brood is worth cut: 400 to 900 S, and what it costs |


**What can be done here**
| Action | Pool | Threshold | Unhurried | Needs | On success | On failure |
| :-- | :-- | :-- | :-- | :-- | :-- | :-- |
| Smell what the brood is | OSM + Chemoreception | standard | yes |  | reveal:3; award:not-whale; flag:knows-brood |  |
| Register the brood |  | no roll |  | flag:knows-brood or Nine-Folds' telling; one organism signs | event:brood-registered; flag:named; gain:1 G |  |
| Cut the brood | OSM or RTC + Synthesis | standard |  |  | on the attempt: event:brood-cut; gain:400 + 100 x Overflow S, to 900 |  |

*Anything else:* The shard is only warm; the forms mean nothing unless signed.

**Hazards:** none.


**Awards:** 25 Codon on smell-brood or offer:tell.

**Secrets:** (1) The juveniles have six fins where a Drifter has four. (2) The room feels like being asked questions. (3) The brood's chemistry matches the slag, not the whale: the whale was herding it.

**Director briefing (127 words)**

```
SITE: The Brood of the Not-Whale. A chamber that should not exist in a dead animal: warm, lit and sweet. Three hundred blind juveniles, whale-shaped but wrong, circle a warm shard of slag. At the gate a grey drone elder has set up a customs post, with forms.
HERE: no creatures in sight.
WHO: Nine-Folds, the drone elder wants the brood registered: a witness, a signature, and a body that can hold paper.
CAN BE DONE: Smell what the brood is; Register the brood; Cut the brood. The shard is only warm; the forms mean nothing unless signed.
WAYS OUT: the pyloric duct; back the way you came.
SEEN ON ARRIVAL: The juveniles have six fins where a Drifter has four.
TEACHES: The law and the ledger.
```

## The Gut Stone *(Vector 8.5)*

> A plug of fused slag, gut-crud and salt, thirty Drifts across, wedged in the curve of the gut. It is warm. A field of shards drifts before it and an acid halo clings to its face. One shaft leads up.

**Medium:** mixed, viscosity 3, flow 4. **Danger:** Deadly, 12 BSP, announced before it starts. **Teaches:** The ending.

| Zone | Band | Tags | Note |
| :-- | :-- | :-- | :-- |
| The stone face | contact |  | inside the acid halo |
| The shard field | mid | difficult | everything cuts |
| The exit shaft | far |  | up to the Render Hall's pump |

**Exits:** the exit shaft -> `escaped` (always); the pyloric duct -> `brood` (not-in-fight).

**Creatures**
| Creature | Band | Present | Stance | Turns hostile on | Stands down or leaves on | Note |
| :-- | :-- | :-- | :-- | :-- | :-- | :-- |
| 1 x Protease Warden | mid | on-arrival | will-talk | strike; take:canister | flag:serial-carried; clock:TOLL:5 | It wants the canister intact. Neither claimant is evil. |
| 2 x Cytoplasmic Bleeder | mid | on-arrival | guarding | strike |  |  |
| 4 x Antigen Gnat | far | on-arrival | guarding | strike |  |  |
| 1 x Lattice Guardian | contact | on:take:canister | guarding |  | flag:job-complete |  |

**Who is here**
| Who | Wants | Offers | Will say |
| :-- | :-- | :-- | :-- |
| the Protease Warden's recovery team | the canister intact | 200 + 50 x Overflow S, to 400, on delivery for carry the serial into a Hegemony office and say it aloud | a price, once the serial is said aloud |


**What can be done here**
| Action | Pool | Threshold | Unhurried | Needs | On success | On failure |
| :-- | :-- | :-- | :-- | :-- | :-- | :-- |
| Taste the halo and find the serial | OSM + Chemoreception | standard | yes |  | reveal:3; flag:knows-serial |  |
| Say the serial aloud to the Warden |  | no roll |  | flag:knows-serial | offer:carry-serial |  |
| Agree to carry the serial |  | no roll |  | offer:carry-serial | oath:file; flag:serial-carried |  |
| Mask the Cohort and slip to the stone face | OSM + Concealment | severe |  |  | move:stone-face unseen | all organisms Marked |
| Convince the Guardian the job is complete |  | no roll |  | the Guardian awake | flag:job-complete |  |

*Anything else:* The stone itself cannot be cut: slag, salt and acid.

**Hazards**
| Hazard | Trigger | Clock gate | Effect | Hits | Save | How often | Counter | Then |
| :-- | :-- | :-- | :-- | :-- | :-- | :-- | :-- | :-- |
| The Render Charge | clock:TOLL:5 | TOLL 5 | 20 Kinetic, 2-band shift | site | none | once | be gone before TOLL 5 | setPiece:the-race |



**Secrets:** (1) The stone is warm, and something inside it leaks. (2) Two things claim this room: an armoured recovery team, and something folded still inside the stone. (3) The canister's serial is in a format retired before your lineage was written.

**Director briefing (162 words)**

```
SITE: The Gut Stone. A plug of fused slag, gut-crud and salt, thirty Drifts across, wedged in the curve of the gut. It is warm. A field of shards drifts before it and an acid halo clings to its face. One shaft leads up.
HERE: 1 Protease Warden (will-talk; looks: pale kit unmarked, register arm raised); 2 Cytoplasmic Bleeder (guarding; looks: long, soft and whole); 4 Antigen Gnat (guarding; looks: a loose cloud of rust-bright motes).
WHO: the Protease Warden's recovery team wants the canister intact.
CAN BE DONE: Taste the halo and find the serial; Say the serial aloud to the Warden; Agree to carry the serial; Mask the Cohort and slip to the stone face; Convince the Guardian the job is complete. The stone itself cannot be cut: slag, salt and acid.
WAYS OUT: the exit shaft; the pyloric duct.
SEEN ON ARRIVAL: The stone is warm, and something inside it leaks.
SAY FIRST: "This is Deadly."
TEACHES: The ending.
```


## Set pieces

### the-race *(chase; Core 4.14)*

1. The Pulse War ends. Creatures not at the stone face stand down; the Warden leaves with the flow.
2. Each Cycle every organism that is Up rolls DFF + Fluid Navigation at Standard. A carrier of a Dormant body rolls 1 die fewer.
3. Success: move one band toward the exit shaft. Failure: stay.
4. An organism at the shaft is out. After 3 Cycles the curve closes: anyone not out is lost with the carcass.

**Roll:** DFF + Fluid Navigation, Standard. **Win:** ending:escaped. **Lose:** ending:carcass-ends.

### registration *(exchange; Core 11.2 (Stakes Ladder))*

1. The Director states what success buys before any roll.
2. Three exchanges. In each, one organism speaks and rolls AFF + Signal Discourse at Standard.
3. Two successes: the claim is signed. Fewer: the offer stands but its price rises one step.

**Roll:** AFF + Signal Discourse, Standard. **Win:** the interactable's onSuccess. **Lose:** no change; may be tried once more at a cost.

## Endings

| Ending | When | Says |
| :-- | :-- | :-- |
| escaped | at least one organism leaves by the exit shaft after the Render Charge | Out of the whale, with whatever you carried. |
| left-with-cut | the Cohort leaves by the sled-cable or pump shaft | You leave with your cut; stamped or not decides what it was worth. |
| walked-away | the Cohort leaves by the Toll Reach | The queue closes behind you. |
| carcass-ends | the race is lost, or every organism is Dormant when the Render Charge fires | The carcass ends with you in it. |
| whale-goes-over | CARCASS is full | The whale goes over; nothing left in it is worth cutting. |
| render-cascade | HUNGER is full | The Render Cascade: everything in the Reach arrives at once. |

## Gap list: 25 facts the Vector leaves to the Director today

Each is filled above with a proposal. None is decided.

| Where | Gap and proposal |
| :-- | :-- |
| clockTriggers/body-cut | The coded Vector names HUNGER for a body cut and for a body left, without the sign. Proposed +1 for each, once per site for "left". |
| clockTriggers/oath-kept | The sign is not in the coded data. Proposed -1: a kept promise buys time with the law. |
| clockTriggers/pump-opened | "TOLL +1 if the Guild sees it": the barge crew are Guild-licensed and present, so proposed always, unless the crew have been sent away. |
| toll-vent/swear-toll | The Core Rite takes an hour and 10 S; here the promise is taken on the spot. Proposed: a quick oath is allowed at a printed witness-seam, costs the Oath box only, and the answer to "what do you promise?" is filed at once. |
| toll-vent/offer-water | The Vector says a swarm offered water leaves but not where the water comes from. Proposed cost as shown. |
| soft-field/hijack-mite | "Add 2 more Mites once the Cohort has got Lesson 4." Proposed test: the Render Hall has been visited. |
| soft-field/pricedChoice/3 | "CARCASS -1 for that panel only" is unclear. Proposed: the panel-opens trigger is skipped for that cut. |
| soft-field/pricedChoice/5 | The contest is not specified. Proposed: AFF + Signal Discourse at Standard, or pay 20 S. |
| soft-field/scout-far | No Threshold is printed. Proposed Common. |
| soft-field/salt-cache | Where the cache is and how it is found is not in the coded data. Proposed: revealed by scout-far. |
| soft-field/harvest/site | The grade-by-CARCASS table is in Vector 7.2 and was not in the coded data. The yield shown is what the benches paid. |
| render-hall/medium/wrong-tonic | Printed as "-1 to -2 unless prepared". Proposed: -1; -2 for a body in the churn; a Neutraliser or an Osmotic Filter counts as prepared. |
| render-hall/open-pump | No pool or Threshold is printed, nor a number for "both Orders lose their footing". Proposed as shown. |
| render-hall/read-dead | Printed as "worth a read, not a haul" with no roll. Proposed as shown. Benches: the Feeders Rendered all four before anyone read them. |
| brood/smell-brood | No Threshold printed. Proposed Standard. |
| brood/cut-brood | "400 to 900 S" has no rule for the amount. Proposed: 400 plus 100 per point of Overflow, capped at 900. |
| gut-stone/shard-field | "Difficult ground; everything cuts" has no numbers. Proposed: Drifting through costs 1 extra Pulse Point; no damage. |
| gut-stone/lattice-guardian | The play note names a Lattice Guardian folded around the print job, but it is not in the encounter list or the 12 BSP. Proposed: it wakes only if the canister is taken, and is not counted in the rating. |
| gut-stone/find-serial | No Threshold printed. Proposed Standard. |
| gut-stone/slip-past | No Threshold printed. Proposed Severe (the Warden reads the room for a living); failure Marks the Cohort. |
| gut-stone/convince-guardian | No procedure printed. Proposed: the same three-exchange procedure as the brood. |
| setPieces/the-race | The Vector says only "Not survived: raced", and the Core chase is three lines. Benches improvised it and asked a Dormant organism for a throw. Proposed procedure as shown; the 3-Cycle limit is mine. |
| setPieces/registration | The Vector says "three exchanges, Stakes Ladder visible" with no roll. Proposed as shown. |
| endings/whale-goes-over | What "the whale goes over" does to a Cohort still inside is not in the coded data. |
| endings/render-cascade | No procedure in the coded data. |

## Validator

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
