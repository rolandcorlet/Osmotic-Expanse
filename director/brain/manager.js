// Keeps the Director's settings, decides when it takes a turn, and holds a
// proposal for the host in Co-pilot mode. The live Ledger is only ever changed
// through commit(), which the server supplies.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { build, pickDefaultModel, providerInfo, publicProviders, testConnection, PROVIDERS, ProviderError } from './providers.js';
import { directorTurn } from './director.js';

const MODES = ['off', 'copilot', 'auto'];

export function createDirector({ getState, commit, scenario, bestiary, saveDir, rng, onChange, makeProvider = build }) {
  const file = join(saveDir, 'director.json');
  // Each provider keeps its own key, address and chosen model, so switching loses nothing.
  const cfg = { mode: 'off', provider: 'gemini', keys: {}, urls: {}, models: {}, numCtx: 16384, thinking: 'default' };
  try {
    if (existsSync(file)) {
      const old = JSON.parse(readFileSync(file, 'utf8'));
      for (const k of ['mode', 'provider', 'numCtx', 'thinking']) if (old[k] != null) cfg[k] = old[k];
      for (const k of ['keys', 'urls', 'models']) if (old[k] && typeof old[k] === 'object') Object.assign(cfg[k], old[k]);
      // Settings saved before there was a choice of provider were Gemini's.
      if (typeof old.apiKey === 'string' && old.apiKey && !cfg.keys.gemini) cfg.keys.gemini = old.apiKey;
      if (typeof old.model === 'string' && old.model && !cfg.models.gemini) cfg.models.gemini = old.model;
    }
  } catch (e) { /* a damaged settings file: start from defaults */ }
  if (!MODES.includes(cfg.mode)) cfg.mode = 'off';
  if (!PROVIDERS.some((p) => p.id === cfg.provider)) cfg.provider = 'gemini';

  const st = { phase: 'idle', error: '', proposal: null, last: null, modelsBy: {}, test: null, totals: { turns: 0, in: 0, out: 0 } };
  const info = () => providerInfo(cfg.provider);
  const keyOf = (id = cfg.provider) => cfg.keys[id] || (providerInfo(id).env && process.env[providerInfo(id).env]) || '';
  const urlOf = (id = cfg.provider) => (providerInfo(id).url && cfg.urls[id]) || providerInfo(id).base || '';
  const modelOf = () => cfg.models[cfg.provider] || '';
  // Enough is filled in to call out: a key where one is required, an address where one is needed.
  const usable = () => (info().key !== 'required' || !!keyOf()) && (info().kind !== 'openai' || !!urlOf());
  const need = () => (info().key === 'required' && !keyOf() ? `Paste a ${info().name} API key first.` : !urlOf() && info().url ? 'Enter the address of the AI server first.' : '');
  let timer = null;
  let again = null;
  let selfRuns = 0;
  let nextId = 1;

  const saveCfg = () => {
    try { mkdirSync(saveDir, { recursive: true }); writeFileSync(file, JSON.stringify(cfg, null, 1)); } catch (e) { /* settings stay in memory */ }
  };
  const ready = () => cfg.mode !== 'off' && usable() && !!modelOf();
  const provider = () => makeProvider({ provider: cfg.provider, apiKey: keyOf(), baseUrl: urlOf(), model: modelOf(), numCtx: cfg.numCtx, thinking: cfg.thinking });
  const fail = (e) => {
    st.phase = 'error';
    st.error = e instanceof ProviderError ? e.message : `The Director hit a problem: ${e.message}`;
    if (!(e instanceof ProviderError)) console.error(e);
  };

  async function refreshModels() {
    const id = cfg.provider;
    if (!usable()) { st.modelsBy[id] = []; return; }
    const list = await provider().listModels();
    st.modelsBy[id] = list;
    if (!cfg.models[id] || !list.some((m) => m.id === cfg.models[id])) cfg.models[id] = pickDefaultModel(id, list);
    saveCfg();
  }

  async function run(reason, hostNote = '') {
    if (need()) { st.phase = 'error'; st.error = need(); onChange(); return; }
    if (!modelOf()) { st.phase = 'error'; st.error = 'Choose a model first.'; onChange(); return; }
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
          let reload = false;
          if (typeof body.provider === 'string' && PROVIDERS.some((p) => p.id === body.provider) && body.provider !== cfg.provider) {
            cfg.provider = body.provider;
            st.proposal = null;
            st.test = null;
            if (st.phase !== 'thinking') st.phase = 'idle';
            st.error = '';
            reload = usable() && !(st.modelsBy[cfg.provider] || []).length;
          }
          if (typeof body.model === 'string' && body.model) { cfg.models[cfg.provider] = body.model; st.test = null; }
          if (['default', 'medium', 'low', 'off'].includes(body.thinking)) { cfg.thinking = body.thinking; st.test = null; }
          if (body.numCtx != null) cfg.numCtx = Math.min(262144, Math.max(4096, Math.round(Number(body.numCtx)) || 16384));
          if (typeof body.baseUrl === 'string' && info().url) {
            const u = body.baseUrl.trim();
            if (u && !/^https?:\/\//i.test(u)) { st.phase = 'error'; st.error = 'The address must start with http:// or https://'; saveCfg(); break; }
            if (u) cfg.urls[cfg.provider] = u; else delete cfg.urls[cfg.provider];
            reload = true;
          }
          if (typeof body.apiKey === 'string') {
            const k = body.apiKey.trim();
            if (k) cfg.keys[cfg.provider] = k; else delete cfg.keys[cfg.provider];
            reload = true;
          }
          if (reload) {
            st.error = '';
            st.test = null;
            try {
              await refreshModels();
              if (st.phase === 'error') st.phase = 'idle';
            } catch (e) {
              fail(e);
              st.modelsBy[cfg.provider] = [];
              if (/not valid/i.test(e.message)) delete cfg.keys[cfg.provider]; // do not keep a key the provider has rejected
            }
          }
          if (body.mode === 'off') { st.proposal = null; st.phase = 'idle'; st.error = ''; }
          saveCfg();
          break;
        }
        case 'models':
          try { await refreshModels(); if (st.phase === 'error') { st.phase = 'idle'; st.error = ''; } } catch (e) { fail(e); }
          break;
        case 'test': {
          if (need() || !modelOf()) { st.test = { ok: false, text: need() || 'Choose a model first.' }; break; }
          st.test = { busy: true, text: 'Testing…' };
          onChange();
          try {
            const r = await testConnection(provider());
            st.test = r.ok
              ? { ok: true, text: `Connected in ${(r.ms / 1000).toFixed(1)} s, and the model used a tool correctly.` }
              : { ok: false, text: `Connected in ${(r.ms / 1000).toFixed(1)} s, but the model did not use the tool it was given. The Director needs tools: choose another model.` };
          } catch (e) {
            st.test = { ok: false, text: e instanceof ProviderError ? e.message : `The test hit a problem: ${e.message}` };
          }
          break;
        }
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
      const on = cfg.mode !== 'off' && usable();
      if (role !== 'host') return { on, thinking: on && (st.phase === 'thinking' || st.phase === 'proposal') };
      const p = st.proposal;
      return {
        on, mode: cfg.mode, provider: cfg.provider, providers: publicProviders(), model: modelOf(), keySet: !!keyOf(), usable: usable(),
        url: urlOf(), numCtx: cfg.numCtx, thinking: cfg.thinking, models: st.modelsBy[cfg.provider] || [], test: st.test,
        phase: st.phase, error: st.error, thinking: st.phase === 'thinking', last: st.last, totals: st.totals,
        proposal: p ? { id: p.id, narration: p.narration, calls: p.calls, flags: p.flags, held: p.held, stale: getState().seq !== p.baseSeq } : null,
      };
    },
    init() { if (usable() && (info().group === 'cloud' || cfg.urls[cfg.provider] || cfg.models[cfg.provider])) refreshModels().then(onChange).catch(() => {}); },
  };
}
