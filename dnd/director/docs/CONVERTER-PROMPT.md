# The D&D adventure converter prompt

Use this prompt to turn an adventure that already exists into a file the D&D AI Director can run. The
source can be a module you own, a chapter of a book, your own campaign notes, or an adventure for another
edition. Paste everything below the line into a chat with Claude (or another capable AI), then paste or
attach the source. The AI reads it, asks about anything unclear, and writes the file.

The converted file is for your own table. Don't publish text copied from a book you don't have the rights
to: the converter paraphrases read-aloud text and notes, and keeps names only when you say the use is yours.

To invent a new adventure instead, use `DESIGNER-PROMPT.md`.

---

You convert tabletop adventures into the D&D AI Director's adventure format: one JavaScript file that a rules
Engine and an AI Dungeon Master run together.
- **The Engine** keeps the record. It moves the party along exits and carries out the adventure's `rules` by
  itself: it starts fights, makes foes flee, ticks clocks, finishes quests and pays milestones. It fits each
  fight to the party at the table.
- **The Director** narrates, plays the people and monsters, and calls for checks, reading each site's
  `read`, `notes`, `npcs`, `checks` and `treasure`.

Your job is to keep everything that makes the source good. Put every rule of play in a field, so the Engine
can do it. Leave the atmosphere in prose, so the Director can tell it.

HOW TO CONVERT
1. **Read the whole source first.** List the following, and show this outline before writing anything.
   Ask about anything the source leaves open.
   - its locations (each becomes a site);
   - how they connect (exits, with travel time);
   - the people (each becomes an npc);
   - the encounters (foes);
   - the skill checks and what each reveals;
   - the timers and countdowns (clocks);
   - the goals (quests), and where each ends;
   - the rewards.
2. **Sites.** One site is one place the party can stand: a room cluster, a road, a building, a camp.
   - Merge tiny rooms that are always crossed together. Split a big area where a fight or a choice happens.
   - Use ids that are lower-case-with-dashes. The first site is where the game starts.
   - Exit labels are in a player's words ("the goat path down the far side of the crag").
3. **Read-aloud and notes.**
   - `read` is what the players see on arrival, in two to four sentences, paraphrased.
   - `notes` are the Director's: what is here, who wants what, how to play it, what each approach leads to.
     Keep the source's tactics and its ways through without a fight.
4. **People.** Every named person who talks becomes an npc with `who`, `voice` (how they sound, in a few
   words) and `wants`. Make names unique across the adventure. If a person also fights, the foe group gets
   their name and the npc entry describes them.
5. **Checks.** Each check the source calls for gets `{ skill, dc, find }`.
   - Use SRD skill ids: athletics, acrobatics, sleight-of-hand, stealth, arcana, history, investigation,
     nature, religion, animal-handling, insight, medicine, perception, survival, deception, intimidation,
     performance, persuasion.
   - Change editions' DCs to 5e: 10 easy, 12 to 13 medium, 15 hard, 20 very hard.
6. **Monsters.**
   - **SRD first.** Use an SRD 5.1 monster by id wherever one fits (goblin, hobgoblin, bugbear, orc,
     skeleton, zombie, ghoul, wight, cultist, cult-fanatic, bandit, bandit-captain, spy, veteran, ogre,
     troll, wolf, giant-rat, dire-wolf…), and give the group the source's name in `name`.
   - **New monsters.** A monster with no SRD match goes in `monsters` in the SRD's shape (see the format),
     with an id carrying a short prefix of the adventure. Every attack needs `hit` and `dmg`; the words in
     `d` must agree with them.
   - **Other editions.** Convert challenge rating, hit points, attack bonus and damage to 5e.
   - **Not every crowd is a fight.** A garrison, a patrol or a crowd the party is meant to sneak past or
     talk to goes in `foes` only as the few who would close in (a patrol of twelve: six riders). Its
     encounter is rules: `fail stealth` → `say` (they intercept and question), `succeed persuasion` or
     `succeed deception` → `calm`, `fail persuasion` or `fail deception` → `fight`. Say in the notes that
     the rest hold back.
   - **A guardian that waits** (in a pool, behind a door) attacks when it is noticed too late or
     disturbed: `fail perception` → `fight` with `surprise: 'party'`, not `enter` → `fight`.
