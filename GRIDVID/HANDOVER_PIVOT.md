---
title: "GRIDVID HANDOVER — pivot from transform-library to search-verified compositional reasoning"
date: 2026-06-29
status: handover for the NEXT agent (do the build)
---

# GRIDVID — HANDOVER (read this first)

You are taking over a synthetic **ARC-AGI-2 pretraining-corpus generator** in `Panisperna/ArcAgi-2/GRIDVID/`
(Node.js, no build step; every module has `--self-test`). The goal: generate millions of *coherent, solvable,
ARC-AGI-2-grade* tasks (`prodigy-task` JSON: `{examples:[{in:[grid],out:[grid]}], in:[grid], out:[grid], meta}`)
to pretrain a model toward beating the NVARC record. Grids = rows of ints 0–9 (0 = bg), ARC palette.

## ⛔ THE VERDICT (why we are pivoting) — established by a 4-subagent adversarial review, 2026-06-29
The current system (call it **v1 = a transform library**) is **ARC-1 easy, not ARC-2 hard**, and it is so *by
construction*. Root cause, unanimous across all four critics:

> **The verifier IS the difficulty ceiling.** The generator (`gridgen.js`) is generate-and-filter: a task is
> kept only if the symbolic solver (`solver2.js solvable` / `reasoning.js solveReasoning`) **re-derives it
> uniquely** + survives `baseline.js trivialSolve`. But that solver is a **flat enumeration of single-pass,
> one-feature closed-form hypotheses** (`solver2.js fitAll`). Therefore the hardest task the system can *ever*
> emit = the hardest one-line hypothesis the solver already pattern-matches. A genuinely 3+-step, rule-
> interacting task **has no representation** in the solver → `solvable()` returns false → the task is
> **discarded**. The hard tasks aren't rare; they're *unrepresentable*.

Empirical confirmation (a critic actually solved a sample): **~75% of tasks are solvable from a SINGLE train
pair; ~100% are a one-pass transform over a tiny DSL; a 50-line Python brute-forcer solves all of them.**
`meta.rule` is literally the answer key, and `solver.unique:true` is the **opposite** of ARC-2's defining
under-determination. The `auto_compose` "compositional pinnacle" uses combinator `mask(region,rule)|parallel`
and **verifies the two rules NEVER interact** (two easy puzzles glued side-by-side). The LLM (Haiku) adds **zero**
difficulty — it only picks a family name from a menu that == the solver's vocabulary; `Math.random()` over
`FAMILIES` is equivalent. A model trained only on this corpus is predicted to score **~0–3% on ARC-AGI-2**: it
learns a transform library, not a reasoner — the exact failure ARC-AGI-2 was built to expose.

**Mistake pattern to avoid:** every time v1 was "improved", the solver was made to match the generator, so
verification always succeeds → output stays trivial. Breadth (≥10 families that each verify) was optimised
instead of **depth/composition per task**.

## ✅ THE PIVOT (what to build) — difficulty must become a VERIFIED, SCORED axis
ARC-AGI-2 difficulty = **rule INTERACTION + UNDER-DETERMINATION + per-task novel concept**. To generate it:

