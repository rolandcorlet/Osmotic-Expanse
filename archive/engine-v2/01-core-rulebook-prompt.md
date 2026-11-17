# Prompt 1: Core Rulebook, made Engine-ready

Attach: `The Osmotic Expanse - CORE RULEBOOK.md`. Optional: `director/engine/rules.js` and `director/engine/ledger.js` for how the rules are coded today.

---

You are revising the Core Rulebook of The Osmotic Expanse so that a rules program (the Engine) can enforce every rule without interpreting prose, and so that an AI Director running the table never has to remember a number.

Do not change how the game plays. Where a rule is ambiguous, list the readings and ask me to choose; do not pick silently.

## Background

The current Engine enforces rules coded by hand from the book's sentences. Benches showed these weak points:

- The Director added standing penalties itself (a Stress penalty, a Brittle penalty) and invented situational modifiers and Thresholds.
- Procedures written as paragraphs (Oaths, chases, Dormant and stabilisation, ending a Pulse War, hazards) were where the Director went wrong most.
- Rules words ("Runaway Catalysis", "Autophagic Collapse", "Lodged", "Pulse Points") were said aloud to players.
- "Once per Cycle inside a Pulse War, once per scene outside one" had to be inferred for hazards.

## What to produce

1. **Rules register.** A table of every rule the Engine must enforce: id, section, one-sentence statement, who it applies to, inputs, result. Mark each as `engine` (the program applies it with no choice), `choice` (someone picks from a list) or `table` (pure story, the Engine does nothing).

2. **Procedures as steps.** Rewrite each multi-step procedure as a numbered state list with the legal next step from each state. At minimum: making a roll; a Pulse War from start to end (initiative, a turn, Reserve and reactions, ending a Cycle, the conditions under which the war may end); taking damage through soak to Dormant, Lysis and death; stabilising; swearing, keeping and breaking an Oath; a chase; resting and recovery; harvest and sharing.

3. **Closed lists.**
   - A difficulty ladder: named steps with their Thresholds, and one line on when each applies.
   - Every situational modifier that may ever apply to a roll, with its size and its trigger. State plainly that nothing outside the list may be applied.
   - Every condition: what it changes (as numbers), how long it lasts, what removes it, whether it stacks.
   - Every damage type and what interacts with it.

4. **Timing words defined once.** Cycle, turn, scene, Beat, session: what starts and ends each, and what "once per" each means.

5. **Table words.** For every rules term, a short in-world phrase the Director may say aloud instead, and a flag for terms that are fine to say (Clocks, band names) versus never said (dice counts, Thresholds, a creature's Integrity).

6. **Edge-case rulings.** Answer each directly: Can a Dormant organism roll, harvest, speak, be moved? What happens to a pending roll when the fight ends? Can a hazard go off after a successful roll? Who chooses the target when a rule says "an organism"? What happens when two effects shift bands at once?

7. **Open questions.** Anything the book does not decide.

## Format

Give items 1 to 5 as tables, and again as one JSON file (`core-rules.json`) with stable ids. Keep the book's own section numbers as references.

## Checks before you finish

- Every number in the book appears in exactly one place in the JSON.
- No rule in the register needs a sentence to be read at run time.
- For each bench error listed in Background, name the register entry or list that now prevents it.
