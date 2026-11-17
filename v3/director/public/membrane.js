// The living membrane: a fluid of the Expanse behind the Play screen.
//
// On devices with WebGPU it is a real fluid simulation on the graphics card (stable fluids:
// forces, vorticity, a pressure solve, advection), lit like a water surface with caustics. The
// Cohort and the creatures at the site swim in it as cells. It answers the game: a Pulse War
// turns the water red and fast with a heartbeat; the Director thinking stirs a slow vortex;
// a roll blooms green or red from your cell; a new line of story sends a wave down from the
// top; your finger or mouse stirs it. Without WebGPU, a lighter 2D drawing does the same things.
//
// startMembrane(canvas) -> { kind, scene({ fight, thinking, myTurn, cells }), burst(kind, at), setOn(bool) }

const MAX_SPLATS = 16;
const KEEP = [];
const MAX_CELLS = 12;

export async function startMembrane(canvas) {
  let back = null;
  if (navigator.gpu && !/[?&]water=2d\b/.test(location.search)) {
    try { back = await gpuBackend(canvas); } catch (e) { console.warn('Living water: WebGPU failed, using the 2D water.', e); back = null; }
  }
  if (!back) {
    canvas = freshCanvas(canvas);
    back = flatBackend(canvas);
  }
  const core = makeCore(canvas);
  core.attach(back);
  return core.api;
}

// A canvas keeps the first kind of context it was given, so the 2D water needs a new one.
function freshCanvas(canvas) {
  if (!canvas.dataset.ctx) return canvas;
  const fresh = canvas.cloneNode(false);
  delete fresh.dataset.ctx;
  canvas.replaceWith(fresh);
  return fresh;
}

