#!/usr/bin/env node
/* llm_author.js — let the LLM be the AUTHOR (not a menu-picker). The model writes a PROGRAM: a scene spec +
 * a freely-composed rule AST (nest dispatch/mask/seq/apply over selectors/transforms/keys). The engine
 * executes it deterministically (OUT = rule(IN), correct by construction); an independent LLM solver-critic
 * then verifies the task is actually SOLVABLE (re-derive the test from the train pairs) — which works for
 * ARBITRARY novel rules, beyond the symbolic solver's fixed hypotheses.
 *
 *   node llm_author.js --compile prog.json -o task.json     # compile one authored program → a task
 *   node llm_author.js --grammar                            # the authoring grammar to give the LLM
 *   node llm_author.js --critic task.json                   # print the solver-critic prompt for a task
 *   node llm_author.js --check task.json "<grid>"           # check a critic's answer against the true test
 *   node llm_author.js --self-test
 */
const E = require("./engine.js");
const B = require("./baseline.js");
const P = require("./program.js");

// ---------- AST validation (reject anything the interpreter doesn't know → no silent garbage) ----------
const SEL = new Set(["all", "by_color", "by_core", "by_size", "by_kind", "has_hole", "in_region", "by_orientation", "largest", "smallest"]);
const TR = new Set(["identity", "recolor", "recolor_core", "swap_color", "mirror_h", "flip_v", "rotate_90", "rotate_180", "outline", "fill_hole", "remove", "fall", "translate", "recolor_to", "copy_shape", "reflect_pos"]);
const KEY = new Set(["color", "core_color", "size_class", "shape_kind", "quadrant", "has_hole", "orientation", "size_rank"]);
const REG = new Set(["half", "quadrant", "rect"]);
const PICK = new Set(["largest", "smallest", "unique_color", "unique_shape"]);
const REL = new Set(["recolor_to", "copy_shape", "reflect_pos"]);
function vTransform(t) { if (!t || !TR.has(t.t)) throw new Error("bad transform " + JSON.stringify(t)); if (REL.has(t.t) && !t.ref) throw new Error("relational transform needs a ref: " + JSON.stringify(t)); }
function vSel(s) { if (!s || !SEL.has(s.s)) throw new Error("bad selector " + JSON.stringify(s)); if (s.s === "in_region") vRegion(s.region); }
function vRegion(r) { if (!r || !REG.has(r.reg)) throw new Error("bad region " + JSON.stringify(r)); }
function vNode(n) {
  if (!n || !n.op) throw new Error("node missing op");
  switch (n.op) {
    case "bind": if (!n.name || !PICK.has(n.pick)) throw new Error("bad bind " + JSON.stringify(n)); return;
    case "apply": vSel(n.sel); vTransform(n.transform); return;
    case "dispatch": if (!n.key || !KEY.has(n.key.k)) throw new Error("bad key"); for (const t of Object.values(n.cases || {})) vTransform(t); if (n.default) vTransform(n.default); return;
    case "mask": vRegion(n.region); vNode(n.node); return;
    case "seq": if (!Array.isArray(n.steps) || !n.steps.length) throw new Error("seq needs steps"); n.steps.forEach(vNode); return;
    case "parallel": if (!Array.isArray(n.branches) || !n.branches.length) throw new Error("parallel needs branches"); n.branches.forEach(vNode); return;
    case "repeat": if (!(n.n >= 1)) throw new Error("repeat needs n"); vNode(n.node); return;
    default: throw new Error("unknown op " + n.op);
  }
}

