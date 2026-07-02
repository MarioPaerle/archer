#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const E = require("./engine.js");
const GIF = require("./gif.js");
const K = require("./skins.js");

const OUT = path.join(__dirname, "out");
const HTML_OUT = path.join(OUT, "procedural_nft_showcase.html");
const JSON_OUT = path.join(OUT, "procedural_nft_showcase.json");
const JSONL_OUT = path.join(OUT, "procedural_nft_tasks.jsonl");
const BG = 0, SEP = 5;

const COLORS = [1, 2, 3, 4, 6, 7, 8, 9];
const BODY = [5, 6, 7, 8, 9];
const MARKS = [1, 2, 3, 4];
const RECIPES = ["trait_dispatch", "symbol_move", "macro_rewrite", "fractal_growth", "relation_gate"];

const blank = (h, w) => Array.from({ length: h }, () => Array(w).fill(0));
const clone = g => g.map(r => r.slice());
const pick = (rng, a) => a[rng.int(0, a.length - 1)];
const shuffle = (rng, a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = rng.int(0, i); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const rect = (h, w) => { const o = []; for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) o.push([r, c]); return o; };
const key = cells => cells.map(([r, c]) => r + "," + c).sort().join(";");
function norm(cells) {
  const mr = Math.min(...cells.map(p => p[0])), mc = Math.min(...cells.map(p => p[1]));
  return cells.map(([r, c]) => [r - mr, c - mc]);
}
function bbox(cells) {
  let h = 0, w = 0;
  for (const [r, c] of cells) { h = Math.max(h, r + 1); w = Math.max(w, c + 1); }
  return [h, w];
}
function stamp(g, cells, r0, c0, col) {
  for (const [r, c] of cells) {
    const rr = r0 + r, cc = c0 + c;
    if (rr >= 0 && cc >= 0 && rr < g.length && cc < g[0].length) g[rr][cc] = col;
  }
}
function paste(dst, src, r0, c0) {
  for (let r = 0; r < src.length; r++) for (let c = 0; c < src[0].length; c++) dst[r0 + r][c0 + c] = src[r][c];
}
function crop(g, pad = 0) {
  let r0 = Infinity, c0 = Infinity, r1 = -Infinity, c1 = -Infinity;
  for (let r = 0; r < g.length; r++) for (let c = 0; c < g[0].length; c++) if (g[r][c]) { r0 = Math.min(r0, r); c0 = Math.min(c0, c); r1 = Math.max(r1, r); c1 = Math.max(c1, c); }
  if (r1 < r0) return [[0]];
  r0 = Math.max(0, r0 - pad); c0 = Math.max(0, c0 - pad); r1 = Math.min(g.length - 1, r1 + pad); c1 = Math.min(g[0].length - 1, c1 + pad);
  const out = []; for (let r = r0; r <= r1; r++) out.push(g[r].slice(c0, c1 + 1)); return out;
}
function flipH(cells) { const [, w] = bbox(cells); return norm(cells.map(([r, c]) => [r, w - 1 - c])); }
function flipV(cells) { const [h] = bbox(cells); return norm(cells.map(([r, c]) => [h - 1 - r, c])); }
function rot90(cells) { return norm(cells.map(([r, c]) => [c, -r])); }
function outline(cells) {
  const set = new Set(cells.map(([r, c]) => r + "," + c));
  return cells.filter(([r, c]) => [[1,0],[-1,0],[0,1],[0,-1]].some(([dr, dc]) => !set.has((r + dr) + "," + (c + dc))));
}
function randomMask(rng) {
  const mode = rng.int(0, 18);
  if (mode === 0) return rect(rng.int(2, 4), rng.int(2, 5));
  if (mode === 1) return outline(rect(rng.int(4, 6), rng.int(4, 6)));
  if (mode === 2) return E.buildShape("plus", [rng.int(3, 5)]);
  if (mode === 3) return E.buildShape("triangle", [rng.int(3, 5)]);
  if (mode === 4) return E.buildShape("notch", [rng.int(4, 5)]);
  if (mode === 5) return E.buildShape("bump", [rng.int(3, 4)]);
  if (mode === 6) return E.buildShape("Lshape", [rng.int(3, 5)]);
  if (mode <= 15) return E.buildShape(pick(rng, K.SHAPES_ALL), [rng.int(3, 5)]);
  if (mode === 16) return E.buildShape("frame", [rng.int(4, 6), rng.int(4, 6)]);
  if (mode === 17) return E.buildShape("ring", [rng.int(4, 6)]);
  const cells = [[2, 2]];
  let r = 2, c = 2;
  const target = rng.int(5, 11);
  while (cells.length < target) {
    const [dr, dc] = pick(rng, [[1,0],[-1,0],[0,1],[0,-1]]);
    r = Math.max(0, Math.min(5, r + dr)); c = Math.max(0, Math.min(5, c + dc));
    if (!cells.some(([rr, cc]) => rr === r && cc === c)) cells.push([r, c]);
  }
  return norm(cells);
}
function skinCells(cells, skin, body, accent) {
  const [h, w] = bbox(cells), cr = Math.floor(h / 2), cc = Math.floor(w / 2), set = new Set(cells.map(([r, c]) => r + "," + c));
  return cells.map(([r, c]) => {
    let col = body;
    if (skin === "core") { if (Math.abs(r - cr) + Math.abs(c - cc) <= 1) col = accent; }
    else if (skin === "checker") { if ((r + c) % 2 === 0) col = accent; }
    else if (skin === "stripe-h") { if (r % 2 === 0) col = accent; }
    else if (skin === "stripe-v") { if (c % 2 === 0) col = accent; }
    else if (skin === "diag") { if (r === c || r + c === w - 1) col = accent; }
    else if (skin === "corner") { if ((r < 2 && c < 2) || (r >= h - 2 && c >= w - 2)) col = accent; }
    else if (skin === "rim") { if ([[1,0],[-1,0],[0,1],[0,-1]].some(([dr, dc]) => !set.has((r + dr) + "," + (c + dc)))) col = accent; }
    return [r, c, col];
  });
}
function drawObj(g, o, r = o.r, c = o.c, cells = o.cells) {
  const painted = K.SKINS.includes(o.skin) ? K.skinnedCells(cells, o.skin, o.body, o.accent) : skinCells(cells, o.skin, o.body, o.accent);
  for (const [dr, dc, col] of painted) {
    const rr = r + dr, cc = c + dc;
    if (rr >= 0 && cc >= 0 && rr < g.length && cc < g[0].length) g[rr][cc] = col;
  }
  if (o.mark) g[r + o.mark[0]][c + o.mark[1]] = o.code;
}
function free(occ, cells, r, c, gap = 1) {
  for (const [dr, dc] of cells) {
    const rr = r + dr, cc = c + dc;
    if (rr < 0 || cc < 0 || rr >= occ.length || cc >= occ[0].length) return false;
    for (let a = -gap; a <= gap; a++) for (let b = -gap; b <= gap; b++) {
      const nr = rr + a, nc = cc + b;
      if (nr >= 0 && nc >= 0 && nr < occ.length && nc < occ[0].length && occ[nr][nc]) return false;
    }
  }
  return true;
}
function reserve(occ, cells, r, c) { for (const [dr, dc] of cells) occ[r + dr][c + dc] = 1; }
function marker(cells) {
  const [h, w] = bbox(cells), cr = Math.floor(h / 2), cc = Math.floor(w / 2);
  return cells.slice().sort((a, b) => Math.abs(a[0] - cr) + Math.abs(a[1] - cc) - (Math.abs(b[0] - cr) + Math.abs(b[1] - cc)))[0];
}
function placeObjects(rng, n, h = 22, w = 26, opts = {}) {
  const occ = blank(h, w), out = [];
  for (let i = 0; i < n; i++) {
    let o = null;
    for (let t = 0; t < 300 && !o; t++) {
      const cells = randomMask(rng), [bh, bw] = bbox(cells);
      const r = rng.int(opts.top || 1, h - bh - 1), c = rng.int(opts.left || 1, w - bw - 1);
      if (!free(occ, cells, r, c, opts.gap == null ? 1 : opts.gap)) continue;
      const body = pick(rng, BODY), accent = pick(rng, COLORS.filter(x => x !== body));
      o = { cells, r, c, body, accent, skin: pick(rng, K.SKINS), mark: marker(cells), code: pick(rng, MARKS) };
      reserve(occ, cells, r, c);
    }
    if (!o) throw new Error("placeObjects failed");
    out.push(o);
  }
  return out;
}
function panel(src, h, w, col = SEP) {
  const out = blank(h + 2, w + 2);
  for (let c = 0; c < w + 2; c++) { out[0][c] = col; out[h + 1][c] = col; }
  for (let r = 0; r < h + 2; r++) { out[r][0] = col; out[r][w + 1] = col; }
  paste(out, src, 1 + Math.floor((h - src.length) / 2), 1 + Math.floor((w - src[0].length) / 2));
  return out;
}
function montage(task) {
  const pairs = task.examples.map(e => ({ in: e.in[0], out: e.out[0] })).concat([{ in: task.in[0], out: task.out[0] }]);
  const h = Math.max(...pairs.flatMap(p => [p.in.length, p.out.length])), wi = Math.max(...pairs.map(p => p.in[0].length)), wo = Math.max(...pairs.map(p => p.out[0].length));
  const rows = pairs.map((p, i) => {
    const a = panel(p.in, h, wi, i === pairs.length - 1 ? 4 : SEP), b = panel(p.out, h, wo, i === pairs.length - 1 ? 4 : SEP);
    const row = blank(a.length, a[0].length + 2 + b[0].length);
    paste(row, a, 0, 0); row.forEach(r => r[a[0].length] = i === pairs.length - 1 ? 4 : SEP); paste(row, b, 0, a[0].length + 2); return row;
  });
  const W = Math.max(...rows.map(r => r[0].length)), H = rows.reduce((a, r) => a + r.length, 0) + rows.length - 1, out = blank(H, W);
  let y = 0; for (const r of rows) { paste(out, r, y, 0); y += r.length + 1; } return out;
}
function taskFromPairs(recipe, pairs, meta) {
  const examples = pairs.slice(0, -1).map(p => ({ in: [p.in], out: [p.out] }));
  const test = pairs[pairs.length - 1];
  const id = "NFT-" + crypto.createHash("sha1").update(JSON.stringify(pairs)).digest("hex").slice(0, 8);
  return { format: "prodigy-task", version: 1, width: test.in[0].length, height: test.in.length, palette: "arc10", fps: 1, examples, in: [test.in], out: [test.out], meta: { id, recipe, source: "procedural-nft-composer", difficulty: meta.difficulty, depth: meta.depth, rule: meta.rule, language_description: meta.rule, concepts: meta.concepts, trait_space: meta.trait_space } };
}
function traitDispatchPair(rng) {
  const H = 22, W = 26, objs = placeObjects(rng, rng.int(4, 6), H, W), inG = blank(H, W), out = blank(H, W);
  const ops = { 1: flipH, 2: flipV, 3: rot90, 4: outline };
  for (const o of objs) { drawObj(inG, o); const cells = ops[o.code](o.cells); drawObj(out, o, o.r, o.c, cells); }
  return { in: inG, out };
}
function symbolMovePair(rng) {
  const H = 26, W = 34, inG = blank(H, W), out = blank(H, W), occIn = blank(H, W), occOut = blank(H, W);
  const dirs = shuffle(rng, [[-5,0,1],[0,6,2],[5,0,3],[0,-6,4]]);
  const objs = [];
  for (let i = 0; i < 4; i++) {
    const [dr, dc, code] = dirs[i];
    let cells = randomMask(rng);
    for (let t = 0; t < 4 && cells.length > 13; t++) cells = randomMask(rng);
    const [bh, bw] = bbox(cells);
    let obj = null;
    for (let t = 0; t < 1200 && !obj; t++) {
      const r = rng.int(Math.max(1, -dr), Math.min(H - bh - 1, H - bh - 1 - dr));
      const c = rng.int(Math.max(1, -dc), Math.min(W - bw - 1, W - bw - 1 - dc));
      if (!free(occIn, cells, r, c, 0) || !free(occOut, cells, r + dr, c + dc, 0)) continue;
      const body = pick(rng, BODY), accent = pick(rng, COLORS.filter(x => x !== body && x !== code));
      obj = { cells, r, c, mark: marker(cells), code, body, accent, skin: pick(rng, K.SKINS.filter(s => s !== "spots" && s !== "checker")), dr, dc };
      reserve(occIn, cells, r, c); reserve(occOut, cells, r + dr, c + dc);
    }
    if (!obj) throw new Error("symbolMove failed");
    objs.push(obj);
  }
  for (const o of objs) { drawObj(inG, o); drawObj(out, o, o.r + o.dr, o.c + o.dc); }
  return { in: inG, out };
}
function macroRewritePair(rng) {
  const h = rng.int(2, 3), w = rng.int(2, 3), codes = shuffle(rng, [1, 2, 3, 4]).slice(0, rng.int(3, 4));
  const glyphBank = [
    [[0,0],[0,1],[1,0]],
    [[0,0],[0,1],[1,1]],
    [[0,1],[1,0],[1,1]],
    [[0,0],[1,0],[1,1]],
    [[0,0],[0,1],[1,0],[1,1]],
    [[0,1],[1,0],[1,1],[2,1]],
    [[0,0],[1,0],[1,1],[2,0]],
    [[0,0],[0,2],[1,1],[2,0],[2,2]],
  ];
  const glyphs = {}; codes.forEach(c => glyphs[c] = pick(rng, glyphBank));
  const input = blank(7 + h, 16);
  let x = 1; for (const c of codes) { input[1][x] = c; stamp(input, glyphs[c], 3, x, c); x += 4; }
  const program = Array.from({ length: h }, () => Array.from({ length: w }, () => pick(rng, codes.concat([0]))));
  if (program.flat().filter(Boolean).length < 2) program[0][0] = codes[0], program[h - 1][w - 1] = codes[1];
  paste(input, program, 6, 1);
  const output = blank(h * 3, w * 3);
  for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) if (program[r][c]) stamp(output, glyphs[program[r][c]], r * 3, c * 3, program[r][c]);
  return { in: input, out: crop(output, 0) };
}
function fractalGrowthPair(rng) {
  const n = rng.int(2, 3), cols = shuffle(rng, COLORS).slice(0, 4), seed = Array.from({ length: n }, () => Array(n).fill(0));
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (rng.int(0, 2)) seed[r][c] = pick(rng, cols);
  if (seed.flat().filter(Boolean).length < 2) seed[0][0] = cols[0], seed[n - 1][n - 1] = cols[1];
  const out = blank(n * n, n * n);
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (seed[r][c]) for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) if (seed[a][b]) out[r * n + a][c * n + b] = seed[r][c];
  return { in: seed, out };
}
function relationGatePair(rng) {
  const H = 22, W = 26, objs = placeObjects(rng, rng.int(5, 7), H, W), inG = blank(H, W), out = blank(H, W);
  const gate = pick(rng, MARKS), anchor = { r: rng.int(8, 13), c: rng.int(10, 15) };
  const zone = 8;
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) if (Math.abs(r - anchor.r) + Math.abs(c - anchor.c) === zone && !inG[r][c]) {
    inG[r][c] = SEP;
    out[r][c] = SEP;
  }
  inG[anchor.r][anchor.c] = gate; out[anchor.r][anchor.c] = gate;
  for (const o of objs) {
    drawObj(inG, o);
    const near = Math.abs((o.r + o.mark[0]) - anchor.r) + Math.abs((o.c + o.mark[1]) - anchor.c) <= zone;
    if (near === (o.code === gate)) drawObj(out, { ...o, body: 3 });
    else drawObj(out, o);
  }
  return { in: inG, out };
}
function makeTask(recipe, rng) {
  const makers = { trait_dispatch: traitDispatchPair, symbol_move: symbolMovePair, macro_rewrite: macroRewritePair, fractal_growth: fractalGrowthPair, relation_gate: relationGatePair };
  const pairs = [];
  for (let i = 0; i < 4; i++) pairs.push(makers[recipe](rng));
  const meta = {
    trait_dispatch: { depth: 3, difficulty: 0.76, rule: "embedded marker colour dispatches a transform over highly varied skinned objects", concepts: ["trait-bank", "dispatch", "skins", "transform"], trait_space: "random masks × seven skins × marker dispatch × transform bank" },
    symbol_move: { depth: 3, difficulty: 0.78, rule: "embedded symbol colour moves each object by its encoded vector", concepts: ["symbol", "movement", "object-bank", "program"], trait_space: "random masks × skins × start/destination collision checks × direction program" },
    macro_rewrite: { depth: 3, difficulty: 0.8, rule: "legend glyphs rewrite a small colour program into an expanded composition", concepts: ["macro", "rewrite", "legend", "composition"], trait_space: "random glyph bank × program grid × colour/glyph composition" },
    fractal_growth: { depth: 2, difficulty: 0.68, rule: "each coloured seed cell expands into a copy of the seed pattern", concepts: ["fractal", "recursion", "self-similarity"], trait_space: "random coloured seed masks × recursive replacement" },
    relation_gate: { depth: 3, difficulty: 0.74, rule: "objects matching both marker identity and visible relation-to-anchor zone are recoloured", concepts: ["relation", "gate", "marker", "composition"], trait_space: "object bank × skins × visible anchor zone × marker predicate" },
  }[recipe];
  return taskFromPairs(recipe, pairs, meta);
}
function audit(task) {
  const pairs = task.examples.map(e => ({ in: e.in[0], out: e.out[0] })).concat([{ in: task.in[0], out: task.out[0] }]);
  const outs = pairs.map(p => JSON.stringify(p.out));
  return [
    { check: "output-variety", ok: new Set(outs).size >= 3 },
    { check: "test-not-train-output-copy", ok: !new Set(outs.slice(0, -1)).has(outs.at(-1)) },
    { check: "not-constant", ok: pairs.every(p => JSON.stringify(p.in) !== JSON.stringify(p.out)) },
  ];
}
function gif(grid, file) {
  fs.writeFileSync(path.join(OUT, file), Buffer.from(GIF.encodeGif({ frames: [grid], palette: E.ARC_PALETTE, cell: 6, delayMs: 900 })));
  return file;
}
function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const cards = [], seen = new Set(), drops = { audit: 0, duplicate: 0, error: 0 };
  const dropsByRecipe = {};
  let attempts = 0;
  while (cards.length < 80 && attempts < 3000) {
    attempts++;
    const counts = Object.fromEntries(RECIPES.map(r => [r, cards.filter(c => c.recipe === r).length]));
    const min = Math.min(...RECIPES.map(r => counts[r]));
    const pool = RECIPES.filter(r => counts[r] === min);
    const recipe = pool[(attempts - 1) % pool.length], rng = E.makeRng(880000 + attempts * 7919);
    let task;
    try { task = makeTask(recipe, rng); } catch (e) {
      drops.error++;
      dropsByRecipe[recipe] = (dropsByRecipe[recipe] || 0) + 1;
      continue;
    }
    const h = crypto.createHash("sha1").update(JSON.stringify({ examples: task.examples, in: task.in, out: task.out })).digest("hex");
    if (seen.has(h)) { drops.duplicate++; dropsByRecipe[recipe] = (dropsByRecipe[recipe] || 0) + 1; continue; }
    const checks = audit(task);
    if (checks.some(c => !c.ok)) { drops.audit++; dropsByRecipe[recipe] = (dropsByRecipe[recipe] || 0) + 1; continue; }
    seen.add(h);
    const file = `procedural_nft_${String(cards.length + 1).padStart(3, "0")}_${recipe}.gif`;
    cards.push({ id: task.meta.id, recipe, gif: gif(montage(task), file), task, audit: checks });
  }
  const by = {}; cards.forEach(c => by[c.recipe] = (by[c.recipe] || 0) + 1);
  fs.writeFileSync(JSONL_OUT, cards.map(c => JSON.stringify(c.task)).join("\n") + "\n");
  fs.writeFileSync(JSON_OUT, JSON.stringify({ generated_at: new Date(0).toISOString(), generator: "procedural-nft-composer", target_cards: 80, attempts, drops, drops_by_recipe: dropsByRecipe, recipes: by, cards }, null, 2) + "\n");
  const html = `<!doctype html><meta charset=utf-8><title>Procedural NFT GRIDVID Showcase</title><style>
body{margin:0;background:#101014;color:#ececf1;font:14px Inter,system-ui,sans-serif;padding:24px}h1{margin:0;color:#67e8f9}.lead{max-width:1120px;color:#c8c8d0}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(330px,1fr));gap:16px}.card{background:#18181d;border:1px solid #30303a;border-radius:8px;padding:12px}h2{font-size:14px;color:#93c5fd}img{width:100%;image-rendering:pixelated;background:#000;border:1px solid #34343c}.checks{font:10px ui-monospace,Menlo,monospace}.ok{color:#86efac}
</style><h1>Procedural NFT GRIDVID Showcase</h1><p class=lead>80 tasks from a larger trait/composition generator: random masks, skins, embedded symbols, relation gates, macro rewrites, movement programs, and recursive growth. This is intentionally closer to procedural NFT generation: many independent trait axes, not just fixed templates with small augmentations.</p><div class=grid>${cards.map(c => `<section class=card><h2>${esc(c.recipe)} · ${esc(c.id)}</h2><p>${esc(c.task.meta.rule)}</p><img src="${esc(c.gif)}"><div class=checks>${c.audit.map(a => `<span class=ok>${esc(a.check)}</span>`).join(" · ")}</div></section>`).join("\n")}</div>`;
  fs.writeFileSync(HTML_OUT, html);
  console.log("wrote " + path.relative(process.cwd(), HTML_OUT));
  console.log("wrote " + path.relative(process.cwd(), JSON_OUT));
  console.log("wrote " + path.relative(process.cwd(), JSONL_OUT));
  console.log("cards " + cards.length + " · recipes " + JSON.stringify(by) + " · drops " + JSON.stringify(drops) + " · drops_by_recipe " + JSON.stringify(dropsByRecipe));
}
if (require.main === module) main();

module.exports = { main, HTML_OUT, JSON_OUT, JSONL_OUT };
