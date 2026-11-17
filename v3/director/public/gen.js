// Build your own organism: the player's step-by-step builder (v3). Phone first: one decision per
// screen, a live stat strip, and Back / Next always in reach. Every number shown here is a preview from
// the same maths the server uses (data/chargen); the server rebuilds the organism and is the judge.
import { preview, SEATS } from '/data/chargen/build.js';
import { ATLAS, INFO } from '/data/chargen/model.generated.js';

const KEYS = ['VSC', 'DFF', 'RTC', 'OSM', 'AFF'];
const PLAIN = { VSC: ['Toughness', 'health, carrying, how long you last when down'], DFF: ['Speed', 'actions per round, how hard you are to hit'], RTC: ['Chemistry', 'energy, making things, Bursts'], OSM: ['Senses', 'noticing, tasting, not being fooled'], AFF: ['Talk', 'persuading, leading, Oaths'] };
const BASE_STEPS = [
  ['seat', 'Your seat', 'What do you want to be at this table?'],
  ['lineage', 'Lineage', 'Your body plan and your people.'],
  ['phenotype', 'Phenotype', 'Your class: what you do best.'],
  ['baselines', 'Baselines', 'Place 4, 4, 3, 3 and 2 on your five talents.'],
  ['pathways', 'Pathways', 'Your class trains some skills. Pick two more.'],
  ['kit', 'Kit', 'Spend your Substrate on a weapon and some protection.'],
  ['name', 'Name and story', 'Who are you, and why are you here?'],
];
// Above Level 1 a Growth screen comes after Pathways: one Synthesis Choice per Level (ATLAS §1 Step 8).
function stepsFor(lv) {
  if (lv <= 1) return BASE_STEPS;
  const out = BASE_STEPS.slice();
  out.splice(5, 0, ['growth', 'Growth', `You start at Level ${lv}: spend ${lv - 1} Synthesis Choices.`]);
  return out;
}
const ROLE_FIT = { wall: /Guard|Tank|Brute|Bruiser|Breaker|Weaver/i, ledger: /Smith|Engineer|Splicer|Constructor|Reclaimer|Support|Weaver/i, rider: /Rider|Striker|Navigator|Messenger|Diver/i, eyes: /Scout|Detector|Mimic|Hijacker|Archer|Agent/i };
const PW_PREF = { wall: ['Vigour', 'Pressure Tolerance', 'Membrane Penetration', 'Chemoreception'], ledger: ['Synthesis', 'Chemoreception', 'Sequence Reading', 'Catalysis'], rider: ['Fluid Navigation', 'Pulse Discipline', 'Concealment', 'Chemoreception'], eyes: ['Chemoreception', 'Concealment', 'Sequence Reading', 'Fluid Navigation'] };
const SEAT_PLAIN = { wall: 'Stand in front. Take the hits so your friends do not.', ledger: 'Make, mend and read the small print. Know what everything is worth.', rider: 'Move through moving water like nobody else. Get people out.', eyes: 'Notice what others miss. Sneak. Smell a lie.' };

export function genStart(ui) { ui.gen = { step: 0, seat: null, c: { array: {}, extras: [], kit: {}, grown: {}, rankBumps: {}, bursts: [], adaptations: [] }, phAll: false, kitTab: 'weapon', growTab: 'talents', info: null, steps: BASE_STEPS }; }

const esc = (v) => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const byN = (list, n) => list.find((x) => x.n === n) || null;
const level = (state, G) => ((G.seat && state.organisms[G.seat]) || {}).level || 1;

function stepOk(G, i, pv) {
  const c = G.c, k = G.steps[i][0], P = pv.problems;
  if (k === 'seat') return !!G.seat;
  if (k === 'lineage') return !!c.lineage;
  if (k === 'phenotype') return !!c.phenotype && !P.some((p) => /Phenotype/i.test(p));
  if (k === 'baselines') return KEYS.every((x) => c.array[x]) && !P.some((p) => /array|total 16|creation range|Step 2/.test(p));
  if (k === 'pathways') return c.extras.length === 2 && !P.some((p) => /Pathway|Step 4/.test(p));
  if (k === 'growth') return !P.some((p) => /Synthesis Choice|Tier|AE capacity|grade cap|Sovereign|Specimen|Adaptation|Burst/.test(p));
  if (k === 'kit') return P.length === 0;
  return P.length === 0 && String(c.name || '').trim().length > 0;
}
function strip(pv, prev) {
  const m = pv.m, t = (l, v, k) => `<div class="tile${prev && prev[k] != null && prev[k] !== v ? ' pulse' : ''}"><div class="tl">${l}</div><div class="tv">${v}</div></div>`;
  return `<div class="tiles gstrip">${t('MI', m.mi, 'mi')}${t('PP', m.pp, 'pp')}${t('MT', m.mt, 'mt')}${t('ATP', m.atpMax, 'atp')}${t('Lysis', m.countdown, 'cd')}</div>`;
}
const info = (G, key, body) => `${G.info === key ? `<div class="note ginfo">${body}</div>` : ''}`;
const ibtn = (key) => `<button class="btn sm ghost" data-act="gen.info" data-k="${key}" aria-label="More about this">ⓘ</button>`;

