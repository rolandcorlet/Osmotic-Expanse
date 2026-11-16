// v3: the Director's kit. The scenario says what is there; the kit says how to run it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { newSession, apply, viewFor } from '../engine/ledger.js';
import { makeRng } from '../engine/dice.js';
import { scenario, publicScenario } from '../data/first-carve.js';
import { VECTORS } from '../data/vectors.js';
import { toolbox } from '../brain/tools.js';
import { briefing, INSTRUCTIONS, MACHINERY, scrubLeaks, checkNarration } from '../brain/director.js';
import { tableRead, breakLoop } from '../brain/kit.js';
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

test('bench 16 Nov: the opening survives the travelling line, a repeated question is called out, bookkeeping is a leak', () => {
  let s = seated();
  const host = ctx('host', null);
  s = apply(s, { type: 'scene.set', siteId: 'soft-field' }, host);
  s.story.push({ id: 'x1', seq: s.seq, site: 'soft-field', kind: 'narration', text: 'The lane swallows you whole.' });
  assert.match(briefing(s, scenario, bestiary), /OPEN WITH THIS.*hanging forest of pale fat/);
  for (const t of ['Osk slips. Bresk, do you throw the line and haul him, or climb on and leave him?', 'The count goes on. Bresk, throw and haul him out, or climb on and leave him?', 'One finger left. Bresk, line in hand: throw and haul, or climb on and leave him?']) s.story.push({ id: `n${t.length}`, seq: s.seq, site: 'soft-field', kind: 'narration', text: t });
  const b = briefing(s, scenario, bestiary);
  assert.doesNotMatch(b, /OPEN WITH THIS/);
  assert.match(b, /SAME QUESTION TO THE TABLE THREE TIMES/);
  assert.match('The award of 25 Codon to the Cohort and the reveal of the serial both land here.', MACHINERY);
});

test('bench 16 Nov (iq3_s): a leaking sentence is cut instead of holding the reply; elsewhere stays unseen', () => {
  let s = seated();
  s = apply(s, { type: 'scene.set', siteId: 'render-hall' }, ctx('host', null));
  { const T = toolbox({ state: s, scenario, bestiary, rng }); T.run('bring_creatures', { block: 'detritus-feeder', count: 2, band: 'near' }); T.run('start_pulse_war', {}); s = T.state; }
  const text = 'The blade slides off the swollen hide. Feeder B lurches but keeps grinding. Four sections left, gutted on one side, still enormous.\n\nVash, what do you spend it on?';
  const leaks = (t) => checkNarration(t, s).filter((f) => f.kind === 'leak').length;
  assert.ok(leaks(text) > 0, 'the bench line is a leak');
  const cut = scrubLeaks(text, leaks);
  assert.ok(cut && leaks(cut) === 0);
  assert.match(cut, /keeps grinding/);
  assert.match(cut, /what do you spend it on\?$/);
  assert.doesNotMatch(cut, /Four sections/);
  assert.equal(scrubLeaks('Nothing wrong here. Vash, what now?', leaks), '');
  assert.match(briefing(s, scenario, bestiary), /can only see, taste and test what is here/);
});

