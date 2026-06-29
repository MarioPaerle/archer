#!/usr/bin/env node
/* nfrs.js — Normal-Form Rule Signature: the SEMANTIC-DIVERSITY metric for the GRIDVID corpus.
 *
 * WHY (CORPUS_ARCHITECTURE.md §0 + §6, CORPUS_DESIGN.md §5). A corpus = CONCEPTS × INSTANCES. Colour,
 * position, size, count, seed are INCIDENTAL (they make instances, not ideas). "50k semantically different
 * puzzles" is honest only if we COUNT distinct concepts and disclose the ratio. This module canonicalizes
 * the search's MINIMAL certified program into a parameter-free signature string, so two tasks are
 * "semantically the same iff same NFRS". That makes effectiveConceptCount auditable and turns
 * "all-gravity / all-symmetric" into a BUILD-TIME failure (guardrail), not a surprise a human finds.
 *
 *   node nfrs.js --self-test
 *
 * Public API:
 *   nfrs(task)                         → canonical signature STRING (or 'UNSOLVED')
 *   behavioralSignature(prog, bank?)   → behaviour key over a fixed probe bank (merges text-distinct equals)
 *   effectiveConceptCount(tasks)       → # distinct NFRS keys
 *   dashboard(tasks)                   → { taskCount, effectiveConceptCount, ratio, nfrsHistogram, ... }
 *   guardrail(tasks, opts)             → { pass, violations, disclosure }  (build fails on any violation)
 */
const A = require("./arc_search.js");

// ----------------------------------------------------------------------------------------------------
// 0. atomic op-label → parameter-free CLASS TOKEN. Incidental params (colours, sizes) are DROPPED here.
//    The dihedral group {flipH,flipV,rot90,rot180,rot270,transpose} collapses to ONE token (they form a
//    group D4 — any product is another element, so the *kind* of symmetry op is incidental, not a concept).
// ----------------------------------------------------------------------------------------------------
const DIHEDRAL = new Set(["fliph", "flipv", "rot90", "rot180", "rot270", "transpose"]);

/* classToken: map ONE concrete op label (already lower-cased, param-stripped at the colon) to its class.
 * Unknown / future ops fall back to the op name uppercased so the signature never silently drops a stage. */
function classToken(rawLabel) {
  const label = String(rawLabel).trim();
  const base = label.toLowerCase();
  const head = base.split(":")[0];                 // strip parameters after ':' (recolor_all:7 → recolor_all)

  if (head.startsWith("colormap")) return "MAP_BY_COLOR";   // colormap:{...}  (learned per-colour map)
  if (head === "recolor_all") return "RECOLOR_CONST";        // recolor_all:N
  if (head === "swap") return "SWAP_COLORS";                 // swap:a,b
  if (DIHEDRAL.has(head)) return "DIHEDRAL";                 // the whole symmetry group → one token
  if (head.startsWith("gravity")) return "GRAVITY";          // gravity_down/up/left/right
  if (head === "keep_largest" || head === "keep_smallest") return "SELECT_SIZE";
  if (head === "remove_largest" || head === "remove_smallest") return "REMOVE_SIZE";
  if (head === "fill_holes") return "FILL";
  if (head === "outline_all") return "OUTLINE";
  if (head === "denoise") return "DENOISE";
  if (head.startsWith("complete_sym")) return "COMPLETE_SYM";
  if (head === "apply_legend") return "LEGEND";
  if (head === "crop_content") return "CROP";
  // future tokens we cannot know: stable, visible fallback (op name uppercased, params dropped)
  return head.toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "UNKNOWN";
}

