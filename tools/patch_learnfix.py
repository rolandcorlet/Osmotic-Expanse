"""Learn to Play: swap in the rebuilt lessons page and let the frame size itself to the screen.
usage: python3 patch_learnfix.py APP.html OUT.html ../lessons/lessons.html"""
import sys, re, base64
src, dst, les = sys.argv[1:4]
h = open(src, encoding="utf-8").read()
b64 = base64.b64encode(open(les, "rb").read()).decode()
h, n = re.subn(r'(<script id="learn-src" type="text/plain">)[^<]*(</script>)', lambda m: m.group(1) + b64 + m.group(2), h)
assert n == 1, "learn-src"
old = "height:calc(100vh - 150px);min-height:780px"
if old in h: h = h.replace(old, "height:calc(100vh - 140px);min-height:420px")
assert "min-height:780px" not in h
open(dst, "w", encoding="utf-8").write(h); print(dst, len(h))
