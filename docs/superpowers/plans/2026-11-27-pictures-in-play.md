# Pictures in play Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a converted adventure's art on the players' screens when they meet its monster or reach its place.
**Architecture:** A pure linker (engine/pictures.js) links pictures at load; the ledger keeps `state.art` and shows a
linked picture on fight.start / first site.move arrival; app.js draws a card for players and table and a strip for the DM.
**Tech Stack:** Node ESM, node:test, vanilla JS screens.
**Spec:** docs/superpowers/specs/2026-11-27-pictures-in-play-design.md

## Global Constraints
- Picture URLs only `/maps/<hex>.(png|jpg|gif|webp)`. CSS variables only; no page scroll. CRLF files.
- Each picture shows by itself once per game; the DM can show any again.

## Review Focus
- An old save with no `state.art`: no crash (tests: art.show on a state without art).
- An adventure with no pictures (all built-in ones): nothing shows, no errors.
- A picture whose words name two monsters equally: no link.
- A fight with foes from two linked monsters: one picture (the first in fight order), the other later.
- Player screens never see the DM-only links or the picture list, only `art.now`.

### Task 1: engine/pictures.js linker
- `linkArt(adv, original = '') -> adv` sets `p.link = { kind: 'monster'|'site', id, why }` or none on each picture; skips
  kinds other than art and abouts matching cover/credits/title/logo/foreword/contents.
- `artFor(adv, kind, id) -> picture[]`.
- Tests (test/pictures.test.js): yeti about -> monster yeti; "waterfront town" with a site "Snowy Waterfront Town" ->
  site; page with "Tomb Tapper" ×3 -> eitf-tomb-tapper; tie -> none; cover -> none; show:'never' -> none.
- Wire: convert.js loadAdventures reads `<id>.original.txt` and calls linkArt; server /save calls it with the original.

### Task 2: ledger state.art
- `state.art = { now: null | { url, w, h, about, n }, shown: [], n: 0 }` in newSession; old saves made lazily.
- `art.show {url}` (host), `art.close` (host); auto in fight.start (foes' mid in order) and site.move on first arrival.
- Tests in test/resolve.test.js.

### Task 3: screens
- Player/table: a card over the backdrop when `art.now.n` is new; tap or 8 s closes it (locally).
- DM Run tab: Pictures strip (thumb, about, link label, Show), "Showing now · Take down".
- Books tab: picture use options `show-site:<id>`, `show-monster:<id>`, saved as `show`.
- Check with Playwright at 1366×768 and 1920×1080: no page scroll; screenshot the card.
