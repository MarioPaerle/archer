#!/usr/bin/env node
/* gen_compositional.js — the ACTUAL product: tasks are COMPOSITIONS of interacting rules.
 *
 * ARC-AGI-2 design (SOURCES/03 launch blog) targets: (1) symbolic interpretation, (2) compositional reasoning
 * — "applicare simultaneamente più regole che interagiscono", (3) contextual rule application; plus in-context
 * symbol definition. A single-mechanism task (just gravity, just a legend) hits NONE of these. The unit of
 * difficulty must be a COMPOSITION.
 *
 * The pivot architecture already composes: arc_search searches PROGRAMS over the DSL, so `apply_legend ▷
 * gravity_down ▷ outline_all` is one searchable, certifiable object. The "families" are PRIMITIVES, not
 * products. This generator samples MIXED programs (≥2 distinct rule families, depth ≥2) and keeps a task only
 * if arc_search re-derives the whole composition: unique, covered, reproduces the test. Legend compositions
 * also carry the in-context symbol (the key differs per example) and stay legend-necessary under composition.
 *
 *   node gen_compositional.js --self-test
 *   node gen_compositional.js --n 16
 */
const A = require("./arc_search.js");
const S = require("./solver.js");
const seg = S.segObjects;
const H = g => g.length, W = g => g[0].length;
const blank = (h, w) => Array.from({ length: h }, () => new Array(w).fill(0));
const eqG = (a, b) => a.length === b.length && a[0].length === b[0].length && a.every((r, i) => r.every((x, j) => x === b[i][j]));
function gridFrom(g, objs) { const b = blank(H(g), W(g)); for (const o of objs) for (let i = 0; i < o.loc.length; i++) for (let j = 0; j < o.loc[0].length; j++) { const v = o.loc[i][j]; if (v && o.r + i >= 0 && o.c + j >= 0 && o.r + i < H(g) && o.c + j < W(g)) b[o.r + i][o.c + j] = v; } return b; }
function makeRng(seed) { let s = seed >>> 0 || 1; return () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff; }
const grav = A._h.gravity, outl = A._h.outlineLoc;
function safe(fn) { return g => { try { const r = fn(g); return r && r.length && r[0].length ? r : null; } catch { return null; } }; }

// generation ops, tagged by FAMILY (so we can require a task to span ≥2 families = real composition)
const STRUCT = [
  { label: "flipH", fam: "geom", fn: g => g.map(r => r.slice().reverse()) },
  { label: "flipV", fam: "geom", fn: g => g.slice().reverse().map(r => r.slice()) },
  { label: "rot180", fam: "geom", fn: g => g.slice().reverse().map(r => r.slice().reverse()) },
  { label: "transpose", fam: "geom", fn: g => g[0].map((_, c) => g.map(r => r[c])) },
  { label: "gravity_down", fam: "grav", fn: g => grav(g, "down") },
  { label: "gravity_left", fam: "grav", fn: g => grav(g, "left") },
  { label: "gravity_right", fam: "grav", fn: g => grav(g, "right") },
  { label: "outline_all", fam: "morph", fn: g => { const o = seg(g); for (const x of o) x.loc = outl(x.loc); return gridFrom(g, o); } },
  { label: "fill_holes", fam: "morph", fn: g => { const o = seg(g); if (!o.some(x => x.hasHole)) return null; for (const x of o) if (x.hasHole) x.loc = x.loc.map(r => r.map(c => c || x.mainColor)); return gridFrom(g, o); } },
];
const famOf = lab => lab.startsWith("colormap") ? "colormap" : lab === "apply_legend" ? "legend" : lab.startsWith("gravity") ? "grav"
  : ["flipH", "flipV", "rot90", "rot180", "rot270", "transpose"].includes(lab) ? "geom"
  : ["outline_all", "fill_holes", "denoise"].includes(lab) ? "morph"
  : ["keep_largest", "keep_smallest", "remove_largest", "remove_smallest"].includes(lab) ? "select"
  : (lab.startsWith("recolor") || lab.startsWith("swap")) ? "color" : "other";
