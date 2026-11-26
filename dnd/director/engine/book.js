// The book compiler. A rules book is written for people: data/srd.json keeps the SRD's words, and
// any other book in the same shape (a homebrew bestiary, an adventure's own monsters) can join it.
// The Engine needs numbers, not sentences, so this reads each entry's words and writes the rules as
// fields beside them: the "engine version" of the book. The words are never changed or removed.
//
//   node tools/compile-book.mjs          data/srd.json -> data/srd.engine.json + data/srd.engine-gaps.md
//
// The same functions run when the Engine loads a book (rules.js index()), so an entry that was never
// compiled (an adventure's own monster, a book loaded straight) gets the same fields. Each compiled
// entry is marked eng: 1, so nothing is read twice. What cannot be read is listed as a gap for a person.
//
// Fields written (all optional; the words stay in desc / d):
//   spell:   dmgType, dmgSlot {slot: dice} or dmgLevel {character level: dice} (dice per hit),
//            count {slot: n} / countLevel {level: n} (darts, rays, beams), how: attack|save|auto (the Engine
//            deals the damage) or onHit|zone|retort|later|trap|option|mishap|incidental (the Director does),
//            attack, save {ability, success}, conds [conditions its words name], heal / drain
//   monster action: hit, dmg [[dice, type]] (dealt on a hit), kind melee|ranged|both, reach, range,
//            dc [ability, DC, success] (an action everyone in it saves against),
//            dmgAlt [[dice, type, when]] (another way to deal it: two hands, a smaller swarm),
//            rider {ability, dc, cond, dmg, half, fail} (a save after a hit), onHit [conditions], escape,
//            multi [{action name: count}, ...] (Multiattack: the choices, the first the usual one),
//            spells {ability, dc, hit, level, slots, list [{id, name, level, use}]} (Spellcasting traits)
//   condition: fx (what it does to attacks, checks, saves and actions: see CONDITION_RULES)
//   magic item: heal (a potion's dice), bonus + bonusTo (+1 weapons, armour, rings and cloaks)

export const ENGINE_VERSION = 1;

const DMG = 'acid|bludgeoning|cold|fire|force|lightning|necrotic|piercing|poison|psychic|radiant|slashing|thunder';
const CONDS = 'blinded|charmed|deafened|frightened|grappled|incapacitated|invisible|paralyzed|petrified|poisoned|prone|restrained|stunned|unconscious';
const AB = { strength: 'str', dexterity: 'dex', constitution: 'con', intelligence: 'int', wisdom: 'wis', charisma: 'cha' };
const ABW = 'Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma';
const WORDS = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twice: 2 };
const num = (w) => (/^\d+$/.test(w) ? Number(w) : WORDS[String(w).toLowerCase()] || 0);
const dice = (t) => String(t || '').replace(/[−–]/g, '-').replace(/\s+/g, '');
const ordN = (t) => Number(String(t).replace(/\D/g, ''));
// Slips in the SRD's own text that would stop a reading ("1dl0", "2d8 points of fire damage").
const tidy = (t) => String(t || '').replace(/(\d)dl(\d)/g, '$1d1$2').replace(/(\d+d\d+) points of/g, '$1').replace(/[−–]/g, '-');

