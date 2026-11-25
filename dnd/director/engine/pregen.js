// Ready-made characters, and a random fill for the builder. Both give a builder input (the same
// shape a player makes by hand), so the player can still change anything before creating it.
// Everything is chosen from the SRD 5.1 (CC-BY-4.0) data and checked by rules.validateInput.

import { ABILITIES, STANDARD_ARRAY, FIGHTING_STYLES, DRAGON_ANCESTRY, derive, index, categoryItems, subclassLevel, styleLevel } from './rules.js';

// Which ability gets the standard array's 15, 14, 13, 12, 10 and 8, by class.
const PRIORITY = {
  barbarian: ['str', 'con', 'dex', 'wis', 'cha', 'int'],
  bard: ['cha', 'dex', 'con', 'wis', 'int', 'str'],
  cleric: ['wis', 'con', 'str', 'dex', 'cha', 'int'],
  druid: ['wis', 'con', 'dex', 'int', 'cha', 'str'],
  fighter: ['str', 'con', 'dex', 'wis', 'cha', 'int'],
  monk: ['dex', 'wis', 'con', 'str', 'int', 'cha'],
  paladin: ['str', 'cha', 'con', 'wis', 'dex', 'int'],
  ranger: ['dex', 'wis', 'con', 'str', 'int', 'cha'],
  rogue: ['dex', 'con', 'int', 'wis', 'cha', 'str'],
  sorcerer: ['cha', 'con', 'dex', 'wis', 'int', 'str'],
  warlock: ['cha', 'con', 'dex', 'wis', 'int', 'str'],
  wizard: ['int', 'con', 'dex', 'wis', 'cha', 'str'],
};
const STYLE = { fighter: ['defense', 'great-weapon', 'dueling', 'archery'], paladin: ['defense', 'dueling', 'great-weapon'], ranger: ['archery', 'two-weapon', 'defense'] };
// Weapons a kit's "any martial/simple weapon" choice prefers, by class, before anything else.
const WEAPONS = {
  barbarian: ['greataxe', 'battleaxe'], bard: ['rapier', 'dagger'], cleric: ['mace', 'warhammer'], druid: ['scimitar', 'quarterstaff'],
  fighter: ['longsword', 'battleaxe', 'warhammer'], monk: ['shortsword', 'quarterstaff', 'spear'], paladin: ['longsword', 'warhammer'],
  ranger: ['shortsword', 'scimitar'], rogue: ['rapier', 'shortsword'], sorcerer: ['quarterstaff', 'dagger'], warlock: ['quarterstaff', 'dagger'], wizard: ['quarterstaff', 'dagger'],
};
const NAMES = {
  dwarf: ['Brakka', 'Durin', 'Helga', 'Thrain', 'Dagna', 'Orsik', 'Vistra', 'Rurik'],
  elf: ['Aelar', 'Naivara', 'Thamior', 'Sariel', 'Faelyn', 'Ivellios', 'Keyleth', 'Mialee'],
  halfling: ['Pip', 'Merric', 'Rosie', 'Cade', 'Lidda', 'Milo', 'Seraphina', 'Wellby'],
  human: ['Aldric', 'Mara', 'Tobin', 'Elspeth', 'Garrick', 'Isolde', 'Corwin', 'Wynne'],
  dragonborn: ['Arjhan', 'Sora', 'Kriv', 'Biri', 'Medrash', 'Thava', 'Torinn', 'Nala'],
  gnome: ['Fonkin', 'Nissa', 'Orryn', 'Tana', 'Wrenn', 'Bimpnottin', 'Zook', 'Ellyjobell'],
  'half-elf': ['Lyra', 'Corin', 'Sylwen', 'Dorian', 'Ariane', 'Kael', 'Talia', 'Evander'],
  'half-orc': ['Grusk', 'Ovak', 'Shautha', 'Dench', 'Baggi', 'Thokk', 'Volen', 'Sutha'],
  tiefling: ['Mordai', 'Kallista', 'Akmenos', 'Nemeia', 'Damakos', 'Orianna', 'Skamos', 'Rieta'],
};
const ALIGN = ['Lawful good', 'Neutral good', 'Chaotic good', 'Lawful neutral', 'Neutral', 'Chaotic neutral'];

