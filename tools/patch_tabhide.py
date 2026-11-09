"""Director's Assistant: a tab marked Not needed on Tab Setup is removed from the tab bar (not redded out)."""
import sys, re
src, dst = sys.argv[1:3]
h = open(src, encoding="utf-8").read()
def rep(a, b):
    global h
    pat = re.compile(r"\s+".join(re.escape(x) for x in a.split()))
    assert len(pat.findall(h)) == 1, a[:60]
    h = pat.sub(lambda m: b, h)
rep("return !(TABPREFS.hide && tabIsOff(t[0]) && ui.tab !== t[0]);",
    "return !(tabIsOff(t[0]) && ui.tab !== t[0]); /* not-needed tabs are removed from the bar; Tab Setup brings them back */")
rep('''Mark a tab <b>Not needed</b> and it is redded out in the tab bar. It still opens if you " +
      "click it, and nothing in it is deleted.''',
    '''Mark a tab <b>Not needed</b> and it is removed from the tab bar. Nothing in it is deleted: " +
      "set it back to <b>Needed</b> here and it returns.''')
rep('''out += '<div class="row" style="margin-top:8px">' +
      '<label class="small"><input type="checkbox" data-tphide="1"' + (TABPREFS.hide ? " checked" : "") + "> " +
      "hide not-needed tabs from the bar instead of redding them out</label></div>";''', "")
rep('''">Not needed (red out)</option>"''', '''">Not needed (removed)</option>"''')
open(dst, "w", encoding="utf-8").write(h); print(len(h))
