// Reads a PDF in the browser for the Books tab, with pdf.js (public/vendor/pdfjs, Apache License 2.0).
//   - each page's text in reading order: two columns are read one after the other, a heading across both
//     comes first, a word split at the end of a line is joined, a gap between paragraphs is kept;
//   - the pictures on each page, cut out of the page's render: maps, stat blocks set as pictures, art. A
//     picture filling the page behind the others or behind a page of text (parchment), and small
//     ornaments, are left out;
//   - a page that is all picture and almost no text is a scan: the whole page is kept, for the AI to read.
// readPdf(arrayBuffer, { onProgress }) -> { pages: [{ n, text, scanned }], pictures: [{ page, w, h, data, scanned }], text }
let lib = null;
async function pdfjs() {
  if (!lib) {
    lib = await import('/vendor/pdfjs/pdf.min.mjs');
    lib.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs/pdf.worker.min.mjs';
  }
  return lib;
}

export async function readPdf(buffer, { onProgress = () => {}, maxPictures = 120, scale = 1.6, maxSide = 1600 } = {}) {
  const P = await pdfjs();
  const doc = await P.getDocument({ data: buffer, isEvalSupported: false, disableFontFace: false }).promise;
  const pages = [];
  const pictures = [];
  for (let n = 1; n <= doc.numPages; n++) {
    onProgress({ step: 'Reading the PDF', at: n, of: doc.numPages });
    const page = await doc.getPage(n);
    const vp1 = page.getViewport({ scale: 1 });
    const text = pageText((await page.getTextContent()).items, vp1);
    const plain = text.replace(/\s+/g, '').length;
    const { boxes, scanned } = pictureBoxes(await imageBoxes(page, P.OPS, vp1), { w: vp1.width, h: vp1.height, plain });
    if (boxes.length && pictures.length < maxPictures) {
      const vp = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(vp.width); canvas.height = Math.ceil(vp.height);
      await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
      for (const b of boxes.slice(0, maxPictures - pictures.length)) {
        const c = cut(canvas, b, scale, maxSide);
        if (c) pictures.push({ page: n, w: c.width, h: c.height, data: c.toDataURL('image/jpeg', 0.82), scanned });
      }
      canvas.width = 0; canvas.height = 0;
    }
    pages.push({ n, text, scanned });
    page.cleanup();
  }
  await doc.destroy();
  return { pages, pictures, text: pages.map((p) => `--- Page ${p.n} ---\n${p.text}`).join('\n\n') };
}

// ---- text in reading order ---------------------------------------------------------------------
export function pageText(items, vp) {
  const W = vp.width;
  const H = vp.height;
  // Items in the viewport's top-left frame: x across, y down.
  const its = items.filter((i) => i.str && i.str.trim()).map((i) => {
    const [, , , d, e, f] = i.transform;
    const h = Math.abs(d) || Math.abs(i.height) || 10;
    const [x, y] = vp.convertToViewportPoint(e, f);
    return { s: i.str, x, y, w: i.width, h };
  });
  if (!its.length) return '';
  const mid = W / 2;
  const chars = (a) => a.reduce((n, i) => n + i.s.length, 0);
  const left = its.filter((i) => i.x + i.w <= mid + 6);
  const right = its.filter((i) => i.x >= mid - 6);
  const across = its.filter((i) => i.x < mid - 6 && i.x + i.w > mid + 6);
  const total = chars(its);
  const two = chars(left) > total * 0.2 && chars(right) > total * 0.2 && chars(across) < total * 0.2;
  let blocks;
  if (two) {
    const top = Math.min(...[...left, ...right].map((i) => i.y));
    const head = across.filter((i) => i.y <= top + 2);
    const foot = across.filter((i) => i.y > top + 2);
    blocks = [head, left, right, foot];
  } else blocks = [its];
  const out = blocks.filter((b) => b.length).map(lines).join('\n\n');
  void H;
  return out.replace(/([a-z])-\n([a-z])/g, '$1$2').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}
function lines(items) {
  const sorted = items.slice().sort((a, b) => a.y - b.y || a.x - b.x);
  const rows = [];
  for (const it of sorted) {
    const r = rows.find((x) => Math.abs(x.y - it.y) < Math.max(2, Math.min(x.h, it.h) * 0.5));
    if (r) { r.items.push(it); r.h = Math.max(r.h, it.h); } else rows.push({ y: it.y, h: it.h, items: [it] });
  }
  rows.sort((a, b) => a.y - b.y);
  const step = median(rows.slice(1).map((r, k) => r.y - rows[k].y).filter((g) => g > 0)) || 12;
  let out = '';
  rows.forEach((r, k) => {
    r.items.sort((a, b) => a.x - b.x);
    let line = '';
    let end = null;
    for (const it of r.items) {
      if (end != null && it.x - end > it.h * 0.18 && !/\s$/.test(line) && !/^\s/.test(it.s)) line += ' ';
      line += it.s;
      end = it.x + it.w;
    }
    if (k > 0) out += r.y - rows[k - 1].y > step * 1.6 ? '\n\n' : '\n';
    out += line.replace(/\s+/g, ' ').trim();
  });
  return out;
}
const median = (a) => { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };

// ---- where the pictures are ---------------------------------------------------------------------------
// Which of a page's images are pictures worth keeping. raw: every image's box; plain: how many letters of
// text the page has. A page that is nearly all picture and almost no text is a scan: the whole page.
// A picture filling the page behind the others, or behind a page of text, is the parchment: it goes
// before the rest are joined, or it would swallow them (Vault of the Runemark: its map and both stat
// blocks set as pictures were lost that way). A full-page picture on its own (a map) is kept.
export function pictureBoxes(raw, { w, h, plain }) {
  const area = w * h;
  const real = raw.filter((b) => b.w * b.h > area * 0.03 && b.w > 50 && b.h > 50);
  if (plain < 60 && real.some((b) => b.w * b.h > area * 0.55)) return { boxes: [{ x: 0, y: 0, w, h }], scanned: true };
  const big = (b) => b.w * b.h > area * 0.75;
  let boxes = real.filter((b) => !big(b));
  if (!boxes.length && plain <= 500) boxes = real.filter(big).slice(0, 1);
  return { boxes: joinTiles(boxes), scanned: false };
}
// Each image is drawn into the unit square by the current transform: follow the transforms through the
// page's drawing commands to find its box, in the viewport's frame at scale 1.
async function imageBoxes(page, OPS, vp) {
  const ops = await page.getOperatorList();
  const mul = (m, n) => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
  let ctm = [1, 0, 0, 1, 0, 0];
  const stack = [];
  const boxes = [];
  const paint = new Set([OPS.paintImageXObject, OPS.paintInlineImageXObject, OPS.paintImageXObjectRepeat, OPS.paintImageMaskXObject].filter((x) => x != null));
  for (let i = 0; i < ops.fnArray.length; i++) {
    const fn = ops.fnArray[i];
    const args = ops.argsArray[i];
    if (fn === OPS.save) stack.push(ctm);
    else if (fn === OPS.restore) ctm = stack.pop() || [1, 0, 0, 1, 0, 0];
    else if (fn === OPS.transform) ctm = mul(ctm, args);
    else if (fn === OPS.paintFormXObjectBegin) { stack.push(ctm); if (Array.isArray(args[0]) && args[0].length === 6) ctm = mul(ctm, args[0]); }
    else if (fn === OPS.paintFormXObjectEnd) ctm = stack.pop() || [1, 0, 0, 1, 0, 0];
    else if (paint.has(fn)) {
      const pts = [[0, 0], [1, 0], [0, 1], [1, 1]].map(([x, y]) => vp.convertToViewportPoint(ctm[0] * x + ctm[2] * y + ctm[4], ctm[1] * x + ctm[3] * y + ctm[5]));
      const xs = pts.map((p) => p[0]);
      const ys = pts.map((p) => p[1]);
      const x = Math.max(0, Math.min(...xs)); const y = Math.max(0, Math.min(...ys));
      const w = Math.min(vp.width, Math.max(...xs)) - x; const h = Math.min(vp.height, Math.max(...ys)) - y;
      if (w > 1 && h > 1) boxes.push({ x, y, w, h });
    }
  }
  return boxes;
}
// Pictures cut into tiles (some books do) are one picture again: boxes that touch or overlap.
function joinTiles(list) {
  const boxes = list.slice();
  let merged = true;
  while (merged) {
    merged = false;
    for (let a = 0; a < boxes.length && !merged; a++) {
      for (let b = a + 1; b < boxes.length && !merged; b++) {
        const A = boxes[a]; const B = boxes[b];
        if (A.x <= B.x + B.w + 2 && B.x <= A.x + A.w + 2 && A.y <= B.y + B.h + 2 && B.y <= A.y + A.h + 2) {
          const x = Math.min(A.x, B.x); const y = Math.min(A.y, B.y);
          boxes[a] = { x, y, w: Math.max(A.x + A.w, B.x + B.w) - x, h: Math.max(A.y + A.h, B.y + B.h) - y };
          boxes.splice(b, 1);
          merged = true;
        }
      }
    }
  }
  return boxes;
}
function cut(canvas, b, scale, maxSide) {
  const sx = Math.floor(b.x * scale); const sy = Math.floor(b.y * scale);
  const sw = Math.min(canvas.width - sx, Math.ceil(b.w * scale)); const sh = Math.min(canvas.height - sy, Math.ceil(b.h * scale));
  if (sw < 20 || sh < 20) return null;
  const k = Math.min(1, maxSide / Math.max(sw, sh));
  const c = document.createElement('canvas');
  c.width = Math.round(sw * k); c.height = Math.round(sh * k);
  c.getContext('2d').drawImage(canvas, sx, sy, sw, sh, 0, 0, c.width, c.height);
  return c;
}
