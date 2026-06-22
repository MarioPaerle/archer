---
title: "Il DSL derivato da task reali — 8 task di training risolti a mano"
status: analisi empirica (2026-06-08) — base per dsl-v0.1
authors: [claude]
tags: [dsl, design, arc-agi-2, empirical]
---

# Cosa serve davvero al DSL — 8 task di training analizzati a mano

> Metodo: campionati 8 task **di training** (igiene anti-leak: niente eval in fase di design), renderizzati e risolti a mano, poi estratte le primitive necessarie. Sorgente: `DATASET/ARC-AGI-2/data/training/`. Le regole non pienamente decodificate sono **dichiarate come tali**.

## I task (regola inferita → primitive richieste)
| Task | Shape | Regola inferita | DSL sketch | Primitive chiave |
|------|-------|-----------------|-----------|------------------|
| `5582e5ca` | 3×3→3×3 | riempi tutta la griglia col **colore più frequente** | `fill(frame, ?Color = most_frequent(g))` | **color-reduction** (histogram argmax) |
| `007bbfb7` | 3×3→9×9 | **fractal**: blocco(r,c)=input se `input[r,c] ≠ bg`, altrimenti vuoto | `self_tile(g, pred = ≠bg)` | **self-tile + per-cell predicate** |
| `cce03e0d` | 3×3→9×9 | **fractal**: blocco(r,c)=input se `input[r,c] == 2` | `self_tile(g, pred = ==?Color)` | idem, ma predicate diverso |
| `00576224` | 2×2→6×6 | tiling 3×3, righe-di-tile dispari riflesse | `assemble(3,3, λr,c→ if odd(r) then reflect(g,H) else g)` | assemble + reflect + cond |
| `8d510a79` | 10×10 | dot emettono **raggi** verso/lontano da una **linea-5**, direzione **dipende dal colore** | `for dot: ray(dot, dir(color), stop=wall|edge)` | **separator-detect + ray-casting + color-conditional** |
| `b2bc3ffd` | 8×8 | oggetti sopra un **floor-8** vengono **rilanciati/riposizionati** (per-oggetto) | `for_each(obj, move(obj, ?Δ(obj)))` | **reference-frame + per-object dynamics** *(motion esatto non decodificato)* |
| `4612dd53` | 11–13² | rileva la **regolarità/simmetria** del contorno e **marca le deviazioni con 2** | `mark(g, where = deviates_from_symmetry(g), to=2)` | **symmetry/periodicity-detect + diff + recolor** *(parziale)* |
| `833966f4` | 5×1 | permutazione strutturata: scambia la coppia in alto e in basso, centro fisso | `swap_pairs(top, bottom)` | **region-relative reverse/permute** *(semantica incerta)* |

## I 5 insegnamenti chiave per il design

### 1. La conferma più importante: i **buchi sono selettori**, e bastano pochi
`007bbfb7` e `cce03e0d` sono lo **stesso identico template** (`self_tile(g, pred)`); differiscono **solo** nel predicate inferito (`≠bg` vs `==2`). Questo è la prova viva che l'architettura "template + buco" è giusta: il "passo creativo" è un **piccolo selettore** dedotto dai demo, non un programma nuovo. → serve una **libreria compatta di selettori/riduzioni**: `most_frequent / least_frequent / unique (appare 1 volta) / ==c / ≠bg / by_size / by_count`. Ne bastano ~10 per coprire moltissimo.

### 2. Serve il **reference-frame** (separatori) — manca in v0
`b2bc3ffd` (floor di 8) e `8d510a79` (linea di 5) usano una **linea/separatore come sistema di riferimento**. Primitiva mancante: `find_separators(g) -> Lines` (righe/colonne uniformi che spaccano la griglia).

### 3. Serve **agency/dynamics** (raggi, gravità, moto) — sotto-coperto in v0
`8d510a79` (raggi/trail) e `b2bc3ffd` (riposizionamento) sono **processi**, non mappe statiche. Primitive: `ray(from,dir,stop) | move_until(obj,dir,stop) | gravity(dir,floor) | trail`. È il prior "agency" di Chollet, ed è dove i DSL classici sono più poveri.

### 4. Le regole sono spesso **color-conditional** (cuore di AGI-2)
In `8d510a79` la **direzione del raggio dipende dal colore** del dot. → serve dispatch per-colore: `by_color(g, {c1: rule1, c2: rule2})`, con la mappa colore→regola **inferita e consistente sui demo**. È esattamente la "context-sensitive rule application" del design di AGI-2.

### 5. La **simmetria è sia trasformazione sia ORACOLO**
`4612dd53` usa la simmetria/periodicità *attesa* come regola (marca le deviazioni). Doppio valore: (a) primitiva `detect_symmetry / complete / mark_deviations`; (b) **segnale di verifica** — la simmetria propria di un task valida una candidata (lega al verificatore, [[../AGENTS/syntheses/dsl-verifier-codesign/synthesis]]).

## Onestà
- `b2bc3ffd`, `4612dd53`, `833966f4`: **struttura chiara, regola esatta non pienamente decodificata** a mano. Non sono "risolti", sono "inquadrati". Vanno ri-verificati con un interprete eseguibile.
- 8 task sono pochi: servono ~50–100 codificati a mano per stabilizzare l'ontologia. Questo è il punto 2 del piano in [[dsl-v0]].

## Delta per dsl-v0 → v0.1
Aggiungere: `find_separators`, libreria di **selettori** per i buchi, primitive di **agency** (ray/move_until/gravity/trail), **`by_color` dispatch**, **`detect_symmetry/complete/mark_deviations`**, **`self_tile(g, pred)`**. Recepito in [[dsl-v0]] §3 (sezione v0.1).
