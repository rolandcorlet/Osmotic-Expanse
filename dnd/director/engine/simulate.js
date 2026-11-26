// A quick simulation of an adventure's fights, through the real Engine, before any GPU time is spent.
// Scripted heroes walk to a place, its fight is fitted to them and started, and both sides play simply:
// heroes hit the weakest foe they can see, a cleric heals a friend who is down, a dying hero rolls death
// saves; monsters hit a hero who is still standing with their weapons. The adventure's rules run as in
// play (foes flee, the fight ends by itself). Each fight is played many times. A fight that wipes the
// party, or downs someone most of the time, shows up here in seconds, not hours into a bench.
//
//   simulatePlace({ adventure, srd, siteId, party, runs, seed, scale }) -> { site, party, runs, won, wiped,
//     anyDown, deaths, rounds, fitted, foes }
//   simulateAdventure({ adventure, srd, party, runs, seed, scale }) -> [ ...one per place with a fight ]
//   partyOf('fighter:3,cleric:3') -> [{ cls: 'fighter', level: 3 }, ...]
//
// Browser-safe: no files, no network. Monsters' spells, recharges and special traits are not played (a
// spellcaster swings its weapon), so read the result as a guide, not a verdict.

import { newSession, apply, openAdventure } from './ledger.js';
import { makeRng } from './dice.js';
import { completeBuild } from './pregen.js';
import * as R from './rules.js';
import * as SCALE from './scale.js';

const CLASSES = ['fighter', 'cleric', 'rogue', 'wizard', 'ranger', 'paladin'];

// "fighter:3,cleric:3", "3x2" (two of 3rd level), "4" (four of the place's own level) or nothing.
export function partyOf(text, level = 1) {
  const t = String(text || '').trim();
  if (!t) return null;
  const many = /^(\d+)\s*x\s*(\d+)$/i.exec(t);
  if (many) return Array.from({ length: Number(many[2]) }, (_, n) => ({ cls: CLASSES[n % CLASSES.length], level: Number(many[1]) }));
  if (/^\d+$/.test(t)) return Array.from({ length: Number(t) }, (_, n) => ({ cls: CLASSES[n % CLASSES.length], level: null }));
  return t.split(',').map((x) => x.trim()).filter(Boolean).map((x) => { const [cls, lv] = x.split(':'); return { cls: cls.toLowerCase(), level: Number(lv) || level }; });
}

// The simulated heroes choose their spells from the SRD alone, so a place's numbers mean the same with or
// without a private book library (its extra spells changed the wizard's picks and the verdicts: 26 Nov).
const srdOnly = new WeakMap();
function heroBook(srd) {
  if (!srd.spells.some((x) => x.lib)) return srd;
  if (!srdOnly.has(srd)) srdOnly.set(srd, { ...srd, spells: srd.spells.filter((x) => !x.lib) });
  return srdOnly.get(srd);
}
function build(srd, { cls, level }, n, rand) {
  const input = completeBuild({ class: cls, race: 'human', level, name: `${cls[0].toUpperCase()}${cls.slice(1)} ${n + 1}` }, heroBook(srd), rand);
  return { ...input, name: `${cls[0].toUpperCase()}${cls.slice(1)} ${n + 1}` };
}

