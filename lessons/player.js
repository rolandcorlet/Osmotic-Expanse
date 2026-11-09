/* Lesson player: lesson list, stage, controls, read-aloud, and the "Try it yourself" panels. */
"use strict";
(function () {
  var L = window.LESSONS, IMGS = window.LESSON_IMG || {};
  var FILM = /[?&]film=1/.test(location.search);
  var cur = 0, step = 0, auto = !FILM, speak = false, timer = null, t0 = 0, raf = 0, seen = {};
  var $ = function (id) { return document.getElementById(id); };
  var stage = $("stage"), scaler = $("scaler");

  /* every lesson opens with a title card */
  L.forEach(function (l, i) {
    l.steps.unshift({ dur: 5, title: true, say: "Lesson " + (i + 1) + " of " + L.length + " · " + l.short,
      html: E(0, 150, '<div class="ctr" style="font-size:84px">' + l.icon + "</div>", { w: 1280, an: [A("pop", .7, .2)] }) +
        E(0, 280, '<div class="lbl ctr" style="letter-spacing:6px">THE OSMOTIC EXPANSE · LESSON ' + (i + 1) + "</div>", { w: 1280, an: [A("in", .6, .5)] }) +
        E(0, 320, '<div class="big ctr" style="font-size:76px">' + l.title + "</div>", { w: 1280, an: [A("in", .7, .8)] }) });
  });

  function fit() { var v = $("viewer"); scaler.style.transform = "scale(" + v.clientWidth / 1280 + ")"; }
  window.addEventListener("resize", fit);

  function buildList() {
    $("lessons").innerHTML = L.map(function (l, i) {
      return '<button class="lbtn' + (i === cur ? " on" : "") + '" data-i="' + i + '"><span class="n">' + (i + 1) + "</span><span><b>" + l.title + "</b><small>" + l.short + "</small></span></button>"; }).join("");
    [].forEach.call($("lessons").querySelectorAll(".lbtn"), function (b) { b.onclick = function () { openLesson(+b.dataset.i); }; });
  }
  function dots() {
    var l = L[cur];
    $("dots").innerHTML = l.steps.map(function (s, i) { return '<i class="' + (i === step ? "on" : seen[cur + ":" + i] ? "seen" : "") + '" data-i="' + i + '" title="Step ' + (i + 1) + '"></i>'; }).join("");
    [].forEach.call($("dots").querySelectorAll("i"), function (d) { d.onclick = function () { go(+d.dataset.i); }; });
    $("count").textContent = (step + 1) + " / " + l.steps.length;
  }
  function plain(h) { var d = document.createElement("div"); d.innerHTML = h; return d.textContent; }

  function draw() {
    var l = L[cur], s = l.steps[step];
    var bg = s.title ? '<div class="bgimg" style="background-image:url(' + (IMGS.banner || "") + ');opacity:.45"></div><div class="bgfade"></div>' : "";
    var inner = '<div style="position:absolute;inset:0;animation:' + A("fade", .35, 0) + (FILM ? "," + A("out", .35, s.dur - .35, "forwards") : "") + '">' + bg + s.html +
      '<div class="cap" style="animation:' + A("fade", .5, .15) + '"><div>' + s.say + "</div></div></div>";
    stage.innerHTML = inner;
  }
  function go(i) {
    var l = L[cur]; step = Math.max(0, Math.min(l.steps.length - 1, i)); seen[cur + ":" + step] = 1;
    draw(); dots(); if (!FILM) arm(); say();
  }
  function arm() {
    clearTimeout(timer); cancelAnimationFrame(raf); t0 = performance.now();
    var dur = L[cur].steps[step].dur * 1000;
    (function tick() { var p = Math.min(1, (performance.now() - t0) / dur); $("bar").style.width = (p * 100) + "%"; if (p < 1) raf = requestAnimationFrame(tick); })();
    if (auto) timer = setTimeout(function adv() {
      if (window.speechSynthesis && speechSynthesis.speaking && speak) { timer = setTimeout(adv, 400); return; }
      if (step < L[cur].steps.length - 1) go(step + 1); else { auto = false; $("bAuto").classList.remove("on"); $("bAuto").textContent = "▶ Auto-play"; }
    }, dur);
  }
  function say() {
    if (!window.speechSynthesis) return; speechSynthesis.cancel(); if (!speak) return;
    var u = new SpeechSynthesisUtterance(plain(L[cur].steps[step].say)); u.rate = 1; speechSynthesis.speak(u);
  }
  function openLesson(i) { cur = i; step = 0; buildList(); go(0); buildTry(); }

  /* ---------------- controls ---------------- */
  $("bPrev").onclick = function () { go(step - 1); };
  $("bNext").onclick = function () { if (step < L[cur].steps.length - 1) go(step + 1); else if (cur < L.length - 1) openLesson(cur + 1); };
  $("bReplay").onclick = function () { go(step); };
  $("bAuto").onclick = function () { auto = !auto; this.classList.toggle("on", auto); this.textContent = auto ? "❚❚ Pause" : "▶ Auto-play"; if (auto) arm(); else clearTimeout(timer); };
  $("bSpeak").onclick = function () { speak = !speak; this.classList.toggle("on", speak); this.textContent = speak ? "🔊 Reading aloud" : "🔈 Read aloud"; say(); };
  if (!window.speechSynthesis) $("bSpeak").style.display = "none";
  /* Full screen: the Fullscreen API where allowed, otherwise fill the window. Esc or the button returns. */
  var wrap = $("stagewrap");
  function isFull() { return wrap.classList.contains("full"); }
  function setFull(on) {
    wrap.classList.toggle("full", on);
    try { if (window.parent !== window) window.parent.postMessage({ oxLearnFull: on }, "*"); } catch (e) {}
    $("bFull").textContent = on ? "✕ Exit full screen" : "⛶ Full screen"; $("bFull").classList.toggle("on", on);
    var fs = document.fullscreenElement || document.webkitFullscreenElement;
    if (on && !fs && wrap.requestFullscreen) wrap.requestFullscreen().catch(function () {});
    if (!on && fs && document.exitFullscreen) document.exitFullscreen().catch(function () {});
    setTimeout(fit, 60);
  }
  $("bFull").onclick = function () { setFull(!isFull()); };
  document.addEventListener("fullscreenchange", function () { if (!document.fullscreenElement && isFull()) setFull(false); else fit(); });
  $("viewer").addEventListener("dblclick", function () { setFull(!isFull()); });
  document.addEventListener("keydown", function (e) {
    if (/INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
    if (e.key === "f" || e.key === "F") { setFull(!isFull()); return; } if (e.key === "Escape" && isFull()) { setFull(false); return; } if (e.key === "ArrowRight") $("bNext").onclick(); else if (e.key === "ArrowLeft") go(step - 1); else if (e.key === " ") { e.preventDefault(); $("bAuto").onclick.call($("bAuto")); }
  });

  /* ---------------- Try it yourself ---------------- */
  function d6() { return 1 + Math.floor(Math.random() * 6); }
  function rollN(n) { var r = []; for (var i = 0; i < n; i++) r.push(d6()); return r; }
  function diceHtml(r) { return '<div class="trow" style="gap:6px">' + r.map(function (v) { return '<span class="tdie' + (v === 1 ? " one" : v === 6 ? " six" : "") + '">' + v + "</span>"; }).join("") + "</div>"; }
  function read(r, at) {
    var ones = r.filter(function (v) { return v === 1; }).length, sixes = r.filter(function (v) { return v === 6; }).length;
    var tot = r.reduce(function (a, v) { return a + (v === 1 ? 0 : v); }, 0), ok = tot >= at;
    return { ones: ones, tot: tot, ok: ok, over: ok ? tot - at : 0, run: ones === 0 && sixes >= 2 };
  }
  function num(id, v, min, max) { return '<input type="number" id="' + id + '" value="' + v + '" min="' + min + '" max="' + max + '">'; }
  function atSel(id, v) { return '<select id="' + id + '">' + [[8, "Common"], [12, "Standard"], [16, "Severe"], [20, "Extreme"], [24, "Nucleoid"], [28, "Apotheotic"]].map(function (a) { return '<option value="' + a[0] + '"' + (a[0] === v ? " selected" : "") + ">" + a[0] + " · " + a[1] + "</option>"; }).join("") + "</select>"; }
  function iv(id) { return +$(id).value || 0; }
  function pill(t, c) { return '<span class="pill ' + (c || "") + '">' + t + "</span>"; }

  var TRY = {
    roll: { h: "Roll a pool", sub: "Pick how many dice and the Activation Threshold (AT), then roll. 1s are struck out; two 6s with no 1s is Runaway.",
      ui: function () { return '<div class="trow"><label>Dice ' + num("tN", 5, 1, 14) + '</label><label>Activation Threshold (AT) ' + atSel("tAT", 12) + '</label><button class="abtn" id="tGo">🎲 Roll</button></div><div class="tout" id="tOut">Press Roll.</div>'; },
      on: function () { $("tGo").onclick = function () { var r = rollN(Math.max(1, Math.min(14, iv("tN")))), at = iv("tAT"), x = read(r, at);
        $("tOut").innerHTML = diceHtml(r) + '<div class="trow">Total (sum without the 1s) <b>' + x.tot + "</b> vs AT " + at + " " + (x.ok ? pill("Success · Overflow " + x.over, "ok") : pill("Failure", "bad")) +
          (x.ones ? pill(x.ones + " Inhibitor" + (x.ones > 1 ? "s" : "") + " → +" + x.ones + " Stress", "bad") : "") + (x.run ? pill("Runaway Catalysis!", "gold") : "") + "</div>"; }; } },
    pool: { h: "Build a pool", sub: "Pool = Baseline Grade + Pathway rank + situational dice (capped at ±5) + Overdrive.",
      ui: function () { return '<div class="trow"><label>Baseline Grade ' + num("pB", 4, 1, 6) + '</label><label>Pathway rank ' + num("pP", 2, 0, 4) + '</label><label>Situational dice <input type="range" id="pS" min="-8" max="8" value="1"> <b id="pSv">+1</b></label><label>Overdrive <select id="pO"><option value="0">none</option><option value="2">4 ATP → +2</option><option value="4">4 MI → +4 (+1 Stress)</option></select></label></div><div class="tout" id="pOut"></div>'; },
      on: function () { function up() { var b = iv("pB"), p = iv("pP"), sRaw = iv("pS"), s = Math.max(-5, Math.min(5, sRaw)), o = iv("pO"), pool = Math.max(0, b + p + s + o);
          $("pSv").textContent = (sRaw > 0 ? "+" : "") + sRaw;
          $("pOut").innerHTML = '<div class="trow" style="font-size:17px">Pool = ' + b + " (Baseline) + " + p + " (Pathway) " + (s < 0 ? "− " + (-s) : "+ " + s) + " (situational" + (s !== sRaw ? ", capped from " + sRaw : "") + ")" + (o ? " + " + o + " (Overdrive)" : "") + " = <b style=\"color:var(--acc);font-size:22px\">" + pool + " dice</b></div>" +
            '<div class="small">Homeostatic Baseline (no roll, unopposed and unhurried): ' + pool + " × 3 = <b>" + pool * 3 + "</b> → " + ([28, 24, 20, 16, 12, 8].filter(function (a) { return pool * 3 >= a; })[0] ? "automatically beats AT " + [28, 24, 20, 16, 12, 8].filter(function (a) { return pool * 3 >= a; })[0] : "beats no printed AT") + "</div>"; }
        ["pB", "pP", "pS", "pO"].forEach(function (id) { $(id).oninput = up; }); up(); } },
    pp: { h: "Spend a Cycle", sub: "PP = 2 + DFF. Spend them on actions; hold 1 for a Reserve. Unspent PP vanish at the end of the Cycle.",
      ui: function () { return '<div class="trow"><label>DFF Grade ' + num("qD", 4, 1, 6) + '</label><button class="abtn" id="qNew">⟳ New Cycle</button></div><div class="trow" id="qBtns"></div><div class="tout" id="qOut"></div>'; },
      on: function () { var pp = 0, log = [];
        function show() { var tot = 2 + iv("qD"); $("qOut").innerHTML = '<div>' + Array.from({ length: tot }, function (_, i) { return '<span class="ppt' + (i >= pp ? " spent" : "") + '">PP</span>'; }).join("") + '</div><div class="small" style="margin-top:6px">' + (log.length ? log.join(" → ") : "Nothing spent yet.") + (pp === 1 ? " · <b style='color:var(--acc)'>1 PP left: hold it as a Reserve for a reaction</b>" : pp === 0 ? " · out of PP" : "") + "</div>";
          $("qBtns").innerHTML = ACTS.map(function (a) { var c = a[1] === "3+" ? 3 : a[1]; return '<button class="abtn" data-c="' + c + '" data-n="' + a[0] + '"' + (c > pp ? " disabled" : "") + ">" + a[0] + " · " + a[1] + " PP</button>"; }).join("");
          [].forEach.call($("qBtns").querySelectorAll("button"), function (b) { b.onclick = function () { pp -= +b.dataset.c; log.push(b.dataset.n); show(); }; }); }
        function fresh() { pp = 2 + iv("qD"); log = []; show(); } $("qNew").onclick = fresh; $("qD").oninput = fresh; fresh(); } },
    attack: { h: "Make an attack", sub: "Roll your pool against the target's Membrane Threshold (MT). Damage = Overflow + Base Damage (BD) + Effect Value (EV) − Soak, minimum 1.",
      ui: function () { return '<div class="trow"><label>Dice ' + num("aN", 6, 1, 14) + '</label><label>Target MT ' + num("aM", 12, 5, 30) + '</label><label>BD ' + num("aB", 3, 0, 20) + '</label><label>EV ' + num("aE", 0, 0, 20) + '</label><label>Soak ' + num("aS", 0, 0, 15) + '</label><label>Target MI ' + num("aI", 10, 1, 200) + '</label><button class="abtn" id="aGo">⚔ Strike</button></div><div class="tout" id="aOut">Siss vs a Gnaw Swarm is pre-loaded. Press Strike.</div>'; },
      on: function () { $("aGo").onclick = function () { var r = rollN(Math.max(1, iv("aN"))), mt = iv("aM"), x = read(r, mt), ev = iv("aE") * (x.run ? 2 : 1), dmg = x.ok ? Math.max(1, x.over + iv("aB") + ev - iv("aS")) : 0, mi = iv("aI");
        $("aOut").innerHTML = diceHtml(r) + '<div class="trow">Total <b>' + x.tot + "</b> vs MT " + mt + " " + (x.ok ? pill("Hit", "ok") : pill("Miss", "bad")) + (x.ones ? pill("+" + x.ones + " Stress", "bad") : "") + (x.run ? pill("Runaway: EV ×2 + Rider", "gold") : "") + "</div>" +
          (x.ok ? '<div class="trow">Damage = ' + x.over + " (Overflow) + " + iv("aB") + " (BD) + " + ev + " (EV) − " + iv("aS") + " (Soak) = <b style=\"color:var(--bad);font-size:20px\">" + dmg + "</b> · MI " + mi + " → " + Math.max(0, mi - dmg) + (mi - dmg <= 0 ? " " + pill("Dormant", "gold") : "") + "</div>" : ""); }; } },
    stress: { h: "Run the Stress track", sub: "Click a box to set Stress, or use the buttons. Watch what each threshold does.",
      ui: function () { return '<div class="trow" id="sBox"></div><div class="trow"><button class="abtn" id="s1">🎲 Rolled a 1 (+1)</button><button class="abtn" id="s2">🕊 Quiet Cycle (−1)</button><button class="abtn" id="s3">🌬 Vent: 1 PP + 2 ATP (−2)</button><button class="abtn" id="s4">💤 Reconstitution (all)</button></div><div class="tout" id="sOut"></div>'; },
      on: function () { var st = 0, note = "";
        function show() { $("sBox").innerHTML = Array.from({ length: 8 }, function (_, i) { return '<span data-i="' + (i + 1) + '" style="cursor:pointer;width:34px;height:34px;border-radius:8px;display:inline-block;border:3px solid ' + (i < st ? "#f07a7a;background:#f07a7a" : "#6b8299") + '"></span>'; }).join("");
          [].forEach.call($("sBox").querySelectorAll("span"), function (b) { b.onclick = function () { set(+b.dataset.i === st ? st - 1 : +b.dataset.i); }; });
          var eff = st >= 8 ? "" : st >= 7 ? "−3 dice · ATP costs +1 · your next failed roll goes to the Cascade table" : st >= 6 ? "−3 dice to every pool · ATP costs +1" : st >= 5 ? "−2 dice to every pool · no Overclocked benefits" : st >= 3 ? "−1 die to every pool" : "nothing yet — you are in control";
          $("sOut").innerHTML = "<b>Stress " + st + "</b> — " + eff + (note ? '<div class="small" style="margin-top:4px">' + note + "</div>" : ""); }
        function set(v) { note = ""; if (v >= 8) { note = "Autophagic Collapse! Mark 2 Lysis Countdown boxes and drop to Stress 5."; v = 5; } st = Math.max(0, v); show(); }
        $("s1").onclick = function () { set(st + 1); }; $("s2").onclick = function () { set(st - 1); }; $("s3").onclick = function () { set(st - 2); }; $("s4").onclick = function () { set(0); }; show(); } },
    react: { h: "Defend with a Reserve", sub: "An enemy attacks you. Choose your reaction before it resolves.",
      ui: function () { return '<div class="trow"><label>Your MT ' + num("rM", 12, 5, 30) + '</label><label>Enemy pool ' + num("rN", 5, 1, 14) + '</label><label>Their BD ' + num("rB", 4, 0, 20) + '</label><label>Damage type <select id="rT"><option>Kinetic</option><option>Osmotic</option><option>Lytic</option><option>Thermic</option><option>Voltaic</option><option>Genetic</option></select></label></div><div class="trow"><button class="abtn" data-r="none">No reaction</button><button class="abtn" data-r="deflect">Deflect (MT +4)</button><button class="abtn" data-r="brace">Brace (halve Kinetic / Osmotic)</button><button class="abtn" data-r="inhib">Inhibition (3 ATP: −2 dice)</button></div><div class="tout" id="rOut">Pick a reaction to see the attack resolve.</div>'; },
      on: function () { [].forEach.call(document.querySelectorAll("[data-r]"), function (b) { b.onclick = function () {
        var k = b.dataset.r, n = iv("rN") - (k === "inhib" ? 2 : 0), mt = iv("rM") + (k === "deflect" ? 4 : 0), r = rollN(Math.max(1, n)), x = read(r, mt), ty = $("rT").value;
        var dmg = x.ok ? Math.max(1, x.over + iv("rB")) : 0, half = k === "brace" && (ty === "Kinetic" || ty === "Osmotic");
        var fin = half ? Math.max(1, Math.floor(dmg / 2)) : dmg;
        $("rOut").innerHTML = '<div class="small">' + ({ none: "You spend nothing.", deflect: "Held PP spent: your MT is " + mt + " against this attack.", brace: "Held PP spent: Kinetic and Osmotic damage halved, push ignored.", inhib: "3 ATP + held PP spent: their pool drops to " + n + " dice." })[k] + "</div>" + diceHtml(r) +
          '<div class="trow">Their Total <b>' + x.tot + "</b> vs your MT " + mt + " " + (x.ok ? pill("Hit", "bad") : pill("Miss", "ok")) + (x.ok ? " Damage " + (half ? "<s>" + dmg + "</s> → " : "") + "<b>" + fin + "</b> " + ty + (k === "brace" && !half ? " (Brace does not halve " + ty + ")" : "") : "") + "</div>"; }; }); } },
    overdrive: { h: "Overdrive a roll", sub: "Buy Reagents before you roll. Once per roll; these dice ignore the ±5 cap.",
      ui: function () { return '<div class="trow"><label>Pool ' + num("oN", 4, 1, 14) + '</label><label>ATP ' + num("oA", 14, 0, 60) + '</label><label>MI ' + num("oI", 25, 1, 200) + '</label><label>Stress ' + num("oS", 0, 0, 7) + '</label><label><input type="checkbox" id="oT"> Overdrive Training</label><label>AT ' + atSel("oAT", 16) + '</label></div><div class="trow"><button class="abtn" data-o="0">Roll as is</button><button class="abtn" data-o="atp">Overdrive with ATP</button><button class="abtn" data-o="mi">Overdrive with MI</button></div><div class="tout" id="oOut">A Severe task (AT 16) with 4 dice is hard. Try each button.</div>'; },
      on: function () { [].forEach.call(document.querySelectorAll("[data-o]"), function (b) { b.onclick = function () {
        var k = b.dataset.o, tr = $("oT").checked, base = tr ? 3 : 4, atpC = base + (iv("oS") >= 6 ? 1 : 0), n = iv("oN"), atp = iv("oA"), mi = iv("oI"), st = iv("oS"), msg = "";
        if (k === "atp") { if (atp < atpC) { $("oOut").textContent = "Not enough ATP (need " + atpC + ")."; return; } n += 2; atp -= atpC; msg = "Spent " + atpC + " ATP → +2 Reagents. ATP now " + atp + "."; }
        if (k === "mi") { if (mi <= base) { $("oOut").textContent = "Burning " + base + " MI would leave you Dormant."; return; } n += 4; mi -= base; st += 1; msg = "Burned " + base + " MI → +4 Reagents and +1 Stress. MI now " + mi + ", Stress " + st + "."; }
        var r = rollN(n), at = iv("oAT"), x = read(r, at);
        $("oOut").innerHTML = '<div class="small">' + (msg || "No Overdrive.") + " Pool " + n + " dice.</div>" + diceHtml(r) + '<div class="trow">Total <b>' + x.tot + "</b> vs AT " + at + " " + (x.ok ? pill("Success · Overflow " + x.over, "ok") : pill("Failure", "bad")) + (x.ones ? pill("+" + x.ones + " Stress", "bad") : "") + (x.run ? pill("Runaway!", "gold") : "") + "</div>"; }; }); } }
  };
  function buildTry() { var t = TRY[L[cur].tryit]; if (!t) { $("try").style.display = "none"; return; } $("try").style.display = "";
    $("try").innerHTML = "<h2>🧪 Try it yourself — " + t.h + '</h2><div class="sub">' + t.sub + "</div>" + t.ui(); t.on(); }

  /* ---------------- filming hooks ---------------- */
  window.lessonAPI = {
    lessons: function () { return L.map(function (l) { return { title: l.title, steps: l.steps.map(function (s) { return s.dur; }) }; }); },
    show: function (li, si) { cur = li; step = si; draw(); document.getAnimations().forEach(function (a) { a.pause(); a.currentTime = 0; }); },
    seek: function (t) { document.getAnimations().forEach(function (a) { a.pause(); a.currentTime = t * 1000; }); }
  };
  if (FILM) document.body.classList.add("film");
  var h = /lesson=(\d)/.exec(location.hash); buildList(); fit(); openLesson(h ? Math.min(L.length - 1, +h[1] - 1) : 0);
  if (!FILM) { $("bAuto").classList.add("on"); $("bAuto").textContent = "❚❚ Pause"; }
})();
