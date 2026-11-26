// An adventure rule that brings monsters in ("do: add"): The Ashen Crown's final battle, where Lord Malakor
// Vane falls and the Avatar of the Ash-King rises in his place (it was only in the notes before, 26 Nov).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeRng } from '../engine/dice.js';
import { newSession, apply } from '../engine/ledger.js';
import { ADVENTURES, adventureById } from '../data/adventures/index.js';
import { prepareSrd } from '../engine/library.js';
import * as TRIG from '../engine/triggers.js';

const srd = JSON.parse(readFileSync(new URL('../../data/srd.engine.json', import.meta.url), 'utf8'));
prepareSrd(srd, { adventures: ADVENTURES, libraryFile: null });
const adv = adventureById('ashen-crown');

test('when Malakor falls, the Avatar of the Ash-King rises and joins the fight', () => {
  const rng = makeRng(4);
  const ctx = (role, pid) => ({ role, pid, rng, now: 1, adventure: adv, srd });
  let s = { ...newSession(adv), auto: { rules: true, scale: 'off' } };
  const host = (a) => { s = apply(s, a, ctx('host', null)); };
  s = apply(s, { type: 'join', name: 'Roly' }, ctx('player', 'p1'));
  s = apply(s, { type: 'pc.create', input: { name: 'Bryn', race: 'human', class: 'fighter', level: 10, method: 'standard', base: { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 }, skills: ['athletics', 'perception'], background: 'soldier' } }, ctx('player', 'p1'));
  s.started = true;
  s.scene.siteId = 'coronation';
  host({ type: 'foe.add', monster: 'ac-malakor', count: 1, name: 'Lord Malakor Vane' });
  host({ type: 'fight.start', autoRoll: true });
  const m = Object.values(s.foes).find((f) => f.name.startsWith('Lord Malakor'));
  host({ type: 'damage', target: `foe:${m.id}`, amount: 999, damageType: 'force', why: 'test' });
  const av = Object.values(s.foes).find((f) => f.mid === 'ac-ash-avatar');
  assert.ok(av && !av.dead && !av.hidden, 'the Avatar is here');
  assert.ok(s.fight && s.fight.order.some((o) => o.key === `foe:${av.id}`), 'and in the fight');
});

test('an add rule must name a monster that exists', () => {
  const bad = { id: 'x', sites: [{ id: 'a', name: 'A', rules: [{ id: 'r', when: 'enter', do: 'add', monster: 'no-such-beast' }] }] };
  const { errors } = TRIG.checkRules(bad, { monsters: ['goblin'] });
  assert.ok(errors.some((e) => /no monster "no-such-beast"/.test(e)), errors.join('\n'));
  assert.equal(TRIG.checkRules({ ...bad, sites: [{ ...bad.sites[0], rules: [{ id: 'r', when: 'enter', do: 'add', monster: 'goblin' }] }] }, { monsters: ['goblin'] }).errors.length, 0);
});
