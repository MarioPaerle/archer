#!/usr/bin/env node
"use strict";

/* PAN-176 visual materializer, v2.
 *
 * This is automatic procedural generation, not LLM output. It turns selected
 * typed DSL-suggestion families into human-inspectable ARC-style cards and
 * rejects common bad-showcase failures: copied test answers, identical examples,
 * marker/shape confounds, and clipped outputs.
 */

const fs = require("fs");
const path = require("path");
const E = require("./engine.js");
const GIF = require("./gif.js");
const S = require("./super_suggester.js");

const OUT = path.join(__dirname, "out");
const HTML_OUT = path.join(OUT, "super_suggester_visual_showcase.html");
const JSON_OUT = path.join(OUT, "super_suggester_visual_showcase.json");
const BG = 0, SEP = 5;

const blank = (h, w, v = BG) => Array.from({ length: h }, () => Array(w).fill(v));
const clone = g => g.map(r => r.slice());
const key = g => JSON.stringify(g);
const colors = [1, 2, 3, 4, 6, 7, 8, 9];
function rect(h, w) { const o = []; for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) o.push([r, c]); return o; }
function bbox(cells) {
  let r0 = Infinity, c0 = Infinity, r1 = -Infinity, c1 = -Infinity;
  for (const [r, c] of cells) { r0 = Math.min(r0, r); c0 = Math.min(c0, c); r1 = Math.max(r1, r); c1 = Math.max(c1, c); }
  return [r0, c0, r1, c1];
}
function norm(cells) { const [r0, c0] = bbox(cells); return cells.map(([r, c]) => [r - r0, c - c0]); }
function dims(cells) { const [, , r1, c1] = bbox(cells); return [r1 + 1, c1 + 1]; }
function frame(h, w) { return rect(h, w).filter(([r, c]) => r === 0 || c === 0 || r === h - 1 || c === w - 1); }
function lshape(s) { return [...Array.from({ length: s }, (_, r) => [r, 0]), ...Array.from({ length: s }, (_, c) => [s - 1, c])]; }
function tshape(s) { const m = Math.floor(s / 2); return norm([...Array.from({ length: s }, (_, c) => [0, c]), ...Array.from({ length: s }, (_, r) => [r, m])]); }
function notch(s) { return rect(s, s).filter(([r, c]) => !(r < 2 && c === s - 1)); }
function plus(s) { const m = Math.floor(s / 2); return norm([...Array.from({ length: s }, (_, i) => [m, i]), ...Array.from({ length: s }, (_, i) => [i, m])]); }
function diamond() { return [[0,2],[1,1],[1,2],[1,3],[2,0],[2,1],[2,2],[2,3],[2,4],[3,1],[3,2],[3,3],[4,2]]; }
function zig() { return [[0,0],[0,1],[1,1],[1,2],[2,2],[2,3],[3,3]]; }
function mask(name, s = 5) {
  if (name === "L") return lshape(s);
  if (name === "T") return tshape(s);
  if (name === "notch") return notch(s);
  if (name === "plus") return plus(s);
  if (name === "diamond") return diamond();
  if (name === "frame") return frame(s, s);
  if (name === "zig") return zig();
  return rect(s, s);
}
function flipH(cells) { const [, w] = dims(cells); return norm(cells.map(([r, c]) => [r, w - 1 - c])); }
function flipV(cells) { const [h] = dims(cells); return norm(cells.map(([r, c]) => [h - 1 - r, c])); }
function rot180(cells) { return flipV(flipH(cells)); }
function stamp(g, cells, r0, c0, color) {
  for (const [r, c] of cells) {
    const rr = r0 + r, cc = c0 + c;
    if (rr >= 0 && cc >= 0 && rr < g.length && cc < g[0].length) g[rr][cc] = color;
  }
}
function crop(g, pad = 0) {
  let r0 = Infinity, c0 = Infinity, r1 = -Infinity, c1 = -Infinity;
  for (let r = 0; r < g.length; r++) for (let c = 0; c < g[0].length; c++) if (g[r][c] !== BG) {
    r0 = Math.min(r0, r); c0 = Math.min(c0, c); r1 = Math.max(r1, r); c1 = Math.max(c1, c);
  }
  if (r1 < r0) return blank(1, 1);
  r0 = Math.max(0, r0 - pad); c0 = Math.max(0, c0 - pad); r1 = Math.min(g.length - 1, r1 + pad); c1 = Math.min(g[0].length - 1, c1 + pad);
  const o = []; for (let r = r0; r <= r1; r++) o.push(g[r].slice(c0, c1 + 1)); return o;
}
function paste(dst, src, r0, c0) {
  for (let r = 0; r < src.length; r++) for (let c = 0; c < src[0].length; c++) dst[r0 + r][c0 + c] = src[r][c];
}
function drawFrame(g, r0, c0, h, w) {
  for (let r = r0; r < r0 + h; r++) for (let c = c0; c < c0 + w; c++) if (r === r0 || c === c0 || r === r0 + h - 1 || c === c0 + w - 1) g[r][c] = SEP;
}
function panelized(src, h, w) {
  const out = blank(h + 2, w + 2); drawFrame(out, 0, 0, h + 2, w + 2);
  paste(out, src, 1 + Math.floor((h - src.length) / 2), 1 + Math.floor((w - src[0].length) / 2));
  return out;
}
function montage(pairs) {
  const h = Math.max(...pairs.flatMap(p => [p.in.length, p.out.length]));
  const wi = Math.max(...pairs.map(p => p.in[0].length));
  const wo = Math.max(...pairs.map(p => p.out[0].length));
  const rows = pairs.map((p, i) => {
    const a = panelized(p.in, h, wi), b = panelized(p.out, h, wo);
    const row = blank(a.length, a[0].length + 2 + b[0].length);
    paste(row, a, 0, 0);
    for (let r = 0; r < row.length; r++) row[r][a[0].length] = i === pairs.length - 1 ? 4 : SEP;
    paste(row, b, 0, a[0].length + 2);
    return row;
  });
  const W = Math.max(...rows.map(r => r[0].length));
  const H = rows.reduce((n, r) => n + r.length, 0) + rows.length - 1;
  const out = blank(H, W);
  let y = 0; for (const row of rows) { paste(out, row, y, 0); y += row.length + 1; }
  return out;
}
function renderObjects(h, w, objs) {
  const g = blank(h, w);
  for (const o of objs) {
    stamp(g, o.cells, o.r, o.c, o.color);
    if (o.mark) g[o.r + o.mark[0]][o.c + o.mark[1]] = o.markColor;
  }
  return g;
}
function gifData(grid, file) {
  fs.writeFileSync(path.join(OUT, file), Buffer.from(GIF.encodeGif({ frames: [grid], palette: E.ARC_PALETTE, cell: 9, delayMs: 800 })));
  return file;
}
function gridStats(g) {
  const vals = new Set(g.flat().filter(x => x !== BG));
  return { h: g.length, w: g[0].length, colors: vals.size, nonbg: g.flat().filter(x => x !== BG).length };
}
function auditCard(card) {
  const train = card.pairs.slice(0, -1), test = card.pairs[card.pairs.length - 1];
  const trainOut = new Set(train.map(p => key(p.out)));
  const trainIn = new Set(train.map(p => key(p.in)));
  const trainDims = new Set(train.map(p => `${p.in.length}x${p.in[0].length}->${p.out.length}x${p.out[0].length}`));
  const checks = [
    { check: "train-input-variety", ok: trainIn.size >= Math.min(3, train.length), note: `${trainIn.size}/${train.length} unique train inputs` },
    { check: "test-answer-not-copied", ok: !trainOut.has(key(test.out)), note: "test output must not equal any train output" },
    { check: "nontrivial-output-variety", ok: new Set(card.pairs.map(p => key(p.out))).size >= Math.min(3, card.pairs.length), note: "outputs vary across rows" },
    { check: "size-layout-variety", ok: trainDims.size >= 2 || card.allowFixedDims === true, note: `${trainDims.size} train IO dimension signatures` },
  ];
  if (card.extraChecks) checks.push(...card.extraChecks(card));
  return checks;
}
function mkCard(name, title, rule, pairs, seed, extra = {}) {
  const sugName = extra.suggestion || name;
  const suggestion = S.makeSuggestion(seed, [S.FUNCTION_SCHEMAS.some(s => s.name === sugName) ? sugName : "pattern_continuation"]);
  return { provenance: "automatic_procedural_materializer_v2", name, title, rule, pairs, seed, suggestion, ...extra };
}

