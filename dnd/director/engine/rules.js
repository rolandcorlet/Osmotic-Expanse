// The D&D 5e rules as numbers: ability modifiers, proficiency, a character built from a player's
// choices, attacks, armour class, spell slots, and what a condition does to a roll.
// No Node imports: the browser loads this same file, so the character builder on a player's screen
// and the server that checks it can never disagree.
//
// Everything is read from the SRD 5.1 data (data/srd.json) passed in as `srd`.

export const ABILITIES = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
export const ABILITY_NAMES = { str: 'Strength', dex: 'Dexterity', con: 'Constitution', int: 'Intelligence', wis: 'Wisdom', cha: 'Charisma' };
export const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8];
export const POINT_COST = { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 };
export const POINT_BUDGET = 27;

export const mod = (score) => Math.floor((Number(score || 10) - 10) / 2);
export const signed = (n) => (n >= 0 ? `+${n}` : `${n}`);
export const profFor = (level) => 2 + Math.floor((Math.max(1, level) - 1) / 4);
export const levelForXp = (xp, table) => { let l = 1; for (let i = 0; i < table.length; i++) if (xp >= table[i]) l = i + 1; return Math.min(20, l); };
export const ordinal = (n) => `${n}${n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'}`;
export const crText = (cr) => (cr === 0.125 ? '1/8' : cr === 0.25 ? '1/4' : cr === 0.5 ? '1/2' : String(cr));

export const FIGHTING_STYLES = {
  archery: { name: 'Archery', desc: 'You gain a +2 bonus to attack rolls you make with ranged weapons.' },
  defense: { name: 'Defense', desc: 'While you are wearing armor, you gain a +1 bonus to AC.' },
  dueling: { name: 'Dueling', desc: 'When you are wielding a melee weapon in one hand and no other weapons, you gain a +2 bonus to damage rolls with that weapon.' },
  'great-weapon': { name: 'Great Weapon Fighting', desc: 'When you roll a 1 or 2 on a damage die for an attack you make with a melee weapon that you are wielding with two hands, you can reroll the die and must use the new roll.' },
  protection: { name: 'Protection', desc: 'When a creature you can see attacks a target other than you that is within 5 feet of you, you can use your reaction to impose disadvantage on the attack roll. You must be wielding a shield.' },
  'two-weapon': { name: 'Two-Weapon Fighting', desc: 'When you engage in two-weapon fighting, you can add your ability modifier to the damage of the second attack.' },
};
const STYLE_CLASSES = { fighter: 1, paladin: 2, ranger: 2 };
export const styleLevel = (cls) => STYLE_CLASSES[cls] || 0;

export const DRAGON_ANCESTRY = {
  black: 'acid', blue: 'lightning', brass: 'fire', bronze: 'lightning', copper: 'acid',
  gold: 'fire', green: 'poison', red: 'fire', silver: 'cold', white: 'cold',
};

// Who prepares spells from the whole list each day, and who knows a fixed few.
const PREPARED = { cleric: 'full', druid: 'full', paladin: 'half', wizard: 'book' };
export const casterKind = (cls) => (cls === 'warlock' ? 'pact' : PREPARED[cls] ? 'prepared' : 'known');
export const subclassLevel = (cls) => ({ cleric: 1, sorcerer: 1, warlock: 1, druid: 2, wizard: 2 }[cls] || 3);

// ---- looking things up ---------------------------------------------------------------
export function index(srd) {
  if (srd._ix) return srd._ix;
  const by = (list) => Object.fromEntries((list || []).map((x) => [x.id, x]));
  const ix = {
    race: by(srd.races), cls: by(srd.classes), spell: by(srd.spells), monster: by(srd.monsters),
    weapon: by(srd.weapons), armor: by(srd.armor), gear: by(srd.gear), skill: by(srd.skills),
    cond: by(srd.conditions), magic: by(srd.magicItems), bg: by(srd.backgrounds),
  };
  Object.defineProperty(srd, '_ix', { value: ix, enumerable: false });
  return ix;
}
export const item = (srd, id) => { const ix = index(srd); return ix.weapon[id] || ix.armor[id] || ix.gear[id] || ix.magic[id] || null; };