function seatStep(G, state) {
  return `<div class="glist">${SEATS.map((s) => {
    const o = state.organisms[s.id] || {}, taken = o.playerId && o.playerId !== state.me.pid;
    return `<button class="gcard${G.seat === s.id ? ' on' : ''}" data-act="gen.seat" data-id="${s.id}" ${taken ? 'disabled' : ''}>
      <b>${esc(s.plain)}</b><span class="small">${esc(SEAT_PLAIN[s.id])}</span>
      <span class="small faint">${taken ? `taken${o.name ? ` by ${esc(o.name)}` : ''}` : `Your story hook: ${esc(o.tie || '')}`}</span></button>`;
  }).join('')}</div>`;
}

function lineageStep(G) {
  return `<div class="gswipe">${ATLAS.lineages.map((l) => {
    const t = INFO.lin[l.n] || {};
    return `<button class="gcard tall${G.c.lineage === l.n ? ' on' : ''}" data-act="gen.set" data-f="lineage" data-v="${esc(l.n)}">
      <img src="/creatures/lineage-${l.n.toLowerCase()}.webp" alt="" loading="lazy">
      <b>${esc(l.n)} <span class="dim small">${esc(l.e)}</span></b>
      <span class="small">${esc((t.intro || l.view || '').split('. ')[0])}.</span>
      <span class="row"><span class="chip ok">Gift: ${esc(l.gift.split(';')[0])}</span><span class="chip warn">Frailty: ${esc(l.fr)}</span></span>
      <span class="small dim">+1 ${PLAIN[l.up][0]} · −1 ${PLAIN[l.down][0]}</span></button>`;
  }).join('')}</div>${G.c.lineage ? `<div class="row"><span class="small dim grow">Swipe to compare. ${esc(G.c.lineage)}: ${esc(byN(ATLAS.lineages, G.c.lineage).frx)}</span>${ibtn('lin')}</div>${info(G, 'lin', `<b>Gift.</b> ${esc((INFO.lin[G.c.lineage] || {}).gift || '')}<br><b>Frailty.</b> ${esc((INFO.lin[G.c.lineage] || {}).frailty || '')}`)}` : '<div class="small dim">Swipe sideways, then tap one.</div>'}`;
}

function phenotypeStep(G) {
  const fit = ROLE_FIT[G.seat] || /./;
  const list = ATLAS.phenotypes.filter((p) => G.phAll || p.t === G.c.lineage);
  return `<div class="seg"><button class="${G.phAll ? '' : 'on'}" data-act="gen.phall" data-v="0">${esc(G.c.lineage || 'Your lineage')}</button><button class="${G.phAll ? 'on' : ''}" data-act="gen.phall" data-v="1">All 24</button></div>
    <div class="glist">${list.map((p) => {
      const t = INFO.ph[p.n] || {}, other = p.t !== G.c.lineage;
      return `<button class="gcard${G.c.phenotype === p.n ? ' on' : ''}" data-act="gen.set" data-f="phenotype" data-v="${esc(p.n)}" ${other ? 'disabled' : ''}>
        <b>${esc(p.n)} ${fit.test(p.n + ' ' + p.r) ? '<span class="chip ok">fits your seat</span>' : ''}</b>
        <span class="small">${esc(p.r)} · ${esc(t.how ? t.how.split('. ')[0] : '')}.</span>
        <span class="small dim">Signature ${esc(p.s)} · wants ${esc(p.k)}${other ? ` · ${esc(p.t)} only` : ''}</span></button>`;
    }).join('')}</div>`;
}

function baselinesStep(G, pv) {
  const c = G.c, lin = byN(ATLAS.lineages, c.lineage) || {}, used = Object.values(c.array).filter(Boolean);
  const pool = [4, 4, 3, 3, 2].slice(); for (const v of used) { const i = pool.indexOf(Number(v)); if (i >= 0) pool.splice(i, 1); }
  const pick = G.pick;
  return `<div class="row"><span class="small dim">Tap a number, then a talent.</span>${pool.map((v, i) => `<button class="chip big${pick && pick.i === i ? ' on' : ''}" data-act="gen.pick" data-v="${v}" data-i="${i}">${v}</button>`).join('') || '<span class="chip ok">All placed</span>'}</div>
    ${KEYS.map((k) => {
      const v = Number(c.array[k] || 0), adj = (lin.up === k ? 1 : 0) - (lin.down === k ? 1 : 0), g = pv.m.grade[k];
      return `<button class="grow-row${v ? ' set' : ''}" data-act="gen.place" data-k="${k}">
        <span class="gname"><b>${PLAIN[k][0]}</b> <span class="faint small">${k}</span><br><span class="small dim">${PLAIN[k][1]}</span></span>
        <span class="pips">${[1, 2, 3, 4, 5, 6].map((n) => `<i class="${n <= (v ? g : 0) ? 'on' : ''}"></i>`).join('')}</span>
        <span class="gval">${v ? g : '·'}${adj ? `<small class="${adj > 0 ? 'up' : 'dn'}">${adj > 0 ? '+1' : '−1'}</small>` : ''}</span></button>`;
    }).join('')}`;
}

