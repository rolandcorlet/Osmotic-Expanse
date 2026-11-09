"""Build the Players Assistant from the Director's Assistant: seven tabs, the four rulebooks, no Vectors."""
import sys, re
src, dst = sys.argv[1:3]
s = open(src, encoding='utf-8').read()
def rep(a, b, n=1):
    """Replace a literal, letting any run of whitespace in it match any run in the file."""
    global s
    pat = re.compile(r"\s+".join(re.escape(x) for x in a.split()))
    c = len(pat.findall(s)); assert c == n, (a[:60], c); s = pat.sub(lambda m: b, s)

KEEP = ["learn", "askbooks", "bitsight", "rollhelper", "mtime", "chargen", "characters", "colours"]
NAMES = '{learn:"Learn to Play",askbooks:"Ask the Books",bitsight:"BitSight",rollhelper:"Roll Helper",mtime:"Metabolic Time",chargen:"Char/Gen",characters:"Characters",colours:"Colours"}'

# 1. name
rep("<title>Director’s Assistant · The Osmotic Expanse</title>", "<title>Players Assistant · The Osmotic Expanse</title>")
rep("<h1>Director’s Assistant · The Osmotic Expanse</h1>", "<h1>Players Assistant · The Osmotic Expanse</h1>")
# 2. no campaign clock bar, no DM VIEW flag
rep("</style>\n</head>", "  #campbar { display:none !important }\n</style>\n</head>")
rep("function dmflag() { return '<span class=\"dmflag\">DM VIEW</span>'; }", "function dmflag() { return \"\"; }")
# 3. own storage, so a Players file opened locally never touches a Director's campaign
s = re.sub(r'"dma\.(preworld|phase\d)\.', r'"pa.\1.', s)
rep('"dma.osmo.theme.v1"', '"pa.osmo.theme.v1"')
for k in ["tabprefs", "ask", "ai"]: s = s.replace('"dmassist-osmotic-%s"' % k, '"playassist-osmotic-%s"' % k)
# 4. only the seven tabs, in this order, opening on Learn to Play
a = 'TABS.forEach(function (t) { if (RENAME[t[0]]) t[1] = RENAME[t[0]]; });\n  })();'
rep(a, a + '\n  /* PLAYERS EDITION: only these tabs, in this order. */\n  var PA_KEEP = ' + str(KEEP).replace("'", '"') + ', PA_NAMES = ' + NAMES + ';\n'
    '  TABS.length = 0; PA_KEEP.forEach(function (id) { TABS.push([id, PA_NAMES[id]]); });\n'
    '  function paOk(id) { return PA_KEEP.indexOf(id) >= 0 || id === "aisetup"; } /* AI Setup: off the strip, opened from Ask the Books */')
rep('var ui = {\n    tab: "roster",', 'var ui = {\n    tab: "learn",')
rep("tabsEl.innerHTML = allTabs().filter(function (t) {", "tabsEl.innerHTML = allTabs().filter(function (t) { if (PA_KEEP.indexOf(t[0]) < 0) return false;")
rep("if (ui.tab === h) return; ui.tab = h; render();", "if (ui.tab === h || !paOk(h)) return; ui.tab = h; render();")
rep("function render() {\n    rememberFormValues();", "function render() {\n    if (!paOk(ui.tab)) ui.tab = \"learn\";\n    rememberFormValues();")
# 5. no Vectors (campaigns): the packs go, and every reader of them copes with none
i = s.index('var OSMO_PACKS = ['); j = s.index('];', s.index('cut was made by a licensed tool.*', i)) + 2
s = s[:i] + 'var OSMO_PACKS = [];' + s[j:]
rep("return c ? c.packId : OSMO_PACKS[0].id;", "return c ? c.packId : (OSMO_PACKS[0] ? OSMO_PACKS[0].id : null);")
s = s.replace("the four books and the Vectors, searched in this browser", "the four rulebooks, searched in this browser")
s = s.replace("your BitSight reader, with the four books and the Vectors already in its library", "your BitSight reader, with the four rulebooks already in its library")
s = s.replace("<b>The Osmotic Expanse</b> books and the three Vectors next to anything you have added yourself", "the four <b>Osmotic Expanse</b> rulebooks next to anything you have added yourself")
rep('[{ v: "all", l: "everything (books and Vectors)" }, { v: "books", l: "the four books only" }, { v: "current", l: cur ? "the current Vector: " + cur.title : "the current Vector (none injected yet)" }]', '[{ v: "all", l: "all four rulebooks" }]')
rep("function vectorCheckPanel() {", "function vectorCheckPanel() { if (!OSMO_PACKS.length) return \"\";")
s = s.replace("the Director\u2019s own generator", "your organism generator").replace("the Director's own generator", "your organism generator")
s = s.replace("the DM\\u2019s own generator", "your organism generator")
assert "First Carve\", \"subtitle" not in s and '"id": "long-swallow"' not in s
open(dst, 'w', encoding='utf-8').write(s); print(len(s))