// Items a starting-equipment choice leaves open ("any martial weapon").
export function categoryItems(srd, cat) {
  const c = String(cat || '').replace(/^@/, '');
  const w = srd.weapons;
  const pick = {
    'simple-weapons': w.filter((x) => x.cat === 'Simple'),
    'martial-weapons': w.filter((x) => x.cat === 'Martial'),
    'simple-melee-weapons': w.filter((x) => x.cat === 'Simple' && x.range === 'Melee'),
    'martial-melee-weapons': w.filter((x) => x.cat === 'Martial' && x.range === 'Melee'),
    'simple-ranged-weapons': w.filter((x) => x.cat === 'Simple' && x.range === 'Ranged'),
    'martial-ranged-weapons': w.filter((x) => x.cat === 'Martial' && x.range === 'Ranged'),
    'holy-symbols': srd.gear.filter((x) => x.cat === 'Holy Symbols'),
    'arcane-foci': srd.gear.filter((x) => x.cat === 'Arcane Foci'),
    'druidic-foci': srd.gear.filter((x) => x.cat === 'Druidic Foci'),
    'musical-instruments': srd.gear.filter((x) => x.cat === 'Tools' && /lute|flute|drum|horn|lyre|bagpipes|dulcimer|pan flute|shawm|viol/i.test(x.name)),
  }[c];
  return pick || [];
}

// ---- proficiency with a weapon -------------------------------------------------------
function weaponProficient(w, profs, traits) {
  const p = profs.map((x) => x.toLowerCase());
  if (p.includes('simple weapons') && w.cat === 'Simple') return true;
  if (p.includes('martial weapons') && w.cat === 'Martial') return true;
  const n = w.name.toLowerCase();
  const plural = n.replace(/,.*/, '').replace(/(s|x)$/, '$1es').replace(/([^s])$/, '$1s');
  if (p.some((x) => x === plural || x.replace(/,.*/, '') === plural || x === n || (x.startsWith('crossbows, light') && n === 'crossbow, light') || (x === 'hand crossbows' && n === 'crossbow, hand'))) return true;
  const names = traits.map((t) => t.name);
  if (names.includes('Elf Weapon Training') && ['longsword', 'shortsword', 'shortbow', 'longbow'].includes(w.id)) return true;
  if (names.includes('Dwarven Combat Training') && ['battleaxe', 'handaxe', 'light-hammer', 'warhammer'].includes(w.id)) return true;
  return false;
}
function armorProficient(a, profs) {
  const p = profs.map((x) => x.toLowerCase());
  if (p.includes('all armor') && a.cat !== 'Shield') return true;
  if (a.cat === 'Shield') return p.includes('shields');
  return p.includes(`${a.cat.toLowerCase()} armor`);
}

// ---- building a character -------------------------------------------------------------
// `input` is exactly what the builder collected; the character keeps it so a level-up can
// rebuild every number from the same choices.
export function validateInput(input, srd) {
  const ix = index(srd);
  const errs = [];
  const i = input || {};
  if (!String(i.name || '').trim()) errs.push('Give the character a name.');
  if (!ix.race[i.race]) errs.push('Choose a race.');
  if (!ix.cls[i.class]) errs.push('Choose a class.');
  const base = i.base || {};
  for (const a of ABILITIES) if (!(Number(base[a]) >= 3 && Number(base[a]) <= 20)) errs.push(`${ABILITY_NAMES[a]} must be between 3 and 20 before bonuses.`);
  if (i.method === 'pointbuy') {
    const spent = ABILITIES.reduce((s, a) => s + (POINT_COST[base[a]] ?? 99), 0);
    if (spent > POINT_BUDGET) errs.push(`Point buy spends ${spent} points; the most is ${POINT_BUDGET}.`);
  }
  if (i.method === 'standard') {
    const got = ABILITIES.map((a) => Number(base[a])).sort((x, y) => y - x).join(',');
    if (got !== STANDARD_ARRAY.join(',')) errs.push('The standard array uses 15, 14, 13, 12, 10 and 8 once each.');
  }
  const c = ix.cls[i.class];
  if (c) {
    const sk = (i.skills || []).filter((s) => c.skillFrom.includes(s));
    if (new Set(sk).size < c.skillChoose) errs.push(`Choose ${c.skillChoose} ${c.name} skills.`);
  }
  const lv = Math.trunc(Number(i.level || 1));
  if (!(lv >= 1 && lv <= 20)) errs.push('Level runs from 1 to 20.');
  return errs;
}