function pathwaysStep(G, pv) {
  const ph = byN(ATLAS.phenotypes, G.c.phenotype) || { p: {} }, granted = ph.p || {};
  const rows = pv.m.pw.filter((p) => granted[p.n]).map((p) => `<div class="grow-row locked"><span class="gname"><b>${esc(p.n)}</b><br><span class="small dim">from your class · rank ${p.rank}</span></span><span class="gval">${p.pool == null ? `+${p.rank}<small>with any fitting talent</small>` : `${p.pool}<small>dice</small>`}</span></div>`).join('');
  const sh = preview({ ...G.c, extras: [] }, 1).m;
  const cand = ATLAS.pathways.filter((p) => !granted[p.n]).map((p) => {
    const on = G.c.extras.includes(p.n), dice = Math.max(0, ...String(p.b || '').split(/ or | \+ /).map((b) => sh.grade[b.trim()] || 0)) + 1;
    return `<button class="grow-row${on ? ' set' : ''}" data-act="gen.extra" data-v="${esc(p.n)}" ${!on && G.c.extras.length >= 2 ? 'disabled' : ''}>
      <span class="gname"><b>${esc(p.n)}</b><br><span class="small dim">${esc(p.g || '')}</span></span><span class="gval">${dice}<small>dice</small></span></button>`;
  }).join('');
  return `<div class="fl">From your class</div>${rows}<div class="fl">Pick two more (${G.c.extras.length} of 2)</div>${cand}`;
}

function growthStep(G, pv) {
  const m = pv.m, c = G.c, left = m.growthChoices - m.choicesSpent;
  const ph = byN(ATLAS.phenotypes, c.phenotype) || { p: {}, dom: '' };
  const tab = (id, l) => `<button class="${G.growTab === id ? 'on' : ''}" data-act="gen.growtab" data-v="${id}">${l}</button>`;
  const stepper = (kind, key, val, canUp, label, sub) => `<div class="grow-row"><span class="gname"><b>${label}</b><br><span class="small dim">${sub}</span></span>
    <span class="row"><button class="btn sm" data-act="gen.grow" data-kind="${kind}" data-k="${esc(key)}" data-d="-1" ${val > 0 ? '' : 'disabled'} aria-label="less">−</button>
    <button class="btn sm" data-act="gen.grow" data-kind="${kind}" data-k="${esc(key)}" data-d="1" ${canUp && left > 0 ? '' : 'disabled'} aria-label="more">+</button></span></div>`;
  let body = '';
  if (G.growTab === 'talents') body = KEYS.map((k) => { const g = m.grade[k], up = (c.grown || {})[k] || 0;
    return stepper('grown', k, up, g < 6, `${PLAIN[k][0]} ${g}${up ? ` <span class="chip ok">+${up}</span>` : ''}`, `${PLAIN[k][1]} · 6 is the most`); }).join('');
  else if (G.growTab === 'pathways') {
    const known = new Set(m.pw.map((p) => p.n));
    const all = [...m.pw.map((p) => p.n), ...ATLAS.pathways.map((p) => p.n).filter((n) => !known.has(n))];
    body = all.map((n) => { const p = m.pw.find((x) => x.n === n) || { rank: 0, pool: null }, up = (c.rankBumps || {})[n] || 0;
      return stepper('rankBumps', n, up, p.rank < 4, `${esc(n)} <span class="dim small">rank ${p.rank}</span>${up ? ` <span class="chip ok">+${up}</span>` : ''}`, p.pool != null && p.rank ? `${p.pool} dice` : p.rank ? 'class skill' : 'not trained yet'); }).join('');
  } else if (G.growTab === 'bursts') {
    const dom = String(ph.dom || '').toUpperCase();
    const list = ATLAS.bursts.filter((b) => b.t <= m.tierMax).sort((a, b) => (b.d === dom) - (a.d === dom) || a.t - b.t);
    body = `<div class="small dim">Bursts are chemical moves powered by ATP. Your class's domain is ${esc(ph.dom || '')}; Bursts from other domains cost more. You can hold ${m.aeCapacity} hot at once.</div>` + list.map((b) => { const on = c.bursts.includes(b.n);
      return `<button class="grow-row${on ? ' set' : ''}" data-act="gen.burst" data-v="${esc(b.n)}" ${!on && left <= 0 ? 'disabled' : ''}><span class="gname"><b>${esc(b.n)}</b> ${b.d === dom ? '<span class="chip ok">your domain</span>' : ''}<br><span class="small dim">${esc(b.d[0] + b.d.slice(1).toLowerCase())} · Tier ${b.t} · cost ${esc(b.c)} · ${esc(b.b)}</span></span><span class="gval">${on ? '✓' : '+'}</span></button>`; }).join('');
  } else {
    const sLeft = m.budget - m.spent - (m.adaptS || 0);
    body = `<div class="small dim">Adaptations change your body for good. Each costs one Choice and the Substrate shown, out of the ${m.budget} S you start with (${sLeft} S left).</div>` + ATLAS.adaptations.map((a) => { const on = c.adaptations.includes(a.n), spec = /\+\s*\d/.test(a.s), cost = parseInt(a.s, 10) || 0;
      return `<button class="grow-row${on ? ' set' : ''}" data-act="gen.adapt" data-v="${esc(a.n)}" ${!on && (spec || left <= 0 || cost > sLeft) ? 'disabled' : ''}><span class="gname"><b>${esc(a.n)}</b> <span class="chip">${esc(a.s)}</span><br><span class="small dim">${esc(a.e)}${spec ? ' · needs a Specimen, earned in play' : ''}</span></span><span class="gval">${on ? '✓' : '+'}</span></button>`; }).join('');
  }
  return `<div class="row"><span class="chip big${left ? '' : ' ok'}">${left} left</span><span class="small dim grow">of ${m.growthChoices} Synthesis Choices. Each one buys a talent point, a skill rank, a Burst or an Adaptation.</span></div>
    <div class="seg">${tab('talents', 'Talents')}${tab('pathways', 'Skills')}${tab('bursts', 'Bursts')}${tab('adapt', 'Adaptations')}</div><div class="glist">${body}</div>`;
}

