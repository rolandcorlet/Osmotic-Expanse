// The Director's tools. Each one is a thin, checked doorway into the Ledger:
// the model asks, the Engine decides, and a refusal comes back in plain words.
// The model can change nothing except through these.

import { apply, RuleError, orgMT } from '../engine/ledger.js';
import * as R from '../engine/rules.js';

const S = (description, extra = {}) => ({ type: 'string', description, ...extra });
const I = (description) => ({ type: 'integer', description });
const B = (description) => ({ type: 'boolean', description });
const obj = (properties, required = []) => ({ type: 'object', properties, required });

const BAND_IDS = R.BANDS.map((b) => b.id);
const lower = (v) => String(v || '').trim().toLowerCase();

// ---- finding things by id or by name ----------------------------------------
function findOrg(s, ref) {
  const k = lower(ref);
  const list = Object.values(s.organisms).filter((o) => o.playerId);
  return list.find((o) => o.id === k) || list.find((o) => lower(o.name) === k) || list.find((o) => lower(o.hand) === k || lower(o.hand) === `the ${k}`)
    || list.find((o) => k && lower(o.name).startsWith(k)) || null;
}
function findCre(s, ref) {
  const k = lower(ref);
  const list = Object.values(s.creatures).filter((c) => c.siteId === s.scene.siteId);
  return list.find((c) => c.cid === k) || list.find((c) => lower(c.name) === k) || list.find((c) => k && lower(c.name).startsWith(k)) || null;
}
const noOrg = (ref) => ({ refused: `No organism called "${ref}" is in play. Use an id from the briefing.` });
const noCre = (ref) => ({ refused: `No creature called "${ref}" is in this scene. Use an id from the briefing.` });

function lastRoll(s) {
  const r = s.rolls[s.rolls.length - 1];
  if (!r) return null;
  const out = { who: r.who, what: r.label, dice: r.dice, total: r.total, against: r.at, success: r.success, overflow: r.overflow, runaway: r.runaway };
  if (r.damage != null) out.damage = r.damage;
  if (r.segments != null) out.segments_removed = r.segments;
  if (r.notes && r.notes.length) out.notes = r.notes;
  return out;
}

