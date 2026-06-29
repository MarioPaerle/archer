#!/usr/bin/env node
/* reasoning.js — a META-GENERATOR for abstract reasoning tasks.
 *
 * A reasoning task is a COMPOSITION of four orthogonal, interchangeable registries:
 *
 *     PRINCIPLE  ⊗  FEATURE  ⊗  STRUCTURE  ⊗  QUERY
 *
 *   FEATURE   = the abstract dimension a cell's content varies on (colour / shape / size / count).
 *   STRUCTURE = an arrangement of SLOTS + the LINES over which a principle holds (grid3x3 / row / group).
 *   PRINCIPLE = the hidden law assigning feature-values to slots (distribution / progression / constant / transform).
 *   QUERY     = what is asked / how IN differs from the full solution (complete_missing / find_odd / predict_next).
 *
 * The "Raven matrix" is NOT hard-coded — it EMERGES as the instance  distribution ⊗ colour ⊗ grid3x3 ⊗ complete_missing.
 *
 *   generate({n,seed})  → round-robins valid (principle,feature,structure,query) combos, renders the slot→value
 *                         assignment, applies the query, and KEEPS a task only if solveReasoning re-derives it
 *                         UNIQUELY, baseline.trivialSolve fails, and it teaches.
 *   solveReasoning(task)→ generic: detect the lattice/sequence, read every feature per slot, and for each
 *                         (feature,principle) check the principle HOLDS on the visible slots and DEDUCE the target,
 *                         verifying the deduction reproduces every train OUT.  This is literally "doing the reasoning".
 *   selfTest()          → asserts the four canonical KINDS + the generation acceptance bar.
 *
 *   node reasoning.js --self-test   ·   node reasoning.js --n 40 --report   ·   node reasoning.js --n 500 -o out/reasoning.jsonl
 */
const crypto = require("crypto");
const E = require("./engine.js");
const B = require("./baseline.js");
const S = require("./solver.js");
const seg = S.segObjects;

// ---------------------------------------------------------------------------
// small utilities
// ---------------------------------------------------------------------------
const blank = (H, W) => Array.from({ length: H }, () => new Array(W).fill(0));
const eqG = (a, b) => a.length === b.length && a[0].length === b[0].length && a.every((row, i) => row.every((x, j) => x === b[i][j]));
const sampleK = (rng, xs, k) => { const a = xs.slice(); for (let i = a.length - 1; i > 0; i--) { const j = rng.int(0, i);[a[i], a[j]] = [a[j], a[i]]; } return a.slice(0, k); };
const PAL = [1, 2, 3, 4, 6, 7, 8, 9];               // arc10 colours minus 5 (grey, reserved) and 0 (bg)
const CELL = 5;                                      // every cell box is CELL×CELL — wide enough for any feature render
function stampInto(out, cell, r0, c0) {              // paint a small cell-grid into out at (r0,c0)
  for (let i = 0; i < cell.length; i++) for (let j = 0; j < cell[0].length; j++) if (cell[i][j]) { const r = r0 + i, c = c0 + j; if (r >= 0 && c >= 0 && r < out.length && c < out[0].length) out[r][c] = cell[i][j]; }
}
// crop a grid to its non-bg bounding box (used by queries that return one cell)
function crop(g) { let r0 = 1e9, r1 = -1, c0 = 1e9, c1 = -1; for (let r = 0; r < g.length; r++) for (let c = 0; c < g[0].length; c++) if (g[r][c]) { r0 = Math.min(r0, r); r1 = Math.max(r1, r); c0 = Math.min(c0, c); c1 = Math.max(c1, c); } if (r1 < 0) return [[0]]; const o = []; for (let r = r0; r <= r1; r++) o.push(g[r].slice(c0, c1 + 1)); return o; }

// ---------------------------------------------------------------------------
// 1) FEATURE — an abstract dimension a cell varies on.
//    { name, ordered, domain(rng)->[values], render(value, colour)->cellGrid, read(cellObjGrid)->value }
//    `read` is given the CROPPED occupancy/colour grid of ONE slot (the union of its blobs, in a CELL box at origin).
//    Features are INTERCHANGEABLE: a principle must work over any of them via value-equality (===) and an order.
// ---------------------------------------------------------------------------

// shape patterns — each is ONE 4-connected blob inside a 3×3 box (no diagonal-only shapes ⇒ clean segmentation)
const SHAPE_PATS = {
  full:   ["111", "111", "111"],
  ring:   ["111", "101", "111"],
  plus:   ["010", "111", "010"],
  tee:    ["111", "010", "010"],
  ell:    ["100", "100", "111"],
  ushape: ["101", "101", "111"],
  hbar:   ["000", "111", "000"],
};
const SHAPE_KEYS = Object.keys(SHAPE_PATS);
function patToCell(pat, colour) { return pat.map(row => row.split("").map(ch => ch === "1" ? colour : 0)); }
// occupancy signature of a cropped slot-grid (4-connected blob occupancy), normalised to a 3×3 string when 3×3
const occSig = g => g.map(r => r.map(x => x ? 1 : 0).join("")).join("|");