function kitStep(G, pv) {
  const m = pv.m, left = m.budget - m.spent - (m.adaptS || 0), c = G.c;
  const meter = (l, v, max) => `<div class="meter"><span class="small dim">${l}</span><div class="bar"><i style="width:${Math.min(100, (v / Math.max(1, max)) * 100)}%"></i></div><span class="small">${v}/${max}</span></div>`;
  const tab = (id, l) => `<button class="${G.kitTab === id ? 'on' : ''}" data-act="gen.kittab" data-v="${id}">${l}</button>`;
  let list = '';
  const many = pv.m.stage.level > 1;  // Level 1 buys one weapon and one graft; above it, as the purse allows
  const has = (f, n) => [].concat(c.kit[f] || []).includes(n);
  const swapCost = (f, list) => (many ? 0 : [].concat(c.kit[f] || []).reduce((t, n) => t + ((byN(list, n) || {}).s || 0), 0));
  if (G.kitTab === 'weapon') list = ATLAS.apparatus.map((a) => { const on = has('apparatus', a.n), cant = !on && a.s - swapCost('apparatus', ATLAS.apparatus) > left;
    return `<button class="gcard${on ? ' on' : ''}" data-act="gen.kit" data-f="apparatus" data-v="${esc(a.n)}" ${cant ? 'disabled' : ''}><b>${esc(a.n)} <span class="chip">${a.s} S</span></b><span class="small">${esc(a.c)} · reach ${esc(String(a.b).split(' ')[0])} · ${esc(a.ty)} · damage ${esc(a.bd.split('/')[0])}</span><span class="small dim">${esc(a.pr)}</span></button>`; }).join('');
  else if (G.kitTab === 'vials') list = `<div class="small dim">Vials are one-use chemistry: a quick dose of ATP, a cure, a cloud. Buy as many as you like.</div>` + ATLAS.vials.map((v) => { const q = (c.kit.vials || {})[v.n] || 0;
    return `<div class="grow-row${q ? ' set' : ''}"><span class="gname"><b>${esc(v.n)} <span class="chip">${v.s} S</span></b><br><span class="small dim">${esc(v.e)}</span></span><span class="row"><button class="btn sm" data-act="gen.vial" data-v="${esc(v.n)}" data-d="-1" ${q ? '' : 'disabled'} aria-label="fewer">−</button><b style="min-width:18px;text-align:center">${q}</b><button class="btn sm" data-act="gen.vial" data-v="${esc(v.n)}" data-d="1" ${v.s > left ? 'disabled' : ''} aria-label="more">+</button></span></div>`; }).join('');
  else list = ATLAS.grafts.map((g) => { const on = has('graft', g.n), cant = !on && g.s - swapCost('graft', ATLAS.grafts) > left;
    return `<button class="gcard${on ? ' on' : ''}" data-act="gen.kit" data-f="graft" data-v="${esc(g.n)}" ${cant ? 'disabled' : ''}><b>${esc(g.n)} <span class="chip">${g.s} S</span></b><span class="small">${esc(g.f)} graft · soak ${g.so ?? 0}${g.mi ? ` · +${g.mi} MI` : ''}${g.dff ? ` · ${g.dff} Speed` : ''}</span>${g.sp ? `<span class="small dim">${esc(g.sp)}</span>` : ''}</button>`; }).join('');
  return `${meter('Substrate', m.spent + (m.adaptS || 0), m.budget)}${meter('Graft slots', m.slotsUsed, m.slots)}
    <div class="row"><button class="btn grow" data-act="gen.starter">Starter kit for a ${esc(c.phenotype || 'beginner')}</button></div>
    <div class="seg">${tab('weapon', many ? 'Weapons' : 'Weapon')}${tab('graft', 'Protection')}${tab('vials', 'Vials')}</div>${many ? '<div class="small dim">Above Level 1 you may buy more than one weapon or graft. Grafts need Graft Slots.</div>' : ''}<div class="glist">${list}</div>`;
}

