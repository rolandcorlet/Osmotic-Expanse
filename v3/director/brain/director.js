// One Director turn: brief the model from the Ledger, let it act through the
// tools on a sandbox copy, and hand back the proposed new Ledger with its
// narration. Nothing here touches the live table: the caller decides whether to
// commit the result (Auto) or show it to the host first (Co-pilot).

import { kitBriefing, breakLoop } from './kit.js';
import { readFileSync } from 'node:fs';
import { TOOLS, toolbox, orgMT, printedPays, hazardSpec, reachable, toleranceAT, goodwillName } from './tools.js';
import { worldNow, turnsSinceBeat, directed } from '../engine/ledger.js';
import { hazardBudget } from '../engine/ledger.js';
import { seedHere } from '../engine/seeds.js';
import { ProviderError } from './net.js';
import * as R from '../engine/rules.js';
import { wordsBrief, wordFlags, wordAsk, wordsUsed, glossInline } from './words.js';
import { dropForeign } from './foreign.js';

export const INSTRUCTIONS = readFileSync(new URL('./instructions.md', import.meta.url), 'utf8');
const MAX_STEPS = 16;

// ---- the briefing: everything the model may know, rebuilt from data every turn ----
export function briefing(state, scenario, bestiary, { reason = '', hostNote = '', chapters = [] } = {}) {
  const site = scenario.sites.find((x) => x.id === state.scene.siteId) || scenario.sites[0];
  const L = [];
  const h = site.host || {};
  L.push(`# VECTOR: ${scenario.title || 'this Vector'}`);
  L.push(`# SITE ${site.n} of ${scenario.sites.length}: ${site.name} (id ${site.id}) — ${site.short}`);
  L.push(`${scenario.placeLabel || 'In the whale'}: ${site.inWhale}`);
  L.push(`What it is: ${site.where}`);
  L.push(`In front: ${site.front}`);
  L.push(`Fluid: tonic ${site.tonic}; viscosity ${site.visc}; flow ${site.flow}`);
  if (site.panelCloud) L.push(`Opening a panel here can cloud the water: the page prices it at ${site.panelCloud.overflow}+ Overflow on the throw that opens it, and then every contest in this scene costs ${Math.abs(site.panelCloud.dice)} extra dice. It is the place paying, so you never call it and you never move the number - say what the Cohort is seeing instead.`);
  if (state.scene && state.scene.cloud) L.push(`THE WATER HERE IS OPAQUE (${state.scene.cloud.why}): every contest in this scene is ${state.scene.cloud.dice} dice. Say what the Cohort is seeing - a lane gone milky, a shape only at the edge of the light - and let the dice come from the throw.`);
  L.push(`Zones: ${site.zones.map((z) => `${z.name}${z.band ? ` (${z.band})` : ''}${z.note ? `: ${z.note}` : ''}`).join(' | ')}`);
  L.push(`Exits: ${site.exits.join(' | ')}`);
  const near = reachable(scenario, site).map((id) => scenario.sites.find((x) => x.id === id)).filter(Boolean).map((x) => `${x.name} = "${x.id}"`);
  L.push(`Reachable with change_site: ${near.join(', ')}`);
  // Bench 17 Nov (Long Swallow 3): the Engine closed the Sentinel's question, then the Director asked
  // it four more times. A lapsed question stays lapsed.
  if ((state.story || []).some((e) => e.kind === 'narration' && e.site === site.id && /Nobody answers, and the moment passes/.test(e.text))) {
    L.push('A question at this site lapsed (the story says "Nobody answers, and the moment passes"). Do not ask it again in any form. Whatever was waiting on it settles the plain way (a challenge is taken as answered, an offer is withdrawn), and the scene moves on.');
  }
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
  // The one-time ending. Bench 15 Nov (second five-stage run): after it had fired, hazard_damage was
  // called eight more times and the charge was narrated firing again and again.
  if (/\bthe carcass ends\b/i.test(String(hz.text || '')) && (state.hazards || {})[site.id]) {
    L.push('THE CHARGE HERE HAS FIRED, ONCE, AND IS OVER. Never call hazard_damage again at this site and never describe it firing, detonating or contracting again. What is left is the race out: one ask_for_roll for each organism still up, then the ending. Do not start a new scene, bring new creatures or open a parley here.');
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

  for (const line of kitBriefing(state, scenario, site)) L.push(line);

  L.push('');
  L.push('# THE COHORT (organisms in play)');
  const orgs = Object.values(state.organisms).filter((o) => o.playerId);
  if (!orgs.length) L.push('Nobody has joined yet.');
  for (const o of orgs) {
    const paths = Object.entries(o.pathways).map(([n, r]) => `${n} ${r}`).join(', ');
    const weps = o.weapons.filter((w) => w.carried !== false).map((w) => `${w.name} (${w.type}, ${w.props.join('/')})`).join(', ');
    L.push(`- ${o.name} (id "${o.id}", ${o.hand}, ${o.phenotype}; played by ${(state.players[o.playerId] || {}).name || '?'})`);
    L.push(`  Baselines VSC ${o.base.VSC} DFF ${o.base.DFF} RTC ${o.base.RTC} OSM ${o.base.OSM} AFF ${o.base.AFF} | Pathways: ${paths}`);
    if (o.lysed) L.push(`  DEAD (Total Lysis): ${o.name}'s body is gone. Say so once, plainly, if the table has not heard it. ${o.name} takes no turns, cannot be healed or stabilised, and is never asked a question. Speak to the player kindly out of character about what comes next (CORE: death and legacy).`);
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
  {
    // The map (28 Nov 2026): one square is one Drift, and each band above is measured on it.
    const m = state.map;
    const zones = m && m.show && (m.show.zones || m.show.grid) ? (m.zones || {})[site.id] : null;
    if (zones && zones.length) {
      const nameOf = (k) => { const i = k.indexOf(':'); const kind = k.slice(0, i); const id = k.slice(i + 1); const o = kind === 'org' ? state.organisms[id] : state.creatures[id]; return o ? `${o.name}${kind === 'cre' && o.down ? ' (destroyed)' : kind === 'org' && o.dormant ? ' (Dormant)' : ''}${kind === 'cre' && o.hidden ? ' (hidden)' : ''}` : ''; };
      const at = Object.entries(m.at || {}).filter(([k, p]) => p.site === site.id && nameOf(k));
      L.push('');
      L.push('# THE MAP (zones about six Drifts across; one square is one Drift)');
      for (const z of zones) L.push(`- ${z.name}: ${at.filter(([, p]) => p.zone === z.id).map(([k]) => nameOf(k)).join(', ') || 'nobody'}`);
      L.push('Each creature\'s band is its distance on the map to the nearest organism, and always matches it. To bring a creature closer or send it off, move it to a band with creature_move: its token goes there. The players move their own organisms.');
    }
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
      L.push('# NOTHING IS WAITING TO BE SHARED. Every Specimen cut so far has been picked or passed. Sharing never holds the Cohort up: do not tell anyone to take or pass, and do not say anything is left in the water or blocking the way.');
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
  // How each Clock moves is the Vector's own: its kit prints the rules (The First Carve), or they are built from the Clocks' own lines.
  const clockRules = (scenario.kit && scenario.kit.clockRules) || (scenario.kit && scenario.kit.clocks ? scenario.kit.clocks.map((c) => `${c.id}: ${c.plain}${c.who ? ` Moves: ${c.who}` : ''}`) : []);
  for (const line of clockRules) L.push(line);
  {
    // What the Clocks are doing to the world now. The Engine pays these; the Director says them.
    const w = worldNow(state, scenario);
    const R2 = scenario.rules || {};
    const lines = [...w.notes];
    for (const c of Object.values(state.clocks)) if (c.stopped) lines.push(`${c.name} is STOPPED (the fiction stopped it): it does not move. Start it again with move_clock stop false only when the fiction does.`);
    if (state.clocks.GOODWILL) lines.push(`GOODWILL is ${goodwillName(state, scenario)} (Hostile / Wary / Curious / Client / Kin). Move it a rung with move_clock GOODWILL +1 or -1 for what the page prints: up for a clean Tolerance win, a rite with the Congregation, healing, carrying a name it asked for; down for striking Host tissue (once a scene), harvesting without asking, Lytic damage, a Breach, being lawful at it. Only Client or better opens a door you ask for; only Kin moves you for free.`);
    if (R2.tolerance) lines.push(`A Tolerance contest (a Sentinel's challenge) is AT ${toleranceAT(state, scenario, false)} now, AT ${toleranceAT(state, scenario, true)} if the Cohort is sponsored or carries a valid token (pass sponsored true). Say what you are honestly and a Sentinel will not fight it. The Engine refuses any other Threshold.`);
    if (R2.churn && state.clocks[R2.churn.clock]) lines.push(`${R2.churn.clock} fills by itself when it reaches ${state.clocks[R2.churn.clock].segments}: the Engine pushes everyone inside the body ${Math.max(R2.churn.bands, w.churnBands || 0)} band(s) and pays ${R2.churn.amount} ${R2.churn.dtype}; Braced holds. You only move it on its schedule. If the pump is jammed, call move_clock ${R2.churn.clock} with change 0 and stop true.`);
    if (R2.badgeDice && state.clocks.BADGE) {
      const b = state.clocks.BADGE.filled;
      lines.push(`BADGE ${b} (${R2.badgeDice.reads[b]}): in any contest with the Hegemony or the Court, pass facing "hegemony" or "court" to ask_for_roll and the Engine adds ${R2.badgeDice.dice[b] >= 0 ? '+' : ''}${R2.badgeDice.dice[b]} dice. Do not add BADGE dice yourself.`);
    }
    const CT = R2.clockTriggers || {};
    if (CT.saltPanel || CT.paper || CT.haulShipped) lines.push(`This place prices more than the harvest: ${[CT.saltPanel ? 'salt (a panel turns CARCASS back, a wound turns HUNGER back, once a scene each: call salt)' : '', CT.haulShipped ? 'shipping stamped cuts (call ship_haul)' : '', CT.paper ? 'paper the law accepts, and the Gut Stone\'s serial at a Warden register arch (call produce_paper)' : ''].filter(Boolean).join('; ')}. Use them only when the players do the thing.`);
    if (R2.beatAfterTurns) {
      const left = R2.beatAfterTurns - turnsSinceBeat(state);
      lines.push(`A day (a Beat) is about ${R2.beatAfterTurns} of your turns. ${left > 1 ? `In ${left} more turns the day closes by itself` : 'This turn closes the day by itself'} unless you call end_beat first: call it yourself when the printed scene has turned (a day in the queue, the work done, a night's rest), and say what the day cost.${R2.routeBeats ? ' A route the page prices at a Beat is paid for you when the Cohort takes it.' : ''}`);
    }
    const growing = Object.values(state.organisms).filter((o) => o.playerId && o.growTo > o.level);
    if (growing.length) lines.push(`${growing.map((o) => o.name).join(', ')} can Grow (the Codon is there and they have rested). They choose on their own screen; do not choose for them. When one reaches a new Stage (Levels 6, 11, 16), ask them what changed in their body and who notices.`);
    if (lines.length) { L.push('## IN FORCE NOW (these are paid for you; say them when they matter)'); for (const x of lines) L.push(`- ${x}`); }
  }
  if (state.clocks.ORDER) L.push('ORDER is the campaign\'s own Clock (five segments) and it stays with the Cohort from Vector to Vector. It advances when the Cohort harms, harvests or imitates an Order of creatures, in front of that Order\'s own kind: the swarms, the Bleeders, the Sentinels. Never because a roll failed. Name it aloud. The players may rewind it by spending time, Cohesion or Specimens: let them. When it fills, that Order responds: it swarms, hunts the Cohort\'s register, mimics the Cohort, or (rarely) makes an offer.');
  if (state.clocks.COLONY) L.push('COLONY (six segments) and CORE (four) are the campaign\'s own Clocks and travel with the Cohort from Vector to Vector. COLONY advances when the Cohort disturbs a settlement: violence in a market, unlicensed synthesis, a corpse left unharvested (a broken Oath is paid for you). When it fills, the colony acts: wardens arrive, tolls rise, a contract is voided, a mob forms. CORE advances for touching Nucleoid material, a Relic\'s Rule Break, an Apotheotic Choice or a Deep Naming; when it fills, the Nucleoid notices. Same discipline as every Clock: one advance a session, in front of the players, for something loud that succeeded.');

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
      const away = a.kind === 'org' && directed(body) ? ' (AWAY: you play this organism)' : '';
      L.push(`- ${body.name} (${a.kind === 'org' ? 'player' : 'creature'}${away}): ${a.status}${a.status === 'acting' || a.status === 'holding' ? `, ${a.pp} Pulse Points left` : ''}${a.reserve ? ', holding a Reserve' : ''}${can}${f.turn === k ? '  <= ACTING NOW' : ''}`);
    }
    const cur = f.turn ? f.actors[f.turn] : null;
    L.push('Creature costs: a Strike 2 Pulse Points, a Drift 1, a Reserve 1. A creature with fewer Pulse Points left than an action costs cannot take it: end its turn instead. Count before you act: a Drift then a Strike needs 3.');
    const up = Object.values(state.creatures).filter((c) => c.siteId === state.scene.siteId && !c.down && !c.stoodDown);
    if (up.length) L.push(`Still fighting: ${up.map((c) => c.name).join(', ')}. While any of these is up you cannot end the Pulse War or change site: if a player wants to leave, say the creatures block the way and ask what they do. A creature that has yielded, fled or was never fighting does not belong in this list: use creature_stand_down for it, with the reason.`);
    if (cur && cur.kind === 'cre') L.push('It is a creature\'s turn: act for it now, then end its turn.');
    else if (cur && directed(state.organisms[cur.id])) L.push(`It is ${state.organisms[cur.id].name}'s turn and their player is away: you play it. Take one action with organism_act (or organism_strike at a creature in reach), then end its turn with organism_end_turn. Play it sensibly, as the player would, and say what the Cohort does in the fiction. Ask nobody for a choice. Never act for an organism that is not marked AWAY.`);
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
        : state.improv === 'adlib'
          ? 'You may bring these people and threads back at any site, and grow them: they are canon, so keep every fact on their card true.'
          : 'You may bring these people and threads back in conversation and scene-dressing, at any site. They are people, not encounters: anything that fights still comes only from the creatures printed for this site.');
      L.push('');
    }
  }

  if (state.improv === 'adlib') {
    // Ad-lib (Roly, 18 Nov): the host lets the Director go beyond the page. People, places and threads
    // may be invented freely and become canon; one encounter a site may be invented, through the tool.
    const spent = (state.adlib || {})[site.id];
    L.push('# AD-LIB IS ON (the host lets you go beyond the page)');
    L.push('- Invent people, places, rumours and threads when the story wants them: a rival crew, a stranded clerk, a debt someone remembers. Give each a name and call remember the moment you name them: from then on they are canon, and you keep every fact true.');
    L.push(spent ? `- You have already brought this site's invented encounter (${spent.what}: ${spent.why}). No more invented creatures here.` : '- You may bring ONE invented encounter at this site with invent_encounter: from the Bestiary, at most three bodies, no tougher than what this site prints, with a reason in the fiction. The printed encounters come first; invent one only when the story has earned it (a fight that would make sense here and is not on the page).');
    L.push('- Still never invent a number: rewards, prices, items with effects and damage come only from the page and the tools. An invented person can offer a deal in words; anything paid is still paid with award, harvest or the post.');
    L.push('- Keep to this Vector: its tone, its factions and its stakes. An invention should make the printed situation sharper, never replace it.');
    L.push('');
    // The host's own story seeds (engine/seeds.js), switched on and fitting this Vector and site.
    const seeds = Object.values(state.seeds || {}).filter((x) => seedHere(x, state, scenario));
    if (seeds.length) {
      L.push(`# YOUR HOST'S STORY SEEDS (${seeds.length}): material the host wrote for this table. Weave it in when the play gives it room; it is canon from the moment you use it.`);
      for (const x of seeds) {
        L.push(`## ${x.title}${x.tone ? ` (tone: ${x.tone})` : ''}`);
        for (const c of x.cards) L.push(`- ${c.name} (${c.kind}): ${c.facts.join(' ')}`);
        for (const t of x.secrets) L.push(`- SECRET (the players learn it only by play; never say it outright): ${t}`);
        if (x.endings.length) L.push(`- How it can end: ${x.endings.join(' / ')}`);
        if (x.encounter) L.push(spent ? '- Its encounter cannot come here: this site has had its invented encounter.' : `- Its encounter, when the story reaches it: ${x.encounter.count} ${x.encounter.name} at ${x.encounter.band} (${x.encounter.why}). Bring it with invent_encounter, block "${x.encounter.blockId}", seed "${x.id}". It is this site's one invented encounter.`);
      }
      L.push('- When you first name someone from a seed in play, call remember with their name and what the table saw, so they stay the same.');
      L.push('');
    }
  }
  L.push('# THE STORY SO FAR (most recent last)');
  const story = (state.story || []).slice(-16);
  if (!(state.story || []).some((e) => !e.pre)) L.push('Nothing yet. This is the opening: set the scene for the Cohort.');
  for (const e of story) L.push(`${e.kind === 'narration' ? 'DIRECTOR' : e.who.toUpperCase()}${e.pre ? (e.kind === 'narration' ? ' (before play)' : ' (a player, before play: no organism yet)') : ''}: ${e.text}`);
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

  L.push(...wordsBrief(state, scenario, site));
  L.push('');
  if (hostNote) L.push(`# NOTE FROM THE HOST (follow it): ${hostNote}`);
  const lastLine = [...(state.story || [])].reverse().find((e) => e.kind === 'say');
  if (lastLine && lastLine.pre && !((state.players || {})[lastLine.pid] || {}).organismId) {
    L.push(`# BEFORE PLAY: ${lastLine.who} has joined but has not chosen an organism yet. They are talking to you out of the story, as a guide at the table. Answer what they asked in a few plain sentences: what this game is, what a word means, what the organisms on offer are like and which might suit them, how session zero works. Do not set a scene, do not narrate the adventure, and call no tools that change the world. You may use look_up_rules. End on one short question that helps them get ready.`);
  }
  L.push(`# YOUR MOVE${reason ? ` (${reason})` : ''}. If the world must change, make the calls that pay for it first, then narrate in plain text and end on one question.`);
  return L.join('\n');
}

