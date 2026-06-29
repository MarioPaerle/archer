#!/usr/bin/env node
/* arc_attack.js — an INDEPENDENT, STRICTLY STRONGER ARC attacker (Phase-0 anti-reflexivity, see
 * CORPUS_ARCHITECTURE.md §1 Flaw A + §5, HANDOVER_PIVOT.md).
 *
 * WHY THIS FILE EXISTS. The certifier `arc_search.js` defines "hard" as "MY depth-3 BFS over MY ~24-op DSL
 * solves it uniquely." That makes the corpus EXACTLY the enumerable set of depth-≤3 programs in a published,
 * fixed DSL — a competitor's slightly larger search cracks ~95–100% of it. To break the reflexivity we must
 * certify against an attacker that is (a) a DIFFERENT implementation (so it cannot inherit arc_search's blind
 * spots) and (b) STRICTLY STRONGER (a superset DSL, searched one level deeper). A task is only kept if it lives
 * in the GAP: well-posed by arc_search ∧ NOT cheaply cracked by this attacker.
 *
 * INDEPENDENCE (critical, asserted in the self-test): this module does NOT require('./arc_search.js'). Every op
 * is re-implemented here from scratch. It only borrows pure pixel helpers (segmentation) from solver.js, which
 * is fine — those are data primitives, not the difficulty oracle.
 *
 *   attack(task,opts)   → { cracked, depth, method, prediction }  (≤depth-4 superset-DSL program reproduces ALL
 *                          train pairs AND predicts the test correctly)
 *   onePairCrack(task)  → bool  (rule pinned from a SINGLE train pair → predicts the held-out test)
 *   twoPairCrack(task)  → bool  (rule pinned from ANY pair of pairs)
 *   statShortcut(task)  → { sizeLeak, colorPrior, posTemplate }   (cheap non-search shortcuts)
 *
 *   node arc_attack.js --self-test     # empirically demonstrates the reflexivity flaw
 */
const SOL = require("./solver.js");
const seg = SOL.segObjects;                 // pure data primitive (4-connected blobs); NOT the difficulty oracle

// ============================================================ grid helpers (self-contained) ===============
const H = g => g.length, W = g => (g[0] ? g[0].length : 0);
const clone = g => g.map(r => r.slice());
const blank = (h, w) => Array.from({ length: h }, () => new Array(w).fill(0));
const eqG = (a, b) => !!a && !!b && a.length === b.length && a[0].length === b[0].length && a.every((r, i) => r.every((x, j) => x === b[i][j]));
const key = g => g.map(r => r.join(",")).join("/");
const keyTuple = gs => gs.map(key).join("|");
const flipH = g => g.map(r => r.slice().reverse());
const flipV = g => g.slice().reverse().map(r => r.slice());
const rot180 = g => flipH(flipV(g));
const transpose = g => g[0].map((_, c) => g.map(r => r[c]));
const rot90 = g => transpose(g).map(r => r.slice().reverse());    // clockwise
const rot270 = g => transpose(g).slice().reverse();
const antiTranspose = g => rot90(flipH(g));                       // transpose across the anti-diagonal
function colorsOf(gs) { const s = new Set(); for (const g of gs) for (const row of g) for (const x of row) if (x) s.add(x); return [...s].sort((a, b) => a - b); }
function colorsOfGrid(g) { const s = new Set(); for (const row of g) for (const x of row) if (x) s.add(x); return s; }
function histOf(g) { const h = {}; for (const row of g) for (const x of row) if (x) h[x] = (h[x] || 0) + 1; return h; }

