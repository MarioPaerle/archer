---
title: "IQ-tests → DSL: mining human-prior transformations into GRIDVID primitives"
status: draft - 2026-06-20
tags: [gridvid, dsl, priors, iq-tests, data-generation, arc-agi-2]
---

# IQ-tests → DSL

Goal: widen the GRIDVID generator with the **human-prior transformation types** that classic
non-verbal intelligence tests are built on, so a small model + procedural sampler can author
**more, and more interesting,** ARC-AGI-2-style tasks. North star (per `GRIDVID/HANDOVER.md`):
we **teach the priors** ARC-AGI-2 leans on — we do NOT replicate the eval distribution.

> **Method & integrity.** Synthesised from 4 parallel research agents (2026-06-20), one per domain:
> matrix-reasoning, figural series/analogy, spatial/visualization, concept-induction/Bongard.
> Every cited instrument was verified at a real URL (sources at the bottom). Per the KB golden rule
> (`AGENT.md` §1) and copyright policy: **no copyrighted test item is reproduced** — only the abstract,
> modality-independent *transformation type* is re-encoded. Proprietary instruments (ETS VZ-2, Raven,
> Kohs, DAT, MRT) are cited via secondary/open descriptions; exact item parameters vary by version.

## 1. The perceptual attribute axes
Per the figural-analogy taxonomy (arXiv 2201.08450) and NNAT/OLSAT item analyses, every non-verbal
rule operates over six modality-independent attributes:

**shape · size · color/shading · number/count · position · orientation**

This is exactly the set the augmenter must vary as **incidental** features (instance variation) while
holding the rule's axis fixed — the "vary every non-rule feature" discipline, now grounded in the
test-design literature.

