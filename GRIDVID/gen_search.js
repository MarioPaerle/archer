#!/usr/bin/env node
/* gen_search.js — the PIVOT generator (handover move #2). Program-FIRST, search-VERIFIED.
 *
 * Instead of templating a one-line rule (v1), it SAMPLES a compositional program p = op_d ∘ … ∘ op_1
 * (depth d≥3) over the arc_search DSL, renders (IN,OUT) over varied multi-object scenes, then KEEPS the
 * task only if arc_search.difficulty() certifies it `hard-valid`: minimal solving depth ≥3 (so no shorter
 * program fits — proven by the search itself), a UNIQUE determined test answer, balanced on the SCORE.
 *
 * Crucially the search — not the sampler — decides difficulty: a sampled depth-3 program that COLLAPSES to
 * an equivalent depth-1 program (e.g. flipH|>flipH) is rejected because the search finds the shorter form.
 * The hardest task we can emit = the search horizon. (Forced under-determination / legend ops = next move.)
 *
 *   node gen_search.js --self-test
 *   node gen_search.js --n 20 --depth 3            # print certified tasks (jsonl-ish summary)
 */
const A = require("./arc_search.js");
const S = require("./solver.js");
const seg = S.segObjects;
const H = g => g.length, W = g => g[0].length;
const blank = (h, w) => Array.from({ length: h }, () => new Array(w).fill(0));
const eqG = (a, b) => a.length === b.length && a[0].length === b[0].length && a.every((r, i) => r.every((x, j) => x === b[i][j]));
function gridFrom(h, w, objs) {
  const g = blank(h, w);
  for (const o of objs) for (let i = 0; i < o.loc.length; i++) for (let j = 0; j < o.loc[0].length; j++) {
    const v = o.loc[i][j]; if (v && o.r + i >= 0 && o.c + j >= 0 && o.r + i < h && o.c + j < w) g[o.r + i][o.c + j] = v;
  }
  return g;
}

// ---- a small RNG (no Date/Math.random in the logic path; seedable for reproducibility) ----
function makeRng(seed) { let s = seed >>> 0 || 1; return () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff; }

// ---- scene generator: K non-overlapping objects (rect / L / plus), distinct sizes & ARC colours, varied ----
const ARC = [1, 2, 3, 4, 5, 6, 7, 8, 9];
function shapeMask(kind, rh, rw) {
  const m = Array.from({ length: rh }, () => new Array(rw).fill(1));
  if (kind === "L") for (let i = 0; i < rh - 1; i++) for (let j = 1; j < rw; j++) m[i][j] = 0;
  else if (kind === "plus" && rh >= 3 && rw >= 3) { for (let i = 0; i < rh; i++) for (let j = 0; j < rw; j++) m[i][j] = (i === (rh >> 1) || j === (rw >> 1)) ? 1 : 0; }
  else if (kind === "frame" && rh >= 3 && rw >= 3) { for (let i = 1; i < rh - 1; i++) for (let j = 1; j < rw - 1; j++) m[i][j] = 0; }
  return m;
}
function scene(rng, h, w, k) {
  const ri = n => Math.floor(rng() * n);
  const g = blank(h, w); const cols = ARC.slice().sort(() => rng() - 0.5);
  const kinds = ["rect", "L", "plus", "frame"];
  const areas = new Set(); let placed = 0, tries = 0;
  while (placed < k && tries < 800) {
    tries++;
    const rh = 1 + ri(4), rw = 1 + ri(4); const kind = kinds[ri(kinds.length)];
    const mask = shapeMask(kind, rh, rw); let area = 0; for (const row of mask) for (const x of row) area += x;
    if (area < 1 || areas.has(area)) continue;                    // distinct areas ⇒ size selectors are well-defined
    const r0 = ri(h - rh + 1), c0 = ri(w - rw + 1);
    let clash = false;
    for (let i = -1; i <= rh && !clash; i++) for (let j = -1; j <= rw && !clash; j++) { const y = r0 + i, x = c0 + j; if (y >= 0 && y < h && x >= 0 && x < w && g[y][x]) clash = true; }
    if (clash) continue;
    const col = cols[placed % cols.length];
    for (let i = 0; i < rh; i++) for (let j = 0; j < rw; j++) if (mask[i][j]) g[r0 + i][c0 + j] = col;
    areas.add(area); placed++;
  }
  return placed === k ? g : null;
}

