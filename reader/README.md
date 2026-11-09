# The Osmotic Expanse Reader

Turns any Osmotic Expanse document (a Markdown file) into a single web page for new readers:

- **Term cards.** Every name, place, unit of time, lineage, faction, custom and rule gets a pop-up card. Hover over the term with a mouse, or tap it.
- **✦ Terms** highlights them in seven colours. The legend switches categories on and off.
- **▤ Index** lists the terms in the current chapter.
- **Aa Display** sets:
  - text size;
  - font (Literata, Atkinson Hyperlegible, OpenDyslexic, system or Georgia);
  - line spacing and width;
  - colours (night, paper, sepia, high contrast);
  - paragraph focus or a line ruler;
  - per-paragraph term buttons.
- **🔊 Listen** reads aloud with the current word highlighted. It can also explain new terms as it goes.
- **⚡ Speed-read** shows one word at a time (BitSight style). Term words are coloured, and pausing on one shows its card.
- **⬇ Web page** downloads the complete page as one file you can post anywhere. Fonts and cards are inside it.

The same page runs on its own and inside both apps' **Reader** tab. In the apps it gains a **⛶ Full window** button.

## Files

| File | What it is |
| :-- | :-- |
| `lexicon_src.py` | **The Lexicon.** One definition per term, written by hand, plus the Core Appendix B glossary imported. Edit this file. |
| `lexicon.json` | Built from `lexicon_src.py`. Don't edit it by hand. |
| `build_reader.py` | The converter: turns Markdown into a Reader page, and writes a report of new words. |
| `reader.html`, `reader.css`, `reader.js` | The page template, shared by every document. |
| `fonts/` | The three reading fonts, embedded into each page (SIL Open Font License, see each LICENSE). |
| `patch_reader.py` | Adds or refreshes the Reader tab in an app, with the converted documents embedded. |
| `what-the-water-owed.html` | The first converted document. |

## Converting a new document

1. **Build the Lexicon** (only after editing `lexicon_src.py`):
   `python3 lexicon_src.py "../The Osmotic Expanse - CORE RULEBOOK.md"`
2. **Convert:**
   `python3 build_reader.py "../The Osmotic Expanse - QUORUM.md" --id quorum --out quorum.html --report quorum-report.txt`
   - Add `--level director` for the Director's version, which includes the director-only cards.
3. **Read the report.** It lists capitalised words that have no card. For each one, either:
   - add a `t(...)` line to `lexicon_src.py`, or
   - put the word in `IGNORE` in `build_reader.py`.

   Then repeat steps 1 and 2.
4. **Put it in the apps:**
   `python3 patch_reader.py ../DMAssistant_Osmotic_Expanse.html ../DMAssistant_Osmotic_Expanse.html what-the-water-owed=wtwo-director.html quorum=quorum-director.html`
   - Do the same for `../players/index.html`, using the player builds.
   - List every document each time; the tab shows them in that order. Re-running replaces the earlier set.

### Adding a term

```python
t("Name", "category", "One plain-English definition.", ["other spellings"], ["see-also ids"], "BOOK §x.y")
```

- **Categories:** `person`, `place`, `time`, `lineage`, `faction`, `society`, `rule`.
- **Director-only:** add `level="director"`.
- **One document only:** add `scope="document-id"` (as story characters do).
- **Matching:** a term matches its exact name and each spelling in the second list, case-sensitive. The longest match wins.

### Fixing a link in the source text

| Write | To get |
| :-- | :-- |
| `[[Term]]` | force a link |
| `[[Term\|shown words]]` | link different words to a card |
| `[[!word]]` | stop a word from linking |
