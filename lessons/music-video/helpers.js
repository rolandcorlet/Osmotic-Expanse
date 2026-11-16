// ---------- helpers ----------
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const ease = (x) => { x = clamp(x); return x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
const eout = (x) => 1 - Math.pow(1 - clamp(x), 3);
const lerp = (a, b, x) => a + (b - a) * x;
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
const ramp = (t, a, b) => clamp((t - a) / (b - a));
function font(sz, w = 700, fam = 'TeX Gyre Adventor') { g.font = `${w} ${sz}px "${fam}"`; }
function text(s, x, y, { sz = 40, w = 700, fam = 'TeX Gyre Adventor', col = '#fff', al = 'center', a = 1, sh = 18, sp = 0 } = {}) {
  g.save(); g.globalAlpha *= a; font(sz, w, fam); g.textAlign = al; g.textBaseline = 'middle'; g.fillStyle = col;
  if ('letterSpacing' in g) g.letterSpacing = sp + 'px';
  if (sh) { g.shadowColor = 'rgba(0,0,0,.65)'; g.shadowBlur = sh; }
  g.fillText(s, x, y); g.restore();
}

// ---------- the soup (Life) ----------
const R = rng(7), MOTES = Array.from({ length: 140 }, () => ({ x: R() * W, y: R() * H, r: 1 + R() * 3.5, s: .2 + R() * .9, h: R(), ph: R() * 6.28 }));
const BUB = Array.from({ length: 14 }, () => ({ x: R() * W, y: R() * H, r: 30 + R() * 110, s: .05 + R() * .18, ph: R() * 6.28 }));
function soup(T, tint = 0) {
  const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#04212b'); gr.addColorStop(.55, '#06323d'); gr.addColorStop(1, '#0b1130');
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  // caustic glows
  for (let i = 0; i < 5; i++) {
    const x = W * (.5 + .45 * Math.sin(T * .07 + i * 1.7)), y = H * (.45 + .4 * Math.cos(T * .05 + i * 2.3)), r = 260 + 90 * Math.sin(T * .1 + i);
    const cg = g.createRadialGradient(x, y, 0, x, y, r);
    const col = ['94,230,208', '122,162,247', '224,69,123', '242,140,40', '94,230,208'][i];
    cg.addColorStop(0, `rgba(${col},${.13 + tint})`); cg.addColorStop(1, `rgba(${col},0)`);
    g.fillStyle = cg; g.fillRect(0, 0, W, H);
  }
  // membrane bubbles
  for (const b of BUB) {
    const y = ((b.y - T * 18 * b.s) % (H + 300) + H + 300) % (H + 300) - 150, x = b.x + 30 * Math.sin(T * .3 + b.ph);
    g.beginPath(); g.arc(x, y, b.r, 0, 6.283); g.strokeStyle = 'rgba(180,255,240,.07)'; g.lineWidth = 2; g.stroke();
    const bg = g.createRadialGradient(x - b.r * .3, y - b.r * .3, 0, x, y, b.r); bg.addColorStop(0, 'rgba(200,255,250,.06)'); bg.addColorStop(1, 'rgba(200,255,250,0)');
    g.fillStyle = bg; g.fill();
  }
  // bioluminescent motes
  for (const m of MOTES) {
    const y = ((m.y - T * 14 * m.s) % H + H) % H, x = (m.x + 20 * Math.sin(T * .5 * m.s + m.ph) + W) % W;
    const tw = .45 + .55 * Math.sin(T * 2 * m.s + m.ph);
    g.fillStyle = m.h < .6 ? `rgba(140,255,230,${.55 * tw})` : m.h < .85 ? `rgba(170,190,255,${.5 * tw})` : `rgba(255,170,90,${.55 * tw})`;
    g.shadowColor = g.fillStyle; g.shadowBlur = 10; g.beginPath(); g.arc(x, y, m.r, 0, 6.283); g.fill();
  }
  g.shadowBlur = 0;
  vignette(.55);
}
function vignette(a) { const v = g.createRadialGradient(W / 2, H / 2, H * .35, W / 2, H / 2, H * .95); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, `rgba(0,0,0,${a})`); g.fillStyle = v; g.fillRect(0, 0, W, H); }

