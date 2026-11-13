// One Director turn: brief the model from the Ledger, let it act through the
// tools on a sandbox copy, and hand back the proposed new Ledger with its
// narration. Nothing here touches the live table: the caller decides whether to
// commit the result (Auto) or show it to the host first (Co-pilot).

import { readFileSync } from 'node:fs';
import { TOOLS, toolbox, orgMT, printedPays, hazardSpec } from './tools.js';
import { hazardBudget } from '../engine/ledger.js';
import { ProviderError } from './net.js';
import * as R from '../engine/rules.js';

export const INSTRUCTIONS = readFileSync(new URL('./instructions.md', import.meta.url), 'utf8');
const MAX_STEPS = 10;

// ---- the briefing: everything the model may know, rebuilt from data every turn ----
export function briefing(state, scenario, bestiary, { reason = '', hostNote = '', chapters = [] } = {}) {
  const site = scenario.sites.find((x) => x.id === state.scene.siteId) || scenario.sites[0];
  const L = [];
  const h = site.host || {};
  L.push(`# SITE ${site.n} of ${scenario.sites.length}: ${site.name} (id ${site.id}) — ${site.short}`);
  L.push(`In the whale: ${site.inWhale}`);
  L.push(`What it is: ${site.where}`);
  L.push(`In front: ${site.front}`);
  L.push(`Fluid: tonic ${site.tonic}; viscosity ${site.visc}; flow ${site.flow}`);
  if (site.panelCloud) L.push(`Opening a panel here can cloud the water: the page prices it at ${site.panelCloud.overflow}+ Overflow on the throw that opens it, and then every contest in this scene costs ${Math.abs(site.panelCloud.dice)} extra dice. It is the place paying, so you never call it and you never move the number - say what the Cohort is seeing instead.`);
  if (state.scene && state.scene.cloud) L.push(`THE WATER HERE IS OPAQUE (${state.scene.cloud.why}): every contest in this scene is ${state.scene.cloud.dice} dice. Say what the Cohort is seeing - a lane gone milky, a shape only at the edge of the light - and let the dice come from the throw.`);
  L.push(`Zones: ${site.zones.map((z) => `${z.name}${z.band ? ` (${z.band})` : ''}${z.note ? `: ${z.note}` : ''}`).join(' | ')}`);
  L.push(`Exits: ${site.exits.join(' | ')}`);
  const near = scenario.sites.filter((x) => Math.abs(x.n - site.n) === 1).map((x) => `${x.name} = "${x.id}"`);
  L.push(`Reachable with change_site: ${near.join(', ')}`);
  if (site.harvest) L.push(`This site can be cut: ${site.harvest.what} — call \`harvest\` with no creature to cut the site itself. The grade depends on CARCASS, not on the roll.`);
  // The Soft Field can be carved; the wound mouth cannot. Saying only the positive left the Director
  // to try a site cut at the Toll-Vent, where nothing is printed to cut (bench run, 13 Nov 2026).
  else L.push(`Nothing at this site can be cut for yield: it prints no harvest. Here harvest is only ever for a destroyed creature, with its id. Do not call harvest with no creature, and do not look for a panel, a gland or a seam to carve.`);
  {
    // The Pays prose often names the per-creature harvest Codon; the Engine pays that itself,
    // and a Director reading the prose alone tries to award it (bench, 12 Nov 2026).
    const auto = Object.entries(site.harvestPays || {}).map(([b, p]) => `${p.codon} Codon for each harvested ${String(b).replace(/-/g, ' ')}`).filter((x) => x);
    if (auto.length) L.push(`Paid at the cut, to the whole Cohort: ${auto.join('; ')}. They go in by themselves the moment a harvest of that creature succeeds. Killing one pays nothing: the amount exists only once somebody cuts the body, and the cut itself does the paying. Never call award for these amounts, even though the Pays line names the same figure — award answers that it is refused, because it is not yours to give. You pay only what the Pays line prints that is NOT a harvest amount.`);
  }
  if (site.post) {
    const offer = (state.posts || {})[site.id];
    L.push('A Tally Post stands here: stamp_cut weighs, grades and stamps what the Cohort carries.');
    if (site.pricedChoice) L.push(offer ? `The post's priced choice was rolled (d12 = ${offer.roll}): the clerk offers "${offer.offer}". Price: ${offer.price}.` : 'The post\'s priced choice has not been rolled. When the Cohort reaches the post, call tally_post_offer before anything is stamped. Do not invent the clerk\'s offer.');
  } else {
    L.push('No Tally Post at this site: no scale, no weighing, no buyer, no priced choice. Do not call tally_post_offer or stamp_cut here: both are refused, and asking for one is how the Cohort learns the stamp is elsewhere.');
    const near = scenario.sites.filter((x) => x.post).sort((a, b) => Math.abs(a.n - site.n) - Math.abs(b.n - site.n))[0];
    if (near) L.push(`The nearest Tally Post is ${near.name} (site ${near.n} of ${scenario.sites.length}).`);
    L.push('Say plainly that an unstamped cut is worth nothing outside until a weighing house takes it, grades it and stamps it.');
  }
  L.push('');
  L.push('## FOR YOU ALONE AT THIS SITE — none of this is said at the table');
  for (const [k, label] of [['play', 'Play'], ['danger', 'Danger'], ['wants', 'Wants'], ['weakness', 'Weakness'], ['hazard', 'Hazard'], ['pays', 'Pays'], ['tells', 'Tells'], ['lesson', 'Lesson']]) {
    if (h[k]) L.push(`${label}: ${h[k]}`);
  }
  // Where the page prices a condition beside the damage ("Effect: 6 Kinetic, Jostled, 1 band shift to
  // all in the chamber"), the firing pays it. Bench 13 Nov: the Director set Jostled one body at a
  // time, and the second firing left it off everyone with no flag to say so (13nov_am run 3, line 498).
  // This line is deliberately said in table words: run 1's leak was the Director echoing our own
  // phrasing back to the players.
  const hz = hazardSpec(site);
  if (hz.bands) {
    L.push(`THE HAZARD HERE ALSO THROWS EVERYBODY OUTWARD ${hz.bands} BAND${hz.bands > 1 ? 'S' : ''}: the same firing moves every body at this site one step away from it, so you never call a band shift yourself, and never describe anyone as thrown before it has gone off. Say what it feels like - thrown clear, the wall coming up under you, the lane turning over.`);
  }
  if (hz.conditions.length) {
    L.push(`THE HAZARD HERE ALSO PRICES ${hz.conditions.join(', ').toUpperCase()}: hazard_damage puts it on every body at the site in the same firing, so you never set it yourself and never pay for it twice. Where it costs something in the fiction, say what it feels like. And never describe anyone as ${hz.conditions.join(', ')} before the firing has happened.`);
  }
  // A hazard the Engine has already paid for in this Cycle or scene, so the Director stops trying
  // to go off with it again (bench 13 Nov: the same gas pocket was called once per player).
  const budget = hazardBudget(state, site.id);
  if (!budget.open) {
    const spec = hazardSpec(site);
    L.push(`THE HAZARD HERE HAS ALREADY GONE OFF: hazard_damage is refused until ${budget.until}. Say what the Cohort did to it and move on: never describe it going off a second time, and never describe harm that nothing paid for on this turn.${spec.area ? ' That hazard is an area one: one call already paid every body at this site.' : ''}`);
  }
  if ((site.encounter || []).length) {
    L.push('');
    L.push('## Creatures printed for this site (bring_creatures uses these block ids)');
    for (const e of site.encounter) {
      const b = bestiary[e.blockId];
      if (!b) continue;
      L.push(`- ${e.count} x ${b.name} (block "${b.id}"): ${b.statLine}`);
      if (b.traits) L.push(`  Traits: ${b.traits}`);
      for (const sp of b.special || []) L.push(`  ${sp}`);
      if (b.weakness) L.push(`  Weakness: ${b.weakness}`);
      if (b.tactics) L.push(`  Tactics: ${b.tactics}`);
    }
  }

  L.push('');
  L.push('# THE COHORT (organisms in play)');
  const orgs = Object.values(state.organisms).filter((o) => o.playerId);
  if (!orgs.length) L.push('Nobody has joined yet.');
  for (const o of orgs) {
    const paths = Object.entries(o.pathways).map(([n, r]) => `${n} ${r}`).join(', ');
    const weps = o.weapons.filter((w) => w.carried !== false).map((w) => `${w.name} (${w.type}, ${w.props.join('/')})`).join(', ');
    L.push(`- ${o.name} (id "${o.id}", ${o.hand}, ${o.phenotype}; played by ${(state.players[o.playerId] || {}).name || '?'})`);
    L.push(`  Baselines VSC ${o.base.VSC} DFF ${o.base.DFF} RTC ${o.base.RTC} OSM ${o.base.OSM} AFF ${o.base.AFF} | Pathways: ${paths}`);
    L.push(`  MI ${o.mi}/${o.miMax} | ATP ${o.atp}/${o.atpMax} | Stress ${o.stress} (${R.stressNote(o.stress)}) | MT ${orgMT(o)} | soak ${o.soak} | Lysis boxes ${o.countdown}/${o.countdownMax}${o.dormant ? ' | DORMANT' : ''}`);
    L.push(`  Carries: ${weps || 'nothing'}; ${o.kit.join('; ')} | Substrate ${o.substrate} S | Codon ${o.codon}${o.oath != null ? ` | Oath boxes ${o.oath}/${o.oathMax}` : ''}${o.conditions.length ? ` | Conditions: ${o.conditions.map((c) => c.name).join(', ')}` : ''}`);
    L.push(`  Tie: ${o.tie}`);
    { const g = (x) => ['C', 'G', 'P', 'T'].filter((k) => x && x[k]).map((k) => `${x[k]} ${k}`).join(', ') || 'none'; if (o.bulk || o.specimens || o.stamped) L.push(`  Specimens unstamped: ${g(o.specimens)}; stamped: ${g(o.stamped)}; Bulk carried ${o.bulk || 0} of ${(o.base.VSC || 0) * 5}`); }
    for (const v of o.oaths || []) L.push(`  Oath ${v.open ? 'OPEN' : (v.kept ? 'kept' : 'BROKEN')} (id "${v.id}"): "${v.promise}"${v.witness ? ` (witnessed by ${v.witness})` : ''}`);
  }

  {
    const open = [];
    for (const o of Object.values(state.organisms)) for (const v of (o.oaths || [])) if (v.open) open.push(`${o.name} ("${v.promise}", id "${v.id}")`);
    if (open.length) {
      L.push('');
      L.push(`# OATHS STILL OPEN: ${open.join('; ')}`);
      L.push('An Oath is a promise the table is owed an answer to. When the promise is met, settle it kept; when the Cohort walks away from it, settle it broken. Do not let the Cohort leave this site with an Oath hanging: settle it with settle_oath, or say in the scene what is still owed. Keeping one pays Cohesion; breaking one marks two Lysis boxes and a scar, and the witness drops a rung. Oath-breaking is a plot, not a punishment: play the consequence, do not scold.');
    }
  }

  L.push('');
  L.push('# CREATURES IN THE SCENE');
  const here = Object.values(state.creatures).filter((c) => c.siteId === site.id);
  if (!here.length) L.push('None are present yet.');
  for (const c of here) {
    const health = c.segments != null ? `Segments ${c.segments}/${c.segMax}` : `MI ${c.mi}/${c.miMax}`;
    if (c.down) { L.push(`- ${c.name} (id "${c.cid}"): DESTROYED. It is out of the scene: it cannot act, block the way or be struck. Describe it only as wreckage. ${c.harvested ? 'Already harvested.' : 'Not yet harvested: an organism may call `harvest` with its id.'}`); continue; }
    if (c.stoodDown) { L.push(`- ${c.name} (id "${c.cid}"): STOOD DOWN (${c.stoodDown.why}). It is present but not fighting: it takes no turns and does not block the way. If a player strikes it, it rejoins the fight.`); continue; }
    L.push(`- ${c.name} (id "${c.cid}", block ${c.blockId}): ${health}; band ${c.band}${c.conditions.length ? `; ${c.conditions.map((x) => x.name).join(', ')}` : ''}`);
  }
  const downNow = here.filter((c) => c.down);
  if (downNow.length && !here.some((c) => !c.down && !c.stoodDown) && !here.some((c) => c.stoodDown)) L.push('Every creature here is destroyed. Do not describe any of them as alive, standing or holding a line.');

  {
    // The Danger line names what lives here; only what has been brought in can act.
    const inScene = new Set(here.map((c) => String(c.blockId || c.block || '').toLowerCase()));
    const danger = String((site.host || {}).danger || '');
    const named = Object.entries(bestiary || {})
      .filter(([id, b]) => b && b.name && danger.includes(b.name) && !inScene.has(String(id).toLowerCase()))
      .map(([, b]) => b.name);
    if (named.length) {
      L.push(`PRINTED HERE BUT NOT YET IN THE SCENE: ${named.join(', ')}. They ARE at this site: the page puts them here, so never tell a player they are not. They are simply not in the scene yet, so they cannot act, block or be struck until you bring them in. The moment the fiction reaches one (a player looks for it, asks about it, approaches it, or attacks it), call bring_creatures first, then describe it. A player who attacks one starts the Pulse War: bring it in, then start_pulse_war.`);
    }
  }

  L.push('');
  const cutnow = here.filter((c) => c.down && !c.harvested).map((c) => c.name);
  if (cutnow.length) L.push(`Can be harvested now (destroyed, not yet cut): ${cutnow.join(', ')}. Nothing else can: a creature that is still up, or that has stood down, cannot be harvested.`);

  {
    // Sharing out the harvest: the players decide, one Specimen at a time.
    const Lt = state.loot || {};
    if (Lt.queue && Lt.queue.length && Lt.offer) {
      const item = Lt.queue.find((x) => x.id === Lt.offer.itemId) || Lt.queue[0];
      const name = (id) => (state.organisms[id] || {}).name || id;
      L.push(`# SHARING OUT THE HARVEST: ${name(Lt.offer.orgId)} is choosing whether to take a ${item.grade} Specimen from ${item.from}; ${Lt.queue.length - 1} more after it. Picking order: ${Lt.order.map(name).join(', ')}.`);
      L.push('The players take or pass on their own screens, and whoever is offered goes to the back of the order either way. Never choose for them, and never say who got what: it is written down as they pick, and the players see it on their own screens.');
      L.push('');
    } else if ((Lt.order || []).length > 1) {
      L.push(`Picking order for the next harvest: ${Lt.order.map((id) => (state.organisms[id] || {}).name || id).join(', ')}.`);
      L.push('');
    }
  }
  const paidHere = (state.paid || []).filter((p) => p.site === site.id);
  if (paidHere.length) {
    const byWhy = {};
    for (const p of paidHere) (byWhy[p.why] = byWhy[p.why] || []).push((state.organisms[p.org] || {}).name || p.org);
    L.push(`# ALREADY PAID AT THIS SITE (do not pay these again): ${Object.entries(byWhy).map(([w, who]) => `"${w}" to ${who.join(' and ')}`).join('; ')}`);
    L.push('');
  }
  {
    // What the page pays here and nobody has been given yet. Saying a reward in the narration
    // is not paying it: the Ledger only changes when award is called.
    const printed = printedPays(site);
    const gotC = new Set(paidHere.map((p) => p.codon).filter(Boolean));
    const owed = printed.codon.filter((n) => !gotC.has(n));
    if (owed.length) {
      L.push(`# PRINTED AND NOT YET PAID AT THIS SITE: ${owed.map((n) => `${n} Codon`).join(', ')}. Read the Pays line for what each is for. When the Cohort has done that thing, call award with the printed amount; do not say a reward out loud without paying it, and do not invent an amount.`);
      L.push('');
    }
  }
  L.push(`# CLOCKS (the players can see these): ${Object.values(state.clocks).map((c) => `${c.name} ${c.filled}/${c.segments}${c.aiAdvanced ? ' (already advanced this session)' : ''}`).join(' · ')}`);
  // What the Ledger already paid for, from the Vector's own trigger lists: the players saw these
  // lines, so the Director must not spend its one advance on the same Clock or narrate it again.
  const paid = (state.log || []).filter((e) => e.kind === 'clock').slice(-4);
  if (paid.length) L.push(`Clocks this site has already moved (the players were told): ${paid.map((e) => e.text).join(' | ')}`);
  L.push('CARCASS advances when a Beat passes with nothing shipped, a new panel is opened, a pump starts, or the Cohort rests; rewinds when a panel is salted or a chamber drained. TOLL advances when the Cohort is loud in the channels (a Pulse War) or refuses the law; rewinds when it produces paper (a toll chit, a stamp). HUNGER advances when a body is left unharvested or the Cohort fights loudly; rewinds when it harvests what it kills.');
  L.push('A panel opening is the site paying, not you: call `open_panel` the moment one comes loose, and it pays CARCASS for the first one in a scene. Never spend your own one advance on a panel, and do not call it twice in one scene.');

  L.push('');
  const f = state.fight;
  if (f) {
    L.push(`# PULSE WAR — Cycle ${f.cycle}`);
    for (const k of f.order) {
      const a = f.actors[k];
      const body = a.kind === 'org' ? state.organisms[a.id] : state.creatures[a.id];
      if (!body) continue;
      // What a creature can afford, worked out here so the Director does not try what the Engine will refuse.
      let can = '';
      if (a.kind === 'cre' && !body.down && !body.stoodDown) {
        const swarm = body.segments != null;
        const allowed = swarm ? Math.floor(body.segments / 2) : Infinity;
        if (swarm && allowed === 0) can = '; too few Segments left to Strike at all (it can only Drift or end its turn)';
        else if (a.status === 'acting') {
          const cost = swarm && a.strikes > 0 ? 0 : 2;
          const why = body.band === 'far' || body.band === 'loose' ? `it is at ${body.band} and must Drift closer first`
            : swarm && a.strikes >= allowed ? 'it has used its Strikes for this Cycle'
              : a.pp < cost ? `a Strike costs ${cost} and it has ${a.pp}` : '';
          can = why ? `; CANNOT Strike now (${why})` : '; can Strike now';
        }
      }
      L.push(`- ${body.name} (${a.kind === 'org' ? 'player' : 'creature'}): ${a.status}${a.status === 'acting' || a.status === 'holding' ? `, ${a.pp} Pulse Points left` : ''}${a.reserve ? ', holding a Reserve' : ''}${can}${f.turn === k ? '  <= ACTING NOW' : ''}`);
    }
    const cur = f.turn ? f.actors[f.turn] : null;
    L.push('Creature costs: a Strike 2 Pulse Points, a Drift 1, a Reserve 1. A creature with fewer Pulse Points left than an action costs cannot take it: end its turn instead. Count before you act: a Drift then a Strike needs 3.');
    const up = Object.values(state.creatures).filter((c) => c.siteId === state.scene.siteId && !c.down && !c.stoodDown);
    if (up.length) L.push(`Still fighting: ${up.map((c) => c.name).join(', ')}. While any of these is up you cannot end the Pulse War or change site: if a player wants to leave, say the creatures block the way and ask what they do. A creature that has yielded, fled or was never fighting does not belong in this list: use creature_stand_down for it, with the reason.`);
    if (cur && cur.kind === 'cre') L.push('It is a creature\'s turn: act for it now, then end its turn.');
    else if (cur) L.push('It is a player\'s turn: they act on their own screen. Do not act for any creature now — no creature_move, creature_strike, creature_special, creature_reserve. Creatures act only on their own turns. Narrate and ask.');
  } else {
    L.push('# NO PULSE WAR. Pulse Points do not exist right now: do not mention them. Nobody has a turn, so nothing acts on one: creature_move, creature_strike, creature_special and creature_reserve are all refused out of a fight. Say what a creature here is doing in the fiction - drifting in, tasting the water, holding a way - and open the Pulse War with start_pulse_war the moment someone commits to violence.');
  }

  L.push('');
  L.push('# ROLLS WAITING');
  if (!state.requests.length) L.push('None.');
  for (const q of state.requests) L.push(`- ${q.actor.name}: ${q.label} — ${q.pool.dice} dice against ${q.at ?? 'no Threshold'}${q.kind === 'incoming' ? ' (waiting on the target\'s reaction)' : ' (waiting for the player to roll)'}`);
  if (state.requests.length) {
    // The table was moving on past a throw that had not landed (Roly at the table, 12 Nov 2026).
    const waiting = [...new Set(state.requests.map((q) => ((q.kind === 'incoming' ? q.target : q.actor) || {}).name).filter((n) => n))];
    L.push(`# NOTHING HAS BEEN THROWN YET: ${waiting.join(' and ')} still has dice in the air. You do not know how it turns out, so nothing that throw decides has happened. Do not describe what follows it, do not offer the table a fresh choice, and do not put a question to another organism. Hold the beat on the throw: say only what hangs on it, and put your one question to ${waiting[0]} about that throw.`);
    if (state.fight) L.push('In a Pulse War nobody acts while a roll is waiting: not the other organisms, not the creatures.');
  }

  const rolls = state.rolls.filter((r) => r.kind !== 'frequency').slice(-3);
  if (rolls.length) {
    L.push('');
    L.push('# LATEST ROLLS (oldest first)');
    for (const r of rolls) {
      const res = r.source === 'baseline' ? 'no roll needed: passed on Baseline (no Overflow)'
        : r.at == null ? `dice ${r.dice.join(',')} total ${r.total}`
          : `dice ${r.dice.join(',')} = ${r.total} against ${r.at}: ${r.success ? `SUCCESS, Overflow ${r.overflow}` : `FAILED, short by ${r.shortBy}`}`;
      L.push(`- ${r.who} — ${r.label}: ${res}${r.runaway ? ' — RUNAWAY CATALYSIS (say so)' : ''}${r.stressMarked ? ` — marked ${r.stressMarked} Stress, now ${r.stressNow}` : ''}${r.damage != null && r.segments == null ? ` — ${r.damage} damage` : ''}${r.segments != null ? ` — ${r.segments} Segments removed` : ''}${r.harvest ? (r.harvest.got ? ` — harvested ${['C', 'G', 'P', 'T'].filter((k) => r.harvest.got[k]).map((k) => `${r.harvest.got[k]} ${k}`).join(', ')} (unstamped)` : ` — the cut was ruined: ${r.harvest.substrate} S instead`) : ''}${r.targetName ? (r.targetDown ? ` — ${r.targetName} is DESTROYED by this` : ` — ${r.targetName} is STILL UP after this: describe it hurt, never destroyed`) : ''}${r.kind === 'attack' && r.whoKind === 'org' && r.at != null && !r.success ? ' — a miss: the target is unharmed' : ''}`);
    }
  }

  L.push('');
  // ---- the table's memory: what happened before the last few lines, and who is who
  if (chapters.length) {
    L.push('# EARLIER IN THIS GAME (the chronicle, most recent last)');
    for (const ch of chapters) L.push(`- ${ch.site}${ch.why === 'night' ? ' (end of a night)' : ''}: ${ch.text}`);
    L.push('');
  }
  {
    const cards = Object.values(state.cast || {});
    if (cards.length) {
      const here = cards.filter((c) => c.siteId === site.id);
      const recent = cards.filter((c) => c.siteId !== site.id).sort((a, b) => b.lastSeq - a.lastSeq).slice(0, 6);
      const origin = { page: 'from the page', table: 'came up at the table', improvised: 'you made this up: it is canon now' };
      const line = (c) => `- ${c.name} (${c.kind}, first met at ${(scenario.sites.find((x) => x.id === c.siteId) || {}).name || c.siteId}; ${origin[c.origin] || c.origin}): ${c.facts.slice(-3).map((f) => `${f.text}${f.seen ? '' : ' [players not told]'}`).join('; ') || 'no facts yet'}`;
      L.push(`# PEOPLE, PLACES AND THREADS THE TABLE HAS MET (${cards.length} on record; keep them consistent)`);
      for (const c of here) L.push(line(c));
      if (recent.length) { if (here.length) L.push('From earlier:'); for (const c of recent) L.push(line(c)); }
      const rest = cards.length - here.length - recent.length;
      if (rest > 0) L.push(`${rest} more on record: use recall to look anyone up before you bring them back.`);
      L.push(state.improv === 'page'
        ? 'The host has kept this game on the page: do not bring anyone back from another site.'
        : 'You may bring these people and threads back in conversation and scene-dressing, at any site. They are people, not encounters: anything that fights still comes only from the creatures printed for this site.');
      L.push('');
    }
  }

  L.push('# THE STORY SO FAR (most recent last)');
  const story = (state.story || []).slice(-16);
  if (!story.length) L.push('Nothing yet. This is the opening: set the scene for the Cohort.');
  for (const e of story) L.push(`${e.kind === 'narration' ? 'DIRECTOR' : e.who.toUpperCase()}: ${e.text}`);
  const recent = state.log.slice(-8).filter((l) => ['act', 'hit', 'clock', 'scene', 'rest', 'award', 'danger'].includes(l.kind));
  if (recent.length) {
    L.push('');
    L.push('# WHAT JUST GOT PAID (the players saw these lines)');
    for (const l of recent) L.push(`- ${l.text}`);
  }

  const z = state.zero || {};
  if ((z.lines || []).length || z.tone) {
    L.push('');
    L.push('# SESSION ZERO (agreed by the table: this outranks the page)');
    if (z.tone) L.push(`The table's own words: ${z.tone}`);
    if ((z.lines || []).length) L.push(`Off the page, never put these in a scene, not even in passing: ${z.lines.join('; ')}. If the page calls for one, use something else and say nothing about why.`);
    L.push(`If a player says the pause word (${z.pauseWord || 'the pause word'}), stop at once: no narration, step back one sentence, and ask how they would like to go on.`);
  }

  L.push('');
  if (hostNote) L.push(`# NOTE FROM THE HOST (follow it): ${hostNote}`);
  L.push(`# YOUR MOVE${reason ? ` (${reason})` : ''}. If the world must change, make the calls that pay for it first, then narrate in plain text and end on one question.`);
  return L.join('\n');
}