// ---------- normalise common LLM schema slips (string transforms, true/false hole keys, colour names) ----------
const CNAME = { blue: 1, red: 2, green: 3, yellow: 4, grey: 5, gray: 5, magenta: 6, orange: 7, cyan: 8, maroon: 9 };
const toColor = v => (typeof v === "string" && CNAME[v.toLowerCase()] != null) ? CNAME[v.toLowerCase()] : v;
function normTransform(t) {
  if (typeof t === "string") return { t };                     // "outline" → {t:"outline"}
  if (t && t.op) throw new Error("a sub-node was used where a TRANSFORM is required (dispatch cases must be transforms)");
  if (t && t.t === "recolor" && t.color != null) t.color = toColor(t.color);
  if (t && t.t === "recolor_core" && t.color != null) t.color = toColor(t.color);
  return t;
}
function normNode(n) {
  if (!n || !n.op) return n;
  if (n.op === "apply") { if (typeof n.sel === "string") n.sel = { s: n.sel }; if (n.transform) n.transform = normTransform(n.transform); if (n.sel && n.sel.color != null) n.sel.color = toColor(n.sel.color); return n; }
  if (n.op === "dispatch") {
    const k = n.key && n.key.k, cases = {};
    for (let [v, t] of Object.entries(n.cases || {})) {
      if (k === "has_hole") v = (v === "true" || v === "holed") ? "holed" : (v === "false" || v === "solid") ? "solid" : v;
      if (k === "color" || k === "core_color") v = toColor(v);
      cases[v] = normTransform(t);
    }
    n.cases = cases; if (n.default != null) n.default = normTransform(n.default); return n;
  }
  if (n.op === "mask") { n.node = normNode(n.node); return n; }
  if (n.op === "seq") { n.steps = (n.steps || []).map(normNode); return n; }
  if (n.op === "parallel") { n.branches = (n.branches || []).map(normNode); return n; }
  if (n.op === "repeat") { n.node = normNode(n.node); return n; }
  return n;
}
function normalizeProgram(prog) {
  const p = JSON.parse(JSON.stringify(prog));
  if (p.scene) { if (Array.isArray(p.scene.palette)) p.scene.palette = p.scene.palette.map(toColor); if (Array.isArray(p.scene.ensureColors)) p.scene.ensureColors = p.scene.ensureColors.map(toColor); if (Array.isArray(p.scene.corePalette)) p.scene.corePalette = p.scene.corePalette.map(toColor); if (Array.isArray(p.scene.ensureCores)) p.scene.ensureCores = p.scene.ensureCores.map(toColor); }
  p.rule = normNode(p.rule);
  return p;
}

// ---------- compile an authored program { scene, rule, idea } → a prodigy-task ----------
function sceneOpts(scene = {}) {
  const o = { K: scene.K || 5, palette: scene.palette || [2, 3, 4, 6, 8], kinds: scene.kinds || ["square", "plus", "Lshape", "triangle", "diamond"], gap: scene.gap == null ? 2 : scene.gap };
  if (scene.sizes) o.sizes = scene.sizes; else if (scene.size) o.size = scene.size;
  if (scene.withCore) { o.withCore = true; o.corePalette = scene.corePalette || [2, 1, 3]; if (scene.ensureCores) o.ensureCores = scene.ensureCores; }
  if (scene.holedMix) o.holedMix = true;
  if (scene.ensureColors) o.ensureColors = scene.ensureColors;
  if (scene.H) o.H = scene.H; if (scene.W) o.W = scene.W;
  if (scene.upperFrac) o.upperFrac = scene.upperFrac;
  if (scene.spreadHalves) o.spreadHalves = true;
  return o;
}
function compileProgram(progRaw, opts = {}) {
  const prog = normalizeProgram(progRaw);
  vNode(prog.rule);
  const so = sceneOpts(prog.scene || {});
  const def = { name: "authored", rule: prog.idea || "authored rule", concepts: ["authored", "llm"], node: prog.rule, prior: "llm-authored", sampler: rng => P.sampleScene(rng, { H: rng.int(15, 20), W: rng.int(15, 20), ...so }) };
  const task = P.buildProgramTask(def, { seed: opts.seed || 1, nEx: opts.nEx || 4 });
  task.meta.authored = { idea: prog.idea || null, scene: prog.scene || null, tree: P.serializeNode(prog.rule) };
  return task;
}

// teaching + baseline-hard pre-filter (cheap, before the LLM critic)
function preFilter(task) {
  if (task.examples.some(e => JSON.stringify(e.in) === JSON.stringify(e.out))) return "an example is identity (rule does nothing)";
  if (new Set(task.examples.map(e => JSON.stringify(e.out))).size < 2) return "examples do not vary";
  const triv = B.trivialSolve(task); if (triv) return "baseline-trivial (" + triv + ")";
  return null;
}

