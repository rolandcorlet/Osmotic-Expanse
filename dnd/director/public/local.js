// The Assistants: the same screens with no server. The Ledger runs in the browser and the game is
// kept in this browser's storage, so the DM's Assistant and the Players' Assistant work offline
// from a single web page.

import { newSession, restart, apply, viewFor, RuleError } from '../engine/ledger.js';
import { systemRng } from '../engine/dice.js';

export function createLocal({ role, srd, adventures, storeKey }) {
  const rng = systemRng();
  const byId = (id) => adventures.find((a) => a.id === id) || adventures[0];
  const read = () => { try { return JSON.parse(localStorage.getItem(storeKey) || 'null'); } catch (e) { return null; } };
  const write = () => { try { localStorage.setItem(storeKey, JSON.stringify(state)); } catch (e) { /* storage full or private mode */ } };
  let state = read();
  if (!state || !state.pcs) state = newSession(byId(role === 'host' ? 'lantern' : 'freeform'));
  const history = [];
  const ctx = (pid) => ({ role, pid, rng, now: Date.now(), adventure: byId(state.adventure), srd, selfXp: true });
  const placeFirst = (s, adv) => {
    let out = s;
    for (const enc of ((adv.sites || [])[0] || {}).foes || []) out = apply(out, { type: 'foe.add', monster: enc.monster, count: enc.count, name: enc.name, hidden: true, note: enc.note }, { role: 'host', rng, now: Date.now(), adventure: adv, srd });
    return out;
  };
  if (!state.seq && role === 'host') { state = placeFirst(state, byId(state.adventure)); write(); }
  return {
    adventure: () => byId(state.adventure),
    view: (pid) => viewFor(state, role, pid),
    act(action, pid) {
      try {
        if (action.type === 'undo') {
          if (!history.length) throw new RuleError('Nothing to undo.');
          const seq = state.seq; state = history.pop(); state.seq = seq + 1;
        } else if (action.type === 'session.new') {
          history.push(state);
          const adv = byId(action.adventureId || state.adventure);
          const seq = state.seq;
          state = placeFirst(restart(state, adv, { keepPlayers: true, keepCharacters: action.keepCharacters !== false }), adv);
          state.seq = seq + 1;
        } else {
          const next = apply(state, action, ctx(pid));
          history.push(state);
          if (history.length > 60) history.shift();
          state = next;
        }
        write();
        return { ok: true };
      } catch (e) {
        if (e instanceof RuleError || /dice|d20/i.test(e.message)) return { ok: false, error: e.message };
        console.error(e);
        return { ok: false, error: `Something went wrong: ${e.message}` };
      }
    },
    exportJson: () => JSON.stringify({ kind: 'dnd-assistant', role, savedAt: new Date().toISOString(), state }, null, 1),
    importJson(text) {
      const o = JSON.parse(text);
      const s = o && o.state;
      if (!s || !s.pcs || !s.story) throw new Error('That file is not a saved D&D game.');
      history.push(state);
      const seq = state.seq;
      state = s; state.seq = Math.max(seq, s.seq || 0) + 1;
      write();
    },
  };
}
