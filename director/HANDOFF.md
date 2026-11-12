# Handoff: continuing The Osmotic Expanse AI Director

Written 12 November 2026, after Phase 5 was pushed (commit `2ac11f4` on `main`, repo `rolandcorlet/osmotic-expanse`, folder `director/`). Read this first, then `README.md` and `HOST-GUIDE.md` in the same folder.

## What this is
A tabletop RPG run by two parts: a rules **Engine** (all numbers and rules) and a language-model **Director** (narrates, calls tools). Players use phones, the table has a shared screen, the host has a console. Node server, plain browser front end, no build step.

Run it: `node server.js --new --port 8791 --saves /tmp/oxd-saves --host-key TEST01` (see README "Run it").
Test it: `node --test` (95 tests), `python3 tools/check_screens.py http://localhost:8791 TEST01 /tmp/oxd-shots` (Playwright, three screen sizes), `node tools/bench.mjs` (flags `--runs --sites 2 --players 4 --thinking --provider/--model/--url --plain-chronicle`), `tools/fake-ai.mjs` stands in for a model.

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

## Using a different inference server
The Director talks to any OpenAI-compatible or Ollama-style server; set it on the host's Director tab (address, key, model, context size, thinking level). Local setup that was benched: Qwen3.8-Flash-Next `iq3_s` on a Ryzen 9 5950X / 128 GB / RTX 3090. Thinking: default 20-26 s a turn, medium ~15 s, low ~11-13 s (recommended, benched clean), off ~5.6 s (rule errors). Chronicle chapters always run with thinking off. The model must support tool calling; the Director tab's Test button checks that. Speech uses separate servers (`/v1/audio/speech`, `/v1/audio/transcriptions`) set on the Voice tab.

## Open items
1. Measure narration-to-first-sound with Kokoro (speech) and `Systran/faster-whisper-small` (listening) on the PC. Target: speech starts within about 2 s.
2. Bench since the picker, harvest Codon and chronicle-filter changes was never run. Also not yet run: `--thinking medium` three-run gate, Qwen3.8-27B Q4_K_M.
3. Known Director faults: invents a detail not from `recall` (a "same flat drone"); declares kills early; moves Clocks early or not at all; hazard timing; the Engine applies only one priced-choice row.
4. Not built: save slots and Supabase copy (plan: rules and Vectors stay in GitHub; saves local first, Supabase as a copy; free plan pauses after 7 days idle and has no backups); ad-libbing (`improv: 'adlib'` is refused until built); Discord sign-in (deferred).
5. Project doc `claude/director-phase3-build.md` needs updating for the picker, memory and Phase 5.

## Design decisions to preserve
- Speech starts within ~2 s; local voice first; the Director's voice also works on remote devices.
- Speech transcription needs consent at session zero; a decliner types and taps.
- The speech server may only speak lines the Director narrated.
- The Director cannot choose or reorder the harvest picking; stamping waits for sharing.
- `recall` with `for_players` returns only what the table was told; cast entries carry origin (page, table, improvised) and seen/unseen facts.
- End goal: the Director ad-libs story, NPCs and encounters, so keep memory and cast features compatible with that.
