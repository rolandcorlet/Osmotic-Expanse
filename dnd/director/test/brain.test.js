import test from 'node:test';
import assert from 'node:assert/strict';
import { directorTurn, briefing, checkNarration, asksRollInWords } from '../brain/director.js';
import { toolbox, lookUp } from '../brain/tools.js';
import { makeRng } from '../engine/dice.js';
import { table, hero, srd, adventure } from './helpers.js';

// A scripted model: each reply is the next item in the list.
function scripted(replies) {
  const seen = [];
  return {
    seen,
    start() {
      let n = 0;
      const next = () => { const r = replies[Math.min(n++, replies.length - 1)]; return Promise.resolve({ text: r.text || '', calls: (r.calls || []).map((c, i) => ({ id: `c${n}${i}`, ...c })), usage: { in: 10, out: 5 } }); };
      return { send(t) { seen.push(t); return next(); }, results(r) { seen.push(r); return next(); } };
    },
  };
}

test('the briefing gives the place, its notes, the party and the exits, and the opening at the start', () => {
  const T = table();
  hero(T, 'p1', 'Bryn');
  const b = briefing(T.s, adventure, srd, { reason: 'the game begins' });
  assert.match(b, /The Ford Inn/);
  assert.match(b, /NOTES FOR THIS PLACE/);
  assert.match(b, /Bryn \(id c\d+, played by/);
  assert.match(b, /EXITS: mill-road/);
  assert.match(b, /very start of the game/);
});

test('a turn: the model asks for a roll with its tool and narrates; the Engine records both', async () => {
  const T = table();
  const pc = hero(T, 'p1', 'Bryn');
  const provider = scripted([
    { calls: [{ name: 'ask_for_roll', args: { characters: ['Bryn'], kind: 'check', skill: 'insight', dc: 10, reason: 'Read the Reeve' } }] },
    { text: 'The Reeve polishes his spectacles a little too hard. Bryn, what do you make of him?' },
  ]);
  const out = await directorTurn({ state: T.s, adventure, srd, provider, rng: makeRng(1), reason: 'a player spoke' });
  assert.equal(out.state.requests[0].pcId, pc.id);
  assert.equal(out.state.requests[0].skill, 'insight');
  assert.equal(out.state.story.at(-1).kind, 'narration');
  assert.equal(out.flags.filter((f) => f.kind !== 'note').length, 0);
});

test('a roll asked for in words is sent back to use the tool', async () => {
  const T = table();
  hero(T, 'p1', 'Bryn');
  const provider = scripted([
    { text: 'Make a Perception check for me, Bryn. What do you see?' },
    { calls: [{ name: 'ask_for_roll', args: { characters: 'Bryn', kind: 'check', skill: 'perception', dc: 12, reason: 'Look' } }] },
    { text: 'Something moves in the mill window. Bryn, what do you see?' },
  ]);
  const out = await directorTurn({ state: T.s, adventure, srd, provider, rng: makeRng(1) });
  assert.equal(out.state.requests.length, 1);
  assert.match(provider.seen[1], /asked for a roll in words/);
});

test('a narration that gives away a monster\'s numbers is rewritten or cut', async () => {
  const T = table();
  hero(T, 'p1', 'Bryn');
  const provider = scripted([
    { text: 'The goblin has AC 15 and 7 hit points left. Bryn, what do you do?' },
    { text: 'The goblin, AC 15, snarls. Bryn, what do you do?' },
  ]);
  const out = await directorTurn({ state: T.s, adventure, srd, provider, rng: makeRng(1) });
  assert.doesNotMatch(out.narration, /AC 15|hit points left/);
});

test('the checks: machinery words, no closing question, a living character called dead', () => {
  const T = table();
  hero(T, 'p1', 'Bryn');
  assert.ok(checkNarration('The notes say a trap is here. Bryn?', T.s).some((f) => f.kind === 'leak'));
  assert.ok(checkNarration('The door opens.', T.s).some((f) => /Does not end/.test(f.text)));
  assert.ok(checkNarration('Bryn falls and dies. What now?', T.s).some((f) => f.kind === 'rule'));
  assert.ok(checkNarration('Bryn breathes his last. What now?', T.s).some((f) => f.kind === 'rule'));
  assert.ok(checkNarration('Bryn is dead. What now?', T.s).some((f) => f.kind === 'rule'));
  // Something else dying near the name is not the character (bench part 3, 24-25 Nov).
  for (const ok of [
    'Bryn lifts the lantern, but its light dies a few feet out. Bryn, what do you do?',
    'A bead of grey flame leaps from the pool at Bryn and dies against his shield. Bryn, what do you do?',
    "Bryn's torch dies in the water. Bryn, what do you do?",
    'Bryn holds the lantern and the flame dies. Bryn, what do you do?',
  ]) assert.ok(!checkNarration(ok, T.s).some((f) => f.kind === 'rule'), ok);
  assert.equal(checkNarration('"Who goes there?" the guard calls. Bryn, what do you say?', T.s).length, 0);
});

test('tools refuse in plain words and name what exists', () => {
  const T = table();
  hero(T, 'p1', 'Bryn');
  const B = toolbox({ state: T.s, adventure, srd, rng: makeRng(2), now: 1 });
  assert.match(B.run('ask_for_roll', { characters: ['Zed'], kind: 'check', skill: 'stealth', dc: 10, reason: 'x' }).note, /Bryn/); // a note since the part 2 bench
  assert.match(B.run('move_party', { place: 'sanctum' }).refused, /cannot be reached/);
  assert.match(B.run('monster_action', { monster: 'orc', action: 'Greataxe', targets: ['Bryn'] }).refused, /No monster/);
  const moved = B.run('move_party', { place: 'mill-road' });
  assert.equal(moved.arrived, 'The Mill Road');
  assert.match(B.run('nope', {}).refused, /no tool/);
});

test('Ice Road Trackers and Frozen Road benches: a bite at a captive, a fight with nothing here, a fallen one who never gets up', () => {
  const T = table(8);
  const pc = hero(T, 'p1', 'Bryn');
  const E = toolbox({ state: T.s, adventure, srd, rng: makeRng(3), now: 1 });
  const none = E.run('start_combat', {});
  assert.ok(none.note && !none.refused, JSON.stringify(none));
  T.host({ type: 'foe.add', monster: 'goblin', count: 1 });
  T.host({ type: 'fight.start', autoRoll: true });
  const B = toolbox({ state: T.s, adventure, srd, rng: makeRng(3), now: 1 });
  const foe = Object.values(B.state.foes)[0];
  const r = B.run('monster_action', { monster: foe.id, action: 'Scimitar', targets: ['Spritzel'] });
  assert.ok(r.note && !r.refused, JSON.stringify(r));
  T.s.pcs[pc.id].hp = 0;
  const up = (t) => checkNarration(t, T.s).some((f) => /is up/.test(f.text));
  assert.ok(!up('The wolf lands on her, and Bryn never gets up. Ila, what do you do?'));
  assert.ok(up('Bryn gets up, shaking the snow off. Ila, what do you do?'));
});

test('a monster named as the one using an object is a note, not a refusal', () => {
  const T = table(8);
  hero(T, 'p1', 'Bryn');
  T.host({ type: 'foe.add', monster: 'goblin', count: 1 });
  const B = toolbox({ state: T.s, adventure, srd, rng: makeRng(3), now: 1 });
  const foe = Object.values(B.state.foes)[0];
  const r = B.run('use_object', { character: foe.name, object: 'anything' });
  assert.ok(r.note && !r.refused, JSON.stringify(r));
  assert.ok(B.run('use_object', { character: 'Nobody At All', object: 'anything' }).refused);
});

test('a monster\'s turn through the tools: attack, end turn', () => {
  const T = table(8);
  const pc = hero(T, 'p1', 'Bryn');
  T.host({ type: 'foe.add', monster: 'goblin', count: 1 });
  T.host({ type: 'fight.start', autoRoll: true });
  const B = toolbox({ state: T.s, adventure, srd, rng: makeRng(3), now: 1 });
  const cur = B.state.fight.order[B.state.fight.turn].key;
  if (cur.startsWith('foe:')) {
    const r = B.run('monster_action', { monster: 'Goblin', action: 'Scimitar', targets: ['Bryn'] });
    assert.ok(r.happened && /Goblin attacks Bryn/.test(r.happened[0]));
    assert.ok(!B.run('end_turn', { whose: 'Goblin' }).refused);
  } else {
    // Out of turn changes nothing and is not counted as a refusal: a note says who is acting.
    const r = B.run('monster_action', { monster: 'Goblin', action: 'Scimitar', targets: ['Bryn'] });
    assert.match(r.note, /not Goblin's turn/);
    assert.match(B.run('end_turn', { whose: 'Goblin' }).note, /Bryn is acting now/);
    assert.equal(B.refusals, 0);
  }
  void pc;
});

test('looking up the SRD', () => {
  assert.equal(lookUp(srd, 'Fireball').spell, 'Fireball');
  assert.match(lookUp(srd, 'goblin').monster, /AC 15, 7 hp/);
  assert.equal(lookUp(srd, 'prone').condition, 'Prone');
  assert.ok(lookUp(srd, 'grapple').rules);
});

test('an empty Gemini reply is asked again, and a second empty one becomes a nudge, not an error', async () => {
  const { gemini } = await import('../brain/gemini.js');
  const replies = [
    { candidates: [{ finishReason: 'STOP' }] },
    { candidates: [{ finishReason: 'STOP', content: { parts: [] } }] },
    { candidates: [{ finishReason: 'STOP', content: { role: 'model', parts: [{ text: 'The fog thickens. Bryn, what do you do?' }] } }] },
  ];
  const bodies = [];
  const fetchImpl = async (url, opts) => { bodies.push(JSON.parse(opts.body)); const r = replies.shift(); return { ok: true, status: 200, text: async () => JSON.stringify(r), json: async () => r }; };
  const g = gemini({ apiKey: 'k', model: 'gemini-x', fetchImpl });
  const chat = g.start({ system: 's', tools: [] });
  const first = await chat.send('briefing');
  assert.equal(first.text, '');
  const second = await chat.send('You have not said anything yet.');
  assert.match(second.text, /Bryn/);
  // The nudge joined the waiting user turn rather than making two user turns in a row.
  assert.equal(bodies[2].contents.length, 1);
  assert.equal(bodies[2].contents[0].parts.length, 2);
});

test('moving the party says which monsters are already there, hidden', () => {
  const T = table();
  hero(T, 'p1', 'Bryn');
  const B = toolbox({ state: T.s, adventure, srd, rng: makeRng(2), now: 1 });
  const r = B.run('move_party', { place: 'mill-road' });
  assert.match(r.monsters_already_here, /Goblin scout 1.*Do not add more/);
});

test('a hymn\'s notes are story, not a leak', () => {
  const T = table();
  assert.ok(!checkNarration('The choir holds the notes too long, and the candles gutter. Bryn, what now?', T.s).some((f) => f.kind === 'leak'));
  assert.ok(checkNarration('According to the notes, a trap is here. Bryn?', T.s).some((f) => f.kind === 'leak'));
});
test('number leaks in words are caught, and the closing question goes to whoever is acting', async () => {
  const T = table(8);
  const pc = hero(T, 'p1', 'Bryn');
  hero(T, 'p2', 'Ila');
  assert.ok(checkNarration('The goblin has only two hit-points of spite left. Bryn, what now?', T.s).some((f) => f.kind === 'leak'));
  T.host({ type: 'foe.add', monster: 'goblin', count: 1 });
  T.host({ type: 'fight.start', autoRoll: true });
  while (T.s.fight.order[T.s.fight.turn].key !== `pc:${pc.id}`) T.host({ type: 'fight.next' });
  const provider = scripted([{ text: 'The goblin snarls in the rain. Ila, what do you do?' }]);
  const out = await directorTurn({ state: T.s, adventure, srd, provider, rng: makeRng(1) });
  assert.match(out.narration, /Bryn, what do you do\?$/);
  assert.doesNotMatch(out.narration, /Ila, what/);
});

test('monsters can take the actions every creature has', () => {
  const T = table(8);
  hero(T, 'p1', 'Bryn');
  T.host({ type: 'foe.add', monster: 'goblin', count: 1 });
  const f = Object.values(T.s.foes)[0];
  T.host({ type: 'foe.act', foeId: f.id, action: 'Disengage' });
  assert.match(T.s.story.at(-1).text, /takes the Disengage action/);
});

test('nothing-to-do calls are notes, and a dying character can be stabilized by the Director', () => {
  const T = table(3);
  const pc = hero(T, 'p1', 'Bryn');
  T.host({ type: 'damage', target: pc.id, amount: pc.maxHp });
  const B = toolbox({ state: T.s, adventure, srd, rng: makeRng(2), now: 1 });
  assert.ok(B.run('reveal_monsters', {}).note);
  assert.ok(B.run('begin_combat', {}).note);
  assert.match(B.run('remove_condition', { target: 'Bryn', condition: 'unconscious' }).note, /stabilize_character/);
  assert.ok(B.run('stabilize_character', { character: 'Bryn' }).ok);
  assert.ok(B.state.pcs[pc.id].stable);
  assert.equal(B.refusals, 0);
});

test('bench 4: treasure named for its giver goes to the party, and a downed character cannot sit up', () => {
  const T = table(3);
  const pc = hero(T, 'p1', 'Bryn');
  const B = toolbox({ state: T.s, adventure, srd, rng: makeRng(2), now: 1 });
  const r = B.run('give_treasure', { character: 'Marta Hale', item: 'Potion of Healing' });
  assert.ok(r.ok && /not in the party/.test(r.assumed));
  assert.equal(B.state.loot[0].name, 'Potion of Healing');
  T.host({ type: 'damage', target: pc.id, amount: pc.maxHp });
  assert.ok(checkNarration('Bryn is sitting up now, pale. Ila, what do you do?', T.s).some((f) => f.kind === 'rule'));
  assert.ok(checkNarration('No tools needed here. Bryn, what now?', T.s).some((f) => f.kind === 'leak'));
  assert.equal(checkNarration('The mill creaks.', T.s, { asked: true }).length, 0);
});

test('bench 5: a monster target written any way is found, and the dying are not asked for rolls', () => {
  const T = table(8);
  const pc = hero(T, 'p1', 'Bryn');
  const ila = hero(T, 'p2', 'Ila');
  T.host({ type: 'foe.add', monster: 'goblin', count: 1 });
  const B = toolbox({ state: T.s, adventure, srd, rng: makeRng(3), now: 1 });
  for (const t of [{ target: 'Bryn' }, { targets: [`${pc.id} (Bryn)`] }, { targets: 'the dwarf Bryn' }]) {
    const r = B.run('monster_action', { monster: 'Goblin', action: 'Scimitar', ...t });
    assert.ok(r.happened, JSON.stringify(r));
  }
  B.do({ type: 'damage', target: `pc:${ila.id}`, amount: ila.maxHp });
  assert.equal(B.state.pcs[ila.id].hp, 0);
  const r = B.run('ask_for_roll', { characters: ['Ila'], kind: 'save', ability: 'con', dc: 10, reason: 'hold on' });
  assert.match(r.note, /death save is their only roll/);
  assert.equal(B.refusals, 0);
});

test('ten-run bench: harmless slips are notes, and a roll with no ability named reads it from the reason', () => {
  const T = table(8);
  hero(T, 'p1', 'Bryn');
  T.host({ type: 'foe.add', monster: 'goblin', count: 1 });
  const B = toolbox({ state: T.s, adventure, srd, rng: makeRng(3), now: 1 });
  assert.ok(B.run('remove_condition', { target: 'the mill-road villager', condition: 'prone' }).note);
  assert.ok(B.run('add_condition', { target: 'Bryn', condition: 'nothing' }).note);
  assert.ok(B.run('ask_for_roll', { characters: ['Bryn'], kind: 'check', dc: 12, reason: 'An Athletics check to climb' }).asked);
  assert.equal(B.state.requests.at(-1).skill, 'athletics');
  B.do({ type: 'fight.start', autoRoll: true });
  assert.ok(B.run('move_party', { place: 'thornwick' }).note);
  const g = Object.values(B.state.foes)[0];
  B.do({ type: 'damage', target: `foe:${g.id}`, amount: 50 });
  assert.ok(B.run('monster_flees', { monster: g.name }).note);
  assert.equal(B.refusals, 0);
});

test('voice: a typed speech-server address is tidied to its /v1 API', async () => {
  const { tidyUrl } = await import('../brain/voice.js');
  assert.equal(tidyUrl('http:\\\\localhost:8880\\web'), 'http://localhost:8880/v1');
  assert.equal(tidyUrl('localhost:8880'), 'http://localhost:8880/v1');
  assert.equal(tidyUrl('https://api.openai.com/v1'), 'https://api.openai.com/v1');
  assert.equal(tidyUrl(''), '');
});

test('builder: the six ready-made characters and random fills are all valid', async () => {
  const P = await import('../engine/pregen.js');
  const R = await import('../engine/rules.js');
  assert.equal(P.PREGENS.length, 6);
  for (const p of P.PREGENS) assert.deepEqual(R.validateInput(P.pregenBuild(p.id, srd), srd), [], p.id);
  for (let i = 0; i < 200; i++) assert.deepEqual(R.validateInput(P.randomBuild(srd, makeRng(i), 1 + (i % 20)), srd), []);
});

test('voice: the Test button\'s line reaches the speech server; other text does not', async () => {
  const { createVoice, TEST_LINE } = await import('../brain/voice.js');
  const { mkdtempSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  let calls = 0;
  const fetchImpl = async () => { calls += 1; return { ok: true, headers: { get: () => 'audio/wav' }, arrayBuffer: async () => new ArrayBuffer(8) }; };
  const v = createVoice({ saveDir: mkdtempSync(join(tmpdir(), 'voice-')), fetchImpl, getState: () => ({ story: [] }) });
  v.configure({ out: { engine: 'server', url: 'http://localhost:8880/v1' } });
  assert.equal((await v.say('Say something rude.')).ok, false);
  assert.equal((await v.say(TEST_LINE)).ok, true);
  assert.equal(calls, 1);
});

test('a closing question put to someone the Director plays goes to the players instead', async () => {
  const T = table();
  hero(T, 'p1', 'Bryn');
  T.as('p1', { type: 'say', text: 'I sit down with the Reeve.' });
  const provider = scripted([{ text: 'Reeve Tobias Wren wipes his spectacles and pats the bench. Reeve, what does he want to say to you?' }]);
  const out = await directorTurn({ state: T.s, adventure, srd, provider, rng: makeRng(1), reason: 'a player spoke' });
  assert.match(out.narration, /Bryn, what do you do\?$/);
  assert.doesNotMatch(out.narration, /Reeve, what/);
  const ok = scripted([{ text: 'The Reeve waits. Bryn, will you take the job?' }]);
  const out2 = await directorTurn({ state: out.state, adventure, srd, provider: ok, rng: makeRng(1), reason: 'a player spoke' });
  assert.match(out2.narration, /Bryn, will you take the job\?$/);
});

test('part 2 bench: a fight already on, a roll for someone outside the party, and XP for nobody are notes', () => {
  const T = table(9);
  hero(T, 'p1', 'Bryn');
  T.host({ type: 'foe.add', monster: 'goblin', count: 1 });
  const B = toolbox({ state: T.s, adventure, srd, rng: makeRng(3), now: 1 });
  B.do({ type: 'fight.start', autoRoll: true });
  assert.ok(B.run('start_combat', {}).note);
  assert.ok(B.run('ask_for_roll', { characters: ['Nell'], kind: 'save', ability: 'dex', dc: 12, reason: 'dodge' }).note);
  const g = Object.values(B.state.foes)[0];
  assert.ok(B.run('reveal_monsters', { monsters: [g.name] }).note);
  for (const p of Object.values(B.state.pcs)) p.dead = true;
  assert.ok(B.run('award_xp', { amount: 300, why: 'Nell freed' }).note);
  assert.equal(B.refusals, 0);
});

test('part 2 bench: a milestone pays once, and the lantern quest closes only at the ford', () => {
  const T = table(10);
  hero(T, 'p1', 'Bryn');
  const B = toolbox({ state: T.s, adventure, srd, rng: makeRng(3), now: 1 });
  B.do({ type: 'site.move', siteId: 'mill-road' });
  const xp0 = Object.values(B.state.pcs)[0].xp;
  assert.ok(B.run('award_xp', { amount: 300, why: 'Nell freed' }).ok);
  assert.ok(B.run('award_xp', { amount: 300, why: 'the lantern recovered' }).note);
  assert.equal(Object.values(B.state.pcs)[0].xp, xp0 + 300);
  const lantern = B.state.quests.find((q) => /lantern/i.test(q.text));
  assert.match(B.run('complete_quest', { quest: lantern.id }).note, /Not yet/);
  assert.equal(B.state.quests.find((q) => q.id === lantern.id).done, false);
  B.do({ type: 'site.move', siteId: 'thornwick' });
  assert.ok(B.run('complete_quest', { quest: lantern.id }).ok);
  assert.equal(B.refusals, 0);
});

test('part 3 bench: quest named as "q2 <text>", end_combat with no fight, a monster that talks, roles swapped', () => {
  const T = table(12);
  const pc = hero(T, 'p1', 'Bryn');
  const B = toolbox({ state: T.s, adventure, srd, rng: makeRng(4), now: 1 });
  B.do({ type: 'site.move', siteId: 'thornwick' });
  const lantern = B.state.quests.find((q) => /lantern/i.test(q.text));
  assert.ok(B.run('complete_quest', { quest: `${lantern.id} ${lantern.text}` }).ok);
  assert.equal(B.state.quests.find((q) => q.id === lantern.id).done, true);
  assert.match(B.run('end_combat', { award_xp: false }).note, /no fight/);
  B.do({ type: 'foe.add', monster: 'cult-fanatic', count: 1 });
  const foe = Object.values(B.state.foes).find((f) => !f.dead);
  assert.ok(B.run('monster_action', { monster: foe.id, action: 'Talk', targets: ['Bryn'] }).note);
  const r = B.run('monster_action', { monster: pc.id, action: 'Dagger', targets: [foe.id] });
  assert.ok(!r.refused, JSON.stringify(r));
  assert.equal(B.refusals, 0);
});

test('a roll asked for in words is caught, a wagon that rolls is not (bench part 4, 25 Nov)', () => {
  for (const t of ['Bryn, make a Perception check.', 'Give me a Dexterity saving throw, Ila.', 'Roll a d20 for me.', 'Roll for initiative!', 'Go on, roll for it.', 'Roll me a Wisdom save.', 'Ila, roll for a Stealth check.'])
    assert.ok(asksRollInWords(t), t);
  for (const t of ["The wagons roll a mile of wet King's Way and clock into Oakhurst.", 'Thunder rolls across the gorge.', 'The barrels roll for a while down the hill.', '"Roll a d20," the goblin jeers, but nobody moves.'])
    assert.ok(!asksRollInWords(t), t);
});

test('a journey told in words, with the Engine still at the old place, is sent back for move_party', async () => {
  const T = table();
  hero(T, 'p1', 'Bryn');
  const provider = scripted([
    { text: 'You set out along the river. Hours pass, and by the time the light fails the Mill Road lies just ahead. Bryn, what do you do?' },
    { calls: [{ name: 'move_party', args: { place: 'mill-road' } }] },
    { text: 'The Mill Road climbs into the hills. Bryn, what do you do?' },
  ]);
  const out = await directorTurn({ state: T.s, adventure, srd, provider, rng: makeRng(1), reason: 'A player spoke: "We head up the Mill Road."' });
  assert.match(provider.seen[1], /takes the party toward The Mill Road/);
  assert.equal(out.state.scene.siteId, 'mill-road');
});

test('naming a place in talk, with no journey, is not taken for travel', async () => {
  const { travelledInWords } = await import('../brain/director.js');
  const T = table();
  assert.equal(travelledInWords('The Reeve frowns. "The Mill Road is dangerous," he says. Bryn, what do you ask him?', T.s, adventure), null);
  assert.equal(travelledInWords('Wren points at the map: the Mill Road is where Bren saw them. Bryn, will you go?', T.s, adventure), null);
});

test('checks that all succeed where a quest ends get one question: does that finish it?', async () => {
  const T = table();
  hero(T, 'p1', 'Bryn');
  T.host({ type: 'narrate', text: 'Thornwick Ford. What do you do?' });
  T.s.seq += 1;
  T.s.story.push({ id: 'e-test', seq: T.s.seq, t: 0, kind: 'event', who: 'Engine', roll: true, text: 'Bryn succeeds on a Wisdom (Insight) check.' });
  const provider = scripted([{ text: 'The ford is quiet. Bryn, what now?' }, { calls: [{ name: 'complete_quest', args: { quest: 'q1' } }] }, { text: 'The lantern hangs over the ford again. Bryn, what now?' }]);
  const out = await directorTurn({ state: T.s, adventure, srd, provider, rng: makeRng(1), reason: 'rolls' });
  assert.ok(provider.seen.some((m) => typeof m === 'string' && /Those rolls all succeeded/.test(m)));
  assert.ok(out.state.quests.find((q) => q.id === 'q1').done);
  const T2 = table();
  hero(T2, 'p1', 'Bryn');
  T2.host({ type: 'narrate', text: 'Thornwick Ford.' });
  T2.s.seq += 1;
  T2.s.story.push({ id: 'e-t2', seq: T2.s.seq, t: 0, kind: 'event', who: 'Engine', roll: true, text: 'Bryn fails a Wisdom (Insight) check.' });
  const p2 = scripted([{ text: 'Bryn, what now?' }]);
  await directorTurn({ state: T2.s, adventure, srd, provider: p2, rng: makeRng(1), reason: 'rolls' });
  assert.ok(!p2.seen.some((m) => typeof m === 'string' && /Those rolls/.test(m)));
});

test('a monster that acted and was left in its turn has the turn ended by the Engine', async () => {
  const T = table(8);
  hero(T, 'p1', 'Bryn');
  T.host({ type: 'foe.add', monster: 'goblin', count: 1 });
  T.host({ type: 'fight.start', autoRoll: true });
  const f = T.s.fight;
  f.turn = f.order.findIndex((o) => o.key.startsWith('foe:'));
  const key = f.order[f.turn].key;
  const provider = scripted([{ calls: [{ name: 'monster_action', args: { monster: 'Goblin', action: 'Scimitar', targets: ['Bryn'] } }] }, { text: 'The goblin slashes. Bryn, what do you do?' }]);
  const out = await directorTurn({ state: T.s, adventure, srd, provider, rng: makeRng(1), reason: 'a monster is up' });
  assert.notEqual(out.state.fight && out.state.fight.order[out.state.fight.turn].key, key);
  assert.ok(out.calls.some((c) => c.name === '(engine)'));
});

test('a look-or-know roll before the player tries anything, with "what do you do?", is withdrawn; after "I look around" it stays', async () => {
  for (const [said, kept] of [['I walk outside.', false], ['I step outside and look around where the lamp was.', true]]) {
    const T = table();
    const pc = hero(T, 'p1', 'Bryn');
    T.host({ type: 'narrate', text: 'The inn is warm. Bryn, what do you do?' });
    T.as('p1', { type: 'say', text: said });
    const provider = scripted([
      { calls: [{ name: 'ask_for_roll', args: { characters: ['Bryn'], kind: 'check', skill: 'investigation', dc: 12, reason: 'Search the yard' } }] },
      { text: 'The yard is dark and wet. Bryn, what do you do?' },
      { text: 'Rain drums on the yard. Bryn, what do you do?' },
    ]);
    const out = await directorTurn({ state: T.s, adventure, srd, provider, rng: makeRng(1), reason: 'a player spoke' });
    assert.equal(out.state.requests.filter((q) => q.pcId === pc.id).length, kept ? 1 : 0, said);
    assert.equal(out.state.story.some((e) => /^Roll asked: Bryn/.test(e.text)), kept, said);
  }
});
test('every roll asked is said in the story with what it is for, and its result says it too', () => {
  const T = table();
  const pc = hero(T, 'p1', 'Bryn');
  T.host({ type: 'roll.ask', pcId: pc.id, kind: 'check', skill: 'perception', dc: 12, reason: 'Spot the goblins in the mill' });
  assert.ok(T.s.story.some((e) => e.text === 'Roll asked: Bryn, a Perception check, for this: Spot the goblins in the mill.'));
  T.as('p1', { type: 'roll.make', id: T.s.requests[0].id });
  assert.match(T.s.story.at(-1).text, /Perception check.*\(Spot the goblins in the mill\)/);
});
