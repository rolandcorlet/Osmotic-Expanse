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
//   node tools/bench.mjs --part 4              part 4: The Ashen Crown, session 1: the ambush at Highbridge Gorge, Oakhurst, Blackreed Mill
//   node tools/bench.mjs --part 6              part 6: story seeds in play (The Lantern): trouble picked at the inn, a party
//                                              getting nowhere, and a camp on the Mill Road attacked in the night
//   --no-library                               play on the SRD alone, without your private book library
//   --level <n>                                the heroes' starting level (default: the story's: parts 1, 2 and 4 at 1st,
//                                              part 3 at 2nd; they level up as the XP comes)
//   --script gen --adventure <id> [--places 6] [--route quests]  a script written from the adventure itself
//                                              (--route quests: the way to each quest's place in turn):
//                                              (any campaign):
//                                              its places along the exits, a probe per check, a word with
//                                              someone, its fights, and the quests that end there (the
//                                              adventure's own starting level)
//
// Prefer --log to `> file.log`: PowerShell's redirect writes UTF-16LE and mangles the transcript.
// With --log, the bench also keeps <log name>.status.json up to date (see tools/bench-watch.mjs): what it is
// doing, a heartbeat every 30 s, and how it ended (finished, crashed, window closed, Ctrl+C), plus GPU
// readings in <log name>.gpu.csv when nvidia-smi is installed. `node tools/bench-status.mjs` reads them.
//   --crash-at <label>                         testing only: throw at that step (the run's error), or at
//                                              "summary" (a crash), to check the reports
//
// Part 1: the opening at the Ford Inn, talking to the Reeve, an Insight check, the road north,
// a Perception check at the mill, the goblin fight to the end, and searching the bodies.
// Part 4 (The Ashen Crown of Sundermark, three of its ready-made heroes, 3rd level): the game opens
// mid-ambush on the burning bridge, then the clues, Oakhurst, Father Lucan, the bailiff, the road to
// Blackreed Mill, a stealth check on the roof and the fight with the River Rats.
// Part 2 (level 4 heroes, the mill goblins already dead): the switchback path, the sentries on the
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
// Reported but not gated: style flags (long, no closing question), and a step's expected outcome missing.
// A step names the tool its moment calls for (expect), but what is checked is the outcome in the game,
// however the Director got there: the party moved on, a fight started, XP was paid, a quest was finished.
// An outcome the world has made impossible is not checked (no monsters left to fight, no quest open), and
// a check answered without a roll (a passive score) is counted apart, as "no roll asked". An outcome the
// adventure's own rules brought about by themselves (a milestone at a fight's end, a quest done when a place
// is cleared) counts for the later step that expects it ("done by the adventure's rules").
// The adventure checker (engine/check.js) runs first and prints what it finds about the adventure file.

