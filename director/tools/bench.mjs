// The Phase 3 test bench: plays a scripted table through the real model and
// counts what went wrong. Run it after saving a key and choosing a model on the
// host console's Director tab. It uses whichever AI is selected there.
//
//   node tools/bench.mjs                 the Toll-Vent script, once
//   node tools/bench.mjs --runs 3
//   node tools/bench.mjs --provider ollama --model <name>     try another one
//   node tools/bench.mjs --provider custom --url http://localhost:8000/v1 --model <name>
//
// The gate for a model: no Engine refusals, no leak flags, and every reply ends
// on exactly one question. Nothing here touches a saved session.
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { newSession, apply } from '../engine/ledger.js';
import { systemRng } from '../engine/dice.js';
import { scenario } from '../data/first-carve.js';
import { directorTurn } from '../brain/director.js';
import { build, providerInfo, PROVIDERS } from '../brain/providers.js';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const cfgFile = join(here, '..', 'saves', 'director.json');
const cfg = existsSync(cfgFile) ? JSON.parse(readFileSync(cfgFile, 'utf8')) : {};
const provider = opt('--provider', cfg.provider || 'gemini');
if (!PROVIDERS.some((p) => p.id === provider)) { console.log(`Unknown provider "${provider}". Choose one of: ${PROVIDERS.map((p) => p.id).join(', ')}`); process.exit(1); }
const info = providerInfo(provider);
const apiKey = (cfg.keys || {})[provider] || (provider === 'gemini' && cfg.apiKey) || (info.env && process.env[info.env]) || '';
const baseUrl = opt('--url', (cfg.urls || {})[provider] || '');
const model = opt('--model', (cfg.models || {})[provider] || (provider === 'gemini' && cfg.model) || '');
const numCtx = Number(opt('--ctx', cfg.numCtx || 16384));
const runs = Number(opt('--runs', 1));
if ((info.key === 'required' && !apiKey) || !model) { console.log(`Set up ${info.name} on the Director tab first: ${info.key === 'required' && !apiKey ? 'save a key' : 'choose a model'} (or pass --model).`); process.exit(1); }
const makeProvider = () => build({ provider, apiKey, baseUrl, model, numCtx });

const bestiary = JSON.parse(readFileSync(join(here, '..', 'data', 'bestiary.json'), 'utf8'));
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

async function once(n) {
  let s = newSession(scenario);
  const act = (role, pid, a) => { s = apply(s, a, ctx(role, pid)); };
  act('player', 'p1', { type: 'join', name: 'Roly' });
  act('player', 'p1', { type: 'claim', organismId: 'wall', name: 'Bresk of the Sixth Choir' });
  act('player', 'p2', { type: 'join', name: 'Sam' });
  act('player', 'p2', { type: 'claim', organismId: 'eyes', name: 'Brost of the Third Current' });
  const tally = { turns: 0, refusals: 0, leaks: 0, style: 0, tokensIn: 0, tokensOut: 0, ms: 0 };

  async function director(reason) {
    const t0 = Date.now();
    const r = await directorTurn({ state: s, scenario, bestiary, provider: makeProvider(), rng, now: Date.now(), reason });
    s = r.state;
    tally.turns += 1;
    tally.ms += Date.now() - t0;
    tally.refusals += r.refusals;
    tally.tokensIn += r.usage.in;
    tally.tokensOut += r.usage.out;
    for (const c of r.calls) console.log(`    [${c.name}] ${JSON.stringify(c.args)}${c.result && c.result.refused ? `  REFUSED: ${c.result.refused}` : ''}`);
    console.log(`  DIRECTOR: ${r.narration}`);
    for (const f of r.flags) {
      if (f.kind === 'leak') tally.leaks += 1;
      if (f.kind === 'style') tally.style += 1;
      console.log(`    ! ${f.kind}: ${f.text}`);
    }
  }

  // The players' side, played simply: roll what is asked, let attacks fall, strike on their turn.
  async function settle() {
    for (let guard = 0; guard < 12; guard++) {
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
      if (cur && cur.kind === 'cre') { await director('a creature is to act'); continue; }
      if (cur && cur.kind === 'org' && s.fight.cycle <= 3) {
        const o = s.organisms[cur.id];
        const target = Object.values(s.creatures).find((c) => c.siteId === s.scene.siteId && !c.down);
        const w = o.weapons.find((x) => x.carried !== false);
        const cost = 2 + (w.props.includes('Heavy') ? 1 : 0);
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

  console.log(`\n===== Run ${n}: ${info.name} · ${model} =====`);
  await director('opening the scene');
  for (const [pid, text] of SCRIPT) {
    const o = Object.values(s.organisms).find((x) => x.playerId === pid);
    console.log(`\n${o.name.toUpperCase()}: ${text}`);
    act('player', pid, { type: 'say', text });
    await director('a player spoke');
    await settle();
  }
  console.log(`\nRun ${n}: ${tally.turns} Director turns, ${(tally.ms / tally.turns / 1000).toFixed(1)} s each on average, ${tally.tokensIn} tokens in, ${tally.tokensOut} out.`);
  console.log(`  Engine refusals (things it tried that the rules or the page do not allow): ${tally.refusals}`);
  console.log(`  Leak flags: ${tally.leaks}`);
  console.log(`  Style flags (questions, length, formatting): ${tally.style}`);
  console.log(`  Ended at: ${scenario.sites.find((x) => x.id === s.scene.siteId).name}; CARCASS ${s.clocks.CARCASS.filled}, TOLL ${s.clocks.TOLL.filled}, HUNGER ${s.clocks.HUNGER.filled}`);
  return tally;
}

let bad = 0;
for (let i = 1; i <= runs; i++) {
  try {
    const t = await once(i);
    if (t.refusals || t.leaks) bad += 1;
  } catch (e) {
    console.log(`\nRun ${i} stopped: ${e.message}`);
    bad += 1;
  }
}
console.log(bad ? `\nGATE NOT PASSED: ${bad} of ${runs} run(s) had refusals, leaks or errors. Read the transcript above.` : `\nGATE PASSED for ${model}: no refusals and no leaks in ${runs} run(s). Read the transcript for quality.`);