// One fight, played once. Returns how it went.
function playOnce({ adventure, srd, siteId, party, seed, scale }) {
  const rng = makeRng(seed);
  let n = 0;
  const rand = () => ((n = (n * 9301 + 49297 + seed) % 233280) / 233280);
  const ctx = (role, pid, extra = {}) => ({ role, pid, rng, now: 1, adventure, srd, ...extra });
  let s = openAdventure({ ...newSession(adventure), auto: { rules: true, scale } }, adventure, ctx('host', null));
  const host = (a) => { s = apply(s, a, ctx('host', null)); };
  const tryHost = (a) => { try { host(a); return true; } catch (e) { return false; } };
  party.forEach((p, i) => { host({ type: 'pc.create', input: build(srd, p, i, rand) }); });
  s.started = true;
  if (s.scene.siteId !== siteId) host({ type: 'site.move', siteId });
  const placed = Object.values(s.foes).filter((f) => f.siteId === siteId);
  if (!placed.length) return null;
  const fitted = ((s.fits || {})[siteId] || {}).text || '';
  // A place whose own rule starts the fight on arrival ("enter: fight") has it on already.
  if (!s.fight && !tryHost({ type: 'fight.start', autoRoll: true })) return null;
  if (s.fight && s.fight.phase === 'initiative') tryHost({ type: 'fight.begin' });
  const pcs = () => Object.values(s.pcs);
  const up = (p) => !p.dead && p.hp > 0;
  let anyDown = false;
  let guard = 0;
  let round = 1;
  while (s.fight && guard++ < 400 && s.fight.round <= 20) {
    round = s.fight.round;
    // Rolls asked of the heroes (saves against a monster): made at once.
    for (const q of s.requests.filter((x) => x.kind !== 'death')) tryHost({ type: 'roll.make', id: q.id });
    if (!s.fight) break;
    const key = s.fight.order[s.fight.turn].key;
    const [kind, id] = key.split(':');
    if (kind === 'pc') {
      const pc = s.pcs[id];
      const death = s.requests.find((q) => q.pcId === id && q.kind === 'death');
      if (death) tryHost({ type: 'roll.make', id: death.id });
      else if (up(pc)) {
        // A prone hero stands (half their movement) before doing anything else.
        if (pc.conds.includes('prone') && !pc.conds.includes('restrained')) tryHost({ type: 'cond.remove', target: `pc:${pc.id}`, cond: 'prone' });
        const down = pcs().find((p) => p.id !== pc.id && !p.dead && p.hp <= 0 && !p.stable);
        const heal = pc.cast && ['healing-word', 'cure-wounds'].find((x) => [...(pc.cast.prepared || []), ...(pc.cast.known || [])].includes(x));
        const slot = pc.cast && pc.cast.slots.findIndex(([m, u]) => m > u);
        if (down && heal && slot >= 0) tryHost({ type: 'spell.cast', pcId: pc.id, spell: heal, level: slot + 1, target: `pc:${down.id}` });
        else {
          const foes = Object.values(s.foes).filter((f) => f.siteId === siteId && !f.dead && !f.hidden && !f.calm); // not the ones out of it
          const foe = foes.sort((a, b) => a.hp - b.hp)[0];
          const atk = (pc.attacks || []).slice().sort((a, b) => (b.hit || 0) - (a.hit || 0))[0];
          const sp = foe && bestSpell(srd, pc);
          if (sp) {
            const area = /sphere|cone|cube|line|cylinder/i.test(String(sp.spell.area || ''));
            const targets = (area ? foes.slice(0, 4) : [foe]).map((f) => `foe:${f.id}`);
            if (!tryHost({ type: 'spell.cast', pcId: pc.id, spell: sp.spell.id, level: sp.level || undefined, targets }) && atk) tryHost({ type: 'attack', pcId: pc.id, attack: atk.id, target: `foe:${foe.id}`, sneak: !!pc.sneak });
          } else if (foe && atk) {
            tryHost({ type: 'attack', pcId: pc.id, attack: atk.id, target: `foe:${foe.id}`, sneak: !!pc.sneak });
            for (let k = 0; k < (pc.extraAttacks || 0) && s.fight && !(s.foes[foe.id] || {}).dead; k++) tryHost({ type: 'attack', pcId: pc.id, attack: atk.id, target: `foe:${foe.id}` });
          }
        }
      }
    } else {
      const foe = s.foes[id];
      const m = R.index(srd).monster[foe.mid] || {};
      // A recharge or limited-use area action (a dragon's breath) whenever it is ready, catching half the
      // heroes standing (rounded up: both of two), as a cone or a line does: the simulation never breathed
      // before, so lone dragons looked tamer than they play (26 Nov).
      const area = (m.actions || []).find((a) => a.dc && (a.dmg || []).length && /^(Recharge|\d+\/day)/i.test(a.use || '') && !(foe.spent || {})[a.n]);
      const standing = pcs().filter(up).sort(() => rng() - 0.5).slice(0, Math.ceil(pcs().filter(up).length / 2));
      if (area && standing.length && tryHost({ type: 'foe.act', foeId: foe.id, action: area.n, targets: standing.map((t) => `pc:${t.id}`) })) {
        for (const q of s.requests.filter((x) => x.kind !== 'death')) tryHost({ type: 'roll.make', id: q.id });
      } else {
        const weapons = (m.actions || []).filter((a) => a.hit != null);
        const plan = multiPlan(m, weapons);
        for (let k = 0; k < plan.length && s.fight; k++) {
          const targets = pcs().filter(up);
          if (!targets.length) break;
          // A random target first, then the others if the stat block rules that one out (a held grapple).
          const first = Math.floor(rng() * targets.length);
          const order = targets.slice(first).concat(targets.slice(0, first));
          for (const t of order) if (tryHost({ type: 'foe.act', foeId: foe.id, action: plan[k].n, target: `pc:${t.id}` })) break;
        }
      }
    }
    if (pcs().some((p) => p.hp <= 0)) anyDown = true;
    if (!pcs().some(up) && pcs().every((p) => p.dead || p.stable || p.hp <= 0)) {
      // Everyone is down: the fight is lost (nobody is left to save anyone).
      return { won: false, wiped: true, anyDown: true, deaths: pcs().filter((p) => p.dead).length, rounds: round, fitted, foes: placed.length };
    }
    if (s.fight) tryHost({ type: 'fight.next' });
  }
  const standing = Object.values(s.foes).some((f) => f.siteId === siteId && !f.dead && !f.calm && !f.hidden);
  return { won: !s.fight && !standing ? true : !standing, wiped: false, anyDown, deaths: pcs().filter((p) => p.dead).length, rounds: round, fitted, foes: Object.values(s.foes).filter((f) => f.siteId === siteId).length, timedOut: !!s.fight };
}

