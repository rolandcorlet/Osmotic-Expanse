// The living backdrop behind the player and table screens (the D&D Director and the Skeleton share this file):
// a sky that follows the game clock, a scene picked from the place's own words (leaves in a forest, fog on a
// marsh, rain on a storm, embers in a forge, snow on the ice, candle motes at an inn, dust in a crypt), layers
// that shift with a finger or the phone's tilt, a darker vignette in a fight, a gold edge on your turn, a red
// pulse when you are badly hurt, grey when you are down, a campfire glow on a long rest, and a d20 that tumbles
// to its number. Every colour comes from the screen's CSS variables, so the Colours tab re-themes it.
//
//   initScene({ store })       once; store: { get(k), set(k, v) } for the Effects setting (full, light, off)
//   updateScene(info)          on every state change:
//     { place: { name, region, read }, hour (0-24, or null: no clock), fight, myTurn, hp (0..1, or null),
//       down, rested (a key that changes when a long rest happens) }
//   rollD20(value, { label, crit, fumble })   a d20 tumbles to value (crit: gold burst; fumble: a crack)
//   effectsMode() / setEffects(mode)
//
// Phones that ask for less motion get "light" (no drifting particles, no tilt) unless the player chooses.
// The drawing stops while the page is hidden.

const BIOMES = [
  // [name, words in the place's name, region or description, indoors?]
  ['embers', /\b(forge|foundry|furnace|smithy|lava|magma|volcan|ash|ember|burning|blaze|fire|cinder|inferno)\w*/i, false],
  ['snow', /\b(snow|ice|icy|frost|frozen|glacier|winter|tundra|blizzard|ice-?slide)\w*/i, false],
  ['rain', /\b(storm|rain|thunder|tempest|downpour|lightning|squall)\w*/i, false],
  ['fog', /\b(marsh|fen|bog|swamp|mire|fog|mist|haze|moor|causeway|drowned|greyfen)\w*/i, false],
  ['dust', /\b(crypt|tomb|barrow|vault|sanctum|cave|cavern|dungeon|catacomb|mine|sewer|undercroft|cellar|under)\w*/i, true],
  ['candle', /\b(inn|tavern|hall|temple|shrine|chapel|church|keep|manor|house|cottage|library|throne|tower|room|study)\w*/i, true],
  ['leaves', /\b(forest|wood|woods|grove|glade|briar|thicket|jungle|orchard|copse|road|path|trail|hills?)\w*/i, false],
  ['water', /\b(sea|coast|harbou?r|river|ford|lake|shore|beach|mill|dock|bay|falls|bridge|gorge)\w*/i, false],
];
export function biomeOf(place) {
  const words = `${(place && place.name) || ''} ${(place && place.region) || ''}`;
  const more = String((place && place.read) || '').slice(0, 240);
  for (const [name, re, indoors] of BIOMES) if (re.test(words)) return { name, indoors };
  for (const [name, re, indoors] of BIOMES) if (re.test(more)) return { name, indoors };
  return { name: 'motes', indoors: false };
}

let S = null;
const css = (k, d) => (getComputedStyle(document.documentElement).getPropertyValue(k).trim() || d);
export function effectsMode() {
  const set = S && S.store && S.store.get('fx.mode');
  if (set === 'full' || set === 'light' || set === 'off') return set;
  return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'light' : 'full';
}
export function setEffects(mode) { if (S && S.store) S.store.set('fx.mode', mode); applyMode(); }

