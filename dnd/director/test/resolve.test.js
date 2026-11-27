// The shared refusal layer: every "no" is nothing-to-change, fixed (with what was assumed), or a real no
// with the valid choices, for the screens and for every Director tool alike.
import test from 'node:test';
import assert from 'node:assert/strict';
import { attempt, explain } from '../engine/ledger.js';
import { toolbox } from '../brain/tools.js';
import { makeRng } from '../engine/dice.js';
import { srd, adventure, table, hero } from './helpers.js';

const ctxOf = (T, extra = {}) => ({ role: 'host', pid: null, rng: makeRng(5), now: 5, adventure, srd, ...extra });

test('attempt sorts every answer into done, nothing changed or refused', () => {
  const T = table(3);
  hero(T, 'p1', 'Bryn');
  T.host({ type: 'site.move', siteId: 'mill-road' });
  T.host({ type: 'fight.start', autoRoll: true });
  const again = attempt(T.s, { type: 'fight.start' }, ctxOf(T));
  assert.equal(again.status, 'nochange');
  assert.match(again.text, /^Nothing changed: A fight is already on/);
  assert.equal(again.state, T.s, 'nothing changed means the same state');
  const nowhere = attempt(T.s, { type: 'quest.done', id: 'slay the dragon of the moon' }, ctxOf(T));
  assert.equal(nowhere.status, 'refused');
  assert.ok(nowhere.options.length >= 1, 'the open quests are the choices');
  const near = attempt(T.s, { type: 'cond.add', target: 'Goblin scot 2', cond: 'knocked prone' }, ctxOf(T));
  assert.equal(near.status, 'done');
  assert.match(near.text, /Assumed: "Goblin scot 2" is Goblin scout 2\. "knocked prone" is the condition prone\./);
});

test('explain adds the choices only when the words do not already list them', () => {
  assert.equal(explain({ status: 'refused', message: 'No such zone. Zones: Road, Mill.', options: ['Road', 'Mill'] }), 'No such zone. Zones: Road, Mill.');
  assert.equal(explain({ status: 'refused', message: 'No such zone.', options: ['Road', 'Mill'] }), 'No such zone. Choose from: Road, Mill.');
  assert.equal(explain({ status: 'nochange', message: 'Nothing is hidden here.', hint: 'Carry on.' }), 'Nothing changed: Nothing is hidden here. Carry on.');
});

test('the Engine fixes what has one obvious reading, and says so', () => {
  const T = table(4);
  const bryn = hero(T, 'p1', 'Bryn');
  T.host({ type: 'site.move', siteId: 'mill-road' });
  // A save named by a skill is that skill's ability; no DC is a medium one.
  let r = attempt(T.s, { type: 'roll.ask', pcIds: [bryn.id], kind: 'save', skill: 'acrobatics', reason: 'the slick slabs' }, ctxOf(T, { ai: true }));
  assert.equal(r.status, 'done');
  const q = r.state.requests.at(-1);
  assert.equal(q.ability, 'dex');
  assert.equal(q.dc, 13);
  assert.match(r.text, /a Dexterity save/);
  // A plural or near monster name.
  r = attempt(T.s, { type: 'foe.add', monster: 'giant rats', count: 2 }, ctxOf(T, { ai: true }));
  assert.equal(r.status, 'done');
  assert.ok(Object.values(r.state.foes).some((f) => f.mid === 'giant-rat'));
  // An attack named loosely.
  r = attempt(T.s, { type: 'attack', pcId: bryn.id, attack: 'battle axe', target: 'Goblin scout 1' }, ctxOf(T));
  assert.equal(r.status, 'done', r.text);
  // A place named by the words of an exit: from the Mill Road, "the watchtower" is the path up to the gate.
  r = attempt(T.s, { type: 'site.move', siteId: 'the old watchtower' }, ctxOf(T, { ai: true }));
  assert.equal(r.status, 'done', r.text);
  assert.equal(r.state.scene.siteId, 'tower-gate');
  assert.match(r.text, /The way to "the old watchtower" from here/);
});

