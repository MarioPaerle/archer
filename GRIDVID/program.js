#!/usr/bin/env node
/* program.js — TYPED OBJECT-LEVEL COMBINATOR LAYER (PAN-119, DESIGN/gridworld-foundation-v0 §2).
 *
 * The breadth lever: an object-level scene model + first-class typed combinators
 * (seq / parallel / overlay / mask / dispatch / bind / repeat) over selectors,
 * predicates and transforms. Unlike the whole-grid families in gen_hard (which
 * each emit a finished grid), this layer reasons about OBJECTS, so a rule can act
 * on a SUBSET of the same grid — e.g. dispatch(key=color){ red: fall } is literally
 * "gravity only on red objects". Every node is a serialisable tagged descriptor, so
 * a program compiles to BOTH a rendered (IN,OUT) task AND a program.json tree
 * (provenance / concepts / relations / difficulty / training targets).
 *
 *   node program.js --self-test
 *   node program.js --demo gravity_on_red        # print one task's IN/OUT
 *   node program.js --list                        # demo program library
 */
const crypto = require("crypto");
const E = require("./engine.js");
const B = require("./baseline.js");
const SKN = require("./skins.js");   // internal-pattern skins (stripe/checker/cross/…) for more visual variety

// ============================================================ cell / grid utils
const blank = (H, W) => Array.from({ length: H }, () => new Array(W).fill(0));
const bbox = cells => { let h = 0, w = 0; for (const [r, c] of cells) { if (r + 1 > h) h = r + 1; if (c + 1 > w) w = c + 1; } return [h, w]; };
const shapeCells = (kind, s) => kind === "frame" || kind === "ring" ? E.buildShape(kind === "ring" ? "ring" : "frame", kind === "frame" ? [s, s] : [s]) : E.buildShape(kind, [s]);
const flipHcells = cells => { const [, w] = bbox(cells); return cells.map(([r, c]) => [r, w - 1 - c]); };
const flipVcells = cells => { const [h] = bbox(cells); return cells.map(([r, c]) => [h - 1 - r, c]); };
const rot180cells = cells => { const [h, w] = bbox(cells); return cells.map(([r, c]) => [h - 1 - r, w - 1 - c]); };
const rot90cells = cells => { const [h] = bbox(cells); return cells.map(([r, c]) => [c, h - 1 - r]); };   // 90° CW
const outlineOf = cells => { const set = new Set(cells.map(([r, c]) => r + "," + c)); return cells.filter(([r, c]) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dr, dc]) => !set.has((r + dr) + "," + (c + dc)))); };
const rectCells = (h, w) => { const o = []; for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) o.push([r, c]); return o; };
const area = o => o.cells.length;
const absCells = o => o.cells.map(([dr, dc]) => [o.r + dr, o.c + dc]);
const centerOf = o => { const [h, w] = bbox(o.cells); return [o.r + (h - 1) / 2, o.c + (w - 1) / 2]; };
const HOLED = new Set(["frame", "ring"]);

function renderScene(scene) {
  const g = blank(scene.H, scene.W);
  for (const o of scene.objects) {
    if (o.skin && o.skin !== "plain" && o.accent != null) {   // paint an internal pattern (body + accent) over the footprint
      for (const [dr, dc, col] of SKN.skinnedCells(o.cells, o.skin, o.color, o.accent)) { const r = o.r + dr, c = o.c + dc; if (col && r >= 0 && c >= 0 && r < scene.H && c < scene.W) g[r][c] = col; }
    } else {
      for (const [r, c] of absCells(o)) if (r >= 0 && c >= 0 && r < scene.H && c < scene.W) g[r][c] = o.color;
    }
    if (o.core != null) { const [h, w] = bbox(o.cells), rr = o.r + (h >> 1), cc = o.c + (w >> 1); if (rr < scene.H && cc < scene.W) g[rr][cc] = o.core; }   // core overwrites centre cell
  }
  return g;
}
const cloneObj = o => ({ ...o, cells: o.cells.map(p => p.slice()) });
const cloneScene = s => ({ H: s.H, W: s.W, bg: s.bg || 0, objects: s.objects.map(cloneObj) });

// ============================================================ selectors / predicates / keys / regions
const SIZE_THR = 6;   // area ≥ THR ⇒ "large"
function sizeClass(o) { return area(o) >= SIZE_THR ? "large" : "small"; }
function quadrantOf(o, H, W) { const [r, c] = centerOf(o); return (r < H / 2 ? "T" : "B") + (c < W / 2 ? "L" : "R"); }
function hasHole(o) { return HOLED.has(o.kind); }
function orientationOf(o) { const [h, w] = bbox(o.cells); return h > w ? "tall" : w > h ? "wide" : "square"; }

// key(descriptor).of(obj, scene) → primitive value used by dispatch
function keyOf(key, o, scene) {
  switch (key.k) {
    case "color": return o.color;
    case "core_color": return o.core != null ? o.core : "none";
    case "size_class": return sizeClass(o);
    case "shape_kind": return o.kind;
    case "quadrant": return quadrantOf(o, scene.H, scene.W);
    case "has_hole": return hasHole(o) ? "holed" : "solid";
    case "orientation": return orientationOf(o);
    case "size_rank": { const areas = scene.objects.map(area), mx = Math.max(...areas), mn = Math.min(...areas), a = area(o); return a === mx ? "largest" : a === mn ? "smallest" : "mid"; }
    case "marker": return o.marker != null ? o.marker : "none";
    default: throw new Error("unknown key " + key.k);
  }
}

function inRegion(region, o, scene) {
  const [r, c] = centerOf(o), { H, W } = scene;
  switch (region.reg) {
    case "half": return region.side === "left" ? c < W / 2 : region.side === "right" ? c >= W / 2 : region.side === "top" ? r < H / 2 : r >= H / 2;
    case "quadrant": return quadrantOf(o, H, W) === region.q;
    case "rect": return r >= region.r0 && r <= region.r1 && c >= region.c0 && c <= region.c1;
    default: throw new Error("unknown region " + region.reg);
  }
}

// selector(descriptor) → predicate(obj, scene)
function selPred(sel) {
  switch (sel.s) {
    case "all": return () => true;
    case "by_color": return o => o.color === sel.color;
    case "by_core": return o => o.core === sel.color;
    case "by_size": return o => sizeClass(o) === sel.cls;
    case "by_kind": return o => o.kind === sel.kind;
    case "has_hole": return o => hasHole(o) === (sel.holed !== false);
    case "in_region": return (o, scene) => inRegion(sel.region, o, scene);
    case "by_orientation": return o => orientationOf(o) === sel.orient;
    case "largest": { let max = -1; return (o, scene) => { if (max < 0) max = Math.max(...scene.objects.map(area)); return area(o) === max; }; }
    case "smallest": { let min = -1; return (o, scene) => { if (min < 0) min = Math.min(...scene.objects.map(area)); return area(o) === min; }; }
    default: throw new Error("unknown selector " + sel.s);
  }
}