// ----------------------------------------------------------------------------------------------------
// 1. CLASS PROPERTIES used for order-normalization.
//    - IDEMPOTENT: adjacent duplicates collapse (e.g. GRAVITY∘GRAVITY in the same direction settles once).
//      DIHEDRAL is NOT idempotent as a class (flipH∘flipV = rot180 ≠ identity) so it is excluded.
//    - CLASS_ORDER: a fixed total order to sort independent / commuting structural stages, so two programs
//      that differ only by the order of commuting stages get the SAME key.
// ----------------------------------------------------------------------------------------------------
const IDEMPOTENT = new Set(["GRAVITY", "FILL", "OUTLINE", "DENOISE", "COMPLETE_SYM", "CROP", "SELECT_SIZE", "REMOVE_SIZE"]);

// terminal/colour stages (LEGEND, MAP_BY_COLOR, RECOLOR_CONST, SWAP_COLORS) keep their RELATIVE position to
// structure because they generally do NOT commute with selection/morphology — we only re-order *within* the
// run of purely-structural commuting ops. A coarse but safe fixed order:
const CLASS_ORDER = {
  CROP: 0, DIHEDRAL: 1, GRAVITY: 2, FILL: 3, OUTLINE: 4, DENOISE: 5,
  COMPLETE_SYM: 6, SELECT_SIZE: 7, REMOVE_SIZE: 8,
  LEGEND: 50, MAP_BY_COLOR: 60, RECOLOR_CONST: 61, SWAP_COLORS: 62,
};
const orderOf = t => (t in CLASS_ORDER ? CLASS_ORDER[t] : 40);   // unknown ops sit between structure & colour
// stages that participate in commuting-reorder (the "structural" band); colour/legend stages are positional
const STRUCTURAL = new Set(["CROP", "DIHEDRAL", "GRAVITY", "FILL", "OUTLINE", "DENOISE", "COMPLETE_SYM", "SELECT_SIZE", "REMOVE_SIZE"]);

/* selectionKind: the coarse "what does this rule select on" facet (a concept-level facet, surfaced as a flag). */
function selectionKindOf(tokens) {
  if (tokens.includes("SELECT_SIZE") || tokens.includes("REMOVE_SIZE")) return "size";
  return "none";
}

// ----------------------------------------------------------------------------------------------------
// 2. NORMALIZE a token sequence: collapse idempotent adjacent dups, then sort each maximal run of adjacent
//    STRUCTURAL tokens by CLASS_ORDER (commuting-stage canonicalization), preserving the position of
//    non-structural (colour/legend/terminal) stages as separators.
// ----------------------------------------------------------------------------------------------------
function normalizeTokens(tokens) {
  // (a) collapse adjacent duplicates that are idempotent
  const collapsed = [];
  for (const t of tokens) {
    if (collapsed.length && collapsed[collapsed.length - 1] === t && IDEMPOTENT.has(t)) continue;
    collapsed.push(t);
  }
  // (b) sort within each maximal run of adjacent structural tokens
  const out = [];
  let run = [];
  const flush = () => { if (run.length) { run.sort((a, b) => orderOf(a) - orderOf(b)); out.push(...run); run = []; } };
  for (const t of collapsed) {
    if (STRUCTURAL.has(t)) run.push(t);
    else { flush(); out.push(t); }
  }
  flush();
  // (c) re-collapse idempotent adjacent dups that sorting may have brought together
  const final = [];
  for (const t of out) {
    if (final.length && final[final.length - 1] === t && IDEMPOTENT.has(t)) continue;
    final.push(t);
  }
  return final;
}

// ----------------------------------------------------------------------------------------------------
// 3. PROGRAM-LABEL parsing. solveTask(...).programLabels[i] = "op1 |> op2 |> op3".
// ----------------------------------------------------------------------------------------------------
function parseProgramLabel(progLabel) {
  if (!progLabel || typeof progLabel !== "string") return [];
  return progLabel.split("|>").map(s => s.trim()).filter(Boolean);
}

