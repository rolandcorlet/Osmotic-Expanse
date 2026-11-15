# The Catalytic Engine: Core Rulebook, Engine-ready edition

Version 0.1 draft, 15 November 2026. Built from `The Osmotic Expanse - CORE RULEBOOK.md`. The data is in `core-rules.json`; this file is the same content for reading.

This edition does not change how the game plays. It restates the rules the Engine must enforce as tables and steps, so nothing has to be read from a sentence at run time. Each entry is marked where it is not plain book text: *(house)* is a ruling already made in play, *(proposed)* is my reading where the book is silent and needs Roly's decision.

**Converted:** I Resolution; II.4 Specimens; IV The Pulse Economy; V Breach, Stress and Lysis; VII.4 Hazards; VIII.3 Harvest; XI.4 Oaths.
**Not yet converted:** II.1-3 and II.5 economies in full; III Pathways; VI Bursts (24 records to write); VII.1-3, 5-6 the fluid medium; VIII colony life; IX gear; X harvest table; XI.1-3, 5-7 dialogue; XII legacy.

## 1. Timing

| Unit | Starts when | Ends when | Note | Core |
| :-- | :-- | :-- | :-- | :-- |
| Turn | an organism or creature receives its Pulse Points | it ends its turn or has no Pulse Points and no pending roll |  | 4.2 |
| Pulse Cycle | the first actor in Frequency order begins | the last actor has ended its turn | About six seconds. Unspent Pulse Points and unspent Reserves are lost at the end. | 4.2, 4.10 |
| Scene | the Cohort arrives at a site, or the purpose or the people present change | the place, the purpose or the people change |  *(house)* | 8.1; ledger hazard budget |
| Fugue Interval | declared rest | about an hour later |  | 5.10 |
| Dormant Cycle | rest in a secured nest or cyst | six hours later |  | 5.10 |
| Metabolic Beat | set by the Vector | set by the Vector | A unit of downtime; each Vector states how long one is. | 8.1 |

| Limit | Means |
| :-- | :-- |
| once per Cycle | at most one use between the start of one Cycle and the start of the next; outside a Pulse War it is read as once per scene *(house)* |
| once per scene | at most one use until the scene ends *(house)* |
| once per encounter | refreshed only by a Dormant Cycle |

## 2. The one roll (Core 1.1)

**Pool:** Baseline Grade + Pathway Rank + modifiers (capped at +5 / -5 dice); never fewer than 1 die.

1. Each 1 is an Inhibitor: it scores 0 and marks 1 Stress on the roller.
2. Total = sum of the other dice.
3. Success if Total >= Threshold.
4. Overflow = Total - Threshold, on a success.
5. Runaway Catalysis: no 1s and at least two 6s. Effect Value counts twice (before soak) and the Rider applies.

**No roll needed (Homeostatic Baseline, Core 1.6):** Unopposed and unhurried: succeed without rolling if pool x 3 >= Threshold.

**Contests (Core 1.5):** Both roll. Higher total wins; ties go to the defender. The winner gets the difference as Overflow. Attacks are never contests: they roll against Membrane Threshold.

**On a failure (Core 1.9):** one of: cost: it works, at a printed price; turn: it fails and the situation moves; complication: it works for the wrong party. The site or creature record should print which applies; if none is printed the default is "turn". *(proposed)*

## 3. The Threshold ladder

| Threshold | Name | When |
| :-- | :-- | :-- |
| 8 | Common | Any organism with the Pathway can do this under pressure. |
| 12 | Standard | A competent specialist does this more often than not. |
| 16 | Severe | Needs real mastery, good tools or a plan. |
| 20 | Extreme | Hegemony engineering; colony-wide effort. |
| 24 | Nucleoid | The Sacred Code itself leans in. |
| 28 | Apotheotic | One organism per generation. |

A Threshold for a task is always a rung of the ladder, a creature's printed number, or a number printed on a site. Odd numbers (14, 15) come only from printed records. The Director picks a rung by name, never a number. *(proposed: Benches showed Thresholds of 14 and 16 chosen on the spot; 1.2 already says difficulty is fixed.)*

## 4. Modifiers: the closed list

