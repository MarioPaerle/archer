#!/usr/bin/env node
/* Showcase v6: candidate program-first tasks for library promotion.
 * Focus: IQ-style rules, richer skins/objects/layouts, and more compositional transformations.
 * Output:
 *   out/showcase_v6.jsonl
 *   out/showcase_v6.html
 */
const fs = require("fs"), path = require("path"), crypto = require("crypto");
const E = require("./engine.js"), GIF = require("./gif.js"), B = require("./baseline.js"), C = require("./gen_count.js"), GH = require("./gen_hard.js"), PHY = require("./gen_physics.js");
const { SHAPES_ALL, SKINS, skinnedCells, pickSkin } = require("./skins.js");

const blank = (H, W) => Array.from({ length: H }, () => new Array(W).fill(0));
const clone = g => g.map(r => r.slice());
const bbox = cells => { let h = 0, w = 0; for (const [r, c] of cells) { if (r + 1 > h) h = r + 1; if (c + 1 > w) w = c + 1; } return [h, w]; };
const rect = (h, w) => { const o = []; for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) o.push([r, c]); return o; };
const stamp = (g, cells, r, c, color) => { for (const [dr, dc] of cells) { const rr = r + dr, cc = c + dc; if (rr >= 0 && cc >= 0 && rr < g.length && cc < g[0].length) g[rr][cc] = color; } };
const stampSkin = (g, cells, r, c, color, skin, accent) => {
  const painted = skin ? skinnedCells(cells, skin, color, accent) : cells.map(([dr, dc]) => [dr, dc, color]);
  for (const [dr, dc, col] of painted) { const rr = r + dr, cc = c + dc; if (col && rr >= 0 && cc >= 0 && rr < g.length && cc < g[0].length) g[rr][cc] = col; }
};
const render = (H, W, objs) => { const g = blank(H, W); for (const o of objs) stampSkin(g, o.cells, o.r, o.c, o.color, o.skin, o.accent); return g; };
const pick = (rng, xs) => xs[rng.int(0, xs.length - 1)];
const shuffle = (rng, a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = rng.int(0, i); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const shape = (kind, s) => kind === "rect" ? rect(s, s + 2) : E.buildShape(kind, kind === "frame" ? [s, s] : [s]);
const flipH = cells => { const [, w] = bbox(cells); return cells.map(([r, c]) => [r, w - 1 - c]); };
const flipV = cells => { const [h] = bbox(cells); return cells.map(([r, c]) => [h - 1 - r, c]); };
const scale2 = cells => cells.flatMap(([r, c]) => [[2 * r, 2 * c], [2 * r + 1, 2 * c], [2 * r, 2 * c + 1], [2 * r + 1, 2 * c + 1]]);
const cellsKey = cells => new Set(cells.map(([r, c]) => r + "," + c));
const fromSet = set => [...set].map(s => s.split(",").map(Number));
const normalize = cells => { const mr = Math.min(...cells.map(x => x[0])), mc = Math.min(...cells.map(x => x[1])); return cells.map(([r, c]) => [r - mr, c - mc]); };
const colorPool = [1, 2, 3, 4, 5, 6, 7, 8, 9];

function mark(g, cells, r, c, color) { stamp(g, cells, r, c, color); return { cells, r, c, color }; }

function panel(g, r0, c0, h, w) {
  for (let r = r0; r < r0 + h; r++) for (let c = c0; c < c0 + w; c++) if (r === r0 || c === c0 || r === r0 + h - 1 || c === c0 + w - 1) g[r][c] = 5;
}
function placePanelObj(g, pr, pc, cells, color, skin, accent) {
  const [h, w] = bbox(cells), r = pr + Math.floor((5 - h) / 2), c = pc + Math.floor((5 - w) / 2);
  stampSkin(g, cells, r, c, color, skin, accent);
}
function xorCells(a, b) {
  const A = cellsKey(a), B = cellsKey(b), out = new Set();
  for (const x of A) if (!B.has(x)) out.add(x);
  for (const x of B) if (!A.has(x)) out.add(x);
  return normalize(fromSet(out));
}
function line(r0, c0, r1, c1) {
  const out = [], dr = Math.abs(r1 - r0), dc = Math.abs(c1 - c0), sr = r0 < r1 ? 1 : -1, sc = c0 < c1 ? 1 : -1;
  let err = dr - dc, r = r0, c = c0;
  while (true) { out.push([r, c]); if (r === r1 && c === c1) break; const e2 = 2 * err; if (e2 > -dc) { err -= dc; r += sr; } if (e2 < dr) { err += dr; c += sc; } }
  return out;
}
function crop(g) { return C.cropToContent(g); }
function translateCells(cells, dr, dc) { return cells.map(([r, c]) => [r + dr, c + dc]); }
function hcatCells(left, right, gap = 1) {
  const [, lw] = bbox(left);
  return normalize([...left, ...translateCells(right, 0, lw + gap)]);
}
function cellMask(rows) {
  const out = [];
  for (let r = 0; r < rows.length; r++) for (let c = 0; c < rows[r].length; c++) if (rows[r][c]) out.push([r, c]);
  return out;
}
const XOR_MOTIFS = [
  cellMask([[0,1,0,0,0],[1,1,1,0,0],[0,1,0,0,0],[0,0,0,0,0],[0,0,0,0,0]]),
  cellMask([[1,1,1,1,1],[1,0,0,0,1],[1,0,0,0,1],[1,0,0,0,1],[1,1,1,1,1]]),
  cellMask([[0,0,1,0,0],[0,1,1,1,0],[1,1,1,1,1],[0,1,1,1,0],[0,0,1,0,0]]),
  cellMask([[1,0,0,0,0],[1,1,0,0,0],[1,1,1,0,0],[1,1,1,1,0],[1,1,1,1,1]]),
  cellMask([[1,1,1,0,0],[0,1,0,0,0],[0,1,0,0,0],[0,1,0,0,0],[0,1,0,0,0]]),
  cellMask([[1,0,1,0,1],[0,1,1,1,0],[1,1,1,1,1],[0,1,1,1,0],[1,0,1,0,1]]),
];
function variedXorPair(rng) {
  const a = normalize(pick(rng, XOR_MOTIFS));
  let b = normalize(pick(rng, XOR_MOTIFS));
  let guard = 0;
  while (JSON.stringify(a) === JSON.stringify(b) && guard++ < 20) b = normalize(pick(rng, XOR_MOTIFS));
  return [a, b];
}

const FAMILIES = {
  iq_matrix_feature_progression: {
    group: "IQ candidates", prior: "iq/matrix", steps: 3,
    rule: "complete the 2x2 matrix: columns increase size, rows change the internal skin pattern; output only the missing panel",
    variation: { vary: ["base shape family", "body colour", "accent colour", "row skin pair"], invariant: ["2x2 panel frame", "column = size progression", "row = skin progression", "answer is the missing bottom-right panel"] },
    make(rng) {
      const g = blank(13, 13), ans = blank(5, 5), color = pick(rng, [2, 3, 4, 6, 8]), accent = pick(rng, [1, 5, 7, 9].filter(x => x !== color));
      const skins = shuffle(rng, ["core", "stripe", "checker", "diag", "corner"]).slice(0, 2), kind = pick(rng, ["square", "diamond", "plus"]);
      const sizes = kind === "plus" ? [2, 3] : [3, 4], cells = sizes.map(s => shape(kind, s));
      panel(g, 0, 0, 5, 5); panel(g, 0, 8, 5, 5); panel(g, 8, 0, 5, 5); panel(g, 8, 8, 5, 5);
      placePanelObj(g, 0, 0, cells[0], color, skins[0], accent);
      placePanelObj(g, 0, 8, cells[1], color, skins[0], accent);
      placePanelObj(g, 8, 0, cells[0], color, skins[1], accent);
      placePanelObj(ans, 0, 0, cells[1], color, skins[1], accent);
      return { in: g, out: ans };
    },
  },
  iq_boolean_xor: {
    group: "IQ candidates", prior: "iq/boolean", steps: 2,
    rule: "combine the two source figures with xor; cells present in exactly one source remain",
    variation: { vary: ["source mask A", "source mask B", "body colour", "source colour contrast"], invariant: ["boolean op = xor", "top-left mask alignment", "output uses source A colour", "panel layout"] },
    make(rng) {
      const H = 11, W = 23, [A, B] = variedXorPair(rng);
      const colA = pick(rng, [2, 3, 4, 6, 8]), colB = pick(rng, [1, 5, 7, 9].filter(c => c !== colA)), g = blank(H, W), out = blank(H, W);
      stamp(g, A, 2, 2, colA); stamp(g, B, 2, 14, colB);
      for (let r = 0; r < H; r++) g[r][11] = 5;
      stamp(out, xorCells(A, B), 2, 9, colA);
      return { in: g, out };
    },
  },
  iq_embedded_find: {
    group: "IQ candidates", prior: "iq/figure-ground", steps: 3,
    rule: "find the small target pattern embedded in the larger field and highlight only that occurrence",
    variation: { vary: ["target subshape", "target location", "field clutter", "target colour"], invariant: ["left panel is the query template", "right panel is the search field", "yellow swatch marks the found occurrence"] },
    make(rng) {
      const H = 15, W = 23, target = shape(pick(rng, ["Lshape", "Tshape", "notch"]), 3), col = pick(rng, [2, 3, 6, 8]);
      const g = blank(H, W), field = blank(11, 11), outField = blank(11, 11);
      panel(g, 1, 1, 5, 5); g[0][0] = 4; stamp(g, target, 2, 2, col);
      const rr = rng.int(2, 5), cc = rng.int(2, 5); stamp(field, target, rr, cc, col);
      const clutter = [
        { cells: shape("square", 2), r: 1, c: 8, color: 5 },
        { cells: shape("plus", 2), r: 8, c: 1, color: 7 },
        { cells: shape("Lshape", 2), r: 8, c: 8, color: 1 },
      ];
      for (const o of clutter) stamp(field, o.cells, o.r, o.c, o.color);
      for (let r = 0; r < 11; r++) for (let c = 0; c < 11; c++) { g[r + 2][c + 10] = field[r][c]; outField[r][c] = field[r][c]; }
      stamp(outField, target, rr, cc, 4);
      return { in: g, out: outField };
    },
  },
  iq_attribute_binding: {
    group: "IQ candidates", prior: "iq/dispatch", steps: 3,
    rule: "red objects mirror left-right while blue objects flip top-bottom; the colour binds the operation",
    variation: { vary: ["object shape per item", "object size", "object placement", "count/order of red vs blue objects"], invariant: ["red maps to left-right mirror", "blue maps to top-bottom flip", "colour is the dispatch key"] },
    make(rng) {
      const H = 20, W = 23, specs = [], kinds = ["Lshape", "triangle", "notch"];
      const colors = shuffle(rng, [2, 2, 1, 1, rng.int(0, 1) ? 2 : 1]);
      for (let i = 0; i < colors.length; i++) {
        const sh = shape(pick(rng, kinds), rng.int(3, 5)), [h, w] = bbox(sh), color = colors[i];
        specs.push({ cells: rect(h, w), shape: sh, color });
      }
      const P = C.placeRoster(rng, H, W, specs);
      return {
        in: render(H, W, P.map(o => ({ ...o, cells: o.shape }))),
        out: render(H, W, P.map(o => ({ ...o, cells: o.color === 2 ? flipH(o.shape) : flipV(o.shape) }))),
      };
    },
  },
  iq_bongard_classify: {
    group: "IQ candidates", prior: "iq/classify", steps: 3,
    rule: "emit the green marker if every figure is symmetric; otherwise emit the red marker",
    make(rng) {
      const allSym = rng.int(0, 1) === 1, H = 14, W = 18, specs = [], sym = ["square", "diamond", "plus"], asym = ["Lshape", "notch", "triangle"];
      for (let i = 0; i < 3; i++) { const kind = allSym || i < 2 ? pick(rng, sym) : pick(rng, asym); specs.push({ cells: shape(kind, rng.int(3, 4)), color: pick(rng, [5, 6, 8]) }); }
      const P = C.placeRoster(rng, H, W, specs), g = render(H, W, P);
      g[0][0] = 3; g[0][2] = 2; // grounded class swatches
      const out = blank(3, 3); for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) out[r][c] = allSym ? 3 : 2;
      return { in: g, out };
    },
  },
  iq_part_whole_assembly: {
    group: "IQ candidates", prior: "iq/part-whole", steps: 3,
    rule: "translate the fragments together to assemble the complete framed square",
    make(rng) {
      const col = pick(rng, [2, 3, 4, 6, 8]), frame = shape("frame", 6);
      const top = frame.filter(([r]) => r <= 1), bottom = frame.filter(([r]) => r >= 4), sides = frame.filter(([r, c]) => r > 1 && r < 4 && (c === 0 || c === 5));
      const H = 15, W = 20, g = blank(H, W), out = blank(8, 8);
      stamp(g, top, 1, 1, col); stamp(g, bottom, 10, 2, col); stamp(g, sides, 4, 13, col);
      stamp(out, frame, 1, 1, col);
      return { in: g, out };
    },
  },

  skin_zoo_select_checker: {
    group: "Skins / objects / layouts", prior: "object/skin", steps: 2,
    rule: "among varied skinned objects, keep only the checker-pattern object",
    variation: { vary: ["object shape", "skin distractors", "body colour", "accent colour", "layout"], invariant: ["target predicate = checker skin", "output extracts the checker object only"] },
    make(rng) {
      const H = 24, W = 28, body = pick(rng, [1, 5, 8]), accent = pick(rng, [2, 3, 4, 6, 7].filter(x => x !== body));
      const skins = shuffle(rng, ["core", "border", "cross", "stripe", "checker", "diag", "spots", "corner", "split"]).slice(0, 5);
      if (!skins.includes("checker")) skins[0] = "checker";
      const specs = skins.map(sk => ({ cells: shape(pick(rng, SHAPES_ALL), rng.int(3, 4)), color: body, skin: sk, accent, target: sk === "checker" }));
      const P = C.placeRoster(rng, H, W, specs);
      return { in: render(H, W, P), out: render(H, W, P.filter(o => o.target)) };
    },
  },
  object_zoo_sort_by_shape: {
    group: "Skins / objects / layouts", prior: "object/layout", steps: 3,
    rule: "collect diverse objects into a tidy row ordered by shape family",
    variation: { vary: ["input layout", "object colour", "skin", "shape instance"], invariant: ["sort key = fixed shape-family order", "output is a tidy row"] },
    make(rng) {
      const H = 20, W = 24, order = ["square", "disc", "triangle", "diamond", "plus"], cols = shuffle(rng, [2, 3, 4, 6, 7, 8, 9]).slice(0, order.length);
      const specs = shuffle(rng, order).map((kind, i) => ({ cells: shape(kind, kind === "disc" ? 3 : 4), color: cols[i], kind, ...pickSkin(rng, cols[i], false) }));
      const P = C.placeRoster(rng, H, W, specs), sorted = P.slice().sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
      const maxH = Math.max(...sorted.map(o => bbox(o.cells)[0])), outW = sorted.reduce((s, o) => s + bbox(o.cells)[1] + 2, 1), out = blank(maxH + 2, outW); let c = 1;
      for (const o of sorted) { const [h, w] = bbox(o.cells); stampSkin(out, o.cells, 1 + Math.floor((maxH - h) / 2), c, o.color, o.skin, o.accent); c += w + 2; }
      return { in: render(H, W, P), out: crop(out) };
    },
  },
  layout_perimeter_to_center: {
    group: "Skins / objects / layouts", prior: "object/layout", steps: 2,
    rule: "move the perimeter objects into a centred compact plus layout while preserving each object's skin",
    variation: { vary: ["body colours", "skins", "perimeter starting side"], invariant: ["perimeter objects move to compact plus layout", "object identity/skin is preserved"] },
    make(rng) {
      const H = 19, W = 19, cols = shuffle(rng, [2, 3, 4, 6, 7]).slice(0, 4), kinds = ["square", "diamond", "plus", "triangle"];
      const objs = [
        { cells: shape(kinds[0], 3), r: 1, c: 8, color: cols[0], ...pickSkin(rng, cols[0], false) },
        { cells: shape(kinds[1], 3), r: 8, c: 1, color: cols[1], ...pickSkin(rng, cols[1], false) },
        { cells: shape(kinds[2], 3), r: 8, c: 15, color: cols[2], ...pickSkin(rng, cols[2], false) },
        { cells: shape(kinds[3], 3), r: 15, c: 8, color: cols[3], ...pickSkin(rng, cols[3], false) },
      ];
      const pos = [[1, 4], [4, 1], [4, 7], [7, 4]], outObjs = objs.map((o, i) => ({ ...o, r: pos[i][0], c: pos[i][1] }));
      return { in: render(H, W, objs), out: render(12, 12, outObjs) };
    },
  },
  nested_skin_roles: {
    group: "Skins / objects / layouts", prior: "object/topology", steps: 3,
    rule: "inside the large frame, recolour only the object with the diagonal skin; outside objects are removed",
    make(rng) {
      const H = 20, W = 22, frame = { cells: shape("frame", 12), r: 3, c: 5, color: 5 }, body = pick(rng, [1, 8]), accent = pick(rng, [2, 3, 4, 6]);
      const objs = [frame,
        { cells: shape("square", 4), r: 6, c: 8, color: body, skin: "diag", accent, target: true },
        { cells: shape("diamond", 4), r: 9, c: 14, color: body, skin: "spots", accent },
        { cells: shape("plus", 3), r: 1, c: 1, color: body, skin: "diag", accent },
      ];
      return { in: render(H, W, objs), out: render(H, W, [frame, { ...objs[1], color: 4, skin: null }]) };
    },
  },

  comp_core_then_mirror: {
    group: "Compositional candidates", prior: "object/geometry", steps: 3,
    rule: "select the object with the red core, mirror only that object, and remove the rest",
    make(rng) {
      const H = 18, W = 22, body = pick(rng, [1, 5, 8]), specs = [];
      for (let i = 0; i < 4; i++) specs.push({ cells: shape(pick(rng, ["Lshape", "notch", "triangle"]), 4), color: body, skin: "core", accent: pick(rng, [3, 4, 6, 7]) });
      specs[rng.int(0, specs.length - 1)].accent = 2;
      const P = C.placeRoster(rng, H, W, specs), target = P.find(o => o.accent === 2);
      return { in: render(H, W, P), out: render(H, W, [{ ...target, cells: flipH(target.cells), skin: "core" }]) };
    },
  },
  comp_pointer_color_transfer: {
    group: "Compositional candidates", prior: "object/geometry", steps: 3,
    rule: "each pointer selects the first object in its row; the selected object takes the pointer's colour",
    variation: { vary: ["pointer colour", "target shape", "row order", "distractor colour"], invariant: ["pointer direction = right", "selected object is the first shape in the row", "selected object takes pointer colour"] },
    make(rng) {
      const H = 21, W = 25, g = blank(H, W), out = blank(H, W), rows = shuffle(rng, [3, 10, 17]).slice(0, 3), ptrCols = shuffle(rng, [2, 3, 4, 6, 8]).slice(0, rows.length);
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i], pc = 1, tc = 11, d1 = 6, d2 = 20;
        const ptr = [[0, 0], [1, 1], [2, 0], [1, 0]]; stamp(g, ptr, r - 1, pc, ptrCols[i]); stamp(out, ptr, r - 1, pc, ptrCols[i]);
        const obj = shape(pick(rng, ["square", "plus", "Lshape", "Tshape"]), 3); stamp(g, obj, r - 1, tc, pick(rng, [1, 5, 7, 9])); stamp(out, obj, r - 1, tc, ptrCols[i]);
        stamp(g, shape("square", 2), r, d1, 5); stamp(out, shape("square", 2), r, d1, 5);
        stamp(g, shape("square", 2), r, d2, 5); stamp(out, shape("square", 2), r, d2, 5);
      }
      return { in: g, out };
    },
  },
  comp_remove_support_sort_fall: {
    group: "Compositional candidates", prior: "physics/number", steps: 4,
    rule: "remove the support, let the objects fall, then arrange their colours left-to-right by original height",
    variation: { vary: ["object colours", "initial heights"], invariant: ["support is removed", "answer order follows original height"] },
    make(rng) {
      const H = 16, W = 20, cols = shuffle(rng, [2, 3, 4, 6]).slice(0, 3), objs = [];
      for (let i = 0; i < 3; i++) objs.push({ cells: shape("square", 2), r: 2 + i * 3, c: 4 + i * 4, color: cols[i], origR: 2 + i * 3 });
      const support = { cells: rect(1, W - 2), r: 13, c: 1, color: 5 };
      const sorted = objs.slice().sort((a, b) => a.origR - b.origR), out = blank(5, 12);
      sorted.forEach((o, i) => stamp(out, o.cells, 1, 1 + i * 4, o.color));
      return { in: render(H, W, [support, ...objs]), out };
    },
  },
  comp_boolean_then_count: {
    group: "Compositional candidates", prior: "set-logic/number", steps: 4,
    rule: "xor the two masks, then output a compact four-column tally of the xor cell count",
    make(rng) {
      const A = shape("plus", 5), B = shape(pick(rng, ["frame", "diamond"]), 5), X = xorCells(A, B), col = pick(rng, [2, 3, 4, 6, 8]);
      const g = blank(11, 19); stamp(g, A, 2, 2, col); stamp(g, B, 2, 12, col); for (let r = 0; r < 11; r++) g[r][9] = 5;
      const cols = [1, 3, 5, 7], rows = Math.ceil(X.length / cols.length) * 2 - 1, out = blank(rows, 9);
      for (let i = 0; i < X.length; i++) out[Math.floor(i / cols.length) * 2][cols[i % cols.length]] = col;
      return { in: g, out: crop(out) };
    },
  },
};

