// The maps: where everyone stands, for every Skeleton game (from the D&D Director's engine/map.js, 27 Nov
// 2026). Shared by the Engine (server side) and the screens, so the squares a screen lights up as reachable
// are the squares the Engine will allow. Distances here are counted in SQUARES: how big a square is, how far
// a character moves, reaches and shoots, and what cover is worth are the game's own (mapRules below).
//
// - A place (an adventure "site") is split into ZONES, each about six squares across. The AI Director thinks
//   in zones ("the wall walk"), never in coordinates.
// - Inside a zone is a BATTLE GRID of squares (the game says how big): 6 by 6 unless a battle map says otherwise.
//   Players move their own token square by square; walls from an imported map stop them.
// - The TRAVEL MAP joins the places by their exits.
//
// A place may also carry a SITE MAP: one picture with a grid (a Universal VTT file from Dungeondraft,
// Dungeon Alchemist and the like, or any image with its squares counted). Its zones are rectangles on the
// picture, and each zone's battle grid is its own piece of the picture.

export const CELL_FT = 1; // distances are in squares (the D&D Director's were in feet)
export const ZONE_CELLS = 6;
export const MAX_ZONES = 16;
export const MAX_CELLS = 40;
export const MAX_WALLS = 2000;

// The game's own map rules (rules.json "map"), with defaults for a game that gives none:
//   square: what one square is ("5 ft", "2 m"); move: squares per move; reach: melee distance in squares;
//   range: a ranged attack's distance in squares; cover: what half and full cover add to defence.
export function mapRules(mod) {
  const r = (mod && mod.rules && mod.rules.map) || {};
  const n = (v, d) => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : d);
  // stuck: the game's own conditions that stop a creature moving (Saltglass's Snared: "you cannot move").
  const stuck = ((mod && mod.rules && mod.rules.conditions) || []).filter((c) => c && c.id && /\b(cannot|can't|can not|unable to) move\b|\bno moving\b|\bspeed (is |becomes )?0\b/i.test(`${c.effect || ''} ${c.about || ''} ${c.text || ''}`)).map((c) => String(c.id).toLowerCase());
  return { square: String(r.square || '5 ft'), move: n(r.move, 6), reach: Math.max(1, n(r.reach, 1)), range: n(r.range, 10), cover: { half: n((r.cover || {}).half, 2), full: n((r.cover || {}).full, 5) }, stuck };
}

// What a zone can be marked as. The Director reads them in its briefing; the screens show them as chips.
export const TAGS = {
  'half-cover': 'half cover (adds to defence)',
  'three-quarters-cover': 'full cover (adds more to defence)',
  'high-ground': 'high ground',
  difficult: 'difficult terrain (moving costs double)',
  dark: 'darkness',
  dim: 'dim light',
  water: 'water',
  hazard: 'hazard',
  narrow: 'narrow (single file)',
};
export const TAG_SHORT = { 'half-cover': 'cover', 'three-quarters-cover': '¾ cover', 'high-ground': 'high', difficult: 'rough', dark: 'dark', dim: 'dim', water: 'water', hazard: 'hazard', narrow: 'narrow' };

// Conditions that stop a creature moving or acting, by the words games use for them (a game's own
// conditions are matched by name, lower case).
export const NO_MOVE_CONDS = ['grappled', 'restrained', 'paralyzed', 'paralysed', 'petrified', 'stunned', 'unconscious', 'held', 'pinned', 'down'];
const NO_MOVE = NO_MOVE_CONDS;
const CANT_REACT = ['incapacitated', 'paralyzed', 'paralysed', 'petrified', 'stunned', 'unconscious', 'down'];
const low = (list) => (list || []).map((c) => String(c).toLowerCase());

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const num = (v, d) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
const r2 = (v) => Math.round(v * 100) / 100;
const str = (v, n = 60) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n);
export const slug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30);

export function newMap() {
  // show.reach: the reach and range rules (off: the map follows the story; on: distance decides).
  return { show: { travel: true, zones: true, grid: true, reach: false }, travel: null, pos: {}, zones: {}, sites: {}, grids: {}, at: {} };
}

// ---- zones -------------------------------------------------------------------------------------
// A place with no zones of its own gets three: the side the party comes in by, the middle, the far side.
export function autoZones() {
  return normZones([
    { id: 'near', name: 'Near side', entry: true },
    { id: 'middle', name: 'Middle' },
    { id: 'far', name: 'Far side' },
  ]);
}

