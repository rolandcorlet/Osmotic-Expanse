"""Write the v3 rulings (v3/director/data/kit/rulings.js) into the Word copies of the books, in place:
a note (Quote style) at the end of each section, and the list after the contents. In place, so a book's
pictures and layout are kept. Refuses a document that already has the list.

    python3 tools/patch_rulings_docx.py
"""
import copy, json, re, subprocess
import docx
from docx.shared import Pt
from docx.oxml.ns import qn
ROOT = __file__.rsplit('/tools/', 1)[0] + '/'
FILES = {'core': 'CORE RULEBOOK', 'atlas': "PLAYER'S ATLAS", 'codex': "DIRECTOR'S CODEX", 'bestiary': 'LYTIC BESTIARY',
         'first-carve': 'THE FIRST CARVE', 'ninth-shift': 'THE NINTH SHIFT', 'long-swallow': 'THE LONG SWALLOW'}
js = subprocess.run(['node', '-e', "import('./v3/director/data/kit/rulings.js').then(m=>console.log(JSON.stringify(m.RULINGS)))"], cwd=ROOT, capture_output=True, text=True).stdout
RULINGS = json.loads(js)
MARK = 'v3 RULINGS (November 2026)'
INL = re.compile(r"(\*\*.+?\*\*|\*[^*\s][^*]*\*)")

def runs(p, text, bold=False):
    for part in INL.split(text):
        if not part: continue
        if part.startswith('**') and part.endswith('**') and len(part) > 4: runs(p, part[2:-2], True)
        elif part.startswith('*') and part.endswith('*') and len(part) > 2: r = p.add_run(part[1:-1]); r.italic = True; r.bold = bold or None
        else: r = p.add_run(part); r.bold = bold or None

def level(p):
    m = re.match(r'Heading (\d)', p.style.name)
    return int(m.group(1)) if m else (0 if p.style.name == 'Title' else None)

def new_par_before(anchor_el, d, style):
    p = d.add_paragraph(style=style)   # appended at the end, then moved
    anchor_el.addprevious(p._p)
    return p

def clean(t): return re.sub(r'[*`]', '', t).strip()

for book, name in FILES.items():
    path = f'{ROOT}books/The Osmotic Expanse - {name}.docx'
    d = docx.Document(path)
    paras = d.paragraphs
    if any(MARK in p.text for p in paras): print('skip', name); continue
    body = list(d.element.body)
    rows = []
    for r in [x for x in RULINGS if x['book'] == book]:
        want = clean(r['section'])
        hi = next((i for i, p in enumerate(paras) if level(p) and clean(p.text).startswith(want)), None)
        if hi is None: raise SystemExit(f'{name}: no heading "{want}"')
        lv = level(paras[hi])
        # the next heading at the same level or higher (in the body, tables included)
        start = body.index(paras[hi]._p)
        nxt = None
        for el in body[start + 1:]:
            if el.tag == qn('w:p'):
                st = el.find(qn('w:pPr'))
                sid = st.find(qn('w:pStyle')).get(qn('w:val')) if st is not None and st.find(qn('w:pStyle')) is not None else ''
                m = re.match(r'Heading(\d)', sid)
                if m and int(m.group(1)) <= max(lv, 2): nxt = el; break
        if nxt is None: nxt = d.element.body.find(qn('w:sectPr'))
        # skip back over a trailing "* * *" rule so the note sits inside the section
        prev = nxt.getprevious()
        while prev is not None and prev.tag == qn('w:p') and ''.join(prev.itertext()).strip() in ('', '* * *'): nxt = prev; prev = nxt.getprevious()
        p = new_par_before(nxt, d, 'Quote')
        runs(p, f"**v3 ruling ({r['date']}) — {r['name']}.** {r['text']}")
        rows.append((clean(paras[hi].text).split(' — ')[0], r['name'], r['date']))
        body = list(d.element.body)
    # the list: before the first Heading 1 after a CONTENTS heading, or before "1 · ..." in a Vector
    ci = next((i for i, p in enumerate(paras) if clean(p.text).upper() == 'CONTENTS'), None)
    target = None
    for p in paras[(ci + 1) if ci is not None else 0:]:
        if (level(p) == 1 and ci is not None) or (ci is None and level(p) in (1, 2) and re.match(r'^1[ .·]', clean(p.text))): target = p; break
    if book == 'bestiary': target = next(p for p in paras if clean(p.text) == 'HOW TO READ A BLOCK')
    h = new_par_before(target._p, d, 'Heading 3'); h.add_run(MARK)
    intro = new_par_before(target._p, d, 'Normal')
    runs(intro, 'These rulings were made while the AI Director was built and played (v3). Each is also written as a note at the end of the section it changes, marked *v3 ruling*.')
    t = d.add_table(rows=len(rows) + 1, cols=3); t.style = d.styles['Table Grid']
    for ci2, txt in enumerate(['Section', 'Ruling', 'Date']):
        t.rows[0].cells[ci2].text = txt
    for ri, row in enumerate(rows, 1):
        for ci2, txt in enumerate(row): t.rows[ri].cells[ci2].text = txt
    for ri, row in enumerate(t.rows):
        for c in row.cells:
            for run in c.paragraphs[0].runs:
                run.font.size = Pt(8.5)
                if ri == 0: run.bold = True
    target._p.addprevious(t._tbl)
    gap = new_par_before(target._p, d, 'Normal')
    d.save(path)
    print('ok', name, len(rows))
