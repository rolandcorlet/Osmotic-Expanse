// The AI Director's tools. Each one asks the Engine for something; the Engine checks and does it.
// A tool returns { ok, ... } when the Ledger changed, { note } when nothing changed but nothing was
// wrong either (a harmless slip: the fight is already on, the creature only talked), and
// { refused } when the Engine said no. Refusals are counted; notes are not.
//
// Lessons kept from the Osmotic and D&D benches (Nov 2026): name the right ids in every refusal,
// accept a name where an id is asked for, accept "q2 Find the..." for a quest, treat a swapped
// creature and target as the obvious intent, and never let a harmless slip count as a failure.

import { apply, RuleError, target, currentKey, charDefence } from '../engine/ledger.js';
import { lookUp, difficulty, term } from '../engine/module.js';

const S = (description) => ({ type: 'string', description });
const N = (description) => ({ type: 'number', description });
const A = (description) => ({ type: 'array', items: { type: 'string' }, description });
const obj = (properties, required = []) => ({ type: 'object', properties, required });
const lower = (x) => String(x || '').trim().toLowerCase();

export function toolbox({ state, mod, rng, now = 0 }) {
  const T = {
    state, mod, refusals: 0,
    do(action) {
      try { T.state = apply(T.state, action, { role: 'host', pid: null, ai: true, rng, now, mod }); return null; } catch (e) {
        if (e instanceof RuleError) return e.message;
        throw e;
      }
    },
    party() { return Object.values(T.state.chars).map((c) => `${c.id} (${c.name})`).join(', ') || 'nobody yet'; },
    here() { return Object.values(T.state.creatures).filter((k) => k.siteId === T.state.scene.siteId && !k.down).map((k) => `${k.id} (${k.name}${k.hidden ? ', hidden' : ''})`).join(', ') || 'none'; },
    fightBrief() {
      const f = T.state.fight;
      if (!f) return { fight: 'none' };
      const cur = currentKey(T.state);
      const [kind, id] = (cur || ':').split(':');
      const o = kind === 'char' ? T.state.chars[id] : T.state.creatures[id];
      return { fight: `round ${f.round}`, acting_now: o ? `${o.name} (${id}, ${kind === 'char' ? 'a player character: wait for the player' : 'yours to play'})` : 'nobody', actions_used: f.used || 0 };
    },
    since(seq) {
      const ev = T.state.story.filter((e) => e.seq >= seq && e.kind === 'event' && !e.quiet).map((e) => e.text);
      return { ok: true, happened: ev.slice(-6), ...T.fightBrief() };
    },
    run(name, args) {
      const tool = TOOLS.find((t) => t.name === name);
      if (!tool) { T.refusals += 1; return { refused: `There is no tool called ${name}.` }; }
      let out;
      // A slip in the tool itself (not the Engine saying no) is still answered, and marked for the fuzz.
      try { out = tool.run(args || {}, T); } catch (e) { out = { refused: `That did not work: ${e.message}`, ...(e instanceof RuleError ? {} : { crashed: e.message }) }; }
      if (out && out.refused) T.refusals += 1;
      return out;
    },
  };
  return T;
}

