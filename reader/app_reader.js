
  /* OSMOTIC READER: begin */
  /* The Reader tab: built-in documents (converted by reader/build_reader.py) plus the user's own,
     converted here in the browser with the same rules and the same Lexicon, kept in this browser only. */
  var READER_DOCS = __DOCS__, READER_LEX = __LEX__, READER_LEVEL = "__LEVEL__";
  var READER_URLS = {}, READER_CUR = null, READER_TPL = null, READER_PANEL = "";
  try { READER_CUR = localStorage.getItem("oxreader.doc"); } catch (e) {}
  var READER_NORMAL = "width:100%;height:calc(100vh - 140px);min-height:420px;border:0;border-radius:12px;background:#0b1118";
  var READER_FULL = "position:fixed;inset:0;width:100vw;height:100vh;z-index:99999;border:0;border-radius:0;background:#0b1118";
  window.addEventListener("message", function (ev) {
    if (!ev.data || typeof ev.data.oxReaderFull !== "boolean") return;
    var f = document.getElementById("readerFrame"); if (!f || ev.source !== f.contentWindow) return;
    f.style.cssText = ev.data.oxReaderFull ? READER_FULL : READER_NORMAL;
    document.documentElement.style.overflow = ev.data.oxReaderFull ? "hidden" : "";
  });
  /* Both embedded pages (Learn to Play and the Reader) are sized to the screen, so their controls are never below the fold,
     and switching tabs silences them: the browser's speech engine is shared, and a page being closed does not always stop it. */
  function oxFitFrames() {
    ["learnFrame", "readerFrame"].forEach(function (id) {
      var f = document.getElementById(id); if (!f || f.style.position === "fixed") return;
      var top = f.getBoundingClientRect().top + (window.scrollY || 0), room = window.innerHeight - top - 12;
      if (room >= 520) { f.style.height = room + "px"; }
      else {   /* a tall header (many tabs, a small screen): give the frame the whole screen and bring it into view */
        f.style.height = Math.max(360, window.innerHeight - 16) + "px";
        if (!f.dataset.oxScrolled) { f.dataset.oxScrolled = "1"; window.scrollTo({ top: Math.max(0, top - 8), behavior: "smooth" }); }
      }
      f.style.minHeight = "0";
    });
  }
  var oxFitQueued = 0;
  function oxFitSoon() { if (!oxFitQueued) oxFitQueued = requestAnimationFrame(function () { oxFitQueued = 0; oxFitFrames(); }); }
  window.addEventListener("resize", oxFitSoon);
  window.addEventListener("message", function () { setTimeout(oxFitFrames, 30); });
  try { new MutationObserver(function (ms) {
    for (var i = 0; i < ms.length; i++) for (var j = 0; j < ms[i].addedNodes.length; j++) { var n = ms[i].addedNodes[j];
      if (n.nodeType === 1 && (n.id === "learnFrame" || n.id === "readerFrame" || (n.querySelector && n.querySelector("#learnFrame,#readerFrame")))) { oxFitSoon(); return; } }
  }).observe(document.documentElement, { childList: true, subtree: true }); } catch (e) {}
  function oxHushFrames() {
    ["learnFrame", "readerFrame"].forEach(function (id) {
      var f = document.getElementById(id);
      try { if (f && f.contentWindow && f.contentWindow.speechSynthesis) f.contentWindow.speechSynthesis.cancel(); } catch (e) {}
    });
    try { if (window.speechSynthesis) window.speechSynthesis.cancel(); } catch (e) {}
  }
  document.addEventListener("click", function (e) { if (e.target.closest && e.target.closest('[data-act="tab"]')) oxHushFrames(); }, true);
  function rdEsc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#x27;" }[c]; }); }
  function rdB64(id) {
    var b = atob(document.getElementById("reader-src-" + id).textContent.trim()), u = new Uint8Array(b.length);
    for (var i = 0; i < b.length; i++) u[i] = b.charCodeAt(i);
    return new TextDecoder("utf-8").decode(u);
  }
  /* ---- the user's own documents and cards (this browser only) ---- */
  function rdLoad(k, d) { try { return JSON.parse(localStorage.getItem(k) || "null") || d; } catch (e) { return d; } }
  function rdSave(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { alert("This browser has no room left to keep the document. Remove one of your documents and try again."); return false; } }
  function rdMine() { return rdLoad("oxreader.mydocs", []); }
  function rdCards() { return rdLoad("oxreader.mycards", []); }
  function rdIsMine(id) { return rdMine().some(function (d) { return d.id === id; }); }

  /* ---- the converter: a faithful port of reader/build_reader.py ---- */
  var RD_IGNORE = {}; "__IGNORE__".split(" ").forEach(function (w) { RD_IGNORE[w] = 1; });
  function rdReEsc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
  function rdTerms() {
    var mine = rdCards().map(function (c) { return { id: c.id, name: c.name, cat: c.cat, def: c.def, aka: c.aka || [], see: [], src: "your card", rx: [] }; });
    return READER_LEX.terms.concat(mine);
  }
  function rdConvert(md, terms) {
    var forms = [];
    terms.forEach(function (t) { [t.name].concat(t.aka || []).forEach(function (f) { if (f) forms.push([f, t.id]); }); });
    forms.sort(function (a, b) { return b[0].length - a[0].length; });
    var lookup = {}; forms.forEach(function (f) { if (!(f[0] in lookup)) lookup[f[0]] = f[1]; });
    var word = new RegExp("(?<![\\w\\-’'])(" + forms.map(function (f) { return rdReEsc(f[0]); }).join("|") + ")(?![\\w\\-])", "g");
    var rxs = []; terms.forEach(function (t) { (t.rx || []).forEach(function (r) { try { rxs.push([new RegExp(r, "g"), t.id]); } catch (e) {} }); });
    var used = {}, unknown = {}, cur = [];
    function span(tid, shown) { used[tid] = (used[tid] || 0) + 1; if (cur.indexOf(tid) < 0) cur.push(tid); return '<span class="lx" data-t="' + tid + '">' + rdEsc(shown) + "</span>"; }
    function link(text, forced) {
      if (forced) {
        if (text.charAt(0) === "!") return rdEsc(text.slice(1));
        var bar = text.indexOf("|"), name = (bar < 0 ? text : text.slice(0, bar)).trim(), shown = bar < 0 ? "" : text.slice(bar + 1);
        var tid = lookup[name] || lookup[name.charAt(0).toUpperCase() + name.slice(1).toLowerCase()];
        return tid ? span(tid, shown || name) : rdEsc(shown || name);
      }
      var hits = [], m;
      word.lastIndex = 0; while ((m = word.exec(text))) hits.push([m.index, m.index + m[0].length, lookup[m[1]]]);
      rxs.forEach(function (r) { r[0].lastIndex = 0; var mm; while ((mm = r[0].exec(text))) { var a = mm.index, b = a + mm[0].length; if (!hits.some(function (h) { return h[0] < b && a < h[1]; })) hits.push([a, b, r[1]]); if (!mm[0].length) r[0].lastIndex++; } });
      hits.sort(function (x, y) { return x[0] - y[0] || x[1] - y[1]; });
      var res = "", pos = 0;
      hits.forEach(function (h) { if (h[0] < pos) return; res += rdEsc(text.slice(pos, h[0])) + span(h[2], text.slice(h[0], h[1])); pos = h[1]; });
      res += rdEsc(text.slice(pos));
      var nw = /(?<=[a-z,;:—] )([A-Z][a-z’'\-]+(?: [A-Z][a-z’'\-]+)*)/g, u;
      while ((u = nw.exec(text))) {
        var w = u[1], st = u.index;
        if (RD_IGNORE[w.split(" ")[0]] || (w in lookup)) continue;
        if (hits.some(function (h) { return h[0] <= st && st < h[1]; })) continue;
        unknown[w] = (unknown[w] || 0) + 1;
      }
      return res;
    }
    var INL = /(\*\*.+?\*\*|\*[^*\s][^*]*\*|`[^`]+`|\[\[[^\]]+\]\])/;
    function inline(text, lk) {
      return text.split(INL).map(function (part) {
        if (!part) return "";
        if (part.slice(0, 2) === "**" && part.slice(-2) === "**" && part.length > 4) return "<b>" + inline(part.slice(2, -2), lk) + "</b>";
        if (part.slice(0, 2) === "[[" && part.slice(-2) === "]]") return lk(part.slice(2, -2), true);
        if (part.charAt(0) === "`") return "<code>" + rdEsc(part.slice(1, -1)) + "</code>";
        if (part.charAt(0) === "*" && part.slice(-1) === "*" && part.length > 2) return "<i>" + inline(part.slice(1, -1), lk) + "</i>";
        return lk(part, false);
      }).join("");
    }
    var plainLink = function (s) { return rdEsc(s); };
    var blocks = [], lines = md.replace(/\r\n/g, "\n").replace(/^﻿/, "").split("\n"), i = 0, para = [];
    function flush() { if (para.length) { cur = []; var h = inline(para.join(" "), link); blocks.push({ k: "p", html: h, terms: cur.slice() }); para = []; } }
    while (i < lines.length) {
      var L = lines[i], m;
      if (L.slice(0, 3) === "```") { flush(); var j = i + 1, buf = []; while (j < lines.length && lines[j].slice(0, 3) !== "```") buf.push(lines[j++]); blocks.push({ k: "pre", html: rdEsc(buf.join("\n")), terms: [] }); i = j + 1; continue; }
      if ((m = /^(#{1,3}) (.*)/.exec(L))) { flush(); cur = []; blocks.push({ k: "h" + m[1].length, html: inline(m[2], plainLink), terms: [] }); i++; continue; }
      if (L.slice(0, 2) === "> ") {
        flush(); cur = []; var hq = inline(L.slice(2), link), last = blocks[blocks.length - 1];
        if (last && last.k === "q") { last.html += "<br>" + hq; cur.forEach(function (t) { if (last.terms.indexOf(t) < 0) last.terms.push(t); }); }
        else blocks.push({ k: "q", html: hq, terms: cur.slice() });
        i++; continue;
      }
      if (L.trim() === "---") { flush(); blocks.push({ k: "hr", html: "", terms: [] }); i++; continue; }
      if ((m = /^\s*(?:[-*+]|(\d+)\.) (.*)/.exec(L))) {
        flush(); cur = []; var li = { k: "li", html: inline(m[2], link), terms: [] }; li.terms = cur.slice();
        if (m[1]) li.n = +m[1]; if (L.charAt(0) === " ") li.sub = 1; blocks.push(li); i++; continue;
      }
      if (L.charAt(0) === "|" && i + 1 < lines.length && /^\|\s*:?-/.test(lines[i + 1])) {
        flush(); var rows = [], k = i;
        while (k < lines.length && lines[k].charAt(0) === "|") { if (k !== i + 1) rows.push(lines[k].trim().replace(/^\||\|$/g, "").split("|").map(function (c) { return c.trim(); })); k++; }
        cur = [];
        var ht = "<table>" + rows.map(function (row, r) { return "<tr>" + row.map(function (c) { return (r ? "<td>" : "<th>") + inline(c, link) + (r ? "</td>" : "</th>"); }).join("") + "</tr>"; }).join("") + "</table>";
        blocks.push({ k: "table", html: ht, terms: cur.slice() }); i = k; continue;
      }
      if (!L.trim()) { flush(); i++; continue; }
      para.push(L.trim()); i++;
    }
    flush();
    return { blocks: blocks, used: used, unknown: unknown };
  }
  function rdBuildPage(md, id, fallbackTitle) {
    var terms = rdTerms(), r = rdConvert(md, terms), byId = {};
    terms.forEach(function (t) { byId[t.id] = t; });
    var tm = {}, card = function (t) { return { name: t.name, cat: t.cat, def: t.def, see: (t.see || []).filter(function (s) { return byId[s]; }), src: t.src }; };
    Object.keys(r.used).forEach(function (k) { tm[k] = card(byId[k]); });
    Object.keys(tm).forEach(function (k) { tm[k].see.forEach(function (s) { if (!tm[s]) tm[s] = card(byId[s]); }); });
    var h1 = r.blocks.filter(function (b) { return b.k === "h1"; })[0];
    var title = h1 ? h1.html.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&") : fallbackTitle;
    var doc = { id: id, title: title, level: READER_LEVEL, cats: READER_LEX.cats, terms: tm, blocks: r.blocks };
    if (!READER_TPL) READER_TPL = rdB64(READER_DOCS[0].id);
    var json = JSON.stringify(doc).replace(/<\//g, "<\\/");
    var page = READER_TPL.replace(/(<script id="docdata" type="application\/json">)[\s\S]*?(<\/script>)/, function (_, a, b) { return a + json + b; })
                         .replace(/<title>[^<]*<\/title>/, "<title>" + rdEsc(title) + " · Osmotic Expanse Reader</title>");
    return { page: page, title: title, unknown: r.unknown, linked: Object.keys(r.used).length };
  }
  /* ---- reading a Word file: unzip with the browser's own inflater, then walk the XML ---- */
  async function rdUnzip(buf, want) {
    var dv = new DataView(buf), out = {}, e = buf.byteLength - 22;
    while (e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--;
    if (e < 0) throw new Error("not a .docx file");
    var n = dv.getUint16(e + 10, true), p = dv.getUint32(e + 16, true), td = new TextDecoder("utf-8");
    for (var k = 0; k < n; k++) {
      var meth = dv.getUint16(p + 10, true), size = dv.getUint32(p + 20, true), nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), off = dv.getUint32(p + 42, true);
      var name = td.decode(new Uint8Array(buf, p + 46, nl));
      if (want.indexOf(name) >= 0) {
        var start = off + 30 + dv.getUint16(off + 26, true) + dv.getUint16(off + 28, true), data = buf.slice(start, start + size);
        out[name] = meth === 0 ? td.decode(data) : td.decode(await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).arrayBuffer());
      }
      p += 46 + nl + xl + cl;
    }
    return out;
  }
  async function rdDocxToMd(buf) {
    var f = await rdUnzip(buf, ["word/document.xml", "word/styles.xml"]);
    if (!f["word/document.xml"]) throw new Error("no document inside this file");
    var P = new DOMParser(), doc = P.parseFromString(f["word/document.xml"], "application/xml"), names = {};
    if (f["word/styles.xml"]) [].forEach.call(P.parseFromString(f["word/styles.xml"], "application/xml").getElementsByTagNameNS("*", "style"), function (s) {
      var id = s.getAttributeNS(s.namespaceURI, "styleId") || s.getAttribute("w:styleId"), nm = [].filter.call(s.children, function (c) { return c.localName === "name"; })[0];
      if (id && nm) names[id] = (nm.getAttributeNS(nm.namespaceURI, "val") || nm.getAttribute("w:val") || "").toLowerCase();
    });
    var val = function (el) { return el.getAttributeNS(el.namespaceURI, "val") || el.getAttribute("w:val"); };
    var kid = function (el, ln) { return [].filter.call(el.children, function (c) { return c.localName === ln; })[0]; };
    var on = function (rpr, ln) { var x = rpr && kid(rpr, ln); if (!x) return false; var v = val(x); return v !== "0" && v !== "false"; };
    function runs(el, acc) {
      [].forEach.call(el.children, function (c) {
        if (c.localName === "r") {
          var rpr = kid(c, "rPr"), t = "";
          [].forEach.call(c.children, function (x) { if (x.localName === "t") t += x.textContent; else if (x.localName === "tab" || x.localName === "br" || x.localName === "cr") t += " "; });
          if (t) acc.push([on(rpr, "b") ? "b" : on(rpr, "i") ? "i" : "", t.replace(/\*/g, "∗")]);
        } else if (/^(hyperlink|ins|smartTag|fldSimple|sdt|sdtContent)$/.test(c.localName)) runs(c, acc);
      });
      return acc;
    }
    function text(p) {
      var segs = runs(p, []), merged = [];
      segs.forEach(function (s) { var l = merged[merged.length - 1]; if (l && l[0] === s[0]) l[1] += s[1]; else merged.push(s.slice()); });
      return merged.map(function (s) {
        if (!s[0] || !s[1].trim()) return s[1];
        var lead = s[1].match(/^\s*/)[0], tail = s[1].match(/\s*$/)[0], core = s[1].trim(), mk = s[0] === "b" ? "**" : "*";
        return lead + mk + core + mk + tail;
      }).join("");
    }
    var out = [], body = doc.getElementsByTagNameNS("*", "body")[0];
    [].forEach.call(body.children, function (el) {
      if (el.localName === "p") {
        var ppr = kid(el, "pPr"), st = ppr && kid(ppr, "pStyle"), nm = st ? (names[val(st)] || val(st) || "").toLowerCase() : "", t = text(el).trim();
        if (!t) { out.push(""); return; }
        var lvl = /^title$/.test(nm) ? 1 : (nm.match(/heading\s*(\d)/) || [])[1];
        if (lvl) out.push("#".repeat(Math.min(3, +lvl)) + " " + t.replace(/\*+/g, ""));
        else if (/quote/.test(nm)) out.push("> " + t);
        else if ((ppr && kid(ppr, "numPr")) || /list/.test(nm)) out.push("- " + t);
        else out.push(t);
        out.push("");
      } else if (el.localName === "tbl") {
        var rows = [].filter.call(el.children, function (c) { return c.localName === "tr"; }).map(function (tr) {
          return [].filter.call(tr.children, function (c) { return c.localName === "tc"; }).map(function (tc) {
            return [].filter.call(tc.children, function (c) { return c.localName === "p"; }).map(text).join(" ").replace(/\|/g, "/").trim();
          });
        });
        if (rows.length) {
          out.push("| " + rows[0].join(" | ") + " |", "|" + rows[0].map(function () { return " --- "; }).join("|") + "|");
          rows.slice(1).forEach(function (r) { out.push("| " + r.join(" | ") + " |"); });
          out.push("");
        }
      }
    });
    return out.join("\n");
  }
  /* ---- the tab ---- */
  function readerUrl(id) {
    if (READER_URLS[id]) return READER_URLS[id];
    var html;
    if (rdIsMine(id)) { var d = rdMine().filter(function (x) { return x.id === id; })[0], b = rdBuildPage(d.md, d.id, d.title); html = b.page; READER_PANEL_DATA[id] = b; }
    else html = rdB64(id);
    return (READER_URLS[id] = URL.createObjectURL(new Blob([html], { type: "text/html" })));
  }
  var READER_PANEL_DATA = {};
  function rdRefresh() { var host = document.getElementById("readerHost"); if (host) host.outerHTML = readerHostHTML(); }
  window.oxReaderOpen = function (id) {
    READER_CUR = id; READER_PANEL = ""; try { localStorage.setItem("oxreader.doc", id); } catch (e) {}
    rdRefresh();
  };
  window.oxReaderPick = function () { var i = document.getElementById("readerFile"); if (i) { i.value = ""; i.click(); } };
  window.oxReaderFile = async function (input) {
    var file = input.files && input.files[0]; if (!file) return;
    var note = document.getElementById("readerNote"); if (note) note.textContent = "Converting " + file.name + "…";
    try {
      var md, ext = (file.name.split(".").pop() || "").toLowerCase();
      if (ext === "docx") md = await rdDocxToMd(await file.arrayBuffer());
      else if (ext === "md" || ext === "markdown" || ext === "txt") md = await file.text();
      else throw new Error("the Reader can open .docx, .md and .txt files");
      var base = file.name.replace(/\.[^.]+$/, ""), id = "my-" + base.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) + "-" + Date.now().toString(36);
      var built = rdBuildPage(md, id, base), mine = rdMine();
      mine.push({ id: id, title: built.title, md: md, added: new Date().toISOString().slice(0, 10) });
      if (!rdSave("oxreader.mydocs", mine)) return;
      READER_PANEL_DATA[id] = built; READER_CUR = id; READER_PANEL = Object.keys(built.unknown).length ? "words" : "";
      try { localStorage.setItem("oxreader.doc", id); } catch (e) {}
      rdRefresh();
    } catch (e) { if (note) note.textContent = "Could not convert " + file.name + ": " + (e && e.message || e); }
  };
  window.oxReaderRemove = function () {
    if (!rdIsMine(READER_CUR) || !confirm("Remove this document from this browser?")) return;
    rdSave("oxreader.mydocs", rdMine().filter(function (d) { return d.id !== READER_CUR; }));
    delete READER_URLS[READER_CUR]; READER_CUR = READER_DOCS[0].id; READER_PANEL = ""; rdRefresh();
  };
  window.oxReaderPanel = function (which) { READER_PANEL = READER_PANEL === which ? "" : which; rdRefresh(); };
  window.oxReaderCard = function (i) {
    var row = document.getElementById("rdw" + i); if (!row) return;
    var name = row.getAttribute("data-w"), cat = row.querySelector("select").value, def = row.querySelector("textarea").value.trim();
    if (!def) { row.querySelector("textarea").focus(); return; }
    var cards = rdCards().filter(function (c) { return c.name !== name; });
    cards.push({ id: "my-" + name.toLowerCase().replace(/[^a-z0-9]+/g, "-"), name: name, cat: cat, def: def, aka: [] });
    rdSave("oxreader.mycards", cards);
    Object.keys(READER_URLS).forEach(function (k) { if (rdIsMine(k)) delete READER_URLS[k]; });   // rebuild your documents with the new card
    rdRefresh();
  };
  window.oxReaderDropCard = function (name) {
    rdSave("oxreader.mycards", rdCards().filter(function (c) { return c.name !== name; }));
    Object.keys(READER_URLS).forEach(function (k) { if (rdIsMine(k)) delete READER_URLS[k]; });
    rdRefresh();
  };
  function readerPanelHTML() {
    var mine = rdIsMine(READER_CUR);
    if (READER_PANEL === "words" && mine) {
      var data = READER_PANEL_DATA[READER_CUR] || {}, words = Object.keys(data.unknown || {}).sort(function (a, b) { return data.unknown[b] - data.unknown[a]; });
      var cats = Object.keys(READER_LEX.cats).map(function (c) { return '<option value="' + c + '">' + rdEsc(READER_LEX.cats[c].label) + "</option>"; }).join("");
      return '<div class="subgroup" style="margin:8px 0"><p style="margin:0 0 6px"><b>Words without cards in “' + rdEsc(data.title || "") + '”</b> — ' + (data.linked || 0) + ' terms were linked. These capitalised words are not in the Lexicon. Write a card for any that a reader would need; it is used in all your documents, in this browser. To add a document for everyone, send the file to Claude.</p>' +
        (words.length ? words.map(function (w, i) {
          return '<div id="rdw' + i + '" data-w="' + rdEsc(w) + '" style="display:grid;grid-template-columns:180px 170px 1fr auto;gap:6px;align-items:start;margin:4px 0"><b style="padding-top:4px">' + rdEsc(w) + ' <small style="opacity:.6">×' + data.unknown[w] + '</small></b><select>' + cats + '</select><textarea rows="1" placeholder="One plain sentence: what is it?" style="min-height:28px"></textarea><button onclick="oxReaderCard(' + i + ')">Add card</button></div>';
        }).join("") : "<p>None — every capitalised word has a card.</p>") + "</div>";
    }
    if (READER_PANEL === "cards") {
      var cs = rdCards();
      return '<div class="subgroup" style="margin:8px 0"><p style="margin:0 0 6px"><b>Your cards</b> (kept in this browser, used in your own documents)</p>' +
        (cs.length ? cs.map(function (c) { return '<div style="margin:3px 0"><b>' + rdEsc(c.name) + '</b> <small>(' + rdEsc((READER_LEX.cats[c.cat] || {}).label || c.cat) + ')</small> — ' + rdEsc(c.def) + ' <button onclick="oxReaderDropCard(\'' + rdEsc(c.name).replace(/'/g, "\\'") + '\')">Remove</button></div>'; }).join("") : "<p>None yet. Add a document, then write cards for its new words.</p>") + "</div>";
    }
    return "";
  }
  function readerHostHTML() {
    var mine = rdMine();
    if (!READER_DOCS.some(function (d) { return d.id === READER_CUR; }) && !mine.some(function (d) { return d.id === READER_CUR; })) READER_CUR = READER_DOCS[0].id;
    var url; try { url = readerUrl(READER_CUR); } catch (e) { return '<div id="readerHost" class="boot-err">The Reader could not be opened: ' + rdEsc(String(e)) + "</div>"; }
    var opt = function (d) { return '<option value="' + d.id + '"' + (d.id === READER_CUR ? " selected" : "") + ">" + rdEsc(d.title) + "</option>"; };
    var pick = '<select onchange="oxReaderOpen(this.value)" style="max-width:360px">' + '<optgroup label="The books">' + READER_DOCS.map(opt).join("") + "</optgroup>" +
      (mine.length ? '<optgroup label="My documents (this browser)">' + mine.map(opt).join("") + "</optgroup>" : "") + "</select>";
    var isMine = rdIsMine(READER_CUR), nw = isMine && READER_PANEL_DATA[READER_CUR] ? Object.keys(READER_PANEL_DATA[READER_CUR].unknown).length : 0;
    var tools = '<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin:6px 0">' + pick +
      '<button onclick="oxReaderPick()" title="Convert a Word (.docx) or Markdown file into a Reader page">+ Add a document</button>' +
      '<input type="file" id="readerFile" accept=".docx,.md,.markdown,.txt" style="display:none" onchange="oxReaderFile(this)">' +
      (isMine ? '<button onclick="oxReaderPanel(\'words\')">Words without cards (' + nw + ")</button>" + '<button onclick="oxReaderRemove()">Remove</button>' : "") +
      '<button onclick="oxReaderPanel(\'cards\')">My cards (' + rdCards().length + ")</button>" +
      '<span id="readerNote" style="opacity:.75;font-size:12px">' + (isMine ? "Kept in this browser only. ⬇ Web page in the Reader saves a copy you can post or share." : "") + "</span></div>";
    return '<div id="readerHost">' + tools + readerPanelHTML() +
      '<iframe id="readerFrame" title="Reader" src="' + url + '" style="' + READER_NORMAL + '" allow="fullscreen"></iframe></div>';
  }
  function screenReader() {
    if (!READER_DOCS.length) return '<div class="boot-err">No documents have been converted for the Reader yet.</div>';
    return '<div class="featcheck"><h2>Reader</h2><span class="badge">term cards · listen · speed-read</span>' +
      '<span class="cite">tap or hover any coloured word for its card · ⛶ in the Reader goes full window · ⬇ saves a web page you can post</span></div>' + readerHostHTML();
  }
  /* OSMOTIC READER: end */
