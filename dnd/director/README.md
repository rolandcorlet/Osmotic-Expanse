# D&D 5e AI Director

The D&D 5e versions of the project's apps, built on the free **System Reference Document 5.1**
(Creative Commons Attribution 4.0). Nothing here copies the Player's Handbook, Dungeon Master's Guide
or Monster Manual; every rule, class, spell, monster and item comes from the SRD. If you own the books,
the Director can also read your own text copies of them on your computer (the **book library**, below);
that library stays on your machine and is never committed or published.

| Folder | What it is |
|---|---|
| `director/` | **The AI Director for D&D.** A small server you run on the table's computer, with three screens: the Director's (DM's) console `director.html` (also `/host`), each player's `player.html` (also `/play`) and a shared `table.html` (also `/table`). An AI can run the game (Co-pilot or Auto) through a rules Engine that keeps every number honest. |
| `dm/` | **The Dungeon Master's Assistant**, one offline web page (built). |
| `players/` | **The Players' Assistant**, one offline web page (built). |
| `data/srd.json` | The SRD rules data every app reads: 12 classes, 9 races, 319 spells, 334 monsters, 239 magic items, equipment, conditions and 33 rules sections. |
| `tools/build_srd.py` | Rebuilds `srd.json` from 5e-bits/5e-database, cleaning the text for reading. |
| `assistants/build.mjs` | Rebuilds the two Assistants from the Director's own screens. |

Websites (once pushed): `https://osmotic-expanse.vercel.app/dnd/`, `/dnd/dm/` and `/dnd/players/`.

## Running the AI Director

1. Install Node.js (LTS) from nodejs.org.
2. Double-click `director/Start Director.bat`. The window prints the host console link, the
   player link and the host key.
3. Open the host console, go to the **Director** tab, choose an AI (Gemini, Claude, OpenAI, a local
   Ollama or LM Studio…), paste its key and pick a model. Press **Test**.
4. Players open `player.html` on their phones and type their name. They can **take over a
   character** already in the party (one nobody plays, or one its player has offered), pick one of
   the adventure's **ready-made heroes** (ten for The Ashen Crown), roll a random one, or **build
   their own** in the six-step builder.
5. Choose **Co-pilot** (you approve each turn) or **Auto**, and press **Take a turn**.

`Start Director (online).bat` adds a public link for players who are not on your Wi-Fi
(it needs the free `cloudflared`). Saved games, the autosave and the optional Supabase backup work
as in the Osmotic Expanse Director (save ids start with `dnd-`, in the same `oxd_saves` table).

### What the Engine does

- **Characters**: a six-step builder (race, class, abilities by standard array, point buy or
  rolling, skills and background, equipment, spells) and levelling up (hit points, subclass,
  ability score improvements, new spells). Armour Class, attacks, saves, skills, spell save DC and
  slots are all worked out from the choices.
- **Rolls**: the DM or the AI asks for a check or save with a DC; it appears on that player's phone;
  the Engine rolls it (or takes the number from real dice) with advantage, disadvantage and every
  condition and exhaustion level applied. Players never see a DC or a monster's numbers.
- **Combat**: initiative, turn order, the action and bonus action, attacks against AC with
  critical hits, Extra Attack, Sneak Attack, Divine Smite, Rage, resistances and immunities,
  Undead Fortitude, monster recharges, saving-throw abilities such as breath weapons, concentration
  saves, dropping to 0 hit points, death saves, massive damage, and XP shared at the end.
- **Spells**: slots spent and upcast, cantrips scaling with level, spell attacks, area spells with
  saves (half damage), healing, concentration, rituals, and Magic Missile's darts.
- **Rests**: short rests spend hit dice and restore short-rest abilities and warlock slots; long rests
  restore everything.

### The maps

A **Map** tab on every screen (player, table and DM) has three maps, each switched on or off for
everyone by the DM:

- **Travel map**: the adventure's places joined by their roads, with travel times. Players see where
  they have been and the places one road away; tapping one puts "Let's head for…" in their Say box.
  The DM can move the party from it, drag each place onto an imported map picture, or leave the
  places where the adventure (or the Engine's own layout) puts them.
- **Zone map**: the place where the party is, split into zones of about 30 feet (the gate arch, the
  wall walk). Each zone can be marked as cover, high ground, difficult terrain, darkness, water, a
  hazard or narrow. A place with no zones of its own gets three (near side, middle, far side).
- **Battle grid**: one zone as 5-foot squares, 6 by 6 unless a battle map says otherwise. On their
  turn a player taps a lit square (each shows what it costs), drags their token, or takes a way into
  the next zone. Dash and Disengage are buttons. Walking out of an enemy's reach says the enemy may
  make an opportunity attack.

Who moves what: players move their own character (outside a fight freely; in a fight only on their
turn and within their speed); the DM moves anyone anywhere; the AI Director moves monsters with its
`move_creature` tool, thinks in zones (the briefing lists who stands in each), and a melee attack
steps the attacker up to its target by itself. With the DM's **reach and range rules** switch on, a
melee attack needs the target within reach this turn, a monster too far away charges instead of
striking, ranged attacks are at disadvantage next to an enemy or at long range, and a target beyond
long range is refused. With it off (the default), the map simply follows the story.

The DM imports pictures on the Map tab: a **travel map** picture, a **battle map for the whole place**
(a picture with its squares counted, or a Universal VTT file from Dungeondraft, Dungeon Alchemist,
DungeonFog or Arkenforge, which brings its own squares, walls and doors; it can be cut into 30-foot
zones at once), a **picture behind the zones**, or a **battle map for one zone**. Walls stop movement
and doors let it through. The DM edits zones by dragging them (on a battle map they land on whole
squares), naming them, tagging them and linking them. Pictures are kept with the saved games
(`saves/maps`), named by their contents, and only real images (PNG, JPEG, WebP, GIF) are kept.

An adventure can lay out its own: `zones` on a place (name, box, links, tags, `from` the places that
lead in, and a note for the Director), `zone` on each of its monsters, and `map: { x, y }` for where the
place sits on the travel map. The Lantern of Thornwick Ford has all three.

### The adventures

**The Ashen Crown of Sundermark** (levels 1 to 10, the default) is Roly's three-act campaign set out
for the Director (`director/data/adventures/ashen-crown.js`). Session 1 opens mid-ambush on a burning
bridge at Highbridge Gorge; Act I is written in full (the hub town of Oakhurst, Blackreed Mill, the
Sunken Barrow of Saint Vane, the Ironfang foundry and the night at Thorne Keep), and Acts II and III
give each node of the Keystone hunt, the four factions, the Battle of Brindol's Gates, the three
approaches to Cinderhelm and the two-phase fight with Lord Malakor Vane. The AI Director is told the
campaign's rules every turn: the **three clue rule** (every place points three ways onward, and a lost
clue comes back another way) and **three methods** for every big encounter (fight, stealth or
trickery, talk or leverage). It also has:

- **Clocks**: dangers that fill segment by segment (the burning bridge, the portcullis winch, the
  invasion of Brindol, Malakor's runic chains), shown as pies on every screen; the Director ticks them
  with its `clock` tool and the DM with + and −.
- **Its own monsters**: the Iron Brand captain, Taskmaster Kragg, Snikt the goblin shaman, Vorgath the
  Earth-Shaker, the Ash Hounds, Lord Malakor Vane and his Ash-King avatar, written for this project, so
  the campaign plays on the SRD alone.
- **Ten ready-made Sundermark heroes**, one of each of ten classes, each with one of the campaign's
  three reasons for travelling with the caravan (hired steel, a personal letter, a lost heirloom).
- **Taking over a character**: the DM can put a ready-made hero in the party with no player (the AI
  Director plays them); any player without a character can take them over. A player can offer their
  character or step back from it on the Sheet tab, and a borrowed character goes back to its owner.

**The Lantern of Thornwick Ford** (levels 1 to 3) is written for this project: eight places from a
village inn to a drowned chapel, with read-aloud text, DM notes, people with voices and wants,
checks and what they reveal, treasure, SRD encounters and XP milestones. A blank **Your own campaign**
start is there too; write your own side quests on the **Seeds** tab and the AI weaves them in.

## The book library (private)

If you own the Player's Handbook, Monster Manual and Dungeon Master's Guide as text files, the
Director can use them on your computer: 43 more spells, the Monster Manual's creatures that the SRD
lacks (about 60 read cleanly from the scan, each checked against its own numbers), the other subraces,
subclasses and backgrounds, and about 2,100 sections of rules text that `look_up_rules` searches and
cites by book and page.

1. Put the `.txt` books in `director/library/books/` (any names: each is recognised by what is in it).
2. Double-click `director/Import my books.bat` (or run `node tools/import-books.mjs`).
3. Start the Director: the window says what the library added.

`director/library/` is in `.gitignore`: the books and `library.json` never leave your computer, and
the server keeps the rules text to itself (it is searched, never sent to a browser). Start with
`--no-library` to play on the SRD alone.

## The bench (testing the AI with a real model)

`director/tools/bench.mjs` plays a scripted two-player table through the opening of the Lantern
(the inn, an Insight check, the road north, a Perception check, the goblin fight to the end, searching
the bodies) with whichever AI is set up on the Director tab, and counts what went wrong.

```
cd dnd/director
node tools/bench.mjs --runs 3 --log bench.log
```

A model passes the gate when no run has an Engine refusal, a leak (a DC, AC or hit points, or the
machinery), a living character called dead, a roll asked for in words, a closing question to the
wrong player in a fight, a stalled fight, or an error. Style notes are reported but not gated.
`--fake` runs it with a stand-in that only narrates, to check the bench.

Each scripted step checks an **outcome in the game**, not which tool was used: the party moved on, a
fight started, XP was paid, a quest was finished. Any way the Director gets there counts. An outcome
the game has made impossible is not checked (no monsters left here to fight, no quest still open), a
check answered from a passive score is counted apart as "no roll asked", and a missed fight or move is
counted once even when the bench then has to step in. These are reported, not gated. The bench also
runs the adventure checker first and prints what it finds.

"Nothing to change" is never a refusal: ending a fight that is over, revealing monsters when none are
hidden, acting out of turn and the like come back to the Director as a note saying what is true
(the Engine marks those refusals, and the tools turn them into notes in one place). Names, conditions,
skills and places are matched forgivingly ("Grisk the bugbear", "knocked prone", "perceive", "the old
watchtower"); anything still unclear is refused with the choices listed.

## Checking an adventure

`node tools/check-adventure.mjs` (or one adventure: `... lantern`, or a file: `... my-quest.js`) checks
an adventure file without playing it: ids, exits and whether every place can be reached, monsters that
are not in the SRD, checks with skills that do not exist, broken zones and monster zones, clocks,
quests that cannot finish, people with missing voices or wants, names shared with ready-made heroes,
ready-made heroes that do not build, the adventure's rules (below), and how hard each fight is for the
party it is written for (`party: { size: [4, 5], level: 1 }`, and a place's own `level: 4`). It also
notes the rules that live only in a place's notes with no rules field to match. Errors set the exit code to 1. The same check is on the DM's Adventure tab
(**Check this adventure**) and at the top of every bench log.

## The adventure's rules, fights fitted to the party, and the Engine's answers

**Rules.** A place can list `rules`: "when this happens here, that happens", which the Engine carries out by
itself after every change, so the Director only narrates them. For example (from the Lantern):

```js
rules: [
  { id: 'ambush', when: 'fail perception', do: 'fight', surprise: 'party' },
  { id: 'scouts-run', when: 'down', who: 'Goblin scout', count: 2, do: 'flee', to: 'tower-gate' },
  { id: 'milestone', when: 'cleared', do: 'xp', xp: 300 },
]
```

- `when`: enter, attack, fail or succeed `<skill>`, round `<n>` (or plain round: the end of every round),
  down, hurt (below half, or `hp`), cleared, full `<clock>`, quest `<words>`.
- `if`: from, visited, down, standing, hurt, quest, has, passed or failed `<skill>`, fight, no fight;
  "not" turns one round.
- `do`: fight (`surprise`), flee (`target`, `to`), tick (`clock`, `by`), quest, xp (`xp`, or `level`: what
  each still needs to reach it), reveal, say. Any rule can also carry `xp`, `level` and `say`.

`engine/triggers.js` has the full list. Two defaults hold everywhere: an attack with no fight on starts
one (a player's screen attack, a monster striking a character, or a player saying "I attack Grisk!" to
the AI Director), and a fight ends by itself when no foe in it is left standing.

Every rule is a default, not a rail. The Director's `override_rule` tool, or **Switch off** / **Undo** on
the DM's Adventure tab, switches a rule off before it happens or undoes it after (the fight called off,
the foe back, the quest reopened, the XP taken back). The same card turns the rules off altogether.

**Fitting fights.** Each place's fight is fitted once to the party at the table (`engine/scale.js`, the
5e encounter budget): the number of foes in each group first, then their hit points. A lone named foe
stays one. The DM chooses *fitted to the party*, *only made easier* or *as written*; the Director's
briefing says what changed ("Drowned villager: 5 (written 3)").

**The Engine's answers.** Every action, from any screen or tool, goes through `attempt()` and comes back
one of three ways: done (with anything it assumed to make it work, "Assumed: "Goblin scot 2" is Goblin
scout 2"), nothing changed (a note: the fight is already on, it is not their turn), or a real no that
lists the valid choices.

`--part 4` plays **The Ashen Crown, session 1** with three of its ready-made heroes: the opening turn
must start the fight on the burning bridge, then the clues in the wreckage, Oakhurst, Father Lucan, an
Insight check on the bailiff, the road to Blackreed Mill, a Stealth check on the roof and the fight with
the River Rats. `Sponge dnd part4.bat` (at the top of the repository) runs it three times.

## The Assistants

Both are the Director's screens running with no server: the Engine runs in the browser and the game
is kept on that device (the **Backup** tab downloads and loads a copy).

- **DM's Assistant**: quick-add the party (name, AC, HP, initiative, passive Perception) or build full
  characters; the encounter builder (XP thresholds and multipliers, Easy to Deadly); initiative with
  typed-in rolls; monsters run from their stat blocks with one tap per attack; conditions; the full
  SRD bestiary and rules; the adventure with notes; story seeds and DM notes.
- **Players' Assistant**: the builder, the character sheet (tap any ability, save or skill to roll),
  attacks with damage, spells and slots, class abilities, rests, XP and levelling up, dice, and the
  rules.

## Rebuilding

```
python3 dnd/tools/build_srd.py /path/to/5e-database/src/2014/en   # the rules data
npm i --no-save esbuild && node dnd/assistants/build.mjs           # the two Assistants
cd dnd/director && npm test                                       # the Engine's tests
```