// Boxes for zones that do not say where they are: a row of three, or a grid for more.
function autoRect(i, n) {
  const across = n <= 3 ? n : n <= 4 ? 2 : n <= 6 ? 3 : n <= 9 ? 3 : 4;
  const down = Math.ceil(n / across);
  const gx = 0.04; const gy = 0.06;
  const w = (1 - gx * (across + 1)) / across;
  const h = Math.min(0.62, (1 - gy * (down + 1)) / down);
  const top = (1 - (h * down + gy * (down - 1))) / 2;
  const col = i % across; const row = Math.floor(i / across);
  return { x: r2(gx + col * (w + gx)), y: r2(top + row * (h + gy)), w: r2(w), h: r2(h) };
}

// Zones as written in an adventure, or edited by the DM, made safe and complete: unique ids, a box on
// the zone map, links both ways (a chain if none are given), known tags only.
export function normZones(list) {
  const src = (Array.isArray(list) ? list : []).filter((z) => z && (z.name || z.id)).slice(0, MAX_ZONES);
  const out = [];
  const ids = new Set();
  src.forEach((z, i) => {
    let id = slug(z.id || z.name) || `zone-${i + 1}`;
    for (let n = 2; ids.has(id); n++) id = `${slug(z.id || z.name) || 'zone'}-${n}`;
    ids.add(id);
    const box = autoRect(i, src.length);
    const has = ['x', 'y', 'w', 'h'].every((k) => Number.isFinite(Number(z[k])));
    const w = has ? clamp(num(z.w, box.w), 0.03, 1) : box.w;
    const h = has ? clamp(num(z.h, box.h), 0.03, 1) : box.h;
    out.push({
      id, name: str(z.name || id, 40),
      x: has ? clamp(num(z.x, box.x), 0, 1 - w) : box.x, y: has ? clamp(num(z.y, box.y), 0, 1 - h) : box.y, w, h,
      links: Array.isArray(z.links) ? z.links.map((l) => slug(l)) : null,
      tags: (Array.isArray(z.tags) ? z.tags : []).map((t) => String(t)).filter((t) => TAGS[t]).slice(0, 6),
      cols: clamp(Math.round(num(z.cols, ZONE_CELLS)), 2, MAX_CELLS), rows: clamp(Math.round(num(z.rows, ZONE_CELLS)), 2, MAX_CELLS),
      entry: !!z.entry, note: str(z.note, 300),
      // Arriving from these places, the party comes in here (an adventure's "from": ['mill-road']).
      from: (Array.isArray(z.from) ? z.from : z.from ? [z.from] : []).map((x) => str(x, 40)).filter(Boolean).slice(0, 8),
    });
  });
  const known = new Set(out.map((z) => z.id));
  // Links written by name or id; then made both ways. With none written anywhere, the zones form a chain.
  const anyLinks = out.some((z) => z.links && z.links.length);
  for (const z of out) {
    const fromName = (l) => (known.has(l) ? l : (out.find((y) => slug(y.name) === l) || {}).id);
    z.links = anyLinks ? [...new Set((z.links || []).map(fromName).filter((l) => l && l !== z.id))] : [];
  }
  if (!anyLinks) for (let i = 0; i + 1 < out.length; i++) { out[i].links.push(out[i + 1].id); out[i + 1].links.push(out[i].id); }
  for (const z of out) for (const l of z.links) { const o = out.find((y) => y.id === l); if (o && !o.links.includes(z.id)) o.links.push(z.id); }
  if (out.length && !out.some((z) => z.entry)) out[0].entry = true;
  return out;
}
export const zoneOf = (zones, id) => (zones || []).find((z) => z.id === id) || null;
export function findZone(zones, ref) {
  const k = String(ref || '').trim().toLowerCase();
  if (!k) return null;
  const s = slug(k);
  return (zones || []).find((z) => z.id === k || z.id === s) || (zones || []).find((z) => z.name.toLowerCase() === k)
    || (zones || []).find((z) => slug(z.name).includes(s) || s.includes(slug(z.name))) || null;
}
export const entryZone = (zones) => (zones || []).find((z) => z.entry) || (zones || [])[0] || null;

