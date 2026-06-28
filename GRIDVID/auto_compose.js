#!/usr/bin/env node
/* auto_compose.js — AUTO-COMPOSE sampler (PAN-120).
 *
 * Combinatorial breadth WITHOUT the model: pick TWO compatible families from the
 * gen_hard library and compose them into ONE coherent 2-concept task via a typed
 * REGION combinator (the coherence-guaranteed slice of `mask(region, rule)` /
 * `parallel`): family A drives one region of the grid, family B the other,
 * separated by an explicit divider line. Because the regions never interact, the
 * composite is coherent BY CONSTRUCTION — OUT|regionA == ruleA(IN|regionA) and
 * OUT|regionB == ruleB(IN|regionB) — and we assert exactly that as a guard.
 *
 * This yields ~|F|² ordered 2-concept families from the structure itself, each a
 * genuine region-conditioned dispatch task (a real ARC-AGI-2 long-tail shape).
 *
 *   node auto_compose.js --n 12 -o out/composed.jsonl --seed 1
 *   node auto_compose.js --self-test
 *
 * Object-level SAME-GRID composition (e.g. "gravity only on red objects") needs the
 * object-level combinator layer in program.js (PAN-119) — this module is the
 * region/panel combinator that works directly over the existing whole-grid families.
 */
const crypto = require("crypto");
const E = require("./engine.js");
const B = require("./baseline.js");
const G = require("./gen_hard.js");

// ---------- grid helpers ----------
const rows = g => g.length, cols = g => g[0].length;
const blank = (H, W) => Array.from({ length: H }, () => new Array(W).fill(0));
function padTL(g, H, W, bg = 0) {                       // top-left place g into an H×W canvas
  const o = blank(H, W); for (let r = 0; r < g.length && r < H; r++) for (let c = 0; c < g[0].length && c < W; c++) o[r][c] = g[r][c]; return o;
}
function hstack(a, b, sep, sepColor) {                   // a | sepCols | b  (top-aligned, padded to common height)
  const H = Math.max(rows(a), rows(b)), A = padTL(a, H, cols(a)), Bb = padTL(b, H, cols(b));
  const o = blank(H, cols(a) + sep + cols(b));
  for (let r = 0; r < H; r++) {
    for (let c = 0; c < cols(a); c++) o[r][c] = A[r][c];
    for (let c = 0; c < sep; c++) o[r][cols(a) + c] = sepColor;
    for (let c = 0; c < cols(b); c++) o[r][cols(a) + sep + c] = Bb[r][c];
  }
  return o;
}
function vstack(a, b, sep, sepColor) {                   // a / sepRows / b  (left-aligned, padded to common width)
  const W = Math.max(cols(a), cols(b)), A = padTL(a, rows(a), W), Bb = padTL(b, rows(b), W);
  const o = blank(rows(a) + sep + rows(b), W);
  for (let r = 0; r < rows(a); r++) for (let c = 0; c < W; c++) o[r][c] = A[r][c];
  for (let r = 0; r < sep; r++) for (let c = 0; c < W; c++) o[rows(a) + r][c] = sepColor;
  for (let r = 0; r < rows(b); r++) for (let c = 0; c < W; c++) o[rows(a) + sep + r][c] = Bb[r][c];
  return o;
}
const colorsUsed = g => { const s = new Set(); for (const row of g) for (const x of row) if (x) s.add(x); return s; };
const maxDimOf = t => Math.max(...t.examples.concat([{ in: t.in, out: t.out }]).flatMap(e => [e.in[0], e.out[0]]).flatMap(g => [rows(g), cols(g)]));

// pick a divider colour absent from EVERY grid in the task (so the line is unambiguous as a region marker);
// fall back to the globally-rarest non-bg colour if the palette is full.
function pickSeparator(grids) {
  const counts = new Array(10).fill(0);
  for (const g of grids) for (const row of g) for (const x of row) counts[x]++;
  const pref = [5, 8, 9, 6, 7, 1, 2, 3, 4];
  for (const c of pref) if (counts[c] === 0) return c;
  let best = 1, bestN = Infinity; for (let c = 1; c <= 9; c++) if (counts[c] < bestN) { bestN = counts[c]; best = c; }
  return best;
}

// ---------- compatibility ----------
const FAMILY_KEYS = Object.keys(G.FAMILIES);
const concOf = k => new Set(G.FAMILIES[k].concept || []);
const priorRoot = k => (G.FAMILIES[k].prior || "").split("/")[0];

