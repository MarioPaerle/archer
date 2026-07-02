# gridvid / prodigy — TODO

Running list. Newest priorities on top. Done items move to the bottom.

> 📋 **Tracked on Linear** (team `Panisperna`/PAN) — see `../LINEAR.md`. This file is the fast scratch list at the code;
> the durable, owned, status-tracked view is Linear. **Mirror substantial items into a PAN issue** (and keep both in sync).
> Generation backlog currently: PAN-114/123 (sampler+throughput) · PAN-119/120 (combinators+auto-compose) ·
> PAN-121/122 (prompt-kit + retry loop) · PAN-115/116 (IQ priors + Qwen novelty) · PAN-124 (semantic guard) · PAN-117 (objectives).

## 🔥 Open — Mario 2026-07-02 (the god-builder direction: ONE last push, make it INCREDIBLE)
- [ ] **REPO CLEANUP — kill the redundancies** (Mario, explicit): GRIDVID has accreted ~30 one-off `build_*_showcase.js`,
      parallel `gen2..gen5`/`gen_*` generators, `solver.js`+`solver2.js`, `skins.js`+`skins2.js`, stacked HANDOVERs, etc.
      Consolidate into FEW parameterized tools (one showcase builder, one generator entry point), delete dead experiments,
      fold what's still useful into cli.js/program.js/builder.js. Self-tests must stay green at every step; show the
      surviving surface in one HTML index. Do it as its own session with a survey-first pass (what each file does, who
      imports it) — no blind deletion.
- [ ] **GOD BUILDER: continue on this path, ONE last time — must become incredible** (Mario): push the hierarchical
      families + admits-graph + difficulty budget to its full form. Candidates: richer/deeper family tree (sub-families,
      more modifier semantics: keys vs selectors vs post-conditions), per-family CURRICULUM sampling for the corpus
      assembler, difficulty calibration against real solver pass-rates, feed `admits` into program.js composed-chain
      sampling (same graph for the program-first corpus), per-slot typed arguments (unify the PAN-176 slot system into
      builder.js), family coverage metrics on generated corpora.
- [ ] **GRAPH INSPECTABLE BY MARIO — interactive HTML explorer** (Mario, explicit): the family/admits graph must be
      VISUALIZABLE and inspectable, not just code. An HTML view (extend `build_builder_showcase.js` or a dedicated
      `build_graph_explorer.js`): nodes = families (and their functions), edges = admits, click a family → its functions
      with paired difficulties + bands + blurbs, click an edge → why it composes, sample-a-menu button per difficulty
      target. Regenerate on every taxonomy change (HTML rule).

## 🔜 Open — Mario backlog 2026-06-24 (CINECA down → model items blocked)
- [ ] **PAN-176 Super-suggester + full dataset schema** — make the DSL effectively "change itself" per task by exposing
      only a tiny typed compatible slice each time: function schemas + typed argument slots (`selector`, `predicate`,
      `subobject`, `relation`, `transform`, `layout`, `output_policy`) + compatibility/difficulty/augmentation DB.
      Dataset target fields: `unique_code`, `difficulty`, `dsl_suggestions`, `rule_description`, `generator_model_thinking`,
      `dsl_representation`, `object_level_json`, `grid_json`; future planned field: Python function of compiled DSL.
      Also plan visual step-by-step DSL unroll / 2D CoT for reasoning training and possible GRPO.
- [ ] **PAN-124/PAN-166 variation contracts for base-library examples** — v6 now samples more distinct seeds and records
      `difficulty`/`depth`/`language_description`/`generator_code`, but an adversarial audit still finds deterministic
      library entries whose OUT is identical across examples (`path_follow`, `path_two_walkers`, some grid-completion
      basics). Do this properly, not with fake noise: add template-level variable/non-variable axes, route variants that
      remain single unambiguous paths, and cheap near-duplicate/too-large-example metrics before promotion.
- [ ] **PAN-164 Seeded generation (NVARC/BARC shape)** — `seeded.js` + `generate-seeded` SHIPPED (LLM writes a DSL generator from a REAL
      ARC task + its human description in `DATASET/descriptions/`). **Validate on Qwen when CINECA returns.** Next: skill-mix, consistency filter, grow descriptions 245→1000.
- [ ] **PAN-165 Swap model → Qwen3.6-35B-A3B** (CINECA down): confirm HF repo id, download to scratch/large, point debug_qwen.sbatch MODEL, re-run generate-seeded.
- [ ] **PAN-167 IQ-puzzle descriptions → seed** — seed pack expanded **6 → 17** in `DATASET/descriptions/iq/` and loader-verified.
      Next: feed via `generate-seeded` on Qwen when CINECA is back; remember `DATASET/` is gitignored and must be synced to CINECA.
