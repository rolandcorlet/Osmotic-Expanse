# The converter prompt

Paste everything below the line into a chat with Claude (or another capable AI), then paste or attach your material:
a core rule book, a players' handbook, a monster book, a campaign, or just a few ideas. It writes the module files one
at a time. Save each file under `modules/<module-id>/`, then press **Check the module** on the host's Game tab
(or run `node tools/convert.mjs --check <module-id>`).

The same guide drives the **Converter** tab on the host console and `node tools/convert.mjs`, which do all of this
automatically with the AI you chose on the AI tab.

---

You are a game designer converting material into a module for the Skeleton, a game engine with an AI Director. The Skeleton has a fixed file format and a choice of dice systems; everything else (the dice it uses, the world, the stats, the classes, the monsters, the stories) comes from the module you write.

You may be given any of these:
- a core rule system, a players' handbook, a monster book, or a campaign from another game (convert it);
- a few ideas from a creative person (invent a whole new game from them);
- an existing Skeleton module plus new material (extend it).

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
- "highest-die": Highest die (Forged in the Dark). For Blades in the Dark and the games forged from it (Scum and Villainy, Band of Blades), and any game that reads only the best die. Options and defaults: {"sides":6,"partial":4,"damageAdd":"degrees","modCap":3}. Stats 0 to 4; skills 0 to 4; difficulties 2 to 7 (default ladder: Easy 4, Standard 6, Desperate 7); a creature attack's "rating" 0 to 8; a creature's "defence" 2 to 7; a condition's "mod" -3 to 3.
- "roll-keep": Roll and keep (d10s). For Legend of the Five Rings and 7th Sea (first editions), and other roll-and-keep games. Options and defaults: {"sides":10,"explode":10,"damageAdd":"margin","modCap":3}. Stats 1 to 6; skills 0 to 6; difficulties 5 to 50 (default ladder: Easy 10, Standard 15, Hard 20, Very hard 25, Heroic 30); a creature attack's "rating" 2 to 12; a creature's "defence" 5 to 45; a condition's "mod" -3 to 3.

THE d6 POOL IN FULL (the default)
- Every roll is a pool of six-sided dice: a stat (1 to 5 dice) plus a skill (0 to 3 dice) plus or minus
  modifiers (conditions, strain, help, gear). Modifiers together never go past +5 or -5, and a pool is
  never smaller than 1 die.
- Add up the dice. A 1 scores nothing. Each 1 is a SNAG; two or more 6s and no 1s is a SURGE.
- Meet or beat the difficulty (8 easy, 12 standard, 16 hard, 20 extreme, 24 legendary). What is left over is
  OVERFLOW. Damage = overflow + weapon - soak, at least 1.

CHOOSING THE DICE
- When converting a game whose dice match one of THE SYSTEMS, keep them: D&D and Pathfinder -> "d20"; Call of Cthulhu, RuneQuest, Warhammer -> "percentile"; Powered by the Apocalypse and Traveller -> "2d6"; World of Darkness, Shadowrun, Year Zero -> "success-pool" (set sides, target and the rest to match); Fate -> "fate"; Savage Worlds and Cortex-like games -> "step"; GURPS -> "roll-under"; Blades in the Dark and other Forged in the Dark games -> "highest-die"; Legend of the Five Rings and 7th Sea (roll and keep) -> "roll-keep". Then keep the source's own numbers (its difficulties, scores, bonuses, armour classes, percentages, hit points, weapon dice), only merging and simplifying.
- When the designer asks for a particular system, use it, and rescale the source's numbers into its ranges.
- When nothing matches, or when inventing from ideas, choose what suits the game (the d6 pool when unsure) and rescale with the tables below.
- Write the choice in rules.json "dice": { "system": "...", plus any options that differ from the defaults }. Use that system's default ladder unless the source has its own difficulty names. Every number in the module (stats, skills, ladder, conditions, strain penalties, hazard difficulties, creature ratings and defences) must be in the chosen system's ranges.

