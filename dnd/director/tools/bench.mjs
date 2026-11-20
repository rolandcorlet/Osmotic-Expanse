// The D&D test bench: plays a scripted table through the opening of The Lantern of Thornwick Ford
// with the real model, and counts what went wrong. Run it on the host computer after saving a key
// and choosing a model on the Director tab. It uses whichever AI is selected there, and never
// touches the saved game.
//
//   node tools/bench.mjs                       the whole script, once
//   node tools/bench.mjs --runs 3 --log bench.log
//   node tools/bench.mjs --provider ollama --model qwen3:14b
//   node tools/bench.mjs --provider custom --url http://localhost:8000/v1 --model <name>
//   node tools/bench.mjs --fake                no model: a stand-in that only narrates (checks the bench itself)
//   node tools/bench.mjs --part 2              part 2: from the Mill Road to the watchtower, Grisk, Nell and the lantern
//   node tools/bench.mjs --part 3              part 3: the Greyfen, the drowned chapel, the crypt, Brother Aldane, the lantern rehung
//
// Prefer --log to `> file.log`: PowerShell's redirect writes UTF-16LE and mangles the transcript.
//
// Part 1: the opening at the Ford Inn, talking to the Reeve, an Insight check, the road north,
// a Perception check at the mill, the goblin fight to the end, and searching the bodies.
// Part 2 (level 2 heroes, the mill goblins already dead): the switchback path, the sentries on the
// Tumbledown Gate, a short rest, the watchtower, talking to Grisk the bugbear chief, the fight,
// freeing Nell, the lantern, the letter on the throne, and the milestone.
//
// THE GATE (a model passes when every run has none of these):
//   refusal     the Engine refused something the Director tried
//   leak        the narration gave away a DC, an AC, hit points or the machinery
//   rule        the narration called a living character dead
//   roll-words  a roll asked for in words that the nudge did not turn into a tool call
//   wrong-seat  on a player's turn in the fight, the closing question went to someone else
//   stall       a fight round in which the Director did not move the turn on, or a fight that never ended
//   error       the model or the connection failed
// Reported but not gated: style flags (long, no closing question), and a stage's expected tool not used.

import { readFileSync, existsSync, createWriteStream } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { newSession, apply } from '../engine/ledger.js';
import { systemRng } from '../engine/dice.js';
import { adventureById } from '../data/adventures/index.js';
import { directorTurn } from '../brain/director.js';
import { build, providerInfo, PROVIDERS } from '../brain/providers.js';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const flag = (n) => args.includes(n);
const cfgFile = join(here, '..', 'saves', 'director.json');
const cfg = existsSync(cfgFile) ? JSON.parse(readFileSync(cfgFile, 'utf8')) : {};
const fake = flag('--fake');
const provider = opt('--provider', cfg.provider || 'gemini');
if (!PROVIDERS.some((p) => p.id === provider)) { console.log(`Unknown provider "${provider}". Choose one of: ${PROVIDERS.map((p) => p.id).join(', ')}`); process.exit(1); }
const info = providerInfo(provider);
const apiKey = (cfg.keys || {})[provider] || (info.env && process.env[info.env]) || '';
const baseUrl = opt('--url', (cfg.urls || {})[provider] || '');
const model = opt('--model', (cfg.models || {})[provider] || '');
const numCtx = Number(opt('--ctx', cfg.numCtx || 16384));
const thinking = opt('--thinking', cfg.thinking || 'default');
const runs = Math.max(1, Number(opt('--runs', 1)));
const part = ['2', '3'].includes(opt('--part', '1')) ? Number(opt('--part', '1')) : 1;
const logFile = opt('--log', '');
const verbose = !flag('--quiet');

if (logFile) {
  const out = createWriteStream(logFile, { encoding: 'utf8' });
  out.write(`# D&D bench ${new Date().toISOString()} provider=${fake ? 'fake' : provider} model=${fake ? '-' : model} thinking=${thinking} runs=${runs}\n`);
  for (const k of ['log', 'error', 'warn']) {
    const orig = console[k].bind(console);
    console[k] = (...a) => { out.write(`${a.map((x) => (typeof x === 'string' ? x : String(x))).join(' ')}\n`); orig(...a); };
  }
  process.on('exit', () => out.end());
}
if (!fake && ((info.key === 'required' && !apiKey) || !model)) {
  console.log(`Set up ${info.name} on the Director tab first: ${info.key === 'required' && !apiKey ? 'save a key' : 'choose a model'} (or pass --model).`);
  process.exit(1);
}

