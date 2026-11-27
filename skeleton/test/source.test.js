// A long source cut to fit each section of the converter (brain/converter.js pickSource, 27 Nov 2026).
import test from 'node:test';
import assert from 'node:assert/strict';
import { pickSource } from '../brain/converter.js';

const page = (n, words) => `--- Page ${n} ---\n${Array.from({ length: 60 }, () => words).join(' ')}`;
const book = [page(1, 'Welcome to the game, an introduction.'), ...Array.from({ length: 20 }, (_, i) => page(i + 2, 'The kingdom and its history, the gods of the land.')),
  page(22, 'The Bog Lurker creature: attack bite, health 12, armour 1.'), ...Array.from({ length: 20 }, (_, i) => page(i + 23, 'Roll the dice: a success on a check, damage on a failure.'))].join('\n');

test('a short source is sent whole', () => {
  assert.deepEqual(pickSource('Roll two dice.', 'rules'), { text: 'Roll two dice.', cut: false });
});
test('a long source keeps its opening and the pages that fit the section, in order', () => {
  const max = 12000;
  const beasts = pickSource(book, 'bestiary', max);
  assert.ok(beasts.cut && beasts.text.length <= max + 200);
  assert.match(beasts.text, /^--- Page 1 ---/);
  assert.match(beasts.text, /Bog Lurker/);
  assert.match(beasts.text, /pages left out/);
  const rules = pickSource(book, 'rules', max);
  assert.match(rules.text, /Roll the dice/);
  assert.doesNotMatch(rules.text, /kingdom/);
  const lore = pickSource(book, 'lore', max);
  assert.match(lore.text, /kingdom/);
  const pages = [...rules.text.matchAll(/--- Page (\d+) ---/g)].map((m) => Number(m[1]));
  assert.deepEqual(pages, [...pages].sort((a, b) => a - b));
});
test('text with no page marks is cut by paragraphs', () => {
  const t = Array.from({ length: 80 }, (_, i) => (i === 50 ? 'A creature with a bite attack and health.' : 'Old history of the world.').repeat(40)).join('\n\n');
  const r = pickSource(t, 'bestiary', 8000);
  assert.ok(r.cut && r.text.length <= 8200);
  assert.match(r.text, /creature with a bite/);
});