const FEATURES = {
  // value = a colour; render = filled CELL square in that colour; read = the slot's dominant non-bg colour
  colour: {
    name: "colour", ordered: true, card: 3,
    domain: rng => sampleK(rng, PAL, 3),
    render: (value) => Array.from({ length: 3 }, () => new Array(3).fill(value)),
    read: g => { const cnt = {}; for (const row of g) for (const x of row) if (x) cnt[x] = (cnt[x] || 0) + 1; const e = Object.entries(cnt).sort((a, b) => b[1] - a[1]); return e.length ? +e[0][0] : null; },
  },
  // value = one of several CONNECTED 3×3 patterns; render = that blob in a fixed colour; read = occupancy signature
  shape: {
    name: "shape", ordered: false, card: 3,
    domain: rng => sampleK(rng, SHAPE_KEYS, 3),
    render: (value, colour) => patToCell(SHAPE_PATS[value], colour),
    read: g => { const sig = occSig(crop(g)); for (const k of SHAPE_KEYS) if (occSig(SHAPE_PATS[k].map(r => r.split("").map(Number))) === sig) return k; return "sig:" + sig; },
  },
  // value ∈ ordered {small,med,large,huge}; render = centred square of that side; read = area class (blob cell count)
  size: {
    name: "size", ordered: true, card: 4,
    domain: () => ["small", "med", "large", "huge"],
    render: (value, colour) => { const s = { small: 1, med: 2, large: 3, huge: 5 }[value]; const off = Math.floor((CELL - s) / 2), cell = blank(CELL, CELL); for (let i = 0; i < s; i++) for (let j = 0; j < s; j++) cell[off + i][off + j] = colour; return cell; },
    read: g => { let n = 0; for (const row of g) for (const x of row) if (x) n++; return n <= 1 ? "small" : n <= 4 ? "med" : n <= 9 ? "large" : "huge"; },
  },
  // value = n ∈ 1..4 dots; render = n separated dots (each a SEPARATE 1-cell blob); read = # of blobs in the cell
  count: {
    name: "count", ordered: true, card: 4,
    domain: () => [1, 2, 3, 4],
    render: (value, colour) => { const cell = blank(CELL, CELL); const spots = [[0, 0], [0, 2], [2, 0], [2, 2]]; for (let k = 0; k < value; k++) { const [r, c] = spots[k]; cell[r][c] = colour; } return cell; },
    read: g => { const sub = []; const H = g.length, W = g[0].length, seen = Array.from({ length: H }, () => new Array(W).fill(false)); let n = 0; for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) { if (seen[r][c] || !g[r][c]) continue; n++; const st = [[r, c]]; seen[r][c] = true; while (st.length) { const [y, x] = st.pop(); for (const [dy, dx] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const ny = y + dy, nx = x + dx; if (ny >= 0 && nx >= 0 && ny < H && nx < W && !seen[ny][nx] && g[ny][nx]) { seen[ny][nx] = true; st.push([ny, nx]); } } } } return n; },
  },
};

// ---------------------------------------------------------------------------
// 2) STRUCTURE — an arrangement of SLOTS + the LINES over which a principle holds.
//    { name, build(rng)->{slots:[{id,row,col,seqIndex,box:{r,c,h,w}}], lines:[[slotId...]], H, W, gap} }
//    lines = rows & cols for a grid; the whole sequence for a row; none/one global for a group.
// ---------------------------------------------------------------------------
const STRUCTURES = {
  grid3x3: {
    name: "grid3x3", nSlots: 9, lineLen: 3,
    build(rng) {
      const gap = rng.int(1, 2), step = CELL + gap, r0 = rng.int(1, 2), c0 = rng.int(1, 2);
      const H = r0 + 3 * step + 1, W = c0 + 3 * step + 1, slots = [];
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) slots.push({ id: `${i},${j}`, row: i, col: j, seqIndex: i * 3 + j, box: { r: r0 + i * step, c: c0 + j * step, h: CELL, w: CELL } });
      const lines = [];
      for (let i = 0; i < 3; i++) lines.push([0, 1, 2].map(j => `${i},${j}`));   // rows
      for (let j = 0; j < 3; j++) lines.push([0, 1, 2].map(i => `${i},${j}`));   // cols
      return { slots, lines, H, W };
    },
  },
  row: {
    name: "row", nSlots: 4, lineLen: 4,
    build(rng) {
      const gap = rng.int(1, 2), step = CELL + gap, r0 = rng.int(1, 3), c0 = rng.int(1, 2), N = 4;
      const H = r0 + CELL + 2, W = c0 + N * step + 1, slots = [];
      for (let j = 0; j < N; j++) slots.push({ id: `0,${j}`, row: 0, col: j, seqIndex: j, box: { r: r0, c: c0 + j * step, h: CELL, w: CELL } });
      return { slots, lines: [slots.map(s => s.id)], H, W };
    },
  },
  group: {
    name: "group", nSlots: 5, lineLen: 5,
    build(rng) {
      // k scattered slots on a coarse jitter-grid (so segmentation is clean) — one GLOBAL line, no rows/cols.
      const k = 5, gap = 2, step = CELL + gap, cols = 3, rows = 2;
      const r0 = rng.int(1, 2), c0 = rng.int(1, 2), H = r0 + rows * step + 1, W = c0 + cols * step + 1;
      const cellsXY = []; for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) cellsXY.push([i, j]);
      const chosen = sampleK(rng, cellsXY, k), slots = [];
      chosen.forEach(([i, j], idx) => slots.push({ id: `g${idx}`, row: i, col: j, seqIndex: idx, box: { r: r0 + i * step, c: c0 + j * step, h: CELL, w: CELL } }));
      return { slots, lines: [slots.map(s => s.id)], H, W };
    },
  },
};

// ---------------------------------------------------------------------------
// 3) PRINCIPLE — the hidden law assigning feature-values to slots.
//    { name, applicableTo(feature,structure)->bool,
//      assign(slots,lines,feature,rng,domain)->Map(slotId->value),
//      holds(valueOfSlot, structure, feature)->bool   (is the law satisfied by the read values?)
//      deduce(known:Map, slots, lines, feature, targetId)->value|null }
//    deduce fills the target slot from the law; holds verifies a hypothesis against an example.
// ---------------------------------------------------------------------------
const lineOf = (lines, id) => lines.filter(L => L.includes(id));
function orderIndex(feature, domain, v) { const i = domain.indexOf(v); return i; }

