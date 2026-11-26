// The Skeleton host: one computer runs this; every phone, tablet and laptop joins it in a browser.
//   node server.js [--port 8790] [--module saltglass] [--adventure id] [--new] [--key secret] [--online] [--table-code ABCD]
//   --online asks the free cloudflared program for a public link, so players anywhere can join (they need the
//   table code; anyone on this computer or its own network does not).
// No packages to install: Node 18 or later only.

import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, extname, normalize } from 'node:path';
import { networkInterfaces } from 'node:os';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { systemRng } from './engine/dice.js';
import { listModules, loadModule, saveModule, check, books } from './engine/module.js';
import { newSession, apply, viewFor, RuleError } from './engine/ledger.js';
import { directorTurn } from './brain/director.js';
import { convert, MODES } from './brain/converter.js';
import { createSettings } from './brain/settings.js';
import { publicProviders, testConnection, pickDefaultModel } from './brain/providers.js';
import { createVoice } from './brain/voice.js';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const MOD_DIR = join(ROOT, 'modules');
const SAVE_DIR = join(ROOT, 'saves');
const PUB = join(ROOT, 'public');
const arg = (k, d = '') => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const PORT = Number(arg('port', process.env.PORT || 8790));
const HOST_KEY = arg('key', '') || randomBytes(4).toString('hex');
mkdirSync(SAVE_DIR, { recursive: true });
// The table code: asked of anyone joining from outside this computer's own network (the --online link). It is
// kept between starts so a link sent to players keeps working.
const TABLE_CODE = (() => {
  const given = arg('table-code', '').toUpperCase();
  const file = join(SAVE_DIR, 'access.json');
  let saved = {};
  try { saved = JSON.parse(readFileSync(file, 'utf8')); } catch (e) { /* first start */ }
  const code = given || saved.tableCode || Array.from(randomBytes(4), (b) => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b % 32]).join('');
  if (code !== saved.tableCode) { try { writeFileSync(file, JSON.stringify({ ...saved, tableCode: code })); } catch (e) { /* keep going */ } }
  return code;
})();
let publicUrl = arg('public-url', '').replace(/\/+$/, '');

const rng = systemRng();
const settings = createSettings({ saveDir: SAVE_DIR });
let mod = null;
let state = null;
const history = []; // for undo

function loadGame({ moduleId, adventureId, fresh = false }) {
  const m = loadModule(MOD_DIR, moduleId);
  const r = check(m);
  if (!r.ok) throw new Error(`The module "${moduleId}" has problems:\n- ${r.errors.join('\n- ')}`);
  mod = m;
  const file = join(SAVE_DIR, 'session.json');
  let saved = null;
  if (!fresh && existsSync(file)) { try { saved = JSON.parse(readFileSync(file, 'utf8')); } catch (e) { saved = null; } }
  state = saved && saved.moduleId === moduleId && (!adventureId || saved.adventureId === adventureId) ? saved : newSession(mod, adventureId);
  history.length = 0;
  persist();
}
function persist() { try { writeFileSync(join(SAVE_DIR, 'session.json'), JSON.stringify(state)); } catch (e) { /* keep playing */ } }

{
  const mods = listModules(MOD_DIR);
  let saved = null;
  try { saved = JSON.parse(readFileSync(join(SAVE_DIR, 'session.json'), 'utf8')); } catch (e) { /* none */ }
  const want = arg('module', '') || (saved && mods.some((m) => m.id === saved.moduleId) ? saved.moduleId : (mods[0] || {}).id);
  if (!want) { console.error('No modules in modules/. Add one (or run the converter) and start again.'); process.exit(1); }
  loadGame({ moduleId: want, adventureId: arg('adventure', '') || undefined, fresh: process.argv.includes('--new') });
}

// Words the voice may read besides narration: the game's public text.
function publicSpeech(t) {
  const flat = (x) => String(x || '').replace(/\s+/g, ' ');
  const adv = mod.ix.adventure[state.adventureId] || {};
  const pool = [adv.intro, ...(adv.sites || []).map((s) => s.read), ...books(mod).filter((b) => !b.hidden).map((b) => b.text)];
  return pool.some((x) => flat(x).includes(flat(t)));
}
const voice = createVoice({ saveDir: SAVE_DIR, getState: () => state, alsoSpeakable: publicSpeech });

