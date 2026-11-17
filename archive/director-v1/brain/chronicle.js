// The chronicle: a paragraph for each site the Cohort leaves and each night that ends, written
// from what the table was told, plus the people, places and threads it should remember.
// One model call, outside the Director's turns. Without a model the Engine writes a plain one.

export const CHRONICLE_INSTRUCTIONS = `You keep the chronicle for a tabletop roleplaying game, The Osmotic Expanse. You are given what was said and narrated at the table during one stretch of play.

Write two things.

CHAPTER: one paragraph, at most 120 words, past tense, of what happened: who did what, what was agreed or promised, what was taken, what was left undone. Use the names the table used. Plain words, no rules terms, no dice, no numbers except money and counts the table was told.

CAST: a JSON list of at most 8 entries worth remembering later, each with one short fact. Only things that were actually said. Include: people and factions the Cohort MET or dealt with (a clerk, a rival crew, a guild), places that are not one of the Vector's sites (a particular stall, a hidden chamber), and threads still unresolved (a debt, a promise, a grudge, a secret, a claim, a favour owed). Never include: the players' own organisms; any part of their names (in "Bresk of the Sixth Choir", "Sixth Choir" is part of a name, not a faction); the Vector's sites themselves; game rules or reminders. Use exactly this form:
[{"name": "...", "kind": "person|faction|place|thread", "fact": "..."}]
If there is nothing, write [].

Answer in exactly this shape and nothing else:
CHAPTER:
<the paragraph>
CAST:
<the JSON list>`;

const MAX_LINES = 140;

export function chronicleRequest({ siteName, lines, known = [] }) {
  const said = lines.slice(-MAX_LINES).map((l) => `${l.who}: ${l.text}`).join('\n');
  return `Where: ${siteName}\n${known.length ? `Already in the table's memory (reuse these names): ${known.slice(0, 60).join(', ')}\n` : ''}\nWhat was said and done:\n${said}`;
}

export function parseChronicle(text) {
  const t = String(text || '');
  const m = /CHAPTER:\s*([\s\S]*?)(?:\n\s*CAST:|$)/i.exec(t);
  const chapter = (m ? m[1] : t).trim().replace(/\s+/g, ' ').slice(0, 1200);
  let cast = [];
  const c = /CAST:\s*([\s\S]*)$/i.exec(t);
  if (c) {
    const raw = c[1].trim().replace(/^```(?:json)?|```$/g, '').trim();
    try {
      const list = JSON.parse(raw.slice(raw.indexOf('['), raw.lastIndexOf(']') + 1));
      if (Array.isArray(list)) cast = list.filter((e) => e && e.name).slice(0, 20).map((e) => ({ name: String(e.name), kind: String(e.kind || 'person'), fact: String(e.fact || '') }));
    } catch (e) { /* a chapter without a cast is still a chapter */ }
  }
  return { chapter, cast };
}

// Without a model: the narration's first sentences and what the Engine recorded, in order.
export function plainChapter({ siteName, lines }) {
  const bits = [];
  for (const l of lines) {
    if (l.kind === 'narration') {
      const first = String(l.text).split(/(?<=[.!?])\s/)[0];
      if (first && first.length > 20) bits.push(first);
    } else if (l.kind === 'event' && /swears|keeps the Oath|breaks the Oath|stamped|Codon|Specimens|moves|comes into|is here|destroyed|Dormant/i.test(l.text)) {
      bits.push(l.text);
    }
  }
  const text = bits.slice(-10).join(' ');
  return text ? `At ${siteName}: ${text}`.slice(0, 1200) : '';
}

// What the chronicle may not file: the players' own organisms, the words in their names and
// Hands, and the Vector's sites. Those are known already, and a guess about them (a faction
// invented from a lineage name) would mislead the Director later.
export function filterCast(cast, { organisms = [], sites = [] } = {}) {
  const norm = (x) => String(x || '').toLowerCase().replace(/^(the|a|an) /, '').replace(/[^a-z0-9]+/g, ' ').trim();
  const banned = new Set();
  for (const o of organisms) {
    for (const v of [o.name, o.hand, o.phenotype]) if (v) banned.add(norm(v));
    for (const part of String(o.name || '').split(/ of (?:the )?/i)) if (part.trim().length > 2) banned.add(norm(part));
  }
  const siteNames = new Set(sites.map((x) => norm(x.name)));
  return cast.filter((c) => !banned.has(norm(c.name)) && !(siteNames.has(norm(c.name)))).slice(0, 8);
}
