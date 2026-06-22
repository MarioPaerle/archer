#!/usr/bin/env node
/* gen_hard.js — PROGRAM-FIRST hard task generator. We control everything:
 *  - clean NON-OVERLAPPING object layout (a roster placed in disjoint grid cells),
 *  - a 2-step DEPENDENT rule applied deterministically IN JS (so the OUT exactly matches the rule — no mislabel),
 *  - filtered to be baseline-hard (a dumb 1-step solver fails).
 * Emits prodigy-task JSON (a family = K example pairs + 1 test), each with a stable ID.
 *   node gen_hard.js --n 30 -o out/hard.jsonl                                                            */
const crypto = require("crypto");
const E = require("./engine.js"), B = require("./baseline.js");

const bbox = cells => { let h = 0, w = 0; for (const [r, c] of cells) { if (r + 1 > h) h = r + 1; if (c + 1 > w) w = c + 1; } return [h, w]; };
const blank = (H, W) => Array.from({ length: H }, () => new Array(W).fill(0));
const stamp = (g, cells, r, c, col) => { for (const [dr, dc] of cells) { const rr = r + dr, cc = c + dc; if (rr >= 0 && cc >= 0 && rr < g.length && cc < g[0].length) g[rr][cc] = col; } };
const render = (H, W, objs) => { const g = blank(H, W); for (const o of objs) stamp(g, o.cells, o.r, o.c, o.color); return g; };
const shuffle = (rng, a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = rng.int(0, i);[a[i], a[j]] = [a[j], a[i]]; } return a; };
const pickDistinct = (rng, k, pool) => shuffle(rng, pool).slice(0, k);

// place a roster of {cells,color,...} into disjoint grid cells with jitter → guaranteed non-overlapping, readable.
function placeRoster(rng, H, W, specs) {
  const k = specs.length, cols = Math.ceil(Math.sqrt(k)), rows = Math.ceil(k / cols);
  const cellH = Math.floor(H / rows), cellW = Math.floor(W / cols), placed = []; let idx = 0;
  const order = shuffle(rng, specs.map((_, i) => i));
  for (let cr = 0; cr < rows && idx < k; cr++) for (let cc = 0; cc < cols && idx < k; cc++) {
    const sp = specs[order[idx++]]; const [bh, bw] = bbox(sp.cells);
    const r0 = cr * cellH, c0 = cc * cellW;
    const r = r0 + (cellH > bh ? rng.int(0, cellH - bh) : 0), c = c0 + (cellW > bw ? rng.int(0, cellW - bw) : 0);
    placed.push(Object.assign({}, sp, { r, c }));
  }
  return placed;
}
const SOLID = ["square", "disc", "plus", "Lshape"], HOLED = ["frame", "ring"];
const shapeCells = (kind, s) => kind === "frame" ? E.buildShape("frame", [s, s]) : E.buildShape(kind, [s]);
const size = o => o.cells.length;

