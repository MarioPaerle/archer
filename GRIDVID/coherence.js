#!/usr/bin/env node
/* coherence.js — PAN-124: zero-LLM semantic coherence guard + near-dup + difficulty proxy.
 *
 * The structural guard (validateTask) only checks "every pair changes IN→OUT" and
 * "examples vary" — structurally-valid NONSENSE still slips through (HANDOVER: 3/14).
 * This adds a CHEAP, no-symbolic-solver FUNCTION-CONSISTENCY guard: the rule must be a
 * deterministic, consistent function of IN across ALL example pairs. We approximate
 * "consistent function" by a categorical RULE SIGNATURE — a tuple of cheap relational
 * features (dims relation, occupancy relation, palette relation, object-count relation,
 * change magnitude) computed per pair. A coherent rule yields a STABLE signature across
 * examples; a nonsense task (per-example-random / hidden-state) scatters it → flagged.
 *
 * The same signature doubles as a near-duplicate key (beyond exact content-hash) and
 * feeds a difficulty proxy (program length / #objects / #concepts / change magnitude).
 *
 *   node coherence.js --self-test
 */
const B = require("./baseline.js");

const last = v => v[v.length - 1];
const dims = g => [g.length, g[0].length];
const nonBgCells = g => { const s = new Set(); for (let r = 0; r < g.length; r++) for (let c = 0; c < g[0].length; c++) if (g[r][c]) s.add(r + "," + c); return s; };
const colorsOf = g => { const s = new Set(); for (const row of g) for (const x of row) if (x) s.add(x); return s; };
function components(g) {                                  // 4-connected same-colour blobs
  const H = g.length, W = g[0].length, seen = Array.from({ length: H }, () => new Array(W).fill(false)); let n = 0;
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
    if (seen[r][c] || !g[r][c]) continue; n++; const col = g[r][c], st = [[r, c]]; seen[r][c] = true;
    while (st.length) { const [y, x] = st.pop(); for (const [dy, dx] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const ny = y + dy, nx = x + dx; if (ny >= 0 && nx >= 0 && ny < H && nx < W && !seen[ny][nx] && g[ny][nx] === col) { seen[ny][nx] = true; st.push([ny, nx]); } } }
  }
  return n;
}
const subset = (a, b) => { for (const x of a) if (!b.has(x)) return false; return true; };

// crop a grid to its non-bg bounding box (for the "out is a crop of in" relation)
function crop(g) { let r0 = 1e9, r1 = -1, c0 = 1e9, c1 = -1; for (let r = 0; r < g.length; r++) for (let c = 0; c < g[0].length; c++) if (g[r][c]) { r0 = Math.min(r0, r); r1 = Math.max(r1, r); c0 = Math.min(c0, c); c1 = Math.max(c1, c); } if (r1 < 0) return g; const o = []; for (let r = r0; r <= r1; r++) o.push(g[r].slice(c0, c1 + 1)); return o; }

// cheap relational features of ONE (in,out) pair → categorical tags (relations, not absolute sizes).
function pairFeatures(inG, outG) {
  const [ih, iw] = dims(inG), [oh, ow] = dims(outG);
  let dimRel;
  if (ih === oh && iw === ow) dimRel = "same";
  else if (oh <= ih && ow <= iw) dimRel = "smaller";
  else if (oh >= ih && ow >= iw) dimRel = "larger";
  else dimRel = "reshape";
  const inC = colorsOf(inG), outC = colorsOf(outG);
  let palRel;
  if (outC.size <= 1) palRel = "constant";
  else if (subset(outC, inC) && subset(inC, outC)) palRel = "equal";
  else if (subset(outC, inC)) palRel = "subset";
  else if (subset(inC, outC)) palRel = "superset";
  else palRel = "shift";
  let occRel = "ndims", deltaBucket = "ndims";
  if (dimRel === "same") {
    const inO = nonBgCells(inG), outO = nonBgCells(outG);
    if (inO.size === outO.size && subset(inO, outO) && subset(outO, inO)) occRel = "same-cells";   // recolor-in-place
    else if (subset(outO, inO)) occRel = "removal";
    else if (subset(inO, outO)) occRel = "addition";
    else occRel = "rearrange";
    let diff = 0; for (let r = 0; r < ih; r++) for (let c = 0; c < iw; c++) if (inG[r][c] !== outG[r][c]) diff++;
    const frac = diff / (ih * iw); deltaBucket = frac < 0.08 ? "tiny" : frac < 0.25 ? "small" : frac < 0.55 ? "med" : "large";
  } else if (JSON.stringify(crop(inG)) === JSON.stringify(outG)) dimRel = "crop-of-in";
  const objRel = (() => { const a = components(inG), b = components(outG); return b < a ? "fewer" : b > a ? "more" : "same"; })();
  return { dimRel, occRel, palRel, objRel, deltaBucket };
}

