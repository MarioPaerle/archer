#!/usr/bin/env node
/* suggester_compile.js — PAN-176: turn a super-suggester typed SLICE into a REAL,
 * engine-validated prodigy-task (kills the dishonest blanket "not-validated-scene").
 *
 * The super-suggester emits a typed DSL slice (function schema + typed slots) but
 * historically only a PLAN. This module compiles each suggestion to an actual task by
 * routing its primary function schema to a concrete realisation — either an
 * object-level program (program.js, PAN-119) or a whole-grid family (gen_hard) — then
 * validates it (teaching + baseline-hard). Coverage is HONEST: schemas with no current
 * realisation are reported `compilable:false` with a reason, not faked.
 *
 *   node suggester_compile.js --coverage          # which schemas compile, which are planned
 *   node suggester_compile.js --n 12 --seed 1     # compile a batch of suggestions → tasks (jsonl)
 *   node suggester_compile.js --self-test
 */
const crypto = require("crypto");
const E = require("./engine.js");
const B = require("./baseline.js");
const SS = require("./super_suggester.js");
const PROG = require("./program.js");
const G = require("./gen_hard.js");

// schema-name → realisation. {via:'program', prog} uses program.js LIBRARY; {via:'family', key} uses a gen_hard family.
// null = no current realisation (honestly reported as planned, with a reason).
const REALIZE = {
  dispatch_by_subobject:    { via: "program", prog: "dispatch_by_core", note: "object-level dispatch on the internal core colour" },
  select_by_relation:       { via: "family", key: "point_select", note: "selection determined by a relation (pointer→target)" },
  analogy_transfer:         { via: "family", key: "replicant", note: "per-colour function = inferred A→B transform re-applied" },
  physics_future_state:     { via: "family", key: "gravity_stack_collision", note: "predict the settled physical future state" },
  support_collapse:         { via: "family", key: "collapse_support", note: "remove a support; unsupported parts collapse" },
  pattern_continuation:     { via: "family", key: "fractal_continue", note: "continue/expand a human-visible motif" },
  boolean_figure_xor:       { via: "family", key: "iq_boolean_xor", note: "align two figures, keep cells in exactly one" },
  recursive_fractal_expand: { via: "family", key: "fractal_quadrant_expand", note: "recursive motif replacement, next expansion" },
  whole_grid_symmetry_last: { via: "family", key: "empty_structure_complete", note: "approx: whole-grid structure completion" },
  dynamic_analogy:          null,   // true two-scene VIDEO analogy — needs the dynamic/video tier, not a static pair
  count_changed_objects:    null,   // count only causally-changed objects — no clean static realisation yet
};

const PLANNED_REASON = {
  dynamic_analogy: "two-scene dynamic analogy needs paired VIDEO frames (dynamic tier), not a single static (IN,OUT)",
  count_changed_objects: "counting only causally-changed objects needs a before/after causal diff op not yet in the object layer",
};

function schemaNames() { return SS.FUNCTION_SCHEMAS.map(s => s.name); }

// pick the first function in the suggestion that has a realisation; else the first function (for the reason).
function pickDriver(suggestion) {
  const fns = suggestion.dsl_suggestions.functions;
  for (const f of fns) if (REALIZE[f.name]) return { fn: f, real: REALIZE[f.name] };
  return { fn: fns[0], real: REALIZE[fns[0].name] || null };
}

// validate a freshly built prodigy-task: teaching (every pair changes, examples vary) + baseline-hard survival.
function validateTask(task) {
  const reasons = [];
  const sig = e => JSON.stringify(e.out);
  if (!task.examples || task.examples.length < 2) reasons.push("need ≥2 examples");
  for (const e of task.examples || []) if (JSON.stringify(e.in) === JSON.stringify(e.out)) reasons.push("an example is identity (no teaching)");
  if (new Set((task.examples || []).map(sig)).size < 2) reasons.push("examples do not vary");
  const trivial = B.trivialSolve(task);
  if (trivial) reasons.push("baseline solves it 1-step (" + trivial + ")");
  return { validated: reasons.length === 0, reasons };
}

function compile(suggestion, opts = {}) {
  const { fn, real } = pickDriver(suggestion);
  const seed = opts.seed || 1;
  const base = {
    unique_code: suggestion.unique_code,
    driver_schema: fn.name,
    difficulty: suggestion.difficulty,
    rule_description: suggestion.rule_description,
  };
  if (!real) {
    return { ...base, compilable: false, via: "planned", reason: PLANNED_REASON[fn.name] || "no current realisation for schema " + fn.name, task: null, validated: false };
  }
  // some generators reject a degenerate draw (e.g. an invisible/undoable transform) by throwing, or
  // occasionally emit an identity/too-easy task → retry across seeds, keep the first VALIDATED one.
  const build = s => {
    if (real.via === "program") {
      const lib = PROG.LIBRARY[real.prog];
      const progDef = { ...lib, name: suggestion.unique_code, rule: suggestion.rule_description || lib.rule, concepts: suggestion.dsl_suggestions.functions.flatMap(f => f.family.split("/")).concat(lib.concepts) };
      return PROG.buildProgramTask(progDef, { seed: s });
    }
    return G.buildFamilyTask(real.key, E.makeRng(s * 2654435761 + 29), 3 + (s % 2));
  };
  let task = null, v = { validated: false, reasons: ["no draw produced a task"] }, lastErr = null;
  for (let a = 0; a < 10; a++) {
    let cand; try { cand = build(seed * 17 + a); } catch (e) { lastErr = e.message; continue; }
    const vv = validateTask(cand);
    if (vv.validated) { task = cand; v = vv; break; }
    if (!task) { task = cand; v = vv; }   // keep last as fallback
  }
  if (!task) return { ...base, compilable: false, via: real.via, reason: "build threw: " + lastErr, task: null, validated: false };
  // tag provenance: this task was produced from a suggester slice
  task.meta.from_suggestion = { unique_code: suggestion.unique_code, driver_schema: fn.name, via: real.via, realization: real.via === "program" ? real.prog : real.key };
  task.meta.compiled_dsl_status = "planned (PAN-176 future: Python-compiled inductive function)";
  return {
    ...base, compilable: true, via: real.via, realization: real.via === "program" ? real.prog : real.key, realize_note: real.note,
    validated: v.validated, validation_reasons: v.reasons,
    task, dims: task ? `${task.width}x${task.height}` : null, task_id: task ? task.meta.id : null,
  };
}