// ---- concrete grid→grid steps to SAMPLE programs from (a curated subset of the arc_search DSL) ----
const grav = A._h.gravity, outl = A._h.outlineLoc;
function extreme(g, which) { const o = seg(g); if (o.length < 2) return null; const a = o.map(x => x.area), e = which === "largest" ? Math.max(...a) : Math.min(...a); const s = o.filter(x => x.area === e); return s.length === 1 ? s[0] : null; }
const STEPS = [
  { label: "flipH", fn: g => g.map(r => r.slice().reverse()) },
  { label: "flipV", fn: g => g.slice().reverse().map(r => r.slice()) },
  { label: "rot180", fn: g => g.slice().reverse().map(r => r.slice().reverse()) },
  { label: "transpose", fn: g => g[0].map((_, c) => g.map(r => r[c])) },
  { label: "gravity_down", fn: g => grav(g, "down") },
  { label: "gravity_up", fn: g => grav(g, "up") },
  { label: "gravity_left", fn: g => grav(g, "left") },
  { label: "gravity_right", fn: g => grav(g, "right") },
  { label: "fill_holes", fn: g => { const o = seg(g); for (const x of o) if (x.hasHole) x.loc = x.loc.map(r => r.map(() => x.mainColor)); return gridFrom(H(g), W(g), o); } },
  { label: "outline_all", fn: g => { const o = seg(g); for (const x of o) x.loc = outl(x.loc); return gridFrom(H(g), W(g), o); } },
  { label: "denoise", fn: g => { const o = seg(g).filter(x => x.area > 1); return o.length ? gridFrom(H(g), W(g), o) : null; } },
  { label: "remove_largest", fn: g => { const s = extreme(g, "largest"); if (!s) return null; return gridFrom(H(g), W(g), seg(g).filter(x => !(x.r === s.r && x.c === s.c && x.area === s.area))); } },
  { label: "remove_smallest", fn: g => { const s = extreme(g, "smallest"); if (!s) return null; return gridFrom(H(g), W(g), seg(g).filter(x => !(x.r === s.r && x.c === s.c && x.area === s.area))); } },
  { label: "keep_largest", fn: g => { const s = extreme(g, "largest"); return s ? gridFrom(H(g), W(g), [s]) : null; } },
];
function safeStep(step) { return g => { try { const r = step.fn(g); return r && r.length && r[0].length ? r : null; } catch { return null; } }; }

// ---- sample a depth-d program; avoid the obvious involution collapse (op immediately followed by itself) ----
function sampleProgram(rng, depth) {
  const prog = []; let last = null;
  while (prog.length < depth) {
    const st = STEPS[Math.floor(rng() * STEPS.length)];
    if (st.label === last) continue;                              // cheap collapse guard; the SEARCH catches the rest
    prog.push(st); last = st.label;
  }
  return prog;
}
function runProg(prog, g) { let x = g; for (const s of prog) { x = safeStep(s)(x); if (!x) return null; } return x; }

