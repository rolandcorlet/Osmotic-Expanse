#!/usr/bin/env node
// The Skeleton bench: a model plays as the AI Director through a script written from the adventure itself,
// with two players, and the table checks what a real table would notice. The D&D Director's bench, for
// every game built on the Skeleton.
//
//   node tools/bench.mjs [--module saltglass] [--adventure <id>] [--places 6] [--runs 1]
//                        [--provider gemini|anthropic|openai|ollama|custom|...] [--model <name>] [--url <address>]
//                        [--log bench.log] [--fake] [--quiet]
//   --fake: a stand-in that never calls a tool (checks the bench and the Engine; the Director's play is not judged).
//   The AI settings come from saves/director.json (the AI tab) unless given here.
//
// What the script says at each place (engine/script.js): the way in, a try at each hazard, a search for its
// clues, a fight with its creatures (players attack on their turns, the Director plays the creatures), and a
// quest finished where it ends. Each step expects an outcome the Engine can see (the party moved, a roll was
// asked, a fight started, a quest was done), however the Director got there; when it is missing the bench
// puts the world right so the next step still makes sense, and notes it.
//
// THE GATE (a model passes when every run has none of these):
//   error   the Director's turn threw, or the model could not be reached
//   rule    the Engine refused a call, or the narration says what the Engine does not have
//   leak    the narration names the machinery or a hidden number
//   stall   a fight round in which the Director did not end the creature's turn, or a fight that never ended
// Reported, not gated: expected outcome missing, no roll asked, style.
// Files beside the log: <log>.status.json (running / finished / crashed, a heartbeat), <log>.exit.txt,
// <log>.calls.jsonl (each Director turn's state and tool calls, for tools/replay.mjs).
import { readFileSync, writeFileSync, appendFileSync, existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadModule } from '../engine/module.js';
import { newSession, apply, currentKey } from '../engine/ledger.js';
import { makeRng } from '../engine/dice.js';
import { directorTurn } from '../brain/director.js';
import { build } from '../brain/providers.js';
import { generateScript } from '../engine/script.js';
import { simulateAdventure } from '../engine/simulate.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : d; };
const flag = (k) => args.includes(k);
const fake = flag('--fake');
const quiet = flag('--quiet');
let cfg = {};
try { cfg = JSON.parse(readFileSync(join(root, 'saves', 'director.json'), 'utf8')); } catch (e) { /* defaults */ }
const provider = opt('--provider', cfg.provider || 'gemini');
const model = opt('--model', cfg.model || '');
const baseUrl = opt('--url', cfg.baseUrl || '');
const runs = Math.max(1, Number(opt('--runs', 1)) || 1);
const logFile = opt('--log', '');
const mod = loadModule(join(root, 'modules'), opt('--module', 'saltglass'));
if (!mod) { console.log(`There is no module "${opt('--module', 'saltglass')}" in modules/.`); process.exit(2); }
const advId = opt('--adventure', (mod.adventures[0] || {}).id);
const adv = mod.ix.adventure[advId];
if (!adv) { console.log(`There is no adventure "${advId}". Adventures: ${mod.adventures.map((a) => a.id).join(', ')}.`); process.exit(2); }
// The party: as many pregenerated characters as the game has, up to three (--heroes to choose).
const HEROES = Math.max(1, Math.min(Number(opt('--heroes', 0)) || Math.min(3, (mod.handbook.pregens || []).length || 2), Math.max(1, (mod.handbook.pregens || []).length)));
// A fight the simulation says wipes this party more often than not is meant to be won another way (ring
// the bell, not fight the Tidewarden): the script does not pick it.
const DEADLY = simulateAdventure({ mod, adventure: adv, heroes: HEROES, runs: 20 }).filter((r) => r.runs && r.wiped / r.runs > 0.5).map((r) => r.site);
const SCRIPT = generateScript(mod, adv, { places: Number(opt('--places', 6)) || 6, heroes: HEROES, avoid: new Set(DEADLY) });

