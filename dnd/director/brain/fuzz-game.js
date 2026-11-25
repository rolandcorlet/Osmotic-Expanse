// Games to fuzz the tools on when no bench has been recorded: the Lantern's mill road, before and during
// the scouts' fight (with one hero down), and the Ashen Crown's bridge in the middle of its ambush.
import { newSession, apply, openAdventure } from '../engine/ledger.js';
import { makeRng } from '../engine/dice.js';
import { completeBuild, pregenBuild } from '../engine/pregen.js';
import { adventureById } from '../data/adventures/index.js';

export function fuzzGame(srd) {
  const out = [];
  const lantern = adventureById('lantern');
  const rng = makeRng(3);
  const ctx = (adventure, role = 'host', pid = null) => ({ role, pid, rng, now: 1, adventure, srd });
  let s = { ...newSession(lantern), auto: { rules: true, scale: 'off' } };
  for (const [pid, cls] of [['p1', 'fighter'], ['p2', 'cleric']]) {
    s = apply(s, { type: 'join', name: pid }, ctx(lantern, 'player', pid));
    s = apply(s, { type: 'pc.create', input: completeBuild({ class: cls, race: 'human', level: 2, name: cls === 'fighter' ? 'Bryn' : 'Ila' }, srd, () => 0.3) }, ctx(lantern, 'player', pid));
  }
  s.started = true;
  s = apply(s, { type: 'site.move', siteId: 'mill-road' }, ctx(lantern));
  out.push({ s, adventure: lantern });
  s = apply(s, { type: 'fight.start', autoRoll: true }, ctx(lantern));
  const ila = Object.values(s.pcs).find((p) => p.name === 'Ila');
  s = apply(s, { type: 'damage', target: `pc:${ila.id}`, amount: ila.hp }, ctx(lantern));
  out.push({ s, adventure: lantern });
  const ashen = adventureById('ashen-crown');
  let a = openAdventure(newSession(ashen), ashen, ctx(ashen));
  a = apply(a, { type: 'join', name: 'p1' }, ctx(ashen, 'player', 'p1'));
  a = apply(a, { type: 'pc.create', input: pregenBuild('bram', srd, 3, ashen.pregens) }, ctx(ashen, 'player', 'p1'));
  a = apply(a, { type: 'rules.run', starting: true }, ctx(ashen));
  out.push({ s: a, adventure: ashen });
  return out;
}
