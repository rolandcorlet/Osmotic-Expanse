// The Catalytic Engine in code. Every number the game uses is worked out here,
// so the Director (human or AI) never does arithmetic. Section cites are to the
// Core Rulebook unless marked.

// ---- §1.2 Threshold ladder -------------------------------------------------
export const LADDER = [
  { at: 8, name: 'Common', who: 'any adult organism with the pathway' },
  { at: 12, name: 'Standard', who: 'a competent specialist' },
  { at: 16, name: 'Severe', who: "a colony's best" },
  { at: 20, name: 'Extreme', who: 'a Hegemony institution' },
  { at: 24, name: 'Nucleoid', who: 'something written into the Sacred Code' },
  { at: 28, name: 'Apotheotic', who: 'one organism per generation' },
];

export const BASELINES = ['VSC', 'DFF', 'RTC', 'OSM', 'AFF'];

export const PATHWAYS = [
  'Membrane Penetration', 'Pressure Tolerance', 'Fluid Navigation', 'Concealment',
  'Catalysis', 'Synthesis', 'Sequence Reading', 'Chemoreception',
  'Signal Discourse', 'Symbiosis', 'Vigour', 'Pulse Discipline',
];

// ---- §4.2 The Action Matrix --------------------------------------------------
export const ACTIONS = {
  drift: { cost: 1, name: 'Drift', does: 'Move up to your Flow. Also: stand, draw a graft, pass a Vial.' },
  vent: { cost: 1, name: 'Vent', does: 'Reduce your Stress by 2. Costs 2 ATP.' },
  sense: { cost: 1, name: 'Sense', does: 'OSM + Chemoreception against hidden things.' },
  strike: { cost: 2, name: 'Strike', does: 'One attack. Heavy Apparatus cost 1 more.' },
  synthesise: { cost: 2, name: 'Synthesise', does: 'Apply a Vial, seal a pore, repair, set a trap.' },
  burst: { cost: 3, name: 'Burst', does: 'Activate an Enzymatic Burst (3 to 5 PP, and that much ATP).' },
  reserve: { cost: 1, name: 'Reserve', does: 'Hold one PP for a Reactive Osmosis or an Inhibition.' },
};

// ---- §4.10 Reactive Osmosis --------------------------------------------------
export const REACTIONS = {
  deflect: { name: 'Deflect', does: 'Your MT against one incoming attack is +4.' },
  inhibit: { name: 'Inhibit', does: 'The attacker rolls 2 fewer dice (3 ATP).' },
  brace: { name: 'Brace', does: 'Halve Osmotic and Kinetic damage from one effect; ignore the push.' },
  shed: { name: 'Shed', does: 'End one condition that a Reactive Osmosis can end (Locked, Turgid, Marked).' },
};

// ---- §4.4 Bands --------------------------------------------------------------
export const BANDS = [
  { id: 'contact', name: 'Contact', min: 0, max: 0, reach: 'touch, lash, engulf' },
  { id: 'near', name: 'Near', min: 1, max: 3, reach: 'short lash, thrown spore' },
  { id: 'mid', name: 'Mid', min: 4, max: 9, reach: 'projector, spray, lunge' },
  { id: 'far', name: 'Far', min: 10, max: 20, reach: 'arc, torrent, cascade' },
  { id: 'loose', name: 'Loose', min: 21, max: Infinity, reach: 'out of reach' },
];

export function bandOf(drifts) {
  return BANDS.find((b) => drifts >= b.min && drifts <= b.max) || BANDS[BANDS.length - 1];
}

// ---- §4.7 Conditions (only the parts the Engine applies by itself) -----------
export const CONDITIONS = {
  Leaking: { effect: 'Lose 1 MI at the start of your turn; your wake is trackable.', ends: 'a Synthesise action or Somatic Burst' },
  Turgid: { effect: 'Swollen: -2 DFF, MT -2, +5 temporary MI.', ends: 'tonic normalises, or a 1-PP Vent', mt: -2 },
  Flaccid: { effect: 'Shrunken: -2 VSC, reach -1 band.', ends: 'end of next Cycle', timed: true },
  Jostled: { effect: '-1 PP; MT -2.', ends: 'end of next Cycle', timed: true, pp: -1, mt: -2 },
  Denatured: { effect: '-2 RTC; Burst Effect Values halve.', ends: 'an RTC save at end of your turn' },
  Catabolic: { effect: 'ATP costs +1 for everything; ATP regen halved.', ends: 'a Reconstitution', atpCost: 1 },
  Locked: { effect: 'Cannot begin a Burst or use a class Burst feature.', ends: 'a save each Cycle, or a Reactive Osmosis' },
  Sequestered: { effect: 'Enclosed: cannot act.', ends: 'an ally breaks the cage, or a VSC save at -2 each Cycle' },
  Hijacked: { effect: 'An enemy may spend your held Reserve on their action.', ends: 'an OSM save, or the hijacker is killed or revealed' },
  Masked: { effect: 'Cannot be targeted by scent, OSM or tracking.', ends: 'you Strike, or an enemy Senses you' },
  Marked: { effect: 'All attackers gain +2 dice against you; you cannot gain Masked.', ends: 'the marker is killed, or a 2-ATP scrub', attackersDice: 2 },
  Brittle: { effect: 'Graft soak halves against Kinetic; Lytic ignores 2 soak.', ends: 'a Synthesise action with a Lipid patch' },
  Overclocked: { effect: '+1 PP, but mark 2 Stress at the end of each Cycle.', ends: 'you Vent, or 3 Cycles pass', pp: 1 },
  Encysted: { effect: 'Take half damage, cannot act, cannot be moved.', ends: '3 ATP to crack the cyst' },
  Bloom: { effect: 'Regenerate 2 MI per Cycle; everything in Mid or closer can sense you.', ends: 'a Reconstitution, or a hostile scrub' },
  Lodged: { effect: 'An Apparatus is stuck in you: -1 DFF. Removing it deals 4 damage.', ends: 'a Synthesise action' },
  Braced: { effect: 'Set and not moving. Some creatures gain soak while braced.', ends: 'you Drift' },
};

