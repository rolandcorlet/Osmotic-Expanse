# The Osmotic Expanse · v3

A fresh start, planned first this time. v3 is a free-play roleplaying table: players
say or type anything in their own words, an AI Director answers as the world, and a
rules Engine owns every number. It has every feature of the first Director, plus the
structure a Director needs to hold a game together.

The first Director and the v2 experiment are kept in `archive/` at the top of the
repo; nothing here depends on them.

## What is here

| Folder | What it is |
|---|---|
| `plan/01-DIRECTOR-SKILLS.md` | Research: what a human Director brings to a table. 23 skills, each with what the AI needs from the books and Engine. |
| `plan/02-ENGINE-V3-PLAN.md` | What Engine v3 needs, what it keeps, what it adds. |
| `plan/03-BOOK-MAKEOVER-PROMPTS.md` | System prompts for the next edition of the Core Rulebook, Player's Atlas, Bestiary and Codex, Society, and any Vector. |
| `books/` | v3 table editions: the Core Rulebook, the Lytic Bestiary, three Vectors, QUORUM, Society Rules and Social Norms, and a players' quick start. Built from the same data the Director uses (`node books/build-vectors.mjs`, `build-society.mjs`, `build-quorum.mjs`, `build-core.mjs`). |
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
- **Build your own organism** (17 Nov). A phone builder, one decision per screen: seat, Lineage,
  Phenotype, Baselines, Pathways, Growth (above Level 1), kit with Vials, name. Suggest buttons and a
  starter kit for every step. The server rebuilds every organism from the choices with the Players
  Assistant's own maths (`director/data/chargen/`); the host can switch building off at session zero.
- **Growth in play** (17 Nov). Codon past the next threshold opens a Growth at the next rest; the
  player chooses on their phone (two choices at a Stage). Checks: `tools/check_gen.py`, `tools/check_grow.py`.
- **A campaign** (17 Nov). A new game in the next Vector brings each organism into its seat, healed,
  with catch-up Growths if it is below the printed Level (`tools/check_carry.py`). COLONY and CORE stand
  in every game and travel with ORDER.
- **The Clocks bite** (17 Nov). What each stage prints is paid by the Engine: SHIFT's cramped pumps and
  THE SILENCE, BADGE dice against the Hegemony and the Court, GOODWILL as a track, IMMUNE's Mark and cap,
  Tolerance Thresholds, the CHURN fill and a jammed pump, the Weep's wash. Routes priced at a Beat pay
  it, and a day ends by itself after about ten Director turns.
- **The Director's voice** is a British man by default (Kokoro `bm_fable`, or each screen's own).

## House rules added in v3

Every ruling made while v3 was built is listed in [`RULINGS.md`](RULINGS.md) (single source:
`director/data/kit/rulings.js`) and written into the original books, the v3 table editions, both
Assistants and the Word copies. The short list:


- **Rides It Out** (16 Nov 2026): every Flagellan marks Stress from a rolled 1 only three times in four. Written into the Player's Atlas and The First Carve (the `.md` originals), the v3 Core Rulebook, quick start, picture book and the Engine.
- **Loud fights** cost TOLL half the time in The First Carve.
- **People with no stat block** are struck with one roll, never a Pulse War.
- **Total Lysis** ends an organism when its Countdown fills.
- **Protean Folding** is rolled with RTC (17 Nov).

## Status, honestly

| Vector | Book (v3) | Director's kit | Runs in the host |
|---|---|---|---|
| The First Carve (Level 1) | Yes | Yes | **Yes** |
| The Ninth Shift (Levels 4–6) | Yes | Yes | **Yes** |
| The Long Swallow (Levels 7–11) | Yes | Yes | **Yes** |

All three Vectors now run in the host. Each brings its own ready-made characters at its
Levels (`director/data/levelled-hands.js`), its own creature blocks
(`director/data/vector-blocks.js`) and its own Clocks, which the Engine reads from the
Vector. The Ninth Shift's and the Long Swallow's day counter (SHIFT, LICENCE) moves when a day
ends: the Director ends it, a route priced at a Beat ends it, or the Engine does after about ten
turns. Their Clock stages are paid by the Engine (17 Nov); what is still the Director's to play is
listed in RULINGS.md and the briefing's "In force now" section. *What the Water Owed* is a story, not a Vector, so it has
no kit; it remains the source for Society.

The Core Rulebook and the Lytic Bestiary now have v3 table editions (18 rule
cards; all 68 creatures re-laid-out with an opening for each Order). The Player's Atlas (53 cards: the eight steps, six Lineages, 24 Phenotypes, advancement, builds) and the Director's Codex (84 sections, every table verbatim) now have v3 table editions too, generated from the printed books by `tools/gen-atlas.mjs` and `tools/gen-codex.mjs` so no number can drift, and the Director finds them with `look_up`. Not yet
done: the full prose rewrite of
every book. The prompts for it are in `plan/03`; the players' quick start, the
Society table edition and the QUORUM table edition (17 cards covering what a
table needs; the full book remains the reference for the rest) are the first pieces.

v3 passes 227 automated tests and the screen checks at three sizes. On the local model
(Qwen3.8-Flash-Next iq3_s, thinking low) all three Vectors are benched end to end: The Ninth Shift
(bench 7) and The Long Swallow (bench 5) reach every room and every secret, with the gate failing
only on an occasional refused invention, which is the Engine doing its job.