// ---- what each condition does (SRD 5.1 Appendix A), as the Engine applies it.
//   attack: the creature's own attack rolls      attacked: attack rolls against it
//   attackedNear / attackedFar: against it from within 5 feet / further away
//   check: its ability checks      save: {ability: 'fail' | 'dis'}      act: 'none' (incapacitated)
//   speed: 0      crit: hits from within 5 feet are critical      also: conditions it includes
export const CONDITION_RULES = {
  blinded: { attack: 'dis', attacked: 'adv', sight: 'fail' },
  charmed: { harm: 'not the charmer', social: 'the charmer has advantage' },
  deafened: { hearing: 'fail' },
  frightened: { attack: 'dis', check: 'dis', approach: 'not toward the source' },
  grappled: { speed: 0 },
  incapacitated: { act: 'none' },
  invisible: { attack: 'adv', attacked: 'dis' },
  paralyzed: { act: 'none', speed: 0, save: { str: 'fail', dex: 'fail' }, attacked: 'adv', crit: true, also: ['incapacitated'] },
  petrified: { act: 'none', speed: 0, save: { str: 'fail', dex: 'fail' }, attacked: 'adv', resist: 'all', also: ['incapacitated'] },
  poisoned: { attack: 'dis', check: 'dis' },
  prone: { attack: 'dis', attackedNear: 'adv', attackedFar: 'dis' },
  restrained: { speed: 0, attack: 'dis', attacked: 'adv', save: { dex: 'dis' } },
  stunned: { act: 'none', save: { str: 'fail', dex: 'fail' }, attacked: 'adv', also: ['incapacitated'] },
  unconscious: { act: 'none', speed: 0, save: { str: 'fail', dex: 'fail' }, attacked: 'adv', crit: true, also: ['incapacitated', 'prone'] },
};
// A book may add or change conditions (its own fx); the Engine reads them from here.
export function addConditionRules(list) {
  for (const c of list || []) if (c && c.id && c.fx) CONDITION_RULES[c.id] = c.fx;
}

const mark = (x) => Object.defineProperty(x, 'eng', { value: ENGINE_VERSION, enumerable: true, writable: true, configurable: true });

