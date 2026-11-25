// Forgiving names: what a person or a model types, matched to what the Engine knows. A near miss
// ("Grisk the bugbear", "Goblin scout1", "knocked prone", "perceive") finds the right thing; anything
// still unclear is refused with the choices listed, so the next try can be right. Browser-safe.

const norm = (s) => String(s == null ? '' : s).toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, ' ').trim()
  .replace(/^(?:the|a|an)\s+/, '');

// Edits from one word to another (insert, delete, change), stopping early past `max`.
export function distance(a, b, max = 3) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (cur[j] < best) best = cur[j];
    }
    if (best > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}
// How many slips a name of this length may carry and still be the one meant.
const slack = (n) => (n >= 9 ? 2 : n >= 5 ? 1 : 0);

// The one item a typed name means, or null. `names(item)` gives the names it answers to (id first).
// Exact first; then the same words with "the" and spacing ignored; then a unique prefix; then the name
// with the first words dropped ("Grisk the bugbear" -> "Grisk"); then a unique near spelling.
export function pick(list, ref, names) {
  const raw = String(ref == null ? '' : ref).trim();
  if (!raw) return null;
  const k = norm(raw);
  if (!k) return null;
  const all = (list || []).map((x) => [x, names(x).filter(Boolean).map(norm)]);
  const one = (hits) => (hits.length === 1 ? hits[0][0] : null);
  const exact = all.filter(([, ns]) => ns.includes(k));
  if (exact.length) return exact[0][0];
  const glued = all.filter(([, ns]) => ns.some((n) => n.replace(/\s+/g, '') === k.replace(/\s+/g, '')));
  if (glued.length === 1) return glued[0][0];
  const pre = one(all.filter(([, ns]) => ns.some((n) => k.length >= 3 && n.startsWith(k))));
  if (pre) return pre;
  const head = one(all.filter(([, ns]) => ns.some((n) => n.split(' ')[0] === k.split(' ')[0] && k.split(' ')[0].length >= 3)));
  if (head) return head;
  const inside = one(all.filter(([, ns]) => ns.some((n) => n.length >= 4 && (` ${k} `).includes(` ${n} `))));
  if (inside) return inside;
  let best = null; let bd = Infinity; let tie = false;
  for (const [x, ns] of all) {
    for (const n of ns) {
      const d = distance(k, n, 3);
      if (d > slack(n.length)) continue;
      if (d < bd) { bd = d; best = x; tie = false; } else if (d === bd && best !== x) tie = true;
    }
  }
  return best && !tie ? best : null;
}

// The 5e conditions, and the everyday words for them.
const COND_WORDS = {
  'knocked down': 'prone', 'knocked prone': 'prone', 'knocked over': 'prone', fallen: 'prone', 'on the ground': 'prone',
  scared: 'frightened', afraid: 'frightened', terrified: 'frightened', fear: 'frightened', panicked: 'frightened',
  poison: 'poisoned', sick: 'poisoned', nauseous: 'poisoned', 'held fast': 'restrained', entangled: 'restrained', tangled: 'restrained', webbed: 'restrained', bound: 'restrained', tied: 'restrained',
  grabbed: 'grappled', seized: 'grappled', grapple: 'grappled', pinned: 'grappled',
  stun: 'stunned', dazed: 'stunned', blind: 'blinded', deaf: 'deafened', charm: 'charmed', enthralled: 'charmed',
  asleep: 'unconscious', sleeping: 'unconscious', 'knocked out': 'unconscious', 'out cold': 'unconscious',
  frozen: 'paralyzed', paralysed: 'paralyzed', paralyse: 'paralyzed', paralyze: 'paralyzed', petrify: 'petrified', 'turned to stone': 'petrified', stone: 'petrified',
  invisibility: 'invisible', unseen: 'invisible', exhausted: 'exhaustion', tired: 'exhaustion', incapacitate: 'incapacitated',
};
export function condition(word, list) {
  const k = norm(word);
  if (!k) return null;
  if (list.includes(k)) return k;
  if (COND_WORDS[k] && list.includes(COND_WORDS[k])) return COND_WORDS[k];
  const hit = pick(list, k, (c) => [c]);
  return hit || null;
}

// Skills, and the everyday words for them.
const SKILL_WORDS = {
  spot: 'perception', notice: 'perception', perceive: 'perception', listen: 'perception', look: 'perception', awareness: 'perception',
  search: 'investigation', investigate: 'investigation', examine: 'investigation', sneak: 'stealth', hide: 'stealth', climb: 'athletics', swim: 'athletics', jump: 'athletics',
  balance: 'acrobatics', tumble: 'acrobatics', lie: 'deception', bluff: 'deception', 'sense motive': 'insight', read: 'insight', heal: 'medicine', 'first aid': 'medicine',
  track: 'survival', tracking: 'survival', forage: 'survival', intimidate: 'intimidation', threaten: 'intimidation', persuade: 'persuasion', diplomacy: 'persuasion',
  perform: 'performance', 'pick pocket': 'sleight-of-hand', 'sleight of hand': 'sleight-of-hand', sleight: 'sleight-of-hand', animals: 'animal-handling', 'animal handling': 'animal-handling',
  magic: 'arcana', lore: 'history', religion: 'religion', nature: 'nature',
};
export function skill(word, skills) {
  const k = norm(word);
  if (!k) return null;
  const list = skills || [];
  const byId = (id) => list.find((x) => x.id === id) || null;
  const direct = pick(list, k, (x) => [x.id, x.name, x.id.replace(/-/g, ' ')]);
  if (direct) return direct.id;
  const syn = SKILL_WORDS[k] || SKILL_WORDS[k.split(' ')[0]];
  return syn && byId(syn) ? syn : null;
}
