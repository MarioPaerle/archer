---
title: "ARC-DSL v0 — DSL tipato a due strati, co-progettato col verificatore"
status: BOZZA v0 (ipotesi di design, NON validata) — 2026-06-08
authors: [mario, claude]
tags: [dsl, design, arc-agi-2, verifier]
---

# ARC-DSL v0 (bozza per iterare)

> **Status:** bozza di design, non testata. Razionale: [[../AGENTS/syntheses/dsl-verifier-codesign/synthesis]]. Obiettivo di questa v0: un linguaggio in cui *la regola umana di un task = un programma CORTO*, e in cui `demo-consistent + corto + type-valido + invariante ≈ corretto`.

## 1. Principi di design (da rispettare)
1. **Due strati** (come Lean: kernel + Mathlib): un **core operativo totipotente** sulle griglie (niente tetto di espressività) + un **type-layer semantico** sui *core-knowledge priors*.
2. **MDL-friendly**: i concetti ARC canonici devono costare **pochi token**. Se un task "naturale" richiede un programma lungo, le primitive sono al livello sbagliato.
3. **Verificatore co-progettato**: type system + invarianza + parsimonia *sono* il proxy di correttezza (non solo un filtro a valle).
4. **Esecuzione cheap** (verifica quasi gratis → tanti candidati nel budget).
5. **Crescibile**: nuove abstraction via library learning (DreamCoder-style), non tutte a mano.
6. **Buchi inferiti** (`?`): i parametri che vanno dedotti dai demo sono espliciti e verificabili.

