#!/usr/bin/env node
/* gen4.js — COMPLEX verified rule classes (the real lever from the congress): containment, boolean
 * figure-algebra, and analogy. Each task is re-derived UNIQUELY by solver2 (new hypotheses) and survives
 * baseline-hard. These are the genuinely hard ARC mechanics, not per-object classify.
 *   node gen4.js --n 40 --report   ·   node gen4.js --n 500 -o out/gen4.jsonl   ·   node gen4.js --self-test
 */
const crypto = require("crypto");
const E = require("./engine.js");
const B = require("./baseline.js");
const V2 = require("./solver2.js");

const pick = (rng, xs) => xs[rng.int(0, xs.length - 1)];
const sampleK = (rng, xs, k) => { const a = xs.slice(); for (let i = a.length - 1; i > 0; i--) { const j = rng.int(0, i);[a[i], a[j]] = [a[j], a[i]]; } return a.slice(0, k); };
const PAL = [1, 2, 3, 4, 6, 7, 8, 9];
const blank = (H, W) => Array.from({ length: H }, () => new Array(W).fill(0));
const shapeCells = (k, s) => k === "frame" ? E.buildShape("frame", [s, s]) : E.buildShape(k, [s]);
const bbox = cells => { let h = 0, w = 0; for (const [r, c] of cells) { h = Math.max(h, r + 1); w = Math.max(w, c + 1); } return [h, w]; };
const stamp = (g, cells, r, c, col) => { for (const [dr, dc] of cells) { const rr = r + dr, cc = c + dc; if (rr >= 0 && cc >= 0 && rr < g.length && cc < g[0].length) g[rr][cc] = col; } };

// ---------- CONTAINMENT: a frame + objects inside/outside ----------
function containment(rng) {
  // io_two recolours EVERY object by inside/outside (no object removed, frame untouched) → ONLY position
  // relative to the frame explains it, so it can't alias to keep-largest / size / fill-holes rules.
  const variant = pick(rng, ["io_two", "io_two", "recolor_inside"]);
  const cIn = pick(rng, PAL), cOut = pick(rng, PAL.filter(c => c !== cIn));   // FIXED across examples (the rule is constant)
  const build = () => {
    const H = rng.int(18, 24), W = rng.int(18, 24), fs = rng.int(9, Math.min(13, Math.min(H, W) - 4));
    const fR = rng.int(0, H - fs - 1), fC = rng.int(0, W - fs - 1), frameCol = pick(rng, PAL.filter(c => c !== cIn && c !== cOut));
    const objPool = PAL.filter(c => c !== frameCol && c !== cIn && c !== cOut);   // objects differ from the recolour targets so the rule is always VISIBLE
    const occ = blank(H, W), objs = [{ cells: shapeCells("frame", fs), r: fR, c: fC, color: frameCol, frame: true }];
    for (const [dr, dc] of objs[0].cells) occ[fR + dr][fC + dc] = 1;
    const free = (cells, r, c) => cells.every(([dr, dc]) => { const rr = r + dr, cc = c + dc; if (rr < 0 || cc < 0 || rr >= H || cc >= W) return false; for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { const nr = rr + a, nc = cc + b; if (nr >= 0 && nc >= 0 && nr < H && nc < W && occ[nr][nc]) return false; } return true; });
    const placeIn = (inside) => { const cells = shapeCells(pick(rng, ["square", "plus", "diamond", "triangle"]), rng.int(2, 3)), [bh, bw] = bbox(cells); for (let t = 0; t < 120; t++) { let r, c; if (inside) { r = fR + 2 + rng.int(0, Math.max(0, fs - 4 - bh)); c = fC + 2 + rng.int(0, Math.max(0, fs - 4 - bw)); } else { r = rng.int(0, H - bh - 1); c = rng.int(0, W - bw - 1); if (r >= fR - 1 && r <= fR + fs && c >= fC - 1 && c <= fC + fs) continue; } if (free(cells, r, c)) { for (const [dr, dc] of cells) occ[r + dr][c + dc] = 1; objs.push({ cells, r, c, color: pick(rng, objPool), inside }); return true; } } return false; };
    let nIn = 0, nOut = 0; for (let i = 0; i < 3; i++) if (placeIn(true)) nIn++; for (let i = 0; i < 3; i++) if (placeIn(false)) nOut++;
    if (nIn < 2 || nOut < 2) return null;
    const out = objs.map(o => o.frame ? o : variant === "recolor_inside" ? (o.inside ? { ...o, color: cIn } : o)
      : variant === "io_two" ? { ...o, color: o.inside ? cIn : cOut }
        : variant === "remove_outside" ? (o.inside ? o : null)
          : (o.inside ? null : o)).filter(Boolean);
    return { in: render(H, W, objs), out: render(H, W, out) };
  };
  return fromPairs(rng, build);
}

