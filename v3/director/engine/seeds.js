// Story seeds (Roly, 19 Nov 2026): the host's own story material for ad-lib, in one fixed layout the
// Director reads without guessing. A seed is plain text the host (or the Director, from an idea) writes:
//
//   # Seed: Vey's Crew
//   Fits: The First Carve, any site
//   Tone: a rival who is almost friendly
//   ## People
//   - Captain Ossa Vey (person): runs a rival salvage skiff. Wants the Gut Stone first.
//   ## Places / ## Threads            (the same: "- Name (place|thread|faction): facts")
//   ## Encounter                      (optional, one line: "- 2 drifter-shoal at Mid: why they are here")
//   ## Secrets                        (lines the players learn only in play)
//   ## How it can end                 (lines)
//
// parseSeed reads it and checks it against the Bestiary and the Vector: a creature must be a real block,
// at most three bodies, no tougher than the toughest creature the Vector prints. Prices, rewards and
// damage are never part of a seed (they come only from the page); a line that names one is a warning.

const SECTIONS = { people: 'person', person: 'person', places: 'place', place: 'place', threads: 'thread', thread: 'thread', factions: 'faction', faction: 'faction' };
const BANDS = ['contact', 'near', 'mid', 'far', 'loose'];
const PRICEY = /\b\d+\s*(S|Substrate|Codon|Specimens?)\b|\b(reward|pays?|paid|damage|heals?)\s+\d+|\b\d+\s+(damage|Lytic|Kinetic|Thermal)\b/i;
const lower = (s) => String(s || '').trim().toLowerCase();
const clip = (s, n) => String(s || '').trim().slice(0, n);

export const SEED_TEMPLATE = `# Seed: A title for your story
Fits: ${'{vector}'}, any site
Tone: a few words for the feel

## People
- A name (person): who they are. What they want. What they fear.

## Places
- A name (place): what it looks like, and why it matters.

## Threads
- A name (thread): a debt, a grudge, a promise or a rumour that ties things together.

## Encounter
- 2 drifter-shoal at Mid: why they are here, in the fiction.

## Secrets
- Something true the players can only find out by playing.

## How it can end
- Two or three ways this could go.
`;

