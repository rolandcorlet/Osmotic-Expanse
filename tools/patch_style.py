"""Restyle the Roll Helper and Metabolic Time tabs (both apps). Re-runnable: replaces its own earlier output.
usage: python3 patch_style.py APP.html OUT.html"""
import sys, re, json, math, html as H
sys.path.insert(0, __import__("os").path.dirname(__import__("os").path.abspath(__file__)))
from content import ROWS, INTRO2, TIDES
src, dst = sys.argv[1:3]
h = open(src, encoding="utf-8").read()
assert '<style id="ox-style-rm">' not in h, "apply this to the app as it was before the restyle (git show c1246f4:<file>), not to its own output"

def rep(a, b, n=1):
    global h
    if b in h: return                     # already applied
    c = h.count(a)
    assert c == n, (a[:90], c)
    h = h.replace(a, b)

# ------------------------------------------------------------------ shared CSS
CSS = r"""
/* OSMOTIC STYLE: Roll Helper + Metabolic Time */
.rh-top{display:flex;flex-wrap:wrap;align-items:center;gap:14px;margin:4px 0 16px}
.rh-seg{display:inline-flex;background:var(--input);border:1px solid var(--line);border-radius:12px;padding:4px;gap:4px}
.rh-seg button{appearance:none;border:0;background:transparent;color:var(--dim);font:600 14px/1 system-ui,sans-serif;padding:10px 16px;border-radius:9px;cursor:pointer}
.rh-seg button[aria-pressed="true"]{background:var(--panel2);color:var(--ink);box-shadow:inset 0 0 0 1px var(--line)}
.rh-seg button:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.rh-rule{color:var(--dim);font-size:13.5px;max-width:62ch;line-height:1.45}
.rh-flow{display:grid;grid-template-columns:minmax(0,1fr) minmax(320px,420px);gap:22px;align-items:start}
.rh-flow>.rh-step{grid-column:1}
.rh-flow>.rh-final{grid-column:2;grid-row:1 / span 20;position:sticky;top:12px}
@media (max-width:1050px){.rh-flow{grid-template-columns:1fr}.rh-flow>.rh-final{grid-column:1;grid-row:auto;position:static}}
.rh-step{position:relative;display:grid;grid-template-columns:34px minmax(0,1fr);gap:14px;padding:0 0 18px}
.rh-step:not(.rh-final)::before{content:"";position:absolute;left:16px;top:36px;bottom:0;width:2px;background:var(--line)}
.rh-flow>.rh-step:nth-last-child(2)::before{display:none}
.rh-num{width:34px;height:34px;border-radius:50%;display:grid;place-items:center;font:700 15px/1 system-ui,sans-serif;color:var(--accent);background:var(--panel);border:2px solid var(--accent);position:relative;z-index:1}
.rh-body{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:14px 16px 12px;min-width:0}
.rh-body>h3{margin:0 0 10px;font:650 16.5px/1.3 system-ui,sans-serif;color:var(--ink);display:flex;align-items:center;gap:6px}
.rh-body .row{display:flex;flex-wrap:wrap;align-items:center;gap:8px 10px;margin:8px 0}
.rh-body .lbl{color:var(--dim);font-size:13px;min-width:0!important;margin-right:-2px}
.rh-body input[type=number]{width:62px;height:34px;border-radius:8px;border:1px solid var(--line);background:var(--input);color:var(--ink);font:600 15px/1 system-ui,sans-serif;font-variant-numeric:tabular-nums;padding:0 8px}
.rh-body select{height:36px;border-radius:8px;border:1px solid var(--line);background:var(--input);color:var(--ink);padding:0 10px;font:14px system-ui,sans-serif;max-width:100%}
.rh-body input:focus-visible,.rh-body select:focus-visible{outline:2px solid var(--accent);outline-offset:1px}
.rh-body label.small:has(input[type=checkbox]){display:inline-flex;align-items:center;gap:7px;padding:7px 12px;border:1px solid var(--line);border-radius:999px;background:var(--input);cursor:pointer;margin:0!important;font-size:13.5px;color:var(--ink)}
.rh-body label.small:has(input[type=checkbox]:checked){border-color:var(--accent);background:color-mix(in srgb,var(--accent) 18%,var(--input))}
.rh-body label.small input[type=checkbox]{accent-color:var(--accent);margin:0}
.rh-body .small{line-height:1.5}
.rh-body .rhi{background:transparent;border:0;color:var(--faint);cursor:pointer;font-size:14px;padding:2px}
.rh-body .rhi:hover{color:var(--accent)}
/* the pool panel */
.rh-final .rh-num{background:var(--accent);color:var(--bg)}
.rh-final .rh-body{display:flex;flex-direction:column;gap:10px;border-color:color-mix(in srgb,var(--accent) 45%,var(--line));box-shadow:0 18px 50px rgba(0,0,0,.35)}
.rh-final .rh-body>h3{order:0;margin-bottom:0}
.rh-hero{order:1}
.rh-final .rh-body>.row:has(input){order:2;margin:0}
.rh-final .rh-body>.row:has([data-rhroll]),.rh-final .rh-body>.row:has(.warnbox){order:3;margin:0}
.rh-final .rh-body>.promptbox{order:4}
.rh-final .rh-body>.rhf{order:5}
.rh-final .rh-body>.warnbox{order:3}
.rh-hero{display:grid;grid-template-columns:auto 1fr;gap:4px 16px;align-items:center;padding:14px;border-radius:12px;background:var(--input);border:1px solid var(--line)}
.rh-hero .n{font:800 52px/0.9 system-ui,sans-serif;font-variant-numeric:tabular-nums;color:var(--ink);letter-spacing:-1px}
.rh-hero .n small{font-size:20px;font-weight:700;color:var(--dim);letter-spacing:0;margin-left:2px}
.rh-hero .facts{display:grid;gap:3px;font-size:13.5px;color:var(--dim)}
.rh-hero .facts b{color:var(--ink);font-variant-numeric:tabular-nums}
.rh-hero .pips{grid-column:1 / -1;display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
.rh-ghost{width:26px;height:26px;border-radius:7px;border:2px dashed color-mix(in srgb,var(--accent) 60%,var(--line))}
.rh-final [data-rhroll]{width:100%;height:50px;font:700 17px/1 system-ui,sans-serif;border-radius:12px;background:var(--accent);color:var(--bg);border:0;cursor:pointer;letter-spacing:.2px}
.rh-final [data-rhroll]:hover{filter:brightness(1.08)}
.rh-final [data-rhroll]:focus-visible{outline:3px solid var(--ink);outline-offset:2px}
.rh-final .promptbox{border-radius:12px;border:1px solid var(--line);background:var(--panel2);padding:12px 14px;display:grid;gap:8px;font-size:14px}
.rh-final .promptbox .pill{font:700 14px/1.2 system-ui,sans-serif;padding:5px 11px;border-radius:999px;display:inline-block;margin:2px 4px 2px 0}
.rh-final .promptbox .pill.ok,.rh-final .promptbox .pill.no{font-size:16px;padding:7px 14px}
.rh-final .promptbox .btn.small{font:13px system-ui,sans-serif}
.rh-final .rhf{background:transparent;border:0;border-top:1px solid var(--line);border-radius:0;padding:10px 0 0;margin:0}
.rh-final .rhf h4{margin:0 0 6px;font:650 13.5px system-ui,sans-serif;color:var(--dim);text-transform:none;letter-spacing:0}
.rh-dice{display:flex;flex-wrap:wrap;gap:8px}
.rh-die{width:40px;height:40px;border-radius:9px;display:grid;place-items:center;font:800 20px/1 system-ui,sans-serif;font-variant-numeric:tabular-nums;background:var(--ink);color:var(--bg);box-shadow:inset 0 -3px 0 rgba(0,0,0,.25)}
.rh-die.one{background:color-mix(in srgb,var(--no) 30%,var(--panel2));color:var(--no);text-decoration:line-through;box-shadow:inset 0 0 0 2px var(--no)}
.rh-die.six{background:var(--ok);color:var(--bg)}
.rh-dice.fresh .rh-die{animation:rhTumble .5s cubic-bezier(.2,.9,.3,1.2) both}
.rh-dice.fresh .rh-die:nth-child(2){animation-delay:.04s}.rh-dice.fresh .rh-die:nth-child(3){animation-delay:.08s}.rh-dice.fresh .rh-die:nth-child(4){animation-delay:.12s}
.rh-dice.fresh .rh-die:nth-child(5){animation-delay:.16s}.rh-dice.fresh .rh-die:nth-child(6){animation-delay:.2s}.rh-dice.fresh .rh-die:nth-child(n+7){animation-delay:.24s}
@keyframes rhTumble{from{transform:translateY(-14px) rotate(-90deg) scale(.6);opacity:0}to{transform:none;opacity:1}}
@media (prefers-reduced-motion:reduce){.rh-dice.fresh .rh-die{animation:none}}

/* Metabolic Time */
.mtx{--salt:var(--warn-c);--water:var(--accent);max-width:1180px}
.mtx-hero{background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:20px 22px 10px;margin:0 0 18px}
.mtx-hero h3{margin:0;font:700 22px/1.25 system-ui,sans-serif;color:var(--ink)}
.mtx-hero p{margin:6px 0 0;color:var(--dim);max-width:72ch;line-height:1.55;font-size:14.5px}
.mtx-hero p b{color:var(--ink)}
.mtx-scalewrap{overflow-x:auto;margin-top:8px}
.mtx-scale{width:100%;min-width:760px;height:auto;display:block}
.mtx-scale text{font-family:system-ui,sans-serif}
.mtx-sec{margin:0 0 18px}
.mtx-sec>h3{font:700 17px/1.3 system-ui,sans-serif;margin:0 0 4px;color:var(--ink)}
.mtx-sec>.sub{color:var(--dim);font-size:13.5px;margin:0 0 10px}
.mtx-units{display:grid;gap:8px}
.mtx-unit{display:grid;grid-template-columns:200px minmax(0,1fr);gap:18px;background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:12px 16px}
.mtx-unit .nm{font:700 15.5px/1.25 system-ui,sans-serif;color:var(--ink)}
.mtx-unit .len{color:var(--accent);font:600 13.5px/1.4 system-ui,sans-serif;font-variant-numeric:tabular-nums;margin-top:3px}
.mtx-unit .felt{color:var(--dim);font-size:13px;margin-top:2px}
.mtx-unit .made{color:var(--dim);font-size:13px;margin-bottom:4px}
.mtx-unit .gov{color:var(--ink);font-size:14px;line-height:1.5}
.mtx-unit.app{border-style:dashed}
.mtx-unit.app .nm::after{content:" app calendar";font:600 11px system-ui,sans-serif;color:var(--faint);margin-left:6px}
@media (max-width:760px){.mtx-unit{grid-template-columns:1fr;gap:6px}}
.mtx-tbl{width:100%;border-collapse:separate;border-spacing:0;background:var(--panel);border:1px solid var(--line);border-radius:12px;overflow:hidden;font-size:14px}
.mtx-tbl th{font:600 12.5px system-ui,sans-serif;color:var(--dim);text-align:right;padding:10px 14px;border-bottom:1px solid var(--line);background:var(--panel2)}
.mtx-tbl th:first-child,.mtx-tbl td:first-child{text-align:left}
.mtx-tbl td{padding:9px 14px;border-bottom:1px solid color-mix(in srgb,var(--line) 60%,transparent);text-align:right;font-variant-numeric:tabular-nums;color:var(--ink)}
.mtx-tbl tr:last-child td{border-bottom:0}
.mtx-tbl td:first-child{font-weight:650}
.mtx-tbl td.note{color:var(--dim);font-size:12.5px}
.mtx-phases{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
@media (max-width:980px){.mtx-phases{grid-template-columns:repeat(2,minmax(0,1fr))}}
.mtx-ph{position:relative;border-radius:14px;padding:14px 16px 16px;border:1px solid var(--line);background:var(--panel)}
.mtx-ph .ord{font:700 12.5px system-ui,sans-serif;color:var(--dim)}
.mtx-ph h4{margin:4px 0 2px;font:700 16px/1.25 system-ui,sans-serif;color:var(--ink)}
.mtx-ph .plain{font-size:13px;color:var(--dim);margin-bottom:10px}
.mtx-ph .tr{font-size:13px;color:var(--dim)}
.mtx-ph .tbl-eff{font-size:14px;color:var(--ink);line-height:1.5;margin-top:4px}
.mtx-ph.salt{border-color:color-mix(in srgb,var(--salt) 55%,var(--line));background:color-mix(in srgb,var(--salt) 9%,var(--panel))}
.mtx-ph.salt .plain{color:var(--salt)}
.mtx-ph.water{border-color:color-mix(in srgb,var(--water) 55%,var(--line));background:color-mix(in srgb,var(--water) 9%,var(--panel))}
.mtx-ph.water .plain{color:var(--water)}
.mtx-ph:not(:last-child)::after{content:"";position:absolute;right:-11px;top:50%;width:10px;height:10px;border-top:2px solid var(--faint);border-right:2px solid var(--faint);transform:translateY(-50%) rotate(45deg)}
@media (max-width:980px){.mtx-ph::after{display:none}}
.mtx-ladder{display:grid;gap:6px}
.mtx-rung{display:grid;grid-template-columns:minmax(0,1.4fr) minmax(0,1fr) minmax(0,1.6fr);gap:14px;align-items:center;background:var(--panel);border:1px solid var(--line);border-left:4px solid var(--ok);border-radius:10px;padding:10px 14px;font-size:14px}
.mtx-rung b{color:var(--ink)}
.mtx-rung .t{color:var(--accent);font-variant-numeric:tabular-nums}
.mtx-rung .c{color:var(--dim)}
@media (max-width:760px){.mtx-rung{grid-template-columns:1fr;gap:2px}}
.mtx-notes{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
@media (max-width:860px){.mtx-notes{grid-template-columns:1fr}}
.mtx-note{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:12px 16px;font-size:14px;line-height:1.55;color:var(--dim)}
.mtx-note b{color:var(--ink);display:block;margin-bottom:2px}

/* fit to the window: the page never scrolls on these tabs; long parts scroll inside their own panel */
.rh-flow.ox-fit{grid-template-rows:minmax(0,1fr);overflow:hidden}
.rh-steps{grid-column:1;overflow:auto;height:100%;padding-right:8px;scrollbar-gutter:stable;min-height:0}
.rh-steps>.rh-step:last-child::before{display:none}
.rh-flow>.rh-final{grid-column:2;grid-row:1;position:static;height:100%;overflow:auto;padding-bottom:0}
.rh-flow>.rh-final .rh-body{min-height:0}
@media (max-width:1050px){.rh-steps,.rh-flow>.rh-final{height:auto;overflow:visible}.rh-flow.ox-fit{height:auto!important;overflow:visible}}
.rh-step{padding-bottom:12px}
.rh-body{padding:11px 14px 9px}
.rh-body>h3{margin-bottom:6px;font-size:15.5px}
.rh-body .row{margin:5px 0}
.rh-top{margin:0 0 10px}
.rh-hero .n{font-size:44px}
.rh-final [data-rhroll]{height:44px}
.mtx.ox-fit{display:flex;flex-direction:column;gap:10px;max-width:none;min-height:0}
.mtx .mtx-hero{flex:0 0 auto;margin:0;padding:12px 18px 4px}
.mtx .mtx-hero h3{font-size:18px}
.mtx .mtx-hero p{font-size:13.5px;margin-top:3px;max-width:none}
.mtx .mtx-scale{max-height:150px}
.mtx-tabs{flex:0 0 auto;display:flex;flex-wrap:wrap;gap:6px}
.mtx-tabs button{appearance:none;border:1px solid var(--line);background:var(--panel);color:var(--dim);font:600 13.5px/1 system-ui,sans-serif;padding:9px 14px;border-radius:999px;cursor:pointer}
.mtx-tabs button[aria-pressed="true"]{background:var(--accent);border-color:var(--accent);color:var(--bg)}
.mtx-tabs button:focus-visible{outline:2px solid var(--ink);outline-offset:2px}
.mtx-pane{flex:1 1 auto;min-height:0;overflow:auto;padding-right:6px;scrollbar-gutter:stable}
.mtx-pane>.mtx-sec{margin:0}
.mtx-pane>.mtx-sec[hidden]{display:none}
.mtx-units{grid-template-columns:repeat(2,minmax(0,1fr))}
@media (max-width:1100px){.mtx-units{grid-template-columns:1fr}}
.mtx-unit{grid-template-columns:150px minmax(0,1fr);padding:10px 14px;gap:12px}

/* Roll Helper, no scrolling: the steps sit side by side as compact cards, three across */
@media (min-width:1051px){
.rh-steps{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));grid-auto-rows:minmax(0,1fr);gap:10px;overflow:hidden;padding-right:0;scrollbar-gutter:auto}
.rh-steps>.rh-step{display:block;padding:0;min-height:0;overflow:hidden}
.rh-steps>.rh-step::before{display:none}
.rh-steps .rh-num{position:absolute;top:10px;left:11px;width:22px;height:22px;font-size:12px;border-width:1.5px}
.rh-steps .rh-body{height:100%;overflow:auto;padding:8px 10px 5px;border-radius:12px;scrollbar-width:thin}
.rh-steps .rh-body>h3{padding-left:28px;font-size:14.5px;margin:1px 0 6px;min-height:22px}
.rh-steps .rh-body .row{gap:5px 7px;margin:4px 0}
.rh-steps .rh-body .lbl{font-size:12px}
.rh-steps .rh-body input[type=number]{width:46px;height:28px;font-size:13.5px;padding:0 5px;border-radius:6px}
.rh-steps .rh-body select{height:30px;font-size:13px;padding:0 6px;max-width:100%}
.rh-steps .rh-body label.small:has(input[type=checkbox]){padding:4px 9px;font-size:12.5px}
.rh-steps .rh-body .small{font-size:12.5px;line-height:1.4}
.rh-steps .rh-body .rhi{font-size:12px;padding:0 1px}
.rh-steps .rh-step:has(#ra-od) .rh-body>.small:not(.warnbox){display:none}
.rh-flow{grid-template-columns:minmax(0,1fr) minmax(300px,360px);gap:14px}
.rh-flow>.rh-final{overflow:hidden;display:block}
.rh-flow>.rh-final .rh-body{height:100%;overflow:auto;gap:8px;padding:10px 12px;scrollbar-width:thin}
.rh-final .rh-num{display:none}
.rh-final .rh-body>h3{font-size:15px}
.rh-hero{padding:10px 12px}
.rh-hero .n{font-size:40px}
.rh-ghost{width:20px;height:20px;border-radius:5px}
.rh-hero .pips{margin-top:4px;gap:5px}
.rh-final [data-rhroll]{height:42px;font-size:16px}
.rh-final .promptbox{padding:9px 11px;gap:5px;font-size:13px}
.rh-die{width:34px;height:34px;font-size:17px;border-radius:8px}
.rh-final .promptbox .pill.ok,.rh-final .promptbox .pill.no{font-size:15px;padding:5px 12px}
}

@media (min-width:1051px){
.rh-steps{grid-template-columns:repeat(4,minmax(0,1fr));grid-template-rows:repeat(2,minmax(0,1fr));grid-auto-rows:0}
.rh-steps.attack>.rh-step:nth-child(1){grid-column:1 / 3;grid-row:1}
.rh-steps.attack>.rh-step:nth-child(2){grid-column:3;grid-row:1}
.rh-steps.attack>.rh-step:nth-child(5){grid-column:4;grid-row:1}
.rh-steps.attack>.rh-step:nth-child(3){grid-column:1 / 4;grid-row:2}
.rh-steps.attack>.rh-step:nth-child(4){grid-column:4;grid-row:2}
.rh-steps.defence>.rh-step:nth-child(1){grid-column:1 / 3;grid-row:1}
.rh-steps.defence>.rh-step:nth-child(2){grid-column:3 / 5;grid-row:1}
.rh-steps.defence>.rh-step:nth-child(3){grid-column:1 / 3;grid-row:2}
.rh-steps.defence>.rh-step:nth-child(4){grid-column:3 / 5;grid-row:2}
.rh-final:has(.promptbox) .rh-hero .pips{display:none}
.rh-final:has(.promptbox) .rh-hero{padding:6px 12px}
.rh-final:has(.promptbox) .rh-hero .n{font-size:30px}
.rh-final .promptbox .small{font-size:12px}
.rh-final .rh-body>.row:has(input) .lbl{font-size:12px}
.rh-final .rh-body>.row:has(input) input[type=number]{width:48px;height:28px}
}
.featcheck.rh-head{align-items:center;padding-bottom:8px;margin-bottom:10px}
.rh-head .rh-top{flex:1 1 auto;margin:0 0 0 8px;gap:10px}
.rh-head .rh-seg button{padding:8px 14px;font-size:13.5px}
.rh-rule{cursor:help;font-size:13px;color:var(--dim);border-bottom:1px dotted var(--faint)}
.rh-rule:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
@media (min-width:1051px){
.rh-flow{grid-template-columns:minmax(0,1fr) minmax(290px,330px)}
.rh-steps .rh-step:has([id$="-who"]) .rh-body>.row>.lbl:first-child:not(:only-child){position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
.rh-steps .rh-step:has([id$="-who"]) .rh-body>.row:first-of-type>.lbl:first-child{position:static;width:auto;height:auto;clip:auto}
.rh-steps .rh-step:has(#ra-weapon) .rh-body>.small.dim{display:none}
.rh-final:has(.promptbox) .rh-hero{display:none}
.rh-steps .rh-body>h3{margin-bottom:4px}
.rh-steps{gap:8px}
}
.rh-top{position:relative}
.rh-log{margin-left:auto;position:relative;font-size:13px}
.rh-log>summary{cursor:pointer;color:var(--dim);padding:8px 12px;border:1px solid var(--line);border-radius:999px;list-style:none;background:var(--panel)}
.rh-log>summary::-webkit-details-marker{display:none}
.rh-log[open]>summary{color:var(--ink);border-color:var(--accent)}
.rh-log>.log{position:absolute;right:0;top:calc(100% + 6px);z-index:20;width:min(560px,80vw);max-height:50vh;overflow:auto;background:var(--panel2);border:1px solid var(--line);border-radius:12px;padding:10px 12px;box-shadow:0 18px 50px rgba(0,0,0,.45);font-size:13px;line-height:1.5}
.rh-final .rhf h4{cursor:pointer;user-select:none;display:flex;align-items:center;gap:6px;margin:0}
.rh-final .rhf h4::before{content:"\25B8";color:var(--accent);transition:transform .15s}
.rh-final.eq-open .rhf h4::before{transform:rotate(90deg)}
.rh-final:not(.eq-open) .rhf>:not(h4){display:none}
.rh-final .rhf h4:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
"""
h = re.sub(r'<style id="ox-style-rm">.*?</style>\n?', "", h, flags=re.S)
i = h.find("</head>"); assert i > 0
h = h[:i] + '<style id="ox-style-rm">' + CSS + "</style>\n" + h[i:]

