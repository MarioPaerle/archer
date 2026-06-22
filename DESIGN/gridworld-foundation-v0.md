---
title: "Gridworld Foundation v0 - composable data DSL, patch tokenizer, objectives"
status: draft - 2026-06-18
tags: [gridvid, data-generation, dsl, tokenizer, training-objective, arc-agi-2]
---

# Gridworld Foundation v0

Goal: build a large grid-world corpus that teaches the model the human priors ARC-AGI-2 is biased toward: objectness, containment, common shapes, movement, collision, grouping, symmetry, counting, rule transduction, and context-sensitive rule application.

The key bet is not "more pixels." It is **programmed worlds with readable cause graphs**:

```
program/DSL -> scene state -> frames -> tasks/objectives -> patch tokens
```

Every sample should keep enough metadata to say *why* it exists: which objects, rules, augmentations, invariances, and target objective it exercises.

## 1. Fluid Sim Contract

Fluid should behave like a simple 2D toy-world substance:

- conservative: cells are not lost except when a source cannot emit because the source cell is blocked.
- stable: no flicker, no dashed standing streams.
- local: fall straight, settle diagonally, spread only from pressure on a supported surface.
- deterministic by default: turbulence only changes tie-breaks.
- cheap: one gravity pass per frame, tiny bounded lateral passes.

The implementation should stay a cellular rule, not a mini Navier-Stokes engine. The model needs a human prior, not physical accuracy.

Regression tests should guard:

- open stream count grows exactly by source rate while unblocked.
- source column stays contiguous.
- basin rows do not become dotted/dashed.

## 2. Composable Data DSL

The current `GRIDVID` scene DSL is a good low-level authoring surface. The missing layer is a **composition DSL** that compiles to scene text and metadata.

### Core Shape

Use a typed AST:

```
Program {
  world: WorldSpec,
  actors: ObjectSpec[],
  fields: FieldSpec[],
  rules: RuleSpec[],
  stages: StageSpec[],
  targets: TargetSpec[]
}
```

This should compile to:

- `scene.txt` for the existing engine.
- `program.json` for provenance, labels, and training targets.
- `video.json` with `meta.program_id`, `meta.concepts`, `meta.augment_trace`.

### Combinators

Keep the DSL small and orthogonal:

- `seq(a,b)`: run stage A, then stage B.
- `parallel(a,b)`: both mechanics active in the same interval.
- `overlay(layer, program)`: render one concept over another.
- `mask(region, rule)`: apply a rule only inside a region.
- `dispatch(key, cases)`: context-sensitive rule by color, shape, count, region, or marker.
- `repeat(n, rule)`: counting/iteration.
- `bind(name, selector)`: infer and reuse an object/color/region.
- `augment(policy)`: attach allowed invariances and wild perturbations.

The point is that generated problems become easy to combine:

```
seq(
  spawn_common_shapes(),
  parallel(gravity(), color_dispatch_by_container()),
  target(next_frame + object_masks + final_rule)
)
```

### Metadata Labels

For each generated sample, store:

- `concepts`: e.g. `["gravity", "containment", "counting"]`.
- `objects`: ids, shapes, masks, colors, layers, initial/final positions.
- `relations`: contains, touches, same-shape, same-color, aligned, mirror-of.
- `rules`: compact DSL tree.
- `invariances`: D4, color permutation, translation, zoom-in, zoom-out, frame-rate.
- `difficulty`: number of objects, rules, dispatch branches, occlusions, distractors.

Without this, training has to rediscover objectness from raw frames. With it, we can train useful auxiliary heads.

## 3. Wild Augmentation

There should be two augmentation classes.

### Pixel-Safe Augmentation

These preserve the exact task semantics:

- D4 transform.
- color permutation with background pinned when required.
- frame stride/fps.
- external zoom-in: duplicate each cell into a `K x K` block.
- external zoom-out: downsample by `K`, with metadata marking information loss.

Zoom-in is useful for scale invariance. Zoom-out is useful only when the task still decodes; treat it as a noisy/coarse view objective, not always as an equivalent label.

### Scene-Wild Augmentation

These resimulate:

- seeds and placements.
- object counts and sizes.
- container dimensions.
- fluid viscosity/turbulence/flow.
- gravity direction/strength where concept-safe.
- distractors and irrelevant layers.
- composition depth.