export function derive(input, srd) {
  const ix = index(srd);
  const i = { level: 1, ...input };
  const race = ix.race[i.race];
  const sub = race && (race.subraces || []).find((s) => s.id === i.subrace) || (race && race.subraces && race.subraces[0]) || null;
  const cls = ix.cls[i.class];
  if (!race || !cls) throw new Error('A character needs a race and a class.');
  const level = Math.max(1, Math.min(20, Math.trunc(Number(i.level) || 1)));
  const prof = profFor(level);

  // Ability scores: base, then race, then subrace, then free choices (half-elf), then improvements.
  const ab = {};
  for (const a of ABILITIES) ab[a] = Number((i.base || {})[a]) || 10;
  for (const [a, v] of Object.entries(race.bonus || {})) ab[a] += v;
  for (const [a, v] of Object.entries((sub && sub.bonus) || {})) ab[a] += v;
  for (const a of (i.raceChoice || []).slice(0, race.bonusChoice || 0)) if (ABILITIES.includes(a) && !(race.bonus || {})[a]) ab[a] += 1;
  for (const imp of i.asi || []) {
    if (Number(imp.level) > level) continue;
    for (const [a, v] of Object.entries(imp.ab || {})) if (ABILITIES.includes(a)) ab[a] = Math.min(20, ab[a] + Number(v || 0));
  }
  const mods = Object.fromEntries(ABILITIES.map((a) => [a, mod(ab[a])]));

  const traits = [...(race.traits || []), ...((sub && sub.traits) || [])];
  const traitNames = traits.map((t) => t.name);
  const profs = [...cls.profs];
  if (traitNames.includes('Tool Proficiency')) profs.push("A smith's, brewer's or mason's tools");

  // Skills: the class's chosen ones, the background's, and the race's own.
  const skills = new Set((i.skills || []).filter((s) => cls.skillFrom.includes(s)).slice(0, cls.skillChoose));
  const bg = ix.bg[i.background];
  if (bg) bg.skills.forEach((s) => skills.add(s));
  else (i.bgSkills || []).slice(0, 2).forEach((s) => ix.skill[s] && skills.add(s));
  if (traitNames.includes('Keen Senses')) skills.add('perception');
  if (traitNames.includes('Menacing')) skills.add('intimidation');
  if (traitNames.includes('Skill Versatility')) (i.raceSkills || []).slice(0, 2).forEach((s) => ix.skill[s] && skills.add(s));
  const expertise = (i.expertise || []).filter((s) => skills.has(s)).slice(0, cls.id === 'rogue' ? (level >= 6 ? 4 : 2) : cls.id === 'bard' && level >= 3 ? (level >= 10 ? 4 : 2) : 0);

  // Hit points: the full die at 1st level, the fixed average after that.
  let maxHp = cls.hitDie + mods.con + (level - 1) * (cls.hitDie / 2 + 1 + mods.con);
  if (traitNames.includes('Dwarven Toughness')) maxHp += level;
  if (cls.id === 'sorcerer' && i.subclass === 'draconic') maxHp += level;
  maxHp = Math.max(level, maxHp);

  // Equipment: what the class kit choices and the background give.
  const inv = [];
  const addItem = (id, qty = 1) => {
    const it = item(srd, id);
    if (!it) return;
    const have = inv.find((x) => x.id === id);
    if (have) have.qty += qty; else inv.push({ id, name: it.name, qty });
  };
  if (Array.isArray(i.inventory)) i.inventory.forEach((x) => { if (x && x.id) addItem(x.id, Number(x.qty) || 1); else if (x && x.name) inv.push({ id: '', name: String(x.name).slice(0, 60), qty: Number(x.qty) || 1 }); });
  else {
    cls.kit.fixed.forEach(([id, q]) => addItem(id, q));
    cls.kit.choices.forEach((ch, n) => {
      const o = ch.options[Number((i.kit || [])[n]) || 0] || ch.options[0];
      if (!o) return;
      o.items.forEach(([id, q], k) => {
        if (String(id).startsWith('@')) {
          const pickList = ((i.kitPick || {})[`${n}:${k}`] || []);
          const opts = categoryItems(srd, id);
          for (let c = 0; c < q; c++) addItem(pickList[c] || pickList[0] || (opts[0] && opts[0].id), 1);
        } else addItem(id, q);
      });
    });
    if (bg) bg.items.forEach(([id, q]) => addItem(id, q));
  }
  const gold = i.gold != null ? Number(i.gold) || 0 : (bg ? bg.gold : 10);

  // Armour class from what is worn.
  const worn = inv.map((x) => ix.armor[x.id]).filter(Boolean);
  const body = worn.filter((a) => a.cat !== 'Shield' && armorProficient(a, profs)).sort((a, b) => (b.ac + (b.dex ? Math.min(mods.dex, b.max ?? 99) : 0)) - (a.ac + (a.dex ? Math.min(mods.dex, a.max ?? 99) : 0)))[0];
  const shield = worn.find((a) => a.cat === 'Shield' && armorProficient(a, profs));
  let ac; let acNote;
  if (body) { ac = body.ac + (body.dex ? Math.min(mods.dex, body.max ?? 99) : 0); acNote = body.name.toLowerCase(); }
  else if (cls.id === 'barbarian') { ac = 10 + mods.dex + mods.con; acNote = 'unarmored defense'; }
  else if (cls.id === 'monk' && !shield) { ac = 10 + mods.dex + mods.wis; acNote = 'unarmored defense'; }
  else if (cls.id === 'sorcerer' && i.subclass === 'draconic' && level >= 1) { ac = 13 + mods.dex; acNote = 'draconic resilience'; }
  else { ac = 10 + mods.dex; acNote = 'no armor'; }
  if (shield && !(cls.id === 'monk' && !body)) { ac += 2; acNote += ', shield'; }
  const styleOn = i.style && FIGHTING_STYLES[i.style] && styleLevel(cls.id) && level >= styleLevel(cls.id) ? i.style : '';
  if (styleOn === 'defense' && body) { ac += 1; acNote += ', Defense'; }

  // Speed.
  const L = (cls.levels[level] || cls.levels[String(level)] || {});
  const ex = L.extra || {};
  let speed = race.speed;
  if (cls.id === 'monk' && !body && !shield) speed += Number(ex.unarmored_movement || 0);
  if (cls.id === 'barbarian' && level >= 5 && !(body && body.cat === 'Heavy')) speed += 10;

  // Attacks: every weapon carried, an unarmed strike, and attack cantrips.
  const attacks = [];
  const melee = (w) => w.range === 'Melee';
  for (const x of inv) {
    const w = ix.weapon[x.id];
    if (!w) continue;
    const finesse = w.props.includes('finesse');
    const am = finesse ? Math.max(mods.str, mods.dex) : melee(w) ? mods.str : mods.dex;
    const monkW = cls.id === 'monk' && (w.id === 'shortsword' || (w.cat === 'Simple' && melee(w) && !w.props.includes('two-handed') && !w.props.includes('heavy')));
    const use = monkW ? Math.max(mods.str, mods.dex) : am;
    const p = weaponProficient(w, profs, traits);
    let hit = use + (p ? prof : 0);
    if (styleOn === 'archery' && !melee(w)) hit += 2;
    let dmgMod = use + (styleOn === 'dueling' && melee(w) && !w.props.includes('two-handed') ? 2 : 0);
    let dice = w.dmg || '1';
    if (monkW && ex.martial_arts) { const md = `${ex.martial_arts.dice_count}d${ex.martial_arts.dice_value}`; if (avgDie(md) > avgDie(dice)) dice = md; }
    attacks.push({ id: `w:${w.id}`, name: w.name, hit, dmg: `${dice}${dmgMod ? signed(dmgMod) : ''}`, type: w.type, range: melee(w) ? (w.props.includes('reach') ? 'reach 10 ft.' : 'reach 5 ft.') : `range ${w.reach || ''} ft.`, melee: melee(w), props: w.props, proficient: p, ability: use === mods.dex && use !== mods.str ? 'dex' : 'str', versatile: w.versatile ? `${w.versatile}${dmgMod ? signed(dmgMod) : ''}` : '' });
  }
  {
    const ma = cls.id === 'monk' && ex.martial_arts ? `${ex.martial_arts.dice_count}d${ex.martial_arts.dice_value}` : '';
    const use = ma ? Math.max(mods.str, mods.dex) : mods.str;
    attacks.push({ id: 'unarmed', name: 'Unarmed strike', hit: use + prof, dmg: ma ? `${ma}${use ? signed(use) : ''}` : `${Math.max(1, 1 + use)}`, type: 'bludgeoning', range: 'reach 5 ft.', melee: true, props: [], proficient: true, ability: 'str' });
  }

  // Spellcasting.
  let cast = null;
  const castAb = cls.casting;
  if (castAb && level >= (cls.castFrom || 1)) {
    const kind = casterKind(cls.id);
    const am = mods[castAb];
    const slotsMax = (L.slots || []).slice();
    const prepMax = PREPARED[cls.id] === 'half' ? Math.max(1, am + Math.floor(level / 2)) : PREPARED[cls.id] ? Math.max(1, am + level) : 0;
    const sp = i.spells || {};
    const ok = (id) => ix.spell[id] && ix.spell[id].classes.includes(cls.id);
    const maxSlot = slotsMax.reduce((m, n, k) => (n ? k + 1 : m), 0);
    const extraCantrip = traitNames.includes('High Elf Cantrip') ? 1 : 0;
    const cantrips = (sp.cantrips || []).filter((id) => ok(id) && ix.spell[id].level === 0).slice(0, (L.cantrips || 0));
    const known = (sp.known || []).filter((id) => ok(id) && ix.spell[id].level >= 1 && ix.spell[id].level <= maxSlot);
    const knownMax = cls.id === 'wizard' ? 6 + 2 * (level - 1) : kind === 'prepared' ? 0 : (L.known || 0);
    const prepared = kind === 'prepared'
      ? (sp.prepared || []).filter((id) => ok(id) && ix.spell[id].level >= 1 && ix.spell[id].level <= maxSlot && (cls.id !== 'wizard' || known.includes(id))).slice(0, prepMax)
      : [];
    cast = {
      ability: castAb, dc: 8 + prof + am, atk: prof + am, kind,
      slots: slotsMax.map((n) => [n, 0]),
      cantrips, known: knownMax ? known.slice(0, knownMax) : (cls.id === 'wizard' ? known : []), prepared,
      cantripsMax: L.cantrips || 0, knownMax, prepMax, maxSlot,
      spellbook: cls.id === 'wizard',
    };
    if (extraCantrip && sp.raceCantrip && ix.spell[sp.raceCantrip] && ix.spell[sp.raceCantrip].classes.includes('wizard') && ix.spell[sp.raceCantrip].level === 0) cast.raceCantrip = sp.raceCantrip;
  } else if (traitNames.includes('High Elf Cantrip') && (i.spells || {}).raceCantrip) {
    const id = i.spells.raceCantrip;
    if (ix.spell[id] && ix.spell[id].level === 0 && ix.spell[id].classes.includes('wizard')) cast = { ability: 'int', dc: 8 + prof + mods.int, atk: prof + mods.int, kind: 'none', slots: [], cantrips: [], known: [], prepared: [], raceCantrip: id, cantripsMax: 0, knownMax: 0, prepMax: 0, maxSlot: 0 };
  }
  if (cast) {
    for (const id of [...cast.cantrips, ...(cast.raceCantrip ? [cast.raceCantrip] : [])]) {
      const s = ix.spell[id];
      if (!s || !s.attack || !s.dmgLevel) continue;
      const tier = Object.keys(s.dmgLevel).map(Number).filter((n) => n <= level).sort((a, b) => b - a)[0];
      const am = id === cast.raceCantrip && !castAb ? mods.int : mods[cast.ability];
      attacks.push({ id: `s:${id}`, name: s.name, hit: prof + am, dmg: s.dmgLevel[tier], type: s.dmgType || '', range: s.range, melee: s.attack === 'melee', props: ['spell'], proficient: true, ability: cast.ability, spell: id });
    }
  }

  // Features from class, subclass and race, up to this level.
  const features = [];
  for (let l = 1; l <= level; l++) for (const f of ((cls.levels[l] || cls.levels[String(l)] || {}).features || [])) {
    if (/^Ability Score Improvement$/.test(f) && features.some((x) => x.name === f)) continue;
    features.push({ name: f, level: l, from: cls.name, desc: cls.features[f] || '' });
  }
  const subc = (cls.subclasses || []).find((s) => s.id === i.subclass);
  if (subc && level >= subclassLevel(cls.id)) {
    features.push({ name: `${subc.flavor}: ${subc.name}`, level: subclassLevel(cls.id), from: cls.name, desc: subc.desc });
    for (const sl of subc.levels) if (sl.level <= level) for (const f of sl.features) features.push({ name: f, level: sl.level, from: subc.name, desc: cls.features[f] || '' });
  }
  if (styleOn) features.push({ name: `Fighting Style: ${FIGHTING_STYLES[styleOn].name}`, level: styleLevel(cls.id), from: cls.name, desc: FIGHTING_STYLES[styleOn].desc });

  // Damage resistances a body always has.
  const res = [];
  if (traitNames.includes('Hellish Resistance')) res.push('fire');
  if (traitNames.includes('Dwarven Resilience')) res.push('poison');
  if (race.id === 'dragonborn' && DRAGON_ANCESTRY[i.ancestry]) res.push(DRAGON_ANCESTRY[i.ancestry]);

  // Resources that run out and come back on a rest.
  const resources = [];
  const R = (id, name, max, reset, extra = {}) => { if (max > 0) resources.push({ id, name, max, used: 0, reset, ...extra }); };
  if (cls.id === 'barbarian') R('rage', 'Rage', ex.rage_count >= 99 ? 99 : ex.rage_count || 0, 'long', { bonus: ex.rage_damage_bonus || 2 });
  if (cls.id === 'bard') R('inspiration', 'Bardic Inspiration', Math.max(1, mods.cha), level >= 5 ? 'short' : 'long', { die: `d${ex.bardic_inspiration_die || 6}` });
  if (cls.id === 'cleric' && level >= 2) R('channel', 'Channel Divinity', ex.channel_divinity_charges || 1, 'short');
  if (cls.id === 'druid' && level >= 2) R('wildshape', 'Wild Shape', 2, 'short');
  if (cls.id === 'fighter') { R('secondwind', 'Second Wind', 1, 'short', { heal: `1d10+${level}` }); R('surge', 'Action Surge', ex.action_surges || 0, 'short'); R('indomitable', 'Indomitable', ex.indomitable_uses || 0, 'long'); }
  if (cls.id === 'monk') R('ki', 'Ki', ex.ki_points || 0, 'short');
  if (cls.id === 'paladin') { R('layonhands', 'Lay on Hands', 5 * level, 'long', { pool: true }); R('sense', 'Divine Sense', 1 + Math.max(0, mods.cha), 'long'); if (level >= 3) R('channel', 'Channel Divinity', 1, 'short'); }
  if (cls.id === 'sorcerer') R('sorcery', 'Sorcery Points', ex.sorcery_points || 0, 'long');
  if (cls.id === 'wizard') R('recovery', 'Arcane Recovery', 1, 'long', { slots: Math.ceil(level / 2) });
  if (race.id === 'half-orc') R('relentless', 'Relentless Endurance', 1, 'long');
  if (race.id === 'dragonborn') R('breath', 'Breath Weapon', 1, 'short', { dmg: `${level >= 16 ? 5 : level >= 11 ? 4 : level >= 6 ? 3 : 2}d6`, type: DRAGON_ANCESTRY[i.ancestry] || 'fire', dc: 8 + mods.con + prof });
  const sneak = cls.id === 'rogue' && ex.sneak_attack ? `${ex.sneak_attack.dice_count}d${ex.sneak_attack.dice_value}` : '';
  const extraAttacks = cls.id === 'fighter' ? (ex.extra_attacks || 0) : ['barbarian', 'monk', 'paladin', 'ranger'].includes(cls.id) && level >= 5 ? 1 : 0;

  const langs = [...new Set([...(race.languages || []), ...((i.languages || []).map(String))])];
  const savesP = cls.saves.slice();
  const passive = 10 + mods.wis + (skills.has('perception') ? prof : 0) + (expertise.includes('perception') ? prof : 0);
  return {
    name: String(i.name).trim().slice(0, 40), race: race.id, raceName: sub ? sub.name : race.name, cls: cls.id, clsName: cls.name,
    subclass: subc && level >= subclassLevel(cls.id) ? subc.id : '', subclassName: subc && level >= subclassLevel(cls.id) ? subc.name : '',
    level, prof, ab, mods, saves: savesP, skills: [...skills].sort(), expertise,
    maxHp, ac, acNote, speed, size: race.size, hitDie: cls.hitDie, attacks, cast, features,
    traits: traits.map((t) => ({ name: t.name, desc: t.desc })), res, resources, sneak, extraAttacks, style: styleOn,
    profs, langs, passive, inventory: inv, gold, background: bg ? bg.name : (i.bgName || 'Custom background'),
    alignment: String(i.alignment || '').slice(0, 30), input: { ...input, level },
  };
}
const avgDie = (d) => { const m = String(d).match(/(\d+)d(\d+)/); return m ? Number(m[1]) * (Number(m[2]) + 1) / 2 : Number(d) || 0; };