// ============================================================ transforms (tagged, serialisable)
// pure per-object transforms mutate obj in place; 'fall' & 'remove' are handled by the executor.
const GRAV = { down: [1, 0], up: [-1, 0], left: [0, -1], right: [0, 1] };
// resolve a RELATIONAL reference object (the rule's "anchor") → a snapshot the later steps depend on. This is
// what makes a rule DEEP rather than wide: the anchor's identity/colour/shape drives what happens to the rest.
const sigOf = o => o.cells.map(([r, c]) => r + "," + c).sort().join(";");
function resolveRef(pick, scene) {
  const objs = scene.objects.filter(o => !o._removed); if (!objs.length) return null;
  let o = null;
  if (pick === "largest") { const m = Math.max(...objs.map(area)), k = objs.filter(x => area(x) === m); o = k.length === 1 ? k[0] : null; }
  else if (pick === "smallest") { const m = Math.min(...objs.map(area)), k = objs.filter(x => area(x) === m); o = k.length === 1 ? k[0] : null; }
  else if (pick === "unique_color") { const c = {}; objs.forEach(x => c[x.color] = (c[x.color] || 0) + 1); const u = objs.filter(x => c[x.color] === 1); o = u.length === 1 ? u[0] : null; }
  else if (pick === "unique_shape") { const c = {}; objs.forEach(x => c[sigOf(x)] = (c[sigOf(x)] || 0) + 1); const u = objs.filter(x => c[sigOf(x)] === 1); o = u.length === 1 ? u[0] : null; }
  else if (pick === "holed") { const u = objs.filter(x => HOLED.has(x.kind)); o = u.length === 1 ? u[0] : null; }
  if (!o) return null;
  const [h, w] = bbox(o.cells);
  return { color: o.color, core: o.core, cells: o.cells.map(c => c.slice()), kind: o.kind, cr: o.r + (h - 1) / 2, cc: o.c + (w - 1) / 2 };
}
function applyPure(t, o, scene, env = {}) {
  switch (t.t) {
    case "identity": return;
    case "recolor": o.color = t.color; return;
    case "recolor_core": o.core = t.color; return;
    case "swap_color": if (o.color === t.from) o.color = t.to; return;
    case "mirror_h": o.cells = flipHcells(o.cells); return;
    case "flip_v": o.cells = flipVcells(o.cells); return;
    case "rotate_90": o.cells = rot90cells(o.cells); return;
    case "rotate_180": o.cells = rot180cells(o.cells); return;
    case "outline": o.cells = outlineOf(o.cells); o.kind = "outline"; return;
    case "fill_hole": o.cells = rectCells(...bbox(o.cells)); o.kind = "square"; return;
    case "translate": { const [bh, bw] = bbox(o.cells); o.r = Math.max(0, Math.min(scene.H - bh, o.r + (t.dr || 0))); o.c = Math.max(0, Math.min(scene.W - bw, o.c + (t.dc || 0))); return; }
    case "remove": o._removed = true; return;
    case "fall": o._fall = true; o._falldir = t.dir || "down"; return;   // executed in the gravity pass
    // ---- RELATIONAL (depth): act on o using the bound reference object env[ref] ----
    case "recolor_to": { const r = env[t.ref]; if (r) o.color = r.color; return; }          // take the anchor's colour
    case "copy_shape": { const r = env[t.ref]; if (r) { o.cells = r.cells.map(c => c.slice()); o.kind = r.kind; } return; }   // morph into the anchor's shape
    case "reflect_pos": { const r = env[t.ref]; if (r) { const [bh, bw] = bbox(o.cells); if (t.axis === "v") o.r = Math.round(2 * r.cr - o.r - (bh - 1)); else o.c = Math.round(2 * r.cc - o.c - (bw - 1)); o.r = Math.max(0, Math.min(scene.H - bh, o.r)); o.c = Math.max(0, Math.min(scene.W - bw, o.c)); } return; }   // mirror position across the anchor
    default: throw new Error("unknown transform " + t.t);
  }
}

// slide every _fall object along its direction until it rests on the wall or on an occupied cell of a
// NON-falling object / already-settled faller (no merge). Grouped by direction; leading-edge first.
function gravityPass(scene) {
  const fallers = scene.objects.filter(o => o._fall && !o._removed);
  if (!fallers.length) return;
  const occ = new Set();
  for (const o of scene.objects.filter(o => !o._fall && !o._removed)) for (const [r, c] of absCells(o)) occ.add(r + "," + c);
  const byDir = {}; for (const o of fallers) (byDir[o._falldir || "down"] = byDir[o._falldir || "down"] || []).push(o);
  for (const [dir, group] of Object.entries(byDir)) {
    const [vr, vc] = GRAV[dir] || GRAV.down, proj = o => Math.max(...absCells(o).map(([r, c]) => r * vr + c * vc));
    group.sort((a, b) => proj(b) - proj(a));
    for (const o of group) {
      let d = 0;
      for (; ;) {
        const next = absCells(o).map(([r, c]) => [r + (d + 1) * vr, c + (d + 1) * vc]);
        if (next.some(([r, c]) => r < 0 || c < 0 || r >= scene.H || c >= scene.W || occ.has(r + "," + c))) break;
        d++;
      }
      o.r += d * vr; o.c += d * vc;
      for (const [r, c] of absCells(o)) occ.add(r + "," + c);
      delete o._fall; delete o._falldir;
    }
  }
}

// ============================================================ combinator interpreter
// applyNode(node, scene) → new scene. Nodes lower to a per-object transform assignment + a gravity pass.
function applyNode(node, scene, env = {}) {
  let s = cloneScene(scene);
  switch (node.op) {
    case "bind": { const r = resolveRef(node.pick, s); if (r) env[node.name] = r; return s; }   // capture the anchor for later steps
    // INTRINSIC COMPLEXITY (P1, symbol grounding): DERIVE a colour map from an in-scene LEGEND (paired swatches in
    // the first two columns: col-0 src ↔ col-1 tgt at the same row), then a later step CONSUMES it. The map is NOT
    // in the program — the model must READ it off the grid (and it varies per example) ⇒ a genuinely deep 1-rule.
    case "derive": {
      const src = {}, tgt = {};
      for (const o of s.objects) { const [r, c] = centerOf(o).map(Math.round); if (c === 0) src[r] = o.color; else if (c === 1) tgt[r] = o.color; }
      const M = {}; for (const r of Object.keys(src)) if (tgt[r] != null) M[src[r]] = tgt[r];
      env[node.name] = { map: M }; return s;
    }
    case "apply_map": {                              // recolour the WORK objects (right of the legend) by the derived map
      const M = (env[node.map] || {}).map || {};
      for (const o of s.objects) { if (centerOf(o)[1] <= 1.5) continue; if (o.color in M) o.color = M[o.color]; }
      return s;
    }
    case "erase_legend": {                            // drop the legend region (col 0..1) — the "instructions" are consumed
      s.objects = s.objects.filter(o => centerOf(o)[1] > 1.5); return s;
    }
    // INTRINSIC COMPLEXITY (topology): DERIVE the containment relation (which frame encloses each object), then a
    // later step CONSUMES it. You must compute inside/outside off the grid — a genuinely deep single rule.
    case "derive_containment": {
      const frames = s.objects.filter(o => HOLED.has(o.kind)), C = {};
      for (const o of s.objects) { if (HOLED.has(o.kind)) continue; const [cr, cc] = centerOf(o);
        for (const F of frames) { const [fh, fw] = bbox(F.cells); if (cr > F.r && cr < F.r + fh - 1 && cc > F.c && cc < F.c + fw - 1) { C[o.id] = F.color; break; } } }
      env[node.name] = { contain: C }; return s;
    }
    case "apply_container": {                          // each ENCLOSED object takes its frame's colour (outside objects unchanged)
      const C = (env[node.map] || {}).contain || {};
      for (const o of s.objects) if (o.id in C) o.color = C[o.id];
      return s;
    }
    case "apply": {                               // apply ONE transform to a selected subset
      const pred = selPred(node.sel);
      for (const o of s.objects) if (pred(o, s)) applyPure(node.transform, o, s, env);
      gravityPass(s); s.objects = s.objects.filter(o => !o._removed); return s;
    }
    case "dispatch": {                            // per-object route by key → case transform (THE long tail)
      for (const o of s.objects) {
        const v = keyOf(node.key, o, s);
        const t = (node.cases && Object.prototype.hasOwnProperty.call(node.cases, v)) ? node.cases[v] : (node.default || { t: "identity" });
        applyPure(t, o, s, env);
      }
      gravityPass(s); s.objects = s.objects.filter(o => !o._removed); return s;
    }
    case "mask": {                                // apply a sub-node only to objects inside a region
      const keep = s.objects.filter(o => !inRegion(node.region, o, s));
      const inside = { H: s.H, W: s.W, bg: s.bg, objects: s.objects.filter(o => inRegion(node.region, o, s)) };
      const done = applyNode(node.node, inside, env);
      return { H: s.H, W: s.W, bg: s.bg, objects: keep.concat(done.objects) };
    }
    case "seq": { let acc = s; for (const step of node.steps) acc = applyNode(step, acc, env); return acc; }
    case "parallel": {                            // branches must touch DISJOINT objects (asserted by caller via regions/selectors)
      let acc = cloneScene(s);
      for (const br of node.branches) acc = applyNode(br, acc, env);   // sequential; disjointness keeps it order-independent
      return acc;
    }
    case "repeat": { let acc = s; for (let i = 0; i < node.n; i++) acc = applyNode(node.node, acc, env); return acc; }
    case "overlay": {                             // stamp extra objects on top (e.g. a marker layer / second concept)
      return { H: s.H, W: s.W, bg: s.bg, objects: s.objects.concat((node.objects || []).map(cloneObj)) };
    }
    default: throw new Error("unknown node op " + node.op);
  }
}

