# What the book compiler could not read: srd.json

Made by `node tools/compile-book.mjs`. Each line is a rule the words do not say plainly enough to turn into numbers.
The Engine still plays these from their words through the Director; to give it the numbers, add a hand reading to
`srd.engine-fixes.json` (for example `{"spells": {"wish": {"how": "mishap"}}}` or `{"monsters": {"hydra": {"Multiattack": {"multi": [{"Bite": 5}]}}}}`) and compile again.

Nothing: every damage roll, save, multiattack and spell list was read.