// A fresh character with full hit points and nothing spent.
export function newCharacter(input, srd) {
  const d = derive(input, srd);
  return {
    ...d, hp: d.maxHp, tempHp: 0, hitDiceUsed: 0, xp: Number(input.xp) || 0, conds: [], exhaustion: 0,
    death: { s: 0, f: 0 }, stable: false, dead: false, conc: null, inspiration: false, raging: false, notes: '',
  };
}

// Rebuilds the numbers after a level, a new spell or new equipment, keeping what has been spent.
export function rebuild(pc, input, srd) {
  const d = derive(input, srd);
  const lost = Math.max(0, (pc.maxHp || 0) - (pc.hp || 0));
  const out = { ...pc, ...d, hp: Math.max(0, Math.min(d.maxHp, d.maxHp - lost)) };
  if (pc.hp <= 0) out.hp = 0;
  if (d.cast && pc.cast) d.cast.slots.forEach((s, k) => { s[1] = Math.min(s[0], ((pc.cast.slots || [])[k] || [0, 0])[1]); });
  out.resources = d.resources.map((r) => { const old = (pc.resources || []).find((x) => x.id === r.id); return old ? { ...r, used: Math.min(r.max, old.used) } : r; });
  out.hitDiceUsed = Math.min(d.level, pc.hitDiceUsed || 0);
  return out;
}

