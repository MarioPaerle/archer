#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const Patch2D = require("./tokenizer/patch2d.js");
const Shape2D = require("./tokenizer/shape2d.js");

const OUT = path.join(__dirname, "out", "review");
fs.mkdirSync(OUT, { recursive: true });

const COLORS = [
  "#000000", "#0074D9", "#FF4136", "#2ECC40", "#FFDC00",
  "#AAAAAA", "#F012BE", "#FF851B", "#7FDBFF", "#870C25",
];

function esc(s) {
  return String(s).replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[ch]));
}

function gifCard(dir, file) {
  const p = path.join(__dirname, dir, file);
  const data = fs.readFileSync(p).toString("base64");
  const label = file.replace(/\.gif$/, "");
  return `<article class="card"><img src="data:image/gif;base64,${data}" alt="${esc(label)}"><div class="label">${esc(label)}</div></article>`;
}

function section(title, subtitle, dir) {
  const abs = path.join(__dirname, dir);
  const gifs = fs.readdirSync(abs).filter(n => n.endsWith(".gif")).sort();
  return `<section><h2>${esc(title)}</h2><p>${esc(subtitle)}</p><div class="grid">${gifs.map(g => gifCard(dir, g)).join("\n")}</div></section>`;
}

function gridHtml(g, cls = "") {
  const cols = g[0].length;
  return `<div class="arcgrid ${cls}" style="grid-template-columns:repeat(${cols},var(--cell));">${g.map(row => row.map(x => `<span style="background:${COLORS[x]}">${x}</span>`).join("")).join("")}</div>`;
}

function tokensHtml(tokens) {
  return `<div class="tokens">${tokens.map(t => `<code class="${t === "SAME" ? "same" : /^P/.test(t) ? "patch" : ""}">${esc(t)}</code>`).join(" ")}</div>`;
}

const shapeGrid = [
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  [0,2,2,2,0,5,5,5,5,0,0,0,0,0],
  [0,2,2,2,0,5,0,0,5,0,0,3,0,0],
  [0,2,2,2,0,5,5,5,5,0,3,3,3,0],
  [0,0,0,0,0,0,0,0,0,0,0,3,0,0],
  [0,4,0,0,0,0,6,6,6,6,6,0,0,0],
  [0,4,0,0,0,0,0,0,0,0,0,0,8,0],
  [0,4,4,4,0,0,0,0,0,0,0,8,8,0],
  [0,0,0,0,0,0,0,0,0,0,0,0,8,8],
];
const shapeTokens = Shape2D.encodeGrid(shapeGrid);
const shapeDecoded = Shape2D.decodeGrid(shapeTokens);
const fallbackGrid = [
  [0,0,0,0,0,0],
  [0,7,7,0,0,0],
  [0,0,7,0,3,3],
  [0,7,7,0,0,3],
];
const fallbackTokens = Shape2D.encodeGrid(fallbackGrid);
const patchFallbackTokens = Patch2D.encodeGrid(fallbackGrid);