Modifiers add or remove dice, to a cap of +5 / -5. Bought dice (Overdrive) sit outside the cap. **Nothing outside this list may change a pool.** "Applied by" says who adds it: the Engine from state, the site or gear record, or the Director by picking its id when the trigger is true.

| Id | Modifier | Dice | Applied by | Trigger | Core |
| :-- | :-- | :-- | :-- | :-- | :-- |
| stress | Injured (Stress 3 / 5 / 6) | -1 / -2 / -3 | engine | the roller's Stress track | 1.3, 5.8 |
| tool | Tool made for the task | +1 / +2 | gear | the item names the task | 1.3 |
| assist | Assisted by a trained ally | +1 | engine | an ally with the same Pathway, in reach, says they help | 1.3, 1.7 |
| advantage | Good position or prepared reagents | +1 | director | the player has used a zone, an interactable or an earlier success that the site record tags as an advantage for this action *(proposed)* | 1.3 |
| wrong-tonic | Working in the wrong tonic | -1 / -2 | site | the site's tonic against the roller's Lineage | 1.3, 7.2 |
| cover-partial | Target in partial cover | -2 | site | the target's zone grants partial cover | 1.3 |
| cover-heavy | Target in heavy cover | -4 | site | the target's zone grants heavy cover | 1.3 |
| squeezed | Squeezed, pinned or in a vortex | -2 | engine | the roller is in a zone, or under a condition, tagged squeezed | 1.3 |
| catalysed | Catalysed | +1 | engine | a Vial, ally Burst or graft names this roll; re-roll one 6 if it comes up 1 | 1.3 |
| momentum | Momentum | +2 / +3 | engine | Drifted 3+ Drifts in a line then Struck in the same Cycle (+3 if the Drift began in a Nutrient Current); the Strike becomes Kinetic | 4.3 |
| marked | Target is Marked | +2 | engine | the target has Marked | 4.7 |
| overdrive-atp | Overdrive (4 ATP) | +2 | engine | the roller pays; once per roll | 1.8 |
| overdrive-mi | Overdrive (4 MI) | +4 | engine | the roller pays and marks 1 Stress; once per roll | 1.8 |
| inhibited | Inhibited by a foe | -2 | engine | a foe spends 3 ATP and a Reserve | 1.8, 4.10 |
| flank | Flank Breach | Overflow +1 | engine | a free Strike on a foe leaving Contact | 4.11 |

## 5. Overflow

| Attempt | Overflow buys | Decided by |
| :-- | :-- | :-- |
| attack | extra damage, 1 for 1 | engine |
| movement or pursuit | extra Drifts, or one band of distance | engine |
| manipulation or crafting | one grade of quality per 4 Overflow | engine |
| social | one concession from the record's printed list | director |
| stealth | -1 to be noticed per 2 Overflow | engine |
| repair | extra MI restored, 1 for 1 | engine |

## 6. Bands

| Band | Drifts | Reach |
| :-- | :-- | :-- |
| Contact | 0 | touch, lash, engulf |
| Near | 1-3 | short lash, thrown spore |
| Mid | 4-9 | projector, spray, lunge |
| Far | 10-20 | arc, torrent, cascade; turbid fluid cuts it to Near |
| Loose | 21+ | area, current-borne or scent-borne effects only |

A band shift moves a body one band along contact > near > mid > far > loose. Outward unless the record names a direction. Two shifts from different effects in the same step add together; a body cannot go past Loose or inside Contact. *(proposed)*

## 7. Actions and reactions

