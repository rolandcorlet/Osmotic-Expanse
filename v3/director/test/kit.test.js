// v3: the Director's kit. The scenario says what is there; the kit says how to run it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { newSession, apply, viewFor } from '../engine/ledger.js';
import { makeRng } from '../engine/dice.js';
import { scenario, publicScenario } from '../data/first-carve.js';
import { VECTORS } from '../data/vectors.js';
import { toolbox } from '../brain/tools.js';
import { briefing, INSTRUCTIONS } from '../brain/director.js';
import { tableRead } from '../brain/kit.js';
import { gloss } from '../data/kit/glossary.js';

const bestiary = JSON.parse(readFileSync(new URL('../data/bestiary.json', import.meta.url), 'utf8'));
const rng = makeRng(5);
const ctx = (role, pid) => ({ role, pid, rng, now: 0, scenario, bestiary });
function seated(sc = scenario) {
  let s = newSession(sc);
  const c = (role, pid) => ({ role, pid, rng, now: 0, scenario: sc, bestiary });
  sc.hands.slice(0, 4).forEach((h, i) => {
    const pid = `p${i + 1}`;
    s = apply(s, { type: 'join', name: `Player ${i + 1}` }, c('player', pid));
    s = apply(s, { type: 'zero.agree' }, c('player', pid));
    s = apply(s, { type: 'claim', organismId: h.id, name: `Org ${i + 1}` }, c('player', pid));
  });
  return s;
}

test('every Vector carries a complete kit', () => {
  for (const v of VECTORS) {
    const k = v.scenario.kit;
    assert.ok(k, `${v.id} has a kit`);
    assert.ok(k.pitch.length > 80);
    for (const site of v.scenario.sites) {
      const s = k.sites[site.id];
      assert.ok(s, `${v.id}/${site.id} has craft notes`);
      for (const f of ['start', 'question']) assert.ok(s[f] && s[f].length > 20, `${site.id}.${f}`);
      assert.ok(s.senses.length >= 4 && s.people.length >= 1 && s.approaches.length >= 3 && s.costs.length >= 3 && s.leads.length >= 3 && s.threats.length >= 1, `${site.id} is filled in`);
      for (const p of s.people) for (const id of p.knows) assert.ok(k.secrets.some((x) => x.id === id), `${site.id}: ${p.id} knows a real secret (${id})`);
      for (const h of v.scenario.hands) assert.ok(s.moments[h.id], `${site.id} has a moment for ${h.id}`);
    }
    for (const h of v.scenario.hands) assert.ok(k.hands[h.id], `${h.id} is described in plain words`);
    const ids = new Set(v.scenario.sites.map((x) => x.id));
    for (const sec of k.secrets) {
      for (const l of sec.leads) assert.ok(ids.has(l.site), `${sec.id} lead points at a real site`);
      if (sec.must) assert.ok(sec.leads.length >= 3, `${sec.id}: a must-know secret has three leads`);
    }
  }
});

test('every kit, seated or not, is complete enough to run from', async () => {
  const { KITS } = await import('../data/kit/index.js');
  assert.equal(KITS.length, 3);
  for (const k of KITS) {
    const ids = new Set(Object.keys(k.sites));
    assert.equal(ids.size, 5, `${k.id} has five sites`);
    assert.ok(k.pitch.length > 80 && k.truths.length >= 3 && k.hooks.length >= 3, `${k.id} has a pitch, truths and hooks`);
    for (const [id, s] of Object.entries(k.sites)) {
      assert.ok(s.start.length > 40 && s.question.length > 20, `${k.id}/${id} opens and asks`);
      assert.ok(s.senses.length >= 4 && s.people.length >= 1 && s.approaches.length >= 3 && s.costs.length >= 3 && s.leads.length >= 3 && s.threats.length >= 1, `${k.id}/${id} is filled in`);
      assert.ok(Object.keys(s.moments).length >= 4, `${k.id}/${id} has four moments`);
      for (const p of s.people) for (const sec of p.knows) assert.ok(k.secrets.some((x) => x.id === sec), `${k.id}/${id}: ${p.id} knows a real secret (${sec})`);
      assert.doesNotMatch(JSON.stringify(s.approaches), /\bAT \d|\d+ (?:MI|PP|Codon|S)\b/, `${k.id}/${id}: rulings name no numbers`);
    }
    for (const sec of k.secrets) {
      for (const l of sec.leads) assert.ok(ids.has(l.site), `${k.id}: ${sec.id} lead points at a real site`);
      if (sec.must) assert.ok(sec.leads.length >= 3, `${k.id}: ${sec.id} has three leads`);
    }
    const words = k.glossary.map((g) => g.word.toLowerCase());
    assert.equal(new Set(words).size, words.length, `${k.id}: no word is defined twice`);
  }
});