test('bench 16 Nov (third): a burial by Hand name is caught, creature counts leak, a bystander cannot be charged to a player', () => {
  let s = seated();
  s = apply(s, { type: 'scene.set', siteId: 'render-hall' }, ctx('host', null));
  const T = toolbox({ state: s, scenario, bestiary, rng });
  T.run('bring_creatures', { block: 'detritus-feeder', count: 2, band: 'near' });
  const rider = Object.values(T.state.organisms).find((o) => o.id === 'rider');
  const first = rider.name.split(' ')[0];
  const rule = (t) => checkNarration(t, T.state).filter((f) => /dead or dissolved/.test(f.text)).length;
  assert.ok(rule('The flank membranes lose their definition, then the whole Rider simply stops being a single shape. Bresk, what now?'));
  assert.ok(rule(`The current where ${first} was is just sweetness now. Bresk, what now?`));
  assert.equal(rule(`${first} rides the current clear of the churn. Bresk, what now?`), 0);
  const leak = (t) => checkNarration(t, T.state).filter((f) => f.kind === 'leak').length;
  assert.ok(leak('It rights itself. Nine/22 of whatever holds it together. Bresk, what now?'));
  assert.ok(leak('Shoal B is three clusters where eight arrived. Bresk, what now?'));
  assert.ok(leak('Shoal A is hurt: five of eight clusters left. Bresk, what now?'));
  assert.equal(leak('Two clusters of small things nibble the lip. Bresk, what now?'), 0);
  const before = T.state.organisms.ledger.mi;
  assert.match(T.run('hazard_damage', { organism: 'ledger', amount: 8, type: 'Lytic', trigger: 'entering Mid band', why: 'Osk tumbles through the enzyme haze' }).refused, /bystander has no sheet/);
  assert.equal(T.state.organisms.ledger.mi, before);
});

test('a question asked three times is closed by the Engine and the floor passes', () => {
  let s = seated();
  ['Bresk of the Choir', 'Ilm of the Hand', 'Vash of the Reach', 'Brost of the Current'].forEach((n, i) => { Object.values(s.organisms).filter((o) => o.playerId)[i].name = n; });
  for (const t of ['Nine-Folds waits. Bresk, do you sign the form, or walk?', 'The thud comes closer. Bresk, the pen waits: do you sign, or walk away?']) s.story.push({ id: `q${t.length}`, seq: s.seq, site: s.scene.siteId, kind: 'narration', text: t });
  s = apply(s, { type: 'say', text: 'I look at the ceiling.' }, ctx('player', 'p1'));
  const out = breakLoop('The glow comes back slowly.\n\nBresk, the form sits open. Do you sign the form, or walk?', s, s.scene.siteId);
  assert.match(out, /The glow comes back slowly\./);
  assert.match(out, /that choice is no longer on offer\. (Ilm|Vash|Brost), what do you do\?$/);
  assert.doesNotMatch(out, /Do you sign/);
  assert.equal(breakLoop('A new thing happens. Ilm, do you open the pump?', s, s.scene.siteId), '');
});

test('HUNGER filling starts the Render Cascade once: unstamped cuts drop a grade, stamped ones do not', () => {
  let s = seated();
  const host = ctx('host', null);
  s.organisms.wall.specimens = { C: 2, G: 3, P: 1, T: 0 };
  s.organisms.wall.stamped = { C: 0, G: 2, P: 0, T: 0 };
  s.clocks.HUNGER.filled = 3;
  s = apply(s, { type: 'clock', id: 'HUNGER', delta: 1, why: 'bodies left uncut' }, host);
  assert.deepEqual(s.organisms.wall.specimens, { C: 5, G: 1, P: 0, T: 0 });
  assert.equal(s.organisms.wall.stamped.G, 2);
  assert.ok(s.fills.HUNGER);
  assert.match(briefing(s, scenario, bestiary), /HUNGER IS FULL: THE RENDER CASCADE HAS JUST BEGUN/);
  const again = apply(s, { type: 'say', text: 'What was that?' }, ctx('player', 'p1'));
  assert.deepEqual(again.organisms.wall.specimens, { C: 5, G: 1, P: 0, T: 0 }, 'paid once');
});

test('a Pulse War ends by itself once every foe is wreckage, but not while one has only stood down', () => {
  let s = seated();
  const host = ctx('host', null);
  s = apply(s, { type: 'fight.start', creatures: [{ blockId: 'gnaw-swarm', count: 2, band: 'near' }] }, host);
  const [a, b] = Object.keys(s.creatures);
  s.creatures[a].down = true;
  s = apply(s, { type: 'turn.next' }, host);
  assert.ok(s.fight, 'one swarm is still up');
  s.creatures[b].stoodDown = { why: 'drank and left' };
  s = apply(s, { type: 'turn.next' }, host);
  assert.ok(s.fight, 'a stood-down creature can still be struck back in');
  s.creatures[b].stoodDown = null; s.creatures[b].down = true;
  s = apply(s, { type: 'turn.next' }, host);
  assert.equal(s.fight, null);
  assert.match(s.log[s.log.length - 1].text, /Nothing is left fighting/);
});

