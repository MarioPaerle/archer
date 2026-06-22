#!/usr/bin/env node
/* build_arc_vs_dsl.js — render 5 real ARC-AGI-2 tasks and show a Sonnet agent's attempt to translate them
 * into our gridvid DSL. Finding: all 5 are inexpressible (whole-grid algebra), revealing a paradigm gap. */
const fs = require("fs"), path = require("path");
const E = require("./engine.js"), GIF = require("./gif.js");
const ARC = "../DATASET/ARC-AGI-2/data/training", OUT = "out/tasks_gallery";
const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Sonnet's verdicts (one per task): rule found, why it can't be expressed, the gap category.
const V = {
  "0d3d703e": { rule: "A fixed per-colour remap of the whole grid (5→1, 8→9, 6→2 …) — a bijection on the palette applied to every cell.", gap: "whole-grid colour-map", why: "No `remap`/`palette` verb. `recolor SEL tint C` repaints one selected object to one colour; there is no per-cell colour→colour lookup table." },
  "3c9b0459": { rule: "The three rows are permuted / reordered by a colour-count criterion (the rows are sorted, not pixels moved).", gap: "row-sort by computed rank", why: "No `sort rows by count(C)` and no conditional move-by-computed-offset. The DSL can move a named object by a fixed delta, not derive a target index from a count." },
  "ed36ccf7": { rule: "A whole-grid geometric transform (reflection / rotation) — find the symmetry that maps IN→OUT and apply it.", gap: "whole-grid flip / rotate", why: "`mirror SEL axis h|v` reflects a named OBJECT, not the canvas. No `rotate grid` / `flip grid`; cell-level colour patterns inside a solid rect aren't tracked." },
  "4cd1b7b2": { rule: "Latin-square completion: fill the 0s so every row and column is a permutation of 1–4 (constraint satisfaction).", gap: "constraint solver", why: "No row/column-uniqueness constraints, no `solve` / `fill_unique`. `fill` flood-fills one colour; it cannot compute the missing value per cell." },
  "74dd1130": { rule: "Matrix TRANSPOSE of the whole grid: OUT[r][c] = IN[c][r] (reflection across the main diagonal).", gap: "transpose / diagonal mirror", why: "Only `h` and `v` mirror axes exist; there is no diagonal/transpose. No verb swaps (r,c)↔(c,r) across all cells." },
};
const ORDER = ["0d3d703e", "3c9b0459", "ed36ccf7", "4cd1b7b2", "74dd1130"];

// render an ARC task as ONE montage grid: each train pair = [IN | sep | OUT]; final row = [TEST IN | sep | ?].
function arcMontage(task) {
  const sep = 5, bg = 0, pairs = task.train.map(p => [p.input, p.output]).concat([[task.test[0].input, null]]);
  const W = Math.max(...pairs.flatMap(([a, b]) => [a[0].length, b ? b[0].length : 0]));
  const H = Math.max(...pairs.flatMap(([a, b]) => [a.length, b ? b.length : 0]));
  const totalW = 2 * W + 1, totalH = pairs.length * (H + 1) - 1;
  const g = Array.from({ length: totalH }, () => new Array(totalW).fill(bg));
  pairs.forEach(([inp, outp], i) => {
    const r0 = i * (H + 1);
    for (let r = 0; r < H; r++) g[r0 + r][W] = sep;
    const place = (f, c0) => { if (!f) return; for (let r = 0; r < f.length; r++) for (let c = 0; c < f[0].length; c++) g[r0 + r][c0 + c] = f[r][c]; };
    place(inp, 0); place(outp, W + 1);
    if (!outp) for (let r = 0; r < H; r++) g[r0 + r][W + 1] = 5;   // hidden test output marked with a grey block
    if (i < pairs.length - 1) for (let c = 0; c < totalW; c++) g[r0 + H][c] = sep;
  });
  return g;
}

const cards = ORDER.map(id => {
  const task = JSON.parse(fs.readFileSync(path.join(ARC, id + ".json"), "utf8"));
  const g = arcMontage(task);
  const gif = "data:image/gif;base64," + Buffer.from(GIF.encodeGif({ frames: [g], palette: E.ARC_PALETTE, cell: 14, delayMs: 600 })).toString("base64");
  return { id, gif, ntrain: task.train.length, ...V[id] };
});

