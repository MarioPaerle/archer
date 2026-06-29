---
title: "GRIDVID corpus architecture — synthesis of the 6-agent congress"
date: 2026-06-29
status: the buildable plan (supersedes the ad-hoc generators; extends CORPUS_DESIGN.md)
inputs: 6 congress agents — concept taxonomist, grammar architect, search-scaling architect, brute-force adversary, diversity adversary, human-likeness adversary
---

# The unified plan: a human-like ARC-AGI-2 puzzle generator at scale

A 6-agent congress (3 proposers, 3 adversaries) audited the code + the ARC-AGI-2 spec. This is the synthesis.
It replaces "add one generator per mechanism" with a **single pipeline**: a broad concept library → a
composition grammar with interaction → a stratified sampler → **two-tier anti-reflexive certification** →
human-likeness curation → a diversity-controlled corpus. Every claim below is grounded in the agents' reports.

---

## 0. THE HONEST TARGET (reconciling "50k semantically different")

The diversity adversary's verdict, accepted: **50,000 *semantically distinct concepts* is not reachable** with
any DSL of this kind — and claiming it would be the DualNorm=Adam-mini trap in corpus form. The honest decomposition:

> **A corpus = CONCEPTS × INSTANCES.** A *concept* is a normal-form rule signature (NFRS, §6). An *instance* is
> the same concept re-rendered with different incidental features (colour, position, size, count, seed). ARC
> corpora (RE-ARC) scale by instances; ConceptARC counts ~16 concept *groups*. Incidental variation is **mandatory
> training volume but NOT diversity.**

Honest reachable concept ceiling:
- **Today (≈16 searched primitives, all "rearrange pixels"): ~150–300 distinct concepts.**
- **With the full concept library + interaction grammar built (this plan): ~600–1,500 distinct concepts.**
- **Hard target: ~50,000 TASKS = ~1,000 concepts × ~50 instances each** — and the build **must print that sentence**
  (`effectiveConceptCount` + the instance ratio). 50k *tasks* is easy and legitimate; 50k *ideas* is not, and we
  will not pretend otherwise. The lever for more *ideas* is breadth + interaction (§3, §4), not a sampler tweak.

This is the number we commit to and report. The diversity metric (§6) makes it auditable.

---

## 1. THE TWO STRUCTURAL FLAWS THE CONGRESS FOUND (and the fixes that drive everything)

**Flaw A — Reflexivity: the certifier IS the difficulty ceiling (brute-force adversary).** Today: *kept ⟺ our
depth-3 BFS over our ~24-op DSL solves it uniquely.* So the corpus is **exactly** the enumerable set of
depth-≤3 programs in a *published, fixed* DSL — a competitor's depth-4 search over a superset cracks ~95–100% of
`gen_search`/`gen_compositional`. Difficulty was *pinned to our own horizon by definition.* This is fatal and is
the top priority to fix.

**Flaw B — Monotony / thin breadth (concept + diversity adversaries).** We search ~16 of ~150 nameable concepts,
all in the "rearrange pixels" cluster (geometry/gravity/morphology). The four ARC-2-*defining* families —
**counting, symbol-grounding-beyond-colour, relational selection, data-dependent interaction** — are at **0%**.
3 generators ≈ 3 meta-concepts. "All-gravity → all-symmetric" is the generic behaviour, not a one-off bug.

The two fixes (anti-reflexive certification §5; breadth+interaction §3–4) are the spine of the plan.

---

## 2. THE PIPELINE (six stages, each owned by one agent's contribution)

```
 CONCEPT LIBRARY (breadth)         §3   ~40+ searched primitives across ~12 families
        │
 GRAMMAR + INTERACTION (multiplier)§4   RULE := SEQ | (GOVERNOR ⇒ RULE); 3 governors
        │
 STRATIFIED SAMPLER (anti-collapse)§4   288 buckets, conditioned derivation, hard quotas
        │
 TWO-TIER CERTIFICATION (hardness) §5   arc_search (well-posed) ∧ ¬arc_attack (not cheaply cracked)
        │
 HUMAN-LIKENESS CURATION           §7   C0–C8: wmLoad≤4, salient, human-unambiguous, LLM-taste
        │
 DIVERSITY CONTROLLER (honesty)    §6   NFRS dedup, per-class caps, build-fail guardrails, ratio disclosure
        │
 SHOWCASE / QA LOOP                §8   humanRule sentence + dashboards; Mario in the loop
```

