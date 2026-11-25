# Writing a D&D adventure for the AI Director

An adventure is one JavaScript file in `data/adventures/`, listed in `data/adventures/index.js`. Anything
the Engine or the bench must know for the game to come out right goes in a **field**. Mood, voice,
description and how to play a scene stay in **prose**. Every field is optional except where the format
says otherwise, and each field filled in removes a guess the Director would otherwise have to make.

Two prompts turn this guide into a design partner. **[DESIGNER-PROMPT.md](DESIGNER-PROMPT.md)** helps you
invent a new adventure, and **[CONVERTER-PROMPT.md](CONVERTER-PROMPT.md)** turns an existing one (a module,
a book chapter, your own notes) into this format. Paste either into a chat with Claude or another capable AI.

## The rules of thumb

1. **One site is one place the party can stand.** Sites join through `exits`, each with a label in words a
   player would use ("the Mill Road north, toward the old watchtower") and `travelHours` on the site.
2. **Every fight has a trigger.** Put the monsters in `foes` (SRD ids, or the adventure's own `monsters`).
   Then say how the fight starts:
   - **Default:** nothing to write. It starts when someone attacks.
   - **On sight:** `rules: [{ when: 'enter', do: 'fight' }]`.
   - **After a failed check:** `{ when: 'fail perception', do: 'fight', surprise: 'party' }`.
3. **Every "when X, Y happens" goes in `rules`, as well as in the notes.** This covers morale (who flees,
   when), clocks that tick, quests that end, milestones and ambushes. The notes say why and how it looks.
   The rules make it happen. See *Rules* below.
4. **Use the stat block's own action names.** Put custom monsters in the adventure's `monsters` with `hit`
   and `dmg` on each attack. Ids start with a short prefix of the adventure ("ac-" for the Ashen Crown).
5. **Every quest says what finishes it, where, and what it pays.**
   - `questDone: [{ match, at, when }]` says where the Director may close it.
   - A rule such as `{ when: 'cleared', do: 'quest', quest: '<words>', xp: 300 }` closes it by itself.
6. **Every named person is in `npcs`, with `who`, `voice` and `wants`.** Never give a person the name of a
   monster group, a ready-made hero or another person.
7. **Declare the party you wrote for.** Use `party: { size: [4, 5], level: 1 }`, and give each site a
   `level`. Don't hand-tune numbers for a small group: the Engine fits each fight to the party at the table.
8. **Give every check a skill, a DC and what it finds.** Write `checks: [{ skill, dc, find }]`, using
   SRD skill ids such as `perception` and `animal-handling`.
9. **Keep the adventure-wide `director` text for style, secrets and how to run the campaign.** For example:
   the three-clue rule, no railroading, who the traitor is. Mechanics go in fields.
10. **Run the checks before any GPU time** (below). Fix every error. Then give each "looks like a rule"
    note a `rules` field, or decide it stays prose.

## The format

```js
export default {
  id: 'bell-tower', name: 'The Bell Tower of Wend',          // id: lower-case-with-dashes
  levels: '1 to 3',                                          // shown when choosing an adventure
  party: { size: [4, 5], level: 1 },                         // who it is written for (fights are fitted to the real party)
  blurb: 'One or two sentences for the adventure list.',
  intro: 'Read aloud at the very start: where the party is and what is happening.',
  director: 'How to run it: tone, secrets, campaign-wide rules of play. Every Director turn sees this.',
  quests: ['Find out who rang the bell at midnight.'],       // the quests the party starts with
  questDone: [{ match: 'rang the bell', at: ['tower-top'], when: 'the bell-ringer is found and stopped' }],  // match: lower case words of the quest
  rules: [],                                                 // adventure-wide rules (rare: most belong to a site)
  sites: [
    {
      id: 'square', name: 'The Market Square', region: 'Wend', level: 1, travelHours: 0,
      map: { x: 0.3, y: 0.5 },                               // optional: its place on the travel map (0..1)
      zones: [                                               // optional: ~30 ft areas for the map (a site without gets three)
        { name: 'Fountain', x: 0.05, y: 0.3, w: 0.4, h: 0.4, entry: true, links: ['stalls'], tags: ['half-cover'] },
        { name: 'Stalls', x: 0.55, y: 0.3, w: 0.4, h: 0.4, from: ['tower-base'] },
      ],
      read: 'What the players see on arrival. Read once.',
      notes: 'For the Director only: what is here, who wants what, how to play it, what a roll can find.',
      npcs: [{ name: 'Marra Velt', who: 'the bell-keeper\'s widow', voice: 'quiet, precise, never wastes a word', wants: 'her husband\'s name cleared' }],
      checks: [{ skill: 'insight', dc: 12, find: 'Marra flinches at the word "midnight": she heard the bell too.' }],
      foes: [{ monster: 'cultist', count: 3, name: 'Bell cultist', note: 'disguised as stallholders', zone: 'stalls' }],
      clocks: [{ name: 'The bell tolls', size: 6, note: 'The bell tolls the thirteenth time: the drowned rise in the square.' }],
      rules: [
        { id: 'unmasked', when: 'succeed insight', do: 'reveal', target: 'Bell cultist', say: 'The "stallholders" are watching the tower, not their wares.' },
        { id: 'jumped', when: 'fail perception', do: 'fight', surprise: 'party' },
        { id: 'scatter', when: 'down', who: 'Bell cultist', count: 2, do: 'flee', to: 'tower-base', say: 'The last cultist runs for the tower.' },
        { id: 'tolling', when: 'round', do: 'tick', clock: 'The bell tolls' },
      ],
      objects: [{ name: 'Iron chest', note: 'Locked (DC 13); a poison needle in the lock.' }],  // things a character can use (rules: use <object>)
      treasure: 'What can be found, and when.',
      exits: [{ to: 'tower-base', label: 'across the square to the bell tower' }],
    },
  ],
  monsters: [],                                              // the adventure's own stat blocks (SRD shape, see ashen-crown.js)
  pregens: [],                                               // optional ready-made heroes: { id, role, hook, blurb, input }
  ending: 'How it can end, and what changes.',
};
```

## Rules

A rule is `{ id, when, if, do, ... }`. The Engine carries it out by itself after every change, once unless
it says `once: false` (plain `round` fires every round). The Director narrates what happened. It, or the
DM's **Switch off** / **Undo**, can override any rule with a reason, because a rule is a default, not a rail.

| `when` | sets it off |
|---|---|
| `enter` | the party arrives (the first place: when the game starts) |
| `enter <zone>` | a character steps into that zone of this place (on the map, or the Director moving them there) |
| `use <object>` | a character uses an object here: opens the chest, pulls the lever, reads the book (the Director's `use_object`, the DM's **Use** on the Adventure tab) |
| `fight` | a fight starts here, before anyone acts: how the foes meet the party is decided |
| `turn <who>` | that foe's turn begins (plain `turn`: any foe's). Every turn, unless the rule says `once: true` |
| `attack` | someone attacks before a fight is on (a fight starts anyway; a rule adds surprise or more) |
| `fail <skill>` / `succeed <skill>` | a check with that skill made here (a group check: half or more) |
| `round <n>` / `round` | round n begins ("the end of round 2" is `round 3`) / the end of every round |
| `down` | `who` is down or gone (`count`: that many of the group as written) |
| `hurt` | `who` is below half its hit points (`hp`: below that many) |
| `cleared` | no foe here is left standing |
| `full <clock>` | that clock fills |
| `quest <words>` | that quest is complete |

