// The Director host, prototype. Run it on one computer; every phone, tablet and
// laptop on the same network opens the address it prints.
//
//   node server.js              start, or carry on the saved session
//   node server.js --new        start a fresh session
//   node server.js --port 9000  use another port
//   node server.js --online     also open a link for players outside your network
//                               (needs the free cloudflared program)
//   node server.js --public-url https://example  show this address as the outside link
//                               (for your own port forward or tunnel)
//
// No installs: this file uses only what ships with Node 18 or later.

import http from 'node:http';
import os from 'node:os';
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';

import { newSession, apply, viewFor, RuleError } from './engine/ledger.js';
import { systemRng } from './engine/dice.js';
import { scenario, publicScenario } from './data/first-carve.js';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const opt = (name, dflt) => { const i = args.indexOf(name); return i >= 0 && args[i + 1] ? args[i + 1] : dflt; };

const PORT = Number(opt('--port', process.env.PORT || 8787));
const SAVE_DIR = opt('--saves', join(here, 'saves'));
const SAVE = join(SAVE_DIR, 'session.json');
const bestiary = JSON.parse(readFileSync(join(here, 'data', 'bestiary.json'), 'utf8'));
const rng = systemRng();

// ---------------------------------------------------------------- the session
let hostKey = opt('--host-key', '');
let tableCode = opt('--table-code', '').toUpperCase(); // asked of anyone joining from outside the home network
let publicUrl = opt('--public-url', '').replace(/\/+$/, '');
let state = null;
const history = []; // earlier Ledgers, for the host's Undo

function load() {
  if (!flag('--new') && existsSync(SAVE)) {
    try {
      const saved = JSON.parse(readFileSync(SAVE, 'utf8'));
      if (saved.state && saved.state.scenarioId === scenario.id) {
        state = saved.state;
        hostKey = hostKey || saved.hostKey || '';
        tableCode = tableCode || saved.tableCode || '';
      }
    } catch (e) {
      console.log('The saved session could not be read; starting a new one.');
    }
  }
  if (!state) state = newSession(scenario);
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

function send(screen) {
  const view = viewFor(state, screen.role, screen.pid);
  screen.res.write(`event: state\ndata: ${JSON.stringify(view)}\n\n`);
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
  '/engine/odds.js': ['engine/odds.js', 'text/javascript'],
};
const PAGES = new Set(['/', '/table', '/play', '/host']);

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

function act(role, pid, action) {
  if (action.type === 'undo') {
    if (role !== 'host') throw new RuleError('Only the host can undo.');
    if (!history.length) throw new RuleError('Nothing to undo.');
    const seq = state.seq;
    state = history.pop();
    state.seq = seq + 1; // screens must see a newer Ledger, never an older one
    return;
  }
  if (action.type === 'session.new') {
    if (role !== 'host') throw new RuleError('Only the host can start a new session.');
    history.push(state);
    const seq = state.seq;
    state = newSession(scenario);
    state.seq = seq + 1;
    return;
  }
  const next = apply(state, action, { role, pid, rng, now: Date.now(), scenario, bestiary });
  history.push(state);
  if (history.length > 60) history.shift();
  state = next;
}

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
    if (req.method === 'GET' && FILES[url.pathname]) {
      const [file, type] = FILES[url.pathname];
      res.writeHead(200, { 'content-type': `${type}; charset=utf-8`, 'cache-control': 'no-store' });
      res.end(readFileSync(join(here, file)));
      return;
    }
    if (req.method === 'GET' && url.pathname === '/api/info') {
      const out = { title: scenario.title, port: PORT, addresses: addresses() };
      const trusted = isLocal(req) || codeOk(q) || (q.key && String(q.key).toUpperCase() === hostKey);
      if (trusted && publicUrl) out.online = `${publicUrl}/play?t=${tableCode}`;
      json(res, 200, out);
      return;
    }
    if (req.method === 'GET' && url.pathname === '/api/scenario') {
      const who = access(req, q);
      if (!who.role) { json(res, 403, who); return; }
      const role = who.role;
      if (role === 'host') {
        const blocks = Object.values(bestiary).map((b) => ({
          id: b.id, name: b.name, order: b.order, cls: b.cls, tier: b.tier, statLine: b.statLine, traits: b.traits,
          special: b.special, weakness: b.weakness, harvest: b.harvest, tactics: b.tactics, segments: b.segments,
        }));
        json(res, 200, { ...scenario, bestiary: blocks });
      } else {
        json(res, 200, publicScenario());
      }
      return;
    }
    if (req.method === 'GET' && url.pathname === '/api/events') {
      const who = access(req, q);
      if (!who.role) { json(res, 403, who); return; }
      const role = who.role;
      res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store', connection: 'keep-alive', 'x-accel-buffering': 'no' });
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
      json(res, 200, { ok: true, seq: state.seq });
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
      console.log(' The link changes each time the host is started with --online.');
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
server.listen(PORT, '0.0.0.0', () => {
  const ips = addresses();
  const line = '-'.repeat(62);
  console.log(line);
  console.log(' The Osmotic Expanse - Director host (prototype)');
  console.log(` Vector: ${scenario.title}`);
  console.log(line);
  console.log(' On this computer:');
  console.log(`   Host console   http://localhost:${PORT}/host?key=${hostKey}`);
  console.log(`   Table screen   http://localhost:${PORT}/table`);
  if (ips.length) {
    console.log(' For players, on the same Wi-Fi or network:');
    for (const ip of ips) console.log(`   Join           http://${ip}:${PORT}/play`);
  } else {
    console.log(' No network address found: other devices cannot join yet.');
  }
  if (publicUrl) console.log(` Outside link:    ${publicUrl}/play?t=${tableCode}`);
  console.log(` Host key: ${hostKey}   (keep it to yourself)`);
  console.log(` Table code: ${tableCode}   (asked of anyone joining from outside your network)`);
  console.log(' Close this window, or press Ctrl+C, to stop. The session is saved.');
  console.log(line);
  if (flag('--online')) startTunnel();
});