const PRINCIPLES = {
  // each LINE is a permutation of |domain| values (Latin); deduce = the value absent from the slot's lines.
  distribution: {
    name: "distribution",
    applicableTo: (f, st) => st.lineLen === 3 && st.name === "grid3x3",   // needs |domain|=3 == slots-per-line and intersecting lines
    assign(slots, lines, feature, rng, domain) {
      // a random 3×3 Latin square over domain indices, laid on the grid rows/cols
      const base = sampleK(rng, [0, 1, 2], 3), L = [0, 1, 2].map(i => base.map((_, j) => base[(j + i) % 3]));
      if (rng.int(0, 1)) L.reverse();
      const map = new Map();
      for (const s of slots) map.set(s.id, domain[L[s.row][s.col]]);
      return map;
    },
    holds(valOf, structure, feature, lines, domain, slots) {
      // the EFFECTIVE alphabet is exactly the distinct values present (an ordered feature may carry unused extras).
      const seen = (slots || []).map(s => valOf(s.id)).filter(v => v != null);
      const k = new Set(seen.map(String)).size;
      if (k < 2) return false;                              // a degenerate single-value grid is not a distribution
      for (const L of lines) { const vs = L.map(id => valOf(id)).filter(v => v != null); if (new Set(vs.map(String)).size !== vs.length) return false; if (vs.length === L.length && vs.length !== k) return false; }
      return true;
    },
    deduce(known, slots, lines, feature, targetId, domain) {
      // restrict the alphabet to the values ACTUALLY used in this puzzle (robust to extra ordered domain values).
      const used = [...new Set([...known.values()].filter(v => v != null).map(String))];
      // value absent from EACH intersecting line; they must agree
      const cands = lineOf(lines, targetId).map(L => { const present = new Set(L.filter(id => id !== targetId).map(id => known.get(id)).filter(v => v != null).map(String)); const miss = used.filter(v => !present.has(v)); return miss.length === 1 ? miss[0] : null; });
      const ok = cands.filter(Boolean); if (!ok.length || new Set(ok).size !== 1) return null;
      const v = ok[0]; return [...known.values()].find(d => String(d) === v);
    },
  },

  // values are an ORDERED domain increasing by a constant step along each line; deduce = extend the arithmetic step.
  progression: {
    name: "progression",
    // a sequence on a ROW only (independent row+col progressions on a grid are over-constrained / degenerate),
    // and the ordered domain must be long enough for a non-trivial step across the whole row.
    applicableTo: (f, st) => f.ordered && st.name === "row" && f.card >= st.nSlots,
    assign(slots, lines, feature, rng, domain) {
      const map = new Map();
      // pick a per-line arithmetic walk on domain indices: start + k*step stays in range across the line
      for (const L of lines) {
        const n = L.length, maxStart = domain.length - 1, dir = rng.int(0, 1) ? 1 : -1;
        // choose step so the whole line fits the ordered domain
        let step = 1, start;
        const room = Math.floor((domain.length - 1) / (n - 1)) || 0;
        step = (room >= 1 ? rng.int(1, Math.max(1, room)) : 1) * dir;
        if (step > 0) start = rng.int(0, domain.length - 1 - step * (n - 1));
        else start = rng.int(-step * (n - 1), domain.length - 1);
        for (let k = 0; k < n; k++) { const id = L[k], idx = start + step * k; if (!map.has(id)) map.set(id, domain[idx]); }
      }
      return map;
    },
    holds(valOf, structure, feature, lines, domain) {
      for (const L of lines) {
        const idxs = L.map(id => orderIndex(feature, domain, valOf(id)));
        if (idxs.some(i => i < 0)) return false;
        const d0 = idxs[1] - idxs[0];
        for (let k = 1; k < idxs.length; k++) if (idxs[k] - idxs[k - 1] !== d0) return false;
        if (d0 === 0) return false;   // a constant line is not a progression
      }
      return true;
    },
    deduce(known, slots, lines, feature, targetId, domain) {
      const L = lineOf(lines, targetId).find(L => L.filter(id => id !== targetId && known.get(id) != null).length >= 2);
      if (!L) return null;
      const pos = L.indexOf(targetId), idxs = L.map(id => id === targetId ? null : orderIndex(feature, domain, known.get(id)));
      // find the constant step from two known consecutive (or any two known) positions
      let step = null;
      for (let a = 0; a < L.length; a++) for (let b = a + 1; b < L.length; b++) if (idxs[a] != null && idxs[b] != null) { const s = (idxs[b] - idxs[a]) / (b - a); if (!Number.isInteger(s)) return null; if (step == null) step = s; else if (step !== s) return null; }
      if (step == null || step === 0) return null;
      const anchor = L.findIndex((id, k) => idxs[k] != null);
      const idx = idxs[anchor] + step * (pos - anchor);
      return (idx >= 0 && idx < domain.length) ? domain[idx] : null;
    },
  },

  // all slots the SAME value except exactly ONE "odd" slot — odd-one-out.
  constant: {
    name: "constant",
    applicableTo: (f, st) => st.name === "group" || st.name === "row",
    assign(slots, lines, feature, rng, domain) {
      const [base, odd] = sampleK(rng, domain, 2), map = new Map();
      const oddIdx = rng.int(0, slots.length - 1);
      slots.forEach((s, i) => map.set(s.id, i === oddIdx ? odd : base));
      return map;
    },
    holds(valOf, structure, feature, lines, domain, slots) {
      const vals = slots.map(s => valOf(s.id));
      const cnt = {}; for (const v of vals) cnt[String(v)] = (cnt[String(v)] || 0) + 1;
      const singles = Object.entries(cnt).filter(([, n]) => n === 1);
      const majority = Object.entries(cnt).some(([, n]) => n >= 2);
      return singles.length === 1 && majority && Object.keys(cnt).length === 2;
    },
    deduce() { return null; },   // constant has no "missing" slot; it pairs with find_odd (handled by the query)
  },

  // for paired lines (grid rows/cols), line[k] = T(line[k-1]) where T is a feature-level transform (next-in-cycle).
  // deduce = apply T.  Used on grid3x3 with a fixed cyclic domain so every row is a +1 shift of the one above.
  transform: {
    name: "transform",
    applicableTo: (f, st) => st.name === "grid3x3",
    assign(slots, lines, feature, rng, domain) {
      // domain has 3 values; row i = cyclic shift of row 0 by i.  Column j picks domain[(j + i*shift) % 3].
      const perm = sampleK(rng, domain, 3), shift = rng.int(1, 2), map = new Map();
      for (const s of slots) map.set(s.id, perm[(s.col + s.row * shift) % 3]);
      return map;
    },
    holds(valOf, structure, feature, lines, domain, slots) {
      // every ROW must be a cyclic shift of the row above by a CONSTANT non-zero amount (read from the value cycle)
      const grid = {}; for (const s of slots) (grid[s.row] = grid[s.row] || {})[s.col] = valOf(s.id);
      const rows = Object.keys(grid).map(Number).sort((a, b) => a - b);
      if (rows.length < 2) return false;
      // build the column→value cycle from row 0; require it to be a permutation of 3 distinct values
      const r0 = grid[rows[0]]; const cyc = [r0[0], r0[1], r0[2]];
      if (cyc.some(v => v == null) || new Set(cyc.map(String)).size !== 3) return false;
      const idxIn = v => cyc.findIndex(x => String(x) === String(v));
      let shift = null;
      for (let ri = 1; ri < rows.length; ri++) { const row = grid[rows[ri]], prev = grid[rows[ri - 1]];
        for (let c = 0; c < 3; c++) { if (row[c] == null || prev[c] == null) continue; const a = idxIn(prev[c]), b = idxIn(row[c]); if (a < 0 || b < 0) return false; const s = ((b - a) % 3 + 3) % 3; if (s === 0) return false; if (shift == null) shift = s; else if (shift !== s) return false; } }
      return shift != null;
    },
    deduce(known, slots, lines, feature, targetId, domain) {
      const grid = {}; for (const s of slots) (grid[s.row] = grid[s.row] || {})[s.col] = { id: s.id, v: known.get(s.id) };
      const target = slots.find(s => s.id === targetId);
      // recover the column-cycle from any FULL row, and the shift from any two full-ish rows
      const rows = Object.keys(grid).map(Number).sort((a, b) => a - b);
      let cyc = null; for (const ri of rows) { const r = grid[ri]; const vs = [0, 1, 2].map(c => r[c].v); if (vs.every(v => v != null) && new Set(vs.map(String)).size === 3) { cyc = vs; break; } }
      if (!cyc) return null;
      const idxIn = v => cyc.findIndex(x => String(x) === String(v));
      let shift = null;
      for (let ri = 1; ri < rows.length; ri++) for (let c = 0; c < 3; c++) { const a = grid[rows[ri - 1]][c].v, b = grid[rows[ri]][c].v; if (a == null || b == null) continue; const ia = idxIn(a), ib = idxIn(b); if (ia < 0 || ib < 0) continue; const s = ((ib - ia) % 3 + 3) % 3; if (s === 0) return null; if (shift == null) shift = s; else if (shift !== s) return null; }
      if (shift == null) return null;
      const idx = ((target.col + target.row * shift) % 3 + 3) % 3;   // by construction; equivalently shift row0
      // map via the cycle: value at (row,col) = cyc[(col + row*shift) mod 3] only if row0 == cyc; generic: shift row0's col value
      const base = cyc[((target.col) % 3 + 3) % 3];
      const bi = idxIn(base); return cyc[((bi + shift * target.row) % 3 + 3) % 3];
    },
  },
};

