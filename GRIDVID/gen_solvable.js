#!/usr/bin/env node
/* gen_solvable.js — generate ONLY SOLVER-VERIFIED, hierarchical, solvable tasks.
 *
 * Every emitted task is re-derived by solver.js from the train pairs alone and reproduces the held-out
 * test output UNIQUELY (no second rule fits the train but predicts a different test). So unlike the random
 * deep chains, these are guaranteed solvable & useful. Hierarchy comes from MEANINGFUL structure:
 *   - groupby(K):       one recoverable feature K decides each object's transform (the canonical ARC rule)
 *   - region(R)∘groupby: depth-2 — inside a region apply a group-rule, outside leave unchanged
 *   - select(extreme):  the largest/smallest object is transformed, the rest unchanged
 * Breadth = combinatorial choice of key × per-value transform × shapes × colours, all VERIFIED solvable.
 *
 *   node gen_solvable.js --n 40 --report          # show distinct solvable rules + solver confirmation
 *   node gen_solvable.js --n 500 -o out/solvable.jsonl
 *   node gen_solvable.js --self-test
 */
const crypto = require("crypto");
const E = require("./engine.js");
const B = require("./baseline.js");
const P = require("./program.js");
const S = require("./solver.js");

const pick = (rng, xs) => xs[rng.int(0, xs.length - 1)];
const sampleK = (rng, xs, k) => { const a = xs.slice(); for (let i = a.length - 1; i > 0; i--) { const j = rng.int(0, i);[a[i], a[j]] = [a[j], a[i]]; } return a.slice(0, k); };
const PALETTE = [1, 2, 3, 4, 6, 7, 8, 9];
const CORES = [1, 2, 3, 4];
const CENTER_FILLED = ["square", "diamond", "plus"];   // centre cell always occupied → core never strays
const COMPACT = ["square", "diamond", "plus", "Tshape", "Lshape", "triangle", "notch"];

// a transform that visibly changes a SOLID object and is solver-detectable
function geomT(rng) { return pick(rng, [{ t: "mirror_h" }, { t: "flip_v" }, { t: "rotate_180" }, { t: "outline" }]); }
function anyT(rng, exclude) { return rng.int(0, 1) ? { t: "recolor", color: pick(rng, PALETTE.filter(c => c !== exclude)) } : geomT(rng); }

// ---- build a (scene-sampler, AST node) pair for a chosen key/template ----
// Non-colour templates use a SINGLE body colour, so the ONLY varying feature is the intended key →
// the solver re-derives THE intended rule cleanly and uniqueness is strong (no competing key varies).
function buildRule(rng) {
  const key = pick(rng, ["color", "core_color", "size_class", "quadrant", "has_hole", "orientation", "size_rank"]);
  let region = rng.int(0, 2) === 0 ? pick(rng, [{ reg: "half", side: "left" }, { reg: "half", side: "top" }]) : null;   // ~1/3 wrapped in a region (depth-2)
  const bc = pick(rng, PALETTE);   // single body colour for non-colour templates
  let sampler, cases, def = { t: "identity" }, keyName = key;

  if (key === "core_color") {
    const cs = sampleK(rng, CORES, rng.int(2, 3));
    cases = {}; const pool = [{ t: "mirror_h" }, { t: "flip_v" }, { t: "rotate_180" }, { t: "outline" }, { t: "recolor_core", color: pick(rng, PALETTE.filter(c => !cs.includes(c))) }, { t: "remove" }];
    const ts = sampleK(rng, pool, cs.length); cs.forEach((c, i) => cases[c] = ts[i]);
    sampler = r => P.sampleScene(r, { H: r.int(16, 22), W: r.int(16, 22), K: r.int(4, 6), kinds: CENTER_FILLED, size: 3, palette: [5], withCore: true, corePalette: cs, ensureCores: cs, spreadHalves: !!region, gap: 2 });
  } else if (key === "has_hole") {
    cases = { holed: { t: "fill_hole" }, solid: { t: "outline" } };
    sampler = r => P.sampleScene(r, { H: r.int(16, 22), W: r.int(16, 22), K: r.int(4, 6), kinds: ["square", "diamond"], holedMix: true, palette: [bc], spreadHalves: !!region, gap: 2 });
  } else if (key === "size_class") {
    cases = { small: anyT(rng, bc), large: anyT(rng, bc) };
    sampler = r => P.sampleScene(r, { H: r.int(16, 22), W: r.int(16, 22), K: r.int(4, 6), kinds: ["square"], sizes: [2, 2, 3, 4, 3, 2], palette: [bc], spreadHalves: !!region, gap: 2 });
  } else if (key === "size_rank") {
    cases = { largest: anyT(rng, bc) }; keyName = "size_rank"; region = null;
    sampler = r => P.sampleScene(r, { H: r.int(17, 23), W: r.int(17, 23), K: r.int(3, 4), kinds: ["square"], sizes: sampleK(r, [2, 3, 4, 5], r.int(3, 4)), palette: [bc], gap: 2 });
  } else if (key === "quadrant") {
    const qs = ["TL", "TR", "BL", "BR"]; cases = {}; const ts = qs.map(() => anyT(rng, bc)); qs.forEach((q, i) => cases[q] = ts[i]);
    sampler = r => P.sampleScene(r, { H: r.int(18, 22), W: r.int(18, 22), K: 4, kinds: ["square"], size: 2, palette: [bc], gap: 2 });
    region = null;
  } else if (key === "orientation") {
    cases = { wide: anyT(rng, bc), tall: anyT(rng, bc), square: anyT(rng, bc) };
    sampler = r => P.sampleScene(r, { H: r.int(16, 22), W: r.int(16, 22), K: r.int(4, 6), kinds: ["Lshape", "Tshape", "notch", "triangle", "square"], size: 3, palette: [bc], spreadHalves: !!region, gap: 2 });
  } else { // color — the one template that varies colour
    const cols = sampleK(rng, PALETTE, rng.int(2, 3)); cases = {}; const ts = cols.map(() => geomT(rng)); cols.forEach((c, i) => cases[c] = ts[i]);
    sampler = r => P.sampleScene(r, { H: r.int(16, 22), W: r.int(16, 22), K: r.int(4, 6), kinds: COMPACT, size: 3, palette: cols, ensureColors: cols, spreadHalves: !!region, gap: 2 });
  }
  let node = { op: "dispatch", key: { k: keyName }, cases, default: def };
  if (region) node = { op: "mask", region, node };
  return { key: keyName, region, node, sampler, cases };
}

