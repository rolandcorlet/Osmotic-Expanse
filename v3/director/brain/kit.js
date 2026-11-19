// v3: the Director's kit, turned into briefing lines. This is where the human Director's skills
// (v3/plan/01-DIRECTOR-SKILLS.md) reach the model each turn: how the scene opens, who is here and
// what they want, what is still worth finding out, what failure may cost, who has been quiet, and
// what to do when the table stalls. It never states a number: the Engine owns those.

const QUIET_SAYS = 4; // this many player lines at one site with nothing learned and no fight = stalled

export function tableRead(state, siteId, firstSite = null) {
  const story = state.story || [];
  const since = (state.kit || {}).progressSeq || 0;
  const here = story.filter((e) => e.site === siteId);
  const arrived = here.length ? here[0].seq : 0;
  const says = here.filter((e) => e.kind === 'say' && e.orgId && e.seq > Math.max(since, arrived));
  const recent = story.filter((e) => e.kind === 'say' && e.orgId).slice(-8);
  const seated = Object.values(state.organisms || {}).filter((o) => o.playerId);
  const quiet = seated.length > 1 && recent.length >= 4 ? seated.filter((o) => !recent.some((e) => e.orgId === o.id)) : [];
  // The turn that travels ends on one line about the road, recorded at the new site: the arrival
  // proper is the narration after it (bench 16 Nov: three of four later sites never got their opening).
  const narr = here.filter((e) => e.kind === 'narration');
  const first = firstSite || ((state.story || []).length ? (state.story[0].site || siteId) : siteId);
  const firstVisit = narr.length === 0 || (siteId !== first && narr.length === 1);
  // The same closing question three times running (bench 16 Nov: "throw and haul, or climb on?" nine times).
  const ask = (t) => askWords(t, state);
  const same = alike;
  // Another question in between does not reset it: three alike among the last five is a loop.
  const lastQ = narr.slice(-5).map((e) => ask(e.text));
  const looping = !state.fight && lastQ.length >= 3 && lastQ.slice(0, -1).filter((q) => same(lastQ[lastQ.length - 1], q)).length >= 2;
  return { stalled: !state.fight && says.length >= QUIET_SAYS, says: says.length, quiet, firstVisit, looping };
}

export function kitBriefing(state, scenario, site) {
  const kit = scenario.kit;
  if (!kit) return [];
  const k = kit.sites[site.id];
  const found = (state.kit || {}).found || {};
  const L = [];
  const read = tableRead(state, site.id, scenario.sites[0].id);
  L.push('');
  L.push('## HOW TO RUN THIS SCENE (for you alone: never read these lines out)');
  if (k) {
    if (read.firstVisit) L.push(`OPEN WITH THIS, in your own words, then stop and ask: ${k.start}`);
    L.push(`The question this scene answers: ${k.question} When it is answered, close the scene and move on.`);
    // Senses set the scene once (Roly, 19 Nov: the taint was described in every reply). After the
    // arrival they come back only when something changes them, in a few words.
    const saidHere = (state.story || []).filter((e) => e.kind === 'narration' && e.site === site.id).length;
    if (!saidHere) L.push(`Sense details for your arrival (two or three, never all): ${k.senses.join('; ')}.`);
    else L.push(`The senses here are already set: do NOT describe the water, its taste or the taint again. Only if something changes it (a wound opened, a fight, a Clock moving, an arrival) or a player tests it, give the change in a few words, for example "the taint turns a little coppery". What this place can change into: ${k.senses.join('; ')}.`);
    L.push('People here. Play each as a person who acts on their want:');
    for (const p of k.people) {
      const st = ((state.kit || {}).people || {})[`${site.id}/${p.id}`];
      if (st) { L.push(`- ${p.name}: ${st.state === 'dead' ? 'DEAD' : st.state === 'fled' ? 'FLED' : st.state === 'yields' ? 'HAS YIELDED' : 'WAS STRUCK AT'} (by ${st.by}). They offer nothing and tell nothing more. Everyone who saw it remembers. Do not bring them back as before.`); continue; }
      const knows = p.knows.filter((id) => !found[id]);
      L.push(`- ${p.name}. Wants: ${p.want}. Fears: ${p.fear}. Voice: ${p.voice}${p.trade ? ` Offers: ${p.trade}` : ''}${p.wont ? ` Never: ${p.wont}` : ''}${p.block ? '' : p.beyond ? ' Cannot be hurt by the Cohort.' : ' Not a combatant: if a player attacks them, say the cost first, then strike_bystander.'}${knows.length ? ` Can tell the Cohort: ${knows.join(', ')}.` : ''}`);
    }
    L.push('Likely things players try, and the ruling. Anything else they think of is welcome: rule it the same way.');
    for (const a of k.approaches) L.push(`- "${a.say}": ${a.ruling}`);
    L.push(`When a roll fails, the situation changes. Pick a cost that fits: ${k.costs.join('; ')}. Never "nothing happens".`);
    L.push('Dangers. Show the tell before the strike ever lands:');
    for (const t of k.threats) L.push(`- ${t.what}. Tell: ${t.tell}. Strike: ${t.strike}.`);
    const seats = Object.values(state.organisms || {}).filter((o) => o.playerId);
    const moments = seats.map((o) => (k.moments[o.id] ? `${o.name}: ${k.moments[o.id]}` : '')).filter(Boolean);
    if (moments.length) L.push(`A moment for each organism at this site (offer it once, when it fits): ${moments.join(' | ')}`);
  }
  L.push('The Cohort is HERE and can only see, taste and test what is here. If a player asks about somewhere else (a room further in, the thing at the end), say they cannot tell from here and what they would have to do to find out. Never describe, rule on or decide facts about another site from this one.');
  for (const [id, f] of Object.entries(state.fills || {})) {
    const ev = ((scenario.rules || {}).onFull || {})[id];
    if (!ev) continue;
    const told = (state.story || []).some((e) => e.kind === 'narration' && e.seq > f.seq);
    L.push(`${id} IS FULL: ${ev.name.toUpperCase()}${told ? ' is under way.' : ' HAS JUST BEGUN. Tell the table now, in the fiction, before anything else:'} ${ev.says} This has already been paid: change no number yourself.${site.id === 'soft-field' ? ' Here in the Soft Field the swarms come to strip the cut: bring the creatures printed for it.' : ''}`);
  }
  const hidden = kit.secrets.filter((s) => !found[s.id]);
  if (hidden.length) {
    L.push('');
    L.push('## SECRETS THE COHORT HAS NOT LEARNED YET');
    L.push('Give one whenever a player looks, asks or pokes in a way that could find it. When you tell them, call reveal_secret with its id in the same turn.');
    for (const s of hidden) {
      const here = s.leads.filter((l) => l.site === site.id).map((l) => l.how);
      L.push(`- ${s.id}${s.must ? ' (they need this)' : ''}: ${s.text}${here.length ? ` Here: ${here.join(' Or: ')}` : ''}`);
    }
  }
  const known = kit.secrets.filter((s) => found[s.id]);
  if (known.length) L.push(`Already known to the Cohort (do not re-reveal; build on it): ${known.map((s) => s.id).join(', ')}.`);
  if (read.stalled && k) {
    L.push('');
    L.push(`THE TABLE HAS STALLED (${read.says} player lines here with nothing new). Do not wait. Make the world move with one of these, then ask: ${k.leads.join(' | ')}`);
  }
  if (read.looping) {
    L.push('');
    L.push('YOU HAVE PUT THE SAME QUESTION TO THE TABLE THREE TIMES. Do not ask it again. Decide it now: the world acts without them (the danger lands, or the chance passes, once and for good), say plainly what happened and that it is over, then turn to a different organism with something new. Never describe that moment as still hanging afterwards.');
  }
  if (read.quiet.length) L.push(`${read.quiet.map((o) => o.name).join(' and ')} ${read.quiet.length > 1 ? 'have' : 'has'} not had the floor lately. If it is not somebody else's turn in a fight, turn the scene toward them and ask them the question.`);
  return L;
}

