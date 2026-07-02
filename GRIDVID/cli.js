#!/usr/bin/env node
/* =============================================================================
 * cli.js — full agent-controllable CLI for gridvid.
 *
 * Everything the editor can do, scriptable from the shell so an agent can drive
 * the whole pipeline: author scenes, generate, augment, render, introspect.
 *
 *   node cli.js gen <scene.txt...> [-o dir] [--gif] [--cell N]
 *               [--seeds N] [--augment K] [--fps N] [--zoom-aug]
 *               [--zoom-in-only] [--materialize] [--materialize-cells K]
 *   node cli.js augment <video.json...> [-o dir] [--n N] [--seed N]
 *               [--no-d4] [--no-color] [--zoom-aug] [--zoom-in-only]
 *               [--materialize] [--materialize-cells K] [--gif]
 *   node cli.js render <video.json> [-o dir] [--gif] [--cell N] [--fps N]
 *   node cli.js shapes [--json]        list available shapes
 *   node cli.js dsl                    print the scene-DSL grammar
 *   node cli.js validate <video.json>  check a 2dgridvid
 *   node cli.js new <name> [kind]      scaffold a scene (basic|sorter|shooter|liquid|voronoi)
 *   node cli.js self-test              run engine sanity checks
 * ========================================================================== */
const fs = require("fs");
const path = require("path");
const E = require("./engine.js");
const GIF = require("./gif.js");
const Patch2D = require("./tokenizer/patch2d.js");
const Shape2D = require("./tokenizer/shape2d.js");
const Baseline = require("./baseline.js");   // dumb 1-step solver → "too simple" detector (--hard filter)
const GenHard = require("./gen_hard.js");     // program-first families (correct-by-construction) — the quality engine
const Reconcile = require("./reconcile.js");  // reconciliation layer: the LLM picks/ranks correct variants (mode-1)
const Seeded = require("./seeded.js");         // NVARC/BARC shape: seed the LLM from REAL ARC tasks + human descriptions
const CorpusIndex = require("./corpus_index.js"); // hierarchical DB → hand the agent RELATED exemplars (same priors)
const SuperSuggester = require("./super_suggester.js"); // PAN-176 typed DSL-slice suggester prototype
const Builder = require("./builder.js");                // the GOD BUILDER: hierarchical families + admits-graph + difficulty budget
const crypto = require("crypto");
const zlib = require("zlib");
const { isMainThread, workerData, parentPort } = require("worker_threads");

function flags(args) {
  const f = { _: [] };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "-o" || a === "--out") f.out = args[++i];
    else if (a === "--gif") f.gif = true;
    else if (a === "--html") f.html = true;
    else if (a === "--png") f.png = true;
    else if (a === "--cell") f.cell = +args[++i];
    else if (a === "--fps") f.fps = +args[++i];
    else if (a === "--seeds") f.seeds = +args[++i];
    else if (a === "--examples") f.examples = +args[++i];
    else if (a === "--augment") f.augment = +args[++i];
    else if (a === "--n") f.n = +args[++i];
    else if (a === "--count") f.count = +args[++i];
    else if (a === "--seed") f.seed = +args[++i];
    else if (a === "--no-d4") f.noD4 = true;
    else if (a === "--no-color") f.noColor = true;
    else if (a === "--wild") f.wild = true;
    else if (a === "--rate") f.rate = true;
    else if (a === "--zoom") f.zoom = +args[++i];
    else if (a === "--zoom-aug") f.zoomAug = true;
    else if (a === "--zoom-in-only") f.zoomInOnly = true;
    else if (a === "--materialize") f.materialize = true;
    else if (a === "--materialize-cells") f.materializeCells = +args[++i];
    else if (a === "--json") f.json = true;
    else if (a === "--open") f.open = true;
    else if (a === "--shards") f.shards = +args[++i];
    else if (a === "--seed-base") f.seedBase = +args[++i];
    else if (a === "--templates") f.templates = args[++i];
    else if (a === "--wild-frac") f.wildFrac = +args[++i];
    else if (a === "--max-attempts") f.maxAttempts = +args[++i];
    else if (a === "--k") f.k = +args[++i];
    else if (a === "--workers") f.workers = +args[++i];
    else if (a === "--node-rank") f.nodeRank = +args[++i];
    else if (a === "--num-nodes") f.numNodes = +args[++i];
    else if (a === "--endpoint") f.endpoint = args[++i];
    else if (a === "--model") f.model = args[++i];
    else if (a === "--temp") f.temp = +args[++i];
    else if (a === "--maxtok") f.maxtok = +args[++i];
    else if (a === "--retries") f.retries = +args[++i];
    else if (a === "--stub") f.stub = true;
    else if (a === "--static") f.static = true;
    else if (a === "--draw") f.draw = true;
    else if (a === "--dynamic") f.dynamic = true;
    else if (a === "--hard") f.hard = true;
    else if (a === "--objective") f.objective = args[++i];
    else if (a === "--mode") f.mode = args[++i];
    else if (a === "--difficulty") f.difficulty = args[++i];
    else if (a === "--target") f.target = +args[++i];
    else f._.push(a);
  }
  return f;
}
const stem = (file) => path.basename(file).replace(/\.[^.]+$/, "");
function writeVid(vid, base, dir, f) {
  if (f.zoom) vid = E.zoomVid(vid, f.zoom);   // external zoom: +K duplicates pixels, -K downsamples
  fs.mkdirSync(dir, { recursive: true });
  const p = path.join(dir, base);
  fs.writeFileSync(p + ".json", JSON.stringify(vid));
  if (f.gif) fs.writeFileSync(p + ".gif", Buffer.from(GIF.encodeGif({ frames: vid.frames, palette: E.ARC_PALETTE, cell: f.cell || 12, delayMs: 1000 / (vid.fps || 6) })));
  console.log(`  ${p}.json  (${vid.width}x${vid.height}, ${vid.frames.length}f)${f.gif ? " +gif" : ""}`);
}
function withSeed(text, seed) { return /^\s*seed\b/m.test(text) ? text.replace(/^\s*seed\b.*$/m, "seed " + seed) : "seed " + seed + "\n" + text; }

// ---- mass dataset sampler (PAN-114): template × seed × n_examples × wild/normal → coherent tasks ----
// Pure (no fs writes): returns {accepted, stats, templates}. The `generate-dataset` command wraps it with
// sharded gzip output. Coherence is the engine's job — every accepted task passed validateTask (ok+coherent),
// so there is NO per-task LLM. Deterministic: same templatesDir + seedBase + n ⇒ identical dataset.
function genDataset(opts = {}) {
  const templatesDir = opts.templatesDir || path.join(__dirname, "scenes", "library");
  const n = opts.n || 100, seedBase = opts.seedBase || 1;
  const wildFrac = opts.wildFrac == null ? 0.25 : opts.wildFrac;
  const cap = opts.maxAttempts || n * 30;
  const files = fs.readdirSync(templatesDir).filter(x => x.endsWith(".txt"));
  if (!files.length) throw new Error("no .txt templates in " + templatesDir);
  // probe each template once for its concept (= category, for balanced sampling) + whether it sets its own examples count + static/dynamic.
  let templates = files.map(file => {
    const text = fs.readFileSync(path.join(templatesDir, file), "utf8");
    let concepts = [], dynamic = false;
    try { concepts = E.runScene(E.withSeedText(text, seedBase), { noSim: true }).meta.concepts || []; } catch (e) { }
    try { const p = E.buildTask(text, { examples: 1, seed0: seedBase }); dynamic = [p.in, p.out, ...p.examples.flatMap(e => [e.in, e.out])].some(v => v.length > 1); } catch (e) { }
    return { file, stem: stem(file), text, concepts, category: concepts[0] || stem(file), declaresExamples: /^\s*examples\b/m.test(text), dynamic };
  });
  if (opts.static) templates = templates.filter(t => !t.dynamic);   // ARC-AGI-2-shape: clean grid→grid templates only
  const cats = {}; for (const t of templates) (cats[t.category] || (cats[t.category] = [])).push(t);
  const catKeys = Object.keys(cats);
  const rng = E.makeRng(seedBase * 2654435761 + 11);
  const bump = (o, k) => { o[k] = (o[k] || 0) + 1; };
  const accepted = [], seen = new Set();
  const stats = { attempts: 0, accepted: 0, duplicates: 0, errors: 0, rejected: 0, byReason: {}, byTemplate: {} };
  let i = 0;
  while (accepted.length < n && stats.attempts < cap) {
    stats.attempts++;
    const cat = catKeys[rng.int(0, catKeys.length - 1)];          // category uniform → balances priors across families
    const tpl = cats[cat][rng.int(0, cats[cat].length - 1)];      // template uniform within the category
    const seed0 = seedBase + (i++);
    const wild = rng.int(0, 999) < wildFrac * 1000;              // some fraction get the full wild augmentation
    const examples = opts.examples != null ? opts.examples : (tpl.declaresExamples ? undefined : rng.int(2, 5));
    let task;
    try { task = E.buildTask(tpl.text, { seed0, wild, examples }); }
    catch (e) { stats.errors++; bump(stats.byReason, "parse-error"); continue; }
    const te = task.meta.teaching;
    if (!te.ok || !te.coherent) { stats.rejected++; bump(stats.byReason, te.ok ? "incoherent" : "no-teaching"); continue; }
    if (opts.static) staticizeTask(task);   // collapse to single-frame grids (ARC-AGI-2 shape)
    if (opts.hard) { const triv = Baseline.trivialSolve(task); if (triv) { stats.rejected++; bump(stats.byReason, "too-trivial:" + triv.split(":")[0]); continue; } }   // drop 1-step-solvable
    const hash = crypto.createHash("sha1").update(JSON.stringify([task.examples.map(e => [e.in, e.out]), task.in, task.out])).digest("hex");
    if (seen.has(hash)) { stats.duplicates++; bump(stats.byReason, "duplicate"); continue; }   // content-hash dedup
    seen.add(hash);
    const id = hash.slice(0, 12);
    task.meta.id = id; task.meta.template = tpl.stem; task.meta.category = tpl.category; task.meta.seed0 = seed0;
    accepted.push({ id, task, template: tpl.stem, category: tpl.category });
    stats.accepted++; bump(stats.byTemplate, tpl.stem);
  }
  return { accepted, stats, templates };
}
// write accepted tasks as sharded gzip JSONL + manifest.jsonl (shared by single-thread + parallel paths).
function writeDataset(dir, accepted, shards, prefix = "") {
  fs.mkdirSync(dir, { recursive: true });
  const buckets = Array.from({ length: shards }, () => []);
  accepted.forEach((a, idx) => buckets[idx % shards].push(a));            // round-robin → even shards
  const manifest = [];
  buckets.forEach((bucket, si) => {
    const name = `${prefix}shard-${String(si).padStart(3, "0")}.jsonl.gz`;
    const body = bucket.map(a => JSON.stringify(a.task)).join("\n") + (bucket.length ? "\n" : "");
    fs.writeFileSync(path.join(dir, name), zlib.gzipSync(body));
    for (const a of bucket) manifest.push({
      id: a.id, shard: name, template: a.template, category: a.category,
      concepts: a.task.meta.concepts, difficulty: a.task.meta.difficulty,
      n_examples: a.task.meta.n_examples, wild: a.task.meta.wild,
      dims: a.task.width + "x" + a.task.height,
      teaching: { coherent: a.task.meta.teaching.coherent, examplesVary: a.task.meta.teaching.examplesVary },
    });
  });
  fs.writeFileSync(path.join(dir, `${prefix}manifest.jsonl`), manifest.map(m => JSON.stringify(m)).join("\n") + (manifest.length ? "\n" : ""));
}
function reportDataset(dir, stats, n, shards, workers) {
  const pct = stats.attempts ? (100 * stats.accepted / stats.attempts).toFixed(1) : "0";
  console.log(`generate-dataset → ${dir}`);
  console.log(`  accepted ${stats.accepted}/${n}  (attempts ${stats.attempts}, yield ${pct}%)  shards ${shards}  workers ${workers}  templates used ${Object.keys(stats.byTemplate).length}`);
  console.log(`  rejected ${stats.rejected}  duplicates ${stats.duplicates}  errors ${stats.errors}`);
  const reasons = Object.entries(stats.byReason).map(([k, v]) => `${k}:${v}`).join("  ");
  if (reasons) console.log("  by reason: " + reasons);
  if (stats.accepted < n) console.log("  ⚠ under target — raise --max-attempts / per-worker share, or check templates");
}
// load prodigy-task JSON from a directory: .task.json files AND shard-*.jsonl.gz (incl. node-prefixed).
function loadTasks(inDir) {
  const tasks = [];
  if (!fs.existsSync(inDir)) return tasks;
  for (const file of fs.readdirSync(inDir)) {
    const p = path.join(inDir, file);
    if (file.endsWith(".task.json")) { try { tasks.push(JSON.parse(fs.readFileSync(p, "utf8"))); } catch (e) { } }
    else if (/shard-\d+\.jsonl\.gz$/.test(file)) {
      try { zlib.gunzipSync(fs.readFileSync(p)).toString("utf8").split("\n").filter(Boolean).forEach(l => { try { tasks.push(JSON.parse(l)); } catch (e) { } }); } catch (e) { }
    }
  }
  return tasks;
}
// one prodigy-task → training records across the four core objectives (DESIGN/gridworld-foundation-v0.md §objectives).
function* objectiveRecords(task, which = "all") {
  const want = o => which === "all" || which === o;
  const id = (task.meta && task.meta.id) || null, last = v => v[v.length - 1];
  const exPairs = task.examples.map(e => ({ in: last(e.in), out: last(e.out) }));
  if (want("arc_pair"))
    yield { objective: "arc_pair", id, rule: task.meta.rule, concepts: task.meta.concepts, examples: exPairs, test_in: last(task.in), test_out: last(task.out) };
  if (want("next_frame")) {   // every multi-frame sequence → consecutive (frame[t] → frame[t+1]) deltas
    const seqs = task.examples.flatMap(e => [e.in, e.out]).concat([task.in, task.out]);
    for (const seq of seqs) for (let t = 0; t + 1 < seq.length; t++) yield { objective: "next_frame", id, frame: seq[t], next: seq[t + 1] };
  }
  if (want("inverse_dynamics")) {   // the IN→OUT transition → the rule/program that caused it (INDUCTION label)
    const P = task.meta.program || {};
    const program = (task.meta.representation || {}).program || P.tree || [];   // engine scene-DSL OR program.js AST
    const dsl_text = P.dsl_text || null, nl = P.nl || task.meta.rule || null;   // the aligned NL+DSL rule labels
    for (const e of task.examples) yield { objective: "inverse_dynamics", id, in: last(e.in), out: last(e.out), rule: task.meta.rule, nl, dsl_text, program };
  }
  if (want("object_aux")) {   // read object masks/bbox/color/count — segmented from the ACTUAL grid (robust to augmentation)
    const grid = last(task.in), objs = segmentGrid(grid);
    yield { objective: "object_aux", id, grid, objects: objs, count: objs.length };
  }
  if (want("solve_trace") && task.meta.trace) {   // the step-by-step "thinking-grids": IN → intermediate grids → OUT
    yield { objective: "solve_trace", id, rule: task.meta.rule, nl: (task.meta.program || {}).nl, steps: task.meta.trace };
  }
}
// 4-connected same-colour components of a grid (bg=0) → {color, r, c, h, w, size, cells(relative)}. Robust object readout.
function segmentGrid(g, bg = 0) {
  const H = g.length, W = g[0].length, seen = Array.from({ length: H }, () => new Array(W).fill(false)), objs = [];
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
    if (seen[r][c] || g[r][c] === bg) continue;
    const col = g[r][c], st = [[r, c]], cells = []; seen[r][c] = true;
    let r0 = r, r1 = r, c0 = c, c1 = c;
    while (st.length) { const [y, x] = st.pop(); cells.push([y, x]); if (y < r0) r0 = y; if (y > r1) r1 = y; if (x < c0) c0 = x; if (x > c1) c1 = x;
      for (const [dy, dx] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const ny = y + dy, nx = x + dx; if (ny >= 0 && nx >= 0 && ny < H && nx < W && !seen[ny][nx] && g[ny][nx] === col) { seen[ny][nx] = true; st.push([ny, nx]); } } }
    objs.push({ color: col, r: r0, c: c0, h: r1 - r0 + 1, w: c1 - c0 + 1, size: cells.length, cells: cells.map(([y, x]) => [y - r0, x - c0]) });
  }
  return objs;
}
// worker entry (PAN-123): each worker runs a disjoint seed slice and posts back its accepted tasks.
function runWorker() {
  const wd = workerData || {};
  const res = genDataset({ templatesDir: wd.templatesDir, n: wd.n, seedBase: wd.seedBase, wildFrac: wd.wildFrac, examples: wd.examples, maxAttempts: wd.maxAttempts, static: wd.static, hard: wd.hard });
  parentPort.postMessage({ accepted: res.accepted, stats: res.stats });
}