# ------------------------------------------------------------------ Roll Helper
rep('''  function rhStep(n, title, body) {
    return '<div class="subgroup" style="margin:8px 0"><div class="row"><span class="pill info" style="min-width:26px;text-align:center">' + n + "</span><b>" + title + "</b></div>" + body + "</div>";
  }''',
'''  function rhStep(n, title, body) {
    var fin = title === "Your pool, and the roll" || title === "Resolve it";
    return '<section class="rh-step' + (fin ? " rh-final" : "") + '"><div class="rh-num" aria-hidden="true">' + n + '</div><div class="rh-body"><h3>' + title + "</h3>" + (fin ? "<!--RHHERO-->" : "") + body + "</div></section>";
  }
  var RH_FRESH = 0;
  function rhHero(mode) {
    var S = mode === "defence" ? RH_LAST._defenceSetup : RH_LAST._attackSetup; if (!S) return "";
    var n = S.pool || 0, ghosts = "";
    for (var i = 0; i < Math.min(n, 16); i++) ghosts += '<span class="rh-ghost"></span>';
    if (mode === "defence") {
      return '<div class="rh-hero"><div class="n">' + (S.how === "typed" ? "—" : n + "<small>d6</small>") + '</div><div class="facts"><span>' + (S.how === "typed" ? "the Director gives its Total" : "the attacker rolls") +
        "</span><span>it must reach your MT <b>" + S.mt + "</b></span><span>reacting costs <b>" + (S.pp ? S.pp + " held PP" : "nothing") + (S.atp ? " + " + S.atp + " ATP" : "") + "</b></span></div>" +
        (S.how === "typed" ? "" : '<div class="pips" aria-hidden="true">' + ghosts + "</div>") + "</div>";
    }
    return '<div class="rh-hero"><div class="n">' + n + '<small>d6</small></div><div class="facts"><span>your Reagent Pool</span><span>hit on a Total of <b>' + S.mt + "</b> or more</span><span>costs <b>" + S.pp + " PP" +
      (S.atp ? " + " + S.atp + " ATP" : "") + (S.miCost ? " + MI" : "") + "</b></span></div>" + '<div class="pips" aria-hidden="true">' + ghosts + "</div></div>";
  }''')
