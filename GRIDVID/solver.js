#!/usr/bin/env node
/* solver.js — a real ZERO-LLM compositional SOLVER + solvability/uniqueness verifier.
 *
 * The lesson: "function-consistent by a coarse signature" ≠ SOLVABLE. A task is only useful if a
 * solver, seeing ONLY the train pairs, can re-derive the rule and reproduce the held-out test output —
 * and if that rule is UNIQUE (no second rule fits the train pairs but predicts a different test out).
 *
 * Hypothesis class (HIERARCHICAL but solvable, all in-place so object correspondence is the bbox):
 *   - global:        every object gets the SAME transform.
 *   - groupby(K):    transform is a function of ONE recoverable key K
 *                    (color / core / size / quadrant / hole / orientation).   ← the canonical ARC rule
 *   - region(R)∘sub: inside region R apply {global | groupby(K)}, outside leave identity.   ← depth-2 hierarchy
 * Per-object transforms it can read off pixels: identity, remove, recolor, recolor_core,
 * mirror_h, flip_v, rotate_180, outline, fill_hole.
 *
 *   solve(task)     → {hypothesis, rule} that fits ALL train pairs, or null
 *   solvable(task)  → { solvable, unique, rule } — unique ⇒ exactly one test prediction across all fits
 *   node solver.js --self-test
 */

// ---------- grid utils ----------
const dimsOK = g => Array.isArray(g) && g.length && Array.isArray(g[0]);
const blank = (H, W) => Array.from({ length: H }, () => new Array(W).fill(0));
const eqG = (a, b) => a.length === b.length && a[0].length === b[0].length && a.every((row, i) => row.every((x, j) => x === b[i][j]));
const flipH = g => g.map(r => r.slice().reverse());
const flipV = g => g.slice().reverse().map(r => r.slice());
const rot180 = g => flipH(flipV(g));
const sub = (g, r0, c0, h, w) => Array.from({ length: h }, (_, i) => Array.from({ length: w }, (_, j) => (r0 + i < g.length && c0 + j < g[0].length && r0 + i >= 0 && c0 + j >= 0) ? g[r0 + i][c0 + j] : 0));
function outlineGrid(loc) {                       // keep non-bg cells touching bg / border; preserve colour
  const h = loc.length, w = loc[0].length, o = blank(h, w);
  for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) if (loc[r][c]) {
    const edge = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dr, dc]) => { const nr = r + dr, nc = c + dc; return nr < 0 || nc < 0 || nr >= h || nc >= w || !loc[nr][nc]; });
    if (edge) o[r][c] = loc[r][c];
  }
  return o;
}
const LARGE_THR = 7;   // area ≥ THR ⇒ "large" (shared with the generator)

// ---------- object segmentation (a blob = any 4-connected non-bg region; multi-colour ok) ----------
function segObjects(g) {
  const H = g.length, W = g[0].length, seen = Array.from({ length: H }, () => new Array(W).fill(false)), objs = [];
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
    if (seen[r][c] || !g[r][c]) continue;
    const st = [[r, c]], cells = []; seen[r][c] = true;
    let r0 = r, r1 = r, c0 = c, c1 = c;
    while (st.length) { const [y, x] = st.pop(); cells.push([y, x]); r0 = Math.min(r0, y); r1 = Math.max(r1, y); c0 = Math.min(c0, x); c1 = Math.max(c1, x);
      for (const [dy, dx] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const ny = y + dy, nx = x + dx; if (ny >= 0 && nx >= 0 && ny < H && nx < W && !seen[ny][nx] && g[ny][nx]) { seen[ny][nx] = true; st.push([ny, nx]); } } }
    const h = r1 - r0 + 1, w = c1 - c0 + 1, loc = sub(g, r0, c0, h, w);
    const hist = {}; for (const [y, x] of cells) hist[g[y][x]] = (hist[g[y][x]] || 0) + 1;
    const mainColor = +Object.entries(hist).sort((a, b) => b[1] - a[1])[0][0];
    const ctrCell = loc[h >> 1][w >> 1], coreColor = (ctrCell && ctrCell !== mainColor) ? ctrCell : null;
    objs.push({ r: r0, c: c0, h, w, loc, area: cells.length, mainColor, coreColor, hasHole: detectHole(loc), orient: h > w ? "tall" : w > h ? "wide" : "square", cr: (r0 + r1) / 2, cc: (c0 + c1) / 2 });
  }
  if (objs.length) { const areas = objs.map(o => o.area), mx = Math.max(...areas), mn = Math.min(...areas); for (const o of objs) o.sizeRank = o.area === mx ? "largest" : o.area === mn ? "smallest" : "mid"; }
  return objs;
}
function detectHole(loc) {                        // a bg cell not connected to the local border = enclosed hole
  const h = loc.length, w = loc[0].length, seen = Array.from({ length: h }, () => new Array(w).fill(false)), st = [];
  for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) if ((r === 0 || c === 0 || r === h - 1 || c === w - 1) && !loc[r][c] && !seen[r][c]) { seen[r][c] = true; st.push([r, c]); }
  while (st.length) { const [y, x] = st.pop(); for (const [dy, dx] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const ny = y + dy, nx = x + dx; if (ny >= 0 && nx >= 0 && ny < h && nx < w && !seen[ny][nx] && !loc[ny][nx]) { seen[ny][nx] = true; st.push([ny, nx]); } } }
  for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) if (!loc[r][c] && !seen[r][c]) return true;
  return false;
}

