# Prompt 3: Lytic Bestiary and Director's Codex, made Engine-ready

Attach: `The Osmotic Expanse - LYTIC BESTIARY.md` and `The Osmotic Expanse - DIRECTOR'S CODEX.md`. Optional: `director/data/bestiary.json` (68 blocks as coded today).

---

You are revising the creature blocks of The Osmotic Expanse so that a rules program (the Engine) can run a creature's turn by itself, and so that an AI Director can describe any creature without ever stating a number.

Do not change how creatures play. Where a block is ambiguous, list the readings and ask me to choose.

## Background

A block today holds good numbers and then sentences:

```
"mt": 14, "mi": 30, "soak": 2, "bd": 3, "type": "Kinetic", "pool": 5, "pp": 3, "flow": 5,
"traits": "Bridge-Bound (on a ribbon it has Flow 6 and cannot be pushed; off one, Flow 2 and −2 to all pools) · Tether (...)",
"special": ["Special — Shear Call (3 PP): the ribbon vibrates: everything on it makes a DFF contest at AT 14 or is Jostled and pushed off into the drop."],
"weakness": "fight it off-ribbon, cut the ribbon under it (integrity 30), or hand it a legal reason to leave ...",
"harvest": "C5 / G2 / P1 · Codon 7 · BSP 2",
"tactics": "herds you along the bridge into a knot where its allies are."
```

Benches showed what the sentences cost:

- The Director typed the name and Pulse Point cost of each special by hand, and set the resulting conditions itself.
- It ran each creature step by step (move, strike, end turn), which is where out-of-turn calls, moves with no Pulse Points and early "end the fight" calls came from. A round of seven creatures took a dozen or more tool calls.
- With no printed words for how hurt a creature looks, it said the numbers: "Five MI of what's left", "nineteen of twenty-two".
- Standing a creature down (it yields, flees, has what it wanted) was the Director's call with a typed reason.
- Class and encounter words ("Elite", "E5") were said aloud.

## What to produce, for every creature

1. **Numbers** as now, each in its own field, including both values where a trait switches them (on-ribbon and off-ribbon Flow).

2. **Traits as records.** Each trait: when it is active, what number it changes, and what ends it.

3. **Specials as records.** Each special: id, name, Pulse Point cost, who it targets (one, all in a band, all at the site), range in bands, the defender's roll if any (pool and Threshold), effect on success and on failure (damage, type, condition and duration, band shift), and any limit (once per Cycle, needs a condition on the target).

4. **A turn script.** An ordered list of "if this, do that" lines the Engine can follow with no judgement: preferred target, when to close or keep distance, when to use each special, when to hold a Reserve, and what to do with spare Pulse Points. Mark creatures too subtle for a script as `director-run`, and say why.

5. **Morale and aims.** What it wants, when it stops fighting (at what share of Integrity, on what event), whether it flees, yields or goes quiet, and what the Cohort can offer to end it without a fight. These are triggers the Engine checks, not reasons the Director types.

6. **A wound ladder.** Five short phrases for how it looks at: unhurt, marked, torn, failing, one blow from gone; plus one for destroyed. Written for this creature's body, with no numbers.

7. **Attack and miss words.** Two or three short phrases each for a hit, a miss and each special, so narration has material without inventing mechanics.

8. **What a careful look reveals.** Three tiers of what a successful read tells the players, in world words, never numbers (how it hits, what it is weak to, what it wants).

9. **Harvest as fields.** Specimens by grade, Codon, any roll needed, and what must be true to cut it.

10. **Table name for its class.** What to call a Minion, Standard, Elite or Boss aloud, if anything.

Also from the Codex:

11. **Encounter budgets** as a table the Engine can check a site against.
12. **The Director's closed lists**: every ruling the Codex lets the Director make, each as a list of allowed answers.

## Format

One readable block per creature, and `bestiary.json` with stable ids. Use the Core Rulebook's ids for conditions, damage types and bands.

## Checks before you finish

- Every creature marked scripted can play a full turn from its record with no model call.
- No special needs a sentence read to know its cost, target or effect.
- Every creature has a complete wound ladder with no digits in it.
- For each bench error listed in Background, name the field that now prevents it.
- List blocks whose current numbers and sentences disagree.
