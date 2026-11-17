# Engine-ready editions of the books (draft 0.1, 15 November 2026)

These are the outputs of prompts 1 to 4 in the folder above, written as a first pass. They sit beside the published books and the working `director/`; nothing here is loaded by the game. The builders only read from the books and from `director/`.

| Folder | Read this | Data | State |
|---|---|---|---|
| `core/` | `CORE-RULEBOOK-engine-ready.md` | `core-rules.json` | Chapters I, IV, V, hazards, harvest and Oaths converted: timing, the closed modifier list, actions, conditions as numbers, states of a body, the Pulse War and chase as steps, table words, 10 open questions. Bursts, gear, colony life, dialogue and legacy are not converted. |
| `players/` | `PLAYERS-ATLAS-engine-ready.md` | `players.json` | Formulas, the action list, 20 Apparatus, 23 properties, 20 Grafts, 20 Vials, 6 Lineages, 24 Phenotype headers, 4 Hands checked against the formulas. The Signature Mechanics, 96 Stage features and the Adaptations are still the book's sentences; the document counts them. |
| `bestiary/` | `LYTIC-BESTIARY-engine-ready.md` | `bestiary.json` | All 68 creatures have numbers, harvest and a wound ladder. The 10 creatures of The First Carve are converted in full, with turn scripts the builder validates. The other 58 carry Order defaults. |
| `vectors/` | `VECTOR-FORMAT.md`, `THE-FIRST-CARVE-engine-ready.md` | `vector-schema.json`, `first-carve.json` | The format, and The First Carve in it: 5 sites, 14 Clock triggers, hazards as records, set pieces, endings, a generated Director briefing per site, a validator, and a list of 25 gaps. The other three Vectors are not converted. |
| `build/` | | | The builders. Each holds one book's data and writes both the JSON and the readable edition, so the two cannot drift apart. |

## Rebuilding

```
cd engine-redesign/books/build
node build-core.mjs && node build-players.mjs && node build-bestiary.mjs && node build-vector.mjs
node check.mjs
```

`check.mjs` compares the new data with the working Engine's own tables (ladder, conditions, bands, action costs, Stress, formulas, Apparatus, all 68 creatures' numbers, site creature lists). All eleven comparisons match as of this draft.

## How to read the markings

- *(house)*: a ruling already made in play and coded in `director/`.
- *(proposed)* or a **gap**: the book is silent or unclear. The value shown is a proposal, not a decision. Each edition ends with its questions; The First Carve ends with its gap list.

## What the validator found in The First Carve

1. The Toll-Vent prints 6 BSP, but 2 Gnaw Swarms and 1 Fold Sentinel count to 4 by the Bestiary's own costs. The other four sites match.
2. The Gut Stone's play note names a Lattice Guardian that is not in its creature list or its 12 BSP, and the Guardian has no full record yet.

## Not done

- Nothing here has been run by an Engine. The turn scripts are checked for vocabulary, not for good play.
- Wound ladders, table words, morale triggers and every "proposed" value are mine and untested at a table.
- The Director's Codex was read only for the encounter budgets.
