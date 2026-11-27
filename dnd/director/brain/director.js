// The AI Director's turn: build the briefing, let the model use its tools, check what it wants to
// say, and hand back the new state and the narration. The model never touches the Ledger directly.

import { readFileSync } from 'node:fs';
import { TOOLS, toolbox, statLine } from './tools.js';
import { rulesHere } from '../engine/ledger.js';
import * as R from '../engine/rules.js';
import * as MAP from '../engine/map.js';
import * as SEEDS from '../engine/seeds.js';
import { ProviderError } from './net.js';
import { dropForeign } from './foreign.js';

export const INSTRUCTIONS = readFileSync(new URL('./instructions.md', import.meta.url), 'utf8');
const MAX_STEPS = 14;
const ATTEMPTS = 2;

const pcLine = (s, p, srd) => {
  const pl = p.playerId && s.players[p.playerId] ? `played by ${s.players[p.playerId].name}` : 'no player: you play them';
  const hp = p.dead ? 'DEAD' : p.hp <= 0 ? (p.stable ? 'at 0 hp, unconscious but stable' : `at 0 hp and DYING (${p.death.s} successes, ${p.death.f} failures)`) : `HP ${p.hp}/${p.maxHp}${p.tempHp ? ` +${p.tempHp} temp` : ''}`;
  const bits = [
    `${p.name} (id ${p.id}, ${pl}): level ${p.level} ${p.raceName} ${p.clsName}${p.subclassName ? ` (${p.subclassName})` : ''}`,
    hp, `AC ${p.ac}`, `passive Perception ${p.passive}`,
    p.conds.length ? `conditions: ${p.conds.join(', ')}` : '', p.exhaustion ? `exhaustion ${p.exhaustion}` : '',
    p.conc ? `concentrating on ${p.conc.name}` : '', p.raging ? 'raging' : '',
    p.cast ? `spell save DC ${p.cast.dc}` : '', p.inspiration ? 'has inspiration' : '',
    `skills: ${p.skills.map((x) => (R.index(srd).skill[x] || {}).name || x).join(', ')}`,
  ];
  return `- ${bits.filter(Boolean).join('; ')}.`;
};