test('a monster weapon by another name is used, a spell it lacks is nothing changed with its choices', () => {
  const T = table(6);
  const ila = hero(T, 'p1', 'Ila', 'cleric');
  T.host({ type: 'foe.add', monster: 'skeleton', count: 1, name: 'Bones' });
  const foe = Object.values(T.s.foes).find((f) => f.name === 'Bones');
  let r = attempt(T.s, { type: 'foe.act', foeId: foe.id, action: 'Scimitar', targets: [ila.id] }, ctxOf(T, { ai: true }));
  assert.equal(r.status, 'done');
  assert.match(r.text, /Bones has no Scimitar: it attacks with its Shortsword/);
  r = attempt(T.s, { type: 'foe.act', foeId: foe.id, action: 'Fireball', targets: [ila.id] }, ctxOf(T, { ai: true }));
  assert.equal(r.status, 'nochange');
  assert.ok(r.options.includes('Shortsword'));
});

test('every Director tool answers in the same three ways', () => {
  const T = table(8);
  hero(T, 'p1', 'Bryn');
  T.host({ type: 'site.move', siteId: 'mill-road' });
  const tb = toolbox({ state: T.s, adventure, srd, rng: makeRng(2), now: 2 });
  assert.ok(!tb.run('start_combat', {}).refused);
  const twice = tb.run('start_combat', {});
  assert.match(twice.note, /^Nothing changed: A fight is already on/);
  assert.ok(twice.fight || twice.round || twice.waiting_on, 'with where the fight stands');
  const travel = tb.run('move_party', { place: 'thornwick' });
  assert.match(travel.note, /Nothing changed: The party cannot travel during a fight/);
  const quest = tb.run('complete_quest', { quest: 'the dragon' });
  assert.match(quest.refused, /There is no such quest/);
  assert.equal(tb.refusals, 1);
});

test('completing a written quest the party was never given is a note (bench part 4, 27 Nov)', () => {
  const T = table(8);
  hero(T, 'p1', 'Bryn');
  const adv = { ...adventure, questDone: [...(adventure.questDone || []), { match: 'blackreed', at: ['blackreed'], when: 'the mill is cleared' }] };
  const tb = toolbox({ state: T.s, adventure: adv, srd, rng: makeRng(2), now: 2 });
  const r = tb.run('complete_quest', { quest: 'blackreed' });
  assert.match(r.note, /never took on a quest for "blackreed"/);
  assert.equal(tb.refusals, 0);
});

test('monsters that only may turn up stay out of a fight until named or revealed (Encounters in the Far North, 27 Nov)', () => {
  const T = table(8);
  hero(T, 'p1', 'Bryn');
  T.host({ type: 'site.move', siteId: 'mill-road' });
  for (const f of Object.values(T.s.foes)) delete T.s.foes[f.id];
  T.host({ type: 'foe.add', monster: 'cultist', count: 2, hidden: true, maybe: true, group: 'm#0' });
  T.host({ type: 'foe.add', monster: 'kobold', count: 3, hidden: true, maybe: true, group: 'm#1' });
  const tb = toolbox({ state: T.s, adventure, srd, rng: makeRng(2), now: 2 });
  const none = tb.run('start_combat', {});
  assert.match(none.note, /only may turn up/);
  assert.equal(tb.refusals, 0);
  const named = tb.run('start_combat', { monsters: ['Kobold 1'] });
  assert.ok(!named.refused, JSON.stringify(named));
  const inFight = tb.state.fight.order.map((o) => o.key).filter((k) => k.startsWith('foe:')).map((k) => tb.state.foes[k.slice(4)].base);
  assert.deepEqual([...new Set(inFight)], ['Kobold'], 'the whole kobold group, no cultists');
  assert.equal(inFight.length, 3);
});

