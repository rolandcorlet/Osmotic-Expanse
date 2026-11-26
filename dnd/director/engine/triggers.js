// The adventure's own rules: "when X happens here, Y happens", written as data so the Engine can carry
// them out by itself and the Director only has to narrate them. Browser-safe, no state: this reads and
// describes rules; engine/ledger.js runs them.
//
// A rule, in a place's `rules` (or the adventure's own `rules`, which hold everywhere):
//   { when: 'fail perception', do: 'fight', surprise: 'party' }
//   { when: 'down', who: 'Goblin scout', count: 2, do: 'flee', to: 'tower-gate' }
//   { when: 'hurt', who: 'Grisk', if: 'down Goblin guard', do: 'flee', say: 'Grisk offers to sell the girl, then runs.' }
//   { when: 'round', do: 'tick', clock: 'The burning bridge' }
//   { when: 'cleared', do: 'quest', quest: 'vanished', xp: 300 }
//   { when: 'use chest', do: 'give', item: 'Silver key', say: 'Under the rags: a silver key.' }
//   { when: 'enter Sanctum', if: 'carries sun disc', do: 'say', say: 'The altar flares at the Sun Disc.' }
//   { when: 'fight', if: 'has chieftain token', do: 'calm', target: 'Goblin', say: 'They know the token.' }
//
// when (what sets it off; each rule fires once unless it says `once: false`, and "round" fires every round):
//   enter            the party arrives here (the first place: when the game starts)
//   enter <zone>     a character moves into that zone of this place (an area on the map)
//   use <object>     a character uses an object here: opens the chest, pulls the lever, reads the book
//                    (the Director's use_object, the DM's "Use" on the Adventure tab); `objects` lists them
//   fight            a fight starts here, before anyone acts: how the foes meet the party is decided
//   turn <who>       `who`'s turn begins in a fight here (plain "turn": any foe's): what it does is decided.
//                    Every turn, unless the rule says once: true
//   attack           someone attacks before a fight is on here
//   fail <skill>     a check with that skill made here fails (a group check: half or more fail)
//   succeed <skill>  a check with that skill made here succeeds
//   round <n>        round n of a fight here begins ("at the end of round 2" is round 3); plain "round": at
//                    the end of every round (as the next begins)
//   down             `who` is down or gone (`count`: that many of the group as written, in proportion when
//                    the fight was fitted to the party; all of it if not given)
//   hurt             `who` is below half its hit points (`hp`: below that many instead)
//   cleared          no foe here is left standing (and there was at least one)
//   full <clock>     that clock fills
//   quest <words>    that quest is complete
// if (all must hold; one string or a list; "not " in front turns one round):
//   from <place>, visited <place>, down <who>, standing <who>, hurt <who>, quest <words>,
//   has <item> (anyone in the party, or the party's loot), carries <item> (the character who set the rule
//   off: who entered the zone or used the object; anyone in the party for other moments),
//   passed <skill>, failed <skill> (the last such check here), fight, no fight
// do (what happens):
//   fight    a fight starts here with everyone standing (surprise: 'party' or 'foes')
//   flee     `target` (or the rule's `who`) flees; `to: <place>` sends them there instead of out of the story
//   tick     the clock `clock` fills by `by` (1); a clock the adventure sets out starts if it is not running
//   quest    the quest `quest` (an id or a few of its words) is complete
//   xp       each character earns `xp`, or `level: n`: what each still needs to reach level n (any rule may
//            also carry `xp` or `level`: a milestone paid with it, once per place)
//   reveal   `target` or `who` (everyone hidden here if neither is given) is revealed
//   give     `item` (and `qty`) and/or `gold` go to the character who set it off (who opened the chest),
//            or to the party's loot
//   calm     `target` or `who` (everyone here if neither) stands down: out of the fight, not beaten (no
//            XP); the fight ends when no foe in it is still fighting. Attacking them starts a new one.
//   add      `qty` (1) of `monster` (an SRD or adventure monster id) arrive here, named `name`, in sight
//            unless `hidden`; in a fight they join it (a boss's second form, reinforcements)
//   damage   `target` (or `who`) takes `amount` damage of `type`, and `cond` if given (the Ashen Crown's tainted
//            elixir searing Malakor); scaled like the place's hit points when the fight was fitted
//   say      nothing happens but the line in `say`, for the Director (any rule may carry `say`)

