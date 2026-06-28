#!/usr/bin/env node
/* gen2.js — RICH, HARD, VARIED, solver2-verified tasks. NO quadrant, no "classify-and-recolour" monotony.
 * Families: odd-one-out (relational), gravity, fill-holes, connect-pairs, denoise, remove-extreme,
 * intrinsic group rules, and 2-step pipelines. Every task is re-derived UNIQUELY by solver2 and must
 * survive the baseline-hard filter (so symmetry/keep-largest/colormap one-step tasks are auto-excluded).
 *   node gen2.js --n 40 --report   ·   node gen2.js --n 500 -o out/gen2.jsonl   ·   node gen2.js --self-test
 */
const crypto = require("crypto");
const E = require("./engine.js");
const B = require("./baseline.js");
const P = require("./program.js");
const V2 = require("./solver2.js");

const pick = (rng, xs) => xs[rng.int(0, xs.length - 1)];
const sampleK = (rng, xs, k) => { const a = xs.slice(); for (let i = a.length - 1; i > 0; i--) { const j = rng.int(0, i);[a[i], a[j]] = [a[j], a[i]]; } return a.slice(0, k); };
const PALETTE = [1, 2, 3, 4, 6, 7, 8, 9];
const blank = (H, W) => Array.from({ length: H }, () => new Array(W).fill(0));
const shapeCells = (k, s) => k === "frame" ? E.buildShape("frame", [s, s]) : E.buildShape(k, [s]);
const bbox = cells => { let h = 0, w = 0; for (const [r, c] of cells) { h = Math.max(h, r + 1); w = Math.max(w, c + 1); } return [h, w]; };
function place(rng, H, W, specs, gap = 2, upperFrac = 1) {       // gap-enforced non-overlap placement
  const occ = blank(H, W), out = [];
  const free = (cells, r, c) => cells.every(([dr, dc]) => { const rr = r + dr, cc = c + dc; if (rr < 0 || cc < 0 || rr >= H || cc >= W) return false; for (let a = -gap; a <= gap; a++) for (let b = -gap; b <= gap; b++) { const nr = rr + a, nc = cc + b; if (nr >= 0 && nc >= 0 && nr < H && nc < W && occ[nr][nc]) return false; } return true; });
  for (const sp of specs) { const [bh, bw] = bbox(sp.cells); let ok = false; for (let t = 0; t < 240 && !ok; t++) { const r = rng.int(0, Math.max(0, Math.floor((H - bh) * upperFrac))), c = rng.int(0, Math.max(0, W - bw)); if (free(sp.cells, r, c)) { for (const [dr, dc] of sp.cells) occ[r + dr][c + dc] = 1; out.push({ ...sp, r, c }); ok = true; } } if (!ok) return null; }
  return out;
}
const render = (H, W, objs) => { const g = blank(H, W); for (const o of objs) for (const [dr, dc] of o.cells) { const r = o.r + dr, c = o.c + dc; if (r >= 0 && c >= 0 && r < H && c < W) g[r][c] = o.color; } return g; };