/* getMinimalProgramLabel: null-safe extraction of the search's MINIMAL certified program label. */
function getMinimalProgramLabel(task, opts = {}) {
  try {
    const s = A.solveTask(task, { allowColorMap: true, maxDepth: 3, ...opts });
    if (!s || !s.solvable || !Array.isArray(s.programLabels) || !s.programLabels.length) return null;
    return s.programLabels[0];
  } catch {
    return null;
  }
}

// ----------------------------------------------------------------------------------------------------
// 4. nfrs(task) → canonical signature STRING.
// ----------------------------------------------------------------------------------------------------
function nfrsFromProgramLabel(progLabel) {
  const ops = parseProgramLabel(progLabel);
  if (!ops.length) return "IDENTITY";
  const tokens = ops.map(classToken);
  const norm = normalizeTokens(tokens);
  const hasLegend = norm.includes("LEGEND");
  const hasColormap = norm.includes("MAP_BY_COLOR");
  const selectionKind = selectionKindOf(norm);
  // a stable, human-readable, fully-canonical key
  return [
    "SEQ[" + norm.join(">") + "]",
    "legend=" + (hasLegend ? 1 : 0),
    "cmap=" + (hasColormap ? 1 : 0),
    "sel=" + selectionKind,
  ].join("|");
}

function nfrs(task, opts = {}) {
  if (!task || !Array.isArray(task.examples) || !task.examples.length) return "UNSOLVED";
  const progLabel = getMinimalProgramLabel(task, opts);
  if (progLabel == null) return "UNSOLVED";
  return nfrsFromProgramLabel(progLabel);
}

/* atomicClasses(task): the SET of atomic class tokens in the task's minimal program (for the per-class cap). */
function atomicClasses(task, opts = {}) {
  const progLabel = getMinimalProgramLabel(task, opts);
  if (progLabel == null) return [];
  return [...new Set(parseProgramLabel(progLabel).map(classToken))];
}

// ----------------------------------------------------------------------------------------------------
// 5. behavioralSignature(prog, probeBank) — OPTIONAL refinement. Run a program on a fixed deterministic bank
//    of small canonical probe grids; key on the tuple of output hashes. Two programs with identical behaviour
//    on the bank collapse regardless of their text. `prog` may be a program-label string ("op |> op") OR an
//    array of {fn} steps. We rebuild executable steps from labels via the arc_search DSL when given a string.
// ----------------------------------------------------------------------------------------------------
const _keyGrid = g => (g && g.length ? g.map(r => r.join(",")).join("/") : "·null·");

/* buildProbeBank: ~12 small deterministic canonical grids exercising symmetry, gravity, holes, sizes, colours.
 * No RNG — fully reproducible so behaviour keys are stable across runs/machines. */
