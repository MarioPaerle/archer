#!/usr/bin/env node
/* build_qwen_gallery.js — render a gallery of LLM(Qwen)-generated prodigy-tasks.
 *   node build_qwen_gallery.js out/qwen/qwen_tasks.jsonl  ->  out/qwen/qwen_gallery.html       */
const fs = require("fs"), path = require("path");
const E = require("./engine.js"), GIF = require("./gif.js");
const inFile = process.argv[2] || "out/qwen/qwen_tasks.jsonl";
const OUT = path.join(path.dirname(inFile), "qwen_gallery.html");
const esc = s => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const tasks = fs.readFileSync(inFile, "utf8").split("\n").filter(Boolean).map(l => JSON.parse(l));

function card(t, i) {
  let gif = "";
  try { const m = E.taskToMontage(t, { fps: 2 }); gif = "data:image/gif;base64," + Buffer.from(GIF.encodeGif({ frames: m.frames, palette: E.ARC_PALETTE, cell: 9, delayMs: 500 })).toString("base64"); }
  catch (e) { gif = ""; }
  const tmpl = (t.meta.template || "").replace(/^llm:/, "");
  const parts = tmpl.split("+");
  const dsl = (t.meta.dsl || "").trim();
  return `<figure class="card">
    ${gif ? `<img src="${gif}" alt="task ${i}">` : '<div class="noimg">render failed</div>'}
    <figcaption>
      <div class="rl">${esc(t.meta.rule)}</div>
      <div class="cmp">composed by Qwen: ${parts.map(p => `<b>${esc(p)}</b>`).join(" + ")}</div>
      <div class="meta">${t.examples.length} examples · d${t.meta.difficulty != null ? t.meta.difficulty : "?"} · ${t.width}×${t.height} · ${esc((t.meta.concepts || []).slice(0, 4).join(" "))}</div>
      <details><summary>DSL</summary><pre>${esc(dsl)}</pre></details>
    </figcaption></figure>`;
}

const cards = tasks.map(card).join("\n");
const html = `<!doctype html><html><head><meta charset="utf-8"><title>archer × Qwen — generated tasks</title><style>
:root{--bg:#0b0b0d;--card:#15151a;--ink:#ededed;--dim:#8a8a93;--pink:#ff5fae;--green:#9fe89f;--amber:#ffb14e;--blue:#7fd4ff;--line:#2a2a31}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:13px ui-monospace,Menlo,monospace;padding:28px}
h1{font-size:20px;color:var(--pink);margin:0 0 4px}.lead{color:var(--dim);max-width:1000px;line-height:1.6;margin:0 0 20px}.lead b{color:var(--ink)}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px}
.card{margin:0;background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px}
img{image-rendering:pixelated;width:100%;border:1px solid var(--line);border-radius:6px;background:#000}
.noimg{padding:40px;text-align:center;color:#ff5f5f;border:1px dashed var(--line);border-radius:6px}
figcaption{display:flex;flex-direction:column;gap:6px;margin-top:9px}
.rl{color:#e9e9ef;font-size:12.5px;line-height:1.4}.cmp{color:var(--blue);font-size:11px}.cmp b{color:var(--green);font-weight:600}
.meta{color:var(--dim);font-size:10.5px}details{font-size:11px}summary{color:var(--amber);cursor:pointer}pre{white-space:pre-wrap;color:#cfcfd6;background:#0d0d11;border:1px solid var(--line);border-radius:6px;padding:8px;margin:6px 0 0;font-size:10.5px;line-height:1.35}
</style></head><body>
<h1>archer × Qwen3-30B-A3B — generated tasks</h1>
<p class="lead"><b>${tasks.length} ARC-style tasks written by Qwen3-30B-A3B</b> (served with vLLM on 2×A100), each authored from a curated
function-menu and <b>verified by the GRIDVID engine</b> (coherence guard, zero-LLM) with a self-correcting retry loop. Every task is a
<b style="color:#9fe89f">novel composition</b> of primitives the model picked and combined — the rule + the composed building blocks +
the exact DSL Qwen wrote are shown below. Each panel: rows = example pairs + the held-out test, left = IN, right = OUT.</p>
<div class="grid">${cards}</div>
</body></html>`;
fs.writeFileSync(OUT, html);
console.log("wrote " + OUT + "  (" + tasks.length + " Qwen tasks)");
