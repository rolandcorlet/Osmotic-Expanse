/* The Osmotic Expanse — animated lessons. Every step is a 1280×720 stage built from timed CSS animations,
   so the page can play it live and the filming script can seek it frame by frame. */
"use strict";
var IMG = window.LESSON_IMG || {};
function A(n, d, dl, f, it) { return n + " " + d + "s cubic-bezier(.2,.7,.2,1) " + dl + "s " + (it || 1) + " " + (f || "both"); }
function E(x, y, inner, o) {
  o = o || {};
  var st = "left:" + x + "px;top:" + y + "px;" + (o.w ? "width:" + o.w + "px;" : "") + (o.h ? "height:" + o.h + "px;" : "") + (o.st || "") +
    (o.an ? "animation:" + o.an.join(",") + ";" : "");
  return '<div class="e ' + (o.cls || "") + '" style="' + st + '">' + inner + "</div>";
}
function S(inner, an, cls, st) { return '<span class="' + (cls || "") + '" style="display:inline-block;' + (st || "") + (an ? "animation:" + an.join(",") + ";" : "") + '">' + inner + "</span>"; }
function die(v, x, y, an, extra) { var p = ""; for (var i = 0; i < 9; i++) p += "<i></i>"; return '<div class="e die ' + (v ? "v" + v : "blank") + " " + (extra || "") + '" style="left:' + x + "px;top:" + y + "px;animation:" + an.join(",") + ';">' + p + "</div>"; }
function diceRow(vals, y, mk, size) { size = size || 92; var gap = 26, w = vals.length * size + (vals.length - 1) * gap, x0 = 640 - w / 2, out = "";
  vals.forEach(function (v, i) { out += die(v, x0 + i * (size + gap), y, mk(i, v)); }); return out; }
function rowX(n, i, size, gap) { var w = n * size + (n - 1) * gap; return 640 - w / 2 + i * (size + gap); }
function eqn(y, parts, start, step) { /* parts: html strings; each pops in turn */
  return E(0, y, parts.map(function (p, i) { return S(p, [A("pop", .45, start + i * step)]); }).join(""), { w: 1280, cls: "eqn", st: "justify-content:center;display:flex;" });
}
function boxes(n, filled, at, step, y, x) { var out = ""; for (var i = 0; i < n; i++) out += S("", i < filled ? [A("boxfill", .3, at + i * step, "forwards")] : [], "box"); return E(x, y, out, {}); }
function recap(items, y0) { return items.map(function (t, i) { var col = i % 2, row = Math.floor(i / 2);
  return E(140 + col * 520, (y0 || 150) + row * 170, '<div class="card" style="height:140px;display:flex;gap:16px;align-items:center"><div style="font-size:48px">' + t[0] + '</div><div><div style="font:700 26px Georgia,serif">' + t[1] + '</div><div class="small">' + t[2] + "</div></div></div>", { w: 480, an: [A("in", .6, .3 + i * .45)] }); }).join(""); }

var LESSONS = window.LESSONS = [];

