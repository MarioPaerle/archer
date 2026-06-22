#!/usr/bin/env node
/* build_tasks_html.js — for each task template render a NORMAL instance and a WILD-augmented instance,
 * with the DSL source and the DSL internal representation. Self-contained HTML.
 *   node build_tasks_html.js  ->  out/tasks_gallery/index.html (+ .task.json truths)
 * The JSON files are the dataset truth; the GIFs/HTML are only for the eye.        */
const fs = require("fs");
const path = require("path");
const E = require("./engine.js");
const GIF = require("./gif.js");

const SCENES = ["extract_red", "gravity_settle", "mirror_complete", "copy_paint", "find_error", "reconstruct", "denoise", "count_bar", "fill_grid", "turtle_path", "framed_grid", "composition", "compare", "graph_paper", "irregular_grid", "double_it", "shrink_it", "spill_pool"];
const CELL = 8;                          // smaller cells → lighter GIFs
const OUT = "out/tasks_gallery";
fs.mkdirSync(OUT, { recursive: true });

const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const gifOf = task => { const m = E.taskToMontage(task, { fps: 2 }); return "data:image/gif;base64," + Buffer.from(GIF.encodeGif({ frames: m.frames, palette: E.ARC_PALETTE, cell: CELL, delayMs: 600 })).toString("base64"); };
const cards = [];

for (const name of SCENES) {
  const dsl = fs.readFileSync(path.join("scenes/tasks", name + ".txt"), "utf8");
  const norm = E.buildTask(dsl, { examples: 3, seed0: 1 });
  const wild = E.buildTask(dsl, { examples: 3, seed0: 1, wild: true });
  fs.writeFileSync(path.join(OUT, `${name}.task.json`), JSON.stringify(norm));
  const rep = norm.meta.representation;
  cards.push({
    name, rule: norm.meta.rule || "", dsl, vary: norm.meta.vary_axes || [],
    rep: { inN: rep.in_objects.length, outN: rep.out_objects.length, sample: rep.in_objects.slice(0, 4).map(o => `${o.kind}/c${o.color}@${o.r},${o.c}`) },
    views: [
      { tag: "normal", gif: gifOf(norm), applied: norm.meta.augment_applied, ok: norm.meta.teaching.ok },
      { tag: "wild", gif: gifOf(wild), applied: wild.meta.augment_applied, ok: wild.meta.teaching.ok },
    ],
  });
}

const body = cards.map(c => `
  <section class="card">
    <div class="head"><span class="name">${esc(c.name)}</span><span class="rule">${esc(c.rule)}</span><span class="vary">vary: ${esc(c.vary.join(" ") || "—")}</span></div>
    <div class="cols">
      <div class="gifs">
        ${c.views.map(v => `<figure>
          <img src="${v.gif}" alt="${esc(c.name)} ${v.tag}">
          <figcaption><b class="${v.tag}">${v.tag}</b> · aug: ${esc(v.applied.join("+") || "none")} · ${v.ok ? "teaching ✓" : "<b style=color:#ff5f5f>NO</b>"}</figcaption>
        </figure>`).join("\n")}
      </div>
      <div class="right">
        <pre class="dsl">${esc(c.dsl)}</pre>
        <div class="rep"><b>internal representation</b> (in JSON, pre-aug):<br>${c.rep.inN} objects in IN → ${c.rep.outN} in OUT<br><span class="dim">${esc(c.rep.sample.join(" · "))}${c.rep.inN > 4 ? " · …" : ""}</span></div>
      </div>
    </div>
  </section>`).join("\n");

const html = `<!doctype html><html><head><meta charset="utf-8"><title>prodigy tasks</title><style>
:root{--bg:#0c0c0e;--card:#16161a;--ink:#ececec;--dim:#8a8a92;--pink:#ff5fae;--line:#2a2a30}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:14px ui-monospace,"Space Mono",Menlo,monospace;padding:28px}
h1{font-size:18px;color:var(--pink);letter-spacing:1px;margin:0 0 4px}
.lead{color:var(--dim);margin:0 0 22px;max-width:860px;line-height:1.5}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:18px;margin-bottom:18px}
.head{display:flex;align-items:baseline;gap:14px;margin-bottom:12px;border-bottom:1px solid var(--line);padding-bottom:10px}
.name{color:var(--pink);font-weight:700}.rule{color:var(--dim);flex:1}.vary{color:#7fd4ff;font-size:12px}
.cols{display:grid;grid-template-columns:1fr 420px;gap:18px;align-items:start}
.gifs{display:flex;flex-direction:column;gap:14px}
figure{margin:0}img{image-rendering:pixelated;max-width:100%;border:1px solid var(--line);border-radius:6px;background:#000}
figcaption{color:var(--dim);font-size:12px;margin-top:6px}b.normal{color:#9fe89f}b.wild{color:#ffb14e}
.right{display:flex;flex-direction:column;gap:10px}
pre.dsl{margin:0;background:#0a0a0c;border:1px solid var(--line);border-radius:8px;padding:14px;color:#cfe;font-size:12px;line-height:1.45;overflow:auto;white-space:pre}
.rep{background:#0a0a0c;border:1px solid var(--line);border-radius:8px;padding:12px;font-size:12px;color:#bdbdc6;line-height:1.5}.rep .dim{color:var(--dim)}
.legend{color:var(--dim);font-size:12px;margin-top:6px}
</style></head><body>
<h1>prodigy — task gallery</h1>
<p class="lead">Each task is a <b>(EXAMPLES, IN, OUT)</b> triple; the JSON is the truth. A montage <b>row = [IN | OUT]</b>:
top rows = demonstration EXAMPLES (same hidden rule, different instance), last row = held-out test.
Per template: a <b class="normal">normal</b> and a <b class="wild">wild</b> (all rule-safe axes) augmentation, the DSL source, and the
DSL <b>internal representation</b> now embedded in the JSON (objects the simulator knows, for a grid→representation head).</p>
${body}
<p class="legend">build_tasks_html.js · ${cards.length} templates · normal + wild · cell=${CELL}px · .task.json truths in ${OUT}/</p>
</body></html>`;

fs.writeFileSync(path.join(OUT, "index.html"), html);
console.log("wrote " + path.join(OUT, "index.html") + "  (" + cards.length + " tasks, normal+wild)");
