#!/usr/bin/env node
/* gen_legend.js — F3 prototype: LEGEND / symbol-grounding (axis C, strong human bias).
 *
 * Strong HUMAN BIAS: the most human concept there is — "there's a key in the picture; read it and apply it."
 * The grid is split by a divider into a KEY panel (rows of [src,tgt] swatches) and a WORK panel. The rule
 * recolours the work objects per the key.
 *
 * Forces the model to ABSTRACT, not memorise: the key is DIFFERENT in every example, so no fixed colour
 * mapping survives — the only thing that generalises is the abstraction "parse the key, apply it elsewhere".
 * We PROVE this: blank the key in every input and the task becomes UNSOLVABLE (no consistent rule). That is
 * the formal statement of "the human bias is the scaffold the model must climb to abstract".
 *
 * Certified by arc_search via the apply_legend primitive (one searched op) — same architecture as the rest.
 *   node gen_legend.js --self-test
 */
const A = require("./arc_search.js");
const H = g => g.length, W = g => g[0].length;
const blank = (h, w) => Array.from({ length: h }, () => new Array(w).fill(0));
const eqG = (a, b) => a.length === b.length && a[0].length === b[0].length && a.every((r, i) => r.every((x, j) => x === b[i][j]));
function makeRng(seed) { let s = seed >>> 0 || 1; return () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff; }

const DIVIDER = 5;                                  // grey divider column
const SHAPES = [[[1, 1], [1, 0]], [[1, 1], [1, 1]], [[1, 1, 1]], [[1], [1], [1]], [[0, 1, 0], [1, 1, 1], [0, 1, 0]], [[1, 1, 1], [1, 1, 1]]];

function buildExample(rng, opts) {
  const h = opts.h, w = opts.w, dcol = 2, workStart = 3;
  const ri = n => Math.floor(rng() * n);
  // a DISTINCT random key: K src→tgt mappings, srcs & tgts drawn from {1,2,3,4,6,7,8,9} (skip divider 5)
  const pal = [1, 2, 3, 4, 6, 7, 8, 9].sort(() => rng() - 0.5);
  const K = opts.K, src = pal.slice(0, K), tgt = pal.slice(K, 2 * K);
  const map = {}; src.forEach((s, i) => { map[s] = tgt[i]; });
  const g = blank(h, w);
  for (let c = 0; c < h; c++) g[c][dcol] = DIVIDER;   // divider column
  for (let i = 0; i < K; i++) { g[i][0] = src[i]; g[i][1] = tgt[i]; }   // key rows: [src | tgt]
  // WORK panel: place a few objects coloured with the key's SRC colours (each src appears ≥ once)
  const colorsToPlace = src.concat([src[ri(K)]]);     // K+1 objects so ≥1 colour repeats
  let placed = 0, tries = 0;
  for (const col of colorsToPlace) {
    let ok = false;
    while (!ok && tries++ < 200) {
      const m = SHAPES[ri(SHAPES.length)], rh = m.length, rw = m[0].length;
      const r0 = ri(h - rh + 1), c0 = workStart + ri(w - workStart - rw + 1);
      let clash = false;
      for (let i = -1; i <= rh && !clash; i++) for (let j = -1; j <= rw && !clash; j++) { const y = r0 + i, x = c0 + j; if (y >= 0 && y < h && x >= workStart - 1 && x < w && g[y][x]) clash = true; }
      if (clash) continue;
      for (let i = 0; i < rh; i++) for (let j = 0; j < rw; j++) if (m[i][j]) g[r0 + i][c0 + j] = col;
      ok = true; placed++;
    }
  }
  if (placed < K) return null;                        // need every src colour present so the rule bites
  const out = A._h.applyLegend(g);
  if (!out || eqG(out, g)) return null;
  return { in: [g], out: [out], map };
}