// ---------- grids ↔ text (for the solver-critic prompts) ----------
const gridText = g => g.map(r => r.join("")).join("\n");
function parseGrid(text) {
  const rows = (text.match(/^[0-9]{2,}$/gm) || text.split("\n").filter(l => /^[0-9 ]+$/.test(l.trim()) && l.trim().length)).map(l => l.trim().replace(/\s+/g, ""));
  const grid = rows.filter(r => /^[0-9]+$/.test(r)).map(r => r.split("").map(Number));
  const w = grid.length ? Math.max(...grid.map(r => r.length)) : 0;
  return grid.filter(r => r.length === w && w > 0);
}
function criticPrompt(task) {
  const last = v => v[v.length - 1];
  const lines = ["You are solving an ARC-style grid puzzle. Each cell is a digit 0-9 (0 = background). Study the input→output examples, infer the SINGLE rule, then produce the output grid for the test input.", ""];
  task.examples.forEach((e, i) => { lines.push(`Example ${i + 1} INPUT:`, gridText(last(e.in)), `Example ${i + 1} OUTPUT:`, gridText(last(e.out)), ""); });
  lines.push("TEST INPUT:", gridText(last(task.in)), "", "Reply with ONLY the test output grid (rows of digits, one row per line). No prose.");
  return lines.join("\n");
}
function checkAnswer(task, answerText) {
  const got = parseGrid(answerText), want = task.out[task.out.length - 1];
  return JSON.stringify(got) === JSON.stringify(want);
}

const GRAMMAR = `# AUTHOR a grid-puzzle PROGRAM. Output STRICT JSON: { "idea": "<one line>", "scene": {...}, "rule": <AST> }
#
# ★ DEPTH, NOT WIDTH. The best rule is a SHORT, DEEP chain (2 steps) where step 2 DEPENDS on step 1 — NOT a
#   wide pile of 4-5 independent per-object branches. A "wide" rule ("reds mirror, blues rotate, greens
#   remove, then recolour the smallest") is shallow and boring. A "deep" rule has ONE anchor idea that flows:
#   you must FIND something first, then act on the rest RELATIVE to it.
# ★ Prefer RELATIONAL rules: bind an ANCHOR object (the largest / the unique-coloured one / the odd-shaped
#   one), then make the OTHER objects depend on it — take its colour, copy its shape, mirror across it. The
#   solver has to identify the anchor to solve it. THIS is real depth.
# ★ Make it VISUAL / shape-based: objects morphing shape, mirroring, growing — not just category→recolour.
# ★ Keep dispatch SMALL (≤2 cases). Do not stack >2 steps. One clear, deep, surprising idea.
#
# scene: { "K": <3-7>, "kinds":[shapes], "palette":[colours 1-9], "size":N or "sizes":[N..],
#          "withCore":bool, "corePalette":[..], "ensureCores":[..], "holedMix":bool, "spreadHalves":bool }
#   shapes: square plus Lshape triangle diamond Tshape notch frame ring ; colours 1blue 2red 3green 4yellow 5grey 6magenta 7orange 8cyan 9maroon
#
# rule AST nodes:
#   {"op":"bind","name":"A","pick":"largest|smallest|unique_color|unique_shape"}   ← find the ANCHOR (depth!)
#   {"op":"apply","sel":<SEL>,"transform":<TR>}
#   {"op":"dispatch","key":{"k":<KEY>},"cases":{val:<TR>},"default":<TR>}          ← keep to ≤2 cases
#   {"op":"mask","region":<REGION>,"node":<NODE>} | {"op":"seq","steps":[<NODE>..]}
# SEL: {"s":"all"} {"s":"by_color","color":C} {"s":"by_size","cls":"small|large"} {"s":"by_kind","kind":K}
#      {"s":"by_orientation","orient":"wide|tall|square"} {"s":"has_hole","holed":true} {"s":"largest"} {"s":"smallest"} {"s":"in_region","region":<REGION>}
# TR (plain): {"t":"recolor","color":C} {"t":"recolor_core","color":C} {"t":"mirror_h"} {"t":"flip_v"} {"t":"rotate_90"}
#      {"t":"rotate_180"} {"t":"outline"} {"t":"fill_hole"} {"t":"remove"} {"t":"fall","dir":"down|up|left|right"} {"t":"identity"}
# TR (RELATIONAL — reference a bound anchor, this is the deep part):
#      {"t":"recolor_to","ref":"A"}   every selected object takes anchor A's colour
#      {"t":"copy_shape","ref":"A"}   every selected object MORPHS into anchor A's shape (keeps its own colour/place)
#      {"t":"reflect_pos","ref":"A","axis":"h|v"}   move each object to its mirror position across anchor A
# KEY: color core_color size_class shape_kind orientation has_hole size_rank
# REGION: {"reg":"half","side":"left|right|top|bottom"} {"reg":"quadrant","q":"TL|TR|BL|BR"}
#
# AVOID degenerate ops: do NOT rotate_180/mirror a symmetric shape (square/diamond/plus) — no visible change.
# Design the scene so the ANCHOR is UNAMBIGUOUS (e.g. for unique_color, exactly one object has a one-off colour;
# for largest, give DISTINCT sizes) and the relevant features VARY. Use 4-5 objects.`;