// ---------------------------------------------------------------------------
// 4) QUERY — what is asked / how IN differs from the full solution.
//    { name, applicableTo(principle,structure)->bool, makeIO(values:Map, structure, feature, rng)->{in,out,targetId} }
//    `values` is the full slot→value map; we render IN (with the query's hole) and OUT (the answer).
// ---------------------------------------------------------------------------
function renderSlots(structure, feature, values, colourOf, skipId) {
  const g = blank(structure.H, structure.W);
  for (const s of structure.slots) { if (s.id === skipId) continue; const v = values.get(s.id); const cell = feature.render(v, colourOf(s.id)); stampInto(g, cell, s.box.r, s.box.c); }
  return g;
}
function renderOneCell(structure, feature, values, colourOf, id) {
  const s = structure.slots.find(x => x.id === id), cell = feature.render(values.get(id), colourOf(id)), box = blank(s.box.h, s.box.w);
  stampInto(box, cell, 0, 0); return crop(box);
}

const QUERIES = {
  // blank ONE slot in IN; OUT = the FULL grid (the completed matrix). pairs with distribution / transform.
  complete_missing: {
    name: "complete_missing",
    // completion blanks an interior slot and needs intersecting lines to pin it down → grid principles only.
    applicableTo: (pr, st) => (pr.name === "distribution" || pr.name === "transform") && st.name === "grid3x3",
    makeIO(values, structure, feature, colourOf, rng) {
      const target = structure.slots[rng.int(0, structure.slots.length - 1)].id;
      return { in: renderSlots(structure, feature, values, colourOf, target), out: renderSlots(structure, feature, values, colourOf, null), targetId: target };
    },
  },
  // IN = full grid; OUT = the odd cell cropped. pairs with constant.
  find_odd: {
    name: "find_odd",
    applicableTo: (pr) => pr.name === "constant",
    makeIO(values, structure, feature, colourOf, rng) {
      const cnt = {}; for (const s of structure.slots) { const v = String(values.get(s.id)); cnt[v] = (cnt[v] || 0) + 1; }
      const oddVal = Object.entries(cnt).find(([, n]) => n === 1); if (!oddVal) return null;
      const oddId = structure.slots.find(s => String(values.get(s.id)) === oddVal[0]).id;
      return { in: renderSlots(structure, feature, values, colourOf, null), out: renderOneCell(structure, feature, values, colourOf, oddId), targetId: oddId };
    },
  },
  // sequence: IN = first N slots; OUT = the (N+1)th cell. pairs with progression / transform on a row.
  predict_next: {
    name: "predict_next",
    applicableTo: (pr, st) => (pr.name === "progression") && st.name === "row",
    makeIO(values, structure, feature, colourOf, rng) {
      const seq = structure.slots.slice().sort((a, b) => a.seqIndex - b.seqIndex), last = seq[seq.length - 1];
      const inG = renderSlots(structure, feature, values, colourOf, last.id);
      return { in: inG, out: renderOneCell(structure, feature, values, colourOf, last.id), targetId: last.id };
    },
  },
};