export function initScene({ store } = {}) {
  if (S) return;
  const sky = document.createElement('div'); sky.className = 'scene-sky';
  const cv = document.createElement('canvas'); cv.className = 'scene-canvas';
  const veil = document.createElement('div'); veil.className = 'scene-veil';
  document.body.prepend(veil); document.body.prepend(cv); document.body.prepend(sky);
  S = { store, sky, cv, ctx: cv.getContext('2d'), veil, parts: [], biome: null, info: {}, tilt: { x: 0, y: 0 }, aim: { x: 0, y: 0 }, last: 0, raf: 0, rested: null, turnWas: false, palette: {} };
  const size = () => { const r = Math.min(2, window.devicePixelRatio || 1); cv.width = Math.round(innerWidth * r); cv.height = Math.round(innerHeight * r); S.ctx.setTransform(r, 0, 0, r, 0, 0); };
  size(); addEventListener('resize', size);
  addEventListener('pointermove', (e) => { S.aim.x = (e.clientX / innerWidth - 0.5) * 2; S.aim.y = (e.clientY / innerHeight - 0.5) * 2; }, { passive: true });
  const tilt = (e) => { if (e.gamma == null) return; S.aim.x = Math.max(-1, Math.min(1, e.gamma / 30)); S.aim.y = Math.max(-1, Math.min(1, (e.beta - 40) / 30)); };
  addEventListener('deviceorientation', tilt, { passive: true });
  // iOS asks before it shares the tilt: once, on the first tap.
  const ask = () => { removeEventListener('pointerdown', ask); const D = window.DeviceOrientationEvent; if (D && typeof D.requestPermission === 'function') D.requestPermission().catch(() => {}); };
  addEventListener('pointerdown', ask);
  document.addEventListener('visibilitychange', () => { if (document.hidden) cancelAnimationFrame(S.raf); else loop(); });
  applyMode();
  loop();
}
function applyMode() {
  const m = effectsMode();
  document.body.classList.toggle('fx-on', m !== 'off');
  document.body.classList.toggle('fx-light', m === 'light');
  if (S) S.cv.hidden = m !== 'full';
}

