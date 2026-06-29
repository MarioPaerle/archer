#!/usr/bin/env node
/* arc_search.js — the PIVOT keystone (see HANDOVER_PIVOT.md).
 *
 * v1's verifier was a FLAT enumeration of one-pass hypotheses, so the hardest task it could ever emit
 * was the hardest single-line rule it pattern-matched. This module replaces the recognizer with a
 * bounded-depth COMPOSITIONAL SEARCH solver: it searches programs p = op_k ∘ … ∘ op_1 over a DSL and
 * certifies a task by what the SEARCH can re-derive, not by what a template hand-wrote.
 *
 * A task is HARD-VALID iff:
 *   - search finds a program that reproduces every train pair  (solvable),
 *   - the MINIMAL solving depth is ≥ minDepth (≥3)             (no shorter program fits ⇒ genuinely deep),
 *   - the minimal programs AGREE on the held-out test output    (determined, not ambiguous),
 *   - and (optionally) the rule needs ≥ minObs train pairs to pin (under-determination).
 * The hardest emittable task is now the SEARCH HORIZON, not a one-liner. That is what breaks the ceiling.
 *
 * Difficulty is a VERIFIED, SCORED axis: difficulty(task) → { solvable, depth, unique, obsNeeded, score, verdict }.
 *
 *   node arc_search.js --self-test
 */
const S = require("./solver.js");
const seg = S.segObjects;

