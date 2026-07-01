---
title: "GRIDVID next direction — World-Model dataset + INTRINSIC rule complexity + model-drawn variety (5-agent synthesis)"
date: 2026-06-30
status: design synthesis (buildable roadmap) — extends the real system (engine.js/program.js/cli.js), per REGOLA 0
inputs: 5 congress agents — DSL recap, intrinsic rule complexity, model-drawn shapes, ARC World-Model dataset + step-by-step, NL+DSL training targets
---

# The synthesis

A 5-agent congress audited the DSL and designed the next direction around Mario's asks: (1) puzzles are still
too similar; (2) complexity is tied to the *number of parallel rules* when it should be the *complexity of the
rule itself*; (3) variety too small — the LLM should be able to DRAW shapes pixel-by-pixel; (4) return toward an
**ARC World-Model dataset** (understand grid worlds + human bias, not just solve), with step-by-step supervision
(GIFs were the attempt, maybe not the best); (5) the final dataset carries the whole function in BOTH natural
language AND DSL, to teach a (possibly from-scratch) model to execute HUMAN reasoning.

## THE KEYSTONE (three agents converged independently)
> **The program-execution trace is free, and it unifies everything.** `program.js`'s `seq` combinator
> (`applyNode`, line ~193) already computes an intermediate scene after every step and *discards all but the
> last*. Capturing `acc` after each `applyNode` yields, for zero cost, the ordered sequence of intermediate
> **"thinking-grids"** — which the `DATASET/descriptions` step-decompositions already hand-write, and which the
> engine can verify at every step. This one capture simultaneously answers: **step-by-step supervision**
> (retire GIFs for the solve tier), **world-model signal** (what-changed / forward-sim), and **the induction
> label** (the program whose steps produced those grids). Build this first.

---

## Part 1 — DSL recap (Agent 1)

Four DSLs coexist; only two feed the corpus. **(A) scene-DSL** (`engine.js buildTask`, line-oriented; what Qwen
writes in `generate-llm`). **(B) program.js AST** (typed object-combinators `seq/parallel/mask/dispatch/bind/
repeat` over selectors × keys × regions × per-object transforms incl. relational anchors; `applyNode` executor;
the induction LABEL `meta.program.tree`; NOT written by the LLM — sampled by `sampleChain`). **(C) gridgen
families** (~30 builders + the `task <family>` menu spec-DSL the weak LLM writes). **(D) Python `arc_dsl/
arcworld/arcvm`** — a research spike, disconnected from the JS pipeline.

**Pros:** the generate-and-verify contract (a weak model can't emit a broken task — teaching / no-magic-colour /
overlap / baseline-hard / solver-unique gates); the object-combinator layer's genuine same-grid selective +
anchor-relational expressiveness with first-class AST provenance; smart prompt scoping (menu slice, not the
whole grammar). **Defects (ruthless):** the solver is the difficulty ceiling (`solver2.fitAll` = flat one-pass
one-feature recognizer; `unique:true` is the inverse of ARC-2 under-determination); the LLM is a menu-clicker
that adds ~0 difficulty; "composition" is mostly disjoint non-interaction; no symbol-grounding/legend; 3 disjoint
DSLs with no shared kernel; **induction-vs-transduction confusion** — the model writes A/C, but the clean
induction label lives only in B (the layer the model never authors); difficulty is an *estimate*, not scored.

---

## Part 2 — INTRINSIC rule complexity (Agent 2) — the answer to "complexity of the rule itself"

**Diagnosis (exact):** `difficulty = 0.4 + 0.07·depth + 0.05·dispatch_branches + 0.02·nObjects` rewards
*parallel-rule count*; `sampleChain` builds depth by concatenating INDEPENDENT `seq` stages. There is **no rule
where a step consumes a value that an earlier step's execution produced over the same grid.** Real ARC-2 depth
is exactly that: a **derived intermediate** (a legend, bands, a per-target transform, a count, a settled
constraint field) computed from the grid and *consumed later in the same rule*.

**Taxonomy (real task ids):** A in-context **legend / symbol-grounding** (`009d5c81`, `20fb2937`); B
**region-conditioned projection** (`05a7bcf2` bands, `256b0a75`); C **correspondence / per-target
transform-solve** (`447fd412`, `36d67576`); D **constraint propagation** (Latin/symmetry-repair/occlusion-fill);
E **iterative wavefront** (`1190bc91`); F **quantity/rank-parameterized construction** (`4290ef0e`, `09629e4f`);
G **fractal blow-up** (`42f83767`); H **topology** (enclosure/connectivity).