// ---------- BOOLEAN: two panels A,B + divider → A op B ----------
function boolean(rng) {
  const op = pick(rng, ["xor", "and", "or", "sub"]), ph = rng.int(6, 9), pw = rng.int(6, 9), dcol = 5, outCol = pick(rng, PAL.filter(c => c !== dcol));
  const panelMask = () => { const m = blank(ph, pw); for (let k = 0; k < 2; k++) { const cells = shapeCells(pick(rng, ["square", "diamond", "plus", "triangle", "Lshape"]), rng.int(2, 4)), [bh, bw] = bbox(cells); stamp(m, cells, rng.int(0, ph - bh), rng.int(0, pw - bw), 1); } return m; };
  const build = () => {
    let A, Bm, R; for (let t = 0; t < 40; t++) { A = panelMask(); Bm = panelMask(); R = A.map((row, r) => row.map((x, c) => op === "or" ? (x | Bm[r][c]) : op === "and" ? (x & Bm[r][c]) : op === "xor" ? (x ^ Bm[r][c]) : (x & (1 - Bm[r][c])))); const n = R.flat().filter(Boolean).length; if (n >= 2 && n < ph * pw) break; }
    const colA = pick(rng, PAL.filter(c => c !== dcol)), colB = pick(rng, PAL.filter(c => c !== dcol && c !== colA));
    const inG = blank(ph, pw * 2 + 1);
    for (let r = 0; r < ph; r++) { for (let c = 0; c < pw; c++) { if (A[r][c]) inG[r][c] = colA; if (Bm[r][c]) inG[r][pw + 1 + c] = colB; } inG[r][pw] = dcol; }
    return { in: inG, out: R.map(row => row.map(x => x ? outCol : 0)) };
  };
  return fromPairs(rng, build, { rule: `output = panel A ${op.toUpperCase()} panel B` });
}

// ---------- ANALOGY: A|B|C panels, B=T(A), output=T(C) ----------
function analogy(rng) {
  const t = pick(rng, ["mirror_h", "flip_v", "rotate_180", "recolor"]), ph = rng.int(5, 7), pw = rng.int(5, 7), dcol = 5;
  const T = (g, cmap) => t === "mirror_h" ? g.map(r => r.slice().reverse()) : t === "flip_v" ? g.slice().reverse().map(r => r.slice()) : t === "rotate_180" ? g.slice().reverse().map(r => r.slice().reverse()) : g.map(r => r.map(x => x ? cmap[x] || x : 0));
  const fig = (col) => { const m = blank(ph, pw), cells = shapeCells(pick(rng, ["Lshape", "triangle", "Tshape", "diamond", "plus"]), rng.int(3, 4)), [bh, bw] = bbox(cells); stamp(m, cells, rng.int(0, ph - bh), rng.int(0, pw - bw), col); return m; };
  const build = () => {
    const cmap = {}; const cA = pick(rng, PAL), cB = pick(rng, PAL.filter(c => c !== cA)); cmap[cA] = cB;
    const A = fig(cA), Bp = T(A, cmap), cC = t === "recolor" ? cA : pick(rng, PAL), C = fig(cC), D = T(C, cmap);
    const inG = blank(ph, pw * 3 + 2), put = (m, off) => { for (let r = 0; r < ph; r++) for (let c = 0; c < pw; c++) if (m[r][c]) inG[r][off + c] = m[r][c]; };
    put(A, 0); put(Bp, pw + 1); put(C, 2 * pw + 2); for (let r = 0; r < ph; r++) { inG[r][pw] = dcol; inG[r][2 * pw + 1] = dcol; }
    return { in: inG, out: D };
  };
  return fromPairs(rng, build, { rule: `analogy A:B::C:? — apply ${t} to C` });
}

