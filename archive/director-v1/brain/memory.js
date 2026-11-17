// The table's long memory: everything said and done in a game, kept on disk and searched,
// never sent whole. Each game has a folder, saves/games/<gameId>/:
//   transcript.jsonl  one line per thing said, narrated or recorded, in order; append-only
//   chronicle.json    a paragraph per site left and per night, newest last
// The cast (people, factions, places, threads) lives in the Ledger itself, so the Director's
// turns, Co-pilot and Undo treat it like everything else.

import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const STOP = new Set('a an and are as at be but by do does did for from had has have he her his i if in into is it its me my no not of on or our she so that the their them then there they this to was we were what when where which who why will with you your'.split(' '));

export function tokens(text) {
  return String(text || '').toLowerCase().replace(/[^a-z0-9' ]+/g, ' ').split(/\s+/)
    .map((w) => w.replace(/'s$|'/g, ''))
    .filter((w) => w.length > 1 && !STOP.has(w))
    .map(stem);
}
// Enough stemming that "drones" finds "drone" and "harvested" finds "harvest".
function stem(w) {
  if (/^\d/.test(w)) return w;
  if (w.length > 5 && w.endsWith('ing')) w = w.slice(0, -3);
  else if (w.length > 4 && w.endsWith('ied')) w = `${w.slice(0, -3)}y`;
  else if (w.length > 4 && w.endsWith('ed')) w = w.slice(0, -2);
  else if (w.length > 4 && w.endsWith('ies')) w = `${w.slice(0, -3)}y`;
  else if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) w = w.slice(0, -1);
  if (w.length > 4 && w.endsWith('e')) w = w.slice(0, -1); // "promise" and "promised" meet at "promis"
  return w;
}

// What a change to the Ledger adds to the transcript, and what an Undo takes back.
export function lineKeys(state) {
  const out = new Map();
  const site = (state.scene || {}).siteId;
  for (const e of state.story || []) {
    out.set(`s:${e.id}:${e.text}`, { t: e.t, seq: e.seq, site: e.site || site, who: e.who, kind: e.kind, text: e.text, seen: true });
  }
  for (const l of state.log || []) {
    // The Engine's record of what changed. Host-only notes stay host-only.
    out.set(`l:${l.seq}:${l.text}`, { t: l.t, seq: l.seq, site, who: 'Engine', kind: 'event', text: l.text, seen: l.kind !== 'note-host' });
  }
  for (const r of state.rolls || []) {
    if (r.kind === 'frequency') continue;
    // Rolls carry dice and Thresholds: kept for the host, never offered to answer a player.
    const res = r.at == null ? '' : r.success ? `, success, Overflow ${r.overflow}` : `, short by ${r.at - r.total}`;
    const text = `${r.who || 'A roll'}${r.label ? ` (${r.label})` : ''}: ${(r.dice || []).join(',')} = ${r.total}${r.at != null ? ` against ${r.at}` : ''}${res}`;
    out.set(`r:${r.id}:${r.seq}`, { t: r.t, seq: r.seq, site, who: r.who || 'roll', kind: 'roll', text, seen: false });
  }
  return out;
}

export function createMemory({ dir }) {
  const games = new Map(); // gameId -> { lines, dead:Set, chapters, df, n, len }

  const folder = (gameId) => join(dir, String(gameId).replace(/[^a-zA-Z0-9_-]/g, ''));
  const file = (gameId, name) => join(folder(gameId), name);

  function load(gameId) {
    if (games.has(gameId)) return games.get(gameId);
    const g = { lines: [], keys: new Set(), dead: new Set(), chapters: [], df: new Map(), totalLen: 0 };
    try {
      const f = file(gameId, 'transcript.jsonl');
      if (existsSync(f)) {
        for (const raw of readFileSync(f, 'utf8').split('\n')) {
          if (!raw.trim()) continue;
          let row; try { row = JSON.parse(raw); } catch (e) { continue; }
          if (row.retract) { g.dead.add(row.retract); continue; }
          index(g, row);
        }
      }
      const c = file(gameId, 'chronicle.json');
      if (existsSync(c)) g.chapters = JSON.parse(readFileSync(c, 'utf8')).chapters || [];
    } catch (e) { /* a damaged history is not a reason to stop the game */ }
    games.set(gameId, g);
    return g;
  }

  function index(g, row) {
    row.toks = tokens(`${row.who || ''} ${row.text}`);
    g.lines.push(row);
    g.keys.add(row.k);
    for (const w of new Set(row.toks)) g.df.set(w, (g.df.get(w) || 0) + 1);
    g.totalLen += row.toks.length;
  }

  function write(gameId, rows) {
    if (!rows.length) return;
    try {
      mkdirSync(folder(gameId), { recursive: true });
      appendFileSync(file(gameId, 'transcript.jsonl'), rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
    } catch (e) { console.log(`Could not write the game's history: ${e.message}`); }
  }

  return {
    // Called with the Ledger before and after every change. On an Undo, undoneAfter is the
    // seq the restored Ledger had: every line after it is taken back.
    observe(prev, next, { undoneAfter = null } = {}) {
      if (!next || !next.gameId) return;
      const g = load(next.gameId);
      const after = lineKeys(next);
      const rows = [];
      for (const [k, v] of after) {
        if (g.keys.has(k) && !g.dead.has(k)) continue;
        g.dead.delete(k);
        const row = { k, ...v };
        index(g, row);
        const { toks, ...out } = row;
        rows.push(out);
      }
      // An Undo in the same game takes lines back: they did not happen.
      if (undoneAfter != null && prev && prev.gameId === next.gameId) {
        const before = lineKeys(prev);
        for (const [k, v] of before) {
          if (!after.has(k) && (v.seq || 0) > undoneAfter && !g.dead.has(k)) {
            g.dead.add(k);
            rows.push({ retract: k });
          }
        }
      }
      write(next.gameId, rows);
    },

    // Keyword search over the transcript, the chronicle and (passed in) the cast.
    search(gameId, query, { forPlayers = false, cast = {}, limit = 8 } = {}) {
      const g = load(gameId);
      const q = [...new Set(tokens(query))];
      if (!q.length) return { hits: [], more: 0 };
      const docs = [];
      for (const r of g.lines) {
        if (g.dead.has(r.k)) continue;
        if (forPlayers && (!r.seen || r.kind === 'event' || r.kind === 'roll')) continue;
        docs.push({ from: 'said', when: r.t, site: r.site, who: r.who, kind: r.kind, text: r.text, toks: r.toks, seen: r.seen });
      }
      for (const ch of g.chapters) docs.push({ from: 'chronicle', when: ch.t, site: ch.siteId, who: 'Chronicle', kind: 'chapter', text: ch.text, toks: tokens(ch.text), seen: true });
      for (const c of Object.values(cast || {})) {
        const facts = c.facts.filter((f) => !forPlayers || f.seen).map((f) => f.text);
        if (forPlayers && !facts.length) continue;
        const text = `${c.name} (${c.kind}): ${facts.join('; ')}`;
        docs.push({ from: 'cast', site: c.siteId, who: c.name, kind: c.kind, text, toks: tokens(`${c.name} ${c.name} ${facts.join(' ')}`), seen: true, origin: c.origin });
      }
      const N = docs.length || 1;
      const avg = docs.reduce((a, d) => a + d.toks.length, 0) / N || 1;
      const df = new Map();
      for (const d of docs) for (const w of new Set(d.toks)) df.set(w, (df.get(w) || 0) + 1);
      const k1 = 1.4, b = 0.75;
      const scored = [];
      docs.forEach((d, i) => {
        const tf = new Map();
        for (const w of d.toks) tf.set(w, (tf.get(w) || 0) + 1);
        let s = 0;
        for (const w of q) {
          const f = tf.get(w);
          if (!f) continue;
          const n = df.get(w) || 0;
          const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
          s += idf * (f * (k1 + 1)) / (f + k1 * (1 - b + b * d.toks.length / avg));
        }
        if (!s) return;
        if (d.from === 'cast') s *= 1.3;          // a card is a settled fact
        if (d.kind === 'narration' || d.kind === 'say') s *= 1.1;
        s += i / N * 0.05;                          // ties go to the more recent
        scored.push({ d, s });
      });
      scored.sort((a, b2) => b2.s - a.s);
      const hits = scored.slice(0, limit).map(({ d }) => ({
        from: d.from, site: d.site, who: d.who, kind: d.kind, seen: d.seen, origin: d.origin,
        when: d.when ? new Date(d.when).toISOString().slice(0, 10) : undefined,
        text: d.text.length > 320 ? `${d.text.slice(0, 317)}...` : d.text,
      }));
      return { hits, more: Math.max(0, scored.length - hits.length) };
    },

    // What the table was told since the last chapter: the material for the next one.
    linesSince(gameId, seq) {
      const g = load(gameId);
      return g.lines.filter((r) => !g.dead.has(r.k) && r.seen && (r.seq || 0) > seq && (r.kind === 'say' || r.kind === 'narration' || r.kind === 'event'));
    },

    chapters(gameId) { return load(gameId).chapters; },

    addChapter(gameId, ch) {
      const g = load(gameId);
      const id = `c${Date.now().toString(36)}${g.chapters.length}`;
      g.chapters.push({ id, ...ch });
      saveChapters(gameId, g);
      return id;
    },

    dropChapter(gameId, id) {
      const g = load(gameId);
      const before = g.chapters.length;
      g.chapters = g.chapters.filter((c) => c.id !== id);
      if (g.chapters.length !== before) saveChapters(gameId, g);
    },

    // How much is kept, for the host console.
    size(gameId) {
      const g = load(gameId);
      return { lines: g.lines.filter((r) => !g.dead.has(r.k)).length, chapters: g.chapters.length };
    },
  };

  function saveChapters(gameId, g) {
    try {
      mkdirSync(folder(gameId), { recursive: true });
      const f = file(gameId, 'chronicle.json');
      writeFileSync(`${f}.tmp`, JSON.stringify({ chapters: g.chapters }, null, 1));
      renameSync(`${f}.tmp`, f);
    } catch (e) { console.log(`Could not save the chronicle: ${e.message}`); }
  }
}