// ---- spells
const DART = '(darts?|rays?|beams?|bolts?|motes?|missiles?)';
export function compileSpell(sp, gaps = []) {
  if (!sp || sp.eng) return sp;
  const desc = tidy(sp.desc);
  const higher = tidy(sp.higher);
  const all = `${desc}\n${higher}`;
  // How it reaches its target.
  if (sp.attack === undefined) { const a = /\bmake an? (ranged|melee) spell attack/i.exec(desc); if (a) sp.attack = a[1].toLowerCase(); }
  // The damage of one hit: "8d6 fire damage", "1d4 + 1 force damage", "force damage equal to 1d8 + your
  // spellcasting ability modifier", "The spell's base damage is 12d6", "20 radiant damage".
  const T = `(${DMG})`;
  const MODW = '(?:\\s*\\+\\s*(\\d+|your spellcasting ability modifier))?';
  let dm = null;
  let m1 = new RegExp(`(\\d+)d(\\d+)${MODW}\\s+(?:((?:${DMG})(?:,? (?:or )?(?:${DMG}))*) damage|damage of the type)`, 'i').exec(desc);
  if (m1) dm = { n: m1[1], d: m1[2], plus: m1[3], type: m1[4] && !/,| or /.test(m1[4]) ? m1[4] : '', types: m1[4] && /,| or /.test(m1[4]) ? m1[4].split(/,? (?:or )?|, /).filter(Boolean) : null };
  if (!dm && (m1 = new RegExp(`${T} damage equal to (\\d+)d(\\d+)${MODW}`, 'i').exec(desc))) dm = { n: m1[2], d: m1[3], plus: m1[4], type: m1[1] };
  if (!dm && (m1 = /base damage is (\d+)d(\d+)/i.exec(desc))) dm = { n: m1[1], d: m1[2], type: (new RegExp(`${T} damage`, 'i').exec(desc) || [])[1] };
  if (!dm && (m1 = new RegExp(`takes (\\d+) ${T} damage`, 'i').exec(desc))) dm = { flat: m1[1], type: m1[2] };
  if (dm && !sp.dmgSlot && !sp.dmgLevel) {
    const plus = dm.plus ? (/^\d+$/.test(dm.plus) ? `+${dm.plus}` : '+MOD') : '';
    const base = dm.flat || `${dm.n}d${dm.d}${plus}`;
    if (!sp.dmgType) sp.dmgType = dm.type ? dm.type.toLowerCase() : 'chosen';
    if (dm.types && !sp.dmgTypes) sp.dmgTypes = dm.types.map((x) => x.toLowerCase());
    if (sp.dmgType === 'chosen' && !sp.dmgTypes) {
      const listed = [...new Set([...desc.matchAll(new RegExp(`\\b(${DMG})\\b`, 'gi'))].map((x) => x[1].toLowerCase()))];
      if (listed.length > 1) sp.dmgTypes = listed;
    }
    if (sp.level === 0) {
      sp.dmgLevel = { 1: base };
      for (const st of desc.matchAll(/(\d+)(?:st|th) level \((\d+d\d+)\)/gi)) sp.dmgLevel[st[1]] = `${st[2]}${plus}`;
    } else {
      // "increases by 1d6 for each slot level above 3rd", "... for every two slot levels above 2nd",
      // "increases by 2d6, and ... for each slot level above 6th", "for each level of higher spell slot 2".
      const up = /increases? by (\d+)d(\d+)[^.]*? for (each|every two) (?:slot )?levels? (?:of higher spell slot |above (?:the )?)(\d)/i.exec(higher);
      sp.dmgSlot = {};
      for (let l = sp.level; l <= 9; l++) {
        const steps = up ? Math.floor((l - ordN(up[4])) / (up[3].toLowerCase() === 'each' ? 1 : 2)) : 0;
        sp.dmgSlot[l] = dm.flat ? base : `${Number(dm.n) + (up && up[2] === dm.d ? Number(up[1]) * Math.max(0, steps) : 0)}d${dm.d}${plus}`;
      }
    }
  }
  // Darts, rays and beams: more than one hit.
  const many = new RegExp(`\\b(two|three|four|five|six) (?:glowing |fiery |crackling )?${DART}\\b`, 'i').exec(desc);
  if (many && sp.level > 0) {
    const more = new RegExp(`one (?:more|additional) ${DART} for each slot level above (\\d)`, 'i').exec(higher);
    sp.count = {};
    for (let l = sp.level; l <= 9; l++) sp.count[l] = num(many[1]) + (more ? l - ordN(more[2]) : 0);
  }
  const beams = [...desc.matchAll(new RegExp(`(two|three|four) ${DART} at (\\d+)(?:st|th) level`, 'gi'))];
  if (beams.length && sp.level === 0) { sp.countLevel = { 1: 1 }; for (const b of beams) sp.countLevel[b[3]] = num(b[1]); }
  // Conditions it can cause.
  const conds = new Set();
  // Not "can't be charmed", "immune to being frightened" or "advantage on saves against being poisoned".
  for (const m of desc.matchAll(new RegExp(`(?<!\\b(?:can't|cannot|can|not|isn't|aren't|being|against) )\\b(?:is|be|are|becomes?|falls?|knocked|knocks? it|knocks? them)\\s+(?:knocked\\s+)?(${CONDS})\\b`, 'gi'))) conds.add(m[1].toLowerCase());
  for (const m of desc.matchAll(new RegExp(`\\b(${CONDS}) condition`, 'gi'))) conds.add(m[1].toLowerCase());
  if (conds.size) sp.conds = [...conds];
  // A save the target makes when the spell takes hold (filled only for a spell that harms or hinders,
  // and not one whose only save comes at the end of each turn, like Power Word Stun).
  const svSentence = (new RegExp(`[^.]*\\b(?:make|makes|succeed on|succeeds on|must make|fails?) an? (${ABW}) saving throw[^.]*`, 'i').exec(desc) || [''])[0];
  const sv = new RegExp(`(${ABW}) saving throw`, 'i').exec(svSentence);
  if (sp.save === undefined && sv && !sp.attack && (dm || conds.size) && !/end of each of its turns|repeat the saving throw/i.test(svSentence)) {
    sp.save = { ability: AB[sv[1].toLowerCase()], success: /half as much damage|half damage|half as much/i.test(desc) ? 'half' : 'none' };
  }
  // Healing that is not in a table: life drained, "regains hit points equal to half".
  if (/regain hit points equal to half the amount of (\w+ )?damage/i.test(desc)) sp.drain = 'half';
  if (!sp.heal && sp.level > 0) {
    const h = /regains? (?:a number of )?hit points equal to (\d+)d(\d+)(?:\s*\+\s*your spellcasting ability modifier)?/i.exec(desc);
    if (h) {
      const up = /increases by (\d+)d(\d+) for each slot level above (\d)/i.exec(higher);
      sp.heal = {};
      for (let l = sp.level; l <= 9; l++) sp.heal[l] = `${Number(h[1]) + (up ? Number(up[1]) * (l - ordN(up[3])) : 0)}d${h[2]}${/modifier/.test(h[0]) ? '+MOD' : ''}`;
    }
  }
  // How it does its harm.
  if (sp.dmgSlot || sp.dmgLevel) {
    if (!sp.how) sp.how = sp.attack ? 'attack' : sp.save ? 'save'
      : /\b(?:dart|missile)s? (?:hits?|strikes?)|automatically hits?|hits? a creature of your choice/i.test(desc) ? 'auto'
        : /\b(?:next time you hit|when you hit|your weapon attacks deal|weapon attack hits|hit (?:a|the) (?:creature|target) with (?:a|an) (?:weapon|attack)|your unarmed strikes deal|whenever you hit|when (?:you|they) hit with|hit with a weapon attack)/i.test(desc) ? 'onHit'
          : /hits you with a melee attack|touches you or hits you/i.test(desc) ? 'retort'
          : /enters? the (?:spell's )?area|starts? its turn|for every 5 feet|moves? into or within|ends? its turn/i.test(desc) ? 'zone' : '';
    if (!sp.how) gaps.push({ kind: 'spell', id: sp.id, name: sp.name, what: `deals ${sp.dmgSlot ? sp.dmgSlot[sp.level] : sp.dmgLevel[1]} ${sp.dmgType} damage, but how it reaches the target (attack, save or automatic) was not found` });
  } else if (new RegExp(`\\d+d\\d+[^.]{0,40}(?:${DMG}) damage`, 'i').test(desc)) {
    gaps.push({ kind: 'spell', id: sp.id, name: sp.name, what: 'mentions damage dice that were not read' });
  }
  if (sp.save && !sp.how && !sp.conds && !/saving throw/i.test(all)) gaps.push({ kind: 'spell', id: sp.id, name: sp.name, what: 'has a saving throw field but its words name none' });
  return mark(sp);
}

// ---- monsters
// The first condition the words put on a creature ("or be knocked prone", "and become frightened"),
// not one it is immune to or protected from.
const condIn = (t) => {
  const m = new RegExp(`(?<!\\b(?:can't|cannot|can|not|isn't|aren't|being|against) )\\b(?:is|be|are|become|becomes|falls?)\\s+(?:knocked\\s+)?(${CONDS})\\b`, 'i').exec(t);
  return m ? m[1].toLowerCase() : '';
};
const DMG_RX = new RegExp(`(?:(\\d+) \\((\\d+d\\d+(?:\\s*[+−–-]\\s*\\d+)?)\\)|\\b(\\d+)) (${DMG}) damage`, 'gi');
// Each damage the words name, in order. "..., or 5 (1d8 + 1) piercing damage if used with two hands" is
// another way to deal it (alt), not more damage; "plus 7 (2d6) fire damage" is more.
function readDamage(text) {
  const t = String(text || '');
  const out = [];
  let end = -1;
  for (const m of t.matchAll(DMG_RX)) {
    const alt = end >= 0 && /^\s*,?\s*or\s*$/i.test(t.slice(end, m.index));
    out.push({ at: m.index, expr: m[2] ? dice(m[2]) : m[3], type: m[4].toLowerCase(), alt, when: alt ? ((/^[^.,;]*?\b(if|while|when|in)\b[^.;]*/i.exec(t.slice(m.index + m[0].length)) || [''])[0].trim()) : '' });
    end = m.index + m[0].length;
  }
  return out;
}
const sameDice = (a, b) => dice(a).replace(/^\+/, '') === dice(b).replace(/^\+/, '');

function compileAction(a, mon, gaps, section) {
  if (!a || a.eng) return a;
  const d = tidy(a.d).replace(/\b(slash|pierc|bludgeon|lightn|poison|necrot|radi|thund) ing\b/g, '$1ing');
  const where = { kind: 'monster', id: mon.id, name: `${mon.name}: ${a.n}` };
  if (a.hit == null) { const h = /([+-−]\d+) to hit/.exec(d); if (h && /Weapon Attack|Spell Attack/.test(d)) a.hit = Number(h[1].replace('−', '-')); }
  const atk = /^(Melee or Ranged|Melee|Ranged) (?:Weapon|Spell) Attack/i.exec(d);
  if (atk) {
    a.kind = /or/i.test(atk[1]) ? 'both' : atk[1].toLowerCase();
    const r = /reach (\d+) ft/i.exec(d); if (r) a.reach = Number(r[1]);
    const g = /range (\d+)\/(\d+) ft/i.exec(d) || /range (\d+) ft/i.exec(d); if (g) a.range = g[2] ? `${g[1]}/${g[2]}` : g[1];
  }
  // The save clause, if any: everything after it is what the save decides.
  const saveRx = new RegExp(`DC (\\d+) (${ABW}) saving throw`, 'i');
  const sv = saveRx.exec(d);
  const found = readDamage(d);
  if (!a.dmg && found.length && (a.hit != null || sv)) a.dmg = found.filter((x) => !x.alt).map((x) => [x.expr, x.type]);
  const alts = found.filter((x) => x.alt);
  if (alts.length && !a.dmgAlt) a.dmgAlt = alts.map((x) => [x.expr, x.type, x.when]);
  if (a.hit == null && /Hit:/.test(d) && !atk) gaps.push({ ...where, what: 'reads like an attack but its attack bonus was not found' });
  if (a.hit != null && !a.dmg && /Hit: \d+ \(/.test(d)) gaps.push({ ...where, what: 'hits for damage that was not read' });
  if (sv) {
    const ab = AB[sv[2].toLowerCase()];
    const after = d.slice(sv.index);
    const sentence = after.split(/\.(?:\s|$)/)[0];
    const half = /half as much|half damage/i.test(sentence);
    const cond = condIn(sentence);
    if (a.hit != null) {
      // A save after a hit: its damage is not part of the hit. What else a failed save does is kept in words.
      const later = found.filter((f) => f.at > sv.index && !f.alt);
      const riderDmg = later.map((f) => [f.expr, f.type]);
      a.dmg = (a.dmg || []).filter(([expr, type]) => !later.some((f) => f.type === type && sameDice(f.expr, expr)));
      if (!a.dmg.length) delete a.dmg;
      const fail = (/saving throw,? (.*?)(?:\.|$)/i.exec(after) || [])[1] || '';
      if (!a.rider) a.rider = { ability: ab, dc: Number(sv[1]), cond, dmg: riderDmg, half, fail: fail.replace(/^or /, '').trim() };
    } else {
      if (!a.dc) a.dc = [ab, Number(sv[1]), half ? 'half' : 'none'];
      if (cond && !a.cond) a.cond = cond;
    }
  } else if (a.dc && !a.cond) {
    a.cond = condIn(d) || undefined;
    if (!a.cond) delete a.cond;
  }
  // Conditions a hit causes with no save: "the target is grappled (escape DC 13)".
  if (a.hit != null) {
    const hitPart = d.slice(d.indexOf('Hit:') + 1, sv ? sv.index : undefined);
    const on = new Set();
    for (const m of hitPart.matchAll(new RegExp(`\\b(?:is|are|it is|target is) (${CONDS})\\b`, 'gi'))) on.add(m[1].toLowerCase());
    if (on.size) a.onHit = [...on];
    const esc = /escape DC (\d+)/i.exec(d); if (esc) a.escape = Number(esc[1]);
  }
  if (a.n === 'Multiattack' || /^Multiattack/i.test(a.n)) {
    if (!a.multi) a.multi = readMulti(d, mon);
    if (!a.multi || !a.multi.length) { delete a.multi; gaps.push({ ...where, what: `the attacks it makes were not read: "${d}"` }); }
  }
  if (/Spellcasting/i.test(a.n) && section === 'traits') {
    if (!a.spells) a.spells = readSpellcasting(d, a.n);
    if (!a.spells || !a.spells.list.length) { delete a.spells; gaps.push({ ...where, what: 'the spells it can cast were not read' }); }
  }
  return mark(a);
}

// "The dragon can use its Frightful Presence. It then makes three attacks: one with its bite and two
// with its claws." -> [{ 'Frightful Presence': 1, Bite: 1, Claws: 2 }]. Each "or", "Alternatively" and
// "in place of" gives another choice; the first is the usual one.
const NW = '(?:one|two|three|four|five|six|a|an|\\d+)';
function readMulti(text, mon) {
  const acts = [...(mon.actions || []), ...(mon.traits || [])].filter((x) => !/^Multiattack/i.test(x.n));
  // An attack by its bonus, or by its words when the book has not been read yet (a pasted stat block).
  const attacks = acts.filter((x) => x.hit != null || /(?:Weapon|Spell) Attack:/i.test(x.d || ''));
  const stem = (w) => String(w).toLowerCase().replace(/\(.*?\)/g, '').replace(/[^a-z ]/g, '').replace(/\b(?:its|his|her|a|an)\b/g, '').trim().replace(/(?:es|s)$/, '');
  const find = (word) => {
    const w = stem(word);
    if (!w) return null;
    if (/^(?:melee|ranged|weapon)(?: weapon)?$/.test(w) || /^(?:any|one|those)/.test(w)) {
      const pool = attacks.filter((x) => w.startsWith('weapon') || /^(?:any|one|those)/.test(w) || new RegExp(`^${w}`, 'i').test(x.d));
      return pool.length ? pool[0].n : null;
    }
    const hit = acts.find((x) => stem(x.n) === w) || acts.find((x) => stem(x.n).startsWith(w) || w.startsWith(stem(x.n)))
      || acts.find((x) => stem(x.n).split(' ').includes(w) || w.split(' ').includes(stem(x.n)));
    if (hit) return hit.n;
    // "its runic blade" for the Rune Blade: the one attack that shares a word with it.
    const words = w.split(' ').filter((x) => x.length > 3);
    const near = attacks.filter((x) => stem(x.n).split(' ').some((y) => words.includes(y)));
    return near.length === 1 ? near[0].n : null;
  };
  const add = (ch, name, n) => {
    if (!name || !n) return;
    ch[name] = typeof n === 'number' && typeof ch[name] !== 'string' ? (ch[name] || 0) + n : n;
  };
  const t = String(text).replace(/—or /g, '. Or it makes ').replace(/—/g, ': ').replace(/\bAlternatively,/g, 'Or');
  // "makes two attacks, only one of which can be a bite": the other attack twice, or one of each.
  const only = new RegExp(`makes (\\w+) attacks, only one of which can be (?:a |an |with its )?([\\w' -]+?)(?: attack)?\\.`, 'i').exec(t);
  if (only) {
    const n = num(only[1]); const x = find(only[2]); const other = attacks.find((a) => a.n !== x);
    const out = [];
    if (other) out.push({ [other.n]: n });
    if (x && other && x !== other.n) out.push({ [x]: 1, [other.n]: n - 1 });
    return out;
  }
  // "makes three attacks, either with its longsword or its longbow"
  const either = new RegExp(`makes (\\w+) attacks?, either with (?:its )?([\\w' -]+?) or (?:with )?(?:its )?([\\w' -]+?)\\.`, 'i').exec(t);
  const choices = [];
  if (either) for (const w of [either[2], either[3]]) { const nm = find(w); if (nm) choices.push({ [nm]: num(either[1]) }); }
  // "makes two melee attacks, each one with a different weapon"
  const diff = /makes (\w+) (?:melee |ranged )?attacks, each (?:one )?with a different weapon/i.exec(t);
  if (diff) { const ch = {}; attacks.slice(0, num(diff[1])).forEach((a) => add(ch, a.n, 1)); choices.push(ch); }
  const swaps = [];
  let cur = null;
  if (!either && !diff) {
    for (const sen of t.split(/(?<=\.)\s+/)) {
      // "It can use Hurl Flame in place of any melee attack." "It can replace one of those attacks with a bite attack."
      const rep = new RegExp(`(?:use|make) (?:its |one |${NW} )?([\\w' -]+?)(?: attacks?)? in place of (?:one of |any |its |one )*(?:(${NW}) )?([\\w' -]+?) attacks?`, 'i').exec(sen);
      const rep2 = /replace one of (?:those|its|the) attacks with (?:a |an |its )?([\w' -]+?) attack/i.exec(sen);
      if (rep) { swaps.push({ put: rep[1], out: rep[3], n: rep[2] ? num(rep[2]) : 1 }); continue; }
      if (rep2) { swaps.push({ put: rep2[1], out: 'any', n: 1 }); continue; }
      const fresh = (/\bmakes\b/i.test(sen) && !/\b(?:then|also|If)\b/.test(sen)) || /^In \w+ form/i.test(sen) || /^Or\b/.test(sen);
      if (!cur || (fresh && Object.keys(cur).length)) { cur = {}; choices.push(cur); }
      const segs = sen.split(new RegExp(`\\s+or\\s+(?=(?:it |uses |makes |${NW} ))`, 'i'));
      segs.forEach((seg, i) => {
        if (i > 0) { cur = {}; choices.push(cur); }
        for (const u of seg.matchAll(/\buses? (?:its |either its )?([A-Z][\w' ]+?)( twice)?(?=\.|,| or | and |$)/g)) add(cur, find(u[1]) || u[1].trim(), u[2] ? 2 : 1);
        for (const m of seg.matchAll(new RegExp(`\\b(${NW}) (?:with|using|to) (?:its |his |her )?([\\w' -]+?)(?=,| and |\\.| or |\\(|$)`, 'gi'))) add(cur, find(m[2]), num(m[1]));
        if (!/attacks?:/i.test(seg)) {
          for (const m of seg.matchAll(new RegExp(`\\bmakes? (?:either )?(${NW}|\\d+d\\d+) ([\\w' -]+?) attacks?\\b(?! with)`, 'gi'))) {
            const n = /\dd\d/.test(m[1]) ? m[1] : num(m[1]); const nm = find(m[2]);
            if (n && nm) add(cur, nm, n);
          }
          for (const m of seg.matchAll(new RegExp(`\\bmakes? (${NW}) (?:(?:melee|ranged|weapon) )*attacks? with (?:its |his |her )?([\\w' -]+?)(?=,| and |\\.| or |$)`, 'gi'))) add(cur, find(m[2]), num(m[1]));
          for (const m of seg.matchAll(new RegExp(`\\band (${NW}) ([\\w' -]+?) attacks?\\b`, 'gi'))) add(cur, find(m[2]), num(m[1]));
        }
        const heads = /as many ([\w' -]+?) attacks as it has (\w+)/i.exec(seg);
        if (heads) add(cur, find(heads[1]), `one per ${heads[2].replace(/s$/, '')}`);
        // "makes three attacks" and nothing more: its first attack, that many times.
        const bare = new RegExp(`\\bmakes (${NW}) (melee |ranged )?attacks?\\.?$`, 'i').exec(seg.trim());
        if (bare && !Object.keys(cur).length) { const a = attacks.find((x) => !bare[2] || new RegExp(`^${bare[2].trim()}`, 'i').test(x.d)); if (a) add(cur, a.n, num(bare[1])); }
      });
    }
  }
  const out = choices.filter((c) => Object.keys(c).length);
  // Swaps: a copy of the usual choice with one attack put in place of another.
  for (const sw of swaps) {
    if (!out[0]) break;
    const put = find(sw.put) || sw.put.trim();
    const base = { ...out[0] };
    const outName = /^(?:any|one|those|melee)/i.test(sw.out) ? Object.keys(base).find((k) => typeof base[k] === 'number') : find(sw.out);
    if (!outName || typeof base[outName] !== 'number') continue;
    base[outName] -= sw.n;
    if (base[outName] <= 0) delete base[outName];
    add(base, put, 1);
    out.push(base);
  }
  return out;
}

function readSpellcasting(text, title = '') {
  const t = String(text || '');
  const ab = new RegExp(`spellcasting ability is (${ABW})`, 'i').exec(t);
  const out = {
    ability: ab ? AB[ab[1].toLowerCase()] : '',
    dc: Number((/spell save DC (\d+)/i.exec(t) || [])[1]) || 0,
    hit: Number((/([+-]\d+) to hit with spell attacks/i.exec(t) || [])[1]) || 0,
    level: Number((/(\d+)(?:st|nd|rd|th)-level spellcaster/i.exec(t) || [])[1]) || 0,
    slots: {}, list: [],
  };
  const push = (names, level, use) => {
    for (const raw of names.split(',')) {
      const name = raw.replace(/\*/g, '').replace(/\(.*?\)/g, '').trim();
      if (name) out.list.push({ id: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''), name, level, use });
    }
  };
  // Headed lists ("1st level (4 slots): ...", "3/day each: ..."), on their own lines or run together.
  const heads = [...t.matchAll(/(Cantrips(?: \(at will\))?|(\d)(?:st|nd|rd|th) level(?: \((\d+) slots?\))?|At will|(\d+)\/day(?: each)?)\s*:/gi)];
  heads.forEach((h, i) => {
    const body = t.slice(h.index + h[0].length, i + 1 < heads.length ? heads[i + 1].index : undefined).split('\n')[0];
    if (/^cantrip/i.test(h[1])) push(body, 0, 'at will');
    else if (h[2]) { if (h[3]) out.slots[h[2]] = Number(h[3]); push(body, Number(h[2]), 'slot'); }
    else push(body, null, /at will/i.test(h[1]) ? 'at will' : `${h[4]}/day`);
  });
  // "The mephit can innately cast sleep, requiring no material components." (the uses are in the title)
  const one = /can innately cast ([a-z][a-z' ]+?)(?:,|\.| requiring| \()/i.exec(t);
  if (!heads.length && one) push(one[1], null, (/(\d+)\/day/i.exec(title) || [0, ''])[1] ? `${/(\d+)\/day/i.exec(title)[1]}/day` : 'at will');
  return out;
}

export function compileMonster(m, gaps = []) {
  if (!m || m.eng) return m;
  for (const sec of ['traits', 'actions', 'legendary', 'reactions']) for (const a of m[sec] || []) compileAction(a, m, gaps, sec);
  return mark(m);
}

// ---- conditions and magic items
export function compileCondition(c, gaps = []) {
  if (!c || c.eng) return c;
  if (!c.fx && CONDITION_RULES[c.id]) c.fx = CONDITION_RULES[c.id];
  if (!c.fx && c.id !== 'exhaustion') gaps.push({ kind: 'condition', id: c.id, name: c.name, what: 'no rules for what it does (add fx)' });
  return mark(c);
}
export function compileItem(it, gaps = []) {
  if (!it || it.eng) return it;
  const d = String(it.desc || '');
  const h = /regain (\d+d\d+(?:\s*\+\s*\d+)?) hit points/i.exec(d);
  if (h && !it.heal) it.heal = dice(h[1]);
  const b = /\+(\d) bonus to (attack and damage rolls|AC|Armor Class|AC and saving throws|saving throws|spell attack rolls)/i.exec(d) || /^(?:Weapon|Armor)[^\n]*\+(\d)/i.exec(d);
  if (b && !it.bonus) { it.bonus = Number(b[1]); it.bonusTo = (b[2] || (/^Armor/i.test(d) ? 'AC' : 'attack and damage rolls')).replace('Armor Class', 'AC'); }
  return mark(it);
}

// Hand readings for what the words do not say plainly: { spells: {id: {fields}}, monsters: {id: {"Action
// name": {fields}}}, conditions: {id: {fields}}, magicItems: {id: {fields}} }. Applied before reading,
// so a reading never overwrites them. A book keeps its own in <book>.engine-fixes.json.
export function applyFixes(book, fixes = {}) {
  const lists = { spells: book.spells, conditions: book.conditions, magicItems: book.magicItems };
  for (const [sec, list] of Object.entries(lists)) {
    for (const [id, f] of Object.entries(fixes[sec] || {})) { const x = (list || []).find((y) => y.id === id); if (x) Object.assign(x, f); }
  }
  for (const [id, acts] of Object.entries(fixes.monsters || {})) {
    const m = (book.monsters || []).find((y) => y.id === id);
    if (!m) continue;
    for (const [name, f] of Object.entries(acts)) {
      for (const sec of ['traits', 'actions', 'legendary', 'reactions']) for (const a of m[sec] || []) if (a.n === name) Object.assign(a, f);
    }
  }
}

// The whole book: returns the gaps found. The book is changed in place (fields added, words kept).
export function compileBook(book, fixes) {
  if (fixes) applyFixes(book, fixes);
  const gaps = [];
  for (const sp of book.spells || []) compileSpell(sp, gaps);
  for (const m of book.monsters || []) compileMonster(m, gaps);
  for (const c of book.conditions || []) compileCondition(c, gaps);
  for (const it of book.magicItems || []) compileItem(it, gaps);
  addConditionRules(book.conditions);
  return gaps;
}
