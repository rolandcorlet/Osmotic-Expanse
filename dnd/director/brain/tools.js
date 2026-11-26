// The Director's tools. Each is a thin, checked doorway into the Ledger: the model asks, the Engine
// decides, and the answer comes back in plain words so the next call can be the right one. Every answer
// is sorted the same way, by the Engine's own attempt() (see run() at the bottom): done (with anything the
// Engine assumed to make it work), nothing changed (a note), or a real refusal with the valid choices.

import { attempt } from '../engine/ledger.js';
import * as R from '../engine/rules.js';
import * as NAMES from '../engine/names.js';

const COND_LIST = ['blinded', 'charmed', 'deafened', 'exhaustion', 'frightened', 'grappled', 'incapacitated', 'invisible', 'paralyzed', 'petrified', 'poisoned', 'prone', 'restrained', 'stunned', 'unconscious'];
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
  return list.find((p) => p.id === k) || list.find((p) => lower(p.name) === k) || list.find((p) => k && lower(p.name).split(/\s+/)[0] === k.split(/\s+/)[0])
    || NAMES.pick(list, k, (p) => [p.id, p.name]) || null;
}
export function findFoe(s, ref, { all = false } = {}) {
  const k = lower(ref).replace(/^foe:/, '');
  const list = Object.values(s.foes).filter((f) => (all || f.siteId === s.scene.siteId));
  return list.find((f) => f.id === k) || list.find((f) => lower(f.name) === k) || list.find((f) => !f.dead && k && lower(f.name).startsWith(k)) || list.find((f) => !f.dead && k && lower(f.base) === k)
    || NAMES.pick(list.filter((f) => !f.dead), k, (f) => [f.id, f.name]) || NAMES.pick(list, k, (f) => [f.id, f.name]) || null;
}
const party = (s) => Object.values(s.pcs).map((p) => `${p.id} (${p.name})`).join(', ') || 'nobody yet';
const here = (s) => Object.values(s.foes).filter((f) => f.siteId === s.scene.siteId && !f.dead).map((f) => `${f.id} (${f.name})`).join(', ') || 'no monsters';

// The characters a monster targets, however the model wrote them: a list, one name, "c3 (Ila)",
// "pc:c3", or a singular "target" field (bench 5: the same goblin attack was refused five times running).
function pcTargets(s, a) {
  const raw = [...listOf(a.targets), ...listOf(a.target), ...listOf(a.character)];
  const out = [];
  for (const r of raw) {
    const t = String(r);
    const p = findPc(s, t) || findPc(s, (t.match(/\bc\d+\b/) || [])[0] || '') || Object.values(s.pcs).find((x) => new RegExp(`\\b${x.name.split(/\s+/)[0]}\\b`, 'i').test(t));
    if (p && !out.includes(p.id)) out.push(p.id);
  }
  return out;
}
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

// The map in one line per zone, for tool results: who stands where.
export function mapLine(T) {
  const s = T.state;
  const m = s.map;
  if (!m || !m.zones || !m.zones[s.scene.siteId]) return '';
  return m.zones[s.scene.siteId].map((z) => {
    const here = Object.entries(m.at).filter(([k, p]) => p.site === s.scene.siteId && p.zone === z.id).map(([k]) => {
      const [kind, id] = k.split(':');
      const o = kind === 'pc' ? s.pcs[id] : s.foes[id];
      return o ? `${o.name}${o.dead ? ' (down)' : ''}${kind === 'foe' && o.hidden ? ' (hidden)' : ''}` : '';
    }).filter(Boolean);
    return `${z.name}: ${here.join(', ') || 'nobody'}`;
  }).join('; ');
}