---

## 3. CONCEPT LIBRARY — breadth first (concept taxonomist)

~150–165 nameable base concepts exist across 16 families; we search ~16. **Breadth must come first — composition
multiplies breadth, it cannot create it.** Build these missing families as *searched, composable* primitives
(architectural law). Priority by (distinctness × human-naturalness × feasibility):

| Pri | Family | Why | Search primitive |
|---|---|---|---|
| 1 | **Counting / number (T4)** | whole Core-Knowledge prior absent; cheap | `count_render(attr,mode)`: count objects/colours/holes → render bar/column/parity |
| 2 | **Boolean / set logic (T7)** | classic ARC, cheapest, absent | `panel_split` + `bool_combine(AND/OR/XOR/NAND/diff)` |
| 3 | **Symbol-grounding beyond colour (T9)** | THE ARC-2 hallmark; we have only colour-recolour | `apply_op_legend`: key → operation/count/template, not just colour |
| 4 | **Relational/conjunctive selection (T10)** | axis-D; forces under-determination | `select(pred)` over attrs+relations, conjunctions |
| 5 | **Topology: containment/connectivity (T3)** | Core prior; only `fill_holes` today | `contains/encloses/flood_from_seed/keep_closed` |
| 6 | **Pathfinding / lines / rays (T13)** | common motif, visually distinct | `connect/ray_from/shortest_path` |
| 7 | **Data-dependent branch (T11)** | axis-C interaction, deepest distinctness | `branch(pred,p_a,p_b)` (a program node, §5/§4) |
| 8 | **Arithmetic on attributes (T5)** | quantitative reasoning | `attr_arith(a,op,b)→action` |

Then port v1's flat F6–F9 (occlusion, analogy, ordering, rotational-symmetry, simulation-beyond-gravity) into the
searched DSL. Each new *non-collapsing atomic class* multiplies the composition space.

---

## 4. GRAMMAR + INTERACTION — the multiplier (grammar architect)

SEQ (sequential chaining) alone → **~10k tasks and they feel the same** (the monotony we lived). **Interaction is
what carries past 50k AND makes tasks feel different**, because each interaction instance is a different reasoning
problem.

```
TASK     := RENDER(SCENESPEC, RULE)
RULE     := SEQ | (GOVERNOR ⇒ RULE)            # interaction is FIRST-CLASS
GOVERNOR := LEGEND | PROBE | ANCHOR
SEQ      := STAGE (▷ STAGE)*ـ                    # STAGE := SELECT? ▷ TRANSFORM⁺ ▷ MAP?
```
Three governors, each **collapsed into a single searchable composite node** so the BFS is unchanged:
- **LEGEND ⇒ TRANSFORM** (symbol grounding, axis C): a key region parses into the *parameters* of the rule
  (which transform, which colour-map, which direction) — generalises today's recolor-only `apply_legend`.
- **PROBE ⇒ BRANCH** (data-dependent, axis C/E): compute `π(g)` (count parity, has-hole, dominant colour) →
  run `p_a` else `p_b`. **This single form is ~23k of the semantic budget.**
- **ANCHOR ⇒ SELECT** (relational, axis D): a probe picks an anchor; selection is *relative* ("left of the largest").

