"""Add the Reader tab to a DM or Players app.
usage: python3 patch_reader.py IN.html OUT.html id1=reader1.html [id2=reader2.html ...]
Each reader page is embedded (base64) and listed in the tab's document picker in the order given.
Re-running on an already-patched app replaces the embedded documents."""
import sys, re, json, base64
src, dst, docs = sys.argv[1], sys.argv[2], sys.argv[3:]
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

fn = r'''
  /* OSMOTIC READER: begin */
  var READER_DOCS = __DOCS__, READER_URLS = {}, READER_CUR = null;
  try { READER_CUR = localStorage.getItem("oxreader.doc"); } catch (e) {}
  var READER_NORMAL = "width:100%;height:calc(100vh - 150px);min-height:640px;border:0;border-radius:12px;background:#0b1118";
  var READER_FULL = "position:fixed;inset:0;width:100vw;height:100vh;z-index:99999;border:0;border-radius:0;background:#0b1118";
  window.addEventListener("message", function (ev) {
    if (!ev.data || typeof ev.data.oxReaderFull !== "boolean") return;
    var f = document.getElementById("readerFrame"); if (!f || ev.source !== f.contentWindow) return;
    f.style.cssText = ev.data.oxReaderFull ? READER_FULL : READER_NORMAL;
    document.documentElement.style.overflow = ev.data.oxReaderFull ? "hidden" : "";
  });
  function readerUrl(id) {
    if (!READER_URLS[id]) {
      var b = atob(document.getElementById("reader-src-" + id).textContent.trim()), u = new Uint8Array(b.length);
      for (var i = 0; i < b.length; i++) u[i] = b.charCodeAt(i);
      READER_URLS[id] = URL.createObjectURL(new Blob([u], { type: "text/html" }));
    }
    return READER_URLS[id];
  }
  window.oxReaderOpen = function (id) {
    READER_CUR = id; try { localStorage.setItem("oxreader.doc", id); } catch (e) {}
    var f = document.getElementById("readerFrame"); if (f) f.src = readerUrl(id);
  };
  function screenReader() {
    if (!READER_DOCS.length) return '<div class="boot-err">No documents have been converted for the Reader yet.</div>';
    if (!READER_DOCS.some(function (d) { return d.id === READER_CUR; })) READER_CUR = READER_DOCS[0].id;
    var url; try { url = readerUrl(READER_CUR); } catch (e) { return '<div class="boot-err">The Reader could not be opened: ' + String(e) + "</div>"; }
    var pick = READER_DOCS.length > 1
      ? '<select onchange="oxReaderOpen(this.value)" style="margin-left:auto">' + READER_DOCS.map(function (d) { return "<option value=\"" + d.id + "\"" + (d.id === READER_CUR ? " selected" : "") + ">" + d.title + "</option>"; }).join("") + "</select>"
      : "";
    return '<div class="featcheck"><h2>Reader</h2><span class="badge">term cards · listen · speed-read</span>' +
      '<span class="cite">tap or hover any coloured word for its card · ⛶ in the Reader goes full window · ⬇ saves a web page you can post</span>' + pick + "</div>" +
      '<iframe id="readerFrame" title="Reader" src="' + url + '" style="' + READER_NORMAL + '" allow="fullscreen"></iframe>';
  }
  /* OSMOTIC READER: end */
'''.replace("__DOCS__", json.dumps(meta, ensure_ascii=False))
rep("  function screenLearn() {", fn + "  function screenLearn() {")

# Players edition: allow the tab
if "PA_KEEP = [" in h:
    h = re.sub(r'PA_KEEP = \[([^\]]*)\]', lambda m: 'PA_KEEP = [' + (m.group(1) if '"reader"' in m.group(1) else m.group(1).replace('"learn"', '"learn", "reader"', 1)) + ']', h, count=1)
    h = re.sub(r'PA_NAMES = \{', lambda m: m.group(0) if 'reader:"Reader"' in h else 'PA_NAMES = {reader:"Reader",', h, count=1)

rep('<script id="learn-src" type="text/plain">', "".join(tags) + '<script id="learn-src" type="text/plain">')
open(dst, "w", encoding="utf-8").write(h); print(dst, len(h), [m["title"] for m in meta])
