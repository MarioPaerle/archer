---
title: "Human-Prior DSL — subagent congress synthesis (2026-06-28)"
status: design
tags: [gridvid, dsl, shapes, construction, solver, human-prior]
---

# Human-Prior DSL — congress synthesis

A 4-agent design congress (shape librarian, construction architect, prior taxonomist, adversarial critic)
on "way more shapes + a working Human-Prior DSL with endless possibilities." Verdict below; it diverged
sharply and the critic ran the real code.

## The governing law (critic, empirically verified)
`solver.js segObjects` = **an object IS a 4-connected non-bg blob**. There is no notion of "a shape"
downstream of pixels. Consequences, proven by execution:
- `Zshape`, `arrow`, `fork` (already in `skins.SHAPES_ALL`) **split into 3 objects today** — a live bug.
- spirals / thin-arm stars / disconnected glyphs / multi-part composites **shatter** into phantom objects.
- skins round-trip ONLY on **solid** footprints (`square/diamond/disc/rect`); on hollow/thin → "plain"/"unknown" → rejected.
- the only solver-recoverable features are: `color, area(size), hasHole, orientation, sizeRank, skin∈8, silhouette` + odd-one-out by {color,shape,size,skin}. **A shape with no solver hypothesis = decoration.**

## The real bottleneck (taxonomist)
It is **solver2's hypothesis set, not the shape count.** engine.js already has `dispatch/classify/combine
(or/xor/and/sub)/bind_transform/apply/unfold/grid_complete` but **solver2 cannot re-derive any of them**, so
they never become verified tasks. "More shapes" mostly aliases onto ~10 equivalence classes.

### The 6 priors to build (shape + construct + MATCHING solver hypothesis, as triples)
1. **Containment / inside-outside** — frames/rings exist; add an inside/outside selector + "recolor/keep/remove inside", "count contained", containment as a dispatch predicate. (#1 under-served high-ARC prior.)
2. **Counting / numerosity** — tally/pip/N-dots + "recolor by count", "output N", "odd-by-count". solver2 cannot count at all.
3. **Context-sensitive dispatch (marker-keyed)** — engine has it; add a solver hypothesis that re-derives a marker/region→branch map. The #1 ARC difficulty driver.
4. **Boolean figure-algebra (A op B)** — `combine` is built in engine, verifiable nowhere; add a two-panel scene + `out = A xor/and/or/sub B` hypothesis.
5. **Analogy (bind→apply)** — `bind_transform/apply` exist; add demo-pair scene + a per-pair-delta hypothesis. THE canonical ARC mechanic.
6. **Occlusion / completion-behind** — fully absent end-to-end; recover-hidden-via-symmetry, remove-occluder, split-overlap.

## The creative surface (architect) — SHIPPED as `construct.js`
A closed **Part algebra**: `Part = {cells:[[r,c,color]], h, w}`. Combinators
`atom · pixels · reflect · rotate · recolor · attach · overlay · stack · row/col/grid_of · ring_of · mirror ·
rotate_copies · nest · grow`, each Part→Part ⇒ combinatorial closure (atoms × anchors × loops × symmetry ×
recursion; `grow` makes it genuinely infinite). New solid single-blob shapes: filled `ngon(n)`, `star(k)`,
`heart`, `trapezoid`, `parallelogram`, `halfDisc`, `digit` (3×5 font). Thing library (flower/pine/tree/house/
robot/snowflake/gear/ladder/fish/sun/star/heart/key/butterfly/digit/polygon), each parametric → a family.
Gallery: `build_construct_gallery.js`. A `connected(part)` gate enforces the critic's single-blob law.

## Build plan
- DONE: `construct.js` creative DSL + gallery (the "endless things" surface). Shapes here, rules on top.
- NEXT (the real lever): wire construct → the 6 priors by adding solver2 hypotheses, in ROI order
  **3 (dispatch) · 4 (boolean) · 5 (analogy)** (solver-only work over existing engine primitives), then
  **1 (containment) · 2 (counting)** (cheap shapes + selector), then **6 (occlusion)** (end-to-end).
- Also: purge/fatten `Zshape/arrow/fork`; add a single-blob assertion gate in `makeSkinned/skinScene`.
- Measure success by **distinct solver `rule` strings per 1000 attempts**, NOT shape count.