const SHOWCASE_KEYS = [
  "iq_matrix_feature_progression",
  "iq_boolean_xor",
  "iq_embedded_find",
  "iq_attribute_binding",
  "skin_zoo_select_checker",
  "object_zoo_sort_by_shape",
  "layout_perimeter_to_center",
  "comp_pointer_color_transfer",
  "comp_remove_support_sort_fall",
];

const COMPOSITIONAL_FAMILIES = {
  select_checker_then_mirror: {
    group: "New compositional tasks", prior: "object/skin+geometry", steps: 3,
    rule: "select the checker-skinned object, mirror it left-right, and remove the distractors",
    variation: { vary: ["target shape", "distractor skins", "body/accent colours", "layout"], invariant: ["target skin = checker", "operation after selection = left-right mirror"] },
    make(rng) {
      const H = 20, W = 24, body = pick(rng, [1, 5, 8]), accent = pick(rng, [2, 3, 4, 6, 7].filter(c => c !== body));
      const skins = shuffle(rng, ["checker", "diag", "spots", "corner", "split"]).slice(0, 4);
      if (!skins.includes("checker")) skins[0] = "checker";
      const specs = skins.map(sk => ({ cells: shape(pick(rng, ["Lshape", "notch", "triangle", "Tshape"]), 4), color: body, skin: sk, accent, target: sk === "checker" }));
      const P = C.placeRoster(rng, H, W, specs), target = P.find(o => o.target);
      return { in: render(H, W, P), out: render(H, W, [{ ...target, cells: flipH(target.cells) }]) };
    },
  },
  largest_falls_then_recolor: {
    group: "New compositional tasks", prior: "number/object/physics", steps: 4,
    rule: "find the largest object, drop only that object to the floor, and recolour it yellow",
    variation: { vary: ["object shapes", "object sizes", "starting heights"], invariant: ["largest is unique", "largest falls to floor", "largest becomes yellow"] },
    make(rng) {
      const H = 18, W = 22, sizes = [2, 3, 5], cols = shuffle(rng, [1, 2, 3, 6, 8]).slice(0, 3);
      const specs = shuffle(rng, sizes).map((s, i) => ({ cells: shape(pick(rng, ["square", "plus", "Lshape"]), s), color: cols[i], s }));
      const P = C.placeRoster(rng, H, W, specs), big = P.slice().sort((a, b) => b.cells.length - a.cells.length)[0];
      return { in: render(H, W, P), out: render(H, W, P.map(o => o === big ? { ...o, r: H - bbox(o.cells)[0], color: 4 } : o)) };
    },
  },
  pointer_select_then_copy: {
    group: "New compositional tasks", prior: "pointing/object/copy", steps: 4,
    rule: "the pointer selects the first object to its right; copy that selected object into the answer slot",
    variation: { vary: ["pointer colour", "selected shape", "distractor shapes"], invariant: ["pointer points right", "selected object is first object in row", "copy appears in the marked slot"] },
    make(rng) {
      const H = 12, W = 25, g = blank(H, W), out = blank(H, W), row = rng.int(3, 7), ptrCol = pick(rng, [2, 3, 4, 6, 8]);
      const ptr = [[0, 0], [1, 1], [2, 0], [1, 0]], slot = shape("frame", 5), obj = shape(pick(rng, ["square", "plus", "Lshape", "Tshape"]), 3), objCol = pick(rng, [1, 5, 7, 9]);
      stamp(g, ptr, row - 1, 1, ptrCol); stamp(out, ptr, row - 1, 1, ptrCol);
      stamp(g, obj, row - 1, 9, objCol); stamp(out, obj, row - 1, 9, objCol);
      stamp(g, shape("square", 2), row, 15, 5); stamp(out, shape("square", 2), row, 15, 5);
      stamp(g, slot, 3, 19, 5); stamp(out, slot, 3, 19, 5); stamp(out, obj, 4, 20, ptrCol);
      return { in: g, out };
    },
  },
  xor_then_extract_largest_piece: {
    group: "New compositional tasks", prior: "set-logic/object", steps: 4,
    rule: "xor the two aligned masks, then extract the largest connected xor island into a separate answer panel",
    variation: { vary: ["source mask A", "source mask B", "source colour", "largest island shape"], invariant: ["boolean op = xor", "post-step keeps largest connected xor island", "answer is a cropped extraction panel"] },
    make(rng) {
      const [A, B] = variedXorPair(rng), col = pick(rng, [2, 3, 4, 6, 8]), X = xorCells(A, B);
      const comps = components(X).filter(c => c.length >= 2), keep = comps.slice().sort((a, b) => b.length - a.length)[0] || X;
      const g = blank(11, 23), out = blank(8, 8);
      stamp(g, A, 2, 2, col); stamp(g, B, 2, 15, col); for (let r = 0; r < 11; r++) g[r][11] = 5;
      stamp(out, keep, 1, 1, col);
      return { in: g, out: crop(out) };
    },
  },
  inside_frame_sort_by_size: {
    group: "New compositional tasks", prior: "topology/number/layout", steps: 4,
    rule: "keep only the skinned objects inside the frame, then output their colours ordered by object area",
    variation: { vary: ["inside object shapes", "skins", "outside distractors", "colours"], invariant: ["inside predicate is frame containment", "answer order is by object area", "output is a compact colour code"] },
    make(rng) {
      const H = 23, W = 27, frame = { cells: shape("frame", 15), r: 4, c: 6, color: 5 }, cols = shuffle(rng, [2, 3, 4, 6, 8, 9]).slice(0, 4);
      const shapes = shuffle(rng, [
        { cells: shape("Lshape", 3), r: 6, c: 8 },
        { cells: shape("square", 3), r: 6, c: 15 },
        { cells: shape("plus", 4), r: 12, c: 9 },
        { cells: shape("diamond", 3), r: 12, c: 16 },
      ]);
      const inside = shapes.map((o, i) => ({ ...o, color: cols[i], ...pickSkin(rng, cols[i], false), area: o.cells.length }));
      const outside = [{ cells: shape("Tshape", 4), r: 1, c: 1, color: 7, skin: "checker", accent: 1 }, { cells: shape("notch", 4), r: 17, c: 22, color: 1, skin: "diag", accent: 4 }];
      const sorted = inside.slice().sort((a, b) => a.area - b.area), out = blank(3, sorted.length * 2 - 1);
      sorted.forEach((o, i) => { out[1][i * 2] = o.color; });
      return { in: render(H, W, [frame, ...inside, ...outside]), out };
    },
  },
  remove_support_then_count_fallen: {
    group: "New compositional tasks", prior: "physics/structure", steps: 5,
    rule: "remove the red keystone from the block structure; unsupported upper blocks fall while grounded blocks stay",
    variation: { vary: ["block colours", "tower side", "cap colour"], invariant: ["red keystone is removed", "only unsupported upper structure falls", "grounded base blocks stay"] },
    make(rng) {
      const H = 18, W = 20, cols = shuffle(rng, [3, 4, 6, 8, 9]), left = rng.int(0, 1) === 1;
      const base = [
        { cells: rect(2, 3), r: 14, c: 3, color: cols[0] },
        { cells: rect(2, 3), r: 14, c: 14, color: cols[1] },
      ];
      const keystoneC = left ? 6 : 11;
      const upper = [
        { cells: rect(2, 3), r: 10, c: keystoneC, color: cols[2] },
        { cells: rect(1, 9), r: 8, c: 5, color: cols[3] },
        { cells: rect(2, 2), r: 6, c: 8, color: cols[4] },
      ];
      const key = { cells: rect(2, 3), r: 12, c: keystoneC, color: 2 };
      const fallen = upper.map((o, i) => ({ ...o, r: [12, 10, 8][i] }));
      return { in: render(H, W, [...base, key, ...upper]), out: render(H, W, [...base, ...fallen]) };
    },
  },
  colour_dispatch_then_crop: {
    group: "New compositional tasks", prior: "dispatch/geometry/crop", steps: 4,
    rule: "red objects mirror left-right, blue objects flip top-bottom, then crop to the changed objects",
    variation: { vary: ["asymmetric shapes", "object positions"], invariant: ["red = mirror", "blue = flip", "answer is cropped"] },
    make(rng) {
      const H = 18, W = 22, specs = [2, 1, 2, 1].map(color => { const sh = shape(pick(rng, ["Lshape", "triangle", "notch"]), 4), [h, w] = bbox(sh); return { cells: rect(h, w), shape: sh, color }; });
      const P = C.placeRoster(rng, H, W, specs), outObjs = P.map(o => ({ ...o, cells: o.color === 2 ? flipH(o.shape) : flipV(o.shape) }));
      return { in: render(H, W, P.map(o => ({ ...o, cells: o.shape }))), out: crop(render(H, W, outObjs)) };
    },
  },
  skin_role_recolor_then_extract: {
    group: "New compositional tasks", prior: "skin/selection/color", steps: 4,
    rule: "find the diagonal-skinned object, recolour its body yellow, and extract only that object",
    variation: { vary: ["shape", "layout", "distractor skins"], invariant: ["target skin = diagonal", "target body becomes yellow", "only target remains"] },
    make(rng) {
      const H = 20, W = 24, body = pick(rng, [1, 5, 8]), accent = pick(rng, [2, 3, 6, 7]), skins = shuffle(rng, ["diag", "checker", "spots", "corner"]).slice(0, 4);
      if (!skins.includes("diag")) skins[0] = "diag";
      const specs = skins.map(sk => ({ cells: shape(pick(rng, ["square", "diamond", "plus", "Tshape"]), 4), color: body, skin: sk, accent, target: sk === "diag" }));
      const P = C.placeRoster(rng, H, W, specs), target = P.find(o => o.target);
      return { in: render(H, W, P), out: render(H, W, [{ ...target, color: 4 }]) };
    },
  },
  connect_pairs_then_count_crossings: {
    group: "New compositional tasks", prior: "geometry/number", steps: 4,
    rule: "connect each same-colour dot pair, then output one marker if the two segments cross",
    variation: { vary: ["pair colours"], invariant: ["same-colour pairs are connected", "answer marks whether the segments cross"] },
    make(rng) {
      const g = blank(11, 11), outScene = blank(11, 11), cols = shuffle(rng, [2, 3, 4, 6]).slice(0, 2);
      const pts = [{ r: 1, c: 1, col: cols[0] }, { r: 9, c: 9, col: cols[0] }, { r: 1, c: 9, col: cols[1] }, { r: 9, c: 1, col: cols[1] }];
      for (const p of pts) { g[p.r][p.c] = p.col; outScene[p.r][p.c] = p.col; }
      for (const [a, b] of [[pts[0], pts[1]], [pts[2], pts[3]]]) for (const [r, c] of line(a.r, a.c, b.r, b.c)) if (!outScene[r][c]) outScene[r][c] = 5;
      const out = blank(3, 3); out[1][1] = 4;
      return { in: g, out };
    },
  },
  frame_fill_then_outline: {
    group: "New compositional tasks", prior: "fractal/pattern", steps: 5,
    rule: "read the seed motif and expand it one recursive step into a Greek-key style fractal border",
    variation: { vary: ["motif colour", "corner orientation"], invariant: ["each coloured seed cell expands into the same motif", "answer is the next recursive pattern"] },
    make(rng) {
      const motifs = [
        [[1,1,1],[1,0,0],[1,1,1]],
        [[1,1,0],[0,1,0],[0,1,1]],
        [[1,0,1],[1,1,0],[1,0,1]],
      ];
      const M = pick(rng, motifs), col = pick(rng, [2, 3, 4, 6, 8]), inp = blank(3, 3), out = blank(9, 9);
      for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) if (M[r][c]) {
        inp[r][c] = col;
        for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) if (M[a][b]) out[r * 3 + a][c * 3 + b] = col;
      }
      return { in: inp, out };
    },
  },
};

