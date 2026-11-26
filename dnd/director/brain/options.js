// Character options in a book (races and subraces, backgrounds, feats), read without the AI from the
// usual 5e layout as copied out of a PDF, in the SRD's own shapes, so character creation lists them:
//   races:       "Dwarf Traits" ... "Ability Score Increase. Your Constitution score increases by 2." ...
//                "Speed. Your base walking speed is 25 feet." and the traits after ("Darkvision. ...").
//                A block with no Speed is a subrace of the race before it ("Hill Dwarf").
//   backgrounds: a name, its story, then "Skill Proficiencies: Insight, Religion", Tool Proficiencies,
//                Languages, Equipment, and "Feature: Shelter of the Faithful" with its words.
//   feats:       a name, "Prerequisite: ..." perhaps, and "You gain the following benefits".
// readOptions(text) -> { races: [...], subraces: [{ race, ...sub }], backgrounds: [...], feats: [...] }
// Browser-safe, no state.

const ABN = { strength: 'str', dexterity: 'dex', constitution: 'con', intelligence: 'int', wisdom: 'wis', charisma: 'cha' };
const NUM = { one: 1, two: 2, three: 3, four: 4, a: 1, an: 1 };
const SKILLS = ['acrobatics', 'animal handling', 'arcana', 'athletics', 'deception', 'history', 'insight', 'intimidation', 'investigation', 'medicine', 'nature', 'perception', 'performance', 'persuasion', 'religion', 'sleight of hand', 'stealth', 'survival'];
// Entries a race's text always has that are not traits of their own.
// Headings in a background's pages that are not its name.
const NOT_A_BACKGROUND = /^(?:Suggested Characteristics|Variant|Personality Traits?|Ideals?|Bonds?|Flaws?|Specialty|Favorite|Feature|Scam|Trait|Equipment|Languages|d\d+)\b/i;
const RACE_FIELDS = ['ability score increase', 'age', 'alignment', 'size', 'speed', 'languages', 'subrace', 'subraces'];

export const slugOf = (t) => String(t || '').toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').replace(/-+/g, '-').slice(0, 60);
const clean = (t) => String(t || '').replace(/\r/g, '').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-').replace(/ /g, ' ');
const tidy = (t) => String(t || '').replace(/\s+/g, ' ').replace(/\s+([.,;:])/g, '$1').trim();
const title = (s) => s.replace(/\b\w/g, (c) => c.toUpperCase());

// A line that is a heading: short, no end punctuation, mostly capitalised words, with prose after it.
function isHeading(line, next) {
  const s = line.trim();
  if (!s || s.length > 40 || /[.,;:!?]$/.test(s) || s.includes(':') || /^\d/.test(s) || /^--- Page/.test(s)) return false;
  const words = s.split(/\s+/);
  if (words.length > 5) return false;
  const caps = words.filter((w) => /^[A-Z]/.test(w)).length;
  return caps >= Math.ceil(words.length * 0.6) && (!next || next.trim().length > 0);
}
// The lines without page markers and blank lines, so a paragraph broken by the PDF reads as one.
function lines(text) {
  return clean(text).split('\n').filter((l) => !/^--- Page \d+ ---$/.test(l.trim())).map((l) => l.replace(/\s+$/, '')).filter((l) => l.trim());
}
// "Name. what it does" entries from a run of lines: a new entry starts at a line beginning with one to five
// capitalised words and a full stop.
function entries(ls) {
  const out = [];
  for (const l of ls) {
    const m = /^((?:[A-Z][\w'-]*)(?:\s+(?:of|the|and|[A-Z][\w'-]*)){0,4})\.\s+(.*)$/.exec(l.trim());
    if (m && m[1].length <= 40) out.push({ name: m[1], desc: m[2] });
    else if (out.length) out[out.length - 1].desc += ` ${l.trim()}`;
  }
  return out.map((e) => ({ name: e.name, desc: tidy(e.desc) }));
}
function bonusOf(text) {
  const t = tidy(text).toLowerCase();
  const bonus = {}; let choice = 0;
  if (/ability scores each increase by 1/.test(t)) for (const a of Object.values(ABN)) bonus[a] = 1;
  for (const m of t.matchAll(/your (strength|dexterity|constitution|intelligence|wisdom|charisma) score increases? by (\d)/g)) bonus[ABN[m[1]]] = Number(m[2]);
  for (const m of t.matchAll(/your (strength|dexterity|constitution|intelligence|wisdom|charisma) and (strength|dexterity|constitution|intelligence|wisdom|charisma) scores (?:both )?increase by (\d)/g)) { bonus[ABN[m[1]]] = Number(m[3]); bonus[ABN[m[2]]] = Number(m[3]); }
  const ch = /(one|two|three) (?:other |different )?ability scores? of your choice (?:each )?increases? by 1/.exec(t);
  if (ch) choice = NUM[ch[1]];
  return { bonus, choice };
}

