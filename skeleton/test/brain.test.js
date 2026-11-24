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