// ---------- key + region readers (pixel-recoverable only) ----------
const KEYS = ["color", "core_color", "size_class", "quadrant", "has_hole", "orientation", "size_rank"];
function keyVal(key, o, H, W) {
  switch (key) {
    case "color": return o.mainColor;
    case "core_color": return o.coreColor == null ? "none" : o.coreColor;
    case "size_class": return o.area >= LARGE_THR ? "large" : "small";
    case "quadrant": return (o.cr < H / 2 ? "T" : "B") + (o.cc < W / 2 ? "L" : "R");
    case "has_hole": return o.hasHole ? "holed" : "solid";
    case "orientation": return o.orient;
    case "size_rank": return o.sizeRank || "mid";
  }
}
const REGIONS = [["half", "left"], ["half", "right"], ["half", "top"], ["half", "bottom"], ["quadrant", "TL"], ["quadrant", "TR"], ["quadrant", "BL"], ["quadrant", "BR"]];
function inRegion(reg, o, H, W) {
  const [r, c] = [o.cr, o.cc];
  if (reg[0] === "half") return reg[1] === "left" ? c < W / 2 : reg[1] === "right" ? c >= W / 2 : reg[1] === "top" ? r < H / 2 : r >= H / 2;
  return ((r < H / 2 ? "T" : "B") + (c < W / 2 ? "L" : "R")) === reg[1];
}

// ---------- transform detection: in-object local grid → out local grid → canonical descriptor string ----------
function detectTransform(inLoc, outLoc, mainColor) {
  const h = inLoc.length, w = inLoc[0].length;
  const empty = outLoc.every(row => row.every(x => !x));
  if (empty) return "remove";
  if (eqG(inLoc, outLoc)) return "identity";
  if (outLoc.length === h && outLoc[0].length === w) {
    if (eqG(outLoc, flipH(inLoc))) return "mirror_h";
    if (eqG(outLoc, flipV(inLoc))) return "flip_v";
    if (eqG(outLoc, rot180(inLoc))) return "rotate_180";
    if (eqG(outLoc, outlineGrid(inLoc))) return "outline";
    // recolor: same occupancy, all non-bg → ONE colour
    const occIn = inLoc.map(r => r.map(x => x ? 1 : 0)), occOut = outLoc.map(r => r.map(x => x ? 1 : 0));
    if (eqG(occIn, occOut)) {
      const cols = new Set(); for (const row of outLoc) for (const x of row) if (x) cols.add(x);
      if (cols.size === 1) return "recolor:" + [...cols][0];
      // recolor_core: identical except the centre cell
      let diff = 0, ctr = null; for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) if (inLoc[r][c] !== outLoc[r][c]) { diff++; if (r === (h >> 1) && c === (w >> 1)) ctr = outLoc[r][c]; }
      if (diff === 1 && ctr != null) return "recolor_core:" + ctr;
    }
    // fill_hole: out is the full solid rectangle in the main colour
    if (outLoc.every(row => row.every(x => x === mainColor))) return "fill_hole:" + mainColor;
  }
  return null;   // not in the solvable class
}