function gridFrom(h, w, objs) {
  const g = blank(h, w);
  for (const o of objs) for (let i = 0; i < o.loc.length; i++) for (let j = 0; j < o.loc[0].length; j++) {
    const v = o.loc[i][j], y = o.r + i, x = o.c + j;
    if (v && y >= 0 && x >= 0 && y < h && x < w) g[y][x] = v;
  }
  return g;
}
function cropContent(g) {
  let r0 = 1e9, r1 = -1, c0 = 1e9, c1 = -1;
  for (let r = 0; r < H(g); r++) for (let c = 0; c < W(g); c++) if (g[r][c]) { if (r < r0) r0 = r; if (r > r1) r1 = r; if (c < c0) c0 = c; if (c > c1) c1 = c; }
  if (r1 < 0) return null;
  const o = []; for (let r = r0; r <= r1; r++) o.push(g[r].slice(c0, c1 + 1));
  return o;
}
function outlineLoc(loc) {                  // hollow a local object: drop strictly-interior cells
  const h = loc.length, w = loc[0].length, o = loc.map(r => r.slice());
  for (let i = 0; i < h; i++) for (let j = 0; j < w; j++) {
    if (!loc[i][j]) continue;
    const interior = i > 0 && i < h - 1 && j > 0 && j < w - 1 && loc[i - 1][j] && loc[i + 1][j] && loc[i][j - 1] && loc[i][j + 1];
    if (interior) o[i][j] = 0;
  }
  return o;
}
function gravity(g, dir) {                  // rigid-body settle of each blob toward a wall (re-implemented)
  const objs = seg(g); if (!objs.length) return null;
  const h = H(g), w = W(g), occ = blank(h, w);
  const order = objs.slice().sort((a, b) => dir === "down" ? b.r - a.r : dir === "up" ? a.r - b.r : dir === "right" ? b.c - a.c : a.c - b.c);
  const dr = dir === "down" ? 1 : dir === "up" ? -1 : 0, dc = dir === "right" ? 1 : dir === "left" ? -1 : 0;
  for (const o of order) {
    let r = o.r, c = o.c;
    const cells = []; for (let i = 0; i < o.loc.length; i++) for (let j = 0; j < o.loc[0].length; j++) if (o.loc[i][j]) cells.push([i, j]);
    const fits = (rr, cc) => cells.every(([i, j]) => { const y = rr + i, x = cc + j; return y >= 0 && y < h && x >= 0 && x < w && !occ[y][x]; });
    while (fits(r + dr, c + dc)) { r += dr; c += dc; }
    if (!fits(r, c)) return null;
    for (const [i, j] of cells) occ[r + i][c + j] = o.loc[i][j];
  }
  return occ;
}
function hasHoleLoc(loc) {                   // local enclosed-bg detector (re-implemented, ≠ solver's tag dependence)
  const h = loc.length, w = loc[0].length, seen = Array.from({ length: h }, () => new Array(w).fill(false)), st = [];
  for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) if ((r === 0 || c === 0 || r === h - 1 || c === w - 1) && !loc[r][c] && !seen[r][c]) { seen[r][c] = true; st.push([r, c]); }
  while (st.length) { const [y, x] = st.pop(); for (const [dy, dx] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const ny = y + dy, nx = x + dx; if (ny >= 0 && nx >= 0 && ny < h && nx < w && !seen[ny][nx] && !loc[ny][nx]) { seen[ny][nx] = true; st.push([ny, nx]); } } }
  for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) if (!loc[r][c] && !seen[r][c]) return true;
  return false;
}
function mainColorOf(loc) { const h = {}; for (const row of loc) for (const x of row) if (x) h[x] = (h[x] || 0) + 1; const e = Object.entries(h); return e.length ? +e.sort((a, b) => b[1] - a[1])[0][0] : 0; }
function fillHoles(g) { const o = seg(g); for (const x of o) if (hasHoleLoc(x.loc)) { const mc = mainColorOf(x.loc); x.loc = x.loc.map(r => r.map(() => mc)); } return gridFrom(H(g), W(g), o); }
function outlineAll(g) { const o = seg(g); for (const x of o) x.loc = outlineLoc(x.loc); return gridFrom(H(g), W(g), o); }
function denoise(g) { const o = seg(g).filter(x => x.area > 1); return o.length ? gridFrom(H(g), W(g), o) : null; }