export const TOOLS = [
  {
    name: 'ask_for_roll',
    description: 'Ask one or more characters for an ability check or a saving throw. Ask only once a player has said what their character tries (\"I search the desk\", \"I look where the lamp was\"), or when a hazard, a trap or an attack forces it. When you set a scene, or someone has just walked in or out, ask what they do and wait: no roll yet. The roll appears on their screen with your reason, and the story says it to the table; you learn the result on your next turn. Stop and wait after asking. For a hazard or a monster spell with a saving throw, give the effect: damage dice and type, half on success, and/or a condition on a failure.',
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
      // Every roll is said to the player with what it is for (Roly, 27 Nov): no reason, no roll.
      if (!String(a.reason || '').trim()) return { note: 'Nothing asked: say in reason what the roll is for, in a few words the player sees ("Search where the lamp was").' };
      const all = listOf(a.characters).map((x) => findPc(T.state, x)).filter(Boolean);
      // Naming someone outside the party (Nell, Grisk) asks nothing of anyone (part 2 bench, 20 Nov).
      if (!all.length) return { note: `Nothing asked: only the party's characters roll on their screens (${party(T.state)}). For a monster use monster_save, or monster_action for its attack; for anyone else you play, decide it or use roll_dice.` };
      // A dying character's only roll is the death save the Engine asks for on their turn (benches 3 and 5).
      const down = all.filter((p) => p.hp <= 0 && !p.dead);
      const ids = all.filter((p) => p.hp > 0 && !p.dead).map((p) => p.id);
      if (!ids.length) return { note: `Nothing asked: ${down.map((p) => p.name).join(' and ')} ${down.length > 1 ? 'are' : 'is'} at 0 hit points. The death save is their only roll, and the Engine asks for it on their turn. To help them, ask someone else for a Medicine check (DC 10), then stabilize_character, or heal them.` };
      const effect = a.damage_on_fail || a.condition_on_fail ? { dmg: a.damage_on_fail || '', type: a.damage_type || '', half: truthy(a.half_on_success), cond: lower(a.condition_on_fail) } : null;
      // A flat amount ("2") is a dice amount too (X Marks the Spot, 27 Nov: a bite for 2 necrotic was refused).
      if (effect && effect.dmg && !/^\s*(\d*d\d+(\s*[+-]\s*\d+)?|\d+)\s*$/i.test(String(effect.dmg))) return { refused: `"${effect.dmg}" is not a dice amount like 2d6 or 3d8+2.` };
      // No skill or ability named (ten-run bench): read one from the words of the reason, if they name one.
      let skill = lower(a.skill).replace(/\s+/g, '-');
      // Initiative is not a check to ask for (bench part 4, 25 Nov: asked again right after start_combat had
      // asked for it). A note that says where it comes from.
      if ([skill, lower(a.ability), lower(a.kind)].includes('initiative')) {
        const f = T.state.fight;
        return { note: `Nothing changed: ${f && f.phase === 'initiative' ? 'initiative is already on their screens (start_combat asked for it). Wait for the rolls' : f ? 'initiative was rolled when this fight started' : 'initiative is rolled when a fight starts: use start_combat, which asks everyone for it'}.` };
      }
      let ability = lower(a.ability).slice(0, 3);
      if (!skill && !['str', 'dex', 'con', 'int', 'wis', 'cha'].includes(ability)) {
        const why = lower(`${a.reason} ${a.ability} ${a.skill}`);
        const sk = lower(a.kind) === 'save' ? null : (T.srd.skills || []).find((x) => why.includes(x.name.toLowerCase()));
        const ab = Object.entries({ str: 'strength', dex: 'dexterity', con: 'constitution', int: 'intelligence', wis: 'wisdom', cha: 'charisma' }).find(([, n]) => why.includes(n));
        if (sk) { skill = sk.id; T.assume(`No skill was named: ${sk.name}, from the reason's words.`); } else if (ab) { ability = ab[0]; T.assume(`No ability was named: ${R.ABILITY_NAMES[ability]}, from the reason's words.`); }
      }
      // A save with no ability named (bench part 3, 24 Nov: "Keep your footing"): read the kind of save from the
      // reason's words, and otherwise use dexterity, the usual "get out of the way" save. Never a refusal.
      if (lower(a.kind) === 'save' && !skill && !['str', 'dex', 'con', 'int', 'wis', 'cha'].includes(ability)) {
        const why = lower(a.reason);
        const SAVE_WORDS = [
          ['wis', /charm|fear|frighten|mind|will|illusion|dominat|command|sleep|compel|hypnot|enchant|sway/],
          ['con', /poison|venom|disease|sicken|endure|hold (your )?breath|exhaust|fatigue|cold|toxin|spore|pain/],
          ['dex', /footing|slip|balance|dodge|fall|leap|dive|duck|catch|jump|ledge|plank|causeway|avoid|blast|trap|dart|bolt|breath weapon/],
        ];
        ability = (SAVE_WORDS.find(([, re]) => re.test(why)) || ['dex'])[0];
        T.assume(`No ability was named for the save: ${R.ABILITY_NAMES[ability]}${SAVE_WORDS.some(([, re]) => re.test(why)) ? ', from the reason\'s words' : ', the usual one for getting out of the way'}.`);
      }
      // A check with no ability or skill named (bench part 3, 24 Nov: "Steady yourself and get back onto your feet"):
      // read the kind of check from the reason's words, and otherwise use dexterity. Never a refusal.
      if (lower(a.kind) !== 'save' && !skill && !['str', 'dex', 'con', 'int', 'wis', 'cha'].includes(ability)) {
        const why = lower(a.reason);
        const CHECK_WORDS = [
          ['str', /climb|swim|lift|push|pull|break|force|haul|heave|shove|strength|batter|smash/],
          ['wis', /listen|notice|spot|search|sense|track|read the|sign|omen|perceive|watch|wisdom/],
          ['dex', /steady|footing|balance|slip|stealth|sneak|quiet|pick|catch|dodge|feet|agile|nimble/],
        ];
        ability = (CHECK_WORDS.find(([, re]) => re.test(why)) || ['dex'])[0];
        T.assume(`No skill or ability was named: a ${R.ABILITY_NAMES[ability]} check${CHECK_WORDS.some(([, re]) => re.test(why)) ? ', from the reason\'s words' : ''}.`);
      }
      // No DC, or one off the scale (bench part 3, 25 Nov: "Speak a holy word to drive the rats back"): the
      // reason's words decide, and otherwise medium (13), on the scale this tool gives. Never a refusal.
      let dc = Number(a.dc);
      if (!Number.isFinite(dc) || dc <= 0) {
        const why = lower(a.reason);
        dc = /very easy|trivial/.test(why) ? 5 : /very hard|nearly impossible|almost impossible/.test(why) ? 20 : /\bhard\b|difficult|tough/.test(why) ? 15 : /\beasy\b|simple/.test(why) ? 10 : 13;
        T.assume(`No DC was given: DC ${dc}.`);
      }
      dc = Math.min(35, Math.max(1, Math.round(dc)));
      const no = T.do({ type: 'roll.ask', pcIds: ids, kind: lower(a.kind) === 'save' ? 'save' : 'check', skill, ability, dc, reason: a.reason, adv: lower(a.advantage), effect });
      if (no) return { refused: no };
      return { asked: ids.map((id) => T.state.pcs[id].name).join(', '), note: 'The roll is on their screen. Stop here and wait for it: do not describe the outcome.' };
    },
  },
  {
    name: 'move_party',
    description: 'Move the party to another place when they choose to go there. Only an exit the briefing lists can be taken, and never during a fight (end_combat first if they flee). Monsters placed at the new place stay hidden until revealed or a fight starts.',
    parameters: obj({ place: S('The id of the place (from the exits list).') }, ['place']),
    run(a, T) {
      const before = T.state.seq;
      const no = T.do({ type: 'site.move', siteId: String(a.place || '').trim() });
      if (no) return { refused: no };
      const site = T.site();
      const hidden = Object.values(T.state.foes).filter((f) => f.siteId === site.id && !f.dead && f.hidden).map((f) => `${f.id} (${f.name})`);
      return { arrived: site.name, first_visit: !(T.state.scene.visited || []).includes(site.id), describe: site.read, notes: site.notes,
        monsters_already_here: hidden.length ? `${hidden.join(', ')}: placed and hidden. Do not add more; reveal them (reveal_monsters) when they are seen, or start_combat when the fight begins.` : 'none', exits: (site.exits || []).map((e) => `${e.to} (${e.label})`), ...since(T, before) };
    },
  },
  {
    name: 'move_creature',
    description: 'Move characters or monsters on the map of this place: to another zone (each zone is about 30 feet across; MAP in the briefing lists them), or up to someone to fight them in melee. Use it when a monster charges, retreats, climbs, flees across the area or takes cover, and for a character with no player. Players move their own characters on their screens. A melee monster_action steps the monster up to its target by itself.',
    parameters: obj({
      who: A('Names or ids of who moves.'),
      to_zone: S('The zone to move to, by its name in MAP. Leave empty when engaging someone.'),
      engage: S('Optional: the name of someone to move right up to, to fight in melee.'),
    }, ['who']),
    run(a, T) {
      const m = T.state.map;
      if (!m || !(m.show.zones || m.show.grid)) return { note: 'Nothing changed: the map is switched off for this game. Just narrate where everyone is.' };
      const who = listOf(a.who).length ? listOf(a.who) : listOf(a.creatures).concat(listOf(a.monsters), listOf(a.characters));
      if (!who.length) return { note: 'Nothing changed: name who moves (the who list).' };
      const zone = a.to_zone || a.zone || a.to || '';
      const engage = a.engage || a.target || '';
      if (!zone && !engage) return { note: 'Nothing changed: give to_zone (a zone in MAP) or engage (someone to move up to).', map: mapLine(T) };
      const before = T.state.seq;
      const done = []; const notes = [];
      for (const w of who) {
        const ref = targetRef(T.state, w);
        if (!ref) { notes.push(`Nobody called "${w}" is here.`); continue; }
        const no = T.do({ type: 'map.move', who: ref, zone: engage ? '' : zone, engage: engage ? (targetRef(T.state, engage) || engage) : '' });
        if (no) notes.push(no); else { done.push(w); if (T.state.map.lastNote) notes.push(T.state.map.lastNote); }
      }
      const out = { map: mapLine(T), ...since(T, before) };
      if (!done.length) return { note: `Nothing changed: ${notes.join(' ')}`, ...out };
      if (notes.length) out.note = notes.join(' ');
      return out;
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
      // Nothing hidden is nothing to do, not a broken rule (bench, 20 Nov).
      if (!Object.values(T.state.foes).some((f) => f.siteId === T.state.scene.siteId && f.hidden && !f.dead)) return { note: `Nothing changed: no monster here is hidden. Here: ${here(T.state)}.` };
      const hiddenIds = ids.filter((id) => T.state.foes[id] && T.state.foes[id].hidden);
      if (ids.length && !hiddenIds.length) return { note: `Nothing changed: those monsters are already in plain sight. Here: ${here(T.state)}.` };
      const no = T.do({ type: 'foe.reveal', foeIds: hiddenIds.length ? hiddenIds : undefined });
      return no ? { note: `Nothing changed: ${no}` } : { here: here(T.state) };
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
    run(a, T) {
      const no = T.do({ type: 'fight.begin' });
      return no ? { refused: no } : T.fightBrief();
    },
  },
  {
    name: 'monster_action',
    description: 'A monster uses one action from its stat block: an attack (the Engine rolls to hit against the target\'s AC and applies damage) or an ability with a saving throw (the targets roll on their screens), or a spell from its Spellcasting trait (give the spell\'s name as the action; the Engine uses the stat block\'s save DC and attack bonus and counts its slots). For Multiattack, call once with action "Multiattack" and the target: the Engine makes every attack it lists (its usual choice; "Multiattack: longbow" picks another), and says if it also lists an ability such as Frightful Presence, which is its own call.',
    parameters: obj({
      monster: S('The monster\'s id or name.'),
      action: S('The action\'s name exactly as the stat block lists it (Scimitar, Bite, Fire Breath), a spell it can cast (Hold Person), or one every creature has: Dash, Disengage, Dodge, Hide, Help, Ready.'),
      targets: A('Ids or names of the characters it targets.'),
      advantage: S('"adv", "dis" or empty, from the situation (the Engine already counts conditions).'),
    }, ['monster', 'action', 'targets']),
    run(a, T) {
      let foe = findFoe(T.state, a.monster);
      // Monster and target the wrong way round (bench 21 Nov: monster "c1", targets ["f19"]): a character
      // named as the monster and a monster named as the target is the same order, swapped.
      if (!foe) {
        const tl = [].concat(a.targets || []).map(String);
        const pcRef = lower(a.monster).replace(/^pc:/, '');
        const isPc = Object.values(T.state.pcs).some((p) => p.id === pcRef || lower(p.name) === pcRef);
        const swapped = isPc && tl.length === 1 ? findFoe(T.state, tl[0]) : null;
        if (swapped && !swapped.dead) { T.assume(`Monster and target were the wrong way round: ${swapped.name} acts on ${a.monster}.`); foe = swapped; a = { ...a, monster: swapped.id, targets: [a.monster] }; }
      }
      // A character of the party named as the monster (bench part 3, 24 Nov: "Ila" readying an action): the party
      // acts on its own turn, so this is a note, not a refusal.
      if (!foe) {
        const ownRef = lower(a.monster).replace(/^pc:/, '');
        const ownPc = Object.values(T.state.pcs).find((p) => p.id === ownRef || lower(p.name) === ownRef);
        if (ownPc) return { note: `Nothing changed: ${ownPc.name} is one of the party and acts on their own turn. monster_action is for the monsters here (${here(T.state)}).`, ...T.fightBrief() };
      }
      // Talking, taunting or waiting is not an action in the stat block: just say it (bench 21 Nov: Aldane "Talk").
      if (/^(talk|speak|say|says|taunt|threaten|parley|laugh|wait|watch|pray|chant|gloat)\b/i.test(String(a.action || '').trim()))
        return { note: `Nothing changed: ${foe.name} speaking or waiting needs no tool. Say it in the narration, then use monster_action for what it actually does (${here(T.state)}), or end_turn.`, ...T.fightBrief() };
      const targets = pcTargets(T.state, a);
      const before = T.state.seq;
      // A near name, a weapon the stat block calls something else, a spell out of slots, a target too far to
      // reach this turn, someone already dead: the Engine sorts them (fixed, or nothing changed).
      const no = T.do({ type: 'foe.act', foeId: foe ? foe.id : a.monster, action: a.action, targets, adv: lower(a.advantage) });
      if (no) return { refused: no, ...(T.state.map && T.state.map.show && T.state.map.show.reach ? { map: mapLine(T) } : {}) };
      return { ...since(T, before), party: T.partyBrief(), ...(T.state.map && T.state.map.show && T.state.map.show.reach ? { map: mapLine(T) } : {}) };
    },
  },
  {
    name: 'monster_save',
    description: 'A monster makes a saving throw (against a character\'s ability, a trap or a hazard).',
    parameters: obj({ monster: S('Id or name.'), ability: S('str, dex, con, int, wis or cha.'), dc: I('The DC.') }, ['monster', 'ability', 'dc']),
    run(a, T) {
      const foe = findFoe(T.state, a.monster);
      const before = T.state.seq;
      const no = T.do({ type: 'foe.save', foeId: foe ? foe.id : a.monster, ability: lower(a.ability).slice(0, 3), dc: a.dc });
      return no ? { refused: no } : since(T, before);
    },
  },
  {
    name: 'end_turn',
    description: 'End the current creature\'s turn in the fight, once it has acted. Name whose turn you are ending.',
    parameters: obj({ whose: S('The name of the creature whose turn is ending (must be the one acting now).') }, ['whose']),
    run(a, T) {
      const ref = targetRef(T.state, a.whose);
      const f = T.state.fight;
      const cur = f && f.phase === 'turns' ? f.order[f.turn].key : '';
      // Ending a turn that is not running changes nothing: say whose turn it is instead of refusing.
      // (Bench, 20 Nov: after a player had already ended their own turn, the model ended it again.)
      if (f && cur && ref && ref !== cur) {
        const pcNow = cur.startsWith('pc:') ? T.state.pcs[cur.slice(3)] : null;
        return { note: `Nothing changed: that turn is already over. ${T.fightBrief().acting_now} is acting now${pcNow && pcNow.playerId ? ': a player, so describe the moment and ask them what they do' : ''}.`, ...T.fightBrief() };
      }
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
      const foe = findFoe(T.state, a.monster, { all: true });
      const no = T.do({ type: 'foe.flee', foeId: foe ? foe.id : a.monster });
      return no ? { refused: no } : { gone: foe ? foe.name : a.monster, here: here(T.state) };
    },
  },
  {
    name: 'deal_damage',
    description: 'Damage a character or monster from something other than a monster\'s stat-block action: a trap, a fall, a hazard, a monster\'s spell attack that hit.',
    parameters: obj({ target: S('Id or name.'), dice: S('Damage dice such as "1d6" or "2d8+3", or a plain number.'), damage_type: S('fire, cold, bludgeoning, piercing, slashing, poison, acid, necrotic, radiant, force, psychic, thunder, lightning.'), why: S('What caused it, in a few words.') }, ['target', 'dice', 'damage_type', 'why']),
    run(a, T) {
      const ref = targetRef(T.state, a.target);
      // Someone the Engine does not track (Halia Vance, a townsperson) or nobody at all: the story
      // carries it, and nothing in the Ledger changes. A note, not a refusal (bench part 4, 24 Nov).
      if (!ref) return { note: `Nothing changed: the Engine tracks only the party (${party(T.state)}) and the monsters here (${here(T.state)}). For anyone else, just narrate what happens to them.` };
      if (/^\s*0*\s*$/.test(String(a.dice ?? ''))) return { note: 'Nothing changed: no damage was given.' };
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
      // As with damage: healing someone the Engine does not track, or healing nothing, is a note.
      if (!ref) return { note: `Nothing changed: the Engine tracks only the party (${party(T.state)}) and the monsters here (${here(T.state)}). For anyone else, just narrate it.` };
      if (/^\s*0*\s*$/.test(String(a.dice ?? ''))) return { note: 'Nothing changed: no healing was given.' };
      // A character who has died cannot be healed back on the spot (a town priest's miracle is for later, in
      // the story). The narration carries it; nothing in the Ledger changes (bench part 3, 24 Nov: Ila).
      const pc = ref.startsWith('pc:') && T.state.pcs ? T.state.pcs[ref.slice(3)] : null;
      if (pc && pc.dead) return { note: `Nothing changed: ${pc.name} is dead, and healing cannot bring the dead back. Narrate what the healing does for the living, if anything.` };
      const amt = /^\s*\d+\s*$/.test(String(a.dice)) ? Number(a.dice) : undefined;
      const before = T.state.seq;
      const no = T.do({ type: 'heal', target: ref, amount: amt, dice: amt === undefined ? String(a.dice) : undefined, why: a.why });
      return no ? { refused: no } : since(T, before);
    },
  },
  {
    name: 'add_condition',
    description: 'Give a character or monster a condition (blinded, charmed, deafened, frightened, grappled, incapacitated, invisible, paralyzed, petrified, poisoned, prone, restrained, stunned, unconscious) or a level of exhaustion.',
    parameters: obj({ target: S('Id or name.'), condition: S('One of the 5e conditions.', { enum: COND_LIST }) }, ['target', 'condition']),
    run(a, T) {
      const ref = targetRef(T.state, a.target);
      // Naming nobody, or no condition at all, changes nothing: a note, not a refusal (ten-run bench).
      if (!ref) return { note: `Nothing changed: nobody here is called "${a.target}". Party: ${party(T.state)}. Monsters: ${here(T.state)}.` };
      const cond = NAMES.condition(a.condition, COND_LIST);
      if (!cond) return { note: `Nothing changed: "${a.condition}" is not a condition. Conditions: ${COND_LIST.join(', ')}.` };
      if (cond !== lower(a.condition)) T.assume(`"${a.condition}" is the condition ${cond}.`);
      const no = T.do({ type: 'cond.add', target: ref, cond });
      return no ? { refused: no } : { ok: true };
    },
  },
  {
    name: 'remove_condition',
    description: 'End a condition on a character or monster.',
    parameters: obj({ target: S('Id or name.'), condition: S('One of the 5e conditions.', { enum: COND_LIST }) }, ['target', 'condition']),
    run(a, T) {
      const ref = targetRef(T.state, a.target);
      if (!ref) return { note: `Nothing changed: nobody here is called "${a.target}". Party: ${party(T.state)}. Monsters: ${here(T.state)}.` };
      const cond = NAMES.condition(a.condition, COND_LIST);
      if (!cond) return { note: `Nothing changed: "${a.condition}" is not a condition.` };
      const p = ref.startsWith('pc:') ? T.state.pcs[ref.slice(3)] : null;
      if (p && p.hp <= 0 && cond === 'unconscious') return { note: `Nothing changed: ${p.name} is at 0 hit points. Heal them to wake them, or stabilize_character after a successful Medicine check (DC 10).` };
      const no = T.do({ type: 'cond.remove', target: ref, cond });
      return no ? { refused: no } : { ok: true };
    },
  },
  {
    name: 'stabilize_character',
    description: 'A dying character (0 hit points) is stabilized: after a successful Medicine check (DC 10), Spare the Dying, or a healer\'s kit. They stay unconscious at 0 hit points but stop making death saves.',
    parameters: obj({ character: S('Id or name of the dying character.') }, ['character']),
    run(a, T) {
      const p = findPc(T.state, a.character);
      if (!p) return { refused: `No character called "${a.character}". Party: ${party(T.state)}.` };
      if (p.hp > 0 || p.dead) return { note: `Nothing changed: ${p.name} is not dying.` };
      const no = T.do({ type: 'stabilize', target: `pc:${p.id}` });
      return no ? { refused: no } : { ok: true, party: T.partyBrief() };
    },
  },
  {
    name: 'use_object',
    description: 'A character uses something at this place: opens a chest, pulls a lever, reads a book, touches an altar, searches a desk. Call it as they do it, before you say what happens: the place\'s rules may make something happen (a trap, a gift, a door, a fight), and what they did comes back as adventure_rules. Use the names in THINGS HERE when the place lists them.',
    parameters: obj({ character: S('Who does it (a party member).'), object: S('What they use, as the place names it ("iron chest").'), how: S('Optional: the verb, such as opens, pulls, reads, searches (default: uses).') }, ['character', 'object']),
    run(a, T) {
      const pc = findPc(T.state, a.character);
      if (!pc) return { refused: `There is nobody called "${a.character}" in the party. The party: ${party(T.state)}.` };
      const no = T.do({ type: 'object.use', who: `pc:${pc.id}`, object: a.object, how: a.how });
      return no ? { refused: no } : { ok: true };
    },
  },
  {
    name: 'use_seed',
    description: 'Bring one of the DM\'s story seeds (THE DM\'S OWN STORY SEEDS in the briefing) into play now: its people or foes arrive, sized to the party. Use it when its moment comes and only you can see it (the party picks a fight with or harasses someone who is not a foe), or on your own judgement. For a night in the open call long_rest instead: the Engine rolls the camp seeds itself, and their foes attack the camp before the rest finishes when it fits the story (the party is lost, idle or going in circles). The Engine logs that you chose it.',
    parameters: obj({ seed: S('The seed\'s id (in square brackets in the briefing) or its title.'), why: S('One short line: why now.'), fight: B('True if what arrives attacks at once.') }, ['seed', 'why']),
    run(a, T) {
      // "No seed" said as a call (bench part 3, 27 Nov: seed "none"): nothing to do, not a broken rule.
      if (/^\s*(none|no|nothing|null|n\/a|-|no seed)?\s*$/i.test(String(a.seed == null ? '' : a.seed))) return { note: 'Nothing changed: no seed was named, so none came into play. Only call use_seed to bring one in.' };
      // No seeds in this game at all (X Marks the Spot, 27 Nov: "Mavren's warning", a person the Director meant to
      // bring in): nothing to bring, so a note that says how, not a refusal.
      if (!(T.state.seeds || []).some((x) => x.on)) return { note: 'Nothing changed: this game has no story seeds. Bring people in by narrating them (and reveal_monsters for foes already here).' };
      const no = T.do({ type: 'seed.fire', seed: a.seed, why: a.why || '', fight: truthy(a.fight) });
      if (no) return { refused: no };
      const now = T.state.seedNow || {};
      return { ok: true, seed: now.title, arrived: now.foes || [], here: here(T.state) };
    },
  },
  {
    name: 'give_treasure',
    description: 'Give gold or an item the party finds or is given. With no character named, gold is split evenly and items go to the party\'s shared loot.',
    parameters: obj({ character: S('Optional: the party member who receives it (not the person giving it).'), gold: I('Gold pieces.'), item: S('An item\'s name (SRD names like "Potion of Healing" are recognised).'), qty: I('How many of the item.') }),
    run(a, T) {
      // A name that is not a party member is usually the giver ("Marta Hale"): it goes to the party (bench 4).
      const pc = a.character ? findPc(T.state, a.character) : null;
      if (!(Number(a.gold) > 0) && !String(a.item || '').trim()) return { note: 'Nothing was given: name gold or an item to give.' };
      const no = T.do({ type: 'loot.give', pcId: pc ? pc.id : undefined, gold: a.gold, item: a.item, qty: a.qty });
      if (no) return { refused: no };
      if (a.character && !pc) T.assume(`"${a.character}" is not in the party, so it went to the party: gold split, items to the shared loot.`);
      return { ok: true };
    },
  },
  {
    name: 'award_xp',
    description: 'Award experience points at a milestone the place\'s notes name, or for overcoming a real challenge without a fight. Not for ordinary rolls or conversation (fights award their own XP when they end). The amount is shared between the characters unless each=true.',
    parameters: obj({ amount: I('The XP.'), each: B('True to give every character the full amount.'), why: S('What it is for.') }, ['amount', 'why']),
    run(a, T) {
      if (!Object.values(T.state.pcs).some((p) => !p.dead)) return { note: 'Nothing changed: no living character is left to earn it.' };
      // A milestone pays once (bench part 2, 20 Nov: Nell's 300 XP was given at the fight's end and again
      // when she was freed). The same amount awarded at the same place again is refused as a note.
      const key = `${T.state.scene.siteId}:${Math.trunc(Number(a.amount) || 0)}`;
      if ((T.state.xpPaid || []).includes(key)) return { note: `Nothing changed: ${a.amount} XP was already awarded here. A milestone is paid once.` };
      const no = T.do({ type: 'xp.award', amount: a.amount, each: truthy(a.each), why: a.why, site: true });
      return no ? { refused: no } : { ok: true, party: T.partyBrief() };
    },
  },
  {
    name: 'complete_quest',
    description: 'Mark one of the party\'s quests as done: only when everything it asks is finished (the lantern back on its hook, not just a lead on who took it).',
    parameters: obj({ quest: S('The quest id or a few words of it.') }, ['quest']),
    run(a, T) {
      // The id, a few words of it, or both ("q2 Find the people who vanished", bench 21 Nov).
      const ref = String(a.quest || '').trim();
      const lead = (/^(q\d+)\b/i.exec(ref) || [])[1];
      const words = ref.replace(/^q\d+\s*[:(\-–]?\s*/i, '').replace(/[.)]+$/, '').toLowerCase();
      const q = T.state.quests.find((x) => x.id === ref) || (lead && T.state.quests.find((x) => x.id === lead.toLowerCase()))
        || T.state.quests.find((x) => words && x.text.toLowerCase().includes(words));
      // A quest the adventure writes but the party was never given (bench part 4, 27 Nov: "blackreed" at the
      // mill, its ledger quest never added at the bridge): nothing to finish, so a note, not a refusal.
      const low = ref.toLowerCase();
      const written = !q && ((T.adventure || {}).questDone || []).find((r) => r.match && (low.includes(r.match) || (words && r.match.includes(words))));
      if (written || (!q && low === T.state.scene.siteId)) return { note: `Nothing changed: the party never took on a quest for "${ref}". If they have taken it on, add_quest it first, then complete it. Quests: ${T.state.quests.map((x) => `${x.id} (${x.text})`).join('; ') || 'none'}.` };
      if (!q) return { refused: `There is no such quest. Quests: ${T.state.quests.map((x) => `${x.id} (${x.text})`).join('; ')}.` };
      const rule = q && ((T.adventure || {}).questDone || []).find((r) => q.text.toLowerCase().includes(r.match));
      if (q && q.done) return { note: `Nothing changed: "${q.text}" is already complete.` };
      if (rule && !rule.at.includes(T.state.scene.siteId)) return { note: `Not yet: "${q.text}" is complete only when ${rule.when}. Keep it open.` };
      const no = T.do({ type: 'quest.done', id: q.id });
      return no ? { refused: no } : { ok: true };
    },
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
    name: 'clock',
    description: 'Start, fill or clear a clock: a danger or a plan that fills segment by segment (a burning bridge, an invasion). The place\'s notes say when to tick one; the clocks are listed in your briefing. When a clock fills, what it warns of happens: narrate it.',
    parameters: obj({ action: S('start, tick or clear.'), name: S('The clock\'s name or id.'), size: I('For start: how many segments (2 to 12).'), by: I('For tick: segments to fill (default 1; negative takes some off).'), note: S('For start: what happens when it fills.') }, ['action', 'name']),
    run(a, T) {
      const what = String(a.action || 'tick').toLowerCase();
      const type = /^(start|add|new|begin)/.test(what) ? 'clock.add' : /^(clear|remove|stop|end|delete)/.test(what) ? 'clock.remove' : 'clock.tick';
      const k = String(a.name || '').toLowerCase();
      const running = () => (T.state.clocks || []).filter((x) => !x.siteId || x.siteId === T.state.scene.siteId);
      const find = () => running().find((x) => x.id === a.name || x.name.toLowerCase() === k) || running().find((x) => x.name.toLowerCase().includes(k));
      const c = find();
      // A clock the adventure has already placed, or one that is already gone, is not an error: the Director
      // is told what is running and the turn goes on (bench part 4, 24 Nov: "start" of a running clock and
      // "clear" of a cleared one were refused). Nothing in the Ledger changes.
      if (type === 'clock.add' && c && !c.done) return { ok: true, note: `Already running: ${c.name}, ${c.filled} of ${c.size}. Tick it instead of starting it again.` };
      if (type === 'clock.remove' && !c) return { note: `Nothing to clear: no clock called "${a.name}" is running. Running: ${running().map((x) => x.name).join(', ') || 'none'}.` };
      const no = T.do({ type, name: a.name, id: a.name, size: a.size, by: a.by, note: a.note, siteId: T.state.scene.siteId });
      if (no) return { refused: no };
      if (type === 'clock.remove') return { ok: true };
      const after = find();
      return { ok: true, clock: after ? `${after.name}: ${after.filled} of ${after.size}${after.done ? `. FULL: ${after.note || 'it happens now'}` : ''}` : undefined };
    },
  },
  {
    name: 'override_rule',
    description: 'The adventure\'s rules (listed in your briefing with their ids) happen by themselves: a fight starts, a foe flees, a clock ticks, a quest is done, a milestone is paid. If the story has gone another way (they talked Grisk down; it was never meant to come to blows), override the rule with the reason: one still waiting is switched off, one that has happened is undone as far as it can be. "*/attack" calls off a fight that an attack started.',
    parameters: obj({ rule: S('The rule\'s id from the briefing, such as mill-road/ambush.'), reason: S('Why, in a few words.') }, ['rule', 'reason']),
    run(a, T) {
      const before = T.state.seq;
      const no = T.do({ type: 'rule.override', id: String(a.rule || '').replace(/^\[|\]$/g, '').trim(), reason: a.reason });
      void before;
      if (no) return { refused: no };
      return { ok: true, ...(T.state.fight ? T.fightBrief() : {}) }; // what it did comes back as adventure_rules
    },
  },
  {
    name: 'look_up_rules',
    description: 'Look up the rules: a spell, a monster, a condition, a magic item, or a rules topic (grappling, cover, resting, falling, surprise...). Searches the SRD and, when installed, the DM\'s own books.',
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

// Lower-cased rules text, worked out once per section.
const LOW = new WeakMap();
const lowText = (r) => { let t = LOW.get(r); if (!t) { t = String(r.text || '').toLowerCase(); LOW.set(r, t); } return t; };

// A short answer from the SRD (and the DM's book library, when installed) for the model.
export function lookUp(srd, query) {
  const q = lower(query);
  if (!q) return { refused: 'Say what to look up.' };
  const ix = R.index(srd);
  const exact = (list) => list.find((x) => lower(x.name) === q || x.id === q.replace(/\s+/g, '-'));
  const s = exact(srd.spells);
  if (s) return { spell: s.name, level: s.level ? `${R.ordinal(s.level)}-level ${s.school}` : `${s.school} cantrip`, casting_time: s.time, range: s.range, duration: `${s.conc ? 'Concentration, ' : ''}${s.dur}`, text: `${s.desc}${s.higher ? ` ${s.higher}` : ''}`.slice(0, 1500) };
  const m = exact(srd.monsters) || srd.monsters.find((x) => lower(x.name).replace(/^the /, '') === q.replace(/^the /, ''));
  if (m) return { monster: statLine(m), ...(m.lore ? { lore: m.lore.slice(0, 500) } : {}), ...(m.check ? { note: m.check } : {}), ...(m.lib ? { source: `Monster Manual${m.page ? ` p.${m.page}` : ''}` } : {}) };
  const c = exact(srd.conditions);
  if (c) return { condition: c.name, text: c.desc };
  const it = exact(srd.magicItems);
  if (it) return { item: it.name, rarity: it.rarity, text: it.desc.slice(0, 1200) };
  // A rules topic: the section whose text mentions the words most.
  const words = q.split(/\s+/).filter((w) => w.length > 2);
  const ranked = [];
  for (const r of [...srd.rules, ...(srd.libRules || [])]) {
    const low = lowText(r);
    const hits = words.map((w) => low.split(w).length - 1);
    // Every word should appear; a section's own name counts most.
    const score = hits.reduce((n, h) => n + Math.min(h, 12), 0) * (hits.every((h) => h) ? 2 : 1) + (lower(r.name).includes(q) ? 60 : 0) + words.filter((w) => lower(r.name).includes(w)).length * 8;
    if (score) ranked.push({ score, r });
  }
  ranked.sort((x, y) => y.score - x.score);
  const best = ranked[0];
  if (best) {
    const low = lowText(best.r);
    const at = Math.max(0, low.indexOf(words.find((w) => low.includes(w)) || q) - 200);
    return { rules: best.r.name, source: best.r.book ? `${best.r.book} p.${best.r.page}` : 'SRD', text: best.r.text.slice(at, at + 1400).replace(/[#*]/g, ''), ...(ranked.length > 1 ? { also: ranked.slice(1, 4).map((x) => `${x.r.name}${x.r.book ? ` (${x.r.book} p.${x.r.page})` : ''}`) } : {}) };
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
    lastNo: null, // the Engine's last "no" in this tool call: its words, its kind (rule or noop), the choices
    assumed: [], // what the Engine (or a tool) assumed to make this tool call work
    do(action) {
      const r = attempt(T.state, action, ctx);
      if (r.status === 'done') { T.state = r.state; for (const x of r.assumed) T.assume(x); return null; }
      T.lastNo = { msg: r.message, kind: r.status === 'nochange' ? 'noop' : 'rule', options: r.options, hint: r.hint, text: r.text };
      return r.message;
    },
    assume(text) { if (text && !T.assumed.includes(text)) T.assumed.push(text); },
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
      if (!tool) { T.refusals += 1; return { refused: `There is no tool called "${name}". Tools: ${TOOLS.map((t) => t.name).join(', ')}.` }; }
      let out;
      T.lastNo = null;
      T.assumed = [];
      const before = T.state.seq;
      try { out = tool.run(healArgs(tool, args || {}, T), T); } catch (e) { out = { refused: `That could not be done: ${e.message}` }; }
      // One sorting for every tool, by the Engine's own kinds (in place of a fix per refusal):
      //   nothing to change -> a note that says what is true; a real no -> refused, with the valid choices;
      //   done -> the result, with what was assumed to make it work.
      if (out && out.refused && T.lastNo && out.refused === T.lastNo.msg) {
        const { refused, ...rest } = out;
        out = T.lastNo.kind === 'noop' ? { note: T.lastNo.text, ...rest, ...(T.state.fight ? T.fightBrief() : {}) } : { refused: T.lastNo.text, ...rest };
      }
      if (out && !out.refused && T.assumed.length) out = { ...out, assumed: T.assumed.join(' ') };
      // What the adventure's own rules did during this call (a fight started, a foe fled, a quest finished).
      const fired = rulesSince(T.state, before);
      if (out && fired.length) out = { ...out, adventure_rules: fired };
      if (out && out.refused) T.refusals += 1;
      return out;
    },
  };
  return T;
}

// A required part given under another name (bench part 4, 26 Nov: add_quest({ quest: "…" }) for `text`):
// the one part the tool does not know, a near name, or a usual synonym, is read as the missing one, and the
// Engine says so. Nothing is guessed when two parts could be meant.
const SYNONYMS = {
  text: ['quest', 'goal', 'description', 'name', 'title', 'message', 'what'], place: ['site', 'destination', 'to', 'location', 'where', 'exit', 'id'],
  monster: ['name', 'foe', 'creature', 'who', 'id', 'enemy'], character: ['target', 'pc', 'who', 'name', 'hero'], target: ['character', 'who', 'name', 'pc', 'monster', 'creature'],
  quest: ['id', 'name', 'text', 'title'], action: ['attack', 'name', 'ability', 'move', 'weapon', 'spell'], condition: ['cond', 'status', 'effect'],
  rule: ['id', 'name', 'key'], reason: ['why', 'because', 'note'], why: ['reason', 'note'], dice: ['amount', 'damage', 'roll', 'value'],
  hours: ['time', 'duration'], amount: ['xp', 'value', 'points'], name: ['clock', 'title', 'id'], characters: ['character', 'pcs', 'who', 'targets'],
};
export function healArgs(tool, args, T) {
  const props = Object.keys((tool.parameters && tool.parameters.properties) || {});
  const req = (tool.parameters && tool.parameters.required) || [];
  const out = { ...args };
  const given = (k) => out[k] != null && out[k] !== '' && !(Array.isArray(out[k]) && !out[k].length);
  for (const r of req) {
    if (given(r)) continue;
    const extra = Object.keys(out).filter((k) => !props.includes(k) && given(k));
    if (!extra.length) continue;
    const near = extra.find((k) => k.toLowerCase().replace(/[^a-z]/g, '') === r.replace(/[^a-z]/g, '') || NAMES.distance(k.toLowerCase(), r, 2) <= 2);
    const syn = extra.filter((k) => (SYNONYMS[r] || []).includes(k.toLowerCase()));
    const k = near || (syn.length === 1 ? syn[0] : extra.length === 1 ? extra[0] : null);
    if (!k) continue;
    out[r] = out[k];
    delete out[k];
    if (T && T.assume) T.assume(`"${k}" was read as ${tool.name}'s "${r}".`);
  }
  return out;
}

// The adventure rules the Engine carried out after `seq`, in words (the DM's log).
export function rulesSince(s, seq) {
  return (s.log || []).filter((l) => l.seq > seq && l.kind === 'rule').map((l) => l.text);
}