// ---- §5.8 Metabolic Stress ---------------------------------------------------
export const STRESS_MAX = 8;

export function stressPenalty(stress) {
  if (stress >= 6) return -3;
  if (stress >= 5) return -2;
  if (stress >= 3) return -1;
  return 0;
}

export function stressNote(stress) {
  if (stress >= 7) return '-3 dice; ATP costs +1; a failed roll triggers the Cascade table';
  if (stress >= 6) return '-3 dice; ATP costs +1';
  if (stress >= 5) return '-2 dice';
  if (stress >= 3) return '-1 die';
  return 'no effect yet';
}

// Mark n Stress one at a time. At 8 the organism suffers Autophagic Collapse:
// 2 Lysis Countdown boxes and Stress drops to 5 (§5.8).
export function markStress(stress, n) {
  let s = stress;
  let collapses = 0;
  for (let i = 0; i < n; i++) {
    s += 1;
    if (s >= STRESS_MAX) {
      collapses += 1;
      s = 5;
    }
  }
  return { stress: s, collapses, countdownMarks: collapses * 2 };
}

export const CASCADE = [
  null,
  { name: 'Spill', effect: 'Lose 1d6 ATP; your next Burst this scene costs +2 ATP.' },
  { name: 'Seizure', effect: 'Lose all remaining PP this Cycle; no Reserve until your next turn.' },
  { name: 'Misfire', effect: 'The failed action resolves anyway, at half value, against you or the nearest ally.' },
  { name: 'Flare', effect: 'You are Marked until the end of the next Cycle and cannot use Concealment this scene.' },
  { name: 'Tear', effect: 'Take 1d6 damage that ignores Soak, and gain Leaking.' },
  { name: 'Runaway Inhibition', effect: 'Mark 1 more Stress (at 8, Autophagic Collapse follows).' },
];

// ---- §1.1 and §1.3 Building a pool -------------------------------------------
// mods is a list of { label, dice }. Stress is applied here as the "Injured" row
// of §1.3, so it sits inside the +5 / -5 cap with the other modifiers.
export const MOD_CAP = 5;

export function buildPool({ baseline = 0, pathway = 0, mods = [], stress = 0, fixed = null } = {}) {
  const parts = [];
  if (fixed != null) {
    parts.push({ label: 'Printed pool', dice: fixed });
  } else {
    parts.push({ label: 'Baseline', dice: baseline });
    if (pathway) parts.push({ label: 'Pathway', dice: pathway });
  }
  const list = mods.filter((m) => m && m.dice).map((m) => {
    const out = { label: m.label || 'Modifier', dice: Number(m.dice) };
    if (m.uncapped) out.uncapped = true; // bought dice (Overdrive, CORE 1.8) are not situational modifiers
    return out;
  });
  const sp = stressPenalty(stress);
  if (sp) list.push({ label: `Stress ${stress}`, dice: sp });
  const raw = list.filter((m) => !m.uncapped).reduce((a, m) => a + m.dice, 0);
  const bought = list.filter((m) => m.uncapped).reduce((a, m) => a + m.dice, 0);
  const applied = Math.max(-MOD_CAP, Math.min(MOD_CAP, raw));
  const base = fixed != null ? fixed : baseline + pathway;
  const dice = Math.max(0, base + applied + bought);
  return { dice, base, mods: list, modsRaw: raw, modsApplied: applied, capped: raw !== applied, parts: parts.concat(list) };
}

// §1.6 Homeostatic Baseline: pool x 3, used when unopposed and unhurried.
export function homeostatic(poolDice) {
  return poolDice * 3;
}