// ---- the tools ---------------------------------------------------------------
export const TOOLS = [
  {
    name: 'ask_for_roll',
    description: 'Ask one organism to roll (or pass on its Baseline). Use for anything uncertain an organism attempts. The player rolls on their own screen; the result arrives in your next briefing. End your turn after calling this.',
    parameters: obj({
      organism: S('Organism id from the briefing, for example "wall".'),
      baseline: S('Which Baseline.', { enum: R.BASELINES }),
      pathway: S('Which Pathway, or leave out for Baseline only.', { enum: R.PATHWAYS }),
      threshold: I('The Activation Threshold: 8, 12, 16 or 20 from the ladder, or a number printed in the site notes.'),
      what_for: S('A few words the player will see, for example "Cross the wound lip".'),
      modifiers: { type: 'array', description: 'Dice added or removed by circumstance: a tool or ally +1, good position +1, wrong tonic -1 or -2, cover -2.', items: obj({ label: S('Why.'), dice: I('Dice to add (positive) or remove (negative).') }, ['label', 'dice']) },
      unhurried: B('True when the attempt is unopposed and unhurried. The Engine then compares the Homeostatic Baseline and may need no roll.'),
    }, ['organism', 'baseline', 'threshold', 'what_for']),
    run(a, T) {
      const o = findOrg(T.state, a.organism);
      if (!o) return noOrg(a.organism);
      const at = Math.trunc(Number(a.threshold));
      if (!(at >= 8 && at <= 28)) return { refused: 'A Threshold is between 8 and 28: use the ladder (8, 12, 16, 20) or a number printed in the site notes.' };
      if (T.state.requests.some((q) => q.actor.kind === 'org' && q.actor.id === o.id)) return { refused: `${o.name} already has a roll waiting. Wait for it.` };
      const before = T.state.rolls.length;
      const no = T.do({ type: 'request.check', organismId: o.id, baseline: a.baseline, pathway: a.pathway || '', at, label: a.what_for, mods: a.modifiers || [], unhurried: !!a.unhurried });
      if (no) return { refused: no };
      if (T.state.rolls.length > before) return { no_roll_needed: true, note: `Unhurried, and ${o.name}'s Homeostatic Baseline meets ${at}. It simply succeeds. There is no Overflow.` };
      const q = T.state.requests[T.state.requests.length - 1];
      return { waiting_for: o.name, dice: q.pool.dice, threshold: at, chance_percent: Math.round((q.chance || 0) * 100), note: 'Tell the player what the roll is for, then end your turn.' };
    },
  },
  {
    name: 'open_roll',
    description: 'Roll dice in the open for a non-player (not an attack). For example a drone opening the wound lip.',
    parameters: obj({ who: S('Who is rolling.'), dice: I('How many dice.'), threshold: I('The Threshold, if there is one.'), what_for: S('A few words.') }, ['who', 'dice', 'what_for']),
    run(a, T) {
      const no = T.do({ type: 'creature.roll', who: a.who, n: a.dice, at: a.threshold == null ? '' : a.threshold, label: a.what_for });
      return no ? { refused: no } : lastRoll(T.state);
    },
  },
  {
    name: 'bring_creatures',
    description: 'Bring creatures printed for the current site into the scene. Only this site\'s printed creatures are allowed.',
    parameters: obj({ block: S('The block id from the site notes, for example "gnaw-swarm".'), count: I('How many.'), band: S('How far from the Cohort.', { enum: BAND_IDS }) }, ['block', 'count']),
    run(a, T) {
      const site = T.site();
      const printed = (site.encounter || []).find((e) => e.blockId === lower(a.block));
      if (!printed) return { refused: `"${a.block}" is not printed for ${site.name}. Printed here: ${(site.encounter || []).map((e) => `${e.count} ${e.blockId}`).join(', ') || 'nothing'}.` };
      const have = Object.values(T.state.creatures).filter((c) => c.siteId === site.id && c.blockId === printed.blockId).length;
      const count = Math.trunc(Number(a.count) || 1);
      if (count < 1 || have + count > printed.count) return { refused: `${site.name} prints ${printed.count} of these and ${have} are already here.` };
      const ids = new Set(Object.keys(T.state.creatures));
      const no = T.do({ type: 'creature.add', creatures: [{ blockId: printed.blockId, count, band: BAND_IDS.includes(a.band) ? a.band : 'near' }] });
      if (no) return { refused: no };
      return { arrived: Object.values(T.state.creatures).filter((c) => !ids.has(c.cid)).map((c) => ({ id: c.cid, name: c.name, band: c.band })) };
    },
  },
  {
    name: 'start_pulse_war',
    description: 'Begin a Pulse War with the creatures in the scene. Frequency is rolled for everyone and the first turn begins.',
    parameters: obj({}),
    run(a, T) {
      const no = T.do({ type: 'fight.start' });
      if (no) return { refused: no };
      return T.fightBrief();
    },
  },
  {
    name: 'end_pulse_war',
    description: 'End the Pulse War: one side can no longer fight, has fled, has yielded, or has what it wanted.',
    parameters: obj({}),
    run(a, T) {
      if (!T.state.fight) return { refused: 'There is no Pulse War running.' };
      const no = T.do({ type: 'fight.end' });
      return no ? { refused: no } : { ended: true };
    },
  },
  {
    name: 'creature_move',
    description: 'On a creature\'s turn: it Drifts to a new band (1 Pulse Point).',
    parameters: obj({ creature: S('Creature id from the briefing.'), band: S('Where it ends up, measured from the Cohort.', { enum: BAND_IDS }) }, ['creature', 'band']),
    run(a, T) {
      const c = findCre(T.state, a.creature);
      if (!c) return noCre(a.creature);
      const no = T.do({ type: 'creature.act', cid: c.cid, what: 'Drift', cost: 1, band: a.band });
      return no ? { refused: no } : { moved: c.name, band: a.band, pulse_points_left: T.pp('cre', c.cid) };
    },
  },
  {
    name: 'creature_strike',
    description: 'On a creature\'s turn: it attacks one organism. The Engine rolls its dice in the open and applies any damage. If the target holds a Reserve, the roll waits for their reaction and you must end your turn.',
    parameters: obj({ creature: S('Creature id from the briefing.'), target: S('Organism id.') }, ['creature', 'target']),
    run(a, T) {
      const c = findCre(T.state, a.creature);
      if (!c) return noCre(a.creature);
      const o = findOrg(T.state, a.target);
      if (!o) return noOrg(a.target);
      if (c.band === 'far' || c.band === 'loose') return { refused: `${c.name} is at ${c.band}: it must Drift closer before it can strike.` };
      const act = T.state.fight ? T.state.fight.actors[`cre:${c.cid}`] : null;
      // A swarm bites once per 2 Segments (CORE 4.13): the first Strike costs 2 PP, further bites in the allowance cost none.
      const cost = c.segments != null && act && act.strikes > 0 ? 0 : 2;
      const no = T.do({ type: 'creature.strike', cid: c.cid, targetId: o.id, cost });
      if (no) return { refused: no };
      const q = T.state.requests[T.state.requests.length - 1];
      if (q.canReact) return { waiting: true, note: `${o.name} holds a Reserve and may Deflect or Brace before the dice fall. Say the strike is coming, and end your turn.` };
      const no2 = T.do({ type: 'roll', requestId: q.id });
      if (no2) return { refused: no2 };
      const r = lastRoll(T.state);
      const t = T.state.organisms[o.id];
      return { ...r, hit: r.success, target: t.name, target_mi: `${t.mi}/${t.miMax}`, target_dormant: t.dormant, pulse_points_left: T.pp('cre', c.cid) };
    },
  },
  {
    name: 'creature_special',
    description: 'On a creature\'s turn: it uses a printed Special or another printed action that is not a Strike or a Drift (for example Brace). This only spends its Pulse Points and records it; describe the effect from the block and use other tools for any damage or condition.',
    parameters: obj({ creature: S('Creature id.'), what: S('The printed name, for example "Brace" or "Swarm Over".'), cost: I('Its printed Pulse Point cost.') }, ['creature', 'what', 'cost']),
    run(a, T) {
      const c = findCre(T.state, a.creature);
      if (!c) return noCre(a.creature);
      const no = T.do({ type: 'creature.act', cid: c.cid, what: String(a.what || 'Special').slice(0, 40), cost: a.cost });
      return no ? { refused: no } : { done: a.what, pulse_points_left: T.pp('cre', c.cid) };
    },
  },
  {
    name: 'creature_reserve',
    description: 'On a creature\'s turn: it holds 1 Pulse Point in Reserve. The Engine will then Deflect the next attack against it this Cycle (+4 to its Membrane Threshold). Open to Standards, Elites and swarm clusters. Say aloud that it is holding something back.',
    parameters: obj({ creature: S('Creature id.') }, ['creature']),
    run(a, T) {
      const c = findCre(T.state, a.creature);
      if (!c) return noCre(a.creature);
      const no = T.do({ type: 'creature.act', cid: c.cid, what: 'Reserve', cost: 1 });
      return no ? { refused: no } : { holding_reserve: c.name, pulse_points_left: T.pp('cre', c.cid) };
    },
  },
  {
    name: 'end_creature_turn',
    description: 'End a creature\'s turn. The Engine moves to whoever acts next and tells you who.',
    parameters: obj({ creature: S('Creature id.') }, ['creature']),
    run(a, T) {
      const c = findCre(T.state, a.creature);
      if (!c) return noCre(a.creature);
      const no = T.do({ type: 'turn.end', cid: c.cid });
      return no ? { refused: no } : T.fightBrief();
    },
  },
  {
    name: 'hazard_damage',
    description: 'A printed hazard or a Cost hurts an organism. Soak applies. Use the damage printed in the site notes.',
    parameters: obj({ organism: S('Organism id.'), amount: I('Printed damage.'), type: S('Damage type, for example Kinetic or Lytic.'), why: S('What caused it.') }, ['organism', 'amount', 'why']),
    run(a, T) {
      const o = findOrg(T.state, a.organism);
      if (!o) return noOrg(a.organism);
      const amount = Math.trunc(Number(a.amount));
      if (!(amount >= 1 && amount <= 20)) return { refused: 'Hazard damage is between 1 and 20: use the printed number.' };
      const no = T.do({ type: 'damage', target: { kind: 'org', id: o.id }, amount, dtype: a.type || '' });
      if (no) return { refused: no };
      const t = T.state.organisms[o.id];
      return { organism: t.name, mi: `${t.mi}/${t.miMax}`, dormant: t.dormant };
    },
  },
  {
    name: 'set_condition',
    description: 'Put a printed condition on an organism or a creature, or take it off.',
    parameters: obj({ target: S('Organism id or creature id.'), condition: S('The condition.', { enum: Object.keys(R.CONDITIONS) }), on: B('True to apply, false to remove.') }, ['target', 'condition', 'on']),
    run(a, T) {
      const o = findOrg(T.state, a.target);
      const c = o ? null : findCre(T.state, a.target);
      if (!o && !c) return { refused: `Nothing called "${a.target}" is here.` };
      const no = T.do({ type: 'condition', target: o ? { kind: 'org', id: o.id } : { kind: 'cre', id: c.cid }, name: a.condition, on: a.on !== false });
      return no ? { refused: no } : { done: true };
    },
  },
  {
    name: 'move_clock',
    description: 'Advance or rewind CARCASS, TOLL or HUNGER by one segment, for a reason printed in the notes. Never because a roll failed. Each Clock may advance at most once per session.',
    parameters: obj({ clock: S('Which Clock.', { enum: ['CARCASS', 'TOLL', 'HUNGER'] }), change: I('+1 to advance, -1 to rewind.'), why: S('The reason, said to the table.') }, ['clock', 'change', 'why']),
    run(a, T) {
      const d = Math.trunc(Number(a.change));
      if (d !== 1 && d !== -1) return { refused: 'A Clock moves one segment at a time: +1 or -1.' };
      const no = T.do({ type: 'clock', id: a.clock, delta: d, why: a.why, by: 'ai' });
      if (no) return { refused: no };
      const c = T.state.clocks[a.clock];
      return { clock: c.name, now: `${c.filled}/${c.segments}` };
    },
  },
  {
    name: 'award',
    description: 'Pay Codon or Substrate printed in the site notes ("Pays"), to every organism in play or to named ones.',
    parameters: obj({ codon: { type: 'number', description: 'Codon each.' }, substrate: I('Substrate (S) each.'), why: S('What it is for, as printed.'), organisms: { type: 'array', items: { type: 'string' }, description: 'Organism ids. Leave out for everyone.' } }, ['why']),
    run(a, T) {
      const codon = Number(a.codon) || 0;
      const sub = Math.trunc(Number(a.substrate) || 0);
      if (codon < 0 || codon > 25 || sub < 0 || sub > 120) return { refused: 'An award is at most 25 Codon and 120 S each: use the numbers printed under Pays.' };
      if (!codon && !sub) return { refused: 'Give a Codon or Substrate amount.' };
      const ids = (a.organisms || []).map((r) => findOrg(T.state, r)).filter(Boolean).map((o) => o.id);
      const no = T.do({ type: 'award', codon, substrate: sub, why: a.why, organismIds: ids });
      return no ? { refused: no } : { paid: true };
    },
  },
  {
    name: 'rest',
    description: 'The Cohort takes a Reconstitution: about an hour. Full ATP, Stress cleared, some MI healed. In this Vector it costs a CARCASS segment: say so before they choose.',
    parameters: obj({}),
    run(a, T) {
      const no = T.do({ type: 'rest' });
      return no ? { refused: no } : { rested: true, carcass: `${T.state.clocks.CARCASS.filled}/${T.state.clocks.CARCASS.segments}` };
    },
  },
  {
    name: 'change_site',
    description: 'The Cohort leaves by an exit and arrives at the next site. Only the sites directly before and after the current one can be reached. Your next briefing will carry the new site\'s notes: end your turn after calling this with one sentence of travel, and open the new scene next turn.',
    parameters: obj({ site: S('The site id, for example "soft-field".') }, ['site']),
    run(a, T) {
      const here = T.site();
      const to = T.scenario.sites.find((x) => x.id === lower(a.site));
      if (!to) return { refused: `No site "${a.site}". Sites: ${T.scenario.sites.map((x) => x.id).join(', ')}.` };
      if (Math.abs(to.n - here.n) !== 1) return { refused: `${to.name} cannot be reached from ${here.name} in one step.` };
      const no = T.do({ type: 'scene.set', siteId: to.id });
      return no ? { refused: no } : { arrived_at: to.name, note: 'End your turn now. The new site\'s notes come with your next briefing.' };
    },
  },
];

