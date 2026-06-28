#!/usr/bin/env node
/* compose_deep.js — DEEP functional composition → combinatorial explosion of DISTINCT rules.
 *
 * The point Mario made: composing 2 things (region panels) just glues two old rules — the RULE
 * itself never changes. To explode the space we sample DEEP programs over the program.js typed
 * combinator AST: seq / mask nesting of dispatch + apply leaves, depth 2..5, over a broad vocab of
 * transforms (recolour / swap / mirror / flip / rotate90/180 / outline / fill / remove / 4-way
 * gravity / translate), keys (colour / core / size / shape / quadrant / hole / orientation),
 * selectors and regions. Each sampled program is a genuinely DIFFERENT rule; the coherence guard
 * (PAN-124) keeps only the coherent, non-trivial, teaching ones, and the rule-signature near-dup key
 * counts how many DISTINCT observable rules we actually get.
 *
 *   node compose_deep.js --n 200 --depth 4 --report     # show the explosion + sample rules
 *   node compose_deep.js --n 500 -o out/deep.jsonl
 *   node compose_deep.js --self-test
 */
const crypto = require("crypto");
const E = require("./engine.js");
const COH = require("./coherence.js");
const P = require("./program.js");

const COLNAME = ["black", "blue", "red", "green", "yellow", "grey", "magenta", "orange", "cyan", "maroon"];
const pick = (rng, xs) => xs[rng.int(0, xs.length - 1)];
const sample = (rng, xs, k) => { const a = xs.slice(); for (let i = a.length - 1; i > 0; i--) { const j = rng.int(0, i);[a[i], a[j]] = [a[j], a[i]]; } return a.slice(0, k); };

const PALETTE = [1, 2, 3, 4, 6, 7, 8, 9];
const CORES = [1, 2, 3, 4];
const KINDS = ["square", "plus", "Lshape", "triangle", "diamond", "Tshape", "notch"];
const FALL_DIRS = ["down", "up", "left", "right"];

// ---- transform vocabulary (rng → tagged descriptor). 'remove' down-weighted (clears too much). ----
function sampleTransform(rng, opts = {}) {
  const bag = [
    () => ({ t: "recolor", color: pick(rng, PALETTE) }),
    () => ({ t: "recolor_core", color: pick(rng, CORES) }),
    () => ({ t: "swap_color", from: pick(rng, PALETTE), to: pick(rng, PALETTE) }),
    () => ({ t: "mirror_h" }), () => ({ t: "flip_v" }),
    () => ({ t: "rotate_90" }), () => ({ t: "rotate_180" }),
    () => ({ t: "outline" }), () => ({ t: "fill_hole" }),
    () => ({ t: "fall", dir: pick(rng, FALL_DIRS) }),
    () => ({ t: "translate", dr: rng.int(-2, 2), dc: rng.int(-2, 2) }),
  ];
  if (!opts.noRemove && rng.int(0, 6) === 0) return { t: "remove" };
  return bag[rng.int(0, bag.length - 1)]();
}

const KEYS = ["color", "core_color", "size_class", "shape_kind", "quadrant", "has_hole", "orientation"];
function keyDomain(key, rng) {
  switch (key) {
    case "color": return sample(rng, PALETTE, rng.int(2, 3));
    case "core_color": return sample(rng, CORES, rng.int(2, 3));
    case "size_class": return ["small", "large"];
    case "shape_kind": return sample(rng, KINDS, rng.int(2, 3));
    case "quadrant": return sample(rng, ["TL", "TR", "BL", "BR"], rng.int(2, 4));
    case "has_hole": return ["holed", "solid"];
    case "orientation": return ["wide", "tall", "square"];
  }
}
function sampleSelector(rng) {
  const s = rng.int(0, 8);
  if (s === 0) return { s: "all" };
  if (s === 1) return { s: "by_color", color: pick(rng, PALETTE) };
  if (s === 2) return { s: "by_size", cls: pick(rng, ["small", "large"]) };
  if (s === 3) return { s: "by_kind", kind: pick(rng, KINDS) };
  if (s === 4) return { s: "by_orientation", orient: pick(rng, ["wide", "tall", "square"]) };
  if (s === 5) return { s: "has_hole", holed: rng.int(0, 1) === 1 };
  if (s === 6) return { s: "in_region", region: sampleRegion(rng) };
  if (s === 7) return { s: "largest" };
  return { s: "smallest" };
}
function sampleRegion(rng) {
  return rng.int(0, 1) ? { reg: "half", side: pick(rng, ["left", "right", "top", "bottom"]) } : { reg: "quadrant", q: pick(rng, ["TL", "TR", "BL", "BR"]) };
}

