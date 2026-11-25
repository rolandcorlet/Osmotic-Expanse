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

// ---- a PDF's pictures ---------------------------------------------------------------------------
const HOUND = `Mire Hound
Medium beast, unaligned
Armor Class 13 (natural armor)
Hit Points 19 (3d8 + 6)
Speed 40 ft., swim 30 ft.
STR DEX CON INT WIS CHA
14 (+2) 14 (+2) 15 (+2) 3 (-4) 12 (+1) 6 (-2)
Senses passive Perception 13
Languages -
Challenge 1/2 (100 XP)
Keen Smell. The hound has advantage on Wisdom (Perception) checks that rely on smell.
Actions
Bite. Melee Weapon Attack: +4 to hit, reach 5 ft., one target. Hit: 7 (1d10 + 2) piercing damage.`;
const PDF_TEXT = `--- Page 1 ---\nThe Fen Ferry\n\nThe Ferry. A rope ferry crosses the river.\n\n--- Page 2 ---\nThe Old Mill. The miller's ghost walks here.\nMap 1: The Old Mill\n\n--- Page 3 ---\n\n\n--- Page 4 ---\nThe end of the chapter.`;
const PDF_PICS = [
  { n: 1, page: 2, w: 749, h: 500, mime: 'image/jpeg', data: 'AAAA', scanned: false },
  { n: 2, page: 3, w: 980, h: 1268, mime: 'image/jpeg', data: 'BBBB', scanned: true },
  { n: 3, page: 1, w: 120, h: 90, mime: 'image/jpeg', data: 'CCCC', scanned: false },
];
const looks = (data) => (data === 'AAAA' ? '{"kind":"map","about":"A two-storey mill by a stream","place":"The Old Mill","grid":{"cols":0,"rows":0},"text":""}'
  : data === 'BBBB' ? JSON.stringify({ kind: 'stat-block', about: 'The Mire Hound', place: '', grid: null, text: HOUND })
  : '```json\n{"kind":"decoration","about":"a leaf ornament"}\n```');

test('a PDF\'s pictures: the AI reads the words in a scanned stat block, and a map goes to its place', async () => {
  const seen = [];
  const ask = async (system, user, images = []) => {
    if (system === C.SEE_GUIDE) { seen.push({ user, images }); return looks(images[0].data); }
    assert.equal(images.length, 0, 'only the picture questions carry pictures');
    if (/List what it holds/.test(user)) return '{"places":[{"name":"The Ferry"},{"name":"The Old Mill"}],"people":[],"monsters":[{"name":"Mire Hound","srd":""}],"quests":["Lay the ghost"]}';
    if (/frame/.test(user)) return '{"id":"fen-ferry","name":"The Fen Ferry","levels":"1 to 2","party":{"size":[4,5],"level":1},"blurb":"A ghost at the mill.","intro":"The ferry bell rings.","quests":["Lay the ghost."],"sites":[{"id":"ferry","name":"The Ferry","level":1,"exits":[{"to":"old-mill","label":"up the stream"}]},{"id":"old-mill","name":"The Old Mill","level":1,"exits":[{"to":"ferry","label":"back down"}]}]}';
    const site = /Write the whole site "([a-z-]+)"/.exec(user);
    if (site && site[1] === 'ferry') return '{"read":"A rope ferry over brown water.","notes":"The ferryman is scared."}';
    if (site) return `{"read":"A mill with a still wheel.","notes":"Hounds nose round it.","foes":[{"monster":"${/own monsters: ([a-z-]+)/.exec(user)[1]}","count":2,"name":"Mire hound"}]}`;
    throw new Error(`unexpected request: ${user.slice(0, 80)}`);
  };
  const steps = [];
  const c = await C.convertText({ text: PDF_TEXT, kind: 'campaign', name: 'The Fen Ferry', srd, ask, pictures: PDF_PICS, canSee: true, onProgress: (p) => steps.push(p.step) });
  assert.ok(steps.includes('Looking at the pictures'));
  assert.equal(seen.length, 3);
  assert.match(seen[0].user, /page 2/);
  assert.match(seen[0].user, /Map 1: The Old Mill/, 'the words on the picture\'s page help name it');
  assert.deepEqual(seen[0].images, [{ mime: 'image/jpeg', data: 'AAAA' }]);
  assert.match(seen[1].user, /scanned/);
  assert.deepEqual(c.pictures.map((p) => [p.n, p.kind, p.use]), [[1, 'map', 'site:old-mill'], [2, 'stat-block', 'skip'], [3, 'decoration', 'skip']]);
  assert.equal(c.adventure.monsters[0].name, 'Mire Hound', 'the scanned stat block was read with the text');
  assert.equal(c.adventure.sites[1].foes[0].monster, c.adventure.monsters[0].id);
  assert.ok(c.notes.some((n) => /Maps given to their places: The Old Mill → The Old Mill/.test(n)));
  assert.ok(c.words.indexOf('Mire Hound') > c.words.indexOf('--- Page 3 ---') && c.words.indexOf('Mire Hound') < c.words.indexOf('--- Page 4 ---'), 'the picture\'s words sit on its own page');
  assert.match(c.words, /\[Map of a place, picture 1: A two-storey mill by a stream \(The Old Mill\)\]/);
  assert.deepEqual(C.pictureUses(c).map(([u]) => u), ['keep', 'skip', 'travel', 'site:ferry', 'site:old-mill']);
});

