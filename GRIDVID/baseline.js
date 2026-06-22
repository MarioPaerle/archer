/* baseline.js — a DUMB 1-step ARC solver. If it solves a task, the task is TOO SIMPLE.
 * The objective "too simple" detector: trivialSolve(task) returns the name of the single
 * operation that explains EVERY example (+ the test), or null if no 1-step op does.
 * Used to FILTER generated tasks down to the non-trivial ones (ARC-AGI-2 aims hard). */
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const rot1 = g => { const H = g.length, W = g[0].length, o = Array.from({ length: W }, () => new Array(H)); for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) o[c][H - 1 - r] = g[r][c]; return o; };
const rotk = (g, k) => { let o = g; for (let i = 0; i < ((k % 4) + 4) % 4; i++) o = rot1(o); return o; };
const flipH = g => g.map(r => r.slice().reverse());
const flipV = g => g.slice().reverse().map(r => r.slice());
const transpose = g => { const H = g.length, W = g[0].length, o = Array.from({ length: W }, () => new Array(H)); for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) o[c][r] = g[r][c]; return o; };
const antitranspose = g => flipH(flipV(transpose(g)));
function crop(g, bg = 0) { let r0 = 1e9, r1 = -1, c0 = 1e9, c1 = -1; for (let r = 0; r < g.length; r++) for (let c = 0; c < g[0].length; c++) if (g[r][c] !== bg) { if (r < r0) r0 = r; if (r > r1) r1 = r; if (c < c0) c0 = c; if (c > c1) c1 = c; } if (r1 < 0) return g; const o = []; for (let r = r0; r <= r1; r++) { const row = []; for (let c = c0; c <= c1; c++) row.push(g[r][c]); o.push(row); } return o; }
function colormap(inG, outG) { if (inG.length !== outG.length || inG[0].length !== outG[0].length) return null; const m = {}; for (let r = 0; r < inG.length; r++) for (let c = 0; c < inG[0].length; c++) { const a = inG[r][c], b = outG[r][c]; if (a in m) { if (m[a] !== b) return null; } else m[a] = b; } return m; }
const applyMap = (g, m) => g.map(r => r.map(x => (m[x] != null ? m[x] : x)));

const last = v => v[v.length - 1];
function pairsOf(task) { return task.examples.map(e => [last(e.in), last(e.out)]).concat([[last(task.in), last(task.out)]]); }

// the 1-step battery. Each entry: a function grid→grid that some trivial solver would try.
const GEO = {
  identity: g => g,
  rot90: g => rotk(g, 1), rot180: g => rotk(g, 2), rot270: g => rotk(g, 3),
  flipH, flipV, transpose, antitranspose,
  crop: g => crop(g),
};
// --- object-level "easy moves" a human/simple-solver would try (so "survives baseline" means really non-trivial) ---
const colorsOf = g => { const s = new Set(); for (const r of g) for (const x of r) if (x) s.add(x); return [...s]; };
const keepColor = (g, col, bg = 0) => g.map(r => r.map(x => x === col ? x : bg));
function tile(g, ny, nx) { const o = []; for (let br = 0; br < ny; br++) for (let r = 0; r < g.length; r++) { const row = []; for (let bx = 0; bx < nx; bx++) for (let c = 0; c < g[0].length; c++) row.push(g[r][c]); o.push(row); } return o; }
function upscale(g, k) { const o = []; for (let r = 0; r < g.length; r++) for (let a = 0; a < k; a++) { const row = []; for (let c = 0; c < g[0].length; c++) for (let b = 0; b < k; b++) row.push(g[r][c]); o.push(row); } return o; }
function symmetrize(g, axis, bg = 0) { const m = axis === "h" ? flipH(g) : flipV(g); return g.map((row, r) => row.map((x, c) => x !== bg ? x : m[r][c])); }
function largestCC(g, bg = 0) {   // keep only the largest 4-connected same-colour blob (denoise/keep-shape)
  const H = g.length, W = g[0].length, seen = Array.from({ length: H }, () => new Array(W).fill(false)); let best = [], bestN = 0;
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) { if (seen[r][c] || g[r][c] === bg) continue; const col = g[r][c], st = [[r, c]], cells = []; seen[r][c] = true;
    while (st.length) { const [y, x] = st.pop(); cells.push([y, x]); for (const [dy, dx] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const ny = y + dy, nx = x + dx; if (ny >= 0 && nx >= 0 && ny < H && nx < W && !seen[ny][nx] && g[ny][nx] === col) { seen[ny][nx] = true; st.push([ny, nx]); } } }
    if (cells.length > bestN) { bestN = cells.length; best = cells; } }
  const o = Array.from({ length: H }, () => new Array(W).fill(bg)); for (const [y, x] of best) o[y][x] = g[y][x]; return o;
}
// returns the name of the single op that solves ALL pairs, or null (= survives → not trivially 1-step)
function trivialSolve(task) {
  const pairs = pairsOf(task);
  for (const [name, fn] of Object.entries(GEO)) { try { if (pairs.every(([i, o]) => eq(fn(i), o))) return name; } catch (e) { } }
  if (pairs.every(([, o]) => eq(o, pairs[0][1]))) return "constant";
  const m0 = colormap(pairs[0][0], pairs[0][1]); if (m0 && pairs.every(([i, o]) => eq(applyMap(i, m0), o))) return "colormap";
  // extract a single colour (kept in place OR cropped to its bbox)
  for (const col of colorsOf(pairs[0][0])) { try {
    if (pairs.every(([i, o]) => eq(keepColor(i, col), o))) return "extract:" + col;
    if (pairs.every(([i, o]) => eq(crop(keepColor(i, col)), o))) return "extract-crop:" + col;
  } catch (e) { } }
  // symmetry completion (union with mirror), tiling, integer upscale, keep-largest-blob
  for (const ax of ["h", "v"]) if (pairs.every(([i, o]) => eq(symmetrize(i, ax), o))) return "symmetrize:" + ax;
  for (const [ny, nx] of [[1, 2], [2, 1], [2, 2], [3, 3], [3, 1], [1, 3]]) { try { if (pairs.every(([i, o]) => eq(tile(i, ny, nx), o))) return "tile:" + ny + "x" + nx; } catch (e) { } }
  for (const k of [2, 3]) { try { if (pairs.every(([i, o]) => eq(upscale(i, k), o))) return "upscale:" + k; } catch (e) { } }
  try { if (pairs.every(([i, o]) => eq(largestCC(i), o) || eq(crop(largestCC(i)), o))) return "keep-largest"; } catch (e) { }
  return null;
}
module.exports = { trivialSolve, pairsOf };
