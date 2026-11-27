// The D&D 5e AI Director: the table server. One computer runs it; the DM opens /host, players
// open /play on their phones or laptops, and a shared screen can show /table.
//
//   node server.js                 start (or carry on with the saved game)
//   node server.js --new           start a fresh game
//   node server.js --online        also make a public link through cloudflared
//   --port 8788  --saves <dir>  --host-key ABC123  --table-code XYZ  --adventure lantern

import http from 'node:http';
import os from 'node:os';
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { gzipSync } from 'node:zlib';

import { newSession, newGameId, restart, attempt, viewFor, RuleError, openAdventure } from './engine/ledger.js';
import { prepareSrd, mergeAdventureMonsters } from './engine/library.js';
import { createMemory } from './brain/memory.js';
import { systemRng } from './engine/dice.js';
import { ADVENTURES, adventureById, adventureList, DEFAULT_ADVENTURE } from './data/adventures/index.js';
import * as CV from './brain/convert.js';
import { createDirector } from './brain/manager.js';
import { createVoice } from './brain/voice.js';
import { createSlots } from './slots.js';
import { createMapStore, MAX_PICTURE } from './mapfiles.js';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const opt = (name, dflt) => { const i = args.indexOf(name); return i >= 0 && args[i + 1] ? args[i + 1] : dflt; };

const PORT = Number(opt('--port', process.env.PORT || 8788));
const SAVE_DIR = opt('--saves', join(here, 'saves'));
const SAVE = join(SAVE_DIR, 'session.json');
// The engine version of the SRD (rules as fields beside the words: tools/compile-book.mjs), or the
// book itself if it has not been compiled; the Engine reads anything uncompiled when it loads.
const SRD_FILE = [join(here, '..', 'data', 'srd.engine.json'), join(here, '..', 'data', 'srd.json')].find((f) => existsSync(f));
const srd = JSON.parse(readFileSync(SRD_FILE, 'utf8'));
// Your private book library (library/library.json, built by tools/import-books.mjs) and every
// adventure's own monsters join the SRD before anything indexes it. --no-library plays SRD-only.
const prepared = prepareSrd(srd, { libraryFile: flag('--no-library') ? null : opt('--library', join(here, 'library', 'library.json')), adventures: ADVENTURES });
if (prepared.library) { const a = prepared.library; console.log(`Book library: ${a.spells} spells, ${a.monsters} monsters, ${a.subraces} subraces, ${a.subclasses} subclasses, ${a.backgrounds} backgrounds and ${a.rules} rules sections added (private to this computer).`); }
// What the DM converted on the Books tab (brain/convert.js): books join the rules, campaigns the list.
// Both are private, in library/, beside the books they came from.
const LIB_DIR = join(here, 'library');
const CONVERTED_DIR = join(LIB_DIR, 'converted');
const ADVENTURES_DIR = join(LIB_DIR, 'adventures');
if (!flag('--no-library')) {
  for (const b of CV.loadBooks(CONVERTED_DIR)) { const a = CV.mergeBook(srd, b); console.log(`Converted book "${b.name}": ${a.monsters} monsters, ${a.spells} spells, ${a.rules} rules sections${a.options ? `, ${a.options} character options` : ''}.`); }
  for (const a of CV.loadAdventures(ADVENTURES_DIR)) {
    if (ADVENTURES.some((x) => x.id === a.id)) continue;
    ADVENTURES.push(a);
    mergeAdventureMonsters(srd, [a]);
    console.log(`Converted adventure "${a.name}".`);
  }
}
let srdText = JSON.stringify(srd);
let srdGz = gzipSync(srdText);
const refreshSrd = () => { srdText = JSON.stringify(srd); srdGz = gzipSync(srdText); };
// Everything said in each game, kept on disk and searched (brain/memory.js).
const memory = createMemory({ dir: join(SAVE_DIR, 'games') });
const voice = createVoice({ saveDir: SAVE_DIR, getState: () => state });
// Saved games: named slots, an autosave, and the Supabase backup copy (slots.js).
const slots = createSlots({
  dir: SAVE_DIR,
  getState: () => state,
  chapters: (gameId) => (gameId ? memory.chapters(gameId) : []),
  describe: (s) => {
    const v = adventureById(s.adventure);
    const site = ((v.sites || []).find((x) => x.id === (s.scene || {}).siteId) || {}).name || '';
    const players = Object.values(s.pcs || {}).map((p) => p.name).join(', ');
    return { vector: `D&D: ${v.name}`, site, players };
  },
  prefix: 'dnd-',
});
const rng = systemRng();
// The maps' pictures, kept with the saved games (mapfiles.js).
const pictures = createMapStore(join(SAVE_DIR, 'maps'));
// The converted books' and adventures' own pictures, back into the store (the same picture is kept once).
if (!flag('--no-library')) for (const f of CV.libraryPictures(LIB_DIR)) { try { pictures.put(readFileSync(f)); } catch { /* not a picture */ } }

// ---------------------------------------------------------------- the session
let hostKey = opt('--host-key', '');
let tableCode = opt('--table-code', '').toUpperCase(); // asked of anyone joining from outside the home network
let publicUrl = opt('--public-url', '').replace(/\/+$/, '');
let state = null;
const history = []; // earlier Ledgers, for the host's Undo
// The adventure being played. A saved session brings its own; --adventure chooses one for a fresh start.
let adventure = adventureById(opt('--adventure', DEFAULT_ADVENTURE));