// ---------------------------------------------------------------------------
// GENERIC SOLVER — solveReasoning(task)
//   detect the structure from object centroids (band-cluster like solver2), read each slot's feature value for
//   EACH feature, then for each (feature,principle) check `holds` across all train examples and `deduce` the
//   query target, verifying the deduction reproduces every train OUT. unique = all consistent hypotheses agree.
// ---------------------------------------------------------------------------
function band(coords) {                              // cluster centroid coords into discrete lattice bands (cf. solver2.js)
  const u = [...new Set(coords.map(x => Math.round(x)))].sort((a, b) => a - b), bands = [];
  for (const v of u) { if (!bands.length || v - bands[bands.length - 1].max > 3) bands.push({ min: v, max: v }); else bands[bands.length - 1].max = v; }
  return { n: bands.length, idx: x => { const xr = Math.round(x); for (let k = 0; k < bands.length; k++) if (xr >= bands[k].min - 2 && xr <= bands[k].max + 2) return k; return -1; } };
}

// group all objects whose centroids fall in the same lattice cell → one "slot" with a merged occupancy/colour grid.
// returns { slots:[{ri,ci,seqIndex,grid,r0,c0,h,w}], R, C } or null
function detectSlots(g) {
  const objs = seg(g); if (!objs.length) return null;
  const R = band(objs.map(o => o.cr)), C = band(objs.map(o => o.cc));
  const cellMap = new Map();
  for (const o of objs) { const ri = R.idx(o.cr), ci = C.idx(o.cc); if (ri < 0 || ci < 0) return null; const key = ri + "," + ci; if (!cellMap.has(key)) cellMap.set(key, { ri, ci, objs: [] }); cellMap.get(key).objs.push(o); }
  const slots = [];
  for (const { ri, ci, objs: os } of cellMap.values()) {
    let r0 = 1e9, c0 = 1e9, r1 = -1, c1 = -1; for (const o of os) { r0 = Math.min(r0, o.r); c0 = Math.min(c0, o.c); r1 = Math.max(r1, o.r + o.h - 1); c1 = Math.max(c1, o.c + o.w - 1); }
    const h = r1 - r0 + 1, w = c1 - c0 + 1, sub = blank(h, w);
    for (const o of os) for (let i = 0; i < o.h; i++) for (let j = 0; j < o.w; j++) if (o.loc[i][j]) sub[o.r - r0 + i][o.c - c0 + j] = o.loc[i][j];
    slots.push({ ri, ci, grid: sub, r0, c0, h, w });
  }
  slots.sort((a, b) => a.ri - b.ri || a.ci - b.ci);
  slots.forEach((s, i) => s.seqIndex = i);
  return { slots, R: R.n, C: C.n };
}

// reconstruct the abstract structure (slots + lines) from the detected lattice so principles can run generically.
function structureFromLattice(det, fullR, fullC) {
  const R = fullR, C = fullC, slots = det.slots.map(s => ({ id: s.ri + "," + s.ci, row: s.ri, col: s.ci, seqIndex: s.seqIndex, slot: s }));
  const byId = new Map(slots.map(s => [s.id, s]));
  let lines = [];
  if (R === 3 && C === 3) { for (let i = 0; i < 3; i++) lines.push([0, 1, 2].map(j => `${i},${j}`)); for (let j = 0; j < 3; j++) lines.push([0, 1, 2].map(i => `${i},${j}`)); }
  else { lines = [slots.map(s => s.id)]; }                 // a single row / a group → one global line
  // keep only lines whose ids all exist (a query may have blanked one slot ⇒ id missing; principles tolerate that)
  return { slots, lines, byId, R, C };
}

// read a feature value for every detected slot; returns Map(id->value) or null if the feature can't be read cleanly
function readFeature(struct, feature) {
  const map = new Map();
  for (const s of struct.slots) { const v = feature.read(s.slot.grid); if (v == null) return null; map.set(s.id, v); }
  return map;
}

// the registry of principle objects keyed for the solver (same laws as generation, run feature-agnostically)
const SOLVER_PRINCIPLES = Object.values(PRINCIPLES);

function inferDomainOrder(feature, allValues) {
  // for ordered features the order is INTRINSIC and the alphabet is the feature's FULL domain — a progression may
  // deduce a value not yet seen, so the inferred domain must extend past the observed values.
  if (feature.name === "size") return ["small", "med", "large", "huge"];
  if (feature.name === "count") return [1, 2, 3, 4];
  if (feature.name === "colour") return [...new Set(allValues)].sort((a, b) => a - b);
  return [...new Set(allValues.map(String))];   // unordered: arbitrary but stable
}

