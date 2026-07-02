#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const E = require("./engine.js");
const GIF = require("./gif.js");
const K = require("./skins.js");

const OUT = path.join(__dirname, "out");
const HTML_OUT = path.join(OUT, "showcase_v7_5.html");
const JSON_OUT = path.join(OUT, "showcase_v7_5.json");
const BG = 0, SEP = 5;

function esc(s) {
  return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function blank(h, w) {
  return Array.from({ length: h }, () => Array(w).fill(0));
}
function paste(dst, src, r0, c0) {
  for (let r = 0; r < src.length; r++) for (let c = 0; c < src[0].length; c++) {
    const rr = r0 + r, cc = c0 + c;
    if (rr >= 0 && cc >= 0 && rr < dst.length && cc < dst[0].length) dst[rr][cc] = src[r][c];
  }
}
function drawBox(g, r0, c0, h, w, col = SEP) {
  for (let r = r0; r < r0 + h; r++) for (let c = c0; c < c0 + w; c++) {
    if (r === r0 || c === c0 || r === r0 + h - 1 || c === c0 + w - 1) g[r][c] = col;
  }
}
function saveGif(grid, file, cell = 8) {
  fs.writeFileSync(path.join(OUT, file), Buffer.from(GIF.encodeGif({ frames: [grid], palette: E.ARC_PALETTE, cell, delayMs: 900 })));
  return file;
}
function readJson(name) {
  return JSON.parse(fs.readFileSync(path.join(OUT, name), "utf8"));
}
function ensureArtifacts() {
  fs.mkdirSync(OUT, { recursive: true });
  const builders = [
    "./build_procedural_nft_showcase.js",
    "./build_auto_depth_showcase.js",
    "./build_cot_operation_showcase.js",
    "./build_showcase_v7.js",
    "./build_depth_composition_audit.js",
  ];
  for (const b of builders) {
    const mod = require(b);
    if (mod && typeof mod.main === "function") mod.main();
  }
}
function shapeAtlas() {
  const shapes = K.SHAPES_ALL.slice();
  const skins = K.SKINS.filter((s, i, a) => a.indexOf(s) === i).filter(s => s !== "plain").slice(0, 20);
  const tile = 10, cols = 7, rows = Math.ceil((shapes.length + skins.length) / cols);
  const g = blank(rows * tile + 1, cols * tile + 1);
  let n = 0;
  const draw = (cells, skin, body, accent) => {
    const tr = Math.floor(n / cols) * tile, tc = (n % cols) * tile;
    drawBox(g, tr, tc, tile, tile, SEP);
    const painted = skin ? K.skinnedCells(cells, skin, body, accent) : cells.map(([r, c]) => [r, c, body]);
    for (const [r, c, col] of painted) {
      const rr = tr + 1 + r, cc = tc + 1 + c;
      if (col && rr < tr + tile - 1 && cc < tc + tile - 1) g[rr][cc] = col;
    }
    n++;
  };
  for (const name of shapes) {
    let cells;
    try { cells = E.buildShape(name, name === "frame" ? [5, 6] : [4]); } catch (e) { continue; }
    draw(cells, null, 8, 2);
  }
  for (const skin of skins) draw(E.buildShape("square", [6]), skin, 6, 2);
  return saveGif(g, "showcase_v7_5_shape_skin_atlas.gif", 7);
}
function byRecipe(cards, n = 3) {
  const out = [];
  for (const recipe of [...new Set(cards.map(c => c.recipe))]) out.push(...cards.filter(c => c.recipe === recipe).slice(0, n));
  return out;
}
function byDepth(cards, n = 4) {
  const out = [];
  for (const d of [1, 2, 3]) out.push(...cards.filter(c => c.auto_depth === d).slice(0, n));
  return out;
}
function v7Materialized(cards) {
  return cards.filter(c => c.gif && !(c.kind || "").includes("not a materialized scene")).slice(0, 18);
}
function renderChecks(audit) {
  return (audit || []).map(a => `<span class="${a.ok === false ? "bad" : "ok"}">${esc(a.check)}</span>`).join(" · ");
}
function renderCard(c, opts = {}) {
  const title = c.title || c.id || c.family || c.recipe;
  const kind = c.kind || c.family || c.recipe || "";
  const rule = c.rule || c.task?.meta?.rule || c.task_json?.meta?.rule || "";
  const gif = c.gif;
  const trace = c.traceGif ? `<div class=trace><b>white trace</b><img src="${esc(c.traceGif)}" alt="${esc(title)} trace"></div>` : "";
  const extra = opts.extra ? opts.extra(c) : "";
  return `<section class=card><div class=top><h3>${esc(title)}</h3><span>${esc(kind)}</span></div>${gif ? `<img src="${esc(gif)}" alt="${esc(title)}">` : ""}${trace}<p>${esc(rule)}</p>${extra}<div class=checks>${renderChecks(c.audit)}</div></section>`;
}
function renderAuditRow(r) {
  return `<tr><td><b>${esc(r.source)}:${esc(r.id)}</b><br>${esc(r.family)}</td><td>${r.gif ? `<img class=thumb src="${esc(r.gif)}" alt="${esc(r.id)}">` : "<span class=bad>no visual</span>"}</td><td class=bad>${esc(r.warnings.join(" · "))}</td><td>pairs ${r.pair_unique}/${r.pairs}<br>min Δ ${r.min_changed_cells}<br>mask IoU ${r.max_output_mask_iou}<br>fg copy ${r.foreground_copy_ratio}<br>area ${r.max_logical_area}<br>reuse ${r.max_global_output_frequency}</td></tr>`;
}
function main() {
  ensureArtifacts();
  const v7 = readJson("showcase_v7.json");
  const proc = readJson("procedural_nft_showcase.json");
  const auto = readJson("auto_depth_showcase.json");
  const cot = readJson("cot_operation_showcase.json");
  const audit = readJson("depth_composition_audit.json");
  const atlas = shapeAtlas();
  const auditWarnings = audit.rows.filter(r => r.warnings.length);
  const worst = auditWarnings.slice().sort((a, b) => b.warnings.length - a.warnings.length || b.max_logical_area - a.max_logical_area).slice(0, 24);
  const proceduralCards = byRecipe(proc.cards, 4);
  const depthCards = byDepth(auto.cards, 4);
  const materialized = v7Materialized(v7.cards);
  const sections = [
    { id: "shape_skin", title: "1. Expanded Shape / Skin Vocabulary", count: K.SHAPES_ALL.length + K.SKINS.length },
    { id: "procedural", title: "2. Procedural NFT Generator: Balanced Trait Composition", count: proceduralCards.length },
    { id: "cot", title: "3. White 2D-CoT Operation Templates", count: cot.cards.length },
    { id: "depth", title: "4. Corrected Auto-Depth Tiers", count: depthCards.length },
    { id: "materialized", title: "5. V7 Materialized Puzzle Highlights", count: materialized.length },
    { id: "audit", title: "6. Adversarial Audit: Red Flags We Now Surface", count: worst.length },
  ];
  const stats = {
    procedural_cards: proc.cards.length,
    procedural_recipes: proc.recipes,
    procedural_drops: proc.drops,
    cot_cards: cot.cards.length,
    cot_verbs: [...new Set(cot.cards.flatMap(c => c.verbs || []))].length,
    auto_cards: auto.cards.length,
    auto_bad: auto.bad.length,
    v7_cards: v7.cards.length,
    v7_failed_audits_intentional: v7.bad.length,
    audit_rows: audit.rows.length,
    audit_warnings: auditWarnings.length,
  };
  fs.writeFileSync(JSON_OUT, JSON.stringify({
    generated_at: new Date(0).toISOString(),
    generator: "GRIDVID showcase v7.5",
    stats,
    sections,
    atlas,
    cards: { procedural: proceduralCards, cot: cot.cards, depth: depthCards, materialized },
    audit_worst: worst,
  }, null, 2) + "\n");
  const html = `<!doctype html><meta charset=utf-8><title>GRIDVID Showcase v7.5</title><style>
body{margin:0;background:#101014;color:#ececf1;font:14px Inter,system-ui,sans-serif;padding:24px}h1{margin:0;color:#67e8f9;font-size:28px}.lead{max-width:1240px;color:#c8c8d0;line-height:1.5}.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;margin:18px 0 28px}.stat{background:#18181d;border:1px solid #30303a;border-radius:8px;padding:12px}.stat b{display:block;color:#facc15;font-size:20px}.section{margin-top:34px}.section h2{margin:0 0 6px;color:#facc15;font-size:19px}.section>p{max-width:1120px;color:#c8c8d0}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(360px,1fr));gap:16px}.card{background:#18181d;border:1px solid #30303a;border-radius:8px;padding:12px}.top{display:flex;justify-content:space-between;gap:12px;align-items:baseline}.top h3{font-size:14px;color:#93c5fd;margin:0}.top span{font:10px ui-monospace,Menlo,monospace;color:#a1a1aa}img{width:100%;image-rendering:pixelated;background:#000;border:1px solid #34343c}p{color:#d4d4dc;line-height:1.4}.checks,.meta{font:10px ui-monospace,Menlo,monospace;color:#a1a1aa}.ok{color:#86efac}.bad{color:#fb923c}.trace{margin-top:10px}.trace b{font:11px ui-monospace,Menlo,monospace;color:#86efac}table{border-collapse:collapse;width:100%;margin-top:14px}th,td{border-bottom:1px solid #30303a;padding:8px;vertical-align:top;text-align:left}th{color:#facc15;font-size:11px;text-transform:uppercase}.thumb{width:210px}.atlas{max-width:780px}
</style><h1>GRIDVID Showcase v7.5</h1><p class=lead>Call-ready snapshot after the v7 critique pass: bigger object/skin banks, procedural trait composition, corrected depth metadata, white 2D-CoT operation templates, and an adversarial audit that makes weak cards visible instead of pretending everything is green.</p>
<div class=stats>
<div class=stat><b>${stats.procedural_cards}</b>procedural NFT cards</div>
<div class=stat><b>${stats.cot_cards}</b>white CoT trace families</div>
<div class=stat><b>${stats.cot_verbs}</b>DSL verbs covered by trace templates</div>
<div class=stat><b>${stats.auto_cards}</b>auto-depth cards, ${stats.auto_bad} bad</div>
<div class=stat><b>${stats.audit_warnings}</b>audit warnings surfaced</div>
<div class=stat><b>${stats.v7_failed_audits_intentional}</b>v7 red suggestion records</div>
</div>
<section class=section><h2>${sections[0].title}</h2><p>Shared engine/browser vocabulary now includes more legible object identities and subobject skins. This atlas is not decorative: these are the parts future generators can bind to predicates, ports, relations, support, and dispatch codes.</p><img class=atlas src="${esc(atlas)}" alt="shape skin atlas"><p class=meta>Shapes: ${esc(K.SHAPES_ALL.join(" · "))}<br>Skins: ${esc([...new Set(K.SKINS)].join(" · "))}</p></section>
<section class=section><h2>${sections[1].title}</h2><p>Balanced 80-card procedural run. The relation-gate recipe now draws the anchor zone visibly, and all recipes share the expanded bank rather than a local toy vocabulary.</p><div class=grid>${proceduralCards.map(c => renderCard(c, { extra: x => `<p class=meta>${esc(x.id)} · ${esc(x.recipe)} · ${esc(x.task?.meta?.trait_space || "")}</p>` })).join("\n")}</div></section>
<section class=section><h2>${sections[2].title}</h2><p>White is trace-only working memory: select evidence, erase or move, transform, place result. These are templates, not yet engine-derived traces, and that caveat is intentionally explicit.</p><div class=grid>${cot.cards.map(c => renderCard(c, { extra: x => `<p class=meta>${esc((x.verbs || []).join(" · "))}</p>` })).join("\n")}</div></section>
<section class=section><h2>${sections[3].title}</h2><p>Auto-depth now separates public depth tier from old hand-authored generator step counts. Each task carries a small depth-proof caveat rather than pretending metadata is a semantic DAG.</p><div class=grid>${depthCards.map(c => renderCard(c, { extra: x => `<p class=meta>depth=${esc(x.task?.meta?.depth)} · generator_steps=${esc(x.task?.meta?.generator_steps)} · ${esc((x.task?.meta?.depth_proof?.dependencies || []).join(" / "))}</p>` })).join("\n")}</div></section>
<section class=section><h2>${sections[4].title}</h2><p>Selected materialized v7 puzzles only. Prompt/suggestion records are excluded from this visual section because they are not solved scenes.</p><div class=grid>${materialized.map(c => renderCard(c)).join("\n")}</div></section>
<section class=section><h2>${sections[5].title}</h2><p>This is the red-team table. It is supposed to hurt a little: duplicated examples, repeated outputs, high mask overlap, tiny deltas, huge grids, and plan-only records are now visible.</p><table><thead><tr><th>Card</th><th>Visual</th><th>Warnings</th><th>Metrics</th></tr></thead><tbody>${worst.map(renderAuditRow).join("\n")}</tbody></table></section>`;
  fs.writeFileSync(HTML_OUT, html);
  console.log("wrote " + path.relative(process.cwd(), HTML_OUT));
  console.log("wrote " + path.relative(process.cwd(), JSON_OUT));
  console.log("sections " + sections.length + " · procedural " + proceduralCards.length + " · cot " + cot.cards.length + " · audit-warnings " + auditWarnings.length);
}

if (require.main === module) main();

module.exports = { main, HTML_OUT, JSON_OUT };
