---
title: "GRIDVID corpus design — the mechanism space for a search-verified ARC-AGI-2 pretraining corpus"
date: 2026-06-29
status: plan (read before building any more generators)
supersedes: the ad-hoc "add one generator at a time" approach that produced an all-gravity then all-symmetric corpus
---

# Why this document exists

We built the pivot keystone (`arc_search.js`) and two generators (`gen_search`, `gen_underdetermined`). Both
work and are search-certified — but each is **one mechanism**, so the galleries look monotonous ("everything is
gravity", then "everything is symmetric"). Re-weighting a single generator's ops is **whack-a-mole on the costume,
not the play**. A real ARC-AGI-2 pretraining corpus needs a *planned set of rule families* spanning the actual
difficulty axes, each made certifiable, then balanced. This doc is that plan.

---

## 0. The architectural law (the thing the whole pivot turns on)

> **Every generative mechanism MUST ship a matching SEARCH primitive, co-designed.**

There are exactly two failure modes, and they are opposite:
- **Unrepresentable → discarded (the v1.0 wall).** If the verifier can't express a mechanism, every task using it
  fails `solvable()` and is thrown away. Result: only trivial tasks survive. (This is what killed v1.)
- **Recognized → ceiling (the v1.5 wall).** If you make the verifier a *flat pattern-matcher* for the mechanism,
  the hardest emittable task = the hardest single pattern it matches. (This is *why* v1 was ARC-1-easy.)

The sweet spot is the only escape: the primitive is **composable and searched**, so difficulty = the **search
horizon**, not a template. Adding a family = adding (a) a generator that plants it AND (b) a search primitive the
solver composes over. Neither alone.

---

## 1. The difficulty model — six orthogonal axes

ARC-AGI-2 is hard because a task can be hard along *several independent* axes at once. A task's difficulty vector
is `(A,B,C,D,E,F)`; the corpus must cover the *space*, not pile depth on one axis.

| Axis | Name | What it means | How we certify it | Status |
|---|---|---|---|---|
| **A** | Compositional depth | rule = `f₁ ▷ f₂ ▷ f₃…`, no shorter program fits | minimal solving depth in `arc_search` | ✅ have |
| **B** | Under-determination | no 1 (or 2) train pairs reveal the rule; ≥3 coupled observations needed | `obsNeeded` (fit on first-k pairs, must pin) | ✅ have (1 family) |
| **C** | Interaction / symbol-grounding | one region *reprograms* the transform elsewhere; op B depends on op A's *result* | search primitive that reads a key region / data-dependent branch | ❌ **gap — top priority** |
| **D** | Selection complexity | "which object" is conjunctive (`A∧B`) or relational ("left of the largest") | a searched selection sublanguage; uniqueness fails for single-feature rivals | ❌ gap |
| **E** | Abstraction / novel concept | rule invokes a concept inferred fresh: counting, arithmetic on attributes, topology, periodicity | concept-specific primitive (count→render, containment, periodic-fill) | 🟡 partial (v1 has tally/containment/occlusion, not searched) |
| **F** | Representation variation | grid size, panel count, palette, noise/distractors all varied so surface cues don't leak the rule | incidental-feature randomization + distractor rejection (rule out rivals) | 🟡 partial (`gen_search` varies scenes; no distractor model) |

**Corpus balance is over this vector.** A task scoring high on A but zero on B/C/D is a "deep shuffle" — exactly
today's monotony. We want mass spread across the axes and their *combinations*.

---

## 2. The rule-family catalog

Each family is a generator + a search primitive. "Under-det handle" = the knob that pushes axis B for that family.

| # | Family | Axes | Search primitive needed | Under-det handle | Status |
|---|---|---|---|---|---|
| F1 | **Geometric/structural pipeline** (flip/rot/gravity/fill/outline/denoise/connect) | A | composable nullary ops (have) | — (deterministic) | ✅ `gen_search` |
| F2 | **Per-attribute dispatch map** (attr→action): colour→colour *(have)*, size→action, hole→action, shape→action | A,B | fit a map over a chosen attribute (generalise `fitColorMap`; v1 `groupby` is the skeleton) | split attribute values across pairs | 🟡 colour only |
| F3 | **Legend / key region (symbol grounding)** — a margin strip / sub-grid encodes the mapping applied to the rest | **C**,E | deterministic op that *parses* the key region, then applies it; searched as one step | legend shown *partially* per pair → must be completed cross-pair | ❌ **build next** |
| F4 | **Conjunctive / relational selection** then transform — select by `A∧B` or by relation to an anchor | **D**,A | a small searched predicate language over object attrs + relations → action | make single-feature selectors ambiguous (need the conjunction) | ❌ |
| F5 | **Data-dependent branch / interaction** — compute a property of the input, branch the transform on it | **C**,E | predicate-gated program: `if pred(g) then p₁ else p₂`, pred searched | the branch only fires in some pairs → need to see both arms | ❌ |
| F6 | **Counting / arithmetic on attributes** — output encodes a count, difference, or tally | E | count/arith primitive → render (v1 `tally`,`countDiff`) made composable | the arithmetic relation hidden until ≥3 magnitudes seen | 🟡 v1 unsearched |
| F7 | **Topology — containment / connectivity / path** — inside/outside, enclosure, walk a path | E,A | searched predicates: `contains`, `connected`, `on-path` | which topological relation is the rule is ambiguous from 1 pair | 🟡 v1 `containment` |
| F8 | **Pattern completion / occlusion repair** — infer periodicity/symmetry, fill a masked region | E | symmetry/period detector → fill primitive (v1 `deocclude`,`completeSym`) | the period/axis only determined after enough of the pattern is seen | 🟡 v1 unsearched |
| F9 | **Analogy** `A:B :: C:?` — infer transform from one panel, apply to another | A,E | panel-split + transform-infer (v1 `analogy`) made searched | the analogy transform under-specified by one panel pair | 🟡 v1 unsearched |

**The pattern:** v1 already *generated* F6–F9 — but with flat recognizers, so they were ARC-1-easy. The work is not
to re-invent them; it is to **port their primitives into the searched DSL** (so depth/composition/under-det stack on
top) and add the genuinely missing C/D axes (F3, F4, F5).

---

## 3. The composition grammar — how a task is built

A general task is a pipeline, each stage optional, every stage a searched primitive:

```
TASK :=  render(  SCENES_with_varied_incidental_features  )  where
         OUT  =  [ LEGEND? ▷ ]  SELECT?  ▷  TRANSFORM⁺  [ ▷ MAP_by_attr? ]  applied per the rule
         subject to:  arc_search certifies it  (see §4)
```
- `SELECT` (F4): restrict to the object(s) the rule acts on (conjunctive/relational).
- `TRANSFORM⁺` (F1): one or more structural ops; depth drives axis A.
- `MAP_by_attr` (F2): a learned attribute→action map; drives axis B.
- `LEGEND` (F3) or `BRANCH` (F5): a region/predicate that *governs* the above; drives axis C — **the ARC-2 hallmark.**
- Incidental features (colour assignment, positions, grid size, decoy objects) **randomized across examples** so the
  model can't shortcut on surface form (axis F; cf. the standing "vary incidental features" rule).

This grammar is what makes tasks *combinatorially* diverse instead of one-template: a task is a *point* in
`SELECT × TRANSFORM × MAP × LEGEND × SCENE`, not a family name.

---

## 4. The universal certification filter (every task, every family)

A task is kept **iff** `arc_search` (extended per family) reports:
1. **Solvable** — a program reproduces all train pairs.
2. **Deep** — minimal solving depth `≥ minDepth` (default 3); *no shorter program fits* (proven by the search).
3. **Determined & covered** — minimal programs agree on the test AND the test exercises no unseen attribute/branch
   (an uncovered test ⇒ genuinely ambiguous ⇒ reject, don't fake — already enforced for colour maps).
4. **Under-determined** — `obsNeeded ≥ k` (default 3) where the family supports it.
5. **Baseline-hard** — fails `baseline.trivialSolve` (no identity/copy/recolour-constant degenerate).
6. **Distractor-robust** *(new)* — at least N *rival* hypotheses are ruled out only by the full train set (the
   search already finds rivals; count the depth-≤d programs that fit a strict subset but break on the rest).

Output a **difficulty score** `= w_A·depth + w_B·(obs−1) + w_D·selectionComplexity + w_C·hasInteraction + w_E·conceptRank + w_F·sceneVariance − rivalsLeftUnruled`. Balance the corpus on the **score AND the axis vector**.

---

## 5. Diversity guardrail (so we never get "all-gravity / all-symmetric" again)

The monotony we just hit is a *corpus-assembly* bug, not a generator bug. The assembler must:
- enforce **per-family and per-primitive quotas** (no op/family exceeds, say, 25% of the corpus),
- **stratify** sampling across the axis vector and score bands,
- **LOG the realized distribution** every build (op histogram, axis coverage, score histogram) — *no silent caps*
  (cf. the standing "no silent truncation" rule). The galleries already print an obs histogram; extend that to a
  full op/family/axis dashboard and fail the build if any bucket is empty or any op dominates.

The "everything is X" symptom is then a **build-time assertion failure**, caught before a human ever sees it.

---

## 6. Prioritized roadmap

1. **F3 — legend / symbol-grounding** *(the missing axis-C hallmark; highest value).* Design: a key strip (e.g.
   left margin column of `[src|tgt]` rows, or a small sub-grid) that the op *parses* into a mapping/instruction and
   applies to the working area; the working area carries no other cue. Search primitive: `apply_legend(g)` reads the
   strip deterministically (zero branching) → composes in the existing BFS. Under-det variant: legend shown
   partially per pair. Self-test: solve a legend task v1 can't; reject one with no legend; reject one whose test
   needs a legend entry never shown.
2. **F4 — conjunctive/relational selection.** A tiny searched predicate language (`color=c ∧ size=large`,
   `left-of(anchor)`) feeding the existing transforms; uniqueness must require the conjunction.
3. **Generalise F2** beyond colour (size/shape/hole dispatch) — cheap, reuses `fitColorMap` shape.
4. **Port F6–F9 primitives into the searched DSL** (counting, containment, occlusion, analogy) so they stack with
   A/B/C instead of being flat one-liners.
5. **Corpus assembler** with the §5 guardrail + §4 filter + §4 score; this is what produces the *actual* corpus and
   the dashboard. Build it once F3/F4 exist so it has real variety to balance.
6. **LLM as taste** (last): propose novel *compositions* and *adversarial distractors* over this grammar; engine
   verifies. Never a per-task LLM critic at scale.

## 7. What stays fixed (anchors)
- `arc_search` is the single certifier; every family extends its DSL, nothing bypasses it.
- `prodigy-task` JSON format + ARC-gridline showcase (`build_search_showcase`) for every family.
- Commits Mario-only, English-only, `--self-test` per module, eyeball before claiming a win.
- Durable record: Scintilla `gridvid-difficulty-ceiling-pivot` → Flywheel; Linear ARC-AGI Series.