// When the model keeps putting the same question (bench 16 Nov: "do you sign?" eight times, with the
// warning in front of it), the Engine closes it: the repeated question is taken off the reply, the
// chance is said to have passed, and the floor goes to somebody who was not being asked.
// What a closing question is about: its content words, without filler or the names of the Cohort.
// Bench 16 Nov: "Do you sign?" / "do you sign, or do you walk?" slipped past a rule that wanted three
// long words. "What do you do?" has no content words, so the stock handover is never a loop.
const FILLER = new Set('what do you does did the a an and or to of in on at is are it its this that with for now then still your yours his her their them they there here how who which will would can could should not but as be been by from into up down out go going get take make put have has had want mean say tell one two all any some more first before after while again back yourself'.split(' '));
function askWords(t, state) {
  const m = String(t || '').match(/[^.!?\n]*\?\s*$/);
  const names = new Set(Object.values((state || {}).organisms || {}).flatMap((o) => String(o.name).toLowerCase().split(/[^a-z]+/)));
  return new Set(((m ? m[0] : '').toLowerCase().match(/[a-z]{3,}/g) || []).filter((w) => !FILLER.has(w) && !names.has(w)));
}
function alike(x, y) {
  if (!x.size || !y.size) return false;
  let n = 0;
  for (const w of x) if (y.has(w)) n += 1;
  return n >= 1 && n / Math.min(x.size, y.size) >= 0.5;
}
export function breakLoop(text, state, siteId) {
  if (state.fight) return '';
  const prev = (state.story || []).filter((e) => e.site === siteId && e.kind === 'narration').slice(-4).map((e) => askWords(e.text, state));
  const cur = askWords(text, state);
  if (prev.filter((q) => alike(cur, q)).length < 2) return '';
  const body = String(text).replace(/[^.!?\n]*\?\s*$/, '').trim();
  const asked = (String(text).match(/[^.!?\n]*\?\s*$/) || [''])[0].toLowerCase();
  const seats = Object.values(state.organisms || {}).filter((o) => o.playerId);
  const first = (o) => String(o.name).split(/\s+/)[0];
  const says = (state.story || []).filter((e) => e.kind === 'say' && e.orgId);
  const lastSpoke = (o) => { for (let i = says.length - 1; i >= 0; i--) if (says[i].orgId === o.id) return i; return -1; };
  const others = seats.filter((o) => !asked.includes(first(o).toLowerCase())).sort((a, b) => lastSpoke(a) - lastSpoke(b));
  const next = others[0] || seats[0];
  if (!next) return '';
  return `${body}${body ? '\n\n' : ''}Nobody answers, and the moment passes: that choice is no longer on offer. ${first(next)}, what do you do?`;
}
