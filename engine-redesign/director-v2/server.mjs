// Director v2: the table server. One Node process, no dependencies.
//   node server.mjs                                  Engine-only (no model), port 8790
//   node server.mjs --provider custom --url http://localhost:8080/v1 --model qwen --thinking off
//   node server.mjs --port 8790 --narrate beats      model speaks at key moments only
// Players open http://<address>:8790 and type the table code. The host opens the host link printed below.
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadData, applyOverlay, validate } from './src/engine.mjs';
import { Table, TableError } from './src/table.mjs';
import { build, PROVIDERS, providerInfo, ProviderError } from './src/providers.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const opt = (name, dflt) => { const i = argv.indexOf(name); return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : dflt; };
const flag = (name) => argv.includes(name);

const SAVES = path.resolve(opt('--saves', path.join(here, 'saves')));
fs.mkdirSync(SAVES, { recursive: true });
const cfgFile = path.join(SAVES, 'config.json');
let cfg = {};
try { cfg = JSON.parse(fs.readFileSync(cfgFile, 'utf8')); } catch (e) { /* first run */ }
const saveCfg = () => { fs.mkdirSync(path.dirname(cfgFile), { recursive: true }); fs.writeFileSync(cfgFile, JSON.stringify(cfg, null, 1)); };
cfg.provider = opt('--provider', cfg.provider || 'none');
cfg.model = opt('--model', cfg.model || '');
cfg.url = opt('--url', cfg.url || '');
cfg.thinking = opt('--thinking', cfg.thinking || 'off');
cfg.keys = cfg.keys || {};
const PORT = Number(opt('--port', process.env.PORT || cfg.port || 8790));
const HOST_ANYWHERE = flag('--host-anywhere'); // by default the host console only answers on this network

const makeProvider = () => build({ provider: cfg.provider, model: cfg.model, url: cfg.url, thinking: cfg.thinking, apiKey: cfg.keys[cfg.provider] || '' });

const D = applyOverlay(loadData());
const check = validate(D);
if (check.errors.length) { console.error('The books do not check:', check.errors.slice(0, 5)); process.exit(1); }
let provider = null; let providerNote = '';
try { provider = makeProvider(); } catch (e) { providerNote = e.message; provider = build({ provider: 'none' }); }
const table = new Table({ D, provider, narrate: opt('--narrate', cfg.narrate || 'all'), file: flag('--fresh') ? null : path.join(SAVES, 'table.json') });
if (flag('--fresh')) table.file = path.join(SAVES, 'table.json');

// ---- small helpers -------------------------------------------------------------
const PAGE = () => fs.readFileSync(path.join(here, 'public', 'index.html'));
const SEC = { 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer', 'x-frame-options': 'DENY', 'cache-control': 'no-store',
  'content-security-policy': "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'" };
const send = (res, status, body, type = 'application/json') => { res.writeHead(status, { 'content-type': `${type}; charset=utf-8`, ...SEC }); res.end(type === 'application/json' ? JSON.stringify(body) : body); };
const ipOf = (req) => String(req.socket.remoteAddress || '').replace(/^::ffff:/, '');
const isPrivate = (ip) => ip === '127.0.0.1' || ip === '::1' || /^10\./.test(ip) || /^192\.168\./.test(ip) || /^172\.(1[6-9]|2\d|3[01])\./.test(ip) || /^f[cd]/i.test(ip) || /^fe80/i.test(ip);
const tokenOf = (req, url) => { const h = String(req.headers.authorization || ''); return h.startsWith('Bearer ') ? h.slice(7) : url.searchParams.get('token') || ''; };
function readBody(req) {
  return new Promise((resolve, reject) => {
    let n = 0; const parts = [];
    req.on('data', (c) => { n += c.length; if (n > 16384) { reject(new TableError('Too much.', 413)); if (n > 1048576) req.destroy(); } else parts.push(c); });
    req.on('end', () => { try { resolve(parts.length ? JSON.parse(Buffer.concat(parts).toString('utf8')) : {}); } catch (e) { reject(new TableError('Not JSON.')); } });
    req.on('error', reject);
  });
}
// Rate limits: guessing the table code, and how fast one screen may act.
const tries = new Map(); // ip -> [times of wrong codes]
const lastAct = new Map(); // token -> time
const tooMany = (ip) => { const now = Date.now(); const a = (tries.get(ip) || []).filter((t) => now - t < 600000); tries.set(ip, a); return a.length >= 8; };
const pace = (tok, ms) => { const now = Date.now(); if (now - (lastAct.get(tok) || 0) < ms) throw new TableError('Slow down a little.', 429); lastAct.set(tok, now); };
setInterval(() => { const now = Date.now(); for (const [k, a] of tries) if (!a.some((t) => now - t < 600000)) tries.delete(k); }, 600000).unref();

export function addresses() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) for (const a of list || []) if (a.family === 'IPv4' && !a.internal) out.push(a.address);
  return out;
}