rep('''  function rhDiceHtml(dice) {
    return dice.map(function (v) {
      return '<span style="display:inline-block;min-width:26px;padding:3px 6px;margin:2px;border-radius:5px;text-align:center;font-weight:700;' +
        (v === 1 ? "background:#4a1f22;color:#ffb3b3;text-decoration:line-through" : v === 6 ? "background:#1e3a2a;color:#9ff0c0" : "background:#22303d;color:#dfe8f0") + '">' + v + "</span>";
    }).join("");
  }''',
'''  function rhDiceHtml(dice) {
    var fresh = Date.now() - RH_FRESH < 900;
    return '<span class="rh-dice' + (fresh ? " fresh" : "") + '" role="img" aria-label="Rolled ' + dice.join(", ") + '">' + dice.map(function (v) {
      return '<span class="rh-die' + (v === 1 ? " one" : v === 6 ? " six" : "") + '" aria-hidden="true">' + v + "</span>";
    }).join("") + "</span>";
  }''')
OLD_FLOW = '''    out += '<div class="rh-flow">' + flow.replace("<!--RHHERO-->", rhHero(mode)) + "</div>";'''
NEW_FLOW = '''    flow = flow.replace("<!--RHHERO-->", rhHero(mode));
    var cut = flow.indexOf('<section class="rh-step rh-final"');
    out += '<div class="rh-flow ox-fit"><div class="rh-steps ' + mode + '" data-oxkeep="rh-steps-' + mode + '">' + flow.slice(0, cut) + "</div>" + flow.slice(cut).replace('<section class="rh-step rh-final"', '<section data-oxkeep="rh-final-' + mode + '" class="rh-step rh-final"') + "</div>";'''
