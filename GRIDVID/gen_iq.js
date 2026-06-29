#!/usr/bin/env node
/* gen_iq.js — MATRIX-REASONING (Raven / non-verbal IQ): the "deduce the missing cell from a row+column
 * constraint system" family Mario loved. Generalised beyond colour to SHAPE: a 3×3 matrix where each row &
 * column holds each VALUE (colour OR shape) exactly once, one cell blanked → deduce it. Verified by solver2.
 *   node gen_iq.js --n 40 --report   ·   node gen_iq.js --n 500 -o out/iq.jsonl   ·   node gen_iq.js --self-test
 */
const crypto = require("crypto");
const E = require("./engine.js");
const B = require("./baseline.js");
const V2 = require("./solver2.js");

const pick = (rng, xs) => xs[rng.int(0, xs.length - 1)];
const sampleK = (rng, xs, k) => { const a = xs.slice(); for (let i = a.length - 1; i > 0; i--) { const j = rng.int(0, i);[a[i], a[j]] = [a[j], a[i]]; } return a.slice(0, k); };
const PAL = [1, 2, 3, 4, 6, 7, 8, 9];
const blank = (H, W) => Array.from({ length: H }, () => new Array(W).fill(0));
// connected 3×3 cell patterns (each is ONE 4-connected blob, so the solver reads one object per cell)
const P3 = { full: ["111", "111", "111"], ring: ["111", "101", "111"], plus: ["010", "111", "010"], tee: ["111", "010", "010"], ell: ["100", "100", "111"], ushape: ["101", "101", "111"], hshape: ["111", "010", "111"] };
const SHAPE_KEYS = ["ring", "plus", "tee", "ell", "ushape", "hshape"];
function stampPattern(g, r, c, pat, color) { for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) if (pat[a][b] === "1" && r + a < g.length && c + b < g[0].length) g[r + a][c + b] = color; }

// a random 3×3 Latin square over {0,1,2} (each row & column a permutation)
function latinSquare(rng) { const base = sampleK(rng, [0, 1, 2], 3), L = [0, 1, 2].map(i => base.map((_, j) => base[(j + i) % 3])); if (rng.int(0, 1)) L.reverse(); return L; }

function buildMatrix(rng, mode) {
  const gap = rng.int(1, 2), step = 3 + gap, r0 = rng.int(1, 2), c0 = rng.int(1, 2), H = r0 + 3 * step + 1, W = c0 + 3 * step + 1;
  const L = latinSquare(rng), er = rng.int(0, 2), ec = rng.int(0, 2);
  let cols, pats;
  if (mode === "color") { cols = sampleK(rng, PAL, 3); pats = ["full", "full", "full"]; }          // value → colour, shape constant
  else { const col = pick(rng, PAL); cols = [col, col, col]; pats = sampleK(rng, SHAPE_KEYS, 3); }   // value → shape, colour constant
  const draw = miss => { const g = blank(H, W); for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) { if (miss && i === er && j === ec) continue; const v = L[i][j]; stampPattern(g, r0 + i * step, c0 + j * step, P3[pats[v]], cols[v]); } return g; };
  return { in: draw(true), out: draw(false) };
}

function matrixColor(rng) { return fromPairs(rng, () => buildMatrix(rng, "color"), { rule: "complete the matrix so each row & column holds each colour once" }); }
function matrixShape(rng) { return fromPairs(rng, () => buildMatrix(rng, "shape"), { rule: "complete the matrix so each row & column holds each shape once" }); }

function fromPairs(rng, build, extra = {}) {
  const ex = []; for (let i = 0; i < 4; i++) { const p = build(); if (!p) return null; ex.push({ in: [p.in], out: [p.out] }); }
  const examples = ex.slice(0, 3), test = ex[3], id = "IQ-" + crypto.createHash("sha1").update(JSON.stringify([examples, test])).digest("hex").slice(0, 8);
  return { format: "prodigy-task", version: 1, width: test.in[0][0].length, height: test.in[0].length, palette: "arc10", fps: 1, examples, in: test.in, out: test.out, meta: { id, ...extra } };
}

const FAMILIES = { matrix_color: matrixColor, matrix_shape: matrixShape };
function generate(opts = {}) {
  const n = opts.n || 40, rng = E.makeRng((opts.seed || 1) * 2654435761 + 277), fams = Object.keys(FAMILIES);
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
  if (r.emitted < 24) throw new Error("gen_iq: underfilled (" + r.emitted + "/24) rej=" + JSON.stringify(r.rejected));
  for (const t of r.records) { const sv = V2.solvable(t); if (!sv.solvable || !sv.unique) throw new Error("not uniquely solvable: " + t.meta.id); if (B.trivialSolve(t)) throw new Error("trivial leaked: " + t.meta.id); }
  for (const f of Object.keys(FAMILIES)) if (!r.families[f]) throw new Error("family produced nothing: " + f);
  return true;
}

if (require.main === module) {
  const args = process.argv.slice(2), flag = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
  if (args.includes("--self-test")) { selfTest(); console.log("gen_iq: self-test PASS"); }
  else { const n = +flag("--n", 40), seed = +flag("--seed", 1), o = flag("-o", null), r = generate({ n, seed });
    if (args.includes("--report")) { console.error(`\nMATRIX-REASONING — ${r.emitted}/${n}, by family ${JSON.stringify(r.families)}`); console.error("rejected:", JSON.stringify(r.rejected)); }
    if (o) { require("fs").writeFileSync(o, r.records.map(t => JSON.stringify(t)).join("\n") + "\n"); console.error(`wrote ${r.emitted} → ${o}`); }
    else if (!args.includes("--report")) console.log(r.records.map(t => JSON.stringify(t)).join("\n")); }
}
module.exports = { generate, FAMILIES };