// ---------- scene builders (return {H,W,objs} or null) ----------
function oddScene(rng, mode) {                                   // K-1 twins + 1 odd (by colour | shape | size)
  const H = rng.int(15, 20), W = rng.int(15, 20), K = rng.int(3, 5), kind = pick(rng, ["square", "plus", "diamond", "Lshape", "Tshape"]), s = 3;
  const c0 = pick(rng, PALETTE), specs = [];
  for (let i = 0; i < K; i++) specs.push({ cells: shapeCells(kind, s), color: c0, odd: false });
  const odd = specs[0]; odd.odd = true;
  if (mode === "color") odd.color = pick(rng, PALETTE.filter(c => c !== c0));
  else if (mode === "shape") odd.cells = shapeCells(pick(rng, ["square", "plus", "diamond", "Lshape", "Tshape"].filter(k => k !== kind)), s);
  else odd.cells = shapeCells(kind, s + 2);                       // size
  const objs = place(rng, H, W, sampleK(rng, specs, specs.length), 2);
  return objs ? { H, W, objs } : null;
}
function pairScene(rng) {                                        // 2 same-colour objects per colour, axis-aligned (for connect)
  const H = rng.int(15, 20), W = rng.int(15, 20), cols = sampleK(rng, PALETTE, rng.int(2, 3)), objs = [], occ = blank(H, W);
  const fits = (r, c) => r >= 0 && c >= 0 && r < H && c < W && !occ[r][c];
  for (const col of cols) {
    let done = false;
    for (let t = 0; t < 80 && !done; t++) {
      const horiz = rng.int(0, 1), r1 = rng.int(1, H - 2), c1 = rng.int(1, W - 2);
      const r2 = horiz ? r1 : rng.int(1, H - 2), c2 = horiz ? rng.int(1, W - 2) : c1;
      if (Math.abs(r1 - r2) + Math.abs(c1 - c2) < 4) continue;
      if (fits(r1, c1) && fits(r2, c2)) { for (const [r, c] of [[r1, c1], [r2, c2]]) { occ[r][c] = 1; objs.push({ cells: [[0, 0]], r, c, color: col }); } done = true; }
    }
    if (!done) return null;
  }
  return { H, W, objs };
}
function noiseScene(rng) {                                       // real shapes + scattered 1-cell noise (for denoise / denoise-then-rule)
  const H = rng.int(16, 20), W = rng.int(16, 20), K = rng.int(3, 4), specs = [];
  for (let i = 0; i < K; i++) specs.push({ cells: shapeCells(pick(rng, ["square", "plus", "diamond"]), rng.int(2, 4)), color: pick(rng, PALETTE) });
  for (let i = 0; i < rng.int(3, 6); i++) specs.push({ cells: [[0, 0]], color: pick(rng, PALETTE), noise: true });
  const objs = place(rng, H, W, specs, 2); return objs ? { H, W, objs } : null;
}
function genericScene(rng, opts) { const sc = P.sampleScene(rng, opts); return { H: sc.H, W: sc.W, objs: sc.objects }; }

// ---------- families: each returns a fully-built prodigy-task (or null) ----------
const FAMILIES = {
  odd_recolor: rng => { const mode = pick(rng, ["color", "shape", "size"]); const cm = pick(rng, PALETTE); return fromScene(rng, () => oddScene(rng, mode), (H, W, objs) => objs.map(o => o.odd ? { ...o, color: cm } : o)); },
  odd_remove: rng => { const mode = pick(rng, ["color", "shape", "size"]); return fromScene(rng, () => oddScene(rng, mode), (H, W, objs) => objs.filter(o => !o.odd)); },
  odd_extract: rng => { const mode = pick(rng, ["color", "shape", "size"]); return fromSceneCrop(rng, () => oddScene(rng, mode), objs => objs.find(o => o.odd)); },
  gravity: rng => { const dir = pick(rng, ["down", "up", "left", "right"]); return fromOp(rng, () => genericScene(rng, { H: rng.int(15, 19), W: rng.int(15, 19), K: rng.int(4, 6), kinds: ["square", "plus", "Lshape"], size: 2, palette: PALETTE, upperFrac: 0.5, gap: 2 }), g => V2.gravity(g, dir)); },
  fill_holes: rng => fromOp(rng, () => genericScene(rng, { H: rng.int(15, 19), W: rng.int(15, 19), K: rng.int(3, 5), kinds: ["frame", "ring", "square"], holedMix: true, palette: PALETTE, gap: 2 }), V2.fillHoles),
  connect_pairs: rng => fromOp(rng, () => pairScene(rng), V2.connectPairs),
  denoise: rng => fromOp(rng, () => noiseScene(rng), V2.denoise),
  remove_extreme: rng => { const w = pick(rng, ["largest", "smallest"]); return fromOp(rng, () => genericScene(rng, { H: rng.int(16, 20), W: rng.int(16, 20), K: rng.int(3, 4), kinds: ["square"], sizes: sampleK(rng, [2, 3, 4, 5], rng.int(3, 4)), palette: PALETTE, gap: 2 }), g => V2.removeExtreme(g, w)); },
  group_intrinsic: rng => {                                       // a HARDER intrinsic rule (size/hole/orientation/shape), never quadrant/plain-colour
    const feat = pick(rng, ["size_class", "has_hole", "orientation", "shape"]);
    const cm = pick(rng, PALETTE), cm2 = pick(rng, PALETTE.filter(c => c !== cm));
    const opts = feat === "has_hole" ? { kinds: ["square", "frame", "ring"], holedMix: true } : feat === "size_class" ? { kinds: ["square"], sizes: [2, 2, 3, 4] } : feat === "orientation" ? { kinds: ["Lshape", "Tshape", "notch", "square"], size: 3 } : { kinds: ["square", "plus", "diamond"], size: 3 };
    return fromOp(rng, () => genericScene(rng, { H: rng.int(16, 20), W: rng.int(16, 20), K: rng.int(4, 6), palette: PALETTE, gap: 2, ...opts }), g => groupApply(g, feat, cm, cm2));
  },
  pipeline: rng => {                                              // 2-step: denoise THEN recolour by size
    const cs = pick(rng, PALETTE), cl = pick(rng, PALETTE.filter(c => c !== cs));
    return fromOp(rng, () => noiseScene(rng), g => groupApply(V2.denoise(g), "size_class", cs, cl));
  },
};

