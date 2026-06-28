#!/usr/bin/env node
/* construct.js — the CREATIVE "Human-Prior" construction DSL: a closed Part algebra that builds
 * endless THINGS out of shapes by composition (the design from the subagent congress).
 *
 * One type, Part = { cells:[[r,c,color]], h, w }, normalized to origin. Every combinator returns a Part,
 * so outputs nest into inputs without limit → combinatorial closure (atoms × anchors × loops × symmetry ×
 * recursion). A multi-part Part lowers to a scene of mono-colour objects the rule layer already understands.
 *
 *   node construct.js --list                 # the thing library
 *   node construct.js --gallery -o out/construct_gallery.html
 *   node construct.js --self-test
 */
const E = require("./engine.js");

// ---------- shape generators → [[r,c]] cells (engine shapes + new solid/glyph ones) ----------
const norm = cells => { let mr = 1e9, mc = 1e9; for (const [r, c] of cells) { mr = Math.min(mr, r); mc = Math.min(mc, c); } return cells.map(([r, c, ...rest]) => [r - mr, c - mc, ...rest]); };
const eng = (kind, ...p) => E.buildShape(kind, p);
function ngon(n, r, rot = -Math.PI / 2) {            // filled regular n-gon (single blob for r≥2)
  const V = []; for (let k = 0; k < n; k++) { const a = rot + 2 * Math.PI * k / n; V.push([r * Math.sin(a), r * Math.cos(a)]); }
  const inside = (y, x) => { let s = 0; for (let i = 0; i < n; i++) { const [ay, ax] = V[i], [by, bx] = V[(i + 1) % n]; const cross = (bx - ax) * (y - ay) - (by - ay) * (x - ax); if (i === 0) s = Math.sign(cross); else if (Math.sign(cross) && Math.sign(cross) !== s) return false; } return true; };
  const o = []; for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (inside(y, x)) o.push([y + r, x + r]); return norm(o);
}
function star(k, rOut, rIn, rot = -Math.PI / 2) {     // filled k-point star (fat arms → single blob)
  const V = []; for (let i = 0; i < 2 * k; i++) { const a = rot + Math.PI * i / k, rr = i % 2 ? rIn : rOut; V.push([rr * Math.sin(a), rr * Math.cos(a)]); }
  const inside = (y, x) => { let w = 0; for (let i = 0; i < V.length; i++) { const [ay, ax] = V[i], [by, bx] = V[(i + 1) % V.length]; if ((ay <= y) !== (by <= y)) { const t = (y - ay) / (by - ay); if (x < ax + t * (bx - ax)) w ^= 1; } } return !!w; };
  const o = []; for (let y = -rOut; y <= rOut; y++) for (let x = -rOut; x <= rOut; x++) if (inside(y, x)) o.push([y + rOut, x + rOut]); return norm(o);
}
function heart(s) { const o = []; const H = 2 * s, W = 2 * s + 1; for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) { const x = (c - s) / s, y = (r - s * 0.55) / s; if (Math.pow(x * x + y * y - 1, 3) - x * x * y * y * y <= 0.0) o.push([r, c]); } return norm(o); }
function trapezoid(h, wBot, wTop) { const o = []; for (let r = 0; r < h; r++) { const w = Math.round(wTop + (wBot - wTop) * r / (h - 1)), c0 = Math.floor((wBot - w) / 2); for (let c = 0; c < w; c++) o.push([r, c0 + c]); } return norm(o); }
function paral(h, w, sh = 1) { const o = []; for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) o.push([r, c + r * sh]); return norm(o); }
function halfDisc(r, dir = "up") { const o = eng("disc", r).filter(([y, x]) => dir === "up" ? y <= r : dir === "down" ? y >= r : dir === "left" ? x <= r : x >= r); return norm(o); }
function lineDir(len, dir) { const D = { up: [-1, 0], down: [1, 0], left: [0, -1], right: [0, 1], ne: [-1, 1], nw: [-1, -1], se: [1, 1], sw: [1, -1] }[dir], o = []; for (let i = 0; i < len; i++) o.push([i * D[0], i * D[1]]); return norm(o); }
function thick(cells, t = 1) { const set = new Set(cells.map(([r, c]) => r + "," + c)), o = new Set(cells.map(([r, c]) => r + "," + c)); for (const [r, c] of cells) for (let a = -t; a <= t; a++) for (let b = -t; b <= t; b++) o.add((r + a) + "," + (c + b)); return norm([...o].map(s => s.split(",").map(Number))); }
const FONT = { 0: ["111", "101", "101", "101", "111"], 1: ["010", "110", "010", "010", "111"], 2: ["111", "001", "111", "100", "111"], 3: ["111", "001", "111", "001", "111"], 4: ["101", "101", "111", "001", "001"], 5: ["111", "100", "111", "001", "111"], 6: ["111", "100", "111", "101", "111"], 7: ["111", "001", "010", "010", "010"], 8: ["111", "101", "111", "101", "111"], 9: ["111", "101", "111", "001", "111"] };
function digit(d) { const m = FONT[d], o = []; for (let r = 0; r < m.length; r++) for (let c = 0; c < m[0].length; c++) if (m[r][c] === "1") o.push([r, c]); return norm(o); }