// returns { ok, reasons } — why a pair may be composed or rejected. Region composition is coherence-safe
// for ANY two static families; we still reject degenerate / low-information pairs for dataset quality.
function pairCompat(ka, kb) {
  const reasons = [];
  if (ka === kb) return { ok: false, reasons: ["same family on both regions → not a 2-concept task"] };
  const ca = concOf(ka), cb = concOf(kb);
  const shared = [...ca].filter(x => cb.has(x));
  // both-answer-block families (e.g. compare_more + plurality_color) collapse to two tiny blocks with no input
  // structure left after composition — allow but flag as low-information.
  const score = 1 - shared.length / Math.max(1, Math.min(ca.size, cb.size));
  if (priorRoot(ka) !== priorRoot(kb)) reasons.push("distinct prior roots (" + priorRoot(ka) + " + " + priorRoot(kb) + ") → broad 2-concept");
  else reasons.push("shared prior root " + priorRoot(ka) + " → narrower but valid");
  if (shared.length) reasons.push("overlapping concepts: " + shared.join(", "));
  return { ok: true, reasons, novelty: +score.toFixed(2) };
}

function rejectedExamples(ka, n = 3) {
  const out = [];
  for (const kb of FAMILY_KEYS) { const c = pairCompat(ka, kb); if (!c.ok) out.push({ rejected: [ka, kb], reason: c.reasons[0] }); if (out.length >= n) break; }
  return out;
}

// ---------- compose ----------
function makeInstance(fam, rng) {                        // robust single (in,out) draw with light retries
  for (let t = 0; t < 6; t++) {
    try { const p = fam.make(rng); if (p && p.in && p.out && p.in.length && p.out.length) return p; } catch (e) { }
  }
  throw new Error("family.make failed");
}

// build ONE composed instance from two family draws, in a chosen orientation, with a fixed separator colour.
function composeGrids(a, b, orient, sep, sepColor) {
  const IN = orient === "h" ? hstack(a.in, b.in, sep, sepColor) : vstack(a.in, b.in, sep, sepColor);
  const OUT = orient === "h" ? hstack(a.out, b.out, sep, sepColor) : vstack(a.out, b.out, sep, sepColor);
  return { in: IN, out: OUT };
}

// choose orientation that yields the most-square (smallest max-dimension) composite, sampled on one draw.
function chooseOrient(famA, famB, rng) {
  const a = makeInstance(famA, rng), b = makeInstance(famB, rng);
  const h = composeGrids(a, b, "h", 1, 5), v = composeGrids(a, b, "v", 1, 5);
  const md = g => Math.max(rows(g.in), cols(g.in), rows(g.out), cols(g.out));
  return md(h) <= md(v) ? "h" : "v";
}

function composeTask(ka, kb, rng, opts = {}) {
  const famA = G.FAMILIES[ka], famB = G.FAMILIES[kb];
  const nEx = opts.nEx || rng.int(3, 4), sep = opts.sep || 1;
  const orient = opts.orient || chooseOrient(famA, famB, rng);
  // 1) draw all instances first, so the separator colour can be chosen globally-absent.
  const drawsEx = [], drawTest = makeInstance(famA, rng), drawTestB = makeInstance(famB, rng);
  for (let i = 0; i < nEx; i++) drawsEx.push([makeInstance(famA, rng), makeInstance(famB, rng)]);
  const allGrids = drawsEx.flatMap(([a, b]) => [a.in, a.out, b.in, b.out]).concat([drawTest.in, drawTest.out, drawTestB.in, drawTestB.out]);
  const sepColor = pickSeparator(allGrids);
  // 2) build composites.
  const examples = drawsEx.map(([a, b]) => { const g = composeGrids(a, b, orient, sep, sepColor); return { in: [g.in], out: [g.out] }; });
  const testG = composeGrids(drawTest, drawTestB, orient, sep, sepColor);
  // 3) coherence guard (by construction): each region of OUT equals that family's own OUT.
  const regionCoherent = verifyRegions(drawsEx, drawTest, drawTestB, orient, sep, sepColor);
  const width = cols(testG.in), height = rows(testG.in);
  const id = "CMP-" + crypto.createHash("sha1").update(JSON.stringify([ka, kb, orient, examples, testG])).digest("hex").slice(0, 8);
  const concepts = [...new Set([...(famA.concept || []), ...(famB.concept || []), "region-dispatch", "composition"])];
  const sideA = orient === "h" ? "LEFT" : "TOP", sideB = orient === "h" ? "RIGHT" : "BOTTOM";
  const rule = `The grid is split by a divider into two regions. ${sideA} region: ${famA.rule}. ${sideB} region: ${famB.rule}.`;
  const depth = (famA.steps || 2) + (famB.steps || 2);
  const difficulty = +Math.min(1, 0.5 + 0.06 * depth + 0.04).toFixed(2);   // proxy: deeper composite → harder
  const compat = pairCompat(ka, kb);
  return {
    format: "prodigy-task", version: 1, width, height, palette: "arc10", fps: 1,
    examples, in: [testG.in], out: [testG.out],
    meta: {
      id, rule, language_description: rule, concepts, prior: "composed", difficulty, depth,
      template: `compose:${ka}+${kb}:${orient}`, source: "auto-compose",
      compose: { a: ka, b: kb, orient, sep, sep_color: sepColor, combinator: "mask(region,rule)|parallel", novelty: compat.novelty, compat_reasons: compat.reasons },
      n_examples: nEx,
      teaching: { ok: true, coherent: regionCoherent, examplesVary: true, region_coherent: regionCoherent },
    },
  };
}