/* ================================================================= 1 · THE ROLL */
LESSONS.push({ title: "The Roll", short: "dice, 1s, Total, Overflow", icon: "🎲", steps: [
  { dur: 7, say: "To do anything uncertain, you roll a handful of six-sided dice — your <b>Reagent Pool</b>. Every Reagent is one die.",
    html: E(0, 110, '<div class="big ctr">Your Reagent Pool</div>', { w: 1280, an: [A("in", .8, .2)] }) +
      diceRow([0, 0, 0, 0, 0], 260, function (i) { return [A("pop", .5, 1 + i * .25)]; }) +
      E(0, 420, '<div class="t ctr">1 Reagent = 1 six-sided die <span style="color:var(--acc)">(d6)</span></div>', { w: 1280, an: [A("in", .6, 2.6)] }) },
  { dur: 6, say: "Roll the whole pool at once. Here, a pool of five dice.",
    html: diceRow([5, 1, 4, 6, 3], 210, function (i) { return [A("roll", 1.1, .3 + i * .15)]; }) +
      E(0, 370, '<div class="h2 ctr">5 dice → 5 · 1 · 4 · 6 · 3</div>', { w: 1280, an: [A("in", .6, 1.9)] }) },
  { dur: 8, say: "Every 1 is an <b>Inhibitor</b>. It scores nothing — and it marks 1 Metabolic Stress.",
    html: diceRow([5, 1, 4, 6, 3], 170, function (i, v) { return v === 1 ? [A("fade", .01, 0), A("inhib", .6, 1, "forwards")] : [A("fade", .01, 0)]; }) +
      E(rowX(5, 1, 92, 26) - 40, 285, '<div class="chip r ctr" style="width:172px;justify-content:center">Inhibitor</div>', { an: [A("pop", .5, 1.4)] }) +
      E(330, 400, '<div class="lbl">Metabolic Stress</div>', { an: [A("in", .5, 2)] }) +
      boxes(8, 1, 2.6, .2, 440, 330) + E(800, 436, '<div class="chip r"><b>+1</b> Stress</div>', { an: [A("pop", .5, 3)] }) },
  { dur: 8, say: "Add up the dice that are left. That is your <b>Total</b> — here, 18.",
    html: diceRow([5, 1, 4, 6, 3], 170, function (i, v) { return v === 1 ? [A("fade", .01, 0), A("inhib", .01, 0, "forwards")] : [A("fade", .01, 0)]; }) +
      eqn(360, ['<span class="chip">5</span>', '<span class="op">+</span>', '<span class="chip">4</span>', '<span class="op">+</span>', '<span class="chip">6</span>', '<span class="op">+</span>', '<span class="chip">3</span>', '<span class="op">=</span>', '<span class="res">Total 18</span>'], .8, .3) +
      E(0, 470, '<div class="small ctr">the 1 is left out — it scores nothing</div>', { w: 1280, an: [A("in", .5, 3.8)] }) },
  { dur: 9, say: "Compare it with the <b>Activation Threshold (AT)</b> — the number the task needs. 12 is Standard. 18 beats it: success.",
    html: E(60, 90, '<div class="card" style="width:300px"><div class="lbl" style="margin-bottom:8px">Activation Thresholds</div>' +
      [["8", "Common"], ["12", "Standard"], ["16", "Severe"], ["20", "Extreme"], ["24", "Nucleoid"], ["28", "Apotheotic"]].map(function (r, i) {
        return '<div style="display:flex;gap:14px;align-items:center;font-size:22px;padding:5px 8px;border-radius:8px;' + (i === 1 ? "animation:" + A("hl", 1.2, 1.8, "both", 2) : "") + '"><b style="width:44px">' + r[0] + "</b>" + r[1] + "</div>"; }).join("") + "</div>", { an: [A("in", .6, .2)] }) +
      E(420, 250, '<div class="bar" style="width:780px"><div class="fill" style="--w:585px;animation:' + A("grow", 1.4, 2.2) + '"></div><div class="mark" style="left:390px"></div></div>', { an: [A("fade", .5, 1.2)] }) +
      E(780, 190, '<div class="chip">AT <b>12</b></div>', { an: [A("pop", .4, 1.6)] }) + E(950, 310, '<div class="chip c">Total <b>18</b></div>', { an: [A("pop", .4, 3.4)] }) +
      E(700, 400, '<div class="stamp ok">SUCCESS</div>', { an: [A("stamp", .6, 4)] }) },
  { dur: 9, say: "What you beat it by is <b>Overflow</b> — here, 6. It is never wasted: it always makes the result better.",
    html: E(250, 150, '<div class="bar" style="width:780px"><div class="fill" style="--w:585px"></div><div class="over" style="left:390px;width:195px;animation:' + A("fade", .6, .6) + '"></div><div class="mark" style="left:390px"></div></div>', { an: [A("fade", .01, 0)] }) +
      E(570, 90, '<div class="chip y">Overflow <b>18 − 12 = 6</b></div>', { an: [A("pop", .5, 1.2)] }) +
      [["⚔", "Attack", "extra damage"], ["〰", "Movement", "extra Drifts"], ["✋", "Talk", "a concession"]].map(function (c, i) {
        return E(150 + i * 340, 270, '<div class="card ctr" style="width:300px"><div style="font-size:44px">' + c[0] + '</div><div style="font:700 26px Georgia,serif">' + c[1] + '</div><div class="t" style="color:var(--gold)">+ ' + c[2] + "</div></div>", { an: [A("in", .6, 2 + i * .5)] }); }).join("") },
  { dur: 10, say: "No 1s and at least two 6s is <b>Runaway Catalysis</b>: the reaction feeds itself — you gain the effect's Rider, and its Effect Value counts twice.",
    html: diceRow([6, 4, 6, 3], 120, function (i, v) { return v === 6 ? [A("roll", 1, .2 + i * .15), A("six", .9, 1.5, "none", 3)] : [A("roll", 1, .2 + i * .15)]; }) +
      E(0, 280, '<div class="ctr"><span class="stamp gold">RUNAWAY CATALYSIS</span></div>', { w: 1280, an: [A("stamp", .6, 2.2)] }) +
      E(0, 410, '<div class="t ctr">no 1s <span class="op">+</span> two or more 6s <span class="op">→</span> <span style="color:var(--gold)">gain the Rider · Effect Value counts twice</span></div>', { w: 1280, an: [A("in", .6, 3.2)] }) },
  { dur: 8, say: "That is the whole engine. Every roll in the Osmotic Expanse works this way.",
    html: recap([["🎲", "Roll your pool", "one d6 per Reagent"], ["✖", "1s are Inhibitors", "score nothing · +1 Stress each"], ["Σ", "Total ≥ AT", "add the rest; reach the threshold"], ["★", "The excess is Overflow", "it always buys something"]]) }
], tryit: "roll" });

