# Prompt 2: Player's Atlas, made Engine-ready

Attach: `The Osmotic Expanse - PLAYER'S ATLAS.md`. Optional: the `hands` section of `director/data/first-carve.js`, `director/data/apparatus.js`, and the `chargen/` and `players/` folders.

---

You are revising the Player's Atlas of The Osmotic Expanse so that everything a player's organism can do, carry or become is printed as data a rules program (the Engine) can apply, and so that a player's screen can offer only legal choices.

Do not change how the game plays. Where the book is ambiguous, list the readings and ask me to choose.

## Background

Today a pregenerated Hand looks like this in the scenario file:

```
mi: 27, atp: 14, pp: 6, mt: 14, flow: 7, countdown: 7, soak: 0, oath: null,
kit: ['Substrate Foam (10 S: out of combat, 1 S restores 1 MI)', 'Amino Drip (heal 6 MI, mark 1 Stress)'],
notes: 'MI is 20, or 25 with the Wrap. Purse: 40 S less the Blade (20) and the Wrap (20). Oath boxes are not printed for this Hand.'
```

The numbers are usable; the kit and the notes are sentences. Benches showed the results: the Director narrated kit effects the Engine never paid, players could not tell what a Pulse Point buys, a Dormant organism was asked to act, and weapon properties ("Lodged", "Heavy") were explained aloud as rules.

## What to produce

1. **Action list.** Every action a player can take, in and out of a Pulse War: id, name, cost (Pulse Points, ATP, Substrate), when it is legal, what it targets, which pool it rolls (as a formula from baselines and Pathways), and its result. Include Strike, Drift, Reserve and every reaction, Brace, each Pathway use that has a defined effect, harvest, stabilise, and "end turn".

2. **Kit as records.** Every weapon, wrap, tool and consumable: cost, Bulk, damage and type, properties, uses, and its effect as fields (heals 6 MI; marks 1 Stress; usable out of combat only). No effect may live only in a sentence.

3. **Properties and traits.** Each weapon property and organism trait: the numeric effect, when it triggers, and a table word for it.

4. **Derived numbers.** The formula for every derived value on a sheet (MI, MT, Flow, Pulse Points, Countdown, soak, Oath boxes), so the Engine computes them from choices instead of storing notes like "20, or 25 with the Wrap".

5. **States of an organism.** Up, Dormant, in Lysis, dead, absent: what each may and may not do, and what a player's screen shows in each.

6. **Advancement and spending.** Codon and Substrate: every way to earn and spend, as a table.

7. **Pregenerated Hands.** Each Hand rebuilt from items 1 to 4 with no free-text notes. List any place a current Hand does not match its own formula.

8. **Player words.** A short phrase for every number on the sheet that a Director can say without reading the number ("badly torn", "nearly spent").

## Format

Tables in the document, plus `players.json` holding actions, kit, properties, formulas and Hands with stable ids that match the Core Rulebook's ids for conditions and damage types.

## Checks before you finish

- A player's screen could be drawn from `players.json` alone, showing only actions that are legal right now and their costs.
- Every kit effect can be applied by a program with no sentence read.
- Each pregenerated Hand validates against the formulas.
- List anything in the Atlas that depends on a Director's ruling, and propose a closed list for each.