test('a scanned bestiary page is read by the book reader once the AI has read its words', async () => {
  const ask = async (system, user, images) => (system === C.SEE_GUIDE ? looks(images[0].data) : '[]');
  const r = await C.convertText({ text: '--- Page 1 ---\n\n', kind: 'auto', name: 'Scans', srd, ask, pictures: [{ ...PDF_PICS[1], page: 1 }] });
  assert.deepEqual(r.entries.map((e) => [e.name, e.gaps.length]), [['Mire Hound', 0]]);
  assert.ok(r.entries[0].facts.some((f) => /Bite/.test(f)));
});

test('without an AI that can see, the pictures are kept for the DM to say what they are', async () => {
  const none = await C.convertText({ text: BLOCKS, kind: 'monsters', srd, pictures: PDF_PICS });
  assert.deepEqual(none.pictures.map((p) => [p.kind, p.use, p.seen]), [['', 'keep', false], ['page', 'keep', false], ['', 'keep', false]]);
  assert.ok(none.notes.some((n) => /not looked at: set up an AI/.test(n)));
  let calls = 0;
  const blind = await C.convertText({ text: BLOCKS, kind: 'monsters', srd, pictures: PDF_PICS, canSee: false, ask: async () => { calls++; return '[]'; } });
  assert.equal(calls, 0, 'a model that cannot see is not asked');
  assert.ok(blind.notes.some((n) => /cannot see pictures/.test(n)));
  // A model that refuses pictures is asked twice, not once per picture.
  let tries = 0;
  const refuses = await C.convertText({ text: BLOCKS, kind: 'monsters', srd, pictures: PDF_PICS, ask: async (s) => { if (s === C.SEE_GUIDE) { tries++; throw new Error('this model does not support images'); } return '[]'; } });
  assert.equal(tries, 2);
  assert.ok(refuses.notes.some((n) => /could not look at the pictures \(this model does not support images\)/.test(n)));
  assert.ok(refuses.entries.some((e) => e.name === 'Bog Hag'), 'the text is still read');
});