**Golden discovery:** `engine.js` ALREADY has `solveLatin`, `markEnclosedRegions`, `isConnected`, `zoomGrid`,
`rotate/flip/transformCells` — **dormant, never exposed as combinators.**

**Proposals (value×feasibility): P1 `derive_legend`+`apply_legend`** (read a map off a region, apply it, erase
it — top priority, the symbolic axis); **P2 `project_conditioned`** (ray/beam colored by derived band); **P3
`for_each_target{solve_transform; transfer}`** (correspondence; start rigid/dihedral, engine has the ops);
**P4 `propagate`/`constrain`** (reuse the dormant Latin/enclosed/connected code); **P5 `blow_up`/`rank_construct`**.

**The design rule for `sampleChain`:** a stage is DEEP iff it consumes a value produced by an earlier stage's
execution over the same grid; grow depth by *lengthening that dependency spine*, not by appending independent
`seq` steps. **Require every emitted program to contain ≥1 derived-intermediate edge.**

**New difficulty metric (delete rule-count terms):**
`intrinsic = 1 − exp(−[0.9·(Dchain−1) + 0.7·S + 0.6·U + 0.5·log(1+Cprop) + 0.4·R]/3)` where
`Dchain` = longest data-dependency chain, `S` = #symbol-groundings the model must derive, `U` = under-
determination, `Cprop` = propagation steps, `R` = region-conditioning count. Clamp `intrinsic ≤ 0.35` when
`Dchain == 1` (a flat parallel chain is EASY). Report the vector, not just the scalar.

---

## Part 3 — Model-drawn shapes + variety explosion (Agent 3)

Today shapes are a fixed 23-generator table (`engine.js SHAPES`, throws on anything else); the guardrail
explicitly forbids invented shapes; `def/use` is a macro (text) layer, not pixels. The KB flags pixel-shapes as
the *deferred* feature.

**Design — `glyph NAME <rows>` pixel literal** (do NOT overload `def/spawn`): a per-scene named mask, mono
(`glyph arrow ..1../.111./11111`) or coloured (digits 0–9 per cell), registered in `world.glyphs`; `spawn NAME`
then resolves it. Validate with the engine's existing helpers (`normalize/bbox/isConnected`, size cap ≤8×8,
reject disconnected by default so 4-connectivity segmentation stays clean). Render = one added branch (per-cell
`b.colors`); every predicate/selector and the gap-safe placement keep working untouched (`kind=NAME`, `cells`
unchanged). **Random draw-push:** ~20–30% of tasks flip the guardrail to "DRAW N custom glyphs, then use them",
with two modes (glyph-as-object vs glyph-is-the-rule). The engine verify+reject loop stays the gate → no
solvability regression. **Also:** model-drawn `skin NAME` (open the fixed skin list), widen the procedural skin
sampler + `SKINNABLE`, palette *schemes*, scene-structure/texture variety. **Variety Index metric:**
D4-invariant shape signature → shape entropy + **novel-shape rate**; skin entropy; palette/structure entropy —
measure the explosion, north-star = novel-shape rate ↑ while reject-rate flat.

---

## Part 4 — ARC World-Model dataset + step-by-step (Agent 4)

**Teach simulation, not just mapping.** Six core-knowledge priors (object permanence, physics/dynamics, inverse
dynamics/causality, topology/geometry, number, agency) + three world-model-only targets our engine uniquely
gives: **"what changed"** (cell/object delta), **counterfactuals** (re-simulate with a perturbed field — free
label), **forward simulation** (roll out N frames). Every target is engine-derivable and *per-prior ablatable*.

**GIFs vs alternatives — verdict:** GIFs are right for the **physics/dynamics tier** (time is the world-fact),
WRONG for the **solve tier** (heavy, lossy, not how a grid-token reasoner thinks). Primary solve-step vehicle =
**the program-execution trace whose steps render intermediate thinking-grids** (representation B, with the
thinking-grids A as its rendered view, and per-step NL C + object-edits D as aligned annotations). The
descriptions already hand-wrote these; the `seq` fold already computes them. **Reconciliation:** human-bias
richness (kept, sourced from the AST/physics tier), solvability (the trace is *produced by* the verified
program), and step-supervision are the *same verified execution*. **Risks:** over-fitting to our generator's
world and to canned decompositions → defend with held-out *compositions* (not seeds), structural SemDeDup on the
DSL signature, **multiple valid decompositions per task**, per-prior ablation on ConceptARC + an eval slice;
scoring stays the fixed NVARC-style TTT+DFS stick.