// ---- the public solver ----------------------------------------------------
const last = v => v[v.length - 1];
const trainPairs = t => t.examples.map(e => [last(e.in), last(e.out)]);
const testPair = t => [last(t.in), last(t.out)];

// For a (feature, principle, query-shape) hypothesis, build a predictor inG -> outG that re-derives the answer.
// query-shape is detected structurally: same-dims full-grid completion, or a small one-cell crop.
function makePredictor(feature, principle) {
  return function predict(inG) {
    const det = detectSlots(inG); if (!det) return null;
    const struct = structureFromLattice(det, det.R, det.C);
    // applicability gate (feature-agnostic): the principle must be able to run on this lattice shape
    const fakeStruct = { name: struct.R === 3 && struct.C === 3 ? "grid3x3" : (struct.R === 1 ? "row" : "group"), lineLen: struct.lines[0] ? struct.lines[0].length : 0 };
    const known = readFeature(struct, feature); if (!known) return null;
    const domain = inferDomainOrder(feature, [...known.values()]);
    const valOf = id => known.has(id) ? known.get(id) : null;
    const slotsArr = struct.slots;

    if (principle.name === "constant") {
      // find_odd: verify constant holds, locate the odd slot, output its cropped cell
      if (!principle.holds(valOf, fakeStruct, feature, struct.lines, domain, slotsArr)) return null;
      const cnt = {}; for (const s of slotsArr) cnt[String(valOf(s.id))] = (cnt[String(valOf(s.id))] || 0) + 1;
      const oddEntry = Object.entries(cnt).find(([, n]) => n === 1); if (!oddEntry) return null;
      const odd = slotsArr.find(s => String(valOf(s.id)) === oddEntry[0]);
      return crop(odd.slot.grid);
    }

    // completion / prediction: one slot is BLANK in IN (missing id). Find the full lattice's missing position.
    const present = new Set(slotsArr.map(s => s.id));
    let targetId = null, targetPos = null;
    if (struct.R === 3 && struct.C === 3) {
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) if (!present.has(`${i},${j}`)) { targetId = `${i},${j}`; targetPos = { row: i, col: j }; }
    } else {
      // a sequence/row: the blank is the next index after the present ones (predict_next) — append a virtual slot.
      const maxIdx = Math.max(...slotsArr.map(s => s.col));
      targetPos = { row: 0, col: maxIdx + 1 }; targetId = `0,${maxIdx + 1}`;
    }
    if (!targetId) return null;

    // build a temporary structure that INCLUDES the target slot so lines reference it, then deduce.
    let lines2 = struct.lines.map(L => L.slice());
    if (struct.R === 3 && struct.C === 3) {
      // target already referenced by row/col lines built over all 9 ids
      const allIds = []; for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) allIds.push(`${i},${j}`);
      lines2 = []; for (let i = 0; i < 3; i++) lines2.push([0, 1, 2].map(j => `${i},${j}`)); for (let j = 0; j < 3; j++) lines2.push([0, 1, 2].map(i => `${i},${j}`));
    } else {
      lines2 = [[...slotsArr.map(s => s.id), targetId]];
    }
    const slots2 = slotsArr.concat([{ id: targetId, row: targetPos.row, col: targetPos.col }]);

    // the principle must HOLD on the visible slots (otherwise this hypothesis is wrong for this example)
    if (!principle.holds(valOf, fakeStruct, feature, struct.lines, domain, slotsArr)) return null;
    const deduced = principle.deduce(known, slots2, lines2, feature, targetId, domain);
    if (deduced == null) return null;

    // render the answer by DONOR COPY: reuse the exact blob of a present slot that already has the deduced value.
    // Position it by BOX-ORIGIN alignment: the target cell's top-left row comes from a same-value cell in the
    // target's ROW (identical render ⇒ identical r-offset), its left column from a same-value cell in the target's
    // COLUMN.  This is rendering-agnostic and EXACT — no guessing how a feature centres content in its box.
    const donor = slotsArr.find(s => String(valOf(s.id)) === String(deduced));
    if (struct.R === 3 && struct.C === 3) {
      if (!donor) return null;                              // grid completion: the value MUST already appear elsewhere
      const out = inG.map(r => r.slice());
      const place = placeByBoxOrigin(slotsArr, valOf, deduced, targetPos, donor.slot);
      if (!place) return null;
      stampInto(out, donor.slot.grid, place.r0, place.c0);
      return out;
    } else {
      // sequence (predict_next): the deduced value may be NEW (the progression extends past the seen values), so we
      // RENDER it. Recover the single render colour from any present slot, then crop the feature's render.
      const colour = inferColour(feature, known, struct, deduced);
      if (colour == null) return null;
      const cell = feature.render(deduced, colour);
      return crop(cell);
    }
  };
}