// Every model call is timed.
const calls = [];
function timed(p) {
  const start = p.start.bind(p);
  return { ...p, start(o) {
    const chat = start(o);
    const wrap = (fn) => async (...a) => { const t0 = Date.now(); const r = await fn(...a); calls.push({ ms: Date.now() - t0, in: (r.usage || {}).in || 0, out: (r.usage || {}).out || 0 }); return r; };
    return { send: wrap(chat.send.bind(chat)), results: wrap(chat.results.bind(chat)) };
  } };
}
// The stand-in for --fake: it never calls a tool and closes every reply on a question to whoever is named
// first in the briefing's "ACTING NOW" line (or the first character in the party).
function fakeProvider() {
  return { start() {
    let briefing = '';
    const say = () => {
      const now = /ACTING NOW: ([^:]+):/.exec(briefing);
      const party = /^- (\S+) \(id c/m.exec(briefing);
      const who = now ? now[1] : party ? party[1] : 'Bryn';
      return { text: `The fog curls along the floor and something shifts in the dark. ${who}, what do you do?`, calls: [], usage: { in: Math.round(briefing.length / 4), out: 20 } };
    };
    return { send(t) { if (/^WHY YOU ARE/.test(t)) briefing = t; return Promise.resolve(say()); }, results() { return Promise.resolve(say()); } };
  } };
}
// ms = a + in/P + out/D, fitted by least squares over the calls: P is prompt reading speed, D is writing speed.
function speeds(list) {
  const n = list.length;
  if (n < 8) return null;
  const X = list.map((c) => [1, c.in / 1000, c.out / 1000]);
  const A = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], b = [0, 0, 0];
  X.forEach((x, i) => { for (let r = 0; r < 3; r++) { b[r] += x[r] * list[i].ms; for (let c = 0; c < 3; c++) A[r][c] += x[r] * x[c]; } });
  for (let i = 0; i < 3; i++) { // Gauss-Jordan
    let m = i; for (let r = i + 1; r < 3; r++) if (Math.abs(A[r][i]) > Math.abs(A[m][i])) m = r;
    if (Math.abs(A[m][i]) < 1e-9) return null;
    [A[i], A[m]] = [A[m], A[i]]; [b[i], b[m]] = [b[m], b[i]];
    for (let r = 0; r < 3; r++) if (r !== i) { const f = A[r][i] / A[i][i]; for (let c = i; c < 3; c++) A[r][c] -= f * A[i][c]; b[r] -= f * b[i]; }
  }
  const [a, perKin, perKout] = [b[0] / A[0][0], b[1] / A[1][1], b[2] / A[2][2]];
  if (!(perKin > 0) || !(perKout > 0)) return null;
  return { overhead: a / 1000, prefill: 1000 / perKin, decode: 1000 / perKout };
}
function speedLine(list, label) {
  if (!list.length) return;
  const ms = list.reduce((x, c) => x + c.ms, 0), tin = list.reduce((x, c) => x + c.in, 0), tout = list.reduce((x, c) => x + c.out, 0);
  const f = speeds(list);
  console.log(`  ${label}: ${list.length} model calls, ${(ms / list.length / 1000).toFixed(1)} s each; ${Math.round(tin / list.length)} tokens in and ${Math.round(tout / list.length)} out per call; ${(tout / (ms / 1000)).toFixed(1)} tok/s out counting everything${f ? `; fitted: reads ${Math.round(f.prefill)} tok/s, writes ${f.decode.toFixed(1)} tok/s, ${f.overhead.toFixed(1)} s fixed per call` : ''}`);
}
const makeProvider = () => timed(fake ? fakeProvider() : build({ provider, apiKey, baseUrl, model, numCtx, thinking }));