// The shortest chain of zones from one to another, by their links.
export function zonePath(zones, from, to) {
  if (from === to) return [from];
  const prev = { [from]: null };
  const q = [from];
  while (q.length) {
    const id = q.shift();
    for (const n of (zoneOf(zones, id) || {}).links || []) {
      if (n in prev) continue;
      prev[n] = id;
      if (n === to) { const path = [to]; let c = id; while (c) { path.unshift(c); c = prev[c]; } return path; }
      q.push(n);
    }
  }
  return null;
}

// Which side of zone a faces zone b, from where their boxes sit on the zone map.
export function sideToward(a, b) {
  const dx = (b.x + b.w / 2) - (a.x + a.w / 2);
  const dy = (b.y + b.h / 2) - (a.y + a.h / 2);
  if (Math.abs(dx) * 0.9 >= Math.abs(dy)) return dx >= 0 ? 'right' : 'left';
  return dy >= 0 ? 'bottom' : 'top';
}
export const OPPOSITE = { left: 'right', right: 'left', top: 'bottom', bottom: 'top' };

// ---- the battle grid of a zone ---------------------------------------------------------------------
// Walls and doors are segments [x1, y1, x2, y2] in squares, the zone's top-left corner at 0,0.
export function gridOf(m, siteId, zone) {
  if (!zone) return { cols: ZONE_CELLS, rows: ZONE_CELLS, walls: [], doors: [], img: null };
  const sm = m && m.sites && m.sites[siteId];
  if (sm && sm.cols && sm.rows) {
    const x0 = clamp(Math.round(zone.x * sm.cols), 0, sm.cols - 1);
    const y0 = clamp(Math.round(zone.y * sm.rows), 0, sm.rows - 1);
    const cols = clamp(Math.round((zone.x + zone.w) * sm.cols) - x0, 1, MAX_CELLS);
    const rows = clamp(Math.round((zone.y + zone.h) * sm.rows) - y0, 1, MAX_CELLS);
    return {
      cols, rows, walls: cropSegs(sm.walls, x0, y0, cols, rows), doors: cropSegs(sm.doors, x0, y0, cols, rows),
      img: sm.url ? { url: sm.url, w: sm.w, h: sm.h, cols: sm.cols, rows: sm.rows, x0, y0 } : null, fromSite: true,
    };
  }
  const g = m && m.grids && m.grids[`${siteId}/${zone.id}`];
  if (g && g.cols && g.rows) return { cols: g.cols, rows: g.rows, walls: g.walls || [], doors: g.doors || [], img: g.url ? { url: g.url, w: g.w, h: g.h, cols: g.cols, rows: g.rows, x0: 0, y0: 0 } : null };
  return { cols: zone.cols || ZONE_CELLS, rows: zone.rows || ZONE_CELLS, walls: [], doors: [], img: null };
}

// Segments clipped to a rectangle of squares and moved so its corner is 0,0 (Liang-Barsky).
export function cropSegs(segs, x0, y0, cols, rows) {
  const out = [];
  for (const s of segs || []) {
    let [ax, ay, bx, by] = s;
    const dx = bx - ax; const dy = by - ay;
    let t0 = 0; let t1 = 1; let ok = true;
    for (const [p, q] of [[-dx, ax - x0], [dx, x0 + cols - ax], [-dy, ay - y0], [dy, y0 + rows - ay]]) {
      if (p === 0) { if (q < 0) { ok = false; break; } continue; }
      const t = q / p;
      if (p < 0) { if (t > t1) { ok = false; break; } if (t > t0) t0 = t; } else { if (t < t0) { ok = false; break; } if (t < t1) t1 = t; }
    }
    if (!ok) continue;
    const seg = [r2(ax + t0 * dx - x0), r2(ay + t0 * dy - y0), r2(ax + t1 * dx - x0), r2(ay + t1 * dy - y0)];
    if (seg[0] !== seg[2] || seg[1] !== seg[3]) out.push(seg);
  }
  return out;
}