function nameStep(G, pv, state) {
  const o = state.organisms[G.seat] || {}, m = pv.m, c = G.c;
  return `<label class="fld"><span class="fl">Name</span><div class="row"><input type="text" class="grow" data-k="gen.name" data-bind="gen.c.name" value="${esc(c.name || '')}" maxlength="40" placeholder="For example: Gorm the Unmoved" autocomplete="off"><button class="btn" data-act="gen.random">Random</button></div></label>
    <label class="fld"><span class="fl">Why you are here</span><input type="text" data-bind="gen.c.tie" value="${esc(c.tie ?? o.tie ?? '')}" maxlength="200"></label>
    <label class="fld"><span class="fl">Your first move</span><input type="text" data-bind="gen.c.firstMove" value="${esc(c.firstMove ?? o.firstMove ?? '')}" maxlength="120" placeholder='"I put myself between."'></label>
    <div class="note"><b>${esc(c.lineage)} ${esc(c.phenotype)}</b><br><span class="small">${KEYS.map((k) => `${PLAIN[k][0]} ${m.grade[k]}`).join(' · ')}</span><br>
      <span class="small dim">${m.pw.filter((p) => p.rank).map((p) => `${esc(p.n)} ${p.pool == null ? `+${p.rank}` : `${p.pool}d`}`).join(' · ')}</span><br>
      <span class="small dim">${m.bought.map((b) => esc(b.n)).join(' · ') || 'No kit'} · ${m.budget - m.spent} S left · Oath boxes ${m.oathBoxes}</span></div>`;
}

export function genHtml(ui, state) {
  const G = ui.gen, lv = level(state, G);
  if (G.steps.length !== stepsFor(lv).length) { G.steps = stepsFor(lv); G.step = Math.min(G.step, G.steps.length - 1); }
  const pv = preview(G.c, lv);
  const [k, title, plain] = G.steps[G.step];
  const ok = stepOk(G, G.step, pv);
  const body = { seat: () => seatStep(G, state), lineage: () => lineageStep(G), phenotype: () => phenotypeStep(G), baselines: () => baselinesStep(G, pv), pathways: () => pathwaysStep(G, pv), growth: () => growthStep(G, pv), kit: () => kitStep(G, pv), name: () => nameStep(G, pv, state) }[k]();
  const last = G.step === G.steps.length - 1;
  const lvNote = lv > 1 && k === 'seat' ? `<div class="note hot small">This adventure starts at Level ${lv}. After your Pathways you get a Growth screen with ${lv - 1} Synthesis Choices to spend${lv >= 6 ? `, and ${pv.m.budget} S of Substrate for kit` : ''}.</div>` : '';
  const out = `<div class="gen">
    <div class="ghead"><div class="dots">${G.steps.map((s, i) => `<button class="gdot${i === G.step ? ' on' : ''}${i < G.step ? ' done' : ''}" data-act="gen.go" data-i="${i}" ${i > G.step ? 'disabled' : ''} aria-label="${esc(s[1])}"></button>`).join('')}<span class="small dim">Step ${G.step + 1} of ${G.steps.length}</span><button class="btn sm ghost" data-act="gen.cancel">Ready-made instead</button></div>
      <h3>${esc(title)}</h3><div class="small dim">${esc(plain)}</div></div>
    <div class="gbody scroll" data-scroll="gen${G.step}">${lvNote}${body}</div>
    <div class="gfoot">${G.step > 0 ? strip(pv, G.prev) : ''}
      ${G.step > 0 && !ok && pv.problems.length ? `<div class="small gwarn">${esc(pv.problems[0])}</div>` : ''}
      <div class="row">${k === 'name' ? '' : '<button class="btn" data-act="gen.suggest">Suggest for me</button>'}<span class="grow"></span>
        <button class="btn" data-act="gen.back" ${G.step ? '' : 'disabled'}>Back</button>
        <button class="btn primary" data-act="${last ? 'gen.go.build' : 'gen.next'}" ${ok ? '' : 'disabled'}>${last ? 'Play this organism' : 'Next'}</button></div></div>
  </div>`;
  G.prev = { mi: pv.m.mi, pp: pv.m.pp, mt: pv.m.mt, atp: pv.m.atpMax, cd: pv.m.countdown };
  return out;
}