HOW TO CONVERT
Keep what makes the source itself: its names, its mood, its signature tricks. Change only the arithmetic, so it runs on the Skeleton.
- Classes, careers, paths, playbooks -> callings. Races, species, kins, backgrounds, homeworlds -> origins.
- Spells, feats, talents, powers, moves -> abilities: give each a cost (usually "1 Strain", "2 Strain", or "once a scene"), an optional roll (a stat and skill), and an effect in one or two sentences the Engine and the Director can follow.
- Any resource the source tracks (mana, spell slots, sanity, stress, heat, luck, fatigue) -> the strain track, or an ability's cost. There is one strain track; name it after the source's most important resource.
- Equipment -> gear. A weapon's value is a number (d6 pool: 1 for a knife to 5 for a cannon) or the source's damage dice ("1d8+2"). Armour's soak is 0 to 3; heavy armour may also add 1 or 2 to defence (with d20, armour class goes in defence instead).
- Skills: 6 to 16 of them. Merge narrow skills (Lockpicking and Traps become Tinker). Every skill uses one stat.
- Stats: 3 to 6. Merge the source's attributes if it has more (Strength and Constitution may become Body).
- Monsters: keep their names, looks, tactics and special abilities. With the source's own dice, keep its numbers (an attack bonus becomes the attack's "rating", armour class becomes "defence", damage dice become "weapon", hit points become "health"). On the d6 pool, re-derive them from the tables below.
- A campaign or adventure -> one adventure file per chapter or self-contained story. Locations -> sites with exits between them. Encounters -> creatures placed in sites (hidden when they ambush). Traps and skill challenges -> hazards. Plot goals -> quests. Countdowns and rising threats -> clocks. Important people -> npcs.
- What the source says happens by itself -> a place's "rules", so the Engine carries it out and the Director only narrates it. Write one wherever the source says "when" or "if": an ambush that springs on a failed sneak (when "fail sneak", do "fight" or "reveal"); followers who flee when their leader falls (when "down", who the leader, do "flee"); a countdown that moves on arrival or each round (do "tick" with the clock); a quest done when a creature falls or a place is cleared (do "quest"); reinforcements (do "add"); a reward for a cleared place (do "xp"). Give each rule a short "say" for the Director. Use only the events, conditions and effects the template lists; anything else stays in the place's text.
- Size each place's fight for the smallest party the adventure is written for (its "party" line, such as "3 to 4 investigators"): its creatures together should weigh no more than about twice the party, where a creature weighs 1, 2, 4, 7 or 11 for tiers 1 to 5 and a character weighs 1, plus half for each level past the first. A big crowd (a choir, a mob, a swarm) can be the scene's backdrop in the notes instead of creatures that fight. The Engine fits fights to a smaller or bigger party by itself.
- Write every description in your own words. Do not copy long passages from the source; a short phrase is fine. Rules text should be short, plain and exact.

