---
title: "TEMPLATE.md — modello di riassunto a 3 livelli per ogni fonte"
updated: 2026-06-08
---

# Template del riassunto fonte (`<slug>.md`)

Ogni fonte ha **tre livelli di profondità** nello stesso file. Il livello *Full* deve contenere **ogni singolo dettaglio** estraibile dalla fonte (metodo, numeri, ablation, vincoli, infrastruttura). Prosa in italiano, termini tecnici in inglese. **Solo dati realmente recuperati** (regola d'oro in `AGENT.md` §0).

Copia il blocco sotto in `SOURCES/<folder>/<slug>.md` e compilalo.

```markdown
---
title: "<titolo esatto della fonte>"
authors: "<autori / org>"
type: paper | blog | report | dataset | leaderboard
arxiv_id: "<id o n/a>"
url: "<URL canonico verificato>"
raw: "<slug>.pdf | <slug>.html | non scaricato (<motivo>)"
published: "<YYYY-MM>"
venue: "<arXiv | NeurIPS | arcprize.org | Kaggle | blog personale | ...>"
benchmark: [arc-agi-1 | arc-agi-2 | arc-agi-3 | altro]
method_family: <program-synthesis | dsl-search | test-time-training | llm-induction | llm-transduction | sampling | frontier-model | survey | benchmark-design | competition-report | other>
best_score: "<es. ARC-AGI-1 semi-private 75.7% | n/a>"
verified: true
verified_date: <YYYY-MM-DD>
tags: [arc-agi, ...]
---

# <Titolo>
**Link:** [<venue>](<url>) · raw locale: `<slug>.pdf|html` · <autori> · <YYYY-MM>

## TL;DR  (2–4 righe)
Cosa è, cosa propone, e il risultato chiave in un colpo d'occhio. Include il numero/punteggio principale se c'è.

## Mid  (mezza pagina)
Problema affrontato · idea centrale · come funziona ad alto livello · risultati principali con numeri · 1–2 limiti. Sufficiente per decidere se leggere il Full.

## Full  (ogni dettaglio)
### Problema e contesto
### Metodo (passo per passo)
Architettura/algoritmo, DSL/primitive se rilevanti, training, augmentation, search, ensembling — tutto ciò che serve per riprodurre il ragionamento.
### Setup sperimentale
Dataset/split (train/eval/public/semi-private/private), hardware, budget di compute e costo $, tempo, vincoli (es. limiti Kaggle), iperparametri se dati.
### Risultati (tutti i numeri recuperati)
Tabella punteggi per benchmark/split; ablation; confronti con baseline. Cita la pagina/sezione se nota.
### Limiti / critiche / domande aperte
### Rilevanza per il RECORD su ARC-AGI-2
Cosa di concreto possiamo riusare/replicare/migliorare; è applicabile sotto i vincoli di compute/costo?
### Collegati (in questa KB)
[[altri-slug]] e link a `METHODS/...`.
### Provenienza
Cosa è stato recuperato (abstract? PDF intero? quali pagine?), quando, e ogni incertezza dichiarata.
```
