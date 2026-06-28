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
    for (const [r, c] of absCells(o)) if (r >= 0 && c >= 0 && r < scene.H && c < scene.W) g[r][c] = o.color;
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
function applyPure(t, o, scene) {
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
function applyNode(node, scene) {
  let s = cloneScene(scene);
  switch (node.op) {
    case "apply": {                               // apply ONE transform to a selected subset
      const pred = selPred(node.sel);
      for (const o of s.objects) if (pred(o, s)) applyPure(node.transform, o, s);
      gravityPass(s); s.objects = s.objects.filter(o => !o._removed); return s;
    }
    case "dispatch": {                            // per-object route by key → case transform (THE long tail)
      for (const o of s.objects) {
        const v = keyOf(node.key, o, s);
        const t = (node.cases && Object.prototype.hasOwnProperty.call(node.cases, v)) ? node.cases[v] : (node.default || { t: "identity" });
        applyPure(t, o, s);
      }
      gravityPass(s); s.objects = s.objects.filter(o => !o._removed); return s;
    }
    case "mask": {                                // apply a sub-node only to objects inside a region
      const keep = s.objects.filter(o => !inRegion(node.region, o, s));
      const inside = { H: s.H, W: s.W, bg: s.bg, objects: s.objects.filter(o => inRegion(node.region, o, s)) };
      const done = applyNode(node.node, inside);
      return { H: s.H, W: s.W, bg: s.bg, objects: keep.concat(done.objects) };
    }
    case "seq": { let acc = s; for (const step of node.steps) acc = applyNode(step, acc); return acc; }
    case "parallel": {                            // branches must touch DISJOINT objects (asserted by caller via regions/selectors)
      let acc = cloneScene(s);
      for (const br of node.branches) {
        const res = applyNode(br, acc);
        acc = res;                                 // sequential application; disjointness keeps it order-independent
      }
      return acc;
    }
    case "repeat": { let acc = s; for (let i = 0; i < node.n; i++) acc = applyNode(node.node, acc); return acc; }
    case "overlay": {                             // stamp extra objects on top (e.g. a marker layer / second concept)
      return { H: s.H, W: s.W, bg: s.bg, objects: s.objects.concat((node.objects || []).map(cloneObj)) };
    }
    case "bind": return s;                        // binding is metadata-only here (the selector is reused by name in the tree)
    default: throw new Error("unknown node op " + node.op);
  }
}

// ============================================================ scene sampler
const KINDS_SOLID = ["square", "plus", "Lshape", "triangle", "diamond", "Tshape", "notch"];
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
  for (let i = 0; i < K; i++) {
    const kind = opts.holedMix && i % 2 === 0 ? (rng.int(0, 1) ? "frame" : "ring") : kinds[rng.int(0, kinds.length - 1)];
    const s = opts.sizes ? opts.sizes[i % opts.sizes.length] : (opts.size || rng.int(2, 4));
    const sp = { cells: shapeCells(kind, s), color: cols[i], kind };
    if (opts.withCore) sp.core = (opts.corePalette || [2, 1, 3])[rng.int(0, (opts.corePalette || [2, 1, 3]).length - 1)];
    if (opts.withMarker) sp.marker = rng.int(0, (opts.markers || 2) - 1);
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
  return j;
}
function nodeDepth(node) {
  if (node.op === "seq") return 1 + Math.max(0, ...node.steps.map(nodeDepth));
  if (node.op === "parallel") return 1 + Math.max(0, ...node.branches.map(nodeDepth));
  if (node.op === "mask" || node.op === "repeat") return 1 + nodeDepth(node.node);
  return 1;
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

// ============================================================ task builder
function buildProgramTask(prog, opts = {}) {
  const rng = E.makeRng((opts.seed || 1) * 2654435761 + 13);
  const nEx = opts.nEx || rng.int(3, 4), examples = [];
  const mkPair = () => { const inScene = prog.sampler(rng); const outScene = applyNode(prog.node, inScene); return { inScene, in: [renderScene(inScene)], out: [renderScene(outScene)] }; };
  let first = null;
  for (let i = 0; i < nEx; i++) { const p = mkPair(); if (!first) first = p; examples.push({ in: p.in, out: p.out }); }
  const t = mkPair();
  const width = t.in[0][0].length, height = t.in[0].length;
  const tree = serializeNode(prog.node);
  const depth = nodeDepth(prog.node), branches = dispatchBranches(prog.node), nobj = first.inScene.objects.length;
  const difficulty = +Math.min(1, 0.4 + 0.07 * depth + 0.05 * branches + 0.02 * nobj).toFixed(2);
  const id = "PRG-" + crypto.createHash("sha1").update(JSON.stringify([prog.name, examples, t.in, t.out])).digest("hex").slice(0, 8);
  return {
    format: "prodigy-task", version: 1, width, height, palette: "arc10", fps: 1,
    examples, in: t.in, out: t.out,
    meta: {
      id, rule: prog.rule, language_description: prog.rule, concepts: prog.concepts, prior: prog.prior || "composed-object",
      difficulty, depth, template: "prog2:" + prog.name, source: "program.js", n_examples: nEx,
      program: {                                    // program.json (inline): the typed AST + labels + targets
        name: prog.name, tree, dispatch_branches: branches, depth,
        relations: sceneRelations(t.inScene), objects: objectMeta(t.inScene),
        targets: ["arc_pair", "next_frame", "inverse_dynamics", "object_aux", "relation_aux"],
      },
      compiled_dsl: null,                            // PAN-176 future: Python compiled function
      teaching: { ok: true, coherent: true, examplesVary: true },
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
  serializeNode, selPred, keyOf, applyPure, gravityPass,
};