test('short repeated questions are a loop too; the stock handover never is', () => {
  let s = seated();
  ['Bresk of the Choir', 'Ilm of the Hand', 'Vash of the Reach', 'Brost of the Current'].forEach((n, i) => { Object.values(s.organisms).filter((o) => o.playerId)[i].name = n; });
  const push = (t) => s.story.push({ id: `k${s.story.length}`, seq: s.seq, site: s.scene.siteId, kind: 'narration', text: t });
  push('The pen waits. Bresk, do you sign, or do you walk?');
  push('The thud lands again. Bresk — the form is still blank under his claw. Do you sign?');
  assert.match(breakLoop('He lifts the form. Bresk, do you sign, or do you go?', s, s.scene.siteId), /no longer on offer/);
  s.story.length = 0;
  push('The gate waits. Bresk, what do you do?'); push('The queue shifts. Bresk, what do you do?');
  assert.equal(breakLoop('The board ticks. Bresk, what do you do?', s, s.scene.siteId), '');
  const T = toolbox({ state: seated(), scenario, bestiary, rng });
  T.run('bring_creatures', { block: 'gnaw-swarm', count: 1, band: 'near' });
  assert.ok(checkNarration('The thing in front of you has four points of shape left in it. Bresk, what now?', T.state).some((f) => f.kind === 'leak'));
});

test('house rule: a loud fight costs TOLL about half the time, HUNGER every time', () => {
  let toll = 0, hunger = 0;
  for (let seed = 1; seed <= 200; seed++) {
    const r = makeRng(seed);
    const c = (role, pid) => ({ role, pid, rng: r, now: 0, scenario, bestiary });
    let s = newSession(scenario);
    s = apply(s, { type: 'join', name: 'A' }, c('player', 'p1'));
    s = apply(s, { type: 'zero.agree' }, c('player', 'p1'));
    s = apply(s, { type: 'claim', organismId: 'wall', name: 'Bresk' }, c('player', 'p1'));
    s = apply(s, { type: 'fight.start', creatures: [{ blockId: 'gnaw-swarm', count: 1, band: 'near' }] }, c('host', null));
    toll += s.clocks.TOLL.filled; hunger += s.clocks.HUNGER.filled;
  }
  assert.equal(hunger, 200);
  assert.ok(toll > 70 && toll < 130, `TOLL paid ${toll} of 200`);
});

test('striking someone with no stat block: one throw, the law answers, the offer is gone, a drone leaves a body', () => {
  let s = seated();
  for (const id of ['soft-field', 'render-hall', 'brood']) s = apply(s, { type: 'scene.set', siteId: id }, ctx('host', null));
  const T = toolbox({ state: s, scenario, bestiary, rng });
  const toll = T.state.clocks.TOLL.filled;
  assert.match(T.run('strike_bystander', { organism: 'wall', who: 'the brood' }).refused, /creature printed for this site/);
  assert.match(T.run('bystander_falls', { who: 'Nine-Folds', outcome: 'dead' }).refused, /Nobody has struck/);
  const r = T.run('strike_bystander', { organism: 'wall', who: 'Nine-Folds', baseline: 'VSC' });
  assert.ok(r.throw_called_for, JSON.stringify(r));
  assert.equal(T.state.clocks.TOLL.filled, toll + 1, 'an official struck moves the law once');
  assert.equal(T.state.requests.length, 1);
  assert.match(briefing(T.state, scenario, bestiary), /Nine-Folds, the drone elder: WAS STRUCK AT/);
  const q = T.state.requests[0];
  T.state = apply(T.state, { type: 'roll', requestId: q.id, dice: Array(q.pool.dice).fill(6) }, ctx('player', 'p1'));
  const f = T.run('bystander_falls', { who: 'Nine-Folds', outcome: 'dead' });
  assert.match(f.body, /can be harvested/);
  assert.ok(Object.values(T.state.creatures).some((c) => /body of Nine-Folds/.test(c.name) && c.down));
  assert.match(briefing(T.state, scenario, bestiary), /Nine-Folds, the drone elder: DEAD/);
  assert.match(T.run('strike_bystander', { organism: 'wall', who: 'Nine-Folds' }).note, /already dead/);
  assert.equal(T.state.clocks.TOLL.filled, toll + 1, 'paid once');
});

