// Writes the Core Rulebook v3 and the Lytic Bestiary v3 from the data the Director uses.
import { writeFileSync, readFileSync } from 'node:fs';
import { CORE } from '../director/data/kit/core.js';
import { GLOSSARY } from '../director/data/kit/glossary.js';

const C = [];
C.push('# The Catalytic Engine — Core Rulebook · v3 table edition', '');
C.push('*The rules of The Osmotic Expanse in the v3 format. Every rule and number is from the Core Rulebook and is unchanged; each card cites its section so you can find the full text. What is new is the delivery: what it is in plain words, when you use it, the rule as short steps, how it sounds at the table, and who does the work. The AI Director looks these same cards up during play.*', '');
C.push('*This edition covers what a table needs to play. The Core Rulebook remains the full reference for Bursts and Vials, terrain and tonic in detail, crafting, the full modifier list, social chemistry (registers, the Stakes Ladder, Rites, Bonds), Cohesion, levelling, and death and legacy.*', '');
C.push('## Who does what', '', '| | Does | Never does |', '|---|---|---|', '| **Player** | Says what their character does, in their own words. Rolls. Chooses. | Picks from a list of allowed moves. |', '| **Director** | Listens, rules, describes, plays everyone else, decides which rule applies and how hard it is. | Invents a number. |', '| **Engine** | Every number: dice, damage, costs, turns, Clocks. | Decides what a player may attempt. |', '');
C.push('## Contents', '', ...CORE.map((q, i) => `${i + 1}. ${q.name}`), '');
CORE.forEach((q, i) => {
  C.push(`## ${i + 1} · ${q.name}`, '', `*${q.ch === 'v3' ? 'New in v3' : q.ch}*`, '');
  C.push(`**In plain words.** ${q.plain}`, '', `**You use this when:** ${q.when}`, '', `**Who does the work:** ${q.who}`, '');
  C.push('**The rule**', '', ...q.rule.map((r) => `- ${r}`), '', `**At the table.** ${q.table}`, '');
});
C.push('## Words', '', '| Word | In plain words |', '|---|---|', ...GLOSSARY.map((g) => `| ${g.word} | ${g.plain} |`), '');
writeFileSync(new URL('./CORE-RULEBOOK-v3.md', import.meta.url), C.join('\n'));

