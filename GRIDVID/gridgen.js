#!/usr/bin/env node
/* gridgen.js — the ONE generator + an LLM-PROMPTABLE rule DSL.
 *
 * All verified rule families (gen2/gen3/gen4/gen5) merged into a single registry. A weak LLM writes a tiny
 * spec — `task <family> [k=v ...]`, one per line — and the deterministic engine instantiates it while solver2
 * RE-DERIVES and verifies it (unique + baseline-hard). The model only PICKS from the menu; it can never emit a
 * broken or unsolvable task — coherence and solvability are the engine's job, not the model's. So a bad model
 * still produces a huge, clean, correct corpus.
 *
 *   node gridgen.js --prompt                       # the grammar card to give the LLM
 *   node gridgen.js --n 2000 -o out/corpus.jsonl   # balanced verified corpus (one generator)
 *   node gridgen.js --from-specs specs.txt -o out/  # compile LLM-written specs → verified tasks
 *   node gridgen.js --self-test
 */
const E = require("./engine.js");
const B = require("./baseline.js");
const V2 = require("./solver2.js");
const G3 = require("./gen3.js");   // includes the best gen2 families
const G4 = require("./gen4.js");
const G5 = require("./gen5.js");
const GD = require("./gen_deep.js");    // deep relational (anchor-based)
const GL = require("./gen_logic.js");   // logical / IQ

// ---------- the unified family registry: name → { build(rng), desc, params } ----------
// `build` returns a full prodigy-task (or null). `params` documents the LLM-settable knobs (matched against the
// solver's re-derived rule text, so the model constrains the rule without us refactoring every builder).
const REG = {
  // per-object / relational
  odd_one_out:     { build: G3.FAMILIES.odd_recolor,            desc: "recolour the ODD object (the one different by colour/shape/size)", params: { to: "a colour" } },
  odd_remove:      { build: G3.FAMILIES.odd_remove,             desc: "remove the odd-one-out object", params: {} },
  odd_extract:     { build: G3.FAMILIES.odd_extract,            desc: "output ONLY the odd object, cropped", params: {} },
  recolor_largest: { build: G3.FAMILIES.recolor_to_largest_color, desc: "recolour every object to the colour of the LARGEST object", params: {} },
  recolor_majority:{ build: G3.FAMILIES.recolor_to_majority_color, desc: "recolour every object to the MAJORITY colour", params: {} },
  // skins (internal patterns)
  skin_dispatch:   { build: G3.FAMILIES.skin_dispatch,         desc: "each internal SKIN pattern triggers a different operation", params: {} },
  keep_skin:       { build: G3.FAMILIES.keep_skin,             desc: "keep only the object with a given skin pattern", params: {} },
  odd_skin:        { build: G3.FAMILIES.odd_skin_recolor,      desc: "recolour the object whose skin differs from the rest", params: {} },
  // structural / physics
  gravity:         { build: G3.FAMILIES.gravity,               desc: "every object falls until it settles", params: { dir: "down|up|left|right" } },
  fill_holes:      { build: G3.FAMILIES.fill_holes,            desc: "fill every hollow shape solid", params: {} },
  denoise:         { build: G3.FAMILIES.denoise,               desc: "remove the single-cell noise", params: {} },
  connect_pairs:   { build: G3.FAMILIES.connect_pairs,         desc: "connect each same-colour pair with a line", params: {} },
  remove_extreme:  { build: G3.FAMILIES.remove_extreme,        desc: "remove the largest or smallest object", params: {} },
  pipeline:        { build: G3.FAMILIES.pipeline,              desc: "2-step: denoise THEN recolour by size", params: {} },
  // complex (the hard ARC mechanics)
  containment:     { build: G4.FAMILIES.containment,           desc: "recolour objects by INSIDE vs OUTSIDE a frame", params: { inside: "colour", outside: "colour" } },
  boolean:         { build: G4.FAMILIES.boolean,               desc: "two panels A|B → A XOR/AND/OR/SUB B", params: { op: "xor|and|or|sub" } },
  analogy:         { build: G4.FAMILIES.analogy,               desc: "A:B::C:? — infer the A→B transform, apply to C", params: { transform: "mirror_h|flip_v|rotate_180" } },
  count_tally:     { build: G5.FAMILIES.count_tally,           desc: "output a line of (#objects) cells — counting", params: {} },
  count_majority:  { build: G5.FAMILIES.count_plurality,       desc: "output a block in the most-common object colour", params: {} },
  occlusion:       { build: G5.FAMILIES.occlusion,             desc: "remove the grey occluder, reconstruct the hidden part by symmetry", params: { axis: "h|v" } },
  // LOGICAL / IQ (reasoning, not style transfer)
  raven_matrix:    { build: GL.FAMILIES.raven_latin,           desc: "complete the 3×3 matrix so each row & column holds each colour once (Raven / Latin square)", params: {} },
  count_difference:{ build: GL.FAMILIES.count_diff,            desc: "output the DIFFERENCE of the two object counts as a line of marks (arithmetic)", params: {} },
};
// DEEP RELATIONAL anchor families (find an anchor — largest/smallest/uniquely-coloured/odd-shaped/holed — then
// every object depends on it). Fold them ALL in so ONE policy spans per-object, structural, relational AND logical.
for (const k of Object.keys(GD.FAMILIES)) REG[k] = { build: rng => GD.buildTask(k, rng), desc: GD.FAMILIES[k].idea, params: {} };
const FAMILIES = Object.keys(REG);