export const EVENTS = ['enter', 'use', 'fight', 'turn', 'attack', 'fail', 'succeed', 'round', 'down', 'hurt', 'cleared', 'full', 'quest'];
export const EFFECTS = ['fight', 'flee', 'tick', 'quest', 'xp', 'reveal', 'give', 'calm', 'add', 'damage', 'say'];
export const CONDITIONS = ['from', 'visited', 'down', 'standing', 'hurt', 'quest', 'has', 'carries', 'passed', 'failed', 'fight', 'no fight'];
// Set off by a state that holds (checked after every change), not by one moment.
export const STATES = ['down', 'hurt', 'cleared', 'full', 'quest'];

// For "when" and "if", whose parts may be written "fail:perception" or "fail perception".
const words = (v) => String(v == null ? '' : v).replace(/[:_]+/g, ' ').replace(/\s+/g, ' ').trim();
const plain = (v) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim();

// "fail perception" -> { ev: 'fail', arg: 'perception' }; "round 3" -> { ev: 'round', arg: 3 }.
export function parseWhen(v) {
  const w = words(v);
  const low = w.toLowerCase();
  const ev = EVENTS.find((e) => low === e || low.startsWith(`${e} `)) || (/^(?:succeeds?|passe?s?|success)\b/.test(low) ? 'succeed' : /^fail(?:s|ed|ure)?\b/.test(low) ? 'fail' : /^(?:arrive|arrives|arrival|entering|enters)\b/.test(low) ? 'enter'
    : /^(?:uses?|opens?|interacts?(?: with)?|touch(?:es)?|search(?:es)?)\b/.test(low) ? 'use' : /^(?:fight starts|combat|battle)\b/.test(low) ? 'fight' : '');
  if (!ev) return { ev: '', arg: '', raw: w };
  let arg = w.replace(/^\S+\s*/, '').trim();
  if (ev === 'use') arg = w.replace(/^(?:uses?|opens?|interacts?(?:\s+with)?|touch(?:es)?|search(?:es)?)\s*/i, '').replace(/^(?:the|a|an)\s+/i, '').trim();
  if (ev === 'enter') arg = arg.replace(/^(?:the\s+)?(?:zone|area)\s+/i, '').trim();
  if (ev === 'fight') arg = '';
  if (ev === 'round') arg = arg ? Math.max(1, Math.trunc(Number(arg)) || 0) || '' : '';
  if (ev === 'fail' || ev === 'succeed') arg = arg.toLowerCase().replace(/\s+(?:check|save|saving throw)$/, '').replace(/\s+/g, '-');
  return { ev, arg, raw: w };
}

// "not down Goblin guard" -> { k: 'down', arg: 'Goblin guard', not: true }.
export function parseIf(v) {
  let w = words(v);
  let not = false;
  if (/^(?:not|no longer)\s+/i.test(w) && !/^no fight$/i.test(w)) { not = true; w = w.replace(/^(?:not|no longer)\s+/i, ''); }
  const low = w.toLowerCase();
  if (low === 'no fight') return { k: 'fight', arg: '', not: !not, raw: words(v) };
  const k = CONDITIONS.find((c) => low === c || low.startsWith(`${c} `)) || '';
  let arg = k ? w.slice(k.length).trim() : w;
  if (k === 'passed' || k === 'failed') arg = arg.toLowerCase().replace(/\s+/g, '-');
  return { k, arg, not, raw: words(v) };
}

const list = (v) => (Array.isArray(v) ? v : v == null || v === '' ? [] : [v]);

