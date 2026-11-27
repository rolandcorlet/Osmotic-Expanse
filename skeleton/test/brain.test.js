import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { table, diver, mod } from './helpers.js';
import { toolbox } from '../brain/tools.js';
import { directorTurn, instructions, briefing, checkNarration } from '../brain/director.js';
import { convert, parseJson } from '../brain/converter.js';
import { makeRng } from '../engine/dice.js';

// A stand-in AI: replies come from a script (a list, or a function of the message).
function scripted(script) {
  return { start({ system }) {
    let i = 0;
    const next = (msg) => { const r = typeof script === 'function' ? script(msg, system) : script[Math.min(i++, script.length - 1)]; return Promise.resolve({ text: r.text || '', calls: (r.calls || []).map((c, n) => ({ id: `t${n}`, ...c })), usage: { in: 10, out: 5 } }); };
    return { send: (t) => next(t), results: (list) => next(JSON.stringify(list.map((x) => x.result))) };
  } };
}

test('the Director instructions use the module\'s own words', () => {
  const t = instructions(mod);
  assert.match(t, /Saltglass/); assert.match(t, /Crack/); assert.match(t, /Gleam/); assert.match(t, /Shallow 8/);
  assert.doesNotMatch(t, /\{\{/);
});
test('the briefing names the place, the party and hidden creatures for the Director only', () => {
  const T = table(); diver(T, 'p1', 0); T.host({ type: 'site.move', siteId: 'causeway' });
  const b = briefing(T.s, mod, { reason: 'test' });
  assert.match(b, /Sunken Causeway/); assert.match(b, /Moll Tarrow/); assert.match(b, /hidden/); assert.match(b, /Cold current/);
});
test('harmless slips are notes, not refusals; a swapped creature and target is read the obvious way', () => {
  const T = table(4); const m = diver(T, 'p1', 0); T.host({ type: 'site.move', siteId: 'causeway' });
  const B = toolbox({ state: T.s, mod, rng: makeRng(1) });
  assert.ok(B.run('end_combat', {}).note);
  assert.ok(B.run('ask_for_roll', { characters: ['Glass eel'], stat: 'brawn', difficulty: 'Standard', reason: 'x' }).note);
  assert.ok(B.run('start_combat', {}).ok);
  assert.ok(B.run('start_combat', {}).note);
  const eel = Object.values(B.state.creatures)[0];
  B.state.fight.turn = B.state.fight.order.findIndex((o) => o.key === `creature:${eel.id}`);
  const r = B.run('creature_attack', { creature: m.name, target: eel.name });
  assert.ok(!r.refused, JSON.stringify(r));
  assert.ok(B.run('creature_attack', { creature: eel.id, attack: 'Talk', target: m.id }).note);
  assert.equal(B.refusals, 0);
});
test('complete_quest reads "bell Bring the glass bell up"', () => {
  const T = table(); diver(T, 'p1', 0);
  const B = toolbox({ state: T.s, mod, rng: makeRng(1) });
  assert.ok(B.run('complete_quest', { quest: 'bell Bring the glass bell up to Lamp Dock.' }).ok);
});
test('complete_quest for a written quest never given is a note (27 Nov)', () => {
  const T = table(); diver(T, 'p1', 0);
  T.s.quests = T.s.quests.filter((q) => q.id !== 'saltmarks');
  const B = toolbox({ state: T.s, mod, rng: makeRng(1) });
  assert.match(B.run('complete_quest', { quest: 'saltmarks' }).note, /never took on a quest/);
  assert.ok(B.run('complete_quest', { quest: 'the dragon' }).refused);
});
test('a Director turn: a roll asked for in words is sent back to the tool, then narration', async () => {
  const T = table(); const m = diver(T, 'p1', 0);
  const provider = scripted([
    { text: 'Moll, make a Brawn check to swim against the current. What do you do?' },
    { calls: [{ name: 'ask_for_roll', args: { characters: [m.id], stat: 'brawn', skill: 'swim', difficulty: 'Standard', reason: 'the current' } }] },
    { text: 'The current drags at your legs and the lamp swings. Moll, do you push on?' },
  ]);
  const out = await directorTurn({ state: T.s, mod, provider, rng: makeRng(2), reason: 'test' });
  assert.equal(out.state.requests.length, 1);
  assert.equal(out.refusals, 0);
  assert.match(out.state.story.at(-1).text, /Moll, do you push on\?/);
});
test('the narration check catches a leak, a missing question and a creature narrated dead while standing', () => {
  const T = table(); diver(T, 'p1', 0); T.host({ type: 'site.move', siteId: 'causeway' });
  T.host({ type: 'creature.reveal' });
  const f = checkNarration('The engine says the Glass eel dies. It has 4 health.', T.s, mod).map((x) => x.text).join(' ');
  assert.match(f, /machinery/); assert.match(f, /question/); assert.match(f, /still standing/);
});
test('parseJson takes a fenced reply and forgives a trailing comma', () => {
  assert.deepEqual(parseJson('Here:\n```json\n{"a": [1, 2,],}\n```'), { a: [1, 2] });
});
test('the converter writes every section, sends problems back once, and ends with a valid module', async () => {
  const read = (f) => JSON.parse(readFileSync(new URL(`../modules/saltglass/${f}`, import.meta.url)));
  const files = { module: read('module.json'), rules: read('rules.json'), handbook: read('handbook.json'), bestiary: read('bestiary.json'), lore: read('lore.json'), adventure: read('adventures/bell-under-brine.json') };
  let brokeOnce = false;
  const provider = scripted((msg) => {
    if (/has problems/.test(msg)) return { text: JSON.stringify(files.rules) };
    const section = (msg.match(/SECTION: (\w+)/) || [])[1];
    if (section === 'rules' && !brokeOnce) { brokeOnce = true; const { ladder, ...rest } = files.rules; return { text: '```json\n' + JSON.stringify(rest) + '\n```' }; }
    const x = { ...files[section] };
    if (section === 'module') { delete x.format; x.id = 'saltglass-copy'; }
    return { text: JSON.stringify(x) };
  });
  const steps = [];
  const out = await convert({ provider, mode: 'invent', ideas: 'Divers in a drowned glass city.', onProgress: (p) => steps.push(`${p.section}:${p.stage}`) });
  assert.ok(out.ok, out.errors.join('\n'));
  assert.ok(steps.includes('rules:fixing'));
  assert.equal(out.mod.module.id, 'saltglass-copy');
  assert.equal(out.mod.adventures.length, 1);
});
test('an adventure whose rule names a creature it does not have is sent back to be fixed', async () => {
  const read = (f) => JSON.parse(readFileSync(new URL(`../modules/saltglass/${f}`, import.meta.url)));
  const good = read('adventures/bell-under-brine.json');
  const bad = JSON.parse(JSON.stringify(good));
  bad.sites[0].rules = [...(bad.sites[0].rules || []), { id: 'ghost', when: 'enter', do: 'reveal', who: 'no-such-thing' }];
  const sent = [];
  const provider = scripted((msg) => { sent.push(msg); return { text: JSON.stringify(/has problems/.test(msg) ? good : bad) }; });
  const out = await convert({ provider, mode: 'extend', source: 'x', existing: mod, sections: ['adventure'] });
  assert.ok(sent.some((m) => /has problems/.test(m) && /no-such-thing/.test(m)), 'the broken rule was sent back');
  assert.ok(out.ok, out.errors.join('\n'));
});
test('extend: new creatures are added to the bestiary and a new adventure uses them', async () => {
  const beasts = JSON.parse(readFileSync(new URL('../modules/saltglass/bestiary.json', import.meta.url)));
  const adv = JSON.parse(readFileSync(new URL('../modules/saltglass/adventures/bell-under-brine.json', import.meta.url)));
  const crab = { id: 'lantern-crab', name: 'Lantern crab', tier: 1, about: 'A crab with a lamp.', look: 'A glow.', health: 8, soak: 1, defence: 10, attacks: [{ name: 'Pinch', dice: 3, weapon: 1 }], tactics: 'Hides.', xp: 1 };
  const provider = scripted((msg) => {
    const section = (msg.match(/SECTION: (\w+)/) || [])[1];
    if (section === 'bestiary') return { text: JSON.stringify({ creatures: [...beasts.creatures, crab] }) };
    return { text: JSON.stringify({ ...adv, id: 'crab-cove', name: 'Crab Cove', sites: [{ ...adv.sites[0], exits: [], creatures: [{ id: 'lantern-crab', count: 3 }] }], quests: [{ id: 'crabs', text: 'Clear the cove.' }] }) };
  });
  const out = await convert({ provider, mode: 'extend', source: 'Lantern crabs live in the cove.', existing: mod });
  assert.ok(out.ok, out.errors.join('\n'));
  assert.equal(out.mod.bestiary.creatures.length, beasts.creatures.length + 1);
  assert.deepEqual(out.mod.adventures.map((a) => a.id).sort(), ['bell-under-brine', 'crab-cove']);
});
test('the converter passes a chosen dice system to the AI, and checks numbers against it', async () => {
  const seen = [];
  const provider = scripted((msg) => { seen.push(msg); return { text: '{}' }; });
  await convert({ provider, mode: 'invent', ideas: 'x', dice: 'd20', sections: ['module'] });
  assert.match(seen[0], /DICE SYSTEM: use "d20"/);
  const seen2 = [];
  await convert({ provider: scripted((msg) => { seen2.push(msg); return { text: '{}' }; }), mode: 'convert', source: 'rules', sections: ['module'] });
  assert.match(seen2[0], /keep the source's own dice/);
});

test('rolls that all succeed where a quest ends get one question: does that finish it?', async () => {
  const T = table(); diver(T, 'p1', 0);
  T.host({ type: 'narrate', text: 'Lamp Dock. What do you do?' });
  const seq = T.s.seq + 1;
  T.s.story.push({ id: 'e-test', seq, t: 0, kind: 'event', who: 'Engine', roll: true, text: 'Moll Tarrow rolls Nerve + Talk (3 dice): 5, success.' });
  T.s.seq = seq;
  let asked = 0;
  const provider = scripted((msg) => {
    if (/Those rolls all succeeded/.test(msg)) { asked += 1; return { calls: [{ name: 'complete_quest', args: { quest: 'bell' } }] }; }
    return { text: 'The bell is on the quay. Moll, what now?' };
  });
  const out = await directorTurn({ state: T.s, mod, provider, rng: makeRng(1), reason: 'rolls' });
  assert.equal(asked, 1);
  assert.ok(out.state.quests.find((q) => q.id === 'bell').done);
  // A failure among them: no question.
  const T2 = table(); diver(T2, 'p1', 0);
  T2.host({ type: 'narrate', text: 'Lamp Dock.' });
  T2.s.story.push({ id: 'e-t2', seq: T2.s.seq + 1, t: 0, kind: 'event', who: 'Engine', roll: true, text: 'Moll Tarrow rolls Nerve: 1, failure.' }); T2.s.seq += 1;
  let asked2 = 0;
  await directorTurn({ state: T2.s, mod, provider: scripted((msg) => { if (/Those rolls/.test(msg)) asked2 += 1; return { text: 'Moll, what now?' }; }), rng: makeRng(1), reason: 'rolls' });
  assert.equal(asked2, 0);
});

test('a creature that attacked and was left in its turn has the turn ended by the Engine', async () => {
  const T = table(4); const m = diver(T, 'p1', 0); T.host({ type: 'site.move', siteId: 'causeway' });
  const B = toolbox({ state: T.s, mod, rng: makeRng(1) });
  B.run('start_combat', {});
  const eel = Object.values(B.state.creatures).find((k) => k.siteId === 'causeway');
  B.state.fight.turn = B.state.fight.order.findIndex((o) => o.key === `creature:${eel.id}`);
  const provider = scripted([{ calls: [{ name: 'creature_attack', args: { creature: eel.id, target: m.id } }] }, { text: `The eel strikes. ${m.name}, what do you do?` }]);
  const out = await directorTurn({ state: B.state, mod, provider, rng: makeRng(2), reason: 'a creature is up' });
  assert.notEqual(out.state.fight && out.state.fight.order[out.state.fight.turn].key, `creature:${eel.id}`);
  assert.ok(out.flags.some((f) => /ended its turn/.test(f.text)));
});

test('a look-or-know roll before the player tries anything, with "what do you do?", is withdrawn; after "I look around" it stays', async () => {
  const look = mod.rules.skills.find((x) => /look|sense|lore|notice|search/i.test(`${x.id} ${x.name}`));
  for (const [said, kept] of [['I walk outside.', false], ['I step outside and look around where the lamp was.', true]]) {
    const T = table(); const m = diver(T, 'p1', 0);
    T.host({ type: 'narrate', text: 'The dock is quiet. What do you do?' });
    T.as('p1', { type: 'say', text: said });
    const provider = scripted([
      { calls: [{ name: 'ask_for_roll', args: { characters: [m.id], stat: look.stat, skill: look.id, difficulty: 'Standard', reason: 'Search the quay' } }] },
      { text: `The quay is wet and dark. ${m.name}, what do you do?` },
      { text: `Rain on the quay. ${m.name}, what do you do?` },
    ]);
    const out = await directorTurn({ state: T.s, mod, provider, rng: makeRng(1), reason: 'a player spoke' });
    assert.equal(out.state.requests.length, kept ? 1 : 0, said);
    assert.equal(out.state.story.some((e) => /^Roll asked:/.test(e.text)), kept, said);
  }
});

test('a player character who has used every action has the turn ended by the Engine (Gull Rock, 27 Nov)', () => {
  const T = table(4); const m = diver(T, 'p1', 0); T.host({ type: 'site.move', siteId: 'causeway' });
  T.host({ type: 'fight.start' });
  T.s.fight.turn = T.s.fight.order.findIndex((o) => o.key === `char:${m.id}`);
  T.s.fight.used = 0;
  const eel = Object.values(T.s.creatures).find((k) => k.siteId === 'causeway');
  eel.hidden = false; eel.down = false; eel.health = 999;
  const max = mod.rules.combat.actionsPerTurn;
  for (let n = 0; n < max; n++) {
    assert.equal(T.s.fight.order[T.s.fight.turn].key, `char:${m.id}`, 'still their turn until the last action');
    T.as('p1', { type: 'attack', charId: m.id, target: `creature:${eel.id}` });
    if (!T.s.fight) return;
  }
  assert.notEqual(T.s.fight.order[T.s.fight.turn].key, `char:${m.id}`);
  assert.ok(T.s.story.some((e) => /has used every action this turn/.test(e.text)));
});

test('plain words: a module word left unexplained gets its meaning added, and the table has met it (27 Nov)', async () => {
  const T = table(); const m = diver(T, 'p1', 0);
  const first = m.name.split(' ')[0];
  const out = await directorTurn({ state: T.s, mod, provider: scripted([{ text: `The water closes over you and your Breath runs short. ${first}, what do you do?` }]), rng: makeRng(2), reason: 'test' });
  assert.match(out.narration, /your Breath \(a diver's health\) runs short/);
  assert.ok(out.state.words.includes('Breath'));
  assert.match(briefing(out.state, mod), /PLAIN WORDS: the table already knows Breath/);
  // Once met, it is left alone.
  const again = await directorTurn({ state: out.state, mod, provider: scripted([{ text: `Your Breath steadies. ${first}, what now?` }]), rng: makeRng(3), reason: 'test' });
  assert.doesNotMatch(again.narration, /\(a diver's health\)/);
});