Scene-wild variants need `augment_trace`, not just "augmented": the model should be able to learn which changes are invariant and which change the output.

## 4. Ordered 2D Shape Tokenizer

The tokenizer must be exactly decodable and hard to generate invalidly.

### Requirements

- Decodes to exact `H x W` grids with colors `0..9`.
- Preserves 2D locality better than row text.
- Has an actual deterministic order, not an implicit sparse bag.
- Has fallback tokens so every grid is representable.
- Allows constrained generation: once `H,W` are known, the decoder knows how many spatial slots remain.
- Works with a non-neural fast encoder.
- Works for images and videos.

### Recommended V0

Use semantic 2D shape tokens first, with fixed-order patches as fallback.

Header:

```
BOS SHAPEGRID H W BG:<color> ORDER:TLBR
```

Main tokens:

- `SQUARE:<color>@r,c:s`
- `RECT:<color>@r,c:hxw`
- `LINE:<color>@r,c:h|v:len`
- `FRAME:<color>@r,c:hxw`
- `PLUS:<color>@r,c:s`
- `LSHAPE:<color>@r,c:hxw`
- `CELLS:<color>@r,c:hxw:<bitmask>` for exact unknown connected components.

Then use a patch fallback for noisy leftovers or dense textures:

```
BOS GRID H W P2 ... P2:<mask>:<digits> ... EOS
```

This keeps common human-known shapes as single tokens while preserving exact decodability.
The V0 order is top-to-bottom, left-to-right by connected-component bounding box. Tokens are sparse
because they carry absolute anchors, color, and shape parameters, but decoding is still deterministic.
Encoding is a normal connected-component scan plus shape matching, O(H*W), with no neural model required.

### Codebook

V0 codebook:

- hand-coded semantic shape atoms for common object priors.
- exact connected-component `CELLS` fallback.
- exact 2x2 patch fallback with boundary masks.
- later: learned frequent multi-object motifs and 3x3/4x4 texture patches.

For video:

- first frame uses normal grid patches.
- later frames use patch deltas: `SAME`, `PATCH`, `XORPATCH`, or changed-cell fallback.

This should greatly reduce stupid generation errors because the model emits legal 2D chunks, not endless raw rows.

## 5. Training Objectives

Do not train only next-token prediction. The data engine knows the cause graph, so use it.

Core objectives:

- `patch_lm`: autoregressive decode of patch tokens.
- `masked_patch`: reconstruct hidden patches from context.
- `next_frame`: predict future frames or frame deltas.
- `inverse_dynamics`: predict the DSL rule/operator that caused a transition.
- `object_aux`: predict object masks, bbox, color, shape id, count.
- `relation_aux`: predict contains/touches/aligned/same-shape/mirror/group relations.
- `equivariance`: D4/color/zoom consistency across augmented views.
- `arc_pair`: given train input/output pairs plus test input, generate test output.
- `dsl_policy_value`: propose DSL operators and score partial programs for search.

Most important: train on **families** of tasks, not isolated videos. The model should see multiple demos generated by the same hidden rule, then predict a held-out instance.

## 6. Curriculum

Use staged generation:

1. Single concept: gravity, containment, symmetry, counting, grouping.
2. One concept plus distractors.
3. Two concepts composed with `seq` or `parallel`.
4. Contextual dispatch: same objects, different rule by marker/color/region.
5. Rule transduction: infer a transformation from examples and apply to new objects.
6. ARC-like few-shot tasks: 2-4 train pairs, 1-2 test inputs.

Hold out entire compositions, not just seeds. Otherwise the model learns the generator's surface bias.

## 7. Immediate Build Order

1. Keep `GRIDVID/engine.js` as the low-level simulator.
2. Add `GRIDVID/program.js`: typed compositional AST -> scene text + metadata.
3. Add `GRIDVID/tokenizer/patch2d.js`: encode/decode grids and videos with tests.
4. Add `GRIDVID/objectives.py` or JS equivalent: convert `video.json + program.json` into training records.
5. Add corpus generation recipes: concept families, composition families, ARC-like pair families.
6. Only then scale volume.

Scaling before metadata and objectives would create a big pile of pretty grids but weak training signal.