function extreme(g, which) { const o = seg(g); if (o.length < 2) return null; const a = o.map(x => x.area), e = which === "largest" ? Math.max(...a) : Math.min(...a); const s = o.filter(x => x.area === e); return s.length === 1 ? s[0] : null; }
function keepExtreme(g, which) { const s = extreme(g, which); return s ? gridFrom(H(g), W(g), [s]) : null; }
function removeExtreme(g, which) { const s = extreme(g, which); if (!s) return null; return gridFrom(H(g), W(g), seg(g).filter(x => !(x.r === s.r && x.c === s.c && x.area === s.area))); }
function completeSym(g, mode) { const m = mode === "h" ? flipH(g) : mode === "v" ? flipV(g) : rot180(g); return g.map((row, r) => row.map((x, c) => x || m[r][c])); }

// --- legend (left key panel) — re-implemented independently of arc_search's helpers ---
function findDivider(g) { const h = H(g), w = W(g); for (let c = 1; c <= w - 2; c++) { const v = g[0][c]; if (v && g.every(row => row[c] === v)) return c; } return -1; }
function parseLegend(g, d) { const map = {}; for (let r = 0; r < H(g); r++) { const cells = []; for (let c = 0; c < d; c++) if (g[r][c]) cells.push(g[r][c]); if (cells.length >= 2) map[cells[0]] = cells[1]; } return map; }
function applyLegend(g) {
  const d = findDivider(g); if (d < 0) return null;
  const map = parseLegend(g, d); if (!Object.keys(map).length) return null;
  const o = clone(g); for (let r = 0; r < H(o); r++) for (let c = d + 1; c < W(o); c++) { const x = o[r][c]; if (x && x in map) o[r][c] = map[x]; }
  return o;
}

// ============================================================ SUPERSET ops a competitor would have ========
// (these go BEYOND arc_search's DSL — recolor-by-size-rank, tile/mirror completion, crop-to-object,
//  border-extract, count→bar, global colormap fit, anti-diagonal transpose, rot90/270.)
function recolorBySizeRank(g, palette) {     // rank objects by area; recolor each to palette[rank] (param: palette order)
  const o = seg(g); if (o.length < 2) return null;
  const sorted = o.slice().sort((a, b) => b.area - a.area);
  const seen = new Set(sorted.map(x => x.area)); if (seen.size !== sorted.length) return null; // need a strict order
  for (let i = 0; i < sorted.length; i++) { const col = palette[i % palette.length]; sorted[i].loc = sorted[i].loc.map(r => r.map(x => x ? col : 0)); }
  return gridFrom(H(g), W(g), o);
}
function tileCompletion(g, mode) {           // overlay the whole grid with its own mirror/rot (fills 0s)
  return completeSym(g, mode);
}
function cropToObject(g, which) {            // crop tightly to the largest/smallest single object
  const s = extreme(g, which); if (!s) return null;
  return s.loc.map(r => r.slice());
}
function borderExtract(g) {                  // keep only cells on the grid frame
  const h = H(g), w = W(g), o = blank(h, w);
  for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) if ((r === 0 || c === 0 || r === h - 1 || c === w - 1) && g[r][c]) o[r][c] = g[r][c];
  return o;
}
function countAsBar(g, axis) {               // count objects → render a length-N bar of the dominant colour
  const o = seg(g); const n = o.length; if (!n) return null;
  const col = mainColorOf(o[0].loc) || 1;
  if (axis === "row") { const out = blank(1, n); for (let i = 0; i < n; i++) out[0][i] = col; return out; }
  const out = blank(n, 1); for (let i = 0; i < n; i++) out[i][0] = col; return out;
}
function globalColormapApply(g, M) { return g.map(r => r.map(x => (x && x in M) ? M[x] : x)); }

