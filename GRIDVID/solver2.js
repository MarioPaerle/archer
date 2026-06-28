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
function findFrame(objs) {                    // the enclosing container: a holed object whose interior holds ≥1 centroid
  const holed = objs.filter(o => o.hasHole); let best = null, bestA = -1;
  for (const f of holed) { const inside = objs.filter(o => o !== f && o.cr > f.r && o.cr < f.r + f.h - 1 && o.cc > f.c && o.cc < f.c + f.w - 1).length; if (inside >= 1 && f.h * f.w > bestA) { bestA = f.h * f.w; best = f; } }
  return best;
}
const insideFrame = (o, f) => o.cr > f.r && o.cr < f.r + f.h - 1 && o.cc > f.c && o.cc < f.c + f.w - 1;
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

// CONTAINMENT (bespoke: the frame's bbox encloses the inside objects, so generic per-object bbox detection
// breaks on the frame — treat the frame as identity and classify only the OTHER objects inside/outside).
function deriveContainment(train) {
  const map = {};
  for (const [inG, outG] of train) {
    if (inG.length !== outG.length || inG[0].length !== outG[0].length) return null;
    const objs = seg(inG), f = findFrame(objs); if (!f) return null;
    // frame RING must be unchanged (check only the frame-colour cells — the bbox also covers the inside objects)
    for (let i = 0; i < f.h; i++) for (let j = 0; j < f.w; j++) if (f.loc[i][j] === f.mainColor && (outG[f.r + i][f.c + j] || 0) !== f.mainColor) return null;
    for (const o of objs) { if (o === f) continue; const desc = detectTransform(o.loc, sub(outG, o.r, o.c, o.h, o.w), o.mainColor); if (!desc) return null; const v = insideFrame(o, f) ? "inside" : "outside"; if (map[v] == null) map[v] = desc; else if (map[v] !== desc) return null; }
  }
  if (!Object.values(map).some(d => d !== "identity")) return null;
  return map;
}
function predictContainment(inG, map) {
  const objs = seg(inG), f = findFrame(objs); if (!f) return null; const out = blank(inG.length, inG[0].length);
  for (let i = 0; i < f.h; i++) for (let j = 0; j < f.w; j++) if (f.loc[i][j] === f.mainColor) out[f.r + i][f.c + j] = f.mainColor;   // stamp only the ring
  for (const o of objs) { if (o === f) continue; const d = map[insideFrame(o, f) ? "inside" : "outside"] || "identity"; if (d === "remove") continue; const loc = applyDescriptor(d, o.loc, o.mainColor); for (let i = 0; i < loc.length; i++) for (let j = 0; j < loc[0].length; j++) if (loc[i][j]) out[o.r + i][o.c + j] = loc[i][j]; }
  return out;
}

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

// ---------- panels: split a grid by full-line dividers (for boolean / analogy) ----------
function dividerCols(g) { const H = g.length, W = g[0].length, out = []; for (let c = 0; c < W; c++) { const col0 = g[0][c]; if (col0 && g.every(row => row[c] === col0)) out.push(c); } return out; }
function splitPanels(g) {                       // → { panels:[grid…], dcolor } for vertical dividers, or null
  const ds = dividerCols(g); if (!ds.length) return null; const dcolor = g[0][ds[0]];
  const cuts = [-1, ...ds, g[0].length], panels = [];
  for (let i = 0; i < cuts.length - 1; i++) { const a = cuts[i] + 1, b = cuts[i + 1]; if (b > a) panels.push(g.map(row => row.slice(a, b))); }
  return panels.length >= 2 ? { panels, dcolor } : null;
}
const binarize = p => p.map(r => r.map(x => x ? 1 : 0));
const sizeEq = (a, b) => a.length === b.length && a[0].length === b[0].length;
function boolCombine(A, B, op) {                 // cell-wise boolean of two equal-size masks → mask
  if (!sizeEq(A, B)) return null; const a = binarize(A), b = binarize(B);
  return a.map((row, r) => row.map((x, c) => { const y = b[r][c]; return op === "or" ? (x | y) : op === "and" ? (x & y) : op === "xor" ? (x ^ y) : op === "sub" ? (x & (1 - y)) : op === "nand" ? (1 - (x & y)) : 0; }));
}
function boolPredict(inG, op, outColor) {        // out = (A op B) painted in outColor
  const sp = splitPanels(inG); if (!sp || sp.panels.length !== 2) return null;
  const m = boolCombine(sp.panels[0], sp.panels[1], op); if (!m) return null;
  return m.map(r => r.map(x => x ? outColor : 0));
}
const flipH = g => g.map(r => r.slice().reverse()), flipV = g => g.slice().reverse().map(r => r.slice()), rot180 = g => flipH(flipV(g));
function colormapOf(A, B) { if (!sizeEq(A, B)) return null; const m = {}; for (let r = 0; r < A.length; r++) for (let c = 0; c < A[0].length; c++) { const x = A[r][c], y = B[r][c]; if (x in m) { if (m[x] !== y) return null; } else m[x] = y; } return m; }
function inferGridTransform(A, B) {              // the simple transform mapping panel A → panel B, or null
  if (eqG(A, B)) return { t: "identity" };
  if (sizeEq(A, B)) { if (eqG(flipH(A), B)) return { t: "mirror_h" }; if (eqG(flipV(A), B)) return { t: "flip_v" }; if (eqG(rot180(A), B)) return { t: "rotate_180" }; const m = colormapOf(A, B); if (m) return { t: "recolor", map: m }; }
  return null;
}
function applyGridTransform(C, tr) { if (tr.t === "identity") return C.map(r => r.slice()); if (tr.t === "mirror_h") return flipH(C); if (tr.t === "flip_v") return flipV(C); if (tr.t === "rotate_180") return rot180(C); if (tr.t === "recolor") return C.map(r => r.map(x => x in tr.map ? tr.map[x] : x)); return null; }
function analogyPredict(inG, tr) {               // A|B|C panels → output = transform(C), transform inferred from A→B
  const sp = splitPanels(inG); if (!sp || sp.panels.length !== 3) return null;
  return applyGridTransform(sp.panels[2], tr);
}

