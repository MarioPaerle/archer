#!/usr/bin/env node
/* gen_counting.js — F-T4 COUNTING / number sense (a whole Core-Knowledge prior, absent until now).
 * Rule: count the objects of a target colour; render the count as a bar of that length+colour.
 * Distractor objects of OTHER colours force "count BY COLOUR" (not count-all) — selection ∧ counting.
 * Certified by arc_search via the count_bar primitive (unique program, reproduces test).
 *   node gen_counting.js --self-test
 */
const A = require("./arc_search.js");
const blank = (h, w) => Array.from({ length: h }, () => new Array(w).fill(0));
const eqG = (a, b) => a.length === b.length && a[0].length === b[0].length && a.every((r, i) => r.every((x, j) => x === b[i][j]));
function makeRng(seed) { let s = seed >>> 0 || 1; return () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff; }
const PALETTE = [1, 2, 3, 4, 6, 7, 8, 9];

function scene(rng, h, w, counts) {                 // counts: {color: nObjects}; place that many 1-cell objects each
  const ri = n => Math.floor(rng() * n); const g = blank(h, w);
  const want = Object.entries(counts).flatMap(([c, n]) => Array(n).fill(+c));
  let placed = 0;
  for (const col of want) {
    let ok = false, t = 0;
    while (!ok && t++ < 200) {
      const r0 = ri(h), c0 = ri(w);
      let clash = false;
      for (let i = -1; i <= 1 && !clash; i++) for (let j = -1; j <= 1 && !clash; j++) { const y = r0 + i, x = c0 + j; if (y >= 0 && y < h && x >= 0 && x < w && g[y][x]) clash = true; }
      if (clash) continue; g[r0][c0] = col; ok = true; placed++;
    }
  }
  return placed === want.length ? g : null;
}

function genTask(rng, opts = {}) {
  const h = opts.h ?? 11, w = opts.w ?? 11, nPairs = opts.nPairs ?? 3;
  const pal = PALETTE.slice().sort(() => rng() - 0.5);
  const target = pal[0], distractors = pal.slice(1, 3);   // count `target`; other colours are distractors
  const orient = rng() < 0.5 ? "row" : "col";
  const intended = `count_bar:${target},${orient}`;
  const render = n => orient === "row" ? [new Array(n).fill(target)] : Array.from({ length: n }, () => [target]);
  function example() {
    const nT = 1 + Math.floor(rng() * 5);                  // 1..5 target objects
    const counts = { [target]: nT }; for (const d of distractors) counts[d] = Math.floor(rng() * 4);  // 0..3 distractors each
    const g = scene(rng, h, w, counts); if (!g) return null;
    return { in: [g], out: [render(nT)] };
  }
  const exs = []; for (let i = 0, gu = 0; i < nPairs && gu < 60; gu++) { const e = example(); if (e) exs.push(e); i = exs.length; }
  if (exs.length < nPairs) return null;
  // the target count must vary across pairs (so the rule isn't pinnable as a constant output)
  if (new Set(exs.map(e => e.out[0].length === 1 ? e.out[0][0].length : e.out[0].length)).size < 2) return null;
  const test = example(); if (!test) return null;
  const task = { examples: exs, in: test.in, out: test.out, meta: { source: "gen_counting", family: "counting", intended } };
  const s = A.solveTask(task, { maxDepth: 2 });
  if (!s.solvable || !s.unique || !s.prediction || !eqG(s.prediction, task.out[0])) return null;
  if (!s.programLabels[0].startsWith("count_bar")) return null;
  task.meta.program = s.programLabels[0]; task.meta.obsNeeded = A.obsNeeded(task, { maxDepth: 2 });
  return task;
}

function generate(n, opts = {}) {
  const rng = makeRng(opts.seed ?? 23); const out = []; let attempts = 0;
  while (out.length < n && attempts < n * 200) { attempts++; const t = genTask(rng, opts); if (t) out.push(t); }
  return { tasks: out, attempts, yield: out.length / Math.max(1, attempts) };
}
module.exports = { generate, genTask };

if (require.main === module && process.argv.includes("--self-test")) {
  console.log("gen_counting self-test  (T4 counting)");
  let pass = 0, fail = 0; const ok = (n, c, e = "") => { if (c) { pass++; console.log("  ✓ " + n + (e ? "  " + e : "")); } else { fail++; console.log("  ✗ " + n + "  " + e); } };
  const r = generate(8, { seed: 23 });
  ok("generated certified counting tasks", r.tasks.length === 8, `yield=${r.yield.toFixed(3)}`);
  ok("EVERY task solved via count_bar", r.tasks.every(t => t.meta.program.startsWith("count_bar")));
  ok("EVERY task unique + reproduces test", r.tasks.every(t => { const s = A.solveTask(t, { maxDepth: 2 }); return s.unique && s.prediction && eqG(s.prediction, t.out[0]); }));
  console.log("  · sample programs: " + r.tasks.slice(0, 4).map(t => t.meta.program + " (obs " + t.meta.obsNeeded + ")").join(", "));
  console.log(`\n${pass} passed, ${fail} failed`); if (fail) process.exit(1);
}
