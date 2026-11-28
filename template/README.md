# The AI Director template

A blank tabletop role-playing game with an AI Director: everything the Osmotic Expanse, D&D and Skeleton Directors
were built and benched with (28 Nov 2026), and no game in it. What is here is the frame every game needs: a dice
Engine (a choice of ten systems, set by the game's own rules), a shared Ledger, host, table and player screens,
the map (zones with a grid), memory and the chronicle, saved games, an AI Director that runs the table through
tools, voice, and a **converter** that turns a rule book, a players' handbook, a monster book, a campaign or just a
few ideas into a game **module** (a folder of JSON files).

## Keep this folder as it is

This folder is the template. Do not build a game in it: double-click **`New rule system.bat`** at the top of the
repository, give the new system a name, and it copies this folder to `systems/<name>/`. Build and play the game
there; the template stays blank for the next one. (Improvements made to the template later do not reach systems
already copied from it; bring them across by hand.)

## Your game, step by step

1. In your system's folder, double-click `Start game.bat` and open the host address it prints.
2. On the host's **AI** tab, choose the AI (it must be able to call tools).
3. On the **Converter** tab, give it your rule book or campaign (paste the text or open a PDF), or a few ideas. It
   writes the module into `modules/<id>/` and checks it.
4. Press **Check the module** on the **Game** tab. Fix every problem, and read the **advice**: each line is
   something that made the AI Director stumble in test games (a quest with no ending place, a hazard with no cost,
   a fight promised where nothing can fight, someone to rescue written as a monster, a place nobody can reach).
5. Before playing with people, run the checks with no AI (`node tools/preflight.mjs --module <id>`) and a bench
   (`node tools/bench.mjs --module <id>`): see **Testing**, before **What is where**.

`example/saltglass/` is a small worked example (salvage divers in a drowned glass city). It is not a game of yours:
it shows the format, the converter copies its shape, the tests run on it, and the host loads it only while
`modules/` is empty, so the screens work before your first game exists.

## Run it

Node.js 18 or later; nothing to install.

* **Windows:** double-click `Start game.bat`.
* **Anything else:** `node server.js` from this folder.

It prints three addresses: the **host console** (keep its key private), the **table screen** for a shared display,
and the **player** address for phones on the same Wi-Fi. Options: `--port 8790`, `--module <id>`,
`--adventure <id>`, `--new` (start fresh), `--key <secret>`.

## Play

* Players open the player address, join, and take a ready-made character or build their own.
* **Objects:** a place's `objects` (a chest, a lever, a log) show with Use buttons on the player's and the host's
  screens, and the Director has use_object. Rules wait for them: `when: 'use sea chest'`, `if: 'carries brass key'`,
  `do: 'give', item: 'Brass key'` (engine/triggers.js lists every moment, condition and effect).
* **Memory:** everything said in a game is kept (`saves/games/<game>/`) and searched by the Director's recall and on
  the **Chronicle** tab. A chapter of the chronicle is written each time the party leaves a place and at **End the
  night** (by the AI when the Director is on, else plainly), and the Director reads the latest three.
* **Saved games** on the **Game** tab: save under a name, load one (Undo brings back the game before), delete;
  an autosave keeps one slot per game every five minutes while it changes (`saves/slots/`).
* The host runs the table from the **Play** and **World** tabs, or turns the **AI Director** on: it answers every
  player, asks for rolls on their screens, plays the creatures, and keeps the story going. In **Co-pilot** each of
  its turns waits on the Play tab first: what it does and says, to approve (its words edited or not), retry or
  discard; if the table moved on meanwhile, approving asks it again. Choose its AI on the
  **AI** tab: Gemini, Claude, OpenAI, OpenRouter, Groq and others online, or Ollama, LM Studio and llama.cpp on your own
  computer. The model must be able to call tools.
* **Voice**: each screen can read the Director aloud with its own voice, or a speech server (Kokoro, Piper) can speak
  for all of them.
* **Undo** (Game tab) takes back the last change. The game saves itself after every change.
* **Joining from anywhere:** `Start game (online).bat` (or `--online`) asks the free cloudflared program for a
  public link. Players outside your Wi-Fi need the **table code** it prints. Every screen (table, host Game tab,
  player Colours tab) shows the join links, so anyone already in can pass them on.
* **Plain words:** the first time one of the game's own words (from the module's `lore.json` glossary) appears in
  the story, it is underlined, and a tap shows what it means. The Director knows which words the table has met and
  explains new ones; if it forgets, the Engine adds the meaning in brackets.
* **Rolls:** the Director waits for a player to say what they try before asking for a look-or-notice roll, and every
  roll asked for is said in the story with what it is for.
* **Fights:** a character who has used every action this turn has their turn ended by the Engine, and the creatures
  act on their own turns. The player screen shows the actions left.
* **The AI:** a local model costs nothing to run. A cloud model bills you, and stops mid-game when its spending cap
  runs out.

## The dice

Each game chooses its dice system in `rules.json` (`"dice": { "system": "d20" }`); without one it uses the d6 pool.

