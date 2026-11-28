# The module format (skeleton-module/1)

A game on the Skeleton is a **module**: a folder under `modules/` with one JSON file per section.
The Engine, the AI Director, the screens, the validator and the converter all read this format.
`example/saltglass/` is a complete working example.

```
modules/<module-id>/
  module.json        who the game is: name, tone, what the table calls things
  rules.json         stats, skills, difficulty ladder, snags and surges, health, strain, combat, conditions
  handbook.json      origins, callings, abilities, gear, character creation, ready-made characters
  bestiary.json      creatures
  lore.json          the world and a glossary
  adventures/*.json  one file per adventure or campaign chapter
```

Check a module with `node tools/convert.mjs --check <module-id>` or the **Check the module** button on the host's Game tab.

The check also gives **advice**: things that are valid but made the AI Director stumble in test games (a quest with
no `doneAt`, a hazard whose failure has no number or condition, a fight promised where nothing can fight, someone to
rescue placed as a creature, a creature named but never placed, a site nobody can reach). Advice never stops a game;
fix it before a bench.

## The dice: choose a system

A module chooses its dice in `rules.json`:

```json
"dice": { "system": "d20", "perRank": 2 }
```

Leave `dice` out for the d6 pool. Each system has options (shown with their defaults below) and its own sensible
ranges for stats, skills, difficulties, creature attack ratings and defences, and modifiers; the validator checks the
module's numbers against them. `node tools/dice-lab.mjs --system d20` (or `--module <id>`) prints the chance of
success for every pool and difficulty, to tune a game by.

```text
THE DICE
A module chooses its dice system in rules.json ("dice": { "system": "..." }). Without one it uses the d6 pool.
Whatever the system, a roll is a stat plus a skill plus modifiers against a DIFFICULTY from the module's ladder;
every system has a SNAG (its penalty: each marks 1 strain) and a SURGE (its bonus: on an attack the weapon counts
twice), and damage is the weapon (a number, or dice such as "1d8+2"), plus how well the roll went if the system
says so, minus the target's soak, at least 1.

THE SYSTEMS
- "d6-pool": d6 pool (the Skeleton's own). For The Osmotic Expanse, Saltglass; any game that wants dice that pile up as you get better. Options and defaults: {"modCap":5,"damageAdd":"margin"}. Stats 1 to 5; skills 0 to 3; difficulties 2 to 40 (default ladder: Easy 8, Standard 12, Hard 16, Extreme 20, Legendary 24); a creature attack's "rating" 1 to 15; a creature's "defence" 2 to 40; a condition's "mod" -5 to 5.
- "d20": d20 + modifier. For D&D, Pathfinder, the OSR, Starfinder, and most d20 games. Options and defaults: {"statMode":"score","perRank":2,"crit":20,"fumble":1,"autoCrit":true,"damageAdd":"none","modCap":10}. Stats 1 to 30; skills 0 to 4; difficulties 1 to 40 (default ladder: Very easy 5, Easy 10, Medium 15, Hard 20, Very hard 25, Nearly impossible 30); a creature attack's "rating" -5 to 25; a creature's "defence" 5 to 35; a condition's "mod" -10 to 10.
- "percentile": Percentile (roll under). For Call of Cthulhu, RuneQuest and Basic Roleplaying, Warhammer Fantasy, Delta Green. Options and defaults: {"fumbleFrom":96,"extremeDiv":5,"levels":"fractions","damageAdd":"degrees","modCap":60}. Stats 1 to 99; skills 0 to 99; difficulties -60 to 90 (default ladder: Easy -20, Regular 0, Hard 20, Very hard 40); a creature attack's "rating" 1 to 99; a creature's "defence" -40 to 60; a condition's "mod" -60 to 60.
- "2d6": 2d6 + modifier. For Powered by the Apocalypse (Apocalypse World, Dungeon World, Monster of the Week), Traveller. Options and defaults: {"partial":3,"damageAdd":"none","modCap":4}. Stats -3 to 5; skills 0 to 3; difficulties 2 to 16 (default ladder: Easy 6, Routine 8, Standard 10, Hard 12, Formidable 14); a creature attack's "rating" -3 to 8; a creature's "defence" 2 to 16; a condition's "mod" -4 to 4.
- "success-pool": Pool of successes. For World of Darkness and Vampire (d10, 8+), Shadowrun (d6, 5+), Year Zero games (d6, 6s), Blades-like pools. Options and defaults: {"sides":10,"target":8,"explode":10,"onesCancel":false,"snagOnes":false,"surgeExtra":3,"damageAdd":"degrees","modCap":5}. Stats 1 to 6; skills 0 to 5; difficulties 1 to 10 (default ladder: Easy 1, Standard 2, Hard 3, Very hard 4, Extreme 5); a creature attack's "rating" 1 to 20; a creature's "defence" 1 to 8; a condition's "mod" -5 to 5.
- "fate": Fate dice (4dF). For Fate Core, Fate Accelerated, and games on the Fate ladder. Options and defaults: {"style":3,"damageAdd":"margin","modCap":4}. Stats 0 to 5; skills 0 to 5; difficulties -2 to 8 (default ladder: Mediocre 0, Average 1, Fair 2, Good 3, Great 4, Superb 5, Fantastic 6); a creature attack's "rating" 0 to 8; a creature's "defence" -2 to 8; a condition's "mod" -4 to 4.
- "step": Step dice (d4 to d12). For Savage Worlds, Cortex-style games, and any game where better means a bigger die. Options and defaults: {"wild":6,"raise":4,"unskilled":-2,"damageAdd":"none","modCap":4}. Stats 4 to 12; skills 0 to 12; difficulties 2 to 14 (default ladder: Easy 2, Standard 4, Hard 6, Very hard 8, Heroic 10); a creature attack's "rating" 4 to 12; a creature's "defence" 2 to 14; a condition's "mod" -4 to 4.
- "roll-under": Roll under (3d6 or d20). For GURPS (3d6 under skill), old-school d20 roll-under games, and simple roll-under systems. Options and defaults: {"n":3,"sides":6,"crit":4,"fumble":17,"damageAdd":"degrees","modCap":10}. Stats 1 to 18; skills 0 to 18; difficulties -10 to 10 (default ladder: Easy -4, Average 0, Hard 2, Very hard 4, Extreme 6); a creature attack's "rating" 1 to 18; a creature's "defence" -10 to 10; a condition's "mod" -10 to 10.

THE d6 POOL IN FULL (the default)
- Every roll is a pool of six-sided dice: a stat (1 to 5 dice) plus a skill (0 to 3 dice) plus or minus
  modifiers (conditions, strain, help, gear). Modifiers together never go past +5 or -5, and a pool is
  never smaller than 1 die.
- Add up the dice. A 1 scores nothing. Each 1 is a SNAG; two or more 6s and no 1s is a SURGE.
- Meet or beat the difficulty (8 easy, 12 standard, 16 hard, 20 extreme, 24 legendary). What is left over is
  OVERFLOW. Damage = overflow + weapon - soak, at least 1.
```