test('the briefing carries the craft notes and the hidden secrets, with no numbers of its own', () => {
  const b = briefing(seated(), scenario, bestiary);
  assert.match(b, /HOW TO RUN THIS SCENE/);
  assert.match(b, /OPEN WITH THIS/);
  assert.match(b, /the gate drone/);
  assert.match(b, /SECRETS THE COHORT HAS NOT LEARNED YET/);
  assert.match(b, /- legal \(they need this\)/);
  assert.match(b, /A moment for each organism/);
});

test('reveal_secret records it once, shows it to players, and drops it from the hidden list', () => {
  const T = toolbox({ state: seated(), scenario, bestiary, rng });
  assert.equal(T.run('reveal_secret', { secret: 'legal', how: 'read the toll board' }).learned, 'legal');
  assert.match(T.run('reveal_secret', { secret: 'legal' }).note, /already knows/);
  assert.match(T.run('reveal_secret', { secret: 'nope' }).refused, /Printed ids/);
  const b = briefing(T.state, scenario, bestiary);
  assert.doesNotMatch(b, /- legal \(they need this\)/);
  assert.match(b, /Already known to the Cohort.*legal/);
  const v = viewFor(T.state, 'player', 'p1');
  assert.match(v.kit.found.legal.text, /Tally Post/);
});

test('players never receive the hidden secrets or the craft notes', () => {
  const pub = JSON.stringify(publicScenario(scenario));
  assert.doesNotMatch(pub, /Lattice machinery|print job|Nine-Folds will say/);
  assert.ok(publicScenario(scenario).glossary.length > 30);
  assert.ok(publicScenario(scenario).handsPlain.wall);
});

test('a stalled table and a quiet player are noticed', () => {
  let s = seated();
  const wall = Object.values(s.organisms).find((o) => o.playerId === 'p1');
  for (let i = 0; i < 5; i++) s = apply(s, { type: 'say', text: `I look around again ${i}` }, ctx('player', 'p1'));
  const r = tableRead(s, s.scene.siteId);
  assert.ok(r.stalled);
  assert.ok(r.quiet.length === 3 && !r.quiet.some((o) => o.id === wall.id));
  const b = briefing(s, scenario, bestiary);
  assert.match(b, /THE TABLE HAS STALLED/);
  assert.match(b, /not had the floor lately/);
  const T = toolbox({ state: s, scenario, bestiary, rng });
  T.run('reveal_secret', { secret: 'legal' });
  assert.ok(!tableRead(T.state, T.state.scene.siteId).stalled, 'learning something is progress');
});

test('the instructions teach free play, and the glossary speaks plainly', () => {
  assert.match(INSTRUCTIONS, /say or try \*\*anything\*\*/);
  assert.match(INSTRUCTIONS, /Never tell a player the page has nothing/);
  assert.doesNotMatch(INSTRUCTIONS, /Do not invent a substitute/);
  assert.match(gloss('mi').plain, /health/i);
});

test('look_up answers questions about the world in plain words', () => {
  const T = toolbox({ state: seated(), scenario, bestiary, rng });
  const law = T.run('look_up', { about: 'lying about who you are, disguise' });
  assert.ok(law.cards.some((c) => /Tonicity/.test(c.name)));
  assert.match(T.run('look_up', { about: 'what is a Tally Post' }).cards[0].in_plain_words, /weigh/i);
  assert.match(T.run('look_up', { about: 'zzzz' }).note, /common sense/);
});