if OLD_FLOW in h: h = h.replace(OLD_FLOW, NEW_FLOW)
# the roll log: from below the steps into the top bar
h = h.replace("""<span class="rh-rule">A roll is a pool of d6. Every 1 scores nothing and marks 1 Stress; the rest add up to your Total. Reach the target number to succeed; the extra is Overflow (CORE §1.1).</span></div>';""",
              """<span class="rh-rule">A roll is a pool of d6. Every 1 scores nothing and marks 1 Stress; the rest add up to your Total. Reach the target number to succeed; the extra is Overflow (CORE §1.1).</span><!--RHLOG--></div>';""")
h = h.replace("""<div class="rh-flow ox-fit"><div class="rh-steps" data-oxkeep=""", """<div class="rh-flow ox-fit"><div class="rh-steps ' + mode + '" data-oxkeep=""")
rep('''    out += '<div class="row">' + '<button class="btn ' + (mode === "attack" ? "primary" : "small") + '" type="button" data-rhmode="attack">⚔ I am attacking</button>' +
      '<button class="btn ' + (mode === "defence" ? "primary" : "small") + '" type="button" data-rhmode="defence">🛡 I am being attacked</button>' +
      '<span class="small dim">A roll is a pool of d6: 1s score nothing and mark 1 Stress each; the rest add up; reach the target number to succeed; the extra is Overflow (CORE §1.1).</span></div>';
    out += mode === "defence" ? rhDefence() : rhAttack();''',
'''    out += '<div class="rh-top"><div class="rh-seg" role="group" aria-label="Which roll">' +
      '<button type="button" data-rhmode="attack" aria-pressed="' + (mode === "attack") + '">⚔ I am attacking</button>' +
      '<button type="button" data-rhmode="defence" aria-pressed="' + (mode === "defence") + '">🛡 I am being attacked</button></div>' +
      '<span class="rh-rule">A roll is a pool of d6. Every 1 scores nothing and marks 1 Stress; the rest add up to your Total. Reach the target number to succeed; the extra is Overflow (CORE §1.1).</span><!--RHLOG--></div>';
    var flow = mode === "defence" ? rhDefence() : rhAttack();
    flow = flow.replace("<!--RHHERO-->", rhHero(mode));
    var cut = flow.indexOf('<section class="rh-step rh-final"');
    out += '<div class="rh-flow ox-fit"><div class="rh-steps ' + mode + '" data-oxkeep="rh-steps-' + mode + '">' + flow.slice(0, cut) + "</div>" + flow.slice(cut).replace('<section class="rh-step rh-final"', '<section data-oxkeep="rh-final-' + mode + '" class="rh-step rh-final"') + "</div>";''')

