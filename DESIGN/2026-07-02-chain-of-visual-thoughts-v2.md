# Chain of Visual Thoughts v2 — a semi-non-ambiguous visual language

**Status:** v2 core (LOOK/DO + halo) IMPLEMENTED 2026-07-02; margin/scratch + decodability = next stages.
**Trigger:** Mario 2026-07-02 — "for the Chain of Visual Thoughts we should reason more about how to do so,
for now it's completely shit. we should try to make it a very cool and semi-non-ambiguous visual language."

## 1. Why v1 was bad (diagnosis, from looking at real traces)

v1 = one grid per program step, focus cells overwritten with value 10 (white), painted on the POST-state.

1. **The finger covered the object.** Painting 10 OVER the focused cells destroys the very information being
   attended — you see WHERE the model looks but no longer WHAT it sees (a legend swatch turned white is
   useless: its colour WAS the payload).
2. **Attention was painted on the result.** focus was rendered onto the post-action grid: "look at what I
   already changed" — semantically backwards. Humans look, THEN act.
3. **One grid per step is ambiguous.** A single panel conflates observation and effect: given two consecutive
   near-identical grids you cannot tell whether the difference is the attention marker or the action.
4. **Derived values were invisible.** The mental object a deep rule computes (the legend MAP, the containment
   relation, a band's key) never appears anywhere — the most important part of the thought has no visual form.
5. **No step-type signature.** recolor / move / remove / derive all "look the same": some cells changed.

## 2. The v2 language (grid-native, decodable)

Design constraints: everything must live IN the grids (the consumer is a grid model — no captions at
inference); the vocabulary must be small and reserved; a parser must be able to decode a trace back into
(op, focus, effect) — that is what "semi-non-ambiguous" means operationally.

### 2.1 Core grammar (IMPLEMENTED)

A trace is: `INPUT, (LOOK_k?, DO_k)*` — one LOOK/DO pair per program step.

- **LOOK_k** = the PRE-state of step k with a **HALO**: background cells (value 0) 8-adjacent to the focused
  cells get the reserved value **10** (white). Object pixels are NEVER overwritten — the finger points at the
  thing without covering it. Steps with no focus (pure actions like erase_legend) omit their LOOK.
- **DO_k** = the clean POST-state of step k. No markers.
- **Decoding rule:** a panel containing value 10 is a LOOK (attention = the objects enclosed by the halo);
  a panel without 10 following a LOOK is its DO; the step effect is exactly diff(LOOK − halo, DO).
  This makes the trace round-trip decodable with a trivial parser — ambiguity is now a measurable bug.

### 2.2 Next stages (designed, not yet implemented)

- **S1 — scratch margin (working memory):** reserve a margin strip (top, separated by one empty row) where
  DERIVE steps WRITE their derived value in a canonical miniature form: the legend map as src→tgt swatch
  pairs, a containment relation as (frame-colour, object-colour) dot pairs, a band key as a single swatch,
  a count as a tally bar. The margin is erased by the step that CONSUMES the value (visual working memory
  with an explicit lifetime). Cost: +1–3 rows per grid; the margin position is fixed ⇒ still decodable.
- **S2 — step-type signatures:** LOOK panels already differ (halo). Distinguish DERIVE-LOOK (halo, margin
  write) from SELECT-LOOK (halo only) from pure ACT (no LOOK). If a second reserved value is affordable in
  the tokenizer (11), use it for "changed in this step" ghost-marks in a POST panel — decide only after
  measuring whether LOOK/DO diffing is already sufficient for the trainee.
- **S3 — the decodability metric:** a `decodeTrace(grids) → program-sketch` parser in the engine; corpus CI
  asserts round-trip ≥99%. "Cool" is subjective; decodable is not — this is the gate that keeps the language
  honest as it grows.
- **S4 — GIF tier stays separate:** physics/dynamics keep frame sequences; CoVT is the SOLVE-tier language.

## 3. Reserved vocabulary

| value | meaning | constraint |
|---|---|---|
| 0 | background | — |
| 1–9 | ARC content colours | task semantics only |
| 10 | ATTENTION (halo) | only on bg cells, only in LOOK panels |
| margin strip | derived working memory (S1) | fixed location, canonical mini-forms |

## 4. What this buys

- The white "pointing" reads like a human finger circling the relevant objects — visible AND non-destructive.
- LOOK→DO adjacency makes every effect locally inferable (next_frame-style supervision falls out for free).
- Deep rules (legend/containment/bands, Dchain≥2) get proportionally LONGER traces with alternating
  look/act rhythm — the "thinking" is visibly the dependency chain, not a slideshow of near-identical grids.

Implementation: `program.js` runWithTrace (preScene per step) + buildProgramTask (paintHalo, phase field) +
`build_trace_showcase.js` (LOOK panels dashed-cyan, 👁 label). Every trace entry keeps `focus` as a cell list
(training attention signal) and `phase ∈ {input, look, do}`.