// One rule in the Engine's shape. `site` is the place it belongs to ('' for the adventure's own).
export function normRule(r, site, n) {
  const when = parseWhen(r.when);
  const id = String(r.id || `r${n + 1}`).trim();
  return {
    key: `${site || '*'}/${id}`, id, site: site || '',
    when, who: plain(r.who), target: plain(r.target || r.who), count: Number(r.count) > 0 ? Math.trunc(Number(r.count)) : null, hp: Number(r.hp) > 0 ? Math.trunc(Number(r.hp)) : null,
    if: list(r.if).map(parseIf),
    do: String(r.do || (r.say ? 'say' : '')).toLowerCase().trim(),
    surprise: /^(?:the )?(?:party|heroes|characters|players|pcs)$/i.test(String(r.surprise || '')) ? 'party' : /^(?:the )?(?:foes|monsters|enemies|them)$/i.test(String(r.surprise || '')) ? 'foes' : '',
    to: plain(r.to), clock: plain(r.clock), by: Math.trunc(Number(r.by)) || 1, quest: plain(r.quest),
    item: plain(r.item), qty: Number(r.qty) > 1 ? Math.min(999, Math.trunc(Number(r.qty))) : 1, gold: Number(r.gold) > 0 ? Math.min(1e6, Math.trunc(Number(r.gold))) : 0,
    monster: plain(r.monster).toLowerCase(), name: plain(r.name), hidden: !!r.hidden,
    amount: Number(r.amount) > 0 ? Math.min(999, Math.trunc(Number(r.amount))) : 0, type: plain(r.type).toLowerCase(), cond: plain(r.cond).toLowerCase(),
    xp: Number(r.xp) > 0 ? Math.trunc(Number(r.xp)) : 0, level: Number(r.level) >= 2 ? Math.min(20, Math.trunc(Number(r.level))) : 0, say: plain(r.say),
    // "round" alone and "turn" happen every time unless the rule says once: true.
    once: r.once === false ? false : r.once === true ? true : !((when.ev === 'round' && !when.arg) || when.ev === 'turn'),
  };
}

// The rules that hold at a place: its own, then the adventure's own.
export function rulesAt(adv, siteId) {
  const site = ((adv && adv.sites) || []).find((x) => x.id === siteId);
  return [
    ...((site && site.rules) || []).map((r, n) => normRule(r, site.id, n)),
    ...((adv && adv.rules) || []).map((r, n) => normRule(r, '', n)),
  ];
}
export function allRules(adv) {
  return [
    ...((adv && adv.sites) || []).flatMap((s) => (s.rules || []).map((r, n) => normRule(r, s.id, n))),
    ...((adv && adv.rules) || []).map((r, n) => normRule(r, '', n)),
  ];
}

// ---- in words, for the Director's briefing and the DM's screen --------------------------------------
const NUM = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
const placeName = (adv, id) => (((adv && adv.sites) || []).find((x) => x.id === id) || {}).name || id;
const skillName = (id) => cap(String(id || '').replace(/-/g, ' '));

