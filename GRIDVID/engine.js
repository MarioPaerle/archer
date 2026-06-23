/* =============================================================================
 * gridvid engine — core logic for 2dgridvid (small ARC-palette grid videos)
 *
 * A 2dgridvid is a list of 2D grids (frames), each cell an ARC color 0..9.
 * PURE LOGIC (no DOM). Runs in the browser (window.GRIDVID) and Node (require).
 *
 *   scene-DSL text  ->  World (objects + physics + fields)  ->  frames  -> JSON
 *
 * Mechanics: objects, gravity, collision, bounce, inside/outside, shape-sorter,
 *   voronoi fields (segmentation prior), shooters/beams, spinning objects,
 *   liquid sources (falling-sand/water). Plus ARC-style augmentation.
 * ========================================================================== */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.GRIDVID = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const VERSION = 2;

  const ARC_PALETTE = [
    "#000000", "#0074D9", "#FF4136", "#2ECC40", "#FFDC00",
    "#AAAAAA", "#F012BE", "#FF851B", "#7FDBFF", "#870C25",
  ];

  // ---- RNG: seedable mulberry32 (deterministic, reproducible batches) --------
  function makeRng(seed) {
    let s = (seed >>> 0) || 1;
    const rng = function () {
      s |= 0; s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    rng.int = (lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));
    rng.pick = (arr) => arr[rng.int(0, arr.length - 1)];
    for (let i = 0; i < 6; i++) rng();   // warm-up: mulberry32's first draws correlate with the seed; consecutive seeds (1,2,3..) must decorrelate
    return rng;
  }

  // ---- Shapes: a shape is a normalized MASK (list of [dr,dc] offsets) --------
  function normalize(cells) {
    if (!cells.length) return [];
    let mr = Infinity, mc = Infinity;
    for (const [r, c] of cells) { if (r < mr) mr = r; if (c < mc) mc = c; }
    const out = cells.map(([r, c]) => [r - mr, c - mc]);
    out.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    return out;
  }
  function rectCells(h, w) { const o = []; for (let i = 0; i < h; i++) for (let j = 0; j < w; j++) o.push([i, j]); return o; }
  function dedupe(cells) { const s = new Set(), o = []; for (const [r, c] of cells) { const k = r + "," + c; if (!s.has(k)) { s.add(k); o.push([r, c]); } } return o; }

  const SHAPES = {
    dot: () => [[0, 0]],
    square: (s = 3) => rectCells(s, s),
    rect: (h = 2, w = 4) => rectCells(h, w),
    line: (len = 4, v = 0) => v ? rectCells(len, 1) : rectCells(1, len),
    plus: (s = 3) => { const m = (s - 1) >> 1, o = []; for (let i = 0; i < s; i++) { o.push([m, i]); o.push([i, m]); } return normalize(dedupe(o)); },
    Lshape: (s = 3) => { const o = []; for (let i = 0; i < s; i++) o.push([i, 0]); for (let j = 0; j < s; j++) o.push([s - 1, j]); return normalize(dedupe(o)); },
    Tshape: (s = 3) => { const m = (s - 1) >> 1, o = []; for (let j = 0; j < s; j++) o.push([0, j]); for (let i = 0; i < s; i++) o.push([i, m]); return normalize(dedupe(o)); },
    triangle: (s = 4) => { const o = []; for (let i = 0; i < s; i++) for (let j = 0; j <= i; j++) o.push([i, j]); return normalize(o); },
    diamond: (r = 2) => { const o = []; for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) if (Math.abs(i) + Math.abs(j) <= r) o.push([i, j]); return normalize(o); },
    disc: (r = 2) => { const o = []; for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) if (i * i + j * j <= r * r + r) o.push([i, j]); return normalize(o); },
    ring: (s = 5) => outline(rectCells(s, s)),
    frame: (h = 4, w = 6) => outline(rectCells(h, w)),
    // complementary "convex enters concave" pair: a bump (protrusion on the bottom) drops
    // into a notch (a slot cut into the top). Same s ⇒ they interlock exactly.
    notch: (s = 5) => { const m = (s - 1) >> 1, o = []; for (let i = 0; i < s; i++) for (let j = 0; j < s; j++) if (!(j === m && i < 2)) o.push([i, j]); return normalize(o); },
    bump: (s = 5) => { const m = (s - 1) >> 1, o = rectCells(s, s); o.push([s, m]); o.push([s + 1, m]); return normalize(o); },
  };

  function outline(cells) {
    const set = new Set(cells.map(([r, c]) => r + "," + c));
    return normalize(cells.filter(([r, c]) =>
      !(set.has((r - 1) + "," + c) && set.has((r + 1) + "," + c) &&
        set.has(r + "," + (c - 1)) && set.has(r + "," + (c + 1)))));
  }
  function outerOutline(cells) {
    const set = new Set(cells.map(([r, c]) => r + "," + c)), seen = new Set(), out = [];
    for (const [r, c] of cells) for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const rr = r + dr, cc = c + dc, k = rr + "," + cc;
      if (!set.has(k) && !seen.has(k)) { seen.add(k); out.push([rr, cc]); }
    }
    out.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    return out;
  }
  function interiorOf(cells) {
    const set = new Set(cells.map(([r, c]) => r + "," + c));
    return cells.filter(([r, c]) =>
      set.has((r - 1) + "," + c) && set.has((r + 1) + "," + c) &&
      set.has(r + "," + (c - 1)) && set.has(r + "," + (c + 1)));
  }
  function shapeSig(cells) { return normalize(cells).map(([r, c]) => r + ":" + c).join("|"); }
  function bbox(cells) { let h = 0, w = 0; for (const [r, c] of cells) { if (r + 1 > h) h = r + 1; if (c + 1 > w) w = c + 1; } return [h, w]; }
  function buildShape(name, args) { const fn = SHAPES[name]; if (!fn) throw new Error("unknown shape: " + name); return normalize(fn.apply(null, args)); }
  // rotate a relative mask 90° clockwise.
  function rotateCells(cells) { const [h] = bbox(cells); return normalize(cells.map(([r, c]) => [c, h - 1 - r])); }
  // mirror a relative mask across its vertical / horizontal centre line.
  function flipCellsH(cells) { const [, w] = bbox(cells); return normalize(cells.map(([r, c]) => [r, w - 1 - c])); }
  function flipCellsV(cells) { const [h] = bbox(cells); return normalize(cells.map(([r, c]) => [h - 1 - r, c])); }
  // compose rot (×90° cw) then optional flip 'h'|'v' on a relative mask.
  function transformCells(cells, rot = 0, flip = null) {
    let o = cells; const k = ((rot % 4) + 4) % 4;
    for (let i = 0; i < k; i++) o = rotateCells(o);
    if (flip === "h") o = flipCellsH(o); else if (flip === "v") o = flipCellsV(o);
    return normalize(o);
  }

  // ---- Detector predicates (G3): cheap geometry/topology over ONE body's cells. ---
  // We can CONSTRUCT symmetry/convexity/holes; these let us TEST them, so a fixed
  // template rule becomes context-sensitive (dispatch/classify) — the #1 ARC-AGI-2 driver.
  function cellKeySet(cells) { const s = new Set(); for (const [r, c] of cells) s.add(r + "," + c); return s; }
  function isConnected(cells) {   // single 4-connected component?
    if (cells.length <= 1) return true;
    const s = cellKeySet(cells), seen = new Set(), st = [cells[0]]; seen.add(cells[0][0] + "," + cells[0][1]);
    while (st.length) { const [r, c] = st.pop();
      for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const k = (r + dr) + "," + (c + dc);
        if (s.has(k) && !seen.has(k)) { seen.add(k); st.push([r + dr, c + dc]); } } }
    return seen.size === s.size;
  }
  function holeCount(cells) {   // # of background regions fully enclosed by the body (4-connectivity, flood from outside)
    const [h, w] = bbox(cells); if (h < 3 || w < 3) return 0; const s = cellKeySet(cells);
    const H = h + 2, W = w + 2, occ = (r, c) => s.has((r - 1) + "," + (c - 1));   // pad 1 so exterior wraps around
    const seen = new Set(["0,0"]), st = [[0, 0]];
    while (st.length) { const [r, c] = st.pop();
      for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nr = r + dr, nc = c + dc;
        if (nr < 0 || nc < 0 || nr >= H || nc >= W) continue; const k = nr + "," + nc;
        if (seen.has(k) || occ(nr, nc)) continue; seen.add(k); st.push([nr, nc]); } }
    let regions = 0; const visited = new Set();
    for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) {
      if (s.has(r + "," + c) || seen.has((r + 1) + "," + (c + 1)) || visited.has(r + "," + c)) continue;
      regions++; const st2 = [[r, c]]; visited.add(r + "," + c);   // a new enclosed bg region
      while (st2.length) { const [rr, cc] = st2.pop();
        for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const a = rr + dr, b = cc + dc;
          if (a < 0 || b < 0 || a >= h || b >= w) continue; const kk = a + "," + b;
          if (s.has(kk) || seen.has((a + 1) + "," + (b + 1)) || visited.has(kk)) continue; visited.add(kk); st2.push([a, b]); } } }
    return regions;
  }
  function isConvex(cells) {   // hull==filled: every grid cell inside the convex hull of the shape is filled (rejects L/T/U/plus)
    if (cells.length <= 2) return true;
    const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const pts = cells.map(([r, c]) => [c, r]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const lo = []; for (const p of pts) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
    const hi = []; for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (hi.length >= 2 && cross(hi[hi.length - 2], hi[hi.length - 1], p) <= 0) hi.pop(); hi.push(p); }
    const hull = lo.slice(0, -1).concat(hi.slice(0, -1));
    if (hull.length < 3) return true;   // degenerate (collinear) → convex
    const s = cellKeySet(cells), [h, w] = bbox(cells);
    const inside = (x, y) => { let pos = false, neg = false;   // inside-or-on a convex polygon ⇔ same side of every edge
      for (let i = 0; i < hull.length; i++) { const cr = cross(hull[i], hull[(i + 1) % hull.length], [x, y]); if (cr > 0) pos = true; else if (cr < 0) neg = true; }
      return !(pos && neg); };
    for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) if (inside(c, r) && !s.has(r + "," + c)) return false;
    return true;
  }
  function collinear(cells) { if (cells.length <= 2) return true; const [h, w] = bbox(cells); return h === 1 || w === 1; }
  function symmetryClass(cells) {   // strongest reflection/180°-rot symmetry the shape has
    const sig = shapeSig(cells);
    const hsym = shapeSig(flipCellsH(cells)) === sig, vsym = shapeSig(flipCellsV(cells)) === sig;
    const rot = shapeSig(rotateCells(rotateCells(cells))) === sig;
    if (hsym && vsym) return "hv"; if (hsym) return "h"; if (vsym) return "v"; if (rot) return "rot"; return "none";
  }
  // Each predicate maps a body → a value (boolean | number | category string), reused by
  // dispatch / classify / the `where` selector. Add detectors here as new concepts appear.
  const PREDICATES = {
    color: b => b.color,
    kind: b => b.kind,
    size: b => b.cells.length,
    size_class: b => b.cells.length <= 2 ? "small" : b.cells.length <= 6 ? "mid" : "big",
    orientation: b => { const [h, w] = bbox(b.cells); return w > h ? "wide" : h > w ? "tall" : "square"; },
    convex: b => isConvex(b.cells),
    symmetric: b => symmetryClass(b.cells) !== "none",
    symmetry: b => symmetryClass(b.cells),
    connected: b => isConnected(b.cells),
    collinear: b => collinear(b.cells),
    loop: b => holeCount(b.cells) > 0,
    holes: b => holeCount(b.cells),
    parity: b => (b.cells.length % 2 === 0) ? "even" : "odd",
  };
  function evalPred(name, b) {
    const f = PREDICATES[name];
    if (!f) throw new Error("unknown predicate: " + name + " (have: " + Object.keys(PREDICATES).join(" ") + ")");
    return f(b);
  }
  // truthy test for boolean-ish predicate values ('none'/'false'/0/'' are falsy classes)
  function predTruthy(v) { return !!v && v !== "none" && v !== "false" && v !== 0 && v !== "0"; }

  // ---- Body: a movable object ------------------------------------------------
  let _autoId = 0;
  function makeBody(o) {
    return {
      id: o.id || ("b" + (_autoId++)), cells: normalize(o.cells),
      r: o.r | 0, c: o.c | 0, color: o.color == null ? 1 : o.color,
      interior: o.interior == null ? null : o.interior,
      vr: o.vr | 0, vc: o.vc | 0, gravity: !!o.gravity,
      bounce: o.bounce == null ? 0 : o.bounce, fill: o.fill || "solid",
      kind: o.kind || "block", target: o.target || null, locked: false,
      spin: o.spin | 0, ghost: !!o.ghost, ttl: o.ttl == null ? -1 : o.ttl,
      layer: o.layer | 0, magnet: o.magnet | 0, link: o.link || null,
      sig: shapeSig(o.cells), srcLine: o.srcLine == null ? -1 : o.srcLine,
      r0: o.r | 0, c0: o.c | 0,
    };
  }
  function absCells(b, r = b.r, c = b.c) { return b.cells.map(([dr, dc]) => [r + dr, c + dc]); }
  function offGrid(world, b) { return absCells(b).every(([r, c]) => r < 0 || r >= world.h || c < 0 || c >= world.w); }

  // ---- World -----------------------------------------------------------------
  function makeWorld(o = {}) {
    return {
      w: o.w || 16, h: o.h || 16, bg: o.bg == null ? 0 : o.bg,
      gravity: o.gravity || [0, 0], walls: o.walls || "box",
      bodies: [], holes: [], board: null, fields: [], shooters: [], sources: [],
      liquid: null, liquidStreams: [], liquidCfg: { viscosity: 0, turbulence: 0, flow: 1 }, hiddenLayers: [],
      water: null, spills: [],   // new simple fluid (spillStep): continuous, laminar, fills & overflows containers
      counters: [], snakes: [], wells: [], conveyors: [], paths: [],
      sort: false, markEnclosed: o.markEnclosed == null ? null : o.markEnclosed,
      maxSpeed: o.maxSpeed || 4, rng: makeRng(o.seed || 1), seed: o.seed || 1,
      t: 0, frames: [], meta: { scene: o.scene || null, tags: o.tags || [] },
    };
  }
  function inBounds(world, r, c) { return r >= 0 && r < world.h && c >= 0 && c < world.w; }
  function ensureLiquid(world) { if (!world.liquid) world.liquid = new Array(world.h * world.w).fill(0); return world.liquid; }

  function hitsWall(world, cells) {
    for (const [r, c] of cells) {
      if (c < 0 || c >= world.w) { if (world.walls !== "none") return true; }
      if (r >= world.h) { if (world.walls === "box" || world.walls === "floor") return true; }
      if (r < 0) { if (world.walls === "box") return true; }
    }
    return false;
  }
  function obstacleSet(world, self, lockedOnly) {
    const s = new Set();
    for (const b of world.bodies) {
      if (b === self || b.kind === "bolt") continue;
      if (lockedOnly && !b.locked) continue;
      for (const [dr, dc] of b.cells) s.add((b.r + dr) + "," + (b.c + dc));
    }
    return s;
  }
  function free(world, b, r, c, obstacles) {
    const cells = absCells(b, r, c);
    if (hitsWall(world, cells)) return false;
    for (const [rr, cc] of cells) if (obstacles.has(rr + "," + cc)) return false;
    return true;
  }
  function moveBody(world, b, obstacles) {
    if (b.ghost) { b.r += b.vr; b.c += b.vc; return; }  // bolts etc.: fly straight
    let steps = Math.min(Math.abs(b.vr), world.maxSpeed), dir = Math.sign(b.vr);
    for (let i = 0; i < steps; i++) { if (free(world, b, b.r + dir, b.c, obstacles)) b.r += dir; else { b.vr = b.bounce > 0 ? -Math.round(b.vr * b.bounce) : 0; break; } }
    steps = Math.min(Math.abs(b.vc), world.maxSpeed); dir = Math.sign(b.vc);
    for (let i = 0; i < steps; i++) { if (free(world, b, b.r, b.c + dir, obstacles)) b.c += dir; else { b.vc = b.bounce > 0 ? -Math.round(b.vc * b.bounce) : 0; break; } }
  }
  function assignTargets(world) {
    const taken = new Set(world.bodies.filter(b => b.target).map(b => b.target));
    for (const b of world.bodies) {
      if (b.locked || b.target) continue;
      const hole = world.holes.find(hh => hh.sig === b.sig && !taken.has(hh.id));
      if (hole) { b.target = hole.id; taken.add(hole.id); }
    }
  }

  const DIRS = { down: [1, 0], up: [-1, 0], right: [0, 1], left: [0, -1] };

  // snake: greedy head step toward food, body follows, eating grows it + respawns food.
  function snakeRespawnFood(world, sn) {
    const occ = new Set(sn.body.map(([r, c]) => r + "," + c));
    for (let t = 0; t < 300; t++) { const r = world.rng.int(0, world.h - 1), c = world.rng.int(0, world.w - 1); if (!occ.has(r + "," + c)) { sn.food = [r, c]; return; } }
  }
  function stepSnake(world, sn) {
    const [hr, hc] = sn.body[0], [fr, fc] = sn.food;
    const occ = new Set(sn.body.slice(0, -1).map(([r, c]) => r + "," + c)); // tail frees up as it moves
    const toward = Math.abs(fr - hr) >= Math.abs(fc - hc)
      ? [[Math.sign(fr - hr), 0], [0, Math.sign(fc - hc)]]
      : [[0, Math.sign(fc - hc)], [Math.sign(fr - hr), 0]];
    let mv = null;
    for (const [dr, dc] of toward.concat([[1, 0], [-1, 0], [0, 1], [0, -1]])) {
      if (!dr && !dc) continue;
      const nr = hr + dr, nc = hc + dc;
      if (nr < 0 || nr >= world.h || nc < 0 || nc >= world.w || occ.has(nr + "," + nc)) continue;
      mv = [nr, nc]; break;
    }
    if (!mv) return;
    sn.body.unshift(mv);
    if (mv[0] === fr && mv[1] === fc) snakeRespawnFood(world, sn); else sn.body.pop();
  }

  // drop one falling unit into odometer register i (column ctr.c + i*gap).
  function addCounterUnit(world, ctr, i) {
    if (i >= ctr.colors.length) return;   // overflow past the last register
    const b = makeBody({ cells: [[0, 0]], r: ctr.r, c: ctr.c + i * ctr.gap, color: ctr.colors[i], gravity: true, kind: "unit" });
    world.bodies.push(b); ctr.bodies[i].push(b);
  }

  // ---- per-step simulation ---------------------------------------------------
  function stepWorld(world) {
    world.t++;
    if (world.sort) assignTargets(world);

    // voronoi seed drift
    for (const f of world.fields) if (f.type === "voronoi" && f.drift) {
      for (const s of f.seeds) {
        s.r += s.vr; s.c += s.vc;
        if (s.r < 0 || s.r >= world.h) { s.vr *= -1; s.r += s.vr; }
        if (s.c < 0 || s.c >= world.w) { s.vc *= -1; s.c += s.vc; }
      }
      f._reg = null;
    }

    // Game of Life: step each life field (emergence)
    for (const f of world.fields) if (f.type === "life") lifeStep(world, f);

    // shooters emit beams. bounce=1 → the bolt ricochets off walls (light reflection) instead of flying off.
    for (const sh of world.shooters) {
      if (world.t % sh.every !== 0) continue;
      const dirs = sh.beam === "spread"
        ? [sh.dir, [sh.dir[1], -sh.dir[0]], [-sh.dir[1], sh.dir[0]]]
        : [sh.dir];
      if (sh.beam !== "ray") for (const d of dirs) {
        world.bodies.push(makeBody({ cells: [[0, 0]], r: sh.r + d[0], c: sh.c + d[1], color: sh.color,
          vr: d[0] * sh.speed, vc: d[1] * sh.speed, kind: "bolt", ghost: !sh.bounce, bounce: sh.bounce ? 1 : 0, ttl: sh.bounce ? 60 : -1 }));
      }
    }

    // modular-counting odometers (carry first so a full register is seen, then add a unit)
    for (const ctr of world.counters) {
      if (world.t % ctr.every !== 0) continue;
      for (let i = 0; i < ctr.colors.length - 1; i++) {
        if (ctr.bodies[i].length >= ctr.base) {              // carry: clear this register, bump the next
          for (const ub of ctr.bodies[i]) ub._dead = true;
          ctr.bodies[i] = [];
          addCounterUnit(world, ctr, i + 1);
        }
      }
      world.bodies = world.bodies.filter(b => !b._dead);
      addCounterUnit(world, ctr, 0);                          // tick: one more base unit
    }

    // magnets: each body marches one cell toward the NEAREST other magnet of the SAME group
    // (same magnet value = same "bond colour/bump"), and stops when they touch → they dock.
    // Different groups ignore each other. Simple, predictable, no jitter.
    const mags = world.bodies.filter(b => b.magnet && !b.locked);
    for (const b of mags) {
      let best = null, bd = Infinity;
      for (const o of mags) { if (o === b || o.magnet !== b.magnet) continue; const d = Math.abs(o.r - b.r) + Math.abs(o.c - b.c); if (d < bd) { bd = d; best = o; } }
      b.vr = best ? Math.sign(best.r - b.r) : 0;
      b.vc = best ? Math.sign(best.c - b.c) : 0;
    }

    // snapshot positions so linked followers can copy a leader's exact displacement
    const prev = {}; for (const b of world.bodies) prev[b.id] = [b.r, b.c];

    // bodies: seek / gravity / spin / move
    for (const b of world.bodies) {
      if (b.locked || b.link) continue;     // linked followers move by copying their leader (below)
      if (world.sort && b.target) {
        const hole = world.holes.find(hh => hh.id === b.target);
        if (hole) { b.vr = Math.sign(hole.r - b.r); b.vc = Math.sign(hole.c - b.c); }
      } else if (b.magnet) {
        /* velocity already set by the magnet pass — pursue & dock (no gravity) */
      } else if (b.gravity) {
        b.vr += world.gravity[0]; b.vc += world.gravity[1];
        if (Math.abs(b.vr) > world.maxSpeed) b.vr = world.maxSpeed * Math.sign(b.vr);
        if (Math.abs(b.vc) > world.maxSpeed) b.vc = world.maxSpeed * Math.sign(b.vc);
      }
      // gravity wells: pull bodies toward the nearest well (central force → fall/orbit)
      if (world.wells.length && !b.magnet && !(world.sort && b.target)) {
        let best = null, bd = Infinity; for (const w of world.wells) { const d = Math.abs(w.r - b.r) + Math.abs(w.c - b.c); if (d < bd) { bd = d; best = w; } }
        if (best) { b.vr = Math.sign(best.r - b.r) * best.strength; b.vc = Math.sign(best.c - b.c) * best.strength; }   // march in & settle at centre (predictable attractor)
      }
      if (b.spin && world.t % b.spin === 0) b.cells = rotateCells(b.cells);
      const seeking = world.sort && b.target;
      moveBody(world, b, seeking ? new Set() : obstacleSet(world, b, false));
      if (seeking) { const hole = world.holes.find(hh => hh.id === b.target); if (hole && b.r === hole.r && b.c === hole.c && b.sig === hole.sig) { b.locked = true; b.vr = 0; b.vc = 0; } }
    }
    // identity links: a follower copies its leader's per-step movement exactly
    for (const b of world.bodies) {
      if (!b.link) continue;
      const ld = world.bodies.find(x => x.id === b.link);
      if (ld && prev[ld.id] && prev[b.id]) { b.r = prev[b.id][0] + (ld.r - prev[ld.id][0]); b.c = prev[b.id][1] + (ld.c - prev[ld.id][1]); }
    }
    // snakes: head steps toward food, body follows, eat = grow + respawn food
    for (const sn of world.snakes) stepSnake(world, sn);
    // conveyors: carry any body resting on the belt one step in the belt's direction (transport)
    for (const cv of world.conveyors) for (const b of world.bodies) {
      if (b.locked || b.kind === "bolt") continue;
      const onBelt = b.cells.some(([dr, dc]) => { const rr = b.r + dr + 1, cc = b.c + dc; return rr === cv.r && cc >= cv.c && cc < cv.c + cv.len; });
      if (onBelt) { const obs = obstacleSet(world, b, false); if (free(world, b, b.r, b.c + cv.dir, obs)) b.c += cv.dir; }
    }
    // path walkers: advance one cell along the drawn path each step (a worm/square following a route)
    for (const p of world.paths) p.pos = Math.min(p.pos + 1, p.cells.length - 1);
    // cull spent bolts (off grid) and ttl
    world.bodies = world.bodies.filter(b => {
      if (b.ttl > 0) b.ttl--;
      if (b.ttl === 0) return false;
      if (b.kind === "bolt" && offGrid(world, b)) return false;
      return true;
    });

    // liquid CA
    if (world.sources.length || world.liquid) liquidStep(world);
    if (world.spills.length || world.water) spillStep(world);
  }

  function ensureWater(world) { if (!world.water) world.water = new Array(world.h * world.w).fill(0); return world.water; }
  // ---- spill: a NEW, dead-simple cellular fluid -----------------------------
  // continuous (no dashes), laminar (deterministic tie-break), mass-conserving. water falls, then slides off
  // lips diagonally, then levels out sideways → it FILLS a container and OVERFLOWS the rim. solids block it.
  function spillStep(world) {
    const W = world.w, H = world.h, water = ensureWater(world);
    const solid = new Uint8Array(W * H);
    for (const b of world.bodies) { if (b.kind === "bolt") continue; for (const [dr, dc] of b.cells) { const r = b.r + dr, c = b.c + dc; if (inBounds(world, r, c)) solid[r * W + c] = 1; } }
    const empty = (r, c) => r >= 0 && r < H && c >= 0 && c < W && !water[r * W + c] && !solid[r * W + c];
    for (const s of world.spills) { const i = s.r * W + s.c; for (let k = 0; k < (s.rate || 1); k++) if (empty(s.r, s.c)) water[i] = s.color; }   // emit at the source (blocked source = no new mass)
    const moved = new Uint8Array(W * H);
    for (let r = H - 1; r >= 0; r--) for (let c = 0; c < W; c++) {     // bottom-up so each cell moves at most once
      const i = r * W + c; if (!water[i] || moved[i]) continue; const col = water[i];
      const go = (nr, nc) => { water[nr * W + nc] = col; water[i] = 0; moved[nr * W + nc] = 1; return true; };
      if (empty(r + 1, c)) { go(r + 1, c); continue; }                                   // fall straight
      const dl = empty(r + 1, c - 1), dr = empty(r + 1, c + 1);
      if (dl && dr) { (((r + c) & 1) ? go(r + 1, c + 1) : go(r + 1, c - 1)); continue; }   // slide off a lip
      if (dl) { go(r + 1, c - 1); continue; } if (dr) { go(r + 1, c + 1); continue; }
      const l = empty(r, c - 1), rr = empty(r, c + 1);                                    // supported → level out / overflow the rim
      if (l && rr) { (((r + c) & 1) ? go(r, c + 1) : go(r, c - 1)); continue; }
      if (l) { go(r, c - 1); continue; } if (rr) { go(r, c + 1); continue; }
    }
    if (world.walls === "none") for (let c = 0; c < W; c++) water[(H - 1) * W + c] = water[(H - 1) * W + c] && 0;  // drain off the open floor
  }

  // Cellular liquid — grid-local water simulation.
  // Each source injects exactly `amount` cells per active tick. Existing liquid then
  // moves one grid step per frame: down, diagonal off lips, or sideways under local
  // pressure. There is no destination solver and no decorative stream overlay; every
  // visible water cell is actual liquid state.
  //   viscosity 0..1 : how often a source emits (0 = every frame, 1 = sluggish).
  //   turbulence 0..1: 0 = deterministic; >0 = random tie-breaks among equally good cells.
  //   flow           : default cells added per active source frame.
  function liquidStep(world) {
    const H = world.h, W = world.w, L = ensureLiquid(world);
    const cfg = world.liquidCfg || { viscosity: 0, turbulence: 0, flow: 1 };
    const visc = Math.max(0, Math.min(1, cfg.viscosity));
    const turb = Math.max(0, Math.min(1, cfg.turbulence == null ? 0 : cfg.turbulence));
    const flowEvery = 1 + Math.round(visc * 4);
    const defaultAmount = Math.max(1, Math.min(24, cfg.flow == null ? 1 : Math.round(cfg.flow)));
    const solid = new Uint8Array(H * W);
    if (world.board) {
      const bd = world.board;
      for (let i = 0; i < bd.h; i++) for (let j = 0; j < bd.w; j++) { const rr = bd.r + i, cc = bd.c + j; if (inBounds(world, rr, cc)) solid[rr * W + cc] = 1; }
      for (const hole of world.holes) for (const [dr, dc] of hole.cells) { const rr = hole.r + dr, cc = hole.c + dc; if (inBounds(world, rr, cc)) solid[rr * W + cc] = 0; }
    }
    for (const b of world.bodies) { if (b.kind === "bolt") continue; for (const [dr, dc] of b.cells) { const rr = b.r + dr, cc = b.c + dc; if (inBounds(world, rr, cc)) solid[rr * W + cc] = 1; } }
    world.liquidStreams = [];

    for (let i = 0; i < L.length; i++) if (solid[i]) L[i] = 0;

    const next = L.slice();
    const moved = new Uint8Array(H * W);
    const blocked = (r, c) => r < 0 || r >= H || c < 0 || c >= W || solid[r * W + c];
    const empty = (r, c) => !blocked(r, c) && !next[r * W + c];
    const supported = (r, c) => blocked(r + 1, c) || !!next[(r + 1) * W + c];
    function dirOrder(r, c) {
      let dirs = ((world.t + r + c) & 1) ? [-1, 1] : [1, -1];
      if (turb > 0 && world.rng() < turb * 0.5) dirs = dirs.slice().reverse();
      return dirs;
    }
    function move(r, c, rr, cc, color) {
      const a = r * W + c, b = rr * W + cc;
      next[a] = 0; next[b] = color; moved[b] = 1;
    }
    function pushBelowSideways(r, c, color) {
      const br = r + 1, bi = br * W + c;
      if (br >= H || !next[bi] || moved[bi]) return false;
      for (const d of dirOrder(r, c)) {
        const cc = c + d, ti = br * W + cc;
        if (!empty(br, cc) || !supported(br, cc)) continue;
        next[ti] = next[bi]; moved[ti] = 1;
        next[bi] = color; moved[bi] = 1;
        next[r * W + c] = 0;
        return true;
      }
      return false;
    }
    function relaxRows() {
      for (let r = H - 1; r >= 0; r--) {
        let c = 0;
        while (c < W) {
          while (c < W && solid[r * W + c]) c++;
          const lo = c;
          while (c < W && !solid[r * W + c]) c++;
          const hi = c - 1;
          if (lo > hi) continue;
          const water = [];
          for (let x = lo; x <= hi; x++) if (next[r * W + x]) water.push([x, next[r * W + x]]);
          if (water.length <= 1) continue;
          const support = [];
          for (let x = lo; x <= hi; x++) if (blocked(r + 1, x) || next[(r + 1) * W + x]) support.push(x);
          const width = hi - lo + 1;
          if (support.length < width && support.length < water.length + 2) continue;
          const center = water.reduce((a, [x]) => a + x, 0) / water.length;
          let bestStart = -1, bestScore = Infinity;
          for (let start = lo; start + water.length - 1 <= hi; start++) {
            let ok = true;
            for (let x = start; x < start + water.length; x++) {
              if (!(blocked(r + 1, x) || next[(r + 1) * W + x])) { ok = false; break; }
            }
            if (!ok) continue;
            const score = Math.abs((start + (water.length - 1) / 2) - center);
            if (score < bestScore) { bestScore = score; bestStart = start; }
          }
          if (bestStart < 0) continue;
          water.sort((a, b) => a[0] - b[0]);
          for (let x = lo; x <= hi; x++) next[r * W + x] = 0;
          for (let k = 0; k < water.length; k++) next[r * W + bestStart + k] = water[k][1];
        }
      }
    }

    for (let r = H - 1; r >= 0; r--) {
      const start = ((world.t + r) & 1) ? W - 1 : 0;
      const step = start ? -1 : 1;
      for (let k = 0; k < W; k++) {
        const c = start + k * step, i = r * W + c, color = L[i];
        if (!color || moved[i] || next[i] !== color || blocked(r, c)) continue;
        if (empty(r + 1, c)) { move(r, c, r + 1, c, color); continue; }
        if (pushBelowSideways(r, c, color)) continue;
        let done = false;
        for (const d of dirOrder(r, c)) {
          if (empty(r, c + d) && empty(r + 1, c + d)) {
            move(r, c, r + 1, c + d, color); done = true; break;
          }
        }
        if (done) continue;
        for (const d of dirOrder(r, c)) {
          if (empty(r, c + d) && supported(r, c + d)) {
            move(r, c, r, c + d, color); break;
          }
        }
      }
    }
    relaxRows();

    for (const s of world.sources) {
      if (!inBounds(world, s.r, s.c) || solid[s.r * W + s.c]) continue;
      if ((world.t % (s.rate || 1)) !== 0 || (world.t % flowEvery) !== 0) continue;
      const amount = Math.max(1, Math.min(24, s.amount || defaultAmount));
      for (let n = 0; n < amount; n++) if (!emitSource(s)) break;
    }
    relaxRows();
    world.liquid = next;

    function emitSource(s) {
      let r = s.r, c = s.c;
      if (blocked(r, c)) return false;
      while (r < H && !blocked(r, c)) {
        const i = r * W + c;
        if (!next[i]) { next[i] = s.color; return true; }
        r++;
      }
      const slot = pressureSlot(s);
      if (slot) { next[slot[0] * W + slot[1]] = s.color; return true; }
      return false;
    }
    function pressureSlot(s) {
      const start = s.r * W + s.c;
      if (!next[start]) return null;
      const seen = new Uint8Array(H * W), q = [[s.r, s.c, 0]];
      seen[start] = 1;
      let head = 0, best = null, bestScore = null;
      while (head < q.length) {
        const [r, c, dist] = q[head++];
        for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const rr = r + dr, cc = c + dc;
          if (blocked(rr, cc)) continue;
          const i = rr * W + cc;
          if (next[i]) {
            if (next[i] === next[start] && !seen[i]) { seen[i] = 1; q.push([rr, cc, dist + 1]); }
          } else if (supported(rr, cc)) {
            const score = [-rr, Math.abs(cc - s.c), dist];
            if (!best || score[0] < bestScore[0] ||
              (score[0] === bestScore[0] && (score[1] < bestScore[1] ||
                (score[1] === bestScore[1] && score[2] < bestScore[2])))) {
              best = [rr, cc]; bestScore = score;
            }
          }
        }
      }
      return best;
    }
  }

  // ---- value/Perlin noise (for the random grid generators) -------------------
  function makeNoise2D(seed) {
    const rng = makeRng(seed), p = [...Array(256).keys()];
    for (let i = 255; i > 0; i--) { const j = rng.int(0, i);[p[i], p[j]] = [p[j], p[i]]; }
    const perm = new Array(512); for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
    const fade = t => t * t * t * (t * (t * 6 - 15) + 10), lerp = (a, b, t) => a + (b - a) * t;
    const grad = (h, x, y) => ((h & 1) ? -x : x) + ((h & 2) ? -y : y);
    return (x, y) => {
      const X = Math.floor(x) & 255, Y = Math.floor(y) & 255, xf = x - Math.floor(x), yf = y - Math.floor(y);
      const u = fade(xf), v = fade(yf);
      const aa = perm[perm[X] + Y], ab = perm[perm[X] + Y + 1], ba = perm[perm[X + 1] + Y], bb = perm[perm[X + 1] + Y + 1];
      const x1 = lerp(grad(aa, xf, yf), grad(ba, xf - 1, yf), u), x2 = lerp(grad(ab, xf, yf - 1), grad(bb, xf - 1, yf - 1), u);
      return Math.max(0, Math.min(1, (lerp(x1, x2, v) + 1) / 2));
    };
  }
  function buildNoiseField(world, mode, opts) {
    const H = world.h, W = world.w, rng = makeRng(world.seed + 777), grid = [];
    const colors = opts.colors && opts.colors.length ? opts.colors : (mode === "perlin" ? [0, 8, 1, 9] : [0, 1, 2]);
    if (mode === "perlin") {
      const noise = makeNoise2D(world.seed + 13), scale = opts.scale || 6;
      for (let r = 0; r < H; r++) { const row = []; for (let c = 0; c < W; c++) { const v = noise(c / scale, r / scale); row.push(colors[Math.min(colors.length - 1, Math.floor(v * colors.length))]); } grid.push(row); }
    } else {
      let probs = opts.probs && opts.probs.length === colors.length ? opts.probs.slice() : colors.map(() => 1 / colors.length);
      const sum = probs.reduce((a, b) => a + b, 0); probs = probs.map(p => p / sum);
      const cum = []; let acc = 0; for (const p of probs) { acc += p; cum.push(acc); }
      for (let r = 0; r < H; r++) { const row = []; for (let c = 0; c < W; c++) { const u = rng(); let i = 0; while (i < cum.length - 1 && u > cum[i]) i++; row.push(colors[i]); } grid.push(row); }
    }
    return { type: "noise", grid };
  }

  // ---- Conway's Game of Life (emergence prior) -------------------------------
  function buildLife(world, opts) {
    const H = world.h, W = world.w, rng = makeRng(world.seed + 91), grid = [];
    const density = opts.density == null ? 0.35 : opts.density, color = opts.color == null ? 3 : opts.color;
    for (let r = 0; r < H; r++) { const row = []; for (let c = 0; c < W; c++) row.push(rng() < density ? color : 0); grid.push(row); }
    return { type: "life", grid, color };
  }
  function lifeStep(world, f) {
    const H = world.h, W = world.w, g = f.grid, n = Array.from({ length: H }, () => new Array(W).fill(0));
    for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
      let live = 0; for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) { if (!dr && !dc) continue; const rr = r + dr, cc = c + dc; if (rr >= 0 && rr < H && cc >= 0 && cc < W && g[rr][cc]) live++; }
      n[r][c] = g[r][c] ? ((live === 2 || live === 3) ? f.color : 0) : (live === 3 ? f.color : 0);
    }
    f.grid = n;
  }

  // ---- maze: recursive-backtracker generation + BFS auto-solver --------------
  function buildMaze(world, opts) {
    const H = world.h, W = world.w, rng = makeRng(world.seed + 55), wall = opts.wall == null ? 5 : opts.wall;
    const grid = Array.from({ length: H }, () => new Array(W).fill(wall)), key = (r, c) => r + "," + c;
    const carve = (r, c) => {
      grid[r][c] = 0; const d = [[0, 2], [0, -2], [2, 0], [-2, 0]];
      for (let i = d.length - 1; i > 0; i--) { const j = rng.int(0, i);[d[i], d[j]] = [d[j], d[i]]; }
      for (const [dr, dc] of d) { const nr = r + dr, nc = c + dc; if (nr > 0 && nr < H - 1 && nc > 0 && nc < W - 1 && grid[nr][nc] === wall) { grid[r + dr / 2][c + dc / 2] = 0; carve(nr, nc); } }
    };
    carve(1, 1);
    const start = [1, 1], end = [H % 2 ? H - 2 : H - 3, W % 2 ? W - 2 : W - 3]; grid[end[0]][end[1]] = 0;
    let path = null;
    if (opts.solve != null) {
      const q = [start], prev = { [key(start[0], start[1])]: null };
      while (q.length) { const [r, c] = q.shift(); if (r === end[0] && c === end[1]) break; for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nr = r + dr, nc = c + dc; if (nr >= 0 && nr < H && nc >= 0 && nc < W && grid[nr][nc] !== wall && !(key(nr, nc) in prev)) { prev[key(nr, nc)] = [r, c]; q.push([nr, nc]); } } }
      path = []; let cur = end; while (cur) { path.push(cur); cur = prev[key(cur[0], cur[1])]; } path.reverse();
    }
    return { type: "maze", grid, wall, path, solve: opts.solve, start, end };
  }

  // ---- rendering: world -> grid ---------------------------------------------
  function blank(world) { return Array.from({ length: world.h }, () => new Array(world.w).fill(world.bg)); }
  function put(g, world, r, c, color) { if (inBounds(world, r, c)) g[r][c] = color; }

  function renderVoronoi(g, world, f) {
    const H = world.h, W = world.w;
    const reg = f._reg && f._reg.length === H * W ? f._reg : (f._reg = new Array(H * W));
    for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
      let best = Infinity, bi = 0;
      for (let i = 0; i < f.seeds.length; i++) {
        const s = f.seeds[i], dr = r - s.r, dc = c - s.c;
        const d = f.metric === "manhattan" ? Math.abs(dr) + Math.abs(dc) : dr * dr + dc * dc;
        if (d < best) { best = d; bi = i; }
      }
      reg[r * W + c] = bi; g[r][c] = f.seeds[bi].color;
    }
    if (f.borders != null) for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
      const i = reg[r * W + c];
      if ((r + 1 < H && reg[(r + 1) * W + c] !== i) || (c + 1 < W && reg[r * W + c + 1] !== i)) g[r][c] = f.borders;
    }
  }

  function renderFrame(world, opts) {
    const g = blank(world);
    const owners = opts && opts.owners ? Array.from({ length: world.h }, () => new Array(world.w).fill(null)) : null;

    for (const f of world.fields) {
      if (f.type === "voronoi") renderVoronoi(g, world, f);
      else if (f.type === "noise" && f.grid) for (let r = 0; r < world.h; r++) for (let c = 0; c < world.w; c++) put(g, world, r, c, f.grid[r][c]);
      else if (f.type === "life") for (let r = 0; r < world.h; r++) for (let c = 0; c < world.w; c++) { if (f.grid[r][c]) put(g, world, r, c, f.grid[r][c]); }
      else if (f.type === "wave") { const mid = (world.h - 1) / 2; for (let c = 0; c < world.w; c++) put(g, world, Math.round(mid + f.amp * Math.sin(2 * Math.PI * (c / f.period + world.t / f.period))), c, f.color); }
      else if (f.type === "maze") {
        for (let r = 0; r < world.h; r++) for (let c = 0; c < world.w; c++) if (f.grid[r][c]) put(g, world, r, c, f.grid[r][c]);
        if (f.path) { const n = Math.min(f.path.length, world.t); for (let i = 0; i < n; i++) put(g, world, f.path[i][0], f.path[i][1], f.solve); }
        if (f.solve != null) { put(g, world, f.start[0], f.start[1], f.solve); put(g, world, f.end[0], f.end[1], f.solve); }
      }
    }
    // well centres (a marker pixel; conveyor belts are static bodies and render themselves)
    for (const w of world.wells) put(g, world, w.r, w.c, w.color);

    if (world.board) {
      const bd = world.board;
      for (let i = 0; i < bd.h; i++) for (let j = 0; j < bd.w; j++) put(g, world, bd.r + i, bd.c + j, bd.color);
      for (const hole of world.holes) for (const [dr, dc] of hole.cells) put(g, world, hole.r + dr, hole.c + dc, world.bg);
    } else {
      for (const hole of world.holes) for (const [dr, dc] of hole.cells) put(g, world, hole.r + dr, hole.c + dc, world.bg);
      for (const hole of world.holes) for (const [dr, dc] of outerOutline(hole.cells)) put(g, world, hole.r + dr, hole.c + dc, hole.color);
    }

    if (world.liquid) for (let r = 0; r < world.h; r++) for (let c = 0; c < world.w; c++) { const col = world.liquid[r * world.w + c]; if (col) g[r][c] = col; }
    if (world.water) for (let r = 0; r < world.h; r++) for (let c = 0; c < world.w; c++) { const col = world.water[r * world.w + c]; if (col && g[r][c] === world.bg) g[r][c] = col; }
    if (world.liquidStreams) for (const [r, c, col] of world.liquidStreams) if (inBounds(world, r, c) && g[r][c] === world.bg) g[r][c] = col;

    // bodies drawn by layer (ascending), then insertion order; hidden layers skipped.
    const hidden = world.hiddenLayers || [];
    const ordered = world.bodies.map((b, i) => [b, i]).filter(([b]) => !hidden.includes(b.layer | 0))
      .sort((a, b) => ((a[0].layer | 0) - (b[0].layer | 0)) || (a[1] - b[1]));
    for (const [b] of ordered) {
      const drawCell = (dr, dc, col) => { put(g, world, b.r + dr, b.c + dc, col); if (owners && inBounds(world, b.r + dr, b.c + dc)) owners[b.r + dr][b.c + dc] = b; };
      if (b.fill === "outline") { for (const [dr, dc] of outline(b.cells)) drawCell(dr, dc, b.color); }
      else if (b.interior != null) { const I = new Set(interiorOf(b.cells).map(([r, c]) => r + "," + c)); for (const [dr, dc] of b.cells) drawCell(dr, dc, I.has(dr + "," + dc) ? b.interior : b.color); }
      else { for (const [dr, dc] of b.cells) drawCell(dr, dc, b.color); }
    }

    // snakes: food, then body (head a touch brighter via headColor)
    for (const sn of world.snakes) {
      if (sn.food) put(g, world, sn.food[0], sn.food[1], sn.foodColor);
      sn.body.forEach(([r, c], i) => put(g, world, r, c, i === 0 ? sn.headColor : sn.color));
    }
    // paths: the route (gray by default, unless hidden), candies ahead of the walker (eaten as it passes), then the walker
    for (const p of world.paths) {
      if (!p.hidden) for (const [r, c] of p.cells) if (inBounds(world, r, c) && g[r][c] === world.bg) put(g, world, r, c, p.color);
      if (p.candy != null) for (let i = 0; i < p.cells.length; i++) if (i > 0 && i % p.every === 0 && i > p.pos) { const [r, c] = p.cells[i]; if (inBounds(world, r, c)) put(g, world, r, c, p.candy); }
      const w = p.cells[p.pos]; if (w) put(g, world, w[0], w[1], p.walker);
    }

    // rays: march from each shooter to the first non-bg cell or wall
    for (const sh of world.shooters) if (sh.beam === "ray") {
      let r = sh.r + sh.dir[0], c = sh.c + sh.dir[1];
      while (inBounds(world, r, c) && g[r][c] === world.bg) { g[r][c] = sh.color; r += sh.dir[0]; c += sh.dir[1]; }
    }

    if (world.markEnclosed != null) markEnclosedRegions(g, world, world.markEnclosed);
    return owners ? { grid: g, owners } : g;
  }

  function markEnclosedRegions(g, world, color) {
    const H = world.h, W = world.w, bg = world.bg;
    const reach = Array.from({ length: H }, () => new Array(W).fill(false)), stack = [];
    for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) if ((r === 0 || c === 0 || r === H - 1 || c === W - 1) && g[r][c] === bg && !reach[r][c]) { reach[r][c] = true; stack.push([r, c]); }
    while (stack.length) { const [r, c] = stack.pop(); for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nr = r + dr, nc = c + dc; if (nr >= 0 && nr < H && nc >= 0 && nc < W && !reach[nr][nc] && g[nr][nc] === bg) { reach[nr][nc] = true; stack.push([nr, nc]); } } }
    for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) if (g[r][c] === bg && !reach[r][c]) g[r][c] = color;
  }

  // ---- simulation driver -> frames ------------------------------------------
  function simulate(world, steps, opts = {}) {
    if (opts.fresh) world.frames = [];
    if (world.frames.length === 0 || opts.includeInitial) world.frames.push(renderFrame(world));
    for (let i = 0; i < steps; i++) { stepWorld(world); world.frames.push(renderFrame(world)); }
    return world.frames;
  }
  function hold(world, n) { const last = world.frames.length ? world.frames[world.frames.length - 1] : renderFrame(world); for (let i = 0; i < n; i++) world.frames.push(last.map(r => r.slice())); return world.frames; }

  // ---- 2dgridvid JSON --------------------------------------------------------
  function toGridVid(world, extra = {}) {
    return {
      format: "2dgridvid", version: VERSION, width: world.w, height: world.h,
      palette: "arc10", fps: extra.fps || 6,
      meta: Object.assign({ seed: world.seed }, world.meta, extra),
      frames: world.frames.map(g => g.map(r => r.slice())),
    };
  }

  // ---- augmentation (ARC-style: D4 transforms + color permutation) ----------
  function rot90(g) { const H = g.length, W = g[0].length, o = Array.from({ length: W }, () => new Array(H)); for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) o[c][H - 1 - r] = g[r][c]; return o; }
  function flipH(g) { return g.map(r => r.slice().reverse()); }
  function flipV(g) { return g.slice().reverse().map(r => r.slice()); }
  function transposeGrid(g) { const H = g.length, W = g[0].length, o = Array.from({ length: W }, () => new Array(H)); for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) o[c][r] = g[r][c]; return o; }
  function transformGrid(g, k, flip) { let o = g; for (let i = 0; i < ((k % 4) + 4) % 4; i++) o = rot90(o); if (flip) o = flipH(o); return o; }
  function permuteColors(g, perm) { return g.map(r => r.map(c => (perm[c] != null ? perm[c] : c))); }
  // sort the rows of a grid by how many cells equal colour `col` (ascending; desc reverses).
  function sortRowsByCount(g, col, desc) { const o = g.map(r => r.slice()); o.sort((a, b) => a.filter(x => x === col).length - b.filter(x => x === col).length); return desc ? o.reverse() : o; }
  // Latin-square completion: fill 0s so every row and column contains each non-zero value once. Constraint
  // propagation + backtracking on a small grid. Returns the solved grid, or the input unchanged if unsolvable.
  function solveLatin(g) {
    const N = g.length; if (!g.every(r => r.length === N)) return g;     // must be square
    const vals = [...new Set(g.flat().filter(x => x))]; if (vals.length !== N) return g;
    const grid = g.map(r => r.slice());
    const ok = (r, c, v) => { for (let i = 0; i < N; i++) if (grid[r][i] === v || grid[i][c] === v) return false; return true; };
    const solve = () => {
      let br = -1, bc = -1, best = N + 1;
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (!grid[r][c]) { const cand = vals.filter(v => ok(r, c, v)); if (cand.length < best) { best = cand.length; br = r; bc = c; } }
      if (br === -1) return true;                                        // all filled
      for (const v of vals) if (ok(br, bc, v)) { grid[br][bc] = v; if (solve()) return true; grid[br][bc] = 0; }
      return false;
    };
    return solve() ? grid : g;
  }
  function randomColorPerm(rng) { const ids = [1, 2, 3, 4, 5, 6, 7, 8, 9], sh = ids.slice(); for (let i = sh.length - 1; i > 0; i--) { const j = rng.int(0, i);[sh[i], sh[j]] = [sh[j], sh[i]]; } const perm = { 0: 0 }; ids.forEach((c, i) => (perm[c] = sh[i])); return perm; }
  function resample(frames, stride) { if (stride <= 1) return frames; const o = []; for (let i = 0; i < frames.length; i += stride) o.push(frames[i]); if (o[o.length - 1] !== frames[frames.length - 1]) o.push(frames[frames.length - 1]); return o; }

  // external zoom: k>=2 zooms IN (duplicates every pixel into a k×k block → "more detailed");
  // k<=-2 zooms OUT (nearest-sample downscale by |k| → coarser).
  function zoomGrid(g, k) {
    if (k >= 2) { const o = []; for (const row of g) { const big = []; for (const v of row) for (let x = 0; x < k; x++) big.push(v); for (let y = 0; y < k; y++) o.push(big.slice()); } return o; }
    if (k <= -2) { const f = -k, o = []; for (let r = 0; r < g.length; r += f) { const row = []; for (let c = 0; c < g[0].length; c += f) row.push(g[r][c]); o.push(row); } return o; }
    return g.map(r => r.slice());
  }
  function zoomVid(vid, k) { const frames = vid.frames.map(g => zoomGrid(g, k)); return Object.assign({}, vid, { width: frames[0][0].length, height: frames[0].length, frames }); }
  // translate a grid by (dr,dc), same size, padding with bg (overflow cropped).
  function shiftGrid(g, dr, dc, bg = 0) { const H = g.length, W = g[0].length, o = Array.from({ length: H }, () => new Array(W).fill(bg)); for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) { const nr = r + dr, nc = c + dc; if (nr >= 0 && nr < H && nc >= 0 && nc < W) o[nr][nc] = g[r][c]; } return o; }
  function randomZoom(rng, opts) {
    if (!opts || !opts.zoom) return 1;
    const choices = opts.zoomChoices && opts.zoomChoices.length ? opts.zoomChoices : [1, 1, 2, -2];
    return rng.pick(choices);
  }
  function modalStaticColor(frames, r, c, staticSet, bg) {
    const counts = {};
    for (const g of frames) {
      const v = g[r][c];
      if (!staticSet.has(v)) continue;
      counts[v] = (counts[v] || 0) + 1;
    }
    let best = bg, bn = -1;
    for (const k of Object.keys(counts)) if (counts[k] > bn) { best = +k; bn = counts[k]; }
    return best;
  }
  function materializeVid(vid, opts = {}) {
    const framesIn = vid.frames || [], first = framesIn[0], final = framesIn[framesIn.length - 1];
    if (!first || !final) return Object.assign({}, vid, { frames: [] });
    const H = final.length, W = final[0].length, bg = opts.bg == null ? 0 : opts.bg;
    const staticColors = opts.staticColors || [0, 5], staticSet = new Set(staticColors);
    const cells = [], base = final.map(r => r.slice());
    for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
      const col = final[r][c], changed = framesIn.some(g => g[r][c] !== col);
      if (!changed || staticSet.has(col)) continue;
      cells.push([r, c, col]);
      base[r][c] = modalStaticColor(framesIn, r, c, staticSet, bg);
    }
    const order = opts.order || "tlbr", rng = makeRng(opts.seed || 1);
    if (order === "btlr") cells.sort((a, b) => b[0] - a[0] || a[1] - b[1]);
    else if (order === "random") for (let i = cells.length - 1; i > 0; i--) { const j = rng.int(0, i);[cells[i], cells[j]] = [cells[j], cells[i]]; }
    else cells.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const per = Math.max(1, Math.round(opts.cellsPerFrame || 1)), holdN = Math.max(0, Math.round(opts.hold == null ? 4 : opts.hold));
    const out = [base.map(r => r.slice())], cur = base.map(r => r.slice());
    for (let i = 0; i < cells.length; i += per) {
      for (let j = i; j < Math.min(cells.length, i + per); j++) { const [r, c, col] = cells[j]; cur[r][c] = col; }
      out.push(cur.map(r => r.slice()));
    }
    for (let i = 0; i < holdN; i++) out.push(final.map(r => r.slice()));
    return Object.assign({}, vid, { fps: opts.fps || vid.fps || 6, frames: out, meta: Object.assign({}, vid.meta, { augment: Object.assign({}, vid.meta && vid.meta.augment, { materialize: true, order, cellsPerFrame: per }) }) });
  }
  // pixel-level aug on finished frames: D4 + color permutation + framerate (fps + frame stride).
  function augmentVid(vid, opts = {}) {
    const rng = makeRng(opts.seed || 1), out = [], n = opts.n || 8;
    const d4 = opts.d4 !== false, color = opts.color !== false, rate = !!opts.rate;
    for (let i = 0; i < n; i++) {
      const k = d4 ? rng.int(0, 3) : 0, flip = d4 ? rng() < 0.5 : false, perm = color ? randomColorPerm(rng) : null;
      const stride = rate ? rng.int(1, 3) : 1, fps = rate ? rng.int(4, 16) : (vid.fps || 6), zoom = randomZoom(rng, opts);
      let frames = vid.frames.map(g => { let t = transformGrid(g, k, flip); if (perm) t = permuteColors(t, perm); return t; });
      frames = resample(frames, stride);
      if (zoom !== 1) frames = frames.map(g => zoomGrid(g, zoom));
      out.push(Object.assign({}, vid, { width: frames[0][0].length, height: frames[0].length, fps, frames, meta: Object.assign({}, vid.meta, { augment: { k, flip, color: !!perm, stride, fps, zoom, index: i } }) }));
    }
    return out;
  }

  // text helpers for scene-level augmentation
  function upsertLine(text, prefix, full) {
    const L = String(text).split(/\r?\n/), re = new RegExp("^\\s*" + prefix + "\\b");
    const i = L.findIndex(l => re.test(l));
    if (i >= 0) L[i] = full; else { let j = L.findIndex(l => /^\s*(run|hold)\b/.test(l)); if (j < 0) j = L.length; L.splice(j, 0, full); }
    return L.join("\n");
  }
  // "crazy" augmentation: RE-SIMULATE the scene with perturbed seed + fluid (viscosity/
  // turbulence/flow) + gravity, then apply random framerate + D4 + color permutation.
  function augmentScene(text, opts = {}) {
    const rng = makeRng(opts.seed || 1), n = opts.n || 8, out = [];
    const hasFluid = /\b(liquid|source)\b/.test(text);
    for (let i = 0; i < n; i++) {
      let t = upsertLine(text, "seed", "seed " + rng.int(1, 99999));
      if (hasFluid) t = upsertLine(t, "liquid", `liquid viscosity ${(rng.int(0, 10) / 10)} turbulence ${(rng.int(0, 10) / 10)} flow ${rng.int(1, 10)}`);
      let world; try { world = runScene(t); } catch (e) { continue; }
      let vid = toGridVid(world);
      const k = rng.int(0, 3), flip = rng() < 0.5, perm = randomColorPerm(rng), stride = rng.int(1, 3), fps = rng.int(4, 16), zoom = randomZoom(rng, opts);
      let frames = resample(vid.frames.map(g => permuteColors(transformGrid(g, k, flip), perm)), stride);
      if (zoom !== 1) frames = frames.map(g => zoomGrid(g, zoom));
      out.push(Object.assign({}, vid, { width: frames[0][0].length, height: frames[0].length, fps, frames, meta: Object.assign({}, vid.meta, { augment: { scene: true, k, flip, stride, fps, zoom, index: i } }) }));
    }
    return out;
  }

  // ---- scene-DSL -------------------------------------------------------------
  function tokenize(line) { return line.replace(/,/g, " ").trim().split(/\s+/).filter(Boolean); }
  const KEYWORDS = new Set(["at", "color", "vel", "bounce", "grav", "fill", "interior", "id", "target", "random", "v", "spin", "speed", "dir", "every", "beam", "rate", "amount", "metric", "drift", "borders", "colors", "probs", "scale", "layer", "viscosity", "turbulence", "flow", "magnet", "base", "gap", "link", "len", "food", "ghost", "density", "amp", "period", "strength", "wall", "solve", "to", "by", "rot", "flip", "tint", "axis", "times", "shape", "largest", "smallest", "all", "cells", "rand", "box", "cell", "holes", "program", "outline", "factor", "irregular"]);
  function parseShape(toks, i) {
    const name = toks[i++], args = [];
    // a shape arg is a number OR 'rand LO HI' (resolved per-seed at spawn time → size varies across examples).
    while (i < toks.length && (toks[i] === "rand" || (!KEYWORDS.has(toks[i]) && !isNaN(Number(toks[i]))))) {
      if (toks[i] === "rand") { args.push({ rand: [+toks[i + 1], +toks[i + 2]] }); i += 3; }
      else args.push(Number(toks[i++]));
    }
    if (toks[i] === "v") { args.push(1); i++; }
    return { name, args, i };
  }
  function parseKV(toks, i) {
    const kv = { vr: 0, vc: 0 };
    while (i < toks.length) {
      const k = toks[i++];
      if (k === "at") { kv.r = +toks[i++]; kv.c = +toks[i++]; }
      else if (k === "color") {
        if (toks[i] === "rand") { i++; let lo = 1, hi = 9; if (!isNaN(Number(toks[i])) && !KEYWORDS.has(toks[i])) { lo = +toks[i++]; hi = +toks[i++]; } kv.colorRand = [lo, hi]; }
        else kv.color = +toks[i++];
      }
      else if (k === "vel") { kv.vr = +toks[i++]; kv.vc = +toks[i++]; }
      else if (k === "bounce") kv.bounce = +toks[i++];
      else if (k === "grav") kv.grav = +toks[i++] ? true : false;
      else if (k === "fill") kv.fill = toks[i++];
      else if (k === "interior") kv.interior = +toks[i++];
      else if (k === "spin") kv.spin = +toks[i++];
      else if (k === "layer") kv.layer = +toks[i++];
      else if (k === "ghost") kv.ghost = +toks[i++] ? true : false;
      else if (k === "magnet") kv.magnet = +toks[i++];
      else if (k === "link") kv.link = toks[i++];
      else if (k === "id") kv.id = toks[i++];
      else if (k === "target") kv.target = toks[i++];
      else if (k === "amount") kv.amount = +toks[i++];
      else if (k === "random") { kv.random = true; const nums = []; while (i < toks.length && !KEYWORDS.has(toks[i]) && !isNaN(Number(toks[i]))) nums.push(+toks[i++]); if (nums.length === 4) kv.randBox = nums; }
    }
    return kv;
  }

  // resolve a body selector SEL → matched bodies. forms:
  //   NAME (bare body id) · at R C (covers cell) · color C · shape NAME (kind) · largest · smallest · all
  //   it (the current dispatch object) · where PRED [is V] (predicate filter — see PREDICATES)
  function resolveSel(world, toks, i) {
    const k = toks[i++]; let bodies = [];
    if (k === "at") { const r = +toks[i++], c = +toks[i++]; bodies = world.bodies.filter(b => absCells(b).some(([rr, cc]) => rr === r && cc === c)); }
    else if (k === "color") { const col = +toks[i++]; bodies = world.bodies.filter(b => b.color === col); }
    else if (k === "shape") { const nm = toks[i++]; bodies = world.bodies.filter(b => b.kind === nm); }
    else if (k === "where") {   // where PRED [is V] — V given ⇒ value==V, else predicate truthy
      const pred = toks[i++]; let want = null;
      if (toks[i] === "is") { i++; want = toks[i++]; }
      bodies = world.bodies.filter(b => { const v = evalPred(pred, b); return want == null ? predTruthy(v) : String(v) === want; });
    }
    else if (k === "odd") {   // odd [by PROP] — the body whose PROP differs from the modal value (odd-one-out). PROP defaults to shape.
      let prop = "shape"; if (toks[i] === "by") { i++; prop = toks[i++]; }
      const valOf = b => (prop === "shape" || prop === "kind") ? b.kind : prop === "color" ? b.color : (prop === "size" || prop === "count") ? b.cells.length : evalPred(prop, b);
      const counts = {}; for (const b of world.bodies) { const v = String(valOf(b)); counts[v] = (counts[v] || 0) + 1; }
      let modal = null, best = -1; for (const v in counts) if (counts[v] > best) { best = counts[v]; modal = v; }
      bodies = world.bodies.filter(b => String(valOf(b)) !== modal);
    }
    else if (k === "it") bodies = world._it ? [world._it] : [];   // the object the enclosing dispatch is routing
    else if (k === "largest") bodies = world.bodies.slice().sort((a, b) => b.cells.length - a.cells.length).slice(0, 1);
    else if (k === "smallest") bodies = world.bodies.slice().sort((a, b) => a.cells.length - b.cells.length).slice(0, 1);
    else if (k === "all" || k === "sel") bodies = world.bodies.slice();   // 'sel' = forgiving alias for all current bodies
    else if (k) bodies = world.bodies.filter(b => b.id === k);  // bare token = body id
    else throw new Error("empty selector");
    return { bodies, i };
  }
  // parse the operation options that trail a SEL verb.
  function parseOps(toks, i) {
    const o = {};
    while (i < toks.length) {
      const k = toks[i++];
      if (k === "to") { o.r = +toks[i++]; o.c = +toks[i++]; }
      else if (k === "by") { o.dr = +toks[i++]; o.dc = +toks[i++]; }
      else if (k === "rot") o.rot = +toks[i++];
      else if (k === "flip") o.flip = toks[i++];
      else if (k === "tint") o.tint = +toks[i++];
      else if (k === "interior") o.interior = +toks[i++];
      else if (k === "axis") o.axis = toks[i++];
      else if (k === "gap") o.gap = +toks[i++];
      else if (k === "times") { o.times = +toks[i++]; o.tdr = +toks[i++]; o.tdc = +toks[i++]; }
      else if (k === "id") o.id = toks[i++];
    }
    return o;
  }

  // ---- macro layer: function definition + composition (def/use/repeat) -------
  // 'def NAME p1 p2 .. \n  body \n end' defines a function; 'use NAME a1 a2 ..' calls it (nestable = composition);
  // 'repeat N idx \n body \n end' iterates. Bodies substitute $p, with arithmetic $p+K / $p-K / $p*K.
  function expandMacros(text) {
    const lines = String(text).split(/\r?\n/), macros = {}, top = [];
    for (let i = 0; i < lines.length; i++) {
      const t = lines[i].replace(/#.*$/, "").trim(), m = t.match(/^def\s+(\w+)\s*(.*)$/);
      if (m) { const params = m[2].split(/\s+/).filter(Boolean), body = []; let d = 1; i++;
        for (; i < lines.length; i++) { const tt = lines[i].replace(/#.*$/, "").trim(); if (/^(def|repeat)\s+/.test(tt)) d++; if (tt === "end") { if (--d === 0) break; } body.push(lines[i]); }
        macros[m[1]] = { params, body };
      } else top.push(lines[i]);
    }
    // a macro-time rng seeded from the scene's own `seed` line, so `repeat rand LO HI` picks a per-seed count at expand time.
    const seedM = String(text).match(/^\s*seed\s+(\d+)/m); const mrng = makeRng(seedM ? +seedM[1] : 1);
    const evalArith = tok => {           // evaluate an integer expression like "1*4+1" (× before ±, L→R)
      const t = tok.match(/-?\d+|[+\-*]/g); if (!t) return tok;
      const a = []; for (let i = 0; i < t.length; i++) { if (t[i] === "*") a[a.length - 1] = String(+a[a.length - 1] * +t[++i]); else a.push(t[i]); }
      let r = +a[0]; for (let i = 1; i < a.length; i += 2) r = a[i] === "-" ? r - +a[i + 1] : r + +a[i + 1];
      return String(r);
    };
    const subst = (line, env) => line
      .replace(/\$(\w+)/g, (_, name) => (name in env) ? String(env[name]) : "$" + name)   // $var → value
      .replace(/(^|[\s,])(-?\d+(?:[-+*]\d+)+)(?=[\s,]|$)/g, (_, pre, expr) => pre + evalArith(expr));  // fold arithmetic
    const expand = (src, env, depth) => {
      if (depth > 60) throw new Error("macro recursion too deep");
      const out = [];
      for (let i = 0; i < src.length; i++) {
        const raw = src[i], t = raw.replace(/#.*$/, "").trim(); let m;
        if (m = t.match(/^use\s+(\w+)\s*(.*)$/)) {
          const mac = macros[m[1]]; if (!mac) throw new Error("unknown macro: " + m[1]);
          const args = subst(m[2], env).split(/\s+/).filter(Boolean), env2 = Object.assign({}, env);
          mac.params.forEach((p, j) => env2[p] = args[j]);
          out.push(...expand(mac.body, env2, depth + 1));
        } else if (m = t.match(/^repeat\s+rand\s+(\d+)\s+(\d+)\s+(\w+)$/)) {   // repeat rand LO HI idx — variable count per seed (compositionality)
          const lo = +m[1], hi = +m[2], n = mrng.int(Math.min(lo, hi), Math.max(lo, hi)), idx = m[3], block = []; let d = 1; i++;
          for (; i < src.length; i++) { const tt = src[i].replace(/#.*$/, "").trim(); if (/^(def|repeat)\s+/.test(tt)) d++; if (tt === "end") { if (--d === 0) break; } block.push(src[i]); }
          for (let k = 0; k < n; k++) out.push(...expand(block, Object.assign({}, env, { [idx]: k }), depth + 1));
        } else if (m = t.match(/^repeat\s+(\S+)\s+(\w+)$/)) {
          const n = +subst(m[1], env) | 0, idx = m[2], block = []; let d = 1; i++;
          for (; i < src.length; i++) { const tt = src[i].replace(/#.*$/, "").trim(); if (/^(def|repeat)\s+/.test(tt)) d++; if (tt === "end") { if (--d === 0) break; } block.push(src[i]); }
          for (let k = 0; k < n; k++) out.push(...expand(block, Object.assign({}, env, { [idx]: k }), depth + 1));
        } else out.push(subst(raw, env));
      }
      return out;
    };
    return expand(top, {}, 0).join("\n");
  }

  function runScene(text, opts = {}) {
    const lines = expandMacros(String(text)).split(/\r?\n/);
    const world = makeWorld({});
    const noSim = !!opts.noSim;

    world.program = world.program || [];   // structured program (the flat list of executed statements)

    // execute ONE statement against the shared world — used by the main loop AND by dispatch case bodies.
    function execStmt(rawLine, ln) {
      const raw = rawLine.replace(/#.*$/, ""), toks = tokenize(raw);
      if (!toks.length) return;
      const cmd = toks[0].toLowerCase();
      world.program.push(toks.join(" "));
      try {
        if (cmd === "grid") { if (toks[1] === "rand") { world.w = world.rng.int(+toks[2], +toks[3]); world.h = world.rng.int(+toks[4], +toks[5]); } else { world.w = +toks[1]; world.h = +toks[2]; } }   // grid rand WMIN WMAX HMIN HMAX → size varies per seed
        else if (cmd === "bg") world.bg = +toks[1];
        else if (cmd === "name") { world.meta.scene = toks.slice(1).join(" "); }
        else if (cmd === "seed") { world.seed = +toks[1]; world.rng = makeRng(+toks[1]); }
        else if (cmd === "walls") world.walls = toks[1] || "box";
        else if (cmd === "gravity") {
          if (isNaN(Number(toks[1]))) { const d = DIRS[toks[1]] || [1, 0], n = toks[2] ? +toks[2] : 1; world.gravity = [d[0] * n, d[1] * n]; }
          else world.gravity = [+toks[1], +toks[2] || 0];
        }
        else if (cmd === "sort") world.sort = (toks[1] || "on") !== "off";
        else if (cmd === "board") { const h = +toks[1], w = +toks[2], kv = parseKV(toks, 3); world.board = { r: kv.r | 0, c: kv.c | 0, h, w, color: kv.color == null ? 5 : kv.color }; }
        else if (cmd === "mark_enclosed") world.markEnclosed = +toks[1];
        else if (cmd === "voronoi") {
          const n = +toks[1] || 6; const f = { type: "voronoi", seeds: [], metric: "euclid", borders: null, drift: false };
          let i = 2, colors = null;
          while (i < toks.length) { const k = toks[i++];
            if (k === "metric") f.metric = toks[i++];
            else if (k === "drift") f.drift = true;
            else if (k === "borders") f.borders = +toks[i++];
            else if (k === "colors") { colors = []; while (i < toks.length && !KEYWORDS.has(toks[i]) && !isNaN(Number(toks[i]))) colors.push(+toks[i++]); }
          }
          for (let s = 0; s < n; s++) f.seeds.push({ r: world.rng.int(0, world.h - 1), c: world.rng.int(0, world.w - 1), color: colors ? colors[s % colors.length] : 1 + (s % 9), vr: world.rng.int(-1, 1), vc: world.rng.int(-1, 1) });
          world.fields.push(f);
        }
        else if (cmd === "shooter") {
          const kv = parseKVShooter(toks, 1);
          world.shooters.push({ r: kv.r | 0, c: kv.c | 0, dir: DIRS[kv.dir] || [0, 1], dirName: kv.dir || "right", every: kv.every || 4, beam: kv.beam || "bolt", color: kv.color == null ? 2 : kv.color, speed: kv.speed || 1, bounce: kv.bounce ? 1 : 0, t: 0, srcLine: ln });
        }
        else if (cmd === "source") {
          const kv = parseKV(toks, 1); ensureLiquid(world);
          world.sources.push({ r: kv.r | 0, c: kv.c | 0, color: kv.color == null ? 8 : kv.color, rate: kv.rate || 1, amount: kv.amount || 0, srcLine: ln });
        }
        else if (cmd === "liquid") {
          let i = 1; while (i < toks.length) { const k = toks[i++]; if (k === "viscosity") world.liquidCfg.viscosity = +toks[i++]; else if (k === "turbulence") world.liquidCfg.turbulence = +toks[i++]; else if (k === "flow") world.liquidCfg.flow = +toks[i++]; }
        }
        else if (cmd === "spill") {   // spill at R C color C [rate K] — the new simple fluid: a laminar pour that fills & overflows
          let i = 1, r = 0, c = 0, col = 8, rate = 1; while (i < toks.length) { const k = toks[i++]; if (k === "at") { r = +toks[i++]; c = +toks[i++]; } else if (k === "color") col = +toks[i++]; else if (k === "rate") rate = +toks[i++]; }
          ensureWater(world); world.spills.push({ r: r | 0, c: c | 0, color: col, rate, srcLine: ln });
        }
        else if (cmd === "noise") {
          const mode = (toks[1] === "perlin") ? "perlin" : "uniform"; const opts = {};
          let i = 2; while (i < toks.length) { const k = toks[i++];
            if (k === "scale") opts.scale = +toks[i++];
            else if (k === "colors") { opts.colors = []; while (i < toks.length && !KEYWORDS.has(toks[i]) && !isNaN(Number(toks[i]))) opts.colors.push(+toks[i++]); }
            else if (k === "probs") { opts.probs = []; while (i < toks.length && !KEYWORDS.has(toks[i]) && !isNaN(Number(toks[i]))) opts.probs.push(+toks[i++]); }
          }
          world.fields.push(buildNoiseField(world, mode, opts));
        }
        else if (cmd === "hidelayer") { world.hiddenLayers.push(+toks[1]); }
        else if (cmd === "counter") {
          const kv = {}; let i = 1;
          while (i < toks.length) { const k = toks[i++];
            if (k === "at") { kv.r = +toks[i++]; kv.c = +toks[i++]; }
            else if (k === "base") kv.base = +toks[i++];
            else if (k === "every") kv.every = +toks[i++];
            else if (k === "gap") kv.gap = +toks[i++];
            else if (k === "colors") { kv.colors = []; while (i < toks.length && !KEYWORDS.has(toks[i]) && !isNaN(Number(toks[i]))) kv.colors.push(+toks[i++]); }
          }
          if (world.gravity[0] === 0 && world.gravity[1] === 0) world.gravity = [1, 0]; // odometers need things to fall
          const colors = kv.colors && kv.colors.length ? kv.colors : [2, 4, 3];
          world.counters.push({ r: kv.r | 0, c: kv.c == null ? 1 : kv.c, base: kv.base || 3, every: kv.every || 5, gap: kv.gap || 3, colors, bodies: colors.map(() => []), srcLine: ln });
        }
        else if (cmd === "snake") {
          const kv = {}; let i = 1;
          while (i < toks.length) { const k = toks[i++]; if (k === "at") { kv.r = +toks[i++]; kv.c = +toks[i++]; } else if (k === "len") kv.len = +toks[i++]; else if (k === "color") kv.color = +toks[i++]; else if (k === "food") kv.food = +toks[i++]; }
          const len = kv.len || 4, hr = kv.r | 0, hc = kv.c == null ? Math.floor(world.w / 2) : kv.c;
          const body = []; for (let s = 0; s < len; s++) body.push([hr, Math.max(0, hc - s)]);
          const color = kv.color == null ? 3 : kv.color;
          const sn = { body, color, headColor: kv.color == null ? 4 : color, foodColor: kv.food == null ? 2 : kv.food, food: null, srcLine: ln };
          world.snakes.push(sn); snakeRespawnFood(world, sn);
        }
        else if (cmd === "life") {
          const o = {}; let i = 1; while (i < toks.length) { const k = toks[i++]; if (k === "density") o.density = +toks[i++]; else if (k === "color") o.color = +toks[i++]; }
          world.fields.push(buildLife(world, o));
        }
        else if (cmd === "wave") {
          const o = { color: 8, amp: Math.max(1, (world.h >> 2)), period: 8 }; let i = 1;
          while (i < toks.length) { const k = toks[i++]; if (k === "color") o.color = +toks[i++]; else if (k === "amp") o.amp = +toks[i++]; else if (k === "period") o.period = +toks[i++]; }
          world.fields.push({ type: "wave", color: o.color, amp: o.amp, period: o.period });
        }
        else if (cmd === "well") {
          const kv = {}; let i = 1; while (i < toks.length) { const k = toks[i++]; if (k === "at") { kv.r = +toks[i++]; kv.c = +toks[i++]; } else if (k === "strength") kv.strength = +toks[i++]; else if (k === "color") kv.color = +toks[i++]; }
          world.wells.push({ r: kv.r | 0, c: kv.c | 0, strength: kv.strength || 1, color: kv.color == null ? 9 : kv.color });
        }
        else if (cmd === "conveyor") {
          const kv = {}; let i = 1; while (i < toks.length) { const k = toks[i++]; if (k === "at") { kv.r = +toks[i++]; kv.c = +toks[i++]; } else if (k === "len") kv.len = +toks[i++]; else if (k === "dir") kv.dir = toks[i++]; else if (k === "color") kv.color = +toks[i++]; }
          const len = kv.len || 8, dir = kv.dir === "left" ? -1 : 1, color = kv.color == null ? 5 : kv.color;
          world.bodies.push(makeBody({ cells: rectCells(1, len), r: kv.r | 0, c: kv.c | 0, color, kind: "belt" }));  // belt = static body bodies ride
          world.conveyors.push({ r: kv.r | 0, c: kv.c | 0, len, dir });
        }
        else if (cmd === "maze") {
          const o = {}; let i = 1; while (i < toks.length) { const k = toks[i++]; if (k === "wall") o.wall = +toks[i++]; else if (k === "solve") o.solve = +toks[i++]; }
          world.fields.push(buildMaze(world, o));
        }
        else if (cmd === "run") { if (!noSim) simulate(world, +toks[1] || 1); }
        else if (cmd === "hold") { if (!noSim) hold(world, +toks[1] || 1); }
        else if (cmd === "snap") { if (!noSim) { const n = +toks[1] || 1; for (let k = 0; k < n; k++) world.frames.push(renderFrame(world)); } }
        // --- whole-grid transforms (the ARC-AGI-2 layer): render current state, transform it, push as the OUT frame ---
        else if (cmd === "grid_rotate") { if (!noSim) world.frames.push(transformGrid(renderFrame(world), +toks[1] || 1, false)); }   // K×90°
        else if (cmd === "grid_flip") { if (!noSim) { const a = toks[1] || "h", g = renderFrame(world); world.frames.push(a === "v" ? flipV(g) : (a === "diagonal" || a === "transpose" || a === "d") ? transposeGrid(g) : flipH(g)); } }
        else if (cmd === "grid_map") { if (!noSim) { const perm = {}; for (let i = 1; i + 1 < toks.length + 1 && toks[i] != null && toks[i + 1] != null; i += 2) perm[+toks[i]] = +toks[i + 1]; world.frames.push(permuteColors(renderFrame(world), perm)); } }   // grid_map FROM TO [FROM TO..]
        else if (cmd === "sort_rows") { if (!noSim) { let i = 1, col = null, desc = false; while (i < toks.length) { const k = toks[i++]; if (k === "by") col = +toks[i++]; else if (k === "desc") desc = true; } world.frames.push(sortRowsByCount(renderFrame(world), col == null ? world.bg : col, desc)); } }
        else if (cmd === "solve") { if (!noSim) world.frames.push(solveLatin(renderFrame(world))); }   // Latin-square completion (fill the 0s)
        else if (cmd === "unfold") {   // unfold (h|v at K)+ — reflect every mark across each crease line and union (paper-folding VZ-2); folds applied in order
          if (!noSim) { const folds = []; let i = 1; while (i < toks.length) { const ax = toks[i] === "axis" ? toks[++i] : toks[i]; i++; let K = null; if (toks[i] === "at") { i++; K = +toks[i++]; } folds.push({ ax, K }); }
            let o = renderFrame(world); const bg = world.bg;
            for (const f of folds) { const H = o.length, W = o[0].length, K = f.K == null ? (f.ax === "v" ? (W - 1) / 2 : (H - 1) / 2) : f.K, g = o.map(r => r.slice());
              for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) if (g[r][c] !== bg) { const rr = f.ax === "h" ? Math.round(2 * K - r) : r, cc = f.ax === "v" ? Math.round(2 * K - c) : c; if (rr >= 0 && rr < H && cc >= 0 && cc < W && o[rr][cc] === bg) o[rr][cc] = g[r][c]; } }
            world.frames.push(o); } }
        else if (cmd === "grid_complete") {   // grid_complete h|v|rot180|diagonal — fill blank (bg) cells as the symmetric completion of the filled part (Raven matrix completion)
          if (!noSim) { const mode = toks[1] || "h", g = renderFrame(world), H = g.length, W = g[0].length, bg = world.bg, o = g.map(r => r.slice());
            const mirror = (r, c) => mode === "v" ? [H - 1 - r, c] : mode === "rot180" ? [H - 1 - r, W - 1 - c] : mode === "diagonal" ? [c, r] : [r, W - 1 - c];   // default h
            for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) if (o[r][c] === bg) { const [mr, mc] = mirror(r, c); if (mr >= 0 && mr < H && mc >= 0 && mc < W && g[mr][mc] !== bg) o[r][c] = g[mr][mc]; }
            world.frames.push(o); } }
        else if (cmd === "crop") {   // crop [pad P] → resize the OUT to the bounding box of the content (e.g. the extracted object)
          if (!noSim) { let pad = 0, i = 1; while (i < toks.length) { const k = toks[i++]; if (k === "pad") pad = +toks[i++]; }
            const g = renderFrame(world); let r0 = 1e9, r1 = -1, c0 = 1e9, c1 = -1;
            for (let r = 0; r < g.length; r++) for (let c = 0; c < g[0].length; c++) if (g[r][c] !== world.bg) { if (r < r0) r0 = r; if (r > r1) r1 = r; if (c < c0) c0 = c; if (c > c1) c1 = c; }
            if (r1 < 0) { world.frames.push(g); } else {
              r0 = Math.max(0, r0 - pad); c0 = Math.max(0, c0 - pad); r1 = Math.min(g.length - 1, r1 + pad); c1 = Math.min(g[0].length - 1, c1 + pad);
              const o = []; for (let r = r0; r <= r1; r++) { const row = []; for (let c = c0; c <= c1; c++) row.push(g[r][c]); o.push(row); } world.frames.push(o);
            } } }
        else if (cmd === "cut") { world.splitAt = world.frames.length; world.repIn = describeBodies(world.bodies); }   // IN = frames before, OUT = frames after
        else if (cmd === "rule") { world.meta.rule = toks.slice(1).join(" "); }       // human teaching for the task
        else if (cmd === "concept") { world.meta.concepts = (world.meta.concepts || []).concat(toks.slice(1)); }
        else if (cmd === "difficulty") { world.meta.difficulty = Math.max(0, Math.min(1, +toks[1])); }   // 0 = trivial copy, 1 = ARC-AGI-2 level
        else if (cmd === "examples") { if (toks[1] === "rand") world.meta.examplesRange = [+toks[2], +toks[3]]; else world.meta.examplesRange = [+toks[1], +toks[1]]; }   // n_examples (variable per task)
        else if (cmd === "vary") {   // rule-safe global aug axes: flip rot zoom shift color (natural synonyms normalized)
          const VAX = { rot: "rot", rotation: "rot", rotate: "rot", flip: "flip", mirror: "flip", zoom: "zoom", scale: "zoom", shift: "shift", translate: "shift", color: "color", colour: "color", recolor: "color" };
          world.vary = toks.slice(1).map(a => VAX[a] || a).filter((a, i, arr) => arr.indexOf(a) === i);
        }
        else if (cmd === "copy") {
          const sel = resolveSel(world, toks, 1), o = parseOps(toks, sel.i);
          const tpl = sel.bodies[0]; if (!tpl) throw new Error("copy: selector matched nothing");
          const cells = transformCells(tpl.cells, o.rot || 0, o.flip || null);
          // 'to R C' = absolute; 'by DR DC' = offset from the template (keeps it relative for random scenes).
          const baseR = o.r != null ? o.r : tpl.r + (o.dr || 0), baseC = o.c != null ? o.c : tpl.c + (o.dc || 0);
          if (isNaN(baseR) || isNaN(baseC)) throw new Error("copy: 'to R C' or 'by DR DC' needs numeric coords (not both)");
          const n = o.times || 1, dr = o.tdr || 0, dc = o.tdc || 0;
          for (let k = 0; k < n; k++) {
            world.bodies.push(makeBody({
              cells, r: baseR + k * dr, c: baseC + k * dc,
              color: o.tint == null ? tpl.color : o.tint,
              interior: o.interior == null ? tpl.interior : o.interior,
              fill: tpl.fill, layer: tpl.layer, kind: tpl.kind,
              id: o.id ? (n > 1 ? o.id + k : o.id) : undefined, srcLine: ln,
            }));
          }
        }
        else if (cmd === "recolor") {
          const sel = resolveSel(world, toks, 1), o = parseOps(toks, sel.i);
          for (const b of sel.bodies) { if (o.tint != null) b.color = o.tint; if (o.interior != null) b.interior = o.interior; }
        }
        else if (cmd === "double" || cmd === "zoom") {   // zoom SEL [factor K] — object-level scale: K≥2 zoom-IN (2x2→4x4), K≤-2 zoom-OUT (downsample). 'double' = +2.
          const sel = resolveSel(world, toks, 1); let i = sel.i, K = cmd === "double" ? 2 : 2;
          while (i < toks.length) { const kk = toks[i++]; if (kk === "factor") K = +toks[i++]; }
          for (const b of sel.bodies) {
            let nc;
            if (K >= 1) { nc = []; for (const [dr, dc] of b.cells) for (let a = 0; a < K; a++) for (let z = 0; z < K; z++) nc.push([dr * K + a, dc * K + z]); }   // zoom in (duplicate)
            else { const f = Math.abs(K) || 2, seen = new Set(); nc = []; for (const [dr, dc] of b.cells) if (dr % f === 0 && dc % f === 0) { const k = (dr / f) + "," + (dc / f); if (!seen.has(k)) { seen.add(k); nc.push([dr / f, dc / f]); } } if (!nc.length) nc = [[0, 0]]; }   // zoom out (downsample)
            b.cells = normalize(nc); b.sig = shapeSig(b.cells);
          }
        }
        else if (cmd === "move") {
          const sel = resolveSel(world, toks, 1), o = parseOps(toks, sel.i);
          let dr = o.dr || 0, dc = o.dc || 0;
          if (o.r != null && sel.bodies[0]) { dr = o.r - sel.bodies[0].r; dc = o.c - sel.bodies[0].c; }
          if (isNaN(dr) || isNaN(dc)) throw new Error("move: 'to R C' or 'by DR DC' needs numeric coords");
          for (const b of sel.bodies) { b.r += dr; b.c += dc; b.r0 = b.r; b.c0 = b.c; }
        }
        else if (cmd === "mirror") {
          const sel = resolveSel(world, toks, 1), o = parseOps(toks, sel.i);
          const tpl = sel.bodies[0]; if (!tpl) throw new Error("mirror: selector matched nothing");
          const axis = o.axis || "v", gap = o.gap || 0, [bh, bw] = bbox(tpl.cells);
          const cells = axis === "h" ? flipCellsV(tpl.cells) : flipCellsH(tpl.cells);
          const r = axis === "h" ? tpl.r + bh + gap : tpl.r;
          const c = axis === "h" ? tpl.c : tpl.c + bw + gap;
          world.bodies.push(makeBody({ cells, r, c, color: o.tint == null ? tpl.color : o.tint, interior: tpl.interior, fill: tpl.fill, layer: tpl.layer, kind: tpl.kind, id: o.id, srcLine: ln }));
        }
        else if (cmd === "remove") {
          const sel = resolveSel(world, toks, 1); const drop = new Set(sel.bodies);
          if (world.splitAt == null && drop.size) world.preCutSelect = true;   // selection BEFORE the IN snapshot ⇒ the rule is invisible
          world.bodies = world.bodies.filter(b => !drop.has(b));
        }
        else if (cmd === "extract") {
          const sel = resolveSel(world, toks, 1); const keep = new Set(sel.bodies);
          if (world.splitAt == null && keep.size < world.bodies.length) world.preCutSelect = true;   // extract before IN ⇒ selection invisible
          world.bodies = world.bodies.filter(b => keep.has(b));
        }
        else if (cmd === "arrange") {   // arrange SEL by size|color [at R C] [gap G] [dir h|v] → lay matched objects in an ORDERED row
          const sel = resolveSel(world, toks, 1); let i = sel.i, by = "size", r = 1, c = 1, gap = 1, dir = "h", desc = false;
          while (i < toks.length) { const k = toks[i++]; if (k === "by") by = toks[i++]; else if (k === "at") { r = +toks[i++]; c = +toks[i++]; } else if (k === "gap") gap = +toks[i++]; else if (k === "dir") dir = toks[i++]; else if (k === "desc") desc = true; }
          const key = b => by === "color" ? b.color : b.cells.length;
          const bodies = sel.bodies.slice().sort((a, b) => key(a) - key(b)); if (desc) bodies.reverse();
          let cur = dir === "v" ? r : c;
          for (const b of bodies) { const [bh, bw] = bbox(b.cells); if (dir === "v") { b.r = cur; b.c = c; cur += bh + gap; } else { b.r = r; b.c = cur; cur += bw + gap; } b.r0 = b.r; b.c0 = b.c; }
        }
        // --- boolean figure-algebra (G1): cell-wise boolean of two figures (Carpenter add/sub · PGM XOR/AND/OR) ---
        else if (cmd === "combine") {
          // combine SEL_a SEL_b op or|xor|and|sub [into R C] [color C] — top-left-aligned cell boolean → ONE new figure; sources removed.
          const a = resolveSel(world, toks, 1), b = resolveSel(world, toks, a.i); let i = b.i, op = "or", r = null, c = null, col = null;
          const A = a.bodies[0], B = b.bodies[0]; if (!A || !B) throw new Error("combine: needs two matched figures (SEL_a SEL_b)");
          while (i < toks.length) { const k = toks[i++]; if (k === "op") op = toks[i++]; else if (k === "into") { r = +toks[i++]; c = +toks[i++]; } else if (k === "color") col = +toks[i++]; }
          const sa = new Set(normalize(A.cells).map(p => p[0] + "," + p[1])), sb = new Set(normalize(B.cells).map(p => p[0] + "," + p[1]));
          const out = []; for (const key of new Set([...sa, ...sb])) { const inA = sa.has(key), inB = sb.has(key);
            const keep = op === "or" ? (inA || inB) : op === "and" ? (inA && inB) : op === "xor" ? (inA !== inB) : op === "sub" ? (inA && !inB) : false;
            if (keep) { const [rr, cc] = key.split(",").map(Number); out.push([rr, cc]); } }
          const drop = new Set([A, B]); world.bodies = world.bodies.filter(x => !drop.has(x));
          if (out.length) world.bodies.push(makeBody({ cells: normalize(out), r: r != null ? r : A.r, c: c != null ? c : A.c, color: col == null ? A.color : col, kind: "combine", srcLine: ln }));
        }
        else if (cmd === "overlay_figs") {
          // overlay_figs SEL_a SEL_b at R C [overlap C] — superimpose two figures; a-only keeps A.color, b-only B.color, shared = overlap color.
          const a = resolveSel(world, toks, 1), b = resolveSel(world, toks, a.i); let i = b.i, r = 0, c = 0, ov = null;
          const A = a.bodies[0], B = b.bodies[0]; if (!A || !B) throw new Error("overlay_figs: needs two matched figures");
          while (i < toks.length) { const k = toks[i++]; if (k === "at") { r = +toks[i++]; c = +toks[i++]; } else if (k === "overlap") ov = +toks[i++]; }
          const sa = new Set(normalize(A.cells).map(p => p[0] + "," + p[1])), sb = new Set(normalize(B.cells).map(p => p[0] + "," + p[1]));
          const aOnly = [], bOnly = [], both = [];
          for (const key of new Set([...sa, ...sb])) { const [rr, cc] = key.split(",").map(Number), inA = sa.has(key), inB = sb.has(key);
            (inA && inB ? both : inA ? aOnly : bOnly).push([rr, cc]); }
          const drop = new Set([A, B]); world.bodies = world.bodies.filter(x => !drop.has(x));
          // each part keeps its place in the shared overlay frame (makeBody re-normalizes per body, so offset r/c to compensate).
          const pushPart = (cells, color) => { if (!cells.length) return; const mr = Math.min(...cells.map(p => p[0])), mc = Math.min(...cells.map(p => p[1]));
            world.bodies.push(makeBody({ cells: cells.map(([a2, b2]) => [a2 - mr, b2 - mc]), r: r + mr, c: c + mc, color, kind: "overlay", srcLine: ln })); };
          pushPart(aOnly, A.color); pushPart(bOnly, B.color); pushPart(both, ov == null ? 5 : ov);
        }
        // --- analogy + series (G4): "infer a transform from a pair, re-apply it" (A:B::C:?) + arithmetic series ---
        else if (cmd === "bind_transform") {
          // bind_transform NAME from SEL_a to SEL_b — capture the A→B delta (translate + recolor + interior) under NAME
          let i = 1; const name = toks[i++];
          if (toks[i] !== "from") throw new Error("bind_transform: use 'bind_transform NAME from SEL_a to SEL_b'");
          const a = resolveSel(world, toks, i + 1); const A = a.bodies[0];
          if (toks[a.i] !== "to") throw new Error("bind_transform: missing 'to SEL_b'");
          const b = resolveSel(world, toks, a.i + 1); const B = b.bodies[0];
          if (!A || !B) throw new Error("bind_transform: needs a matched SEL_a and SEL_b");
          (world._binds = world._binds || {})[name] = { dr: B.r - A.r, dc: B.c - A.c, tint: B.color !== A.color ? B.color : null, interior: B.interior !== A.interior ? B.interior : null };
        }
        else if (cmd === "apply") {
          // apply NAME to SEL_c — re-apply a bound transform to each matched body (the analogy completion)
          let i = 1; const name = toks[i++];
          if (toks[i] !== "to") throw new Error("apply: use 'apply NAME to SEL'");
          const c = resolveSel(world, toks, i + 1); const tr = (world._binds || {})[name];
          if (!tr) throw new Error("apply: unknown transform '" + name + "' (bind_transform it first)");
          for (const bd of c.bodies) { bd.r += tr.dr; bd.c += tr.dc; bd.r0 = bd.r; bd.c0 = bd.c; if (tr.tint != null) bd.color = tr.tint; if (tr.interior != null) bd.interior = tr.interior; }
        }
        else if (cmd === "progress") {
          // progress SHAPE at R C attr size|color step K n N [base B] [gap G] [dir h|v] [color C] — arithmetic series of N objects
          let i = 1; const shapeName = toks[i++]; let r = 1, c = 1, attr = "size", step = 1, n = 3, base = 2, gap = 1, dir = "h", col = 2;
          while (i < toks.length) { const k = toks[i++];
            if (k === "at") { r = +toks[i++]; c = +toks[i++]; } else if (k === "attr") attr = toks[i++]; else if (k === "step") step = +toks[i++];
            else if (k === "n") n = +toks[i++]; else if (k === "base") base = +toks[i++]; else if (k === "gap") gap = +toks[i++]; else if (k === "dir") dir = toks[i++]; else if (k === "color") col = +toks[i++]; }
          let cur = dir === "v" ? r : c;
          for (let m = 0; m < n; m++) {
            const sizeArg = attr === "size" ? Math.max(1, base + m * step) : 3;
            const color = attr === "color" ? Math.max(1, Math.min(9, base + m * step)) : col;
            const cells = buildShape(shapeName, [sizeArg]); const [bh, bw] = bbox(cells);
            world.bodies.push(makeBody({ cells, r: dir === "v" ? cur : r, c: dir === "v" ? c : cur, color, kind: shapeName, srcLine: ln }));
            cur += (dir === "v" ? bh : bw) + gap;
          }
        }
        // --- damage / restore (find-the-error & reconstruction). the damaged element is RANDOM (by seed). ---
        else if (cmd === "corrupt") {
          const sel = resolveSel(world, toks, 1), o = parseOps(toks, sel.i);
          if (!sel.bodies.length) throw new Error("corrupt: selector matched nothing");
          const b = sel.bodies[world.rng.int(0, sel.bodies.length - 1)];
          if (b._origColor == null) b._origColor = b.color;
          let nc = o.tint;
          if (nc == null) { do { nc = world.rng.int(1, 9); } while (nc === b.color); }   // a RANDOM wrong colour
          b.color = nc;
          (world._damaged = world._damaged || []).includes(b) || world._damaged.push(b);
        }
        else if (cmd === "break") {
          const sel = resolveSel(world, toks, 1); let i = sel.i, nc = 1;
          while (i < toks.length) { const k = toks[i++]; if (k === "cells") nc = +toks[i++]; }
          if (!sel.bodies.length) throw new Error("break: selector matched nothing");
          const b = sel.bodies[world.rng.int(0, sel.bodies.length - 1)];
          if (b._origCells == null) b._origCells = b.cells.map(x => x.slice());
          const cells = b.cells.map(x => x.slice());
          for (let k = 0; k < nc && cells.length > 1; k++) cells.splice(world.rng.int(0, cells.length - 1), 1);
          b.cells = cells; b.sig = shapeSig(cells);   // not normalized: keep anchoring so holes stay in place
          (world._damaged = world._damaged || []).includes(b) || world._damaged.push(b);
        }
        else if (cmd === "repair") {
          for (const b of (world._damaged || [])) {
            if (b._origColor != null) b.color = b._origColor;
            if (b._origCells != null) { b.cells = b._origCells.map(x => x.slice()); b.sig = shapeSig(b.cells); }
          }
        }
        // --- dynamic physics: explode / shatter / burst / path-follow ---
        else if (cmd === "explode" || cmd === "shatter") {   // SEL flies apart into 1-cell fragments. shatter = with gravity (falls).
          const sel = resolveSel(world, toks, 1); let i = sel.i, speed = 1, bnc = cmd === "shatter" ? 0.3 : 0.7;
          while (i < toks.length) { const k = toks[i++]; if (k === "speed") speed = +toks[i++]; else if (k === "bounce") bnc = +toks[i++]; }
          const grav = cmd === "shatter";
          if (grav && world.gravity[0] === 0 && world.gravity[1] === 0) world.gravity = [1, 0];   // shatter implies falling
          for (const b of sel.bodies.slice()) {
            const abs = absCells(b); let cr = 0, cc = 0; for (const [r, c] of abs) { cr += r; cc += c; } cr /= abs.length; cc /= abs.length;
            for (const [r, c] of abs) {
              const dr = (r - cr) || (world.rng.int(0, 1) ? 0.5 : -0.5), dc = (c - cc) || (world.rng.int(0, 1) ? 0.5 : -0.5);
              world.bodies.push(makeBody({ cells: [[0, 0]], r, c, color: b.color, vr: grav ? 0 : Math.sign(dr) * speed, vc: Math.sign(dc) * speed, bounce: bnc, gravity: grav, kind: "frag", srcLine: ln }));
            }
            world.bodies = world.bodies.filter(x => x !== b);
          }
        }
        else if (cmd === "burst") {   // burst at R C | random [count N|rand LO HI] [color C] [speed S] → a radial firework
          let i = 1, r = world.rng.int(2, Math.max(2, world.h - 3)), c = world.rng.int(2, Math.max(2, world.w - 3)), n = 8, col = 2, speed = 1;
          while (i < toks.length) { const k = toks[i++]; if (k === "at") { r = +toks[i++]; c = +toks[i++]; } else if (k === "random") { } else if (k === "count") { if (toks[i] === "rand") { i++; n = world.rng.int(+toks[i++], +toks[i++]); } else n = +toks[i++]; } else if (k === "color") col = +toks[i++]; else if (k === "speed") speed = +toks[i++]; }
          const D8 = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]];
          for (let m = 0; m < n; m++) { const d = D8[m % 8]; world.bodies.push(makeBody({ cells: [[0, 0]], r, c, color: col, vr: d[0] * speed, vc: d[1] * speed, bounce: 0.7, kind: "frag", srcLine: ln })); }
        }
        else if (cmd === "path") {   // path at R C to R C.. | random N  [color C] [walk C] [candy C [every K]] [hidden] → route + a follower (+ candies it eats)
          let i = 1, wp = [], col = 5, walk = 4, randN = 0, candy = null, every = 3, hidden = false;
          while (i < toks.length) { const k = toks[i++]; if (k === "at" || k === "to") wp.push([+toks[i++], +toks[i++]]); else if (k === "random") randN = +toks[i++]; else if (k === "color") col = +toks[i++]; else if (k === "walk") walk = +toks[i++]; else if (k === "candy") { if (toks[i] === "rand") { i++; let lo = 1, hi = 9; if (!isNaN(+toks[i]) && !isNaN(+toks[i + 1])) { lo = +toks[i++]; hi = +toks[i++]; } candy = world.rng.int(lo, hi); } else candy = +toks[i++]; } else if (k === "every") every = +toks[i++]; else if (k === "hidden") hidden = true; }
          let cells = [];
          if (randN) { let r = world.rng.int(1, world.h - 2), c = world.rng.int(1, world.w - 2); cells.push([r, c]); for (let s = 0; s < randN; s++) { const d = [[0, 1], [1, 0], [0, -1], [-1, 0]][world.rng.int(0, 3)]; r = Math.max(0, Math.min(world.h - 1, r + d[0])); c = Math.max(0, Math.min(world.w - 1, c + d[1])); cells.push([r, c]); } }
          else for (let s = 0; s + 1 < wp.length; s++) { let [r0, c0] = wp[s], [r1, c1] = wp[s + 1]; const steps = Math.max(Math.abs(r1 - r0), Math.abs(c1 - c0)); for (let q = 0; q <= steps; q++) cells.push([Math.round(r0 + (r1 - r0) * q / (steps || 1)), Math.round(c0 + (c1 - c0) * q / (steps || 1))]); }
          (world.paths = world.paths || []).push({ cells: dedupe(cells), pos: 0, color: col, walker: walk, candy, every, hidden });
        }
        // --- freedom: add arbitrary content "here and there" (so OUT need not be a clean f(IN)) ---
        else if (cmd === "scatter") {   // scatter N|rand LO HI [color C|rand] [box ...] → free cells (kind 'noise')
          let i = 1, n; if (toks[i] === "rand") { i++; n = world.rng.int(+toks[i++], +toks[i++]); } else n = +toks[i++] || 8;
          let col = null, rnd = false, rlo = 1, rhi = 9, box = [0, 0, world.h - 1, world.w - 1];
          while (i < toks.length) {
            const kk = toks[i++];
            if (kk === "color") { if (toks[i] === "rand") { rnd = true; i++; if (toks[i] != null && !isNaN(+toks[i]) && toks[i + 1] != null && !isNaN(+toks[i + 1])) { rlo = +toks[i++]; rhi = +toks[i++]; } } else col = +toks[i++]; }   // color rand [LO HI] (consistent with spawn)
            else if (kk === "box") box = [+toks[i++], +toks[i++], +toks[i++], +toks[i++]];
          }
          const occ = new Set(); for (const ob of world.bodies) for (const [dr, dc] of ob.cells) occ.add((ob.r + dr) + "," + (ob.c + dc));
          for (let m = 0; m < n; m++) {
            let rr, cc, ok = false;
            for (let tr = 0; tr < 40 && !ok; tr++) { rr = world.rng.int(box[0], box[2]); cc = world.rng.int(box[1], box[3]); ok = inBounds(world, rr, cc) && !occ.has(rr + "," + cc); }
            if (!ok) continue; occ.add(rr + "," + cc);
            world.bodies.push(makeBody({ cells: [[0, 0]], r: rr, c: cc, color: rnd ? world.rng.int(rlo, rhi) : (col == null ? 5 : col), kind: "noise", srcLine: ln }));
          }
        }
        else if (cmd === "paint") {     // paint R C color C → one exact cell (kind 'mark')
          const r = +toks[1], c = +toks[2]; let col = 5, i = 3;
          while (i < toks.length) { const kk = toks[i++]; if (kk === "color") col = +toks[i++]; }
          world.bodies.push(makeBody({ cells: [[0, 0]], r, c, color: col, kind: "mark", srcLine: ln }));
        }
        // --- counting / cardinality: a bar whose length = how many bodies the selector matched ---
        else if (cmd === "tally") {     // tally SEL at R C color C [dir h|v]
          const sel = resolveSel(world, toks, 1); let i = sel.i, r = 0, c = 0, col = 5, dir = "h";
          while (i < toks.length) { const kk = toks[i++]; if (kk === "at") { r = +toks[i++]; c = +toks[i++]; } else if (kk === "color") col = +toks[i++]; else if (kk === "dir") dir = toks[i++]; }
          const n = sel.bodies.length, cells = [];
          for (let m = 0; m < n; m++) cells.push(dir === "v" ? [-m, 0] : [0, m]);
          if (cells.length) world.bodies.push(makeBody({ cells, r, c, color: col, kind: "tally", srcLine: ln }));
        }
        else if (cmd === "keep_bigger") {  // keep_bigger CA CB at R C [size N] → a block in the more-numerous colour (> <)
          const ca = +toks[1], cb = +toks[2]; let r = 0, c = 0, sz = 2, i = 3;
          while (i < toks.length) { const kk = toks[i++]; if (kk === "at") { r = +toks[i++]; c = +toks[i++]; } else if (kk === "size") sz = +toks[i++]; }
          const mass = cl => world.bodies.filter(b => b.color === cl).reduce((n, b) => n + b.cells.length, 0);
          const win = mass(ca) >= mass(cb) ? ca : cb;
          world.bodies = world.bodies.filter(b => b.color !== ca && b.color !== cb);   // clear both groups
          world.bodies.push(makeBody({ cells: rectCells(sz, sz), r, c, color: win, kind: "answer", srcLine: ln }));
        }
        // --- interleaving grid with holes (count / fill / extract) ---
        else if (cmd === "lattice") {   // lattice rows cols [cell N] [gap G] [color C] [holes K] [at R C] [outline] [irregular]
          let i = 1; const rows = +toks[i++], cols = +toks[i++]; let cell = 2, gap = 1, col = 5, holes = 0, r0 = 1, c0 = 1, outl = false, irr = false;
          while (i < toks.length) { const kk = toks[i++]; if (kk === "cell") cell = +toks[i++]; else if (kk === "gap") gap = +toks[i++]; else if (kk === "color") col = +toks[i++]; else if (kk === "holes") holes = +toks[i++]; else if (kk === "at") { r0 = +toks[i++]; c0 = +toks[i++]; } else if (kk === "outline") outl = true; else if (kk === "irregular") irr = true; }
          // per-row heights / per-col widths: equal, or jittered so columns can be tight and rows wide (irregular)
          const rh = Array.from({ length: rows }, () => irr ? world.rng.int(Math.max(1, cell - 1), cell + 2) : cell);
          const cw = Array.from({ length: cols }, () => irr ? world.rng.int(Math.max(1, cell - 1), cell + 2) : cell);
          const rStart = [], cStart = []; let rp = r0; for (let r = 0; r < rows; r++) { rStart.push(rp); rp += rh[r] + gap; }
          let cp = c0; for (let c = 0; c < cols; c++) { cStart.push(cp); cp += cw[c] + gap; }
          const slots = []; for (let rr = 0; rr < rows; rr++) for (let cc = 0; cc < cols; cc++) slots.push([rr, cc]);
          for (let m = slots.length - 1; m > 0; m--) { const j = world.rng.int(0, m);[slots[m], slots[j]] = [slots[j], slots[m]]; }
          const holeSet = new Set(slots.slice(0, holes).map(s => s[0] + "," + s[1]));
          world._holes = [];
          for (let rr = 0; rr < rows; rr++) for (let cc = 0; cc < cols; cc++) {
            const rect = rectCells(rh[rr], cw[cc]), block = { cells: outl ? outline(rect) : rect, r: rStart[rr], c: cStart[cc], color: col, kind: "tile", srcLine: ln };
            if (holeSet.has(rr + "," + cc)) world._holes.push(block); else world.bodies.push(makeBody(block));
          }
        }
        else if (cmd === "mesh") {      // mesh rows cols [color C] [irregular] — coloured grid LINES (graph-paper inverse; cells = bg)
          let i = 1; const rows = +toks[i++], cols = +toks[i++]; let col = 5, irr = false; while (i < toks.length) { const kk = toks[i++]; if (kk === "color") col = +toks[i++]; else if (kk === "irregular") irr = true; }
          // boundary rows/cols (including the outer frame). irregular jitters the interior line positions.
          const lineR = [0], lineC = [0];
          for (let r = 1; r < rows; r++) lineR.push(irr ? Math.min(world.h - 1, Math.max(r, world.rng.int(Math.round((r - 0.4) * world.h / rows), Math.round((r + 0.4) * world.h / rows)))) : Math.round(r * world.h / rows));
          for (let c = 1; c < cols; c++) lineC.push(irr ? Math.min(world.w - 1, Math.max(c, world.rng.int(Math.round((c - 0.4) * world.w / cols), Math.round((c + 0.4) * world.w / cols)))) : Math.round(c * world.w / cols));
          lineR.push(world.h - 1); lineC.push(world.w - 1);
          const cells = [];
          for (const r of lineR) for (let c = 0; c < world.w; c++) cells.push([r, c]);
          for (const c of lineC) for (let r = 0; r < world.h; r++) cells.push([r, c]);
          if (cells.length) world.bodies.push(makeBody({ cells: dedupe(cells), r: 0, c: 0, color: col, kind: "mesh", srcLine: ln }));
        }
        else if (cmd === "fill") {      // fill [color C] → materialize the lattice holes (OUT = complete grid)
          let i = 1, col = null; while (i < toks.length) { const kk = toks[i++]; if (kk === "color") col = +toks[i++]; }
          for (const b of (world._holes || [])) world.bodies.push(makeBody(Object.assign({}, b, col == null ? {} : { color: col })));
          world._holes = [];
        }
        // --- turtle / program execution: the program is drawn in IN, the path is its execution in OUT ---
        else if (cmd === "turtle") {    // turtle at R C dir DIR program OPS|rand K [color C]
          let i = 1, r = 0, c = 0, dir = "right", ops = "", col = 4;
          while (i < toks.length) { const kk = toks[i++]; if (kk === "at") { r = +toks[i++]; c = +toks[i++]; } else if (kk === "dir") dir = toks[i++]; else if (kk === "color") col = +toks[i++]; else if (kk === "program") { if (toks[i] === "rand") { i++; const K = +toks[i++]; const pool = "FFFLR"; ops = ""; for (let m = 0; m < K; m++) ops += pool[world.rng.int(0, pool.length - 1)]; } else ops = toks[i++]; } }
          world._turtle = { r, c, dir: (DIRS[dir] || [0, 1]).slice(), ops, color: col };
          // draw the program as a colour-coded strip on the bottom row (the literal "program" the model reads).
          const opCol = { F: 4, L: 2, R: 3 };
          for (let m = 0; m < ops.length; m++) world.bodies.push(makeBody({ cells: [[0, 0]], r: world.h - 1, c: 1 + m, color: opCol[ops[m]] || 5, kind: "code", srcLine: ln }));
          world.bodies.push(makeBody({ cells: [[0, 0]], r, c, color: col, kind: "turtleStart", srcLine: ln }));
        }
        else if (cmd === "drive") {     // execute the stored turtle program, drawing its path
          const t = world._turtle; if (!t) throw new Error("drive: no turtle defined");
          let [dr, dc] = t.dir, r = t.r, c = t.c; const path = [[r, c]];
          for (const op of t.ops) {
            if (op === "F") { r += dr; c += dc; if (inBounds(world, r, c)) path.push([r, c]); }
            else if (op === "R") { [dr, dc] = [dc, -dr]; }
            else if (op === "L") { [dr, dc] = [-dc, dr]; }
          }
          let mr = Math.min(...path.map(p => p[0])), mc = Math.min(...path.map(p => p[1]));
          world.bodies.push(makeBody({ cells: dedupe(path.map(([r, c]) => [r - mr, c - mc])), r: mr, c: mc, color: t.color, kind: "path", srcLine: ln }));
        }
        else if (cmd === "spawn" || cmd === "hole") {
          const sh = parseShape(toks, 1), kv = parseKV(toks, sh.i);
          const sargs = sh.args.map(a => (a && a.rand) ? world.rng.int(a.rand[0], a.rand[1]) : a);  // resolve 'rand LO HI' size args
          const cells = buildShape(sh.name, sargs);
          // 'color rand [LO HI]' resolves here (needs world.rng) → incidental colour varies per seed/example.
          const col = kv.colorRand ? world.rng.int(kv.colorRand[0], kv.colorRand[1]) : kv.color;
          if (cmd === "hole") world.holes.push({ id: kv.id || ("h" + world.holes.length), cells, r: kv.r | 0, c: kv.c | 0, color: col == null ? 5 : col, sig: shapeSig(cells) });
          else {
            if (kv.random) {
              const [bh, bw] = bbox(cells), box = kv.randBox || [0, 0, world.h - 1, world.w - 1];
              const r0 = Math.min(box[0], box[2]), r1 = Math.max(box[0], box[2]), c0 = Math.min(box[1], box[3]), c1 = Math.max(box[1], box[3]);
              // GAP-enforced placement: objects keep >=1 empty cell from each other (Chebyshev) so boundaries are always
              // clear and two objects never touch/merge (a hidden or adjacent object makes IN→OUT unreadable).
              const occ = new Set(); for (const ob of world.bodies) for (const [dr, dc] of ob.cells) occ.add((ob.r + dr) + "," + (ob.c + dc));
              const tryAt = () => [world.rng.int(r0, Math.max(r0, r1 - bh + 1)), world.rng.int(c0, Math.max(c0, c1 - bw + 1))];
              const clear = (rr, cc, gap) => !cells.some(([dr, dc]) => { for (let a = -gap; a <= gap; a++) for (let b = -gap; b <= gap; b++) if (occ.has((rr + dr + a) + "," + (cc + dc + b))) return true; return false; });
              let rr, cc, ok = false;
              for (let tries = 0; tries < 140 && !ok; tries++) { [rr, cc] = tryAt(); ok = clear(rr, cc, 1); }                 // prefer a 1-cell gap
              for (let tries = 0; tries < 60 && !ok; tries++) { [rr, cc] = tryAt(); ok = clear(rr, cc, 0); }                  // fall back to merely non-overlapping
              kv.r = rr; kv.c = cc;   // best effort: last try if even that fails (rare in a roomy box)
            }
            world.bodies.push(makeBody({ cells, r: kv.r, c: kv.c, color: col == null ? 1 : col, vr: kv.vr, vc: kv.vc, gravity: kv.grav, bounce: kv.bounce, fill: kv.fill, interior: kv.interior, spin: kv.spin, layer: kv.layer, ghost: kv.ghost, magnet: kv.magnet, link: kv.link, id: kv.id, target: kv.target, kind: sh.name, srcLine: ln }));
          }
        }
        else if (cmd === "classify") {
          // classify SEL by PRED into A B [at R C] [is V] [size N] — Bongard-style scene→class token:
          // emit ONE answer marker, colour A if EVERY matched body satisfies PRED (or ==V), else B.
          const sel = resolveSel(world, toks, 1); let i = sel.i;
          if (toks[i] !== "by" || toks[i + 1] == null) throw new Error("classify: use 'classify SEL by PRED into A B'");
          const pred = toks[i + 1]; i += 2;
          if (!PREDICATES[pred]) throw new Error("classify: unknown predicate '" + pred + "' (have: " + Object.keys(PREDICATES).join(" ") + ")");
          let A = 2, B = 3, r = 0, c = 0, want = null, sz = 2;
          while (i < toks.length) { const k = toks[i++]; if (k === "into") { A = +toks[i++]; B = +toks[i++]; } else if (k === "at") { r = +toks[i++]; c = +toks[i++]; } else if (k === "is") want = toks[i++]; else if (k === "size") sz = +toks[i++]; }
          if (!sel.bodies.length) throw new Error("classify: selector matched nothing");
          const sat = sel.bodies.every(b => { const v = evalPred(pred, b); return want == null ? predTruthy(v) : String(v) === want; });
          world.bodies.push(makeBody({ cells: rectCells(sz, sz), r, c, color: sat ? A : B, kind: "answer", srcLine: ln }));
        }
        else if (cmd === "case" || cmd === "default" || cmd === "end") throw new Error("'" + cmd + "' is only valid inside a 'dispatch … end' block");
        else throw new Error("unknown command: " + cmd);
      } catch (e) { throw new Error("scene error (line " + (ln + 1) + "): " + lines[ln].trim() + "\n  -> " + e.message); }
    }

    // dispatch SEL by PRED  /  case V.. → body  /  …  /  default → body  /  end
    // route each matched object to a branch by its predicate VALUE; the branch transforms `it` (that object).
    // This is the context-sensitive rule — the keystone IQ / ARC-AGI-2 difficulty driver (G2).
    function runDispatch(start) {
      const head = tokenize(lines[start].replace(/#.*$/, ""));
      const sel = resolveSel(world, head, 1);
      if (head[sel.i] !== "by" || head[sel.i + 1] == null) throw new Error("scene error (line " + (start + 1) + "): use 'dispatch SEL by PRED'");
      const pred = head[sel.i + 1];
      if (!PREDICATES[pred]) throw new Error("scene error (line " + (start + 1) + "): unknown predicate '" + pred + "' (have: " + Object.keys(PREDICATES).join(" ") + ")");
      const cases = []; let cur = null, ln = start + 1;
      for (; ln < lines.length; ln++) {
        const t = lines[ln].replace(/#.*$/, "").trim(), tl = t.toLowerCase();
        if (tl === "end") break;
        if (/^dispatch\b/.test(tl)) throw new Error("scene error (line " + (ln + 1) + "): nested 'dispatch' not supported");
        const mc = t.match(/^case\s+(.+)$/i);
        if (mc) { cur = { vals: mc[1].trim().split(/\s+/), body: [] }; cases.push(cur); }
        else if (tl === "default") { cur = { vals: null, body: [] }; cases.push(cur); }
        else if (t !== "") { if (!cur) throw new Error("scene error (line " + (ln + 1) + "): statement before first 'case' in dispatch"); cur.body.push(ln); }
      }
      if (ln >= lines.length) throw new Error("scene error (line " + (start + 1) + "): 'dispatch' not closed with 'end'");
      world.program.push(head.join(" ") + "  { " + cases.length + " cases }");
      const plan = sel.bodies.map(b => ({ b, v: String(evalPred(pred, b)) }));   // snapshot the value BEFORE any mutation
      for (const { b, v } of plan) {
        let chosen = cases.find(c => c.vals && c.vals.some(x => x === v || (x === "yes" && v === "true") || (x === "no" && v === "false")));
        if (!chosen) chosen = cases.find(c => c.vals === null);   // default branch (if any)
        if (!chosen) continue;
        const prev = world._it; world._it = b;
        for (const bl of chosen.body) execStmt(lines[bl], bl);
        world._it = prev;
      }
      return ln;   // index of the matching 'end'; the main loop's ln++ steps past it
    }

    for (let ln = 0; ln < lines.length; ln++) {
      const head = tokenize(lines[ln].replace(/#.*$/, ""));
      if (head[0] && head[0].toLowerCase() === "dispatch") { ln = runDispatch(ln); continue; }
      execStmt(lines[ln], ln);
    }
    if (!noSim && world.frames.length === 0) simulate(world, 0);
    world.repOut = describeBodies(world.bodies);
    return world;
  }
  function parseKVShooter(toks, i) {
    const kv = {};
    while (i < toks.length) { const k = toks[i++];
      if (k === "at") { kv.r = +toks[i++]; kv.c = +toks[i++]; }
      else if (k === "dir") kv.dir = toks[i++];
      else if (k === "every") kv.every = +toks[i++];
      else if (k === "beam") kv.beam = toks[i++];
      else if (k === "color") kv.color = +toks[i++];
      else if (k === "speed") kv.speed = +toks[i++];
      else if (k === "bounce") kv.bounce = +toks[i++];
    }
    return kv;
  }

  function generate(text, extra = {}) { return toGridVid(runScene(text), extra); }

  // ---- prodigy-task: the dataset unit = (EXAMPLES, IN, OUT) -------------------
  // the simulator's latent view of a state: the objects it knows about (the "DSL internal representation").
  function describeBodies(bodies) {
    return bodies.filter(b => b.kind !== "bolt" && b.kind !== "belt").map(b => {
      const [h, w] = bbox(b.cells);
      return { id: b.id, kind: b.kind, color: b.color, r: b.r, c: b.c, h, w, n: b.cells.length, cells: b.cells };
    });
  }
  // override / inject the scene seed so one template yields a family of instances.
  function withSeedText(text, seed) {
    // seed goes at the TOP (remove any existing seed line) so 'grid rand' can use it before the grid is built.
    return "seed " + seed + "\n" + String(text).replace(/^[ \t]*seed\b.*$/gm, "").replace(/\n{2,}/g, "\n");
  }
  const sameFrame = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  // run one instance and split its frames into an IN video and an OUT video.
  function runPair(text, seed) {
    const w = runScene(withSeedText(text, seed));
    const split = (w.splitAt == null) ? Math.max(1, Math.ceil(w.frames.length / 2)) : Math.min(w.splitAt, w.frames.length);
    const cp = g => g.map(r => r.slice());
    const inV = w.frames.slice(0, split).map(cp), outV = w.frames.slice(split).map(cp);
    return { in: inV.length ? inV : [cp(w.frames[0])], out: outV.length ? outV : [cp(w.frames[w.frames.length - 1])], world: w, vary: w.vary || null };
  }
  // procedural rule-safe augmentation: pick a RANDOM SUBSET of the generator-declared axes, each with a
  // random magnitude → ONE composite grid transform applied IDENTICALLY to every grid in the WHOLE task
  // (all examples + test), so the IN→OUT rule stays consistent across the demos. Per-example diversity
  // comes from instance variation (seeds), this gives per-TASK diversity.
  // axes: flip · rot · zoom · color. Only the generator (which knows the rule) declares which are safe.
  function sampleTaskTransform(axes, rng, wild) {
    if (!axes || !axes.length) return { fn: g => g, applied: [] };
    const chosen = wild ? axes.slice() : axes.filter(() => rng.int(0, 1) === 1);   // wild = use ALL declared axes
    if (!chosen.length) chosen.push(axes[rng.int(0, axes.length - 1)]);   // at least one direction
    let fn = g => g; const applied = []; let perm = null;
    const then = f => { const prev = fn; fn = g => f(prev(g)); };
    for (const ax of chosen) {
      if (ax === "flip") { const v = rng.int(0, 1); then(g => transformGrid(g, v ? 2 : 0, true)); applied.push(v ? "flip-v" : "flip-h"); }
      else if (ax === "rot") { const kk = rng.int(1, 3); then(g => transformGrid(g, kk, false)); applied.push("rot" + (kk * 90)); }
      else if (ax === "zoom") { const z = [2, 3][rng.int(0, 1)]; then(g => zoomGrid(g, z)); applied.push("zoom-in" + z); }   // augmentation = zoom-IN only (zoom-out is destructive on sparse grids; use the `zoom factor -2` FUNCTION for deliberate downscale)
      else if (ax === "shift") { const sr = rng.int(-2, 2), sc = rng.int(-2, 2); then(g => shiftGrid(g, sr, sc)); applied.push("shift" + sr + "," + sc); }
      else if (ax === "color") { perm = perm || randomColorPerm(rng); then(g => permuteColors(g, perm)); applied.push("color-perm"); }
    }
    return { fn, applied };
  }
  // assemble a task from raw IN/OUT pairs (template-mode or manual-mode share this).
  function finishTask(rawEx, rawTest, text, opts, extra) {
    const w = rawTest.world;
    const t = (opts.augment === false) ? { fn: g => g, applied: [] }
      : sampleTaskTransform(rawTest.vary, makeRng((opts.seed0 || 1) * 2654435761 + 40503), opts.wild);   // ONE task-level transform
    const apply = p => ({ in: p.in.map(t.fn), out: p.out.map(t.fn) });
    const examples = rawEx.map(apply), test = apply(rawTest);
    const task = {
      format: "prodigy-task", version: 1,
      width: test.in[0][0].length, height: test.in[0].length, palette: "arc10", fps: opts.fps || 6,
      examples, in: test.in, out: test.out,
      meta: Object.assign({
        rule: w.meta.rule || null,
        concepts: w.meta.concepts || [],
        difficulty: w.meta.difficulty == null ? null : w.meta.difficulty,   // 0 (trivial) … 1 (ARC-AGI-2 level)
        n_examples: examples.length,
        dsl: text,
        generator: "gridvid",
        split: (w.splitAt == null) ? "half" : w.splitAt,
        scene: w.meta.scene || null,
        vary_axes: rawTest.vary || [],
        augment_applied: t.applied,
        wild: !!opts.wild,
        representation: { program: w.program || [], in_objects: w.repIn || [], out_objects: w.repOut || [] },
      }, extra),
    };
    task.meta.teaching = validateTask(task, { preCutSelect: !!w.preCutSelect, bg: w.bg });
    return task;
  }
  // MANUAL mode: the generator authors each example explicitly (genuinely diverse, not one template reseeded).
  // Blocks are separated by header lines `=== example ===` / `=== test ===`; each block is a full self-contained scene.
  function buildManualTask(text, opts = {}) {
    const blocks = []; let cur = null;
    for (const ln of text.split(/\r?\n/)) {
      const m = ln.match(/^\s*===\s*(test|example)?/i);
      if (m) { cur = { role: (m[1] || "example").toLowerCase(), lines: [] }; blocks.push(cur); }
      else if (cur) cur.lines.push(ln);
    }
    const exBlocks = blocks.filter(b => b.role === "example");
    const testBlock = blocks.find(b => b.role === "test") || exBlocks.pop();
    const run = b => runPair(b.lines.join("\n"), opts.seed0 || 1);
    return finishTask(exBlocks.map(run), run(testBlock), text, opts, { authored: "manual" });
  }
  // build a (EXAMPLES, IN, OUT) task. TEMPLATE mode: one scene reseeded into a family; the number of examples K
  // can be fixed (opts.examples) or declared variable in the scene (`examples rand LO HI` → n_examples augmentation).
  function buildTask(text, opts = {}) {
    if (/^\s*===/m.test(text)) return buildManualTask(text, opts);   // MANUAL mode (generator-authored diverse examples)
    const seed0 = opts.seed0 || 1;
    let k = opts.examples;
    if (k == null) { const probe = runScene(withSeedText(text, seed0), { noSim: true }); k = probe.meta.examplesRange ? makeRng(seed0 * 99989 + 7).int(probe.meta.examplesRange[0], probe.meta.examplesRange[1]) : 3; }
    const exSeeds = opts.exSeeds || Array.from({ length: k }, (_, i) => seed0 + i);
    const testSeed = opts.testSeed == null ? seed0 + k : opts.testSeed;
    return finishTask(exSeeds.map(s => runPair(text, s)), runPair(text, testSeed), text, opts, { seeds: { examples: exSeeds, test: testSeed } });
  }
  // a task TEACHES iff (a) every pair changes IN→OUT, and (b) the EXAMPLES are not all identical — if every demo
  // is the same grid, the non-rule features were not varied and the model can memorize instead of induce.
  // returns {ok, warnings, reasons}; ok=false ⇒ non-informative (reject). warnings ⇒ weak but usable.
  function validateTask(task, opts = {}) {
    const reasons = [], warnings = [], incoherent = []; const lastOf = v => v[v.length - 1], bg = opts.bg == null ? 0 : opts.bg;
    const pairs = task.examples.concat([{ in: task.in, out: task.out }]);
    const nonBg = g => { let n = 0; for (const r of g) for (const x of r) if (x !== bg) n++; return n; };
    const diff = (a, b) => { if (a.length !== b.length || a[0].length !== b[0].length) return Infinity; let d = 0; for (let r = 0; r < a.length; r++) for (let c = 0; c < a[0].length; c++) if (a[r][c] !== b[r][c]) d++; return d; };
    let changed = 0;
    pairs.forEach((p, i) => {
      if (!p.in.length || !p.out.length) reasons.push("pair " + i + " has an empty side");
      else if (!sameFrame(lastOf(p.in), lastOf(p.out))) changed++;
      else reasons.push("pair " + i + " is identity (OUT == IN — no teaching)");
    });
    if (!task.examples.length) reasons.push("no EXAMPLES — rule cannot be inferred");
    const distinct = new Set(task.examples.map(e => JSON.stringify(lastOf(e.in)))).size;   // do the demos vary?
    const examplesVary = task.examples.length < 2 || distinct >= 2;
    if (!examplesVary) warnings.push("examples are identical — vary the non-rule features (random / color rand / rand sizes)");
    // --- cheap structural coherence guards (zero-LLM): reject the common nonsense patterns ---
    if (opts.preCutSelect) incoherent.push("selection (extract/remove) ran BEFORE the IN snapshot → the rule is invisible in IN");
    const tIn = lastOf(task.in), tOut = lastOf(task.out);
    if (nonBg(tIn) < 2) incoherent.push("IN is near-empty (<2 cells) — nothing for the rule to act on");
    const d = diff(tIn, tOut);
    if (d !== Infinity && d > 0 && d < 2) incoherent.push("OUT differs from IN by <2 cells — the change is trivial/invisible");
    const coherent = incoherent.length === 0;
    const ok = reasons.length === 0 && changed === pairs.length;
    return { ok, coherent, examplesVary, distinctExamples: distinct, changedPairs: changed, totalPairs: pairs.length, warnings, reasons, incoherent };
  }
  // lay a task out as ONE animated grid: each row = [IN | sep | OUT]; rows = examples then the test.
  // videos of differing length are padded by holding the last frame; JSON stays the source of truth.
  function taskToMontage(task, opts = {}) {
    // each panel is drawn at its TRUE size inside a 1-cell frame, so IN/OUT of different sizes (crop, grid-rand,
    // zoom) are actually visible (no padding to a common size). rows = examples then the test, top-aligned.
    const sep = opts.sep == null ? 5 : opts.sep, bg = opts.bg == null ? 0 : opts.bg, gap = 1;
    const rows = task.examples.map(e => [e.in, e.out]).concat([[task.in, task.out]]);
    const maxLen = Math.max(...rows.flat().map(v => v.length));
    const pad = (v, t) => v[Math.min(t, v.length - 1)];
    const fw = v => v[0][0].length, fh = v => v[0].length;
    const inCol = Math.max(...rows.map(r => fw(r[0]))) + 2, outCol = Math.max(...rows.map(r => fw(r[1]))) + 2;
    const rowH = rows.map(r => Math.max(fh(r[0]), fh(r[1])) + 2);
    const totalW = inCol + gap + outCol, totalH = rowH.reduce((a, b) => a + b, 0) + (rows.length - 1);
    const drawFramed = (g, y, x, f) => {
      const h = f.length, w = f[0].length;
      for (let c = 0; c < w + 2; c++) { if (g[y]) g[y][x + c] = sep; if (g[y + h + 1]) g[y + h + 1][x + c] = sep; }
      for (let r = 0; r < h + 2; r++) if (g[y + r]) { g[y + r][x] = sep; g[y + r][x + w + 1] = sep; }
      for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) if (g[y + 1 + r]) g[y + 1 + r][x + 1 + c] = f[r][c];
    };
    const frames = [];
    for (let t = 0; t < maxLen; t++) {
      const g = Array.from({ length: totalH }, () => new Array(totalW).fill(bg));
      let y = 0;
      rows.forEach((row, ri) => {
        drawFramed(g, y, 0, pad(row[0], t));
        drawFramed(g, y, inCol + gap, pad(row[1], t));
        y += rowH[ri];
        if (ri < rows.length - 1) { for (let c = 0; c < totalW; c++) g[y][c] = sep; y += 1; }
      });
      frames.push(g);
    }
    return { format: "2dgridvid", version: VERSION, width: totalW, height: totalH, palette: "arc10", fps: opts.fps || 2, meta: { montage: true, rule: task.meta.rule }, frames };
  }

  // grammar string for the CLI `dsl` command (agent self-documentation).
  const GRAMMAR = `gridvid scene-DSL — one command per line, '#' = comment, commas = spaces.
coords are 'row col' (0,0 = top-left); +row=down, +col=right.

  grid W H | rand WMIN WMAX HMIN HMAX    grid size (rand = the whole task size varies per seed)
  bg C                           background color (0..9)
  seed N                         RNG seed (random/voronoi reproducible)
  walls box|floor|none           solid borders
  gravity DIR [N] | GR GC        gravity (down/up/left/right strength N)
  name TEXT                      label (export filename + meta)

  spawn SHAPE [a..] at R C [opts] movable object
      opts: color C · vel DR DC · grav 0|1 · bounce 0..1 · spin K (rotate 90 every K)
      color rand [LO HI] (RANDOM colour per seed — vary features that are NOT the rule, to force generalization)
            fill solid|outline · interior C · layer N · ghost 0|1 (ignore collisions; useful for occlusion)
            link ID (mirror that body's moves)
            magnet K (bodies with the SAME K march together & dock; different K ignore) · id NAME · target HOLEID
            random [R0 C0 R1 C1] (random placement, optional box)
  hole SHAPE [a..] at R C [id NAME] [color C]      sorter socket

  # --- static transform verbs (build-time; pair before/after with hold) ---
  # SEL = NAME (body id) | at R C | color C | shape NAME | largest | smallest | all
  copy SEL to R C [rot K] [flip h|v] [tint C] [interior C] [times N DR DC] [id NAME]
                                 duplicate first-matched body (transformed) at R C; times = tile N steps of DR DC
  recolor SEL tint C [interior C]    recolor all matched bodies in place
  move SEL to R C | by DR DC         relocate matched bodies (group-preserving for 'to')
  mirror SEL axis h|v [gap G] [tint C]   place a mirrored copy of the body adjacent across the axis
  remove SEL                         delete matched bodies (corrupt / make 'the odd one out')
  extract SEL                        keep ONLY matched bodies (selection / extraction task)
  corrupt SEL [tint C]               recolor a RANDOM matched body (the error). pair with repair
  break SEL [cells N]                knock out N random cells of a random matched body (forward reconstruction)
  repair                             restore everything corrupt/break damaged (the fixed OUT)
  board H W at R C [color C]      shape-sorter backdrop (holes punched out)
  sort on|off                    pieces route to their matching hole and snap in

  voronoi N [metric euclid|manhattan] [drift] [borders C] [colors C..]   region field
  noise uniform [colors C..] [probs P..]      random grid (per-color probability)
  noise perlin [scale S] [colors C..]         smooth Perlin field mapped to colors
  shooter at R C dir DIR every K beam bolt|ray|spread color C [speed S]  emitter
  source at R C color C [rate K] [amount K]                              liquid source (amount = cells/fill tick)
  spill at R C color C [rate K]    NEW simple fluid: continuous laminar pour that FILLS a container and OVERFLOWS the rim
  explode SEL [speed S]           object flies apart into radial fragments (bounce off walls)
  shatter SEL [speed S]           object breaks into fragments that FALL (auto gravity)
  burst at R C [count N] [color C] [speed S]   a radial firework of fragments from a point
  path at R C to R C [to R C..] [color C] [walk C]   a drawn route + an object that follows it each step (worm/square)
  liquid [viscosity 0..1] [turbulence 0..1] [flow K]   stream + local settle/spread/spill; flow = default cells/fill tick
  counter at R C base B colors C0 C1 C2.. [every K] [gap G]   modular-counting odometer:
                                 every B units of C0 carry into one C1, B of C1 into one C2 …
  snake at R C len L color C food F        a snake head-seeks the food, grows on eating
  life [density 0..1] [color C]            Conway's Game of Life (emergence)
  wave [color C] [amp A] [period P]        a travelling sine wave (periodicity)
  well at R C [strength S] [color C]       gravity well — bodies are pulled toward it (orbit/attraction)
  conveyor at R C len L dir left|right [color C]   a belt that carries bodies riding it (transport)
  maze [wall C] [solve C]                  generate a maze; with solve, animate the BFS solution path
  shooter ... bounce 1                     beams ricochet off walls (light reflection)
  hidelayer N                    hide every object on layer N
  mark_enclosed C                color background cells enclosed by shapes

  run N                          simulate N frames
  hold N                         freeze current frame N times
  snap N                          render the CURRENT state N times (capture after a static verb)

  # --- task authoring (the dataset unit is a triple EXAMPLES, IN, OUT) ---
  # composition: define + call functions (nestable). $var substitution with $v+K / $v-K / $v*K arithmetic.
  def NAME p1 p2 ..  ..body using $p1..  end       define a function
  use NAME a1 a2 ..              call it (use inside def = composition)
  repeat N idx  ..body using $idx..  end           iterate N times (N may be 'rand LO HI' → count varies per seed)
  cut                            split point: frames BEFORE = IN, frames AFTER = OUT (omit ⇒ split in half)
  # --- whole-grid transforms (the ARC-AGI-2 layer): OUT = transform of the whole IN grid ---
  grid_rotate K                  rotate the entire grid K×90°
  grid_flip h|v|diagonal         flip the entire grid (diagonal = transpose)
  grid_map FROM TO [FROM TO..]   per-cell palette remap of the whole grid
  sort_rows [by C] [desc]        reorder the grid rows by how many cells equal colour C
  solve                          Latin-square completion: fill the 0s so rows+cols are permutations
  grid_complete h|v|rot180|diagonal   matrix/symmetry completion: fill blank cells as the mirror/rotation of the filled part (Raven-style)
  unfold (h|v at K)+             paper-folding (VZ-2): reflect every mark across each crease line (row/col K) and union — folds applied in order
  crop [pad P]                   resize the OUT to the bounding box of the content (e.g. the extracted object)
  arrange SEL by size|color [at R C] [gap G] [dir h|v] [desc]   lay matched objects in an ORDERED row

  # --- boolean figure-algebra (G1): combine two figures cell-wise (top-left aligned) ---
  combine SEL_a SEL_b op or|xor|and|sub [into R C] [color C]   cell boolean of two figures → one new figure (sources removed)
                                 or=union · and=intersection · xor=symmetric-difference (shared cancel) · sub=A minus B
  overlay_figs SEL_a SEL_b at R C [overlap C]   superimpose: A-only keeps A's colour, B-only B's colour, shared = overlap colour

  # --- analogy + series + odd-one-out (G4) ---
  odd [by PROP]                  a SELECTOR: the body whose PROP differs from the modal (PROP = shape|color|size|<predicate>). e.g. 'extract odd by color'
  bind_transform NAME from SEL_a to SEL_b   capture the A→B delta (move + recolour) as NAME (the analogy "A is to B")
  apply NAME to SEL              re-apply a bound transform to matched bodies (".. as C is to ?") — analogy completion
  progress SHAPE at R C attr size|color step K n N [base B] [gap G] [dir h|v] [color C]   a row of N objects, one attribute in arithmetic progression

  # --- context-sensitive rules (G2) + detector predicates (G3): the per-object CONDITIONAL ---
  # PREDICATES (test a body): color · kind · size · size_class(small|mid|big) · orientation(wide|tall|square)
  #   · convex(hull==filled) · symmetric · symmetry(h|v|hv|rot|none) · connected · collinear · loop(has hole) · holes(#) · parity(even|odd)
  dispatch SEL by PRED          route EACH matched object to a branch by its predicate value:
      case V [V2..]                  ... statements transforming 'it' (the current object) ...
      default                        ... (optional fallback branch) ...
    end                              # e.g. recolor a body by whether it is symmetric — the conditional rule
  classify SEL by PRED into A B [at R C] [is V] [size N]   Bongard scene→class: one marker, A if ALL satisfy PRED else B
  where PRED [is V]              a SELECTOR: matched bodies where PRED holds (or equals V) — e.g. 'extract where convex'
  it                             a SELECTOR for the object the enclosing dispatch is routing (use inside case bodies)
  rule TEXT                      the teaching this task demonstrates (→ task.meta.rule)
  concept TAG..                  concept labels for the task (→ task.meta.concepts)
  difficulty D                   self-rated difficulty 0..1 (0 = trivial copy, 1 = ARC-AGI-2 level)
  examples N | rand LO HI         number of demonstration pairs (n_examples); rand => varies per task
  vary AXIS..                    rule-safe global aug axes the generator declares: flip rot zoom color
                                 (one transform per task, applied to all examples+test → preserves the rule)
  scatter N [color C|rand] [box R0 C0 R1 C1]   add N random free cells (noise) — content NOT derived from anything
  paint R C color C              paint one exact cell (free "here and there" additions; OUT need not be f(IN))
  tally SEL at R C color C [dir h|v]   draw a bar whose length = how many bodies SEL matched (counting)
  lattice ROWS COLS [cell N] [gap G] [color C] [holes K] [at R C]   interleaving grid of blocks; K random holes
  fill [color C]                 materialize the lattice holes (grids: count/fill/extract holes)
  lattice .. outline             INVERSE grid: each cell is a frame (border coloured, interior empty)
  mesh ROWS COLS [color C] [irregular]    graph-paper: coloured grid LINES (the INVERSE — bg gets the colour); irregular = uneven cells
  lattice .. irregular           tight columns / wide rows (non-uniform cell sizes)
  zoom SEL [factor K] (or double)   object-level scale FUNCTION: K≥2 zoom-in (2x2->4x4), K≤-2 zoom-out (downsample). also an aug axis: vary zoom
  turtle at R C dir DIR program OPS|rand K [color C]   a turtle program (OPS over F/L/R), drawn as a code strip
  drive                          execute the turtle program, drawing its traced path (program execution)
  # a scene = ONE instance; 'cli.js task SCENE --examples K' runs seeds 1..K+1 to build the family.

SHAPES: dot · square S · rect H W · line LEN [v] · plus S · Lshape S · Tshape S
        triangle S · diamond R · disc R · ring S · frame H W · notch S · bump S (bump fits notch)
        any size arg also accepts 'rand LO HI' (e.g. square rand 3 5) -> size varies per example`;

  return {
    VERSION, ARC_PALETTE, GRAMMAR, makeRng,
    SHAPES, buildShape, normalize, outline, interiorOf, shapeSig, bbox, rotateCells,
    flipCellsH, flipCellsV, transformCells,
    makeBody, makeWorld, stepWorld, moveBody, renderFrame, markEnclosedRegions,
    simulate, hold, toGridVid, runScene, generate,
    buildTask, validateTask, taskToMontage, runPair, withSeedText,
    transformGrid, permuteColors, augmentVid, augmentScene, materializeVid, zoomGrid, zoomVid,
    PREDICATES, evalPred,
  };
});
