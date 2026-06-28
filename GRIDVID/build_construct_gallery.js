#!/usr/bin/env node
/* build_construct_gallery.js — gallery of things built by the construct.js Part algebra,
 * each shown with parametric variants to make the "endless possibilities" visible. ARC gridlines. */
const fs = require("fs");
const K = require("./construct.js");
const PAL = ["#000000", "#1E93FF", "#F93C31", "#4FCC30", "#FFDC00", "#999999", "#E53AA3", "#FF851B", "#87D8F1", "#921231"];
const grid = g => `<table class=grid>${g.map(r => `<tr>${r.map(v => `<td style="background:${PAL[v] || "#000"}"></td>`).join("")}</tr>`).join("")}</table>`;
const cell = (p, label) => `<div class=item><div class=lbl>${label}</div>${grid(K.render(p, 1))}</div>`;

// each entry: title + a list of parametric variants (label → Part)
const ROWS = [
  ["flower", [["5 petals", K.THINGS.flower({ n: 5 })], ["6 petals", K.THINGS.flower({ n: 6 })], ["8 petals", K.THINGS.flower({ n: 8 })], ["azure", K.THINGS.flower({ n: 6, petal: 8 })]]],
  ["pine tree", [["2 tiers", K.THINGS.pine({ tiers: 2 })], ["3 tiers", K.THINGS.pine({ tiers: 3 })], ["4 tiers", K.THINGS.pine({ tiers: 4 })]]],
  ["tree", [["crown 3", K.THINGS.tree({ crown: 3 })], ["crown 4", K.THINGS.tree({ crown: 4 })], ["tall trunk", K.THINGS.tree({ crown: 4, trunkH: 5 })]]],
  ["house", [["w5", K.THINGS.house({ w: 5 })], ["w7", K.THINGS.house({ w: 7 })], ["green roof", K.THINGS.house({ w: 7, roof: 3 })]]],
  ["robot", [["magenta", K.THINGS.robot({})], ["orange body", K.THINGS.robot({ col: 7 })]]],
  ["star", [["5-point", K.THINGS.star({ k: 5, r: 5 })], ["6-point", K.THINGS.star({ k: 6, r: 6 })], ["8-point", K.THINGS.star({ k: 8, r: 7 })]]],
  ["polygon", [["pentagon", K.THINGS.polygon({ n: 5 })], ["hexagon", K.THINGS.polygon({ n: 6 })], ["octagon", K.THINGS.polygon({ n: 8 })]]],
  ["heart", [["s3", K.THINGS.heart({ s: 3 })], ["s4", K.THINGS.heart({ s: 4 })], ["magenta", K.THINGS.heart({ s: 4, col: 6 })]]],
  ["gear", [["6 teeth", K.THINGS.gear({ teeth: 6 })], ["8 teeth", K.THINGS.gear({ teeth: 8 })], ["12 teeth", K.THINGS.gear({ teeth: 12 })]]],
  ["snowflake", [["azure", K.THINGS.snowflake({})], ["blue", K.THINGS.snowflake({ col: 1 })]]],
  ["sun", [["sun", K.THINGS.sun({})]]],
  ["fish", [["azure", K.THINGS.fish({})], ["green", K.THINGS.fish({ col: 3 })]]],
  ["ladder", [["n3", K.THINGS.ladder({ n: 3 })], ["n4", K.THINGS.ladder({ n: 4 })], ["n5", K.THINGS.ladder({ n: 5 })]]],
  ["butterfly", [["magenta", K.THINGS.butterfly({})], ["green", K.THINGS.butterfly({ col: 3 })]]],
  ["key", [["key", K.THINGS.key({})]]],
  ["digits", [["0", K.THINGS.digit({ d: 0 })], ["3", K.THINGS.digit({ d: 3 })], ["7", K.THINGS.digit({ d: 7 })], ["8", K.THINGS.digit({ d: 8 })]]],
];

function html() {
  const rows = ROWS.map(([title, variants]) => `<section class=row><h2>${title}</h2><div class=items>${variants.map(([l, p]) => cell(p, l)).join("")}</div></section>`).join("\n");
  return `<!doctype html><meta charset=utf-8><title>GRIDVID construct — endless things</title><style>
  body{margin:0;background:#0b0b0f;color:#ececf1;font:13px ui-monospace,Menlo,monospace;padding:24px}
  h1{margin:0 0 4px;color:#67e8f9;font-size:22px}.lead{color:#aab;max-width:1040px;line-height:1.5;margin:0 0 18px}
  .row{border-top:1px solid #23232c;padding:12px 0}.row h2{margin:0 0 8px;color:#c4b5fd;font-size:14px;text-transform:capitalize}
  .items{display:flex;flex-wrap:wrap;gap:20px;align-items:flex-end}
  .item .lbl{color:#889;font-size:10px;margin-bottom:4px}
  table.grid{border-collapse:collapse;background:#111}table.grid td{width:13px;height:13px;padding:0;border:1px solid #3a3a3a}
  </style>
  <h1>The construct DSL — building endless things by composition</h1>
  <p class=lead>One closed algebra (atom · attach · overlay · row/col/grid · ring_of · mirror · rotate_copies · nest · grow) over a shape vocabulary. Each "thing" is a short composition; sweeping ONE parameter (petals, tiers, teeth, points, width, digit) sweeps a whole family. This is the human-prior creation surface — shapes here, rules on top.</p>
  ${rows}`;
}
function write(out) { fs.writeFileSync(out, html()); console.log("wrote " + out); }

if (require.main === module) { const args = process.argv.slice(2), i = args.indexOf("-o"); write(i >= 0 ? args[i + 1] : "out/construct_gallery.html"); }
module.exports = { write, html };