// ---- the log and the files beside it
const paths = logFile ? { log: logFile, status: `${logFile.replace(/\.log$/, '')}.status.json`, exit: `${logFile.replace(/\.log$/, '')}.exit.txt`, calls: `${logFile.replace(/\.log$/, '')}.calls.jsonl` } : null;
if (paths) { writeFileSync(paths.log, ''); writeFileSync(paths.calls, ''); }
const put = (t) => { if (paths) appendFileSync(paths.log, t); };
const say = (t) => { put(`${t}\n`); if (!quiet) console.log(t); };
const status = { state: 'running', module: mod.module.id || opt('--module', 'saltglass'), adventure: adv.id, provider: fake ? 'fake' : provider, model: fake ? '-' : model, runs, log: logFile, pid: process.pid, startedAt: new Date().toISOString(), heartbeatAt: '', progressAt: '' };
const writeStatus = (extra = {}) => { if (paths) { Object.assign(status, extra); writeFileSync(paths.status, JSON.stringify(status, null, 1)); } };
writeStatus();
const beat = setInterval(() => writeStatus({ heartbeatAt: new Date().toISOString() }), 30000);
const finish = (code, state) => { clearInterval(beat); writeStatus({ state, endedAt: new Date().toISOString() }); if (paths) writeFileSync(paths.exit, `${new Date().toISOString()} exit code ${code}\n`); process.exitCode = code; };
process.on('uncaughtException', (e) => { say(`BENCH ERROR ${e.stack || e.message}`); finish(3, 'crashed'); process.exit(3); });

// ---- the stand-in
function fakeProvider() {
  return { start() {
    const said = (t) => ({ text: `The water stirs and the lamps sway. ${(/^- (?:c\d+ )?([^(:]+)/m.exec(t) || [0, 'Diver'])[1].trim()}, what do you do?`, calls: [], usage: { in: Math.round(t.length / 4), out: 20 } });
    let brief = '';
    return { send(t) { if (/^ADVENTURE:/.test(t)) brief = t; return Promise.resolve(said(brief)); }, results() { return Promise.resolve(said(brief)); } };
  } };
}
const makeProvider = () => (fake ? fakeProvider() : build({ provider, apiKey: (cfg.keys || {})[provider] || process.env[`${provider.toUpperCase()}_API_KEY`] || '', baseUrl, model, numCtx: cfg.numCtx || 16384, thinking: cfg.thinking || 'default' }));

