#!/usr/bin/env node
/* gen_count.js — a PARAMETERIZED counting task. The generator owns CORRECTNESS; it exposes "nice variables"
 * (human display conventions) for the LLM to fill (mode 2: extract human convention). Every assignment builds
 * a correct, clean task — we then test whether a small LLM fills the variables the way a human would.
 *
 * SCHEMA (the slots the LLM fills):
 *   count_what : "total" | "per_color" | "per_kind"   — what we tally
 *   orient     : "h" | "v"                              — tally direction
 *   spacing    : "flush" | "spaced"                     — pips adjacent, or separated by a gap
 *   place      : "corner" | "center" | "rows"           — where the tally/tallies sit
 *   mark       : "match" | "fixed"                      — pip colour matches the counted colour, or a fixed marker
 * A human (per Mario) tends to: per_kind/per_color · vertical · spaced · centred · match.
 */
const crypto = require("crypto");
const E = require("./engine.js");

const blank = (H, W) => Array.from({ length: H }, () => new Array(W).fill(0));
const bbox = cells => { let h = 0, w = 0; for (const [r, c] of cells) { if (r + 1 > h) h = r + 1; if (c + 1 > w) w = c + 1; } return [h, w]; };
const stamp = (g, cells, r, c, col) => { for (const [dr, dc] of cells) { const rr = r + dr, cc = c + dc; if (rr >= 0 && cc >= 0 && rr < g.length && cc < g[0].length) g[rr][cc] = col; } };
const shuffle = (rng, a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = rng.int(0, i);[a[i], a[j]] = [a[j], a[i]]; } return a; };
const shapeCells = (kind, s) => kind === "frame" ? E.buildShape("frame", [s, s]) : E.buildShape(kind, [s]);

const SCHEMA = {
  count_what: ["total", "per_color", "per_kind"],
  orient: ["h", "v"], spacing: ["flush", "spaced"], place: ["corner", "center", "rows"], mark: ["match", "fixed"],
};
function validAssignment(a) { if (!a || typeof a !== "object") return false; for (const k in SCHEMA) if (!SCHEMA[k].includes(a[k])) return false; return true; }
const HUMAN = { count_what: "per_kind", orient: "v", spacing: "spaced", place: "center", mark: "match" };

// Place a roster of {cells,...} so EVERY object is separated from every other by >= `gap` empty cells
// (Chebyshev distance) — boundaries are always clear and two objects (especially same-colour) never touch/merge
// into one blob. Rejection sampling against a dilated occupancy grid; deterministic scan + last-resort fallback
// keep it total on crowded grids (rare). Returns placed specs (order shuffled; families key off props, not index).
function placeRoster(rng, H, W, specs, gap = 1) {
  const occ = blank(H, W), placed = [];
  const free = (cells, r, c) => {
    for (const [dr, dc] of cells) {
      const rr = r + dr, cc = c + dc;
      if (rr < 0 || cc < 0 || rr >= H || cc >= W) return false;
      for (let a = -gap; a <= gap; a++) for (let b = -gap; b <= gap; b++) { const nr = rr + a, nc = cc + b; if (nr >= 0 && nc >= 0 && nr < H && nc < W && occ[nr][nc]) return false; }
    }
    return true;
  };
  const put = (sp, r, c) => { for (const [dr, dc] of sp.cells) { const rr = r + dr, cc = c + dc; if (rr >= 0 && cc >= 0 && rr < H && cc < W) occ[rr][cc] = 1; } placed.push(Object.assign({}, sp, { r, c })); };
  for (const sp of shuffle(rng, specs)) {
    const [bh, bw] = bbox(sp.cells); let done = false;
    for (let t = 0; t < 240 && !done; t++) { const r = rng.int(0, Math.max(0, H - bh)), c = rng.int(0, Math.max(0, W - bw)); if (free(sp.cells, r, c)) { put(sp, r, c); done = true; } }
    if (!done) { for (let r = 0; r <= H - bh && !done; r++) for (let c = 0; c <= W - bw && !done; c++) if (free(sp.cells, r, c)) { put(sp, r, c); done = true; } }   // deterministic gap-respecting scan
    if (!done) throw new Error("placeRoster: cannot place with gap (grid too crowded)");   // NEVER place touching — drop the task instead (gen loop catches)
  }
  return placed;
}
// render one tally of `n` pips, given orient/spacing, as a cell list anchored at (0,0).
function tallyCells(n, orient, spacing) { const step = spacing === "spaced" ? 2 : 1, o = []; for (let i = 0; i < n; i++) o.push(orient === "v" ? [i * step, 0] : [0, i * step]); return o; }
const tallyExtent = (n, orient, spacing) => { const step = spacing === "spaced" ? 2 : 1, len = n <= 0 ? 0 : (n - 1) * step + 1; return orient === "v" ? [len, 1] : [1, len]; };