// ---- hierarchical function-menu proposer (PAN-132 / G0) ----
// Build a descriptor per library function (template) so the generator can curate a SMALL, coherent slice of the
// DSL per task. The small model never sees the whole grammar — only the sampled menu — so (a) complexity stays
// low, (b) composition is forced (fresh combo each time, not a template to copy), (c) adding functions is safe.
const WHOLE_GRID_RE = /\b(grid_rotate|grid_flip|grid_map|sort_rows|solve|grid_complete|unfold|crop)\b/;
function buildFunctionRegistry(templatesDir, seedBase = 1) {
  const files = fs.readdirSync(templatesDir).filter(x => x.endsWith(".txt"));
  if (!files.length) throw new Error("no .txt templates in " + templatesDir);
  return files.map(file => {
    const text = fs.readFileSync(path.join(templatesDir, file), "utf8");
    let concepts = [], difficulty = null;
    try { const w = E.runScene(E.withSeedText(text, seedBase), { noSim: true }); concepts = w.meta.concepts || []; difficulty = w.meta.difficulty; } catch (e) { }
    const vary = (text.match(/^\s*vary\s+(.+)$/m) || [, ""])[1].trim().split(/\s+/).filter(Boolean);
    const ruleM = text.match(/^\s*rule\s+(.+)$/m);
    const verbs = [...new Set(text.split(/\r?\n/).map(l => l.trim().split(/\s+/)[0]).filter(v => v && !v.startsWith("#")))];
    // dynamic = the built task is a VIDEO (any IN/OUT component has >1 frame). Static = clean grid→grid (ARC-AGI-2 shape).
    let dynamic = false;
    try { const p = E.buildTask(text, { examples: 1, seed0: seedBase }); dynamic = [p.in, p.out, ...p.examples.flatMap(e => [e.in, e.out])].some(v => v.length > 1); } catch (e) { }
    return {
      name: stem(file), file, category: concepts[0] || stem(file), concepts,
      difficulty: difficulty == null ? null : difficulty, rule: ruleM ? ruleM[1].trim() : null,
      safeAug: vary, wholeGrid: WHOLE_GRID_RE.test(text), declaresExamples: /^\s*examples\b/m.test(text), verbs, dynamic,
    };
  });
}
// Hierarchical sample — now the GOD BUILDER (builder.js): family taxonomy with roles (base/modifier/finisher),
// an admits-graph so a function is composed ONLY with functions its family admits by construction, paired
// difficulty on every function (template's own or its family band midpoint), and a difficulty-budgeted
// composition (target sampled or --target). Same menu shape as before + {target, budget, role/family per fn}.
function proposeMenu(rng, registry, opts = {}) {
  return Builder.buildMenu(rng, registry, opts);
}
// Serialize a menu into the compact prompt the small model sees — THE reduced DSL surface (consumed by PAN-121).
// Role-aware: the base is THE mechanic; modifiers only refine it; the finisher is one whole-grid op, LAST.
function menuToPrompt(menu) {
  const L = [];
  L.push("Author ONE coherent ARC-style task: a hidden rule shown by 3–5 example IN→OUT grid pairs + a test input.");
  const base = menu.functions.find(f => f.role === "base") || menu.functions[0];
  const mods = menu.functions.filter(f => f.role === "modifier");
  const fin = menu.functions.find(f => f.role === "finisher");
  L.push("CORE MECHANIC (the ONE rule of the task):");
  L.push(`  • ${base.name} [${base.family || base.category}${base.difficulty != null ? " · d" + base.difficulty : ""}]${base.rule ? " — " + base.rule : ""}`);
  if (mods.length) {
    L.push("REFINEMENT — use these ONLY to key/condition the core mechanic (WHICH objects, WHAT drives it) — they are NOT a second rule:");
    for (const f of mods) L.push(`  • ${f.name} [${f.family || f.category}${f.difficulty != null ? " · d" + f.difficulty : ""}]${f.rule ? " — " + f.rule : ""}`);
  }
  if (fin) L.push(`FINISHER — after the object-level rule, apply ONCE to the whole grid, LAST:\n  • ${fin.name} [${fin.family || fin.category}]${fin.rule ? " — " + fin.rule : ""}`);
  if (menu.target != null) L.push("Difficulty target ≈ " + menu.target + " (composed estimate " + menu.difficulty + ").");
  L.push("Allowed augmentations (rule-safe): " + (menu.augmentations.length ? menu.augmentations.join(", ") : "none"));
  L.push("Composition: " + menu.composeHint + ".");
  L.push("Vary every NON-rule feature (position, colour, size, count) across examples, so the rule — not the incidental features — is what's learnable.");
  return L.join("\n");
}

// ---- small-model prompt-kit (PAN-121) ----
// Assemble the FULL prompt a small model receives for one generation task: guardrails + a grammar card SCOPED to
// the menu's verbs (not the whole DSL) + the curated menu + a real exemplar scene. The model only sees this slice.
const CORE_VERBS = ["grid", "bg", "seed", "walls", "run", "hold", "snap", "cut", "rule", "concept", "vary", "examples", "spawn"];
const GUARDRAILS = [
  "- One statement per line. '#' starts a comment. Commas count as spaces.",
  "- Coords are 'row col' (0,0 = top-left; +row = down, +col = right).",
  "- Reserved words you must NOT use as object ids: shape, sel, all, largest, smallest, color, at, where, it, by, into, is.",
  "- Output EXACTLY ONE scene (a single 'grid' line). Do not write multiple tasks.",
  "- Use ONLY shape names from the SHAPES list (e.g. 'disc'/'ring', NOT 'circle'; 'rect', NOT 'rectangle'). No invented shapes.",
  "- Do NOT invent syntax (no 'to by', etc.) — use only the forms in the GRAMMAR below.",
  "- Mark the IN/OUT split with 'cut'. Label the task with 'rule ...' and 'concept ...'.",
  "- VARY every non-rule feature across examples: use 'random', 'color rand', and 'rand LO HI' sizes.",
  "- OBJECTS MUST NEVER TOUCH: if you place objects with fixed 'at' coords, use FIXED sizes and leave ≥2 empty cells between bounding boxes ('at' + 'rand' sizes = objects grow into each other and collide).",
];
function grammarSlice(verbs) {
  const gram = E.GRAMMAR.split(/\r?\n/), out = [];
  for (let i = 0; i < gram.length; i++) {
    const m = gram[i].match(/^(\s+)([a-z_]+)\b/);
    if (m && verbs.has(m[2])) {
      const indent = m[1].length; out.push(gram[i]);
      for (let j = i + 1; j < gram.length; j++) {                 // capture deeper-indented continuation lines (e.g. spawn opts)
        if (gram[j].trim() === "") break;
        if ((gram[j].match(/^(\s*)/)[1].length) > indent) out.push(gram[j]); else break;
      }
    }
  }
  return [...new Set(out)];   // dedupe: e.g. case/end match both as dispatch's continuation AND as their own verb line
}
function buildPrompt(registry, menu, opts = {}) {
  const templatesDir = opts.templatesDir || path.join(__dirname, "scenes", "library");
  const verbs = new Set(CORE_VERBS);
  let rawAll = "";
  for (const f of menu.functions) { const def = registry.find(r => r.name === f.name); if (def) { for (const v of def.verbs) verbs.add(v); try { rawAll += "\n" + fs.readFileSync(path.join(templatesDir, def.file), "utf8"); } catch (e) { } } }
  // Context-sensitive layer (G2/G3): the `where`/`it` SELECTORS and the predicate VOCABULARY are not first-token
  // grammar lines reachable from a template's verbs, so dispatch/classify would otherwise reach the model with no
  // way to know which predicates exist or that `it`/`where` are usable → it could only copy the exemplar. Wire them in.
  const usesPred = verbs.has("dispatch") || verbs.has("classify") || /\b(where|odd)\b/.test(rawAll);
  if (usesPred) { verbs.add("where"); if (verbs.has("dispatch")) verbs.add("it"); if (/\bodd\b/.test(rawAll)) verbs.add("odd"); }
  if (opts.drawGlyphs) verbs.add("glyph");   // model-drawn-shapes push: expose the `glyph` grammar to the model
  const exemplar = registry.find(r => r.name === menu.functions[0].name);
  const exText = exemplar ? fs.readFileSync(path.join(templatesDir, exemplar.file), "utf8").trim() : "";
  // when the draw-push is active, flip the "no invented shapes" guardrail into a "DRAW your own shapes" instruction
  const guards = opts.drawGlyphs
    ? GUARDRAILS.map(g => g.startsWith("- Use ONLY shape names") ? "- DRAW YOUR OWN SHAPES: define 1–3 custom shapes with 'glyph NAME rows' (rows joined by /, digits 0..9, 0=empty, e.g. glyph house 010/111/111) — invent shapes NOT in the SHAPES list (a house, arrow, letter, animal, abstract motif) — then 'spawn NAME'. Built-in SHAPES are also allowed." : g)
    : GUARDRAILS;
  const out = [
    "You write GRIDVID scene-DSL that generates ONE ARC-style task. Output ONLY the scene text, no prose.",
    "", "RULES:", ...guards,
    "", "GRAMMAR (only the parts you need):", ...grammarSlice(verbs),
  ];
  if (usesPred) out.push("", "PREDICATES (the PRED values for dispatch / classify / where): " + Object.keys(E.PREDICATES).join(" · ")
    + ".  Boolean ones (convex, symmetric, connected, collinear, loop) use 'case yes' / 'case no'; categorical ones use the value directly"
    + " (orientation→wide|tall|square, symmetry→h|v|hv|rot|none, size_class→small|mid|big, parity→even|odd).");
  out.push("", "YOUR TASK:", menuToPrompt(menu),
    "", "A VALID EXAMPLE SCENE (study the FORM, then write a DIFFERENT task with the same building block):", exText);
  if (opts.static) out.push("",   // ARC-AGI-2 shape: clean grid→grid, no animation — and the hard coherence rules (Mario)
    "HARD RULES — a good task is SIMPLE and CLEAR, not complex:",
    "• ONE rule only. Exactly one clean, instructive grid transformation an ARC-AGI-2 solver could infer from the examples. Do NOT chain multiple mechanics into a rule-salad.",
    "• STATIC: IN and OUT are each a SINGLE grid. Build the input, 'hold 1' (IN), 'cut', apply the transform, 'snap 1' (OUT). NEVER use 'run', gravity, physics, or motion.",
    "• FEW objects (about 3–6). Place EVERY object with 'random' over a LARGE box (most of the grid) — NEVER fixed 'at R C' coordinates for multiple objects, and never tiny boxes — so they spread out and never overlap or touch. The engine keeps a gap only for 'random' placement; objects must never sit on top of one another.",
    "• NO 'vary' line and NO augmentation — augmentation interferes with the rule. (Per-example variety comes only from 'random' positions / 'color rand' / 'rand' sizes.)",
    "• COLOURS: every colour in the OUTPUT must already appear in the INPUT. Do NOT invent a new answer/marker/overlap colour out of nowhere — recolour to a colour that is present in the scene, or put that colour in the input first.",
    "• If you COPY/offset an object, use a FIXED offset (the SAME in every example, not based on the shape's size), and large enough that the copies never overlap each other or the original.",
    "• Keep every shape FULLY inside the grid and clear of any border/frame — nothing clipped or tucked under an edge.",
    "• Vary every feature that is NOT the rule across examples (position, and colour/size unless they ARE the rule), so the model can't latch onto a constant.");
  if (opts.novelty) out.push("",   // a twist on the ONE rule, never extra mechanics
    "NOVELTY: don't copy the example — invent a DIFFERENT single rule (a fresh transform or a twist on this one). Keep it ONE coherent rule; novelty must NOT mean more mechanics or a busier scene.");
  return out.join("\n");
}

// ---- template PROPOSER prompt: ask the model to INVENT one original clean single-rule STATIC template ----
// (Not composition. Each proposal is ONE rule; the engine pre-filters; a human admits good ones to the library.)
function buildTemplatePrompt(registry, rng, opts = {}) {
  const templatesDir = opts.templatesDir || path.join(__dirname, "scenes", "library");
  const statics = registry.filter(r => !r.dynamic);
  // 3 diverse static exemplars (different categories) — show the FORM, not a thing to copy.
  const byCat = {}; for (const r of statics) (byCat[r.category] || (byCat[r.category] = [])).push(r);
  const cats = Object.keys(byCat); const picks = [];
  for (let t = 0; t < 30 && picks.length < 3; t++) { const c = cats[rng.int(0, cats.length - 1)]; const r = byCat[c][rng.int(0, byCat[c].length - 1)]; if (!picks.find(p => p.name === r.name)) picks.push(r); }
  const verbs = new Set(CORE_VERBS); for (const p of picks) for (const v of p.verbs) verbs.add(v);
  verbs.add("where"); verbs.add("it"); verbs.add("odd"); verbs.add("dispatch"); verbs.add("classify"); verbs.add("combine"); verbs.add("grid_complete"); verbs.add("unfold"); verbs.add("bind_transform"); verbs.add("apply");
  const exemplars = picks.map(p => { try { return "# (" + p.category + ")\n" + fs.readFileSync(path.join(templatesDir, p.file), "utf8").trim(); } catch (e) { return ""; } }).filter(Boolean);
  return [
    "You DESIGN one new ARC-AGI-2-style task TEMPLATE in GRIDVID scene-DSL. Output ONLY the scene text, no prose.",
    "", "RULES:", ...GUARDRAILS,
    "- This is a TEMPLATE: it must produce a DIFFERENT instance for each random seed. Use 'random', 'color rand', 'rand LO HI' so position/colour/size vary; the RULE stays fixed.",
    "", "GRAMMAR (the parts you may use):", ...grammarSlice(verbs),
    "", "PREDICATES (for dispatch/classify/where): " + Object.keys(E.PREDICATES).join(" · ") + ".",
    "", "DESIGN GOAL:",
    ...(opts.hard ? [
      "Invent ONE HARD ARC-AGI-2-style task whose rule needs TWO DEPENDENT reasoning steps — the second step uses the RESULT or a",
      "PROPERTY computed in the first. Examples of the SHAPE of difficulty (invent your own): 'classify each object by a predicate,",
      "THEN transform only one class (mirror it / remove it / recolor it)'; 'order objects by size, THEN recolor each by its rank';",
      "'for each object: if it has a hole fill it, otherwise leave it, THEN keep only the largest'. The rule must be a SINGLE coherent",
      "idea expressed as a dependent chain — NOT two unrelated operations glued together, and NOT a single one-shot transform a dumb",
      "solver (rotate/flip/recolor/extract-colour/mirror/tile) could crack. Make it genuinely require inference of the intermediate step.",
    ] : [
      "Invent ONE original task with a SINGLE clean rule — the kind an ARC-AGI-2 solver could infer from 3–4 examples:",
      "e.g. a context-sensitive recolour (dispatch by a predicate), a symmetry/figure completion, a boolean of two figures,",
      "an analogy (A→B, apply to C), an odd-one-out, a counting/ordering rule, a palette/shape remap, an inside/outside fill.",
    ]),
    "HARD REQUIREMENTS: (1) ONE coherent rule" + (opts.hard ? " (a 2-step dependent chain)" : "") + "; (2) the OUT must be EXACTLY that rule applied to the IN — nothing arbitrary;",
    "(3) the rule must be VISIBLE from the examples alone; (4) STATIC (single-grid IN and OUT; no 'run'/physics);",
    "(5) vary every non-rule feature across seeds.",
    "", "REFERENCE TEMPLATES (study the FORM and the 'rule/concept/difficulty/vary' header; invent a DIFFERENT idea):",
    ...exemplars.map((e, i) => "--- example " + (i + 1) + " ---\n" + e),
  ].join("\n");
}