## What a module may and may not change

| A module decides | The Skeleton decides |
| :-- | :-- |
| Its dice system and the system's options | Every system has a difficulty, a snag (its penalty: 1 strain each) and a surge (its bonus: an attack's weapon counts twice) |
| What everything is called (terms) | Damage = weapon (a number or dice) + what the system adds for a good roll - soak, at least 1 |
| 3 to 6 stats, 4 to 24 skills | Fights take turns in an initiative order |
| The difficulty ladder | The Engine does all arithmetic; the Director only asks |
| What a snag costs on a failure (snag table), what a surge earns (surge options) | |
| Health and strain: names, sizes, penalties; combat actions, conditions, rests, advancement | |
| Everything in the world: origins, callings, abilities, gear, creatures, adventures | |

## The templates

Each template shows every field once. `"key?"` marks an optional key (write it without the `?`); text after `//` is a note.

### module.json

```jsonc
{
  "format": "skeleton-module/1",
  "id": "saltglass",                       // lower-case-with-dashes; the folder name
  "name": "Saltglass",
  "tagline": "Salvage divers in a drowned city of glass.",
  "tone": "Wet, cold, wondrous; danger is real but the city is beautiful.",  // how the Director should sound
  "audience?": "Teens and adults",
  "credits?": "Who made it, and what it was converted from",
  "terms": {                                // what the table calls the skeleton's parts
    "difficulty": "Depth", "snag": "Crack", "surge": "Gleam",
    "health": "Breath", "strain": "Strain", "character": "Diver", "creature": "Thing below",
    "xp": "Salvage", "level": "Dive rank"
  }
}
```

### rules.json