test('some people are beyond the Cohort, and a clerk leaves nothing printed to cut', async () => {
  const { KITS } = await import('../data/kit/index.js');
  assert.ok(KITS[1].sites['print-floor'].people.find((p) => p.id === 'kel-vasht').beyond);
  let s = seated();
  s = apply(s, { type: 'scene.set', siteId: 'soft-field' }, ctx('host', null));
  const T = toolbox({ state: s, scenario, bestiary, rng });
  T.run('strike_bystander', { organism: 'wall', who: 'the Tally Post clerk' });
  const q = T.state.requests[0];
  T.state = apply(T.state, { type: 'roll', requestId: q.id, dice: Array(q.pool.dice).fill(6) }, ctx('player', 'p1'));
  assert.match(T.run('bystander_falls', { who: 'clerk', outcome: 'dead' }).body, /Nothing is printed to cut/);
});

test('QUORUM is in the Director\'s reach and its cards are complete', async () => {
  const { QUORUM } = await import('../data/kit/quorum.js');
  assert.ok(QUORUM.length >= 15);
  for (const q of QUORUM) assert.ok(q.plain.length > 40 && q.when && q.rule.length >= 2 && q.table.length > 40 && q.ch, q.id);
  const T = toolbox({ state: seated(), scenario, bestiary, rng });
  assert.ok(T.run('look_up', { about: 'how does a colony vote, quorum' }).cards.some((c) => /Quorum/.test(c.name)));
  assert.ok(T.run('look_up', { about: 'we call in a favour from the ledger' }).cards.some((c) => /Ledger/.test(c.name)));
  assert.ok(T.run('look_up', { about: 'duel champion' }).cards.some((c) => /duel/i.test(c.name)));
});

test('the Core rules are in the Director\'s reach, and the v3 books build from the same data', async () => {
  const { CORE } = await import('../data/kit/core.js');
  assert.ok(CORE.length >= 16);
  for (const q of CORE) assert.ok(q.plain.length > 10 && q.when && q.who && q.rule.length >= 3 && q.table.length > 40 && q.ch, q.id);
  const T = toolbox({ state: seated(), scenario, bestiary, rng });
  assert.ok(T.run('look_up', { about: 'what happens when I hit zero health, dying' }).cards.some((c) => /dying/i.test(c.name)));
  assert.ok(T.run('look_up', { about: 'how hard is it threshold' }).cards.some((c) => /Threshold/.test(c.name)));
});

test('Total Lysis is real: a full Countdown ends the organism, and nothing brings it back', () => {
  let s = seated();
  const host = ctx('host', null);
  ['Bresk of the Choir', 'Ilm of the Hand', 'Vash of the Reach', 'Brost of the Current'].forEach((n, i) => { Object.values(s.organisms).filter((o) => o.playerId)[i].name = n; });
  const pid = s.organisms.rider.playerId;
  s.organisms.rider.countdown = s.organisms.rider.countdownMax - 2;
  s.organisms.rider.stress = 7;
  s = apply(s, { type: 'request.check', organismId: 'rider', baseline: 'DFF', pathway: '', at: 12, label: 'one swing too many', mods: [], unhurried: false }, host);
  const q = s.requests[0];
  s = apply(s, { type: 'roll', requestId: q.id, dice: Array(q.pool.dice).fill(1) }, ctx('player', pid));
  const r = s.organisms.rider;
  assert.ok(r.lysed, 'Stress 8 collapsed him and the Countdown filled');
  assert.equal(r.mi, 0);
  assert.ok(r.dormant);
  assert.match(briefing(s, scenario, bestiary), /DEAD \(Total Lysis\)/);
  assert.throws(() => apply(s, { type: 'harvest', organismId: 'rider' }, ctx('player', pid)), /cannot act/);
  assert.equal(checkNarration(`What was ${s.organisms.rider.name.split(' ')[0]} is everywhere in the water now. ${s.organisms.rider.name.split(' ')[0]} is gone. Bresk, what now?`, s).filter((f) => /dead or dissolved/.test(f.text)).length, 0, 'saying a dead organism is dead is not a false burial');
});

