// Feats at an Ability Score Improvement level (engine/rules.js): a feat from the rules (the SRD's, or one
// a book added) in place of the +2, its own +1 where it offers one, and what the Engine can do with it.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as R from '../engine/rules.js';
import { srd as base, BASE } from './helpers.js';

const srd = JSON.parse(JSON.stringify(base));
srd.feats.push(
  { id: 'tough', name: 'Tough', desc: 'Your hit point maximum increases by an amount equal to twice your level when you gain this feat.' },
  { id: 'alert', name: 'Alert', desc: 'Always on the lookout for danger, you gain the following benefits:\n- You gain a +5 bonus to initiative.' },
  { id: 'resilient', name: 'Resilient', desc: 'Choose one ability score. You gain the following benefits:\n- Increase the chosen ability score by 1, to a maximum of 20.\n- You gain proficiency in saving throws using the chosen ability.' },
  { id: 'athlete', name: 'Athlete', desc: 'You have undergone extensive physical training. Increase your Strength or Dexterity score by 1, to a maximum of 20.' },
  { id: 'durable', name: 'Durable', desc: 'Increase your Constitution score by 1, to a maximum of 20.' },
);
const fighter = (asi) => R.derive({ name: 'Bryn', race: 'human', class: 'fighter', level: 4, method: 'standard', base: BASE, skills: ['athletics', 'perception'], background: 'acolyte', asi }, srd);

test('the abilities a feat raises are read from its words', () => {
  const ix = R.index(srd);
  assert.deepEqual(R.featAbilities(ix.feat.athlete), ['str', 'dex']);
  assert.deepEqual(R.featAbilities(ix.feat.durable), ['con']);
  assert.equal(R.featAbilities(ix.feat.resilient).length, 6);
  assert.deepEqual(R.featAbilities(ix.feat.tough), []);
});

test('a feat in place of the +2: Tough adds hit points, Alert initiative, Resilient a saving throw, each listed', () => {
  const plain = fighter([]);
  const tough = fighter([{ level: 4, feat: 'tough', ab: {} }]);
  assert.equal(tough.maxHp - plain.maxHp, 8);
  assert.ok(tough.features.some((f) => f.name === 'Feat: Tough'));
  assert.deepEqual(tough.feats, ['tough']);
  assert.equal(fighter([{ level: 4, feat: 'alert', ab: {} }]).initBonus, 5);
  const res = fighter([{ level: 4, feat: 'resilient', ab: { wis: 1 } }]);
  assert.ok(res.saves.includes('wis'));
  assert.equal(res.ab.wis, plain.ab.wis + 1);
  const ath = fighter([{ level: 4, feat: 'athlete', ab: { dex: 1 } }]);
  assert.equal(ath.ab.dex, plain.ab.dex + 1);
});