rep('''      var dice = rhDice(S0.pool), r = rhRead(dice);''', '''      var dice = rhDice(S0.pool), r = rhRead(dice); RH_FRESH = Date.now();''')
rep('''      else { L.dice = rhDice(D0.pool); var rr = rhRead(L.dice); L.total = rr.total; }''', '''      else { L.dice = rhDice(D0.pool); var rr = rhRead(L.dice); L.total = rr.total; RH_FRESH = Date.now(); }''')

rep("""    if (log.length) out += '<details class="subgroup"><summary>Recent rolls (' + log.length + ")</summary><div class=\\"log\\">" + log.slice().reverse().map(function (l) { return "<div>" + esc(l) + "</div>"; }).join("") + "</div></details>";""",
    """    out = out.replace("<!--RHLOG-->", log.length ? '<details class="rh-log"><summary>Recent rolls (' + log.length + ")</summary><div class=\\"log\\">" + log.slice().reverse().map(function (l) { return "<div>" + esc(l) + "</div>"; }).join("") + "</div></details>" : "");""")
rep('out += rhStep(4, "Buy Reagents? (Overdrive — extra dice for ATP or MI) " + rhI("od"), odb);', 'out += rhStep(4, "Buy extra dice? (Overdrive) " + rhI("od"), odb);')

