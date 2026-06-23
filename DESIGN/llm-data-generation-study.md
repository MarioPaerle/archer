---
title: "LLM data-generation for a human-prior grid corpus — study + pipeline design"
status: study — 2026-06-23
tags: [data-generation, llm, synthetic-data, filtering, diversity, core-knowledge, arc-agi-2, archer]
sources: verified on arXiv (every claim carries an ID; uncertainty flagged)
---

# Distilling human bias from LLMs into a grid corpus — study & pipeline

**The reframing (Mario, 2026-06-23):** the corpus must reflect **human core-knowledge bias**, be **enormous + varied**, and pretrain a model that has *nothing* human. LLMs absorbed that bias through text; our job is to **elicit it and filter out the slop**, keeping only the good examples. "Program-first vs LLM" was a false dichotomy — the literature says: **the LLM writes the program (carrying human bias in how it composes priors); the engine executes it (correctness); a multi-stage filter keeps the 5–20% that are good + hard + diverse.** This is exactly the recipe of the two strongest ARC data efforts (BARC, NVARC).

Synthesised from 6 verified-source research passes. Every number below traces to an arXiv ID; uncertainty is flagged.

## 1. What the literature says (the load-bearing findings)

### Generation — diversity is structural, not sampled
- **Diversity comes from an explicit conditioning axis, never from re-sampling** (which collapses to common modes). Self-Instruct's dedup (arXiv:2212.10560), Persona-Hub's 1B personas (arXiv:2406.20094), Evol-Instruct's depth/breadth operators (arXiv:2304.12244) all *inject* variety. → our function-menu is the right instinct; "make a varied task" is not.
- **Evolve complexity from seeds with named operators** (Evol-Instruct): add-constraint, deepen, compose-two, +reasoning-steps — paired with an **elimination filter** for incoherent/unsolvable results.
- **Quality-first beats scale** (phi / "Textbooks", arXiv:2306.11644): a smaller verified-correct corpus beat larger noisy data. The executable verifier is the highest-leverage component.
- **Reverse generation** (Backtranslation/Humpback arXiv:2308.06259; Bonito arXiv:2402.18334): generate the *rule for an already-valid grid pair* — sidesteps generating a correct pair from scratch.
- **Most of the work is curation** (Magpie 4M→300K, arXiv:2406.08464).

### Filtering — throw away most of it, combine two axes
- **Keep-rate is consistently 5–20 %** with equal/better results: LIMA ~2 % (1k examples, arXiv:2305.11206), DEITA 6k (arXiv:2312.15685), AlpaGasus 17 % (arXiv:2307.08701), IFD 10 % (arXiv:2308.12032). **Budget to discard the large majority.**
- **Combine a coherence/solvability gate × a difficulty gate** (DEITA = complexity × quality). For grids the quality gate is **execution** (hallucination-proof) and the difficulty gate is **IFD-style**: how much do the shown examples reduce a *small solver's* loss on the held-out test pair (high = informative/hard).
- **A weak/cheap scorer transfers**: Superfiltering filters for big models with **GPT-2-124M, 20× faster** (arXiv:2402.00530); perplexity pruning with a 125M model helps a 3B (arXiv:2405.20541). → score a HUGE corpus with a small model, not an expensive judge.
- **No single score is trustworthy.** "The Data-Quality Illusion" (arXiv:2510.00866, recent/unreplicated) shows classifier filters can raise benchmark scores without improving real LM loss; the **LIMA "1k is enough" claim is contested** for reasoning/scale. Validate filtered subsets with small train-eval ablations; never let a soft score replace execution.

### Diversity & collapse — accumulate, dedup on structure, gate on coverage
- **ACCUMULATE, never recurse-replace.** Training generatively on self-generated data collapses — **tails vanish first** (Shumailov, *Nature* 2024, DOI:10.1038/s41586-024-07566-y), i.e. exactly the rare rules ARC rewards. Keeping all seed/real data each round gives a **finite error bound independent of iterations** (arXiv:2404.01413). A **verifier on the synthetic stream breaks collapse** (arXiv:2406.07515).
- **Dedup semantically on a STRUCTURAL embedding** (DSL-signature / transformation features), not pixels — SemDeDup (arXiv:2303.09540) removed 50 % of LAION at minimal loss. Our "vary incidental features" rule *guarantees* same-rule recolored near-dups that pixel-dedup misses.
- **Diversity predicts downstream generalization more than per-sample polish** (arXiv:2410.15226); a single "quality" filter silently narrows coverage (DataComp audit arXiv:2405.08209). Track a coverage histogram and gate on it. **Repeat only *selected* high-value data** — D4: selected repetition helps, random repetition hurts (arXiv:2308.12284).
- **Fight mode-collapse at the prompt**, not the temperature (T alone stays clustered): structured seed conditioning + Verbalized Sampling ("propose K distinct tasks with probabilities") gives **1.6–2.1× diversity** (arXiv:2510.01171).

