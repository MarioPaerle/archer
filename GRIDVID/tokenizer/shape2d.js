#!/usr/bin/env node
/* =============================================================================
 * shape2d.js - exact 2D-aware shape tokenizer for ARC/gridvid grids.
 *
 * This is not row flattening. It encodes connected non-background components as
 * semantic 2D tokens when possible:
 *   SQUARE, RECT, LINE, FRAME, PLUS, LSHAPE
 * Unknown components fall back to exact CELLS bitmasks inside their bbox.
 * Order is explicit and deterministic: components are emitted top-to-bottom,
 * left-to-right by their bounding boxes. The encoder is non-neural O(H*W).
 * ========================================================================== */

"use strict";

function assertGrid(grid) {
  if (!Array.isArray(grid) || !grid.length || !Array.isArray(grid[0])) throw new Error("grid must be a non-empty 2D array");
  const h = grid.length, w = grid[0].length;
  for (let r = 0; r < h; r++) {
    if (!Array.isArray(grid[r]) || grid[r].length !== w) throw new Error("ragged grid");
    for (const x of grid[r]) if (!Number.isInteger(x) || x < 0 || x > 9) throw new Error("colors must be ints 0..9");
  }
  return { h, w };
}

function components(grid, bg) {
  const { h, w } = assertGrid(grid), seen = Array.from({ length: h }, () => new Array(w).fill(false)), out = [];
  for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) {
    const color = grid[r][c];
    if (color === bg || seen[r][c]) continue;
    const stack = [[r, c]], cells = [];
    seen[r][c] = true;
    while (stack.length) {
      const [rr, cc] = stack.pop(); cells.push([rr, cc]);
      for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nr = rr + dr, nc = cc + dc;
        if (nr < 0 || nr >= h || nc < 0 || nc >= w || seen[nr][nc] || grid[nr][nc] !== color) continue;
        seen[nr][nc] = true; stack.push([nr, nc]);
      }
    }
    out.push({ color, cells });
  }
  out.sort((a, b) => Math.min(...a.cells.map(x => x[0])) - Math.min(...b.cells.map(x => x[0])) || Math.min(...a.cells.map(x => x[1])) - Math.min(...b.cells.map(x => x[1])));
  return out;
}

function bbox(cells) {
  let r0 = Infinity, c0 = Infinity, r1 = -Infinity, c1 = -Infinity;
  for (const [r, c] of cells) { if (r < r0) r0 = r; if (c < c0) c0 = c; if (r > r1) r1 = r; if (c > c1) c1 = c; }
  return { r: r0, c: c0, h: r1 - r0 + 1, w: c1 - c0 + 1 };
}

function mask(cells, box) {
  const set = new Set(cells.map(([r, c]) => (r - box.r) + "," + (c - box.c)));
  let bits = "";
  for (let r = 0; r < box.h; r++) for (let c = 0; c < box.w; c++) bits += set.has(r + "," + c) ? "1" : "0";
  return bits;
}

function isFull(bits) { return !bits.includes("0"); }
function isFrame(bits, h, w) {
  if (h < 3 || w < 3) return false;
  for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) {
    const want = r === 0 || c === 0 || r === h - 1 || c === w - 1;
    if ((bits[r * w + c] === "1") !== want) return false;
  }
  return true;
}
function isPlus(bits, h, w) {
  if (h !== w || h < 3 || (h & 1) === 0) return false;
  const m = (h - 1) >> 1;
  for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) {
    const want = r === m || c === m;
    if ((bits[r * w + c] === "1") !== want) return false;
  }
  return true;
}
function isLShape(bits, h, w) {
  if (h < 2 || w < 2) return false;
  for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) {
    const want = c === 0 || r === h - 1;
    if ((bits[r * w + c] === "1") !== want) return false;
  }
  return true;
}

function componentToken(comp) {
  const box = bbox(comp.cells), bits = mask(comp.cells, box), prefix = (kind) => `${kind}:${comp.color}@${box.r},${box.c}`;
  if (isFull(bits)) {
    if (box.h === 1 || box.w === 1) return `${prefix("LINE")}:${box.h === 1 ? "h" : "v"}:${Math.max(box.h, box.w)}`;
    if (box.h === box.w) return `${prefix("SQUARE")}:${box.h}`;
    return `${prefix("RECT")}:${box.h}x${box.w}`;
  }
  if (isFrame(bits, box.h, box.w)) return `${prefix("FRAME")}:${box.h}x${box.w}`;
  if (isPlus(bits, box.h, box.w)) return `${prefix("PLUS")}:${box.h}`;
  if (isLShape(bits, box.h, box.w)) return `${prefix("LSHAPE")}:${box.h}x${box.w}`;
  return `${prefix("CELLS")}:${box.h}x${box.w}:${bits}`;
}