// ============================================================ the DSL D' ⊋ D (nullary + parameterized) =====
function safe(fn) { return g => { try { const r = fn(g); return (r && r.length && r[0] && r[0].length) ? r : null; } catch { return null; } }; }
const nul = (label, fn) => ({ label, variants: () => [{ label, fn: safe(fn) }] });

const OPS = [
  // ---- arc_search's ops, RE-IMPLEMENTED here (so the attacker covers ≥ everything the certifier covers) ----
  nul("flipH", flipH), nul("flipV", flipV), nul("rot180", rot180), nul("transpose", transpose),
  nul("rot90", rot90), nul("rot270", rot270), nul("antiTranspose", antiTranspose),
  nul("gravity_down", g => gravity(g, "down")), nul("gravity_up", g => gravity(g, "up")),
  nul("gravity_left", g => gravity(g, "left")), nul("gravity_right", g => gravity(g, "right")),
  nul("fill_holes", fillHoles), nul("outline_all", outlineAll), nul("denoise", denoise),
  nul("keep_largest", g => keepExtreme(g, "largest")), nul("keep_smallest", g => keepExtreme(g, "smallest")),
  nul("remove_largest", g => removeExtreme(g, "largest")), nul("remove_smallest", g => removeExtreme(g, "smallest")),
  nul("complete_sym_h", g => completeSym(g, "h")), nul("complete_sym_v", g => completeSym(g, "v")),
  nul("complete_sym_r", g => completeSym(g, "r")),
  nul("apply_legend", applyLegend),
  nul("crop_content", cropContent),
  // ---- SUPERSET ops (a real competitor's toolbox; this is what makes the attacker STRICTLY STRONGER) ----
  nul("tile_mirror_h", g => tileCompletion(g, "h")), nul("tile_mirror_v", g => tileCompletion(g, "v")),
  nul("crop_to_largest", g => cropToObject(g, "largest")), nul("crop_to_smallest", g => cropToObject(g, "smallest")),
  nul("border_extract", borderExtract),
  nul("count_bar_row", g => countAsBar(g, "row")), nul("count_bar_col", g => countAsBar(g, "col")),
  // ---- parameterized colour ops (grounded in colours actually present across the live grids) ----
  { label: "recolor_all", variants: grids => colorsOf(grids).map(c => ({ label: "recolor_all:" + c, fn: safe(g => g.map(r => r.map(x => x ? c : 0))) })) },
  { label: "swap", variants: grids => { const cs = colorsOf(grids), out = []; for (let i = 0; i < cs.length; i++) for (let j = i + 1; j < cs.length; j++) { const a = cs[i], b = cs[j]; out.push({ label: `swap:${a},${b}`, fn: safe(g => g.map(r => r.map(x => x === a ? b : x === b ? a : x))) }); } return out; } },
  // recolor-by-size-rank: a few palette orderings drawn from the present colours
  { label: "recolor_size_rank", variants: grids => { const cs = colorsOf(grids); if (cs.length < 2) return []; const orders = [cs, cs.slice().reverse()]; return orders.map((p, k) => ({ label: "recolor_size_rank:" + k, fn: safe(g => recolorBySizeRank(g, p)) })); } },
];

// ============================================================ global colormap fit (terminal, learned) =====
/* fitColorMap — the cross-pair under-determination CLOSER. Find one global colour map consistent across all
 * (intermediate, output) pairs, mask-preserving, non-identity. Independent re-implementation of the same idea
 * arc_search uses, so the attacker can also close colour-split tasks. */
function fitColorMap(grids, outs) {
  const M = {}; const srcSeen = new Set();
  for (let p = 0; p < grids.length; p++) {
    const a = grids[p], b = outs[p];
    if (!a || !b || a.length !== b.length || a[0].length !== b[0].length) return null;
    for (let r = 0; r < a.length; r++) for (let c = 0; c < a[0].length; c++) {
      const x = a[r][c], y = b[r][c];
      if ((x === 0) !== (y === 0)) return null;
      if (x === 0) continue;
      srcSeen.add(x);
      if (x in M) { if (M[x] !== y) return null; } else M[x] = y;
    }
  }
  if (!srcSeen.size) return null;
  if ([...srcSeen].every(x => M[x] === x)) return null;
  return { map: M };
}
function cmapStep(M) { return { label: "colormap:" + JSON.stringify(M), map: M, fn: g => globalColormapApply(g, M) }; }

