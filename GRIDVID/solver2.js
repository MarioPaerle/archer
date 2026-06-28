#!/usr/bin/env node
/* solver2.js — execution-search solver over a RICH DSL (relational + global + multi-step).
 * NO quadrant. Verifies a task by re-deriving its rule from the train pairs and checking it reproduces
 * the held-out test UNIQUELY (no rival rule fits train but differs on test). Hypotheses are uniform
 * { text, complexity, predict(inGrid)->outGrid|null } so adding an op is local.
 *
 * Rule classes (all genuinely different / harder than "classify-by-property-and-recolor"):
 *   relational : odd-one-out (by colour/shape/size) recolour|remove|extract; the unique object
 *   selection  : keep/remove/extract largest|smallest
 *   structural : gravity-settle, fill-all-holes, outline-all, connect same-colour pairs, complete symmetry, denoise
 *   intrinsic  : group-wise by colour/size/hole/orientation/size-rank/shape  (NO quadrant)
 *   multi-step : a structural op THEN a group rule (depth-2 pipeline)
 *   node solver2.js --self-test
 */
const S = require("./solver.js");
const SK = require("./skins2.js");
const { segObjects: seg, detectTransform, applyDescriptor, sub, eqG, blank } = S;
const objSkin = o => SK.classifySkin(o.loc);

// ---------- grid / object helpers ----------
const dims = g => [g.length, g[0].length];
const sameDims = (a, b) => a.length === b.length && a[0].length === b[0].length;
function stamp(out, loc, r, c) { for (let i = 0; i < loc.length; i++) for (let j = 0; j < loc[0].length; j++) if (loc[i][j] && r + i >= 0 && c + j >= 0 && r + i < out.length && c + j < out[0].length) out[r + i][c + j] = loc[i][j]; }
function gridFrom(H, W, objs) { const g = blank(H, W); for (const o of objs) stamp(g, o.loc, o.r, o.c); return g; }
function crop(g) { let r0 = 1e9, r1 = -1, c0 = 1e9, c1 = -1; for (let r = 0; r < g.length; r++) for (let c = 0; c < g[0].length; c++) if (g[r][c]) { r0 = Math.min(r0, r); r1 = Math.max(r1, r); c0 = Math.min(c0, c); c1 = Math.max(c1, c); } if (r1 < 0) return [[0]]; const o = []; for (let r = r0; r <= r1; r++) o.push(g[r].slice(c0, c1 + 1)); return o; }
const silh = o => o.loc.map(row => row.map(x => x ? 1 : 0)).join("|");
const sizeClass = o => o.area >= S.LARGE_THR ? "large" : "small";

// ---------- relational value readers (per pair) ----------
function singletonBy(objs, attr) {           // the object whose attr value is UNIQUE while others share → odd-one-out
  const val = { color: o => o.mainColor, shape: o => silh(o), size: o => o.area, skin: o => objSkin(o) }[attr];
  const counts = {}; for (const o of objs) { const v = val(o); counts[v] = (counts[v] || 0) + 1; }
  const singles = objs.filter(o => counts[val(o)] === 1);
  const hasMajority = Object.values(counts).some(n => n >= 2);
  return (singles.length === 1 && hasMajority) ? singles[0] : null;   // exactly one odd + a clear "rest"
}
function valOfFeature(feature, objs) {
  if (feature.startsWith("odd_")) { const odd = singletonBy(objs, feature.slice(4)); if (!odd) return null; return o => o === odd ? "odd" : "normal"; }
  switch (feature) {
    case "color": return o => o.mainColor;
    case "size_class": return sizeClass;
    case "has_hole": return o => o.hasHole ? "holed" : "solid";
    case "orientation": return o => o.orient;
    case "size_rank": return o => o.sizeRank || "mid";
    case "skin": { const valid = objs.every(o => objSkin(o) !== "unknown"); return valid ? (o => objSkin(o)) : null; }
  }
  return null;
}
const FEATURES = ["color", "size_class", "has_hole", "orientation", "size_rank", "skin", "odd_color", "odd_shape", "odd_size", "odd_skin"];

