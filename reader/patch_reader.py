"""Add the Reader tab to a DM or Players app.
usage: python3 patch_reader.py IN.html OUT.html [--level=director] id1=reader1.html [id2=reader2.html ...]
Each reader page is embedded (base64) and listed in the tab's document picker in the order given.
Re-running on an already-patched app replaces the embedded documents."""
import sys, re, json, base64
import os
HERE = os.path.dirname(os.path.abspath(__file__))
args = [x for x in sys.argv[1:] if not x.startswith("--level=")]
LEVEL = next((x.split("=", 1)[1] for x in sys.argv[1:] if x.startswith("--level=")), "player")
src, dst, docs = args[0], args[1], args[2:]
h = open(src, encoding="utf-8").read()

def rep(a, b, n=1):
    global h
    assert h.count(a) == n, (a[:80], h.count(a)); h = h.replace(a, b)

# strip a previous Reader patch
h = re.sub(r'<script id="reader-src-[^"]+" type="text/plain">[^<]*</script>\n?', "", h)
h = re.sub(r"\n  /\* OSMOTIC READER: begin \*/.*?/\* OSMOTIC READER: end \*/\n", "", h, flags=re.S)
h = h.replace(' case "reader": body = screenReader(); break;', "")
h = re.sub(r' if \(!seenTab\.reader\) \{.*?seenTab\.reader = 1; \}', "", h)

meta, tags = [], []
for d in docs:
    did, path = d.split("=", 1)
    page = open(path, encoding="utf-8").read()
    m = re.search(r'<script id="docdata" type="application/json">(.*?)</script>', page, re.S)
    title = json.loads(m.group(1))["title"]
    meta.append({"id": did, "title": title})
    tags.append('<script id="reader-src-%s" type="text/plain">%s</script>\n' % (did, base64.b64encode(page.encode("utf-8")).decode()))

# the tab: right after Learn to Play
a = 'if (!seenTab.learn) { TABS.splice(0, 0, ["learn", "Learn to Play"]); seenTab.learn = 1; }'
rep(a, a + ' if (!seenTab.reader) { TABS.splice(1, 0, ["reader", "Reader"]); seenTab.reader = 1; }')
rep('case "learn": body = screenLearn(); break;', 'case "learn": body = screenLearn(); break; case "reader": body = screenReader(); break;')

import importlib.util
_spec = importlib.util.spec_from_file_location("br", os.path.join(HERE, "build_reader.py")); _br = importlib.util.module_from_spec(_spec); _spec.loader.exec_module(_br)
L = json.load(open(os.path.join(HERE, "lexicon.json"), encoding="utf-8"))
lex = {"cats": L["cats"], "terms": [{k: t[k] for k in ("id", "name", "cat", "def", "aka", "see", "src", "rx")}
        for t in L["terms"] if t["scope"] is None and (LEVEL == "director" or t["level"] == "player")]}
fn = (open(os.path.join(HERE, "app_reader.js"), encoding="utf-8").read()
      .replace("__DOCS__", json.dumps(meta, ensure_ascii=False))
      .replace("__LEX__", json.dumps(lex, ensure_ascii=False).replace("</", "<\\/"))
      .replace("__LEVEL__", LEVEL)
      .replace("__IGNORE__", " ".join(sorted(_br.IGNORE)).replace('"', "")))
rep("  function screenLearn() {", fn + "  function screenLearn() {")

# Players edition: allow the tab
if "PA_KEEP = [" in h:
    h = re.sub(r'PA_KEEP = \[([^\]]*)\]', lambda m: 'PA_KEEP = [' + (m.group(1) if '"reader"' in m.group(1) else m.group(1).replace('"learn"', '"learn", "reader"', 1)) + ']', h, count=1)
    h = re.sub(r'PA_NAMES = \{', lambda m: m.group(0) if 'reader:"Reader"' in h else 'PA_NAMES = {reader:"Reader",', h, count=1)

rep('<script id="learn-src" type="text/plain">', "".join(tags) + '<script id="learn-src" type="text/plain">')
open(dst, "w", encoding="utf-8").write(h); print(dst, len(h), [m["title"] for m in meta])
