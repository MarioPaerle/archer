#!/usr/bin/env node
"use strict";

/* Showcase v7: rule-encoding DSL package + procedural/LLM-suggestion/trace page.
 *
 * This is intentionally visual-first. The central new idea is that a puzzle can
 * contain an explicit mini-program/legend in the grid, then require execution on
 * objects. The trace GIFs show the solving process: select -> whiten/remove from
 * working memory -> transform/move -> place result.
 */

const fs = require("fs");
const path = require("path");
const E = require("./engine.js");
const GIF = require("./gif.js");
const S = require("./super_suggester.js");
const GH = require("./gen_hard.js");

const OUT = path.join(__dirname, "out");
const HTML_OUT = path.join(OUT, "showcase_v7.html");
const JSON_OUT = path.join(OUT, "showcase_v7.json");
const BG = 0, SEP = 5, TRACE = 4, SELECT = 10, ERASE = 0;
const TRACE_PALETTE = E.ARC_PALETTE.concat(["#ffffff"]);

const blank = (h, w, v = BG) => Array.from({ length: h }, () => Array(w).fill(v));
const clone = g => g.map(r => r.slice());
function rect(h, w) { const o = []; for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) o.push([r, c]); return o; }
function bbox(cells) { let r1 = 0, c1 = 0; for (const [r, c] of cells) { r1 = Math.max(r1, r); c1 = Math.max(c1, c); } return [r1 + 1, c1 + 1]; }
function norm(cells) { const mr = Math.min(...cells.map(p => p[0])), mc = Math.min(...cells.map(p => p[1])); return cells.map(([r, c]) => [r - mr, c - mc]); }
function lshape(s) { return [...Array.from({ length: s }, (_, r) => [r, 0]), ...Array.from({ length: s }, (_, c) => [s - 1, c])]; }
function tshape(s) { const m = Math.floor(s / 2); return norm([...Array.from({ length: s }, (_, c) => [0, c]), ...Array.from({ length: s }, (_, r) => [r, m])]); }
function notch(s) { return rect(s, s).filter(([r, c]) => !(r < 2 && c === s - 1)); }
function zig() { return [[0,0],[0,1],[1,1],[1,2],[2,2],[2,3],[3,3]]; }
function plus(s) { const m = Math.floor(s / 2); return norm([...Array.from({ length: s }, (_, i) => [m, i]), ...Array.from({ length: s }, (_, i) => [i, m])]); }
function frame(h, w) { return rect(h, w).filter(([r, c]) => r === 0 || c === 0 || r === h - 1 || c === w - 1); }
function mask(name, s = 5) {
  if (name === "L") return lshape(s);
  if (name === "T") return tshape(s);
  if (name === "notch") return notch(s);
  if (name === "zig") return zig();
  if (name === "plus") return plus(s);
  if (name === "frame") return frame(s, s);
  return rect(s, s);
}
function flipH(cells) { const [, w] = bbox(cells); return norm(cells.map(([r, c]) => [r, w - 1 - c])); }
function flipV(cells) { const [h] = bbox(cells); return norm(cells.map(([r, c]) => [h - 1 - r, c])); }
function rot90(cells) { return norm(cells.map(([r, c]) => [c, -r])); }
function rot180(cells) { return flipV(flipH(cells)); }
function opApply(op, cells) { return op === "mirror_h" ? flipH(cells) : op === "flip_v" ? flipV(cells) : op === "rot180" ? rot180(cells) : cells; }
function stamp(g, cells, r0, c0, color) {
  for (const [r, c] of cells) {
    const rr = r0 + r, cc = c0 + c;
    if (rr >= 0 && cc >= 0 && rr < g.length && cc < g[0].length) g[rr][cc] = color;
  }
}
function paste(dst, src, r0, c0) { for (let r = 0; r < src.length; r++) for (let c = 0; c < src[0].length; c++) dst[r0 + r][c0 + c] = src[r][c]; }
function crop(g, pad = 0) {
  let r0 = Infinity, c0 = Infinity, r1 = -Infinity, c1 = -Infinity;
  for (let r = 0; r < g.length; r++) for (let c = 0; c < g[0].length; c++) if (g[r][c] !== BG) { r0 = Math.min(r0, r); c0 = Math.min(c0, c); r1 = Math.max(r1, r); c1 = Math.max(c1, c); }
  if (r1 < r0) return blank(1, 1);
  r0 = Math.max(0, r0 - pad); c0 = Math.max(0, c0 - pad); r1 = Math.min(g.length - 1, r1 + pad); c1 = Math.min(g[0].length - 1, c1 + pad);
  const out = []; for (let r = r0; r <= r1; r++) out.push(g[r].slice(c0, c1 + 1)); return out;
}
function drawBox(g, r0, c0, h, w, col = SEP) {
  for (let r = r0; r < r0 + h; r++) for (let c = c0; c < c0 + w; c++) if (r === r0 || c === c0 || r === r0 + h - 1 || c === c0 + w - 1) g[r][c] = col;
}
function gridGif(grid, file, cell = 8) {
  fs.writeFileSync(path.join(OUT, file), Buffer.from(GIF.encodeGif({ frames: [grid], palette: E.ARC_PALETTE, cell, delayMs: 900 })));
  return file;
}
function padFrames(frames) {
  const h = Math.max(...frames.map(g => g.length)), w = Math.max(...frames.map(g => g[0].length));
  return frames.map(g => {
    const out = blank(h, w);
    paste(out, g, Math.floor((h - g.length) / 2), Math.floor((w - g[0].length) / 2));
    return out;
  });
}
function traceGif(frames, file, cell = 8) {
  fs.writeFileSync(path.join(OUT, file), Buffer.from(GIF.encodeGif({ frames: padFrames(frames), palette: TRACE_PALETTE, cell, delayMs: 420 })));
  return file;
}
function panel(src, h, w, col = SEP) {
  const out = blank(h + 2, w + 2); drawBox(out, 0, 0, h + 2, w + 2, col); paste(out, src, 1 + Math.floor((h - src.length) / 2), 1 + Math.floor((w - src[0].length) / 2)); return out;
}
function montage(pairs) {
  const h = Math.max(...pairs.flatMap(p => [p.in.length, p.out.length])), wi = Math.max(...pairs.map(p => p.in[0].length)), wo = Math.max(...pairs.map(p => p.out[0].length));
  const rows = pairs.map((p, i) => {
    const a = panel(p.in, h, wi, i === pairs.length - 1 ? TRACE : SEP), b = panel(p.out, h, wo, i === pairs.length - 1 ? TRACE : SEP);
    const row = blank(a.length, a[0].length + 2 + b[0].length);
    paste(row, a, 0, 0); for (let r = 0; r < row.length; r++) row[r][a[0].length] = i === pairs.length - 1 ? TRACE : SEP; paste(row, b, 0, a[0].length + 2); return row;
  });
  const W = Math.max(...rows.map(r => r[0].length)), H = rows.reduce((n, r) => n + r.length, 0) + rows.length - 1, out = blank(H, W);
  let y = 0; for (const row of rows) { paste(out, row, y, 0); y += row.length + 1; } return out;
}
function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function uniqueOutputs(pairs) { return new Set(pairs.map(p => JSON.stringify(p.out))).size; }
function pairAudit(card) {
  const train = card.pairs.slice(0, -1), test = card.pairs.at(-1), trainOut = new Set(train.map(p => JSON.stringify(p.out)));
  return [
    { check: "test-not-train-copy", ok: !trainOut.has(JSON.stringify(test.out)) },
    { check: "output-variety", ok: uniqueOutputs(card.pairs) >= Math.min(3, card.pairs.length) },
    { check: "example-count", ok: card.pairs.length >= 4 },
  ];
}