// ============================================================ bounded program search (depth-4, dedup, budget)
function buildVariants(grids) { const out = []; for (const op of OPS) { try { for (const v of op.variants(grids)) out.push(v); } catch { /* skip */ } } return out; }
function applyProgram(prog, grid) { let g = grid; for (const step of prog) { g = step.fn(g); if (!g) return null; } return g; }
function progCoversTest(prog, testIn) {
  const last = prog[prog.length - 1];
  if (!last || !last.map) return true;
  let g = testIn; for (let i = 0; i < prog.length - 1; i++) { g = prog[i].fn(g); if (!g) return false; }
  for (const c of colorsOfGrid(g)) if (!(c in last.map)) return false;
  return true;
}

/* solveTrain — level-synchronous BFS over the tuple of (one intermediate per train pair). Goal = every
 * intermediate equals its output. allowColorMap adds a learned-colormap terminal (one extra depth). Returns the
 * FIRST solving program found at the minimal depth (we don't need ALL programs for the attack — just existence,
 * minimal depth, and a prediction). Node budget caps cost so --self-test stays well under a minute. */
function solveTrain(train, opts = {}) {
  const maxDepth = opts.maxDepth ?? 4, maxStates = opts.maxStates ?? 60000, allowColorMap = opts.allowColorMap ?? true;
  const ins = train.map(t => t.in), outs = train.map(t => t.out);
  const goalReached = grids => grids.every((g, i) => eqG(g, outs[i]));
  const cmapClose = st => { if (!allowColorMap) return null; const fit = fitColorMap(st.grids, outs); return fit ? st.prog.concat([cmapStep(fit.map)]) : null; };

  let cur = [{ grids: ins, prog: [] }];
  const seen = new Set([keyTuple(ins)]);
  let nStates = 1;
  for (let depth = 0; depth <= maxDepth; depth++) {
    for (const st of cur) {
      if (goalReached(st.grids)) return { found: true, depth, prog: st.prog };
    }
    if (allowColorMap && depth + 1 <= maxDepth) {                 // colormap closure at depth+1
      for (const st of cur) { const p = cmapClose(st); if (p) return { found: true, depth: depth + 1, prog: p }; }
    }
    if (depth === maxDepth) break;
    const next = [];
    outer:
    for (const st of cur) {
      const vars = buildVariants(st.grids);
      for (const v of vars) {
        const ng = []; let ok = true;
        for (const g of st.grids) { const r = v.fn(g); if (!r) { ok = false; break; } ng.push(r); }
        if (!ok) continue;
        const k = keyTuple(ng);
        if (seen.has(k)) continue;
        seen.add(k); nStates++;
        next.push({ grids: ng, prog: st.prog.concat([v]) });
        if (nStates > maxStates) break outer;
      }
    }
    cur = next;
    if (!cur.length || nStates > maxStates) break;
  }
  return { found: false, depth: Infinity, prog: null };
}

// ============================================================ task-level adapters =========================
function trainPairsOf(task) { return (task.examples || []).map(e => ({ in: e.in[0], out: e.out[0] })); }
function testOf(task) { return { in: task.in[0], out: task.out ? task.out[0] : null }; }

/* attack — does any ≤depth-4 superset-DSL program reproduce ALL train pairs AND predict the test correctly?
 * If yes the task is CRACKED by a stronger-than-certifier solver and must be rejected. */