- [ ] **PAN-166 Easier DSL for agents** (toward Python-like / sandboxed Python = the 'later' half of the hybrid decision).
- [ ] **Procedural-NFT generator v2** — promote the new showcase composer into a reusable generator/CLI, with a much larger
      figure/skin/layout/program bank, per-recipe yield metrics, depth-balanced sampling, and adversarial checks that the rule signal
      is causally necessary (no decorative markers, no position-only shortcuts, no copied held-out answer).
- [ ] **Engine-derived 2D-CoT trace compiler** — the new operation-template gallery covers the visual grammar, but the real
      target is command snapshots from `engine.js`: selector evidence, pre/post objects, dependency DAG, white working-memory
      overlays, and one trace template per DSL operation family without hand-authored showcase snippets.

## 🔜 Open — larger tracked efforts (each is its own multi-session piece, NOT quick wins; on Linear)
- [ ] **Engine `shape NAME pattern P|P|P` custom-object def** (`def A … / spawn A`, Mario) — define an arbitrary object/SKIN
      with an internal colour pattern (multi-cell, multi-colour) and spawn it as one unit. Plus a **skin LIBRARY** (big template set)
      and **model-drawn skins** (a new object variable per task instance). Lets Qwen invent objects → far more variety/humanity.
- [ ] **mode-3 PROPOSE-combinations** — Qwen proposes prior-pairs; the generator builds them correct (needs auto-compose, PAN-120).
- [ ] **Hyper-strong DSL suggestion** — keep enriching the free-author prompt (now visible via `meta.prompt` in galleries) so Qwen
      can "generate with its own mind"; iterate using the shown suggestion to attribute failures to the model, not the prompt.
- [ ] **Online IQ / matrix-reasoning tests → DSL** (PAN-115) — re-encode the ABSTRACT transformation types behind
      Raven's matrices / analogies / series as new templates (never copy copyrighted items). Pulls the corpus more
      in-distribution. (G4/G7 already cover analogy/series/matrix-completion in the engine; this is the curation pass.)
- [ ] **PAN-119/120** — typed combinators `program.js` AST (dispatch is its runtime core) + auto-compose 2 templates without the LLM.
- [ ] **G6** (PAN-130): `assemble`/`tile_cover`/`section` · **G5 fold/find** · **G4 iterate/cycle** (engine verbs).
- [ ] **Studio UI** (`index.html`) → 3-pane triple editor (EXAMPLES | IN | OUT) + Export-as-task (frontend).
- [ ] More coherence guards as new nonsense patterns appear (ongoing free filter; add on sight).

## 🧪 Engine / DSL — done
- [x] `repeat rand LO HI` (variable counts in macros) — 2026-06-22 (macro-time rng from the scene seed).
- [x] Objectives/tokenizer export — 2026-06-22 (`cli.js export-objectives`: arc_pair/next_frame/inverse_dynamics/object_aux).

## 🎨 Content — done
- [x] Template library past target: **61 scene templates** (was 39) + **36 program-first families** in `gen_hard.js` across all priors.
- [x] Qwen novelty prompt (PAN-116) — `generate-llm` rewards mixing + a twist while the engine guard keeps coherence.
- [x] More physics: **magnets** (`magnet_dock`), maze pathfinding (`maze_solve`), pointer beams (`beam_video`) added to the
      foundational tier. (Still possible later: pile-toppling/collapse, chain reactions, fluid + floating objects.)

## ✅ Done
- [x] (2026-06-25) **Showcase v7.5 call-ready synthesis page (Codex).** Added `build_showcase_v7_5.js`, which regenerates
      the dependency artifacts and writes `out/showcase_v7_5.html` + `.json`. The page has 6 clear sections: expanded
      shape/skin vocabulary atlas, 20 balanced procedural-NFT samples, all 13 white 2D-CoT operation template traces,
      12 corrected auto-depth samples, 18 materialized v7 puzzle highlights, and the top 24 adversarial audit warnings.
      It intentionally separates validated visual puzzles from red plan/suggestion records. Current run: 80 procedural
      cards balanced 16/recipe with 0 generation errors, 13 CoT trace families covering 31 DSL verbs, 100 auto-depth
      cards with 0 bad, v7 with 8 intentional red unmaterialized-suggestion audits, and 234 audit rows with 110 warnings.
      `build_procedural_nft_showcase.js` now exports `main()` so v7.5 is self-contained. Verified atlas/trace render and `npm test` green.
