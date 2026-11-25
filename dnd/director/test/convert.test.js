// The Books tab's converter (brain/convert.js): what is pasted is read into the Engine's shapes, shown
// entry by entry, saved beside its own words, and joins the rules; a campaign becomes an adventure.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as C from '../brain/convert.js';
import { srd } from './helpers.js';

const BLOCKS = `Bog Hag
Medium fey, neutral evil
Armor Class 16 (natural armor)
Hit Points 60 (11d8 + 11)
Speed 30 ft., swim 30 ft.
STR DEX CON INT WIS CHA
16 (+3) 12 (+1) 13 (+1) 12 (+1) 14 (+2) 13 (+1)
Saving Throws Wis +4
Senses darkvision 60 ft., passive Perception 12
Languages Common, Sylvan
Challenge 3 (700 XP)
Amphibious. The hag can breathe air and water.
Innate Spellcasting (1/Day). The hag can innately cast sleep, requiring no material components.
Actions
Multiattack. The hag makes two claw attacks and one bite attack.
Claw. Melee Weapon Attack: +5 to hit, reach 5 ft., one target. Hit: 7 (1d8 + 3) slashing damage.
Bite. Melee Weapon Attack: +5 to hit, reach 5 ft., one target. Hit: 6 (1d6 + 3) piercing damage, and the target
must succeed on a DC 11 Constitution saving throw or be poisoned for 1 minute.
Fetid Breath (Recharge 5–6). The hag exhales in a 15-foot cone. Each creature in it must make a DC 12 Constitution saving throw, taking 14 (4d6) poison damage on a failed save, or half as much damage on a successful one.

Goblin
Small humanoid (goblinoid), neutral evil
Armor Class 13
Hit Points 9 (2d6 + 2)
Speed 30 ft.
STR DEX CON INT WIS CHA
8 (-1) 14 (+2) 12 (+1) 10 (+0) 8 (-1) 8 (-1)
Senses passive Perception 9
Languages Goblin
Challenge 1/4 (50 XP)
Actions
Spear. Melee or Ranged Weapon Attack: +4 to hit, reach 5 ft. or range 20/60 ft., one target. Hit: 5 (1d6 + 2) piercing damage, or 6 (1d8 + 2) piercing damage if used with two hands to make a melee attack.`;

const SPELL = `Frost Lance
2nd-level evocation
Casting Time: 1 action
Range: 90 feet
Components: V, S, M (a sliver of ice)
Duration: Concentration, up to 1 minute
Classes: Sorcerer, Wizard
Make a ranged spell attack against a creature within range. On a hit, the target takes 3d8 cold damage and is restrained until the end of its next turn.
At Higher Levels. When you cast this spell using a spell slot of 3rd level or higher, the damage increases by 1d8 for each slot level above 2nd.`;

test('what it is: stat blocks, spells, rules text, JSON, a campaign', () => {
  assert.equal(C.sniffKind(BLOCKS).kind, 'monsters');
  assert.equal(C.sniffKind(SPELL).kind, 'spells');
  assert.equal(C.sniffKind('# Combat\nWhen a fight starts, everyone rolls initiative.').kind, 'rules');
  assert.equal(C.sniffKind('{"monsters":[]}').kind, 'json');
  const story = Array.from({ length: 12 }, (_, k) => `Area ${k + 1}. The Old Mill\nWhen the characters enter, read aloud: the wheel turns. The party hears a goblin encounter ahead. Dungeon Master: if the quest is taken, the adventure goes on.`).join('\n\n');
  assert.equal(C.sniffKind(story).kind, 'campaign');
});

test('the book reader reads stat blocks and spells in the usual layout, and a mix of both', async () => {
  const r = await C.convertText({ text: `${BLOCKS}\n\n${SPELL}`, name: 'Fen Bestiary', srd });
  assert.equal(r.kind, 'monsters');
  assert.deepEqual(r.entries.map((e) => e.name), ['Bog Hag', 'Goblin', 'Frost Lance']);
  const [hag, gob, lance] = r.entries;
  assert.equal(r.gaps, 0);
  assert.equal(hag.id, 'bog-hag');
  assert.equal(gob.id, 'fb-goblin', 'a name the SRD has gets the book\'s initials');
  assert.ok(hag.facts.some((f) => /Multiattack: 2 × Claw, 1 × Bite/.test(f)));
  assert.ok(hag.facts.some((f) => /Bite: \+5 to hit.*1d6\+3 piercing; then DC 11 Constitution save or poisoned/.test(f)), 'a wrapped line is joined');
  assert.ok(hag.facts.includes('Fetid Breath: 4d6 poison; DC 12 Constitution save, half on a success; Recharge 5-6'));
  assert.ok(hag.facts.includes('Innate Spellcasting (1/Day): sleep'));
  assert.ok(gob.facts.some((f) => /Spear: \+4 to hit.*1d6\+2 piercing$/.test(f)), 'the two-handed damage is an alternative, not more');
  assert.deepEqual(lance.facts.slice(1), ['3d8 cold, 10d8 at 9th', 'lands by: attack (ranged spell attack)', 'conditions: restrained']);
  const m = r.book.monsters[0];
  assert.deepEqual([m.ac, m.hp, m.cr, m.xp, m.saves.wis, m.ab[0], m.traits.length, m.actions.length], [16, 60, 3, 700, 4, 16, 2, 4]);
  const sp = r.book.spells[0];
  assert.deepEqual([sp.level, sp.school, sp.comp, sp.mat, sp.conc, sp.dur, sp.classes], [2, 'Evocation', 'VSM', 'a sliver of ice', true, 'Up to 1 minute', ['sorcerer', 'wizard']]);
});