const FEATURE_KEYS = ["dimRel", "occRel", "palRel", "objRel"];   // the core categorical signal (deltaBucket is softer)

// function-consistency: the categorical signature must AGREE across all example pairs (+ the test pair).
function functionConsistent(task, opts = {}) {
  const pairs = B.pairsOf(task).map(([i, o]) => pairFeatures(i, o));   // includes the test pair
  const reasons = [], agree = {};
  for (const key of FEATURE_KEYS) {
    const counts = {}; for (const f of pairs) counts[f[key]] = (counts[f[key]] || 0) + 1;
    const mode = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    agree[key] = { mode: mode[0], frac: +(mode[1] / pairs.length).toFixed(2) };
  }
  const minAgree = opts.minAgree == null ? 0.75 : opts.minAgree;
  // the two STRONGEST signals (dims relation, occupancy relation) must be (near-)unanimous; a scattered
  // signature means OUT is not a consistent function of IN → nonsense.
  for (const key of ["dimRel", "occRel"]) if (agree[key].frac < (key === "occRel" ? 0.6 : minAgree)) reasons.push(`${key} inconsistent across examples (mode '${agree[key].mode}' only ${agree[key].frac})`);
  const signature = FEATURE_KEYS.map(k => k + "=" + agree[k].mode).join("|");
  return { coherent: reasons.length === 0, signature, agreement: agree, reasons };
}

// near-dup key: rule signature + sorted concept set (catches reskins/relayouts of the same rule that the
// exact content-hash misses). Two tasks with the same key are near-duplicates.
function nearDupKey(task) {
  const fc = functionConsistent(task);
  const concepts = (task.meta && task.meta.concepts ? task.meta.concepts.slice().sort() : []).join(",");
  return fc.signature + "::" + concepts;
}

// difficulty proxy in [0,1]: program/AST length + #objects + #concepts + change magnitude. Honest proxy.
function difficulty(task) {
  const m = task.meta || {};
  const depth = m.depth || (m.program && m.program.depth) || 2;
  const branches = (m.program && m.program.dispatch_branches) || (m.compose ? 2 : 0);
  const concepts = (m.concepts || []).length;
  const objs = (m.program && m.program.objects) ? m.program.objects.length : components(last(task.in));
  const delta = pairFeatures(last(task.in), last(task.out)).deltaBucket;
  const dBump = { tiny: 0.0, small: 0.03, med: 0.06, large: 0.1, ndims: 0.05 }[delta] || 0;
  return +Math.min(1, 0.3 + 0.06 * depth + 0.05 * branches + 0.02 * concepts + 0.015 * objs + dBump).toFixed(2);
}

// one-stop quality gate. pass = teaching + non-trivial + function-consistent.
function guard(task, opts = {}) {
  const reasons = [];
  const pairs = task.examples || [];
  if (pairs.length < 2) reasons.push("need ≥2 examples");
  for (const e of pairs) if (JSON.stringify(e.in) === JSON.stringify(e.out)) reasons.push("identity example (no teaching)");
  if (new Set(pairs.map(e => JSON.stringify(e.out))).size < 2) reasons.push("examples do not vary");
  const trivial = B.trivialSolve(task); if (trivial) reasons.push("baseline-trivial (" + trivial + ")");
  const fc = functionConsistent(task, opts);
  if (!fc.coherent) reasons.push(...fc.reasons.map(r => "incoherent: " + r));
  return { pass: reasons.length === 0, coherent: fc.coherent, trivial: !!trivial, signature: fc.signature, near_dup_key: fc.signature + "::" + ((task.meta && task.meta.concepts || []).slice().sort().join(",")), difficulty: difficulty(task), reasons };
}

