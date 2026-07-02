#!/usr/bin/env node
/* gen_hard.js — PROGRAM-FIRST hard-task generator (the Stage-0 seed engine of the archer pipeline).
 * We control EVERYTHING: clean NON-OVERLAPPING layout + a relational rule applied deterministically IN JS
 * (so OUT = rule(IN) exactly — no mislabel), tagged by the human core-knowledge PRIOR it teaches, filtered
 * baseline-hard (a dumb 1-step solver fails). Emits prodigy-task JSON, each with a stable ID + difficulty.
 *   node gen_hard.js --n 40 -o out/hard.jsonl                                                              */
const crypto = require("crypto");
const E = require("./engine.js"), B = require("./baseline.js"), C = require("./gen_count.js"), M = require("./maze.js");

const bbox = cells => { let h = 0, w = 0; for (const [r, c] of cells) { if (r + 1 > h) h = r + 1; if (c + 1 > w) w = c + 1; } return [h, w]; };
const blank = (H, W) => Array.from({ length: H }, () => new Array(W).fill(0));
const stamp = (g, cells, r, c, col) => { for (const [dr, dc] of cells) { const rr = r + dr, cc = c + dc; if (rr >= 0 && cc >= 0 && rr < g.length && cc < g[0].length) g[rr][cc] = col; } };
const render = (H, W, objs) => { const g = blank(H, W); for (const o of objs) stamp(g, o.cells, o.r, o.c, o.color); return g; };
const shuffle = (rng, a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = rng.int(0, i);[a[i], a[j]] = [a[j], a[i]]; } return a; };
const pick = (rng, k, pool) => shuffle(rng, pool).slice(0, k);
const rectCells = (h, w) => { const o = []; for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) o.push([r, c]); return o; };
const lineCells = (n, vert) => { const o = []; for (let i = 0; i < n; i++) o.push(vert ? [i, 0] : [0, i]); return o; };
const size = o => o.cells.length;
// "largest"/"smallest" rules are only well-posed if the extreme is STRICTLY unique (Mario: no two equally-sized objects).
const strictMax = P => { const a = P.map(size).sort((x, y) => y - x); return a.length < 2 || a[0] > a[1]; };
const strictMin = P => { const a = P.map(size).sort((x, y) => x - y); return a.length < 2 || a[0] < a[1]; };
// grow the current-largest (in its own kind) until the max area is STRICTLY unique — avoids dropping on cross-kind ties.
function growUniqueMax(specs) { let g = 0; while (!strictMax(specs) && g++ < 16) { const top = specs.slice().sort((a, b) => size(b) - size(a))[0]; top.side = (top.side || 3) + 1; top.cells = shapeCells(top.kind, top.side); } return strictMax(specs); }
const SOLID = ["square", "disc", "plus", "Lshape", "triangle"], HOLED = ["frame", "ring"];
const shapeCells = (kind, s) => kind === "frame" ? E.buildShape("frame", [s, s]) : E.buildShape(kind, [s]);
const flipHcells = cells => { const [, w] = bbox(cells); return cells.map(([r, c]) => [r, w - 1 - c]); };
const rot90cells = cells => E.normalize(cells.map(([r, c]) => [c, -r]));
const rot180cells = cells => rot90cells(rot90cells(cells));
const sameCells = (a, b) => {
  const A = E.normalize(a).map(([r, c]) => r + "," + c).sort().join(";");
  const B = E.normalize(b).map(([r, c]) => r + "," + c).sort().join(";");
  return A === B;
};
const outlineCells = (h, w) => { const o = []; for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) if (r === 0 || c === 0 || r === h - 1 || c === w - 1) o.push([r, c]); return o; };
const cellMask = rows => { const o = []; for (let r = 0; r < rows.length; r++) for (let c = 0; c < rows[r].length; c++) if (rows[r][c]) o.push([r, c]); return o; };
const cellKeySet = cells => new Set(cells.map(([r, c]) => r + "," + c));
const fromKeySet = set => [...set].map(s => s.split(",").map(Number));
function xorCells(a, b) {
  const A = cellKeySet(E.normalize(a)), B = cellKeySet(E.normalize(b)), out = new Set();
  for (const k of A) if (!B.has(k)) out.add(k);
  for (const k of B) if (!A.has(k)) out.add(k);
  return E.normalize(fromKeySet(out));
}
const XOR_MOTIFS = [
  cellMask([[0, 1, 0, 0, 0], [1, 1, 1, 0, 0], [0, 1, 0, 0, 0], [0, 0, 0, 0, 0], [0, 0, 0, 0, 0]]),
  cellMask([[1, 1, 1, 1, 1], [1, 0, 0, 0, 1], [1, 0, 0, 0, 1], [1, 0, 0, 0, 1], [1, 1, 1, 1, 1]]),
  cellMask([[0, 0, 1, 0, 0], [0, 1, 1, 1, 0], [1, 1, 1, 1, 1], [0, 1, 1, 1, 0], [0, 0, 1, 0, 0]]),
  cellMask([[1, 0, 0, 0, 0], [1, 1, 0, 0, 0], [1, 1, 1, 0, 0], [1, 1, 1, 1, 0], [1, 1, 1, 1, 1]]),
  cellMask([[1, 1, 1, 0, 0], [0, 1, 0, 0, 0], [0, 1, 0, 0, 0], [0, 1, 0, 0, 0], [0, 1, 0, 0, 0]]),
  cellMask([[1, 0, 1, 0, 1], [0, 1, 1, 1, 0], [1, 1, 1, 1, 1], [0, 1, 1, 1, 0], [1, 0, 1, 0, 1]]),
];
function variedXorPair(rng) {
  const key = cells => E.normalize(cells).map(([r, c]) => r + ":" + c).join("|");
  const area = cells => cells.length;
  let a = E.normalize(pick(rng, 1, XOR_MOTIFS)[0]), b = E.normalize(pick(rng, 1, XOR_MOTIFS)[0]), x = xorCells(a, b);
  let guard = 0;
  while ((key(a) === key(b) || area(x) < 4 || area(x) === area(a) || area(x) === area(b)) && guard++ < 40) {
    a = E.normalize(pick(rng, 1, XOR_MOTIFS)[0]);
    b = E.normalize(pick(rng, 1, XOR_MOTIFS)[0]);
    x = xorCells(a, b);
  }
  return [a, b, x];
}

// ---- SHAPE vocab + SKINS — shared module so gen_hard AND gen_count skin the same way (Mario: skinnable everywhere). ----
const { SHAPES_ALL, SKINS, skinnedCells, pickSkin } = require("./skins.js");
// render objects honouring per-object skins (multi-colour / sub-objects). objs: {cells,r,c,color[,skin,accent]}.
const renderSkinned = (H, W, objs) => { const g = blank(H, W); for (const o of objs) { const cells = o.skin ? skinnedCells(o.cells, o.skin, o.color, o.accent) : o.cells.map(([r, c]) => [r, c, o.color]); for (const [dr, dc, col] of cells) { const rr = o.r + dr, ccc = o.c + dc; if (col && rr >= 0 && ccc >= 0 && rr < H && ccc < W) g[rr][ccc] = col; } } return g; };
const flipVcells = cells => { const [h] = bbox(cells); return cells.map(([r, c]) => [h - 1 - r, c]); };
const transposeCells = cells => cells.map(([r, c]) => [c, r]);
// Bresenham line cells from (r0,c0) to (r1,c1) inclusive.
const bres = (r0, c0, r1, c1) => { const o = [], dr = Math.abs(r1 - r0), dc = Math.abs(c1 - c0), sr = r0 < r1 ? 1 : -1, sc = c0 < c1 ? 1 : -1; let err = dr - dc, r = r0, c = c0;
  while (true) { o.push([r, c]); if (r === r1 && c === c1) break; const e2 = 2 * err; if (e2 > -dc) { err -= dc; r += sr; } if (e2 < dr) { err += dr; c += sc; } } return o; };
// arrow/pointer cells. Humans read a triangle/arrowhead as POINTING. DIRV = the ray direction. 8-way: 4 axis + 4 diagonal.
const DIRV = { up: [-1, 0], down: [1, 0], left: [0, -1], right: [0, 1], ne: [-1, 1], nw: [-1, -1], se: [1, 1], sw: [1, -1] };
const AXIS = ["up", "down", "left", "right"], DIAG = ["ne", "nw", "se", "sw"];
const hollowOutline = cells => { const set = new Set(cells.map(([r, c]) => r + "," + c)); return cells.filter(([r, c]) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dr, dc]) => !set.has((r + dr) + "," + (c + dc)))); };
const orient = (cells, dir) => dir === "up" ? cells : dir === "down" ? flipVcells(cells) : dir === "left" ? transposeCells(cells) : flipHcells(transposeCells(cells));   // canonical-up glyph → any axis dir
// ABSTRACT pointer glyphs (all "point up" canonically; a model must learn POINTING, not one triangle). tip = topmost-centre.
const triUp = n => { const o = []; for (let r = 0; r < n; r++) { const w = 2 * r + 1, s = (n - 1) - r; for (let k = 0; k < w; k++) o.push([r, s + k]); } return o; };          // ▲ filled
const arrowUp = n => { const o = triUp(2); for (let r = 2; r < n + 1; r++) o.push([r, 1]); return o; };                                                                            // ↑ head + shaft
const veeUp = n => { const o = []; for (let i = 0; i < n; i++) { o.push([i, (n - 1) - i]); o.push([i, (n - 1) + i]); } return o; };                                                  // ^ caret (two strokes)
const AXIS_STYLES = { filled: triUp, hollow: n => hollowOutline(triUp(n)), arrow: arrowUp, vee: veeUp };
const AXIS_STYLE_KEYS = Object.keys(AXIS_STYLES);
// diagonal pointer = a chevron: two arms meeting at the tip corner (reads as pointing to that corner).
const chevron = (dir, n) => { const o = new Set(), add = (r, c) => o.add(r + "," + c);
  for (let i = 0; i < n; i++) { if (dir === "ne") { add(i, n - 1); add(0, i); } else if (dir === "nw") { add(i, 0); add(0, i); } else if (dir === "se") { add(i, n - 1); add(n - 1, i); } else { add(i, 0); add(n - 1, i); } }
  return [...o].map(s => s.split(",").map(Number)); };
