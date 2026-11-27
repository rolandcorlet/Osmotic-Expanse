// Reads a PDF in the browser for the Books tab, with pdf.js (public/vendor/pdfjs, Apache License 2.0).
//   - each page's text in reading order: two columns are read one after the other, a heading across both
//     comes first, a word split at the end of a line is joined, a gap between paragraphs is kept;
//   - the pictures on each page, cut out of the page's render: maps, stat blocks set as pictures, art. A
//     picture filling the page behind the others or behind a page of text (parchment), and small
//     ornaments, are left out;
//   - a page that is all picture and almost no text is a scan: the whole page is kept, for the AI to read;
//   - the words in each picture, read by Tesseract.js (public/vendor/tesseract) with no AI: a stat block or a
//     page set as a picture, a handout. Pictures with no real words (art, a map's room letters) get none.
// readPdf(arrayBuffer, { onProgress, ocr }) ->
//   { pages: [{ n, text, scanned }], pictures: [{ page, w, h, data, scanned, words, conf }], text, ocr }
let lib = null;
async function pdfjs() {
  if (!lib) {
    lib = await import('/vendor/pdfjs/pdf.min.mjs');
    lib.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs/pdf.worker.min.mjs';
  }
  return lib;
}

// Tesseract.js, loaded the first time a picture needs reading. null if it cannot run in this browser.
let reader = null;
async function wordReader() {
  if (reader) return reader;
  const T = await import('/vendor/tesseract/tesseract.esm.min.js');
  const at = (f) => new URL(`/vendor/tesseract/${f}`, location.href).href;
  const w = await (T.default || T).createWorker('eng', 1, { workerPath: at('worker.min.js'), corePath: at('tesseract-core-simd-lstm.wasm.js'), langPath: at(''), workerBlobURL: false, gzip: true, logger: () => {} });
  reader = { worker: w };
  return reader;
}
// The words a picture holds, if it holds real ones: enough words of three letters or more, read with
// confidence. Art and a map's room letters give none.
// Lines of rule marks and specks ("EE ————", "|") are left out.
export function realWords(text, conf) {
  const lines = String(text || '').split('\n').map((l) => l.replace(/[ \t]+/g, ' ').trim());
  const kept = lines.filter((l) => { const real = (l.match(/[A-Za-z0-9]/g) || []).length; const marks = l.replace(/[\sA-Za-z0-9()+-]/g, '').length; return !l || (real >= 3 && real >= marks * 2); });
  const t = kept.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  const words = (t.match(/[A-Za-z]{3,}/g) || []).length;
  return conf >= 55 && words >= 8 ? t : '';
}
const SIZE_LINE = /^(?:Tiny|Small|Medium|Large|Huge|Gargantuan)\b[^,\n]*,/im;
// A stat block whose name (often in a fancy face) was not read: the name line from the top of the picture.
export function needsName(words) {
  if (!SIZE_LINE.test(words) || !/Armou?r Class|Hit Points/i.test(words)) return false;
  const lines = words.split('\n').map((l) => l.trim()).filter(Boolean);
  const at = lines.findIndex((l) => SIZE_LINE.test(l));
  return at <= 0;
}
export function nameFrom(band) {
  const line = String(band || '').split('\n').map((l) => l.trim()).find((l) => (l.match(/[A-Za-z]/g) || []).length >= 3 && !SIZE_LINE.test(l) && !/Armou?r Class|Hit Points/i.test(l));
  return line ? line.replace(/[^A-Za-z' -]/g, '').replace(/\s+/g, ' ').trim() : '';
}

export async function readPdf(buffer, { onProgress = () => {}, maxPictures = 120, scale = 2.5, maxSide = 1600, ocr = true, ocrSide = 2600 } = {}) {
  const P = await pdfjs();
  const doc = await P.getDocument({ data: buffer, isEvalSupported: false, disableFontFace: false }).promise;
  const pages = [];
  const pictures = [];
  let ocrOk = null; let ocrWhy = '';
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
        if (!c) continue;
        const pic = { page: n, w: c.width, h: c.height, data: c.toDataURL('image/jpeg', 0.82), scanned, words: '', conf: 0 };
        pictures.push(pic);
        if (ocr && ocrOk !== false) {
          // Read at the render's own size (sharper than the picture kept for the screen).
          onProgress({ step: 'Reading the words in the pictures', at: n, of: doc.numPages });
          try {
            const R = await wordReader();
            const big = cut(canvas, b, scale, ocrSide, 2);
            const { data } = await R.worker.recognize(big);
            pic.words = realWords(data.text, data.confidence);
            pic.conf = Math.round(data.confidence || 0);
            if (pic.words && needsName(pic.words)) {
              // The heading alone, from a band across the top, is read where the whole picture missed it.
              const top = document.createElement('canvas');
              top.width = big.width; top.height = Math.min(big.height, Math.max(90, Math.round(big.height * 0.1)));
              top.getContext('2d').drawImage(big, 0, 0, big.width, top.height, 0, 0, top.width, top.height);
              const band = await R.worker.recognize(top);
              top.width = 0; top.height = 0;
              const name = nameFrom(band.data.text);
              if (name) pic.words = `${name}\n${pic.words}`;
            }
            big.width = 0; big.height = 0;
            ocrOk = true;
          } catch (e) { ocrOk = false; ocrWhy = String((e && e.message) || e).slice(0, 160); }
        }
      }
      canvas.width = 0; canvas.height = 0;
    }
    pages.push({ n, text, scanned });
    page.cleanup();
  }
  await doc.destroy();
  if (reader) { try { await reader.worker.terminate(); } catch { /* gone already */ } reader = null; }
  return { pages, pictures, text: pages.map((p) => `--- Page ${p.n} ---\n${p.text}`).join('\n\n'), ocr: ocrOk === false ? `The words in the pictures could not be read here (${ocrWhy}).` : '' };
}