| Action | PP | ATP | What it does | Legal when |
| :-- | :-- | :-- | :-- | :-- |
| Drift | 1 |  | Move up to Flow (3 + DFF Drifts). Also: stand, draw a graft, pass a Vial, break a hold (contested VSC). | own turn, has 1 PP, not Sequestered or Encysted |
| Vent | 1 | 2 | Stress -2. Ends Turgid and Overclocked. | own turn |
| Sense | 1 |  | OSM + Chemoreception against hidden things; a success against a Masked foe ends Masked. | own turn |
| Strike | 2 (Heavy Apparatus +1) |  | One attack against Membrane Threshold. | own turn; target in the weapon's reach |
| Synthesise | 2 |  | Apply a Vial, seal a pore (ends Leaking), patch Brittle, remove a Lodged weapon, stabilise a Dormant ally at Contact, harvest, set a trap. | own turn |
| Burst | 3-5 | same as PP | Activate an Enzymatic Burst. | own turn; not Locked |
| Reserve | 1 |  | Hold 1 PP for one reaction this Cycle. | own turn; one Reserve held at a time |
| End turn | 0 |  | Unspent PP are lost unless Split Frequency is declared. | own turn, no pending roll |
| Yield | all |  | Signal surrender for the whole Cycle. Killing a yielding organism marks 2 Stress on every witness and Cohesion -1. | own turn |

| Reaction | Cost | What it does | When |
| :-- | :-- | :-- | :-- |
| Deflect | 1 held PP | Membrane Threshold +4 against one incoming attack. | an attack is declared on you |
| Inhibit | 1 held PP (+3 ATP for the stronger form) | An attacker in Contact or Near re-rolls one die; or, for 3 ATP, rolls 2 fewer dice. | a hostile roll is declared and you can perceive it |
| Brace | 1 held PP | Halve Kinetic and Osmotic damage from one effect (after soak, round down, minimum 1); ignore its push. | damage is about to land |
| Shed | 1 held PP | End Locked, Turgid or Marked on yourself. | any time in the Cycle |
| Flank Breach | 1 held PP | One free Strike at +1 Overflow. | a foe Drifts out of your Contact band |

One reaction per Cycle per body. A held Reserve not spent is lost at the end of the Cycle.

## 8. Conditions

The numbers in "Engine applies" are added by the Engine while the condition is on. "Say" is the table word.

| Condition | Engine applies | Ends when | Say |
| :-- | :-- | :-- | :-- |
| Leaking | miPerTurn -1 | Synthesise action; Somatic Burst | losing itself into the water, leaving a trail |
| Turgid | dff -2, mt -2, tempMi 5 | tonic normalises; Vent; Shed | swollen tight |
| Flaccid | vsc -2, reachBands -1 | end of next Cycle | gone slack and small |
| Jostled | pp -1, mt -2 | end of next Cycle | knocked off its line |
| Denatured | rtc -2, burstEffect half | RTC save at end of own turn | chemistry scrambled |
| Catabolic | atpCost 1, atpRegen half | Reconstitution | burning through itself |
| Locked | noBurst true | save each Cycle; Shed | one of its tools held shut |
| Sequestered | cannotAct true | an ally breaks the cage; VSC save at -2 dice each Cycle | caged |
| Hijacked | reserveStolen true | OSM save; the hijacker is killed or revealed | something else has a hand on it |
| Masked | untargetableByScent true | you Strike; a foe's successful Sense | gone from the water's taste |
| Marked | attackersDice 2, cannotGain Masked | the marker is killed; 2-ATP scrub; Shed | lit up for everyone |
| Brittle | soakVsKinetic half, lyticIgnoresSoak 2 | Synthesise action with a Lipid patch | crazed like old glass |
| Overclocked | pp 1, stressPerCycle 2 | Vent; 3 Cycles pass | running too hot |
| Encysted | damage half, cannotAct true, cannotBeMoved true | 3 ATP from self or an ally | sealed in a shell |
| Bloom | miPerCycle 2, sensedWithin mid | Reconstitution; hostile scrub | flowering, loud to every nose |
| Lodged *(house)* | dff -1 | Synthesise action (removal deals 4 damage) | a weapon stuck in it |
| Braced *(house)* | usesBracedSoak true | you Drift | set and not moving |

A condition is on or off: the same condition does not stack. A new application of a timed condition restarts its timer. *(proposed)*

## 9. Attacks and damage (Core 4.8, 5.2)

- **Hit:** Total >= target Membrane Threshold.
- **Damage:** Overflow + Effect Value (twice on a Runaway) + Apparatus BD - Soak, minimum 1.
- **Membrane Threshold:** 10 + DFF + graft, size, cover and condition modifiers; a stationary object 5, or 8 if braced.
- **Breach:** A hit that exceeds remaining MI by 8 or more: straight to Dormant and mark 1 Countdown box at once.
- **Swarms:** A hit on a swarm removes ceil(Overflow / 3) + 1 Segments instead of MI. A swarm gets 1 Strike per 2 Segments.