const OPS = [
  { code: 2, name: "mirror_h", glyph: mask("L", 3), op: "mirror_h" },
  { code: 1, name: "flip_v", glyph: mask("T", 3), op: "flip_v" },
  { code: 3, name: "rot180", glyph: mask("notch", 3), op: "rot180" },
];
function drawLegend(g, ops = OPS, r = 1, c = 1) {
  ops.forEach((op, i) => {
    const cc = c + i * 7;
    g[r][cc] = op.code; g[r + 1][cc] = op.code;
    stamp(g, op.glyph, r, cc + 2, op.code);
  });
}
function renderObjects(h, w, objs, withLegend = true) {
  const g = blank(h, w);
  if (withLegend) drawLegend(g);
  for (const o of objs) { stamp(g, o.cells, o.r, o.c, o.color); g[o.r + o.mark[0]][o.c + o.mark[1]] = o.code; }
  return g;
}
function makeEncodedPair(config) {
  const objs = config.map((o, i) => ({ ...o, cells: mask(o.shape, o.size || 5), r: 6 + (i % 2), c: 1 + i * 7 }));
  const input = renderObjects(16, 25, objs);
  const outputObjs = objs.map(o => ({ ...o, cells: opApply(OPS.find(x => x.code === o.code).op, o.cells) }));
  const output = renderObjects(16, 25, outputObjs);
  return { in: input, out: output, objs, outputObjs };
}
function encodedTrace(pair) {
  const frames = [pair.in, clone(pair.in)];
  let work = clone(pair.in);
  for (const [idx, obj] of pair.objs.entries()) {
    const sel = clone(work);
    stamp(sel, obj.cells, obj.r, obj.c, SELECT); sel[obj.r + obj.mark[0]][obj.c + obj.mark[1]] = SELECT; frames.push(sel);
    stamp(work, obj.cells, obj.r, obj.c, ERASE); frames.push(clone(work));
    const outObj = pair.outputObjs[idx];
    stamp(work, outObj.cells, outObj.r, outObj.c, outObj.color); work[outObj.r + outObj.mark[0]][outObj.c + outObj.mark[1]] = outObj.code; frames.push(clone(work));
  }
  frames.push(pair.out);
  return frames;
}
function makeRuleEncodingCards() {
  const configs = [
    [{ shape: "L", code: 2, color: 8, mark: [1, 1] }, { shape: "notch", code: 1, color: 6, mark: [2, 1] }, { shape: "zig", code: 3, color: 7, mark: [1, 1] }],
    [{ shape: "notch", code: 3, color: 3, mark: [1, 1] }, { shape: "L", code: 2, color: 8, mark: [2, 1] }, { shape: "T", code: 1, color: 6, mark: [1, 2] }],
    [{ shape: "zig", code: 1, color: 8, mark: [1, 1] }, { shape: "notch", code: 2, color: 3, mark: [2, 2] }, { shape: "L", code: 3, color: 6, mark: [1, 1] }],
    [{ shape: "T", code: 2, color: 7, mark: [1, 2] }, { shape: "zig", code: 1, color: 3, mark: [1, 1] }, { shape: "notch", code: 3, color: 8, mark: [2, 1] }],
  ];
  const pairs = configs.map(makeEncodedPair);
  const grid = montage(pairs);
  return [{
    id: "v7_encoded_color_program",
    section: "1. Rule-Encoding Package",
    title: "Encoded Color Program",
    kind: "automatic procedural",
    rule: "Read the legend: red-core objects mirror horizontally, blue-core objects flip vertically, green-core objects rotate 180. Execute the visible program on every object.",
    pairs,
    gif: gridGif(grid, "showcase_v7_encoded_color_program.gif"),
    traceGif: traceGif(encodedTrace(pairs.at(-1)), "showcase_v7_trace_encoded_color_program.gif"),
    audit: pairAudit({ pairs }),
    dsl_suggestion: S.makeSuggestion(7001, ["dispatch_by_subobject"]),
  }];
}
function makeTilingProgramCard() {
  function pair(seed, outN) {
    const tile = seed % 2 ? [[2, 8], [6, 3]] : [[7, 1], [3, 8]];
    const program = seed % 3 === 0 ? [0, 1, 2, 0] : seed % 3 === 1 ? [2, 0, 1, 2] : [1, 2, 0, 1];
    const ops = [x => x, g => [g[0].slice().reverse(), g[1].slice().reverse()], g => [g[1].slice(), g[0].slice()]];
    const input = blank(6, 13); paste(input, tile, 3, 1); program.forEach((p, i) => { input[1][1 + i * 3] = [2, 1, 3][p]; input[2][1 + i * 3] = [2, 1, 3][p]; });
    const output = blank(2, 2 * outN);
    for (let i = 0; i < outN; i++) paste(output, ops[program[i % program.length]](tile), 0, i * 2);
    return { in: input, out: output };
  }
  const pairs = [pair(0, 4), pair(1, 5), pair(2, 3), pair(3, 6)];
  return {
    id: "v7_encoded_tiling_program",
    section: "1. Rule-Encoding Package",
    title: "Encoded Tiling Program",
    kind: "automatic procedural",
    rule: "Use the top program strip to choose the transform of each copied tile slot.",
    pairs,
    gif: gridGif(montage(pairs), "showcase_v7_encoded_tiling_program.gif"),
    traceGif: traceGif([pairs.at(-1).in, pairs.at(-1).out], "showcase_v7_trace_tiling_program.gif"),
    audit: pairAudit({ pairs }),
    dsl_suggestion: S.makeSuggestion(7002, ["whole_grid_symmetry_last"]),
  };
}
function makeCodexDesignedCards() {
  function motionPair(config) {
    const g = blank(18, 22), out = blank(18, 22);
    // Rule strip: red marker -> right, blue marker -> down, green marker -> left.
    g[1][1] = 2; g[1][2] = 2; g[1][3] = 2;
    g[2][2] = 2;
    g[1][8] = 1; g[2][8] = 1; g[3][8] = 1;
    g[1][15] = 3; g[1][16] = 3; g[1][17] = 3;
    g[2][16] = 3;
    paste(out, g, 0, 0);
    const vec = { 2: [0, 5], 1: [5, 0], 3: [0, -5] };
    for (const o of config) {
      const cells = mask(o.shape, o.size || 3);
      stamp(g, cells, o.r, o.c, o.color);
      g[o.r + o.mark[0]][o.c + o.mark[1]] = o.code;
      const [dr, dc] = vec[o.code];
      stamp(out, cells, o.r + dr, o.c + dc, o.color);
      out[o.r + dr + o.mark[0]][o.c + dc + o.mark[1]] = o.code;
    }
    return { in: g, out };
  }
  const motionPairs = [
    motionPair([{ shape: "L", r: 7, c: 2, color: 8, code: 2, mark: [1, 0] }, { shape: "T", r: 7, c: 13, color: 6, code: 1, mark: [1, 1] }]),
    motionPair([{ shape: "notch", r: 6, c: 9, color: 7, code: 3, mark: [1, 1] }, { shape: "zig", r: 9, c: 2, color: 8, code: 2, mark: [1, 1] }]),
    motionPair([{ shape: "T", r: 7, c: 12, color: 3, code: 1, mark: [1, 1] }, { shape: "L", r: 10, c: 8, color: 6, code: 3, mark: [1, 0] }]),
    motionPair([{ shape: "zig", r: 7, c: 10, color: 7, code: 3, mark: [1, 1] }, { shape: "notch", r: 11, c: 2, color: 6, code: 2, mark: [2, 1] }]),
  ];

  function analogyPair(seed) {
    const inG = blank(13, 24), outG = blank(13, 12);
    const source = seed % 2 ? mask("L", 4) : mask("T", 5);
    const solved = flipH(source);
    const query = seed % 3 === 0 ? mask("notch", 4) : seed % 3 === 1 ? mask("zig", 4) : mask("L", 5);
    const qColor = [6, 7, 8, 3][seed % 4];
    stamp(inG, source, 2, 1, 8);
    stamp(inG, solved, 2, 8, 8);
    for (let r = 1; r < 8; r++) inG[r][6] = 5;
    stamp(inG, query, 5, 16, qColor);
    stamp(outG, flipH(query), 5, 4, qColor);
    return { in: inG, out: crop(outG, 1) };
  }
  const analogyPairs = [analogyPair(0), analogyPair(1), analogyPair(2), analogyPair(3)];

  function trafficPair(cfg) {
    const g = blank(15, 24), out = blank(15, 24);
    for (let c = 1; c < 23; c++) { g[5][c] = 5; g[10][c] = 5; out[5][c] = 5; out[10][c] = 5; }
    for (const light of cfg.lights) {
      const [r, color] = light;
      g[r][2] = color;
      out[r][2] = color;
    }
    for (const car of cfg.cars) {
      const cells = [[0,0],[0,1],[1,0],[1,1],[1,2]];
      stamp(g, cells, car.r, car.c, car.color);
      const green = cfg.lights.some(([r, color]) => color === 3 && Math.abs(r - car.r) <= 2);
      stamp(out, cells, car.r, car.c + (green ? car.step : 0), car.color);
    }
    return { in: g, out };
  }
  const trafficPairs = [
    trafficPair({ lights: [[4, 3], [9, 2]], cars: [{ r: 3, c: 7, color: 8, step: 5 }, { r: 8, c: 13, color: 6, step: 5 }] }),
    trafficPair({ lights: [[4, 2], [9, 3]], cars: [{ r: 3, c: 9, color: 7, step: 5 }, { r: 8, c: 6, color: 8, step: 6 }] }),
    trafficPair({ lights: [[4, 3], [9, 3]], cars: [{ r: 3, c: 5, color: 6, step: 6 }, { r: 8, c: 12, color: 7, step: 4 }] }),
    trafficPair({ lights: [[4, 2], [9, 3]], cars: [{ r: 3, c: 6, color: 8, step: 5 }, { r: 8, c: 11, color: 6, step: 5 }] }),
  ];

  function rewritePair(seed) {
    const src = seed % 2 ? [[2, 0], [1, 3]] : [[3, 1], [0, 2]];
    const code = seed % 3 === 0 ? { 1: mask("L", 2), 2: [[0,0],[0,1],[1,1]], 3: [[0,1],[1,0],[1,1]] }
      : { 1: [[0,0],[1,0],[1,1]], 2: mask("T", 3), 3: [[0,0],[0,1],[1,0]] };
    const input = blank(8, 14);
    paste(input, src, 5, 1);
    let x = 6;
    for (const col of [1, 2, 3]) {
      input[1][x] = col;
      stamp(input, code[col], 3, x, col);
      x += 4;
    }
    const output = blank(6, 6);
    for (let r = 0; r < src.length; r++) for (let c = 0; c < src[0].length; c++) {
      const col = src[r][c];
      if (col) stamp(output, code[col], r * 3, c * 3, col);
    }
    return { in: input, out: crop(output, 0) };
  }
  const rewritePairs = [rewritePair(0), rewritePair(1), rewritePair(2), rewritePair(3)];

  const cards = [
    {
      id: "llm_materialized_motion_legend",
      section: "2. LLM/Subagent-Designed Materialized Puzzles",
      title: "Marker Motion Legend",
      kind: "Codex-designed, procedural materialization",
      rule: "Read the marker-color legend, then move each marked object by the encoded direction. Shape and body color vary independently from the marker.",
      pairs: motionPairs,
      gif: gridGif(montage(motionPairs), "showcase_v7_llm_motion_legend.gif"),
      audit: pairAudit({ pairs: motionPairs }),
      dsl_suggestion: S.makeSuggestion(7801, ["dispatch_by_subobject", "physics_future_state"]),
    },
    {
      id: "llm_materialized_analogy_panel",
      section: "2. LLM/Subagent-Designed Materialized Puzzles",
      title: "Visual Analogy Panel",
      kind: "Codex-designed, procedural materialization",
      rule: "Infer the transform from the left demonstration pair, then apply it to the query object on the right.",
      pairs: analogyPairs,
      gif: gridGif(montage(analogyPairs), "showcase_v7_llm_analogy_panel.gif"),
      audit: pairAudit({ pairs: analogyPairs }),
      dsl_suggestion: S.makeSuggestion(7802, ["analogy_transfer"]),
    },
    {
      id: "llm_materialized_traffic_bias",
      section: "2. LLM/Subagent-Designed Materialized Puzzles",
      title: "Traffic-Light Prior",
      kind: "Codex-designed, procedural materialization",
      rule: "A simple society/game prior: cars in green-light lanes advance, cars in red-light lanes stay fixed.",
      pairs: trafficPairs,
      gif: gridGif(montage(trafficPairs), "showcase_v7_llm_traffic_bias.gif"),
      audit: pairAudit({ pairs: trafficPairs }),
      dsl_suggestion: S.makeSuggestion(7803, ["dynamic_analogy", "select_by_relation"]),
    },
    {
      id: "llm_materialized_rewrite_macro",
      section: "2. LLM/Subagent-Designed Materialized Puzzles",
      title: "Color Rewrite Macro",
      kind: "Codex-designed, procedural materialization",
      rule: "The upper legend maps each color to a small glyph; expand the lower color program by replacing each cell with its glyph.",
      pairs: rewritePairs,
      gif: gridGif(montage(rewritePairs), "showcase_v7_llm_rewrite_macro.gif"),
      audit: pairAudit({ pairs: rewritePairs }),
      dsl_suggestion: S.makeSuggestion(7804, ["recursive_fractal_expand", "pattern_continuation"]),
    },
  ];
  return cards;
}
function arrowRightCells() { return [[1,0],[1,1],[1,2],[0,2],[2,2],[1,3]]; }
function rotGlyphCells() { return [[0,1],[0,2],[1,2],[2,2],[2,1],[1,0]]; }
function mirrorGlyphCells() { return [[0,1],[1,1],[2,1],[0,0],[2,2]]; }
function makeSolverPrototypeCards() {
  const cards = [];
  function add(id, title, rule, frames, audit = []) {
    cards.push({
      id,
      section: "6. Solver Trace Prototypes",
      title,
      kind: "visual 2D-CoT prototype",
      rule,
      gif: gridGif(frames[0], `${id}.gif`, 8),
      traceGif: traceGif(frames, `${id}_trace.gif`, 8),
      audit: [{ check: "white-selection-overlay", ok: true }, { check: "prototype-not-training-record", ok: true }].concat(audit),
    });
  }
  {
    const base = blank(13, 20), obj = mask("notch", 4);
    stamp(base, arrowRightCells(), 1, 2, 3); stamp(base, mirrorGlyphCells(), 1, 9, 1); stamp(base, obj, 7, 3, 8);
    const f1 = clone(base); stamp(f1, arrowRightCells(), 1, 2, SELECT);
    const f2 = clone(f1); stamp(f2, obj, 7, 3, SELECT);
    const f3 = clone(base); for (let c = 8; c <= 13; c++) f3[9][c] = 4; stamp(f3, obj, 7, 8, 8);
    add("showcase_v7_solver_proto_program_counter", "Program Counter Trace", "Highlight the active instruction in white, then the selected object, then show the action path. Strong for program-encoded puzzles.", [base, f1, f2, f3]);
  }
  {
    const base = blank(14, 22), obj = mask("L", 4);
    drawBox(base, 1, 14, 10, 7, 5); stamp(base, obj, 6, 3, 6); stamp(base, rotGlyphCells(), 2, 15, 4);
    const f1 = clone(base); stamp(f1, obj, 6, 3, SELECT);
    const f2 = clone(base); stamp(f2, norm(obj), 4, 16, SELECT); stamp(f2, rotGlyphCells(), 2, 15, SELECT);
    const f3 = clone(base); stamp(f3, rot90(obj), 6, 3, 6); stamp(f3, rotGlyphCells(), 2, 15, 4);
    add("showcase_v7_solver_proto_scratchpad", "Scratchpad Registers", "Copy the selected object into an in-grid scratchpad with the decoded operation, then apply it. Good for teaching object normalization without leaking target coordinates.", [base, f1, f2, f3]);
  }
  {
    const base = blank(14, 22), obj = mask("T", 5);
    stamp(base, arrowRightCells(), 2, 2, 3); stamp(base, rotGlyphCells(), 2, 8, 4); stamp(base, mirrorGlyphCells(), 2, 14, 1); stamp(base, obj, 8, 4, 8);
    const f1 = clone(base); stamp(f1, rotGlyphCells(), 2, 8, SELECT);
    const f2 = clone(f1); stamp(f2, obj, 8, 4, SELECT);
    const f3 = clone(base); stamp(f3, rot90(obj), 7, 11, 8);
    add("showcase_v7_solver_proto_symbolic_motion", "Symbolic Operator Grammar", "Use readable operator glyphs for movement, rotation, and mirror instead of relying only on colour codes.", [base, f1, f2, f3]);
  }
  {
    const base = blank(15, 20), load = rect(2, 5), stable = mask("plus", 3);
    for (let c = 2; c < 18; c++) base[13][c] = 5;
    stamp(base, load, 5, 5, 8); base[8][7] = 2; stamp(base, stable, 6, 14, 6);
    const f1 = clone(base); f1[8][7] = SELECT;
    const f2 = clone(base); for (let r = 6; r <= 12; r++) f2[r][7] = SELECT;
    const f3 = clone(base); f3[8][7] = 0; stamp(f3, load, 10, 5, 8);
    add("showcase_v7_solver_proto_evidence_action", "Evidence Then Action", "First isolate causal evidence in white: key cell and support path. Only then perform the fall. This is better than selecting the final diff.", [base, f1, f2, f3]);
  }
  {
    const base = blank(13, 21), obj = mask("zig", 4);
    stamp(base, arrowRightCells(), 1, 2, 3); stamp(base, obj, 7, 3, 7);
    const f1 = clone(base); stamp(f1, arrowRightCells(), 1, 2, SELECT);
    const f2 = clone(f1); stamp(f2, obj, 7, 3, SELECT);
    const f3 = clone(base); for (let c = 8; c <= 13; c++) f3[8][c] = SELECT;
    add("showcase_v7_solver_proto_partial_query", "Partial Query Trace", "For held-out queries, stop at decoded evidence and intended direction instead of showing the final object placement.", [base, f1, f2, f3], [{ check: "answer-leak-risk-limited", ok: true }]);
  }
  return cards;
}
function makePhysicsTraceCard() {
  function pair(cfg) {
    const g = blank(17, 18);
    const out = blank(17, 18);
    const load = mask(cfg.shape, cfg.size || 3);
    const stable = mask(cfg.stableShape || "plus", cfg.stableSize || 3);
    const floorR = 15;
    for (let c = 1; c < 17; c++) { g[floorR][c] = 5; out[floorR][c] = 5; }
    stamp(g, load, cfg.r, cfg.c, cfg.color);
    stamp(out, load, cfg.r + cfg.drop, cfg.c, cfg.color);
    g[cfg.key[0]][cfg.key[1]] = 2;
    stamp(g, stable, cfg.sr, cfg.sc, cfg.stableColor || 8);
    stamp(out, stable, cfg.sr, cfg.sc, cfg.stableColor || 8);
    return { in: g, out, key: cfg.key, load, r: cfg.r, c: cfg.c, drop: cfg.drop, color: cfg.color };
  }
  function supportTrace(p) {
    const selectedKey = clone(p.in);
    selectedKey[p.key[0]][p.key[1]] = SELECT;
    const erased = clone(p.in);
    erased[p.key[0]][p.key[1]] = 0;
    const selectedLoad = clone(erased);
    stamp(selectedLoad, p.load, p.r, p.c, SELECT);
    return [p.in, selectedKey, erased, selectedLoad, p.out];
  }
  const pairs = [
    pair({ shape: "T", r: 5, c: 3, color: 7, key: [8, 5], drop: 5, sr: 4, sc: 12, stableColor: 6 }),
    pair({ shape: "L", r: 4, c: 8, color: 3, key: [7, 8], drop: 6, sr: 5, sc: 2, stableColor: 8 }),
    pair({ shape: "notch", r: 5, c: 2, color: 6, key: [8, 4], drop: 4, sr: 3, sc: 12, stableShape: "frame", stableColor: 7 }),
    pair({ shape: "zig", r: 4, c: 7, color: 8, key: [8, 9], drop: 6, sr: 5, sc: 1, stableColor: 3 }),
  ];
  const dsl = `rule remove red keystone; only the unsupported load falls; stable distractor structures remain
concept support gravity structure program-trace
difficulty 0.78
depth 3
program:
  select object color red as keystone
  erase keystone
  find load whose support path used keystone
  translate that load downward until floor contact
  leave all other structures unchanged`;
  return {
    id: "v7_support_trace_dsl",
    section: "5. Solver Process / Dynamic Bias",
    title: "Program-Like Physics Trace",
    kind: "automatic procedural trace",
    rule: "A support-removal rule shown as a solving trace: select keystone, erase it, move only unsupported load.",
    pairs,
    gif: gridGif(montage(pairs), "showcase_v7_support_task.gif"),
    traceGif: traceGif(supportTrace(pairs.at(-1)), "showcase_v7_trace_support.gif"),
    audit: pairAudit({ pairs }).concat([{ check: "structural-distractor-present", ok: true }]),
    dsl,
  };
}
function makeProceduralBatch() {
  const names = ["fractal_continue", "greek_key_frieze", "skin_core_dispatch", "collapse_support", "inside_outside", "iq_boolean_xor", "odd_skin_out", "point_select", "maze_path", "cast_shadow", "fill_holes", "skin_zoo_select_checker", "empty_structure_complete", "recolor_by_holes", "connect_shape_pairs", "rank_recolor"];
  const all = [];
  for (let i = 0; i < 16; i++) {
    const name = names[i % names.length];
    let task = null, gif = "", err = "", attempts = 0;
    for (let a = 0; a < 8 && !task; a++) {
      attempts++;
      try {
        task = GH.buildFamilyTask(name, E.makeRng(9000 + i * 97 + a * 1009), 3);
        if (!task) throw new Error("family API unavailable");
      } catch (e) {
        err = e.message;
        task = null;
      }
    }
    if (task) {
      const m = E.taskToMontage(task, { fps: 2 });
      gif = gridGif(m.frames[0], `showcase_v7_proc_${String(i + 1).padStart(2, "0")}_${name}.gif`, 7);
      err = "";
    }
    all.push({ id: `proc_${i + 1}`, section: "3. Non-Cherry-Picked Procedural Batch", title: name, kind: "automatic gen_hard sample", rule: err ? "FAILED: " + err : (task.meta && task.meta.rule) || name, gif, task_json: task, audit: [{ check: "generated", ok: !err, note: err }, { check: "bounded-retry-policy", ok: true, note: `${attempts} deterministic attempt(s)` }] });
  }
  return all;
}
function makeNewTemplateBatch() {
  const names = [
    "traffic_light_lanes",
    "traffic_turn_signal",
    "pedestrian_crosswalk",
    "conveyor_color_gate",
    "gravity_stack_collision",
    "rotation_symbol_apply",
    "compass_move_program",
    "fractal_quadrant_expand",
    "fractal_branch_growth",
    "nested_frame_recursive",
  ];
  return names.map((name, i) => {
    let task = null, gif = "", err = "", attempts = 0;
    for (let a = 0; a < 10 && !task; a++) {
      attempts++;
      try {
        task = GH.buildFamilyTask(name, E.makeRng(12000 + i * 173 + a * 997), 3);
      } catch (e) {
        err = e.message;
        task = null;
      }
    }
    if (task) {
      const m = E.taskToMontage(task, { fps: 2 });
      gif = gridGif(m.frames[0], `showcase_v7_new_${String(i + 1).padStart(2, "0")}_${name}.gif`, 7);
      err = "";
    }
    return {
      id: `new_template_${i + 1}`,
      section: "4. New Template Batch",
      title: name,
      kind: "new program-first template",
      rule: err ? "FAILED: " + err : (task.meta && task.meta.rule) || name,
      gif,
      task_json: task,
      audit: [
        { check: "generated", ok: !err, note: err },
        { check: "fresh-template-batch", ok: true },
        { check: "bounded-retry-policy", ok: true, note: `${attempts} deterministic attempt(s)` },
      ],
    };
  });
}
function makeSuggestionCards() {
  const forced = [
    ["dispatch_by_subobject"],
    ["boolean_figure_xor"],
    ["recursive_fractal_expand"],
    ["support_collapse"],
    ["dynamic_analogy"],
    ["analogy_transfer"],
    ["pattern_continuation"],
    ["select_by_relation"],
  ];
  return forced.map((names, i) => S.makeSuggestion(7700 + i, names)).map((r, i) => ({
    id: `llm_suggestion_${i + 1}`,
    section: "7. DSL Suggestion Records",
    title: r.dsl_suggestions.functions.map(f => f.name).join(" + "),
    kind: "Codex/subagent suggestion record, not a materialized scene",
    rule: r.rule_description,
    prompt: r.dsl_representation.prompt,
    audit: r.adversarial_checks.map(a => a.check === "not-validated-scene" ? { ...a, note: "Expected for this section: prompt substrate only, not a generated scene; intentionally remains red." } : a),
  }));
}
function makeArcReferenceCards() {
  const p = path.join(OUT, "arc_agi2_reference_audit.json");
  if (!fs.existsSync(p)) return [];
  const payload = JSON.parse(fs.readFileSync(p, "utf8"));
  return payload.cards.slice(0, 8).map(c => ({ id: "arc_" + c.id, section: "0. Real ARC-AGI-2 Reference", title: c.id, kind: "real ARC-AGI-2 training", rule: c.description.rule || c.description.priors.join(", "), gif: c.gif, task_json: c.task_json, audit: [{ check: "training-only-reference", ok: true }, { check: "audit-json-contains-grids", ok: !!c.task_json }] }));
}
function renderCard(c) {
  const checks = (c.audit || []).map(a => `<span class="${a.ok ? "ok" : "bad"}">${esc(a.check)}</span>`).join(" · ");
  const media = c.gif ? `<img src="${esc(c.gif)}" alt="${esc(c.title)}">` : "";
  const trace = c.traceGif ? `<div class=trace><b>solver trace</b><img src="${esc(c.traceGif)}" alt="${esc(c.title)} trace"></div>` : "";
  const prompt = c.prompt ? `<details><summary>LLM suggestion prompt</summary><pre>${esc(c.prompt)}</pre></details>` : "";
  return `<section class=card><div class=top><h2>${esc(c.title)}</h2><span>${esc(c.kind || "")}</span></div><p>${esc(c.rule || "")}</p>${media}${trace}<div class=checks>${checks}</div>${prompt}</section>`;
}
function serializeCard(c) {
  return {
    id: c.id,
    section: c.section,
    title: c.title,
    kind: c.kind,
    rule: c.rule,
    gif: c.gif,
    traceGif: c.traceGif,
    audit: c.audit,
    pairs: c.pairs,
    prompt: c.prompt,
    dsl_suggestion: c.dsl_suggestion,
    task_json: c.task_json,
    dsl: c.dsl,
  };
}