// ---- small-model generation harness (PAN-122 self-correcting loop + PAN-116 novelty) ----
// The real CINECA loop: a served model (Qwen-30B-A3B via an OpenAI-compatible endpoint) WRITES scene-DSL from the
// prompt-kit; the engine is the verifier; on reject we feed the reasons back and retry. Pluggable callModel → testable.
function extractScene(text) {   // pull ONE scene's DSL out of a model reply (strip ``` fences / prose; take only the first scene)
  if (!text) return "";
  const fence = text.match(/```(?:[a-z]*\n)?([\s\S]*?)```/i);
  let s = (fence ? fence[1] : text).trim();
  // models often emit several scenes separated by blank lines — take the FIRST blank-line block that is a scene.
  const blocks = s.split(/\n[ \t]*\n/);
  const isScene = b => /^[ \t]*(grid|===)\b/m.test(b);
  let first = blocks.find(isScene) || blocks[0] || s;
  const lines = first.split(/\r?\n/);
  const start = lines.findIndex(l => /^\s*(===|name|grid|bg|seed|rule|concept|def|spawn|examples|difficulty)\b/.test(l));
  return (start >= 0 ? lines.slice(start) : lines).join("\n").trim();
}
function rejectReasons(task) {   // why validateTask said no → a short feedback string for the model
  const te = task.meta.teaching;
  if (!te.ok) return "no teaching: " + (te.reasons || []).join("; ");
  if (!te.coherent) return "incoherent: " + (te.incoherent || []).join("; ");
  if (te.examplesVary === false) return "the examples are identical — vary the non-rule features (position/colour/size) across examples";
  return "unknown";
}
async function callModelHTTP(prompt, { endpoint, model, temperature = 0.6, top_p = 0.9, max_tokens = 1100 }) {   // 0.6 (was 0.9): lower temp → more reliable structured DSL + coherence
  const url = endpoint.replace(/\/$/, "") + (endpoint.includes("/chat/completions") ? "" : "/v1/chat/completions");
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", ...(process.env.OPENAI_API_KEY ? { Authorization: "Bearer " + process.env.OPENAI_API_KEY } : {}) },
    body: JSON.stringify({ model: model || "qwen", temperature, top_p, max_tokens, messages: [{ role: "user", content: prompt }] }) });
  if (!res.ok) throw new Error("model HTTP " + res.status + ": " + (await res.text()).slice(0, 200));
  const j = await res.json();
  return (j.choices && j.choices[0] && (j.choices[0].message ? j.choices[0].message.content : j.choices[0].text)) || "";
}
// collapse a task to STATIC: keep only the LAST frame of every IN/OUT component → clean grid→grid (no animation).
function staticizeTask(t) {
  const last = v => [v[v.length - 1]];
  t.examples = t.examples.map(e => ({ in: last(e.in), out: last(e.out) }));
  t.in = last(t.in); t.out = last(t.out); t.fps = 1;
  return t;
}
// every nonzero colour in each OUT must already appear in that pair's IN — no invented "magic" colours (Mario).
function outColorsGrounded(task) {
  const last = v => v[v.length - 1], cset = g => { const s = new Set(); for (const r of g) for (const x of r) if (x) s.add(x); return s; };
  const pairs = task.examples.map(e => [last(e.in), last(e.out)]).concat([[last(task.in), last(task.out)]]);
  const magic = new Set();
  for (const [i, o] of pairs) { const inC = cset(i); for (const x of cset(o)) if (!inC.has(x)) magic.add(x); }
  return { ok: magic.size === 0, magic: [...magic] };
}
// two distinct objects TOUCHING in an IN grid = an unreadable merged mass (Mario 2026-07-02, "the objects
// collide brutally"): flag any pair of different-colour 4-connected components that are 8-adjacent in an IN.
// Sparse object scenes only (the LLM static path) — dense fields (lattice/noise/voronoi) are not routed here.
function objectsTouching(task) {
  const last = v => v[v.length - 1];
  const grids = task.examples.map(e => last(e.in)).concat([last(task.in)]);
  for (const g of grids) {
    const H = g.length, W = g[0].length, comp = Array.from({ length: H }, () => new Array(W).fill(-1));
    let nc = 0;
    for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {   // 4-connected same-colour components
      if (!g[r][c] || comp[r][c] >= 0) continue;
      const col = g[r][c], q = [[r, c]]; comp[r][c] = nc;
      while (q.length) {
        const [rr, cc] = q.pop();
        for (const [dr, dc] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) {
          const nr = rr + dr, nco = cc + dc;
          if (nr >= 0 && nco >= 0 && nr < H && nco < W && g[nr][nco] === col && comp[nr][nco] < 0) { comp[nr][nco] = nc; q.push([nr, nco]); }
        }
      }
      nc++;
    }
    for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {   // any two DIFFERENT components 8-adjacent?
      if (comp[r][c] < 0) continue;
      for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
        const nr = r + dr, nco = c + dc;
        if (nr >= 0 && nco >= 0 && nr < H && nco < W && comp[nr][nco] >= 0 && comp[nr][nco] !== comp[r][c]) return true;
      }
    }
  }
  return false;
}
// the self-correcting loop for ONE task: call → verify → on reject, re-prompt with the reasons. Returns {task,...} or null.
async function llmGenerateOne(prompt, callModel, opts = {}) {
  const retries = opts.retries == null ? 2 : opts.retries; let feedback = "", attempts = 0;
  const trail = [];
  for (let a = 0; a <= retries; a++) {
    attempts++;
    const reply = await callModel(feedback ? prompt + "\n\nYOUR PREVIOUS SCENE WAS REJECTED — " + feedback + "\nFix exactly that and output the corrected scene only." : prompt);
    const scene = extractScene(reply);
    let task; try { task = E.buildTask(scene, { augment: false, ...(opts.examples ? { examples: opts.examples } : {}) }); }   // NO augmentation: a sampled vary axis interferes with the rule (Mario)
    catch (e) { feedback = "parse error: " + e.message.replace(/\n[\s\S]*/, ""); trail.push("parse"); continue; }
    const te = task.meta.teaching;
    const grounded = outColorsGrounded(task);   // Mario: every OUT colour must already appear in the IN (no invented "magic" colours)
    const touching = opts.allowTouching ? false : objectsTouching(task);   // Mario: colliding/merged objects are unreadable
    if (te.ok && te.coherent && te.examplesVary !== false && grounded.ok && !touching) return { task, scene, attempts, trail };
    feedback = !grounded.ok
      ? "the OUT uses colour(s) " + grounded.magic.join(",") + " that appear NOWHERE in the IN. Every colour in the output must already be present in the input — recolour using a colour that is in the scene, or put that colour in the input. No invented answer/marker colours."
      : touching
        ? "two objects TOUCH or overlap in an input grid — an unreadable merged mass. Spread the objects out: 'random' placement over a large box, or fixed 'at' coords with FIXED sizes and ≥2 empty cells between bounding boxes (never 'at' + 'rand' sizes)."
        : rejectReasons(task);
    trail.push(!grounded.ok ? "magic-colour" : touching ? "touching" : feedback.split(":")[0]);
  }
  return null;
}

// a candidate is a GOOD static template iff, reseeded across K seeds, it stays coherent + teaching + varied + single-grid.
function verifyTemplate(scene, opts = {}) {
  const K = opts.K || 4; let rule = null, name = "proposal";
  for (let s = 1; s <= K; s++) {
    let t; try { t = E.buildTask(scene, { examples: 3, exSeeds: [s, s + 1, s + 2], testSeed: s + 3 }); }
    catch (e) { return { ok: false, reason: "parse error: " + String(e.message).split("\n")[0] }; }
    const te = t.meta.teaching;
    if (!te.ok) return { ok: false, reason: "no teaching — OUT must differ from IN for every example pair" };
    if (!te.coherent) return { ok: false, reason: "incoherent: " + (te.incoherent || []).join("; ") };
    if (te.examplesVary === false) return { ok: false, reason: "the examples are identical — vary position/colour/size across seeds with random/color rand/rand" };
    if ([t.in, t.out, ...t.examples.flatMap(e => [e.in, e.out])].some(v => v.length > 1)) return { ok: false, reason: "the task is a VIDEO — make it STATIC: single-grid IN and OUT, no 'run'/physics; use hold/cut/snap" };
    if (opts.hard) { const triv = Baseline.trivialSolve(t); if (triv) return { ok: false, reason: "TOO SIMPLE — a dumb 1-step solver cracks it with '" + triv + "'. Add a dependent second reasoning step." }; }
    rule = t.meta.rule; name = ((t.meta.concepts || [])[0] || "proposal");
  }
  if (!rule) return { ok: false, reason: "missing a 'rule ...' line describing the single transformation" };
  return { ok: true, rule, name: String(name).replace(/[^a-z0-9]+/gi, "_").slice(0, 20) || "proposal" };
}

