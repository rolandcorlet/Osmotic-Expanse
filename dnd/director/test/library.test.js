// The book importer's parsers, on small made-up samples written for these tests (no book text), and
// the merge into the SRD.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseSpellList, parseCharGen, parseMonsters, parseRulesBook, sniff, subclassId, mend } from '../tools/books.js';
import { mergeLibrary } from '../engine/library.js';
import { lookUp } from '../brain/tools.js';

const SPELLS = `SAMPLE SPELL LIST - COMPLETE SPELL LIST
Fields: school, level.

EMBER WARD (RITUAL)
    Level/School: 2 abjuration
    Casting Time: 1 action
    Range: Self
    Components: V, S, M (a pinch of ash)
    Duration: Concentration, up to 10 minutes
    Classes: cleric, wizard
    A ward of embers circles you. Each creature that ends its turn within 10 feet of you must make a Dexterity saving throw, taking 2d6 fire damage on a failed save, or half as much damage on a successful one.
    At Higher Levels. When you cast this spell using a spell slot of 3rd level or higher, the damage increases by 1d6 for each slot level above 2nd.

MENDING TOUCH
    Level/School: 1 evocation
    Casting Time: 1 action
    Range: Touch
    Components: V, S
    Duration: Instantaneous
    Classes: druid
    A creature you touch regains a number of hit points equal to 1d6 + your spellcasting ability modifier.
    At Higher Levels. When you cast this spell using a spell slot of 2nd level or higher, the healing increases by 1d6 for each slot level above 1st.
`;

const MONSTERS = `Monster Manual (sample)
#### Mire Toad

A big swamp toad.

Large beast, unaligned

Armor Class 12 (natural armor)
Hit Points 33 (6d10)
Speed 20 ft., swim 40 ft.
STR DEX CON INT WIS CHA
16 (+3) 13 (+1) ll (+0) 2 (-4) 10 (+0) 3 (-4)
Senses darkvision 30 ft., passive Perception 10
Languages -
Challenge 1 (200 XP)
Amphibious. The toad can breathe air and water.

ACTIONS
Bite. Melee Weapon Attack: +5 to hit, reach 5 ft., one target. Hit: 8 (1d10 + 3) piercing damage. Tongue Lash. Melee Weapon Attack: +5 to hit, reach 15 ft., one target. Hit: 5 (1d4 + 3) bludgeoning damage.
Croak (Recharge 5-6). Each creature within 20 feet must succeed on a DC 11 Constitution saving throw or be deafened for 1 minute.

#### Other Lore

Some lore.

INDEX OF STAT BLOCKS Use this index. Mire Toad, 12
`;

test('spells: fields, ritual, concentration, saves, healing and areas', () => {
  const [ward, touch] = parseSpellList(SPELLS);
  assert.equal(ward.id, 'ember-ward');
  assert.equal(ward.name, 'Ember Ward');
  assert.equal(ward.level, 2); assert.equal(ward.school, 'Abjuration');
  assert.ok(ward.ritual && ward.conc);
  assert.equal(ward.dur, 'Up to 10 minutes');
  assert.equal(ward.comp, 'VSM'); assert.equal(ward.mat, 'A pinch of ash.');
  assert.deepEqual(ward.classes, ['cleric', 'wizard']);
  assert.deepEqual(ward.save, { ability: 'dex', success: 'half' });
  assert.match(ward.higher, /^When you cast/);
  assert.equal(touch.heal[1], '1d6+MOD'); assert.equal(touch.heal[3], '3d6+MOD');
  assert.equal(sniff(SPELLS), 'spells');
});

