// The Phase 3 test bench: plays a scripted table through the real model and
// counts what went wrong. Run it after saving a key and choosing a model on the
// host console's Director tab. It uses whichever AI is selected there.
//
//   node tools/bench.mjs                 the Toll-Vent script, once
//   node tools/bench.mjs --runs 3
//   node tools/bench.mjs --provider ollama --model <name>     try another one
//   node tools/bench.mjs --sites 2 --players 4                 two sites and four players (Phase 4 rehearsal)
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
const thinking = opt('--thinking', cfg.thinking || 'default'); // default | low | off (local models)
const runs = Number(opt('--runs', 1));
const sites = Number(opt('--sites', 1)); // 2 plays on through the Soft Field: harvest, the Tally Post, and out
const players = Math.min(4, Math.max(2, Number(opt('--players', 2))));
if ((info.key === 'required' && !apiKey) || !model) { console.log(`Set up ${info.name} on the Director tab first: ${info.key === 'required' && !apiKey ? 'save a key' : 'choose a model'} (or pass --model).`); process.exit(1); }
const makeProvider = () => build({ provider, apiKey, baseUrl, model, numCtx, thinking });

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
  ['p2', 'We take the lane onward to the Render Hall.'],
];
const SEATS = [['p1', 'Roly', 'wall', 'Bresk of the Sixth Choir'], ['p2', 'Sam', 'eyes', 'Brost of the Third Current'], ['p3', 'Ana', 'ledger', 'Ilm of the Open Hand'], ['p4', 'Kit', 'rider', 'Vash of the Long Reach']];

async function once(n) {
  let s = newSession(scenario);
  const act = (role, pid, a) => { s = apply(s, a, ctx(role, pid)); };
  for (const [pid, who, hand, name] of SEATS.slice(0, players)) {
    act('player', pid, { type: 'join', name: who });
    act('player', pid, { type: 'claim', organismId: hand, name });
  }
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
  let lastSaid = '';
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
      if (cur && cur.kind === 'cre') { await director('a creature is to act'); continue; }
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
  await director('opening the scene');
  const lines = (sites >= 2 ? SCRIPT.slice(0, -1).concat(SCRIPT2) : SCRIPT).filter(([pid]) => pid === '*' || Number(pid.slice(1)) <= players);
  for (const [pid, text] of lines) {
    if (pid === '*') { if (s.fight) { console.log('\n(the fight is played out)'); await settle(80, 8); } continue; }
    const o = Object.values(s.organisms).find((x) => x.playerId === pid);
    console.log(`\n${o.name.toUpperCase()}: ${text}`);
    lastSaid = text.toLowerCase();
    act('player', pid, { type: 'say', text });
    await director('a player spoke');
    await settle();
  }
  console.log(`\nRun ${n}: ${tally.turns} Director turns, ${(tally.ms / tally.turns / 1000).toFixed(1)} s each on average, ${tally.tokensIn} tokens in, ${tally.tokensOut} out.`);
  console.log(`  Engine refusals (things it tried that the rules or the page do not allow): ${tally.refusals}`);
  console.log(`  Leak flags: ${tally.leaks}`);
  console.log(`  Style flags (questions, length, formatting): ${tally.style}`);
  console.log(`  Ended at: ${scenario.sites.find((x) => x.id === s.scene.siteId).name}; CARCASS ${s.clocks.CARCASS.filled}, TOLL ${s.clocks.TOLL.filled}, HUNGER ${s.clocks.HUNGER.filled}`);
  const g = (x) => ['C', 'G', 'P', 'T'].filter((k) => x && x[k]).map((k) => `${x[k]} ${k}`).join(', ') || 'none';
  for (const o of Object.values(s.organisms).filter((x) => x.playerId)) console.log(`  ${o.name}: MI ${o.mi}/${o.miMax}, Stress ${o.stress}, Codon ${o.codon}, ${o.substrate} S, cut unstamped ${g(o.specimens)}, stamped ${g(o.stamped)}, Bulk ${o.bulk || 0}${o.oath != null ? `, Oath boxes ${o.oath}/${o.oathMax}` : ''}`);
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