function load() {
  if (!flag('--new') && existsSync(SAVE)) {
    try {
      const saved = JSON.parse(readFileSync(SAVE, 'utf8'));
      if (saved.state && saved.state.pcs) {
        adventure = adventureById(saved.state.adventure);
        state = saved.state;
        hostKey = hostKey || saved.hostKey || '';
        tableCode = tableCode || saved.tableCode || '';
      }
    } catch (e) {
      console.log('The saved session could not be read; starting a new one.');
    }
  }
  if (!state) state = fresh(adventure);
  if (!state.gameId) state.gameId = newGameId();
  memory.observe(null, state);
  if (!hostKey) hostKey = randomBytes(3).toString('hex').toUpperCase();
  if (!tableCode) tableCode = Array.from(randomBytes(4), (b) => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b % 32]).join('');
  save();
}

let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      mkdirSync(SAVE_DIR, { recursive: true });
      const tmp = `${SAVE}.tmp`;
      writeFileSync(tmp, JSON.stringify({ hostKey, tableCode, savedAt: new Date().toISOString(), state }));
      renameSync(tmp, SAVE);
    } catch (e) {
      console.log(`Could not save the session: ${e.message}`);
    }
  }, 150);
}

// ------------------------------------------------------------- live screens
const screens = new Set(); // { res, role, pid }

let director = null; // the AI Director: created once the session is loaded

function payloadFor(role, pid) {
  const view = viewFor(state, role, pid);
  return director ? { ...view, director: director.view(role) } : view;
}

function send(screen) {
  screen.res.write(`event: state\ndata: ${JSON.stringify(payloadFor(screen.role, screen.pid))}\n\n`);
}

function broadcast() {
  for (const sc of screens) {
    try { send(sc); } catch (e) { screens.delete(sc); }
  }
}

setInterval(() => {
  for (const sc of screens) {
    try { sc.res.write(': still here\n\n'); } catch (e) { screens.delete(sc); }
  }
}, 20000).unref();

// ------------------------------------------------------------------ helpers
// A device on the home network joins freely. Anything arriving from outside it
// (a port forward, or the --online link) must carry the table code.
function isLocal(req) {
  if (req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'] || req.headers.forwarded) return false;
  const ip = String(req.socket.remoteAddress || '').replace(/^::ffff:/, '');
  if (ip === '::1' || ip.startsWith('127.') || ip.startsWith('10.') || ip.startsWith('192.168.') || ip.startsWith('169.254.')) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip)) return true;
  return /^f[cde]/i.test(ip); // private and link-local IPv6
}

function codeOk(q) {
  return String(q.t || '').toUpperCase() === tableCode;
}

function access(req, q) {
  if (q.role === 'host') {
    return q.key && String(q.key).toUpperCase() === hostKey ? { role: 'host' } : { error: 'That host key is not right.', need: 'key' };
  }
  if (!isLocal(req) && !codeOk(q)) return { error: 'This table needs its table code.', need: 'code' };
  return { role: q.role === 'player' && q.pid ? 'player' : 'table' };
}

function addresses() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const n of list || []) if (n.family === 'IPv4' && !n.internal) out.push(n.address);
  }
  return out;
}

const FILES = {
  '/app.js': ['public/app.js', 'text/javascript'],
  '/app.css': ['public/app.css', 'text/css'],
  '/scene.css': ['public/scene.css', 'text/css'],
  '/scene.js': ['public/scene.js', 'text/javascript'],
  '/flair.css': ['public/flair.css', 'text/css'],
  '/flair.js': ['public/flair.js', 'text/javascript'],
  '/words.js': ['public/words.js', 'text/javascript'],
  '/engine/rules.js': ['engine/rules.js', 'text/javascript'],
  '/engine/dice.js': ['engine/dice.js', 'text/javascript'],
  '/engine/pregen.js': ['engine/pregen.js', 'text/javascript'],
  '/engine/map.js': ['engine/map.js', 'text/javascript'],
  '/engine/check.js': ['engine/check.js', 'text/javascript'],
  '/engine/names.js': ['engine/names.js', 'text/javascript'],
  '/engine/triggers.js': ['engine/triggers.js', 'text/javascript'],
  '/engine/scale.js': ['engine/scale.js', 'text/javascript'],
  '/engine/seeds.js': ['engine/seeds.js', 'text/javascript'],
  '/engine/book.js': ['engine/book.js', 'text/javascript'],
  '/map.js': ['public/map.js', 'text/javascript'],
  '/pdfread.js': ['public/pdfread.js', 'text/javascript'],
  '/vendor/pdfjs/pdf.min.mjs': ['public/vendor/pdfjs/pdf.min.mjs', 'text/javascript'],
  '/vendor/pdfjs/pdf.worker.min.mjs': ['public/vendor/pdfjs/pdf.worker.min.mjs', 'text/javascript'],
  // Tesseract.js reads the words in a PDF's pictures when no AI can see them (public/vendor/tesseract).
  '/vendor/tesseract/tesseract.esm.min.js': ['public/vendor/tesseract/tesseract.esm.min.js', 'text/javascript'],
  '/vendor/tesseract/worker.min.js': ['public/vendor/tesseract/worker.min.js', 'text/javascript'],
  '/vendor/tesseract/tesseract-core-simd-lstm.wasm.js': ['public/vendor/tesseract/tesseract-core-simd-lstm.wasm.js', 'text/javascript'],
  '/vendor/tesseract/eng.traineddata.gz': ['public/vendor/tesseract/eng.traineddata.gz', 'application/octet-stream'],
  // The three screens as their own pages (the same app, its role fixed by the page).
  '/player.html': ['public/player.html', 'text/html'],
  '/table.html': ['public/table.html', 'text/html'],
  '/director.html': ['public/director.html', 'text/html'],
};
const PAGES = new Set(['/', '/table', '/play', '/player', '/host', '/director']);