function encodeGrid(grid, opts = {}) {
  const { h, w } = assertGrid(grid), bg = opts.bg == null ? 0 : opts.bg;
  return ["BOS", "SHAPEGRID", String(h), String(w), `BG:${bg}`, "ORDER:TLBR"].concat(components(grid, bg).map(componentToken), ["EOS"]);
}

function fillRect(g, r0, c0, h, w, color, pred) {
  for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) if (!pred || pred(r, c)) g[r0 + r][c0 + c] = color;
}

function decodeGrid(tokens) {
  if (!Array.isArray(tokens) || tokens[0] !== "BOS" || tokens[1] !== "SHAPEGRID") throw new Error("expected BOS SHAPEGRID");
  const h = +tokens[2], w = +tokens[3], bgm = /^BG:(\d)$/.exec(tokens[4] || "");
  if (!Number.isInteger(h) || !Number.isInteger(w) || h < 1 || w < 1 || !bgm) throw new Error("bad shape grid header");
  const bg = +bgm[1], g = Array.from({ length: h }, () => new Array(w).fill(bg));
  let i0 = 5;
  if (/^ORDER:/.test(tokens[i0] || "")) i0++;
  for (let i = i0; i < tokens.length - 1; i++) {
    const tok = tokens[i], m = /^([A-Z]+):(\d)@(\d+),(\d+):(.+)$/.exec(tok);
    if (!m) throw new Error("bad shape token: " + tok);
    const kind = m[1], color = +m[2], r0 = +m[3], c0 = +m[4], rest = m[5];
    if (kind === "SQUARE") { const s = +rest; fillRect(g, r0, c0, s, s, color); }
    else if (kind === "RECT") { const [hh, ww] = rest.split("x").map(Number); fillRect(g, r0, c0, hh, ww, color); }
    else if (kind === "LINE") { const [axis, len] = rest.split(":"); fillRect(g, r0, c0, axis === "h" ? 1 : +len, axis === "h" ? +len : 1, color); }
    else if (kind === "FRAME") { const [hh, ww] = rest.split("x").map(Number); fillRect(g, r0, c0, hh, ww, color, (r, c) => r === 0 || c === 0 || r === hh - 1 || c === ww - 1); }
    else if (kind === "PLUS") { const s = +rest, mid = (s - 1) >> 1; fillRect(g, r0, c0, s, s, color, (r, c) => r === mid || c === mid); }
    else if (kind === "LSHAPE") { const [hh, ww] = rest.split("x").map(Number); fillRect(g, r0, c0, hh, ww, color, (r, c) => c === 0 || r === hh - 1); }
    else if (kind === "CELLS") {
      const mm = /^(\d+)x(\d+):([01]+)$/.exec(rest);
      if (!mm) throw new Error("bad CELLS token: " + tok);
      const hh = +mm[1], ww = +mm[2], bits = mm[3];
      for (let r = 0; r < hh; r++) for (let c = 0; c < ww; c++) if (bits[r * ww + c] === "1") g[r0 + r][c0 + c] = color;
    } else throw new Error("unknown shape token kind: " + kind);
  }
  if (tokens[tokens.length - 1] !== "EOS") throw new Error("missing EOS");
  return g;
}

function selfTest() {
  const g = [
    [0,0,0,0,0,0,0,0,0,0],
    [0,2,2,2,0,5,5,5,5,0],
    [0,2,2,2,0,5,0,0,5,0],
    [0,2,2,2,0,5,5,5,5,0],
    [0,0,0,0,0,0,3,0,0,0],
    [0,4,0,0,0,3,3,3,0,0],
    [0,4,0,0,0,0,3,0,0,0],
    [0,4,4,4,0,0,0,0,0,0],
  ];
  const toks = encodeGrid(g);
  if (!toks.some(t => t.startsWith("SQUARE")) || !toks.some(t => t.startsWith("FRAME")) || !toks.some(t => t.startsWith("PLUS")) || !toks.some(t => t.startsWith("LSHAPE"))) throw new Error("missing semantic shape tokens");
  if (JSON.stringify(decodeGrid(toks)) !== JSON.stringify(g)) throw new Error("shape2d roundtrip failed");
  console.log("shape2d self-test: ALL PASS");
}

if (require.main === module) selfTest();

module.exports = { encodeGrid, decodeGrid, components, componentToken, selfTest };