// ============================================================ scene sampler
const KINDS_SOLID = ["square", "plus", "Lshape", "triangle", "diamond", "Tshape", "notch"];
// MUCH wider shape vocabulary (the engine knows 23) + the skin (internal-pattern) palette → far more variety.
const KINDS_RICH = ["square", "plus", "Lshape", "Tshape", "triangle", "diamond", "notch", "bump", "Ushape", "Cshape", "Hshape", "Zshape", "stair", "arrow", "fork", "bridge", "key", "disc"];
const KINDS_HOLED = ["frame", "ring", "Cshape", "Ushape", "Hshape"];
const SKINS_LIST = ["core", "border", "cross", "stripe", "checker", "diag", "split", "quadrants"];
const SKINNABLE = new Set(["square", "diamond", "disc", "rect"]);   // skins read cleanly only on solid convex shapes
const FULL_PALETTE = [1, 2, 3, 4, 6, 7, 8, 9];
function placeNoOverlap(rng, H, W, specs, gap = 1, upperFrac = 1) {
  const occ = blank(H, W), out = [];
  const free = (cells, r, c) => { for (const [dr, dc] of cells) { const rr = r + dr, cc = c + dc; if (rr < 0 || cc < 0 || rr >= H || cc >= W) return false; for (let a = -gap; a <= gap; a++) for (let b = -gap; b <= gap; b++) { const nr = rr + a, nc = cc + b; if (nr >= 0 && nc >= 0 && nr < H && nc < W && occ[nr][nc]) return false; } } return true; };
  for (const sp of specs) {
    const [bh, bw] = bbox(sp.cells); let placed = false;
    const c0 = sp.cBand ? sp.cBand[0] : 0, c1 = sp.cBand ? Math.min(sp.cBand[1], W - bw) : W - bw;
    for (let t = 0; t < 200 && !placed; t++) {
      const r = rng.int(0, Math.max(0, Math.floor((H - bh) * upperFrac))), c = rng.int(Math.max(0, Math.min(c0, c1)), Math.max(0, c1));
      if (free(sp.cells, r, c)) { for (const [dr, dc] of sp.cells) occ[r + dr][c + dc] = 1; out.push({ ...sp, r, c }); placed = true; }
    }
  }
  return out;
}

// generic varied scene: K objects, varied shape/size/colour, optional core / marker / holed mix.
function sampleScene(rng, opts = {}) {
  const H = opts.H || rng.int(14, 20), W = opts.W || rng.int(14, 20), K = opts.K || rng.int(3, 5);
  const palette = opts.palette || [2, 3, 4, 6, 7, 8];
  const kinds = opts.kinds || KINDS_SOLID;
  const cols = []; for (let i = 0; i < K; i++) cols.push(palette[rng.int(0, palette.length - 1)]);
  const specs = [];
  const holedKinds = opts.holedKinds || KINDS_HOLED;
  for (let i = 0; i < K; i++) {
    const kind = opts.holedMix && i % 2 === 0 ? holedKinds[rng.int(0, holedKinds.length - 1)] : kinds[rng.int(0, kinds.length - 1)];
    const s = opts.sizes ? opts.sizes[i % opts.sizes.length] : (opts.size || rng.int(2, 4));
    const sp = { cells: shapeCells(kind, s), color: cols[i], kind };
    if (opts.withCore) sp.core = (opts.corePalette || [2, 1, 3])[rng.int(0, (opts.corePalette || [2, 1, 3]).length - 1)];
    if (opts.withMarker) sp.marker = rng.int(0, (opts.markers || 2) - 1);
    // INTERNAL-PATTERN SKIN (stripe/checker/cross/…) on solid shapes → far more visual variety
    if (opts.skinFrac && SKINNABLE.has(kind) && rng.int(0, 99) < opts.skinFrac * 100) {
      const skins = opts.skins || SKINS_LIST; sp.skin = skins[rng.int(0, skins.length - 1)];
      const acc = opts.accentPalette || [1, 5, 8, 9]; let a = acc[rng.int(0, acc.length - 1)]; if (a === sp.color) a = a === 1 ? 9 : 1; sp.accent = a;
    }
    if (opts.spreadHalves) sp.cBand = i % 2 === 0 ? [0, Math.floor(W / 2) - 1] : [Math.ceil(W / 2), W];   // populate BOTH halves
    specs.push(sp);
  }
  // ensure a dispatch key actually VARIES so the rule is non-trivial
  if (opts.ensureColors) { const need = opts.ensureColors; need.forEach((c, i) => { if (specs[i]) specs[i].color = c; }); }
  if (opts.ensureCores) { const need = opts.ensureCores; need.forEach((c, i) => { if (specs[i]) specs[i].core = c; }); }
  const objs = placeNoOverlap(rng, H, W, specs, opts.gap == null ? 1 : opts.gap, opts.upperFrac || 1);
  objs.forEach((o, i) => o.id = "o" + i);
  return { H, W, bg: 0, objects: objs };
}

// ============================================================ program.json (provenance / labels / targets)
function serializeNode(node) {
  const j = { op: node.op };
  if (node.sel) j.sel = node.sel; if (node.transform) j.transform = node.transform;
  if (node.key) j.key = node.key; if (node.cases) j.cases = node.cases; if (node.default) j.default = node.default;
  if (node.region) j.region = node.region; if (node.node) j.node = serializeNode(node.node);
  if (node.steps) j.steps = node.steps.map(serializeNode); if (node.branches) j.branches = node.branches.map(serializeNode);
  if (node.n != null) j.n = node.n; if (node.objects) j.objects = node.objects.length + " overlay-objs";
  if (node.name) j.name = node.name; if (node.map) j.map = node.map; if (node.pick) j.pick = node.pick;
  return j;
}
function nodeDepth(node) {
  if (node.op === "seq") return 1 + Math.max(0, ...node.steps.map(nodeDepth));
  if (node.op === "parallel") return 1 + Math.max(0, ...node.branches.map(nodeDepth));
  if (node.op === "mask" || node.op === "repeat") return 1 + nodeDepth(node.node);
  return 1;
}
// INTRINSIC difficulty (Mario: reward the DEPTH of one rule, NOT the count of parallel rules). Measures the
// longest data-dependency chain (a step CONSUMING a value an earlier step's execution produced over the same
// grid) + symbol-grounding + contextuality. Rule-count terms (nObjects, dispatch-branches) are DELETED.
function intrinsicMetrics(node) {
  const steps = node.op === "seq" ? node.steps : [node];
  const produced = {}; let dchain = 1, S = 0, contextual = 0, chainLen = 0;
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i]; let produces = false, consumes = false;
    if (s.op === "bind" || s.op === "derive" || s.op === "derive_containment") { produced[s.name] = i; produces = true; if (s.op !== "bind") S++; }
    if (s.op === "apply" && s.transform && s.transform.ref != null) { consumes = produced[s.transform.ref] != null; }
    if (s.op === "apply_map" || s.op === "apply_container") { consumes = true; S++; }
    if (s.op === "erase_legend") consumes = true;
    if (s.op === "dispatch") contextual++;
    if (produces || consumes) chainLen++; else chainLen = 0;
    if (chainLen > dchain) dchain = chainLen;
  }
  const score = +(1 - Math.exp(-(0.9 * (dchain - 1) + 0.7 * S + 0.4 * contextual) / 3)).toFixed(2);
  // clamp: a flat rule with no dependency chain is EASY no matter how many parallel branches it has
  return { Dchain: dchain, S, contextual, score: dchain === 1 ? Math.min(score, 0.35) : score };
}
function dispatchBranches(node) {
  if (node.op === "dispatch") return Object.keys(node.cases || {}).length + 1;
  if (node.op === "seq") return node.steps.reduce((a, n) => a + dispatchBranches(n), 0);
  if (node.op === "parallel") return node.branches.reduce((a, n) => a + dispatchBranches(n), 0);
  if (node.op === "mask" || node.op === "repeat") return dispatchBranches(node.node);
  return 0;
}
function sceneRelations(scene) {
  const byColor = {}; scene.objects.forEach(o => { (byColor[o.color] = byColor[o.color] || []).push(o.id); });
  const sameColor = Object.entries(byColor).filter(([, ids]) => ids.length > 1).map(([col, ids]) => ({ rel: "same_color", color: +col, ids }));
  return sameColor;
}
function objectMeta(scene) {
  return scene.objects.map(o => ({ id: o.id, kind: o.kind, color: o.color, core: o.core != null ? o.core : null, area: area(o), center: centerOf(o).map(x => +x.toFixed(1)) }));
}

