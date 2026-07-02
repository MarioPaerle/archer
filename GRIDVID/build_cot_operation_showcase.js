#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const E = require("./engine.js");
const GIF = require("./gif.js");

const OUT = path.join(__dirname, "out");
const HTML_OUT = path.join(OUT, "cot_operation_showcase.html");
const JSON_OUT = path.join(OUT, "cot_operation_showcase.json");
const BG = 0, GREY = 5, WHITE = 10;
const PALETTE = E.ARC_PALETTE.concat(["#ffffff"]);

const blank = (h, w) => Array.from({ length: h }, () => Array(w).fill(0));
const clone = g => g.map(r => r.slice());
function rect(h, w) { const cells = []; for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) cells.push([r, c]); return cells; }
function norm(cells) { const mr = Math.min(...cells.map(p => p[0])), mc = Math.min(...cells.map(p => p[1])); return cells.map(([r, c]) => [r - mr, c - mc]); }
function bbox(cells) { let h = 0, w = 0; for (const [r, c] of cells) { h = Math.max(h, r + 1); w = Math.max(w, c + 1); } return [h, w]; }
function stamp(g, cells, r0, c0, col) {
  for (const [r, c] of cells) {
    const rr = r0 + r, cc = c0 + c;
    if (rr >= 0 && cc >= 0 && rr < g.length && cc < g[0].length) g[rr][cc] = col;
  }
}
function paste(dst, src, r0, c0) {
  for (let r = 0; r < src.length; r++) for (let c = 0; c < src[0].length; c++) {
    const rr = r0 + r, cc = c0 + c;
    if (rr >= 0 && cc >= 0 && rr < dst.length && cc < dst[0].length) dst[rr][cc] = src[r][c];
  }
}
function outlineBox(g, r0, c0, h, w, col = WHITE) {
  for (let c = c0; c < c0 + w; c++) { if (g[r0]) g[r0][c] = col; if (g[r0 + h - 1]) g[r0 + h - 1][c] = col; }
  for (let r = r0; r < r0 + h; r++) { if (g[r]) { g[r][c0] = col; g[r][c0 + w - 1] = col; } }
}
function flipH(cells) { const [, w] = bbox(cells); return norm(cells.map(([r, c]) => [r, w - 1 - c])); }
function rot90(cells) { return norm(cells.map(([r, c]) => [c, -r])); }
function crop(g, pad = 0) {
  let r0 = Infinity, c0 = Infinity, r1 = -Infinity, c1 = -Infinity;
  for (let r = 0; r < g.length; r++) for (let c = 0; c < g[0].length; c++) if (g[r][c]) { r0 = Math.min(r0, r); c0 = Math.min(c0, c); r1 = Math.max(r1, r); c1 = Math.max(c1, c); }
  if (r1 < r0) return [[0]];
  r0 = Math.max(0, r0 - pad); c0 = Math.max(0, c0 - pad); r1 = Math.min(g.length - 1, r1 + pad); c1 = Math.min(g[0].length - 1, c1 + pad);
  const out = []; for (let r = r0; r <= r1; r++) out.push(g[r].slice(c0, c1 + 1)); return out;
}
function padFrames(frames) {
  const h = Math.max(...frames.map(g => g.length)), w = Math.max(...frames.map(g => g[0].length));
  return frames.map(g => { const out = blank(h, w); paste(out, g, Math.floor((h - g.length) / 2), Math.floor((w - g[0].length) / 2)); return out; });
}
function traceGif(frames, file, cell = 8) {
  fs.writeFileSync(path.join(OUT, file), Buffer.from(GIF.encodeGif({ frames: padFrames(frames), palette: PALETTE, cell, delayMs: 380 })));
  return file;
}
function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function opBase() {
  const g = blank(16, 24);
  stamp(g, E.buildShape("Lshape", [4]), 3, 3, 2);
  stamp(g, E.buildShape("Tshape", [5]), 4, 12, 6);
  stamp(g, E.buildShape("plus", [5]), 10, 5, 8);
  return g;
}
function highlight(g, cells, r, c) { const f = clone(g); stamp(f, cells, r, c, WHITE); return f; }
function erased(g, cells, r, c) { const f = clone(g); stamp(f, cells, r, c, BG); return f; }
function titleFrame(textCol = 4) {
  const g = blank(4, 16);
  for (let c = 1; c < 15; c += 2) g[1][c] = textCol;
  return g;
}