// ------------------------------------------------------------------ the shared part
function makeCore(canvas) {
  let back = null;
  let on = false;
  let raf = 0;
  let last = 0;
  let t0 = performance.now();
  const mood = { fight: 0, thinking: 0, myTurn: 0 };
  const want = { fight: 0, thinking: 0, myTurn: 0 };
  const cells = new Map();
  const splats = [];
  let colours = null;
  let colourAt = 0;
  let asp = 1;
  let pointer = null;

  const q = (clientX, clientY) => {
    const r = canvas.getBoundingClientRect();
    return [((clientX - r.left) / r.width) * asp, (clientY - r.top) / r.height];
  };
  function readColours() {
    const cs = getComputedStyle(document.documentElement);
    const hex = (k, d) => {
      const v = (cs.getPropertyValue(k) || d).trim().replace('#', '');
      const h = v.length === 3 ? v.split('').map((c) => c + c).join('') : v.padEnd(6, '0');
      return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
    };
    colours = { bg: hex('--bg', '#12141a'), acc: hex('--accent', '#7aa2f7'), red: hex('--no', '#e06c6c'), grn: hex('--ok', '#5bbf7a'), warn: hex('--warn-c', '#d8a24a') };
    const L = 0.299 * colours.bg[0] + 0.587 * colours.bg[1] + 0.114 * colours.bg[2];
    colours.light = L > 0.55;
  }
  const colourOf = (kind) => (kind === 'me' ? colours.acc : kind === 'ally' ? colours.grn : kind === 'foe' ? colours.red : colours.warn);
  const splat = (x, y, dx, dy, rgb, rad, prio = 0) => {
    splats.push({ x, y, dx, dy, rgb, rad, prio });
  };

  function onMove(e) {
    if (!on) return;
    const [x, y] = q(e.clientX, e.clientY);
    if (pointer) {
      const dx = x - pointer[0];
      const dy = y - pointer[1];
      const fast = Math.hypot(dx, dy);
      if (fast > 0.0005) {
        const down = e.buttons || e.pointerType === 'touch';
        const k = down ? 9 : 4;
        const tint = down ? colours.acc.map((c) => c * 0.35) : [0, 0, 0];
        splat(x, y, clamp(dx * k, -0.6, 0.6), clamp(dy * k, -0.6, 0.6), tint, down ? 0.06 : 0.045, 1);
      }
    }
    pointer = [x, y];
  }
  function onDown(e) {
    if (!on) return;
    const [x, y] = q(e.clientX, e.clientY);
    pointer = [x, y];
    ring(x, y, colours.acc, 0.08, 6, 0.25);
  }
  window.addEventListener('pointermove', onMove, { passive: true });
  window.addEventListener('pointerdown', onDown, { passive: true });
  window.addEventListener('pointerleave', () => { pointer = null; }, { passive: true });

  function ring(x, y, rgb, speed, n, strength, rad = 0.05) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.4;
      splat(x + Math.cos(a) * 0.02, y + Math.sin(a) * 0.02, Math.cos(a) * speed, Math.sin(a) * speed, rgb.map((c) => c * strength), rad, 2);
    }
  }

  // The cells: the Cohort and the creatures, wandering the water on their own.
  function stepCells(dt, t) {
    const list = [...cells.values()];
    const me = list.find((c) => c.kind === 'me' && !c.gone);
    for (const c of list) {
      c.size += ((c.gone ? 0 : c.target) - c.size) * Math.min(1, dt * 1.5);
      c.turn += (noise1(t * 0.13 + c.phase * 7) - 0.5) * dt * 2.2;
      const speed = 0.018 * (1 + mood.fight * 1.8) * (c.kind === 'foe' ? 1.2 : 1);
      let ax = (Math.cos(c.turn) * speed - c.vx) * 0.6;
      let ay = (Math.sin(c.turn) * speed - c.vy) * 0.6;
      if (mood.fight > 0.3 && c.kind === 'foe' && me) { // in a Pulse War the creatures close on you
        ax += (me.x - c.x) * 0.05 * mood.fight;
        ay += (me.y - c.y) * 0.05 * mood.fight;
      }
      for (const o of list) {
        if (o === c) continue;
        const dx = c.x - o.x;
        const dy = c.y - o.y;
        const d = Math.hypot(dx, dy) + 1e-4;
        const min = (c.size + o.size) * 1.25;
        if (d < min) { ax += (dx / d) * (min - d) * 3; ay += (dy / d) * (min - d) * 3; }
      }
      const m = 0.08; // keep inside the glass
      if (c.x < m) ax += (m - c.x) * 2; if (c.x > asp - m) ax -= (c.x - (asp - m)) * 2;
      if (c.y < m) ay += (m - c.y) * 2; if (c.y > 1 - m) ay -= (c.y - (1 - m)) * 2;
      c.vx += ax * dt;
      c.vy += ay * dt;
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      if (c.gone && c.size < 0.002) cells.delete(c.id);
    }
  }

  // The backup: if the graphics card stops (the device is lost, a draw throws) or this device
  // cannot keep up (under about 24 frames a second for four seconds), carry on in the 2D water.
  let slow = 0;
  let slowFor = 0;
  function fallBack(why) {
    if (!back || back.kind !== 'webgpu') return;
    console.warn(`Living water: switching to the 2D water (${why}).`);
    const was = canvas.hidden;
    canvas = freshCanvas(canvas);
    canvas.hidden = was;
    back = flatBackend(canvas);
    api.kind = back.kind;
    api.why = why;
    if (api.onKind) api.onKind(back.kind, why);
  }

  function frame(now) {
    raf = on ? requestAnimationFrame(frame) : 0;
    if (!back) return;
    if (document.hidden) { last = now; return; }
    const raw = (now - (last || now)) / 1000;
    const dt = Math.min(0.05, Math.max(0.001, raw));
    last = now;
    if (back.kind === 'webgpu') {
      if (back.failed()) { fallBack('the graphics card stopped'); return; }
      slow += (raw - slow) * 0.05;
      slowFor = raw > 0 && raw < 1 && slow > 0.042 ? slowFor + raw : 0;
      if (slowFor > 4 && !window.__waterKeepGpu) { fallBack('too slow on this device'); return; }
    }
    const t = (now - t0) / 1000;
    if (!colours || now - colourAt > 1000) { readColours(); colourAt = now; }
    for (const k of Object.keys(mood)) mood[k] += (want[k] - mood[k]) * Math.min(1, dt * 1.2);
    asp = back.aspect();
    stepCells(dt, t);
    // The cells leave a faint wake of their own colour.
    for (const c of cells.values()) {
      if (Math.random() < 0.5) splat(c.x, c.y, c.vx * 1.5, c.vy * 1.5, colourOf(c.kind).map((v) => v * 0.05), c.size * 0.9, 0);
    }
    if (mood.fight > 0.2 && Math.random() < dt * 1.1) { // heartbeat shocks in a Pulse War
      ring(Math.random() * asp, Math.random(), colours.red, 0.06 * mood.fight, 5, 0.18, 0.07);
    }
    splats.sort((a, b) => b.prio - a.prio);
    const send = splats.splice(0, MAX_SPLATS);
    splats.length = Math.min(splats.length, 40);
    const cellList = [...cells.values()].slice(0, MAX_CELLS).map((c) => ({ x: c.x, y: c.y, rad: c.size, kind: c.kind, rgb: colourOf(c.kind), phase: c.phase }));
    try { back.draw({ dt, t, asp, mood, colours, splats: send, cells: cellList }); } catch (e) {
      if (back.kind === 'webgpu') fallBack(e.message || 'a drawing error'); else console.warn('Living water:', e);
    }
  }

  const api = {
    kind: 'none',
    scene(s) {
      want.fight = s.fight ? 1 : 0;
      want.thinking = s.thinking ? 1 : 0;
      want.myTurn = s.myTurn ? 1 : 0;
      const seen = new Set();
      for (const c of (s.cells || []).slice(0, MAX_CELLS)) {
        seen.add(c.id);
        const old = cells.get(c.id);
        const target = (c.kind === 'me' ? 0.075 : c.kind === 'foe' ? 0.06 : 0.055) * (c.scale || 1);
        if (old) { old.kind = c.kind; old.target = target; old.gone = false; continue; }
        const edge = Math.random() < 0.5;
        cells.set(c.id, {
          id: c.id, kind: c.kind, target, size: 0.001, phase: Math.random() * 6.28, turn: Math.random() * 6.28,
          x: edge ? (Math.random() < 0.5 ? 0.1 : asp - 0.1) : 0.2 + Math.random() * (asp - 0.4), y: 0.2 + Math.random() * 0.6, vx: 0, vy: 0,
        });
      }
      for (const c of cells.values()) if (!seen.has(c.id)) c.gone = true;
    },
    // A moment in the game: 'ok' and 'no' bloom from a cell, 'story' is a wave from the top,
    // 'fight' is a shockwave from the middle.
    burst(kind, at) {
      if (!on || !colours) return;
      const c = at && cells.get(at);
      const x = c ? c.x : asp * (0.3 + Math.random() * 0.4);
      const y = c ? c.y : 0.4 + Math.random() * 0.2;
      if (kind === 'ok') ring(x, y, colours.grn, 0.22, 10, 0.5, 0.05);
      else if (kind === 'no') ring(x, y, colours.red, 0.3, 12, 0.5, 0.045);
      else if (kind === 'fight') { ring(asp / 2, 0.5, colours.red, 0.45, 14, 1, 0.08); }
      else if (kind === 'story') for (let i = 0; i < 6; i++) splat(asp * (i + 0.5) / 6, 0.02, 0, 0.14, colours.acc.map((v) => v * 0.35), 0.07, 2);
    },
    setOn(v) {
      on = !!v;
      canvas.hidden = !on;
      if (on && !raf) { last = 0; slowFor = 0; raf = requestAnimationFrame(frame); }
    },
    onKind: null, // called with ('2d', why) if the water drops back to 2D mid-game
  };
  return {
    api,
    attach(b) { back = b; api.kind = b.kind; asp = b.aspect(); },
  };
}