const srd = JSON.parse(readFileSync(join(here, '..', '..', 'data', 'srd.json'), 'utf8'));
const adventure = adventureById('lantern');
const rng = systemRng();
const ctx = (role, pid) => ({ role, pid, rng, now: Date.now(), adventure, srd });
const BASE = { str: 15, dex: 13, con: 14, int: 8, wis: 12, cha: 10 };
const HEROES = [
  ['p1', 'Roly', { name: 'Bryn', race: 'dwarf', subrace: 'hill-dwarf', class: 'fighter', method: 'standard', base: BASE, skills: ['athletics', 'perception'], background: 'acolyte', style: 'defense', kit: [0, 0, 0, 0] }],
  ['p2', 'Keith', { name: 'Ila', race: 'human', class: 'cleric', subclass: 'life', method: 'standard', base: { str: 13, dex: 10, con: 14, int: 8, wis: 15, cha: 12 }, skills: ['medicine', 'insight'], background: 'acolyte', spells: { cantrips: ['sacred-flame', 'guidance', 'light'], prepared: ['cure-wounds', 'bless', 'guiding-bolt'] } }],
];

// What the players say, in order. `expect` names a tool the stage should use (reported, not gated).
const SCRIPT = [
  { start: true, expect: [] },
  { pid: 'p1', say: 'I walk up to the Reeve and ask him what happened to the lantern.', expect: [] },
  { pid: 'p2', say: 'I watch the Reeve while he talks. Is he hiding something from us?', expect: ['ask_for_roll'] },
  { pid: 'p1', say: 'We take the job. We head out on the Mill Road toward the old watchtower.', expect: ['move_party'] },
  { pid: 'p2', say: 'I keep my eyes on the ruined mill as we pass it. Is anything watching the road?', expect: ['ask_for_roll'] },
  { pid: 'p1', say: 'I draw my battleaxe and charge the mill door!', expect: ['start_combat'] },
  { fight: true },
  { pid: 'p2', say: 'I search the goblins for anything useful.', expect: [] },
];

// Part 2 (20 Nov): the watchtower. What `expect` names is reported, not gated.
const SCRIPT2 = [
  { pid: 'p1', say: 'We climb the switchback path up to the old watchtower.', expect: ['move_party'] },
  { pid: 'p2', say: 'I look up at the wall above the arch. Is anyone up there?', expect: ['ask_for_roll'] },
  { pid: 'p1', say: 'I raise my shield and charge the gate!', expect: ['start_combat'] },
  { fight: 'tower-gate' },
  { pid: 'p2', say: 'We take a short rest in the yard before we go inside, and I bind our wounds.', expect: [] },
  { pid: 'p1', say: 'We go into the tower.', expect: ['move_party'] },
  { pid: 'p2', say: 'I call out to the bugbear: why did you take the lantern, and who is the girl?', expect: [] },
  { pid: 'p1', say: 'Enough talk. I attack Grisk!', expect: ['start_combat'] },
  { fight: 'watchtower' },
  { pid: 'p2', say: 'I take the key from Grisk and unchain the girl. Are you hurt?', expect: [] },
  { pid: 'p1', say: 'I unwrap the brass lantern from the sacking and light it.', expect: [] },
  { pid: 'p2', say: 'I read the letter on the throne.', expect: ['award_xp'] },
];

