#!/usr/bin/env node
/* gen_logic.js — LOGICAL / IQ-style tasks that need REASONING (not style transfer): Raven-matrix /
 * Latin-square completion, and count-arithmetic. Each is re-derived UNIQUELY by solver2 + baseline-hard.
 *   node gen_logic.js --n 40 --report   ·   node gen_logic.js --n 500 -o out/logic.jsonl   ·   node gen_logic.js --self-test
 */
const crypto = require("crypto");
const E = require("./engine.js");
const B = require("./baseline.js");
const V2 = require("./solver2.js");

const pick = (rng, xs) => xs[rng.int(0, xs.length - 1)];
const sampleK = (rng, xs, k) => { const a = xs.slice(); for (let i = a.length - 1; i > 0; i--) { const j = rng.int(0, i);[a[i], a[j]] = [a[j], a[i]]; } return a.slice(0, k); };
const PAL = [1, 2, 3, 4, 6, 7, 8, 9];
const blank = (H, W) => Array.from({ length: H }, () => new Array(W).fill(0));
const stampSquare = (g, r, c, s, col) => { for (let a = 0; a < s; a++) for (let b = 0; b < s; b++) if (r + a < g.length && c + b < g[0].length) g[r + a][c + b] = col; };

// ---------- RAVEN / LATIN SQUARE: 3×3 of colours, each row & col holds each colour once; one cell blanked ----------
function ravenLatin(rng) {
  const cols = sampleK(rng, PAL, 3);   // 3 distinct colours, vary per example
  const build = () => {
    const s = rng.int(2, 3), gap = rng.int(2, 3), step = s + gap, r0 = rng.int(1, 3), c0 = rng.int(1, 3);
    const H = r0 + 3 * step + 2, W = c0 + 3 * step + 2;
    // a random 3×3 Latin square over {0,1,2}: shift each row
    const base = sampleK(rng, [0, 1, 2], 3), L = [0, 1, 2].map(i => base.map((_, j) => base[(j + i) % 3]));
    if (rng.int(0, 1)) L.reverse();                  // more variety, still Latin
    const er = rng.int(0, 2), ec = rng.int(0, 2);    // the missing cell
    const draw = withMissing => { const g = blank(H, W); for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) { if (withMissing && i === er && j === ec) continue; stampSquare(g, r0 + i * step, c0 + j * step, s, cols[L[i][j]]); } return g; };
    return { in: draw(true), out: draw(false) };
  };
  return fromPairs(rng, build, { rule: "complete the matrix so each row & column holds each colour once" });
}

// ---------- ARITHMETIC: output |#red − #blue| marks (counting + subtraction) ----------
function countDiff(rng) {
  const cA = pick(rng, PAL), cB = pick(rng, PAL.filter(c => c !== cA)), markCol = pick(rng, PAL.filter(c => c !== cA && c !== cB)), vert = rng.int(0, 1);
  const build = () => {
    const H = rng.int(16, 22), W = rng.int(16, 22), nA = rng.int(2, 6), nB = rng.int(2, 6); if (nA === nB) return null;
    const occ = blank(H, W), taken = blank(H, W);
    const free = (r, c, s) => { for (let a = -1; a <= s; a++) for (let b = -1; b <= s; b++) { const nr = r + a, nc = c + b; if (nr >= 0 && nc >= 0 && nr < H && nc < W && taken[nr][nc]) return false; } return true; };
    const place = col => { for (let t = 0; t < 120; t++) { const s = 2, r = rng.int(0, H - s), c = rng.int(0, W - s); if (free(r, c, s)) { for (let a = 0; a < s; a++) for (let b = 0; b < s; b++) taken[r + a][c + b] = 1; stampSquare(occ, r, c, s, col); return true; } } return false; };
    let ok = true; for (let i = 0; i < nA; i++) ok = place(cA) && ok; for (let i = 0; i < nB; i++) ok = place(cB) && ok; if (!ok) return null;
    const diff = Math.abs(nA - nB), line = vert ? Array.from({ length: diff }, () => [markCol]) : [Array.from({ length: diff }, () => markCol)];
    return { in: occ, out: line };
  };
  return fromPairs(rng, build, { rule: "output the DIFFERENCE between the two object counts as a row of marks" });
}

function fromPairs(rng, build, extra = {}) {
  const ex = []; for (let i = 0; i < 4; i++) { const p = build(); if (!p) return null; ex.push({ in: [p.in], out: [p.out] }); }
  const examples = ex.slice(0, 3), test = ex[3], id = "GL-" + crypto.createHash("sha1").update(JSON.stringify([examples, test])).digest("hex").slice(0, 8);
  return { format: "prodigy-task", version: 1, width: test.in[0][0].length, height: test.in[0].length, palette: "arc10", fps: 1, examples, in: test.in, out: test.out, meta: { id, ...extra } };
}

const FAMILIES = { raven_latin: ravenLatin, count_diff: countDiff };
function generate(opts = {}) {
  const n = opts.n || 40, rng = E.makeRng((opts.seed || 1) * 2654435761 + 233), fams = Object.keys(FAMILIES);
  const out = [], seenId = new Set(), seenRule = new Set(); let i = 0, guard = 0; const rej = { build: 0, teaching: 0, trivial: 0, unsolvable: 0, ambiguous: 0 }, perFam = {};
  while (out.length < n && guard++ < n * 80) {
    const fam = fams[i++ % fams.length]; let t; try { t = FAMILIES[fam](rng); } catch (e) { t = null; }
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
  if (r.emitted < 24) throw new Error("gen_logic: underfilled (" + r.emitted + "/24) rej=" + JSON.stringify(r.rejected));
  for (const t of r.records) { const sv = V2.solvable(t); if (!sv.solvable || !sv.unique) throw new Error("not uniquely solvable: " + t.meta.id); if (B.trivialSolve(t)) throw new Error("trivial leaked: " + t.meta.id); }
  for (const f of Object.keys(FAMILIES)) if (!r.families[f]) throw new Error("family produced nothing: " + f);
  return true;
}

if (require.main === module) {
  const args = process.argv.slice(2), flag = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
  if (args.includes("--self-test")) { selfTest(); console.log("gen_logic: self-test PASS"); }
  else { const n = +flag("--n", 40), seed = +flag("--seed", 1), o = flag("-o", null), r = generate({ n, seed });
    if (args.includes("--report")) { console.error(`\nLOGICAL — ${r.emitted}/${n}, by family ${JSON.stringify(r.families)}`); console.error("rejected:", JSON.stringify(r.rejected)); console.error("\nsample:"); for (const t of r.records.slice(0, 10)) console.error(`  [${t.meta.family}] ${t.meta.rule}`); console.error(""); }
    if (o) { require("fs").writeFileSync(o, r.records.map(t => JSON.stringify(t)).join("\n") + "\n"); console.error(`wrote ${r.emitted} → ${o}`); }
    else if (!args.includes("--report")) console.log(r.records.map(t => JSON.stringify(t)).join("\n")); }
}
module.exports = { generate, FAMILIES };