export function parseSeed(text, { bestiary = {}, scenario = {} } = {}) {
  const src = String(text || '').replace(/\r/g, '').slice(0, 8000);
  const out = { title: '', fits: { vector: '', site: '' }, tone: '', cards: [], encounter: null, secrets: [], endings: [], problems: [], warnings: [] };
  let sec = '';
  for (const raw of src.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    let m;
    if ((m = line.match(/^#\s*(?:seed\s*:)?\s*(.+)$/i)) && !line.startsWith('##')) { out.title = clip(m[1].replace(/^seed\s*:\s*/i, ''), 80); continue; }
    if ((m = line.match(/^fits\s*:\s*(.+)$/i))) {
      const [v, ...rest] = m[1].split(',').map((x) => x.trim());
      out.fits = { vector: clip(v, 60), site: clip(rest.join(', '), 60) };
      continue;
    }
    if ((m = line.match(/^tone\s*:\s*(.+)$/i))) { out.tone = clip(m[1], 120); continue; }
    if ((m = line.match(/^##\s*(.+)$/))) {
      const h = lower(m[1]).replace(/[^a-z ]/g, '').trim();
      sec = SECTIONS[h] ? h : h.startsWith('encounter') ? 'encounter' : h.startsWith('secret') ? 'secrets' : h.startsWith('how') || h.startsWith('end') ? 'endings' : `?${m[1]}`;
      if (sec.startsWith('?')) out.warnings.push(`"${m[1]}" is not one of the seed's headings (People, Places, Threads, Encounter, Secrets, How it can end): what is under it is ignored.`);
      continue;
    }
    const item = line.replace(/^[-*•]\s*/, '');
    if (!sec || sec.startsWith('?')) continue;
    if (PRICEY.test(item)) out.warnings.push(`This names a price, a reward or damage, which only the page pays: "${clip(item, 70)}". The Director will treat it as talk, not a payment.`);
    if (SECTIONS[sec]) {
      m = item.match(/^(.+?)\s*\((person|place|thread|faction)\)\s*:\s*(.+)$/i) || item.match(/^(.+?)\s*:\s*(.+)$/);
      if (!m) { out.warnings.push(`Write each ${sec.replace(/s$/, '')} as "Name (${SECTIONS[sec]}): facts": "${clip(item, 60)}"`); continue; }
      const name = clip(m[1], 60);
      const kind = m.length === 4 ? lower(m[2]) : SECTIONS[sec];
      const facts = (m.length === 4 ? m[3] : m[2]).split(/(?<=[.!?])\s+/).map((f) => clip(f, 240)).filter(Boolean).slice(0, 8);
      if (out.cards.length < 24) out.cards.push({ name, kind, facts });
    } else if (sec === 'encounter') {
      if (out.encounter) { out.problems.push('A seed brings one encounter. Keep the one that matters most.'); continue; }
      m = item.match(/^(\d+)\s+(.+?)(?:\s+at\s+(contact|near|mid|far|loose))?\s*:\s*(.+)$/i);
      if (!m) { out.problems.push(`Write the encounter as "2 drifter-shoal at Mid: why they are here": "${clip(item, 60)}"`); continue; }
      const count = Number(m[1]);
      const want = lower(m[2]).replace(/^(an?|the)\s+/, '');
      const blocks = Object.values(bestiary);
      const block = bestiary[want] || blocks.find((b) => lower(b.name) === want || lower(b.name) === want.replace(/s$/, '') || lower(b.id) === want.replace(/\s+/g, '-'));
      if (!block) { out.problems.push(`"${m[2]}" is not a creature in the Lytic Bestiary. Use its name or id, for example "drifter-shoal".`); continue; }
      const maxTier = Math.max(1, ...((scenario.sites || []).flatMap((s) => (s.encounter || []).map((e) => (bestiary[e.blockId] || {}).tier || 1))));
      if (namedBlock(block)) out.problems.push(`${block.name} is a named character from a printed Vector, not a creature to invent. Choose a kind of creature.`);
      if ((block.tier || 1) > maxTier) out.problems.push(`${block.name} is Tier ${block.tier}; nothing ${scenario.title || 'this Vector'} prints is above Tier ${maxTier}. Choose something no tougher.`);
      if (count < 1 || count > 3) out.problems.push('An invented encounter is one to three bodies.');
      out.encounter = { blockId: block.id, name: block.name, tier: block.tier || 1, count, band: BANDS.includes(lower(m[3])) ? lower(m[3]) : 'mid', why: clip(m[4], 160) };
    } else if (sec === 'secrets') { if (out.secrets.length < 8) out.secrets.push(clip(item, 240)); }
    else if (sec === 'endings') { if (out.endings.length < 6) out.endings.push(clip(item, 240)); }
  }
  if (!out.title) out.problems.push('Give the seed a title on its first line: "# Seed: A title".');
  if (!out.cards.length) out.problems.push('A seed needs at least one person, place or thread.');
  if (out.fits.vector && !fitsVector(out, scenario)) out.warnings.push(`This seed says it fits "${out.fits.vector}", and the table is playing ${scenario.title || 'another Vector'}: it waits until that Vector is played.`);
  if (out.fits.site && !/^any/i.test(out.fits.site) && !siteOf(out, scenario)) out.warnings.push(`"${out.fits.site}" is not a site in ${scenario.title || 'this Vector'}; the seed is offered at every site.`);
  return out;
}

// A named character from a printed Vector ("Brack Nine-Badges (the Relief)") is not a kind of creature.
export const namedBlock = (b) => /\(/.test(String((b || {}).name || ''));

export function fitsVector(seed, scenario = {}) {
  const v = lower(seed.fits.vector);
  return !v || /^any/.test(v) || v === lower(scenario.title) || v === lower(scenario.id) || lower(scenario.title).replace(/^the /, '') === v.replace(/^the /, '');
}
export function siteOf(seed, scenario = {}) {
  const want = lower(seed.fits.site).replace(/^the /, '');
  if (!want || /^any/.test(want)) return null;
  return (scenario.sites || []).find((s) => [s.id, s.name, s.short].some((n) => n && (lower(n).replace(/^the /, '') === want || lower(n).replace(/^the /, '').startsWith(want)))) || null;
}
// Is this seed in play at this site? On, ad-lib on, the right Vector, and any site or this one.
export function seedHere(seed, state, scenario) {
  if (!seed || !seed.on || state.improv !== 'adlib' || !fitsVector(seed, scenario)) return false;
  const site = siteOf(seed, scenario);
  return !site || site.id === (state.scene || {}).siteId;
}
