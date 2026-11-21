# The Skeleton

A tabletop role-playing game engine with an AI Director, built from the Osmotic Expanse AI Director with the
Osmotic Expanse taken out. What is left is the frame every game needs: a d6 dice Engine, a shared Ledger, host,
table and player screens, an AI Director that runs the table through tools, and voice. Each game is a **module**: a
folder of JSON files. A **converter** writes modules from a rule book, a players' handbook, a monster book, a
campaign, or just a few ideas.

`modules/saltglass/` is a small sample game (salvage divers in a drowned glass city) that shows the format and lets
you try everything at once. Replace it with your own.

## Run it

Node.js 18 or later; nothing to install.

* **Windows:** double-click `Start Skeleton.bat`.
* **Anything else:** `node server.js` from this folder.

It prints three addresses: the **host console** (keep its key private), the **table screen** for a shared display,
and the **player** address for phones on the same Wi-Fi. Options: `--port 8790`, `--module <id>`,
`--adventure <id>`, `--new` (start fresh), `--key <secret>`.

## Play

* Players open the player address, join, and take a ready-made character or build their own.
* The host runs the table from the **Play** and **World** tabs, or turns the **AI Director** on: it answers every
  player, asks for rolls on their screens, plays the creatures, and keeps the story going. Choose its AI on the
  **AI** tab: Gemini, Claude, OpenAI, OpenRouter, Groq and others online, or Ollama, LM Studio and llama.cpp on your own
  computer. The model must be able to call tools.
* **Voice**: each screen can read the Director aloud with its own voice, or a speech server (Kokoro, Piper) can speak
  for all of them.
* **Undo** (Game tab) takes back the last change. The game saves itself after every change.

## The dice

Every game on the Skeleton rolls the same way:

* Roll a pool of d6: a stat (1 to 5 dice) plus a skill (0 to 3) plus or minus modifiers (at most +5 or -5 together,
  never under 1 die).
* Add them up. **A 1 scores nothing and is a snag**: each one marks 1 strain, and a failed roll with snags may cost
  more (the module's snag table).
* **Two or more 6s and no 1s is a surge**: on an attack the weapon counts twice; otherwise the module's surge bonus.
* Meet the difficulty (8 easy, 12 standard, 16 hard, 20 extreme, 24 legendary) to succeed. What is left over is
  overflow. Damage = overflow + weapon - soak, at least 1.

A module renames all of these (Saltglass calls a snag a Crack and a surge a Gleam) but cannot change them.

## Make a game

Three ways, which mix freely:

1. **With an AI design partner.** Paste `DESIGNER-PROMPT.md` into a chat with Claude and describe your idea. It
   interviews you step by step (pitch, words, stats, snags and surges, characters, creatures, world, first adventure)
   and writes the files when you are ready.
2. **With the converter.** On the host's **Converter** tab, choose:
   * **Convert**: paste or add a rule book, handbook, monster book or campaign (as text or Markdown);
   * **Invent**: type a few ideas ("sky whales, kite cities, smugglers, a storm that eats memories");
   * **Extend**: add creatures or a new adventure to a module you have.
   It writes each section with the AI from the AI tab, checks it, sends any problems back once, and saves the module
   under `modules/`. From the command line: `node tools/convert.mjs --mode invent --ideas "..."` (see the top of
   `tools/convert.mjs`). Without the app: paste `CONVERTER-PROMPT.md` into a chat with Claude, with your material.
3. **By hand.** Copy `modules/saltglass/`, and edit the JSON in any text editor. `MODULE-FORMAT.md` describes every
   field.

Then check it: **Check the module** on the Game tab, or `node tools/convert.mjs --check <module-id>`. Start it with
**Start a new game** on the Game tab.

## What is where

```
engine/   dice.js, odds.js     the d6 core and its exact odds (from the Osmotic Director, unchanged)
          core.js              pools, snags, surges, damage
          schema.js            the module format: templates and checks (the one source of truth)
          module.js            loading, saving and searching a module
          ledger.js            the game state and every action on it
brain/    director.js          one AI Director turn: briefing, tool calls, narration, checks
          tools.js             the Director's tools
          instructions.md      the Director's instructions (filled in from the module)
          converter.js         the converter; convert-guide.md is its guide
          providers.js ...     the AI providers (from the Osmotic Director, unchanged)
          voice.js             speech (from the Osmotic Director)
          settings.js          which AI is used; keys stay in saves/
public/                        the screens: host (/host?key=...), table (/table), player (/play)
modules/                       one folder per game
tools/    convert.mjs          the converter from the command line, and module checks
          make-prompts.mjs     rewrites the three .md prompts from engine/schema.js and the guide
test/                          node --test
```

After changing the format in `engine/schema.js` or the guide, run `node tools/make-prompts.mjs` so the documents
match.

## What came from the Osmotic Expanse Director, and what did not

Kept: the d6 dice and odds, the Ledger and Engine pattern (the Director asks, the Engine decides), the host, table and
player screens, the AI providers and the tool-calling Director loop with its narration checks, voice, undo and saves,
and the lessons from its benches (harmless slips are notes, not refusals; a roll asked for in words is sent back to
the tool; a creature narrated dead while still standing is caught).

Left out, because they belong to the Osmotic Expanse and not to every game: the core rule books and their rulings,
the Vectors (its adventures), organisms, ATP, Pulse Points, Bursts, Tolerance, Codon, the bestiary and its art.