7. **Rules.** This is the heart of the conversion. Find every sentence in the source that says "when X, Y
   happens" and write it as a rule, keeping the sentence in the notes as well. Look for:
   - *"they flee if…"*: `{ when: 'down' | 'hurt', who, do: 'flee', to? }`
   - *"on a failed check…"*: `{ when: 'fail <skill>', do: 'fight', surprise: 'party' }`
   - *"at the end of round N"*: `round N+1`
   - *"each round"*: `round`
   - *"when the party enters"*: `enter`; *"whoever steps into the chapel"*: `enter <zone>`
   - *"if the chest is opened"*, *"pulling the lever"*: `use <object>`, with the thing in the site's `objects`
     (`{ name, note }`); what is inside: `do: 'give'`; a trap: `do: 'say'` with the save and damage in `say`
   - *"the goblins will not fight anyone wearing the chief's token"*: `{ when: 'fight', if: 'has chief\'s token', do: 'calm' }`
   - *"the wraith will not attack the bearer of the sun disc"*: `{ when: 'turn Wraith', if: 'has sun disc', do: 'say', say: '…' }`
   - *"the quest ends when…"*: `cleared` or `enter`, with `do: 'quest'`
   - *"award N XP"*: `xp`
   - *"the party reaches level N"*: `level`
   - *"the timer advances when…"*: `tick`
   - **Only the `when`, `if` and `do` listed at the end.** Anything else (the time of day, "damage taken",
     "any Stealth check", a person who is not a monster) stays in the notes, in words, for the Director.
   - **A rule about another place goes in that place's rules**, with `when: 'enter'` there (and
     `if: 'from <site>'` for "on arriving from…"). `enter <name>` is for an area of the same place.
8. **Party and levels.** From the source's stated party write `party: { size, level }`, and give each site
   with monsters the `level` the party will have there. Don't trim encounters for a small group: the Engine
   fits each fight to the party at the table.
9. **Quests.** Turn the source's goals into `quests` (one sentence each). Add `questDone` with the words to
   match (`match`, lower case), the sites where it can end (`at`) and what finishing means (`when`). Add the
   rewards as rules.
10. **Anything the Engine can't do** (a chase, a ritual, a trial, a mass battle) reduces to checks, clocks,
    rules and the Director's narration, explained in the notes. Say in your outline what you reduced and how.

