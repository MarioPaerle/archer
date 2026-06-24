---
title: "HANDOVER — the corpus / data-generation frontier (archer)"
updated: 2026-06-24
for: the next agent working on archer's synthetic ARC-AGI-2 pretraining corpus
---

# HANDOVER 2026-06-24 — read THIS section first (then the 2026-06-23 one below for deeper history)

> Read order: (1) this section, (2) `DESIGN/llm-data-generation-study.md` (strategy/6-stage pipeline), (3) `GRIDVID/HANDOVER.md` (engine/DSL contract), (4) `LINEAR.md`. `archer` (github.com/MarioPaerle/archer) is canonical — **commit + push to origin/main at every step, Mario-only, no co-author; `cd GRIDVID && node cli.js self-test` MUST be green before push** (`ARCHER.md`). Chat with Mario in Italian; code/KB English.

## THE BIG PICTURE (where we are + the one decisive insight)
Goal: pretrain a from-scratch grid world-model on millions of ARC-style tasks teaching human core-knowledge priors → beat NVARC (24% @ $0.20/task). Mario's verdict on the current corpus: **"we're at ARC-AGI 1.5 level"** — good but not AGI-2-hard; needs **more compositionality + richer objects**.

**The decisive finding (read the NVARC writeup `SOURCES/06/2025-11-nvarc-...md`):** NVARC's generation wins because the LLM is **seeded from REAL ARC tasks + human solution descriptions** and writes a **GENERATOR program** (→ ~30 instances, execution+consistency filtered), with strong models offline. We had a small model writing single DSL scenes from our INVENTED priors (out-of-distribution → low diversity / incoherence). **PIVOT (shipped, not yet validated): `GRIDVID/seeded.js` + `cli.js generate-seeded`** — feed Qwen a REAL ARC task's grids + its human rule (from `DATASET/descriptions/training/*.md`, 245 of them) + the full grammar + RELATED correct exemplars → it writes a reseed-varying generator for THAT rule. Also IQ rule-types in `DATASET/descriptions/iq/` (6, no grids → agent invents). **This is the most important next thing to VALIDATE on CINECA.**