// ---- suggestions: always a legal next step ----
function suggestArray(G) {
  const ph = byN(ATLAS.phenotypes, G.c.phenotype), lin = byN(ATLAS.lineages, G.c.lineage) || {};
  const want = String((ph || {}).k || '').split(/,\s*/).filter(Boolean);
  const seatKeys = (SEATS.find((s) => s.id === G.seat) || { keys: [] }).keys;
  const order = [...want, ...seatKeys, ...KEYS].filter((k, i, a) => a.indexOf(k) === i && k !== lin.down);
  order.push(lin.down);
  const vals = [4, 4, 3, 3, 2]; const out = {};
  order.slice(0, 5).forEach((k, i) => { out[k] = vals[i]; });
  for (const k of KEYS) if (!out[k]) out[k] = vals.find((v, i) => !Object.values(out).includes(v)) || 3;
  return out;
}
// Spend every Synthesis Choice sensibly: the class's two key talents and its best skill, one Burst from
// the class's own domain, round and round, never past the caps.
function suggestGrowth(G, lv) {
  const c = G.c; c.grown = {}; c.rankBumps = {}; c.bursts = []; c.adaptations = [];
  const ph = byN(ATLAS.phenotypes, c.phenotype) || { p: {}, k: '', dom: '' };
  const keys = String(ph.k).split(/,\s*/).filter(Boolean);
  const skills = Object.entries(ph.p || {}).sort((a, b) => b[1] - a[1]).map(([n]) => n);
  const dom = String(ph.dom || '').toUpperCase();
  const plan = [['grown', keys[0]], ['rankBumps', skills[0]], ['burst'], ['grown', keys[1]], ['rankBumps', skills[1] || skills[0]], ['grown', keys[0]], ['rankBumps', skills[0]]];
  for (let guard = 0; guard < 60; guard++) {
    const m = preview(c, lv).m;
    if (m.choicesSpent >= m.growthChoices) break;
    const [kind, key] = plan[guard % plan.length];
    if (kind === 'burst') {
      const b = ATLAS.bursts.filter((x) => x.d === dom && x.t <= m.tierMax && !c.bursts.includes(x.n)).sort((a, z) => z.t - a.t)[0];
      if (b && c.bursts.length < Math.max(1, m.aeCapacity)) c.bursts = [...c.bursts, b.n];
      continue;
    }
    if (!key) continue;
    if (kind === 'grown' && m.grade[key] >= 6) continue;
    if (kind === 'rankBumps' && (m.pw.find((p) => p.n === key) || { rank: 0 }).rank >= 4) continue;
    c[kind] = { ...c[kind], [key]: (c[kind][key] || 0) + 1 };
  }
}
function starterKit(G, pv) {
  const ph = byN(ATLAS.phenotypes, G.c.phenotype) || {}, k = String(ph.k || '');
  const weapon = /VSC/.test(k.split(',')[0]) ? 'Chitin Flail' : /RTC/.test(k.split(',')[0]) ? 'Spore Pistol' : 'Peptide Blade';
  const kit = { apparatus: [weapon], vials: {} };
  const cost = (byN(ATLAS.apparatus, weapon) || {}).s || 0;
  // The best protective graft the rest of the Substrate buys (Adaptations already paid for).
  const rem = pv.m.budget - cost - (pv.m.adaptS || 0);
  const armour = ATLAS.grafts.filter((g) => (g.so || 0) >= 1 && g.s <= rem && (g.sl || 0) + (G.c.lineage === 'Amoeban' ? 1 : 0) <= pv.m.slots && !(G.c.lineage === 'Amoeban' && g.f === 'Testate') && !(G.c.lineage === 'Lysosan' && g.n === 'Antigen Hood') && !/\+\s*\d/.test(String(g.s)))
    .sort((x, y) => y.s - x.s)[0];
  if (armour) kit.graft = [armour.n];
  // two of the cheapest Vial with what is left, so a new player has a dose of ATP in reserve
  const spare = rem - (armour ? armour.s : 0);
  const vial = ATLAS.vials.slice().sort((x, y) => x.s - y.s)[0];
  if (vial && spare >= vial.s * 2) kit.vials[vial.n] = 2;
  return kit;
}