/* ================================================================= 2 · BUILDING YOUR POOL */
var BASES = [["VSC", "Viscosity", "mass, toughness, heavy weapons"], ["DFF", "Diffusion", "speed, agility, light weapons"], ["RTC", "Reactivity", "Bursts, crafting, chemistry"], ["OSM", "Osmosis", "senses, tracking, insight"], ["AFF", "Affinity", "command, bonds, ritual"]];
function pips(n, on) { var s = ""; for (var i = 1; i <= 6; i++) s += '<span style="display:inline-block;width:16px;height:16px;border-radius:50%;margin:0 3px;border:2px solid #5ee6d0;' + (i <= on ? "background:#5ee6d0;box-shadow:0 0 8px #5ee6d0" : "") + '"></span>'; return s; }
LESSONS.push({ title: "Building Your Pool", short: "Baselines, Pathways, situation", icon: "▣", steps: [
  { dur: 9, say: "Every organism has five <b>Metabolic Baselines</b>, each a Grade from 1 to 6 — and a Grade is simply how many dice it brings.",
    html: BASES.map(function (b, i) { return E(54 + i * 238, 110, '<div class="card ctr" style="height:270px"><div style="font:900 40px system-ui;letter-spacing:3px;color:var(--acc)">' + b[0] + '</div><div style="font:700 24px Georgia,serif;margin:4px 0 10px">' + b[1] + '</div><div class="small" style="min-height:56px">' + b[2] + '</div><div style="margin-top:14px">' + pips(6, [3, 4, 3, 3, 4][i]) + "</div></div>", { w: 220, an: [A("in", .6, .3 + i * .3)] }); }).join("") +
      E(0, 430, '<div class="t ctr">Grade 1 = starved · 3 = competent · 5 = colony-famous · 6 = Nucleoid-grade</div>', { w: 1280, an: [A("in", .6, 2.4)] }) },
  { dur: 9, say: "Add a <b>Pathway</b> — a trained habit. DFF 4 plus Fluid Navigation rank 2 makes a 6-dice pool for riding a current.",
    html: E(80, 100, '<div class="card glow ctr" style="width:300px"><div style="font:900 34px system-ui;color:var(--acc)">DFF 4</div><div class="small">Diffusion Grade</div></div>', { an: [A("in", .5, .2)] }) +
      E(410, 120, '<div class="op">+</div>', { an: [A("pop", .4, .9)] }) +
      E(470, 100, '<div class="card ctr" style="width:340px"><div style="font:900 30px system-ui;color:#c08cff">Fluid Navigation 2</div><div class="small">Pathway rank</div></div>', { an: [A("in", .5, 1.1)] }) +
      E(840, 120, '<div class="op">=</div>', { an: [A("pop", .4, 1.6)] }) +
      E(900, 100, '<div class="card ctr" style="width:300px"><div class="res" style="display:inline-block">6 dice</div><div class="small" style="margin-top:6px">your pool</div></div>', { an: [A("pop", .5, 1.8)] }) +
      diceRow([0, 0, 0, 0, 0, 0], 320, function (i) { return [A("pop", .4, 2.4 + i * .2)]; }) +
      E(rowX(6, 4, 92, 26) - 10, 430, '<div class="chip" style="border-color:#c08cff;color:#e4d4ff">+2 from the Pathway</div>', { an: [A("pop", .4, 3.8)] }) },
  { dur: 8, say: "Pathway ranks run 0 to 4: Latent, Expressed, Anchored, Dominant, Sovereign. Untrained, you roll the Baseline alone.",
    html: [["0", "Latent", "—"], ["1", "Expressed", "+1"], ["2", "Anchored", "+2"], ["3", "Dominant", "+3"], ["4", "Sovereign", "+4"]].map(function (r, i) {
      return E(90 + i * 225, 400 - i * 62, '<div class="card ctr" style="width:205px"><div style="font:900 30px system-ui;color:#c08cff">' + r[0] + '</div><div style="font:700 22px Georgia,serif">' + r[1] + '</div><div class="t">' + r[2] + " dice</div></div>", { an: [A("in", .5, .3 + i * .45)] }); }).join("") },
  { dur: 10, say: "The situation adds or removes <b>dice</b>, never points. All situational dice together stop at <b>+5 or −5</b>.",
    html: [["+1", "good position", "g"], ["+1", "ally helping", "g"], ["+1", "Catalysed", "g"], ["+2", "target Marked", "g"], ["+2", "Momentum", "g"], ["−2", "partial cover", "r"]].slice(0, 5).map(function (c, i) {
      return E(80 + (i % 3) * 380, 100 + Math.floor(i / 3) * 90, '<span class="chip ' + c[2] + '"><b>' + c[0] + "</b> " + c[1] + "</span>", { an: [A("pop", .45, .3 + i * .4)] }); }).join("") +
      E(240, 330, '<div style="position:relative;width:800px;height:46px;border-radius:12px;background:linear-gradient(90deg,rgba(240,122,122,.35),#132131 45%,#132131 55%,rgba(95,208,138,.35));border:1px solid #2a4560"></div>', { an: [A("fade", .5, 2.8)] }) +
      E(225, 386, '<div class="small">−5</div>', { an: [A("fade", .4, 2.8)] }) + E(632, 386, '<div class="small">0</div>', { an: [A("fade", .4, 2.8)] }) + E(1030, 386, '<div class="small">+5</div>', { an: [A("fade", .4, 2.8)] }) +
      E(628, 324, '<div style="width:24px;height:58px;border-radius:6px;background:#fff;box-shadow:0 0 16px #fff"></div>', { an: [A("fade", .3, 3.2), "drift 1.4s ease-out 3.4s 1 both"], st: "--dx:400px;" }) +
      E(0, 450, '<div class="t ctr">+1 +1 +1 +2 +2 = <span style="text-decoration:line-through;color:var(--dim)">+7</span> → <b style="color:var(--warn)">+5</b> (the cap holds)</div>', { w: 1280, an: [A("in", .5, 4.8)] }) },
  { dur: 9, say: "No pressure and no opponent? Don't roll. <b>Dice × 3</b> is your Homeostatic Baseline: a 4-dice specialist always manages a Standard task, given time.",
    html: eqn(140, ['<span class="chip">4 dice</span>', '<span class="op">×</span>', '<span class="chip">3</span>', '<span class="op">=</span>', '<span class="res">12</span>'], .3, .3) +
      E(260, 280, '<div class="card" style="width:340px"><div class="t">AT 12 · Standard</div><div style="font:800 28px system-ui;color:var(--ok);margin-top:6px">✔ no roll needed</div></div>', { an: [A("in", .5, 2.2)] }) +
      E(680, 280, '<div class="card" style="width:340px"><div class="t">AT 16 · Severe</div><div style="font:800 28px system-ui;color:var(--bad);margin-top:6px">✖ you must roll</div></div>', { an: [A("in", .5, 2.9)] }) },
  { dur: 8, say: "So every pool is built the same way. Remember this line.",
    html: eqn(210, ['<span class="chip c">Pool</span>', '<span class="op">=</span>', '<span class="chip">Baseline Grade</span>', '<span class="op">+</span>', '<span class="chip" style="border-color:#c08cff">Pathway rank</span>', '<span class="op">+</span>', '<span class="chip y">situational dice (max ±5)</span>'], .3, .35) +
      E(0, 360, '<div class="small ctr">plus any dice you buy with Overdrive — lesson 7</div>', { w: 1280, an: [A("in", .5, 3)] }) }
], tryit: "pool" });

