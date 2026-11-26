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
