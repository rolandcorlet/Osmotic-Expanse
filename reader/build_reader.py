"""Osmotic Expanse Reader — drop-in converter.

    python3 build_reader.py STORY.md --id what-the-water-owed [--level player|director] [--out reader.html] [--report report.txt]

Reads a Markdown document, links every Lexicon term it finds, and writes one self-contained Reader page
(fonts, styles, script, text and the term cards all inside). The same page is used standalone and inside
the apps' Reader tab. It also writes a NEW-WORD REPORT: capitalised words the Lexicon does not know yet —
add them to lexicon_src.py (or mark them in IGNORE) and rebuild.

Markup the converter understands, besides ordinary Markdown:
    [[Term]]           force a link to a Lexicon term (by name or any of its forms)
    [[Term|shown]]     link to Term, but show other words
    [[!word]]          never link this occurrence
"""
import sys, re, json, html, base64, argparse, os
HERE = os.path.dirname(os.path.abspath(__file__))
IGNORE = set("""Parts Part Ch Director's Codex Water Owed Core Rulebook Rules Society Social Norms Kid- Breakdown Air Conflict Belonging Rights Interest Price Leverage Clock Code Forest Dissolution Underground Pact Tithe Relay Shelter Concentrate Unlist Lysosan-founded Osmotic Honesty Name Bound Clean Count Ladders' Ladder Repeated Read Making Fresh Vast Codex Frequency Lysosomal Tide-strength Steward-claimant Motion's I A The An And But Or Of In On At To For By With From As If So Not No Yes It Its He She They We You
Here There This That These Those What Who When Where Why How Every Some One Two Three Four Five Six Seven Eight Nine Ten
Twenty Forty Hold Sit Breathe Go Let Then Now Once Most Nobody Nothing Everyone Everybody Somebody Somewhere Anyone Picture
Mark Take Ask Smell Tell Forgive Here Only Still Even Just Never Always Much More Less Under After Before Between Behind
Yes No Oh Not Sorry Friends Registrar""".split())

def load_lexicon(path, doc_id, level):
    L = json.load(open(path, encoding="utf-8"))
    keep = [t for t in L["terms"] if (t["scope"] is None or doc_id in (t["scope"] if isinstance(t["scope"], list) else [t["scope"]])) and (level == "director" or t["level"] == "player")]
    return L["cats"], keep

def build_matcher(terms):
    forms = []
    for t in terms:
        for f in [t["name"]] + t["aka"]:
            forms.append((f, t["id"]))
    forms.sort(key=lambda x: -len(x[0]))
    lookup = {}
    for f, i in forms: lookup.setdefault(f, i)
    alt = "|".join(re.escape(f) for f, _ in forms)
    rxs = [(re.compile(r), t["id"]) for t in terms for r in t["rx"]]
    word = re.compile(r"(?<![\w\-’'])(" + alt + r")(?![\w\-])")
    return word, lookup, rxs

INL = re.compile(r"(\*\*.+?\*\*|\*[^*\s][^*]*\*|`[^`]+`|\[\[[^\]]+\]\])")
def inline(text, link):
    """Markdown inline -> HTML, linking terms in plain-text runs only."""
    out = []
    for part in INL.split(text):
        if not part: continue
        if part.startswith("**") and part.endswith("**") and len(part) > 4: out.append("<b>" + inline(part[2:-2], link) + "</b>")
        elif part.startswith("[[") and part.endswith("]]"): out.append(link(part[2:-2], forced=True))
        elif part.startswith("`"): out.append("<code>" + html.escape(part[1:-1]) + "</code>")
        elif part.startswith("*") and part.endswith("*") and len(part) > 2: out.append("<i>" + inline(part[1:-1], link) + "</i>")
        else: out.append(link(part))
    return "".join(out)