// Place the deduced cell's blob (top-left = r0,c0) on the missing lattice cell by BOX-ORIGIN alignment.
// The blob renders IDENTICALLY to any same-value cell, so: the target row's blob-top r0 = the blob-top of a
// same-value cell in the TARGET ROW; the target col's blob-left c0 = the blob-left of a same-value cell in the
// TARGET COLUMN. If none shares the row/col, recover the uniform lattice step from same-value cells and extrapolate.
function placeByBoxOrigin(slotsArr, valOf, deduced, pos, donorSlot) {
  const same = slotsArr.filter(s => String(valOf(s.id)) === String(deduced));
  // r0: a same-value cell in the target's ROW (its blob-top equals the target's blob-top)
  const rowMate = same.find(s => s.row === pos.row);
  const colMate = same.find(s => s.col === pos.col);
  let r0 = rowMate ? rowMate.slot.r0 : extrapolateOrigin(same, "row", "r0", pos.row);
  let c0 = colMate ? colMate.slot.c0 : extrapolateOrigin(same, "col", "c0", pos.col);
  if (r0 == null || c0 == null) return null;
  return { r0: Math.round(r0), c0: Math.round(c0) };
}
// from same-value cells, regress the box-origin coordinate (r0|c0) against the band index (row|col) → uniform step.
function extrapolateOrigin(same, idxKey, coordKey, idx) {
  const pts = same.map(s => [s[idxKey], s.slot[coordKey]]);
  const byIdx = {}; for (const [i, v] of pts) (byIdx[i] = byIdx[i] || []).push(v);
  const ks = Object.keys(byIdx).map(Number).sort((a, b) => a - b);
  if (byIdx[idx] != null) return byIdx[idx].reduce((a, b) => a + b, 0) / byIdx[idx].length;
  if (ks.length >= 2) { const lo = ks[0], hi = ks[ks.length - 1], vlo = byIdx[lo].reduce((a, b) => a + b, 0) / byIdx[lo].length, vhi = byIdx[hi].reduce((a, b) => a + b, 0) / byIdx[hi].length; const step = (vhi - vlo) / (hi - lo); return vlo + step * (idx - lo); }
  return null;
}
// colour to render the deduced cell with: for `colour` feature the value IS the colour; else reuse the constant colour.
function inferColour(feature, known, struct, deduced) {
  if (feature.name === "colour") return deduced;
  // every other feature is rendered in a single fixed colour across the task — recover it from any slot's grid
  for (const s of struct.slots) { for (const row of s.slot.grid) for (const x of row) if (x) return x; }
  return PAL[0];
}

function solveReasoning(task) {
  const train = trainPairs(task), [tin, tout] = testPair(task);
  const hyps = [];
  for (const fname of Object.keys(FEATURES)) {
    const feature = FEATURES[fname];
    for (const principle of SOLVER_PRINCIPLES) {
      const predict = makePredictor(feature, principle);
      let ok = true;
      for (const [i, o] of train) { let p; try { p = predict(i); } catch (e) { p = null; } if (!p || !eqG(p, o)) { ok = false; break; } }
      if (!ok) continue;
      let tp; try { tp = predict(tin); } catch (e) { tp = null; }
      if (!tp) continue;
      hyps.push({ feature: fname, principle: principle.name, predictTest: tp, kind: `${principle.name}/${fname}` });
    }
  }
  if (!hyps.length) return { solvable: false, unique: false, kind: null, rule: null, reason: "no (feature,principle) hypothesis reproduces train" };
  const matches = hyps.filter(h => eqG(h.predictTest, tout));
  if (!matches.length) return { solvable: false, unique: false, kind: null, rule: null, reason: "fitting hypotheses do not reproduce the test output" };
  const distinctTest = new Set(hyps.map(h => JSON.stringify(h.predictTest)));
  const unique = distinctTest.size === 1;
  return { solvable: true, unique, kind: matches[0].kind, rule: matches[0].kind, reason: unique ? "ok" : `ambiguous (${distinctTest.size} test predictions)`, n_fits: hyps.length };
}

// ---------------------------------------------------------------------------
// GENERATION — compose VALID (principle, feature, structure, query) and keep only verified, teaching, hard tasks.
// ---------------------------------------------------------------------------
function validCombos() {
  const combos = [];
  for (const prn of Object.keys(PRINCIPLES)) for (const fn of Object.keys(FEATURES)) for (const sn of Object.keys(STRUCTURES)) for (const qn of Object.keys(QUERIES)) {
    const pr = PRINCIPLES[prn], f = FEATURES[fn], st = STRUCTURES[sn], q = QUERIES[qn];
    // distribution needs domain size == lineLen; our domains are all size 3, so lineLen must be 3
    if (pr.name === "distribution" && st.lineLen !== 3) continue;
    if (!pr.applicableTo(f, st)) continue;
    if (!q.applicableTo(pr, st)) continue;
    combos.push({ principle: prn, feature: fn, structure: sn, query: qn });
  }
  return combos;
}

function buildOne(rng, combo) {
  const pr = PRINCIPLES[combo.principle], feature = FEATURES[combo.feature], stDef = STRUCTURES[combo.structure], q = QUERIES[combo.query];
  // ONE rule (domain + fixed render colour) is fixed PER TASK across examples — only the slot assignment varies.
  const fixedColour = pick(rng, PAL);                       // for non-colour features, the single render colour
  const colourOf = () => fixedColour;
  const buildPair = () => {
    const st = stDef.build(rng);
    const domain = feature.domain(rng);
    const values = pr.assign(st.slots, st.lines, feature, rng, domain);
    if ([...values.values()].some(v => v == null)) return null;
    const io = q.makeIO(values, st, feature, feature.name === "colour" ? (id => values.get(id)) : colourOf, rng);
    if (!io) return null;
    return io;
  };
  const ex = []; for (let i = 0; i < 4; i++) { let p; try { p = buildPair(); } catch (e) { p = null; } if (!p) return null; ex.push({ in: [p.in], out: [p.out] }); }
  const examples = ex.slice(0, 3), test = ex[3];
  const id = "R-" + crypto.createHash("sha1").update(JSON.stringify([examples, test, combo])).digest("hex").slice(0, 8);
  return { format: "prodigy-task", version: 1, width: test.in[0][0].length, height: test.in[0].length, palette: "arc10", fps: 1, examples, in: test.in, out: test.out, meta: { id, kind: `${combo.principle}/${combo.feature}/${combo.structure}/${combo.query}` } };
}

const pick = (rng, xs) => xs[rng.int(0, xs.length - 1)];

