#!/usr/bin/env node
/* build_deep_showcase.js — visual proof of the deep-composition explosion.
 * Renders N deep-composed tasks (distinct rules) with their IN/OUT grids + rule text.
 *   node build_deep_showcase.js -o out/deep_showcase.html --n 30 --depth 5
 */
const fs = require("fs");
const D = require("./compose_deep.js");

const PAL = ["#101014", "#0074D9", "#FF4136", "#2ECC40", "#FFDC00", "#AAAAAA", "#F012BE", "#FF851B", "#7FDBFF", "#870C25"];
const esc = s => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const grid = g => `<table class=grid>${g.map(r => `<tr>${r.map(v => `<td style="background:${PAL[v] || "#000"}"></td>`).join("")}</tr>`).join("")}</table>`;
const pair = e => `<div class=pair><div><div class=lbl>IN</div>${grid(e.in[0])}</div><div class=arrow>→</div><div><div class=lbl>OUT</div>${grid(e.out[0])}</div></div>`;

function build(opts) {
  const r = D.generate({ n: opts.n || 30, depth: opts.depth || 5, seed: opts.seed || 1 });
  const cards = r.records.slice(0, opts.n || 30).map(t => `<section class=card>
    <div class=top><h2>${esc(t.meta.id)}</h2><span>depth ${t.meta.depth} · diff ${t.meta.difficulty} · sig ${esc(t.meta.rule_signature)}</span></div>
    <p class=rule>${esc(t.meta.rule)}</p>
    <div class=grids>${pair(t.examples[0])}${pair({ in: t.in, out: t.out })}</div>
  </section>`).join("\n");
  return `<!doctype html><meta charset=utf-8><title>GRIDVID deep composition</title><style>
  body{margin:0;background:#0b0b0f;color:#ececf1;font:13px ui-monospace,Menlo,monospace;padding:24px}
  h1{margin:0 0 4px;color:#67e8f9;font-size:22px}.lead{color:#aab;max-width:1000px;line-height:1.5;margin:0 0 16px}
  .card{border:1px solid #2a2a34;background:#15151b;border-radius:9px;padding:14px;margin:14px 0}
  .top{display:flex;justify-content:space-between;align-items:center;gap:10px}.top h2{margin:0;font-size:14px;color:#93c5fd}.top span{color:#facc15;font-size:11px}
  .rule{color:#f4f4f5;line-height:1.45;margin:6px 0 10px}.grids{display:flex;flex-wrap:wrap;gap:22px}
  .pair{display:flex;gap:8px;align-items:center}.arrow{color:#67e8f9;font-size:18px}.lbl{color:#889;font-size:10px;margin-bottom:2px}
  table.grid{border-collapse:collapse;border:1px solid #333}table.grid td{width:10px;height:10px;padding:0}
  </style><h1>Deep functional composition — ${r.distinct_rules} distinct rules</h1>
  <p class=lead>Each task is a DIFFERENT composite rule sampled over the program.js combinator AST (seq/mask nesting of dispatch+apply, depth up to ${opts.depth || 5}), kept only if coherent + non-trivial + teaching. The RULE changes every card — not just the shapes/colours. Depth histogram: ${esc(JSON.stringify(r.depth_hist))}.</p>
  ${cards}`;
}

if (require.main === module) {
  const args = process.argv.slice(2), flag = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
  const out = flag("-o", "out/deep_showcase.html");
  fs.writeFileSync(out, build({ n: +flag("--n", 30), depth: +flag("--depth", 5), seed: +flag("--seed", 1) }));
  console.log("wrote " + out);
}
module.exports = { build };