test('every SRD stat block, written out in the usual layout, reads back with its numbers', () => {
  const book = JSON.parse(readFileSync(new URL('../../data/srd.json', import.meta.url), 'utf8'));
  const mod = (v) => `${v} (${Math.floor((v - 10) / 2) >= 0 ? '+' : ''}${Math.floor((v - 10) / 2)})`;
  const frac = (c) => ({ 0.125: '1/8', 0.25: '1/4', 0.5: '1/2' }[c] || String(c));
  const text = book.monsters.map((m) => [m.name, `${m.size} ${m.type}${m.sub ? ` (${m.sub})` : ''}, ${m.align}`, `Armor Class ${m.ac}${m.acNote ? ` (${m.acNote})` : ''}`, `Hit Points ${m.hp} (${m.hd})`, `Speed ${m.speed}`, 'STR DEX CON INT WIS CHA', m.ab.map(mod).join(' '), `Senses ${m.senses}`, `Languages ${m.lang}`, `Challenge ${frac(m.cr)} (${m.xp} XP)`,
    ...m.traits.map((t) => `${t.n}. ${t.d}`), 'Actions', ...m.actions.map((t) => `${t.n}${t.use ? ` (${t.use})` : ''}. ${t.d}`)].join('\n')).join('\n\n');
  const r = C.readStatBlocks(text);
  assert.equal(r.monsters.length, book.monsters.length);
  const by = Object.fromEntries(book.monsters.map((m) => [m.name, m]));
  const off = r.monsters.filter((m) => m.ac !== by[m.name].ac || m.hp !== by[m.name].hp || m.cr !== by[m.name].cr || JSON.stringify(m.ab) !== JSON.stringify(by[m.name].ab));
  assert.deepEqual(off.map((m) => m.name), []);
  assert.deepEqual(C.summarise({ monsters: r.monsters }).gaps, [], 'and the book compiler reads all of them');
});

test('rules text is cut into sections by its headings, for look-ups', async () => {
  const r = await C.convertText({ text: '# Weather\nRain gives disadvantage on Perception checks that rely on hearing and sight beyond 30 feet.\n\n# Travel\nA party moves 3 miles an hour at a normal pace, and may forage while it travels.', name: 'House Rules', srd });
  assert.equal(r.kind, 'rules');
  assert.deepEqual(r.book.rules.map((x) => [x.name, x.book]), [['Weather', 'House Rules'], ['Travel', 'House Rules']]);
});

