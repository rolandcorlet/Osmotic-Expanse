// Parsers that turn your own text exports of the 5e books into the Director's data shapes.
// Used by tools/import-books.mjs. Nothing from the books is ever committed: the output goes to
// library/, which git ignores (see library/README.txt). The parsers are forgiving of OCR noise.

export const slug = (s) => String(s).toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const SMALL = new Set(['of', 'the', 'and', 'from', 'to', 'with', 'in', 'on', 'a', 'an', 'or', 'for', 'at', 'by']);
export const titleCase = (s) => String(s).toLowerCase().replace(/\s+/g, ' ').trim().split(' ')
  .map((w, i) => (i && SMALL.has(w) ? w : w.replace(/^([("']?)([a-z])/, (m, p, c) => p + c.toUpperCase()))).join(' ')
  .replace(/'S\b/g, "'s");
const AB = { strength: 'str', dexterity: 'dex', constitution: 'con', intelligence: 'int', wisdom: 'wis', charisma: 'cha' };
const ord = (n) => `${n}${n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'}`;
const clean = (s) => String(s || '').replace(/\s+/g, ' ').replace(/\s+([,.;:])/g, '$1').trim();
// Digits the scanner misread as letters (ll → 11, O → 0) inside things that must be numbers.
const num = (s) => Number(String(s).replace(/[lI|]/g, '1').replace(/[Oo]/g, '0').replace(/\s+/g, ''));

// ------------------------------------------------------------------ spells (the PHB spell list)
// Spells whose SRD names differ from the book's, so the library does not add them twice.
const SRD_NAMES = {
  "bigby's hand": 'arcane-hand', "leomund's tiny hut": 'tiny-hut', "leomund's secret chest": 'secret-chest',
  "melf's acid arrow": 'acid-arrow', "mordenkainen's faithful hound": 'faithful-hound', "mordenkainen's magnificent mansion": 'magnificent-mansion',
  "mordenkainen's private sanctum": 'private-sanctum', "mordenkainen's sword": 'arcane-sword', "nystul's magic aura": 'arcanists-magic-aura',
  "otiluke's freezing sphere": 'freezing-sphere', "otiluke's resilient sphere": 'resilient-sphere', "otto's irresistible dance": 'irresistible-dance',
  "rary's telepathic bond": 'telepathic-bond', "tasha's hideous laughter": 'hideous-laughter', "tenser's floating disk": 'floating-disk',
  "evard's black tentacles": 'black-tentacles', "drawmij's instant summons": 'instant-summons',
};
export const spellId = (name) => SRD_NAMES[String(name).toLowerCase()] || slug(name);

export function spellMechanics(s) {
  const t = `${s.desc} ${s.higher || ''}`;
  const sv = s.desc.match(/(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) saving throw/);
  if (sv) s.save = { ability: AB[sv[1].toLowerCase()], success: /half as much damage on a successful|half as much damage on a success|half damage on a success/i.test(s.desc) ? 'half' : 'none' };
  if (/ranged spell attack/i.test(s.desc)) s.attack = 'ranged';
  else if (/melee spell attack/i.test(s.desc)) s.attack = 'melee';
  const h = s.desc.match(/regains? (?:a number of )?hit points equal to (\d+)d(\d+)( \+ your spellcasting ability modifier)?/i);
  if (h && s.level > 0) {
    const up = (s.higher || '').match(/(?:healing|hit points?)[^.]*?increases? by (\d+)d(\d+) for each slot level above/i);
    s.heal = {};
    for (let l = s.level; l <= 9; l++) s.heal[l] = `${Number(h[1]) + (up ? Number(up[1]) * (l - s.level) : 0)}d${h[2]}${h[3] ? '+MOD' : ''}`;
  }
  const a = t.match(/(\d+)-foot(?:-radius)?[ -](sphere|cube|cone|line|cylinder|radius|square)/i);
  if (a) s.area = `${a[1]}-foot ${a[2].toLowerCase()}`;
  return s;
}

export function parseSpellList(text) {
  const L = text.split(/\r?\n/);
  const out = [];
  for (let i = 0; i < L.length - 1; i++) {
    const head = L[i].trim();
    if (!head || /^\s/.test(L[i]) || !/^\s+Level\/School:/.test(L[i + 1])) continue;
    const f = {}; const body = [];
    let j = i + 1;
    for (; j < L.length && (/^\s+\S/.test(L[j]) || (!L[j].trim() && /^\s+\S/.test(L[j + 1] || '') && body.length)); j++) {
      const m = L[j].match(/^\s+(Level\/School|Casting Time|Range|Components|Duration|Classes):\s*(.*)$/);
      if (m && !body.length) f[m[1]] = m[2].trim();
      else if (L[j].trim()) body.push(L[j].trim());
    }
    i = j - 1;
    const ritual = /\(RITUAL\)/i.test(head) || /ritual/i.test(f['Level/School'] || '');
    const name = titleCase(head.replace(/\(RITUAL\)/i, '').trim());
    const ls = (f['Level/School'] || '').replace(/\(cantrip\)|\(ritual\)/ig, '').trim().split(/\s+/);
    const level = Number(ls[0]) || 0;
    const comp = f.Components || '';
    const mat = (comp.match(/M\s*\((.*)\)\s*$/) || [])[1] || '';
    const dur = f.Duration || '';
    const higherAt = body.findIndex((x) => /^At Higher Levels\./i.test(x));
    const descLines = higherAt >= 0 ? body.slice(0, higherAt) : body;
    const higher = higherAt >= 0 ? body.slice(higherAt).join(' ').replace(/^At Higher Levels\.\s*/i, '') : '';
    const s = {
      id: spellId(name), name, level, school: titleCase(ls.slice(1).join(' ') || 'Unknown'),
      time: f['Casting Time'] || '1 action', range: f.Range || '', comp: ['V', 'S', 'M'].filter((c) => new RegExp(`(^|[ ,])${c}([ ,(]|$)`).test(comp)).join(''),
      mat: mat ? `${mat.charAt(0).toUpperCase()}${mat.slice(1)}${/[.!]$/.test(mat) ? '' : '.'}` : '',
      dur: dur.replace(/^Concentration,\s*/i, '').replace(/^u/, 'U'), conc: /^Concentration/i.test(dur), ritual,
      classes: (f.Classes || '').split(',').map((c) => slug(c)).filter(Boolean),
      desc: descLines.join('\n').replace(/([a-z])- ([a-z])/g, '$1$2'), higher, lib: true,
    };
    out.push(spellMechanics(s));
  }
  return out;
}

// --------------------------------------------------- races, classes, backgrounds (character generator)
const block = (L, start, stop) => { const out = []; for (let i = start + 1; i < L.length && !stop(L[i]); i++) out.push(L[i]); return out; };
const field = (lines, name) => { const r = new RegExp(`^\\s*${name}:\\s*(.*)$`, 'i'); const l = lines.find((x) => r.test(x)); return l ? l.match(r)[1].trim() : ''; };
const bonusOf = (s) => { const b = {}; for (const m of String(s).matchAll(/(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma)\s*\+(\d)/gi)) b[AB[m[1].toLowerCase()]] = Number(m[2]); return b; };
const traitsOf = (lines) => lines.map((x) => x.match(/^\s*\*\s*([^:]+):\s*(.+)$/)).filter(Boolean).map((m) => ({ name: m[1].trim(), desc: m[2].trim() }));
const SKILLS = ['acrobatics', 'animal-handling', 'arcana', 'athletics', 'deception', 'history', 'insight', 'intimidation', 'investigation', 'medicine', 'nature', 'perception', 'performance', 'persuasion', 'religion', 'sleight-of-hand', 'stealth', 'survival'];
const skillIds = (s) => String(s).split(/,|\band\b/).map((x) => slug(x.trim())).filter((x) => SKILLS.includes(x));
const NUMBERS = { none: 0, one: 1, two: 2, three: 3, four: 4 };
// A subclass's short id: "Path of the Totem Warrior" → totem-warrior, "Knowledge Domain" → knowledge.
export const subclassId = (name) => slug(String(name).replace(/^(the )?(path|college|circle|way|oath|school) of (the )?/i, '').replace(/^the /i, '').replace(/ domain$/i, ''));

export function parseCharGen(text) {
  const L = text.split(/\r?\n/);
  const isHead = (x) => /^(RACE|CLASS|BACKGROUND):\s/.test(x) || /^PART \d/.test(x);
  const races = []; const classes = []; const backgrounds = [];
  L.forEach((line, i) => {
    let m = line.match(/^RACE:\s*(.+)$/);
    if (m) {
      const lines = block(L, i, isHead);
      const subraces = [];
      lines.forEach((x, k) => {
        const sm = x.match(/^\s*--- Subrace:\s*(.+?)\s*---/);
        if (!sm) return;
        const sub = block(lines, k, (y) => /--- Subrace:/.test(y) || /^\S/.test(y) && !/^\s/.test(y) && y.trim() && !/^\s*\*/.test(y));
        const inner = sm[1].match(/\(([^)]+)\)/);
        const traits = traitsOf(sub);
        const speed = (field(sub, 'Speed Note').match(/(\d+) feet/) || [])[1];
        subraces.push({
          id: slug(inner ? inner[1] : sm[1]), name: sm[1], desc: field(sub, 'Notes') || traits.map((t) => t.name).join(', '),
          bonus: bonusOf(field(sub, 'Ability Score Increase')), traits, ...(speed ? { speed: Number(speed) } : {}), lib: true,
        });
      });
      races.push({ id: slug(m[1]), name: titleCase(m[1]), subraces });
      return;
    }
    m = line.match(/^CLASS:\s*(.+)$/);
    if (m) {
      const lines = block(L, i, isHead);
      const choice = field(lines, 'Subclass Choice Level');
      const flavor = (choice.match(/\(([^:;)]+)/) || [])[1] || 'Subclass';
      let names = [];
      const opt = lines.findIndex((x) => /^Subclass Options:/.test(x));
      if (opt >= 0) for (let k = opt + 1; k < lines.length && /^\s+-\s/.test(lines[k]); k++) names.push(lines[k].replace(/^\s+-\s*/, '').replace(/:.*$/, '').trim());
      else if (/:/.test(choice.replace(/^[^(]*\(/, ''))) {
        const list = choice.replace(/^[^(]*\([^:]+:\s*/, '').split(';')[0];
        names = list.split(/,\s*|\s+or\s+/).map((x) => x.replace(/^(or|the)\s+/i, '').replace(/^the\s+/i, '').trim()).filter(Boolean);
      }
      if (/wizard/i.test(m[1]) && !names.length) names = ['School of Abjuration', 'School of Conjuration', 'School of Divination', 'School of Enchantment', 'School of Evocation', 'School of Illusion', 'School of Necromancy', 'School of Transmutation'];
      classes.push({ id: slug(m[1]), name: titleCase(m[1]), subclasses: names.map((n) => ({ id: subclassId(n), name: titleCase(n).replace(/^The /, 'The '), flavor: titleCase(flavor.trim()), desc: `${titleCase(n)}: see your Player's Handbook for its features.`, levels: [], lib: true })) });
      return;
    }
    m = line.match(/^BACKGROUND:\s*(.+)$/);
    if (m) {
      const lines = block(L, i, isHead);
      const feat = lines.map((x) => x.match(/^Feature - ([^:]+):\s*(.+)$/)).find(Boolean);
      const lang = field(lines, 'Languages').toLowerCase();
      const gold = (field(lines, 'Equipment').match(/(\d+)\s*gp/) || [])[1];
      backgrounds.push({
        id: slug(m[1]), name: titleCase(m[1]), skills: skillIds(field(lines, 'Skill Proficiencies')),
        tools: field(lines, 'Tool Proficiencies'), languages: NUMBERS[(lang.match(/^(none|one|two|three)/) || [])[1]] ?? 0,
        gold: gold ? Number(gold) : 10, items: [], kitText: field(lines, 'Equipment'),
        feature: feat ? { name: feat[1].trim(), desc: feat[2].trim() } : { name: '', desc: '' }, lib: true,
      });
    }
  });
  return { races, classes, backgrounds };
}

// ---------------------------------------------------------------- monsters (the Monster Manual)
const TYPES = 'aberration|beast|celestial|construct|dragon|elemental|fey|fiend|giant|humanoid|monstrosity|ooze|plant|undead|swarm';
const SIZES = [['gargantuan', 'Gargantuan'], ['uge', 'Huge'], ['arge', 'Large'], ['edium', 'Medium'], ['mall', 'Small'], ['iny', 'Tiny']];
const DIE_SIZE = { 4: 'Tiny', 6: 'Small', 8: 'Medium', 10: 'Large', 12: 'Huge', 20: 'Gargantuan' };
const FIELDS = ['Saving Throws', 'Skills', 'Damage Vulnerabilities', 'Damage Resistances', 'Damage Immunities', 'Condition Immunities', 'Senses', 'Languages', 'Challenge'];
const NOT_A_NAME = /^(The|A|An|If|When|While|Each|This|It|Its|On|In|As|Until|Once|For|After|Any|One|Two|That|These|Those|Its|If|Some|Most|Many|Such|Alternatively)\b/;
const crOf = (s) => { const t = String(s).replace(/[lI]/g, '1').replace(/[Oo]/g, '0').trim(); if (/^1\s*\/\s*8/.test(t)) return 0.125; if (/^1\s*\/\s*4/.test(t)) return 0.25; if (/^1\s*\/\s*2/.test(t)) return 0.5; return Number((t.match(/^\d+/) || ['0'])[0]); };
const pbOf = (cr) => (cr < 5 ? 2 : cr < 9 ? 3 : cr < 13 ? 4 : cr < 17 ? 5 : cr < 21 ? 6 : cr < 25 ? 7 : cr < 29 ? 8 : 9);
const listOf = (s) => (s ? String(s).split(/;\s*/).flatMap((p) => (/from|that aren't|nonmagical|non magical/i.test(p) ? [clean(p).replace(/non magical/i, 'nonmagical')] : p.split(/,\s*/).map(clean))).filter((x) => x && x !== '-') : []);

export function actionMechanics(n, d) {
  const a = { n, d };
  const hit = d.match(/([+-]\s*\d+)\s+to\s+hit/i);
  if (hit) a.hit = Number(hit[1].replace(/\s+/g, ''));
  const dmg = [];
  for (const m of d.matchAll(/\d+\s*\(\s*(\d+\s*d\s*\d+(?:\s*[+-]\s*\d+)?)\s*\)\s*([a-z]+)\s+damage/gi)) dmg.push([m[1].replace(/\s+/g, ''), m[2].toLowerCase()]);
  if (dmg.length) a.dmg = dmg;
  const dc = d.match(/DC\s*(\d+)\s+(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma)\s+saving throw/i);
  if (dc && a.hit == null) a.dc = [AB[dc[2].toLowerCase()], Number(dc[1]), /half as much/i.test(d) ? 'half' : 'none'];
  const use = n.match(/\((Recharge [^)]+|\d+\s*\/\s*Day[^)]*|Recharges? after [^)]+|Costs \d+ Actions)\)/i);
  if (use) { a.use = use[1]; a.n = clean(n.replace(use[0], '')); }
  return a;
}

export function parseIndex(L) {
  const at = L.findIndex((x) => /^INDEX OF STAT BLOCKS/.test(x));
  const ix = new Map();
  if (at < 0) return ix;
  for (const line of L.slice(at)) for (const m of line.matchAll(/([A-Z][A-Za-z' ()-]+?)[,.]\s*(\d{1,3})\b/g)) {
    const name = mend(titleCase(clean(m[1]).replace(/^(INDEX OF STAT BLOCKS.*?\.)\s*/, '')));
    if (name.length > 2 && name.split(' ').length <= 5) ix.set(name.toLowerCase(), { name, page: Number(m[2]) });
  }
  return ix;
}

// Re-join words the scan split ("Rh Inoceros", "Quaggot H", "Adult S Ilver Dragon").
const KEEP = new Set(['of', 'to', 'in', 'on', 'an', 'at', 'by', 'or', 'ox', 'a']);
export const mend = (name) => {
  const w = String(name).split(/\s+/);
  for (let i = 0; i < w.length; i++) {
    if (w[i].length > 2 || KEEP.has(w[i].toLowerCase())) continue;
    if (i === w.length - 1 && i > 0) { w[i - 1] += w[i].toLowerCase(); w.splice(i, 1); i -= 1; } else if (i + 1 < w.length) { w[i + 1] = w[i] + w[i + 1].toLowerCase(); w.splice(i, 1); i -= 1; }
  }
  return w.join(' ');
};
const lev = (a, b) => {
  if (Math.abs(a.length - b.length) > 2) return 9;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
};

export function parseMonsters(text) {
  const L = text.split(/\r?\n/).map((x) => x.replace(/\s+$/, ''))
    .flatMap((x) => x.replace(/([.)])\s+([A-Z][A-Za-z'’]+(?: [A-Z][A-Za-z'’]+){0,3}(?: \([^)]{1,30}\))?\.\s+(?:Melee|Ranged)(?: or Ranged)? (?:Weapon|Spell) Attack)/g, '$1\n$2').split('\n'));
  const index = parseIndex(L);
  const squash = (x) => String(x).toLowerCase().replace(/[^a-z]/g, '');
  const bySquash = new Map([...index.values()].map((e) => [squash(e.name), e]));
  // A heading's real name: the index's spelling when the scan mangled it ("Rh Inoceros").
  const resolve = (name) => {
    if (/^(multiattack|actions|legendary actions|reactions|lair actions|regional effects|spellcasting|innate spellcasting|variant\b.*|the nine hells|.*'s lair|.*\blair)$/i.test(name)) return null;
    const e = index.get(name.toLowerCase()) || bySquash.get(squash(name));
    if (e) return e;
    let best = null;
    for (const x of index.values()) { const d = lev(squash(x.name), squash(name)); if (d <= 2 && (!best || d < best.d)) best = { d, x }; }
    return best ? best.x : { name, page: 0 };
  };
  const pageOf = []; let page = 0;
  const heads = [];
  L.forEach((x, i) => {
    const pm = x.match(/^-{2,}\s*\[p\.(\d+)/); if (pm) page = Number(pm[1]);
    pageOf[i] = page;
    const h = x.match(/^####\s+(.+?)\s*$/); if (h) heads.push({ i, name: titleCase(h[1]), used: false, known: index.has(h[1].toLowerCase()) });
  });
  const acLines = L.map((x, i) => (/^Armor Class\s+[\dlIO]/.test(x) ? i : -1)).filter((i) => i >= 0);
  const usedIndex = new Set();
  const out = []; let prevEnd = 0;
  acLines.forEach((ac, n) => {
    // The size/type line sits just above "Armor Class".
    let typeAt = -1;
    for (let k = ac - 1; k >= Math.max(prevEnd, ac - 5); k--) if (new RegExp(`\\b(${TYPES})\\b`, 'i').test(L[k]) && /,/.test(L[k]) && L[k].length < 90) { typeAt = k; break; }
    const start = typeAt >= 0 ? typeAt : ac;
    const nextAc = acLines[n + 1] ?? L.length;
    let end = nextAc;
    for (let k = ac + 1; k < nextAc; k++) if (/^####\s/.test(L[k])) { end = k; break; }
    if (end === nextAc) { for (let k = nextAc - 1; k > ac && k >= nextAc - 6; k--) if (new RegExp(`\\b(${TYPES})\\b`, 'i').test(L[k]) && /,/.test(L[k]) && L[k].length < 90) { end = k; break; } }
    // Its name: score the unused headings since the last block and the index entries for this page
    // by how often the stat block's own text names them ("The ice devil makes three attacks").
    let name = ''; let lore = ''; let h0 = null;
    const pg0 = pageOf[start];
    const body = L.slice(start, end).join(' ').toLowerCase();
    const cands = [];
    const near = heads.filter((h) => h.i < start && h.i >= prevEnd && !h.used);
    near.forEach((h, k) => { const e = resolve(mend(h.name)); if (e) cands.push({ name: e.name, inIndex: !!e.page, page: e.page, head: h, nearest: k === near.length - 1 }); });
    for (const e of index.values()) if (e.page >= pg0 - 2 && e.page <= pg0 + 1) cands.push({ name: e.name, inIndex: true, page: e.page });
    let best = null;
    for (const c of cands) {
      const low = c.name.toLowerCase();
      if (usedIndex.has(low)) continue;
      const full = body.split(low).length - 1;
      const lastWord = low.split(' ').pop().replace(/s$/, '');
      const part = lastWord.length > 3 ? body.split(lastWord).length - 1 : 0;
      const score = (c.inIndex ? 3 : 0) + Math.min(full, 3) * 5 + Math.min(part, 4) + (c.nearest ? (c.inIndex ? 7 : 3) : 0) + (c.head ? 1 : 0) - (c.page && (pg0 < c.page - 1 || pg0 > c.page + 2) ? 8 : 0);
      if (!best || score > best.score) best = { score, c };
    }
    if (best && best.score >= 4) {
      name = best.c.name; usedIndex.add(name.toLowerCase());
      if (best.c.head) { best.c.head.used = true; h0 = best.c.head; }
      if (h0) lore = clean(L.slice(h0.i + 1, start).filter((x) => x && !/^-{2,}\s*\[p\./.test(x) && !/^#/.test(x) && x.length > 40).join(' ')).slice(0, 1500);
    }
    prevEnd = end;
    if (!name) return;
    const m = parseBlock(L.slice(start, end), typeAt >= 0, name);
    if (m && !out.some((x) => x.id === m.id)) { m.page = pageOf[ac]; if (lore) m.lore = lore; out.push(m); }
  });
  return out;
}

function parseBlock(B, hasType, name) {
  const typeLine = hasType ? B[0] : '';
  const at = (re) => B.findIndex((x) => re.test(x));
  const acL = B[at(/^Armor Class/)];
  const acM = acL.match(/Armor Class\s+([\dlIO]+)\s*(?:[({](.+?)[)}])?/);
  const hpL = B[at(/^Hit Points/)] || '';
  const hpM = hpL.match(/Hit Points\s+([\dlIO ]+?)\s*\(([^)]+)\)/);
  if (!acM || !hpM) return null;
  const hdM = hpM[2].replace(/\s+/g, '').match(/(\d+)d(\d+)/);
  const fieldText = (label) => {
    const k = at(new RegExp(`^${label}\\b`));
    if (k < 0) return '';
    let t = B[k].slice(label.length).trim();
    for (let j = k + 1; j < B.length && B[j] && !FIELDS.some((f) => B[j].startsWith(f)) && !/^[A-Z][\w' ]+\.\s/.test(B[j]) && !/^(STR|ACTIONS)/.test(B[j]); j++) t += ` ${B[j].trim()}`;
    return clean(t);
  };
  // Ability scores: the line after STR DEX CON..., topped up from stray score lines the scan displaced.
  const sAt = at(/^STR\b/);
  const scores = [];
  const grab = (line) => { for (const m of String(line).matchAll(/([0-9lIO]{1,2})\s*\(\s*([+\-−–])?\s*([0-9lIO]{1,2})\s*\)/g)) scores.push(num(m[1])); };
  if (sAt >= 0) for (let j = sAt + 1; j < Math.min(B.length, sAt + 4) && scores.length < 6; j++) if (/\(\s*[+\-−–]?\s*[0-9lIO]+\s*\)/.test(B[j])) grab(B[j]);
  if (scores.length < 6) for (const line of B) if (scores.length < 6 && /^\s*[0-9lIO]{1,2}\s*\(\s*[+\-−–]?\s*[0-9lIO]{1,2}\s*\)/.test(line) && B.indexOf(line) > sAt + 1) grab(line.match(/^\s*[0-9lIO]{1,2}\s*\([^)]*\)/)[0]);
  while (scores.length < 6) scores.push(10);
  const chL = fieldText('Challenge');
  const cr = crOf(chL);
  const xp = Number((chL.match(/\(([\d,]+)\s*XP/) || [, '0'])[1].replace(/,/g, '')) || 0;
  const tm = typeLine.match(new RegExp(`\\b(${TYPES})\\b(?:\\s*\\(([^)]+)\\))?`, 'i'));
  const sizeWord = typeLine.split(/\s+/)[0].toLowerCase();
  const size = (SIZES.find(([k]) => sizeWord.includes(k)) || [])[1] || DIE_SIZE[hdM ? Number(hdM[2]) : 8] || 'Medium';
  const saves = {};
  for (const m of fieldText('Saving Throws').matchAll(/(Str|Dex|Con|Int|Wis|Cha)\s*([+-]\s*\d+)/g)) saves[m[1].toLowerCase()] = Number(m[2].replace(/\s+/g, ''));
  const skills = {};
  for (const m of fieldText('Skills').matchAll(/([A-Z][a-z]+(?: of Hand| Handling)?)\s*([+-]\s*\d+)/g)) skills[m[1]] = Number(m[2].replace(/\s+/g, ''));
  // Traits, then ACTIONS, REACTIONS and LEGENDARY ACTIONS: "Name. text" entries, wrapped lines joined.
  const chAt = at(/^Challenge\b/);
  const parts = { traits: [], actions: [], reactions: [], legendary: [] };
  let sect = 'traits'; let cur = null; let blank = false;
  for (const raw of B.slice(chAt + 1)) {
    const line = raw.trim().replace(/(\d)\s*[Jj]\s*day/g, '$1/day');
    if (!line) { blank = true; continue; }
    if (/^-{2,}\s*\[p\./.test(line)) continue;
    if (/^LEGENDARY ACTIONS/.test(line)) { sect = 'legendary'; cur = null; continue; }
    if (/^REACTIONS?$/.test(line)) { sect = 'reactions'; cur = null; continue; }
    if (/^ACTIONS$/.test(line)) { sect = 'actions'; cur = null; continue; }
    if (/^(STR|DEX|CON|INT|WIS|CHA)$/.test(line)) continue;
    const e = line.match(/^([A-Z][A-Za-z0-9'’ ()\/,:+–-]{1,70}?)\.\s+(\S.*)$/);
    if (e && e[1].split(/\s+/).length <= 7 && !NOT_A_NAME.test(e[1]) && !/:\s*$/.test(e[1])) { cur = { n: clean(e[1]), d: e[2] }; parts[sect].push(cur); blank = false; continue; }
    const cont = /^[a-z0-9(]/.test(line) || /^(At will|\d+\s*\/\s*day|Cantrips|\d+(st|nd|rd|th) level)/i.test(line) || !blank;
    if (cur && cont) { cur.d += `${/[-–]$/.test(cur.d) ? '' : ' '}${line}`; blank = false; continue; }
    if (blank && cur) break; // lore after the stat block
    blank = false;
  }
  const fix = (x) => actionMechanics(x.n, clean(x.d));
  const m = {
    id: slug(name), name, size, type: tm ? tm[1].toLowerCase() : 'monstrosity', sub: tm && tm[2] ? clean(tm[2]).toLowerCase() : '',
    align: typeLine.includes(',') ? clean(typeLine.slice(typeLine.lastIndexOf(',') + 1)).toLowerCase() : 'unaligned',
    ac: num(acM[1]), acNote: acM[2] ? clean(acM[2]).replace(/r;1/g, 'n') : '', hp: num(hpM[1]), hd: hdM ? `${hdM[1]}d${hdM[2]}` : '1d8',
    speed: fieldText('Speed') || clean((B[at(/^Speed/)] || 'Speed 30 ft.').replace(/^Speed\s*/, '')), ab: scores.slice(0, 6), saves, skills,
    vuln: listOf(fieldText('Damage Vulnerabilities')), res: listOf(fieldText('Damage Resistances')), imm: listOf(fieldText('Damage Immunities')),
    cimm: listOf(fieldText('Condition Immunities')), senses: fieldText('Senses'), lang: fieldText('Languages').replace(/^-$/, '—'),
    cr, xp, pb: pbOf(cr), traits: parts.traits.map((t) => ({ n: t.n, d: clean(t.d) })), actions: parts.actions.map(fix), lib: true,
  };
  if (parts.reactions.length) m.reactions = parts.reactions.map(fix);
  if (parts.legendary.length) m.legendary = parts.legendary.map(fix);
  if (!m.actions.length || !(m.hp > 0) || !(m.ac > 0) || m.ac > 30) return null;
  // A scan can misread a number: check the hit points against the dice and the XP against the CR.
  const bonus = Number((hpM[2].replace(/\s+/g, '').match(/[+-]\d+/) || ['0'])[0]);
  const expect = hdM ? Math.floor(Number(hdM[1]) * (Number(hdM[2]) + 1) / 2) + bonus : m.hp;
  const XP = { 0: 10, 0.125: 25, 0.25: 50, 0.5: 100, 1: 200, 2: 450, 3: 700, 4: 1100, 5: 1800, 6: 2300, 7: 2900, 8: 3900, 9: 5000, 10: 5900, 11: 7200, 12: 8400, 13: 10000, 14: 11500, 15: 13000, 16: 15000, 17: 18000, 18: 20000, 19: 22000, 20: 25000, 21: 33000, 22: 41000, 23: 50000, 24: 62000, 30: 155000 };
  if (Math.abs(expect - m.hp) > 1 || (XP[m.cr] && m.xp && XP[m.cr] !== m.xp && m.xp !== 0)) m.check = 'Read from a scan: some numbers may be wrong. Check the book.';
  if (!m.xp && XP[m.cr] != null) m.xp = XP[m.cr];
  return m;
}

// ------------------------------------------------------------ rules text (PHB, DMG) for look-ups
// Headed books (# lines) are cut at each heading; paged books (--- Page N ---) page by page.
export function parseRulesBook(text, book) {
  const L = text.split(/\r?\n/);
  const paged = L.filter((x) => /^--- Page \d+ ---/.test(x)).length > 20;
  const out = []; let page = 0; let cur = null;
  const push = () => {
    if (!cur) return;
    const t = cur.lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
    if (t.length < 120) return;
    for (let k = 0, part = 0; k < t.length; k += 2400, part++) out.push({ id: `${slug(book)}-${out.length + 1}`, name: `${cur.name}${part ? ` (${part + 1})` : ''}`, book, page: cur.page, text: t.slice(k, k + 2600) });
  };
  for (const line of L) {
    const pm = line.match(/^--- Page (\d+) ---/) || line.match(/^-{2,}\s*\[p\.(\d+)/);
    if (pm) {
      page = Number(pm[1]);
      if (paged) { push(); cur = { name: '', page, lines: [] }; }
      continue;
    }
    const h = !paged && line.match(/^(#{1,4})\s+(.+?)\s*$/);
    if (h) { push(); cur = { name: titleCase(h[2]), page, lines: [] }; continue; }
    if (!cur) cur = { name: book, page, lines: [] };
    if (paged && !cur.name && line.trim().length > 3 && line.trim().length < 60 && !/[.,;]$/.test(line.trim())) cur.name = titleCase(line.trim());
    cur.lines.push(line);
  }
  push();
  for (const r of out) if (!r.name) r.name = `${book} page ${r.page}`;
  return out;
}

// Which book a text file is, from what is in it.
export function sniff(text) {
  const head = text.slice(0, 4000);
  if (/COMPLETE SPELL LIST/i.test(head) && /Level\/School:/.test(text)) return 'spells';
  if (/PART 2: RACES/i.test(text) && /BACKGROUND:/.test(text)) return 'chargen';
  if (/Monster Manual/i.test(head) && (text.match(/^Armor Class/gm) || []).length > 100) return 'monsters';
  if (/Dungeon Master'?s Guide/i.test(head)) return 'dmg';
  if ((text.match(/^--- Page \d+ ---/gm) || []).length > 100) return 'phb';
  return '';
}
