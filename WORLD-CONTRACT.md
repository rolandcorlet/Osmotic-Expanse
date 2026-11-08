# Pre-World × The Osmotic Expanse — authoring contract

This is the one document every content author writes against. It says **where content goes, what shape a
row must be, which ids the running code asks for, and what counts as honest provenance**. Read it fully
before writing a single row.

## 0. What we are doing

`preworld/` is the Phase 6 DM assistant with all reference text removed: the 26 payload files in
`src/data/` keep their **container shapes** and a `slots[]` checklist (170 ids the running code asks for by
name), and hold **no text**. The four books in `books/parts/` (assembled into
`The Osmotic Expanse - CORE RULEBOOK.md`, `- PLAYER'S ATLAS.md`, `- LYTIC BESTIARY.md`,
`- DIRECTOR'S CODEX.md`) are the replacement text. Our job: transcribe the books into the payload so every
tab works for **this** world, and ship the built single-file app.

`books/DESIGN-BIBLE.md` is **canonical for numbers and names** when books disagree. Check it before
inventing a number.

## 1. Authoring layout

Author into **`world/<payload-file>.json`** — containers only:

```json
{
  "meta":   { "source": "CORE Ch. IV", "evidence": "…how you read it…", "gaps": [ … ] },
  "rules":  { "<id>": { …row… } },        // object keyed by id
  "scalars":{ "<id>": { …row… } },
  "tables": [ { "id": "…", "die": "d100", "entries": [ {"min":1,"max":5,"text":"…"} ] } ],
  "blocks": [ … ], "entries": [ … ], "delegated": [ … ], "patterns": [ … ], "phrases": [ … ]
}
```

`node build/make-world-payload.mjs` merges each slice into `src/data/<file>.json` (skeleton `meta` +
`slots[]` are kept and marked filled), stamps provenance you forgot, refuses malformed rows, and prints the
coverage report. Run it after every edit; it never writes when a shape problem exists.
`world/library.json` bakes into the block-library socket `src/data/monsters_srd.json`.