// ---- leaf: a dispatch (per-object branch) or a selected apply ----
function sampleLeaf(rng) {
  if (rng.int(0, 9) < 6) {                       // dispatch — the rule-branching core
    const key = pick(rng, KEYS), vals = keyDomain(key, rng), cases = {};
    for (const v of vals) cases[v] = sampleTransform(rng);
    const def = rng.int(0, 1) ? sampleTransform(rng, { noRemove: true }) : { t: "identity" };
    return { op: "dispatch", key: { k: key }, cases, default: def };
  }
  return { op: "apply", sel: sampleSelector(rng), transform: sampleTransform(rng) };
}

// ---- recursive AST: nest seq / mask around leaves to a target depth ----
function sampleNode(rng, depth) {
  if (depth <= 1) return sampleLeaf(rng);
  const roll = rng.int(0, 9);
  if (roll < 5) {                                // seq of 2..min(4,depth) sub-programs (the depth driver)
    const k = rng.int(2, Math.min(4, depth + 1)), steps = [];
    for (let i = 0; i < k; i++) steps.push(sampleNode(rng, i === 0 ? depth - 1 : rng.int(1, depth - 1)));
    return { op: "seq", steps };
  }
  if (roll < 8) return { op: "mask", region: sampleRegion(rng), node: sampleNode(rng, depth - 1) };
  return sampleLeaf(rng);
}

// ---- human-readable rule text from the AST (so the distinctness is legible) ----
function tDesc(t) {
  switch (t.t) {
    case "identity": return "leave unchanged";
    case "recolor": return "recolour to " + COLNAME[t.color];
    case "recolor_core": return "set core to " + COLNAME[t.color];
    case "swap_color": return `swap ${COLNAME[t.from]}→${COLNAME[t.to]}`;
    case "mirror_h": return "mirror left-right"; case "flip_v": return "flip top-bottom";
    case "rotate_90": return "rotate 90°"; case "rotate_180": return "rotate 180°";
    case "outline": return "outline (hollow)"; case "fill_hole": return "fill solid";
    case "remove": return "remove"; case "fall": return "gravity " + t.dir;
    case "translate": return `shift (${t.dr},${t.dc})`;
  }
}
function selDesc(s) {
  switch (s.s) {
    case "all": return "every object"; case "by_color": return COLNAME[s.color] + " objects";
    case "by_size": return s.cls + " objects"; case "by_kind": return s.kind + "s";
    case "by_orientation": return s.orient + " objects"; case "has_hole": return (s.holed ? "holed" : "solid") + " objects";
    case "in_region": return "objects in the " + regDesc(s.region); case "largest": return "the largest object"; case "smallest": return "the smallest object";
  }
}
const regDesc = r => r.reg === "half" ? r.side + " half" : r.q + " quadrant";
function describe(node) {
  switch (node.op) {
    case "apply": return tDesc(node.transform) + " " + selDesc(node.sel);
    case "dispatch": return "by " + node.key.k + " — " + Object.entries(node.cases).map(([v, t]) => `${v}: ${tDesc(t)}`).join(", ") + (node.default && node.default.t !== "identity" ? `, else ${tDesc(node.default)}` : "");
    case "mask": return `within the ${regDesc(node.region)}, ${describe(node.node)}`;
    case "seq": return node.steps.map(describe).join("; then ");
    default: return node.op;
  }
}
function concepts(node, acc = new Set()) {
  acc.add(node.op);
  if (node.key) acc.add("key:" + node.key.k);
  if (node.cases) for (const t of Object.values(node.cases)) acc.add("op:" + t.t);
  if (node.transform) acc.add("op:" + node.transform.t);
  if (node.steps) node.steps.forEach(s => concepts(s, acc));
  if (node.node) concepts(node.node, acc);
  return acc;
}

// rich, varied scene so dispatch keys actually branch.
function richScene(rng) {
  const K = rng.int(5, 9);
  return P.sampleScene(rng, {
    H: rng.int(16, 24), W: rng.int(16, 24), K,
    palette: PALETTE, kinds: KINDS, withCore: true, corePalette: CORES,
    holedMix: rng.int(0, 1) === 1, sizes: Array.from({ length: K }, () => rng.int(2, 4)),
    upperFrac: 0.7, gap: 1,
  });
}