// Drop the last paragraph (the question to the wrong player) and ask the one on turn. Null when nothing
// would be left to say.
// Drop the fewest sentences that make the leak count zero. Keeps the closing question. Returns ''
// when cutting cannot clean it (or would leave nothing worth saying).
export function scrubLeaks(text, leaks) {
  const paras = String(text || '').split(/\n\s*\n/);
  const parts = paras.map((p) => p.match(/[^.!?]+[.!?]+["')\]]*\s*|[^.!?]+$/g) || [p]);
  const join = () => parts.map((x) => x.join('').trim()).filter(Boolean).join('\n\n');
  let now = leaks(join());
  if (!now) return '';
  const total = parts.reduce((n, x) => n + x.length, 0);
  let removed = 0;
  for (let pi = 0; pi < parts.length && now; pi++) {
    for (let si = 0; si < parts[pi].length && now; si++) {
      const last = pi === parts.length - 1 && si === parts[pi].length - 1;
      if (last) continue; // the closing question stays
      const held = parts[pi][si];
      parts[pi][si] = '';
      const after = leaks(join());
      if (after < now) { now = after; removed += 1; } else parts[pi][si] = held;
    }
  }
  return !now && removed <= Math.max(2, Math.floor(total / 3)) && join().length > 40 ? join() : '';
}

export function fixSeat(text, name, wrong = '') {
  const ask = `${String(name).split(/\s+/)[0]}, what do you spend your Pulse Points on?`;
  const paras = String(text).trim().split(/\n\s*\n/);
  if (paras.length >= 2) { paras.pop(); return `${paras.join('\n\n')}\n\n${ask}`; }
  // One paragraph: cut from where it turns to the wrong player ("Bresk, four Pulse Points. What ...").
  const w = String(wrong).split(/\s+/)[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (!w) return null;
  const hits = [...paras[0].matchAll(new RegExp(`(?:^|[.!?]\\s+)(${w}\\b\\s*[,\u2014\u2013:-])`, 'g'))];
  if (!hits.length) return null;
  const h = hits[hits.length - 1];
  const head = paras[0].slice(0, h.index + h[0].length - h[1].length).trim();
  return head ? `${head}\n\n${ask}` : null;
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
// The Clock names this table is playing, as a regex alternation (never empty, so a Vector with no Clocks matches nothing).
const clockAlt = (state) => {
  const n = Object.keys((state && state.clocks) || {}).filter((k) => /^[A-Z][A-Z0-9_ -]*$/.test(k)).map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return n.length ? n.join('|') : '(?!)';
};

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
    if (new RegExp(`\\b(?:${clockAlt(state)})\\b|\\bClocks?\\b`).test(sn)) return false;
    // A creature is "it" or "they"; "him", "her", "you" mean a player (bench 15 Nov: "two more sections of what he was").
    if (/\b(?:he|him|his|she|her|hers|you|your)\b/i.test(sn) && !/\b(?:it|its|they|them|their)\b/i.test(sn)) return false;
    const m = sn.match(SEGMENTS);
    if (!m && !SEGMENTS_OF_CREATURE.test(sn)) return false;
    if (m && ownedByCreature(sn, m)) return true;
    if (SEGMENTS_OF_CREATURE.test(sn)) return true;
    const low = sn.toLowerCase();
    return kinds.length > 0 && !people.some((p) => low.includes(p)) && !HARVEST_WORDS.test(sn);
  });
  if (segSentence) flags.push({ kind: 'leak', text: 'Counts a swarm\'s Segments or sections, which is its health track.' });
  // "Fourteen points of damage tear through the overlap": what a blow took off a creature is its
  // health in the other direction. Bench 14 Nov (second): the same "points of damage" is fine said of a
  // player, so it only counts when no player is named in the sentence.
  const HITNUM = new RegExp(`\\b(?:${NUMW}|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)\\s+points?\\s+of\\s+(?:\\w+\\s+)?damage\\b`, 'i');
  if (sentences.some((sn) => HITNUM.test(sn) && !people.some((p) => sn.toLowerCase().includes(p)))) flags.push({ kind: 'leak', text: 'Gives how much damage a blow did to a creature, which is its health in numbers.' });
  // Bench 15 Nov (second five-stage run), none of them caught: "Bleeder A still hangs at twelve",
  // "two points of structure left", and a bare "Three damage." said of a creature.
  const BIGN = `${NUMW}|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty`;
  const HOLDS = new RegExp(`\\b(?:${BIGN}|\\d+)\\s*(?:\\/\\s*\\d+\\s+)?of whatever\\b|\\b(?:${BIGN}|\\d+)\\s+(?:of\\s+(?:${BIGN}|\\d+)\\s+)?clusters?\\s+(?:left|remain(?:s|ing)?|where|thick)\\b|\\b(?:${BIGN}|\\d+)\\s+of\\s+(?:${BIGN}|\\d+)\\s+clusters\\b`, 'i');
  if (Object.values(state.creatures || {}).some((c) => c.siteId === state.scene.siteId) && HOLDS.test(text)) flags.push({ kind: 'leak', text: 'Counts what is left of a creature, which is its health track.' });
  const AT_NUM = new RegExp(`\\b(?:hangs|sits|stands|holds|is|rests)\\s+at\\s+(?:${BIGN})\\b(?!\\s+(?:of|Pulse|points?\\b))`, 'i');
  if (kinds.length && sentences.some((sn) => { const m = sn.match(AT_NUM); return m && ownedByCreature(sn, m); })) flags.push({ kind: 'leak', text: 'Gives how much of a creature is left as a number, which is its health.' });
  const STRUCT = new RegExp(`\\b(?:${BIGN})\\s+points?\\s+of\\s+(?:structure|membrane|integrity|purchase|body|itself|shape|substance|bulk|mass)\\b`, 'i');
  if (sentences.some((sn) => STRUCT.test(sn) && !people.some((p) => sn.toLowerCase().includes(p)) && (!/\b(?:he|his|him|she|her|you|your)\b/i.test(sn) || /\bleft in it\b|\bit has\b|\bthing\b[^.]{0,40}\bhas\b/i.test(sn)))) flags.push({ kind: 'leak', text: 'Gives how much of a creature is left as a number, which is its health.' });
  const BARE_DMG = new RegExp(`\\b(?:${BIGN})\\s+damage\\b`, 'i');
  if (kinds.length && text.split(/\n\s*\n/).some((para) => BARE_DMG.test(para) && !people.some((p) => para.toLowerCase().includes(p)))) flags.push({ kind: 'leak', text: 'Gives how much damage a blow did to a creature, which is its health in numbers.' });
  // "Five MI of what's left holding it together" is a creature's Membrane Integrity as a number (bench 15 Nov).
  // A paragraph that opens by addressing a player ("Brost - four points in your hands. One MI.") talks about that player.
  const playerPara = (sn) => { const para = text.split(/\n\s*\n/).find((pp) => pp.includes(sn)) || ''; return people.some((p) => new RegExp(`^${p}\\b\\s*[,\u2014\u2013:-]`, 'i').test(para.trim())); };
  const MINUM = new RegExp(`\\b(?:${NUMW}|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|\\d+)\\s+MI\\b`, 'i');
  if (sentences.some((sn) => MINUM.test(sn) && !playerPara(sn) && !people.some((p) => sn.toLowerCase().includes(p)) && !/\b(?:she|her|hers|he|his|him|your|you)\b/i.test(sn))) flags.push({ kind: 'leak', text: 'Gives how much of a creature is left as a number of MI, which is its health.' });
  // "Nineteen of twenty-two" said of a creature is its Membrane Integrity read out as a fraction.
  const BIGW = `${NUMW}|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty(?:[- ](?:one|two|three|four|five|six|seven|eight|nine))?|thirty|forty|fifty`;
  const FRACTION = new RegExp(`\\b(?:${BIGW})\\s+(?:of|out of)\\s+(?:${BIGW})\\b`, 'i');
  if (sentences.some((sn) => FRACTION.test(sn) && !playerPara(sn) && !new RegExp(`\\b(?:${clockAlt(state)}|Clocks?|Oaths?|Lysis|Countdown|Stress|Pulse Points?)\\b`, 'i').test(sn) && !people.some((p) => sn.toLowerCase().includes(p)) && !/\b(?:she|her|hers|he|his|him)\b/i.test(sn))) flags.push({ kind: 'leak', text: 'Gives how much of a creature is left as a number, which is its health.' });
  // The page is the Director's, not the table's: only the one sanctioned way of saying no may name it.
  if (/(?<!\b(?:on|off|across|down|from|flip|flips|flipped|turn|turns|turned)\s)\bthe page\b(?!\s+(?:has nothing printed|prints nothing))/i.test(text)) flags.push({ kind: 'style', text: 'Speaks of "the page" as though the players could see it.' });
  // A lowercase "the engine" is a pump or a motor in the fiction (bench 16 Nov: "shouting over the engine"
  // was held as a leak). Only the capitalised game Engine is machinery.
  if (MACHINERY.test(text.replace(/\bthe engine\b/g, 'the motor'))) flags.push({ kind: 'leak', text: 'Mentions the machinery (notes, briefing, tools, the Engine, the Ledger).' });
  // Someone still has dice in the air: putting the next choice to a different organism moves the
  // whole table past a throw that has not landed yet (Roly at the table, 12 Nov 2026).
  const pend = (state.requests || []).map((rq) => (rq.kind === 'incoming' ? rq.target : rq.actor)).filter((a) => a && a.kind === 'org');
  // A clerk's question inside quotation marks is the fiction speaking, not the Director asking the table.
  const q = (text.replace(/"[^"]*"|“[^”]*”/g, ' ').match(/\?/g) || []).length;
  // With a throw in the air the table is already waiting on one screen, so a beat that only holds
  // ("nothing else moves until it lands") needs no question of its own.
  // A clerk's question that closes the beat (...ledger?") is still the question the table answers.
  const endsOnQuestion = /\?["”']?\s*$/.test(text);
  if (q === 0 && !endsOnQuestion && !moved && !pend.length) flags.push({ kind: 'style', text: 'Does not end on a question.' });
  if (q > 1) flags.push({ kind: 'style', text: `Asks ${q} questions; it should ask one.` });
  if (pend.length) {
    const first = (n) => String(n).split(/\s+/)[0];
    const firstName = (n) => first(n).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const waiters = pend.map((a) => first(a.name).toLowerCase());
    // Only the closing paragraph: a name earlier in the text is scenery (bench 15 Nov, twice).
    const lastQ = text.trim().split(/\n\s*\n/).pop() || '';
    const other = Object.values(state.organisms || {}).find((o) => o.playerId && !waiters.includes(first(o.name).toLowerCase()) && new RegExp(`\\b${firstName(o.name)}\\b`, 'i').test(lastQ));
    if (other) flags.push({ kind: 'style', text: `Puts a new question to ${other.name} while ${pend.map((a) => a.name).join(' and ')} still has a throw in the air.` });
  }
  // Whose turn it is. Bench 15 Nov (Gut Stone): Ilm was asked "what do you spend them on?" while Vash's
  // turn was the one waiting. In a Pulse War the closing question goes to the organism on turn.
  if (state.fight && state.fight.turn && !pend.length) {
    const cur = state.fight.actors[state.fight.turn];
    const me = cur && cur.kind === 'org' ? (state.organisms || {})[cur.id] : null;
    if (me && me.playerId) {
      const nm = (o) => String(o.name).split(/\s+/)[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const lastPara = text.trim().split(/\n\s*\n/).pop() || '';
      const addressed = (lastPara.match(/[^.!?]+[.!?]*/g) || []).map((sn) => sn.trim()).filter(Boolean).map((sn) => Object.values(state.organisms || {}).find((o) => o.playerId && new RegExp(`^${nm(o)}\\b\\s*(?:[,\u2014\u2013:-])`).test(sn))).filter(Boolean);
      const named2 = addressed.length ? [addressed[addressed.length - 1]] : [];
      if (named2.length === 1 && named2[0].id !== me.id) flags.push({ kind: 'style', text: `Puts the question to ${named2[0].name}, but it is ${me.name}'s turn.`, turnOf: me.name });
    }
  }
  // The same paragraph twice. Bench 14 Nov, run 3: a miss was narrated with the very words of the miss
  // before it, three rolls running, whatever the dice said. Four-word runs shared with a recent line.
  const shingles = (t) => { const w = String(t).toLowerCase().replace(/[^a-z0-9' ]+/g, ' ').split(/\s+/).filter(Boolean); const out = new Set(); for (let i = 0; i + 4 <= w.length; i++) out.add(w.slice(i, i + 4).join(' ')); return out; };
  const mine = shingles(text);
  if (mine.size >= 12) {
    const before = (state.story || []).filter((e) => e.kind === 'narration').slice(-4);
    if (before.some((e) => { const th = shingles(e.text); let n = 0; for (const g of mine) if (th.has(g)) n++; return n / mine.size >= 0.4; })) flags.push({ kind: 'style', text: 'Repeats an earlier line.' });
  }
  // Whose action it is. Bench 17 Nov (Ninth Shift 5): Brost said he went, and the Director walked Bresk
  // off instead. When a player speaks for their own organism ("I take the bowl"), the opening of the
  // reply should be about that organism, not another one.
  {
    const said = [...(state.story || [])].reverse().find((e) => e.kind === 'say' && e.orgId);
    const me = said && (state.organisms || {})[said.orgId];
    if (me && /(^|[^a-z])(i|i'm|my)\b/i.test(said.text) && !/\b(we|us|our)\b/i.test(said.text)) {
      const nm = (o) => String(o.name).split(/\s+/)[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const open = (text.match(/[^.!?]+[.!?]*/g) || [''])[0];
      const others = Object.values(state.organisms || {}).filter((o) => o.playerId && o.id !== me.id);
      const actor = others.find((o) => new RegExp(`^\\s*${nm(o)}\\b`).test(open.trim()));
      if (actor && !new RegExp(`\\b${nm(me)}\\b`).test(open)) flags.push({ kind: 'style', text: `Gives ${me.name}'s action to ${actor.name}.`, speaker: me.name });
    }
  }
  const words = text.split(/\s+/).filter(Boolean).length;
  if (words > 170) flags.push({ kind: 'style', text: `Long: ${words} words.` });
  if (asksRollInWords(text, state)) flags.push({ kind: 'style', text: 'Asks for a roll in words, but no roll is waiting on a screen.' });
  if (!state.fight && /\bPulse Points?\b|\bPP\b/.test(text)) flags.push({ kind: 'style', text: 'Mentions Pulse Points outside a Pulse War.' });
  if (/[*_#]{2,}|^\s*[-*]\s/m.test(text)) flags.push({ kind: 'style', text: 'Uses formatting; it should be plain text.' });
  // A heading in capitals ("RUNAWAY CATALYSIS - ...") is the rulebook talking, not the table.
  if (/^\s*[A-Z]{3,}(?:\s+[A-Z]{3,})+\b/m.test(text)) flags.push({ kind: 'style', text: 'Uses formatting; a heading in capitals is the rulebook talking.' });
  if (/\brunaway catalysis\b|\bautophagic collapse\b|\bLodged (?:property|trait)\b|\bE[1-9]\b/i.test(text)) flags.push({ kind: 'style', text: 'Uses formatting; names a rule (Runaway Catalysis, Autophagic Collapse, Lodged or an encounter code like E5) aloud.' });
  // The model sometimes slips into another script mid-sentence.
  if (/[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af\u0400-\u04ff]/.test(text)) flags.push({ kind: 'style', text: 'Contains characters from another language.' });
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
  // A player's body narrated as dissolved or dead while the Engine has it standing. Bench 15 Nov (Gut
  // Stone): "His countdown is full ... The only witness to the whale's gut-lock is gone" after a missed
  // throw and no call; Vash was at 3 MI, kept acting for two Cycles and the table heard him buried.
  // Only a tool kills a body.
  const BURIAL = '(?:dissolv(?:es|ed|ing)|(?:is|was|are|were) (?:dead|gone)|dies|died|unspools?|taken apart|takes? \\w+ apart|lets go|countdown is full|Total Lysis took|stops being \\w+|goes clear|(?:is|was) a bloom)';
  const buried = Object.values(state.organisms || {}).filter((o) => o.playerId && !(o.countdownMax && o.countdown >= o.countdownMax)).filter((o) => {
    const fn = String(o.name).split(/\s+/)[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // v3 bench 16 Nov: "the whole Rider simply stops being a single shape" then "the place where Vash was".
    const hw = (String(o.hand || '').split(/\s+/).pop() || 'zzzz').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // The verb has to belong to the player: the name (not possessive) within 50 characters before it,
    // or the verb leading straight into "where Brost stood". "the lurkers died ... Brost's dagger" is not a burial.
    return sentences.some((sn) => new RegExp(`\\b${fn}\\b(?!['\u2019]s)[^.]{0,50}\\b${BURIAL}\\b|\\b${BURIAL}\\b[^.]{0,20}\\bwhere ${fn} stood|\\b(?:stops|ceases) (?:being|to be) ${fn}\\b|\\b${fn}['\u2019]s (?:shape|body|bulk|membrane|frame)\\b[^.]{0,40}\\b(?:goes clear|thins to nothing|comes apart for good|(?:is )?gone)|\\bwhere ${fn} was\\b|\\b(?:the )?(?:whole )?${hw}\\b[^.]{0,40}\\bstops being\\b`, 'i').test(sn));
  });
  if (buried.length) flags.push({ kind: 'rule', text: `Says ${buried.map((o) => o.name).join(' and ')} is dead or dissolved, but the Engine has them standing.` });
  // A creature narrated dead while the Engine has it fighting (Roly's table, 20 Nov: Glaze Medusa B had
  // taken 15 of its MI, the table heard it shatter and dissolve, and the host had to remove it by hand).
  // The creature's name or its kind ("the last medusa") within a sentence of a killing word, or the fight
  // called over while something is still up.
  {
    const up = Object.values(state.creatures || {}).filter((c) => c.siteId === (state.scene || {}).siteId && !c.down && !c.hidden && !c.stoodDown);
    const KILL = '(?:dies|died|is dead|lies dead|falls dead|falls still|goes still|lifeless|destroyed|is no more|torn apart|comes apart|dissolv(?:es|ed|ing) (?:into|away)|scatter(?:s|ed|ing)? (?:into|across)|drives clean through|(?:what is|what was) left of|the last of|finished off|finishes it|kills? it|killed)';
    const OVER = /\b(?:pulse war|fight|battle)\b[^.]{0,30}\b(?:dies away|is over|ends|has ended|is done|falls quiet)\b/i;
    const named = up.filter((c) => {
      const base = String(c.name).replace(/\s+[A-Z]$/, '');
      const kind = (base.split(/\s+/).pop() || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const full = String(c.name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      // Partly ("most of it comes apart", "half torn apart", "nearly finished off") is a wound, not a death
      // (map bench, 28 Nov: the second swarm "comes apart... one good blow from being wreckage" was flagged).
      const whole = (sn) => sn.replace(/\b(?:most|half|much|part|some|bits?|pieces?|chunks?) of (?:it|them|its \w+)\s+(?:\w+\s+){0,2}?(?:comes?|came|is|are|was|were|gets?|got)?\s*(?:torn |coming |falling )?apart\b/gi, '').replace(/\b(?:nearly|almost|half|partly|all but)\s+(?:\w+\s+)?(?:torn apart|comes? apart|destroyed|finished off|dead|lifeless)\b/gi, '');
      return sentences.map(whole).some((sn) => new RegExp(`(?:\\b${full}\\b|\\b(?:last|remaining|second|final) ${kind}s?\\b|\\b${kind}['\u2019]s\\b)[^.]{0,80}\\b${KILL}|\\b${KILL}\\b[^.]{0,40}\\b(?:${full}|(?:last|remaining) ${kind})\\b`, 'i').test(sn));
    });
    if (named.length) flags.push({ kind: 'rule', text: `Says ${named.map((c) => c.name).join(' and ')} is destroyed, but the Engine has it still fighting.`, creatures: named.map((c) => c.name) });
    else if (up.length && sentences.some((sn) => OVER.test(sn)) && (state.fight || null)) flags.push({ kind: 'rule', text: `Says the fight is over, but ${up.map((c) => c.name).join(' and ')} ${up.length > 1 ? 'are' : 'is'} still fighting.`, creatures: up.map((c) => c.name) });
  }
  // An Oath the Engine settled as kept this turn, narrated as broken (bench 15 Nov: the roll met the
  // Threshold, settle_oath said kept, and the table heard "the fold judged the promise thin").
  if ((state.log || []).some((e) => e.seq > since && /keeps the Oath/.test(String(e.text)))
    && sentences.some((sn) => /\b(?:promise|oath|witness|fold)\b/i.test(sn) && /\b(?:broken|breaks|broke|forsworn|thin|failed to keep|scar|debt)\b/i.test(sn))) {
    flags.push({ kind: 'rule', text: 'Reverses an Oath the Engine just settled as kept: it narrates the promise as broken.' });
  }
  const CLOCK = new RegExp(`\\b(${clockAlt(state)})\\b`);
  const CLOCK_MOVE = /\b(moves?|moved|moving|tick(?:s|ed|ing)?|climb(?:s|ed|ing)?|advance[sd]?|advancing|rewind[sd]?|rewinding|drop(?:s|ed|ing)?|falls?|fallen|step(?:s|ped)?|jump(?:s|ed|ing)?|slid(?:e[sd]?|den)|nudge[sd]?|settle[sd]?|creep(?:s|ed|ing)?|spike[sd]?)\b/i;
  const clockLines = (state.log || []).filter((e) => e.kind === 'clock').slice(-12).map((e) => String(e.text)).join(' | ');
  const named = [...new Set(sentences.filter((sn) => CLOCK.test(sn) && CLOCK_MOVE.test(sn)).flatMap((sn) => sn.match(new RegExp(CLOCK.source, 'g')) || []))];
  const unpaidClock = named.filter((n) => !new RegExp(`\\b${n}\\b`).test(clockLines));
  if (unpaidClock.length) flags.push({ kind: 'rule', text: `Names ${unpaidClock.join(' and ')} moving when nothing moved it.` });
  // The count in the walls (bench 16 Nov, Gut Stone): narrated as shortening six turns running while TOLL
  // stood still at 3. A countdown the table hears getting closer has to be a Clock that moved.
  const countShortens = sentences.some((sn) => /\b(?:count|countdown|schedule|charge|rhythm|cadence|pump-rhythm|beats?)\b/i.test(sn) && /\b(?:lost|loses|losing|shorter|shortens|shortening|clicks?|closer|nearer|ticks?|ticking|skips?|skipped|skipping)\b/i.test(sn));
  // The count in the walls is The First Carve's (TOLL): other Vectors' clerks may tick and rhythms may skip.
  if (countShortens && (state.clocks || {}).TOLL && !(state.log || []).some((e) => e.seq > since && e.kind === 'clock')) {
    flags.push({ kind: 'rule', text: 'Names the count in the walls shortening when no Clock moved: say it holds steady, or move TOLL.' });
  }
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
export const MACHINERY = /\bone sentence of travel\b|\bthen the new place\b|Director-only|craft notes|\bthe award of\b|\bthe reveal of\b|\b(?:both|all) land here\b|site notes|\bthe notes\b|briefing|\btools?\s+(?:calls?|results?|schema)\b|\b(?:the|your|my)\s+tools?\s+(?:refused|returned|said|says|told|allows?)\b|ask_for_roll|\bthe Engine\b|\bthe Ledger (?:keeps|keep|kept|had|has|hold|holds|paid|pays|refuse|refuses|refused|own|owns|write|writes|wrote|record|records|never|itself|will)\b/i;

// The same rule, aimed at the prose WE hand the Director. Run 1 of the 13 Nov gate said "Next
// briefing will carry the Soft Field" to the players — a string of ours, quoted back — and a test now
// holds every tool description and refusal path to MACHINERY. The briefing is the largest block of our
// prose there is, so its own lines are held here. Two words MACHINERY flags are deliberately out: the
// model cannot act without reading its tool names, and the Vector's page prose, quoted verbatim into
// the briefing, legitimately writes "the harvest tool" (the Toll-Vent's Pays line) and "the Ledger's
// room" (a Lesson line). "the Ledger" is therefore caught only doing Engine verbs, exactly as above.
export const BRIEFING_LEAK = /Director-only|craft notes|site notes|\bthe notes\b|\bbriefing\b|\bthe Engine\b|the Ledger (?:keeps|keep|kept|had|has|hold|holds|paid|pays|refuse|refuses|refused|own|owns|write|writes|wrote|record|records|never|itself|will)/i;

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

// A player taking a listed exit. Bench 17 Nov (Long Swallow 3): "We go on to the Shelf" was met by a
// Sentinel holding the channel for eight turns although the notes print the Sentinels as a challenge,
// never a wall. The words the players use name the place, so the Engine can tell; it sends the turn
// back once, the way it does for a roll asked in words.
const GO = /\b(go|goes|going|head|heading|take|taking|cross|crossing|walk|swim|ride|leave|move|on to|onto|through|into|up to|down to|out to)\b/i;
const NAME_SKIP = new Set(['the', 'of', 'not', 'things', 'thing', 'nine', 'behind', 'organ', 'great', 'house', 'room']);
export function exitTaken(state, scenario) {
  const story = state.story || [];
  let i = story.length - 1;
  while (i >= 0 && story[i].kind !== 'say') { if (story[i].kind === 'narration') return null; i -= 1; }
  if (i < 0) return null;
  const text = String(story[i].text || '');
  if (!GO.test(text) || /\?\s*$/.test(text.trim())) return null;
  const site = scenario.sites.find((x) => x.id === state.scene.siteId);
  if (!site) return null;
  const low = text.toLowerCase();
  const here = new Set(String(site.name).toLowerCase().match(/[a-z]{4,}/g) || []);
  for (const id of reachable(scenario, site)) {
    const to = scenario.sites.find((x) => x.id === id);
    if (!to) continue;
    const words = (String(to.name).toLowerCase().match(/[a-z]{4,}/g) || []).filter((w) => !NAME_SKIP.has(w) && !here.has(w));
    if (words.some((w) => new RegExp(`\\b${w}`).test(low))) return to;
  }
  return null;
}

export async function directorTurn(args) {
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const done = await oneAttempt(args);
    if (done) {
      if (attempt > 0) done.rescues.unshift({ kind: 'retry', hard: false, text: `The Director said nothing the first ${attempt === 1 ? 'time' : attempt + ' times'} and the turn was run again.` });
      return done;
    }
  }
  throw new ProviderError('The Director used its tools but never said anything to the table, even after a second try. Press "Take a turn" again.');
}

// A roll to look, sense or work something out asked before the player said they try anything like it, in a
// turn that also asks what they do (Roly, 27 Nov, in the D&D Director: a character walked outside, and the
// Director asked what he did and put up an Investigation roll at once). The roll waits for the player's words.
const OPEN_Q = /\b(what do(?:es)?\s+(?:you|[A-Z][\w'-]*(?:\s[A-Z][\w'-]*)?)\s+do|what(?:'s| is) (?:your|their|its|his|her) move|what now|what will you do|what would you like to do|how do you (?:proceed|respond))\b[^.!]*\?\s*$/i;
const TRIES = /\b(look|search|investigat|examin|inspect|check|listen|stud(?:y|ies)|read|peer|scan|sniff|smell|taste|feel|probe|watch|observ|recall|rememb|know|sense|notic|spot|track|find|hunt|follow|scrutin|eye|sample|test)\w*/i;
const LOOKING = /\b(look|search|investigat|examin|inspect|notic|spot|sense|listen|stud|read|find|track|smell|taste|scan|probe|sample|identify|recall|know|work out)\w*/i;
function earlyRolls(before, after, narration) {
  if (!OPEN_Q.test(String(narration).slice(-240))) return [];
  const last = [...(before.story || [])].reverse().find((e) => e.kind === 'narration');
  const since = last ? last.seq : -1;
  const said = (before.story || []).filter((e) => e.kind === 'say' && e.seq > since).map((e) => e.text).join(' ');
  if (TRIES.test(said)) return [];
  const old = new Set((before.requests || []).map((q) => q.id));
  return (after.requests || []).filter((q) => !old.has(q.id) && q.kind === 'check' && q.actor && q.actor.kind === 'org'
    && (LOOKING.test(String(q.label || '')) || (q.pool && q.pool.baselineName === 'OSM')));
}

// Returns null when the model never narrated, so the caller can try again.
async function oneAttempt({ state, scenario, bestiary, provider, rng, now = 0, reason = '', hostNote = '', memory = null }) {
  const T = toolbox({ state, scenario, bestiary, rng, now, memory });
  const lastSay = [...(state.story || [])].reverse().find((e) => e.kind === 'say');
  const prePlay = !!(lastSay && lastSay.pre && !((state.players || {})[lastSay.pid] || {}).organismId);
  const chat = provider.start({ system: INSTRUCTIONS, tools: TOOLS });
  const calls = [];
  const usage = { in: 0, out: 0 };
  let reply = await chat.send(briefing(state, scenario, bestiary, { reason, hostNote, chapters: memory ? memory.chapters : [] }));
  let narration = '';
  let nudged = false;
  let rollNudged = false;
  let exitNudged = false;
  let rollHeld = false;
  // Phase 6 ("no rescue"): every point where a human host would have had to step in, or the code had to
  // step in for the model. Hard ones are what the gate counts; soft ones are reported.
  const rescues = [];
  let ranOut = true;
  // A creature round costs two or three calls a creature (move, strike, end turn): a squad of seven
  // ran out of 16 twice in the 15 Nov five-stage bench.
  const maxSteps = MAX_STEPS + 3 * Math.min(12, Object.keys(state.creatures || {}).length);
  for (let step = 0; step < maxSteps; step++) {
    usage.in += reply.usage.in;
    usage.out += reply.usage.out;
    if (reply.calls.length) {
      const results = reply.calls.map((c) => {
        // Before play (a player still choosing asked a question) the world does not move: only the
        // rule book and the table's memory may be consulted.
        const result = prePlay && !['look_up_rules', 'recall'].includes(c.name)
          ? { note: 'Nothing changed: a player who has not chosen an organism yet asked you something. Answer them as a guide at the table, in plain words, with no scene and no tools; end on one short question.' }
          : T.run(c.name, c.args);
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
    // A look-or-sense roll before the player tried anything, with "what does it do?" (earlyRolls): withdrawn, once.
    const early = narration && !rollHeld && !T.state.fight ? earlyRolls(state, T.state, narration) : [];
    if (early.length) {
      rollHeld = true;
      for (const q of early) T.do({ type: 'request.cancel', requestId: q.id });
      rescues.push({ kind: 'early-roll', hard: false, text: 'A roll asked before the player said what they try was withdrawn; the Engine sent the turn back.' });
      narration = '';
      reply = await chat.send('You asked for a roll before the player said what their organism tries, and you also asked what it does. The Engine has withdrawn the roll: wait for their words (they may say "I probe where the light was"; then ask for it). Narrate again without any roll, ending on your one question.');
      continue;
    }
    // The player took a listed exit and nothing moved: send it back once to call change_site.
    if (narration && !exitNudged && T.state.scene.siteId === state.scene.siteId) {
      const to = exitTaken(state, scenario);
      if (to) {
        exitNudged = true;
        narration = '';
        rescues.push({ kind: 'held-at-exit', hard: false, text: `A player took the listed exit to ${to.name} and the Director held the Cohort; the Engine sent the turn back.` });
        reply = await chat.send(`The player took a listed exit: they are going to ${to.name}. Call change_site with "${to.id}" now. Anything in the way (a creature's challenge, a hazard, a toll) is played as a cost on the way: a roll, damage or a Clock, never a stop. Then narrate the crossing and the arrival, and end on one question.`);
        continue;
      }
    }
    if (narration || nudged) { ranOut = false; break; }
    nudged = true;
    reply = await chat.send('You have not said anything to the table yet. Narrate now, in plain text, and end on one question.');
  }
  // A turn that ran out of steps (a long run of creature turns) or stayed silent after the nudge:
  // ask once more with no tools to call, and if even that is empty say the one thing the table needs,
  // so a fight never stalls on a quiet model.
  if (!narration) {
    rescues.push({ kind: ranOut ? 'out-of-steps' : 'silent', hard: false, text: ranOut ? `The Director used all ${maxSteps} steps on tool calls without narrating.` : 'The Director stayed silent even after being asked to narrate.' });
    try {
      const last = await chat.send('Stop calling tools. Say now, in two to four short sentences of plain text, what the table sees, and end on one question to one named organism.');
      usage.in += last.usage.in;
      usage.out += last.usage.out;
      narration = String(last.text || '').trim();
    } catch (e) { /* fall through to the plain line */ }
  }
  if (!narration) {
    const f = T.state.fight ? T.fightBrief() : null;
    const who = f && f.acting_now && !/^nobody/.test(f.acting_now) ? f.acting_now : '';
    narration = who ? `${who}, it is your turn. What do you do?` : 'What does the Cohort do?';
    rescues.push({ kind: 'plain-line', hard: true, text: 'The Director said nothing at all; the Engine asked the table what is next.' });
    calls.push({ name: '(plain line)', args: {}, result: { note: 'The Director said nothing; the Engine asked the table what is next.' } });
  }
  narration = dropForeign(narration.replace(/\*\*/g, '').trim());
  const moved = T.state.scene.siteId !== state.scene.siteId;
  const gloss = (scenario.kit || {}).glossary || [];
  // The Engine's own plain line ("What does the Cohort do?") is not the Director's prose to check.
  const ownLine = rescues.some((r) => r.kind === 'plain-line');
  let flags = checkNarration(narration, T.state, { moved, since: state.seq }).concat(prePlay || ownLine ? [] : wordFlags(narration, gloss, T.state));
  // One rewrite before anyone sees it, for a suspected leak, a reply that runs long, or one that
  // does not end on a question. A better rewrite replaces the draft; otherwise the draft and its
  // flags stand (and a leak is held for the host).
  const isLeak = (f) => f.kind === 'leak';
  const unpaid = (f) => f.kind === 'rule' && /^Says someone took damage/.test(f.text);
  const buriedF = (f) => f.kind === 'rule' && /is dead or dissolved, but the Engine/.test(f.text);
  const creDead = (f) => f.kind === 'rule' && /(?:is destroyed, but the Engine has it still fighting|^Says the fight is over, but)/.test(f.text);
  const unpaidClock = (f) => f.kind === 'rule' && /^Names .+ moving when nothing moved it/.test(f.text);
  const reversed = (f) => f.kind === 'rule' && /^Reverses /.test(f.text);
  const fixable = (f) => unpaid(f) || buriedF(f) || creDead(f) || unpaidClock(f) || reversed(f) || (f.kind === 'style' && /^(Long|Does not end|Reads out dice|Puts a new question|Puts the question to|Asks \d+ questions|Repeats an earlier|Mentions Pulse Points|Speaks of "the page"|Uses formatting|Contains characters|Gives )/.test(f.text))
    // Two or more new words left bare are worth a rewrite; one gets its meaning added by the Engine below.
    || (f.kind === 'style' && /^Uses a setting word/.test(f.text) && (f.words || []).length >= 2);
  if (flags.some((f) => isLeak(f) || fixable(f))) {
    const asks = [];
    if (flags.some(isLeak)) asks.push(`It gave away something the table must not hear: ${flags.filter(isLeak).map((f) => f.text).join(' ')} Leave out every creature number (no dice, Thresholds, Membrane Integrity, soak, or a count of how many Segments or sections are left) and do not name the briefing, the notes, the tools, the Engine or the Ledger: say what the organisms see and sense instead, and how much is left in the fiction - half of it, a scattering, still scenting you. "The page has nothing printed for that" is allowed.`);
    if (flags.some(unpaid)) asks.push('It describes harm that nothing paid for this turn: nobody was hurt. Say only what your calls actually did, and put no damage number in the scene.');
    if (flags.some(creDead)) { const names = [...new Set(flags.filter(creDead).flatMap((f) => f.creatures || []))]; asks.push(`It says ${names.join(' and ')} is destroyed or that the fight is over, but the Engine has ${names.length > 1 ? 'them' : 'it'} still up and fighting: the strike hurt ${names.length > 1 ? 'them' : 'it'}, nothing more. Describe ${names.join(' and ')} as badly hurt (torn, leaking, faltering) and still there, and keep the fight going.`); }
    if (flags.some(buriedF)) asks.push('It says a player\'s body is dead or dissolved, but the Engine has them standing: only a tool can end a body. Keep them alive and hurting, and say no one is gone.');
    if (flags.some(unpaidClock)) asks.push('It names a Clock moving when nothing moved it: no Clock changed. Name only a Clock the page actually moved, with the segments it stands at, or say nothing about Clocks at all.');
    if (flags.some(reversed)) asks.push('It describes the opposite of a throw the page has already passed: that throw succeeded and the player saw the total on their own screen. Say what the success did - and what it cost, if the page priced a cost - and do not undo it.');
    if (flags.some((f) => /^Long/.test(f.text))) asks.push('It is too long: use two to four short sentences, under 90 words, keeping only what the players need to act.');
    if (flags.some((f) => /^Asks \d+ questions/.test(f.text))) asks.push('It asks the table more than one question: ask exactly one, to one named organism, and fold any other choice into it ("do you X, or Y?"). What a character in the fiction says aloud may stay a question.');
    if (flags.some((f) => /^Mentions Pulse Points/.test(f.text))) asks.push('It mentions Pulse Points, but no Pulse War is running: leave Pulse Points out and say only what the Cohort sees and can do.');
    if (flags.some((f) => /^Speaks of "the page"/.test(f.text))) asks.push('It speaks of "the page" as though the players could read it. Say what is true in the fiction instead; only "The page has nothing printed for that" may name it.');
    if (flags.some((f) => /^Uses formatting/.test(f.text))) asks.push('It uses formatting or a heading in capitals. Write plain sentences only, and put a rule or a roll result in the fiction ("the cut ran wild") rather than naming it.');
    if (flags.some((f) => /^Contains characters/.test(f.text))) asks.push('It contains a word in another language or script. Write every word in English.');
    if (flags.some((f) => /^Repeats an earlier/.test(f.text))) asks.push('It repeats words you already used in an earlier line: say what is new this time, as this roll changed it, in fresh words.');
    if (flags.some((f) => /^Reads out dice/.test(f.text))) asks.push('It reads out dice counts or Thresholds outside a Pulse War: the player sees those on their own screen, so leave the numbers out.');
    if (flags.some((f) => /^Uses (?:a setting word|\d+ new setting words)/.test(f.text))) asks.push(wordAsk(flags));
    if (flags.some((f) => /^Does not end/.test(f.text))) asks.push('It does not end on a question: end on exactly one question, put to one named organism.');
    const gave = flags.find((f) => /^Gives /.test(f.text));
    if (gave) asks.push(`${gave.speaker} is the one who spoke and acted: open with what ${gave.speaker} does and what happens to them, in their own words, before anyone else moves.`);
    const wrongSeat = flags.find((f) => /^Puts the question to/.test(f.text));
    if (wrongSeat) asks.push(`It puts the closing question to the wrong player: it is ${wrongSeat.turnOf}'s turn. End on one question for ${wrongSeat.turnOf}.`);
    if (flags.some((f) => /^Puts a new question/.test(f.text))) {
      const w = [...new Set((T.state.requests || []).map((r) => ((r.kind === 'incoming' ? r.target : r.actor) || {}).name).filter(Boolean))];
      asks.push(`A throw is still in the air (${w.join(', ')}), so nobody else's turn has come and you do not know the outcome. Do not put a choice to anyone else, and do not describe what happens next. Keep the beat on the throw and end on one question for ${w[0]} about it.`);
    }
    try {
      const fix = await chat.send(`Rewrite your whole reply. ${asks.join(' ')} Keep the same events and any roll you asked for, in plain text, ending on one question. Do not call any tools.`);
      usage.in += fix.usage.in;
      usage.out += fix.usage.out;
      const text = dropForeign(String(fix.text || '').replace(/\*\*/g, '').trim());
      const again = text && !(fix.calls || []).length ? checkNarration(text, T.state, { moved, since: state.seq }).concat(prePlay ? [] : wordFlags(text, gloss, T.state)) : null;
      const bad = (list) => list.filter((f) => isLeak(f) || f.kind === 'style' || f.kind === 'rule').length;
      if (again && !again.some(isLeak) && bad(again) < bad(flags)) {
        const why = flags.some(isLeak) ? 'the first draft gave away a creature\'s numbers or the machinery'
          : flags.some(buriedF) ? 'the first draft buried a body the Engine still had standing'
          : flags.some(unpaid) ? 'the first draft described damage the Engine never paid'
            : flags.some((f) => /^Puts a new question/.test(f.text)) ? 'the first draft moved the table on while a throw was still in the air'
              : flags.some((f) => /^Uses (?:a setting word|\d+ new setting words)/.test(f.text)) ? 'the first draft used setting words the table had not been told'
              : 'the first draft ran long, read out dice, or did not end on a question';
        narration = text;
        flags = [...again, { kind: 'note', text: `Rewritten once: ${why}.` }];
      }
    } catch (e) { /* the rewrite failed: keep the original and its flags */ }
  }
  // A new setting word still left bare (one alone, or what the rewrite missed): the Engine puts its plain
  // meaning in brackets after it, so no player is left guessing (a human player, 27 Nov).
  if (!prePlay && !rescues.some((r) => r.kind === 'plain-line') && flags.some((f) => /^Uses a setting word/.test(f.text))) {
    const g = glossInline(narration, gloss, T.state);
    if (g.words.length) {
      narration = g.text;
      flags = flags.filter((f) => !/^Uses a setting word/.test(f.text)).concat([{ kind: 'note', text: `The Engine added the plain meaning of ${g.words.join(', ')}.` }]);
    }
  }
  // The model keeps asking the wrong seat even after a rewrite (bench 15 Nov, three times). The Engine
  // knows whose turn it is, so it sets the closing question itself rather than ship the wrong one.
  const seat = flags.find((f) => /^Puts the question to/.test(f.text) && f.turnOf);
  if (seat) {
    const fixed = fixSeat(narration, seat.turnOf, (seat.text.match(/^Puts the question to (.+?), but/) || [])[1] || '');
    if (fixed) { narration = fixed; flags = flags.filter((f) => f !== seat).concat([{ kind: 'note', text: `The Engine set the closing question to ${seat.turnOf}, whose turn it is.` }]); }
  }
  {
    const closed = breakLoop(narration, T.state, T.site().id);
    if (closed) { narration = closed; flags = flags.concat([{ kind: 'note', text: 'The Engine closed a question that had been asked three times and passed the floor.' }]); }
  }
  // v3 (bench 16 Nov, iq3_s: "six sections thick", "Four sections left" survived the rewrite twice).
  // A leak is nearly always one sentence. Rather than hold the whole reply for a host, cut the
  // sentences that carry it and check again; only what still leaks afterwards is held.
  if (flags.some(isLeak)) {
    const cut = scrubLeaks(narration, (t) => checkNarration(t, T.state, { moved, since: state.seq }).filter(isLeak).length);
    if (cut) { narration = cut; flags = checkNarration(cut, T.state, { moved, since: state.seq }).concat([{ kind: 'note', text: 'The Engine cut a sentence that gave away a number.' }]); }
  }
  if (flags.some(isLeak)) rescues.push({ kind: 'held-leak', hard: true, text: `A leak survived the rewrite and would be held for the host: ${flags.filter(isLeak).map((f) => f.text).join(' ')}` });
  if (T.refusals) flags.push({ kind: 'rule', text: `The Engine refused ${T.refusals} thing${T.refusals > 1 ? 's' : ''} the Director tried. Nothing refused took effect.` });
  T.do({ type: 'narrate', text: narration, by: 'ai', words: wordsUsed(narration, gloss, T.state) });
  return { state: T.state, narration, calls, flags, usage, refusals: T.refusals, rescues };
}
