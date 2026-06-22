# ARCHER — the standing rule (read me)

**`archer` (github.com/MarioPaerle/archer) is the canonical code base.** Every place we work — the Mac,
each CINECA clone, every agent — is a working copy of it. Keep them in sync.

## The rule

1. **archer is the source of truth for code + light docs.** If you change the generator, the DSL, the
   design docs, or these operating files, the change is not "done" until it is **committed and pushed to
   `origin/main`**. A change that lives only in one clone does not exist for the others.
2. **Pull before you work, push when you pause.** Start a session with `git pull --rebase`. End a
   meaningful step with `git add -A && git commit && git push`. Do not let work pile up uncommitted.
3. **Keep it lean.** archer is **code + light documentation only**. Never commit: the research KB
   (papers, the ARC dataset, methods, conversations), build artifacts (`out/`, `target/`, `node_modules/`,
   `dist/`), model weights, or generated datasets. The `.gitignore` enforces this — extend it, don't fight it.
4. **Attribution: Mario only.** Commits are authored by Mario. **No `Co-Authored-By` trailers, no agent
   co-authors.**
5. **The engine self-test is the gate.** `cd GRIDVID && node cli.js self-test` must be green before you
   push engine/CLI changes.

## CINECA note

On CINECA, archer is **one clone among many** — the heavy work (datasets, model weights, runs, the full KB)
lives in the project/scratch space alongside it, *not* inside archer. archer just has to be present and
current so any node/agent can `cd archer && node GRIDVID/cli.js …`. Generators are multinode-ready
(`--num-nodes/--node-rank`); point `generate-llm` at the locally-served Qwen endpoint.