// ---------------------------------------------------------------- live updates
const clients = new Set(); // { res, role, pid }
function push() {
  for (const c of clients) {
    try { c.res.write(`event: state\ndata: ${JSON.stringify(viewFor(state, c.role))}\n\n`); } catch (e) { clients.delete(c); }
  }
}
function pushEvent(name, data) { for (const c of clients) if (c.role === 'host') { try { c.res.write(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`); } catch (e) { clients.delete(c); } } }

function act(action, role, pid, extra = {}) {
  const before = state;
  state = apply(state, action, { role, pid, rng, now: Date.now(), mod, ...extra });
  history.push(before);
  if (history.length > 40) history.shift();
  persist();
  push();
  return state;
}

// ---------------------------------------------------------------- the AI Director
let directing = null;
let again = false;
let lastDirector = null;
async function runDirector(reason, hostNote = '') {
  if (directing) { again = true; return directing; }
  directing = (async () => {
    pushEvent('director', { busy: true });
    try {
      const provider = settings.provider();
      const before = state;
      const out = await directorTurn({ state, mod, provider, rng, now: Date.now(), reason, hostNote });
      history.push(before);
      state = out.state;
      persist();
      push();
      lastDirector = { at: Date.now(), calls: out.calls, flags: out.flags, usage: out.usage, refusals: out.refusals };
      pushEvent('director', { busy: false, last: lastDirector });
    } catch (e) {
      lastDirector = { at: Date.now(), error: e.message };
      pushEvent('director', { busy: false, last: lastDirector });
    } finally {
      directing = null;
      if (again) { again = false; setTimeout(() => runDirector('The table moved on while you were speaking. Continue.'), 50); }
    }
  })();
  return directing;
}
// What a player did that the Director should answer, when it runs by itself.
function wantsDirector(action) {
  if (state.director.mode !== 'auto') return '';
  if (action.type === 'say') return `A player spoke: "${action.text}". Answer them.`;
  if (action.type === 'roll.make') return 'A roll came in. Say what it did.';
  if (action.type === 'attack' || action.type === 'ability.use') return 'A character acted. Say what happened.';
  if (action.type === 'fight.next') {
    const cur = state.fight && state.fight.order[state.fight.turn];
    if (cur && cur.key.startsWith('creature:')) return 'A creature is up: play its turn, then end_turn.';
    return 'The turn passed. Describe the moment for whoever is up.';
  }
  if (action.type === 'char.create' || action.type === 'char.pregen') return 'A player has a character now. Welcome them into the scene.';
  return '';
}

// ---------------------------------------------------------------- converter jobs
let converting = null;
async function runConvert(body) {
  if (converting) throw new Error('A conversion is already running.');
  const provider = settings.provider();
  const existing = body.mode === 'extend' ? loadModule(MOD_DIR, body.base) : null;
  converting = { started: Date.now(), steps: [] };
  try {
    const out = await convert({
      provider, mode: body.mode, source: body.source, ideas: body.ideas, name: body.name, notes: body.notes, sections: body.sections, existing, dice: body.dice,
      onProgress: (p) => { converting.steps.push(p); pushEvent('convert', p); },
    });
    let savedAs = '';
    if (out.mod.module && out.mod.module.id && body.save !== false) {
      if (body.mode !== 'extend') {
        let id = out.mod.module.id;
        const taken = new Set(listModules(MOD_DIR).map((m) => m.id));
        for (let n = 2; taken.has(id); n++) id = `${out.mod.module.id}-${n}`;
        out.mod.module.id = id;
      }
      saveModule(MOD_DIR, out.mod);
      savedAs = out.mod.module.id;
    }
    return { ok: out.ok, errors: out.errors, log: out.log, usage: out.usage, savedAs };
  } finally { converting = null; }
}

// ---------------------------------------------------------------- http
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp' };
const json = (res, code, x) => { res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(x)); };
async function body(req, max = 4 << 20) {
  let size = 0; const parts = [];
  for await (const ch of req) { size += ch.length; if (size > max) throw new Error('Too much text in one go (4 MB at most).'); parts.push(ch); }
  const t = Buffer.concat(parts).toString('utf8');
  return t ? JSON.parse(t) : {};
}
const isHostReq = (url, b = {}) => (url.searchParams.get('key') || b.key) === HOST_KEY;
// This computer or its own network (not through the tunnel): no table code needed.
function isLocal(req) {
  if (req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'] || req.headers.forwarded) return false;
  const ip = String(req.socket.remoteAddress || '').replace(/^::ffff:/, '');
  if (ip === '::1' || ip.startsWith('127.') || ip.startsWith('10.') || ip.startsWith('192.168.') || ip.startsWith('169.254.')) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip)) return true;
  return /^f[cde]/i.test(ip);
}
const codeOk = (url) => String(url.searchParams.get('t') || '').toUpperCase() === TABLE_CODE;
// Every way in, for each screen: on this network, and from anywhere when the --online link is up (Roly, 27 Nov:
// the players' screen, the table screen and the host console, each with its outside address too).
function links({ host = false, trusted = false } = {}) {
  const lan = addresses()[0] || 'localhost';
  const out = { lan: { play: `http://${lan}:${PORT}/play`, table: `http://${lan}:${PORT}/table` }, online: null, code: trusted ? TABLE_CODE : '' };
  if (host) out.lan.host = `http://${lan}:${PORT}/host?key=${HOST_KEY}`;
  if (publicUrl && trusted) {
    out.online = { play: `${publicUrl}/play?t=${TABLE_CODE}`, table: `${publicUrl}/table?t=${TABLE_CODE}` };
    if (host) out.online.host = `${publicUrl}/host?key=${HOST_KEY}`;
  }
  return out;
}

// What screens may know about the module: everything but the adventure's secrets and notes
// (and, for players, the bestiary's numbers stay on the host).
function moduleFor(role) {
  const strip = (a) => ({ id: a.id, name: a.name, pitch: a.pitch, intro: a.intro, sites: (a.sites || []).map((s) => ({ id: s.id, name: s.name, read: s.read, exits: s.exits })), level: a.level, party: a.party });
  return {
    module: mod.module, rules: mod.rules, handbook: mod.handbook, lore: mod.lore,
    bestiary: role === 'host' ? mod.bestiary : { creatures: mod.bestiary.creatures.map((c) => ({ id: c.id, name: c.name, look: c.look, tier: c.tier })) },
    adventures: role === 'host' ? mod.adventures : mod.adventures.map(strip),
  };
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const p = url.pathname;
  try {
    // From outside the home network (the --online link): the table code or the host key, or nothing.
    if (p.startsWith('/api/') && !isLocal(req) && !isHostReq(url) && !codeOk(url)) {
      json(res, 403, { ok: false, error: 'This table needs its table code.', need: 'code' });
      return;
    }
    if (req.method === 'GET' && p === '/api/events') {
      const role = isHostReq(url) ? 'host' : url.searchParams.get('role') === 'table' ? 'table' : 'player';
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
      const c = { res, role };
      clients.add(c);
      res.write(`event: state\ndata: ${JSON.stringify(viewFor(state, role))}\n\n`);
      const ping = setInterval(() => { try { res.write(': ping\n\n'); } catch (e) { /* gone */ } }, 25000);
      req.on('close', () => { clearInterval(ping); clients.delete(c); });
      return;
    }
    if (req.method === 'GET' && p === '/api/hello') {
      const host = isHostReq(url);
      const out = { role: host ? 'host' : 'player', module: moduleFor(host ? 'host' : 'player'), modes: MODES, voice: voice.publicView(), port: PORT, addresses: addresses(), links: links({ host, trusted: true }) };
      if (host) Object.assign(out, { modules: listModules(MOD_DIR), providers: publicProviders(), ai: settings.publicView(), voiceCfg: voice.hostView(), lastDirector, converting: !!converting });
      json(res, 200, out);
      return;
    }
    if (req.method === 'POST' && p === '/api/act') {
      const b = await body(req);
      const host = isHostReq(url, b);
      const pid = host ? null : String(b.pid || '').slice(0, 40);
      if (!host && !pid) { json(res, 200, { ok: false, error: 'No player id.' }); return; }
      try {
        act(b.action || {}, host ? 'host' : 'player', pid);
        const why = wantsDirector(b.action || {});
        if (why) runDirector(why);
        json(res, 200, { ok: true });
      } catch (e) {
        if (e instanceof RuleError) json(res, 200, { ok: false, error: e.message }); else throw e;
      }
      return;
    }
    if (req.method === 'POST' && p === '/api/voice/say') {
      const b = await body(req);
      const out = await voice.say(b.text);
      if (!out.ok) { json(res, 200, out); return; }
      res.writeHead(200, { 'content-type': out.type, 'cache-control': 'no-store' }); res.end(out.bytes);
      return;
    }
    // ---- host only from here
    if (p.startsWith('/api/')) {
      const b = req.method === 'POST' ? await body(req) : {};
      if (!isHostReq(url, b)) { json(res, 403, { ok: false, error: 'Only the host can do that.' }); return; }
      if (p === '/api/director') { runDirector(b.reason || 'The host asks you to continue.', b.hostNote || ''); json(res, 200, { ok: true }); return; }
      if (p === '/api/undo') { if (!history.length) { json(res, 200, { ok: false, error: 'Nothing to undo.' }); return; } state = history.pop(); persist(); push(); json(res, 200, { ok: true }); return; }
      if (p === '/api/new') { loadGame({ moduleId: b.module || state.moduleId, adventureId: b.adventure, fresh: true }); push(); json(res, 200, { ok: true }); return; }
      if (p === '/api/settings') {
        if (b.op === 'ai') settings.configure(b);
        if (b.op === 'voice') voice.configure(b);
        json(res, 200, { ok: true, ai: settings.publicView(), voiceCfg: voice.hostView() }); return;
      }
      if (p === '/api/models') {
        try { const models = await settings.lister().listModels(); json(res, 200, { ok: true, models, pick: pickDefaultModel(settings.publicView().provider, models) }); } catch (e) { json(res, 200, { ok: false, error: e.message }); }
        return;
      }
      if (p === '/api/test') { try { const t = await testConnection(settings.provider()); json(res, 200, { ok: true, works: t.ok, ms: t.ms, said: t.said }); } catch (e) { json(res, 200, { ok: false, error: e.message }); } return; }
      if (p === '/api/check') { try { const m = loadModule(MOD_DIR, b.id || url.searchParams.get('id')); json(res, 200, { ok: true, ...check(m) }); } catch (e) { json(res, 200, { ok: false, error: e.message }); } return; }
      if (p === '/api/convert') { try { json(res, 200, await runConvert(b)); } catch (e) { json(res, 200, { ok: false, error: e.message }); } return; }
      json(res, 404, { ok: false, error: 'No such address.' });
      return;
    }
    // ---- pages and files
    if (req.method !== 'GET') { res.writeHead(405); res.end(); return; }
    // The three documents, readable from any screen (they hold nothing secret).
    const doc = /^\/docs\/(MODULE-FORMAT|DESIGNER-PROMPT|CONVERTER-PROMPT|README)\.md$/.exec(p);
    if (doc) { const f = join(ROOT, `${doc[1]}.md`); if (existsSync(f)) { res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' }); res.end(readFileSync(f)); return; } }
    // The dice systems are shared with the screens (labels, odds, what to type).
    const eng = /^\/engine\/(dicesystems|dice|odds|seeds|scale)\.js$/.exec(p);
    if (eng) { res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-store' }); res.end(readFileSync(join(ROOT, 'engine', `${eng[1]}.js`))); return; }
    const file = ['/', '/host', '/table', '/play'].includes(p) ? join(PUB, 'index.html') : normalize(join(PUB, p));
    if (!file.startsWith(PUB) || !existsSync(file)) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(readFileSync(file));
  } catch (e) {
    json(res, 500, { ok: false, error: e.message });
  }
});

function addresses() {
  const out = [];
  for (const list of Object.values(networkInterfaces())) for (const n of list || []) if (n.family === 'IPv4' && !n.internal) out.push(n.address);
  return out;
}

server.listen(PORT, () => {
  const lan = addresses()[0] || 'this-computer';
  console.log(`\n  ${mod.module.name} on the Skeleton\n`);
  console.log(`  Host console:  http://localhost:${PORT}/host?key=${HOST_KEY}`);
  console.log(`  Table screen:  http://localhost:${PORT}/table`);
  console.log(`  Players:       http://${lan}:${PORT}/play`);
  console.log(`  Table code:    ${TABLE_CODE}   (asked of anyone joining from outside your network)\n`);
  if (process.argv.includes('--online')) startTunnel();
});

// --online: a temporary public address through the free cloudflared program (as the D&D Director does).
function startTunnel() {
  const line = `  ${'-'.repeat(60)}`;
  let child = null;
  try { child = spawn('cloudflared', ['tunnel', '--url', `http://localhost:${PORT}`], { stdio: ['ignore', 'pipe', 'pipe'] }); } catch (e) { child = null; }
  const missing = () => {
    console.log(line);
    console.log('  --online needs the free "cloudflared" program, and it was not found.');
    console.log('  Windows: open a Command Prompt and run   winget install --id Cloudflare.cloudflared');
    console.log('  then close this window and start again. Play on your own network still works meanwhile.');
    console.log(line);
  };
  if (!child) { missing(); return; }
  child.on('error', missing);
  const read = (buf) => {
    const m = String(buf).match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
    if (!m || publicUrl === m[0]) return;
    publicUrl = m[0];
    console.log(line);
    console.log('  From anywhere (the links change each time the host starts with --online):');
    console.log(`  Players:       ${publicUrl}/play?t=${TABLE_CODE}`);
    console.log(`  Table screen:  ${publicUrl}/table?t=${TABLE_CODE}`);
    console.log(`  Host console:  ${publicUrl}/host?key=${HOST_KEY}   (keep this one to yourself)`);
    console.log(line);
    // Every screen fetches its links again.
    for (const c of clients) { try { c.res.write('event: links\ndata: {}\n\n'); } catch (e) { clients.delete(c); } }
  };
  child.stdout.on('data', read);
  child.stderr.on('data', read);
  child.on('exit', () => { if (publicUrl) console.log('  The outside link has closed (cloudflared stopped).'); publicUrl = arg('public-url', ''); });
  const stop = () => { try { child.kill(); } catch (e) { /* gone */ } };
  process.on('exit', stop);
  process.on('SIGINT', () => process.exit(0));
  process.on('SIGTERM', () => process.exit(0));
}
