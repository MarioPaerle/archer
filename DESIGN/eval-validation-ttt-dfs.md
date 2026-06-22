---
title: "Eval validation via TTT + DFS (NVARC-style) — how we score on the ARC-AGI-2 eval"
status: notes — 2026-06-22
tags: [arc-agi-2, eval, validation, ttt, dfs, nvarc, inference]
---

# Eval validation: per-puzzle TTT → DFS decode → cross-aug selection

Our notes on the **eval-validation pipeline** we need (studied from the NVARC reproduction on Leonardo;
NVARC code is public at `github.com/1ytic/NVARC`). This is *inference-only scoring* on the 120 ARC-AGI-2
public-eval tasks: it is how any model we train gets a STRICT pass@2 number. We do **not** copy the
reproduction; this is the method + our plan to run it from our own space and scale it multinode.

## The pipeline (per puzzle, independent)

1. **Test-time training (TTT).** For one eval puzzle, fine-tune a small **LoRA** adapter (Unsloth
   `FastLanguageModel`, rsLoRA, α≈32, ~1 epoch) on **augmented variants of that puzzle's demonstration
   pairs** (`augment(n=16, shuffle_keys)`). The base model is the NVARC Qwen3 SFT. One adapter per puzzle.
2. **DFS decode (`turbo_dfs`).** After TTT, decode the test output with a **depth-first search over the
   restricted ARC token vocabulary** (digits 0–9, row-sep, EOS), not greedy/beam:
   - at each position, compute per-token NLL; keep branches whose **cumulative score < `max_score`** (a
     global negative-log-prob budget → prunes low-probability paths);
   - EOS closes a candidate grid; otherwise recurse deeper, reusing the KV-cache; batched across live beams;
   - bounded by a **time budget** (≈540 s inner / a global `end_time`; NVARC's full cap ≈1200 s/puzzle).
   Output = a *set* of candidate grids, each with a `beam_score`. DFS explores all high-prob completions,
   which is what makes the candidate pool rich enough for selection to work.
3. **Cross-augmentation re-scoring.** Each candidate is re-scored under input augmentations
   (`eval_ds.augment(n=2)`) → `score_aug`. A candidate that stays consistent across augmentations is
   more trustworthy than one that only wins on the raw orientation.
4. **Selection (top-2 = pass@2).** `arc_decoder.py` ranks candidates and keeps the best 2:
   - `score_kgmon` = (#times the guess appeared across inferences) − mean(`score_aug`) — the selector the
     reproduction relies on;
   - `score_full_probmul_3` = a probability-margin alternative.
5. **STRICT score.** A puzzle counts as solved if **either** of the top-2 guesses exactly equals the label.

## How it runs today (single node)
4×A100 on `boost_usr_prod`, `ntasks-per-node=4`: a **queue distributes puzzles across the 4 GPU ranks**
(`worker(rank, queue)`), each rank does TTT+DFS for its puzzles. Launched inside a Singularity container
(`python311.sif` + offline HF) via `infer_only_parallel_4gpu.py`. Per-puzzle outputs land in a results dir,
then `score.py` / the decoder aggregates and computes the STRICT number.

## Making it multinode (the speedup we want)
The 120 puzzles are **fully independent** and outputs are **per-puzzle files** → embarrassingly parallel,
no inter-node communication. To go from 1 node to N:
- **Shard the puzzle list by node:** each node processes `puzzles[node_rank :: num_nodes]`, then its 4 GPUs
  split that slice via the existing rank-queue. (Same idea as archer's generator `--num-nodes/--node-rank`.)
- **Launch** either one `#SBATCH --nodes=N` job with `srun` fan-out, or N independent jobs each passed
  `(node_rank, num_nodes)`.
- **Aggregate** once at the end: read all per-puzzle result files from the shared output dir and run the
  selection+score. Speedup is ≈ linear in nodes (TTT+DFS dominate; aggregation is trivial).

## To run it from OUR space (porting notes)
- **Redirect hardcoded paths.** The reproduction hardcodes `dir_outputs` and the sbatch `--output/--error`
  to `…/gcirillo/arc-agi/EXP-001_nvarc/…` (private). Point outputs/logs at our `$SCRATCH/…` and the scripts
  at our own checkout before any run.
- **Inputs needed** (do not copy the private tree — obtain/point to): the NVARC base checkpoint (HF), the
  per-puzzle adapters or the TTT config, the eval tasks (`arcprize/ARC-AGI-2/data/evaluation`, public), and
  the Singularity image + site-packages (`~/EXP-001_nvarc_build/`).
- **Budget reference (from the repro):** ceiling ~7/10 STRICT on a top-10 retriever subset (oracle); a
  label-free early-exit rule (`EMA20(|Δgrad| − |Δloss|) < 0.025`) recovers ~6/10 at −43 % TTT compute.

## Why we care
This is the **measuring stick**: archer's bet is a grid-native world-model pretrained on our generated
corpus. Whatever we train has to be scored on the eval the same way (TTT + DFS + selection) to compare
against the NVARC baseline. Keeping a clean, multinode, our-paths copy of *just this validation path* is
the dependency — not the whole reproduction.
