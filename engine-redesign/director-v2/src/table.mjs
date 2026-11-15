// The table: one game, the seats around it, and the story everyone reads. Every change goes through
// here, one at a time, so two players pressing at once can never interleave.
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import { newGame, legalMoves, play, orgs, site, creaturesHere, creatureLook, miWord, stressWord, clockWord, phaseOf, currentActor } from './engine.mjs';
import { speak, isBeat, question } from './brain.mjs';

const token = (n = 24) => randomBytes(n).toString('base64url');
// A join code people can read out over voice chat: no 0/O, 1/I/L.
const code = () => Array.from(randomBytes(6), (b) => 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'[b % 31]).join('');
const same = (a, b) => { const x = Buffer.from(String(a)); const y = Buffer.from(String(b)); return x.length === y.length && timingSafeEqual(x, y); };
const first = (name) => (/^the\s/i.test(String(name)) ? String(name) : String(name).split(/\s+/)[0]);
const clean = (t, n) => String(t || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);

export class TableError extends Error { constructor(msg, status = 400) { super(msg); this.status = status; } }

export class Table extends EventEmitter {
  constructor({ D, provider = null, narrate = 'all', seed = null, file = null } = {}) {
    super();
    this.D = D; this.provider = provider; this.narrate = narrate; this.file = file;
    this.hostKey = token(18); this.code = code();
    this.seats = {}; // token -> { id, name, orgIds: [], seen }
    this.story = []; this.version = 0; this.busy = null; this.undo = [];
    this.stats = { calls: 0, ms: 0, in: 0, out: 0, fallbacks: 0, last: null, error: null };
    this.queue = Promise.resolve();
    this.g = newGame(D, { seed: seed ?? (randomBytes(4).readUInt32LE() || 1) });
    if (file && fs.existsSync(file)) this.load();
  }

  // ---- saving -------------------------------------------------------------------
  save() {
    if (!this.file) return;
    const out = { s: this.g.s, seats: this.seats, story: this.story.slice(-400), code: this.code, hostKey: this.hostKey, narrate: this.narrate };
    fs.writeFileSync(`${this.file}.tmp`, JSON.stringify(out));
    fs.renameSync(`${this.file}.tmp`, this.file);
  }
  load() {
    try {
      const j = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      this.g = { D: this.D, s: j.s }; this.seats = j.seats || {}; this.story = j.story || [];
      this.code = j.code || this.code; this.hostKey = j.hostKey || this.hostKey; this.narrate = j.narrate || this.narrate;
    } catch (e) { /* a broken save starts a fresh table */ }
  }
  touch() { this.version += 1; this.save(); this.emit('change', this.version); }
  add(kind, who, text) { if (text) this.story.push({ n: this.story.length + 1, kind, who, text, at: Date.now() }); }
  run(fn) { const p = this.queue.then(fn); this.queue = p.catch(() => {}); return p; }

  // ---- who is who ---------------------------------------------------------------
  isHost(tok) { return !!tok && same(tok, this.hostKey); }
  seat(tok) { const s = tok && Object.prototype.hasOwnProperty.call(this.seats, tok) ? this.seats[tok] : null; if (s) s.seen = Date.now(); return s; }
  owner(orgId) { return Object.values(this.seats).find((s) => s.orgIds.includes(orgId)) || null; }
  join(tryCode, name) {
    if (!same(String(tryCode || '').toUpperCase().trim(), this.code)) throw new TableError('That table code is not right.', 403);
    if (Object.keys(this.seats).length >= 12) throw new TableError('The table is full.', 403);
    const nm = clean(name, 24) || 'Player';
    const tok = token();
    this.seats[tok] = { id: token(6), name: nm, orgIds: [], seen: Date.now() };
    this.add('engine', null, `${nm} sits down at the table.`);
    this.touch();
    return tok;
  }
  claim(tok, orgId, called = '') {
    const s = this.seat(tok); if (!s) throw new TableError('Join the table first.', 401);
    if (!this.g.s.orgs[orgId]) throw new TableError('No such organism.');
    const o = this.owner(orgId);
    if (o && o !== s) throw new TableError(`${o.name} is already playing ${this.g.s.orgs[orgId].name}.`);
    if (!o) {
      // A player may give their organism its own name; the Engine uses it in every line from then on.
      const nm = clean(called, 28).replace(/[^\p{L}\p{N} '\-]/gu, '');
      const org = this.g.s.orgs[orgId];
      if (nm && !Object.values(this.g.s.orgs).some((x) => x !== org && x.name.toLowerCase() === nm.toLowerCase())) org.name = nm;
      s.orgIds.push(orgId); this.add('engine', null, `${s.name} takes ${org.name}${org.name !== this.D.hands[orgId].hand ? ` (${this.D.hands[orgId].hand})` : ''}.`); this.touch();
    }
  }
  release(tok, orgId) { const s = this.seat(tok); if (!s) return; s.orgIds = s.orgIds.filter((x) => x !== orgId); this.touch(); }

  // ---- what a screen is shown ---------------------------------------------------
  // Players get their own numbers and the Cohort's; creatures only ever in words.
  movesFor(tok) {
    const host = this.isHost(tok); const s = this.seat(tok);
    const mine = s ? s.orgIds : [];
    // An organism nobody has taken is an open seat: anyone at the table may play it, so a short table never stalls.
    return legalMoves(this.g).filter((m) => host || (m.who ? (mine.includes(m.who) || (!!s && !this.owner(m.who))) : !!s));
  }
  view(tok) {
    const g = this.g; const s = g.s; const host = this.isHost(tok); const me = this.seat(tok);
    const sit = s.scene.siteId ? site(g) : null;
    const act = s.fight ? currentActor(g) : null;
    const turnOrg = act && act.startsWith('org:') ? s.orgs[act.slice(4)] : null;
    return {
      version: this.version, title: g.D.vector.title, premise: g.D.vector.premise, phase: phaseOf(g), ended: s.ended,
      site: sit ? { id: sit.id, name: sit.name } : null,
      clocks: Object.keys(s.clocks).map((id) => ({ id, n: s.clocks[id].n, max: s.clocks[id].max, word: clockWord(g, id) })),
      cohort: orgs(g).map((o) => ({ id: o.id, name: o.name, phenotype: o.phenotype, state: o.state, body: miWord(null, o.mi, o.miMax), nerve: stressWord(o.stress),
        mi: o.mi, miMax: o.miMax, stress: o.stress, pp: o.pp, ppMax: o.ppMax, atp: o.atp, atpMax: o.atpMax, countdown: o.countdown, countdownMax: o.countdownMax,
        substrate: o.substrate, codon: o.codon, spec: o.spec, weapon: o.weapon.name, conditions: o.conditions.map((c) => c.id || c.name || c), reserve: !!o.reserve,
        player: (this.owner(o.id) || {}).name || null, mine: !!me && me.orgIds.includes(o.id), onTurn: !!turnOrg && turnOrg.id === o.id })),
      creatures: creaturesHere(g).filter((c) => c.stoodDown !== 'left' && c.stoodDown !== 'left-behind').map((c) => ({ id: c.cid, name: c.name, look: creatureLook(c), band: c.band,
        state: c.down ? 'destroyed' : c.stoodDown ? 'standing aside' : c.stance, cut: !!c.harvested })),
      turn: turnOrg ? { org: turnOrg.id, name: turnOrg.name, player: (this.owner(turnOrg.id) || {}).name || null, open: !this.owner(turnOrg.id) } : null,
      moves: this.movesFor(tok).map((m) => ({ id: m.id, who: m.who, kind: m.kind, label: m.label, cost: m.cost || '', whoName: m.who ? first(s.orgs[m.who].name) : '' })),
      story: this.story.slice(-80), busy: this.busy,
      me: me ? { name: me.name, orgIds: me.orgIds } : null, host,
      seats: Object.values(this.seats).map((x) => ({ id: x.id, name: x.name, orgs: x.orgIds.map((id) => first(s.orgs[id].name)), here: Date.now() - x.seen < 20000 })),
      ...(host ? { hostInfo: { code: this.code, narrate: this.narrate, model: this.provider ? `${this.provider.id}${this.provider.model ? ` · ${this.provider.model}` : ''}` : 'none', stats: this.stats, canUndo: this.undo.length } } : {}),
    };
  }

  // ---- playing ------------------------------------------------------------------
  rollLine(o, m, r) {
    const d = r && (r.rolled || (r.dice ? r : null));
    if (!d || !d.dice || !d.dice.length) return r && r.homeostatic ? `${first(o.name)} does it without needing to throw.` : null;
    // A Strike is thrown against the creature's membrane: that number is the creature's, so it is not shown.
    const vs = m.kind === 'strike' ? '' : d.at != null ? ` against ${d.at}` : '';
    const how = d.success == null ? '' : d.success ? (m.kind === 'strike' ? ': a hit' : `: success${d.overflow ? `, ${d.overflow} over` : ''}`) : (m.kind === 'strike' ? ': a miss' : `: short by ${d.shortBy}`);
    return `${first(o.name)} throws ${d.dice.join(', ')} = ${d.total}${vs}${how}${d.runaway ? '. The reaction feeds itself' : ''}.`;
  }
  // Play one legal move and say what it did.
  async apply(m, by, { lead = '' } = {}) {
    const g = this.g; const n0 = g.s.log.length;
    this.undo.push(structuredClone({ s: g.s, story: this.story.length })); if (this.undo.length > 30) this.undo.shift();
    const r = play(g, m.id);
    if (!r.ok) { this.undo.pop(); throw new TableError(r.error); }
    const fresh = g.s.log.slice(n0);
    const o = m.who ? g.s.orgs[m.who] : null;
    const roll = o ? this.rollLine(o, m, r.result) : null;
    if (roll) this.add('roll', o.name, roll);
    const lines = fresh.map((x) => (x.kind === 'clock' ? x.text.replace(/-/g, ' ') : x.text));
    if (!lines.length && !roll) lines.push(o ? `${first(o.name)}: ${m.label.toLowerCase()}.` : `${m.label}.`);
    let text = lines.join(' ');
    const want = this.narrate === 'all' || (this.narrate === 'beats' && isBeat(fresh.map((x) => x.kind)));
    if (want && !lead) {
      const acted = o ? `${first(o.name)} chose: ${m.label}.${roll ? ` ${roll}` : ''}` : `The Cohort chose: ${m.label}.`;
      const v = await this.voice({ lines: [acted, ...lines] });
      if (!v.fallback) text = v.text;
    }
    const q = question(g);
    this.add('director', null, [lead, text].filter(Boolean).join(' '));
    if (q) this.add('ask', null, q);
    return r;
  }
  async voice(opts) {
    this.busy = 'The Director is speaking'; this.emit('change', this.version);
    const r = await speak(this.provider, this.g, { ...opts, story: this.story });
    this.busy = null;
    const st = this.stats;
    if (r.ms) { st.calls += 1; st.ms += r.ms; st.in += r.usage.in; st.out += r.usage.out; st.last = { ms: r.ms, in: r.usage.in, out: r.usage.out }; }
    if (r.fallback && r.fallback !== 'no model') { st.fallbacks += 1; st.error = r.fallback; }
    return r;
  }
  // A button: the move is already exact.
  move(tok, id) {
    return this.run(async () => {
      const m = this.movesFor(tok).find((x) => x.id === id);
      if (!m) throw new TableError(legalMoves(this.g).some((x) => x.id === id) ? 'That move belongs to another organism.' : 'That cannot be done right now.', 409);
      const who = this.isHost(tok) && !this.seat(tok) ? 'Host' : (this.seat(tok) || {}).name || 'Host';
      this.add('player', who, m.who ? `${first(this.g.s.orgs[m.who].name)}: ${m.label}` : m.label);
      await this.apply(m, who);
      this.touch();
    });
  }
  // Free words: the model works out which legal move was meant, if any. It can only pick the speaker's own.
  say(tok, text) {
    return this.run(async () => {
      const s = this.seat(tok); const host = this.isHost(tok);
      if (!s && !host) throw new TableError('Join the table first.', 401);
      const t = clean(text, 400); if (!t) return;
      const who = s ? s.name : 'Host';
      this.add('player', who, t);
      this.emit('change', this.version);
      const choices = this.movesFor(tok);
      if (!this.provider || this.provider.id === 'none') {
        this.add('director', null, choices.length ? 'The Director has no voice tonight: use the buttons to act.' : 'Nothing here answers that.');
        this.touch(); return;
      }
      const speaker = s && s.orgIds.length ? `${who}, playing ${s.orgIds.map((id) => this.g.s.orgs[id].name).join(' and ')}` : who;
      const r = await this.voice({ said: { who: speaker, text: t }, choices });
      const m = r.choose ? choices.find((x) => x.id === r.choose) : null;
      if (m) await this.apply(m, who, { lead: r.fallback ? '' : r.text });
      else { this.add('director', null, r.fallback ? 'Nothing here answers that.' : r.text); const q = question(this.g); if (q) this.add('ask', null, q); }
      this.touch();
    });
  }

  // ---- the host -----------------------------------------------------------------
  hostDo(tok, action, a = {}) {
    if (!this.isHost(tok)) throw new TableError('Host only.', 403);
    return this.run(async () => {
      if (action === 'new') { this.g = newGame(this.D, { seed: Number(a.seed) || (randomBytes(4).readUInt32LE() || 1) }); this.story = []; this.undo = []; for (const s of Object.values(this.seats)) s.orgIds = s.orgIds.filter((id) => this.g.s.orgs[id]); this.add('engine', null, `A new game of ${this.D.vector.title}.`); }
      else if (action === 'undo') { const u = this.undo.pop(); if (!u) throw new TableError('Nothing to undo.'); this.g = { D: this.D, s: u.s }; this.story.length = Math.min(this.story.length, u.story); this.add('engine', null, 'The host takes the last move back.'); }
      else if (action === 'narrate') { if (!['all', 'beats', 'off'].includes(a.mode)) throw new TableError('all, beats or off.'); this.narrate = a.mode; }
      else if (action === 'code') { this.code = code(); }
      else if (action === 'kick') { const k = Object.keys(this.seats).find((t) => this.seats[t].id === a.seat); if (k) { this.add('engine', null, `${this.seats[k].name} leaves the table.`); delete this.seats[k]; } }
      else if (action === 'provider') { this.provider = a.provider; this.stats.error = null; }
      else throw new TableError('Unknown host action.');
      this.touch();
    });
  }
}
