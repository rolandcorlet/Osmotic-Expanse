// Character options from a book (brain/options.js, brain/convert.js): races and subraces, backgrounds and
// feats read without the AI, saved with the book, merged into the rules so character creation lists them,
// and gone again when the book is removed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readOptions, optionMarks } from '../brain/options.js';
import * as CV from '../brain/convert.js';
import { srd as base, table } from './helpers.js';

const TEXT = `Mossfolk Traits
Your mossfolk character has traits shared by all mossfolk.
Ability Score Increase. Your Wisdom score
increases by 2.
Age. Mossfolk live about a century.
Alignment. Most mossfolk are neutral.
Size. Mossfolk stand about 4 feet tall. Your size is Small.
--- Page 3 ---
Damp Lore
A sidebar about the bogs that should not be read as a trait at all, however long it runs on.
Speed. Your base walking speed is 25 feet.
Bog Stride. Difficult terrain made of mud or shallow water
costs you no extra movement.
Languages. You can speak, read, and write Common and Sylvan.
Deep Moss
Deep mossfolk dwell in the oldest bogs and are slower to anger than their kin.
Ability Score Increase. Your Constitution score increases by 1.
Spongy Hide. You have resistance to poison damage.
Bog Warden
You have spent your life keeping the marsh paths open for travellers, who owe you their lives.
Skill Proficiencies: Survival, Nature
Tool Proficiencies: Herbalism kit
Languages: One of your choice
Equipment: A pole, a lantern, common clothes, and a belt
pouch containing 12 gp
Feature: Paths of the Fen
You always know a safe path through a marsh, and the people of the fens give you shelter.
Feats
Bogborn
You gain the following benefits:
• Increase your Constitution score by 1.
• You can hold your breath for an hour.
Fen Stalker
Prerequisite: Wisdom 13 or higher
You gain the following benefits:
• You have advantage on Stealth checks in marshes.
Lucky Toad
You have a toad that brings luck. Once per day you can reroll one d20.
Mire Master
You gain the following benefits:
• Mud does not slow you.
Chapter 7: Using Ability Scores
Ending
This chapter ends here.`;

test('the reader finds a race (past a sidebar), its subrace, a background and the feats chapter', () => {
  const o = readOptions(TEXT);
  assert.equal(optionMarks(TEXT) >= 3, true);
  assert.deepEqual(o.races.map((r) => [r.id, r.speed, r.size, r.bonus]), [['mossfolk', 25, 'Small', { wis: 2 }]]);
  assert.deepEqual(o.races[0].traits.map((t) => t.name), ['Bog Stride']);
  assert.deepEqual(o.races[0].languages, ['Common', 'Sylvan']);
  assert.deepEqual(o.subraces.map((s) => [s.race, s.id, s.bonus]), [['mossfolk', 'deep-moss', { con: 1 }]]);
  const b = o.backgrounds[0];
  assert.deepEqual([b.id, b.skills, b.languages, b.gold, b.feature.name], ['bog-warden', ['survival', 'nature'], 1, 12, 'Paths of the Fen']);
  assert.deepEqual(o.feats.map((f) => f.name), ['Bogborn', 'Fen Stalker', 'Lucky Toad', 'Mire Master']);
  assert.equal(o.feats[1].prereq, 'Wisdom 13 or higher');
  assert.match(o.feats[0].desc, /\n- Increase your Constitution score by 1\./);
});

test('saved and merged, character creation can build a mossfolk bog warden; removing the book takes them away', async () => {
  const srd = JSON.parse(JSON.stringify(base));
  const r = await CV.convertText({ text: TEXT, kind: 'auto', name: 'Fen Book', srd });
  assert.equal(r.kind, 'options');
  assert.ok(r.entries.some((e) => e.kind === 'race') && r.entries.some((e) => e.kind === 'feat'));
  const dir = mkdtempSync(join(tmpdir(), 'opts-'));
  const meta = CV.saveBook(dir, { name: 'Fen Book', kind: r.kind, original: TEXT, book: r.book });
  assert.equal(meta.counts.options, 7);
  const [saved] = CV.loadBooks(dir);
  const added = CV.mergeBook(srd, saved);
  assert.equal(added.options, 7);
  assert.ok(srd.races.find((x) => x.id === 'mossfolk').subraces.some((s) => s.id === 'deep-moss'));
  const T = table(3);
  T.s = { ...T.s };
  const ctx = { role: 'player', pid: 'p1', rng: () => 0.5, now: 1, srd };
  const { apply } = await import('../engine/ledger.js');
  let s = apply(T.s, { type: 'join', name: 'Ada' }, ctx);
  s = apply(s, { type: 'pc.create', input: { name: 'Moss', race: 'mossfolk', subrace: 'deep-moss', class: 'ranger', method: 'standard', base: { str: 10, dex: 14, con: 13, int: 8, wis: 15, cha: 12 }, skills: ['nature', 'stealth', 'perception'], background: 'bog-warden' } }, ctx);
  const pc = Object.values(s.pcs)[0];
  assert.equal(pc.speed, 25);
  assert.equal(pc.mods.wis, 3); // 15 + 2 (mossfolk)
  assert.equal(pc.mods.con, 2); // 13 + 1 (deep moss)
  assert.equal(pc.background, 'Bog Warden');
  const traits = JSON.stringify(pc.traits);
  assert.match(traits, /Bog Stride/);
  assert.match(traits, /Spongy Hide/);
  CV.unmergeBook(srd, saved.id);
  assert.ok(!srd.races.some((x) => x.id === 'mossfolk') && !srd.backgrounds.some((x) => x.id === 'bog-warden') && !srd.feats.some((x) => x.id === 'bogborn'));
});