1. **Replace the recognizer with a SEARCH-based verifier (the keystone).** A small ARC solver: bounded
   program search over a compositional DSL (depth ≥3), so "unique solution" can *certify a composed program we
   did not template*. The hardest emittable task then = the search horizon, not a hand-written one-liner. This
   is the piece that breaks the ceiling; everything else depends on it. (Think: enumerate/beam-search programs
   `p` over a DSL; a task is valid iff exactly one minimal `p` (up to equivalence) fits all train pairs AND it
   reproduces the test — and crucially NO shorter/1-step `p` fits, which is what guarantees it's *hard*.)
2. **Rule interaction & conjunction.** Rules where B depends on A's *result*; conjunctive latent rules `A AND B`
   so any single-feature hypothesis fails uniqueness; one region of the grid as an **instruction/legend/key**
   that reprograms the transform applied elsewhere (symbol grounding — the ARC-2 hallmark).
3. **Forced under-determination.** Design so ≥3 *independent* observations are required and NO single train
   pair reveals the rule (e.g. pair1 varies only colour, pair2 only shape, only pair3 couples them). Reject any
   task a 1-pair / 1-step solver cracks.
4. **Composition as a GRAMMAR, not a menu.** e.g. `f1 |> f2 |> f3` chained and verified END-TO-END, with a
   **difficulty budget** (min program depth, min #distractor hypotheses ruled out) and a **difficulty SCORE**
   (search depth, branching, #observations needed). Balance the corpus on *score*, not family count.
5. **Use the LLM where it has leverage:** propose novel *compositions* and *adversarial distractors* (then the
   engine verifies) — NOT as a menu clicker.

Concrete "hard task" sketch (from the solve-test critic) to use as a north-star acceptance example: take the
3×3 Latin square and break its single-pass determinacy — N×N with N symbols and 2–4 blanks (needs constraint
propagation), PLUS a second interacting layer (cell colours form a Latin square AND each cell's sub-shape must
follow a rotational progression read off a **key strip in the margin** → one region instructs another), made
under-determined so ≥3 coupled observations are required. That forces ≥3 chained inferences and defeats a flat
DSL brute-forcer. The current tasks force one.

## 📦 STATE / BACKUP (v1 is preserved — do NOT delete it; reuse the renderer/format/showcase)
- Git tag **`gridvid-v1-transform-library-pre-pivot`** + branch **`backup/gridvid-v1-pre-pivot`** at commit
  `d3cc5ca`. Source tarball: `Panisperna/ArcAgi-2/_backups/GRIDVID_src_v1_prepivot_2026-06-29.tar.gz`.
- v1 modules worth REUSING (format, rendering, object IO — not the difficulty model):
  - `engine.js` (`buildShape`, ARC palette), `solver.js` (`segObjects` object segmentation), `baseline.js`
    (`trivialSolve` — keep as a *floor* filter), `gen5.js`/`program.js` (scene/render patterns).
  - `gridgen.js` (the unified policy + LLM-promptable DSL + `compileSpec` + best-effort param matching) — the
    *plumbing* is good; the *menu* is the problem.
  - `build_corpus_showcase.js` / `build_haiku_showcase.js` (ARC-gridline HTML; the latter shows the full chain
    spec→suggestion→DSL→rule→grids). `reasoning.js` (the `principle⊗feature⊗structure⊗query` meta-generator —
    the closest thing to composition; generalise its IDEA, but its solver is still single-principle/flat).
- v1 family list (34, all single-pass except the matrix/`reasoning` ones): odd_one_out/remove/extract,
  recolor_largest/majority, skin_dispatch/keep_skin/odd_skin, gravity, fill_holes, denoise, connect_pairs,
  remove_extreme, pipeline, containment, boolean, analogy, count_tally/majority/difference, occlusion,
  raven_matrix/shape, reasoning, {recolor_to,morph_to}×{largest,smallest,unique_color,unique_shape,holed}.

## 🔭 SUGGESTED FIRST MOVES for you (the next agent)
1. Build `arc_search.js`: the bounded-depth compositional **DSL + search solver** first (this is the keystone;
   v1's `solver2.fitAll` ops are good *primitives* to search over — make them composable + searched, not flat).
   Self-test: it must SOLVE a hand-written 3-step task that v1's solver cannot, and FAIL to solve (reject) a
   trivial 1-step task as "too easy" (search finds a depth-1 program → discard).
2. Then a generator that samples *programs* (depth ≥3, with interaction/legend ops + conjunctive rules), renders
   (IN,OUT) over varied scenes, and keeps a task iff: search finds the program, it's UNIQUE, it's under-
   determined (≥3 pairs needed; no 1-pair fit), and a difficulty score ≥ threshold. Score & balance on that.
3. Keep the `prodigy-task` format + ARC-gridline showcase so progress stays visible. Verify in-browser.

## 📌 Standing rules (project conventions — keep)
- Coherence/solvability are the ENGINE's job, never a per-task LLM critic at scale. Program-first; LLM = taste
  (now: propose compositions/distractors). ARC palette; grids ≤30×30 ideal (pretraining can exceed but prefer).
- Commits: **Mario-only**, no Claude/Co-Authored-By attribution (match git history). English-only in code/docs.
- Track on **Linear** (team Panisperna / project "ARC-AGI Series"); KB in **Scintilla** (project below) pushed to
  **Flywheel** (push-only origin). See the Scintilla node `gridvid-difficulty-ceiling-pivot` for the durable
  record of this diagnosis.
- Every module ships a `--self-test`; render a showcase and eyeball before claiming a win.