function card(key, x, y, h, label, a = 1, rot = 0, glow = '#5ee6d0') {
  const im = IMG[key]; if (!im) return; const w = h * im.width / im.height;
  g.save(); g.globalAlpha *= a; g.translate(x, y); g.rotate(rot);
  g.shadowColor = glow; g.shadowBlur = 30; g.fillStyle = 'rgba(8,20,30,.9)';
  rr(-w / 2 - 10, -h / 2 - 10, w + 20, h + 20 + (label ? 44 : 0), 18); g.fill(); g.shadowBlur = 0;
  g.save(); rr(-w / 2, -h / 2, w, h, 12); g.clip(); g.drawImage(im, -w / 2, -h / 2, w, h); g.restore();
  g.strokeStyle = glow; g.lineWidth = 2; rr(-w / 2 - 10, -h / 2 - 10, w + 20, h + 20 + (label ? 44 : 0), 18); g.stroke();
  if (label) text(label, 0, h / 2 + 22, { sz: 20, col: '#f4e3c1', sp: 3, sh: 0 });
  g.restore();
}
function rr(x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
function head(s, t, sub) { // lower-third pill
  const a = ramp(t, .4, 1.1); if (!s) return;
  g.save(); g.globalAlpha = a; font(24, 700); if ('letterSpacing' in g) g.letterSpacing = '5px';
  const w = g.measureText(s).width + 56, x = 70, y = H - 96;
  const pg = g.createLinearGradient(x, 0, x + w, 0); pg.addColorStop(0, '#f28c28'); pg.addColorStop(.5, '#e0457b'); pg.addColorStop(1, '#7a6cf7');
  g.fillStyle = pg; rr(x - 12 * (1 - a), y - 26, w, 52, 26); g.fill(); g.restore();
  text(s, x + 28 - 12 * (1 - a), y + 1, { sz: 24, col: '#140a1a', al: 'left', a, sh: 0, sp: 5 });
  if (sub) text(sub, x + 6, y + 50, { sz: 20, w: 400, fam: 'Lora', col: '#cfe9ee', al: 'left', a: a * .9, sp: 1 });
}
function retro(T, t) { // 60s title rings
  g.fillStyle = '#f4e3c1'; g.fillRect(0, 0, W, H);
  const cols = ['#f28c28', '#e0457b', '#2bb3a3', '#14213d', '#f4e3c1'];
  g.save(); g.translate(W / 2, H / 2); g.rotate(T * .05);
  for (let i = 18; i >= 0; i--) {
    const r = i * 62 + ((T * 30) % 62);
    g.beginPath(); g.arc(0, 0, r, 0, 6.283); g.fillStyle = cols[i % 4]; g.fill();
  }
  g.restore();
  g.beginPath(); g.arc(W / 2, H / 2, 300, 0, 6.283); g.fillStyle = '#14213d'; g.fill(); g.lineWidth = 6; g.strokeStyle = '#f4e3c1'; g.stroke();
  g.beginPath(); g.arc(W / 2, H / 2, 286, 0, 6.283); g.lineWidth = 2; g.stroke();
  // dotted halftone sweep
  g.fillStyle = 'rgba(20,10,30,.18)';
  for (let y = 0; y < H; y += 18) for (let x = (y / 18) % 2 ? 9 : 0; x < W; x += 18) { const d = Math.hypot(x - W / 2, y - H / 2) / 900; if (d < 330 / 900) continue; g.beginPath(); g.arc(x, y, 3.2 * d, 0, 6.283); g.fill(); }
}

// ---------- archive look (Quorum) ----------
const NOISE = [];
function makeNoise() { for (let k = 0; k < 6; k++) { const n = document.createElement('canvas'); n.width = W / 2; n.height = H / 2; const x = n.getContext('2d'), d = x.createImageData(W / 2, H / 2), r = rng(99 + k); for (let i = 0; i < d.data.length; i += 4) { const v = r() * 255; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 26; } x.putImageData(d, 0, 0); NOISE.push(n); } }
function paper(T) {
  const gr = g.createRadialGradient(W / 2, H / 2, 50, W / 2, H / 2, W * .75); gr.addColorStop(0, '#3a2c1c'); gr.addColorStop(1, '#120c07');
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
}
function archive(T, frame) {
  g.save(); g.globalCompositeOperation = 'color'; g.fillStyle = '#8a6a3c'; g.globalAlpha = .55; g.fillRect(0, 0, W, H); g.restore();
  g.save(); g.globalCompositeOperation = 'overlay'; g.drawImage(NOISE[frame % 6], 0, 0, W, H); g.restore();
  const fl = .04 * Math.sin(frame * 1.7) + .03 * Math.sin(frame * 0.37); g.fillStyle = `rgba(0,0,0,${.06 + fl})`; g.fillRect(0, 0, W, H);
  const r = rng(Math.floor(frame / 4) * 7 + 3); // scratches, a few frames each
  g.strokeStyle = 'rgba(235,220,190,.18)'; g.lineWidth = 1;
  for (let i = 0; i < 2; i++) if (r() < .5) { const x = r() * W; g.beginPath(); g.moveTo(x, 0); g.lineTo(x + r() * 6 - 3, H); g.stroke(); }
  vignette(.8);
  g.fillStyle = '#000'; g.fillRect(0, 0, W, 54); g.fillRect(0, H - 54, W, 54);
}
function chap(p, t) { // chapter card that settles into a corner label
  if (!p.head) return;
  const a = 1 - ramp(t, 2.6, 3.4);
  if (a > 0) {
    g.fillStyle = `rgba(10,6,3,${.55 * a})`; g.fillRect(0, 0, W, H);
    text(p.chap ? `CHAPTER ${p.chap}` : '', W / 2, H / 2 - 52, { sz: 22, fam: 'TeX Gyre Bonum', col: '#d9c49a', a: a * ramp(t, .2, .8), sp: 8 });
    text(p.head, W / 2, H / 2 + 8, { sz: 58, fam: 'TeX Gyre Bonum', col: '#f4e8cc', a: a * ramp(t, .4, 1.1), sp: 4 });
    g.save(); g.globalAlpha = a * ramp(t, .6, 1.3); g.strokeStyle = '#d9c49a'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(W / 2 - 160, H / 2 + 52); g.lineTo(W / 2 + 160, H / 2 + 52); g.stroke(); g.restore();
  }
  const b = ramp(t, 3.0, 3.8);
  if (b > 0) text(`${p.chap}  ·  ${p.head}`, 70, 84, { sz: 18, fam: 'TeX Gyre Bonum', col: '#d9c49a', al: 'left', a: b * .9, sp: 4, sh: 0 });
}
// signal particles for the Hearth air
const SIG = Array.from({ length: 420 }, (_, i) => { const r = rng(1000 + i); return { a: r() * 6.283, d: r(), s: .3 + r() * .7, side: r() < .62 ? 0 : 1, born: r() }; });
function hearth(x, y, k) { const hg = g.createRadialGradient(x, y, 0, x, y, 120 + 40 * k); hg.addColorStop(0, `rgba(255,214,140,${.55 + .3 * k})`); hg.addColorStop(1, 'rgba(255,214,140,0)'); g.fillStyle = hg; g.fillRect(0, 0, W, H); }

