// The DM's own story idea, written up by the model as a STORY SEED the Director can run.
// A seed is plain text in a fixed layout; checkSeed() makes sure the monsters it names exist in
// the SRD and the place it names is one of the adventure's (or "any").

export const SEED_TEMPLATE = `# Seed: A title for your story
Where: any (or the id of a place in the adventure, such as thornwick)
When: when it comes into play: any (the Director judges), lost after 6 turns, camp in the wild, or the party picks a fight with Someone
Chance: 100% (the Engine rolls it when the moment comes)
Limit: once (or daily, or always)
Hook: One or two sentences: how the party is drawn in.
Truth: What is really going on, which the players must find out.
People:
- Name: who they are; what they want; how they talk
Encounter: goblin x2, wolf x1 (SRD monster ids and counts; "any" to let the Engine choose by level and place; or "none")
Clues:
- Something the party can find, and the check that finds it (Investigation DC 12)
Reward: What it pays (gold, an item, XP).
Ending: How it can end.`;

export const SEED_WRITER = `You turn a Dungeon Master's story idea into a STORY SEED for a Dungeons & Dragons 5e game run by an AI Director. The Director will use the seed at the table, so it must follow this layout exactly and use plain words.

${SEED_TEMPLATE}

Rules:
- Keep every line short and concrete. No rules text, no read-aloud prose.
- Encounter names only monsters from the 5e SRD, by their lower-case id with hyphens (goblin, giant-rat, cult-fanatic, young-green-dragon), with counts, and suits the party's level. Write "none" if the story has no fight.
- DCs: 10 easy, 12 to 13 medium, 15 hard, 20 very hard.
- When: "lost after N turns" for help that finds a party going nowhere (a guide, a messenger, a rumour); "camp in the wild" for something in the night (Chance 15% to 30%, Limit daily); "the party picks a fight with <who>" for defenders who come to someone's aid; "any" when the Director should judge. The Engine sizes the Encounter so it stays a minor meeting.
- Answer with the seed only, starting with "# Seed:".`;

export function seedRequest({ idea, adventure = {}, srd = null }) {
  const places = (adventure.sites || []).map((s) => `${s.id} (${s.name})`).join(', ');
  return `The adventure is "${adventure.name || 'a campaign'}" for levels ${adventure.levels || 'any'}.\nIts places: ${places || 'none'}.\n\nThe DM's idea:\n${idea}\n\nWrite the seed.${srd ? '' : ''}`;
}

export function seedText(reply) {
  const t = String(reply || '').replace(/^```[a-z]*\n?|```$/gm, '').trim();
  const at = t.search(/^#\s*Seed:/m);
  return (at >= 0 ? t.slice(at) : t).trim().slice(0, 8000);
}

export function parseSeed(text) {
  const t = String(text || '');
  const line = (k) => ((new RegExp(`^${k}:\\s*(.*)$`, 'mi').exec(t) || [])[1] || '').trim();
  const title = ((/^#\s*(?:Seed:\s*)?(.+)$/m.exec(t) || [])[1] || '').trim();
  const enc = line('Encounter');
  const monsters = /^(none|any|random|choose)\b/i.test(enc) || !enc ? [] : enc.split(/,/).map((x) => x.trim()).filter(Boolean).map((x) => {
    const m = /^([a-z0-9-]+)(?:\s*[x×]\s*(\d+))?/i.exec(x.toLowerCase()) || [];
    return { id: m[1] || x.toLowerCase(), count: Number(m[2] || 1) };
  });
  return { title, where: line('Where').toLowerCase(), hook: line('Hook'), truth: line('Truth'), reward: line('Reward'), ending: line('Ending'), monsters };
}

export function checkSeed(text, { srd, adventure = {} } = {}) {
  const p = parseSeed(text);
  const problems = [];
  const warnings = [];
  if (!p.title) problems.push('It needs a "# Seed: title" line.');
  if (!p.hook) problems.push('It needs a "Hook:" line.');
  if (!p.truth) warnings.push('It has no "Truth:" line, so the Director will improvise the secret.');
  const ids = new Set(((srd || {}).monsters || []).map((m) => m.id));
  for (const m of p.monsters) if (srd && !ids.has(m.id)) problems.push(`"${m.id}" is not an SRD monster id.`);
  const where = p.where.split(/[\s(]/)[0];
  if (where && where !== 'any' && !(adventure.sites || []).some((s) => s.id === where)) problems.push(`"${where}" is not a place in this adventure (write "any" or one of: ${(adventure.sites || []).map((s) => s.id).join(', ')}).`);
  return { ...p, problems, warnings };
}
