// A bench script written from the adventure itself, so a new campaign needs no hand-written script:
// walk its places from the start along the exits, and at each place say what players say there.
//   - the way in ("We take the Mill Road north…"), expecting the party to move;
//   - a probe for each of up to two of its checks ("I watch Reeve Wren closely. Is he hiding
//     something?"), expecting a roll (soft: a passive score is fine);
//   - a word with someone who is there;
//   - a fight with the place's monsters ("I attack the nearest Goblin scout!"), then the fight itself;
//   - searching the place after the fight, and finishing a quest that ends there.
// What the bench checks is the outcome (the party moved on, a fight started, a quest was finished),
// however the Director got there, and a step the world has made impossible is not checked.
//
//   generateScript(adventure, { places: 6, heroes: 2 }) -> [{ start }, { pid, say, expect, at }, { fight: siteId }, ...]
// Browser-safe, no state.

const SAY = {
  perception: (n) => `I keep my eyes open as we go. Is anything watching us${n ? ` here at ${n}` : ''}?`,
  insight: (n, who) => (who ? `I watch ${who} closely while we talk. Are they hiding something?` : 'I watch everyone here closely. Is someone hiding something?'),
  investigation: () => 'I search the place carefully for anything hidden.',
  survival: () => 'I look for tracks and the safest way through.',
  stealth: () => 'I creep forward as quietly as I can.',
  athletics: () => 'I try to climb up and over, the hard way.',
  acrobatics: () => 'I try to keep my balance and get across.',
  medicine: () => 'I look closely at the bodies. How did they die?',
  religion: () => 'I study the symbols here. What god do they belong to?',
  history: () => 'Do I know anything about the history of this place?',
  arcana: () => 'I study the strange magic here. What is it?',
  persuasion: (n, who) => (who ? `I try to talk ${who} round to helping us.` : 'I try to talk them round to helping us.'),
  deception: (n, who) => (who ? `I lie to ${who}: we were sent by their boss.` : 'I tell them we were sent by their boss.'),
  intimidation: (n, who) => (who ? `I lean in and tell ${who} to talk, or else.` : 'I tell them to talk, or else.'),
};
const PREFER = ['perception', 'insight', 'investigation', 'stealth', 'medicine', 'survival', 'religion', 'athletics', 'persuasion', 'history', 'arcana', 'acrobatics', 'deception', 'intimidation'];
const first = (name) => { const n = String(name || '').replace(/^(?:Reeve|Brother|Sister|Father|Mother|Captain|Bailiff|Lady|Lord|Thane|Archmage|Caravan Master|Old)\s+/i, ''); const w = n.split(/\s+/)[0]; return w.includes('-') ? n : w; };

