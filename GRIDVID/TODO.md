# gridvid / prodigy — TODO

Running list. Newest priorities on top. Done items move to the bottom.

> 📋 **Tracked on Linear** (team `Panisperna`/PAN) — see `../LINEAR.md`. This file is the fast scratch list at the code;
> the durable, owned, status-tracked view is Linear. **Mirror substantial items into a PAN issue** (and keep both in sync).
> Generation backlog currently: PAN-114/123 (sampler+throughput) · PAN-119/120 (combinators+auto-compose) ·
> PAN-121/122 (prompt-kit + retry loop) · PAN-115/116 (IQ priors + Qwen novelty) · PAN-124 (semantic guard) · PAN-117 (objectives).

## 🔜 Next up
- [ ] **Online IQ / matrix-reasoning tests → DSL** — collect the ABSTRACT transformations behind classic
      non-verbal IQ items (Raven's Progressive Matrices, odd-one-out, analogies, series). Do NOT copy
      copyrighted items — re-encode the *transformation type* as new DSL templates to pull the dataset more
      in-distribution for ARC and get fresh inspiration. (matrices = 3×3 analogy grids → composable with our
      whole-grid + object verbs.)
- [ ] **Qwen generation prompt** — instruct Qwen-30B to MIX templates and add a genuine twist of its own
      (not copy the examples). Haiku currently mostly reproduces patterns; the prompt must reward novelty
      (new compositions, a surprising OUT, a twist on the rule) while the engine guard keeps coherence.

## 🧪 Engine / DSL
- [ ] More coherence guards as new nonsense patterns appear (the free filter).
- [x] `repeat rand LO HI` (variable counts in macros) — DONE 2026-06-22 (macro-time rng from the scene seed).
- [x] Objectives/tokenizer export — DONE 2026-06-22 (`cli.js export-objectives`: arc_pair/next_frame/inverse_dynamics/object_aux).
- [ ] **PAN-119/120**: typed combinators `program.js` AST (dispatch is its runtime core) + auto-compose 2 templates without the LLM.
- [ ] **G6** (PAN-130): `assemble`/`tile_cover`/`section`. · **G5 fold/find** · **G4 iterate/cycle**.
- [ ] Studio UI (`index.html`) → 3-pane triple editor (EXAMPLES | IN | OUT) + Export-as-task.

## 🎨 Content
- [ ] Keep growing the template library past 39 (target 60-80 across all priors).
- [ ] More physics: pile-toppling/collapse, chain reactions, fluid + objects floating, magnets/charge fields.

## ✅ Done
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
