// The v3 rulings for one book, as a section the table editions print (same text as the notes in the
// original books; source: ../director/data/kit/rulings.js).
import { RULINGS } from '../director/data/kit/rulings.js';
export function rulingsSection(book) {
  const list = RULINGS.filter((r) => r.book === book);
  if (!list.length) return [];
  return ['## v3 rulings (November 2026)', '', '*Made while the AI Director was built and played. The original book carries each one as a note at the end of the section named; the AI Director\'s Engine follows them.*', '',
    ...list.map((r) => `- **${r.name}** (${r.section}; ${r.date}). ${r.text}`), ''];
}