// ---- one run
async function runOnce(n) {
  say(`\n=== Run ${n} of ${runs} ===`);
  const rng = makeRng(1000 + n);
  let now = 1000;
  const ctx = (role, pid, extra = {}) => ({ role, pid, rng, now: (now += 1000), mod, ...extra });
  let s = newSession(mod, adv.id);
  const act = (role, pid, a) => { s = apply(s, a, ctx(role, pid)); return s; };
  const tryAct = (role, pid, a) => { try { act(role, pid, a); return true; } catch (e) { return false; } };
  const pids = Array.from({ length: HEROES }, (_, i) => `p${i + 1}`);
  pids.forEach((pid, i) => { act('player', pid, { type: 'join', name: `Player ${i + 1}` }); act('player', pid, { type: 'char.pregen', index: i }); });
  const charOf = (pid) => s.chars[s.players[pid].charId];
  say(`  Party: ${pids.map((p) => charOf(p).name).join(', ')}`);
  const tally = { turns: 0, error: 0, rule: 0, leak: 0, stall: 0, style: 0, missing: 0, noRoll: 0 };
  const notes = [];
  const t0 = Date.now();
  const director = async (label, reason) => {
    tally.turns += 1;
    writeStatus({ progressAt: new Date().toISOString(), at: `run ${n} ${label}` });
    try {
      const before = s;
      const out = await directorTurn({ state: s, mod, provider: makeProvider(), rng, now: (now += 1000), reason });
      s = out.state;
      // For the replay (tools/replay.mjs): the state before the turn and each call with what it got.
      if (paths && out.calls.length) appendFileSync(paths.calls, `${JSON.stringify({ v: 1, module: status.module, adventure: adv.id, run: n, label, state: gzipSync(JSON.stringify(before)).toString('base64'), calls: out.calls.map((c) => ({ name: c.name, args: c.args, was: c.result && c.result.refused ? 'refused' : 'ok' })) })}\n`);
      for (const f of out.flags) {
        if (f.kind === 'note') continue;
        if (tally[f.kind] != null) tally[f.kind] += 1;
        if (f.kind !== 'style') notes.push(`${label}: ${f.kind}: ${f.text}`);
      }
      say(`  [${label}] ${out.calls.map((c) => c.name).join(', ') || 'narration only'}`);
      say(`    Director: ${out.narration}`);
      return out;
    } catch (e) {
      tally.error += 1; notes.push(`${label}: ERROR ${e.message}`);
      say(`  [${label}] ERROR: ${e.message}`);
      return null;
    }
  };
  // Rolls asked of the players: made at once, and the Director told.
  const makeRolls = async (label) => {
    for (let k = 0; k < 3 && s.requests.length; k++) {
      for (const q of [...s.requests]) {
        const pid = Object.keys(s.players).find((p) => s.players[p].charId === q.charId);
        if (pid && tryAct('player', pid, { type: 'roll.make', id: q.id })) say(`    ${s.rolls[s.rolls.length - 1] ? `${s.rolls[s.rolls.length - 1].who} rolls ${s.rolls[s.rolls.length - 1].label}: ${s.rolls[s.rolls.length - 1].success ? 'success' : 'failure'}` : 'a roll'}`);
      }
      await director(`${label} roll`, 'A roll came in. Say what it did.');
    }
  };
  // A fight, played out: players attack on their turns; the Director plays the creatures.
  const fight = async (siteId) => {
    for (let guard = 0; s.fight && guard < 60; guard++) {
      const key = currentKey(s);
      if (!key) break;
      const [kind, id] = key.split(':');
      const before = `${s.fight.round}:${s.fight.turn}`;
      if (kind === 'char') {
        const ch = s.chars[id];
        const pid = Object.keys(s.players).find((p) => s.players[p].charId === id);
        const foe = Object.values(s.creatures).find((k) => k.siteId === siteId && !k.down && !k.hidden);
        if (!foe) { if (!tryAct('host', null, { type: 'fight.end' })) break; await director(`after the last creature at ${siteId}`, 'The last creature is down. Close the fight and describe the moment.'); break; }
        // As a player would: every action the game gives a turn (rules.combat.actionsPerTurn) spent attacking.
        // One attack a turn against creatures with two left the party out-fought (first iq3_s bench, 26 Nov).
        const acts = Math.max(1, Number((mod.rules.combat || {}).actionsPerTurn) || 1);
        let did = 0;
        for (let n = 0; n < acts && s.fight && !ch.down && pid; n++) {
          const f = Object.values(s.creatures).find((k) => k.siteId === siteId && !k.down && !k.hidden);
          if (!f || !tryAct('player', pid, { type: 'attack', charId: id, target: `creature:${f.id}` })) break;
          did += 1;
          say(`    ${s.story[s.story.length - 1].text}`);
        }
        if (did) {
          await director(`R${s.fight ? s.fight.round : '?'} after ${ch.name}`, 'A character acted. Say what happened.');
          await makeRolls(`R${s.fight ? s.fight.round : '?'}`);
        }
        if (s.fight && `${s.fight.round}:${s.fight.turn}` === before) tryAct('host', null, { type: 'fight.next' });
      } else {
        await director(`R${s.fight.round} creature`, 'A creature is up: play its turn, then end_turn.');
        await makeRolls(`R${s.fight ? s.fight.round : '?'} creature`);
        if (s.fight && `${s.fight.round}:${s.fight.turn}` === before) {
          tally.stall += 1; notes.push(`fight: the Director did not end the creature's turn (round ${s.fight.round})`);
          tryAct('host', null, { type: 'fight.next' });
        }
      }
      if (!Object.values(s.chars).some((c) => !c.down)) {
        // The party is beaten. So the rest of the script still tests something, the bench (not the Director)
        // ends the fight and puts everyone back on their feet, and notes it.
        notes.push(`fight at ${siteId}: the party is down (the bench ended the fight and put everyone back on their feet)`);
        tryAct('host', null, { type: 'fight.end', award: false });
        for (const c of Object.values(s.chars)) tryAct('host', null, { type: 'heal', target: c.id, amount: c.healthMax });
        break;
      }
    }
    if (s.fight) { tally.stall += 1; notes.push('fight: still going after 60 turns'); tryAct('host', null, { type: 'fight.end' }); }
  };
  const OUTCOME = {
    move_party: { what: 'the party moved on', snap: () => s.scene.siteId, met: (b) => s.scene.siteId !== b },
    ask_for_roll: { what: 'a roll was asked', snap: () => s.rolls.length + s.requests.length, met: (b) => s.rolls.length + s.requests.length > b, soft: true },
    start_combat: { what: 'a fight started', snap: () => 0, met: () => !!s.fight },
    complete_quest: { what: 'a quest was finished', snap: () => s.quests.filter((q) => q.done).length, met: (b) => s.quests.filter((q) => q.done).length > b },
  };
  await director('opening', 'The game begins. Set the scene and ask the first player what they do.');
  for (const [k, step] of SCRIPT.entries()) {
    if (!step.say) continue;
    const label = `step ${k}`;
    // Where the step is: if the party is somewhere else, the bench moves it (and notes it).
    if (step.at && s.scene.siteId !== step.at && !step.expect.includes('move_party')) {
      notes.push(`${label}: the party was at ${s.scene.siteId}, not ${step.at}, so the bench moved it`);
      tryAct('host', null, { type: 'fight.end' });
      tryAct('host', null, { type: 'site.move', siteId: step.at });
    }
    // A fight the world has already had (the creatures came out earlier and are down): not checkable.
    if (step.expect.includes('start_combat') && !Object.values(s.creatures).some((c) => c.siteId === s.scene.siteId && !c.down)) {
      notes.push(`${label}: not checked: nothing is left standing here to fight`);
      continue;
    }
    // A quest the story already finished (the Choir Master fell and the rite with him, mid-fight): not checkable.
    if (step.quest && (s.quests.find((q) => q.id === step.quest) || {}).done) {
      notes.push(`${label}: not checked: the quest "${step.quest}" was already finished`);
      continue;
    }
    const snaps = Object.fromEntries(step.expect.map((e) => [e, OUTCOME[e].snap()]));
    const seq0 = s.seq;
    act('player', step.pid, { type: 'say', text: step.say });
    say(`  ${charOf(step.pid).name}: ${step.say}`);
    await director(label, `A player spoke: "${step.say}". Answer them.`);
    await makeRolls(label);
    for (const e of step.expect) {
      if (OUTCOME[e].met(snaps[e])) continue;
      if (OUTCOME[e].soft) { tally.noRoll += 1; notes.push(`${label}: no roll asked`); continue; }
      // Stopped on the way by a failed roll (a hazard, a rule): the Director played it right, so not a miss.
      if (e === 'move_party' && s.rolls.some((r) => r.seq > seq0 && r.kind === 'check' && r.success === false)) {
        notes.push(`${label}: the party did not move on: a roll failed on the way (not counted as a miss)`);
        tryAct('host', null, { type: 'site.move', siteId: step.to });
        continue;
      }
      tally.missing += 1; notes.push(`${label}: expected outcome missing: ${OUTCOME[e].what} (${e})`);
      if (e === 'move_party') tryAct('host', null, { type: 'site.move', siteId: step.to });
      if (e === 'start_combat') { tryAct('host', null, { type: 'creature.reveal', ids: Object.values(s.creatures).filter((c) => c.siteId === s.scene.siteId).map((c) => c.id) }); tryAct('host', null, { type: 'fight.start' }); }
    }
    if (s.fight) {
      await fight(s.scene.siteId);
      // As players do after a hard fight: catch their breath before going on (what the Director does about it
      // is its own call: a rest, healing, a clock ticking).
      // Under two thirds, not half (Saltglass, 27 Nov: Sefa at 7 of 12 went on unrested from the eels, and the choir
      // took two divers down in one round of the next fight): as players patch up when anyone is hurt.
      if (Object.values(s.chars).some((c) => c.health < (c.healthMax * 2) / 3)) {
        const pid = pids[0];
        const line = 'We catch our breath and patch each other up before we go on.';
        act('player', pid, { type: 'say', text: line });
        say(`  ${charOf(pid).name}: ${line}`);
        await director('after the fight', `A player spoke: "${line}". Answer them.`);
        await makeRolls('after the fight');
      }
    }
  }
  const secs = (Date.now() - t0) / 1000;
  say(`  End: ${s.scene.siteId}; ${Object.values(s.chars).map((c) => `${c.name} ${c.health}/${c.healthMax}`).join('; ')}; quests done ${s.quests.filter((q) => q.done).length} of ${s.quests.length}`);
  return { tally, notes, secs };
}