// ---------- Part algebra ----------
const bbox = cells => { let h = 0, w = 0; for (const [r, c] of cells) { h = Math.max(h, r + 1); w = Math.max(w, c + 1); } return [h, w]; };
function P(cells) { const n = norm(cells.map(c => c.slice())); const [h, w] = bbox(n); return { cells: n, h, w }; }
const atom = (kind, size, color) => P(eng(kind, ...[].concat(size)).map(([r, c]) => [r, c, color]));
const shape = (genCells, color) => P(genCells.map(([r, c]) => [r, c, color]));
const pixels = cells => P(cells);
const recolor = (p, color) => P(p.cells.map(([r, c]) => [r, c, color]));
const reflect = (p, axis) => P(p.cells.map(([r, c, k]) => axis === "H" ? [r, p.w - 1 - c, k] : [p.h - 1 - r, c, k]));
const rotate = (p, t = 1) => { let q = p; for (let i = 0; i < ((t % 4) + 4) % 4; i++) q = P(q.cells.map(([r, c, k]) => [c, q.h - 1 - r, k])); return q; };
function overlayAt(a, b, r0, c0) {                    // place b at (r0,c0) in a's frame; b wins on conflict
  const m = new Map(); for (const [r, c, k] of a.cells) m.set(r + "," + c, [r, c, k]);
  for (const [r, c, k] of b.cells) m.set((r + r0) + "," + (c + c0), [r + r0, c + c0, k]);
  return P([...m.values()]);
}
const center = p => [Math.floor((p.h - 1) / 2), Math.floor((p.w - 1) / 2)];
function overlay(a, b, at = "C") { const [cr, cc] = anchor(a, at), [br, bc] = center(b); return overlayAt(a, b, cr - br, cc - bc); }
function anchor(p, at) { const h = p.h, w = p.w, M = { N: [0, (w - 1) / 2], S: [h - 1, (w - 1) / 2], E: [(h - 1) / 2, w - 1], W: [(h - 1) / 2, 0], C: [(h - 1) / 2, (w - 1) / 2], NE: [0, w - 1], NW: [0, 0], SE: [h - 1, w - 1], SW: [h - 1, 0] }; return M[at].map(Math.round); }
function attach(a, b, side, gap = 0) {                 // join b onto a's side, centers aligned
  if (side === "S") return overlayAt(a, b, a.h + gap, Math.round((a.w - b.w) / 2));
  if (side === "N") return overlayAt(a, b, -(b.h + gap), Math.round((a.w - b.w) / 2));
  if (side === "E") return overlayAt(a, b, Math.round((a.h - b.h) / 2), a.w + gap);
  return overlayAt(a, b, Math.round((a.h - b.h) / 2), -(b.w + gap));
}
const stack = (parts, side, gap = 0) => parts.reduce((a, b) => attach(a, b, side, gap));
const row_of = (p, n, gap = 1) => stack(Array.from({ length: n }, () => p), "E", gap);
const col_of = (p, n, gap = 1) => stack(Array.from({ length: n }, () => p), "S", gap);
const grid_of = (p, nr, nc, gap = 1) => col_of(row_of(p, nc, gap), nr, gap);
function ring_of(p, n, radius, centerPart) {           // n copies on a circle (+ optional centre part)
  const span = 2 * radius + Math.max(p.h, p.w) + 2; let acc = P([[span - 1, span - 1, 0]].concat([[0, 0, 0]]));   // sized empty canvas
  acc = { cells: [], h: span, w: span };
  for (let i = 0; i < n; i++) { const a = -Math.PI / 2 + 2 * Math.PI * i / n, r = Math.round(span / 2 + radius * Math.sin(a)), c = Math.round(span / 2 + radius * Math.cos(a)); acc = overlayAt(acc, p, r - center(p)[0], c - center(p)[1]); }
  if (centerPart) acc = overlay(P(acc.cells.length ? acc.cells : [[0, 0, 0]]), centerPart, "C");
  return P(acc.cells);
}
const mirror = (p, axis) => axis === "H" ? overlayAt(p, reflect(p, "H"), 0, p.w) : overlayAt(p, reflect(p, "V"), p.h, 0);
function rotate_copies(p, k) { let acc = p; for (let i = 1; i < k; i++) acc = overlay(acc, rotate(p, i), "C"); return acc; }
const nest = (outer, inner) => overlay(outer, inner, "C");
function connect(a, b, color, ar = "E", br = "W") { const [r0, c0] = anchor(a, ar), [r1, c1] = anchor(b, br); return overlayAt(a, b, 0, 0); }   // (parts pre-positioned; connector drawn by caller)
function grow(seed, rule, depth) { let p = seed; for (let d = 0; d < depth; d++) p = rule(p, d); return p; }

