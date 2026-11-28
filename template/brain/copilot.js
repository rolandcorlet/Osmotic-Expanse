// Co-pilot mode: the Director's turn is held as a proposal for the host (its calls, its words and what the
// Engine said back) and only reaches the table when the host approves it, with the words edited or not.
// If anything happened at the table since the proposal was made, it is stale: the Director is asked again.
// (A story line carries the turn number from before its action, so this turn's lines have seq >= baseSeq.)
//
//   makeProposal(out, base, id)            out: directorTurn()'s result; base: the state it started from
//   approveProposal(p, current, text)      -> { state } or { stale: true }
//   proposalView(p, current)               what the host's screen shows

const narrations = (p) => p.state.story.filter((e) => e.kind === 'narration' && e.seq >= p.baseSeq);

export function makeProposal(out, base, id) {
  const p = { id, baseSeq: base.seq, state: out.state, calls: out.calls || [], flags: out.flags || [], usage: out.usage || null, refusals: out.refusals || 0, at: Date.now() };
  const n = narrations(p);
  p.narration = n.length ? n[n.length - 1].text : String(out.narration || '');
  return p;
}

export function approveProposal(p, current, text = '') {
  if (!p) return { error: 'There is no proposal to approve.' };
  if (current.seq !== p.baseSeq) return { stale: true };
  const state = structuredClone(p.state);
  const edited = String(text || '').trim().slice(0, 6000);
  if (edited && edited !== p.narration) {
    const n = state.story.filter((e) => e.kind === 'narration' && e.seq >= p.baseSeq);
    const last = n[n.length - 1];
    if (last) { last.text = edited; last.edited = true; }
  }
  return { state };
}

export function proposalView(p, current) {
  if (!p) return null;
  return {
    id: p.id, narration: p.narration, stale: current.seq !== p.baseSeq,
    calls: p.calls.map((c) => `${c.name}${c.result && c.result.refused ? ' (refused)' : c.result && c.result.note ? ' (note)' : ''}`),
    flags: p.flags.filter((f) => f.kind !== 'note').map((f) => f.text),
    events: p.state.story.filter((e) => e.seq >= p.baseSeq && e.kind !== 'narration').map((e) => e.text).slice(-8),
  };
}
