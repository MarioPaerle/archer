#!/usr/bin/env node
/* build_haiku_v3.js — 10 ORIGINAL puzzles by a Haiku told to add its own twist (compose 2+ ideas).
 * Run through the engine coherence guard; show honest verdicts. -> out/tasks_gallery/haiku_v3.html  */
const fs = require("fs"), path = require("path");
const E = require("./engine.js"), GIF = require("./gif.js");
const OUT = "out/tasks_gallery";
const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const SCENES = {
  gravity_sort_then_lattice: `rule objects settle under gravity, then a lattice is laid over them\nconcept physics structure gravity lattice\ndifficulty 0.72\nvary rot flip color\ngrid rand 11 14 12 16\nbg 0\ngravity down 1\nspawn square rand 2 5 random 2 2 4 12 color rand 1 7 grav 1\nspawn rect 3 4 random 1 3 4 10 color rand 2 6 grav 1\nrun 8\nhold 1\ncut\nlattice 4 3 holes 2 outline irregular`,
  explode_then_flip: `rule the object explodes, fragments fly, then the whole scene is mirrored\nconcept explosion symmetry physics\ndifficulty 0.68\nvary rot color\ngrid rand 12 16 11 15\nbg 0\nwalls box\nspawn rect rand 3 5 rand 4 7 random 4 6 4 8 color rand 1 8 id a\nrun 1\nhold 1\nexplode a\nrun 5\ncut\ngrid_flip h`,
  tally_then_shatter: `rule the blocks are tallied, then everything shatters and falls\nconcept counting shatter physics\ndifficulty 0.7\nvary color\ngrid rand 12 16 12 16\nbg 0\nwalls floor\nspawn square rand 2 3 random 2 4 4 10 color rand 1 8\nspawn square rand 2 3 random 6 10 6 14 color rand 1 8\nhold 1\ncut\ntally all at 1 1 color 7\nshatter all\nrun 6`,
  well_then_lattice: `rule the object is pulled into the well, then a lattice replaces the scene\nconcept orbit physics lattice\ndifficulty 0.73\nvary color\ngrid rand 13 17 12 16\nbg 0\nwell at 7 7 strength 2 color 9\nspawn rect rand 3 4 rand 4 6 random 0 0 12 12 color rand 1 8 grav 1 id a\nhold 1\ncut\nrun 8`,
  burst_then_crop: `rule a firework bursts and settles, then the view crops to the debris\nconcept burst crop variable-size physics\ndifficulty 0.66\nvary color\ngrid rand 12 16 12 16\nbg 0\nwalls floor\nburst random count rand 10 16 color rand 1 7\nrun 6\nhold 1\ncut\ncrop pad 1`,
  extract_then_crop: `rule keep the two coloured lines and crop the view to them\nconcept selection crop variable-size\ndifficulty 0.6\nvary color shift\ngrid rand 10 14 12 16\nbg 0\nspawn line 6 v random 1 4 2 4 color rand 2 5\nspawn line 6 v random 8 11 2 4 color rand 6 9\nhold 1\ncut\ncrop pad 0`,
  gravity_then_transpose: `rule objects fall, settle, then the whole grid is transposed\nconcept gravity transpose physics whole-grid\ndifficulty 0.74\nvary color\ngrid rand 13 16 12 16\nbg 0\nwalls floor\nspawn square rand 2 4 random 0 2 2 6 color rand 1 8 grav 1\nspawn rect 3 5 random 0 8 2 12 color rand 1 8 grav 1\nrun 7\nhold 1\ncut\ngrid_flip diagonal`,
  copy_rotated_then_map: `rule three rotated copies of the object appear, then the colours are remapped\nconcept copy rotation palette composition\ndifficulty 0.7\nvary shift\ngrid rand 12 16 12 16\nbg 0\nspawn Tshape 3 random 5 8 5 8 color 2 id a\nhold 1\ncut\ncopy a by 0 4 rot 1 tint 3\ncopy a by 4 0 rot 2 tint 5\ncopy a by 4 4 rot 3 tint 6\nsnap 1`,
  spill_then_crop: `rule water pours and pools, then the view crops to the water\nconcept fluid crop variable-size physics\ndifficulty 0.71\nvary shift\ngrid rand 13 17 12 16\nbg 0\nwalls floor\nspawn rect 2 5 random 8 10 4 10 color 5 id wall\nspill at 0 6 color 3 rate 3\nrun 8\nhold 1\ncut\ncrop pad 1`,
  shatter_then_arrange: `rule the object shatters into fragments, which then arrange by size\nconcept shatter ordering physics\ndifficulty 0.72\nvary color\ngrid rand 12 16 10 14\nbg 0\nspawn square rand 3 4 random 2 4 2 8 color rand 1 8 id a\nshatter a\nrun 5\nhold 1\ncut\narrange all by size at 1 1 dir h\nsnap 1`,
};