const streams = new Set();
table.on('change', (v) => { for (const res of streams) res.write(`data: ${v}\n\n`); });
setInterval(() => { for (const res of streams) res.write(': keep\n\n'); }, 20000).unref();

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname; const ip = ipOf(req);
  try {
    if (req.method === 'GET' && (p === '/' || p === '/host')) return send(res, 200, PAGE(), 'text/html');
    if (req.method === 'GET' && p === '/api/hello') return send(res, 200, { title: D.vector.title, premise: D.vector.premise });
    const tok = tokenOf(req, url);
    const host = table.isHost(tok);
    if (host && !HOST_ANYWHERE && !isPrivate(ip)) throw new TableError('The host console only answers on the home network.', 403);

    if (req.method === 'POST' && p === '/api/join') {
      if (tooMany(ip)) throw new TableError('Too many wrong codes. Wait ten minutes.', 429);
      const b = await readBody(req);
      try { return send(res, 200, { token: table.join(b.code, b.name) }); } catch (e) { if (e.status === 403) tries.get(ip).push(Date.now()); throw e; }
    }
    if (!host && !table.seat(tok)) throw new TableError('Join the table first.', 401);

    if (req.method === 'GET' && p === '/api/state') return send(res, 200, table.view(tok));
    if (req.method === 'GET' && p === '/api/events') {
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive', 'x-accel-buffering': 'no' });
      res.write(`data: ${table.version}\n\n`);
      streams.add(res); req.on('close', () => streams.delete(res));
      return;
    }
    if (req.method !== 'POST') throw new TableError('Not found.', 404);
    const b = await readBody(req);
    if (p === '/api/claim') { table.claim(tok, String(b.org), b.called); return send(res, 200, { ok: true }); }
    if (p === '/api/release') { table.release(tok, String(b.org)); return send(res, 200, { ok: true }); }
    if (p === '/api/move') { pace(tok, 250); await table.move(tok, String(b.id)); return send(res, 200, { ok: true }); }
    if (p === '/api/say') { pace(tok, 1500); await table.say(tok, b.text); return send(res, 200, { ok: true }); }
    if (p === '/api/host') {
      if (!host) throw new TableError('Host only.', 403);
      if (b.action === 'info') return send(res, 200, { port: PORT, addresses: addresses(), providers: PROVIDERS.map((x) => ({ id: x.id, name: x.name, url: !!x.url, key: !!x.key, base: x.base || '' })),
        config: { provider: cfg.provider, model: cfg.model, url: cfg.url, thinking: cfg.thinking, hasKey: !!(cfg.keys[cfg.provider] || (providerInfo(cfg.provider).env && process.env[providerInfo(cfg.provider).env])) }, note: providerNote });
      if (b.action === 'config') {
        const next = { ...cfg, provider: String(b.provider || 'none'), model: clip(b.model), url: clip(b.url), thinking: ['off', 'low', 'medium', 'default'].includes(b.thinking) ? b.thinking : 'off', keys: { ...cfg.keys } };
        if (!PROVIDERS.some((x) => x.id === next.provider)) throw new TableError('Unknown provider.');
        if (b.apiKey) next.keys[next.provider] = clip(b.apiKey, 300);
        const before = cfg; cfg = next;
        try { provider = makeProvider(); providerNote = ''; } catch (e) { cfg = before; throw new TableError(e.message); }
        saveCfg();
        await table.hostDo(tok, 'provider', { provider });
        return send(res, 200, { ok: true });
      }
      if (b.action === 'narrate') { cfg.narrate = b.mode; saveCfg(); }
      await table.hostDo(tok, String(b.action), b);
      return send(res, 200, { ok: true });
    }
    throw new TableError('Not found.', 404);
  } catch (e) {
    const status = e instanceof TableError ? e.status : e instanceof ProviderError ? 400 : 500;
    if (status === 500) console.error(e);
    if (!res.headersSent) send(res, status, { error: status === 500 ? 'Something went wrong on the server.' : e.message });
  }
});
const clip = (v, n = 200) => String(v || '').trim().slice(0, n);

export { server, table, PORT };

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  server.listen(PORT, '0.0.0.0', () => {
    const lan = addresses();
    const line = '-'.repeat(64);
    console.log(`${line}\n The Osmotic Expanse - Director v2 - ${D.vector.title}\n${line}`);
    console.log(` Host console (keep this link to yourself):\n   http://localhost:${PORT}/host?key=${table.hostKey}`);
    console.log(`\n Table code for players:  ${table.code}`);
    console.log(`\n Players on your home network open:`);
    for (const a of lan) console.log(`   http://${a}:${PORT}`);
    console.log(`\n Players over the internet open:  http://<your public IP>:${PORT}`);
    console.log(`   Router (http://192.168.0.1): forward TCP port ${PORT} to ${lan[0] || '<this PC>'} port ${PORT}.`);
    console.log(`   Full steps: INTERNET.md`);
    console.log(`\n Director voice: ${provider.id === 'none' ? `none (Engine lines only)${providerNote ? ` - ${providerNote}` : ''}` : `${provider.id} · ${provider.model}`}; narrating: ${table.narrate}\n${line}`);
  });
}