WHAT MAKES AN ADVENTURE PLAY WELL WITH THE AI DIRECTOR (learned from test games; the checker gives advice on each)
- Every quest says where it ends: "doneAt" lists the site or sites where the story finishes it. Without it the Director cannot tell when to mark the quest done, and it stays open.
- A fight needs something to fight. If the source says "roll initiative" for a disaster (an avalanche, a flood, a collapse), write it as a hazard (a roll and a cost) or a rule that says what happens, not a fight. Only creatures placed at a site, or added by a rule, can fight.
- Every hazard's "fail" has a cost the Engine can pay: a number ("Lose 3 Health") or a condition ("Gain shaken"). Never only words like "the crush".
- Anyone the party is to rescue, protect or escort is an npc (in "npcs" and the site's notes), not a creature: creatures are what the party may fight, and the Director will fight them.
- Every creature a site's text names is placed somewhere (hidden if it lurks), or it is only scenery: the Director brings in what it reads.
- Every site can be reached from the start by its exits, and exits go both ways unless the way back is truly closed.
- Keep the source's names, but no example text from another game: every name in a module belongs to that module.

NUMBERS FOR THE d6 POOL (when moving a game onto the d6 pool, or inventing one for it, use these so every module plays alike)
- Difficulty: d20 DC 10 or under -> 8; 11-13 -> 12; 14-16 -> 16; 17-19 -> 20; 20 or more -> 24. Percentile: easy (+20) -> 8, normal -> 12, hard (-20) -> 16, very hard (-40) -> 20.
- Stats (1 to 5 dice): a 3-18 score: 3-7 -> 1, 8-11 -> 2, 12-14 -> 3, 15-17 -> 4, 18+ -> 5. A -1..+5 modifier: -1/0 -> 2, +1/+2 -> 3, +3/+4 -> 4, +5 -> 5. A percentile characteristic: under 35 -> 1, 35-49 -> 2, 50-64 -> 3, 65-79 -> 4, 80+ -> 5.
- Skill ranks (0 to 3): untrained -> 0; trained/proficient -> 1; expert -> 2; master -> 3. Percentile skill: under 40 -> 0, 40-59 -> 1, 60-79 -> 2, 80+ -> 3.
- A starting character rolls 3 to 6 dice for what they are good at (a die averages 3.3, because a 1 scores nothing), so Standard (12) is a fair challenge and Hard (16) is a stretch.
- Creature tier from the source's level or challenge rating: CR 1 or under -> 1; CR 2-4 -> 2; CR 5-10 -> 3; CR 11-16 -> 4; CR 17+ -> 5. A minion -> 1, a soldier -> 2, a lieutenant -> 3, a boss -> 4, a legend -> 5.
- By tier:   tier 1: health 6-12, defence 10-11, soak 0-1, attack 3-4 dice, weapon 1-2, xp 1-2.
             tier 2: health 14-20, defence 12-13, soak 1, attack 5 dice, weapon 2-3, xp 3-4.
             tier 3: health 24-36, defence 13-14, soak 1-2, attack 6 dice, weapon 3, xp 6-8.
             tier 4: health 40-60, defence 15-16, soak 2-3, attack 7-8 dice, weapon 3-4, xp 10-14.
             tier 5: health 70-120, defence 17-18, soak 3-4, attack 9-10 dice, weapon 4-5, xp 18-25.
  From d20 hit points, health is about HP / 2.5 (stay inside the tier's range). A weapon value is about the source's average damage / 3 (1 to 6).
- Character health: base 6-12, plus a stat x 2, plus 2 a level, so a starting character has 12-20.
- Strain: max 5 to 8, with a -1 die penalty around half way and -2 near the top.
- Experience: 10 a level is a good default; a short adventure is worth about one level.

INVENTING FROM IDEAS
Build one strong, original game around the ideas: a clear premise, a world with one big mystery, characters with something to want, creatures with a reason to exist, and a first adventure that can be played in one evening (3 to 5 sites, 1 or 2 fights, a hazard, a rule or two that make the world react by itself, a choice that matters at the end). Do not borrow names, places or characters from published games, books or films. Give the module terms that fit its world (what it calls a snag, a surge, health and strain).

WRITING THE FILES
- Write exactly one JSON object for the section you are asked for, matching its template. No comments, no trailing commas, no text before or after it.
- Ids are lower-case-with-dashes and unique. Any id you mention (a stat, skill, gear, ability, creature, site) must exist in the sections already made or in the one you are writing.
- Fill every field the template shows unless it is marked optional (a "?" after the key in the template; write the key without the "?").
- Keep text short: a sentence or two for an about or an effect; a short paragraph for a place's read-aloud text.


HOW THIS CHAT WORKS
1. First, tell me in a few lines what you understood: the game's premise, its tone, and how its main mechanics will map
   onto the Skeleton (which dice system, and what becomes the stats, the strain track, the callings, the abilities). Ask me at most three
   questions if something important is unclear; otherwise carry on.
2. Then write the files in this order, one per reply, each in its own ```json block headed with its file name:
   module.json, rules.json, handbook.json, bestiary.json, lore.json, then one adventures/<id>.json for each adventure.
3. After each file, say in one line what you made and wait for me to say "next" (or to ask for changes).
4. At the end, list anything from the source you could not fit, and how you handled it.

THE TEMPLATES (one per file)
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

AN EXAMPLE: the sample module's rules.json
```json
{
  "stats": [
    { "id": "brawn", "name": "Brawn", "about": "Strength, endurance, holding your breath against the cold." },
    { "id": "grace", "name": "Grace", "about": "Balance, quick hands, moving without a sound." },
    { "id": "wits", "name": "Wits", "about": "Noticing, reasoning, remembering the old city's ways." },
    { "id": "nerve", "name": "Nerve", "about": "Courage, will, keeping your head when the lamps go out." }
  ],
  "statPoints": { "start": 1, "spend": 6, "max": 4 },
  "skills": [
    { "id": "fight", "name": "Fight", "stat": "brawn", "about": "Hook, knife and fist, up close." },
    { "id": "swim", "name": "Swim", "stat": "brawn", "about": "Moving fast or far in water, fighting a current." },
    { "id": "sneak", "name": "Sneak", "stat": "grace", "about": "Unseen, unheard, through narrow glass." },
    { "id": "shoot", "name": "Shoot", "stat": "grace", "about": "Harpoon, sling and thrown line." },
    { "id": "sense", "name": "Sense", "stat": "wits", "about": "Seeing what moves in dark water; hearing the glass." },
    { "id": "mend", "name": "Mend", "stat": "wits", "about": "Fixing lamps, lines and divers." },
    { "id": "lore", "name": "Lore", "stat": "wits", "about": "The drowned city's guilds, songs and traps." },
    { "id": "talk", "name": "Talk", "stat": "nerve", "about": "Bargain, bluff, calm a frightened friend." }
  ],
  "skillPoints": { "spend": 6, "max": 2 },
  "ladder": [
    { "at": 8, "name": "Shallow", "about": "Easy: most divers manage it." },
    { "at": 12, "name": "Standard", "about": "A trained diver's work." },
    { "at": 16, "name": "Deep", "about": "Hard: the best on the dock." },
    { "at": 20, "name": "Abyssal", "about": "Extreme: a story told for years." },
    { "at": 24, "name": "Legendary", "about": "Once in a generation." }
  ],
  "snag": {
    "effect": "Each Crack (a 1) marks 1 Strain, even on a success.",
    "table": [
      { "snags": 1, "name": "Slip", "effect": "Drop something, lose your footing, or make a noise." },
      { "snags": 2, "name": "Tangle", "effect": "You are Snared until you spend an action to cut free." },
      { "snags": 3, "name": "Blackout", "effect": "The water closes in: lose 1d6 Breath." }
    ]
  },
  "surge": {
    "effect": "A Gleam (two 6s and no 1s): on an attack the weapon counts twice. On any other roll, choose one bonus.",
    "options": [
      "Do it in half the time.",
      "Find something worth salvaging.",
      "Learn one true thing about this place.",
      "An ally gains +2 dice on their next roll."
    ]
  },
  "health": { "name": "Breath", "base": 8, "stat": "brawn", "perStat": 2, "perLevel": 2 },
  "strain": {
    "name": "Strain",
    "max": 6,
    "penalties": [ { "at": 3, "dice": -1 }, { "at": 5, "dice": -2 } ],
    "atMax": "Breakdown: you are Shaken until you rest, and your Strain drops to 3."
  },
  "defence": { "base": 8, "stat": "grace", "note": "Armour can add to it." },
  "initiative": { "stat": "wits", "skill": "sense" },
  "combat": {
    "actionsPerTurn": 2,
    "actions": [
      { "id": "strike", "name": "Strike", "cost": 1, "does": "Attack once with a weapon." },
      { "id": "move", "name": "Move", "cost": 1, "does": "Swim or climb to somewhere close." },
      { "id": "brace", "name": "Brace", "cost": 1, "does": "+2 to your defence until your next turn." },
      { "id": "steady", "name": "Steady", "cost": 1, "does": "Clear 1 Strain, or help a friend clear Shaken (Standard Nerve + Talk)." },
      { "id": "use", "name": "Use", "cost": 1, "does": "Use an ability, a lamp or a tool." }
    ]
  },
  "conditions": [
    { "id": "shaken", "name": "Shaken", "effect": "-1 die on every roll.", "dice": -1, "ends": "A rest, or a friend's Steady action." },
    { "id": "snared", "name": "Snared", "effect": "-1 die, and you cannot move.", "dice": -1, "ends": "Spend an action to cut free." },
    { "id": "bleeding", "name": "Bleeding", "effect": "Lose 1 Breath at the start of each of your turns.", "ends": "A Standard Mend roll." },
    { "id": "blinded", "name": "Blinded", "effect": "-2 dice on anything that needs sight.", "dice": -2, "ends": "Light, or the end of the scene." }
  ],
  "rest": {
    "short": "A few minutes on a ledge with air: recover half your Breath and clear 2 Strain. The Tide ticks once.",
    "long": "A night on the dock: recover all Breath, clear all Strain and all conditions."
  },
  "advancement": {
    "xpPerLevel": 10,
    "maxLevel": 10,
    "perLevel": "Each Dive rank: +2 Breath and +1 skill rank (max 3). Every third rank: +1 to a stat (max 5)."
  },
  "rulings": [
    { "q": "Can two divers roll together?", "a": "One rolls. Each helper adds 1 die, at most +2, and shares any Cracks." },
    { "q": "What happens at 0 Breath?", "a": "You are drowning: you can only cling and hope. A friend can haul you up with a Standard Brawn + Swim roll." }
  ]
}
```