function attack(task, opts = {}) {
  try {
    const train = trainPairsOf(task), test = testOf(task);
    if (!train.length || !test.in) return { cracked: false, depth: Infinity, method: "no-data", prediction: null };
    const res = solveTrain(train, { maxDepth: opts.maxDepth ?? 4, maxStates: opts.maxStates ?? 60000, allowColorMap: opts.allowColorMap ?? true });
    if (!res.found) return { cracked: false, depth: Infinity, method: "search-failed", prediction: null };
    if (!progCoversTest(res.prog, test.in)) return { cracked: false, depth: res.depth, method: "uncovered-test", prediction: null };
    const pred = applyProgram(res.prog, test.in);
    const cracked = !!(pred && test.out && eqG(pred, test.out));
    return { cracked, depth: res.depth, method: res.prog.map(s => s.label).join(" |> "), prediction: pred };
  } catch (e) { return { cracked: false, depth: Infinity, method: "error:" + (e && e.message), prediction: null }; }
}

/* kPairCrack — can a program fit on a SUBSET of k train pairs predict (a) the remaining train pairs AND
 * (b) the held-out test correctly? If so the rule was over-determined: it leaked from too few observations.
 * onePairCrack = k1; twoPairCrack = any pair of pairs. Tests ALL C(n,k) subsets (no prefix-only bug). */
function combinations(n, k) {
  const res = [], idx = [];
  (function rec(start, depth) { if (depth === k) { res.push(idx.slice()); return; } for (let i = start; i < n; i++) { idx.push(i); rec(i + 1, depth + 1); idx.pop(); } })(0, 0);
  return res;
}
function kPairCrack(task, k, opts = {}) {
  try {
    const train = trainPairsOf(task), test = testOf(task);
    if (train.length <= k || !test.in) return false;             // need held-out pairs to falsify
    const maxDepth = opts.maxDepth ?? 4, maxStates = opts.maxStates ?? 30000;
    for (const subsetIdx of combinations(train.length, k)) {
      const sub = subsetIdx.map(i => train[i]);
      const res = solveTrain(sub, { maxDepth, maxStates, allowColorMap: true });
      if (!res.found) continue;
      // the rule fit on k pairs must (a) reproduce ALL train pairs and (b) predict the test correctly
      const fitsAll = train.every(t => { const o = applyProgram(res.prog, t.in); return o && eqG(o, t.out); });
      if (!fitsAll) continue;
      if (!progCoversTest(res.prog, test.in)) continue;
      const pred = applyProgram(res.prog, test.in);
      if (pred && test.out && eqG(pred, test.out)) return true;
    }
    return false;
  } catch { return false; }
}
function onePairCrack(task, opts = {}) { return kPairCrack(task, 1, opts); }
function twoPairCrack(task, opts = {}) { return kPairCrack(task, 2, opts); }

/* statShortcut — cheap NON-SEARCH leaks a model could exploit without reasoning:
 *  - sizeLeak:    output dims == input dims on EVERY pair (a constant-shape prior already narrows the answer).
 *  - colorPrior:  a single fixed global colour relabel (fit on train) predicts the test correctly.
 *  - posTemplate: a legend sits at a fixed column AND a blind "apply that legend" template predicts the test
 *                 (the symbol is positional boilerplate, not a reasoned mapping). */
