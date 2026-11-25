// Replay and fuzz: after any change to the Engine, the tools or the Director's code, play back the tool
// calls a real model made in earlier benches, and throw bad arguments at every tool, without a model.
//
// A bench with --log writes <log>.calls.jsonl: one line per Director turn that used a tool, holding the
// game as it was before the turn (gzipped) and each call with how it was answered then (ok, note or
// refused). replayRecord() runs the same calls through today's code, from the same game:
//   - a call that worked then and is refused now is a regression (the next bench would trip on it);
//   - a call that crashes the tool ("That could not be done") is a regression whatever it did then;
//   - a call refused then and accepted now is a fix.
// Dice differ, so a hit may now be a miss; the kind of answer is what is compared.
//
// fuzzTools() calls every tool with the bad arguments benches have seen (wrong and near names, missing
// parts, nobody, dead targets, out of turn, wrong types) and reports any that crash or answer nothing.

import { gunzipSync, gzipSync } from 'node:zlib';
import { toolbox, TOOLS } from './tools.js';
import { beforeTurn } from './director.js';
import { makeRng } from '../engine/dice.js';

export const kindOf = (r) => (!r ? 'none' : r.refused ? (/^That could not be done:/.test(r.refused) ? 'crash' : 'refused') : r.note && !r.ok && Object.keys(r).length <= 3 && /^Nothing changed|^Not yet|^Nothing to/.test(r.note) ? 'note' : 'ok');

export function packState(s) { return gzipSync(Buffer.from(JSON.stringify(s))).toString('base64'); }
export function unpackState(b64) { return JSON.parse(gunzipSync(Buffer.from(b64, 'base64')).toString('utf8')); }

// One recorded turn, as the bench writes it.
export function recordTurn({ part, run, label, reason, before, calls, adventureId }) {
  const real = (calls || []).filter((c) => !/^\(/.test(c.name));
  if (!real.length) return null;
  return { v: 1, adventure: adventureId, part, run, label, reason, state: packState(before),
    calls: real.map((c) => ({ name: c.name, args: c.args || {}, was: kindOf(c.result), text: String((c.result && (c.result.refused || c.result.note)) || '').slice(0, 300) })) };
}

export function replayRecord(rec, { adventure, srd, seed = 1 }) {
  const state = unpackState(rec.state);
  const T = toolbox({ state, adventure, srd, rng: makeRng(seed), now: 1 });
  beforeTurn(T, state);
  const out = [];
  for (const c of rec.calls) {
    let r;
    try { r = T.run(c.name, c.args); } catch (e) { r = { refused: `That could not be done: ${e.message}` }; }
    const now = kindOf(r);
    const regression = now === 'crash' || (now === 'refused' && (c.was === 'ok' || c.was === 'note'));
    const fixed = c.was === 'refused' && now !== 'refused' && now !== 'crash';
    out.push({ name: c.name, args: c.args, was: c.was, now, regression, fixed, text: String((r && (r.refused || r.note)) || '') });
  }
  return out;
}

// Bad arguments for every tool, built from the game in hand (names of who is here, who is dead).
export function fuzzTools(state, { adventure, srd, seed = 1 }) {
  const pcs = Object.values(state.pcs || {});
  const foes = Object.values(state.foes || {}).filter((f) => f.siteId === state.scene.siteId);
  const pc = pcs[0] || { name: 'Nobody', id: 'x' };
  const foe = foes[0] || { name: 'Nothing', id: 'y' };
  const near = (n) => (n.length > 4 ? `${n.slice(0, -2)}${n.slice(-1)}` : `${n}x`);
  const names = ['', 'nobody at all', near(pc.name), near(foe.name), pc.name.toLowerCase(), foe.name.toUpperCase(), `pc:${pc.id}`, `foe:${foe.id}`, 'the nearest one', 42, null, ['a', 'b']];
  const odd = [undefined, '', 'banana', -3, 0, 99999, '1d', 'd20+', {}, true];
  const cases = [];
  for (const t of TOOLS) {
    const props = Object.keys((t.parameters && t.parameters.properties) || {});
    cases.push([t.name, {}]);
    for (const p of props) {
      for (const v of [...names.slice(0, 8), ...odd.slice(0, 6)]) cases.push([t.name, { [p]: v }]);
    }
    // Everything set at once to near names.
    cases.push([t.name, Object.fromEntries(props.map((p) => [p, near(foe.name)]))]);
  }
  const bad = [];
  for (const [name, args] of cases) {
    const T = toolbox({ state, adventure, srd, rng: makeRng(seed), now: 1 });
    let r;
    try { r = T.run(name, args); } catch (e) { r = { refused: `That could not be done: ${e.message}` }; }
    const k = kindOf(r);
    const text = String((r && (r.refused || r.note)) || '');
    if (k === 'crash' || k === 'none' || ((k === 'refused' || k === 'note') && text.trim().length < 8)) bad.push({ name, args, kind: k, text });
  }
  return { cases: cases.length, bad };
}