const render = (H, W, objs) => { const g = blank(H, W); for (const o of objs) stamp(g, o.cells, o.r, o.c, o.color); return g; };
function fromPairs(rng, build, extra = {}) {
  const ex = []; for (let i = 0; i < 4; i++) { const p = build(); if (!p) return null; ex.push({ in: [p.in], out: [p.out] }); }
  const examples = ex.slice(0, 3), test = ex[3], id = "G4-" + crypto.createHash("sha1").update(JSON.stringify([examples, test])).digest("hex").slice(0, 8);
  return { format: "prodigy-task", version: 1, width: test.in[0][0].length, height: test.in[0].length, palette: "arc10", fps: 1, examples, in: test.in, out: test.out, meta: { id, ...extra } };
}

const FAMILIES = { containment, boolean, analogy };
function generate(opts = {}) {
  const n = opts.n || 40, rng = E.makeRng((opts.seed || 1) * 2654435761 + 131), fams = Object.keys(FAMILIES);
  const out = [], seenRule = new Set(), seenId = new Set(); let attempts = 0; const rej = { build: 0, trivial: 0, unsolvable: 0, ambiguous: 0, teaching: 0 };
  const budget = opts.budget || n * 100;
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
  if (r.emitted < 24) throw new Error("gen4: underfilled (" + r.emitted + "/24) rej=" + JSON.stringify(r.rejected));
  for (const t of r.records) { const sv = V2.solvable(t); if (!sv.solvable || !sv.unique) throw new Error("not uniquely solvable: " + t.meta.id + " — " + sv.reason); if (B.trivialSolve(t)) throw new Error("trivial leaked: " + t.meta.id); }
  for (const fam of ["containment", "boolean", "analogy"]) if (!r.families.includes(fam)) throw new Error("gen4: family " + fam + " produced nothing");
  const a = generate({ n: 10, seed: 9 }).records.map(t => t.meta.id).join(","), b = generate({ n: 10, seed: 9 }).records.map(t => t.meta.id).join(",");
  if (a !== b) throw new Error("gen4: non-deterministic");
  return true;
}

if (require.main === module) {
  const args = process.argv.slice(2), flag = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
  if (args.includes("--self-test")) { selfTest(); console.log("gen4: self-test PASS"); }
  else { const n = +flag("--n", 40), seed = +flag("--seed", 1), o = flag("-o", null), r = generate({ n, seed });
    if (args.includes("--report")) { console.error(`\nCOMPLEX verified — ${r.emitted}/${n}, ${r.distinct_rules} distinct, families: ${r.families.join(", ")}`); console.error("rejected:", JSON.stringify(r.rejected)); console.error("\nsample:"); for (const t of r.records.slice(0, 18)) console.error(`  [${t.meta.family}] ${t.meta.rule}`); console.error(""); }
    if (o) { require("fs").writeFileSync(o, r.records.map(t => JSON.stringify(t)).join("\n") + "\n"); console.error(`wrote ${r.emitted} → ${o}`); }
    else if (!args.includes("--report")) console.log(r.records.map(t => JSON.stringify(t)).join("\n")); }
}
module.exports = { generate, FAMILIES };