// ---- rolls ---------------------------------------------------------------------------
export function skillBonus(pc, skillId, srd) {
  const s = index(srd).skill[skillId];
  if (!s) return null;
  let b = pc.mods[s.ability];
  if (pc.skills.includes(skillId)) b += pc.prof;
  if ((pc.expertise || []).includes(skillId)) b += pc.prof;
  else if (!pc.skills.includes(skillId) && pc.cls === 'bard' && pc.level >= 2) b += Math.floor(pc.prof / 2); // Jack of All Trades
  return { bonus: b, ability: s.ability, name: s.name };
}
export const saveBonus = (pc, a) => pc.mods[a] + (pc.saves.includes(a) ? pc.prof : 0);
export const monsterSave = (m, a) => (m.saves && m.saves[a] != null ? m.saves[a] : mod(m.ab[ABILITIES.indexOf(a)]));
export const monsterMod = (m, a) => mod(m.ab[ABILITIES.indexOf(a)]);

// What conditions, exhaustion and rage do to a creature's own d20.
// kind: 'attack' | 'check' | 'save'.  Returns { adv, dis, fail, why: [] }.
export function selfEffects({ conds = [], exhaustion = 0, raging = false }, kind, ability) {
  const c = new Set(conds);
  const out = { adv: false, dis: false, fail: false, why: [] };
  const dis = (w) => { out.dis = true; out.why.push(w); };
  const adv = (w) => { out.adv = true; out.why.push(w); };
  if (kind === 'attack') {
    if (c.has('poisoned')) dis('poisoned');
    if (c.has('frightened')) dis('frightened');
    if (c.has('blinded')) dis('blinded');
    if (c.has('prone')) dis('prone');
    if (c.has('restrained')) dis('restrained');
    if (c.has('invisible')) adv('invisible');
    if (exhaustion >= 3) dis('exhaustion');
  }
  if (kind === 'check') {
    if (c.has('poisoned')) dis('poisoned');
    if (c.has('frightened')) dis('frightened');
    if (exhaustion >= 1) dis('exhaustion');
    if (raging && ability === 'str') adv('rage');
  }
  if (kind === 'save') {
    if (['str', 'dex'].includes(ability) && ['paralyzed', 'stunned', 'unconscious', 'petrified'].some((x) => c.has(x))) { out.fail = true; out.why.push('cannot move to save'); }
    if (ability === 'dex' && c.has('restrained')) dis('restrained');
    if (exhaustion >= 3) dis('exhaustion');
    if (raging && ability === 'str') adv('rage');
  }
  return out;
}
// What the target's conditions do to an attack made against it.
export function targetEffects(conds = [], { melee = true } = {}) {
  const c = new Set(conds);
  const out = { adv: false, dis: false, autoCrit: false, why: [] };
  for (const x of ['blinded', 'paralyzed', 'petrified', 'restrained', 'stunned', 'unconscious']) if (c.has(x)) { out.adv = true; out.why.push(`target ${x}`); }
  if (c.has('prone')) { if (melee) { out.adv = true; out.why.push('target prone'); } else { out.dis = true; out.why.push('target prone at range'); } }
  if (c.has('invisible')) { out.dis = true; out.why.push('target unseen'); }
  if (melee && (c.has('paralyzed') || c.has('unconscious'))) out.autoCrit = true;
  return out;
}
export const incapacitated = (conds = []) => ['incapacitated', 'paralyzed', 'petrified', 'stunned', 'unconscious'].some((x) => conds.includes(x));

