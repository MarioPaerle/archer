#!/usr/bin/env node
/* build_haiku_showcase.js — show the FULL chain per task: the model's spec line ("prompt"), the menu
 * SUGGESTION it picked, the compiled DSL (kind + solver-verified rule), and the rendered grids.
 *   node build_haiku_showcase.js specs.txt -o out/haiku.html --seed 11 --title "..."
 */
const fs = require("fs");
const G = require("./gridgen.js");
const PAL = ["#000000", "#1E93FF", "#F93C31", "#4FCC30", "#FFDC00", "#999999", "#E53AA3", "#FF851B", "#87D8F1", "#921231"];
const esc = s => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const grid = g => `<table class=grid>${g.map(r => `<tr>${r.map(v => `<td style="background:${PAL[v] || "#000"}"></td>`).join("")}</tr>`).join("")}</table>`;
const pairBox = (e, label) => `<div class=pair><div class=cell><div class=lbl>${label} in</div>${grid(e.in[0])}</div><div class=arrow>→</div><div class=cell><div class=lbl>${label} out</div>${grid(e.out[0])}</div></div>`;

function build(specFile, seed, title) {
  const lines = fs.readFileSync(specFile, "utf8").split("\n").map(l => l.replace(/^\s*[-*\d.)]+\s*/, "").trim()).filter(l => /^task\s+\S/i.test(l));
  const cards = lines.map((line, i) => {
    const family = line.split(/\s+/)[1], reg = G.REG[family], suggestion = reg ? reg.desc : "(unknown family)";
    const r = G.compileSpec(line, seed * 100 + i);
    if (!r.ok) return `<section class=card><div class=chain><div class=row><span class=k>model wrote</span><code>${esc(line)}</code></div><div class=row><span class=k>menu suggestion</span><span class=sugg>${esc(suggestion)}</span></div><div class="row err">✗ ${esc(r.error)}</div></div></section>`;
    const t = r.task, dsl = t.meta.kind || t.meta.template || family, rule = (t.meta.solver && t.meta.solver.rule) || t.meta.rule || "";
    const grids = `<div class=grids>${t.examples.slice(0, 2).map((e, k) => pairBox(e, "ex" + (k + 1))).join("")}${pairBox({ in: t.in, out: t.out }, "TEST")}</div>`;
    return `<section class=card>
      <div class=chain>
        <div class=row><span class=k>model wrote</span><code>${esc(line)}</code></div>
        <div class=row><span class=k>menu suggestion</span><span class=sugg>${esc(suggestion)}</span></div>
        <div class=row><span class=k>compiled DSL</span><span class=dsl>${esc(dsl)}</span></div>
        <div class=row><span class=k>solver rule</span><span class=rule>${esc(rule)}</span></div>
      </div>
      ${grids}
    </section>`;
  }).join("\n");
  const okN = lines.filter((line, i) => G.compileSpec(line, seed * 100 + i).ok).length;
  return `<!doctype html><meta charset=utf-8><title>${esc(title)}</title><style>
  body{margin:0;background:#0b0b0f;color:#ececf1;font:13px ui-monospace,Menlo,monospace;padding:24px}
  h1{margin:0 0 4px;color:#67e8f9;font-size:21px}.lead{color:#aab;max-width:1060px;line-height:1.5;margin:0 0 16px}
  .card{border:1px solid #2a2a34;background:#15151b;border-radius:9px;padding:14px;margin:14px 0}
  .chain{margin-bottom:10px}.row{display:flex;gap:10px;align-items:baseline;margin:3px 0}
  .k{color:#7c7c8a;min-width:120px;text-align:right;font-size:11px;text-transform:uppercase;letter-spacing:.5px}
  code{color:#fde68a;background:#211d12;padding:1px 7px;border-radius:5px}
  .sugg{color:#c4b5fd}.dsl{color:#67e8f9}.rule{color:#86efac}.err{color:#fca5a5}
  .grids{display:flex;flex-wrap:wrap;gap:18px;align-items:flex-start}
  .pair{display:flex;gap:8px;align-items:center}.arrow{color:#67e8f9;font-size:16px}
  .cell .lbl{color:#889;font-size:10px;margin-bottom:3px}
  table.grid{border-collapse:collapse;background:#111}table.grid td{width:12px;height:12px;padding:0;border:1px solid #4a4a4a}
  </style>
  <h1>${esc(title)}</h1>
  <p class=lead>${okN}/${lines.length} compiled & verified. Each card: <b style="color:#fde68a">what the model wrote</b> (its DSL choice) → <b style="color:#c4b5fd">the menu suggestion</b> it picked → <b style="color:#67e8f9">the compiled DSL</b> the engine instantiated → <b style="color:#86efac">the solver-verified rule</b>. The model only chooses; coherence & solvability are the engine's job.</p>
  ${cards}`;
}

if (require.main === module) {
  const args = process.argv.slice(2), flag = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
  const specFile = args.find(a => !a.startsWith("-") && a !== flag("-o") && a !== flag("--title") && a !== flag("--seed"));
  const out = flag("-o", "out/haiku.html"), seed = +flag("--seed", 11), title = flag("--title", "Model-authored, engine-verified");
  fs.writeFileSync(out, build(specFile, seed, title)); console.log("wrote " + out);
}
module.exports = { build };
