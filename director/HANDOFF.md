# Handoff: continuing The Osmotic Expanse AI Director

Written 12 November 2026, after Phase 5 was pushed (commit `2ac11f4` on `main`, repo `rolandcorlet/Osmotic-Expanse`, folder `director/`). **Updated 13 November 2026** at `2ac4384`. Read this first, then `README.md` and `HOST-GUIDE.md` in the same folder.

Those five bench fixes (`8ec4fa5`..`2ac4384`) and this doc (`3f58021`) **are pushed**, and so is the 13 Nov hazard-budget stack: re-checked 13 Nov at 09:44, `HEAD` and `origin/main` both sat at `6b0eed7`. Since then only `cbb2e52` (the area condition) is committed and unpushed. Roly pushes.

## Starting a new session (as at 13 Nov, HEAD `cbb2e52`)

Today landed four commits: `f4d68e0` (hazards owned by the Engine: the firing budget, the widened
`hazardSpec` parse, the unpaid-damage guard that now fails the bench gate), `4070dd6` (Roly's leak
ruling: "the page prints nothing for that" is legal table talk, the Engine and the Ledger are not),
`b4c4b07` (the Vector pays its own Clocks from 3.1-3.3, and `oath.swear` refuses a promise the
table never said), and `cbb2e52` (an area condition: the `condition` action takes `area` and
`set_condition` takes `all_bodies`, so the Jostled the Toll-Vent prices for the chamber lands on
every body in one call rather than one call per body). Roly pushed through `6b0eed7` at 09:40 —
checked: `HEAD` and `origin/main` both sat at `6b0eed7`, nothing of yesterday's work was unpushed —
so **`cbb2e52` is the one unpushed commit.** `node --test` is **124 green**. The working tree shows
~83 "modified" files and every one of them is pure CRLF noise: check `git diff --numstat` for equal
insert/delete counts before believing a dirty tree.

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

First job, before any of that: re-run the gate on Windows (`node tools/bench.mjs --runs 3 --sites 2
--players 4 --thinking medium`) and read the new **Unpaid damage in narration** line. Give the log a real
name (`> bench_13nov_am.log`) — the only log on disk is 12 Nov's, so yesterday's medium-thinking gate was
never saved. Expect the three hazard refusals of run 3 to be gone and the leaks to be down, and expect the
Jostled after the pocket to be **one** `set_condition` with `all_bodies`, not one per body. Then Phase 4
with a real group — the scripted bench is rehearsal, not the gate.

## What this is
A tabletop RPG run by two parts: a rules **Engine** (all numbers and rules) and a language-model **Director** (narrates, calls tools). Players use phones, the table has a shared screen, the host has a console. Node server, plain browser front end, no build step.

Run it: `node server.js --new --port 8791 --saves /tmp/oxd-saves --host-key TEST01` (see README "Run it").
Test it: `node --test` (**124 tests**, all green at the 13 Nov area-condition commit), `python3 tools/check_screens.py http://localhost:8791 TEST01 /tmp/oxd-shots` (Playwright, three screen sizes), `node tools/bench.mjs` (flags `--runs --sites 2 --players 4 --thinking --provider/--model/--url --plain-chronicle`), `tools/fake-ai.mjs` stands in for a model.

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

**Windows notes for a bench run.** `--runs`, not `--run`. `--sites 3` does not play a third site — the scripted table only has lines for two. `> bench_$(date …).log` does not expand in cmd, so every run overwrites `director/bench_.log`; name the file yourself. A run against `tools/fake-ai.mjs` prints GATE PASSED with `0 recall, 0 remember, 0 chapter(s)` and proves only that the harness loads. House command: `node tools/bench.mjs --runs 1 --sites 2 --players 4 --plain-chronicle --thinking low`.

**Do not re-accuse the Director of inventing these three — all were printed, with sources.** The "toll manifest" is the scenario's own Tie, `data/first-carve.js` line 18: *"Your name is on the toll manifest as the escort for the whale's last cargo."* A `creature_special` of `Present` at cost 3 is the Fold Sentinel's printed Special, in `data/bestiary.json` under `fold-sentinel`: *"Special — Present (3 PP): it declares a zone 3 Drifts wide Held for 3 Cycles."* The gas pocket that fired after Vash's Strike was legal: the Toll-Vent's `host.hazard` (`data/first-carve.js` line 95) reads *"Trigger: a Kinetic hit, a Strike, Momentum. Effect: 6 Kinetic, Jostled"*. Before ruling that a hazard, Clock or damage call broke the rules, read that site's `host.hazard` and Clock notes in `data/first-carve.js` and the creature's entry in `data/bestiary.json` — the scenario prose and the stat block define what is legal, not the standing instructions. (I got this wrong twice on 12 Nov, so the check is worth the two minutes.)

## Roly's ruling on creature numbers (13 Nov) — do not reopen
The Director **never** says how many dice an attacking creature rolls, nor its Membrane Threshold, Membrane Integrity or soak. No count, no range, no "a handful". It must not tell a player to look the numbers up on their own sheet either — nobody at the table holds creature numbers, so pointing at a page that lacks them is a lie, not a deflection. Behaviour and consequence are what the Director may give: "a dozen small ones wearing a slime coat", "brittle: anything that spreads takes sections off it". This settles the tension with `19245ab` ("never deny a printed creature"): never deny that a creature exists or refuse to engage with it, just never voice its arithmetic. The Engine owns the number, the briefing shows it to the Director, and `checkNarration` in `brain/director.js` is what protects it — so any new phrasing goes through that leak check, not through prose alone. When a bench log shows the Director answering a rules question about a creature, check whether it said a number before deciding anything is wrong.

## Using a different inference server
The Director talks to any OpenAI-compatible or Ollama-style server; set it on the host's Director tab (address, key, model, context size, thinking level). Local setup that was benched: Qwen3.8-Flash-Next `iq3_s` on a Ryzen 9 5950X / 128 GB / RTX 3090. Thinking: default 20-26 s a turn, medium ~15 s, low ~11-13 s (recommended, benched clean), off ~5.6 s (rule errors). Chronicle chapters always run with thinking off. The model must support tool calling; the Director tab's Test button checks that. Speech uses separate servers (`/v1/audio/speech`, `/v1/audio/transcriptions`) set on the Voice tab.

## Open items
1. Measure narration-to-first-sound with Kokoro (speech) and `Systran/faster-whisper-small` (listening) on the PC. Target: speech starts within about 2 s.
2. Bench coverage: the `--thinking medium` three-run gate ran on 13 Nov (numbers above), so what is missing now is a clean pass of it, and Qwen3.8-27B Q4_K_M. Phase 4 still needs a real group playing two sites — that is the gate, not another scripted run.
3. Not built: save slots and Supabase copy (plan: rules and Vectors stay in GitHub; saves local first, Supabase as a copy; free plan pauses after 7 days idle and has no backups); ad-libbing (`improv: 'adlib'` is refused until built); Discord sign-in (deferred).
4. The project doc `claude/director-phase3-build.md` named in the 12 Nov draft is not in this repo — not tracked and not on disk. If it lives outside this folder it still needs updating for the picker, memory and Phase 5; otherwise the item is void.
5. The Clocks: 3.1-3.3's triggers are now Engine rules (see the Clocks finding above). Still unbuilt: the **Beat**
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
