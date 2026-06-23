#!/usr/bin/env node
/* gen_hard.js — PROGRAM-FIRST hard-task generator (the Stage-0 seed engine of the archer pipeline).
 * We control EVERYTHING: clean NON-OVERLAPPING layout + a relational rule applied deterministically IN JS
 * (so OUT = rule(IN) exactly — no mislabel), tagged by the human core-knowledge PRIOR it teaches, filtered
 * baseline-hard (a dumb 1-step solver fails). Emits prodigy-task JSON, each with a stable ID + difficulty.
 *   node gen_hard.js --n 40 -o out/hard.jsonl                                                              */
const crypto = require("crypto");
const E = require("./engine.js"), B = require("./baseline.js"), C = require("./gen_count.js");

const bbox = cells => { let h = 0, w = 0; for (const [r, c] of cells) { if (r + 1 > h) h = r + 1; if (c + 1 > w) w = c + 1; } return [h, w]; };
const blank = (H, W) => Array.from({ length: H }, () => new Array(W).fill(0));
const stamp = (g, cells, r, c, col) => { for (const [dr, dc] of cells) { const rr = r + dr, cc = c + dc; if (rr >= 0 && cc >= 0 && rr < g.length && cc < g[0].length) g[rr][cc] = col; } };
const render = (H, W, objs) => { const g = blank(H, W); for (const o of objs) stamp(g, o.cells, o.r, o.c, o.color); return g; };
const shuffle = (rng, a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = rng.int(0, i);[a[i], a[j]] = [a[j], a[i]]; } return a; };
const pick = (rng, k, pool) => shuffle(rng, pool).slice(0, k);
const rectCells = (h, w) => { const o = []; for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) o.push([r, c]); return o; };
const lineCells = (n, vert) => { const o = []; for (let i = 0; i < n; i++) o.push(vert ? [i, 0] : [0, i]); return o; };
const size = o => o.cells.length;
const SOLID = ["square", "disc", "plus", "Lshape", "triangle"], HOLED = ["frame", "ring"];
const shapeCells = (kind, s) => kind === "frame" ? E.buildShape("frame", [s, s]) : E.buildShape(kind, [s]);
const flipHcells = cells => { const [, w] = bbox(cells); return cells.map(([r, c]) => [r, w - 1 - c]); };
const outlineCells = (h, w) => { const o = []; for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) if (r === 0 || c === 0 || r === h - 1 || c === w - 1) o.push([r, c]); return o; };

