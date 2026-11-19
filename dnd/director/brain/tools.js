// The Director's tools. Each is a thin, checked doorway into the Ledger: the model asks, the Engine
// decides, and a refusal comes back in plain words so the next call can be the right one.

import { apply, RuleError } from '../engine/ledger.js';
import * as R from '../engine/rules.js';

const S = (description, extra = {}) => ({ type: 'string', description, ...extra });
const I = (description) => ({ type: 'integer', description });
const B = (description) => ({ type: 'boolean', description });
const A = (description) => ({ type: 'array', items: { type: 'string' }, description });
const obj = (properties, required = []) => ({ type: 'object', properties, required });
const lower = (v) => String(v == null ? '' : v).trim().toLowerCase();
const truthy = (v) => v === true || (typeof v === 'string' && /^\s*(true|yes|y|1)\s*$/i.test(v));
const listOf = (v) => {
  if (Array.isArray(v)) return v.map(String);
  if (typeof v === 'string' && v.trim().startsWith('[')) { try { const p = JSON.parse(v); return Array.isArray(p) ? p.map(String) : []; } catch (e) { return []; } }
  if (typeof v === 'string' && v.trim()) return v.split(/\s*,\s*|\s+and\s+/).filter(Boolean);
  return [];
};

// Finding a character or monster by id or by name, as models write both.
export function findPc(s, ref) {
  const k = lower(ref).replace(/^pc:/, '');
  const list = Object.values(s.pcs);
  return list.find((p) => p.id === k) || list.find((p) => lower(p.name) === k) || list.find((p) => k && lower(p.name).split(/\s+/)[0] === k.split(/\s+/)[0]) || null;
}
export function findFoe(s, ref, { all = false } = {}) {
  const k = lower(ref).replace(/^foe:/, '');
  const list = Object.values(s.foes).filter((f) => (all || f.siteId === s.scene.siteId));
  return list.find((f) => f.id === k) || list.find((f) => lower(f.name) === k) || list.find((f) => !f.dead && k && lower(f.name).startsWith(k)) || list.find((f) => !f.dead && k && lower(f.base) === k) || null;
}
const party = (s) => Object.values(s.pcs).map((p) => `${p.id} (${p.name})`).join(', ') || 'nobody yet';
const here = (s) => Object.values(s.foes).filter((f) => f.siteId === s.scene.siteId && !f.dead).map((f) => `${f.id} (${f.name})`).join(', ') || 'no monsters';

function targetRef(s, ref) {
  const p = findPc(s, ref);
  if (p) return `pc:${p.id}`;
  const f = findFoe(s, ref);
  if (f) return `foe:${f.id}`;
  return null;
}
// What changed for the table, for the model to narrate from (the newest story lines and rolls).
function since(T, seq) {
  const out = {};
  const ev = T.state.story.filter((e) => e.seq > seq && e.kind === 'event').map((e) => e.text);
  if (ev.length) out.happened = ev;
  const rolls = T.state.rolls.filter((r) => r.seq > seq).map((r) => `${r.who}: ${r.label} = ${r.total}${r.at != null ? ` vs ${r.at}` : ''}${r.success === true ? ' (success)' : r.success === false ? ' (fail)' : ''}${r.dmg && r.dmg.total != null ? `, damage ${r.dmg.total}` : ''}`);
  if (rolls.length) out.rolls = rolls;
  return out;
}