test('the AI reads what the book reader cannot, and a campaign becomes a checked adventure', async () => {
  // An odd layout: the reader finds nothing; the AI writes the SRD shape and the compiler reads its words.
  const odd = 'MARSH TROLL (CR 2) -- AC 13, HP 45. Two claws (+5, 1d6+3 slashing each).';
  const ask = async (system, user) => {
    if (/stat block/.test(system)) return '```json\n[{"name":"Marsh Troll","size":"Large","type":"giant","align":"chaotic evil","ac":13,"hp":45,"speed":"30 ft.","ab":[17,10,15,6,9,7],"cr":2,"actions":[{"n":"Multiattack","d":"The troll makes two claw attacks."},{"n":"Claw","d":"Melee Weapon Attack: +5 to hit, reach 5 ft., one target. Hit: 6 (1d6 + 3) slashing damage."}]},]\n```';
    if (/List what it holds/.test(user)) return '{"places":[{"name":"The Ferry","summary":"a river crossing"},{"name":"The Hag\'s Hut","summary":"where the hag lives"}],"people":[],"monsters":[{"name":"Bog Hag","srd":""}],"quests":["Stop the hag"]}';
    if (/frame/.test(user)) return '{"id":"fen-ferry","name":"The Fen Ferry","levels":"1 to 2","party":{"size":[4,5],"level":1},"blurb":"A hag takes the ferry.","intro":"The ferry bell rings.","quests":["Stop the hag."],"questDone":[{"match":"stop the hag","at":["hut"],"when":"the hag is beaten"}],"sites":[{"id":"ferry","name":"The Ferry","level":1,"exits":[{"to":"hut","label":"across the river"}]},{"id":"hut","name":"The Hag\'s Hut","level":1,"exits":[{"to":"ferry","label":"back to the ferry"}]}]}';
    const site = /Write the whole site "([a-z-]+)"/.exec(user);
    if (site && site[1] === 'ferry') return '{"read":"A rope ferry over brown water.","notes":"The ferryman is scared.","foes":[{"monster":"goblin","count":2,"name":"River goblin"}]}';
    if (site) return '{"read":"A hut on stilts.","notes":"The hag waits.","foes":[{"monster":"bog-hag-typo","count":1,"name":"The hag"}]}';
    if (/checker found/.test(user)) return `{"read":"A hut on stilts.","notes":"The hag waits.","foes":[{"monster":"${/own monsters: ([a-z-]+)/.exec(user)[1]}","count":1,"name":"The hag"}]}`;
    throw new Error(`unexpected request: ${user.slice(0, 80)}`);
  };
  const a = await C.convertText({ text: odd, kind: 'monsters', name: 'Odd', srd, ask });
  assert.deepEqual(a.entries.map((e) => [e.name, e.gaps.length]), [['Marsh Troll', 0]]);
  assert.ok(a.entries[0].facts.includes('Multiattack: 2 × Claw'));
  const story = `The Fen Ferry\n\nThe Ferry. A rope ferry crosses the river.\n\n${BLOCKS.split('\n\nGoblin')[0]}\n\nThe Hag's Hut. The hag lives here.`;
  const steps = [];
  const c = await C.convertText({ text: story, kind: 'campaign', name: 'The Fen Ferry', srd, ask, onProgress: (p) => steps.push(p.step) });
  assert.equal(c.adventure.id, 'fen-ferry');
  assert.deepEqual(c.adventure.sites.map((x) => x.id), ['ferry', 'hut']);
  assert.equal(c.adventure.monsters[0].id, 'tff-bog-hag', 'its own stat block, read by the book reader');
  assert.equal(c.adventure.sites[1].foes[0].monster, 'tff-bog-hag', 'the checker\'s problem was sent back and fixed');
  assert.deepEqual(c.check.errors, []);
  assert.ok(steps.includes('Fixing what the checker found'));
  await assert.rejects(C.convertText({ text: story, kind: 'campaign', srd }), /set it up on the Director tab/);
});

test('a converted book is saved beside its words, joins the rules, and is set aside, not deleted', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'conv-'));
  const r = await C.convertText({ text: `${BLOCKS}\n\n${SPELL}`, name: 'Fen Bestiary', srd });
  const meta = C.saveBook(dir, { name: 'Fen Bestiary', kind: r.kind, original: BLOCKS, book: r.book });
  assert.deepEqual([meta.id, meta.counts, meta.gaps], ['fen-bestiary', { monsters: 2, spells: 1, rules: 0 }, 0]);
  for (const f of ['original.txt', 'book.json', 'book.engine.json', 'gaps.md']) assert.ok(existsSync(join(dir, 'fen-bestiary', f)), f);
  assert.equal(readFileSync(join(dir, 'fen-bestiary', 'original.txt'), 'utf8'), BLOCKS);
  const [eng] = C.loadBooks(dir);
  assert.ok(eng.monsters[0].eng && eng.monsters[0].actions[0].multi, 'the engine version is compiled');
  const s = JSON.parse(JSON.stringify(srd));
  const added = C.mergeBook(s, eng);
  assert.deepEqual(added, { monsters: 2, spells: 1, rules: 0 });
  assert.ok(s.monsters.some((m) => m.id === 'bog-hag' && m.lib === 'Fen Bestiary'));
  assert.equal(C.saveBook(dir, { name: 'Fen Bestiary', kind: 'monsters', original: '', book: r.book }).id, 'fen-bestiary-2', 'a second copy is kept apart');
  assert.ok(C.removeBook(dir, 'fen-bestiary'));
  assert.deepEqual(C.listBooks(dir).map((b) => b.id), ['fen-bestiary-2']);
  assert.equal(readdirSync(join(dir, '_removed')).length, 1);
  const adir = mkdtempSync(join(tmpdir(), 'adv-'));
  C.saveAdventure(adir, { id: 'Fen Ferry', name: 'The Fen Ferry', sites: [{ id: 'ferry', name: 'The Ferry', exits: [] }] }, 'the words');
  assert.deepEqual(C.loadAdventures(adir).map((x) => [x.id, x.sites.length, !!x.converted]), [['fen-ferry', 1, true]]);
});