// translate a requested param value → a keyword that must appear in the solver's rule text
function paramKeyword(v) {
  const map = { h: "left-right", v: "top-bottom", xor: "xor", and: "and", or: " or ", sub: "sub", down: "gravity down", up: "gravity up", left: "gravity left", right: "gravity right", mirror_h: "mirror_h", flip_v: "flip_v", rotate_180: "rotate_180" };
  return (map[v] || String(v)).toLowerCase();
}

// verify a freshly built task and (optionally) require the requested params to appear in the rule
function verify(task, params) {
  if (!task) return null;
  if (task.examples.some(e => JSON.stringify(e.in) === JSON.stringify(e.out))) return null;
  if (new Set(task.examples.map(e => JSON.stringify(e.out))).size < 2) return null;
  if (B.trivialSolve(task)) return null;
  const sv = V2.solvable(task); if (!sv.solvable || !sv.unique) return null;
  const rule = (sv.rule || "").toLowerCase();
  if (params) for (const v of Object.values(params)) if (!rule.includes(paramKeyword(v))) return null;
  task.meta.rule = sv.rule + "."; task.meta.language_description = task.meta.rule; task.meta.solver = { rule: sv.rule, unique: true };
  return task;
}

// build ONE verified task for a family. Params are BEST-EFFORT: try to honour them within a budget, else fall
// back to any verified task of that family — so a weak model's spec ALWAYS yields a valid, solvable task.
function buildOne(family, rng, params, budget = 200) {
  const reg = REG[family]; if (!reg) throw new Error("unknown family '" + family + "'");
  const tryBuild = (p, b) => { for (let t = 0; t < b; t++) { let task; try { task = reg.build(rng); } catch (e) { continue; } const ok = verify(task, p); if (ok) { ok.meta.family = family; ok.meta.params_honoured = !!p; return ok; } } return null; };
  if (params) { const hit = tryBuild(params, budget); if (hit) return hit; }   // honour params if achievable
  return tryBuild(null, budget);                                               // else any verified task of the family
}

