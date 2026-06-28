#!/usr/bin/env node
/* super_suggester.js — typed DSL-slice suggester prototype.
 *
 * This is intentionally NOT another scene template sampler. It emits a small,
 * typed, compatible DSL surface for one task: function schemas, argument slots,
 * difficulty/augmentation contracts, and dataset-record metadata.
 */
const crypto = require("crypto");
const E = require("./engine.js");

const TYPE_DB = {
  selector: ["all_objects", "where_predicate", "odd_by_property", "inside_frame", "same_relation_group", "ray_hit", "largest_component"],
  predicate: ["convex", "symmetric", "symmetry", "loop", "holes", "orientation", "size_class", "parity", "core_color", "skin_pattern", "relation_kind"],
  subobject: ["core", "border", "stripe", "checker", "diag", "spots", "corner", "split", "hole", "endpoint", "support_piece"],
  relation: ["same_color", "same_shape", "points_to", "inside", "left_of", "above", "touching_after_gravity", "supports", "connected_by_path", "analogous_to"],
  transform: ["extract", "remove", "recolor", "mirror_h", "flip_v", "rotate_180", "copy_to_slot", "connect", "fall_until_supported", "fill_hole", "fractal_expand"],
  layout: ["scattered_gap", "two_panel", "matrix_2x2", "inside_outside_frame", "support_structure", "maze_with_terminals", "school_counter_row", "game_level_room", "cartoon_motion_line"],
  output_policy: ["full_scene", "cropped_object", "compact_code", "answer_slot", "next_frame", "step_trace"],
  augmentation: ["task_color", "task_flip", "task_rot", "task_zoom", "example_position", "example_size", "example_skin", "example_count", "example_layout", "example_physics_timing"],
};

const SKIN_TEMPLATES = [
  { name: "core-swatch", slots: ["body_color", "core_color"], use: "subobject identity; core colour can drive dispatch" },
  { name: "checker-border", slots: ["body_color", "accent_color"], use: "texture target among similar silhouettes" },
  { name: "diagonal-stripe", slots: ["body_color", "accent_color", "orientation"], use: "orientation and internal pattern jointly vary" },
  { name: "split-half", slots: ["left_color", "right_color"], use: "analogy over parts, not whole-object colour" },
  { name: "hole-with-rim", slots: ["rim_color", "interior_color"], use: "topology plus subobject colouring" },
  { name: "cartoon-face", slots: ["body_color", "eye_color", "mouth_color"], use: "human-visible object identity without relying on text" },
];

const LAYOUT_TEMPLATES = [
  { name: "relation-row", slots: ["A", "B", "distractors"], use: "left/right/above/below relations vary while rule stays fixed" },
  { name: "support-tower", slots: ["base", "keystone", "upper_blocks"], use: "remove a support and predict collapse" },
  { name: "analogy-panels", slots: ["A", "B", "C", "answer"], use: "A:B :: C:? with explicit answer slot" },
  { name: "maze-room", slots: ["start", "goal", "walls", "moving_agent"], use: "pathfinding and future-state prediction" },
  { name: "inside-frame-scene", slots: ["frame", "inside_objects", "outside_objects"], use: "containment as a reusable argument" },
  { name: "physics-lab", slots: ["object", "force_source", "obstacle", "future_query"], use: "video/game/school mechanics as grid priors" },
];

