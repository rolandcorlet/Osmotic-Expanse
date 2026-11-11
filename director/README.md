# The AI Director · prototype (Phase 1)

A rules Engine, a shared Ledger and three prototype screens for *The Osmotic Expanse*,
running on one computer and joined by every phone, tablet and laptop on the same network.

There is no AI in this build yet. A person sits at the host console and the Engine does
the arithmetic. The AI Director takes that seat in Phase 3; everything it will need to call
is already here.

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

## What is here

| Folder | What it holds |
| :-- | :-- |
| `engine/rules.js` | The Catalytic Engine as code: pools, the Threshold ladder, reading dice, Baseline, attacks, damage, soak, swarms, Stress, Pulse Points. Each rule cites its section. |
| `engine/odds.js` | Exact odds for any pool against any Threshold, counted from every outcome. |
| `engine/ledger.js` | The Ledger: the one shared record of a session. Only this file changes it. Player screens are sent a view with creature numbers and Director notes removed. |
| `data/first-carve.js` | *The First Carve* as data: the Four Hands, the three Clocks, the five sites. Each site has a "where you are" card for everyone and Director notes for the host only. |
| `data/bestiary.json` | All 68 blocks, read from the Lytic Bestiary by `tools/build-bestiary.mjs`. |
| `server.js` | The host: serves the screens, pushes live updates, saves the session. |
| `public/` | The screens. Every colour is a variable; the Colours tab edits them. |
| `test/` | The Phase 1 gate and the Ledger tests. |

## Check it

    node --test

* `test/odds.test.js` is the **Phase 1 gate**: the Engine reproduces every cell of the odds
  tables in the Director's Codex §2.4.
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
9. **Zone distances** are shown only where the Vector prints them. A dot means not printed.

## Not built yet

* The AI Director itself (Phase 3), its voice and face (Phase 5).
* Discord sign-in (Phase 2). Outside players join by link and table code for now.
* The Detection Phase as a guided step, Bursts with their effects, Momentum checks, hazards as
  timed objects, harvest and Specimens, Cohesion, Oaths, and Growth.
* Encounter budgets scaled for a Cohort of two to six.