**Sampler (structurally prevents collapse):** stratify over **288 buckets = 6 interaction-types × 12 concepts ×
4 difficulty-bands**, *condition* the derivation on the bucket (don't sample-then-reject), with three build-FAILING
guardrails: ≤20–25% per primitive, ≥12% per interaction-type floor, empty-bucket alarm. 10 concrete interaction
patterns (I1–I10) are specified in the grammar agent's report; I3 (branch-on-count), I4 (relational select),
I6 (legend→attribute-dispatch) are the highest-value.

---

## 5. TWO-TIER ANTI-REFLEXIVE CERTIFICATION — the most important change (brute-force adversary + scaling architect)

Difficulty must NOT mean "our search solved it." Decouple the **constructor's verifier** from an **independent
attacker**, and keep only tasks in the gap `constructible ∩ not-cheaply-attackable`.

1. **`arc_search` (keep)** — proves the task is *well-posed*: a unique minimal program exists, covered, under-determined.
2. **`arc_attack.js` (NEW, independent)** — a *different* implementation, a *superset* DSL `D′ ⊋ D`, *deeper*
   bound (`d+1`), written to NOT share `arc_search`'s blind spots (ideally a different author/agent). **Reject any
   task `arc_attack` cracks cheaply** (a shorter/alternative program, or a 1–2-pair fit, or a statistical shortcut).
3. **Universal under-determination** — extend `gen_underdetermined`'s colour-split to *every* attribute (size/shape/
   count/position → action maps) and make `obsNeeded ≥ 3` a gate for **every** generator (today only 1 of 3 has it;
   and the `obsNeeded` prefix-subset bug must be fixed to test all `C(n,k)` subsets). The answer becomes a
   **program-valued function of the input** (legend/branch differ per instance) — which fixed-program enumeration
   *cannot* brute-force, even with the ops known.
4. **Red-team build gate** — on ≥200 sampled tasks per family per build, run: 1-pair/2-pair solver (reject family
   if >5% crackable), independent depth-4 brute-forcer (reject >10%), statistical-shortcut probes — output size,
   corpus-level colour prior, legend position template (reject >15% over chance). Build **fails loud** with a
   per-family dashboard. **Until a family passes the depth-4 brute-forcer at <10%, it is ARC-1-grade and excluded.**