// build the OUT grid: a set of tallies {n,color} laid out per `place`.
function layoutTallies(H, W, tallies, a) {
  const g = blank(H, W);
  const cellsList = tallies.map(t => ({ ext: tallyExtent(t.n, a.orient, a.spacing), t }));
  if (a.place === "rows") {                       // each tally on its own row (or column), stacked from top-left, gap 1
    let cur = 1;
    for (const { ext, t } of cellsList) { stamp(g, tallyCells(t.n, a.orient, a.spacing), a.orient === "v" ? 1 : cur, a.orient === "v" ? cur : 1, t.color); cur += (a.orient === "v" ? ext[1] : ext[0]) + 1; }
  } else if (a.place === "center") {              // tallies centred, stacked with gap 1 on the cross axis
    const totalCross = cellsList.reduce((s, x) => s + (a.orient === "v" ? x.ext[1] : x.ext[0]) + 1, -1);
    const maxMain = Math.max(...cellsList.map(x => a.orient === "v" ? x.ext[0] : x.ext[1]), 0);
    let cross = Math.max(0, Math.floor((a.orient === "v" ? W : H) / 2 - totalCross / 2));
    const mainStart = Math.max(0, Math.floor((a.orient === "v" ? H : W) / 2 - maxMain / 2));
    for (const { ext, t } of cellsList) { const r = a.orient === "v" ? mainStart : cross, c = a.orient === "v" ? cross : mainStart; stamp(g, tallyCells(t.n, a.orient, a.spacing), r, c, t.color); cross += (a.orient === "v" ? ext[1] : ext[0]) + 1; }
  } else {                                        // corner: stacked from top-left, gap 1
    let cross = 0;
    for (const { ext, t } of cellsList) { stamp(g, tallyCells(t.n, a.orient, a.spacing), a.orient === "v" ? 0 : cross, a.orient === "v" ? cross : 0, t.color); cross += (a.orient === "v" ? ext[1] : ext[0]) + 1; }
  }
  return g;
}