// ============================================================ AST → NL + DSL-text (the aligned rule labels)
// NL ≡ DSL by construction: nlNode is a total linearisation of the same AST the engine executes.
const _CN = { 1: "blue", 2: "red", 3: "green", 4: "yellow", 5: "grey", 6: "magenta", 7: "orange", 8: "cyan", 9: "maroon" };
function nlSel(sel) {
  if (!sel) return "every object";
  switch (sel.s) {
    case "all": return "every object"; case "largest": return "the largest object"; case "smallest": return "the smallest object";
    case "by_size": return "the " + sel.cls + " objects"; case "by_color": return "the " + (_CN[sel.color] || sel.color) + " objects";
    case "by_kind": return "the " + sel.kind + "s"; case "has_hole": return sel.holed !== false ? "the hollow objects" : "the solid objects";
    case "in_region": return "objects in the " + (sel.region && sel.region.side || "region") + " half"; case "by_orientation": return "the " + sel.orient + " objects";
    default: return "the selected objects";
  }
}
function nlTransform(t) {
  if (!t) return "is left unchanged";
  switch (t.t) {
    case "identity": return "is left unchanged"; case "recolor": return "is recoloured " + (_CN[t.color] || t.color);
    case "recolor_core": return "gets a " + (_CN[t.color] || t.color) + " core"; case "swap_color": return "swaps its colours";
    case "mirror_h": return "is mirrored left-right"; case "flip_v": return "is flipped top-bottom";
    case "rotate_90": return "is rotated 90°"; case "rotate_180": return "is rotated 180°";
    case "outline": return "is outlined (hollowed)"; case "fill_hole": return "is filled solid";
    case "translate": return "is shifted"; case "remove": return "is removed"; case "fall": return "falls " + (t.dir || "down");
    case "recolor_to": return "takes the anchor's colour"; case "copy_shape": return "morphs into the anchor's shape"; case "reflect_pos": return "is mirrored across the anchor";
    default: return "is transformed (" + t.t + ")";
  }
}
const _ANCHOR = { largest: "the largest object", smallest: "the smallest object", unique_color: "the uniquely-coloured object", unique_shape: "the odd-shaped object", holed: "the hollow object" };
function nlNode(node) {
  if (!node) return "";
  switch (node.op) {
    case "bind": return "find " + (_ANCHOR[node.pick] || node.pick);
    case "derive": return "read the legend in the left margin (a colour map: each src swatch → its target)";
    case "apply_map": return "recolour every object according to that legend";
    case "erase_legend": return "erase the legend";
    case "derive_containment": return "work out which frame ENCLOSES each object (inside vs outside)";
    case "apply_container": return "recolour every enclosed object to the colour of the frame around it";
    case "apply": return nlSel(node.sel) + " " + nlTransform(node.transform);
    case "dispatch": { const k = node.key && node.key.k || "property"; const cs = Object.entries(node.cases || {}).map(([v, t]) => (_CN[v] || v) + " → " + nlTransform(t)); return "each object, by its " + k + ": " + cs.join("; "); }
    case "mask": return "within the " + (node.region && node.region.side || node.region && node.region.q || "region") + ", " + nlNode(node.node);
    case "seq": return node.steps.map((s, i) => (i === 0 ? "First " : "then ") + nlNode(s)).join("; ");
    case "parallel": return node.branches.map(nlNode).join(", and in parallel ");
    case "repeat": return "repeat " + node.n + "×: " + nlNode(node.node);
    case "overlay": return "overlay extra objects";
    default: return node.op;
  }
}
function dslText(node) {
  if (!node) return "";
  const a = x => JSON.stringify(x).replace(/"/g, "");
  switch (node.op) {
    case "bind": return "bind(" + node.name + "=" + node.pick + ")";
    case "derive": return "derive(" + node.name + "=legend)";
    case "apply_map": return "apply_map(" + node.map + ")";
    case "erase_legend": return "erase_legend";
    case "derive_containment": return "derive(" + node.name + "=containment)";
    case "apply_container": return "apply_container(" + node.map + ")";
    case "apply": return "apply(" + (node.sel ? (node.sel.s + (node.sel.color != null ? ":" + node.sel.color : node.sel.cls ? ":" + node.sel.cls : "")) : "all") + ", " + (node.transform ? node.transform.t + (node.transform.color != null ? ":" + node.transform.color : node.transform.dir ? ":" + node.transform.dir : node.transform.ref ? ":" + node.transform.ref : "") : "identity") + ")";
    case "dispatch": return "dispatch(" + (node.key && node.key.k) + "){" + Object.entries(node.cases || {}).map(([v, t]) => v + ":" + t.t + (t.dir ? ":" + t.dir : t.color != null ? ":" + t.color : "")).join(",") + "}";
    case "mask": return "mask(" + a(node.region) + ", " + dslText(node.node) + ")";
    case "seq": return "seq(" + node.steps.map(dslText).join(" ▷ ") + ")";
    case "parallel": return "parallel(" + node.branches.map(dslText).join(" | ") + ")";
    case "repeat": return "repeat(" + node.n + ", " + dslText(node.node) + ")";
    default: return node.op;
  }
}
// focusOf — the cells a SELECTION/DERIVE step is "looking at", to be HIGHLIGHTED IN WHITE in the trace, the way a
// human points at the objects they're reasoning about (bind = the anchor; derive = the legend; derive_containment
// = the frames; apply = the selected subset). Computed on the scene the step reads (its grid is unchanged).
function focusOf(step, scene) {
  const out = [], add = o => { for (const [dr, dc] of o.cells) { const r = o.r + dr, c = o.c + dc; if (r >= 0 && c >= 0 && r < scene.H && c < scene.W) out.push([r, c]); } };
  try {
    if (step.op === "bind") {
      const objs = scene.objects.filter(o => !o._removed), sig = o => o.cells.map(([r, c]) => r + "," + c).sort().join(";");
      let a = null, uni = (arr, keyf) => { const c = {}; arr.forEach(x => c[keyf(x)] = (c[keyf(x)] || 0) + 1); const u = arr.filter(x => c[keyf(x)] === 1); return u.length === 1 ? u[0] : null; };
      if (step.pick === "largest") { const m = Math.max(...objs.map(area)), k = objs.filter(x => area(x) === m); a = k.length === 1 ? k[0] : null; }
      else if (step.pick === "smallest") { const m = Math.min(...objs.map(area)), k = objs.filter(x => area(x) === m); a = k.length === 1 ? k[0] : null; }
      else if (step.pick === "holed") { const k = objs.filter(x => HOLED.has(x.kind)); a = k.length === 1 ? k[0] : null; }
      else if (step.pick === "unique_color") a = uni(objs, x => x.color);
      else if (step.pick === "unique_shape") a = uni(objs, sig);
      if (a) add(a);
    } else if (step.op === "derive") { for (const o of scene.objects) if (centerOf(o)[1] <= 1.5) add(o); }
    else if (step.op === "derive_containment") { for (const o of scene.objects) if (HOLED.has(o.kind)) add(o); }
    else if (step.op === "apply" && step.sel && step.sel.s !== "all") { const pred = selPred(step.sel); for (const o of scene.objects) if (pred(o, scene)) add(o); }
  } catch (e) { }
  return out;
}
// runWithTrace — the KEYSTONE: execute a program while capturing the intermediate scene after each TOP-LEVEL
// step. For a `seq` this is the human "thinking-grids" trace, for free (the engine already computes each `acc`).
// Each step also carries `focus` (cells the selection/derive step is looking at → white-highlighted in the trace).
function runWithTrace(node, scene, env = {}) {
  const steps = [];
  if (node.op === "seq") {
    let acc = cloneScene(scene);
    for (const step of node.steps) { const focus = focusOf(step, acc); acc = applyNode(step, acc, env); steps.push({ op: step.op, nl: nlNode(step), dsl: dslText(step), scene: acc, focus }); }
    return { scene: acc, steps };
  }
  const focus = focusOf(node, scene), out = applyNode(node, scene, env);
  steps.push({ op: node.op, nl: nlNode(node), dsl: dslText(node), scene: out, focus });
  return { scene: out, steps };
}

// ============================================================ task builder
// two non-removed objects sharing a cell ⇒ they overwrite each other ⇒ the solution is AMBIGUOUS. Reject.
function sceneOverlap(scene) {
  const occ = new Set();
  for (const o of scene.objects) { if (o._removed) continue; for (const [r, c] of absCells(o)) { const k = r + "," + c; if (occ.has(k)) return true; occ.add(k); } }
  return false;
}
function buildProgramTask(prog, opts = {}) {
  const rng = E.makeRng((opts.seed || 1) * 2654435761 + 13);
  const nEx = opts.nEx || rng.int(3, 4), examples = [];
  const mkPair = () => { const inScene = prog.sampler(rng); const outScene = applyNode(prog.node, inScene); return { inScene, outScene, in: [renderScene(inScene)], out: [renderScene(outScene)] }; };
  let first = null, overlap = false;
  for (let i = 0; i < nEx; i++) { const p = mkPair(); if (!first) first = p; if (sceneOverlap(p.outScene)) overlap = true; examples.push({ in: p.in, out: p.out }); }
  const t = mkPair(); if (sceneOverlap(t.outScene)) overlap = true;
  // sensibility gate (same spirit as engine.validateTask): reject empty/near-empty outputs and trivial changes,
  // so program-first tasks are never degenerate (e.g. a dispatch that removes everything → empty OUT).
  const nz = g => { let n = 0; for (const r of g) for (const x of r) if (x) n++; return n; };
  const dif = (a, b) => { let d = 0; for (let r = 0; r < a.length; r++) for (let c = 0; c < a[0].length; c++) if (a[r][c] !== b[r][c]) d++; return d; };
  const allPairs = examples.map(e => ({ i: e.in[0], o: e.out[0] })).concat([{ i: t.in[0], o: t.out[0] }]);
  let degenerate = false;
  for (const p of allPairs) { if (nz(p.o) < 2) degenerate = true; if (dif(p.i, p.o) < Math.max(3, Math.ceil(0.04 * nz(p.i)))) degenerate = true; }
  const width = t.in[0][0].length, height = t.in[0].length;
  const tree = serializeNode(prog.node);
  const depth = nodeDepth(prog.node), branches = dispatchBranches(prog.node), nobj = first.inScene.objects.length;
  const intrinsic = intrinsicMetrics(prog.node);        // Dchain-based INTRINSIC difficulty (rule-depth, not rule-count)
  const difficulty = intrinsic.score;
  const nl = nlNode(prog.node), dtext = dslText(prog.node);
  // the KEYSTONE: the step-by-step "thinking-grids" execution trace on the test pair (each step engine-verified)
  const tr = runWithTrace(prog.node, t.inScene);
  const trace = [{ step: 0, op: "input", nl: "the input scene", grid: t.in[0], focus: [] }]
    .concat(tr.steps.map((s, i) => ({ step: i + 1, op: s.op, nl: s.nl, dsl: s.dsl, grid: renderScene(s.scene), focus: s.focus || [] })));
  const id = "PRG-" + crypto.createHash("sha1").update(JSON.stringify([prog.name, examples, t.in, t.out])).digest("hex").slice(0, 8);
  return {
    format: "prodigy-task", version: 1, width, height, palette: "arc10", fps: 1,
    examples, in: t.in, out: t.out,
    meta: {
      id, rule: prog.rule, language_description: prog.rule, concepts: prog.concepts, prior: prog.prior || "composed-object",
      difficulty, depth, template: "prog2:" + prog.name, source: "program.js", n_examples: nEx,
      program: {                                    // program.json (inline): the typed AST + labels + targets
        name: prog.name, tree, dsl_text: dtext, nl,          // the rule THREE aligned ways: AST + DSL-text + NL
        intrinsic,                                           // {Dchain, S, contextual, score} — rule-DEPTH difficulty
        dispatch_branches: branches, depth,
        relations: sceneRelations(t.inScene), objects: objectMeta(t.inScene),
        targets: ["arc_pair", "next_frame", "inverse_dynamics", "object_aux", "relation_aux", "solve_trace"],
      },
      trace,                                         // [{step, op, nl, dsl, grid}] — IN → …thinking-grids… → OUT
      compiled_dsl: null,                            // PAN-176 future: Python compiled function
      teaching: { ok: !overlap && !degenerate, coherent: !overlap && !degenerate, examplesVary: true, reasons: overlap ? ["output objects overlap — ambiguous"] : degenerate ? ["degenerate: empty/near-empty output or trivial change"] : [] },
    },
  };
}

// ============================================================ demo program library
// Each demonstrates a combinator. gravity_on_red is the headline: object-level same-grid dispatch.
const LIBRARY = {
  gravity_on_red: {
    name: "gravity_on_red", prior: "physics/dispatch",
    rule: "gravity acts ONLY on red objects: every red object falls straight down until it rests on the floor or on another object; all non-red objects stay exactly where they are.",
    concepts: ["gravity", "dispatch", "color", "physics", "object-permanence", "selective"],
    node: { op: "dispatch", key: { k: "color" }, cases: { 2: { t: "fall" } }, default: { t: "identity" } },
    sampler: rng => sampleScene(rng, { H: rng.int(14, 18), W: rng.int(14, 20), K: rng.int(4, 6), palette: [2, 3, 4, 6, 8], ensureColors: [2, 2], upperFrac: 0.55, gap: 1 }),
  },
  dispatch_by_core: {
    name: "dispatch_by_core", prior: "subobject/dispatch",
    rule: "the internal core colour chooses the operation: red-core objects mirror left-right, blue-core objects flip top-bottom, others stay still.",
    concepts: ["subobject", "core", "dispatch", "per-object-function"],
    node: { op: "dispatch", key: { k: "core_color" }, cases: { 2: { t: "mirror_h" }, 1: { t: "flip_v" } }, default: { t: "identity" } },
    sampler: rng => sampleScene(rng, { K: rng.int(4, 5), withCore: true, corePalette: [2, 1, 3], ensureCores: [2, 1], kinds: ["Lshape", "triangle", "plus"], size: 3 }),
  },
  recolor_by_size: {
    name: "recolor_by_size", prior: "number/dispatch",
    rule: "recolour every small object red and every large object blue, by cell-count.",
    concepts: ["size", "threshold", "dispatch", "classification"],
    node: { op: "dispatch", key: { k: "size_class" }, cases: { small: { t: "recolor", color: 2 }, large: { t: "recolor", color: 1 } } },
    sampler: rng => sampleScene(rng, { K: 5, kinds: ["square"], sizes: [2, 2, 3, 4, 3], palette: [3, 4, 6, 7, 8] }),
  },
  recolor_by_quadrant: {
    name: "recolor_by_quadrant", prior: "geometry/dispatch",
    rule: "recolour each object by the quadrant it sits in: top-left red, top-right green, bottom-left yellow, bottom-right blue.",
    concepts: ["position", "quadrant", "dispatch", "spatial"],
    node: { op: "dispatch", key: { k: "quadrant" }, cases: { TL: { t: "recolor", color: 2 }, TR: { t: "recolor", color: 3 }, BL: { t: "recolor", color: 4 }, BR: { t: "recolor", color: 1 } } },
    sampler: rng => sampleScene(rng, { H: 18, W: 18, K: 4, kinds: ["square"], size: 2, palette: [5, 6, 7, 8] }),
  },
  mask_left_mirror: {
    name: "mask_left_mirror", prior: "geometry/region",
    rule: "objects in the LEFT half are mirrored left-right in place; objects in the right half are unchanged.",
    concepts: ["region", "mask", "reflection", "spatial"],
    node: { op: "mask", region: { reg: "half", side: "left" }, node: { op: "apply", sel: { s: "all" }, transform: { t: "mirror_h" } } },
    sampler: rng => sampleScene(rng, { H: rng.int(14, 18), W: rng.int(18, 22), K: rng.int(4, 6), kinds: ["Lshape", "triangle"], size: 3, spreadHalves: true }),
  },
  seq_outline_then_largest_fill: {
    name: "seq_outline_then_largest_fill", prior: "topology/seq",
    rule: "first outline every object (hollow border), then refill the single largest object solid.",
    concepts: ["outline", "largest", "seq", "topology"],
    node: { op: "seq", steps: [
      { op: "apply", sel: { s: "all" }, transform: { t: "outline" } },
      { op: "apply", sel: { s: "largest" }, transform: { t: "fill_hole" } },
    ] },
    sampler: rng => sampleScene(rng, { H: rng.int(15, 19), W: rng.int(15, 19), K: 3, kinds: ["square"], sizes: [3, 4, 5], palette: [3, 4, 6, 8] }),
  },
  parallel_region_concepts: {
    name: "parallel_region_concepts", prior: "region/parallel",
    rule: "two independent rules run in parallel on disjoint regions: left-half objects are recoloured red, right-half objects are outlined.",
    concepts: ["region", "parallel", "recolor", "outline"],
    node: { op: "parallel", branches: [
      { op: "mask", region: { reg: "half", side: "left" }, node: { op: "apply", sel: { s: "all" }, transform: { t: "recolor", color: 2 } } },
      { op: "mask", region: { reg: "half", side: "right" }, node: { op: "apply", sel: { s: "all" }, transform: { t: "outline" } } },
    ] },
    sampler: rng => sampleScene(rng, { H: rng.int(14, 18), W: rng.int(18, 24), K: rng.int(4, 6), kinds: ["square", "plus"], size: 3, palette: [3, 4, 6, 7, 8], spreadHalves: true }),
  },
};

function buildDemo(name, opts = {}) {
  const prog = LIBRARY[name]; if (!prog) throw new Error("unknown demo " + name);
  return buildProgramTask(prog, opts);
}

// ============================================================ CHAIN sampler — concatenate MANY rules (op:"seq")
// The thing Mario wants: tasks that mix 2–4 rules IN A ROW. Samples a `seq` of distinct rule-stages over the
// SAME typed combinator layer (selectors × transforms × dispatch), so every chain is one serialisable program
// (the AST = the induction LABEL) that renders to a coherent (IN→OUT) task. Colours are GROUNDED (recolour only
// to a colour already in the scene — no "magic" colours). buildProgramTask + the teaching gate verify each one.
const COLNAME = { 1: "blue", 2: "red", 3: "green", 4: "yellow", 5: "grey", 6: "magenta", 7: "orange", 8: "cyan", 9: "maroon" };
const DIRS = ["down", "up", "left", "right"];
const SIDES = ["left", "right", "top", "bottom"];
function selText(sel) {
  switch (sel.s) {
    case "all": return "every object"; case "largest": return "the largest object"; case "smallest": return "the smallest object";
    case "by_size": return "the " + sel.cls + " objects"; case "by_color": return "the " + (COLNAME[sel.color] || sel.color) + " objects";
    case "in_region": return "objects in the " + sel.region.side + " half"; default: return "the selected objects";
  }
}
// ARC-AGI-2 tasks are NOT 4 independent transforms glued together — they are a FEW rules where each step
// DEPENDS on a previous one's result (find an anchor → everything relates to it; a property decides the op).
// We build exactly that, using program.js's real dependency machinery: `bind` (capture an anchor) + the
// RELATIONAL transforms (recolor_to / copy_shape / reflect_pos that read env[ref]) and `dispatch` (per-object
// op chosen by a property — the contextual rule). Anchors: largest / smallest / unique_color / unique_shape / holed.
const ANCHORS = { largest: "the largest object", smallest: "the smallest object", unique_color: "the uniquely-coloured object", unique_shape: "the odd-shaped object", holed: "the hollow object" };
const ANCHOR_SEL = { largest: { s: "largest" }, smallest: { s: "smallest" }, holed: { s: "has_hole", holed: true } };   // anchors that are also directly selectable for a pre-step

// build ONE dependent program: a bind + relational chain, or a contextual dispatch.
function sampleChain(rng, depth) {
  const pick = a => a[rng.int(0, a.length - 1)];
  const palette = FULL_PALETTE;
  // a richly varied scene: wide shape vocabulary + internal skins + cores + holed mix + full palette.
  const richScene = extra => r => sampleScene(r, Object.assign({ H: r.int(15, 20), W: r.int(16, 22), K: r.int(4, 7), palette, kinds: KINDS_RICH, holedMix: r.int(0, 1) === 0, skinFrac: 0.4, withCore: r.int(0, 2) === 0, sizes: [2, 3, 4, 5, 3, 2, 4], gap: 1, upperFrac: 0.85 }, extra));
  // WEIGHTED op sampler — many BASIC functions for combinatorial explosion; geometry (rotate/mirror/flip) is
  // deliberately RARE (Mario: rotate/mirror were ~5× overused). Each call grounds its own params.
  const wpick = arr => { const tot = arr.reduce((s, x) => s + x.w, 0); let r = rng.int(0, tot - 1); for (const x of arr) { if (r < x.w) return x; r -= x.w; } return arr[arr.length - 1]; };
  const sampleOp = () => wpick([
    { w: 5, g: () => { const c = pick(palette); return { t: { t: "recolor", color: c }, w: "is recoloured " + COLNAME[c] }; } },
    { w: 4, g: () => { const d = pick(DIRS); return { t: { t: "fall", dir: d }, w: "falls " + d }; } },
    { w: 4, g: () => ({ t: { t: "outline" }, w: "is outlined" }) },
    { w: 3, g: () => ({ t: { t: "fill_hole" }, w: "is filled solid" }) },
    { w: 3, g: () => { const dr = pick([-2, -1, 1, 2]), dc = pick([-2, -1, 1, 2]); return { t: { t: "translate", dr, dc }, w: "shifts" }; } },
    { w: 3, g: () => ({ t: { t: "remove" }, w: "disappears" }) },
    { w: 2, g: () => { const c = pick(palette); return { t: { t: "recolor_core", color: c }, w: "gets a " + COLNAME[c] + " core" }; } },
    { w: 1, g: () => ({ t: { t: "rotate_90" }, w: "is rotated 90°" }) },     // geometry: RARE
    { w: 1, g: () => ({ t: { t: "rotate_180" }, w: "is rotated 180°" }) },
    { w: 1, g: () => ({ t: { t: "mirror_h" }, w: "is mirrored" }) },
    { w: 1, g: () => ({ t: { t: "flip_v" }, w: "is flipped" }) },
  ]).g();
  // ---- pattern CONTEXTUAL (a single rule whose effect is decided per-object by a property) ----
  if (rng.int(0, 2) === 0) {
    const key = wpick([
      { w: 4, k: "size_class", vals: ["large", "small"], lab: "SIZE" },
      { w: 4, k: "has_hole", vals: ["holed", "solid"], lab: "whether it is hollow" },
      { w: 3, k: "shape_kind", vals: null, lab: "SHAPE" },
      { w: 3, k: "color", vals: null, lab: "COLOUR" },
      { w: 3, k: "orientation", vals: ["tall", "wide"], lab: "ORIENTATION" },
      { w: 1, k: "quadrant", vals: ["TL", "TR", "BL", "BR"], lab: "QUADRANT" },   // RARE (was overused)
    ]);
    const vals = key.vals || (key.k === "color" ? palette.slice().sort(() => rng.int(0, 1) - 0.5).slice(0, 3) : pick([["square", "triangle", "plus"], ["Lshape", "Tshape", "diamond"], ["Ushape", "Cshape", "arrow"]]));
    const ops = []; const usedW = new Set(); for (const v of vals) { let o = sampleOp(), g = 0; while (usedW.has(o.w) && g++ < 8) o = sampleOp(); usedW.add(o.w); ops.push(o); }
    const cases = {}; vals.forEach((v, i) => cases[v] = ops[i].t);
    const rule = `Each object is transformed by its ${key.lab}: ` + vals.map((v, i) => `${COLNAME[v] || v} → ${ops[i].w}`).join("; ") + ". (The operation DEPENDS on each object's own property.)";
    return {
      name: "ctx_" + key.k, prior: "contextual-dispatch", rule, concepts: ["contextual", "dispatch", "per-object", key.k],
      node: { op: "dispatch", key: { k: key.k }, cases, default: { t: "identity" } },
      sampler: richScene({ holedMix: key.k === "has_hole", spreadHalves: key.k === "quadrant", ensureColors: key.k === "color" ? vals : undefined }),
    };
  }
  // ---- pattern ANCHOR-RELATIONAL (find a special object; the REST of the scene is transformed relative to it) ----
  const anchor = pick(Object.keys(ANCHORS));
  const relChoices = [
    { wt: 4, t: { t: "recolor_to", ref: "A" }, w: "every other object takes its colour", c: "color" },
    { wt: 2, t: { t: "copy_shape", ref: "A" }, w: "every other object morphs into its shape", c: "shape" },
    { wt: 1, t: { t: "reflect_pos", ref: "A", axis: pick(["h", "v"]) }, w: "every object is mirrored across it", c: "symmetry" },   // RARE (mirror)
  ];
  const rel = (() => { const tot = relChoices.reduce((s, x) => s + x.wt, 0); let r = rng.int(0, tot - 1); for (const x of relChoices) { if (r < x.wt) return x; r -= x.wt; } return relChoices[0]; })();
  const steps = [{ op: "bind", pick: anchor, name: "A" }];
  const texts = [`find ${ANCHORS[anchor]}`];
  // optional DEPENDENT pre-op on the anchor itself (depth ≥ 3): transform the anchor, then relate the rest to it
  if (depth >= 3 && ANCHOR_SEL[anchor]) {
    const pc = pick(palette);
    const pre = pick([{ t: { t: "outline" }, w: "outline it" }, { t: { t: "fill_hole" }, w: "fill it solid" }, { t: { t: "recolor", color: pc }, w: "recolour it " + COLNAME[pc] }]);
    steps.push({ op: "apply", sel: ANCHOR_SEL[anchor], transform: pre.t }); texts.push(pre.w);
  }
  steps.push({ op: "apply", sel: { s: "all" }, transform: rel.t }); texts.push(rel.w);
  const rule = "First " + texts[0] + "; then " + texts.slice(1).join("; then ") + ". (Each step DEPENDS on having found that one object.)";
  return {
    name: "anchor_" + anchor + "_" + rel.c, prior: "anchor-relational", rule,
    concepts: ["relational", "anchor", "dependency", rel.c, anchor],
    node: { op: "seq", steps },
    sampler: richScene({ holedMix: anchor === "holed" }),
  };
}
// generate N verified composed tasks (teaching-gated: OUT≠IN on every pair + examples vary).
function generateComposed(opts = {}) {
  const n = opts.n || 12, depth = opts.depth || 3, rng = E.makeRng((opts.seed || 1) * 2654435761 + 97);
  const out = []; let guard = 0;
  while (out.length < n && guard++ < n * 30) {
    const d = Array.isArray(depth) ? depth[rng.int(0, depth.length - 1)] : depth;
    let task; try { task = buildProgramTask(sampleChain(rng, d), { seed: rng.int(1, 2e9), nEx: 3 }); } catch (e) { continue; }
    if (!task.meta.teaching.coherent) continue;   // reject ambiguous tasks (output objects overlap/overwrite)
    const idOk = task.examples.every(e => JSON.stringify(e.in) !== JSON.stringify(e.out)) && new Set(task.examples.map(e => JSON.stringify(e.out))).size >= 2;
    if (!idOk) continue;
    out.push(task);
  }
  return { records: out, emitted: out.length };
}

// ---- P1 LEGEND / symbol grounding: the derive-then-consume DEEP rule (one intrinsically-deep rule, not N glued) ----
function sampleLegendScene(rng) {
  const H = rng.int(10, 13), W = rng.int(12, 15), K = 3;
  const pal = FULL_PALETTE.slice().sort(() => rng.int(0, 1) - 0.5), src = pal.slice(0, K), tgt = pal.slice(K, 2 * K);
  const objects = [], occ = new Set();
  for (let i = 0; i < K; i++) {   // the LEGEND: col-0 src swatch ↔ col-1 tgt swatch, one row each (the map, IN the grid, varies per example)
    objects.push({ id: "ls" + i, cells: [[0, 0]], r: i, c: 0, color: src[i], kind: "swatch" }); occ.add(i + ",0");
    objects.push({ id: "lt" + i, cells: [[0, 0]], r: i, c: 1, color: tgt[i], kind: "swatch" }); occ.add(i + ",1");
  }
  const shapes = [[[0, 0], [0, 1], [1, 0]], [[0, 0], [0, 1], [1, 0], [1, 1]], [[0, 0]], [[0, 0], [1, 0], [0, 1], [2, 0]]];
  const nWork = rng.int(3, 5);
  for (let w = 0; w < nWork; w++) {
    const col = src[rng.int(0, K - 1)], shp = shapes[rng.int(0, shapes.length - 1)];
    for (let t = 0; t < 90; t++) {
      const r0 = rng.int(0, H - 3), c0 = rng.int(3, W - 3); let clash = false;
      for (const [dr, dc] of shp) { for (let a = -1; a <= 1 && !clash; a++) for (let b = -1; b <= 1 && !clash; b++) if (occ.has((r0 + dr + a) + "," + (c0 + dc + b))) clash = true; }
      if (clash) continue;
      for (const [dr, dc] of shp) occ.add((r0 + dr) + "," + (c0 + dc));
      objects.push({ id: "w" + w, cells: shp.map(x => x.slice()), r: r0, c: c0, color: col, kind: "work" }); break;
    }
  }
  return { H, W, bg: 0, objects };
}
const LEGEND_PROG = {
  name: "legend_recolor", prior: "symbolic/legend",
  rule: "The two leftmost columns are a LEGEND: each row pairs a source colour (col 0) with a target colour (col 1). Recolour every object to the RIGHT of the legend by that mapping, then the legend is removed. (You must READ the map off the grid — it changes every example.)",
  concepts: ["symbol-grounding", "legend", "in-context-map", "derive-then-consume", "dependency"],
  node: { op: "seq", steps: [{ op: "derive", name: "M" }, { op: "apply_map", map: "M" }, { op: "erase_legend" }] },
  sampler: sampleLegendScene,
};
// P4/topology — CONTAINMENT: frames enclose objects; the derived inside/outside relation drives the recolour.
function sampleContainmentScene(rng) {
  const H = rng.int(12, 16), W = rng.int(12, 16), objects = [], occ = new Set();
  const pal = FULL_PALETTE.slice().sort(() => rng.int(0, 1) - 0.5);
  const nFrames = rng.int(2, 3); let id = 0;
  const frameCells = s => { const o = []; for (let r = 0; r < s; r++) for (let c = 0; c < s; c++) if (r === 0 || c === 0 || r === s - 1 || c === s - 1) o.push([r, c]); return o; };
  for (let f = 0; f < nFrames; f++) {
    const s = rng.int(5, 6); let placed = null;
    for (let t = 0; t < 140 && !placed; t++) {
      const r0 = rng.int(0, H - s), c0 = rng.int(0, W - s), fc = frameCells(s);
      if (fc.some(([dr, dc]) => occ.has((r0 + dr - 1) + "," + (c0 + dc)) || occ.has((r0 + dr) + "," + (c0 + dc)))) continue;
      for (const [dr, dc] of fc) occ.add((r0 + dr) + "," + (c0 + dc));
      objects.push({ id: "F" + (id++), cells: fc, r: r0, c: c0, color: pal[f], kind: "frame" });
      if (rng.int(0, 4) > 0) {   // most frames enclose a 2x2 block at their centre (a visible amount of change)
        const col = pal[3 + rng.int(0, 3)], inCells = [[0, 0], [0, 1], [1, 0], [1, 1]];
        objects.push({ id: "I" + (id++), cells: inCells, r: r0 + 1, c: c0 + 1, color: col, kind: "inside" });
        for (const [dr, dc] of inCells) occ.add((r0 + 1 + dr) + "," + (c0 + 1 + dc));
      }
      placed = true;
    }
  }
  for (let w = 0; w < rng.int(2, 4); w++) {   // some OUTSIDE objects (a distractor set that must stay unchanged)
    for (let t = 0; t < 60; t++) { const r0 = rng.int(0, H - 1), c0 = rng.int(0, W - 1);
      let clash = false; for (let a = -1; a <= 1 && !clash; a++) for (let b = -1; b <= 1 && !clash; b++) if (occ.has((r0 + a) + "," + (c0 + b))) clash = true;
      if (clash) continue; occ.add(r0 + "," + c0); objects.push({ id: "O" + (id++), cells: [[0, 0]], r: r0, c: c0, color: pal[3 + rng.int(0, 3)], kind: "outside" }); break; }
  }
  return { H, W, bg: 0, objects };
}
const CONTAIN_PROG = {
  name: "containment_recolor", prior: "topology/containment",
  rule: "Every object ENCLOSED by a frame takes that frame's colour; objects outside every frame are unchanged. (You must work out inside vs outside — a topological relation read off the grid.)",
  concepts: ["topology", "containment", "inside-outside", "derive-then-consume", "dependency"],
  node: { op: "seq", steps: [{ op: "derive_containment", name: "C" }, { op: "apply_container", map: "C" }] },
  sampler: sampleContainmentScene,
};
function generateContainment(opts = {}) {
  const n = opts.n || 12, rng = E.makeRng((opts.seed || 1) * 2654435761 + 173);
  const out = []; let guard = 0;
  while (out.length < n && guard++ < n * 25) {
    let task; try { task = buildProgramTask(CONTAIN_PROG, { seed: rng.int(1, 2e9), nEx: 3 }); } catch (e) { continue; }
    if (!task.meta.teaching.coherent) continue;
    if (!task.examples.every(e => JSON.stringify(e.in) !== JSON.stringify(e.out))) continue;
    out.push(task);
  }
  return { records: out, emitted: out.length };
}
function generateLegend(opts = {}) {
  const n = opts.n || 12, rng = E.makeRng((opts.seed || 1) * 2654435761 + 131);
  const out = []; let guard = 0;
  while (out.length < n && guard++ < n * 20) {
    let task; try { task = buildProgramTask(LEGEND_PROG, { seed: rng.int(1, 2e9), nEx: 3 }); } catch (e) { continue; }
    if (!task.meta.teaching.coherent) continue;
    if (!task.examples.every(e => JSON.stringify(e.in) !== JSON.stringify(e.out))) continue;
    out.push(task);
  }
  return { records: out, emitted: out.length };
}

// ============================================================ self-test
function selfTest() {
  const names = Object.keys(LIBRARY);
  for (const name of names) {
    let task; try { task = buildDemo(name, { seed: 5 }); } catch (e) { throw new Error(name + " threw: " + e.message); }
    // teaching: every example pair must change IN→OUT and have ≥2 distinct outputs
    const sigs = new Set();
    for (const e of task.examples) {
      if (JSON.stringify(e.in) === JSON.stringify(e.out)) throw new Error(name + ": an example is identity (no teaching)");
      sigs.add(JSON.stringify(e.out));
    }
    if (sigs.size < 2 && task.examples.length >= 2) throw new Error(name + ": examples do not vary");
    if (task.meta.program.tree.op == null) throw new Error(name + ": no serialised tree");
  }
  // headline assertion: gravity_on_red moves red objects DOWN and leaves non-red fixed.
  const prog = LIBRARY.gravity_on_red, rng = E.makeRng(99);
  const sIn = prog.sampler(rng), sOut = applyNode(prog.node, sIn);
  const byId = Object.fromEntries(sOut.objects.map(o => [o.id, o]));
  let movedRed = 0, movedOther = 0;
  for (const o of sIn.objects) { const after = byId[o.id]; if (!after) continue; const dr = after.r - o.r; if (o.color === 2) { if (dr > 0) movedRed++; } else if (dr !== 0) movedOther++; }
  if (movedRed < 1) throw new Error("gravity_on_red: no red object fell");
  if (movedOther !== 0) throw new Error("gravity_on_red: a non-red object moved (" + movedOther + ")");
  // determinism
  const a = buildDemo("dispatch_by_core", { seed: 4 }).meta.id, b = buildDemo("dispatch_by_core", { seed: 4 }).meta.id;
  if (a !== b) throw new Error("program.js: non-deterministic build");
  // gravity_on_red and mask_left_mirror should survive the baseline-hard filter (non-trivial)
  for (const name of ["gravity_on_red", "mask_left_mirror", "dispatch_by_core"]) {
    if (B.trivialSolve(buildDemo(name, { seed: 6 }))) throw new Error(name + ": trivially solvable (too easy)");
  }
  return true;
}

// ============================================================ CLI
if (require.main === module) {
  const args = process.argv.slice(2);
  const flag = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
  if (args.includes("--self-test")) { selfTest(); console.log("program.js: self-test PASS"); }
  else if (args.includes("--compose")) {   // CHAIN of many rules → verified composed corpus (jsonl)
    const n = +flag("--compose", 12), depth = (flag("--depth", "2,3,4")).split(",").map(Number), o = flag("-o", null);
    const r = generateComposed({ n, depth, seed: +flag("--seed", 1) });
    if (o) { require("fs").writeFileSync(o, r.records.map(t => JSON.stringify(t)).join("\n") + "\n"); console.error(`wrote ${r.emitted} composed tasks → ${o}`); }
    else { for (const t of r.records) console.error(`# depth ${t.meta.depth}  ${t.meta.rule}`); console.error(`\n${r.emitted} composed tasks`); }
  }
  else if (args.includes("--legend")) {   // P1 derive-then-consume DEEP rule (legend / symbol grounding)
    const n = +flag("--legend", 12), o = flag("-o", null), r = generateLegend({ n, seed: +flag("--seed", 1) });
    if (o) { require("fs").writeFileSync(o, r.records.map(t => JSON.stringify(t)).join("\n") + "\n"); console.error(`wrote ${r.emitted} legend tasks → ${o}`); }
    else { for (const t of r.records) console.error("# " + (t.meta.program.nl)); console.error(`\n${r.emitted} legend tasks`); }
  }
  else if (args.includes("--contain")) {   // P4/topology derive-then-consume DEEP rule (inside/outside)
    const n = +flag("--contain", 12), o = flag("-o", null), r = generateContainment({ n, seed: +flag("--seed", 1) });
    if (o) { require("fs").writeFileSync(o, r.records.map(t => JSON.stringify(t)).join("\n") + "\n"); console.error(`wrote ${r.emitted} containment tasks → ${o}`); }
    else { for (const t of r.records) console.error("# " + t.meta.program.nl); console.error(`\n${r.emitted} containment tasks`); }
  }
  else if (args.includes("--list")) { for (const [k, v] of Object.entries(LIBRARY)) console.log(k.padEnd(30), "—", v.rule); }
  else if (args.includes("--demo")) {
    const name = flag("--demo", "gravity_on_red"), task = buildDemo(name, { seed: +flag("--seed", 1) });
    console.error(`# ${name}  (id ${task.meta.id}, ${task.width}x${task.height}, diff ${task.meta.difficulty}, depth ${task.meta.depth}, dispatch-branches ${task.meta.program.dispatch_branches})`);
    console.error("# RULE: " + task.meta.rule);
    const show = (g, label) => { console.error("# " + label + " " + g.length + "x" + g[0].length); for (const row of g) console.error("  " + row.join(" ")); };
    show(task.in[0], "TEST IN"); show(task.out[0], "TEST OUT");
    console.log(JSON.stringify(task));
  }
  else { const rows = Object.keys(LIBRARY).map(n => JSON.stringify(buildDemo(n, { seed: +flag("--seed", 1) }))); console.log(rows.join("\n")); }
}

module.exports = {
  renderScene, applyNode, sampleScene, buildProgramTask, buildDemo, LIBRARY, selfTest,
  sampleChain, generateComposed, generateLegend, generateContainment,
  serializeNode, selPred, keyOf, applyPure, gravityPass,
};
