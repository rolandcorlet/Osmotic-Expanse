// Keeps the Director's settings, decides when it takes a turn, and holds a
// proposal for the host in Co-pilot mode. The live Ledger is only ever changed
// through commit(), which the server supplies.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { gemini, pickDefaultModel, ProviderError } from './gemini.js';
import { directorTurn } from './director.js';

const MODES = ['off', 'copilot', 'auto'];

export function createDirector({ getState, commit, scenario, bestiary, saveDir, rng, onChange, makeProvider = gemini }) {
  const file = join(saveDir, 'director.json');
  const cfg = { mode: 'off', provider: 'gemini', apiKey: process.env.GEMINI_API_KEY || '', model: '' };
  try {
    if (existsSync(file)) Object.assign(cfg, JSON.parse(readFileSync(file, 'utf8')));
  } catch (e) { /* a damaged settings file: start from defaults */ }
  if (!MODES.includes(cfg.mode)) cfg.mode = 'off';

  const st = { phase: 'idle', error: '', proposal: null, last: null, models: [], totals: { turns: 0, in: 0, out: 0 } };
  let timer = null;
  let again = null;
  let selfRuns = 0;
  let nextId = 1;

  const saveCfg = () => {
    try { mkdirSync(saveDir, { recursive: true }); writeFileSync(file, JSON.stringify(cfg, null, 1)); } catch (e) { /* settings stay in memory */ }
  };
  const ready = () => cfg.mode !== 'off' && !!cfg.apiKey && !!cfg.model;
  const provider = () => makeProvider({ apiKey: cfg.apiKey, model: cfg.model });
  const fail = (e) => {
    st.phase = 'error';
    st.error = e instanceof ProviderError ? e.message : `The Director hit a problem: ${e.message}`;
    if (!(e instanceof ProviderError)) console.error(e);
  };

  async function refreshModels() {
    if (!cfg.apiKey) { st.models = []; return; }
    st.models = await makeProvider({ apiKey: cfg.apiKey, model: cfg.model }).listModels();
    if (!cfg.model || !st.models.some((m) => m.id === cfg.model)) cfg.model = pickDefaultModel(st.models);
    saveCfg();
  }

  async function run(reason, hostNote = '') {
    if (!cfg.apiKey) { st.phase = 'error'; st.error = 'Paste a Gemini API key first.'; onChange(); return; }
    if (!cfg.model) { st.phase = 'error'; st.error = 'Choose a Gemini model first.'; onChange(); return; }
    if (st.phase === 'thinking') { again = { reason, hostNote }; return; }
    st.phase = 'thinking';
    st.error = '';
    st.proposal = null;
    onChange();
    const started = Date.now();
    try {
      let result = null;
      for (let tries = 0; tries < 3; tries++) {
        const base = getState();
        result = await directorTurn({ state: base, scenario, bestiary, provider: provider(), rng, now: Date.now(), reason, hostNote });
        result.baseSeq = base.seq;
        if (getState().seq === base.seq) break; // the table did not move while it was thinking
        result = null;
      }
      if (!result) throw new ProviderError('The table kept changing while the Director was thinking. Press "Take a turn" when things settle.');
      st.totals.turns += 1;
      st.totals.in += result.usage.in;
      st.totals.out += result.usage.out;
      st.last = { ms: Date.now() - started, usage: result.usage, calls: result.calls.map(summary), flags: result.flags, narration: result.narration };
      const held = result.flags.some((f) => f.kind === 'leak');
      if (cfg.mode === 'auto' && !held) {
        commit(result.state);
        st.phase = 'idle';
        after();
      } else {
        st.proposal = { id: nextId++, baseSeq: result.baseSeq, narration: result.narration, calls: result.calls.map(summary), flags: result.flags, held: cfg.mode === 'auto', state: result.state };
        st.phase = 'proposal';
      }
    } catch (e) {
      fail(e);
    }
    onChange();
    if (again && st.phase !== 'proposal') {
      const a = again;
      again = null;
      schedule(a.reason, a.hostNote);
    }
    again = null;
  }

  const summary = (c) => ({ name: c.name, args: c.args, refused: c.result && c.result.refused ? c.result.refused : '', result: c.result && !c.result.refused ? c.result : null });

  // After the Director's own turn lands: if a creature is still up, it goes again.
  function after() {
    const s = getState();
    const cur = s.fight && s.fight.turn ? s.fight.actors[s.fight.turn] : null;
    if (cur && cur.kind === 'cre' && !s.requests.length && selfRuns < 4) {
      selfRuns += 1;
      schedule('a creature is still to act', '', true);
    }
  }

  function schedule(reason, hostNote = '', self = false) {
    if (!ready()) return;
    if (!self) selfRuns = 0;
    clearTimeout(timer);
    timer = setTimeout(() => { run(reason, hostNote); }, 900);
  }

  return {
    // Called by the server after a player does something the Director should answer.
    playerActed(reason) {
      if (!ready()) return;
      if (st.phase === 'proposal') { st.proposal = null; st.phase = 'idle'; } // the table moved on: that proposal is stale
      schedule(reason);
    },
    async op(body) {
      switch (body.op) {
        case 'config': {
          if (body.mode && MODES.includes(body.mode)) cfg.mode = body.mode;
          if (typeof body.model === 'string' && body.model) cfg.model = body.model;
          if (typeof body.apiKey === 'string') {
            cfg.apiKey = body.apiKey.trim();
            st.error = '';
            try {
              await refreshModels();
              if (st.phase === 'error') st.phase = 'idle';
            } catch (e) {
              fail(e);
              if (/not valid/i.test(e.message)) cfg.apiKey = ''; // do not keep a key Google has rejected
            }
          }
          if (body.mode === 'off') { st.proposal = null; st.phase = 'idle'; st.error = ''; }
          saveCfg();
          break;
        }
        case 'models':
          try { await refreshModels(); if (st.phase === 'error') { st.phase = 'idle'; st.error = ''; } } catch (e) { fail(e); }
          break;
        case 'run':
          selfRuns = 0;
          run('the host asked for a turn', String(body.note || '').slice(0, 400)); // not awaited: screens show "thinking"
          return;
        case 'approve': {
          const p = st.proposal;
          if (!p) break;
          if (getState().seq !== p.baseSeq) {
            st.proposal = null;
            st.phase = 'idle';
            selfRuns = 0;
            run('the table changed before the proposal was approved');
            return;
          }
          const text = typeof body.text === 'string' && body.text.trim() ? body.text.trim().slice(0, 2400) : null;
          if (text) {
            const entry = p.state.story[p.state.story.length - 1];
            if (entry && entry.kind === 'narration') { entry.text = text; entry.by = 'ai, edited by the host'; }
          }
          commit(p.state);
          st.proposal = null;
          st.phase = 'idle';
          selfRuns = 0;
          after();
          break;
        }
        case 'discard':
          st.proposal = null;
          st.phase = 'idle';
          break;
        default:
          break;
      }
      onChange();
    },
    // What each kind of screen may know about the Director.
    view(role) {
      const on = cfg.mode !== 'off' && !!cfg.apiKey;
      if (role !== 'host') return { on, thinking: on && (st.phase === 'thinking' || st.phase === 'proposal') };
      const p = st.proposal;
      return {
        on, mode: cfg.mode, provider: cfg.provider, model: cfg.model, keySet: !!cfg.apiKey, models: st.models,
        phase: st.phase, error: st.error, thinking: st.phase === 'thinking', last: st.last, totals: st.totals,
        proposal: p ? { id: p.id, narration: p.narration, calls: p.calls, flags: p.flags, held: p.held, stale: getState().seq !== p.baseSeq } : null,
      };
    },
    init() { if (cfg.apiKey) refreshModels().then(onChange).catch(() => {}); },
  };
}