- [x] (2026-06-25) **Shape/skin expansion + compositional-depth audit + white 2D-CoT operation gallery (Codex + adversarial subagents).**
      Added 11 ARC-legible shapes to the engine/browser/shared bank (`Ushape`, `Cshape`, `Hshape`, `Zshape`, `stair`, `arrow`,
      `key`, `fork`, `bridge`, plus shared `frame`/`ring`) and expanded skins with true `rim`, inner frames, targets,
      quadrants, sash/barcode/teeth/islands, directional ports, and endpoints. Kept old `border` for compatibility but no
      longer treats it as the only rim-like skin. The procedural-NFT composer now samples from the shared expanded bank and
      relation-gate tasks draw a visible anchor zone, so the relation is not hidden arithmetic. New `out/procedural_nft_showcase.html`
      run remains balanced: 80 cards, 16 per recipe, 0 generation errors, stricter audit drops 6 weak attempts.
      Fixed depth metadata theater in `build_auto_depth_showcase.js`: public `meta.depth` is now the requested tier, while
      hand-authored family complexity is preserved as `generator_steps`; added `depth_proof` caveats and a within-card
      duplicate-pair gate. New `build_depth_composition_audit.js` writes `out/depth_composition_audit.html/.json` and audits
      234 showcase cards for duplicate pairs, global output reuse, high output-mask IoU, tiny effects, mostly-copy cases,
      too-large grids, and non-visual plan records (current run: 110 warnings, intentionally adversarial). Fixed v7 integrity:
      unmaterialized DSL suggestion records now stay red as `not-validated-scene` instead of being rewritten green.
      Added `build_cot_operation_showcase.js`, producing `out/cot_operation_showcase.html/.json`: 13 white-trace operation
      families covering 31 DSL verbs (selection/remove/extract, move/copy, geometry transforms, recolor/dispatch/classify,
      arrange, boolean combine/overlay, counting, fill/crop, bind/apply analogy, progress, turtle/drive, physics causality,
      whole-grid completion). Verified new shape constructors, rebuilt procedural/auto/v7/audit/CoT pages, and `npm test` green.
- [x] (2026-06-25) **Compass program bugfix + procedural-NFT diversity showcase (Codex).** Repaired
      `compass_move_program`: direction markers are now embedded inside each object, move with the object, start positions are
      random/collision-checked, and there are no orphan instruction dots or left-to-right ordering shortcuts. Verified 300 seeds,
      rebuilt `out/auto_depth_showcase.html` (100 cards / 0 bad) and `out/showcase_v7.html` (54 cards / 0 failed audits).
      Added `build_procedural_nft_showcase.js`, a first trait-composition generator closer to procedural NFT generation:
      random masks, seven skins, embedded symbols, relation gates, macro rewrites, object movement programs, and recursive growth.
      It writes `out/procedural_nft_showcase.html`, `.json`, and `.jsonl` with 80 balanced cards (16 per recipe), deterministic
      audits, and `drops_by_recipe`; fixed the macro-rewrite allocation bug that previously hid 198 generation failures behind retries.
      Final run: 80 cards, 0 generation errors, 2 audit drops. `npm test` green.