## 2. Type-layer (l'ontologia — il "Mathlib delle griglie")
```
Color  = 0..9                         # 0 di solito background, ma NON assunto: si infera
Grid   = Array2D<Color>               # 1×1 .. 30×30
Mask   = Array2D<Bool>                # sotto-insieme di celle
Cell   = (pos:(Int,Int), color:Color)
Object = { mask:Mask, colors:Set<Color>, bbox, area:Int, holes:Int,
           shape:Mask (normalizzata, traslazione-invariante), sym:SymGroup }
ObjSet = List<Object>
Scene  = { grid:Grid, bg:Color, objs:ObjSet, frame:Region }
Dir    = U|D|L|R|UL|UR|DL|DR          Axis = H|V|D1|D2
Sym    = elemento di D4 (id, r90, r180, r270, flipH, flipV, flipD1, flipD2)
Int, Bool, Palette = Map<Color,Color>, Pred = Object -> Bool
```
I **tipi iniettano la semantica**: "Object" porta con sé shape/area/sym → "programma corto" diventa "regola naturale", e il verificatore sa *quali invarianze* aspettarsi (la `sym` di un oggetto, l'equivarianza del programma).

## 3. Operatori (per strato). `*` = core totipotente; gli altri = sugar semantico
**(P) Percezione — `Grid -> Scene/ObjSet`**
- `bg(g) -> Color`  (colore di sfondo inferito: più frequente / cornice)
- `segment(g, conn=4|8, by=color|nonbg) -> ObjSet`  (connected components)
- `partition(g, by=gridlines|tiles|symmetry) -> ObjSet`
- `frame(g) -> Region`,  `as_object(g) -> Object`

**(A) Attributi & relazioni — `Object/ObjSet -> Int/Bool/...`**
- `area | width | height | ncolors | nholes | color | centroid | shape | sym` (Object)
- `count(s) | palette(g)` ; relazioni: `adjacent(a,b) | contains(a,b) | aligned(a,b,ax) | same_shape(a,b) | same_color(a,b)`

**(S) Selezione/quantificazione — `ObjSet -> ObjSet/Object`**
- `filter(s,pred) | map(s,f) | sort_by(s,attr) | argmax/argmin(s,attr)`
- `the(s,pred)`  (l'unico oggetto che soddisfa — fallisce se 0 o >1: vincolo forte = segnale di verifica)
- `odd_one_out(s,attr)`  (il diverso per shape/colore/size — concetto ARC frequentissimo)
- `group_by(s,attr) | most/least_frequent_by(s,attr)`

**(T) Trasformazioni — `Object/Region/Grid -> idem`**
- geom*: `rotate(k) | reflect(ax) | transpose | translate(dir,n) | scale(k)`
- colore*: `recolor(mask|obj, to) | map_palette(p) | swap(a,b)`
- topologia: `flood_region(g, from, through) -> Mask | fill_holes(to) | outline(to) | connect(a,b,to) | crop(region) | pad(...)`
- composizione: `overlay(a,b) | tile(reps, tile_fn) | symmetrize(ax) | gravity(dir) | repeat_pattern(period)`

**(C) Controllo & binding — il "passo creativo" (aux constructs)**
- `let x = <expr> in <body>`   (lega un oggetto/parametro inferito)
- `if pred then f else g`        (regola context-sensitive)
- `for_each(s, f)`               (decomposizione AND: applica per-oggetto e ricomponi)
- **buchi inferiti** `?T` (es. `?Color`, `?Int`, `?Sym`): un valore dedotto dai demo; la sua **regola di inferenza** è essa stessa un piccolo programma e deve essere **consistente su TUTTI i demo** (anti-binding-hack).

**(Z) Escape totipotente** (ultima risorsa, fortemente penalizzato da MDL — l'analogo del low-level tactic):
- `cellmap*(fn: (pos,neigh) -> Color)`  e  `rewrite*(lhs_pattern -> rhs_pattern)`  → garantiscono che *qualunque* trasformazione sia esprimibile (totipotenza), ma costano molto in lunghezza → il verificatore-MDL li sceglie solo quando nient'altro funziona.

Un programma è `solve : Grid -> Grid` (eventualmente via Scene intermedia). La **lunghezza/complessità nel DSL = punteggio MDL**.

## 3-bis. v0.1 — primitive emerse da 8 task reali ([[dsl-from-real-tasks]])
Giocando a mano su task di training sono emerse lacune della v0. Aggiunte:
- **Selettori/riduzioni per i buchi** (la libreria compatta che riempie i `?`): `most_frequent / least_frequent / unique_color (appare 1 volta) / ==c / ≠bg / by_size / by_count`. **Conferma forte**: `007bbfb7` e `cce03e0d` sono lo *stesso* template `self_tile(g, ?pred)` e differiscono solo nel selettore (`≠bg` vs `==2`) → il "buco = selettore" è l'astrazione giusta.
- **Reference-frame**: `find_separators(g) -> Lines` (righe/colonne uniformi che spaccano la griglia) — i task `b2bc3ffd` (floor-8) e `8d510a79` (linea-5) lo richiedono.
- **Agency/dynamics** (erano sotto-coperti): `ray(from,dir,stop=wall|edge) | move_until(obj,dir,stop) | gravity(dir,floor) | trail(...)`.
- **Dispatch color-conditional**: `by_color(g, {c→rule})`, mappa colore→regola **inferita e consistente sui demo** (`8d510a79`: la direzione del raggio dipende dal colore). È la "contextual rule application" di AGI-2.
- **Simmetria come trasformazione E oracolo**: `detect_symmetry(g) | complete(g,sym) | mark_deviations(g,expected,to)` (`4612dd53`). La simmetria propria del task è anche un **segnale di verifica**.
- **`self_tile(g, ?pred)`**: zucchero per `assemble(H,W, λr,c→ if pred(g[r][c]) then g else zeros)` (i due fractal).

## 3-ter. LAYERS + regioni-come-oggetti (lezione da e681b708, 2026-06-14)
Aggiunta mancante alla rappresentazione: **`layers`**. Un oggetto/Scene ha layer; i layer di base sono **una griglia per colore**, ma sono **estendibili** (es. "layer linee" vs "layer pallini"). I layer rendono banali i task dove più strutture si sovrappongono.

**Caso e681b708** (eval-hard, in training): linee divisorie (colore 1) partizionano la griglia in **regioni**; ai bordi/incroci ci sono marker colorati; i dot blu vanno ricolorati per regione. Con la rappresentazione giusta la regola è **una riga**:
```
for each region-object O:
    recolor(O, argmax(O.edge.colors where color != divisore))
```
dove **ogni pezzo della griglia è un oggetto** (i bordi di regioni adiacenti si overlappano), il **background è escluso** dall'oggetto, e i layer separano **linee** (un layer) dai **pallini** (un altro layer) → niente più ambiguità "dot sulla linea vs pezzo di linea".

**Lezione (forte):**
- Con la rappresentazione SBAGLIATA (griglia piatta + bande) il solver è un incubo di edge-case (provato: 3 celle errate → peggio); con quella GIUSTA (layers + regioni-oggetto + edge) è un one-liner. **La difficoltà di ARC-AGI-2 è in larga parte un problema di rappresentazione/vision, non di regola.** È la prova viva della tesi DSL-first.
- **"Rule transport":** applicare una regola banale *in modo uniforme su tutti gli oggetti* è qualcosa che gli LLM falliscono sistematicamente. Argomento decisivo per lo split: l'LLM **propone** la regola, l'esecutore simbolico la **trasporta** (applica) su tutti gli oggetti senza errori. Vedi [[../CONVERSATIONS/2026-06-14-redteam-scintilla-dsl-interpreter]].

→ TODO rappresentazione: aggiungere `Scene.layers` (per-colore + custom), `Obj.edge` (celle di bordo + i loro colori), segmentazione **regioni** (flood delle aree non-linea delimitate dalle linee).

## 4. Il verificatore co-progettato (proxy di correttezza)
Dato un candidato `solve`:
1. **Consistency (hard, gratis):** `solve(in_i) == out_i` per **tutti** i demo. Se no → scarta.
2. **Type-valido (hard):** type-checka; i buchi `?` hanno regola d'inferenza ben definita e **uguale su tutti i demo**.
3. **MDL (soft):** `len(solve)` nel DSL — più corto = meglio (Solomonoff; cfr. CompressARC).
4. **Invarianza (soft):** per ogni simmetria `σ` plausibile per il task, `solve(σ·in) ≈ σ'·solve(in)` sui demo e sul test input (AIRV). Incoerenza → penalità.
5. **Agreement (soft):** boost se programmi indipendenti (o induction vs transduction) concordano sull'output del test.
**Selezione:** tra i candidati che passano 1–2, ordina per `w1·MDL⁻¹ + w2·invarianza + w3·agreement`; **submetti i top-2** (pass@2). Nessuno è un oracolo → si accetta il rischio Goodhart, mitigato da pass@2 e da un proxy forte.

> **Approfondimento dedicato:** [[verifiability-emulation]] sviluppa questo verificatore-proxy (7+1 segnali, gate duro non-gabbabile + scoring soft calibrato `P̂(generalizza)`, pass@2 come *copertura*, e il **leave-one-out interno come pseudo-kernel**). È la metà "verifica" del co-design; questa è la metà "DSL".

## 5. Test del design sui due task annotati ([[../DATASET/dataset-guide]])
**`00d62c1b` — riempi di 4 le regioni di sfondo racchiuse:**
```
solve(g) =
  let b   = bg(g)                                   # 0
  let ext = flood_region(g, from=frame(g), through=b)   # sfondo connesso al bordo
  in recolor(g, where = (color==b ∧ ¬ext), to = ?Color)   # ?Color = 4, inferito dai demo
```
3 operazioni + 1 buco. Il buco `?Color` si risolve come "il colore che le regioni racchiuse assumono nei demo", consistente su tutti i train. **Corto ⇒ MDL alto. ✓**

**`00576224` — tiling 3×3 con righe-di-tile alternate riflesse:**
```
solve(g) =
  let (R,C) = (out_h/in_h, out_w/in_w)              # 3,3 dal rapporto di shape
  in assemble(R, C, λ r c -> if odd(r) then reflect(g,H) else g)   # regola di tile inferita, periodo 2
```
3 operazioni + 1 regola-di-tile inferita (la funzione `r,c -> Sym`, qui `odd(r)→flipH`), consistente su train0/train1. **Corto ⇒ MDL alto. ✓**

In entrambi: la regola umana è un programma di ~3 step → il design supera il "test di naturalezza" su questi due. (Servono molti più task per stressarlo davvero.)

## 6. Domande di design aperte (da decidere insieme)
- **Granularità dei buchi `?`**: quanto potere diamo all'inferenza dei parametri? Troppo → reward-hacking; troppo poco → non esprime regole contestuali.
- **`the`/`odd_one_out` come vincoli di verifica**: usare il fallimento di `the(...)` (0 o >1 match) come *segnale negativo* di selezione?
- **Equivarianza**: quali σ considerare "plausibili" per un dato task (tutte D4? solo quelle che mappano i demo in sé)?
- **Crescita del DSL**: quali abstraction far emergere via library learning, e come evitare che il DSL appreso overfitti il training set (problema di Hodel)?
- **Rappresentazione per il modello neurale**: serializzazione token-level (tipo GridCoder2) o albero tipato? Influenza il proposal e l'execution-guidance.
- **Escape `Z`**: penalità MDL giusta perché sia "ultima risorsa" e non scorciatoia.

## 7. Prossimi passi
1. Implementare un mini-interprete del core (P/A/S/T/C) + esecutore griglia (cheap).
2. Codificare a mano ~10–15 task di training in ARC-DSL v0 → misurare la lunghezza media (test di naturalezza) e scoprire le primitive mancanti.
3. **Error-slicing** sui 120 eval: espressività vs selezione vs search (tracciato in Flywheel, [[../FLYWHEEL/usage]]).
4. Iterare su v1 con le primitive emerse dal punto 2.
