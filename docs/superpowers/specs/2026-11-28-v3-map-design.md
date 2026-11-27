# The v3 map (the Osmotic Expanse Director), 28 Nov 2026

## Why
Roly (28 Nov): v3 is the only Director without a map. He chose the same map as the D&D Director and the
Skeleton (zones, a grid of squares inside each, a travel map), and that **one square is one Drift, with
the range bands worked out from the map**.

## The rules it follows
v3 measures distance in Drifts (CORE): Contact 0, Near 1-3, Mid 4-9, Far 10-20, Loose 21+
(`engine/rules.js` BANDS). Each creature carries a `band`: how far it is from the Cohort.
- One square is one Drift. Standing next to someone (any of the eight squares around) is Contact, so the
  Drifts between two tokens are the squares between them less one.
- With the zone map or the battle grid on, a creature's band is its Drifts to the nearest organism,
  worked out by the Engine after every action. Nobody has to keep the two in step.
- When something sets a band (the Director's `creature.act` with a band, a hazard's band shift, a creature
  added at a band), the Engine moves that token to the nearest free square at that distance, and the band
  then reads from the map as always.
- Off (the host switches the zone map and the grid off): bands are as they were, set by hand.

## Moving
- Outside a Pulse War anyone moves their own organism freely; the host moves anyone.
- In a Pulse War a player moves on their own turn. The first move of a turn is a Drift (the Drift action:
  its PP, the pumps' extra cost) and gives the organism its Flow in Drifts to spend; moving further spends
  another Drift. The host's moves are free.

## What comes from the others
- `engine/map.js`: the Skeleton's (squares, the game's own conditions that stop moving), unchanged but for
  v3's defaults (a square is "1 Drift").
- Zones: a site's printed `zones` (names and notes) in a chain; the host can edit them. Each six squares across.
- The travel map: the Vector's sites in their printed order (v3 exits are prose, so each site leads to the
  next and the one before).
- The screens: the Skeleton's `public/map.js`, with keys `org:` and `cre:`; the host's switches, zone
  editor and map import with the picture store (`mapfiles.js`, `/maps/`).
- The Director: the MAP block in its briefing (zones, who stands where, Drifts and bands between).

## Not in this
Reach checks on strikes (the Engine does not check a weapon's band today; the bands simply become exact).
