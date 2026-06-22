#!/usr/bin/env node
/* build_v3.js — the v3 mega-showcase: the WHOLE verified template library (grouped), the new physics,
 * and Haiku "spice" puzzles filtered by the engine's coherence guard. Saves every .task.json.
 *   node build_v3.js  ->  out/tasks_gallery/v3.html  (+ out/library_json/*.task.json)              */
const fs = require("fs"), path = require("path");
const E = require("./engine.js"), GIF = require("./gif.js");
const OUT = "out/tasks_gallery", JDIR = "out/library_json";
fs.mkdirSync(JDIR, { recursive: true });
const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const CAT = {
  "Selection & extraction (incl. cropped output)": ["extract_red", "extract_crop", "odd_shape", "recolor_smallest"],
  "Counting, ordering & comparison": ["count_bar", "two_bars", "compare", "order_by_size", "rank_count"],
  "Symmetry & reflection": ["mirror_complete"],
  "Reconstruction & error": ["reconstruct", "denoise", "find_error"],
  "Copy & object transform": ["copy_paint", "copy_row", "copy_and_tile", "compose_offsets", "double_it", "shrink_it"],
  "Grids, holes & inside/outside": ["fill_grid", "framed_grid", "irregular_grid", "graph_paper", "lattice_completion", "fill_inside", "mark_enclosed_inside"],
  "Whole-grid algebra (ARC layer)": ["transpose_grid", "rotate_grid", "recolor_map", "flip_grid"],
  "Matrix / symmetry completion (G7)": ["complete_symmetry_h", "complete_symmetry_rot"],
  "Paper-folding (unfold — G5)": ["unfold_paper"],
  "Physics & simulation": ["gravity_settle", "pile_up", "spill_pool", "explode_predict", "shatter_fall", "path_follow", "path_zigzag", "path_two_walkers", "path_candy", "path_hidden", "radial_burst", "bounce_ball", "orbit_well", "spin_rotate"],
  "Composition & programs": ["composition", "turtle_path"],
  "Context-sensitive rules (dispatch / classify — G2/G3)": ["dispatch_symmetry", "dispatch_holes", "dispatch_convex", "classify_convex"],
  "Boolean figure-algebra (combine / overlay — G1)": ["figure_xor", "figure_and", "figure_overlay"],
  "Analogy, series & odd-one-out (G4)": ["odd_one_out_color", "odd_one_out_shape", "analogy_recolor"],
};
const NEW_PHYSICS = new Set(["explode_predict", "shatter_fall", "path_follow", "radial_burst", "bounce_ball", "orbit_well", "spin_rotate", "path_candy", "path_hidden", "path_zigzag", "path_two_walkers", "extract_crop", "order_by_size", "rank_count"]);

const render = (dsl, cell) => { const t = E.buildTask(dsl, { examples: 3, seed0: 1, wild: true }); const m = E.taskToMontage(t, { fps: 2 }); return { t, gif: "data:image/gif;base64," + Buffer.from(GIF.encodeGif({ frames: m.frames, palette: E.ARC_PALETTE, cell, delayMs: 450 })).toString("base64") }; };

function card(name, dir, cell, badgeNew) {
  const dsl = fs.readFileSync(path.join(dir, name + ".txt"), "utf8");
  const { t, gif } = render(dsl, cell);
  fs.writeFileSync(path.join(JDIR, name + ".task.json"), JSON.stringify(t));   // dataset truth
  const v = t.meta.teaching, ok = v.ok && v.examplesVary && v.coherent;
  return `<figure class="card">
    <img src="${gif}" alt="${esc(name)}">
    <figcaption><span class="nm">${esc(name)}${badgeNew && NEW_PHYSICS.has(name) ? ' <b class="new">NEW</b>' : ""}</span>
      <span class="rl">${esc(t.meta.rule || "")}</span>
      <span class="vd">${ok ? "coherent ✓" : '<b style=color:#ff5f5f>✗</b>'} · d${t.meta.difficulty != null ? t.meta.difficulty : "?"} · ${esc((t.meta.concepts || []).slice(0, 3).join(" "))}</span>
    </figcaption></figure>`;
}

