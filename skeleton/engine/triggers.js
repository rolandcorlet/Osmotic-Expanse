// An adventure's own rules: "when X happens here, Y happens", written as data so the Engine carries them
// out by itself and the Director only narrates them (the D&D Director's triggers, for every Skeleton game).
// Browser-safe, no state: this reads, checks and describes rules; engine/ledger.js runs them.
//
// A rule, in a place's `rules` (or the adventure's own `rules`, which hold everywhere):
//   { when: 'enter', do: 'tick', clock: 'tide' }
//   { when: 'fail sneak', do: 'fight', say: 'The choir wakes.' }
//   { when: 'down', who: 'Glass eel', do: 'say', say: 'The water clears.' }
//   { when: 'cleared', do: 'xp', xp: 10 }
//   { when: 'enter', if: 'not visited nave', do: 'reveal', who: 'Tidewarden' }
//   { when: 'use sea chest', do: 'give', item: 'Brass key', say: 'Under the oilcloth: a brass key.' }
//   { when: 'use lamp room door', if: 'carries brass key', do: 'say', say: 'The key turns.' }
//
// when (each rule fires once unless it says `once: false`; "round" fires every round):
//   enter            the party arrives here (the first place: when the game starts)
//   fail <x>         a roll made here with that stat or skill fails
//   succeed <x>      a roll made here with that stat or skill succeeds
//   round            a new round of a fight here begins
//   down             `who` (a creature's name, or its bestiary id) is down; `count`: that many of them
//   cleared          no creature here is left standing (and there was at least one)
//   full <clock>     that clock fills
//   quest <id>       that quest is done
//   use <object>     a character uses one of the place's `objects` (opens the chest, pulls the lever, reads the
//                    log): the Director's use_object, or a Use button on the host's or the player's screen
// if (all must hold; one string or a list; "not " in front turns one round):
//   from <place>, visited <place>, down <who>, standing <who>, quest <id>, passed <x>, failed <x>, fight, no fight,
//   carries <item> (the character who used the object; for other moments, anyone in the party; a gear id or name)
// do:
//   fight    a fight starts here     flee     `who` (or `target`) flees     reveal   `who` (or everyone hidden here)
//   calm     `who` (or `target`) stops fighting: out of the fight, not beaten (the Tidewarden when the bell rings)
//   tick     clock `clock` fills by `by` (1)      quest    quest `quest` is done      xp    each character earns `xp`
//   add      `count` (1) of bestiary creature `creature` arrive here (hidden: `hidden`)
//   give     `item` (a gear id from the module, or any thing's name) goes to the character who used the object
//            (for other moments, the first character standing)
//   say      only the line in `say`, for the Director (any rule may carry `say`)

export const EVENTS = ['enter', 'fail', 'succeed', 'round', 'down', 'cleared', 'full', 'quest', 'use'];
export const STATES = ['down', 'cleared', 'full', 'quest'];
export const EFFECTS = ['fight', 'flee', 'calm', 'reveal', 'tick', 'quest', 'xp', 'add', 'give', 'say'];
export const CONDITIONS = ['from', 'visited', 'down', 'standing', 'quest', 'passed', 'failed', 'fight', 'no fight', 'carries'];
// A place's objects, by name ("Sea chest", or { name: 'Sea chest', about: '...' }).
export const objectsOf = (site) => ((site && site.objects) || []).map((o) => (typeof o === 'string' ? o : (o && o.name) || '')).filter(Boolean);
// The object a word means here: the same name, or one name inside the other ("chest" is the Sea chest).
export function objectNamed(names, w) {
  const t = words(w).toLowerCase();
  if (!t) return '';
  return names.find((n) => n.toLowerCase() === t) || names.find((n) => n.toLowerCase().includes(t) || t.includes(n.toLowerCase())) || '';
}

