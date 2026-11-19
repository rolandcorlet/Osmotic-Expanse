import test from 'node:test';
import assert from 'node:assert/strict';
import { directorTurn, briefing, checkNarration } from '../brain/director.js';
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
    { text: 'Something moves in the mill window. Bryn, what do you do?' },
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
  assert.equal(checkNarration('"Who goes there?" the guard calls. Bryn, what do you say?', T.s).length, 0);
});

test('tools refuse in plain words and name what exists', () => {
  const T = table();
  hero(T, 'p1', 'Bryn');
  const B = toolbox({ state: T.s, adventure, srd, rng: makeRng(2), now: 1 });
  assert.match(B.run('ask_for_roll', { characters: ['Zed'], kind: 'check', skill: 'stealth', dc: 10, reason: 'x' }).refused, /Bryn/);
  assert.match(B.run('move_party', { place: 'sanctum' }).refused, /cannot be reached/);
  assert.match(B.run('monster_action', { monster: 'orc', action: 'Greataxe', targets: ['Bryn'] }).refused, /No monster/);
  const moved = B.run('move_party', { place: 'mill-road' });
  assert.equal(moved.arrived, 'The Mill Road');
  assert.match(B.run('nope', {}).refused, /no tool/);
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
    assert.match(B.run('monster_action', { monster: 'Goblin', action: 'Scimitar', targets: ['Bryn'] }).refused, /not Goblin's turn/);
    assert.match(B.run('end_turn', { whose: 'Goblin' }).refused, /Bryn's turn/);
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