| Type | Signature Consequences (the attacker picks one) |
| :-- | :-- |
| Kinetic | push 1 Drift per 4 Overflow; break a graft slot; Jostled |
| Lytic | Brittle; -1 soak until repaired (max -3); dissolve one Vial |
| Osmotic | Turgid or Flaccid; knock into the next band; Fluid Navigation save or be swept by the nearest current |
| Thermic | the target's zone is a Hazard for 1 Cycle; Catabolic; cannot be healed next Cycle |
| Voltaic | Locked or Overclocked; interrupt a Sustained Reaction; Marked |
| Genetic | Hijacked; steal one Vial or held Specimen; Sequence save or lose a class feature for 2 Cycles |

On a hit the attacker picks one consequence from the type's list. A creature's record prints which one it always picks, so the Engine applies it and the Director never sets a condition by hand. *(proposed: Benches: the Director called set_condition itself after creature hits (Brittle, Jostled).)*

The book writes both "Thermal" (4.8, 5.3) and "Thermic" (4.9) for the same type. One id is needed. *(proposed: use "Thermic")*

## 10. States of a body

| State | May | May not | Note | Core |
| :-- | :-- | :-- | :-- | :-- |
| Up | act; react; roll; harvest; speak; be healed |  |  | 5.1 |
| Dormant (0 MI) *(proposed)* | speak one short signal; make a save at Baseline 1 when an effect forces one; be moved or carried; be stabilised | take any action; react; harvest; be asked for a throw of its own; be healed above 0 except by stabilisation | At the start of each of its turns: lose 1 MI (already 0) and mark 1 Countdown box. Whether a Dormant organism can speak is not stated: proposed as one short signal. | 5.4 |
| Stabilised | everything Up may |  | Back above 0 MI. Countdown boxes stay marked until a Dormant Cycle. | 5.5 |
| Total Lysis | be harvested at full value | anything else |  | 5.6 |

**Stabilise (Core 5.4):** a synthesise action at Contact; RTC + Synthesis against 12 + target Level; on a success target MI = Overflow + 4; close 1 Countdown box.

**Lysis Countdown (Core 5.5):** boxes = VSC + ceil(Hull / 2) + 2. Marks: 1 per turn while Dormant; 1 on a Breach; 2 on Autophagic Collapse; +1 per Cycle in Autophagy; 2 on breaking an Oath. When full: Total Lysis.

## 11. Stress (Core 5.8)

| Stress | Dice | ATP cost | Note |
| :-- | :-- | :-- | :-- |
| 3 | -1 |  |  |
| 5 | -2 |  | no Overclocked benefit |
| 6 | -3 | 1 |  |
| 7 |  |  | next failed roll: roll on the Cascade table |
| 8 |  |  | Autophagic Collapse: mark 2 Countdown boxes, Stress drops to 5 |

**Clearing:** -1 at the end of a Cycle with no ATP spent and no damage taken; -2 for a Vent; all at a Reconstitution; all at a Chemotactic Rite.

**Cascade (d6):** 1 Spill: lose 1d6 ATP; next Burst this scene +2 ATP. 2 Seizure: lose all PP this Cycle; no Reserve until next turn. 3 Misfire: the failed action resolves at half value against you or the nearest ally. 4 Flare: Marked until the end of the next Cycle; no Concealment this scene. 5 Tear: 1d6 damage ignoring soak, and Leaking. 6 Runaway Inhibition: mark 1 more Stress.

## 12. Recovery

| Rest | Time | Does |
| :-- | :-- | :-- |
| vent | 1 PP, 2 ATP | Stress -2 |
| reconstitution | 1 Fugue Interval | Full ATP; Stress 0; heal VSC + Hull MI; clears Catabolic and Bloom |
| dormant-cycle | 6 hours, secured | Full MI; clear Countdown boxes; refresh once-per-encounter features |

## 13. The Pulse War as states (Core 4.1, 4.2, 4.14)