// recolour helper for intrinsic group rules (binary feature → two colours), reusing solver2's object model
function groupApply(g, feat, cA, cB) {
  const S = require("./solver.js"), objs = S.segObjects(g), out = blank(g.length, g[0].length);
  for (const o of objs) {
    const v = feat === "size_class" ? (o.area >= S.LARGE_THR ? "large" : "small") : feat === "has_hole" ? (o.hasHole ? "holed" : "solid") : feat === "orientation" ? o.orient : (o.loc.map(r => r.map(x => x ? 1 : 0)).join("|"));
    const col = feat === "shape" ? null : (["large", "holed", "wide"].includes(v) ? cA : cB);
    for (let i = 0; i < o.h; i++) for (let j = 0; j < o.w; j++) if (o.loc[i][j]) out[o.r + i][o.c + j] = col || o.mainColor;
  }
  if (feat === "shape") return null;   // shape needs >2 classes; handled elsewhere — skip to keep binary
  return out;
}

// ---------- task assembly ----------
function fromScene(rng, sceneFn, transform) {
  const ex = []; for (let i = 0; i < 4; i++) { const sc = sceneFn(); if (!sc) return null; const inG = render(sc.H, sc.W, sc.objs), outG = render(sc.H, sc.W, transform(sc.H, sc.W, sc.objs)); ex.push({ in: [inG], out: [outG] }); }
  return assemble(ex);
}
function fromSceneCrop(rng, sceneFn, selFn) {
  const ex = []; for (let i = 0; i < 4; i++) { const sc = sceneFn(); if (!sc) return null; const inG = render(sc.H, sc.W, sc.objs), sel = selFn(sc.objs); if (!sel) return null; ex.push({ in: [inG], out: [cropObj(sel)] }); }
  return assemble(ex);
}
function cropObj(o) { const [h, w] = bbox(o.cells), g = blank(h, w); for (const [dr, dc] of o.cells) g[dr][dc] = o.color; return g; }
function fromOp(rng, sceneFn, op) {
  const ex = []; for (let i = 0; i < 4; i++) { const sc = sceneFn(); if (!sc) return null; const inG = render(sc.H, sc.W, sc.objs); let outG; try { outG = op(inG); } catch (e) { return null; } if (!outG) return null; ex.push({ in: [inG], out: [outG] }); }
  return assemble(ex);
}
function assemble(ex) {
  if (ex.length < 4) return null;
  const examples = ex.slice(0, 3), test = ex[3], width = test.in[0][0].length, height = test.in[0].length;
  const id = "G2-" + crypto.createHash("sha1").update(JSON.stringify([examples, test])).digest("hex").slice(0, 8);
  return { format: "prodigy-task", version: 1, width, height, palette: "arc10", fps: 1, examples, in: test.in, out: test.out, meta: { id } };
}

