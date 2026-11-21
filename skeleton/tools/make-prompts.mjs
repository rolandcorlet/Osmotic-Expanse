#!/usr/bin/env node
// Writes MODULE-FORMAT.md, CONVERTER-PROMPT.md and DESIGNER-PROMPT.md from the one source of
// truth (engine/schema.js and brain/convert-guide.md), so the documents never drift from the code.
//   node tools/make-prompts.mjs

import { fileURLToPath } from 'node:url';
import { writeFileSync, readFileSync } from 'node:fs';
import { DICE, TEMPLATES, FORMAT } from '../engine/schema.js';
import { GUIDE } from '../brain/converter.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const fence = (t, lang = 'jsonc') => `\`\`\`${lang}\n${t}\n\`\`\``;
const files = { module: 'module.json', rules: 'rules.json', handbook: 'handbook.json', bestiary: 'bestiary.json', lore: 'lore.json', adventure: 'adventures/<adventure-id>.json' };
const templates = Object.entries(TEMPLATES).map(([k, t]) => `### ${files[k]}\n\n${fence(t)}`).join('\n\n');
const sample = (f) => readFileSync(new URL(`../modules/saltglass/${f}`, import.meta.url), 'utf8').trim();

// ---------------------------------------------------------------- the format
writeFileSync(`${ROOT}MODULE-FORMAT.md`, `# The module format (${FORMAT})

A game on the Skeleton is a **module**: a folder under \`modules/\` with one JSON file per section.
The Engine, the AI Director, the screens, the validator and the converter all read this format.
\`modules/saltglass/\` is a complete working example.

\`\`\`
modules/<module-id>/
  module.json        who the game is: name, tone, what the table calls things
  rules.json         stats, skills, difficulty ladder, snags and surges, health, strain, combat, conditions
  handbook.json      origins, callings, abilities, gear, character creation, ready-made characters
  bestiary.json      creatures
  lore.json          the world and a glossary
  adventures/*.json  one file per adventure or campaign chapter
\`\`\`

Check a module with \`node tools/convert.mjs --check <module-id>\` or the **Check the module** button on the host's Game tab.

## The dice (fixed: a module names them, but cannot change them)

${fence(DICE, 'text')}

## What a module may and may not change

| A module decides | The Skeleton decides |
| :-- | :-- |
| What everything is called (terms) | Every roll is a pool of d6 |
| 3 to 6 stats, 4 to 24 skills | A 1 scores nothing and is a snag (1 strain each) |
| The difficulty ladder's names | Two or more 6s and no 1s is a surge |
| What a snag costs on a failure (snag table) | Modifiers cap at +/-5; a pool is at least 1 die |
| What a surge earns (surge options) | Damage = overflow + weapon - soak, at least 1; a surge counts the weapon twice |
| Health and strain: names, sizes, penalties | Fights take turns in an initiative order |
| Combat actions, conditions, rests, advancement | The Engine does all arithmetic; the Director only asks |
| Everything in the world: origins, callings, abilities, gear, creatures, adventures | |

## The templates

Each template shows every field once. \`"key?"\` marks an optional key (write it without the \`?\`); text after \`//\` is a note.

${templates}
`);

// ---------------------------------------------------------------- the copy-paste converter prompt
writeFileSync(`${ROOT}CONVERTER-PROMPT.md`, `# The converter prompt

Paste everything below the line into a chat with Claude (or another capable AI), then paste or attach your material:
a core rule book, a players' handbook, a monster book, a campaign, or just a few ideas. It writes the module files one
at a time. Save each file under \`modules/<module-id>/\`, then press **Check the module** on the host's Game tab
(or run \`node tools/convert.mjs --check <module-id>\`).

The same guide drives the **Converter** tab on the host console and \`node tools/convert.mjs\`, which do all of this
automatically with the AI you chose on the AI tab.

---

${GUIDE}

HOW THIS CHAT WORKS
1. First, tell me in a few lines what you understood: the game's premise, its tone, and how its main mechanics will map
   onto the d6 core (what becomes the stats, the strain track, the callings, the abilities). Ask me at most three
   questions if something important is unclear; otherwise carry on.
2. Then write the files in this order, one per reply, each in its own \`\`\`json block headed with its file name:
   module.json, rules.json, handbook.json, bestiary.json, lore.json, then one adventures/<id>.json for each adventure.
3. After each file, say in one line what you made and wait for me to say "next" (or to ask for changes).
4. At the end, list anything from the source you could not fit, and how you handled it.

THE TEMPLATES (one per file)
${templates}

AN EXAMPLE: the sample module's rules.json
${fence(sample('rules.json'), 'json')}
`);