const body = cards.map(c => `
  <section class="card">
    <div class="head"><span class="name">ARC ${esc(c.id)}</span><span class="tr">${c.ntrain} train pairs</span></div>
    <div class="cols">
      <figure><img src="${c.gif}"><figcaption>real ARC-AGI-2 task · rows = [input | output], last row = test (grey = hidden answer)</figcaption></figure>
      <div class="right">
        <div class="rule"><b>rule (Sonnet)</b><br>${esc(c.rule)}</div>
        <div class="verdict"><span class="x">CANNOT EXPRESS</span> in gridvid — <b>${esc(c.gap)}</b><br><span class="dim">${esc(c.why)}</span></div>
      </div>
    </div>
  </section>`).join("\n");

const html = `<!doctype html><html><head><meta charset="utf-8"><title>real ARC-AGI-2 vs our DSL</title><style>
:root{--bg:#0b0b0d;--card:#15151a;--ink:#ededed;--dim:#8a8a93;--pink:#ff5fae;--red:#ff6b6b;--green:#9fe89f;--line:#2a2a31}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:14px ui-monospace,Menlo,monospace;padding:30px}
h1{font-size:19px;color:var(--pink);margin:0 0 6px}.lead{color:var(--dim);max-width:940px;line-height:1.6;margin:0 0 22px}
.lead b{color:var(--ink)}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:20px;margin-bottom:16px}
.head{display:flex;gap:14px;align-items:baseline;border-bottom:1px solid var(--line);padding-bottom:10px;margin-bottom:13px}
.name{color:var(--pink);font-weight:700}.tr{color:var(--dim)}
.cols{display:grid;grid-template-columns:340px 1fr;gap:20px;align-items:start}
figure{margin:0}img{image-rendering:pixelated;max-width:100%;border:1px solid var(--line);border-radius:8px;background:#000}
figcaption{color:var(--dim);font-size:11px;margin-top:6px}
.right{display:flex;flex-direction:column;gap:12px}
.rule{background:#090909;border:1px solid var(--line);border-radius:8px;padding:13px;line-height:1.55}.rule b{color:var(--green)}
.verdict{background:#1a0e0e;border:1px solid #4a2222;border-radius:8px;padding:13px;line-height:1.55}.verdict b{color:#ffb14e}.verdict .dim{color:var(--dim);font-size:12.5px}
.x{color:var(--red);font-weight:700}
.concl{background:#0e1a12;border:1px solid #224a2e;border-radius:10px;padding:16px;margin-top:8px;line-height:1.6}
.concl b{color:var(--green)}
</style></head><body>
<h1>can our DSL express real ARC-AGI-2? — a Sonnet agent translated 5 tasks</h1>
<p class="lead">A Claude-Sonnet agent was given the gridvid grammar, two of our own tasks, and 5 real ARC-AGI-2 tasks, and asked to
translate each into our DSL. <b>Result: all 5 are inexpressible</b> — and the reasons are precise. Our DSL is built around
<b>object identity, physics, counting, spatial copying and colour selection</b> (classic ARC-v1 priors). These ARC-AGI-2 tasks
are <b>whole-grid algebraic transforms</b> (palette remap, transpose, rotation, row-sort) and <b>logical completions</b>
(Latin square) — a different computational paradigm. So vs our tasks: ours are 8–14 readable lines that GENERATE families;
these need primitives we don't have. Length isn't the gap — paradigm is.</p>
${body}
<div class="concl"><b>The actionable gap (Sonnet's list):</b> add whole-grid verbs — <code>grid_rotate K</code> · <code>grid_flip h|v|diagonal</code>
(transpose) · <code>grid_map C→C…</code> (palette remap) — plus relational ops (<code>sort_rows by count(C)</code>) and a tiny
<code>solve</code> for Latin-square/constraint tasks. The first three (geometric + colour-map) are easy and would immediately let
the generator express ~3 of these 5. The object-physics core stays; whole-grid algebra is a new, orthogonal layer.</div>
</body></html>`;
fs.writeFileSync(path.join(OUT, "arc_vs_dsl.html"), html);
console.log("wrote " + path.join(OUT, "arc_vs_dsl.html"));