/* ================================================================= 3 · THE PULSE CYCLE */
var ACTS = [["Drift", 1], ["Vent", 1], ["Sense", 1], ["Strike", 2], ["Synthesise", 2], ["Burst", "3+"]];
function actX(i) { return 70 + i * 192; }
LESSONS.push({ title: "The Pulse Cycle", short: "Frequency, PP, Reserve, Momentum", icon: "⏱", steps: [
  { dur: 9, say: "Fights run in <b>Pulse Cycles</b> of about six seconds. At the start everyone rolls <b>Frequency</b> — d6 + DFF + Pulse Discipline — and the highest acts first.",
    html: E(0, 100, '<div class="big ctr">1 Pulse Cycle ≈ 6 seconds</div>', { w: 1280, an: [A("in", .6, .2)] }) +
      E(0, 200, '<div class="t ctr">Frequency = <span class="chip">d6</span> + <span class="chip">DFF</span> + <span class="chip" style="border-color:#c08cff">Pulse Discipline</span></div>', { w: 1280, an: [A("in", .6, 1.2)] }) +
      [["Siss", "4 + 5 + 1 = 10"], ["Wall", "5 + 3 + 0 = 8"], ["Gnaw Swarm", "rolls 6"]].map(function (r, i) {
        return E(240 + i * 290, 320, '<div class="card ctr" style="width:250px"><div style="font:900 34px system-ui;color:var(--acc)">' + (i + 1) + (i === 0 ? "st" : i === 1 ? "nd" : "rd") + '</div><div style="font:700 24px Georgia,serif">' + r[0] + '</div><div class="small">' + r[1] + "</div></div>", { an: [A("in", .5, 2.4 + i * .5)] }); }).join("") },
  { dur: 8, say: "On your turn you receive <b>Pulse Points (PP)</b>: 2 + your DFF Grade. With DFF 4, that is 6 PP to spend this Cycle.",
    html: eqn(130, ['<span class="chip c">PP</span>', '<span class="op">=</span>', '<span class="chip">2</span>', '<span class="op">+</span>', '<span class="chip">DFF 4</span>', '<span class="op">=</span>', '<span class="res">6</span>'], .3, .3) +
      E(0, 290, [0, 1, 2, 3, 4, 5].map(function (i) { return S('<div class="tok">PP</div>', [A("pop", .4, 2.4 + i * .2)], "", "margin:0 10px"); }).join(""), { w: 1280, cls: "ctr" }) },
  { dur: 11, say: "Everything costs PP: Drift 1 · Vent 1 · Sense 1 · Strike 2 · Synthesise 2 · Burst 3 or more. Drift, Strike, Strike — and 1 PP is left.",
    html: ACTS.map(function (a, i) { return E(actX(i), 330, '<div class="card ctr" style="width:176px;padding:12px"><div style="font:700 22px Georgia,serif">' + a[0] + '</div><div style="font:900 30px system-ui;color:var(--acc)">' + a[1] + " PP</div></div>", { an: [A("in", .4, .2 + i * .15), (i === 0 || i === 3) ? A("glowon", .4, i === 0 ? 2 : 3, "forwards") : A("fade", .01, 0)] }); }).join("") +
      [0, 1, 2, 3, 4, 5].map(function (i) {
        var tx = 0, ty = 0, sp = null;
        if (i === 0) { tx = actX(0) + 60 - (365 + i * 94); ty = 250; sp = 2; }
        if (i === 1 || i === 2) { tx = actX(3) + 30 + (i - 1) * 60 - (365 + i * 94); ty = 250; sp = 3; }
        if (i === 3 || i === 4) { tx = actX(3) + 30 + (i - 3) * 60 - (365 + i * 94); ty = 250; sp = 4.6; }
        return E(365 + i * 94, 130, '<div class="tok">PP</div>', { st: "--tx:" + tx + "px;--ty:" + ty + "px;", an: [A("fade", .01, 0)].concat(sp ? [A("spend", .8, sp, "forwards"), A("out", .3, sp + .9, "forwards")] : []) }); }).join("") +
      E(0, 520, '<div class="t ctr"><span class="chip c"><b>1</b> PP left</span></div>', { w: 1280, an: [A("pop", .5, 6.4)] }) },
  { dur: 9, say: "Hold 1 PP in <b>Reserve</b> and you can react during someone else's turn. Anything you do not spend is lost when the Cycle ends.",
    html: E(560, 120, '<div class="tok" style="width:90px;height:90px;font-size:26px">PP</div>', { an: [A("pop", .5, .2)] }) +
      E(470, 250, '<div class="card glow ctr" style="width:340px"><div style="font-size:40px">🛡</div><div style="font:700 26px Georgia,serif">Reserve</div><div class="small">one reaction in someone else\'s turn</div></div>', { an: [A("in", .5, 1)] }) +
      E(0, 450, '<div class="t ctr" style="color:var(--dim)">unspent PP <b style="color:var(--bad)">vanish</b> at the end of the Cycle — they never carry over</div>', { w: 1280, an: [A("in", .5, 2.6)] }) },
  { dur: 9, say: "<b>Momentum</b>: Drift at least 3 Drifts in a straight line, then Strike in the same Cycle — +2 dice, and the hit becomes Kinetic.",
    html: [0, 1, 2].map(function (i) { return E(330 + i * 160, 290, '<div style="width:22px;height:22px;border-radius:50%;border:3px dashed #5ee6d0"></div>', { an: [A("fade", .3, .3 + i * .2)] }); }).join("") +
      E(170, 230, '<div class="port" style="width:130px;height:130px;background-image:url(' + (IMG.flag || "") + ')"></div>', { st: "--dx:620px;", an: [A("fade", .3, .1), "drift 2s ease-in 1s 1 both"] }) +
      E(940, 230, '<div class="port" style="width:140px;height:140px;background-image:url(' + (IMG.gnaw || "") + ')"></div>', { an: [A("fade", .3, .1), A("shake", .5, 3.1)] }) +
      E(860, 150, '<div class="stamp gold" style="font-size:40px">STRIKE</div>', { an: [A("stamp", .5, 3)] }) +
      E(0, 440, '<div class="t ctr">3 Drifts straight → Strike: <span class="chip g"><b>+2</b> dice</span> <span class="chip">hit becomes Kinetic</span></div>', { w: 1280, an: [A("in", .5, 3.8)] }) },
  { dur: 8, say: "Every Cycle: get your PP, spend them, maybe hold one back — then the Cycle turns.",
    html: recap([["⏱", "Frequency order", "d6 + DFF + Pulse Discipline"], ["◉", "PP = 2 + DFF", "your actions this Cycle"], ["💸", "Spend them", "Drift 1 · Strike 2 · Burst 3+"], ["🛡", "Hold 1 in Reserve", "react in someone else's turn"]]) }
], tryit: "pp" });