const famCount = prog => new Set(prog.split(" |> ").map(famOf)).size;

// ---- scenes ----
const SHAPES = [[[1, 1], [1, 0]], [[1, 1], [1, 1]], [[1, 1, 1]], [[1], [1], [1]], [[0, 1, 0], [1, 1, 1], [0, 1, 0]], [[1, 1, 1], [1, 0, 1], [1, 1, 1]], [[1, 1, 1], [1, 1, 1]]];
function placeObjs(rng, g, colors, c0min) {                 // place |colors| objects, distinct cells, no touching
  const ri = n => Math.floor(rng() * n), h = H(g), w = W(g); let placed = 0;
  for (const col of colors) { let ok = false, t = 0;
    while (!ok && t++ < 200) {
      const m = SHAPES[ri(SHAPES.length)], rh = m.length, rw = m[0].length;
      const r0 = ri(h - rh + 1), c0 = c0min + ri(w - c0min - rw + 1);
      let clash = false;
      for (let i = -1; i <= rh && !clash; i++) for (let j = -1; j <= rw && !clash; j++) { const y = r0 + i, x = c0 + j; if (y >= 0 && y < h && x >= c0min - 1 && x < w && g[y][x]) clash = true; }
      if (clash) continue;
      for (let i = 0; i < rh; i++) for (let j = 0; j < rw; j++) if (m[i][j]) g[r0 + i][c0 + j] = col;
      ok = true; placed++;
    }
  }
  return placed === colors.length;
}
function plainScene(rng, h, w, colors) { const g = blank(h, w); return placeObjs(rng, g, colors, 0) ? g : null; }
function legendScene(rng, h, w, K) {                        // key panel [src|tgt] + divider + work objects in src colours
  const ri = n => Math.floor(rng() * n), DIV = 5;
  const pal = [1, 2, 3, 4, 6, 7, 8, 9].sort(() => rng() - 0.5);
  const src = pal.slice(0, K), tgt = pal.slice(K, 2 * K), map = {}; src.forEach((s, i) => map[s] = tgt[i]);
  const g = blank(h, w); for (let r = 0; r < h; r++) g[r][2] = DIV; for (let i = 0; i < K; i++) { g[i][0] = src[i]; g[i][1] = tgt[i]; }
  if (!placeObjs(rng, g, src.concat([src[ri(K)]]), 3)) return null;
  return { grid: g, map };
}

function sampleStructProgram(rng, len) {                    // len distinct-ish structural ops
  const out = []; let last = null;
  while (out.length < len) { const s = STRUCT[Math.floor(rng() * STRUCT.length)]; if (s.label === last) continue; out.push(s); last = s.label; }
  return out;
}
const runFns = (fns, g) => { let x = g; for (const f of fns) { x = safe(f)(x); if (!x) return null; } return x; };

