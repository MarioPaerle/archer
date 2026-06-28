#!/usr/bin/env node
/* build_solvable_showcase.js — ARC-styled showcase of SOLVER-VERIFIED tasks.
 * Proper light-grey gridlines, ALL train pairs + the test shown so the rule is inferable by eye,
 * with the solver's re-derived rule printed beneath. node build_solvable_showcase.js -o out/solvable_showcase.html
 */
const fs = require("fs");
const GS = require("./gen_solvable.js");

const PAL = ["#000000", "#1E93FF", "#F93C31", "#4FCC30", "#FFDC00", "#999999", "#E53AA3", "#FF851B", "#87D8F1", "#921231"];
const esc = s => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const grid = g => `<table class=grid>${g.map(r => `<tr>${r.map(v => `<td style="background:${PAL[v] || "#000"}"></td>`).join("")}</tr>`).join("")}</table>`;
const pairBox = (e, label) => `<div class=pair><div class=cell><div class=lbl>${label} in</div>${grid(e.in[0])}</div><div class=arrow>→</div><div class=cell><div class=lbl>${label} out</div>${grid(e.out[0])}</div></div>`;

function build(opts) {
  const r = GS.generate({ n: opts.n || 24, seed: opts.seed || 1 });
  const cards = r.records.slice(0, opts.n || 24).map(t => {
    const trains = t.examples.map((e, i) => pairBox(e, "ex" + (i + 1))).join("");
    return `<section class=card>
      <div class=top><h2>${esc(t.meta.id)}</h2><span>diff ${t.meta.difficulty} · key ${esc(t.meta.solver.key)}${t.meta.solver.region ? " · region" : ""}</span></div>
      <p class=rule><b>rule (re-derived by the solver):</b> ${esc(t.meta.solver.rule)}</p>
      <div class=row>${trains}<div class=test>${pairBox({ in: t.in, out: t.out }, "TEST")}</div></div>
    </section>`;
  }).join("\n");
  return `<!doctype html><meta charset=utf-8><title>GRIDVID — solver-verified tasks</title><style>
  body{margin:0;background:#0b0b0f;color:#ececf1;font:13px ui-monospace,Menlo,monospace;padding:24px}
  h1{margin:0 0 4px;color:#67e8f9;font-size:22px}.lead{color:#aab;max-width:1040px;line-height:1.5;margin:0 0 16px}
  .card{border:1px solid #2a2a34;background:#15151b;border-radius:9px;padding:14px;margin:14px 0}
  .top{display:flex;justify-content:space-between;align-items:center}.top h2{margin:0;font-size:14px;color:#93c5fd}.top span{color:#facc15;font-size:11px}
  .rule{color:#f4f4f5;line-height:1.45;margin:6px 0 10px}.rule b{color:#86efac}
  .row{display:flex;flex-wrap:wrap;gap:18px;align-items:flex-start}
  .pair{display:flex;gap:8px;align-items:center}.arrow{color:#67e8f9;font-size:16px}
  .cell .lbl{color:#889;font-size:10px;margin-bottom:3px}.test{padding-left:16px;border-left:2px dashed #3a3a44}
  table.grid{border-collapse:collapse;background:#111}
  table.grid td{width:14px;height:14px;padding:0;border:1px solid #4a4a4a}   /* the ARC light-grey gridlines */
  </style>
  <h1>Solver-verified hierarchical tasks — ${r.distinct_rules} distinct solvable rules</h1>
  <p class=lead>Every task is re-derived by an independent solver from the train examples alone and reproduces the held-out TEST output <b>uniquely</b> — so each is guaranteed solvable. Hierarchy = one feature (colour / core / size / quadrant / hole / size-rank), optionally scoped to a region (depth-2). From ${r.attempts} samples: ${r.emitted} kept, ${r.rejected.unsolvable} rejected unsolvable, ${r.rejected.ambiguous} ambiguous, ${r.rejected.trivial} trivial. Read the examples, infer the rule, check the test.</p>
  ${cards}`;
}

if (require.main === module) {
  const args = process.argv.slice(2), flag = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
  const out = flag("-o", "out/solvable_showcase.html");
  fs.writeFileSync(out, build({ n: +flag("--n", 24), seed: +flag("--seed", 1) }));
  console.log("wrote " + out);
}
module.exports = { build };