// Six characters to pick from, one for each job a party needs. Each is a full builder input.
export const PREGENS = [
  { id: 'aldric', blurb: 'A former town guard who stands in front and takes the hits. Simple to play.', role: 'Front line',
    input: { name: 'Aldric Vane', race: 'human', class: 'fighter', alignment: 'Lawful good', style: 'defense', skills: ['athletics', 'perception'], bgSkills: ['survival', 'intimidation'], background: '', languages: ['Dwarvish'], kit: [0, 0, 0, 0], weapons: ['longsword'] } },
  { id: 'marga', blurb: 'A temple healer with a heavy mace and steady faith. Keeps everyone standing.', role: 'Healer',
    input: { name: 'Marga Stonehearth', race: 'dwarf', subrace: 'hill-dwarf', class: 'cleric', alignment: 'Neutral good', skills: ['medicine', 'persuasion'], background: 'acolyte', kit: [0, 0, 0, 0, 0], weapons: ['mace'],
      spells: { cantrips: ['sacred-flame', 'guidance', 'spare-the-dying'], prepared: ['cure-wounds', 'healing-word', 'bless', 'guiding-bolt'] } } },
  { id: 'pip', blurb: 'A quick, quiet halfling who opens locks, finds traps and stabs from the shadows.', role: 'Scout',
    input: { name: 'Pip Underbough', race: 'halfling', subrace: 'lightfoot-halfling', class: 'rogue', alignment: 'Chaotic good', skills: ['stealth', 'sleight-of-hand', 'acrobatics', 'deception'], bgSkills: ['investigation', 'perception'], background: '', expertise: ['stealth', 'sleight-of-hand'], kit: [0, 0, 0], weapons: ['rapier'] } },
  { id: 'elara', blurb: 'A bookish elf wizard with fire, sleep and magic missiles. Fragile but powerful.', role: 'Arcane magic',
    input: { name: 'Elara Moonwhisper', race: 'elf', subrace: 'high-elf', class: 'wizard', alignment: 'Neutral good', skills: ['arcana', 'investigation'], bgSkills: ['history', 'insight'], background: '', kit: [0, 0, 0], weapons: ['quarterstaff'],
      spells: { cantrips: ['fire-bolt', 'light', 'mage-hand'], known: ['magic-missile', 'sleep', 'shield', 'burning-hands', 'detect-magic', 'mage-armor'], prepared: ['magic-missile', 'sleep', 'shield', 'mage-armor'], raceCantrip: 'ray-of-frost' } } },
  { id: 'grusk', blurb: 'A half-orc barbarian with a greataxe and a terrible temper. Hits hardest of all.', role: 'Big damage',
    input: { name: 'Grusk', race: 'half-orc', class: 'barbarian', alignment: 'Chaotic neutral', skills: ['athletics', 'survival'], bgSkills: ['stealth', 'perception'], background: '', kit: [0, 0, 0], weapons: ['greataxe'] } },
  { id: 'lyra', blurb: 'A half-elf bard who talks the party out of trouble, and sings them back into the fight.', role: 'Talker and support',
    input: { name: 'Lyra Thistledown', race: 'half-elf', class: 'bard', alignment: 'Chaotic good', raceChoice: ['dex', 'con'], skills: ['persuasion', 'insight', 'performance'], raceSkills: ['perception', 'deception'], bgSkills: ['history', 'arcana'], background: '', kit: [0, 0, 0], weapons: ['rapier'],
      spells: { cantrips: ['vicious-mockery', 'minor-illusion'], known: ['healing-word', 'dissonant-whispers', 'charm-person', 'thunderwave'] } } },
];

const pickRand = (arr, rand) => arr[Math.floor(rand() * arr.length)];
function shuffle(arr, rand) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

