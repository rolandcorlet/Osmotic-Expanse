// The legal-move generator. At any moment the Engine lists exactly what may be done; the Director's tools and the
// players' buttons are built from this list. An illegal move cannot be expressed, so it cannot be refused.
import { threshold, rollPool, buildPool, bandIdx, bandAt } from './rules.mjs';
import { orgs, upOrgs, site, creaturesHere, liveCreatures, hostileCreatures, interact, needsState, enterSite, emit, say, end, mark, poolFor, addCondition, hurt, clone } from './world.mjs';
import { startFight, advance, endTurn, strikeCost, playerStrike, resolveReaction, currentActor, dist, endFight } from './fight.mjs';
import { dice } from './rng.mjs';

const exitOpen = (g, e) => {
  if (e.open === 'always') return true;
  if (e.open === 'not-in-fight') return !g.s.fight && !g.s.chase;
  const m = String(e.open).match(/^needs:(.+)$/);
  if (m) return !!g.s.flags[m[1]] && !g.s.fight;
  return false;
};

export function legalMoves(g) {
  const s = g.s;
  const out = [];
  if (s.ended) return out;
  if (!s.scene.siteId) return [{ id: 'begin', who: null, kind: 'begin', label: 'Begin at the first site' }];
  // 1. A reaction is pending: only the reacting organism may answer.
  if (s.pending) {
    const o = s.orgs[s.pending.target];
    out.push({ id: 'react:deflect', who: o.id, kind: 'react', label: 'Deflect (+4 to Membrane Threshold)', cost: 'the held Reserve' });
    out.push({ id: 'react:brace', who: o.id, kind: 'react', label: 'Brace (halve Kinetic or Osmotic damage)', cost: 'the held Reserve' });
    out.push({ id: 'react:none', who: o.id, kind: 'react', label: 'Take it', cost: 'nothing' });
    return out;
  }
  // 2. A chase.
  if (s.chase) {
    for (const o of upOrgs(g)) if (!s.chase.out.includes(o.id) && !s.chase.rolled?.[o.id]) out.push({ id: `race:${o.id}`, who: o.id, kind: 'race', label: `${o.name} races the closing gut`, pool: 'DFF + Fluid Navigation, Standard' });
    return out;
  }
  // 3. A Pulse War: the organism on turn.
  if (s.fight) {
    const key = currentActor(g);
    if (!key || !key.startsWith('org:')) return out;
    const o = s.orgs[key.slice(4)];
    if (o.state !== 'up') return out;
    for (const c of liveCreatures(g)) if (o.pp >= strikeCost(o) && dist(c, o) <= bandIdx(String(o.weapon.band).toLowerCase())) out.push({ id: `strike:${o.id}:${c.cid}`, who: o.id, kind: 'strike', target: c.cid, label: `Strike ${c.name}`, cost: `${strikeCost(o)} PP` });
    if (o.pp >= 1 && liveCreatures(g).some((c) => dist(c, o) > 0)) out.push({ id: `drift:${o.id}`, who: o.id, kind: 'drift', label: 'Drift one band closer', cost: '1 PP' });
    if (o.pp >= 1 && !o.reserve) out.push({ id: `reserve:${o.id}`, who: o.id, kind: 'reserve', label: 'Hold a Reserve', cost: '1 PP' });
    if (o.pp >= 1 && o.atp >= 2 && o.stress > 0) out.push({ id: `vent:${o.id}`, who: o.id, kind: 'vent', label: 'Vent (Stress -2)', cost: '1 PP, 2 ATP' });
    for (const d of orgs(g).filter((x) => x.state === 'dormant')) if (o.pp >= 2) out.push({ id: `stabilise:${o.id}:${d.id}`, who: o.id, kind: 'stabilise', target: d.id, label: `Stabilise ${d.name}`, cost: '2 PP' });
    for (const c of creaturesHere(g).filter((x) => x.down && !x.harvested)) if (o.pp >= 2 && !hostileCreatures(g).length === false) out.push({ id: `harvest:${o.id}:${c.cid}`, who: o.id, kind: 'harvest', target: c.cid, label: `Cut ${c.name}`, cost: '2 PP' });
    out.push({ id: `end-turn:${o.id}`, who: o.id, kind: 'end-turn', label: 'End turn', cost: 'nothing' });
    return out;
  }
  // 4. Exploring.
  const sit = site(g);
  for (const o of upOrgs(g)) {
    for (const it of sit.interactables) {
      if (s.done[`${sit.id}/${it.id}`]) continue;
      const ns = needsState(g, o, it.needs);
      if (!ns.ok) continue;
      out.push({ id: `do:${o.id}:${it.id}`, who: o.id, kind: 'interact', interact: it.id, label: it.name, action: it.action || 'talk' });
    }
    for (const c of creaturesHere(g).filter((x) => x.down && !x.harvested)) out.push({ id: `harvest:${o.id}:${c.cid}`, who: o.id, kind: 'harvest', target: c.cid, label: `Cut ${c.name}` });
    for (const d of orgs(g).filter((x) => x.state === 'dormant')) out.push({ id: `stabilise:${o.id}:${d.id}`, who: o.id, kind: 'stabilise', target: d.id, label: `Stabilise ${d.name}` });
    for (const c of liveCreatures(g)) out.push({ id: `attack:${o.id}:${c.cid}`, who: o.id, kind: 'attack', target: c.cid, label: `Attack ${c.name}`, starts: 'a Pulse War' });
  }
  for (const e of sit.exits) if (exitOpen(g, e)) out.push({ id: `exit:${e.to}`, who: null, kind: 'exit', to: e.to, label: e.name });
  return out;
}

