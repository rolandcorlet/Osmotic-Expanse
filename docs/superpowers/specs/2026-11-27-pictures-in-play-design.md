# Pictures in play (D&D Director): design

Approved by Roly, 27 Nov 2026 ("go").

## Intent
When the party meets a creature or reaches a place, the players see the book's own art for it, not only words.
Converted campaigns already keep their pictures (kind, a one-line "about", the page), but only maps are used.

## Goals
- Each art picture of a converted adventure is linked to one monster or one place, with no AI call.
- First fight with a linked monster, or first arrival at a linked place: the picture slides in on the table
  and player screens with its one-line caption; a tap or 8 seconds closes it. Each picture shows by itself once.
- The DM has a Pictures strip on the Run tab: every picture, what it is linked to, a Show button, Take down.
- On the Books tab, a picture can be set to "show at place X" or "show for monster X", or "do not show".

## Non-goals / anti-goals
- No AI choosing pictures in play (a weak local model shows the wrong art or none).
- Never covers, credits, logos, stat blocks, pages, handouts or decorations by themselves.
- Never a wrong picture over a right one: a link needs a clear winner, or there is none.
- No page scroll on any tab; CSS variables only (app-layout-polish).

## Approaches
1. Engine links at load, shows on fight/arrival; DM can show any (picked).
2. The AI Director calls a show_picture tool: flexible, but model-dependent.
3. DM-only Show buttons: reliable, but nothing happens by itself.

## How it links (engine/pictures.js, pure)
1. The DM's choice (`show: 'site:<id>' | 'monster:<id>' | 'never'`) wins.
2. Words: a monster's name (or id words, adventure prefix removed), singular or plural, in the "about" line:
   the longest wins. Else a place's whole name in it.
3. The page: the book's words on that page (`--- Page N ---` in the original text); the monster or place
   named most there, at least twice and more than any other.
Skeleton and v3 have no book pictures, so this is D&D only.