```jsonc
{
  "dice?": { "system": "d6-pool" },           // the dice system and its options (see THE SYSTEMS); leave out for the d6 pool
  "stats": [                                // 3 to 6 stats, rated in the dice system's range (d6 pool: 1 to 5 dice)
    { "id": "brawn", "name": "Brawn", "about": "Strength, endurance, holding your breath." }
  ],
  "statPoints": { "start": 1, "spend": 8, "max": 4, "step?": 1 },   // every stat starts at 'start'; spend 'spend' more in steps of 'step'; none above 'max' at creation
  "skills": [                               // 6 to 16 skills; ranks 0 to 3 add dice to the stat they use
    { "id": "swim", "name": "Swim", "stat": "brawn", "about": "Moving fast or far in water." }
  ],
  "skillPoints": { "spend": 6, "max": 2, "step?": 1 },   // ranks (or points, or percent) to spend at creation, and the most in one skill then
  "ladder": [                               // difficulties, easiest first, in the dice system's units (its default ladder is a good start)
    { "at": 8, "name": "Easy" }, { "at": 12, "name": "Standard" }, { "at": 16, "name": "Hard" },
    { "at": 20, "name": "Extreme" }, { "at": 24, "name": "Legendary" }
  ],
  "snag": {
    "effect": "Each Crack marks 1 Strain.",
    "table": [                              // optional extra cost on a FAILED roll, by number of snags (1, 2, 3+)
      { "snags": 1, "name": "Slip", "effect": "Drop or lose something small." },
      { "snags": 2, "name": "Tangle", "effect": "You are Snared until you spend an action." },
      { "snags": 3, "name": "Blackout", "effect": "Lose 1d6 Breath." }
    ]
  },
  "surge": {
    "effect": "A Gleam: the weapon counts twice on an attack; otherwise choose one bonus.",
    "options": ["Do it in half the time.", "Learn a secret about the place.", "An ally gains +2 dice on their next roll."]
  },
  "health": { "name": "Breath", "base": 10, "stat": "brawn", "perStat": 2, "perLevel": 2 },  // max = base + stat x perStat + perLevel x (level - 1)
  "strain": {
    "name": "Strain", "max": 6,
    "penalties": [ { "at": 3, "dice": -1 }, { "at": 5, "dice": -2 } ],   // a modifier on every roll at that much strain (in the system's units: dice, +/-, percent)
    "atMax": "Breakdown: you are Shaken until you rest, and Strain drops to 3."
  },
  "defence": { "base": 8, "stat": "wits", "note?": "Difficulty to hit a character = base + stat + armour's defence bonus" },
  "initiative": { "stat": "wits", "skill?": "sense" },
  "combat": {
    "actionsPerTurn": 2,
    "actions": [ { "id": "strike", "name": "Strike", "cost": 1, "does": "Attack once with a weapon." } ]
  },
  "conditions": [                            // the states the Engine can put on anyone
    { "id": "shaken", "name": "Shaken", "effect": "-1 die on every roll.", "dice": -1, "ends": "A rest, or an ally steadies you (Standard Nerve)." }   // "dice" (or "mod"): the modifier, in the system's units
  ],
  "rest": { "short": "Recover half your Breath; clear 2 Strain.", "long": "Recover all Breath; clear all Strain and conditions." },
  "advancement": { "xpPerLevel": 10, "maxLevel": 10, "perLevel": "+1 skill rank; every 3rd level +1 stat (max 5)." },
  "rulings?": [ { "q": "Can two divers roll together?", "a": "One rolls; each helper adds 1 die (max +2)." } ]
}
```

### handbook.json

