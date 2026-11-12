# Handoff: continuing The Osmotic Expanse AI Director

Written 12 November 2026, after Phase 5 was pushed (commit `2ac11f4` on `main`, repo `rolandcorlet/Osmotic-Expanse`, folder `director/`). **Updated 13 November 2026** at `2ac4384`. Read this first, then `README.md` and `HOST-GUIDE.md` in the same folder.

`main` is **five commits ahead of `origin/main`** — `8ec4fa5` `66b634d` `8678e42` `2b08182` `2ac4384`, all of them bench fixes from 12–13 Nov. They are committed but unpushed. Roly pushes.

## What this is
A tabletop RPG run by two parts: a rules **Engine** (all numbers and rules) and a language-model **Director** (narrates, calls tools). Players use phones, the table has a shared screen, the host has a console. Node server, plain browser front end, no build step.

Run it: `node server.js --new --port 8791 --saves /tmp/oxd-saves --host-key TEST01` (see README "Run it").
Test it: `node --test` (**108 tests**, all green as at `2ac4384`), `python3 tools/check_screens.py http://localhost:8791 TEST01 /tmp/oxd-shots` (Playwright, three screen sizes), `node tools/bench.mjs` (flags `--runs --sites 2 --players 4 --thinking --provider/--model/--url --plain-chronicle`), `tools/fake-ai.mjs` stands in for a model.

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

**What the runs have not cleared.** A hazard can still go off twice in a scene: the Engine checks the trigger and the amount, but "never twice" is only prose in the `hazard_damage` description (`brain/tools.js` ~229) — there is no Engine marker. Clocks barely move (CARCASS 0 and HUNGER 0 across a whole Vector) and narrated countdowns have no mechanic. The run-1 Oath loop is latent, not fixed. The Engine still applies only one priced-choice row.

**Windows notes for a bench run.** `--runs`, not `--run`. `--sites 3` does not play a third site — the scripted table only has lines for two. `> bench_$(date …).log` does not expand in cmd, so every run overwrites `director/bench_.log`; name the file yourself. A run against `tools/fake-ai.mjs` prints GATE PASSED with `0 recall, 0 remember, 0 chapter(s)` and proves only that the harness loads. House command: `node tools/bench.mjs --runs 1 --sites 2 --players 4 --plain-chronicle --thinking low`.

**Do not re-accuse the Director of inventing these three — all were printed, with sources.** The "toll manifest" is the scenario's own Tie, `data/first-carve.js` line 18: *"Your name is on the toll manifest as the escort for the whale's last cargo."* A `creature_special` of `Present` at cost 3 is the Fold Sentinel's printed Special, in `data/bestiary.json` under `fold-sentinel`: *"Special — Present (3 PP): it declares a zone 3 Drifts wide Held for 3 Cycles."* The gas pocket that fired after Vash's Strike was legal: the Toll-Vent's `host.hazard` (`data/first-carve.js` line 95) reads *"Trigger: a Kinetic hit, a Strike, Momentum. Effect: 6 Kinetic, Jostled"*. Before ruling that a hazard, Clock or damage call broke the rules, read that site's `host.hazard` and Clock notes in `data/first-carve.js` and the creature's entry in `data/bestiary.json` — the scenario prose and the stat block define what is legal, not the standing instructions. (I got this wrong twice on 12 Nov, so the check is worth the two minutes.)

## Roly's ruling on creature numbers (13 Nov) — do not reopen
The Director **never** says how many dice an attacking creature rolls, nor its Membrane Threshold, Membrane Integrity or soak. No count, no range, no "a handful". It must not tell a player to look the numbers up on their own sheet either — nobody at the table holds creature numbers, so pointing at a page that lacks them is a lie, not a deflection. Behaviour and consequence are what the Director may give: "a dozen small ones wearing a slime coat", "brittle: anything that spreads takes sections off it". This settles the tension with `19245ab` ("never deny a printed creature"): never deny that a creature exists or refuse to engage with it, just never voice its arithmetic. The Engine owns the number, the briefing shows it to the Director, and `checkNarration` in `brain/director.js` is what protects it — so any new phrasing goes through that leak check, not through prose alone. When a bench log shows the Director answering a rules question about a creature, check whether it said a number before deciding anything is wrong.

## Using a different inference server
The Director talks to any OpenAI-compatible or Ollama-style server; set it on the host's Director tab (address, key, model, context size, thinking level). Local setup that was benched: Qwen3.8-Flash-Next `iq3_s` on a Ryzen 9 5950X / 128 GB / RTX 3090. Thinking: default 20-26 s a turn, medium ~15 s, low ~11-13 s (recommended, benched clean), off ~5.6 s (rule errors). Chronicle chapters always run with thinking off. The model must support tool calling; the Director tab's Test button checks that. Speech uses separate servers (`/v1/audio/speech`, `/v1/audio/transcriptions`) set on the Voice tab.

## Open items
1. Measure narration-to-first-sound with Kokoro (speech) and `Systran/faster-whisper-small` (listening) on the PC. Target: speech starts within about 2 s.
2. Bench coverage still missing: the `--thinking medium` three-run gate, and Qwen3.8-27B Q4_K_M. Phase 4 still needs a real group playing two sites — that is the gate, not another scripted run.
3. Not built: save slots and Supabase copy (plan: rules and Vectors stay in GitHub; saves local first, Supabase as a copy; free plan pauses after 7 days idle and has no backups); ad-libbing (`improv: 'adlib'` is refused until built); Discord sign-in (deferred).
4. The project doc `claude/director-phase3-build.md` named in the 12 Nov draft is not in this repo — not tracked and not on disk. If it lives outside this folder it still needs updating for the picker, memory and Phase 5; otherwise the item is void.

## Design decisions to preserve
- Speech starts within ~2 s; local voice first; the Director's voice also works on remote devices.
- Speech transcription needs consent at session zero; a decliner types and taps.
- The speech server may only speak lines the Director narrated.
- The Director cannot choose or reorder the harvest picking; stamping waits for sharing.
- `recall` with `for_players` returns only what the table was told; cast entries carry origin (page, table, improvised) and seen/unseen facts.
- End goal: the Director ad-libs story, NPCs and encounters, so keep memory and cast features compatible with that.

## Limits of the tooling here (worth knowing for whoever picks this up)
Claude's Linux shell has no outbound network, so `git push`, real-model bench runs, cloud providers and `tools/check_screens.py` all have to be run by Roly on Windows. Reading the repo and its history offline is fine, as are `node --test`, `node server.js`, and `node tools/bench.mjs` against `tools/fake-ai.mjs`. Two traps: the Windows working tree shows ~89 files as "modified" whose diffs are whole-file 1:1 insertions/deletions — pure CRLF/LF noise, so check `git diff --numstat` for that pattern before treating a dirty tree as real work (no `.gitattributes` yet; `* text=auto eol=lf` would end it). And a 0-byte `.git/index.lock` was present on 13 Nov — if git refuses to run, delete that file.
