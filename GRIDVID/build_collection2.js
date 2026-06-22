#!/usr/bin/env node
/* build_collection2.js — a second collection of hand-made tasks (new priors + a manual-mode example). */
const fs = require("fs"), path = require("path");
const E = require("./engine.js"), GIF = require("./gif.js");
const DIR = "scenes/collection2", OUT = "out/tasks_gallery";
const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const names = fs.readdirSync(DIR).filter(f => f.endsWith(".txt")).map(f => f.replace(".txt", "")).sort();

const cards = names.map(name => {
  const dsl = fs.readFileSync(path.join(DIR, name + ".txt"), "utf8");
  const t = E.buildTask(dsl, { examples: 3, seed0: 1 });
  const m = E.taskToMontage(t, { fps: 2 });
  const gif = "data:image/gif;base64," + Buffer.from(GIF.encodeGif({ frames: m.frames, palette: E.ARC_PALETTE, cell: 10, delayMs: 600 })).toString("base64");
  const v = t.meta.teaching;
  return { name, dsl, gif, rule: t.meta.rule, concepts: (t.meta.concepts || []).join(" · "),
    manual: t.meta.authored === "manual", diff: t.meta.difficulty,
    verdict: `teaching ${v.ok ? "✓" : "✗"} · variation ${v.distinctExamples}/${t.examples.length} ${v.examplesVary ? "✓" : "⚠"}` };
});

const body = cards.map(c => `
  <section class="card">
    <div class="head"><span class="name">${esc(c.name)}</span><span class="rule">${esc(c.rule)}</span>${c.manual ? '<span class="tag">MANUAL</span>' : ""}${c.diff != null ? `<span class="diff">diff ${c.diff}</span>` : ""}</div>
    <div class="cols">
      <img src="${c.gif}" alt="${esc(c.name)}">
      <div class="right"><pre class="dsl">${esc(c.dsl)}</pre><div class="meta">${esc(c.concepts)}<br>${c.verdict}</div></div>
    </div>
  </section>`).join("\n");

const html = `<!doctype html><html><head><meta charset="utf-8"><title>collection 2</title><style>
:root{--bg:#0c0c0e;--card:#16161a;--ink:#ececec;--dim:#8a8a92;--pink:#ff5fae;--line:#2a2a30}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:14px ui-monospace,Menlo,monospace;padding:28px}
h1{font-size:18px;color:var(--pink);margin:0 0 4px}.lead{color:var(--dim);max-width:880px;line-height:1.5;margin:0 0 20px}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:18px;margin-bottom:18px}
.head{display:flex;gap:12px;align-items:baseline;border-bottom:1px solid var(--line);padding-bottom:10px;margin-bottom:12px}
.name{color:var(--pink);font-weight:700}.rule{color:var(--dim);flex:1}.tag{color:#ffb14e;font-size:11px;border:1px solid #ffb14e;border-radius:4px;padding:1px 5px}.diff{color:#7fd4ff;font-size:12px}
.cols{display:grid;grid-template-columns:1fr 1fr;gap:18px;align-items:start}
img{image-rendering:pixelated;max-width:100%;border:1px solid var(--line);border-radius:6px;background:#000}
.right{display:flex;flex-direction:column;gap:10px}
pre.dsl{margin:0;background:#0a0a0c;border:1px solid var(--line);border-radius:8px;padding:13px;color:#cfe;font-size:12px;line-height:1.45;white-space:pre;overflow:auto;max-height:300px}
.meta{color:var(--dim);font-size:12px;line-height:1.6}
</style></head><body>
<h1>prodigy — collection 2</h1>
<p class="lead">A second batch: inside/outside, odd-one-out, gravity piling, double counting, selection-by-extreme, replication,
and a <b style="color:#ffb14e">MANUAL</b>-mode task whose examples are authored by hand (different shape & grid each) for genuine diversity.</p>
${body}
</body></html>`;
fs.writeFileSync(path.join(OUT, "collection2.html"), html);
console.log("wrote " + path.join(OUT, "collection2.html") + "  (" + cards.length + " tasks)");