// apply a descriptor to an in-object local grid → out local grid (inverse of detect)
function applyDescriptor(desc, inLoc, mainColor) {
  const h = inLoc.length, w = inLoc[0].length;
  if (desc === "identity") return inLoc.map(r => r.slice());
  if (desc === "remove") return blank(h, w);
  if (desc === "mirror_h") return flipH(inLoc);
  if (desc === "flip_v") return flipV(inLoc);
  if (desc === "rotate_180") return rot180(inLoc);
  if (desc === "outline") return outlineGrid(inLoc);
  if (desc.startsWith("recolor_core:")) { const c = +desc.split(":")[1], o = inLoc.map(r => r.slice()); o[h >> 1][w >> 1] = c; return o; }
  if (desc.startsWith("recolor:")) { const c = +desc.split(":")[1]; return inLoc.map(r => r.map(x => x ? c : 0)); }
  if (desc.startsWith("fill_hole:")) { const c = +desc.split(":")[1]; return inLoc.map(r => r.map(() => c)); }
  return inLoc.map(r => r.slice());
}

// per-pair: list of {features, desc}; null if any object/extra-content is outside the solvable class
function pairAssignments(inG, outG) {
  if (!dimsOK(inG) || !dimsOK(outG) || inG.length !== outG.length || inG[0].length !== outG[0].length) return null;   // in-place ⇒ same dims
  const H = inG.length, W = inG[0].length, objs = segObjects(inG), covered = blank(H, W), as = [];
  for (const o of objs) {
    const inLoc = o.loc, outLoc = sub(outG, o.r, o.c, o.h, o.w);
    const desc = detectTransform(inLoc, outLoc, o.mainColor);
    if (!desc) return null;
    for (let r = 0; r < o.h; r++) for (let c = 0; c < o.w; c++) covered[o.r + r][o.c + c] = 1;
    as.push({ o, desc });
  }
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) if (outG[r][c] && !covered[r][c]) return null;   // OUT content not explained by any IN object ⇒ out of class
  return { objs, as, H, W };
}

// predict OUT from IN under a hypothesis (so we can test uniqueness on the held-out pair)
function predict(hyp, inG) {
  const H = inG.length, W = inG[0].length, objs = segObjects(inG), out = blank(H, W);
  for (const o of objs) {
    const desc = descFor(hyp, o, H, W);
    if (desc == null) return null;
    const loc = applyDescriptor(desc, o.loc, o.mainColor);
    for (let r = 0; r < o.h; r++) for (let c = 0; c < o.w; c++) if (loc[r][c]) out[o.r + r][o.c + c] = loc[r][c];
  }
  return out;
}
function descFor(hyp, o, H, W) {
  if (hyp.region && !inRegion(hyp.region, o, H, W)) return "identity";
  if (hyp.kind === "global") return hyp.desc;
  if (hyp.kind === "groupby") { const v = keyVal(hyp.key, o, H, W); return Object.prototype.hasOwnProperty.call(hyp.map, v) ? hyp.map[v] : "identity"; }
  return "identity";
}

// build every hypothesis consistent with ALL train pairs
function fitHypotheses(train) {
  const perPair = train.map(([i, o]) => pairAssignments(i, o));
  if (perPair.some(p => p === null)) return [];
  const all = perPair.flatMap(p => p.as.map(a => ({ ...a, H: p.H, W: p.W })));
  const hyps = [];
  const regionsToTry = [null, ...REGIONS];
  for (const region of regionsToTry) {
    const inR = a => region == null || inRegion(region, a.o, a.H, a.W);
    const outIdentity = all.filter(a => !inR(a)).every(a => a.desc === "identity");   // outside region must be untouched
    if (!outIdentity) continue;
    const inside = all.filter(inR);
    if (!inside.length) continue;
    // global: all inside same desc
    const descs = new Set(inside.map(a => a.desc));
    if (descs.size === 1 && [...descs][0] !== "identity") hyps.push({ kind: "global", desc: [...descs][0], region });
    // groupby K
    for (const key of KEYS) {
      const map = {}; let ok = true, nontrivial = false;
      for (const a of inside) { const v = keyVal(key, a.o, a.H, a.W); if (map[v] == null) map[v] = a.desc; else if (map[v] !== a.desc) { ok = false; break; } if (a.desc !== "identity") nontrivial = true; }
      if (ok && nontrivial && Object.keys(map).length >= 2) hyps.push({ kind: "groupby", key, map, region });
    }
  }
  hyps.sort((a, b) => complexity(a) - complexity(b));   // simplest rule first (cleanest description, strongest uniqueness)
  return hyps;
}
function complexity(h) {
  let c = h.region ? 1 : 0;
  if (h.kind === "global") return c;
  return c + Object.keys(h.map).length;
}