import { readFileSync, existsSync, openSync, writeSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { newSession, apply, openAdventure } from '../engine/ledger.js';
import { systemRng } from '../engine/dice.js';
import { ADVENTURES, adventureById } from '../data/adventures/index.js';
import { withConverted, findAdventure } from './adventures.mjs';
import { prepareSrd } from '../engine/library.js';
import { pregenBuild } from '../engine/pregen.js';
import { directorTurn } from '../brain/director.js';
import { checkAdventure } from '../engine/check.js';
import { allRules } from '../engine/triggers.js';
import { recordTurn } from '../brain/replay.js';
import { generateScript } from '../engine/script-gen.js';
import { appendFileSync, writeFileSync } from 'node:fs';
import { build, providerInfo, PROVIDERS } from '../brain/providers.js';
import { statusPaths, createStatus, gpuReader, HEARTBEAT_SECS } from './bench-watch.mjs';

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
// --script gen: a script written from the adventure itself (engine/script-gen.js), for any campaign.
const gen = opt('--script', '') === 'gen';
const part = gen ? 5 : ['2', '3', '4', '6'].includes(opt('--part', '1')) ? Number(opt('--part', '1')) : 1;
// The heroes' level in each part: the level the story has reached by then (26 Nov), not one raised for
// safety. The Lantern is 1st level to the watchtower and 2nd after it (its milestone rule), 3rd after the
// chapel; The Ashen Crown's first session is 1st level; a generated script starts at the adventure's own
// level. On the way the players level up whenever the XP is there (levelUps below), as a table would.
// Fights are fitted to the small party (engine/scale.js). --level overrides.
const LEVELS = { 1: 1, 2: 1, 3: 2, 4: 1, 5: 0, 6: 1 };
const startLevel = LEVELS[part] || 0;
let level = Math.min(20, Math.max(1, Math.round(Number(opt('--level', startLevel))) || startLevel || 1));
const logFile = opt('--log', '');
// The model's tool calls, with the game before each turn, for replaying after code changes (tools/replay.mjs).
const callsFile = logFile ? `${logFile.replace(/\.log$/i, '')}.calls.jsonl` : '';
if (callsFile) { try { writeFileSync(callsFile, ''); } catch { /* a bench never stops for its record */ } } // this bench's calls only
const verbose = !flag('--quiet');
const crashAt = opt('--crash-at', '');

let watch = null;
if (logFile) {
  // The log is written as each line is printed (not buffered), so a bench that is stopped or crashes
  // leaves everything up to that moment. Everything the console shows goes in: the transcript, warnings
  // and crash reports.
  const fd = openSync(logFile, 'w');
  const put = (chunk) => { try { writeSync(fd, typeof chunk === 'string' ? chunk : Buffer.from(chunk)); } catch { /* the bench goes on */ } };
  put(`# D&D bench ${new Date().toISOString()} provider=${fake ? 'fake' : provider} model=${fake ? '-' : model} thinking=${thinking} runs=${runs} level=${level}\n`);
  const paths = statusPaths(logFile);
  watch = createStatus(paths.status, { part, runs, level, provider: fake ? 'fake' : provider, model: fake ? '-' : model, log: logFile });
  for (const stream of [process.stdout, process.stderr]) {
    const orig = stream.write.bind(stream);
    stream.write = (chunk, ...rest) => { put(chunk); watch.line(typeof chunk === 'string' ? chunk : String(chunk)); return orig(chunk, ...rest); };
  }
  // The heartbeat goes on while the bench waits on the model; GPU readings ride along with it.
  const readGpus = gpuReader({ csvFile: paths.gpu });
  const beat = () => readGpus((gpus, note) => watch.beat(gpus, note));
  beat();
  setInterval(beat, HEARTBEAT_SECS * 1000).unref();
  // How it ended, in the status file. A crash is reported in the log too.
  // The status file first, then the log, and the console last: a closing console may refuse the write.
  process.on('uncaughtException', (e) => {
    const text = e && e.stack ? e.stack : String(e);
    watch.end('crashed', { error: text, exitCode: 3 });
    // Through the console copy, so the log has it even if the console refuses it.
    try { console.error(`\nCRASH: ${text}`); } catch { /* nothing more to do */ }
    process.exit(3);
  });
  const stopOn = (sig, state, code, why) => process.on(sig, () => {
    watch.end(state, { exitCode: code });
    put(`\n${sig}: ${why}. The bench stopped.\n`);
    process.exit(code);
  });
  stopOn('SIGINT', 'interrupted', 130, 'Ctrl+C');
  stopOn('SIGBREAK', 'interrupted', 131, 'Ctrl+Break');
  stopOn('SIGHUP', 'closed', 129, 'the console window was closed');
  stopOn('SIGTERM', 'killed', 143, 'asked to stop');
  process.on('exit', (code) => watch.end(watch.get().gate ? 'finished' : 'ended', { exitCode: code }));
}
if (!fake && ((info.key === 'required' && !apiKey) || !model)) {
  console.log(`Set up ${info.name} on the Director tab first: ${info.key === 'required' && !apiKey ? 'save a key' : 'choose a model'} (or pass --model).`);
  process.exit(1);
}

// Every model call is timed.
const calls = [];
// The step whose Director turn is running, and how many model calls it has made (for the status file).
let watchLabel = '';
let watchCall = 0;
function timed(p) {
  const start = p.start.bind(p);
  return { ...p, start(o) {
    const chat = start(o);
    const wrap = (fn) => async (...a) => {
      const t0 = Date.now();
      if (watch) watch.waiting(`${watchLabel || 'a Director turn'}, model call ${++watchCall}`);
      try {
        const r = await fn(...a);
        calls.push({ ms: Date.now() - t0, in: (r.usage || {}).in || 0, out: (r.usage || {}).out || 0 });
        return r;
      } finally { if (watch) watch.idle(); }
    };
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

const srd = JSON.parse(readFileSync(join(here, '..', '..', 'data', 'srd.engine.json'), 'utf8'));
// As the server does: the private book library (if built) and every adventure's own monsters.
const libFile = join(here, '..', 'library', 'library.json');
withConverted(!flag('--no-library')); // and those converted on the Books tab (library/adventures)
const prep = prepareSrd(srd, { libraryFile: flag('--no-library') ? null : libFile, adventures: ADVENTURES });
const adventure = gen ? findAdventure(opt('--adventure', 'lantern')) : adventureById(part === 4 ? 'ashen-crown' : 'lantern');
if (!adventure) { console.log(`There is no adventure "${opt('--adventure', '')}". Adventures: ${ADVENTURES.map((a) => a.id).join(', ')}.`); process.exit(2); }
if (gen && !opt('--level', '')) level = Math.min(20, Math.max(1, Number((adventure.party || {}).level) || 1));
const rng = systemRng();
const ctx = (role, pid) => ({ role, pid, rng, now: Date.now(), adventure, srd });
const BASE = { str: 15, dex: 13, con: 14, int: 8, wis: 12, cha: 10 };
// A level 4 ability increase each, and the spells a cleric of 3rd and 5th level prepares (the Engine keeps
// only those the level can cast).
const HEROES = [
  ['p1', 'Roly', { name: 'Bryn', asi: [{ level: 4, ab: { str: 2 } }], race: 'dwarf', subrace: 'hill-dwarf', class: 'fighter', method: 'standard', base: BASE, skills: ['athletics', 'perception'], background: 'acolyte', style: 'defense', kit: [0, 0, 0, 0] }],
  ['p2', 'Keith', { name: 'Ila', race: 'human', class: 'cleric', subclass: 'life', method: 'standard', base: { str: 13, dex: 10, con: 14, int: 8, wis: 15, cha: 12 }, skills: ['medicine', 'insight'], background: 'acolyte', spells: { cantrips: ['sacred-flame', 'guidance', 'light'], prepared: ['cure-wounds', 'bless', 'guiding-bolt', 'spiritual-weapon', 'spirit-guardians'] }, asi: [{ level: 4, ab: { wis: 2 } }] }],
];

// Part 4's heroes: three of The Ashen Crown's ready-made characters, built as the player's screen builds them.
const HEROES4 = [['p1', 'Roly', 'bram'], ['p2', 'Keith', 'hilde'], ['p3', 'Sam', 'pell']]
  .map(([pid, name, id]) => [pid, name, pregenBuild(id, srd, level, adventure.pregens || [])]);
// A generated script plays the adventure's first three ready-made heroes, or Bryn and Ila when it has none.
const PREGEN_RUN = part === 4 || (gen && (adventure.pregens || []).length >= 3);
// Which ready-made hero each seat plays, so a level-up rebuilds the same one (levelUps).
const PREGEN_IDS = part === 4 ? ['bram', 'hilde', 'pell'] : gen && PREGEN_RUN ? adventure.pregens.slice(0, 3).map((p) => p.id) : [];
const HEROES_RUN = part === 4 ? HEROES4 : gen && PREGEN_RUN ? [['p1', 'Roly'], ['p2', 'Keith'], ['p3', 'Sam']].map(([pid, name], n) => [pid, name, pregenBuild(adventure.pregens[n].id, srd, level, adventure.pregens)]) : HEROES;

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

// Part 3 (21 Nov; level 5 heroes since 25 Nov) with the lantern, from Thornwick Ford through the Greyfen to the
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

// Part 4 (24 Nov): The Ashen Crown of Sundermark, session 1. The game opens mid-ambush, so the very
// first Director turn should start the fight.
const SCRIPT4 = [
  { start: true, expect: ['start_combat'] },
  { fight: 'highbridge' },
  { pid: 'p2', say: 'I search the wreckage and the strongbox. What did the raiders leave behind?', expect: ['ask_for_roll'] },
  { pid: 'p1', say: 'We help Halia get the wagons off the bridge and on to Oakhurst.', expect: ['move_party'] },
  { pid: 'p3', say: 'I find Father Lucan at the shrine and show him the plaque rubbing. What does it mean?', expect: [], at: 'oakhurst' },
  { pid: 'p2', say: 'I watch the bailiff while he thanks us for saving the caravan. Is he hiding something?', expect: ['ask_for_roll'], at: 'oakhurst' },
  { pid: 'p1', say: 'We follow the ledger downriver to Blackreed Mill.', expect: ['move_party'] },
  { pid: 'p3', say: 'I creep across the roof shingles to the loft hatch, as quietly as I can.', expect: ['ask_for_roll'], at: 'blackreed' },
  { pid: 'p1', say: 'I kick in the bunkhouse door and attack the nearest smuggler!', expect: ['start_combat'], at: 'blackreed' },
  { fight: 'blackreed' },
  { pid: 'p2', say: 'I search the mill\'s strongroom for papers and the shipments.', expect: ['ask_for_roll'], at: 'blackreed' },
];

// Part 6 (26 Nov): the DM's story seeds in play. Three seeds are written on the Seeds tab: the Reeve's men
// who step in when the party starts trouble at the inn (the Director sees it and calls use_seed), a tinker
// who finds a party getting nowhere (the Engine, after three idle turns), and wolves at a camp on the open
// road (the Engine, 100%), after which the party finishes its rest.
const SEEDS6 = [
  '# Seed: The Reeve\'s men\nWhere: thornwick\nWhen: the party picks a fight with the innkeeper\nHook: Two of the Reeve\'s men drinking in the corner stand up and step in.\nTruth: The Reeve keeps the peace at the Ford.\nEncounter: guard x2\nEnding: The party backs down, or is thrown out.',
  '# Seed: The tinker\nWhen: lost after 3 turns\nHook: A tinker with a mule cart comes in out of the rain with news of goblin tracks on the Mill Road.\nEncounter: none\nEnding: The party takes the road north.',
  '# Seed: Wolves in the night\nWhere: any\nWhen: camp in the wild\nChance: 100%\nLimit: daily\nHook: Wolves circle the camp in the dark.\nEncounter: wolf x2',
];
const SCRIPT6 = [
  { start: true, expect: [] },
  { pid: 'p1', say: 'I grab the innkeeper by the collar, haul him over the bar and tell him the ale is free tonight or I break every barrel.', expect: ['trouble_seed'], at: 'thornwick' },
  { pid: 'p2', say: 'Enough, Bryn. Let him go. We sit down by the fire.', expect: [] },
  { pid: 'p1', say: 'We order a jug of ale and play dice by the fire.', expect: [] },
  { pid: 'p2', say: 'I tell a long story about my old temple.', expect: [] },
  { pid: 'p1', say: 'We play another round of dice.', expect: [] },
  { pid: 'p2', say: 'We have another drink and wait to see who comes in.', expect: ['lost_seed'] },
  { pid: 'p1', say: 'We take the Mill Road north before it gets dark.', expect: ['move_party'] },
  { pid: 'p2', say: 'Night falls. We make camp off the road and take a long rest.', expect: ['camp_seed'], at: 'mill-road' },
  { fight: 'mill-road' },
  { pid: 'p1', say: 'At dawn we pack up the camp and look around.', expect: ['rested'] },
];

// --script gen: walk the adventure's places (--places, 6 by default) and say what players say there.
const SCRIPT_GEN = gen ? generateScript(adventure, { places: Number(opt('--places', 6)) || 6, heroes: HEROES_RUN.length, route: opt('--route', 'walk') }) : [];

// ---- one run ---------------------------------------------------------------------------------
async function runOnce(n) {
  const t0 = Date.now();
  const callsAt = calls.length;
  const tally = { turns: 0, refusal: 0, leak: 0, rule: 0, 'roll-words': 0, 'wrong-seat': 0, stall: 0, error: 0, style: 0, missing: 0, noRoll: 0, skipped: 0, nochange: 0, byRules: 0 };
  const notes = [];
  let stepTools = new Set(); // the tools the Director used (and the Engine allowed) during the current step
  let missedFight = false; // the step before a fight already counted "no fight started"
  let missedMove = false; // the step before already counted "the party did not move on"
  let s = part === 4 || gen ? openAdventure(newSession(adventure), adventure, ctx('host', null)) : newSession(adventure);
  const act = (role, pid, a) => { s = apply(s, a, ctx(role, pid)); };
  for (const [pid, name, input] of HEROES_RUN) {
    act('player', pid, { type: 'join', name });
    if (PREGEN_RUN) act('player', pid, { type: 'pc.create', input });
    else act('host', null, { type: 'pc.create', input: { ...input, level }, forPid: pid });
  }
  if (part === 2) {
    // The mill is behind them: the party is on the Mill Road, the scouts are dead, the story says so.
    act('host', null, { type: 'site.move', siteId: 'mill-road' });
    for (const f of Object.values(s.foes)) if (f.siteId === 'mill-road') act('host', null, { type: 'foe.remove', foeId: f.id });
    act('host', null, { type: 'say', text: 'Earlier: Bryn and Ila took the Reeve\'s job, followed the tracks up the Mill Road and killed the three goblin scouts at the ruined mill. Drag marks and a small black shoe point up the switchback path to the watchtower.', as: 'Recap' });
    s.started = true;
  }
  if (part === 6) {
    for (const text of SEEDS6) act('host', null, { type: 'seed.save', text });
    // The mill's goblins are gone (run 2, 26 Nov: with a goblin watching from the mill, the Director rightly
    // would not let the party bed down there): the road is empty, and only the night is a danger.
    // Its foes are placed on the party's first arrival, so the bench visits it first, clears it and comes back.
    act('host', null, { type: 'site.move', siteId: 'mill-road' });
    for (const f of Object.values(s.foes)) if (f.siteId === 'mill-road') act('host', null, { type: 'foe.remove', foeId: f.id });
    act('host', null, { type: 'site.move', siteId: 'thornwick' });
  }
  if (part === 3) {
    // The watchtower is behind them: Grisk is beaten, Nell is home, the lantern is lit in Bryn's hands.
    for (const site of ['mill-road', 'tower-gate', 'watchtower']) { act('host', null, { type: 'site.move', siteId: site }); for (const f of Object.values(s.foes)) if (f.siteId === site) act('host', null, { type: 'foe.remove', foeId: f.id }); }
    act('host', null, { type: 'site.move', siteId: 'thornwick' });
    act('host', null, { type: 'say', text: 'Earlier: Bryn and Ila beat Grisk at the old watchtower, freed Nell Hale and brought her home, and recovered the Lantern of the Ford. A letter on Grisk\'s throne said: "Bring the lamp to the chapel on the third night. The Brother pays in silver and in mercy. -- A." The lantern is lit in Bryn\'s hands. Four villagers are still missing in the Greyfen.', as: 'Recap' });
    s.started = true;
  }
  const pcOf = (pid) => s.pcs[s.players[pid].pcId];
  // Level-ups, as players take them when the XP is there (fights and the adventure's milestone rules give
  // it), between fights: each part is played at the level the story has reached.
  const levelUps = () => {
    if (s.fight && s.fight.phase === 'turns') return;
    HEROES_RUN.forEach(([pid], n) => {
      const pc = s.players[pid] && pcOf(pid);
      if (!pc || pc.dead || pc.level >= 20 || (pc.xp || 0) < (srd.xpTable[pc.level] || Infinity)) return;
      const next = pc.level + 1;
      const input = PREGEN_IDS[n] ? pregenBuild(PREGEN_IDS[n], srd, next, adventure.pregens || []) : { level: next };
      try { act('player', pid, { type: 'pc.rebuild', pcId: pc.id, input }); console.log(`  ${pc.name} reaches level ${next}.`); } catch (e) { notes.push(`${pc.name} could not level up: ${e.message}`); }
    });
  };
  const actingPc = () => { const f = s.fight; const k = f && f.phase === 'turns' ? f.order[f.turn].key : ''; return k.startsWith('pc:') ? s.pcs[k.slice(3)] : null; };

  async function turn(reason, label, expect = []) {
    tally.turns += 1;
    watchLabel = label;
    watchCall = 0;
    if (crashAt && label === crashAt) throw new Error(`--crash-at ${label}: a test crash`);
    const asked = actingPc();
    let out;
    const before = s;
    try {
      out = await directorTurn({ state: s, adventure, srd, provider: makeProvider(), rng, now: Date.now(), reason });
    } catch (e) {
      tally.error += 1; notes.push(`${label}: ERROR ${e.message}`); console.log(`  [${label}] ERROR: ${e.message}`); return false;
    }
    s = out.state;
    // Every tool call the model made, with the game before the turn, for tools/replay.mjs.
    if (callsFile) { try { const rec = recordTurn({ part, run: n, label, reason, before, calls: out.calls, adventureId: adventure.id }); if (rec) appendFileSync(callsFile, `${JSON.stringify(rec)}\n`); } catch (e) { /* the record must never stop a bench */ } }
    tally.refusal += out.refusals || 0;
    for (const f of out.flags) {
      if (f.kind === 'leak') { tally.leak += 1; notes.push(`${label}: leak: ${f.text}`); }
      if (f.kind === 'rule' && !/refused/.test(f.text)) { tally.rule += 1; notes.push(`${label}: rule: ${f.text}`); }
      if (f.kind === 'roll') { tally['roll-words'] += 1; notes.push(`${label}: asked for a roll in words`); }
      if (f.kind === 'style') tally.style += 1;
    }
    for (const c of out.calls) if (c.result && c.result.refused) notes.push(`${label}: refused ${c.name}: ${c.result.refused}`);
    for (const c of out.calls) {
      if (!(c.result && c.result.refused)) stepTools.add(c.name);
      // Counted and named (27 Nov: nine in one X Marks run, and nobody could say which), so the slips that keep
      // coming back can be fixed where they start.
      if (c.result && typeof c.result.note === 'string' && /^Nothing changed/.test(c.result.note)) { tally.nochange += 1; notes.push(`${label}: nothing changed: ${c.name}: ${c.result.note.replace(/^Nothing changed:?\s*/, '').slice(0, 90)}`); }
    }
    void expect;
    // On a player's turn in a fight, the closing question goes to that player.
    const who = actingPc();
    const otherRoll = (s.requests || []).some((q) => !who || q.pcId !== who.id);
    const ownRoll = (s.requests || []).some((q) => who && q.pcId === who.id);
    // A dying character has nothing to choose, and a roll in the air belongs to whoever must make it.
    // A roll asked of the acting player is their prompt: no closing question is needed (bench part 2, run 10).
    if (who && who.playerId && who.hp > 0 && !otherRoll && !ownRoll) {
      const last = out.narration.split(/(?<=[.!?])\s+/).filter((x) => x.includes('?')).pop() || '';
      // The Director calls a player by first name ("Pell, what do you do?"), so either name counts.
      const first = who.name.split(/\s+/)[0];
      if (!new RegExp(`\\b(${[who.name, first].map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`).test(last)) { tally['wrong-seat'] += 1; notes.push(`${label}: closing question not to ${who.name}: "${last.slice(0, 120)}"`); }
    }
    if (verbose) {
      console.log(`  [${label}] ${out.calls.map((c) => `${c.name}${c.result && c.result.refused ? '(refused)' : ''}`).join(', ') || 'narration only'}`);
      showRules();
      console.log(`    DM: ${out.narration.replace(/\s+/g, ' ')}`);
      const bad = out.flags.filter((f) => f.kind !== 'note');
      if (bad.length) console.log(`    flags: ${bad.map((f) => `${f.kind}: ${f.text}`).join(' | ')}`);
      for (const c of out.calls) if (c.result && c.result.refused) console.log(`    refused ${c.name}(${JSON.stringify(c.args || {}).slice(0, 160)}): ${c.result.refused}`);
    }
    void asked;
    return true;
  }
  // What the Engine did by itself (the adventure's rules, fitting a fight), in the transcript.
  let shownRule = 0;
  function showRules() {
    for (const l of s.log || []) if (l.kind === 'rule' && l.seq > shownRule) console.log(`    Engine: ${l.text}`);
    shownRule = Math.max(shownRule, s.seq);
  }
  // Where the game stands before a step, to see afterwards what the step changed.
  const xpNow = () => Object.values(s.pcs).reduce((t, p) => t + (p.xp || 0), 0);
  const snap = () => ({ seq: s.seq, site: s.scene.siteId, xp: xpNow(), asked: s.requests.length, done: s.quests.filter((q) => q.done).length, open: s.quests.filter((q) => !q.done).length,
    foes: Object.values(s.foes).filter((f) => f.siteId === s.scene.siteId && !f.dead).length });
  // What each expected tool is for, checked in the game: any way there counts.
  const OUTCOMES = {
    move_party: { what: 'the party moved on', met: (a) => s.scene.siteId !== a.site },
    start_combat: {
      what: 'a fight started',
      met: (a) => !!s.fight || s.story.some((e) => e.seq > a.seq && /^Battle!/.test(e.text)),
      needs: (a) => a.foes > 0 || Object.values(s.foes).some((f) => f.siteId === s.scene.siteId && !f.dead),
      skip: 'no monsters are here to fight',
    },
    ask_for_roll: { what: 'a roll was asked for', soft: true, met: (a) => stepTools.has('ask_for_roll') || s.requests.length > a.asked || s.rolls.some((r) => r.seq > a.seq && ['check', 'save'].includes(r.kind)) },
    award_xp: { what: 'XP was paid', met: (a) => xpNow() > a.xp },
    seed: { what: 'a story seed came into play', met: (a) => (s.seedLog || []).some((r) => r.fired && r.seq > a.seq) },
    // By now, at any step so far (the Engine's own moments come when they come).
    trouble_seed: { what: 'the Reeve\'s men stepped in (a seed for trouble picked)', met: () => (s.seedLog || []).some((r) => r.fired && /Reeve/.test(r.title)) },
    lost_seed: { what: 'the tinker came by (a seed for a party getting nowhere)', met: () => (s.seedLog || []).some((r) => r.fired && /tinker/.test(r.title)) },
    camp_seed: { what: 'wolves attacked the camp (a seed for a night in the open)', met: () => (s.seedLog || []).some((r) => r.fired && /Wolves/.test(r.title)) },
    rested: { what: 'the party finished its rest after the night attack', met: () => s.story.some((e) => /finishes its rest/.test(e.text)) },
    complete_quest: { what: 'a quest was finished', met: (a) => s.quests.filter((q) => q.done).length > a.done, needs: (a) => a.open > 0, skip: 'no quest is left open' },
  };
  // What the adventure's own rules did by themselves (a milestone paid, a quest finished at a fight's end):
  // a later step that expects it finds it already done, and that counts.
  const RULES = new Map(allRules(adventure).map((r) => [r.key, r]));
  const credits = [];
  let ruleSeen = 0;
  const KIND = { award_xp: 'xp', complete_quest: 'quest' };
  function scanRules() {
    for (const l of s.log || []) {
      if (l.kind !== 'rule' || l.seq <= ruleSeen) continue;
      const r = RULES.get((/\[rule ([^\]]+)\]$/.exec(l.text) || [])[1]);
      if (r && (r.xp || r.level)) credits.push({ kind: 'xp', seq: l.seq, used: false });
      if (r && r.do === 'quest') credits.push({ kind: 'quest', seq: l.seq, used: false });
    }
    ruleSeen = Math.max(ruleSeen, ...(s.log || []).map((l) => l.seq));
  }
  function outcomes(label, expect, a) {
    missedFight = false; missedMove = false;
    scanRules();
    for (const e of expect || []) {
      const o = OUTCOMES[e];
      if (!o) { if (!stepTools.has(e)) { tally.missing += 1; notes.push(`${label}: did not use ${e}`); } continue; }
      const k = KIND[e];
      if (o.needs && !o.needs(a) && !(k && credits.some((c) => c.kind === k && !c.used))) { tally.skipped += 1; if (verbose) console.log(`    (${label}: "${o.what}" not checked: ${o.skip})`); continue; }
      if (o.met(a)) { if (k) for (const c of credits) if (c.kind === k && c.seq > a.seq) c.used = true; continue; }
      const earlier = k && credits.find((c) => c.kind === k && !c.used);
      if (earlier) { earlier.used = true; tally.byRules += 1; if (verbose) console.log(`    (${label}: "${o.what}": already done by the adventure's own rule)`); continue; }
      if (o.soft) { tally.noRoll += 1; notes.push(`${label}: no roll asked (a passive score, or none needed)`); continue; }
      // Stopped on the way by a failed check (the Lantern's fog: fail Survival and wander back to the start, by the
      // adventure's own rule; generated script, 27 Nov): the Director played it right, so it is not a miss.
      if (e === 'move_party' && s.rolls.some((r) => r.seq > a.seq && ['check', 'save'].includes(r.kind) && r.success === false)) {
        tally.skipped += 1; missedMove = true;
        notes.push(`${label}: the party did not move on: a check failed on the way (not counted as a miss)`);
        continue;
      }
      tally.missing += 1;
      notes.push(`${label}: expected outcome missing: ${o.what} (${e})`);
      if (e === 'start_combat') missedFight = true;
      if (e === 'move_party') missedMove = true;
    }
    stepTools = new Set();
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
      if (!missedFight) tally.missing += 1; // counted once: the step before may have counted it already
      if (s.scene.siteId !== where) { notes.push(`fight: the party never reached ${where}, so the bench moves it there`); act('host', null, { type: 'site.move', siteId: where }); }
      if (!Object.values(s.foes).some((f) => f.siteId === s.scene.siteId && !f.dead)) act('host', null, { type: 'foe.add', monster: 'goblin', count: 2 });
      // The monsters surely here; if every group only may turn up, the first group (as the script names it).
      const hid = Object.values(s.foes).filter((f) => f.siteId === s.scene.siteId && f.hidden && !f.dead);
      const sure = hid.filter((f) => !f.maybe);
      const pick = sure.length ? sure : hid.filter((f) => f.group === (hid[0] || {}).group);
      if (pick.length) act('host', null, { type: 'foe.reveal', foeIds: pick.map((f) => f.id) });
      act('host', null, { type: 'fight.start' });
    }
    const turnsBefore = tally.turns;
    const questsBefore = s.quests.filter((q) => q.done).length;
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
            if (verbose) { console.log(`    ${pc.name} attacks ${foe.name}: ${r.success ? `hit, ${r.dmg ? r.dmg.total : 0} damage` : 'miss'}${s.foes[foe.id].dead ? ` (${foe.name} falls)` : ''}`); showRules(); }
          } catch (e) { if (verbose) console.log(`    (${pc.name} could not attack: ${e.message})`); }
        }
        // The last foe falling ends the fight by itself (the Engine's default): the Director then narrates the end.
        if (!s.fight) { await turn('the last enemy has fallen', `after the last foe at ${where}`); break; }
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
    // A quest the Director finished during the fight (the Far North's seed, at the ordeal's end; bench 27 Nov):
    // a later step that expects it finds it already done, and that counts, as with the adventure's own rules.
    const seqNow = Math.max(0, ...(s.log || []).map((l) => l.seq));
    for (let i = questsBefore; i < s.quests.filter((q) => q.done).length; i++) credits.push({ kind: 'quest', seq: seqNow, used: false });
    // Characters downed in the fight are healed so the script can go on. In part 3 (four fights and no
    // inn) the party catches its breath between rooms and is healed to full, as a short rest and a
    // cleric's slots would (bench 21 Nov: they reached Brother Aldane half dead every run).
    for (const p of Object.values(s.pcs)) {
      if (p.dead) continue;
      if ((part === 3 || part === 4 || gen) && p.hp < p.maxHp) act('host', null, { type: 'heal', target: `pc:${p.id}`, amount: p.maxHp - p.hp });
      else if (p.hp <= 0) act('host', null, { type: 'heal', target: `pc:${p.id}`, amount: 5 });
    }
  }

  console.log(`\n=== Run ${n} of ${runs} ===`);
  console.log(`  Party: ${Object.values(s.pcs).map((p) => `${p.name} (${p.clsName || p.cls} ${p.level}, ${p.maxHp} hp, AC ${p.ac})`).join(', ')}`);
  // A bench fault in one run (an Engine refusal of the bench's own move, a bug) is that run's error,
  // and the other runs go on.
  try {
  for (const [k, step] of (gen ? SCRIPT_GEN : part === 6 ? SCRIPT6 : part === 4 ? SCRIPT4 : part === 3 ? SCRIPT3 : part === 2 ? SCRIPT2 : SCRIPT).entries()) {
    // The whole party is dead (bench part 3, 25 Nov: the crypt skeletons killed Bryn after Ila): the adventure
    // is over and the run ends here. A wipe is play, not a fault: reported, not gated.
    if (Object.values(s.pcs).length && Object.values(s.pcs).every((p) => p.dead)) {
      notes.push(`step ${k}: the whole party is dead, so the run ends here`);
      console.log(`  The whole party is dead: run ${n} ends at step ${k}.`);
      break;
    }
    levelUps();
    if (step.fight) { await fight(typeof step.fight === 'string' ? step.fight : 'mill-road'); missedFight = false; continue; }
    if (step.start) { const a = snap(); stepTools = new Set(); await turn('the game begins: open the adventure', 'opening', step.expect); outcomes('opening', step.expect, a); continue; }
    // A line written for a place the Director never took the party to: the bench takes them there, as a
    // player would walk on, and notes it (reported, not gated), so one missed move does not spoil the rest.
    if (step.at && s.scene.siteId !== step.at && !s.fight) {
      if (!missedMove) tally.missing += 1; // counted once: the step before may have counted it already
      notes.push(`step ${k}: the party was at ${s.scene.siteId}, not ${step.at}, so the bench moved it`);
      act('host', null, { type: 'site.move', siteId: step.at });
    }
    const a = snap();
    stepTools = new Set();
    act('player', step.pid, { type: 'say', text: step.say });
    if (verbose) console.log(`  ${pcOf(step.pid).name}: ${step.say}`);
    await turn('a player spoke', `step ${k}`, step.expect);
    // Initiative is rolled by the fight step that follows, so the battle opens with one Director turn.
    if (s.requests.length && !s.fight) await answerRolls(`step ${k}`);
    outcomes(`step ${k}`, step.expect, a);
  }
  } catch (e) {
    tally.error += 1;
    notes.push(`bench error: ${e.message}`);
    console.log(`  BENCH ERROR (run ${n} stops here): ${e.stack || e.message}`);
  }
  const xp = Object.values(s.pcs).map((p) => `${p.name} ${p.xp} XP, ${p.hp}/${p.maxHp} hp`).join('; ');
  console.log(`  End: ${s.scene.siteId}; ${xp}`);
  return { tally, notes, secs: (Date.now() - t0) / 1000, calls: calls.slice(callsAt) };
}

