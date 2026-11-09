"""Director's Assistant: delete the tabs the Director marked Not needed (Tab Setup screenshot, 2026-11-09)."""
import sys, re
src, dst = sys.argv[1:3]
h = open(src, encoding="utf-8").read()
REMOVE = ["conditions", "resources", "clocks", "loot", "userview", "continuity", "recall", "copilot", "library", "npc",
          "firewall", "readaloud", "events", "downtime", "extras", "sidereview", "editing"]
def rep(a, b):
    global h
    pat = re.compile(r"\s+".join(re.escape(x) for x in a.split()))
    assert len(pat.findall(h)) == 1, a[:60]
    h = pat.sub(lambda m: b, h)
a = 'TABS.forEach(function (t) { if (RENAME[t[0]]) t[1] = RENAME[t[0]]; });\n  })();'
rep(a, a + '\n  /* REMOVED TABS: the Director marked these Not needed; they are gone from the strip, Tab Setup and every link. */\n'
    '  var DM_REMOVED = ' + str(REMOVE).replace("'", '"') + ';\n'
    '  for (var rti = TABS.length - 1; rti >= 0; rti--) { if (DM_REMOVED.indexOf(TABS[rti][0]) >= 0) TABS.splice(rti, 1); }\n'
    '  function tabGone(id) { return DM_REMOVED.indexOf(id) >= 0; }')
rep("function render() {\n    rememberFormValues();", 'function render() {\n    if (tabGone(ui.tab)) ui.tab = "roster";\n    rememberFormValues();')
rep("if (ui.tab === h) return; ui.tab = h; render();", "if (ui.tab === h || tabGone(h)) return; ui.tab = h; render();")
rep("tabsEl.innerHTML = allTabs().filter(function (t) {", "tabsEl.innerHTML = allTabs().filter(function (t) { if (tabGone(t[0])) return false;")
open(dst, "w", encoding="utf-8").write(h); print(len(h))