// ---- rule families: each returns {rule, concept, make(rng)->{objs, render IN/OUT}} ----
const FAMILIES = {
  // 1) recolour every shape by its SIZE RANK (smallest→red, then green, yellow, blue, cyan). Relational: you must order them.
  rank_recolor: {
    rule: "recolour each shape by its size rank: the smallest becomes red, the next green, then yellow, blue, cyan",
    concept: ["ordering", "rank", "relational", "recolor"],
    make(rng) {
      const K = rng.int(3, 5), H = rng.int(13, 17), W = rng.int(13, 17);
      const sizes = pickDistinct(rng, K, [2, 3, 4, 5, 6]);
      const cols = pickDistinct(rng, K, [3, 4, 5, 6, 7, 8, 9]);
      const RANKPAL = [2, 3, 4, 1, 8];   // rank1..5 colours
      const specs = sizes.map((s, i) => ({ cells: shapeCells("square", s), color: cols[i] }));
      const placed = placeRoster(rng, H, W, specs);
      const IN = render(H, W, placed);
      const ranked = placed.map(o => o).sort((a, b) => size(a) - size(b));
      const out = placed.map(o => ({ ...o, color: RANKPAL[ranked.indexOf(o)] }));
      return { in: IN, out: render(H, W, out) };
    }
  },
  // 2) the HOLED shapes take the colour of the LARGEST object; the solid ones are removed. Cross-object dependency.
  holed_take_largest: {
    rule: "every shape with a hole is recoloured to the colour of the single largest shape; the shapes without a hole are removed",
    concept: ["topology", "hole", "largest", "relational", "dispatch"],
    make(rng) {
      const K = rng.int(4, 5), H = rng.int(14, 18), W = rng.int(14, 18);
      const kinds = shuffle(rng, [HOLED[rng.int(0, 1)], HOLED[rng.int(0, 1)], SOLID[rng.int(0, 3)], SOLID[rng.int(0, 3)]].concat(K > 4 ? [shuffle(rng, [...HOLED, ...SOLID])[0]] : []));
      const cols = pickDistinct(rng, K, [2, 3, 4, 5, 6, 7, 8]);
      const specs = kinds.map((k, i) => { const s = rng.int(3, 5); return { cells: shapeCells(k, s), color: cols[i], holed: HOLED.includes(k) }; });
      // ensure ≥1 holed and ≥1 solid and a unique largest
      if (!specs.some(s => s.holed)) specs[0] = { cells: shapeCells("frame", 4), color: cols[0], holed: true };
      if (!specs.some(s => !s.holed)) specs[1] = { cells: shapeCells("square", 3), color: cols[1], holed: false };
      const placed = placeRoster(rng, H, W, specs);
      const IN = render(H, W, placed);
      const largest = placed.slice().sort((a, b) => size(b) - size(a))[0];
      const out = placed.filter(o => o.holed).map(o => ({ ...o, color: largest.color }));
      return { in: IN, out: render(H, W, out) };
    }
  },
  // 3) recolour ALL shapes to the MAJORITY colour among them. Count → majority → propagate.
  recolor_to_majority: {
    rule: "recolour every shape to the colour that the majority of the shapes already share",
    concept: ["counting", "majority", "relational", "recolor"],
    make(rng) {
      const H = rng.int(13, 17), W = rng.int(13, 17);
      const majCol = [2, 3, 4][rng.int(0, 2)], minCol = [5, 6, 7, 8].filter(c => c !== majCol)[rng.int(0, 2)];
      const nMaj = rng.int(3, 4), nMin = rng.int(1, 2);   // majority strictly larger
      const specs = [];
      for (let i = 0; i < nMaj; i++) specs.push({ cells: shapeCells(SOLID[rng.int(0, 3)], rng.int(2, 4)), color: majCol });
      for (let i = 0; i < nMin; i++) specs.push({ cells: shapeCells(SOLID[rng.int(0, 3)], rng.int(2, 4)), color: minCol });
      const placed = placeRoster(rng, H, W, specs);
      const IN = render(H, W, placed);
      const out = placed.map(o => ({ ...o, color: majCol }));
      return { in: IN, out: render(H, W, out) };
    }
  },
};

function buildFamilyTask(famKey, rng, nEx) {
  const fam = FAMILIES[famKey];
  const examples = []; for (let i = 0; i < nEx; i++) { const p = fam.make(rng); examples.push({ in: [p.in], out: [p.out] }); }
  const test = fam.make(rng);
  const width = test.in[0].length, height = test.in.length;
  const id = "P-" + crypto.createHash("sha1").update(JSON.stringify([examples, test])).digest("hex").slice(0, 8);
  return {
    format: "prodigy-task", version: 1, width, height, palette: "arc10", fps: 1,
    examples, in: [test.in], out: [test.out],
    meta: { id, rule: fam.rule, concepts: fam.concept, difficulty: 0.8, template: "prog:" + famKey, source: "program-first", n_examples: nEx, teaching: { ok: true, coherent: true, examplesVary: true } },
  };
}

if (require.main === module) {
  const args = process.argv.slice(2); const f = { n: 30, out: "out/hard.jsonl" };
  for (let i = 0; i < args.length; i++) { if (args[i] === "--n") f.n = +args[++i]; else if (args[i] === "-o") f.out = args[++i]; else if (args[i] === "--seed") f.seed = +args[++i]; }
  const fs = require("fs"), path = require("path");
  const keys = Object.keys(FAMILIES); const rng = E.makeRng((f.seed || 1) * 2654435761 + 11);
  const out = [], seen = new Set(); let attempts = 0, trivialDrop = 0;
  while (out.length < f.n && attempts < f.n * 40) {
    attempts++;
    const fam = keys[rng.int(0, keys.length - 1)];
    const t = buildFamilyTask(fam, rng, rng.int(3, 4));
    // baseline-hard filter + dedup
    const triv = B.trivialSolve(t); if (triv) { trivialDrop++; continue; }
    if (seen.has(t.meta.id)) continue; seen.add(t.meta.id);
    out.push(t);
  }
  fs.mkdirSync(path.dirname(f.out) || ".", { recursive: true });
  fs.writeFileSync(f.out, out.map(t => JSON.stringify(t)).join("\n") + "\n");
  const byFam = {}; out.forEach(t => byFam[t.meta.template] = (byFam[t.meta.template] || 0) + 1);
  console.log(`gen_hard → ${f.out}  (${out.length} tasks, ${trivialDrop} trivial dropped, ${attempts} attempts)`);
  console.log("  by family: " + Object.entries(byFam).map(([k, v]) => k + ":" + v).join("  "));
}
module.exports = { FAMILIES, buildFamilyTask };