const FUNCTION_SCHEMAS = [
  {
    name: "dispatch_by_subobject",
    family: "subobject/dispatch",
    minDifficulty: 0.68,
    maxDifficulty: 0.9,
    dynamic: false,
    slots: {
      objects: "selector",
      key: "subobject",
      predicate: "predicate",
      cases: ["transform"],
      output: "output_policy",
    },
    compatibleWith: ["select_by_relation", "analogy_transfer", "pattern_continuation"],
    avoidWith: [],
    taskAug: ["task_color"],
    exampleAug: ["example_position", "example_skin", "example_layout"],
    grammar: ["spawn", "dispatch", "case", "it", "where", "recolor", "mirror", "extract", "crop"],
    ruleShape: "An internal part of each object, not the outer silhouette, chooses the operation.",
  },
  {
    name: "select_by_relation",
    family: "relation",
    minDifficulty: 0.55,
    maxDifficulty: 0.82,
    dynamic: false,
    slots: {
      objects: "selector",
      relation: "relation",
      predicate: "predicate",
      transform: "transform",
      output: "output_policy",
    },
    compatibleWith: ["dispatch_by_subobject", "analogy_transfer"],
    avoidWith: ["whole_grid_symmetry_last"],
    taskAug: ["task_color", "task_flip"],
    exampleAug: ["example_position", "example_count", "example_layout"],
    grammar: ["spawn", "where", "extract", "recolor", "connect", "copy"],
    ruleShape: "The selected object is determined by a relation to another object.",
  },
  {
    name: "analogy_transfer",
    family: "analogy",
    minDifficulty: 0.7,
    maxDifficulty: 0.95,
    dynamic: false,
    slots: {
      source_pair: "relation",
      transferable_feature: "subobject",
      target: "selector",
      transform: "transform",
      output: "output_policy",
    },
    compatibleWith: ["dispatch_by_subobject", "select_by_relation", "pattern_continuation"],
    avoidWith: ["physics_future_state"],
    taskAug: ["task_color"],
    exampleAug: ["example_position", "example_size", "example_skin"],
    grammar: ["bind_transform", "apply", "copy", "recolor", "mirror", "spawn"],
    ruleShape: "Infer A→B as a typed transform, then apply it to C.",
  },
  {
    name: "physics_future_state",
    family: "dynamic/physics",
    minDifficulty: 0.72,
    maxDifficulty: 1,
    dynamic: true,
    slots: {
      scene: "layout",
      causal_piece: "subobject",
      relation: "relation",
      query: "output_policy",
      transform: "transform",
    },
    compatibleWith: ["support_collapse", "dynamic_analogy"],
    avoidWith: ["whole_grid_symmetry_last"],
    taskAug: [],
    exampleAug: ["example_position", "example_count", "example_physics_timing"],
    grammar: ["spawn", "run", "cut", "gravity", "magnet", "well", "path", "spill", "shatter"],
    ruleShape: "A visible causal change happens; output predicts the future state for analogous objects.",
  },
  {
    name: "support_collapse",
    family: "dynamic/structure",
    minDifficulty: 0.62,
    maxDifficulty: 0.88,
    dynamic: true,
    slots: {
      structure: "layout",
      removed_piece: "subobject",
      support_relation: "relation",
      falling_transform: "transform",
      output: "output_policy",
    },
    compatibleWith: ["physics_future_state", "count_changed_objects"],
    avoidWith: [],
    avoidAug: ["task_rot"],
    taskAug: ["task_color"],
    exampleAug: ["example_layout", "example_count"],
    grammar: ["spawn", "remove", "run", "gravity", "fall_until_supported"],
    ruleShape: "Remove a keystone/support and predict which parts move because support changed.",
  },
  {
    name: "pattern_continuation",
    family: "pattern/fractal",
    minDifficulty: 0.5,
    maxDifficulty: 0.86,
    dynamic: false,
    slots: {
      motif: "subobject",
      layout: "layout",
      transform: "transform",
      output: "output_policy",
    },
    compatibleWith: ["analogy_transfer", "whole_grid_symmetry_last"],
    avoidWith: ["physics_future_state"],
    taskAug: ["task_color", "task_flip"],
    exampleAug: ["example_size", "example_layout"],
    grammar: ["paint", "grid_complete", "copy", "fractal_expand", "mesh"],
    ruleShape: "Continue or recursively expand a human-visible motif such as a frieze, border, or fractal.",
  },
  {
    name: "boolean_figure_xor",
    family: "figure/boolean",
    minDifficulty: 0.58,
    maxDifficulty: 0.84,
    dynamic: false,
    slots: {
      left_figure: "selector",
      right_figure: "selector",
      alignment: "relation",
      operation: "transform",
      output: "output_policy",
    },
    compatibleWith: ["pattern_continuation", "analogy_transfer"],
    avoidWith: ["physics_future_state"],
    taskAug: ["task_color", "task_flip"],
    exampleAug: ["example_size", "example_layout", "example_skin"],
    grammar: ["combine", "xor", "overlay_figs", "extract", "crop", "spawn"],
    ruleShape: "Align two figures and keep cells present in exactly one source figure.",
  },
  {
    name: "recursive_fractal_expand",
    family: "pattern/fractal",
    minDifficulty: 0.7,
    maxDifficulty: 0.95,
    dynamic: false,
    slots: {
      seed_motif: "subobject",
      replacement_rule: "transform",
      depth_code: "predicate",
      output: "output_policy",
    },
    compatibleWith: ["pattern_continuation", "analogy_transfer"],
    avoidWith: ["physics_future_state"],
    taskAug: ["task_color"],
    exampleAug: ["example_size", "example_layout"],
    grammar: ["fractal_expand", "copy", "scale", "mesh", "crop", "spawn"],
    ruleShape: "Infer a recursive motif replacement rule and emit the next full expansion with dimensions derived from depth.",
  },
  {
    name: "dynamic_analogy",
    family: "dynamic/analogy",
    minDifficulty: 0.78,
    maxDifficulty: 1,
    dynamic: true,
    slots: {
      demonstration_scene: "layout",
      query_scene: "layout",
      causal_relation: "relation",
      transferred_outcome: "transform",
      output: "output_policy",
    },
    compatibleWith: ["physics_future_state", "support_collapse"],
    avoidWith: ["whole_grid_symmetry_last"],
    taskAug: [],
    exampleAug: ["example_position", "example_physics_timing", "example_layout"],
    grammar: ["run", "cut", "spawn", "path", "magnet", "well", "gravity"],
    ruleShape: "Observe what happens in one mini-scene, then predict the analogous future in another scene.",
  },
  {
    name: "whole_grid_symmetry_last",
    family: "matrix/symmetry",
    minDifficulty: 0.48,
    maxDifficulty: 0.8,
    dynamic: false,
    slots: {
      object_rule: "transform",
      symmetry: "predicate",
      layout: "layout",
      output: "output_policy",
    },
    compatibleWith: ["pattern_continuation"],
    avoidWith: ["physics_future_state", "select_by_relation"],
    taskAug: ["task_color", "task_zoom"],
    exampleAug: ["example_position", "example_size"],
    grammar: ["grid_complete", "grid_flip", "grid_rotate", "spawn", "paint"],
    ruleShape: "First build/alter objects, then apply one whole-grid completion operation last.",
  },
  {
    name: "count_changed_objects",
    family: "number/causality",
    minDifficulty: 0.58,
    maxDifficulty: 0.86,
    dynamic: true,
    slots: {
      changed_by: "transform",
      count_target: "selector",
      relation: "relation",
      output: "output_policy",
    },
    compatibleWith: ["support_collapse", "physics_future_state"],
    avoidWith: ["pattern_continuation"],
    taskAug: ["task_color"],
    exampleAug: ["example_count", "example_layout"],
    grammar: ["tally", "where", "run", "remove", "spawn"],
    ruleShape: "Count only objects whose state changed due to a causal rule, not all objects.",
  },
];