// A new game places the first place's own monsters out of sight, as moving there would.
function fresh(adv, old = null, opts = {}) {
  const s = old ? restart(old, adv, opts) : newSession(adv);
  const first = (adv.sites || [])[0];
  let out = s;
  void first;
  out = openAdventure(out, adv, { role: 'host', rng, now: Date.now(), adventure: adv, srd });
  return out;
}

function json(res, code, body) {
  const text = JSON.stringify(body);
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(text);
}

// ---- the Books tab ----------------------------------------------------------------------------
let convertJob = null; // { busy, step, at, of, error, result, original, startedAt, staged }
// A PDF's pictures, sent a few at a time before a conversion: [{ n, page, w, h, mime, data, scanned }].
let stagedPictures = [];
const MAX_STAGED = 200;
const DATA_URL = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/;
async function booksApi(path, method, body) {
  if (path === '/' && method === 'GET') {
    const lib = srd.library || null;
    return {
      ai: director.aiName ? director.aiName() : '',
      kinds: CV.KINDS,
      books: [
        { id: 'srd', name: 'System Reference Document 5.1', kind: 'built in', counts: { monsters: srd.monsters.filter((m) => !m.lib && !m.adventure).length, spells: srd.spells.filter((x) => !x.lib).length, rules: (srd.rules || []).length }, gaps: (srd.engine || {}).gaps || 0, fixed: true },
        ...(lib ? [{ id: 'library', name: 'Your imported books', kind: (lib.books || []).map((b) => b.kind).join(', '), counts: { monsters: lib.added.monsters, spells: lib.added.spells, rules: lib.added.rules }, gaps: null, fixed: true }] : []),
        ...CV.listBooks(CONVERTED_DIR),
      ],
      adventures: ADVENTURES.map((a) => ({ id: a.id, name: a.name, levels: a.levels, converted: !!a.converted, places: (a.sites || []).length, monsters: (a.monsters || []).length, playing: !!(state && state.adventure === a.id) })),
      job: jobView(),
    };
  }
  if (path === '/job') return { job: jobView(true) };
  if (path === '/pictures' && method === 'POST') {
    if (convertJob && convertJob.busy) return { ok: false, error: 'A conversion is already running.' };
    if (body.reset) stagedPictures = [];
    for (const p of Array.isArray(body.pictures) ? body.pictures.slice(0, 12) : []) {
      const m = DATA_URL.exec(String((p && p.data) || ''));
      if (!m) continue;
      if (stagedPictures.length >= MAX_STAGED) return { ok: false, error: `That is more than ${MAX_STAGED} pictures: split the PDF into parts.` };
      const w = Math.trunc(Number(p.w)); const h = Math.trunc(Number(p.h));
      if (!(w > 0 && h > 0 && w <= 10000 && h <= 10000)) continue;
      stagedPictures.push({ n: stagedPictures.length + 1, page: Math.max(1, Math.trunc(Number(p.page) || 1)), w, h, mime: m[1], data: m[2], scanned: !!p.scanned, words: String(p.words || '').slice(0, 20000) });
    }
    return { ok: true, count: stagedPictures.length };
  }
  // The DM says what one picture is for: kept, left out, the travel map, or a place's map.
  if (path === '/use' && method === 'POST') {
    const r = convertJob && convertJob.result;
    const pic = r && (r.pictures || []).find((p) => p.n === Number(body.n));
    if (!pic) return { ok: false, error: 'There is no such picture.' };
    const use = String(body.use || '');
    if (!CV.pictureUses(r).some(([u]) => u === use)) return { ok: false, error: 'That is not something a picture can be used for here.' };
    if (use === 'travel' || use.startsWith('site:')) for (const p of r.pictures) if (p !== pic && p.use === use) p.use = 'keep';
    pic.use = use;
    if (typeof body.kind === 'string' && (body.kind === '' || CV.PICTURE_KINDS.some(([k]) => k === body.kind))) pic.kind = body.kind;
    return { ok: true };
  }
  if (path === '/convert' && method === 'POST') {
    if (convertJob && convertJob.busy) return { ok: false, error: 'A conversion is already running.' };
    const text = String(body.text || '');
    if (!text.trim() && !(body.pictures && stagedPictures.length)) return { ok: false, error: 'Paste some text first.' };
    if (text.length > CV.MAX_PASTE) return { ok: false, error: 'That is more than one go can take: split it into parts.' };
    const ai = director.aiReady && director.aiReady() ? (system, user, images) => director.ask(system, user, images) : null;
    const staged = body.pictures ? stagedPictures : [];
    stagedPictures = [];
    convertJob = { busy: true, step: 'Reading', at: 0, of: 0, error: '', result: null, original: text, startedAt: Date.now(), staged };
    const canSee = staged.length && ai && director.canSee ? await director.canSee() : null;
    CV.convertText({ text, kind: body.kind, name: String(body.name || '').slice(0, 80), how: body.how || 'both', ask: ai, srd, pictures: staged, canSee, onProgress: (p) => { Object.assign(convertJob, p); } })
      .then((r) => { if (r.words) { convertJob.original = r.words; delete r.words; } r.uses = CV.pictureUses(r); r.job = String(convertJob.startedAt); convertJob.result = r; })
      .catch((e) => { convertJob.error = e.message || String(e); })
      .finally(() => { convertJob.busy = false; convertJob.step = ''; });
    return { ok: true };
  }
  if (path === '/save' && method === 'POST') {
    const r = convertJob && convertJob.result;
    if (!r) return { ok: false, error: 'There is nothing converted to save.' };
    const name = String(body.name || r.name || 'Converted').slice(0, 80);
    // The pictures go into the maps' store (served at /maps/...) and beside the book or adventure.
    const files = [];
    const kept = [];
    const adventure = r.adventure ? { ...r.adventure, sites: (r.adventure.sites || []).map((s) => ({ ...s })) } : null;
    for (const p of r.pictures || []) {
      if (p.use === 'skip') continue;
      const src = (convertJob.staged || []).find((x) => x.n === p.n);
      if (!src) continue;
      const bytes = Buffer.from(src.data, 'base64');
      let url;
      try { url = pictures.put(bytes); } catch { continue; }
      files.push({ name: url.slice('/maps/'.length), bytes });
      const pic = { url, w: src.w, h: src.h };
      const site = adventure && p.use.startsWith('site:') ? adventure.sites.find((s) => `site:${s.id}` === p.use) : null;
      if (adventure && p.use === 'travel') adventure.travelPicture = pic;
      else if (site) site.picture = { ...pic, about: p.about || '' };
      else kept.push({ ...pic, kind: p.kind || '', about: p.about || '', page: p.page });
    }
    if (adventure) {
      // Saved under its name: the same name again replaces it (the old one set aside), a built-in one never.
      const same = ADVENTURES.find((x) => x.converted && x.name.toLowerCase() === name.toLowerCase());
      const id = same ? same.id : CV.slug(name);
      if (ADVENTURES.some((x) => x.id === id && !x.converted)) return { ok: false, error: `An adventure called "${id}" is built in: give this one another name.` };
      if (state && state.adventure === id) return { ok: false, error: `"${name}" is the adventure being played: start a new game of another one first, or save this under another name.` };
      const old = ADVENTURES.find((x) => x.id === id);
      if (old) { CV.removeAdventure(ADVENTURES_DIR, id); CV.unmergeAdventure(srd, id); }
      if (kept.length) adventure.pictures = kept;
      const adv = CV.saveAdventure(ADVENTURES_DIR, { ...adventure, id, name }, convertJob.original, files);
      const at = ADVENTURES.findIndex((x) => x.id === adv.id);
      if (at >= 0) ADVENTURES[at] = adv; else ADVENTURES.push(adv);
      mergeAdventureMonsters(srd, [adv]);
      refreshSrd();
      convertJob = null; stagedPictures = [];
      const maps = (adv.travelPicture ? 1 : 0) + adv.sites.filter((s) => s.picture).length;
      return { ok: true, saved: `"${adv.name}" is in the adventure list${old ? ' (it replaces the one saved before, which is set aside)' : ''}${maps ? `, with ${maps} map${maps > 1 ? 's' : ''} that a new game opens with` : ''}.` };
    }
    // A book: the same name again replaces it (the old one set aside), unless its monsters are in play.
    const prev = CV.listBooks(CONVERTED_DIR).find((b) => b.name.toLowerCase() === name.toLowerCase() || b.id === CV.slug(name));
    if (prev) {
      const busy = inPlay((m) => m.conv === prev.id);
      if (busy) return { ok: false, error: `"${prev.name}" has ${busy} in the game being played: save this under another name, or replace it after the game.` };
      CV.removeBook(CONVERTED_DIR, prev.id);
      CV.unmergeBook(srd, prev.id);
    }
    const meta = CV.saveBook(CONVERTED_DIR, { name, kind: r.kind, original: convertJob.original, book: r.book, pictures: kept, files });
    const eng = CV.loadBooks(CONVERTED_DIR).find((b) => b.id === meta.id);
    const added = eng ? CV.mergeBook(srd, eng) : { monsters: 0, spells: 0, rules: 0 };
    refreshSrd();
    convertJob = null; stagedPictures = [];
    return { ok: true, saved: `"${meta.name}" is in your books${prev ? ' (it replaces the one saved before, which is set aside)' : ''}: ${added.monsters} monsters, ${added.spells} spells${added.options ? `, ${added.options} character options` : ''} and ${added.rules} rules sections the Engine can use now${added.options ? ' (character creation lists the options)' : ''}.` };
  }
  if (path === '/discard' && method === 'POST') { if (!(convertJob && convertJob.busy)) convertJob = null; stagedPictures = []; return { ok: true }; }
  // Remove a converted book or adventure: out of the rules and the lists at once, its files set aside in
  // _removed (never deleted), unless the game being played uses it.
  if (path === '/remove' && method === 'POST') {
    const id = String(body.id || '');
    if (body.what === 'adventure') {
      const a = ADVENTURES.find((x) => x.id === id && x.converted);
      if (!a) return { ok: false, error: 'There is no converted adventure by that name.' };
      if (state && state.adventure === id) return { ok: false, error: `"${a.name}" is the adventure being played: start a new game of another one first.` };
      CV.removeAdventure(ADVENTURES_DIR, id);
      CV.unmergeAdventure(srd, id);
      ADVENTURES.splice(ADVENTURES.indexOf(a), 1);
      refreshSrd();
      return { ok: true, saved: `"${a.name}" is removed (set aside in library/adventures/_removed).` };
    }
    const b = CV.listBooks(CONVERTED_DIR).find((x) => x.id === id);
    if (!b) return { ok: false, error: 'There is no converted book by that name.' };
    const busy = inPlay((m) => m.conv === id);
    if (busy) return { ok: false, error: `"${b.name}" has ${busy} in the game being played: remove it after the game.` };
    CV.removeBook(CONVERTED_DIR, id);
    CV.unmergeBook(srd, id);
    refreshSrd();
    return { ok: true, saved: `"${b.name}" is removed from the rules (set aside in library/converted/_removed).` };
  }
  // The words a book or an adventure was converted from, back in the box to convert again.
  if (path === '/open' && method === 'POST') {
    const what = body.what === 'adventure' ? 'adventure' : 'book';
    const id = String(body.id || '');
    const item = what === 'adventure' ? ADVENTURES.find((x) => x.id === id && x.converted) : CV.listBooks(CONVERTED_DIR).find((x) => x.id === id);
    if (!item) return { ok: false, error: 'There is nothing saved by that name.' };
    const text = CV.originalOf(what === 'adventure' ? ADVENTURES_DIR : CONVERTED_DIR, what, id);
    if (text == null) return { ok: false, error: 'Its words were not kept, so it cannot be converted again: add the file again.' };
    return { ok: true, name: item.name, kind: what === 'adventure' ? 'campaign' : (CV.KINDS.some(([k]) => k === item.kind) ? item.kind : 'auto'), text };
  }
  return { ok: false, error: 'Not found.' };
}
// The monsters of the game being played that a converted book provides (refused to remove or replace).
function inPlay(fromBook) {
  if (!state) return '';
  const ix = new Map(srd.monsters.map((m) => [m.id, m]));
  const names = [...new Set(Object.values(state.foes || {}).filter((f) => !f.dead && ix.get(f.mid) && fromBook(ix.get(f.mid))).map((f) => f.name))];
  return names.length ? names.slice(0, 3).join(', ') + (names.length > 3 ? ' and more' : '') : '';
}
function jobView(full = false) {
  if (!convertJob) return null;
  const { busy, step, at, of, error, result, startedAt } = convertJob;
  return { busy, step, at, of, error, startedAt, result: result && (full ? result : { kind: result.kind, name: result.name }) };
}

