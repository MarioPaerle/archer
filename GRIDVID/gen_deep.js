#!/usr/bin/env node
/* gen_deep.js — anchor-robust DEEP RELATIONAL rules (depth, not width). Each task: find an ANCHOR object
 * (the largest / the smallest), then every object DEPENDS on it — takes its colour, or morphs into its shape.
 * Scenes are built so the anchor is ALWAYS unambiguous (distinct sizes) and the effect ALWAYS visible
 * (distinct colours that vary per example → no fixed colormap; morph spacing = max size → no overlap).
 * Every task is verified UNIQUELY by the symbolic solver2 + baseline-hard.
 *   node gen_deep.js --n 40 --report   ·   node gen_deep.js --n 500 -o out/deep.jsonl   ·   node gen_deep.js --self-test
 */
const crypto = require("crypto");
const E = require("./engine.js");
const B = require("./baseline.js");
const P = require("./program.js");
const V2 = require("./solver2.js");

const pick = (rng, xs) => xs[rng.int(0, xs.length - 1)];
const sampleK = (rng, xs, k) => { const a = xs.slice(); for (let i = a.length - 1; i > 0; i--) { const j = rng.int(0, i);[a[i], a[j]] = [a[j], a[i]]; } return a.slice(0, k); };
const PAL = [1, 2, 3, 4, 6, 7, 8, 9];
const KINDS = ["square", "plus", "Lshape", "triangle", "diamond", "Tshape", "notch"];
const shapeCells = (k, s) => E.buildShape(k, [s]);
const bbox = cells => { let h = 0, w = 0; for (const [r, c] of cells) { h = Math.max(h, r + 1); w = Math.max(w, c + 1); } return [h, w]; };
const blank = (H, W) => Array.from({ length: H }, () => new Array(W).fill(0));

// place objects so that an OPTIONAL reserved footprint (slot×slot, for morph) never overlaps another's.
function placeRobust(rng, H, W, specs, slot) {
  const occ = blank(H, W), out = [];
  const free = (h, w, r, c) => { for (let a = -1; a <= h; a++) for (let b = -1; b <= w; b++) { const nr = r + a, nc = c + b; if (nr >= 0 && nc >= 0 && nr < H && nc < W && occ[nr][nc]) return false; } return true; };
  for (const sp of specs) {
    const [bh, bw] = bbox(sp.cells), rh = slot || bh, rw = slot || bw;   // reserve the morph footprint if given
    let ok = false;
    for (let t = 0; t < 300 && !ok; t++) { const r = rng.int(0, H - rh), c = rng.int(0, W - rw); if (free(rh, rw, r, c)) { for (let a = 0; a < rh; a++) for (let b = 0; b < rw; b++) occ[r + a][c + b] = 1; out.push({ ...sp, r, c }); ok = true; } }
    if (!ok) return null;
  }
  return out;
}

// ---------- anchor-robust scene samplers (program.js scene shape: {H,W,bg,objects:[{cells,r,c,color,kind}]}) ----------
function distinctSizeScene(rng, opts = {}) {        // distinct sizes (unique largest & smallest) + distinct colours (vary per example)
  const K = opts.K || 4, sizes = sampleK(rng, opts.sizePool || [2, 3, 4, 5, 6], K), cols = sampleK(rng, PAL, K);
  const H = opts.H || rng.int(16, 22), W = opts.W || rng.int(16, 22), slot = opts.slot;
  const specs = sizes.map((s, i) => { const kind = opts.kinds ? pick(rng, opts.kinds) : "square"; return { cells: shapeCells(kind, s), color: cols[i], kind }; });
  const objs = placeRobust(rng, H, W, specs, slot); if (!objs) return null;
  objs.forEach((o, i) => o.id = "o" + i);
  return { H, W, bg: 0, objects: objs };
}

// ---------- families: a deep relational rule + an anchor-robust scene ----------
const REC_TO = anchor => ({ op: "seq", steps: [{ op: "bind", name: "A", pick: anchor }, { op: "apply", sel: { s: "all" }, transform: { t: "recolor_to", ref: "A" } }] });
const MORPH_TO = anchor => ({ op: "seq", steps: [{ op: "bind", name: "A", pick: anchor }, { op: "apply", sel: { s: "all" }, transform: { t: "copy_shape", ref: "A" } }] });