function components(cells) {
  const set = cellsKey(cells), seen = new Set(), out = [];
  for (const key of set) if (!seen.has(key)) {
    const q = [key], comp = []; seen.add(key);
    while (q.length) {
      const cur = q.pop(), [r, c] = cur.split(",").map(Number); comp.push([r, c]);
      for (const [dr, dc] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const nk = (r + dr) + "," + (c + dc);
        if (set.has(nk) && !seen.has(nk)) { seen.add(nk); q.push(nk); }
      }
    }
    out.push(normalize(comp));
  }
  return out;
}

function enrichTask(t, extra) {
  const meta = t.meta || {};
  t.meta = Object.assign({}, meta, {
    depth: extra.depth == null ? meta.depth || 1 : extra.depth,
    language_description: extra.language_description || meta.rule || meta.language_description || "",
    generator_code: extra.generator_code || meta.generator_code || null,
    compiled_dsl: extra.compiled_dsl || meta.compiled_dsl || null,
  });
  return t;
}

function buildTask(key, baseSeed, nEx) {
  const fam = FAMILIES[key], examples = [];
  for (let i = 0; i < nEx; i++) examples.push(wrap(fam.make(E.makeRng(baseSeed * 1009 + i * 37 + 3))));
  const test = fam.make(E.makeRng(baseSeed * 1009 + 999));
  const id = "V6-" + crypto.createHash("sha1").update(JSON.stringify([key, examples, test])).digest("hex").slice(0, 8);
  return enrichTask({
    format: "prodigy-task", version: 1, width: test.in[0].length, height: test.in.length, palette: "arc10", fps: 1,
    examples, in: [test.in], out: [test.out],
    meta: { id, rule: fam.rule, concepts: [key, fam.group.toLowerCase()], prior: fam.prior, difficulty: Math.min(1, 0.35 + fam.steps * 0.12), template: "v6:" + key, source: "showcase-v6-candidate", group: fam.group, variation: fam.variation, n_examples: nEx, teaching: { ok: true, coherent: true, examplesVary: true } },
  }, { depth: fam.steps, language_description: fam.rule, generator_code: fam.make.toString() });
}
function buildCompositionalTask(key, baseSeed, nEx) {
  const fam = COMPOSITIONAL_FAMILIES[key], examples = [];
  for (let i = 0; i < nEx; i++) examples.push(wrap(fam.make(E.makeRng(baseSeed * 1009 + i * 37 + 11))));
  const test = fam.make(E.makeRng(baseSeed * 1009 + 999));
  const id = "CMP-" + crypto.createHash("sha1").update(JSON.stringify([key, examples, test])).digest("hex").slice(0, 8);
  return enrichTask({
    format: "prodigy-task", version: 1, width: test.in[0].length, height: test.in.length, palette: "arc10", fps: 1,
    examples, in: [test.in], out: [test.out],
    meta: { id, rule: fam.rule, concepts: [key, "composition"], prior: fam.prior, difficulty: Math.min(1, 0.45 + fam.steps * 0.12), template: "v6c:" + key, source: "showcase-v6-compositional", group: fam.group, variation: fam.variation, n_examples: nEx, teaching: { ok: true, coherent: true, examplesVary: true } },
  }, { depth: fam.steps, language_description: fam.rule, generator_code: fam.make.toString() });
}
function pairSig(p) { return JSON.stringify(p.in) + "=>" + JSON.stringify(p.out); }
function outSig(p) { return JSON.stringify(p.out); }
function variedSceneSeeds(text, seed0, want) {
  const picked = [], pairSeen = new Set(), outSeen = new Set();
  for (let off = 0; off < 160 && picked.length < want; off++) {
    const s = seed0 + off * 37;
    try {
      const t = E.buildTask(text, { examples: 1, exSeeds: [s], testSeed: s + 10007, fps: 2, augment: false });
      const p = t.examples[0], ps = pairSig(p), os = outSig(p);
      if (pairSeen.has(ps)) continue;
      if (picked.length < Math.max(2, want - 1) && outSeen.has(os)) continue;
      picked.push(s); pairSeen.add(ps); outSeen.add(os);
    } catch (e) {}
  }
  for (let off = 0; picked.length < want && off < 80; off++) {
    const s = seed0 + 1000 + off * 53;
    if (!picked.includes(s)) picked.push(s);
  }
  return picked;
}
function buildSceneTask(file, seed0) {
  const text = fs.readFileSync(path.join(__dirname, "scenes", "library", file), "utf8");
  const stem = file.replace(/\.txt$/, "");
  const exSeeds = variedSceneSeeds(text, seed0, 3);
  const task = E.buildTask(text, { examples: 3, exSeeds, testSeed: seed0 + 9973, fps: 2 });
  task.meta = Object.assign({}, task.meta, {
    id: "LIB-" + crypto.createHash("sha1").update(JSON.stringify([stem, task.examples, task.in, task.out])).digest("hex").slice(0, 8),
    template: "scene:" + stem,
    source: "scene-library",
    group: "Basic DSL library",
    difficulty: task.meta.difficulty == null ? 0.45 : task.meta.difficulty,
  });
  return enrichTask(task, { depth: 1, language_description: task.meta.rule, generator_code: text, compiled_dsl: text });
}
function buildGeneratorTask(key, seed, nEx) {
  const task = GH.buildFamilyTask(key, E.makeRng(seed * 2654435761 + 11), nEx);
  task.meta = Object.assign({}, task.meta, { id: task.meta.id.replace(/^P-/, "GEN-"), group: "No-LLM generator samples" });
  const fam = GH.FAMILIES[key];
  return enrichTask(task, { depth: fam && fam.steps, language_description: task.meta.rule, generator_code: fam && fam.make ? fam.make.toString() : null });
}
const GENERATOR_SHOWCASE_KEYS = [
  "fractal_continue",
  "greek_key_frieze",
  "maze_path",
  "iq_boolean_xor",
  "skin_zoo_select_checker",
  "skin_core_dispatch",
  "collapse_support",
  "inside_outside",
  "cast_shadow",
  "point_ray",
  "replicant",
  "morph_swap",
  "remove_noise",
  "odd_skin_out",
  "connect_in_order",
  "connect_shape_pairs",
  "fill_holes",
  "empty_structure_complete",
  "outline_shapes",
  "scale_to_majority_size",
];
function wrap(p) { return { in: [p.in], out: [p.out] }; }
function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function card(t) {
  let gif = "", verdict = "";
  try { const m = E.taskToMontage(t, { fps: 2 }); gif = "data:image/gif;base64," + Buffer.from(GIF.encodeGif({ frames: m.frames, palette: E.ARC_PALETTE, cell: 10, delayMs: 500 })).toString("base64"); } catch (e) { gif = ""; }
  try { const tv = B.trivialSolve(t); verdict = tv ? `<span class=triv>baseline catches: ${esc(tv)}</span>` : `<span class=hard>survives baseline</span>`; } catch (e) {}
  return `<figure class=card data-group="${esc(t.meta.group)}">${gif ? `<img loading=lazy src="${gif}">` : `<div class=noimg>render failed</div>`}
  <figcaption><div class=id>${esc(t.meta.id)} · ${esc(t.meta.template)}</div><div class=rule>${esc(t.meta.rule)}</div>
  <div class=meta>${verdict} · ${esc(t.meta.prior)} · difficulty ${esc(t.meta.difficulty)} · depth ${esc(t.meta.depth)} · ${t.width}x${t.height} · ${t.examples.length} examples · ${esc(t.meta.source)}</div>
  ${t.meta.variation ? `<details><summary>variation contract</summary><div class=meta><b>vary:</b> ${esc((t.meta.variation.vary || []).join(", "))}<br><b>invariant:</b> ${esc((t.meta.variation.invariant || []).join(", "))}</div></details>` : ""}
  </figcaption></figure>`;
}
function renderHtml(sections) {
  return `<!doctype html><meta charset=utf-8><title>GRIDVID showcase v6</title><style>
body{margin:0;background:#101014;color:#ececf1;font:13px ui-monospace,Menlo,monospace;padding:24px}
h1{margin:0 0 6px;color:#67e8f9;font-size:24px}.lead{margin:0 0 18px;color:#aaa;line-height:1.55;max-width:1180px}
h2{margin:34px 0 6px;color:#facc15;font-size:17px}.section-note{margin:0 0 12px;color:#b8b8c2;line-height:1.5;max-width:1180px}
.count{color:#86efac}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:16px}
.card{background:#17171d;border:1px solid #30303a;border-radius:8px;padding:12px;margin:0}.card img{width:100%;image-rendering:pixelated;background:#000;border:1px solid #2d2d35;border-radius:6px}
.id{color:#93c5fd;font-weight:700;font-size:11px;margin-top:8px}.rule{color:#f4f4f5;line-height:1.35;margin-top:5px}.meta{color:#9ca3af;font-size:10.5px;margin-top:5px}
.hard{color:#86efac}.triv{color:#fb923c}.noimg{padding:40px;text-align:center;color:#f87171}
</style><h1>GRIDVID Showcase v6</h1><p class=lead>This page is deliberately sectional. It first keeps the vetted v6 candidates, then shows the existing DSL library including fluid/physics, then shows fresh non-basic compositional tasks, and finally shows raw program-first generator samples. No card here is an LLM guess: every OUT is built by the engine or by explicit JS task code.</p>
${sections.map(s => `<section><h2>${esc(s.title)} <span class=count>(${s.tasks.length})</span></h2><p class=section-note>${esc(s.note)}</p><div class=grid>${s.tasks.map(card).join("\n")}</div></section>`).join("\n")}`;
}

