# The Osmotic Expanse · v3

A fresh start, planned first this time. v3 is a free-play roleplaying table: players
say or type anything in their own words, an AI Director answers as the world, and a
rules Engine owns every number. It has every feature of the first Director, plus the
structure a Director needs to hold a game together.

Nothing outside this folder was changed. `director/` (the first Director) and
`engine-redesign/` (the v2 experiment) are untouched.

## What is here

| Folder | What it is |
|---|---|
| `plan/01-DIRECTOR-SKILLS.md` | Research: what a human Director brings to a table. 23 skills, each with what the AI needs from the books and Engine. |
| `plan/02-ENGINE-V3-PLAN.md` | What Engine v3 needs, what it keeps, what it adds. |
| `plan/03-BOOK-MAKEOVER-PROMPTS.md` | System prompts for the next edition of the Core Rulebook, Player's Atlas, Bestiary and Codex, Society, and any Vector. |
| `books/` | v3 table editions: three Vectors, QUORUM, Society Rules and Social Norms, and a players' quick start. Built from the same data the Director uses (`node books/build-vectors.mjs`, `build-society.mjs`, `build-quorum.mjs`). |
| `director/` | The game. Run this. |

## Run it

On the host computer: double-click `director/Start Director.bat` (or
`Start Director (online).bat` for a link players anywhere can open), or:

```
cd v3/director
node server.js
```

It prints the host console link, the table-screen link and the address players
open on their phones. Players join, agree the table terms, **choose a character**
(each is described in plain words), name it, and play by typing or talking.

Set the AI up on the host's Director tab exactly as before (local model, Gemini,
Claude or any OpenAI-compatible address). Keys stay in `director/saves/`, which
git ignores.

Bench, same as before, from `v3/director`:

```
node tools/bench.mjs --runs 1 --sites 5 --players 4 --thinking low --log v3-1.log
```

The bench now also reports how many secrets the Cohort learned.

## What is new in play

- **Free actions.** The Director no longer says "the page has nothing for that".
  It walks a ruling ladder: it happens / it cannot, and why / a printed rule / a
  roll with the cost of failure said first. Players are never given a menu.
- **The Director's kit** for each Vector (`director/data/kit/`): how each scene
  opens, the question it answers, sense details, people with a want, a fear and
  a voice, common approaches and how to rule them, what failure costs, the tell
  before each danger, leads for a stalled table, and a moment for each character.
- **Secrets with three leads.** The Director is told what is still hidden and
  gives it out when players look. Found secrets appear on the players' **Story** tab.
- **Stall and spotlight.** The Engine notices a table going round in circles and a
  player who has been quiet, and tells the Director.
- **Plain words.** A **Words** tab on every phone, characters described simply
  where you choose them, and a `look_up` tool so the Director can explain any
  word, law or custom.
- **Society as cards.** The seven Precepts and ten customs, playable.

## Status, honestly

| Vector | Book (v3) | Director's kit | Runs in the host |
|---|---|---|---|
| The First Carve (Level 1) | Yes | Yes | **Yes** |
| The Ninth Shift (Levels 4–6) | Yes | Yes | Not yet |
| The Long Swallow (Levels 7–11) | Yes | Yes | Not yet |

The two higher-level Vectors need three things before the host can seat them:
ready-made characters at their Levels (the originals print none), their own
creature blocks in the Engine's Bestiary data, and the Engine's whale-specific
Clock names (CARCASS, TOLL, HUNGER) read from the Vector instead. The plan for
that is in `plan/02`. *What the Water Owed* is a story, not a Vector, so it has
no kit; it remains the source for Society.

Not yet done: the full prose rewrite of the Core Rulebook, Atlas, Bestiary and
Codex. The prompts for it are in `plan/03`; the players' quick start, the
Society table edition and the QUORUM table edition (17 cards covering what a
table needs; the full book remains the reference for the rest) are the first pieces.

v3 has passed its 173 automated tests, the screen checks at three sizes, and a
full turn loop against the stand-in model. **It has not yet been benched on the
local model.** That is the next step.