// ---- races and subraces ----------------------------------------------------------------------------
function readRaces(ls) {
  const races = []; const subraces = [];
  const at = ls.map((l, i) => (/^Ability Score Increase\.?\s/.test(l.trim()) ? i : -1)).filter((i) => i >= 0);
  at.forEach((start, k) => {
    // The name: the nearest heading above ("Dwarf Traits" is the dwarf; "Hill Dwarf" a subrace).
    let name = '';
    for (let i = start - 1; i >= Math.max(0, start - 30); i--) {
      if (/^[A-Z][\w'-]*(?:\s+[A-Z][\w'-]*){0,4}\.\s/.test(ls[i].trim())) break; // the race before's entries
      if (isHeading(ls[i], ls[i + 1])) { name = ls[i].trim(); break; }
    }
    if (!name) return;
    name = name.replace(/\s+Traits$/i, '');
    // The block: to the next race's increase, or the first heading after its entries.
    const stop = k + 1 < at.length ? at[k + 1] : ls.length;
    // A sidebar in the middle ("Always Appreciative") is stepped over until the next entry, while the
    // race's Size and Speed are still to come; after them, a heading ends the block.
    const block = [];
    const entryStart = (l) => /^[A-Z][\w'-]*(?:\s+(?:of|the|and|[A-Z][\w'-]*)){0,4}\.\s/.test(l.trim());
    const speedAhead = (i) => ls.slice(i, Math.min(stop, i + 30)).some((l) => /^Speed\.\s/.test(l.trim()));
    let skipping = false; let sawSpeed = false;
    for (let i = start; i < Math.min(stop, start + 120); i++) {
      if (i > start && isHeading(ls[i], ls[i + 1]) && !entryStart(ls[i])) {
        if (sawSpeed || !speedAhead(i)) break;
        skipping = true; continue;
      }
      if (skipping && !entryStart(ls[i])) continue;
      skipping = false;
      if (/^Speed\.\s/.test(ls[i].trim())) sawSpeed = true;
      block.push(ls[i]);
    }
    const es = entries(block);
    const get = (n) => (es.find((e) => e.name.toLowerCase() === n) || {}).desc || '';
    const { bonus, choice } = bonusOf(get('ability score increase'));
    const traits = es.filter((e) => !RACE_FIELDS.includes(e.name.toLowerCase())).map((e) => ({ name: e.name, desc: e.desc }));
    const speedText = get('speed');
    if (speedText) {
      const sizeText = get('size');
      const langText = get('languages');
      races.push({
        id: slugOf(name), name: title(name.toLowerCase()), speed: Number((/(\d+) feet/.exec(speedText) || [0, 30])[1]),
        size: (/your size is (\w+)/i.exec(sizeText) || [0, 'Medium'])[1].replace(/^\w/, (c) => c.toUpperCase()),
        bonus, bonusChoice: choice,
        languages: (langText.match(/\b(Common|Dwarvish|Elvish|Giant|Gnomish|Goblin|Halfling|Orc|Abyssal|Celestial|Draconic|Deep Speech|Infernal|Primordial|Sylvan|Undercommon)\b/g) || ['Common']).filter((x, i, a) => a.indexOf(x) === i),
        langDesc: langText, age: get('age'), alignment: get('alignment'), sizeDesc: sizeText, traits, subraces: [],
      });
    } else if (races.length) {
      subraces.push({ race: races[races.length - 1].id, id: slugOf(name), name: title(name.toLowerCase()), desc: '', bonus, traits });
    }
  });
  return { races, subraces };
}