# ---- compact: the switch joins the title line; shorter labels and result text
rep("""    var out = '<div class="featcheck"><h2>Roll Helper</h2><span class="badge">step by step</span>' +
      '<span class="cite">build a Reagent Pool for an attack or a defence, see what every choice costs, then roll</span>' + dmflag() + "</div>";""",
    """    var out = '<div class="featcheck rh-head"><h2>Roll Helper</h2>' + dmflag() + "<!--RHTOP--></div>";""")
h = h.replace("""    out += '<div class="rh-top"><div class="rh-seg\"""", """    out = out.replace("<!--RHTOP-->", '<div class="rh-top"><div class="rh-seg\"""")
h = h.replace("""<span class="rh-rule">A roll is a pool of d6. Every 1 scores nothing and marks 1 Stress; the rest add up to your Total. Reach the target number to succeed; the extra is Overflow (CORE §1.1).</span><!--RHLOG--></div>';""",
              """<span class="rh-rule" tabindex="0" title="A roll is a pool of d6. Every 1 scores nothing and marks 1 Stress; the rest add up to your Total. Reach the target number to succeed; the extra is Overflow (CORE §1.1).">ⓘ how a roll works</span><!--RHLOG--></div>');""")
rep('rhChk("ra-deflect", "it Deflects (Reactive Osmosis: its MT +4)")', 'rhChk("ra-deflect", "it Deflects (MT +4)")')
rep('rhChk("ra-odtrain", "has the Overdrive Training Adaptation (Overdrive costs 3 ATP / 3 MI, ATLAS §4.2)")', 'rhChk("ra-odtrain", "has Overdrive Training (costs 3)")')
rep('"<div>Total <b>" + L.total + "</b> (the dice that are not 1s, added up) vs Membrane Threshold (MT) " + L.mt + " → "', '"<div>Total <b>" + L.total + "</b> vs MT " + L.mt + " "')
rep(""""<div>Attacker's Total <b>" + L.total + "</b> vs your Membrane Threshold (MT) " + L.mt + " → \"""", """"<div>Its Total <b>" + L.total + "</b> vs your MT " + L.mt + " \"""")

# ------------------------------------------------------------------ BitSight: one-line intro; the reader fills the window
h = re.sub(r"(function screenBitSight\(\) \{\n    return '<div class=\"featcheck\"><h2>BitSight RSVP</h2><span class=\"badge\">speed reader</span>' \+\n)      '<span class=\"cite\">.*?\n  \}",
           lambda m: m.group(1) + "      '<span class=\"cite\">the books are in its library (\\u2630); your places and bookmarks are kept in this browser</span>' + dmflag() + \"</div>\";\n  }", h, count=1, flags=re.S)
assert "your places and bookmarks are kept in this browser" in h, "bitsight intro"
rep('''fr.style.cssText = "width:100%;height:calc(100vh - 120px);min-height:560px;border:1px solid var(--line);border-radius:8px;background:#111";''',
    '''fr.style.cssText = "width:100%;height:calc(100vh - 150px);min-height:380px;border:1px solid var(--line);border-radius:8px;background:#111;display:block";''')