const EXAMPLE_VALUES = {
  selector: ["where skin_pattern is checker", "where core_color is red", "objects inside the frame", "the object pointed to by the arrow", "same-colour pairs", "upper blocks supported by the red keystone", "largest xor island"],
  predicate: ["loop", "orientation=wide", "symmetry=none", "core_color", "skin_pattern", "supports", "points_to"],
  subobject: ["core", "border", "checker skin", "diagonal stripe", "hole", "red keystone", "endpoint marker"],
  relation: ["same_color", "points_to", "inside", "supports", "left_of", "analogous_to", "connected_by_path"],
  transform: ["mirror_h", "flip_v", "extract", "recolor_to_marker", "copy_to_answer_slot", "fall_until_supported", "fractal_expand"],
  layout: ["support-tower", "analogy-panels", "inside-frame-scene", "maze-room", "relation-row", "physics-lab"],
  output_policy: ["full_scene", "cropped_object", "answer_slot", "compact_code", "next_frame", "step_trace"],
};

function pick(rng, xs) { return xs[rng.int(0, xs.length - 1)]; }
function rand01(rng) { return rng.int(0, 1000000) / 1000000; }
function sampleRange(rng, lo, hi) { return +(lo + (hi - lo) * rand01(rng)).toFixed(2); }
function uniq(xs) { return [...new Set(xs.filter(x => x != null && x !== ""))]; }
function stableCode(payload) {
  return "SS-" + crypto.createHash("sha1").update(JSON.stringify(payload)).digest("hex").slice(0, 10);
}
function schemaByName(name) {
  const s = FUNCTION_SCHEMAS.find(x => x.name === name);
  if (!s) throw new Error("unknown schema " + name);
  return s;
}
function compatible(a, b) {
  if (a.name === b.name) return false;
  if (a.avoidWith.includes(b.name) || b.avoidWith.includes(a.name)) return false;
  if (a.dynamic !== b.dynamic) return false;
  return a.compatibleWith.includes(b.name) || b.compatibleWith.includes(a.name);
}
function valuesForType(t, dynamic = false) {
  if (t === "output_policy") return dynamic ? ["next_frame", "step_trace", "full_scene"] : ["full_scene", "cropped_object", "compact_code", "answer_slot"];
  if (t === "layout") return dynamic ? ["support-tower", "maze-room", "physics-lab"] : ["relation-row", "analogy-panels", "inside-frame-scene", "school_counter_row"];
  return EXAMPLE_VALUES[t] || TYPE_DB[t] || [t];
}
function sampleArguments(rng, schema) {
  const args = {};
  for (const [slot, typ] of Object.entries(schema.slots)) {
    if (Array.isArray(typ)) args[slot] = typ.map(t => pick(rng, valuesForType(t, schema.dynamic)));
    else args[slot] = pick(rng, valuesForType(typ, schema.dynamic));
  }
  return args;
}
function exposedTypesFor(rng, schemas, functions) {
  const dynamic = schemas.some(s => s.dynamic);
  const used = {};
  schemas.forEach((schema, i) => {
    const fn = functions[i];
    for (const [slot, typ] of Object.entries(schema.slots)) {
      const typs = Array.isArray(typ) ? typ : [typ];
      const vals = Array.isArray(fn.arguments[slot]) ? fn.arguments[slot] : [fn.arguments[slot]];
      typs.forEach((t, j) => {
        used[t] = used[t] || [];
        used[t].push(vals[Math.min(j, vals.length - 1)]);
      });
    }
  });
  const out = {};
  for (const [typ, vals] of Object.entries(used)) {
    const selected = uniq(vals);
    const domain = valuesForType(typ, dynamic);
    const extras = [];
    let guard = 0;
    while (selected.length + extras.length < Math.min(6, selected.length + 3) && guard++ < 40) {
      const cand = pick(rng, domain);
      if (!selected.includes(cand) && !extras.includes(cand)) extras.push(cand);
    }
    out[typ] = { selected, alternatives: extras, full_domain_size: domain.length };
  }
  return out;
}
function mergedAugmentations(schemas) {
  const task = [...new Set(schemas.flatMap(s => s.taskAug))].filter(a => schemas.every(s => s.taskAug.includes(a)));
  const example = [...new Set(schemas.flatMap(s => s.exampleAug))];
  const avoid = uniq(schemas.flatMap(s => s.avoidAug || []));
  return { task_level: task, example_level: example, avoid };
}
function rejectedCombos(schemas) {
  const out = [];
  for (const a of schemas) for (const bad of a.avoidWith) out.push({ rejected: [a.name, bad], reason: "declared incompatible: " + a.name + " avoids " + bad });
  return out.slice(0, 4);
}
function suggestionToPrompt(s) {
  const lines = [];
  lines.push("Generate ONE GRIDVID task using only this typed DSL slice.");
  lines.push("Rule: " + s.rule_description);
  lines.push("Difficulty target: " + s.difficulty);
  lines.push("Expose functions:");
  for (const f of s.dsl_suggestions.functions) {
    lines.push(`- ${f.name}(${Object.entries(f.arguments).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join("|") : v}`).join(", ")})`);
  }
  lines.push("Allowed grammar: " + s.dsl_suggestions.exposed_grammar.join(", "));
  lines.push("Allowed typed values:");
  for (const [typ, spec] of Object.entries(s.dsl_suggestions.exposed_types)) {
    lines.push(`- ${typ}: ${spec.selected.concat(spec.alternatives).join(", ")}`);
  }
  lines.push("Task-level augmentations: " + (s.dsl_suggestions.augmentations.task_level.join(", ") || "none"));
  lines.push("Example-level variation: " + s.dsl_suggestions.augmentations.example_level.join(", "));
  lines.push("Invariant axes: " + s.dsl_suggestions.invariant_axes.join(", "));
  lines.push("Use skins/layout hints: " + s.dsl_suggestions.skin_templates.map(x => x.name).join(", ") + " / " + s.dsl_suggestions.layout_templates.map(x => x.name).join(", "));
  return lines.join("\n");
}
function pseudoDslPlan(s) {
  const lines = [];
  lines.push("# PLAN ONLY: typed slice; not yet a validated scene");
  lines.push("rule " + s.rule_description);
  lines.push("difficulty " + s.difficulty);
  lines.push("examples rand 3 5");
  for (const f of s.dsl_suggestions.functions) {
    lines.push("");
    lines.push("# function " + f.name);
    for (const [k, v] of Object.entries(f.arguments)) lines.push("#   " + k + " = " + (Array.isArray(v) ? v.join(" | ") : v));
  }
  lines.push("");
  lines.push("# exposed grammar: " + s.dsl_suggestions.exposed_grammar.join(" "));
  lines.push("# example variation: " + s.dsl_suggestions.augmentations.example_level.join(" "));
  return lines.join("\n");
}
function adversarialChecks(s) {
  const checks = [];
  checks.push({
    check: "small-slice",
    ok: s.dsl_suggestions.exposed_grammar.length <= 18,
    note: "Model should not see the whole DSL; exposed grammar count = " + s.dsl_suggestions.exposed_grammar.length,
  });
  checks.push({
    check: "typed-arguments",
    ok: s.dsl_suggestions.functions.every(f => Object.keys(f.arguments).length >= 3),
    note: "Every selected function should have explicit slot values.",
  });
  checks.push({
    check: "compatibility",
    ok: s.dsl_suggestions.compatibility.chosen_are_pairwise_compatible,
    note: "Chosen schemas must be pairwise compatible or explicitly use a layout bridge.",
  });
  const hasDynamic = s.dsl_suggestions.functions.some(f => FUNCTION_SCHEMAS.find(x => x.name === f.name).dynamic);
  const outputValues = s.dsl_suggestions.functions.flatMap(f => Object.values(f.arguments)).flat();
  checks.push({
    check: "output-policy",
    ok: hasDynamic || !outputValues.some(x => x === "next_frame"),
    note: hasDynamic ? "Dynamic slice may ask for next-frame or step-trace output." : "Static slice must not ask for next_frame.",
  });
  checks.push({
    check: "compilable-to-validated-scene",
    ok: true,
    note: "This record is a typed PLAN; compile it to a real engine-validated prodigy-task with suggester_compile.compile() (PAN-176 — 9/11 schemas realise via program.js / gen_hard).",
  });
  return checks;
}
function isDynamicSchemaName(name) {
  return schemaByName(name).dynamic;
}
function suggestionIsDynamic(s) {
  return s.dsl_suggestions.functions.some(f => isDynamicSchemaName(f.name));
}
function normalizeDifficultyRange(raw) {
  if (raw == null || raw === "" || raw === "all") return null;
  let parts;
  if (Array.isArray(raw)) parts = raw;
  else parts = String(raw).split(/[,.:;_ -]+/).filter(Boolean);
  if (parts.length === 1) parts = [parts[0], parts[0]];
  if (parts.length < 2) return null;
  let lo = Number(parts[0]), hi = Number(parts[1]);
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return null;
  if (lo > 1 || hi > 1) { lo /= 10; hi /= 10; }
  if (lo > hi) [lo, hi] = [hi, lo];
  lo = Math.max(0, Math.min(1, lo));
  hi = Math.max(0, Math.min(1, hi));
  return { lo, hi, label: `${lo.toFixed(2)}-${hi.toFixed(2)}` };
}
function matchesMode(s, mode) {
  if (!mode || mode === "all") return true;
  const dyn = suggestionIsDynamic(s);
  if (mode === "dynamic") return dyn;
  if (mode === "static") return !dyn;
  return true;
}
function matchesDifficulty(s, range) {
  if (!range) return true;
  return s.difficulty >= range.lo && s.difficulty <= range.hi;
}
function makeSuggestion(seed, forcedNames = null) {
  const rng = E.makeRng(seed);
  let chosen = [];
  if (forcedNames) chosen = forcedNames.map(schemaByName);
  else {
    chosen.push(pick(rng, FUNCTION_SCHEMAS));
    const targetK = rng.int(1, 3);
    let guard = 0;
    while (chosen.length < targetK && guard++ < 80) {
      const cand = pick(rng, FUNCTION_SCHEMAS);
      if (chosen.every(s => compatible(s, cand))) chosen.push(cand);
    }
  }
  const functions = chosen.map(s => ({ name: s.name, family: s.family, rule_shape: s.ruleShape, arguments: sampleArguments(rng, s) }));
  const aug = mergedAugmentations(chosen);
  const diff = Math.min(1, Math.max(...chosen.map(s => sampleRange(rng, s.minDifficulty, s.maxDifficulty))) + 0.04 * (chosen.length - 1));
  const skins = [pick(rng, SKIN_TEMPLATES), pick(rng, SKIN_TEMPLATES)].filter((x, i, a) => a.findIndex(y => y.name === x.name) === i);
  const layouts = [pick(rng, LAYOUT_TEMPLATES), pick(rng, LAYOUT_TEMPLATES)].filter((x, i, a) => a.findIndex(y => y.name === x.name) === i);
  const rule = chosen.map(s => s.ruleShape).join(" Then ");
  const recordCore = { seed, functions, diff, aug, skins: skins.map(s => s.name), layouts: layouts.map(l => l.name) };
  const unique = stableCode(recordCore);
  const dslSuggestions = {
    functions,
    exposed_types: exposedTypesFor(rng, chosen, functions),
    exposed_grammar: [...new Set(chosen.flatMap(s => s.grammar))].sort(),
    augmentations: aug,
    invariant_axes: functions.flatMap(f => Object.keys(f.arguments).map(k => f.name + "." + k)),
    skin_templates: skins,
    layout_templates: layouts,
    compatibility: {
      chosen_are_pairwise_compatible: chosen.every((s, i) => chosen.slice(i + 1).every(t => compatible(s, t))),
      rejected_examples: rejectedCombos(chosen),
    },
  };
  const suggestion = {
    unique_code: unique,
    difficulty: +Math.min(1, diff).toFixed(2),
    depth: chosen.length + (chosen.some(s => s.dynamic) ? 1 : 0),
    dsl_suggestions: dslSuggestions,
    rule_description: rule,
    generator_model_thinking: [
      "Visible rationale: expose only " + functions.length + " compatible schema(s), not the whole DSL.",
      "Use example-level variation for incidental features; keep invariant axes fixed.",
      chosen.some(s => s.dynamic) ? "This is a dynamic/video prior; output policy may be next-frame or step-trace." : "This is static ARC-shaped unless output_policy asks for trace.",
    ],
    dsl_representation: {
      kind: "typed-suggestion-slice",
      schemas: functions.map(f => f.name),
      arguments: Object.fromEntries(functions.map(f => [f.name, f.arguments])),
      prompt: null,
    },
    object_level_json_representation: {
      status: "not_instantiated",
      kind: "representation_contract",
      object_schema: ["id", "shape", "cells", "color", "skin", "subobjects", "relations", "state"],
      relation_schema: TYPE_DB.relation,
      expected_objects: functions.map(f => ({ function: f.name, slots: f.arguments })),
    },
    json_grid_representation: {
      status: "not_instantiated",
      kind: "representation_contract",
      format: "prodigy-task",
      grid_values: "ARC palette 0..9",
      components: ["examples[].in/out frame lists", "in frame list", "out frame list"],
    },
    python_compiled_dsl_function: null,
    python_compiled_dsl_status: "Python-compiled inductive function still planned; the slice now compiles to a validated grid task via suggester_compile.compile() (PAN-176)",
  };
  suggestion.dsl_representation.prompt = suggestionToPrompt(suggestion);
  suggestion.dsl_representation.pseudo_dsl_plan = pseudoDslPlan(suggestion);
  suggestion.adversarial_checks = adversarialChecks(suggestion);
  return suggestion;
}

const PRESETS = [
  ["dispatch_by_subobject"],
  ["select_by_relation"],
  ["analogy_transfer"],
  ["physics_future_state"],
  ["support_collapse"],
  ["pattern_continuation"],
  ["dynamic_analogy"],
  ["whole_grid_symmetry_last"],
  ["count_changed_objects"],
  ["dispatch_by_subobject", "select_by_relation"],
  ["dispatch_by_subobject", "analogy_transfer"],
  ["select_by_relation", "connect_related_pairs"].filter(name => FUNCTION_SCHEMAS.some(s => s.name === name)),
  ["support_collapse", "count_changed_objects"],
  ["physics_future_state", "dynamic_analogy"],
  ["pattern_continuation", "whole_grid_symmetry_last"],
  ["analogy_transfer", "pattern_continuation"],
  ["select_by_relation", "analogy_transfer"],
  ["physics_future_state", "support_collapse"],
  ["dispatch_by_subobject", "pattern_continuation"],
  ["count_changed_objects", "physics_future_state"],
].filter(x => x.length);

function generateSuggestions(opts = {}) {
  const n = opts.n || 24, seedBase = opts.seedBase || 1, out = [];
  for (let i = 0; i < n; i++) out.push(makeSuggestion(seedBase * 1009 + i * 37 + 11, PRESETS[i % PRESETS.length]));
  return out;
}
function suggestTasks(opts = {}) {
  const count = opts.count || opts.n || 24;
  const seedBase = opts.seed || opts.seedBase || 1;
  const mode = opts.mode || "all";
  const difficultyRange = normalizeDifficultyRange(opts.difficulty);
  const rows = [];
  const seen = new Set();
  let scanned = 0;
  const maxScanned = Math.max(200, count * 120);
  while (rows.length < count && scanned < maxScanned) {
    const preset = PRESETS[scanned % PRESETS.length];
    const s = makeSuggestion(seedBase * 1009 + scanned * 37 + 11, preset);
    scanned++;
    if (seen.has(s.unique_code)) continue;
    if (!matchesMode(s, mode)) continue;
    if (!matchesDifficulty(s, difficultyRange)) continue;
    seen.add(s.unique_code);
    rows.push(s);
  }
  const warnings = [];
  if (rows.length < count) warnings.push(`underfilled: requested ${count}, found ${rows.length} after scanning ${scanned} candidates`);
  if (opts.difficulty && !difficultyRange) warnings.push("difficulty filter was ignored because it could not be parsed");
  return {
    generated_at: new Date(0).toISOString(),
    mode,
    requested_difficulty: opts.difficulty || null,
    normalized_difficulty: difficultyRange,
    count: rows.length,
    requested_count: count,
    scanned_candidates: scanned,
    selection_warnings: warnings,
    records: rows,
  };
}
function getCompatibilityDb() {
  const names = new Set(FUNCTION_SCHEMAS.map(s => s.name));
  const functionCompatibility = FUNCTION_SCHEMAS.flatMap(s => s.compatibleWith.map(t => ({ from: s.name, to: t, kind: "compatible", valid: names.has(t) })));
  const functionIncompatibility = FUNCTION_SCHEMAS.flatMap(s => s.avoidWith.map(t => ({ from: s.name, to: t, kind: "avoid", valid: names.has(t) })));
  const augmentationAvoid = FUNCTION_SCHEMAS.flatMap(s => (s.avoidAug || []).map(t => ({ from: s.name, to: t, kind: "avoid-augmentation", valid: TYPE_DB.augmentation.includes(t) })));
  return {
    types: TYPE_DB,
    function_schemas: FUNCTION_SCHEMAS,
    skin_templates: SKIN_TEMPLATES,
    layout_templates: LAYOUT_TEMPLATES,
    function_compatibility_edges: functionCompatibility,
    function_incompatibility_edges: functionIncompatibility,
    augmentation_avoid_edges: augmentationAvoid,
  };
}
function esc(s) {
  return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function renderHtml(payload) {
  const records = payload.records || payload;
  const meta = payload.records ? `<section class=meta>
    <b>Selection</b>: mode ${esc(payload.mode)} · requested ${esc(payload.requested_count)} · emitted ${esc(payload.count)} · scanned ${esc(payload.scanned_candidates)}
    ${payload.normalized_difficulty ? ` · difficulty ${esc(payload.normalized_difficulty.label)}` : ""}
    ${(payload.selection_warnings || []).length ? `<ul>${payload.selection_warnings.map(w => `<li>${esc(w)}</li>`).join("")}</ul>` : ""}
  </section>` : "";
  const cards = records.map(r => {
    const funcs = r.dsl_suggestions.functions.map(f => `<li><b>${esc(f.name)}</b> <span>${esc(f.family)}</span><pre>${esc(JSON.stringify(f.arguments, null, 2))}</pre></li>`).join("");
    const checks = (r.adversarial_checks || []).map(c => `<li class="${c.ok ? "ok" : "bad"}">${esc(c.check)}: ${esc(c.note)}</li>`).join("");
    return `<section class=card>
      <div class=top><h2>${esc(r.unique_code)}</h2><span>d${esc(r.difficulty)} · depth ${esc(r.depth)}</span></div>
      <p class=rule>${esc(r.rule_description)}</p>
      <div class=cols>
        <div><h3>Typed Functions</h3><ul>${funcs}</ul></div>
        <div><h3>Small DSL Slice</h3><pre>${esc(r.dsl_representation.prompt)}</pre></div>
      </div>
      <details open><summary>Pseudo DSL Plan</summary><pre>${esc(r.dsl_representation.pseudo_dsl_plan)}</pre></details>
      <details><summary>Dataset Record Shape</summary><pre>${esc(JSON.stringify({
        unique_code: r.unique_code,
        difficulty: r.difficulty,
        depth: r.depth,
        dsl_suggestions: r.dsl_suggestions,
        rule_description: r.rule_description,
        generator_model_thinking: r.generator_model_thinking,
        dsl_representation: r.dsl_representation,
        object_level_json_representation: r.object_level_json_representation,
        json_grid_representation: r.json_grid_representation,
        python_compiled_dsl_function: r.python_compiled_dsl_function,
      }, null, 2))}</pre></details>
      <h3>Adversarial Checks</h3><ul>${checks}</ul>
    </section>`;
  }).join("\n");
  return `<!doctype html><meta charset=utf-8><title>GRIDVID super suggester prototype</title><style>
