#!/usr/bin/env node
/* gen5.js — more COMPLEX verified rule classes: COUNTING (numerosity) and OCCLUSION (the last big congress
 * priors). Each task is re-derived UNIQUELY by solver2 and survives baseline-hard.
 *   node gen5.js --n 40 --report   ·   node gen5.js --n 500 -o out/gen5.jsonl   ·   node gen5.js --self-test
 */
const crypto = require("crypto");
const E = require("./engine.js");
const B = require("./baseline.js");
const V2 = require("./solver2.js");

const pick = (rng, xs) => xs[rng.int(0, xs.length - 1)];
const sampleK = (rng, xs, k) => { const a = xs.slice(); for (let i = a.length - 1; i > 0; i--) { const j = rng.int(0, i);[a[i], a[j]] = [a[j], a[i]]; } return a.slice(0, k); };
const PAL = [1, 2, 3, 4, 6, 7, 8, 9];   // 5 (grey) reserved for the occluder
const blank = (H, W) => Array.from({ length: H }, () => new Array(W).fill(0));
const shapeCells = (k, s) => k === "frame" ? E.buildShape("frame", [s, s]) : E.buildShape(k, [s]);
const bbox = cells => { let h = 0, w = 0; for (const [r, c] of cells) { h = Math.max(h, r + 1); w = Math.max(w, c + 1); } return [h, w]; };
const stamp = (g, cells, r, c, col) => { for (const [dr, dc] of cells) { const rr = r + dr, cc = c + dc; if (rr >= 0 && cc >= 0 && rr < g.length && cc < g[0].length) g[rr][cc] = col; } };
function placeShapes(rng, H, W, specs, gap = 2) {
  const occ = blank(H, W), out = [];
  const free = (cells, r, c) => cells.every(([dr, dc]) => { const rr = r + dr, cc = c + dc; if (rr < 0 || cc < 0 || rr >= H || cc >= W) return false; for (let a = -gap; a <= gap; a++) for (let b = -gap; b <= gap; b++) { const nr = rr + a, nc = cc + b; if (nr >= 0 && nc >= 0 && nr < H && nc < W && occ[nr][nc]) return false; } return true; });
  for (const sp of specs) { const [bh, bw] = bbox(sp.cells); let ok = false; for (let t = 0; t < 160 && !ok; t++) { const r = rng.int(0, H - bh), c = rng.int(0, W - bw); if (free(sp.cells, r, c)) { for (const [dr, dc] of sp.cells) occ[r + dr][c + dc] = 1; stamp(out.g || (out.g = blank(H, W)), sp.cells, r, c, sp.color); ok = true; } } if (!ok) return null; }
  return out.g || blank(H, W);
}

// ---------- COUNTING ----------
function count_tally(rng) {
  const col = pick(rng, PAL), vert = rng.int(0, 1) === 1;
  const build = () => { const H = rng.int(14, 20), W = rng.int(14, 20), K = rng.int(2, 6), specs = []; for (let i = 0; i < K; i++) specs.push({ cells: shapeCells(pick(rng, ["square", "plus", "diamond", "triangle"]), rng.int(2, 3)), color: pick(rng, PAL) }); const g = placeShapes(rng, H, W, specs); if (!g) return null; const line = vert ? Array.from({ length: K }, () => [col]) : [Array.from({ length: K }, () => col)]; return { in: g, out: line }; };
  return fromPairs(rng, build);
}
function count_plurality(rng) {
  const build = () => { const H = rng.int(16, 22), W = rng.int(16, 22), cols = sampleK(rng, PAL, 3); const plan = [[cols[0], rng.int(3, 4)], [cols[1], rng.int(1, 2)], [cols[2], rng.int(1, 2)]], specs = []; for (const [c, n] of plan) for (let i = 0; i < n; i++) specs.push({ cells: shapeCells(pick(rng, ["square", "plus", "diamond"]), 2), color: c }); const g = placeShapes(rng, H, W, specs); if (!g) return null; const blk = Array.from({ length: 3 }, () => new Array(3).fill(cols[0])); return { in: g, out: blk }; };
  return fromPairs(rng, build);
}

// ---------- OCCLUSION (remove grey occluder, reconstruct by symmetry) ----------
function occlusion(rng) {
  const axis = pick(rng, ["h", "v"]);
  const build = () => {
    const H = axis === "v" ? 2 * rng.int(5, 7) : rng.int(10, 14), W = axis === "h" ? 2 * rng.int(5, 7) : rng.int(10, 14), F = pick(rng, PAL);
    const fig = blank(H, W);
    // draw a random figure in one half, mirror to the other → symmetric whole
    const half = axis === "h" ? Math.floor(W / 2) : Math.floor(H / 2);
    for (let k = 0; k < rng.int(8, 14); k++) { const r = axis === "h" ? rng.int(0, H - 1) : rng.int(0, half - 1), c = axis === "h" ? rng.int(0, half - 1) : rng.int(0, W - 1); fig[r][c] = F; }
    for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) if (fig[r][c]) { const mr = axis === "h" ? r : H - 1 - r, mc = axis === "h" ? W - 1 - c : c; fig[mr][mc] = F; }
    if (fig.flat().filter(Boolean).length < 6) return null;
    // occluder: a solid grey rectangle entirely in the SECOND half (its mirror side is clear)
    const inG = fig.map(r => r.slice()); let covered = 0;
    if (axis === "h") { const oc0 = half + rng.int(0, W - half - 3), ow = rng.int(2, Math.max(2, W - oc0 - 1)), or0 = rng.int(0, H - 3), oh = rng.int(2, Math.max(2, H - or0 - 1)); for (let r = or0; r < or0 + oh; r++) for (let c = oc0; c < oc0 + ow && c < W; c++) { if (fig[r][c]) covered++; inG[r][c] = 5; } }
    else { const or0 = half + rng.int(0, H - half - 3), oh = rng.int(2, Math.max(2, H - or0 - 1)), oc0 = rng.int(0, W - 3), ow = rng.int(2, Math.max(2, W - oc0 - 1)); for (let r = or0; r < or0 + oh && r < H; r++) for (let c = oc0; c < oc0 + ow; c++) { if (fig[r][c]) covered++; inG[r][c] = 5; } }
    if (covered < 1) return null;
    return { in: inG, out: fig };
  };
  return fromPairs(rng, build);
}