function makeCards() {
  const cards = [];
  const add = (id, family, verbs, title, rule, frames, status = "template-trace") => {
    const gif = traceGif(frames, `cot_op_${id}.gif`);
    cards.push({ id, family, verbs, title, rule, status, gif, frames: frames.length, audit: [
      { check: "white-selection-present", ok: frames.some(g => g.flat().includes(WHITE)) },
      { check: "multi-step-trace", ok: frames.length >= 3 },
      { check: "template-not-engine-derived-yet", ok: status === "template-trace" },
    ] });
  };

  {
    const cells = E.buildShape("Lshape", [4]), base = opBase();
    add("remove_extract", "selection / deletion", ["where", "remove", "extract"], "Select, Remove, Extract", "White marks the selected object; remove erases it, extract fades all non-selected objects.", [base, highlight(base, cells, 3, 3), erased(base, cells, 3, 3), highlight(blank(16, 24), cells, 3, 3)]);
  }
  {
    const cells = E.buildShape("Tshape", [5]), base = opBase(), sel = highlight(base, cells, 4, 12), gone = erased(base, cells, 4, 12), moved = clone(gone);
    stamp(moved, cells, 8, 15, 6);
    const path = clone(sel); for (let r = 5; r <= 8; r++) path[r][15] = WHITE;
    add("move_copy", "object motion", ["move", "copy"], "Move / Copy Path", "White first selects the object, then shows the intended displacement before the final placement.", [base, sel, path, moved]);
  }
  {
    const cells = E.buildShape("Lshape", [4]), base = blank(12, 18); stamp(base, cells, 4, 3, 7);
    const scratch = highlight(base, cells, 4, 3), out = clone(base); stamp(out, flipH(cells), 4, 10, 7);
    add("mirror_rotate", "geometry transform", ["mirror", "grid_rotate", "grid_flip"], "Mirror / Rotate Transform", "White selects the source mask; the trace then stamps its transformed relative mask.", [base, scratch, out, highlight(out, flipH(cells), 4, 10)]);
  }
  {
    const cells = E.buildShape("plus", [5]), base = blank(13, 18); stamp(base, cells, 4, 5, 8);
    const sel = highlight(base, cells, 4, 5), out = clone(base); stamp(out, cells, 4, 5, 3);
    add("recolor_dispatch", "attribute dispatch", ["recolor", "dispatch", "classify"], "Recolor By Branch", "White marks the routed object before the branch recolors it.", [base, sel, out]);
  }
  {
    const base = opBase(), cellsA = E.buildShape("Lshape", [4]), cellsB = E.buildShape("Tshape", [5]);
    const f1 = highlight(base, cellsA, 3, 3), f2 = highlight(f1, cellsB, 4, 12), out = blank(16, 24);
    stamp(out, cellsA, 5, 4, 2); stamp(out, cellsB, 5, 10, 6); stamp(out, E.buildShape("plus", [5]), 5, 17, 8);
    add("arrange", "ordering / layout", ["arrange", "sort_rows"], "Arrange Into Slots", "White scans objects in sorted order, then places them into explicit output slots.", [base, f1, f2, out]);
  }
  {
    const A = E.buildShape("plus", [5]), B = E.buildShape("diamond", [2]), base = blank(13, 22); stamp(base, A, 4, 3, 2); stamp(base, B, 4, 12, 6);
    const f1 = highlight(base, A, 4, 3), f2 = highlight(f1, B, 4, 12), out = blank(13, 22);
    const xor = norm(A.filter(([r, c]) => !new Set(B.map(p => p.join(","))).has(r + "," + c)).concat(B.filter(([r, c]) => !new Set(A.map(p => p.join(","))).has(r + "," + c))));
    stamp(out, xor, 4, 8, 4);
    add("combine_xor", "boolean figure algebra", ["combine", "overlay_figs"], "Boolean Combine", "White selects both source figures, aligns them in a scratch region, then emits the XOR/overlay result.", [base, f1, f2, out]);
  }
  {
    const base = opBase(), f1 = highlight(base, E.buildShape("Lshape", [4]), 3, 3), f2 = highlight(f1, E.buildShape("Tshape", [5]), 4, 12), out = blank(16, 24);
    stamp(out, rect(1, 2), 12, 18, 5);
    add("tally_keep_bigger", "counting", ["tally", "keep_bigger"], "Count Then Answer", "White scans the counted set before drawing a compact tally or winner token.", [base, f1, f2, out]);
  }
  {
    const base = blank(14, 20); const frame = E.buildShape("frame", [8, 10]); stamp(base, frame, 3, 4, 5);
    const hole = rect(2, 2), f1 = clone(base); outlineBox(f1, 6, 8, 2, 2, WHITE);
    const out = clone(base); stamp(out, hole, 6, 8, 5);
    add("fill_crop", "structure / output sizing", ["lattice", "fill", "crop"], "Fill Holes / Crop", "White marks holes or retained bounds before materializing fill or resizing the output.", [base, f1, out, crop(out, 1)]);
  }
  {
    const base = blank(14, 24), A = E.buildShape("Lshape", [4]), B = flipH(A), C = E.buildShape("Tshape", [5]);
    stamp(base, A, 2, 2, 2); stamp(base, B, 2, 9, 2); stamp(base, C, 8, 2, 6);
    const f1 = highlight(base, A, 2, 2), f2 = highlight(f1, B, 2, 9), f3 = highlight(f2, C, 8, 2), out = clone(base); stamp(out, flipH(C), 8, 12, 6);
    add("bind_apply", "analogy", ["bind_transform", "apply"], "Bind Transform, Apply", "White selects A and B to encode the delta, then selects C and replays that delta.", [base, f1, f2, f3, out]);
  }
  {
    const base = blank(13, 24); for (let i = 0; i < 3; i++) stamp(base, rect(i + 1, i + 1), 8 - i, 2 + i * 5, 3);
    const f1 = clone(base); outlineBox(f1, 7, 1, 4, 16, WHITE);
    const out = clone(base); stamp(out, rect(4, 4), 5, 18, 3);
    add("progress", "series", ["progress"], "Series Progression", "White frames the observed series, then appends the next term.", [base, f1, out]);
  }
  {
    const base = blank(13, 22); base[11][1] = 4; [4, 4, 2, 4, 3, 4].forEach((x, i) => base[12][1 + i] = x);
    const f1 = clone(base); f1[12][1] = WHITE; f1[11][1] = WHITE;
    const f2 = clone(base); f2[12][2] = WHITE; f2[11][2] = WHITE; f2[11][1] = 4;
    const out = clone(base); stamp(out, [[0,0],[0,1],[0,2],[1,2]], 10, 1, 4);
    add("turtle_drive", "program execution", ["turtle", "drive"], "Program Counter Trace", "White highlights the active instruction and turtle head while path cells accumulate.", [base, f1, f2, out]);
  }
  {
    const base = blank(15, 22); stamp(base, rect(1, 11), 12, 5, GREY); stamp(base, rect(2, 3), 10, 9, 2); stamp(base, rect(2, 5), 6, 8, 6);
    const f1 = highlight(base, rect(2, 3), 10, 9), f2 = erased(base, rect(2, 3), 10, 9), out = clone(f2); stamp(out, rect(2, 5), 10, 8, 6);
    add("support_physics", "physics / causality", ["gravity", "run", "spill"], "Evidence Then Physics", "White marks the causal support/source/contact before the dynamic consequence is animated.", [base, f1, f2, out]);
  }
  {
    const base = blank(14, 20); stamp(base, E.buildShape("square", [4]), 3, 3, 2); stamp(base, E.buildShape("Lshape", [4]), 4, 12, 6);
    const f1 = clone(base); outlineBox(f1, 2, 2, 6, 6, WHITE);
    const out = clone(base); stamp(out, E.buildShape("square", [4]), 3, 3, 3);
    add("whole_grid_complete", "whole-grid / completion", ["grid_complete", "unfold", "solve"], "Whole-Grid Source Region", "White frames the source region before cells are copied, unfolded, or completed into targets.", [base, f1, out]);
  }
  return cards;
}