// ------------------------------------------------------------------ WebGPU: the real fluid
const WGSL_HEAD = /* wgsl */`
struct P { a: vec4f, b: vec4f, mood: vec4f, bg: vec4f, acc: vec4f, red: vec4f, grn: vec4f, sp: array<vec4f, 32>, ce: array<vec4f, 24> }
@group(0) @binding(0) var<uniform> U: P;
fn ld(t: texture_2d<f32>, p: vec2i) -> vec4f {
  let s = vec2i(textureDimensions(t));
  return textureLoad(t, clamp(p, vec2i(0), s - vec2i(1)), 0);
}
`;
// Every kernel: one invocation per texel of its output.
const kernel = (binds, body) => `${WGSL_HEAD}${binds}
@compute @workgroup_size(8, 8) fn main(@builtin(global_invocation_id) gid: vec3u) {
  _ = U.a;
  let sz = textureDimensions(outT);
  if (gid.x >= sz.x || gid.y >= sz.y) { return; }
  let p = vec2i(gid.xy);
  let uv = (vec2f(gid.xy) + 0.5) / vec2f(sz);
  let dt = U.b.x; let t = U.b.y; let asp = U.b.z;
  let q = vec2f(uv.x * asp, uv.y);
${body}
}`;
const OUT = (n) => `@group(0) @binding(${n}) var outT: texture_storage_2d<rgba16float, write>;`;
const TEX = (n, name) => `@group(0) @binding(${n}) var ${name}: texture_2d<f32>;`;
const SMP = (n) => `@group(0) @binding(${n}) var smp: sampler;`;

