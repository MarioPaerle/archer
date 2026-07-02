#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const OUT = path.join(__dirname, "out");
const HTML_OUT = path.join(OUT, "depth_composition_audit.html");
const JSON_OUT = path.join(OUT, "depth_composition_audit.json");
const SOURCES = [
  ["auto", "auto_depth_showcase.json"],
  ["procedural", "procedural_nft_showcase.json"],
  ["v7", "showcase_v7.json"],
];

const hash = x => JSON.stringify(x);
const fg = g => g.flat().filter(x => x !== 0).length;
const mask = g => new Set(g.flatMap((row, r) => row.map((x, c) => x ? r + "," + c : null)).filter(Boolean));
function dims(g) { return [g.length, g[0].length]; }
function changed(a, b) {
  const H = Math.max(a.length, b.length), W = Math.max(a[0].length, b[0].length);
  let n = 0;
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) if (((a[r] || [])[c] || 0) !== ((b[r] || [])[c] || 0)) n++;
  return n;
}
function iou(a, b) {
  const A = mask(a), B = mask(b);
  if (!A.size && !B.size) return 1;
  let inter = 0;
  for (const k of A) if (B.has(k)) inter++;
  return inter / (A.size + B.size - inter);
}
function pairList(card) {
  const t = card.task || card.task_json;
  if (t && t.examples && t.in && t.out) {
    const last = xs => xs[xs.length - 1];
    return t.examples.map(e => ({ in: last(e.in), out: last(e.out) })).concat([{ in: last(t.in), out: last(t.out), test: true }]);
  }
  if (card.pairs) return card.pairs.map((p, i) => ({ in: p.in, out: p.out, test: i === card.pairs.length - 1 }));
  return [];
}
function readCards() {
  const cards = [];
  for (const [source, file] of SOURCES) {
    const p = path.join(OUT, file);
    if (!fs.existsSync(p)) continue;
    const payload = JSON.parse(fs.readFileSync(p, "utf8"));
    for (const c of payload.cards || []) cards.push({ source, raw: c });
  }
  return cards;
}
function scoreCard(card, globalOutFreq) {
  const c = card.raw, pairs = pairList(c);
  const pairHashes = pairs.map(p => hash({ in: p.in, out: p.out }));
  const outHashes = pairs.map(p => hash(p.out));
  const changes = pairs.map(p => changed(p.in, p.out));
  const maxOutIou = pairs.length < 2 ? 0 : Math.max(...pairs.flatMap((p, i) => pairs.slice(i + 1).map(q => iou(p.out, q.out))));
  const maxArea = pairs.length ? Math.max(...pairs.flatMap(p => [dims(p.in), dims(p.out)].map(([h, w]) => h * w))) : 0;
  const fgCopy = pairs.length ? Math.max(...pairs.map(p => {
    const inMask = mask(p.in), outMask = mask(p.out);
    if (!inMask.size) return 0;
    let copied = 0; for (const k of inMask) if (outMask.has(k)) copied++;
    return copied / inMask.size;
  })) : 0;
  const globalReuse = Math.max(0, ...outHashes.map(h => globalOutFreq[h] || 0));
  const warnings = [];
  if (pairs.length && new Set(pairHashes).size < pairHashes.length) warnings.push("duplicate-pairs");
  if (pairs.length && Math.min(...changes) < 4) warnings.push("tiny-effect");
  if (maxOutIou > 0.95 && new Set(outHashes).size > 1) warnings.push("high-output-mask-iou");
  if (globalReuse > 1) warnings.push("global-output-reuse");
  if (maxArea > 800) warnings.push("too-large");
  if (fgCopy > 0.97 && Math.min(...changes) < 10) warnings.push("mostly-copy");
  if ((c.kind || "").includes("not a materialized scene") && !c.gif) warnings.push("plan-record-not-visual-card");
  return {
    source: card.source,
    id: c.id || c.task?.meta?.id || c.task_json?.meta?.id || "unknown",
    family: c.family || c.recipe || c.title || c.task?.meta?.template || c.task_json?.meta?.template || "",
    gif: c.gif || null,
    rule: c.rule || c.task?.meta?.rule || c.task_json?.meta?.rule || "",
    pairs: pairs.length,
    pair_unique: new Set(pairHashes).size,
    min_changed_cells: pairs.length ? Math.min(...changes) : 0,
    max_output_mask_iou: +maxOutIou.toFixed(3),
    max_logical_area: maxArea,
    foreground_copy_ratio: +fgCopy.toFixed(3),
    max_global_output_frequency: globalReuse,
    warnings,
  };
}
function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const cards = readCards();
  const globalOutFreq = {};
  for (const card of cards) for (const p of pairList(card.raw)) globalOutFreq[hash(p.out)] = (globalOutFreq[hash(p.out)] || 0) + 1;
  const rows = cards.map(c => scoreCard(c, globalOutFreq));
  const worst = rows.filter(r => r.warnings.length).sort((a, b) => b.warnings.length - a.warnings.length || b.max_logical_area - a.max_logical_area);
  fs.writeFileSync(JSON_OUT, JSON.stringify({
    generated_at: new Date(0).toISOString(),
    sources: SOURCES.map(s => s[1]),
    metrics: [
      "within_card_input_output_hash_uniqueness",
      "global_output_hash_frequency",
      "max_pairwise_output_mask_iou",
      "min_changed_cells",
      "foreground_copy_ratio",
      "logical_area",
      "gif_exists_for_visual_card",
    ],
    rows,
  }, null, 2) + "\n");
  const html = `<!doctype html><meta charset=utf-8><title>GRIDVID Depth / Compositionality Audit</title><style>
body{margin:0;background:#101014;color:#ececf1;font:13px Inter,system-ui,sans-serif;padding:24px}h1{margin:0;color:#67e8f9}.lead{max-width:1120px;color:#c8c8d0;line-height:1.45}table{border-collapse:collapse;width:100%;margin-top:18px}th,td{border-bottom:1px solid #30303a;padding:7px 8px;text-align:left;vertical-align:top}th{color:#facc15;font-size:11px;text-transform:uppercase;letter-spacing:.04em}td{color:#ddd}.warn{color:#fb923c;font-family:ui-monospace,Menlo,monospace}.ok{color:#86efac}.thumb{width:180px;image-rendering:pixelated;background:#000}
</style><h1>GRIDVID Depth / Compositionality Audit</h1><p class=lead>This is the adversarial quality page: it does not ask whether a task merely renders. It looks for duplicate examples, copied outputs across showcases, tiny effects, high output-mask overlap, huge mostly-empty grids, and plan records pretending to be visual generated tasks.</p><p class=lead>${rows.length} cards inspected; ${worst.length} with warnings.</p><table><thead><tr><th>card</th><th>visual</th><th>warnings</th><th>metrics</th><th>rule</th></tr></thead><tbody>${worst.map(r => `<tr><td><b>${esc(r.source)}:${esc(r.id)}</b><br>${esc(r.family)}</td><td>${r.gif ? `<img class=thumb src="${esc(r.gif)}">` : "<span class=warn>no gif</span>"}</td><td class=warn>${esc(r.warnings.join(" · "))}</td><td>pairs ${r.pair_unique}/${r.pairs}<br>min Δ ${r.min_changed_cells}<br>mask IoU ${r.max_output_mask_iou}<br>fg copy ${r.foreground_copy_ratio}<br>area ${r.max_logical_area}<br>global reuse ${r.max_global_output_frequency}</td><td>${esc(r.rule)}</td></tr>`).join("\n")}</tbody></table>`;
  fs.writeFileSync(HTML_OUT, html);
  console.log("wrote " + path.relative(process.cwd(), HTML_OUT));
  console.log("wrote " + path.relative(process.cwd(), JSON_OUT));
  console.log("cards " + rows.length + " · warnings " + worst.length);
}

if (require.main === module) main();

module.exports = { main, HTML_OUT, JSON_OUT };