function readBody(req, max = 65536) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > max) { reject(new Error('too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

// Raw bytes (a clip from the talk button), capped.
function readBytes(req, max) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > max) { reject(new Error('too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function act(role, pid, action) {
  if (action.type === 'undo') {
    if (role !== 'host') throw new RuleError('Only the host can undo.');
    if (!history.length) throw new RuleError('Nothing to undo.');
    const seq = state.seq;
    const was = state;
    state = history.pop();
    const undoneAfter = state.seq;
    state.seq = seq + 1; // screens must see a newer Ledger, never an older one
    adventure = adventureById(state.adventure); // undoing a new game brings its adventure back
    changed(was, state, { undoneAfter });
    return;
  }
  if (action.type === 'session.new') {
    if (role !== 'host') throw new RuleError('Only the host can start a new game.');
    const next = action.adventureId ? adventureById(action.adventureId) : adventure;
    if (director && director.busy && director.busy()) throw new RuleError('The Director is in the middle of a turn. Wait for it, or set it to Off, then start the new game.');
    history.push(state);
    const seq = state.seq;
    const old = state;
    adventure = next;
    state = fresh(next, old, { keepPlayers: action.keepPlayers !== false, keepCharacters: action.keepCharacters !== false });
    state.seq = seq + 1;
    if (director) director.reset();
    changed(old, state);
    return;
  }
  // The Engine's three kinds: done (with what it assumed), nothing changed, or a real no.
  const r = attempt(state, action, { role, pid, rng, now: Date.now(), adventure, srd });
  if (r.status !== 'done') { const e = new RuleError(r.text); e.kind = r.status === 'nochange' ? 'noop' : 'rule'; throw e; }
  history.push(state);
  if (history.length > 60) history.shift();
  const prev = state;
  state = r.state;
  changed(prev, state);
  return r.text;
}

// Load a saved game in place of this one. Undo brings this one back.
function loadSaved(rec) {
  if (director && director.busy && director.busy()) throw new RuleError('The Director is in the middle of a turn. Wait for it, or set it to Off, then load the game.');
  if (!rec.state || !rec.state.pcs) throw new RuleError('That saved game is not a D&D game.');
  history.push(state);
  const old = state;
  const seq = state.seq;
  adventure = adventureById(rec.state.adventure);
  state = rec.state;
  state.seq = seq + 1;
  // A game restored from the backup brings its chronicle with it.
  if (state.gameId && !memory.chapters(state.gameId).length) for (const ch of rec.chapters || []) memory.addChapter(state.gameId, ch);
  if (director) director.reset();
  changed(old, state);
  save();
  broadcast();
}

// Every change to the Ledger goes into the game's history. Leaving a site closes a chapter.
function changed(prev, next, opts = {}) {
  memory.observe(prev, next, opts);
  if (opts.undoneAfter == null && prev && director && prev.gameId === next.gameId && prev.scene.siteId !== next.scene.siteId) {
    director.chapter({ siteId: prev.scene.siteId, why: 'left' });
  }
}

// The Director's finished turn becomes the live Ledger.
function commit(next) {
  history.push(state);
  if (history.length > 60) history.shift();
  const prev = state;
  state = next.seq > state.seq ? next : { ...next, seq: state.seq + 1 };
  changed(prev, state);
  save();
  broadcast();
}

// Player actions the Director should answer.
const ANSWERED = { say: 'a player spoke', 'roll.make': 'a roll was made', attack: 'a player attacked', 'spell.cast': 'a player cast a spell', 'fight.next': 'a player ended their turn', 'resource.use': 'a player used an ability' };

// ------------------------------------------------------------------- server
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const q = Object.fromEntries(url.searchParams);
  try {
    if (req.method === 'GET' && PAGES.has(url.pathname)) {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      res.end(readFileSync(join(here, 'public', 'index.html')));
      return;
    }
    if (req.method === 'GET' && url.pathname === '/srd.json') {
      const gz = /\bgzip\b/.test(String(req.headers['accept-encoding'] || ''));
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=3600', ...(gz ? { 'content-encoding': 'gzip' } : {}) });
      res.end(gz ? srdGz : srdText);
      return;
    }
    if (req.method === 'GET' && FILES[url.pathname]) {
      const [file, type] = FILES[url.pathname];
      // The vendored libraries do not change between versions of the Director: the browser keeps them a day.
      const lib = url.pathname.startsWith('/vendor/');
      res.writeHead(200, { 'content-type': type.startsWith('text/') ? `${type}; charset=utf-8` : type, 'cache-control': lib ? 'public, max-age=86400' : 'no-store' });
      res.end(readFileSync(join(here, file)));
      return;
    }
    // A map picture (named by its contents, so it can be kept for good).
    if (req.method === 'GET' && url.pathname.startsWith('/maps/')) {
      const pic = pictures.get(url.pathname.slice(6));
      if (!pic) { json(res, 404, { error: 'No such picture.' }); return; }
      res.writeHead(200, { 'content-type': pic.type, 'cache-control': 'public, max-age=31536000, immutable', 'x-content-type-options': 'nosniff' });
      res.end(pic.bytes);
      return;
    }
    // The DM imports a picture for a map: the bytes come raw, and only a real image is kept.
    if (req.method === 'POST' && url.pathname === '/api/map/upload') {
      const who = access(req, { role: 'host', key: q.key });
      if (who.role !== 'host') { json(res, 403, { error: 'Only the DM can import maps.' }); return; }
      let bytes;
      try { bytes = await readBytes(req, MAX_PICTURE); } catch (e) { json(res, 200, { ok: false, error: 'That picture is too big (25 MB at most).' }); return; }
      try { json(res, 200, { ok: true, url: pictures.put(bytes) }); } catch (e) { json(res, 200, { ok: false, error: e.message }); }
      return;
    }
    if (req.method === 'GET' && url.pathname === '/api/info') {
      const out = { title: adventure.name, port: PORT, addresses: addresses(), voice: voice.publicView() };
      const isHost = !!(q.key && String(q.key).toUpperCase() === hostKey);
      const trusted = isLocal(req) || codeOk(q) || isHost;
      if (trusted && publicUrl) out.online = `${publicUrl}/play?t=${tableCode}`;
      // Every way in, for each screen (Roly, 27 Nov): players, the table screen and (for the DM only) the Director,
      // on this network and from anywhere when the --online link is up.
      const lan = addresses()[0] || 'localhost';
      out.links = {
        lan: { play: `http://${lan}:${PORT}/player.html`, table: `http://${lan}:${PORT}/table.html`, ...(isHost ? { host: `http://${lan}:${PORT}/director.html?key=${hostKey}` } : {}) },
        online: trusted && publicUrl ? { play: `${publicUrl}/play?t=${tableCode}`, table: `${publicUrl}/table?t=${tableCode}`, ...(isHost ? { host: `${publicUrl}/director.html?key=${hostKey}` } : {}) } : null,
        code: trusted ? tableCode : '',
      };
      json(res, 200, out);
      return;
    }
    if (req.method === 'GET' && url.pathname === '/api/scenario') {
      const who = access(req, q);
      if (!who.role) { json(res, 403, who); return; }
      const role = who.role;
      // Players get the places' names and how they join (for the travel map), never the DM's notes.
      const sites = (adventure.sites || []).map((x) => (role === 'host' ? x : { id: x.id, name: x.name, region: x.region, travelHours: x.travelHours || 0, exits: (x.exits || []).map((e) => ({ to: e.to })), map: x.map || null }));
      json(res, 200, role === 'host'
        ? { ...adventure, sites, adventures: adventureList(), voice: voice.hostView() }
        : { id: adventure.id, name: adventure.name, levels: adventure.levels, blurb: adventure.blurb, sites, pregens: adventure.pregens || null });
      return;
    }
    // The same view as the live stream, fetched once: the page falls back to this when a tunnel or proxy holds the stream back.
    if (req.method === 'GET' && url.pathname === '/api/poll') {
      const who = access(req, q);
      if (!who.role) { json(res, 403, who); return; }
      if (q.pid) polled.set(q.pid, Date.now());
      json(res, 200, payloadFor(who.role, q.pid || null));
      return;
    }
    if (req.method === 'GET' && url.pathname === '/api/events') {
      const who = access(req, q);
      if (!who.role) { json(res, 403, who); return; }
      const role = who.role;
      res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store, no-transform', connection: 'keep-alive', 'x-accel-buffering': 'no' });
      res.write(': ' + ' '.repeat(2048) + '\n\n'); // padding so a buffering proxy flushes the first event
      const screen = { res, role, pid: q.pid || null };
      screens.add(screen);
      send(screen);
      req.on('close', () => screens.delete(screen));
      return;
    }
    if (req.method === 'POST' && url.pathname === '/api/action') {
      const body = await readBody(req);
      const who = access(req, body);
      if (!who.role) { json(res, 403, who); return; }
      const role = who.role;
      let note = '';
      try {
        note = act(role, body.pid || null, body.action || {}) || '';
      } catch (e) {
        if (e instanceof RuleError || /dice|die/i.test(e.message)) { json(res, 200, { ok: false, error: e.message, nochange: e.kind === 'noop' }); return; }
        throw e;
      }
      save();
      broadcast();
      const type = (body.action || {}).type;
      if (director && ANSWERED[type] && (role === 'player' || type === 'say')) director.playerActed(ANSWERED[type]);
      json(res, 200, { ok: true, seq: state.seq, ...(note ? { note } : {}) });
      return;
    }
    if (req.method === 'POST' && url.pathname === '/api/voice/say') {
      const body = await readBody(req);
      const who = access(req, body);
      if (!who.role) { json(res, 403, who); return; }
      const out = await voice.say(body.text);
      if (!out.ok) { json(res, 200, out); return; }
      res.writeHead(200, { 'content-type': out.type, 'cache-control': 'no-store' });
      res.end(out.bytes);
      return;
    }
    if (req.method === 'POST' && url.pathname === '/api/voice/hear') {
      const who = access(req, q);
      if (who.role !== 'player') { json(res, 403, who.role ? { error: 'Only a seated player can talk.' } : who); return; }
      let bytes;
      try { bytes = await readBytes(req, voice.limits.MAX_CLIP); } catch (e) { json(res, 200, { ok: false, error: 'That was too long. Keep it under about a minute.' }); return; }
      json(res, 200, await voice.hear(bytes, String(req.headers['content-type'] || 'audio/webm').split(';')[0]));
      return;
    }
    // Saved games, for the host's Saves tab.
    if (req.method === 'POST' && url.pathname === '/api/saves') {
      const body = await readBody(req);
      const who = access(req, { ...body, role: 'host' });
      if (!who.role) { json(res, 403, who); return; }
      const out = { ok: true };
      try {
        switch (body.op) {
          case 'save': out.saved = await slots.save(body.name); break;
          case 'load': loadSaved(slots.read(String(body.id || ''))); break;
          case 'delete': slots.remove(String(body.id || '')); break;
          case 'config': slots.configure({ url: body.url, key: body.secret }); break; // `key` is the host key
          case 'test': await slots.test(); break;
          case 'pushAll': out.copied = await slots.pushAll(); break;
          case 'cloudList': out.cloudSlots = await slots.cloudList(); break;
          case 'restore': out.restored = await slots.restore(String(body.id || '')); break;
          default: break;
        }
      } catch (e) {
        out.ok = false;
        out.error = e.message;
      }
      out.slots = slots.list();
      out.cloud = slots.cloudView();
      json(res, 200, out);
      return;
    }
    // The Books tab: convert pasted text (brain/convert.js), see it, save it, list what the Engine has.
    // One of the pictures being converted, to show on the Books tab.
    if (req.method === 'GET' && url.pathname === '/api/books/picture') {
      if (access(req, { ...q, role: 'host' }).role !== 'host') { json(res, 403, { error: 'Only the DM can see this.' }); return; }
      const src = ((convertJob && convertJob.staged) || stagedPictures).find((p) => p.n === Number(q.n));
      if (!src) { json(res, 404, { error: 'No such picture.' }); return; }
      res.writeHead(200, { 'content-type': src.mime, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
      res.end(Buffer.from(src.data, 'base64'));
      return;
    }
    if (url.pathname.startsWith('/api/books')) {
      const body = req.method === 'POST' ? await readBody(req, 12 * 1024 * 1024).catch(() => null) : {};
      if (!body) { json(res, 200, { ok: false, error: 'That is too much to paste at once (about 10 MB at most): split it into parts.' }); return; }
      const who = access(req, { ...q, ...body, role: 'host' });
      if (who.role !== 'host') { json(res, 403, { error: 'Only the DM can convert books.' }); return; }
      json(res, 200, await booksApi(url.pathname.slice('/api/books'.length) || '/', req.method, body));
      return;
    }
    if (req.method === 'POST' && url.pathname === '/api/director') {
      const body = await readBody(req);
      const who = access(req, { ...body, role: 'host' });
      if (!who.role) { json(res, 403, who); return; }
      if (body.op === 'voice') { voice.configure(body); json(res, 200, { ok: true }); return; }
      await director.op(body);
      json(res, 200, { ok: true });
      return;
    }
    json(res, 404, { error: 'Not found.' });
  } catch (e) {
    console.error(e);
    json(res, 500, { error: 'The Director host hit a problem. See its window for details.' });
  }
});

// --online: ask cloudflared for a temporary public address that leads to this host.
function startTunnel() {
  const line = '-'.repeat(62);
  let child;
  try {
    child = spawn('cloudflared', ['tunnel', '--url', `http://localhost:${PORT}`], { stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    child = null;
  }
  const missing = () => {
    console.log(line);
    console.log(' --online needs the free "cloudflared" program, and it was not found.');
    console.log(' Windows: open a Command Prompt and run');
    console.log('     winget install --id Cloudflare.cloudflared');
    console.log(' then close this window and start again.');
    console.log(' Play on your own network still works meanwhile.');
    console.log(line);
  };
  if (!child) { missing(); return; }
  child.on('error', missing);
  const read = (buf) => {
    const m = String(buf).match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
    if (m && publicUrl !== m[0]) {
      publicUrl = m[0];
      console.log(line);
      console.log(' For players anywhere (send them this link):');
      console.log(`   Join           ${publicUrl}/play?t=${tableCode}`);
      console.log(' For you, the DM, from anywhere (it asks for the host key):');
      console.log(`   Director (DM)  ${publicUrl}/director.html`);
      console.log(' For a table screen anywhere:');
      console.log(`   Table screen   ${publicUrl}/table?t=${tableCode}`);
      console.log(' The links change each time the host is started with --online.');
      console.log(line);
    }
  };
  child.stdout.on('data', read);
  child.stderr.on('data', read);
  child.on('exit', (code) => { if (publicUrl) console.log(` The outside link has closed (cloudflared stopped${code ? `, code ${code}` : ''}).`); publicUrl = opt('--public-url', ''); });
  const stop = () => { try { child.kill(); } catch (e) { /* already gone */ } };
  process.on('exit', stop);
  process.on('SIGINT', () => process.exit(0));
  process.on('SIGTERM', () => process.exit(0));
}

load();
const polled = new Map();

// The autosave: every five minutes while the game is changing, one slot per game (and its backup copy).
let autoSeq = -1;
setInterval(() => {
  if (!state || state.seq === autoSeq) return;
  autoSeq = state.seq;
  slots.autosave().catch((e) => console.log(`The autosave could not be written: ${e.message}`));
}, Number(opt('--autosave-ms', '300000'))).unref();

director = createDirector({ getState: () => state, commit, act: (a) => { act('host', null, a); save(); broadcast(); }, memory, getAdventure: () => adventure, srd, saveDir: SAVE_DIR, rng, onChange: broadcast });
director.init();
server.listen(PORT, '0.0.0.0', () => {
  const ips = addresses();
  const line = '-'.repeat(62);
  console.log(line);
  console.log(' Dungeons & Dragons 5e - AI Director');
  console.log(` Adventure: ${adventure.name}`);
  console.log(line);
  console.log(' On this computer:');
  console.log(`   Director (DM)  http://localhost:${PORT}/director.html?key=${hostKey}`);
  console.log(`   Table screen   http://localhost:${PORT}/table.html`);
  if (ips.length) {
    console.log(' For players, on the same Wi-Fi or network:');
    for (const ip of ips) console.log(`   Player         http://${ip}:${PORT}/player.html`);
  } else {
    console.log(' No network address found: other devices cannot join yet.');
  }
  if (publicUrl) {
    console.log(` Outside link:    ${publicUrl}/play?t=${tableCode}`);
    console.log(` DM from outside: ${publicUrl}/director.html   (asks for the host key)`);
    console.log(` Table outside:   ${publicUrl}/table?t=${tableCode}`);
  }
  console.log(` Host key: ${hostKey}   (keep it to yourself)`);
  console.log(` Table code: ${tableCode}   (asked of anyone joining from outside your network)`);
  console.log(' Close this window, or press Ctrl+C, to stop. The session is saved.');
  console.log(line);
  if (flag('--online')) startTunnel();
});
