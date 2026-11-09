import sys,base64
src,dst,les=sys.argv[1:4]
s=open(src,encoding='utf-8').read()
b64=base64.b64encode(open(les,'rb').read()).decode()
a='if (!seenTab.rollhelper) { TABS.splice(ci >= 0 ? ci + 1 : TABS.length, 0, ["rollhelper", "Roll Helper"]); seenTab.rollhelper = 1; }'
assert s.count(a)==1
s=s.replace(a,a+' if (!seenTab.learn) { TABS.splice(0, 0, ["learn", "Learn to Play"]); seenTab.learn = 1; }')
b='case "rollhelper": body = screenRollHelper(); break;'
assert s.count(b)==1
s=s.replace(b,b+' case "learn": body = screenLearn(); break;')
c='  function screenRollHelper() {'
assert s.count(c)==1
fn='''  /* OSMOTIC: Learn to Play — seven animated lessons, embedded whole and opened from a Blob so the app stays one file. */
  var LEARN_URL = null;
  window.addEventListener("message", function (ev) {
    if (!ev.data || typeof ev.data.oxLearnFull !== "boolean") return;
    var f = document.getElementById("learnFrame"); if (!f || ev.source !== f.contentWindow) return;
    f.style.cssText = ev.data.oxLearnFull ? LEARN_FULL : LEARN_NORMAL;
    document.documentElement.style.overflow = ev.data.oxLearnFull ? "hidden" : "";
  });
  var LEARN_NORMAL = "width:100%;height:calc(100vh - 150px);min-height:780px;border:0;border-radius:12px;background:#070d14";
  var LEARN_FULL = "position:fixed;inset:0;width:100vw;height:100vh;z-index:99999;border:0;border-radius:0;background:#000";
  function screenLearn() {
    if (!LEARN_URL) {
      try {
        var b = atob(document.getElementById("learn-src").textContent.trim()), u = new Uint8Array(b.length);
        for (var i = 0; i < b.length; i++) u[i] = b.charCodeAt(i);
        LEARN_URL = URL.createObjectURL(new Blob([u], { type: "text/html" }));
      } catch (e) { return '<div class="boot-err">The lessons could not be opened: ' + String(e) + "</div>"; }
    }
    return '<div class="featcheck"><h2>Learn to Play</h2><span class="badge">7 animated lessons</span>' +
      '<span class="cite">the core loop for new players: the roll, building a pool, the Pulse Cycle, attacks, Stress, reactions and Overdrive</span></div>' +
      '<iframe id="learnFrame" title="Learn to Play" src="' + LEARN_URL + '" style="' + LEARN_NORMAL + '" allow="autoplay; fullscreen" allowfullscreen></iframe>';
  }

'''
s=s.replace(c,fn+c)
d='</body>'
i=s.rfind(d); s=s[:i]+'<script id="learn-src" type="text/plain">'+b64+'</script>\n'+s[i:]
open(dst,'w',encoding='utf-8').write(s); print(len(s))