// ---------------------------------------------------------------- the designer prompt
writeFileSync(`${ROOT}DESIGNER-PROMPT.md`, `# The designer prompt

For starting a **new game** on the Skeleton with an AI as a design partner. Paste everything below the line into a chat
with Claude (or another capable AI) and describe your idea, however rough. It interviews you, helps you design each
part so it works with the d6 core and the AI Director, and writes the module files when you are ready.

To turn finished material (a rule book, a monster book, a campaign) into a module instead, use \`CONVERTER-PROMPT.md\`
or the Converter tab.

---

You are a game design partner. You help a creative person build a tabletop role-playing game that runs on the
Skeleton: a game engine with an AI Director, a fixed d6 dice core and a fixed module format. Your job is to turn their
ideas into a game that is original, coherent, fun at the table, and that the Skeleton can run without changes.

WHAT THE SKELETON GIVES EVERY GAME (it cannot be changed, so design with it, not around it)
${DICE}

What the Engine can do by itself (so the AI Director can run it): ask a character to roll a stat + skill against a
difficulty (with a cost on failure: health lost or a condition); characters attack creatures with weapons; creatures
attack characters with their attacks; deal damage and heal; add and remove conditions; mark and clear strain; tick
clocks; move the party between sites along exits; start, run and end fights in initiative order; add and complete
quests; give experience and level characters up; short and long rests. Anything else (a ritual, a chase, a trial, a
bargain) is played as rolls, conditions, clocks and the Director's narration, guided by short rules text the Director
can look up. Design your special rules so they reduce to these.

WHAT YOU DESIGN TOGETHER, STEP BY STEP
1. The pitch. Ask: the premise in one sentence; who the players are and what they do in a typical session; the tone;
   the audience; three inspirations (and what to take from each). Offer two or three sharper versions of the pitch and
   let them choose.
2. The words. What the game calls the parts: the difficulty, a snag (a 1), a surge (two 6s), health, strain, a
   character, a creature, experience, a level. Good terms make the dice feel like the world.
3. Stats and skills. 3 to 6 stats that say what matters in this world; 6 to 16 skills, each tied to one stat. Avoid
   two stats that always go together, and skills nobody would ever roll.
4. Snags and surges. What strain is in this world (fear, heat, corruption, exhaustion, debt) and what happens at its
   limit. A snag table: what 1, 2 and 3+ snags cost on a failure, getting worse. A surge's bonus and 3 to 5 options.
5. Health, defence and fights. Health from a stat; defence from a stat plus armour; 2 actions a turn is the default;
   4 to 8 combat actions; 4 to 8 conditions with exact, short effects (a condition that hurts each turn should say
   "Lose N <health> at the start of each of your turns" so the Engine applies it).
6. Characters. 2 to 8 origins (a stat bonus and a gift each) and 2 to 8 callings (two skills, starting gear and an
   ability each). Abilities cost strain ("1 Strain") or are "once a scene", may roll a stat + skill, and do one clear
   thing. Gear: weapons 1-5, armour soak 0-3. 2 to 4 ready-made characters with a look and a want.
7. Creatures. 5 to 10 across tiers 1 to 4, each with a look, an attack or two, one special ability, and tactics that
   say when it runs. Use the numbers by tier below so fights are fair.
8. The world. A paragraph anyone can read, a few lore sections, a glossary of the game's own words.
9. The first adventure. Playable in one evening: 3 to 5 sites joined by exits, read-aloud text for each, Director notes
   with what a roll can find, 1 or 2 fights, a hazard, a clock that adds pressure, an NPC with a secret, and an ending
   with a real choice. Put each quest's completion site in "doneAt".
10. The check. Before writing files, walk the checklist below with them.

HOW TO WORK
- One step at a time. At each step, offer 2 or 3 concrete options with a line on how each would play, and recommend one.
  Build on what they choose; never overrule their taste, but say plainly when something will not work with the dice or
  the Director, and offer the nearest thing that will.
- Keep everything original: no names, places or characters from published games, books or films.
- Use the numbers below; explain a choice in play terms ("a 4-dice pool against Standard succeeds about half the time").
- When they say "write it" (or at the end), write the files one per reply, each in a \`\`\`json block headed with its file
  name, in this order: module.json, rules.json, handbook.json, bestiary.json, lore.json, adventures/<id>.json. Match the
  templates exactly: no comments, no trailing commas, ids lower-case-with-dashes, every id you refer to defined.
- Then tell them to save the files under \`modules/<module-id>/\` and press Check the module on the host's Game tab.

THE CHECKLIST
- Every stat is used by at least two skills, and the health and defence stats are different.
- A starting character's best pool is 4 to 6 dice; their worst is 2 or 3.
- Strain fills in about two scenes of hard play; its penalties come in around the middle and near the top.
- Every calling has something to do in a fight and out of one.
- Every ability says its cost, whether it rolls, and exactly what it does.
- Every creature has a reason to be where it is, and a moment when it gives up or runs.
- The adventure's start site exists, every exit leads to a site, every placed creature is in the bestiary, and every
  quest can be finished somewhere.
- The tone line tells the Director how to sound in one or two sentences.

${GUIDE.slice(GUIDE.indexOf('NUMBERS'), GUIDE.indexOf('INVENTING FROM IDEAS')).trim()}

THE TEMPLATES (one per file)
${templates}
`);
console.log('Wrote MODULE-FORMAT.md, CONVERTER-PROMPT.md and DESIGNER-PROMPT.md.');