export function genActs(ui, getState, { send, toast, randomName }) {
  const G = () => ui.gen;
  const S = () => getState();
  return {
    'gen.open': () => genStart(ui),
    'gen.cancel': () => { ui.gen = null; },
    'gen.info': (d) => { G().info = G().info === d.k ? null : d.k; },
    'gen.seat': (d) => { G().seat = d.id; },
    'gen.set': (d) => { G().c[d.f] = d.v; if (d.f === 'lineage') { G().c.phenotype = null; } if (d.f === 'phenotype') G().c.extras = []; },
    'gen.phall': (d) => { G().phAll = d.v === '1'; },
    'gen.pick': (d) => { G().pick = { v: Number(d.v), i: Number(d.i) }; },
    'gen.place': (d) => { const g = G(); if (g.pick) { g.c.array = { ...g.c.array, [d.k]: g.pick.v }; g.pick = null; } else if (g.c.array[d.k]) { const a = { ...g.c.array }; delete a[d.k]; g.c.array = a; } else toast('Tap a number first, then the talent.'); },
    'gen.extra': (d) => { const e = G().c.extras; G().c.extras = e.includes(d.v) ? e.filter((x) => x !== d.v) : [...e, d.v].slice(0, 2); },
    'gen.kittab': (d) => { G().kitTab = d.v; },
    'gen.kit': (d) => {
      const g = G(), k = { ...g.c.kit }, cur = [].concat(k[d.f] || []);
      const many = level(S(), g) > 1;
      k[d.f] = cur.includes(d.v) ? cur.filter((x) => x !== d.v) : many ? [...cur, d.v] : [d.v];
      g.c.kit = k;
    },
    'gen.vial': (d) => { const g = G(), v = { ...(g.c.kit.vials || {}) }; v[d.v] = Math.max(0, (v[d.v] || 0) + Number(d.d)); if (!v[d.v]) delete v[d.v]; g.c.kit = { ...g.c.kit, vials: v }; },
    'gen.starter': () => { G().c.kit = starterKit(G(), preview(G().c, level(S(), G()))); },
    'gen.random': () => { G().c.name = randomName(); },
    'gen.go': (d) => { G().step = Number(d.i); },
    'gen.back': () => { G().step = Math.max(0, G().step - 1); },
    'gen.next': () => { G().step = Math.min(G().steps.length - 1, G().step + 1); },
    'gen.growtab': (d) => { G().growTab = d.v; },
    'gen.grow': (d) => { const g = G(), box = { ...(g.c[d.kind] || {}) }; box[d.k] = Math.max(0, (box[d.k] || 0) + Number(d.d)); if (!box[d.k]) delete box[d.k]; g.c[d.kind] = box; },
    'gen.burst': (d) => { const b = G().c.bursts || []; G().c.bursts = b.includes(d.v) ? b.filter((x) => x !== d.v) : [...b, d.v]; },
    'gen.adapt': (d) => { const a = G().c.adaptations || []; G().c.adaptations = a.includes(d.v) ? a.filter((x) => x !== d.v) : [...a, d.v]; },
    'gen.suggest': () => {
      const g = G(), k = g.steps[g.step][0];
      if (k === 'seat') g.seat = g.seat || (SEATS.find((s) => !(S().organisms[s.id] || {}).playerId) || SEATS[0]).id;
      if (k === 'lineage') g.c.lineage = g.c.lineage || { wall: 'Barophil', ledger: 'Epithalian', rider: 'Flagellan', eyes: 'Lysosan' }[g.seat] || 'Amoeban';
      if (k === 'phenotype') { const fit = ROLE_FIT[g.seat] || /./; const p = ATLAS.phenotypes.filter((x) => x.t === g.c.lineage); g.c.phenotype = (p.find((x) => fit.test(x.n + ' ' + x.r)) || p[0]).n; }
      if (k === 'baselines') g.c.array = suggestArray(g);
      if (k === 'pathways') { const granted = (byN(ATLAS.phenotypes, g.c.phenotype) || {}).p || {}; const pref = [...(PW_PREF[g.seat] || []), ...ATLAS.pathways.map((p) => p.n)]; g.c.extras = pref.filter((n, i, a) => a.indexOf(n) === i && !granted[n]).slice(0, 2); }
      if (k === 'growth') suggestGrowth(g, level(S(), g));
      if (k === 'kit') g.c.kit = starterKit(g, preview(g.c, level(S(), g)));
      if (k === 'name') g.c.name = randomName();
    },
    'gen.go.build': async () => {
      const g = G();
      if (await send({ type: 'org.build', seat: g.seat, choices: g.c })) { ui.gen = null; toast('Your organism is ready.', true); }
    },
  };
}

// ---- Growth in play (ATLAS 4.1): after a rest, an organism with the Codon chooses its Synthesis
// Choice here. The Engine checks and pays it (org.grow).
const CODON_AT = (L) => { const n = Math.max(1, Math.min(20, L)) - 1; return 10 * n * n + 30 * n; };
const STAGE = (L) => (L <= 5 ? 1 : L <= 10 ? 2 : L <= 15 ? 3 : 4);
export function growNeeds(level) { const t = STAGE(level + 1) > STAGE(level); return { level: level + 1, choices: t ? 2 : 1, stage: t, tier: STAGE(level + 1) }; }
export function codonLine(o) { const next = CODON_AT(o.level + 1); return o.level >= 20 ? '' : `Level ${o.level + 1} at ${next} Codon`; }