function buildProbeBank() {
  const blank = (h, w) => Array.from({ length: h }, () => new Array(w).fill(0));
  const set = (g, cells) => { for (const [r, c, v] of cells) g[r][c] = v; return g; };
  const banks = [];
  // 1. single cell
  banks.push(set(blank(5, 5), [[2, 2, 3]]));
  // 2. asymmetric L (breaks all dihedral symmetry)
  banks.push(set(blank(5, 5), [[1, 1, 4], [2, 1, 4], [2, 2, 4]]));
  // 3. two objects of distinct size (size selectors well-defined)
  banks.push(set(blank(6, 6), [[0, 0, 5], [4, 3, 2], [4, 4, 2], [5, 3, 2], [5, 4, 2]]));
  // 4. a frame with a hole (fill/outline bite)
  banks.push(set(blank(5, 5), [[1, 1, 7], [1, 2, 7], [1, 3, 7], [2, 1, 7], [2, 3, 7], [3, 1, 7], [3, 2, 7], [3, 3, 7]]));
  // 5. floating object (gravity moves it)
  banks.push(set(blank(6, 5), [[0, 1, 6], [0, 2, 6], [1, 1, 6]]));
  // 6. two colours, vertically split (colour maps differentiate)
  banks.push(set(blank(4, 6), [[1, 1, 3], [1, 2, 3], [2, 4, 8], [2, 5, 8]]));
  // 7. plus
  banks.push(set(blank(5, 5), [[1, 2, 4], [2, 1, 4], [2, 2, 4], [2, 3, 4], [3, 2, 4]]));
  // 8. legend-ish: a full-height divider col + key swatches + work object (legend ops bite)
  {
    const g = blank(5, 7);
    for (let r = 0; r < 5; r++) g[r][2] = 5;             // divider
    g[0][0] = 3; g[0][1] = 8;                            // key: 3->8
    g[1][0] = 4; g[1][1] = 9;                            // key: 4->9
    set(g, [[2, 4, 3], [2, 5, 3], [3, 4, 4]]);          // work objects in src colours
    banks.push(g);
  }
  // 9. noise speck + a real object (denoise bites)
  banks.push(set(blank(6, 6), [[0, 5, 2], [3, 2, 7], [3, 3, 7], [4, 2, 7], [4, 3, 7]]));
  // 10. three sizes
  banks.push(set(blank(7, 7), [[0, 0, 1], [3, 3, 2], [3, 4, 2], [6, 0, 9], [6, 1, 9], [5, 0, 9]]));
  // 11. tall thin object (transpose vs rot distinguish)
  banks.push(set(blank(6, 3), [[0, 0, 4], [1, 0, 4], [2, 0, 4], [3, 0, 4]]));
  // 12. checker-ish two-colour pattern
  banks.push(set(blank(4, 4), [[0, 0, 2], [0, 2, 3], [2, 0, 3], [2, 2, 2], [1, 1, 6]]));
  return banks;
}
const PROBE_BANK = buildProbeBank();

/* labelToSteps: rebuild executable DSL steps from a program-label string, using the live arc_search OPS.
 * Returns null if any op label cannot be reconstructed (then behaviour-keying falls back to the text key). */
function labelToSteps(progLabel) {
  const ops = parseProgramLabel(progLabel);
  if (!ops.length) return [];
  const steps = [];
  for (const lab of ops) {
    const head = lab.split(":")[0].toLowerCase();
    if (head === "colormap") {
      // colormap:{"3":8,...} — rebuild the map function directly from the JSON payload
      const j = lab.slice(lab.indexOf(":") + 1);
      let M; try { M = JSON.parse(j); } catch { return null; }
      const map = {}; for (const k of Object.keys(M)) map[+k] = M[k];
      steps.push({ fn: g => g.map(r => r.map(x => (x && x in map) ? map[x] : x)) });
      continue;
    }
    if (head === "recolor_all") {
      const c = +lab.split(":")[1];
      steps.push({ fn: g => g.map(r => r.map(x => x ? c : 0)) });
      continue;
    }
    if (head === "swap") {
      const [a, b] = lab.split(":")[1].split(",").map(Number);
      steps.push({ fn: g => g.map(r => r.map(x => x === a ? b : x === b ? a : x)) });
      continue;
    }
    // nullary ops: find a matching variant in the DSL by exact label
    let found = null;
    for (const op of A.OPS) {
      let variants = []; try { variants = op.variants([]); } catch { variants = []; }
      for (const v of variants) if (v.label === lab) { found = v; break; }
      if (found) break;
    }
    if (!found) return null;
    steps.push(found);
  }
  return steps;
}

function behavioralSignature(prog, probeBank = PROBE_BANK) {
  let steps;
  if (typeof prog === "string") {
    steps = labelToSteps(prog);
    if (steps == null) return "TEXT:" + prog;          // can't execute → fall back to text key (no false merges)
  } else if (Array.isArray(prog)) {
    steps = prog;
  } else {
    return "TEXT:null";
  }
  const outKeys = [];
  for (const g of probeBank) {
    let cur = g;
    try {
      for (const s of steps) { cur = s.fn(cur); if (!cur) { cur = null; break; } }
    } catch { cur = null; }
    outKeys.push(_keyGrid(cur));
  }
  return "BEHAV:" + outKeys.join("§");
}