const GATED = ['refusal', 'leak', 'rule', 'roll-words', 'wrong-seat', 'stall', 'error'];
// The adventure file first: what the checker finds (reported, not gated).
{
  const r = checkAdventure(adventure, srd);
  console.log(`Adventure check: ${adventure.name}: ${r.errors.length} error${r.errors.length === 1 ? '' : 's'}, ${r.warnings.length} warning${r.warnings.length === 1 ? '' : 's'}.`);
  for (const x of [...r.errors, ...r.warnings]) console.log(`  - ${x.where}: ${x.text}`);
}
const results = [];
for (let r = 1; r <= runs; r++) results.push(await runOnce(r));
if (crashAt === 'summary') throw new Error('--crash-at summary: a test crash');
console.log('\n=== Summary ===');
console.log(`${gen ? `Generated script (${adventure.name}, ${SCRIPT_GEN.filter((x) => x.say).length} lines)` : `Part ${part}`}${part === 4 ? ` (The Ashen Crown, ${prep.library ? 'with your book library' : 'SRD only'})` : ''}. Model: ${fake ? 'fake stand-in' : `${info.name} · ${model}`}${!fake && info.group === 'local' ? ` · thinking ${thinking}` : ''}`);
results.forEach((x, i) => {
  const t = x.tally;
  const bad = GATED.filter((k) => t[k]);
  console.log(`Run ${i + 1}: ${t.turns} turns in ${Math.round(x.secs / 60)} min ${Math.round(x.secs % 60)} s (${(x.secs / Math.max(1, t.turns)).toFixed(1)} s a Director turn) · ${bad.length ? `FAIL (${bad.map((k) => `${k} ${t[k]}`).join(', ')})` : 'PASS'} · style ${t.style} · expected outcome missing ${t.missing} · no roll asked ${t.noRoll}${t.skipped ? ` · ${t.skipped} not checkable` : ''}${t.byRules ? ` · ${t.byRules} done by the adventure's rules` : ''} · nothing-changed notes ${t.nochange}`);
  for (const nline of x.notes) console.log(`   - ${nline}`);
});
if (calls.length && !fake) {
  console.log('Speed:');
  speedLine(calls, 'all runs');
  const turns = results.reduce((a, x) => a + x.tally.turns, 0);
  console.log(`  ${(calls.length / Math.max(1, turns)).toFixed(1)} model calls per Director turn; ${(calls.reduce((a, c) => a + c.ms, 0) / 1000 / Math.max(1, turns)).toFixed(1)} s of model time per turn.`);
}
// The stand-in never calls a tool, so it cannot move the party, run a fight or finish a quest: its runs
// check the bench and the Engine (no crash, no error, every step played), not the Director's play.
const STAND_IN_GATED = ['error'];
const gated = fake ? STAND_IN_GATED : GATED;
const pass = results.every((x) => gated.every((k) => !x.tally[k]));
if (fake) console.log(pass ? 'GATE: PASS (stand-in: the bench played every step without an error; the Director\'s play is not judged)' : 'GATE: FAIL. The bench or the Engine broke with the stand-in: send this log to Sponge.');
else console.log(pass ? 'GATE: PASS' : 'GATE: FAIL. Send this log to Sponge.');
process.exitCode = pass ? 0 : 1;