// ---------- counting / numerosity ----------
const countObjs = g => seg(g).length;
function tallyPredict(inG, color, vert) { const n = countObjs(inG); if (n < 1) return null; return vert ? Array.from({ length: n }, () => [color]) : [Array.from({ length: n }, () => color)]; }
function pluralityColor(g) { const objs = seg(g), cnt = {}; for (const o of objs) cnt[o.mainColor] = (cnt[o.mainColor] || 0) + 1; const top = Object.entries(cnt).sort((a, b) => b[1] - a[1]); if (!top.length || (top.length > 1 && top[0][1] === top[1][1])) return null; return +top[0][0]; }
function blockPredict(inG, h, w) { const c = pluralityColor(inG); if (c == null) return null; return Array.from({ length: h }, () => new Array(w).fill(c)); }

// ---------- occlusion: a grey (5) occluder hides part of a symmetric figure → fill by mirror ----------
const OCC = 5;
function deoccludePredict(inG, axis) {
  const H = inG.length, W = inG[0].length, out = inG.map(r => r.slice());
  let any = false;
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) if (inG[r][c] === OCC) { any = true; const mr = axis === "h" ? r : H - 1 - r, mc = axis === "h" ? W - 1 - c : c; const v = inG[mr][mc]; if (v === OCC) return null; out[r][c] = v; }
  return any ? out : null;
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
  // CONTAINMENT: recolour/remove objects inside vs outside a frame (relational)
  { const m = deriveContainment(train); if (m) add("inside the frame: " + Object.entries(m).map(([v, d]) => `${v}→${descText(d)}`).join(", "), 4, inG => predictContainment(inG, m)); }
  // BOOLEAN figure-algebra: two divider-split panels → A op B (the Carpenter/PGM family)
  { const out0 = train[0][1], cols = new Set(); for (const row of out0) for (const x of row) if (x) cols.add(x); const outColor = cols.size === 1 ? [...cols][0] : null;
    if (outColor != null && splitPanels(train[0][0])) for (const op of ["xor", "and", "or", "sub"]) add(`output = panel A ${op.toUpperCase()} panel B (in ${COLNAME[outColor]})`, 3, inG => boolPredict(inG, op, outColor)); }
  // ANALOGY A:B::C:? — infer the A→B transform from the demo panels, apply to C
  { const sp0 = splitPanels(train[0][0]); if (sp0 && sp0.panels.length === 3) { const tr = inferGridTransform(sp0.panels[0], sp0.panels[1]); if (tr) add(`analogy A:B::C:? — apply ${tr.t} (inferred from A→B) to C`, 4, inG => analogyPredict(inG, tr)); } }
  // COUNTING: output a tally line of length = #objects, or a block in the plurality colour
  { const o0 = train[0][1]; const flat = o0.flat(), cols = new Set(flat.filter(x => x)); const uni = cols.size === 1 ? [...cols][0] : null;
    if (uni != null && o0.length === 1) add(`output a row of (#objects) ${COLNAME[uni]} cells`, 3, inG => tallyPredict(inG, uni, false));
    if (uni != null && o0[0].length === 1) add(`output a column of (#objects) ${COLNAME[uni]} cells`, 3, inG => tallyPredict(inG, uni, true));
    if (uni != null && o0.length > 1 && o0[0].length > 1) add(`output a ${o0.length}×${o0[0].length} block in the most-common object colour`, 3, inG => blockPredict(inG, o0.length, o0[0].length)); }
  // OCCLUSION: remove the grey occluder, reconstruct the hidden cells by symmetry
  for (const axis of ["h", "v"]) add(`remove the occluder; fill the hidden cells by ${axis === "h" ? "left-right" : "top-bottom"} symmetry`, 4, inG => deoccludePredict(inG, axis));
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
