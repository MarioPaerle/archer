#!/usr/bin/env node
/* gen_physics.js — the FOUNDATIONAL DYNAMIC tier (PAN-157, 2026-06-23).
 * Mario: "to understand WHAT an object is or WHAT counting means, the model also needs simpler, PHYSICAL examples."
 * The `--static`/last-frame collapse over-pruned these. This generator brings them back as clean SHORT-VIDEO
 * prodigy-tasks (IN = a start frame, OUT = the predicted dynamics), correct-by-simulation (the engine IS the truth),
 * baseline-hard filtered, prior-tagged, deduped, multinode-capable. Mix into the curriculum alongside gen_hard.
 *   node gen_physics.js --n 60 -o out/physics.jsonl [--augment] [--num-nodes W --node-rank R]                  */
const fs = require("fs"), path = require("path"), crypto = require("crypto");
const E = require("./engine.js"), B = require("./baseline.js"), GH = require("./gen_hard.js");

const SCN = f => fs.readFileSync(path.join(__dirname, "scenes/library", f + ".txt"), "utf8");
// curated foundational templates: each teaches a core physical prior cleanly. prior ∈ object|number|geometry|topology + physics.
const TEMPLATES = [
  { key: "gravity_settle", prior: "object/physics", concept: ["gravity", "object-permanence", "prediction"], diff: 0.4 },
  { key: "pile_up", prior: "number/physics", concept: ["gravity", "stacking", "counting"], diff: 0.45 },
  { key: "bounce_ball", prior: "geometry/physics", concept: ["bounce", "reflection", "prediction"], diff: 0.6 },
  { key: "path_follow", prior: "object/physics", concept: ["agency", "path", "movement"], diff: 0.55 },
  { key: "shatter_fall", prior: "object/physics", concept: ["breaking", "fragments", "gravity"], diff: 0.65 },
  { key: "orbit_well", prior: "object/physics", concept: ["attraction", "gravity", "settling"], diff: 0.6 },
  { key: "spin_rotate", prior: "geometry/physics", concept: ["rotation", "spin", "transform"], diff: 0.5 },
  { key: "spill_pool", prior: "topology/physics", concept: ["fluid", "containment", "flow"], diff: 0.5 },
  { key: "explode_predict", prior: "object/physics", concept: ["explosion", "radial", "prediction"], diff: 0.65 },
  { key: "beam_video", prior: "geometry/physics", concept: ["pointing", "ray", "beam", "emission"], diff: 0.5, build: GH.buildBeamVideo },   // program-first videos
  { key: "maze_video", prior: "geometry/physics", concept: ["maze", "pathfinding", "spatial"], diff: 0.6, build: GH.buildMazeVideo },        // accelerated multi-algorithm maze solve
  { key: "magnet_dock", prior: "object/physics", concept: ["magnet", "grouping", "colour-attraction"], diff: 0.55 },
];
const TEXT = Object.fromEntries(TEMPLATES.filter(t => !t.build).map(t => [t.key, SCN(t.key)]));   // build-templates have no scene file

function buildPhysicsTask(tmpl, base, nEx, augment) {
  if (tmpl.build) return tmpl.build(base, nEx);   // program-first video template
  const t = E.buildTask(TEXT[tmpl.key], { examples: nEx, exSeeds: Array.from({ length: nEx }, (_, i) => base + 1 + i), testSeed: base + nEx + 1, augment });
  const id = "PHY-" + crypto.createHash("sha1").update(JSON.stringify([t.examples, t.in, t.out])).digest("hex").slice(0, 8);
  t.meta = Object.assign({}, t.meta, { id, prior: tmpl.prior, tier: "physics", dynamic: true, difficulty: tmpl.diff, template: "phys:" + tmpl.key, source: "physics", concepts: tmpl.concept });
  return t;
}

if (require.main === module) {
  const a = process.argv.slice(2), f = { n: 60, out: "out/physics.jsonl", augment: false, numNodes: 1, nodeRank: 0 };
  for (let i = 0; i < a.length; i++) { const k = a[i];
    if (k === "--n") f.n = +a[++i]; else if (k === "-o") f.out = a[++i]; else if (k === "--augment") f.augment = true;
    else if (k === "--num-nodes") f.numNodes = +a[++i]; else if (k === "--node-rank") f.nodeRank = +a[++i]; }
  const seedOffset = f.nodeRank * 1_000_000_000;   // disjoint seed slice per node (multinode, zero coordination)
  const out = [], seen = new Set(); let attempts = 0, trivialDrop = 0, errDrop = 0, base = seedOffset;
  while (out.length < f.n && attempts < f.n * 50) {
    attempts++; const tmpl = TEMPLATES[attempts % TEMPLATES.length]; base += 7919;
    let t; try { t = buildPhysicsTask(tmpl, base, 3, f.augment); } catch (e) { errDrop++; continue; }
    if (!t.meta.teaching || !t.meta.teaching.ok) { errDrop++; continue; }              // no-teaching reject
    if (B.trivialSolve(t)) { trivialDrop++; continue; }                                // baseline-hard filter
    if (seen.has(t.meta.id)) continue; seen.add(t.meta.id);
    out.push(t);
  }
  fs.mkdirSync(path.dirname(f.out) || ".", { recursive: true });
  const nodeOut = f.numNodes > 1 ? f.out.replace(/(\.jsonl)?$/, `.node${f.nodeRank}$1`) : f.out;
  fs.writeFileSync(nodeOut, out.map(t => JSON.stringify(t)).join("\n") + "\n");
  const byT = {}, byP = {}; out.forEach(t => { const k = t.meta.template.replace("phys:", ""); byT[k] = (byT[k] || 0) + 1; byP[t.meta.prior] = (byP[t.meta.prior] || 0) + 1; });
  console.log(`gen_physics → ${nodeOut}  (${out.length} tasks · ${trivialDrop} trivial · ${errDrop} errors · ${attempts} attempts)`);
  console.log("  templates (" + TEMPLATES.length + "): " + Object.entries(byT).sort((x, y) => y[1] - x[1]).map(([k, v]) => k + ":" + v).join("  "));
  console.log("  PRIOR coverage: " + Object.entries(byP).map(([k, v]) => k + ":" + v).join("  "));
}
module.exports = { TEMPLATES, buildPhysicsTask };