## 2. Coverage verdict vs the current DSL
**Already strong (don't re-invent):** rotation/reflection (`grid_rotate`, `copy rot/flip`), symmetry
completion (`mirror` + reconstruct/repair templates), tiling (`copy times`, `lattice`, `mesh`, `wave`),
counting/comparison (`tally`, `count`, `keep_bigger`), grouping (`magnet`, `voronoi`), size/seriation
(`largest`/`smallest`, `arrange by`, `zoom`/`double`), odd-one-out construction (`corrupt`, `odd_shape`,
`find_error`), Latin-square-on-color (`solve`), motion series (`path`, `turtle`, `move by`, `conveyor`),
mental-animation dynamics (physics layer).

**The structural gaps the tests reveal (high-value, ranked):**

| # | Missing capability | Why it matters | Flagged by |
|---|---|---|---|
| 1 | **`dispatch` (context-sensitive rule)** + a **predicate/detector** layer | THE #1 ARC-AGI-2 difficulty driver; turns a fixed per-template rule into a *conditional* one. Without it no Bongard/classification task is encodable. | all 4 agents |
| 2 | **Boolean figure-algebra** (`or/xor/and/sub` of two cell-masks) | Carpenter's signature "figure addition/subtraction" + the entire PGM XOR/AND/OR family; we have **zero** boolean combinators today | matrix, series |
| 3 | **Detector predicates** (classify what we can only construct) | We *build* symmetry/convexity/contours but cannot *test* them → no classification tasks | Bongard, spatial |
| 4 | **Analogy as first-class** (`bind_transform`→`apply`) + series (`iterate`/`cycle`/`progress`) | Names the core ARC mechanic "infer transform from a pair, re-apply"; enables true abstract-feature series (today's series are mostly physics) | series |
| 5 | **`fold`/`unfold`** (iterated reflect-across-crease) | Cleanest missing pure-symmetry prior; `mirror` can't iterate across stored fold lines | spatial |
| 6 | **`find` (embedded-subpattern search)** | Figure-ground / template-match-under-rotation; `extract` only filters by attribute, never *locates* a subshape | spatial |
| 7 | **part↔whole** (`assemble` / `tile_cover`) + **`section`** | Block-design ↔ form-board are inverse decomposition/synthesis; no covering/assembly operator exists | spatial |
| 8 | **distribution/matrix completion** beyond color (`distribute3`, `grid_complete sym`, generalize `solve`) | Raven distribution-of-three on shape/orientation, symmetry completion | matrix, series |

## 3. Proposed new primitives (the build)
Grouped into coherent buildable units. Each is tracked as a Linear issue (team Panisperna) — see
`../LINEAR.md` for the live ids. All consume the existing selector grammar (`color/shape/largest/at/all`).

### G1 — Boolean figure-algebra
- `combine SEL_a SEL_b op or|xor|and|sub [into R C] [color C]` — cell-wise boolean of two bodies' occupancy → new body.
- `overlay_figs SEL_a SEL_b at R C [overlap C]` — layered union keeping both, shared cells get `overlap` color (≠ xor cancel).
- *Sources:* Carpenter addition/subtraction; PGM XOR/AND/OR. *Realizes the `overlay`/`mask` combinator of `gridworld-foundation-v0.md` §2.*

### G2 — `dispatch`/`classify` + predicate registry  *(keystone; concrete core of the PAN-119 combinator layer)*
- `dispatch on PRED / case V → body / … / end` — route per-object to a branch by a predicate/feature value.
- `classify SEL by PRED into A B at R C` — marker-output encoding (paint class-token color at R C). The faithful encoding of Bongard left/right classification.
- A **predicate registry**: pluggable detectors evaluated over `world.bodies` at parse time, reused by `dispatch`/`classify`/selectors.

### G3 — Detector predicates  *(feeds G2; mostly cheap geometry over bodies)*
- Cheap (pure geometry): `orientation` (w>h), `is_convex` (hull==filled), `is_symmetric axis h|v|rot`, `parity` (even/odd count), `subitize` (≤4), `same_count A B`.
- Harder (connected-components): `is_connected`, `has_loop`, open-vs-closed contour, `collinear [tol T]`.
- *Sources:* Bongard abstract (HD) tier — convexity/symmetry/topology; Gestalt closure/continuity; numerosity/subitizing.

### G4 — Analogy + series + odd-one-out
- `bind_transform NAME from SEL_a to SEL_b` + `apply NAME to SEL_c` — infer the delta of a pair, re-apply (the A:B::C:? mechanic; foundation `bind`).
- `iterate <verb-template> times K` — emit K successively-transformed frames (true monotone series); `cycle SEL through V1 V2 … over color|orientation|fill` (period-k alternation); `progress SEL attr size|count|hue|pos step K` (arithmetic series on one attribute).
- `odd by PROP` selector (`PROP ∈ shape|color|size|count|symmetry`) — matches the single body whose PROP differs from the modal value; composes with `extract`/`remove`/`recolor`.
- *Sources:* visual analogy (arXiv 2201.08450), figural series (Nibcode/OLSAT/NNAT), classification/odd-one-out (11+/CFIT).

### G5 — Spatial I: fold/unfold + embedded-figure search  *(highest-value spatial gaps)*
- `fold SEL axis h|v at K` — reflect content across crease K, keep one side (the folded input).
- `unfold SEL folds (h|v at K)…` — for each fold line, reflect ALL marks across it and union; replay reverse-order = unfolding (Paper Folding VZ-2).
- `find SUBSHAPE in SEL [rot] → highlight C` (+ `extract_match`) — locate occurrences of a subpattern inside a busier figure, optionally under rotation/reflection (Gottschaldt/Witkin embedded figures).

### G6 — Spatial II: part↔whole + 2D section  *(3D limits flagged)*
- `tile_cover SEL with TILESET` — partition a region into typed blocks (Kohs block design); inverse `assemble SEL into R C` — translate/rotate fragments to interlock into a target (Minnesota Form Board / WAIS Visual Puzzles).
- `section SEL line h|v|diag at K` — output the profile the cut line crosses (2D cross-section).
- `fold_net SEL` — **partial**: output the 2D face-adjacency/opposite relabeling of a cube net. **Do NOT fake 3D** — a flat 10-color grid has no depth axis; mark 3D solids/viewing-angle out of scope in `meta`.

### G7 — Distribution / matrix completion
- `distribute3 SEL_SET over rows cols at R C` — categorical Latin-square panel (built on existing `solveLatin`); a `none` member subsumes distribution-of-two.
- `grid_complete sym h|v|rot180|periodic` — blank a region, fill as the symmetric/periodic completion of the rest.
- Generalize `solve` beyond color to `solve by shape|orientation` (Latin symbol = any categorical feature).
- *Sources:* Carpenter distribution-of-three; NNAT pattern completion.

## 4. Build order
1. **G2 + G3** (dispatch + the cheap predicates) — ✅ **DONE 2026-06-22 (PAN-125/126).** `dispatch SEL by PRED / case / default / end`
   (per-object conditional binding `it`), `classify SEL by PRED into A B` (Bongard scene→class), `where PRED [is V]` selector, and a
   `PREDICATES` registry (convex(hull==filled)/symmetry/symmetric/loop/holes/connected/collinear/parity/orientation/size_class/kind/color)
   + `evalPred`, all in `engine.js`. Library +4 (dispatch_symmetry/holes/convex, classify_convex). Self-test 86. As predicted, selectors +
   marker-output already existed, so the engine work was small. *Note:* `is_symmetric axis h|v|rot` shipped as a categorical `symmetry`
   predicate (h|v|hv|rot|none) + boolean `symmetric`; `subitize`/`same_count` (relational/world-level) deferred to G4.
2. **G1** (boolean algebra) — ✅ **DONE 2026-06-22 (PAN-127)**: `combine SEL_a SEL_b op or|xor|and|sub` + `overlay_figs`. Realizes `overlay`.
3. **G4** (analogy/series/odd) — ✅ **DONE 2026-06-22 (PAN-128)**: `odd [by PROP]` selector + `bind_transform`/`apply` (analogy) + `progress`
   (arithmetic series). `iterate`/`cycle` deferred (lower ROI, awkward in the cut-based task model).
4. **G5** (fold/unfold + find) — **PARTIAL 2026-06-22 (PAN-129)**: `unfold (h|v at K)+` (paper-folding VZ-2) shipped + template; `fold`/`find`
   (embedded-figure) deferred.
5. **G7** (distribution completion) — **DONE 2026-06-22 (PAN-131)**: `grid_complete h|v|rot180|diagonal` (Raven symmetry completion).
   `distribute3` ≈ existing `solve` (Latin on colour); `solve by shape` n/a (the int-grid is colour-only).
6. **G6** (assemble/tile_cover/section) — most engine work; deferred (PAN-130), keep 3D out of scope.

## 5. Sources (verified 2026-06-20)
**Matrix-reasoning:** Carpenter, Just & Shell (1990) via Verguts & De Boeck 2002
(https://ppw.kuleuven.be/okp/_pdf/Verguts2002TIOSR.pdf); RAVEN (https://arxiv.org/abs/1903.02741);
PGM (https://www.tensorflow.org/datasets/catalog/abstract_reasoning); Cattell CFIT
(https://www.cogn-iq.org/learn/tests/cattell-culture-fair/).
**Series/analogy:** Automatic Item Generation of Figural Analogies — review (https://arxiv.org/abs/2201.08450);
NNAT (https://www.testprep-online.com/nnat-question-types); OLSAT figural
(https://www.testingmom.com/tests/olsat-test-5/sections/figural-reasoning/).
**Spatial:** Paper Folding VZ-2 (https://www.cs.otago.ac.nz/brace/resources/Paper%20Folding%20Test%20Vz-2-BRACE%20Version%2007.pdf);
Mental Rotation (https://en.wikipedia.org/wiki/Mental_Rotations_Test); Kohs Block Design
(https://en.wikipedia.org/wiki/Kohs_block_design_test); Minnesota Paper Form Board
(https://en.wikipedia.org/wiki/Minnesota_Paper_Form_Board_Test); Embedded Figures
(https://www.ncbi.nlm.nih.gov/pmc/articles/PMC9349202/); SpatialViz-Bench (https://arxiv.org/pdf/2507.07610).
**Concept-induction:** Foundalis Bongard index (https://www.foundalis.com/res/bps/bpidx.htm);
BONGARD-LOGO NeurIPS 2020 (https://proceedings.neurips.cc/paper/2020/file/bf15e9bbff22c7719020f9df4badc20a-Paper.pdf);
Bongard-in-Wonderland (https://arxiv.org/pdf/2410.19546); Gestalt principles
(https://pressbooks.online.ucf.edu/lumenpsychology/chapter/gestalt-principles-of-perception/);
Piaget seriation/conservation (https://www.simplypsychology.org/piaget.html).

> Honest caveat: the Foundalis per-BP concept labels are indicative groupings from the index page,
> not item-by-item verified. The transformation *families* are well-attested across the cited sources.
