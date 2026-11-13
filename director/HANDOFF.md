# Handoff: continuing The Osmotic Expanse AI Director

Written 12 November 2026, after Phase 5 was pushed (commit `2ac11f4` on `main`, repo `rolandcorlet/Osmotic-Expanse`, folder `director/`). **Rewritten at the end of 13 November 2026, HEAD `caf1b2a` plus this file, and extended the same night with the site 3 and 4 prep below.** Read this first, then `README.md` and `HOST-GUIDE.md` in the same folder.

**Push state:** Roly pushed at 11:01, 12:35, 13:18, 22:37 **and 22:44** — so `origin/main` sits at
**`edfe4bb`** and everything written above this line is **already pushed**. What is unpushed is the site 3
and 4 prep below it.

## Bench of 14 Nov (thinking low, 4 runs, 3 failed) and the fixes (`node --test` now 145)

What the gate failed on, and what each turned out to be: **three false leaks and a refusal habit, not the model leaking.**
1. *Segments leak (run 2)* flagged "CARCASS ticks forward one segment" — a Clock's segment. Sentences naming a Clock are now skipped.
2. *Machinery leak (run 3)* flagged "the better tool" in "Your Needle Dagger is fine and silent — maybe the better tool". `MACHINERY` now wants "tool call/result/schema" or "the tool refused/returned/said", not the bare word.
3. *"Asks 2 questions" (3 of them)*: two were a clerk's question inside quotation marks. Questions inside quotes are no longer counted; the one genuine double question is now also in `fixable`, so it gets the one rewrite (it never did before).
4. *Refusals*: `move_clock` HUNGER twice (run 1) after the one AI advance was spent — now a **note** that says nothing moved. Run 3's five were creature calls out of turn (`end_creature_turn`/`creature_strike`/`creature_move`, once with an organism id): `end_creature_turn` for a creature that is not acting is a note; the other refusals now end "Acting now: <name>".
5. *New check, "Repeats an earlier line"*: run 3 narrated three different Vash rolls against the mite with the same paragraph word for word. Four-word-shingle overlap of 40% with any of the last four narrations is a style flag and gets the one rewrite.

Checked by running every real `DIRECTOR:` line of the saved bench through `checkNarration`: the three false leaks are gone and the one genuine double question remains flagged. **Not changed, still true:** the model's own habits (Pulse War granularity made run 3 124 turns; "ran long" rewrites on about a third of turns), and none of this has been run against a live model since. Re-run `node tools/bench.mjs --runs 3 --sites 2 --players 4 --thinking low`.

## Bench of 14 Nov, second (thinking low, 3 runs): GATE PASSED, then the quality read (`node --test` 146)

Zero refusals, leaks, unpaid damage, Clocks or reversed rolls. What the transcript still showed, and what changed:
1. **Run 1 stalled eight turns on a tray that was empty.** The bench had shared all 14 Specimens at once, but the Director's own last line ended "take one or pass", so it kept telling the table the lane was waiting on "six more Specimens from the Sentinel" that never existed, and refused to let anyone move. Now: the briefing says **NOTHING IS WAITING TO BE SHARED** when the queue is empty, the harvest tool note says sharing does not hold the Cohort up and not to ask anyone to take or pass, and `instructions.md` says the same. (Only stamping waits; `change_site` was never blocked by the queue.)
2. **Creature damage in numbers** ("Fourteen points of damage tear through the overlap", run 2): new leak flag when "N points of damage" appears with no player named.
3. **"The page" spoken to the table** ("The page is clear: a swarm offered drink leaves in one sentence"): new style flag; only "The page has nothing printed for that" may name it.
4. **Pulse Points mentioned after the fight ended** is now rewritten once instead of only flagged.
5. **A declared attack that opens a Pulse War was narrated as landing** (runs 2 and 3: "scatters half of them") with no roll behind it. Instruction added: that blow is thrown on the player's own turn.

Left alone: "RUNAWAY CATALYSIS" and "Lodged" said as rules words; the award narrated "between you" when it is 20 Codon each; the chronicle files dead swarms as `[faction]` cast; the 1-in-3 turns that still need the length rewrite; run 3's last Long flag survived its rewrite. Next: re-run the same bench (`--runs 3 --sites 2 --players 4 --thinking low`) and look first for the tray stall.

## Sites 3 and 4, prepared (13 Nov, after the gate handoff — `node --test` now 141)

Asked "is site 3 ready", the answer was no, and the reason is a trap in the summary line: **"Ended at: The
Render Hall" is not coverage.** All three 13 Nov runs that reached it stopped *at the arrival* — one
narration, one question, turn budget out. Across both saved logs, at site 3: no `bring_creatures`, no
`hazard_damage`, no Pulse War, and not one occurrence of "Enzyme". The only blocks ever brought anywhere
are `gnaw-swarm` 4, `fold-sentinel` 3, `glaze-medusa` 2, `hijack-mite` 1 — never the bleeders and feeders
the page prints for the stomach. `bring_creatures` does police block ids to the site (`brain/tools.js:155`),
so this was never the model being refused; it never got into the room, because the scripted table's last
line was the move.

**Built (my call where the page left a shape, one row of data each):**

1. **A room may price an event its own way.** `clockTrigger(s, ctx, name)` now reads the **site's**
   `clockTriggers` before the Vector's, and a row may be one Clock id, a list, or an object of **signed
   amounts** with `oncePerScene`. The Brood carries `bodyCut: { HUNGER: 2, TOLL: 1, oncePerScene: true }`
   because §8.4 prices it that way — "if the brood is registered, a Name. If harvested instead: 400 to
   900 S, HUNGER +2, TOLL +1. Both are legitimate play: charge for both." **My call, and it is a
   direction call:** the site row *replaces* §3.3's "each body harvested: −1" in that room rather than
   adding to it, because butchering the not-whale's young is not the Cohort cleaning the water; add the
   −1 to the row to price both. `oncePerScene` is the other knob — drop it and every body cut stacks
   +2/+1. A scene change re-arms it, the same unit `loud` uses.
2. **The bench can reach rooms 3 and 4.** `SCRIPT3` (the stomach: the bands, the pump question, a
   harvest) and `SCRIPT4` (the brood: registration first, then the cut, which is how the row above gets
   exercised live) are new, and `--sites 3` / `--sites 4` select them. The composition drops each part's
   hand-off line so the move is said once; **`--sites 2` is unchanged** (verified: still 19 Director
   turns against the stand-in). A 4-site run is ~32 turns at the stand-in and much longer at a real
   model — it is a rehearsal, not the gate; the gate stays at 2.