// ---- generate-and-filter: sample deep programs, keep coherent/non-trivial/teaching, dedup observable rules ----
function generate(opts = {}) {
  const n = opts.n || 200, maxDepth = opts.depth || 4, rng = E.makeRng((opts.seed || 1) * 2654435761 + 41);
  const out = [], byRule = new Set(), byTree = new Set(), depthHist = {};
  let attempts = 0;
  const budget = opts.budget || n * 40;
  while (out.length < n && attempts < budget) {
    attempts++;
    const targetDepth = 2 + (attempts % (maxDepth - 1));     // cycle depths 2..maxDepth
    const node = sampleNode(rng, targetDepth);
    const prog = { name: "deep", rule: describe(node), concepts: [...concepts(node)], node, sampler: richScene, prior: "deep-composition" };
    let task; try { task = P.buildProgramTask(prog, { seed: attempts * 7 + 1 }); } catch (e) { continue; }
    const g = COH.guard(task);
    if (!g.pass) continue;
    if (byRule.has(g.near_dup_key)) continue;                // count DISTINCT observable rules only
    byRule.add(g.near_dup_key); byTree.add(JSON.stringify(P.serializeNode(node)));
    task.meta.rule = describe(node) + ".";
    task.meta.difficulty = g.difficulty; task.meta.rule_signature = g.signature; task.meta.near_dup_key = g.near_dup_key;
    const d = task.meta.depth; depthHist[d] = (depthHist[d] || 0) + 1;
    out.push(task);
  }
  return { records: out, attempts, distinct_rules: byRule.size, distinct_trees: byTree.size, depth_hist: depthHist, emitted: out.length };
}

function selfTest() {
  const r = generate({ n: 60, depth: 5, seed: 3 });
  if (r.emitted < 60) throw new Error("compose_deep: underfilled (" + r.emitted + "/60) — acceptance too low");
  if (r.distinct_rules < 55) throw new Error("compose_deep: too few DISTINCT rules (" + r.distinct_rules + ")");
  const depths = Object.keys(r.depth_hist).map(Number);
  if (Math.max(...depths) < 3) throw new Error("compose_deep: never reached depth ≥3 (" + JSON.stringify(r.depth_hist) + ")");
  for (const t of r.records) { if (!COH.guard(t).coherent) throw new Error("incoherent task slipped through: " + t.meta.id); }
  // determinism
  const a = generate({ n: 20, depth: 4, seed: 9 }).records.map(t => t.meta.id).join(",");
  const b = generate({ n: 20, depth: 4, seed: 9 }).records.map(t => t.meta.id).join(",");
  if (a !== b) throw new Error("compose_deep: non-deterministic");
  // EXPLOSION proof: two different seeds should yield mostly-disjoint rule sets (the space is huge)
  const s1 = new Set(generate({ n: 80, depth: 4, seed: 1 }).records.map(t => t.meta.near_dup_key));
  const s2 = new Set(generate({ n: 80, depth: 4, seed: 2 }).records.map(t => t.meta.near_dup_key));
  const overlap = [...s1].filter(x => s2.has(x)).length;
  if (overlap > s1.size * 0.5) throw new Error("compose_deep: rule space too small (overlap " + overlap + "/" + s1.size + ")");
  return true;
}

if (require.main === module) {
  const args = process.argv.slice(2), flag = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
  if (args.includes("--self-test")) { selfTest(); console.log("compose_deep: self-test PASS"); }
  else {
    const n = +flag("--n", 200), depth = +flag("--depth", 4), seed = +flag("--seed", 1), o = flag("-o", null);
    const r = generate({ n, depth, seed });
    if (args.includes("--report")) {
      console.error(`\nDEEP COMPOSITION — ${r.emitted} tasks from ${r.attempts} samples · ${r.distinct_rules} DISTINCT observable rules · ${r.distinct_trees} distinct program trees`);
      console.error("depth histogram:", JSON.stringify(r.depth_hist));
      console.error("\nsample of distinct composed rules:");
      for (const t of r.records.slice(0, 14)) console.error(`  [d${t.meta.depth} diff ${t.meta.difficulty}] ${t.meta.rule}`);
      console.error("");
    }
    if (o) { require("fs").writeFileSync(o, r.records.map(t => JSON.stringify(t)).join("\n") + "\n"); console.error(`wrote ${r.emitted} deep-composition tasks → ${o}`); }
    else if (!args.includes("--report")) console.log(r.records.map(t => JSON.stringify(t)).join("\n"));
  }
}

module.exports = { generate, sampleNode, sampleLeaf, sampleTransform, describe, concepts, richScene };