// ---------- group-wise (in-place) hypothesis ----------
function deriveGroup(feature, train) {
  const map = {};
  for (const [inG, outG] of train) {
    if (!sameDims(inG, outG)) return null;
    const objs = seg(inG), valOf = valOfFeature(feature, objs); if (!valOf) return null;
    const covered = blank(inG.length, inG[0].length);
    for (const o of objs) {
      const desc = detectTransform(o.loc, sub(outG, o.r, o.c, o.h, o.w), o.mainColor); if (!desc) return null;
      const v = valOf(o); if (map[v] == null) map[v] = desc; else if (map[v] !== desc) return null;
      for (let i = 0; i < o.h; i++) for (let j = 0; j < o.w; j++) covered[o.r + i][o.c + j] = 1;
    }
    for (let r = 0; r < outG.length; r++) for (let c = 0; c < outG[0].length; c++) if (outG[r][c] && !covered[r][c]) return null;
  }
  if (!Object.values(map).some(d => d !== "identity")) return null;
  return { feature, map };
}
function predictGroup(inG, g) {
  const objs = seg(inG), valOf = valOfFeature(g.feature, objs); if (!valOf) return null;
  const out = blank(inG.length, inG[0].length);
  for (const o of objs) { const v = valOf(o), d = Object.prototype.hasOwnProperty.call(g.map, v) ? g.map[v] : "identity"; stamp(out, applyDescriptor(d, o.loc, o.mainColor), o.r, o.c); }
  return out;
}

// ---------- structural / global ops (param-free apply) ----------
const GRAV = { down: [1, 0], up: [-1, 0], left: [0, -1], right: [0, 1] };
function gravity(inG, dir) {
  const [vr, vc] = GRAV[dir], objs = seg(inG), H = inG.length, W = inG[0].length, occ = new Set();
  const proj = o => { let m = -1e9; for (let i = 0; i < o.h; i++) for (let j = 0; j < o.w; j++) if (o.loc[i][j]) m = Math.max(m, (o.r + i) * vr + (o.c + j) * vc); return m; };
  objs.sort((a, b) => proj(b) - proj(a));
  for (const o of objs) {
    let d = 0;
    for (; ;) { let hit = false; for (let i = 0; i < o.h && !hit; i++) for (let j = 0; j < o.w && !hit; j++) if (o.loc[i][j]) { const r = o.r + i + (d + 1) * vr, c = o.c + j + (d + 1) * vc; if (r < 0 || c < 0 || r >= H || c >= W || occ.has(r + "," + c)) hit = true; } if (hit) break; d++; }
    o.r += d * vr; o.c += d * vc; for (let i = 0; i < o.h; i++) for (let j = 0; j < o.w; j++) if (o.loc[i][j]) occ.add((o.r + i) + "," + (o.c + j));
  }
  return gridFrom(H, W, objs);
}
function fillHoles(inG) { const objs = seg(inG); for (const o of objs) if (o.hasHole) o.loc = o.loc.map(row => row.map(() => o.mainColor)); return gridFrom(inG.length, inG[0].length, objs); }
function outlineAll(inG) { const objs = seg(inG); for (const o of objs) o.loc = S.outlineGrid(o.loc); return gridFrom(inG.length, inG[0].length, objs); }
function denoise(inG) { const objs = seg(inG).filter(o => o.area > 1); return gridFrom(inG.length, inG[0].length, objs); }
function keepExtreme(inG, which) { const objs = seg(inG); if (objs.length < 2) return null; const ext = which === "largest" ? Math.max(...objs.map(o => o.area)) : Math.min(...objs.map(o => o.area)); const k = objs.filter(o => o.area === ext); if (k.length !== 1) return null; return gridFrom(inG.length, inG[0].length, k); }
function removeExtreme(inG, which) { const objs = seg(inG); if (objs.length < 2) return null; const ext = which === "largest" ? Math.max(...objs.map(o => o.area)) : Math.min(...objs.map(o => o.area)); const k = objs.filter(o => o.area === ext); if (k.length !== 1) return null; return gridFrom(inG.length, inG[0].length, objs.filter(o => o.area !== ext)); }
function connectPairs(inG) {
  const objs = seg(inG), H = inG.length, W = inG[0].length, byCol = {}; for (const o of objs) (byCol[o.mainColor] = byCol[o.mainColor] || []).push(o);
  const out = inG.map(r => r.slice()); let drew = false;
  for (const [col, os] of Object.entries(byCol)) if (os.length === 2) {
    const a = os[0], b = os[1], r0 = Math.round(a.cr), c0 = Math.round(a.cc), r1 = Math.round(b.cr), c1 = Math.round(b.cc);
    if (r0 === r1) { for (let c = Math.min(c0, c1); c <= Math.max(c0, c1); c++) if (!out[r0][c]) { out[r0][c] = +col; drew = true; } }
    else if (c0 === c1) { for (let r = Math.min(r0, r1); r <= Math.max(r0, r1); r++) if (!out[r][c0]) { out[r][c0] = +col; drew = true; } }
  }
  return drew ? out : null;
}
function completeSym(inG, axis) { const m = axis === "h" ? inG.map(r => r.slice().reverse()) : inG.slice().reverse().map(r => r.slice()); return inG.map((row, r) => row.map((x, c) => x || m[r][c])); }
function recolorAll(inG, c) { return inG.map(r => r.map(x => x ? c : 0)); }
function recolorToRef(inG, mode) {                // recolour ALL objects to a colour read from a reference object
  const objs = seg(inG); if (objs.length < 2) return null; let ref;
  if (mode === "largest") { const mx = Math.max(...objs.map(o => o.area)), k = objs.filter(o => o.area === mx); if (k.length !== 1) return null; ref = k[0].mainColor; }
  else { const cnt = {}; for (const o of objs) cnt[o.mainColor] = (cnt[o.mainColor] || 0) + 1; const top = Object.entries(cnt).sort((a, b) => b[1] - a[1]); if (top.length < 2 || top[0][1] === top[1][1]) return null; ref = +top[0][0]; }
  const out = blank(inG.length, inG[0].length); for (const o of objs) for (let i = 0; i < o.h; i++) for (let j = 0; j < o.w; j++) if (o.loc[i][j]) out[o.r + i][o.c + j] = ref; return out;
}
function deriveRecolorAll(train) { const cols = new Set(); for (const [, o] of train) for (const row of o) for (const x of row) if (x) cols.add(x); if (cols.size !== 1) return null; const c = [...cols][0]; return c; }
function extractObj(inG, which) {                 // output = crop of the selected object (different output size)
  const objs = seg(inG); if (objs.length < 2) return null; let sel = null;
  if (which === "largest" || which === "smallest") { const ext = which === "largest" ? Math.max(...objs.map(o => o.area)) : Math.min(...objs.map(o => o.area)); const k = objs.filter(o => o.area === ext); if (k.length !== 1) return null; sel = k[0]; }
  else { const odd = singletonBy(objs, which.slice(4)); if (!odd) return null; sel = odd; }
  return crop(gridFrom(inG.length, inG[0].length, [sel]));
}