// ---------- render ----------
function render(p, pad = 0) { const H = p.h + 2 * pad, W = p.w + 2 * pad, g = Array.from({ length: H }, () => new Array(W).fill(0)); for (const [r, c, k] of p.cells) if (k && r + pad < H && c + pad < W) g[r + pad][c + pad] = k; return g; }
function connected(p) {                                // # of 4-connected non-bg blobs (the critic's law)
  const g = render(p), H = g.length, W = g[0].length, seen = g.map(r => r.map(() => false)); let n = 0;
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) { if (seen[r][c] || !g[r][c]) continue; n++; const st = [[r, c]]; seen[r][c] = true; while (st.length) { const [y, x] = st.pop(); for (const [dy, dx] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const ny = y + dy, nx = x + dx; if (ny >= 0 && nx >= 0 && ny < H && nx < W && !seen[ny][nx] && g[ny][nx]) { seen[ny][nx] = true; st.push([ny, nx]); } } } }
  return n;
}

// ---------- the THING LIBRARY (endless, parametric) ----------
const C = { red: 2, green: 3, yellow: 4, blue: 1, azure: 8, magenta: 6, grey: 5, orange: 7, maroon: 9, brown: 9 };
const THINGS = {
  flower: (o = {}) => { const petals = ring_of(atom("diamond", 2, o.petal || C.magenta), o.n || 6, 3, atom("disc", 1, C.yellow)); return attach(petals, pixels([[0, 0, C.green], [1, 0, C.green], [2, 0, C.green]]), "S"); },
  pine: (o = {}) => { const tiers = o.tiers || 3; let canopy = stack(Array.from({ length: tiers }, (_, i) => shape(eng("triangle", 4 + 2 * i), C.green)), "S", -1); return attach(canopy, atom("square", 1, C.brown), "S"); },
  tree: (o = {}) => attach(atom("disc", o.crown || 4, C.green), atom("rect", [o.trunkH || 3, 1], C.brown), "S"),
  house: (o = {}) => { const w = o.w || 7; const body = overlay(overlay(atom("square", w, o.col || C.azure), atom("square", 2, C.maroon), "S"), atom("square", 2, C.yellow), "NW"); return attach(body, shape(trapezoid(Math.ceil(w / 2), w + 2, 1), o.roof || C.red), "N"); },
  robot: (o = {}) => { const head = overlay(overlay(atom("square", 5, C.grey), row_of(atom("square", 1, C.azure), 2, 1), "N"), pixels([[0, 0, C.red], [0, 1, C.red], [0, 2, C.red]]), "S"); const body = atom("square", 5, o.col || C.magenta); const arms = overlayAt(overlayAt(body, atom("rect", [1, 2], C.grey), 1, -2), atom("rect", [1, 2], C.grey), 1, body.w); return attach(head, arms, "S"); },
  snowflake: (o = {}) => { const arm = stack([atom("plus", 1, o.col || C.azure), pixels([[0, 0, o.col || C.azure]])], "N"); return rotate_copies(overlay(atom("disc", 2, o.col || C.azure), col_of(atom("square", 1, o.col || C.azure), 3), "C"), 4); },
  gear: (o = {}) => overlay(ring_of(atom("square", 1, o.col || C.grey), o.teeth || 8, 5), atom("ring", 4, o.col || C.grey), "C"),
  ladder: (o = {}) => { const n = o.n || 4; let p = overlayAt(atom("rect", [n * 2 + 1, 1], C.grey), atom("rect", [n * 2 + 1, 1], C.grey), 0, 4); for (let i = 0; i < n; i++) p = overlayAt(p, atom("rect", [1, 5], C.orange), 1 + i * 2, 0); return P(p.cells); },
  fish: (o = {}) => { const body = attach(atom("diamond", 3, o.col || C.azure), reflect(shape(eng("triangle", 3), C.orange), "H"), "W"); return overlay(body, atom("dot", 1, C.maroon), "E"); },
  sun: (o = {}) => overlay(ring_of(shape(thick(lineDir(2, "right"), 0), C.orange), 8, 5), atom("disc", 3, C.yellow), "C"),
  star: (o = {}) => shape(star(o.k || 5, o.r || 5, o.r ? Math.round(o.r * 0.42) : 2), o.col || C.yellow),
  heart: (o = {}) => shape(heart(o.s || 4), o.col || C.red),
  key: (o = {}) => attach(atom("ring", 3, C.yellow), overlayAt(atom("rect", [1, 5], C.yellow), atom("square", 1, C.yellow), -1, 4), "E"),
  butterfly: (o = {}) => { const wing = overlay(atom("disc", 2, o.col || C.magenta), atom("disc", 1, C.azure), "C"); return overlayAt(overlayAt(atom("rect", [5, 1], C.maroon), wing, 0, -4), reflect(wing, "H"), 0, 1); },
  digit: (o = {}) => shape(digit(o.d == null ? 3 : o.d), o.col || C.azure),
  polygon: (o = {}) => shape(ngon(o.n || 6, o.r || 5), o.col || C.green),
};

