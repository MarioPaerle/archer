---
title: "HANDOVER — stato del progetto ARC-AGI-2 per il prossimo agente"
updated: 2026-06-14
---

# HANDOVER — ARC-AGI-2

> Leggi nell'ordine: (1) **Scintilla** `scintilla_brief("arc-agi-2")` (albero di ricerca vivo, è la fonte di verità sullo stato/decisioni) → (2) **[[AGENT]]** (regole d'oro + struttura KB) → (3) questo file → (4) **[[METHODS/taxonomy]]/[[METHODS/leaderboard]]/[[METHODS/failure-modes]]** → (5) `DSL/`.

## 1. Obiettivo
Record su **ARC-AGI-2** (Grand Prize eleggibile: open-source, 4×L4, ~12h, pass@2). Record da battere: **NVARC 24.03% private @ $0.20/task**; soglia bonus 85%.

## 2. La scommessa corrente (e la tesi confermata)
Modello **trainato da zero** che fa **neural-guided search** in un **DSL tipato object-centric** + verificatore + (eventuale) MCTS, con **generatore di dati = LLM che scrive nel DSL**.
**Tesi confermata sul campo:** *la difficoltà di ARC-AGI-2 è la RAPPRESENTAZIONE, non la regola.* Prove dirette:
- `e69241bd` (AGI-2-hard) **RISOLTO** appena trovata la rappresentazione giusta (holes-as-objects + sub-object → `for O: recolor(O, O.sub.color)`).
- `e681b708` (AGI-2-hard) **FALLITO** a forza bruta con rappresentazione sbagliata (3 celle su 528, poi peggio) → la regola giusta era banale con la rappresentazione giusta (regioni-oggetto + edge + **layers**).
Red-team: ARC-AGI-2 è anti-**forza-bruta**, NON anti-DSL (ARC Prize *raccomanda* DL-guided program search su DSL). Minaccia #1 = **espressività del DSL** (ortogonale alla search). → test #1 = error-slicing espressività-vs-selezione-vs-search PRIMA dell'MCTS.

## 3. Dove vive tutto
- **KB markdown** (questo vault Obsidian): `Panisperna/ArcAgi-2/`.
  - `SOURCES/` — **84 fonti** verificate in **10 filoni** (00 ARC-1/DSL · 01 TTT · 02 LLM-induction/o3 · 03 ARC-2/frontier · 04 ARC-Prize/competizioni · 05 DSL-neurosymbolic-su-AGI2 · 06 winning-solutions(NVARC/TRM/HRM/URM) · 07 AlphaGeometry · 08 AlphaProof · 09 world-priors/pretrain-data). Catalogo: `SOURCES/_index.md`.
  - `METHODS/` — taxonomy, leaderboard (numeri con split+fonte), failure-modes.
  - `DESIGN/` — artefatti nostri: `dsl-v0.md` (+§3-bis/3-ter layers), `dsl-from-real-tasks.md`, `verifiability-emulation.md`, `redteam-is-agi2-anti-dsl.md`.
  - `DATASET/ARC-AGI-2/` — clone reale (1000 train + 120 eval) + `dataset-guide.md`.
  - `AGENTS/` — ruoli + playbook + syntheses (neurosymbolic-reasoning, dsl-verifier-codesign).
  - `CONVERSATIONS/` — distillato di ogni sessione (convenzione: **salva il meglio di ogni chat**, AGENT.md §6).
  - `FLYWHEEL/usage.md` — come usare Flywheel (compute/esperimenti).
- **Scintilla** (albero di ricerca): progetto **`arc-agi-2`** (`scintilla_brief`). Goal + frontier impostati; nodi verdi = risultati che girano, blu = teoria, giallo = aperto.
- **Codice** (`DSL/`): vedi §4.

