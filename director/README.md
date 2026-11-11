# The AI Director · prototype (Phase 1)

A rules Engine, a shared Ledger and three prototype screens for *The Osmotic Expanse*,
running on one computer and joined by every phone, tablet and laptop on the same network.

A person can run the table from the host console, or the AI Director (Google Gemini) can
take that seat: see "The AI Director" below. Either way the Engine does the arithmetic.

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
again. `node server.js --new` starts fresh. `--port 9000` changes the port.

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

## The AI Director (Phase 3)

The host console has a **Director** tab. With it, Google Gemini can sit in the host's seat.

1. Create an API key at [aistudio.google.com](https://aistudio.google.com) (Google account needed;
   Google sets the price and any free allowance).
2. On the Director tab, paste the key and press **Save key**. Your models load into the list;
   the newest Flash model is chosen for you.
3. Choose who runs the table:
   * **Off** — a person runs everything from the Run tab.
   * **Co-pilot** — the Director prepares each turn; you see what it did with the Engine and
     what it will say, edit it if you like, and nothing reaches the table until you approve.
   * **Auto** — it answers the players by itself. A turn that fails the leak check is still
     held for you.
4. Press **Take a turn** to open the scene. After that it takes a turn whenever a player
   speaks (the "What does … do?" box on their phone), rolls, or ends a turn.

The key is saved in `saves/director.json` on the host computer. It is never sent to players
and the `saves` folder is never committed to GitHub.

**How it is kept honest.** Each turn the model is sent a fresh briefing built from data: the
current site's card and Director notes, the organisms, the creatures, the Clocks, the latest
rolls and the recent story. It can change the table only through tools, and the Engine checks
each one: it cannot bring a creature that is not printed for the site, skip a site, pick a
Threshold off the ladder, advance a Clock twice in a session, or hand out more than the page
pays. It works on a copy of the Ledger, so a refused or discarded turn leaves no trace. Its
standing instructions are plain text in `brain/instructions.md`: edit them to change how it
runs the table.

**Testing a model.** `node tools/bench.mjs` plays a scripted Toll-Vent through the real model
and counts Engine refusals, leak flags and style slips. A model passes the gate with no
refusals and no leaks. `--runs 3` repeats it; `--model <id>` tries another model.

Players type what they do. The Director cannot hear the room yet; speech comes in Phase 5.

## What is here

| Folder | What it holds |
| :-- | :-- |
| `engine/rules.js` | The Catalytic Engine as code: pools, the Threshold ladder, reading dice, Baseline, attacks, damage, soak, swarms, Stress, Pulse Points. Each rule cites its section. |
| `engine/odds.js` | Exact odds for any pool against any Threshold, counted from every outcome. |
| `engine/ledger.js` | The Ledger: the one shared record of a session. Only this file changes it. Player screens are sent a view with creature numbers and Director notes removed. |
| `data/first-carve.js` | *The First Carve* as data: the Four Hands, the three Clocks, the five sites. Each site has a "where you are" card for everyone and Director notes for the host only. |
| `data/bestiary.json` | All 68 blocks, read from the Lytic Bestiary by `tools/build-bestiary.mjs`. |
| `brain/instructions.md` | The Director's standing instructions (v0.2), in plain English. |
| `brain/director.js` | One Director turn: the briefing, the tool loop on a copy of the Ledger, and the checks on what it wrote. |
| `brain/tools.js` | The Director's tools: checked doorways into the Ledger. |
| `brain/gemini.js` | The connection to Google Gemini. Other providers will sit beside it. |
| `brain/manager.js` | Settings, when it takes a turn, and the Co-pilot proposal. |
| `server.js` | The host: serves the screens, pushes live updates, saves the session. |
| `public/` | The screens. Every colour is a variable; the Colours tab edits them. |
| `test/` | The Phase 1 gate and the Ledger tests. |

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

* The Director's voice and face (Phase 5). A local model and other providers.
* Discord sign-in (Phase 2). Outside players join by link and table code for now.
* The Detection Phase as a guided step, Bursts with their effects, Momentum checks, hazards as
  timed objects, harvest and Specimens, Cohesion, Oaths, and Growth.
* Encounter budgets scaled for a Cohort of two to six.
