# Players Assistant · The Osmotic Expanse

The player-facing edition of the Director's Assistant, published by its own Vercel project
(`osmotic-expanse-players`, Root Directory `players`).

* Tabs: Learn to Play, Ask the Books, BitSight, Roll Helper, Char/Gen, Characters, Colours
  (AI Setup opens from Ask the Books, off the tab strip).
* Books: the four rulebooks (Core, Player's Atlas, Director's Codex, Lytic Bestiary). No Vectors.
* Storage keys are its own (`pa.*`, `playassist-*`), so it never touches a Director's campaign.

Rebuild from the Director's file:

    python3 players/build_players.py DMAssistant_Osmotic_Expanse.html players/index.html
