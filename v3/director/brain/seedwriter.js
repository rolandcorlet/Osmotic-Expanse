// Writing a story seed from the host's idea or story (Roly, 19 Nov 2026). The same instructions are
// printed in docs/STORY-SEEDS.md, so a seed can also be written in any chat app and pasted in.

export const SEED_WRITER = `You turn a game host's story idea into a STORY SEED for The Osmotic Expanse, a tabletop roleplaying game played inside a microscopic world of cells, membranes and currents. An AI Director will use the seed at the table, so it must follow this layout exactly and use plain words.

THE LAYOUT (nothing before or after it):

# Seed: <a short title>
Fits: <the Vector's title>, <"any site" or one site's name>
Tone: <a few words>

## People
- <Name> (person): <who they are. What they want. What they fear or hide.>

## Places
- <Name> (place): <what it is like, and why it matters.>

## Threads
- <Name> (thread): <a debt, a grudge, a promise, a rumour or a claim that ties things together.>

## Encounter
- <1 to 3> <creature id> at <Contact, Near, Mid or Far>: <why they are here, in the fiction.>

## Secrets
- <something true the players can only find out by playing.>

## How it can end
- <two or three different ways it could go.>

THE RULES:
1. One line per person, place or thread: "Name (person|place|thread|faction): facts." Two to four short facts each, in full sentences.
2. Two to five people, up to three places and up to three threads. Keep what the host gave you; add only what makes it playable.
3. The Encounter is optional and there is at most one. It uses a creature id from the list you are given, one to three bodies, and never a creature tougher than the list allows. Leave the section out if the story has no fight.
4. Never write a number of Substrate (S), Codon or Specimens, a reward, a price or an amount of damage. Payment comes only from the printed books. A person may want or offer something in words ("a share of the haul", "a way out").
5. Fit the Vector: its tone, its places and its factions. A seed sharpens the printed situation; it never replaces it.
6. Write it so the AI Director can play it straight away: wants, fears and secrets are what make a person playable.`;

export function seedRequest({ idea, scenario = {}, bestiary = {} }) {
  const maxTier = Math.max(1, ...((scenario.sites || []).flatMap((s) => (s.encounter || []).map((e) => (bestiary[e.blockId] || {}).tier || 1))));
  const creatures = Object.values(bestiary).filter((b) => (b.tier || 1) <= maxTier && !/\(/.test(b.name || '')).map((b) => `${b.id} (${b.name}, Tier ${b.tier || 1}${b.cls ? `, ${b.cls}` : ''})`);
  const sites = (scenario.sites || []).map((s) => `${s.name}${s.short ? ` (${s.short})` : ''}`);
  return [
    `THE VECTOR: ${scenario.title || 'this Vector'}.${scenario.pitch ? ` ${scenario.pitch}` : ''}`,
    sites.length ? `ITS SITES: ${sites.join('; ')}.` : '',
    `CREATURES YOU MAY USE (Tier ${maxTier} or less): ${creatures.join('; ')}.`,
    `THE HOST'S IDEA OR STORY:\n${String(idea || '').slice(0, 6000)}`,
    'Write the seed now, in the layout, and nothing else.',
  ].filter(Boolean).join('\n\n');
}

// What the model sent, trimmed to the seed itself (it may wrap it in a code fence or add a line).
export function seedText(reply) {
  let t = String(reply || '').replace(/\r/g, '');
  const fence = t.match(/```[a-z]*\n([\s\S]*?)```/i);
  if (fence) t = fence[1];
  const at = t.search(/^#\s*Seed/im);
  return (at >= 0 ? t.slice(at) : t).trim();
}