const charRef = (T, x) => { const t = target(T.state, x); return t && t.kind === 'char' ? t.id : null; };
const charIds = (T, a) => [].concat(a.characters || a.character || []).flatMap((x) => String(x).split(/,| and /)).map((x) => charRef(T, x.replace(/\(.*\)/, '').trim()) || charRef(T, (String(x).match(/^\s*(\w+)\s*\(/) || [])[1])).filter(Boolean);

// The tools in this game's own words: a difficulty is named from its ladder (the Gull Rock bench, 26 Nov: told
// "Standard" as the example, the Director wrote "Hard" for "Hard Peril" thirteen times).
export function toolsFor(mod) {
  const rungs = (mod && mod.rules && mod.rules.ladder) || [];
  const names = rungs.map((r) => `"${r.name}" (${r.at})`).join(', ');
  return TOOLS.map(({ name, description, parameters }) => {
    const p = structuredClone(parameters);
    if (name === 'ask_for_roll' && names && p.properties && p.properties.difficulty) p.properties.difficulty.description = `One of this game's difficulties, by its full name: ${names}; or a number in its own units.`;
    return { name, description, parameters: p };
  });
}

export const TOOLS = [
  {
    name: 'look_up_rules',
    description: 'Search the rule book, handbook, bestiary, lore and adventure notes. Use it before ruling on anything you are not sure of.',
    parameters: obj({ query: S('A few words: "what does a snag cost", "glass eel", "the bell".') }, ['query']),
    run(a, T) {
      const hits = lookUp(T.mod, a.query);
      return hits.length ? { found: hits.map((h) => ({ book: h.book, title: h.title, text: h.text.slice(0, 900) })) } : { note: `Nothing in the books matches. Rule it the simplest way: a roll against ${(((T.mod.rules.ladder || [])[1] || (T.mod.rules.ladder || [])[0]) || {}).name || 'the middle difficulty'}.` };
    },
  },
  {
    name: 'recall',
    description: 'Search what has happened so far in this game (the story so far).',
    parameters: obj({ query: S('A name, place or thing.') }, ['query']),
    run(a, T) {
      const w = lower(a.query).split(/\W+/).filter((x) => x.length > 2);
      const hits = T.state.story.filter((e) => w.some((x) => lower(e.text).includes(x))).slice(-6).map((e) => `${e.who}: ${e.text.slice(0, 300)}`);
      return hits.length ? { found: hits } : { note: 'Nothing about that has happened yet.' };
    },
  },
  {
    name: 'ask_for_roll',
    description: 'Ask one or more characters to roll a stat (+ skill) against a difficulty. The roll appears on their screens and they roll it; you will hear the result. Use this for anything uncertain the players try, and for hazards. Never ask for a roll in words only.',
    parameters: obj({
      characters: A('Ids or names of the characters who roll.'),
      stat: S('A stat id from the rules.'),
      skill: S('A skill id, or empty.'),
      difficulty: S('A ladder name (e.g. "Standard") or a number in the game\'s own difficulty units.'),
      reason: S('What the roll is for, in a few words the player sees.'),
      on_fail_damage: N('Health lost on a failure (0 for none).'),
      on_fail_condition: S('A condition id put on a failure, or empty.'),
    }, ['characters', 'stat', 'difficulty', 'reason']),
    run(a, T) {
      const ids = charIds(T, a);
      if (!ids.length) return { note: `Nothing asked: name a character of the party: ${T.party()}. A creature does not roll on a screen; use creature_attack, or decide.` };
      const waiting = ids.filter((id) => T.state.requests.some((q) => q.charId === id));
      if (waiting.length === ids.length) return { note: `Nothing changed: ${waiting.map((id) => T.state.chars[id].name).join(', ')} already ${waiting.length > 1 ? 'have' : 'has'} a roll waiting. Wait for it.` };
      const no = T.do({ type: 'roll.ask', charIds: ids, stat: lower(a.stat), skill: lower(a.skill), at: a.difficulty, reason: a.reason, fail: { damage: Number(a.on_fail_damage) || 0, cond: lower(a.on_fail_condition) } });
      return no ? { refused: no } : { ok: true, waiting_for: ids.map((id) => T.state.chars[id].name), note: 'Now narrate up to the roll and stop: the players roll on their screens and you continue when the result comes in.' };
    },
  },
  {
    name: 'creature_attack',
    description: 'A creature attacks a character with one of its attacks. The Engine rolls against the character\'s defence and applies the damage. In a fight, only on that creature\'s turn.',
    parameters: obj({ creature: S('The creature\'s id or name.'), attack: S('The attack\'s name from the bestiary.'), target: S('The character\'s id or name.') }, ['creature', 'target']),
    run(a, T) {
      let k = target(T.state, a.creature);
      let t = a.target;
      // The creature and target swapped (a character named as the attacker): read it the obvious way.
      if (k && k.kind === 'char') { const other = target(T.state, a.target); if (other && other.kind === 'creature') { t = k.id; k = other; } }
      if (!k || k.kind !== 'creature') return { refused: `No creature called "${a.creature}" is here. Here: ${T.here()}.` };
      if (k.o.down) return { note: `Nothing changed: ${k.o.name} is already down. Still standing: ${T.here()}.`, ...T.fightBrief() };
      // A character it already brought down (the attack before this one did it): a harmless slip.
      const tc = target(T.state, t);
      if (tc && tc.kind === 'char' && tc.o.down) return { note: `Nothing changed: ${tc.o.name} is already down. Still standing: ${Object.values(T.state.chars).filter((c) => !c.down).map((c) => `${c.id} (${c.name})`).join(', ') || 'nobody'}.`, ...T.fightBrief() };
      if (/^(talk|speak|say|taunt|threaten|wait|watch|laugh|sing)\b/i.test(String(a.attack || ''))) return { note: `Nothing changed: ${k.o.name} speaking or waiting needs no tool. Say it in your narration.`, ...T.fightBrief() };
      const seq = T.state.seq;
      const no = T.do({ type: 'creature.act', creature: k.id, attack: a.attack || '', target: t });
      if (no && /not .*turn/i.test(no)) return { note: `Nothing changed: ${no}`, ...T.fightBrief() };
      if (no && /all \d+ actions/.test(no)) return { note: `Nothing changed: ${no}`, ...T.fightBrief() };
      return no ? { refused: no } : T.since(seq);
    },
  },
  {
    name: 'creature_flees',
    description: 'A creature runs away or gives up and leaves the fight.',
    parameters: obj({ creature: S('Id or name.') }, ['creature']),
    run(a, T) { const seq = T.state.seq; const no = T.do({ type: 'creature.flee', creature: a.creature }); return no ? { refused: no } : T.since(seq); },
  },
  {
    name: 'reveal_creatures',
    description: 'Hidden creatures here show themselves (an ambush, or the players found them).',
    parameters: obj({}),
    run(a, T) {
      const hidden = Object.values(T.state.creatures).filter((k) => k.siteId === T.state.scene.siteId && k.hidden && !k.down);
      if (!hidden.length) return { note: 'Nothing changed: nothing here is hidden.' };
      const seq = T.state.seq; const no = T.do({ type: 'creature.reveal' }); return no ? { refused: no } : T.since(seq);
    },
  },
  {
    name: 'start_combat',
    description: 'Start a fight with the creatures here. The Engine rolls the order and says who acts first.',
    parameters: obj({}),
    run(a, T) {
      if (T.state.fight) return { note: 'Nothing changed: the fight is already on.', ...T.fightBrief() };
      const seq = T.state.seq; const no = T.do({ type: 'fight.start' }); return no ? { refused: no } : T.since(seq);
    },
  },
  {
    name: 'end_turn',
    description: 'End the turn of the one acting now (a creature, after it acts). The Engine moves to the next in the order.',
    parameters: obj({}),
    run(a, T) {
      if (!T.state.fight) return { note: 'Nothing changed: no fight is on.' };
      const cur = currentKey(T.state);
      if (cur && cur.startsWith('char:')) return { note: `Nothing changed: it is ${T.state.chars[cur.slice(5)].name}'s turn; the player ends it on their screen.`, ...T.fightBrief() };
      const seq = T.state.seq; const no = T.do({ type: 'fight.next' }); return no ? { refused: no } : T.since(seq);
    },
  },
  {
    name: 'end_combat',
    description: 'End the fight when the creatures are down, fled or gave up, or the party escaped. The Engine shares the experience.',
    parameters: obj({ award_xp: { type: 'boolean', description: 'False if the party fled.' } }),
    run(a, T) {
      if (!T.state.fight) return { note: 'Nothing changed: no fight is on.' };
      const seq = T.state.seq; const no = T.do({ type: 'fight.end', award: a.award_xp !== false }); return no ? { refused: no } : T.since(seq);
    },
  },
  {
    name: 'deal_damage',
    description: 'Someone takes damage from the world (a fall, a trap, a hazard) that no roll has already dealt.',
    parameters: obj({ target: S('Id or name.'), amount: N('How much.'), why: S('What hurt them.') }, ['target', 'amount', 'why']),
    run(a, T) { const seq = T.state.seq; const no = T.do({ type: 'damage', target: a.target, amount: a.amount, why: a.why }); return no ? { refused: no } : T.since(seq); },
  },
  {
    name: 'heal',
    description: 'Someone recovers health (help, rest, a potion, a gift).',
    parameters: obj({ target: S('Id or name.'), amount: N('How much.') }, ['target', 'amount']),
    run(a, T) { const seq = T.state.seq; const no = T.do({ type: 'heal', target: a.target, amount: a.amount }); return no ? { refused: no } : T.since(seq); },
  },
  {
    name: 'add_condition',
    description: 'Put a condition from the rules on someone.',
    parameters: obj({ target: S('Id or name.'), condition: S('A condition id from the rules.') }, ['target', 'condition']),
    run(a, T) {
      const t = target(T.state, a.target);
      if (t && t.o.conds.includes(lower(a.condition))) return { note: `Nothing changed: ${t.o.name} is already ${a.condition}.` };
      const seq = T.state.seq; const no = T.do({ type: 'cond.add', target: a.target, cond: a.condition }); return no ? { refused: no } : T.since(seq);
    },
  },
  {
    name: 'remove_condition',
    description: 'Take a condition off someone.',
    parameters: obj({ target: S('Id or name.'), condition: S('The condition id.') }, ['target', 'condition']),
    run(a, T) {
      const t = target(T.state, a.target);
      if (t && !t.o.conds.includes(lower(a.condition))) return { note: `Nothing changed: ${t.o.name} is not ${a.condition}.` };
      const seq = T.state.seq; const no = T.do({ type: 'cond.remove', target: a.target, cond: a.condition }); return no ? { refused: no } : T.since(seq);
    },
  },
  {
    name: 'mark_strain',
    description: 'A character marks strain (fear, exhaustion, a cost the rules name), or clears it (a negative amount).',
    parameters: obj({ character: S('Id or name.'), amount: N('How much; negative to clear.') }, ['character', 'amount']),
    run(a, T) {
      // An amount of nothing is a harmless slip (the Gull Rock bench, 26 Nov), not a broken rule.
      if (!Math.trunc(Number(a.amount) || 0)) return { note: 'Nothing changed: an amount of 0 marks nothing. Give a number (negative to clear).' };
      const seq = T.state.seq; const no = T.do({ type: 'strain.mark', charId: a.character, n: a.amount }); return no ? { refused: no } : T.since(seq);
    },
  },
  {
    name: 'tick_clock',
    description: 'Move one of the adventure\'s clocks on (or back, with a negative number).',
    parameters: obj({ clock: S('The clock\'s id or name.'), by: N('How many segments; default 1.') }, ['clock']),
    run(a, T) { const seq = T.state.seq; const no = T.do({ type: 'clock.tick', id: a.clock, n: a.by || 1 }); return no ? { refused: no } : T.since(seq); },
  },
  {
    name: 'move_party',
    description: 'The party travels to another place, along one of the exits of where they are.',
    parameters: obj({ place: S('The place\'s id or name.') }, ['place']),
    run(a, T) {
      if (T.state.fight) return { note: 'Nothing changed: the party cannot travel during a fight. If they flee, end_combat first (award_xp false).', ...T.fightBrief() };
      const seq = T.state.seq; const no = T.do({ type: 'site.move', siteId: a.place });
      if (no && /already there/.test(no)) return { note: `Nothing changed: ${no}` };
      return no ? { refused: no } : T.since(seq);
    },
  },
  {
    name: 'rest',
    description: 'The party rests: short (a breather) or long (a night\'s sleep). Only when they choose to and no fight is on. A long rest somewhere unsafe may be interrupted (the Engine decides): then a fight starts, and the rest finishes when it is over.',
    parameters: obj({ kind: S('short or long.') }, ['kind']),
    run(a, T) {
      if (T.state.fight) return { note: 'Nothing changed: nobody rests during a fight.', ...T.fightBrief() };
      const seq = T.state.seq;
      const no = T.do({ type: 'rest', kind: /long|night|sleep/i.test(String(a.kind)) ? 'long' : 'short' });
      return no ? { refused: no } : T.since(seq);
    },
  },
  {
    name: 'use_seed',
    description: 'Bring one of the host\'s story seeds (STORY SEEDS in the briefing) into play now: its people or creatures arrive, sized to the party. Use it when its moment comes and only you can see it (the party harasses, robs or picks a fight with someone who is not a creature here), or on your own judgement when it fits (the party is lost or going in circles). For a night in the open call rest with kind long instead: the Engine rolls the camp seeds itself. The Engine logs that you chose it.',
    parameters: obj({ seed: S('The seed\'s id (in square brackets in the briefing) or its title.'), why: S('One short line: why now.') }, ['seed', 'why']),
    run(a, T) {
      const seq = T.state.seq;
      const no = T.do({ type: 'seed.fire', seed: a.seed, why: a.why || '' });
      if (no) return { refused: no };
      const now = T.state.seedNow || {};
      return { ...T.since(seq), seed: now.title, arrived: now.foes || [], here: T.here() };
    },
  },
  {
    name: 'add_quest',
    description: 'The party takes on a new goal.',
    parameters: obj({ text: S('The quest in one sentence.') }, ['text']),
    run(a, T) { const no = T.do({ type: 'quest.add', text: a.text }); return no ? { refused: no } : { ok: true }; },
  },
  {
    name: 'complete_quest',
    description: 'Mark a quest done: only when everything it asks is finished.',
    parameters: obj({ quest: S('The quest id or a few words of it.') }, ['quest']),
    run(a, T) {
      const ref = String(a.quest || '').trim();
      const lead = (/^(\w+)\s/.exec(ref) || [])[1];
      const q = T.state.quests.find((x) => x.id === ref) || (lead && T.state.quests.find((x) => x.id === lead))
        || T.state.quests.find((x) => x.text.toLowerCase().includes(ref.replace(/^\w+\s+/, '').replace(/[.]+$/, '').toLowerCase()))
        || T.state.quests.find((x) => x.text.toLowerCase().includes(ref.toLowerCase()));
      if (!q) return { refused: `There is no such quest. Quests: ${T.state.quests.map((x) => `${x.id} (${x.text})`).join('; ')}.` };
      if (q.done) return { note: `Nothing changed: "${q.text}" is already done.` };
      const no = T.do({ type: 'quest.done', id: q.id });
      if (no && /^Not yet/.test(no)) return { note: `${no} Keep it open.` };
      return no ? { refused: no } : { ok: true };
    },
  },
  {
    name: 'award_xp',
    description: 'Give every character experience for a milestone (a quest done, a clever plan). Fights award their own.',
    parameters: obj({ amount: N('How much each.'), why: S('What it is for.') }, ['amount', 'why']),
    run(a, T) { const seq = T.state.seq; const no = T.do({ type: 'xp.award', amount: a.amount, why: a.why }); return no ? { refused: no } : T.since(seq); },
  },
];

// Short words for the briefing: what a character can roll and what can hurt them.
export function charLine(mod, c) {
  const st = mod.rules.stats.map((x) => `${x.id} ${c.stats[x.id] || 0}`).join(', ');
  const sk = Object.entries(c.skills).map(([k, v]) => `${k} ${v}`).join(', ');
  return `${c.id} ${c.name} (${(mod.ix.origin[c.origin] || {}).name} ${(mod.ix.calling[c.calling] || {}).name}, ${term(mod, 'level').toLowerCase()} ${c.level}): ${term(mod, 'health')} ${c.health}/${c.healthMax}, ${term(mod, 'strain')} ${c.strain}/${mod.rules.strain.max}, defence ${charDefence(mod, c)}${c.conds.length ? `, ${c.conds.join(', ')}` : ''}${c.down ? ', DOWN' : ''}. Stats: ${st}. Skills: ${sk || 'none'}. Gear: ${c.gear.join(', ')}. Abilities: ${c.abilities.join(', ') || 'none'}.${c.want ? ` Wants: ${c.want}` : ''}`;
}
export { difficulty };
