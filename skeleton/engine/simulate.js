// The fight simulation: for each place with creatures, the pregenerated characters walk in, the fight starts,
// and both sides play simply, with the actions the game gives a turn (each character attacks the weakest
// creature it can see with its first weapon; each creature attacks a random standing character), many times over. It says how
// often the party wins, is wiped out, or loses someone, before any model time is spent on a bench.
//   simulatePlace({ mod, adventure, siteId, heroes, runs, seed }) -> { site, runs, won, wiped, anyDown, rounds }
//   simulateAdventure({ mod, adventure, heroes, runs, seed }) -> [ one per place with creatures ]
//   simText(results) -> { text, problems, warnings }   (WIPE: wiped more than 1 in 10; RISKY: someone down more than half)
// Browser-safe, no state.
import { newSession, apply, currentKey } from './ledger.js';
import { makeRng } from './dice.js';

function playOnce({ mod, adventure, siteId, heroes, seed }) {
  const rng = makeRng(seed);
  let now = 1;
  const ctx = (role, pid) => ({ role, pid, rng, now: (now += 1), mod });
  let s = newSession(mod, adventure.id);
  const tryAct = (role, pid, a) => { try { s = apply(s, a, ctx(role, pid)); return true; } catch (e) { return false; } };
  for (let i = 0; i < heroes; i++) {
    const pid = `p${i + 1}`;
    tryAct('player', pid, { type: 'join', name: `Player ${i + 1}` });
    tryAct('player', pid, { type: 'char.pregen', index: i % Math.max(1, (mod.handbook.pregens || []).length) });
  }
  if (s.scene.siteId !== siteId && !tryAct('host', null, { type: 'site.move', siteId })) return null;
  if (!s.fight && !tryAct('host', null, { type: 'fight.start' })) return null;
  const chars = () => Object.values(s.chars);
  const acts = Math.max(1, Number((mod.rules.combat || {}).actionsPerTurn) || 1);
  let anyDown = false;
  for (let guard = 0; s.fight && guard < 400 && s.fight.round <= 20; guard++) {
    const key = currentKey(s);
    const [kind, id] = (key || ':').split(':');
    if (kind === 'char') {
      const ch = s.chars[id];
      const pid = Object.keys(s.players).find((p) => s.players[p].charId === id);
      const foe = Object.values(s.creatures).filter((k) => k.siteId === siteId && !k.down && !k.hidden).sort((a, b) => a.health - b.health)[0];
      if (!foe) break;
      // As many attacks as the game gives a turn (rules.combat.actionsPerTurn), at the weakest still standing.
      for (let n = 0; n < acts && ch && !ch.down; n++) {
        const f = Object.values(s.creatures).filter((k) => k.siteId === siteId && !k.down && !k.hidden).sort((a, b) => a.health - b.health)[0];
        if (!f || !tryAct('player', pid, { type: 'attack', charId: id, target: `creature:${f.id}` })) break;
      }
    } else if (kind === 'creature') {
      const k = s.creatures[id];
      const b = mod.ix.creature[k.base] || { attacks: [] };
      for (let n = 0; n < acts && (b.attacks || []).length; n++) {
        const atk = b.attacks[n % b.attacks.length];
        const up = chars().filter((c) => !c.down);
        if (!up.length) break;
        const t = up[Math.floor(rng() * up.length)];
        tryAct('host', null, { type: 'creature.act', creature: k.id, attack: atk.name, target: `char:${t.id}` });
      }
    }
    if (chars().some((c) => c.down)) anyDown = true;
    if (!chars().some((c) => !c.down)) return { won: false, wiped: true, anyDown: true, rounds: s.fight ? s.fight.round : 0 };
    if (!Object.values(s.creatures).some((k) => k.siteId === siteId && !k.down && !k.hidden)) return { won: true, wiped: false, anyDown, rounds: s.fight ? s.fight.round : 0 };
    if (s.fight) tryAct('host', null, { type: 'fight.next' });
  }
  const standing = Object.values(s.creatures).some((k) => k.siteId === siteId && !k.down);
  return { won: !standing, wiped: false, anyDown, rounds: s.fight ? s.fight.round : 0, timedOut: !!s.fight };
}

export function simulatePlace({ mod, adventure, siteId, heroes = 2, runs = 40, seed = 1 }) {
  const out = { site: siteId, heroes, runs: 0, won: 0, wiped: 0, anyDown: 0, rounds: 0, timedOut: 0 };
  for (let k = 0; k < runs; k++) {
    const r = playOnce({ mod, adventure, siteId, heroes, seed: seed * 1000 + k });
    if (!r) continue;
    out.runs += 1; out.won += r.won ? 1 : 0; out.wiped += r.wiped ? 1 : 0; out.anyDown += r.anyDown ? 1 : 0; out.rounds += r.rounds; out.timedOut += r.timedOut ? 1 : 0;
  }
  out.rounds = out.runs ? Math.round((out.rounds / out.runs) * 10) / 10 : 0;
  return out;
}
export function simulateAdventure({ mod, adventure, heroes = 2, runs = 40, seed = 1 }) {
  return (adventure.sites || []).filter((x) => (x.creatures || []).length).map((x) => simulatePlace({ mod, adventure, siteId: x.id, heroes, runs, seed }));
}
export function simText(results) {
  const pct = (n, of) => `${Math.round((100 * n) / Math.max(1, of))}%`;
  let problems = 0; let warnings = 0;
  const lines = results.map((r) => {
    if (!r.runs) { problems += 1; return `  ????  ${r.site.padEnd(16)} the fight could not be played (nothing to fight, or the place cannot be reached)`; }
    const bad = r.wiped / r.runs > 0.1; const warn = !bad && r.anyDown / r.runs > 0.5;
    if (bad) problems += 1; if (warn) warnings += 1;
    return `  ${bad ? 'WIPE ' : warn ? 'RISKY' : 'ok   '} ${r.site.padEnd(16)} ${r.heroes} characters: won ${pct(r.won, r.runs)}, party wiped ${pct(r.wiped, r.runs)}, someone down ${pct(r.anyDown, r.runs)}, ${r.rounds} rounds${r.timedOut ? `, ${r.timedOut} not over in 20 rounds` : ''}.`;
  });
  return { text: lines.join('\n'), problems, warnings };
}