function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const cards = makeCards();
  const byFamily = {};
  for (const c of cards) byFamily[c.family] = (byFamily[c.family] || 0) + 1;
  fs.writeFileSync(JSON_OUT, JSON.stringify({
    generated_at: new Date(0).toISOString(),
    generator: "GRIDVID white 2D-CoT operation template gallery",
    caveat: "These are reusable template traces for DSL families; the next compiler step is engine-derived traces from per-command snapshots.",
    families: byFamily,
    cards,
  }, null, 2) + "\n");
  const html = `<!doctype html><meta charset=utf-8><title>GRIDVID White 2D-CoT Operation Templates</title><style>
body{margin:0;background:#101014;color:#ececf1;font:14px Inter,system-ui,sans-serif;padding:24px}h1{margin:0;color:#67e8f9}.lead{max-width:1120px;color:#c8c8d0;line-height:1.45}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(330px,1fr));gap:16px}.card{background:#18181d;border:1px solid #30303a;border-radius:8px;padding:12px}.top{display:flex;justify-content:space-between;gap:12px;align-items:baseline}h2{font-size:14px;color:#93c5fd;margin:0}.tag{font:10px ui-monospace,Menlo,monospace;color:#a1a1aa}p{color:#d4d4dc;line-height:1.4}img{width:100%;image-rendering:pixelated;background:#000;border:1px solid #34343c}.checks{font:10px ui-monospace,Menlo,monospace;color:#86efac}
</style><h1>GRIDVID White 2D-CoT Operation Templates</h1><p class=lead>Reusable visual reasoning templates for DSL operation families. White is a trace-only working-memory colour: select evidence, optionally erase or move it, apply an operation, then place or emit the result. This is not yet the final engine-derived trace compiler; it is the coverage scaffold every DSL family should map into.</p><div class=grid>${cards.map(c => `<section class=card><div class=top><h2>${esc(c.title)}</h2><span class=tag>${esc(c.family)}</span></div><p>${esc(c.rule)}</p><img src="${esc(c.gif)}" alt="${esc(c.title)}"><p class=tag>${esc(c.verbs.join(" · "))}</p><div class=checks>${c.audit.map(a => esc(a.check)).join(" · ")}</div></section>`).join("\n")}</div>`;
  fs.writeFileSync(HTML_OUT, html);
  console.log("wrote " + path.relative(process.cwd(), HTML_OUT));
  console.log("wrote " + path.relative(process.cwd(), JSON_OUT));
  console.log("cards " + cards.length + " · families " + Object.keys(byFamily).length);
}

if (require.main === module) main();

module.exports = { main, HTML_OUT, JSON_OUT };