## CODE MAP (all in `GRIDVID/`)
- **`gen_hard.js`** — 34 program-first families (correct-by-construction, baseline-hard, gap-placed, skinned). The quality engine. Add a family = a `make(rng)→{in,out}`, eyeball once.
- **`gen_physics.js`** — 12 short-video physics templates (gravity/pile/bounce/shatter/orbit/spin/spill-fluid/explode/magnet_dock/maze_video/beam_video). `--augment` off by default.
- **`gen_count.js`** — parameterized human-shaped counting (skinned counters); exports `placeRoster`/`makeInstance`/`cropToContent`.
- **`skins.js`** — shared SKIN system (plain-weighted + core/border/cross/stripe; `stampSkinned`/`pickSkin`). Used by gen_hard + gen_count.
- **`corpus_index.js`** — hierarchical DB (prior→concept→families) + `relatedExemplars()` → hand the agent RELATED correct examples.
- **`seeded.js`** — the NVARC pivot (above). **`reconcile.js`** — mode-1 RANK (LLM picks the most human of K correct variants; output can't be incoherent). **`baseline.js`** — dumb 1-step solver = the "too simple" filter.
- **`cli.js`** commands: `generate-llm` (free-author, defaults k=1/static/no-aug/colour-grounded), `generate-seeded` (the pivot), `rank` (reconcile mode-1), `generate-dataset` (template sampler), `self-test`, `dsl`.

## STANDING DESIGN RULES (Mario, hard-won — do not regress)
1. **Clear boundaries**: objects never touch/merge (esp. same colour). `placeRoster` + engine `spawn random` keep a ≥1-cell gap. Transforms that move cells (mirror/scale) reserve the full bbox footprint.
2. **Derivable answers only**: every OUT colour must already appear in the IN (LLM path: `outColorsGrounded` guard); no arbitrary colour encodings (killed count_to_color/count_per_kind).
3. **Human-shaped outputs**: answer grids are small/cropped (counting = vertical/spaced/centred tallies).
4. **`largest`/`smallest` must be STRICTLY unique** (no size ties) — by construction.
5. **No undoable tasks**: every transform must be visibly inferable (e.g. replicant uses asymmetric shapes only).
6. **Objects not all plain**: skins + broad shape vocab; but plain stays common (easiest, teaches most).
7. **Eyeball every new/changed family** (render GIF → `sips` to PNG → Read). The cheap guards catch structure, not visual breakage.
8. **Qwen free-authoring has a ceiling** (overlap/magic-colour/rule-salad). The answer is reconciliation (rank/fill/propose) + seeded-from-real. Program-first = quality engine; LLM = taste/humanity, not free author.

## QWEN / CINECA (experiments done 2026-06-24)
- temp 0.9→**0.6** + top_p 0.9 (`callModelHTTP`): cleaner, but Qwen Instruct converges on ~6 safe rules (low diversity).
- **Qwen3-30B-A3B-Thinking** tested: ~30× slower (28min/12), 85% fail, BUT survivors more creative → use it as a **rule-TYPE miner** (mine novel rules → templatize program-first), not a bulk generator.
- **Coder models** (Qwen3-Coder-30B-A3B) = best free-author bet (eval only, not downloaded). Decision: **hybrid — DSL now, sandboxed Python later** (PAN-166); keep **Qwen**, swap to **Qwen3.6-35B-A3B** (PAN-165).
- **CINECA run loop:** `ssh leonardo` (smallstep auth re-login ~12h, expires mid-long-session); `sbatch arc-archer-ops/debug_qwen.sbatch` (or `debug_thinking.sbatch`; 2×A100, ~8 min to load, node:8000, qos debug 30 min); drive `node GRIDVID/cli.js generate-seeded|generate-llm|rank --endpoint http://<node>:8000 --model qwen`; pull `$SCRATCH/archer-datasets/...`; **ALWAYS `scancel` after** (GPU discipline). Both 30B models = 57G each in `$SCRATCH/models` (scratch/large; work + scratch/fast are FULL).
- ⚠️ **DEPLOY NOTE:** `DATASET/` is gitignored (KB, not in archer) → `seeded.js` reads `DATASET/descriptions/` which is NOT on the CINECA clone. **Before `generate-seeded` on CINECA you must `rsync`/`scp` `DATASET/descriptions/` to the clone.** ⚠️ **CINECA was DOWN at handover** → seeded validation + Qwen3.6 swap are BLOCKED, queued.

## OPEN BACKLOG (Linear)
- **PAN-164** ⭐ Seeded generation (NVARC shape) — `seeded.js`/`generate-seeded` shipped; **VALIDATE on Qwen when CINECA returns** (sync DATASET first). Then: skill-mix (combine two real rules), consistency filter, grow descriptions 245→1000.
- **PAN-165** swap model → Qwen3.6-35B-A3B (CINECA down; confirm HF repo id, download to scratch/large, point debug_qwen.sbatch MODEL).
- **PAN-166** easier/Python-like DSL. **PAN-167** IQ-puzzle descriptions → seed (6 authored; add more).
- From the v5/v5.5 review (still open under PAN-157): MORE compositional physics (chain reactions, remove-one-others-react — I added `collapse_support`), MORE shapes/colours/skins breadth, program-first IQ-style families (analogy A:B::C:?, series, matrix).
- Galleries delivered (local, `out/*.html`): `showcase_v5_5.html` (latest, grouped by prior + physics last-frames incl. fluid), `dsl_suggestion.html` (the prompt Qwen receives), `qwen_v2.html` / `qwen_thinking.html` / `rank_mode1.html`.

---

# HANDOVER — archer corpus frontier (2026-06-23)

> Read in order: (1) this file, (2) `DESIGN/llm-data-generation-study.md` (the verified-source study + the 6-stage pipeline — the strategy), (3) `GRIDVID/HANDOVER.md` (the engine/DSL/generator contract), (4) `LINEAR.md`. The repo `archer` (github.com/MarioPaerle/archer) is the canonical code base — keep every clone synced (`ARCHER.md`).

## 0. Where we are in one paragraph
We pretrain a from-scratch grid world-model on millions of ARC-style tasks that teach **human core-knowledge priors** (Chollet's: objectness, goal-directedness, numbers<10, geometry/topology), to beat NVARC (24.03%). The engine + generator + multinode + Qwen-on-CINECA all work. The hard lesson, learned the painful way: **LLM free-authoring produces nonsense the cheap structural verifier can't catch** (rule↔DSL mismatch, overlapping layouts, triviality). The study (`DESIGN/llm-data-generation-study.md`) reframed it: the LLM is the human-bias *carrier*; the engine is the *truth*; a multi-stage filter keeps the 5–20% good. The current best concrete artifact is a **program-first generator** (`GRIDVID/gen_hard.js`) that produces clean + hard + correct + prior-covering tasks at **~3,300/sec/core**. Mario approved it ("truly good") and set the next fixes (§4).

## 1. The journey (so it isn't relearned)
- **archer published** public (MarioPaerle/archer, Mario-only commits, no co-author), cloned on CINECA at `/leonardo_work/IscrC_YENDRI/paerle/archer`, generator self-test green there.
- **Qwen3-30B-A3B served with vLLM on 2×A100** (CINECA) and driven by archer's `generate-llm` — full loop works (Qwen writes DSL → engine verifies → self-corrects). Hard-won config in [[reference_cineca_arc_layout]]: vllm 0.8.5 + transformers 4.51.3 + fastapi 0.115.12 + starlette 0.46.2; NO `module load cuda`; **fp8 fails on A100** → bf16 TP=2; ops in `paerle/arc-archer-ops/`.
- **Three failure modes found & understood:** (a) LLM composing k≥2 templates → incoherent rule-salad; (b) single verified templates → correct but trivial (1-step); (c) LLM "hard" proposals → 2-step rules but overlapping/messy layouts. Every LLM path has a failure the structural verifier can't catch.
- **The study** (6 verified-source research passes) → the 6-stage pipeline.
- **program-first generator** `gen_hard.js` → the breakthrough: WE control layout + apply the rule in JS (correct by construction) + baseline-hard filter.

## 2. What's built (all in `archer/GRIDVID/`)
- **`engine.js`** — the DSL engine/executor (self-test 99 checks). Full prior coverage incl. dispatch/classify/predicates (G2/G3), figure-algebra (G1), analogy/odd (G4), matrix-completion (G7), paper-folding (G5). `cli.js dsl` = grammar.
- **`gen_hard.js`** — ⭐ program-first hard-task generator. 10 relational families across the 4 priors: `rank_recolor` (size→colour), `holed_take_largest`, `recolor_to_majority`, `count_to_bar`, `compare_more`, `inside_outside` (containment), `fill_holes`, `largest_to_marker`, `odd_shape_out`, `mirror_each`. Each: clean non-overlapping layout (`placeRoster`), rule applied in JS (correct), `meta.prior` tag, difficulty proxy, baseline-hard. `node gen_hard.js --n N -o out/hard.jsonl`. **~3,300 tasks/sec/core.** Adding a family = add a `make(rng)` to `FAMILIES`, eyeball once, infinite after.
- **`gen_count.js`** + **`exp_fill_count.js`** — the mode-2 reconciliation prototype (parameterized counting task exposing human-convention variables + the LLM-fills-them test). See §4b.
- **`baseline.js`** — dumb 1-step solver (geometry/extract/symmetrize/tile/colormap/keep-largest). `trivialSolve(task)` → op name or null. The objective "too simple" detector = the `--hard` filter. Honest: it's a difficulty FLOOR, not full ARC-AGI-2 hardness (no object-reasoning solver yet).
- **`cli.js`** generators: `generate-dataset --static --hard` (procedural, ~1,800/s/core, multinode `--num-nodes/--node-rank`), `generate-llm` (Qwen loop, self-correcting, `--static`), `propose-templates [--hard]` (LLM invents single-rule templates → `scenes/proposals/` staging, **human admits**), `export-objectives` (→ arc_pair/next_frame/inverse_dynamics/object_aux training records).
- **`build_exp_gallery.js`** — gallery of any tasks.jsonl with IDs + prior + baseline verdict.
- **Galleries delivered to Mario:** `out/exp1_library_hard.html`, `out/exp2_qwen_hard.html`, `out/exp3b_program_first_v2.html` (the good one).
- **Study:** `DESIGN/llm-data-generation-study.md`. **Eval-validation (TTT+DFS) study:** `DESIGN/eval-validation-ttt-dfs.md` (gcirillo's NVARC repro is private; we study, don't copy; multinode = shard the 120 puzzles).

## 3. Conventions / hard rules
- **Program-first families are correct BY CONSTRUCTION** (rule applied in JS). The LLM is for *breadth/human-bias*, never trusted for correctness — its output must pass execution + coherence + baseline + (human admit).
- **Eyeball every new family** before shipping (the engine's guard catches structure, not visual breakage). Mario admits LLM-proposed templates by hand.
- **No slop**: KB/research → verify every source on arXiv; chat Italian, code/KB English; Mario-only commits.
- **Anti-collapse**: if we ever self-train loops, ACCUMULATE seeds, never recurse-replace (study §1).
- **Grids must be HUMAN-SIZED, not giant** (Mario 2026-06-23): the OUTPUT grid is sized to its content — 3 things to count → a small answer grid, not a big mostly-empty one (wastes tokens + space). `gen_count.js` crops the OUT to content (`cropToContent`, 1-cell margin). Audit every family: an "answer" output (count/compare/marker) should be a tight small grid; ARC allows IN and OUT to differ in size. More generally: outputs must be **human-shaped** (legible, conventional, centred/spaced where a human would) — see PAN-158.

## 4. NEXT — Mario's fixes (2026-06-23), in priority
1. **Less repetition → WAY more problems + bring PHYSICS/dynamic BACK.** Tasks are currently super repetitive/similar (10 families × instances). Need (a) many more families/variety, (b) the **dynamic/physics** families we excluded (`gravity_settle`, `pile_up`, `bounce`, `path`, …) — they teach the FOUNDATIONS: to understand *what an object is* or *what counting means*, the model also needs **simpler, physical examples**. The `--static`/last-frame collapse over-pruned them. Re-introduce a controlled physics tier (simple, clean, foundational), as last-frame OR short-video, mixed into the curriculum.
2. **Human-like counting variants (the DSL-is-not-human problem).** `count_to_bar` is correct but NOT human: a human would draw the bar **vertically**, maybe **one bar per colour / per type** (not just "count red"), and place each counting cell **SEPARATED, centred** (humans are simple/legible). Counting is super important — keep it — but add the human variants: vertical, per-colour/per-type tallies, spaced+centred marks. This is a concrete instance of "our DSL outputs aren't human-shaped" — audit other families for the same.
3. **(answered)** Creation speed = **~3,300 tasks/sec/core** for `gen_hard` (incl. baseline filter); `generate-dataset` ~1,800/s/core. → thousands in <1s, millions/minutes on a node. Generation is NOT the bottleneck; quality/variety/coverage is.

## 4b. THE RECONCILIATION (generator × LLM) — the real architecture (Mario, 2026-06-23)
The endgame is NOT "program-first instead of LLM" nor "LLM instead of program-first" — it's **both, with a clean division of labour**:
- **The generator owns: correctness + the priors + reducing complexity.** It has good priors and a sense of which prior-COMBINATIONS are good; it hands the small LLM a *constrained, tractable* sub-problem (a reduced menu / a scaffold with open slots), not "invent a whole task".
- **The LLM owns: the humanity** — but you must EXTRACT it, not sample it raw (raw = slop). The human bias lives in the LLM's **judgments/preferences/conventions**, not its free generations. Extract it 3 ways, each a small + verifiable choice:
  1. **Select/rank** — generator makes K correct variants, LLM picks the most natural/legible/human. (taste) ← strong variety lever.
  2. **Fill constrained slots** — generator exposes "nice variables" (display conventions), LLM fills them. (conventions) ← Mario's favourite; **VALIDATED, see below.**
  3. **Propose combinations** — LLM suggests which prior-pairs make a human-meaningful task; generator builds them correct. (composition taste)
- **Filter owns: keep the good** — engine executes (correctness), baseline (hardness), dedup + coverage.

### Mode-2 PROTOTYPE & RESULT (validated 2026-06-23) — `gen_count.js` + `exp_fill_count.js`
- `gen_count.js` = a **parameterized counting task** that exposes 5 human-convention variables and builds a CORRECT, clean task for ANY assignment: `count_what(total|per_color|per_kind) · orient(h|v) · spacing(flush|spaced) · place(corner|center|rows) · mark(match|fixed)`. OUT is cropped to content (small grid).
- `exp_fill_count.js` = the test: the small LLM only PICKS the 5 values (low complexity); we sample K and measure how human its modal choice is. **Result (Qwen3-30B-A3B, k=14): 14/14 valid JSON, 100% consistent**, chose vertical · spaced · colour-match · per_color · corner — i.e. coherent, human-plausible conventions (matched a hand-guessed "human" reference on 3/5; the other 2, per_color-vs-per_kind and corner-vs-center, are both legitimately human). **Conclusion: yes, a small LLM can fill the human-convention slots correctly/coherently when the choice is constrained.** This is *how you extract humanity*: don't make it generate, make it choose/fill.
- **Next on this line:** generalize mode-2 to ALL families (each exposes its convention variables), add mode-1 (LLM ranks K variants for naturalness — the strongest variety+taste lever), add mode-3 (LLM proposes prior-combinations, seeded from real-ARC combination statistics). Galleries: `out/exp_fill_count.html`.

### Beyond the fixes (the pipeline, study §2)
- Build the rest of the 6-stage pipeline: **IFD difficulty score** (small solver), **structural SemDeDup** (DSL-signature embedding), **coverage histogram + gating** over the 4 priors, **ConceptARC + per-prior ablation** validation harness, **secondary LLM-judge** ensemble (interestingness only).
- **Program-first via Qwen** (study §2 Stage 1): have Qwen write a DSL *program* (execution = the filter), not a free scene.
- Then **scale** (multinode) + **export-objectives** + start pretraining; validate via the TTT+DFS eval path.

## 5. CINECA / Qwen quick ref
Base `paerle/archer`; ops `paerle/arc-archer-ops/` (`setup_vllm_env.sh`, `serve_qwen.sbatch`, `debug_qwen.sbatch`). Model at `$SCRATCH/models/Qwen3-30B-A3B-Instruct-2507`. Serve: `sbatch serve_qwen.sbatch` (or `debug_qwen.sbatch`, qos `boost_qos_dbg`, fast alloc, 30 min). Drive: `node cli.js generate-llm/propose-templates --endpoint http://<node>:8000 --model qwen`. **GPU budget discipline** (Mario): cap experiments, cancel idle servers.
