// A small local model now and then slips a word from another script into English narration ("carves a弧
// through frozen air": iq3_s, Far North bench, 27 Nov). In text that is plainly English, such runs are
// dropped, with an article left hanging before one ("carves through frozen air"). Text that is mostly in
// another script (a game played in Japanese, say) is left as it is.
const FOREIGN = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Cyrillic}\p{Script=Arabic}\p{Script=Hebrew}\p{Script=Thai}\p{Script=Devanagari}]+/gu;

export function dropForeign(text) {
  const t = String(text == null ? '' : text);
  const foreign = (t.match(FOREIGN) || []).join('').length;
  if (!foreign) return t;
  const latin = (t.match(/\p{Script=Latin}/gu) || []).length;
  if (latin < foreign * 4) return t;
  return t
    .replace(new RegExp(`\\b(?:an?|the)\\s*(?:${FOREIGN.source})`, 'giu'), '')
    .replace(FOREIGN, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/([—–]) \1/g, '$1')
    .replace(/ +([,.;:!?])/g, '$1')
    .trim();
}
