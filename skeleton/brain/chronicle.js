// The chronicle: a paragraph for each place the party leaves and each session that ends, written
// from what the table was told. One model call, outside the Director's turns. Without a model the
// Engine writes a plain one. (From the D&D Director, 27 Nov 2026, for every Skeleton game.)

export const CHRONICLE_INSTRUCTIONS = `You keep the chronicle for a tabletop roleplaying game. You are given what was said and narrated at the table during one stretch of play.

Write one paragraph, at most 120 words, past tense, of what happened: who did what, who they met, what was agreed or promised, what was found or taken, and what was left undone. Use the names the table used. Plain words: no dice, no numbers, no rules terms. Record only what was stated: if someone was left in danger, they stay in danger; never say anyone died or was saved unless the narration said so.

Answer in exactly this shape and nothing else:
CHAPTER:
<the paragraph>`;

const MAX_LINES = 140;

export function chronicleRequest({ siteName, lines }) {
  const said = lines.slice(-MAX_LINES).map((l) => `${l.who}: ${l.text}`).join('\n');
  return `Where: ${siteName}\n\nWhat was said and done:\n${said}`;
}

export function parseChronicle(text) {
  const t = String(text || '');
  const m = /CHAPTER:\s*([\s\S]*)$/i.exec(t);
  return { chapter: (m ? m[1] : t).trim().replace(/\s+/g, ' ').slice(0, 1200), cast: [] };
}

export function plainChapter({ siteName, lines }) {
  const bits = [];
  for (const l of lines) {
    if (l.kind === 'narration') {
      const first = String(l.text).split(/(?<=[.!?])\s/)[0];
      if (first && first.length > 20) bits.push(first);
    } else if (l.kind === 'event' && /joins|is down|falls|quest|gets|finds|arrives|flees|is revealed|done/i.test(l.text)) bits.push(l.text);
  }
  const text = bits.slice(-10).join(' ');
  return text ? `At ${siteName}: ${text}`.slice(0, 1200) : '';
}