test('another attack after its Multiattack ends the monster\'s turn instead of a note to end it (Far North bench, 27 Nov)', () => {
  const T = table(8);
  hero(T, 'p1', 'Bryn');
  T.host({ type: 'site.move', siteId: 'mill-road' });
  for (const f of Object.values(T.s.foes)) delete T.s.foes[f.id];
  T.host({ type: 'foe.add', monster: 'owlbear', count: 1 });
  T.host({ type: 'fight.start', autoRoll: true });
  if (T.s.fight.phase === 'initiative') T.host({ type: 'fight.begin' });
  const ob = Object.values(T.s.foes)[0];
  T.s.fight.turn = T.s.fight.order.findIndex((o) => o.key === `foe:${ob.id}`);
  const tb = toolbox({ state: T.s, adventure, srd, rng: makeRng(2), now: 2 });
  const pc = Object.values(tb.state.pcs)[0];
  tb.run('monster_action', { monster: ob.name, action: 'Multiattack', targets: [pc.name] });
  if (!tb.state.fight || tb.state.fight.order[tb.state.fight.turn].key !== `foe:${ob.id}`) return; // the fight moved on by itself
  const again = tb.run('monster_action', { monster: ob.name, action: 'Claws', targets: [pc.name] });
  assert.match(again.note || '', /ended its turn/, JSON.stringify(again));
  assert.notEqual(tb.state.fight.order[tb.state.fight.turn].key, `foe:${ob.id}`);
  assert.equal(tb.refusals, 0);
});

test('a linked picture shows once, the first time the party reaches its place or fights its monster', async () => {
  const { linkArt } = await import('../engine/pictures.js');
  const url = (c) => `/maps/${c.repeat(24)}.jpg`;
  const adv = linkArt({ ...adventure, pictures: [
    { url: url('a'), w: 4, h: 3, kind: 'art', about: `The ${adventure.sites[1].name} at dusk.` },
    { url: url('b'), w: 4, h: 3, kind: 'art', about: 'A bugbear sneers.' },
    { url: url('c'), w: 4, h: 3, kind: 'art', about: 'The cover.' }] });
  const T = table(8, { adv });
  hero(T, 'p1', 'Bryn');
  const to = adventure.sites[1].id;
  T.host({ type: 'site.move', siteId: to });
  assert.equal(T.s.art.now.url, url('a'), 'arriving at its place');
  assert.equal(T.s.art.now.n, 1);
  T.host({ type: 'art.close' });
  assert.equal(T.s.art.now, null);
  for (const f of Object.values(T.s.foes)) delete T.s.foes[f.id];
  T.host({ type: 'foe.add', monster: 'bugbear', count: 1 });
  T.host({ type: 'fight.start' });
  assert.equal(T.s.art.now.url, url('b'), 'its monster in the fight');
  T.host({ type: 'art.close' });
  T.host({ type: 'fight.end', xp: false });
  T.host({ type: 'site.move', siteId: adventure.sites[0].id });
  assert.equal(T.s.art.now, null, 'no picture there');
  // The DM shows any of the adventure's own again; nothing else.
  T.host({ type: 'art.show', url: url('a') });
  assert.equal(T.s.art.now.n, 3);
  assert.throws(() => T.host({ type: 'art.show', url: url('d') }), /not one of this adventure/);
  assert.throws(() => T.as('p1', { type: 'art.close' }));
});

test('an old save with no pictures state takes a picture without trouble', () => {
  const T = table(8, { adv: { ...adventure, pictures: [{ url: `/maps/${'e'.repeat(24)}.jpg`, w: 1, h: 1, kind: 'art', about: 'x' }] } });
  delete T.s.art;
  T.host({ type: 'art.show', url: `/maps/${'e'.repeat(24)}.jpg` });
  assert.equal(T.s.art.now.n, 1);
});

