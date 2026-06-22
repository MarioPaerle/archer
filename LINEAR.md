---
title: "LINEAR.md — issue tracking for the ARC-AGI-2 team (operating rules)"
project: arc-agi-2-record
updated: 2026-06-20
status: living document
---

# LINEAR.md — how agents use Linear in this KB

> **Read this together with [[AGENT.md]].** Linear is the team's **task tracker** (what to do / who / status).
> The KB (`SOURCES/METHODS/DESIGN/CONVERSATIONS`), **Scintilla** (research tree) and **Flywheel** (experiments)
> are the *knowledge*; Linear is the *work list* that points at them. They are complementary — keep them in sync.

## 0. Connection
- MCP server: **`linear-server`** (`https://mcp.linear.app/mcp`, HTTP, OAuth). Tools: `mcp__linear-server__*`.
  If a session shows it as `Needs authentication`, run `mcp__linear-server__authenticate` and have Mario complete OAuth.
- Workspace: **paradigmainc**. Team for ARC-AGI-2 work: **Panisperna** (`PAN`). All ARC-AGI-2 issues live here.
- Default assignee: **Mario** (`mario.prignano@paradigma.inc`) unless told otherwise.

## 1. The standing rule (Mario)
**Agents working on ARC-AGI-2 MUST use Linear and keep it current.** Concretely, every session:
1. **Orient first** — `list_issues` on team Panisperna (filter by assignee/state/label) to see the live backlog before proposing work. Don't duplicate an existing issue.
2. **When you start real work** on an item → set its issue to **In Progress** (`save_issue id:… state:"In Progress"`). When done → **Done**, with a one-line comment linking the artifact (KB path / Scintilla node / Flywheel run / PR).
3. **When you discover new work** (a missing prior, a new DSL verb, a bug, a follow-up) → **open an issue** rather than letting it evaporate. Title `GRIDVID: …` for generator/DSL work; otherwise a clear noun phrase. Put file paths + enough context to act cold in the description.
4. **Close the loop** — if an issue becomes stale/superseded, say so in a comment and cancel it; don't leave zombies.

## 2. Conventions
- **Language: English** for everything that lands in Linear (title, description, comments) — same rule as Scintilla. Chat with Mario stays Italian.
- **Title prefix** `GRIDVID:` for the data-generation engine / DSL work (most current work). Use plain noun phrases for infra/research/KB issues.
- **Priority**: `High` for record-critical levers (breadth of the generator, mass sampler, throughput), `Medium` for quality/tooling, `Low`/`None` for nice-to-haves.
- **Description**: self-contained. Reference the source of truth — e.g. `Source TODO: GRIDVID/TODO.md`, a `DESIGN/*.md` section, or a Scintilla frontier id (`fr_…`). Cross-link related PAN issues.
- **Labels/projects**: none defined yet on Panisperna; add them only if Mario sets them up.

## 3. How Linear maps to the other tools
| Tool | Holds | Use for |
|---|---|---|
| **Linear** (PAN) | the *work list* — issues, status, priority, owner | "what should I do next / what's in flight" |
| **Scintilla** (`arc-agi-2`) | the *research tree* — hypotheses, results, verdicts | "what did we learn / what to chase or avoid" |
| **Flywheel** | *experiments* — compute, runs, evidence | "run it / record the evidence" |
| **KB markdown** | *durable knowledge* — sources, methods, design | "the verified reference" |
| **GRIDVID/TODO.md** | the running checklist *inside* the generator sub-project | day-to-day generator backlog (mirror the big items into Linear) |

`TODO.md` and Linear overlap on purpose: `TODO.md` is the fast scratch list at the code; Linear is the durable, owned, status-tracked view. **When you add a substantial item to `TODO.md`, mirror it into a PAN issue** (and vice-versa).

## 4. Live backlog snapshot (2026-06-20)
> Snapshot only — **`list_issues` is the source of truth.** Update this table when it drifts materially.

