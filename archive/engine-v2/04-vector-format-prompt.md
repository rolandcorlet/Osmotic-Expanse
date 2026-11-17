# Prompt 4: the Vector (campaign module) format

Attach: `The Osmotic Expanse - THE FIRST CARVE.md` and `How_To_Write_a_roleplayer_story.md`. Optional: `director/data/first-carve.js` (the module as coded today) and one other Vector (`THE LONG SWALLOW.md`) to test the format against.

---

You are designing the standard format for a Vector (a playable module) of The Osmotic Expanse, and converting The First Carve into it as the worked example. The format must let a rules program (the Engine) run the module's facts without reading prose, and give an AI Director a small, complete briefing for each site.

Do not change the story or the balance. Where the module is ambiguous, list the readings and ask me to choose.

## Background

A site today is part data, part sentences:

```
exits: ['Out: the exit shaft up to the pump', 'Back: the pyloric duct to the Brood'],
encounter: [{ blockId: 'protease-warden', count: 1 }, ...],
host: {
  play: 'Two things claim this room and neither is evil ... if TOLL hits 5 the Render Charge fires and the last ten minutes are a chase.',
  hazard: 'The Render Charge: on a Clock, fires at TOLL 5. 20 Kinetic, 2-band shift, the carcass ends. Not survived: raced.',
  pays: 'The recovery crew will pay 200 to 400 S for a Cohort willing to carry the serial into a Hegemony office ...',
}
```

Seven benches of this module produced these errors, all from the sentence parts:

- **Hazards.** The Engine reads the hazard line with pattern matches. It missed that the Render Charge hits everyone and happens once, so it was called per organism and again every Cycle, and the table was wiped.
- **Clocks.** The Director moved HUNGER and TOLL on its own judgement ("bodies left uncut", "refused the toll").
- **Exits.** The Director tried to move to the site it was already in, or asked a question instead of moving.
- **Invented things.** A pump that could be opened, goods for sale, a creature brought in that the scene had not called for.
- **Thresholds and modifiers.** Chosen on the spot for actions the site text plainly invites (taste the halo, mask the Cohort, shoulder through the gate).
- **Prices and awards.** Tolls, a d12 priced choice, Codon awards and offers ("200 to 400 S") were sentences the Director had to turn into tool calls.
- **Arrival.** Which creatures are present at the start, where, and whether they are hostile, was left to the Director.
- **The ending.** "Not survived: raced" was the whole of the chase.

## What to produce

1. **The Vector schema.** A documented format with these parts:
   - *Module header:* title, levels, pregenerated Hands, session-zero notes.
   - *Clocks:* segments, what the players are told, and every advance trigger as a record (site, event, amount). State that nothing else moves a Clock.
   - *Site graph:* sites and exits as links with a condition each (open, blocked while creatures fight, needs a toll, one-way).
   - *Per site:* read-aloud text (two to four sentences); zones with bands; **interactables** (each thing that can be acted on: the action, pool, Threshold from the Core ladder, result on success and failure, whether it can be done unhurried) with a closing line that nothing else at the site has an effect; creatures present with starting band, stance (hostile, guarding, indifferent, will talk) and what turns them hostile; non-player characters with what they want, what they offer and at what price; hazards as records (trigger, Clock gate, amount, type, who it hits, conditions, band shift, how often, what counters it, and what follows once it has gone off); harvest (what the site itself yields, what each creature pays); awards as records (event, Codon); secrets in tiers (what a look, a taste, a successful read reveals); the lesson the site teaches.
   - *Set pieces:* any chase or countdown as a procedure with steps, rolls, and win and lose states.
   - *Endings:* each way the module can end and what state marks it.

2. **The First Carve in the schema**, all five sites, as a readable document and as `first-carve.json`.

3. **A per-site Director briefing template**, generated from the data: at most 300 words, holding only what the Director needs to narrate this site.

4. **A validator checklist** a program can run on any Vector: every exit leads somewhere; every creature id exists in the Bestiary; every Threshold is on the Core ladder; every hazard has all fields; encounter budgets match the Codex; every award and price is a number or a printed range with a rule for picking within it.

5. **A gap list** for The First Carve: every fact the current text leaves to the Director that the schema needs, with your proposed value and the reason.

## Checks before you finish

- The Engine could run every hazard, Clock advance, exit, price, award and arrival in The First Carve from the JSON alone.
- Each bench error in Background maps to a schema field that prevents it.
- The schema also fits a second Vector without new fields, or you list the fields it would need.
