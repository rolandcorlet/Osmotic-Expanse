import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSlots } from '../slots.js';

// A stand-in for Supabase's REST interface: one table, upsert on id, select with filters.
function fakeSupabase({ key = 'sb_secret_good' } = {}) {
  const rows = new Map();
  const calls = [];
  const fetchImpl = async (url, opts = {}) => {
    calls.push({ url, opts });
    const reply = (status, body) => ({ ok: status < 300, status, text: async () => (body == null ? '' : JSON.stringify(body)) });
    if (opts.headers.apikey !== key) return reply(401, { message: 'Invalid API key' });
    const u = new URL(url);
    if (!u.pathname.endsWith('/rest/v1/oxd_saves')) return reply(404, { message: 'relation not found' });
    if (opts.method === 'POST') { const r = JSON.parse(opts.body); rows.set(r.id, r); return reply(201, null); }
    const id = (u.searchParams.get('id') || '').replace(/^eq\./, '');
    const list = [...rows.values()].filter((r) => !id || r.id === id);
    return reply(200, list);
  };
  return { rows, calls, fetchImpl };
}

let seq = 0;
const game = () => ({ seq: ++seq, gameId: 'g1', scenarioId: 'first-carve', scene: { siteId: 'toll-vent' }, players: { p1: { name: 'Roly' } } });
const make = (dir, sb) => createSlots({ dir, getState: game, describe: () => ({ vector: 'The First Carve', site: 'The Toll-Vent', players: 'Roly' }), chapters: () => [{ text: 'They came in at the lip.' }], fetchImpl: sb ? sb.fetchImpl : undefined });

test('save slots: save by name, the same name saves over it, read back, delete', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'oxs-'));
  const sl = make(dir);
  const a = await sl.save('Friday night');
  assert.equal(a.id, 'friday-night');
  assert.equal(a.copied, false, 'no backup set up: nothing copied');
  await sl.save('Friday night');
  await sl.save('Second game');
  const list = sl.list();
  assert.equal(list.length, 2);
  assert.deepEqual(list.map((x) => x.name).sort(), ['Friday night', 'Second game']);
  assert.equal(list[0].vector, 'The First Carve');
  assert.equal(list[0].state, undefined, 'the list does not carry whole games');
  const rec = sl.read('friday-night');
  assert.equal(rec.state.gameId, 'g1');
  assert.equal(rec.chapters[0].text, 'They came in at the lip.');
  assert.throws(() => sl.read('../session'), /not on this computer/);
  sl.remove('second-game');
  assert.equal(sl.list().length, 1);
  await sl.autosave();
  assert.ok(sl.list().some((x) => x.auto && x.id === 'autosave-g1'));
});

test('the backup copy: set up, test, every save copied, list and bring one back', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'oxs-'));
  const sb = fakeSupabase();
  const sl = make(dir, sb);
  assert.throws(() => sl.configure({ url: 'http://evil.example' }), /supabase\.co/);
  sl.configure({ url: 'https://abc.supabase.co/', key: 'sb_secret_wrong' });
  await assert.rejects(() => sl.test(), /secret key/);
  sl.configure({ key: 'sb_secret_good' });
  assert.ok(await sl.test());
  assert.equal(JSON.parse(readFileSync(join(dir, 'backup.json'), 'utf8')).key, 'sb_secret_good', 'the key is kept on this computer');
  const r = await sl.save('Friday night');
  assert.equal(r.copied, true);
  assert.equal(sb.rows.get('friday-night').data.state.gameId, 'g1');
  assert.ok(sl.list()[0].cloud, 'the slot is marked backed up');
  // Upserts, not duplicates.
  await sl.save('Friday night');
  assert.equal(sb.rows.size, 1);
  const post = sb.calls.find((c) => c.opts.method === 'POST');
  assert.match(post.url, /on_conflict=id/);
  assert.match(post.opts.headers.prefer, /merge-duplicates/);
  // Lost this computer: the copy comes back as a saved game.
  const dir2 = mkdtempSync(join(tmpdir(), 'oxs-'));
  const fresh = make(dir2, sb);
  fresh.configure({ url: 'https://abc.supabase.co', key: 'sb_secret_good' });
  const cl = await fresh.cloudList();
  assert.equal(cl[0].name, 'Friday night');
  const id = await fresh.restore('friday-night');
  assert.equal(fresh.read(id).state.gameId, 'g1');
  assert.equal(fresh.read(id).chapters.length, 1);
  assert.ok(existsSync(join(dir2, 'slots', 'friday-night.json')));
});

test('a new secret key goes on the apikey header only; an old JWT key also as a Bearer token', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'oxs-'));
  const sb = fakeSupabase();
  const sl = make(dir, sb);
  sl.configure({ url: 'https://abc.supabase.co', key: 'sb_secret_good' });
  await sl.test();
  assert.equal(sb.calls.at(-1).opts.headers.authorization, undefined);
  const sb2 = fakeSupabase({ key: 'eyJhbGciOi.legacy.jwt' });
  const sl2 = make(mkdtempSync(join(tmpdir(), 'oxs-')), sb2);
  sl2.configure({ url: 'https://abc.supabase.co', key: 'eyJhbGciOi.legacy.jwt' });
  await sl2.test();
  assert.equal(sb2.calls.at(-1).opts.headers.authorization, 'Bearer eyJhbGciOi.legacy.jwt');
});
