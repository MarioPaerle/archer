# GRIDVID — handover for the next agent

> Read this first. It's the operating contract for the `gridvid` sub-project.
> Last updated: **2026-06-22**.

## 0. START HERE — current state (2026-06-22)
**What it is:** a DSL + engine that generates ARC-style **(EXAMPLES, IN, OUT)** task families (`prodigy-task` JSON) teaching the
human-core priors ARC-AGI-2 leans on. The bet: pretrain a grid-native world-model on millions of these → priors transfer to few-shot ARC.

**The pipeline (the whole point):** a small model (Qwen-30B-A3B) generates DSL scenes → the **engine is the cheap verifier** (parse ·
teaching · variation · **coherence guard**, all zero-LLM, microseconds) → keep only good tasks. Plus a **verified template library**
sampled procedurally for coherence-by-construction. **No per-task big-LLM critic** — that doesn't scale to millions.

**What's built & working (engine.js ~1.8k lines, cli.js; `node cli.js self-test` = 96 checks ALL PASS):**
- **Full DSL** (`node cli.js dsl`): objects (spawn/shapes/random/`color rand`/`rand` sizes) · object verbs (copy/recolor/move/mirror/
  remove/extract/corrupt/break/repair/zoom/double/arrange/tally/keep_bigger/mark_enclosed/fill/lattice/mesh) · **whole-grid algebra**
  (grid_rotate/grid_flip h|v|diagonal/grid_map/sort_rows/solve/**crop**) — closes the ARC-AGI-2 expressivity gap · **physics**
  (gravity/spill-fluid/explode/shatter/burst/path-follow+candies/bounce/orbit/spin/snake/conveyor/maze/shooter-bounce) ·
  **composition** (def/use/repeat + `$i*4+1` arithmetic) · **context-sensitive rules** (`dispatch SEL by PRED / case V / default / end` per-object conditional binding `it` · `classify SEL by PRED into A B` Bongard scene→class token · `where PRED [is V]` selector · **detector predicates** convex/symmetry/symmetric/loop/holes/connected/collinear/parity/orientation/size_class/kind/color) · task-authoring (rule/concept/difficulty/examples/vary/cut/snap) · `grid rand` (variable size).
- **Coherence guard** (`meta.teaching.coherent`, zero-LLM): rejects selection-before-IN, near-empty IN, trivial change. Extend it as new nonsense appears.
- **Augmentation** declared by `vary AXIS..` (flip rot zoom shift color; zoom-IN only) — one rule-safe transform per task; `wild` = all axes.
- **Template LIBRARY**: `scenes/library/` = **59 verified templates**, all coherent, across every prior (selection · counting/ordering ·
  symmetry · reconstruction · copy/transform · grids/holes · whole-grid · physics · composition/programs · **context-sensitive rules** (G2/G3) ·
  **boolean figure-algebra** (G1: figure_xor/and/overlay) · **analogy/series/odd-one-out** (G4) · **matrix/symmetry completion** (G7) ·
  **paper-folding** (G5: unfold_paper)). `out/library_json/` = their `.task.json`.
- **CINECA generator pipeline**: `cli.js generate-dataset` (template sampler) + `cli.js generate-llm` (the Qwen-in-the-loop generator:
  proposer → prompt-kit → served model writes DSL → engine verifies → **self-corrects** on reject) — both **multinode** (`--num-nodes/--node-rank`,
  disjoint seed slices) — + `cli.js export-objectives` (prodigy-task → arc_pair/next_frame/inverse_dynamics/object_aux training records).
- **Mass sampler**: `cli.js generate-dataset --n N [--workers W]` — template×seed×params, coherence-guarded, dedup, sharded gzip JSONL +
  `manifest.jsonl`, parallel. **Function-menu proposer** `cli.js propose` + **prompt-kit** `cli.js prompt` (curate a small DSL slice per task for the model).
- **Galleries** (`out/tasks_gallery/*.html`, built by `build_*.js`): `v3.html` (whole library, grouped) · `haiku_v3.html` (small-model
  novelty test, engine-filtered) · plus v1_final / showcase_v2 / arc_solved / collection2. **Montage shows TRUE panel sizes** (crop/grid-rand visible).

**⚠ Process rule (learned the hard way): EYEBALL the rendered IN→OUT of every new/modified template — the coherence guard catches
structural nonsense but NOT visual breakage (overflow/clipping/portrait-vs-arrange). Render and LOOK before shipping.**

**Where the work lives & next steps:** day-to-day backlog in `TODO.md`; durable tracked backlog on **Linear team Panisperna (PAN)** —
see `../LINEAR.md`. Done: PAN-114 (sampler) · 123 (parallel) · 121 (prompt-kit) · 132 (function-menu proposer) · **125 (dispatch/classify) · 126
(detector predicates)** ← the IQ-keystone, shipped 2026-06-22 (see §G2/G3 below). **Next priorities:**
PAN-127 (G1 boolean figure-algebra `combine or/xor/and/sub`) · PAN-128 (G4 analogy/series + `odd by PROP`) · PAN-119/120 (typed combinators
`program.js` + auto-compose — `dispatch` is now its conditional core) · PAN-122 (self-correcting loop) · PAN-129/131 (IQ priors: fold/find,
distribution — see `DESIGN/iq-tests-to-dsl.md`) · PAN-117 (objectives export). Research tree:
**Scintilla** project `arc-agi-2-english-knowledge-base`; experiments/origin: **Flywheel**.

> **Published 2026-06-20:** this generator state is on **Scintilla** node `gridvid-generator-dsl-coherence-guard-46-template-library-ma`
> (under `runnable-code-dsl-generator-vm-augmentation`), **mirrored to Flywheel** as `bold-snowflake-3633` /
> `ad86eacd-0b93-504b-b714-aec335dcc778` (do NOT re-push it — the Scintilla↔Flywheel link tool isn't exposed in MCP, so
> `scintilla_flywheel_status` will wrongly show it "unpushed"; it IS published). Linear status comment on **PAN-124**.

## 0b. What this is & why
`gridvid` makes **2dgridvid**: short videos that are lists of 2D grids, every cell an
**ARC color 0–9**. It exists to generate **grid-native world-prior pretraining data** for the
ARC-AGI-2 record attempt (parent KB: `Panisperna/ArcAgi-2`, Scintilla project
`arc-agi-2-english-knowledge-base`). The videos instantiate core-knowledge priors —
objectness, gravity, collision, inside/outside, counting, agency, symmetry, grouping,
causality — *in ARC's own modality*, so a grid world-model can learn them with no domain gap.
It's also a hand-authoring **studio** (a real macOS app) and an **agent-drivable CLI**.

The strategic bet (write it to Scintilla — still pending, see §7): a giant agent-generated
corpus of kid-game/life videos → pretrain a grid-native world-model (next-frame prediction)
→ the priors transfer to few-shot ARC-AGI-2. Honest risk: pretraining gives the
representation/operator vocabulary, **not** the few-shot induction (the underdetermination
wall). It's a falsifiable lever, not a proven solver.

## 1. Files (all in `Panisperna/ArcAgi-2/GRIDVID/`)
- **`engine.js`** — the whole engine, PURE LOGIC, UMD (browser `window.GRIDVID` + Node `require`).
  Shapes, integer physics, all mechanics, the scene-DSL parser, JSON output, augmentation, zoom.
- **`gif.js`** — UMD animated-GIF89a encoder (indexed, ARC palette). Used by browser + CLI.
- **`index.html`** — the **studio editor** (ARC "Pixelcore" theme). Engine+gif+fonts are **inlined**
  so it works by double-click and offline. **⚠ NOT in `"use strict"`** (see §3.1). Edit
  `engine.js`/`gif.js` then run `node build.js` to re-inline.
- **`cli.js`** — agent CLI (commands in §5). `gen.js` is a thin back-compat shim → `cli.js`.
- **`build.js`** — inlines `engine.js`+`gif.js` into `index.html` **and** writes `dist/index.html`
  (the Tauri frontend). Run after any engine/gif edit. (Fonts were base64-inlined once; not re-done by build.js.)
- **`serve.js`** — tiny static server: `node serve.js` → http://localhost:8137 (for preview tools).
- **`gridvid_io.py`** — Python bridge for the ARC pipeline: `load`, `frames`, `next_frame_pairs`,
  `to_arc_task_like`, `save_gif_frames_png`. Palette matches `DSL/arcplot.py`.
- **`tokenizer/shape2d.js`** — exact ordered semantic 2D tokenizer: common shape atoms
  (`SQUARE`, `RECT`, `LINE`, `FRAME`, `PLUS`, `LSHAPE`) plus exact `CELLS` fallback.
  Components are emitted as sparse `ORDER:TLBR` top-left ordered tokens; encoder is non-neural O(H*W).
- **`tokenizer/patch2d.js`** — low-level exact fallback: 2×2 serpentine patches, explicit boundary masks,
  video `SAME` deltas.
- **`src-tauri/`** — Tauri 2 desktop app. `tauri.conf.json` (withGlobalTauri, frontendDist=`../dist`),
  `src/main.rs` (the `export_file` command = native Save dialog + write + reveal in Finder, via
  `tauri-plugin-dialog`), `capabilities/default.json` (`core:default`,`dialog:default`).
- **`dist/index.html`** — Tauri frontend, mirror of `index.html` (written by build.js).
- **`scenes/`** — example `.txt` scenes (one per mechanic). **`out/`** — generated artifacts (gitignored).
- **`package.json`** — scripts: `sync`(build.js) · `app`(tauri dev) · `app:build`(tauri build) · `test`(self-test).
- **`README.md`** — user-facing docs. **`scenes/agent/`, `out/agent/`** — examples a subagent authored.

## 2. Run / build
- **Web:** double-click `index.html` (offline, self-contained). Or `node serve.js` + open localhost:8137.
- **Desktop app:** `npm install` once, then `npm run app:build` → `src-tauri/target/release/bundle/macos/gridvid.app`.
  `cargo`+`rustc` are installed; the app builds in ~60–90s.
- **CLI:** `node cli.js <cmd>`. **Self-test:** `node cli.js self-test` (9 checks — run after every engine change).
- **Verify a UI change:** rebuild the app and screenshot it via computer-use **OR** headless Chrome on the
  `file://` path. ⚠ Some bugs are **WebKit-only** (see §3.1) and invisible in Chrome — when in doubt, test the actual app.

## 3. Hard-won gotchas — DO NOT regress these
### 3.1 No `"use strict"` in the UI script (WebKit bug)
WKWebView's strict mode rejected a construct V8 accepts, which left the **app blank** (engine loaded,
but the UI `<script>` aborted before building the tool rail). Fix: the UI script is wrapped in
`try{ … }catch{ banner }` (which also drops the strict directive) and shows a red error banner instead
of a blank page. **Do not re-add `"use strict"`.** Diagnosis method that worked: inject a visible
`window.onerror` probe + `try/catch`, rebuild, read the message off the app window.
### 3.2 build.js after engine edits
`index.html` and `dist/index.html` contain INLINED copies of engine/gif. After editing `engine.js`/`gif.js`
you MUST `node build.js`, or the app/web run stale code.
### 3.3 `grid W H` is width-then-height
Most "failing" tests this session were W/H swaps. `grid 24 22` = width 24, height 22.

## 4. Mechanics (full grammar: `node cli.js dsl`)

### 2026-06-22 (later) — generator breadth sweep + the CINECA Qwen pipeline (PAN-127/128/131/129/117/122/116/118-partial)
A full sweep to maximize the **pool of problems**, **rule compositionality**, and **inventiveness** — feeding the multinode Qwen-30B-A3B
generator we run on CINECA. All verified (self-test **96**, +18) and eyeballed; library 50 → **59**.
- **G1 boolean figure-algebra (PAN-127):** `combine SEL_a SEL_b op or|xor|and|sub [into R C] [color C]` (top-left-aligned cell boolean,
  sources removed) · `overlay_figs SEL_a SEL_b at R C [overlap C]` (a-only/b-only/shared get distinct colours). Templates figure_xor/and/overlay.
- **G4 analogy + series + odd-one-out (PAN-128):** `odd [by PROP]` SELECTOR (minority by shape|color|size|predicate) · `bind_transform NAME
  from SEL_a to SEL_b` + `apply NAME to SEL` (capture an A→B move+recolour delta, re-apply = analogy completion) · `progress SHAPE … attr
  size|color step K n N` (arithmetic series). Templates odd_one_out_color/shape, analogy_recolor. (iterate/cycle deferred.)
- **G7 matrix/symmetry completion (PAN-131):** `grid_complete h|v|rot180|diagonal` (whole-grid: fill blank cells as the symmetric completion
  of the filled part — Raven). Templates complete_symmetry_h/rot. (distribute3 ≈ existing `solve`; solve-by-shape n/a on a colour-only grid.)
- **G5 paper-folding (PAN-129):** `unfold (h|v at K)+` (reflect every mark across each crease & union — VZ-2; multi-fold → 4-fold). Template
  unfold_paper. (fold/find deferred.)
- **Compositionality:** `repeat rand LO HI idx` — macro repeat count varies per seed (a macro-time rng from the scene's `seed`).
- **`repeat`/`odd`/`where`/`it` prompt-kit wiring:** mid-line selectors and the predicate vocabulary are injected into the model's grammar
  card by `buildPrompt` when a template uses them (else the model couldn't write novel conditional/odd/figure tasks).
- **The CINECA pipeline (PAN-122/116/117/118-partial):**
  - **`cli.js generate-llm`** — the Qwen loop: proposer menu → prompt-kit (with **novelty**, PAN-116) → served model (OpenAI-compatible
    endpoint, e.g. vLLM Qwen-30B-A3B) writes scene-DSL → engine verifies → **self-corrects** on reject (feeds the reason back, retries). `--stub`
    runs the whole pipeline without weights. Core is `llmGenerateOne(prompt, callModel, {retries})` (pluggable model → unit-tested with a mock).
  - **Multinode** (`--num-nodes W --node-rank R` on both generators): disjoint seed slice per node (offset 1e9) + node-prefixed shards → N
    CINECA nodes generate non-overlapping tasks, zero coordination.
  - **`cli.js export-objectives <dir>`** — prodigy-task → training records: `arc_pair` · `next_frame` (frame deltas) · `inverse_dynamics`
    (transition→rule/program) · `object_aux` (objects segmented from the grid via 4-connected components — robust to augmentation).
- **Still open:** PAN-119 (typed combinators `program.js` AST — dispatch is its runtime core) · PAN-120 (auto-compose 2 templates without the
  LLM — note: LLM-driven composition is already live via the proposer + generate-llm) · PAN-130 G6 (assemble/tile_cover/section) · G5 fold/find ·
  G4 iterate/cycle · studio UI triple editor · PAN-118 training/eval infra proper.

### 2026-06-22 — G2+G3: context-sensitive rules (`dispatch`/`classify`) + detector predicates — the IQ keystone (PAN-125/126)
The #1 ARC-AGI-2 difficulty driver per all 4 IQ-research agents (`DESIGN/iq-tests-to-dsl.md` §3): a fixed per-template rule becomes
a **conditional** one. We could already *construct* symmetry/holes/convexity; now we can *test* them and branch on the result.
- **Detector predicates (G3)** — `PREDICATES` registry in `engine.js`, each maps ONE body → a value (bool | number | category),
  exported as `evalPred(name, body)`. Battery: `color · kind · size · size_class(small|mid|big) · orientation(wide|tall|square) ·
  convex (TRUE convex-hull==filled, monotone-chain hull; rejects L/T/U/frame/large-plus) · symmetric · symmetry(h|v|hv|rot|none) ·
  connected (4-CC) · collinear · loop (encloses a bg region) · holes(#) · parity(even|odd)`. All pure geometry/topology over `b.cells`,
  microseconds, zero-LLM. ⚠ The **minimal plus** (`plus 3`) reads convex=true — its diamond hull contains exactly its 5 cells (a true
  property of the discrete hull, not a bug); larger pluses are correctly non-convex.
- **`dispatch SEL by PRED` … `case V [V2..]` / `default` / `end` (G2)** — routes EACH matched body to a branch by its predicate VALUE;
  the branch transforms **`it`** (a new selector = the current object). Predicate values are **snapshotted before any mutation** (so
  branch order can't change a later body's class). Implemented as a runtime block in `runScene` (the per-statement switch was extracted
  into `execStmt`, which the case bodies replay with `world._it` bound). `case yes/no` alias boolean `true/false`. Nested dispatch
  rejected (v1). This is the concrete conditional core of PAN-119's combinator layer.
- **`classify SEL by PRED into A B [at R C] [is V] [size N]`** — Bongard scene→class: emits ONE answer marker (default 2×2), colour
  A if EVERY matched body satisfies PRED (or ==V) else B. The faithful left/right encoding.
- **`where PRED [is V]`** — a new SELECTOR form, so EVERY existing SEL-verb gains predicates for free (`extract where convex`,
  `remove where symmetric is none`, `recolor where loop tint 4`).
- **Library +4 (→ 50):** `dispatch_symmetry` (recolor by symmetry), `dispatch_holes` (keep+paint holed, delete solid), `dispatch_convex`
  (convex→green/concave→red), `classify_convex` (MANUAL Bongard scene→class — manual mode needed because a single reseed can't flip the
  scene class). All verified across 24 seeds + eyeballed (rendered montages: both branches present every example, no visual breakage).
- **Proposer / prompt-kit wiring (so Qwen can WRITE conditional tasks, not just echo the exemplar):** the function-menu proposer
  (`buildFunctionRegistry`) auto-ingests the 4 new templates (category `dispatch`/`classify_convex`), so they enter the random
  hierarchical pool. **But the grammar-card had a gap I had to close:** `where`/`it` are never first-token verbs and the predicate
  vocabulary lived in a `#` comment, so `grammarSlice` skipped them → a sampled dispatch template reached the model with no predicate
  list and no `it`/`where`. Fix in `buildPrompt` (cli.js): when the menu uses `dispatch`/`classify`/`where`, it adds the `where`/`it`
  grammar lines and injects a **PREDICATES vocabulary block** from `E.PREDICATES` (always accurate), with boolean-vs-categorical guidance.
  Reserved-words guardrail extended (`where it by into is`). `grammarSlice` now dedupes.
- Self-test **87** (was 78): 9 new checks (predicates, dispatch routing + default, `where`, classify, error surfaces, **prompt-kit
  exposes the predicate vocabulary + dispatch/it/where**). `build_v3.js` has a new "Context-sensitive rules (G2/G3)" category.
  **Build order next** (`DESIGN/iq-tests-to-dsl.md` §4): G1 boolean figure-algebra (PAN-127) → G4 analogy/series + `odd by PROP` (PAN-128).

objects (`spawn SHAPE at R C` + opts: color/vel/grav/bounce/spin/fill/interior/layer/**magnet**/**link**/
target/random) · gravity · collision · bounce · shape-sorter (`board`+`hole`+`target`+`sort on`) ·
inside/outside (`mark_enclosed`) · **voronoi** field · **noise** uniform|perlin · **shooter** bolt|ray|spread ·
**source**+**liquid** (fluid) · **spin** (rotation) · **layers**+`hidelayer` · **magnet** (group-dock) ·
**counter** (modular-counting odometer) · **snake** (head→food, grows) · **link** (mirror another body) ·
**life** (Conway, emergence) · **wave** (periodicity) · **well** (gravity attractor — bodies march in & settle) ·
**conveyor** (transport belt; the belt is a static body bodies ride) · **maze** (recursive-backtracker gen +
animated BFS `solve` path) · **shooter … bounce 1** (beams ricochet = light reflection) ·
shapes incl. **`bump`/`notch`** (convex fits concave). `run N` · `hold N` · **`snap N`** (render current state N×). Each has an example in the app dropdown
and a `scenes/*.txt`, and is covered by `cli.js self-test`.

