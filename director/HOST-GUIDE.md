# Running the night — one page for the host

Keep this beside you. Nothing here needs the code open.

## Before anyone arrives (10 minutes)

1. Double-click **`Start Director.bat`**. If anyone is playing from outside your Wi-Fi, use
   **`Start Director (online).bat`** instead and send them the `trycloudflare.com` link it
   prints.
2. Open the **host console** link in the window. Keep that window open: closing it stops the
   table.
3. Put the **table screen** on the shared display.
4. **Director tab:** pick your brain and model, press **Test**. It must say the model called a
   tool. If it does not, pick another model — the Director cannot run without tools.
   * On a local model, set **Thinking** to **Low**. Fast and clean.
   * Leave the mode on **Co-pilot** for the first session.
5. **Run tab, Session zero card:** set the pause word (default *SLACK WATER*) and a one-line
   tone note, for example *body horror is in, cruelty to animals is out*.
6. Starting a brand-new game over an old one: `node server.js --new`.

## As they sit down

Players open the **player** link on their phones and type a name. Before they can take an
organism they read the session-zero card and press the button. The host console shows
**nobody yet** → **2 not ready** → **all ready**.

Read the pause word out loud anyway. The card is not a substitute for you saying it.

Anyone can add a line to the "off the page" list, then and later. **The list is shared, the
name is not** — do not ask who added one.

When everyone is ready, press **Take a turn** to open the scene.

## During play

The Director takes a turn whenever a player types what they do, rolls, or ends a turn. You do
not need to press anything.

**In Co-pilot, every turn waits for you.** You see what it did with the Engine and what it
will say.

* **Approve** — it goes to the table.
* Edit the text first if a line is wrong. Your words go out, not its.
* **Try again** — same situation, fresh attempt. Use this when the tone is off.
* **Discard** — nothing happened. The Ledger is untouched.

Once it feels steady, switch to **Auto**. Anything that fails the leak check still stops for
you.

## When it goes wrong

| What you see | What to do |
| :-- | :-- |
| It stalls on "thinking" | Wait one more turn, then press **Take a turn**. A local model on a long briefing is slow, not stuck. |
| It says a number for a creature | Discard and **Try again**. It is not meant to, and the check usually catches it. |
| It invents a price, item or seller | Discard. Tell them in your own words what the page actually sells. |
| It forgets someone | Type a note in the box: *Vash has not acted — ask Vash*. |
| It will not start a fight a player declared | **Run tab → Start a Pulse War**. Do it yourself. |
| It keeps a dead scene going | **Run tab → Stand down** on the creature, or end the fight by hand. |
| It stops with an error | Check the key or the address on the Director tab. Set mode to **Off** and run the Run tab yourself while you sort it. |
| Everything is wrong | Mode **Off**. The Run tab runs the whole game without any AI. The night does not depend on it. |

**Undo** on the clocks card takes back the last change to the Ledger.

## Things only you can do

* **Call for a roll** — Run tab, pick who, the Baseline and Pathway, the Threshold, what for.
* **Award** Codon or Substrate. The Director can only pay what the page prints; you are not
  limited.
* **Oaths** — when a player promises something, type it into the Swear box on their sheet. When
  they meet it or walk away from it, press **Kept** or **Broken**. Keeping pays the table a
  Cohesion; breaking marks two Lysis boxes and a scar. Play the consequence, do not scold.
* **Move a clock** by hand with the + and − buttons.

## At the end

The session saves itself after every change. Close the window. Next time, start the same way
and it carries on where you left off.