// ---- text in reading order ---------------------------------------------------------------------
export function pageText(items, vp) {
  const W = vp.width;
  const H = vp.height;
  // Items in the viewport's top-left frame: x across, y down.
  const all = items.filter((i) => i.str && i.str.trim()).map((i) => {
    const [, , , d, e, f] = i.transform;
    const h = Math.abs(d) || Math.abs(i.height) || 10;
    const [x, y] = vp.convertToViewportPoint(e, f);
    return { s: i.str, x, y, w: i.width, h };
  });
  // A heading drawn twice, a shadow under the letters ("Dire WolfDire Wolf"): the same words at nearly the
  // same place are kept once.
  const its = all.filter((i, k) => !all.slice(0, k).some((o) => o.s === i.s && Math.abs(o.x - i.x) < Math.max(3, i.h * 0.3) && Math.abs(o.y - i.y) < Math.max(3, i.h * 0.3)));
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
    out += twice(line.replace(/\s+/g, ' ').trim());
  });
  return out;
}
// "Appendix A: CreaturesAppendix A: Creatures": a line that is the same words twice over is one of them.
export const twice = (t) => { const n = t.length; return n >= 6 && n % 2 === 0 && t.slice(0, n / 2) === t.slice(n / 2) ? t.slice(0, n / 2).trim() : t; };
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
// grow: how much a small picture may be enlarged (the word reader misses small headings otherwise).
function cut(canvas, b, scale, maxSide, grow = 1) {
  const sx = Math.floor(b.x * scale); const sy = Math.floor(b.y * scale);
  const sw = Math.min(canvas.width - sx, Math.ceil(b.w * scale)); const sh = Math.min(canvas.height - sy, Math.ceil(b.h * scale));
  if (sw < 20 || sh < 20) return null;
  const k = Math.min(grow, maxSide / Math.max(sw, sh));
  const c = document.createElement('canvas');
  c.width = Math.round(sw * k); c.height = Math.round(sh * k);
  c.getContext('2d').drawImage(canvas, sx, sy, sw, sh, 0, 0, c.width, c.height);
  return c;
}
