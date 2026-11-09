"""Six errata across the books (md + docx). Each fix: (book, old_md, new_md). docx text = md with markup stripped."""
import re, copy, sys
import docx
from docx.oxml.ns import qn
from docx.text.paragraph import Paragraph
R = "/home/claude/osmotic-expanse/The Osmotic Expanse - %s.%s"
STAND_OLD = "**Standing ladder** (Core VIII) is one of six rungs: *Hostile / Wary / Neutral / Obliging / Confided / Bound*."
STAND_NEW = ("**Standing ladder.** Standing is Core §8.7's 0–10 track and its four bands (Hostile 0–1 · Wary 2–5 · Client 6–8 · Kin 9–10). "
             "The Codex names six rungs inside those bands: *Hostile* (0–1) · *Wary* (2–3) · *Neutral* (4–5) · *Obliging* (6–7) · *Confided* (8) · *Bound* (9–10).")
CHEM_OLD = "−3 by a **Chemotactic Rite** (a colony meal, 1 Cohesion)."
CHEM_NEW = "all cleared, and +2 Cohesion, by a **Chemotactic Rite** (a shared colony meal: 3 S each, 1 Fugue Interval; §11.6)."
UPK_OLD = "**Upkeep is the point.** A colony with five assets costs 30 S a Beat. That number is why you take the next Vector."
UPK_NEW = UPK_OLD + (" Read it against the wealth table (§9.2): at Tier 1 a Cohort earns 30–60 S per PC per level, so it can carry a Niche and little more. "
          "A Clientele's income (about 5 S per colonist per Beat) or a mid-tier Vector's yield is what pays for the rest — assets are a Tier 2–3 ambition, by design.")
CASCADE_MD = ("\n\n**Cascade table (d6).** Roll when Stress 7 turns a failed roll into a cascade (above), or when a Legacy Scar sends you here (§5.7, *Unstable genome*). "
  "The effect lands at once, on top of the failure.\n\n"
  "| d6 | Cascade | Effect |\n| --: | :-- | :-- |\n"
  "| 1 | **Spill** | Lose 1d6 ATP; your next Burst this scene costs +2 ATP |\n"
  "| 2 | **Seizure** | Lose all remaining PP this Cycle; you cannot hold a Reserve until your next turn |\n"
  "| 3 | **Misfire** | The failed action resolves anyway, at half value, against you or the nearest ally (Director's choice) |\n"
  "| 4 | **Flare** | Your chemistry broadcasts: you are **Marked** until the end of the next Cycle and cannot use Concealment this scene |\n"
  "| 5 | **Tear** | Take 1d6 damage that ignores Soak, and gain **Leaking** |\n"
  "| 6 | **Runaway Inhibition** | Mark 1 more Stress (at 8, Autophagic Collapse follows) |")
CASCADE_ROWS = [["d6", "Cascade", "Effect"],
  ["1", "Spill", "Lose 1d6 ATP; your next Burst this scene costs +2 ATP"],
  ["2", "Seizure", "Lose all remaining PP this Cycle; you cannot hold a Reserve until your next turn"],
  ["3", "Misfire", "The failed action resolves anyway, at half value, against you or the nearest ally (Director's choice)"],
  ["4", "Flare", "Your chemistry broadcasts: you are Marked until the end of the next Cycle and cannot use Concealment this scene"],
  ["5", "Tear", "Take 1d6 damage that ignores Soak, and gain Leaking"],
  ["6", "Runaway Inhibition", "Mark 1 more Stress (at 8, Autophagic Collapse follows)"]]
