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
import * as MAP from '../engine/map.js';

// The map for the Director (from the D&D Director's mapBrief): each zone here and who is in it, the ways
// between zones, and who is close enough to strike whom. Empty when the map is off or has no zones here.
export function mapBrief(s, mod) {
  const m = s.map;
  if (!m || !m.show || !(m.show.zones || m.show.grid)) return '';
  const siteId = s.scene.siteId;
  const zones = (m.zones || {})[siteId];
  if (!zones || !zones.length) return '';
  const R = MAP.mapRules(mod);
  const name = (k) => { const [kind, id] = k.split(':'); const o = kind === 'char' ? s.chars[id] : s.creatures[id]; return o ? `${o.name}${o.down ? ' (down)' : ''}${kind === 'creature' && o.hidden ? ' (hidden)' : ''}` : ''; };
  const here = Object.entries(m.at || {}).filter(([k, p]) => p.site === siteId && name(k));
  const lines = zones.map((z) => {
    const who = here.filter(([, p]) => p.zone === z.id).map(([k]) => name(k));
    const tags = (z.tags || []).map((t) => (t === 'half-cover' ? `half cover (+${R.cover.half} defence)` : t === 'three-quarters-cover' ? `full cover (+${R.cover.full} defence)` : MAP.TAGS[t])).filter(Boolean);
    return `- ${z.name}${tags.length ? ` (${tags.join(', ')})` : ''}: ${who.join(', ') || 'nobody'}${z.note ? `. ${z.note}` : ''}`;
  });
  const links = [];
  for (const z of zones) for (const l of z.links || []) if (z.id < l) links.push(`${z.name}–${(zones.find((x) => x.id === l) || {}).name}`);
  const close = [];
  const chars = here.filter(([k]) => k.startsWith('char:')); const ks = here.filter(([k]) => k.startsWith('creature:'));
  for (const [ck, cp] of chars) for (const [kk, kp] of ks) if (MAP.inReach(cp, kp, R.reach) && !s.chars[ck.slice(5)].down && !s.creatures[kk.slice(9)].down) close.push(`${name(ck)} and ${name(kk)}`);
  return [
    `MAP (zones about six squares across, a square is ${R.square}; players move their own characters, move_creature moves the creatures; a creature's melee attack steps up to its target${m.show.reach ? `; DISTANCE DECIDES: a creature strikes only someone it can reach within ${R.move * 2} squares, and shoots no further than its range` : ''}):`,
    ...lines,
    links.length ? `Ways between zones: ${links.join(', ')}.` : '',
    close.length ? `Close enough to strike: ${close.join('; ')}.` : '',
  ].filter(Boolean).join('\n');
}

const S = (description) => ({ type: 'string', description });
const N = (description) => ({ type: 'number', description });
const A = (description) => ({ type: 'array', items: { type: 'string' }, description });
const obj = (properties, required = []) => ({ type: 'object', properties, required });
const lower = (x) => String(x || '').trim().toLowerCase();