/* nfrsBehavioral(task): NFRS refined by behaviour — if two solved tasks have text-distinct minimal programs
 * but identical behaviour on the probe bank, they share this key. Returns 'UNSOLVED' when unsolved. */
function nfrsBehavioral(task, opts = {}) {
  const progLabel = getMinimalProgramLabel(task, opts);
  if (progLabel == null) return "UNSOLVED";
  const textKey = nfrsFromProgramLabel(progLabel);
  const behav = behavioralSignature(progLabel);
  // the canonical text key is the primary identity; behaviour merges only WITHIN distinct text that behaves
  // identically. We key on behaviour so equivalent-but-differently-written programs collapse.
  return behav.startsWith("BEHAV:") ? behav : textKey;
}

// ----------------------------------------------------------------------------------------------------
// 6. effectiveConceptCount + dashboard.
// ----------------------------------------------------------------------------------------------------
function effectiveConceptCount(tasks, opts = {}) {
  const keys = new Set();
  for (const t of tasks) keys.add(nfrs(t, opts));
  keys.delete("UNSOLVED");                // unsolved tasks are not concepts
  return keys.size;
}

function dashboard(tasks, opts = {}) {
  const taskCount = tasks.length;
  const nfrsHistogram = {};
  const atomicClassHistogram = {};
  let unsolved = 0;
  for (const t of tasks) {
    const key = nfrs(t, opts);
    if (key === "UNSOLVED") unsolved++;
    nfrsHistogram[key] = (nfrsHistogram[key] || 0) + 1;
    for (const cls of atomicClasses(t, opts)) atomicClassHistogram[cls] = (atomicClassHistogram[cls] || 0) + 1;
  }
  const concepts = Object.keys(nfrsHistogram).filter(k => k !== "UNSOLVED");
  const effectiveConceptCount = concepts.length;
  const topNFRS = Object.entries(nfrsHistogram)
    .sort((a, b) => b[1] - a[1])
    .map(([key, count]) => ({ key, count, frac: count / Math.max(1, taskCount) }));
  return {
    taskCount,
    effectiveConceptCount,
    unsolved,
    ratio: effectiveConceptCount ? taskCount / effectiveConceptCount : Infinity,
    nfrsHistogram,
    atomicClassHistogram,
    topNFRS,
  };
}

// ----------------------------------------------------------------------------------------------------
// 7. guardrail(tasks, opts) — HARD build-time asserts. Returns violations; the build must fail on any.
// ----------------------------------------------------------------------------------------------------
/* _violationsFromDashboard: PURE cap logic over a computed dashboard (so it is unit-testable without running
 * the search). Mirrors §6: per-atomic-class cap, per-NFRS cap, concept floor, no-unsolved. */
function _violationsFromDashboard(db, opts = {}) {
  const atomicCap = opts.atomicCap ?? 0.25;          // no atomic class in >25% of tasks
  const perNfrsCap = Math.max(opts.nfrsCapFloor ?? 0.02, opts.nfrsCap ?? 0); // no single NFRS in >max(2%, ...)
  const minConcepts = opts.minConcepts ?? 1;
  const n = db.taskCount;
  const violations = [];
  for (const [cls, count] of Object.entries(db.atomicClassHistogram)) {
    const frac = count / Math.max(1, n);
    if (frac > atomicCap) violations.push({ kind: "atomic-class-dominates", class: cls, frac, cap: atomicCap, count });
  }
  for (const { key, count, frac } of db.topNFRS) {
    if (key === "UNSOLVED") continue;
    if (frac > perNfrsCap) violations.push({ kind: "nfrs-dominates", key, frac, cap: perNfrsCap, count });
  }
  if (db.effectiveConceptCount < minConcepts)
    violations.push({ kind: "too-few-concepts", effectiveConceptCount: db.effectiveConceptCount, min: minConcepts });
  if (db.unsolved > 0)
    violations.push({ kind: "unsolved-tasks", count: db.unsolved });
  return violations;
}