const pointerCells = (dir, n, style) => DIAG.includes(dir) ? chevron(dir, n) : orient((AXIS_STYLES[style] || triUp)(n), dir);
const pointerStyleFor = (rng, dir) => DIAG.includes(dir) ? "chevron" : pick(rng, 1, AXIS_STYLE_KEYS)[0];

// gap-enforced placement (every object separated by >= 1 empty cell, so boundaries are always clear and
// same-colour objects never merge). Canonical impl lives in gen_count.js; reused here to stay in sync.
const placeRoster = C.placeRoster;
const RANKPAL = [2, 3, 4, 1, 8, 6];   // colours by ascending rank

// shared setup for pointer/ray families: place an arrow (8-way, filled/hollow/diagonal) with room ahead, expose its
// ray cells and a gap-respecting placer for on-ray / off-ray shapes. Throws if the grid can't fit it (gen loop drops).
function pointerScene(rng, H, W, gap = 1) {
  const dir = pick(rng, 1, [...AXIS, ...DIAG])[0], dv = DIRV[dir], n = rng.int(2, 4), style = pointerStyleFor(rng, dir);
  const aCells = pointerCells(dir, n, style), [ah, aw] = bbox(aCells), occ = blank(H, W);
  const tip = aCells.reduce((b, c) => (c[0] * dv[0] + c[1] * dv[1] > b[0] * dv[0] + b[1] * dv[1] ? c : b), aCells[0]);   // frontmost cell along the ray = the apex (works for any glyph)
  const mark = (cells, r, c) => { for (const [dr, dc] of cells) { const rr = r + dr, cc = c + dc; if (rr >= 0 && cc >= 0 && rr < H && cc < W) occ[rr][cc] = 1; } };
  const free = (cells, r, c) => { for (const [dr, dc] of cells) { const rr = r + dr, cc = c + dc; if (rr < 0 || cc < 0 || rr >= H || cc >= W) return false; for (let a = -gap; a <= gap; a++) for (let b = -gap; b <= gap; b++) { const nr = rr + a, nc = cc + b; if (nr >= 0 && nc >= 0 && nr < H && nc < W && occ[nr][nc]) return false; } } return true; };
  let ar, ac, apR, apC, rayCells = null;
  for (let t = 0; t < 500; t++) { ar = rng.int(0, H - ah); ac = rng.int(0, W - aw); if (!free(aCells, ar, ac)) continue;
    apR = ar + tip[0]; apC = ac + tip[1];
    const rc = []; let r = apR + dv[0], c = apC + dv[1]; while (r >= 0 && c >= 0 && r < H && c < W) { rc.push([r, c]); r += dv[0]; c += dv[1]; }
    if (rc.length >= 5) { rayCells = rc; break; } }
  if (!rayCells) throw new Error("pointerScene: no room ahead");
  mark(aCells, ar, ac);
  const rayset = new Set(rayCells.map(([r, c]) => r + "," + c)), onRay = (cells, r, c) => cells.some(([dr, dc]) => rayset.has((r + dr) + "," + (c + dc)));
  const place = wantOn => { for (let t = 0; t < 300; t++) { const s = rng.int(2, 3), cells = shapeCells("square", s); let r, c;
    if (wantOn) { const p = rayCells[rng.int(Math.min(2, rayCells.length - 1), rayCells.length - 1)]; r = Math.max(0, Math.min(H - s, p[0] - rng.int(0, s - 1))); c = Math.max(0, Math.min(W - s, p[1] - rng.int(0, s - 1))); }
    else { r = rng.int(0, H - s); c = rng.int(0, W - s); }
    if (onRay(cells, r, c) !== wantOn) continue; if (free(cells, r, c)) return { cells, r, c }; } return null; };
  return { dir, dv, arrow: { cells: aCells, r: ar, c: ac, color: 5, arrow: true }, rayCells, place, mark, free };
}

