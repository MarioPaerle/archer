#!/usr/bin/env node
/* build_haiku2.js — SECOND small-model test. This run explicitly taught the lesson from round 1
 * ("vary every non-rule feature") and asked for 3 tasks.  -> out/tasks_gallery/haiku2.html */
const fs = require("fs"), path = require("path");
const E = require("./engine.js"), GIF = require("./gif.js");

const SCENES = ["move_to_corner", "copy_and_shift", "remove_smallest"];
const OUT = "out/tasks_gallery";
const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const cards = SCENES.map(name => {
  const dsl = fs.readFileSync(path.join("scenes/haiku2", name + ".txt"), "utf8");
  let gif = null, verdict;
  try {
    const t = E.buildTask(dsl, { examples: 3, augment: false });
    const v = t.meta.teaching;
    const m = E.taskToMontage(t, { fps: 2 });
    gif = "data:image/gif;base64," + Buffer.from(GIF.encodeGif({ frames: m.frames, palette: E.ARC_PALETTE, cell: 12, delayMs: 600 })).toString("base64");
    verdict = `parsed ✓ &nbsp;·&nbsp; teaching ${v.ok ? "✓" : "✗"} &nbsp;·&nbsp; per-example variation ${v.distinctExamples}/${t.examples.length} ${v.examplesVary ? '<b style="color:#9fe89f">✓ (randomized — lesson learned)</b>' : '<b style="color:#ffb14e">⚠ weak</b>'}`;
  } catch (e) { verdict = '<b style="color:#ff5f5f">PARSE ERROR — ' + esc(e.message.split("\n")[1] ? e.message.split("\n")[1].trim() : e.message.split("\n")[0]) + '</b> &nbsp;(named its body <code>shape</code>, a reserved selector word, and wrote <code>to by</code> — invalid syntax)'; }
  return { name, dsl, gif, verdict };
});

const body = cards.map(c => `
  <section class="card">
    <div class="head"><span class="name">${esc(c.name)}</span></div>
    <div class="cols">
      ${c.gif ? `<img src="${c.gif}" alt="${esc(c.name)}">` : '<div class="err">— did not render —</div>'}
      <pre class="dsl">${esc(c.dsl)}</pre>
    </div>
    <div class="verdict">${c.verdict}</div>
  </section>`).join("\n");

const html = `<!doctype html><html><head><meta charset="utf-8"><title>Haiku v2 — DSL test</title><style>
:root{--bg:#0c0c0e;--card:#16161a;--ink:#ececec;--dim:#8a8a92;--pink:#ff5fae;--line:#2a2a30}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:14px ui-monospace,Menlo,monospace;padding:28px}
h1{font-size:18px;color:var(--pink);margin:0 0 4px}.lead{color:var(--dim);max-width:900px;line-height:1.55;margin:0 0 18px}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:18px;margin-bottom:18px}
.head{border-bottom:1px solid var(--line);padding-bottom:9px;margin-bottom:12px}.name{color:var(--pink);font-weight:700}
.cols{display:grid;grid-template-columns:1fr 1fr;gap:18px;align-items:start}.err{color:#ff8f8f;padding:30px;text-align:center}
img{image-rendering:pixelated;max-width:100%;border:1px solid var(--line);border-radius:6px;background:#000}
pre.dsl{margin:0;background:#0a0a0c;border:1px solid var(--line);border-radius:8px;padding:14px;color:#cfe;font-size:12.5px;line-height:1.5;white-space:pre;overflow:auto}
.verdict{margin-top:12px;color:var(--dim);font-size:13px;border-top:1px dashed var(--line);padding-top:10px}code{color:#ffd28a}
</style></head><body>
<h1>can a small model use the DSL? — Claude Haiku, round 2</h1>
<p class="lead">Round 1 found Haiku leaving fixed positions (identical examples). This round the prompt explicitly taught the lesson —
<i>every non-rule feature must vary; use random / color rand / rand sizes</i> — and asked for 3 tasks. Result: Haiku
<b style="color:#9fe89f">randomized everything</b> (variation ✓ on all), so the guidance works. It still hit one DSL footgun:
naming a body <code>shape</code> (a reserved selector word) plus inventing <code>to by</code> syntax — that scene fails to parse.
2 of 3 are valid, varied tasks; the failure is an informative edge case (a lint could rename reserved-word ids).</p>
${body}
</body></html>`;
fs.writeFileSync(path.join(OUT, "haiku2.html"), html);
console.log("wrote " + path.join(OUT, "haiku2.html"));