// ---------------- grid helpers (self-contained) ----------------
const H = g => g.length, W = g => g[0].length;
const clone = g => g.map(r => r.slice());
const blank = (h, w) => Array.from({ length: h }, () => new Array(w).fill(0));
const eqG = (a, b) => a.length === b.length && a[0].length === b[0].length && a.every((r, i) => r.every((x, j) => x === b[i][j]));
const key = g => g.map(r => r.join("")).join("/");
const keyTuple = gs => gs.map(key).join("|");
const flipH = g => g.map(r => r.slice().reverse());
const flipV = g => g.slice().reverse().map(r => r.slice());
const rot180 = g => flipH(flipV(g));
const transpose = g => g[0].map((_, c) => g.map(r => r[c]));
const rot90 = g => transpose(g).map(r => r.slice().reverse());   // clockwise
const rot270 = g => transpose(flipH(g));
const colorsOf = gs => { const s = new Set(); for (const g of gs) for (const row of g) for (const x of row) if (x) s.add(x); return [...s].sort((a, b) => a - b); };
function gridFrom(h, w, objs) {
  const g = blank(h, w);
  for (const o of objs) for (let i = 0; i < o.loc.length; i++) for (let j = 0; j < o.loc[0].length; j++) {
    const v = o.loc[i][j]; if (v && o.r + i >= 0 && o.c + j >= 0 && o.r + i < h && o.c + j < w) g[o.r + i][o.c + j] = v;
  }
  return g;
}
function cropContent(g) {
  let r0 = 1e9, r1 = -1, c0 = 1e9, c1 = -1;
  for (let r = 0; r < H(g); r++) for (let c = 0; c < W(g); c++) if (g[r][c]) { r0 = Math.min(r0, r); r1 = Math.max(r1, r); c0 = Math.min(c0, c); c1 = Math.max(c1, c); }
  if (r1 < 0) return null;
  const o = []; for (let r = r0; r <= r1; r++) o.push(g[r].slice(c0, c1 + 1)); return o;
}
function outlineLoc(loc) {                       // hollow an object: keep only border cells of each solid run
  const h = loc.length, w = loc[0].length, o = loc.map(r => r.slice());
  for (let i = 0; i < h; i++) for (let j = 0; j < w; j++) {
    if (!loc[i][j]) continue;
    const interior = i > 0 && i < h - 1 && j > 0 && j < w - 1 && loc[i - 1][j] && loc[i + 1][j] && loc[i][j - 1] && loc[i][j + 1];
    if (interior) o[i][j] = 0;
  }
  return o;
}
function gravity(g, dir) {
  const objs = seg(g); if (!objs.length) return null;
  const h = H(g), w = W(g);
  // settle each object as a rigid body until it hits a wall or another settled object
  const occ = blank(h, w);
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
function extremeMask(g, which) {                 // keep / remove the single largest|smallest object
  const objs = seg(g); if (objs.length < 2) return null;
  const areas = objs.map(o => o.area), ext = which === "largest" ? Math.max(...areas) : Math.min(...areas);
  const sel = objs.filter(o => o.area === ext); if (sel.length !== 1) return null;   // must be UNIQUE to be well-defined
  return sel[0];
}
/* applyLegend — SYMBOL GROUNDING (axis C). A full-height single-colour DIVIDER splits the grid into a KEY
 * panel (left) and a WORK panel (right). Each key row holds [src, tgt] swatches → a recolour instruction. The
 * op PARSES the key and applies it to the work panel only. The rule lives in the image, not in the weights: a
 * different key per example forces the model to learn the abstraction "read the key, apply it" — it cannot
 * memorise a fixed mapping. Returns null when there is no parseable key (so it no-ops on ordinary grids). */
function findDivider(g) {                         // leftmost full-height single-colour column with room on both sides
  const h = g.length, w = g[0].length;
  for (let c = 2; c <= w - 2; c++) { const v = g[0][c]; if (v && g.every(row => row[c] === v)) return c; }
  return -1;
}
function parseLegend(g, d) {                       // key panel cols 0..d-1: per row, first nonzero = src, next = tgt
  const map = {};
  for (let r = 0; r < g.length; r++) { const cells = []; for (let c = 0; c < d; c++) if (g[r][c]) cells.push(g[r][c]); if (cells.length >= 2) map[cells[0]] = cells[1]; }
  return map;
}
function applyLegend(g) {
  const d = findDivider(g); if (d < 0) return null;
  const map = parseLegend(g, d); if (!Object.keys(map).length) return null;
  const o = g.map(r => r.slice());
  for (let r = 0; r < o.length; r++) for (let c = d + 1; c < o[0].length; c++) { const x = o[r][c]; if (x && x in map) o[r][c] = map[x]; }
  return o;
}
/* splitTwoPanels — for boolean/set-logic: a full-height divider splits the grid into two equal-width panels. */
function splitTwoPanels(g) {
  const d = findDivider(g); if (d < 0) return null;
  const left = [], right = [];
  for (const row of g) { left.push(row.slice(0, d)); right.push(row.slice(d + 1)); }
  if (!left[0].length || left[0].length !== right[0].length) return null;
  return [left, right];
}

// ---------------- the DSL: each op maps grid→grid|null; parameterized ops expand against the live grids ----------------
// op.variants(grids) → [{ label, fn }]   (grids = the CURRENT intermediate grids across all train pairs)
const nullary = (label, fn) => ({ label, variants: () => [{ label, fn }] });
function safe(fn) { return g => { try { const r = fn(g); return r && r.length && r[0].length ? r : null; } catch { return null; } }; }

const OPS = [
  // ---- geometry (information-preserving) ----
  nullary("flipH", safe(flipH)),
  nullary("flipV", safe(flipV)),
  nullary("rot90", safe(rot90)),
  nullary("rot180", safe(rot180)),
  nullary("rot270", safe(rot270)),
  nullary("transpose", safe(transpose)),
  // ---- structural (object-level, mostly irreversible ⇒ they don't collapse into geometry) ----
  nullary("gravity_down", safe(g => gravity(g, "down"))),
  nullary("gravity_up", safe(g => gravity(g, "up"))),
  nullary("gravity_left", safe(g => gravity(g, "left"))),
  nullary("gravity_right", safe(g => gravity(g, "right"))),
  nullary("fill_holes", safe(g => { const o = seg(g); for (const x of o) if (x.hasHole) x.loc = x.loc.map(r => r.map(() => x.mainColor)); return gridFrom(H(g), W(g), o); })),
  nullary("outline_all", safe(g => { const o = seg(g); for (const x of o) x.loc = outlineLoc(x.loc); return gridFrom(H(g), W(g), o); })),
  nullary("denoise", safe(g => { const o = seg(g).filter(x => x.area > 1); return o.length ? gridFrom(H(g), W(g), o) : null; })),
  nullary("keep_largest", safe(g => { const s = extremeMask(g, "largest"); return s ? gridFrom(H(g), W(g), [s]) : null; })),
  nullary("keep_smallest", safe(g => { const s = extremeMask(g, "smallest"); return s ? gridFrom(H(g), W(g), [s]) : null; })),
  nullary("remove_largest", safe(g => { const s = extremeMask(g, "largest"); if (!s) return null; const o = seg(g).filter(x => x.area !== s.area || x.r !== s.r || x.c !== s.c); return gridFrom(H(g), W(g), o); })),
  nullary("remove_smallest", safe(g => { const s = extremeMask(g, "smallest"); if (!s) return null; const o = seg(g).filter(x => x.area !== s.area || x.r !== s.r || x.c !== s.c); return gridFrom(H(g), W(g), o); })),
  nullary("complete_sym_h", safe(g => { const m = flipH(g); return g.map((row, r) => row.map((x, c) => x || m[r][c])); })),
  nullary("complete_sym_v", safe(g => { const m = flipV(g); return g.map((row, r) => row.map((x, c) => x || m[r][c])); })),
  // ---- symbol-grounding: read an in-grid KEY region and apply it elsewhere (axis-C interaction) ----
  nullary("apply_legend", safe(applyLegend)),
  // ---- size-changing terminal-ish ops ----
  nullary("crop_content", safe(cropContent)),
  // ---- color (parameterized — grounded in the colours actually present) ----
  {
    label: "recolor_all",
    variants: grids => colorsOf(grids).map(c => ({ label: "recolor_all:" + c, fn: safe(g => g.map(r => r.map(x => x ? c : 0))) })),
  },
  {
    label: "swap",
    variants: grids => {
      const cs = colorsOf(grids), out = [];
      for (let i = 0; i < cs.length; i++) for (let j = i + 1; j < cs.length; j++) {
        const a = cs[i], b = cs[j];
        out.push({ label: `swap:${a},${b}`, fn: safe(g => g.map(r => r.map(x => x === a ? b : x === b ? a : x))) });
      }
      return out;
    },
  },
  // ---- counting / number (axis E): count objects of a colour, render the count as a bar ----
  {
    label: "count_bar",
    variants: grids => {
      const out = [];
      const cs = new Set(); for (const g of grids) for (const o of seg(g)) cs.add(o.mainColor);
      for (const c of cs) for (const orient of ["row", "col"]) {
        out.push({ label: `count_bar:${c},${orient}`, fn: safe(g => {
          const n = seg(g).filter(o => o.mainColor === c).length; if (n < 1) return null;
          return orient === "row" ? [new Array(n).fill(c)] : Array.from({ length: n }, () => [c]);
        }) });
      }
      return out;
    },
  },
  // ---- set logic / boolean (axis E): cellwise AND/OR/XOR/diff of two divider-split panels ----
  {
    label: "bool_combine",
    variants: grids => {
      if (!grids.some(g => findDivider(g) >= 0)) return [];      // only when a divider splits two panels
      const out = []; const cs = colorsOf(grids);
      for (const op of ["and", "or", "xor", "diff"]) for (const col of cs) {
        out.push({ label: `bool:${op},${col}`, fn: safe(g => {
          const p = splitTwoPanels(g); if (!p) return null;
          const [A, B] = p, h = A.length, w = A[0].length, o = Array.from({ length: h }, () => new Array(w).fill(0));
          for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) {
            const a = A[r][c] ? 1 : 0, b = B[r][c] ? 1 : 0;
            const v = op === "and" ? (a && b) : op === "or" ? (a || b) : op === "xor" ? (a ^ b) : (a && !b);
            if (v) o[r][c] = col;
          }
          return o;
        }) });
      }
      return out;
    },
  },
];

