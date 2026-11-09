"""Apply the six book errata to the books embedded in the app (and the campaign packs that cite Gene-Debt)."""
import sys, json
src, dst = sys.argv[1:3]
g = {}; exec(open("/home/claude/work/errata/errata.py").read().split("for book in FIX:")[0], g)
h = open(src, encoding="utf-8").read()
def js(s): return json.dumps(s, ensure_ascii=False)[1:-1]
for book, fixes in g["FIX"].items():
    for old, new in fixes:
        for form in {js(old): js(new), old: new}.items():
            n = h.count(form[0])
            if n: h = h.replace(form[0], form[1]); print(f"{n:2d}x", book, old[:50])
a = js(g["CHEM_NEW"]); assert h.count(a) >= 1
h = h.replace(a, a + js(g["CASCADE_MD"]), 1)
m = "all Stress and +2 Cohesion (CORE §11.6); §5.8 prints −3 Stress — the Director rules"
print("mtime note", h.count(m)); h = h.replace(m, "all Stress and +2 Cohesion (CORE §5.8, §11.6)")
open(dst, "w", encoding="utf-8").write(h)