FIT = r"""
/* OSMOTIC FIT: Roll Helper, Metabolic Time and BitSight fill the window exactly, so nothing on them is ever below the fold.
   Long parts scroll inside their own panel, and keep their place when the screen is redrawn. */
(function () {
  var keep = {}, MIN = 260;
  function mtShow(sel) {
    var root = document.querySelector(".mtx"); if (!root) return;
    [].forEach.call(root.querySelectorAll("[data-mt]"), function (s) { s.hidden = s.getAttribute("data-mt") !== sel; });
    [].forEach.call(root.querySelectorAll("[data-mtsel]"), function (b) { b.setAttribute("aria-pressed", b.getAttribute("data-mtsel") === sel ? "true" : "false"); });
  }
  function size(el) {
    if (!el || !el.getClientRects().length) return;
    if (el.classList.contains("rh-flow") && window.innerWidth <= 1050) { el.style.height = ""; return; }
    var top = el.getBoundingClientRect().top + (window.scrollY || 0), h = Math.max(MIN, Math.floor(window.innerHeight - top - 14));
    el.style.height = h + "px"; el.style.minHeight = "0";
    var over = document.documentElement.scrollHeight - window.innerHeight;
    if (over > 0 && h - over >= MIN) el.style.height = (h - over) + "px";
  }
  function fit() {
    [].forEach.call(document.querySelectorAll(".ox-fit"), size);
    var bs = document.getElementById("bitsight-frame"); if (bs && bs.offsetParent) size(bs);
    [].forEach.call(document.querySelectorAll("[data-oxkeep]"), function (el) { var k = el.getAttribute("data-oxkeep"); if (keep[k] != null && el.scrollTop !== keep[k]) el.scrollTop = keep[k]; });
    if (document.querySelector(".mtx")) mtShow(window.__mtSel || "units");
    [].forEach.call(document.querySelectorAll(".rh-final"), function (f) {
      f.classList.toggle("eq-open", !!window.__rhEq);
      var h4 = f.querySelector(".rhf h4"); if (h4 && !h4.hasAttribute("tabindex")) { h4.setAttribute("tabindex", "0"); h4.setAttribute("role", "button"); }
      if (h4) h4.setAttribute("aria-expanded", window.__rhEq ? "true" : "false");
    });
  }
  document.addEventListener("scroll", function (e) { var el = e.target; if (el && el.getAttribute && el.getAttribute("data-oxkeep")) keep[el.getAttribute("data-oxkeep")] = el.scrollTop; }, true);
  document.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("[data-mtsel]");
    if (b) { window.__mtSel = b.getAttribute("data-mtsel"); keep["mtx-pane"] = 0; mtShow(window.__mtSel); var p = document.querySelector(".mtx-pane"); if (p) p.scrollTop = 0; return; }
    if (e.target.closest && e.target.closest(".rh-final .rhf h4")) { window.__rhEq = !window.__rhEq; fit(); return; }
    if (e.target.closest && e.target.closest('[data-act="tab"]')) { setTimeout(fit, 30); setTimeout(fit, 250); }
  });
  document.addEventListener("keydown", function (e) { if ((e.key === "Enter" || e.key === " ") && e.target.closest && e.target.closest(".rh-final .rhf h4")) { e.preventDefault(); window.__rhEq = !window.__rhEq; fit(); } });
  window.addEventListener("resize", function () { requestAnimationFrame(fit); });
  try { new MutationObserver(function (ms) {
    for (var i = 0; i < ms.length; i++) if (ms[i].addedNodes.length) { fit(); return; }
  }).observe(document.body, { childList: true, subtree: true }); } catch (e) {}
  setTimeout(fit, 300);
})();
"""
h = re.sub(r'<script id="ox-fit-js">.*?</script>\n?', "", h, flags=re.S)
j = h.rfind("</body>"); assert j > 0
h = h[:j] + '<script id="ox-fit-js">' + FIT + "</script>\n" + h[j:]

# ------------------------------------------------------------------ Metabolic Time
def mdi(s): return re.sub(r"\*([^*]+)\*", r"<i>\1</i>", re.sub(r"\*\*([^*]+)\*\*", r"<b>\1</b>", s))
rows = [r[:] for r in ROWS]
rows.insert(7, ["Pulse Ten", "10 Beats", "10 Beats, labelled Beat 1–10", "a week", "The app's calendar only: the books name no week. Three Pulse Tens fill a Drift Season."])

# the scale: every unit placed by its length in seconds, on a log axis
SC = [("Pulse Cycle", 6, "6 s"), ("Fugue Interval", 3600, "~1 hour"), ("Dormant Cycle", 21600, "6 hours"), ("Beat", 86400, "~1 day"),
      ("Pulse Ten", 864000, "10 days"), ("Drift Season", 2592000, "~30 days"), ("Osmotic Tide", 10368000, "~120 days"), ("Great Cycle", 165888000, "16 Tides")]
JUMP = ["×600", "×6", "×4", "×10", "×3", "×4", "×16"]
W, X0, X1 = 1100, 60, 1040
lo, hi = math.log10(6), math.log10(165888000)
X = lambda s: X0 + (math.log10(s) - lo) / (hi - lo) * (X1 - X0)
svg = ['<svg class="mtx-scale" viewBox="0 0 %d 150" role="img" aria-label="Every unit of Metabolic Time on one scale, from the 6-second Pulse Cycle to the Great Cycle of 16 Tides">' % W,
       '<line x1="%d" y1="74" x2="%d" y2="74" stroke="var(--line)" stroke-width="3" stroke-linecap="round"/>' % (X0, X1)]
for k, (n, s, l) in enumerate(SC):
    x = X(s); up = k % 2 == 0
    big = n in ("Pulse Cycle", "Beat", "Osmotic Tide", "Great Cycle")
    svg.append('<circle cx="%.1f" cy="74" r="%d" fill="%s" stroke="var(--accent)" stroke-width="2.5"/>' % (x, 8 if big else 6, "var(--accent)" if big else "var(--panel)"))
    ty = 40 if up else 112
    svg.append('<line x1="%.1f" y1="%d" x2="%.1f" y2="%d" stroke="var(--line)" stroke-width="1.5"/>' % (x, 66 if up else 82, x, 48 if up else 100))
    anchor = "start" if k == 0 else "end" if k == len(SC) - 1 else "middle"
    svg.append('<text x="%.1f" y="%d" text-anchor="%s" font-size="15" font-weight="700" fill="var(--ink)">%s</text>' % (x, ty - (14 if up else -4), anchor, H.escape(n)))
    svg.append('<text x="%.1f" y="%d" text-anchor="%s" font-size="12.5" fill="var(--dim)">%s</text>' % (x, ty + (2 if up else 22), anchor, H.escape(l)))
for k in range(len(SC) - 1):
    xm = (X(SC[k][1]) + X(SC[k + 1][1])) / 2
    if X(SC[k + 1][1]) - X(SC[k][1]) > 46:
        svg.append('<text x="%.1f" y="%d" text-anchor="middle" font-size="11.5" font-weight="600" fill="var(--accent)">%s</text>' % (xm, 70 if k % 2 else 90, JUMP[k]))
svg.append('<text x="%d" y="146" font-size="11.5" fill="var(--faint)">Each step to the right is a longer unit; the gaps show how many of one fit into the next (log scale).</text>' % X0)
svg.append("</svg>")

units = "".join('<div class="mtx-unit%s"><div><div class="nm">%s</div><div class="len">%s</div><div class="felt">felt as %s</div></div><div><div class="made">%s</div><div class="gov">%s</div></div></div>' %
                (" app" if r[0] == "Pulse Ten" else "", H.escape(r[0]), H.escape(r[1]), H.escape(r[3]), ("made of " + H.escape(r[2])) if r[2] not in ("—", "") else "the smallest unit", mdi(H.escape(r[4], quote=False)))
                for r in rows)