- [x] (2026-06-25) **Showcase v7 rule-encoding + ARC-reference package (Codex + adversarial subagents).** Added
      `build_showcase_v7.js` as a comprehensive level check with 8 explicit sections / 54 cards: real ARC-AGI-2 training references,
      a new rule-encoding mini-program package, 4 Codex/subagent-designed materialized puzzles, a 16-card
      non-cherry-picked procedural `gen_hard` batch, 10 new program-first templates, solver-process / dynamic-bias traces,
      5 solver-trace prototype GIFs, and DSL prompt/suggestion records. New v7 artifacts:
      `out/showcase_v7.html` + `.json`, with generated GIFs for encoded color programs, encoded tiling programs,
      newly designed LLM-style puzzles, procedural samples, and visible trace GIFs where selection/erase/transform/place are animated.
      Trace selection now uses a trace-only white palette overlay rather than yellow. Added the first
      rule-encoding tasks where the grid itself contains a legend/program to execute, plus hard gates for copied test
      answers, weak output variety, missing grids, metadata lies, trace presence, and training-only ARC reference use.
      Follow-up patch promoted the traffic-light prior into templates (`traffic_light_lanes`, `traffic_turn_signal`,
      `pedestrian_crosswalk`, `conveyor_color_gate`), added collision/stacking gravity, symbol/motion program templates,
      and three more fractal/nature recursion templates. It also fixed `skin_core_dispatch` by forbidding invisible
      core markers and invisible red/blue transforms, and hardened `gravity_drop` lane spacing.
      Follow-up auto-depth run added `build_auto_depth_showcase.js` and generated
      `out/auto_depth_showcase.html`, `out/auto_depth_showcase.json`, and `out/auto_depth_tasks.jsonl`:
      exactly 100 automatic tasks split 50 depth-1 / 30 depth-2 / 20 depth-3. The sampler is round-robin over
      depth buckets, rejects duplicate/trivial/copy/oversize tasks, and the resulting run spans 28 depth-1 families,
      all 7 depth-2 families, and all 8 depth-3 families. `gravity_stack_collision` now uses an actual settle loop:
      every falling object drops until any occupied cell below it collides with floor or any already-settled object,
      so wide objects and stacks interact with all objects beneath their footprint.
      The materialized "LLM/Subagent-Designed" section is newly designed by Codex/subagents and then procedurally
      materialized for correctness; the separate "DSL Suggestion Records" section is deliberately prompt/suggestion
      substrate and not a live model output. Verified `node build_showcase_v7.js`, `node build_arc_agi2_reference_audit.js`,
      `node build_super_suggester_visual_showcase.js`, `node super_suggester.js --self-test`, and `npm test` inside
      `GRIDVID/`. Honest caveat: this is still not the final DSL compiler/database that dynamically rewrites itself;
      it is the first visual/materialized package for that direction.
- [x] (2026-06-25) **PAN-176 first super-suggester prototype (Codex + critic/worker agents).** Added
      `super_suggester.js`, `build_super_suggester_showcase.js`, and CLI command `super-suggest`. The prototype emits
      dataset-shaped typed suggestion records: `unique_code`, `difficulty`, `dsl_suggestions`, `rule_description`,
      `generator_model_thinking`, `dsl_representation`, `object_level_json_representation`, `json_grid_representation`,
      and a planned-null `python_compiled_dsl_function`. It includes typed slots (`selector`, `predicate`,
      `subobject`, `relation`, `transform`, `layout`, `output_policy`), compatibility / incompatibility edges,
      task-vs-example augmentation contracts, skin/layout hints, pseudo-DSL plans, and adversarial checks. Generated
      `out/super_suggester_showcase.html` + `.json`. Also fixed real CLI bugs found by the critic: `--dynamic`,
      `--temp`, and `--maxtok` are now parsed, and parallel `generate-dataset --workers` now forwards `static`,
      `hard`, and `maxAttempts`. Verified `node super_suggester.js --self-test`, `node build_super_suggester_showcase.js`,
      `node cli.js super-suggest`, `node cli.js generate-dataset --workers 2 --static --hard`, and `npm test`.
      Follow-up adversarial pass fixed the first prototype's fake knobs: `mode` and `difficulty` now constrain generated
      records, `depth` is saved, dynamic/static rule-salad compositions are blocked, exposed type values are a genuinely
      small slice rather than the whole type DB, compatibility edges are split/validated, and object/grid representations
      are explicitly marked `not_instantiated` until a real compiler emits them.
      Added and then adversarially rebuilt `build_super_suggester_visual_showcase.js` so the suggester leaves
      human-inspectable puzzle figures too: `out/super_suggester_visual_showcase.html` plus 8 v2 GIF cards for
      subobject dispatch, relation selection, analogy, support collapse, motif continuation, XOR, recursive fractal
      expansion, and future-state/path analogy. The v2 builder now hard-fails exact copied test answers, weak train
      variety, marker/shape confounds, invisible marker-selected transforms, and clipped fractal/scale outputs. Also
      added `build_arc_agi2_reference_audit.js`, rendering 20 local ARC-AGI-2 training tasks into
      `out/arc_agi2_reference_audit.html` with variation/size/DSL-reference notes, so synthetic cards are compared
      against real task texture rather than judged in isolation.
      Honest caveat: this is still a typed planning/suggestion layer, not a compiler that turns every plan into a
      validated GRIDVID scene or 2D-CoT trace.