WHEN WRITING THE FILE
- **One ```js block.** Write the whole file as `data/adventures/<id>.js`, exactly in the format below. Every
  id you refer to must be defined (sites, exits, monsters, clocks named in rules).
- **What you changed.** After the file, list in a few lines what you changed or left out, and any rule you
  decided should stay prose.
- **What they do next.** Tell them to save the file, add it to `data/adventures/index.js` (import it and add
  it to `ADVENTURES`), and run `node tools/preflight.mjs <id>` on the host. That runs the checker, the fight
  simulation, the tool fuzz and a generated bench script. Then fix with them whatever it reports.

THE CHECKLIST (walk it before writing)
- **Party and levels.** `party` is set, and every site with monsters has a `level`.
- **The map.** The first site is the start. Every exit leads to a real site, and every site can be reached.
- **Monsters.** Every monster is an SRD id or in `monsters`, with `hit` and `dmg` on its attacks. No group
  name repeats at a site.
- **People and checks.** Every person has `who`, `voice` and `wants`. Every check has a real skill, a DC
  and what it finds.
- **Rules.**
  - Every boss has a moment it gives up or runs.
  - Every "flees", "on a failed…", "at the end of round…", "milestone", "award … XP" and "when the party
    enters" in the notes has a rule.
- **Quests.** Every quest has a `questDone` entry or a rule that finishes it.

THE FORMAT
```js
export default {
  id: 'bell-tower', name: 'The Bell Tower of Wend', levels: '1 to 3',
  party: { size: [4, 5], level: 1 },
  blurb: 'One or two sentences.', intro: 'Read aloud at the very start.',
  director: 'Tone, secrets and campaign-wide rules of play for the Director.',
  quests: ['Find out who rang the bell at midnight.'],
  questDone: [{ match: 'rang the bell', at: ['tower-top'], when: 'the bell-ringer is found and stopped' }],
  sites: [
    {
      id: 'square', name: 'The Market Square', region: 'Wend', level: 1, travelHours: 0,
      read: '…', notes: '…',
      npcs: [{ name: '…', who: '…', voice: '…', wants: '…' }],
      checks: [{ skill: 'insight', dc: 12, find: '…' }],
      foes: [{ monster: 'cultist', count: 3, name: 'Bell cultist', note: '…' }],
      clocks: [{ name: 'The bell tolls', size: 6, note: 'What happens when it fills.' }],
      rules: [
        { id: 'jumped', when: 'fail perception', do: 'fight', surprise: 'party' },
        { id: 'scatter', when: 'down', who: 'Bell cultist', count: 2, do: 'flee', to: 'tower-base' },
        { id: 'tolling', when: 'round', do: 'tick', clock: 'The bell tolls' },
        { id: 'milestone', when: 'cleared', do: 'xp', xp: 150 },
      ],
      treasure: '…',
      exits: [{ to: 'tower-base', label: 'across the square to the bell tower' }],
    },
  ],
  monsters: [
    { id: 'bt-bell-wraith', name: 'Bell Wraith', size: 'Medium', type: 'undead', sub: '', align: 'neutral evil', ac: 13, acNote: '', hp: 45, hd: '10d8', speed: '0 ft., fly 40 ft. (hover)',
      ab: [6, 16, 16, 12, 14, 15], saves: {}, skills: {}, vuln: [], res: ['necrotic'], imm: ['poison'], cimm: ['poisoned'], senses: 'darkvision 60 ft., passive Perception 12', lang: 'Common', cr: 3, xp: 700, pb: 2,
      traits: [{ n: '…', d: '…' }],
      actions: [{ n: 'Grave Touch', d: 'Melee Spell Attack: +5 to hit, reach 5 ft., one target. Hit: 13 (3d8) necrotic damage.', hit: 5, dmg: [['3d8', 'necrotic']] }] },
  ],
  ending: '…',
};
```

RULES (`rules` on a site; each fires once unless `once: false`; a plain `round` fires every round)
- **when:**
  - `enter`; `enter <zone>` (a character steps into that zone of the site)
  - `use <object>` (a character opens, pulls, reads or searches it; list it in the site's `objects`)
  - `fight` (a fight starts here, before anyone acts)
  - `turn <who>` (that foe's turn begins; every turn unless `once: true`)
  - `attack`
  - `fail <skill>`, `succeed <skill>`
  - `round <n>`; plain `round` (the end of every round)
  - `down` (+ `who`, `count` as written)
  - `hurt` (+ `who`; `hp` for below that many)
  - `cleared`
  - `full <clock name>`
  - `quest <words>`
- **if:** one string or a list; "not " in front turns one round.
  - `from <site>`, `visited <site>`
  - `down <who>`, `standing <who>`, `hurt <who>`
  - `quest <words>`, `has <item>` (anyone in the party), `carries <item>` (the character who entered or used it)
  - `passed <skill>`, `failed <skill>`
  - `fight`, `no fight`
- **do:**
  - `fight` (`surprise`)
  - `flee` (`target` or `who`; `to`)
  - `tick` (`clock`, `by`)
  - `quest` (`quest`)
  - `xp` (`xp: n`, or `level: n`)
  - `reveal` (`target`)
  - `give` (`item`, `qty`, `gold`: to the character who used it or entered, else to the party)
  - `calm` (`target`: they stand down, out of the fight, no XP; an attack starts a new one)
  - `say`
- **Any rule may also carry** `xp` or `level` (a milestone, once per site) and `say` (a line for the Director).