// gap-enforced placement (every object separated by >= 1 empty cell, so boundaries are always clear and
// same-colour objects never merge). Canonical impl lives in gen_count.js; reused here to stay in sync.
const placeRoster = C.placeRoster;
const RANKPAL = [2, 3, 4, 1, 8, 6];   // colours by ascending rank

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
    make(rng) { const H = rng.int(17, 21), W = rng.int(17, 21);
      const kinds = shuffle(rng, [HOLED[rng.int(0, 1)], HOLED[rng.int(0, 1)], SOLID[rng.int(0, 4)], SOLID[rng.int(0, 4)]]);
      const cols = pick(rng, 4, [2, 3, 4, 5, 6, 7, 8]);
      const specs = kinds.map((k, i) => ({ cells: shapeCells(k, rng.int(3, 5)), color: cols[i], holed: HOLED.includes(k) }));
      if (!specs.some(s => s.holed)) specs[0] = { cells: shapeCells("frame", 4), color: cols[0], holed: true };
      if (!specs.some(s => !s.holed)) specs[1] = { cells: shapeCells("square", 3), color: cols[1], holed: false };
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
  count_total: { prior: "number", steps: 2, rule: "count the shapes; show the total as a vertical, spaced, centred tally", concept: ["counting", "cardinality", "subitize"],
    make: rng => C.makeInstance(rng, { count_what: "total", orient: "v", spacing: "spaced", place: "center", mark: "match" }) },
  count_per_color: { prior: "number", steps: 2, rule: "count the shapes of each colour; show one vertical spaced tally per colour, colour-matched", concept: ["counting", "per-colour", "tally"],
    make: rng => C.makeInstance(rng, { count_what: "per_color", orient: "v", spacing: "spaced", place: "center", mark: "match" }) },
  count_per_kind: { prior: "number", steps: 2, rule: "count the shapes of each kind; show one vertical spaced tally per kind, colour-matched", concept: ["counting", "per-kind", "tally"],
    make: rng => C.makeInstance(rng, { count_what: "per_kind", orient: "v", spacing: "spaced", place: "center", mark: "match" }) },

  compare_more: { prior: "number", steps: 2, rule: "output a single block in the colour that has MORE shapes (red vs blue)", concept: ["comparison", "most", "counting"],
    make(rng) { const H = rng.int(18, 22), W = rng.int(18, 22);
      let nR = rng.int(2, 5), nB = rng.int(2, 5); while (nR === nB) nB = rng.int(2, 5);
      const specs = []; for (let i = 0; i < nR; i++) specs.push({ cells: shapeCells(SOLID[rng.int(0, 4)], 2), color: 2 });
      for (let i = 0; i < nB; i++) specs.push({ cells: shapeCells(SOLID[rng.int(0, 4)], 2), color: 1 });
      const P = placeRoster(rng, H, W, specs), IN = render(H, W, P), win = nR > nB ? 2 : 1;
      const out = blank(3, 3); for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) out[r][c] = win;   // small human-shaped answer block (PAN-158)
      return { in: IN, out }; } },

  inside_outside: { prior: "topology", steps: 2, rule: "recolour the shapes INSIDE the frame green and the shapes OUTSIDE it red; the frame stays", concept: ["containment", "inside-outside", "topology"],
    make(rng) { const H = rng.int(16, 20), W = rng.int(16, 20), gap = 1;
      const fr = Math.max(8, Math.floor(Math.min(H, W) * 0.55)), fc = fr;
      const fR = rng.int(0, H - fr - 1), fC = rng.int(0, W - fc - 1);
      const frameCells = E.buildShape("frame", [fr, fc]), occ = blank(H, W);
      const mark = (cells, r, c) => { for (const [dr, dc] of cells) { const rr = r + dr, cc = c + dc; if (rr >= 0 && cc >= 0 && rr < H && cc < W) occ[rr][cc] = 1; } };
      const free = (cells, r, c) => { for (const [dr, dc] of cells) { const rr = r + dr, cc = c + dc; if (rr < 0 || cc < 0 || rr >= H || cc >= W) return false; for (let a = -gap; a <= gap; a++) for (let b = -gap; b <= gap; b++) { const nr = rr + a, nc = cc + b; if (nr >= 0 && nc >= 0 && nr < H && nc < W && occ[nr][nc]) return false; } } return true; };
      mark(frameCells, fR, fC);
      const objs = [{ cells: frameCells, r: fR, c: fC, color: 5, frame: true }];
      const tryPlace = inside => { const s = rng.int(1, 2), cells = shapeCells("square", s);
        for (let t = 0; t < 120; t++) { let r, c;
          if (inside) { r = fR + 1 + rng.int(0, Math.max(0, fr - 2 - s)); c = fC + 1 + rng.int(0, Math.max(0, fc - 2 - s)); }
          else { r = rng.int(0, H - s - 1); c = rng.int(0, W - s - 1); if (r >= fR - 1 && r <= fR + fr && c >= fC - 1 && c <= fC + fc) continue; }
          if (free(cells, r, c)) { mark(cells, r, c); objs.push({ cells, r, c, color: [3, 4, 6, 7, 8][rng.int(0, 4)], inside }); return; } } };
      const nIn = rng.int(1, 2), nOut = rng.int(1, 3); for (let i = 0; i < nIn; i++) tryPlace(true); for (let i = 0; i < nOut; i++) tryPlace(false);
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
    make(rng) { const K = rng.int(3, 5), H = rng.int(16, 20), W = rng.int(16, 20);
      const sizes = pick(rng, K, [2, 3, 4, 5, 6]), cols = pick(rng, K, [3, 4, 1, 8, 6].filter(c => c !== 7));
      const specs = sizes.map((s, i) => ({ cells: shapeCells(["square", "disc", "plus"][rng.int(0, 2)], s), color: cols[i] }));
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

  // ---- PAN-157 breadth batch (2026-06-23): +11 families across all priors + a foundational physics bridge ----
  recolor_by_size_class: { prior: "number/object", steps: 2, rule: "recolour every small shape red and every large shape blue, by cell-count", concept: ["size", "threshold", "classification"],
    make(rng) { const H = rng.int(16, 20), W = rng.int(16, 20);
      const sides = shuffle(rng, [2, 2, 3, 4, 5, 3]).slice(0, rng.int(4, 6));
      if (!sides.includes(2)) sides[0] = 2; if (!sides.some(s => s >= 3)) sides[1] = 3;
      const cols = pick(rng, sides.length, [3, 4, 5, 6, 7, 8]);
      const specs = sides.map((s, i) => ({ cells: shapeCells("square", s), color: cols[i], big: s >= 3 }));
      const P = placeRoster(rng, H, W, specs), IN = render(H, W, P);
      return { in: IN, out: render(H, W, P.map(o => ({ ...o, color: o.big ? 1 : 2 }))) }; } },

  gravity_drop: { prior: "object/physics", steps: 2, rule: "every shape falls straight down until it rests on the floor", concept: ["gravity", "physics", "object-permanence"],
    make(rng) { const K = rng.int(3, 4), H = rng.int(13, 17), W = rng.int(16, 20), bandW = Math.floor(W / K), gap = 1;
      const cols = pick(rng, K, [2, 3, 4, 6, 8]), specs = [];   // distinct colours per band → adjacency on the floor never merges
      for (let i = 0; i < K; i++) { const cells = shapeCells(pick(rng, 1, ["square", "plus", "Lshape", "triangle"])[0], rng.int(2, 3)), [bh, bw] = bbox(cells);
        const c = i * bandW + rng.int(0, Math.max(0, bandW - bw - gap)), r = rng.int(0, Math.max(0, H - bh - 3)); specs.push({ cells, color: cols[i], r, c, bh }); }   // gap kept on the band's right edge
      const IN = render(H, W, specs);
      return { in: IN, out: render(H, W, specs.map(o => ({ ...o, r: H - o.bh }))) }; } },

  count_to_color: { prior: "number", steps: 2, rule: "count the shapes; the output is a single cell whose colour encodes the count", concept: ["counting", "cardinality", "encoding"],
    make(rng) { const H = rng.int(14, 18), W = rng.int(14, 18), N = rng.int(1, 6), CMAP = [0, 1, 2, 3, 4, 6, 7, 8, 9];
      const specs = []; for (let i = 0; i < N; i++) specs.push({ cells: shapeCells(pick(rng, 1, SOLID)[0], rng.int(2, 3)), color: pick(rng, 1, [1, 3, 4, 5, 6, 8])[0] });   // colour varies (count is colour-independent)
      const P = placeRoster(rng, H, W, specs), IN = render(H, W, P);
      return { in: IN, out: [[CMAP[N]]] }; } },

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
      for (let i = 0; i < K; i++) specs.push({ cells: shapeCells(pick(rng, 1, SOLID)[0], rng.int(3, 4)), color: pick(rng, 1, [2, 3, 4, 6, 8])[0] });
      const P = placeRoster(rng, H, W, specs), grid = render(H, W, P), nN = rng.int(4, 8); let tries = 0, placed = 0;
      while (placed < nN && tries < 200) { tries++; const r = rng.int(0, H - 1), c = rng.int(0, W - 1); if (grid[r][c]) continue;
        let ok = true; for (let a = -1; a <= 1 && ok; a++) for (let b = -1; b <= 1; b++) { const rr = r + a, cc = c + b; if (rr >= 0 && cc >= 0 && rr < H && cc < W && grid[rr][cc]) { ok = false; break; } }   // 8-neighbour isolation (no diagonal touch either)
        if (!ok) continue; grid[r][c] = pick(rng, 1, [2, 3, 4, 6, 8])[0]; placed++; }
      return { in: grid, out: render(H, W, P) }; } },

  scale_to_majority_size: { prior: "geometry", steps: 2, rule: "every shape is rescaled to match the size of the largest shape", concept: ["scale", "uniform", "geometry"],
    make(rng) { const K = rng.int(3, 4), H = rng.int(18, 22), W = rng.int(18, 22);
      const sizes = pick(rng, K, [1, 2, 3]), big = Math.max(...sizes) + 1;   // reserve the BIG footprint so rescaling can't overlap
      const specs = sizes.map(s => ({ cells: shapeCells("square", big), small: s, color: pick(rng, 1, [2, 3, 4, 6, 8])[0] }));
      const P = placeRoster(rng, H, W, specs);
      const IN = render(H, W, P.map(o => ({ ...o, cells: shapeCells("square", o.small) })));
      return { in: IN, out: render(H, W, P) }; } },
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
    meta: { id, rule: fam.rule, concepts: fam.concept, prior: fam.prior, difficulty: +diff.toFixed(2), template: "prog:" + famKey, source: "program-first", n_examples: nEx, teaching: { ok: true, coherent: true, examplesVary: true } },
  };
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
module.exports = { FAMILIES, buildFamilyTask };
