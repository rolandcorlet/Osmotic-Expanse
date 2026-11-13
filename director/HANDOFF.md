# Handoff: continuing The Osmotic Expanse AI Director

Written 12 November 2026, after Phase 5 was pushed (commit `2ac11f4` on `main`, repo `rolandcorlet/Osmotic-Expanse`, folder `director/`). **Updated 13 November 2026** at `2ac4384`. Read this first, then `README.md` and `HOST-GUIDE.md` in the same folder.

Those five bench fixes (`8ec4fa5`..`2ac4384`) and this doc (`3f58021`) **are pushed**, and so is the whole 13 Nov morning stack: Roly pushed at 11:01, so `origin/main` sits at **`ae24bc5`**. Since then `8358eba` (the briefing held to the leak rule, plus the bench housekeeping), `0f189ca` (this file) and `ed536dd` (the afternoon gate's fixes) have landed, and Roly pushed through `0f189ca` at 12:35 — so `origin/main` sits at **`0f189ca`** and **`ed536dd`, `c931149`, `f3e5a6d` and this file are what is not pushed.** Roly pushes.

## Starting a new session (as at 13 Nov, ~14:40 — HEAD `f3e5a6d` plus this file)

Today landed eight: `f4d68e0` (hazards owned by the Engine: the firing budget, the widened
`hazardSpec` parse, the unpaid-damage guard that now fails the bench gate), `4070dd6` (Roly's leak
ruling: "the page prints nothing for that" is legal table talk, the Engine and the Ledger are not),
`b4c4b07` (the Vector pays its own Clocks from 3.1-3.3, and `oath.swear` refuses a promise the
table never said), `cbb2e52` (an area condition: the `condition` action takes `area` and
`set_condition` takes `all_bodies`, so a chamber-wide Jostled lands on every body in one call),
`5eee166` (a hazard pays the condition its own Effect clause prints, and the words we address the
Director in are held to the same leak rule as its narration), and `8358eba` (the **briefing** held to
that same rule, and the housekeeping: `*.log` in `director/.gitignore` plus a `--log <file>` flag on
`tools/bench.mjs`), and `ed536dd` (the afternoon gate's fixes: `loud` pays TOLL **and** HUNGER as §3.2
and §3.3 print it, an **Unpaid Clocks in narration** rule flag that the bench tallies and the gate fails
on, the briefing and the instructions telling the Director that nobody acts on a turn outside a Pulse
War, and a repeat `creature_stand_down` as a note rather than a refusal), and `f3e5a6d` (the evening gate's
one fix each: `hazard_damage` says in its own words that only this site's printed hazard counts and a
creature's sting or field is not a hazard, and settling an already-closed Oath answers with a note).
Roly pushed through `0f189ca` at 12:35; `ed536dd`, `c931149`, `f3e5a6d` and this file are unpushed.
`node --test` is
**132 green**. The working tree shows
~82 "modified" files and every one of them is pure CRLF noise: check `git diff --numstat` for equal
insert/delete counts before believing a dirty tree. The two bench logs no longer show as untracked,
because they are ignored now — get one with `--log` rather than a redirect.

### For the next session — start here

Nothing is broken and waiting: 130 tests green, and the afternoon gate has run (its numbers and what it
found are in the findings below). **Zero leak flags and zero unpaid damage across 81 turns**; its only
failure was run 2's three refusals, all fixed at `ed536dd`. What is left are **rulings, not jobs** — do
not start any of them until Roly answers.

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
4. **RULING NEEDED — who pays a Clock when a panel is opened by a roll rather than by a harvest**
   (Open item 5). `panelOpens` is paid at `engine/ledger.js:719`, inside the harvest branch that has no
   creature id, so a successful roll that cracks a panel open pays CARCASS nothing — and the afternoon
   gate paid for the missing rule out of the Director's one advance: **run 3 called `move_clock
   CARCASS +1` and `harvest` with no creature in one step and ended at CARCASS 2**, where runs 1 and 2,
   which never spent the advance, ended at 1. So a panel is currently priced twice, or not at all,
   depending on whether the model notices. The same printed act also carries a second price nothing pays:
   the Soft Field's "Cut a panel loose (a Kinetic hit, 4+ Overflow) and the lane goes opaque: every
   contest in the room is -2 dice for everyone" (`data/first-carve.js:134`). My steer is one small action
   the Director calls when a panel opens — CARCASS +1 and the opacity on the printed Overflow — because
   it keeps "nothing at the table happens unless a call pays for it" and stops the roll path guessing
   intent from `what_for` prose. One word from Roly and it is a change plus tests.
5. **STILL BLOCKED — the band shift** (Open item 6): "1 band shift to all in the chamber", the Gut
   Stone's "2-band shift" and the slough's "-1 Drift per Move" have no mechanic, so all three get
   narrated rather than paid. Nothing is built here — pricing one is Roly's call, and the printed text
   does not say which way a hazard shifts everyone (toward the breach, or away from the blast), or
   whether "-1 Drift per Move" belongs to the Move action at all.
6. **RULING NEEDED — is a swarm's Segments a creature's number, or something the players can see?** The
   afternoon gate's Director said "each swarm is six small segments" and "six segments each, then fewer",
   and `Segments 6` is exactly the printed Gnaw Swarmling line. The leak check catches integrity/MI
   wording and dice, not Segments, so it passed. If it is a number it goes in `checkNarration` and the
   rewrite prompt, not in prose; if it is observable, say so and it stays legal.
7. **RULING NEEDED — should a guard refusal that corrects itself fail the gate?** Run 2's first refusal
   was `swear_oath` carrying `"A promise offered to the drone gate… the players have not yet said what it
   is"`, which is the `spokenAtTable` guard from `b4c4b07` doing precisely what it was built for; the
   model asked for the player's words on the next turn and no false Oath was written. It still counted as
   a refusal and cost the run the gate. Either score guard catches separately from rule breaks, or leave
   the bar where it is and accept that a working guard makes a clean pass harder.
8. **In the next gate run, look for:** zero refusals, zero leaks, zero unpaid damage and now also **zero
   Unpaid Clocks**, with **HUNGER at 1 after the first Pulse War in a scene** (§3.3 paying like §3.2
   does). Still: **no `set_condition` at all** after a hazard firing — one redundant `all_bodies` call is
   a legal no-op (run 1 of this gate made one), but one call **per body** is a regression. And read
   whether CARCASS reaches 2 in a run that both spent its discretionary advance and cut a panel: that is
   item 4's double payment, which `ed536dd` did not touch. Budget for the style tax too: 20 of 81 turns
   needed the one-shot rewrite again, and almost all of them were "ran long, read out dice, or did not
   end on a question" rather than a rule fault. **The evening gate confirms the tells and clears the
   new ones:** zero leaks, zero unpaid damage, zero unpaid Clocks across 55 turns, HUNGER reading 0
   because §3.3 refunds every harvested body rather than because it never moved — and CARCASS at 2 in
   both runs, so item 4 is now 2 for 2.
9. **RULING NEEDED — must a sworn promise be owed to someone, or may it be the player's own action
   line?** Run 2 of the evening gate filed `I shoulder through the wound lip before the flap closes` as
   the Oath, and the next roll both resolved the crossing and settled it. `spokenAtTable` passes it,
   because the words genuinely were said at the table.
10. **RULING NEEDED — should a narration that undoes a successful roll be flagged?** Run 2 threw 16
   against 12 and was narrated as the lip folding over Bresk anyway, in the same turn that settled the
   Oath as *kept*. `checkNarration` has no such check; the roll line names the actor and its label, so a
   rule flag is buildable, but where "the cost of a success" stops and "reversing it" begins is your call.

Then Phase 4 with a real group: the scripted bench is rehearsal, not the gate.

Read in order: this file, then the bench findings above, then `README.md` "Not built yet". Rulings that
are settled and must not be reopened: creature arithmetic never spoken aloud ([[never-creature-dice]]
in memory, HANDOFF's own section), machinery words at the table are leaks, and 3.4's one-advance-per-Clock
cap is printed and correct.

Queued, in the order I would take them: **(1)** the half of "area forms" still missing — the **band
shift**. `set_condition` is built (`cbb2e52`: the Ledger's `condition` action takes `area`, the tool
takes `all_bodies`, `hazardSpec().conditions` reads the printed condition off the site's own note, and
the briefing says one call covers the chamber). What is left in that clause is the hazard's printed
"1 band shift to all in the chamber", the Gut Stone's "2-band shift" and the slough's "-1 Drift per
Move": none has a mechanic, so all three are narrated rather than paid. **Blocked on Roly's ruling** —
how the Engine prices a band shift when a hazard pays it, and whether "-1 Drift per Move" belongs to
the Move action at all; **(2)** the Cycle outside
a Pulse War and the **Beat**, which unlock three of the printed Clock rows, the hazard "per Cycle" rows and
the narrated countdowns; **(3)** the run-1 Oath loop, still latent; **(4)** only one priced-choice row is
applied by the Engine; **(5)** `harvestPays` covers 12 creatures but the shipped-haul, salted-panel and
Gut-Stone-serial rows in 3.1-3.3 are still prose.

That gate ran on 13 Nov (Roly) and is saved as `director/bench_13nov_am.log` — the numbers are in the
findings below. It cleared the hazards and proved the area condition works at the table; the two things
it exposed are fixed at `5eee166`. **Next job is Phase 4 with a real group** — the scripted bench is
rehearsal, not the gate — plus one ruling listed under Open items: who pays a Clock when a panel is
opened by a roll rather than by a harvest.

## What this is
A tabletop RPG run by two parts: a rules **Engine** (all numbers and rules) and a language-model **Director** (narrates, calls tools). Players use phones, the table has a shared screen, the host has a console. Node server, plain browser front end, no build step.

Run it: `node server.js --new --port 8791 --saves /tmp/oxd-saves --host-key TEST01` (see README "Run it").
Test it: `node --test` (**132 tests**, all green at `f3e5a6d`, the evening-gate fixes), `python3 tools/check_screens.py http://localhost:8791 TEST01 /tmp/oxd-shots` (Playwright, three screen sizes), `node tools/bench.mjs` (flags `--runs --sites 2 --players 4 --thinking --provider/--model/--url --plain-chronicle`), `tools/fake-ai.mjs` stands in for a model.

## Rules of the house (keep these)
- **Engine first.** `apply(state, action, ctx)` in `engine/ledger.js` returns a new state or throws `RuleError`. The model never does arithmetic; it narrates and calls tools in `brain/tools.js`. `ctx.ai = true` marks Director-only limits.
- **Secrets stay on the host.** API keys live only in `saves/director.json` and `saves/voice.json` (git-ignored). Never send them to a screen or commit them.
- **Always include a Colours tab** in any app build; every colour comes from CSS variables.
- No page scroll on working screens; check at 1366x768, 1536x864, 1920x1080 and a 390 px phone.
- One question per reply inside the game.
- Commit and push only when Roly says "push". Commit messages end with the attribution lines the session specifies.
- Do not work around a permission denial.

## Layout
- `engine/` rules and Ledger (state). `data/` Vectors and The First Carve. `brain/`: `director.js` (briefing and turn), `manager.js` (provider, queue, chapters), `tools.js` (24 tools), `instructions.md` (the Director's standing instructions), `memory.js` and `chronicle.js` (history), `voice.js` (speech). `public/` front end (`app.js`, `app.css`). `server.js` routes. `test/` tests. `tools/` bench and screen check.

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
The Director **never** says how many dice an attacking creature rolls, nor its Membrane Threshold, Membrane Integrity or soak. No count, no range, no "a handful". It must not tell a player to look the numbers up on their own sheet either — nobody at the table holds creature numbers, so pointing at a page that lacks them is a lie, not a deflection. Behaviour and consequence are what the Director may give: "a dozen small ones wearing a slime coat", "brittle: anything that spreads takes sections off it". This settles the tension with `19245ab` ("never deny a printed creature"): never deny that a creature exists or refuse to engage with it, just never voice its arithmetic. The Engine owns the number, the briefing shows it to the Director, and `checkNarration` in `brain/director.js` is what protects it — so any new phrasing goes through that leak check, not through prose alone. When a bench log shows the Director answering a rules question about a creature, check whether it said a number before deciding anything is wrong.

## Using a different inference server
The Director talks to any OpenAI-compatible or Ollama-style server; set it on the host's Director tab (address, key, model, context size, thinking level). Local setup that was benched: Qwen3.8-Flash-Next `iq3_s` on a Ryzen 9 5950X / 128 GB / RTX 3090. Thinking: default 20-26 s a turn, medium ~15 s, low ~11-13 s (recommended, benched clean), off ~5.6 s (rule errors). Chronicle chapters always run with thinking off. The model must support tool calling; the Director tab's Test button checks that. Speech uses separate servers (`/v1/audio/speech`, `/v1/audio/transcriptions`) set on the Voice tab.

## Open items
1. Measure narration-to-first-sound with Kokoro (speech) and `Systran/faster-whisper-small` (listening) on the PC. Target: speech starts within about 2 s.
2. Bench coverage: the saved `--thinking medium` gate ran 13 Nov (`bench_13nov_am.log`, numbers above). Its only faults are fixed at `5eee166`, so **a clean pass of it is still outstanding** — and Qwen3.8-27B Q4_K_M is untried. Phase 4 still needs a real group playing two sites — that is the gate, not another scripted run.
3. Not built: save slots and Supabase copy (plan: rules and Vectors stay in GitHub; saves local first, Supabase as a copy; free plan pauses after 7 days idle and has no backups); ad-libbing (`improv: 'adlib'` is refused until built); Discord sign-in (deferred).
4. The project doc `claude/director-phase3-build.md` named in the 12 Nov draft is not in this repo — not tracked and not on disk. If it lives outside this folder it still needs updating for the picker, memory and Phase 5; otherwise the item is void.
5. The Clocks: 3.1-3.3's triggers are now Engine rules (see the Clocks finding above). **Ruling needed:**
   a panel opened by a successful roll rather than by a `harvest` pays nothing — `panelOpens` is only wired
   into the harvest path (`engine/ledger.js:719`, the branch with no creature id), and in the 13 Nov gate
   the Director spent its one discretionary `move_clock` doing the Vector's job (log line 584). Options: a
   small "open a panel" action that pays CARCASS itself, or pay it from the roll that opened it, or leave it
   to the Director's advance. **Found checking this (13 Nov):** it is not only a Clock. The same printed act
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
   (the printed CARCASS/HUNGER rewind), shipping a haul to a buyer, and the Gut Stone's serial turned in at a
   Warden register arch.
6. Area forms: `set_condition` is done at `cbb2e52` (an area condition is one call for the chamber).
   Still missing where the page prints area: the "1 band shift"/"2-band shift" and "-1 Drift per Move"
   a hazard prints have no mechanic, so they are narrated rather than paid — needs Roly's ruling on how
   the Engine prices a band shift before anything is built.

## Design decisions to preserve
- Speech starts within ~2 s; local voice first; the Director's voice also works on remote devices.
- Speech transcription needs consent at session zero; a decliner types and taps.
- The speech server may only speak lines the Director narrated.
- The Director cannot choose or reorder the harvest picking; stamping waits for sharing.
- `recall` with `for_players` returns only what the table was told; cast entries carry origin (page, table, improvised) and seen/unseen facts.
- End goal: the Director ad-libs story, NPCs and encounters, so keep memory and cast features compatible with that.

## Limits of the tooling here (worth knowing for whoever picks this up)
Claude's Linux shell has no outbound network, so `git push`, real-model bench runs, cloud providers and `tools/check_screens.py` all have to be run by Roly on Windows. Reading the repo and its history offline is fine, as are `node --test`, `node server.js`, and `node tools/bench.mjs` against `tools/fake-ai.mjs`. Two traps: the Windows working tree shows ~89 files as "modified" whose diffs are whole-file 1:1 insertions/deletions — pure CRLF/LF noise, so check `git diff --numstat` for that pattern before treating a dirty tree as real work (no `.gitattributes` yet; `* text=auto eol=lf` would end it). And a 0-byte `.git/index.lock` was present on 13 Nov — if git refuses to run, delete that file.
