// The chronicle: a paragraph for each site the Cohort leaves and each night that ends, written
// from what the table was told, plus the people, places and threads it should remember.
// One model call, outside the Director's turns. Without a model the Engine writes a plain one.

export const CHRONICLE_INSTRUCTIONS = `You keep the chronicle for a tabletop roleplaying game, The Osmotic Expanse. You are given what was said and narrated at the table during one stretch of play.

Write two things.

CHAPTER: one paragraph, at most 120 words, past tense, of what happened: who did what, what was agreed or promised, what was taken, what was left undone. Use the names the table used. Plain words, no rules terms, no dice, no numbers except money and counts the table was told.

CAST: a JSON list of the people, factions, places and unresolved threads the table met or named, each with one short fact worth remembering later. Only things that were actually said. Use exactly this form:
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