/* ================================================================= 4 · ATTACKING & DAMAGE */
LESSONS.push({ title: "Attacking & Damage", short: "MT, hits, damage, types", icon: "⚔", steps: [
  { dur: 10, say: "Your weapon decides the Baseline: Weight uses VSC, Lash DFF, Projector DFF or RTC, Resonator RTC. Add <b>Membrane Penetration</b> and the weapon's bonus.",
    html: E(70, 90, '<div class="port" style="width:200px;height:250px;background-image:url(' + (IMG.flag || "") + ')"></div>', { an: [A("in", .5, .2)] }) +
      E(70, 350, '<div style="font:700 24px Georgia,serif;width:200px;text-align:center">Siss</div><div class="small ctr" style="width:200px">Flagellan · Current Rider</div>', { an: [A("in", .5, .4)] }) +
      [["Weight", "VSC"], ["Lash", "DFF"], ["Projector", "DFF or RTC"], ["Resonator", "RTC"]].map(function (r, i) {
        return E(330 + i * 225, 100, '<div class="card ctr" style="width:205px;padding:12px"><div style="font:700 22px Georgia,serif">' + r[0] + '</div><div style="font:900 26px system-ui;color:var(--acc)">' + r[1] + "</div></div>", { an: [A("in", .4, .6 + i * .2), i === 1 ? A("glowon", .4, 2, "forwards") : A("fade", .01, 0)] }); }).join("") +
      E(330, 250, '<div class="small">Siss carries a Peptide Blade — a Lash weapon</div>', { an: [A("in", .4, 2.2)] }) +
      E(310, 330, ['<span class="chip">DFF 5</span>', '<span class="op">+</span>', '<span class="chip" style="border-color:#c08cff">Membrane Penetration 0</span>', '<span class="op">+</span>', '<span class="chip">Peptide Blade +1</span>', '<span class="op">=</span>', '<span class="res">6 dice</span>'].map(function (p, i) { return S(p, [A("pop", .4, 3 + i * .3)]); }).join(""), { cls: "eqn" }) },
  { dur: 9, say: "An attack must reach the target's <b>Membrane Threshold (MT)</b>: 10 + its DFF + modifiers. This Gnaw Swarm has MT 12.",
    html: E(780, 80, '<div class="port" style="width:400px;height:300px;background-image:url(' + (IMG.gnaw || "") + ')"></div>', { an: [A("in", .6, .2)] }) +
      E(780, 400, '<div style="font:700 28px Georgia,serif">Gnaw Swarm</div><div class="small">Order I · Lytic Swarms · Tier 1</div>', { an: [A("in", .5, .5)] }) +
      E(90, 110, '<div class="card" style="width:600px"><div class="lbl">to hit it you need</div><div style="font:800 46px system-ui;margin:6px 0">MT <span style="color:var(--acc)">12</span></div><div class="t">MT = 10 + DFF + modifiers</div></div>', { an: [A("in", .5, 1.2)] }) +
      E(90, 320, '<span class="chip">Membrane Integrity (MI) <b>10</b></span>', { an: [A("pop", .4, 2.4)] }) + E(460, 320, '<span class="chip">Soak <b>0</b></span>', { an: [A("pop", .4, 2.7)] }) },
  { dur: 10, say: "Siss rolls 6 dice. One is an Inhibitor; the rest make 16. That beats MT 12 — a hit, with 4 Overflow.",
    html: diceRow([3, 1, 4, 2, 5, 2], 110, function (i, v) { return v === 1 ? [A("roll", 1, .2 + i * .12), A("inhib", .5, 1.6, "forwards")] : [A("roll", 1, .2 + i * .12)]; }) +
      eqn(270, ['<span class="chip">3+4+2+5+2</span>', '<span class="op">=</span>', '<span class="chip c">Total <b>16</b></span>', '<span class="op">vs</span>', '<span class="chip">MT <b>12</b></span>'], 2.2, .35) +
      E(330, 380, '<div class="stamp ok">HIT</div>', { an: [A("stamp", .5, 4.2)] }) + E(640, 395, '<div class="chip y" style="font-size:28px">Overflow <b>4</b></div>', { an: [A("pop", .5, 4.8)] }) },
  { dur: 10, say: "<b>Damage = Overflow + Base Damage (BD) + Effect Value (EV) − Soak</b>, and a hit always does at least 1. 4 + 3 = 7: the swarm drops from 10 MI to 3.",
    html: eqn(110, ['<span class="chip y">Overflow <b>4</b></span>', '<span class="op">+</span>', '<span class="chip">Base Damage (BD) <b>3</b></span>', '<span class="op">+</span>', '<span class="chip">Effect Value (EV) <b>0</b></span>', '<span class="op">−</span>', '<span class="chip">Soak <b>0</b></span>', '<span class="op">=</span>', '<span class="res">7</span>'], .3, .3) +
      E(300, 270, '<div class="lbl">Gnaw Swarm · Membrane Integrity</div>', { an: [A("in", .4, 3)] }) +
      E(300, 310, '<div class="bar" style="width:680px;height:46px"><div class="fill" style="--w:204px;background:linear-gradient(90deg,#c0392b,#f07a7a);animation:' + A("shrink", 1.2, 4) + '"></div></div>', { an: [A("fade", .4, 3)] }) +
      E(1000, 312, '<div style="font:800 34px system-ui"><span style="animation:' + A("strike", .4, 4.2, "forwards") + ';display:inline-block">10</span> → <span style="color:var(--bad);animation:' + A("pop", .4, 5) + ';display:inline-block">3</span></div>', { an: [A("fade", .4, 3)] }) },
  { dur: 9, say: "Every hit has a damage type, and the attacker picks one <b>Signature Consequence</b>. A Kinetic hit can push, crack a graft, or leave the target Jostled.",
    html: [["Kinetic", "#d9a65a"], ["Lytic", "#9bd64f"], ["Osmotic", "#4fb3e8"], ["Thermic", "#f07a4a"], ["Voltaic", "#e8d94f"], ["Genetic", "#d66fae"]].map(function (t, i) {
      return E(80 + i * 190, 110, '<span class="chip" style="border-color:' + t[1] + ";color:" + t[1] + '">' + t[0] + "</span>", { an: [A("pop", .4, .2 + i * .2), i === 0 ? A("glowon", .4, 1.8, "forwards") : A("fade", .01, 0)] }); }).join("") +
      E(240, 230, '<div class="card glow" style="width:800px"><div class="lbl" style="color:#d9a65a">Kinetic — choose one</div><div class="list"><div>➜ push 1 Drift per 4 Overflow</div><div>➜ break a graft slot</div><div>➜ inflict <b>Jostled</b> (−1 PP, MT −2)</div></div></div>', { an: [A("in", .5, 2.4)] }) },
  { dur: 8, say: "Build the pool, reach the Membrane Threshold, add the damage — then choose what the hit does.",
    html: recap([["🗡", "Pool from your weapon", "Baseline + Membrane Penetration + bonus"], ["🎯", "Reach the MT", "10 + DFF + modifiers"], ["💥", "Damage", "Overflow + BD + EV − Soak (min 1)"], ["✦", "A consequence", "one per hit, by damage type"]]) }
], tryit: "attack" });

