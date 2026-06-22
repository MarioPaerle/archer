#!/usr/bin/env node
/* build_showcase_v2.js — 14 HARD tasks authored by a well-instructed Claude Haiku, each wild-augmented.
 * Honest verdicts (parse / teaching / variation). -> out/tasks_gallery/showcase_v2.html
 * (Haiku wrote each scene on one line with ' / ' separators; we split them into commands.)               */
const fs = require("fs"), path = require("path");
const E = require("./engine.js"), GIF = require("./gif.js");
const OUT = "out/tasks_gallery";
const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Haiku wrote 14; 3 were structurally-valid but SEMANTICALLY broken (auto-check can't catch that) and were
// hand-dropped: rotation_and_extract (1 object → extract no-op, square rotation invisible),
// gravity_stack_sort (gravity then sort_rows-by-bg = meaningless), gravity_then_recolor (recolor-all erases info).
const RAW = [
  ["mirror_symmetry_fill", "rule mirror the pattern downward across the horizontal axis / concept mirror symmetry / difficulty 0.68 / vary color shift zoom / grid 16 12 / bg 0 / seed 2 / spawn Lshape rand 3 4 random 1 1 4 6 color rand 2 6 id pat / hold 1 / cut / mirror pat axis h gap 1 / snap 1"],
  ["reconstruction_disc", "rule restore the broken disc by filling missing cells / concept reconstruction / difficulty 0.65 / vary flip rot color zoom / grid 11 11 / bg 0 / seed 4 / spawn disc 4 random 2 2 8 8 color 5 id circ / break circ cells 5 / hold 1 / cut / repair / snap 1"],
  ["lattice_completion", "rule complete the lattice grid by filling all holes / concept grid holes fill / difficulty 0.62 / vary flip rot color / grid 13 13 / bg 0 / seed 5 / lattice 3 4 cell 2 gap 1 color 4 holes 4 / hold 1 / cut / fill / snap 1"],
  ["copy_and_tile", "rule copy the shape along a diagonal / concept copy tile / difficulty 0.70 / vary color shift zoom / grid 12 12 / bg 0 / seed 6 / spawn rect 2 3 random 1 1 5 4 color rand 3 7 id tile / hold 1 / cut / copy tile by 2 2 times 2 2 2 / snap 1"],
  ["fluid_pour_pool", "rule water spills and pools around the barrier / concept fluid physics / difficulty 0.68 / vary color / grid 15 16 / bg 0 / walls floor / seed 7 / spawn square 3 random 6 5 10 11 color 1 id wall / spill at 0 8 color 3 rate 3 / run 4 / cut / run 18"],
  ["color_remap_grid", "rule remap colours of the whole grid by a fixed map / concept grid map / difficulty 0.60 / vary shift / grid 10 10 / bg 0 / seed 8 / scatter rand 6 12 color rand 2 4 box 1 1 8 8 / hold 1 / cut / grid_map 2 1 3 7 4 6"],
  ["mark_enclosed_inside", "rule fill the inside of the rectangle frame / concept inside enclosed / difficulty 0.55 / vary flip color zoom / grid 14 14 / bg 0 / seed 9 / spawn frame rand 4 6 rand 4 6 random 1 2 6 7 color 6 id border / hold 1 / cut / mark_enclosed 2 / snap 1"],
  ["transpose_grid", "rule transpose the grid across the main diagonal / concept grid transpose / difficulty 0.62 / vary color / grid 9 9 / bg 0 / seed 11 / scatter rand 5 8 color rand 1 9 box 0 0 8 8 / hold 1 / cut / grid_flip diagonal"],
  ["compose_offsets", "rule add two recoloured offset copies of the object / concept composition copy / difficulty 0.74 / vary color shift / grid 12 12 / bg 0 / seed 13 / spawn square 2 random 2 2 7 7 color rand 3 8 id obj / hold 1 / cut / copy obj by 3 3 tint 6 / copy obj by 5 5 tint 2 / snap 1"],
  ["rotate_180_grid", "rule rotate the whole grid 180 degrees / concept grid rotation / difficulty 0.6 / vary color / grid 10 10 / bg 0 / seed 15 / scatter rand 5 8 color rand 1 9 box 0 0 9 9 / hold 1 / cut / grid_rotate 2"],
];

const cards = RAW.map(([name, oneLine]) => {
  const dsl = oneLine.split(" / ").join("\n");
  fs.mkdirSync("scenes/showcase2", { recursive: true });
  fs.writeFileSync(path.join("scenes/showcase2", name + ".txt"), dsl + "\n");
  let gif = null, verdict, diff = null;
  try {
    const t = E.buildTask(dsl, { examples: 3, seed0: 1, wild: true });
    fs.mkdirSync("out/showcase2_json", { recursive: true });
    fs.writeFileSync(path.join("out/showcase2_json", name + ".task.json"), JSON.stringify(t));   // the dataset TRUTH on disk
    diff = t.meta.difficulty;
    const v = t.meta.teaching;
    const m = E.taskToMontage(t, { fps: 2 });
    gif = "data:image/gif;base64," + Buffer.from(GIF.encodeGif({ frames: m.frames, palette: E.ARC_PALETTE, cell: 9, delayMs: 500 })).toString("base64");
    const badge = !v.ok ? '<b style="color:#ff5f5f">no teaching</b>' : (v.examplesVary ? '<b style="color:#9fe89f">valid + varied</b>' : '<b style="color:#ffb14e">valid, low variation</b>');
    verdict = `parses ✓ · teaching ${v.ok ? "✓" : "✗"} · variation ${v.distinctExamples}/${t.examples.length} · aug ${(t.meta.augment_applied || []).join("+") || "none"} → ${badge}`;
  } catch (e) { verdict = '<b style="color:#ff5f5f">PARSE ERROR: ' + esc(e.message.split("\n").find(l => l.includes("->")) || e.message.split("\n")[0]) + "</b>"; }
  return { name, dsl, gif, verdict, diff };
});

const okCount = cards.filter(c => c.gif && c.verdict.includes("valid")).length;
const body = cards.map(c => `
  <section class="card">
    <div class="head"><span class="name">${esc(c.name)}</span>${c.diff != null ? `<span class="diff">difficulty ${c.diff}</span>` : ""}</div>
    <div class="cols">
      ${c.gif ? `<img src="${c.gif}" alt="${esc(c.name)}">` : '<div class="err">— did not render —</div>'}
      <pre class="dsl">${esc(c.dsl)}</pre>
    </div>
    <div class="verdict">${c.verdict}</div>
  </section>`).join("\n");

const html = `<!doctype html><html><head><meta charset="utf-8"><title>showcase v2 — hard tasks (Haiku, wild-augmented)</title><style>
:root{--bg:#0b0b0d;--card:#15151a;--ink:#ededed;--dim:#8a8a93;--pink:#ff5fae;--amber:#ffb14e;--line:#2a2a31}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:14px ui-monospace,Menlo,monospace;padding:30px}
h1{font-size:19px;color:var(--pink);margin:0 0 6px}.lead{color:var(--dim);max-width:920px;line-height:1.6;margin:0 0 22px}.lead b{color:var(--ink)}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:18px;margin-bottom:16px}
.head{display:flex;gap:12px;align-items:baseline;border-bottom:1px solid var(--line);padding-bottom:10px;margin-bottom:13px}
.name{color:var(--pink);font-weight:700}.diff{color:var(--amber);font-size:12.5px}
.cols{display:grid;grid-template-columns:1fr 1fr;gap:18px;align-items:start}.err{color:#ff8f8f;padding:30px;text-align:center}
img{image-rendering:pixelated;max-width:100%;border:1px solid var(--line);border-radius:6px;background:#000}
pre.dsl{margin:0;background:#090909;border:1px solid var(--line);border-radius:8px;padding:13px;color:#cfe;font-size:12px;line-height:1.5;white-space:pre;overflow:auto;max-height:320px}
.verdict{margin-top:12px;color:var(--dim);font-size:12.5px;border-top:1px dashed var(--line);padding-top:9px}
</style></head><body>
<h1>showcase v2 — hard tasks by Haiku, hand-curated, wild-augmented</h1>
<p class="lead">Haiku authored 14 hard tasks. The automatic check (<i>parses · OUT≠IN · examples differ</i>) only proves a task is
<b>structurally</b> valid — NOT <b>meaningful</b>. So every task here was then <b>eyeballed by hand</b>: <b>4 were structurally-valid
nonsense and dropped</b> (gravity-then-sort-rows-by-background · extract-with-one-object · extract-before-the-IN-snapshot ·
recolor-all-erases-info), and 2 whole-grid ones had their dense-noise input swapped for sparse cells so the transform is actually
visible. These ${cards.length} are the survivors — each <b>wild-augmented</b> and saved as a <code>.task.json</code> (the dataset truth: real int-grid
<code>examples</code>/<code>in</code>/<code>out</code> + meta). A montage <b>row = [IN | OUT]</b>; top rows are demos, last is the test.
<br><b>The real lesson:</b> small-model authoring needs a coherence pass — "valid" ≠ "good".</p>
${body}
</body></html>`;
fs.writeFileSync(path.join(OUT, "showcase_v2.html"), html);
console.log("wrote " + path.join(OUT, "showcase_v2.html") + "  (" + okCount + "/" + cards.length + " valid+varied)");