const last = v => v[v.length - 1];
function trainPairs(task) { return task.examples.map(e => [last(e.in), last(e.out)]); }
function testPair(task) { return [last(task.in), last(task.out)]; }

function solve(task) {                             // first hypothesis that fits all TRAIN pairs (+ verify train replay)
  const train = trainPairs(task), hyps = fitHypotheses(train);
  for (const h of hyps) if (train.every(([i, o]) => { const p = predict(h, i); return p && eqG(p, o); })) return { hypothesis: h, rule: ruleText(h) };
  return null;
}

// solvable + UNIQUE: ≥1 hypothesis fits train AND reproduces the actual test out, and ALL fitting
// hypotheses agree on the test prediction (no ambiguity = two rules fitting train but differing on test).
function solvable(task) {
  const train = trainPairs(task), [tin, tout] = testPair(task);
  const fits = fitHypotheses(train).filter(h => train.every(([i, o]) => { const p = predict(h, i); return p && eqG(p, o); }));
  if (!fits.length) return { solvable: false, unique: false, reason: "no hypothesis fits the train pairs", rule: null };
  const preds = fits.map(h => predict(h, tin)).filter(Boolean);
  const distinct = new Set(preds.map(p => JSON.stringify(p)));
  const matches = fits.filter(h => { const p = predict(h, tin); return p && eqG(p, tout); });
  if (!matches.length) return { solvable: false, unique: false, reason: "fitting hypotheses do not reproduce the test output", rule: null };
  const unique = distinct.size === 1;
  return { solvable: true, unique, reason: unique ? "ok" : "ambiguous: " + distinct.size + " distinct test predictions fit train", rule: ruleText(matches[0]), hypothesis: matches[0], n_fits: fits.length };
}

// ---------- readable rule text ----------
const COLNAME = ["black", "blue", "red", "green", "yellow", "grey", "magenta", "orange", "cyan", "maroon"];
function descText(d) {
  if (d === "identity") return "keep"; if (d === "remove") return "remove";
  if (d === "mirror_h") return "mirror L-R"; if (d === "flip_v") return "flip T-B"; if (d === "rotate_180") return "rotate 180°";
  if (d === "outline") return "outline"; if (d.startsWith("fill_hole")) return "fill solid";
  if (d.startsWith("recolor_core:")) return "core→" + COLNAME[+d.split(":")[1]];
  if (d.startsWith("recolor:")) return "→" + COLNAME[+d.split(":")[1]];
  return d;
}
function ruleText(h) {
  const body = h.kind === "global" ? `${descText(h.desc)} every object`
    : `by ${h.key}: ` + Object.entries(h.map).map(([v, d]) => `${v}→${descText(d)}`).join(", ");
  return h.region ? `within the ${h.region[1]} ${h.region[0] === "half" ? "half" : "quadrant"}, ${body} (rest unchanged)` : body;
}

// ---------- self-test ----------
function selfTest() {
  const P = require("./program.js");
  // solver must SOLVE clean group-wise / region-masked program.js demos (in-place, recoverable keys)
  for (const name of ["recolor_by_quadrant", "recolor_by_size", "mask_left_mirror"]) {
    const t = P.buildDemo(name, { seed: 5 }), s = solvable(t);
    if (!s.solvable || !s.unique) throw new Error(name + " should be UNIQUELY SOLVABLE: " + s.reason);
  }
  // solver must REJECT a random deep chain (the unsolvable garbage)
  const D = require("./compose_deep.js");
  const deep = D.generate({ n: 30, depth: 5, seed: 4 }).records;
  const solvedDeep = deep.filter(t => solvable(t).solvable).length;
  if (solvedDeep > deep.length * 0.5) throw new Error("solver wrongly accepts most random deep chains (" + solvedDeep + "/" + deep.length + ")");
  // determinism of solve
  const t = P.buildDemo("recolor_by_quadrant", { seed: 2 });
  if (JSON.stringify(solve(t)) !== JSON.stringify(solve(t))) throw new Error("solve non-deterministic");
  return true;
}

if (require.main === module) {
  if (process.argv.includes("--self-test")) { selfTest(); console.log("solver: self-test PASS"); }
  else console.log("usage: node solver.js --self-test  (module: require('./solver.js').solvable(task))");
}

module.exports = { solve, solvable, segObjects, detectTransform, fitHypotheses, predict, ruleText, KEYS, LARGE_THR };