// ---------------- bounded compositional search ----------------
/* solveTrain(train, {maxDepth, maxStates}) → { found, depth, programs:[[opLabel…]…], applyProgram }
 * Level-synchronous BFS over the TUPLE of (one intermediate grid per train pair). The goal is reached
 * when every intermediate grid equals its train OUTPUT. We expand whole levels so that at the minimal
 * depth we collect ALL solving programs (needed for the uniqueness check). */
function buildVariants(grids) {                  // expand the parameterized DSL against the current grids
  const out = [];
  for (const op of OPS) for (const v of op.variants(grids)) out.push(v);
  return out;
}
function applyProgram(prog, grid) {
  let g = grid;
  for (const step of prog) { g = step.fn(g); if (!g) return null; }
  return g;
}

/* fitColorMap: the learned, cross-pair UNDER-DETERMINATION op. Find a single global colour map M that
 * recolours every intermediate grid into its output (same shape, SAME nonzero mask — recolour only),
 * consistent across ALL pairs and non-identity. M is fit JOINTLY over the pairs, so it can only be pinned
 * by observing each source colour somewhere — split colours across pairs ⇒ ≥3 observations required.
 * Returns { map, srcSeen } or null. */
function fitColorMap(grids, outs) {
  const M = {}; const srcSeen = new Set();
  for (let p = 0; p < grids.length; p++) {
    const a = grids[p], b = outs[p];
    if (a.length !== b.length || a[0].length !== b[0].length) return null;
    for (let r = 0; r < a.length; r++) for (let c = 0; c < a[0].length; c++) {
      const x = a[r][c], y = b[r][c];
      if ((x === 0) !== (y === 0)) return null;     // a colour map must preserve the figure/ground mask
      if (x === 0) continue;
      srcSeen.add(x);
      if (x in M) { if (M[x] !== y) return null; } else M[x] = y;
    }
  }
  if (!srcSeen.size) return null;
  if ([...srcSeen].every(x => M[x] === x)) return null;   // identity ⇒ not a real op
  return { map: M, srcSeen };
}
function cmapStep(M) {
  return { label: "colormap:" + JSON.stringify(M), map: M, fn: g => g.map(r => r.map(x => (x && x in M) ? M[x] : x)) };
}

