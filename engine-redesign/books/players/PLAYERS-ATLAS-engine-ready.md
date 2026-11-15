# The Player's Atlas, Engine-ready edition

Version 0.1 draft, 15 November 2026. The data is in `players.json`; this file is the same content for reading. It does not change how the game plays.

What is finished here: creation numbers, every derived-number formula, the action list with pools, all 20 Apparatus and 23 properties as numbers, 20 Grafts and 20 Vials, the six Lineages and 24 Phenotypes as headers (Hull, key Baselines, Pathway ranks, Stage names), and the four Hands of The First Carve checked against the formulas.

What is still sentences, counted so the work is visible:

| Still to convert into records | Count |
| :-- | :-- |
| Phenotype Signature Mechanics | 24 |
| Phenotype Stage features | 96 |
| Lineage Gifts and Frailties | 12 |
| Adaptations | 19 |
| Graft specials | 19 |
| Vials without an effect record | 2 |
| Properties needing a ruling | 1 |

## 1. Making an organism: the numbers

- Baselines: place 4, 4, 3, 3, 2 on VSC, DFF, RTC, OSM, AFF, then apply the Lineage's +1 and -1. Range at creation 1 to 5.
- Pathways: the Phenotype's ranks, plus 2 more at rank 1; none above 2 at creation.
- Purse: 40 Substrate. A licence loan is 100 S at 5 S per Beat.

## 2. Derived numbers

The Engine computes these from choices. A sheet never stores a note such as "20, or 25 with the Wrap".

| Number | Formula |
| :-- | :-- |
| Max Membrane Integrity | 12 + VSC*4 + Hull + 2*(Level-1) + 6 per Stage past I + graft and Adaptation bonuses |
| Max ATP | 8 + RTC*2 |
| Pulse Points per turn | 2 + DFF + modifiers |
| Membrane Threshold | 10 + DFF + graft, size and condition modifiers |
| Flow (Drifts per Drift action) | 3 + DFF |
| Lysis Countdown boxes | VSC + ceil(Hull/2) + 2 |
| Oath boxes | AFF |
| Bulk capacity | VSC*5 (+1 per Growth) |
| Graft Slots | 1 + 1 per Stage past I |
| Homeostatic Baseline of a pool | dice * 3 |

## 3. Actions