const K = {
  force: kernel(TEX(1, 'vin') + OUT(2), `
  var v = ld(vin, p).xy;
  // A slow, divergence-free current: the curl of a moving stream function.
  let e = 0.01;
  let cur = vec2f(psi(q + vec2f(0.0, e), t) - psi(q - vec2f(0.0, e), t), psi(q - vec2f(e, 0.0), t) - psi(q + vec2f(e, 0.0), t)) / (2.0 * e);
  let amp = 0.012 + 0.05 * U.mood.x + 0.008 * U.mood.y;
  v += (cur * amp - v) * min(1.0, dt * 0.3);
  // The Director thinking: a slow vortex at the heart of the water.
  let c = vec2f(0.5 * asp, 0.45);
  let d = q - c;
  v += vec2f(-d.y, d.x) * (U.mood.y * 2.2 * exp(-dot(d, d) / 0.06)) * dt;
  let n = i32(U.b.w);
  for (var i = 0; i < n; i = i + 1) {
    let s0 = U.sp[2 * i]; let s1 = U.sp[2 * i + 1];
    let dd = q - s0.xy;
    v += s0.zw * exp(-dot(dd, dd) / (s1.w * s1.w));
  }
  textureStore(outT, p, vec4f(v, 0.0, 1.0));`).replace('@compute', `
fn psi(q: vec2f, t: f32) -> f32 {
  return sin(q.x * 3.1 + t * 0.21) * cos(q.y * 2.7 - t * 0.17)
    + 0.6 * sin(q.x * 5.3 - q.y * 4.1 + t * 0.33)
    + 0.3 * cos(q.x * 9.7 + q.y * 7.3 - t * 0.52);
}
@compute`),
  curl: kernel(TEX(1, 'vin') + OUT(2), `
  let L = ld(vin, p - vec2i(1, 0)).y; let R = ld(vin, p + vec2i(1, 0)).y;
  let T = ld(vin, p - vec2i(0, 1)).x; let B = ld(vin, p + vec2i(0, 1)).x;
  textureStore(outT, p, vec4f(0.5 * ((R - L) - (B - T)), 0.0, 0.0, 1.0));`),
  vort: kernel(TEX(1, 'vin') + TEX(2, 'curlT') + OUT(3), `
  let w = ld(curlT, p).x;
  let gx = abs(ld(curlT, p + vec2i(1, 0)).x) - abs(ld(curlT, p - vec2i(1, 0)).x);
  let gy = abs(ld(curlT, p + vec2i(0, 1)).x) - abs(ld(curlT, p - vec2i(0, 1)).x);
  let N = vec2f(gx, gy) / (length(vec2f(gx, gy)) + 1e-6);
  let eps = (0.05 + 0.25 * U.mood.x) * U.a.y;
  let v = ld(vin, p).xy + eps * vec2f(N.y * w, -N.x * w) * dt;
  textureStore(outT, p, vec4f(v, 0.0, 1.0));`),
  div: kernel(TEX(1, 'vin') + OUT(2), `
  let L = ld(vin, p - vec2i(1, 0)).x; let R = ld(vin, p + vec2i(1, 0)).x;
  let T = ld(vin, p - vec2i(0, 1)).y; let B = ld(vin, p + vec2i(0, 1)).y;
  textureStore(outT, p, vec4f(0.5 * ((R - L) + (B - T)), 0.0, 0.0, 1.0));`),
  jacobi: kernel(TEX(1, 'pin') + TEX(2, 'divT') + OUT(3), `
  let s = ld(pin, p - vec2i(1, 0)).x + ld(pin, p + vec2i(1, 0)).x + ld(pin, p - vec2i(0, 1)).x + ld(pin, p + vec2i(0, 1)).x;
  textureStore(outT, p, vec4f((s - ld(divT, p).x) * 0.25, 0.0, 0.0, 1.0));`),
  grad: kernel(TEX(1, 'vin') + TEX(2, 'pin') + OUT(3), `
  let L = ld(pin, p - vec2i(1, 0)).x; let R = ld(pin, p + vec2i(1, 0)).x;
  let T = ld(pin, p - vec2i(0, 1)).x; let B = ld(pin, p + vec2i(0, 1)).x;
  let v = ld(vin, p).xy - 0.5 * vec2f(R - L, B - T);
  textureStore(outT, p, vec4f(v, 0.0, 1.0));`),
  advect: kernel(TEX(1, 'vin') + SMP(2) + OUT(3), `
  let v = textureSampleLevel(vin, smp, uv, 0.0).xy;
  let back = uv - dt * vec2f(v.x / asp, v.y);
  let r = textureSampleLevel(vin, smp, back, 0.0).xy / (1.0 + dt * 0.15);
  textureStore(outT, p, vec4f(r, 0.0, 1.0));`),
  dye: kernel(TEX(1, 'vin') + TEX(2, 'din') + SMP(3) + OUT(4), `
  let v = textureSampleLevel(vin, smp, uv, 0.0).xy;
  let back = uv - dt * vec2f(v.x / asp, v.y);
  var d = textureSampleLevel(din, smp, back, 0.0) / (1.0 + dt * 0.28);
  let n = i32(U.b.w);
  for (var i = 0; i < n; i = i + 1) {
    let s0 = U.sp[2 * i]; let s1 = U.sp[2 * i + 1];
    let dd = q - s0.xy;
    d += vec4f(s1.rgb, max(s1.r, max(s1.g, s1.b))) * exp(-dot(dd, dd) / (s1.w * s1.w));
  }
  let nc = i32(U.mood.w);
  for (var j = 0; j < nc; j = j + 1) {
    let c0 = U.ce[2 * j]; let c1 = U.ce[2 * j + 1];
    let dd = q - c0.xy;
    d += vec4f(c1.rgb, 1.0) * exp(-dot(dd, dd) / (c0.z * c0.z * 0.5)) * dt * 0.1;
  }
  textureStore(outT, p, min(d, vec4f(1.2)));`),
};