```jsonc
{
  "intro": "What the players need to know before they make a character.",
  "origins": [                               // where a character comes from; 2 to 8
    { "id": "reefborn", "name": "Reefborn", "about": "Raised on the stilt-towns.", "stats": { "brawn": 1 }, "gift": "Hold your breath twice as long." }
  ],
  "callings": [                              // what a character does; 2 to 8 (classes, careers, paths)
    { "id": "hookhand", "name": "Hookhand", "about": "Salvage fighter.", "skills": ["fight", "swim"], "gear": ["gaff-hook"], "abilities": ["brace-the-line"] }
  ],
  "abilities": [                             // special moves; callings name them by id
    { "id": "brace-the-line", "name": "Brace the Line", "level": 1, "cost": "1 Strain",
      "roll?": { "stat": "brawn", "skill": "swim" }, "effect": "Anchor an ally: they ignore the next current or push." }
  ],
  "gear": [                                  // weapons need "weapon"; armour needs "soak" (and may add "defence")
    { "id": "gaff-hook", "name": "Gaff hook", "kind": "weapon", "weapon": 3, "stat": "brawn", "skill": "fight", "about": "Hook and blade." },   // "weapon": a number, or dice like "1d8+2"
    { "id": "diving-leathers", "name": "Diving leathers", "kind": "armour", "soak": 1, "about": "" }
  ],
  "chargen": ["Choose an origin.", "Choose a calling.", "Spend stat points.", "Spend skill ranks.", "Name your character and say one thing they want."],
  "pregens": [                               // ready-made characters for a quick start; 2 to 6
    { "name": "Moll Tarrow", "origin": "reefborn", "calling": "hookhand",
      "stats": { "brawn": 4 }, "skills": { "fight": 2, "swim": 2 }, "look": "Scarred hands, quick grin.", "want": "Pay off the boat." }
  ]
}
```

### bestiary.json

```jsonc
{
  "creatures": [
    { "id": "glass-eel", "name": "Glass eel", "tier": 1,          // tier 1 (a nuisance) to 5 (a legend)
      "about": "What it is and how it lives.", "look": "What the players see.",
      "health": 8, "soak": 0, "defence": 10,                       // defence = the difficulty to hit it, in the dice system's units (d20: its armour class)
      "attacks": [ { "name": "Bite", "rating": 4, "weapon": 2, "kind": "melee", "effect?": "On a surge: Bleeding." } ],   // rating: what it rolls, in the dice system (d6 pool: dice; d20: attack bonus; percentile: percent); weapon: a number or dice
      "abilities?": [ { "name": "Clear as water", "effect": "Hard to see: Sense rolls against it are Hard." } ],
      "tactics": "How it fights and when it runs.",
      "xp": 2 }
  ]
}
```

### lore.json

```jsonc
{
  "world": "The setting in a paragraph: what the players can know.",
  "sections": [ { "title": "The Drowned City", "text": "..." } ],
  "glossary": [ { "term": "Gleam", "means": "Two 6s and no 1s." } ]
}
```

### adventures/<adventure-id>.json

```jsonc
{
  "id": "bell-under-brine", "name": "The Bell Under Brine",
  "pitch": "One sentence the players hear.",
  "level": 1, "party": "2 to 4 characters",
  "intro": "Read aloud at the start (players see this).",
  "secrets": "What is really going on (Director only).",
  "start": "dock",                            // the first site's id
  "sites": [
    { "id": "dock", "name": "Lamp Dock",
      "read": "What the players see on arrival (read aloud).",
      "notes": "Director only: what is here, who wants what, what a roll can find.",
      "exits": ["nave"],
      "creatures?": [ { "id": "glass-eel", "count": 2, "hidden": true } ],
      "hazards?": [ { "name": "Cold current", "stat": "brawn", "skill": "swim", "at": 12, "fail": "Lose 3 Breath." } ],   // at: a difficulty in the system's units
      "clues?": ["A broken lamp with a guild mark."],
      "rules?": [ { "id": "eels", "when": "fail swim", "do": "reveal", "who": "glass-eel", "say": "The current drags a diver to the eels." } ] }   // the Engine carries these out itself (engine/triggers.js): when enter | fail <stat or skill> | succeed <..> | round | down (who) | cleared | full <clock> | quest <id>; if from|visited <place>, down|standing <who>, quest <id>, passed|failed <x>, fight, no fight; do fight | flee | reveal | tick (clock) | quest | xp | add (creature, count) | say
  ],
  "rules?": [ { "id": "flood", "when": "full tide", "do": "say", "say": "The city floods." } ],   // rules that hold everywhere in the adventure
  "quests": [ { "id": "bell", "text": "Raise the glass bell.", "doneAt?": ["dock"] } ],
  "clocks?": [ { "id": "tide", "name": "The Tide", "size": 6, "ticks": "Every time the divers rest or fail loudly.", "fills": "The city floods." } ],
  "npcs?": [ { "name": "Auntie Pell", "role": "Dock boss", "want": "Her share.", "voice": "Dry, slow.", "secret": "She sold the map twice." } ],
  "ending": "How it can end, and what changes.",
  "reward": { "xp": 10, "other?": "A favour from the guild." }
}
```