const SUBCLASS_TEXT = `Druid Circles
Circle of Spores
Druids of the Circle of Spores find beauty in decay, seeing in mold and fungi the power to transform lifeless matter.
Halo of Spores
Starting at 2nd level, you are surrounded by invisible, necrotic spores that are harmless until you unleash them on a creature nearby.
Symbiotic Entity
Also starting at 2nd level, you gain the ability to channel magic into your spores.
Fungal Infestation
Starting at 6th level, your spores gain the ability to infest a corpse and animate it.
Hit Points
Hit Dice: 1d8 per level`;

test('a new subclass is read with its features by level, joins its class, and leaves with its book', async () => {
  const srd = JSON.parse(JSON.stringify(base));
  const o = readOptions(SUBCLASS_TEXT, { srd });
  assert.deepEqual(o.subclasses.map((s) => [s.cls, s.id, s.flavor]), [['druid', 'circle-of-spores', 'Druid Circle']]);
  assert.deepEqual(o.subclasses[0].levels, [{ level: 2, features: ['Halo of Spores', 'Symbiotic Entity'] }, { level: 6, features: ['Fungal Infestation'] }]);
  const dir = mkdtempSync(join(tmpdir(), 'opts-sc-'));
  const r = await CV.convertText({ text: SUBCLASS_TEXT, kind: 'options', name: 'Spore Book', srd });
  CV.saveBook(dir, { name: 'Spore Book', kind: r.kind, original: SUBCLASS_TEXT, book: r.book });
  const [saved] = CV.loadBooks(dir);
  CV.mergeBook(srd, saved);
  const druid = srd.classes.find((c) => c.id === 'druid');
  assert.ok(druid.subclasses.some((s) => s.id === 'circle-of-spores'));
  assert.match(druid.features['Halo of Spores'], /necrotic spores/);
  assert.doesNotMatch(druid.features['Fungal Infestation'], /Hit Dice/);
  const { derive } = await import('../engine/rules.js');
  const pc = derive({ name: 'Moss', race: 'human', class: 'druid', subclass: 'circle-of-spores', level: 6, method: 'standard', base: { str: 10, dex: 14, con: 13, int: 12, wis: 15, cha: 8 }, skills: ['nature', 'perception'], background: 'acolyte' }, srd);
  assert.ok(pc.features.some((f) => f.name === 'Fungal Infestation' && /animate/.test(f.desc)));
  CV.unmergeBook(srd, saved.id);
  assert.ok(!druid.subclasses.some((s) => s.id === 'circle-of-spores'));
  assert.equal(druid.features['Halo of Spores'], undefined);
});

test('a subclass the rules know only by name gets its features from the book, and its old self back after', async () => {
  const srd = JSON.parse(JSON.stringify(base));
  const druid = srd.classes.find((c) => c.id === 'druid');
  druid.subclasses.push({ id: 'spores', name: 'Circle of Spores', flavor: 'Druid Circle', desc: 'See your book.', levels: [], lib: true });
  const r = await CV.convertText({ text: SUBCLASS_TEXT, kind: 'options', name: 'Spore Book', srd });
  const dir = mkdtempSync(join(tmpdir(), 'opts-sc2-'));
  CV.saveBook(dir, { name: 'Spore Book', kind: r.kind, original: SUBCLASS_TEXT, book: r.book });
  const [saved] = CV.loadBooks(dir);
  CV.mergeBook(srd, saved);
  const sc = druid.subclasses.filter((s) => /spores/i.test(s.name));
  assert.equal(sc.length, 1);
  assert.equal(sc[0].levels.length, 2);
  CV.unmergeBook(srd, saved.id);
  const back = druid.subclasses.find((s) => s.id === 'spores');
  assert.deepEqual([back.levels, back.desc, back.conv], [[], 'See your book.', undefined]);
});

test('options in a layout the reader does not know are read by the AI, in the same shapes', async () => {
  const srd = JSON.parse(JSON.stringify(base));
  const text = 'Our homebrew page. The kenku-folk race: +2 Dex, +1 Wis, speed 30, they mimic sounds. The Sky Pilot background gives Acrobatics and Perception. The Featherfall feat lets you fall slowly.';
  const ask = async () => JSON.stringify({
    races: [{ name: 'Kenku-folk', speed: 30, size: 'Medium', bonus: { dex: 2, wis: 1 }, traits: [{ name: 'Mimicry', desc: 'You can mimic sounds you have heard.' }] }],
    backgrounds: [{ name: 'Sky Pilot', skills: ['Acrobatics', 'Perception'], gold: 10, feature: { name: 'Airborne', desc: 'You know the winds.' } }],
    feats: [{ name: 'Featherfall', desc: 'You fall slowly.' }],
  });
  const r = await CV.convertText({ text, kind: 'options', name: 'Homebrew', srd, ask });
  assert.deepEqual(r.book.races.map((x) => [x.id, x.bonus]), [['kenku-folk', { dex: 2, wis: 1 }]]);
  assert.deepEqual(r.book.backgrounds[0].skills, ['acrobatics', 'perception']);
  assert.deepEqual(r.book.feats.map((x) => x.id), ['featherfall']);
  assert.ok(r.notes.some((n) => /The AI read 3 character options/.test(n)));
  assert.ok(r.entries.some((e) => e.kind === 'race' && e.name === 'Kenku-folk'));
});

test('"Work it out" knows a page of subclass features for character options', async () => {
  const r = await CV.convertText({ text: SUBCLASS_TEXT, kind: 'auto', name: 'Spore Book', srd: JSON.parse(JSON.stringify(base)) });
  assert.equal(r.kind, 'options');
  assert.ok(r.entries.some((e) => e.kind === 'subclass' && e.name === 'Circle of Spores'));
});
