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
/* ---- Roll Helper v3: labelled fields, grouped; a wide result panel */
.rh-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px 10px;margin:2px 0 6px}
.rh-fields.four{grid-template-columns:repeat(4,minmax(0,1fr))}
.rh-fields .wide{grid-column:1 / -1}
.rh-fld{display:flex;flex-direction:column;gap:4px;min-width:0}
.rh-fld .fl{font:600 12.5px/1.2 system-ui,sans-serif;color:var(--dim);display:flex;align-items:center;gap:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.rh-fld .fl abbr{text-decoration:none;cursor:help}
.rh-body .rh-fld select,.rh-body .rh-fld input[type=number]{width:100%;height:36px;font-size:14.5px}
.rh-body .rh-fld input[type=number]{text-align:center;font:700 17px/1 system-ui,sans-serif;font-variant-numeric:tabular-nums}
.rh-tiles{display:grid;grid-template-columns:repeat(auto-fill,minmax(54px,1fr));gap:8px;margin:2px 0 6px}
.rh-tiles .tile.wide2{grid-column:span 2}
.rh-tiles .tile .fl{justify-content:center}
.rh-sub{font:700 12.5px/1 system-ui,sans-serif;color:var(--ink);margin:8px 0 5px;display:flex;align-items:center;gap:3px;opacity:.85}
.rh-chips{display:flex;flex-wrap:wrap;gap:6px;margin:4px 0}
.rh-chip{display:inline-flex;align-items:center;gap:1px}
.rh-meta{color:var(--dim);font-size:13px;line-height:1.45;margin-top:4px}
.rh-meta b{color:var(--ink)}
.rh-meta.warn{color:var(--warn-c)}
.rh-na{display:flex;align-items:center;height:36px;color:var(--faint);font-size:13px}
@media (min-width:1051px){
.rh-flow{grid-template-columns:minmax(0,1.45fr) minmax(400px,1fr)}
.rh-steps{grid-template-columns:repeat(4,minmax(0,1fr));grid-template-rows:minmax(0,1.25fr) minmax(0,1fr) minmax(0,1fr)}
.rh-steps.attack>.rh-step:nth-child(1){grid-column:1 / 3;grid-row:1}
.rh-steps.attack>.rh-step:nth-child(2){grid-column:3 / 5;grid-row:1}
.rh-steps.attack>.rh-step:nth-child(3){grid-column:1 / 5;grid-row:2}
.rh-steps.attack>.rh-step:nth-child(4){grid-column:1 / 3;grid-row:3}
.rh-steps.attack>.rh-step:nth-child(5){grid-column:3 / 5;grid-row:3}
.rh-steps.defence{grid-template-rows:minmax(0,1fr) minmax(0,1fr)}
.rh-steps .rh-body>h3{font-size:15.5px}
.rh-steps .rh-body{padding:10px 13px 8px}
.rh-steps .rh-num{width:24px;height:24px;font-size:13px}
.rh-steps .rh-body>h3{padding-left:30px}
.rh-steps .rh-body .rh-fld select,.rh-steps .rh-body .rh-fld input[type=number]{width:100%;height:34px}
}
.rh-final .rhl{display:flex;flex-wrap:wrap;align-items:center;gap:4px 6px;padding:6px 0;border-bottom:1px solid color-mix(in srgb,var(--line) 60%,transparent);font-size:13px}
.rh-final .rhl .lead{flex:1 0 100%;font-weight:650;color:var(--ink)}
.rh-final .rhl .rht{border:0;background:transparent;padding:0;color:var(--dim)}
.rh-final .rhl .rht .tv{color:var(--ink);font-weight:700}
.rh-final .rhl .rhres{margin-left:auto;background:var(--accent);color:var(--bg);font-weight:800;padding:2px 9px;border-radius:999px}
.rh-final .rhsub{font-size:12px;color:var(--faint);padding:3px 0}
/* ---- v3b: the question's answer sits in the card header; compact working */
@media (min-width:1051px){
.rh-steps .rh-body{display:grid;grid-template-columns:auto minmax(0,1fr);column-gap:12px;align-content:start}
.rh-steps .rh-body>*{grid-column:1 / -1}
.rh-steps .rh-body>h3{grid-column:1;align-self:center;margin:0 0 8px}
.rh-steps .rh-body>h3+.rh-fields.hd{grid-column:2;margin:0 0 8px;align-self:center}
.rh-steps .rh-body>h3+.rh-fields.hd .fl{display:none}
.rh-steps .rh-tiles{grid-template-columns:repeat(auto-fill,minmax(46px,1fr));gap:6px}
.rh-steps .rh-sub{margin:4px 0 4px}
.rh-steps .rh-sit{display:none}
.rh-steps .rh-meta{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.rh-steps .rh-chips{gap:5px}
.rh-steps .rh-chip label.small{padding:3px 9px 3px 6px}
}
.rh-final .rhl .lead{flex:0 0 auto}
.rh-final .rhl .tn i{display:none}
.rh-final .rhl .rht{display:inline-flex;align-items:center;gap:3px}
.rh-final .rhl .rht .rhi,.rh-final .rhl .rht button{transform:scale(.85)}
.rh-final .rhl{padding:4px 0;font-size:12.5px}
.rh-final .promptbox{font-size:13px;line-height:1.4}
.rh-final .promptbox>div{margin:3px 0}
/* ---- v3c: step 1 is a strip across the top; 2|5 then 3|4 */
@media (min-width:1051px){
.rh-steps.attack,.rh-steps.defence{grid-template-rows:auto minmax(0,1fr) minmax(0,1fr)}
.rh-steps>.rh-step:nth-child(1){grid-column:1 / 5 !important;grid-row:1 !important}
.rh-steps>.rh-step:nth-child(1) .rh-body{grid-template-columns:minmax(0,6fr) minmax(0,4fr)}
.rh-steps>.rh-step:nth-child(1) .rh-body>h3{justify-self:start}
.rh-steps>.rh-step:nth-child(1) .rh-body>h3+.rh-fields.hd{justify-self:end;width:min(100%,300px)}
.rh-steps .rh-body>.rh-grp{grid-column:auto}
.rh-steps .rh-body>.rh-grp.n:first-of-type{grid-column:1 / -1}
.rh-steps.attack>.rh-step:nth-child(2){grid-column:1 / 3 !important;grid-row:2 !important}
.rh-steps.attack>.rh-step:nth-child(5){grid-column:3 / 5 !important;grid-row:2 !important}
.rh-steps.attack>.rh-step:nth-child(3){grid-column:1 / 4 !important;grid-row:3 !important}
.rh-steps.attack>.rh-step:nth-child(4){grid-column:4 / 5 !important;grid-row:3 !important}
.rh-steps.defence>.rh-step:nth-child(2){grid-column:1 / 3 !important;grid-row:2 !important}
.rh-steps.defence>.rh-step:nth-child(3){grid-column:3 / 5 !important;grid-row:2 !important}
.rh-steps.defence>.rh-step:nth-child(4){grid-column:1 / 5 !important;grid-row:3 !important}
.rh-steps.attack>.rh-step:nth-child(4) .rh-body>h3{font-size:14.5px}
.rh-steps.attack>.rh-step:nth-child(4) .rh-fld .fl{display:none}
}
.rh-final.rh-tight:not(.v-work) .rhf>:not(h4){display:none}
.rh-final.rh-tight.v-work .promptbox,.rh-final.rh-tight.v-work .rhf~.row{display:none}
.rh-final.rh-tight .rhf h4::after{content:"  · show the working";font-weight:500;color:var(--accent)}
.rh-final.rh-tight.v-work .rhf h4::after{content:"  · back to the result"}
.rh-final.rh-tight.v-work .rhf h4::before{transform:rotate(90deg)}
/* ---- v3d */
.rh-steps .rh-grp .rh-tiles{grid-template-columns:none;grid-auto-flow:column;grid-auto-columns:minmax(0,1fr)}
.rh-steps .rh-grp .rh-tiles .fl{justify-content:center;overflow:visible}
.rh-steps .rh-tiles .tile .fl{font-size:12px}
@media (min-width:1051px){
.rh-steps.attack>.rh-step:nth-child(4) .rh-fld .fl{display:flex;white-space:normal}
.rh-steps.attack>.rh-step:nth-child(4) .rh-meta{white-space:normal}
.rh-steps.attack>.rh-step:nth-child(5) .rh-body>.rh-tiles{grid-column:1;grid-template-columns:repeat(2,minmax(58px,76px))}
.rh-steps.attack>.rh-step:nth-child(5) .rh-body>.rh-tiles .tile{grid-column:auto}
.rh-steps.attack>.rh-step:nth-child(5) .rh-body>.rh-chips{grid-column:2;flex-direction:column;align-items:flex-start;align-self:end;margin:0 0 6px}
.rh-steps.defence>.rh-step:nth-child(3) .rh-tiles{grid-template-columns:repeat(3,minmax(0,1fr))}
.rh-steps.defence>.rh-step:nth-child(2) .rh-body>h3{grid-column:1 / -1}
.rh-steps .rh-chip label.small{white-space:nowrap}
.rh-steps .rh-chip{max-width:100%;min-width:0}
.rh-steps.attack>.rh-step:nth-child(4) .rh-chip label.small,.rh-steps.attack>.rh-step:nth-child(5) .rh-chip label.small{white-space:normal;border-radius:12px}
.rh-steps.defence>.rh-step:nth-child(2) .rh-body>.rh-tiles{grid-column:1;grid-template-columns:repeat(2,minmax(58px,76px))}
.rh-steps.defence>.rh-step:nth-child(2) .rh-body>.rh-tiles .tile{grid-column:auto}
.rh-steps.defence>.rh-step:nth-child(2) .rh-body>.rh-chips{grid-column:2;flex-direction:column;align-items:flex-start;align-self:end;margin:0 0 6px}
}
.rh-final.rh-tight .rh-body{display:flex;flex-direction:column}
.rh-final.rh-tight .rhf{order:9;margin-top:auto}
.rh-final.rh-tight:not(.v-work) .rhf h4{border:1px solid var(--line);border-radius:10px;padding:9px 12px;background:var(--panel2)}
.rh-final.rh-tight:not(.v-work) .rhf{border-top:0}
/* ---- short screens: a slimmer page header, so the working tabs get the height */
@media (max-height:900px) and (min-width:1051px){
body>header{padding:7px 20px 5px}
body>header h1{font-size:16.5px;margin:0}
.campbar{padding:5px 20px;row-gap:4px}
.campbar .clockface small,.campbar .advgroup .lbl{display:none}
.campbar .btn.small{padding:2px 8px;font-size:12px}
.tabs{padding-top:7px}
.tabs .tab{padding:3px 8px;font-size:12px}
.featcheck.rh-head{padding-bottom:6px;margin-bottom:8px}
.rh-head .rh-seg button{padding:6px 12px}
.rh-head .btn,.rh-log>summary{padding-top:5px;padding-bottom:5px}
}
@media (max-height:800px) and (min-width:1051px){
.rh-steps .rh-body .rh-fld select,.rh-steps .rh-body .rh-fld input[type=number]{height:31px}
.rh-steps .rh-body{padding:8px 12px 6px}
.rh-steps .rh-body>h3{margin-bottom:6px}
.rh-steps .rh-fields{gap:6px 10px;margin-bottom:4px}
.rh-steps .rh-fld{gap:3px}
.rh-steps{gap:8px}
}
.rh-final.rh-tight.v-work .rhf{margin-top:0}
@media (min-height:950px) and (min-width:1051px){
.rh-steps .rh-body{padding:14px 18px 12px}
.rh-steps .rh-body>h3{font-size:17px;margin-bottom:12px}
.rh-steps .rh-num{width:27px;height:27px;font-size:14px}
.rh-steps .rh-fld .fl,.rh-steps .rh-sub{font-size:13.5px}
.rh-steps .rh-body .rh-fld select,.rh-steps .rh-body .rh-fld input[type=number]{height:42px;font-size:15.5px}
.rh-steps .rh-body .rh-fld input[type=number]{font-size:19px}
.rh-steps .rh-fields{gap:12px 14px;margin-bottom:10px}
.rh-steps .rh-tiles{gap:9px}
.rh-steps .rh-chips{gap:8px;margin-top:8px}
.rh-steps .rh-chip label.small{font-size:13.5px;padding:5px 11px 5px 7px}
.rh-steps .rh-meta{font-size:14px;margin-top:8px}
.rh-final .rhl{font-size:13.5px;padding:7px 0}
.rh-final .promptbox{font-size:14px}
}
/* ==== OX SHELL: one look for every working tab (cards, fields, tables, page title) ==== */
html[data-oxshell] #app .featcheck{display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px;padding:0 0 10px;margin:0 0 12px;border-bottom:1px solid var(--line)}
html[data-oxshell] #app .featcheck h2{font-size:19px;letter-spacing:-.01em}
html[data-oxshell] #app .featcheck .cite{flex:1 1 300px;font-size:12.5px}
html[data-oxshell] #app .featcheck .dmflag{margin-left:auto}
html[data-oxshell] #app>.small.dim:first-of-type,html[data-oxshell] #app .featcheck+.small.dim{font-size:13.5px;line-height:1.55;max-width:1000px;margin:0 0 14px;color:var(--dim)}
html[data-oxshell] #app .subgroup{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:14px 16px 12px;margin:0 0 14px;box-shadow:0 1px 0 color-mix(in srgb,var(--ink) 4%,transparent),0 6px 18px -12px rgba(0,0,0,.6)}
html[data-oxshell] #app .subgroup .subgroup{background:var(--panel2,var(--bg));box-shadow:none;border-radius:10px}
html[data-oxshell] #app .subgroup>h4{display:flex;align-items:center;gap:8px;margin:0 0 12px;font-size:14.5px;font-weight:700;color:var(--ink);letter-spacing:0}
html[data-oxshell] #app .subgroup>h4::before{content:"";width:4px;height:15px;border-radius:2px;background:var(--accent);flex:none}
html[data-oxshell] #app .subgroup>h3{font-size:18px;margin:2px 0 8px}
html[data-oxshell] #app>h4{font-size:14.5px;color:var(--ink);margin:16px 0 8px}
html[data-oxshell] #app .row{gap:8px 10px;margin:8px 0}
html[data-oxshell] #app .lbl{font-size:12.5px;font-weight:600;color:var(--dim);min-width:120px}
html[data-oxshell] #app input.inp,html[data-oxshell] #app select.inp{min-height:36px;border-radius:8px;font-size:14px}
html[data-oxshell] #app input.inp.num{text-align:center;font-weight:700;font-variant-numeric:tabular-nums;width:8ch}
html[data-oxshell] #app textarea.inp{border-radius:10px;line-height:1.5;font-size:14px;padding:10px 12px}
html[data-oxshell] #app .btn{border-radius:8px}
html[data-oxshell] #app .btn.primary{padding-left:16px;padding-right:16px}
html[data-oxshell] #app .gapbox{border:1px dashed color-mix(in srgb,var(--line) 80%,var(--dim));border-radius:10px;padding:12px 14px;color:var(--dim);background:color-mix(in srgb,var(--panel) 55%,transparent)}
html[data-oxshell] #app .promptbox{border-radius:10px;border-left:3px solid var(--accent)}
html[data-oxshell] #app .tbl{border-collapse:separate;border-spacing:0;border:1px solid var(--line);border-radius:10px;overflow:hidden;margin:6px 0 10px}
html[data-oxshell] #app .tbl th{background:var(--panel2,var(--bg));padding:8px 10px;font-size:11px;font-weight:700;letter-spacing:.06em}
html[data-oxshell] #app .tbl td{padding:8px 10px;line-height:1.45}
html[data-oxshell] #app .tbl tr:last-child td{border-bottom:0}
html[data-oxshell] #app .tbl tbody tr:nth-child(even) td{background:color-mix(in srgb,var(--ink) 2.5%,transparent)}
html[data-oxshell] #app .tbl tbody tr:hover td{background:color-mix(in srgb,var(--accent) 7%,transparent)}
html[data-oxshell] #app .cols{gap:14px}
html[data-oxshell] #app .cols>.subgroup{margin-bottom:0}
html[data-oxshell] #app .cols{margin-bottom:14px}
html[data-oxshell] #app details>summary{cursor:pointer;color:var(--accent);font-weight:600;font-size:13px}
html[data-oxshell] #app .row>.lbl:not(:first-child){min-width:0;margin-left:8px}
html[data-oxtab=notebook] #app>.subgroup:first-child{column-span:all}
html[data-oxtab=tabsetup] #app table.tpgrid tbody{display:grid;grid-template-columns:repeat(auto-fill,minmax(360px,1fr));gap:6px 14px}
html[data-oxtab=tabsetup] #app table.tpgrid tr{display:flex;align-items:center;justify-content:space-between;gap:10px;background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:4px 6px 4px 12px}
html[data-oxtab=tabsetup] #app table.tpgrid td{border:0;padding:2px 0}
html[data-oxtab=tabsetup] #app table.tpgrid thead{display:none}
html[data-oxtab=tabsetup] #app>h3{font-size:19px;margin:0 0 8px}
html[data-oxtab=briefing] #app textarea.inp{min-height:0;height:260px}
html[data-oxtab=narrate] #app>.featcheck+.subgroup{column-span:all}
html[data-oxtab=chargen] #app .cg-top{grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px;margin-bottom:12px}
html[data-oxtab=chargen] #app .cg-top>.cg-card{padding:10px 14px}
html[data-oxtab=chargen] #app .cg-top .featcheck{border:0;padding:0;margin:0 0 4px}
html[data-oxtab=chargen] #app .cgframe{min-height:0;border-radius:12px;display:block}
/* wide screens: short cards flow into two balanced columns; wide content spans both */
@media (min-width:1100px){
html[data-oxcols] #app{columns:2;column-gap:16px}
html[data-oxcols] #app>*{break-inside:avoid;column-span:all}
html[data-oxcols] #app>.subgroup{column-span:none;display:block;width:100%}
html[data-oxcols] #app>.subgroup:has(.tbl),html[data-oxcols] #app>.subgroup:has(textarea),html[data-oxcols] #app>.subgroup.oxwide{column-span:all}
html[data-oxcols] #app>.subgroup .row{flex-wrap:wrap}
html[data-oxcols] #app>.subgroup .inp.grow{min-width:0}
}
/* Campaign: the Vectors sit side by side */
@media (min-width:1100px){
html[data-oxtab=campaign] #app>.subgroup>.subgroup{display:inline-flex;flex-direction:column;vertical-align:top;width:calc((100% - 28px)/3);margin:0 14px 0 0;min-height:200px}
html[data-oxtab=campaign] #app>.subgroup>.subgroup:nth-of-type(3n){margin-right:0}
html[data-oxtab=campaign] #app>.subgroup>.subgroup>.row:last-child{margin-top:auto;flex-wrap:wrap}
html[data-oxtab=campaign] #app>.subgroup>.subgroup .small{white-space:normal}
html[data-oxtab=campaign] #app>.subgroup>.subgroup details[open]{position:fixed;inset:6vh 8vw;z-index:50;background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:16px 20px;overflow:auto;box-shadow:0 30px 80px rgba(0,0,0,.6)}
}
/* ---- condition pickers: a pill that opens a floating list */
.rh-conds{position:relative;display:inline-block;margin-left:auto}
.rh-conds>summary{list-style:none;cursor:pointer;font:600 12px/1.2 system-ui,sans-serif;padding:4px 10px;border:1px solid var(--line);border-radius:999px;background:var(--panel2,var(--bg));color:var(--dim);white-space:nowrap;max-width:230px;overflow:hidden;text-overflow:ellipsis}
.rh-conds>summary::-webkit-details-marker{display:none}
.rh-conds>summary .car{opacity:.7}
.rh-conds.has>summary{color:var(--warn-c);border-color:color-mix(in srgb,var(--warn-c) 60%,var(--line));background:color-mix(in srgb,var(--warn-c) 10%,var(--panel))}
.rh-conds[open]>summary{border-color:var(--accent);color:var(--ink)}
.rh-cpop{position:fixed;z-index:60;min-width:310px;display:flex;flex-direction:column;align-items:stretch;gap:5px;padding:10px 12px;background:var(--panel);border:1px solid var(--line);border-radius:12px;box-shadow:0 20px 50px rgba(0,0,0,.55)}
.rh-cpop .rh-cph{font:700 13px system-ui,sans-serif;color:var(--ink);margin-bottom:3px;display:flex;justify-content:space-between;gap:10px}
.rh-cpop .rh-cph .dim{font-weight:500;font-size:11.5px;color:var(--faint)}
.rh-cpop .rh-chip{display:flex;justify-content:space-between}
.rh-cpop .rh-chip label.small{white-space:nowrap!important;border-radius:999px!important;flex:1}
.rh-chips>.rh-conds{margin:0 0 2px}
.rh-sub .rh-conds{margin:-4px 0 -4px auto}
.rh-steps.attack>.rh-step:nth-child(5) .rh-body>.rh-chips .rh-chip label.small{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.rh-steps.attack>.rh-step:nth-child(5) .rh-body>.rh-chips{min-width:0;max-width:100%}
.rh-sub .rh-conds>summary{padding:2px 9px;font-size:11.5px}
@media (max-height:800px) and (min-width:1051px){.rh-steps .rh-chips{gap:3px}.rh-steps .rh-chip label.small{padding-top:2px;padding-bottom:2px}}
.rh-step:has(details[data-oxopen][open]),.rh-steps:has(details[data-oxopen][open]),.rh-flow:has(details[data-oxopen][open]){position:relative;z-index:70}
.rh-final .rh-cnote{color:var(--warn-c);font-size:12px}
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
rep('out += rhStep(4, "Buy Reagents? (Overdrive — extra dice for ATP or MI) " + rhI("od"), odb);', 'out += rhStep(4, "Extra dice?", odb);')

# ------------------------------------------------------------------ Roll Helper fields: labels above boxes, grouped, consistent
def splice(start, end, new):
    global h
    if new.strip() in h: return
    i = h.find(start); assert i >= 0 and h.find(start, i + 1) < 0, ("start", start[:60])
    j = h.find(end, i); assert j > i, ("end", end[:60])
    h = h[:i] + new + h[j:]

rep('''  var RH_FRESH = 0;''', '''  var RH_FRESH = 0;
  function rhF(label, key, control, cls) { return '<label class="rh-fld' + (cls ? " " + cls : "") + '"><span class="fl">' + label + (key ? rhI(key) : "") + "</span>" + control + "</label>"; }
  function rhChip(chk, key) { return '<span class="rh-chip">' + chk + (key ? rhI(key) : "") + "</span>"; }''')

i = h.find("  function rhWhoStep(prefix, ch, extra) {"); j = h.find("    return b;\n  }\n", i) + len("    return b;\n  }\n")
assert i > 0 and j > i
NEWWHO = '''  function rhWhoStep(prefix, ch, extra) {
    var b = '<div class="rh-fields hd">' + rhF("Who is rolling", "who", rhSel(prefix + "-who", rhSources(), "manual"), "wide") + "</div>";
    if (!ch.fromSheet) {
      b += '<div class="rh-grp g"><div class="rh-sub">Baseline Grades' + rhI("grade") + '</div><div class="rh-tiles">' + RH_BASE.map(function (k) {
        return rhF('<abbr title="' + ({ VSC: "Viscosity", DFF: "Diffusion", RTC: "Reactivity", OSM: "Osmosis", AFF: "Affinity" })[k] + '">' + k + "</abbr>", "", rhInp(prefix + "-g-" + k, 3, ' min="0" max="8"'), "tile");
      }).join("") + rhF("Level", "", rhInp(prefix + "-level", 1, ' min="1" max="20"'), "tile") + "</div></div>";
    } else {
      b += '<div class="rh-meta">' + RH_BASE.map(function (k) { return k + " <b>" + ch.grades[k] + "</b>"; }).join(" · ") + " · Level " + ch.level + " (tier " + ch.tier + ") · PP " + ch.pp +
        " · ATP max " + ch.atpMax + " · MI max " + ch.miMax + " · MT " + ch.mt + " · soak " + ch.soak + "</div>";
    }
    b += '<div class="rh-grp n"><div class="rh-sub">Right now</div><div class="rh-tiles">' + rhF("Stress", "stress", rhInp(prefix + "-stress", 0, ' min="0" max="8"'), "tile") +
      rhF("ATP", "atp", rhInp(prefix + "-atp", ch.atpMax, ' min="0"'), "tile") + rhF("MI", "mi", rhInp(prefix + "-mi", ch.curMI, ' min="0"'), "tile") +
      rhF("PP left", "pp", rhInp(prefix + "-pp", ch.pp, ' min="0"'), "tile") + (extra || "") + "</div></div>";
    var st = rhNum(prefix + "-stress", 0);
    if (rhStressDice(st)) b += '<div class="rh-meta warn">Stress ' + st + ": " + rhStressDice(st) + " dice to every pool" + (st >= 6 ? "; ATP costs +1" : "") + " (CORE §5.8).</div>";
    return b;
  }
'''
if NEWWHO not in h: h = h[:i] + NEWWHO + h[j:]

splice('''    var wb = '<div class="row"><span class="lbl">weapon</span>' ''', "    out += rhStep(2, ", '''    var wb = '<div class="rh-fields">' + rhF("Weapon", "weapon", rhSel("ra-weapon", ws.map(function (x) { return { v: x.id, l: x.l }; }), ws[0] ? ws[0].id : ""), "wide") +
      (cls === "Projector" ? rhF("Grade used", "", rhSel("ra-pbase", [{ v: "DFF", l: "DFF (" + ch.grades.DFF + ")" }, { v: "RTC", l: "RTC (" + ch.grades.RTC + ")" }], baseKey)) +
        rhF("Pathway", "", rhSel("ra-ppath", [{ v: "Membrane Penetration", l: "Membrane Penetration" }, { v: "Signal Discourse", l: "Signal Discourse" }], pathName)) : "") + "</div>" +
      '<div class="rh-tiles">' + (!ch.fromSheet ? rhF('<abbr title="' + esc(pathName) + ' rank">Pathway rank</abbr>', "rank", rhInp("ra-rank", 0, ' min="0" max="4"'), "tile wide2") : "") +
      rhF("Effect Value", "ev", rhInp("ra-ev", 0, ' min="0"'), "tile wide2") + "</div>" +
      '<div class="rh-meta"><b>' + esc(a.n) + "</b> · " + esc(cls) + " · " + esc(a.b || "Contact") + " · " + (bonus >= 0 ? "+" : "") + bonus + " dice · BD " + bd + " · " + esc(a.ty) + (props ? " · " + esc(props) : "") + "</div>";
    if (heavy && ch.grades.VSC < (twoH ? 4 : 3)) wb += '<div class="warnbox small">' + esc(a.n) + " is Heavy" + (twoH ? " and two-handed" : "") + ": it needs VSC " + (twoH ? 4 : 3) + "+, and this organism has VSC " + ch.grades.VSC + " (CORE §9.3).</div>";
''')
splice('''    var sb = '<div class="row">' ''', "    out += rhStep(3, ", '''    var sb = '<div class="rh-fields four">' + rhF("Allies helping", "allies", rhSel("ra-allies", [{ v: 0, l: "none" }, { v: 1, l: "1 (+1)" }, { v: 2, l: "2 (+2)" }], 0)) +
      rhF("Tonic", "tonic", rhSel("ra-tonic", [{ v: 0, l: "right tonic" }, { v: -1, l: "wrong (−1)" }, { v: -2, l: "badly wrong (−2)" }], 0)) +
      rhF("Target cover", "cover", rhSel("ra-cover", [{ v: "0", l: "none" }, { v: "-2", l: "partial (−2)" }, { v: "-4", l: "heavy (−4)" }, { v: "x", l: "total, in turbid fluid (auto miss)" }], "0")) +
      rhF("Momentum", "mom", braced ? '<span class="rh-na">not with a Braced weapon</span>'
        : rhSel("ra-mom", [{ v: "0", l: "no run-up" }, { v: "2", l: "3+ Drifts straight (+2, 1 PP, Kinetic)" }, { v: "3", l: "run began in a Current (+3)" }], "0")) + "</div>" +
      '<div class="rh-chips">' + rhChip(rhChk("ra-pos", "good position (+1)"), "pos") + rhChip(rhChk("ra-cat", "Catalysed (+1)"), "cat") + rhChip(rhChk("ra-marked", "target Marked (+2)"), "marked") +
      (braced ? rhChip(rhChk("ra-still", "did not Drift (Braced, +1)"), "still") : "") + rhChip(rhChk("ra-squeeze", "squeezed / pinned (−2)"), "squeeze") + "</div>" +
      '<div class="rh-meta rh-sit">' + rhI("cap") + "Situational dice: " + (sit.length ? sit.map(function (x) { return esc(x[0]) + " " + (x[1] > 0 ? "+" : "") + x[1]; }).join(", ") : "none") +
      " → <b>" + (sitCap >= 0 ? "+" : "") + sitCap + "</b>" + (sitRaw !== sitCap ? " (capped from " + sitRaw + ", CORE §1.3)" : "") + "</div>";
''')
splice('''    var odb = '<div class="small" style="margin-bottom:6px">''', "    var odDice = ", '''    var odb = '<div class="rh-fields">' + rhF("Overdrive: buy dice with ATP or MI", "od", rhSel("ra-od", [{ v: "none", l: "no Overdrive" },
        { v: "atp", l: "spend " + odCost + " ATP → +2 dice" + (atpNow < odCost ? " (you have " + atpNow + ")" : "") },
        { v: "mi", l: "spend " + miCost + " MI → +4 dice, +1 Stress" + (miNow <= miCost ? " (you have " + miNow + " MI)" : "") }], "none"), "wide") + "</div>" +
      (ch.fromSheet ? "" : '<div class="rh-chips">' + rhChip(rhChk("ra-odtrain", "has Overdrive Training (costs 3)"), "") + "</div>") +
      '<div class="rh-meta">You have <b>' + atpNow + "</b> ATP and <b>" + miNow + "</b> MI. Once per roll" + (st >= 6 ? "; at Stress 6 ATP costs +1" : "") + ".</div>";
''')
splice('''    var tb = '<div class="row"><span class="lbl">target</span>' ''', "    out += rhStep(5, ", '''    var tb = '<div class="rh-fields hd">' + rhF("Target", "mt", rhSel("ra-target", rhCreatureOpts(), "manual"), "wide") + "</div>" +
      (tc ? '<div class="rh-meta">' + esc(tc.name) + " · MT <b>" + tc.mt + "</b> · soak <b>" + tc.soak + "</b></div>"
        : '<div class="rh-tiles">' + rhF("Its MT", "mt", rhInp("ra-tmt", 12, ' min="0"'), "tile wide2") + rhF("Its soak", "soak", rhInp("ra-tsoak", 0, ' min="0"'), "tile wide2") + "</div>") +
      '<div class="rh-chips">' + rhChip(rhChk("ra-deflect", "it Deflects (MT +4)"), "deflect") + rhChip(rhChk("ra-tinhib", "it Inhibits you (−2)"), "tinhib") + "</div>";
''')
h = h.replace('''      '<div class="row"><span class="lbl">Effect Value (from a Burst, else 0)</span>' + rhI("ev") + rhInp("ra-ev", 0, ' min="0"') + "</div>" +
''', "")
splice('''    var db = (ch.fromSheet''', '''    out += rhStep(2, "Your defences right now"''', '''    var db = (ch.fromSheet ? '<div class="rh-meta">Membrane Threshold <b>' + mtBase + "</b> · soak <b>" + soak + "</b> (from the sheet)</div>"
      : '<div class="rh-tiles">' + rhF("Your MT", "mt", rhInp("rd-mt", 10 + ch.grades.DFF, ' min="0"'), "tile wide2") + rhF("Your soak", "soak", rhInp("rd-soak", 0, ' min="0"'), "tile wide2") + "</div>") +
      '<div class="rh-chips">' + rhChip(rhChk("rd-jostled", "I am Jostled (MT −2)"), "jostled") + rhChip(rhChk("rd-turgid", "I am Turgid (MT −2)"), "turgid") + "</div>";
''')
splice('''    var ib = '<div class="row"><span class="lbl">the attacker</span>' ''', "    out += rhStep(3, ", '''    var ib = '<div class="rh-fields">' + rhF("The attacker", "", rhSel("rd-attacker", rhCreatureOpts(), "manual")) +
      rhF("Its attack", "", rhSel("rd-how", [{ v: "roll", l: "roll its pool for me" }, { v: "typed", l: "the Director tells me its total" }], "roll")) + "</div>";
    var aPool = cr ? cr.pool : rhNum("rd-apool", 3), aBD = cr ? cr.bd : rhNum("rd-abd", 2), aTy = cr ? cr.ty : rhStr("rd-aty", "Kinetic");
    var tiles = "";
    if (how === "typed") tiles += rhF("Its total", "", rhInp("rd-atotal", 14, ' min="0"'), "tile");
    else if (!cr) tiles += rhF("Its pool", "apool", rhInp("rd-apool", 3, ' min="0"'), "tile");
    if (!cr) tiles += rhF("BD", "bd", rhInp("rd-abd", 2, ' min="0"'), "tile") + rhF("Type", "", rhSel("rd-aty", Object.keys(RH_CONSEQ), "Kinetic"), "tile");
    if (tiles) ib += '<div class="rh-tiles">' + tiles + "</div>";
    if (cr) ib += '<div class="rh-meta">' + esc(cr.name) + ": pool <b>" + aPool + "d</b> · BD <b>" + aBD + "</b> " + esc(aTy) + (cr.block && cr.block.printed ? '<div class="dim">' + esc(cr.block.printed) + "</div>" : "") + "</div>";
''')
splice('''    var rb = '<div class="small dim">Reactions need''', "    var ppNeed = ", '''    var rb = '<div class="rh-fields">' + rhF("Reactive Osmosis", "react", rhSel("rd-react", [{ v: "none", l: "none" }, { v: "deflect", l: "Deflect: your MT +4 (1 held PP)" },
        { v: "brace", l: "Brace: halve Osmotic and Kinetic, ignore push (1 held PP)" }, { v: "reroll", l: "Inhibit: attacker re-rolls one die (1 held PP)" }], "none"), "wide") + "</div>" +
      '<div class="rh-chips">' + rhChip(rhChk("rd-inhib", "Inhibition: " + inhibCost + " ATP + 1 held PP, attacker −2 dice"), "inhib") + "</div>" +
      '<div class="rh-meta">Reactions use a Pulse Point you held back (Reserve). One Reactive Osmosis per Cycle (CORE §4.10, §1.8).</div>';
''')

# ------------------------------------------------------------------ Roll Helper: conditions (CORE §4.7) for the attacker, the target and the defender
rep('''  function rhChip(chk, key) {''', '''  Object.assign(RH_INFO, {
    brittle: ["Brittle", "A condition: the membrane has gone glassy.", "Usually from a Lytic hit's consequence. Ends with a Synthesise action and a Lipid patch.", "Graft soak halves against Kinetic damage; Lytic damage ignores 2 soak.", "CORE §4.7"],
    encysted: ["Encysted", "A condition: sealed inside a cyst.", "Ends when you or an ally spends 3 ATP to crack the cyst.", "Takes half damage; cannot act; cannot be moved.", "CORE §4.7"],
    flaccid: ["Flaccid", "A condition: shrunken, water pulled out.", "From an Osmotic hit or a Hypertonic region. Ends at the end of the next Cycle.", "VSC −2 (Weight attacks lose 2 dice); reach −1 band.", "CORE §4.7"],
    denatured: ["Denatured", "A condition: catalytic functions impaired.", "Ends with an RTC save at the end of your turn.", "RTC −2 (Resonator and RTC Projector attacks lose 2 dice); Burst Effect Values halve.", "CORE §4.7"],
    catabolic: ["Catabolic", "A condition: energy-starved.", "From a Thermic hit's consequence. Ends with a Reconstitution.", "Every ATP cost +1 (Overdrive costs 1 more ATP); ATP regeneration halved.", "CORE §4.7"],
    locked: ["Locked", "A condition: signal jammed.", "From a Voltaic hit. Ends with a save each Cycle, or a Reactive Osmosis (Shed).", "Cannot Begin a Burst or use a class Burst feature, so no Effect Value.", "CORE §4.7"],
    overclocked: ["Overclocked", "A condition: running too hot.", "Ends when you Vent, or after 3 Cycles.", "+1 PP, but mark 2 Stress at the end of each Cycle.", "CORE §4.7"],
    masked: ["Masked", "A condition: no scent trail.", "Ends when you Strike, or after an enemy's successful Sense.", "Cannot be targeted by scent, OSM or tracking. Striking ends it.", "CORE §4.7"],
    sequestered: ["Sequestered", "A condition: enclosed in gel, shell or a vortex.", "Ends when an ally breaks the cage, or a VSC save at −2 each Cycle.", "Cannot act.", "CORE §4.7"]
  });
  var RH_CN = { turgid: "Turgid", flaccid: "Flaccid", jostled: "Jostled", denatured: "Denatured", catabolic: "Catabolic", locked: "Locked", overclocked: "Overclocked", masked: "Masked",
    sequestered: "Sequestered", encysted: "Encysted", brittle: "Brittle", marked: "Marked" };
  function rhConds(key, title, list) {
    var on = list.filter(function (x) { return rhOn(x[0]); });
    return '<details class="rh-conds' + (on.length ? " has" : "") + '" data-oxopen="' + key + '"><summary title="' + esc(title) + '">' +
      (on.length ? "⚠ " + on.map(function (x) { return RH_CN[x[2]] || x[2]; }).join(" · ") : title) + ' <span class="car">▾</span></summary><div class="rh-cpop"><div class="rh-cph">' + esc(title) + ' <span class="dim">CORE §4.7</span></div>' +
      list.map(function (x) { return rhChip(rhChk(x[0], x[1]), x[2]); }).join("") + "</div></details>";
  }
  function rhEV() { var e = rhNum("ra-ev", 0); if (rhOn("ra-c-locked")) return 0; if (rhOn("ra-c-denatured")) e = Math.floor(e / 2); return e; }
  function rhSoakAfter(soak, ty, brittle) { if (!brittle) return soak; if (ty === "Kinetic") return Math.floor(soak / 2); if (ty === "Lytic") return Math.max(0, soak - 2); return soak; }
  function rhChip(chk, key) {''')

# attacker's conditions sit on the "Right now" line of step 1
rep("""    b += '<div class="rh-grp n"><div class="rh-sub">Right now</div><div class="rh-tiles">'""",
    """    b += '<div class="rh-grp n"><div class="rh-sub">Right now' + (prefix === "ra" ? rhConds("ra-c", "Conditions on you", [["ra-c-turgid", "Turgid — DFF −2", "turgid"], ["ra-c-flaccid", "Flaccid — VSC −2, reach −1 band", "flaccid"],
        ["ra-c-denatured", "Denatured — RTC −2, Burst EV halves", "denatured"], ["ra-c-catabolic", "Catabolic — ATP costs +1", "catabolic"], ["ra-c-locked", "Locked — no Burst, EV 0", "locked"],
        ["ra-c-jostled", "Jostled — −1 PP this Cycle", "jostled"], ["ra-c-overclocked", "Overclocked — +1 PP, 2 Stress at Cycle end", "overclocked"], ["ra-c-masked", "Masked — striking ends it", "masked"],
        ["ra-c-sequestered", "Sequestered — cannot act", "sequestered"], ["ra-c-encysted", "Encysted — cannot act", "encysted"]]) : "") + '</div><div class="rh-tiles">'""")

# the attacker's grade loses 2 to Turgid / Flaccid / Denatured when it is the grade being rolled
rep("""    var grade = ch.grades[baseKey] || 0, rank = ch.fromSheet ? (ch.ranks[pathName] || 0) : rhNum("ra-rank", 0);""",
    """    var grade = ch.grades[baseKey] || 0, rank = ch.fromSheet ? (ch.ranks[pathName] || 0) : rhNum("ra-rank", 0);
    var condCut = Math.min(grade, (baseKey === "DFF" && rhOn("ra-c-turgid") ? 2 : 0) + (baseKey === "VSC" && rhOn("ra-c-flaccid") ? 2 : 0) + (baseKey === "RTC" && rhOn("ra-c-denatured") ? 2 : 0));
    var condName = baseKey === "DFF" ? "Turgid" : baseKey === "VSC" ? "Flaccid" : "Denatured";""")
rep("""    var pool = Math.max(0, grade + rank + bonus + sitCap + odDice - (tinhib ? 2 : 0));""",
    """    var pool = Math.max(0, grade + rank + bonus + sitCap + odDice - (tinhib ? 2 : 0) - condCut);""")
rep("""    if (tinhib) poolTerms.push(rhT("target's Inhibition", "", -2, "tinhib"));""",
    """    if (tinhib) poolTerms.push(rhT("target's Inhibition", "", -2, "tinhib"));
    if (condCut) poolTerms.push(rhT(condName + " (" + baseKey + " −2)", "", -condCut, condName.toLowerCase()));""")
rep("""    var odCost = (odTrain ? 3 : 4) + (st >= 6 ? 1 : 0)""", """    var odCost = (odTrain ? 3 : 4) + (st >= 6 ? 1 : 0) + (rhOn("ra-c-catabolic") ? 1 : 0)""")
rep('''rhT("Effect Value", "EV", rhNum("ra-ev", 0), "ev")''', '''rhT("Effect Value", "EV", rhEV(), "ev")''')
rep('''      var ev = rhNum("ra-ev", 0);''', '''      var ev = rhEV();''')

# the target's conditions: MT, soak, half damage
rep("""    var mtEff = tmt + (deflect ? 4 : 0);""", """    var tTurgid = rhOn("ra-t-turgid"), tJostled = rhOn("ra-t-jostled"), tBrittle = rhOn("ra-t-brittle"), tHalf = rhOn("ra-t-encysted");
    var mtEff = tmt + (deflect ? 4 : 0) + (tTurgid ? -2 : 0) + (tJostled ? -2 : 0);
    var hitTy = mom !== "0" ? "Kinetic" : a.ty, soakEff = rhSoakAfter(tsoak, hitTy, tBrittle);""")
rep("""    if (deflect) mtTerms.push(rhT("Deflect", "Reactive Osmosis", 4, "deflect"));""",
    """    if (deflect) mtTerms.push(rhT("Deflect", "Reactive Osmosis", 4, "deflect"));
    if (tTurgid) mtTerms.push(rhT("it is Turgid", "", -2, "turgid"));
    if (tJostled) mtTerms.push(rhT("it is Jostled", "", -2, "jostled"));""")
rep('''rhT("target's Soak", "", tsoak, "soak", false, true)], "at least 1 " + esc(mom !== "0" ? "Kinetic" : a.ty))''',
    '''rhT("target's Soak" + (soakEff !== tsoak ? " (Brittle, was " + tsoak + ")" : ""), "", soakEff, soakEff !== tsoak ? "brittle" : "soak", false, true)], "at least 1 " + esc(hitTy) + (tHalf ? ", then halved (Encysted)" : ""))''')
rep("""    RH_LAST._attackSetup = { pool: pool, mt: mtEff, bd: bd, soak: tsoak,""", """    RH_LAST._attackSetup = { half: tHalf, pool: pool, mt: mtEff, bd: bd, soak: soakEff,""")
rep("""      var dmg = hit ? Math.max(1, over + (L.runaway ? ev * 2 : ev) + L.bd - L.soak) : 0;""",
    """      var dmg = hit ? Math.max(1, over + (L.runaway ? ev * 2 : ev) + L.bd - L.soak) : 0;
      if (hit && L.half) dmg = Math.max(1, Math.floor(dmg / 2));""")
rep('''" − Soak " + L.soak + " = <b>" + dmg + " " + esc(L.ty) + "</b>"''', '''" − Soak " + L.soak + (L.half ? ", halved (Encysted)" : "") + " = <b>" + dmg + " " + esc(L.ty) + "</b>"''')
# step 3 loses its Marked chip: Marked is now one of the target's conditions (same switch, same +2)
h = h.replace('''rhChip(rhChk("ra-marked", "target Marked (+2)"), "marked") +''', "")
rep("""'<div class="rh-chips">' + rhChip(rhChk("ra-deflect", "it Deflects (MT +4)"), "deflect")""",
    """'<div class="rh-chips">' + rhConds("ra-t", "Its conditions", [["ra-t-turgid", "Turgid — its MT −2", "turgid"], ["ra-t-jostled", "Jostled — its MT −2", "jostled"],
        ["ra-marked", "Marked — you gain +2 dice", "marked"], ["ra-t-brittle", "Brittle — soak halves vs Kinetic, Lytic ignores 2", "brittle"],
        ["ra-t-encysted", "Encysted — takes half damage", "encysted"], ["ra-t-masked", "Masked — no scent / OSM targeting", "masked"]]) + rhChip(rhChk("ra-deflect", "it Deflects (MT +4)"), "deflect")""")

# conditions that stop the attack, or that the player should know about
rep("""    var autoMiss = rhStr("ra-cover", "0") === "x";""", """    var autoMiss = rhStr("ra-cover", "0") === "x";
    var cantAct = rhOn("ra-c-sequestered") ? "Sequestered: you cannot act until the cage is broken (CORE §4.7)." : rhOn("ra-c-encysted") ? "Encysted: you cannot act until the cyst is cracked (3 ATP, CORE §4.7)." : "";
    var cNotes = [];
    if (rhOn("ra-c-locked") && rhNum("ra-ev", 0)) cNotes.push("Locked: you cannot Begin a Burst, so its Effect Value counts as 0");
    if (rhOn("ra-c-denatured") && rhNum("ra-ev", 0) && !rhOn("ra-c-locked")) cNotes.push("Denatured: the Burst's Effect Value is halved");
    if (rhOn("ra-c-catabolic")) cNotes.push("Catabolic: every ATP cost is +1");
    if (rhOn("ra-c-jostled")) cNotes.push("Jostled: you have 1 PP fewer this Cycle");
    if (rhOn("ra-c-overclocked")) cNotes.push("Overclocked: +1 PP, mark 2 Stress at the end of the Cycle");
    if (rhOn("ra-c-flaccid")) cNotes.push("Flaccid: your reach is one band shorter");
    if (rhOn("ra-c-masked")) cNotes.push("Masked: this Strike ends it");
    if (rhOn("ra-t-masked")) cNotes.push("the target is Masked: it cannot be found by scent, OSM or tracking — you need to see or feel it");""")
rep("""      '<div class="rhl"><span class="lead">2 · Roll them.</span>""", """      (cNotes.length ? '<div class="rhsub rh-cnote">⚠ ' + cNotes.map(esc).join(" · ") + "</div>" : "") +
      '<div class="rhl"><span class="lead">2 · Roll them.</span>""")
rep("""      '<div class="row">' + (autoMiss ? '<span class="warnbox small">""", """      '<div class="row">' + (cantAct ? '<span class="warnbox small">' + cantAct + "</span>" : autoMiss ? '<span class="warnbox small">""")

# defence: your conditions
rep("""      '<div class="rh-chips">' + rhChip(rhChk("rd-jostled", "I am Jostled (MT −2)"), "jostled") + rhChip(rhChk("rd-turgid", "I am Turgid (MT −2)"), "turgid") + "</div>";""",
    """      '<div class="rh-chips">' + rhConds("rd-c", "Conditions on you", [["rd-jostled", "Jostled — your MT −2", "jostled"], ["rd-turgid", "Turgid — your MT −2", "turgid"],
        ["rd-marked", "Marked — the attacker gains +2 dice", "marked"], ["rd-brittle", "Brittle — soak halves vs Kinetic, Lytic ignores 2", "brittle"],
        ["rd-encysted", "Encysted — you take half damage", "encysted"], ["rd-masked", "Masked — it cannot find you by scent", "masked"]]) + "</div>";""")
rep("""    var rollPool = Math.max(0, aPool - (inhibOn ? 2 : 0));""", """    var rollPool = Math.max(0, aPool - (inhibOn ? 2 : 0) + (rhOn("rd-marked") ? 2 : 0)), dSoak = rhSoakAfter(soak, aTy, rhOn("rd-brittle")), dHalf = rhOn("rd-encysted");""")
rep("""    if (inhibOn) dpoolTerms.push(rhT("your Inhibition", "", -2, "inhib"));""", """    if (inhibOn) dpoolTerms.push(rhT("your Inhibition", "", -2, "inhib"));
    if (rhOn("rd-marked")) dpoolTerms.push(rhT("you are Marked", "", 2, "marked"));""")
rep('''rhT("your Soak", "", soak, "soak", false, true)], "at least 1 " + esc(aTy) + (react === "brace" && /Osmotic|Kinetic/.test(aTy) ? ", then halved (Brace)" : ""))''',
    '''rhT("your Soak" + (dSoak !== soak ? " (Brittle, was " + soak + ")" : ""), "", dSoak, dSoak !== soak ? "brittle" : "soak", false, true)], "at least 1 " + esc(aTy) + (react === "brace" && /Osmotic|Kinetic/.test(aTy) ? ", then halved (Brace)" : "") + (dHalf ? ", then halved (Encysted)" : ""))''')
rep("""    RH_LAST._defenceSetup = { mt: mtEff, soak: soak,""", """    RH_LAST._defenceSetup = { half: dHalf, mt: mtEff, soak: dSoak,""")
rep("""      if (hit && L.brace && /Osmotic|Kinetic/.test(L.ty)) dmg = Math.max(1, Math.floor(dmg / 2));""",
    """      if (hit && L.brace && /Osmotic|Kinetic/.test(L.ty)) dmg = Math.max(1, Math.floor(dmg / 2));
      if (hit && L.half) dmg = Math.max(1, Math.floor(dmg / 2));""")
rep("""        if (hit && X.brace && /Osmotic|Kinetic/.test(X.ty)) dmg = Math.max(1, Math.floor(dmg / 2));""",
    """        if (hit && X.brace && /Osmotic|Kinetic/.test(X.ty)) dmg = Math.max(1, Math.floor(dmg / 2));
        if (hit && X.half) dmg = Math.max(1, Math.floor(dmg / 2));""")
rep('''(L.brace && /Osmotic|Kinetic/.test(L.ty) ? ", halved by Brace" : "") + " = <b>"''', '''(L.brace && /Osmotic|Kinetic/.test(L.ty) ? ", halved by Brace" : "") + (L.half ? ", halved (Encysted)" : "") + " = <b>"''')

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
  function rhToggle(f) {
    if (f && f.classList.contains("rh-tight")) window.__rhView = window.__rhView === "work" ? "result" : "work";
    else window.__rhEq = window.__rhEq === false;
    fit();
  }
  var OXBS_MAP = [["--bg", "--bg"], ["--bg2", "--panel"], ["--panel", "--panel"], ["--panel2", "--panel2"], ["--line", "--line"], ["--tx", "--ink"], ["--tx2", "--dim"],
    ["--acc", "--accent"], ["--acc2", "--accent"], ["--good", "--ok"], ["--warn", "--warn-c"], ["--focus", "--no"], ["--sel", "--hl"]];
  function oxLight(c) { var m = /^#?([0-9a-f]{6})$/i.exec(String(c).trim()); if (!m) return false; var n = parseInt(m[1], 16); return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) > 150; }
  /* BitSight wears the Colours tab's scheme: its own colour variables are set from the app's, inside its frame */
  function bsTheme() {
    var fr = document.getElementById("bitsight-frame"); if (!fr) return;
    if (!fr.__oxth) { fr.__oxth = 1; fr.addEventListener("load", bsTheme); }
    var doc; try { doc = fr.contentDocument; } catch (e) { return; }
    if (!doc || !doc.head) return;
    var cs = getComputedStyle(document.documentElement), bg = cs.getPropertyValue("--bg").trim();
    var vars = OXBS_MAP.map(function (m) { var v = cs.getPropertyValue(m[1]).trim(); return v ? m[0] + ":" + v + " !important" : ""; }).filter(Boolean).join(";");
    var css = ":root,body,body.theme-light,body.theme-sepia,body.theme-black{" + vars + ";color-scheme:" + (oxLight(bg) ? "light" : "dark") + "}";
    var st = doc.getElementById("ox-theme");
    if (!st) { st = doc.createElement("style"); st.id = "ox-theme"; doc.head.appendChild(st); }
    if (st.textContent !== css) st.textContent = css;
    if (bg) fr.style.background = bg;
  }
  function fit() {
    try { bsTheme(); } catch (eT) {}
    var on = document.querySelector("#tabs .tab.on"), tab = on ? on.getAttribute("data-tab") : "", de = document.documentElement;
    if (de.getAttribute("data-oxtab") !== tab) {
      de.setAttribute("data-oxtab", tab);
      var custom = /^(learn|reader|bitsight|rollhelper|mtime|compendium|colours)$/.test(tab), cols = /^(aisetup|balance|clues|narrate|briefing|notebook|sessions|log|encounters|askbooks|ask)$/.test(tab);
      if (custom) de.removeAttribute("data-oxshell"); else de.setAttribute("data-oxshell", "");
      if (cols) de.setAttribute("data-oxcols", ""); else de.removeAttribute("data-oxcols");
    }
    [].forEach.call(document.querySelectorAll(".ox-fit"), size);
    var bs = document.getElementById("bitsight-frame"); if (bs && bs.offsetParent) size(bs);
    var cgf = document.getElementById("cg-frame"); if (cgf && cgf.offsetParent && window.innerWidth > 1050) { MIN = 420; size(cgf); MIN = 260; }
    [].forEach.call(document.querySelectorAll("[data-oxkeep]"), function (el) { var k = el.getAttribute("data-oxkeep"); if (keep[k] != null && el.scrollTop !== keep[k]) el.scrollTop = keep[k]; });
    if (document.querySelector(".mtx")) mtShow(window.__mtSel || "units");
    [].forEach.call(document.querySelectorAll("details[data-oxopen]"), function (d) {
      var k = d.getAttribute("data-oxopen"); if ((window.__oxOpen || {})[k] && !d.open) d.open = true;
      var pop = d.querySelector(".rh-cpop"), sm = d.querySelector("summary");
      if (d.open && pop && sm) { var r = sm.getBoundingClientRect(), w = pop.offsetWidth, hh = pop.offsetHeight;
        pop.style.left = Math.max(8, Math.min(r.right - w, window.innerWidth - w - 8)) + "px";
        pop.style.top = (r.bottom + 6 + hh > window.innerHeight - 8 ? Math.max(8, r.top - 6 - hh) : r.bottom + 6) + "px"; }
    });
    [].forEach.call(document.querySelectorAll(".rh-final"), function (f) {
      f.classList.toggle("eq-open", window.__rhEq !== false);
      var h4 = f.querySelector(".rhf h4"); if (h4 && !h4.hasAttribute("tabindex")) { h4.setAttribute("tabindex", "0"); h4.setAttribute("role", "button"); }
      if (h4) h4.setAttribute("aria-expanded", window.__rhEq !== false ? "true" : "false");
      var body = f.querySelector(".rh-body"); f.classList.remove("rh-tight", "v-work");
      if (body && body.scrollHeight > body.clientHeight + 2) {
        f.classList.add("rh-tight"); f.classList.add("eq-open"); if (window.__rhView === "work") f.classList.add("v-work");
        if (h4) h4.setAttribute("aria-expanded", window.__rhView === "work" ? "true" : "false");
      }
    });
  }
  document.addEventListener("toggle", function (e) { var d = e.target; if (d && d.getAttribute && d.getAttribute("data-oxopen")) { window.__oxOpen = window.__oxOpen || {}; window.__oxOpen[d.getAttribute("data-oxopen")] = d.open; if (d.open) fit(); } }, true);
  document.addEventListener("click", function (e) {
    if (e.target.closest && e.target.closest("details[data-oxopen]")) return;
    [].forEach.call(document.querySelectorAll("details[data-oxopen][open]"), function (d) { d.open = false; });
  }, true);
  document.addEventListener("scroll", function (e) { var el = e.target; if (el && el.getAttribute && el.getAttribute("data-oxkeep")) keep[el.getAttribute("data-oxkeep")] = el.scrollTop; }, true);
  document.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("[data-mtsel]");
    if (b) { window.__mtSel = b.getAttribute("data-mtsel"); keep["mtx-pane"] = 0; mtShow(window.__mtSel); var p = document.querySelector(".mtx-pane"); if (p) p.scrollTop = 0; return; }
    if (e.target.closest && e.target.closest("[data-rhroll]")) window.__rhView = "result";
    if (e.target.closest && e.target.closest(".rh-final .rhf h4")) { rhToggle(e.target.closest(".rh-final")); return; }
    if (e.target.closest && e.target.closest('[data-act="tab"]')) { setTimeout(fit, 30); setTimeout(fit, 250); }
  });
  document.addEventListener("keydown", function (e) { if ((e.key === "Enter" || e.key === " ") && e.target.closest && e.target.closest(".rh-final .rhf h4")) { e.preventDefault(); rhToggle(e.target.closest(".rh-final")); } });
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
# Learn / Reader frames: also take back any space left below them, so the page never scrolls
rep('if (room >= 520) { f.style.height = room + "px"; }',
    'if (room >= 520) { f.style.height = room + "px"; var spill = document.documentElement.scrollHeight - window.innerHeight; if (spill > 0 && room - spill >= 420) f.style.height = (room - spill) + "px"; }')
h = h.replace("The character generator and BitSight frames keep their own colours.", "BitSight follows this scheme too; the character generator keeps its own colours.")
# Ask the Books (and BitSight's library): the Society Rules and QUORUM join the four rulebooks
import os
def _book(bid, title, short, fname):
    md = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", fname), encoding="utf-8-sig").read()
    secs, cur, n = [], None, 0
    for line in md.split("\n"):
        m = re.match(r"^(#{1,6})\s+(.*)$", line)
        if m:
            n += 1; cur = {"id": "s%d" % n, "heading": m.group(2).strip(), "depth": len(m.group(1)), "body": ""}; secs.append(cur)
        else:
            if cur is None:
                n += 1; cur = {"id": "s%d" % n, "heading": title, "depth": 1, "body": ""}; secs.append(cur)
            cur["body"] += line + "\n"
    return {"id": bid, "title": title, "shortTitle": short, "kind": "setting", "baked": True, "readOnly": True, "fileName": fname, "sections": secs}
EXTRA = [_book("society", "The Osmotic Expanse — Society Rules and Social Norms", "SOCIETY", "The Osmotic Expanse - SOCIETY RULES AND SOCIAL NORMS.md"),
         _book("quorum", "QUORUM — Colonies, Kin, and Law", "QUORUM", "The Osmotic Expanse - QUORUM.md")]
rep('  var ASK = { q: "", results: [], answer: null,',
    '  var OX_EXTRA_BOOKS = ' + json.dumps(EXTRA, ensure_ascii=False).replace("</", "<\\/") + ';\n'
    '  (function () { try { var wb = DATA.world_books = DATA.world_books || {}; wb.books = wb.books || [];\n'
    '    OX_EXTRA_BOOKS.forEach(function (b) { if (!wb.books.some(function (x) { return x.id === b.id; })) wb.books.push(b); }); } catch (e) {} })();\n'
    '  var ASK = { q: "", results: [], answer: null,')
h = h.replace('sel("ask-scope", [{ v: "all", l: "all four rulebooks" }]', 'sel("ask-scope", [{ v: "all", l: "all the books (rulebooks, Society Rules, QUORUM)" }]')
h = h.replace("{ v: \"books\", l: \"the four books only\" }", "{ v: \"books\", l: \"the books only (no Vectors)\" }")
h = h.replace("the four rulebooks, searched in this browser; optional Claude answers; answers read aloud", "the rulebooks, the Society Rules and QUORUM, searched in this browser; optional Claude answers; answers read aloud")
# Players: AI Setup gets its own tab (it already worked there, opened from Ask the Books)
h = h.replace('var PA_KEEP = ["learn", "reader", "askbooks", "bitsight",', 'var PA_KEEP = ["learn", "reader", "askbooks", "aisetup", "bitsight",')
h = h.replace('PA_NAMES = {reader:"Reader",learn:"Learn to Play",askbooks:"Ask the Books",', 'PA_NAMES = {reader:"Reader",learn:"Learn to Play",askbooks:"Ask the Books",aisetup:"AI Setup",')
open(dst, "w", encoding="utf-8").write(h); print(dst, len(h))