- [x] (2026-06-25) **Showcase v6 second corrective pass after Mario review (Codex).** Rebuilt
      `out/showcase_v6.html` / `.jsonl` as **122 cards** with all cards carrying `difficulty`, `depth`,
      `language_description`, and code/DSL provenance. Repaired `extract_crop`, `count_holed_objects`, and every
      path-library template touched by the review so paths are explicit single-line routes instead of ambiguous random
      walks. Upgraded `inside_outside` and `collapse_support` in `gen_hard.js`; added automatic families
      `greek_key_frieze`, `empty_structure_complete`, and `skin_core_dispatch`; curated the 20 no-LLM generator samples
      so v6 visibly includes fractals, Greek-key patterns, maze/pathfinding, IQ boolean XOR, skins/subobjects,
      structure-style gravity, shadow/pointing, topology, and shape transforms. Verified `node build_showcase_v6.js`,
      `node cli.js self-test`, 50-seed sweeps for repaired scenes, and 50-seed sweeps for the key automatic families.
- [x] (2026-06-24) **Showcase v6 corrective pass + promotions (Codex).** Regenerated `out/showcase_v6.html`
      + `out/showcase_v6.jsonl` as **18 vetted cards** after Mario review: pruned the nonsense/constant/copyable families
      (Bongard, part-whole, nested-skin roles, core-then-mirror, xor-then-count), repaired the retained IQ/object/compositional
      families, and added variation contracts to every v6 card. Promoted `iq_boolean_xor` and `skin_zoo_select_checker`
      into official `gen_hard.js` families; fixed `scenes/library/figure_xor.txt` so XOR inherits source-A colour instead
      of emitting a magic colour. Browser QA: 18 cards / 18 images / 0 broken; `node cli.js self-test` green.
- [x] (2026-06-24) **ARC-style render grid (Codex).** `gif.js` previews now draw a 1px grey cell grid by default
      (`grid:false` opt-out), so v6 and future galleries look closer to real ARC-AGI/ARC-AGI-2 task visuals.
      Verified by rebuilding v6, `node cli.js self-test`, browser load, and pixel-decoding a sample GIF boundary.
- [x] (2026-06-24) **Expanded showcase v6 curriculum page (Codex + Faraday).** `out/showcase_v6.html` now has **5 clear
      sections / 122 cards**: 18 vetted v6 candidates, 62 existing basic DSL library templates, 12 foundational physics/fluid
      tasks, 10 fresh non-basic compositional tasks, and 20 no-LLM `gen_hard.js` samples. Added two basic predicate templates:
      `extract_wide_objects` (`where orientation is wide`) and `count_holed_objects` (`where loop` + tally). Also improved
      proposer hierarchy/coherence bookkeeping in `cli.js` (dynamic library count; whole-grid detection includes
      `grid_complete`, `unfold`, `crop`). Verified `node build_showcase_v6.js`, `node cli.js self-test`, and HTML/JSONL counts.
- [x] (2026-06-24) **PAN-167 IQ seed-pack expansion (Codex).** Added 11 abstract, non-copyrighted IQ rule-type descriptions in
      `DATASET/descriptions/iq/`: attribute binding, boolean mask algebra, Bongard classification, distribution-of-three,
      embedded-figure find, matrix feature progression, part-whole assembly, section profile, symmetry completion,
      topology/loop count, and transitive analogy chains. Loader check: `loadSeeds({iqOnly:true})` sees **17** IQ seeds;
      `node cli.js self-test` green; `generate-seeded --stub` still runs end-to-end (dedups expected because the stub scene is constant).
- [x] (2026-06-24) **Showcase-v5 feedback fixes + compositionality + v5.5 (Mario).** Fixed: `holed_take_largest` & `largest_to_marker`
      "largest" is now STRICTLY UNIQUE by construction (no ties); `replicant` undoable bug (asymmetric shapes + visible-transform check).
      New `collapse_support` (compositional physics: remove support → structure falls). New **showcase v5.5** `out/showcase_v5_5.html` =
      all gen_hard families (grouped by prior) + physics LAST-FRAMES incl. FLUID (spill_pool composed with an obstacle). Still TODO from
      feedback: more compositional-physics variants (chain reactions), even more shapes/colours/skins breadth, program-first IQ-style families.
- [x] (2026-06-24) **Fractals + hierarchical corpus index + IQ seeds + showcase v5 (Mario).** `fractal_continue` (self-similar:
      each cell → the whole motif; 8 pseudo-natural motifs incl. Sierpinski). `corpus_index.js` (prior→concept→families +
      `relatedExemplars` → the agent gets RELATED correct examples when a rule is drawn; wired into generate-seeded). 6 IQ rule-type
      descriptions in `DATASET/descriptions/iq/` (seeded.js loads them, no grids → agent invents examples; 251 seeds total). New
      `out/showcase_v5.html` (33 families grouped by prior). NOTE: DATASET is gitignored → sync descriptions to CINECA before generate-seeded.