function generate(opts = {}) {
  const n = opts.n || 40, rng = E.makeRng(((opts.seed || 1) >>> 0) * 2654435761 + 99991);
  const combos = validCombos();
  const out = [], seenId = new Set(), perKind = {}; let i = 0, guard = 0;
  const rej = { build: 0, teaching: 0, trivial: 0, unsolvable: 0, ambiguous: 0, dup: 0 };
  const budget = opts.budget || n * 200;
  while (out.length < n && guard++ < budget) {
    const combo = combos[i++ % combos.length];
    let t; try { t = buildOne(rng, combo); } catch (e) { t = null; }
    if (!t) { rej.build++; continue; }
    // teaching: examples must vary and never be identity (in == out)
    if (t.examples.some(e => JSON.stringify(e.in) === JSON.stringify(e.out)) || new Set(t.examples.map(e => JSON.stringify(e.out))).size < 2) { rej.teaching++; continue; }
    if (B.trivialSolve(t)) { rej.trivial++; continue; }
    const sv = solveReasoning(t);
    if (!sv.solvable) { rej.unsolvable++; continue; }
    if (!sv.unique) { rej.ambiguous++; continue; }
    if (seenId.has(t.meta.id)) { rej.dup++; continue; } seenId.add(t.meta.id);
    t.meta.kind = combo.principle + "/" + combo.feature + "/" + combo.structure + "/" + combo.query;
    t.meta.family = "reasoning";
    t.meta.combo = combo;
    t.meta.solver = { rule: sv.kind, unique: true };
    t.meta.rule = sv.kind;
    perKind[t.meta.kind] = (perKind[t.meta.kind] || 0) + 1;
    out.push(t);
  }
  return { records: out, emitted: out.length, kinds: perKind, distinct_kinds: Object.keys(perKind).length, rejected: rej, combos: combos.length };
}

// ---------------------------------------------------------------------------
// SELF-TEST
// ---------------------------------------------------------------------------
function buildKindTask(comboSpec, seed) {
  // deterministically build ONE verified task for an exact combo (retrying seeds until verified)
  for (let s = seed; s < seed + 4000; s++) {
    const rng = E.makeRng((s >>> 0) * 2654435761 + 12345);
    let t; try { t = buildOne(rng, comboSpec); } catch (e) { t = null; }
    if (!t) continue;
    if (t.examples.some(e => JSON.stringify(e.in) === JSON.stringify(e.out)) || new Set(t.examples.map(e => JSON.stringify(e.out))).size < 2) continue;
    if (B.trivialSolve(t)) continue;
    const sv = solveReasoning(t);
    if (sv.solvable && sv.unique) return { task: t, sv };
  }
  return null;
}

function selfTest() {
  // (A) the four canonical KINDS must each be producible, solver-unique, and baseline-hard — SAME engine.
  const canon = [
    { principle: "distribution", feature: "colour", structure: "grid3x3", query: "complete_missing" },   // EMERGENT Raven matrix
    { principle: "distribution", feature: "shape", structure: "grid3x3", query: "complete_missing" },
    { principle: "progression", feature: "size", structure: "row", query: "predict_next" },
    { principle: "constant", feature: "shape", structure: "group", query: "find_odd" },                  // odd-one-out
  ];
  for (const c of canon) {
    const r = buildKindTask(c, 1);
    if (!r) throw new Error("canonical kind not producible/verifiable: " + JSON.stringify(c));
    const sv = solveReasoning(r.task);
    if (!sv.solvable || !sv.unique) throw new Error("canonical kind not uniquely solvable: " + JSON.stringify(c) + " — " + sv.reason);
    if (B.trivialSolve(r.task)) throw new Error("canonical kind trivially solvable: " + JSON.stringify(c));
  }

  // (B) generate({n:40}) yields ≥30 tasks spanning ≥5 distinct kinds, all solver-verified.
  const g = generate({ n: 40, seed: 7 });
  if (g.emitted < 30) throw new Error("generate underfilled: " + g.emitted + "/40 rej=" + JSON.stringify(g.rejected));
  if (g.distinct_kinds < 5) throw new Error("too few distinct kinds: " + g.distinct_kinds + " — " + JSON.stringify(g.kinds));
  for (const t of g.records) { const sv = solveReasoning(t); if (!sv.solvable || !sv.unique) throw new Error("emitted task not uniquely solvable: " + t.meta.id + " — " + sv.reason); if (B.trivialSolve(t)) throw new Error("emitted task trivially solvable: " + t.meta.id); }

  // (C) determinism: same seed → same ids.
  const a = generate({ n: 12, seed: 3 }).records.map(t => t.meta.id).join(",");
  const b = generate({ n: 12, seed: 3 }).records.map(t => t.meta.id).join(",");
  if (a !== b) throw new Error("non-deterministic: ids differ across runs at the same seed");

  return true;
}

// ---------------------------------------------------------------------------
if (require.main === module) {
  const args = process.argv.slice(2), flag = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
  if (args.includes("--self-test")) { selfTest(); console.log("reasoning: self-test PASS"); }
  else {
    const n = +flag("--n", 40), seed = +flag("--seed", 1), o = flag("-o", null), r = generate({ n, seed });
    if (args.includes("--report")) {
      console.error(`\nREASONING meta-generator — ${r.emitted}/${n} emitted, ${r.distinct_kinds} distinct kinds (of ${r.combos} valid combos)`);
      console.error("kinds:", JSON.stringify(r.kinds, null, 0));
      console.error("rejected:", JSON.stringify(r.rejected));
    }
    if (o) { require("fs").writeFileSync(o, r.records.map(t => JSON.stringify(t)).join("\n") + "\n"); console.error(`wrote ${r.emitted} → ${o}`); }
    else if (!args.includes("--report")) console.log(r.records.map(t => JSON.stringify(t)).join("\n"));
  }
}

module.exports = { generate, solveReasoning, selfTest, FEATURES, STRUCTURES, PRINCIPLES, QUERIES, validCombos, detectSlots, band, makePredictor };