3. **The later rooms are now tested at the tool layer, not only in the data.** A new `brain.test.js`
   test drives `change_site` → `bring_creatures` → `hazard_damage` at the Render Hall: 3 bleeders can be
   brought, a Toll-Vent swarm cannot, the Enzyme Field refuses 9 ("does 8 Lytic, not 9"), refuses
   `Momentum` (that is the Toll-Vent's trigger; this room prints "entering Mid band, or a Strike inside
   it"), lands once, and refuses a second firing in the same scene. Plus the site-4 encounter.

**Checked and clean, so nobody re-investigates it:** `printedPays` already reads each site's prose `Pays`
line, so the Render Hall's "20 Codon for stabilising a stranger", the Brood's "25 Codon" and "400 to 900
S", and the Gut Stone's "200 to 400 S" are all awardable; a test already holds every site's `harvestPays`
to the Bestiary, and all five sites' encounter block ids exist in the 68-block bestiary. The Brood prints
"None, which is the point" for a hazard and `hazard_damage` is refused there outright. And the churn's
"1 band per Cycle" does **not** misread as a hazard band shift or as a standing hazard — `hazardSpec`
cuts at "Counter:" and `PER_CYCLE` wants "<n> <type> damage per Cycle".

**Two things the pre-gate sweep settled, so they are not re-litigated mid-run.** Before touching any of
this, the *current* `checkNarration` was run over the 81 real narration lines in the saved gate logs plus
the sentences quoted above from the unsaved gates: **zero machinery leaks, zero unpaid damage, zero
Unpaid Clocks, zero Reversed rolls, and 3 Segments flags, all three genuine creature counts** ("six slow
segments apiece", "one segment left", "four of its six sections torn away"). Two corrections to what is
written above about the checks: the "sections come off it in twos" over-flag is **not** firing — that
sentence only flags because the same sentence goes on to say "one segment left"; and the one live
false-positive shape in `REVERSED` is a negation plus *open / clear / reach / get* about something other
than the throw that passed — "The gate does not open for him this time, and Bresk goes around it" reads as
reversing Bresk's crossing if Bresk passed a throw that turn. It fails the gate, so if a run dies on that,
suspect the regex (`REVERSED` in `brain/director.js`) before the model. The save round-trip worry is also
closed: the only stale save on disk predates `hazards`, `sceneNo` and the Clock `panelScene`/`panelCount`,
and every read of those is guarded, while the one unguarded new read (`s.scene.cloud`) sits on a field the
Ledger has written since Phase 1.

**Still unbuilt at site 3, and these are shape decisions, not rows:** the **ground/zone model** —
`site.zones` is read by nothing but the briefing line, so "the churn drags 1 band per Cycle unless you
win Fluid Navigation", "every Drift is a contest if you are in it" and the dry ribs holding Mid band are
all unpaid; **the Enzyme Field is not area** (`hazardSpec().area` needs "all in the chamber / the whole
chamber|field|carcass / to all / everyone in it", and this note says "across the mid floor"), so a
floor-wide field pays **one body per firing** — but making it area *without* the zone model would hit a
Braced Cohort on the dry ribs, which the page's own Counter protects, so it waits with the zones; **the
pump** ("seize or open it: CARCASS −1 and the Enzyme Field dies; loud: HUNGER +1, TOLL +1 if the Guild
sees it") has no action, no Clock row to hang on, and nothing in the Engine can kill a hazard; "-1 soak
until repaired" has no mechanic. **At site 4:** registration ("a claim needs a witness, a signature, and
a body that can hold paper", "if the brood is registered, a Name") and the **Stakes Ladder** Lesson 5
asks for — neither exists anywhere in `engine/`. And Pump-Hand Osk (MT 12, MI 24) and Nine-Folds are
prose, not bestiary blocks, while Lesson 4's rehearsal hangs on Countdown boxes. He pushes from Windows while a session is running, so re-check `git rev-list --count origin/main..HEAD` before quoting an unpushed number — a stale line in this file cost the 11:00 session ten minutes this morning. The sandbox has no egress, and a commit run from here leaves `.git` locks and `tmp_obj_*` files to delete in the same call.

## Starting a new session (as at 13 Nov, end of day — HEAD `caf1b2a` plus this file)

Today's commits, in order, each in one line (docs between them omitted): `f4d68e0` hazards owned by the Engine
(firing budget, a wider `hazardSpec` parse, the unpaid-damage guard that fails the gate); `4070dd6`
Roly's leak ruling at the table; `b4c4b07` the Vector pays its own Clocks from §3.1-3.3, and `oath.swear`
refuses a promise the table never said; `cbb2e52` an area condition in one call; `5eee166` a hazard pays
the condition its own Effect clause prints, and the tool strings are held to the leak rule; `8358eba` the
**briefing** held to that rule too, plus `*.log` ignored and a `--log <file>` flag for the bench;
`ed536dd` `loud` pays TOLL **and** HUNGER, an **Unpaid Clocks** check, the briefing saying nobody acts on a
turn outside a Pulse War, and a repeat `creature_stand_down` answered with a note; `f3e5a6d` `hazard_damage`
says only this site's printed hazard counts, and settling an already-closed Oath is a note; `95d1271` the
panel is one Engine event the site pays, plus a **Reversed rolls in narration** check; `716187e` the four
definitions Roly delegated — a hazard's band shift throws everyone outward, 8.2's opaque lane is a
scene-level -2 dice, a swarm's Segments are a creature's number, and an Oath must name a witness — and
refusals counted by call; `caf1b2a` one of those new checks fixed, because it was flagging the Cohort's own
harvest. Every gate number, what each run showed and what each check caught is in the findings below.

`node --test` is **139 green**. The working tree still shows ~82 "modified" files and every one is pure
CRLF noise — check `git diff --numstat` for equal insert/delete before believing a dirty tree, and there is
still no `.gitattributes`. Bench logs are ignored now; get one with `--log` rather than a redirect.

### For the next session — start here

Nothing is broken and waiting. Nothing is *measured*, either, and that is the difference this file needs
you to hold onto: today added a great deal that has only ever run under `node --test`.

1. **First job, and it is Roly's to run: the gate.** It is the first live look at `open_panel`, the opaque
   lane, `shiftAllBands`, the Oath-witness requirement, and two narration checks that now **fail the gate**
   (Unpaid Clocks, Reversed rolls in narration) plus the Segments leak.
   `node tools/bench.mjs --runs 3 --sites 2 --players 4 --thinking medium --log bench_13nov_pm.log`
   Tells to read: zero refusals (the summary names them by call now), zero leaks, zero unpaid damage, zero
   Unpaid Clocks, zero Reversed rolls; **HUNGER at 1** after the first Pulse War of a scene; **CARCASS 1,
   not 2**, where a run cuts a panel; **no `set_condition` at all** after a firing (one redundant
   `all_bodies` call is a legal no-op, one per body is a regression); the first Toll-Vent firing logging
   **"throws everyone outward"**; and if a run works the Soft Field panels hard at 4+ Overflow, the opaque
   lane line with the -2 dice showing as a labelled part of the pool. Expect the style tax regardless: 20 of
   81 turns needed the one-shot rewrite last gate, almost all of them "ran long, read out dice, or did not
   end on a question".
2. **If a new check fails a run, suspect the check before the model.** `caf1b2a` is the proof: my first
   Segments check flagged "Four cut sections lie in the cradle of the current" — the Cohort's own harvest —
   and a leak flag both burns a rewrite and fails the gate. The method that found it: convert the saved
   logs (`iconv -f UTF-16LE -t UTF-8`) and run every `DIRECTOR:` line through `checkNarration`, then read
   the flag counts. 81 real lines now yield three Segments flags, all genuine, and the Unpaid Clocks check
   produced none once the Clock payments were in the state.
3. **Knobs I set today, each one number or one regex if Roly wants them different.**
   `rules.panelOpensPerScene = 1` (0 makes every panel cracked loose pay its own CARCASS segment);
   `soft-field.panelCloud = { overflow: 4, dice: -2 }`; `SEGMENTS`, `REVERSED` and `HARVEST_WORDS` in
   `brain/director.js`; the outward direction of a hazard's band shift (`shiftAllBands`, with clauses that
   print their own direction deliberately left alone); `swear_oath` requiring a witness from the Director
   only; and the gate staying strict on refusals while now counting them by call.
4. **Known-incomplete by my hand, not accidents.** The opaque lane does not reach creature→player attack
   pools, so "every contest in the room is -2 dice for everyone" is honoured on one side only.
   `HARVEST_WORDS` is a list curated from the transcripts rather than a rule, so a harvest sentence using
   none of those words will still over-flag; and "sections come off it in twos" is an over-flag (it
   describes a blow, not a tally). `swear_oath` now *requires* `witness` in its schema, which may itself
   create refusals from a model that forgets it — unmeasured.
5. **A reachability problem nobody has priced yet: HUNGER cannot climb for a Cohort that harvests.** §3.3
   pays +1 for fighting loudly and **−1 for every body harvested**, so a thorough Cohort pins it at 0 —
   which is why its Feeders, Render and Render-Cascade segments have never appeared in five gates. That is
   rule-correct behaviour, not a bug, and it is worth a decision before anyone concludes the danger clock
   is unused.
6. **Unverified from this sandbox, in case anyone assumes otherwise:** the screens (no Playwright here, so
   no 1366/1536/1920 or 390 px look at how the new log lines render); loading a pre-existing save through
   the new state fields (`panelScene`, `panelCount`, `scene.cloud` are additive and hazards had a guard, but
   nothing round-tripped one); sites 4 and 5 — the scripted table plays two sites, so the Gut Stone's
   "2-band shift" and the Render Charge at TOLL 5 are unit-tested and have never fired; Phase 5's
   narration-to-first-sound latency; and the 82-file CRLF churn with no `.gitattributes`.
7. **Then the work list, which is now work rather than definition:** the Beat; the Cycle outside a Pulse
   War; the ground/zone model the slough's "-1 Drift per Move" needs; salting a panel or a wound; shipping
   a haul to a buyer; the Gut Stone's serial at a Warden register arch; the narrated countdowns; the second
   half of the priced-choice rows (only one is applied); and the run-1 Oath loop, still latent. After that,
   **Phase 4 with a real group** — the scripted bench is rehearsal, not the gate.

Today's changes item by item, with the reason each exists:

1. **DONE — the briefing is held to the leak rule (`8358eba`).** The tool strings have been swept by a
   test since `5eee166`; the briefing was the last big block of our own prose the model reads, and it
   was free to say "the Engine refuses `hazard_damage` until…" and have it come back at the table.
   Fifteen briefing lines are now in page and scene words ("Clocks this site has already moved", "FOR
   YOU ALONE AT THIS SITE", "# WHAT JUST GOT PAID", "not in the scene yet" instead of "not in the
   Ledger yet"), and `instructions.md` lost the same actor nouns wherever they were only phrasing.
   They are kept where the model needs the concept to work — a tool name it must call, and the leak
   rule itself, which has to name the words to forbid them. `BRIEFING_LEAK` in `brain/director.js` is
   `MACHINERY` minus the two words the Vector's own page prose legitimately writes ("the harvest tool"
   in the Toll-Vent's Pays line, "the Ledger's room" in a Lesson line), and a new test sweeps the
   **generated** briefing across both sites, a spent hazard, a destroyed body, the sharing queue, an
   already-paid site, and the chronicle and host-note blocks.
2. **DONE — housekeeping (`8358eba`):** `*.log` is in `director/.gitignore`, and `tools/bench.mjs`
   takes `--log <file>` and writes its own UTF-8 copy of everything it prints, so a saved gate is
   greppable without `iconv`. New gate command:
   `node tools/bench.mjs --runs 3 --sites 2 --players 4 --thinking medium --log bench_13nov_pm.log`
3. **DONE at `ed536dd` — the afternoon gate's three refusals and its Clock defects.** See the findings
   block below: `loud` pays both Clocks §3.2 and §3.3 price, an Unpaid Clocks flag now fails the gate,
   the briefing and instructions say that nobody acts on a turn outside a Pulse War, and a repeat
   `creature_stand_down` is a note.
4. **BUILT at `95d1271` — the panel is one event, and the site pays it** (was Open item 5's ruling).
   `panel.open` is the Engine event; `open_panel` is the Director's call for "a hit or a throw cracked
   one loose", and the site cut with no creature goes through the same `payPanelOnce`. Both runs of the
   evening gate had paid the same panel twice (the Director's one advance plus the cut's own row) and
   ended at CARCASS 2; now a scene pays `rules.panelOpensPerScene` times, set to **1** in this Vector,
   and **0 or absent means every panel cracked loose pays its own segment** — so if the carcass should
   rot faster when the Cohort works the field, that one number in `data/first-carve.js` is where you
   change it, not the Engine. The briefing and the tool description both tell the model never to spend
   its advance on a panel. **Still unbuilt from that same printed clause:** the Soft Field's "the lane
   goes opaque: every contest in the room is -2 dice for everyone" at 4+ Overflow — that wants a
   scene-level pool modifier — built at `716187e`, item 6 below.
5. **CALLED and BUILT at `716187e` — the band shift a hazard prints.** The Toll-Vent's "1 band shift to
   all in the chamber" and the Gut Stone's "2-band shift" now move every body at the site one step
   OUTWARD in the same firing (`shiftAllBands` in `engine/ledger.js`, the number read by
   `hazardSpec().bands`): both clauses are detonations, and being thrown clear is what the fiction
   shows. Loose is the floor, so a hazard never throws anybody out of the scene; a clause that prints
   its own direction ("3 band shift toward the breach", the Breacher's pressure differential) is
   deliberately not swept up; and bodies with no band recorded — organisms move freely and are usually
   untracked between Drifts — are left alone rather than given a position the Engine never had. **Still
   unbuilt:** the slough's "-1 Drift per Move", which wants a ground/zone model (nothing in the Engine
   tracks who is standing in what) and sits with the Beat.
6. **CALLED and BUILT at `716187e` — the opaque lane is the scene paying, and Segments are a creature's
   number.** 8.2's "the lane goes opaque: every contest in the room is -2 dice for everyone" is now a
   property of the place: `panel.open` reads the Overflow off the throw that opened the panel, the page's
   numbers live in `soft-field.panelCloud = { overflow: 4, dice: -2 }`, `poolForCheck` and the Strike path
   both read it, and the roll carries a labelled part so the players can see where the dice went. It
   clears when the Cohort walks on, and a clean cut under 4 Overflow does not cloud anything. And a swarm's
   **Segments are its health track** — the block prints `MI 10 · soak 0 · pool 3d · Segments 6` in one
   line — so counting them out loud is now a leak, printed or invented; the gates' "each swarm is six small
   segments" and "two small bodies' worth of it left of what was a dozen" would both be caught. How the
   thing *looks* stays legal ("a dozen small ones wearing a slime coat" is the standing example), as does
   how much is left in the fiction ("half of it peeling away"). If the regex is too wide or too narrow, it
   is one line — `SEGMENTS` in `brain/director.js`.
7. **CALLED at `716187e` — the gate stays strict, and names which calls are refusing.** A refusal is the
   model reaching for something off the page even when the Engine catches it, and every one of today's
   fixes has been teaching it better rather than loosening the bar. What the summary adds is refusals
   **by call** (`hazard_damage 1, settle_oath 1`), so a gate read shows the habit at a glance instead of
   scrolling for it.
8. **CALLED and BUILT at `716187e` — an Oath is owed to somebody.** `swear_oath` from the Director refuses
   a promise that names no witness (the board's third price is "a promise sworn with an Order II fold to
   witness it", and §3.2 rewinds TOLL for an Oath kept "in front of a faction that notices"), and the
   description says the throw they are about to make is not by itself a promise. A human host may still
   file one freely. Run 2's `I shoulder through the wound lip before the flap closes` did name the fold
   holding the gate, so it would still pass — what is gone is filing a promise at nobody.
9. **BUILT at `95d1271` — a throw the page passed cannot be un-passed in prose.** Run 2 threw 16 against
   12 and was narrated as the lip folding over Bresk anyway, in the turn that settled the Oath as *kept*.
   `checkNarration` now flags `Reverses <who>'s <label>, which the page passed`, the rewrite is asked for,
   and the bench tallies **Reversed rolls in narration** and fails the gate on it. It reads only the
   success direction (a failed throw may work at a price — that is what a Cost is), and only in a sentence
   that names whoever threw it, so "the Sentinel has not moved an inch" is not a reversal. If the wording
   it catches is too narrow or too wide, `REVERSED` in `brain/director.js` is the one regex.
10. **In the next gate run, look for:** zero refusals (the summary now names them by call), zero leaks,
    zero unpaid damage, zero **Unpaid Clocks**, zero **Reversed rolls in narration**; **HUNGER at 1** after
    the first Pulse War in a scene; **CARCASS 1, not 2**, in a run that cuts a panel; and **no
    `set_condition` at all** after a hazard firing — one redundant `all_bodies` call is a legal no-op, one
    per body is a regression. New since `716187e`: the first Toll-Vent firing should log **"throws
    everyone outward"** with nobody able to narrate a shift before it, and if a run works the Soft Field
    panels hard at 4+ Overflow, look for the **opaque lane** line and the -2 dice showing up as a labelled
    part of the pool. No rewrite should quote "the Engine", "the Ledger", "the notes" or "the briefing",
    and none should count a swarm's Segments. Budget for the style tax as always: 20 of 81 turns needed the
    one-shot rewrite last gate, almost all of them "ran long, read out dice, or did not end on a question".
11. **A check of mine that was wrong, fixed at `caf1b2a`.** The Segments leak added at `716187e` matched
    any number near "segments/sections", which in this Vector is also how a cut is described: "four cut
    sections lie in the cradle of the current", "the wreck of the first one lies in sections at Vash's
    feet". Flagging those would have burned rewrites and failed runs for describing a harvest. It now
    decides whose count it is — nearest named owner, an explicit "four of its six sections", or an unnamed
    owner with a creature in the scene and nothing in the sentence pointing at a person or at the cut —
    with tests for both false positives. **The lesson for the next session: sweep any new narration rule
    over the saved transcripts before you trust it.**

Then Phase 4 with a real group: the scripted bench is rehearsal, not the gate.

Read in order: this file, then the bench findings above, then `README.md` "Not built yet". Rulings that
are settled and must not be reopened: creature arithmetic never spoken aloud ([[never-creature-dice]]
in memory, HANDOFF's own section) — **and since `716187e` that includes a swarm's Segments/sections
counts**, printed or invented; machinery words at the table are leaks; 3.4's one-advance-per-Clock cap is
printed and correct; a hazard's printed band shift throws everyone **outward** from the blast (a clause
that prints its own direction is a hand call); the opaque lane is a property of the scene, priced by the
page at 4+ Overflow for -2 dice on every contest here; an Oath the Director files names the witness it is
owed to; and the gate stays strict on refusals because a refusal is the model reaching off the page even
when the Engine catches it. The last four were **called by me on 13 Nov with Roly delegating** — he can
overturn any of them, and each is one number or one regex away from being changed.

The area-form family is closed except for one member: `set_condition` at `cbb2e52` (a chamber-wide
condition is one call) and the hazard's band shift at `716187e` (the same Effect clause, one step outward).
What is left of that family is the slough's **"-1 Drift per Move"**, which wants a ground/zone model —
nothing in the Engine knows who is standing in what — so it waits with the Beat. `harvestPays` covers the 12
printed creatures; the shipped-haul, salted-panel and Gut-Stone-serial rows in 3.1-3.3 are still prose, and
only one priced-choice row is applied.

All three of today's gates are saved and read (the `bench_13nov_am.log` set and the two runs pasted into the
session, written up in the findings below). **Next job is one more gate against `caf1b2a`** — it is the
first live look at the four delegated calls and at the two narration checks that now fail the gate — and
then Phase 4 with a real group.

## What this is
A tabletop RPG run by two parts: a rules **Engine** (all numbers and rules) and a language-model **Director** (narrates, calls tools). Players use phones, the table has a shared screen, the host has a console. Node server, plain browser front end, no build step.

Run it: `node server.js --new --port 8791 --saves /tmp/oxd-saves --host-key TEST01` (see README "Run it").
Test it: `node --test` (**141 tests**, all green at the site 3 and 4 prep below), `python3 tools/check_screens.py http://localhost:8791 TEST01 /tmp/oxd-shots` (Playwright, three screen sizes), `node tools/bench.mjs` (flags `--runs --sites 1-4 --players 4 --thinking --provider/--model/--url --plain-chronicle --log <file>`), `tools/fake-ai.mjs` stands in for a model.

## Rules of the house (keep these)
- **Engine first.** `apply(state, action, ctx)` in `engine/ledger.js` returns a new state or throws `RuleError`. The model never does arithmetic; it narrates and calls tools in `brain/tools.js`. `ctx.ai = true` marks Director-only limits.
- **Secrets stay on the host.** API keys live only in `saves/director.json` and `saves/voice.json` (git-ignored). Never send them to a screen or commit them.
- **Always include a Colours tab** in any app build; every colour comes from CSS variables.
- No page scroll on working screens; check at 1366x768, 1536x864, 1920x1080 and a 390 px phone.
- One question per reply inside the game.
- Commit and push only when Roly says "push". Commit messages end with the attribution lines the session specifies.
- Do not work around a permission denial.

## Layout
- `engine/` rules and Ledger (state). `data/` Vectors and The First Carve. `brain/`: `director.js` (briefing and turn), `manager.js` (provider, queue, chapters), `tools.js` (25 tools), `instructions.md` (the Director's standing instructions), `memory.js` and `chronicle.js` (history), `voice.js` (speech). `public/` front end (`app.js`, `app.css`). `server.js` routes. `test/` tests. `tools/` bench and screen check.

## State of the phases
0-3 done. **4 (the table) is the current gate: a real group plays two sites.** 5 (face and voice) is built and pushed but unmeasured. 6 is the campaign Director.

Built so far: session zero, Oaths and settling, New game with a Vector picker, memory (transcript, chronicle chapters, cast, `recall` and `remember`), harvest sharing (rotating remembered picking order, one offer per item, standing choices), voice out (per-screen switch, sentence queue, browser or OpenAI-compatible speech server), Talk button with consent at session zero, the living-organism face.

Since the 12 Nov draft: every site prices its printed creatures in `harvestPays` (11 entries across the five sites; it used to be one), `hazard_damage` is Engine-checked against the site's printed Trigger and Effect, the Thinking buttons on the Director tab remember which level is set, and the Director keeps creature arithmetic out loud.

## Bench: three real-model runs, 12–13 Nov (local `iq3_s`, thinking low)
**Run 1 — GATE NOT PASSED.** 24 turns, 13.0 s each, 3 Engine refusals (two `award` of 1.5 Codon for an already-harvested swarm, one `tally_post_offer` at the Toll-Vent, which has no post), 0 leaks, 1 style flag, and 8 of 24 turns needed the one-shot rewrite. The Cohort never left the Toll-Vent, so sites 2 and 3 went untested and 0 chronicle chapters were written. Fixed the same day: `view()` set `thinking` twice so the Thinking buttons could never show a choice; briefing lines saying the Engine pays harvest Codon itself and that a site has no Tally Post; a `# NOTHING HAS BEEN THROWN YET` block plus a `checkNarration` flag so the Director stops moving the table past a pending Reagent throw.

**Run 2 — 34 turns,** 11.5 s each, 1 refusal (`harvest` with the site's own id passed as `creature`, now a `note` rather than a refusal), 0 leaks, 2 chapters, ended at The Render Hall. The Oath loop was gone and the run reached sites 2 and 3, so the priced-choice Tally Post and both chronicle chapters got exercised.

**Run 3 (13 Nov) — 27 turns,** 2 refusals, 0 leaks, 0 style flags, stayed at the Toll-Vent so 0 chapters. The fixes held: the hazard call carried `"trigger":"Momentum"` and matched the printed Trigger clause, no Tally Post tool was attempted even though players asked for one twice, the Oath closed `kept` rather than looping, and style flags went from two to zero. Both refusals were "the page does not print that" attempts, now pre-empted by briefing lines (`2b08182`).

**The three-run gate at thinking medium (13 Nov, `--runs 3 --sites 2 --players 4`; its own log numbers them run 1-3).** GATE NOT PASSED, but this is the set that finally cleared item 2's missing coverage. Run 1: 24 turns, 19.2 s each, 701,584 in / 21,433 out, 1 refusal, 1 leak. Run 2: 34 turns, 18.7 s, 887,383 / 32,447, 0 refusals, 3 leaks, 2 style. Run 3: 24 turns, 16.9 s, 515,299 / 20,504, 3 refusals (all three the new hazard budget, and all three the Director trying to hit one more body with one detonation), 0 leaks, 0 style. About 2.1 M tokens in for the three, and thinking medium costs roughly 6 s a turn over thinking low. Reaches the Soft Field twice and the Render Hall once; 4 chronicle chapters in total.

**Hazards are now the Engine's, not the Director's promise (13 Nov).** Three changes, all from those runs. `hazardSpec` (`brain/tools.js`) reads the three shapes The First Carve prices a hazard in — an `Effect:` clause, "1 Lytic damage per Cycle", and a bare "20 Kinetic" behind a Clock — so the Soft Field (8.2) and the Gut Stone (8.5, "The Render Charge") are policed as well as the Toll-Vent and the Render Hall: at those two the Director could name any number from 1 to 20 and the trigger check was skipped outright, because neither prints an "Effect:" or "Trigger:" clause. A hazard also now has a firing budget in the Ledger (`hazard` action, `hazardBudget`, `state.hazards` + `state.sceneNo`): **once per Cycle inside a Pulse War, once per scene outside one** — CORE 8.1 says a Cycle is six seconds of combat and "once per scene" resets when the place, the purpose or the people change, and the CODEX's lair action (§3.2) is the same budget seen from inside a fight. And where the page prices the hazard for the whole chamber ("1 band shift to all in the chamber") one call pays every body: gate run 3 (against this session's uncommitted working tree — the bench reads the tree, not `HEAD`) showed the Director calling the pocket once per player and taking three refusals for it, which is what the area branch fixes.

**Damage the table heard but no tool paid for.** Gate run 2's worst moment: the gas pocket was narrated going off a second time — "six kinetic punch back up through Bresk's leading membrane" — with no `hazard_damage` behind it, so the number was invented in prose and nobody's MI moved. `checkNarration` now flags it (`kind: 'rule'`, "Says someone took damage the Engine never paid"), sends it to the one-shot rewrite, and `tools/bench.mjs` tallies it as `Unpaid damage in narration` and fails the gate on it. The leak half of that sentence — naming "the Engine", "the Ledger", "the notes" out loud at the table — is still there: 4 leak flags across the three runs, all of them machinery words, several caught and rewritten. Roly ruled the same day (second ruling, 13 Nov): **"the page has nothing printed for that" stays legal table talk** — instructions.md already tells the Director to say it — and everything else in that family is a leak. `MACHINERY` in `brain/director.js` now flags "the Engine", "the notes", the briefing, tool names and "the Ledger" *when it is doing Engine verbs* ("the Ledger keeps the rest to itself"), because the Soft Field post has a physical ledger in the fiction ("The Ledger's stylus hovers") that must not be mistaken for the Engine.

**Why the Clocks barely move (13 Nov), and what was built about it.** THE FIRST CARVE 3.4 prints the cap
out loud — "Advance at most one segment per session per clock... Never advance a clock because the players
failed a roll — advance it because they succeeded at something loud... rewinding is a whole category of play,
and in this Vector it is the *point*" — and `engine/ledger.js` enforces it as `c.aiAdvanced` for moves made
`by === 'ai'`. That cap is **correct and untouched**. What was missing is the other half of the same three
sections: 3.1-3.3 list what the *place* pays ("Advance +1 when... the Cohort opens a new panel", "Rewind -1
when... each body harvested: -1, never below 0", "the Cohort is loud in the channels (a Pulse War...)", "the
Cohort kills and leaves a body unharvested", "the Cohort keeps an Oath in front of a faction that notices"),
and none of it was a mechanic. So the Ledger pays those itself now: `scenario.rules.clockTriggers` in
`data/first-carve.js` names the Clock for each event ({ panelOpens: CARCASS, bodyCut: HUNGER, bodyLeft: HUNGER,
loud: TOLL, oathKept: TOLL }), and `payClock` writes the movement into the log so the players are told, the
Director is told, and its one discretionary advance is not wasted on a Clock that already moved. Five tests in
`test/ledger.test.js` hold each trigger, including that HUNGER never goes below 0 and that a second Pulse War
in the same scene is not loud twice. What is still untracked is the **Beat** ("Advance +1 when a Beat passes"),
which is the same missing family as the Cycle outside a Pulse War and the printed "1 band shift".

**What is still not cleared.** The "1 band shift" and "-1 Drift per Move" a hazard prints have no mechanic, so the Director narrates them and the Engine does not: same shape as the narrated countdowns, which still have no mechanic either. The run-1 Oath loop is latent, not fixed. The Engine still applies only one priced-choice row. (`set_condition`'s missing area form was the other half of that sentence — now built, see below.)

**A condition the page prices for the chamber is one call (13 Nov, `cbb2e52`).** The Toll-Vent's Effect clause prices three things at once: "6 Kinetic, Jostled, 1 band shift to all in the chamber." The 6 Kinetic was made one firing that pays every body; the Jostled still had no area form, so one detonation meant four `set_condition` calls, one per body. Legal, but four turns and four log lines for what the page writes as one price. Now the `condition` action in `engine/ledger.js` takes `area` and pays every body the Cohort has at the site — the same set `hazard_damage` pays — stamps a `timed` condition with the same end-of-next-Cycle expiry, and writes one line to the log ("Bresk…, Brost… are Jostled: -1 PP; MT -2"). Re-applying is a no-op, not a stack; `on: false` clears the chamber in one call. `set_condition` exposes it as `all_bodies` and returns who carries what. Which conditions those are stays on the page: `hazardSpec().conditions` reads them from the site's own Hazard note and cuts at "Counter:" so "Brace and ride it" cannot read as a price — only the Toll-Vent prints one, and the briefing line appears only where the note does. The band shift in the same clause is deliberately **not** built: pricing one is Roly's call.

**The 13 Nov gate at thinking medium, saved (`bench_13nov_am.log`, `--runs 3 --sites 2 --players 4`).**
GATE NOT PASSED, on run 1 alone, and it is the cleanest set yet. Run 1: 23 turns, 18.7 s each, 708,167
tokens in / 18,811 out, 2 refusals, 1 leak, **0 unpaid damage**, 2 style, ended at The Render Hall.
Run 2: 26 turns, 16.8 s, 0 refusals, 0 leaks, 0 unpaid, 0 style. Run 3: 32 turns, 16.3 s, 0/0/0,
1 style, ended at The Soft Field. About 2.16 M tokens in for the three, all three left the Toll-Vent,
5 chapters across the set. **Unpaid damage is 0 across ~81 turns** — that is the check that failed the
previous gate, and it holds now. What the flags were: the 2 refusals were Pulse War bookkeeping (a
`creature_stand_down` on something already stood down, then `end_pulse_war` while the Fold Sentinel was
still up) and the refusals corrected it on the next calls; the 1 leak was **"Next briefing will carry
the Soft Field" said to the players** — the `change_site` description quoted back. So the vocabulary we
address the Director in is now held to the same rule as its narration, and a test walks every tool
description, parameter and refusal path against `MACHINERY` (`5eee166`). What it also caught: run 3's
**second** hazard firing had no `set_condition` after it, so the Jostled that same Effect clause prints
landed on nobody with no flag for it — the firing pays the condition now. Two things to know for the
next run: 20 of ~81 turns needed the one-shot rewrite and 17 of those were style ("ran long, read out
dice, or did not end on a question"), so style, not rules, is the main turn cost; and HUNGER stayed 0
everywhere because `bodyLeft` only pays for a body that is down and uncut when the Cohort walks out,
which none of these runs did. **Windows note:** PowerShell's `>` writes the log as **UTF-16LE** and
double-mangles em dashes and curly quotes, so it is ungreppable until converted
(`iconv -f UTF-16LE -t UTF-8`). Better: let `bench.mjs` write its own file — it does now, with
`--log <file>` at `8358eba`.

**The 13 Nov afternoon gate (`--runs 3 --sites 2 --players 4 --thinking medium`, tree at `0f189ca`):
GATE NOT PASSED on run 2's three refusals, and otherwise the cleanest set yet.** Run 1: 33 turns, 17.8 s
each, 808,951 in / 28,251 out, 0 refusals, 0 leaks, 0 unpaid damage, 1 style, CARCASS 1 / TOLL 1 /
HUNGER 0. Run 2: 24 turns, 18.2 s, 578,985 in, **3 refusals**, nothing else. Run 3: 24 turns, 662,209
in, 0/0/0. About 2.05 M tokens for the three, all three reached The Render Hall, 6 chapters, and **zero
leak flags across 81 turns** — the tool-string pass and the briefing pass both held. All three runs took
the scripted "how many dice does the swarm roll, and what is its Membrane Threshold?" and answered with
behaviour and consequence, no number, no sending the player to a sheet; run 1 also had one draft caught
and rewritten for creature numbers before anyone saw it. The `set_condition` tell came back right: runs
2 and 3 made **no** call after a firing (the firing paid the chamber its own Jostled), and run 1 made one
redundant `all_bodies` call — a legal no-op on bodies already carrying it, not the per-body regression
we were watching for.

**The three refusals, and what each became.** (1) `swear_oath` with `"A promise offered to the drone
gate… the players have not yet said what it is"` — that is the `spokenAtTable` guard working, and the
model asked for the player's words next turn; it still fails the gate, which is Roly's call to score
differently. (2) `creature_move` refused with "There is no Pulse War running" — nothing in the briefing
or the standing instructions had told the model that out of a fight nobody acts on a turn, so both now
say it, naming the four refused creature actions. (3) `creature_stand_down` on a body already stood
down — restating a true thing is not a rule break, so the tool answers with a `note` and the run is not
marked against it.

**Two Clock defects this set found, and both were ours, not the Director's.** (a) **A panel can be paid
twice.** Run 3 called `move_clock CARCASS +1` and `harvest` with no creature in one step, and CARCASS
ended at 2 where runs 1 and 2 — where the Director kept its hands off — ended at 1. So the panel ruling
below is not hypothetical: when a run opens a panel without cutting it the Director burns its one
discretionary advance, and when it does cut, `panelOpens` pays again on top. (b) **HUNGER's printed row
was unwired while the page priced it.** Run 2 narrated "the noise of it is being counted: HUNGER moves a
segment for a fight this loud", HUNGER stayed at 0, and nothing flagged it. §3.2 prices the Cohort being
loud in the channels on TOLL and §3.3 prices "the Cohort fights loudly" on HUNGER — one event, two
Clocks — but `clockTriggers` held one id per row. So `loud: ['TOLL', 'HUNGER']` now, paid through
`payTrigger`, still once per scene, and a `checkNarration` rule flag (**Unpaid Clocks in narration**,
tallied by the bench and it fails the gate) names a Clock the narration moved when the recent log lines
show nothing moved it. Naming a Clock the page did move stays legal and required: §3.4 says advance it in
front of the players and name it, and the check window is recent log lines, not only this turn, so a
faithful restatement a beat later does not burn a rewrite. The match is on the Capitalised Clock names,
so "the toll board" and "the carcass bursts" are not Clocks.

**One ruling this set leaves open: segment counts.** The Director said "each swarm is **six small
segments**" and "six segments each, then fewer". `Segments 6` is the printed Gnaw Swarmling line
(`MT 12 · MI 10 · soak 0 · pool 3d · Segments 6`) and the leak check only catches integrity/MI wording,
so it passed. Is a swarm's Segments a creature's number like MI, or something the players can watch? If
it is a number it goes in the check, not in prose.

**The 13 Nov evening gate (`--runs 2 --sites 2 --players 4 --thinking medium`, tree at `c931149`):
GATE NOT PASSED on one refusal per run, and the new checks came back clean.** Run 1: 30 turns, 18.7 s
each, 759,472 in / 27,048 out, 1 refusal, 0 leaks, 0 unpaid damage, **0 unpaid Clocks**, 0 style, ending
at The Render Hall with CARCASS 2 / TOLL 1 / HUNGER 0. Run 2: 25 turns, 17.9 s, 683,175 in, 1 refusal,
0/0/0, 1 style. That is **two gates in a row — 136 turns — with zero leak flags and zero unpaid damage**.
The Clock wiring from `ed536dd` shows up correctly: HUNGER reads 0 at both ends not because it never
moved but because §3.3 pays −1 for every body harvested and these Cohorts harvested everything (run 2:
+1 for a loud Pulse War, −2 for two cut bodies, clamped at 0), and TOLL landed where the printed rows say
it should. The Unpaid Clocks check saw three real Clock sentences the runs narrated — all paid, none
flagged — and had nothing to complain about, so the false-positive worry did not materialise. Both runs
still ended at **CARCASS 2 because the Director spent its one advance on a panel and `harvest` paid
`panelOpens` on top**: item 4's double payment is now 2 for 2.

**The two refusals, both the page policing itself, both fixed at `f3e5a6d`.** Run 1 priced the Glaze
Medusas' trailing field as a hazard — `4 Osmotic`, `"trigger":"failed roll"` — at a site whose only
printed hazard is the slough patch at 1 Lytic per Cycle from CARCASS 3 up, with no Pulse War running and
no creature on a turn; the refusal quoted the site's own Hazard line and the model accepted it ("Nothing
bites, but the Beat goes"). The description now says both halves up front: only this site's printed
hazard, at the printed number and type, and a creature's own attack, sting or field belongs to the
creature on its own turn inside a Pulse War. Run 2 settled an Oath kept after the crossing and then
tried to settle the same Oath broken on the way out — restating its own record, so it answers with a note
like `ed536dd` did for `creature_stand_down`.

**Two things this set shows that are rulings, not bugs, and I have not touched either.** (1) **A roll's
outcome contradicted in prose.** Run 2's Bresk threw 16 against 12 — success, Overflow 4 — and the
narration said "The lip folds over Bresk instead of parting" and "the promise broke at the moment of its
keeping", in the same turn that settled the Oath as *kept*. The briefing prints `SUCCESS, Overflow 4`, so
the model had the result and wrote the opposite; nothing checks a narration that undoes a throw the page
just passed. A rule flag on that shape is possible — the roll line names the actor and its label, so it
need not be vague — but how much failure language counts is a taste call, so it waits for Roly. (2) **An
Oath that is only the attempt.** Run 2 filed `I shoulder through the wound lip before the flap closes` —
the player's own action line — as the sworn promise, and the next roll both resolved the crossing and
settled the Oath. `spokenAtTable` passed it because the words really were said at the table. Is a
declaration of what you are about to do an Oath at all, or must a promise be owed to someone (a witness,
a faction, a price) before it can be filed? (3) The **segments** ruling from the afternoon gate got
busier: "five of the dozen scatter… one small body and its coat" and "two small bodies' worth of it left
of what was a dozen" — the arithmetic matched the Engine exactly (11 Overflow removes ⌈11/3⌉+1 = 5 of the
printed 6), but "a dozen" is not the printed number either, so that ruling covers both leaking the block
and inventing a count.

**The Director may only swear words the table said (13 Nov).** Bench run 3 swore
`"Bresk's own words: \"We have no stamp. We offer a promise, witnessed and filed.\" — to be asked what is
promised."` The Engine wrote that into the Oath, `recall` later read it back to Bresk as his own promise, and a
second Oath went on top of it. `oath.swear` now refuses scaffolding outright ("to be asked", "ask first",
"own words:"), and for the Director only (`ctx.ai`) refuses any promise that does not sit inside something a
seated player has said in the last forty story lines — `spokenAtTable` in `engine/ledger.js`. A human host may
still phrase an Oath freely. The refusal tells it to ask, then use their words.

**An Oath sworn with the Director's own scaffolding in it (run 3, 13 Nov).** The player never said
what they promised, so the Director called `swear_oath` with the promise `"Bresk's own words: \\"We
have no stamp. We offer a promise, witnessed and filed.\\" — to be asked what is promised."` The
Engine wrote that into the Oath, `recall` later read it back to the table as what Bresk swore, and a
second Oath was sworn over the same scene. `swear_oath` should refuse a promise that is not the
player's words — the tell being "to be asked", a colon-then-quote shape, or a promise naming the
Director's own turn — and the standing instruction says ask first, which the model skipped.

Not faults, checked and cleared: run 1's `award` of 20 Codon each at the Soft Field and run 3's of 15
each at the Toll-Vent are both printed in those sites' `Pays` lines, which is why the Cohorts finish
those runs with such different Codon (23 against 6). The Engine's `printedPays` guard held.

**Windows notes for a bench run.** Use **`--log bench_13nov_pm.log`** (`8358eba`): the harness writes its own UTF-8 file, which is what the mangled logs on disk needed `iconv -f UTF-16LE -t UTF-8` to read. `--runs`, not `--run`. `--sites 3` does not play a third site — the scripted table only has lines for two. `> bench_$(date …).log` does not expand in cmd, so every run overwrites `director/bench_.log`; name the file yourself, and note that `*.log` in `director/` is ignored by git now. A run against `tools/fake-ai.mjs` prints GATE PASSED with `0 recall, 0 remember, 0 chapter(s)` and proves only that the harness loads. House command: `node tools/bench.mjs --runs 1 --sites 2 --players 4 --plain-chronicle --thinking low`.

**Do not re-accuse the Director of inventing these three — all were printed, with sources.** The "toll manifest" is the scenario's own Tie, `data/first-carve.js` line 18: *"Your name is on the toll manifest as the escort for the whale's last cargo."* A `creature_special` of `Present` at cost 3 is the Fold Sentinel's printed Special, in `data/bestiary.json` under `fold-sentinel`: *"Special — Present (3 PP): it declares a zone 3 Drifts wide Held for 3 Cycles."* The gas pocket that fired after Vash's Strike was legal: the Toll-Vent's `host.hazard` (`data/first-carve.js` line 95) reads *"Trigger: a Kinetic hit, a Strike, Momentum. Effect: 6 Kinetic, Jostled"*. Before ruling that a hazard, Clock or damage call broke the rules, read that site's `host.hazard` and Clock notes in `data/first-carve.js` and the creature's entry in `data/bestiary.json` — the scenario prose and the stat block define what is legal, not the standing instructions. (I got this wrong twice on 12 Nov, so the check is worth the two minutes.)

## Roly's ruling on creature numbers (13 Nov) — do not reopen
The Director **never** says how many dice an attacking creature rolls, nor its Membrane Threshold, Membrane Integrity, soak, or how many **Segments/sections** it has left (added at `716187e`: a swarm's Segments are its health track, the block printing `MI 10 · soak 0 · pool 3d · Segments 6` in one line, so counting them is the same fault whether the number is printed or invented). No count, no range, no "a handful". It must not tell a player to look the numbers up on their own sheet either — nobody at the table holds creature numbers, so pointing at a page that lacks them is a lie, not a deflection. Behaviour and consequence are what the Director may give: "a dozen small ones wearing a slime coat", "brittle: anything that spreads takes sections off it". This settles the tension with `19245ab` ("never deny a printed creature"): never deny that a creature exists or refuse to engage with it, just never voice its arithmetic. The Engine owns the number, the briefing shows it to the Director, and `checkNarration` in `brain/director.js` is what protects it — so any new phrasing goes through that leak check, not through prose alone. When a bench log shows the Director answering a rules question about a creature, check whether it said a number before deciding anything is wrong.

## Using a different inference server
The Director talks to any OpenAI-compatible or Ollama-style server; set it on the host's Director tab (address, key, model, context size, thinking level). Local setup that was benched: Qwen3.8-Flash-Next `iq3_s` on a Ryzen 9 5950X / 128 GB / RTX 3090. Thinking: default 20-26 s a turn, medium ~15 s, low ~11-13 s (recommended, benched clean), off ~5.6 s (rule errors). Chronicle chapters always run with thinking off. The model must support tool calling; the Director tab's Test button checks that. Speech uses separate servers (`/v1/audio/speech`, `/v1/audio/transcriptions`) set on the Voice tab.

## Open items
1. Measure narration-to-first-sound with Kokoro (speech) and `Systran/faster-whisper-small` (listening) on the PC. Target: speech starts within about 2 s.
2. Bench coverage: three `--thinking medium` gates ran on 13 Nov (`bench_13nov_am.log`, plus the
   afternoon and evening sets written up above). **No gate has passed yet, and the last two failed only on
   refusals** — five between them, all fixed — while leaks and unpaid damage stayed at zero across 136
   turns. The next run is against `caf1b2a` and is the first live look at the four delegated calls and the
   two narration checks that now fail the gate, so read the flags before blaming the model. Qwen3.8-27B
   Q4_K_M is still untried. Phase 4 still needs a real group playing two sites — that is the gate, not
   another scripted run.
3. Not built: save slots and Supabase copy (plan: rules and Vectors stay in GitHub; saves local first, Supabase as a copy; free plan pauses after 7 days idle and has no backups); ad-libbing (`improv: 'adlib'` is refused until built); Discord sign-in (deferred).
4. The project doc `claude/director-phase3-build.md` named in the 12 Nov draft is not in this repo — not tracked and not on disk. If it lives outside this folder it still needs updating for the picker, memory and Phase 5; otherwise the item is void.
5. The Clocks: 3.1-3.3's triggers are now Engine rules (see the Clocks finding above). **Built at
   `95d1271`:** opening a panel is one Engine event (`panel.open`, and `open_panel` for the Director),
   which closes the gap where a panel opened by a roll rather than a `harvest` paid nothing and the
   Director spent its one discretionary `move_clock` doing the Vector's job (log line 584, then CARCASS 2
   in both evening runs from one panel). `rules.panelOpensPerScene` is the Vector's number for how many
   panel openings one scene pays; it is 1, and 0 means every panel pays its own segment. **Found checking this (13 Nov):** it is not only a Clock. The same printed act
   carries a second price nobody pays — the Soft Field's "Cut a panel loose (a Kinetic hit, 4+ Overflow) and
   the lane goes opaque: every contest in the room is -2 dice for everyone" (`data/first-carve.js:134`) — so
   the question is really whether "a panel is opened" becomes one Engine event paying both. My steer is the
   small action: it keeps the "nothing happens unless a call pays for it" rule and avoids matching prose in
   `what_for` to decide what a roll meant. **The afternoon gate priced the same act twice:** run 3 spent the
   Director's one `move_clock` and then `harvest`ed the panel, and CARCASS ended at 2.
   **Fixed at `ed536dd`, two parts:** `loud` now names `['TOLL','HUNGER']` because §3.2 and §3.3 both price
   the Cohort being loud (paid through `payTrigger`, still once per scene), and `checkNarration` flags a
   Clock the narration moves that nothing moved — **Unpaid Clocks in narration** — which the bench tallies
   and the gate fails on.
   Also unbuilt: the **Beat**
   ("a Beat passes with no cut signed and no haul shipped" is three of those rows), salting a panel or a wound
   (the printed CARCASS/HUNGER rewind), shipping a haul to a buyer, the Gut Stone's serial turned in at a
   Warden register arch, and the Soft Field's opacity at 4+ Overflow ("every contest in the room is -2 dice
   for everyone") — a scene-level pool modifier, in the same missing family as the Beat and the band shift.
6. Area forms: `set_condition` is done at `cbb2e52` (an area condition is one call for the chamber) and
   the hazard's printed **"1 band shift"/"2-band shift"** is done at `716187e` — `shiftAllBands` moves
   every body at the site one step outward in the firing, the number read by `hazardSpec().bands`. The
   direction was the open question and I called it outward (both clauses are detonations; being thrown
   clear is the fiction); clauses that print their own direction ("toward the breach") are left to the
   hand that printed them. **Still missing:** the slough's "-1 Drift per Move", which needs the Engine to
   know who is standing in which patch of ground — the same missing model as the Beat and the
   narrated countdowns.
7. The opaque lane (`716187e`) reads on organism checks and the player Strike path, **not on creature
   attacks** — so "every contest in the room is -2 dice for everyone" is honoured on one side only. Fine to
   leave while the fight math is being watched; the place to finish it is where the creature pool is built
   in `engine/ledger.js`, reading `s.scene.cloud` the same way `poolForCheck` now does.
8. **HUNGER cannot climb for a Cohort that harvests** (§3.3: +1 for fighting loudly, −1 for every body
   harvested, never below 0) — **one printed route now exists:** at the Brood a cut is priced as +2, not
   −1, so a Cohort that butchers the not-whale's young pays for it. The general question is still yours.
   (§3.3: +1 for fighting loudly, −1 for every body
   harvested, never below 0). Five gates, HUNGER 0 every time, and its Feeders / Render / Render-Cascade
   segments never reached. Rule-correct, but it makes the danger clock decorative for a thorough Cohort —
   Roly to decide whether the loud row should pay more than one segment, or the refund should be capped.

## Design decisions to preserve
- Speech starts within ~2 s; local voice first; the Director's voice also works on remote devices.
- Speech transcription needs consent at session zero; a decliner types and taps.
- The speech server may only speak lines the Director narrated.
- The Director cannot choose or reorder the harvest picking; stamping waits for sharing.
- `recall` with `for_players` returns only what the table was told; cast entries carry origin (page, table, improvised) and seen/unseen facts.
- End goal: the Director ad-libs story, NPCs and encounters, so keep memory and cast features compatible with that.

## Limits of the tooling here (worth knowing for whoever picks this up)
Claude's Linux shell has no outbound network, so `git push`, real-model bench runs, cloud providers and `tools/check_screens.py` all have to be run by Roly on Windows. Reading the repo and its history offline is fine, as are `node --test`, `node server.js`, and `node tools/bench.mjs` against `tools/fake-ai.mjs`. Two traps: the Windows working tree shows ~89 files as "modified" whose diffs are whole-file 1:1 insertions/deletions — pure CRLF/LF noise, so check `git diff --numstat` for that pattern before treating a dirty tree as real work (no `.gitattributes` yet; `* text=auto eol=lf` would end it). And a 0-byte `.git/index.lock` was present on 13 Nov — if git refuses to run, delete that file.