function selfTest() {
  // a DEEP RELATIONAL rule: find the largest object (the anchor), then every object takes its colour (depth, not width)
  const prog = { idea: "find the largest object; recolour every object to the largest one's colour",
    scene: { K: 5, kinds: ["square"], sizes: [2, 3, 4, 5, 6], palette: [2, 3, 4, 6, 8] },
    rule: { op: "seq", steps: [
      { op: "bind", name: "A", pick: "largest" },
      { op: "apply", sel: { s: "all" }, transform: { t: "recolor_to", ref: "A" } },
    ] } };
  const t = compileProgram(prog, { seed: 3 });
  if (t.format !== "prodigy-task") throw new Error("compile failed");
  if (t.examples.length < 3) throw new Error("too few examples");
  if (preFilter(t)) throw new Error("novel task should pass pre-filter, got: " + preFilter(t));
  // critic round-trip: feeding the TRUE output back must check TRUE
  if (!checkAnswer(t, gridText(t.out[0]))) throw new Error("checkAnswer false on true output");
  if (checkAnswer(t, gridText(t.out[0].map(r => r.map(() => 0))))) throw new Error("checkAnswer true on wrong output");
  // invalid AST rejected
  let threw = false; try { compileProgram({ rule: { op: "frobnicate" }, scene: {} }); } catch (e) { threw = true; } if (!threw) throw new Error("invalid AST not rejected");
  return true;
}

if (require.main === module) {
  const fs = require("fs"), args = process.argv.slice(2), flag = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
  if (args.includes("--self-test")) { selfTest(); console.log("llm_author: self-test PASS"); }
  else if (args.includes("--grammar")) { console.log(GRAMMAR); }
  else if (args.includes("--compile")) { const prog = JSON.parse(fs.readFileSync(flag("--compile"), "utf8")); const t = compileProgram(prog, { seed: +flag("--seed", 1) }); const pf = preFilter(t); if (pf) { console.error("REJECT: " + pf); process.exit(2); } const o = flag("-o", null); if (o) fs.writeFileSync(o, JSON.stringify(t)); else console.log(JSON.stringify(t)); console.error("compiled OK (" + t.width + "x" + t.height + ", depth " + t.meta.depth + ")"); }
  else if (args.includes("--critic")) { const t = JSON.parse(fs.readFileSync(flag("--critic"), "utf8")); console.log(criticPrompt(t)); }
  else if (args.includes("--check")) { const t = JSON.parse(fs.readFileSync(flag("--check"), "utf8")); console.log(checkAnswer(t, args[args.length - 1]) ? "SOLVED" : "WRONG"); }
  else console.log("usage: --grammar | --compile prog.json | --critic task.json | --check task.json '<grid>' | --self-test");
}

module.exports = { compileProgram, preFilter, criticPrompt, checkAnswer, parseGrid, gridText, vNode, GRAMMAR };
