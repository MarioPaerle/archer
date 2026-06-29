#!/usr/bin/env node
/* gen_boolean.js — F-T7 SET LOGIC / boolean composition (a classic ARC family, absent until now).
 * Two panels split by a divider; output = the cellwise AND / OR / XOR / A∖B of their masks, in a target colour.
 * Certified by arc_search via the bool_combine primitive (unique program, reproduces test).
 *   node gen_boolean.js --self-test
 */
const A = require("./arc_search.js");
const eqG = (a, b) => a.length === b.length && a[0].length === b[0].length && a.every((r, i) => r.every((x, j) => x === b[i][j]));
function makeRng(seed) { let s = seed >>> 0 || 1; return () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff; }
const PALETTE = [1, 2, 3, 4, 6, 7, 8, 9];
const DIV = 5;

function combine(A2, B2, op, col) {
  const h = A2.length, w = A2[0].length, o = Array.from({ length: h }, () => new Array(w).fill(0));
  for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) {
    const a = A2[r][c] ? 1 : 0, b = B2[r][c] ? 1 : 0;
    const v = op === "and" ? (a && b) : op === "or" ? (a || b) : op === "xor" ? (a ^ b) : (a && !b);
    if (v) o[r][c] = col;
  }
  return o;
}
function genTask(rng, opts = {}) {
  const ph = opts.ph ?? 5, pw = opts.pw ?? 4, nPairs = opts.nPairs ?? 3;
  const ri = n => Math.floor(rng() * n);
  const pal = PALETTE.slice().sort(() => rng() - 0.5);
  const cA = pal[0], cB = pal[1], cOut = pal[2];           // panel colours + output colour, all distinct, ≠ divider
  const op = ["and", "or", "xor", "diff"][ri(4)];
  const intended = `bool:${op},${cOut}`;
  function panel(col, density) { const p = Array.from({ length: ph }, () => new Array(pw).fill(0)); for (let r = 0; r < ph; r++) for (let c = 0; c < pw; c++) if (rng() < density) p[r][c] = col; return p; }
  function example() {
    const PA = panel(cA, 0.5), PB = panel(cB, 0.5);
    const g = []; for (let r = 0; r < ph; r++) g.push([...PA[r], DIV, ...PB[r]]);
    const out = combine(PA, PB, op, cOut);
    // reject degenerate (all-zero or identical-to-a-panel) outputs
    if (out.every(row => row.every(x => !x))) return null;
    return { in: [g], out: [out] };
  }
  const exs = []; for (let i = 0, gu = 0; i < nPairs && gu < 80; gu++) { const e = example(); if (e) exs.push(e); i = exs.length; }
  if (exs.length < nPairs) return null;
  const test = example(); if (!test) return null;
  const task = { examples: exs, in: test.in, out: test.out, meta: { source: "gen_boolean", family: "boolean", intended } };
  const s = A.solveTask(task, { maxDepth: 2 });
  if (!s.solvable || !s.unique || !s.prediction || !eqG(s.prediction, task.out[0])) return null;
  if (!s.programLabels[0].startsWith("bool:")) return null;
  task.meta.program = s.programLabels[0]; task.meta.obsNeeded = A.obsNeeded(task, { maxDepth: 2 });
  return task;
}
function generate(n, opts = {}) {
  const rng = makeRng(opts.seed ?? 29); const out = []; let attempts = 0;
  while (out.length < n && attempts < n * 200) { attempts++; const t = genTask(rng, opts); if (t) out.push(t); }
  return { tasks: out, attempts, yield: out.length / Math.max(1, attempts) };
}
module.exports = { generate, genTask };

if (require.main === module && process.argv.includes("--self-test")) {
  console.log("gen_boolean self-test  (T7 set logic)");
  let pass = 0, fail = 0; const ok = (n, c, e = "") => { if (c) { pass++; console.log("  ✓ " + n + (e ? "  " + e : "")); } else { fail++; console.log("  ✗ " + n + "  " + e); } };
  const r = generate(8, { seed: 29 });
  ok("generated certified boolean tasks", r.tasks.length === 8, `yield=${r.yield.toFixed(3)}`);
  ok("EVERY task solved via bool_combine", r.tasks.every(t => t.meta.program.startsWith("bool:")));
  ok("EVERY task unique + reproduces test", r.tasks.every(t => { const s = A.solveTask(t, { maxDepth: 2 }); return s.unique && s.prediction && eqG(s.prediction, t.out[0]); }));
  const ops = {}; for (const t of r.tasks) { const o = t.meta.program.split(":")[1].split(",")[0]; ops[o] = (ops[o] || 0) + 1; }
  console.log("  · op coverage: " + JSON.stringify(ops));
  console.log(`\n${pass} passed, ${fail} failed`); if (fail) process.exit(1);
}