fs.mkdirSync("scenes/haiku_v3", { recursive: true });
const cards = Object.entries(SCENES).map(([name, dsl]) => {
  fs.writeFileSync(path.join("scenes/haiku_v3", name + ".txt"), dsl + "\n");
  let gif = null, verdict, ok = false;
  try {
    const t = E.buildTask(dsl, { examples: 3, seed0: 1, wild: true });
    const v = t.meta.teaching; ok = v.ok && v.examplesVary && v.coherent;
    const m = E.taskToMontage(t, { fps: 2 });
    gif = "data:image/gif;base64," + Buffer.from(GIF.encodeGif({ frames: m.frames, palette: E.ARC_PALETTE, cell: 8, delayMs: 450 })).toString("base64");
    verdict = ok ? '<b style="color:#9fe89f">KEPT — coherent + varied</b>' : ('<b style="color:#ff5f5f">rejected</b> — ' + (!v.ok ? "no teaching" : !v.examplesVary ? "no variation" : v.incoherent.join("; ")));
  } catch (e) { verdict = '<b style="color:#ff5f5f">rejected</b> — ' + esc((e.message.split("\n").find(l => l.includes("->")) || e.message.split("\n")[0]).slice(0, 70)); }
  return { name, dsl, gif, verdict, ok };
});
const kept = cards.filter(c => c.ok).length;
const body = cards.map(c => `
  <section class="card ${c.ok ? "" : "rej"}">
    <div class="head"><span class="name">${esc(c.name)}</span><span class="vd">${c.verdict}</span></div>
    <div class="cols">${c.gif ? `<img src="${c.gif}">` : '<div class="err">did not render</div>'}<pre class="dsl">${esc(c.dsl)}</pre></div>
  </section>`).join("\n");
const html = `<!doctype html><html><head><meta charset="utf-8"><title>Haiku v3 — original puzzles</title><style>
:root{--bg:#0b0b0d;--card:#15151a;--ink:#ededed;--dim:#8a8a93;--pink:#ff5fae;--green:#9fe89f;--line:#2a2a31}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:13px ui-monospace,Menlo,monospace;padding:28px}
h1{font-size:19px;color:var(--pink);margin:0 0 5px}.lead{color:var(--dim);max-width:960px;line-height:1.6;margin:0 0 20px}.lead b{color:var(--ink)}
.card{background:var(--card);border:1px solid var(--line);border-radius:11px;padding:16px;margin-bottom:14px}.card.rej{opacity:.62}
.head{display:flex;gap:12px;align-items:baseline;justify-content:space-between;border-bottom:1px solid var(--line);padding-bottom:9px;margin-bottom:12px;flex-wrap:wrap}
.name{color:var(--pink);font-weight:700}.vd{font-size:12px;color:var(--dim)}
.cols{display:grid;grid-template-columns:1fr 1fr;gap:16px;align-items:start}.err{color:#ff8f8f;padding:24px;text-align:center}
img{image-rendering:pixelated;max-width:100%;border:1px solid var(--line);border-radius:6px;background:#000}
pre.dsl{margin:0;background:#090909;border:1px solid var(--line);border-radius:8px;padding:12px;color:#cfe;font-size:11.5px;line-height:1.45;white-space:pre;overflow:auto;max-height:300px}
</style></head><body>
<h1>Haiku v3 — 10 ORIGINAL puzzles (told to add its own twist), filtered by the engine</h1>
<p class="lead">This time Haiku was pushed to <b>invent</b>, not copy — compose 2+ mechanics into something fresh (gravity→lattice, explode→mirror,
path→rotate→diff, shatter→arrange…). It got genuinely more creative. Then every one ran through the engine's <b>coherence guard</b> (free, no LLM):
<b style="color:#9fe89f">${kept} of ${cards.length} kept</b>, the rest auto-rejected (empty OUT, fill-the-grid, no variation). That's the millions-scale loop: bold generation + cheap structural filtering.</p>
${body}
</body></html>`;
fs.writeFileSync(path.join(OUT, "haiku_v3.html"), html);
console.log("wrote " + path.join(OUT, "haiku_v3.html") + "  (" + kept + "/" + cards.length + " kept)");
