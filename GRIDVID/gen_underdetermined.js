#!/usr/bin/env node
/* gen_underdetermined.js — FORCED under-determination (handover move #3, the ARC-2 hallmark).
 *
 * gen_search gives DEPTH; this gives DEPTH + UNDER-DETERMINATION. Each task is a depth-2 geometric/structural
 * prefix followed by a learned per-colour MAP, with the source colours SPLIT across the train pairs so the map
 * can only be pinned by seeing ≥3 of them — no single (or pair of) train example reveals the rule. arc_search
 * certifies it: it must re-derive prefix |> colormap, obsNeeded≥3, a UNIQUE & COVERED test answer (an unseen
 * test colour ⇒ rejected as ambiguous). The SEARCH is the judge — same architecture as the rest of the pivot.
 *
 *   node gen_underdetermined.js --self-test
 *   node gen_underdetermined.js --n 12
 */
const A = require("./arc_search.js");
const S = require("./solver.js");
const seg = S.segObjects;
const H = g => g.length, W = g => g[0].length;
const blank = (h, w) => Array.from({ length: h }, () => new Array(w).fill(0));
const eqG = (a, b) => a.length === b.length && a[0].length === b[0].length && a.every((r, i) => r.every((x, j) => x === b[i][j]));
function gridFrom(h, w, objs) { const g = blank(h, w); for (const o of objs) for (let i = 0; i < o.loc.length; i++) for (let j = 0; j < o.loc[0].length; j++) { const v = o.loc[i][j]; if (v && o.r + i >= 0 && o.c + j >= 0 && o.r + i < h && o.c + j < w) g[o.r + i][o.c + j] = v; } return g; }
function makeRng(seed) { let s = seed >>> 0 || 1; return () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff; }

// prefix ops MUST preserve every object & its colour (no deletion) so all source colours survive into the
// colormap step. NOTE the 4 pure-geometry ops form the dihedral group D4 — composing TWO of them collapses
// to a SINGLE rotation/flip, which the search correctly re-derives at depth-1 → the task becomes depth-2 →
// rejected as too-easy. So a non-collapsing prefix needs a NON-GROUP op (gravity / fill_holes / outline /
// complete_sym). We include all of them so the corpus isn't all-gravity.
const grav = A._h.gravity, outl = A._h.outlineLoc;
function gridFromObjs(g, objs) { return gridFrom(H(g), W(g), objs); }
const PREFIX_STEPS = [
  { label: "flipH", fn: g => g.map(r => r.slice().reverse()) },
  { label: "flipV", fn: g => g.slice().reverse().map(r => r.slice()) },
  { label: "rot180", fn: g => g.slice().reverse().map(r => r.slice().reverse()) },
  { label: "transpose", fn: g => g[0].map((_, c) => g.map(r => r[c])) },
  { label: "gravity_down", fn: g => grav(g, "down") },
  { label: "gravity_left", fn: g => grav(g, "left") },
  { label: "gravity_right", fn: g => grav(g, "right") },
  { label: "fill_holes", fn: g => { const o = seg(g); if (!o.some(x => x.hasHole)) return null; for (const x of o) if (x.hasHole) x.loc = x.loc.map(r => r.map(c => c || x.mainColor)); return gridFromObjs(g, o); } },
  { label: "outline_all", fn: g => { const o = seg(g); for (const x of o) x.loc = outl(x.loc); return gridFromObjs(g, o); } },
  { label: "complete_sym_h", fn: g => { const m = g.map(r => r.slice().reverse()); return g.map((r, i) => r.map((x, j) => x || m[i][j])); } },
  { label: "complete_sym_v", fn: g => { const m = g.slice().reverse().map(r => r.slice()); return g.map((r, i) => r.map((x, j) => x || m[i][j])); } },
];
function safe(fn) { return g => { try { const r = fn(g); return r && r.length && r[0].length ? r : null; } catch { return null; } }; }
function samplePrefix(rng) {                       // length-2, two DISTINCT ops (depth-1 collapses are rejected by the search anyway)
  const a = PREFIX_STEPS[Math.floor(rng() * PREFIX_STEPS.length)];
  let b; do { b = PREFIX_STEPS[Math.floor(rng() * PREFIX_STEPS.length)]; } while (b.label === a.label);
  // avoid the obvious algebraic collapses (transpose∘transpose etc. excluded by distinctness; flip pairs handled by search)
  return [a, b];
}

// place K small objects of GIVEN colours on an HxW grid (distinct cells, no touching), to exercise the prefix
function sceneWithColors(rng, h, w, colors) {
  const ri = n => Math.floor(rng() * n);
  const g = blank(h, w); let placed = 0, tries = 0; const want = colors.length;
  const shapes = [
    [[1, 1], [1, 0]], [[1, 1], [1, 1]], [[1, 1, 1]], [[1], [1], [1]],
    [[1, 1, 1], [1, 0, 1], [1, 1, 1]],                 // frame (has a hole → fill_holes / outline bite)
    [[0, 1, 0], [1, 1, 1], [0, 1, 0]],                 // plus
    [[1, 1, 1], [1, 1, 1]], [[1, 1], [1, 1], [1, 1]],  // solid blocks (outline bites)
  ];
  while (placed < want && tries < 600) {
    tries++; const mask = shapes[ri(shapes.length)]; const rh = mask.length, rw = mask[0].length;
    const r0 = ri(h - rh + 1), c0 = ri(w - rw + 1);
    let clash = false;
    for (let i = -1; i <= rh && !clash; i++) for (let j = -1; j <= rw && !clash; j++) { const y = r0 + i, x = c0 + j; if (y >= 0 && y < h && x >= 0 && x < w && g[y][x]) clash = true; }
    if (clash) continue;
    const col = colors[placed];
    for (let i = 0; i < rh; i++) for (let j = 0; j < rw; j++) if (mask[i][j]) g[r0 + i][c0 + j] = col;
    placed++;
  }
  return placed === want ? g : null;
}