export function generateScript(adv, { places = 6, heroes = 2, route: how = 'walk' } = {}) {
  const sites = (adv && adv.sites) || [];
  if (!sites.length) return [];
  const byId = Object.fromEntries(sites.map((s) => [s.id, s]));
  const quests = ((adv && adv.quests) || []).map((q) => String(q).toLowerCase());
  const pids = Array.from({ length: Math.max(1, heroes) }, (_, n) => `p${n + 1}`);
  let turn = 0;
  const who = () => pids[turn++ % pids.length];
  const out = [{ start: true, expect: [] }];
  // A walk from the start, depth first, with the way back when a branch ends (each hop a step).
  const seen = new Set();
  const route = [];
  (function walk(id, from) {
    if (seen.size >= places || seen.has(id)) return;
    seen.add(id);
    route.push({ id, from });
    for (const e of byId[id].exits || []) {
      if (seen.size >= places) break;
      if (!byId[e.to] || seen.has(e.to)) continue;
      walk(e.to, id);
      if (seen.size < places) route.push({ id, from: e.to, back: true });
    }
  })(sites[0].id, null);
  // --route quests: the shortest way from the start to each place a quest ends at, in the order the
  // adventure lists them (fetch the chalice, then hand it over), so the whole quest chain is played.
  if (how === 'quests') {
    const ends = ((adv && adv.questDone) || []).filter((qd) => quests.some((q) => q.includes(qd.match))).map((qd) => (qd.at || [])[0]).filter((id) => byId[id]);
    const path = (from, to) => {
      const prev = { [from]: null }; const q = [from];
      while (q.length) { const id = q.shift(); if (id === to) break; for (const e of byId[id].exits || []) if (byId[e.to] && !(e.to in prev)) { prev[e.to] = id; q.push(e.to); } }
      if (!(to in prev)) return [];
      const out = []; for (let id = to; id !== from; id = prev[id]) out.unshift(id);
      return out;
    };
    route.length = 0; seen.clear();
    let at = sites[0].id;
    route.push({ id: at, from: null }); seen.add(at);
    for (const end of ends) {
      for (const id of path(at, end)) { route.push({ id, from: at, back: seen.has(id) }); seen.add(id); at = id; }
    }
  }
  // The quests the party starts with, in the order the adventure lists them, and the places this walk reaches.
  const questDone = ((adv && adv.questDone) || []).filter((qd) => quests.some((q) => q.includes(qd.match)));
  const reached = new Set(route.map((h) => h.id));
  const done = new Set();
  const cut = (qd) => questDone.slice(0, questDone.indexOf(qd)).some((e) => (e.at || []).some((a) => !reached.has(a)));
  for (const [k, hop] of route.entries()) {
    const site = byId[hop.id];
    if (hop.from) {
      const exit = (byId[hop.from].exits || []).find((e) => e.to === hop.id);
      out.push({ pid: who(), say: `We ${hop.back ? 'head back' : 'go on'}: ${exit ? exit.label : `to ${site.name}`}.`, expect: ['move_party'], at: hop.from, gen: `arrive ${site.id}` });
    }
    if (hop.back) { questsHere(k, site); continue; }
    const npc = (site.npcs || [])[0];
    const foes = site.foes || [];
    // A place whose fight starts on arrival (an ambush): the fight comes first.
    const ambush = (site.rules || []).some((r) => /^(?:enter|arrive)/i.test(String(r.when || '')) && r.do === 'fight');
    const fight = () => {
      const target = foes.find((f) => (f.count || 1) > 1) || foes[0];
      const name = target.name || target.monster;
      out.push({ pid: pids[0], say: (target.count || 1) > 1 ? `Enough. I attack the nearest ${name}!` : `Enough. I attack ${name}!`, expect: ['start_combat'], at: site.id, gen: 'fight' });
      out.push({ fight: site.id });
      out.push({ pid: who(), say: 'We search the place and the fallen for anything useful.', expect: [], at: site.id, gen: 'search' });
    };
    if (foes.length && ambush) fight();
    const checks = PREFER.map((sk) => (site.checks || []).find((c) => c.skill === sk)).filter(Boolean).slice(0, 2);
    for (const c of checks) {
      const say = (SAY[c.skill] || (() => `I try my ${c.skill} here.`))(site.name, npc && first(npc.name));
      out.push({ pid: who(), say, expect: ['ask_for_roll'], at: site.id, gen: `check ${c.skill}` });
    }
    if (npc) out.push({ pid: who(), say: `I ask ${first(npc.name)} what they know about what is going on.`, expect: [], at: site.id, gen: 'talk' });
    // A place whose own rule calms its monsters on a check (X Marks the Spot's Legion patrols wave a party on
    // that talks its way past): the script takes that way, a roll, and does not attack (the Skeleton bench,
    // 27 Nov: Saltglass's bell, the same kind of rule, beaten twice by a script that only attacked).
    const calm = foes.length && !ambush ? (site.rules || []).find((r) => r.do === 'calm' && /^succeed\s+\S+/.test(String(r.when || ''))) : null;
    if (calm) {
      const skill = String(calm.when).split(/\s+/)[1];
      const name = (foes[0].name || foes[0].monster);
      out.push({ pid: pids[0], say: `We do not fight ${name}. I use my ${skill.replace(/^\w/, (c) => c.toUpperCase())} to get us past them.`, expect: ['ask_for_roll'], at: site.id, gen: `calm ${skill}` });
    } else if (foes.length && !ambush) fight();
    questsHere(k, site);
  }
  return out;
  // A quest that ends here (one the party starts with): finish it, once.
  function questsHere(k, site) {
    for (const qd of questDone) {
      if (done.has(qd)) continue;
      if (k === 0 || !(qd.at || []).includes(site.id)) continue;
      if (cut(qd)) continue; // an earlier quest's place is off this walk, so what this one hands over was never won
      if (k < route.length - 1 && (qd.at || []).some((a) => route.slice(k + 1).some((h) => h.id === a && !h.back))) continue; // a later stop finishes it
      out.push({ pid: who(), say: `We see it through: ${qd.when}.`, expect: ['complete_quest'], at: site.id, gen: `quest ${qd.match}` });
      done.add(qd);
    }
  }
}
