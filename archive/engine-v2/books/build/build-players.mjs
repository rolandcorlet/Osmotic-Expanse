// Player's Atlas, Engine-ready edition. Sources (read only): the Player's Atlas (creation steps,
// Lineages, the 24 Phenotypes, Adaptations, packs), Core IX (Apparatus, properties, Grafts, Vials)
// and the four Hands as coded in director/data/first-carve.js.
// Where a rule's effect is still a sentence it is kept as `text` and flagged needsRecord: true,
// so the remaining conversion work is countable instead of hidden.
import { out, table, steps, bullets, book, mdTable, slug, num, root } from './lib.mjs';
import { join } from 'node:path';

const atlas = book("The Osmotic Expanse - PLAYER'S ATLAS.md");
const coreBook = book('The Osmotic Expanse - CORE RULEBOOK.md');
const { scenario } = await import(join(root, '..', '..', 'director', 'data', 'first-carve.js'));

// ---- Formulas (Atlas step 7, Core 4.2, 4.8, 5.1, 5.5) --------------------------------------
const formulas = [
  { id: 'miMax', name: 'Max Membrane Integrity', formula: '12 + VSC*4 + Hull + 2*(Level-1) + 6 per Stage past I + graft and Adaptation bonuses', fn: (o) => 12 + o.VSC * 4 + o.hull + 2 * (o.level - 1) + (o.miBonus || 0) },
  { id: 'atpMax', name: 'Max ATP', formula: '8 + RTC*2', fn: (o) => 8 + o.RTC * 2 },
  { id: 'pp', name: 'Pulse Points per turn', formula: '2 + DFF + modifiers', fn: (o) => 2 + o.DFF },
  { id: 'mt', name: 'Membrane Threshold', formula: '10 + DFF + graft, size and condition modifiers', fn: (o) => 10 + o.DFF },
  { id: 'flow', name: 'Flow (Drifts per Drift action)', formula: '3 + DFF', fn: (o) => 3 + o.DFF },
  { id: 'countdown', name: 'Lysis Countdown boxes', formula: 'VSC + ceil(Hull/2) + 2', fn: (o) => o.VSC + Math.ceil(o.hull / 2) + 2 },
  { id: 'oath', name: 'Oath boxes', formula: 'AFF', fn: (o) => o.AFF },
  { id: 'bulk', name: 'Bulk capacity', formula: 'VSC*5 (+1 per Growth)', fn: (o) => o.VSC * 5 },
  { id: 'slots', name: 'Graft Slots', formula: '1 + 1 per Stage past I', fn: () => 1 },
  { id: 'baseline', name: 'Homeostatic Baseline of a pool', formula: 'dice * 3', fn: null },
];

