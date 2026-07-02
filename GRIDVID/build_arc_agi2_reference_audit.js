#!/usr/bin/env node
"use strict";

/* Render 20 local ARC-AGI-2 training tasks as a visual reference page.
 * This is intentionally training-only: it is a generator-design mirror, not eval
 * probing.
 */

const fs = require("fs");
const path = require("path");
const E = require("./engine.js");
const GIF = require("./gif.js");

const ROOT = path.join(__dirname, "..", "DATASET", "ARC-AGI-2", "data", "training");
const DESC = path.join(__dirname, "..", "DATASET", "descriptions", "training");
const OUT = path.join(__dirname, "out");
const HTML_OUT = path.join(OUT, "arc_agi2_reference_audit.html");
const JSON_OUT = path.join(OUT, "arc_agi2_reference_audit.json");
const SEP = 5, BG = 0;

function blank(h, w, v = BG) { return Array.from({ length: h }, () => Array(w).fill(v)); }
function paste(dst, src, r0, c0) { for (let r = 0; r < src.length; r++) for (let c = 0; c < src[0].length; c++) dst[r0 + r][c0 + c] = src[r][c]; }
function drawFrame(g, r0, c0, h, w, col = SEP) {
  for (let r = r0; r < r0 + h; r++) for (let c = c0; c < c0 + w; c++) if (r === r0 || c === c0 || r === r0 + h - 1 || c === c0 + w - 1) g[r][c] = col;
}
function panel(src, h, w) {
  const out = blank(h + 2, w + 2);
  drawFrame(out, 0, 0, h + 2, w + 2);
  paste(out, src, 1 + Math.floor((h - src.length) / 2), 1 + Math.floor((w - src[0].length) / 2));
  return out;
}
function montage(task) {
  const pairs = [...task.train.map(p => ({ ...p, split: "train" })), ...task.test.map(p => ({ ...p, split: "test" }))];
  const h = Math.max(...pairs.flatMap(p => [p.input.length, p.output.length]));
  const wi = Math.max(...pairs.map(p => p.input[0].length));
  const wo = Math.max(...pairs.map(p => p.output[0].length));
  const rows = pairs.map(p => {
    const a = panel(p.input, h, wi), b = panel(p.output, h, wo);
    const row = blank(a.length, a[0].length + 2 + b[0].length);
    paste(row, a, 0, 0);
    for (let r = 0; r < row.length; r++) row[r][a[0].length] = p.split === "test" ? 4 : SEP;
    paste(row, b, 0, a[0].length + 2);
    return row;
  });
  const W = Math.max(...rows.map(r => r[0].length));
  const H = rows.reduce((n, r) => n + r.length, 0) + rows.length - 1;
  const out = blank(H, W);
  let y = 0; for (const row of rows) { paste(out, row, y, 0); y += row.length + 1; }
  return out;
}
function parseDescription(id) {
  const p = path.join(DESC, id + ".md");
  if (!fs.existsSync(p)) return {};
  const text = fs.readFileSync(p, "utf8");
  const fm = text.match(/^---\n([\s\S]*?)\n---/);
  const rule = (text.match(/## Rule\n([\s\S]*?)(\n## |$)/) || [])[1];
  const priors = [];
  const priorsBlock = fm && fm[1].match(/priors:\n((?:  - .+\n?)+)/);
  if (priorsBlock) for (const m of priorsBlock[1].matchAll(/  - (.+)/g)) priors.push(m[1].trim());
  return {
    difficulty: (fm && fm[1].match(/difficulty:\s*(.+)/) || [])[1] || "?",
    expressible_in_dsl: (fm && fm[1].match(/expressible_in_dsl:\s*(.+)/) || [])[1] || "?",
    transform_depth: (fm && fm[1].match(/transform_depth:\s*(.+)/) || [])[1] || "?",
    priors,
    rule: rule ? rule.trim().replace(/\s+/g, " ").slice(0, 380) : "",
  };
}
function stats(task) {
  const pairs = [...task.train, ...task.test];
  const dims = new Set(pairs.map(p => `${p.input.length}x${p.input[0].length}->${p.output.length}x${p.output[0].length}`));
  const trainOut = new Set(task.train.map(p => JSON.stringify(p.output)));
  const copiedTests = task.test.filter(p => trainOut.has(JSON.stringify(p.output))).length;
  return {
    train_pairs: task.train.length,
    test_pairs: task.test.length,
    dim_signatures: dims.size,
    copied_test_outputs: copiedTests,
    shape_change_pairs: pairs.filter(p => p.input.length !== p.output.length || p.input[0].length !== p.output[0].length).length,
  };
}
function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const files = fs.readdirSync(ROOT).filter(x => x.endsWith(".json")).sort().slice(0, 20);
  const cards = files.map((file, i) => {
    const id = path.basename(file, ".json");
    const task = JSON.parse(fs.readFileSync(path.join(ROOT, file), "utf8"));
    const grid = montage(task);
    const cell = grid[0].length > 80 || grid.length > 100 ? 4 : 6;
    const gif = `arc_ref_${String(i + 1).padStart(2, "0")}_${id}.gif`;
    fs.writeFileSync(path.join(OUT, gif), Buffer.from(GIF.encodeGif({ frames: [grid], palette: E.ARC_PALETTE, cell, delayMs: 900 })));
    return { id, gif, task_json: task, stats: stats(task), description: parseDescription(id) };
  });
  const lessons = [
    "Real ARC examples often vary canvas/output dimensions; fixed-size cards should be suspicious unless size is irrelevant.",
    "Rule-relevant markers are not allowed to be perfectly correlated with shape, color, or position.",
    "Good tasks include distractors while keeping the decisive feature visually crisp.",
    "The held-out test output should not be an exact train output, and usually should not be a translated/color-normalized copy either.",
    "If scale/recursion is the rule, output dimensions must be computed from the full transform, never clipped to a showcase frame.",
  ];
  const html = `<!doctype html><meta charset=utf-8><title>ARC-AGI-2 training reference audit</title><style>
body{margin:0;background:#101014;color:#ececf1;font:14px Inter,system-ui,sans-serif;padding:24px}
h1{margin:0 0 6px;color:#67e8f9;font-size:24px}.lead{color:#b8b8c2;max-width:1100px;line-height:1.45}.lessons{border:1px solid #3f3f46;background:#18181b;border-radius:8px;padding:12px;margin:16px 0}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(360px,1fr));gap:18px}.card{background:#18181d;border:1px solid #30303a;border-radius:8px;padding:14px}
.top{display:flex;justify-content:space-between;gap:10px}.top h2{font:16px ui-monospace,Menlo,monospace;color:#facc15;margin:0}.tag{font:12px ui-monospace,Menlo,monospace;color:#93c5fd}
img{width:100%;height:auto;image-rendering:pixelated;background:#000;border:1px solid #34343c}.small{font-size:12px;color:#c4c4cc;line-height:1.4}.rule{color:#d4d4dc;line-height:1.4}
</style><h1>ARC-AGI-2 Training Reference Audit</h1><p class=lead>First 20 local training tasks rendered as IN | OUT rows. Yellow separator marks test rows. This page is the visual baseline the synthetic generator must compare itself against.</p><div class=lessons><b>Immediate generator lessons</b><ul>${lessons.map(x => `<li>${esc(x)}</li>`).join("")}</ul></div><div class=grid>
${cards.map(c => `<section class=card><div class=top><h2>${esc(c.id)}</h2><span class=tag>${esc(c.description.difficulty)} · depth ${esc(c.description.transform_depth)} · DSL ${esc(c.description.expressible_in_dsl)}</span></div><p class=small>${esc(c.description.priors.join(", ") || "unannotated")}</p><img src="${esc(c.gif)}" alt="${esc(c.id)}"><p class=small>train ${c.stats.train_pairs} · test ${c.stats.test_pairs} · dim signatures ${c.stats.dim_signatures} · shape-change pairs ${c.stats.shape_change_pairs} · copied test outputs ${c.stats.copied_test_outputs}</p><p class=rule>${esc(c.description.rule)}</p></section>`).join("\n")}
</div>`;
  fs.writeFileSync(HTML_OUT, html);
  fs.writeFileSync(JSON_OUT, JSON.stringify({ lessons, cards }, null, 2) + "\n");
  console.log("wrote " + path.relative(process.cwd(), HTML_OUT));
  console.log("wrote " + path.relative(process.cwd(), JSON_OUT));
  console.log("rendered " + cards.length + " ARC-AGI-2 training tasks");
}

if (require.main === module) main();

module.exports = { main, HTML_OUT, JSON_OUT };