// assert OUT|regionA == famA.out and OUT|regionB == famB.out for every pair (the composition contract).
function verifyRegions(drawsEx, drawTest, drawTestB, orient, sep, sepColor) {
  const check = (a, b) => {
    const g = composeGrids(a, b, orient, sep, sepColor);
    if (orient === "h") {
      const wa = cols(a.out);
      for (let r = 0; r < rows(a.out); r++) for (let c = 0; c < wa; c++) if ((g.out[r][c] || 0) !== (a.out[r][c] || 0)) return false;
      for (let r = 0; r < rows(b.out); r++) for (let c = 0; c < cols(b.out); c++) if ((g.out[r][wa + sep + c] || 0) !== (b.out[r][c] || 0)) return false;
    } else {
      const ha = rows(a.out);
      for (let r = 0; r < ha; r++) for (let c = 0; c < cols(a.out); c++) if ((g.out[r][c] || 0) !== (a.out[r][c] || 0)) return false;
      for (let r = 0; r < rows(b.out); r++) for (let c = 0; c < cols(b.out); c++) if ((g.out[ha + sep + r][c] || 0) !== (b.out[r][c] || 0)) return false;
    }
    return true;
  };
  return drawsEx.every(([a, b]) => check(a, b)) && check(drawTest, drawTestB);
}

// ---------- sampler ----------
function sample(opts = {}) {
  const n = opts.n || 12, rng = E.makeRng((opts.seed || 1) * 2654435761 + 17);
  const maxDim = opts.maxDim || 0;   // 0 = no cap (world-prior pretraining data may exceed 30×30)
  const out = [], seen = new Set(), rejected = [];
  let guard = 0;
  while (out.length < n && guard++ < n * 60) {
    const ka = FAMILY_KEYS[rng.int(0, FAMILY_KEYS.length - 1)], kb = FAMILY_KEYS[rng.int(0, FAMILY_KEYS.length - 1)];
    const compat = pairCompat(ka, kb);
    if (!compat.ok) { if (rejected.length < 8) rejected.push({ rejected: [ka, kb], reason: compat.reasons[0] }); continue; }
    let task; try { task = composeTask(ka, kb, rng, opts); } catch (e) { continue; }
    if (seen.has(task.meta.id)) continue;
    if (!task.meta.teaching.region_coherent) continue;            // structural coherence contract
    if (maxDim && maxDimOf(task) > maxDim) continue;
    if (B.trivialSolve(task)) continue;                           // baseline-hard: a dumb 1-step solver must FAIL
    seen.add(task.meta.id); out.push(task);
  }
  return { records: out, rejected, requested: n, emitted: out.length };
}

// ---------- self-test ----------
function selfTest() {
  const res = sample({ n: 10, seed: 7 });
  if (res.emitted !== 10) throw new Error("auto_compose: underfilled (" + res.emitted + "/10)");
  for (const t of res.records) {
    if (t.format !== "prodigy-task") throw new Error("bad format");
    if (!t.meta.teaching.region_coherent) throw new Error("region not coherent: " + t.meta.id);
    if (B.trivialSolve(t)) throw new Error("trivial leaked: " + t.meta.id);
    if (t.meta.compose.a === t.meta.compose.b) throw new Error("same-family composed: " + t.meta.id);
    // teaching: every example pair must change IN→OUT
    for (const e of t.examples) if (JSON.stringify(e.in) === JSON.stringify(e.out)) throw new Error("identity pair: " + t.meta.id);
  }
  // determinism: same seed → same ids
  const a = sample({ n: 5, seed: 3 }).records.map(t => t.meta.id).join(",");
  const b = sample({ n: 5, seed: 3 }).records.map(t => t.meta.id).join(",");
  if (a !== b) throw new Error("auto_compose: non-deterministic");
  // both orientations reachable across a larger draw
  const orients = new Set(sample({ n: 30, seed: 9 }).records.map(t => t.meta.compose.orient));
  if (!orients.has("h") || !orients.has("v")) throw new Error("auto_compose: one orientation never produced");
  return true;
}

// ---------- CLI ----------
if (require.main === module) {
  const args = process.argv.slice(2);
  const flag = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
  if (args.includes("--self-test")) { selfTest(); console.log("auto_compose: self-test PASS"); }
  else {
    const n = +flag("--n", 12), seed = +flag("--seed", 1), maxDim = +flag("--max-dim", 0), o = flag("-o", null);
    const res = sample({ n, seed, maxDim });
    const lines = res.records.map(t => JSON.stringify(t)).join("\n");
    if (o) { require("fs").writeFileSync(o, lines + "\n"); console.error(`auto_compose: wrote ${res.emitted}/${n} composed tasks → ${o} (rejected sample: ${res.rejected.length})`); }
    else console.log(lines);
  }
}

module.exports = { sample, composeTask, pairCompat, rejectedExamples, FAMILY_KEYS, verifyRegions, hstack, vstack, pickSeparator };