// ---- Actions a player can take, with the pool written as a formula ---------------------------
const actions = [
  { id: 'strike', name: 'Strike', pp: 2, pool: 'by Apparatus class: Weight VSC + Membrane Penetration; Lash DFF + Membrane Penetration; Projector DFF or RTC + Membrane Penetration; Resonator RTC + Catalysis; plus the Apparatus bonus', against: 'target Membrane Threshold', target: 'one body in the weapon\'s band', legal: 'own turn; +1 PP if Heavy' },
  { id: 'drift', name: 'Drift', pp: 1, pool: null, target: 'a band', legal: 'own turn; leaving Contact with a foe there invites a Flank Breach' },
  { id: 'reserve', name: 'Hold a Reserve', pp: 1, pool: null, target: 'self', legal: 'own turn; one held at a time (two with Twin Reserve)' },
  { id: 'vent', name: 'Vent', pp: 1, atp: 2, pool: null, target: 'self', legal: 'own turn' },
  { id: 'sense', name: 'Sense', pp: 1, pool: 'OSM + Chemoreception', against: 'the hidden thing\'s DFF + Concealment, or the site\'s printed Threshold', target: 'the site or one body', legal: 'own turn' },
  { id: 'use-vial', name: 'Use a Vial', pp: 2, pool: null, target: 'self or an ally at Contact', legal: 'own turn (a Synthesise action); free outside a fight' },
  { id: 'stabilise', name: 'Stabilise', pp: 2, pool: 'RTC + Synthesis', against: '12 + target Level', target: 'a Dormant ally at Contact', legal: 'own turn (a Synthesise action)' },
  { id: 'harvest', name: 'Harvest', pp: 2, pool: 'OSM or RTC + Synthesis (+2 dice with a Harvesting tool)', against: 'tier*4 + 8 or the printed number', target: 'a destroyed creature at Contact, or the site where its record allows', legal: 'own turn, or 10 minutes outside a fight (then no roll if pool*3 meets the Threshold)' },
  { id: 'remove-lodged', name: 'Pull a Lodged weapon', pp: 2, pool: null, target: 'self or an ally at Contact', legal: 'own turn (a Synthesise action); deals 4 damage' },
  { id: 'burst', name: 'Burst', pp: '3-5', atp: 'same', pool: 'RTC + Catalysis (or the Burst\'s own)', target: 'by Burst', legal: 'own turn; knows the Burst; not Locked', needsRecord: true },
  { id: 'overdrive', name: 'Overdrive', pp: 0, pool: null, target: 'one of your own rolls', legal: 'before the roll; 4 ATP for +2 dice or 4 MI for +4 dice and 1 Stress; once per roll' },
  { id: 'assist', name: 'Assist', pp: 0, pool: null, target: 'an ally\'s roll', legal: 'same Pathway, in reach; +1 die, at most two helpers' },
  { id: 'swear', name: 'Swear an Oath', pp: 0, pool: null, target: 'who it is owed to', legal: 'a witness the site lists is present; an Oath box is free' },
  { id: 'end-turn', name: 'End turn', pp: 0, pool: null, target: 'self', legal: 'own turn; no roll pending' },
  { id: 'react', name: 'React (Deflect, Inhibit, Brace, Shed, Flank Breach)', pp: 'the held Reserve', pool: null, target: 'the triggering attack or effect', legal: 'holding a Reserve; one reaction per Cycle' },
];

// ---- Apparatus and properties (Core 9.3) ----------------------------------------------------
const apparatus = mdTable(coreBook, /^## 9\.3 Apparatus/).map((r) => {
  const props = r.Properties.split(/,(?![^(]*\))|;/).map((s) => s.trim()).filter(Boolean);
  return {
    id: slug(r.Apparatus), name: r.Apparatus, cls: r.Class, band: r.Band,
    bd: r['BD ladder (T1–T5)'].includes('/') ? r['BD ladder (T1–T5)'].split('/').map(Number) : null,
    bonusDice: num(r.Bonus.replace('−', '-')) || 0, type: r.Type === 'Thermal' ? 'Thermic' : r.Type,
    props: props.map((p) => p.replace(/\s*\(.*\)$/, '')), propNotes: props.filter((p) => /\(/.test(p)), cost: num(r.Cost),
  };
});
// Each property as numbers the Engine applies. `say` is the table word.
const properties = [
  { id: 'Heavy', strikePp: 1, needs: { VSC: 3 }, say: 'slow to swing' },
  { id: 'Two-handed', needs: { VSC: 4 }, say: 'takes both hands' },
  { id: 'Braced', dice: 1, when: 'did not Drift this Cycle', blocks: ['momentum'], say: 'set before the swing' },
  { id: 'Momentum', dice: 1, push: 1, when: 'Momentum applies', say: 'carried by the rush' },
  { id: 'Fluid', usableWhile: ['Sequestered', 'grappled', 'pinned'], say: 'works in a clinch' },
  { id: 'Silent', keeps: ['Masked'], noFlankBreach: true, say: 'makes no sound' },
  { id: 'Serrated', onOverflow: 2, inflicts: 'Brittle', limit: 'once per target per fight', say: 'tears as it leaves' },
  { id: 'Lodged', onHit: { condition: 'Lodged' }, removal: { action: 'synthesise', damage: 4 }, say: 'the blade stays in' },
  { id: 'Spread', targets: 'all in band', dice: -1, say: 'a scatter' },
  { id: 'Spray', targets: 'all in band', dice: -1, say: 'a wash across the band' },
  { id: 'Precision', riderOnOverflow: 6, say: 'finds the seam' },
  { id: 'Corrodes', onHit: { soak: -1, max: -3, until: 'repaired' }, say: 'eats the armour' },
  { id: 'Acidic', onHit: { soak: -1, max: -3, until: 'repaired' }, say: 'eats the armour' },
  { id: 'Conductive', type: 'Voltaic', ignoresSoak: { family: 'Mucoid', amount: 2 }, say: 'carries a charge' },
  { id: 'Reach', bandShift: 1, dice: -1, when: 'used at the further band', say: 'long' },
  { id: 'Amplification', burstEffect: 1, when: 'a Burst of its domain while held', say: 'sings with the reaction' },
  { id: 'Pushing', push: 1, say: 'shoves' },
  { id: 'Sweeping', onRunaway: { targets: 'all in Contact' }, say: 'sweeps wide' },
  { id: 'Harvesting', harvestDice: 2, freeHarvest: 'one per Pulse War', say: 'made for the cut' },
  { id: 'Pull', pull: 1, say: 'drags it in' },
  { id: 'Anchor', cannotBePushed: true, say: 'holds you fast' },
  { id: 'Reload', uses: 3, refill: '1 Vial of spores', say: 'needs feeding' },
  { id: 'Finesse', note: 'The book names it but gives no rule.', needsRuling: true, say: 'light and exact' },
];