const GATED = fake ? ['error'] : ['error', 'rule', 'leak', 'stall'];
say(`# Skeleton bench ${new Date().toISOString()} module=${mod.module.name} adventure=${adv.id} provider=${fake ? 'fake' : provider} model=${fake ? '-' : model} runs=${runs}`);
say(`Script: ${SCRIPT.filter((x) => x.say).length} lines written from "${adv.name}", for ${HEROES} characters.${DEADLY.length ? ` Not fought (the simulation says it wipes the party: meant to be won another way): ${DEADLY.join(', ')}.` : ''}`);
const results = [];
for (let r = 1; r <= runs; r++) results.push(await runOnce(r));
say('\n=== Summary ===');
results.forEach((x, i) => {
  const t = x.tally;
  const bad = GATED.filter((k) => t[k]);
  say(`Run ${i + 1}: ${t.turns} turns in ${Math.round(x.secs / 60)} min ${Math.round(x.secs % 60)} s · ${bad.length ? `FAIL (${bad.map((k) => `${k} ${t[k]}`).join(', ')})` : 'PASS'} · expected outcome missing ${t.missing} · no roll asked ${t.noRoll} · style ${t.style}`);
  for (const line of x.notes.slice(0, 80)) say(`   - ${line}`);
});
const pass = results.every((x) => GATED.every((k) => !x.tally[k]));
say(pass ? `GATE: PASS${fake ? ' (stand-in: the bench played every step without an error; the Director\'s play is not judged)' : ''}` : 'GATE: FAIL.');
finish(pass ? 0 : 1, 'finished');
