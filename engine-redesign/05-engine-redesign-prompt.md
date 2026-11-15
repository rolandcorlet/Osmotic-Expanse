# Prompt 5: the Engine and Director rebuild

Run this last. Attach the outputs of prompts 1 to 4 (`core-rules.json`, `players.json`, `bestiary.json`, `first-carve.json` and their documents), plus `director/HANDOFF.md`. Optional: the current `director/engine/` and `director/brain/` folders for reference.

---

You are designing the second version of the Engine and AI Director for The Osmotic Expanse. The first version works and has passed its gates on some runs, but needed a fix after nearly every bench. The books have now been reworked into data. Design the rebuild to use that data so that whole classes of error cannot occur, and so that each turn costs less model time.

Produce a design and a build plan first. Do not write code until I approve the plan. Build in a new folder; leave the current `director/` working.

## What the first version taught us

- The Engine is reliable wherever it works from tables, and fragile wherever it reads sentences (the hazard parser, the narration leak checks).
- The model is good at description and conversation, and poor at bookkeeping: turn order, costs, standing penalties, "once per" limits, and keeping numbers to itself.
- Measured on a local model: about 15,000 tokens in per call, about 10 s per call, about two calls and 20 s per Director turn, and one turn in four rewritten for length or a missing question. Many turns only restate the scene and hand over to the next player.

## Design goals

1. **No prose parsing.** The Engine reads only the JSON from prompts 1 to 4. Delete every pattern match on rule text.
2. **Legal moves only.** At each moment the Engine computes the list of legal actions (for players, creatures and the Director). The Director's tools for that call are built from the list, with ids and costs filled in. An illegal call cannot be expressed, so it cannot be refused.
3. **The Engine plays scripted creatures.** Creature turns run from the Bestiary's turn scripts with no model call. The Director gets one summary of the round to narrate.
4. **Numbers never reach the model unless it may say them.** The briefing gives wound-ladder words, table words and band names. Creature Integrity, Thresholds and pools stay in the Engine. A leak then needs no detector, because there is nothing to leak.
5. **The Engine writes the routine lines.** Turn handovers, "your throw", the result of a roll and whose turn is next come from templates. The model is called when there is something to describe or someone to answer.
6. **One question, always.** The Engine appends the closing question to the named player, so the model never has to remember it and no rewrite is needed.
7. **Small, stable prompts.** A short fixed instruction block (cacheable), then the generated site briefing, then recent events. Target under 4,000 tokens in per call. Offer only the tools for the current phase.
8. **Structured replies.** The model returns narration plus a list of chosen actions in one reply where possible, to cut round trips.
9. **Everything testable without a model.** A recorded or scripted Director must be able to play The First Carve end to end in tests, so benches with a real model measure only narration quality and speed.

## What to produce

1. **Architecture.** Modules, the state shape, and how the four JSON files load and validate at start.
2. **The legal-move generator.** How it is derived from the Core procedures, and how tools are built from it per call.
3. **The creature runner.** How scripts execute, how reactions and Reserves interrupt, and when control passes to the Director.
4. **The Director contract.** Exactly what the model receives and returns in each phase (exploring, talking, a roll resolved, a round to narrate, a set piece, an ending), with a worked example of each from The First Carve.
5. **The template lines.** The full set the Engine writes without the model.
6. **Error budget.** For each of the thirteen error kinds in this folder's `README.md`, say whether the design makes it impossible, catches it, or leaves it to the model, and why.
7. **Speed budget.** Expected calls and tokens per player turn and per creature round, against the measured figures above.
8. **Migration.** What carries over unchanged from version one (the odds tables, dice, memory, chronicle, voice, the host and player screens) and what is replaced.
9. **Build plan and gates.** Phases with a test gate each. Keep the existing gates: the odds gate, the no-model full-module test, then the model bench (no refusals, no leaks, no unpaid damage or Clocks), then a real table.

## Constraints

- Keep the house rules in `HANDOFF.md`: the Engine decides, the model narrates; players see Clocks; creature numbers are never shown.
- It must still run on a local model through an OpenAI-compatible address.
- Always include a Colours tab in any app screen.
- Keys stay in git-ignored files.