const html = `<!doctype html>
<meta charset="utf-8">
<title>GRIDVID review: liquid, temporal analogies, noisy holes, materialization, ordered shape tokens</title>
<style>
:root{--bg:#090909;--panel:#111;--line:#2a2a2a;--pink:#ff5fae;--cyan:#4fe3f0;--muted:#9a9a9a;--cell:20px}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:#f2f2f2;font:13px ui-monospace,SFMono-Regular,Menlo,monospace;padding:24px}
h1{margin:0 0 6px;color:var(--pink);font-size:20px;letter-spacing:0}
h2{margin:28px 0 6px;color:var(--cyan);font-size:15px;letter-spacing:0}
p{margin:0 0 14px;color:var(--muted);line-height:1.45;max-width:920px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:14px}
.card{background:var(--panel);border:1px solid var(--line);border-radius:6px;padding:9px}
.card img{display:block;width:100%;image-rendering:pixelated;border-radius:3px;background:#000}
.label{margin-top:7px;color:var(--cyan);font-size:11px;overflow-wrap:anywhere}
.tokwrap{display:grid;grid-template-columns:minmax(240px,auto) 1fr;gap:18px;align-items:start;margin-top:14px}
.arcpair{display:flex;gap:16px;align-items:flex-start;flex-wrap:wrap}
.arcbox{background:var(--panel);border:1px solid var(--line);border-radius:6px;padding:10px}
.arcbox h3{margin:0 0 8px;font-size:12px;color:#fff;font-weight:600}
.arcgrid{display:grid;gap:2px;background:#222;padding:2px;width:max-content}
.arcgrid span{display:grid;place-items:center;width:var(--cell);height:var(--cell);color:#fff;font-size:9px;text-shadow:0 1px 1px #000}
.tokens{background:#050505;border:1px solid var(--line);border-radius:6px;padding:10px;line-height:2;overflow-wrap:anywhere}
code{color:#ddd;background:#1a1a1a;border:1px solid #333;border-radius:4px;padding:2px 5px;margin:1px;white-space:nowrap}
code.patch{color:#ffd166;border-color:#5a4a16}
code.same{color:#6ee7b7;border-color:#1e5b48}
.note{color:#ddd;background:#121212;border-left:3px solid var(--pink);padding:10px 12px;margin:12px 0;border-radius:3px}
@media(max-width:760px){.tokwrap{grid-template-columns:1fr}:root{--cell:17px}}
</style>
<h1>GRIDVID review dataset</h1>
<p>Fresh examples for controlled liquid with spill, explicit collider lessons, temporal analogy lessons for object permanence/occlusion, precise noisy shaped holes, block-by-block materialization, and exact ordered 2D-aware shape tokenization.</p>

${section("Liquid: cellular stream + spill", "Every water pixel is real liquid state. Sources inject exactly n cells per active tick; existing water moves down, spills off lips, spreads sideways on support, pressurizes full columns, and preserves mass.", "out/liquid_room")}
${section("Collider lessons: example -> transfer", "Each clip teaches one contact rule first, pauses, then repeats the same rule with a changed color, shape, or axis. These are lessons, not just collision evidence.", "out/collider_lessons")}
${section("Temporal analogies: example -> similar event", "Most clips first show one event, pause, then show a similar event with changed color/shape/position. The kid sees a rule transfer through time, not just two objects sharing a frame.", "out/analogy_pairs")}
${section("Extra object permanence evidence", "More raw collision, movement, over/under, and temporary-hidden examples after the analogy pairs.", "out/object_permanence")}
${section("Precise holes in noisy material", "The gray field is noisy, but the holes are clean shape silhouettes. Matching objects start nearby and flow into their sockets in about 2-4 frames. Zoom-out is disabled here because it destroys small exact sockets.", "out/noisy_holes")}
${section("Block-by-block materialization", "Same final socket solutions, but objects appear cell by cell in-place instead of translating to the target. This is the constructive augmentation for shape-hole tasks.", "out/materialize_holes")}

<section>
  <h2>2D decodable tokenization</h2>
  <p>Main path: semantic 2D shape tokens. The tokenizer finds connected components with a fast non-neural scan, emits them in explicit top-left order, and uses dictionary atoms like <code>SQUARE</code>, <code>RECT</code>, <code>LINE</code>, <code>FRAME</code>, <code>PLUS</code>, and <code>LSHAPE</code>. Unknown components fall back to exact <code>CELLS</code> masks.</p>
  <div class="note">This is sparse but ordered: each token carries color, top-left anchor, and shape parameters. Decoding does not need a neural model. Patch tokens still exist only as a low-level fallback for noisy leftovers.</div>
  <div class="tokwrap">
    <div class="arcpair">
      <div class="arcbox"><h3>shape grid</h3>${gridHtml(shapeGrid)}</div>
      <div class="arcbox"><h3>decoded from shape tokens</h3>${gridHtml(shapeDecoded)}</div>
    </div>
    ${tokensHtml(shapeTokens)}
  </div>
  <div class="tokwrap">
    <div class="arcpair">
      <div class="arcbox"><h3>unknown shape</h3>${gridHtml(fallbackGrid)}</div>
      <div class="arcbox"><h3>decoded from CELLS fallback</h3>${gridHtml(Shape2D.decodeGrid(fallbackTokens))}</div>
    </div>
    ${tokensHtml(fallbackTokens)}
  </div>
  <div class="tokwrap">
    <div class="arcpair">
      <div class="arcbox"><h3>same grid as patch fallback</h3>${gridHtml(fallbackGrid)}</div>
      <div class="arcbox"><h3>patch fallback decodes too</h3>${gridHtml(Patch2D.decodeGrid(patchFallbackTokens))}</div>
    </div>
    <div>
      <p>Low-level patch fallback is still exact, but much longer and less meaningful than shape atoms.</p>
      ${tokensHtml(patchFallbackTokens)}
    </div>
  </div>
</section>`;

const out = path.join(OUT, "index.html");
fs.writeFileSync(out, html);
console.log(out);
