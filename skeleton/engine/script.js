// A bench script written from an adventure, so any module's adventure can be benched with no hand-written
// script: walk its places from the start along the exits and say what players say there.
//   - the way in ("We go on to The Sunken Causeway."), expecting the party to move;
//   - a try at each hazard ("We push on through the Cold current."), expecting a roll (soft);
//   - a search for the place's clues, and a word with someone who is there;
//   - a fight with the creatures there ("Enough. We attack the Glass eel!"), expecting a fight, unless the
//     place is in `avoid` (a fight meant to be won another way: the bench leaves out those the simulation
//     says wipe the party);
//   - finishing a quest at the place it is done at (quest.doneAt), once the walk has been everywhere before.
//
//   generateScript(mod, adventure, { places: 6, heroes: 2 }) -> [{ start }, { pid, say, expect, at, to }, ...]
// Browser-safe, no state.
export function generateScript(mod, adv, { places = 6, heroes = 2, avoid = new Set() } = {}) {
  const sites = (adv && adv.sites) || [];
  if (!sites.length) return [];
  const byId = Object.fromEntries(sites.map((x) => [x.id, x]));
  const pids = Array.from({ length: Math.max(1, heroes) }, (_, n) => `p${n + 1}`);
  let turn = 0;
  const who = () => pids[turn++ % pids.length];
  const out = [{ start: true, expect: [] }];
  const seen = new Set();
  const route = [];
  (function walk(id, from) {
    if (seen.size >= places || seen.has(id) || !byId[id]) return;
    seen.add(id);
    route.push({ id, from });
    for (const e of byId[id].exits || []) {
      if (seen.size >= places) break;
      if (!byId[e] || seen.has(e)) continue;
      walk(e, id);
      if (seen.size < places) route.push({ id, from: e, back: true });
    }
  })(adv.start || sites[0].id, null);
  const creatureName = (c) => String(((mod.ix.creature || {})[c.id] || {}).name || c.name || c.id).replace(/^the\s+/i, '');
  const done = new Set();
  for (const [k, hop] of route.entries()) {
    const site = byId[hop.id];
    if (hop.from) out.push({ pid: who(), say: `We ${hop.back ? 'head back' : 'go on'} to ${site.name}.`, expect: ['move_party'], at: hop.from, to: site.id });
    if (hop.back) { questsHere(k, site); continue; }
    for (const h of (site.hazards || []).slice(0, 2)) out.push({ pid: who(), say: `We push on through the ${h.name.toLowerCase()}, carefully.`, expect: ['ask_for_roll'], at: site.id });
    if ((site.clues || []).length) out.push({ pid: who(), say: 'I search this place carefully for anything left behind.', expect: [], at: site.id });
    const npc = (site.npcs || [])[0];
    if (npc) out.push({ pid: who(), say: `I ask ${String(npc.name || npc).split(/\s+/)[0]} what is going on here.`, expect: [], at: site.id });
    const foes = (site.creatures || []).filter((c) => (mod.ix.creature || {})[c.id]);
    if (foes.length && !avoid.has(site.id)) out.push({ pid: pids[0], say: `Enough. We attack the ${creatureName(foes[0])}!`, expect: ['start_combat'], at: site.id });
    questsHere(k, site);
  }
  return out;
  // A quest done here (quest.doneAt), at the last visit the walk makes to that place.
  function questsHere(k, site) {
    for (const q of adv.quests || []) {
      if (k === 0 || done.has(q.id) || !(q.doneAt || []).includes(site.id)) continue;
      if (route.slice(k + 1).some((h) => (q.doneAt || []).includes(h.id))) continue; // a later visit finishes it
      out.push({ pid: who(), say: `We see it through: ${q.text.replace(/\.$/, '').replace(/^\w/, (c) => c.toLowerCase())}.`, expect: ['complete_quest'], at: site.id, quest: q.id });
      done.add(q.id);
    }
  }
}