const words = (v) => String(v == null ? '' : v).replace(/[:_]+/g, ' ').replace(/\s+/g, ' ').trim();
export function parseWhen(v) {
  const w = words(v).toLowerCase();
  const [ev, ...rest] = w.split(' ');
  return { ev, arg: rest.join(' ') };
}
export function parseIf(v) {
  return (Array.isArray(v) ? v : v ? [v] : []).map((x) => {
    let w = words(x).toLowerCase();
    const not = /^not\s/.test(w);
    if (not) w = w.slice(4);
    if (w === 'fight' || w === 'no fight') return { k: w, arg: '', not };
    const [k, ...rest] = w.split(' ');
    return { k, arg: rest.join(' '), not };
  });
}
// Every rule that applies at a place: its own, then the adventure's.
export function rulesAt(adv, siteId) {
  const site = ((adv && adv.sites) || []).find((x) => x.id === siteId);
  const own = ((site && site.rules) || []).map((r, n) => ({ ...r, key: `${siteId}/${r.id || n}`, site: siteId }));
  const all = ((adv && adv.rules) || []).map((r, n) => ({ ...r, key: `*/${r.id || n}`, site: null }));
  return [...own, ...all].map((r) => ({ ...r, when: parseWhen(r.when), conds: parseIf(r.if), once: r.once === true || (r.once !== false && parseWhen(r.when).ev !== 'round') }));
}
// What is wrong with an adventure's rules, in plain words.
export function checkRules(mod, adv) {
  const errors = [];
  const sites = adv.sites || [];
  const ids = new Set(sites.map((x) => x.id));
  const clocks = new Set((adv.clocks || []).map((c) => c.id));
  const quests = new Set((adv.quests || []).map((q) => q.id));
  const stats = new Set([...Object.keys(mod.ix.stat || {}), ...Object.keys(mod.ix.skill || {})]);
  const lists = [...sites.map((s) => [s.id, s.rules || []]), ['the adventure', adv.rules || []]];
  // Who a rule names: a bestiary id or a creature's name, as placed here ("Glass eel", "k72 Drowned choir").
  const beasts = Object.values(mod.ix.creature || {});
  const knows = (w) => { const t = words(w).toLowerCase().replace(/^k\d+\s+/, ''); return !t || beasts.some((c) => c.id === t || String(c.name || '').toLowerCase() === t)
    || sites.some((st) => (st.creatures || []).some((c) => c.id === t || String(c.name || '').toLowerCase() === t)); };
  for (const [where, rules] of lists) {
    rules.forEach((r, n) => {
      const at = `${where}: rule ${r.id || n + 1}`;
      const w = parseWhen(r.when);
      if (!EVENTS.includes(w.ev)) errors.push(`${at}: "${r.when}" is not a moment the Engine knows (${EVENTS.join(', ')}).`);
      if ((w.ev === 'fail' || w.ev === 'succeed') && w.arg && !stats.has(w.arg)) errors.push(`${at}: "${w.arg}" is not a stat or skill of this game.`);
      if (w.ev === 'full' && !clocks.has(w.arg)) errors.push(`${at}: there is no clock "${w.arg}".`);
      if (w.ev === 'quest' && !quests.has(w.arg)) errors.push(`${at}: there is no quest "${w.arg}".`);
      if (w.ev === 'down' && !r.who) errors.push(`${at}: say who is down ("who").`);
      if (!EFFECTS.includes(r.do)) errors.push(`${at}: "do: ${r.do}" is not something the Engine does (${EFFECTS.join(', ')}).`);
      if (r.do === 'tick' && !clocks.has(r.clock)) errors.push(`${at}: there is no clock "${r.clock}" to tick.`);
      if (r.do === 'quest' && !quests.has(r.quest)) errors.push(`${at}: there is no quest "${r.quest}".`);
      if (r.do === 'add' && !(mod.ix.creature || {})[r.creature]) errors.push(`${at}: there is no creature "${r.creature}" in the bestiary.`);
      for (const k of ['who', 'target']) if (r[k] && !knows(r[k])) errors.push(`${at}: there is no creature "${r[k]}" in this adventure or the bestiary.`);
      if (r.do === 'say' && !r.say) errors.push(`${at}: write the line to say.`);
      if (r.do === 'give' && !r.item) errors.push(`${at}: say what is given (item: 'Brass key').`);
      if (w.ev === 'use') {
        const site = sites.find((x) => x.id === where);
        const objs = site ? objectsOf(site) : sites.flatMap(objectsOf);
        if (!w.arg) errors.push(`${at}: say which object ("use sea chest").`);
        else if (!objectNamed(objs, w.arg)) errors.push(`${at}: no object here is called "${w.arg}" (objects: ${objs.join(', ') || 'none: list them in the place\'s "objects"'}).`);
      }
      for (const c of parseIf(r.if)) {
        if (!CONDITIONS.includes(c.k)) errors.push(`${at}: "if ${c.k}" is not a condition the Engine knows (${CONDITIONS.join(', ')}).`);
        if ((c.k === 'from' || c.k === 'visited') && !ids.has(c.arg)) errors.push(`${at}: there is no place "${c.arg}".`);
        if (c.k === 'carries' && !c.arg) errors.push(`${at}: name the thing carried ("carries brass key").`);
      }
    });
  }
  return errors;
}
// One line in words, for the Director's briefing and the host's screen.
export function ruleWords(r) {
  const when = { enter: 'when the party arrives', fail: `when a ${r.when.arg || ''} roll fails`, succeed: `when a ${r.when.arg || ''} roll succeeds`, round: 'each new round', down: `when ${r.who} is down`, cleared: 'when nothing here is left standing', full: `when ${r.when.arg} fills`, quest: `when ${r.when.arg} is done`, use: `when someone uses the ${r.when.arg}` }[r.when.ev] || r.when.ev;
  const did = { fight: 'a fight starts', calm: `${r.target || r.who} stops fighting`, flee: `${r.target || r.who} flees`, reveal: `${r.target || r.who || 'whatever hides here'} is revealed`, tick: `${r.clock} ticks`, quest: `${r.quest} is done`, xp: `each earns ${r.xp}`, add: `${r.count || 1} ${r.creature} arrive`, give: `${r.item} goes to ${r.when.ev === 'use' ? 'whoever used it' : 'the party'}`, say: 'the Director is told' }[r.do] || r.do;
  return `${when}${r.conds.length ? ` (if ${r.conds.map((c) => `${c.not ? 'not ' : ''}${c.k}${c.arg ? ` ${c.arg}` : ''}`).join(', ')})` : ''}: ${did}${r.say ? `. "${r.say}"` : ''}`;
}