// ---------- LLM spec DSL: `task <family> [k=v ...]` ----------
function parseSpec(line) {
  const toks = line.trim().split(/\s+/); if (toks[0] !== "task" || !toks[1]) return null;
  const family = toks[1], params = {};
  for (const t of toks.slice(2)) { const [k, v] = t.split("="); if (k && v) params[k] = v; }
  return { family, params: Object.keys(params).length ? params : null };
}
function compileSpec(line, seed = 1) {
  const s = parseSpec(line); if (!s) return { ok: false, error: "bad spec (expected: task <family> [k=v])", line };
  if (!REG[s.family]) return { ok: false, error: "unknown family '" + s.family + "' (see --prompt)", line };
  const task = buildOne(s.family, E.makeRng(seed * 2654435761 + 7), s.params);
  return task ? { ok: true, task } : { ok: false, error: "could not satisfy spec within budget", line };
}
function generateFromSpecs(lines, seedBase = 1) {
  // robust to messy LLM output: ignore any line that isn't a `task ...` line (prose, ``` fences, numbering).
  const out = [], errors = []; let seen = 0;
  lines.forEach((raw, i) => { const line = raw.replace(/^\s*[-*\d.)]+\s*/, "").trim(); if (!/^task\s+\S/i.test(line)) return; seen++; const r = compileSpec(line, seedBase + i); if (r.ok) out.push(r.task); else errors.push(r); });
  return { records: out, errors, seen };
}

// ---------- live LLM bridge: prompt a (weak) model for specs, then compile+verify them ----------
const MODEL_ALIAS = { haiku: "claude-haiku-4-5-20251001", sonnet: "claude-sonnet-4-6", opus: "claude-opus-4-8" };
async function promptLLM(opts = {}) {
  const key = process.env.ANTHROPIC_API_KEY; if (!key) throw new Error("ANTHROPIC_API_KEY not set — export it to call a real model");
  const model = MODEL_ALIAS[opts.model] || opts.model || MODEL_ALIAS.haiku, nTasks = opts.tasks || 20;
  const prompt = promptCard() + `\n\nNow act as a task author. Write EXACTLY ${nTasks} diverse problem specs, one per line, using ONLY the families above. Output ONLY the \`task ...\` lines — no prose, no numbering, no code fences. Vary families and parameters widely.`;
  const res = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" }, body: JSON.stringify({ model, max_tokens: 1500, messages: [{ role: "user", content: prompt }] }) });
  if (!res.ok) throw new Error("API " + res.status + ": " + (await res.text()).slice(0, 200));
  const data = await res.json(), text = (data.content || []).map(b => b.text || "").join("\n");
  const compiled = generateFromSpecs(text.split("\n"), opts.seed || 1);
  return { model, raw: text, ...compiled };
}

// ---------- balanced corpus from the WHOLE registry (no LLM needed) ----------
function generate(opts = {}) {
  const n = opts.n || 100, rng = E.makeRng((opts.seed || 1) * 2654435761 + 211), fams = opts.families || FAMILIES;
  const out = [], seenId = new Set(), seenRule = new Set(); const perFam = {}; let i = 0, guard = 0;
  while (out.length < n && guard++ < n * 40) {
    const family = fams[i++ % fams.length];
    const task = buildOne(family, rng, null, 60);
    if (!task) continue;
    if (seenId.has(task.meta.id)) continue; seenId.add(task.meta.id);
    if (opts.distinct && seenRule.has(task.meta.solver.rule)) continue; seenRule.add(task.meta.solver.rule);
    perFam[family] = (perFam[family] || 0) + 1; out.push(task);
  }
  return { records: out, emitted: out.length, distinct_rules: seenRule.size, families: perFam };
}

// ---------- the prompt-card for the LLM ----------
function promptCard() {
  const lines = [];
  lines.push("# GRIDVID task DSL — write one `task` line per problem. The engine builds & verifies it; you only choose.");
  lines.push("# Syntax:  task <family> [key=value ...]    (omit params to randomise; lines starting with # are ignored)");
  lines.push("# Colours: blue red green yellow grey magenta orange cyan maroon");
  lines.push("# Families:");
  for (const f of FAMILIES) { const p = Object.entries(REG[f].params).map(([k, v]) => `${k}=<${v}>`).join(" "); lines.push(`  ${f}${p ? "  " + p : ""}\n      ${REG[f].desc}`); }
  lines.push("# Examples:");
  lines.push("  task containment inside=blue outside=yellow");
  lines.push("  task boolean op=xor");
  lines.push("  task analogy transform=rotate_180");
  lines.push("  task gravity dir=down");
  lines.push("  task occlusion axis=h");
  lines.push("  task odd_one_out to=cyan");
  lines.push("  task count_tally");
  lines.push("  task skin_dispatch");
  return lines.join("\n");
}