`if` (one string or a list; "not " in front turns one round): `from <site>`, `visited <site>`,
`down <who>`, `standing <who>`, `hurt <who>`, `quest <words>`, `has <item>` (anyone in the party, or the
party's loot), `carries <item>` (the character who entered the zone or used the object; anyone in the party
for other moments), `passed <skill>`, `failed <skill>`, `fight`, `no fight`. When a rule with `has` or
`carries` happens, the Director is told who carries the item.

| `do` | what happens |
|---|---|
| `fight` | a fight starts with everyone standing here (`surprise: 'party'` or `'foes'`) |
| `flee` | `target` (or `who`) flees; `to: <site>` sends them there instead of out of the story |
| `tick` | the clock `clock` fills by `by` (1); a clock the place sets out starts if it isn't running |
| `quest` | the quest `quest` (id or a few of its words) is complete |
| `xp` | each character earns `xp`, or `level: n` (what each still needs to reach level n) |
| `reveal` | `target` (everyone hidden here if not given) is revealed |
| `give` | `item` (with `qty`) and/or `gold` go to the character who used the object or entered the zone, else to the party's loot |
| `calm` | `target` (everyone here if not given) stands down: out of the fight, not beaten, no XP. The fight ends when nobody in it is still fighting; attacking them starts a new one |
| `say` | nothing but the line in `say`, for the Director |

Any rule can also carry `xp` or `level` (a milestone, paid once per place) and `say` (a line the Director
reads when it fires).

**Items and objects.** A chest, a lever or an altar goes in the place's `objects`, so the Director knows it
can be used and the DM gets a **Use** button for it. What happens is a rule:

```js
objects: [{ name: 'Iron chest', note: 'Locked (DC 13 thieves\' tools).' }, { name: 'Sun altar' }],
rules: [
  { id: 'chest', when: 'use iron chest', do: 'give', item: 'Silver key', gold: 40, say: 'Under the rags: a silver key.' },
  { id: 'needle', when: 'use iron chest', if: 'not carries silver key', do: 'say', say: 'A needle in the lock: DC 13 Constitution save or 1d4 poison damage and poisoned for an hour.' },
  { id: 'altar', when: 'enter Sanctum', if: 'carries sun disc', do: 'say', say: 'The altar flares; the door behind it grinds open.' },
  { id: 'token', when: 'fight', if: 'has chieftain token', do: 'calm', target: 'Goblin', say: 'They know the token and lower their spears.' },
  { id: 'recoil', when: 'turn Wraith', if: 'has sun disc', do: 'say', say: 'The wraith will not touch the bearer of the Sun Disc: it goes for someone else.' },
]
```

**Two defaults hold everywhere.** An attack with no fight on starts one (including a player saying "I attack
Grisk!" to the AI Director). A fight ends by itself when no foe in it is left standing.

## Monsters

An adventure's own monsters use the SRD's shape (see `ashen-crown.js`): `n` and `d` for each action, in
the stat block's own words. Write the words the way the books do and the Engine reads them itself
(`engine/book.js`): "Melee Weapon Attack: +5 to hit, reach 5 ft., one target. Hit: 7 (1d8 + 3) slashing
damage" gives the bonus, the damage and the reach; "the target must succeed on a DC 13 Constitution saving
throw or be poisoned" gives the save after the hit; "The hag makes two claw attacks and one bite attack"
gives the Multiattack; "Cantrips (at will): ..." and "1st level (4 slots): ..." give the spells. The
checker warns about anything it cannot read. Where the words cannot say it, give the fields yourself
(they win over the reading): `hit`, `dmg: [['1d8+3', 'slashing']]`, `dc: ['dex', 13, 'half']`,
`rider: { ability: 'con', dc: 13, cond: 'poisoned', dmg: [], half: false }`, `multi: [{ Claw: 2, Bite: 1 }]`.

## Fights and the party

Write each fight for the party in `party`, at the site's `level`. In play the Engine fits it to the party
at the table, using the 5e encounter budget:
- **Numbers first, then hit points.** It changes how many foes are in each group, then their hit points.
- **A lone named foe stays one.** Write `scale: false` on a group that must keep its number.
- **A smaller party never gets more foes.** It gets tougher ones instead.
- **The DM decides how much.** The DM can choose *fitted*, *only made easier* or *as written*.
- **A smaller party can lose a lesser group altogether.** The toughest foe always stays.

How hard to write a fight: when the party just goes in swinging, **hard, or at most deadly**, with the
place's talk and stealth routes making it easier still. The checker rates each fight for the written party
and warns when it is deadly, with how far past the deadly line it is; write `deadly: true` on the place
when that is meant. The fight simulation is the better judge at low levels (the budget's multiplier for
many foes overstates them): aim for about one wipe in ten for the written party. Foes that a route takes
out of the fight (militia, a revolt) or that only fight if something happens (a beast yoked to a machine)
belong in the notes, not the foes list, so the checks measure the fight the party actually meets.

## The checks before any GPU time

| What | Command | Time |
|---|---|---|
| All four, for every adventure | `node tools/preflight.mjs` (or `... my-adventure --party 3x2`) | under a minute |
| 1. The checker | `node tools/check-adventure.mjs my-adventure` (also **Check this adventure** on the DM's Adventure tab) | seconds |
| 2. The fight simulation | `node tools/simulate.mjs my-adventure --party fighter:3,cleric:3 --runs 50` | seconds |
| 3. Replay and fuzz | `node tools/replay.mjs` (replays every `*.calls.jsonl` a bench with `--log` wrote) | seconds |
| 4. A generated bench script | `node tools/bench.mjs --script gen --adventure my-adventure --fake` | seconds |

**How to read the simulation.** It plays both sides simply: heroes (SRD spells, their ability score
improvements taken) hit the weakest foe and casters use their best damage spell that is cast in an action;
monsters swing their weapons as many times as their Multiattack says, and their spells, breath and traits
are not played. Treat a wipe as "look at this fight", not a verdict. A lone big monster can wipe more often
than its budget suggests (the Ashen Crown's young green dragon, "hard", wipes about one party in five).

Once the preflight passes, a real bench is
`node tools/bench.mjs --script gen --adventure my-adventure --runs 3 --log my-adventure.log` on the PC.
It plays the generated script with the real model and checks outcomes (the party moved on, a fight started,
a quest was finished), not which tool was used.