// ---------- self-test ----------
function selfTest() {
  const PROG = require("./program.js"), AC = require("./auto_compose.js"), SC = require("./suggester_compile.js"), SS = require("./super_suggester.js");
  // 1) real generators produce COHERENT, passing tasks
  for (const name of Object.keys(PROG.LIBRARY)) {
    const t = PROG.buildDemo(name, { seed: 8 }), g = guard(t);
    if (!g.coherent) throw new Error("program/" + name + " flagged incoherent: " + g.reasons.join("; "));
    if (!g.pass) throw new Error("program/" + name + " failed guard: " + g.reasons.join("; "));
  }
  for (const t of AC.sample({ n: 6, seed: 2 }).records) { const g = guard(t); if (!g.coherent) throw new Error("compose " + t.meta.id + " incoherent: " + g.reasons.join("; ")); }
  const sc = SC.compile(SS.makeSuggestion(7, ["dispatch_by_subobject"]), { seed: 3 });
  if (!guard(sc.task).coherent) throw new Error("suggester-compiled task flagged incoherent");
  // 2) NONSENSE must be caught: HETEROGENEOUS pairs — examples drawn from DIFFERENT rules with no single
  // consistent IN→OUT function (the valid-but-nonsense class that slips past structure/teaching checks).
  // recolor (same-cells) + gravity (rearrange) + outline-seq (removal) → occupancy relation scatters.
  const exFrom = (name, s) => PROG.buildDemo(name, { seed: s }).examples[0];
  const bad = {
    format: "prodigy-task", version: 1, width: 16, height: 16, palette: "arc10", fps: 1,
    examples: [exFrom("recolor_by_quadrant", 1), exFrom("gravity_on_red", 1), exFrom("seq_outline_then_largest_fill", 1)],
    in: exFrom("recolor_by_quadrant", 2).in, out: exFrom("recolor_by_quadrant", 2).out, meta: { concepts: ["mixed"] },
  };
  if (functionConsistent(bad).coherent) throw new Error("heterogeneous nonsense task NOT caught by function-consistency");
  // 3) near-dup: two seeds of the SAME program share a near-dup key; different programs differ.
  const k1 = nearDupKey(PROG.buildDemo("recolor_by_size", { seed: 1 })), k2 = nearDupKey(PROG.buildDemo("recolor_by_size", { seed: 2 }));
  if (k1 !== k2) throw new Error("near-dup key unstable across seeds of the same rule");
  const k3 = nearDupKey(PROG.buildDemo("mask_left_mirror", { seed: 1 }));
  if (k1 === k3) throw new Error("near-dup key collides across different rules");
  // 4) difficulty proxy sanity: in [0,1] and a 2-concept composite (depth≥4) ≥ a single 1-step dispatch.
  const dEasy = difficulty(PROG.buildDemo("gravity_on_red", { seed: 1 }));
  const dHard = difficulty(AC.sample({ n: 1, seed: 5 }).records[0]);
  if (dEasy < 0 || dEasy > 1 || dHard < 0 || dHard > 1) throw new Error("difficulty out of [0,1]");
  if (!(dHard >= dEasy)) throw new Error(`difficulty proxy not ordering composite (${dHard}) ≥ simple (${dEasy})`);
  return true;
}

module.exports = { pairFeatures, functionConsistent, nearDupKey, difficulty, guard, components };

// exports MUST be set before the CLI block: selfTest() lazily requires auto_compose.js, which requires
// THIS module back — if run directly, the export object has to already be populated.
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.includes("--self-test")) { selfTest(); console.log("coherence: self-test PASS"); }
  else console.log("usage: node coherence.js --self-test  (module: require('./coherence.js').guard(task))");
}