function guardrail(tasks, opts = {}) {
  const targetTasks = opts.targetTasks ?? 50000;     // the disclosure headline ("50000 tasks = ...")
  const db = dashboard(tasks, opts);
  const violations = _violationsFromDashboard(db, opts);
  // the disclosure sentence — always printed (no silent counting)
  const M = db.effectiveConceptCount ? (db.taskCount / db.effectiveConceptCount).toFixed(1) : "∞";
  const disclosure = `${targetTasks} tasks = ${db.effectiveConceptCount} concepts × ${M} instances/concept`;
  return { pass: violations.length === 0, violations, disclosure, dashboard: db };
}

module.exports = {
  nfrs, nfrsFromProgramLabel, nfrsBehavioral, atomicClasses,
  classToken, normalizeTokens, parseProgramLabel,
  behavioralSignature, buildProbeBank,
  effectiveConceptCount, dashboard, guardrail,
};

// ----------------------------------------------------------------------------------------------------
// 8. --self-test : generate ~40 tasks from each generator, compute the dashboard, PRINT the evidence.
//    KEY EVIDENCE: gen_underdetermined collapses to ~1 NFRS (all colormap = one concept); the others to a
//    handful — empirically proving the "all-gravity → all-symmetric" monotony the user complained about.
// ----------------------------------------------------------------------------------------------------
function fmtHist(h) {
  return Object.entries(h).sort((a, b) => b[1] - a[1]).map(([k, v]) => `      ${String(v).padStart(4)}  ${k}`).join("\n");
}