def convert(md, terms, doc_id):
    word, lookup, rxs = build_matcher(terms)
    used, unknown = {}, {}
    cur = {"terms": []}
    def span(tid, shown):
        used[tid] = used.get(tid, 0) + 1
        if tid not in cur["terms"]: cur["terms"].append(tid)
        return '<span class="lx" data-t="%s">%s</span>' % (tid, html.escape(shown))
    def link(text, forced=False):
        if forced:
            if text.startswith("!"): return html.escape(text[1:])
            name, _, shown = text.partition("|")
            tid = lookup.get(name.strip()) or lookup.get(name.strip().capitalize())
            return span(tid, shown or name) if tid else html.escape(shown or name)
        hits = []
        for m in word.finditer(text): hits.append((m.start(), m.end(), lookup[m.group(1)]))
        for r, tid in rxs:
            for m in r.finditer(text):
                if not any(a < m.end() and m.start() < b for a, b, _ in hits): hits.append((m.start(), m.end(), tid))
        hits.sort(); res = []; pos = 0
        for a, b, tid in hits:
            if a < pos: continue
            res.append(html.escape(text[pos:a])); res.append(span(tid, text[a:b])); pos = b
        res.append(html.escape(text[pos:]))
        # new-word report: capitalised words mid-sentence that are not terms
        plain = re.sub(r"<[^>]+>", "", "".join(res))
        for m in re.finditer(r"(?<=[a-z,;:—] )([A-Z][a-z’'\-]+(?: [A-Z][a-z’'\-]+)*)", text):
            w = m.group(1)
            if w.split()[0] in IGNORE or w in lookup: continue
            if any(a <= m.start() < b for a, b, _ in hits): continue
            unknown[w] = unknown.get(w, 0) + 1
        return "".join(res)

    blocks = []; lines = md.replace("\r\n", "\n").lstrip("﻿").split("\n"); i = 0; para = []
    def flush():
        if para:
            cur["terms"] = []; h = inline(" ".join(para), link); blocks.append({"k": "p", "html": h, "terms": cur["terms"][:]}); para.clear()
    while i < len(lines):
        L = lines[i]
        if L.startswith("```"):
            flush(); j = i + 1; buf = []
            while j < len(lines) and not lines[j].startswith("```"): buf.append(lines[j]); j += 1
            blocks.append({"k": "pre", "html": html.escape("\n".join(buf)), "terms": []}); i = j + 1; continue
        m = re.match(r"^(#{1,3}) (.*)", L)
        if m:
            flush(); cur["terms"] = []
            blocks.append({"k": "h%d" % len(m.group(1)), "html": inline(m.group(2), lambda s, forced=False: html.escape(s)), "terms": []}); i += 1; continue
        if L.startswith("> "):
            flush(); cur["terms"] = []; h = inline(L[2:], link)
            if blocks and blocks[-1]["k"] == "q": blocks[-1]["html"] += "<br>" + h; blocks[-1]["terms"] += [t for t in cur["terms"] if t not in blocks[-1]["terms"]]
            else: blocks.append({"k": "q", "html": h, "terms": cur["terms"][:]})
            i += 1; continue
        if L.strip() == "---": flush(); blocks.append({"k": "hr", "html": "", "terms": []}); i += 1; continue
        m = re.match(r"^\s*(?:[-*+]|(\d+)\.) (.*)", L)
        if m:
            flush(); cur["terms"] = []; b = {"k": "li", "html": inline(m.group(2), link), "terms": []}
            b["terms"] = cur["terms"][:]
            if m.group(1): b["n"] = int(m.group(1))
            if L[:1] == " ": b["sub"] = 1
            blocks.append(b); i += 1; continue
        if L.startswith("|") and i + 1 < len(lines) and re.match(r"^\|\s*:?-", lines[i + 1]):
            flush(); rows = []; j = i
            while j < len(lines) and lines[j].startswith("|"):
                if j != i + 1: rows.append([c.strip() for c in lines[j].strip().strip("|").split("|")])
                j += 1
            cur["terms"] = []
            h = "<table>" + "".join("<tr>" + "".join(("<th>" if r == 0 else "<td>") + inline(c, link) + ("</th>" if r == 0 else "</td>") for c in row) + "</tr>" for r, row in enumerate(rows)) + "</table>"
            blocks.append({"k": "table", "html": h, "terms": cur["terms"][:]}); i = j; continue
        if not L.strip(): flush(); i += 1; continue
        para.append(L.strip()); i += 1
    flush()
    return blocks, used, unknown

