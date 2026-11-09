"""Metabolic Time: rename CORE §8.1 in the embedded books, give it the full table, and add a Metabolic Time tab."""
import sys, json, re
sys.path.insert(0, "/home/claude/work/mt")
from content import INTRO, INTRO2, CONV, TIDES, GLOSS, md_table, ROWS, HEAD
src, dst = sys.argv[1:3]
h = open(src, encoding="utf-8").read()
def js(s): return json.dumps(s, ensure_ascii=False)[1:-1]

# 1. the books: CORE §8.1 body and heading, every cite that names it, and the glossary
m = re.search(r'"heading":"8\.1 Expanse time","depth":2,"body":"', h); assert m
end = h.index(js("**What a scene is.**"), m.end())
h = h[:m.end()] + js("\n" + INTRO + "\n\n" + INTRO2 + "\n\n" + md_table() + "\n" + CONV + "\n\n" + TIDES + "\n\n") + h[end:]
h = h.replace("8.1 Expanse time", "8.1 Metabolic Time")
g = js("**Metabolic Stress** — attention/damage track, 0–8. · "); assert h.count(g) == 1
h = h.replace(g, g + js(GLOSS))

# 2. the tab
a = 'if (!seenTab.rollhelper) { TABS.splice(ci >= 0 ? ci + 1 : TABS.length, 0, ["rollhelper", "Roll Helper"]); seenTab.rollhelper = 1; }'
assert h.count(a) == 1
h = h.replace(a, a + ' if (!seenTab.mtime) { var ri = -1; TABS.forEach(function (t, i) { if (t[0] === "rollhelper") ri = i; }); TABS.splice(ri + 1, 0, ["mtime", "Metabolic Time"]); seenTab.mtime = 1; }')
b = 'case "rollhelper": body = screenRollHelper(); break;'
assert h.count(b) == 1
h = h.replace(b, b + ' case "mtime": body = screenMetabolicTime(); break;')

rows = [r[:] for r in ROWS]
rows.insert(7, ["Pulse Ten", "10 Beats", "10 Beats, labelled Beat 1–10", "a week", "The app's calendar only: the books name no week. Three Pulse Tens fill a Drift Season. (app convention)"])
CONVT = [["1 minute", "10", "", ""], ["1 Fugue Interval", "600", "1", "1⁄24"], ["1 Dormant Cycle", "3,600", "6", "¼"],
         ["1 Metabolic Beat", "14,400", "24", "1"], ["1 Pulse Ten (app)", "144,000", "240", "10"], ["1 Drift Season", "432,000", "720", "30"],
         ["1 Osmotic Tide", "1,728,000", "2,880", "120"], ["1 Great Cycle", "", "46,080", "1,920 (the Codex prints ~1,900)"]]
REC = [["A quiet Cycle (no ATP spent, no damage taken)", "1 Cycle", "−1 Stress"], ["Vent", "1 PP in combat (2 ATP)", "−2 Stress"],
       ["Chemotactic Rite", "1 Fugue Interval (3 Substrate each)", "all Stress and +2 Cohesion (CORE §5.8, §11.6)"],
       ["Reconstitution (short rest)", "1 Fugue Interval", "all Stress, full ATP, heal VSC + Hull MI"],
       ["Dormant Cycle (long rest)", "6 hours", "full MI, Lysis Countdown cleared, once-per-encounter features refreshed"]]
PHASES = [["Isotonic Rise", "neutral → slightly hypertonic", "travel is cheap; healing normal; PP full"],
          ["Hypertonic Zenith", "all regions hypertonic", "DFF pools −2, PP −1, Drift +1 PP, healing halved, VSC +2"],
          ["Isotonic Fall", "neutral → slightly hypotonic", "regeneration strengthens; Harvest yields +1 grade"],
          ["Hypotonic Zenith", "all regions hypotonic", "DFF +2, PP +1, MT −2, Turgid on heavy hits"]]
def mdi(s): return re.sub(r"\*([^*]+)\*", r"<i>\1</i>", re.sub(r"\*\*([^*]+)\*\*", r"<b>\1</b>", s))
def tbl(head, rows, boldfirst=True):
    return ('<table class="tbl"><tr>' + "".join("<th>" + x + "</th>" for x in head) + "</tr>" +
            "".join("<tr>" + "".join(("<td><b>" + c + "</b></td>") if (i == 0 and boldfirst) else ("<td>" + c + "</td>") for i, c in enumerate(r)) + "</tr>" for r in rows) + "</table>")
html = ('<div class="featcheck"><h2>Metabolic Time</h2><span class="badge">the Rhythm</span><span class="cite">CORE §8.1 · CODEX §5.1, §5.3</span></div>'
        '<div class="subgroup"><p style="margin:0 0 6px"><i>The Expanse does not count hours; it counts the Rhythm of bodies — the Pulse, the Beat, the Tide.</i></p>'
        "<p style=\"margin:0\">" + mdi(INTRO2) + "</p></div>"
        '<div class="subgroup"><h3 style="margin:0 0 4px">Every unit, shortest to longest</h3>' + tbl(HEAD, rows) + "</div>"
        '<div class="subgroup"><h3 style="margin:0 0 4px">Conversions</h3>' + tbl(["", "Pulse Cycles", "Fugue Intervals", "Metabolic Beats"], CONVT) + "</div>"
        '<div class="subgroup"><h3 style="margin:0 0 4px">The four phases of an Osmotic Tide</h3><div class="small dim">Each phase lasts one Drift Season (~30 Beats); the four together are one Tide (CODEX §5.3).</div>'
        + tbl(["Phase", "Regions trend", "At the table"], PHASES) + "</div>"
        '<div class="subgroup"><h3 style="margin:0 0 4px">Recovery, by time</h3>' + tbl(["Recovery", "Takes", "Clears"], REC) + "</div>"
        '<div class="subgroup"><h3 style="margin:0 0 4px">Worth knowing</h3><ul style="margin:4px 0 0 18px;padding:0">'
        "<li><b>What a scene is.</b> One continuous situation with one purpose in one place. It ends when the place, the purpose or the people change, or after about one Fugue Interval — and every <i>once per scene</i> ability resets. A Beat holds many scenes (CORE §8.1).</li>"
        "<li>" + mdi(TIDES) + "</li>"
        "<li><b>Great Cycle arithmetic.</b> 16 × 4 × 30 = 1,920 Beats; the Codex prints “~1,900”.</li>"
        "<li><b>App conventions, not rules:</b> the Pulse Ten week, and the Director's “+10 min” button (100 Cycles).</li></ul></div>")
fn = "  /* OSMOTIC: Metabolic Time — every unit of time, one tab (CORE §8.1, CODEX §5.1, §5.3). */\n  function screenMetabolicTime() { return " + json.dumps(html, ensure_ascii=False).replace("</", "<\\/") + "; }\n\n"
c = "  function screenRollHelper() {"; assert h.count(c) == 1
h = h.replace(c, fn + c)
open(dst, "w", encoding="utf-8").write(h); print(len(h))