FIX = {
 "CORE RULEBOOK": [("Tracked 0–10 with three states:", "Tracked 0–10 in four states:"), (CHEM_OLD, CHEM_NEW), (UPK_OLD, UPK_NEW)],
 "DIRECTOR'S CODEX": [(STAND_OLD, STAND_NEW), ("+1 Cohesion (Core §9.8)", "+1 Cohesion (Core §9.7)"),
                      ("A **Gene-Debt** (Core §9.8)", "A **Gene-Debt** (Core §9.7)"),
                      ("Symbiotes 1 S/Beat", "Symbiotes 2–10 S/Beat (Core §9.6)")],
 "LYTIC BESTIARY": [("a Relic per Core §9.8", "a Relic per Core §9.7")],
 "THE NINTH SHIFT": [("(CORE §9.8, Gene-Debt; CODEX §10.5)", "(CORE §9.7, Gene-Debt; CODEX §10.5)"),
                     ("CORE §9.8's Gene-Debt grammar", "CORE §9.7's Gene-Debt grammar"),
                     ("Gene-Debt segments (CORE §9.8, CODEX §10.5)", "Gene-Debt segments (CORE §9.7, CODEX §10.5)"),
                     ("GENE-DEBT (4 segments, CORE §9.8 / CODEX §10.5)", "GENE-DEBT (4 segments, CORE §9.7 / CODEX §10.5)")],
 "THE LONG SWALLOW": [("(CORE §9.8, §9.7; CODEX §10.5)", "(CORE §9.7; CODEX §10.5)"),
                      ("GENE-DEBT (4 segments, CORE §9.8 / CODEX §10.5)", "GENE-DEBT (4 segments, CORE §9.7 / CODEX §10.5)")],
}
def plain(s): return re.sub(r"\*\*|(?<!\w)\*|\*(?!\w)", "", s).replace("`", "")
def md_fix(book):
    p = R % (book, "md"); s = open(p, encoding="utf-8", newline="").read()
    nl = "\r\n" if "\r\n" in s else "\n"; t = s.replace("\r\n", "\n")
    for old, new in FIX[book]:
        c = t.count(old); assert c >= 1, (book, old[:50], c); t = t.replace(old, new)
    if book == "CORE RULEBOOK":
        anchor = CHEM_NEW; assert t.count(anchor) == 1
        t = t.replace(anchor, anchor + CASCADE_MD)
    open(p, "w", encoding="utf-8", newline="").write(t.replace("\n", nl))
def para_replace(par, old, new):
    full = "".join(r.text for r in par.runs)
    if old not in full: return 0
    # map char offsets to runs; put the replaced span into the run where it starts
    start = full.index(old); end = start + len(old); pos = 0; done = False
    for r in par.runs:
        L = len(r.text); a, b = pos, pos + L
        if not done and a <= start < b:
            keep_after = r.text[end - a:] if end <= b else ""
            r.text = r.text[:start - a] + new + keep_after; done = True
        elif done and a < end:
            r.text = r.text[max(0, end - a):] if end < b else ""
        pos = b
    return 1
def all_pars(d):
    for p in d.paragraphs: yield p
    for t in d.tables:
        for row in t.rows:
            for c in row.cells:
                for p in c.paragraphs: yield p
def docx_fix(book):
    p = R % (book, "docx"); d = docx.Document(p)
    for old, new in FIX[book]:
        po, pn = plain(old), plain(new); n = 0
        for par in all_pars(d): n += para_replace(par, po, pn)
        if n == 0: print("  docx MISS", book, po[:60])
    if book == "CORE RULEBOOK":
        tgt = [x for x in d.paragraphs if x.text.startswith("Clearing Stress:")][0]
        newp = copy.deepcopy(tgt._p)
        for r in list(newp):
            if r.tag != qn("w:pPr"): newp.remove(r)
        tgt._p.addnext(newp); P = Paragraph(newp, tgt._parent)
        r = P.add_run("Cascade table (d6). "); r.bold = True
        P.add_run("Roll when Stress 7 turns a failed roll into a cascade (above), or when a Legacy Scar sends you here (§5.7, ")
        r = P.add_run("Unstable genome"); r.italic = True
        P.add_run("). The effect lands at once, on top of the failure.")
        t = d.add_table(rows=len(CASCADE_ROWS), cols=3); t.style = d.styles["Table Grid"]
        for i, row in enumerate(CASCADE_ROWS):
            for j, v in enumerate(row):
                cell = t.rows[i].cells[j]; cell.text = ""; rr = cell.paragraphs[0].add_run(v)
                if i == 0 or j == 1: rr.bold = True
        W = [0.5, 1.5, 4.7]
        for gc, w in zip(t._tbl.tblGrid.findall(qn("w:gridCol")), W): gc.set(qn("w:w"), str(int(w * 1440)))
        tb = t._tbl; tb.getparent().remove(tb); newp.addnext(tb)
    d.save(p)
for book in FIX:
    md_fix(book); docx_fix(book); print("fixed", book)