// ---- generate-and-VERIFY ----
function generate(opts = {}) {
  const n = opts.n || 40, rng = E.makeRng((opts.seed || 1) * 2654435761 + 53);
  const out = [], seenRule = new Set(), seenId = new Set();
  let attempts = 0, ambiguous = 0, unsolvable = 0, trivial = 0;
  const budget = opts.budget || n * 60, dedup = opts.dedup !== false;
  while (out.length < n && attempts < budget) {
    attempts++;
    const R = buildRule(rng);
    const prog = { name: "solvable", rule: "(verified below)", concepts: ["dispatch", "key:" + R.key, R.region ? "region" : "global", "solvable"], node: R.node, sampler: R.sampler, prior: "solvable-hierarchical" };
    let task; try { task = P.buildProgramTask(prog, { seed: attempts * 13 + 1 }); } catch (e) { continue; }
    // teaching: every pair changes + examples vary
    if (task.examples.some(e => JSON.stringify(e.in) === JSON.stringify(e.out))) continue;
    if (new Set(task.examples.map(e => JSON.stringify(e.out))).size < 2) continue;
    if (B.trivialSolve(task)) { trivial++; continue; }                 // baseline-hard
    const sv = S.solvable(task);                                       // THE gate: solver must re-derive it
    if (!sv.solvable) { unsolvable++; continue; }
    if (!sv.unique) { ambiguous++; continue; }
    if (dedup && seenRule.has(sv.rule)) continue;
    if (seenId.has(task.meta.id)) continue;
    seenRule.add(sv.rule); seenId.add(task.meta.id);
    task.meta.rule = sv.rule + ".";
    task.meta.language_description = task.meta.rule;
    task.meta.solver = { rule: sv.rule, unique: sv.unique, n_fits: sv.n_fits, key: R.key, region: R.region || null };
    task.meta.difficulty = +Math.min(1, 0.4 + 0.12 * Object.keys(R.cases).length + (R.region ? 0.12 : 0)).toFixed(2);
    out.push(task);
  }
  return { records: out, attempts, emitted: out.length, rejected: { unsolvable, ambiguous, trivial }, distinct_rules: seenRule.size };
}

function selfTest() {
  const r = generate({ n: 30, seed: 3 });
  if (r.emitted < 30) throw new Error("gen_solvable: underfilled (" + r.emitted + "/30)");
  // EVERY emitted task must be uniquely solvable by the independent solver (the whole point)
  for (const t of r.records) {
    const sv = S.solvable(t);
    if (!sv.solvable || !sv.unique) throw new Error("emitted task NOT uniquely solvable: " + t.meta.id + " — " + sv.reason);
    if (B.trivialSolve(t)) throw new Error("trivial task leaked: " + t.meta.id);
    if (t.examples.some(e => JSON.stringify(e.in) === JSON.stringify(e.out))) throw new Error("identity example: " + t.meta.id);
  }
  // determinism
  const a = generate({ n: 12, seed: 9 }).records.map(t => t.meta.id).join(",");
  const b = generate({ n: 12, seed: 9 }).records.map(t => t.meta.id).join(",");
  if (a !== b) throw new Error("gen_solvable: non-deterministic");
  if (r.distinct_rules < 20) throw new Error("gen_solvable: too few distinct rules (" + r.distinct_rules + ")");
  return true;
}

if (require.main === module) {
  const args = process.argv.slice(2), flag = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
  if (args.includes("--self-test")) { selfTest(); console.log("gen_solvable: self-test PASS"); }
  else {
    const n = +flag("--n", 40), seed = +flag("--seed", 1), o = flag("-o", null);
    const r = generate({ n, seed });
    if (args.includes("--report")) {
      console.error(`\nSOLVER-VERIFIED — ${r.emitted} tasks from ${r.attempts} samples · ${r.distinct_rules} distinct solvable rules`);
      console.error(`rejected: ${r.rejected.unsolvable} unsolvable, ${r.rejected.ambiguous} ambiguous, ${r.rejected.trivial} trivial`);
      console.error("\nsample of VERIFIED-SOLVABLE rules (re-derived by the solver from the examples):");
      for (const t of r.records.slice(0, 16)) console.error(`  [diff ${t.meta.difficulty}] ${t.meta.rule}`);
      console.error("");
    }
    if (o) { require("fs").writeFileSync(o, r.records.map(t => JSON.stringify(t)).join("\n") + "\n"); console.error(`wrote ${r.emitted} solver-verified tasks → ${o}`); }
    else if (!args.includes("--report")) console.log(r.records.map(t => JSON.stringify(t)).join("\n"));
  }
}

module.exports = { generate, buildRule };