| State | What happens | Next |
| :-- | :-- | :-- |
| detection | Each side: OSM + Chemoreception against the other's DFF + Concealment. Win by 4+: First Volley (that side acts once, no reactions). Tie: both startled, skip a Cycle. | frequency |
| frequency | Each body rolls d6 + DFF + Pulse Discipline once for the encounter. Highest first; ties: more unspent PP, higher OSM, players. | cycle-start |
| cycle-start | Timed conditions tick. Hazard budget for the Cycle opens. | turn |
| turn | The actor receives PP = 2 + DFF + modifiers, then spends them on actions until it ends its turn. | turn; cycle-end |
| cycle-end | Unspent PP and Reserves are lost. Stress -1 for bodies that spent no ATP and took no damage. Check the end conditions. | cycle-start; ended |
| ended | Pulse Points stop existing. Pending rolls from the fight are cancelled. |  |

**The war may end when:**
- every creature at the site is destroyed, stood down (yielded, fled, has what it wanted) or was never hostile
- every organism is Dormant, yielded or at Loose and unobserved for a Cycle

The Engine ends the war by itself the moment an end condition is true. Nobody calls it. *(proposed: Benches: end_pulse_war was called early eight times.)*

## 14. Chase (Core 4.14) *(proposed reading)*

1. Each Cycle, each side makes one Fluid Navigation roll at the terrain's Threshold.
2. The lower result (or the only failure) shifts one band in the pursuer's favour; if both fail, no change.
3. The pursued escape at Loose + 2 bands. The pursuers win at Contact.
4. After 6 Cycles in terrain the pursued knows better, the pursued escape.

Gaps in the book:
- Who rolls for a group: the best pool with +1 per helper (as 1.7), or everyone? Proposed: each organism rolls for itself, and a carried Dormant body gives its carrier -1 die.
- What happens to a Dormant, uncarried body: proposed, it is left behind and the site record says what that means.
- The book says "the party escapes at Contact (grapple)", which reads as the pursuers catching up; proposed reading used above.

## 15. Hazards (Core 7.4)

**Numbers:** damage 4 + 2 x tier per exposure; save 8 + 2 x tier.

**A hazard record has these fields:** id; name; trigger (an event id, never a sentence); clockGate {clock, at} or null; amount; type; targets: one | zone | site; save {pool, threshold, onSuccess: none | half} or null; conditions [ids]; bandShift; frequency: per-cycle | per-scene | once; afterFiring (what the scene becomes: e.g. start a chase); counter (what a player can do about it); exploit (how it can be turned).

A hazard fires at most once per Cycle inside a Pulse War and once per scene outside one, unless its record says "once". It never fires as the price of a successful roll. *(house)*

| Hazard | Trigger | Effect | Note |
| :-- | :-- | :-- | :-- |
| pore-charge | pressure plate | 8 + 2 x tier Osmotic, push 1 band | Detect: OSM at Standard. |
| enzyme-mine | contact | Lytic; graft -1 soak |  |
| cavitation-snap | sudden pressure change | Kinetic; Jostled |  |
| osmotic-sluice | a membrane gate opens | everyone in the sluice: DFF save or thrown 2 bands and Osmotic damage |  |
| collapse | structure failure | Kinetic; Sequestered (escape: VSC at 14) |  |
| necrotic-wind | current from a dead zone | no regeneration; Catabolic |  |

## 16. Harvest (Core 2.4, 8.3)

| Who | Cost | Pool | Threshold |
| :-- | :-- | :-- | :-- |
| one organism that is Up, at Contact with the body or the site feature | a Synthesise action in a fight, or 10 minutes outside one; 1 Bulk | OSM or RTC (the harvester chooses), + Synthesis | tier x 4 + 8, or the record's printed number |

- **No roll:** outside a fight and unhurried: Homeostatic Baseline applies.
- **Success:** the record's Specimens by grade. **Failure:** the sample is ruined: Substrate instead (1 Common = 5 S).
- **Sharing:** Specimens go round a remembered picking order, one offer per item; each player takes or passes. *(house)*
- **Grades:** C Common Tissue, G Greater Organ, P Pristine Sequence, T Terminal Codon.