function selfTest() {
  // every family in the registry must build at least one verified task
  for (const f of FAMILIES) { const t = buildOne(f, E.makeRng(7), null, 120); if (!t) throw new Error("family '" + f + "' built nothing"); if (!V2.solvable(t).unique) throw new Error(f + " not uniquely solvable"); }
  // LLM spec round-trip with params honoured
  const specs = ["task boolean op=xor", "task gravity dir=up", "task containment inside=blue outside=red", "task occlusion axis=v", "task analogy transform=mirror_h", "garbage line", "task nonsense_family"];
  const r = generateFromSpecs(specs, 3);
  if (r.records.length !== 5) throw new Error("spec compile: expected 5 ok, got " + r.records.length + " (errors " + r.errors.length + ")");
  if (!r.records[0].meta.rule.toLowerCase().includes("xor")) throw new Error("boolean op=xor not honoured");
  if (!r.records[1].meta.rule.toLowerCase().includes("gravity up")) throw new Error("gravity dir=up not honoured");
  if (r.errors.length !== 1) throw new Error("expected 1 spec error (unknown family; the prose line is ignored), got " + r.errors.length);
  // balanced corpus covers many families + is deterministic
  const g = generate({ n: 40, seed: 4 }); if (Object.keys(g.families).length < 10) throw new Error("balanced corpus too few families: " + Object.keys(g.families).length);
  const a = generate({ n: 12, seed: 9 }).records.map(t => t.meta.id).join(","), b = generate({ n: 12, seed: 9 }).records.map(t => t.meta.id).join(",");
  if (a !== b) throw new Error("generate non-deterministic");
  return true;
}

if (require.main === module) {
  const args = process.argv.slice(2), flag = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
  if (args.includes("--self-test")) { selfTest(); console.log("gridgen: self-test PASS"); }
  else if (args.includes("--prompt")) { console.log(promptCard()); }
  else if (args.includes("--llm")) { promptLLM({ model: flag("--model", "haiku"), tasks: +flag("--tasks", 20), seed: +flag("--seed", 1) }).then(r => { const o = flag("-o", null); console.error(`${r.model}: wrote ${r.records.length}/${r.seen} task-lines (${r.errors.length} errors)`); for (const e of r.errors) console.error("  ✗ " + e.line + " — " + e.error); if (o) { require("fs").writeFileSync(o, r.records.map(t => JSON.stringify(t)).join("\n") + "\n"); console.error("→ " + o); } else console.error("\n--- raw model output ---\n" + r.raw); }).catch(e => { console.error("LLM error: " + e.message); process.exit(1); }); }
  else if (args.includes("--from-specs")) { const fs = require("fs"), lines = fs.readFileSync(flag("--from-specs"), "utf8").split("\n"); const r = generateFromSpecs(lines); const o = flag("-o", null); if (o) fs.writeFileSync(o, r.records.map(t => JSON.stringify(t)).join("\n") + "\n"); console.error(`compiled ${r.records.length} tasks, ${r.errors.length} errors`); for (const e of r.errors) console.error("  ✗ " + e.line + "  — " + e.error); }
  else { const n = +flag("--n", 100), seed = +flag("--seed", 1), o = flag("-o", null), r = generate({ n, seed, distinct: args.includes("--distinct") });
    if (o) { require("fs").writeFileSync(o, r.records.map(t => JSON.stringify(t)).join("\n") + "\n"); console.error(`wrote ${r.emitted} tasks → ${o}`); console.error("by family:", JSON.stringify(r.families)); }
    else { console.error(`${r.emitted} tasks, ${r.distinct_rules} distinct rules, ${Object.keys(r.families).length} families`); console.error(JSON.stringify(r.families)); } }
}
module.exports = { generate, compileSpec, generateFromSpecs, buildOne, promptCard, REG, FAMILIES };