// Does the straight step between two square centres cross a wall? (Touching a wall's end counts, so
// nobody squeezes diagonally through the corner where two walls meet.)
function crosses(walls, ax, ay, bx, by) {
  for (const w of walls) {
    const [cx, cy, dx, dy] = w;
    const d1 = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    const d2 = (bx - ax) * (dy - ay) - (by - ay) * (dx - ax);
    const d3 = (dx - cx) * (ay - cy) - (dy - cy) * (ax - cx);
    const d4 = (dx - cx) * (by - cy) - (dy - cy) * (bx - cx);
    if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0) || d1 === 0 || d2 === 0) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true;
    if ((d3 === 0 || d4 === 0) && ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0))) return true;
  }
  return false;
}

// Squares reachable from the starting squares, and how many 5-foot steps each takes (diagonals count as
// one step, the 5e rule). `blocked` holds squares an enemy stands in: they cannot be passed through.
export function reach(grid, sources, { blocked = new Set(), maxSteps = Infinity } = {}) {
  const { cols, rows } = grid;
  const walls = grid.walls || [];
  const dist = new Map();
  const q = [];
  for (const [x, y, d0 = 0] of sources) {
    if (x < 0 || y < 0 || x >= cols || y >= rows) continue;
    const k = y * cols + x;
    if (dist.has(k) && dist.get(k) <= d0) continue;
    dist.set(k, d0);
    q.push([x, y, d0]);
  }
  q.sort((a, b) => a[2] - b[2]);
  for (let i = 0; i < q.length; i++) {
    const [x, y, d] = q[i];
    if (d >= maxSteps) continue;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx; const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        const k = ny * cols + nx;
        if (dist.has(k) && dist.get(k) <= d + 1) continue;
        if (blocked.has(k)) continue;
        if (walls.length && crosses(walls, x + 0.5, y + 0.5, nx + 0.5, ny + 0.5)) continue;
        dist.set(k, d + 1);
        q.push([nx, ny, d + 1]);
      }
    }
  }
  return dist;
}

export function edgeCells(grid, side) {
  const out = [];
  const { cols, rows } = grid;
  if (side === 'left' || side === 'right') for (let y = 0; y < rows; y++) out.push([side === 'left' ? 0 : cols - 1, y]);
  else for (let x = 0; x < cols; x++) out.push([x, side === 'top' ? 0 : rows - 1]);
  return out;
}

// How many 5-foot steps from one square to another, through as many zones as it takes: walk to the
// side of this zone that faces the next, step across, and so on. null when there is no way.
// `blockedIn(zoneId)` gives the squares enemies hold in that zone.
export function stepsBetween(m, siteId, zones, from, to, { blockedIn = () => new Set() } = {}) {
  const path = zonePath(zones, from.zone, to.zone);
  if (!path) return null;
  let sources = [[from.x, from.y, 0]];
  for (let i = 0; i < path.length; i++) {
    const z = zoneOf(zones, path[i]);
    const g = gridOf(m, siteId, z);
    const dist = reach(g, sources, { blocked: blockedIn(z.id) });
    if (i === path.length - 1) {
      const d = dist.get(to.y * g.cols + to.x);
      return d == null ? null : d;
    }
    const next = zoneOf(zones, path[i + 1]);
    const side = sideToward(z, next);
    const out = edgeCells(g, side);
    const ng = gridOf(m, siteId, next);
    const into = edgeCells(ng, OPPOSITE[side]);
    // Stepping across costs one square, and lands at the same place along the shared side.
    const cost = new Map();
    const step = { left: [-1, 0], right: [1, 0], top: [0, -1], bottom: [0, 1] }[side];
    out.forEach(([x, y], k) => {
      const d = dist.get(y * g.cols + x);
      if (d == null) return;
      // A wall along the shared side (a battle map's own walls) stops the step across; a door does not.
      if ((g.walls || []).length && crosses(g.walls, x + 0.5, y + 0.5, x + 0.5 + step[0], y + 0.5 + step[1])) return;
      const j = Math.round((out.length > 1 ? k / (out.length - 1) : 0.5) * (into.length - 1));
      if (!cost.has(j) || cost.get(j) > d + 1) cost.set(j, d + 1);
    });
    if (!cost.size) return null;
    sources = [...cost.entries()].map(([j, d]) => [into[j][0], into[j][1], d]);
  }
  return null;
}