### Static transform verbs (Batch 1 — build-time, no physics) — added 2026-06-19
The ARC-task primitives. They mutate `world.bodies` at parse time; capture a before/after pair by
sandwiching them between `hold N` (BEFORE) and `snap N` (AFTER). All take a **selector** `SEL`:
`NAME` (bare body id) · `at R C` (body covering a cell) · `color C` · `shape NAME` (kind) · `largest`/`smallest`/`all`.
- **`copy SEL to R C [rot K] [flip h|v] [tint C] [interior C] [times N DR DC] [id NAME]`** — duplicate first match,
  transformed; `times` tiles N copies stepping `DR DC`. Covers Copy / +rotate / +recolor / +mirror.
- **`recolor SEL tint C [interior C]`** · **`move SEL to R C | by DR DC`** (group-preserving for `to`).
- **`mirror SEL axis h|v [gap G] [tint C]`** — reflected copy adjacent across the axis (symmetry / reconstruction substrate).
- **`remove SEL`** (delete = make the odd-one-out) · **`extract SEL`** (keep ONLY matched = selection/extraction task).
Helpers in engine: `flipCellsH/flipCellsV/transformCells`. Scenes: `scenes/copy.txt`, `select_extract.txt`, `symmetry.txt`.
Self-test: 5 new checks (copy/extract/remove/mirror/move). `copy` also takes `by DR DC` (offset from template).