// ---- rule families. prior ∈ object|number|geometry|topology|relational. make(rng) → {in, out} int-grids. ----
const FAMILIES = {
  rank_recolor: { prior: "number/geometry", steps: 2, rule: "recolour each shape by its size rank: smallest→red, then green, yellow, blue, cyan", concept: ["ordering", "rank", "relational"],
    make(rng) { const K = rng.int(3, 5), H = rng.int(16, 20), W = rng.int(16, 20);
      const sizes = pick(rng, K, [2, 3, 4, 5, 6]), cols = pick(rng, K, [3, 4, 5, 6, 7, 8, 9]);
      const specs = sizes.map((s, i) => ({ cells: shapeCells("square", s), color: cols[i] }));
      const P = placeRoster(rng, H, W, specs), IN = render(H, W, P);
      const ranked = P.slice().sort((a, b) => size(a) - size(b));
      return { in: IN, out: render(H, W, P.map(o => ({ ...o, color: RANKPAL[ranked.indexOf(o)] }))) }; } },

  holed_take_largest: { prior: "object/topology", steps: 2, rule: "every shape with a hole is recoloured to the colour of the single largest shape; the shapes without a hole are removed", concept: ["hole", "largest", "relational", "dispatch"],
    make(rng) { const H = rng.int(18, 22), W = rng.int(18, 22);
      // UNIQUE-largest by construction: holed = frames of DISTINCT sides 4/5 (areas 12/16); solid distractors = small
      // squares ≤3 (areas ≤9) → the biggest frame is always strictly the largest shape. (No ties → well-posed.)
      const cols = pick(rng, 4, [2, 3, 4, 5, 6, 7, 8]), fSides = pick(rng, 2, [4, 5]);
      const specs = [
        { cells: shapeCells("frame", fSides[0]), color: cols[0], holed: true },
        { cells: shapeCells("frame", fSides[1]), color: cols[1], holed: true },
        { cells: shapeCells("square", rng.int(2, 3)), color: cols[2], holed: false },
        { cells: shapeCells("square", rng.int(2, 3)), color: cols[3], holed: false },
      ];
      const P = placeRoster(rng, H, W, specs), IN = render(H, W, P), largest = P.slice().sort((a, b) => size(b) - size(a))[0];
      return { in: IN, out: render(H, W, P.filter(o => o.holed).map(o => ({ ...o, color: largest.color }))) }; } },

  recolor_to_majority: { prior: "number", steps: 2, rule: "recolour every shape to the colour that the majority of the shapes already share", concept: ["counting", "majority", "relational"],
    make(rng) { const H = rng.int(16, 20), W = rng.int(16, 20);
      const maj = [2, 3, 4][rng.int(0, 2)], min = [5, 6, 7, 8].filter(c => c !== maj)[rng.int(0, 2)];
      const specs = []; for (let i = 0; i < rng.int(3, 4); i++) specs.push({ cells: shapeCells(SOLID[rng.int(0, 4)], rng.int(2, 4)), color: maj });
      for (let i = 0; i < rng.int(1, 2); i++) specs.push({ cells: shapeCells(SOLID[rng.int(0, 4)], rng.int(2, 4)), color: min });
      const P = placeRoster(rng, H, W, specs), IN = render(H, W, P);
      return { in: IN, out: render(H, W, P.map(o => ({ ...o, color: maj }))) }; } },

  // HUMAN-SHAPED counting (PAN-158): vertical · spaced · centred · colour-matched · cropped to a small answer grid.
  count_total: { prior: "number", steps: 2, rule: "count all the shapes; show the total as a vertical, spaced, centred tally in a fixed marker colour", concept: ["counting", "cardinality", "subitize"],
    make: rng => C.makeInstance(rng, { count_what: "total", orient: "v", spacing: "spaced", place: "center", mark: "fixed" }) },   // FIXED marker (grey, never a shape colour) — a total is colour-independent; "match" picked an arbitrary input colour that changed every example (unlearnable)
  count_per_color: { prior: "number", steps: 2, rule: "count the shapes of each colour; show one vertical spaced tally per colour, colour-matched", concept: ["counting", "per-colour", "tally"],
    make: rng => C.makeInstance(rng, { count_what: "per_color", orient: "v", spacing: "spaced", place: "center", mark: "match" }) },

  compare_more: { prior: "number", steps: 2, rule: "output a single block in the colour that has MORE shapes (red vs blue)", concept: ["comparison", "most", "counting"],
    make(rng) { const H = rng.int(18, 22), W = rng.int(18, 22);
      let nR = rng.int(2, 5), nB = rng.int(2, 5); while (nR === nB) nB = rng.int(2, 5);
      const specs = []; for (let i = 0; i < nR; i++) specs.push({ cells: shapeCells(SOLID[rng.int(0, 4)], 2), color: 2 });
      for (let i = 0; i < nB; i++) specs.push({ cells: shapeCells(SOLID[rng.int(0, 4)], 2), color: 1 });
      const P = placeRoster(rng, H, W, specs), IN = render(H, W, P), win = nR > nB ? 2 : 1;
      const out = blank(3, 3); for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) out[r][c] = win;   // small human-shaped answer block (PAN-158)
      return { in: IN, out }; } },

  inside_outside: { prior: "topology", steps: 3, rule: "recolour all objects inside the frame green and all outside objects red; preserve each object's shape and the frame", concept: ["containment", "inside-outside", "topology", "multi-object"],
    make(rng) { const H = rng.int(20, 24), W = rng.int(20, 24), gap = 1;
      const fr = Math.max(10, Math.floor(Math.min(H, W) * 0.62)), fc = fr;
      const fR = rng.int(0, H - fr - 1), fC = rng.int(0, W - fc - 1);
      const frameCells = E.buildShape("frame", [fr, fc]), occ = blank(H, W);
      const mark = (cells, r, c) => { for (const [dr, dc] of cells) { const rr = r + dr, cc = c + dc; if (rr >= 0 && cc >= 0 && rr < H && cc < W) occ[rr][cc] = 1; } };
      const free = (cells, r, c) => { for (const [dr, dc] of cells) { const rr = r + dr, cc = c + dc; if (rr < 0 || cc < 0 || rr >= H || cc >= W) return false; for (let a = -gap; a <= gap; a++) for (let b = -gap; b <= gap; b++) { const nr = rr + a, nc = cc + b; if (nr >= 0 && nc >= 0 && nr < H && nc < W && occ[nr][nc]) return false; } } return true; };
      mark(frameCells, fR, fC);
      const objs = [{ cells: frameCells, r: fR, c: fC, color: 5, frame: true }];
      const tryPlace = inside => { const s = rng.int(2, 3), cells = shapeCells(pick(rng, 1, ["square", "plus", "Lshape", "triangle"])[0], s), [bh, bw] = bbox(cells);
        for (let t = 0; t < 120; t++) { let r, c;
          if (inside) { r = fR + 1 + rng.int(0, Math.max(0, fr - 2 - bh)); c = fC + 1 + rng.int(0, Math.max(0, fc - 2 - bw)); }
          else { r = rng.int(0, H - bh - 1); c = rng.int(0, W - bw - 1); if (r >= fR - 1 && r <= fR + fr && c >= fC - 1 && c <= fC + fc) continue; }
          if (free(cells, r, c)) { mark(cells, r, c); objs.push({ cells, r, c, color: [3, 4, 6, 7, 8][rng.int(0, 4)], inside }); return; } } };
      const nIn = rng.int(2, 3), nOut = rng.int(2, 4); for (let i = 0; i < nIn; i++) tryPlace(true); for (let i = 0; i < nOut; i++) tryPlace(false);
      const IN = render(H, W, objs);
      const out = objs.map(o => o.frame ? o : ({ ...o, color: o.inside ? 3 : 2 }));
      return { in: IN, out: render(H, W, out) }; } },

  fill_holes: { prior: "topology", steps: 2, rule: "fill the hole of every hollow shape, turning each frame/ring into a solid block of its own colour", concept: ["hole", "fill", "topology"],
    make(rng) { const H = rng.int(16, 20), W = rng.int(16, 20), K = rng.int(3, 4);
      const specs = []; for (let i = 0; i < K; i++) { const s = rng.int(3, 5), k = HOLED[rng.int(0, 1)]; specs.push({ cells: shapeCells(k, s), color: pick(rng, 1, [2, 3, 4, 5, 6, 7, 8])[0], s }); }
      // add a solid distractor that must NOT change
      specs.push({ cells: shapeCells("square", rng.int(2, 3)), color: [3, 4, 6][rng.int(0, 2)], solid: true });
      const P = placeRoster(rng, H, W, specs), IN = render(H, W, P);
      const out = P.map(o => o.solid ? o : ({ ...o, cells: rectCells(...bbox(o.cells)) }));   // fill hole = solid bbox
      return { in: IN, out: render(H, W, out) }; } },

  largest_to_marker: { prior: "object", steps: 2, rule: "find the single largest shape and recolour ONLY it to magenta; every other shape is unchanged", concept: ["largest", "selection", "relational"],
    make(rng) { const K = rng.int(3, 4), H = rng.int(19, 23), W = rng.int(19, 23);
      const sizes = pick(rng, K, [2, 3, 4, 5]), cols = pick(rng, K, [3, 4, 1, 8, 6].filter(c => c !== 7)), kind = pick(rng, 1, ["square", "plus", "diamond"])[0];   // no disc (its footprint is huge → crowds)
      const specs = sizes.map((s, i) => ({ cells: shapeCells(kind, s), color: cols[i] }));   // ONE kind + DISTINCT sizes → area is monotonic → the largest is strictly UNIQUE (Mario)
      const P = placeRoster(rng, H, W, specs), IN = render(H, W, P), big = P.slice().sort((a, b) => size(b) - size(a))[0];
      return { in: IN, out: render(H, W, P.map(o => o === big ? { ...o, color: 7 } : o)) }; } },

  odd_shape_out: { prior: "object", steps: 2, rule: "all shapes share one kind except one; recolour the odd-kind shape yellow, leave the rest", concept: ["odd-one-out", "shape", "relational"],
    make(rng) { const K = rng.int(3, 4), H = rng.int(16, 20), W = rng.int(16, 20);
      const majK = SOLID[rng.int(0, 4)]; let oddK = SOLID[rng.int(0, 4)]; while (oddK === majK) oddK = SOLID[rng.int(0, 4)];
      const cols = pick(rng, K + 1, [2, 3, 5, 6, 8].filter(c => c !== 4));
      const specs = []; for (let i = 0; i < K; i++) specs.push({ cells: shapeCells(majK, rng.int(3, 4)), color: cols[i], odd: false });
      const odd = { cells: shapeCells(oddK, rng.int(3, 4)), color: cols[K], odd: true }; specs.push(odd);
      const P = placeRoster(rng, H, W, specs), IN = render(H, W, P);
      return { in: IN, out: render(H, W, P.map(o => o.odd ? { ...o, color: 4 } : o)) }; } },

  mirror_each: { prior: "geometry", steps: 2, rule: "replace every shape by its left-right mirror image, in place", concept: ["reflection", "symmetry", "per-object"],
    make(rng) { const K = rng.int(3, 4), H = rng.int(17, 21), W = rng.int(17, 21), specs = [];
      for (let i = 0; i < K; i++) { const k = ["Lshape", "triangle", "Tshape", "notch"][rng.int(0, 3)], cells = shapeCells(k, rng.int(3, 4)), [bh, bw] = bbox(cells);
        specs.push({ cells: rectCells(bh, bw), shape: cells, color: pick(rng, 1, [2, 3, 4, 5, 6, 8])[0] }); }   // reserve the full bbox so the MIRRORED cells keep the gap too
      const P = placeRoster(rng, H, W, specs);
      const IN = render(H, W, P.map(o => ({ ...o, cells: o.shape })));
      return { in: IN, out: render(H, W, P.map(o => ({ ...o, cells: flipHcells(o.shape) }))) }; } },

  iq_boolean_xor: { prior: "iq/boolean", steps: 2, rule: "combine the two top-left-aligned source figures with XOR; cells present in exactly one source remain, in source A's colour", concept: ["iq", "boolean", "xor", "figure-algebra"],
    variation: { vary: ["source mask A", "source mask B", "source A colour", "source B colour"], invariant: ["operation = xor", "source masks are top-left aligned", "answer colour is inherited from source A"] },
    make(rng) { const H = 11, W = 23, [A, B0, X] = variedXorPair(rng), colA = pick(rng, 1, [2, 3, 4, 6, 8])[0], colB = pick(rng, 1, [1, 5, 7, 9].filter(c => c !== colA))[0];
      const IN = blank(H, W), out = blank(7, 7);
      stamp(IN, A, 2, 2, colA); stamp(IN, B0, 2, 15, colB); for (let r = 0; r < H; r++) IN[r][11] = 5;
      stamp(out, X, 1, 1, colA);
      return { in: IN, out: C.cropToContent(out) }; } },

  skin_zoo_select_checker: { prior: "object/skin", steps: 2, rule: "among varied skinned objects, keep only the object with the checker internal pattern", concept: ["skin", "subobject", "selection", "checker"],
    variation: { vary: ["object shape", "skin distractors", "body colour", "accent colour", "layout"], invariant: ["target predicate = checker skin", "output keeps only the checker object"] },
    make(rng) { const H = 28, W = 32, body = pick(rng, 1, [1, 5, 8])[0], accent = pick(rng, 1, [2, 3, 4, 6, 7, 9].filter(c => c !== body))[0];
      const skins = shuffle(rng, ["core", "border", "cross", "stripe", "checker", "diag", "spots", "corner", "split"]).slice(0, 5);
      if (!skins.includes("checker")) skins[0] = "checker";
      const specs = skins.map(sk => ({ cells: shapeCells(pick(rng, 1, SHAPES_ALL)[0], rng.int(3, 4)), color: body, skin: sk, accent, target: sk === "checker" }));
      const P = placeRoster(rng, H, W, specs);
      return { in: renderSkinned(H, W, P), out: renderSkinned(H, W, P.filter(o => o.target)) }; } },

  // ---- PAN-157 breadth batch (2026-06-23): +11 families across all priors + a foundational physics bridge ----
  recolor_by_size_class: { prior: "number/object", steps: 2, rule: "recolour every small shape red and every large shape blue, by cell-count", concept: ["size", "threshold", "classification"],
    make(rng) { const H = rng.int(16, 20), W = rng.int(16, 20);
      const sides = shuffle(rng, [2, 2, 3, 4, 5, 3]).slice(0, rng.int(4, 6));
      if (!sides.includes(2)) sides[0] = 2; if (!sides.some(s => s >= 3)) sides[1] = 3;
      const cols = pick(rng, sides.length, [3, 4, 5, 6, 7, 8]);
      const specs = sides.map((s, i) => ({ cells: shapeCells("square", s), color: cols[i], big: s >= 3 }));
      const P = placeRoster(rng, H, W, specs), IN = render(H, W, P);
      return { in: IN, out: render(H, W, P.map(o => ({ ...o, color: o.big ? 1 : 2 }))) }; } },

  gravity_drop: { prior: "object/physics", steps: 2, rule: "every shape falls straight down until it rests on the floor, without merging into neighbours", concept: ["gravity", "physics", "object-permanence", "collision"],
    make(rng) { const K = rng.int(3, 4), H = rng.int(14, 18), W = rng.int(20, 24), laneW = Math.floor(W / K);
      const cols = pick(rng, K, [2, 3, 4, 6, 8]), specs = [];
      for (let i = 0; i < K; i++) {
        const cells = shapeCells(pick(rng, 1, ["square", "plus", "Lshape", "notch"])[0], rng.int(2, 3)), [bh, bw] = bbox(cells);
        const laneC = i * laneW, maxC = Math.min(W - bw - 1, laneC + laneW - bw - 2);
        const c = Math.max(0, laneC + 1 + rng.int(0, Math.max(0, maxC - laneC - 1)));
        const r = rng.int(0, Math.max(0, H - bh - 5));
        specs.push({ cells, color: cols[i], r, c, bh });
      }
      const IN = render(H, W, specs);
      return { in: IN, out: render(H, W, specs.map(o => ({ ...o, r: H - o.bh }))) }; } },


  quadrant_recolor: { prior: "geometry", steps: 2, rule: "recolour each shape by the quadrant it sits in: top-left red, top-right green, bottom-left yellow, bottom-right blue", concept: ["position", "quadrant", "spatial"],
    make(rng) { const H = rng.int(17, 21), W = rng.int(17, 21), midR = H >> 1, midC = W >> 1, QC = { TL: 2, TR: 3, BL: 4, BR: 1 };
      const quads = shuffle(rng, ["TL", "TR", "BL", "BR"]).slice(0, rng.int(3, 4)), specs = [];
      for (const q of quads) { const cells = shapeCells("square", rng.int(2, 3)), [bh, bw] = bbox(cells);   // inset from both midlines → an empty band separates every quadrant
        const r = q[0] === 'T' ? rng.int(0, Math.max(0, midR - 1 - bh)) : midR + 1 + rng.int(0, Math.max(0, H - bh - midR - 1));
        const c = q[1] === 'L' ? rng.int(0, Math.max(0, midC - 1 - bw)) : midC + 1 + rng.int(0, Math.max(0, W - bw - midC - 1));
        specs.push({ cells, color: pick(rng, 1, [5, 6, 7, 8])[0], r, c, q }); }
      const IN = render(H, W, specs);
      return { in: IN, out: render(H, W, specs.map(o => ({ ...o, color: QC[o.q] }))) }; } },

  plurality_color: { prior: "number", steps: 2, rule: "output a block in the colour shared by the most shapes (3-way plurality)", concept: ["counting", "plurality", "most"],
    make(rng) { const H = rng.int(18, 22), W = rng.int(18, 22), cols = pick(rng, 3, [2, 3, 4, 6, 7, 8]);
      const plan = [[cols[0], rng.int(3, 4)], [cols[1], rng.int(1, 2)], [cols[2], rng.int(1, 2)]], specs = [];
      for (const [col, n] of plan) for (let i = 0; i < n; i++) specs.push({ cells: shapeCells(pick(rng, 1, SOLID)[0], 2), color: col });
      const P = placeRoster(rng, H, W, specs), IN = render(H, W, P);
      const out = blank(3, 3); for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) out[r][c] = cols[0];
      return { in: IN, out }; } },

  outline_shapes: { prior: "geometry/topology", steps: 2, rule: "replace every solid block by its outline (hollow border), same colour", concept: ["outline", "border", "topology"],
    make(rng) { const K = rng.int(3, 4), H = rng.int(16, 20), W = rng.int(16, 20), specs = [];
      for (let i = 0; i < K; i++) { const s = rng.int(3, 5); specs.push({ cells: rectCells(s, s), color: pick(rng, 1, [2, 3, 4, 6, 7, 8])[0], s }); }
      const P = placeRoster(rng, H, W, specs), IN = render(H, W, P);
      return { in: IN, out: render(H, W, P.map(o => ({ ...o, cells: outlineCells(o.s, o.s) }))) }; } },

  connect_pairs: { prior: "geometry", steps: 2, rule: "draw a straight line connecting the two dots of each colour", concept: ["connect", "line", "relational"],
    make(rng) { const H = rng.int(15, 19), W = rng.int(17, 21), K = rng.int(2, 3);
      const cols = pick(rng, K, [2, 3, 4, 6, 8]), specs = [], segs = [];
      const rowsSel = []; for (const r of shuffle(rng, Array.from({ length: H }, (_, i) => i))) { if (rowsSel.every(x => Math.abs(x - r) >= 2)) rowsSel.push(r); if (rowsSel.length === K) break; }   // rows >= 2 apart → parallel lines never touch
      for (let i = 0; i < rowsSel.length; i++) { const r = rowsSel[i], c1 = rng.int(0, W - 6), c2 = c1 + rng.int(4, Math.min(W - 1 - c1, 8));
        specs.push({ cells: [[0, 0]], color: cols[i], r, c: c1 }); specs.push({ cells: [[0, 0]], color: cols[i], r, c: c2 }); segs.push({ r, c1, c2, col: cols[i] }); }
      const IN = render(H, W, specs), out = IN.map(row => row.slice());
      for (const s of segs) for (let c = s.c1; c <= s.c2; c++) out[s.r][c] = s.col;
      return { in: IN, out }; } },

  recolor_by_holes: { prior: "topology", steps: 2, rule: "recolour each shape by whether it has a hole: holed shapes green, solid shapes red", concept: ["hole", "topology", "classification"],
    make(rng) { const K = rng.int(4, 5), H = rng.int(17, 21), W = rng.int(17, 21), specs = [];
      for (let i = 0; i < K; i++) { const holed = rng.int(0, 1) === 1, k = holed ? HOLED[rng.int(0, 1)] : SOLID[rng.int(0, 4)]; specs.push({ cells: shapeCells(k, rng.int(3, 4)), color: pick(rng, 1, [1, 4, 6, 7, 8])[0], holed }); }
      if (!specs.some(s => s.holed)) specs[0] = { cells: shapeCells("frame", 4), color: 6, holed: true };
      if (!specs.some(s => !s.holed)) specs[1] = { cells: shapeCells("square", 3), color: 7, holed: false };
      const P = placeRoster(rng, H, W, specs), IN = render(H, W, P);
      return { in: IN, out: render(H, W, P.map(o => ({ ...o, color: o.holed ? 3 : 2 }))) }; } },

  sort_row_by_size: { prior: "number/geometry", steps: 2, rule: "output one cell per shape, in a row ordered small→large, each in its shape's colour", concept: ["ordering", "rank", "counting"],
    make(rng) { const K = rng.int(3, 5), H = rng.int(16, 20), W = rng.int(16, 20);
      const sizes = pick(rng, K, [2, 3, 4, 5, 6]), cols = pick(rng, K, [2, 3, 4, 6, 7, 8]);
      const specs = sizes.map((s, i) => ({ cells: shapeCells("square", s), color: cols[i] }));
      const P = placeRoster(rng, H, W, specs), IN = render(H, W, P);
      return { in: IN, out: [P.slice().sort((a, b) => size(a) - size(b)).map(o => o.color)] }; } },

  remove_noise: { prior: "object", steps: 2, rule: "remove the scattered single-cell noise; keep the real shapes", concept: ["denoise", "object", "selection"],
    make(rng) { const K = rng.int(2, 3), H = rng.int(16, 20), W = rng.int(16, 20), specs = [];
      for (let i = 0; i < K; i++) { const color = pick(rng, 1, [2, 3, 4, 6, 8])[0]; specs.push({ cells: shapeCells(pick(rng, 1, SHAPES_ALL)[0], rng.int(3, 4)), color, skin: pick(rng, 1, SKINS)[0], accent: pick(rng, 1, [1, 5, 7, 9].filter(x => x !== color))[0] }); }   // varied shapes + skins (not all plain squares)
      const P = placeRoster(rng, H, W, specs), grid = renderSkinned(H, W, P), nN = rng.int(4, 8); let tries = 0, placed = 0;
      while (placed < nN && tries < 200) { tries++; const r = rng.int(0, H - 1), c = rng.int(0, W - 1); if (grid[r][c]) continue;
        let ok = true; for (let a = -1; a <= 1 && ok; a++) for (let b = -1; b <= 1; b++) { const rr = r + a, cc = c + b; if (rr >= 0 && cc >= 0 && rr < H && cc < W && grid[rr][cc]) { ok = false; break; } }   // 8-neighbour isolation (no diagonal touch either)
        if (!ok) continue; grid[r][c] = pick(rng, 1, [2, 3, 4, 6, 8])[0]; placed++; }
      return { in: grid, out: renderSkinned(H, W, P) }; } },

  scale_to_majority_size: { prior: "geometry", steps: 2, rule: "every shape is rescaled to match the size of the largest shape", concept: ["scale", "uniform", "geometry"],
    make(rng) { const K = rng.int(3, 4), H = rng.int(18, 22), W = rng.int(18, 22);
      const sizes = pick(rng, K, [1, 2, 3]), big = Math.max(...sizes) + 1;   // reserve the BIG footprint so rescaling can't overlap
      const specs = sizes.map(s => ({ cells: shapeCells("square", big), small: s, color: pick(rng, 1, [2, 3, 4, 6, 8])[0] }));
      const P = placeRoster(rng, H, W, specs);
      const IN = render(H, W, P.map(o => ({ ...o, cells: shapeCells("square", o.small) })));
      return { in: IN, out: render(H, W, P) }; } },

  // ---- 2026-06-23 (Mario): richer CONNECTING + POINTING (arrows) + SHADOW-CASTING ----
  connect_in_order: { prior: "geometry", steps: 2, rule: "connect the dots into one path following colour order: red→green→yellow→blue→cyan", concept: ["ordering", "sequence", "path", "connect"],
    make(rng) { const K = rng.int(3, 5), H = rng.int(14, 18), W = rng.int(14, 18);
      const order = RANKPAL.slice(0, K), specs = order.map(col => ({ cells: [[0, 0]], color: col }));
      const P = placeRoster(rng, H, W, specs, 2), byCol = {}; for (const o of P) byCol[o.color] = o;   // gap 2: dots well spread
      const IN = render(H, W, P), out = IN.map(r => r.slice());
      for (let i = 0; i < order.length - 1; i++) { const a = byCol[order[i]], b = byCol[order[i + 1]]; for (const [r, c] of bres(a.r, a.c, b.r, b.c)) if (!out[r][c]) out[r][c] = 5; }   // grey polyline; crossings are grey-on-grey (order is unambiguous from the colours)
      for (const o of P) out[o.r][o.c] = o.color;   // dots stay on top
      return { in: IN, out }; } },

  connect_shape_pairs: { prior: "geometry", steps: 2, rule: "connect the two shapes of each colour with a straight line of that colour", concept: ["connect", "pairing", "line", "relational"],
    make(rng) { const K = rng.int(2, 3), H = rng.int(15, 19), W = rng.int(15, 19), cols = pick(rng, K, [2, 3, 4, 6, 8]), specs = [];
      for (const col of cols) for (let j = 0; j < 2; j++) specs.push({ cells: shapeCells(pick(rng, 1, ["square", "disc", "plus"])[0], 2), color: col, grp: col });
      const P = placeRoster(rng, H, W, specs), IN = render(H, W, P), out = IN.map(r => r.slice()), byCol = {};
      for (const o of P) (byCol[o.grp] = byCol[o.grp] || []).push(o);
      for (const col of cols) { const [a, b] = byCol[col]; for (const [r, c] of bres(a.r + 1, a.c + 1, b.r + 1, b.c + 1)) if (out[r][c] === 0) out[r][c] = col; }   // link the two same-colour shapes; only fill empty cells
      return { in: IN, out }; } },

  point_select: { prior: "object", steps: 2, rule: "recolour the shape the pointer points at (along its direction); leave the others unchanged", concept: ["pointing", "selection", "direction", "arrow"],
    make(rng) { const H = rng.int(16, 20), W = rng.int(16, 20), S = pointerScene(rng, H, W);
      const tgt = S.place(true); if (!tgt) throw new Error("point_select: no on-ray target"); S.mark(tgt.cells, tgt.r, tgt.c);
      const objs = [S.arrow, { cells: tgt.cells, r: tgt.r, c: tgt.c, color: pick(rng, 1, [2, 3, 4, 6, 8])[0], target: true }];
      const nD = rng.int(1, 3); for (let i = 0; i < nD; i++) { const d = S.place(false); if (d) { S.mark(d.cells, d.r, d.c); objs.push({ cells: d.cells, r: d.r, c: d.c, color: pick(rng, 1, [2, 3, 4, 6, 8])[0] }); } }
      const IN = render(H, W, objs); return { in: IN, out: render(H, W, objs.map(o => o.target ? { ...o, color: 7 } : o)) }; } },

  point_ray: { prior: "geometry", steps: 2, rule: "the pointer emits a beam in its direction; the beam travels until it hits a shape", concept: ["pointing", "ray", "beam", "emission"],
    make(rng) { const H = rng.int(16, 20), W = rng.int(16, 20), S = pointerScene(rng, H, W);
      const tgt = S.place(true); if (!tgt) throw new Error("point_ray: no on-ray target"); S.mark(tgt.cells, tgt.r, tgt.c);
      const objs = [S.arrow, { cells: tgt.cells, r: tgt.r, c: tgt.c, color: pick(rng, 1, [2, 3, 6, 8])[0] }];
      const nD = rng.int(0, 2); for (let i = 0; i < nD; i++) { const d = S.place(false); if (d) { S.mark(d.cells, d.r, d.c); objs.push({ cells: d.cells, r: d.r, c: d.c, color: pick(rng, 1, [2, 3, 6, 8])[0] }); } }
      const IN = render(H, W, objs), out = IN.map(r => r.slice());
      for (const [r, c] of S.rayCells) { if (IN[r][c]) break; out[r][c] = 4; }   // beam (yellow) from the tip to the first shape it hits
      return { in: IN, out }; } },

  count_arrows: { prior: "number", steps: 2, rule: "count the pointers that point up; show the count as a vertical tally", concept: ["pointing", "counting", "direction", "arrow"],
    make(rng) { const H = rng.int(16, 20), W = rng.int(16, 20), K = rng.int(3, 6), nUp = rng.int(1, Math.min(4, K)), others = ["down", "left", "right", "ne", "nw", "se", "sw"];
      const dirs = []; for (let i = 0; i < nUp; i++) dirs.push("up"); for (let i = nUp; i < K; i++) dirs.push(pick(rng, 1, others)[0]);
      const specs = shuffle(rng, dirs).map(d => ({ cells: pointerCells(d, rng.int(2, 3), pointerStyleFor(rng, d)), color: pick(rng, 1, [2, 3, 4, 6, 8])[0] }));
      const P = placeRoster(rng, H, W, specs), IN = render(H, W, P);
      const g = blank(H, W); for (let i = 0; i < nUp; i++) g[i * 2][0] = 5; return { in: IN, out: C.cropToContent(g) }; } },   // small human-shaped grey tally

  maze_path: { prior: "geometry", steps: 2, rule: "trace the shortest path from the green start to the red goal through the maze", concept: ["maze", "pathfinding", "spatial", "path"],
    make(rng) { const sz = pick(rng, 1, [13, 15, 17])[0], m = M.genMaze(rng, sz, sz, M.ALGOS[rng.int(0, M.ALGOS.length - 1)]);   // size + algorithm vary per example → learn pathfinding, not one maze texture
      return { in: M.renderMaze(m, 0), out: M.renderMaze(m, Infinity) }; } },

  cast_shadow: { prior: "geometry", steps: 2, rule: "the light casts a shadow behind every object (the cells the light cannot reach)", concept: ["light", "shadow", "occlusion", "optics"],
    make(rng) { const H = rng.int(14, 18), W = rng.int(14, 18), gap = 1, side = rng.int(0, 3);
      const L = side === 0 ? [0, rng.int(0, W - 1)] : side === 1 ? [H - 1, rng.int(0, W - 1)] : side === 2 ? [rng.int(0, H - 1), 0] : [rng.int(0, H - 1), W - 1];
      const occ = blank(H, W); occ[L[0]][L[1]] = 1;
      const mark = (cells, r, c) => { for (const [dr, dc] of cells) { const rr = r + dr, cc = c + dc; if (rr >= 0 && cc >= 0 && rr < H && cc < W) occ[rr][cc] = 1; } };
      const free = (cells, r, c) => { for (const [dr, dc] of cells) { const rr = r + dr, cc = c + dc; if (rr < 0 || cc < 0 || rr >= H || cc >= W) return false; for (let a = -gap; a <= gap; a++) for (let b = -gap; b <= gap; b++) { const nr = rr + a, nc = cc + b; if (nr >= 0 && nc >= 0 && nr < H && nc < W && occ[nr][nc]) return false; } } return true; };
      const occluders = [], K = rng.int(1, 3);
      for (let i = 0; i < K; i++) for (let t = 0; t < 200; t++) { const s = rng.int(2, 3), cells = shapeCells(pick(rng, 1, ["square", "disc"])[0], s), [bh, bw] = bbox(cells), r = rng.int(1, Math.max(1, H - bh - 1)), c = rng.int(1, Math.max(1, W - bw - 1)); if (free(cells, r, c)) { mark(cells, r, c); occluders.push({ cells, r, c, color: pick(rng, 1, [2, 3, 6, 8])[0] }); break; } }
      const blocked = blank(H, W); for (const o of occluders) for (const [dr, dc] of o.cells) blocked[o.r + dr][o.c + dc] = 1;
      const IN = blank(H, W); IN[L[0]][L[1]] = 4; for (const o of occluders) stamp(IN, o.cells, o.r, o.c, o.color);   // light = yellow(4)
      const out = IN.map(r => r.slice());
      for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) { if (IN[r][c]) continue; const line = bres(r, c, L[0], L[1]); let sh = false;
        for (let k = 1; k < line.length - 1; k++) { if (blocked[line[k][0]][line[k][1]]) { sh = true; break; } } if (sh) out[r][c] = 5; }   // shadow = grey(5)
      return { in: IN, out }; } },

  // ---- 2026-06-23 (Mario): morph (objects exchange shapes) + replicant (a per-object function, fixed by colour) ----
  morph_swap: { prior: "object", steps: 2, rule: "the two objects exchange shapes; each keeps its own colour and position", concept: ["morph", "swap", "shape-exchange", "correspondence"],
    make(rng) { const H = rng.int(13, 17), W = rng.int(13, 17), s = rng.int(3, 4), kinds = pick(rng, 2, ["square", "plus", "Lshape", "Tshape", "triangle"]), cols = pick(rng, 2, [2, 3, 4, 6, 8]);
      const sh0 = shapeCells(kinds[0], s), sh1 = shapeCells(kinds[1], s);   // all these have an s×s bbox → reserving rectCells(s,s) keeps the gap after the swap
      const specs = [{ cells: rectCells(s, s), shape: sh0, other: sh1, color: cols[0] }, { cells: rectCells(s, s), shape: sh1, other: sh0, color: cols[1] }];
      const P = placeRoster(rng, H, W, specs);
      return { in: render(H, W, P.map(o => ({ ...o, cells: o.shape }))), out: render(H, W, P.map(o => ({ ...o, cells: o.other }))) }; } },

  replicant: { prior: "object", steps: 2, rule: "each object is transformed by a function fixed by its colour (one colour's shapes mirror left-right, another's flip top-bottom)", concept: ["replicant", "per-colour-function", "dispatch", "analogy"],
    make(rng) { const H = rng.int(15, 19), W = rng.int(15, 19), cols = pick(rng, 2, [2, 3, 4, 6, 8]), K = rng.int(3, 5), kinds = ["Lshape", "triangle", "notch"];   // asymmetric only (a T flipped left-right is invisible → undoable)
      const tf = shuffle(rng, [c => flipHcells(c), c => flipVcells(c), c => flipHcells(flipVcells(c))]).slice(0, 2), fn = { [cols[0]]: tf[0], [cols[1]]: tf[1] };
      const specs = []; for (let i = 0; i < K; i++) { const sh = shapeCells(kinds[rng.int(0, 2)], rng.int(3, 4)), [bh, bw] = bbox(sh); specs.push({ cells: rectCells(bh, bw), shape: sh, color: cols[rng.int(0, 1)] }); }
      if (!specs.some(o => o.color === cols[0])) specs[0].color = cols[0]; if (!specs.some(o => o.color === cols[1])) specs[1].color = cols[1];
      const ckey = c => c.map(([r, x]) => r + "," + x).sort().join(";");
      for (const o of specs) if (ckey(o.shape) === ckey(fn[o.color](o.shape))) throw new Error("replicant: invisible transform (undoable)");   // every transform MUST visibly change the shape
      const P = placeRoster(rng, H, W, specs);   // reserve the full bbox → the per-colour flip keeps the gap
      return { in: render(H, W, P.map(o => ({ ...o, cells: o.shape }))), out: render(H, W, P.map(o => ({ ...o, cells: fn[o.color](o.shape) }))) }; } },

  // ---- 2026-06-23 (Mario): SUB-OBJECT families — objects have internal structure (a core / pattern), not just plain. ----
  extract_by_core: { prior: "object", steps: 2, rule: "keep only the object whose central core is red; remove the others", concept: ["subobject", "core", "selection", "relational"],
    make(rng) { const K = rng.int(3, 5), H = rng.int(16, 20), W = rng.int(16, 20), body = pick(rng, 1, [1, 5, 8])[0];
      const cores = pick(rng, K, [3, 4, 6, 7, 9].filter(c => c !== body)), specs = [];
      for (let i = 0; i < K; i++) specs.push({ cells: shapeCells(pick(rng, 1, ["square", "diamond", "plus"])[0], rng.int(4, 5)), color: body, skin: "core", accent: cores[i] });   // size>=4 so the core reads clearly
      specs[rng.int(0, K - 1)].accent = 2;   // exactly one red core = the target
      const reds = specs.filter(o => o.accent === 2); for (let i = 1; i < reds.length; i++) reds[i].accent = pick(rng, 1, [3, 4, 6, 7])[0];
      const P = placeRoster(rng, H, W, specs);
      return { in: renderSkinned(H, W, P), out: renderSkinned(H, W, P.filter(o => o.accent === 2)) }; } },

  odd_skin_out: { prior: "object", steps: 2, rule: "all objects share the same internal pattern except one; recolour the odd one yellow", concept: ["subobject", "odd-one-out", "pattern"],
    make(rng) { const K = rng.int(3, 4), H = rng.int(16, 20), W = rng.int(16, 20), body = pick(rng, 1, [1, 5, 8])[0], accent = pick(rng, 1, [3, 6, 7].filter(c => c !== body))[0], s = rng.int(4, 5);
      const styles = ["plain", "core", "border", "cross", "stripe"], sq = shapeCells("square", s), pat = sk => JSON.stringify(skinnedCells(sq, sk, body, accent));
      let major = pick(rng, 1, styles)[0], odd = pick(rng, 1, styles)[0], tries = 0;
      while (pat(odd) === pat(major) && tries++ < 30) odd = pick(rng, 1, styles)[0];   // GUARD: the odd skin must RENDER differently from the major (core==border on a 3x3 was the bug; size>=4 + this guard fixes it)
      if (pat(odd) === pat(major)) throw new Error("odd_skin_out: no distinct odd skin");
      const specs = []; for (let i = 0; i < K; i++) specs.push({ cells: shapeCells("square", s), color: body, skin: major, accent, odd: false });
      specs.push({ cells: shapeCells("square", s), color: body, skin: odd, accent, odd: true });
      const P = placeRoster(rng, H, W, specs);
      return { in: renderSkinned(H, W, P), out: renderSkinned(H, W, P.map(o => o.odd ? { ...o, skin: null, color: 4 } : o)) }; } },

  // ---- 2026-06-24 (Mario): FRACTAL continuation — self-similar growth (pseudo-natural motifs). ----
  fractal_continue: { prior: "geometry", steps: 2, rule: "the output is the input with every coloured cell replaced by a copy of the whole input (one fractal/self-similar step)", concept: ["fractal", "self-similarity", "recursion", "continuation", "pattern"],
    make(rng) {
      const MOTIFS = [
        [[0, 1, 0], [1, 1, 1], [0, 1, 0]],   // plus
        [[1, 0, 1], [0, 1, 0], [1, 0, 1]],   // X
        [[1, 1, 1], [1, 0, 1], [1, 1, 1]],   // ring → Sierpinski-carpet
        [[1, 0, 0], [1, 1, 0], [1, 1, 1]],   // triangle
        [[1, 1, 0], [0, 1, 1], [0, 0, 1]],   // diagonal stair
        [[1, 1, 1], [0, 1, 0], [0, 1, 0]],   // T
        [[1, 0, 1], [1, 1, 1], [1, 0, 1]],   // H
        [[0, 1, 0], [1, 1, 1], [1, 0, 1]],   // sprout (pseudo-natural)
      ];
      const M = MOTIFS[rng.int(0, MOTIFS.length - 1)], color = pick(rng, 1, [2, 3, 4, 6, 8])[0];
      const it2 = blank(9, 9);
      for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) if (M[r][c]) for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) if (M[a][b]) it2[r * 3 + a][c * 3 + b] = color;   // each filled cell → the whole motif
      const colorize = g => g.map(row => row.map(x => x ? color : 0));
      return { in: colorize(M), out: it2 }; } },   // IN 3×3 motif → OUT 9×9 motif-of-motif (continue the fractal)

  greek_key_frieze: { prior: "geometry/pattern", steps: 3, rule: "continue the ornamental border by repeating the learned Greek-key motif across the empty slots", concept: ["pattern", "frieze", "continuation", "ancient-greek", "periodicity"],
    variation: { vary: ["motif family", "motif colour", "number of visible repeats"], invariant: ["same motif repeats left-to-right", "blank slots are completed by the motif", "motif geometry is preserved"] },
    make(rng) {
      const motifs = [
        [[1,1,1,1],[1,0,0,0],[1,1,1,0]],
        [[1,1,0,0],[0,1,0,0],[0,1,1,1]],
        [[1,0,1,1],[1,1,1,0],[1,1,0,1]],
        [[1,1,1,0],[0,0,1,0],[0,1,1,1]],
      ];
      const M0 = motifs[rng.int(0, motifs.length - 1)], M1 = rng.int(0, 1) ? M0 : M0.map(row => row.slice().reverse());
      const col = pick(rng, 1, [2, 3, 4, 6, 8])[0], H = 7, W = 19, IN = blank(H, W), out = blank(H, W), shown = rng.int(2, 3);
      for (let k = 0; k < 4; k++) for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) if (M1[r][c]) out[2 + r][1 + k * 4 + c] = col;
      for (let k = 0; k < shown; k++) for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) if (M1[r][c]) IN[2 + r][1 + k * 4 + c] = col;
      for (let c = 0; c < W; c++) { IN[0][c] = 5; IN[H - 1][c] = 5; out[0][c] = 5; out[H - 1][c] = 5; }
      return { in: IN, out };
    } },

  empty_structure_complete: { prior: "geometry/topology", steps: 3, rule: "complete the missing bars of an empty scaffold so every open rectangle becomes a closed frame", concept: ["empty-structure", "skeleton", "completion", "topology"],
    variation: { vary: ["scaffold width", "scaffold height", "missing side positions", "line colour"], invariant: ["objects are empty frames, not filled blocks", "missing frame bars are restored", "interior stays empty"] },
    make(rng) {
      const H = 16, W = 22, col = pick(rng, 1, [2, 3, 4, 6, 8])[0], out = blank(H, W), IN = blank(H, W);
      const boxes = [
        { r: 2, c: 2, h: rng.int(4, 5), w: rng.int(5, 7), miss: "right" },
        { r: 2, c: 12, h: rng.int(4, 5), w: rng.int(5, 7), miss: "bottom" },
        { r: 9, c: rng.int(5, 8), h: rng.int(4, 5), w: rng.int(7, 9), miss: "left" },
      ];
      const draw = (g, b, skip) => {
        for (let c = b.c; c < b.c + b.w; c++) { if (skip !== "top") g[b.r][c] = col; if (skip !== "bottom") g[b.r + b.h - 1][c] = col; }
        for (let r = b.r; r < b.r + b.h; r++) { if (skip !== "left") g[r][b.c] = col; if (skip !== "right") g[r][b.c + b.w - 1] = col; }
      };
      for (const b of boxes) { draw(out, b, null); draw(IN, b, b.miss); }
      return { in: IN, out };
    } },

  skin_core_dispatch: { prior: "object/skin/dispatch", steps: 4, rule: "the internal core colour chooses the operation: red-core objects mirror, blue-core objects flip, other objects stay still", concept: ["subobject", "core", "dispatch", "compositionality", "skin"],
    variation: { vary: ["outer shape", "core colour", "body colour", "layout"], invariant: ["red core = left-right mirror", "blue core = top-bottom flip", "non-red/non-blue core = unchanged", "skin/core remains visible"] },
    make(rng) {
      const H = 22, W = 26, body = pick(rng, 1, [5, 8, 9])[0], cores = shuffle(rng, [2, 1, 4, 6]).slice(0, 4);
      const shapePool = ["notch", "bump", "triangle"];
      const specs = cores.map(core => {
        let shape = null;
        for (let t = 0; t < 20 && !shape; t++) {
          const cand = shapeCells(pick(rng, 1, shapePool)[0], 4);
          const hasCore = skinnedCells(cand, "core", body, core).some(x => x[2] === core);
          const hCore = skinnedCells(flipHcells(cand), "core", body, core).some(x => x[2] === core);
          const vCore = skinnedCells(flipVcells(cand), "core", body, core).some(x => x[2] === core);
          if (!hasCore || !hCore || !vCore) continue;
          if (core === 2 && sameCells(cand, flipHcells(cand))) continue;
          if (core === 1 && sameCells(cand, flipVcells(cand))) continue;
          shape = cand;
        }
        if (!shape) throw new Error("skin_core_dispatch: no visible transform shape");
        const [h, w] = bbox(shape);
        return { cells: rectCells(h, w), shape, color: body, skin: "core", accent: core, core };
      });
      const P = placeRoster(rng, H, W, specs);
      const tf = o => o.core === 2 ? flipHcells(o.shape) : o.core === 1 ? flipVcells(o.shape) : o.shape;
      return {
        in: renderSkinned(H, W, P.map(o => ({ ...o, cells: o.shape }))),
        out: renderSkinned(H, W, P.map(o => ({ ...o, cells: tf(o) }))),
      };
    } },

  traffic_light_lanes: { prior: "society/game/physics", steps: 3, rule: "cars in green-light lanes move forward; cars in red-light lanes stay stopped", concept: ["traffic-light", "social-prior", "motion", "conditional"],
    make(rng) { const H = 15, W = 24, g = blank(H, W), out = blank(H, W);
      const rows = [4, 10], lights = shuffle(rng, [3, 2]), step = rng.int(4, 6), cols = pick(rng, 2, [6, 7, 8, 9]);
      for (let i = 0; i < 2; i++) { const r = rows[i]; for (let c = 1; c < W - 1; c++) { g[r][c] = 5; out[r][c] = 5; } g[r - 1][2] = lights[i]; out[r - 1][2] = lights[i]; }
      rows.forEach((r, i) => { const car = [[0,0],[0,1],[1,0],[1,1],[1,2]], c = i ? rng.int(5, 10) : rng.int(9, 14), nc = c + (lights[i] === 3 ? step : 0); stamp(g, car, r - 2, c, cols[i]); stamp(out, car, r - 2, nc, cols[i]); });
      return { in: g, out }; } },

  traffic_turn_signal: { prior: "society/game/physics", steps: 4, rule: "at the crossing, only the car whose traffic signal is green turns into the open road; red-signal cars remain", concept: ["traffic-light", "turning", "intersection", "conditional-motion"],
    make(rng) { const H = 17, W = 17, g = blank(H, W), out = blank(H, W);
      for (let i = 1; i < 16; i++) { g[8][i] = 5; out[8][i] = 5; g[i][8] = 5; out[i][8] = 5; }
      const verticalGreen = rng.int(0, 1) === 1, vLight = verticalGreen ? 3 : 2, hLight = verticalGreen ? 2 : 3;
      g[2][6] = vLight; out[2][6] = vLight; g[10][2] = hLight; out[10][2] = hLight;
      const car = [[0,0],[0,1],[1,0],[1,1]], cols = pick(rng, 2, [6, 7, 8, 9]);
      const vCar = { r: rng.int(2, 4), c: 8, color: cols[0] }, hCar = { r: 8, c: rng.int(2, 4), color: cols[1] };
      stamp(g, car, vCar.r, vCar.c, vCar.color); stamp(g, car, hCar.r, hCar.c, hCar.color);
      stamp(out, car, verticalGreen ? rng.int(10, 12) : vCar.r, verticalGreen ? rng.int(10, 12) : vCar.c, vCar.color);
      stamp(out, car, verticalGreen ? hCar.r : rng.int(10, 12), verticalGreen ? hCar.c : rng.int(9, 11), hCar.color);
      return { in: g, out }; } },

  pedestrian_crosswalk: { prior: "society/school/game", steps: 3, rule: "walkers cross only when their crosswalk signal is green; red-signal walkers wait", concept: ["crosswalk", "social-prior", "conditional-motion", "agents"],
    make(rng) { const H = 14, W = 22, g = blank(H, W), out = blank(H, W), greenTop = rng.int(0, 1) === 1;
      for (let c = 2; c < W - 2; c += 2) { g[6][c] = 5; g[7][c] = 5; out[6][c] = 5; out[7][c] = 5; }
      const cols = pick(rng, 2, [6, 7, 8, 9]);
      const walkers = [{ r: 2 + rng.int(0, 1), c: rng.int(3, 7), col: cols[0], sig: greenTop ? 3 : 2, dr: 6 }, { r: 10, c: rng.int(13, 18), col: cols[1], sig: greenTop ? 2 : 3, dr: -6 }];
      for (const w of walkers) { g[w.r][w.c] = w.col; g[w.r + 1][w.c] = w.col; g[w.r][w.c - 2] = w.sig; out[w.r][w.c - 2] = w.sig; const rr = w.sig === 3 ? w.r + w.dr : w.r; out[rr][w.c] = w.col; out[rr + 1][w.c] = w.col; }
      return { in: g, out }; } },

  conveyor_color_gate: { prior: "game/physics", steps: 4, rule: "objects ride the conveyor only through the gate with the same colour; mismatched objects stop before the gate", concept: ["conveyor", "gate", "colour-match", "motion"],
    make(rng) { const H = 12, W = 24, g = blank(H, W), out = blank(H, W), gate = pick(rng, 1, [2, 3, 6, 8])[0];
      for (let c = 1; c < W - 1; c++) { g[6][c] = 5; out[6][c] = 5; } g[5][13] = gate; g[7][13] = gate; out[5][13] = gate; out[7][13] = gate;
      const objs = [{ c: 3, color: gate }, { c: 7, color: pick(rng, 1, [2, 3, 6, 8].filter(c => c !== gate))[0] }];
      for (const o of objs) { const cells = [[0,0],[0,1],[1,0],[1,1]], dest = o.color === gate ? o.c + 12 : 11; stamp(g, cells, 4, o.c, o.color); stamp(out, cells, 4, dest, o.color); }
      return { in: g, out }; } },

  gravity_stack_collision: { prior: "object/physics", steps: 4, rule: "every falling object drops until any part of it collides with the floor or with any already-settled object below it", concept: ["gravity", "collision", "stacking", "support"],
    make(rng) { const H = 20, W = 22, floorR = 18, cols = pick(rng, 5, [2, 3, 6, 7, 8, 9]), g = blank(H, W), out = blank(H, W);
      for (let c = 1; c < W - 1; c++) { g[floorR][c] = 5; out[floorR][c] = 5; }
      const baseC = rng.int(5, 8), span = rng.int(3, 5);
      const objs = [
        { cells: rectCells(2, span + 1), r: rng.int(10, 12), c: baseC, color: cols[0] },
        { cells: rectCells(2, span), r: rng.int(5, 7), c: baseC + rng.int(0, 1), color: cols[1] },
        { cells: rectCells(2, 2), r: rng.int(1, 3), c: baseC + rng.int(1, Math.max(1, span - 1)), color: cols[2] },
        { cells: rectCells(2, rng.int(2, 3)), r: rng.int(3, 8), c: rng.int(1, 3), color: cols[3] },
        { cells: rectCells(1, rng.int(4, 6)), r: rng.int(1, 5), c: baseC + span + rng.int(3, 5), color: cols[4] },
      ];
      const occupied = blank(H, W);
      for (let c = 1; c < W - 1; c++) occupied[floorR][c] = 1;
      const canPlace = (o, rr) => o.cells.every(([dr, dc]) => {
        const r = rr + dr, c = o.c + dc;
        return r >= 0 && c >= 0 && r < H && c < W && !occupied[r][c];
      });
      const wouldHitBelow = (o, rr) => !canPlace(o, rr + 1);
      const settled = [];
      for (const o of objs) stamp(g, o.cells, o.r, o.c, o.color);
      for (const o of objs.slice().sort((a, b) => (b.r + bbox(b.cells)[0]) - (a.r + bbox(a.cells)[0]))) {
        let rr = o.r;
        while (canPlace(o, rr + 1)) rr++;
        if (!wouldHitBelow(o, rr)) throw new Error("gravity_stack_collision: no support collision");
        for (const [dr, dc] of o.cells) occupied[rr + dr][o.c + dc] = 1;
        settled.push({ ...o, r: rr });
      }
      return { in: g, out: render(H, W, settled.concat([{ cells: lineCells(W - 2, false), r: floorR, c: 1, color: 5 }])) }; } },

  rotation_symbol_apply: { prior: "rule-encoding/geometry", steps: 4, rule: "the symbol beside each object encodes the transform: red means rotate 90 degrees, blue means mirror, green means rotate 180", concept: ["symbol", "rotation", "mirror", "program", "rule-encoding"],
    make(rng) { const H = 18, W = 24, g = blank(H, W), out = blank(H, W), codes = shuffle(rng, [2, 1, 3]), cols = pick(rng, 3, [6, 7, 8, 9]);
      codes.forEach((code, i) => { const shape = shapeCells(pick(rng, 1, ["Lshape", "notch", "bump"])[0], 4), r = 3 + i * 5, c = 4 + (i % 2) * 7; g[r][c - 2] = code; out[r][c - 2] = code; stamp(g, shape, r, c, cols[i]); const tf = code === 2 ? rot90cells(shape) : code === 1 ? flipHcells(shape) : rot180cells(shape); stamp(out, tf, r, c, cols[i]); });
      return { in: g, out }; } },

  compass_move_program: { prior: "rule-encoding/geometry", steps: 4, rule: "embedded compass marks encode object movement: up, right, down, left", concept: ["movement", "program", "compass", "object-motion", "rule-encoding"],
    make(rng) { const H = 20, W = 26, g = blank(H, W), out = blank(H, W);
      const dirs = shuffle(rng, [[-5,0,1],[0,6,2],[5,0,3],[0,-6,4]]).slice(0, 3);
      const bodies = pick(rng, 3, [6, 7, 8, 9, 5]), shapePool = ["square", "notch", "bump", "triangle"];
      const occIn = blank(H, W), occOut = blank(H, W);
      const markCell = cells => {
        const [h, w] = bbox(cells), cr = Math.floor(h / 2), cc = Math.floor(w / 2);
        return cells.slice().sort((a, b) => Math.abs(a[0] - cr) + Math.abs(a[1] - cc) - (Math.abs(b[0] - cr) + Math.abs(b[1] - cc)))[0];
      };
      const free = (occ, cells, r, c) => cells.every(([dr, dc]) => {
        const rr = r + dr, cc = c + dc;
        if (rr < 0 || cc < 0 || rr >= H || cc >= W) return false;
        for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
          const nr = rr + a, nc = cc + b;
          if (nr >= 0 && nc >= 0 && nr < H && nc < W && occ[nr][nc]) return false;
        }
        return true;
      });
      const reserve = (occ, cells, r, c) => { for (const [dr, dc] of cells) occ[r + dr][c + dc] = 1; };
      const drawMarked = (grid, o, r, c) => {
        stamp(grid, o.cells, r, c, o.body);
        grid[r + o.mark[0]][c + o.mark[1]] = o.code;
      };
      const objs = [];
      for (let i = 0; i < dirs.length; i++) {
        const [dr, dc, code] = dirs[i];
        const cells = shapeCells(pick(rng, 1, shapePool)[0], rng.int(3, 4)), [h, w] = bbox(cells), mark = markCell(cells);
        let placed = null;
        for (let t = 0; t < 500 && !placed; t++) {
          const r = rng.int(Math.max(0, -dr), Math.min(H - h - 1, H - h - 1 - dr));
          const c = rng.int(Math.max(0, -dc), Math.min(W - w - 1, W - w - 1 - dc));
          if (!free(occIn, cells, r, c)) continue;
          if (!free(occOut, cells, r + dr, c + dc)) continue;
          placed = { cells, mark, r, c, dr, dc, code, body: bodies[i] };
          reserve(occIn, cells, r, c);
          reserve(occOut, cells, r + dr, c + dc);
        }
        if (!placed) throw new Error("compass_move_program: placement failed");
        objs.push(placed);
      }
      for (const o of objs) { drawMarked(g, o, o.r, o.c); drawMarked(out, o, o.r + o.dr, o.c + o.dc); }
      return { in: g, out }; } },

  fractal_quadrant_expand: { prior: "geometry/fractal", steps: 3, rule: "replace every coloured cell of a 2x2 seed with a coloured copy of the whole seed", concept: ["fractal", "recursion", "self-similarity", "expansion"],
    make(rng) { const cols = shuffle(rng, [2, 3, 6, 8]), seed = [[cols[0], 0], [cols[1], cols[2]]], out = blank(4, 4);
      if (rng.int(0, 1)) seed[0][1] = cols[3];
      for (let r = 0; r < 2; r++) for (let c = 0; c < 2; c++) if (seed[r][c]) for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) if (seed[a][b]) out[r * 2 + a][c * 2 + b] = seed[r][c];
      return { in: seed, out }; } },

  fractal_branch_growth: { prior: "geometry/fractal/nature", steps: 4, rule: "grow a plant-like branch by replacing each branch tip with a smaller fork", concept: ["fractal", "tree", "nature-prior", "growth"],
    make(rng) { const H = 13, W = 13, col = pick(rng, 1, [3, 6, 8, 9])[0], g = blank(H, W), out = blank(H, W), base = rng.int(5, 7), top = rng.int(6, 7), bottom = rng.int(10, 11);
      for (let r = top + 1; r <= bottom; r++) { g[r][base] = col; out[r][base] = col; }
      const spread = rng.int(1, 2);
      g[top][base - spread] = col; g[top][base + spread] = col;
      for (const [r, c] of [[top, base - spread], [top, base + spread]]) { out[r][c] = col; out[r - 1][c - 1] = col; out[r - 1][c + 1] = col; out[r - 2][c - 1] = col; out[r - 2][c + 1] = col; }
      return { in: g, out }; } },

  nested_frame_recursive: { prior: "geometry/fractal/topology", steps: 3, rule: "each frame grows an inner frame, preserving the hollow structure recursively", concept: ["fractal", "nested-frame", "topology", "recursion"],
    make(rng) { const H = 13, W = 13, col = pick(rng, 1, [2, 3, 6, 8])[0], g = blank(H, W), out = blank(H, W), s = rng.int(8, 10), r0 = Math.floor((H - s) / 2), c0 = Math.floor((W - s) / 2);
      const drawFrame = (grid, r, c, h, w) => { for (let x = c; x < c + w; x++) { grid[r][x] = col; grid[r + h - 1][x] = col; } for (let y = r; y < r + h; y++) { grid[y][c] = col; grid[y][c + w - 1] = col; } };
      drawFrame(g, r0, c0, s, s); drawFrame(out, r0, c0, s, s); drawFrame(out, r0 + 2, c0 + 2, s - 4, s - 4);
      return { in: g, out }; } },

  // ---- 2026-06-24 (Mario): COMPOSITIONAL physics — remove the support, the structure above collapses. ----
  collapse_support: { prior: "object/physics", steps: 4, rule: "remove the red keystone from a block structure; unsupported upper blocks collapse downward while grounded base blocks remain", concept: ["composition", "support", "gravity", "removal", "causality", "structure"],
    make(rng) { const H = 18, W = 20, cols = pick(rng, 5, [3, 4, 6, 7, 8, 9]), left = rng.int(0, 1) === 1;
      const base = [
        { cells: rectCells(2, 3), r: 14, c: 3, color: cols[0] },
        { cells: rectCells(2, 3), r: 14, c: 14, color: cols[1] },
      ];
      const kc = left ? 6 : 11, key = { cells: rectCells(2, 3), r: 12, c: kc, color: 2 };
      const upper = [
        { cells: rectCells(2, 3), r: 10, c: kc, color: cols[2] },
        { cells: rectCells(1, 9), r: 8, c: 5, color: cols[3] },
        { cells: rectCells(2, 2), r: 6, c: 8, color: cols[4] },
      ];
      const fallen = upper.map((o, i) => ({ ...o, r: [12, 10, 8][i] }));
      return { in: render(H, W, [...base, key, ...upper]), out: render(H, W, [...base, ...fallen]) }; } },
};

