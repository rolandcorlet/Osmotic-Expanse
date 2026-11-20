// The Phase 3 test bench: plays a scripted table through the real model and
// counts what went wrong. Run it after saving a key and choosing a model on the
// host console's Director tab. It uses whichever AI is selected there.
//
//   node tools/bench.mjs                 the Toll-Vent script, once
//   node tools/bench.mjs --runs 3
//   node tools/bench.mjs --provider ollama --model <name>     try another one
//   node tools/bench.mjs --sites 2 --players 4                 two sites and four players (Phase 4 rehearsal)
//   node tools/bench.mjs --sites 3 --players 4                 on through the Render Hall; 4 adds the Brood; 5 the Gut Stone
//                                                              (a long run - the gate stays at 2)
//   node tools/bench.mjs --from 5 --players 4                 play only the Gut Stone, starting from the table as the last
//                                                              multi-site run left it on entering that site (MI, Stress, Hunger,
//                                                              TOLL, items, cut Specimens, the chapters so far). Every run with
//                                                              --sites 2 or more saves those snapshots in saves/bench-from-N.json.
//   node tools/bench.mjs --provider custom --url http://localhost:8000/v1 --model <name>
//   node tools/bench.mjs --runs 3 --log bench_13nov_am.log    write the whole run to a UTF-8 file
//
// Prefer --log to `> file.log`: PowerShell's redirect writes UTF-16LE and mangles the em dashes and
// curly quotes in the transcript, so a saved gate comes out ungreppable without converting it first.
//
// The gate for a model: no Engine refusals, no leak flags, no harm and no Clock the narration moved
// without paying for it, and every reply ends on exactly one question. Nothing here touches a saved
// session.
import { readFileSync, writeFileSync, mkdirSync, existsSync, mkdtempSync, createWriteStream } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { newSession, apply } from '../engine/ledger.js';
import { systemRng } from '../engine/dice.js';
import { vectorById } from '../data/vectors.js';
import { NINTH } from './bench-scripts-ninth.mjs';
import { SWALLOW } from './bench-scripts-swallow.mjs';
import { loadBestiary } from '../data/bestiary-all.js';
import { directorTurn } from '../brain/director.js';
import { createMemory } from '../brain/memory.js';
import { plainChapter, CHRONICLE_INSTRUCTIONS, chronicleRequest, parseChronicle, filterCast } from '../brain/chronicle.js';
import { build, providerInfo, PROVIDERS } from '../brain/providers.js';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const flag = (n) => args.includes(n);
const cfgFile = join(here, '..', 'saves', 'director.json');
const cfg = existsSync(cfgFile) ? JSON.parse(readFileSync(cfgFile, 'utf8')) : {};
const provider = opt('--provider', cfg.provider || 'gemini');
if (!PROVIDERS.some((p) => p.id === provider)) { console.log(`Unknown provider "${provider}". Choose one of: ${PROVIDERS.map((p) => p.id).join(', ')}`); process.exit(1); }
const info = providerInfo(provider);
const apiKey = (cfg.keys || {})[provider] || (provider === 'gemini' && cfg.apiKey) || (info.env && process.env[info.env]) || '';
const baseUrl = opt('--url', (cfg.urls || {})[provider] || '');
const model = opt('--model', (cfg.models || {})[provider] || (provider === 'gemini' && cfg.model) || '');
const numCtx = Number(opt('--ctx', cfg.numCtx || 16384));
const thinking = opt('--thinking', cfg.thinking || 'default'); // default | medium | low | off (local models)
const runs = Number(opt('--runs', 1));
const from = Math.min(5, Math.max(1, Number(opt('--from', 1)))); // first stage to play; 2+ loads the snapshot saved on entering it
const sites = Math.min(5, Math.max(from, Number(opt('--sites', from)))); // how far the scripted table plays: 2 Soft Field, 3 Render Hall, 4 Brood, 5 Gut Stone
const vec = vectorById(opt('--vector', 'first-carve'));
if (!vec) { console.log('Unknown --vector. Try first-carve, ninth-shift or long-swallow.'); process.exit(1); }
const scenario = vec.scenario;
const snapDir = opt('--snapshots', join(here, '..', 'saves'));
const snapFile = (k) => join(snapDir, `bench-from-${vec.id === 'first-carve' ? '' : `${vec.id}-`}${k}.json`);
if (from > 1 && !existsSync(snapFile(from))) { console.log(`No snapshot for stage ${from} yet (${snapFile(from)}). Run once with --sites ${from} or more, from the start, so the bench can save the table as it enters each stage.`); process.exit(1); }
const players = Math.min(4, Math.max(2, Number(opt('--players', 2))));
const logFile = opt('--log', '');

