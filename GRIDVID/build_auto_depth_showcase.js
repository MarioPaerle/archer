#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const E = require("./engine.js");
const GIF = require("./gif.js");
const GH = require("./gen_hard.js");
const Baseline = require("./baseline.js");

const OUT = path.join(__dirname, "out");
const HTML_OUT = path.join(OUT, "auto_depth_showcase.html");
const JSON_OUT = path.join(OUT, "auto_depth_showcase.json");
const JSONL_OUT = path.join(OUT, "auto_depth_tasks.jsonl");

const PLAN = [
  { autoDepth: 1, count: 50, label: "Depth tier 1: direct perceptual transforms", accept: f => f.steps <= 2 },
  { autoDepth: 2, count: 30, label: "Depth tier 2: relational / structured setup", accept: f => f.steps === 3 },
  { autoDepth: 3, count: 20, label: "Depth tier 3: conditional programs, physics, and composed priors", accept: f => f.steps >= 4 },
];

function esc(s) {
  return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function hashTask(t) {
  return crypto.createHash("sha1").update(JSON.stringify({ examples: t.examples, in: t.in, out: t.out })).digest("hex").slice(0, 16);
}
function pairsOf(task) {
  return task.examples.map(e => ({ in: e.in[0], out: e.out[0] })).concat([{ in: task.in[0], out: task.out[0], test: true }]);
}
function dims(g) {
  return [g.length, g[0].length];
}
function auditTask(task) {
  const pairs = pairsOf(task);
  const outs = pairs.map(p => JSON.stringify(p.out));
  const pairHashes = pairs.map(p => JSON.stringify({ in: p.in, out: p.out }));
  const trainOut = new Set(outs.slice(0, -1));
  const maxDim = Math.max(...pairs.flatMap(p => [dims(p.in), dims(p.out)]).flat());
  return [
    { check: "generated", ok: true },
    { check: "not-trivial-baseline", ok: !Baseline.trivialSolve(task) },
    { check: "within-card-pairs-unique", ok: new Set(pairHashes).size === pairHashes.length },
    { check: "test-output-not-train-copy", ok: !trainOut.has(outs[outs.length - 1]) },
    { check: "output-variety", ok: new Set(outs).size >= Math.min(3, outs.length) },
    { check: "max-dimension<=44", ok: maxDim <= 44, note: String(maxDim) },
    { check: "depth-tier-recorded", ok: task.meta.depth === task.meta.auto_depth, note: `depth=${task.meta.depth} generator_steps=${task.meta.generator_steps}` },
  ];
}
function depthProof(fam, plan) {
  const concepts = new Set(fam.concept || []);
  const dependencies = [];
  if ([...concepts].some(x => /dispatch|conditional|program|symbol|traffic|gate/.test(x))) dependencies.push("decode visible cue before applying action");
  if ([...concepts].some(x => /relation|largest|majority|count|rank|inside|outside|containment/.test(x))) dependencies.push("derive object property/relation before output");
  if ([...concepts].some(x => /gravity|collision|support|physics|fall/.test(x))) dependencies.push("simulate contact/support after selection");
  if ([...concepts].some(x => /fractal|recursion|pattern|self-similarity/.test(x))) dependencies.push("apply recursive replacement/continuation");
  if (!dependencies.length) dependencies.push(plan.autoDepth === 1 ? "single visible transform" : "hand-authored multi-step proxy; needs stronger proof");
  return {
    depth: plan.autoDepth,
    generator_steps: fam.steps,
    concepts: fam.concept || [],
    dependencies,
    caveat: "This is a tier proof, not yet an engine-derived operation DAG.",
  };
}
function cardGif(task, file) {
  const m = E.taskToMontage(task, { fps: 2 });
  fs.writeFileSync(path.join(OUT, file), Buffer.from(GIF.encodeGif({ frames: [m.frames[0]], palette: E.ARC_PALETTE, cell: 6, delayMs: 900 })));
  return file;
}
function sampleDepth(plan, seedBase, seen) {
  const families = Object.entries(GH.FAMILIES).filter(([, f]) => plan.accept(f));
  if (!families.length) throw new Error("no families for depth " + plan.autoDepth);
  const out = [], drops = { duplicate: 0, trivial: 0, audit: 0, error: 0 };
  let attempts = 0;
  while (out.length < plan.count && attempts < plan.count * 250) {
    attempts++;
    const [name, fam] = families[(attempts - 1) % families.length];
    const rng = E.makeRng(seedBase + plan.autoDepth * 1000003 + attempts * 9176 + out.length * 37);
    let task;
    try {
      task = GH.buildFamilyTask(name, rng, 3);
    } catch (e) {
      drops.error++;
      continue;
    }
    task.meta.auto_depth = plan.autoDepth;
    task.meta.depth = plan.autoDepth;
    task.meta.generator_steps = fam.steps;
    task.meta.generator_depth = fam.steps;
    task.meta.depth_label = plan.label;
    task.meta.depth_proof = depthProof(fam, plan);
    task.meta.auto_showcase_family = name;
    const h = hashTask(task);
    if (seen.has(h)) { drops.duplicate++; continue; }
    const audit = auditTask(task);
    if (audit.some(a => !a.ok)) {
      if (audit.find(a => a.check === "not-trivial-baseline" && !a.ok)) drops.trivial++;
      else drops.audit++;
      continue;
    }
    seen.add(h);
    const idx = String(out.length + 1).padStart(3, "0");
    const gif = cardGif(task, `auto_depth_d${plan.autoDepth}_${idx}_${name}.gif`);
    out.push({ id: `auto_d${plan.autoDepth}_${idx}`, autoDepth: plan.autoDepth, family: name, title: name, gif, task, audit });
  }
  if (out.length !== plan.count) throw new Error(`depth ${plan.autoDepth}: only generated ${out.length}/${plan.count}`);
  return { cards: out, drops, attempts, families: families.map(([name]) => name) };
}
function renderCard(c) {
  const checks = c.audit.map(a => `<span class="${a.ok ? "ok" : "bad"}">${esc(a.check)}</span>`).join(" · ");
  const meta = `depth=${c.task.meta.depth} · family=${c.family} · generator_steps=${c.task.meta.generator_steps}`;
  return `<section class=card><div class=top><h2>${esc(c.title)}</h2><span>${esc(meta)}</span></div><p>${esc(c.task.meta.rule)}</p><img src="${esc(c.gif)}" alt="${esc(c.title)}"><div class=checks>${checks}</div></section>`;
}

function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const seedBase = 424242;
  const seen = new Set();
  const batches = PLAN.map(p => ({ plan: p, ...sampleDepth(p, seedBase, seen) }));
  const cards = batches.flatMap(b => b.cards);
  const bad = cards.flatMap(c => c.audit.filter(a => !a.ok).map(a => `${c.id}:${a.check}`));
  fs.writeFileSync(JSONL_OUT, cards.map(c => JSON.stringify(c.task)).join("\n") + "\n");
  fs.writeFileSync(JSON_OUT, JSON.stringify({
    generated_at: new Date(0).toISOString(),
    generator: "GRIDVID program-first automatic gen_hard loop",
    plan: PLAN.map(p => ({ auto_depth: p.autoDepth, count: p.count, label: p.label })),
    counts: PLAN.map(p => ({ auto_depth: p.autoDepth, count: cards.filter(c => c.autoDepth === p.autoDepth).length })),
    bad,
    batches: batches.map(b => ({ depth: b.plan.autoDepth, attempts: b.attempts, drops: b.drops, families: b.families })),
    cards: cards.map(c => ({ id: c.id, auto_depth: c.autoDepth, family: c.family, gif: c.gif, rule: c.task.meta.rule, audit: c.audit, task: c.task })),
  }, null, 2) + "\n");
  const html = `<!doctype html><meta charset=utf-8><title>GRIDVID Auto Depth Showcase</title><style>
body{margin:0;background:#101014;color:#ececf1;font:14px Inter,system-ui,sans-serif;padding:24px}h1{margin:0;color:#67e8f9;font-size:26px}.lead{max-width:1120px;color:#c8c8d0;line-height:1.45}.section{margin-top:28px}.section h2{font-size:18px;color:#facc15}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(330px,1fr));gap:16px}.card{background:#18181d;border:1px solid #30303a;border-radius:8px;padding:12px}.top{display:flex;justify-content:space-between;gap:10px;align-items:baseline}.top h2{font-size:14px;margin:0;color:#93c5fd}.top span{font:10px ui-monospace,Menlo,monospace;color:#a1a1aa}p{line-height:1.35;color:#d4d4dc}img{width:100%;height:auto;image-rendering:pixelated;background:#000;border:1px solid #34343c}.checks{font:10px ui-monospace,Menlo,monospace;color:#a1a1aa;margin-top:8px}.ok{color:#86efac}.bad{color:#fb923c}
</style><h1>GRIDVID Auto Depth Showcase</h1><p class=lead>Pure automatic program-first generation loop. Exact requested mix: 50 depth-tier-1 tasks, 30 depth-tier-2 tasks, 20 depth-tier-3 tasks. Public task <code>meta.depth</code> now equals the tier; the older hand-authored family step count is preserved separately as <code>generator_steps</code>. No LLM, no hand-picking after generation; tasks are rejected by deterministic duplicate/trivial/copy/size/depth-record audits.</p>${bad.length ? `<p class=bad>${esc(bad.join(" · "))}</p>` : ""}
${PLAN.map(p => `<div class=section><h2>${esc(p.label)} — ${cards.filter(c => c.autoDepth === p.autoDepth).length}</h2><div class=grid>${cards.filter(c => c.autoDepth === p.autoDepth).map(renderCard).join("\n")}</div></div>`).join("\n")}`;
  fs.writeFileSync(HTML_OUT, html);
  console.log("wrote " + path.relative(process.cwd(), HTML_OUT));
  console.log("wrote " + path.relative(process.cwd(), JSON_OUT));
  console.log("wrote " + path.relative(process.cwd(), JSONL_OUT));
  console.log("cards " + cards.length + " · bad " + bad.length);
}

if (require.main === module) main();

module.exports = { main, HTML_OUT, JSON_OUT, JSONL_OUT };