### Batch 2 — damage / restore for find-the-error & reconstruction — added 2026-06-19
- **`corrupt SEL [tint C]`** — recolour a RANDOM matched body (the error). **`break SEL [cells N]`** — knock out N
  random cells of a random matched body. **`repair`** — restore everything corrupt/break damaged. The damaged
  element is chosen by `world.rng` ⇒ its position/identity varies per seed (no "always-position-3" cheating).
- Pattern: build uniform/whole → `corrupt`/`break` → `hold 1` (IN broken) → `cut` → `repair` → `snap 1` (OUT fixed).
- **RNG warm-up:** `makeRng` now discards its first 6 draws — mulberry32's first output correlates with the seed,
  and `buildTask` uses consecutive seeds (1,2,3,4), so without warm-up every example got the SAME random choice.
- **Task gallery:** `node build_tasks_html.js` → `out/tasks_gallery/index.html` (self-contained: montage GIFs as
  base64 + DSL source side-by-side) + 12 `.task.json` truths. 6 templates in `scenes/tasks/`: extract_red,
  gravity_settle, mirror_complete, copy_paint, find_error, reconstruct. **DSL is authored to be LLM-writable
  (Qwen-30B): English-word verbs, one statement per line, commented — the scenes double as few-shot exemplars.**
### Procedural augmentation declared in the DSL (added 2026-06-19)
Augmentation is two layers, both driven by the DSL so the GENERATOR controls them:
- **Instance variation (content):** inline `random [box]` (position) · `color rand [LO HI]` (colour) · **`rand LO HI` in shape
  size args** (`square rand 3 5`). These vary per seed → every example differs in the incidental features.
  **Mandatory:** vary every feature that is NOT the rule (position, size, colour…), or the model latches onto the constant.