// ---- Grafts (Core 9.4) and Vials (Core 9.5) --------------------------------------------------
const grafts = mdTable(coreBook, /^## 9\.4 Grafts/).map((r) => ({
  id: slug(r.Graft), name: r.Graft, family: r.Family, slots: r.Slots === 'free' ? 0 : num(r.Slots),
  soak: num(r.Soak) || 0, dff: /−(\d) DFF/.test(r.Soak) ? -Number(r.Soak.match(/−(\d) DFF/)[1]) : 0, cost: num(r.Cost),
  miBonus: /\+5 max MI/.test(r.Special) ? 5 : 0, text: r.Special, needsRecord: !/^\+5 max MI/.test(r.Special),
}));
const graftFamilies = [
  { id: 'Lipid', strong: { Osmotic: 2, Thermic: 1 }, weak: { Lytic: -2 } },
  { id: 'Fibrous', strong: { Kinetic: 2, Lytic: 1 }, weak: { Thermic: -2 } },
  { id: 'Testate', strong: { Lytic: 2, Kinetic: 1 }, weak: { Osmotic: -2 }, dff: -1 },
  { id: 'Mucoid', strong: { Thermic: 2, Voltaic: 2, Osmotic: 1 }, weak: { Genetic: -2 } },
  { id: 'Somatic', strong: { all: 1 }, weak: { Genetic: -2 }, upkeep: '1 ATP per Cycle or the soak halves' },
];
// Vial effects as fields. Anything not expressible yet keeps needsRecord.
const vialFx = {
  'Glucose Ampule': { atp: 4 },
  'Amino Drip': { heal: 6, stress: 1 },
  'Lipid Patch': { ends: ['Leaking', 'Brittle'], soakVs: { Lytic: 2 }, cycles: 3 },
  'AE Droplet': { burstDice: 2 },
  'Catalyst Charge': { nextStrike: { bd: 2, riderOnOverflow: 4 } },
  'Neutraliser': { ignoreTonic: 'scene' },
  'Stress Flush': { stress: 'clear', mi: -2 },
  'Inhibitor Grenade': { target: 'one foe', nextRollDice: -2, targetStress: 1 },
  'Pheromone Mask': { gains: ['Masked'] },
  'Scent Bomb': { zone: true, inflicts: ['Marked'], thenSelf: ['Marked'] },
  'Turgor Shot': { pp: 1, flow: 4, cycles: 3, after: ['Turgid'] },
  'Sequence Key': { dice: { 'Sequence Reading': 3 } },
  'Substrate Foam': { structureMi: 10 },
  'Coagulant Pack': { stabilise: true, countdown: -1 },
  'Hot Iron Dose': { miFloor: 1, until: 'Reconstitution', noHealing: true },
  'Chitin Hardener': { soak: 2, dff: -1, cycles: 4 },
  'Bloom Spore': { zone: true, alliesRegen: 2, cycles: 3, inflicts: ['Marked'] },
  'Terminal Dropper': { burstEffect: 'x3', stress: 4, damage: { amount: 8, type: 'Lytic' } },
};
const vials = mdTable(coreBook, /^## 9\.5 Vials/).map((r) => ({ id: slug(r.Vial), name: r.Vial, cost: num(r.Cost), effect: vialFx[r.Vial] || null, text: r.Effect, needsRecord: !vialFx[r.Vial] }));

// ---- Lineages and Phenotypes (Atlas 2 and 3) -------------------------------------------------
const lineages = mdTable(atlas, /^# 2 · THE SIX LINEAGES/).map((r) => {
  const b = {};
  for (const m of r.Baselines.matchAll(/([+−])1 ([A-Z]{3})/g)) b[m[2]] = m[1] === '+' ? 1 : -1;
  return { id: slug(r.Lineage), name: r.Lineage, baselines: b, bondedDomain: r['Bonded Domain'], gift: r.Gift.replace(/\*/g, ''), frailty: r.Frailty.replace(/\*/g, ''), needsRecord: true };
});
const phenotypes = [];
{
  const blocks = atlas.split(/^### /m).slice(1);
  for (const b of blocks) {
    const head = b.match(/^\*([^·\n]+)· Hull (\d) · Key: ([^·]+)· Bonded: ([^*]+)\*/m);
    if (!head) continue;
    const name = b.split('\n')[0].trim();
    const paths = {};
    const gp = b.match(/\*\*Granted Pathways:\*\*\s*(.+)/);
    if (gp) for (const m of gp[1].matchAll(/([A-Z][A-Za-z ]+?) (\d)/g)) paths[m[1].trim()] = Number(m[2]);
    const sig = b.match(/\*\*Signature Mechanic — ([^.*]+)\.\*\*\s*([^\n]*)/);
    const stages = [...b.matchAll(/\*\*Stage (I{1,3}|IV) — ([^.*⟂(]+?)\s*(⟂)?\s*(\(capstone\))?\.\*\*\s*([^\n]*)/g)].map((m) => ({ stage: m[1], level: { I: 1, II: 6, III: 11, IV: 16 }[m[1]], name: m[2].trim(), optional: !!m[3], text: m[5], needsRecord: true }));
    const kit = b.match(/\*\*Kit:\*\*\s*([^\n]*)/);
    phenotypes.push({ id: slug(name), name: name.replace(/\b([A-Z])([A-Z]+)/g, (x, a, r) => a + r.toLowerCase()), role: head[1].trim(), hull: Number(head[2]), key: head[3].split(',').map((s) => s.trim()), bondedDomain: head[4].trim(), pathways: paths, signature: sig ? { name: sig[1].trim(), text: sig[2], needsRecord: true } : null, stages, kit: kit ? kit[1] : '' });
  }
}

const adaptations = mdTable(atlas, /^## 4\.2 Adaptations/).map((r) => ({ id: slug(r.Adaptation), name: r.Adaptation, cost: r.Cost, text: r.Effect, needsRecord: true }));
const packs = mdTable(atlas, /^## 5\.1 Starting packs/).map((r) => ({ id: slug(r.Pack), name: r.Pack, contains: r.Contains, for: r.For }));

// ---- States, and the words for a sheet's numbers ----------------------------------------------
const states = [
  { id: 'up', screen: 'every legal action with its cost', may: 'act, react, roll, harvest, speak' },
  { id: 'dormant', screen: 'no actions; the Countdown boxes; "an ally at Contact can stabilise you"', may: 'one short signal; forced saves at Baseline 1' },
  { id: 'lysed', screen: 'the Legacy choice', may: 'nothing' },
  { id: 'absent', screen: 'nothing asked of this seat', may: 'nothing; the organism is not targeted and takes no turn', status: 'proposed' },
];
const playerWords = [
  { field: 'MI', bands: [['over 75%', 'whole'], ['50-75%', 'marked'], ['25-50%', 'torn'], ['under 25%', 'failing'], ['0', 'gone dark']] },
  { field: 'Stress', bands: [['0-2', 'steady'], ['3-4', 'strained'], ['5', 'shaking'], ['6-7', 'coming apart']] },
  { field: 'Pulse Points', bands: [['full', 'fresh'], ['2 or more', 'something left'], ['1', 'one breath'], ['0', 'spent']] },
  { field: 'Countdown', bands: [['none marked', 'holding'], ['half marked', 'thinning'], ['one left', 'at the edge']] },
];

// ---- The four Hands of The First Carve, rebuilt from the formulas -----------------------------
const hands = scenario.hands.map((h) => {
  const o = { ...h.base, hull: h.hull, level: h.level, miBonus: (h.kit || []).some((k) => /Lipid Weave Wrap/.test(k)) ? 5 : 0 };
  const derived = Object.fromEntries(formulas.filter((f) => f.fn).map((f) => [f.id, f.fn(o)]));
  const printed = { miMax: h.mi, atpMax: h.atp, pp: h.pp, mt: h.mt, flow: h.flow, countdown: h.countdown };
  const mismatch = Object.keys(printed).filter((k) => printed[k] !== derived[k]).map((k) => `${k}: printed ${printed[k]}, formula ${derived[k]}`);
  return {
    id: h.id, hand: h.hand, phenotype: h.phenotype, level: h.level, baselines: h.base, hull: h.hull, pathways: h.pathways,
    weapons: h.weapons.map((x) => ({ id: x.id, carried: x.carried !== false })), grafts: o.miBonus ? ['lipid-weave-wrap'] : [],
    substrate: h.substrate, derived, oathBoxesPrinted: h.oath, mismatch,
    oathNote: h.oath == null ? 'The Vector prints no Oath boxes for this Hand; the formula gives AFF.' : null,
  };
});

const data = {
  meta: { title: "The Player's Atlas, Engine-ready edition", version: '0.1 draft, 15 November 2026', sources: ["PLAYER'S ATLAS", 'CORE RULEBOOK ch. IX', 'director/data/first-carve.js (Hands)'] },
  creation: { array: [4, 4, 3, 3, 2], baselineMin: 1, baselineMax: 5, extraPathways: { count: 2, rank: 1 }, pathwayMaxAtCreation: 2, substrate: 40, loan: { amount: 100, interest: '5 S per Beat' } },
  formulas: formulas.map(({ fn, ...f }) => f), actions, apparatus, properties, graftFamilies, grafts, vials, lineages, phenotypes, adaptations, packs, states, playerWords, hands,
};
out('players/players.json', JSON.stringify(data, null, 1));

const todo = {
  'Phenotype Signature Mechanics': phenotypes.filter((p) => p.signature).length,
  'Phenotype Stage features': phenotypes.reduce((a, p) => a + p.stages.length, 0),
  'Lineage Gifts and Frailties': lineages.length * 2,
  Adaptations: adaptations.length,
  'Graft specials': grafts.filter((g) => g.needsRecord).length,
  'Vials without an effect record': vials.filter((v) => v.needsRecord).length,
  'Properties needing a ruling': properties.filter((p) => p.needsRuling).length,
};

const md = `# ${data.meta.title}

Version ${data.meta.version}. The data is in \`players.json\`; this file is the same content for reading. It does not change how the game plays.

What is finished here: creation numbers, every derived-number formula, the action list with pools, all ${apparatus.length} Apparatus and ${properties.length} properties as numbers, ${grafts.length} Grafts and ${vials.length} Vials, the six Lineages and ${phenotypes.length} Phenotypes as headers (Hull, key Baselines, Pathway ranks, Stage names), and the four Hands of The First Carve checked against the formulas.

What is still sentences, counted so the work is visible:

${table(Object.entries(todo).map(([k, v]) => ({ k, v })), [['Still to convert into records', 'k'], ['Count', 'v']])}

## 1. Making an organism: the numbers

- Baselines: place ${data.creation.array.join(', ')} on VSC, DFF, RTC, OSM, AFF, then apply the Lineage's +1 and -1. Range at creation ${data.creation.baselineMin} to ${data.creation.baselineMax}.
- Pathways: the Phenotype's ranks, plus ${data.creation.extraPathways.count} more at rank ${data.creation.extraPathways.rank}; none above ${data.creation.pathwayMaxAtCreation} at creation.
- Purse: ${data.creation.substrate} Substrate. A licence loan is ${data.creation.loan.amount} S at ${data.creation.loan.interest}.

## 2. Derived numbers

The Engine computes these from choices. A sheet never stores a note such as "20, or 25 with the Wrap".

${table(data.formulas, [['Number', 'name'], ['Formula', 'formula']])}

## 3. Actions

${table(actions, [['Action', 'name'], ['PP', 'pp'], ['ATP', 'atp'], ['Pool', 'pool'], ['Against', 'against'], ['Target', 'target'], ['Legal when', 'legal']])}

## 4. States, and what a player's screen shows

${table(states, [['State', (r) => `${r.id}${r.status ? ' *(proposed)*' : ''}`], ['The screen shows', 'screen'], ['May', 'may']])}

## 5. Words for the numbers *(proposed)*

So a Director can describe a player's organism without reading the sheet aloud. A player may always be told their own numbers.

${table(playerWords, [['Field', 'field'], ['Bands', (r) => r.bands.map((b) => `${b[0]}: "${b[1]}"`).join('; ')]])}

## 6. Apparatus (Core 9.3)

${table(apparatus, [['Apparatus', 'name'], ['Class', 'cls'], ['Band', 'band'], ['BD by tier', (r) => (r.bd ? r.bd.join('/') : '')], ['Dice', (r) => (r.bonusDice > 0 ? `+${r.bonusDice}` : r.bonusDice || '')], ['Type', 'type'], ['Properties', 'props'], ['Cost (S)', 'cost']])}

## 7. Properties as numbers

${table(properties, [['Property', 'id'], ['Engine applies', (r) => { const { id, say, note, needsRuling, ...rest } = r; return needsRuling ? `no rule printed: ${note}` : rest; }], ['Say', 'say']])}

## 8. Grafts (Core 9.4)

${table(graftFamilies, [['Family', 'id'], ['Strong against (soak)', 'strong'], ['Weak against', 'weak'], ['Other', (r) => [r.dff ? `DFF ${r.dff}` : '', r.upkeep || ''].filter(Boolean).join('; ')]])}

${table(grafts, [['Graft', 'name'], ['Family', 'family'], ['Slots', 'slots'], ['Soak', 'soak'], ['DFF', (r) => r.dff || ''], ['Cost (S)', 'cost'], ['Special', (r) => `${r.text}${r.needsRecord ? ' *(to convert)*' : ''}`]])}

## 9. Vials (Core 9.5)

${table(vials, [['Vial', 'name'], ['Cost (S)', 'cost'], ['Effect record', (r) => r.effect || '*(to convert)*'], ['Book text', 'text']])}

## 10. Lineages

${table(lineages, [['Lineage', 'name'], ['Baselines', 'baselines'], ['Bonded Domain', 'bondedDomain'], ['Gift', 'gift'], ['Frailty', 'frailty']])}

## 11. The twenty-four Phenotypes

Headers only. Each Signature Mechanic and Stage feature is still the book's paragraph and needs its own record (cost, trigger, target, effect), written the same way as a creature special.

${table(phenotypes, [['Phenotype', 'name'], ['Role', 'role'], ['Hull', 'hull'], ['Key', 'key'], ['Bonded', 'bondedDomain'], ['Pathways', 'pathways'], ['Signature', (r) => (r.signature ? r.signature.name : '')], ['Stage features (I-IV)', (r) => r.stages.map((s) => s.name).join(' / ')]])}

## 12. Adaptations

${table(adaptations, [['Adaptation', 'name'], ['Cost', 'cost'], ['Effect (to convert)', 'text']])}

## 13. Starting packs

${table(packs, [['Pack', 'name'], ['Contains', 'contains'], ['For', 'for']])}

## 14. The four Hands of The First Carve

Rebuilt from Baselines, Hull, Level and kit. "Check" compares the Vector's printed numbers with the formulas.

${table(hands, [['Hand', 'hand'], ['Phenotype', 'phenotype'], ['Baselines', 'baselines'], ['Hull', 'hull'], ['Derived', 'derived'], ['Weapons', (r) => r.weapons.map((w) => `${w.id}${w.carried ? '' : ' (not carried)'}`)], ['Check', (r) => (r.mismatch.length ? r.mismatch : 'matches')], ['Note', 'oathNote']])}

## 15. Questions for Roly

${steps([
  '"Finesse" is on the Needle Dagger but has no rule in Core 9.3. What does it do?',
  'The Vector prints Oath boxes for the Wall only. Do the other three Hands have Oath boxes equal to AFF, as the Atlas formula says?',
  'The Bulk formula (VSC x 5) comes from the Engine\'s code; the Atlas sheet shows Bulk but I did not find the formula stated. Is it right?',
  'An absent player: is the organism simply not there (proposed), or run by the table?',
  'Should the 24 Signature Mechanics be converted next, or only the ones the pregenerated Hands use?',
])}
`;
out('players/PLAYERS-ATLAS-engine-ready.md', md);
console.log('phenotypes', phenotypes.length, 'lineages', lineages.length, 'hands mismatches', hands.map((h) => h.mismatch.length).join(','), 'stages', todo['Phenotype Stage features']);
