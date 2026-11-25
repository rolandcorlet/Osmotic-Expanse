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

import { newSession, newGameId, restart, apply, viewFor, RuleError, openAdventure } from './engine/ledger.js';
import { prepareSrd } from './engine/library.js';
import { createMemory } from './brain/memory.js';
import { systemRng } from './engine/dice.js';
import { ADVENTURES, adventureById, adventureList, DEFAULT_ADVENTURE } from './data/adventures/index.js';
import { createDirector } from './brain/manager.js';
import { createVoice } from './brain/voice.js';
import { createSlots } from './slots.js';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const opt = (name, dflt) => { const i = args.indexOf(name); return i >= 0 && args[i + 1] ? args[i + 1] : dflt; };

const PORT = Number(opt('--port', process.env.PORT || 8788));
const SAVE_DIR = opt('--saves', join(here, 'saves'));
const SAVE = join(SAVE_DIR, 'session.json');
const SRD_FILE = join(here, '..', 'data', 'srd.json');
const srd = JSON.parse(readFileSync(SRD_FILE, 'utf8'));
// Your private book library (library/library.json, built by tools/import-books.mjs) and every
// adventure's own monsters join the SRD before anything indexes it. --no-library plays SRD-only.
const prepared = prepareSrd(srd, { libraryFile: flag('--no-library') ? null : opt('--library', join(here, 'library', 'library.json')), adventures: ADVENTURES });
if (prepared.library) { const a = prepared.library; console.log(`Book library: ${a.spells} spells, ${a.monsters} monsters, ${a.subraces} subraces, ${a.subclasses} subclasses, ${a.backgrounds} backgrounds and ${a.rules} rules sections added (private to this computer).`); }
const srdText = JSON.stringify(srd);
const srdGz = gzipSync(srdText);
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
  '/engine/rules.js': ['engine/rules.js', 'text/javascript'],
  '/engine/dice.js': ['engine/dice.js', 'text/javascript'],
  '/engine/pregen.js': ['engine/pregen.js', 'text/javascript'],
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

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > 65536) { reject(new Error('too large')); req.destroy(); return; }
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
  const next = apply(state, action, { role, pid, rng, now: Date.now(), adventure, srd });
  history.push(state);
  if (history.length > 60) history.shift();
  const prev = state;
  state = next;
  changed(prev, state);
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
      res.writeHead(200, { 'content-type': `${type}; charset=utf-8`, 'cache-control': 'no-store' });
      res.end(readFileSync(join(here, file)));
      return;
    }
    if (req.method === 'GET' && url.pathname === '/api/info') {
      const out = { title: adventure.name, port: PORT, addresses: addresses(), voice: voice.publicView() };
      const trusted = isLocal(req) || codeOk(q) || (q.key && String(q.key).toUpperCase() === hostKey);
      if (trusted && publicUrl) out.online = `${publicUrl}/play?t=${tableCode}`;
      json(res, 200, out);
      return;
    }
    if (req.method === 'GET' && url.pathname === '/api/scenario') {
      const who = access(req, q);
      if (!who.role) { json(res, 403, who); return; }
      const role = who.role;
      const sites = (adventure.sites || []).map((x) => (role === 'host' ? x : { id: x.id, name: x.name, region: x.region }));
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
      try {
        act(role, body.pid || null, body.action || {});
      } catch (e) {
        if (e instanceof RuleError || /dice|die/i.test(e.message)) { json(res, 200, { ok: false, error: e.message }); return; }
        throw e;
      }
      save();
      broadcast();
      const type = (body.action || {}).type;
      if (director && ANSWERED[type] && (role === 'player' || type === 'say')) director.playerActed(ANSWERED[type]);
      json(res, 200, { ok: true, seq: state.seq });
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
  }
  console.log(` Host key: ${hostKey}   (keep it to yourself)`);
  console.log(` Table code: ${tableCode}   (asked of anyone joining from outside your network)`);
  console.log(' Close this window, or press Ctrl+C, to stop. The session is saved.');
  console.log(line);
  if (flag('--online')) startTunnel();
});