// ---- §1.1 Reading the dice ---------------------------------------------------
export function readRoll(dice, at = null) {
  const inhibitors = dice.filter((d) => d === 1).length;
  const sixes = dice.filter((d) => d === 6).length;
  const total = dice.reduce((a, d) => a + (d === 1 ? 0 : d), 0);
  const runaway = inhibitors === 0 && sixes >= 2;
  const out = { dice: dice.slice(), inhibitors, sixes, total, runaway, stress: inhibitors };
  if (at != null) {
    out.at = at;
    out.success = total >= at;
    out.overflow = out.success ? total - at : 0;
    out.shortBy = out.success ? 0 : at - total;
  }
  return out;
}

// ---- §1.5 Contested reactions ------------------------------------------------
// The higher total wins; ties go to the defender.
export function contest(actorTotal, defenderTotal) {
  const actorWins = actorTotal > defenderTotal;
  return { winner: actorWins ? 'actor' : 'defender', overflow: Math.abs(actorTotal - defenderTotal), tie: actorTotal === defenderTotal };
}

// ---- §4.1 Detection Phase and Frequency --------------------------------------
// Whoever wins by 4 or more gains the First Volley. A tie startles both sides.
export function detection(sideA, sideB) {
  const diff = sideA - sideB;
  if (diff === 0) return { firstVolley: null, startled: true, diff };
  if (diff >= 4) return { firstVolley: 'A', startled: false, diff };
  if (diff <= -4) return { firstVolley: 'B', startled: false, diff };
  return { firstVolley: null, startled: false, diff };
}

// Highest acts first. Ties: more unspent PP, then higher OSM, then players.
export function frequencyOrder(entries) {
  return entries.slice().sort((a, b) =>
    (b.freq - a.freq) || ((b.pp || 0) - (a.pp || 0)) || ((b.osm || 0) - (a.osm || 0)) || ((b.player ? 1 : 0) - (a.player ? 1 : 0)));
}

// ---- Derived numbers ---------------------------------------------------------
export const pulsePoints = (dff, mod = 0) => Math.max(0, 2 + dff + mod); // §4.2
export const membraneThreshold = (dff, mod = 0) => 10 + dff + mod; // §4.8
export const flow = (dff) => 3 + dff; // §4.2
export const maxMI = (vsc, hull, level = 1) => 12 + vsc * 4 + hull + 2 * (level - 1); // §5.1
export const countdownBoxes = (vsc, hull) => vsc + Math.ceil(hull / 2) + 2; // §5.5
export const bulk = (vsc) => vsc * 5;
export const harvestAT = (tier) => tier * 4 + 8;
export const hazardNumbers = (tier) => ({ damage: 4 + 2 * tier, save: 8 + 2 * tier });
export const stabiliseAT = (level) => 12 + level; // §5.4

// ---- §4.8 Attacks and damage -------------------------------------------------
// DAMAGE = Overflow + Effect Value + BD - Soak, minimum 1. A Runaway counts the
// Effect Value twice, before soak. A Flank Breach strike is at +1 Overflow (§4.11).
// Brace (§4.10) halves Kinetic and Osmotic damage; the Engine halves after soak
// and rounds down, never below 1.
export function damage({ overflow, bd = 0, effectValue = 0, soak = 0, runaway = false, flank = false, braced = false, type = '' }) {
  const of = overflow + (flank ? 1 : 0);
  const ev = runaway ? effectValue * 2 : effectValue;
  let dmg = Math.max(1, of + ev + bd - soak);
  const t = String(type).toLowerCase();
  if (braced && (t === 'kinetic' || t === 'osmotic')) dmg = Math.max(1, Math.floor(dmg / 2));
  return dmg;
}

// §4.13 A hit on a swarm removes Segments instead of MI.
export function segmentsRemoved(overflow) {
  return Math.ceil(overflow / 3) + 1;
}

// §5.2 and §5.4: apply damage to a body. A hit that exceeds remaining MI by 8 or
// more is a Breach: straight to Dormancy with a Countdown box marked at once.
export function applyDamage(mi, dmg) {
  const breach = dmg - mi >= 8;
  const left = Math.max(0, mi - dmg);
  return { mi: left, dormant: left === 0, breach, countdownMarks: breach ? 1 : 0 };
}

// §5.8 ATP costs rise by 1 at Stress 6 or more, and while Catabolic.
export function atpCost(base, { stress = 0, conditions = [] } = {}) {
  let c = base;
  if (stress >= 6) c += 1;
  if (conditions.includes('Catabolic')) c += 1;
  return c;
}

// §5.10 Reconstitution: full ATP, all Stress cleared, heal VSC + Hull.
export function reconstitute({ mi, miMax, atpMax, vsc, hull }) {
  return { mi: Math.min(miMax, mi + vsc + hull), atp: atpMax, stress: 0, healed: Math.min(miMax, mi + vsc + hull) - mi };
}

// Name the nearest ladder rung for a Threshold, for display.
export function thresholdName(at) {
  const rung = LADDER.find((r) => r.at === at);
  return rung ? rung.name : '';
}
