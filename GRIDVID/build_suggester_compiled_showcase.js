#!/usr/bin/env node
/* build_suggester_compiled_showcase.js — PAN-176 acceptance showcase.
 * Renders ≥20 super-suggester slices, EACH with its compiled+validated prodigy-task
 * grids drawn inline (or an honest PLANNED badge), proving the slice→real-task wiring.
 *   node build_suggester_compiled_showcase.js -o out/suggester_compiled_showcase.html
 */
const fs = require("fs");
const SS = require("./super_suggester.js");
const C = require("./suggester_compile.js");

const PAL = ["#101014", "#0074D9", "#FF4136", "#2ECC40", "#FFDC00", "#AAAAAA", "#F012BE", "#FF851B", "#7FDBFF", "#870C25"];
const esc = s => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
function grid(g, cell = 11) {
  if (!g) return "";
  const rows = g.map(row => `<tr>${row.map(v => `<td style="background:${PAL[v] || "#000"}"></td>`).join("")}</tr>`).join("");
  return `<table class=grid style="--c:${cell}px">${rows}</table>`;
}
function pair(task, which) {
  const e = which === "test" ? { in: task.in, out: task.out } : task.examples[which];
  return `<div class=pair><div><div class=lbl>IN</div>${grid(e.in[0])}</div><div class=arrow>→</div><div><div class=lbl>OUT</div>${grid(e.out[0])}</div></div>`;
}

function build(opts = {}) {
  const seed = opts.seed || 1, want = opts.n || 24;
  const sug = SS.suggestTasks({ seed, count: want }).records;
  const cards = sug.map((s, i) => {
    const c = C.compile(s, { seed: seed * 100 + i });
    const chk = C.instantiationCheck(c);
    const badge = c.compilable
      ? (c.validated ? `<span class="badge ok">COMPILED ✓ ${esc(c.via)}:${esc(c.realization)} · ${esc(c.dims)}</span>` : `<span class="badge warn">COMPILED, validation failed</span>`)
      : `<span class="badge plan">PLAN ONLY</span>`;
    const fns = s.dsl_suggestions.functions.map(f => `<code>${esc(f.name)}</code>`).join(" + ");
    const grids = (c.compilable && c.task)
      ? `<div class=grids>${c.task.examples.slice(0, 1).map((_, k) => pair(c.task, k)).join("")}${pair(c.task, "test")}</div>`
      : `<div class=planned>${esc(c.reason)}</div>`;
    return `<section class=card>
      <div class=top><h2>${esc(s.unique_code)}</h2>${badge}</div>
      <div class=meta>driver <code>${esc(c.driver_schema)}</code> · slice ${fns} · difficulty ${esc(s.difficulty)} · depth ${esc(s.depth)}</div>
      <p class=rule>${esc(s.rule_description)}</p>
      ${grids}
      <div class="chk ${chk.ok ? "ok" : "bad"}">instantiation: ${esc(chk.note)}</div>
    </section>`;
  }).join("\n");
  const nOk = sug.map((s, i) => C.compile(s, { seed: seed * 100 + i })).filter(c => c.compilable && c.validated).length;
  return `<!doctype html><meta charset=utf-8><title>GRIDVID super-suggester → compiled tasks (PAN-176)</title><style>
  body{margin:0;background:#0b0b0f;color:#ececf1;font:13px ui-monospace,Menlo,monospace;padding:24px}
  h1{margin:0 0 4px;color:#67e8f9;font-size:22px}.lead{color:#aab;max-width:1000px;line-height:1.5;margin:0 0 18px}
  .card{border:1px solid #2a2a34;background:#15151b;border-radius:9px;padding:14px;margin:16px 0}
  .top{display:flex;align-items:center;justify-content:space-between;gap:10px}.top h2{margin:0;font-size:15px;color:#93c5fd}
  .meta{color:#9aa;margin:4px 0 6px}.rule{color:#f4f4f5;line-height:1.45;margin:6px 0 10px}
  code{color:#fde68a}.badge{font-size:11px;padding:3px 8px;border-radius:20px;white-space:nowrap}
  .badge.ok{background:#06371f;color:#86efac;border:1px solid #14502f}.badge.plan{background:#3a2a06;color:#fcd34d;border:1px solid #5a4310}.badge.warn{background:#3a1206;color:#fca5a5;border:1px solid #5a1d10}
  .grids{display:flex;flex-wrap:wrap;gap:22px;align-items:flex-start;margin:6px 0}
  .pair{display:flex;gap:8px;align-items:center}.arrow{color:#67e8f9;font-size:18px}.lbl{color:#889;font-size:10px;margin-bottom:2px}
  table.grid{border-collapse:collapse;border:1px solid #333}table.grid td{width:var(--c);height:var(--c);padding:0}
  .planned{color:#fcd34d;background:#1c1708;border:1px dashed #5a4310;border-radius:6px;padding:8px}
  .chk{margin-top:8px;font-size:11px}.chk.ok{color:#86efac}.chk.bad{color:#fca5a5}
  </style>
  <h1>Super-suggester → compiled, validated tasks</h1>
  <p class=lead>PAN-176: each typed DSL slice is COMPILED to a real engine-validated <code>prodigy-task</code> (object-level program.js or a gen_hard family) and its grids drawn inline. Honest coverage — slices with no current realisation show a <b>PLAN ONLY</b> badge and the reason, instead of the old blanket "not validated". ${nOk}/${sug.length} compiled+validated.</p>
  ${cards}`;
}

if (require.main === module) {
  const args = process.argv.slice(2), flag = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
  const out = flag("-o", "out/suggester_compiled_showcase.html"), html = build({ n: +flag("--n", 24), seed: +flag("--seed", 1) });
  fs.writeFileSync(out, html);
  console.log("wrote " + out + " (" + (html.match(/class=card/g) || []).length + " cards)");
}
module.exports = { build };