function buildFamilyTask(famKey, rng, nEx) {
  const fam = FAMILIES[famKey], examples = [];
  for (let i = 0; i < nEx; i++) { const p = fam.make(rng); examples.push({ in: [p.in], out: [p.out] }); }
  const test = fam.make(rng), width = test.in[0].length, height = test.in.length;
  const id = "P-" + crypto.createHash("sha1").update(JSON.stringify([examples, test])).digest("hex").slice(0, 8);
  // difficulty proxy: family step-count + #objects + baseline-hard, in [0,1]. (Honest: a proxy, not model-based IFD.)
  const nobj = examples[0].out[0].flat().filter(x => x).length;   // crude
  const diff = Math.min(1, 0.4 + 0.2 * (fam.steps - 1) + 0.04 * Math.min(6, nEx + 2));
  return {
    format: "prodigy-task", version: 1, width, height, palette: "arc10", fps: 1, examples, in: [test.in], out: [test.out],
    meta: { id, rule: fam.rule, language_description: fam.rule, concepts: fam.concept, prior: fam.prior, difficulty: +diff.toFixed(2), depth: fam.steps, template: "prog:" + famKey, source: "program-first", variation: fam.variation, generator_code: fam.make ? fam.make.toString() : null, compiled_dsl: null, n_examples: nEx, teaching: { ok: true, coherent: true, examplesVary: true } },
  };
}