// ---- checks on what the Director wrote, before anyone sees it --------------------
const NUM = '(?:\\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|zero|a single point)';
const NDICE = /\b(?:one|two|three|four|five|six|seven|eight|nine|ten|\d+) dice (?:against|to beat|at)\b/i;
// Any dice count at all, with no "against" after it: "the swarm rolls three dice". Inside a Pulse
// War that used to pass unflagged, which is the one number a player most wants leaned on. Ruling
// from Roly, 13 Nov 2026: the Director never says how many dice an attacking creature rolls.
const ANYDICE = /\b(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|\d+)\s+(?:dice|d6)\b/i;
// Pronouns get around "whoever is named nearest the number owns it": "it rolls four dice at you".
const CREATURE_ROLLS = /\b(?:it|they|its|their|the swarm|the creature)\b[^.?!]{0,24}\b(?:rolls?|throws?|comes with|swings?)\b[^.?!]{0,14}(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|\d+)\s+dice/i;
// Outside a fight the player sees their dice and Threshold on their own screen: the Director does not read them out.
const OUTSIDE_NUMBERS = /\b(?:one|two|three|four|five|six|seven|eight|nine|ten|\d+) dice\b|\bAT\s*\d+\b|\bThreshold (?:of )?\d+\b|\bagainst (?:a |an )?(?:\d+|twelve|fourteen|sixteen|eight)\b/i;
const HEALTH = new RegExp(`\\b(?:integrity|MI)\\b[^.?!]{0,30}\\b${NUM}\\b|\\b${NUM}\\b[^.?!]{0,12}\\b(?:Membrane )?(?:Integrity|MI)\\b`, 'i');

