#!/usr/bin/env node
/* build_family_gallery.js — one gallery showing SEMANTICALLY DIFFERENT puzzle families side by side,
 * to eyeball diversity. Pulls a few certified tasks from each generator and renders them with family tags.
 *   node build_family_gallery.js -o out/family_gallery.html
 */
const fs = require("fs"), path = require("path");
const A = require("./arc_search.js");
const GENS = [
  { tag: "composition", mod: require("./gen_compositional.js"), prog: t => t.meta.program, n: 3, d: 4 },
  { tag: "legend (symbol-grounding)", mod: require("./gen_legend.js"), prog: t => t.meta.program, n: 3, d: 2 },
  { tag: "under-determined (colour-map)", mod: require("./gen_underdetermined.js"), prog: t => t.meta.prefix + " |> colormap", n: 2, d: 3 },
  { tag: "counting", mod: require("./gen_counting.js"), prog: t => t.meta.program, n: 3, d: 2 },
  { tag: "boolean / set-logic", mod: require("./gen_boolean.js"), prog: t => t.meta.program, n: 3, d: 2 },
  { tag: "compositional depth", mod: require("./gen_search.js"), prog: t => t.meta.sampledProgram, n: 2, d: 3 },
];
const PAL = ["#000000", "#1E93FF", "#F93C31", "#4FCC30", "#FFDC00", "#999999", "#E53AA3", "#FF851B", "#87D8F1", "#921231"];
const esc = s => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const eqG = (a, b) => a && b && a.length === b.length && a[0].length === b[0].length && a.every((r, i) => r.every((x, j) => x === b[i][j]));
const grid = g => `<table class=grid>${g.map(r => `<tr>${r.map(v => `<td style="background:${PAL[v] || "#000"}"></td>`).join("")}</tr>`).join("")}</table>`;
const pair = (i, o, l, cls = "") => `<div class="pair ${cls}"><div class=cell><div class=lbl>${l} in</div>${grid(i)}</div><div class=arrow>→</div><div class=cell><div class=lbl>${l} out</div>${grid(o)}</div></div>`;

function card(tag, t, progFn, d) {
  const s = A.solveTask(t, { maxDepth: d });
  const matched = s.prediction && eqG(s.prediction, t.out[0]);
  const ex = t.examples.map((e, i) => pair(e.in[0], e.out[0], "ex" + (i + 1))).join("");
  const test = pair(t.in[0], t.out[0], "TEST", "test");
  const pred = `<div class=cell><div class=lbl>search ${matched ? "✓" : "✗"}</div>${grid(s.prediction || [[0]])}</div>`;
  return `<section class=card><div class=top><h2><span class=tag>${esc(tag)}</span> ${esc(progFn(t) || "")}</h2></div>
    <div class=row>${ex}<div class=testwrap>${test}${pred}</div></div></section>`;
}

let cards = "", summary = [];
for (const G of GENS) {
  const r = G.mod.generate(G.n, { seed: 41 });
  summary.push(`${G.tag}: ${r.tasks.length}`);
  cards += r.tasks.map(t => card(G.tag, t, G.prog, G.d)).join("\n");
}
const html = `<!doctype html><meta charset=utf-8><title>GRIDVID — family gallery</title><style>
body{margin:0;background:#0b0b0f;color:#ececf1;font:13px ui-monospace,Menlo,monospace;padding:24px}
h1{margin:0 0 4px;color:#67e8f9;font-size:22px}.lead{color:#aab;max-width:1100px;line-height:1.55;margin:0 0 16px}
.card{border:1px solid #2a2a34;background:#15151b;border-radius:9px;padding:14px;margin:14px 0}
.top h2{margin:0;font-size:13px;color:#e5e7eb;display:flex;gap:10px;align-items:center}
.tag{background:#1d4ed8;color:#fff;border-radius:5px;padding:2px 8px;font-size:11px;white-space:nowrap}
.row{display:flex;flex-wrap:wrap;gap:18px;align-items:flex-start;margin-top:10px}
.pair{display:flex;gap:8px;align-items:center}.arrow{color:#67e8f9;font-size:16px}
.cell .lbl{color:#889;font-size:10px;margin-bottom:3px}
.testwrap{display:flex;gap:18px;align-items:flex-start;padding-left:16px;border-left:2px dashed #3a3a44}
table.grid{border-collapse:collapse;background:#111}table.grid td{width:13px;height:13px;padding:0;border:1px solid #4a4a4a}
</style>
<h1>GRIDVID — semantically different puzzle families</h1>
<p class=lead>Each card is a CERTIFIED task (the search re-derives its rule; the right-most grid is the search's own test prediction, ✓ = matches). The blue tag is the family — these are <b>different IDEAS a human names differently</b>, not re-skins. Families shown: ${esc(summary.join(" · "))}.</p>
${cards}`;
const out = process.argv.includes("-o") ? process.argv[process.argv.indexOf("-o") + 1] : "out/family_gallery.html";
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html);
console.log("wrote " + out + " — " + summary.join(" · "));