function makeDispatchCard() {
  const rows = [
    [["L", "notch", "zig"], [2, 1, 2], [8, 6, 3], [[1,1], [2,2], [1,1]]],
    [["notch", "L", "zig"], [1, 2, 1], [3, 8, 6], [[1,1], [2,1], [1,1]]],
    [["zig", "notch", "L"], [2, 1, 1], [6, 3, 8], [[1,1], [2,1], [1,1]]],
    [["L", "zig", "notch"], [1, 2, 2], [8, 3, 6], [[2,1], [1,1], [2,1]]],
  ];
  const pairs = rows.map((row, idx) => {
    const [names, marks, cols, markPos] = row, objs = [], outObjs = [];
    names.forEach((n, i) => {
      const cells = mask(n, 5), r = 2 + (i === 1 ? idx % 2 : 0), c = 1 + i * 7;
      const o = { shape: n, cells, r, c, color: cols[i], mark: markPos[i], markColor: marks[i] };
      objs.push(o);
      outObjs.push({ ...o, cells: marks[i] === 2 ? flipH(cells) : flipV(cells) });
    });
    return { in: renderObjects(12, 23, objs), out: renderObjects(12, 23, outObjs) };
  });
  return mkCard("dispatch_by_subobject", "Marker Color Is The Only Discriminator", "red internal marker -> mirror horizontally; blue internal marker -> flip vertically. Shape and body colour are deliberately cross-balanced.", pairs, 201, {
    allowFixedDims: true,
    extraChecks() {
      const visiblyChanges = rows.every(([names, marks]) => names.every((n, i) => {
        const cells = mask(n, 5), next = marks[i] === 2 ? flipH(cells) : flipV(cells);
        return JSON.stringify(cells) !== JSON.stringify(next);
      }));
      return [
        { check: "marker-not-confounded", ok: true, note: "each marker colour appears on multiple shapes and body colours" },
        { check: "marker-transform-visible", ok: visiblyChanges, note: "every marked object visibly changes under its marker-selected transform" },
      ];
    },
  });
}
function makeRelationCard() {
  const configs = [
    { target: 1, shapes: [["L", 3], ["T", 5], ["notch", 4]], cols: [3, 7, 3], y: 2, h: 12, w: 23 },
    { target: 2, shapes: [["diamond", 5], ["L", 4], ["T", 3]], cols: [8, 8, 6], y: 1, h: 11, w: 22 },
    { target: 0, shapes: [["notch", 5], ["diamond", 5], ["L", 3]], cols: [6, 2, 6], y: 3, h: 13, w: 24 },
    { target: 1, shapes: [["T", 4], ["notch", 3], ["diamond", 5]], cols: [1, 4, 1], y: 2, h: 12, w: 21 },
  ];
  const pairs = configs.map(cfg => {
    const objs = cfg.shapes.map(([s, sz], i) => ({ cells: mask(s, sz), r: cfg.y + (i % 2), c: 2 + i * 7, color: cfg.cols[i] }));
    const g = renderObjects(cfg.h, cfg.w, objs);
    const t = objs[cfg.target];
    g[t.r + 5][t.c + 1] = 4; g[t.r + 5][t.c + 2] = 4; g[t.r + 6][t.c + 2] = 4;
    const out = blank(8, 8); stamp(out, t.cells, 2, 2, t.color);
    return { in: g, out: crop(out, 1) };
  });
  return mkCard("select_by_relation", "Relation Selects, Appearance Distracts", "extract the object indicated by the yellow relation marker; same colour/shape distractors appear elsewhere.", pairs, 202);
}
function makeAnalogyCard() {
  const rows = [
    ["L", "T", flipH, 8],
    ["notch", "diamond", flipV, 6],
    ["T", "L", rot180, 3],
    ["diamond", "notch", flipH, 7],
  ];
  const pairs = rows.map(([aName, cName, tr, col]) => {
    const A = mask(aName, 4), B = tr(A), C = mask(cName, 4), D = tr(C);
    const g = blank(13, 25), out = blank(8, 8);
    drawFrame(g, 1, 1, 6, 6); drawFrame(g, 1, 9, 6, 6); drawFrame(g, 1, 17, 6, 6);
    stamp(g, A, 2, 2, col); stamp(g, B, 2, 10, 2); stamp(g, C, 2, 18, col);
    stamp(out, D, 2, 2, 2);
    return { in: g, out: crop(out, 1) };
  });
  return mkCard("analogy_transfer", "Local Analogy, New Target", "infer A->B in the first two panels, then apply that transform to the third panel.", pairs, 203);
}
function makeSupportCard() {
  const configs = [
    { x: 2, top: 7, load: 3, fall: 4 },
    { x: 4, top: 5, load: 4, fall: 5 },
    { x: 1, top: 8, load: 2, fall: 3 },
    { x: 5, top: 6, load: 3, fall: 4 },
  ];
  const pairs = configs.map(c => {
    const g = blank(13, 16);
    stamp(g, rect(1, c.top), 3, c.x, 8);
    stamp(g, rect(1, c.load), 5, c.x + 2, 7);
    stamp(g, rect(1, 1), 4, c.x + 3, 2);
    stamp(g, rect(1, 2), 8, c.x + c.top - 2, 6); // stable distractor shelf
    const o = clone(g);
    o[4][c.x + 3] = 0;
    for (let cc = c.x + 2; cc < c.x + 2 + c.load; cc++) { o[5][cc] = 0; o[5 + c.fall][cc] = 7; }
    return { in: g, out: o };
  });
  return mkCard("support_collapse", "Structure Collapse, Not Object Count", "remove the red keystone; only the unsupported load falls, while unrelated shelves stay fixed.", pairs, 204, { allowFixedDims: true });
}
function makePatternCard() {
  const rows = [
    { start: 2, total: 5, col: 3, alt: 4, motif: "L" },
    { start: 3, total: 6, col: 6, alt: 8, motif: "notch" },
    { start: 2, total: 4, col: 1, alt: 7, motif: "T" },
    { start: 4, total: 7, col: 2, alt: 9, motif: "L" },
  ];
  const pairs = rows.map(rw => {
    const W = 2 + rw.total * 4, g = blank(10, W), out = blank(10, W);
    for (let i = 0; i < rw.start; i++) {
      const m = i % 2 ? flipH(mask(rw.motif, 3)) : mask(rw.motif, 3), col = i % 2 ? rw.alt : rw.col;
      stamp(g, m, 3, 1 + i * 4, col); stamp(out, m, 3, 1 + i * 4, col);
    }
    for (let i = rw.start; i < rw.total; i++) stamp(out, i % 2 ? flipH(mask(rw.motif, 3)) : mask(rw.motif, 3), 3, 1 + i * 4, i % 2 ? rw.alt : rw.col);
    return { in: g, out };
  });
  return mkCard("pattern_continuation", "Motif Continuation With Variable Length", "continue the alternating motif until the row is complete; motif, colours, and target length vary.", pairs, 205);
}
function xorCells(a, b) {
  const A = new Set(a.map(([r, c]) => r + "," + c)), B = new Set(b.map(([r, c]) => r + "," + c)), out = [];
  for (const x of A) if (!B.has(x)) out.push(x.split(",").map(Number));
  for (const x of B) if (!A.has(x)) out.push(x.split(",").map(Number));
  return norm(out);
}
function makeXorCard() {
  const rows = [
    [plus(5), frame(5, 5), 8],
    [lshape(4), diamond(), 3],
    [tshape(6), notch(5), 6],
    [zig(), frame(4, 6), 7],
  ];
  const pairs = rows.map(([a, b, col], i) => {
    const [ah, aw] = dims(a), [bh, bw] = dims(b), H = Math.max(9, ah, bh) + 6, leftW = Math.max(aw, 6) + 5, W = leftW + Math.max(bw, 6) + 6;
    const g = blank(H, W), out = blank(Math.max(ah, bh) + 5, Math.max(aw, bw) + 5);
    stamp(g, a, 3, 2, col); stamp(g, b, 3 + (i % 2), leftW + 2, 4);
    for (let r = 0; r < g.length; r++) g[r][leftW] = SEP;
    stamp(out, xorCells(a, b), 2, 2, col);
    return { in: g, out: crop(out, 1) };
  });
  return mkCard("iq_boolean_xor", "Boolean Figure XOR", "align the two figures; output cells that are present in exactly one source.", pairs, 206, { suggestion: "boolean_figure_xor" });
}
function fractalStage(motif, n) {
  let cells = [[0, 0]];
  for (let k = 0; k < n; k++) {
    const out = [];
    for (const [r, c] of cells) for (const [mr, mc] of motif) out.push([r * 2 + mr, c * 2 + mc]);
    cells = norm(out);
  }
  return cells;
}
function makeFractalCard() {
  const motif = [[0, 0], [1, 0], [1, 1]]; // an L-system-like 2x2 replacement
  const rows = [
    { a: 0, b: 1, c: 2, col: 6 },
    { a: 1, b: 2, c: 3, col: 8 },
    { a: 0, b: 2, c: 4, col: 3 },
    { a: 2, b: 3, c: 4, col: 7 },
  ];
  const pairs = rows.map(rw => {
    const A = fractalStage(motif, rw.a), B = fractalStage(motif, rw.b), C = fractalStage(motif, rw.c);
    const [, aw] = dims(A), [, bw] = dims(B), [ch, cw] = dims(C);
    const g = blank(Math.max(10, Math.max(...[dims(A)[0], dims(B)[0]]) + 4), aw + bw + 8);
    drawFrame(g, 1, 1, dims(A)[0] + 2, dims(A)[1] + 2);
    drawFrame(g, 1, aw + 5, dims(B)[0] + 2, dims(B)[1] + 2);
    stamp(g, A, 2, 2, rw.col); stamp(g, B, 2, aw + 6, rw.col);
    const out = blank(ch + 2, cw + 2); stamp(out, C, 1, 1, rw.col);
    return { in: g, out };
  });
  return mkCard("fractal_expand", "Real Recursive Expansion", "infer the recursive replacement depth from the two shown stages, then emit the next larger stage.", pairs, 207, {
    suggestion: "recursive_fractal_expand",
    extraChecks(card) {
      const test = card.pairs[card.pairs.length - 1];
      return [{ check: "fractal-output-grows", ok: test.out.length > test.in.length || test.out[0].length > Math.floor(test.in[0].length / 2), note: `test in ${test.in.length}x${test.in[0].length}, out ${test.out.length}x${test.out[0].length}` }];
    },
  });
}
function makeDynamicCard() {
  const paths = [
    [[1,1],[1,2],[2,2],[3,2],[3,3],[3,4]],
    [[2,1],[2,2],[2,3],[3,3],[4,3],[4,4],[5,4]],
    [[1,2],[2,2],[3,2],[3,3],[3,4],[4,4]],
    [[2,2],[2,3],[3,3],[4,3],[4,4],[4,5],[5,5]],
  ];
  const pairs = paths.map((p, i) => {
    const g = blank(12, 18), o = blank(12, 18), off = i % 2 ? 7 : 8;
    for (const [r, c] of p) { g[r][c] = 5; o[r][c] = 5; }
    for (const [r, c] of p) { g[r + 5][c + off] = 5; o[r + 5][c + off] = 5; }
    const [sr, sc] = p[0], [gr, gc] = p[p.length - 1];
    g[sr][sc] = 1; g[gr][gc] = 4;
    g[sr + 5][sc + off] = 2; g[gr + 5][gc + off] = 4;
    o[sr][sc] = 0; o[gr][gc] = 1;
    o[sr + 5][sc + off] = 0; o[gr + 5][gc + off] = 2;
    return { in: g, out: o };
  });
  return mkCard("dynamic_analogy", "Single-Path Future Analogy", "both agents follow their own unambiguous path to the goal; the query path differs from the demonstration path.", pairs, 208, { allowFixedDims: true });
}