| System | For games like |
| :-- | :-- |
| `d6-pool` (the default) | The Osmotic Expanse, Saltglass: a pool of d6, a 1 scores nothing and is a snag, two 6s and no 1s is a surge |
| `d20` | D&D, Pathfinder, the OSR: d20 + modifier against a DC; natural 20 and 1 |
| `percentile` | Call of Cthulhu, RuneQuest, Warhammer: d100 under your chance; hard and extreme successes, fumbles |
| `2d6` | Powered by the Apocalypse, Traveller: 2d6 + stat; 10+ full success, 7-9 partial |
| `success-pool` | World of Darkness, Shadowrun, Year Zero: count dice that hit a target; botches |
| `fate` | Fate: 4dF + skill on the ladder; ties at a cost, success with style |
| `step` | Savage Worlds, Cortex: stats are d4 to d12, exploding, with a wild die; raises |
| `roll-under` | GURPS and roll-under games: 3d6 (or d20) at or under a target |
| `highest-die` | Blades in the Dark and Forged in the Dark games: a d6 pool read by its best die; 6 full, 4-5 partial, two 6s critical |
| `roll-keep` | Legend of the Five Rings, 7th Sea: roll stat + skill d10s, keep as many as the stat (5k3); 10s explode |

Each system has options (sides, targets, crit and fumble numbers, partial-success window, what a good roll adds to
damage) and its own ranges for stats, difficulties, creature attacks and defences, which the validator checks.
Whatever the system, every roll has the same three parts, so the Engine and the AI Director run every game the same
way: a **difficulty**, a **snag** (the system's penalty, such as a natural 1 or a fumble: each marks 1 strain) and a
**surge** (its bonus, such as a natural 20 or a raise: an attack's weapon counts twice). Weapons are a number or
dice ("1d8+2").

**Advantage and disadvantage** (an *edge*) work in every system: the Director's `ask_for_roll` can give it when the
situation clearly favours or works against a character, and a condition can carry it (`"edge": -1`). d20 rolls two
and keeps the better or worse, percentile gets a bonus or penalty die, every other system counts it as +1 or -1.

`node tools/dice-lab.mjs --module <id>` (or `--system d20`) prints the chance of success for every rating against every
difficulty, for tuning. `MODULE-FORMAT.md` lists every system's options and ranges.

The d6 pool in full: roll a stat (1 to 5 dice) plus a skill (0 to 3) plus or minus modifiers (at most +5 or -5,
never under 1 die). Add them up; a 1 scores nothing and is a snag; two or more 6s and no 1s is a surge. Meet the
difficulty (8 easy, 12 standard, 16 hard, 20 extreme, 24 legendary). Damage = overflow + weapon - soak, at least 1.

## Make a game

Three ways, which mix freely:

1. **With an AI design partner.** Paste `DESIGNER-PROMPT.md` into a chat with Claude and describe your idea. It
   interviews you step by step (pitch, words, stats, snags and surges, characters, creatures, world, first adventure)
   and writes the files when you are ready.
2. **With the converter.** On the host's **Converter** tab, choose:
   * **Convert**: paste or add a rule book, handbook, monster book or campaign (as text or Markdown);
   * **Invent**: type a few ideas ("sky whales, kite cities, smugglers, a storm that eats memories");
   * **Extend**: add creatures or a new adventure to a module you have.
   Choose a dice system, or let it keep the source's own. It writes each section with the AI from the AI tab, checks it, sends any problems back once, and saves the module
   under `modules/`. From the command line: `node tools/convert.mjs --mode invent --ideas "..."` (see the top of
   `tools/convert.mjs`). Without the app: paste `CONVERTER-PROMPT.md` into a chat with Claude, with your material.
3. **By hand.** Copy `example/saltglass/` to `modules/<your-id>/`, and edit the JSON in any text editor. `MODULE-FORMAT.md` describes every
   field.

Then check it: **Check the module** on the Game tab, or `node tools/convert.mjs --check <module-id>`. Start it with
**Start a new game** on the Game tab.

## Testing

* `node --test`: the Engine, the Director's tools and checks, the converter's checks (on the worked example).
* `node tools/preflight.mjs --module <id>`: no AI. The module checker and its advice, every place reachable, each
  fight simulated for the smallest and largest party, a generated bench script played through, and every tool
  fuzzed and replayed. Fix what it reports before spending AI time.
* `node tools/bench.mjs --module <id> --runs 1`: the real AI plays the adventure from a generated script, every
  call checked. **THE GATE** fails on an error, a refused call, a leak or a stalled fight; missing outcomes and style
  are reported, not failed. Its log, status, exit and calls files sit beside it; `node tools/replay.mjs` replays
  the calls through today's code after any change.
* `node tools/dice-lab.mjs --module <id>`: the odds of the game's own dice and ladder.

## What is where

```
engine/   dice.js, odds.js     random dice and the d6 pool's exact odds (from the Osmotic Director, unchanged)
          dicesystems.js       the ten dice systems (also loaded by the screens)
          core.js              damage, strain, the snag table, health
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
          dice-lab.mjs         odds tables for a dice system or a module
test/                          node --test
```

After changing the format in `engine/schema.js` or the guide, run `node tools/make-prompts.mjs` so the documents
match.

## What came from the Osmotic Expanse Director, and what did not

Kept: the d6 dice and odds (now one of ten systems), the Ledger and Engine pattern (the Director asks, the Engine decides), the host, table and
player screens, the AI providers and the tool-calling Director loop with its narration checks, voice, undo and saves,
and the lessons from its benches (harmless slips are notes, not refusals; a roll asked for in words is sent back to
the tool; a creature narrated dead while still standing is caught).

Left out, because they belong to the Osmotic Expanse and not to every game: the core rule books and their rulings,
the Vectors (its adventures), organisms, ATP, Pulse Points, Bursts, Tolerance, Codon, the bestiary and its art.