### ARC-specific — execution-as-filter, two modes, seed-then-remix
- **Execution-as-filter is non-negotiable.** BARC (arXiv:2411.02272) and NVARC both generate a **program**, then keep only what **executes** to valid grids.
- **Two generation modes cover different problems**: induction (program) + transduction (direct grid); only the **ensemble hits 56.75 %** on ARC public eval (BARC). → keep BOTH the solver program and the materialized pairs.
- **Seed from human solvers, remix concepts**: BARC seeded ~160 curated solvers → ~400k problems via GPT-4 "function suggestions" + concept mixing. = our function-menu, and it produced the winning data. *(exact ARC-Heavy/Potpourri counts from dataset readme, flagged.)*
- **RE-ARC ≠ BARC**: RE-ARC (arXiv:2404.07353) = per-task generator + **`verifiers.py`**, 1000 verified examples/task, 2 difficulty metrics → same-distribution volume for TTT. BARC = breadth/novelty for pretraining. **We need both pipelines.**
- **NVARC (the 24.03 % record)**: ~103k synthetic + 3.2M augmented; LLM summaries → transformation logic → **execute to grids → join+filter pairs → augment** (developer.nvidia.com; github.com/1ytic/NVARC). *(103k vs a "266k" snippet — the repo figure is authoritative.)*
- **Validate concept generalization, not just accuracy**: ConceptARC (arXiv:2305.07141) — 16 concepts × 30 = 480 human tasks; humans 91 %, GPT-4 25 % — catches synthetic overfitting. Adopt the ARChitects' **stability-under-augmentation** selection (ARC Prize 2024, arXiv:2412.04604).

### Core-knowledge priors — what to cover, and the honest caveat
- **Chollet's 4 ARC priors** (arXiv:1911.01547 §III.1.2): **objectness** (cohesion, persistence, influence-by-contact), **goal-directedness** (start→end intentional process), **numbers & counting** (count/sort/compare, +/−, *all quantities < ~10* = subitizing), **geometry & topology** (lines/rectangles, symmetry/rotation/translation, scaling/distortion, **containment & connectivity**, drawing/connecting). **Geometry/topology is the densest.**
- **Spelke core systems** (Dev. Sci. 2007, DOI:10.1111/j.1467-7687.2007.00569.x): objects, agents, number, space.
- **Prior-transfer-via-pretraining is real but mostly outside ARC**: LIME (synthetic deduction/induction/abduction → math, ICML 2021), formal-language pre-pretraining (arXiv:2502.19249), procedural-data → modular reasoning structures (arXiv:2505.22308). **NOT cleanly shown** that pretraining instills the *disentangled Spelke priors* transferring to novel ARC-2 tasks — suggestive, not conclusive. The documented failure mode is **high-coverage memorization** (ARC Prize reports). → measure per-prior by ablation, not aggregate score.

### Judges — verifier is the gate, LLM judge is secondary
- LLM judges *can* work (GPT-4 >80 % human agreement, arXiv:2306.05685) but are **biased**: position (65 % order-consistency), verbosity (91 % attack success on weaker judges), self-preference (+10–25 %). Reward models are **length-biased + reward-hackable** (Goodhart, arXiv:2210.10760).
- **Execution beats judging for verifiable artifacts** (CodeT arXiv:2207.10397; surveys arXiv:2510.24367, 2507.06920). → programmatic verifier first; LLM judge only for the residual "is the rule interesting/human-inferable" question, ensembled across a *different* model family than the generator, length-normalized, pointwise.

## 2. The archer pipeline (the synthesis — what we build)

Our structural advantage over all SFT-data work: **grids are executable**, so we own a hallucination-proof hard filter. The design that follows is BARC/NVARC's winning shape, hardened with the filtering/diversity/anti-collapse literature.