/* solveTrain — level-synchronous BFS over the TUPLE of (one intermediate grid per train pair). Goal = every
 * intermediate equals its train OUTPUT. We expand whole levels so that at the minimal depth we collect ALL
 * solving programs (needed for the uniqueness check). With allowColorMap, every frontier may additionally
 * close via a learned colormap terminal step (one extra depth) — the certifiable under-determination route. */
function solveTrain(train, opts = {}) {
  const maxDepth = opts.maxDepth ?? 3, maxStates = opts.maxStates ?? 200000, allowColorMap = opts.allowColorMap ?? false;
  const ins = train.map(t => t.in), outs = train.map(t => t.out);
  const goal = grids => grids.every((g, i) => eqG(g, outs[i]));
  const collect = states => { const progs = [], pk = new Set(); for (const s of states) { const lab = s.prog.map(x => x.label).join(">"); if (!pk.has(lab)) { pk.add(lab); progs.push(s.prog); } } return progs; };
  // colormap solutions reachable from a frontier at distance d → depth d+1
  const cmapGoals = level => !allowColorMap ? [] : level.map(st => { const fit = fitColorMap(st.grids, outs); return fit ? { grids: outs, prog: st.prog.concat([cmapStep(fit.map)]) } : null; }).filter(Boolean);

  let prev = null, cur = [{ grids: ins, prog: [] }];
  const seen = new Set([keyTuple(ins)]);
  let nStates = 1;
  for (let depth = 0; depth <= maxDepth; depth++) {
    // goals AT depth: direct goals among distance-`depth` states + colormap closures from distance-(depth-1)
    const direct = cur.filter(st => goal(st.grids));
    const viaMap = (depth >= 1 && prev) ? cmapGoals(prev) : (depth === 0 ? [] : []);
    if (direct.length || viaMap.length) return { found: true, depth, programs: collect(direct.concat(viaMap)), applyProgram };
    if (depth === maxDepth) break;
    // expand cur (distance depth) → next (distance depth+1)
    const next = [];
    for (const st of cur) {
      for (const v of buildVariants(st.grids)) {
        const ng = []; let ok = true;
        for (const g of st.grids) { const r = v.fn(g); if (!r) { ok = false; break; } ng.push(r); }
        if (!ok) continue;
        const k = keyTuple(ng);
        if (seen.has(k)) continue;                // dedup: never revisit an identical intermediate tuple
        seen.add(k); nStates++;
        next.push({ grids: ng, prog: st.prog.concat([v]) });
        if (nStates > maxStates) break;
      }
      if (nStates > maxStates) break;
    }
    prev = cur; cur = next;
    if (!cur.length || nStates > maxStates) {
      // last chance: a colormap closure from the final frontier (depth+1)
      const tail = cmapGoals(prev);
      if (tail.length && depth + 1 <= maxDepth) return { found: true, depth: depth + 1, programs: collect(tail), applyProgram };
      break;
    }
  }
  return { found: false, depth: Infinity, programs: [], applyProgram };
}

