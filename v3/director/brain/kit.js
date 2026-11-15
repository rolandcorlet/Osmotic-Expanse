// v3: the Director's kit, turned into briefing lines. This is where the human Director's skills
// (v3/plan/01-DIRECTOR-SKILLS.md) reach the model each turn: how the scene opens, who is here and
// what they want, what is still worth finding out, what failure may cost, who has been quiet, and
// what to do when the table stalls. It never states a number: the Engine owns those.

const QUIET_SAYS = 4; // this many player lines at one site with nothing learned and no fight = stalled

export function tableRead(state, siteId) {
  const story = state.story || [];
  const since = (state.kit || {}).progressSeq || 0;
  const here = story.filter((e) => e.site === siteId);
  const arrived = here.length ? here[0].seq : 0;
  const says = here.filter((e) => e.kind === 'say' && e.orgId && e.seq > Math.max(since, arrived));
  const recent = story.filter((e) => e.kind === 'say' && e.orgId).slice(-8);
  const seated = Object.values(state.organisms || {}).filter((o) => o.playerId);
  const quiet = seated.length > 1 && recent.length >= 4 ? seated.filter((o) => !recent.some((e) => e.orgId === o.id)) : [];
  return { stalled: !state.fight && says.length >= QUIET_SAYS, says: says.length, quiet, firstVisit: !here.some((e) => e.kind === 'narration') };
}

export function kitBriefing(state, scenario, site) {
  const kit = scenario.kit;
  if (!kit) return [];
  const k = kit.sites[site.id];
  const found = (state.kit || {}).found || {};
  const L = [];
  const read = tableRead(state, site.id);
  L.push('');
  L.push('## HOW TO RUN THIS SCENE (for you alone: never read these lines out)');
  if (k) {
    if (read.firstVisit) L.push(`OPEN WITH THIS, in your own words, then stop and ask: ${k.start}`);
    L.push(`The question this scene answers: ${k.question} When it is answered, close the scene and move on.`);
    L.push(`Sense details to draw on (two or three a reply, never all): ${k.senses.join('; ')}.`);
    L.push('People here. Play each as a person who acts on their want:');
    for (const p of k.people) {
      const knows = p.knows.filter((id) => !found[id]);
      L.push(`- ${p.name}. Wants: ${p.want}. Fears: ${p.fear}. Voice: ${p.voice}${p.trade ? ` Offers: ${p.trade}` : ''}${p.wont ? ` Never: ${p.wont}` : ''}${knows.length ? ` Can tell the Cohort: ${knows.join(', ')}.` : ''}`);
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
  if (read.quiet.length) L.push(`${read.quiet.map((o) => o.name).join(' and ')} ${read.quiet.length > 1 ? 'have' : 'has'} not had the floor lately. If it is not somebody else's turn in a fight, turn the scene toward them and ask them the question.`);
  return L;
}
