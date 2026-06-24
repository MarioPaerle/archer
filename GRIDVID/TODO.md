# gridvid / prodigy — TODO

Running list. Newest priorities on top. Done items move to the bottom.

> 📋 **Tracked on Linear** (team `Panisperna`/PAN) — see `../LINEAR.md`. This file is the fast scratch list at the code;
> the durable, owned, status-tracked view is Linear. **Mirror substantial items into a PAN issue** (and keep both in sync).
> Generation backlog currently: PAN-114/123 (sampler+throughput) · PAN-119/120 (combinators+auto-compose) ·
> PAN-121/122 (prompt-kit + retry loop) · PAN-115/116 (IQ priors + Qwen novelty) · PAN-124 (semantic guard) · PAN-117 (objectives).

## 🔜 Open — Mario backlog 2026-06-24 (CINECA down → model items blocked)
- [ ] **PAN-164 Seeded generation (NVARC/BARC shape)** — `seeded.js` + `generate-seeded` SHIPPED (LLM writes a DSL generator from a REAL
      ARC task + its human description in `DATASET/descriptions/`). **Validate on Qwen when CINECA returns.** Next: skill-mix, consistency filter, grow descriptions 245→1000.
- [ ] **PAN-165 Swap model → Qwen3.6-35B-A3B** (CINECA down): confirm HF repo id, download to scratch/large, point debug_qwen.sbatch MODEL, re-run generate-seeded.
- [ ] **PAN-167 IQ-puzzle descriptions → seed** — author IQ-rule descriptions (Raven/analogy/series/odd/fold) in the DATASET/descriptions format, feed via generate-seeded. Start: `DESIGN/iq-tests-to-dsl.md`.
- [ ] **PAN-166 Easier DSL for agents** (toward Python-like / sandboxed Python = the 'later' half of the hybrid decision).

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
- [x] Template library past target: **61 scene templates** (was 39) + **29 program-first families** in `gen_hard.js` across all priors.
- [x] Qwen novelty prompt (PAN-116) — `generate-llm` rewards mixing + a twist while the engine guard keeps coherence.
- [x] More physics: **magnets** (`magnet_dock`), maze pathfinding (`maze_solve`), pointer beams (`beam_video`) added to the
      foundational tier. (Still possible later: pile-toppling/collapse, chain reactions, fluid + floating objects.)

## ✅ Done
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