**Never edit `src/data/*.json` by hand** — the bake owns those files. **Never edit `src/*.js` unless your
task says so** (the code sockets are the lead's).

## 2. Row shapes (what the engines actually read)

Lookups are **file-agnostic**: `findRule(id)`, `findScalar(id)`, `findTable(id)`, `cellsOf(id)` (→
`scalar.cells`), `paramsOf(id)` (→ `rule.params`) scan every file for the id. So the id is the contract,
not the file.

* **rule** — `{ text, cite, params:{…}, confidence, license, gaps:[] }`. A number the code computes on
  lives in `params`, not in prose. `params.<k>: null` means "the book defers it"; omitting a key the code
  reads is a bug.
* **scalar** — `{ text, cells:[…], cite, confidence, license, gaps:[] }`. `cells` is the table-like payload
  (array of objects or strings). `values` for ladders, `entries` for persona lists.
* **table** — `{ id, label, die:"d100", entries:[{min,max,text}], cite, … }`. `die` must be `NdN`; the Loot
  tab prints `min–max` but the roll button needs a real die face. Entry ranges should match the die.
* **block** (stat block) — see §4.
* **entry / delegated** (the Rules-Cited index) — `{ id, topic, answer|quote, cite, delegated rows need why }`.
* **patterns / phrases** (narration) — `{ id, subject, audience:["dm"|"party"|"pc"|"all"], change:{field,band}, mechanicallySilent:true, phrases:[…] }`; a row aimed at anyone but `dm` **must** be `mechanicallySilent:true` and contain **no digit**.

## 3. Provenance (this is the part that makes the build pass)

`build/make-world-payload.mjs` stamps defaults, but write them yourself when they matter:

* `license: "design"` — this is the DM's own world; nothing here is WotC text. (Stamped automatically.)
* `book: "osmotic"` + `cite: "CORE §4.8"`, `"ATLAS §Step 3"`, `"BESTIARY Order III"`,
  `"CODEX §5.3"` — **cite the book and section you actually read.** The four books have no page numbers;
  section cites are the honest form. No cite ⇒ `confidence: "partial"`.
* `confidence`: `verified` (copied from the books), `repaired` (books garbled, you fixed it — say how),
  `partial` (books defers / you derived it), `mixed` (some of each), `unrecoverable` (a hole; needs
  `unusable:true` + a gap reason), `disputed` (books contradict — name both readings).

**The rule that keeps this world trustworthy:** if the books do not print it, **do not invent it quietly**.
Either (a) fill the row with the world's analogue and mark it `partial` with a gap saying it is derived, or
(b) fill the row with a refusal — a `text` that says what the Expanse does instead,
`params.usable: false` (or a `null` number the code asks for), and a `gaps[]` entry naming the Director
decision. Spell-slot ladders, renown, deity domains and the like are **refusal rows** in this world: the
socket exists, the world has no such thing, the tab must say so instead of computing.

Every row you leave out stays in the World tab's checklist as **empty** — that is a visible failure, so
when in doubt write the refusal row.

## 4. Blocks (the bestiary library) and this world's challenge ladder

The copilot reads `cr` as the **challenge key** and `xp` as the **award**, and pays the award from the
`cr-xp` ladder (`cr_xp.json` → `scalars["cr-xp"].values`, keyed by the printed key string). For this world
those are re-pointed, and the whole library must agree. **This world has two economies, and a row carries
both without ever adding them:**

* **challenge key (`cr`)** = `"<tier>-<role>"`, printed keys exactly:
  `0-swarmling 0-standard 0-elite` (Tier-0/abiotic), `1-swarmling 1-standard 1-elite 1-catastrophe`,
  … through `5-swarmling 5-standard 5-elite 5-catastrophe`.
* **award (`xp`, and the mirror field `bsp`)** = **Biomass Points** — what CODEX §4.1 prices a fight at,
  by role only: Swarmling 1 · Standard 2 · Elite 4 · Catastrophe 10 (an abiotic hazard 2). This is the
  number the encounter budget spends, and it does not move with tier.
* **`codon`** = **Codon** (CORE §2.3) — what an organism spends to Grow: tier base × role factor
  (base T0 1, T1 3, T2 7, T3 15, T4 30, T5 60; factor Swarmling ½, Standard 1, Elite 2, Catastrophe 3 —
  the DESIGN-BIBLE's factors, which CORE prints as one figure per tier: keep both readings, §8).
  Codon is never summed across a fight and never converted into BSP.
* **`cr-xp` ladder row** = `{ "<key>": { "cr": "<key>", "xp": <bsp>, "bsp": <bsp>, "codon": <codon>,
  "tier": <0..5>, "role": "<role>" } }`
* **a block** carries the same pair: `xp`/`bsp` = BSP, `codon` = Codon. A block whose `xp` disagrees with
  its ladder row's `xp` is a contract problem, and so is a block whose `codon` disagrees with its row's.
  (`bsp` from the Codex: Swarmling 1, Standard 2, Elite 4, Catastrophe 10; add `gaps` if you round ½ Codon.)
* other block fields the engine reads: `name`, `aliases`, `ac` (→ **MT**), `hp` (→ **MI**), and free fields
  you may add (`size`, `soak`, `pp`, `pool`, `attack`, `bd`, `traits`, `actions`, `harvest`, `tier`, `role`).
  `ac`/`hp` stay the field NAMES (that is what the code reads); their VALUES are MT and MI.
* `meta.generator` is required on a blocks file: name the script that made it.
* `monsters_mm.json` is the DM-only pointer index socket: leave it empty unless the Codex supplies one.

## 5. Ids the code asks for (do not rename them; write to them)

`src/data/world_slots.json` and each file's `slots[]` list the ids, with the container and a label.
Ids stay **as they are** (they are sockets, not prose) except these, which the code now prefers under the
world's own names (the engine tries the world id first, then the old one — same pattern for the calendar,
which is already in place):

| old socket id | write it as |
| :-- | :-- |
| `harptos-year` | `world-calendar` |
| `harptos-holidays` | `world-calendar-holidays` |
| `harptos-tenday` | `world-week` |
| `harptos-moon` | `world-moon` |
| `harptos-seasons` | `world-seasons` |
| `shieldmeet` | `world-intercalary` |
| `hoard-cr0-4` / `-cr5-10` / `-cr11-16` / `-cr17plus` | `hoard-tier1` … `hoard-tier5` (this world has **five** tier bands) |
| `individual-cr0-4` … `-cr17plus` | `individual-tier1` … `individual-tier5` |

Everything else keeps its id: `carousing-d100-level`, `renown-formula`, `chase-complication-urban`,
`xpThresholdsByCharacterLevel`, `conditions-list` … Write Expanse content into them and let the labels carry
the world's vocabulary. Where an id names something this world does not have (spell slots, renown,
milestones, followers-by-CR), write the **refusal row**.

