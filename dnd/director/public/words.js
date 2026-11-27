// Tap a word (27 Nov, after a player of The Osmotic Expanse found its words hard to follow): the first time a
// game word appears in a piece of the DM's narration it is underlined, and a tap shows it in plain words.
// D&D's words are mostly familiar, so this is help on the screen only: the Director is not checked for them.

export const WORDS = [
  // conditions (the SRD's own words are on the Rules tab; these are the short version)
  ['Blinded', 'You cannot see. You fail checks that need sight, attacks against you have advantage, and yours have disadvantage.'],
  ['Charmed', 'You cannot attack the one who charmed you, and they have an easy time talking you round.'],
  ['Deafened', 'You cannot hear, so you fail checks that need hearing.'],
  ['Frightened', 'Your rolls are worse while you can see what scares you, and you cannot move closer to it.'],
  ['Grappled', 'You are held: your speed is zero until you break free or the grip breaks.'],
  ['Incapacitated', 'You cannot take actions or reactions.'],
  ['Invisible', 'Nobody can see you without magic. Your attacks have advantage, and attacks against you have disadvantage.'],
  ['Paralyzed', 'You cannot move or act. Attacks against you have advantage, and a hit from close by is a critical hit.'],
  ['Petrified', 'Turned to stone: you cannot move, act or notice anything, and you resist most damage.'],
  ['Poisoned', 'You feel sick: your attack rolls and ability checks have disadvantage.'],
  ['Prone', 'Lying on the ground. Getting up costs half your movement; close attacks against you have advantage.'],
  ['Restrained', 'Tied up or stuck: you cannot move, your attacks are worse, and attacks against you are better.'],
  ['Stunned', 'Dazed: you cannot act or move, and attacks against you have advantage.'],
  ['Unconscious', 'Out cold: you drop what you hold and fall prone. A hit from close by is a critical hit.'],
  ['Exhaustion', 'Deep tiredness in levels. Each level makes things harder; a long rest takes one away.'],
  // the rules words that come up at the table
  ['advantage', 'Roll two d20s and use the higher one.'],
  ['disadvantage', 'Roll two d20s and use the lower one.'],
  ['saving throw', 'A roll to resist something bad happening to you, like a trap or a spell.'],
  ['concentration', 'Some spells last only while you keep your focus. Taking damage can break it.'],
  ['Armor Class', 'How hard you are to hit. An attack must reach this number.'],
  ['hit points', 'How much harm you can take. At zero you fall unconscious.'],
  ['initiative', 'A roll at the start of a fight that decides who acts first.'],
  ['bonus action', 'A small extra thing some abilities let you do on your turn, besides your action.'],
  ['opportunity attack', 'A free swing at someone who moves away from you without being careful.'],
  ['short rest', 'An hour\'s break. You can spend Hit Dice to heal.'],
  ['long rest', 'A night\'s sleep. You get your hit points and most of your abilities back.'],
  ['spell slot', 'One use of your magic. Bigger spells need higher slots.'],
  ['Hit Dice', 'Dice you spend on a short rest to heal.'],
  ['inspiration', 'A reward from the DM: spend it to roll with advantage once.'],
].map(([word, plain]) => ({ word, plain }));

const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Each word's first use in the text, longest first ("saving throw" before anything shorter). Any case.
export function termsIn(text) {
  let t = String(text || '');
  const out = [];
  for (const g of [...WORDS].sort((a, b) => b.word.length - a.word.length)) {
    const m = new RegExp(`(?<![\\w-])${escRe(g.word)}s?(?![\\w-])`, 'i').exec(t);
    if (!m) continue;
    out.push({ word: g.word, plain: g.plain, index: m.index, end: m.index + m[0].length });
    t = t.slice(0, m.index) + ' '.repeat(m[0].length) + t.slice(m.index + m[0].length);
  }
  return out.sort((a, b) => a.index - b.index);
}

// The text as HTML with its words underlined (escaped, line breaks kept).
export function glossyHtml(text) {
  const t = String(text || '');
  let out = '';
  let at = 0;
  for (const h of termsIn(t)) {
    out += `${esc(t.slice(at, h.index))}<span class="gw" role="button" tabindex="0" data-gloss="${esc(h.word)}" title="${esc(h.plain)}">${esc(t.slice(h.index, h.end))}</span>`;
    at = h.end;
  }
  return (out + esc(t.slice(at))).replace(/\n/g, '<br>');
}

function pop(el) {
  let box = document.getElementById('gloss');
  if (!el) { if (box) box.hidden = true; return; }
  const g = WORDS.find((x) => x.word === el.dataset.gloss);
  if (!g) return;
  if (!box) { box = document.createElement('div'); box.id = 'gloss'; box.setAttribute('role', 'tooltip'); document.body.appendChild(box); }
  box.innerHTML = `<b>${esc(g.word[0].toUpperCase() + g.word.slice(1))}</b>${esc(g.plain)}`;
  box.hidden = false;
  const r = el.getBoundingClientRect();
  const w = Math.min(300, window.innerWidth - 16);
  box.style.maxWidth = `${w}px`;
  box.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - w - 8))}px`;
  box.style.top = `${r.bottom + 8}px`;
  if (r.bottom + 8 + box.offsetHeight > window.innerHeight - 8) box.style.top = `${Math.max(8, r.top - box.offsetHeight - 8)}px`;
}

// Call once: a tap or Enter on an underlined word opens its popup; a tap elsewhere, Escape or a scroll closes it.
export function initWords() {
  document.addEventListener('click', (e) => { const t = e.target; if (!(t.closest && t.closest('#gloss'))) pop((t.closest && t.closest('.gw')) || null); }, true);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') pop(null);
    else if ((e.key === 'Enter' || e.key === ' ') && e.target.classList && e.target.classList.contains('gw')) { e.preventDefault(); pop(e.target); }
  }, true);
  document.addEventListener('scroll', () => pop(null), true);
}