export function whenWords(r) {
  const { ev, arg } = r.when;
  const who = r.who || 'the foes here';
  switch (ev) {
    case 'enter': return arg ? `When a character enters ${arg}` : 'When the party arrives';
    case 'use': return `When a character uses ${/^(?:the|a|an) /i.test(arg) ? arg : `the ${arg}`}`;
    case 'fight': return 'When a fight starts here (before anyone acts)';
    case 'turn': return arg ? `When ${arg}'s turn begins` : 'When a foe\'s turn begins here';
    case 'attack': return 'When anyone attacks before a fight is on';
    case 'fail': return `When a ${skillName(arg)} check here fails`;
    case 'succeed': return `When a ${skillName(arg)} check here succeeds`;
    case 'round': return arg ? `When round ${arg} of the fight begins` : 'At the end of every round of a fight here';
    case 'down': return r.count ? `When ${NUM[r.count] || r.count} of ${who} ${r.count > 1 ? 'are' : 'is'} down` : `When ${who} ${/s$/.test(who) && !r.who ? 'are' : 'is'} down`;
    case 'hurt': return r.hp ? `When ${who} drops below ${r.hp} hit points` : `When ${who} drops below half hit points`;
    case 'cleared': return 'When no foe here is left standing';
    case 'full': return `When the clock "${arg}" fills`;
    case 'quest': return `When the quest "${arg}" is complete`;
    default: return `When ${r.when.raw || '?'}`;
  }
}
function ifWords(c, adv) {
  const n = c.not ? ' not' : '';
  switch (c.k) {
    case 'from': return `the party came${n} from ${placeName(adv, c.arg)}`;
    case 'visited': return `the party has${n ? ' not' : ''} been to ${placeName(adv, c.arg)}`;
    case 'down': return `${c.arg} is${n} down`;
    case 'standing': return `${c.arg} is${n} still standing`;
    case 'hurt': return `${c.arg} is${n} below half hit points`;
    case 'quest': return `the quest "${c.arg}" is${n} complete`;
    case 'has': return `the party has${n ? ' not' : ''} got ${c.arg}`;
    case 'carries': return `that character ${c.not ? 'does not carry' : 'carries'} ${c.arg}`;
    case 'passed': return `the last ${skillName(c.arg)} check here ${c.not ? 'did not succeed' : 'succeeded'}`;
    case 'failed': return `the last ${skillName(c.arg)} check here ${c.not ? 'did not fail' : 'failed'}`;
    case 'fight': return c.not ? 'no fight is on' : 'a fight is on';
    default: return c.raw;
  }
}
export function doWords(r, adv) {
  const who = r.target || r.who || 'the foes here';
  const parts = [];
  switch (r.do) {
    case 'fight': parts.push(`a fight starts${r.surprise === 'party' ? ', and the party is surprised' : r.surprise === 'foes' ? ', and the foes are surprised' : ''}`); break;
    case 'flee': parts.push(`${who} ${/s$/.test(who) ? 'flee' : 'flees'}${r.to ? ` to ${placeName(adv, r.to)}` : ''}`); break;
    case 'tick': parts.push(`the clock "${r.clock}" fills by ${r.by}`); break;
    case 'quest': parts.push(`the quest "${r.quest}" is complete`); break;
    case 'reveal': parts.push(`${r.target || 'everyone hidden here'} ${r.target && !/s$/.test(r.target) ? 'is' : 'are'} revealed`); break;
    case 'give': parts.push(`${[r.item ? `${r.qty > 1 ? `${r.qty} × ` : ''}${r.item}` : '', r.gold ? `${r.gold} gp` : ''].filter(Boolean).join(' and ') || 'nothing'} ${r.when.ev === 'use' || r.when.ev === 'enter' ? 'goes to that character' : 'goes to the party'}`); break;
    case 'calm': parts.push(`${who} ${/s$/.test(who) ? 'stand' : 'stands'} down (no fight with ${/s$/.test(who) || !r.target ? 'them' : 'it'})`); break;
    case 'add': parts.push(`${r.qty > 1 ? `${r.qty} × ` : ''}${r.name || r.monster} ${r.qty > 1 ? 'arrive' : 'arrives'}${r.hidden ? ', out of sight' : ''}`); break;
    case 'damage': parts.push(`${who} ${/s$/.test(who) ? 'take' : 'takes'} ${r.amount} ${r.type || ''} damage${r.cond ? ` and ${/s$/.test(who) ? 'are' : 'is'} ${r.cond}` : ''}`.replace(/\s+/g, ' ')); break;
    case 'xp': break;
    case 'say': break;
    default: parts.push(`(${r.do || 'nothing'})`);
  }
  if (r.xp) parts.push(`each character earns ${r.xp} XP`);
  if (r.level) parts.push(`each character reaches level ${r.level} (a milestone)`);
  return parts.join(', and ');
}
export function ruleWords(r, adv) {
  const conds = r.if.map((c) => ifWords(c, adv));
  const fx = doWords(r, adv);
  const say = r.say ? `${fx ? ' ' : ''}${r.say}` : '';
  return `${whenWords(r)}${conds.length ? `, if ${conds.join(' and ')}` : ''}: ${fx ? `${fx}.` : ''}${say}`.replace(/\.\./g, '.');
}