## 6. This world's vocabulary (use the books' words, always)

* Resolution: **n d6**, 1s are **Inhibitors** (score 0, +1 Metabolic Stress), beat the **Activation
  Threshold (AT)**: 8 Common / 12 Standard / 16 Severe / 20 Extreme / 24 Nucleoid / 28 Apotheotic.
  **Breach Overflow** = total − AT. **Runaway Catalysis** = no 1s and at least two 6s.
* Attributes (Baselines): **VSC** biomass, **DFF** fluidity, **RTC** regulation, **OSM** osmotropy,
  **AFF** affatives. Ranges 0–6 (7–8 only via Apotheosis/Relic).
* Combat: **Pulse Cycle** = 6 s, **PP** = action points (Drift 1, Strike 2, Burst 3–5), **MT** = membrane
  target number, **MI** = Membrane Integrity (hit points), **Soak**, **BD** = base damage,
  **Stress** 0–8, **Dormancy**, **Lysis Countdown boxes**, **Total Lysis** = death.
* Economy: **ATP** (energy + currency, max 8 + RTC×2), **Substrate (S)** (matter), **Bulk**,
  **Codon** (progression: cost L→L+1 = 20L+20), **Specimens**, **Cohesion**.
* Rest: **Reconstitution** (≈1 **Fugue Interval**), **Dormant Cycle** (6 h). Time: **Pulse Cycle**,
  **Fugue Interval**, **Metabolic Beat** (day), **Drift Season** (30 Beats), **Osmotic Tide** (4 seasons),
  **Great Cycle** (16 Tides).
* Gear: **Apparatus**, **Grafts** (slots: 1/2/3/4 by Stage, parasitic grafts = cursed), **Vials**,
  **Symbiotes**, **Relics**. Rarity ladder Common/Uncommon/Rare/Very Rare/Epic/Legendary.
* Never write "d20", "5e", "spell slots", "AC", "HP", "CR", "XP", "DMG/PHB/MM", "Harptos", "level-up bonus
  proficiency" etc. in **user-visible text**. The engine field names (`cr`, `xp`, `ac`, `hp`) are internal
  sockets and stay in code/JSON keys, but any label or sentence a DM reads uses the words above.

## 7. How to check your work

```
node build/make-world-payload.mjs --only <your files>   # shape + coverage, refuses on error
node tests/boot-probe.mjs                               # every tab must render over your rows
node tests/prose-scan.mjs                               # banned old-world words in UI strings only
```

Boot-probe is the real test: it boots the app in Node over the baked payload and visits all 35 tabs. A tab
that throws or renders a stub means your row is shaped wrong — read the module that reads your id
(`src/engine.js`, `src/copilot.js`, `src/delegated.js`, `src/narration.js`, `src/memory.js`, `src/world.js`).

## 8. Tone

These books are good. Steal their voice: concrete, physical, a little dry and very serious about a world
made of cells. Do not summarise a table into prose, and do not flatten a book's list into adjectives.
Keep numbers **exactly** as the books print them. If a number in a book contradicts the DESIGN-BIBLE,
write the book's number, add `confidence:"disputed"`, and put both readings in `gaps`.
