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
//
// Prefer --log to `> file.log`: PowerShell's redirect writes UTF-16LE and mangles the transcript.
//
// The script: the opening at the Ford Inn, talking to the Reeve, an Insight check, the road north,
// a Perception check at the mill, the goblin fight to the end, and searching the bodies.
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

// ---- one run ---------------------------------------------------------------------------------
async function runOnce(n) {
  const tally = { turns: 0, refusal: 0, leak: 0, rule: 0, 'roll-words': 0, 'wrong-seat': 0, stall: 0, error: 0, style: 0, missing: 0 };
  const notes = [];
  let s = newSession(adventure);
  const act = (role, pid, a) => { s = apply(s, a, ctx(role, pid)); };
  for (const [pid, name, input] of HEROES) { act('player', pid, { type: 'join', name }); act('player', pid, { type: 'pc.create', input }); }
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
    if (who && who.playerId) {
      const last = out.narration.split(/(?<=[.!?])\s+/).filter((x) => x.includes('?')).pop() || '';
      if (!new RegExp(`\\b${who.name}\\b`).test(last)) { tally['wrong-seat'] += 1; notes.push(`${label}: closing question not to ${who.name}: "${last.slice(0, 120)}"`); }
    }
    if (verbose) {
      console.log(`  [${label}] ${out.calls.map((c) => `${c.name}${c.result && c.result.refused ? '(refused)' : ''}`).join(', ') || 'narration only'}`);
      console.log(`    DM: ${out.narration.replace(/\s+/g, ' ')}`);
      const bad = out.flags.filter((f) => f.kind !== 'note');
      if (bad.length) console.log(`    flags: ${bad.map((f) => `${f.kind}: ${f.text}`).join(' | ')}`);
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
  async function fight() {
    if (!s.fight) {
      notes.push('fight: no fight was started, so the bench starts one');
      tally.missing += 1;
      if (s.scene.siteId !== 'mill-road') { notes.push('fight: the party never reached the Mill Road, so the bench moves it there'); act('host', null, { type: 'site.move', siteId: 'mill-road' }); }
      if (!Object.values(s.foes).some((f) => f.siteId === s.scene.siteId && !f.dead)) act('host', null, { type: 'foe.add', monster: 'goblin', count: 3 });
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
        if (foe && pc.hp > 0) {
          act('player', pid, { type: 'say', text: `I attack ${foe.name}!` });
          const atk = pc.cls === 'cleric' ? 'w:mace' : pc.attacks[0].id;
          act('player', pid, { type: 'attack', pcId: pc.id, attack: pc.attacks.some((a) => a.id === atk) ? atk : pc.attacks[0].id, target: `foe:${foe.id}` });
          const r = s.rolls[s.rolls.length - 1];
          if (verbose) console.log(`    ${pc.name} attacks ${foe.name}: ${r.success ? `hit, ${r.dmg ? r.dmg.total : 0} damage` : 'miss'}${s.foes[foe.id].dead ? ` (${foe.name} falls)` : ''}`);
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
        await turn('the last enemy has fallen', 'after the last goblin');
        if (s.fight) { tally.stall += 1; notes.push('fight: every goblin is down but the Director did not end the fight'); act('host', null, { type: 'fight.end' }); }
        break;
      }
      if (after === before && !actingPc()) { tally.stall += 1; notes.push(`fight: the Director did not end the monster's turn (round ${s.fight.round})`); act('host', null, { type: 'fight.next' }); }
    }
    if (s.fight) { tally.stall += 1; notes.push('fight: still going after 40 steps'); act('host', null, { type: 'fight.end' }); }
    // Characters downed by the goblins are healed so the script can go on.
    for (const p of Object.values(s.pcs)) if (p.hp <= 0 && !p.dead) act('host', null, { type: 'heal', target: `pc:${p.id}`, amount: 5 });
  }

  console.log(`\n=== Run ${n} of ${runs} ===`);
  for (const [k, step] of SCRIPT.entries()) {
    if (step.fight) { await fight(); continue; }
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
  return { tally, notes };
}

const GATED = ['refusal', 'leak', 'rule', 'roll-words', 'wrong-seat', 'stall', 'error'];
const results = [];
for (let r = 1; r <= runs; r++) results.push(await runOnce(r));
console.log('\n=== Summary ===');
console.log(`Model: ${fake ? 'fake stand-in' : `${info.name} · ${model}`}${!fake && info.group === 'local' ? ` · thinking ${thinking}` : ''}`);
results.forEach((x, i) => {
  const t = x.tally;
  const bad = GATED.filter((k) => t[k]);
  console.log(`Run ${i + 1}: ${t.turns} turns · ${bad.length ? `FAIL (${bad.map((k) => `${k} ${t[k]}`).join(', ')})` : 'PASS'} · style ${t.style} · expected tool missing ${t.missing}`);
  for (const nline of x.notes) console.log(`   - ${nline}`);
});
if (calls.length) {
  const ms = calls.reduce((a, c) => a + c.ms, 0);
  console.log(`Model calls: ${calls.length}, ${(ms / calls.length / 1000).toFixed(1)} s each on average, ${Math.round(calls.reduce((a, c) => a + c.in, 0) / calls.length)} tokens in and ${Math.round(calls.reduce((a, c) => a + c.out, 0) / calls.length)} out per call.`);
}
const pass = results.every((x) => GATED.every((k) => !x.tally[k]));
console.log(pass ? 'GATE: PASS' : 'GATE: FAIL. Send this log to Sponge.');
process.exitCode = pass ? 0 : 1;