/* ================================================================= 5 · STRESS */
LESSONS.push({ title: "Stress", short: "the track of 8 and clearing it", icon: "⚠", steps: [
  { dur: 8, say: "<b>Metabolic Stress</b> is your chemistry fraying. Each 1 you roll marks a box on a track of 8.",
    html: diceRow([1, 4, 1, 5], 110, function (i, v) { return v === 1 ? [A("roll", 1, .2 + i * .12), A("inhib", .5, 1.5, "forwards")] : [A("roll", 1, .2 + i * .12)]; }) +
      E(330, 290, '<div class="lbl">Metabolic Stress</div>', { an: [A("in", .4, 1.8)] }) + boxes(8, 2, 2.4, .5, 330, 330) +
      E(330, 410, '<div class="t">two 1s → <b style="color:var(--bad)">2 Stress</b></div>', { an: [A("in", .4, 3.5)] }) },
  { dur: 11, say: "At 3 Stress every pool loses a die; at 5, two; at 6, three — and ATP costs rise. At 7 the next failure cascades, and at 8 your body collapses.",
    html: boxes(8, 8, .4, .25, 110, 330) +
      [[2, "3", "−1 die to every pool"], [4, "5", "−2 dice"], [5, "6", "−3 dice · ATP +1"], [6, "7", "next failure → Cascade table"], [7, "8", "Autophagic Collapse: 2 Lysis boxes, drop to 5"]].map(function (r, i) {
        return E(330, 190 + i * 66, '<div style="display:flex;gap:14px;align-items:center"><span class="chip r" style="width:82px;justify-content:center"><b>' + r[1] + '</b></span><span class="t">' + r[2] + "</span></div>", { an: [A("in", .4, 2.6 + i * .6)] }); }).join("") },
  { dur: 10, say: "Bring it down: −1 after a Cycle with no ATP spent and no damage taken, −2 with a Vent (1 PP and 2 ATP), and all of it with a Reconstitution — about an hour's rest.",
    html: E(330, 100, '<div>' + [0, 1, 2, 3, 4, 5, 6, 7].map(function (i) { return S("", i < 6 ? [A("boxfill", .01, 0, "forwards"), A("boxclear", .4, i === 5 ? 1.2 : i >= 3 ? 3.2 : 5.2, "forwards")] : [], "box"); }).join("") + "</div>", {}) +
      E(250, 220, '<div class="card" style="width:250px"><div style="font:900 30px system-ui;color:var(--ok)">−1</div><div class="small">a quiet Cycle (no ATP, no damage)</div></div>', { an: [A("in", .4, .8)] }) +
      E(520, 220, '<div class="card" style="width:250px"><div style="font:900 30px system-ui;color:var(--ok)">−2</div><div class="small">Vent: 1 PP + 2 ATP</div></div>', { an: [A("in", .4, 2.8)] }) +
      E(790, 220, '<div class="card" style="width:250px"><div style="font:900 30px system-ui;color:var(--ok)">all</div><div class="small">Reconstitution (~1 hour)</div></div>', { an: [A("in", .4, 4.8)] }) },
  { dur: 7, say: "Stress is spoken out loud at the table. When it climbs, play changes: you Vent, lean on Cohesion, and stop bursting.",
    html: recap([["✖", "1s mark Stress", "one box each, track of 8"], ["📉", "3 / 5 / 6", "−1 / −2 / −3 dice to every pool"], ["💀", "8 collapses you", "2 Lysis boxes, back to 5"], ["🌬", "Clear it", "quiet Cycle −1 · Vent −2 · rest: all"]]) }
], tryit: "stress" });