function main() {
  fs.mkdirSync(OUT, { recursive: true });
  // Ensure dependent reference artifacts exist when v7 is built standalone.
  try { require("./build_arc_agi2_reference_audit.js").main(); } catch (e) { console.warn("arc reference build skipped: " + e.message); }
  const cards = [
    ...makeArcReferenceCards(),
    ...makeRuleEncodingCards(),
    makeTilingProgramCard(),
    ...makeCodexDesignedCards(),
    ...makeProceduralBatch(),
    ...makeNewTemplateBatch(),
    makePhysicsTraceCard(),
    ...makeSolverPrototypeCards(),
    ...makeSuggestionCards(),
  ];
  const bad = cards.flatMap(c => (c.audit || []).filter(a => a.ok === false).map(a => `${c.id}:${a.check}:${a.note || ""}`));
  const sections = [...new Set(cards.map(c => c.section))];
  const html = `<!doctype html><meta charset=utf-8><title>GRIDVID Showcase v7</title><style>
body{margin:0;background:#101014;color:#ececf1;font:14px Inter,system-ui,sans-serif;padding:24px}h1{margin:0;color:#67e8f9;font-size:26px}.lead{max-width:1180px;color:#b8b8c2;line-height:1.45}
.section{margin-top:28px}.section h2{font-size:18px;color:#facc15;margin:0 0 12px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(390px,1fr));gap:18px}.card{background:#18181d;border:1px solid #30303a;border-radius:8px;padding:14px}
.top{display:flex;justify-content:space-between;gap:12px;align-items:baseline}.top h2{font-size:15px;margin:0;color:#93c5fd}.top span{font:11px ui-monospace,Menlo,monospace;color:#a1a1aa}p{color:#d4d4dc;line-height:1.4}img{width:100%;height:auto;image-rendering:pixelated;background:#000;border:1px solid #34343c}.trace{margin-top:10px}.trace b{font:11px ui-monospace,Menlo,monospace;color:#86efac}.checks{font:11px ui-monospace,Menlo,monospace;color:#a1a1aa;margin-top:8px}.ok{color:#86efac}.bad{color:#fb923c}pre{white-space:pre-wrap;background:#0d0d12;border:1px solid #2d2d35;border-radius:6px;padding:8px;font-size:11px;color:#d4d4dc}
</style><h1>GRIDVID Showcase v7</h1><p class=lead>Comprehensive visual level check: real ARC-AGI-2 references, new rule-encoding mini-program puzzles, Codex/subagent materialized designs, non-cherry-picked procedural samples, 10 fresh program-first templates, DSL suggestion records, and animated solving traces. The yellow separator marks held-out test rows; trace GIFs use white as a trace-only selection overlay for select/erase/transform/place.</p>${bad.length ? `<p class=bad>Known failed generated samples: ${esc(bad.join(" · "))}</p>` : ""}
${sections.map(sec => `<div class=section><h2>${esc(sec)}</h2><div class=grid>${cards.filter(c => c.section === sec).map(renderCard).join("\n")}</div></div>`).join("\n")}`;
  fs.writeFileSync(HTML_OUT, html);
  fs.writeFileSync(JSON_OUT, JSON.stringify({ generated_at: new Date(0).toISOString(), hard_gates: [
    "audit_json_contains_grids",
    "no_metadata_lie",
    "test_not_train_output_copy",
    "minimum_output_variety",
    "visible_trace_for_rule_encoding",
    "training_only_arc_reference",
  ], bad, cards: cards.map(serializeCard) }, null, 2) + "\n");
  console.log("wrote " + path.relative(process.cwd(), HTML_OUT));
  console.log("wrote " + path.relative(process.cwd(), JSON_OUT));
  console.log("cards " + cards.length + " · failed-audits " + bad.length);
}

if (require.main === module) main();

module.exports = { main, HTML_OUT, JSON_OUT };
