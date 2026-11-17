# Phase 6: the campaign Director (full Vector, no rescue)

Started 15 November 2026. Roly's scoping: **first slice is the no-rescue run, and "the full Vector" means The First Carve only** (all five stages, start to finish). The other three Vectors (The Long Swallow, The Ninth Shift, What the Water Owed) and a campaign layer that carries the cast, Clocks, Standing and Oaths from one Vector to the next come after this gate.

## The gate

One run of `node tools/bench.mjs --runs 1 --sites 5 --players 4 --thinking low --log full.log` ends with **no hard rescues**, on top of the existing gate (no Engine refusals, leaks, unpaid damage, unpaid Clocks or reversed rolls). Then the same on a second model, then a real group (Phase 4).

## What counts as a rescue

A point where a human host would have had to step in, or where the code stepped in for the model.

Hard (fail the gate):
- `plain-line`: the Director said nothing at all, even after a nudge and a no-tools ask; the Engine asked the table what is next.
- `held-leak`: a leak survived the one rewrite. In Co-pilot or Auto it is held for the host.
- `stall`: (bench) three Director turns running left the same creature on turn; the bench had to end the turn as the host.
- a turn that threw (`ProviderError`) stops the run and counts as a failed run, as before.

Soft (reported, not gating):
- `silent` / `out-of-steps`: the Director needed the extra "stop calling tools, say what the table sees" ask and it worked.
- `retry`: the turn was run again.

The bench prints `Rescues (where a human host would have had to step in): N hard, M soft — kinds` and a `! rescue (...)` line at the turn where each happened.

## Order of work
1. Done: rescue instrumentation (`oneAttempt` returns `rescues`; the bench tallies and gates on hard ones; two tests).
2. Roly runs the full five-stage bench and pastes the log; fix what forces rescues, stage by stage with `--from N`.
3. Repeat until a full run is clean, then a second model.
4. Then: next Vector as data (engine-redesign format), campaign layer, Phase 4 with a real group.

Known non-rescue weak spots to watch in the full run: invented extra Collapses, turn machinery spoken to players ("signal you're done"), a second Render Charge flush narrated after the war.