// The attacks of one turn, as the Multiattack line names them ("one with its bite and two with its
// claws": bite, claw, claw); without names, the first weapon that many times.
const COUNT = { one: 1, two: 2, three: 3, four: 4, five: 5 };
export function multiPlan(m, weapons) {
  if (!weapons.length) return [];
  const multi = (m.actions || []).find((a) => /^multiattack$/i.test(a.n || ''));
  if (!multi) return [weapons[0]];
  const d = String(multi.d || '').split(/,?\s+or\s+/i)[0]; // "two with his morningstar, or one with ... and one with ...": the first way
  const plan = [];
  for (const [, n, what] of d.matchAll(/\b(one|two|three|four|five)\s+(?:attacks?\s+)?with\s+(?:its|his|her|their)\s+([\w' -]+?)(?=[,.;]|\s+and\b|$)/gi)) {
    const w = weapons.find((x) => { const a = x.n.toLowerCase(); const b = what.toLowerCase().replace(/s$/, ''); return a === b || a.startsWith(b) || b.startsWith(a); });
    if (w) for (let k = 0; k < COUNT[n.toLowerCase()]; k++) plan.push(w);
  }
  if (plan.length) return plan;
  const times = /\bfive\b/i.test(d) ? 5 : /\bfour\b/i.test(d) ? 4 : /\bthree\b/i.test(d) ? 3 : 2;
  return Array.from({ length: times }, () => weapons[0]);
}

// A caster's best damaging spell now: a slot spell (cast with the highest slot left) while slots last,
// then a damage cantrip for the classes that fight with them. Concentration spells are left out.
const CANTRIP_CLASSES = ['wizard', 'sorcerer', 'warlock', 'bard', 'druid'];
function bestSpell(srd, pc) {
  const c = pc.cast;
  if (!c) return null;
  const ix = R.index(srd);
  const ids = [...new Set([...(c.cantrips || []), c.raceCantrip, ...(c.kind === 'prepared' ? c.prepared || [] : c.known || [])].filter(Boolean))];
  // A spell that harms when it is cast, in an action (not Glyph of Warding's hour, nor a trap or a mishap).
  const hurts = ids.map((id) => ix.spell[id]).filter((sp) => sp && !sp.conc && (sp.dmgSlot || sp.dmgLevel)
    && ['attack', 'save', 'auto'].includes(sp.how) && /^1 (?:action|bonus action)/i.test(String(sp.time || '1 action')));
  const top = c.slots.map(([m, u], n) => (m > u ? n + 1 : 0)).filter(Boolean).pop() || 0;
  const slotted = hurts.filter((sp) => sp.level > 0 && sp.level <= top).sort((a, b) => b.level - a.level)[0];
  if (slotted) return { spell: slotted, level: top };
  const cantrip = hurts.find((sp) => sp.level === 0);
  return cantrip && CANTRIP_CLASSES.includes(pc.cls) ? { spell: cantrip, level: 0 } : null;
}

export function simulatePlace({ adventure, srd, siteId, party, runs = 50, seed = 1, scale = 'auto' }) {
  const out = { site: siteId, party: party.map((p) => `${p.cls} ${p.level}`).join(', '), runs: 0, won: 0, wiped: 0, anyDown: 0, deaths: 0, rounds: 0, timedOut: 0, fitted: '', foes: 0 };
  for (let k = 0; k < runs; k++) {
    let r;
    try { r = playOnce({ adventure, srd, siteId, party, seed: seed * 1000 + k, scale }); } catch (e) { out.error = e.message; break; }
    if (!r) break;
    out.runs += 1;
    if (r.won) out.won += 1;
    if (r.wiped) out.wiped += 1;
    if (r.anyDown) out.anyDown += 1;
    if (r.timedOut) out.timedOut += 1;
    out.deaths += r.deaths;
    out.rounds += r.rounds;
    out.fitted = r.fitted; out.foes = r.foes;
  }
  if (out.runs) out.rounds = Math.round((out.rounds / out.runs) * 10) / 10;
  return out;
}

// Every place with a fight. `party`: a list, or null for the party each place is written for.
export function simulateAdventure({ adventure, srd, party = null, runs = 50, seed = 1, scale = 'auto' }) {
  return (adventure.sites || []).filter((x) => (x.foes || []).length).map((site) => {
    const d = SCALE.designedParty(adventure, site.id);
    const p = party ? party.map((x) => ({ ...x, level: x.level || d.level })) : Array.from({ length: d.size[0] }, (_, n) => ({ cls: CLASSES[n % CLASSES.length], level: d.level }));
    return simulatePlace({ adventure, srd, siteId: site.id, party: p, runs, seed, scale });
  });
}

// A line per place, and a verdict: a wipe in more than one run in ten is a problem; someone down in most runs a warning.
export function simText(results) {
  const lines = [];
  let problems = 0; let warnings = 0;
  for (const r of results) {
    if (!r.runs) { lines.push(`  ${r.site}: not simulated${r.error ? ` (${r.error})` : ''}`); continue; }
    const pct = (x) => `${Math.round((100 * x) / r.runs)}%`;
    const bad = r.wiped / r.runs > 0.1; const warn = !bad && r.anyDown / r.runs > 0.5;
    if (bad) problems += 1; if (warn) warnings += 1;
    lines.push(`  ${bad ? 'WIPE ' : warn ? 'RISKY' : 'ok   '} ${r.site.padEnd(16)} ${r.party}: won ${pct(r.won)}, party wiped ${pct(r.wiped)}, someone down ${pct(r.anyDown)}, ${r.deaths} deaths in ${r.runs} runs, ${r.rounds} rounds${r.timedOut ? `, ${r.timedOut} not over in 20 rounds` : ''}. ${r.foes} foes${r.fitted ? ' (fitted)' : ''}.`);
  }
  return { text: lines.join('\n'), problems, warnings };
}
