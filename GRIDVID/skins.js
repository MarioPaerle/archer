/* skins.js — shared SKIN / sub-object system (Mario: "almost everything should be skinnable", counters included).
 * Objects get internal structure (plain weighted + core/border/cross/stripe/hole) over a broad shape vocab.
 * Placement stays skin-safe: a skin only repaints cells WITHIN the shape's footprint (or punches a hole inside it),
 * so the gap/placement checks (which use the base cells = the full footprint) remain correct with or without a skin. */
const bbox = cells => { let h = 0, w = 0; for (const [r, c] of cells) { if (r + 1 > h) h = r + 1; if (c + 1 > w) w = c + 1; } return [h, w]; };

const SHAPES_ALL = [
  // NOTE: Zshape / arrow / fork are NOT 4-connected (diagonal-only joins) → they split into ≥3 blobs under
  // the solver's segmentation, corrupting any object-level rule. Excluded so every sampled shape is one blob.
  "square", "disc", "plus", "Lshape", "triangle", "diamond", "Tshape", "rect", "notch", "bump",
  "frame", "ring", "Ushape", "Cshape", "Hshape", "stair", "key", "bridge",
];
const SKINS = [
  "plain", "plain", "plain", "core", "border", "cross", "stripe", "checker", "diag", "spots", "corner", "split",
  "rim", "inner_frame", "target", "quadrants", "sash", "barcode", "teeth", "islands",
  "port_top", "port_bottom", "port_left", "port_right", "endpoints",
];   // plain weighted (MUST stay; easiest, teaches most)
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
    else if (skin === "rim") { if (!interior(r, c)) col = accent; }
    else if (skin === "cross") { if (r === cr || c === cc) col = accent; }
    else if (skin === "stripe") { if (r % 2 === 0) col = accent; }
    else if (skin === "checker") { if ((r + c) % 2 === 0) col = accent; }
    else if (skin === "diag") { if (r === c || r + c === w - 1) col = accent; }
    else if (skin === "spots") { if ((r === 1 || r === h - 2 || r === cr) && (c === 1 || c === w - 2 || c === cc) && (r + c) % 2 === 0) col = accent; }
    else if (skin === "corner") { if ((r < Math.max(1, Math.floor(h / 3)) && c < Math.max(1, Math.floor(w / 3))) || (r >= h - Math.max(1, Math.floor(h / 3)) && c >= w - Math.max(1, Math.floor(w / 3)))) col = accent; }
    else if (skin === "split") { if (c >= Math.ceil(w / 2)) col = accent; }
    else if (skin === "inner_frame") { if (interior(r, c) && (r === 1 || c === 1 || r === h - 2 || c === w - 2)) col = accent; }
    else if (skin === "target") { if (Math.max(Math.abs(r - cr), Math.abs(c - cc)) % 2 === 0) col = accent; }
    else if (skin === "quadrants") { if ((r < cr && c < cc) || (r > cr && c > cc)) col = accent; }
    else if (skin === "sash") { if (r === cr || c === cc || r === c || r + c === w - 1) col = accent; }
    else if (skin === "barcode") { if (c % 3 === 0 || c === w - 1) col = accent; }
    else if (skin === "teeth") { if ((r === 0 || r === h - 1 || c === 0 || c === w - 1) && ((r + c) % 2 === 0)) col = accent; }
    else if (skin === "islands") { if ((r === 1 && c === 1) || (r === 1 && c === w - 2) || (r === h - 2 && c === cc) || (r === cr && c === 1)) col = accent; }
    else if (skin === "port_top") { if (r === 0 && Math.abs(c - cc) <= 1) col = accent; }
    else if (skin === "port_bottom") { if (r === h - 1 && Math.abs(c - cc) <= 1) col = accent; }
    else if (skin === "port_left") { if (c === 0 && Math.abs(r - cr) <= 1) col = accent; }
    else if (skin === "port_right") { if (c === w - 1 && Math.abs(r - cr) <= 1) col = accent; }
    else if (skin === "endpoints") {
      const deg = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dr, dc]) => set.has((r + dr) + "," + (c + dc))).length;
      if (deg <= 1) col = accent;
    }
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