## 4. Mappa del codice (`DSL/`) — tutto gira (`python3 <file>`)
| File | Cosa |
|---|---|
| `arcdsl.py` | **DSL a oggetti** (quello buono): `Obj` con `place/recolor(mask)/get_border/get_internal_contour/get_external_contour/get_holes/count_sons/split`, **layer ops** `placeover/exclusive_placeover`, griglia=Obj, `to_grid()` |
| `arcworld.py` | versione precedente object-centric (Scene/Global/Obj/Link/auto_links) — *parzialmente ridondante con arcdsl, da consolidare* |
| `arc_dsl/` (core/solvers/task) | DSL **funzionale** griglia→griglia + solver dei task reali risolti (5582e5ca, 00576224, 00d62c1b, 007bbfb7, cce03e0d, **e69241bd**) |
| `arcgen.py` | **generatore**: primitive (filled/hollow_rect, dot) + 4 generatori stile ARC-AGI-2 (external_contour, fill_holes, recolor_by_largest, **marker_dispatch** contestuale), ognuno con SOLUZIONE (normale+DSL) |
| `arcvm.py` | **DSL come instruction-set MCTS-friendly**: programma = lista di istruzioni `(op,args)` = traiettoria; `Env{grid,all,work}`, `OPS`, `step`, `run`, `PROGRAMS` (i 4 task come programmi lineari) |
| `dsl_rules.py` | **regole dichiarative** serializzabili `{op,params}` + `apply_rule` + `perturb_rule` |
| `dsl_store.py` | **save/load JSON** (rappresentazione/regola/soluzione/dataset) + `augment_recolor` |
| `arcplot.py` | plotting griglie (palette ARC): `show_grid/show_task/show_solution` |
| `arcshow.py` | **vedere la rappresentazione**: `representation_text(grid)` e `representation_dsl(grid)` (rappresentazione scritta per esteso nel DSL) + `show_representation` (visiva) |
| `demo_*.py`, `run_check.py` | demo eseguibili (solving, generazione, save/augment, world) |
| `plots/`, `solutions/` | output (PNG, JSON: `library.json`, `e69241bd_aug.json`) |

## 5. Cosa è VERIFICATO che gira
- 6 task reali risolti (declarative rules) demo+gen OK; **e69241bd** (AGI-2-hard) risolto.
- 4 task generati stile ARC-AGI-2, validati (1 regola spiega tutto, non-banali) e plottati; incluso uno **contestuale** (marker_dispatch).
- **Flywheel dati**: da 1 task → 200 pair validi (JSON, 200/200 coerenti); perturbazione regole.
- **arcvm**: i 4 task riespressi come programmi lineari di istruzioni → `run(program,input)==output`.
- Rappresentazione ispezionabile (testo + DSL per esteso + plot).

## 6. Open threads / prossimi passi (in ordine di valore)
1. **Tipare gli op di `arcvm`** (firme grid/objset/color/int → legalità azioni) + **primo searcher** (enumerativo/bounded) → eseguire l'**error-slicing espressività-vs-selezione-vs-search** sui 120 eval (= test #1 del red-team; decide se la scommessa regge).
2. **Generazione di STRUTTURE** (non solo recolor) per la *mega*-augmentation vera + far **scrivere all'LLM** le `rule_DSL` (oggi hardcoded nei generatori).
3. **Consolidare il DSL**: oggi 3 forme (arc_dsl funzionale, arcworld/arcdsl oggetti, arcvm VM) → unificare su `arcdsl`+`arcvm`. Aggiungere `Obj.edge`, segmentazione **regioni** (per task tipo e681b708), `layers` di prima classe.
4. **Classe sequence/turtle** (task `e6de6e8f`: oggetti-input → 1 oggetto-output via `place` iterativo) — non implementata.
5. **Pretrain world-priors grid-native**: nucleo RE-ARC + BARC/ARC-Heavy + **CAX** (cellular automata) + 1D-ARC + MiniGrid; ConceptARC come eval (vedi `SOURCES/09`). Conviene **generare** i dati col flywheel.

## 7. Convenzioni / cautele (NON saltarle)
- **Regola d'oro**: zero allucinazioni; ogni numero col suo **split** (public/semi-private/private) e benchmark; cutoff modello = gen 2026 → 2025-26 va verificato via web.
- **Salva il meglio di ogni chat** in `CONVERSATIONS/` (AGENT.md §6); registra i risultati in Scintilla (verde=gira, rosso=morto, ecc.).
- **Non grindare a forza bruta** un task: se la regola è un incubo di edge-case, la rappresentazione è sbagliata (lezione e681b708). Guarda il **diff input→output** per inferire la struttura.
- **Rule transport**: l'LLM propone la regola, l'esecutore simbolico la applica su tutti gli oggetti — gli LLM falliscono ad applicare regole banali uniformemente.
- Caveat aperti: numeri di `SOURCES/05,09` in parte triangolati (raw non scaricati); arcworld vs arcdsl ridondanti.

## 8. Stato in una riga
Infrastruttura DSL (oggetti + generatore + flywheel JSON + forma VM) **costruita e funzionante**; tesi "rappresentazione > regola" **confermata** su task reali; **prossimo bivio decisorio**: tipare op + searcher → error-slicing espressività-vs-search (test #1) prima di scalare verso MCSTS/training.