function selfTest() {
  console.log("nfrs self-test — semantic-diversity metric for the GRIDVID corpus\n");
  let pass = 0, fail = 0;
  const ok = (name, cond, extra = "") => { if (cond) { pass++; console.log("  ✓ " + name + (extra ? "  " + extra : "")); } else { fail++; console.log("  ✗ " + name + "  " + extra); } };

  // ---- unit checks on the canonicalizer (no generation needed) ----
  ok("dihedral ops collapse to ONE token", classToken("flipH") === "DIHEDRAL" && classToken("rot270") === "DIHEDRAL" && classToken("transpose") === "DIHEDRAL");
  ok("colormap drops its param", classToken('colormap:{"3":8}') === "MAP_BY_COLOR");
  ok("recolor_all/swap drop params", classToken("recolor_all:7") === "RECOLOR_CONST" && classToken("swap:3,5") === "SWAP_COLORS");
  ok("gravity dirs collapse", classToken("gravity_down") === "GRAVITY" && classToken("gravity_left") === "GRAVITY");
  ok("unknown op falls back to uppercased name", classToken("teleport_blob") === "TELEPORT_BLOB");
  ok("two colormap programs with different maps share one NFRS",
     nfrsFromProgramLabel('gravity_down |> colormap:{"3":8}') === nfrsFromProgramLabel('gravity_left |> colormap:{"1":2,"4":5}'),
     nfrsFromProgramLabel('gravity_down |> colormap:{"3":8}'));
  ok("idempotent adjacent dup collapses (gravity∘gravity → gravity)",
     nfrsFromProgramLabel("gravity_down |> gravity_down") === nfrsFromProgramLabel("gravity_down"));
  ok("commuting structural stages order-normalize",
     nfrsFromProgramLabel("outline_all |> gravity_down") === nfrsFromProgramLabel("gravity_down |> outline_all"));
  ok("UNSOLVED for an empty/garbage task", nfrs({}) === "UNSOLVED" && nfrs(null) === "UNSOLVED");

  // ---- the empirical evidence: per-generator effectiveConceptCount + NFRS histogram ----
  const N = 40;
  const gens = [
    { name: "gen_search", mod: require("./gen_search.js"), opts: { seed: 7, depth: 3 } },
    { name: "gen_underdetermined", mod: require("./gen_underdetermined.js"), opts: { seed: 11 } },
    { name: "gen_compositional", mod: require("./gen_compositional.js"), opts: { seed: 17 } },
  ];

  console.log("\n  ── EMPIRICAL EVIDENCE: concepts per generator (the monotony, measured) ──");
  const allTasks = [];
  const perGen = {};
  for (const g of gens) {
    const r = g.mod.generate(N, g.opts);
    const tasks = r.tasks;
    allTasks.push(...tasks);
    const db = dashboard(tasks);
    perGen[g.name] = db;
    console.log(`\n  ${g.name}: ${tasks.length} tasks → effectiveConceptCount = ${db.effectiveConceptCount}  (ratio ${db.ratio === Infinity ? "∞" : db.ratio.toFixed(1)} tasks/concept, ${db.unsolved} unsolved)`);
    console.log("    NFRS histogram:");
    console.log(fmtHist(db.nfrsHistogram));
    console.log("    atomic-class histogram:");
    console.log(fmtHist(db.atomicClassHistogram));
  }

  // headline assertions proving the monotony
  ok("gen_underdetermined collapses to ~1 concept (all colormap = one idea)",
     perGen["gen_underdetermined"].effectiveConceptCount <= 2,
     "eff=" + perGen["gen_underdetermined"].effectiveConceptCount);
  ok("each single generator yields only a HANDFUL of concepts (<= ~12)",
     gens.every(g => perGen[g.name].effectiveConceptCount <= 12));
  ok("the 3 generators together are still few concepts (the '3 meta-concepts' symptom)",
     effectiveConceptCount(allTasks) <= 30,
     "combined eff=" + effectiveConceptCount(allTasks));

  // ---- guardrail demonstration: the monotonous corpus FAILS the build ----
  console.log("\n  ── GUARDRAIL on the combined corpus (should FAIL — this is the point) ──");
  const gr = guardrail(allTasks, { targetTasks: 50000 });
  console.log("    disclosure: " + gr.disclosure);
  console.log("    pass: " + gr.pass + "   violations: " + gr.violations.length);
  for (const v of gr.violations.slice(0, 8)) console.log("      ✗ " + JSON.stringify(v));
  ok("guardrail FAILS the monotonous corpus (atomic class or NFRS dominates >cap)", gr.pass === false);
  ok("guardrail prints the disclosure sentence", /tasks = \d+ concepts × .* instances\/concept/.test(gr.disclosure));

  // ---- guardrail PASSES a synthetic well-balanced corpus (sanity: it is not always-fail) ----
  // 100 distinct concepts, 1 task each, classes spread → no class >25%, no NFRS >2%.
  const balancedNfrs = {}, balancedClasses = {};
  for (let i = 0; i < 100; i++) { balancedNfrs["SEQ[OP" + i + "]"] = 1; balancedClasses["CLS" + (i % 10)] = 10; }
  const balancedDb = {
    taskCount: 100, effectiveConceptCount: 100, unsolved: 0, ratio: 1,
    nfrsHistogram: balancedNfrs, atomicClassHistogram: balancedClasses,
    topNFRS: Object.entries(balancedNfrs).map(([key, count]) => ({ key, count, frac: count / 100 })),
  };
  ok("guardrail PASSES a balanced corpus (100 concepts, classes ≤10%)",
     _violationsFromDashboard(balancedDb).length === 0);
  // and a corpus where one class is 30% must FAIL on the atomic cap
  const skewDb = { ...balancedDb, atomicClassHistogram: { ...balancedClasses, CLS0: 30 } };
  ok("guardrail FAILS when one atomic class is 30% (>25% cap)",
     _violationsFromDashboard(skewDb).some(v => v.kind === "atomic-class-dominates"));

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) process.exit(1);
}

if (require.main === module && process.argv.includes("--self-test")) selfTest();