// An open quest that ends at this place, when every roll since the last narration succeeded and the Director
// has not called complete_quest this turn.
function questWon(s, adventure, sinceSeq, calls) {
  if (calls.some((c) => c.name === 'complete_quest')) return null;
  const ends = ((adventure || {}).questDone || []).filter((qd) => (qd.at || []).includes(s.scene.siteId));
  const open = (s.quests || []).find((q) => !q.done && ends.some((qd) => q.text.toLowerCase().includes(qd.match)));
  if (!open) return null;
  const rolls = (s.story || []).filter((e) => e.roll && e.seq > sinceSeq && / (succeeds on|fails) an? /.test(e.text));
  if (!rolls.length || rolls.some((e) => / fails an? /.test(e.text))) return null;
  return open;
}
// A roll to look, search or know asked before the player said they try anything like it, in a turn that also
// asks them what they do (Roly, 27 Nov: a character walked outside, and the Director asked what he did and put up
// an Investigation roll at once). The roll waits for the player's words: "I look around", "I search where the
// lamp was".
const OPEN_Q = /\b(what do(?:es)?\s+(?:you|[A-Z][\w'-]*(?:\s[A-Z][\w'-]*)?)\s+do|what(?:'s| is) (?:your|their|his|her) move|what now|what will you do|what would you like to do|how do you (?:proceed|respond))\b[^.!]*\?\s*$/i;
const TRIES = /\b(look|search|investigat|examin|inspect|check|listen|stud(?:y|ies)|read|peer|scan|sniff|feel|probe|watch|observ|recall|rememb|know|sense|notic|spot|track|find|hunt|follow|scrutin|eye|sound out|size up)\w*/i;
const INFO_SKILLS = new Set(['investigation', 'perception', 'insight', 'arcana', 'history', 'religion', 'nature', 'medicine']);
function earlyRolls(before, after, narration) {
  if (!OPEN_Q.test(String(narration).slice(-240))) return [];
  const since = lastNarrSeq(before);
  const said = (before.story || []).filter((e) => e.kind === 'say' && e.seq > since).map((e) => e.text).join(' ');
  if (TRIES.test(said)) return [];
  const old = new Set((before.requests || []).map((q) => q.id));
  return (after.requests || []).filter((q) => !old.has(q.id) && q.by === 'ai' && q.kind === 'check' && INFO_SKILLS.has(q.skill));
}
const lastNarrSeq = (s) => { const n = [...(s.story || [])].reverse().find((e) => e.kind === 'narration'); return n ? n.seq : 0; };
export function briefing(state, adventure, srd, { reason = '', hostNote = '', chapters = [], lastSeq: since = null } = {}) {
  const s = state;
  const site = (adventure.sites || []).find((x) => x.id === s.scene.siteId) || (adventure.sites || [])[0] || {};
  const lastSeq = since != null ? since : lastNarrSeq(s);
  const narrHere = s.story.filter((e) => e.kind === 'narration' && e.site === site.id).length;
  const out = [];
  out.push(`WHY YOU ARE TAKING A TURN: ${reason || 'the table is waiting for the DM'}.`);
  if (hostNote) out.push(`A NOTE FROM THE HUMAN HOST (follow it): ${hostNote}`);
  out.push(`ADVENTURE: ${adventure.name}.${!s.started ? ` This is the very start of the game. Open with the adventure's introduction in your own words: ${adventure.intro}` : ''}`);
  if (adventure.director) out.push(`HOW TO RUN THIS ADVENTURE: ${adventure.director}`);
  out.push(`TIME: day ${s.time.day}, ${String(Math.floor(s.time.hour)).padStart(2, '0')}:00.`);

  out.push(`\nWHERE THE PARTY IS: ${site.name} (id ${site.id}).`);
  if (narrHere === 0) out.push(`They have just arrived. Describe it once now (read-aloud, put in your own words if you like): ${site.read}`);
  else out.push(`You have already described this place (${narrHere} narration${narrHere > 1 ? 's' : ''} here). Do not describe it again: only what changes.`);
  out.push(`NOTES FOR THIS PLACE (for you only, never read out): ${site.notes || 'none'}`);
  if ((site.npcs || []).length) out.push(`PEOPLE HERE:\n${site.npcs.map((n) => `- ${n.name}: ${n.who}. Voice: ${n.voice}. Wants: ${n.wants}.`).join('\n')}`);
  if ((site.checks || []).length) out.push(`WHAT A SUCCESSFUL CHECK REVEALS HERE:\n${site.checks.map((c) => `- ${(R.index(srd).skill[c.skill] || {}).name || c.skill} DC ${c.dc}: ${c.find}`).join('\n')}`);
  if (site.treasure) out.push(`TREASURE HERE (give it when found): ${site.treasure}`);
  if ((site.objects || []).length) out.push(`THINGS HERE A CHARACTER CAN USE (call use_object when one is opened, pulled, read or searched; the place's rules may make something happen):\n${site.objects.map((o) => (typeof o === 'string' ? `- ${o}` : `- ${o.name}${o.note ? `: ${o.note}` : ''}`)).join('\n')}`);
  out.push(`EXITS: ${(site.exits || []).map((e) => `${e.to} (${e.label})`).join('; ') || 'none'}`);
  const rulesText = rulesBrief(s, adventure, lastSeq);
  if (rulesText) out.push(`\n${rulesText}`);

  const foes = Object.values(s.foes).filter((f) => f.siteId === site.id);
  if (foes.length) {
    out.push(`\nMONSTERS HERE:\n${foes.map((f) => `- ${f.name} (id ${f.id}, ${f.mid})${f.dead ? `: ${f.fled ? 'fled' : 'down'}` : `: HP ${f.hp}/${f.maxHp}, AC ${f.ac}${f.conds.length ? `, ${f.conds.join(', ')}` : ''}${f.hidden ? (f.maybe ? ', ONLY MAY TURN UP (the adventure says so: it is not here unless the story brings it; reveal it or name it in start_combat if it does)' : ', HIDDEN (the players have not seen it)') : ''}${f.calm ? ', STANDING DOWN (not fighting; an attack on it starts a fight)' : ''}${Object.keys(f.spent || {}).length ? `, used: ${Object.keys(f.spent).join(', ')}` : ''}`}${f.note ? `. ${f.note}` : ''}`).join('\n')}`);
    const kinds = [...new Set(foes.filter((f) => !f.dead).map((f) => f.mid))];
    const ix = R.index(srd);
    if (kinds.length) out.push(`STAT BLOCKS (for you only):\n${kinds.map((k) => `- ${statLine(ix.monster[k])}`).join('\n')}`);
  }

  const pcs = Object.values(s.pcs);
  out.push(`\nTHE PARTY:\n${pcs.length ? pcs.map((p) => pcLine(s, p, srd)).join('\n') : '- Nobody has made a character yet. Welcome the table and ask them to make their characters.'}`);
  const players = Object.values(s.players).filter((p) => !p.pcId);
  if (players.length) out.push(`At the table without a character yet: ${players.map((p) => p.name).join(', ')}.`);

  const mapText = mapBrief(s, site);
  if (mapText) out.push(`\n${mapText}`);

  if (s.fight) {
    const f = s.fight;
    const nm = (k) => { const [kind, id] = k.split(':'); return kind === 'pc' ? s.pcs[id].name : s.foes[id].name; };
    if (f.phase === 'initiative') out.push(`\nFIGHT: waiting for initiative rolls from ${s.requests.filter((q) => q.kind === 'initiative').map((q) => s.pcs[q.pcId].name).join(', ')}. Describe the moment battle is joined; do not take turns yet.`);
    else {
      const cur = f.order[f.turn].key;
      const pc = cur.startsWith('pc:') ? s.pcs[cur.slice(3)] : null;
      out.push(`\nFIGHT, round ${f.round}. Order: ${f.order.map((o) => `${nm(o.key)} (${o.init})`).join(', ')}.`);
      out.push(`ACTING NOW: ${nm(cur)}: ${pc ? (pc.playerId ? 'a player. Describe the moment and ask them what they do. Do not act for them.' : 'a character with no player: you choose what they do (use their sheet), then end_turn.') : 'a monster. Act for it with monster_action (or another tool), then end_turn. Then, if the next in the order is also a monster, act for it too; stop when a player is up.'}`);
      if (pc && pc.hp <= 0 && !pc.dead && !pc.stable) out.push(`${pc.name} is dying: the death save is on their screen.`);
    }
  }

  if (s.requests.length) out.push(`\nROLLS WAITING (do not narrate their outcome yet): ${s.requests.map((q) => `${(s.pcs[q.pcId] || {}).name}: ${q.kind === 'initiative' ? 'initiative' : q.kind === 'death' ? 'death save' : q.skill ? `${(R.index(srd).skill[q.skill] || {}).name} check DC ${q.dc}` : `${R.ABILITY_NAMES[q.ability]} ${q.kind} DC ${q.dc}`}${q.reason ? ` (${q.reason})` : ''}`).join('; ')}.`);

  const fresh = s.rolls.filter((r) => r.seq > lastSeq);
  if (fresh.length) out.push(`\nROLLS SINCE YOUR LAST NARRATION:\n${fresh.slice(-16).map((r) => `- ${r.who}: ${r.label}${r.reason ? ` (${r.reason})` : ''}: ${r.total}${r.at != null ? ` against ${r.at}` : ''}${r.success === true ? ', SUCCESS' : r.success === false ? ', FAILURE' : ''}${r.crit ? ', critical' : ''}${r.dmg && r.dmg.total != null ? `, ${r.dmg.total} damage` : ''}`).join('\n')}`);

  // Only this place's clocks and those that run everywhere: a clock left behind at the bridge must not
  // keep the bridge burning in Oakhurst (bench part 4, 24 Nov).
  const clocks = (s.clocks || []).filter((c) => !c.siteId || c.siteId === site.id);
  if (clocks.length) out.push(`\nCLOCKS (tick them with the clock tool when the notes say): ${clocks.map((c) => `${c.name} (id ${c.id}): ${c.filled} of ${c.size}${c.done ? ', FULL' : ''}${c.hidden ? ', hidden from the players' : ''}. When full: ${c.note || 'it happens'}`).join('; ')}`);
  const open = s.quests.filter((q) => !q.done);
  if (s.quests.length) out.push(`\nQUESTS: ${s.quests.map((q) => `${q.id} ${q.done ? '(done) ' : ''}${q.text}`).join('; ')}`);
  void open;
  if (s.loot.length) out.push(`PARTY LOOT NOT YET CLAIMED: ${s.loot.map((x) => `${x.qty > 1 ? `${x.qty} ` : ''}${x.name}`).join(', ')}.`);
  // A seed that has just come into play (the Engine's moment or the Director's choice): play it now.
  const now = s.seedNow && s.seedNow.seq > since ? (s.seeds || []).find((x) => x.id === s.seedNow.id) : null;
  if (now) out.push(`\nA STORY SEED COMES INTO PLAY NOW (${s.seedNow.by === 'engine' ? `its moment came: ${s.seedNow.why}` : 'your choice'}). Bring it into the scene this turn${s.seedNow.foes.length ? `; these have arrived and are in MONSTERS HERE: ${s.seedNow.foes.join(', ')}` : ''}${s.fight ? ' (the fight is on)' : ''}:\n${now.text}`);
  // The DM's seeds still free here, each with when it comes in: the Engine brings in its moments by itself;
  // the Director may call use_seed for trouble it sees (a shopkeeper harassed) or when one simply fits.
  const seeds = (s.seeds || []).filter((x) => x.on && (!now || x.id !== now.id) && SEEDS.seedFree(x, s, site.id));
  if (seeds.length) out.push(`\nTHE DM'S OWN STORY SEEDS (call use_seed with the seed's id to bring one in when its moment comes or it fits; the Engine brings in "lost" and "camp" seeds by itself):\n${seeds.map((x) => `[${x.id}] ${SEEDS.whenWords(SEEDS.seedPlan(x.text))}:\n${x.text}`).join('\n---\n')}`);
  if (chapters.length) out.push(`\nTHE STORY SO FAR:\n${chapters.map((c) => `- ${c.site}: ${c.text}`).join('\n')}`);

  const recent = s.story.slice(-16);
  if (recent.length) out.push(`\nRECENTLY AT THE TABLE (newest last; lines after your last narration are new):\n${recent.map((e) => `${e.seq > lastSeq ? '* ' : '  '}${e.who ? `${e.who}: ` : ''}${e.text}`).join('\n')}`);
  out.push('\nNow take your turn: use any tools you need, then narrate, ending on one question to one named character.');
  return out.join('\n');
}

// Where everyone stands, zone by zone (the Map tab's zones), and who is close enough to strike whom.
export function mapBrief(s, site) {
  const m = s.map;
  if (!m || !m.show || !(m.show.zones || m.show.grid)) return '';
  const zones = (m.zones || {})[site.id];
  if (!zones || !zones.length) return '';
  const name = (k) => { const [kind, id] = k.split(':'); const o = kind === 'pc' ? s.pcs[id] : s.foes[id]; return o ? `${o.name}${o.dead ? ' (down)' : ''}${kind === 'foe' && o.hidden ? ' (hidden)' : ''}` : ''; };
  const here = Object.entries(m.at || {}).filter(([k, p]) => p.site === site.id && name(k));
  const lines = zones.map((z) => {
    const who = here.filter(([, p]) => p.zone === z.id).map(([k]) => name(k));
    const tags = (z.tags || []).map((t) => MAP.TAGS[t]).filter(Boolean);
    return `- ${z.name}${tags.length ? ` (${tags.join(', ')})` : ''}: ${who.join(', ') || 'nobody'}${z.note ? `. ${z.note}` : ''}`;
  });
  const links = [];
  for (const z of zones) for (const l of z.links || []) if (z.id < l) links.push(`${z.name}–${(zones.find((x) => x.id === l) || {}).name}`);
  const close = [];
  const pcs = here.filter(([k]) => k.startsWith('pc:')); const foes = here.filter(([k]) => k.startsWith('foe:'));
  for (const [pk, pp] of pcs) for (const [fk, fp] of foes) if (MAP.inReach(pp, fp) && !s.pcs[pk.slice(3)].dead && !s.foes[fk.slice(4)].dead) close.push(`${name(pk)} and ${name(fk)}`);
  return [
    `MAP (zones about 30 feet across; players move their own characters, move_creature moves the monsters; a melee monster_action steps up to its target${m.show.reach ? '; the reach and range rules are ON: a monster can only strike someone it can reach within its speed' : ''}):`,
    ...lines,
    links.length ? `Ways between zones: ${links.join(', ')}.` : '',
    close.length ? `Within melee reach: ${close.join('; ')}.` : '',
  ].filter(Boolean).join('\n');
}

// The adventure's rules here and what the Engine did by itself since the last narration (engine/triggers.js).
export function rulesBrief(s, adventure, lastSeq = 0) {
  if (s.auto && s.auto.rules === false) return '';
  const lines = [];
  const list = rulesHere(s, adventure);
  const fit = (s.fits || {})[s.scene.siteId];
  const did = (s.log || []).filter((l) => l.kind === 'rule' && l.seq > lastSeq).map((l) => l.text);
  lines.push('THE ADVENTURE\'S RULES HERE (the Engine carries them out by itself when they happen: you narrate them, you do not call tools for them; if the story has gone another way, override_rule with the rule\'s id and why):');
  for (const r of list) lines.push(`- [${r.key}] ${r.words}${r.status === 'waiting' ? '' : r.status === 'off' ? ` (SWITCHED OFF${r.why ? `: ${r.why}` : ''})` : r.status === 'done' ? ' (DONE)' : ' (passed)'}`);
  lines.push('- [*/attack] An attack on anyone here with no fight on starts the fight. The fight ends by itself when no foe in it is left standing (it pays its XP).');
  const waits = [list.some((r) => r.ev === 'use' && r.status === 'waiting') ? 'a rule on a character using something happens when you call use_object for it' : '',
    list.some((r) => r.zone && r.status === 'waiting') ? 'a rule on a character entering an area happens when they are moved there on the map (move_creature)' : ''].filter(Boolean);
  if (waits.length) lines.push(`So that they can happen: ${waits.join('; ')}.`);
  if (fit && fit.text) lines.push(`FITTED TO THIS PARTY: ${fit.text} Describe the numbers as they are here, not as the notes give them.`);
  if (did.length) lines.push(`THE ENGINE DID THIS BY ITSELF SINCE YOUR LAST NARRATION (narrate it): ${did.join(' ')}`);
  return lines.join('\n');
}

// A player's line that says they attack someone here: "I attack Grisk!", "I swing at the nearest rat!",
// "I kick in the door and attack the nearest smuggler!", "I charge the gate!". Not a question, not "I
// don't attack". Strong words (attack, charge) need no target; the others must name a foe here or say
// "the nearest", "them" and the like. The Engine starts the fight; the Director can call it off.
const STRONG = /\b(?:attacks?|attacking|charges?|charging)\b/i;
const OTHER = /\b(?:swing(?:s)? (?:at|my|his|her)|strikes? (?:at|the|him|her|it|them)|stabs?|smash(?:es)? (?:the|him|her|it|them|into)|slash(?:es)? (?:at|the)|shoots?|fires? (?:at|on)|loose (?:an? (?:arrow|bolt)|at)|lunges? (?:at|for)|hacks? (?:at|into)|cuts? down|bash(?:es)? (?:the|him|her|it|them)|punch(?:es)?|cast \w+(?: \w+)? at)\b/i;
const CALM = /\b(?:don['’]?t|do not|won['’]?t|will not|never|not|without|instead of|refuse to|hold off|hold back|stop|sheathe|put away|lower my|ready|readies|if|unless|should|could|would|might|maybe|wait)\b/i;
export function declaresAttack(text, state) {
  const here = Object.values(state.foes || {}).filter((f) => f.siteId === state.scene.siteId && !f.dead);
  if (!here.length || state.fight) return false;
  const foeWords = new Set(here.flatMap((f) => [f.name, f.base, f.mid].filter(Boolean).flatMap((x) => String(x).toLowerCase().replace(/-/g, ' ').split(/\s+/))).filter((w) => w.length > 3 && !/^\d+$/.test(w)));
  const generic = /\b(?:nearest|closest|enemy|enemies|foes?|monsters?|them|him|her|it|leader|captain|guards?|sentr(?:y|ies))\b/i;
  for (const sent of String(text || '').split(/(?<=[.!?])\s+/)) {
    if (/\?\s*["”]?$/.test(sent.trim()) || !/\b(?:I|[Ww]e)\b/.test(sent) || CALM.test(sent)) continue;
    const words = sent.toLowerCase().replace(/[^a-z\s'-]/g, ' ').split(/\s+/).map((w) => w.replace(/(?:es|s)$/, ''));
    const named = words.some((w) => [...foeWords].some((f) => f.replace(/(?:es|s)$/, '') === w)) || generic.test(sent);
    if (STRONG.test(sent) || (OTHER.test(sent) && named)) return true;
  }
  return false;
}

// Before the model's turn: the Engine starts the game's first place (its rules on arrival, such as an
// ambush) on the Director's first turn, and hears a player's declared attack. What it did goes in `calls`.
export function beforeTurn(T, state) {
  const out = [];
  const did = (name, action) => {
    const before = T.state.seq;
    const no = T.do(action);
    const fired = (T.state.log || []).filter((l) => l.seq > before && l.kind === 'rule').map((l) => l.text);
    out.push({ name, args: action, result: no ? { note: no } : fired.length ? { adventure_rules: fired } : { ok: true } });
  };
  if (!state.started && Object.values(state.pcs || {}).some((p) => !p.dead)) did('(the game begins)', { type: 'rules.run', starting: true });
  if (!T.state.fight) {
    const lastNarr = [...(state.story || [])].reverse().find((e) => e.kind === 'narration');
    const fresh = (state.story || []).filter((e) => e.kind === 'say' && e.pcId && (!lastNarr || e.seq > lastNarr.seq));
    const line = fresh.find((e) => declaresAttack(e.text, T.state));
    // An attack where nobody here is a foe (the party turns on a shopkeeper): a seed for picking trouble
    // may bring someone out to stop them (engine/seeds.js).
    const foesHere = Object.values(T.state.foes || {}).some((f) => f.siteId === T.state.scene.siteId && !f.dead && !f.calm);
    if (line && !foesHere) seedDid(T, out, '(trouble picked)', { type: 'seed.check', event: 'provoke', text: line.text });
    if (line) did('(a player attacks)', { type: 'rule.event', event: 'attack', by: `pc:${line.pcId}` });
  }
  // Is the party getting anywhere? (a "lost" seed after so many turns of nothing moving on)
  if (state.started) seedDid(T, out, '(the story checks itself)', { type: 'seed.check' });
  return out;
}

// A seed check is shown among the calls only when a seed came into play or was rolled for.
function seedDid(T, out, name, action) {
  const before = (T.state.seedLog || []).length;
  T.do(action);
  const rows = (T.state.seedLog || []).slice(before);
  if (rows.length) out.push({ name, args: action, result: { story_seeds: rows.map((r) => `${r.title}: ${r.fired ? 'comes into play' : `rolled ${r.roll} against ${r.chance}%, not this time`}`) } });
}

// ---- checking what the model wants to say -------------------------------------------------------
export const LEAK = /\bno tools? (?:needed|called|required|used)\b|\b(?:tool|function) calls?\b|\b(?:in|from|per|according to|check(?:ing)?|following|consult(?:ing)?) the notes\b|\bthe notes (?:say|says|said|tell|tells|told|give|gives|gave|list|lists|listed|mention|mentions|mentioned|describe|describes|described|for this|for the)\b|\bbriefing\b|\bthe Engine\b|\bthe Ledger\b|\bthe tools?\b|\bread-aloud\b|\bfor you only\b|\bstat block\b|\bDM only\b/i;
// Bench, 20 Nov: "only two hit-points of spite left in him" (a goblin's hit points, in words) got through.
const NUM = '(?:\\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|a few|a couple of)';
const NUMBERS = new RegExp(`\\b(?:AC|Armou?r Class)\\s*(?:of\\s*)?\\d+|\\bDC\\s*\\d+|\\b${NUM}\\s*(?:hit[- ]points?|hp)\\b|\\+\\d+\\s*to hit\\b`, 'i');
// A roll asked for in words: "make a Perception check", "give me a Dexterity save", "roll a d20", "roll for
// initiative", "roll for it". Not "the wagons roll a mile" (bench part 4, 25 Nov): a bare "roll a" or
// "roll for" needs dice, initiative or a check after it.
const ROLL_WORDS = /\b(?:make|roll|give me|i need|let's see)\b[^.?!]{0,40}\b(?:check|saving throw|save|roll)\b|\broll (?:me )?(?:an? )?(?:d\d+|dice|die|initiative)\b|\broll for (?:initiative|it|\w+(?: \w+)? (?:check|save|saving throw))\b/i;

export function checkNarration(text, state, { asked = false } = {}) {
  const flags = [];
  const t = String(text || '');
  if (LEAK.test(t)) flags.push({ kind: 'leak', text: `Mentions the machinery ("${(t.match(LEAK) || [])[0]}").` });
  if (NUMBERS.test(t)) flags.push({ kind: 'leak', text: `Gives away a number the players should not hear ("${(t.match(NUMBERS) || [])[0]}").` });
  const words = t.split(/\s+/).filter(Boolean).length;
  if (words > 170) flags.push({ kind: 'style', text: `Long: ${words} words.` });
  const outside = t.replace(/"[^"]*"|“[^”]*”/g, '');
  // A turn that asked for a roll may end on the roll itself: the player's next move is to roll it.
  if (!asked && !/\?\s*["”]?\s*$/.test(t.trim())) flags.push({ kind: 'style', text: 'Does not end on a question.' });
  const q = (outside.match(/\?/g) || []).length;
  if (q > 2) flags.push({ kind: 'style', text: `Asks ${q} questions.` });
  if (/\*\*|^#+\s|^\s*[-*]\s/m.test(t)) flags.push({ kind: 'style', text: 'Uses formatting.' });
  if (!asked && ROLL_WORDS.test(outside)) flags.push({ kind: 'roll', text: 'Asks for a roll in words.' });
  for (const p of Object.values(state.pcs || {})) {
    if (p.dead) continue;
    // Bench 4: "Bryn is sitting up now" while the Engine still had him dying at 0 hit points.
    const first = p.name.split(/\s+/)[0];
    if (p.hp <= 0 && new RegExp(`\\b${first}\\b(?:(?!\\b(?:never|not|no longer|cannot|can't|can’t|won't|won’t|doesn't|doesn’t|didn't|didn’t|fails? to|unable to)\\b)[^.?!]){0,30}\\b(?:sits? up|sitting up|stands? up|gets? up|on (?:his|her|their) feet|climbs? to (?:his|her|their) feet)\\b`, 'i').test(t)) flags.push({ kind: 'rule', text: `Says ${p.name} is up, but they are at 0 hit points: only healing wakes them.` });
    if (saysDead(t, first)) flags.push({ kind: 'rule', text: `Says ${p.name} is dead, but they are alive.` });
  }
  return flags;
}

// Does the narration say this character dies? The name has to be the one dying: "Bryn falls and dies",
// "Ila is dead". Not when something else does (bench part 3, 24-25 Nov): "Bryn lifts the lantern, but
// its light dies", "grey flame leaps at Ila and dies against her shield", "Bryn's torch dies".
const NOT_SUBJECT_BEFORE = /\b(?:at|to|with|from|against|into|onto|upon|toward|towards|over|under|on|of|by|for|beside|behind|past|near|around|through|across|after|before|like|than)\s+$/i;
const NOT_IN_BETWEEN = /^(?:the|a|an|its|who|which|that|whose|whom|at|to|with|from|against|into|onto|upon|toward|towards|over|under|on|of|by|for|beside|behind|past|near|around|through|across|after|before|like|than)$/i;
const DEATH = /^((?:\s+[A-Za-z'’-]+){0,5}?)\s+(?:dies|is dead|lies dead|breathes (?:his|her|their) last)\b/i;
export function saysDead(text, name) {
  const re = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
  let m;
  while ((m = re.exec(text))) {
    const after = text.slice(m.index + m[0].length);
    if (/^['’]s\b/i.test(after)) continue;
    if (NOT_SUBJECT_BEFORE.test(text.slice(Math.max(0, m.index - 20), m.index))) continue;
    const d = DEATH.exec(after);
    if (d && !d[1].trim().split(/\s+/).filter(Boolean).some((w) => NOT_IN_BETWEEN.test(w))) return true;
  }
  return false;
}
// A narration that takes the party to a place the briefing lists as an exit ("Hours bleed away and the
// road falls toward Fort Durron ... the rendezvous lies just ahead") while the Engine still has them where
// they were: the Director travelled in words and forgot move_party (full X Marks bench, step 47, 26 Nov).
const TRAVEL_WORDS = /\b(?:arriv\w*|reach\w*|come to|came to|march\w*|push(?:ed)? on|travel\w*|journey\w*|hours? (?:bleed|pass|later|of)|by the time|the road (?:falls|dips|leads|bends)|lies? (?:just )?ahead|ahead of you|before you|rises? (?:out of|before|ahead))\b/i;
export function travelledInWords(text, state, adventure) {
  const sites = (adventure && adventure.sites) || [];
  const here = sites.find((x) => x.id === state.scene.siteId);
  if (!here) return null;
  const t = String(text || '').replace(/"[^"]*"|“[^”]*”/g, '');
  for (const e of here.exits || []) {
    const to = sites.find((x) => x.id === e.to);
    if (!to) continue;
    const name = to.name.replace(/^the\s+/i, '').replace(/[:,(].*$/, '').trim();
    if (name.length < 4) continue;
    const at = t.toLowerCase().indexOf(name.toLowerCase());
    if (at < 0) continue;
    // Travel words in the same stretch of the narration as the place's name.
    const near = t.slice(Math.max(0, at - 220), at + name.length + 220);
    if (TRAVEL_WORDS.test(near)) return to;
  }
  return null;
}
export function asksRollInWords(text) { return ROLL_WORDS.test(String(text || '').replace(/"[^"]*"|“[^”]*”/g, '')); }

// Whose turn it is, for the closing question in a fight.
function actingPlayer(state) {
  const f = state.fight;
  if (!f || f.phase !== 'turns') return null;
  const k = (f.order[f.turn] || {}).key || '';
  return k.startsWith('pc:') ? state.pcs[k.slice(3)] : null;
}

export async function directorTurn(args) {
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const done = await oneAttempt(args);
    if (done) return done;
  }
  throw new ProviderError('The Director used its tools but never said anything to the table, even after a second try. Press "Take a turn" again.');
}

async function oneAttempt({ state, adventure, srd, provider, rng, now = 0, reason = '', hostNote = '', memory = null }) {
  const T = toolbox({ state, adventure, srd, rng, now, memory });
  const chat = provider.start({ system: INSTRUCTIONS, tools: TOOLS });
  const calls = beforeTurn(T, state);
  T.refusals = 0;
  const usage = { in: 0, out: 0 };
  let reply = await chat.send(briefing(T.state, adventure, srd, { reason, hostNote, chapters: memory ? memory.chapters : [], lastSeq: lastNarrSeq(state) }));
  let narration = '';
  let nudged = false;
  let rollNudged = false;
  let moveNudged = false;
  let questNudged = false;
  let rollHeld = false;
  const maxSteps = MAX_STEPS + 3 * Math.min(10, Object.values(state.foes || {}).filter((f) => !f.dead && f.siteId === state.scene.siteId).length);
  for (let step = 0; step < maxSteps; step++) {
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
    narration = String(reply.text || '').trim();
    const asked = T.state.requests.length > state.requests.length || calls.some((c) => c.name === 'ask_for_roll' && !c.result.refused);
    if (narration && !rollNudged && !asked && asksRollInWords(narration)) {
      rollNudged = true;
      narration = '';
      reply = await chat.send('You asked for a roll in words, but nothing is on the player\'s screen. Call ask_for_roll now for that roll, then give your narration again, ending on one question. If no roll is needed, narrate again without asking for one.');
      continue;
    }
    // Travelled in words, not in the Engine: one nudge, outside a fight, when move_party was not called.
    const moved = T.state.scene.siteId !== state.scene.siteId || calls.some((c) => c.name === 'move_party' && !(c.result || {}).refused);
    const went = narration && !moveNudged && !moved && !T.state.fight ? travelledInWords(narration, T.state, adventure) : null;
    if (went) {
      moveNudged = true;
      narration = '';
      reply = await chat.send(`Your narration takes the party toward ${went.name}, but the Engine still has them at ${(adventure.sites.find((x) => x.id === T.state.scene.siteId) || {}).name}. If they have arrived there or are close enough to see it, call move_party with place "${went.id}" now, then narrate again. If something stops them on the way (a patrol, a hazard, a choice), keep them where they are and say what stops them. End on one question.`);
      continue;
    }
    // A look-or-know roll before the player tried anything, with "what do you do?" (earlyRolls): withdrawn, once.
    const early = narration && !rollHeld && !T.state.fight ? earlyRolls(state, T.state, narration) : [];
    if (early.length) {
      rollHeld = true;
      for (const q of early) T.do({ type: 'roll.cancel', id: q.id });
      calls.push({ name: '(engine)', args: {}, result: { note: 'A roll asked before the player said what they try was withdrawn.' } });
      narration = '';
      reply = await chat.send('You asked for a roll before the player said what their character tries, and you also asked what they do. The Engine has withdrawn the roll: wait for their words (they may say "I look around" or "I search where the lamp was"; then ask for it). Narrate again without any roll, ending on your one question.');
      continue;
    }
    // Checks that all succeeded where a quest ends, and no complete_quest (the Skeleton's Gull Rock bench,
    // 27 Nov: three successes found everything at the keeper's cottage and the quest stayed open): once, ask.
    const won = narration && !questNudged && !T.state.fight ? questWon(T.state, adventure, lastNarrSeq(state), calls) : null;
    if (won) {
      questNudged = true;
      narration = '';
      reply = await chat.send(`Those rolls all succeeded here. Does that finish the quest "${won.text}" (${won.id})? If it does, call complete_quest for it now, then narrate again. If something is still left to do, narrate again as you would have and say what is left. End on one question to one named character.`);
      continue;
    }
    if (narration || nudged) break;
    nudged = true;
    reply = await chat.send('You have not said anything to the table yet. Narrate now, in plain text, and end on one question to one named character.');
  }
  // A monster that acted on its turn and was left standing in it (the Skeleton's Gull Rock bench, 27 Nov: the
  // keeper swung and the turn never ended, and the fight stalled): the Engine ends that turn.
  {
    const turnKey = (st) => (st.fight && st.fight.phase === 'turns' ? (st.fight.order[st.fight.turn] || {}).key : null);
    const startKey = turnKey(state);
    if (startKey && startKey.startsWith('foe:') && turnKey(T.state) === startKey
      && calls.some((c) => c.name === 'monster_action' && c.result && !c.result.refused) && !T.do({ type: 'fight.next', expect: startKey })) {
      calls.push({ name: '(engine)', args: {}, result: { note: 'The monster had acted; the Engine ended its turn.' } });
    }
  }
  if (!narration) {
    try {
      const last = await chat.send('Stop calling tools. Say now, in two to four short sentences of plain text, what the party sees, and end on one question to one named character.');
      usage.in += last.usage.in; usage.out += last.usage.out;
      narration = String(last.text || '').trim();
    } catch (e) { /* fall through */ }
  }
  if (!narration) {
    const who = actingPlayer(T.state);
    narration = who ? `${who.name}, it is your turn. What do you do?` : 'What do you do?';
    calls.push({ name: '(plain line)', args: {}, result: { note: 'The Director said nothing; the Engine asked the table what is next.' } });
  }
  narration = dropForeign(narration.replace(/\*\*/g, '').trim());
  const askedNow = T.state.requests.length > 0;
  let flags = checkNarration(narration, T.state, { asked: askedNow });
  const fixable = flags.filter((f) => f.kind !== 'roll');
  if (fixable.length) {
    const asks = [];
    if (flags.some((f) => f.kind === 'leak')) asks.push(`It gives away something the players must not hear: ${flags.filter((f) => f.kind === 'leak').map((f) => f.text).join(' ')} Leave out monsters' numbers (AC, hit points, DCs, bonuses) and never mention notes, briefings, tools or the Engine. Describe what the characters see instead.`);
    if (flags.some((f) => /^Long/.test(f.text))) asks.push('It is too long: keep it under 110 words.');
    if (flags.some((f) => /^Asks \d+ questions/.test(f.text))) asks.push('Ask exactly one question, to one named character.');
    if (flags.some((f) => /^Uses formatting/.test(f.text))) asks.push('Write plain sentences only: no lists, headings or bold.');
    if (flags.some((f) => f.kind === 'rule' && /is dead/.test(f.text))) asks.push('A character you called dead is alive: only the rules can kill a character. Keep them alive.');
    if (flags.some((f) => f.kind === 'rule' && /is up, but/.test(f.text))) asks.push('A character you said is up is still at 0 hit points and unconscious: keep them down until someone heals them (or stabilizes them, which keeps them unconscious).');
    const who = actingPlayer(T.state);
    if (flags.some((f) => /^Does not end/.test(f.text))) asks.push(`End on exactly one question to one named character${who ? ` (it is ${who.name}'s turn)` : ''}.`);
    try {
      const fix = await chat.send(`Rewrite your whole reply. ${asks.join(' ')} Keep the same events and any roll you asked for. Do not call any tools.`);
      usage.in += fix.usage.in; usage.out += fix.usage.out;
      const text = dropForeign(String(fix.text || '').replace(/\*\*/g, '').trim());
      if (text && !(fix.calls || []).length) {
        const again = checkNarration(text, T.state, { asked: askedNow });
        const bad = (l) => l.filter((f) => f.kind !== 'note').length;
        if (bad(again) < bad(flags) || (!again.some((f) => f.kind === 'leak') && flags.some((f) => f.kind === 'leak'))) {
          narration = text;
          flags = [...again, { kind: 'note', text: 'Rewritten once before anyone saw it.' }];
        }
      }
    } catch (e) { /* keep the first draft and its flags */ }
  }
  // A leak that survived the rewrite: cut the sentences that carry it.
  if (flags.some((f) => f.kind === 'leak')) {
    const parts = narration.split(/(?<=[.!?])\s+/);
    const kept = parts.filter((p) => !LEAK.test(p) && !NUMBERS.test(p));
    if (kept.length && kept.length < parts.length) {
      narration = kept.join(' ');
      flags = checkNarration(narration, T.state, { asked: askedNow }).concat([{ kind: 'note', text: 'The Engine cut a sentence that gave something away.' }]);
    }
  }
  // In a fight, the closing question goes to the player whose turn it is. Local models often ask the
  // last speaker instead (bench, 20 Nov): the Engine knows whose turn it is, so it sets the question.
  {
    const who = actingPlayer(T.state);
    const waiting = (T.state.requests || []).some((q) => !who || q.pcId !== who.id);
    // A dying character has no choices to make, so their turn's question is not theirs to answer.
    if (who && who.playerId && who.hp > 0 && !waiting) {
      const parts = narration.split(/(?<=[.!?]["”]?)\s+/);
      const lastQ = parts.length ? parts[parts.length - 1] : '';
      if (!new RegExp(`\\b${who.name.split(/\s+/)[0]}\\b`).test(lastQ)) {
        const body = /\?["”]?$/.test(lastQ.trim()) && !/^["“]/.test(lastQ.trim()) ? parts.slice(0, -1) : parts;
        narration = `${body.join(' ')} ${who.name}, what do you do?`.trim();
        flags = flags.filter((f) => !/^Does not end/.test(f.text)).concat([{ kind: 'note', text: `The Engine set the closing question to ${who.name}, whose turn it is.` }]);
      }
    }
  }
  // Outside the fight, a closing question put to someone the Director plays ("Reeve, what does he
  // want?", bench 20 Nov) goes to the players instead: to whoever spoke last, or the first of the party.
  if (!actingPlayer(T.state)) {
    const parts = narration.split(/(?<=[.!?]["”]?)\s+/);
    const lastQ = (parts[parts.length - 1] || '').trim();
    const addressed = (lastQ.match(/^([A-Z][\w'’-]*(?:\s[A-Z][\w'’-]*)?),/) || [])[1];
    if (addressed && /\?["”]?$/.test(lastQ)) {
      const pcs = Object.values(T.state.pcs || {}).filter((p) => p.playerId && !p.dead);
      const isPc = pcs.some((p) => p.name.split(/\s+/)[0] === addressed.split(/\s+/)[0]);
      const npcNames = ((adventure || {}).sites || []).flatMap((x) => (x.npcs || []).map((n) => n.name))
        .concat(Object.values(T.state.foes || {}).map((f) => f.name));
      const isNpc = npcNames.some((n) => n.split(/\s+/).some((w) => addressed.split(/\s+/).includes(w))) || /^(Reeve|Innkeeper|Brother|Sister|Captain|Elder|Mother|Father)\b/.test(addressed);
      if (!isPc && isNpc && pcs.length) {
        const said = [...(T.state.story || [])].reverse().find((e) => e.kind === 'say' && e.pcId);
        const to = (said && T.state.pcs[said.pcId]) || pcs[0];
        narration = `${parts.slice(0, -1).join(' ')} ${to.name}, what do you do?`.trim();
        flags = flags.concat([{ kind: 'note', text: `The Engine put the closing question to ${to.name}: it was asked of ${addressed}, whom the Director plays.` }]);
      }
    }
  }
  if (T.refusals) flags.push({ kind: 'rule', text: `The Engine refused ${T.refusals} thing${T.refusals > 1 ? 's' : ''} the Director tried. Nothing refused took effect.` });
  T.do({ type: 'narrate', text: narration });
  return { state: T.state, narration, calls, flags, usage, refusals: T.refusals };
}