test('a quest the adventure\'s rules use as a mark is set, not refused, and its rule stops (Far North bench, 27 Nov)', () => {
  const sites = adventure.sites.map((x) => ({ ...x }));
  sites[1] = { ...sites[1], foes: [], rules: [{ id: 'snowman-animates', when: 'enter', if: 'not quest snowman-resolved', do: 'say', say: 'The snowman stirs.', once: false }] };
  const adv = { ...adventure, sites };
  const run = (mark) => {
    const T = table(8, { adv });
    hero(T, 'p1', 'Bryn');
    const stirs = () => [...T.s.story, ...T.s.log].filter((e) => /snowman stirs/i.test(e.text || '')).length;
    T.host({ type: 'site.move', siteId: sites[1].id });
    const first = stirs();
    if (mark) T.ai({ type: 'quest.done', id: 'snowman-resolved' });
    T.host({ type: 'site.move', siteId: sites[0].id });
    T.host({ type: 'site.move', siteId: sites[1].id });
    return { first, again: stirs() - first, marks: T.s.marks || [] };
  };
  const plain = run(false);
  assert.equal(plain.first, 1);
  assert.equal(plain.again, 1, 'without the mark it stirs every time');
  const marked = run(true);
  assert.deepEqual(marked.marks, ['snowman-resolved']);
  assert.equal(marked.again, 0, 'it does not stir again once the mark is set');
  // A quest name no rule uses is still refused.
  const T = table(8, { adv });
  assert.throws(() => T.ai({ type: 'quest.done', id: 'dragon-slain' }), /no such quest/);
});

test('the Director\'s complete_quest sets a mark the rules use, and still refuses a made-up quest (Far North bench, 27 Nov)', () => {
  const sites = adventure.sites.map((x) => ({ ...x }));
  sites[0] = { ...sites[0], rules: [{ id: 'snowman-defeat', when: 'cleared', do: 'quest', quest: 'snowman-resolved' }] };
  const adv = { ...adventure, sites };
  const T = table(8, { adv });
  hero(T, 'p1', 'Bryn');
  const tb = toolbox({ state: T.s, adventure: adv, srd, rng: makeRng(2), now: 2 });
  const set = tb.run('complete_quest', { quest: 'snowman-resolved' });
  assert.equal(set.ok, true);
  assert.match(set.assumed, /a mark the adventure's rules use/);
  assert.deepEqual(tb.state.marks, ['snowman-resolved']);
  assert.match(tb.run('complete_quest', { quest: 'snowman-resolved' }).note, /already done/);
  assert.match(tb.run('complete_quest', { quest: 'dragon-slain' }).refused, /no such quest/);
});

test('the wrong one of a group whose turn it is: the one whose turn it is acts (Far North bench, 27 Nov)', () => {
  const T = table(8);
  hero(T, 'p1', 'Bryn');
  for (const f of Object.values(T.s.foes)) delete T.s.foes[f.id];
  T.host({ type: 'foe.add', monster: 'goblin', count: 3 });
  T.host({ type: 'foe.add', monster: 'bugbear', count: 1 });
  T.host({ type: 'fight.start', autoRoll: true });
  if (T.s.fight.phase === 'initiative') T.host({ type: 'fight.begin' });
  const k = T.s.fight.order.findIndex((o) => o.key.startsWith('foe:') && T.s.foes[o.key.slice(4)].base === 'Goblin');
  T.s.fight.turn = k;
  const now = T.s.foes[T.s.fight.order[k].key.slice(4)];
  const other = Object.values(T.s.foes).find((x) => x.base === 'Goblin' && x.id !== now.id);
  const bug = Object.values(T.s.foes).find((x) => x.base === 'Bugbear');
  const tb = toolbox({ state: T.s, adventure, srd, rng: makeRng(2), now: 2 });
  const out = tb.run('monster_action', { monster: other.name, action: 'Scimitar', targets: ['Bryn'] });
  assert.ok(!/It is not/.test(out.note || ''), JSON.stringify(out));
  assert.match(out.assumed || '', new RegExp(`It is ${now.name}'s turn`));
  // Another kind of monster is still told it is not its turn.
  const no = tb.run('monster_action', { monster: bug.name, action: 'Morningstar', targets: ['Bryn'] });
  assert.match(no.note || no.refused || '', /not .*turn/);
});