5. **Strip metadata** — emit only `{examples, in, out, id}`. NEVER ship `meta.program/intended/colorMap/rule`
   (that is literally the answer key — v1's original sin).

**Scaling (so this is affordable at 50k — scaling architect):** typed primitives + per-family pre-filter shrink
branching from "hundreds of ops" to "the few applicable ops" (ARGA: ~1000× fewer nodes). Certification is
**two-phase generate→verify**: *solvable* and *covered* are **free O(P·D) replays** (we know the program); only
*minimality* (a shallow proof-search that's expected to fail) and *uniqueness/rivals* (an exact-depth-`d*` search)
are real searches, budgeted by the **known intended depth, never the full horizon**. Interaction lives in
**structured program nodes** (`Branch/Select/Govern`) that still emit grid-tuples, so dedup/uniqueness survive.

---

## 6. DIVERSITY CONTROLLER — honest counting (diversity adversary)

**NFRS (Normal-Form Rule Signature)** = canonicalize the search's *minimal* program: map each op to a parameter-free
class token (`colormap→MAP_BY_COLOR`, all dihedral ops→`DIHEDRAL`, gravity dirs→`GRAVITY`), collapse algebraic/
behavioural equivalences via a fixed probe-grid bank, order-normalize commuting stages, then key on
`(class-token sequence, hasLegend, hasBranch, selectionKind, mapAxis, conceptTag)`. **Two tasks are semantically
the same iff same NFRS.** Colour/position/size/count vanish by construction.

Build-time guardrails (hard, non-zero exit, no silent truncation):
- **`effectiveConceptCount`** = # distinct NFRS = the headline number (never report raw task count alone).
- per-atomic-class cap ≤25% (makes "all-gravity" un-buildable); per-NFRS cap; per-axis floor; empty-target-bucket
  ⇒ build fails naming the missing signature; **disclosed ratio** "50k tasks = N concepts × M instances".

---

## 7. HUMAN-LIKENESS CURATION — the axis the search is blind to (human-likeness adversary)

Search-uniqueness ≠ human-inducibility. Add an **orthogonal** gate (after certification, before corpus entry):
- **H1 one-sentence core-knowledge rule** (`meta.humanRule`, ≤140 chars, ≤2 clauses) — required field.
- **H2 working-memory load ≤ 4** simultaneous facts = `#legend-entries + #distinct-ops + #objects-discriminated`.
  This is the key counter-tension to depth≥3: **deep but NARROW** (3 ops, few objects, one legend), never
  3 ops × 3 maps × 5 objects.
- **H3 salient object-level change** (diff coverable by ≤4 whole-object edits, not pixel confetti).
- **H6 human-ambiguity ≠ search-ambiguity** — enumerate human-simple rivals (identity-on-subset, copy-nearest,
  single swap, mirror, keep-largest, fill-holes); if a simpler human rule fits train but predicts a different
  test ⇒ reject even when `arc_search.unique`.
- **C0–C8 pipeline** (cheap→expensive): format/palette → baseline-hard → clutter (≤8 objects, density ≤0.55) →
  wmLoad+rule → incidental-variation audit → generator-artifact invariance (re-seed + 4/8-connectivity) →
  entanglement (drop any stage ⇒ breaks a pair; legend-necessity) → human-ambiguity probe → **sampled
  LLM-as-human-solver as TASTE/flag only** (never a per-task scale gate — that rebuilds the verifier-ceiling trap).
- **Example economy**: 3 train pairs (4 only if wmLoad=4), each a *coupled* witness, every incidental feature
  varied across pairs, targeting "aha resolves at pair 3". Calibrate to ARC-2's own number: human panel clears
  (~75% / pass@2) while frontier models stay single-digit.

---

## 8. SHOWCASE / QA — Mario in the loop (human-likeness adversary)

Extend `build_search_showcase.js`: each card shows the **humanRule sentence**, the difficulty vector `(A–F)` +
`wmLoad`/`obsNeeded`/`resolutionPair`, a "why it's hard for AI" line, the human-reach badge, and the LLM verdict.
Gallery header = the full dashboard (axis/score/wmLoad/`humanReach` histograms + NFRS count + reject-reason tally)
with **build-fail asserts**, plus a "solve-it-yourself" strip so Mario attempts a few each build (the literal
continuation of HANDOVER's "a human critic actually solved samples").

---

## 9. ROADMAP (build order — consensus of the congress)

**Phase 0 — anti-reflexivity foundation (do FIRST; without it the corpus is brute-forceable):**
1. `arc_attack.js` — independent stronger solver; certify against it.
2. Make `obsNeeded ≥ 3` a universal gate; fix the prefix-subset bug; strip task metadata.
3. Red-team build-gate (1-pair / depth-4 brute / statistical probes) with per-family thresholds.

**Phase 1 — breadth (the missing ARC-2-defining families):**
4. `count_render` (T4) + `bool_combine` (T7) — cheap, high value.
5. `apply_op_legend` (T9) + `select(pred)` relational/conjunctive (T10).
6. Uniform primitive interface (`variants/type/applicable/cost` + `fit/step/covers`) so families plug in mechanically.

**Phase 2 — interaction (the multiplier):**
7. `Branch/Select/Govern` program nodes in `arc_search`; the grammar's `GOVERNOR ⇒ RULE`.
8. Stratified bucket sampler + per-class/interaction guardrails.

**Phase 3 — scale + honesty:**
9. NFRS dedup + diversity dashboard + ratio disclosure.
10. Human-likeness C0–C8 curation + showcase upgrades + sampled LLM taste.
11. Search-scaling (typed gating, per-family prefilter, two-phase verify) — as soon as Phase 1 makes B grow.

**Phase 4 — corpus run:** generate, gate, balance to ~50k tasks over the honest concept count; multi-epoch only
on instances, never on concepts.

---

## 10. HONEST LIMITS (named, not hidden)
- 50k *distinct concepts* is unreachable; we ship 50k *tasks* over ~600–1,500 concepts × instances, disclosed.
- Deep branching uniqueness + arithmetic concepts fall back to **per-family restricted verifiers** with
  **discounted difficulty credit** (recognised ≠ search-composed) so they don't masquerade as deep.
- Anti-reflexivity is relative to the *current* attacker; as the corpus grows, `arc_attack` must be periodically
  enlarged/retrained or a learned synthesizer will find its blind spot. Rising attacker solve-rate per family =
  that family is being memorized → expand or retire it.