## 17. Oaths (Core 11.4) *(proposed steps)*

1. A player states the promise in their own words and to whom it is owed.
2. A witness with OSM 3+ must be present; the site record lists who can witness there.
3. Encoding takes a Chemotactic Rite: 1 Fugue Interval and 10 Substrate. The swearer marks Oath boxes = AFF.
4. The Engine files the Oath: words, owed to, witness, site.
5. Kept at a real cost: +1 Cohesion that scene.
6. Broken: mark 2 Countdown boxes, the witness faction drops one rung, roll Legacy Scarring.

Gaps:
- The First Carve lets a promise pay a toll on the spot, with no hour-long Rite. The Vector record should say when a quick oath is allowed and what it costs.
- A promise "owed to nobody" cannot be filed: the step-2 witness is required.

## 18. Table words *(proposed)*

What the Director says instead of the rules term. "Never" means the term or its number is not spoken to players in any form.

| Rules term | Say instead | Never aloud | Note |
| :-- | :-- | :-- | :-- |
| Reagent Pool, dice counts | how sure the hand is | never |  |
| Activation Threshold, Membrane Threshold | how hard it is; how hard it is to land a blow | never |  |
| Overflow | how cleanly it went | never |  |
| Inhibitor | a hitch, a tremor | allowed |  |
| Runaway Catalysis | the reaction feeds itself; it goes better than anyone meant | never |  |
| Pulse Points | breath, what you have left this moment | allowed | A player may be told how many of their own they have. |
| Reserve / Reactive Osmosis | holding something back | allowed |  |
| Membrane Integrity (a creature's) | its wound-ladder phrase | never |  |
| Membrane Integrity (a player's own) | the number is theirs to hear | allowed |  |
| Soak, BD, Effect Value | how much the armour took; how heavy the blow | never |  |
| Metabolic Stress | the strain, the shake in the hands | allowed |  |
| Autophagic Collapse | the body turns on itself | never |  |
| Lysis Countdown | how long the body can hold | allowed |  |
| Dormant | gone dark, drifting | allowed |  |
| Lodged, Heavy, Braced (properties) | the blade stays in; it is slow to swing; it has set itself | never |  |
| Minion, Standard, Elite, Boss; tier; BSP | nothing: describe the creature | never |  |
| Encounter codes (E1-E5), section numbers, "the page" | nothing | never |  |
| Deadly (encounter rating) | "This is Deadly" before it starts, in those words | allowed |  |
| Clocks (CARCASS, TOLL, HUNGER) | by name and by segment: players see them | allowed |  |
| Bands (Contact, Near, Mid, Far, Loose) | by name | allowed |  |
| Cycle | by name, or "a moment" | allowed |  |

## 19. Rulings already made

| Id | Ruling | Date |
| :-- | :-- | :-- |
| pool-min-1 | A pool never falls below one die. | 12 Nov 2026 |
| brace-after-soak | Brace halves after soak, rounds down, never below 1. |  |
| creature-numbers | A creature's numbers are never shown or spoken to players. | 13 Nov 2026 |
| hazard-budget | A hazard fires once per Cycle in a Pulse War, once per scene outside one. |  |
| hazard-not-on-success | A hazard never fires as the cost of a successful roll. |  |
| picking-order | Harvested Specimens are offered round a remembered picking order. |  |

## 20. Open questions for Roly

1. Thermal or Thermic: which is the one name for the type?
2. Can a Dormant organism speak? (Proposed: one short signal.)
3. Chase: who rolls for a group, and what happens to a Dormant body nobody carries?
4. Quick oaths: may a Vector let a promise be filed without the hour-long Rite, and at what cost?
5. On a failed roll with no printed outcome, is the default "turn" (it fails and the scene moves)?
6. Should the Engine end a Pulse War by itself when an end condition is met?
7. Should each creature print its fixed Signature Consequence, so no condition is ever set by hand?
8. The "advantage" modifier: is tying it to a printed tag acceptable, or should the Director keep free use of +1?
9. Two band shifts at once: do they add? (Proposed: yes.)
10. Do conditions stack with themselves? (Proposed: no; a timed one restarts.)
