# The Osmotic Expanse

A tabletop roleplaying game, its books, and the AI Director that runs it.

## Where things are

| Folder | What is in it |
|---|---|
| `v3/` | **The game.** `v3/director/` is the AI Director (run `Start Director.bat`); `v3/books/` holds the v3 table editions. Start with `v3/README.md`. |
| `books/` | The books in Markdown and Word: Core Rulebook, Player's Atlas, Director's Codex, Lytic Bestiary, QUORUM, Society Rules, and the Vectors (The First Carve, The Long Swallow, The Ninth Shift, What the Water Owed). |
| `docs/` | Notes about the game and the project: how to deploy, the World Contract, the plain-language explainers, the character sheet, and **`STORY-SEEDS.md`** (writing your own stories for the AI Director). |
| `site/` | The Director's Assistant web page (the Director's Vercel site). |
| `players/` | The Players Assistant (the Players' Vercel site). |
| `chargen/` | The character generator. |
| `reader/` | The book reader pages and the scripts that build them. |
| `lessons/` | The how-to-play lessons, films and music video, and the scripts that render them. |
| `tools/` | Scripts that rebuild the Word files and the Assistants from the books. |
| `archive/` | Old versions kept for reference: the first Director (`director-v1/`), the v2 experiment (`engine-v2/`) and old audit files. Nothing current depends on them. |

## Websites

Every push to `main` updates both Vercel sites. See `docs/DEPLOY.md`.