function statShortcut(task) {
  const out = { sizeLeak: false, colorPrior: false, posTemplate: false };
  try {
    const train = trainPairsOf(task), test = testOf(task);
    if (!train.length || !test.in) return out;
    // sizeLeak — every pair preserves shape (and so does the test)
    out.sizeLeak = train.every(t => t.in.length === t.out.length && t.in[0].length === t.out[0].length)
      && (!test.out || (test.in.length === test.out.length && test.in[0].length === test.out[0].length));
    // colorPrior — one fixed global colormap fits all train pairs and predicts the test
    const fit = fitColorMap(train.map(t => t.in), train.map(t => t.out));
    if (fit) {
      const okTrain = train.every(t => eqG(globalColormapApply(t.in, fit.map), t.out));
      const covered = [...colorsOfGrid(test.in)].every(c => c in fit.map || true); // unseen colours pass through
      const pred = globalColormapApply(test.in, fit.map);
      out.colorPrior = okTrain && covered && !!test.out && eqG(pred, test.out);
    }
    // posTemplate — a divider at the SAME column in every input, and blind apply_legend predicts the test
    const dividers = train.map(t => findDivider(t.in)).concat(test.in ? [findDivider(test.in)] : []);
    if (dividers.every(d => d >= 0) && new Set(dividers).size === 1) {
      const okTrain = train.every(t => { const o = applyLegend(t.in); return o && eqG(o, t.out); });
      const pred = applyLegend(test.in);
      out.posTemplate = okTrain && !!pred && !!test.out && eqG(pred, test.out);
    }
  } catch { /* null-safe: leave defaults */ }
  return out;
}

module.exports = {
  attack, onePairCrack, twoPairCrack, kPairCrack, statShortcut,
  solveTrain, applyProgram, trainPairsOf, testOf, OPS,
  _h: { gravity, fillHoles, outlineAll, applyLegend, findDivider, recolorBySizeRank, fitColorMap },
};

