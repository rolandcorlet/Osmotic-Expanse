# The AI Director · prototype (Phases 1-3 passed)

A rules Engine, a shared Ledger and three prototype screens for *The Osmotic Expanse*,
running on one computer and joined by every phone, tablet and laptop on the same network.

A person can run the table from the host console, or an AI Director can take that seat —
online through an API key, or on your own machine with no key at all: see "The AI Director"
below. Either way the Engine does the arithmetic.

**Running a session tonight?** `HOST-GUIDE.md` is the one page to keep beside you: setup,
session zero, approving turns, and what to do when the AI goes wrong.

## Run it

You need [Node.js](https://nodejs.org) 18 or later. Nothing else is installed.

* **Windows:** double-click `Start Director.bat`.
* **Anything else:** `node server.js` from this folder.

The window prints three addresses:

| Screen | Who it is for | Address |
| :-- | :-- | :-- |
| Host console | whoever is running the table | `http://localhost:8787/host?key=…` |
| Table screen | the shared display everyone can see | `http://localhost:8787/table` |
| Player | each player's own phone | `http://<this computer>:8787/play` |

Players must be on the same Wi-Fi or network as the host computer. The first time, Windows
may ask whether Node.js may accept connections: allow it on private networks.

The session is saved after every change (`saves/session.json`) and carries on when you start
again, in the Vector it was playing. To start over, press **New game…** on the host's clocks
card: choose the Vector, and whether the players stay seated (same people and organisms on
fresh sheets, and the same session-zero terms). Undo brings the old game back.

From the command line: `node server.js --new` starts fresh, `--vector <id>` chooses the Vector
for a fresh start, and `--port 9000` changes the port.

**Adding a Vector.** Write its data file in the shape of `data/first-carve.js` (an exported
`scenario` and `publicScenario`), then add one entry to `data/vectors.js`. It appears in the
New game picker.

## Players outside your home network

The addresses above only work on your own Wi-Fi. For anyone elsewhere there are two ways.

**The easy way: the online link.** Install the free `cloudflared` program once
(Windows: `winget install --id Cloudflare.cloudflared`), then double-click
`Start Director (online).bat` (or run `node server.js --online`). After a few seconds the
window prints a link like `https://something.trycloudflare.com/play?t=K7QM`. Send that link
to your players. It also appears on the table screen and the host console (with a Copy
button). No router or firewall changes are needed, the connection is encrypted, and the link
changes each time you start the host this way.

**The manual way: port forwarding.** On your router, forward TCP port 8787 to this
computer, allow Node.js through the Windows firewall for public networks, and give players
`http://<your public address>:8787/play?t=<table code>`. Start the host with
`--public-url http://<your public address>:8787` to show that link on the screens. This does
not work if your internet provider shares one public address between customers (CGNAT), and
the connection is not encrypted.

**The table code.** Anyone joining from outside your network must have the four-character
table code, which is printed when the host starts and is already part of the online link.
Devices on your own network do not need it. The host console always needs the host key.

## The AI Director (Phase 3 — gate passed)

The host console has a **Director** tab. With it, a language model sits in the host's seat.

**Choosing a brain.** Online, with an API key: Google Gemini, Anthropic Claude, OpenAI,
OpenRouter, Groq, Mistral, DeepSeek, xAI Grok. On your own machine, no key needed: Ollama,
LM Studio, llama.cpp, or any other OpenAI-compatible address. Each one remembers its own key,
address and model. Press **Test** to check the chosen model really calls a tool — many small
models cannot, and the Director needs them.

Keys are saved in `saves/director.json` on the host computer. They are never sent to a player
screen, and `saves` is never committed to GitHub.

**Thinking (local models only).** How much the model reasons before each reply: Model default,
Medium, Low, or Off. Less thinking is faster but leans harder on the Engine's guard rails. On
the benched local model: Off ran 5.6 seconds a turn and made three rule errors; Low ran 11.0
seconds clean, which is faster than the cloud. Cloud providers keep their own default.

**Who runs the table.**

* **Off** — a person runs everything from the Run tab.
* **Co-pilot** — the Director prepares each turn; you see what it did with the Engine and
  what it will say, edit it if you like, and nothing reaches the table until you approve.
* **Auto** — it answers the players by itself. A turn that fails the leak check is still
  held for you.

Press **Take a turn** to open the scene. After that it takes a turn whenever a player speaks
(the "What does ... do?" box on their phone), rolls, or ends a turn.

**How it is kept honest.** Each turn the model is sent a fresh briefing built from data: the
site card and Director notes, the organisms, the creatures actually in the scene, what can be
harvested, what the page pays and has not paid yet, which Oaths are still open, the Clocks,
the latest rolls and the recent story. In a Pulse War it also gets creature Pulse Point costs,
whether the creature on turn can Strike and why not, and who is still fighting.

It can change the table only through tools, and the Engine checks every call. It cannot bring
a creature that is not printed for the site, skip a site, pick a Threshold off the ladder,
advance a Clock twice in a session, hand out more than the page pays, or act for a creature
that has stood down. It works on a copy of the Ledger, so a refused or discarded turn leaves
no trace.

**What it writes is checked too.** A reply that leaks a creature's numbers, names the
machinery, runs past 170 words, or ends without a question gets one rewrite, and the rewrite
is used only if it is better. A leak that survives is held for the host even in Auto.

Its standing instructions are plain text in `brain/instructions.md`: edit them to change how
it runs the table.

**Session zero.** Before anyone takes an organism they read the session-zero card and press one
button. It carries the pause word (say it and the scene stops, no explanation owed), a tone
line the host sets, and the table's "off the page" list. Anyone can add to that list, during
play as well as before it; the list is shared, the name is not. The Director is told the
table's own words outrank the page.

**Oaths.** An organism with Oath boxes can swear a promise, and the Engine spends the box and
records it. An open Oath is a promise the table is owed an answer to: the briefing will not let
the Cohort leave a site with one hanging. Settle it kept (the table gains a Cohesion) or broken
(two Lysis Countdown boxes, a scar, and the witness drops a rung). Oath-breaking is a plot, not
a punishment. The host sheets have **Kept** and **Broken** buttons.

**Harvest and stamping.** A destroyed creature, or a site the page says can be cut, is
harvested through the Engine: it sets the Threshold, builds the pool, charges the Bulk, and
lists the Specimens. Nothing carried out is worth anything until a Tally Post weighs, grades
and stamps it — and where the post's offer takes a share, the Engine takes it.

**Stand down.** A creature that yields, flees, or was never fighting is stood down with a
reason. It stays in the scene, takes no turns, cannot strike, and no longer holds the Pulse War
open. A player who strikes it brings it back. Players see it as "standing down".

**The table's memory.** Everything said and done in a game is kept on the host computer, in
`saves/games/<game>/`: a transcript of every line, and a chronicle with a paragraph for each
site the Cohort leaves and each night you end. The Director is never sent all of it. Each turn
it gets the last three chapters and the people, places and threads the table has met; when it
needs more, it searches with `recall`. When a player asks what happened or who someone was, it
searches only what the table was actually told, and answers from that or says the organism does
not remember. Whenever it names someone, it writes them down with `remember`, marked as from the
page, from play, or made up by the Director, so a made-up name becomes canon and stays
consistent.

By default the Director may bring people and threads back at any site, in conversation and
scene-dressing (**Callbacks**). Fights still use only the creatures printed for the site. **Page
only** keeps it to what each site prints. The **Memory** tab on the host console shows the
chronicle and the cast, lets you search the whole game, add or remove a card or a chapter, and
**End the night**. Ad-libbing new people and encounters is the planned next step: the cast
already records what was improvised.

**Testing a model.** `node tools/bench.mjs` plays a scripted Toll-Vent through the real model
and counts Engine refusals, leak flags and style slips. A model passes the gate with no
refusals and no leaks in three runs. `--runs 3` repeats it; `--model <id>` tries another model;
`--sites 2` plays on into the Soft Field; `--players 4` seats a full Cohort; `--thinking low`
sets the thinking for a local model.

Players type what they do. The Director cannot hear the room yet; speech comes in Phase 5.

## What is here

| Folder | What it holds |
| :-- | :-- |
| `engine/rules.js` | The Catalytic Engine as code: pools, the Threshold ladder, reading dice, Baseline, attacks, damage, soak, swarms, Stress, Pulse Points. Each rule cites its section. |
| `engine/odds.js` | Exact odds for any pool against any Threshold, counted from every outcome. |
| `engine/ledger.js` | The Ledger: the one shared record of a session. Only this file changes it. Player screens are sent a view with creature numbers and Director notes removed. |
| `data/vectors.js` | Every Vector the table can play; the New game picker reads this list. |
| `data/first-carve.js` | *The First Carve* as data: the Four Hands, the three Clocks, the five sites. Each site has a "where you are" card for everyone and Director notes for the host only. |
| `data/bestiary.json` | All 68 blocks, read from the Lytic Bestiary by `tools/build-bestiary.mjs`. |
| `brain/instructions.md` | The Director's standing instructions, in plain English. Edit them to change how it runs the table. |
| `brain/director.js` | One Director turn: the briefing, the tool loop on a copy of the Ledger, and the checks on what it wrote. |
| `brain/memory.js` | The table's memory: every game's transcript on disk, and the search over it. |
| `brain/chronicle.js` | The chronicle: a chapter per site and per night, written by the model or plainly by the Engine. |
| `brain/tools.js` | The Director's tools: checked doorways into the Ledger. |
| `brain/providers.js` | Every brain behind one surface: eight online providers and four ways to reach a model on your own machine. |
| `brain/openai.js`, `brain/ollama.js`, `brain/gemini.js` | The three shapes of connection the providers are built from. |
| `brain/manager.js` | Settings, when it takes a turn, and the Co-pilot proposal. |
| `server.js` | The host: serves the screens, pushes live updates, saves the session. |
| `public/` | The screens. Every colour is a variable; the Colours tab edits them. |
| `test/` | The Phase 1 gate, the Ledger tests, the Director tests and the memory tests. |
| `tools/bench.mjs` | The Phase 3 gate: a scripted session played through a real model. |

## Check it

    node --test

* `test/odds.test.js` is the **Phase 1 gate**: the Engine reproduces every cell of the odds
  tables in the Director's Codex §2.4.
* `test/brain.test.js` runs the Director's brain against a scripted stand-in model: the
  copy-then-commit turn, every refusal, Co-pilot and Auto, and the shape of Gemini requests.
* `test/ledger.test.js` replays the printed first Cycle from *The First Carve* §6.4 and checks
  Pulse Points, Reserve and Deflect, Breach and Dormancy, stabilising, rest, and that player
  screens never receive creature numbers.

`tools/check_screens.py` drives a host, two phones and the table screen through a session in
a real browser and measures the layouts (needs Python Playwright and Chrome).

## How play works in the prototype

* **Join.** A player types their name, picks one of the Four Hands and names their organism.
* **Rolls.** The host calls for a roll: who, Baseline, Pathway, modifiers and Threshold. The
  host sees the exact odds first. The player's phone shows the pool and the Threshold, then
  either **Roll the dice** or **I rolled my own** (tap in each real die). Every roll is
  recorded in the Rolls tab with its dice, its total and where the dice came from.
* **No roll.** If the task is unhurried and unopposed and the Homeostatic Baseline meets the
  Threshold, the Engine says so and nothing is rolled (CORE §1.6).
* **Pulse Points.** They exist only inside a Pulse War. Each organism receives its full PP at
  the start of its own turn, every Cycle, including the first Cycle of a new fight. Unspent
  PP are lost at the end of the Cycle (CORE §4.2).
* **Numbers on screen.** A player's MI, ATP, Stress and PP are shown on the Play tab only
  during a Pulse War. Outside a fight they live on the Sheet tab.
* **Creatures.** The host's dice for creatures are rolled in the open. Players see what a
  creature looks like (Segments, hurt or unhurt), never its block.

## In a fight: what a player can do to a roll

* **The situation.** When striking, a player taps what applies: an ally helps (+1, or +2 for
  two), good position (+1), wrong tonic (−1 or −2), target in partial or heavy cover (−2 or
  −4), squeezed or pinned (−2). These are the rows of CORE §1.3; they show in the pool and in
  the recorded roll, so the table can see what was claimed.
* **Overdrive** (CORE §1.8), on any waiting roll, once: +2 dice for 4 ATP, or +4 dice for 4 MI
  and 1 Stress.
* **Reserve** (1 PP on your turn), then when attacked later that Cycle: **Deflect** (MT +4),
  **Brace** (halve Kinetic and Osmotic damage) or **Inhibit** (3 ATP: the attacker rolls 2
  fewer dice). A Reserve not spent is lost at the end of the Cycle.
* **Creatures** hold a Reserve the same way (Bestiary: every Standard, Elite, Catastrophe and
  swarm cluster) and Deflect the first attack against them. A Fold Sentinel that Braces is at
  MT +2 and soak +2 and cannot Drift.
* An attack that lands or misses, and any Runaway Catalysis, plays a short animation on every
  phone and on the table screen. Tap it to dismiss it.

## Rulings the Engine makes, to confirm

These are places where the books are silent or disagree. The Engine picks one reading and
says so here, so it can be changed in one place.

1. **Heavy Apparatus cost 3 PP to Strike** (CORE §9.3). *The First Carve* §6.4 has the Wall
   Strike with the Chitin Flail for 2.
2. **Swarm Strikes.** A swarm gets 1 Strike per 2 Segments (CORE §4.13) but has 2 PP and a
   Strike costs 2. The host console offers "Strike (2 PP)" and "Bite (0 PP)" and enforces
   only the Segment allowance.
3. **Stress penalties sit inside the +5 / −5 modifier cap**, because CORE §1.3 lists
   "Injured" in the same table as the other modifiers.
4. **Brace** halves Kinetic and Osmotic damage after soak, rounded down, never below 1.
5. **A Baseline pass has no Overflow.** CORE §1.6 says you succeed; it does not say by how much.
6. **Creature Frequency is d6 + 0** unless the block prints a modifier, one roll per Order
   (CODEX §3.2, *The First Carve* §6.4).
7. **Turgid** applies its printed "MT −2" once; the −2 DFF is not also taken off the Membrane
   Threshold.
8. **Bands are measured from the Cohort** on the table screen. The books place organisms in
   bands relative to each other; one shared line is a simplification for the prototype.
10. **Overdrive dice sit outside the +5 / −5 cap**: they are bought, not situational.
11. **Inhibit** is offered as the 3-ATP form only (2 fewer dice). The free "re-roll one die"
    form of CORE §4.10 is not built.
12. **A creature's Reserve is always spent on Deflect**, on the first attack against it. The
    Bestiary gives creatures "+4 to its defending Threshold" and nothing else.
9. **Zone distances** are shown only where the Vector prints them. A dot means not printed.

## Not built yet

* The Director's voice and face (Phase 5).
* Discord sign-in (Phase 2). Outside players join by link and table code for now.
* The Detection Phase as a guided step, Bursts with their effects, Momentum checks, hazards as
  timed objects, and Growth.
* The separate note-taker and leak-checker models from the design: the leak check is
  pattern-based.
* Encounter budgets scaled for a Cohort of two to six.

## Rulings confirmed by Roly on 12 November 2026

1. A Heavy Apparatus costs 3 Pulse Points to Strike (CORE 9.3).
2. A swarm's first Strike in a turn costs 2 Pulse Points; further bites inside its Segment allowance cost none.
3. Stress penalties count inside the +5 / -5 modifier cap.
4. Brace halves damage after soak, rounded down, minimum 1.
5. A pass on Baseline (no roll) gives no Overflow.
6. Creature Frequency is d6 + 0 unless printed, one roll per Order.
7. Turgid's "MT -2" is applied once, not doubled through DFF.
8. The table screen measures bands from the Cohort as a group.
9. Zone distances are shown only where the Vector prints them.
10. A pool never falls below one die.
11. The AI Director may award only the Codon and Substrate amounts printed under the site's Pays. The host is not limited.
12. A failed creature harvest gives 5 S for each printed C Specimen, and no Specimens.
13. One cut of the Soft Field gives 4 C, or 3 C and 1 G on 4 or more Overflow while CARCASS is 0 or 1. A failed cut gives 10 S.
14. A harvested creature gives the Specimens printed in the Bestiary (a Gnaw Swarm: C3 / G1), not the "2 C Specimens" in the Toll-Vent's notes.
15. A successful harvest gives Specimens only, until an amount of Substrate is set.