| Action | PP | ATP | Pool | Against | Target | Legal when |
| :-- | :-- | :-- | :-- | :-- | :-- | :-- |
| Strike | 2 |  | by Apparatus class: Weight VSC + Membrane Penetration; Lash DFF + Membrane Penetration; Projector DFF or RTC + Membrane Penetration; Resonator RTC + Catalysis; plus the Apparatus bonus | target Membrane Threshold | one body in the weapon's band | own turn; +1 PP if Heavy |
| Drift | 1 |  |  |  | a band | own turn; leaving Contact with a foe there invites a Flank Breach |
| Hold a Reserve | 1 |  |  |  | self | own turn; one held at a time (two with Twin Reserve) |
| Vent | 1 | 2 |  |  | self | own turn |
| Sense | 1 |  | OSM + Chemoreception | the hidden thing's DFF + Concealment, or the site's printed Threshold | the site or one body | own turn |
| Use a Vial | 2 |  |  |  | self or an ally at Contact | own turn (a Synthesise action); free outside a fight |
| Stabilise | 2 |  | RTC + Synthesis | 12 + target Level | a Dormant ally at Contact | own turn (a Synthesise action) |
| Harvest | 2 |  | OSM or RTC + Synthesis (+2 dice with a Harvesting tool) | tier*4 + 8 or the printed number | a destroyed creature at Contact, or the site where its record allows | own turn, or 10 minutes outside a fight (then no roll if pool*3 meets the Threshold) |
| Pull a Lodged weapon | 2 |  |  |  | self or an ally at Contact | own turn (a Synthesise action); deals 4 damage |
| Burst | 3-5 | same | RTC + Catalysis (or the Burst's own) |  | by Burst | own turn; knows the Burst; not Locked |
| Overdrive | 0 |  |  |  | one of your own rolls | before the roll; 4 ATP for +2 dice or 4 MI for +4 dice and 1 Stress; once per roll |
| Assist | 0 |  |  |  | an ally's roll | same Pathway, in reach; +1 die, at most two helpers |
| Swear an Oath | 0 |  |  |  | who it is owed to | a witness the site lists is present; an Oath box is free |
| End turn | 0 |  |  |  | self | own turn; no roll pending |
| React (Deflect, Inhibit, Brace, Shed, Flank Breach) | the held Reserve |  |  |  | the triggering attack or effect | holding a Reserve; one reaction per Cycle |

## 4. States, and what a player's screen shows

| State | The screen shows | May |
| :-- | :-- | :-- |
| up | every legal action with its cost | act, react, roll, harvest, speak |
| dormant | no actions; the Countdown boxes; "an ally at Contact can stabilise you" | one short signal; forced saves at Baseline 1 |
| lysed | the Legacy choice | nothing |
| absent *(proposed)* | nothing asked of this seat | nothing; the organism is not targeted and takes no turn |

## 5. Words for the numbers *(proposed)*

So a Director can describe a player's organism without reading the sheet aloud. A player may always be told their own numbers.

| Field | Bands |
| :-- | :-- |
| MI | over 75%: "whole"; 50-75%: "marked"; 25-50%: "torn"; under 25%: "failing"; 0: "gone dark" |
| Stress | 0-2: "steady"; 3-4: "strained"; 5: "shaking"; 6-7: "coming apart" |
| Pulse Points | full: "fresh"; 2 or more: "something left"; 1: "one breath"; 0: "spent" |
| Countdown | none marked: "holding"; half marked: "thinning"; one left: "at the edge" |

## 6. Apparatus (Core 9.3)

| Apparatus | Class | Band | BD by tier | Dice | Type | Properties | Cost (S) |
| :-- | :-- | :-- | :-- | :-- | :-- | :-- | :-- |
| Chitin Flail | Weight | Contact | 4/6/8/10/12 | +1 | Kinetic | Heavy; Braced | 15 |
| Osmotic Maul | Weight | Contact | 4/6/8/10/12 |  | Osmotic | Heavy; Pushing | 25 |
| Pressure Ram | Weight | Contact | 5/7/9/11/13 | -1 | Kinetic | Heavy; Two-handed; Braced; on Momentum +2 dice | 60 |
| Bony Flail of the Wastes | Weight | Near | 4/6/8/10/12 | +1 | Lytic | Reach; Acidic | 220 |
| Peptide Blade | Lash | Contact | 3/5/7/9/11 | +1 | Lytic | Fluid; Silent | 20 |
| Cilia Saw | Lash | Contact | 3/5/7/9/11 | +1 | Kinetic | Fluid; Serrated | 35 |
| Flagellar Whip | Lash | Mid | 2/4/6/8/10 |  | Kinetic | Reach; Sweeping | 45 |
| Needle Dagger | Lash | Contact | 2/4/6/8/10 | +2 | any | Finesse; Lodged; Silent | 40 |
| Spore Pistol | Projector | Mid | 2/4/6/8/10 | +1 | Lytic | Reload | 30 |
| Barbed Launcher | Projector | Far | 3/5/7/9/11 |  | Kinetic | Lodged; Braced; −1 in Near | 55 |
| Acid Duct | Projector | Near | 3/5/7/9/11 | +1 | Lytic | Spray; Corrodes | 120 |
| Needle Scatter | Projector | Mid | 2/4/6/8/10 | +1 | Kinetic | Spread; Precision | 200 |
| Enzyme Horn | Resonator | Self/Zone | 2/4/6/8/10 | +1 | Lytic | Amplifies Lytic Bursts +1 EV | 80 |
| Phase Bell | Resonator | Mid | 2/4/6/8/10 | +1 | Voltaic | Amplifies Galvanic Bursts +1 EV; Conductive | 180 |
| AE Crucible | Resonator | Self |  | +2 | any | You may spend 4 ATP instead of a Vial to power one Burst per Cycle | 450 |
| Cryo Vent | Resonator | Mid | 3/5/7/9/11 | +1 | Thermic | Cold Shock; Thermal amplification | 300 |
| Tuning Fork of the Deep Flow | Resonator | Far | 1/3/5/7/9 | +1 | Osmotic | Ranged Osmotic push; doubles Momentum on allies in the band | 500 |
| Suture Cannon | Projector | Mid |  | +1 | heal | Fires Substrate darts: Synthesise action heals an ally at EV + Overflow − 4; 6 shots | 260 |
| Harvest Claw | Lash | Contact | 2/4/6/8/10 |  | Kinetic | Harvesting (Harvest checks +2 dice; one free Harvest per Pulse War) | 90 |
| Grapple Tendril | Lash | Near→Mid | 1/2/3/4/5 | +1 | Kinetic | Pull; Anchor | 110 |

## 7. Properties as numbers

| Property | Engine applies | Say |
| :-- | :-- | :-- |
| Heavy | strikePp 1, needs VSC 3 | slow to swing |
| Two-handed | needs VSC 4 | takes both hands |
| Braced | dice 1, when did not Drift this Cycle, blocks momentum | set before the swing |
| Momentum | dice 1, push 1, when Momentum applies | carried by the rush |
| Fluid | usableWhile Sequestered; grappled; pinned | works in a clinch |
| Silent | keeps Masked, noFlankBreach true | makes no sound |
| Serrated | onOverflow 2, inflicts Brittle, limit once per target per fight | tears as it leaves |
| Lodged | onHit condition Lodged, removal action synthesise, damage 4 | the blade stays in |
| Spread | targets all in band, dice -1 | a scatter |
| Spray | targets all in band, dice -1 | a wash across the band |
| Precision | riderOnOverflow 6 | finds the seam |
| Corrodes | onHit soak -1, max -3, until repaired | eats the armour |
| Acidic | onHit soak -1, max -3, until repaired | eats the armour |
| Conductive | type Voltaic, ignoresSoak family Mucoid, amount 2 | carries a charge |
| Reach | bandShift 1, dice -1, when used at the further band | long |
| Amplification | burstEffect 1, when a Burst of its domain while held | sings with the reaction |
| Pushing | push 1 | shoves |
| Sweeping | onRunaway targets all in Contact | sweeps wide |
| Harvesting | harvestDice 2, freeHarvest one per Pulse War | made for the cut |
| Pull | pull 1 | drags it in |
| Anchor | cannotBePushed true | holds you fast |
| Reload | uses 3, refill 1 Vial of spores | needs feeding |
| Finesse | no rule printed: The book names it but gives no rule. | light and exact |

## 8. Grafts (Core 9.4)

| Family | Strong against (soak) | Weak against | Other |
| :-- | :-- | :-- | :-- |
| Lipid | Osmotic 2, Thermic 1 | Lytic -2 |  |
| Fibrous | Kinetic 2, Lytic 1 | Thermic -2 |  |
| Testate | Lytic 2, Kinetic 1 | Osmotic -2 | DFF -1 |
| Mucoid | Thermic 2, Voltaic 2, Osmotic 1 | Genetic -2 |  |
| Somatic | all 1 | Genetic -2 | 1 ATP per Cycle or the soak halves |

| Graft | Family | Slots | Soak | DFF | Cost (S) | Special |
| :-- | :-- | :-- | :-- | :-- | :-- | :-- |
| Lipid Weave Wrap | Lipid | 0 | 1 |  | 20 | +5 max MI; cheap, disposable |
| Reinforced Weave | Lipid | 1 | 2 |  | 60 | +1 to Pressure Tolerance *(to convert)* |
| Fibrous Lattice Vest | Fibrous | 1 | 3 |  | 120 | +1 Bulk capacity; can be harvested off a body *(to convert)* |
| Testate Half-Shell | Testate | 1 | 4 | -1 | 200 | +2 Lytic soak; immune to Cavitation Snap *(to convert)* |
| Full Testate Carapace | Testate | 2 | 6 | -2 | 650 | MT −3; cannot be pushed; +2 MI per VSC Grade *(to convert)* |
| Mucoid Mantle | Mucoid | 1 | 3 |  | 180 | Voltaic/Thermal soak doubled; Genetic −2 *(to convert)* |
| Somatic Bulwark | Somatic | 2 | 5 |  | 900 | Heals itself 2 MI/Cycle for 1 ATP; can be *talked down* by Genetic effects *(to convert)* |
| Chitin Spurs | Fibrous | 1 | 1 |  | 90 | Reactive Osmosis now deals 5 Kinetic to the attacker *(to convert)* |
| Osmotic Filter | Lipid | 1 | 1 |  | 150 | Ignore one tonic state; +2 to Pressure Tolerance *(to convert)* |
| Scent Dampener | Mucoid | 1 | 0 |  | 220 | You cannot be tracked by scent while Venting once per Fugue Interval *(to convert)* |
| Secondary Lens | Lipid | 1 | 0 |  | 140 | See in turbid; +2 OSM in light bloom *(to convert)* |
| Deep Ear | Fibrous | 1 | 0 |  | 160 | Sense bands and Flow as a free action; +1 PP in ambuscades you set *(to convert)* |
| Vacuole Sac | Lipid | 1 | 0 |  | 110 | +10 Bulk; can store 20 Substrate as an emergency ration (2 MI heal per 5 S drunk) *(to convert)* |
| Flagellar Motor | Fibrous | 1 | 0 |  | 300 | +2 Flow; Momentum threshold drops to 2 Drifts *(to convert)* |
| Pore Locks | Testate | 1 | 2 |  | 240 | Immune to Grapple/Anchor; Leaking effects auto-close *(to convert)* |
| Heat Sink | Testate | 1 | 2 |  | 320 | Absorb Thermal: spend absorbed damage as +BD on your next Strike (max +6) *(to convert)* |
| Reactive Nodes | Somatic | 2 | 1 |  | 550 | Your Reactive Osmosis costs 0 PP once per Cycle *(to convert)* |
| Signal Vane | Mucoid | 1 | 0 |  | 400 | +2 Signal Discourse; allies in Mid band may spend your Reserve (their own PP to buy it) *(to convert)* |
| Antigen Hood | Fibrous | 1 | 2 |  | 500 | Immune Sentinels treat you as "self" once per scene *(to convert)* |
| Nucleoid Shard Inlay | Somatic | 2 | 1 |  | 1400 | +1 RTC; one extra Burst sequence can be hot; −1 to Genetic saves (the Code notices you) *(to convert)* |

## 9. Vials (Core 9.5)

| Vial | Cost (S) | Effect record | Book text |
| :-- | :-- | :-- | :-- |
| Glucose Ampule | 3 | atp 4 | +4 ATP now |
| Amino Drip | 6 | heal 6, stress 1 | heal 6 MI; mark 1 Stress (it is raw and unpleasant) |
| Lipid Patch | 8 | ends Leaking; Brittle, soakVs Lytic 2, cycles 3 | close Leaking; +2 soak vs Lytic for 3 Cycles |
| AE Droplet | 15 | burstDice 2 | +2 dice to one Burst, or fuel a Burst you do not know once |
| Catalyst Charge | 20 | nextStrike bd 2, riderOnOverflow 4 | your next Strike this Cycle: +2 BD and its Rider triggers on Overflow 4+ |
| Neutraliser | 18 | ignoreTonic scene | ignore a tonic state for 1 scene; or end Acidic effects on you |
| Stress Flush | 12 | stress clear, mi -2 | clear all Stress; −2 MI (the purge costs) |
| Inhibitor Grenade | 25 | target one foe, nextRollDice -2, targetStress 1 | one enemy's next roll: −2 dice, and they mark 1 Stress |
| Pheromone Mask | 20 | gains Masked | Masked until you Strike or speak loudly |
| Scent Bomb | 22 | zone true, inflicts Marked, thenSelf Marked | everyone in zone is Marked; allies gain +1 die against them, then the bomb's owner is Marked too |
| Turgor Shot | 25 | pp 1, flow 4, cycles 3, after Turgid | +1 PP and +4 Flow for 3 Cycles; Turgid afterwards |
| Sequence Key | 60 | dice Sequence Reading 3 | +3 to Sequence Reading; reveals one forged or hidden sequence |
| Graft Antidote | 45 | *(to convert)* | end Rejection for 1 Beat, or suppress a Parasitic Graft for a scene |
| Substrate Foam | 10 | structureMi 10 | seals a structure (restores 10 MI to a wall/gate) |
| Coagulant Pack | 14 | stabilise true, countdown -1 | stabilise a Dormant ally without a check; closes 1 Countdown box |
| Hot Iron Dose | 30 | miFloor 1, until Reconstitution, noHealing true | cauterise: your MI cannot drop below 1 until your next Reconstitution; you cannot heal |
| Chitin Hardener | 35 | soak 2, dff -1, cycles 4 | +2 soak for 4 Cycles; −1 DFF |
| Memory Vial | 80 | *(to convert)* | record one scene's chemical semiotics; replay it later to +2 AFF in a related contest |
| Bloom Spore | 90 | zone true, alliesRegen 2, cycles 3, inflicts Marked | every ally in zone regens 2 MI/Cycle for 3 Cycles; every enemy in the zone is Marked |
| Terminal Dropper | 400 | burstEffect x3, stress 4, damage amount 8, type Lytic | one Burst's Effect Value tripled; you mark 4 Stress and take 8 Lytic damage |

## 10. Lineages

| Lineage | Baselines | Bonded Domain | Gift | Frailty |
| :-- | :-- | :-- | :-- | :-- |
| Amoeban | RTC 1, OSM -1 | Lytic | Reshape | Unwalled |
| Epithalian | VSC 1, DFF -1 | Protean | Draw Tight | Set |
| Flagellan | DFF 1, VSC -1 | Osmotic | Current Sense | Obligate Drifter |
| Lysosan | OSM 1, AFF -1 | Somatic | Latency | Registered |
| Immunan | AFF 1, RTC -1 | Galvanic | Self/Kin | Literal |
| Barophil | VSC 1, DFF -1 | Thermic | Hardened | Slow Reaction |

## 11. The twenty-four Phenotypes

Headers only. Each Signature Mechanic and Stage feature is still the book's paragraph and needs its own record (cost, trigger, target, effect), written the same way as a creature special.

| Phenotype | Role | Hull | Key | Bonded | Pathways | Signature | Stage features (I-IV) |
| :-- | :-- | :-- | :-- | :-- | :-- | :-- | :-- |
| Acidic Corrosor | Striker / attrition | 3 | RTC; VSC | Lytic | Catalysis 2, Membrane Penetration 1, Sequence Reading 1 | ETCH | Digest Armour / Spreading Taint / Unbound Appetite / Total Dissolution |
| Membrane Breacher | Breaker / opener | 6 | VSC; DFF | Osmotic | Membrane Penetration 2, Pressure Tolerance 1, Fluid Navigation 1 | BREACH CHARGE | Forced Entry / Rupture Push / Spatial Breach / Rupture Protocol |
| Enzymatic Splicer | Support / re-wiring | 3 | RTC; OSM | Somatic | Catalysis 2, Synthesis 1, Chemoreception 1 | SPLICE | Field Revision / Rank Splice / Type Splice / Chimera Sequence |
| Detritus Reclaimer | Bruiser / scavenger-engineer | 6 | VSC; RTC | Lytic | Vigour 2, Synthesis 1, Membrane Penetration 1 | SALVAGE | Efficient Gleaner / Cycle Doctrine / Reclaimer's Field / Return to the Cycle |
| Protein Weaver | Controller / fortifier | 4 | RTC; VSC | Protean | Synthesis 2, Protean Folding 1, Signal Discourse 1 | FOLD TOKENS | Read the Grain / Living Sheet / Tensile Works / Cathedral Fold |
| Peptide Constructor | Summoner / engineer | 4 | RTC; AFF | Protean | Synthesis 2, Symbiosis 1, Sequence Reading 1 | ASSEMBLY | Standing Orders / Inserted Doctrine / Linked Line / Foundry |
| Amino Acid Smith | Support / gear-shaper | 4 | RTC; AFF | Protean | Synthesis 2, Chemoreception 1, Vigour 1 | TUNE | Honest Work / Overcharge / Field Forge / Masterwork Sequence |
| Ribozyme Engineer | Ritualist / pattern-thief | 3 | RTC; OSM | Somatic | Catalysis 2, Sequence Reading 2, Chemoreception 1 | TEMPLATE | Annotated Margin / Printed Dose / Revision / Write a New Sequence |
| Current Rider | Skirmisher / mounted striker | 4 | DFF; OSM | Osmotic | Fluid Navigation 2, Pulse Discipline 1, Concealment 1 | SLIPSTREAM | Reads Water / Wake Cutter / Standing Wave / Confluence |
| Turbulence Navigator | Controller / terrain | 4 | DFF; RTC | Osmotic | Fluid Navigation 2, Protean Folding 1, Chemoreception 1 | CHART | Chart Read / Redirect / Manufactured Current / Rewrite the Flow |
| Pheromological Messenger | Support / controller (social combat) | 3 | AFF; OSM | Galvanic | Signal Discourse 2, Chemoreception 2, Concealment 1 | BROADCAST CHARGES | Interpreter / False Chorus / Chorus Command / The Ninefold Name |
| Kinetic Striker | Striker / finisher | 4 | DFF; VSC | Osmotic | Membrane Penetration 2, Fluid Navigation 1, Vigour 1 | IMPACT | Long Run / Riposte of Arrival / Cascade Collection / Unanswered Motion |
| Genetic Hijacker | Controller / counter-catalyst | 3 | RTC; OSM | Somatic | Sequence Reading 2, Catalysis 1, Concealment 1 | INSERT | Reading the Host / Recombinant Payload / Competitive Exclusion / Permanent Insertion |
| Pathogen Scout | Seeder / attrition | 3 | OSM; DFF | Somatic | Chemoreception 2, Concealment 2, Synthesis 1 | VECTORS | Field Inoculation / Latent Period / Bloom Trigger / PANDORA |
| Viral Mimic | Infiltrator / identity | 3 | DFF; OSM | Somatic | Concealment 2, Sequence Reading 1, Symbiosis 1 | CAMOUFLAGE | Worn Face / Borrowed Function / Hive Mask / Unbound |
| Replicator Agent | Summoner / continuity | 4 | RTC; VSC | Somatic | Catalysis 1, Vigour 2, Sequence Reading 1 | BUDDING | Shared Sense / Strand Transfer / Differentiation / Colony of One |
| Antigen Detector | Support / counter-infiltration | 4 | OSM; AFF | Galvanic | Chemoreception 2, Signal Discourse 1, Pulse Discipline 1 | ASSAY | Antigen Sight / Registry of Enemies / Preemptive Recognition / Pan-Registry |
| Phagocyte Guard | Defender / absorber | 6 | VSC; AFF | Galvanic | Pressure Tolerance 2, Membrane Penetration 1, Vigour 1 | ENGULF | Bulwark Reflex / Extended Self / Digestion / Antigen Bulwark |
| Antibody Archer | Ranged striker / precision | 4 | DFF; RTC | Galvanic | Membrane Penetration 2, Signal Discourse 1, Chemoreception 1 | LOCK | Known Epitope / Avidity / Cross-Reaction / Classical Response |
| Complement Cascade Commander | Leader / chain reactions | 4 | AFF; DFF | Galvanic | Symbiosis 2, Signal Discourse 2, Pulse Discipline 1 | CASCADE | Rally Field / Marker Spread / Classical Pathway / Membrane Attack Complex |
| Acid-Resistant Tank | Defender / reflector | 6 | VSC; RTC | Lytic | Pressure Tolerance 2, Vigour 1, Synthesis 1 | VAT | Acid-Hardened / Swallow / Shared Bath / The Long Burn |
| Thermal Diver | Zone controller / bruiser | 4 | RTC; VSC | Thermic | Catalysis 2, Vigour 1, Pressure Tolerance 1 | GRADIENT | Thermal Indifference / Flash Point / Steam Vent / Critical Point |
| Osmotic Brute | Bruiser / positioning destroyer | 6 | VSC; DFF | Osmotic | Membrane Penetration 2, Pressure Tolerance 2, Fluid Navigation 1 | TURGOR | Immovable / Pore Grapple / Pressure Wave / Implosion |
| Desiccation Specialist | Attrition / anti-environment | 4 | OSM; RTC | Thermic | Chemoreception 2, Synthesis 1, Vigour 2 | DRY ZONE | Dry Skin / Withering Touch / Dust Field / Salt the Earth |

## 12. Adaptations

| Adaptation | Cost | Effect (to convert) |
| :-- | :-- | :-- |
| Denser Wall | 60 S | +6 max MI; −1 Flow |
| Twin Reserve | 120 S | You may hold 2 Reserve PP; each can be spent once per Cycle on a different Reactive Osmosis |
| Momentum Banker | 80 S | Momentum persists if you move 2+ Drifts on your next turn |
| Etched Hide | 150 S | Corrodes, Brittle, and Acidic surges can never drop your soak below 2 |
| Vent Master | 100 S | Vent clears 3 Stress and one condition for 1 PP |
| Chemical Literacy | 60 S | +1 Sequence Reading rank; learn one Burst free |
| Antigen Discipline | 200 S | +2 dice on all saves against Genetic effects and Hijacks |
| Burst Efficiency | 250 S | Pick a domain: its Bursts cost −2 ATP (min 1) |
| Sustained Control | 200 S | Your Sustained Reactions cost no Stress; you may hold two |
| Overdrive Training | 300 S | Overdrive costs 3 ATP / 3 MI; you may Overdrive twice per Cycle (different rolls) |
| Pressure Nerves | 120 S | Ignore the first hazard or environmental damage each scene; +2 Pressure Tolerance |
| Harvest Hands | 90 S | Harvest checks +2 dice; on Overflow 4+ gain one extra Specimen grade |
| Current Reader | 90 S | Currents never force saves against you; +2 Drifts in any Flow |
| Symbiotic Authority | 150 S | +1 creature under control; your minions gain +1 PP |
| Second Organ | 400 S + 1 P | Once per Tide, when you would drop to 0 MI, drop to 1 MI instead and mark 2 Countdown boxes |
| Oathkeeper | 100 S | +1 Oath box; keeping an Oath that costs you gives +1 Cohesion and clears 1 Stress |
| Autophagic Control | 300 S | While in Autophagy you mark no Countdown boxes (2 Stress per Cycle instead) |
| Graft Mastery | 500 S + 1 G | +1 Graft Slot (on top of your Stage slots) |
| Chimeric Growth | 600 S + 1 P | Take another Phenotype's Stage I feature (and its granted Pathway at rank 1). Requires Stage II. Prerequisite: you must have been *harvested* by or of that tradition at least once |

## 13. Starting packs

| Pack | Contains | For |
| :-- | :-- | :-- |
| Waller | Chitin Flail (15), Lipid Weave (20), 1× Glucose Ampule (3) | Guard, Tank, Brute |
| Lash | Peptide Blade (20), Reinforced Weave (60 — take the loan), 2× Amino Drip (12) | Corrosor, Striker, Splicer |
| Shot | Spore Pistol (30), 1 spore reload (3), Lipid Bead Vial | Archer, Scout, Navigator |
| Hand | Harvest Claw (90 — loan), Glucose Fragment kit, Scribe Slug symbiote later | Reclaimer, Smith, Constructor |
| Signal | Needle Dagger (40), Pheromone Trace ×2 (10), Signal Dampener Sac (55 — loan) | Messenger, Detector, Mimic |
| Deep | Barbed Launcher (55), Salt Bloom (10), Osmotic Filter Scrap (55 — loan) | Diver, Desiccation, Rider |

## 14. The four Hands of The First Carve

Rebuilt from Baselines, Hull, Level and kit. "Check" compares the Vector's printed numbers with the formulas.

| Hand | Phenotype | Baselines | Hull | Derived | Weapons | Check | Note |
| :-- | :-- | :-- | :-- | :-- | :-- | :-- | :-- |
| The Wall | Immunan Phagocyte Guard | VSC 4, AFF 5, DFF 3, OSM 3, RTC 1 | 6 | miMax 39, atpMax 10, pp 5, mt 13, flow 6, countdown 9, oath 5, bulk 20, slots 1 | chitin-flail | matches |  |
| The Ledger | Epithalian Amino Acid Smith | RTC 4, VSC 5, DFF 2, OSM 3, AFF 2 | 4 | miMax 36, atpMax 16, pp 4, mt 12, flow 5, countdown 9, oath 2, bulk 25, slots 1 | harvest-claw; chitin-flail (not carried) | matches | The Vector prints no Oath boxes for this Hand; the formula gives AFF. |
| The Rider | Flagellan Current Rider | DFF 5, OSM 4, RTC 3, AFF 3, VSC 1 | 4 | miMax 25, atpMax 14, pp 7, mt 15, flow 8, countdown 5, oath 3, bulk 5, slots 1 | peptide-blade | matches | The Vector prints no Oath boxes for this Hand; the formula gives AFF. |
| The Eyes | Lysosan Pathogen Scout | OSM 5, DFF 4, RTC 3, VSC 3, AFF 1 | 3 | miMax 27, atpMax 14, pp 6, mt 14, flow 7, countdown 7, oath 1, bulk 15, slots 1 | needle-dagger; spore-pistol (not carried) | matches | The Vector prints no Oath boxes for this Hand; the formula gives AFF. |

## 15. Questions for Roly

1. "Finesse" is on the Needle Dagger but has no rule in Core 9.3. What does it do?
2. The Vector prints Oath boxes for the Wall only. Do the other three Hands have Oath boxes equal to AFF, as the Atlas formula says?
3. The Bulk formula (VSC x 5) comes from the Engine's code; the Atlas sheet shows Bulk but I did not find the formula stated. Is it right?
4. An absent player: is the organism simply not there (proposed), or run by the table?
5. Should the 24 Signature Mechanics be converted next, or only the ones the pregenerated Hands use?