export function growHtml(ui, o) {
  const G = ui.grow || (ui.grow = { tab: 'talents', picks: [] });
  const need = growNeeds(o.level);
  const picked = (kind, key) => G.picks.some((p) => p.kind === kind && p.key === key);
  const full = G.picks.length >= need.choices;
  const row = (kind, key, title, sub, ok = true, note = '') => {
    const on = picked(kind, key);
    return `<button class="grow-row${on ? ' set' : ''}" data-act="grow.pick" data-kind="${kind}" data-k="${esc(key)}" ${!on && (full || !ok) ? 'disabled' : ''}><span class="gname"><b>${title}</b><br><span class="small dim">${sub}${note ? ` · ${note}` : ''}</span></span><span class="gval">${on ? '✓' : '+'}</span></button>`;
  };
  const tab = (id, l) => `<button class="${G.tab === id ? 'on' : ''}" data-act="grow.tab" data-v="${id}">${l}</button>`;
  let body = '';
  if (G.tab === 'talents') {
    const oneGrade = G.picks.some((p) => p.kind === 'grown');
    body = KEYS.map((k) => row('grown', k, `${PLAIN[k][0]} ${o.base[k]} → ${o.base[k] + 1}`, PLAIN[k][1], o.base[k] < 6 && (!oneGrade || picked('grown', k)), o.base[k] >= 6 ? 'already 6' : '')).join('');
  } else if (G.tab === 'skills') {
    const names = [...new Set([...Object.keys(o.pathways || {}), ...ATLAS.pathways.map((p) => p.n)])];
    body = names.map((n) => { const r = (o.pathways || {})[n] || 0; return row('rank', n, `${esc(n)} ${r} → ${r + 1}`, r ? 'trained' : 'new skill', r < 4, r >= 4 ? 'Sovereign already' : ''); }).join('');
  } else if (G.tab === 'bursts') {
    const ph = ATLAS.phenotypes.find((p) => String(o.phenotype || '').includes(p.n)) || {};
    const dom = String(ph.dom || '').toUpperCase();
    const known = o.bursts || [];
    body = ATLAS.bursts.filter((b) => b.t <= need.tier && !known.includes(b.n)).sort((a, b) => (b.d === dom) - (a.d === dom) || a.t - b.t)
      .map((b) => row('burst', b.n, `${esc(b.n)}${b.d === dom ? ' <span class="chip ok">your domain</span>' : ''}`, `${esc(b.d[0] + b.d.slice(1).toLowerCase())} · Tier ${b.t} · cost ${esc(b.c)} · ${esc(b.b)}`)).join('');
  } else {
    const spent = G.picks.filter((p) => p.kind === 'adapt').reduce((t, p) => t + (parseInt((ATLAS.adaptations.find((a) => a.n === p.key) || {}).s, 10) || 0), 0);
    const left = o.substrate - spent;
    body = `<div class="small dim">${o.substrate} S on hand${spent ? `, ${left} S after these` : ''}.</div>` + ATLAS.adaptations.filter((a) => !(o.adaptations || []).includes(a.n)).map((a) => {
      const spec = /\+\s*\d/.test(a.s), cost = parseInt(a.s, 10) || 0;
      return row('adapt', a.n, `${esc(a.n)} <span class="chip">${esc(a.s)}</span>`, esc(a.e), !spec && (cost <= left || picked('adapt', a.n)), spec ? 'needs a Specimen: ask the host' : cost > left ? 'not enough Substrate' : '');
    }).join('');
  }
  const chosen = G.picks.map((p) => `<span class="chip on">${esc(p.kind === 'grown' ? `${PLAIN[p.key][0]} +1` : p.kind === 'rank' ? `${p.key} +1` : p.key)} <button class="btn sm ghost" data-act="grow.pick" data-kind="${p.kind}" data-k="${esc(p.key)}" aria-label="remove">×</button></span>`).join(' ');
  return `<section class="card grow-card"><h3>Grow to Level ${need.level}${need.stage ? ` · Stage ${['', 'I', 'II', 'III', 'IV'][need.tier]}` : ''}<span class="right"><span class="chip ok">+${2 + (need.stage ? 6 : 0)} max MI</span></span></h3>
    <div class="small">${need.choices === 2 ? 'A Stage transition: choose <b>two</b> Synthesis Choices (one is free), and describe what changed in your body.' : 'Choose <b>one</b> Synthesis Choice.'} ${G.picks.length} of ${need.choices} chosen.</div>
    ${chosen ? `<div class="row">${chosen}</div>` : ''}
    <div class="seg">${tab('talents', 'Talents')}${tab('skills', 'Skills')}${tab('bursts', 'Bursts')}${tab('adapt', 'Adaptations')}</div>
    <div class="glist scroll" style="max-height:46vh" data-scroll="grow">${body}</div>
    <div class="row"><span class="grow"></span><button class="btn primary" data-act="grow.go" data-id="${o.id}" ${G.picks.length === need.choices ? '' : 'disabled'}>Grow to Level ${need.level}</button></div>
  </section>`;
}

export function growActs(ui, { send, toast }) {
  const G = () => ui.grow || (ui.grow = { tab: 'talents', picks: [] });
  return {
    'grow.tab': (d) => { G().tab = d.v; },
    'grow.pick': (d) => {
      const g = G(), i = g.picks.findIndex((p) => p.kind === d.kind && p.key === d.k);
      if (i >= 0) g.picks.splice(i, 1); else g.picks.push({ kind: d.kind, key: d.k });
    },
    'grow.go': async (d) => {
      if (await send({ type: 'org.grow', organismId: d.id, choices: G().picks })) { ui.grow = null; toast('You have Grown.', true); }
    },
  };
}