// ---------------- task-level API (prodigy-task format) ----------------
function trainPairsOf(task) {                     // {examples:[{in:[grid],out:[grid]}…]} → [{in,out}…]
  return task.examples.map(e => ({ in: e.in[0], out: e.out[0] }));
}
function testOf(task) { return { in: task.in[0], out: task.out ? task.out[0] : null }; }

/* colorsOfGrid: nonzero colours present in one grid. */
const colorsOfGrid = g => { const s = new Set(); for (const row of g) for (const x of row) if (x) s.add(x); return s; };
/* covers: a colormap-terminal program is only DETERMINED on the test if every nonzero colour the test grid
 * feeds into the map was constrained by the train (seen as a source). An unseen test colour ⇒ the rule never
 * specified its image ⇒ genuinely ambiguous (this is real under-determination, must be rejected, not faked). */
function programCoversTest(prog, testIn) {
  const last = prog[prog.length - 1];
  if (!last || !last.map) return true;                       // non-colormap programs are fully determined
  let g = testIn; for (let i = 0; i < prog.length - 1; i++) { g = prog[i].fn(g); if (!g) return false; }
  for (const c of colorsOfGrid(g)) if (!(c in last.map)) return false;
  return true;
}

/* solveTask: search the train, then PREDICT the test. Returns the determined prediction + whether it is unique. */
function solveTask(task, opts = {}) {
  const o = { allowColorMap: true, ...opts };
  const train = trainPairsOf(task), test = testOf(task);
  const res = solveTrain(train, o);
  if (!res.found) return { solvable: false, depth: Infinity, unique: false, prediction: null, programs: 0 };
  const covered = res.programs.every(p => programCoversTest(p, test.in));
  const preds = res.programs.map(p => applyProgram(p, test.in)).filter(Boolean);
  const distinct = new Set(preds.map(key));
  return {
    solvable: true, depth: res.depth, programs: res.programs.length,
    unique: covered && distinct.size === 1, prediction: preds[0] || null,
    programLabels: res.programs.map(p => p.map(s => s.label).join(" |> ")),
  };
}

/* obsNeeded: the smallest k such that searching on only k train pairs pins a program that ALSO fits the
 * remaining pairs. k≥3 ⇒ genuinely under-determined (no 1 or 2 pairs reveal the rule). */
function obsNeeded(task, opts = {}) {
  const o = { allowColorMap: true, ...opts };
  const train = trainPairsOf(task);
  const full = solveTrain(train, o);
  if (!full.found) return Infinity;
  for (let k = 1; k <= train.length; k++) {
    const sub = train.slice(0, k);
    const r = solveTrain(sub, { ...o, maxDepth: full.depth });
    if (!r.found) continue;
    // does ANY program found on the first k pairs reproduce ALL pairs at depth ≤ full.depth?
    const pins = r.programs.some(p => train.every(t => { const o = applyProgram(p, t.in); return o && eqG(o, t.out); }));
    if (pins) return k;
  }
  return train.length;                            // never pinned by a strict subset ⇒ needs all of them
}

/* difficulty: the VERIFIED, SCORED difficulty axis the pivot is built around. */
function difficulty(task, opts = {}) {
  const minDepth = opts.minDepth ?? 3;
  const s = solveTask(task, opts);
  if (!s.solvable) return { solvable: false, depth: Infinity, unique: false, obsNeeded: Infinity, tooEasy: false, score: 0, verdict: "unsolved" };
  const obs = obsNeeded(task, opts);
  const tooEasy = s.depth < minDepth;
  // score rewards depth, multi-observation under-determination, and a single determined answer
  const score = s.depth * 10 + Math.max(0, obs - 1) * 5 + (s.unique ? 5 : 0) - (s.programs - 1);
  const verdict = (!tooEasy && s.unique) ? "hard-valid" : tooEasy ? "too-easy" : "ambiguous";
  return { solvable: true, depth: s.depth, unique: s.unique, programs: s.programs, obsNeeded: obs, tooEasy, score, verdict };
}

module.exports = { OPS, solveTrain, solveTask, obsNeeded, difficulty, applyProgram, trainPairsOf, testOf, _h: { gravity, cropContent, outlineLoc, applyLegend, findDivider, parseLegend } };