/* ================================================================= 6 · REACTIONS */
LESSONS.push({ title: "Reactions", short: "Reserve, Deflect, Brace, Inhibition", icon: "🛡", steps: [
  { dur: 9, say: "That held Pulse Point buys one <b>Reactive Osmosis</b> per Cycle, at any moment — even in someone else's turn.",
    html: E(590, 90, '<div class="tok" style="width:90px;height:90px;font-size:26px">PP</div>', { an: [A("pop", .5, .2)] }) +
      [["Deflect", "your MT +4 against one attack"], ["Brace", "halve Kinetic & Osmotic damage; ignore push"], ["Inhibit", "make the attacker re-roll one die"], ["Shed", "end Locked, Turgid or Marked"]].map(function (r, i) {
        return E(70 + i * 290, 250, '<div class="card ctr" style="width:270px;height:170px"><div style="font:700 28px Georgia,serif;color:var(--acc)">' + r[0] + '</div><div class="t" style="font-size:21px;margin-top:8px">' + r[1] + "</div></div>", { an: [A("in", .5, 1 + i * .4)] }); }).join("") },
  { dur: 10, say: "<b>Deflect</b>: your MT is +4 against one attack. A 14 that would have hit your MT 12 now misses.",
    html: E(240, 200, '<div class="bar" style="width:800px"><div class="fill" style="--w:466px;background:linear-gradient(90deg,#c0392b,#f07a7a);animation:' + A("grow", 1, .4) + '"></div></div>', { an: [A("fade", .3, .1)] }) +
      E(240 + 400, 186, '<div class="mark" style="position:relative;top:0;height:68px"></div>', { st: "--dx:133px;", an: [A("fade", .3, .2), "drift .8s ease-out 3s 1 both"] }) +
      E(560, 120, '<span class="chip">your MT <b>12</b></span>', { an: [A("fade", .3, .2), A("strike", .3, 3.2, "forwards")] }) + E(720, 120, '<span class="chip c">now MT <b>16</b></span>', { an: [A("pop", .4, 3.6)] }) +
      E(560, 290, '<span class="chip r">attack Total <b>14</b></span>', { an: [A("pop", .4, 1.2)] }) +
      E(860, 290, '<span class="chip c">Deflect <b>+4</b> → MT 16</span>', { an: [A("pop", .4, 2.6)] }) +
      E(520, 390, '<div class="stamp ok">MISS</div>', { an: [A("stamp", .5, 4.2)] }) },
  { dur: 9, say: "<b>Brace</b> halves Kinetic and Osmotic damage from one effect. <b>Shed</b> throws off a condition like Locked, Turgid or Marked.",
    html: E(160, 120, '<div class="card" style="width:430px"><div style="font:700 28px Georgia,serif;color:var(--acc)">Brace</div><div style="font:800 40px system-ui;margin-top:10px"><span style="animation:' + A("strike", .4, 1.4, "forwards") + ';display:inline-block">10</span> → <span style="color:var(--ok);display:inline-block;animation:' + A("pop", .4, 2) + '">5</span></div><div class="small">Kinetic damage, halved</div></div>', { an: [A("in", .5, .3)] }) +
      E(690, 120, '<div class="card" style="width:430px"><div style="font:700 28px Georgia,serif;color:var(--acc)">Shed</div><div style="margin-top:12px">' + ["Locked", "Turgid", "Marked"].map(function (c, i) { return S('<span class="chip r" style="margin:4px">' + c + "</span>", [A("strike", .4, 3.4 + i * .4, "forwards")]); }).join("") + "</div></div>", { an: [A("in", .5, 2.6)] }) },
  { dur: 10, say: "<b>Inhibition</b> strikes before the enemy's roll resolves: pay 3 ATP and your held PP, and the roll loses 2 dice — or you make them re-roll one 6.",
    html: diceRow([0, 0, 0, 0, 0], 130, function (i) { return i >= 3 ? [A("pop", .4, .2 + i * .1), A("out", .5, 2.6, "forwards")] : [A("pop", .4, .2 + i * .1)]; }) +
      E(0, 280, '<div class="t ctr">enemy pool <b>5</b> dice → <b style="color:var(--acc)">3</b> dice</div>', { w: 1280, an: [A("in", .4, 3)] }) +
      eqn(380, ['<span class="chip">3 ATP</span>', '<span class="op">+</span>', '<span class="chip c">1 held PP</span>', '<span class="op">=</span>', '<span class="res">−2 dice</span>'], 3.6, .3) },
  { dur: 7, say: "One reaction per Cycle — so decide early whether to hold that last Pulse Point.",
    html: recap([["🛡", "Hold 1 PP", "it buys one reaction per Cycle"], ["↗", "Deflect", "MT +4 against one attack"], ["⬇", "Brace / Shed", "halve force · end a condition"], ["✋", "Inhibition", "3 ATP + PP: their pool −2 dice"]]) }
], tryit: "react" });