function genTask(rng, opts = {}) {
  const o = { h: opts.h ?? 9, w: opts.w ?? 12, K: opts.K ?? 3, nPairs: opts.nPairs ?? 3 };
  const exraw = [];
  for (let i = 0, guard = 0; i < o.nPairs && guard < 60; guard++) { const e = buildExample(rng, o); if (e) { exraw.push(e); i++; } }
  if (exraw.length < o.nPairs) return null;
  const test = buildExample(rng, o); if (!test) return null;
  const examples = exraw.map(e => ({ in: e.in, out: e.out }));
  const task = { examples, in: test.in, out: test.out, meta: { source: "gen_legend", family: "legend (symbol-grounding)", keys: exraw.map(e => e.map).concat([test.map]) } };

  // --- certify: solved by the search via apply_legend, unique & correct ---
  const s = A.solveTask(task, { maxDepth: 2 });
  if (!s.solvable || !s.unique || !s.prediction || !eqG(s.prediction, task.out[0])) return null;
  if (!s.programLabels[0].includes("apply_legend")) return null;
  // --- forces-abstraction proof: blank the KEY in every input → task must become NOT uniquely solvable ---
  const blanked = JSON.parse(JSON.stringify(task));
  const blankKey = g => { const d = A._h.findDivider(g); const o2 = g.map(r => r.slice()); if (d >= 0) for (let r = 0; r < o2.length; r++) for (let c = 0; c <= d; c++) o2[r][c] = 0; return o2; };
  blanked.examples = blanked.examples.map(e => ({ in: [blankKey(e.in[0])], out: e.out }));
  blanked.in = [blankKey(task.in[0])];
  const sb = A.solveTask(blanked, { maxDepth: 3, allowColorMap: true });
  const legendNecessary = !(sb.solvable && sb.unique);
  if (!legendNecessary) return null;                 // if it's solvable without the key, it isn't real symbol-grounding
  // keys differ across examples (otherwise it degenerates to a fixed map)
  const keyStrs = task.meta.keys.map(m => JSON.stringify(m)); const keysDiffer = new Set(keyStrs).size > 1;
  task.meta.program = s.programLabels[0];
  task.meta.legendNecessary = legendNecessary;
  task.meta.keysDiffer = keysDiffer;
  return task;
}

function generate(n, opts = {}) {
  const rng = makeRng(opts.seed ?? 3); const out = []; let attempts = 0;
  while (out.length < n && attempts < n * 200) { attempts++; const t = genTask(rng, opts); if (t) out.push(t); }
  return { tasks: out, attempts, yield: out.length / Math.max(1, attempts) };
}

module.exports = { generate, genTask };

// ---------------- self-test ----------------
function selfTest() {
  console.log("gen_legend self-test  (F3: legend / symbol-grounding)");
  let pass = 0, fail = 0;
  const ok = (n, c, e = "") => { if (c) { pass++; console.log("  ✓ " + n + (e ? "  " + e : "")); } else { fail++; console.log("  ✗ " + n + "  " + e); } };
  const r = generate(6, { seed: 3 });
  ok("generated certified legend tasks", r.tasks.length === 6, `yield=${r.yield.toFixed(3)}`);
  ok("EVERY task is solved by the search via apply_legend", r.tasks.every(t => t.meta.program.includes("apply_legend")));
  ok("EVERY task: blanking the KEY makes it UNSOLVABLE (key is necessary ⇒ forces abstraction)", r.tasks.every(t => t.meta.legendNecessary));
  ok("EVERY task: the key DIFFERS across examples (no fixed mapping to memorise)", r.tasks.every(t => t.meta.keysDiffer));
  ok("independent re-solve reproduces every held-out test", r.tasks.every(t => { const s = A.solveTask(t, { maxDepth: 2 }); return s.prediction && eqG(s.prediction, t.out[0]); }));
  console.log("  · example keys (per task, one map per example): " + JSON.stringify(r.tasks[0].meta.keys));
  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) process.exit(1);
}
if (require.main === module && process.argv.includes("--self-test")) selfTest();