// program-first VIDEO of a pointer launching a ray: IN = arrow + target (+ distractors); OUT = the beam growing one
// cell per frame from the tip until it hits the target. Crisp 8-way arrows (same as point_ray), per-example variation
// from random direction/position → non-constant. base seeds the rng so it is deterministic for the gen loop.
function buildBeamVideo(base, nEx) {
  const rng = E.makeRng(base * 2654435761 + 17), H = rng.int(14, 18), W = rng.int(17, 22);
  const one = () => { const S = pointerScene(rng, H, W); const tgt = S.place(true); if (!tgt) throw new Error("beam: no target"); S.mark(tgt.cells, tgt.r, tgt.c);
    const objs = [S.arrow, { cells: tgt.cells, r: tgt.r, c: tgt.c, color: pick(rng, 1, [2, 3, 6, 8])[0] }];
    const nD = rng.int(0, 2); for (let i = 0; i < nD; i++) { const d = S.place(false); if (d) { S.mark(d.cells, d.r, d.c); objs.push({ cells: d.cells, r: d.r, c: d.c, color: pick(rng, 1, [2, 3, 6, 8])[0] }); } }
    const base0 = render(H, W, objs), beam = []; for (const [r, c] of S.rayCells) { if (base0[r][c]) break; beam.push([r, c]); }
    const outFrames = []; let g = base0.map(r => r.slice()); for (const [r, c] of beam) { g = g.map(row => row.slice()); g[r][c] = 4; outFrames.push(g); }
    if (!outFrames.length) outFrames.push(base0.map(r => r.slice()));
    return { in: [base0], out: outFrames }; };
  const examples = []; for (let i = 0; i < nEx; i++) examples.push(one()); const test = one();
  const id = "BEAM-" + crypto.createHash("sha1").update(JSON.stringify([examples, test])).digest("hex").slice(0, 8);
  return { format: "prodigy-task", version: 1, width: W, height: H, palette: "arc10", fps: 2, examples, in: test.in, out: test.out,
    meta: { id, rule: "the pointer launches a beam that extends in its direction until it hits a shape", concepts: ["pointing", "ray", "beam", "emission", "video"], prior: "geometry/physics", difficulty: 0.5, template: "phys:beam_video", source: "physics", dynamic: true, tier: "physics", n_examples: nEx, teaching: { ok: true, coherent: true, examplesVary: true } } };
}

