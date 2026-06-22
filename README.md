# archer

Code base for an **ARC-AGI-2 record attempt**. The bet: pretrain a grid-native world-model on
**millions of procedurally-generated, coherence-verified ARC-style tasks** that teach the human-core
priors ARC-AGI-2 leans on (objectness, counting, symmetry, containment, context-sensitive rules,
analogy, figure-algebra, paper-folding…), then adapt it few-shot.

This repo is **code + light docs only** — the lean, public base that agents clone (Mac, CINECA, …).
The full research KB (source papers, the ARC dataset, methods, conversations) lives outside it, on the Mac.

## What's here

| Path | What |
|---|---|
| **`GRIDVID/`** | The generator. A DSL + zero-LLM engine that emits `(EXAMPLES, IN, OUT)` task families and **verifies them itself** (parse · teaching · variation · coherence, microseconds). `engine.js` (the whole engine), `cli.js` (the agent CLI), template library in `scenes/library/`. Start at `GRIDVID/HANDOVER.md`. |
| **`DSL/`** | Earlier object-centric / functional ARC DSL prototypes + solvers (Python). |
| **`DESIGN/`** | Design docs for what we build (the DSL, the IQ-test prior taxonomy, the gridworld-foundation objectives). |
| `AGENT.md` · `LINEAR.md` · `HANDOVER.md` | Operating contracts (KB conventions, task tracking, project state). |
| **`ARCHER.md`** | **Read this** — the standing rule: archer is canonical; keep every clone in sync with `origin`. |

## Quick start (the generator)

```bash
cd GRIDVID
node cli.js self-test            # engine sanity checks (must be green)
node cli.js dsl                  # the full scene-DSL grammar (self-doc)
node cli.js generate-dataset --n 1000 --workers 8 -o out/dataset            # mass template sampler (no LLM)
node cli.js generate-llm --n 1000 --endpoint http://<vllm-host>:8000 --model qwen   # Qwen-in-the-loop
node cli.js export-objectives out/dataset -o out/objectives.jsonl           # → training records
```

Both generators are **multinode** (`--num-nodes W --node-rank R`): each node owns a disjoint seed slice,
so N machines generate non-overlapping tasks with zero coordination — built for CINECA.

## The pipeline

```
proposer (curated function-menu)  →  prompt-kit  →  small model writes scene-DSL (Qwen-30B-A3B via vLLM)
   →  engine VERIFIES (coherence guard, zero-LLM)  →  self-correct on reject  →  keep good tasks
   →  shard + dedup  →  export training objectives (arc_pair · next_frame · inverse_dynamics · object_aux)
```

The engine is the cheap verifier; the model only proposes. No per-task big-LLM critic — that doesn't
scale to millions.
