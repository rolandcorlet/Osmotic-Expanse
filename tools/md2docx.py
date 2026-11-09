"""Build a house-style .docx from the book's Markdown, on the Core Rulebook's own template."""
import sys, re, copy
import docx
from docx.shared import Pt, Inches
from docx.oxml.ns import qn
from docx.enum.text import WD_ALIGN_PARAGRAPH
md, ref, out = sys.argv[1:4]
d = docx.Document(ref)
body = d.element.body
for el in list(body):
    if el.tag != qn("w:sectPr"): body.remove(el)
sec = d.sections[0]; TW = (sec.page_width - sec.left_margin - sec.right_margin) / 914400
INL = re.compile(r"(\*\*.+?\*\*|\*[^*\s][^*]*\*|`[^`]+`)")
def runs(p, text, bold=False):
    for part in INL.split(text):
        if not part: continue
        if part.startswith("**") and part.endswith("**") and len(part) > 4: runs(p, part[2:-2], True)
        elif part.startswith("`"): r = p.add_run(part[1:-1]); r.font.name = "Consolas"; r.bold = bold
        elif part.startswith("*") and part.endswith("*") and len(part) > 2: r = p.add_run(part[1:-1]); r.italic = True; r.bold = bold
        else: r = p.add_run(part); r.bold = bold or None
def para(text, style="Normal"):
    p = d.add_paragraph(style=style); runs(p, text); return p
lines = open(md, encoding="utf-8").read().replace("\r\n", "\n").split("\n")
i = 0; first = True
while i < len(lines):
    L = lines[i]
    if L.startswith("```"):
        j = i + 1; buf = []
        while not lines[j].startswith("```"): buf.append(lines[j]); j += 1
        p = d.add_paragraph(style="Normal")
        for k, b in enumerate(buf):
            r = p.add_run(b); r.font.name = "Consolas"; r.font.size = Pt(8.5)
            if k < len(buf) - 1: r.add_break()
        i = j + 1; continue
    if L.startswith("|") and i + 1 < len(lines) and re.match(r"^\|\s*:?-", lines[i + 1]):
        rows = []
        j = i
        while j < len(lines) and lines[j].startswith("|"):
            if j != i + 1: rows.append([c.strip() for c in lines[j].strip().strip("|").split("|")])
            j += 1
        n = max(len(r) for r in rows)
        t = d.add_table(rows=len(rows), cols=n); t.style = d.styles["Table Grid"]; t.autofit = False
        def cl(x): return re.sub(r"[*`]", "", x)
        lens = [max(len(cl(r[c] if c < len(r) else "")) for r in rows) for c in range(n)]
        word = [max((len(wd) for r in rows for wd in cl(r[c] if c < len(r) else "").split()), default=1) for c in range(n)]
        minw = [word[c] * 0.085 + 0.18 for c in range(n)]
        if sum(minw) > TW: minw = [m * TW / sum(minw) for m in minw]
        pw = [min(lens[c], 60) ** 0.9 for c in range(n)]; spare = TW - sum(minw)
        W = [minw[c] + spare * pw[c] / sum(pw) for c in range(n)]
        for gc, x in zip(t._tbl.tblGrid.findall(qn("w:gridCol")), W): gc.set(qn("w:w"), str(int(x * 1440)))
        for ri, r in enumerate(rows):
            for c in range(n):
                cell = t.rows[ri].cells[c]; cell.width = Inches(W[c]); cell.text = ""
                p = cell.paragraphs[0]; txt = r[c] if c < len(r) else ""
                runs(p, txt)
                for run in p.runs:
                    run.font.size = Pt(8.5)
                    if ri == 0: run.bold = True
        d.add_paragraph(style="Normal")
        i = j; continue
    m = re.match(r"^(#{1,3}) (.*)", L)
    if m:
        lvl = len(m.group(1)); txt = m.group(2)
        if first and lvl == 1: para(txt, "Title"); first = False
        para(txt, "Heading %d" % lvl); i += 1; continue
    if L.startswith("> "): para(L[2:], "Quote"); i += 1; continue
    if L.strip() == "---":
        p = d.add_paragraph(style="Normal"); p.add_run("* * *"); p.alignment = WD_ALIGN_PARAGRAPH.CENTER; i += 1; continue
    m = re.match(r"^\* (.*)", L)
    if m: para(m.group(1), "List Bullet"); i += 1; continue
    m = re.match(r"^(\d+)\. (.*)", L)
    if m:
        p = d.add_paragraph(style="Normal"); p.paragraph_format.left_indent = Inches(0.3); p.paragraph_format.first_line_indent = Inches(-0.22)
        p.add_run(m.group(1) + ".  "); runs(p, m.group(2)); i += 1; continue
    if L.strip(): para(L)
    i += 1
d.core_properties.title = "QUORUM — Colonies, Kin, and Law"
d.save(out); print("ok", out)