// ---------- enumerate all hypotheses that FIT the train pairs ----------
const COLNAME = ["black", "blue", "red", "green", "yellow", "grey", "magenta", "orange", "cyan", "maroon"];
function descText(d) { return S.descText(d); }
function groupText(g) { return `by ${g.feature}: ` + Object.entries(g.map).map(([v, d]) => `${v}→${descText(d)}`).join(", "); }

function fitAll(train) {
  const H = [];
  const add = (text, complexity, predict) => { if (train.every(([i, o]) => { const p = predict(i); return p && eqG(p, o); })) H.push({ text, complexity, predict }); };
  // intrinsic / relational group-wise
  for (const f of FEATURES) { const g = deriveGroup(f, train); if (g) add(groupText(g), 2 + Object.keys(g.map).length, inG => predictGroup(inG, g)); }
  // recolor everything one colour
  const rc = deriveRecolorAll(train); if (rc != null) add(`recolour every object ${COLNAME[rc]}`, 1, inG => recolorAll(inG, rc));
  // RELATIONAL: recolour every object to the colour of the largest / of the majority (must read a reference object)
  add("recolour every object to the colour of the largest object", 3, inG => recolorToRef(inG, "largest"));
  add("recolour every object to the majority colour", 3, inG => recolorToRef(inG, "majority"));
  // structural (param-free)
  for (const dir of ["down", "up", "left", "right"]) add(`gravity ${dir} (everything settles)`, 2, inG => gravity(inG, dir));
  add("fill every hole solid", 2, fillHoles);
  add("outline every object", 2, outlineAll);
  add("remove the single-cell noise", 2, denoise);
  add("complete the left-right symmetry", 2, inG => completeSym(inG, "h"));
  add("complete the top-bottom symmetry", 2, inG => completeSym(inG, "v"));
  add("connect each same-colour pair with a line", 2, connectPairs);
  for (const w of ["largest", "smallest"]) { add(`keep only the ${w} object`, 2, inG => keepExtreme(inG, w)); add(`remove the ${w} object`, 2, inG => removeExtreme(inG, w)); }
  // extraction (output = the selected object, cropped)
  for (const w of ["largest", "smallest", "odd_color", "odd_shape", "odd_size"]) add(`output only the ${w.replace("odd_", "odd-by-")} object`, 2, inG => extractObj(inG, w));
  // multi-step: a structural op THEN a group rule
  const STRUCT = [["gravity down", inG => gravity(inG, "down")], ["denoise", denoise], ["fill holes", fillHoles], ["keep largest", inG => keepExtreme(inG, "largest")]];
  for (const [sname, sfn] of STRUCT) {
    let mids = null; try { mids = train.map(([i]) => sfn(i)); } catch (e) { mids = null; }
    if (!mids || mids.some(m => !m)) continue;
    const midTrain = train.map(([, o], k) => [mids[k], o]);
    for (const f of FEATURES) { const g = deriveGroup(f, midTrain); if (g) add(`${sname}, then ${groupText(g)}`, 5 + Object.keys(g.map).length, inG => { const m = sfn(inG); return m ? predictGroup(m, g) : null; }); }
  }
  H.sort((a, b) => a.complexity - b.complexity);
  return H;
}