// The sky by the game clock: night, dawn, day, dusk, blended between them.
function skyAt(hour) {
  const P = { night: css('--sky-night', '#0b1020'), dawn: css('--sky-dawn', '#6b4a6e'), day: css('--sky-day', '#3d6a8e'), dusk: css('--sky-dusk', '#8a4b2e') };
  const h = ((Number(hour) % 24) + 24) % 24;
  const stops = [[0, 'night'], [5, 'night'], [6.5, 'dawn'], [8.5, 'day'], [17, 'day'], [19, 'dusk'], [20.5, 'night'], [24, 'night']];
  for (let i = 0; i < stops.length - 1; i++) {
    const [a, ka] = stops[i]; const [b, kb] = stops[i + 1];
    if (h >= a && h <= b) { const t = b === a ? 0 : (h - a) / (b - a); return { top: mix(P[ka], P[kb], t), night: (ka === 'night' ? 1 - t : 0) + (kb === 'night' ? t : 0) }; }
  }
  return { top: P.night, night: 1 };
}
function hex(c) { const t = String(c).trim(); const r = /^rgba?\((\d+),\s*(\d+),\s*(\d+)/i.exec(t); if (r) return [r[1], r[2], r[3]].map(Number); const m = /^#?([0-9a-f]{6})$/i.exec(t); return m ? [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16)) : [20, 17, 14]; }
function mix(a, b, t) { const x = hex(a); const y = hex(b); return `rgb(${x.map((v, i) => Math.round(v + (y[i] - v) * t)).join(',')})`; }

export function updateScene(info) {
  if (!S) return;
  S.info = info || {};
  const b = biomeOf(S.info.place);
  if (!S.biome || S.biome.name !== b.name) { S.biome = b; S.parts = []; }
  const B = document.body.classList;
  B.toggle('fx-indoors', b.indoors);
  for (const [n] of BIOMES) B.toggle(`fx-${n}`, n === b.name);
  // The sky: by the clock outdoors; indoors and below ground, the room's own light.
  const bg = css('--bg', '#14110e');
  if (!b.indoors && S.info.hour != null) {
    const k = skyAt(S.info.hour);
    S.skyTop = k.top;
    S.sky.style.background = `linear-gradient(180deg, ${k.top} 0%, color-mix(in srgb, ${k.top} 55%, ${bg}) 45%, color-mix(in srgb, ${k.top} 18%, ${bg}) 100%)`;
    S.night = k.night;
  } else if (!b.indoors) {
    S.sky.style.background = `linear-gradient(180deg, color-mix(in srgb, ${css('--sky-day', '#3d6a8e')} 45%, ${bg}) 0%, ${bg} 80%)`;
    S.night = 0;
  } else {
    const glow = b.name === 'candle' ? css('--fx-candle', '#e0a040') : css('--fx-dust', '#9a8a70');
    S.sky.style.background = `radial-gradient(120% 80% at 50% 110%, color-mix(in srgb, ${glow} 22%, ${bg}) 0%, ${bg} 70%)`;
    S.night = 0;
  }
  B.toggle('fx-fight', !!S.info.fight);
  B.toggle('fx-myturn', !!S.info.myTurn);
  B.toggle('fx-low', S.info.hp != null && S.info.hp > 0 && S.info.hp <= 0.25 && !S.info.down);
  B.toggle('fx-down', !!S.info.down);
  if (S.info.myTurn && !S.turnWas) { try { if (navigator.vibrate) navigator.vibrate(90); } catch (e) { /* fine */ } }
  S.turnWas = !!S.info.myTurn;
  if (S.info.rested != null && S.rested != null && S.info.rested !== S.rested) { B.add('fx-camp'); setTimeout(() => B.remove('fx-camp'), 6500); }
  S.rested = S.info.rested;
  S.palette = { bg: css('--bg', '#14110e'), sky: S.skyTop || css('--sky-day', '#3d6a8e'), leaf: css('--fx-leaf', '#c98a3a'), ember: css('--fx-ember', '#ff8a3c'), snow: css('--fx-snow', '#eef4ff'), rain: css('--fx-rain', '#9fb6d0'), fog: css('--fx-fog', '#c8c8c0'), dust: css('--fx-dust', '#9a8a70'), candle: css('--fx-candle', '#e0a040'), water: css('--fx-water', '#a8d4e6'), star: css('--fx-star', '#fff6d8') };
}

// ---- the particles: each scene its own, at three depths (the far ones move least with the tilt)
const COUNT = { leaves: 26, embers: 42, snow: 70, rain: 90, fog: 9, dust: 34, candle: 22, water: 30, motes: 26 };
function spawn(kind, w, h, anywhere) {
  const z = [0.35, 0.65, 1][Math.floor(Math.random() * 3)];
  const p = { kind, z, x: Math.random() * w, y: anywhere ? Math.random() * h : -20, a: Math.random() * Math.PI * 2, s: 0.5 + Math.random(), life: 1 };
  if (kind === 'embers' || kind === 'candle') { p.y = anywhere ? Math.random() * h : h + 10; }
  if (kind === 'fog') { p.y = h * (0.45 + Math.random() * 0.55); p.r = 120 + Math.random() * 200; }
  if (kind === 'water') { p.y = h * (0.55 + Math.random() * 0.45); }
  return p;
}
function loop(t = 0) {
  if (!S || document.hidden) return;
  S.raf = requestAnimationFrame(loop);
  const dt = Math.min(0.05, (t - S.last) / 1000 || 0.016); S.last = t;
  S.tilt.x += (S.aim.x - S.tilt.x) * 0.05; S.tilt.y += (S.aim.y - S.tilt.y) * 0.05;
  // The sky layer follows the tilt a little, for depth.
  S.sky.style.transform = `translate3d(${(-S.tilt.x * 8).toFixed(1)}px, ${(-S.tilt.y * 6).toFixed(1)}px, 0) scale(1.04)`;
  if (effectsMode() !== 'full' || !S.biome) return;
  const w = innerWidth; const h = innerHeight; const c = S.ctx;
  c.clearRect(0, 0, w, h);
  // Stars at night, outdoors.
  if (!S.biome.indoors && S.night > 0.05) {
    c.fillStyle = S.palette.star;
    for (let i = 0; i < 60; i++) {
      const x = ((i * 97.3) % 1) * 0 + ((i * 7919) % w); const y = (i * 3571) % (h * 0.5);
      c.globalAlpha = S.night * (0.35 + 0.35 * Math.sin(t / 900 + i));
      c.fillRect(x - S.tilt.x * 3, y - S.tilt.y * 2, 1.6, 1.6);
    }
    c.globalAlpha = 1;
  }
  // The land on the horizon, two ridges at different depths (trees in a forest, peaks in the mountains, a
  // flat line of reeds on the marsh); none indoors.
  if (!S.biome.indoors) ridges(c, w, h, S.biome.name);
  const kind = S.biome.name;
  const want = Math.round(COUNT[kind] * (w < 700 ? 0.6 : 1));
  while (S.parts.length < want) S.parts.push(spawn(kind, w, h, S.parts.length < want / 2 || !S.started));
  S.started = true;
  for (let i = S.parts.length - 1; i >= 0; i--) {
    const p = S.parts[i];
    const px = p.x - S.tilt.x * 24 * p.z; const py = p.y - S.tilt.y * 16 * p.z;
    let gone = false;
    switch (kind) {
      case 'leaves':
        p.a += dt * (1 + p.s); p.y += dt * 28 * p.z * p.s; p.x += Math.sin(p.a) * dt * 30 * p.z;
        c.save(); c.translate(px, py); c.rotate(p.a); c.globalAlpha = 0.8 * p.z; c.fillStyle = S.palette.leaf;
        c.beginPath(); c.ellipse(0, 0, 7 * p.z + 2, 3.2 * p.z + 1, 0, 0, Math.PI * 2); c.fill(); c.restore();
        gone = p.y > h + 20; break;
      case 'embers': case 'candle': {
        p.a += dt * 2; p.y -= dt * (kind === 'embers' ? 46 : 12) * p.z * p.s; p.x += Math.sin(p.a) * dt * 14; p.life -= dt * (kind === 'embers' ? 0.12 : 0.06);
        const col = kind === 'embers' ? S.palette.ember : S.palette.candle;
        c.globalAlpha = Math.max(0, p.life) * (0.5 + 0.5 * Math.sin(p.a * 3)) * p.z; c.fillStyle = col;
        c.beginPath(); c.arc(px, py, (kind === 'embers' ? 1.8 : 1.3) * p.z + 0.6, 0, Math.PI * 2); c.fill();
        gone = p.life <= 0 || p.y < -20; break;
      }
      case 'snow':
        p.a += dt; p.y += dt * 34 * p.z * p.s; p.x += Math.sin(p.a) * dt * 18 * p.z;
        c.globalAlpha = 0.75 * p.z; c.fillStyle = S.palette.snow; c.beginPath(); c.arc(px, py, 1.6 * p.z + 0.6, 0, Math.PI * 2); c.fill();
        gone = p.y > h + 10; break;
      case 'rain':
        p.y += dt * 620 * p.z; p.x -= dt * 90 * p.z;
        c.globalAlpha = 0.35 * p.z; c.strokeStyle = S.palette.rain; c.lineWidth = p.z;
        c.beginPath(); c.moveTo(px, py); c.lineTo(px + 4 * p.z, py - 14 * p.z); c.stroke();
        gone = p.y > h + 20; break;
      case 'fog': {
        p.x += dt * 10 * p.z * p.s; if (p.x - p.r > w) p.x = -p.r;
        const g = c.createRadialGradient(px, py, 0, px, py, p.r);
        g.addColorStop(0, S.palette.fog); g.addColorStop(1, 'transparent');
        c.globalAlpha = 0.07 + 0.05 * p.z; c.fillStyle = g; c.fillRect(px - p.r, py - p.r, p.r * 2, p.r * 2); break;
      }
      case 'water':
        p.a += dt * (1.5 + p.s); p.life -= dt * 0.25;
        c.globalAlpha = Math.max(0, Math.sin(p.a)) * 0.45 * p.z * Math.max(0, p.life); c.fillStyle = S.palette.water;
        c.fillRect(px, py, 6 * p.z + 2, 1.2); gone = p.life <= 0; break;
      default: // dust and motes: slow drifting specks
        p.a += dt * 0.6; p.x += Math.cos(p.a) * dt * 6; p.y += Math.sin(p.a * 0.7) * dt * 5 - dt * 3 * p.z;
        c.globalAlpha = (0.25 + 0.25 * Math.sin(p.a * 2)) * p.z; c.fillStyle = kind === 'dust' ? S.palette.dust : S.palette.star;
        c.beginPath(); c.arc(px, py, 1.1 * p.z + 0.4, 0, Math.PI * 2); c.fill();
        if (p.y < -10) p.y = h + 10; if (p.x < -10) p.x = w + 10; if (p.x > w + 10) p.x = -10;
    }
    if (gone) S.parts.splice(i, 1);
  }
  c.globalAlpha = 1;
}

function ridges(c, w, h, kind) {
  const bg = S.palette.bg || '#14110e';
  const layers = [[0.62, 0.35, 0.55], [0.74, 0.75, 0.82]]; // [height as a share of the screen, depth, darkness]
  const flat = kind === 'fog' || kind === 'water';
  for (const [base, z, dark] of flat ? [[0.7, 0.75, 0.7]] : layers) { // water and marsh: one low, soft shore
    const off = -S.tilt.x * 30 * z; const lift = -S.tilt.y * 10 * z;
    c.fillStyle = mix(S.palette.sky || '#3d6a8e', bg, dark); // a canvas cannot read color-mix()
    c.beginPath(); c.moveTo(-40, h);
    const step = kind === 'leaves' ? 14 : 40;
    for (let x = -40; x <= w + 40; x += step) {
      const k = (x + 997 * z) / w;
      let y = base * h + lift + Math.sin(k * 6.1 + z * 9) * h * 0.035 + Math.sin(k * 15.7 + z * 3) * h * 0.018;
      if (kind === 'leaves') y -= Math.abs(Math.sin(x * 0.37 + z * 11)) * h * 0.045 * z; // a ragged treeline
      if (kind === 'snow' || kind === 'embers') y -= Math.max(0, Math.sin(k * 9 + z * 5)) * h * 0.09; // peaks
      if (kind === 'fog' || kind === 'water') y = base * h + lift + 18 * z + Math.sin(k * 4 + z) * 6; // flat
      c.lineTo(x + off, y);
    }
    c.lineTo(w + 40, h); c.closePath(); c.fill();
  }
}

// ---- a d20 that tumbles to its number
let rollTimer = null;
export function rollD20(value, { label = '', crit = false, fumble = false } = {}) {
  if (effectsMode() === 'off') return;
  let el = document.getElementById('d20fx');
  if (!el) { el = document.createElement('div'); el.id = 'd20fx'; el.className = 'd20fx'; document.body.append(el); el.addEventListener('click', () => { el.hidden = true; }); }
  const light = effectsMode() === 'light';
  el.className = `d20fx${crit ? ' crit' : ''}${fumble ? ' fumble' : ''}${light ? ' still' : ''}`;
  el.innerHTML = `<div class="d20spin"><svg viewBox="0 0 100 100" aria-hidden="true"><polygon class="d20face" points="50,4 92,28 92,72 50,96 8,72 8,28"/><polyline class="d20edge" points="50,4 50,30 92,28 M50,30 8,28" fill="none"/><polygon class="d20inner" points="50,30 78,64 22,64"/><line class="d20edge" x1="22" y1="64" x2="8" y2="72"/><line class="d20edge" x1="78" y1="64" x2="92" y2="72"/><line class="d20edge" x1="22" y1="64" x2="50" y2="96"/><line class="d20edge" x1="78" y1="64" x2="50" y2="96"/>${fumble ? '<polyline class="d20crack" points="30,20 44,40 38,52 56,70 50,84" fill="none"/>' : ''}</svg><b class="d20num">${value}</b></div>${crit ? '<i class="d20burst"></i>' : ''}${label ? `<span class="d20label">${String(label).replace(/[<>&]/g, '')}</span>` : ''}`;
  el.hidden = false;
  // The number ticks through random faces while it tumbles, then lands.
  const num = el.querySelector('.d20num');
  if (!light) { let n = 0; const spin = setInterval(() => { num.textContent = 1 + Math.floor(Math.random() * 20); if (++n > 9) { clearInterval(spin); num.textContent = value; } }, 55); }
  clearTimeout(rollTimer);
  rollTimer = setTimeout(() => { el.hidden = true; }, crit || fumble ? 2600 : 1900);
}