- [x] (2026-06-24) **Skins everywhere + skinnable counters (Mario).** Extracted skins into shared `skins.js`
      (skinnedCells/SKINS/SHAPES_ALL/stampSkinned/pickSkin) used by gen_hard AND gen_count. Counters now spawn varied shapes + skins
      (count-by-colour/kind → body-colour-preserving skins so the colour stays unambiguous; total → any). Placement stays skin-safe
      (gap uses the full footprint). + the NVARC-shape **seeded generation** (`seeded.js`/`generate-seeded`) seeded from real ARC descriptions.
- [x] (2026-06-23) **Skins/sub-objects + derivable-colour rule + show-the-prompt (Mario).** Removed `count_to_color` (count→arbitrary
      colour) and `count_per_kind` (kind tally colour not derivable) — not ARC-style; new rule: no arbitrary colour encodings. Added
      `paintSkin` (plain-weighted + core/border/cross) over a broad shape vocab (square/disc/plus/L/triangle/diamond/T) + families
      `extract_by_core`, `odd_skin_out`; `remove_noise` skinned. Objects no longer all plain. `generate-llm` saves `meta.prompt`;
      `build_exp_gallery` shows it (the DSL suggestion). gen_hard 32 families, self-test green.
- [x] (2026-06-23) **Reconciliation mode-1 (RANK) — the pivot off free-authoring.** `reconcile.js` + `cli.js rank`: gen_hard makes
      K=4 correct-by-construction variants of one family; the LLM picks the most human/legible. Output can't be incoherent/overlapping/
      magic — every candidate is already correct; the LLM only adds taste. Validated on CINECA Qwen (N=24): all clean & coherent; Qwen
      really chooses (added a variant-shuffle to debias position). **mode-2 FILL** ✅ (gen_count). **mode-3 PROPOSE** ⏳ needs the compose
      layer (PAN-120). This is the standing answer: program-first = quality engine; LLM = taste via rank/fill/propose, never free-author.
- [x] (2026-06-23) **Qwen quality fixes (Mario: "every Qwen task is broken").** Diagnosed + fixed the free-author path:
      (1) **k=1** (one rule, no composition) · **static-only** (no physics/video) · **no augmentation** — defaults for `generate-llm`
      (`--dynamic`/`--k` to opt back). (2) Engine **`spawn random` keeps a 1-cell gap** (Chebyshev) — objects never touch/merge.
      (3) **Colour-grounding guard** `outColorsGrounded`: every OUT colour must already appear in the IN — rejects "magic" answer/overlap/
      token colours (the exact correlate of Mario's "no sense / wrong / embarrassing": classify_convex token, figure_overlay colour, count
      bar colour). (4) Prompt hard-rules: one clean rule, 3–6 objects placed only with `random` over a large box (no fixed `at`/tiny boxes),
      no `vary`, FIXED copy-offset, keep shapes clear of the border. Re-tested on CINECA Qwen each round (before=rule-salad → after=single
      clear grounded rules, 0 dynamic). **Still open:** residual overlap from `at`/copy free-authoring → the real path is reconciliation
      (Qwen ranks/fills/proposes on program-first tasks, not free-authors); "make Qwen more human"; try another model.
- [x] (2026-06-23) **Mario round 3: abstract pointers · maze overhaul · morph/replicant · magnet fix.** gen_hard 29→**32 families**.
      **Abstract pointer glyphs:** beyond the triangle — `arrow` (head+shaft ↑), `vee` (caret ^), `hollow` outline, + diagonal chevron;
      ray emanates from each glyph's computed tip (frontmost cell). **Maze overhaul** (new `maze.js`, 3 algorithms: backtracker/Prim/binary-tree
      → model abstracts pathfinding, not one texture): `maze_path` (STATIC unsolved→solved, **green start / red goal**, blue path) + `maze_video`
      (ACCELERATED: path drawn `stride` 2/3/5 cells per frame → ~9 frames not 60). Replaces the slow engine `maze_solve` scene. **morph_swap**
      (two objects exchange shapes, keep colour+position). **replicant** (each object transformed by a function fixed by its COLOUR — the
      scalable "different function per colour"). **Fixed magnet_dock** (de200a9a — the magnet group was invisible; now same-COLOUR objects
      attract = visible hint). All eyeballed; separable families 10936/10936 monochrome; self-test green (library 61→60).
