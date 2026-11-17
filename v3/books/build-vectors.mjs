// Writes the v3 Vector books from the kits, so the book a person reads and the notes the AI
// Director is given are always the same words. Run: node v3/books/build-vectors.mjs
import { writeFileSync } from 'node:fs';
import { KITS } from '../director/data/kit/index.js';
import { VECTORS } from '../director/data/vectors.js';
import { rulingsSection } from './rulings-section.mjs';

const out = new URL('./vectors/', import.meta.url);
for (const kit of KITS) {
  const sc = (VECTORS.find((v) => v.id === kit.id) || {}).scenario || null;
  const title = kit.title || (sc && sc.title);
  const siteMeta = (id) => (sc ? sc.sites.find((s) => s.id === id) : kit.sites[id]);
  const L = [];
  L.push(`# ${title} · v3 table edition`, '');
  L.push(`*${kit.levels || 'For two to six new organisms, Level 1'}. ${kit.runnable === false ? 'Book and Director\'s kit ready; not yet in the host\'s Vector list.' : 'Ready to run in the v3 host.'}*`, '');
  L.push('This edition is written to be run as a conversation. Players say what they do in their own words; nothing below is a list of permitted moves. All prices, statistics and procedures are in the original Vector and are unchanged.', '');
  L.push('## The pitch (read this to the players)', '', kit.pitch, '');
  if (kit.rule) L.push('## The one hard rule', '', kit.rule, '');
  L.push('## The Clocks (always on the table)', '');
  if (kit.clocks) for (const c of kit.clocks) L.push(`- **${c.id}** (${c.segments}). ${c.plain} *Who moves it:* ${c.who}`);
  else for (const c of sc.clocks) L.push(`- **${c.name}** (${c.segments}). ${c.says}`);
  L.push('', '## The truth (Director only)', '', ...kit.truths.map((t) => `- ${t}`), '');
  L.push('## Secrets, and three ways to each', '', 'Give a secret away whenever a player looks, asks or pokes in a way that could find it. The leads are suggestions, not the only doors.', '');
  for (const s of kit.secrets) {
    L.push(`**${s.text}**${s.must ? '' : ' *(optional)*'}`);
    for (const l of s.leads) L.push(`- ${siteMeta(l.site).name}: ${l.how}`);
    L.push('');
  }
  L.push('## The sites', '');
  let n = 0;
  for (const [id, k] of Object.entries(kit.sites)) {
    const m = siteMeta(id);
    n += 1;
    L.push(`### ${n} · ${m.name} — ${m.short}`, '');
    L.push(`**Open with:** ${k.start}`, '');
    L.push(`**The question this scene answers:** ${k.question}`, '');
    L.push(`**What is here:** ${m.where}`, '');
    L.push(`**Ways on:** ${m.exits.join('; ')}.`, '');
    L.push(`**Senses:** ${k.senses.join('; ')}.`, '');
    L.push('**People**', '');
    for (const p of k.people) L.push(`- **${p.name}.** Wants ${p.want}. Fears ${p.fear}. *Voice:* ${p.voice}${p.trade ? ` *Offers:* ${p.trade}` : ''}${p.wont ? ` *Never:* ${p.wont}` : ''}`);
    L.push('', '**Things players often try** (anything else: rule it the same way)', '');
    for (const a of k.approaches) L.push(`- *${a.say}.* ${a.ruling}`);
    L.push('', `**When a roll fails, pick a cost:** ${k.costs.join('; ')}.`, '');
    L.push('**Dangers: show the tell before the strike**', '');
    for (const t of k.threats) L.push(`- **${t.what}.** Tell: ${t.tell}. Strike: ${t.strike}.`);
    L.push('', `**If the table stalls:** ${k.leads.join(' / ')}`, '');
    L.push('**A moment for each character:** ' + Object.entries(k.moments).map(([r, t]) => `*${sc ? (sc.hands.find((h) => h.id === r) || {}).hand || r : kit.roles[r]}*: ${t}`).join(' '), '');
    if (sc && m.host) L.push(`**Printed in the original (unchanged):** ${m.host.cite}. Danger: ${m.host.danger} Pays: ${m.host.pays}`, '');
  }
  L.push(...rulingsSection(kit.id));
  L.push('## How it can end, and what comes next', '', ...kit.hooks.map((h) => `- ${h}`), '');
  const base = new Set((KITS[0].glossary || []).map((g) => g.word));
  const own = kit.glossary.filter((g) => kit.id === 'first-carve' || !base.has(g.word));
  L.push(kit.id === 'first-carve' ? '## Words' : '## Words used only here (the common list is in The First Carve)', '', '| Word | In plain words |', '|---|---|', ...own.map((g) => `| ${g.word} | ${g.plain} |`), '');
  const file = `${title.toUpperCase().replace(/[^A-Z]+/g, '-')}-v3.md`;
  writeFileSync(new URL(file, out), L.join('\n'));
  console.log(file, L.join('\n').length);
}