test('house rule: a Flagellan marks Stress from a rolled 1 about three times in four; others always', () => {
  const run = (hand) => {
    let total = 0;
    for (let seed = 1; seed <= 300; seed++) {
      const r = makeRng(seed);
      const c = (role, pid) => ({ role, pid, rng: r, now: 0, scenario, bestiary });
      let s = newSession(scenario);
      s = apply(s, { type: 'join', name: 'A' }, c('player', 'p1'));
      s = apply(s, { type: 'zero.agree' }, c('player', 'p1'));
      s = apply(s, { type: 'claim', organismId: hand, name: 'Test One' }, c('player', 'p1'));
      s = apply(s, { type: 'request.check', organismId: hand, baseline: 'RTC', pathway: '', at: 12, label: 'x', mods: [], unhurried: false }, c('host', null));
      const q = s.requests[0];
      s = apply(s, { type: 'roll', requestId: q.id, dice: [1, ...Array(q.pool.dice - 1).fill(6)] }, c('player', 'p1'));
      total += s.organisms[hand].stress;
    }
    return total;
  };
  assert.equal(run('wall'), 300);
  const rider = run('rider');
  assert.ok(rider > 195 && rider < 255, `the Rider marked ${rider} of 300`);
});

test('the Player\'s Atlas v3 cards: 6 lineages, 24 Phenotypes with four Stages each, and look_up finds them', async () => {
  const { ATLAS } = await import('../data/kit/atlas.js');
  const { lookUp } = await import('../data/kit/society.js');
  assert.equal(ATLAS.filter((q) => /^lineage-/.test(q.id)).length, 6);
  const ph = ATLAS.filter((q) => /^pheno-/.test(q.id));
  assert.equal(ph.length, 24);
  for (const p of ph) assert.equal(p.rule.filter((r) => /^Stage (I|II|III|IV) /.test(r)).length, 4, p.name);
  for (const q of ATLAS) for (const f of ['plain', 'when', 'who']) assert.ok(String(q[f] || '').length > 8, `${q.id} ${f}`);
  assert.ok(ATLAS.find((q) => q.id === 'lineage-flagellan').rule.some((r) => /Rides It Out/.test(r)));
  assert.ok(lookUp('etch corrosor').some((c) => /Acidic Corrosor/.test(c.name)));
  assert.ok(lookUp('slipstream rider').some((c) => /Current Rider/.test(c.name)));
  assert.ok(lookUp('adaptations').some((c) => /Adaptations/.test(c.name)));
});

test('the Director\'s Codex v3 cards cover all thirteen chapters and look_up finds them', async () => {
  const { CODEX, CODEX_CHAPTERS } = await import('../data/kit/codex.js');
  const { lookUp } = await import('../data/kit/society.js');
  assert.equal(Object.keys(CODEX_CHAPTERS).length, 13);
  for (const n of Object.keys(CODEX_CHAPTERS)) assert.ok(CODEX.some((c) => c.chapter === n), `chapter ${n}`);
  for (const c of CODEX) assert.ok(c.rule.length > 0 && c.plain.length > 8, c.id);
  assert.ok(lookUp('trap discovery trigger').some((c) => /Codex/.test(c.kind || '')));
  assert.ok(lookUp('five-room site').some((c) => /Codex/.test(c.kind || '')));
});
