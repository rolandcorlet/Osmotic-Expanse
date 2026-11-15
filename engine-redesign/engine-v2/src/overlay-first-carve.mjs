// What the Engine needs The First Carve to print as tokens. Each row replaces a cell of first-carve.json that is
// a sentence today (found by validate() on 15 Nov 2026). The Vector's next edition should print these, and this
// file then shrinks to nothing. Until then it keeps the Engine free of prose parsing.
export const OVERLAY = {
  interactables: {
    'toll-vent/swear-toll': { needs: 'oath-box' },
    'toll-vent/force-gate': { onFailure: ['strike-by:fold-sentinel'] },
    'toll-vent/offer-water': { needs: 'water' },
    'soft-field/cut-panel': { needs: 'flag:far-lane-marked' },
    'soft-field/stamp-cut': { needs: 'unstamped' },
    'soft-field/drop-panel': { needs: 'manual:kinetic-hit-4-overflow-on-panel' },
    'soft-field/salt-slough': { needs: 'salt' },
    'soft-field/salt-cache': { onSuccess: ['gain:60 S', 'rewind:CARCASS:1:when-spent'] },
    'render-hall/open-pump': { onFailure: ['hostile:barge-crew'] },
    'render-hall/read-dead': { needs: 'manual:at-still-body-not-rendered' },
    'render-hall/stabilise-osk': { needs: 'manual:osk-dormant-at-contact' },
    'brood/cut-brood': { onSuccess: ['gain-overflow:S:400:100:900'] },
    'gut-stone/slip-past': { onFailure: ['condition:all:Marked'] },
    'gut-stone/convince-guardian': { needs: 'manual:guardian-awake' },
  },
  // Awards whose "on" is a sentence: structured as {on: event-or-interactable, if: [...]}.
  awards: {
    'toll-vent/in-clean': { on: 'arrive:soft-field', if: ['flag:toll-settled', 'not-destroyed:fold-sentinel'] },
    'brood/not-whale': { on: ['smell-brood', 'offer:tell'] },
  },
  // Which set piece a hazard starts when it has fired (afterFiring is null in the Vector today).
  afterHazard: { 'render-charge': 'the-race' },
};

export function applyOverlay(D, overlay = OVERLAY) {
  const used = [];
  for (const [key, patch] of Object.entries(overlay.interactables)) {
    const [sid, iid] = key.split('/');
    const it = D.sites[sid] && D.sites[sid].interactables.find((x) => x.id === iid);
    if (!it) continue;
    Object.assign(it, patch);
    used.push(key);
  }
  for (const [key, patch] of Object.entries(overlay.awards)) {
    const [sid, aid] = key.split('/');
    const aw = D.sites[sid] && D.sites[sid].awards.find((x) => x.id === aid);
    if (aw) { Object.assign(aw, patch); used.push(key); }
  }
  D.afterHazard = overlay.afterHazard;
  D.overlayUsed = used;
  return D;
}