function fromPairs(rng, build, extra = {}) {
  const ex = []; for (let i = 0; i < 4; i++) { const p = build(); if (!p) return null; ex.push({ in: [p.in], out: [p.out] }); }
  const examples = ex.slice(0, 3), test = ex[3], id = "G5-" + crypto.createHash("sha1").update(JSON.stringify([examples, test])).digest("hex").slice(0, 8);
  return { format: "prodigy-task", version: 1, width: test.in[0][0].length, height: test.in[0].length, palette: "arc10", fps: 1, examples, in: test.in, out: test.out, meta: { id, ...extra } };
}

const FAMILIES = { count_tally, count_plurality, occlusion };
function generate(opts = {}) {
  const n = opts.n || 40, rng = E.makeRng((opts.seed || 1) * 2654435761 + 151), fams = Object.keys(FAMILIES);
  const out = [], seenRule = new Set(), seenId = new Set(); let attempts = 0; const rej = { build: 0, trivial: 0, unsolvable: 0, ambiguous: 0, teaching: 0 };
  const budget = opts.budget || n * 120;
  while (out.length < n && attempts < budget) {
    attempts++; const fam = pick(rng, fams); let task; try { task = FAMILIES[fam](rng); } catch (e) { task = null; }
    if (!task) { rej.build++; continue; }
    if (task.examples.some(e => JSON.stringify(e.in) === JSON.stringify(e.out)) || new Set(task.examples.map(e => JSON.stringify(e.out))).size < 2) { rej.teaching++; continue; }
    if (B.trivialSolve(task)) { rej.trivial++; continue; }
    const sv = V2.solvable(task);
    if (!sv.solvable) { rej.unsolvable++; continue; }
    if (!sv.unique) { rej.ambiguous++; continue; }
    if (seenId.has(task.meta.id)) continue; seenId.add(task.meta.id); seenRule.add(sv.rule);
    task.meta.family = fam; task.meta.rule = sv.rule + "."; task.meta.language_description = task.meta.rule; task.meta.solver = { rule: sv.rule, unique: true };
    out.push(task);
  }
  return { records: out, attempts, emitted: out.length, distinct_rules: seenRule.size, rejected: rej, families: [...new Set(out.map(t => t.meta.family))] };
}

function selfTest() {
  const r = generate({ n: 24, seed: 5 });
  if (r.emitted < 24) throw new Error("gen5: underfilled (" + r.emitted + "/24) rej=" + JSON.stringify(r.rejected));
  for (const t of r.records) { const sv = V2.solvable(t); if (!sv.solvable || !sv.unique) throw new Error("not uniquely solvable: " + t.meta.id + " — " + sv.reason); if (B.trivialSolve(t)) throw new Error("trivial leaked: " + t.meta.id); }
  for (const fam of ["count_tally", "count_plurality", "occlusion"]) if (!r.families.includes(fam)) throw new Error("gen5: family " + fam + " produced nothing");
  const a = generate({ n: 10, seed: 9 }).records.map(t => t.meta.id).join(","), b = generate({ n: 10, seed: 9 }).records.map(t => t.meta.id).join(",");
  if (a !== b) throw new Error("gen5: non-deterministic");
  return true;
}

if (require.main === module) {
  const args = process.argv.slice(2), flag = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
  if (args.includes("--self-test")) { selfTest(); console.log("gen5: self-test PASS"); }
  else { const n = +flag("--n", 40), seed = +flag("--seed", 1), o = flag("-o", null), r = generate({ n, seed });
    if (args.includes("--report")) { console.error(`\nCOUNTING + OCCLUSION verified — ${r.emitted}/${n}, ${r.distinct_rules} distinct, families: ${r.families.join(", ")}`); console.error("rejected:", JSON.stringify(r.rejected)); console.error("\nsample:"); for (const t of r.records.slice(0, 18)) console.error(`  [${t.meta.family}] ${t.meta.rule}`); console.error(""); }
    if (o) { require("fs").writeFileSync(o, r.records.map(t => JSON.stringify(t)).join("\n") + "\n"); console.error(`wrote ${r.emitted} → ${o}`); }
    else if (!args.includes("--report")) console.log(r.records.map(t => JSON.stringify(t)).join("\n")); }
}
module.exports = { generate, FAMILIES };