// ACCELERATED maze-solving video: IN = unsolved maze (green start, red goal); OUT = the path drawn `stride` cells per
// frame (stride 2/3/5 → short video, not 60 frames). Algorithm varies per example so the model abstracts pathfinding.
function buildMazeVideo(base, nEx) {
  const rng = E.makeRng(base * 2654435761 + 29), sz = [13, 15, 17][rng.int(0, 2)], stride = [2, 3, 5][rng.int(0, 2)];
  const one = () => { const m = M.genMaze(rng, sz, sz, M.ALGOS[rng.int(0, M.ALGOS.length - 1)]);
    const out = []; for (let k = stride; k < m.path.length; k += stride) out.push(M.renderMaze(m, k)); out.push(M.renderMaze(m, Infinity));
    return { in: [M.renderMaze(m, 0)], out }; };
  const examples = []; for (let i = 0; i < nEx; i++) examples.push(one()); const test = one();
  const id = "MAZE-" + crypto.createHash("sha1").update(JSON.stringify([examples, test])).digest("hex").slice(0, 8);
  return { format: "prodigy-task", version: 1, width: sz % 2 ? sz : sz - 1, height: sz % 2 ? sz : sz - 1, palette: "arc10", fps: 4, examples, in: test.in, out: test.out,
    meta: { id, rule: "find the path from the green start to the red goal; the path is drawn step by step", concepts: ["maze", "pathfinding", "spatial", "video"], prior: "geometry/physics", difficulty: 0.6, template: "phys:maze_video", source: "physics", dynamic: true, tier: "physics", n_examples: nEx, teaching: { ok: true, coherent: true, examplesVary: true } } };
}