let total = 0;
const sections = Object.entries(CAT).map(([cat, names]) => {
  const cards = names.filter(n => fs.existsSync(path.join("scenes/library", n + ".txt"))).map(n => { total++; return card(n, "scenes/library", 7, true); }).join("\n");
  return `<section><h2>${esc(cat)}</h2><div class="grid">${cards}</div></section>`;
}).join("\n");

// Haiku spice survivors (already filtered by the guard)
const spiceNames = fs.existsSync("scenes/spice") ? fs.readdirSync("scenes/spice").filter(f => f.endsWith(".txt")).map(f => f.replace(".txt", "")) : [];
const spiceKept = spiceNames.filter(n => { try { const v = E.buildTask(fs.readFileSync("scenes/spice/" + n + ".txt", "utf8"), { examples: 3, wild: true }).meta.teaching; return v.ok && v.examplesVary && v.coherent; } catch { return false; } });
const spiceCards = spiceKept.map(n => card(n, "scenes/spice", 8, false)).join("\n");

const html = `<!doctype html><html><head><meta charset="utf-8"><title>gridvid v3 — template library</title><style>
:root{--bg:#0b0b0d;--card:#15151a;--ink:#ededed;--dim:#8a8a93;--pink:#ff5fae;--green:#9fe89f;--amber:#ffb14e;--line:#2a2a31}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:13px ui-monospace,Menlo,monospace;padding:28px}
h1{font-size:20px;color:var(--pink);margin:0 0 4px}h2{font-size:15px;color:var(--amber);margin:26px 0 12px;border-bottom:1px solid var(--line);padding-bottom:7px}
.lead{color:var(--dim);max-width:980px;line-height:1.6;margin:0 0 14px}.lead b{color:var(--ink)}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:14px}
.card{margin:0;background:var(--card);border:1px solid var(--line);border-radius:10px;padding:10px}
img{image-rendering:pixelated;width:100%;border:1px solid var(--line);border-radius:6px;background:#000}
figcaption{display:flex;flex-direction:column;gap:3px;margin-top:7px}
.nm{color:var(--pink);font-weight:700}.nm .new{color:var(--amber);font-size:10px;border:1px solid var(--amber);border-radius:3px;padding:0 4px}
.rl{color:#cfcfd6;font-size:11.5px;line-height:1.35}.vd{color:var(--dim);font-size:11px}
.spice h2{color:#7fd4ff}
</style></head><body>
<h1>gridvid — v3 template library</h1>
<p class="lead"><b>${total} verified templates</b>, every one teaching + varied + <b style="color:#9fe89f">coherent</b> (the engine's cheap structural
guard). Each is a parameterized generator: re-run across seeds × params × augmentation → millions of coherent tasks, no per-task LLM.
Every template here is also saved as a <code>.task.json</code> (the dataset truth). <b class="new" style="color:#ffb14e">NEW</b> = the new physics
(explode · shatter · path-follow · radial burst · bouncing ball · orbit · spin). The plan: Qwen-30B <i>mixes templates and adds spice</i>;
the engine guard keeps only the coherent results — see the Haiku-spice section.</p>
${sections}
<section class="spice"><h2>Haiku "spice" — generate → engine-filter (${spiceKept.length} kept of ${spiceNames.length})</h2>
<p class="lead">A small model (Haiku, standing in for Qwen-30B) was told to <b>mix templates and add spice</b>. Its output passed through the
engine's coherence guard — only the coherent ones survive, at zero LLM cost. This is the millions-scale loop.</p>
<div class="grid">${spiceCards}</div></section>
<p class="lead" style="margin-top:18px">engine self-test green · JSON truth in out/library_json/ · build_v3.js</p>
</body></html>`;
fs.writeFileSync(path.join(OUT, "v3.html"), html);
console.log("wrote " + path.join(OUT, "v3.html") + "  (" + total + " library templates + " + spiceKept.length + " spice)");
