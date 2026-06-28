/* skins2.js — render a skinned object to a local colour grid AND recover (classify) the skin from pixels.
 * Shared by the generator and the solver so they agree on the skin vocabulary. A skinned object fills its
 * whole footprint with body+accent (no bg holes) → stays one connected blob → the solver segments it as a
 * single object and reads its internal pattern back. */
const SK = require("./skins.js");
const E = require("./engine.js");

const bbox = cells => { let h = 0, w = 0; for (const [r, c] of cells) { if (r + 1 > h) h = r + 1; if (c + 1 > w) w = c + 1; } return [h, w]; };
const blank = (h, w) => Array.from({ length: h }, () => new Array(w).fill(0));

// skins that fully tile the footprint with body+accent (no holes) → recoverable & connectivity-safe.
// Restricted to a visually-distinct, non-swap-ambiguous set (used on SOLID convex shapes only).
const SKINS = ["core", "border", "cross", "stripe", "checker", "diag", "split", "quadrants"];
const SOLID_SHAPES = ["square", "diamond", "disc", "rect"];

const shapeCells = (kind, s) => kind === "frame" ? E.buildShape("frame", [s, s]) : E.buildShape(kind, [s]);

// render { kind, size, body, accent, skin } → local colour grid (0 = bg)
function renderObjLoc(spec) {
  const base = shapeCells(spec.kind, spec.size), [h, w] = bbox(base), loc = blank(h, w);
  const cells = spec.skin && spec.skin !== "plain" ? SK.skinnedCells(base, spec.skin, spec.body, spec.accent) : base.map(([r, c]) => [r, c, spec.body]);
  for (const [r, c, col] of cells) if (col) loc[r][c] = col;
  return loc;
}
const footprint = loc => { const o = []; for (let r = 0; r < loc.length; r++) for (let c = 0; c < loc[0].length; c++) if (loc[r][c]) o.push([r, c]); return o; };

// classify a blob's local grid → skin name ("plain" | one of SKINS | "unknown")
function classifySkin(loc) {
  const cells = footprint(loc); if (!cells.length) return "plain";
  const hist = {}; for (const [r, c] of cells) hist[loc[r][c]] = (hist[loc[r][c]] || 0) + 1;
  const cols = Object.keys(hist).map(Number);
  if (cols.length === 1) return "plain";
  if (cols.length !== 2) return "unknown";
  const sorted = cols.sort((a, b) => hist[b] - hist[a]);
  for (const [body, accent] of [[sorted[0], sorted[1]], [sorted[1], sorted[0]]]) {
    for (const skin of SKINS) {
      const gen = SK.skinnedCells(cells, skin, body, accent);   // expected pattern over this exact footprint
      let ok = true;
      for (const [r, c, col] of gen) if ((col || 0) !== (loc[r][c] || 0)) { ok = false; break; }
      if (ok) return skin;
    }
  }
  return "unknown";
}

module.exports = { SKINS, renderObjLoc, classifySkin, footprint, shapeCells, bbox };