const PALETTE = [1, 2, 3, 4, 5, 6, 7, 8, 9];
function genTask(rng, opts = {}) {
  const h = opts.h ?? 10, w = opts.w ?? 10;
  // 3 source colours, each mapped to a DISTINCT target colour not colliding with sources
  const pool = PALETTE.slice().sort(() => rng() - 0.5);
  const src = pool.slice(0, 3), tgt = pool.slice(3, 6);
  const M = {}; src.forEach((c, i) => { M[c] = tgt[i]; });
  const cmap = g => g.map(r => r.map(x => (x in M) ? M[x] : x));
  const prefix = samplePrefix(rng);
  const run = g => { let x = g; for (const s of prefix) { x = safe(s.fn)(x); if (!x) return null; } return cmap(x); };
  // colours SPLIT one-per-pair so the map is pinned only after pair 3 → obsNeeded ≥ 3
  const split = [[src[0]], [src[1]], [src[2]], [src[0], src[1], src[2]]];
  const examples = [];
  for (const colors of split) {
    let inG = null, outG = null, t = 0;
    while (t++ < 40) { inG = sceneWithColors(rng, h, w, colors.length === 1 ? [colors[0], colors[0]] : colors); if (!inG) continue; outG = run(inG); if (outG && !eqG(outG, inG)) break; inG = null; }
    if (!inG) return null;
    examples.push({ in: [inG], out: [outG] });
  }
  // TEST exercises ALL three source colours (so it is covered/determined)
  let tin = null; for (let t = 0; t < 40 && !tin; t++) { const g = sceneWithColors(rng, h, w, src.slice()); if (g && run(g)) tin = g; }
  if (!tin) return null;
  const task = { examples, in: [tin], out: [run(tin)], meta: { source: "gen_underdetermined", prefix: prefix.map(s => s.label).join(" |> "), colorMap: M } };
  const d = A.difficulty(task, { maxDepth: 3, minDepth: 3 });
  if (d.verdict !== "hard-valid" || d.obsNeeded < 3) return null;   // require GENUINE under-determination
  task.meta.difficulty = d;
  return task;
}

function generate(n, opts = {}) {
  const rng = makeRng(opts.seed ?? 11); const out = []; let attempts = 0;
  while (out.length < n && attempts < n * 300) { attempts++; const t = genTask(rng, opts); if (t) out.push(t); }
  return { tasks: out, attempts, yield: out.length / Math.max(1, attempts) };
}

module.exports = { generate, genTask };

// ---------------- self-test ----------------
function selfTest() {
  console.log("gen_underdetermined self-test");
  let pass = 0, fail = 0;
  const ok = (n, c, e = "") => { if (c) { pass++; console.log("  ✓ " + n + (e ? "  " + e : "")); } else { fail++; console.log("  ✗ " + n + "  " + e); } };
  const r = generate(6, { seed: 11 });
  ok("generated the requested certified under-determined tasks", r.tasks.length === 6, `yield=${r.yield.toFixed(3)} attempts=${r.attempts}`);
  ok("EVERY task is hard-valid", r.tasks.every(t => t.meta.difficulty.verdict === "hard-valid"));
  ok("EVERY task needs >=3 observations (genuinely under-determined)", r.tasks.every(t => t.meta.difficulty.obsNeeded >= 3));
  ok("EVERY task has a UNIQUE, COVERED test answer", r.tasks.every(t => t.meta.difficulty.unique));
  ok("EVERY task minimal depth === 3 (prefix |> colormap)", r.tasks.every(t => t.meta.difficulty.depth === 3));
  // independent re-solve
  ok("independent re-solve reproduces every held-out test", r.tasks.every(t => { const s = A.solveTask(t, { maxDepth: 3 }); return s.solvable && s.prediction && eqG(s.prediction, t.out[0]); }));
  // the search re-derives the colormap terminal step
  ok("search re-derives a colormap terminal op for every task", r.tasks.every(t => { const s = A.solveTask(t, { maxDepth: 3 }); return s.programLabels[0].includes("colormap:"); }));
  console.log("  · " + r.tasks.slice(0, 3).map(t => `${t.meta.prefix} |> colormap (obs ${t.meta.difficulty.obsNeeded})`).join("\n      "));
  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) process.exit(1);
}
if (require.main === module) {
  if (process.argv.includes("--self-test")) selfTest();
  else {
    const i = process.argv.indexOf("--n"), n = i > 0 ? +process.argv[i + 1] : 10;
    const r = generate(n, { seed: 11 });
    console.log(`# gen_underdetermined: ${r.tasks.length}/${n} certified (yield ${r.yield.toFixed(3)})`);
    for (const t of r.tasks) console.log(JSON.stringify({ prefix: t.meta.prefix, obs: t.meta.difficulty.obsNeeded, depth: t.meta.difficulty.depth, score: t.meta.difficulty.score }));
  }
}
