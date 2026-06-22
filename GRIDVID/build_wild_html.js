#!/usr/bin/env node
/* build_wild_html.js — show the WILD augmentation at work: a few tasks, each rendered under many
 * wild augmentations (all rule-safe axes, different seed0 → different sampled transform), in a grid.
 *   node build_wild_html.js  ->  out/tasks_gallery/wild.html                                     */
const fs = require("fs"), path = require("path");
const E = require("./engine.js"), GIF = require("./gif.js");

const SHOW = ["reconstruct", "irregular_grid", "double_it"];   // visually-rich tasks
const N = 12, CELL = 7, OUT = "out/tasks_gallery";
fs.mkdirSync(OUT, { recursive: true });
const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const sections = SHOW.map(name => {
  const dsl = fs.readFileSync(path.join("scenes/tasks", name + ".txt"), "utf8");
  const base = E.buildTask(dsl, { examples: 2, augment: false });
  const baseGif = (() => { const m = E.taskToMontage(base, { fps: 2 }); return "data:image/gif;base64," + Buffer.from(GIF.encodeGif({ frames: m.frames, palette: E.ARC_PALETTE, cell: CELL, delayMs: 600 })).toString("base64"); })();
  const tiles = [];
  for (let s = 1; s <= N; s++) {
    const t = E.buildTask(dsl, { examples: 2, seed0: s, wild: true });
    const m = E.taskToMontage(t, { fps: 2 });
    const gif = "data:image/gif;base64," + Buffer.from(GIF.encodeGif({ frames: m.frames, palette: E.ARC_PALETTE, cell: CELL, delayMs: 600 })).toString("base64");
    tiles.push(`<figure><img src="${gif}"><figcaption>${esc(t.meta.augment_applied.join("+") || "none")}</figcaption></figure>`);
  }
  return `<section class="card">
    <div class="head"><span class="name">${esc(name)}</span><span class="vary">vary: ${esc(base.meta.vary_axes.join(" "))}</span></div>
    <div class="base"><figure><img src="${baseGif}"><figcaption>no augmentation (base task)</figcaption></figure></div>
    <div class="grid">${tiles.join("\n")}</div>
  </section>`;
}).join("\n");

const html = `<!doctype html><html><head><meta charset="utf-8"><title>wild augmentation</title><style>
:root{--bg:#0c0c0e;--card:#16161a;--ink:#ececec;--dim:#8a8a92;--pink:#ff5fae;--amber:#ffb14e;--line:#2a2a30}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:13px ui-monospace,Menlo,monospace;padding:26px}
h1{font-size:18px;color:var(--amber);margin:0 0 4px}.lead{color:var(--dim);max-width:820px;line-height:1.5;margin:0 0 22px}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:18px;margin-bottom:18px}
.head{display:flex;gap:14px;align-items:baseline;border-bottom:1px solid var(--line);padding-bottom:10px;margin-bottom:12px}
.name{color:var(--amber);font-weight:700}.vary{color:#7fd4ff}
.base{margin-bottom:14px}.base figcaption{color:#9fe89f}
.grid{display:flex;flex-wrap:wrap;gap:14px;align-items:flex-start}
figure{margin:0}img{image-rendering:pixelated;border:1px solid var(--line);border-radius:6px;background:#000}
.base img{max-width:100%}.grid img{max-width:360px}/* grid tiles keep NATURAL size so zoom-in/out is visible */
figcaption{color:var(--dim);font-size:11px;margin-top:5px}
</style></head><body>
<h1>wild augmentation — same task, ${N} rule-safe variants</h1>
<p class="lead">Each card: the <b style="color:#9fe89f">base</b> task (no augmentation) on top, then ${N} <b style="color:${'#ffb14e'}">wild</b>
augmentations — every declared rule-safe axis applied, with a different sampled transform per variant (flip / rot / zoom / shift / colour-perm).
The IN→OUT rule is preserved in every one; only the surface form changes. This is the diversity one template buys.</p>
${sections}
</body></html>`;
fs.writeFileSync(path.join(OUT, "wild.html"), html);
console.log("wrote " + path.join(OUT, "wild.html") + "  (" + SHOW.length + " tasks × " + N + " wild variants)");
