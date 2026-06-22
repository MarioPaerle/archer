#!/usr/bin/env node
/* build_haiku_html.js — show how a SMALL model (Claude Haiku) used the gridvid DSL: its understanding,
 * the task scenes it authored, the rendered result, and an automatic verdict.  -> out/tasks_gallery/haiku.html */
const fs = require("fs"), path = require("path");
const E = require("./engine.js"), GIF = require("./gif.js");

const UNDERSTANDING = "The count_bar task teaches cardinality mapping: given a set of coloured cells, output a horizontal bar whose length equals the count. The count must vary per example because `scatter rand 2 7` places a random number of cells (2-7) on each seed run, forcing the learner to discover the counting relationship rather than memorize a fixed bar length.";
const SCENES = ["recolor_largest", "gravity_stack"];
const OUT = "out/tasks_gallery";
const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const cards = SCENES.map(name => {
  const dsl = fs.readFileSync(path.join("scenes/haiku", name + ".txt"), "utf8");
  let gif = null, verdict, ok = false;
  try {
    const t = E.buildTask(dsl, { examples: 3, augment: false });
    const distinct = new Set(t.examples.map(e => JSON.stringify(e.in[e.in.length - 1]))).size;
    const m = E.taskToMontage(t, { fps: 2 });
    gif = "data:image/gif;base64," + Buffer.from(GIF.encodeGif({ frames: m.frames, palette: E.ARC_PALETTE, cell: 12, delayMs: 600 })).toString("base64");
    ok = t.meta.teaching.ok;
    verdict = `parsed ✓ &nbsp;·&nbsp; teaching ${ok ? "✓" : "✗"} &nbsp;·&nbsp; per-example variation ${distinct}/${t.examples.length} ${distinct < t.examples.length ? '<b style="color:#ffb14e">⚠ weak — examples identical (fixed positions; non-rule features not varied)</b>' : "✓"}`;
  } catch (e) { verdict = '<b style="color:#ff5f5f">PARSE ERROR: ' + esc(e.message.split("\n")[0]) + "</b>"; }
  return { name, dsl, gif, verdict };
});

const body = cards.map(c => `
  <section class="card">
    <div class="head"><span class="name">${esc(c.name)}</span></div>
    <div class="cols">
      ${c.gif ? `<img src="${c.gif}" alt="${esc(c.name)}">` : '<div class="err">did not render</div>'}
      <pre class="dsl">${esc(c.dsl)}</pre>
    </div>
    <div class="verdict">${c.verdict}</div>
  </section>`).join("\n");

const html = `<!doctype html><html><head><meta charset="utf-8"><title>Haiku uses the DSL</title><style>
:root{--bg:#0c0c0e;--card:#16161a;--ink:#ececec;--dim:#8a8a92;--pink:#ff5fae;--line:#2a2a30}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:14px ui-monospace,Menlo,monospace;padding:28px}
h1{font-size:18px;color:var(--pink);margin:0 0 4px}.lead{color:var(--dim);max-width:880px;line-height:1.55;margin:0 0 18px}
.note{background:#16161a;border:1px solid var(--line);border-left:3px solid var(--pink);border-radius:8px;padding:14px;margin:0 0 22px;color:#d7d7de;line-height:1.55}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:18px;margin-bottom:18px}
.head{border-bottom:1px solid var(--line);padding-bottom:9px;margin-bottom:12px}.name{color:var(--pink);font-weight:700}
.cols{display:grid;grid-template-columns:1fr 1fr;gap:18px;align-items:start}
img{image-rendering:pixelated;max-width:100%;border:1px solid var(--line);border-radius:6px;background:#000}
pre.dsl{margin:0;background:#0a0a0c;border:1px solid var(--line);border-radius:8px;padding:14px;color:#cfe;font-size:12.5px;line-height:1.5;white-space:pre;overflow:auto}
.verdict{margin-top:12px;color:var(--dim);font-size:13px;border-top:1px dashed var(--line);padding-top:10px}
</style></head><body>
<h1>can a small model use the DSL? — Claude Haiku</h1>
<p class="lead">Haiku was given the grammar + 4 example tasks and asked to (1) explain a task and (2) author two NEW tasks in the DSL.
No tools, just text. Below: its scenes, rendered by the real engine, with an automatic verdict (does it parse? teach? vary per example?).</p>
<div class="note"><b style="color:#9fe89f">Haiku's understanding of count_bar:</b><br>${esc(UNDERSTANDING)}</div>
${body}
<p class="lead">Takeaway: both scenes <b>parse and teach</b> — a 30B-class model can read and write this DSL. But Haiku left
<b>gravity_stack</b> with fixed positions, so every example is identical (memorizable). That's the exact failure mode the
generator guidance targets: <i>vary every feature that is not the rule</i>. A lint/auto-fix could catch it.</p>
</body></html>`;
fs.writeFileSync(path.join(OUT, "haiku.html"), html);
console.log("wrote " + path.join(OUT, "haiku.html"));
