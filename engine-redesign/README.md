# Engine redesign notes: what the books could give the Engine

Written 15 November 2026, after seven model benches of The First Carve. This folder is for investigation only. Nothing in `director/` or in the books was changed to write it.

## The question

Looking at the errors the Engine and the Director have needed fixes for, what could the Core Rulebook, the Player's Atlas, the Lytic Bestiary (with the Director's Codex) and the Vector (campaign module) format do differently so the game runs with fewer Engine issues and less model time?

## The short answer

Almost every fix so far traces to one cause: **a rule or a fact lives in the books as a sentence, and either the Engine has to guess its meaning with a pattern match or the model has to remember it.** Where the books give a table, the Engine has been reliable (the odds gate reproduces every cell). Where they give prose, the errors cluster.

So the redesign aim is: every fact the Engine must enforce is printed once as data, every judgement left to the Director is printed as a closed list of choices, and every rules word has a printed way to say it at the table.

## Where the errors came from (evidence from the benches)

| # | Kind of error | What happened | Root cause in the books |
|---|---|---|---|
| 1 | Hazard fired wrongly | Render Charge called once per organism, then again every Cycle (four refusals, then a wipe). Toll-Vent pocket called once per body. Hazards fired after a successful roll or before their Clock. | A hazard is one sentence ("on a Clock, fires at TOLL 5. 20 Kinetic, 2-band shift, the carcass ends"). `hazardSpec` in `brain/tools.js` reads it with pattern matches for trigger, amount, type, area, Clock gate, conditions and band shift. Each bench found a phrasing the patterns missed. |
| 2 | Creature numbers said aloud | "Five MI of what's left", "nineteen of twenty-two", "four points of damage short of nothing", dice and Thresholds read out. | Creature blocks give numbers but no printed words for how hurt a creature looks. The model fills the gap with the numbers it was given. The leak checks are pattern matches too, and have had false alarms ("TOLL reads five of five", a player's own MI). |
| 3 | Turn-order slips | Creature moved out of turn, or with 0 Pulse Points; a player id passed to `end_creature_turn`; `end_pulse_war` called with a creature still up. | The model runs every creature turn by hand, one tool call per step, from a prose "tactics" line. Nothing printed says what a creature does first, second, or when it stops. |
| 4 | Special actions costed by the model | `creature_special` is sent with a name and a cost the model types ("Render", cost 2; "Read", cost 0; "Preempt", cost 3). | Specials are sentences ("Special — Shear Call (3 PP): ..."). Cost, target, save and effect are inside the sentence. |
| 5 | Modifiers and Thresholds invented | Roll requests carried model-made modifiers ("Acid halo interference −1", "Stress 6: −3", "Brittle membrane −1") and Thresholds chosen on the spot (8, 12, 14, 16). | The books do not print a closed list of situational modifiers, and sites do not print Thresholds for the actions their own text invites. Standing penalties (Stress, conditions) should never be the model's to add. |
| 6 | Clocks moved on judgement | HUNGER moved because bodies were left uncut; TOLL moved for refusing a toll; "unpaid Clock" flags when narration said a Clock moved. | Clock advances are described in the Vector's prose, not listed as triggers per site. |
| 7 | Things that do not exist | A pump that could be opened, a harpoon gun to buy, a second route. | Sites describe scenery in prose; nothing lists what can be acted on and says "nothing else here does anything". |
| 8 | Moving between sites | `change_site` to the current site; scripts playing in the wrong room because the Director asked a question instead of moving. | Exits are sentences ("Out: the exit shaft up to the pump"), not links with conditions. |
| 9 | Oaths | An answer to "what do you promise?" was not filed; a promise owed to nobody; a creature brought in unasked after an oath. | The Oath procedure is prose. Who may witness at each site, and what an Oath buys there, is not data. |
| 10 | Harvest | Harvest spread across organisms; a Dormant organism asked to cut; the site named as a creature; yields paid by the Director's award. | Yield is a string ("C5 / G2 / P1 · Codon 7 · BSP 2"). Who may cut, when, and what a site itself yields were added to the scenario file by hand (`harvestPays`). |
| 11 | Rules words aloud | "Runaway Catalysis", "Lodged", "Elite", "Autophagic Collapse", "E5", "Pulse Points" spoken to the table. | No printed table-word for each rules term. |
| 12 | Dormant and ended states | A Dormant organism was asked for a throw in the final chase; the chase itself was improvised from one line ("Not survived: raced"). | Chase rules and what a Dormant body can and cannot do are prose procedures. |
| 13 | Speed | About 15,000 tokens go in on every call; a Director turn is about two calls and 20 s; one turn in four is rewritten for length or a missing question. Many turns only restate the scene and hand over ("X, five Pulse Points, what do you do?"). | The model is asked to do bookkeeping beats the Engine could write itself, and it carries the whole rule text on every call. |

## Design principles for the redesign

1. **Print once as data.** Each hazard, special, condition, exit, yield and Clock trigger is a small record with named fields. The prose stays for the reader, but the Engine never reads prose.
2. **Closed lists for judgement.** Where the Director must choose (a Threshold, a modifier, a creature's reaction), the book gives the list. An answer outside the list cannot be sent.
3. **The Engine owns standing numbers.** Stress, conditions, soak, Pulse Points, hazard budgets and Clock gates are applied by the Engine. The model is never asked to add or remember them.
4. **Every creature has a script and a look.** A printed priority list lets the Engine play simple creatures without the model. A printed five-step wound ladder gives the words for how hurt it looks, so no number is ever needed.
5. **Every rules term has a table word.** One line per term: what the Director may say aloud instead.
6. **Every site lists what can be done there.** Listed things have outcomes; unlisted things do nothing.
7. **Small briefings.** The model is given only the current site, the current phase's tools and the words it needs, not the rulebook.

## What is in this folder

| File | Use |
|---|---|
| `01-core-rulebook-prompt.md` | Prompt to rework the Core Rulebook into Engine-ready rules. |
| `02-players-atlas-prompt.md` | Prompt for the Player's Atlas: actions, kit, pregenerated Hands. |
| `03-bestiary-and-codex-prompt.md` | Prompt for the Lytic Bestiary and Director's Codex: creature records, scripts, wound ladders. |
| `04-vector-format-prompt.md` | Prompt for the campaign module format, using The First Carve as the test case. |
| `05-engine-redesign-prompt.md` | Prompt for the Engine and Director rebuild that consumes the four outputs above. |
| `books/` | A first pass at the outputs of prompts 1 to 4: Engine-ready editions of the Core, the Player's Atlas, the Bestiary and the Vector format with The First Carve. Start at `books/README.md`. |

Each prompt stands alone: paste it into a fresh session with the named book attached. Run 1 to 4 in any order; run 5 last.

## Limits of this note

- The evidence is seven benches of one module with one local model (Qwen `iq3_s`, thinking low). A stronger model would make fewer of the slips in rows 2, 3 and 11, but rows 1, 4, 5, 6, 8 and 10 are format problems for any model.
- The redesign has not been built or tested. The expected gains (fewer refusals, fewer calls per turn) are a design argument, not a measurement.
- The books were not re-read in full for this note; the format examples come from `director/data/first-carve.js` and `director/data/bestiary.json`.
