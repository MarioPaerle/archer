#!/usr/bin/env node
/* =============================================================================
 * patch2d.js - exact 2D patch tokenizer for ARC/gridvid grids.
 *
 * V0 goal: be boring, decodable, and hard to shape-break.
 * - fixed 2x2 raster patches
 * - serpentine patch-row order for local continuity
 * - explicit boundary mask for odd H/W
 * - optional video SAME deltas after frame 0
 * ========================================================================== */

"use strict";

const DEFAULT_PATCH = 2;

function assertGrid(grid) {
  if (!Array.isArray(grid) || !grid.length || !Array.isArray(grid[0])) throw new Error("grid must be a non-empty 2D array");
  const h = grid.length, w = grid[0].length;
  if (h < 1 || w < 1) throw new Error("grid dimensions must be positive");
  for (let r = 0; r < h; r++) {
    if (!Array.isArray(grid[r]) || grid[r].length !== w) throw new Error("ragged grid");
    for (const x of grid[r]) if (!Number.isInteger(x) || x < 0 || x > 9) throw new Error("grid colors must be ints 0..9");
  }
  return { h, w };
}

function patchSlots(h, w, patch = DEFAULT_PATCH) {
  if (patch !== 2) throw new Error("patch2d v0 supports patch=2 only");
  const slots = [];
  const prN = Math.ceil(h / patch), pcN = Math.ceil(w / patch);
  for (let pr = 0; pr < prN; pr++) {
    const ltr = (pr & 1) === 0;
    for (let k = 0; k < pcN; k++) {
      const pc = ltr ? k : pcN - 1 - k;
      slots.push([pr * patch, pc * patch]);
    }
  }
  return slots;
}

function patchToken(grid, r0, c0, patch = DEFAULT_PATCH, pad = 0) {
  const { h, w } = assertGrid(grid);
  let mask = 0, digits = "";
  for (let dr = 0; dr < patch; dr++) for (let dc = 0; dc < patch; dc++) {
    const bit = dr * patch + dc, r = r0 + dr, c = c0 + dc;
    if (r < h && c < w) { mask |= (1 << bit); digits += String(grid[r][c]); }
    else digits += String(pad);
  }
  return `P${patch}:${mask.toString(16).toUpperCase()}:${digits}`;
}

function parsePatchToken(tok, patch = DEFAULT_PATCH) {
  const m = /^P(\d+):([0-9A-Fa-f]+):([0-9]+)$/.exec(tok);
  if (!m) throw new Error("bad patch token: " + tok);
  const p = +m[1], mask = parseInt(m[2], 16), digits = m[3];
  if (p !== patch) throw new Error(`expected P${patch}, got P${p}`);
  if (digits.length !== patch * patch) throw new Error("bad patch payload length: " + tok);
  return { mask, digits: digits.split("").map(Number) };
}

function encodeGrid(grid, opts = {}) {
  const patch = opts.patch || DEFAULT_PATCH, pad = opts.pad == null ? 0 : opts.pad;
  const { h, w } = assertGrid(grid);
  const toks = ["BOS", "GRID", String(h), String(w), `P${patch}`];
  for (const [r, c] of patchSlots(h, w, patch)) toks.push(patchToken(grid, r, c, patch, pad));
  toks.push("EOS");
  return toks;
}

function decodeGrid(tokens) {
  if (!Array.isArray(tokens)) throw new Error("tokens must be an array");
  if (tokens[0] !== "BOS" || tokens[1] !== "GRID") throw new Error("expected BOS GRID");
  const h = +tokens[2], w = +tokens[3], pm = /^P(\d+)$/.exec(tokens[4] || "");
  if (!Number.isInteger(h) || !Number.isInteger(w) || h < 1 || w < 1 || !pm) throw new Error("bad GRID header");
  const patch = +pm[1], slots = patchSlots(h, w, patch);
  const expected = 5 + slots.length;
  if (tokens[expected] !== "EOS" || tokens.length !== expected + 1) throw new Error("wrong number of grid patch tokens");
  const grid = Array.from({ length: h }, () => new Array(w).fill(0));
  for (let i = 0; i < slots.length; i++) {
    const [r0, c0] = slots[i], { mask, digits } = parsePatchToken(tokens[5 + i], patch);
    for (let dr = 0; dr < patch; dr++) for (let dc = 0; dc < patch; dc++) {
      const bit = dr * patch + dc, r = r0 + dr, c = c0 + dc;
      if (r < h && c < w) {
        if (!(mask & (1 << bit))) throw new Error("patch mask omits in-bounds cell");
        grid[r][c] = digits[bit];
      } else if (mask & (1 << bit)) throw new Error("patch mask includes out-of-bounds cell");
    }
  }
  return grid;
}

