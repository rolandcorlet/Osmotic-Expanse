# Engine v2 design

Status: working prototype, 24 tests. Separate from `director/` and from the books. Nothing here is wired into the app.

## Thesis
The Engine owns every rule and every number. The model is handed a small briefing and a list of legal moves, and it can only pick one and narrate. An illegal move cannot be expressed.

## Layout
- `src/data.mjs`: loads the four books, parses script and effect tokens, validates every cross-reference.
- `src/rules.mjs`: pools, thresholds, Inhibitors, Runaway, wound-ladder words.
- `src/world.mjs`: state, Clocks and triggers, hazards, set pieces, interactables, awards.
- `src/fight.mjs`: Pulse War order, Cycles, creature runner (runs Bestiary scripts with no model call), Reserve reactions.
- `src/moves.mjs`: `legalMoves(g)` and `play(g, id)`. Unknown ids come back with the legal list and change nothing.
- `src/lines.mjs`: routine lines and the single closing question, written by the Engine.
- `src/director.mjs`: briefing, reply schema (enum of legal ids), `applyReply`.
- `tools/autoplay.mjs`: scripted players plus a Director that picks only legal moves.

## Director contract
Per turn the model gets `PHASE, SITE, HERE, WHO, NOTHING ELSE, CLOCKS, CREW, LEGAL MOVES, JUST NOW` (under 4,000 tokens with instructions; v1 sends about 16,000). It returns `{ narration, choose }`. The Engine rejects a `choose` not in the enum, applies the move, and appends the closing question.

## Errors made impossible by construction
Refused calls, wrong seat, buried body, unpaid damage or Clocks, reversed rolls, creature numbers leaking, extra Collapses, machinery spoken, second closing question. The Engine writes the rules text and the question, so none of these can come from the model. What remains for the model: narration quality and style.

## Speed budget
v1 measured about 10 s and 16k tokens in per call. At under 4k in, expect roughly a third of that per call. Creature turns cost no calls.

## Not done yet
Runaway Effect Value, Bursts and Vials, conditions beyond dice mods, creature Deflect/Brace beyond the Reserve flow, the Gut Stone Deadly fight, and the live-model wiring. See `GAPS.md` for data the books must print.

## Build plan
1. Run the whole module under legal-move fuzz (done, 40 seeds).
2. Bench the briefing with the local model on one site.
3. Wire `applyReply` behind a flag in the app, beside v1.
4. Gate: a full five-stage run with zero hard rescues.