test('monsters: a stat block with scan noise, merged actions and an index', () => {
  const [m] = parseMonsters(MONSTERS);
  assert.equal(m.id, 'mire-toad');
  assert.equal(m.size, 'Large'); assert.equal(m.type, 'beast');
  assert.equal(m.ac, 12); assert.equal(m.hp, 33); assert.equal(m.hd, '6d10');
  assert.deepEqual(m.ab, [16, 13, 11, 2, 10, 3]);
  assert.equal(m.cr, 1); assert.equal(m.xp, 200); assert.equal(m.pb, 2);
  assert.deepEqual(m.actions.map((a) => a.n), ['Bite', 'Tongue Lash', 'Croak']);
  assert.equal(m.actions[0].hit, 5); assert.deepEqual(m.actions[0].dmg, [['1d10+3', 'piercing']]);
  assert.equal(m.actions[2].use, 'Recharge 5-6'); assert.deepEqual(m.actions[2].dc, ['con', 11, 'none']);
  assert.equal(m.check, undefined, 'the numbers agree with each other');
  assert.equal(mend('Rh Inoceros'), 'Rhinoceros');
  assert.equal(mend('Adult S Ilver Dragon'), 'Adult Silver Dragon');
});

test('character options and rules pages', () => {
  const cg = parseCharGen(`PART 2: RACES & SUBRACES
RACE: ELF
Ability Score Increase: Dexterity +2
  SUBRACES OF ELF:
  --- Subrace: Wood Elf ---
    Ability Score Increase: Wisdom +1
    Speed Note: Fleet of Foot: base walking speed increases to 35 feet.
    * Fleet of Foot: Your base walking speed increases to 35 feet.
PART 3: CLASSES
CLASS: FIGHTER
Subclass Choice Level: 3rd level (Martial Archetype: Champion, Battle Master, or Eldritch Knight; the archetype grants features)
PART 4: BACKGROUNDS
BACKGROUND: SAILOR
Skill Proficiencies: Athletics, Perception
Languages: None
Equipment: A belaying pin and a belt pouch containing 10 gp
Feature - Ship's Passage: You can secure free passage on a sailing ship.
`);
  assert.deepEqual(cg.races[0].subraces.map((x) => [x.id, x.bonus, x.speed]), [['wood-elf', { wis: 1 }, 35]]);
  assert.deepEqual(cg.classes[0].subclasses.map((x) => x.id), ['champion', 'battle-master', 'eldritch-knight']);
  assert.deepEqual(cg.backgrounds[0].skills, ['athletics', 'perception']);
  assert.equal(cg.backgrounds[0].feature.name, "Ship's Passage");
  assert.equal(subclassId('Path of the Totem Warrior'), 'totem-warrior');
  const rules = parseRulesBook(`--- Page 1 ---\nFalling Into Bogs\n${'A creature that falls into a bog sinks slowly and must climb out. '.repeat(4)}\n`.repeat(25), 'PHB');
  assert.equal(rules[0].name, 'Falling Into Bogs');
  assert.equal(rules[0].page, 1);
});

test('the merge adds only what the SRD lacks, keeps rules text off the wire, and look-ups cite the book', () => {
  const srd = JSON.parse(readFileSync(new URL('../../data/srd.json', import.meta.url), 'utf8'));
  const n = srd.monsters.length;
  const lib = { spells: parseSpellList(SPELLS), monsters: [...parseMonsters(MONSTERS), { ...srd.monsters[0], name: 'Copy' }], races: [{ id: 'elf', subraces: [{ id: 'high-elf', name: 'High Elf' }, { id: 'wood-elf', name: 'Wood Elf', bonus: { wis: 1 }, traits: [] }] }], classes: [], backgrounds: [], rules: [{ id: 'phb-1', name: 'Falling Into Bogs', book: 'PHB', page: 9, text: 'A creature that falls into a bog sinks slowly.' }] };
  const added = mergeLibrary(srd, lib);
  assert.equal(added.monsters, 1); assert.equal(srd.monsters.length, n + 1);
  assert.equal(added.subraces, 1);
  assert.ok(!JSON.stringify(srd).includes('falls into a bog'), 'rules text is not in what the browser gets');
  const r = lookUp(srd, 'bog');
  assert.equal(r.source, 'PHB p.9');
  assert.match(lookUp(srd, 'mire toad').monster, /Mire Toad/);
});