// Everything the bench prints also goes to --log, written as UTF-8 by the harness itself. Teeing
// console keeps the transcript identical to the console scroll, so the gate can be read afterwards
// instead of re-run.
if (logFile) {
  const out = createWriteStream(logFile, { encoding: 'utf8' });
  out.write(`# bench ${new Date().toISOString()} provider=${provider} model=${model} thinking=${thinking} runs=${runs} sites=${sites} players=${players}\n`);
  for (const k of ['log', 'error', 'warn']) {
    const orig = console[k].bind(console);
    console[k] = (...a) => { out.write(`${a.map((x) => (typeof x === 'string' ? x : String(x))).join(' ')}\n`); orig(...a); };
  }
  process.on('exit', () => out.end());
}
if ((info.key === 'required' && !apiKey) || !model) { console.log(`Set up ${info.name} on the Director tab first: ${info.key === 'required' && !apiKey ? 'save a key' : 'choose a model'} (or pass --model).`); process.exit(1); }
// Every model call is timed, so the summary can say how fast the model really is: milliseconds,
// prompt tokens and completion tokens per call (the servers here answer whole, not streamed).
const calls = [];
function timed(p) {
  const start = p.start.bind(p);
  return { ...p, start(opts) {
    const chat = start(opts);
    const wrap = (fn) => async (...a) => { const t0 = Date.now(); const r = await fn(...a); calls.push({ ms: Date.now() - t0, in: r.usage ? r.usage.in : 0, out: r.usage ? r.usage.out : 0 }); return r; };
    return { ...chat, send: wrap(chat.send.bind(chat)), results: chat.results ? wrap(chat.results.bind(chat)) : undefined };
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
const makeProvider = () => timed(build({ provider, apiKey, baseUrl, model, numCtx, thinking }));
const makeQuick = () => timed(build({ provider, apiKey, baseUrl, model, numCtx, thinking: 'off' })); // the chronicle: no thinking

const bestiary = loadBestiary();
const rng = systemRng();
const ctx = (role, pid) => ({ role, pid, rng, now: Date.now(), scenario, bestiary });

// What the two players say, in order. Each line is answered by the Director.
const SCRIPT = [
  ['p2', 'Before we go near it, I taste the water coming out of the wound. What is in it?'],
  ['p1', 'I go up to the drones at the gate and ask what it costs to get in.'],
  ['p1', 'We have no stamp. We offer a promise, witnessed and filed.'],
  ['p1', 'I shoulder through the wound lip before the flap closes.'],
  ['p2', 'What are the swarms doing? Can we just give them water?'],
  ['p2', 'How many dice does the swarm roll, and what is its Membrane Threshold?'],
  ['p1', 'I want to buy a harpoon gun from the drones.'],
  ['p1', 'Enough. I swing the flail at the nearest swarm.'],
  ['p2', 'We take the cut-lane down into the whale.'],
];
// The second site: the harvest, a price trap, the stamp, and leaving. FIGHT lets any Pulse War play out first.
const SCRIPT2 = [
  ['*', 'FIGHT'],
  ['p3', 'Before we leave, I harvest what we killed here. What can be taken from the bodies?'],
  ['p2', 'The way is clear. We go down the cut-lane into the Soft Field.'],
  ['p3', 'I go to the Tally Post. What does the ledger there say, and what are the tools for?'],
  ['p4', 'I scout the far panels, well away from the nest. Is there a clean cut to be had there?'],
  ['p3', 'I cut a panel on the far side, taking my time over it.'],
  ['p3', 'What is this cut worth if I sell it outside?'],
  ['p1', 'We carry the cut to the Tally Post and ask for it to be weighed and stamped.'],
  ['p4', 'I leave the nest alone. Is anything stopping us going on?'],
  ['p1', 'Remind me: who witnessed my oath back at the gate, and what exactly did I promise?'],
  ['p2', 'We take the lane onward to the Render Hall.'],
];
// Site 3: the stomach, which is the Pulse War room and the one where the ground is the argument. The
// table works the bands, asks what the pump is worth, and takes a harvest before it goes on. The
// damage question is a leak probe on purpose, the same shape as the swarm's dice question in site 1.
const SCRIPT3 = [
  ['*', 'FIGHT'],
  ['p2', 'The way is clear. We go on down the cut-lane to the Render Hall.'],
  ['p1', 'Before we cross, what is in this chamber, and where is the ground safe to stand?'],
  ['p2', 'I taste the fluid in the middle of the room before anyone steps into it.'],
  ['p4', 'We go along the dry ribs by the wall, staying out of the churn.'],
  ['p3', 'What is that barge doing, and what happens if we open the pump?'],
  ['p1', 'Enough talking. I swing at the nearest thing that will take a hit.'],
  ['*', 'FIGHT'],
  ['p2', 'How much damage does that field do, and how do I get the thing off my arm?'],
  ['p3', 'We harvest what fell in here before we move.'],
  ['p2', 'Leave the pump. We go on up the pyloric duct toward the brood.'],
];
// Site 4: the brood, where nothing wants to fight and the room is about being legal. 8.4 says charge
// for both routes, so the table tries the registration first and the cut second - which is also how
// the room's own HUNGER and TOLL rows get exercised.
const SCRIPT4 = [
  ['*', 'FIGHT'],
  ['p2', 'The way is clear. We go on up the duct into the Brood.'],
  ['p2', 'Nobody draws. I want to speak to whoever holds this place.'],
  ['p1', 'What would it take to register a claim here? Say what you need from us.'],
  ['p3', 'What is the not-whale, actually? What can the Eyes smell in this water?'],
  ['p4', 'How close can we get to the nursery before something turns on us?'],
  ['p2', 'If we cannot register it, what is the brood worth cut?'],
  ['p1', 'Then we cut it. Get to work.'],
  ['*', 'FIGHT'],
  ['p3', 'We harvest what fell in here before we go on.'],
  ['p3', 'We take what we cut and go on up the duct toward the Gut Stone.'],
];
// Site 5: the Gut Stone, the Deadly room. Two things claim it and neither is evil (a Warden's recovery
// crew and a Guardian folded round the print job). The table reads the serial, looks for someone to
// talk to, asks where the way out is, tries the serial out loud and a mask, then fights. The countdown
// question is a probe for the Render Charge: the Director may name the TOLL but never invent a timer.
const SCRIPT5 = [
  ['*', 'FIGHT'],
  ['p2', 'The way is clear. We go on up the pyloric duct to the Gut Stone.'],
  ['p1', 'Before anyone moves, what is this thing wedged in the gut, and how big is it?'],
  ['p2', 'I taste the acid halo and look for a serial on the face of the stone.'],
  ['p3', 'Who holds this place? Is there anyone here we can talk to?'],
  ['p4', 'Where is the exit shaft, and how far is the way out if this goes wrong?'],
  ['p1', 'We say the serial out loud to whoever is in charge and ask what they will pay for it.'],
  ['p2', 'I mask the Cohort and try to slip past the crew to the face of the stone.'],
  ['p4', 'How long until the stone goes? Is anything counting down?'],
  ['p1', 'Enough talking. I swing the flail at the nearest thing wearing a Hegemony mark.'],
  ['*', 'FIGHT'],
  ['p3', 'We harvest what fell in here before we run.'],
  ['p4', 'We run for the exit shaft.'],
  ['p2', 'Up the shaft. We go out of the whale.'],
];
const SEATS = [['p1', 'Roly', 'wall', 'Bresk of the Sixth Choir'], ['p2', 'Sam', 'eyes', 'Brost of the Third Current'], ['p3', 'Ana', 'ledger', 'Ilm of the Open Hand'], ['p4', 'Kit', 'rider', 'Vash of the Long Reach']];

async function once(n) {
  let s = newSession(scenario);
  const snap = from > 1 ? JSON.parse(readFileSync(snapFile(from), 'utf8')) : null;
  if (snap) s = snap.state;
  // The table's memory, as the host keeps it: every change observed, a chapter on leaving a site.
  const mem = createMemory({ dir: mkdtempSync(join(tmpdir(), 'oxd-bench-')) });
  if (snap) for (const c of snap.chapters || []) mem.addChapter(s.gameId, c);
  mem.observe(null, s);
  // Leaving a site closes a chapter, written by the model as the host's Director would
  // (or plainly with --plain-chronicle). Its cast goes into the Ledger, as on the host.
  const pendingChapters = [];
  const moved = (prev) => {
    mem.observe(prev, s);
    if (prev.scene.siteId !== s.scene.siteId) pendingChapters.push(prev.scene.siteId);
  };
  async function writeChapters() {
    while (pendingChapters.length) {
      const siteId = pendingChapters.shift();
      const done = mem.chapters(s.gameId);
      const lines = mem.linesSince(s.gameId, done.length ? done[done.length - 1].toSeq : 0);
      if (!lines.some((l) => l.kind === 'say' || l.kind === 'narration')) continue;
      const name = scenario.sites.find((x) => x.id === siteId).name;
      let text = '';
      let cast = [];
      let by = 'engine';
      if (!flag('--plain-chronicle')) {
        try {
          const t0 = Date.now();
          const reply = await makeQuick().start({ system: CHRONICLE_INSTRUCTIONS, tools: [] }).send(chronicleRequest({ siteName: name, lines, known: Object.values(s.cast || {}).map((c) => c.name) }));
          ({ chapter: text, cast } = parseChronicle(reply.text));
          cast = filterCast(cast, { organisms: Object.values(s.organisms), sites: scenario.sites });
          by = 'ai';
          console.log(`  (chronicle for ${name}, ${((Date.now() - t0) / 1000).toFixed(1)} s) ${text}`);
          if (cast.length) console.log(`  (chronicle remembers) ${cast.map((c) => `${c.name} [${c.kind}]: ${c.fact}`).join(' | ')}`);
        } catch (e) { console.log(`  (chronicle failed: ${e.message})`); }
      }
      if (!text) { text = plainChapter({ siteName: name, lines }); by = 'engine'; }
      if (!text) continue;
      mem.addChapter(s.gameId, { t: Date.now(), siteId, site: name, why: 'left', toSeq: Math.max(0, ...lines.map((l) => l.seq || 0)), text, by });
      if (cast.length) { try { const prev = s; s = apply(s, { type: 'cast.remember', entries: cast.map((c) => ({ ...c, origin: 'table' })) }, ctx('host', null)); mem.observe(prev, s); } catch (e) { /* the chapter stands */ } }
    }
  }
  // The scripted players take whatever they are offered, as a quick table would.
  function shareOut() {
    const got = [];
    for (let i = 0; i < 80 && s.loot && s.loot.offer; i++) {
      const o = s.organisms[s.loot.offer.orgId];
      const item = s.loot.queue.find((x) => x.id === s.loot.offer.itemId);
      act('player', o.playerId, { type: 'loot.take' });
      got.push(`${o.name.replace(/ of .*$/, '')} ${item.grade}`);
    }
    if (got.length) console.log(`  (shared out in the picking order) ${got.join(', ')}`);
  }
  const memoryFor = () => ({ chapters: mem.chapters(s.gameId).slice(-3), search: (q, o = {}) => mem.search(s.gameId, q, { ...o, cast: s.cast || {} }) });
  const act = (role, pid, a) => { const prev = s; s = apply(s, a, ctx(role, pid)); moved(prev); };
  const callsFrom = calls.length;
  const tally = { turns: 0, refusals: 0, leaks: 0, unpaid: 0, clocks: 0, reversed: 0, buried: 0, style: 0, tokensIn: 0, tokensOut: 0, ms: 0, recalls: 0, remembers: 0, refusedBy: {}, hard: 0, soft: 0, rescueBy: {}, preplay: 0, bursts: 0 };
  // Before play (20 Nov): the first player joins and asks the Director about the game before choosing.
  // The answer must not start the adventure or change the world: no tool but look_up_rules or recall.
  const prePlay = !snap && !flag('--no-preplay');
  for (const [pid, who, hand, name] of snap ? [] : SEATS.slice(0, players)) {
    act('player', pid, { type: 'join', name: who });
    if (prePlay && pid === 'p1') {
      const q = 'Before I pick: what is this game about, and which organism would suit someone who likes protecting people?';
      console.log(`\n${who.toUpperCase()} (before play): ${q}`);
      act('player', pid, { type: 'say', text: q });
      const r = await directorTurn({ state: s, scenario, bestiary, provider: makeProvider(), rng, now: Date.now(), reason: 'a player spoke', memory: memoryFor() });
      s = r.state;
      const bad = r.calls.filter((c) => !['look_up_rules', 'recall'].includes(c.name));
      for (const c of r.calls) console.log(`    [${c.name}] ${JSON.stringify(c.args)}${c.result && c.result.refused ? `  REFUSED: ${c.result.refused}` : ''}`);
      console.log(`  DIRECTOR (before play): ${r.narration}`);
      // A tool the Engine blocked (it returns a note) changed nothing: a style flag. One that ran is a failure.
      const ran = bad.filter((c) => !(c.result && c.result.note && /^Nothing changed: a player who has not chosen/.test(c.result.note)));
      if (ran.length) { tally.preplay += 1; console.log(`    ! preplay: changed the world before play (${ran.map((c) => c.name).join(', ')})`); }
      else if (bad.length) { tally.style += 1; console.log(`    ! style: tried ${bad.map((c) => c.name).join(', ')} before play (blocked; nothing changed)`); }
      if (!/\?\s*["”]?\s*$/.test(r.narration)) { tally.style += 1; console.log('    ! style: the before-play answer does not end on a question'); }
    }
    act('player', pid, { type: 'zero.agree' });
    act('player', pid, { type: 'claim', organismId: hand, name });
  }
  // The Eyes knows two Bursts on the bench (20 Nov): one to hurt with, one to mend with. The First
  // Carve's Hands learn none, so this is the only way the table sees one land.
  if (!snap && s.organisms.eyes && !flag('--no-burst')) s.organisms.eyes.bursts = ['Enzyme Spit', 'Substrate Patch'];
  const burstUsed = new Set();

  async function director(reason) {
    const t0 = Date.now();
    const r = await directorTurn({ state: s, scenario, bestiary, provider: makeProvider(), rng, now: Date.now(), reason, memory: memoryFor() });
    const prev = s;
    s = r.state;
    moved(prev);
    // What the Engine itself did, so a gate read can check Clocks, Oaths, collapses and deaths against the story.
    for (const e of s.log.filter((x) => x.seq > engSeq && (x.kind === 'clock' || x.kind === 'danger' || /Oath|Total Lysis|Render Cascade|Autophagic|Dormant|Countdown/.test(String(x.text))))) console.log(`  (engine) ${e.text}`);
    engSeq = s.seq;
    await writeChapters();
    shareOut();
    for (const c of r.calls) { if (c.name === 'recall') tally.recalls += 1; if (c.name === 'remember') tally.remembers += 1; }
    tally.turns += 1;
    tally.ms += Date.now() - t0;
    tally.refusals += r.refusals;
    for (const x of r.rescues || []) { tally[x.hard ? 'hard' : 'soft'] += 1; tally.rescueBy[x.kind] = (tally.rescueBy[x.kind] || 0) + 1; console.log(`    ! rescue (${x.hard ? 'hard' : 'soft'}): ${x.text}`); }
    tally.tokensIn += r.usage.in;
    tally.tokensOut += r.usage.out;
    for (const c of r.calls) {
      // Which calls the page is saying no to, counted as well as printed: a gate read that lists the
      // refusals by call shows at a glance whether one habit is still costing runs (hazard_damage and
      // settle_oath were the whole of the 13 Nov evening gate) rather than making Roly scroll for it.
      if (c.result && c.result.refused) tally.refusedBy[c.name] = (tally.refusedBy[c.name] || 0) + 1;
      console.log(`    [${c.name}] ${JSON.stringify(c.args)}${c.result && c.result.refused ? `  REFUSED: ${c.result.refused}` : ''}`);
    }
    console.log(`  DIRECTOR: ${r.narration}`);
    for (const f of r.flags) {
      if (f.kind === 'leak') tally.leaks += 1;
      if (f.kind === 'style') tally.style += 1;
      // The Engine-refused count is already tallied from r.refusals; this is the other rule flag:
      // narration that described harm no tool paid for.
      if (f.kind === 'rule' && !/^The Engine refused/.test(f.text)) {
        // Harm nobody paid for, and a Clock named as moving that nothing moved: the same fault in two
        // shapes, tallied apart so a gate read says which one the table heard.
        if (/^Names (.+ moving when nothing moved it|the count)/.test(f.text)) tally.clocks += 1;
        else if (/^Reverses /.test(f.text)) tally.reversed += 1;
        else if (/is dead or dissolved, but the Engine|is destroyed, but the Engine has it still fighting|^Says the fight is over, but/.test(f.text)) tally.buried += 1;
        else tally.unpaid += 1;
      }
      console.log(`    ! ${f.kind}: ${f.text}`);
    }
  }

  // The players' side, played simply: roll what is asked, let attacks fall, strike on their turn.
  let engSeq = 0;
  let lastSaid = '';
  let stallKey = '';
  let stallRun = 0;
  async function settle(maxSteps = 12, maxCycle = 3) {
    for (let guard = 0; guard < maxSteps; guard++) {
      const q = s.requests[0];
      if (q) {
        const pid = q.kind === 'incoming' ? s.organisms[q.target.id].playerId : s.organisms[q.actor.id].playerId;
        act('player', pid, { type: 'roll', requestId: q.id });
        const r = s.rolls[s.rolls.length - 1];
        console.log(`  (roll) ${r.who}: ${r.dice.join(',')} = ${r.total} against ${r.at}: ${r.success ? `success, Overflow ${r.overflow}` : `short by ${r.shortBy}`}`);
        await director('a roll was made');
        continue;
      }
      const cur = s.fight && s.fight.turn ? s.fight.actors[s.fight.turn] : null;
      if (cur && cur.kind === 'cre') {
        // No-rescue check: a creature's turn the Director cannot finish. Three turns running that leave
        // the same creature on turn is a stall a host would have had to clear by hand.
        const key = `${s.fight.turn}@${s.fight.cycle}`;
        stallRun = key === stallKey ? stallRun + 1 : 0;
        stallKey = key;
        if (stallRun >= 2) { tally.hard += 1; tally.rescueBy.stall = (tally.rescueBy.stall || 0) + 1; console.log(`    ! rescue (hard): ${cur.id} has had ${stallRun + 1} Director turns and is still on turn; a host would have to end it.`); act('host', null, { type: 'turn.end', cid: cur.id }); stallRun = 0; continue; }
        await director('a creature is to act'); continue;
      }
      if (cur && cur.kind === 'org' && s.fight.cycle <= maxCycle) {
        const o = s.organisms[cur.id];
        // The scripted players attack what is fighting them first.
        const up = Object.values(s.creatures).filter((c) => c.siteId === s.scene.siteId && !c.down);
        // If nothing is fighting, the scripted player still attacks: that is what they said they would do.
        // They go for what they named ("the nearest swarm") before anything else that is fighting.
        const named = up.filter((c) => !c.stoodDown && lastSaid.includes(String(c.name).replace(/\s+[A-Z]$/, '').split(/\s+/).pop().toLowerCase()));
        const target = named[0] || up.find((c) => !c.stoodDown) || up[0];
        const w = o.weapons.find((x) => x.carried !== false);
        const cost = 2 + (w.props.includes('Heavy') ? 1 : 0);
        // Once a fight, an organism that knows a Burst that hurts casts it instead of striking.
        const spit = (o.bursts || []).includes('Enzyme Spit') && target && !burstUsed.has(`${o.id}@${s.fight.id || s.fight.cycle}@${s.scene.siteId}`) && cur.pp >= 2 && o.atp >= 4;
        if (spit) {
          burstUsed.add(`${o.id}@${s.fight.id || s.fight.cycle}@${s.scene.siteId}`);
          console.log(`  (${o.name} casts Enzyme Spit at ${target.name})`);
          try { act('player', o.playerId, { type: 'act', organismId: o.id, action: 'burst', burst: 'Enzyme Spit', targetId: target.cid }); tally.bursts += 1; continue; } catch (e) { console.log(`    (the Burst was refused: ${e.message})`); }
        }
        if (target && cur.pp >= cost) {
          console.log(`  (${o.name} strikes ${target.name})`);
          act('player', o.playerId, { type: 'strike', organismId: o.id, weaponId: w.id, targetId: target.cid });
        } else {
          act('player', o.playerId, { type: 'turn.end', organismId: o.id });
          await director('a turn ended');
        }
        continue;
      }
      break;
    }
  }

  console.log(`\n===== Run ${n}: ${info.name} · ${model}${info.group === 'local' && thinking !== 'default' ? ` · thinking ${thinking}` : ''} =====`);
  if (snap) console.log(`(starting at stage ${from}, ${scenario.sites.find((x) => x.id === s.scene.siteId).name}, from the saved table: ${Object.values(s.organisms).filter((x) => x.playerId).map((o) => `${o.name.split(' ')[0]} MI ${o.mi}/${o.miMax}`).join(', ')}; CARCASS ${s.clocks.CARCASS.filled}, TOLL ${s.clocks.TOLL.filled}, HUNGER ${s.clocks.HUNGER.filled})`);
  else await director('opening the scene');
  // Each part ends by handing the Cohort on to the next room, so every part but the last loses its
  // final line: the move is said once, and each later part opens with its own move line. `--sites 4` and `--sites 5` are long rehearsals, not the gate.
  const parts = (vec.id === 'ninth-shift' ? NINTH : vec.id === 'long-swallow' ? SWALLOW : [SCRIPT, SCRIPT2, SCRIPT3, SCRIPT4, SCRIPT5]).slice(from - 1, sites);
  const lines = parts
    .flatMap((p, i) => (i < parts.length - 1 ? p.slice(0, -1) : p).map((l) => [...l, from - 1 + i]))
    .filter(([pid]) => pid === '*' || Number(pid.slice(1)) <= players);
  const saved = new Set();
  for (const [pid, text, part] of lines) {
    // On entering each later stage (after the last one's fight is played out, before the move line), the
    // table is saved, so `--from N` can pick the run up there.
    if (pid !== '*' && part >= 1 && !saved.has(part)) {
      saved.add(part);
      if (!snap || part > from - 1) {
        try { mkdirSync(snapDir, { recursive: true }); writeFileSync(snapFile(part + 1), JSON.stringify({ at: new Date().toISOString(), state: s, chapters: mem.chapters(s.gameId) })); console.log(`  (table saved for --from ${part + 1})`); } catch (e) { console.log(`  (could not save the table: ${e.message})`); }
      }
    }
    if (pid === '*') { if (s.fight) { console.log('\n(the fight is played out)'); await settle(80, 8); } continue; }
    const o = Object.values(s.organisms).find((x) => x.playerId === pid);
    console.log(`\n${o.name.toUpperCase()}: ${text}`);
    lastSaid = text.toLowerCase();
    const siteBefore = s.scene.siteId;
    act('player', pid, { type: 'say', text });
    await director('a player spoke');
    await settle();
    // A move the Director only asked about ("does anyone cut before you go?") is said again once, so a
    // later part never plays in the room before it.
    if (/^The way is clear\./.test(text) && s.scene.siteId === siteBefore) {
      console.log(`\n${o.name.toUpperCase()}: Yes. Nothing more to cut. We go now.`);
      lastSaid = 'we go now';
      act('player', pid, { type: 'say', text: 'Yes. Nothing more to cut. We go now.' });
      await director('a player spoke');
      await settle();
    }
  }
  console.log(`\nRun ${n}: ${tally.turns} Director turns, ${(tally.ms / tally.turns / 1000).toFixed(1)} s each on average, ${tally.tokensIn} tokens in, ${tally.tokensOut} out.`);
  console.log(`  Engine refusals (things it tried that the rules or the page do not allow): ${tally.refusals}${Object.keys(tally.refusedBy).length ? ` — by call: ${Object.entries(tally.refusedBy).map(([k, v]) => `${k} ${v}`).join(', ')}` : ''}`);
  speedLine(calls.slice(callsFrom), 'Speed');
  console.log(`  Rescues (where a human host would have had to step in): ${tally.hard} hard, ${tally.soft} soft${Object.keys(tally.rescueBy).length ? ` — ${Object.entries(tally.rescueBy).map(([k, v]) => `${k} ${v}`).join(', ')}` : ''}`);
  console.log(`  Leak flags: ${tally.leaks}`);
  console.log(`  Before play: ${prePlay ? (tally.preplay ? `${tally.preplay} answer changed the world` : 'answered as a guide') : 'not tried'}; Bursts cast: ${tally.bursts}`);
  console.log(`  Bodies buried in narration (a player narrated dead or dissolved while the Engine has them standing): ${tally.buried}`);
  console.log(`  Unpaid damage in narration (harm the table heard that no tool paid for): ${tally.unpaid}`);
  console.log(`  Unpaid Clocks in narration (a Clock named as moving when nothing moved it): ${tally.clocks}`);
  console.log(`  Reversed rolls in narration (a throw the page passed, described as failing): ${tally.reversed}`);
  console.log(`  Style flags (questions, length, formatting): ${tally.style}`);
  if (scenario.kit) { const f = Object.keys((s.kit || {}).found || {}); console.log(`  Secrets the Cohort learned (v3): ${f.length} of ${scenario.kit.secrets.length}${f.length ? ` (${f.join(', ')})` : ''}`); }
  console.log(`  Ended at: ${scenario.sites.find((x) => x.id === s.scene.siteId).name}; ${Object.values(s.clocks).map((c) => `${c.name} ${c.filled}`).join(', ')}`);
  const cards = Object.values(s.cast || {});
  console.log(`  Memory: ${tally.recalls} recall, ${tally.remembers} remember; ${cards.length} on record${cards.length ? ` (${cards.map((c) => `${c.name} [${c.origin}]`).join(', ')})` : ''}; ${mem.chapters(s.gameId).length} chapter(s)`);
  const g = (x) => ['C', 'G', 'P', 'T'].filter((k) => x && x[k]).map((k) => `${x[k]} ${k}`).join(', ') || 'none';
  for (const o of Object.values(s.organisms).filter((x) => x.playerId)) console.log(`  ${o.name}: MI ${o.mi}/${o.miMax}, Stress ${o.stress}, Codon ${o.codon}, ${o.substrate} S, cut unstamped ${g(o.specimens)}, stamped ${g(o.stamped)}, Bulk ${o.bulk || 0}${o.oath != null ? `, Oath boxes ${o.oath}/${o.oathMax}` : ''}`);
  return tally;
}

let bad = 0;
for (let i = 1; i <= runs; i++) {
  try {
    const t = await once(i);
    if (t.refusals || t.leaks || t.unpaid || t.buried || t.clocks || t.reversed || t.hard || t.preplay) bad += 1;
  } catch (e) {
    console.log(`\nRun ${i} stopped: ${e.message}`);
    bad += 1;
  }
}
if (runs > 1) { console.log(''); speedLine(calls.filter((c, i) => i >= 0), 'Speed, all runs together'); }
console.log(bad ? `\nGATE NOT PASSED: ${bad} of ${runs} run(s) had refusals, leaks, unpaid damage, unpaid Clocks, reversed rolls, hard rescues or errors. Read the transcript above.` : `\nGATE PASSED for ${model}: no refusals, leaks, unpaid damage, unpaid Clocks, reversed rolls or hard rescues in ${runs} run(s). Read the transcript for quality.`);
