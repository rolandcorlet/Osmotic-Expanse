/* Osmotic Expanse Reader — one script, used by every converted document. */
(function () {
  "use strict";
  var SRC = "<!DOCTYPE html>\n" + document.documentElement.outerHTML;   // the pristine page, for "Web page" download
  var DOC = JSON.parse(document.getElementById("docdata").textContent);
  var $ = function (id) { return document.getElementById(id); };
  var CATS = DOC.cats, TERMS = DOC.terms;
  var FINE = window.matchMedia && matchMedia("(hover:hover) and (pointer:fine)").matches;

  /* ---------- settings (kept in this browser) ---------- */
  var KEY = "oxreader.v1", KKEY = "oxreader.known";
  var DEF = { fs: 19, lh: 1.7, mw: "46rem", font: "Literata", theme: "night", uline: "first", hi: false, off: {}, chips: false,
              fade: true, focus: "off", rate: 1, voice: "", explain: false, wpm: 300 };
  var S = Object.assign({}, DEF), KNOWN = {};
  try { Object.assign(S, JSON.parse(localStorage.getItem(KEY) || "{}")); KNOWN = JSON.parse(localStorage.getItem(KKEY) || "{}"); } catch (e) {}
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); localStorage.setItem(KKEY, JSON.stringify(KNOWN)); } catch (e) {} }
  var FONTS = { "Literata": "'Literata',Georgia,serif", "Atkinson Hyperlegible": "'Atkinson Hyperlegible',system-ui,sans-serif",
                "OpenDyslexic": "'OpenDyslexic',sans-serif", "System sans": "system-ui,-apple-system,'Segoe UI',Roboto,sans-serif", "Georgia": "Georgia,'Times New Roman',serif" };
  function apply() {
    var r = document.documentElement.style;
    r.setProperty("--fs", S.fs + "px"); r.setProperty("--lh", S.lh); r.setProperty("--mw", S.mw); r.setProperty("--font", FONTS[S.font] || FONTS.Literata);
    document.body.dataset.theme = S.theme;
    var b = document.body.classList;
    b.toggle("hi", !!S.hi); b.toggle("uline", S.uline === "first"); b.toggle("uline-all", S.uline === "all");
    b.toggle("chips-on", !!S.chips); b.toggle("known-fade", !!S.fade); b.toggle("focus-para", S.focus === "para");
    $("ruler").hidden = S.focus !== "line";
    $("bHi").setAttribute("aria-pressed", S.hi ? "true" : "false");
    $("legend").hidden = !S.hi;
    document.querySelectorAll(".lx").forEach(function (el) { el.classList.toggle("on", !S.off[TERMS[el.dataset.t].cat]); el.classList.toggle("known", !!KNOWN[el.dataset.t]); });
    document.querySelectorAll(".chip").forEach(function (el) { el.hidden = !!S.off[TERMS[el.dataset.t].cat]; });
    if (S.focus === "para" && BLOCKS.length && !speaking) setCur(blockAtView());
    save();
  }

  /* ---------- render ---------- */
  var docEl = $("doc"), BLOCKS = [], CHAPS = [], chap = -1;
  DOC.blocks.forEach(function (b, i) {
    var w = document.createElement("div"); w.className = "blk"; w.dataset.i = i;
    var tag = { p: "p", li: "p", q: "blockquote", h1: "h1", h2: "h2", h3: "h3", hr: "hr", table: "div", pre: "pre" }[b.k] || "p";
    var el = document.createElement(tag); el.className = "txt";
    if (b.k !== "hr") el.innerHTML = b.html;
    if (b.k === "li") { el.innerHTML = (b.n ? b.n + ". " : "• ") + b.html; el.className += " li" + (b.sub ? " sub" : ""); }
    w.appendChild(el);
    if (b.k === "h2") { chap = CHAPS.length; CHAPS.push({ i: i, title: el.textContent, el: w, terms: [] }); }
    if (chap < 0 && b.k !== "h1") { chap = 0; CHAPS.push({ i: i, title: "Opening", el: w, terms: [] }); }
    w.dataset.ch = Math.max(chap, 0);
    if (b.terms && b.terms.length && /^(p|li|q)$/.test(b.k)) {
      var c = document.createElement("div"); c.className = "chips"; c.setAttribute("aria-label", "Terms in this paragraph");
      b.terms.forEach(function (t) { var x = document.createElement("button"); x.className = "chip"; x.dataset.t = t; x.textContent = TERMS[t].name; x.style.setProperty("--c", CATS[TERMS[t].cat].color); c.appendChild(x); });
      w.appendChild(c);
    }
    docEl.appendChild(w); BLOCKS.push(w);
  });
  if (!CHAPS.length) CHAPS.push({ i: 0, title: DOC.title, el: BLOCKS[0], terms: [] });
  // mark terms: colour, first use per chapter, focusable first uses
  var seen = {};
  document.querySelectorAll(".lx").forEach(function (el) {
    var t = TERMS[el.dataset.t]; if (!t) { el.outerHTML = el.textContent; return; }
    el.style.setProperty("--c", CATS[t.cat].color);
    var ch = +el.closest(".blk").dataset.ch, key = ch + ":" + el.dataset.t;
    if (!seen[key]) { seen[key] = 1; el.classList.add("first"); el.tabIndex = 0; CHAPS[ch] && CHAPS[ch].terms.push(el.dataset.t); }
    el.setAttribute("role", "button"); el.setAttribute("aria-label", el.textContent + " — " + t.name + ", term card");
  });
  $("ttl").innerHTML = esc(DOC.title) + '<small id="chapName"></small>';
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  /* legend */
  var present = {}; Object.keys(TERMS).forEach(function (k) { present[TERMS[k].cat] = 1; });
  function legend() {
    $("legend").innerHTML = Object.keys(CATS).filter(function (c) { return present[c]; }).map(function (c) {
      return '<button class="lg" data-cat="' + c + '" aria-pressed="' + (!S.off[c]) + '"><i style="background:' + CATS[c].color + '"></i>' + esc(CATS[c].label) + "</button>";
    }).join("") + '<span class="sp"></span><button class="lg" id="lgFade" aria-pressed="' + !!S.fade + '">Fade terms I\'ve opened</button>';
  }
  legend();
  $("legend").addEventListener("click", function (e) {
    var b = e.target.closest(".lg"); if (!b) return;
    if (b.id === "lgFade") S.fade = !S.fade; else { var c = b.dataset.cat; if (S.off[c]) delete S.off[c]; else S.off[c] = 1; }
    legend(); apply();
  });

  /* ---------- term cards ---------- */
  var card = $("card"), pinned = false, hideT = 0, showT = 0, cardFor = null;
  function cardHTML(id) {
    var t = TERMS[id]; if (!t) return "";
    var see = (t.see || []).filter(function (s) { return TERMS[s]; });
    return '<button class="x" aria-label="Close">×</button><div class="cat">' + esc(CATS[t.cat].label) + "</div><h4>" + esc(t.name) + "</h4><p>" + esc(t.def) + "</p>" +
      (see.length ? '<div class="see">' + see.map(function (s) { return '<button class="chip" data-t="' + s + '" style="--c:' + CATS[TERMS[s].cat].color + '">' + esc(TERMS[s].name) + "</button>"; }).join("") + "</div>" : "") +
      (t.src ? '<div class="src">Source: ' + esc(t.src) + "</div>" : "") +
      '<div class="acts"><button data-act="find">Show in this chapter</button><button data-act="speak">🔊 Say it</button>' +
      (KNOWN[id] ? '<button data-act="new">Mark as new again</button>' : "") + "</div>";
  }
  function showCard(id, anchor, pin) {
    clearTimeout(hideT); if (!TERMS[id]) return;
    cardFor = id; card.innerHTML = cardHTML(id); card.style.setProperty("--c", CATS[TERMS[id].cat].color); card.hidden = false; pinned = !!pin;
    var r = anchor.getBoundingClientRect(), cw = card.offsetWidth, chh = card.offsetHeight, vw = innerWidth, vh = innerHeight;
    var x = Math.min(Math.max(8, r.left + r.width / 2 - cw / 2), vw - cw - 8), y = r.bottom + 8;
    if (y + chh > vh - 8) y = Math.max(8, r.top - chh - 8);
    card.style.left = x + "px"; card.style.top = y + "px";
    if (!KNOWN[id]) { KNOWN[id] = 1; save(); setTimeout(apply, 50); }
    if (pin) setTimeout(function () { var x = card.querySelector(".x"); x && x.focus({ preventScroll: true }); }, 0);
  }
  function hideCard(now) { clearTimeout(hideT); if (now) { card.hidden = true; pinned = false; cardFor = null; return; } hideT = setTimeout(function () { if (!pinned) card.hidden = true; }, 260); }
  docEl.addEventListener("mouseover", function (e) {
    var el = e.target.closest(".lx"); if (!el || !FINE || pinned) return;
    clearTimeout(showT); showT = setTimeout(function () { showCard(el.dataset.t, el, false); }, 140);
  });
  docEl.addEventListener("mouseout", function (e) { if (e.target.closest(".lx")) { clearTimeout(showT); if (!pinned) hideCard(); } });
  card.addEventListener("mouseenter", function () { clearTimeout(hideT); });
  card.addEventListener("mouseleave", function () { if (!pinned) hideCard(); });
  document.addEventListener("click", function (e) {
    var el = e.target.closest(".lx, .chip");
    if (el && el.dataset.t) { e.preventDefault(); var anchor = el.closest(".card") ? card : el; showCard(el.dataset.t, anchor === card ? el : el, true); if (anchor === card) { /* keep card where it is */ } return; }
    if (e.target.closest(".card .x")) { hideCard(true); return; }
    var a = e.target.closest(".card [data-act]");
    if (a) {
      var id = cardFor;
      if (a.dataset.act === "find") flashTerm(id, true);
      if (a.dataset.act === "speak") speakOnce(TERMS[id].name + ". " + TERMS[id].def);
      if (a.dataset.act === "new") { delete KNOWN[id]; save(); apply(); showCard(id, card, true); }
      return;
    }
    if (!e.target.closest(".card") && !card.hidden && pinned) hideCard(true);
    var blk = e.target.closest(".blk"); if (blk) setCur(blk);
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && $("rsvp").hidden) { hideCard(true); closePanels(); if (e.target.blur) e.target.blur(); return; }
    if (e.target.matches("input,select,textarea")) return;
    var el = e.target.closest && e.target.closest(".lx");
    if (el && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); showCard(el.dataset.t, el, true); return; }
    if (!$("rsvp").hidden) return;
    var k = e.key.toLowerCase();
    if (e.key === "Escape") { hideCard(true); closePanels(); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (k === "h") $("bHi").click(); else if (k === "i") $("bIdx").click(); else if (k === "c") $("bToc").click();
    else if (k === "a") $("bAa").click(); else if (k === "r") $("bTts").click(); else if (k === "s") $("bRsvp").click();
  });
  function flashTerm(id, scroll) {
    var ch = curChap(), els = [].filter.call(document.querySelectorAll('.lx[data-t="' + id + '"]'), function (x) { return +x.closest(".blk").dataset.ch === ch; });
    if (!els.length) els = [].slice.call(document.querySelectorAll('.lx[data-t="' + id + '"]'), 0, 1);
    els.forEach(function (x) { x.classList.remove("flash"); void x.offsetWidth; x.classList.add("flash"); });
    if (scroll && els[0]) els[0].scrollIntoView({ block: "center", behavior: "smooth" });
  }

  /* ---------- toolbar, panels ---------- */
  function toggle(btn, panel) { var open = panel.hidden; closePanels(); panel.hidden = !open; btn.setAttribute("aria-pressed", open ? "true" : "false"); if (open) render[panel.id] && render[panel.id](); }
  function closePanels() { ["toc", "idx", "aa"].forEach(function (p) { $(p).hidden = true; }); ["bToc", "bIdx", "bAa"].forEach(function (b) { $(b).setAttribute("aria-pressed", "false"); }); }
  $("bHi").onclick = function () { S.hi = !S.hi; apply(); };
  $("bToc").onclick = function () { toggle($("bToc"), $("toc")); };
  $("bIdx").onclick = function () { toggle($("bIdx"), $("idx")); };
  $("bAa").onclick = function () { toggle($("bAa"), $("aa")); };
  var render = {
    toc: function () {
      var c = curChap();
      $("tocList").innerHTML = CHAPS.map(function (h, k) { return '<a href="#" data-k="' + k + '" class="' + (k === c ? "cur" : "") + '">' + esc(h.title) + "</a>"; }).join("");
    },
    idx: function () {
      var c = curChap(), ts = (CHAPS[c] || CHAPS[0]).terms;
      $("idxTitle").textContent = "In “" + (CHAPS[c] || CHAPS[0]).title + "”";
      var html = "";
      Object.keys(CATS).forEach(function (cat) {
        var list = ts.filter(function (t) { return TERMS[t].cat === cat; }); if (!list.length) return;
        list.sort(function (a, b) { return TERMS[a].name.localeCompare(TERMS[b].name); });
        html += '<div class="grp"><i style="background:' + CATS[cat].color + '"></i>' + esc(CATS[cat].label) + "</div>" +
          list.map(function (t) { return '<button class="row" data-t="' + t + '">' + esc(TERMS[t].name) + (KNOWN[t] ? "" : "<small>new</small>") + "</button>"; }).join("");
      });
      $("idxList").innerHTML = html || '<p class="note">No terms in this chapter.</p>';
    },
    aa: function () { $("aa").innerHTML = aaHTML(); }
  };
  $("tocList").addEventListener("click", function (e) { var a = e.target.closest("a"); if (!a) return; e.preventDefault(); CHAPS[+a.dataset.k].el.scrollIntoView({ behavior: "smooth" }); closePanels(); });
  $("idxList").addEventListener("click", function (e) { var b = e.target.closest(".row"); if (!b) return; e.stopPropagation(); flashTerm(b.dataset.t, true); setTimeout(function () { var el = document.querySelector('.lx.flash'); showCard(b.dataset.t, el || b, true); }, 450); });
  function seg(name, opts, cur) { return '<div class="seg" data-set="' + name + '">' + opts.map(function (o) { return '<button data-v="' + o[0] + '" aria-pressed="' + (String(cur) === String(o[0])) + '">' + o[1] + "</button>"; }).join("") + "</div>"; }
  function aaHTML() {
    return '<h3>Display</h3>' +
      '<div class="r"><label for="aFs">Text size</label><input id="aFs" type="range" min="14" max="36" step="1" value="' + S.fs + '"><b id="aFsV">' + S.fs + "</b></div>" +
      '<div class="r"><label for="aFont">Font</label><select id="aFont">' + Object.keys(FONTS).map(function (f) { return "<option" + (f === S.font ? " selected" : "") + ">" + f + "</option>"; }).join("") + "</select></div>" +
      '<div class="r"><label for="aLh">Line spacing</label><input id="aLh" type="range" min="1.3" max="2.4" step="0.1" value="' + S.lh + '"></div>' +
      '<div class="r"><label>Width</label>' + seg("mw", [["36rem", "Narrow"], ["46rem", "Medium"], ["62rem", "Wide"]], S.mw) + "</div>" +
      '<div class="r"><label>Colours</label>' + seg("theme", [["night", "Night"], ["paper", "Paper"], ["sepia", "Sepia"], ["contrast", "High contrast"]], S.theme) + "</div>" +
      '<div class="r"><label>Mark terms</label>' + seg("uline", [["off", "Off"], ["first", "First use"], ["all", "Every use"]], S.uline) + "</div>" +
      '<div class="r"><label>Reading focus</label>' + seg("focus", [["off", "Off"], ["para", "Paragraph"], ["line", "Line ruler"]], S.focus) + "</div>" +
      '<div class="r"><label for="aChips">Term buttons</label><input id="aChips" type="checkbox"' + (S.chips ? " checked" : "") + '> <span class="note">a row of term buttons with each paragraph</span></div>' +
      '<div class="r"><button class="tb" id="aForget">Forget the terms I\'ve opened</button><button class="tb" id="aReset">Reset display</button></div>' +
      '<p class="note">Keys: H terms · I index · C contents · A display · R listen · S speed-read · Esc close.</p>';
  }
  $("aa").addEventListener("input", function (e) {
    if (e.target.id === "aFs") { S.fs = +e.target.value; $("aFsV").textContent = S.fs; }
    if (e.target.id === "aLh") S.lh = +e.target.value;
    if (e.target.id === "aFont") S.font = e.target.value;
    if (e.target.id === "aChips") S.chips = e.target.checked;
    apply();
  });
  $("aa").addEventListener("click", function (e) {
    var b = e.target.closest(".seg button");
    if (b) { S[b.parentNode.dataset.set] = b.dataset.v; apply(); render.aa(); return; }
    if (e.target.id === "aForget") { KNOWN = {}; apply(); }
    if (e.target.id === "aReset") { var keep = { off: S.off, hi: S.hi }; S = Object.assign({}, DEF, keep); apply(); render.aa(); }
  });

  /* ---------- where the reader is ---------- */
  var cur = null;
  function setCur(blk) { if (cur) cur.classList.remove("cur"); cur = blk; cur && cur.classList.add("cur"); }
  function curChap() {
    var y = innerHeight * 0.3, k = 0;
    CHAPS.forEach(function (h, i) { if (h.el.getBoundingClientRect().top < y) k = i; });
    return k;
  }
  function blockAtView() {
    var y = innerHeight * 0.4, best = null;
    for (var i = 0; i < BLOCKS.length; i++) {
      if (!/^(p|li|q)$/.test(DOC.blocks[i].k)) continue;
      var r = BLOCKS[i].getBoundingClientRect();
      if (r.bottom < 80) continue;            // scrolled past
      best = BLOCKS[i]; if (r.bottom >= y) break;
    }
    return best || BLOCKS[0];
  }
  var lastCh = -1;
  addEventListener("scroll", function () {
    var c = curChap(); if (c !== lastCh) { lastCh = c; $("chapName").textContent = "· " + CHAPS[c].title; if (!$("idx").hidden) render.idx(); }
    if (S.focus === "para" && !speaking) setCur(blockAtView());
  }, { passive: true });
  addEventListener("mousemove", function (e) { if (S.focus === "line") $("ruler").style.top = (e.clientY - $("ruler").offsetHeight / 2) + "px"; });
  setTimeout(function () { var c = curChap(); $("chapName").textContent = "· " + CHAPS[c].title; }, 0);

  /* ---------- read aloud ---------- */
  var synth = window.speechSynthesis, speaking = false, paused = false, ttsIdx = 0, voices = [], explained = {};
  var HL = window.CSS && CSS.highlights && window.Highlight;
  function loadVoices() { voices = synth ? synth.getVoices().filter(function (v) { return /^en/i.test(v.lang); }) : []; if (!voices.length && synth) voices = synth.getVoices(); }
  if (synth) { loadVoices(); synth.onvoiceschanged = function () { loadVoices(); if (!$("ttsBar").hidden) ttsBar(); }; }
  function ttsBar() {
    $("ttsBar").innerHTML = '<button id="tPrev" title="Previous paragraph">⏮</button><button id="tPlay">' + (speaking && !paused ? "⏸ Pause" : "▶ Play") + '</button><button id="tNext" title="Next paragraph">⏭</button><button id="tStop">■ Stop</button>' +
      '<label>Speed <input id="tRate" type="range" min="0.6" max="1.8" step="0.1" value="' + S.rate + '"></label>' +
      '<select id="tVoice" aria-label="Voice"><option value="">Default voice</option>' + voices.map(function (v) { return '<option' + (v.name === S.voice ? " selected" : "") + ">" + esc(v.name) + "</option>"; }).join("") + "</select>" +
      '<label><input id="tExplain" type="checkbox"' + (S.explain ? " checked" : "") + "> Explain new terms</label>";
  }
  $("bTts").onclick = function () {
    if (!synth) { alert("This browser cannot read aloud."); return; }
    var open = $("ttsBar").hidden; $("ttsBar").hidden = !open; $("bTts").setAttribute("aria-pressed", open ? "true" : "false");
    if (open) ttsBar(); else ttsStop();
  };
  $("ttsBar").addEventListener("click", function (e) {
    var id = e.target.id;
    if (id === "tPlay") { if (!speaking) ttsStart(cur || blockAtView()); else if (paused) { synth.resume(); paused = false; } else { synth.pause(); paused = true; } ttsBar(); }
    if (id === "tStop") ttsStop();
    if (id === "tNext" || id === "tPrev") { var i = ttsIdx + (id === "tNext" ? 1 : -1); ttsStop(); ttsStart(BLOCKS[Math.max(0, Math.min(BLOCKS.length - 1, i))]); }
  });
  $("ttsBar").addEventListener("change", function (e) {
    if (e.target.id === "tRate") S.rate = +e.target.value;
    if (e.target.id === "tVoice") S.voice = e.target.value;
    if (e.target.id === "tExplain") S.explain = e.target.checked;
    save();
  });
  function textMap(el) {   // text nodes of a block's text (not its chips), with running offsets
    var nodes = [], s = "", w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (var n = w.nextNode(); n; n = w.nextNode()) { nodes.push({ n: n, a: s.length }); s += n.nodeValue; }
    return { s: s, nodes: nodes };
  }
  function rangeAt(map, start, len) {
    var r = document.createRange(), end = start + len, sN, eN;
    map.nodes.forEach(function (o) { var L = o.n.nodeValue.length; if (!sN && start < o.a + L) sN = o; if (!eN && end <= o.a + L) eN = o; });
    if (!sN || !eN) return null;
    r.setStart(sN.n, start - sN.a); r.setEnd(eN.n, end - eN.a); return r;
  }
  function utter(text, onb, onend) {
    var u = new SpeechSynthesisUtterance(text); u.rate = S.rate;
    var v = voices.filter(function (x) { return x.name === S.voice; })[0]; if (v) u.voice = v;
    if (onb) u.onboundary = onb; u.onend = onend; u.onerror = onend; synth.speak(u); return u;
  }
  function clearWord() { if (HL) CSS.highlights.delete("tts-word"); }
  function ttsStart(blk) {
    speaking = true; paused = false; ttsIdx = +blk.dataset.i; ttsBar(); runBlock();
  }
  function runBlock() {
    if (!speaking) return;
    while (ttsIdx < BLOCKS.length && /^(hr|table|pre)$/.test(DOC.blocks[ttsIdx].k)) ttsIdx++;
    if (ttsIdx >= BLOCKS.length) { ttsStop(); return; }
    var blk = BLOCKS[ttsIdx], txt = blk.querySelector(".txt"), map = textMap(txt);
    BLOCKS.forEach(function (b) { b.classList.remove("reading"); }); blk.classList.add("reading"); setCur(blk);
    var r = blk.getBoundingClientRect(); if (r.top < 70 || r.bottom > innerHeight - 90) blk.scrollIntoView({ block: "center", behavior: "smooth" });
    // speak sentence by sentence (long utterances stall in some browsers)
    var sents = [], re = /[^.!?…]+[.!?…]+["”’)]*\s*|[^.!?…]+$/g, m;
    while ((m = re.exec(map.s))) if (m[0].trim()) sents.push({ t: m[0], a: m.index });
    var k = 0;
    (function next() {
      if (!speaking) return;
      if (k >= sents.length) { clearWord(); afterBlock(blk); return; }
      var sn = sents[k++];
      utter(sn.t, function (ev) {
        if (ev.name && ev.name !== "word") return;
        var st = sn.a + ev.charIndex, len = ev.charLength || ((map.s.slice(st).match(/^[\w’'\-]+/) || [""])[0].length) || 1;
        if (HL) { var rg = rangeAt(map, st, len); if (rg) CSS.highlights.set("tts-word", new Highlight(rg)); }
      }, next);
    })();
  }
  function afterBlock(blk) {
    var b = DOC.blocks[ttsIdx], todo = S.explain ? (b.terms || []).filter(function (t) { return !explained[t] && !KNOWN[t]; }) : [];
    (function nx() {
      if (!speaking) return;
      if (!todo.length) { ttsIdx++; runBlock(); return; }
      var t = todo.shift(); explained[t] = 1;
      var el = blk.querySelector('.lx[data-t="' + t + '"]'); if (el) showCard(t, el, false);
      utter(TERMS[t].name + ": " + TERMS[t].def, null, function () { hideCard(true); nx(); });
    })();
  }
  function ttsStop() { speaking = false; paused = false; if (synth) synth.cancel(); clearWord(); BLOCKS.forEach(function (b) { b.classList.remove("reading"); }); if (!$("ttsBar").hidden) ttsBar(); }
  function speakOnce(text) { if (!synth) return; synth.cancel(); speaking = false; utter(text); }

  /* ---------- speed-read (RSVP, after BitSight) ---------- */
  var RS = { words: [], i: 0, timer: 0, on: false };
  function collectWords(fromIdx) {
    var out = [];
    for (var b = fromIdx; b < BLOCKS.length; b++) {
      if (/^(hr|table|pre)$/.test(DOC.blocks[b].k)) continue;
      var txt = BLOCKS[b].querySelector(".txt"), w = document.createTreeWalker(txt, NodeFilter.SHOW_TEXT);
      for (var n = w.nextNode(); n; n = w.nextNode()) {
        var lx = n.parentNode.closest && n.parentNode.closest(".lx"), tid = lx ? lx.dataset.t : null;
        n.nodeValue.split(/\s+/).forEach(function (x) { if (x) out.push({ w: x, t: tid, b: b }); });
      }
      if (out.length) out[out.length - 1].para = true;
    }
    return out;
  }
  function orp(w) { var L = w.replace(/[^\w’']/g, "").length; return L <= 1 ? 0 : L <= 5 ? 1 : L <= 9 ? 2 : L <= 13 ? 3 : 4; }
  function rsvpShow() {
    var it = RS.words[RS.i]; if (!it) return;
    var lead = (it.w.match(/^[^\w’']*/) || [""])[0].length, o = Math.min(it.w.length - 1, lead + orp(it.w));
    var el = $("rsW");
    el.innerHTML = esc(it.w.slice(0, o)) + "<b>" + esc(it.w.charAt(o)) + "</b>" + esc(it.w.slice(o + 1));
    el.className = "w" + (it.t ? " term" : ""); if (it.t) el.style.setProperty("--c", CATS[TERMS[it.t].cat].color);
    var pre = document.createElement("span"); pre.style.cssText = "position:absolute;visibility:hidden;white-space:pre;font:" + getComputedStyle(el).font;
    pre.textContent = it.w.slice(0, o); document.body.appendChild(pre); var pw = pre.offsetWidth; pre.textContent = it.w.charAt(o); var ow = pre.offsetWidth; pre.remove();
    el.style.transform = "translateX(" + (-pw - ow / 2) + "px)";
    // context: the sentence around the word
    var a = RS.i, z = RS.i; while (a > 0 && !/[.!?…]["”’]?$/.test(RS.words[a - 1].w) && RS.i - a < 25) a--; while (z < RS.words.length - 1 && !/[.!?…]["”’]?$/.test(RS.words[z].w) && z - RS.i < 25) z++;
    $("rsCtx").textContent = RS.on ? "" : RS.words.slice(a, z + 1).map(function (x) { return x.w; }).join(" ");
    $("rsInfo").textContent = Math.round(RS.i / RS.words.length * 100) + "% · " + S.wpm + " words a minute";
    if (!RS.on && it.t) showCard(it.t, $("rsStage"), false); else hideCard(true);
  }
  function rsvpTick() {
    if (!RS.on) return;
    var it = RS.words[RS.i]; if (!it) { rsvpPause(); return; }
    rsvpShow();
    var ms = 60000 / S.wpm; if (/[,;:—]$/.test(it.w)) ms *= 1.6; if (/[.!?…]["”’]?$/.test(it.w)) ms *= 2.3; if (it.w.length > 9) ms *= 1.3; if (it.para) ms *= 2.6; if (it.t && !KNOWN[it.t]) ms *= 1.4;
    RS.i++; RS.timer = setTimeout(rsvpTick, ms);
  }
  function rsvpPlay() { RS.on = true; hideCard(true); $("rsPlay").textContent = "⏸ Pause"; rsvpTick(); }
  function rsvpPause() { RS.on = false; clearTimeout(RS.timer); if (RS.i > 0) RS.i--; $("rsPlay").textContent = "▶ Play"; rsvpShow(); }
  function rsvpExit() {
    rsvpPause(); hideCard(true); var it = RS.words[RS.i]; $("rsvp").hidden = true;
    if (it) { setCur(BLOCKS[it.b]); BLOCKS[it.b].scrollIntoView({ block: "center" }); }
  }
  function rsvpJump(dir) {
    var i = RS.i + dir;
    if (dir < 0) { i = Math.max(0, RS.i - 2); while (i > 0 && !/[.!?…]["”’]?$/.test(RS.words[i - 1].w)) i--; }
    else { while (i < RS.words.length - 1 && !/[.!?…]["”’]?$/.test(RS.words[i - 1] ? RS.words[i - 1].w : "")) i++; }
    RS.i = Math.max(0, Math.min(RS.words.length - 1, i)); rsvpShow();
  }
  $("bRsvp").onclick = function () {
    closePanels(); ttsStop();
    var start = cur || blockAtView();
    RS.words = collectWords(+start.dataset.i); RS.i = 0;
    $("rsvp").innerHTML = '<div class="stage" id="rsStage"><span class="w" id="rsW"></span></div><div class="ctx" id="rsCtx"></div>' +
      '<div class="ctl"><button id="rsBack">⏪ Sentence</button><button id="rsPlay">▶ Play</button><button id="rsFwd">Sentence ⏩</button>' +
      '<label class="info">Speed <input id="rsWpm" type="range" min="120" max="800" step="20" value="' + S.wpm + '"></label><button id="rsExit">✕ Back to the page</button></div>' +
      '<div class="info" id="rsInfo"></div><div class="info">Space: play / pause · ← → sentence · Esc: back to the page. Coloured underline = a term; pause on it to see its card.</div>';
    $("rsvp").hidden = false; rsvpShow();
  };
  $("rsvp").addEventListener("click", function (e) {
    var id = e.target.id;
    if (id === "rsPlay") RS.on ? rsvpPause() : rsvpPlay();
    if (id === "rsBack") rsvpJump(-1); if (id === "rsFwd") rsvpJump(1); if (id === "rsExit") rsvpExit();
  });
  $("rsvp").addEventListener("input", function (e) { if (e.target.id === "rsWpm") { S.wpm = +e.target.value; save(); if (!RS.on) rsvpShow(); } });
  document.addEventListener("keydown", function (e) {
    if ($("rsvp").hidden) return;
    if (e.key === " ") { e.preventDefault(); RS.on ? rsvpPause() : rsvpPlay(); }
    else if (e.key === "ArrowLeft") rsvpJump(-1); else if (e.key === "ArrowRight") rsvpJump(1); else if (e.key === "Escape") rsvpExit();
  });

  /* ---------- download the complete web page ---------- */
  $("bDl").onclick = function () {
    var a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([SRC], { type: "text/html" }));
    a.download = (DOC.id || "osmotic-reader") + ".html"; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
  };

  /* ---------- inside the apps: full-window toggle ---------- */
  if (window.parent !== window) {
    var full = false, fb = document.createElement("button");
    fb.className = "tb"; fb.id = "bFull"; fb.title = "Full window (F)"; fb.textContent = "⛶ Full window";
    $("bDl").parentNode.insertBefore(fb, $("bDl"));
    fb.onclick = function () { full = !full; fb.textContent = full ? "⤡ Exit full window" : "⛶ Full window"; fb.setAttribute("aria-pressed", full ? "true" : "false"); try { parent.postMessage({ oxReaderFull: full }, "*"); } catch (e) {} };
    document.addEventListener("keydown", function (e) { if (e.target.matches("input,select,textarea") || !$("rsvp").hidden || e.ctrlKey || e.metaKey) return; if (e.key.toLowerCase() === "f") fb.click(); });
  }

  apply();
  window.OXREADER = { doc: DOC, settings: S, showCard: showCard };   // for tests
})();
