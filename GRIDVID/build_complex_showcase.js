#!/usr/bin/env node
/* build_complex_showcase.js — ARC-styled showcase of the COMPLEX verified rules (gen4):
 * containment (inside/outside a frame), boolean (A op B), analogy (A:B::C:?). */
const fs = require("fs");
const G4 = require("./gen4.js");
const PAL = ["#000000", "#1E93FF", "#F93C31", "#4FCC30", "#FFDC00", "#999999", "#E53AA3", "#FF851B", "#87D8F1", "#921231"];
const esc = s => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const grid = g => `<table class=grid>${g.map(r => `<tr>${r.map(v => `<td style="background:${PAL[v] || "#000"}"></td>`).join("")}</tr>`).join("")}</table>`;
const pairBox = (e, label) => `<div class=pair><div class=cell><div class=lbl>${label} in</div>${grid(e.in[0])}</div><div class=arrow>→</div><div class=cell><div class=lbl>${label} out</div>${grid(e.out[0])}</div></div>`;

function build(opts) {
  const r = G4.generate({ n: (opts.n || 24) * 2, seed: opts.seed || 1 });
  // one of each family first, then fill
  const order = { containment: 0, boolean: 1, analogy: 2 };
  const recs = r.records.slice().sort((a, b) => (order[a.meta.family] - order[b.meta.family])).slice(0, opts.n || 24);
  const cards = recs.map(t => `<section class=card>
    <div class=top><h2>${esc(t.meta.family)}</h2><span>${esc(t.meta.id)}</span></div>
    <p class=rule><b>solver re-derived:</b> ${esc(t.meta.solver.rule)}</p>
    <div class=row>${t.examples.map((e, i) => pairBox(e, "ex" + (i + 1))).join("")}<div class=test>${pairBox({ in: t.in, out: t.out }, "TEST")}</div></div>
  </section>`).join("\n");
  return `<!doctype html><meta charset=utf-8><title>GRIDVID — complex verified rules</title><style>
  body{margin:0;background:#0b0b0f;color:#ececf1;font:13px ui-monospace,Menlo,monospace;padding:24px}
  h1{margin:0 0 4px;color:#67e8f9;font-size:22px}.lead{color:#aab;max-width:1040px;line-height:1.5;margin:0 0 16px}
  .card{border:1px solid #2a2a34;background:#15151b;border-radius:9px;padding:14px;margin:14px 0}
  .top{display:flex;justify-content:space-between;align-items:center}.top h2{margin:0;font-size:14px;color:#f0abfc}.top span{color:#888;font-size:11px}
  .rule{color:#f4f4f5;line-height:1.45;margin:6px 0 10px}.rule b{color:#86efac}
  .row{display:flex;flex-wrap:wrap;gap:18px;align-items:flex-start}
  .pair{display:flex;gap:8px;align-items:center}.arrow{color:#67e8f9;font-size:16px}
  .cell .lbl{color:#889;font-size:10px;margin-bottom:3px}.test{padding-left:16px;border-left:2px dashed #3a3a44}
  table.grid{border-collapse:collapse;background:#111}table.grid td{width:13px;height:13px;padding:0;border:1px solid #4a4a4a}
  </style>
  <h1>Complex verified rules — containment · boolean · analogy</h1>
  <p class=lead>The hard ARC mechanics, each re-derived by the solver and uniquely reproducing the test. <b>Containment</b>: recolour objects by inside/outside a frame. <b>Boolean</b>: two divider-split panels → A XOR/AND/OR/SUB B. <b>Analogy</b>: infer the A→B transform from the demo panels, apply it to C. No quadrant; survives baseline-hard.</p>
  ${cards}`;
}

if (require.main === module) {
  const args = process.argv.slice(2), flag = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
  const out = flag("-o", "out/complex_showcase.html");
  fs.writeFileSync(out, build({ n: +flag("--n", 24), seed: +flag("--seed", 1) }));
  console.log("wrote " + out);
}
module.exports = { build };