const best = JSON.parse(readFileSync(new URL('../director/data/bestiary.json', import.meta.url), 'utf8'));
const ORDERS = {
  'Order I: Lytic Swarms': 'Hunger with a body count. They dissolve things before eating them, so they damage armour, structures and the ground. They are not evil: they are digestion that learned to move. **What they want:** to feed. **Before a fight:** look for grazed, bare patches. **Way out:** give them something else to eat or drink, or spread something across the whole area.',
  'Order II: Protein Sentinels': 'Parts of a building that defend it: a gate, a shrine, a foundry. They hold ground and punish anyone who enters. **What they want:** to keep their post. **Before a fight:** they usually warn or demand first. **Way out:** most will not chase you more than a few Drifts from what they guard. Leave, or satisfy the demand.',
  'Order III: Nutrient Drifters': 'The grazing herds of this world: huge, slow and edible. Almost none of them want to fight. **What they want:** to eat and be left alone. **Before a fight:** they bunch, flare or turn when frightened. **Way out:** back off, do not startle them, do not take what they are guarding.',
  'Order IV: Pathogenic Wraiths': 'Things that fight using your own abilities against you: your reactions, your marks, your face, your friends. **What they want:** a body, usually yours. **Before a fight:** something reads you before it moves. **Way out:** deny them a clear read. Murky water and scent dampeners help. These fights are decided by who still controls their own tricks, not by damage.',
  'Order V: Osmotic Brutes': 'Pressure with an opinion. They win by moving you, not by hurting you: into a hazard, a current, or apart from each other. **What they want:** you somewhere else. **Before a fight:** the water itself shifts. **Way out:** brace, anchor, and stay off anything dangerous. Half of them are then harmless.',
  'Order VI: Immune Sentinels': 'The world\'s police. They recognise, mark, report and call others. **What they want:** to know whether you belong. **Before a fight:** they challenge you. **Way out:** they are the only creatures that stop fighting if you show valid papers or answer honestly. The longer a fight lasts, the better they get.',
  'Order VII: Anomalies': 'Places where the rules of the world have broken, wearing a body. **What they want:** nobody knows. **Before a fight:** something is wrong that should not be possible. **Way out:** the same trick never works twice. Watch what it does this time.',
};
const B = [];
B.push('# The Lytic Bestiary · v3 table edition', '');
B.push(`*${Object.keys(best).length} creatures in the v3 format. Every statistic, trait, special, weakness and harvest line is from the Lytic Bestiary and is unchanged. What is new: each Order opens with what its creatures want and how to avoid a fight, and each creature is laid out the same way, with what it does first and its numbers last. The Lytic Bestiary remains the reference for abiotic entities and hazards, Colonists, Constructs and Relic-Bearers, and the building rules.*`, '');
B.push('## How to read a creature', '', 'Each creature has two halves.', '', '**For running it** (what the Director needs first):', '', '- **In a fight:** how it behaves.', '- **Weak point:** what beats it without a slugging match. Players who find this out should be rewarded for it.', '- **Traits and specials:** what makes it different.', '- **Leaves behind:** what can be cut from the body.', '', '**Its stat block** (the numbers the Engine uses). A stat block is a creature\'s character sheet in one line:', '', '| Part | Means |', '|---|---|', '| Standard, Elite, Swarmling… | How big a threat it is. |', '| T1, T2… | Its tier: roughly what level of Cohort it is meant for. |', '| MT | Membrane Threshold: the number an attack must reach to hit it. |', '| MI | Its health. Swarms have Segments instead. |', '| soak | Armour: taken off every hit. |', '| BD and a type | The damage its attack adds, and what kind (Kinetic, Lytic, Osmotic…). |', '| pool | How many dice it rolls. |', '| PP | Pulse Points: how much it can do each turn. |', '| Flow | How far it moves. |', '', 'The Director never reads these numbers out. Players learn how hurt a creature is from how it looks: unhurt, scratched, hurt, badly hurt.', '');
B.push('## People are not in this book', '', 'A clerk, a foreman or a bystander has no stat block. If a player attacks one, there is no Pulse War: the Director says what it will cost, the player makes one roll, and the world answers (see the Core Rulebook v3 and the README).', '');
const byOrder = {};
for (const c of Object.values(best)) (byOrder[c.order || 'Other'] = byOrder[c.order || 'Other'] || []).push(c);
for (const [order, list] of Object.entries(byOrder)) {
  B.push(`## ${order}`, '', ORDERS[order] || '', '');
  for (const c of list.sort((a, b) => (a.tier - b.tier) || a.name.localeCompare(b.name))) {
    B.push(`### ${c.name}`, '');
    if (c.tactics) B.push(`**In a fight:** ${c.tactics}`, '');
    if (c.weakness) B.push(`**Weak point:** ${c.weakness}`, '');
    if (c.traits) B.push(`**Traits:** ${c.traits}`, '');
    for (const sp of c.special || []) B.push(`**${sp.replace(/^Special\s*[—-]\s*/, 'Special: ').replace(/^([^:]+:[^:]+):/, '$1:**').replace(/\*\*$/, '')}`.replace(/^\*\*(Special: [^*]+)\*\*/, '**$1**'), '');
    if (c.harvest) B.push(`**Leaves behind:** ${c.harvest}`, '');
    B.push(`**Stat block:** ${c.statLine}`, '');
  }
}
writeFileSync(new URL('./LYTIC-BESTIARY-v3.md', import.meta.url), B.join('\n'));
console.log('core', C.join('\n').length, 'bestiary', B.join('\n').length);