// size the OUTPUT to its content (a small answer grid — don't waste a giant mostly-empty grid). 1-cell margin.
function cropToContent(g, margin = 1) {
  let r0 = 1e9, r1 = -1, c0 = 1e9, c1 = -1;
  for (let r = 0; r < g.length; r++) for (let c = 0; c < g[0].length; c++) if (g[r][c]) { if (r < r0) r0 = r; if (r > r1) r1 = r; if (c < c0) c0 = c; if (c > c1) c1 = c; }
  if (r1 < 0) return [[0]];
  r0 = Math.max(0, r0 - margin); c0 = Math.max(0, c0 - margin); r1 = Math.min(g.length - 1, r1 + margin); c1 = Math.min(g[0].length - 1, c1 + margin);
  const o = []; for (let r = r0; r <= r1; r++) { const row = []; for (let c = c0; c <= c1; c++) row.push(g[r][c]); o.push(row); } return o;
}
const KINDS = ["square", "disc", "plus", "Lshape", "triangle"];
function makeInstance(rng, a) {
  const H = rng.int(15, 20), W = rng.int(15, 20);
  // a roster with a few colours and kinds, counts kept in the subitizing range
  const palette = shuffle(rng, [2, 3, 4, 6, 8]).slice(0, rng.int(2, 3));
  const kinds = shuffle(rng, KINDS).slice(0, rng.int(2, 3));
  const specs = [], counts = {};
  const N = rng.int(4, 7);
  for (let i = 0; i < N; i++) { const col = palette[rng.int(0, palette.length - 1)], kind = kinds[rng.int(0, kinds.length - 1)]; specs.push({ cells: shapeCells(kind, rng.int(2, 3)), color: col, kind }); }
  const placed = placeRoster(rng, H, W, specs);
  const IN = blank(H, W); for (const o of placed) stamp(IN, o.cells, o.r, o.c, o.color);
  // tallies per count_what
  let tallies;
  const fixed = 5;
  if (a.count_what === "total") tallies = [{ n: placed.length, color: a.mark === "match" ? (palette[0]) : fixed }];
  else if (a.count_what === "per_color") { const by = {}; for (const o of placed) by[o.color] = (by[o.color] || 0) + 1; tallies = Object.entries(by).sort((x, y) => x[0] - y[0]).map(([c, n]) => ({ n, color: a.mark === "match" ? +c : fixed })); }
  else { const by = {}; for (const o of placed) by[o.kind] = (by[o.kind] || 0) + 1; const kc = {}; placed.forEach(o => kc[o.kind] = o.color); tallies = Object.entries(by).map(([k, n]) => ({ n, color: a.mark === "match" ? kc[k] : fixed })); }
  const OUT = cropToContent(layoutTallies(H, W, tallies, a));   // small answer grid, not a giant mostly-empty one
  return { in: IN, out: OUT };
}

function buildCountTask(a, rng, nEx = 3) {
  if (!validAssignment(a)) throw new Error("invalid assignment");
  const examples = []; for (let i = 0; i < nEx; i++) examples.push((p => ({ in: [p.in], out: [p.out] }))(makeInstance(rng, a)));
  const test = makeInstance(rng, a), width = test.in[0].length, height = test.in.length;
  const id = "C-" + crypto.createHash("sha1").update(JSON.stringify([examples, test, a])).digest("hex").slice(0, 8);
  const rule = `count the shapes ${a.count_what === "total" ? "in total" : a.count_what === "per_color" ? "of each colour" : "of each kind"}; show each count as a ${a.orient === "v" ? "vertical" : "horizontal"} ${a.spacing === "spaced" ? "spaced" : ""} tally ${a.place === "center" ? "centred" : a.place === "rows" ? "in rows" : "in the corner"}, coloured ${a.mark === "match" ? "to match" : "with a fixed marker"}`;
  return { format: "prodigy-task", version: 1, width, height, palette: "arc10", fps: 1, examples, in: [test.in], out: [test.out],
    meta: { id, rule, concepts: ["counting", "cardinality", a.count_what], prior: "number", difficulty: 0.6, template: "count:" + a.count_what, source: "parameterized", assignment: a, n_examples: nEx, teaching: { ok: true, coherent: true, examplesVary: true } } };
}

module.exports = { SCHEMA, HUMAN, validAssignment, buildCountTask, makeInstance, layoutTallies, tallyCells, cropToContent, placeRoster };

if (require.main === module) {   // demo: build the HUMAN assignment + a NAIVE one, write a comparison jsonl
  const fs = require("fs"); const rng = E.makeRng(7);
  const naive = { count_what: "total", orient: "h", spacing: "flush", place: "corner", mark: "fixed" };
  const out = [buildCountTask(HUMAN, rng, 3), buildCountTask(naive, rng, 3)];
  out[0].meta.label = "HUMAN assignment"; out[1].meta.label = "NAIVE assignment";
  fs.mkdirSync("out", { recursive: true }); fs.writeFileSync("out/count_demo.jsonl", out.map(t => JSON.stringify(t)).join("\n") + "\n");
  console.log("wrote out/count_demo.jsonl — HUMAN:", JSON.stringify(HUMAN), "| NAIVE:", JSON.stringify(naive));
}