export const TOOLS = [
  {
    name: 'ask_for_roll',
    description: 'Ask one or more characters for an ability check or a saving throw. The roll appears on their screen; you learn the result on your next turn. Stop and wait after asking. For a hazard or a monster spell with a saving throw, give the effect: damage dice and type, half on success, and/or a condition on a failure.',
    parameters: obj({
      characters: A('Ids or names of the characters who roll. Several for a group check or an area effect.'),
      kind: S('"check" or "save".', { enum: ['check', 'save'] }),
      skill: S('For a check: the skill, e.g. perception, stealth, athletics, insight, persuasion. Leave empty for a plain ability check or a save.'),
      ability: S('For a save or a plain check: str, dex, con, int, wis or cha.'),
      dc: I('The Difficulty Class: 10 easy, 12-13 medium, 15 hard, 20 very hard.'),
      reason: S('What the roll is for, in a few words the player sees ("Spot the goblins in the mill").'),
      advantage: S('"adv", "dis" or empty.'),
      damage_on_fail: S('Optional, for saves: damage dice such as "2d6".'),
      damage_type: S('Optional: the damage type, such as fire, poison, bludgeoning.'),
      half_on_success: B('Optional: true if a successful save halves the damage.'),
      condition_on_fail: S('Optional: a condition a failed save imposes (prone, poisoned, frightened, paralyzed, restrained, blinded, charmed, stunned).'),
    }, ['characters', 'kind', 'dc', 'reason']),
    run(a, T) {
      const ids = listOf(a.characters).map((x) => findPc(T.state, x)).filter(Boolean).map((p) => p.id);
      if (!ids.length) return { refused: `Name characters who are in the party: ${party(T.state)}.` };
      const effect = a.damage_on_fail || a.condition_on_fail ? { dmg: a.damage_on_fail || '', type: a.damage_type || '', half: truthy(a.half_on_success), cond: lower(a.condition_on_fail) } : null;
      if (effect && effect.dmg && !/^\s*\d*d\d+(\s*[+-]\s*\d+)?\s*$/i.test(effect.dmg)) return { refused: `"${effect.dmg}" is not a dice amount like 2d6 or 3d8+2.` };
      const no = T.do({ type: 'roll.ask', pcIds: ids, kind: lower(a.kind) === 'save' ? 'save' : 'check', skill: lower(a.skill).replace(/\s+/g, '-'), ability: lower(a.ability), dc: a.dc, reason: a.reason, adv: lower(a.advantage), effect });
      if (no) return { refused: no };
      return { asked: ids.map((id) => T.state.pcs[id].name).join(', '), note: 'The roll is on their screen. Stop here and wait for it: do not describe the outcome.' };
    },
  },
  {
    name: 'move_party',
    description: 'Move the party to another place when they choose to go there. Only an exit the briefing lists can be taken. Monsters placed at the new place stay hidden until revealed or a fight starts.',
    parameters: obj({ place: S('The id of the place (from the exits list).') }, ['place']),
    run(a, T) {
      const before = T.state.seq;
      const no = T.do({ type: 'site.move', siteId: lower(a.place) });
      if (no) return { refused: no };
      const site = T.site();
      const hidden = Object.values(T.state.foes).filter((f) => f.siteId === site.id && !f.dead && f.hidden).map((f) => `${f.id} (${f.name})`);
      return { arrived: site.name, first_visit: !(T.state.scene.visited || []).includes(site.id), describe: site.read, notes: site.notes,
        monsters_already_here: hidden.length ? `${hidden.join(', ')}: placed and hidden. Do not add more; reveal them (reveal_monsters) when they are seen, or start_combat when the fight begins.` : 'none', exits: (site.exits || []).map((e) => `${e.to} (${e.label})`), ...since(T, before) };
    },
  },
  {
    name: 'add_monsters',
    description: 'Place SRD monsters at the party\'s current place, for an encounter the adventure does not already place. Check MONSTERS HERE first: the adventure\'s own monsters are already placed (hidden) when the party arrives. Use hidden=true for monsters lying in wait that the players have not seen.',
    parameters: obj({ monster: S('The SRD monster id or name, e.g. goblin, wolf, skeleton, orc, giant-spider.'), count: I('How many (1-12).'), name: S('Optional name for them, e.g. "Grisk" or "Bandit".'), hidden: B('True if the players cannot see them yet.') }, ['monster']),
    run(a, T) {
      const no = T.do({ type: 'foe.add', monster: a.monster, count: a.count || 1, name: a.name || '', hidden: truthy(a.hidden) });
      if (no) return { refused: no };
      return { here: here(T.state) };
    },
  },
  {
    name: 'reveal_monsters',
    description: 'Make hidden monsters at this place visible to the players (they step out, or are spotted).',
    parameters: obj({ monsters: A('Optional ids or names; leave empty to reveal all hidden monsters here.') }),
    run(a, T) {
      const ids = listOf(a.monsters).map((x) => (findFoe(T.state, x) || {}).id).filter(Boolean);
      const no = T.do({ type: 'foe.reveal', foeIds: ids.length ? ids : undefined });
      return no ? { refused: no } : { here: here(T.state) };
    },
  },
  {
    name: 'start_combat',
    description: 'Start a fight with the monsters at this place (hidden ones join and are revealed). Players then roll initiative on their screens; the Engine rolls for monsters.',
    parameters: obj({ surprised: A('Optional: names of anyone surprised (they lose their first turn).') }),
    run(a, T) {
      const before = T.state.seq;
      const no = T.do({ type: 'fight.start', surprised: listOf(a.surprised) });
      if (no) return { refused: no };
      return { ...T.fightBrief(), ...since(T, before) };
    },
  },
  {
    name: 'begin_combat',
    description: 'Stop waiting for initiative rolls: the Engine rolls for anyone who has not, and turns begin.',
    parameters: obj({}),
    run(a, T) { const no = T.do({ type: 'fight.begin' }); return no ? { refused: no } : T.fightBrief(); },
  },
  {
    name: 'monster_action',
    description: 'A monster uses one action from its stat block: an attack (the Engine rolls to hit against the target\'s AC and applies damage) or an ability with a saving throw (the targets roll on their screens). For Multiattack, call once per attack.',
    parameters: obj({
      monster: S('The monster\'s id or name.'),
      action: S('The action\'s name exactly as the stat block lists it, e.g. Scimitar, Bite, Fire Breath.'),
      targets: A('Ids or names of the characters it targets.'),
      advantage: S('"adv", "dis" or empty, from the situation (the Engine already counts conditions).'),
    }, ['monster', 'action', 'targets']),
    run(a, T) {
      const foe = findFoe(T.state, a.monster);
      if (!foe) return { refused: `No monster called "${a.monster}" is here. Here: ${here(T.state)}.` };
      const targets = listOf(a.targets).map((x) => (findPc(T.state, x) || {}).id).filter(Boolean);
      const before = T.state.seq;
      const no = T.do({ type: 'foe.act', foeId: foe.id, action: a.action, targets, adv: lower(a.advantage) });
      if (no) return { refused: no };
      return { ...since(T, before), party: T.partyBrief() };
    },
  },
  {
    name: 'monster_save',
    description: 'A monster makes a saving throw (against a character\'s ability, a trap or a hazard).',
    parameters: obj({ monster: S('Id or name.'), ability: S('str, dex, con, int, wis or cha.'), dc: I('The DC.') }, ['monster', 'ability', 'dc']),
    run(a, T) {
      const foe = findFoe(T.state, a.monster);
      if (!foe) return { refused: `No monster called "${a.monster}" is here. Here: ${here(T.state)}.` };
      const before = T.state.seq;
      const no = T.do({ type: 'foe.save', foeId: foe.id, ability: lower(a.ability), dc: a.dc });
      return no ? { refused: no } : since(T, before);
    },
  },
  {
    name: 'end_turn',
    description: 'End the current creature\'s turn in the fight, once it has acted. Name whose turn you are ending.',
    parameters: obj({ whose: S('The name of the creature whose turn is ending (must be the one acting now).') }, ['whose']),
    run(a, T) {
      const ref = targetRef(T.state, a.whose);
      const before = T.state.seq;
      const no = T.do({ type: 'fight.next', expect: ref || undefined });
      if (no) return { refused: no };
      return { ...T.fightBrief(), ...since(T, before) };
    },
  },
  {
    name: 'end_combat',
    description: 'End the fight when the enemies are all down, fled or surrendered (or the party escaped). The Engine shares out XP for defeated monsters.',
    parameters: obj({ award_xp: B('False if no XP should be given (the party fled). Default true.') }),
    run(a, T) {
      const before = T.state.seq;
      const no = T.do({ type: 'fight.end', award: a.award_xp === undefined ? true : truthy(a.award_xp) });
      return no ? { refused: no } : since(T, before);
    },
  },
  {
    name: 'monster_flees',
    description: 'A monster runs away or surrenders and leaves the fight (the party still earns its XP).',
    parameters: obj({ monster: S('Id or name.') }, ['monster']),
    run(a, T) {
      const foe = findFoe(T.state, a.monster);
      if (!foe) return { refused: `No monster called "${a.monster}" is here. Here: ${here(T.state)}.` };
      const no = T.do({ type: 'foe.flee', foeId: foe.id });
      return no ? { refused: no } : { gone: foe.name };
    },
  },
  {
    name: 'deal_damage',
    description: 'Damage a character or monster from something other than a monster\'s stat-block action: a trap, a fall, a hazard, a monster\'s spell attack that hit.',
    parameters: obj({ target: S('Id or name.'), dice: S('Damage dice such as "1d6" or "2d8+3", or a plain number.'), damage_type: S('fire, cold, bludgeoning, piercing, slashing, poison, acid, necrotic, radiant, force, psychic, thunder, lightning.'), why: S('What caused it, in a few words.') }, ['target', 'dice', 'damage_type', 'why']),
    run(a, T) {
      const ref = targetRef(T.state, a.target);
      if (!ref) return { refused: `Nobody called "${a.target}". Party: ${party(T.state)}. Monsters: ${here(T.state)}.` };
      const before = T.state.seq;
      const amt = /^\s*\d+\s*$/.test(String(a.dice)) ? Number(a.dice) : undefined;
      if (amt === undefined && !/\d*d\d+/i.test(String(a.dice))) return { refused: 'Give damage as dice like 1d6 or a number.' };
      const no = T.do({ type: 'damage', target: ref, amount: amt, dice: amt === undefined ? String(a.dice) : undefined, damageType: lower(a.damage_type), why: a.why });
      return no ? { refused: no } : { ...since(T, before), party: T.partyBrief() };
    },
  },
  {
    name: 'heal',
    description: 'Restore hit points to a character (a potion poured down a throat, a priest\'s blessing, a monster healing).',
    parameters: obj({ target: S('Id or name.'), dice: S('Healing dice such as "2d4+2", or a number.'), why: S('What healed them.') }, ['target', 'dice']),
    run(a, T) {
      const ref = targetRef(T.state, a.target);
      if (!ref) return { refused: `Nobody called "${a.target}".` };
      const amt = /^\s*\d+\s*$/.test(String(a.dice)) ? Number(a.dice) : undefined;
      const before = T.state.seq;
      const no = T.do({ type: 'heal', target: ref, amount: amt, dice: amt === undefined ? String(a.dice) : undefined, why: a.why });
      return no ? { refused: no } : since(T, before);
    },
  },
  {
    name: 'add_condition',
    description: 'Give a character or monster a condition (blinded, charmed, deafened, frightened, grappled, incapacitated, invisible, paralyzed, petrified, poisoned, prone, restrained, stunned, unconscious) or a level of exhaustion.',
    parameters: obj({ target: S('Id or name.'), condition: S('The condition.') }, ['target', 'condition']),
    run(a, T) {
      const ref = targetRef(T.state, a.target);
      if (!ref) return { refused: `Nobody called "${a.target}".` };
      const no = T.do({ type: 'cond.add', target: ref, cond: lower(a.condition) });
      return no ? { refused: no } : { ok: true };
    },
  },
  {
    name: 'remove_condition',
    description: 'End a condition on a character or monster.',
    parameters: obj({ target: S('Id or name.'), condition: S('The condition.') }, ['target', 'condition']),
    run(a, T) {
      const ref = targetRef(T.state, a.target);
      if (!ref) return { refused: `Nobody called "${a.target}".` };
      const no = T.do({ type: 'cond.remove', target: ref, cond: lower(a.condition) });
      return no ? { refused: no } : { ok: true };
    },
  },
  {
    name: 'give_treasure',
    description: 'Give gold or an item the party finds or is given. With no character named, gold is split evenly and items go to the party\'s shared loot.',
    parameters: obj({ character: S('Optional: who receives it.'), gold: I('Gold pieces.'), item: S('An item\'s name (SRD names like "Potion of Healing" are recognised).'), qty: I('How many of the item.') }),
    run(a, T) {
      const pc = a.character ? findPc(T.state, a.character) : null;
      if (a.character && !pc) return { refused: `No character called "${a.character}". Party: ${party(T.state)}.` };
      const no = T.do({ type: 'loot.give', pcId: pc ? pc.id : undefined, gold: a.gold, item: a.item, qty: a.qty });
      return no ? { refused: no } : { ok: true };
    },
  },
  {
    name: 'award_xp',
    description: 'Award experience points for a milestone, a clever plan or good roleplay (fights award their own XP when they end). The amount is shared between the characters unless each=true.',
    parameters: obj({ amount: I('The XP.'), each: B('True to give every character the full amount.'), why: S('What it is for.') }, ['amount', 'why']),
    run(a, T) {
      const no = T.do({ type: 'xp.award', amount: a.amount, each: truthy(a.each), why: a.why });
      return no ? { refused: no } : { ok: true, party: T.partyBrief() };
    },
  },
  {
    name: 'complete_quest',
    description: 'Mark one of the party\'s quests as done.',
    parameters: obj({ quest: S('The quest id or a few words of it.') }, ['quest']),
    run(a, T) { const no = T.do({ type: 'quest.done', id: a.quest }); return no ? { refused: no } : { ok: true }; },
  },
  {
    name: 'add_quest',
    description: 'Give the party a new quest or goal they have taken on.',
    parameters: obj({ text: S('The quest in one sentence.') }, ['text']),
    run(a, T) { const no = T.do({ type: 'quest.add', text: a.text }); return no ? { refused: no } : { ok: true }; },
  },
  {
    name: 'roll_dice',
    description: 'Roll dice in secret for the DM: a monster\'s spell attack, a random table, a recharge, how many bandits answer a whistle. The players do not see it.',
    parameters: obj({ dice: S('Such as "1d20+4" or "2d6".'), why: S('What it is for.') }, ['dice', 'why']),
    run(a, T) {
      const no = T.do({ type: 'roll.free', dice: String(a.dice), label: a.why, secret: true });
      if (no) return { refused: no };
      const r = T.state.rolls[T.state.rolls.length - 1];
      return { total: r.total, dice: r.dice };
    },
  },
  {
    name: 'pass_time',
    description: 'Let time pass (travel, searching, waiting).',
    parameters: obj({ hours: I('Hours that pass.') }, ['hours']),
    run(a, T) { const no = T.do({ type: 'time.pass', hours: a.hours }); return no ? { refused: no } : { time: T.state.time }; },
  },
  {
    name: 'long_rest',
    description: 'The whole party takes a long rest (8 hours): hit points, spell slots and abilities return. Only when they are somewhere safe and choose to rest.',
    parameters: obj({}),
    run(a, T) { const no = T.do({ type: 'rest.long' }); return no ? { refused: no } : { ok: true }; },
  },
  {
    name: 'look_up_rules',
    description: 'Look up the 5e SRD: a spell, a monster, a condition, a magic item, or a rules topic (grappling, cover, resting, falling, surprise...).',
    parameters: obj({ query: S('What to look up.') }, ['query']),
    run(a, T) { return lookUp(T.srd, a.query); },
  },
  {
    name: 'recall',
    description: 'Search everything said and done earlier in this game (names, promises, clues).',
    parameters: obj({ query: S('A few words to search for.') }, ['query']),
    run(a, T) {
      if (!T.memory || !T.memory.search) return { found: [] };
      const r = T.memory.search(String(a.query || ''), { limit: 6 });
      return { found: (r.hits || []).map((h) => `${h.who ? `${h.who}: ` : ''}${String(h.text).slice(0, 300)}`) };
    },
  },
];