const cmds = {
  gen(args) {
    const f = flags(args);
    if (!f._.length) return console.log("usage: cli.js gen <scene.txt...> [-o dir] [--gif] [--seeds N] [--augment K]");
    const dir = f.out || "out";
    for (const file of f._) {
      const text = fs.readFileSync(file, "utf8"), base = stem(file);
      console.log(file + ":");
      const seeds = f.seeds > 0 ? Array.from({ length: f.seeds }, (_, i) => i + 1) : [null];
      for (const sd of seeds) {
        const t = sd == null ? text : withSeed(text, sd);
        const suf = sd == null ? "" : "_seed" + String(sd).padStart(3, "0");
        const vid = E.generate(t, { fps: f.fps });
        writeVid(vid, base + suf, dir, f);
        if (f.augment > 0) {
          // --wild re-simulates with perturbed fluid/seed (the "crazy" augmentation); else pixel-only.
          const zoomChoices = f.zoomInOnly ? [1, 1, 2] : null;
          const variants = f.wild ? E.augmentScene(t, { n: f.augment, seed: sd || 1, zoom: !f.zoom || f.zoomAug, zoomChoices })
            : E.augmentVid(vid, { n: f.augment, seed: sd || 1, d4: !f.noD4, color: !f.noColor, rate: f.rate, zoom: f.zoomAug, zoomChoices });
          variants.forEach((a, i) => writeVid(a, base + suf + "_aug" + String(i + 1).padStart(2, "0"), dir, f));
        }
        if (f.materialize) {
          const mat = E.materializeVid(vid, { seed: sd || 1, cellsPerFrame: f.materializeCells || 1, order: "tlbr" });
          writeVid(mat, base + suf + "_mat01", dir, f);
        }
      }
    }
  },

  augment(args) {
    const f = flags(args);
    if (!f._.length) return console.log("usage: cli.js augment <video.json...> [-o dir] [--n N] [--seed N] [--no-d4] [--no-color] [--rate] [--gif]");
    const dir = f.out || "out";
    for (const file of f._) {
      const vid = JSON.parse(fs.readFileSync(file, "utf8")), base = stem(file);
      console.log(file + ":");
      if (f.materialize) {
        const n = f.n || 1, orders = ["tlbr", "btlr", "random"];
        for (let i = 0; i < n; i++) {
          const mat = E.materializeVid(vid, { seed: (f.seed || 1) + i, cellsPerFrame: f.materializeCells || 1, order: orders[i % orders.length] });
          writeVid(mat, base + "_mat" + String(i + 1).padStart(2, "0"), dir, f);
        }
      } else {
        E.augmentVid(vid, { n: f.n || 8, seed: f.seed || 1, d4: !f.noD4, color: !f.noColor, rate: f.rate, zoom: f.zoomAug, zoomChoices: f.zoomInOnly ? [1, 1, 2] : null }).forEach((a, i) => writeVid(a, base + "_aug" + String(i + 1).padStart(2, "0"), dir, f));
      }
    }
  },

  render(args) {
    const f = flags(args); f.gif = f.gif || !f.png;
    if (!f._.length) return console.log("usage: cli.js render <video.json...> [-o dir] [--gif] [--cell N] [--fps N]");
    const dir = f.out || ".";
    for (const file of f._) {
      const vid = JSON.parse(fs.readFileSync(file, "utf8"));
      if (f.fps) vid.fps = f.fps;
      writeVid(vid, stem(file), dir, { gif: true, cell: f.cell, zoom: f.zoom });
    }
  },

  // convert a folder of videos to GIFs and open a one-page gallery to "show a friend".
  gallery(args) {
    const f = flags(args);
    const target = f._[0] || "out";
    const dir = fs.statSync(target).isDirectory() ? target : path.dirname(target);
    const jsons = fs.readdirSync(dir).filter(n => n.endsWith(".json"));
    const cell = f.cell || 14;
    for (const n of jsons) {                              // ensure a gif exists for every video
      const gif = path.join(dir, n.replace(/\.json$/, ".gif"));
      if (!fs.existsSync(gif)) { const v = JSON.parse(fs.readFileSync(path.join(dir, n), "utf8")); fs.writeFileSync(gif, Buffer.from(GIF.encodeGif({ frames: v.frames, palette: E.ARC_PALETTE, cell, delayMs: 1000 / (v.fps || 6) }))); }
    }
    const gifs = fs.readdirSync(dir).filter(n => n.endsWith(".gif")).sort();
    const abs = path.resolve(dir);
    const cards = gifs.map(g => `<div class=card><img src="file://${abs}/${g}"><div class=t>${g.replace(/\.gif$/, "")}</div></div>`).join("\n");
    const html = `<!doctype html><meta charset=utf-8><title>gridvid gallery</title><style>
body{margin:0;background:#0a0a0a;color:#eee;font:13px "Space Mono",ui-monospace,Menlo,monospace;padding:24px}
h1{font:16px monospace;color:#ff5fae;letter-spacing:1px}.sub{color:#8f8f8f;margin-bottom:18px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:16px}
.card{background:#111;border:1px solid #262626;border-radius:6px;padding:10px}
.card img{width:100%;image-rendering:pixelated;border-radius:3px;background:#000;box-shadow:0 0 26px rgba(255,95,174,.12)}
.t{color:#4fe3f0;margin-top:8px;font-size:11.5px}</style>
<h1>▦ GRIDVID gallery — ${gifs.length} videos</h1><div class=sub>${abs}</div><div class=grid>${cards}</div>`;
    const out = path.join(dir, "gallery.html");
    fs.writeFileSync(out, html);
    console.log(`gallery: ${gifs.length} gifs → ${out}`);
    if (f.open) try { require("child_process").spawn("open", [out]); } catch (e) { }
  },

  shapes(args) {
    const f = flags(args), names = Object.keys(E.SHAPES);
    if (f.json) return console.log(JSON.stringify(names));
    console.log("shapes: " + names.join(" · "));
  },

  dsl() { console.log(E.GRAMMAR); },

  validate(args) {
    const f = flags(args); let bad = 0;
    for (const file of f._) {
      try {
        const v = JSON.parse(fs.readFileSync(file, "utf8"));
        if (v.format === "prodigy-task") {
          if (!Array.isArray(v.examples) || !Array.isArray(v.in) || !Array.isArray(v.out)) throw new Error("prodigy-task missing examples/in/out");
          // each video must be internally consistent (all frames same dims, colours 0-9); panels MAY differ
          // in size across examples (rot/zoom augmentation), as in real ARC tasks.
          const chkVid = (vid, where) => {
            if (!vid.length || !Array.isArray(vid[0])) throw new Error(where + " empty/!video");
            const h = vid[0].length, w = vid[0][0].length;
            for (const g of vid) if (g.length !== h || g.some(r => r.length !== w || r.some(x => x < 0 || x > 9))) throw new Error(where + " frame shape/color inconsistent");
          };
          v.examples.forEach((e, i) => { if (!e.in || !e.out) throw new Error("example " + i + " missing in/out"); chkVid(e.in, "ex" + i + ".in"); chkVid(e.out, "ex" + i + ".out"); });
          chkVid(v.in, "in"); chkVid(v.out, "out");
          const t = E.validateTask(v);
          if (!t.ok) throw new Error("no teaching — " + t.reasons.join("; "));
          console.log(`  ok  ${file}  prodigy-task: ${v.examples.length} examples + test, teaching ok`);
        } else {
          if (v.format !== "2dgridvid" || !Array.isArray(v.frames)) throw new Error("not a 2dgridvid / prodigy-task");
          const H = v.height, W = v.width;
          for (const g of v.frames) if (g.length !== H || g.some(r => r.length !== W || r.some(x => x < 0 || x > 9))) throw new Error("frame shape/color out of range");
          console.log(`  ok  ${file}  (${W}x${H}, ${v.frames.length}f)`);
        }
      } catch (e) { bad++; console.log(` FAIL ${file}  ${e.message}`); }
    }
    process.exit(bad ? 1 : 0);
  },

  // build (EXAMPLES, IN, OUT) task(s) from scene template(s). JSON is the truth; --gif renders a montage.
  task(args) {
    const f = flags(args);
    if (!f._.length) return console.log("usage: cli.js task <scene.txt...> [-o dir] [--examples K] [--gif] [--cell N]");
    const dir = f.out || "out", k = f.examples == null ? 3 : f.examples;
    fs.mkdirSync(dir, { recursive: true });
    let bad = 0;
    for (const file of f._) {
      const text = fs.readFileSync(file, "utf8"), base = stem(file);
      const task = E.buildTask(text, { examples: k, fps: f.fps });
      const t = task.meta.teaching;
      const p = path.join(dir, base + ".task.json");
      fs.writeFileSync(p, JSON.stringify(task));
      const reject = !t.ok || !t.coherent;
      const tag = reject ? " FAIL " : (t.examplesVary ? "  ok  " : " warn ");
      const note = !t.ok ? "teaching=NO — " + t.reasons.join("; ") : !t.coherent ? "INCOHERENT — " + t.incoherent.join("; ") : (t.examplesVary ? "teaching=yes" : "teaching=yes but ⚠ " + t.warnings.join("; "));
      console.log(`${tag}${p}  examples=${task.examples.length} in=${task.in.length}f out=${task.out.length}f  ${note}  rule="${task.meta.rule || "(unset)"}"`);
      if (reject) bad++;
      if (f.gif) {
        const m = E.taskToMontage(task, { fps: 2 });
        const gp = path.join(dir, base + ".task.gif");
        fs.writeFileSync(gp, Buffer.from(GIF.encodeGif({ frames: m.frames, palette: E.ARC_PALETTE, cell: f.cell || 12, delayMs: 1000 / (m.fps || 2) })));
        console.log(`        montage → ${gp}  (${m.width}x${m.height}, ${m.frames.length}f)`);
      }
    }
    if (bad) console.log(`\n${bad} task(s) have NO teaching — fix the template (OUT must differ from IN for every pair).`);
  },

  // mass dataset sampler (PAN-114): sample template × seed × n_examples × wild/normal, keep only coherent
  // tasks, write sharded gzip JSONL + manifest.jsonl. No per-task LLM — the coherence guard IS the filter.
  "generate-dataset"(args) {
    const f = flags(args);
    const n = f.n || 100, dir = f.out || "out/dataset", shards = Math.max(1, f.shards || 1);
    const templatesDir = f.templates || path.join(__dirname, "scenes", "library");
    const workers = Math.max(1, f.workers || 1);
    // multinode (CINECA): each node owns a disjoint seed slice so N nodes generate non-overlapping tasks with no coordination.
    const numNodes = Math.max(1, f.numNodes || 1), nodeRank = Math.max(0, Math.min(numNodes - 1, f.nodeRank || 0));
    const seedBase = (f.seedBase || 1) + nodeRank * 1000000000;
    if (numNodes > 1) console.log(`  [multinode] node ${nodeRank + 1}/${numNodes}  seed-slice base ${seedBase}`);
    if (workers > 1) {                                                    // PAN-123 parallel: disjoint seed slices
      const { Worker } = require("worker_threads");
      const share = Math.ceil(n / workers);
      const all = [], agg = { attempts: 0, accepted: 0, duplicates: 0, errors: 0, rejected: 0, byReason: {}, byTemplate: {} };
      let done = 0;
      for (let wId = 0; wId < workers; wId++) {
        const w = new Worker(__filename, { workerData: { templatesDir, n: share, seedBase: seedBase + wId * 1000003, wildFrac: f.wildFrac, examples: f.examples, maxAttempts: f.maxAttempts, static: f.static, hard: f.hard } });
        w.on("message", m => { all.push(...m.accepted); agg.attempts += m.stats.attempts; agg.rejected += m.stats.rejected; agg.duplicates += m.stats.duplicates; agg.errors += m.stats.errors; for (const k in m.stats.byReason) agg.byReason[k] = (agg.byReason[k] || 0) + m.stats.byReason[k]; });
        w.on("error", e => console.error("worker " + wId + ": " + e.message));
        w.on("exit", () => {
          if (++done < workers) return;
          const seen = new Set(), merged = [];                            // global dedup across workers, trim to n
          for (const a of all) { if (seen.has(a.id)) { agg.duplicates++; continue; } seen.add(a.id); merged.push(a); if (merged.length >= n) break; }
          agg.accepted = merged.length;
          for (const a of merged) agg.byTemplate[a.template] = (agg.byTemplate[a.template] || 0) + 1;
          writeDataset(dir, merged, shards, numNodes > 1 ? `node-${nodeRank}-` : "");
          reportDataset(dir, agg, n, shards, workers);
        });
      }
      return;
    }
    let res;
    try { res = genDataset({ templatesDir, n, seedBase, wildFrac: f.wildFrac, examples: f.examples, maxAttempts: f.maxAttempts, static: f.static, hard: f.hard }); }
    catch (e) { return console.error("generate-dataset: " + e.message); }
    writeDataset(dir, res.accepted, shards, numNodes > 1 ? `node-${nodeRank}-` : "");
    reportDataset(dir, res.stats, n, shards, 1);
  },

  // training-objective export (PAN-117): turn prodigy-task JSON into model training records. The corpus's job is
  // to teach the priors; these are the heads that read them out. One task → many records across objectives.
  // arc_pair (the few-shot map) · next_frame (dynamics) · inverse_dynamics (transition→rule) · object_aux (read objects).
  "export-objectives"(args) {
    const f = flags(args);
    const inDir = f._[0] || f.templates || "out/library_json";
    const which = f.objective || "all";
    const outFile = f.out || "out/objectives.jsonl";
    const tasks = loadTasks(inDir);
    if (!tasks.length) return console.error("export-objectives: no tasks found in " + inDir + " (.task.json or shard-*.jsonl.gz)");
    fs.mkdirSync(path.dirname(outFile) || ".", { recursive: true });
    const counts = {}; let total = 0; const out = fs.createWriteStream(outFile);
    for (const task of tasks) for (const rec of objectiveRecords(task, which)) { out.write(JSON.stringify(rec) + "\n"); counts[rec.objective] = (counts[rec.objective] || 0) + 1; total++; }
    out.end();
    console.log(`export-objectives → ${outFile}`);
    console.log(`  ${tasks.length} tasks → ${total} records: ` + Object.entries(counts).map(([k, v]) => `${k}:${v}`).join("  "));
  },

  // LLM dataset generator (PAN-122 self-correcting loop + PAN-116 novelty): a served small model WRITES scene-DSL
  // from the prompt-kit, the engine verifies, rejects are fed back and retried. Multinode + sharded for CINECA.
  //   generate-llm --n N --endpoint http://host:8000  [--model qwen] [--retries 2] [--k 3] [--num-nodes W --node-rank R] [-o dir]
  //   generate-llm --n N --stub      (no weights: reseeds the exemplar — tests the whole pipeline)
  async "generate-llm"(args) {
    const f = flags(args);
    const n = f.n || 20, dir = f.out || "out/llm-dataset", shards = Math.max(1, f.shards || 1);
    const templatesDir = f.templates || path.join(__dirname, "scenes", "library");
    const numNodes = Math.max(1, f.numNodes || 1), nodeRank = Math.max(0, Math.min(numNodes - 1, f.nodeRank || 0));
    const seedBase = (f.seedBase || 1) + nodeRank * 1000000000, retries = f.retries == null ? 2 : f.retries;
    // FIX (Mario 2026-06-23): free k=3 composition of dynamic templates with augmentation = incoherent overlapping rule-salad.
    // Defaults now: k=1 (ONE clear rule, no composition) · STATIC only (no physics/video) · NO augmentation. Opt back in with --k/--dynamic.
    const k = f.k || 1, useStatic = f.dynamic ? false : (f.static !== false);
    if (!f.stub && !f.endpoint) return console.error("generate-llm: need --endpoint URL (OpenAI-compatible, e.g. a vLLM-served Qwen) or --stub");
    let registry; try { registry = buildFunctionRegistry(templatesDir, 1); } catch (e) { return console.error("generate-llm: " + e.message); }
    if (numNodes > 1) console.log(`  [multinode] node ${nodeRank + 1}/${numNodes}  seed-slice base ${seedBase}`);
    const rng = E.makeRng(seedBase * 40503 + 7), accepted = [], seen = new Set();
    const stats = { attempts: 0, retried: 0, failed: 0, duplicates: 0 }, cap = f.maxAttempts || n * 8; let i = 0;
    while (accepted.length < n && stats.attempts < cap) {
      stats.attempts++;
      const menu = proposeMenu(rng, registry, { k, static: useStatic, target: f.target });   // god builder: --target sets the difficulty budget
      const drawGlyphs = rng() < (f.glyphFrac != null ? +f.glyphFrac : 0.25);   // sometimes PUSH the model to draw its own shapes
      const prompt = buildPrompt(registry, menu, { templatesDir, novelty: true, static: useStatic, drawGlyphs });
      let callModel;
      if (f.stub) { const ex = registry.find(r => r.name === menu.functions[0].name), exText = fs.readFileSync(path.join(templatesDir, ex.file), "utf8").trim(), sd = seedBase + (i++); callModel = async () => "seed " + sd + "\n" + exText; }
      else callModel = (p) => callModelHTTP(p, { endpoint: f.endpoint, model: f.model, max_tokens: f.maxtok ? +f.maxtok : undefined, temperature: f.temp != null ? +f.temp : undefined });   // --maxtok (thinking models need many) / --temp
      let r; try { r = await llmGenerateOne(prompt, callModel, { retries, examples: f.examples }); }
      catch (e) { stats.failed++; continue; }
      if (!r) { stats.failed++; continue; }
      if (r.attempts > 1) stats.retried++;
      const task = useStatic ? staticizeTask(r.task) : r.task;
      const hash = crypto.createHash("sha1").update(JSON.stringify([task.examples.map(e => [e.in, e.out]), task.in, task.out])).digest("hex");
      if (seen.has(hash)) { stats.duplicates++; continue; }
      seen.add(hash);
      task.meta.id = hash.slice(0, 12); task.meta.template = "llm:" + menu.functions.map(x => x.name).join("+"); task.meta.category = "llm"; task.meta.source = "llm";
      task.meta.prompt = prompt;   // the DSL SUGGESTION the model received (so the gallery can show it — Mario: judge whether failures are the model's)
      accepted.push({ id: task.meta.id, task, template: task.meta.template, category: "llm" });
    }
    writeDataset(dir, accepted, shards, numNodes > 1 ? `node-${nodeRank}-` : "");
    console.log(`generate-llm → ${dir}`);
    console.log(`  accepted ${accepted.length}/${n}  attempts ${stats.attempts}  self-corrected ${stats.retried}  failed ${stats.failed}  dups ${stats.duplicates}`);
    if (f.stub) console.log("  (stub model — wire a real Qwen with --endpoint http://<vllm-host>:8000 --model <name>)");
  },

  // RECONCILIATION mode-1 (RANK / taste): for each task, gen_hard makes K CORRECT variants of one family; the LLM picks
  // the most human/legible one. The LLM never authors → output can't overlap / invent colours; it only expresses taste.
  //   rank --n N (--endpoint URL [--model NAME] | --stub) [--k 4] [-o dir]
  async rank(args) {
    const f = flags(args);
    const n = f.n || 20, K = f.k || 4, dir = f.out || "out/ranked", shards = Math.max(1, f.shards || 1);
    if (!f.stub && !f.endpoint) return console.error("rank: need --endpoint URL (OpenAI-compatible) or --stub");
    const fams = Object.keys(GenHard.FAMILIES), rng = E.makeRng((f.seedBase || 1) * 40503 + 7), accepted = [], seen = new Set();
    const stats = { built: 0, ranked: 0, chosen: {} }; let attempts = 0;
    while (accepted.length < n && attempts < n * 6) {
      attempts++;
      const fam = fams[rng.int(0, fams.length - 1)], variants = [];
      for (let kk = 0; kk < K; kk++) { let t = null; for (let tr = 0; tr < 40 && !t; tr++) { try { t = GenHard.buildFamilyTask(fam, E.makeRng(rng.int(1, 1e9)), 3); } catch (e) { t = null; } } if (t && !Baseline.trivialSolve(t)) variants.push(t); }
      if (variants.length < 2) continue;
      for (let z = variants.length - 1; z > 0; z--) { const j = rng.int(0, z);[variants[z], variants[j]] = [variants[j], variants[z]]; }   // shuffle so the model's choice reflects taste, not position bias
      stats.built++;
      let choice = 0;
      if (f.stub) choice = attempts % variants.length;   // stub: deterministic spread (tests the pipeline)
      else { try { const reply = await callModelHTTP(Reconcile.buildRankPrompt(variants[0].meta.rule, variants), { endpoint: f.endpoint, model: f.model, temperature: 0.2 }); choice = Reconcile.parseChoice(reply, variants.length); stats.ranked++; } catch (e) { choice = 0; } }
      const sel = variants[choice];
      const hash = crypto.createHash("sha1").update(JSON.stringify([sel.examples, sel.in, sel.out])).digest("hex");
      if (seen.has(hash)) continue; seen.add(hash);
      sel.meta.id = hash.slice(0, 12); sel.meta.source = "reconcile-rank"; sel.meta.reconcile = { mode: "rank", k: variants.length, chosen: choice };
      stats.chosen[choice] = (stats.chosen[choice] || 0) + 1;
      accepted.push({ id: sel.meta.id, task: sel, template: "rank:" + fam, category: fam });
    }
    writeDataset(dir, accepted, shards);
    console.log(`rank → ${dir}  (${accepted.length}/${n} tasks · K=${K} variants each · ${stats.ranked} LLM-ranked)`);
    console.log("  chosen-index distribution (taste signal; not all index 0 = the model is really choosing):", JSON.stringify(stats.chosen));
    if (f.stub) console.log("  (stub — wire Qwen with --endpoint http://<vllm-host>:8000 --model <name>)");
  },

  // SEEDED generation (NVARC/BARC shape): the LLM is given a REAL ARC task + its human rule description and writes a
  // GENERATOR (a reseed-varying DSL scene) teaching THAT rule. Grounded in the real distribution + human reasoning.
  //   generate-seeded --n N (--endpoint URL [--model NAME] | --stub) [--retries R] [--all] [-o dir]
  async "generate-seeded"(args) {
    const f = flags(args);
    const n = f.n || 20, dir = f.out || "out/seeded", shards = Math.max(1, f.shards || 1), retries = f.retries == null ? 2 : f.retries;
    if (!f.stub && !f.endpoint) return console.error("generate-seeded: need --endpoint URL (OpenAI-compatible) or --stub");
    const seeds = Seeded.loadSeeds({ exprOnly: !f.all });
    if (!seeds.length) return console.error("generate-seeded: no seed descriptions in DATASET/descriptions/training");
    console.log(`  ${seeds.length} real-task seed descriptions loaded (expressible_in_dsl != no${f.all ? "; --all → include 'no'" : ""})`);
    const idx = CorpusIndex.buildIndex();   // hierarchical DB of our correct families, to pull RELATED exemplars per seed
    const rng = E.makeRng((f.seedBase || 1) * 40503 + 7), accepted = [], seen = new Set();
    const stats = { attempts: 0, retried: 0, failed: 0, dups: 0 }, byPrior = {};
    while (accepted.length < n && stats.attempts < n * 8) {
      stats.attempts++;
      const seed = seeds[rng.int(0, seeds.length - 1)];
      const exemplars = CorpusIndex.relatedExemplars(idx, { priors: seed.priorsList, concepts: seed.priorsList }, 2, rng);   // match the seed's ARC priors against both family prior + concept tags
      const prompt = Seeded.buildSeededPrompt(seed, E.GRAMMAR, exemplars);
      let callModel;
      if (f.stub) callModel = async () => "grid 12 12\nseed 1\nspawn square 2 random 1 1 9 9 color 2\nspawn square 2 random 1 1 9 9 color 3\nhold 1\ncut\nrecolor color 2 tint 3\nsnap 1";   // stub: a valid colour-grounded scene
      else callModel = (p) => callModelHTTP(p, { endpoint: f.endpoint, model: f.model, max_tokens: f.maxtok ? +f.maxtok : undefined, temperature: f.temp != null ? +f.temp : undefined });
      let r; try { r = await llmGenerateOne(prompt, callModel, { retries, examples: f.examples }); } catch (e) { stats.failed++; continue; }
      if (!r) { stats.failed++; continue; }
      if (r.attempts > 1) stats.retried++;
      const task = staticizeTask(r.task);
      const hash = crypto.createHash("sha1").update(JSON.stringify([task.examples.map(e => [e.in, e.out]), task.in, task.out])).digest("hex");
      if (seen.has(hash)) { stats.dups++; continue; } seen.add(hash);
      task.meta.id = hash.slice(0, 12); task.meta.template = "seed:" + seed.id; task.meta.category = "seeded"; task.meta.source = "seeded";
      task.meta.seed_id = seed.id; task.meta.seed_rule = seed.rule.replace(/\s+/g, " ").trim().slice(0, 220); task.meta.prompt = prompt;
      { const pk = seed.priorsList[0] || "?"; byPrior[pk] = (byPrior[pk] || 0) + 1; }
      accepted.push({ id: task.meta.id, task, template: task.meta.template, category: "seeded" });
    }
    writeDataset(dir, accepted, shards);
    console.log(`generate-seeded → ${dir}`);
    console.log(`  accepted ${accepted.length}/${n}  attempts ${stats.attempts}  self-corrected ${stats.retried}  failed ${stats.failed}  dups ${stats.dups}`);
    if (f.stub) console.log("  (stub — wire Qwen with --endpoint http://<vllm-host>:8000 --model <name>)");
  },

  // TEMPLATE PROPOSER: the model INVENTS new single-rule STATIC templates; the engine pre-filters across seeds;
  // survivors are written to scenes/proposals/ (NOT the library) + a review gallery. A HUMAN admits the good ones.
  //   propose-templates --n N (--endpoint URL [--model NAME] | --stub) [--retries R] [-o scenes/proposals]
  async "propose-templates"(args) {
    const f = flags(args);
    const n = f.n || 10, outDir = f.out || path.join(__dirname, "scenes", "proposals"), retries = f.retries == null ? 2 : f.retries;
    const templatesDir = f.templates || path.join(__dirname, "scenes", "library");
    if (!f.stub && !f.endpoint) return console.error("propose-templates: need --endpoint URL or --stub");
    let registry; try { registry = buildFunctionRegistry(templatesDir, 1); } catch (e) { return console.error("propose-templates: " + e.message); }
    fs.mkdirSync(outDir, { recursive: true });
    const rng = E.makeRng((f.seedBase || 1) * 40503 + 7), accepted = [], seen = new Set();
    const stats = { attempts: 0, saved: 0, retried: 0, failed: 0, dups: 0 }, cap = f.maxAttempts || n * 8;
    const statics = registry.filter(r => !r.dynamic);
    while (accepted.length < n && stats.attempts < cap) {
      stats.attempts++;
      const prompt = buildTemplatePrompt(registry, rng, { templatesDir, hard: f.hard });
      let callModel;
      if (f.stub) { const ex = statics[rng.int(0, statics.length - 1)]; const txt = fs.readFileSync(path.join(templatesDir, ex.file), "utf8"); callModel = async () => txt; }   // stub: echo a real static template (tests the pipeline)
      else callModel = (p) => callModelHTTP(p, { endpoint: f.endpoint, model: f.model });
      let good = null, scene = "", att = 0, feedback = "";
      for (let a = 0; a <= retries; a++) {
        att++;
        let reply; try { reply = await callModel(feedback ? prompt + "\n\nYOUR PREVIOUS TEMPLATE WAS REJECTED — " + feedback + "\nFix exactly that; output the corrected scene only." : prompt); } catch (e) { feedback = "model error"; continue; }
        scene = extractScene(reply); const v = verifyTemplate(scene, { hard: f.hard });
        if (v.ok) { good = v; break; } feedback = v.reason;
      }
      if (!good) { stats.failed++; continue; }
      if (att > 1) stats.retried++;
      const h = crypto.createHash("sha1").update(scene.replace(/\s+/g, " ").trim()).digest("hex");
      if (seen.has(h)) { stats.dups++; continue; } seen.add(h);
      const fname = "prop_" + String(accepted.length + 1).padStart(2, "0") + "_" + good.name + ".txt";
      fs.writeFileSync(path.join(outDir, fname), "# PROPOSED by the model — REVIEW + eyeball before admitting to scenes/library/\n# rule: " + good.rule + "\n" + scene + "\n");
      accepted.push({ scene, rule: good.rule, name: good.name, file: fname });
      stats.saved++;
    }
    // review gallery
    const esc = s => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const cards = accepted.map(a => { let gif = "", meta = "";
      try { const t = E.buildTask(a.scene, { examples: 3, seed0: 1 }); const m = E.taskToMontage(t, { fps: 2 }); gif = "data:image/gif;base64," + Buffer.from(GIF.encodeGif({ frames: m.frames, palette: E.ARC_PALETTE, cell: 10, delayMs: 500 })).toString("base64"); meta = `d${t.meta.difficulty != null ? t.meta.difficulty : "?"} · ${t.width}×${t.height}`; } catch (e) { }
      return `<figure class=card>${gif ? `<img src="${gif}">` : "<div class=noimg>render failed</div>"}<figcaption><div class=rl>${esc(a.rule)}</div><div class=meta>${esc(a.file)} · ${meta}</div><details><summary>DSL</summary><pre>${esc(a.scene)}</pre></details></figcaption></figure>`;
    }).join("\n");
    const html = `<!doctype html><meta charset=utf-8><title>proposed templates — REVIEW</title><style>body{margin:0;background:#0b0b0d;color:#ededed;font:13px ui-monospace,Menlo,monospace;padding:24px}h1{color:#ff5fae;font-size:19px}.lead{color:#8a8a93;max-width:900px;line-height:1.6}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px;margin-top:16px}.card{background:#15151a;border:1px solid #2a2a31;border-radius:10px;padding:12px}img{image-rendering:pixelated;width:100%;border:1px solid #2a2a31;border-radius:6px;background:#000}.noimg{padding:40px;text-align:center;color:#ff5f5f}figcaption{display:flex;flex-direction:column;gap:6px;margin-top:8px}.rl{color:#e9e9ef}.meta{color:#8a8a93;font-size:10.5px}summary{color:#ffb14e;cursor:pointer}pre{white-space:pre-wrap;color:#cfcfd6;background:#0d0d11;border:1px solid #2a2a31;border-radius:6px;padding:8px;font-size:10.5px}</style>
<h1>Proposed templates — REVIEW before admitting</h1><p class=lead>${accepted.length} candidate single-rule STATIC templates the model invented, each pre-filtered by the engine (coherent + teaching + varied across 4 seeds). <b>These are NOT in the library.</b> Eyeball each: if the OUT genuinely matches the rule and it's instructive, move <code>scenes/proposals/${"<file>"}.txt</code> into <code>scenes/library/</code>.</p><div class=grid>${cards}</div>`;
    const gpath = path.join(path.dirname(outDir) === "." ? "out" : "out", "proposals_gallery.html");
    fs.mkdirSync("out", { recursive: true }); fs.writeFileSync("out/proposals_gallery.html", html);
    console.log(`propose-templates → ${outDir}  (review: out/proposals_gallery.html)`);
    console.log(`  saved ${stats.saved} candidates  attempts ${stats.attempts}  self-corrected ${stats.retried}  failed ${stats.failed}  dups ${stats.dups}`);
    if (f.stub) console.log("  (stub — echoes library templates to test the pipeline; wire Qwen with --endpoint)");
  },

  // hierarchical function-menu proposer (PAN-132 / G0): curate a small, coherent slice of the DSL per task so a
  // small model composes (not copies) and the full DSL stays simple in its eyes. Prints menus + a model-ready prompt.
  propose(args) {
    const f = flags(args);
    const templatesDir = f.templates || path.join(__dirname, "scenes", "library");
    let registry; try { registry = buildFunctionRegistry(templatesDir, f.seedBase || 1); } catch (e) { return console.error("propose: " + e.message); }
    const n = f.n || 5, k = f.k || 2, rng = E.makeRng((f.seedBase || 1) * 40503 + 7);
    const menus = Array.from({ length: n }, () => proposeMenu(rng, registry, { k }));
    if (f.out) { fs.mkdirSync(path.dirname(f.out) || ".", { recursive: true }); fs.writeFileSync(f.out, menus.map(m => JSON.stringify(m)).join("\n") + "\n"); console.log(`propose: ${n} menus → ${f.out}`); }
    console.log(`registry: ${registry.length} functions across ${new Set(registry.map(r => r.category)).size} categories\n`);
    menus.slice(0, Math.min(n, 3)).forEach((m, i) => { console.log(`── menu ${i + 1}  (k=${m.k}, difficulty≈${m.difficulty})`); console.log(menuToPrompt(m)); console.log(""); });
  },

  // small-model prompt-kit (PAN-121): emit the FULL ready-to-send prompt for ONE sampled generation task
  // (guardrails + menu-scoped grammar card + curated menu + a real exemplar). Consumes the PAN-132 proposer.
  prompt(args) {
    const f = flags(args);
    const templatesDir = f.templates || path.join(__dirname, "scenes", "library");
    let registry; try { registry = buildFunctionRegistry(templatesDir, f.seedBase || 1); } catch (e) { return console.error("prompt: " + e.message); }
    const rng = E.makeRng((f.seedBase || 1) * 40503 + 7), menu = proposeMenu(rng, registry, { k: f.k || 3, static: f.static, target: f.target });
    const p = buildPrompt(registry, menu, { templatesDir, drawGlyphs: f.draw, static: f.static });
    if (f.out) { fs.mkdirSync(path.dirname(f.out) || ".", { recursive: true }); fs.writeFileSync(f.out, p + "\n"); console.log("prompt → " + f.out); }
    else console.log(p);
  },

  "super-suggest"(args) {
    const f = flags(args);
    const count = f.n || f.count || 20, seed = f.seed || f.seedBase || 1;
    const payload = SuperSuggester.suggestTasks({ seed, count, mode: f.mode || "all", difficulty: f.difficulty || null });
    payload.compatibility_db = SuperSuggester.getCompatibilityDb();
    if (f.out) {
      fs.mkdirSync(path.dirname(f.out) || ".", { recursive: true });
      if (f.html) fs.writeFileSync(f.out, SuperSuggester.renderHtml(payload));
      else fs.writeFileSync(f.out, JSON.stringify(payload, null, 2) + "\n");
      console.log("super-suggest → " + f.out);
    } else if (f.html) console.log(SuperSuggester.renderHtml(payload));
    else for (const rec of payload.records) console.log(JSON.stringify(rec));
  },

  new(args) {
    const f = flags(args), name = f._[0], kind = f._[1] || "basic";
    if (!name) return console.log("usage: cli.js new <name> [basic|sorter|shooter|liquid|voronoi]");
    const T = {
      basic: `name ${name}\ngrid 16 16\ngravity down 1\nspawn square 3 at 0 6 color 2 grav 1\nrun 16`,
      sorter: `name ${name}\ngrid 24 22\nseed 1\nsort on\nboard 7 24 at 0 0 color 5\nhole square 3 at 2 3 id a color 0\nhole triangle 4 at 1 12 id b color 0\nspawn square 3 random 12 0 21 23 color 2 target a\nspawn triangle 4 random 12 0 21 23 color 3 target b\nrun 40\nhold 4`,
      shooter: `name ${name}\ngrid 24 16\nwalls none\nshooter at 8 0 dir right every 3 beam bolt color 2 speed 1\nshooter at 4 0 dir right every 5 beam ray color 7\nspawn square 3 at 6 18 color 5\nrun 30`,
      liquid: `name ${name}\ngrid 20 18\ngravity down 1\nsource at 0 9 color 8 rate 1\nspawn rect 2 6 at 10 6 color 5\nrun 40`,
      voronoi: `name ${name}\ngrid 22 22\nseed 1\nvoronoi 7 borders 0\nrun 0\nhold 6`,
    };
    const text = T[kind] || T.basic, dir = "scenes";
    fs.mkdirSync(dir, { recursive: true });
    const p = path.join(dir, name + ".txt");
    fs.writeFileSync(p, text + "\n");
    console.log("wrote " + p);
  },

  async "self-test"() {
    const checks = [], lastNonBg = (v, col) => { const f = v.frames[v.frames.length - 1]; let n = 0; for (const r of f) for (const x of r) if (x === col) n++; return n; };
    const colorCount = (g, col) => g.reduce((n, r) => n + r.filter(x => x === col).length, 0);
    const liquidMass = (w, col = 8) => w.liquid ? w.liquid.filter(x => x === col).length : 0;
    const liquidCells = (w, col = 8) => {
      const out = [];
      if (!w.liquid) return out;
      for (let r = 0; r < w.h; r++) for (let c = 0; c < w.w; c++) if (w.liquid[r * w.w + c] === col) out.push([r, c]);
      return out;
    };
    const columnSolid = (g, c, col) => {
      const rows = [];
      for (let r = 0; r < g.length; r++) if (g[r][c] === col) rows.push(r);
      if (!rows.length) return true;
      for (let r = rows[0]; r <= rows[rows.length - 1]; r++) if (g[r][c] !== col) return false;
      return true;
    };
    const rowRunsAtMost = (g, col, maxRuns) => g.every(row => {
      let runs = 0, inRun = false;
      for (const x of row) {
        if (x === col && !inRun) { runs++; inRun = true; }
        else if (x !== col) inRun = false;
      }
      return runs <= maxRuns;
    });
    let v = E.generate("grid 10 10\ngravity down 1\nspawn square 3 at 0 3 color 2 grav 1\nrun 12");
    checks.push(["gravity rests on floor", v.frames[v.frames.length - 1].findIndex(r => r.includes(2)) === 7]);
    v = E.generate("grid 16 4\nspawn square 2 at 1 0 color 2 vel 0 1\nspawn square 2 at 1 14 color 3 vel 0 -1\nrun 12");
    checks.push(["collision no overlap", v.frames[v.frames.length - 1].map(r => r.join("")).join("\n").includes("2233")]);
    v = E.generate("grid 10 5\nspawn dot at 2 0 color 2 vel 0 1 ghost 1 layer 0\nspawn rect 3 3 at 1 3 color 5 layer 1\nrun 8");
    checks.push(["ghost occlusion hides then returns", v.frames.some(g => colorCount(g, 2) === 0) && colorCount(v.frames[v.frames.length - 1], 2) === 1]);
    v = E.generate("grid 9 9\nspawn square 5 at 2 2 color 2 interior 4\nrun 0");
    checks.push(["interior split", lastNonBg(v, 4) === 9 && lastNonBg(v, 2) === 16]);
    v = E.generate("grid 20 20\nseed 3\nsort on\nhole square 3 at 2 2 id H1 color 5\nspawn square 3 random color 2 target H1\nrun 40");
    checks.push(["sorter locks", v.frames[v.frames.length - 1][2][2] === 2]);
    v = E.generate("grid 12 8\nseed 2\nvoronoi 4 colors 1 2 3 4\nrun 0");
    checks.push(["voronoi fills", new Set(v.frames[0].flat()).size >= 3]);
    v = E.generate("grid 12 3\nshooter at 1 0 dir right every 1 beam ray color 7\nspawn square 1 at 1 8 color 2\nrun 2");
    checks.push(["ray to object", v.frames[v.frames.length - 1][1].includes(7)]);
    v = E.generate("grid 9 12\ngravity down 1\nsource at 0 4 color 8 rate 1\nrun 34");
    checks.push(["liquid pools", v.frames[v.frames.length - 1][11].includes(8)]);
    const lw = E.runScene("grid 9 18\ngravity down 1\nliquid flow 1\nsource at 0 4 color 8 rate 1\nrun 12");
    v = E.toGridVid(lw);
    checks.push(["liquid fill budget one cell/frame", liquidMass(lw, 8) === 12]);
    checks.push(["liquid stream stays solid", v.frames.every(g => columnSolid(g, 4, 8))]);
    const lwFast = E.runScene("grid 9 18\ngravity down 1\nliquid flow 3\nsource at 0 4 color 8 rate 1\nrun 4");
    checks.push(["liquid fill budget n cells/frame", liquidMass(lwFast, 8) === 12]);
    const lwObject = E.runScene("grid 12 8\nliquid flow 1\nsource at 0 5 color 8 rate 1\nspawn rect 1 3 at 5 4 color 5\nrun 6");
    checks.push(["liquid lands on non-recipient object", liquidCells(lwObject, 8).some(([r, c]) => r === 4 && c === 5)]);
    const lwNoTeleport = E.runScene("grid 15 12\nliquid flow 1\nsource at 1 7 color 8 rate 1\nspawn line 8 v at 2 3 color 5\nspawn line 8 v at 2 11 color 5\nspawn line 7 at 5 4 color 5\nspawn line 9 at 10 3 color 5\nrun 5");
    checks.push(["liquid does not teleport below shelf", liquidCells(lwNoTeleport, 8).every(([r]) => r <= 4)]);
    const lwNoLeak = E.runScene("grid 16 14\nliquid flow 1\nsource at 1 7 color 8 rate 1\nspawn line 8 v at 3 3 color 5\nspawn line 8 v at 3 11 color 5\nspawn line 9 at 10 3 color 5\nrun 8");
    checks.push(["liquid stays inside recipient", liquidCells(lwNoLeak, 8).every(([, c]) => c >= 4 && c <= 10)]);
    const lwSpill = E.runScene("grid 12 10\nliquid flow 4\nsource at 0 5 color 8 rate 1\nspawn line 5 v at 4 3 color 5\nspawn line 5 v at 4 8 color 5\nspawn line 6 at 8 3 color 5\nrun 24");
    checks.push(["liquid spills after recipient fills", liquidCells(lwSpill, 8).some(([, c]) => c < 4 || c > 7)]);
    v = E.generate("grid 11 12\ngravity down 1\nliquid flow 1\nsource at 0 5 color 8 rate 1\nspawn rect 1 9 at 10 1 color 5\nspawn line 5 v at 6 1 color 5\nspawn line 5 v at 6 9 color 5\nrun 28");
    checks.push(["liquid basin has no dashed rows", rowRunsAtMost(v.frames[v.frames.length - 1], 8, 1)]);
    v = E.generate("grid 8 8\nspawn Lshape 3 at 2 2 color 3 spin 1\nrun 2");
    checks.push(["spin rotates", JSON.stringify(v.frames[0]) !== JSON.stringify(v.frames[2])]);
    const aug = E.augmentVid(E.generate("grid 6 8\nspawn Lshape 3 at 1 1 color 2\nrun 3"), { n: 5, seed: 1 });
    checks.push(["augment x5 distinct", aug.length === 5 && new Set(aug.map(a => JSON.stringify(a.frames))).size >= 3]);
    const zaug = E.augmentVid(E.generate("grid 6 8\nspawn dot at 1 1 color 2\nrun 1"), { n: 1, seed: 1, d4: false, color: false, zoom: true, zoomChoices: [2] })[0];
    checks.push(["augment external zoom", zaug.width === 12 && zaug.height === 16 && zaug.meta.augment.zoom === 2]);
    const sorterVid = E.generate("grid 14 10\nsort on\nhole square 3 at 1 1 id H color 5\nspawn square 3 at 5 5 color 2 target H\nrun 4\nhold 2");
    const matVid = E.materializeVid(sorterVid, { cellsPerFrame: 2 });
    checks.push(["materialize final roundtrip", JSON.stringify(matVid.frames[matVid.frames.length - 1]) === JSON.stringify(sorterVid.frames[sorterVid.frames.length - 1]) && colorCount(matVid.frames[0], 2) < colorCount(matVid.frames[matVid.frames.length - 1], 2)]);
    const tokGrid = [[0, 1, 1, 0, 2], [0, 1, 3, 3, 2], [4, 4, 4, 0, 0]];
    checks.push(["patch2d grid roundtrip", JSON.stringify(Patch2D.decodeGrid(Patch2D.encodeGrid(tokGrid))) === JSON.stringify(tokGrid)]);
    checks.push(["patch2d video deltas", Patch2D.encodeVideo([tokGrid, tokGrid.map(r => r.slice())]).includes("SAME")]);
    const shapeGrid = [[0, 0, 0, 0, 0, 0, 0, 0], [0, 2, 2, 2, 0, 5, 5, 5], [0, 2, 2, 2, 0, 5, 0, 5], [0, 2, 2, 2, 0, 5, 5, 5]];
    const shapeTokens = Shape2D.encodeGrid(shapeGrid);
    checks.push(["shape2d semantic tokens", shapeTokens.some(t => t.startsWith("SQUARE")) && shapeTokens.some(t => t.startsWith("FRAME"))]);
    checks.push(["shape2d roundtrip", JSON.stringify(Shape2D.decodeGrid(shapeTokens)) === JSON.stringify(shapeGrid)]);
    // new teaching mechanics
    let g2 = E.generate("grid 16 16\nseed 3\nlife density 0.4 color 3\nrun 6");
    checks.push(["life evolves", g2.frames[0].flat().includes(3) && JSON.stringify(g2.frames[0]) !== JSON.stringify(g2.frames[3])]);
    g2 = E.generate("grid 16 12\nwave color 8 amp 3 period 6\nrun 5");
    checks.push(["wave travels", g2.frames[0].flat().includes(8) && JSON.stringify(g2.frames[0]) !== JSON.stringify(g2.frames[4])]);
    g2 = E.generate("grid 16 16\nwell at 8 8 strength 1\nspawn dot at 1 1 color 2\nrun 14");
    const dp = f => { for (let r = 0; r < 16; r++) for (let c = 0; c < 16; c++) if (f[r][c] === 2) return Math.abs(r - 8) + Math.abs(c - 8); return 99; };
    checks.push(["well pulls body in & settles near centre", dp(g2.frames[g2.frames.length - 1]) <= 1]);
    g2 = E.generate("grid 20 8\nwalls box\nconveyor at 6 2 len 14 dir right\nspawn square 2 at 4 3 color 2 grav 1\nrun 16");
    const sx = f => { let mn = 99; for (let r = 0; r < 8; r++) for (let c = 0; c < 20; c++) if (f[r][c] === 2) mn = Math.min(mn, c); return mn; };
    checks.push(["conveyor carries body", sx(g2.frames[g2.frames.length - 1]) > sx(g2.frames[2])]);
    g2 = E.generate("grid 15 15\nseed 2\nmaze wall 5 solve 3\nrun 40");
    checks.push(["maze walls + solved path", g2.frames[g2.frames.length - 1].flat().includes(5) && g2.frames[g2.frames.length - 1].flat().filter(x => x === 3).length > 3]);
    g2 = E.generate("grid 16 6\nwalls box\nshooter at 3 1 dir right every 3 beam bolt color 2 speed 1 bounce 1\nrun 30");
    checks.push(["reflecting beam reaches far wall", g2.frames.some(f => f.some(row => row[13] === 2 || row[14] === 2))]);
    // --- static transform verbs (copy / recolor / move / mirror / remove / extract) ---
    v = E.generate("grid 8 8\nspawn square 2 at 1 1 color 2 id A\ncopy A to 1 5 tint 3");
    checks.push(["copy duplicates with recolor", colorCount(v.frames[0], 2) === 4 && colorCount(v.frames[0], 3) === 4]);
    v = E.generate("grid 8 8\nspawn square 2 at 1 1 color 2\nspawn square 2 at 1 5 color 3\nextract color 2");
    checks.push(["extract keeps only selected", colorCount(v.frames[0], 2) === 4 && colorCount(v.frames[0], 3) === 0]);
    v = E.generate("grid 8 8\nspawn dot at 1 1 color 2\nspawn dot at 1 3 color 2\nspawn dot at 1 5 color 2\nremove at 1 3");
    checks.push(["remove deletes matched", colorCount(v.frames[0], 2) === 2]);
    const _lc = colorCount(E.generate("grid 8 12\nspawn Lshape 3 at 1 1 color 4 id L").frames[0], 4);
    v = E.generate("grid 8 12\nspawn Lshape 3 at 1 1 color 4 id L\nmirror L axis v");
    checks.push(["mirror doubles the body", _lc > 0 && colorCount(v.frames[0], 4) === 2 * _lc]);
    v = E.generate("grid 8 8\nspawn dot at 1 1 color 2 id D\nmove D to 5 6");
    checks.push(["move relocates body", v.frames[0][5][6] === 2 && v.frames[0][1][1] === 0]);
    // --- prodigy-task: (EXAMPLES, IN, OUT) with a guaranteed teaching ---
    const taskScene = "grid 8 10\nbg 0\nseed 1\nspawn square 2 random 1 1 6 8 color 2\nspawn square 2 random 1 1 6 8 color 3\nspawn dot random 1 1 6 8 color 4\nhold 1\ncut\nextract color 2\nsnap 1";
    const task = E.buildTask(taskScene, { examples: 3 });
    checks.push(["task has EXAMPLES/IN/OUT keys", Array.isArray(task.examples) && task.examples.length === 3 && Array.isArray(task.in) && Array.isArray(task.out)]);
    checks.push(["task examples are in/out pairs of frame-lists", task.examples.every(e => Array.isArray(e.in) && Array.isArray(e.out) && Array.isArray(e.in[0]))]);
    checks.push(["task teaches (every pair changes IN→OUT)", task.meta.teaching.ok === true && task.meta.teaching.changedPairs === task.meta.teaching.totalPairs]);
    const idScene = "grid 6 6\nbg 0\nseed 1\nspawn square 2 at 1 1 color 2\nhold 1\ncut\nsnap 1";  // OUT == IN
    checks.push(["task validator rejects identity (no teaching)", E.buildTask(idScene, { examples: 2 }).meta.teaching.ok === false]);
    // variation lint: fixed-everything examples are flagged weak; random ones pass.
    const fixedScene = "rule recolor\ngrid 8 8\nbg 0\nspawn square 2 at 2 2 color 3 id s\nhold 1\ncut\nrecolor s tint 4\nsnap 1";       // identical every seed
    const variedScene = "rule recolor\ngrid 8 8\nbg 0\nseed 1\nspawn square 2 random 0 0 6 6 color 3 id s\nhold 1\ncut\nrecolor s tint 4\nsnap 1"; // random placement
    checks.push(["variation lint flags identical examples", E.buildTask(fixedScene, { examples: 3, augment: false }).meta.teaching.examplesVary === false && E.buildTask(variedScene, { examples: 3, augment: false }).meta.teaching.examplesVary === true]);
    const mont = E.taskToMontage(task);
    checks.push(["task montage renders all rows", mont.height > task.examples.length * 3 && mont.frames.length >= 1]);
    // incidental feature (colour) MUST vary across examples so the model can't latch onto it.
    const recScene = "grid 12 10\nbg 0\nseed 1\nspawn square 4 at 3 4 color rand id s\nbreak s cells 5\nhold 1\ncut\nrepair\nsnap 1";
    const recTask = E.buildTask(recScene, { examples: 4 });
    const domCol = v => { const g = v[v.length - 1], cnt = {}; for (const r of g) for (const x of r) if (x) cnt[x] = (cnt[x] || 0) + 1; return +Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a])[0]; };
    const recCols = recTask.examples.map(e => domCol(e.out));
    checks.push(["incidental colour varies across examples", new Set(recCols).size >= 3]);
    // procedural augmentation: 'vary' axes → one task-level transform, consistent across the whole task.
    const vScene = "rule mirror across vertical\nvary flip rot zoom color\ngrid 12 8\nbg 0\nseed 1\nspawn Lshape 3 random 1 1 3 4 color rand id h\nhold 1\ncut\nmirror h axis v\nsnap 1";
    const dims = v => v[0].length + "x" + v[0][0].length;
    const seen = new Set();
    for (const s0 of [1, 7, 20, 50]) { const tt = E.buildTask(vScene, { examples: 3, seed0: s0 }); seen.add(JSON.stringify(tt.meta.augment_applied)); const ds = tt.examples.map(e => dims(e.in)).concat([dims(tt.in)]); if (new Set(ds).size !== 1) seen.add("INCONSISTENT-" + s0); }
    checks.push(["aug: one transform per task, consistent, varies across seed0", seen.size >= 3 && ![...seen].some(x => x.startsWith("INCONSISTENT"))]);
    checks.push(["aug can be disabled", JSON.stringify(E.buildTask(vScene, { examples: 2, augment: false }).meta.augment_applied) === "[]"]);
    checks.push(["wild aug uses all declared axes", E.buildTask(vScene, { examples: 2, wild: true }).meta.augment_applied.length === 4]);
    // non-overlapping random placement (hidden objects make IN→OUT unsolvable).
    const ow = E.runScene("grid 12 12\nbg 0\nseed 5\nspawn square 3 random 0 0 11 11 color 2\nspawn square 3 random 0 0 11 11 color 3\nspawn square 3 random 0 0 11 11 color 4\nspawn square 3 random 0 0 11 11 color 6", { noSim: true });
    let ovl = 0; { const occ = {}; for (const b of ow.bodies) for (const [dr, dc] of b.cells) { const kk = (b.r + dr) + "," + (b.c + dc); if (occ[kk]) ovl++; occ[kk] = 1; } }
    checks.push(["random placement does not overlap", ovl === 0]);
    // DSL internal representation embedded for grid→representation training.
    const rt = E.buildTask("rule x\ngrid 8 8\nbg 0\nseed 1\nspawn square 3 at 2 2 color 4 id s\nscatter 5 color 7\nhold 1\ncut\nremove shape noise\nsnap 1", { examples: 2 });
    checks.push(["task carries DSL internal representation", rt.meta.representation.in_objects.length === 6 && rt.meta.representation.out_objects.length === 1 && rt.meta.representation.program.length > 0]);
    checks.push(["scatter adds free noise cells", rt.meta.representation.in_objects.filter(o => o.kind === "noise").length === 5]);
    // counting · grid-holes · turtle (the IMPORTANT priors from the brief)
    v = E.generate("grid 12 6\nbg 0\nspawn dot at 1 1 color 2\nspawn dot at 1 3 color 2\nspawn dot at 1 5 color 2\ntally color 2 at 4 1 color 6");
    checks.push(["tally bar length equals count", colorCount(v.frames[v.frames.length - 1], 6) === 3]);
    let latw = E.runScene("grid 14 14\nbg 0\nseed 2\nlattice 4 4 cell 2 gap 1 color 8 holes 3", { noSim: true });
    const holed = latw.bodies.filter(b => b.kind === "tile").length;
    latw = E.runScene("grid 14 14\nbg 0\nseed 2\nlattice 4 4 cell 2 gap 1 color 8 holes 3\nfill", { noSim: true });
    checks.push(["lattice holes then fill completes the grid", holed === 13 && latw.bodies.filter(b => b.kind === "tile").length === 16]);
    v = E.generate("grid 12 12\nbg 0\nturtle at 9 5 dir up program FFFRFF color 7\ndrive");
    const pathBody = E.runScene("grid 12 12\nbg 0\nturtle at 9 5 dir up program FFFRFF color 7\ndrive", { noSim: true }).bodies.find(b => b.kind === "path");
    checks.push(["turtle drive traces a multi-cell path", pathBody && pathBody.cells.length >= 6]);
    // composition (def/use/repeat + arithmetic) · inverse grid (outline) · comparison
    const cw = E.runScene("def b r c col\n  spawn square 2 at $r $c color $col\nend\nrepeat 3 i\n  use b 2 $i*4+1 5\nend\ngrid 16 8\nbg 0", { noSim: true });
    checks.push(["macros compose (def/use/repeat + arithmetic)", cw.bodies.length === 3 && cw.bodies.map(b => b.c).join(",") === "1,5,9"]);
    const fw = E.runScene("grid 10 10\nbg 0\nlattice 1 1 cell 4 gap 0 color 8 at 2 2 outline", { noSim: true });
    checks.push(["lattice outline = hollow frame (border only)", fw.bodies[0].cells.length === 12]);  // 4x4 frame = 12 border cells
    const kb = E.generate("grid 10 8\nbg 0\nspawn rect 1 4 at 1 1 color 2\nspawn dot at 6 1 color 3\nkeep_bigger 2 3 at 4 4 size 2");
    checks.push(["keep_bigger outputs the larger group's colour", colorCount(kb.frames[kb.frames.length - 1], 2) === 4 && colorCount(kb.frames[kb.frames.length - 1], 3) === 0]);
    // double · graph-paper mesh (inverse grid) · zoom both directions
    const dw = E.runScene("grid 8 8\nbg 0\nspawn square 2 at 1 1 color 3 id s\ndouble s factor 2", { noSim: true });
    checks.push(["double scales a body in place (2x2→4x4)", dw.bodies[0].cells.length === 16]);
    const zin = E.runScene("grid 12 12\nbg 0\nspawn square 2 at 1 1 color 3 id s\nzoom s factor 3", { noSim: true }).bodies[0].cells.length;
    const zout = E.runScene("grid 12 12\nbg 0\nspawn square 6 at 1 1 color 3 id s\nzoom s factor -2", { noSim: true }).bodies[0].cells.length;
    checks.push(["zoom function works both ways (in ×3=36, out ÷2=9)", zin === 36 && zout === 9]);
    // spill — the new simple fluid: continuous column, fills a cup, conserves mass, overflows
    const sp = E.generate("grid 12 12\nbg 0\nwalls floor\nspawn line 4 v at 5 4 color 5\nspawn line 4 v at 5 8 color 5\nspawn line 5 at 8 4 color 5\nspill at 0 6 color 8 rate 1\nrun 24");
    const cnt8 = (g) => colorCount(g, 8), f = sp.frames;
    checks.push(["spill pours a continuous column", columnSolid(f[6], 6, 8)]);
    checks.push(["spill conserves mass (monotone fill on a floor)", cnt8(f[20]) >= cnt8(f[10]) && cnt8(f[10]) >= cnt8(f[5]) && cnt8(f[f.length - 1]) >= 12]);
    checks.push(["spill fills the cup interior", [6, 7].every(rw => f[f.length - 1][rw].slice(5, 8).includes(8))]);
    // n_examples as a variable augmentation
    const exVarScene = "rule keep red\nexamples rand 2 5\ngrid 8 8\nbg 0\nseed 1\nspawn square 2 random 0 0 6 6 color 2\nspawn square 2 random 0 0 6 6 color rand 3 9\nhold 1\ncut\nextract color 2\nsnap 1";
    const ks = new Set([1, 2, 3, 4, 5].map(s => E.buildTask(exVarScene, { seed0: s }).meta.n_examples));
    checks.push(["n_examples varies per task (examples rand)", ks.size >= 2 && [...ks].every(x => x >= 2 && x <= 5)]);
    // MANUAL mode: generator authors diverse example blocks
    const manual = "=== example ===\nrule biggest→blue\ngrid 8 8\nbg 0\nspawn square 4 at 1 1 color 3 id a\nspawn dot at 6 6 color 5 id b\nhold 1\ncut\nrecolor largest tint 1\nsnap 1\n=== test ===\nrule biggest→blue\ngrid 9 7\nbg 0\nspawn Lshape 3 at 2 3 color 6 id a\nspawn square 2 at 5 1 color 4 id b\nhold 1\ncut\nrecolor largest tint 1\nsnap 1";
    const mt = E.buildTask(manual);
    checks.push(["manual mode assembles authored examples", mt.meta.authored === "manual" && mt.examples.length === 1 && mt.meta.teaching.ok]);
    // cheap structural coherence guard (zero-LLM): rejects nonsense the teaching/variation check passes.
    const preCut = E.buildTask("rule keep largest\ngrid 10 10\nbg 0\nseed 1\nspawn square rand 2 4 random 0 0 4 4 color rand 2 8 id a\nspawn square rand 2 4 random 5 0 9 4 color rand 2 8 id b\nextract largest\nhold 1\ncut\ngrid_flip diagonal", { examples: 3 });
    const goodSel = E.buildTask("rule keep red\ngrid 12 10\nbg 0\nseed 1\nspawn square 2 random 1 1 8 8 color 2\nspawn square 2 random 1 1 8 8 color rand 3 9\nhold 1\ncut\nextract color 2\nsnap 1", { examples: 3 });
    checks.push(["coherence guard rejects selection-before-IN, passes good", preCut.meta.teaching.coherent === false && goodSel.meta.teaching.coherent === true]);
    // new physics: explode (radial, conserved) · shatter (falls) · path-follow (advances) · burst
    const exV = E.generate("grid 13 13\nbg 0\nwalls box\nspawn square 3 at 5 5 color 2 id s\nhold 1\nexplode s\nrun 5");
    const f0 = exV.frames[0], fN = exV.frames[exV.frames.length - 1];
    checks.push(["explode conserves mass and spreads", colorCount(f0, 2) === 9 && colorCount(fN, 2) === 9 && JSON.stringify(f0) !== JSON.stringify(fN)]);
    const pv = E.generate("grid 8 12\nbg 0\npath at 1 1 to 1 9 color 5 walk 4\nrun 6");
    const walkerCol = g => { for (let r = 0; r < g.length; r++) for (let c = 0; c < g[0].length; c++) if (g[r][c] === 4) return c; return -1; };
    checks.push(["path walker advances along the route", walkerCol(pv.frames[5]) > walkerCol(pv.frames[1])]);
    const shV = E.generate("grid 12 12\nbg 0\nwalls floor\nspawn square 3 at 2 5 color 6 id s\nhold 1\nshatter s\nrun 9");
    const lowest = g => { for (let r = g.length - 1; r >= 0; r--) if (g[r].includes(6)) return r; return -1; };
    checks.push(["shatter fragments fall", lowest(shV.frames[shV.frames.length - 1]) > lowest(shV.frames[0])]);
    // whole-grid layer (the ARC-AGI-2 ops): each verb is the last frame after hold/cut.
    const gout = (sc) => { const v = E.generate(sc); return v.frames[v.frames.length - 1]; };
    const eqg = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    const base = "grid 3 3\nbg 0\nwalls none\npaint 0 1 color 2\npaint 0 2 color 3\npaint 1 2 color 4\nhold 1\ncut\n";
    checks.push(["grid_flip diagonal = transpose", eqg(gout(base + "grid_flip diagonal"), [[0, 0, 0], [2, 0, 0], [3, 4, 0]])]);
    checks.push(["grid_rotate 2 = 180°", eqg(gout(base + "grid_rotate 2"), [[0, 0, 0], [4, 0, 0], [3, 2, 0]])]);
    checks.push(["grid_map remaps the whole grid", eqg(gout(base + "grid_map 2 7 3 8"), [[0, 7, 8], [0, 0, 4], [0, 0, 0]])]);
    checks.push(["grid_flip h mirrors the grid", eqg(gout(base + "grid_flip h"), [[3, 2, 0], [4, 0, 0], [0, 0, 0]])]);
    const latin = "grid 4 4\nbg 0\nwalls none\npaint 0 1 color 4\npaint 0 2 color 2\npaint 0 3 color 3\npaint 1 0 color 4\npaint 1 1 color 1\npaint 1 3 color 2\npaint 2 1 color 3\npaint 2 2 color 4\npaint 3 0 color 3\npaint 3 2 color 1\npaint 3 3 color 4\nhold 1\ncut\nsolve";
    const sol = gout(latin), latinOk = sol.every((row, r) => row.every(v => v !== 0) && new Set(row).size === 4) && [0, 1, 2, 3].every(c => new Set(sol.map(r => r[c])).size === 4);
    checks.push(["solve completes a Latin square (no 0s, rows+cols unique)", latinOk]);
    v = E.generate("grid 13 13\nbg 0\nmesh 3 3 color 8");
    checks.push(["mesh draws coloured grid lines (inverse grid)", v.frames[0][0].every(x => x === 8) && colorCount(v.frames[0], 8) > 40]);
    const zt = new Set(); for (let s = 1; s <= 24; s++) { const a = E.buildTask("rule x\nvary zoom\ngrid 10 10\nbg 0\nseed 1\nspawn square 3 at 2 2 color 3 id s\nhold 1\ncut\ncopy s by 0 0 tint 4\nsnap 1", { examples: 1, seed0: s }).in[0].length; zt.add(a); }
    checks.push(["zoom augmentation is zoom-in only (no destructive zoom-out)", [...zt].every(x => x >= 10) && zt.size >= 2]);
    // mass dataset sampler (PAN-114): every accepted task must teach + be coherent; ids unique; templates spanned.
    const ds = genDataset({ templatesDir: path.join(__dirname, "scenes", "library"), n: 12, seedBase: 1, wildFrac: 0.3 });
    checks.push(["generate-dataset yields only coherent teaching tasks", ds.accepted.length === 12 && ds.accepted.every(a => a.task.meta.teaching.ok && a.task.meta.teaching.coherent)]);
    checks.push(["generate-dataset dedups (unique ids) + spans templates", new Set(ds.accepted.map(a => a.id)).size === 12 && new Set(ds.accepted.map(a => a.template)).size >= 4]);
    // hierarchical function-menu proposer (PAN-132 / G0)
    const libDir = path.join(__dirname, "scenes", "library");
    const reg = buildFunctionRegistry(libDir, 1);
    const libCount = fs.readdirSync(libDir).filter(x => x.endsWith(".txt")).length;
    checks.push(["function registry covers the library with categories", reg.length === libCount && reg.every(r => r.category) && new Set(reg.map(r => r.category)).size >= 6]);
    const menu = proposeMenu(E.makeRng(123), reg, { k: 3 });
    const augOk = menu.augmentations.every(a => menu.functions.every(fn => reg.find(r => r.name === fn.name).safeAug.includes(a)));
    const wholeOk = menu.functions.filter(fn => fn.wholeGrid).length <= 1;
    checks.push(["propose menu: k functions, ≤1 whole-grid, augmentations rule-safe for all", menu.functions.length === 3 && wholeOk && augOk]);
    checks.push(["propose is deterministic per seed", JSON.stringify(proposeMenu(E.makeRng(9), reg, { k: 2 })) === JSON.stringify(proposeMenu(E.makeRng(9), reg, { k: 2 }))]);
    // GOD BUILDER (builder.js): 1 base + admitted refinements + paired difficulty + budget breakdown
    try { Builder.selfTest(); checks.push(["god builder self-test (families, admits-graph, budget, determinism)", true]); }
    catch (e) { checks.push(["god builder self-test (families, admits-graph, budget, determinism): " + e.message, false]); }
    const gm = proposeMenu(E.makeRng(77), reg, { k: 3, static: true, target: 0.75 });
    const gdb = Builder.FAMILY_DB[gm.baseFamily];
    checks.push(["god menu: exactly one BASE first, refinements ∈ admits(base), finisher last",
      gm.functions[0].role === "base" && gm.functions.filter(x => x.role === "base").length === 1
      && gm.functions.slice(1).every(x => gdb.admits.includes(x.family))
      && (gm.functions.findIndex(x => x.role === "finisher") === -1 || gm.functions.findIndex(x => x.role === "finisher") === gm.functions.length - 1)]);
    checks.push(["god menu: every function has a paired difficulty + composed budget covers all",
      gm.functions.every(x => typeof x.difficulty === "number") && Array.isArray(gm.budget) && gm.budget.length === gm.functions.length && gm.target === 0.75]);
    const gPrompt = menuToPrompt(gm);
    checks.push(["role-aware menu prompt (CORE MECHANIC / REFINEMENT / difficulty target)",
      /CORE MECHANIC/.test(gPrompt) && (gm.functions.length < 2 || /REFINEMENT/.test(gPrompt)) && /Difficulty target/.test(gPrompt)]);
    // small-model prompt-kit (PAN-121): full prompt = guardrails + menu-scoped grammar + menu + exemplar
    const pkPrompt = buildPrompt(reg, proposeMenu(E.makeRng(5), reg, { k: 2 }), { templatesDir: path.join(__dirname, "scenes", "library") });
    checks.push(["prompt-kit assembles guardrails + grammar slice + menu + exemplar", /Reserved words/.test(pkPrompt) && /GRAMMAR \(only/.test(pkPrompt) && /YOUR TASK:/.test(pkPrompt) && /VALID EXAMPLE SCENE/.test(pkPrompt) && /^\s+grid\b/m.test(pkPrompt) && pkPrompt.includes("cut")]);
    // prompt-kit surfaces the G2/G3 conditional layer (predicate vocabulary + it/where selectors) when a dispatch/classify
    // template is sampled — else the model could only copy the exemplar, never write a NEW conditional task.
    const dispFn = reg.find(r => r.name === "dispatch_symmetry");
    const dispPrompt = buildPrompt(reg, { functions: [{ name: dispFn.name, category: dispFn.category, rule: dispFn.rule, wholeGrid: false }], augmentations: [], composeHint: "", difficulty: 0.6, k: 1 }, { templatesDir: path.join(__dirname, "scenes", "library") });
    checks.push(["prompt-kit exposes predicates + dispatch/it/where for conditional templates", /PREDICATES \(the PRED values/.test(dispPrompt) && /\bconvex\b/.test(dispPrompt) && /^\s+dispatch SEL by PRED/m.test(dispPrompt) && /^\s+it\b/m.test(dispPrompt) && /^\s+where PRED/m.test(dispPrompt)]);
    const sf = flags(["generate-llm", "--dynamic", "--temp", "0.4", "--maxtok", "4096"]);
    checks.push(["flags parse dynamic generation controls", sf.dynamic === true && sf.temp === 0.4 && sf.maxtok === 4096]);
    const ss = SuperSuggester.suggestTasks({ seed: 3, count: 12 });
    checks.push(["super-suggester emits typed dataset-shaped records", ss.records.length === 12 && ss.records.every(r => r.unique_code && r.depth >= 1 && r.dsl_suggestions && r.dsl_representation && r.object_level_json_representation && r.json_grid_representation && r.python_compiled_dsl_function === null)]);
    const ssStatic = SuperSuggester.suggestTasks({ seed: 3, count: 8, mode: "static", difficulty: "3-7" });
    checks.push(["super-suggester applies mode + difficulty filters", ssStatic.records.length === 8 && ssStatic.normalized_difficulty && ssStatic.records.every(r => r.difficulty >= 0.3 && r.difficulty <= 0.7 && !r.dsl_suggestions.functions.some(f => SuperSuggester.FUNCTION_SCHEMAS.find(s => s.name === f.name).dynamic))]);
    // --- detector predicates (G3) + context-sensitive rule (G2): dispatch / classify / where ---
    const pw = E.runScene("grid 16 16\nspawn square 3 at 1 1 color 2\nspawn Lshape 3 at 1 7 color 3\nspawn frame 3 3 at 7 1 color 4\nspawn line 4 at 7 7 color 5", { noSim: true });
    const pk = {}; pw.bodies.forEach(b => (pk[b.kind] = b));
    checks.push(["predicate: convex true for square, false for Lshape/frame", E.evalPred("convex", pk.square) === true && E.evalPred("convex", pk.Lshape) === false && E.evalPred("convex", pk.frame) === false]);
    checks.push(["predicate: frame has_loop, square does not", E.evalPred("loop", pk.frame) === true && E.evalPred("holes", pk.frame) === 1 && E.evalPred("loop", pk.square) === false]);
    checks.push(["predicate: symmetry/orientation/parity", E.evalPred("symmetry", pk.square) === "hv" && E.evalPred("symmetry", pk.Lshape) === "none" && E.evalPred("orientation", pk.line) === "wide" && E.evalPred("collinear", pk.line) === true && E.evalPred("parity", pk.square) === "odd"]);
    // dispatch: context-sensitive recolor — symmetric→8, asymmetric→9 (the conditional rule)
    let dv = E.generate("grid 12 12\nspawn square 2 at 1 1 color 2\nspawn Lshape 3 at 1 7 color 2\ncut\ndispatch all by symmetric\n  case yes\n    recolor it tint 8\n  case no\n    recolor it tint 9\nend\nsnap 1");
    const df = dv.frames[dv.frames.length - 1];
    checks.push(["dispatch routes per-object by predicate (sym→8, asym→9)", colorCount(df, 8) === 4 && colorCount(df, 9) === 5 && colorCount(df, 2) === 0]);
    // dispatch default branch + a different predicate (size_class)
    dv = E.generate("grid 14 14\nspawn square 1 at 1 1 color 2\nspawn square 3 at 1 5 color 2\ncut\ndispatch all by size_class\n  case big\n    remove it\n  default\n    recolor it tint 7\nend\nsnap 1");
    const df2 = dv.frames[dv.frames.length - 1];
    checks.push(["dispatch default branch fires for unlisted values", colorCount(df2, 7) === 1 && colorCount(df2, 2) === 0 && df2.flat().filter(x => x === 9).length === 0]);
    // where selector usable by any SEL verb
    const wv = E.generate("grid 12 12\nspawn square 2 at 1 1 color 2\nspawn Lshape 3 at 1 7 color 3\nextract where convex");
    checks.push(["where-PRED selector filters bodies (extract where convex)", colorCount(wv.frames[0], 2) === 4 && colorCount(wv.frames[0], 3) === 0]);
    // classify: Bongard scene→class token (A if all satisfy PRED else B)
    const ca = E.generate("grid 12 12\nspawn square 2 at 1 1 color 2\nspawn square 2 at 1 7 color 2\nclassify all by symmetric into 5 6 at 0 0");
    const cb = E.generate("grid 12 12\nspawn square 2 at 1 1 color 2\nspawn Lshape 3 at 1 7 color 2\nclassify all by symmetric into 5 6 at 0 0");
    checks.push(["classify emits scene class token (allSym→A, mixed→B)", colorCount(ca.frames[0], 5) === 4 && colorCount(ca.frames[0], 6) === 0 && colorCount(cb.frames[0], 6) === 4 && colorCount(cb.frames[0], 5) === 0]);
    // error surfaces: unknown predicate, stray case/default outside a block
    let dispatchErrs = 0;
    for (const bad of ["grid 6 6\nspawn dot at 1 1\nclassify all by bogus into 1 2", "grid 6 6\nspawn dot at 1 1\ncase yes\nrecolor it tint 3", "grid 6 6\nspawn dot at 1 1\ndispatch all by convex\n  recolor it tint 3"]) {
      try { E.generate(bad); } catch (e) { dispatchErrs++; }
    }
    checks.push(["dispatch/classify reject bad input (unknown pred, stray case, no-case)", dispatchErrs === 3]);
    // --- boolean figure-algebra (G1): combine or/xor/and/sub + overlay_figs ---
    const g1 = op => E.generate("grid 9 9\nspawn square 3 at 1 1 color 2 id A\nspawn plus 3 at 1 5 color 3 id B\ncut\ncombine A B op " + op + " into 1 1 color 4\nsnap 1").frames.slice(-1)[0].flat().filter(x => x === 4).length;
    // A=square(9), B=plus(5), plus ⊂ square: or=9, and=5, xor=4, sub(square−plus)=4 corners
    checks.push(["combine boolean ops (or/and/xor/sub) cell-exact", g1("or") === 9 && g1("and") === 5 && g1("xor") === 4 && g1("sub") === 4]);
    const ovf = E.generate("grid 9 9\nspawn square 3 at 1 1 color 2 id A\nspawn plus 3 at 1 5 color 3 id B\ncut\noverlay_figs A B at 1 1 overlap 5\nsnap 1").frames.slice(-1)[0].flat();
    const cnt = c => ovf.filter(x => x === c).length;
    checks.push(["overlay_figs marks a-only/b-only/shared distinctly", cnt(2) === 4 && cnt(5) === 5 && cnt(3) === 0]);
    // --- analogy + series + odd-one-out (G4) ---
    const oddV = E.generate("grid 16 6\nspawn square 2 at 1 1 color 2\nspawn square 2 at 1 5 color 2\nspawn plus 3 at 1 9 color 2\nspawn square 2 at 1 13 color 2\ncut\nextract odd by shape\nsnap 1").frames.slice(-1)[0].flat();
    checks.push(["odd selector keeps the minority (odd by shape)", oddV.filter(x => x === 2).length === 5]);   // only the plus (5 cells) survives
    const anV = E.generate("grid 12 8\nspawn square 2 at 1 1 color 2 id A\nspawn square 2 at 1 5 color 7 id B\nspawn square 2 at 5 1 color 2 id C\ncut\nbind_transform T from A to B\napply T to C\nsnap 1").frames.slice(-1)[0].flat();
    checks.push(["bind_transform/apply completes the analogy (recolor)", anV.filter(x => x === 7).length === 8 && anV.filter(x => x === 2).length === 4]);   // B + C' = color 7 (8 cells); A unchanged (4 cells color 2)
    const prV = E.generate("grid 18 8\nprogress square at 1 1 attr size base 1 step 1 n 4 gap 1 color 3").frames[0].flat();
    checks.push(["progress builds an arithmetic series (sizes 1,2,3,4)", prV.filter(x => x === 3).length === 30]);
    // --- matrix/symmetry completion (G7) ---
    const gcH = E.generate("grid 10 6\nspawn Lshape 3 at 1 1 color 3\nhold 1\ncut\ngrid_complete h").frames.slice(-1)[0];
    const gcIn = E.generate("grid 10 6\nspawn Lshape 3 at 1 1 color 3\nsnap 1").frames.slice(-1)[0];
    const cells = g => g.reduce((n, r) => n + r.filter(x => x !== 0).length, 0);
    checks.push(["grid_complete mirrors the filled part into the blank side", cells(gcH) === 2 * cells(gcIn) && gcH[1][8] === 3]);
    // --- paper-folding unfold (G5): one mark in the top-left quarter → 4 marks (4-fold) ---
    const uf = E.generate("grid 9 9\nspawn dot at 1 1 color 3\nhold 1\ncut\nunfold v at 4 h at 4").frames.slice(-1)[0];
    checks.push(["unfold mirrors a punched hole across both creases (4-fold)", uf.flat().filter(x => x === 3).length === 4 && uf[1][1] === 3 && uf[1][7] === 3 && uf[7][1] === 3 && uf[7][7] === 3]);
    // --- self-correcting LLM loop (PAN-122): a mock model fails (no teaching) then fixes → accepted on retry ---
    let mockCalls = 0;
    const mockModel = async () => { mockCalls++;
      return mockCalls === 1
        ? "grid 10 10\nseed 1\nspawn square 2 random 1 1 7 7 color 2\nhold 1\ncut\nsnap 1"                       // OUT==IN → no teaching
        : "grid 10 10\nseed 1\nspawn square 2 random 1 1 8 3 color 2\nspawn square 2 random 1 6 8 8 color 3\nhold 1\ncut\nrecolor color 2 tint 3\nsnap 1"; };  // teaches + colour-grounded (3 is in the input)
    const llmR = await llmGenerateOne("PROMPT", mockModel, { retries: 2 });
    checks.push(["self-correcting loop retries on reject then accepts the fixed scene", !!llmR && llmR.attempts === 2 && llmR.task.meta.teaching.ok && mockCalls === 2]);
    checks.push(["extractScene strips code fences + prose", extractScene("Here is my scene:\n```\ngrid 8 8\nspawn dot at 1 1\n```\nDone.").startsWith("grid 8 8") && !extractScene("```\ngrid 8 8\n```").includes("`")]);
    checks.push(["extractScene keeps only the FIRST scene of a multi-scene reply", extractScene("rule a\ngrid 8 8\nspawn dot at 1 1\nsnap 1\n\nrule b\ngrid 9 9\nspawn dot at 2 2\nsnap 1").split(/\n/).filter(l => /^grid/.test(l)).length === 1]);
    // --static: physics/video templates excluded + every task collapsed to a single grid (ARC-AGI-2 shape)
    const regStatic = reg.filter(r => !r.dynamic);
    checks.push(["static mode excludes dynamic templates, keeps the abstract ones", reg.some(r => r.dynamic) && regStatic.length >= 40 && regStatic.every(r => !r.dynamic) && !regStatic.find(r => r.name === "gravity_settle") && regStatic.find(r => r.name === "classify_convex")]);
    const dynTask = E.buildTask(fs.readFileSync(path.join(__dirname, "scenes", "library", "gravity_settle.txt"), "utf8"), { examples: 2 });
    const before = dynTask.out.length; staticizeTask(dynTask);
    checks.push(["staticizeTask collapses every component to the last single frame", before > 1 && dynTask.out.length === 1 && dynTask.examples.every(e => e.in.length === 1 && e.out.length === 1)]);
    let okAll = true;
    for (const [n, p] of checks) { console.log((p ? "  ok  " : " FAIL ") + n); okAll = okAll && p; }
    console.log(okAll ? "\nself-test: ALL PASS" : "\nself-test: FAILURES");
    process.exit(okAll ? 0 : 1);
  },
};