function solve(task) { const tr = trainPairs(task), h = fitAll(tr)[0]; return h ? { rule: h.text } : null; }
function solvable(task) {
  const tr = trainPairs(task), [tin, tout] = testPair(task), fits = fitAll(tr);
  if (!fits.length) return { solvable: false, unique: false, reason: "no rule fits the train pairs", rule: null };
  const preds = fits.map(h => h.predict(tin)).filter(Boolean);
  const distinct = new Set(preds.map(p => JSON.stringify(p)));
  const matches = fits.filter(h => { const p = h.predict(tin); return p && eqG(p, tout); });
  if (!matches.length) return { solvable: false, unique: false, reason: "fitting rules do not reproduce the test", rule: null };
  return { solvable: true, unique: distinct.size === 1, reason: distinct.size === 1 ? "ok" : `ambiguous (${distinct.size} test predictions)`, rule: matches[0].text, n_fits: fits.length };
}

const last = v => v[v.length - 1];
const trainPairs = t => t.examples.map(e => [last(e.in), last(e.out)]);
const testPair = t => [last(t.in), last(t.out)];

// ---------- self-test ----------
function selfTest() {
  // build a couple of tasks directly with these ops and check they're uniquely solvable
  const E = require("./engine.js"), P = require("./program.js");
  const mk = (apply, samplerOpts) => {
    const rng = E.makeRng(7), ex = [];
    for (let i = 0; i < 4; i++) { const sc = P.sampleScene(rng, samplerOpts), inG = P.renderScene(sc), out = apply(inG); if (!out) { i--; continue; } ex.push({ in: [inG], out: [out] }); }
    return { format: "prodigy-task", examples: ex.slice(0, 3), in: ex[3].in, out: ex[3].out, meta: {} };
  };
  const tGrav = mk(g => gravity(g, "down"), { H: 16, W: 16, K: 5, kinds: ["square", "plus"], size: 2, palette: [2, 3, 4, 6, 8], upperFrac: 0.5 });
  if (!solvable(tGrav).solvable) throw new Error("gravity task not solvable: " + solvable(tGrav).reason);
  const tFill = mk(fillHoles, { H: 16, W: 16, K: 4, kinds: ["frame", "ring"], holedMix: false, palette: [2, 3, 4, 6, 8] });
  if (!solvable(tFill).solvable) throw new Error("fill task not solvable: " + solvable(tFill).reason);
  // a clean group task remains solvable here too
  const tg = P.buildDemo("recolor_by_size", { seed: 5 });
  if (!solvable(tg).solvable) throw new Error("group task not solvable in solver2");
  // determinism
  if (JSON.stringify(solve(tGrav)) !== JSON.stringify(solve(tGrav))) throw new Error("non-deterministic");
  return true;
}

if (require.main === module) {
  if (process.argv.includes("--self-test")) { selfTest(); console.log("solver2: self-test PASS"); }
  else console.log("usage: node solver2.js --self-test  (module: require('./solver2.js').solvable(task))");
}

module.exports = { solvable, solve, fitAll, gravity, fillHoles, outlineAll, denoise, keepExtreme, removeExtreme, connectPairs, completeSym, recolorAll, recolorToRef, extractObj, singletonBy, FEATURES };