// Part 3 (21 Nov): level 3 heroes with the lantern, from Thornwick Ford through the Greyfen to the
// sanctum and home. The quests close only at their places (the vanished at the sanctum, the lantern
// at the ford), so this is also the test of those fences.
const SCRIPT3 = [
  { pid: 'p1', say: 'We take the causeway path south-east into the Greyfen, with the lantern lit.', expect: ['move_party'] },
  { pid: 'p2', say: 'I keep watch along the causeway. Is anything moving out there in the reeds?', expect: ['ask_for_roll'] },
  { pid: 'p1', say: 'I swing at the nearest rat!', expect: ['start_combat'] },
  { fight: 'causeway' },
  { pid: 'p2', say: 'We follow the causeway on to the drowned chapel.', expect: ['move_party'] },
  { pid: 'p1', say: 'I hold the lantern high and wade in. I attack the nearest of the drowned!', expect: ['start_combat'] },
  { fight: 'chapel' },
  { pid: 'p2', say: 'I look closely at the bodies. How did these people die?', expect: ['ask_for_roll'] },
  { pid: 'p1', say: 'We go down the stair into the crypt, slowly, testing the floor.', expect: ['move_party'] },
  { pid: 'p1', say: 'At the iron door I smash the skeleton nearest me!', expect: ['start_combat'] },
  { fight: 'crypt' },
  { pid: 'p2', say: 'We push through the iron door toward the chanting.', expect: ['move_party'] },
  { pid: 'p2', say: 'Brother Aldane! Where are the people you took from the village?', expect: [] },
  { pid: 'p1', say: 'No bargains. I attack the Pale Brother!', expect: ['start_combat'] },
  { fight: 'sanctum' },
  { pid: 'p2', say: 'We free the captives and help them to their feet.', expect: ['complete_quest'] },
  { pid: 'p1', say: 'We take everyone home along the causeway, and I hang the lantern back on its hook over the ford.', expect: ['complete_quest'] },
];