function main(argv) {
  const cmd = argv[0];
  if (!cmd || cmd === "-h" || cmd === "--help") {
    console.log("gridvid CLI — commands: gen · task · generate-dataset · generate-llm · export-objectives · propose · prompt · super-suggest · augment · render · gallery · shapes · dsl · validate · new · self-test\n  gen <scene…> --augment K [--wild] [--rate] [--zoom-aug] [--zoom-in-only] [--materialize] [--gif]\n  generate-dataset --n N [-o dir] [--shards K] [--workers W] [--seed-base S] [--templates DIR] [--wild-frac F] [--max-attempts M] [--num-nodes W --node-rank R]\n  generate-llm     --n N (--endpoint URL [--model NAME] | --stub) [--dynamic] [--temp F] [--maxtok N] [--retries R] [--k K] [--num-nodes W --node-rank R] [-o dir]   Qwen writes DSL → engine verifies → self-corrects\n  export-objectives <dataset-dir> [-o file.jsonl] [--objective arc_pair|next_frame|inverse_dynamics|object_aux|all]   prodigy-task → training records\n  propose --n N [--k K] [--seed-base S] [--templates DIR] [-o file]   hierarchical function-menu for a small model\n  prompt  [--k K] [--seed-base S] [--templates DIR] [-o file]         full small-model prompt for one sampled task\n  super-suggest --n N [--seed N] [-o file.json|file.html] [--html]    typed PAN-176 DSL-slice suggestions\n  augment <video…> --materialize [--n K]              block-by-block final-object appearance\n  gallery <dir> [--open]                              render all to GIF + write a gallery\nrun `node cli.js dsl` for the scene grammar.");
    return;
  }
  if (!cmds[cmd]) { console.error("unknown command: " + cmd); process.exit(1); }
  return Promise.resolve(cmds[cmd](argv.slice(1))).catch(e => { console.error(e && e.stack || e); process.exit(1); });
}

if (require.main === module) { if (isMainThread) main(process.argv.slice(2)); else runWorker(); }
module.exports = { main };