// ---------------- self-test ----------------
function selfTest() {
  // tiny seeded RNG (no Date/Math.random dependence in logic)
  let s = 12345; const rnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const ri = n => Math.floor(rnd() * n);
  // place K non-overlapping solid rectangles of DISTINCT sizes & colours on a blank grid
  function scene(h, w, k) {
    const g = blank(h, w); const used = []; let placed = 0, tries = 0;
    const sizes = []; while (sizes.length < k) { const a = 1 + ri(3), b = 1 + ri(3); if (!sizes.some(z => z[0] * z[1] === a * b)) sizes.push([a, b]); }
    while (placed < k && tries < 500) {
      tries++; const [rh, rw] = sizes[placed]; const r0 = ri(h - rh + 1), c0 = ri(w - rw + 1);
      let clash = false;
      for (let i = -1; i <= rh && !clash; i++) for (let j = -1; j <= rw && !clash; j++) { const y = r0 + i, x = c0 + j; if (y >= 0 && y < h && x >= 0 && x < w && g[y][x]) clash = true; }
      if (clash) continue;
      const col = placed + 1;
      for (let i = 0; i < rh; i++) for (let j = 0; j < rw; j++) g[r0 + i][c0 + j] = col;
      used.push(col); placed++;
    }
    return placed === k ? g : null;
  }
  function makeTask(progFns, nPairs, h, w, k) {
    const examples = []; let guard = 0;
    while (examples.length < nPairs && guard < 2000) {
      guard++; const inG = scene(h, w, k); if (!inG) continue;
      let outG = inG; for (const f of progFns) { outG = f(outG); if (!outG) break; }
      if (!outG || eqG(outG, inG)) continue;
      examples.push({ in: [inG], out: [outG] });
    }
    const inG = scene(h, w, k); let outG = inG; for (const f of progFns) outG = f(outG);
    return { examples, in: [inG], out: [outG] };
  }
  let pass = 0, fail = 0;
  const ok = (name, cond, extra = "") => { if (cond) { pass++; console.log("  ✓ " + name + (extra ? "  " + extra : "")); } else { fail++; console.log("  ✗ " + name + "  " + extra); } };

  console.log("arc_search self-test");

  // (1) a genuine 3-STEP task v1's flat solver cannot represent: remove_smallest |> gravity_down |> outline_all
  const prog3 = [g => gridFrom(H(g), W(g), (() => { const m = extremeMask(g, "smallest"); return seg(g).filter(x => !(m && x.r === m.r && x.c === m.c && x.area === m.area)); })()),
                 g => gravity(g, "down"),
                 g => { const o = seg(g); for (const x of o) x.loc = outlineLoc(x.loc); return gridFrom(H(g), W(g), o); }];
  const hard = makeTask(prog3, 4, 9, 9, 4);
  const dH = difficulty(hard, { maxDepth: 3 });
  ok("3-step task is SOLVED by search", dH.solvable, JSON.stringify({ depth: dH.depth }));
  ok("3-step task minimal depth === 3 (no shorter program fits)", dH.depth === 3);
  ok("3-step task is NOT flagged too-easy", dH.tooEasy === false, "verdict=" + dH.verdict);

  // (2) a trivial 1-STEP task must be REJECTED as too-easy
  const easy = makeTask([flipH], 4, 8, 8, 3);
  const dE = difficulty(easy, { maxDepth: 3 });
  ok("1-step task minimal depth === 1", dE.depth === 1, "depth=" + dE.depth);
  ok("1-step task flagged too-easy (rejected as not ARC-2 hard)", dE.tooEasy === true && dE.verdict === "too-easy");

  // (3) depth-2 search must FAIL on the 3-step task (the ceiling is the search horizon, proven)
  const r2 = solveTrain(trainPairsOf(hard), { maxDepth: 2 });
  ok("depth-2 search FAILS on the 3-step task", r2.found === false);

  // (4) the search's prediction on the held-out test is exactly the ground-truth output
  const sH = solveTask(hard, { maxDepth: 3 });
  ok("search reproduces the held-out test output", sH.prediction && eqG(sH.prediction, hard.out[0]));

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) process.exit(1);
}
if (require.main === module && process.argv.includes("--self-test")) selfTest();