// The free square nearest a point (in squares), for placing a creature.
export function freeNear(grid, taken, ax, ay) {
  let best = null; let bd = Infinity;
  for (let y = 0; y < grid.rows; y++) {
    for (let x = 0; x < grid.cols; x++) {
      if (taken.has(y * grid.cols + x)) continue;
      const d = (x + 0.5 - ax) ** 2 + (y + 0.5 - ay) ** 2 + (y * 1e-6) + (x * 1e-7);
      if (d < bd) { bd = d; best = [x, y]; }
    }
  }
  return best;
}
// A point near the middle of one side of a grid (or its centre).
export function anchor(grid, side) {
  const { cols, rows } = grid;
  if (side === 'left') return [0.5, rows / 2];
  if (side === 'right') return [cols - 0.5, rows / 2];
  if (side === 'top') return [cols / 2, 0.5];
  if (side === 'bottom') return [cols / 2, rows - 0.5];
  return [cols / 2, rows / 2];
}

export const cheb = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
// Within reach: the same zone and within that many squares (1: the next square).
export const inReach = (a, b, reach = 1) => !!(a && b && a.zone === b.zone && cheb(a, b) <= Math.max(1, Math.round(reach)));

// ---- movement ------------------------------------------------------------------------------------
// Squares a creature moves with one move (its own `speed`, else the game's).
export function speedOf(who, rules) {
  if (who && Number.isFinite(who.speed)) return who.speed;
  return (rules && rules.move != null) ? rules.move : 6;
}
// Squares a creature may still move this turn (null outside a fight), and what a square costs it.
export function budget(who, { speed = 6, used = null, zoneTags = [], stuck = [] } = {}) {
  const conds = low(who.conds);
  let sq = speed;
  if (conds.some((c) => NO_MOVE.includes(c) || stuck.includes(c)) || who.down) sq = 0;
  const per = (conds.includes('prone') ? 2 : 1) * (zoneTags.includes('difficult') ? 2 : 1);
  if (!used) return { left: null, per, speed: sq };
  const total = sq * (used.dash ? 2 : 1);
  return { left: Math.max(0, total - (used.moved || 0)), per, speed: sq, total };
}
export const canReact = (who) => !!who && !who.dead && !who.down && !low(who.conds).some((c) => CANT_REACT.includes(c));

// ---- imported maps ---------------------------------------------------------------------------------
// A Universal VTT file (.dd2vtt, .uvtt, .df2vtt): the picture, the grid and the walls.
export function parseUvtt(obj) {
  if (!obj || typeof obj !== 'object') throw new Error('That is not a Universal VTT file.');
  const r = obj.resolution || {};
  const size = r.map_size || {};
  const org = r.map_origin || { x: 0, y: 0 };
  const cols = Math.round(num(size.x, 0)); const rows = Math.round(num(size.y, 0));
  if (!(cols > 0 && rows > 0)) throw new Error('The file does not say how many squares the map has.');
  if (cols > 200 || rows > 200) throw new Error('That map is too big (over 200 squares a side).');
  const ox = num(org.x, 0); const oy = num(org.y, 0);
  const segs = [];
  for (const line of [...(obj.line_of_sight || []), ...(obj.objects_line_of_sight || [])]) {
    if (!Array.isArray(line)) continue;
    for (let i = 0; i + 1 < line.length; i++) {
      const a = line[i]; const b = line[i + 1];
      if (!a || !b) continue;
      const s = [r2(num(a.x, 0) - ox), r2(num(a.y, 0) - oy), r2(num(b.x, 0) - ox), r2(num(b.y, 0) - oy)];
      if (s[0] !== s[2] || s[1] !== s[3]) segs.push(s);
    }
  }
  const doors = [];
  for (const p of obj.portals || []) {
    const b = p && p.bounds;
    if (Array.isArray(b) && b.length >= 2) doors.push([r2(num(b[0].x, 0) - ox), r2(num(b[0].y, 0) - oy), r2(num(b[1].x, 0) - ox), r2(num(b[1].y, 0) - oy)]);
  }
  return { cols, rows, ppg: num(r.pixels_per_grid, 0), image: typeof obj.image === 'string' ? obj.image : '', walls: joinSegs(segs).slice(0, MAX_WALLS), doors: doors.slice(0, 400) };
}
// Runs of segments that carry straight on become one segment, so a long wall drawn in many short pieces
// costs one entry.
export function joinSegs(segs) {
  const out = [];
  for (const s of segs) {
    const last = out[out.length - 1];
    if (last && last[2] === s[0] && last[3] === s[1]) {
      const cross = (last[2] - last[0]) * (s[3] - s[1]) - (last[3] - last[1]) * (s[2] - s[0]);
      if (Math.abs(cross) < 1e-9) { last[2] = s[2]; last[3] = s[3]; continue; }
    }
    out.push(s.slice());
  }
  return out;
}
// Walls and doors as the Engine keeps them: numbers only, rounded, capped.
export function cleanSegs(list, max = MAX_WALLS, cols = MAX_CELLS * 5, rows = MAX_CELLS * 5) {
  const out = [];
  for (const s of Array.isArray(list) ? list : []) {
    if (!Array.isArray(s) || s.length < 4) continue;
    const v = s.slice(0, 4).map((n) => r2(clamp(num(n, 0), -1, Math.max(cols, rows) + 1)));
    if (v[0] !== v[2] || v[1] !== v[3]) out.push(v);
    if (out.length >= max) break;
  }
  return out;
}

