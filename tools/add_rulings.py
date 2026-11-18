"""Write any v3 ruling the books do not carry yet into them, in place (19 Nov 2026).

The source of truth is v3/director/data/kit/rulings.js. For each book, a ruling not already in it
gets a note at the end of the section it names (Markdown: a "> **v3 ruling (...)**" quote; Word: a
Quote paragraph) and a row in the book's "v3 RULINGS (November 2026)" table near the front. Running
it again changes nothing. patch_rulings_docx.py made the first pass (17 Nov) and refuses a book that
already has the table; this one only adds.

    python3 tools/add_rulings.py
"""
import json, re, subprocess
import docx
from docx.oxml.ns import qn

ROOT = __file__.rsplit('/tools/', 1)[0] + '/'
FILES = {'core': 'CORE RULEBOOK', 'atlas': "PLAYER'S ATLAS", 'codex': "DIRECTOR'S CODEX", 'bestiary': 'LYTIC BESTIARY',
         'first-carve': 'THE FIRST CARVE', 'ninth-shift': 'THE NINTH SHIFT', 'long-swallow': 'THE LONG SWALLOW'}
js = subprocess.run(['node', '-e', "import('./v3/director/data/kit/rulings.js').then(m=>console.log(JSON.stringify(m.RULINGS)))"],
                    cwd=ROOT, capture_output=True, text=True, check=True).stdout
RULINGS = json.loads(js)
MARK = 'v3 RULINGS (November 2026)'
INL = re.compile(r"(\*\*.+?\*\*|\*[^*\s][^*]*\*)")


def clean(t):
    return re.sub(r'[*`]', '', t).strip()


def note_md(r):
    return f"> **v3 ruling ({r['date']}) — {r['name']}.** {r['text']}"


# ---------------------------------------------------------------- Markdown
def md_book(book, name):
    path = f'{ROOT}books/The Osmotic Expanse - {name}.md'
    lines = open(path, encoding='utf-8', newline='').read().split('\n')
    added = []
    for r in [x for x in RULINGS if x['book'] == book]:
        if any(f"— {r['name']}.**" in l for l in lines):
            continue
        want = clean(r['section'])
        hi = next((i for i, l in enumerate(lines) if re.match(r'^#{1,6} ', l) and clean(re.sub(r'^#+\s*', '', l)).startswith(want) and i > 60), None)
        if hi is None:
            hi = next((i for i, l in enumerate(lines) if re.match(r'^#{1,6} ', l) and clean(re.sub(r'^#+\s*', '', l)).startswith(want)), None)
        if hi is None:
            raise SystemExit(f'{name}: no heading "{want}"')
        lv = len(re.match(r'^(#+)', lines[hi]).group(1))
        end = len(lines)
        for j in range(hi + 1, len(lines)):
            m = re.match(r'^(#+) ', lines[j])
            if m and len(m.group(1)) <= max(lv, 2):
                end = j
                break
        # step back over blank lines and a trailing rule, so the note sits inside the section
        k = end
        while k > hi + 1 and lines[k - 1].strip() in ('', '---', '* * *'):
            k -= 1
        lines[k:k] = ['', note_md(r)]
        added.append(r)
    if added:
        mi = next(i for i, l in enumerate(lines) if MARK in l)
        j = mi + 1
        while j < len(lines) and not lines[j].startswith('| :--'):
            j += 1
        j += 1
        while j < len(lines) and lines[j].startswith('|'):
            j += 1
        lines[j:j] = [f"| {r['section']} | {r['name']} | {r['date']} |" for r in added]
        open(path, 'w', encoding='utf-8', newline='').write('\n'.join(lines))
    return [r['name'] for r in added]


# ---------------------------------------------------------------- Word
def runs(p, text, bold=False):
    for part in INL.split(text):
        if not part:
            continue
        if part.startswith('**') and part.endswith('**') and len(part) > 4:
            runs(p, part[2:-2], True)
        elif part.startswith('*') and part.endswith('*') and len(part) > 2:
            r = p.add_run(part[1:-1]); r.italic = True; r.bold = bold or None
        else:
            r = p.add_run(part); r.bold = bold or None


def level(p):
    m = re.match(r'Heading (\d)', p.style.name)
    return int(m.group(1)) if m else (0 if p.style.name == 'Title' else None)


def docx_book(book, name):
    path = f'{ROOT}books/The Osmotic Expanse - {name}.docx'
    d = docx.Document(path)
    have = '\n'.join(p.text for p in d.paragraphs)
    todo = [r for r in RULINGS if r['book'] == book and f"— {r['name']}." not in have]
    if not todo:
        return []
    for r in todo:
        paras = d.paragraphs
        body = list(d.element.body)
        want = clean(r['section'])
        cands = [i for i, p in enumerate(paras) if level(p) and clean(p.text).startswith(want)]
        if not cands:
            raise SystemExit(f'{name}.docx: no heading "{want}"')
        hi = cands[-1] if len(cands) > 1 else cands[0]  # past the contents list, when it repeats the heading
        lv = level(paras[hi])
        start = body.index(paras[hi]._p)
        nxt = None
        for el in body[start + 1:]:
            if el.tag == qn('w:p'):
                st = el.find(qn('w:pPr'))
                sid = st.find(qn('w:pStyle')).get(qn('w:val')) if st is not None and st.find(qn('w:pStyle')) is not None else ''
                m = re.match(r'Heading(\d)', sid)
                if m and int(m.group(1)) <= max(lv, 2):
                    nxt = el
                    break
        if nxt is None:
            nxt = d.element.body.find(qn('w:sectPr'))
        prev = nxt.getprevious()
        while prev is not None and prev.tag == qn('w:p') and ''.join(prev.itertext()).strip() in ('', '* * *'):
            nxt = prev
            prev = nxt.getprevious()
        p = d.add_paragraph(style='Quote')
        nxt.addprevious(p._p)
        runs(p, f"**v3 ruling ({r['date']}) — {r['name']}.** {r['text']}")
    # rows in the rulings table that follows the MARK heading
    mark = next(p for p in d.paragraphs if MARK in p.text)
    el = mark._p.getnext()
    while el is not None and el.tag != qn('w:tbl'):
        el = el.getnext()
    table = next(t for t in d.tables if t._tbl is el)
    # match the look of the rows already there (their font size and bold)
    model = table.rows[-1].cells[0].paragraphs[0]
    size = next((x.font.size for x in model.runs if x.font.size), None)
    for r in todo:
        cells = table.add_row().cells
        for c, txt in zip(cells, [r['section'], r['name'], r['date']]):
            c.text = txt
            for para in c.paragraphs:
                if model.style is not None:
                    para.style = model.style
                for x in para.runs:
                    if size:
                        x.font.size = size
    d.save(path)
    return [r['name'] for r in todo]


if __name__ == '__main__':
    for book, name in FILES.items():
        a = md_book(book, name)
        b = docx_book(book, name)
        if a or b:
            print(f'{name}: .md +{len(a)} {a}; .docx +{len(b)} {b}')
    print('done')