const RENDER = /* wgsl */`${WGSL_HEAD}
@group(0) @binding(1) var dyeT: texture_2d<f32>;
@group(0) @binding(2) var velT: texture_2d<f32>;
@group(0) @binding(3) var smp: sampler;
struct VO { @builtin(position) pos: vec4f, @location(0) uv: vec2f }
@vertex fn vs(@builtin(vertex_index) i: u32) -> VO {
  let xy = vec2f(f32((i << 1u) & 2u), f32(i & 2u)) * 2.0 - 1.0;
  var o: VO;
  o.pos = vec4f(xy, 0.0, 1.0);
  o.uv = vec2f(xy.x * 0.5 + 0.5, 0.5 - xy.y * 0.5);
  return o;
}
fn lum(c: vec4f) -> f32 { return c.a * 0.6 + dot(c.rgb, vec3f(0.3, 0.5, 0.2)); }
fn hash(p: vec2f) -> f32 { return fract(sin(dot(p, vec2f(12.9898, 78.233))) * 43758.5453); }
// Light through moving water: bright threads where the surface focuses it.
fn caustic(p0: vec2f, t: f32) -> f32 {
  var p = p0;
  var c = 0.0;
  for (var i = 0; i < 4; i = i + 1) {
    let fi = f32(i);
    p = p + vec2f(sin(p.y * 1.3 + t * (0.31 + fi * 0.07) + fi), cos(p.x * 1.1 - t * (0.27 + fi * 0.05) - fi)) * 0.55;
    c += 1.0 / (1.0 + 40.0 * abs(sin(p.x * 1.7) * sin(p.y * 1.7)));
  }
  return c / 4.0;
}
@fragment fn fs(o: VO) -> @location(0) vec4f {
  let uv = o.uv;
  let t = U.b.y; let asp = U.b.z;
  let q = vec2f(uv.x * asp, uv.y);
  let light = U.bg.w;
  let tx = 1.5 / vec2f(textureDimensions(dyeT));
  let d = textureSample(dyeT, smp, uv);
  let v = textureSample(velT, smp, uv).xy;
  let hx = lum(textureSample(dyeT, smp, uv - vec2f(tx.x, 0.0))) - lum(textureSample(dyeT, smp, uv + vec2f(tx.x, 0.0)));
  let hy = lum(textureSample(dyeT, smp, uv - vec2f(0.0, tx.y))) - lum(textureSample(dyeT, smp, uv + vec2f(0.0, tx.y)));
  let n = normalize(vec3f(hx * 3.0, hy * 3.0, 1.0));

  // The water itself: the theme's background, deepened, with light falling through it.
  let r = length(uv - vec2f(0.5, 0.45));
  var col = U.bg.rgb * (1.0 - 0.25 * r) + U.acc.rgb * 0.05 * (1.0 - uv.y);
  let ca = caustic(q * 3.2 + v * 6.0 + n.xy * 0.6, t);
  col += mix(U.acc.rgb, vec3f(1.0), 0.4) * pow(ca, 2.2) * mix(0.2, 0.07, light);
  // Shafts of light falling from the surface, swaying.
  let sx = q.x + (1.0 - uv.y) * 0.35 * sin(t * 0.11);
  let rays = pow(0.5 + 0.5 * sin(sx * 6.0 + sin(sx * 2.3 + t * 0.17) * 2.0 + t * 0.05), 8.0) + 0.6 * pow(0.5 + 0.5 * sin(sx * 11.0 - t * 0.08 + 1.7), 12.0);
  col += mix(U.acc.rgb, vec3f(1.0), 0.6) * rays * pow(1.0 - uv.y, 2.2) * mix(0.09, 0.05, light);

  // What the water carries: its own colour, where it is thick.
  let dens = clamp(d.a, 0.0, 1.5);
  let dc = d.rgb / max(d.a, 0.001);
  col = mix(col, dc, clamp(dens * 0.4, 0.0, 0.55));
  if (light < 0.5) { col += min(d.rgb, vec3f(0.6)) * 0.12; }

  // The cells: the Cohort and the creatures, membranes that breathe.
  let nc = i32(U.mood.w);
  for (var j = 0; j < nc; j = j + 1) {
    let c0 = U.ce[2 * j]; let c1 = U.ce[2 * j + 1];
    let dd = q - c0.xy;
    let dist = length(dd);
    let ang = atan2(dd.y, dd.x);
    let ph = c1.w;
    var wob = 1.0 + 0.07 * sin(ang * 5.0 + t * 1.3 + ph) + 0.045 * sin(ang * 3.0 - t * 0.9 + ph * 2.0);
    if (c0.w > 1.5) { wob += 0.1 * pow(abs(sin(ang * 6.0 + t * 1.7 + ph)), 6.0) * (1.0 + U.mood.x); }
    let rr = c0.z * wob;
    let x = dist / max(rr, 1e-4);
    let inside = 1.0 - smoothstep(0.85, 1.0, x);
    col = mix(col, c1.rgb, inside * 0.16);
    let nuc = length(dd - rr * 0.28 * vec2f(cos(ph + t * 0.4), sin(ph * 1.3 + t * 0.33))) / (rr * 0.3);
    col = mix(col, c1.rgb * 0.9, (1.0 - smoothstep(0.55, 1.0, nuc)) * 0.45);
    let rim = exp(-pow((x - 1.0) * 13.0, 2.0));
    col = mix(col, mix(c1.rgb, vec3f(1.0), 0.35), rim * 0.8);
    col += c1.rgb * exp(-max(x - 1.0, 0.0) * 5.0) * (1.0 - inside) * mix(0.1, 0.03, light);
    if (c0.w < 0.5) { // your own cell: rings go out from it on your turn
      let wave = fract(t * 0.7);
      col += c1.rgb * exp(-pow((x - 1.15 - wave * 0.9) * 9.0, 2.0)) * (1.0 - wave) * 0.6 * U.mood.z;
    }
  }

  // The surface catches the light.
  let L = normalize(vec3f(-0.45, -0.6, 0.66));
  let spec = pow(max(dot(reflect(-L, n), vec3f(0.0, 0.0, 1.0)), 0.0), 36.0);
  col += vec3f(spec) * 0.45;

  // The Director thinking: a glow in the vortex.
  let dv = q - vec2f(0.5 * asp, 0.45);
  col += U.acc.rgb * exp(-dot(dv, dv) / 0.02) * 0.14 * U.mood.y * (0.65 + 0.35 * sin(t * 3.0));

  // A Pulse War: red at the edges, pulsing like a heart.
  let beat = pow(0.5 + 0.5 * sin(t * 7.0), 10.0) + 0.6 * pow(0.5 + 0.5 * sin(t * 7.0 - 0.9), 14.0);
  let vig = smoothstep(0.3, 0.95, r * 1.25);
  col = mix(col, U.red.rgb * mix(0.55, 0.9, light), vig * (0.2 + 0.3 * beat) * U.mood.x);
  col *= 1.0 - vig * mix(0.4, 0.1, light);
  col += (hash(uv * 911.0 + fract(t)) - 0.5) / 160.0;
  return vec4f(col, 1.0);
}`;