function genTask(rng, opts = {}) {
  const h = opts.h ?? 11, w = opts.w ?? 12, nPairs = opts.nPairs ?? 3;
  const useLegend = rng() < (opts.legendFrac ?? 0.5);
  // build the FIXED structural tail of the composition (same rule every example)
  const tail = sampleStructProgram(rng, useLegend ? 1 + (rng() < 0.5 ? 1 : 0) : 2 + (rng() < 0.5 ? 1 : 0));
  const tailFns = tail.map(s => s.fn), tailLabels = tail.map(s => s.label);

  function example() {
    if (useLegend) { const sc = legendScene(rng, h, w, opts.K ?? 3); if (!sc) return null; const out = runFns([A._h.applyLegend, ...tailFns], sc.grid); return out && !eqG(out, sc.grid) ? { in: [sc.grid], out: [out], map: sc.map } : null; }
    const pal = [1, 2, 3, 4, 6, 7, 8, 9].sort(() => rng() - 0.5).slice(0, 4);
    const inG = plainScene(rng, h, w, pal); if (!inG) return null; const out = runFns(tailFns, inG); return out && !eqG(out, inG) ? { in: [inG], out: [out] } : null;
  }
  const exs = []; for (let i = 0, guard = 0; i < nPairs && guard < 80; guard++) { const e = example(); if (e) exs.push(e); i = exs.length; }
  if (exs.length < nPairs) return null;
  const test = example(); if (!test) return null;
  const task = { examples: exs.map(e => ({ in: e.in, out: e.out })), in: test.in, out: test.out,
    meta: { source: "gen_compositional", intended: (useLegend ? "apply_legend |> " : "") + tailLabels.join(" |> "), useLegend } };

  // --- certify the COMPOSITION end-to-end ---
  const maxD = (useLegend ? 1 : 0) + tail.length + 1;
  const s = A.solveTask(task, { maxDepth: maxD });
  if (!s.solvable || !s.unique || !s.prediction || !eqG(s.prediction, task.out[0])) return null;
  const prog = s.programLabels[0];
  if (s.depth < 2) return null;                              // must be a genuine composition, not one rule
  if (famCount(prog) < 2) return null;                       // must span ≥2 rule families
  if (useLegend && !prog.includes("apply_legend")) return null;
  // legend compositions must remain legend-necessary (in-context symbol still does real work under composition)
  if (useLegend) {
    const bl = JSON.parse(JSON.stringify(task));
    const blank0 = g => { const d = A._h.findDivider(g); const o = g.map(r => r.slice()); if (d >= 0) for (let r = 0; r < o.length; r++) for (let c = 0; c <= d; c++) o[r][c] = 0; return o; };
    bl.examples = bl.examples.map(e => ({ in: [blank0(e.in[0])], out: e.out })); bl.in = [blank0(task.in[0])];
    const sb = A.solveTask(bl, { maxDepth: 3, allowColorMap: true });
    if (sb.solvable && sb.unique) return null;               // solvable without the key ⇒ symbol not load-bearing
  }
  task.meta.program = prog; task.meta.depth = s.depth; task.meta.families = [...new Set(prog.split(" |> ").map(famOf))];
  return task;
}

function generate(n, opts = {}) {
  const rng = makeRng(opts.seed ?? 17); const out = []; let attempts = 0;
  while (out.length < n && attempts < n * 400) { attempts++; const t = genTask(rng, opts); if (t) out.push(t); }
  return { tasks: out, attempts, yield: out.length / Math.max(1, attempts) };
}

module.exports = { generate, genTask, famOf };

// ---------------- self-test ----------------
function selfTest() {
  console.log("gen_compositional self-test  (ARC-2: multiple interacting rules per task)");
  let pass = 0, fail = 0;
  const ok = (n, c, e = "") => { if (c) { pass++; console.log("  ✓ " + n + (e ? "  " + e : "")); } else { fail++; console.log("  ✗ " + n + "  " + e); } };
  const r = generate(12, { seed: 17 });
  ok("generated certified compositional tasks", r.tasks.length === 12, `yield=${r.yield.toFixed(3)}`);
  ok("EVERY task is a genuine composition (depth ≥2)", r.tasks.every(t => t.meta.depth >= 2));
  ok("EVERY task spans ≥2 rule families", r.tasks.every(t => t.meta.families.length >= 2));
  ok("the search re-derives the WHOLE composition (unique, reproduces test)", r.tasks.every(t => { const s = A.solveTask(t, { maxDepth: 4 }); return s.unique && s.prediction && eqG(s.prediction, t.out[0]); }));
  const legendComps = r.tasks.filter(t => t.meta.useLegend);
  ok("legend compositions exist and stay legend-necessary", legendComps.length > 0 && legendComps.every(t => t.meta.program.includes("apply_legend")), `${legendComps.length} legend-composites`);
  const fams = {}; for (const t of r.tasks) t.meta.families.forEach(f => fams[f] = (fams[f] || 0) + 1);
  console.log("  · family coverage: " + JSON.stringify(fams));
  console.log("  · sample compositions:\n      " + r.tasks.slice(0, 6).map(t => t.meta.program).join("\n      "));
  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) process.exit(1);
}
if (require.main === module && process.argv.includes("--self-test")) selfTest();