// ---- backgrounds -----------------------------------------------------------------------------------
function readBackgrounds(ls) {
  const out = [];
  ls.forEach((l, start) => {
    if (!/^Skill Proficiencies:/i.test(l.trim())) return;
    let name = '';
    for (let i = start - 1; i >= Math.max(0, start - 60); i--) {
      const s = ls[i].trim();
      if (/^(?:Skill|Tool) Proficiencies:|^Equipment:|^Languages:/i.test(s)) break; // the one before
      if (isHeading(ls[i], ls[i + 1]) && s.split(/\s+/).length <= 3 && !NOT_A_BACKGROUND.test(s)) { name = s; break; }
    }
    if (!name) return;
    const field = (label) => {
      for (let i = start; i < Math.min(ls.length, start + 8); i++) {
        const m = new RegExp(`^${label}:\\s*(.*)$`, 'i').exec(ls[i].trim());
        if (!m) continue;
        let v = m[1];
        for (let j = i + 1; j < Math.min(ls.length, i + 6) && !/^[A-Z][\w ]+:/.test(ls[j].trim()) && !isHeading(ls[j], ls[j + 1]); j++) v += ` ${ls[j].trim()}`;
        return tidy(v);
      }
      return '';
    };
    const skills = field('Skill Proficiencies').toLowerCase().split(/,|\band\b/).map((x) => x.trim()).filter((x) => SKILLS.includes(x)).map((x) => x.replace(/\s+/g, '-'));
    const langs = field('Languages').toLowerCase();
    const equip = field('Equipment');
    let feature = null;
    for (let i = start; i < Math.min(ls.length, start + 200); i++) {
      const m = /^Feature:\s*(.+)$/i.exec(ls[i].trim());
      if (!m) { if (i > start + 2 && /^Skill Proficiencies:/i.test(ls[i].trim())) break; continue; }
      const desc = [];
      for (let j = i + 1; j < ls.length && desc.join(' ').length < 1400; j++) { if (isHeading(ls[j], ls[j + 1])) break; desc.push(ls[j].trim()); }
      feature = { name: tidy(m[1]), desc: tidy(desc.join(' ')) };
      break;
    }
    out.push({
      id: slugOf(name), name: title(name.toLowerCase()), skills, tools: field('Tool Proficiencies') || 'None',
      languages: (/(one|two|three)\b/.exec(langs) || [0, ''])[1] ? NUM[(/(one|two|three)\b/.exec(langs))[1]] : 0,
      gold: Number((/containing (\d+) gp/i.exec(equip) || [0, 0])[1]), items: [], kitText: equip, feature: feature || { name: '', desc: '' },
    });
  });
  return out;
}

// ---- feats -----------------------------------------------------------------------------------------
// A feat is a heading in the book's feats section: found where headings followed by "you gain the following
// benefits" crowd together (a class's "Rage" with the same words stands alone), then every heading between
// the first and the last of them, since not every feat says those words ("Lucky").
function readFeats(ls) {
  const marked = ls.map((l, i) => (isHeading(l, ls[i + 1]) && /you gain the following benefits/i.test(ls.slice(i + 1, i + 6).join(' ')) ? i : -1)).filter((i) => i >= 0);
  let best = []; let run = [];
  for (const i of marked) { if (run.length && i - run[run.length - 1] > 120) run = []; run.push(i); if (run.length > best.length) best = run.slice(); }
  if (best.length < 3) return [];
  // The section runs on past the last marked feat ("Tough", "War Caster") to the next chapter.
  const from = best[0]; const last = best[best.length - 1];
  let to = Math.min(ls.length - 1, last + 80);
  for (let i = last + 1; i <= to; i++) if (/^\s*Chapter\b|_/.test(ls[i])) { to = i - 1; break; }
  const out = [];
  ls.forEach((l, i) => {
    if (i < from || i > to || !isHeading(l, ls[i + 1]) || /^Chapter\b|_/i.test(l.trim()) || isHeading(ls[i + 1] || '', ls[i + 2])) return;
    if (/^Prerequisite:/i.test((ls[i - 1] || '').trim())) return;
    const pre = /^Prerequisite:\s*(.+)$/i.exec((ls[i + 1] || '').trim());
    const body = [];
    for (let j = i + (pre ? 2 : 1); j < ls.length && body.length < 40; j++) { if (isHeading(ls[j], ls[j + 1])) break; body.push(ls[j].trim()); }
    // Bullets ("•" from the PDF) become the SRD's "- " lines.
    const desc = body.join(' ').replace(/\s*[•·]\s*/g, '\n- ').replace(/[ \t]+/g, ' ').trim();
    out.push({ id: slugOf(l), name: l.trim(), ...(pre ? { prereq: tidy(pre[1]) } : {}), desc });
  });
  return out;
}