// A short answer from the SRD for the model.
export function lookUp(srd, query) {
  const q = lower(query);
  if (!q) return { refused: 'Say what to look up.' };
  const ix = R.index(srd);
  const exact = (list) => list.find((x) => lower(x.name) === q || x.id === q.replace(/\s+/g, '-'));
  const s = exact(srd.spells);
  if (s) return { spell: s.name, level: s.level ? `${R.ordinal(s.level)}-level ${s.school}` : `${s.school} cantrip`, casting_time: s.time, range: s.range, duration: `${s.conc ? 'Concentration, ' : ''}${s.dur}`, text: `${s.desc}${s.higher ? ` ${s.higher}` : ''}`.slice(0, 1500) };
  const m = exact(srd.monsters);
  if (m) return { monster: statLine(m) };
  const c = exact(srd.conditions);
  if (c) return { condition: c.name, text: c.desc };
  const it = exact(srd.magicItems);
  if (it) return { item: it.name, rarity: it.rarity, text: it.desc.slice(0, 1200) };
  // A rules topic: the section whose text mentions the words most.
  const words = q.split(/\s+/).filter((w) => w.length > 2);
  let best = null;
  for (const r of srd.rules) {
    const low = r.text.toLowerCase();
    const score = words.reduce((n, w) => n + (low.split(w).length - 1), 0) + (lower(r.name).includes(q) ? 50 : 0);
    if (score && (!best || score > best.score)) best = { score, r };
  }
  if (best) {
    const low = best.r.text.toLowerCase();
    const at = Math.max(0, low.indexOf(words[0] || q) - 200);
    return { rules: best.r.name, text: best.r.text.slice(at, at + 1400).replace(/[#*]/g, '') };
  }
  const near = [...srd.spells, ...srd.monsters, ...srd.magicItems].filter((x) => lower(x.name).includes(q)).slice(0, 8).map((x) => x.name);
  void ix;
  return near.length ? { did_you_mean: near } : { found: 'Nothing in the SRD by that name. Make a fair ruling.' };
}

// One line a model can play a monster from.
export function statLine(m) {
  const act = (x) => `${x.n}${x.use ? ` (${x.use})` : ''}: ${x.hit != null ? `+${x.hit} to hit, ${(x.dmg || []).map(([d, t]) => `${d} ${t}`).join(' + ')}` : x.dc ? `DC ${x.dc[1]} ${x.dc[0].toUpperCase()} save${x.dmg ? `, ${(x.dmg || []).map(([d, t]) => `${d} ${t}`).join(' + ')}` : ''}` : x.d.slice(0, 160)}`;
  return [
    `${m.name} (${m.size} ${m.type}, CR ${R.crText(m.cr)}): AC ${m.ac}, ${m.hp} hp, speed ${m.speed}.`,
    m.res.length ? `Resists ${m.res.join(', ')}.` : '', m.imm.length ? `Immune to ${m.imm.join(', ')}.` : '', m.vuln.length ? `Vulnerable to ${m.vuln.join(', ')}.` : '',
    m.traits.length ? `Traits: ${m.traits.map((t) => `${t.n}: ${t.d.slice(0, 220)}`).join(' ')}` : '',
    `Actions: ${m.actions.map(act).join('; ')}.`,
    m.reactions ? `Reactions: ${m.reactions.map(act).join('; ')}.` : '',
    m.legendary ? `Legendary actions (3 a round): ${m.legendary.map(act).join('; ')}.` : '',
  ].filter(Boolean).join(' ');
}

export function toolbox({ state, adventure, srd, rng, now, memory = null }) {
  const ctx = { role: 'host', pid: null, rng, now, adventure, srd, ai: true };
  const T = {
    state, adventure, srd, rng, memory, refusals: 0,
    do(action) {
      try { T.state = apply(T.state, action, ctx); return null; } catch (e) {
        if (e instanceof RuleError || /dice|d20|not a dice/i.test(e.message)) return e.message;
        throw e;
      }
    },
    site: () => (adventure.sites || []).find((x) => x.id === T.state.scene.siteId) || (adventure.sites || [])[0] || {},
    fightBrief() {
      const f = T.state.fight;
      if (!f) return { fight: 'none' };
      const nm = (k) => { const [kind, id] = k.split(':'); return kind === 'pc' ? T.state.pcs[id].name : T.state.foes[id].name; };
      if (f.phase === 'initiative') return { fight: 'waiting for initiative rolls', waiting_on: T.state.requests.filter((q) => q.kind === 'initiative').map((q) => T.state.pcs[q.pcId].name) };
      const cur = f.order[f.turn].key;
      const pc = cur.startsWith('pc:') ? T.state.pcs[cur.slice(3)] : null;
      return {
        round: f.round, order: f.order.map((o) => nm(o.key)), acting_now: nm(cur),
        acting_is: pc ? (pc.playerId ? 'a player: describe the moment and ask what they do' : 'a character with no player: you act for them') : 'a monster: act for it, then end_turn',
      };
    },
    partyBrief() {
      return Object.values(T.state.pcs).map((p) => `${p.name}: ${p.dead ? 'dead' : p.hp <= 0 ? (p.stable ? 'unconscious, stable' : `dying (${p.death.s} successes, ${p.death.f} failures)`) : `${p.hp}/${p.maxHp} hp`}${p.conds.length ? `, ${p.conds.join(', ')}` : ''}`).join('; ');
    },
    run(name, args) {
      const tool = TOOLS.find((t) => t.name === name);
      if (!tool) { T.refusals += 1; return { refused: `There is no tool called "${name}".` }; }
      let out;
      try { out = tool.run(args || {}, T); } catch (e) { out = { refused: `That could not be done: ${e.message}` }; }
      if (out && out.refused) T.refusals += 1;
      return out;
    },
  };
  return T;
}
