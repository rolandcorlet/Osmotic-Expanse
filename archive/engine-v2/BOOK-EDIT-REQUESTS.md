# Edit requests for the next edition of the books (from the v2 loader)

The v2 Engine reads the Vector as data. These 14 cells are printed as sentences, so the Engine cannot run them as printed. `src/overlay-first-carve.mjs` supplies a token for each, so the module plays. The next Vector edition should print the tokens, and the overlay can then be deleted.

Other facts the Engine had to assume:
- **Creature reach.** The Bestiary prints no reach for Strike. The Engine assumes Contact.
- **Special effect shapes.** `special:fold-sentinel:present` has no printed effect the runner can execute.
- **Hazard to set piece.** `render-charge` leads into the race. The Vector does not link them, so the overlay does (`afterHazard`).
- **Awards.** `toll-vent/in-clean` and `brood/not-whale` have no printed trigger.

## The 14 cells
- `toll-vent/swear-toll.needs`: "a free Oath box; the promise in the player's words; owed to Order II" (cost or condition is a sentence, not a token)
- `toll-vent/force-gate.onFailure`: "the Sentinel Strikes the crosser" (effect is a sentence, not a token)
- `toll-vent/offer-water.needs`: "clean water: one Vial of any kind emptied, or 1 S of foam" (cost or condition is a sentence, not a token)
- `soft-field/cut-panel.needs`: "far panels, or the nest dealt with" (cost or condition is a sentence, not a token)
- `soft-field/stamp-cut.needs`: "unstamped Specimens and any claim flag" (cost or condition is a sentence, not a token)
- `soft-field/drop-panel.needs`: "a Kinetic hit with 4+ Overflow on a panel" (cost or condition is a sentence, not a token)
- `soft-field/salt-cache.onSuccess`: "gain:60 S of salt" (effect is a sentence, not a token)
- `soft-field/salt-cache.onSuccess`: "note: salt spent rewinds CARCASS by 1" (effect is a sentence, not a token)
- `render-hall/open-pump.onFailure`: "the crew turn hostile to the attempt" (effect is a sentence, not a token)
- `render-hall/read-dead.needs`: "at the still; a body not yet Rendered" (cost or condition is a sentence, not a token)
- `render-hall/stabilise-osk.needs`: "Osk Dormant; at Contact" (cost or condition is a sentence, not a token)
- `brood/cut-brood.onSuccess`: "gain:400 + 100 x Overflow S, to 900" (effect is a sentence, not a token)
- `gut-stone/slip-past.onFailure`: "all organisms Marked" (effect is a sentence, not a token)
- `gut-stone/convince-guardian.needs`: "the Guardian awake" (cost or condition is a sentence, not a token)