// ---- one run ---------------------------------------------------------------------------------
async function runOnce(n) {
  const t0 = Date.now();
  const callsAt = calls.length;
  const tally = { turns: 0, refusal: 0, leak: 0, rule: 0, 'roll-words': 0, 'wrong-seat': 0, stall: 0, error: 0, style: 0, missing: 0 };
  const notes = [];
  let s = newSession(adventure);
  const act = (role, pid, a) => { s = apply(s, a, ctx(role, pid)); };
  for (const [pid, name, input] of HEROES) {
    act('player', pid, { type: 'join', name });
    if (part >= 2) act('host', null, { type: 'pc.create', input: { ...input, level: part }, forPid: pid });
    else act('player', pid, { type: 'pc.create', input });
  }
  if (part === 2) {
    // The mill is behind them: the party is on the Mill Road, the scouts are dead, the story says so.
    act('host', null, { type: 'site.move', siteId: 'mill-road' });
    for (const f of Object.values(s.foes)) if (f.siteId === 'mill-road') act('host', null, { type: 'foe.remove', foeId: f.id });
    act('host', null, { type: 'say', text: 'Earlier: Bryn and Ila took the Reeve\'s job, followed the tracks up the Mill Road and killed the three goblin scouts at the ruined mill. Drag marks and a small black shoe point up the switchback path to the watchtower.', as: 'Recap' });
    s.started = true;
  }
  if (part === 3) {
    // The watchtower is behind them: Grisk is beaten, Nell is home, the lantern is lit in Bryn's hands.
    for (const site of ['mill-road', 'tower-gate', 'watchtower']) { act('host', null, { type: 'site.move', siteId: site }); for (const f of Object.values(s.foes)) if (f.siteId === site) act('host', null, { type: 'foe.remove', foeId: f.id }); }
    act('host', null, { type: 'site.move', siteId: 'thornwick' });
    act('host', null, { type: 'say', text: 'Earlier: Bryn and Ila beat Grisk at the old watchtower, freed Nell Hale and brought her home, and recovered the Lantern of the Ford. A letter on Grisk\'s throne said: "Bring the lamp to the chapel on the third night. The Brother pays in silver and in mercy. -- A." The lantern is lit in Bryn\'s hands. Four villagers are still missing in the Greyfen.', as: 'Recap' });
    s.started = true;
  }
  const pcOf = (pid) => s.pcs[s.players[pid].pcId];
  const actingPc = () => { const f = s.fight; const k = f && f.phase === 'turns' ? f.order[f.turn].key : ''; return k.startsWith('pc:') ? s.pcs[k.slice(3)] : null; };

  async function turn(reason, label, expect = []) {
    tally.turns += 1;
    const asked = actingPc();
    let out;
    try {
      out = await directorTurn({ state: s, adventure, srd, provider: makeProvider(), rng, now: Date.now(), reason });
    } catch (e) {
      tally.error += 1; notes.push(`${label}: ERROR ${e.message}`); console.log(`  [${label}] ERROR: ${e.message}`); return false;
    }
    s = out.state;
    tally.refusal += out.refusals || 0;
    for (const f of out.flags) {
      if (f.kind === 'leak') { tally.leak += 1; notes.push(`${label}: leak: ${f.text}`); }
      if (f.kind === 'rule' && !/refused/.test(f.text)) { tally.rule += 1; notes.push(`${label}: rule: ${f.text}`); }
      if (f.kind === 'roll') { tally['roll-words'] += 1; notes.push(`${label}: asked for a roll in words`); }
      if (f.kind === 'style') tally.style += 1;
    }
    for (const c of out.calls) if (c.result && c.result.refused) notes.push(`${label}: refused ${c.name}: ${c.result.refused}`);
    const used = new Set(out.calls.map((c) => c.name));
    for (const e of expect) if (!used.has(e)) { tally.missing += 1; notes.push(`${label}: did not use ${e}`); }
    // On a player's turn in a fight, the closing question goes to that player.
    const who = actingPc();
    const otherRoll = (s.requests || []).some((q) => !who || q.pcId !== who.id);
    const ownRoll = (s.requests || []).some((q) => who && q.pcId === who.id);
    // A dying character has nothing to choose, and a roll in the air belongs to whoever must make it.
    // A roll asked of the acting player is their prompt: no closing question is needed (bench part 2, run 10).
    if (who && who.playerId && who.hp > 0 && !otherRoll && !ownRoll) {
      const last = out.narration.split(/(?<=[.!?])\s+/).filter((x) => x.includes('?')).pop() || '';
      if (!new RegExp(`\\b${who.name}\\b`).test(last)) { tally['wrong-seat'] += 1; notes.push(`${label}: closing question not to ${who.name}: "${last.slice(0, 120)}"`); }
    }
    if (verbose) {
      console.log(`  [${label}] ${out.calls.map((c) => `${c.name}${c.result && c.result.refused ? '(refused)' : ''}`).join(', ') || 'narration only'}`);
      console.log(`    DM: ${out.narration.replace(/\s+/g, ' ')}`);
      const bad = out.flags.filter((f) => f.kind !== 'note');
      if (bad.length) console.log(`    flags: ${bad.map((f) => `${f.kind}: ${f.text}`).join(' | ')}`);
      for (const c of out.calls) if (c.result && c.result.refused) console.log(`    refused ${c.name}(${JSON.stringify(c.args || {}).slice(0, 160)}): ${c.result.refused}`);
    }
    void asked;
    return true;
  }
  // The players roll whatever is asked of them, then the Director answers the result.
  async function answerRolls(label) {
    for (let guard = 0; guard < 4 && s.requests.length; guard++) {
      for (const q of s.requests.slice()) {
        const pid = Object.values(s.players).find((p) => p.pcId === q.pcId);
        act(pid ? 'player' : 'host', pid ? pid.id : null, { type: 'roll.make', id: q.id });
        const r = s.rolls[s.rolls.length - 1];
        if (verbose) console.log(`    ${r.who} rolls ${r.label}: ${r.total}${r.success === true ? ' (success)' : r.success === false ? ' (fail)' : ''}`);
      }
      if (!s.fight || s.fight.phase !== 'initiative') await turn('a roll was made', `${label} roll`);
      else if (s.fight.order.every((o) => o.init != null)) break;
    }
  }
  async function fight(where = 'mill-road') {
    if (!s.fight) {
      notes.push(`fight at ${where}: no fight was started, so the bench starts one`);
      tally.missing += 1;
      if (s.scene.siteId !== where) { notes.push(`fight: the party never reached ${where}, so the bench moves it there`); act('host', null, { type: 'site.move', siteId: where }); }
      if (!Object.values(s.foes).some((f) => f.siteId === s.scene.siteId && !f.dead)) act('host', null, { type: 'foe.add', monster: 'goblin', count: 2 });
      if (Object.values(s.foes).some((f) => f.siteId === s.scene.siteId && f.hidden)) act('host', null, { type: 'foe.reveal' });
      act('host', null, { type: 'fight.start' });
    }
    const turnsBefore = tally.turns;
    await answerRolls('initiative');
    // The last initiative roll already gave the Director its turn; only a fight started without
    // waiting on anyone needs one here.
    if (s.fight && s.fight.phase === 'initiative') act('host', null, { type: 'fight.begin' });
    if (tally.turns === turnsBefore) await turn('the fight begins', 'battle joined');
    let steps = 0;
    while (s.fight && steps++ < 40) {
      const pc = actingPc();
      const before = `${s.fight.round}:${s.fight.turn}`;
      if (pc && pc.playerId) {
        const pid = pc.playerId;
        const foe = Object.values(s.foes).find((f) => f.siteId === s.scene.siteId && !f.dead && !f.hidden);
        if (s.requests.some((q) => q.pcId === pc.id)) { await answerRolls(`${pc.name} save`); continue; }
        // A friend dying on the floor comes first: a cleric with a slot heals them (Cure Wounds, or
        // Healing Word as a bonus action), as a real player would (bench 20 Nov: Grisk took three runs).
        const down = Object.values(s.pcs).find((x) => x.id !== pc.id && x.hp <= 0 && !x.dead && !x.stable);
        const heal = pc.hp > 0 && pc.cast && ['healing-word', 'cure-wounds'].find((id) => [...(pc.cast.prepared || []), ...(pc.cast.known || [])].includes(id));
        const slotLeft = pc.cast && pc.cast.slots.some(([m, u]) => m && u < m);
        if (down && heal && slotLeft) {
          act('player', pid, { type: 'say', text: `Hold on, ${down.name}! I heal you.` });
          try {
            act('player', pid, { type: 'spell.cast', pcId: pc.id, spell: heal, target: `pc:${down.id}` });
            if (verbose) console.log(`    ${pc.name} casts ${heal} on ${down.name}: ${s.pcs[down.id].hp} hp`);
          } catch (e) { if (verbose) console.log(`    (${pc.name} could not heal: ${e.message})`); }
        } else if (pc.hp > 0 && pc.conds.some((c) => ['paralyzed', 'stunned', 'incapacitated', 'unconscious', 'petrified'].includes(c))) {
          if (verbose) console.log(`    ${pc.name} is ${pc.conds.join(', ')} and cannot act`);
        } else if (foe && pc.hp > 0) {
          act('player', pid, { type: 'say', text: `I attack ${foe.name}!` });
          const atk = pc.cls === 'cleric' ? 'w:mace' : pc.attacks[0].id;
          try {
            act('player', pid, { type: 'attack', pcId: pc.id, attack: pc.attacks.some((a) => a.id === atk) ? atk : pc.attacks[0].id, target: `foe:${foe.id}` });
            const r = s.rolls[s.rolls.length - 1];
            if (verbose) console.log(`    ${pc.name} attacks ${foe.name}: ${r.success ? `hit, ${r.dmg ? r.dmg.total : 0} damage` : 'miss'}${s.foes[foe.id].dead ? ` (${foe.name} falls)` : ''}`);
          } catch (e) { if (verbose) console.log(`    (${pc.name} could not attack: ${e.message})`); }
        }
        act('player', pid, { type: 'fight.next' });
        await turn('a player ended their turn', `R${s.fight ? s.fight.round : '-'} after ${pc.name}`);
      } else {
        // A monster's turn: the Director must act and move the turn on (the server runs it again while a monster is up).
        await turn('a monster is still to act', `R${s.fight.round} monster`);
        if (s.requests.length) await answerRolls('monster save');
      }
      if (!s.fight) break;
      const after = `${s.fight.round}:${s.fight.turn}`;
      const noFoes = !Object.values(s.foes).some((f) => f.siteId === s.scene.siteId && !f.dead);
      if (noFoes) {
        await turn('the last enemy has fallen', `after the last foe at ${where}`);
        if (s.fight) { tally.stall += 1; notes.push(`fight at ${where}: every foe is down but the Director did not end the fight`); act('host', null, { type: 'fight.end' }); }
        break;
      }
      // The server runs the Director again while a monster is still up; the bench gives it that second go too.
      if (after === before && !actingPc() && s.fight) { await turn('a monster is still to act', `R${s.fight.round} monster (again)`); }
      if (s.fight && `${s.fight.round}:${s.fight.turn}` === before && !actingPc()) { tally.stall += 1; notes.push(`fight: the Director did not end the monster's turn (round ${s.fight.round})`); act('host', null, { type: 'fight.next' }); }
    }
    if (s.fight) { tally.stall += 1; notes.push('fight: still going after 40 steps'); act('host', null, { type: 'fight.end' }); }
    // Characters downed in the fight are healed so the script can go on. In part 3 (four fights and no
    // inn) the party catches its breath between rooms and is healed to full, as a short rest and a
    // cleric's slots would (bench 21 Nov: they reached Brother Aldane half dead every run).
    for (const p of Object.values(s.pcs)) {
      if (p.dead) continue;
      if (part === 3 && p.hp < p.maxHp) act('host', null, { type: 'heal', target: `pc:${p.id}`, amount: p.maxHp - p.hp });
      else if (p.hp <= 0) act('host', null, { type: 'heal', target: `pc:${p.id}`, amount: 5 });
    }
  }

  console.log(`\n=== Run ${n} of ${runs} ===`);
  for (const [k, step] of (part === 3 ? SCRIPT3 : part === 2 ? SCRIPT2 : SCRIPT).entries()) {
    if (step.fight) { await fight(typeof step.fight === 'string' ? step.fight : 'mill-road'); continue; }
    if (step.start) { await turn('the game begins: open the adventure', 'opening', step.expect); continue; }
    act('player', step.pid, { type: 'say', text: step.say });
    if (verbose) console.log(`  ${pcOf(step.pid).name}: ${step.say}`);
    const before = s.requests.length;
    await turn('a player spoke', `step ${k}`, step.expect);
    // Initiative is rolled by the fight step that follows, so the battle opens with one Director turn.
    if (s.requests.length && !s.fight) await answerRolls(`step ${k}`);
    void before;
  }
  const xp = Object.values(s.pcs).map((p) => `${p.name} ${p.xp} XP, ${p.hp}/${p.maxHp} hp`).join('; ');
  console.log(`  End: ${s.scene.siteId}; ${xp}`);
  return { tally, notes, secs: (Date.now() - t0) / 1000, calls: calls.slice(callsAt) };
}

