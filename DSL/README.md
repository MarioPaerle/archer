# ARC-DSL v0 — mini-interprete Python

Substrato eseguibile del DSL (vedi `../DESIGN/dsl-v0.md`, `../DESIGN/dsl-from-real-tasks.md`). **Non** c'è ancora search né MDL: questo è l'interprete + i primitivi + il check contro i demo, cioè il mattone per l'**error-slicing espressività-vs-selezione-vs-search** (priorità #1 del red-team, `../DESIGN/redteam-is-agi2-anti-dsl.md`).

## Cosa c'è
- `arc_dsl/core.py` — Grid (tuple di tuple), selettori/riduzioni colore (`most_common_color`, `unique_color`…), geometria (`rotate90/reflect_h/reflect_v/transpose`), `tile`/`self_tile`/`assemble`, topologia (`flood_from_border`, `recolor_where`), **segmentation kit** (`connected_components`, `objects_by_color`), **function creation** (`define`/`FUNCTIONS`/`compose`), escape totipotente (`cellmap`).
- `arc_dsl/task.py` — `load_task(tid, split)` sui dati reali + `check(solver, task)` → (demo_ok, gen_ok, err). I task di training hanno il test output → si misura la **generalizzazione**.
- `arc_dsl/solvers.py` — 5 solver scritti a mano per task reali.
- `run_check.py` — esegue i solver e stampa demo/gen.

## Stato (2026-06-14)
`python3 run_check.py` → **5/5 esprimibili + generalizzano** (5582e5ca, 00576224, 00d62c1b, 007bbfb7, cce03e0d).

## Finding emerso costruendo
**"background" ≠ "colore più frequente".** In `007bbfb7` (`660/600/066`) il più frequente è 6, ma il canvas vuoto è 0. Il selettore di sfondo è un **buco** che i demo disambiguano: il `check` ha scartato il selettore sbagliato (demo=False) → il verificatore fa il suo lavoro. Conferma il co-design DSL↔verificatore.

## Caveat onesto
5/5 è su **task hand-picked leggibili** (i pochi che ho potuto leggere a occhio): dimostra che l'interprete gira e che *quei* task sono esprimibili, **non** che l'espressività regge a scala. Il test decisivo (#1 red-team) richiede una **search** (per trovare i programmi, non scriverli a mano) eseguita su molti/ tutti i 120 eval → prossimo passo.

## Run
```bash
cd DSL && python3 run_check.py
```

---

## `arcworld.py` + `demo_world.py` — libreria centrata sulla RAPPRESENTAZIONE (object-centric)
A differenza di `arc_dsl/` (funzionale, griglia→griglia), `arcworld.py` implementa la **rappresentazione di Mario**: `Global → Scene(Input/Output) → Obj` (con sub-oggetti, proprietà, `cells_rc_color` nel formato `(r,c,color)`, `scene.A/B/...`), **`Link`** (corrispondenza in→out, auto-derivabile per forma/posizione), operazioni sugli oggetti (`translate/recolor/reflect/rotate90`), `Canvas`/`render` per ricostruire la griglia. Fa **sia generazione** (costruisci oggetti + applica op + render) **sia solving** (parse → manipola oggetti → render).

`python3 demo_world.py` (stato 2026-06-14):
- **(A) task reale `4258a5f9`** risolto *rappresentandolo a oggetti* (per ogni dot-5, stampa cornice 3×3 di 1): **demo_ok=True, gen_ok=True**. Stampa la rappresentazione (`scene.A`, `cells_rc_color`, `topleft`).
- **(B) round-trip generazione→solving**: genero un task ("ricolora ogni oggetto col colore del più grande") con la libreria, lo risolvo con un solver object-based: **demo_ok=True, gen_ok=True**, e gli **auto-link** in→out individuano correttamente le corrispondenze e la proprietà cambiata (`color`).

Caveat: dimostra che rappresentazione + link + generazione girano su un task per-oggetto pulito e su uno generato; ops di agency/simmetria (per task tipo ray/contextual) sono da aggiungere.