function main() {
  const outDir = path.join(__dirname, "out");
  fs.mkdirSync(outDir, { recursive: true });
  const sections = [];
  let seed = 60;

  const vetted = [];
  for (const key of SHOWCASE_KEYS) {
    vetted.push(buildTask(key, seed++, 3));
    vetted.push(buildTask(key, seed++, 3));
  }
  sections.push({
    title: "A. Vetted v6 candidates",
    note: "The corrected v6 core: IQ-style rules, skins/object/layout tasks, and a small compositional bridge. Each card carries an explicit variation contract so the rule axes stay separate from incidental variety.",
    tasks: vetted,
  });

  const sceneFiles = fs.readdirSync(path.join(__dirname, "scenes", "library")).filter(f => f.endsWith(".txt")).sort();
  const library = [];
  const libraryErrors = [];
  for (let i = 0; i < sceneFiles.length; i++) {
    try { library.push(buildSceneTask(sceneFiles[i], 2000 + i * 17)); }
    catch (e) { libraryErrors.push(sceneFiles[i] + ": " + e.message); }
  }
  sections.push({
    title: "B. Existing basic DSL library",
    note: "One rendered task from every scene template that builds cleanly in scenes/library. This is the broad grammar surface: extraction, copying, grids, whole-grid transforms, counting, paths, dispatch, symmetry, and the existing physical/fluid basics.",
    tasks: library,
  });

  const physics = [];
  for (let i = 0; i < PHY.TEMPLATES.length; i++) {
    try {
      const tmpl = PHY.TEMPLATES[i], t = PHY.buildPhysicsTask(tmpl, 50_000 + i * 7919, 2, false);
      t.meta = Object.assign({}, t.meta, { group: "Foundational physics and fluid" });
      physics.push(enrichTask(t, { depth: 2, language_description: t.meta.rule, generator_code: tmpl.build ? tmpl.build.toString() : fs.readFileSync(path.join(__dirname, "scenes", "library", tmpl.key + ".txt"), "utf8"), compiled_dsl: tmpl.build ? null : fs.readFileSync(path.join(__dirname, "scenes", "library", tmpl.key + ".txt"), "utf8") }));
    } catch (e) { libraryErrors.push("physics:" + PHY.TEMPLATES[i].key + ": " + e.message); }
  }
  sections.push({
    title: "C. Foundational physics and fluid",
    note: "The dedicated dynamic tier: gravity, stacking, bouncing, paths, shattering, attraction, spinning, fluid flow, explosions, beams, mazes, and magnets. These teach object permanence and dynamics rather than static ARC transforms only.",
    tasks: physics,
  });

  const comp = [];
  for (const key of Object.keys(COMPOSITIONAL_FAMILIES)) comp.push(buildCompositionalTask(key, seed++, 3));
  sections.push({
    title: "D. Ten new non-basic compositional tasks",
    note: "Fresh programmatic compositions made for this showcase. Each combines two or more primitives such as selection plus transform, topology plus sorting, pointer plus copy, boolean algebra plus object selection, or physics plus counting.",
    tasks: comp,
  });

  const gen = [];
  for (let i = 0; i < GENERATOR_SHOWCASE_KEYS.length; i++) {
    const key = GENERATOR_SHOWCASE_KEYS[i];
    if (!GH.FAMILIES[key]) { libraryErrors.push("gen:" + key + ": missing family"); continue; }
    let built = null, lastErr = null;
    for (let retry = 0; retry < 8 && !built; retry++) {
      try { built = buildGeneratorTask(key, 90_000 + i * 977 + retry * 31, 3); }
      catch (e) { lastErr = e; }
    }
    if (built) gen.push(built);
    else libraryErrors.push("gen:" + key + ": " + (lastErr ? lastErr.message : "failed"));
  }
  sections.push({
    title: "E. Twenty no-LLM generator samples",
    note: "Direct curated samples from gen_hard.js families. This section is no-LLM by construction and deliberately covers fractals, Greek-key patterns, maze/pathfinding, IQ boolean algebra, skins/subobjects, structural gravity, shadow/pointing, topology, and shape transforms.",
    tasks: gen,
  });

  const tasks = sections.flatMap(s => s.tasks);
  fs.writeFileSync(path.join(outDir, "showcase_v6.jsonl"), tasks.map(t => JSON.stringify(t)).join("\n") + "\n");
  fs.writeFileSync(path.join(outDir, "showcase_v6.html"), renderHtml(sections));
  const byGroup = Object.fromEntries(sections.map(s => [s.title, s.tasks.length]));
  console.log("wrote out/showcase_v6.html and out/showcase_v6.jsonl");
  console.log("groups:", Object.entries(byGroup).map(([k, v]) => `${k}:${v}`).join("  "));
  if (libraryErrors.length) console.log("skipped/errors:", libraryErrors.slice(0, 12).join(" | ") + (libraryErrors.length > 12 ? ` | ... ${libraryErrors.length - 12} more` : ""));
}

if (require.main === module) main();
module.exports = { FAMILIES, buildTask };