function samePatchToken(prevTok, tok) {
  return prevTok === tok;
}

function encodeVideo(frames, opts = {}) {
  if (!Array.isArray(frames) || !frames.length) throw new Error("frames must be a non-empty array");
  const patch = opts.patch || DEFAULT_PATCH, pad = opts.pad == null ? 0 : opts.pad;
  const { h, w } = assertGrid(frames[0]);
  const slots = patchSlots(h, w, patch);
  const toks = ["BOS", "VIDEO", String(h), String(w), String(frames.length), `P${patch}`];
  let prevPatchTokens = null;
  for (let t = 0; t < frames.length; t++) {
    const dim = assertGrid(frames[t]);
    if (dim.h !== h || dim.w !== w) throw new Error("all video frames must share dimensions");
    toks.push("FRAME");
    const patchTokens = slots.map(([r, c]) => patchToken(frames[t], r, c, patch, pad));
    for (let i = 0; i < patchTokens.length; i++) toks.push(prevPatchTokens && samePatchToken(prevPatchTokens[i], patchTokens[i]) ? "SAME" : patchTokens[i]);
    prevPatchTokens = patchTokens;
  }
  toks.push("EOS");
  return toks;
}

function decodeVideo(tokens) {
  if (!Array.isArray(tokens)) throw new Error("tokens must be an array");
  if (tokens[0] !== "BOS" || tokens[1] !== "VIDEO") throw new Error("expected BOS VIDEO");
  const h = +tokens[2], w = +tokens[3], n = +tokens[4], pm = /^P(\d+)$/.exec(tokens[5] || "");
  if (!Number.isInteger(h) || !Number.isInteger(w) || !Number.isInteger(n) || h < 1 || w < 1 || n < 1 || !pm) throw new Error("bad VIDEO header");
  const patch = +pm[1], slots = patchSlots(h, w, patch), frames = [];
  let i = 6, prevPatchTokens = null;
  for (let t = 0; t < n; t++) {
    if (tokens[i++] !== "FRAME") throw new Error("expected FRAME");
    const patchTokens = [];
    for (let s = 0; s < slots.length; s++) {
      const tok = tokens[i++];
      if (tok === "SAME") {
        if (!prevPatchTokens) throw new Error("SAME cannot appear in first frame");
        patchTokens.push(prevPatchTokens[s]);
      } else patchTokens.push(tok);
    }
    frames.push(decodeGrid(["BOS", "GRID", String(h), String(w), `P${patch}`].concat(patchTokens, ["EOS"])));
    prevPatchTokens = patchTokens;
  }
  if (tokens[i] !== "EOS" || i !== tokens.length - 1) throw new Error("trailing video tokens");
  return frames;
}

function tokensToIds(tokens, vocab) {
  return tokens.map(tok => {
    if (!Object.prototype.hasOwnProperty.call(vocab, tok)) throw new Error("token missing from vocab: " + tok);
    return vocab[tok];
  });
}

function idsToTokens(ids, invVocab) {
  return ids.map(id => {
    const tok = invVocab[id];
    if (tok == null) throw new Error("id missing from vocab: " + id);
    return tok;
  });
}

function _deepEqual(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

function selfTest() {
  const grid = [
    [0, 1, 1, 0, 2],
    [0, 1, 3, 3, 2],
    [4, 4, 4, 0, 0],
  ];
  const toks = encodeGrid(grid);
  if (!_deepEqual(decodeGrid(toks), grid)) throw new Error("grid roundtrip failed");
  const frames = [grid, grid.map(row => row.slice()), grid.map((row, r) => row.map((x, c) => (r === 1 && c === 2 ? 9 : x)))];
  const vtoks = encodeVideo(frames);
  if (!vtoks.includes("SAME")) throw new Error("video should use SAME deltas");
  if (!_deepEqual(decodeVideo(vtoks), frames)) throw new Error("video roundtrip failed");
  console.log("patch2d self-test: ALL PASS");
}

if (require.main === module) selfTest();

module.exports = {
  DEFAULT_PATCH,
  patchSlots,
  encodeGrid,
  decodeGrid,
  encodeVideo,
  decodeVideo,
  tokensToIds,
  idsToTokens,
  selfTest,
};