function org(g, id) { return g.s.orgs[id]; }

export function play(g, id) {
  const legal = legalMoves(g);
  const m = legal.find((x) => x.id === id);
  if (!m) return { ok: false, error: `That is not a legal move now.`, legal: legal.map((x) => x.id) };
  const s = g.s;
  const o = m.who ? org(g, m.who) : null;
  const res = { ok: true, move: m, lines: [] };
  const n0 = s.log.length;
  switch (m.kind) {
    case 'begin': enterSite(g, g.D.vector.sites[0].id); break;
    case 'interact': res.result = interact(g, o, g.D.sites[s.scene.siteId].interactables.find((x) => x.id === m.interact)); break;
    case 'exit': {
      const e = site(g).exits.find((x) => x.to === m.to);
      if (creaturesHere(g).some((x) => x.down && !x.harvested)) emit(g, 'body-left', {}); // a body left uncut, not merely leaving
      if (g.D.sites[m.to]) enterSite(g, m.to); else end(g, m.to);
      break;
    }
    case 'attack': { const c = s.cres[m.target]; c.stance = 'hostile'; emit(g, 'strike', { org: o }); if (!s.fight) startFight(g); break; }
    case 'strike': res.result = playerStrike(g, o, s.cres[m.target]); break;
    case 'drift': o.pp -= 1; o.close += 1; o.drifted = true; break;
    case 'reserve': o.pp -= 1; o.reserve = 1; break;
    case 'vent': o.pp -= 1; o.atp -= 2; o.stress = Math.max(0, o.stress - 2); break;
    case 'end-turn': endTurn(g); break;
    case 'react': resolveReaction(g, m.id.split(':')[1]); break;
    case 'stabilise': {
      const d = org(g, m.target);
      if (s.fight) o.pp -= 2;
      const p = buildPool(g.D, { base: o.baselines.RTC, path: o.pathways.Synthesis || 0, stress: o.stress });
      const r = rollPool(g, p.pool, 12 + d.level);
      if (r.success) { d.mi = r.overflow + 4; d.state = 'up'; d.countdown = Math.max(0, d.countdown - 1); say(g, `${o.name} brings ${d.name} back.`, 'stabilise'); }
      else say(g, `${o.name} cannot bring ${d.name} back this time.`, 'stabilise');
      res.result = r;
      break;
    }
    case 'harvest': {
      const c = s.cres[m.target];
      const h = g.D.blocks[c.block].harvest;
      if (s.fight) o.pp -= 2;
      const base = Math.max(o.baselines.OSM, o.baselines.RTC);
      const p = buildPool(g.D, { base, path: o.pathways.Synthesis || 0, stress: o.stress });
      const r = rollPool(g, p.pool, h.threshold);
      c.harvested = true;
      if (r.success) for (const k of ['C', 'G', 'P', 'T']) o.spec[k] += h.specimens[k] || 0;
      else o.substrate += 5 * (h.specimens.C || 0);
      emit(g, 'body-cut', { org: o });
      res.result = r;
      break;
    }
    case 'race': {
      const ch = s.chase;
      const p = buildPool(g.D, { base: o.baselines.DFF, path: o.pathways['Fluid Navigation'] || 0, stress: o.stress, mods: orgs(g).some((x) => x.state === 'dormant') ? [{ id: 'carrying', dice: -1 }] : [] });
      const r = rollPool(g, p.pool, 12);
      (ch.rolled ||= {})[o.id] = true;
      if (r.success) { ch.pos[o.id] = bandAt(bandIdx(ch.pos[o.id]) - 1); if (bandIdx(ch.pos[o.id]) === 0) ch.out.push(o.id); }
      if (r.inhibitors) mark(g, o, r.inhibitors);
      res.result = r;
      if (upOrgs(g).every((x) => ch.out.includes(x.id) || ch.rolled[x.id])) { ch.cycle += 1; ch.rolled = {}; if (ch.out.length && ch.out.length >= upOrgs(g).length) { end(g, 'escaped'); } else if (ch.cycle >= ch.limit) end(g, ch.out.length ? 'escaped' : 'carcass-ends'); }
      break;
    }
  }
  if (s.wantFight && !s.fight && !s.chase && !s.ended) { s.wantFight = false; startFight(g); }
  if (!s.ended) advance(g);
  else if (s.fight) endFight(g);
  res.lines = s.log.slice(n0).map((x) => x.text);
  return res;
}