```
Stage 0  SEED LIBRARY (human-bias anchor)
  Curated verified DSL solvers/templates explicitly covering the 4 Chollet prior families
  (objectness · goal-directedness · number<10 · geometry/topology). Hand-admitted (Mario).
Stage 1  GENERATE — LLM as human-bias carrier + composer (program-first)
  LLM writes a SOLVER PROGRAM (DSL) + rule, NOT a free task.
  Diversity by EXPLICIT conditioning: (prior-family × concept × designer-persona × Evol-operator),
  Verbalized-Sampling "propose K distinct"; NOT "make it varied".
Stage 2  HARD FILTERS (programmatic, ~0 bias, ~0 cost — the gate; expect to drop 80–95%)
  (a) EXECUTE program → valid grids on every example (BARC/NVARC).
  (b) Coherence guard (our zero-LLM): one rule, OUT≠IN, examples consistent, no pre-cut-select.
  (c) DIFFICULTY: baseline-solver reject (1-step trivial) + IFD score from a SMALL solver.
  (d) STRUCTURAL dedup (SemDeDup on DSL-signature embedding, not pixels).
Stage 3  SOFT FILTER (LLM judge = SECONDARY, survivors only)
  ≥2 judges from a DIFFERENT family than the generator; pointwise rubric; length-normalized;
  answers ONLY "is the rule interesting + human-inferable" (execution already proved correctness).
Stage 4  COVERAGE + CURRICULUM
  Histogram over (prior-family × concept × difficulty × grid-size); gate on under-covered cells
  (DSIR-style match to ARC-AGI-2 rule families); repeat only SELECTED high-coverage tasks (D4).
Stage 5  ANTI-COLLAPSE
  ACCUMULATE seed/human tasks every bootstrapping round (never train→generate→replace).
  Emit BOTH the solver PROGRAM (induction) and materialized PAIRS (transduction).
Stage 6  VALIDATION (the truth)
  Hold out ConceptARC + an ARC-AGI-2 eval slice; measure PER-PRIOR by ablation
  (drop a prior family → matching eval family must degrade). Aggregate score hides memorization.
```

### How this maps onto what archer already has
- **Have:** the engine (executes DSL = Stage 2a/2b), the function-menu proposer (Stage 1 conditioning), `baseline.js` (Stage 2c difficulty floor), `staticize`/`--static`, the self-correcting Qwen loop, multinode generators, `export-objectives` (both program + pairs = Stage 5), `gen_hard.js` (a Stage-0 program-first seed source).
- **Build next:** (1) make the LLM write a **DSL program** not a free scene (Stage 1, program-first), so execution is the filter; (2) **IFD difficulty score** from a small solver (Stage 2c); (3) **structural SemDeDup** (Stage 2d); (4) **coverage histogram + gating** over the 4 prior families (Stage 4); (5) **ConceptARC eval + per-prior ablation harness** (Stage 6); (6) a **secondary LLM-judge** ensemble for "interestingness" only (Stage 3).

### The open risks (named, from the sources)
- **The verifier's semantic blind spot:** execution proves "OUT = program(IN)", not "the rule is human-inferable / interesting". Mitigation = Stage 3 judge + ConceptARC + human admission, never a single score.
- **Model collapse** if we ever self-train loops → accumulate, keep seeds (Stage 5).
- **Memorization masquerading as priors** → per-prior ablation (Stage 6), not aggregate ARC score.
- **Filter narrows coverage** → explicit coverage gating (Stage 4); diversity is a first-class axis, not a by-product.
- **Honest unknown:** that pretraining instills *disentangled* Spelke priors transferring to novel ARC-2 is *not* established — our corpus is testing it, the falsifiable bet.

## 3. Sources (verified on arXiv; ⚠ = secondary/flagged)
Generation: 2212.10560 · 2304.12244 · 2306.11644 · 2406.08464 · 2402.18334 · 2308.06259 · 2406.20094 · 2212.08073 · 2307.09288⚠ · Alpaca(project page)⚠.
Filtering: 2308.12032 · 2402.00530 · 2312.15685 · 2305.11206 · 2307.08701 · 2405.20541 · 2406.17557 · 2302.03169 · 2402.09739 · 2510.00866⚠.
Diversity/collapse: 2303.09540 · 2308.12284 · 2406.11794 · 2405.08209 · Nature 10.1038/s41586-024-07566-y⚠ · 2404.01413 · 2406.07515⚠ · 2410.15226 · 2510.01171 · 2505.17390.
ARC: 2404.07353 · 2411.02272 · 2305.07141 · 2412.04604 · NVARC(developer.nvidia.com + github.com/1ytic/NVARC) · re-arc(github.com/michaelhodel/re-arc).
Priors: 1911.01547 · Spelke 10.1111/j.1467-7687.2007.00569.x · LIME(ICML2021) · 2502.19249 · 2505.22308 · 2506.14276 · 2601.10904⚠.
Judges: 2306.05685 · 2410.02736 · 2406.07791 · 2410.21819 · 2310.03716 · 2210.10760 · 2403.13787 · 2510.24367 · 2507.06920 · 2207.10397⚠.