export function toolbox({ state, mod, rng, now = 0, memory = null }) {
  const T = {
    state, mod, memory, refusals: 0,
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
    name: 'remember',
    description: 'Write a person, faction, place or thread into the table\'s memory so it stays the same for the rest of the game: when you give someone a name, a player names something, or a fact about someone is settled at the table (a debt, a grudge, a promise, what they want). One short fact in plain words. Calling it again with the same name adds a fact to the same card. Set seen false only for a fact the players have not been told.',
    parameters: obj({ name: S('The name the table uses, for example "the lamp keeper" or "Old Harl".'), kind: { type: 'string', enum: ['person', 'faction', 'place', 'thread'], description: 'What it is: a person, a faction, a place, or a thread (a debt, a grudge, a promise: something unresolved).' }, fact: S('One short fact worth remembering.'), seen: { type: 'boolean', description: 'False only when the players have not been told this.' } }, ['name', 'kind', 'fact']),
    run(a, T) {
      const no = T.do({ type: 'cast.remember', name: a.name, kind: a.kind, fact: a.fact, seen: !(a.seen === false || a.seen === 'false') });
      // One of the party (Gull Rock bench, 28 Nov): harmless, their sheet keeps them. A note, not a refusal.
      if (no && /^That is one of the party/.test(no)) return { note: `Nothing changed: ${no}` };
      if (no) return { refused: no };
      const k = Object.values(T.state.cast || {}).find((c) => c.name.toLowerCase() === String(a.name).trim().toLowerCase());
      return { remembered: true, card: k ? { name: k.name, origin: k.origin, facts: k.facts.length } : null };
    },
  },
  {
    name: 'recall',
    description: 'Search everything that has happened in this game, earlier nights included: what was said, narrated and done, and the chronicle.',
    parameters: obj({ query: S('A name, place or thing.') }, ['query']),
    run(a, T) {
      // The game's whole history when it is kept (brain/memory.js); else today's story.
      if (T.memory && T.memory.search) {
        const r = T.memory.search(a.query);
        if (r.hits.length) return { found: r.hits.map((h) => `${h.from === 'chronicle' ? 'Chronicle' : h.who}${h.site ? ` (at ${h.site})` : ''}: ${h.text}`), ...(r.more ? { more: r.more } : {}) };
        return { note: 'Nothing about that has happened yet.' };
      }
      const w = lower(a.query).split(/\W+/).filter((x) => x.length > 2);
      const hits = T.state.story.filter((e) => w.some((x) => lower(e.text).includes(x))).slice(-6).map((e) => `${e.who}: ${e.text.slice(0, 300)}`);
      return hits.length ? { found: hits } : { note: 'Nothing about that has happened yet.' };
    },
  },
  {
    name: 'ask_for_roll',
    description: 'Ask one or more characters to roll a stat (+ skill) against a difficulty. Ask only once a player has said what their character tries (\"I search the desk\", \"I look where the lamp was\"), or when a hazard, a trap or an attack forces it. When you set a scene, or someone has just walked in or out, ask what they do and wait: no roll yet. The roll appears on their screens with your reason, and the story says it to the table; they roll it and you will hear the result. Use this for anything uncertain the players try, and for hazards. Never ask for a roll in words only.',
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
      // Every roll is said to the player with what it is for (Roly, 27 Nov): no reason, no roll.
      if (!String(a.reason || '').trim()) return { note: 'Nothing asked: say in reason what the roll is for, in a few words the player sees ("Search where the lamp was").' };
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
      // "No seed" said as a call (bench part 3, 27 Nov: seed "none"): nothing to do, not a broken rule.
      if (/^\s*(none|no|nothing|null|n\/a|-|no seed)?\s*$/i.test(String(a.seed == null ? '' : a.seed))) return { note: 'Nothing changed: no seed was named, so none came into play. Only call use_seed to bring one in.' };
      // No seeds in this game at all (X Marks the Spot, 27 Nov: "Mavren's warning", a person the Director meant to
      // bring in): nothing to bring, so a note that says how, not a refusal.
      if (!(T.state.seeds || []).some((x) => x.on)) return { note: 'Nothing changed: this game has no story seeds. Bring people in by narrating them (and reveal_creatures for creatures already here).' };
      const seq = T.state.seq;
      const no = T.do({ type: 'seed.fire', seed: a.seed, why: a.why || '' });
      if (no) return { refused: no };
      const now = T.state.seedNow || {};
      return { ...T.since(seq), seed: now.title, arrived: now.foes || [], here: T.here() };
    },
  },
  {
    name: 'move_creature',
    description: 'Move creatures (or characters with no player) on the map of this place: to another zone (MAP in the briefing lists them), or up to someone to fight them. Use it when a creature runs, charges, hides or takes cover; a creature\'s attack already steps up to its target by itself.',
    parameters: obj({
      who: A('Names or ids of who moves.'),
      to_zone: S('The zone to move to, by its name in MAP. Leave empty when engaging someone.'),
      engage: S('Optional: the name of someone to move right up to.'),
    }, ['who']),
    run(a, T) {
      const m = T.state.map;
      if (!m || !(m.show.zones || m.show.grid)) return { note: 'Nothing changed: the map is switched off for this game. Just narrate where everyone is.' };
      const list = (v) => [].concat(v || []).flatMap((x) => String(x).split(/\s*,\s*|\s+and\s+/)).map((x) => x.trim()).filter(Boolean);
      const who = list(a.who).length ? list(a.who) : list(a.creatures).concat(list(a.characters));
      if (!who.length) return { note: 'Nothing changed: name who moves (the who list).' };
      const zone = a.to_zone || a.zone || a.to || '';
      let engage = a.engage || a.target || '';
      let chose = '';
      // No place to go, in a fight (from the D&D bench, 27 Nov): a creature closes on a standing character,
      // a character on a standing creature here.
      if (!zone && !engage && T.state.fight) {
        const first = target(T.state, who[0]);
        const up = first && first.kind === 'creature' ? Object.values(T.state.chars).find((c) => !c.down)
          : first ? Object.values(T.state.creatures).find((k) => k.siteId === T.state.scene.siteId && !k.down && !k.hidden) : null;
        if (up) { engage = up.name; chose = `No place was given: ${who.join(', ')} closes in on ${up.name}.`; }
      }
      if (!zone && !engage) return { note: 'Nothing changed: give to_zone (a zone in MAP) or engage (someone to move up to).', map: mapBrief(T.state, T.mod) };
      const done = []; const notes = chose ? [chose] : [];
      for (const w of who) {
        const t = target(T.state, w);
        if (!t) { notes.push(`Nobody called "${w}" is here.`); continue; }
        const no = T.do({ type: 'map.move', who: `${t.kind}:${t.id}`, zone: engage ? '' : zone, engage: engage ? (() => { const e = target(T.state, engage); return e ? `${e.kind}:${e.id}` : engage; })() : '' });
        if (no) notes.push(no); else { done.push(w); if (T.state.map.lastNote) notes.push(T.state.map.lastNote); }
      }
      const out = { map: mapBrief(T.state, T.mod) };
      if (!done.length) return { note: `Nothing changed: ${notes.join(' ')}`, ...out };
      if (notes.length) out.note = notes.join(' ');
      return out;
    },
  },
  {
    name: 'use_object',
    description: 'A character uses one of the objects here (opens the chest, pulls the lever, reads the log): the Engine carries out what the adventure says happens. Then narrate it.',
    parameters: obj({ character: S('Who uses it: their name or id.'), object: S('The object, as "Objects here" names it.'), how: S('One verb: open, pull, read, try, search (optional).') }, ['character', 'object']),
    run(a, T) {
      const seq = T.state.seq;
      const no = T.do({ type: 'object.use', who: a.character, object: a.object, how: a.how });
      return no ? { refused: no } : T.since(seq);
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
      // The id and its words, as the briefing lists them ("stop-rite Stop the rite...": Gull Rock, 27 Nov).
      const lead = (/^([\w-]+)\s/.exec(ref) || [])[1];
      const q = T.state.quests.find((x) => x.id === ref) || (lead && T.state.quests.find((x) => x.id === lead))
        || T.state.quests.find((x) => x.text.toLowerCase().includes(ref.replace(/^\w+\s+/, '').replace(/[.]+$/, '').toLowerCase()))
        || T.state.quests.find((x) => x.text.toLowerCase().includes(ref.toLowerCase()));
      // A quest the adventure writes but the party was never given: nothing to finish, so a note (D&D bench, 27 Nov).
      if (!q) {
        const low = ref.toLowerCase();
        const adv = T.mod.ix.adventure[T.state.adventureId] || T.mod.adventures[0];
        const written = (adv.quests || []).find((x) => x.id === low || (x.id && low.startsWith(`${x.id} `)) || (x.text && x.text.toLowerCase().includes(low.replace(/^[\w-]+\s+/, '').replace(/[.]+$/, ''))));
        if (written || low === T.state.scene.siteId) return { note: `Nothing changed: the party never took on a quest for "${ref}". If they have taken it on, add_quest it first, then complete it. Quests: ${T.state.quests.map((x) => `${x.id} (${x.text})`).join('; ') || 'none'}.` };
        return { refused: `There is no such quest. Quests: ${T.state.quests.map((x) => `${x.id} (${x.text})`).join('; ')}.` };
      }
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