### Generation pipeline — "small model generates millions of interesting, human-prior tasks"
| Issue | What | Pri |
|---|---|---|
| [PAN-132](https://linear.app/paradigmainc/issue/PAN-132) | **(G0, keystone) ✅ DONE** Hierarchical function-menu proposer + function registry — curate the DSL surface per task (`propose`) | Urgent |
| [PAN-114](https://linear.app/paradigmainc/issue/PAN-114) | **✅ DONE** Mass dataset sampler (`generate-dataset` CLI) — sharded, coherence-guarded, no per-task LLM | High |
| [PAN-123](https://linear.app/paradigmainc/issue/PAN-123) | **(B) ✅ DONE** Parallel worker-pool sampler (`--workers W`, disjoint seed slices, global dedup) | High |
| [PAN-121](https://linear.app/paradigmainc/issue/PAN-121) | **(A) ✅ DONE** Small-model prompt-kit (`prompt`) — menu-scoped grammar card + guardrails + exemplar | High |
| [PAN-119](https://linear.app/paradigmainc/issue/PAN-119) | **(C)** Typed combinators `dispatch/mask/overlay/seq/parallel/bind` (`program.js`) — the breadth lever | High |
| [PAN-120](https://linear.app/paradigmainc/issue/PAN-120) | **(C)** Auto-compose sampler — compose-K (the autonomous mode of PAN-132; 2-function base case) | High |
| [PAN-122](https://linear.app/paradigmainc/issue/PAN-122) | **(A)** Self-correcting generation loop (feed engine reject reasons back to the model) | High |
| [PAN-116](https://linear.app/paradigmainc/issue/PAN-116) | Qwen generation prompt that rewards novelty | Med |
| [PAN-115](https://linear.app/paradigmainc/issue/PAN-115) | Encode non-verbal IQ / matrix-reasoning transformations as DSL templates (more priors) | Med |
| [PAN-124](https://linear.app/paradigmainc/issue/PAN-124) | **(D)** Zero-LLM semantic coherence guard (function-consistency) + difficulty/near-dup metric | Med |
| [PAN-117](https://linear.app/paradigmainc/issue/PAN-117) | Export training records (`video.json + program.json` → objectives) | Med |

### DSL priors mined from IQ tests (spec: `DESIGN/iq-tests-to-dsl.md`)
| Issue | What | Pri |
|---|---|---|
| [PAN-125](https://linear.app/paradigmainc/issue/PAN-125) | **(G2, keystone)** `dispatch`/`classify` combinator + predicate registry | High |
| [PAN-126](https://linear.app/paradigmainc/issue/PAN-126) | **(G3)** Detector-predicate battery (is_connected/has_loop/collinear/is_convex/is_symmetric/parity/subitize/same_count) | High |
| [PAN-127](https://linear.app/paradigmainc/issue/PAN-127) | **(G1)** Boolean figure-algebra `combine or/xor/and/sub` + `overlay_figs` | High |
| [PAN-128](https://linear.app/paradigmainc/issue/PAN-128) | **(G4)** Analogy `bind/apply` + series `iterate/cycle/progress` + `odd by PROP` | Med |
| [PAN-131](https://linear.app/paradigmainc/issue/PAN-131) | **(G7)** Distribution/matrix completion — `distribute3`, `grid_complete`, generalize `solve` | Med |
| [PAN-129](https://linear.app/paradigmainc/issue/PAN-129) | **(G5)** Spatial I — `fold`/`unfold` + embedded-figure `find` | Med |
| [PAN-130](https://linear.app/paradigmainc/issue/PAN-130) | **(G6)** Spatial II — `assemble`/`tile_cover` + 2D `section` (3D out of scope) | Low |

### Infrastructure
| Issue | What | Pri |
|---|---|---|
| [PAN-118](https://linear.app/paradigmainc/issue/PAN-118) | Construct CINECA infrastructure for training / evaluation / finetuning | High |

**Pillars (Mario's framing):** **A** = good prompting for a small model · **B** = a fast generator · **C** = a generator broad enough on its own to make interesting tasks easy · **D** = cheap quality glue.