if (require.main === module) {
  const args = process.argv.slice(2), f = { n: 40, out: "out/hard.jsonl" };
  for (let i = 0; i < args.length; i++) { if (args[i] === "--n") f.n = +args[++i]; else if (args[i] === "-o") f.out = args[++i]; else if (args[i] === "--seed") f.seed = +args[++i]; }
  const fs = require("fs"), path = require("path"), keys = Object.keys(FAMILIES), rng = E.makeRng((f.seed || 1) * 2654435761 + 11);
  const out = [], seen = new Set(); let attempts = 0, trivialDrop = 0, errDrop = 0;
  while (out.length < f.n && attempts < f.n * 50) {
    attempts++;
    const fam = keys[rng.int(0, keys.length - 1)];
    let t; try { t = buildFamilyTask(fam, rng, rng.int(3, 4)); } catch (e) { errDrop++; continue; }
    if (B.trivialSolve(t)) { trivialDrop++; continue; }                 // baseline-hard filter
    if (seen.has(t.meta.id)) continue; seen.add(t.meta.id);
    out.push(t);
  }
  fs.mkdirSync(path.dirname(f.out) || ".", { recursive: true });
  fs.writeFileSync(f.out, out.map(t => JSON.stringify(t)).join("\n") + "\n");
  const byFam = {}, byPrior = {}; out.forEach(t => { const k = t.meta.template.replace("prog:", ""); byFam[k] = (byFam[k] || 0) + 1; byPrior[t.meta.prior] = (byPrior[t.meta.prior] || 0) + 1; });
  console.log(`gen_hard → ${f.out}  (${out.length} tasks · ${trivialDrop} trivial dropped · ${errDrop} errors · ${attempts} attempts)`);
  console.log("  families (" + keys.length + "): " + Object.entries(byFam).sort((a, b) => b[1] - a[1]).map(([k, v]) => k + ":" + v).join("  "));
  console.log("  PRIOR coverage: " + Object.entries(byPrior).map(([k, v]) => k + ":" + v).join("  "));
}
module.exports = { FAMILIES, buildFamilyTask, buildBeamVideo, buildMazeVideo };