// ---------- generate-and-VERIFY (solver2) ----------
function generate(opts = {}) {
  const n = opts.n || 40, rng = E.makeRng((opts.seed || 1) * 2654435761 + 71), fams = Object.keys(FAMILIES);
  const out = [], seenRule = new Set(), seenId = new Set(); let attempts = 0; const rej = { build: 0, trivial: 0, unsolvable: 0, ambiguous: 0, teaching: 0 };
  const budget = opts.budget || n * 80;
  while (out.length < n && attempts < budget) {
    attempts++;
    const fam = pick(rng, fams);
    let task; try { task = FAMILIES[fam](rng); } catch (e) { task = null; }
    if (!task) { rej.build++; continue; }
    if (task.examples.some(e => JSON.stringify(e.in) === JSON.stringify(e.out)) || new Set(task.examples.map(e => JSON.stringify(e.out))).size < 2) { rej.teaching++; continue; }
    if (B.trivialSolve(task)) { rej.trivial++; continue; }
    const sv = V2.solvable(task);
    if (!sv.solvable) { rej.unsolvable++; continue; }
    if (!sv.unique) { rej.ambiguous++; continue; }
    if (/^recolour every object/.test(sv.rule)) { rej.trivial++; continue; }   // "recolour everything X" is too easy
    if (opts.dedup !== false && seenRule.has(sv.rule)) continue;
    if (seenId.has(task.meta.id)) continue;
    seenRule.add(sv.rule); seenId.add(task.meta.id);
    task.meta.family = fam; task.meta.rule = sv.rule + "."; task.meta.language_description = task.meta.rule;
    task.meta.solver = { rule: sv.rule, unique: true, n_fits: sv.n_fits };
    out.push(task);
  }
  return { records: out, attempts, emitted: out.length, distinct_rules: seenRule.size, rejected: rej };
}

function selfTest() {
  const r = generate({ n: 24, seed: 3 });
  if (r.emitted < 24) throw new Error("gen2: underfilled (" + r.emitted + "/24)");
  for (const t of r.records) {
    const sv = V2.solvable(t); if (!sv.solvable || !sv.unique) throw new Error("emitted task not uniquely solvable: " + t.meta.id + " — " + sv.reason);
    if (B.trivialSolve(t)) throw new Error("trivial leaked: " + t.meta.id);
  }
  const fams = new Set(r.records.map(t => t.meta.family));
  if (fams.size < 5) throw new Error("gen2: too few distinct families (" + fams.size + ") — not varied");
  const a = generate({ n: 10, seed: 9 }).records.map(t => t.meta.id).join(",");
  const b = generate({ n: 10, seed: 9 }).records.map(t => t.meta.id).join(",");
  if (a !== b) throw new Error("gen2: non-deterministic");
  return true;
}

if (require.main === module) {
  const args = process.argv.slice(2), flag = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
  if (args.includes("--self-test")) { selfTest(); console.log("gen2: self-test PASS"); }
  else {
    const n = +flag("--n", 40), seed = +flag("--seed", 1), o = flag("-o", null), r = generate({ n, seed });
    if (args.includes("--report")) {
      console.error(`\nRICH SOLVER2-VERIFIED — ${r.emitted}/${n} tasks, ${r.distinct_rules} distinct rules, families: ${[...new Set(r.records.map(t => t.meta.family))].join(", ")}`);
      console.error("rejected:", JSON.stringify(r.rejected));
      console.error("\nsample:"); for (const t of r.records.slice(0, 18)) console.error(`  [${t.meta.family}] ${t.meta.rule}`);
      console.error("");
    }
    if (o) { require("fs").writeFileSync(o, r.records.map(t => JSON.stringify(t)).join("\n") + "\n"); console.error(`wrote ${r.emitted} → ${o}`); }
    else if (!args.includes("--report")) console.log(r.records.map(t => JSON.stringify(t)).join("\n"));
  }
}

module.exports = { generate, FAMILIES };