---

## Part 5 — NL + DSL training targets + teaching human reasoning (Agent 5)

**Record schema:** each task carries the rule THREE aligned ways — `dsl_ast`, `dsl_text` (pretty-print), `nl`
(faithful full description) — plus `trace` (per-step {op, nl, grid, focus/edits}) and `aux` (objects, relations,
counts). **Alignment (our structural advantage):** for the `sampleChain` corpus the NL is already a
linearisation of the same AST the engine executes → promote it to a first-class **AST→NL grammar** (`nl(node)`
mirroring `serializeNode`) ⇒ NL≡DSL *by construction*, at scale, no LLM. LLM paraphrases (for human variety)
admitted only if they **round-trip via execution** (parse→run→same grids). DSL↔grid is exact (the grids ARE the
DSL's output).

**Teaching human reasoning (ranked):** #1 **execution-trace supervision** (teach the model to RUN the program;
intermediate grids are free, verifiable CoT — the single richest signal nobody uses); #2 **induction+
transduction dual** (BARC: complementary, only the ensemble wins — both labels from one execution); #3
**NL-then-DSL ordering** (verbalise the rule, then formalise — NVARC's winning upstream signal); #4 output↔program
**self-consistency**; #5 **curriculum** world-model → single-concept → composition (the only credible from-scratch
route); #6 verifier-in-the-loop RL on the exact engine (high ceiling, after SFT). **From-scratch, honest:** no
from-scratch model is near the record; back a code-pretrained base (Qwen3-4B class) as the record path; pursue
from-scratch as a research bet on the trace-supervised world-model curriculum. **The single bet:** supervise
`[demos] → [NL rule] → [DSL program] → [step {NL, grid}] → [test out]` on one record whose every intermediate
grid is engine-verified.

**Real bug to fix first:** `export-objectives` (`cli.js:205`) reads `task.meta.representation.program`, but the
composed `program.js` tasks write `meta.program` (the AST). The two producers use different keys → the AST
induction label never reaches training for the composed corpus. Unify the key (and populate `compiled_dsl`).

---

## THE UNIFIED ROADMAP (buildable, in the real system, prioritized)

**Phase 0 — the trace keystone + label plumbing (cheap, unblocks everything):**
1. Fix the `meta.representation.program` vs `meta.program` mismatch so the DSL label reaches `export-objectives`.
2. `seq` fold captures `acc` per step → emit the **execution trace** (thinking-grids + program-step + object-diff).
   New objective `solve_trace`. This is the step-by-step vehicle (retire GIFs for the solve tier).
3. First-class **AST→NL grammar** `nl(node)` → aligned NL≡DSL labels for free; add `dsl_text` pretty-print.

**Phase 1 — intrinsic complexity (the #1 lever), derive-then-consume combinators:**
4. **P1 `derive_legend`+`apply_legend`** (symbol grounding) — highest value, pure bookkeeping.
5. **P4 `constrain`/`propagate`** — reuse the dormant `solveLatin`/`markEnclosedRegions`/`isConnected`.
6. **P2 band-projection**, then **P3 correspondence** (rigid/dihedral first). Enforce ≥1 derived-intermediate edge.
7. Replace the difficulty formula with the **`{Dchain,S,U,Cprop,R}`** metric; stratify the corpus on it.

**Phase 2 — variety explosion:**
8. **`glyph NAME <rows>`** pixel-shape literal + the ~25% "draw-it-yourself" prompt push; model-drawn `skin NAME`;
   wider procedural skins/palette/structure; the D4-invariant **Variety Index**.

**Phase 3 — world-model targets + dataset assembly:**
9. `what_changed`, `counterfactual` (re-sim), `forward_sim` objectives; the full record schema (grids + trace +
   world-model fields + NL/DSL + provenance); both induction (program) and transduction (pairs) views.
10. Anti-overfit discipline: held-out compositions, structural dedup, multiple decompositions, per-prior ablation.

**Cross-cutting:** every step ships an HTML showcase (ARCHER.md rule 6); commits Mario-only; `cli.js self-test`
green; track on Linear/Scintilla/Flywheel.

## The one-line thesis
Stop making tasks harder by adding parallel rules; make ONE rule deep (a derived intermediate consumed later),
DRAW the shapes, and — the unlock — **emit the free execution trace** so the corpus teaches not input→output but
the *human step-by-step reasoning process itself*, with every step engine-verified, in both natural language and DSL.