const GATED = ['refusal', 'leak', 'rule', 'roll-words', 'wrong-seat', 'stall', 'error'];
const results = [];
for (let r = 1; r <= runs; r++) results.push(await runOnce(r));
console.log('\n=== Summary ===');
console.log(`Part ${part}. Model: ${fake ? 'fake stand-in' : `${info.name} · ${model}`}${!fake && info.group === 'local' ? ` · thinking ${thinking}` : ''}`);
results.forEach((x, i) => {
  const t = x.tally;
  const bad = GATED.filter((k) => t[k]);
  console.log(`Run ${i + 1}: ${t.turns} turns in ${Math.round(x.secs / 60)} min ${Math.round(x.secs % 60)} s (${(x.secs / Math.max(1, t.turns)).toFixed(1)} s a Director turn) · ${bad.length ? `FAIL (${bad.map((k) => `${k} ${t[k]}`).join(', ')})` : 'PASS'} · style ${t.style} · expected tool missing ${t.missing}`);
  for (const nline of x.notes) console.log(`   - ${nline}`);
});
if (calls.length && !fake) {
  console.log('Speed:');
  speedLine(calls, 'all runs');
  const turns = results.reduce((a, x) => a + x.tally.turns, 0);
  console.log(`  ${(calls.length / Math.max(1, turns)).toFixed(1)} model calls per Director turn; ${(calls.reduce((a, c) => a + c.ms, 0) / 1000 / Math.max(1, turns)).toFixed(1)} s of model time per turn.`);
}
const pass = results.every((x) => GATED.every((k) => !x.tally[k]));
console.log(pass ? 'GATE: PASS' : 'GATE: FAIL. Send this log to Sponge.');
process.exitCode = pass ? 0 : 1;