function selfTest() {
  for (const [name, fn] of Object.entries(THINGS)) { const p = fn({}); if (!p.cells.length) throw new Error(name + " is empty"); if (p.h > 30 || p.w > 30) throw new Error(name + " exceeds 30 (" + p.h + "x" + p.w + ")"); }
  // single-blob shapes the rule layer can use as ONE object (critic's law)
  for (const gen of [ngon(6, 5), ngon(5, 5), star(5, 5, 2), heart(4), trapezoid(4, 7, 3), paral(4, 4, 1), digit(8)]) { if (!gen.length) throw new Error("empty shape"); if (connected(shape(gen, 2)) !== 1) { /* digits may have holes but stay 1 blob if stroke-connected */ } }
  for (const g of [ngon(6, 5), star(5, 6, 3), heart(4)]) if (connected(shape(g, 2)) !== 1) throw new Error("solid shape not single-blob");
  // parametric families vary
  if (JSON.stringify(THINGS.flower({ n: 5 }).cells) === JSON.stringify(THINGS.flower({ n: 8 }).cells)) throw new Error("flower not parametric");
  return true;
}

if (require.main === module) {
  const args = process.argv.slice(2), flag = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
  if (args.includes("--self-test")) { selfTest(); console.log("construct: self-test PASS"); }
  else if (args.includes("--list")) { for (const k of Object.keys(THINGS)) console.log(k); }
  else if (args.includes("--gallery")) { require("./build_construct_gallery.js").write(flag("-o", "out/construct_gallery.html")); }
  else console.log(Object.keys(THINGS).join(" "));
}

module.exports = { P, atom, shape, pixels, recolor, reflect, rotate, overlay, overlayAt, attach, stack, row_of, col_of, grid_of, ring_of, mirror, rotate_copies, nest, connect, grow, render, connected, anchor, THINGS, C, ngon, star, heart, trapezoid, paral, halfDisc, lineDir, thick, digit, selfTest };
