// Saved games for the Skeleton (copied from the D&D Director's slots.js, 27 Nov 2026, unchanged below this line): named save slots on the host computer, an autosave while play goes
// on, and an optional backup copy in Supabase.
//
// The plan from the handoff: the rules and the Vectors stay in GitHub; saves live on this computer
// first; Supabase holds a copy. The copy goes to one table, public.oxd_saves, with Row Level Security
// on and no policies, so only the project's secret key can read or write it. That key is typed into
// the host console once and kept in saves/backup.json, which git never sees.

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, unlinkSync, renameSync } from 'node:fs';
import { join } from 'node:path';

const slug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'game';

export function createSlots({ dir, getState, describe, chapters = () => [], prefix = '', fetchImpl = globalThis.fetch }) {
  const slotDir = join(dir, 'slots');
  const cfgFile = join(dir, 'backup.json');
  let cfg = { url: '', key: '' };
  try { if (existsSync(cfgFile)) cfg = { ...cfg, ...JSON.parse(readFileSync(cfgFile, 'utf8')) }; } catch (e) { /* start without a backup */ }
  const cloud = { status: '', at: null, error: '' };

  const write = (file, obj) => {
    mkdirSync(slotDir, { recursive: true });
    const tmp = `${file}.tmp`;
    writeFileSync(tmp, JSON.stringify(obj));
    renameSync(tmp, file);
  };
  const header = (r) => ({ id: r.id, name: r.name, savedAt: r.savedAt, vector: r.vector, site: r.site, players: r.players, gameId: r.gameId, auto: !!r.auto, cloud: r.cloud || '' });
  function record(id, name, auto = false) {
    const state = getState();
    const d = describe(state);
    return { id, name, savedAt: new Date().toISOString(), vector: d.vector, site: d.site, players: d.players, gameId: state.gameId || '', auto, chapters: chapters(state.gameId), state };
  }

  // ---- the backup copy
  const configured = () => !!(cfg.url && cfg.key);
  const base = () => cfg.url.replace(/\/+$/, '');
  // New secret keys (sb_secret_…) go on the apikey header only: they are not JWTs, and Supabase rejects
  // them as a Bearer token. An older service_role key is a JWT and is sent both ways, as it expects.
  const heads = (extra = {}) => ({ apikey: cfg.key, ...(/^eyJ/.test(cfg.key) ? { authorization: `Bearer ${cfg.key}` } : {}), 'content-type': 'application/json', ...extra });
  async function call(path, opts = {}) {
    let res;
    try {
      res = await fetchImpl(`${base()}/rest/v1/${path}`, { ...opts, headers: heads(opts.headers) });
    } catch (e) {
      const why = (e.cause && (e.cause.code || e.cause.message)) || e.message;
      throw new Error(`Could not reach Supabase (${why}). Check this computer is online, the address is right, and the project is not paused in the Supabase dashboard (the free plan pauses after 7 days unused).`);
    }
    const text = await res.text();
    if (!res.ok) {
      let why = text.slice(0, 200);
      try { const j = JSON.parse(text); why = j.message || j.hint || j.error || why; } catch (e) { /* plain text */ }
      if (res.status === 401 || res.status === 403) why = 'The key was refused. Paste the secret key (Project Settings, API Keys), not the publishable one.';
      if (res.status === 404 || /oxd_saves/.test(why)) why = `The table public.oxd_saves is not there yet. ${why}`;
      throw new Error(why);
    }
    return text ? JSON.parse(text) : null;
  }
  async function push(r) {
    if (!configured()) return false;
    try {
      await call('oxd_saves?on_conflict=id', {
        method: 'POST',
        headers: { prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({ id: r.id, name: r.name, saved_at: r.savedAt, vector: r.vector, site: r.site, players: r.players, game_id: r.gameId, data: { auto: r.auto, chapters: r.chapters, state: r.state } }),
      });
      cloud.status = 'ok'; cloud.at = new Date().toISOString(); cloud.error = '';
      return true;
    } catch (e) {
      cloud.status = 'error'; cloud.error = e.message;
      return false;
    }
  }

  const api = {
    list() {
      if (!existsSync(slotDir)) return [];
      const out = [];
      for (const f of readdirSync(slotDir)) {
        if (!f.endsWith('.json')) continue;
        try { out.push(header(JSON.parse(readFileSync(join(slotDir, f), 'utf8')))); } catch (e) { /* a damaged slot is skipped */ }
      }
      return out.sort((a, b) => String(b.savedAt).localeCompare(String(a.savedAt)));
    },
    // Save the game as it is now. The same name saves over the same slot.
    async save(name) {
      const nm = String(name || '').trim().slice(0, 60) || 'Saved game';
      const id = `${prefix}${slug(nm)}`;
      const r = record(id, nm);
      write(join(slotDir, `${id}.json`), r);
      const copied = await push(r);
      if (copied) { r.cloud = cloud.at; write(join(slotDir, `${id}.json`), r); }
      return { id, copied };
    },
    // One autosave per game, kept up to date while play goes on.
    async autosave() {
      const state = getState();
      if (!state || !state.gameId) return;
      const id = `${prefix}autosave-${slug(state.gameId)}`;
      const r = record(id, `Autosave: ${describe(state).vector}`, true);
      write(join(slotDir, `${id}.json`), r);
      if (await push(r)) { r.cloud = cloud.at; write(join(slotDir, `${id}.json`), r); }
    },
    read(id) {
      const f = join(slotDir, `${slug(id)}.json`);
      if (!/^[a-z0-9-]+$/.test(String(id)) || !existsSync(f)) throw new Error('That saved game is not on this computer.');
      return JSON.parse(readFileSync(f, 'utf8'));
    },
    remove(id) {
      const f = join(slotDir, `${slug(id)}.json`);
      if (/^[a-z0-9-]+$/.test(String(id)) && existsSync(f)) unlinkSync(f);
    },
    cloudView() {
      return { configured: configured(), url: cfg.url, keySet: !!cfg.key, ...cloud };
    },
    configure({ url, key }) {
      if (typeof url === 'string') {
        const u = url.trim().replace(/\/+$/, '');
        if (u && !/^https:\/\/[a-z0-9-]+\.supabase\.(co|in)$/i.test(u)) throw new Error('The address looks like https://your-project.supabase.co');
        cfg.url = u;
      }
      if (typeof key === 'string' && key.trim()) cfg.key = key.trim();
      if (key === '') cfg.key = '';
      mkdirSync(dir, { recursive: true });
      writeFileSync(cfgFile, JSON.stringify(cfg));
      cloud.status = ''; cloud.error = '';
    },
    async test() {
      if (!configured()) throw new Error('Enter the project address and the secret key first.');
      await call('oxd_saves?select=id&limit=1');
      cloud.status = 'ok'; cloud.error = ''; cloud.at = cloud.at || null;
      return true;
    },
    // Copy every saved game on this computer to the backup.
    async pushAll() {
      let n = 0;
      for (const h of api.list()) {
        const r = api.read(h.id);
        if (await push(r)) { r.cloud = cloud.at; write(join(slotDir, `${h.id}.json`), r); n += 1; } else break;
      }
      return n;
    },
    async cloudList() {
      if (!configured()) return [];
      const rows = await call(`oxd_saves?select=id,name,saved_at,vector,site,players${prefix ? `&id=like.${encodeURIComponent(prefix)}*` : ''}&order=saved_at.desc&limit=100`);
      return rows.map((x) => ({ id: x.id, name: x.name, savedAt: x.saved_at, vector: x.vector, site: x.site, players: x.players }));
    },
    // Bring a backup copy down onto this computer as a save slot.
    async restore(id) {
      const rows = await call(`oxd_saves?select=*&id=eq.${encodeURIComponent(id)}`);
      const x = rows && rows[0];
      if (!x) throw new Error('That backup is not in Supabase.');
      const r = { id: slug(x.id), name: x.name, savedAt: x.saved_at, vector: x.vector, site: x.site, players: x.players, gameId: x.game_id, auto: !!(x.data || {}).auto, chapters: (x.data || {}).chapters || [], state: (x.data || {}).state, cloud: x.saved_at };
      if (!r.state) throw new Error('That backup has no game in it.');
      write(join(slotDir, `${r.id}.json`), r);
      return r.id;
    },
  };
  return api;
}