// ---- running a tool against a sandbox copy of the Ledger -------------------------
export function toolbox({ state, scenario, bestiary, rng, now }) {
  // The Director acts as the host, but the Engine must know it is the Director (ai: true).
  const ctx = { role: 'host', pid: null, rng, now, scenario, bestiary, ai: true };
  const T = {
    state,
    scenario,
    refusals: 0,
    do(action) {
      try {
        T.state = apply(T.state, action, ctx);
        return null;
      } catch (e) {
        if (e instanceof RuleError || /dice|die/i.test(e.message)) return e.message;
        throw e;
      }
    },
    site: () => scenario.sites.find((x) => x.id === T.state.scene.siteId) || scenario.sites[0],
    pp(kind, id) {
      const a = T.state.fight && T.state.fight.actors[`${kind}:${id}`];
      return a ? a.pp : 0;
    },
    fightBrief() {
      const f = T.state.fight;
      if (!f) return { pulse_war: 'over' };
      const nm = (k) => { const a = f.actors[k]; return (a.kind === 'org' ? T.state.organisms[a.id] : T.state.creatures[a.id]).name; };
      const cur = f.turn ? f.actors[f.turn] : null;
      return {
        cycle: f.cycle,
        order: f.order.map(nm),
        acting_now: cur ? nm(f.turn) : 'nobody: waiting on those holding Pulse Points',
        acting_is: cur ? (cur.kind === 'org' ? 'a player: describe the moment and ask what they do' : 'a creature: act for it') : '',
      };
    },
    run(name, args) {
      const tool = TOOLS.find((t) => t.name === name);
      if (!tool) { T.refusals += 1; return { refused: `There is no tool called "${name}".` }; }
      let out;
      try { out = tool.run(args || {}, T); } catch (e) { out = { refused: `That could not be done: ${e.message}` }; }
      if (out && out.refused) T.refusals += 1;
      return out;
    },
  };
  return T;
}

export { orgMT };