def fonts_css():
    F = os.path.join(HERE, "fonts")
    def f(pkg, name):
        for root, _, files in os.walk(F):
            if name in files and pkg in root: return base64.b64encode(open(os.path.join(root, name), "rb").read()).decode()
        return None
    out = []
    for fam, pkg, base in [("Literata", "literata", "literata"), ("Atkinson Hyperlegible", "atkinson", "atkinson-hyperlegible"), ("OpenDyslexic", "opendyslexic", "opendyslexic")]:
        for wt, st in [(400, "normal"), (700, "normal"), (400, "italic")]:
            d = f(pkg, "%s-latin-%d-%s.woff2" % (base, wt, st))
            if d: out.append("@font-face{font-family:'%s';font-style:%s;font-weight:%d;font-display:swap;src:url(data:font/woff2;base64,%s) format('woff2')}" % (fam, st, wt, d))
    return "\n".join(out)

def build(md_path, doc_id, level, out, report):
    cats, terms = load_lexicon(os.path.join(HERE, "lexicon.json"), doc_id, level)
    md = open(md_path, encoding="utf-8").read()
    blocks, used, unknown = convert(md, terms, doc_id)
    title = next((re.sub("<[^>]+>", "", b["html"]) for b in blocks if b["k"] == "h1"), doc_id)
    termmap = {t["id"]: {k: t[k] for k in ("name", "cat", "def", "see", "src")} for t in terms if t["id"] in used}
    for t in list(termmap.values()): t["see"] = [s for s in t["see"] if s in termmap or any(x["id"] == s for x in terms)]
    for t in terms:   # cards reachable through "see also" must exist too
        if any(t["id"] in v["see"] for v in termmap.values()) and t["id"] not in termmap:
            termmap[t["id"]] = {k: t[k] for k in ("name", "cat", "def", "see", "src")}
    doc = {"id": doc_id, "title": title, "level": level, "cats": cats, "terms": termmap, "blocks": blocks}
    tpl = open(os.path.join(HERE, "reader.html"), encoding="utf-8").read()
    page = (tpl.replace("/*FONTS*/", fonts_css())
               .replace("/*CSS*/", open(os.path.join(HERE, "reader.css"), encoding="utf-8").read())
               .replace("/*JS*/", open(os.path.join(HERE, "reader.js"), encoding="utf-8").read())
               .replace("__TITLE__", html.escape(title))
               .replace("/*DOC*/", json.dumps(doc, ensure_ascii=False).replace("</", "<\\/")))
    open(out, "w", encoding="utf-8").write(page)
    rep = ["READER BUILD REPORT — %s (%s)" % (doc_id, level), "", "Linked: %d terms, %d links" % (len(used), sum(used.values())), "",
           "NEW WORDS (capitalised mid-sentence, not in the Lexicon) — add to lexicon_src.py or IGNORE:"]
    rep += ["  %4d  %s" % (n, w) for w, n in sorted(unknown.items(), key=lambda x: -x[1])]
    rep += ["", "MOST LINKED:"] + ["  %4d  %s" % (n, termmap[t]["name"]) for t, n in sorted(used.items(), key=lambda x: -x[1])[:40]]
    open(report, "w", encoding="utf-8").write("\n".join(rep))
    print("wrote", out, "(%d KB)" % (len(page) // 1024), "·", len(used), "terms ·", len(unknown), "new words → ", report)

if __name__ == "__main__":
    ap = argparse.ArgumentParser(); ap.add_argument("md"); ap.add_argument("--id", required=True)
    ap.add_argument("--level", default="player"); ap.add_argument("--out", default="reader-out.html"); ap.add_argument("--report", default="report.txt")
    a = ap.parse_args(); build(a.md, a.id, a.level, a.out, a.report)