// Cut a site map into zones of about 6 by 6 squares, for a picture with no zones yet.
export function zonesFromSiteMap(cols, rows) {
  const across = Math.max(1, Math.round(cols / ZONE_CELLS)); const down = Math.max(1, Math.round(rows / ZONE_CELLS));
  const list = [];
  const letters = 'ABCDEFGHIJKLMNOP';
  for (let j = 0; j < down && list.length < MAX_ZONES; j++) {
    for (let i = 0; i < across && list.length < MAX_ZONES; i++) {
      const x0 = Math.round((i * cols) / across); const x1 = Math.round(((i + 1) * cols) / across);
      const y0 = Math.round((j * rows) / down); const y1 = Math.round(((j + 1) * rows) / down);
      list.push({ id: `area-${letters[j]}${i + 1}`, name: `Area ${letters[j]}${i + 1}`, x: x0 / cols, y: y0 / rows, w: (x1 - x0) / cols, h: (y1 - y0) / rows });
    }
  }
  const zones = normZones(list);
  // Neighbours share a side.
  for (const z of zones) z.links = zones.filter((o) => o !== z && touching(z, o)).map((o) => o.id);
  return zones;
}
export function touching(a, b) {
  const e = 0.005;
  const overlapX = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const overlapY = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  const sideX = Math.abs(a.x + a.w - b.x) < e || Math.abs(b.x + b.w - a.x) < e;
  const sideY = Math.abs(a.y + a.h - b.y) < e || Math.abs(b.y + b.h - a.y) < e;
  return (sideX && overlapY > e) || (sideY && overlapX > e);
}

// ---- the travel map --------------------------------------------------------------------------------
// Where each place sits (0 to 1 across and down): the DM's own placing first, then the adventure's,
// then rings out from the first place along its exits.
export function travelLayout(sites, pos = {}) {
  const out = {};
  const list = sites || [];
  if (!list.length) return out;
  const depth = { [list[0].id]: 0 };
  const q = [list[0].id];
  while (q.length) {
    const id = q.shift();
    const s = list.find((x) => x.id === id);
    // An exit is a place's id (the Skeleton's adventures) or { to } (the D&D Director's).
    for (const e of (s && s.exits) || []) { const to = typeof e === 'string' ? e : e && e.to; if (to && !(to in depth) && list.some((x) => x.id === to)) { depth[to] = depth[id] + 1; q.push(to); } }
  }
  let maxD = Math.max(0, ...Object.values(depth));
  for (const s of list) if (!(s.id in depth)) depth[s.id] = ++maxD;
  const byD = {};
  for (const s of list) (byD[depth[s.id]] = byD[depth[s.id]] || []).push(s.id);
  for (const [d, ids] of Object.entries(byD)) {
    ids.forEach((id, i) => {
      out[id] = { x: r2(0.08 + (maxD ? (Number(d) / maxD) * 0.84 : 0.42)), y: r2(ids.length === 1 ? 0.5 : 0.14 + (i / (ids.length - 1)) * 0.72) };
    });
  }
  for (const s of list) {
    const p = (pos && pos[s.id]) || s.map;
    if (p && Number.isFinite(Number(p.x)) && Number.isFinite(Number(p.y))) out[s.id] = { x: clamp(Number(p.x), 0, 1), y: clamp(Number(p.y), 0, 1) };
  }
  return out;
}
