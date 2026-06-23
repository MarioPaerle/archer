---
title: "HANDOVER — the corpus / data-generation frontier (archer)"
updated: 2026-06-23
for: the next agent working on archer's synthetic ARC-AGI-2 pretraining corpus
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
