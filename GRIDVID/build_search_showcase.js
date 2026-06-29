#!/usr/bin/env node
/* build_search_showcase.js — render gen_search's CERTIFIED tasks as an ARC-gridline gallery.
 * Each card shows the sampled program, the SEARCH-verified minimal depth, obsNeeded (under-determination),
 * the difficulty score, and the search's own prediction overlaid on the held-out test (must match OUT).
 *   node build_search_showcase.js -o out/search_showcase.html --n 16 --depth 3
 */
const fs = require("fs");
const path = require("path");
const G = require("./gen_search.js");
const U = require("./gen_underdetermined.js");
const A = require("./arc_search.js");

const PAL = ["#000000", "#1E93FF", "#F93C31", "#4FCC30", "#FFDC00", "#999999", "#E53AA3", "#FF851B", "#87D8F1", "#921231"];
const esc = s => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const eqG = (a, b) => a && b && a.length === b.length && a[0].length === b[0].length && a.every((r, i) => r.every((x, j) => x === b[i][j]));
const grid = g => `<table class=grid>${g.map(r => `<tr>${r.map(v => `<td style="background:${PAL[v] || "#000"}"></td>`).join("")}</tr>`).join("")}</table>`;
const pairBox = (inG, outG, label, cls = "") => `<div class="pair ${cls}"><div class=cell><div class=lbl>${label} in</div>${grid(inG)}</div><div class=arrow>→</div><div class=cell><div class=lbl>${label} out</div>${grid(outG)}</div></div>`;

function build(n, depth, seed, mode) {
  const r = mode === "under" ? U.generate(n, { seed }) : G.generate(n, { seed, depth });
  const cards = r.tasks.map((t, idx) => {
    const d = t.meta.difficulty;
    const s = A.solveTask(t, { maxDepth: Math.max(3, depth) });
    const matched = s.prediction && eqG(s.prediction, t.out[0]);
    const exHtml = t.examples.map((e, i) => pairBox(e.in[0], e.out[0], "ex" + (i + 1))).join("");
    const testHtml = pairBox(t.in[0], t.out[0], "TEST", "test");
    const predHtml = `<div class=cell><div class=lbl>search prediction ${matched ? "✓" : "✗ MISMATCH"}</div>${grid(s.prediction || [[0]])}</div>`;
    return `<section class=card>
      <div class=top><h2>#${idx + 1} &nbsp; ${esc(t.meta.sampledProgram)}</h2>
        <span>depth <b>${d.depth}</b> · obs <b>${d.obsNeeded}</b> · score <b>${d.score}</b> · ${d.unique ? "unique" : "AMBIG"}</span></div>
      <div class=row>${exHtml}<div class=testwrap>${testHtml}${predHtml}</div></div>
    </section>`;
  }).join("\n");
  const obsHist = {}; for (const t of r.tasks) { const o = t.meta.difficulty.obsNeeded; obsHist[o] = (obsHist[o] || 0) + 1; }
  return `<!doctype html><meta charset=utf-8><title>gen_search — certified hard tasks</title><style>
  body{margin:0;background:#0b0b0f;color:#ececf1;font:13px ui-monospace,Menlo,monospace;padding:24px}
  h1{margin:0 0 4px;color:#67e8f9;font-size:22px}.lead{color:#aab;max-width:1100px;line-height:1.55;margin:0 0 16px}
  .lead b{color:#a7f3d0}
  .card{border:1px solid #2a2a34;background:#15151b;border-radius:9px;padding:14px;margin:14px 0}
  .top{display:flex;justify-content:space-between;align-items:center;gap:16px}.top h2{margin:0;font-size:13px;color:#a7f3d0}
  .top span{color:#9aa;font-size:11px;white-space:nowrap}.top b{color:#fde68a}
  .row{display:flex;flex-wrap:wrap;gap:18px;align-items:flex-start;margin-top:10px}
  .pair{display:flex;gap:8px;align-items:center}.arrow{color:#67e8f9;font-size:16px}
  .cell .lbl{color:#889;font-size:10px;margin-bottom:3px}
  .testwrap{display:flex;gap:18px;align-items:flex-start;padding-left:16px;border-left:2px dashed #3a3a44}
  table.grid{border-collapse:collapse;background:#111}table.grid td{width:13px;height:13px;padding:0;border:1px solid #4a4a4a}
  </style>
  <h1>gen_search — program-first, SEARCH-verified hard tasks</h1>
  <p class=lead>${r.tasks.length} tasks (yield <b>${(r.yield * 100).toFixed(0)}%</b>, ${r.attempts} attempts). Each is a sampled depth-${depth} compositional program kept ONLY because <b>arc_search</b> certified it <b>hard-valid</b>:
  minimal solving depth ≥3 (no shorter program fits — proven by the search), a UNIQUE determined test answer, and reproducible. <b>obsNeeded</b> = how many train pairs the rule needs to be pinned (≥3 ⇒ genuinely under-determined). obs histogram: ${esc(JSON.stringify(obsHist))}. The right-most grid is the search's OWN prediction on the held-out test — it must equal TEST out.</p>
  ${cards}`;
}

if (require.main === module) {
  const args = process.argv.slice(2), flag = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
  const out = flag("-o", "out/search_showcase.html"), n = +flag("--n", 16), depth = +flag("--depth", 3), seed = +flag("--seed", 7), mode = flag("--mode", "comp");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, build(n, depth, seed, mode));
  console.log("wrote " + out);
}
module.exports = { build };