// ---- checking an adventure's rules (for engine/check.js) ----------------------------------------
// names: the foe names and groups at each place; quests: every quest text; clocks: every clock name.
export function checkRules(adv, { skills = [], monsters: monsterIds = [] } = {}) {
  const monsters = new Set([...monsterIds, ...((adv && adv.monsters) || []).map((m) => m.id)].map((x) => String(x).toLowerCase()));
  const errors = []; const warnings = [];
  const sites = (adv && adv.sites) || [];
  const ids = new Set(sites.map((s) => s.id));
  const questTexts = [...((adv && adv.quests) || []), ...((adv && adv.questDone) || []).map((q) => q.match)].map((q) => String(q).toLowerCase());
  const clockNames = sites.flatMap((s) => (s.clocks || []).map((c) => String(c.name || '').toLowerCase()));
  const groupsAt = (siteId) => {
    const s = sites.find((x) => x.id === siteId);
    // The foes written there, and those a rule brings in (do: 'add'): a rule may name the boss's second form.
    const of = (x) => [...(x.foes || []), ...((x.rules || []).filter((r) => r.do === 'add'))].flatMap((f) => [f.name, f.monster].filter(Boolean).map((y) => String(y).toLowerCase()));
    return s ? of(s) : sites.flatMap(of);
  };
  const knownFoe = (siteId, who) => {
    const w = String(who || '').toLowerCase().replace(/s$/, '');
    if (!w) return true;
    return groupsAt(siteId).some((g) => g === w || g.replace(/s$/, '') === w || g.startsWith(w) || w.startsWith(g));
  };
  const knownQuest = (w) => { const k = String(w || '').toLowerCase(); return !k || /^q\d+$/.test(k) || questTexts.some((q) => q.includes(k) || k.includes(q)); };
  const knownSkill = (k) => !skills.length || skills.includes(k) || ['str', 'dex', 'con', 'int', 'wis', 'cha', 'strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'].includes(k);
  const seen = new Set();
  for (const r of allRules(adv)) {
    const at = r.site ? `${r.site}: rule ${r.id}` : `rule ${r.id}`;
    if (seen.has(r.key)) errors.push(`${at}: two rules have the id "${r.id}".`);
    seen.add(r.key);
    if (!r.when.ev) errors.push(`${at}: "${r.when.raw}" is not something a rule can wait for. Use one of: ${EVENTS.join(', ')}.`);
    if (!EFFECTS.includes(r.do)) errors.push(`${at}: "${r.do || '(nothing)'}" is not something a rule can do. Use one of: ${EFFECTS.join(', ')}.`);
    if ((r.when.ev === 'fail' || r.when.ev === 'succeed') && !r.when.arg) errors.push(`${at}: name the skill ("${r.when.ev} perception").`);
    if ((r.when.ev === 'fail' || r.when.ev === 'succeed') && r.when.arg && !knownSkill(r.when.arg)) errors.push(`${at}: "${r.when.arg}" is not a skill.`);
    if (['down', 'hurt'].includes(r.when.ev) && !r.who) errors.push(`${at}: say who (who: 'Grisk').`);
    if (r.when.ev === 'use' && !r.when.arg) errors.push(`${at}: say what is used ("use chest").`);
    const place = sites.find((x) => x.id === r.site);
    const flat = (t) => String(t || '').toLowerCase().replace(/[-_]+/g, ' ').trim();
    const objects = ((place && place.objects) || []).map((o) => flat(typeof o === 'string' ? o : o.name)).filter(Boolean);
    if (r.when.ev === 'use' && r.when.arg && objects.length && !objects.some((o) => o.includes(flat(r.when.arg)) || flat(r.when.arg).includes(o))) warnings.push(`${at}: no object here is called "${r.when.arg}" (objects: ${objects.join(', ')}).`);
    const zones = ((place && place.zones) || []).flatMap((z) => [z.id, z.name].filter(Boolean).map((x) => String(x).toLowerCase()));
    if (r.when.ev === 'enter' && r.when.arg && zones.length && !zones.includes(r.when.arg.toLowerCase())) errors.push(`${at}: there is no zone "${r.when.arg}" here (zones: ${place.zones.map((z) => z.name || z.id).join(', ')}).`);
    if (r.when.ev === 'enter' && r.when.arg && !r.site) errors.push(`${at}: a zone belongs to a place: put this rule in that place's rules.`);
    if (r.when.ev === 'enter' && r.when.arg && ids.has(r.when.arg) && !zones.includes(r.when.arg.toLowerCase())) errors.push(`${at}: "${r.when.arg}" is a place, not an area of this one: put the rule in ${r.when.arg}'s rules with when: 'enter'.`);
    if (r.when.ev === 'turn' && r.when.arg && !knownFoe(r.site, r.when.arg)) warnings.push(`${at}: no foe here is called "${r.when.arg}".`);
    if (r.do === 'give' && !r.item && !r.gold) errors.push(`${at}: say what is given (item: 'Silver key', or gold: 50).`);
    if (r.who && r.do !== 'give' && !knownFoe(r.site, r.who)) warnings.push(`${at}: no foe here is called "${r.who}".`);
    if (r.target && r.target !== r.who && !knownFoe(r.site, r.target)) warnings.push(`${at}: no foe here is called "${r.target}".`);
    if (r.when.ev === 'full' && !clockNames.includes(String(r.when.arg).toLowerCase())) errors.push(`${at}: no clock is called "${r.when.arg}".`);
    if (r.when.ev === 'quest' && !knownQuest(r.when.arg)) warnings.push(`${at}: no quest has the words "${r.when.arg}" (fine if the Director adds it later).`);
    if (r.do === 'tick' && !clockNames.includes(r.clock.toLowerCase())) errors.push(`${at}: no clock is called "${r.clock}".`);
    if (r.do === 'quest' && !r.quest) errors.push(`${at}: say which quest (quest: 'lantern').`);
    if (r.do === 'quest' && r.quest && !knownQuest(r.quest)) warnings.push(`${at}: no quest has the words "${r.quest}" (fine if the Director adds it later).`);
    if (r.do === 'flee' && r.to && !ids.has(r.to)) errors.push(`${at}: there is no place "${r.to}" to flee to.`);
    if (r.do === 'xp' && !r.xp && !r.level) errors.push(`${at}: give the XP (xp: 300) or the level (level: 2).`);
    if (r.do === 'say' && !r.say) errors.push(`${at}: write what happens (say: '…').`);
    if (r.do === 'add' && !r.monster) errors.push(`${at}: say which monster arrives (monster: 'ogre').`);
    if (r.do === 'damage' && (!r.amount || !(r.target || r.who))) errors.push(`${at}: say who takes the damage and how much (target: 'Grisk', amount: 10).`);
    if (r.do === 'add' && r.monster && monsters.size && !monsters.has(String(r.monster).toLowerCase())) errors.push(`${at}: there is no monster "${r.monster}" (an SRD id, or one of this adventure's own).`);
    for (const c of r.if) {
      if (!c.k) errors.push(`${at}: "${c.raw}" is not a condition. Use one of: ${CONDITIONS.join(', ')}.`);
      if ((c.k === 'from' || c.k === 'visited') && !ids.has(c.arg)) errors.push(`${at}: there is no place "${c.arg}".`);
      if (['down', 'standing', 'hurt'].includes(c.k) && !knownFoe(r.site, c.arg)) warnings.push(`${at}: no foe here is called "${c.arg}".`);
      if (c.k === 'quest' && !knownQuest(c.arg)) warnings.push(`${at}: no quest has the words "${c.arg}".`);
      if ((c.k === 'has' || c.k === 'carries') && !c.arg) errors.push(`${at}: name the item ("${c.k} silver key").`);
    }
    if (!r.site && ['enter', 'use', 'fight', 'turn', 'attack', 'fail', 'succeed', 'round', 'cleared'].includes(r.when.ev) && !(r.when.ev === 'enter' && r.when.arg)) warnings.push(`${at}: an adventure-wide rule on "${r.when.ev}" fires at the first place it happens. Put it in a place's rules if it belongs to one.`);
  }
  return { errors, warnings };
}