/* ================================================================= 7 · OVERDRIVE */
LESSONS.push({ title: "Overdrive", short: "buying Reagents with ATP or MI", icon: "⚡", steps: [
  { dur: 9, say: "A Reagent is one die, and <b>Overdrive</b> is how you buy more before you roll: spend 4 ATP to add 2 Reagents.",
    html: E(240, 100, '<div class="lbl">ATP (energy)</div>', { an: [A("in", .4, .2)] }) +
      E(240, 135, '<div class="bar" style="width:800px"><div class="fill" style="--w:571px;background:linear-gradient(90deg,#b8a32a,#e8d94f);animation:' + A("shrink", 1, 1.4) + '"></div></div>', { an: [A("fade", .3, .2)] }) +
      E(1060, 138, '<div style="font:800 28px system-ui"><span style="display:inline-block;animation:' + A("strike", .3, 1.4, "forwards") + '">14</span> → 10</div>', { an: [A("fade", .3, .2)] }) +
      diceRow([0, 0, 0, 0, 0, 0], 270, function (i) { return i >= 4 ? [A("slide", .5, 2.4 + (i - 4) * .3)] : [A("fade", .3, .3)]; }) +
      E(0, 390, '<div class="t ctr">4 dice <span class="op">+</span> <span class="chip y"><b>+2</b> Reagents</span> <span class="op">=</span> 6 dice</div>', { w: 1280, an: [A("in", .4, 3.4)] }) },
  { dur: 9, say: "Or burn your own body: 4 MI for <b>4</b> extra Reagents — and you mark 1 Stress whatever happens.",
    html: E(240, 100, '<div class="lbl">Membrane Integrity (MI)</div>', { an: [A("in", .4, .2)] }) +
      E(240, 135, '<div class="bar" style="width:800px"><div class="fill" style="--w:672px;background:linear-gradient(90deg,#c0392b,#f07a7a);animation:' + A("shrink", 1, 1.4) + '"></div></div>', { an: [A("fade", .3, .2)] }) +
      E(1060, 138, '<div style="font:800 28px system-ui"><span style="display:inline-block;animation:' + A("strike", .3, 1.4, "forwards") + '">25</span> → 21</div>', { an: [A("fade", .3, .2)] }) +
      diceRow([0, 0, 0, 0, 0, 0, 0, 0], 260, function (i) { return i >= 4 ? [A("slide", .5, 2.4 + (i - 4) * .25)] : [A("fade", .3, .3)]; }, 80) +
      E(330, 400, '<div class="lbl">Stress</div>', { an: [A("in", .3, 3.6)] }) + boxes(8, 1, 4, .2, 430, 330) +
      E(820, 426, '<span class="chip r"><b>+1</b> Stress</span>', { an: [A("pop", .4, 4.4)] }) },
  { dur: 9, say: "Once per roll. Overdrive dice are not situational, so the ±5 cap does not touch them. At Stress 6 the ATP price rises to 5.",
    html: [["1×", "once per roll", "never twice on the same roll"], ["±5", "outside the cap", "they are bought, not situational"], ["+1", "Stress 6", "the ATP option costs 5"], ["3 / 3", "Overdrive Training", "an Adaptation: 3 ATP or 3 MI"]].map(function (r, i) {
      return E(100 + (i % 2) * 560, 110 + Math.floor(i / 2) * 200, '<div class="card" style="width:520px;height:170px"><div style="font:900 40px system-ui;color:var(--gold)">' + r[0] + '</div><div style="font:700 26px Georgia,serif">' + r[1] + '</div><div class="small">' + r[2] + "</div></div>", { an: [A("in", .5, .3 + i * .5)] }); }).join("") },
  { dur: 10, say: "That is the core of the Osmotic Expanse. Next: build an organism on the Char/Gen tab, and roll it on the Roll Helper.",
    html: E(0, 80, '<div class="big ctr">You know the core loop</div>', { w: 1280, an: [A("in", .6, .2)] }) +
      [["🎲", "The Roll"], ["▣", "Your Pool"], ["⏱", "Pulse Cycle"], ["⚔", "Attack"], ["⚠", "Stress"], ["🛡", "Reactions"], ["⚡", "Overdrive"]].map(function (r, i) {
        return E(70 + i * 165, 220, '<div class="card ctr" style="width:150px;height:150px"><div style="font-size:46px">' + r[0] + '</div><div style="font:700 19px Georgia,serif;margin-top:6px">' + r[1] + "</div></div>", { an: [A("pop", .45, 1 + i * .25)] }); }).join("") +
      E(0, 420, '<div class="t ctr">Next: <span class="chip c">Char/Gen</span> build an organism · <span class="chip c">Roll Helper</span> try a fight</div>', { w: 1280, an: [A("in", .5, 3.4)] }) }
], tryit: "overdrive" });
