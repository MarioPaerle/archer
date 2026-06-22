#!/usr/bin/env node
/* build_v1_final.js — the v1 showcase: 10 hand-picked tasks, each augmented "to measure"
 * (a seed chosen so the sampled augmentation is visible but not destructive).  -> out/tasks_gallery/v1_final.html */
const fs = require("fs"), path = require("path");
const E = require("./engine.js"), GIF = require("./gif.js");

const PICKS = [
  ["extract_red", "selection — keep only the red objects"],
  ["mirror_complete", "symmetry — complete the figure by reflection"],
  ["find_error", "error-correction — fix the odd-coloured block"],
  ["reconstruct", "reconstruction — fill the broken shape"],
  ["gravity_settle", "physics — predict the fall (OUT is a video)"],
  ["count_bar", "counting — a bar as long as the count"],
  ["fill_grid", "grids — fill the holes of the lattice"],
  ["graph_paper", "inverse grid — keep the squared-paper lines"],
  ["composition", "composition — figure built by def/use/repeat"],
  ["compare", "comparison — output the bigger group's colour"],
];
const OUT = "out/tasks_gallery";
const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// pick a seed whose augmentation is non-empty, teaching+varying, and not a destructive zoom-out.
function chooseAugmented(dsl) {
  let fallback = null;
  for (let s = 1; s <= 14; s++) {
    const t = E.buildTask(dsl, { examples: 3, seed0: s });
    if (!t.meta.teaching.ok || !t.meta.teaching.examplesVary) continue;
    fallback = fallback || t;
    const a = t.meta.augment_applied;
    if (a.length && !a.some(x => x.startsWith("zoom-out"))) return t;   // a visible, lossless augmentation
  }
  return fallback || E.buildTask(dsl, { examples: 3, seed0: 1 });
}

const cards = PICKS.map(([name, blurb]) => {
  const dsl = fs.readFileSync(path.join("scenes/tasks", name + ".txt"), "utf8");
  const t = chooseAugmented(dsl);
  const m = E.taskToMontage(t, { fps: 2 });
  const gif = "data:image/gif;base64," + Buffer.from(GIF.encodeGif({ frames: m.frames, palette: E.ARC_PALETTE, cell: 11, delayMs: 600 })).toString("base64");
  const rep = t.meta.representation;
  return { name, blurb, rule: t.meta.rule, concepts: (t.meta.concepts || []).join(" · "),
    vary: (t.meta.vary_axes || []).join(" ") || "—", applied: t.meta.augment_applied.join("+") || "none",
    objs: rep.in_objects.length, dsl, gif };
});

const body = cards.map((c, i) => `
  <section class="card">
    <div class="head"><span class="num">${String(i + 1).padStart(2, "0")}</span><span class="name">${esc(c.name)}</span><span class="blurb">${esc(c.blurb)}</span></div>
    <div class="cols">
      <figure><img src="${c.gif}" alt="${esc(c.name)}"><figcaption>augmentation applied: <b>${esc(c.applied)}</b> &nbsp;(declared vary: ${esc(c.vary)})</figcaption></figure>
      <div class="right">
        <pre class="dsl">${esc(c.dsl)}</pre>
        <div class="meta"><b>rule</b> ${esc(c.rule)}<br><b>concepts</b> ${esc(c.concepts)}<br><b>representation</b> ${c.objs} objects (in JSON)</div>
      </div>
    </div>
  </section>`).join("\n");

const html = `<!doctype html><html><head><meta charset="utf-8"><title>prodigy v1 — final</title><style>
:root{--bg:#0b0b0d;--card:#15151a;--ink:#ededed;--dim:#8a8a93;--pink:#ff5fae;--cyan:#7fd4ff;--green:#9fe89f;--line:#2a2a31}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:14px ui-monospace,"Space Mono",Menlo,monospace;padding:30px}
h1{font-size:20px;color:var(--pink);letter-spacing:1px;margin:0 0 4px}
.lead{color:var(--dim);max-width:900px;line-height:1.55;margin:0 0 24px}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:20px;margin-bottom:18px}
.head{display:flex;align-items:baseline;gap:12px;border-bottom:1px solid var(--line);padding-bottom:11px;margin-bottom:14px}
.num{color:var(--dim)}.name{color:var(--pink);font-weight:700;font-size:15px}.blurb{color:var(--dim)}
.cols{display:grid;grid-template-columns:1fr 430px;gap:20px;align-items:start}
figure{margin:0}img{image-rendering:pixelated;max-width:100%;border:1px solid var(--line);border-radius:8px;background:#000}
figcaption{color:var(--dim);font-size:12px;margin-top:7px}figcaption b{color:var(--cyan)}
.right{display:flex;flex-direction:column;gap:10px}
pre.dsl{margin:0;background:#090909;border:1px solid var(--line);border-radius:8px;padding:14px;color:#cfe;font-size:12px;line-height:1.45;white-space:pre;overflow:auto;max-height:340px}
.meta{background:#090909;border:1px solid var(--line);border-radius:8px;padding:12px;font-size:12.5px;color:#c8c8d0;line-height:1.7}.meta b{color:var(--green)}
.legend{color:var(--dim);font-size:12px;margin-top:8px}
</style></head><body>
<h1>prodigy — v1 final</h1>
<p class="lead">Ten hand-picked tasks spanning the human-core priors: selection, symmetry, error-correction, reconstruction,
physics, counting, grids (and their inverse), function composition, comparison. Each is a <b>(EXAMPLES, IN, OUT)</b> triple
shown <b>augmented to measure</b> — the engine sampled one rule-safe transform for the whole task (caption shows which).
A montage <b>row = [IN | OUT]</b>: top rows are the demonstrations, the last row is the held-out test. The JSON is the truth.</p>
${body}
<p class="legend">build_v1_final.js · 10 tasks · engine self-test 66 · companion pages: index.html (all 16) · wild.html (augmentation showcase) · haiku.html (small-model test)</p>
</body></html>`;
fs.writeFileSync(path.join(OUT, "v1_final.html"), html);
console.log("wrote " + path.join(OUT, "v1_final.html") + "  (" + cards.length + " tasks)");