async function gpuBackend(canvas) {
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'low-power' });
  if (!adapter) return null;
  const device = await adapter.requestDevice();
  canvas.dataset.ctx = 'webgpu';
  const ctx = canvas.getContext('webgpu');
  if (!ctx) return null;
  const format = navigator.gpu.getPreferredCanvasFormat();
  ctx.configure({ device, format, alphaMode: 'opaque' });
  let lost = false;
  device.lost.then((info) => { lost = true; console.warn('Living water: the GPU device was lost.', info && info.message); });
  device.addEventListener('uncapturederror', (e) => { console.warn('Living water (WebGPU):', e.error && e.error.message); lost = true; });

  const pipes = {};
  for (const [name, code] of Object.entries(K)) {
    pipes[name] = device.createComputePipeline({ layout: 'auto', compute: { module: device.createShaderModule({ code }), entryPoint: 'main' } });
  }
  const rmod = device.createShaderModule({ code: RENDER });
  const render = device.createRenderPipeline({ layout: 'auto', vertex: { module: rmod, entryPoint: 'vs' }, fragment: { module: rmod, entryPoint: 'fs', targets: [{ format }] }, primitive: { topology: 'triangle-list' } });
  const ubuf = device.createBuffer({ size: 1024, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  const u = new Float32Array(256);
  const smp = device.createSampler({ magFilter: 'linear', minFilter: 'linear', addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge' });

  const phone = Math.min(screen.width, screen.height) < 600;
  let size = null;
  let T = null;
  let groups = new Map();
  const tex = (w, h, label) => {
    const x = device.createTexture({ size: [w, h], format: 'rgba16float', usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.STORAGE_BINDING, label });
    x.v = x.createView();
    return x;
  };
  function build() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cw = Math.max(64, Math.round(canvas.clientWidth * dpr * 0.75));
    const ch = Math.max(64, Math.round(canvas.clientHeight * dpr * 0.75));
    const key = `${cw}x${ch}`;
    if (size === key) return;
    size = key;
    canvas.width = cw;
    canvas.height = ch;
    const asp = cw / ch;
    const simH = phone ? 120 : 170;
    const sw = Math.max(32, Math.round(simH * asp));
    const dyeH = Math.min(ch, phone ? 420 : 640);
    const dw = Math.max(32, Math.round(dyeH * asp));
    for (const x of T ? [...T.vel, ...T.prs, ...T.div, ...T.curl, ...T.dye] : []) x.destroy();
    T = {
      vel: [tex(sw, simH, 'vel0'), tex(sw, simH, 'vel1')], prs: [tex(sw, simH, 'prs0'), tex(sw, simH, 'prs1')],
      div: [tex(sw, simH, 'div')], curl: [tex(sw, simH, 'curl')], dye: [tex(dw, dyeH, 'dye0'), tex(dw, dyeH, 'dye1')],
    };
    T.sim = [sw, simH];
    T.dyeSize = [dw, dyeH];
    groups = new Map();
  }
  const bg = (pipe, ...res) => {
    const key = pipe + ':' + res.map((r) => (r === smp ? 'smp' : r.label)).join(',');
    let g = groups.get(key);
    if (!g) {
      const p = pipe === 'render' ? render : pipes[pipe];
      g = device.createBindGroup({ layout: p.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: ubuf } }, ...res.map((r, i) => ({ binding: i + 1, resource: r === smp ? smp : r.v }))] });
      groups.set(key, g);
    }
    return g;
  };
  let vi = 0;
  let pi = 0;
  let di = 0;

  build();
  window.addEventListener('resize', () => setTimeout(build, 150), { passive: true });

  // Hold the adapter and device for the life of the page: some browsers lose the device once
  // nothing in the page refers to the adapter any more.
  KEEP.push(adapter, device);
  return {
    kind: 'webgpu',
    failed: () => lost,
    aspect: () => canvas.width / canvas.height,
    draw(f) {
      if (lost) return;
      build();
      const { colours: C, mood, splats, cells } = f;
      u.fill(0);
      u.set([T.sim[0], T.sim[1], T.dyeSize[0], T.dyeSize[1]], 0);
      u.set([f.dt, f.t, f.asp, splats.length], 4);
      u.set([mood.fight, mood.thinking, mood.myTurn, cells.length], 8);
      u.set([...C.bg, C.light ? 1 : 0], 12);
      u.set([...C.acc, 0], 16);
      u.set([...C.red, 0], 20);
      u.set([...C.grn, 0], 24);
      splats.forEach((s, i) => { u.set([s.x, s.y, s.dx, s.dy], 28 + i * 8); u.set([...s.rgb, s.rad], 32 + i * 8); });
      const kindN = { me: 0, ally: 1, foe: 2, other: 3 };
      cells.forEach((c, i) => { u.set([c.x, c.y, c.rad, kindN[c.kind] ?? 3], 156 + i * 8); u.set([...c.rgb, c.phase], 160 + i * 8); });
      device.queue.writeBuffer(ubuf, 0, u);

      const enc = device.createCommandEncoder();
      const pass = enc.beginComputePass();
      const [sw, sh] = T.sim;
      const [dw, dh] = T.dyeSize;
      const run = (name, g, w, h) => { pass.setPipeline(pipes[name]); pass.setBindGroup(0, g); pass.dispatchWorkgroups(Math.ceil(w / 8), Math.ceil(h / 8)); };
      const V = T.vel;
      run('force', bg('force', V[vi], V[1 - vi]), sw, sh); vi = 1 - vi;
      run('curl', bg('curl', V[vi], T.curl[0]), sw, sh);
      run('vort', bg('vort', V[vi], T.curl[0], V[1 - vi]), sw, sh); vi = 1 - vi;
      run('div', bg('div', V[vi], T.div[0]), sw, sh);
      for (let k = 0; k < 20; k++) { run('jacobi', bg('jacobi', T.prs[pi], T.div[0], T.prs[1 - pi]), sw, sh); pi = 1 - pi; }
      run('grad', bg('grad', V[vi], T.prs[pi], V[1 - vi]), sw, sh); vi = 1 - vi;
      run('dye', bg('dye', V[vi], T.dye[di], smp, T.dye[1 - di]), dw, dh); di = 1 - di;
      run('advect', bg('advect', V[vi], smp, V[1 - vi]), sw, sh); vi = 1 - vi;
      pass.end();
      const rp = enc.beginRenderPass({ colorAttachments: [{ view: ctx.getCurrentTexture().createView(), loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 1 } }] });
      rp.setPipeline(render);
      rp.setBindGroup(0, bg('render', T.dye[di], V[vi], smp));
      rp.draw(3);
      rp.end();
      device.queue.submit([enc.finish()]);
      if (window.__waterGrab) { const grab = window.__waterGrab; window.__waterGrab = null; grab(canvas); } // tests: a copy of this frame
    },
  };
}