// Resistance, vulnerability and immunity, read from a stat block's plain-text lists.
export function adjustDamage(amount, type, { res = [], vuln = [], imm = [] } = {}, { magical = false } = {}) {
  const t = String(type || '').toLowerCase();
  const hit = (list) => list.some((x) => {
    const s = String(x).toLowerCase();
    if (!t || !s.includes(t)) return false;
    // "bludgeoning, piercing, and slashing from nonmagical attacks" does not stop a magic weapon or a spell.
    if (/nonmagical/.test(s) && magical) return false;
    return true;
  });
  if (hit(imm)) return { amount: 0, note: 'immune' };
  if (hit(res)) return { amount: Math.floor(amount / 2), note: 'resisted' };
  if (hit(vuln)) return { amount: amount * 2, note: 'vulnerable' };
  return { amount, note: '' };
}

// ---- encounters ----------------------------------------------------------------------
export function encounterDifficulty(levels, xps, srd) {
  const t = srd.encounter.thresholds;
  const party = [0, 0, 0, 0];
  for (const l of levels) { const row = t[Math.max(1, Math.min(20, l)) - 1]; for (let k = 0; k < 4; k++) party[k] += row[k]; }
  const base = xps.reduce((a, b) => a + b, 0);
  const n = xps.length;
  const mult = n ? (srd.encounter.multipliers.filter(([c]) => n >= c).pop() || [1, 1])[1] : 1;
  // Fewer than three characters push the multiplier one step up; six or more one step down.
  const steps = [0.5, 1, 1.5, 2, 2.5, 3, 4, 5];
  let m = mult;
  if (levels.length && levels.length < 3) m = steps[Math.min(steps.length - 1, steps.indexOf(mult) + 1)];
  if (levels.length >= 6) m = steps[Math.max(0, steps.indexOf(mult) - 1)];
  const adjusted = Math.round(base * m);
  const names = ['Easy', 'Medium', 'Hard', 'Deadly'];
  let rating = 'Trivial';
  for (let k = 0; k < 4; k++) if (adjusted >= party[k]) rating = names[k];
  return { base, adjusted, multiplier: m, thresholds: party, rating };
}

// Words a player sees for a monster's health instead of its numbers.
export function healthWord(hp, max) {
  if (hp <= 0) return 'Down';
  const f = hp / Math.max(1, max);
  if (f >= 1) return 'Unhurt';
  if (f > 0.5) return 'Hurt';
  if (f > 0.25) return 'Bloodied';
  return 'Near death';
}
