/* skins.js — shared SKIN / sub-object system (Mario: "almost everything should be skinnable", counters included).
 * Objects get internal structure (plain weighted + core/border/cross/stripe/hole) over a broad shape vocab.
 * Placement stays skin-safe: a skin only repaints cells WITHIN the shape's footprint (or punches a hole inside it),
 * so the gap/placement checks (which use the base cells = the full footprint) remain correct with or without a skin. */
const bbox = cells => { let h = 0, w = 0; for (const [r, c] of cells) { if (r + 1 > h) h = r + 1; if (c + 1 > w) w = c + 1; } return [h, w]; };

const SHAPES_ALL = ["square", "disc", "plus", "Lshape", "triangle", "diamond", "Tshape", "rect", "notch", "bump"];
const SKINS = ["plain", "plain", "plain", "core", "border", "cross", "stripe"];   // plain weighted (MUST stay; easiest, teaches most)
const SKINS_KEEPCOLOR = ["plain", "plain", "plain", "core"];                       // keep the BODY colour clearly dominant (safe when colour IS the rule, e.g. count-by-colour): plain + a small central core only

// paint baseCells with internal structure → [[dr,dc,col],...]. accent = the sub-object colour; col 0 = a hole (left bg).
function skinnedCells(baseCells, skin, color, accent) {
  const [h, w] = bbox(baseCells), set = new Set(baseCells.map(([r, c]) => r + "," + c));
  const interior = (r, c) => [[1, 0], [-1, 0], [0, 1], [0, -1]].every(([dr, dc]) => set.has((r + dr) + "," + (c + dc)));
  const cr = Math.round((h - 1) / 2), cc = Math.round((w - 1) / 2);
  return baseCells.map(([r, c]) => {
    let col = color;
    if (skin === "core") { if (r === cr && c === cc) col = accent; }
    else if (skin === "border") { if (interior(r, c)) col = accent; }
    else if (skin === "cross") { if (r === cr || c === cc) col = accent; }
    else if (skin === "stripe") { if (r % 2 === 0) col = accent; }
    else if (skin === "hole") { if (r === cr && c === cc) col = 0; }
    return [r, c, col];
  });
}
// stamp a (possibly skinned) object onto an existing grid g at (r,c). col 0 cells are left as background.
function stampSkinned(g, baseCells, r, c, color, skin, accent) {
  const cells = skin && skin !== "plain" ? skinnedCells(baseCells, skin, color, accent) : baseCells.map(([dr, dc]) => [dr, dc, color]);
  for (const [dr, dc, col] of cells) { const rr = r + dr, cc = c + dc; if (col && rr >= 0 && cc >= 0 && rr < g.length && cc < g[0].length) g[rr][cc] = col; }
}
// pick a random skin + an accent colour distinct from the body (keepColor = restrict to body-colour-preserving skins).
function pickSkin(rng, color, keepColor) {
  const pool = keepColor ? SKINS_KEEPCOLOR : SKINS, skin = pool[rng.int(0, pool.length - 1)];
  const accent = [1, 2, 3, 4, 6, 7, 8, 9].filter(x => x !== color)[rng.int(0, 6)];
  return { skin, accent };
}

module.exports = { bbox, SHAPES_ALL, SKINS, SKINS_KEEPCOLOR, skinnedCells, stampSkinned, pickSkin };
