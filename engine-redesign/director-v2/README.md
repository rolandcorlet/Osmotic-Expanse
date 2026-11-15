# Director v2

A new AI Director for The Osmotic Expanse, built on Engine v2 and the Engine-ready books in `engine-redesign/books/`.
It is separate from `director/` and shares no code with it.

## Run it
```
node server.mjs                                   # no model: the Engine speaks its own lines
node server.mjs --provider custom --url http://localhost:8080/v1 --model <name> --thinking off
node server.mjs --narrate beats                   # the model speaks at key moments only
```
Open the host link it prints. Players open the address and type the table code. See `INTERNET.md` for play over the internet (port 8790).
The model can also be chosen on the Host tab; the choice and any key are kept in `saves/config.json` (git-ignored).

## How it differs from v1
| | v1 (`director/`) | v2 |
|---|---|---|
| Who decides what happens | the model, by calling 40 tools the Engine may refuse | the Engine; players press legal moves, or say it in words and the model picks one of their legal moves |
| Creature turns | model calls (2-3 a creature) | Engine runs the Bestiary script, no call |
| Model calls for one move | 2-3 (tools, narration, sometimes a rewrite) | 1, or 0 in "key moments" mode |
| Prompt size | about 15,500 tokens | about 500-1,500 |
| A bad line (number, leak, buried body, question to the wrong seat) | flagged, rewritten once, may be held for the host | dropped; the Engine's own line is shown instead |
| The closing question | written by the model | written by the Engine, to whoever is on turn |
| Model down or slow | the table waits | the Engine speaks; play goes on |

## Files
- `server.mjs`: HTTP server, join codes, tokens, rate limits, live updates.
- `src/table.mjs`: seats, permissions, the story, undo, saving.
- `src/brain.mjs`: instructions, prompt, the guard on what may be said, one-call narration.
- `src/providers.mjs`: OpenAI-compatible, Anthropic and mock clients.
- `src/engine.mjs`: the only import from `../engine-v2`.
- `public/index.html`: the table (Table, Cohort, Host, Colours tabs).
- `tools/bench.mjs`: plays the whole module with scripted players and your model; prints speed.
- `test/`: `npm test`.

## Bench
```
node tools/bench.mjs --provider custom --url http://localhost:8080/v1 --model <name> --thinking off --log v2.log
node tools/bench.mjs --route fight --narrate beats
```

## Not yet
The rules Engine v2 does not have yet (Runaway Effect Value, Bursts and Vials, full conditions), voice in and out, session zero, harvest sharing by picking order, chronicle memory across sessions, and other Vectors. Oaths are sworn through the printed interactables only.