const FAMILIES = {
  recolor_to_largest:  { rule: REC_TO("largest"),  idea: "every object takes the colour of the LARGEST object",  scene: rng => distinctSizeScene(rng, { K: 4 }) },
  recolor_to_smallest: { rule: REC_TO("smallest"), idea: "every object takes the colour of the SMALLEST object", scene: rng => distinctSizeScene(rng, { K: 4 }) },
  // morph→largest: objects GROW, so reserve a max-size slot to avoid overlap. morph→smallest: objects SHRINK → no slot needed.
  morph_to_largest:    { rule: MORPH_TO("largest"),  idea: "every object morphs into the shape of the LARGEST object",  scene: rng => distinctSizeScene(rng, { K: 3, sizePool: [2, 3, 4, 5], H: rng.int(22, 28), W: rng.int(22, 28), kinds: KINDS, slot: 6 }) },
  morph_to_smallest:   { rule: MORPH_TO("smallest"), idea: "every object morphs into the shape of the SMALLEST object", scene: rng => distinctSizeScene(rng, { K: 4, sizePool: [2, 3, 4, 5], H: rng.int(18, 24), W: rng.int(18, 24), kinds: KINDS }) },
};

function buildTask(famKey, rng, nEx) {
  const fam = FAMILIES[famKey]; const def = { name: famKey, rule: fam.idea, concepts: ["deep", "relational", famKey], node: fam.rule, prior: "deep-relational", sampler: fam.scene };
  const t = P.buildProgramTask(def, { seed: rng.int(1, 1e9), nEx: nEx || 4 });
  t.meta.depth_kind = "relational-anchor"; return t;
}

function generate(opts = {}) {
  const n = opts.n || 40, rng = E.makeRng((opts.seed || 1) * 2654435761 + 191), fams = Object.keys(FAMILIES);
  const out = [], seenId = new Set(), seenRule = new Set(); let i = 0, guard = 0; const rej = { build: 0, teaching: 0, trivial: 0, unsolvable: 0, ambiguous: 0 }, perFam = {};
  while (out.length < n && guard++ < n * 50) {
    const fam = fams[i++ % fams.length]; let t; try { t = buildTask(fam, rng); } catch (e) { t = null; }
    if (!t) { rej.build++; continue; }
    if (t.examples.some(e => JSON.stringify(e.in) === JSON.stringify(e.out)) || new Set(t.examples.map(e => JSON.stringify(e.out))).size < 2) { rej.teaching++; continue; }
    if (B.trivialSolve(t)) { rej.trivial++; continue; }
    const sv = V2.solvable(t); if (!sv.solvable) { rej.unsolvable++; continue; } if (!sv.unique) { rej.ambiguous++; continue; }
    if (seenId.has(t.meta.id)) continue; seenId.add(t.meta.id); seenRule.add(sv.rule);
    t.meta.family = fam; t.meta.rule = sv.rule + "."; t.meta.solver = { rule: sv.rule, unique: true }; perFam[fam] = (perFam[fam] || 0) + 1; out.push(t);
  }
  return { records: out, emitted: out.length, distinct_rules: seenRule.size, rejected: rej, families: perFam };
}

function selfTest() {
  const r = generate({ n: 24, seed: 4 });
  if (r.emitted < 24) throw new Error("gen_deep: underfilled (" + r.emitted + "/24) rej=" + JSON.stringify(r.rejected));
  for (const t of r.records) { const sv = V2.solvable(t); if (!sv.solvable || !sv.unique) throw new Error("not uniquely solvable: " + t.meta.id); if (B.trivialSolve(t)) throw new Error("trivial leaked: " + t.meta.id); }
  for (const f of Object.keys(FAMILIES)) if (!r.families[f]) throw new Error("family produced nothing: " + f);
  const a = generate({ n: 8, seed: 9 }).records.map(t => t.meta.id).join(","), b = generate({ n: 8, seed: 9 }).records.map(t => t.meta.id).join(",");
  if (a !== b) throw new Error("gen_deep: non-deterministic");
  return true;
}

if (require.main === module) {
  const args = process.argv.slice(2), flag = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
  if (args.includes("--self-test")) { selfTest(); console.log("gen_deep: self-test PASS"); }
  else { const n = +flag("--n", 40), seed = +flag("--seed", 1), o = flag("-o", null), r = generate({ n, seed });
    if (args.includes("--report")) { console.error(`\nDEEP relational — ${r.emitted}/${n}, ${r.distinct_rules} distinct, by family ${JSON.stringify(r.families)}`); console.error("rejected:", JSON.stringify(r.rejected)); console.error("\nsample:"); for (const t of r.records.slice(0, 14)) console.error(`  [${t.meta.family}] ${t.meta.rule}`); console.error(""); }
    if (o) { require("fs").writeFileSync(o, r.records.map(t => JSON.stringify(t)).join("\n") + "\n"); console.error(`wrote ${r.emitted} → ${o}`); }
    else if (!args.includes("--report")) console.log(r.records.map(t => JSON.stringify(t)).join("\n")); }
}
module.exports = { generate, FAMILIES, buildTask };