- [x] (2026-06-23) **Pointer enrichment + ray (static & video) + more physics (Mario).** gen_hard 28→**29 families**, gen_physics 9→**12**.
      **Pointers:** 8-way directions (4 axis + 4 **diagonal chevrons**), **hollow** triangles, via `pointerCells`/`pointerScene`. `point_select`
      now covers all 8 dirs + filled/hollow; `count_arrows` too. **Ray launched — STATIC:** `point_ray` (beam from the tip to the first shape
      it hits, any of 8 directions). **Ray launched — VIDEO:** `beam_video` (program-first multi-frame: the beam extends one cell per frame
      from the tip to the target; crisp arrows; per-example variation). **More physics tier:** `maze_solve` (BFS pathfinding), `magnet_dock`
      (same-group magnets dock). All eyeballed; self-test green (library 59→61, count updated).
- [x] (2026-06-23) **Connecting + POINTING + SHADOW-CASTING + count_total fix (Mario).** gen_hard 23→28 families.
      **Connecting (richer):** `connect_in_order` (dots connected into one path in COLOUR order red→green→yellow→blue→cyan; crossings are
      grey-on-grey so the order stays unambiguous) · `connect_shape_pairs` (link the two same-colour SHAPES with a line of that colour; pairs
      may cross). **Pointing (new object class, arrows/triangles read as pointers):** `point_select` (recolour the shape the arrow points at —
      selection by direction) · `count_arrows` (count the arrows pointing up → tally). Helpers `arrowCells(dir,n)`/`apexOf`/`DIRV`/`bres`.
      **Shadow-casting:** `cast_shadow` — a point light on a border (yellow) + occluders → per-cell ray-cast hard shadows (grey) in the umbra
      behind each object. **Fixed augmentation bug (0b145f15):** `count_total` used `mark:"match"` → the tally took an arbitrary input colour
      that changed every example (unlearnable); now `mark:"fixed"` (grey, never a shape colour, constant across examples). Verified:
      separable-object families 10632/10632 monochrome (boundaries still clear), self-test green, all 6 new/changed eyeballed.