// ---- generate ONE certified task, or null ----
function genTask(rng, opts = {}) {
  const depth = opts.depth ?? 3, nPairs = opts.nPairs ?? 4, h = opts.h ?? 10, w = opts.w ?? 10, k = opts.k ?? 4;
  const prog = sampleProgram(rng, depth);
  const examples = []; let guard = 0;
  while (examples.length < nPairs && guard < 60) {
    guard++; const inG = scene(rng, h, w, k); if (!inG) continue;
    const outG = runProg(prog, inG); if (!outG || eqG(outG, inG)) continue;
    examples.push({ in: [inG], out: [outG] });
  }
  if (examples.length < nPairs) return null;
  const inG = scene(rng, h, w, k); if (!inG) return null;
  const outG = runProg(prog, inG); if (!outG) return null;
  const task = { examples, in: [inG], out: [outG], meta: { source: "gen_search", sampledProgram: prog.map(s => s.label).join(" |> "), sampledDepth: depth } };
  const d = A.difficulty(task, { maxDepth: Math.max(3, depth), minDepth: 3 });
  if (d.verdict !== "hard-valid") return null;                    // SEARCH is the judge, not the sampler
  task.meta.difficulty = d;
  return task;
}

function generate(n, opts = {}) {
  const rng = makeRng(opts.seed ?? 7);
  const out = []; let attempts = 0;
  while (out.length < n && attempts < n * 200) { attempts++; const t = genTask(rng, opts); if (t) out.push(t); }
  return { tasks: out, attempts, yield: out.length / Math.max(1, attempts) };
}

module.exports = { generate, genTask, scene, STEPS, makeRng };

// ---------------- self-test ----------------
function selfTest() {
  console.log("gen_search self-test");
  let pass = 0, fail = 0;
  const ok = (n, c, e = "") => { if (c) { pass++; console.log("  ✓ " + n + (e ? "  " + e : "")); } else { fail++; console.log("  ✗ " + n + "  " + e); } };

  const r = generate(8, { seed: 7, depth: 3, nPairs: 4 });
  ok("generated the requested number of certified tasks", r.tasks.length === 8, `yield=${r.yield.toFixed(3)} attempts=${r.attempts}`);
  ok("EVERY emitted task is certified hard-valid (search-verified)", r.tasks.every(t => t.meta.difficulty.verdict === "hard-valid"));
  ok("EVERY emitted task has minimal solving depth >= 3", r.tasks.every(t => t.meta.difficulty.depth >= 3));
  ok("EVERY emitted task has a UNIQUE determined test answer", r.tasks.every(t => t.meta.difficulty.unique));
  // independent re-verification: re-solve each task from scratch and confirm the search reproduces the test
  const A2 = require("./arc_search.js");
  ok("independent re-solve reproduces every held-out test output", r.tasks.every(t => { const s = A2.solveTask(t, { maxDepth: 3 }); return s.solvable && s.prediction && eqG(s.prediction, t.out[0]); }));

  const depths = r.tasks.map(t => t.meta.difficulty.depth), scores = r.tasks.map(t => t.meta.difficulty.score);
  console.log(`  · depths: ${JSON.stringify(depths)}  scores: ${JSON.stringify(scores)}`);
  console.log(`  · sample programs:\n      ` + r.tasks.slice(0, 4).map(t => t.meta.sampledProgram + "  (minDepth " + t.meta.difficulty.depth + ", obs " + t.meta.difficulty.obsNeeded + ")").join("\n      "));

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) process.exit(1);
}
function eqGtop(a, b) { return eqG(a, b); }
if (require.main === module) {
  if (process.argv.includes("--self-test")) selfTest();
  else {
    const argN = process.argv.indexOf("--n"), argD = process.argv.indexOf("--depth");
    const n = argN > 0 ? +process.argv[argN + 1] : 10, depth = argD > 0 ? +process.argv[argD + 1] : 3;
    const r = generate(n, { seed: 7, depth });
    console.log(`# gen_search: ${r.tasks.length}/${n} certified (yield ${r.yield.toFixed(3)}, ${r.attempts} attempts)`);
    for (const t of r.tasks) console.log(JSON.stringify({ program: t.meta.sampledProgram, depth: t.meta.difficulty.depth, obs: t.meta.difficulty.obsNeeded, score: t.meta.difficulty.score, nPairs: t.examples.length }));
  }
}