// ------------------------------------------------------------------ 2D: for devices without WebGPU
function flatBackend(canvas) {
  const g = canvas.getContext('2d');
  const ripples = [];
  const css = (rgb, a) => `rgba(${rgb.map((v) => Math.round(v * 255)).join(',')},${a})`;
  const fit = () => {
    const w = Math.max(64, Math.round(canvas.clientWidth * 0.5));
    const h = Math.max(64, Math.round(canvas.clientHeight * 0.5));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  };
  fit();
  return {
    kind: '2d',
    aspect: () => canvas.width / canvas.height,
    draw(f) {
      fit();
      const { colours: C, mood, t } = f;
      const W = canvas.width;
      const H = canvas.height;
      const s = H; // q-units to pixels
      g.fillStyle = css(C.bg, 1);
      g.fillRect(0, 0, W, H);
      g.globalCompositeOperation = C.light ? 'source-over' : 'lighter';
      for (let i = 0; i < 6; i++) { // drifting light
        const x = (0.5 + 0.45 * Math.sin(t * 0.07 * (i + 1) + i * 2)) * W;
        const y = (0.5 + 0.4 * Math.cos(t * 0.05 * (i + 2) + i)) * H;
        const gr = g.createRadialGradient(x, y, 0, x, y, H * 0.5);
        gr.addColorStop(0, css(i % 2 ? C.acc : C.grn, 0.05));
        gr.addColorStop(1, css(C.acc, 0));
        g.fillStyle = gr;
        g.fillRect(0, 0, W, H);
      }
      g.globalCompositeOperation = 'source-over';
      for (const sp of f.splats) if (sp.prio >= 2 && Math.max(...sp.rgb) > 0.05) ripples.push({ x: sp.x, y: sp.y, rgb: sp.rgb.map((v) => Math.min(1, v * 1.6)), age: 0 });
      for (let i = ripples.length - 1; i >= 0; i--) {
        const r = ripples[i];
        r.age += f.dt;
        if (r.age > 1.6) { ripples.splice(i, 1); continue; }
        g.strokeStyle = css(r.rgb, 0.5 * (1 - r.age / 1.6));
        g.lineWidth = 2;
        g.beginPath();
        g.arc(r.x * s, r.y * s, (0.02 + r.age * 0.12) * s, 0, Math.PI * 2);
        g.stroke();
      }
      for (const c of f.cells) {
        const cx = c.x * s;
        const cy = c.y * s;
        g.beginPath();
        for (let k = 0; k <= 48; k++) {
          const a = (k / 48) * Math.PI * 2;
          let w = 1 + 0.07 * Math.sin(a * 5 + t * 1.3 + c.phase) + 0.045 * Math.sin(a * 3 - t * 0.9 + c.phase * 2);
          if (c.kind === 'foe') w += 0.1 * Math.pow(Math.abs(Math.sin(a * 6 + t * 1.7 + c.phase)), 6);
          const rr = c.rad * w * s;
          g[k ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
        }
        g.fillStyle = css(c.rgb, 0.16);
        g.fill();
        g.strokeStyle = css(c.rgb, 0.85);
        g.lineWidth = 2;
        g.stroke();
        g.fillStyle = css(c.rgb, 0.5);
        g.beginPath();
        g.arc(cx + Math.cos(c.phase + t * 0.4) * c.rad * 0.28 * s, cy + Math.sin(c.phase * 1.3 + t * 0.33) * c.rad * 0.28 * s, c.rad * 0.27 * s, 0, Math.PI * 2);
        g.fill();
      }
      if (mood.thinking > 0.02) {
        const gr = g.createRadialGradient(W / 2, H * 0.45, 0, W / 2, H * 0.45, H * 0.25);
        gr.addColorStop(0, css(C.acc, 0.18 * mood.thinking * (0.65 + 0.35 * Math.sin(t * 3))));
        gr.addColorStop(1, css(C.acc, 0));
        g.fillStyle = gr;
        g.fillRect(0, 0, W, H);
      }
      const beat = Math.pow(0.5 + 0.5 * Math.sin(t * 7), 10);
      const vg = g.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, Math.hypot(W, H) * 0.6);
      vg.addColorStop(0, css(C.red, 0));
      vg.addColorStop(1, css(mood.fight > 0.02 ? C.red : [0, 0, 0], mood.fight > 0.02 ? (0.25 + 0.3 * beat) * mood.fight : C.light ? 0.06 : 0.35));
      g.fillStyle = vg;
      g.fillRect(0, 0, W, H);
    },
  };
}

// ------------------------------------------------------------------ small helpers
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function noise1(x) {
  const i = Math.floor(x);
  const f = x - i;
  const h = (n) => { const s = Math.sin(n * 127.1) * 43758.5453; return s - Math.floor(s); };
  const u = f * f * (3 - 2 * f);
  return h(i) * (1 - u) + h(i + 1) * u;
}
