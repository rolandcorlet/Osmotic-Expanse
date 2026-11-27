# Skeleton map: zones, and a grid inside each zone (design, 27 Nov 2026)

Approved by Roly ("like d&d zones and grid when inside"). Upgrade plan step 7.

## What
The D&D Director's map, for every Skeleton game: each place is split into zones (about a room or a stretch
of street each); inside a zone, a battle grid of squares. The Director thinks in zones; players move their
own token square by square; walls from an imported map (Universal VTT) stop them; a travel map joins the
places. Rules gain `when: 'enter <zone>'`.

## The game's own rules (rules.json `map`, optional)
`{ "square": "2 m", "move": 6, "reach": 1, "range": 10, "cover": { "half": 2, "full": 5 } }`
- move: squares per move (a game with a Move action: per Move; one without: per turn)
- reach: melee distance in squares; range: ranged attacks' distance in squares (a weapon or attack may
  give its own `range`)
- cover: added to the game's own defence number
Defaults when absent: square "5 ft", move 6, reach 1, range 10, cover +2 / +5.

## Build order (each pushed working)
1. engine/map.js (from D&D, rules from the module) and the Ledger: map state, zones, placing, moves, reach
   and range checks when "distance decides" is on; tests.
2. The Director: MAP in the briefing, move_creature.
3. The Map tab (host, table, player), from D&D's public/map.js.
4. `enter <zone>` rules.
5. Gull Rock and Saltglass benches on iq3_s.
