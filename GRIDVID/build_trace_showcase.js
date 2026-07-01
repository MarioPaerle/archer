#!/usr/bin/env node
/* build_trace_showcase.js — render the STEP-BY-STEP execution trace ("thinking-grids") of composed tasks:
 * IN → intermediate grid after each rule step → OUT, with the per-step NL. The step-by-step vehicle that
 * replaces GIFs for the solve tier (each intermediate grid is engine-verified).
 *   node build_trace_showcase.js <corpus.jsonl> -o out/trace.html --title "..."
 */
const fs = require("fs");
const PAL = ["#000000", "#1E93FF", "#F93C31", "#4FCC30", "#FFDC00", "#999999", "#E53AA3", "#FF851B", "#87D8F1", "#921231"];
const esc = s => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const grid = g => `<table class=grid>${g.map(r => `<tr>${r.map(v => `<td style="background:${PAL[v] || "#000"}"></td>`).join("")}</tr>`).join("")}</table>`;

function card(t) {
  const m = t.meta, tr = m.trace || [];
  const steps = tr.map((s, i) => `<div class=step>
      <div class=slbl>${i === 0 ? "INPUT" : "step " + s.step + " · " + esc(s.op)}</div>
      ${grid(s.grid)}
      <div class=snl>${esc(s.nl || "")}</div></div>`).join(`<div class=arrow>▶</div>`);
  return `<section class=card>
    <div class=top><h2>${esc(m.program && m.program.nl || m.rule || "")}</h2>
      <span class=dsl>${esc(m.program && m.program.dsl_text || "")}</span></div>
    <div class=trace>${steps}</div>
  </section>`;
}

const args = process.argv.slice(2), flag = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const file = args.find(a => a.endsWith(".jsonl"));
const tasks = fs.readFileSync(file, "utf8").trim().split("\n").filter(Boolean).map(JSON.parse).filter(t => t.meta && t.meta.trace);
const title = flag("--title", "Step-by-step execution trace (thinking-grids)");
const html = `<!doctype html><meta charset=utf-8><title>${esc(title)}</title><style>
body{margin:0;background:#0b0b0f;color:#ececf1;font:13px ui-monospace,Menlo,monospace;padding:24px}
h1{margin:0 0 4px;color:#67e8f9;font-size:22px}.lead{color:#aab;max-width:1100px;line-height:1.55;margin:0 0 16px}
.card{border:1px solid #2a2a34;background:#15151b;border-radius:9px;padding:14px;margin:14px 0}
.top h2{margin:0;font-size:13px;color:#a7f3d0}.dsl{color:#fde68a;font-size:11px}
.trace{display:flex;flex-wrap:wrap;gap:6px;align-items:flex-start;margin-top:12px}
.step{display:flex;flex-direction:column;align-items:center;gap:4px;max-width:180px}
.slbl{color:#67e8f9;font-size:10px}.snl{color:#9aa;font-size:10px;text-align:center;line-height:1.3}
.arrow{color:#4a4a55;align-self:center;font-size:14px;padding-top:20px}
table.grid{border-collapse:collapse;background:#111}table.grid td{width:11px;height:11px;padding:0;border:1px solid #3a3a3a}
</style>
<h1>${esc(title)}</h1>
<p class=lead>Each row is the <b>step-by-step solve</b> of one task: INPUT → the grid after each rule step (the "thinking-grids") → OUTPUT, with the per-step natural-language reasoning. Every intermediate grid is produced by the engine executing the program — verifiable, not a guess. This is the executable chain-of-thought that replaces GIFs for the solve tier.</p>
${tasks.map(card).join("\n")}`;
const out = flag("-o", "out/trace.html");
fs.mkdirSync(require("path").dirname(out), { recursive: true });
fs.writeFileSync(out, html);
console.log("wrote " + out + " (" + tasks.length + " tasks with traces)");