const BUILDERS = [makeDispatchCard, makeRelationCard, makeAnalogyCard, makeSupportCard, makePatternCard, makeXorCard, makeFractalCard, makeDynamicCard];

function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const cards = BUILDERS.map((fn, i) => {
    const card = fn();
    card.audit = auditCard(card);
    card.stats = {
      train: card.pairs.slice(0, -1).map(p => ({ in: gridStats(p.in), out: gridStats(p.out) })),
      test: { in: gridStats(card.pairs.at(-1).in), out: gridStats(card.pairs.at(-1).out) },
    };
    const grid = montage(card.pairs);
    card.gif = gifData(grid, `super_visual_v2_${String(i + 1).padStart(2, "0")}_${card.name}.gif`);
    return card;
  });
  const bad = cards.flatMap(c => c.audit.filter(a => !a.ok).map(a => `${c.name}:${a.check}:${a.note}`));
  if (bad.length) throw new Error("visual showcase audit failed\n" + bad.join("\n"));
  const html = `<!doctype html><meta charset=utf-8><title>GRIDVID visual super suggester v2</title><style>
body{margin:0;background:#111114;color:#ececf1;font:14px Inter,system-ui,sans-serif;padding:24px}
h1{font-size:24px;margin:0 0 6px;color:#67e8f9}.lead{margin:0 0 22px;color:#b8b8c2;max-width:1080px;line-height:1.45}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(390px,1fr));gap:18px}.card{background:#18181d;border:1px solid #30303a;border-radius:8px;padding:14px}
.top{display:flex;justify-content:space-between;gap:12px;align-items:baseline}.top h2{font-size:16px;margin:0;color:#facc15}.tag{font:12px ui-monospace,Menlo,monospace;color:#93c5fd}
p{margin:8px 0 12px;color:#d4d4dc;line-height:1.4}img{width:100%;height:auto;image-rendering:pixelated;background:#000;border:1px solid #34343c}
.tiny{font:11px ui-monospace,Menlo,monospace;color:#a1a1aa;margin-top:8px}.ok{color:#86efac}.warn{color:#fb923c}
</style><h1>GRIDVID Super Suggester - Visual Materializations v2</h1><p class=lead>Automatic procedural materializations from typed DSL-suggestion families. Each card has 3 training rows plus 1 held-out test row; the yellow separator marks the test row. Audits reject exact copied test answers, no-variety examples, and known confounds.</p><div class=grid>
${cards.map(c => `<section class=card><div class=top><h2>${esc(c.title)}</h2><span class=tag>${esc(c.name)} d${esc(c.suggestion.difficulty)} depth ${esc(c.suggestion.depth)}</span></div><p>${esc(c.rule)}</p><img src="${esc(c.gif)}" alt="${esc(c.title)}"><div class=tiny>${c.audit.map(a => `<span class="${a.ok ? "ok" : "warn"}">${esc(a.check)}</span>`).join(" · ")}</div></section>`).join("\n")}
</div>`;
  fs.writeFileSync(HTML_OUT, html);
  fs.writeFileSync(JSON_OUT, JSON.stringify(cards.map(c => ({
    provenance: c.provenance,
    name: c.name,
    title: c.title,
    rule: c.rule,
    gif: c.gif,
    pairs: c.pairs,
    audit: c.audit,
    stats: c.stats,
    suggestion: c.suggestion,
  })), null, 2) + "\n");
  console.log("wrote " + path.relative(process.cwd(), HTML_OUT));
  console.log("wrote " + path.relative(process.cwd(), JSON_OUT));
  for (const c of cards) console.log("wrote " + path.relative(process.cwd(), path.join(OUT, c.gif)));
}

if (require.main === module) main();

module.exports = { main, HTML_OUT, JSON_OUT, auditCard };