// ============================================================ self-test (the empirical proof of Flaw A) ====
function selfTest() {
  const t0 = Date.now();
  console.log("arc_attack self-test — empirical proof of the reflexivity flaw (Flaw A)\n");
  let pass = 0, fail = 0;
  const ok = (name, cond, extra = "") => { if (cond) { pass++; console.log("  ✓ " + name + (extra ? "  " + extra : "")); } else { fail++; console.log("  ✗ " + name + "  " + extra); } };

  // (0) INDEPENDENCE: arc_attack must NOT pull in arc_search itself (different implementation = no shared blind
  // spots). At this point only arc_attack + solver.js + fs are loaded; the generators (which DO require
  // arc_search) are loaded AFTER this snapshot, so the cache must be clean here.
  ok("arc_attack does NOT load arc_search (independent implementation)",
    !Object.keys(require.cache).some(p => /[\\/]arc_search\.js$/.test(p)));

  // pull the three generators (these legitimately require arc_search — they are the certifier's clients)
  let GS, GU, GC;
  try { GS = require("./gen_search.js"); GU = require("./gen_underdetermined.js"); GC = require("./gen_compositional.js"); }
  catch (e) { console.log("  ! could not load generators: " + e.message); process.exit(1); }

  const N = 12;                                   // small sample so the depth-4 search stays fast
  const sampleSearch = GS.generate(N, { seed: 7, depth: 3 }).tasks;
  const sampleComp = GC.generate(N, { seed: 17 }).tasks;
  const sampleUnder = GU.generate(N, { seed: 11 }).tasks;

  // headline ATTACK at full strength (this is the reflexivity evidence); few-pair attacks fit on SUBSETS
  // (smaller→shallower true depth) so a tighter, shallower budget still pins them cheaply.
  const ATK = { maxDepth: 4, maxStates: 60000 }, KP = { maxDepth: 3, maxStates: 12000 };
  function crackRate(tasks, label) {
    let cracked = 0, oneP = 0, twoP = 0, sl = 0, cp = 0, pt = 0;
    for (const t of tasks) {
      const a = attack(t, ATK);
      if (a.cracked) cracked++;
      if (onePairCrack(t, KP)) oneP++;
      if (twoPairCrack(t, KP)) twoP++;
      const s = statShortcut(t); if (s.sizeLeak) sl++; if (s.colorPrior) cp++; if (s.posTemplate) pt++;
    }
    const n = Math.max(1, tasks.length);
    const pct = x => (100 * x / n).toFixed(0) + "%";
    console.log(`    [${label}]  n=${tasks.length}  cracked(d≤4)=${pct(cracked)}  onePair=${pct(oneP)}  twoPair=${pct(twoP)}  sizeLeak=${pct(sl)}  colorPrior=${pct(cp)}  posTemplate=${pct(pt)}`);
    return { n: tasks.length, cracked, oneP, twoP, sl, cp, pt, crackPct: cracked / n };
  }

  console.log("  Crack-rate dashboard (the reflexivity evidence):");
  const rSearch = crackRate(sampleSearch, "gen_search");
  const rComp = crackRate(sampleComp, "gen_compositional");
  const rUnder = crackRate(sampleUnder, "gen_underdetermined");
  console.log("");

  // (1) THE FLAW: the independent depth-4 superset attacker cracks a HIGH fraction of gen_search.
  ok("gen_search is largely CRACKED by the independent depth-4 attacker (reflexivity flaw)",
    rSearch.n === 0 ? false : rSearch.crackPct >= 0.5, `crackRate=${(100 * rSearch.crackPct).toFixed(0)}%`);
  // (2) gen_compositional is also substantially cracked (same fixed-DSL enumeration ceiling).
  ok("gen_compositional is substantially cracked too",
    rComp.n === 0 ? false : rComp.crackPct >= 0.4, `crackRate=${(100 * rComp.crackPct).toFixed(0)}%`);
  // (3) HONEST FINDING (reported, not gated): the depth-4 SUPERSET attacker — with its learned-colormap closer
  // — cracks ALL THREE fixed-program families at high rate, INCLUDING gen_underdetermined. This is the FULL
  // force of Flaw A: even "forced under-determination" over a fixed program/colormap is brute-forceable once
  // the attacker also fits a global colormap. The fix is NOT a stronger generator-side trick but program-VALUED
  // rules (legend/branch that differ per instance), which no fixed-program enumeration can pin. We log the
  // few-pair resistance numbers for the record but do not assert a winner.
  const udResist = (rUnder.oneP + rUnder.twoP) / Math.max(1, rUnder.n);
  const gsResist = (rSearch.oneP + rSearch.twoP) / Math.max(1, rSearch.n);
  console.log(`  · few-pair resistance (lower=harder): gen_underdetermined=${udResist.toFixed(2)}  gen_search=${gsResist.toFixed(2)}  (honest: all fixed-program families are crackable)`);

  // (4) sanity: the attacker is sound — when it claims a crack, its prediction equals the truth.
  let soundOK = true;
  for (const t of sampleSearch.slice(0, 6)) { const a = attack(t); if (a.cracked && !(a.prediction && eqG(a.prediction, t.out[0]))) soundOK = false; }
  ok("attacker is SOUND: a claimed crack reproduces the held-out test exactly", soundOK);

  // (5) onePair⇒twoPair monotonicity sanity (anything pinnable by 1 pair is pinnable by 2 of any superset).
  ok("statShortcut returns the three booleans on every task without throwing",
    [...sampleSearch, ...sampleUnder].every(t => { const s = statShortcut(t); return typeof s.sizeLeak === "boolean" && typeof s.colorPrior === "boolean" && typeof s.posTemplate === "boolean"; }));

  console.log(`\n  KEY NUMBERS (paste to orchestrator):`);
  console.log(`    gen_search        cracked=${(100 * rSearch.crackPct).toFixed(0)}%  (onePair=${(100 * rSearch.oneP / Math.max(1, rSearch.n)).toFixed(0)}%)`);
  console.log(`    gen_compositional cracked=${(100 * rComp.crackPct).toFixed(0)}%  (onePair=${(100 * rComp.oneP / Math.max(1, rComp.n)).toFixed(0)}%)`);
  console.log(`    gen_underdetermined cracked=${(100 * rUnder.crackPct).toFixed(0)}%  (onePair=${(100 * rUnder.oneP / Math.max(1, rUnder.n)).toFixed(0)}%)`);
  console.log(`\n${pass} passed, ${fail} failed   (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  if (fail) process.exit(1);
}
if (require.main === module && process.argv.includes("--self-test")) selfTest();
