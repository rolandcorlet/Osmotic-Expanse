# 02 · What Engine v3 needs

Engine v2 failed at the one thing that matters: it turned the game into a menu.
Players clicked legal moves and the model added colour. That is a board game.
v3 goes back to what the first Director got right and adds what it lacked.

## The division of labour

| Who | Owns | Never does |
|---|---|---|
| **Players** | What their organism says and tries, in their own words (typed or spoken). Which character they play. | Pick from a list of permitted moves. |
| **AI Director** | Listening, ruling, describing, voicing people, pacing, choosing which rule applies. | Invent a number, a reward, a death or a creature. |
| **Engine** | Every number: dice, damage, costs, Clocks, turns, what is paid. Refuses anything the books do not print. Tracks what has been learned and who has been quiet. | Decide what a player is allowed to attempt. |
| **Books and Vectors** | The facts and prices, *and* the craft: how each scene opens, who wants what, what is worth finding out, what failure costs. | Leave the Director to guess any of the above. |

## What v3 keeps from the first Director (all of it)

Host console, table screen and player phones. Session zero and the safety word.
Choosing a ready-made character and naming it. Free-text and voice input. Voice
output and faces. Co-pilot and Auto modes. Dice on screen or real dice typed in.
Pulse War with turn order, bands, conditions, Reserve reactions. Hazards,
harvest, Tally Post, Oaths, awards, Clocks. Harvest sharing. Memory, cast cards
and the chronicle across nights. Saved games and New game. Local play, table
code, online link (and since 15 Nov the state fallback for tunnels). Colours
tab. Every provider (local, Gemini, Anthropic, OpenAI-compatible). The bench.
All 165 tests.

## What v3 adds (each maps to skills in 01)

| Need | Skill | Built? |
|---|---|---|
| **Free actions.** The instruction "say the page has nothing for that" is gone. The Director walks the ruling ladder and can call a roll for anything. | 1–4 | Yes |
| **The Director's kit** per Vector: strong start, scene question, senses, people (want, fear, voice, knows), likely approaches and rulings, failure costs, tells and strikes, leads, a moment per character. | 4, 5, 7, 13–17 | Yes: First Carve, Ninth Shift, Long Swallow |
| **Secrets tracking.** `reveal_secret` tool; hidden list in the briefing; found list on player screens. Must-know secrets need three leads (checked by test). | 8, 9 | Yes |
| **Stall detection.** Several player lines with nothing learned and no fight → the briefing tells the Director to move the world, with printed leads. | 10 | Yes |
| **Spotlight.** The briefing names players who have not spoken lately. | 17 | Yes |
| **Plain words.** A glossary given to players (Words tab) and a rule to gloss a term on first use. Characters described in plain words where they are chosen. | 19, 23 | Yes |
| **Story tab.** The pitch and "what we know" for players; the host also sees what is still hidden. | 12, 22 | Yes |
| **Clock rules about who may move them.** TOLL barred to the Director at 3+. | 11, 16 | Yes (v1 and v3) |
| **Any Vector, not only the whale.** Clock names, the value Clock for harvest and rest, and wording come from the Vector's data. | 7 | See status in README |

## Design rules for v3 code

1. A new Director skill is delivered as **data in the kit plus a line in the briefing**, not as a new restriction on players.
2. The kit never contains a number. Numbers live in the scenario file and the Bestiary, and reach the table only through tools.
3. Anything the players may see is copied onto the state or the public scenario explicitly. Nothing hidden is ever sent to a player screen (tested).
4. Every kit is checked by `test/kit.test.js`: all sites filled, every person's "knows" is a real secret, every must-know secret has three leads, a moment exists for each character.

## Order of work from here

1. Bench v3 on the local model with the First Carve (same command as before, run from `v3/director`). Watch for: does it open with the strong start, does it call `reveal_secret`, does it rule free actions with a roll instead of refusing.
2. Tune the kit from the log. Kit edits are data, so they are cheap.
3. Run the book makeover prompts (03) to produce the next edition of the books.
4. A real group plays two sites.