// honest replacement for the old `not-validated-scene: ok=false` adversarial check.
function instantiationCheck(compiled) {
  if (!compiled.compilable) return { check: "instantiation", ok: false, note: "PLAN ONLY — " + compiled.reason };
  if (!compiled.validated) return { check: "instantiation", ok: false, note: "compiled but failed validation: " + compiled.validation_reasons.join("; ") };
  return { check: "instantiation", ok: true, note: `compiled via ${compiled.via}:${compiled.realization} → validated ${compiled.dims} task ${compiled.task_id}` };
}

function compileBatch(opts = {}) {
  const n = opts.n || 12, seed = opts.seed || 1;
  const sug = SS.suggestTasks({ seed, count: n }).records;
  return sug.map((s, i) => compile(s, { seed: seed * 100 + i }));
}

function coverage() {
  return schemaNames().map(name => {
    const r = REALIZE[name];
    return { schema: name, compilable: !!r, via: r ? r.via : "planned", realization: r ? (r.via === "program" ? r.prog : r.key) : null, reason: r ? null : (PLANNED_REASON[name] || null) };
  });
}

function selfTest() {
  const cov = coverage();
  const ok = cov.filter(c => c.compilable).length;
  if (ok < 8) throw new Error("suggester_compile: coverage regressed (" + ok + "/11 compilable, expect ≥8)");
  // every compilable schema must actually build a VALIDATED task from a forced suggestion
  for (const name of schemaNames()) {
    if (!REALIZE[name]) continue;
    const s = SS.makeSuggestion(12345, [name]);
    const c = compile(s, { seed: 7 });
    if (!c.compilable) throw new Error(name + ": expected compilable, got " + c.reason);
    if (!c.task) throw new Error(name + ": no task produced");
    if (!c.validated) throw new Error(name + ": compiled task failed validation: " + c.validation_reasons.join("; "));
    if (c.task.format !== "prodigy-task") throw new Error(name + ": bad task format");
  }
  // planned schemas must be honestly reported as not compilable (not faked)
  for (const name of schemaNames()) {
    if (REALIZE[name]) continue;
    const s = SS.makeSuggestion(222, [name]);
    const c = compile(s, { seed: 3 });
    if (c.compilable) throw new Error(name + ": should be planned, but reported compilable");
    if (instantiationCheck(c).ok) throw new Error(name + ": planned schema must fail the instantiation check");
  }
  // determinism
  const a = compile(SS.makeSuggestion(5, ["dispatch_by_subobject"]), { seed: 4 }).task_id;
  const b = compile(SS.makeSuggestion(5, ["dispatch_by_subobject"]), { seed: 4 }).task_id;
  if (a !== b) throw new Error("suggester_compile: non-deterministic");
  return true;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const flag = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
  if (args.includes("--self-test")) { selfTest(); console.log("suggester_compile: self-test PASS"); }
  else if (args.includes("--coverage")) {
    const cov = coverage(); let ok = 0;
    for (const c of cov) { if (c.compilable) ok++; console.log((c.compilable ? "✓" : "·").padEnd(2), c.schema.padEnd(26), c.compilable ? `→ ${c.via}:${c.realization}` : `PLANNED — ${c.reason}`); }
    console.log(`\n${ok}/${cov.length} schemas compile to a real validated task; ${cov.length - ok} honestly planned.`);
  } else {
    const n = +flag("--n", 12), seed = +flag("--seed", 1), o = flag("-o", null);
    const batch = compileBatch({ n, seed });
    const tasks = batch.filter(c => c.compilable && c.validated).map(c => JSON.stringify(c.task));
    const summary = batch.map(c => ({ unique_code: c.unique_code, driver: c.driver_schema, compilable: c.compilable, validated: c.validated, via: c.via, dims: c.dims, task_id: c.task_id }));
    if (o) { require("fs").writeFileSync(o, tasks.join("\n") + "\n"); console.error(`suggester_compile: ${tasks.length}/${n} suggestions → validated tasks → ${o}`); }
    console.error(JSON.stringify(summary, null, 2));
  }
}

module.exports = { compile, compileBatch, coverage, instantiationCheck, validateTask, REALIZE, selfTest };