CONVT = [["1 minute", "10", "", ""], ["1 Fugue Interval", "600", "1", "1⁄24"], ["1 Dormant Cycle", "3,600", "6", "¼"],
         ["1 Metabolic Beat", "14,400", "24", "1"], ["1 Pulse Ten (app)", "144,000", "240", "10"], ["1 Drift Season", "432,000", "720", "30"],
         ["1 Osmotic Tide", "1,728,000", "2,880", "120"], ["1 Great Cycle", "27,648,000", "46,080", "1,920"]]
conv = '<table class="mtx-tbl"><tr><th>One…</th><th>Pulse Cycles</th><th>Fugue Intervals</th><th>Beats</th></tr>' + "".join(
    "<tr>" + "".join("<td>%s</td>" % H.escape(c) for c in r) + "</tr>" for r in CONVT) + '<tr><td class="note" colspan="4">The Codex prints “~1,900 Beats” for a Great Cycle; 16 × 4 × 30 makes it 1,920.</td></tr></table>'
PH = [("Isotonic Rise", "the gentle season", "", "neutral → slightly hypertonic", "travel is cheap; healing normal; PP full"),
      ("Hypertonic Zenith", "the salty season", "salt", "all regions hypertonic", "DFF pools −2, PP −1, Drift +1 PP, healing halved, VSC +2"),
      ("Isotonic Fall", "the funeral season", "", "neutral → slightly hypotonic", "regeneration strengthens; Harvest yields +1 grade"),
      ("Hypotonic Zenith", "the watery season", "water", "all regions hypotonic", "DFF +2, PP +1, MT −2, Turgid on heavy hits")]
phases = '<div class="mtx-phases">' + "".join('<div class="mtx-ph %s"><div class="ord">%d of 4</div><h4>%s</h4><div class="plain">%s</div><div class="tr">regions: %s</div><div class="tbl-eff">%s</div></div>' % (c, i + 1, n, p, H.escape(t), H.escape(e))
                                            for i, (n, p, c, t, e) in enumerate(PH)) + "</div>"
REC = [["A quiet Cycle", "no ATP spent, no damage taken", "1 Cycle", "−1 Stress"], ["Vent", "", "1 PP in combat (2 ATP)", "−2 Stress"],
       ["Chemotactic Rite", "a shared meal", "1 Fugue Interval (3 Substrate each)", "all Stress and +2 Cohesion (CORE §5.8, §11.6)"],
       ["Reconstitution", "short rest", "1 Fugue Interval", "all Stress, full ATP, heal VSC + Hull MI"],
       ["Dormant Cycle", "long rest", "6 hours", "full MI, Lysis Countdown cleared, once-per-encounter features refreshed"]]
ladder = '<div class="mtx-ladder">' + "".join('<div class="mtx-rung"><div><b>%s</b>%s</div><div class="t">%s</div><div class="c">%s</div></div>' % (a, (' <span class="c">(%s)</span>' % b) if b else "", H.escape(t), H.escape(c)) for a, b, t, c in REC) + "</div>"
notes = ('<div class="mtx-notes">'
         '<div class="mtx-note"><b>What a scene is</b>One continuous situation with one purpose in one place. It ends when the place, the purpose or the people change, or after about one Fugue Interval, and every <i>once per scene</i> ability resets. A Beat holds many scenes (CORE §8.1).</div>'
         '<div class="mtx-note"><b>Two kinds of “Tide”</b>' + mdi(TIDES).replace("<b>Two “Tides”.</b> ", "") + '</div>'
         '<div class="mtx-note"><b>App conventions, not rules</b>The Pulse Ten week, and the Director\'s “+10 min” button (100 Cycles), are the app\'s own; the books name neither.</div>'
         '<div class="mtx-note"><b>Saying the time</b>Organisms say “by the Rhythm, it is the third Beat of the Rise”: the Beat, then the Tide phase.</div>'
         "</div>")
SHORT = ("Every unit of time is named for something a body does: it pulses, it beats, it drifts into fugue, it goes dormant. "
         "Organisms call it <b>the Rhythm</b>: “by the Rhythm, it is the third Beat of the Rise”.")
TABS = [("units", "Every unit"), ("phases", "Tide phases"), ("conv", "Conversions"), ("rec", "Recovery"), ("notes", "Worth knowing")]
MT = ('<div class="featcheck"><h2>Metabolic Time</h2><span class="badge">the Rhythm</span><span class="cite">CORE §8.1 · CODEX §5.1, §5.3</span></div>'
      '<div class="mtx ox-fit"><div class="mtx-hero"><h3>The Expanse does not count hours. It counts the Rhythm of bodies.</h3><p>' + SHORT + "</p>" + '<div class="mtx-scalewrap">' + "".join(svg) + "</div></div>"
      '<div class="mtx-tabs" role="group" aria-label="Show">' + "".join('<button type="button" data-mtsel="%s" aria-pressed="%s">%s</button>' % (k, "true" if k == "units" else "false", t) for k, t in TABS) + "</div>"
      '<div class="mtx-pane" data-oxkeep="mtx-pane">'
      '<section class="mtx-sec" data-mt="units"><div class="mtx-units">' + units + "</div></section>"
      '<section class="mtx-sec" data-mt="phases" hidden><div class="sub">Each phase lasts one Drift Season (~30 Beats); together they make one Tide (CODEX §5.3). The salty season favours the Dry, the watery season the Swollen.</div>' + phases + "</section>"
      '<section class="mtx-sec" data-mt="conv" hidden>' + conv + "</section>"
      '<section class="mtx-sec" data-mt="rec" hidden><div class="sub">From the quickest relief to the full night\'s rest.</div>' + ladder + "</section>"
      '<section class="mtx-sec" data-mt="notes" hidden>' + notes + "</section></div></div>")
m = re.search(r"  function screenMetabolicTime\(\) \{ return .*?; \}\n", h)
assert m, "screenMetabolicTime"
h = h[:m.start()] + "  function screenMetabolicTime() { return " + json.dumps(MT, ensure_ascii=False).replace("</", "<\\/") + "; }\n" + h[m.end():]
open(dst, "w", encoding="utf-8").write(h); print(dst, len(h))