// ---- subclasses ------------------------------------------------------------------------------------
// A subclass is found by its name as a heading: the names the rules already know (the SRD's, and those your
// library lists without their features), and new ones by the way each class names them ("Path of the Storm
// Herald", "Grave Domain", "Circle of Spores", "School of Chronurgy"). Its features are the headings after it
// that say the level they come at ("Starting at 6th level", "When you choose this domain at 1st level").
const FLAVOR = [
  [/^Path of (?:the )?[A-Z]/, 'barbarian', 'Primal Path'], [/^College of [A-Z]/, 'bard', 'Bard College'],
  [/ Domain$/, 'cleric', 'Divine Domain'], [/^Circle of (?:the )?[A-Z]/, 'druid', 'Druid Circle'],
  [/^Way of (?:the )?[A-Z]/, 'monk', 'Monastic Tradition'], [/^Oath of (?:the )?[A-Z]/, 'paladin', 'Sacred Oath'],
  [/ Bloodline$|^Wild Magic$/, 'sorcerer', 'Sorcerous Origin'], [/^School of [A-Z]/, 'wizard', 'Arcane Tradition'],
];
// Headings that end a subclass's write-up: a class's own sections, and the next class's subclass list.
const CLASS_STOP = /^(?:Class Features|Hit Points|Proficiencies|Equipment|Quick Build|Barbarian|Bard|Cleric|Druid|Fighter|Monk|Paladin|Ranger|Rogue|Sorcerer|Warlock|Wizard|Primal Paths?|Bard Colleges?|Divine Domains?|Druid Circles?|Martial Archetypes?|Monastic Traditions?|Sacred Oaths?|Ranger Archetypes?|Roguish Archetypes?|Sorcerous Origins?|Otherworldly Patrons?|Arcane Traditions?)$/i;
const LEVEL_AT = /\b(?:at|starting at|beginning at|when you [a-z ]+? at)\s+(\d{1,2})(?:st|nd|rd|th) level/i;
function readSubclasses(ls, srd) {
  const flat = (x) => String(x || '').toLowerCase().replace(/[^a-z]/g, '');
  const known = [];
  for (const c of (srd && srd.classes) || []) for (const sc of c.subclasses || []) known.push({ cls: c.id, name: sc.name, flavor: sc.flavor || '' });
  const isFeature = (i) => isHeading(ls[i], ls[i + 1]) && LEVEL_AT.test(ls.slice(i + 1, i + 3).join(' '));
  // Every heading that names a subclass, known or by its class's pattern, with a feature soon after it.
  const heads = [];
  ls.forEach((l, i) => {
    const s = l.trim();
    if (!isHeading(l, ls[i + 1]) || /\bspells?$/i.test(s) || CLASS_STOP.test(s)) return;
    const k = known.find((x) => flat(x.name) === flat(s));
    const f = !k && FLAVOR.find(([rx]) => rx.test(s));
    if (!k && !f) return;
    let feat = -1;
    for (let j = i + 1; j < Math.min(ls.length, i + 60); j++) if (isFeature(j)) { feat = j; break; }
    if (feat < 0) return;
    heads.push({ at: i, name: k ? k.name : s.replace(/\b\w+/g, (w) => (w === w.toUpperCase() && w.length > 2 ? w[0] + w.slice(1).toLowerCase() : w)), cls: k ? k.cls : f[1], flavor: k ? k.flavor : f[2] });
  });
  const out = [];
  heads.forEach((h, n) => {
    if (out.some((x) => flat(x.name) === flat(h.name))) return; // the first full write-up of each
    const end = Math.min(ls.length, n + 1 < heads.length ? heads[n + 1].at : h.at + 260);
    const features = [];
    let intro = [];
    for (let i = h.at + 1; i < end; i++) {
      if (/^\s*Chapter\b|_/.test(ls[i]) || (isHeading(ls[i], ls[i + 1]) && CLASS_STOP.test(ls[i].trim()))) break;
      if (isFeature(i)) {
        const level = Number(LEVEL_AT.exec(ls.slice(i + 1, i + 3).join(' '))[1]);
        // A subclass's features come in level order: a lower level means the text has run into a class.
        if (features.length && level < features[features.length - 1].level) break;
        const desc = [];
        for (let j = i + 1; j < end && !isFeature(j) && desc.join(' ').length < 1600; j++) { if (isHeading(ls[j], ls[j + 1]) && (CLASS_STOP.test(ls[j].trim()) || /^\s*Chapter\b/.test(ls[j]))) break; desc.push(ls[j].trim()); }
        features.push({ name: ls[i].trim(), level, desc: tidy(desc.join(' ')) });
      } else if (!features.length && intro.join(' ').length < 600) intro.push(ls[i].trim());
    }
    if (!features.length) return;
    const levels = [...new Set(features.map((f) => f.level))].sort((a, b) => a - b).map((lv) => ({ level: lv, features: features.filter((f) => f.level === lv).map((f) => f.name) }));
    out.push({ cls: h.cls, id: slugOf(h.name), name: h.name, flavor: h.flavor, desc: tidy(intro.join(' ')).slice(0, 600), levels, features: Object.fromEntries(features.map((f) => [f.name, f.desc])) });
  });
  return out;
}

export function readOptions(text, { srd = null } = {}) {
  const ls = lines(text);
  const { races, subraces } = readRaces(ls);
  return { races, subraces, backgrounds: readBackgrounds(ls), feats: readFeats(ls), subclasses: readSubclasses(ls, srd) };
}
// How many option markers the text has: for "work it out".
export function optionMarks(text) {
  const t = clean(text);
  const n = (rx) => (t.match(rx) || []).length;
  return n(/^\s*Ability Score Increase\./gim) + n(/^\s*Skill Proficiencies:/gim) + n(/you gain the following benefits/gi) + n(/^(?:Also )?(?:starting|beginning) at \d{1,2}(?:st|nd|rd|th) level/gim);
}
