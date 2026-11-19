# D&D 5e AI Director

The D&D 5e versions of the project's apps, built on the free **System Reference Document 5.1**
(Creative Commons Attribution 4.0). Nothing here copies the Player's Handbook, Dungeon Master's Guide
or Monster Manual; every rule, class, spell, monster and item comes from the SRD.

| Folder | What it is |
|---|---|
| `director/` | **The AI Director for D&D.** A small server you run on the table's computer: the DM's console (`/host`), each player's phone (`/play`) and a shared screen (`/table`). An AI can run the game (Co-pilot or Auto) through a rules Engine that keeps every number honest. |
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
4. Players open the player link on their phones, type their name and build a character.
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

### The adventure

**The Lantern of Thornwick Ford** (levels 1 to 3) is written for this project: eight places from a
village inn to a drowned chapel, with read-aloud text, DM notes, people with voices and wants,
checks and what they reveal, treasure, SRD encounters and XP milestones. A blank **Your own campaign**
start is there too; write your own side quests on the **Seeds** tab and the AI weaves them in.

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
wrong player in a fight, a stalled fight, or an error. Style notes and an expected tool not used are
reported but not gated. `--fake` runs it with a stand-in that only narrates, to check the bench.

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