// Fill whatever a partial input leaves out, the way a sensible player would.
export function completeBuild(spec, srd, rand = Math.random) {
  const ix = index(srd);
  const race = ix.race[spec.race] || pickRand(srd.races, rand);
  const cls = ix.cls[spec.class] || pickRand(srd.classes, rand);
  const level = Math.max(1, Math.min(20, Math.trunc(Number(spec.level) || 1)));
  const b = {
    name: spec.name || `${pickRand(NAMES[race.id] || NAMES.human, rand)}`,
    race: race.id, subrace: spec.subrace || ((race.subraces || [])[0] || {}).id || '', class: cls.id, subclass: '', level,
    method: 'standard', base: {}, raceChoice: [], raceSkills: [], skills: [], background: 'acolyte', bgName: spec.bgName || '', bgSkills: [], kit: [], kitPick: {},
    style: '', expertise: [], ancestry: spec.ancestry || pickRand(Object.keys(DRAGON_ANCESTRY), rand), alignment: spec.alignment || pickRand(ALIGN, rand),
    spells: { cantrips: [], known: [], prepared: [], raceCantrip: '' }, languages: spec.languages || [],
  };
  // Abilities: the standard array, best score in the class's main ability.
  (PRIORITY[cls.id] || ABILITIES).forEach((a, k) => { b.base[a] = STANDARD_ARRAY[k]; });
  if (race.bonusChoice) b.raceChoice = (spec.raceChoice || (PRIORITY[cls.id] || ABILITIES).filter((a) => !(race.bonus || {})[a])).slice(0, race.bonusChoice);
  // Ability Score Improvements at the class's levels (4th, 8th...; a fighter's 6th too): +2 to the main
  // ability up to 20, then the next. Heroes built above 3rd level had none (the fight simulation's 6th-level
  // fighter hit for 5: 26 Nov).
  if (spec.asi) b.asi = spec.asi;
  else {
    const L = cls.levels || {};
    const sub = (race.subraces || []).find((x) => x.id === b.subrace);
    const score = (a) => (b.base[a] || 10) + ((race.bonus || {})[a] || 0) + (((sub && sub.bonus) || {})[a] || 0) + (b.raceChoice.includes(a) ? 1 : 0);
    const gained = {};
    b.asi = [];
    for (let l = 2; l <= level; l++) {
      if (!((Number((L[l] || {}).asi) || 0) > (Number((L[l - 1] || {}).asi) || 0))) continue;
      const ab = {};
      let left = 2;
      for (const a of PRIORITY[cls.id] || ABILITIES) {
        const room = 20 - score(a) - (gained[a] || 0);
        const add = Math.min(left, Math.max(0, room));
        if (add > 0) { ab[a] = add; gained[a] = (gained[a] || 0) + add; left -= add; }
        if (!left) break;
      }
      if (Object.keys(ab).length) b.asi.push({ level: l, ab });
    }
  }
  if (subclassLevel(cls.id) <= level) b.subclass = (cls.subclasses[0] || {}).id || '';
  if (styleLevel(cls.id) && styleLevel(cls.id) <= level) b.style = spec.style || (STYLE[cls.id] || Object.keys(FIGHTING_STYLES)).find((s) => FIGHTING_STYLES[s]) || '';
  // Background and skills: the background's first, then class skills that do not repeat them.
  b.background = spec.background !== undefined ? spec.background : (srd.backgrounds.length && rand() < 0.4 ? srd.backgrounds[0].id : '');
  const bg = ix.bg[b.background];
  const taken = new Set(bg ? bg.skills : []);
  const want = (spec.skills || []).filter((s) => cls.skillFrom.includes(s) && !taken.has(s));
  for (const s of shuffle(cls.skillFrom, rand)) if (want.length < cls.skillChoose && !want.includes(s) && !taken.has(s)) want.push(s);
  b.skills = want.slice(0, cls.skillChoose);
  b.skills.forEach((s) => taken.add(s));
  if (!bg) {
    const bgs = (spec.bgSkills || []).filter((s) => ix.skill[s] && !taken.has(s));
    for (const s of shuffle(srd.skills.map((x) => x.id), rand)) if (bgs.length < 2 && !bgs.includes(s) && !taken.has(s)) bgs.push(s);
    b.bgSkills = bgs.slice(0, 2);
    b.bgSkills.forEach((s) => taken.add(s));
  }
  if ((race.traits || []).some((t) => t.name === 'Skill Versatility')) {
    const rs = (spec.raceSkills || []).filter((s) => ix.skill[s] && !taken.has(s));
    for (const s of shuffle(srd.skills.map((x) => x.id), rand)) if (rs.length < 2 && !rs.includes(s) && !taken.has(s)) rs.push(s);
    b.raceSkills = rs.slice(0, 2);
  }
  // Equipment: the given options, or random ones; "any weapon" picks the class's favourite.
  cls.kit.choices.forEach((ch, n) => {
    const k = spec.kit && spec.kit[n] != null ? Math.min(Number(spec.kit[n]), ch.options.length - 1) : Math.floor(rand() * ch.options.length);
    b.kit[n] = k;
    ch.options[k].items.forEach(([id, q], j) => {
      if (!String(id).startsWith('@')) return;
      const list = categoryItems(srd, id);
      if (!list.length) return;
      const fav = [...(spec.weapons || []), ...(WEAPONS[cls.id] || [])].map((w) => list.find((x) => x.id === w)).filter(Boolean);
      b.kitPick[`${n}:${j}`] = Array.from({ length: q }, (_, c) => (fav[c] || fav[0] || pickRand(list, rand)).id);
    });
  });
  // Spells: the given ones that fit, then the rest at random, attack and healing spells first.
  let pv = derive(b, srd);
  const sp = spec.spells || {};
  const useful = (s) => (s.attack || s.save || s.heal || s.dmgSlot ? 0 : 1);
  if (pv.cast && pv.cast.kind !== 'none') {
    const c = pv.cast;
    const pool = (lv) => srd.spells.filter((s) => s.classes.includes(cls.id) && (lv === 0 ? s.level === 0 : s.level >= 1 && s.level <= c.maxSlot));
    const fill = (given, from, max) => {
      const out = (given || []).filter((id) => from.some((s) => s.id === id)).slice(0, max);
      for (const s of shuffle(from, rand).sort((x, y) => useful(x) - useful(y))) if (out.length < max && !out.includes(s.id)) out.push(s.id);
      return out;
    };
    b.spells.cantrips = fill(sp.cantrips, pool(0), c.cantripsMax || 0);
    if (c.spellbook) b.spells.known = fill(sp.known, pool(1), c.knownMax);
    else if (c.kind !== 'prepared') b.spells.known = fill(sp.known, pool(1), c.knownMax || 0);
    if (c.kind === 'prepared') {
      const from = c.spellbook ? pool(1).filter((s) => b.spells.known.includes(s.id)) : pool(1);
      b.spells.prepared = fill(sp.prepared, from, c.prepMax);
    }
  }
  const highElf = [...(race.traits || []), ...(((race.subraces || []).find((x) => x.id === b.subrace) || {}).traits || [])].some((t) => t.name === 'High Elf Cantrip');
  if (highElf) {
    const wiz = srd.spells.filter((s) => s.level === 0 && s.classes.includes('wizard') && !b.spells.cantrips.includes(s.id));
    b.spells.raceCantrip = (wiz.find((s) => s.id === sp.raceCantrip) || shuffle(wiz, rand).sort((x, y) => useful(x) - useful(y))[0] || {}).id || '';
  }
  // Expertise last, from the skills the character really has.
  pv = derive(b, srd);
  if (cls.id === 'rogue' || (cls.id === 'bard' && level >= 3)) {
    const ex = (spec.expertise || []).filter((s) => pv.skills.includes(s));
    for (const s of shuffle(pv.skills, rand)) if (ex.length < 2 && !ex.includes(s)) ex.push(s);
    b.expertise = ex.slice(0, 2);
  }
  return b;
}

// A whole random character at the given level.
export function randomBuild(srd, rand = Math.random, level = 1) {
  return completeBuild({ race: pickRand(srd.races, rand).id, class: pickRand(srd.classes, rand).id, level }, srd, rand);
}

// A ready-made character as a builder input, at the given level.
// `id` is a ready-made character's id (looked up in `list`, an adventure's own, then these six) or the
// ready-made character itself.
export function pregenBuild(id, srd, level = 1, list = null) {
  const p = id && typeof id === 'object' ? id : ((list || []).find((x) => x.id === id) || PREGENS.find((x) => x.id === id));
  if (!p) return null;
  let n = 0;
  const rand = () => ((n = (n * 9301 + 49297) % 233280) / 233280); // the same picks every time
  return completeBuild({ ...p.input, level }, srd, rand);
}