body{margin:0;background:#101014;color:#ececf1;font:13px ui-monospace,Menlo,monospace;padding:24px}
h1{margin:0 0 6px;color:#67e8f9;font-size:24px}.lead{color:#b8b8c2;max-width:1100px;line-height:1.5}
.meta{border:1px solid #3f3f46;background:#18181b;border-radius:8px;padding:12px;margin:16px 0;color:#d4d4d8}.meta b{color:#facc15}
.card{border:1px solid #30303a;background:#17171d;border-radius:8px;padding:14px;margin:18px 0}.top{display:flex;align-items:center;justify-content:space-between;gap:12px}.top h2{font-size:16px;color:#93c5fd;margin:0}.top span{color:#facc15}
.rule{color:#f4f4f5;line-height:1.45}.cols{display:grid;grid-template-columns:minmax(260px,.8fr) minmax(360px,1.2fr);gap:14px}@media(max-width:850px){.cols{grid-template-columns:1fr}}
h3{font-size:12px;color:#86efac;margin:12px 0 6px}pre{white-space:pre-wrap;overflow:auto;background:#0d0d12;border:1px solid #2d2d35;border-radius:6px;padding:8px;color:#d4d4dc;font-size:11px}
ul{margin:0;padding-left:18px}li{margin:6px 0}.ok{color:#86efac}.bad{color:#fb923c}summary{cursor:pointer;color:#facc15}
</style><h1>GRIDVID Super Suggester Prototype</h1><p class=lead>This is the new level: typed task-suggestion records, not final solved scenes. Each record exposes a tiny compatible DSL slice with typed arguments, difficulty/depth, variation contracts, skin/layout hints, object/grid representation targets, and explicit caveats. It is deliberately honest when something is still a plan rather than validated DSL.</p>${meta}${cards}`;
}

function selfTest() {
  const rows = generateSuggestions({ n: 24, seedBase: 7 });
  const ids = new Set(rows.map(r => r.unique_code));
  const ok = rows.length === 24
    && ids.size === rows.length
    && rows.every(r => r.difficulty >= 0 && r.difficulty <= 1)
    && rows.every(r => r.depth >= 1)
    && rows.every(r => r.dsl_suggestions.functions.length >= 1)
    && rows.every(r => r.dsl_suggestions.compatibility.chosen_are_pairwise_compatible)
    && rows.every(r => r.dsl_representation.prompt.includes("Allowed grammar"))
    && rows.some(r => r.dsl_suggestions.functions.some(f => f.name === "dynamic_analogy"))
    && rows.some(r => r.dsl_suggestions.functions.some(f => f.name === "dispatch_by_subobject"));
  if (!ok) throw new Error("super_suggester self-test failed");
  const filtered = suggestTasks({ seed: 3, count: 8, mode: "static", difficulty: "3-7" });
  if (filtered.count !== 8 || filtered.records.some(r => suggestionIsDynamic(r) || r.difficulty < 0.3 || r.difficulty > 0.7)) {
    throw new Error("super_suggester filter self-test failed");
  }
  const mixed = generateSuggestions({ n: 80, seedBase: 9 }).filter(r => {
    const dyn = r.dsl_suggestions.functions.map(f => schemaByName(f.name).dynamic);
    return dyn.includes(true) && dyn.includes(false);
  });
  if (mixed.length) throw new Error("super_suggester emitted mixed static/dynamic rule salad");
  const db = getCompatibilityDb();
  const edgeLists = [db.function_compatibility_edges, db.function_incompatibility_edges, db.augmentation_avoid_edges];
  if (edgeLists.flat().some(e => !e.valid)) throw new Error("super_suggester compatibility DB has dangling edges");
  if (rows.some(r => Object.values(r.dsl_suggestions.exposed_types).some(t => (t.selected.length + t.alternatives.length) > 6))) {
    throw new Error("super_suggester exposed too much type surface");
  }
  return true;
}

if (require.main === module) {
  if (process.argv.includes("--self-test")) {
    selfTest();
    console.log("super_suggester: self-test PASS");
  } else if (process.argv.includes("--html")) {
    const seedIdx = process.argv.indexOf("--seed"), countIdx = process.argv.indexOf("--count");
    const seed = seedIdx >= 0 ? +process.argv[seedIdx + 1] : 1;
    const count = countIdx >= 0 ? +process.argv[countIdx + 1] : 8;
    console.log(renderHtml(suggestTasks({ seed, count })));
  } else {
    const seedIdx = process.argv.indexOf("--seed"), countIdx = process.argv.indexOf("--count");
    const seed = seedIdx >= 0 ? +process.argv[seedIdx + 1] : +(process.argv[3] || 1);
    const count = countIdx >= 0 ? +process.argv[countIdx + 1] : +(process.argv[2] || 8);
    const rows = generateSuggestions({ n: count, seedBase: seed });
    for (const r of rows) console.log(JSON.stringify(r));
  }
}

module.exports = {
  TYPE_DB,
  FUNCTION_SCHEMAS,
  SKIN_TEMPLATES,
  LAYOUT_TEMPLATES,
  makeSuggestion,
  generateSuggestions,
  suggestTasks,
  getCompatibilityDb,
  normalizeDifficultyRange,
  suggestionToPrompt,
  renderHtml,
  selfTest,
};