- [x] (2026-06-23) **Clear object boundaries — no two objects ever touch/merge (Mario).** `placeRoster` rewritten as gap-enforced
      placement (rejection vs a dilated occupancy grid → every object ≥1 empty cell from every other, Chebyshev; NEVER places touching —
      throws if it can't, gen loop drops the task). Canonical impl in `gen_count.js`, reused by `gen_hard.js` (single source). Fixed the
      transform-breaks-gap cases: `mirror_each` reserves the full bbox footprint (mirrored cells keep the gap); `gravity_drop` uses banded
      columns + distinct colours (floor-rested objects never merge); `quadrant_recolor` insets from both midlines; `connect_pairs` rows ≥2
      apart; `inside_outside` occupancy-based gap placement (inside objects no longer touch the frame); `remove_noise` 8-neighbour isolation.
      Grids enlarged +3 to keep big-object variety with the gap (drop ~13%). Verified: same-colour merge 400/400 clean, scene boundary clarity
      10760/10760 monochrome components, eyeballed. (`sort_row_by_size` OUT is a deliberate multi-colour legend row, exempt.)
- [x] (2026-06-23) **PAN-158 — human-shaped task outputs.** Audited every gen_hard ANSWER-type family (the ones whose OUT is a small
      answer, not a transformed scene) and made them human-shaped via `gen_count.js` machinery (`makeInstance`/`layoutTallies`/`cropToContent`,
      now exported). Replaced non-human `count_to_bar` (horizontal bar in a big mostly-empty grid) with **`count_total` / `count_per_color` /
      `count_per_kind`** — vertical · spaced · centred · colour-matched · cropped to a small grid (HUMAN assignment). `compare_more` now emits a
      tight 3×3 block instead of a block in a full grid. Verified: count_to_color (1×1), plurality_color (3×3), sort_row_by_size (1×K) already
      tight. Transform families (recolour-all etc.) keep full size — that's the legitimate human shape for a transformation. Gallery: `out/exp_human_counting.html`.
- [x] (2026-06-23) **PAN-157 — corpus variety + foundational PHYSICS tier.** (a) `gen_hard.js` **10→21 program-first families**
      (+recolor_by_size_class, gravity_drop, count_to_color, quadrant_recolor, plurality_color, outline_shapes, connect_pairs,
      recolor_by_holes, sort_row_by_size, remove_noise, scale_to_majority_size) across all 4 priors — all baseline-hard (0 trivial / 220),
      all eyeballed. Answer-type families emit SMALL human-shaped outputs (1×1 / 3×3 / 1×K). (b) **`gen_physics.js`** — the foundational
      DYNAMIC tier the `--static` collapse over-pruned: 9 clean short-video templates (gravity_settle/pile_up/bounce_ball/path_follow/
      shatter_fall/orbit_well/spin_rotate/spill_pool/explode_predict), correct-by-simulation, baseline-hard, prior-tagged, multinode
      (`--num-nodes/--node-rank`), `--augment` opt (default off = clean). Galleries: `out/exp_new_families.html`, `out/exp_physics.html`.
      Curriculum = concat `gen_hard.jsonl` + `gen_physics.jsonl`. Remaining: PAN-158 (human-shaped audit of OLD families), even more families.
- [x] (2026-06-22) **Generator breadth sweep + CINECA Qwen pipeline.** G1 boolean figure-algebra (`combine`/`overlay_figs`, PAN-127) ·
      G4 analogy/series/odd-one-out (`odd by PROP`/`bind_transform`+`apply`/`progress`, PAN-128) · G7 `grid_complete` (PAN-131) · G5 `unfold`
      paper-folding (PAN-129) · `repeat rand LO HI`. **`cli.js generate-llm`** = the Qwen-in-the-loop generator (proposer→prompt-kit→model→verify→
      **self-correct**, PAN-122) with **novelty** (PAN-116); **multinode** (`--num-nodes/--node-rank`) on both generators; **`cli.js export-objectives`**
      (arc_pair/next_frame/inverse_dynamics/object_aux, PAN-117). Library 50→59, self-test 96. Remaining: PAN-119/120 combinators+auto-compose, G6, fold/find, iterate/cycle, studio UI.
- [x] (2026-06-22) **G2+G3 — context-sensitive rules + detector predicates (the IQ keystone).** `dispatch SEL by PRED / case / default / end`
      (per-object conditional binding `it`), `classify SEL by PRED into A B` (Bongard scene→class), `where PRED [is V]` selector, and a
      `PREDICATES` registry (convex(hull)/symmetry/symmetric/loop/holes/connected/collinear/parity/orientation/size_class/kind/color) +
      `evalPred`. Engine refactor: per-statement `execStmt` so dispatch replays case bodies. Library +4 (dispatch_symmetry/holes/convex,
      classify_convex → 50). Self-test 86. Gallery v3 regenerated. **PAN-125 + PAN-126.** Next: PAN-127 (G1 boolean figure-algebra) → PAN-128 (G4 analogy/series).
- [x] (2026-06-20) **Hierarchical function-menu proposer** — `cli.js propose` (+ `buildFunctionRegistry`/`proposeMenu`/`menuToPrompt`):
      the generator hands the small model a small curated menu (k compose-compatible functions + rule-safe augmentations) per task,
      so the DSL stays simple in its eyes, composition is forced, and adding functions is safe. **PAN-132.**
- [x] (2026-06-20) **Small-model prompt-kit** — `cli.js prompt` (`buildPrompt`): guardrails + menu-scoped grammar card + curated menu
      + real exemplar = the full prompt the model receives (only the curated slice). **PAN-121.**
- [x] (2026-06-20) **Parallel sampler** — `generate-dataset --workers W`: disjoint seed slices across `worker_threads`, global dedup. **PAN-123.**
- [x] (2026-06-20) **Mass dataset sampler** — `cli.js generate-dataset` (+ pure `genDataset()`): template×seed×n_examples×wild
      balanced by concept-category, coherence-guarded (no per-task LLM), content-hash dedup, sharded gzip JSONL + `manifest.jsonl`,
      deterministic. self-test +2; real run 300/300 @ 98.7% yield, all 46 templates. **PAN-114.** Next: PAN-123 (parallel) · PAN-121 (prompt-kit).
- [x] (2026-06-20) Template library v1 — 39 verified-coherent templates, all priors. `scenes/library/`.
- [x] (2026-06-20) Cheap structural coherence guard in the engine (zero-LLM) — `meta.teaching.coherent`.
- [x] (2026-06-20) Physics pack: explode, shatter, burst, path-follow, bounce-ball, orbit, spin.
- [x] (2026-06-20) Whole-grid layer (transpose/rotate/map/solve) — closes the ARC-AGI-2 expressivity gap.