test('saved pictures sit beside the adventure, and a new game opens with its maps', async () => {
  const { newSession } = await import('../engine/ledger.js');
  const lib = mkdtempSync(join(tmpdir(), 'lib-'));
  const name = '0123456789abcdef01234567.jpg';
  const adv = C.saveAdventure(join(lib, 'adventures'), { id: 'fen', name: 'Fen', sites: [{ id: 'mill', name: 'Mill', picture: { url: `/maps/${name}`, w: 749, h: 500 } }, { id: 'ferry', name: 'Ferry' }], travelPicture: { url: '/maps/0123456789abcdef01234568.png', w: 300, h: 200 } }, 'words', [{ name, bytes: Buffer.from([0xff, 0xd8, 0xff, 0, 0, 0, 0, 0, 0, 0, 0, 0]) }, { name: '../evil.jpg', bytes: Buffer.from('x') }]);
  assert.deepEqual(readdirSync(join(lib, 'adventures', 'fen.pictures')), [name], 'only a picture\'s own name is written');
  assert.deepEqual(C.libraryPictures(lib), [join(lib, 'adventures', 'fen.pictures', name)]);
  const s = newSession(adv);
  assert.deepEqual(s.map.sites.mill, { url: `/maps/${name}`, w: 749, h: 500, cols: 0, rows: 0, walls: [], doors: [] });
  assert.equal(s.map.sites.ferry, undefined);
  assert.equal(s.map.travel.url, '/maps/0123456789abcdef01234568.png');
  assert.deepEqual(newSession({ id: 'x', sites: [{ id: 'a', picture: { url: 'https://example.com/x.jpg', w: 1, h: 1 } }] }).map.sites, {}, 'only the maps store\'s own pictures');
  const book = C.saveBook(join(lib, 'converted'), { name: 'With art', kind: 'monsters', original: BLOCKS, book: { monsters: [], spells: [], rules: [] }, pictures: [{ url: `/maps/${name}`, w: 1, h: 1, kind: 'art', about: 'a hag', page: 2 }], files: [{ name, bytes: Buffer.from([0xff, 0xd8, 0xff]) }] });
  assert.equal(JSON.parse(readFileSync(join(lib, 'converted', book.id, 'book.json'), 'utf8')).pictures[0].about, 'a hag');
  assert.equal(C.libraryPictures(lib).length, 2);
});

test('each AI maker is sent the pictures in its own shape', async () => {
  const bodies = [];
  const fake = (reply) => async (url, opts) => { bodies.push(JSON.parse(opts.body)); return { ok: true, status: 200, json: async () => reply }; };
  const img = [{ mime: 'image/jpeg', data: 'QUJD' }];
  const { openaiLike } = await import('../brain/openai.js');
  const { anthropic } = await import('../brain/anthropic.js');
  const { ollama } = await import('../brain/ollama.js');
  const { gemini } = await import('../brain/gemini.js');
  await openaiLike({ baseUrl: 'http://x/v1', model: 'm', fetchImpl: fake({ choices: [{ message: { content: 'ok' } }] }) }).start({ system: 's', tools: [] }).send('look', img);
  await anthropic({ apiKey: 'k', model: 'm', fetchImpl: fake({ content: [{ type: 'text', text: 'ok' }] }) }).start({ system: 's', tools: [] }).send('look', img);
  await ollama({ baseUrl: 'http://x', model: 'm', fetchImpl: fake({ message: { content: 'ok' } }) }).start({ system: 's', tools: [] }).send('look', img);
  await gemini({ apiKey: 'k', model: 'm', fetchImpl: fake({ candidates: [{ finishReason: 'STOP', content: { role: 'model', parts: [{ text: 'ok' }] } }] }) }).start({ system: 's', tools: [] }).send('look', img);
  const last = (b) => (b.messages || b.contents).at(-1);
  assert.deepEqual(last(bodies[0]).content, [{ type: 'text', text: 'look' }, { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,QUJD' } }]);
  assert.deepEqual(last(bodies[1]).content, [{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'QUJD' } }, { type: 'text', text: 'look' }]);
  assert.deepEqual(last(bodies[2]), { role: 'user', content: 'look', images: ['QUJD'] });
  assert.deepEqual(last(bodies[3]).parts, [{ text: 'look' }, { inline_data: { mime_type: 'image/jpeg', data: 'QUJD' } }]);
  // Without pictures, nothing changes.
  await openaiLike({ baseUrl: 'http://x/v1', model: 'm', fetchImpl: fake({ choices: [{ message: { content: 'ok' } }] }) }).start({ system: 's', tools: [] }).send('words');
  assert.equal(last(bodies[4]).content, 'words');
});