// moved: the Cohort changed site this turn, so the narration is one sentence of travel.
export function checkNarration(text, state, { moved = false, since = 0 } = {}) {
  const flags = [];
  // A creature's health in numbers ("its integrity drops to seven"). A player's own MI may be said.
  const kinds = [...new Set(Object.values(state.creatures || {}).map((c) => String(c.name).replace(/\s+[A-Z]$/, '').split(/\s+/).pop().toLowerCase()).filter((w) => w.length > 2))];
  const people = Object.values(state.organisms || {}).filter((o) => o.playerId).map((o) => String(o.name).split(/\s+/)[0].toLowerCase());
  // Whoever is named last before the number owns it: "bites Bresk, down to 34 MI" is Bresk's.
  const ownedByCreature = (sn, m) => {
    const before = sn.slice(0, m.index + m[0].length).toLowerCase();
    const last = (words) => Math.max(-1, ...words.map((w) => before.lastIndexOf(w)));
    return last(kinds) > last(people);
  };
  const creatureOwns = (sn) => {
    const m = sn.match(HEALTH);
    return !!m && ownedByCreature(sn, m);
  };
  const sentences = text.split(/(?<=[.?!])\s+/);
  if (kinds.length && sentences.some(creatureOwns)) {
    flags.push({ kind: 'leak', text: 'Gives a creature\'s Membrane Integrity as a number.' });
  }
  if (/\bBSP\b|\bMT\s*\d|\bsoak\s*\d|\bpool\s*\d|\b\d+d\b|\bSegments?\s+\d+\s*\/|\bstat[- ]block\b/i.test(text)
    // A creature's own numbers in words: "a pool of three dice", "its Membrane Threshold of 12".
    || /Membrane Threshold|\bpool of (?:\w+ )?dice\b/i.test(text)
    // "three dice against ...": a leak when it is a creature's dice, not when it is the player's own.
    || sentences.some((sn) => { const m = sn.match(NDICE); return m && ownedByCreature(sn, m); })
    // The bare count, with nothing after it: "the swarm rolls three dice", "it swings six dice".
    || CREATURE_ROLLS.test(text)
    || sentences.some((sn) => { const m = sn.match(ANYDICE); return m && ownedByCreature(sn, m); })) {
    flags.push({ kind: 'leak', text: 'May be reading out a creature\'s block or numbers.' });
  } else if (!state.fight && (NDICE.test(text) || OUTSIDE_NUMBERS.test(text))) {
    flags.push({ kind: 'style', text: 'Reads out dice counts outside a Pulse War.' });
  }
  // Roly, 13 Nov: "the page has nothing printed for that" is the sanctioned way to say no (see
  // instructions.md), so it is not a leak. Naming what does the arithmetic is. The Tally Post has a
  // physical ledger in the fiction, so "the Ledger" only leaks when it is doing Engine verbs.
  // A swarm's Segments are its health track — the block prints "MI 10 · soak 0 · pool 3d · Segments 6"
  // — so counting them out loud is the same leak as reading out MI, whether the count is the printed
  // one or an invented one. Called with Roly's delegation, 13 Nov, after the evening gate said "each
  // swarm is six small segments" and "two small bodies' worth of it left of what was a dozen" while the
  // Engine had removed 5 of 6. What stays legal is how the thing LOOKS: "a dozen small ones wearing a
  // slime coat" is the standing example in instructions.md, and "half of it peels away" names nothing.
  // The count has to belong to a creature, the same way the dice and MI checks decide whose number it
  // is: the page and the players talk about "four cut sections" of lipid all day, and flagging that is
  // a false leak that burns a rewrite and fails the run (found by reading the saved gate logs against
  // the regex, the same way the "the Ledger's room" false positive was found for the briefing sweep).
  const NUMW = 'one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|dozen|half|\\d+';
  const SEGMENTS = new RegExp(`\\b(?:${NUMW})(?:\\s+\\w+){0,2}\\s+(?:segments?|sections?)\\b|\\bsegments?\\s+\\d+\\s*\\/\\s*\\d+\\b`, 'i');
  const SEGMENTS_OF_CREATURE = new RegExp(`\\b(?:its|their)\\s+(?:${NUMW})\\s+(?:segments?|sections?)\\b|\\b(?:${NUMW})\\s+(?:segments?|sections?)\\s+of\\s+(?:it|them)\\b`, 'i');
  // Harvest prose uses the same word — "four cut sections", "the wreck lies in sections at Vash's feet"
  // — so an unnamed owner is not enough. If nothing in the sentence points at a person or at the cut,
  // and there is a creature in the scene, the count is the creature's ("They are small and many: six
  // slow segments apiece", straight out of the saved gate).
  const HARVEST_WORDS = /\b(cut|cuttable|cut-able|unstamped|stamped|specimen|specimens|weigh|scale|carry|carried|bulk|harvest|lipid|panel|panels|tissue|sheet|sheets|cradle|crate|crates|picking|picks|share|shared|pass|passed|screen|screens|wreck|wreckage|remains|scraps?|heaps?|harvested)\b/i;
  const segSentence = sentences.find((sn) => {
    // A Clock has segments too ("CARCASS ticks forward one segment"): that is the table's own count.
    if (/\b(?:CARCASS|TOLL|HUNGER)\b|\bClocks?\b/.test(sn)) return false;
    const m = sn.match(SEGMENTS);
    if (!m && !SEGMENTS_OF_CREATURE.test(sn)) return false;
    if (m && ownedByCreature(sn, m)) return true;
    if (SEGMENTS_OF_CREATURE.test(sn)) return true;
    const low = sn.toLowerCase();
    return kinds.length > 0 && !people.some((p) => low.includes(p)) && !HARVEST_WORDS.test(sn);
  });
  if (segSentence) flags.push({ kind: 'leak', text: 'Counts a swarm\'s Segments or sections, which is its health track.' });
  if (MACHINERY.test(text)) flags.push({ kind: 'leak', text: 'Mentions the machinery (notes, briefing, tools, the Engine, the Ledger).' });
  // Someone still has dice in the air: putting the next choice to a different organism moves the
  // whole table past a throw that has not landed yet (Roly at the table, 12 Nov 2026).
  const pend = (state.requests || []).map((rq) => (rq.kind === 'incoming' ? rq.target : rq.actor)).filter((a) => a && a.kind === 'org');
  // A clerk's question inside quotation marks is the fiction speaking, not the Director asking the table.
  const q = (text.replace(/"[^"]*"|“[^”]*”/g, ' ').match(/\?/g) || []).length;
  // With a throw in the air the table is already waiting on one screen, so a beat that only holds
  // ("nothing else moves until it lands") needs no question of its own.
  if (q === 0 && !moved && !pend.length) flags.push({ kind: 'style', text: 'Does not end on a question.' });
  if (q > 1) flags.push({ kind: 'style', text: `Asks ${q} questions; it should ask one.` });
  if (pend.length) {
    const first = (n) => String(n).split(/\s+/)[0];
    const firstName = (n) => first(n).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const waiters = pend.map((a) => first(a.name).toLowerCase());
    const lastQ = (text.match(/[^?]*\?/g) || []).pop() || '';
    const other = Object.values(state.organisms || {}).find((o) => o.playerId && !waiters.includes(first(o.name).toLowerCase()) && new RegExp(`\\b${firstName(o.name)}\\b`, 'i').test(lastQ));
    if (other) flags.push({ kind: 'style', text: `Puts a new question to ${other.name} while ${pend.map((a) => a.name).join(' and ')} still has a throw in the air.` });
  }
  // The same paragraph twice. Bench 14 Nov, run 3: a miss was narrated with the very words of the miss
  // before it, three rolls running, whatever the dice said. Four-word runs shared with a recent line.
  const shingles = (t) => { const w = String(t).toLowerCase().replace(/[^a-z0-9' ]+/g, ' ').split(/\s+/).filter(Boolean); const out = new Set(); for (let i = 0; i + 4 <= w.length; i++) out.add(w.slice(i, i + 4).join(' ')); return out; };
  const mine = shingles(text);
  if (mine.size >= 12) {
    const before = (state.story || []).filter((e) => e.kind === 'narration').slice(-4);
    if (before.some((e) => { const th = shingles(e.text); let n = 0; for (const g of mine) if (th.has(g)) n++; return n / mine.size >= 0.4; })) flags.push({ kind: 'style', text: 'Repeats an earlier line.' });
  }
  const words = text.split(/\s+/).filter(Boolean).length;
  if (words > 170) flags.push({ kind: 'style', text: `Long: ${words} words.` });
  if (asksRollInWords(text, state)) flags.push({ kind: 'style', text: 'Asks for a roll in words, but no roll is waiting on a screen.' });
  if (!state.fight && /\bPulse Points?\b|\bPP\b/.test(text)) flags.push({ kind: 'style', text: 'Mentions Pulse Points outside a Pulse War.' });
  if (/[*_#]{2,}|^\s*[-*]\s/m.test(text)) flags.push({ kind: 'style', text: 'Uses formatting; it should be plain text.' });
  // Harm the table can hear but the Engine never paid for. Bench 13 Nov, run 2: the gas pocket was
  // described going off a second time — "six kinetic punch back up through Bresk's leading
  // membrane" — with no hazard call behind it, so the number was invented in prose. Damage only
  // exists if a tool paid it this turn (`since` is the state this turn started from).
  const paid = (state.log || []).some((e) => e.seq > since && (e.kind === 'hit' || e.kind === 'hazard'));
  if (!paid && UNPAID_DAMAGE.test(text)) flags.push({ kind: 'rule', text: 'Says someone took damage the Engine never paid.' });
  // A Clock named as moving that nothing moved. §3.4 says advance a Clock in front of the players and
  // *name* it, so naming one a call just moved is required; naming one nothing paid for is the same
  // fault as harm nobody paid for. The 13 Nov afternoon gate, run 2: "the noise of it is being
  // counted: HUNGER moves a segment for a fight this loud" — §3.3 prints that row, the Engine had
  // moved TOLL, and HUNGER sat at 0 with nothing flagging it. Matched on the Capitalised Clock names
  // only, so "the toll board" and "the carcass bursts" are not Clocks. A Clock named in a recent log
  // line counts as paid: the page says its own moves out loud, and a Director repeating one a beat
  // later is faithful rather than inventive.
  const CLOCK = /\b(CARCASS|TOLL|HUNGER)\b/;
  const CLOCK_MOVE = /\b(moves?|moved|moving|tick(?:s|ed|ing)?|climb(?:s|ed|ing)?|advance[sd]?|advancing|rewind[sd]?|rewinding|drop(?:s|ed|ing)?|falls?|fallen|step(?:s|ped)?|jump(?:s|ed|ing)?|slid(?:e[sd]?|den)|nudge[sd]?|settle[sd]?|creep(?:s|ed|ing)?|spike[sd]?)\b/i;
  const clockLines = (state.log || []).filter((e) => e.kind === 'clock').slice(-12).map((e) => String(e.text)).join(' | ');
  const named = [...new Set(sentences.filter((sn) => CLOCK.test(sn) && CLOCK_MOVE.test(sn)).flatMap((sn) => sn.match(new RegExp(CLOCK.source, 'g')) || []))];
  const unpaidClock = named.filter((n) => !new RegExp(`\\b${n}\\b`).test(clockLines));
  if (unpaidClock.length) flags.push({ kind: 'rule', text: `Names ${unpaidClock.join(' and ')} moving when nothing moved it.` });
  // "A roll that succeeds, succeeds." Run 2 of the 13 Nov evening gate: Bresk threw 16 against 12 —
  // SUCCESS, Overflow 4, printed in the model's own briefing — and the narration said "The lip folds
  // over Bresk instead of parting", in the same turn that settled his Oath as kept. Prose that reverses
  // a throw the page has passed is the same fault as harm nobody paid for: the table heard an outcome
  // that is not the one on the screen. Only the success direction is checked, because a FAILED throw is
  // allowed to work at a price (a Cost) and reads the other way round on purpose. The sentence has to
  // name whoever threw it, which is what keeps "the Sentinel has not moved an inch" out of it.
  const REVERSED = /\binstead of\b|\b(?:fail|fails|failed|failing)\s+to\b|\bmissed\b|\bfell\s+short\b|\bcame\s+up\s+short\b|\b(?:cannot|can't|couldn't|could not|didn't|did not|doesn't|does not|never)\b[^.?!]{0,34}\b(?:part|parted|opening|open|opened|clear|cleared|hold|holding|held|land|lands|landed|reach|reaches|reached|carry|carries|carried|make|makes|made|pass|passes|passed|get|gets|got)\b/i;
  for (const r of (state.rolls || []).filter((x) => x.seq > since && x.at != null && x.success)) {
    const first = String(r.who || '').split(/\s+/)[0];
    if (!first) continue;
    const who = new RegExp(`\\b${first.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (sentences.some((sn) => who.test(sn) && REVERSED.test(sn))) {
      flags.push({ kind: 'rule', text: `Reverses ${r.who}'s ${r.label || 'throw'}, which the page passed.` });
      break;
    }
  }
  return flags;
}

// The machinery, as the table must not hear it. Deliberately not "the page": instructions.md tells
// the Director to use that sentence when the players want something off the page.
export const MACHINERY = /Director-only|site notes|\bthe notes\b|briefing|\btools?\s+(?:calls?|results?|schema)\b|\b(?:the|your|my)\s+tools?\s+(?:refused|returned|said|says|told|allows?)\b|ask_for_roll|\bthe Engine\b|\bthe Ledger (?:keeps|keep|kept|had|has|hold|holds|paid|pays|refuse|refuses|refused|own|owns|write|writes|wrote|record|records|never|itself|will)\b/i;

// The same rule, aimed at the prose WE hand the Director. Run 1 of the 13 Nov gate said "Next
// briefing will carry the Soft Field" to the players — a string of ours, quoted back — and a test now
// holds every tool description and refusal path to MACHINERY. The briefing is the largest block of our
// prose there is, so its own lines are held here. Two words MACHINERY flags are deliberately out: the
// model cannot act without reading its tool names, and the Vector's page prose, quoted verbatim into
// the briefing, legitimately writes "the harvest tool" (the Toll-Vent's Pays line) and "the Ledger's
// room" (a Lesson line). "the Ledger" is therefore caught only doing Engine verbs, exactly as above.
export const BRIEFING_LEAK = /Director-only|site notes|\bthe notes\b|\bbriefing\b|\bthe Engine\b|the Ledger (?:keeps|keep|kept|had|has|hold|holds|paid|pays|refuse|refuses|refused|own|owns|write|writes|wrote|record|records|never|itself|will)/i;

// A number attached to a damage type, or "takes N damage". Deliberately narrow: the check only
// fires when no tool hurt anyone this turn, so a paid blow or a hazard is never flagged.
const HARM_NUM = '\\d{1,3}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty';
const UNPAID_DAMAGE = new RegExp(`(?:${HARM_NUM})\\s+(?:Kinetic|Lytic|Osmotic)\\b|(?:Kinetic|Lytic|Osmotic)\\s+(?:damage|punch|blow|burn)\\s+(?:of\\s+)?(?:${HARM_NUM})|takes?\\s+(?:${HARM_NUM})\\s+(?:damage|points)`, 'i');

// The Director told a player to roll, in words, but no roll is waiting on anyone's screen.
const ROLL_WORDS = /\broll\b[^.?!]{0,90}\b(?:against|Threshold|on your screen)\b|\b(?:roll|test) (?:your |his |her |their |its )?(?:raw )?(?:VSC|DFF|RTC|OSM|AFF|Viscosity|Diffusion|Reactivity|Osmo\w*|Affinity|reflex|Chemoreception|Baseline)\b|\bBaseline [A-Z]{3} against\b|\bgive me an? [^.?!]{0,40}\broll\b/i;
export function asksRollInWords(text, state) {
  return ROLL_WORDS.test(text) && !(state.requests || []).length;
}

// ---- one turn -------------------------------------------------------------------
// A turn may be tried again from the same table: a model that uses its tools and
// then says nothing gets one fresh attempt before the host sees a problem.
const ATTEMPTS = 2;

export async function directorTurn(args) {
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const done = await oneAttempt(args);
    if (done) return done;
  }
  throw new ProviderError('The Director used its tools but never said anything to the table, even after a second try. Press "Take a turn" again.');
}

// Returns null when the model never narrated, so the caller can try again.
async function oneAttempt({ state, scenario, bestiary, provider, rng, now = 0, reason = '', hostNote = '', memory = null }) {
  const T = toolbox({ state, scenario, bestiary, rng, now, memory });
  const chat = provider.start({ system: INSTRUCTIONS, tools: TOOLS });
  const calls = [];
  const usage = { in: 0, out: 0 };
  let reply = await chat.send(briefing(state, scenario, bestiary, { reason, hostNote, chapters: memory ? memory.chapters : [] }));
  let narration = '';
  let nudged = false;
  let rollNudged = false;
  for (let step = 0; step < MAX_STEPS; step++) {
    usage.in += reply.usage.in;
    usage.out += reply.usage.out;
    if (reply.calls.length) {
      const results = reply.calls.map((c) => {
        const result = T.run(c.name, c.args);
        calls.push({ name: c.name, args: c.args, result });
        return { call: c, result };
      });
      reply = await chat.results(results);
      continue;
    }
    narration = reply.text;
    // A roll asked for in words reaches nobody's screen: send it back once to use the tool.
    if (narration && !rollNudged && asksRollInWords(narration, T.state)) {
      rollNudged = true;
      narration = '';
      reply = await chat.send('You told a player to roll, but you did not call ask_for_roll, so nothing is on their screen. Call ask_for_roll now for that roll (or swear_oath if it was an oath), then give your narration again, ending on one question. If no roll is needed, narrate again without asking for one.');
      continue;
    }
    if (narration || nudged) break;
    nudged = true;
    reply = await chat.send('You have not said anything to the table yet. Narrate now, in plain text, and end on one question.');
  }
  if (!narration) return null;
  narration = narration.replace(/\*\*/g, '').trim();
  const moved = T.state.scene.siteId !== state.scene.siteId;
  let flags = checkNarration(narration, T.state, { moved, since: state.seq });
  // One rewrite before anyone sees it, for a suspected leak, a reply that runs long, or one that
  // does not end on a question. A better rewrite replaces the draft; otherwise the draft and its
  // flags stand (and a leak is held for the host).
  const isLeak = (f) => f.kind === 'leak';
  const unpaid = (f) => f.kind === 'rule' && /^Says someone took damage/.test(f.text);
  const unpaidClock = (f) => f.kind === 'rule' && /^Names (?:CARCASS|TOLL|HUNGER)/.test(f.text);
  const reversed = (f) => f.kind === 'rule' && /^Reverses /.test(f.text);
  const fixable = (f) => unpaid(f) || unpaidClock(f) || reversed(f) || (f.kind === 'style' && /^(Long|Does not end|Reads out dice|Puts a new question|Asks \d+ questions|Repeats an earlier)/.test(f.text));
  if (flags.some((f) => isLeak(f) || fixable(f))) {
    const asks = [];
    if (flags.some(isLeak)) asks.push(`It gave away something the table must not hear: ${flags.filter(isLeak).map((f) => f.text).join(' ')} Leave out every creature number (no dice, Thresholds, Membrane Integrity, soak, or a count of how many Segments or sections are left) and do not name the briefing, the notes, the tools, the Engine or the Ledger: say what the organisms see and sense instead, and how much is left in the fiction - half of it, a scattering, still scenting you. "The page has nothing printed for that" is allowed.`);
    if (flags.some(unpaid)) asks.push('It describes harm that nothing paid for this turn: nobody was hurt. Say only what your calls actually did, and put no damage number in the scene.');
    if (flags.some(unpaidClock)) asks.push('It names a Clock moving when nothing moved it: no Clock changed. Name only a Clock the page actually moved, with the segments it stands at, or say nothing about Clocks at all.');
    if (flags.some(reversed)) asks.push('It describes the opposite of a throw the page has already passed: that throw succeeded and the player saw the total on their own screen. Say what the success did - and what it cost, if the page priced a cost - and do not undo it.');
    if (flags.some((f) => /^Long/.test(f.text))) asks.push('It is too long: use two to four short sentences, under 90 words, keeping only what the players need to act.');
    if (flags.some((f) => /^Asks \d+ questions/.test(f.text))) asks.push('It asks the table more than one question: ask exactly one, to one named organism, and fold any other choice into it ("do you X, or Y?"). What a character in the fiction says aloud may stay a question.');
    if (flags.some((f) => /^Repeats an earlier/.test(f.text))) asks.push('It repeats words you already used in an earlier line: say what is new this time, as this roll changed it, in fresh words.');
    if (flags.some((f) => /^Reads out dice/.test(f.text))) asks.push('It reads out dice counts or Thresholds outside a Pulse War: the player sees those on their own screen, so leave the numbers out.');
    if (flags.some((f) => /^Does not end/.test(f.text))) asks.push('It does not end on a question: end on exactly one question, put to one named organism.');
    if (flags.some((f) => /^Puts a new question/.test(f.text))) {
      const w = [...new Set((T.state.requests || []).map((r) => ((r.kind === 'incoming' ? r.target : r.actor) || {}).name).filter(Boolean))];
      asks.push(`A throw is still in the air (${w.join(', ')}), so nobody else's turn has come and you do not know the outcome. Do not put a choice to anyone else, and do not describe what happens next. Keep the beat on the throw and end on one question for ${w[0]} about it.`);
    }
    try {
      const fix = await chat.send(`Rewrite your whole reply. ${asks.join(' ')} Keep the same events and any roll you asked for, in plain text, ending on one question. Do not call any tools.`);
      usage.in += fix.usage.in;
      usage.out += fix.usage.out;
      const text = String(fix.text || '').replace(/\*\*/g, '').trim();
      const again = text && !(fix.calls || []).length ? checkNarration(text, T.state, { moved, since: state.seq }) : null;
      const bad = (list) => list.filter((f) => isLeak(f) || f.kind === 'style' || f.kind === 'rule').length;
      if (again && !again.some(isLeak) && bad(again) < bad(flags)) {
        const why = flags.some(isLeak) ? 'the first draft gave away a creature\'s numbers or the machinery'
          : flags.some(unpaid) ? 'the first draft described damage the Engine never paid'
            : flags.some((f) => /^Puts a new question/.test(f.text)) ? 'the first draft moved the table on while a throw was still in the air'
              : 'the first draft ran long, read out dice, or did not end on a question';
        narration = text;
        flags = [...again, { kind: 'note', text: `Rewritten once: ${why}.` }];
      }
    } catch (e) { /* the rewrite failed: keep the original and its flags */ }
  }
  if (T.refusals) flags.push({ kind: 'rule', text: `The Engine refused ${T.refusals} thing${T.refusals > 1 ? 's' : ''} the Director tried. Nothing refused took effect.` });
  T.do({ type: 'narrate', text: narration, by: 'ai' });
  return { state: T.state, narration, calls, flags, usage, refusals: T.refusals };
}