- **Task-level global augmentation:** the scene declares **`vary AXIS…`** (axes ∈ `flip rot zoom color`) — the rule-safe
  transforms. `buildTask` samples ONE random subset (random #directions) per task from a seed0-derived rng and applies it
  **identically to all examples+test** (so the IN→OUT rule stays consistent — per-example transforms would destroy
  orientation-sensitive rules). Only the generator declares safe axes (e.g. gravity: `color zoom`, never flip/rot;
  copy-paint paints absolute blue: no `color`). Recorded in `meta.vary_axes` + `meta.augment_applied`.
  Panels may now differ in size across tasks (rot/zoom) — `taskToMontage` pads, `validate` checks per-video consistency.
  Disable with `buildTask(text,{augment:false})`. Engine API: `sampleTaskTransform(axes,rng)`.
- **Workflow rule (Mario):** every time you add a feature/task, **regenerate the gallery** (`node build_tasks_html.js`).

### 2026-06-19 (later) — overlap fix · freedom · representation · wild · lighter gallery
- **Non-overlapping `random` placement** (engine): a hidden object under another made IN→OUT visually unsolvable
  (caught in extract_red: a red hid under a magenta distractor, reappeared in OUT). `random` now retries (≤80) for a
  clash-free spot. Self-test: "random placement does not overlap".
- **Freedom — OUT need not be a clean f(IN):** the scene is imperative, so anything after `cut` is free. Primitives:
  **`scatter N [color C|rand] [box R0 C0 R1 C1]`** (N random free cells, kind `noise`) · **`paint R C color C`** (one exact
  cell, kind `mark`). Demo: `scenes/tasks/denoise.txt` (free noise in IN, `remove shape noise` in OUT).
- **DSL internal representation in the JSON:** `meta.representation = { program, in_objects, out_objects }` — the parsed
  statements + the objects the simulator knows at IN (snapshot at `cut`) and OUT (`describeBodies`: id/kind/colour/r/c/h/w/cells).
  Pre-augmentation coords. For training a grid→representation head. `buildTask` opt `wild:true` forces ALL `vary` axes.
- **Gallery v2** (`build_tasks_html.js`): per template a **normal + wild** view, the DSL, and the representation summary;
  GIF `cell=8` (lighter). 7 templates incl. denoise.
- **Composition (open question):** the DSL composes SEQUENTIALLY (verbs mutate shared world state) but has NO function
  abstraction / higher-order combinators (no `def`/macros, no seq/parallel/mask/dispatch). True function composition +
  reuse = the `program.js` combinator layer from `../DESIGN/gridworld-foundation-v0.md` §2. NOT built yet — next big step.
### 2026-06-19 (later still) — the IMPORTANT priors from the brief
- **Counting / cardinality:** `tally SEL at R C color C [dir h|v]` → a bar of length = #matched bodies. `scatter` count now
  accepts `rand LO HI`. Task: `count_bar` (count varies per example).
- **Interleaving grids with holes:** `lattice ROWS COLS [cell N] [gap G] [color C] [holes K] [at R C]` (K random holes withheld)
  + `fill [color C]` (materialize the holes). Task: `fill_grid`. (count/extract variants: select `shape tile` / count the holes.)
- **Turtle / program execution:** `turtle at R C dir DIR program OPS|rand K [color C]` draws a colour-coded code strip;
  `drive` executes it (F/L/R) and draws the traced path. Task: `turtle_path` (the IN literally contains the program).
- **Augmentation axis `shift`** (translate, bg-padded) added to `vary` (the generator opts in when translation-safe).
- Gallery now 10 templates. Self-test +5 (tally/lattice/turtle/wild/representation). **Coverage of the brief's priors is
  broad** (see chat coverage table); remaining design work is structural, not prior-coverage.
### 2026-06-20 — composition · inverse grids · comparison · wild showcase
- **Function composition IN THE DSL** (the long-open item): a macro preprocessor `expandMacros` runs before parsing.
  `def NAME p1 p2 .. / body / end` defines a function; `use NAME a1 a2` calls it (nestable = composition); `repeat N idx /
  body / end` iterates; bodies substitute `$p` with arithmetic `$p+K / $p-K / $p*K` (× before ±). Macros compile away →
  `meta.representation.program` shows the flat expanded primitives. Demo+task: `scenes/tasks/composition.txt`.
- **Inverse grids ("the border is coloured"):** `lattice … outline` makes each cell a hollow FRAME (border only). New
  primitive `mesh ROWS COLS [color C]` draws the coloured separator LINES of a grid (cells empty). Task: `framed_grid`.
- **Comparison (> <):** `keep_bigger CA CB at R C [size N]` emits a block in the more-numerous colour. Task: `compare`.
- **Turtle** softened (`program rand 4`) — it's the hardest task; keep programs short.
- **Wild showcase:** `node build_wild_html.js` → `out/tasks_gallery/wild.html` — each of 3 tasks under 12 wild augmentations
  (base + variants) to see the augmenter's diversity. Main gallery now 13 templates. Self-test 60.
### 2026-06-20 (later) — zoom fix · double · graph-paper/irregular grids · Haiku test
- **Zoom augmentation** now goes BOTH ways (in ×2/×3, out ÷2) — it was always zoom-in before, and `<img max-width:100%>`
  visually normalized it (looked broken). `wild.html` now renders grid tiles at natural size so zoom is visible.
- **`double SEL [factor K]`** — scale a body K× in place (2×2 → 4×4). Task: `double_it`.
- **Inverse grids done right:** `mesh ROWS COLS [color C] [irregular]` = graph-paper (coloured LINES, cells = bg — "what was
  black gets coloured"). `lattice … irregular` = non-uniform cells (tight columns / wide rows). Tasks: `graph_paper`,
  `irregular_grid`. (`lattice … outline` = framed cells from before.)
- **Haiku DSL test:** `node build_haiku_html.js` → `out/tasks_gallery/haiku.html`. A Claude-Haiku agent got the grammar + 4
  examples and authored 2 new tasks. **Both parsed and taught** (a small model CAN use the DSL); but `gravity_stack` used
  fixed positions → identical examples (the "vary the non-rule features" failure mode). Verdict auto-computed (parse/teach/
  per-example-variation). Scenes in `scenes/haiku/`. **Idea:** a lint that flags zero per-example variation + auto-randomizes.
- Gallery now 16 templates. Self-test 65. 4 HTMLs: index (all) · wild (augmentation showcase) · haiku (small-model test).
### 2026-06-20 — v1 polish
- **Variation lint:** `validateTask` now returns `examplesVary` / `distinctExamples` and `warnings`; `cli.js task` prints
  ` warn ` for teaching-but-identical tasks. All 16 curated templates pass (distinct 4/4). Self-test guards it.
- **Robustness:** `copy`/`move` throw a clear error on non-numeric `to`/`by` coords (was silent NaN→0).
- **`v1_final.html`** (`build_v1_final.js`): the showcase — 10 hand-picked tasks, each augmented "to measure" (a seed
  chosen so the sampled transform is visible but lossless). **`haiku2.html`** (`build_haiku2.js`): second small-model test —
  with the "vary non-rule features" lesson in the prompt, Haiku randomized everything (2/3 valid+varied); the 3rd failed by
  naming a body `shape` (reserved selector word) + inventing `to by` syntax — an informative footgun.
- README documents the task layer. 5 HTMLs: index · v1_final · wild · haiku · haiku2.
- **Zoom is now BOTH a function and an augmentation** (Mario): `zoom SEL [factor K]` (K≥2 in, K≤-2 out; `double`=+2) is the
  object-level scale FUNCTION; `vary zoom` is the task-level augmentation (both directions). Tasks: `double_it`, `shrink_it`.
- **`vary` is ALL-TASK** (one sampled transform applied identically to every example+test → preserves the rule); per-example
  ("intra") diversity comes from instance variation (`random`/`color rand`/`rand`). `vary` now normalizes synonyms
  (`rotation`→rot, `scale`→zoom, `colour`/`recolor`→color, `mirror`→flip, `translate`→shift).
### 2026-06-20 — v3.2: TRUE-SIZE montage (crop now visible) · path candies
- **Montage fix (Mario: "cropped output is FAKE"):** the old `taskToMontage` padded every panel to a common size, so a cropped
  OUT (2×2) was re-inflated and the crop was invisible — the "cropped output" label looked fake. **Rewritten:** each panel is drawn
  at its TRUE size inside a 1-cell frame; IN/OUT of different sizes (crop, grid-rand, zoom) are now visibly different. Self-test montage
  check relaxed. This affects ALL galleries — regenerate them after engine changes.
- **Path variability / candies:** `path … candy C|rand [LO HI] [every K] [hidden]` — candies sit along the route ahead of the walker
  and get EATEN as it passes (snake-like); `hidden` shows only the candies (invisible route). Templates `path_candy`, `path_hidden`.
- Library now **46 templates**, all coherent. `sel` is a forgiving alias for `all`.

### 2026-06-20 — v3.1: variable grids · crop · ordering · curated Haiku
- **`TODO.md`** created (mass sampler · online-IQ-tests→DSL · Qwen novelty prompt · objectives export · studio UI). Maintain it.
- **Variable grid size:** `grid rand WMIN WMAX HMIN HMAX` → the whole task size varies per seed (`withSeedText` now puts seed at
  the TOP so grid-rand sees it). Applied to extract_red/pile_up/count_bar/mirror_complete/reconstruct/odd_shape/fill_grid + new ones.
- **`crop [pad P]`** (whole-grid op) → resize the OUT to the content's bbox — e.g. extraction output sized to the object (`extract_crop`).
- **`arrange SEL by size|color [at R C][gap G][dir h|v][desc]`** → ordered row → ordered-counting templates `order_by_size`, `rank_count`.
- **More path-following:** `path_zigzag`, `path_two_walkers` (+ `path random N`). Library now **44 templates** (all coherent).
- **`sel`** is a forgiving selector alias for `all` (LLMs love writing `sel`).
- **Haiku v3 (`build_haiku_v3.js` → `haiku_v3.html`):** a CURATED "add your own twist" prompt → Haiku got genuinely creative
  (gravity→transpose, explode→flip, shatter→arrange, spill→crop…). Engine guard kept **9/10**. `scenes/haiku_v3/`.

### 2026-06-20 — v3: physics pack + 39-template LIBRARY + Haiku spice
- **New physics primitives:** `explode SEL [speed S]` (radial fragments, bounce) · `shatter SEL` (fragments FALL, auto-gravity) ·
  `burst at R C | random [count N|rand LO HI] [color C]` (radial firework) · `path at R C to R C.. | random N [color C] [walk C]`
  (a drawn route + an object that follows it each step — worm/square). Fragments are 1-cell `frag` bodies moved by the body loop;
  `world.paths` stepped + rendered. Bouncing-ball task uses `spawn .. vel DR DC bounce 1`. Self-test +3.
- **THE TEMPLATE LIBRARY** `scenes/library/` — **39 verified templates**, every one teaching+varied+coherent, covering all priors
  (selection · counting · symmetry · reconstruction · copy/transform · grids/holes · whole-grid algebra · physics/sim · composition/programs).
  This is Lever 2: sample template × seed × params × aug × n_examples → millions of coherent tasks, no per-task LLM. `build_v3.js`
  → **`v3.html`** (every template grouped + NEW-physics badges + Haiku spice) and saves every `.task.json` to `out/library_json/`.
- **Haiku spice → engine filter:** Haiku (Qwen-proxy) "mixed + spiced"; the coherence guard kept 3/6 at zero LLM cost — the loop works.
- **Augmentation zoom is now zoom-IN only** (zoom-out was destructive, collapsing sparse tasks → false-positive incoherence). The
  `zoom SEL factor -2` FUNCTION still does deliberate downscale. Self-test's zoom check updated.

### 2026-06-20 — coherence is the ENGINE's job (millions-scale, cheap, no LLM critic)
- **Constraint (Mario):** the dataset is MILLIONS of tasks generated by a small model (Qwen-30B-A3B). A per-task LLM critic
  (Sonnet) is unaffordable. Coherence must be **free** (engine) or **by-construction** (templates) — not a big-LLM pass.
- **Cheap structural coherence guards in `validateTask`** (zero-LLM) → `meta.teaching.coherent` + `incoherent[]`. Currently catches:
  (1) **selection (extract/remove) BEFORE the IN snapshot** (`world.preCutSelect`) — the rule is invisible in IN (this is the exact
  bug Mario caught in extract_biggest_grid); (2) **near-empty IN** (<2 cells); (3) **trivial change** (OUT vs IN differ <2 cells).
  `cli.js task` now REJECTS incoherent tasks (FAIL). Self-test guards it. ADD MORE guards here as new nonsense patterns appear —
  this is the free filter that lets Qwen generate freely and the engine keep only the good ones.
- **The architecture for scale:** Qwen generates scene-DSL → `cli.js task` builds + checks (parse · teaching · variation ·
  **coherence**), all in microseconds, no LLM → keep only passing tasks. The high-value bulk should come from a **verified TEMPLATE
  LIBRARY** (the curated scenes are templates; `def`/`use` macros parameterize them) sampled procedurally (seed × params × aug ×
  n_examples) — coherent by construction, verified ONCE per template. Qwen's role: parameterize/compose templates, or propose NEW
  candidate templates (rare; verified on entry). NOT free-author every task.

### 2026-06-20 — showcase v2 (Haiku hard tasks) + two fixes it surfaced
- **`showcase_v2.html`** (`build_showcase_v2.js`, scenes in `scenes/showcase2/`): Haiku authored 14 HARD tasks (difficulty 0.55–0.9),
  each **wild-augmented**. **LESSON (Mario was right):** the auto-check (parses · OUT≠IN · examples-differ) proves STRUCTURE, not
  MEANING — 3 of 14 were structurally-valid NONSENSE (gravity-then-sort-rows-by-bg; extract-with-one-object; recolor-all-erases-info).
  **Hand-curated down to 11 coherent ones.** Each saved as a `.task.json` in `out/showcase2_json/` (the dataset TRUTH — int-grid
  examples/in/out + meta). Takeaway: small-model authoring needs a human/coherence pass; "valid" ≠ "good".
- Two fixes Haiku's attempts surfaced: (1) **`scatter color rand LO HI`** now respects the range (was full 1–9, unlike `spawn`) —
  a real DSL inconsistency; (2) **wild augmentation uses zoom-IN only** (zoom-out is destructive and collapsed sparse tasks to IN==OUT).
  Self-test's zoom-both-ways check now uses normal (non-wild) sampling.

### 2026-06-20 — fluid fix · bigger grids · framing
- **Fluid (Mario):** tried making water split symmetrically off a floating obstacle (`findDrop` toward nearest drop) — but
  splitting halves the per-side flow and the thin streams FRAGMENT into drops ("broken in little pieces"). **Reverted** to the
  simple level-out: supported water overflows one way as a CONTINUOUS stream (slightly one-sided on a symmetric obstacle,
  but clean — Mario prefers continuous over fragmented). spill_pool uses a bigger grid + rate 2. Open: a simple cellular sim
  can't make TWO continuous thin streams from one stream's flow without fragmenting or doubling mass — left as-is for now.
- **Bigger grids:** gridops → 9–11; spill_pool → 18×20. (Keep adding larger grids in new tasks.)
- **FRAMING (Mario, important):** we are NOT trying to exactly replicate ARC-AGI-2 tasks — we TEACH THE PRIORS ARC-AGI-2
  uses under the hood. The whole-grid verbs are priors (transpose/rotate/remap/solve), not a goal of copying specific tasks.
  arc_solved.html proves the priors are expressible; the dataset's job is to teach them, not to reproduce the eval set.

### 2026-06-20 — whole-grid layer: the ARC-AGI-2 gap, CLOSED
- Added an orthogonal **whole-grid layer** (verbs render current state → transform → push as the OUT frame; NO `snap` after):
  **`grid_rotate K`** (K×90°) · **`grid_flip h|v|diagonal`** (diagonal = transpose) · **`grid_map FROM TO …`** (palette remap) ·
  **`sort_rows [by C] [desc]`** · **`solve`** (Latin-square completion: constraint propagation + backtracking, `solveLatin`).
  Helpers `flipV`/`transposeGrid`/`sortRowsByCount`/`solveLatin` near `rot90`.
- **VERIFIED: all 5 real ARC-AGI-2 tasks** that Sonnet judged inexpressible are now ONE verb each, reproducing EVERY train output:
  74dd1130=`grid_flip diagonal`, 0d3d703e=`grid_map …`, 3c9b0459=`grid_rotate 2`, ed36ccf7=`grid_rotate 3`, 4cd1b7b2=`solve`.
  Self-test has explicit checks for each. Showcase: `build_arc_solved.js` → **`arc_solved.html`** (real task | verb | our prediction | generated family).
- **Generative grid-op tasks** `scenes/gridops/`: transpose_grid, rotate_grid, recolor_map, flip_grid (random `noise` input + the rule).
- The object-physics core is untouched; whole-grid algebra is a separate layer. `sort_rows` kept as a general primitive though none of the 5 needed it.

### 2026-06-20 — ARC reality check + collection 2
- **collection 2** (`scenes/collection2/`, `build_collection2.js` → `collection2.html`): 7 new tasks — fill_inside (inside/outside),
  odd_shape, pile_up (gravity), two_bars, recolor_smallest, copy_row, and **manual_symmetry** (MANUAL mode, hand-authored diverse examples).
- **ARC-AGI-2 translation test** (`build_arc_vs_dsl.js` → `arc_vs_dsl.html`): a Sonnet agent tried to translate 5 REAL ARC-AGI-2
  tasks (`DATASET/ARC-AGI-2/data/training/`) into the DSL. **All 5 inexpressible** — and precisely why: they are WHOLE-GRID
  algebraic transforms (palette remap 0d3d703e, transpose 74dd1130, flip/rotate ed36ccf7, row-sort 3c9b0459) and a logical
  completion (Latin square 4cd1b7b2). **Our DSL is object/physics/counting (ARC-v1 priors); ARC-AGI-2 leans on whole-grid
  algebra + relational logic — a different paradigm.** ACTIONABLE GAP: add a whole-grid layer — `grid_rotate K` · `grid_flip h|v|diagonal`
  (transpose) · `grid_map C→C` (palette remap) [easy, covers ~3/5] · `sort_rows by count(C)` · a tiny `solve`. Object-physics core stays; this is an orthogonal new layer. **Strong candidate for the next workstream.**

### 2026-06-20 (later) — new fluid · n_examples · manual diversity · doc
- **New simple fluid `spill at R C color C [rate K]`** (separate from old `liquid`): a continuous, laminar, mass-conserving
  cellular pour (fall → slide off lips → level out) that FILLS a container and OVERFLOWS the rim. `spillStep` + `world.water`.
  Demo `scenes/spill.txt`, task `scenes/tasks/spill_pool.txt` (physics prediction, OUT=video). Self-test +3.
- **`examples N | rand LO HI`** directive → `n_examples` (number of demo pairs), variable per task like real ARC.
- **MANUAL mode** (generator-authored diversity): a task text with `=== example ===` / `=== test ===` blocks, each a full
  self-contained scene sharing the rule. `buildTask` auto-dispatches to `buildManualTask`; `meta.authored="manual"`.
  Use for hard/interesting tasks where reseeding one template isn't diverse enough. (`finishTask` factored out, shared.)
- **DOC sharpened (Mario):** demos must be GENUINELY DIVERSE, not near-copies with a tiny change — push intra-example
  variation HIGH (layout/count/shape/size/colour all vary). README + memory updated. `vary` = all-task aug, NOT per-example.
- **`difficulty D`** directive (0=trivial … 1=ARC-AGI-2) → `meta.difficulty`. **`haiku_hard.html`** (`build_haiku_hard.js`):
  Haiku authored one task per difficulty rung. Portrait of a small model's limits — fine in the easy middle, fumbles the
  TRIVIAL case into a no-op, can't encode the 0.75 context-sensitive conditional (description > DSL it writes), yet its 1.00
  (composition + break/repair) runs. Conclusion: the DSL is expressive enough; the author is the bottleneck. Scenes in `scenes/haiku_hard/`.
- **Still TODO (structural):** `program.js` typed combinators (mask/dispatch/overlay) · studio UI → triples ·
  finer aug (skew/trapezoid, gray-as-special) · auto-rename reserved-word ids / auto-randomize fixed-position tasks.

### Fluid — the sensitive one (Mario is very particular)
Current model (`liquidStep`): **source-budgeted cellular water simulation**:
1. every visible water cell is real liquid state; there is no decorative stream overlay and no destination solver.
2. each active source tick adds exactly `source amount` cells, or `liquid flow` cells by default. Existing water
   moves every frame but does not create mass.
3. liquid moves one grid step at a time: down, diagonally off lips, or sideways along supported surfaces. A small
   row-relaxation pass smooths supported puddles into contiguous liquid surfaces while preserving mass.
4. when the source column is full, pressure injects into the nearest supported empty surface connected through
   existing same-colored liquid, without crossing solids. This lets rooms keep filling while preventing below-shelf
   teleporting.

Guardrails:
- the pour stays a **solid column** (no dashes), cells are **strictly conserved** while the source is unblocked,
  and basin rows are regression-tested against dotted/dashed liquid, below-shelf teleporting, and outside-container leaks.
- `source ... amount K` sets cells per fill tick for that source. `liquid flow F` is the default amount.
  `viscosity` only slows source ticks when explicitly set; default is `0`.
- After touching fluid, run `node cli.js self-test`. It now includes explicit fluid invariants:
  exact one-cell/frame and n-cells/frame fill budgets, solid source column, no dashed rows in a basin,
  no below-shelf teleporting, no early outside-recipient water, landing on non-recipient objects, and spilling
  after a container overfills.

### Magnets (also reworked per Mario)
`magnet K`: bodies with the **same K** march toward the nearest same-K magnet and **collide/dock**; different
K ignore each other. (This is also the "collide by color/group" / "color-bump" idea — group = K.) Magnet
bodies skip gravity. No force/charge math (that version jittered — don't bring it back).

## 5. CLI (agent-facing)
```
node cli.js dsl                                  # full scene grammar (self-doc for an agent)
node cli.js new <name> [basic|sorter|shooter|liquid|voronoi]
node cli.js gen <scene…> -o out/ [--gif] [--seeds N] [--augment K] [--wild] [--rate] [--zoom ±K] [--zoom-aug] [--zoom-in-only] [--materialize]
node cli.js augment <video.json…> -o out/ [--n N] [--rate] [--zoom-aug] [--zoom-in-only] [--materialize] [--gif]
node cli.js render <video.json…> -o out/ [--gif] [--cell N] [--zoom ±K]
node cli.js gallery <dir>                        # render all to GIF + open a browser gallery ("show a friend")
node cli.js validate <video.json…>               # check format
node cli.js task <scene…> -o out/ [--examples K] [--gif]   # build a (EXAMPLES,IN,OUT) task family
node cli.js self-test
node tokenizer/shape2d.js                          # semantic shape-token round-trip checks
node tokenizer/patch2d.js                          # low-level patch-token round-trip checks
```

### prodigy-task — the dataset unit is a TRIPLE (added 2026-06-19)
A single `2dgridvid` is NOT a dataset sample. The sample is **(EXAMPLES, IN, OUT)**, and the **JSON is the truth**
(a montage GIF is only for the eye). Format:
```json
{ "format":"prodigy-task", "version":1, "width":W, "height":H, "palette":"arc10", "fps":F,
  "examples":[ {"in":[..frames..], "out":[..frames..]}, ... ],   // K demonstration pairs = the teaching
  "in":  [..frames..],                                            // held-out test input  (video)
  "out": [..frames..],                                            // held-out test output (video, the answer)
  "meta":{ "rule":"…", "concepts":[…], "dsl":"<scene>", "seeds":{examples:[…],test:N}, "teaching":{ok,changedPairs,totalPairs,reasons} } }
```
- Every component is a **list of frames** → static task = 1 frame each; dynamic task = OUT is the continuation video.
- **Family generation:** ONE scene template = ONE instance; `cli.js task SCENE --examples K` re-runs seeds 1..K+1
  (random placement varies the instance, the rule stays fixed). The held-out seed becomes IN/OUT.
- **Split:** the scene marks IN|OUT with `cut` (frames before = IN, after = OUT); omit ⇒ split in half.
  Author with `rule TEXT` + `concept TAG…` so the teaching is labelled.
- **Teaching guarantee:** `validateTask` rejects any task where some pair has OUT==IN (no teaching) or EXAMPLES is empty.
  `cli.js task` prints `teaching=yes/NO` per task and `validate` fails non-teaching tasks. **Do not ship `teaching:NO`.**
- Engine API: `buildTask(text,{examples,exSeeds,testSeed,fps})`, `validateTask(task)`, `taskToMontage(task)`, `runPair`.
- Examples: `scenes/tasks/extract_red.txt` (static, selection) · `scenes/tasks/gravity_settle.txt` (dynamic, OUT=video).
- **Still TODO:** the studio UI (`index.html`) still authors a single video — converting the editor to author/preview
  triples (3-pane EXAMPLES | IN | OUT + Export-as-task) is the next front-end step (not yet done).
- `--augment K`: K pixel variants (D4 + color-perm; `--rate` also varies fps/stride; `--zoom-aug`
  adds random external zoom-in/zoom-out variants).
- `--wild`: K **scene** variants — re-simulate with perturbed seed + fluid (viscosity/turbulence/flow) +
  random D4 + color + framerate + external zoom-in/zoom-out. Color-perm keeps shape-sorter piece↔hole consistent.
- `--zoom K`: K≥2 duplicates every pixel (external zoom-in, more detail); K≤-2 downsamples (zoom-out).
- `--zoom-in-only`: keeps random zoom augmentation from downsampling exact small sockets.
- `--materialize`: block-by-block final-object reveal instead of movement to the target. Use for shape-hole
  construction variants; `--materialize-cells K` reveals K cells per frame.

## 6. 2dgridvid format
`{ format:"2dgridvid", version:2, width, height, palette:"arc10", fps, meta, frames: int[][][] }` —
`frames` is the video; cells are ints 0–9. That's the whole contract.

## 7. Open items / next steps
1. **Labyrinth generation + auto-solver (#3)** — REQUESTED, not done. Plan: maze via recursive-backtracker
   (walls field) + an animated BFS/DFS solver coloring the explored frontier then the solution path.
2. **Record the pretraining-corpus strategy as a Scintilla node** (blue/theory) in
   `arc-agi-2-english-knowledge-base`: prior taxonomy, corpus→world-model→ARC pipeline, falsifiable pilot
   (probe whether a small grid world-model's hidden states encode object/count/containment + improve
   few-shot ARC adaptation). Written in chat 2026-06-18, not yet in the KB.
3. **Composable generation layer** — add `program.js`: typed AST/combinators → scene text + provenance JSON.
   See `../DESIGN/gridworld-foundation-v0.md`.
4. **Patch-tokenizer integration** — `tokenizer/patch2d.js` exists; next is corpus export to patch-token
   records and learned 3×3/4×4 codebooks.
5. **Editor rail tools** for counter / snake / magnet placement (currently script + examples only; magnet is
   a per-object field). 
6. **Missing primitives a subagent flagged** (see `out/agent/` report): `flip h|v` (engine has `flipH`),
   `source … for N` / `source off` (finite pours), `stamp`/`draw` static cells (explicit counting/projection).
   `ghost 0|1` on spawn is now implemented for occlusion/object-permanence scenes. `group-by-color` is partly
   covered by magnet groups.

## 8. Working style with Mario (from this session)
- He iterates fast and is blunt; he cares a LOT about the **fluid feeling right** (solid, conserved, no
  dash/flicker) and **simple, predictable mechanics**. Verify visually in the **real app**, not just Node.
- Scintilla/KB content in **English**; chat with Mario in **Italian** (he switched to English here only to
  "boost reasoning" for this build). Persist significant steps; don't let work evaporate.
- Engine self-test is the safety net — keep it green and extend it when adding mechanics.
