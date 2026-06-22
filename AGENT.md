---
title: "AGENT.md — Knowledge Base ARC-AGI-2 (entry point)"
project: arc-agi-2-record
updated: 2026-06-08
status: living document
---

# AGENT.md — Guida d'accesso alla KB ARC-AGI-2

> **Leggi questo file per primo.** È il contratto operativo per chiunque (Mario o un agente) lavori in questa KB.

> 📋 **Task tracking → [[LINEAR.md]].** Il lavoro (cosa fare / chi / stato) vive su **Linear** (team `Panisperna`/PAN, MCP `linear-server`). Regola permanente di Mario: **ogni agente che lavora su ARC-AGI-2 usa Linear e lo tiene aggiornato** (orienta con `list_issues` prima di proporre, apri issue per il lavoro nuovo, sposta lo stato a In Progress/Done). Tutto ciò che va su Linear è in **inglese**. Dettagli e convenzioni in `LINEAR.md`.

---

## 0. Perché questa KB esiste (la missione)
Questa KB è il **cervello condiviso e durevole** di una **squadra agentica** con un obiettivo unico: **fare un record su ARC-AGI-2**. Esiste perché:
- La conoscenza su ARC è dispersa (paper, blog, report, writeup di gara, codice) e **cambia in fretta** (cutoff modello = gen 2026, ma il dominio corre nel 2025–2026). Serve un punto unico, verificato, navigabile.
- Gli agenti **non hanno memoria tra le sessioni**: senza una KB il lavoro evapora. Qui il sapere **si accumula** invece di ripartire da zero ogni volta.
- Per puntare a un record servono tre cose insieme: sapere **cosa è stato provato** (e cosa ha funzionato/fallito e *perché*), conoscere **i vincoli reali** (compute/costo/regole), e avere **idee falsificabili** su dove spingere. La KB tiene tutte e tre allineate alle fonti.

La KB risponde a 4 domande:
1. **Cos'è** ARC-AGI-1 / 2 / 3 e come sono fatti i task.
2. **Cosa è stato provato** (ogni famiglia di metodi), cosa funziona, cosa no, e perché.
3. **Qual è lo stato dell'arte** (timeline punteggi con split) e i **vincoli** (compute, costo, regole Kaggle).
4. **Dove sono le leve di record**: failure-mode di ARC-AGI-2 e direzioni promettenti.

---

## 1. Regola d'oro: zero allucinazioni (NON negoziabile)
- **Non inventare** mai titoli, autori, ID arXiv, URL, numeri, punteggi, date.
- Ogni fonte entra **solo dopo verifica**: apri l'URL reale (`arxiv.org/abs/<id>` o l'URL canonico) e conferma titolo/autori/data.
- I numeri (punteggi %, costi $, compute) vengono **solo dal materiale recuperato**, mai dalla memoria del modello. ⚠️ Cutoff modello = gen 2026 → **tutto il 2025–2026 va verificato via web**.
- Ogni punteggio va riportato col suo **split** (public eval / semi-private / private Kaggle) e **benchmark** (AGI-1 vs 2 vs 3). Un 85% su semi-private ≠ un 85% sul private del Grand Prize.
- Se non sai una cosa, **scrivilo**: `non specificato nella fonte recuperata`. Un buco dichiarato batte un dato falso.
- Quando due fonti (o due agenti) si contraddicono: **verifica sulla fonte primaria** e dichiara la discrepanza; non sceglierne una a caso (vedi la correzione P5/P6 di IMO 2024 in `08-alphaproof`).

---

## 2. Struttura della KB
```
ArcAgi-2/
├── AGENT.md                  ← questo file
├── README.md                 ← onboarding rapido
├── TEMPLATE.md               ← template fonte a 3 livelli (TL;DR / Mid / Full)
├── SOURCES/                  ← STRATO FONTI: paper/blog/report (raw scaricati + riassunti)
│   ├── _index.md             ← catalogo MASTER (76 fonti)
│   ├── 00-arc-agi-1-benchmark-and-dsl/        ├── 05-dsl-neurosymbolic-on-agi2/
│   ├── 01-test-time-training/                 ├── 06-winning-solutions-agi2/  (NVARC, TRM, HRM, URM)
│   ├── 02-llm-induction-transduction-and-o3/  ├── 07-alphageometry/   (+ _deepdive)
│   ├── 03-arc-agi-2-and-frontier-results/     └── 08-alphaproof/      (+ _deepdive)
│   └── 04-arc-prize-competitions-and-2026/
├── METHODS/                  ← STRATO COGNITIVO: sintesi trasversali
│   ├── taxonomy.md           ← tassonomia di TUTTI gli approcci
│   ├── leaderboard.md        ← timeline SOTA AGI-1 & 2 (ogni numero con fonte + split)
│   └── failure-modes.md      ← perché AGI-2 è duro = le leve di record
├── AGENTS/                   ← chi lavora sulla KB e come
│   ├── roles/                ← researcher, summarizer, curator, strategist
│   ├── playbook.md           ← come la squadra punta al record
│   └── syntheses/            ← ragionamenti tematici (es. neurosymbolic-reasoning, dsl-verifier-codesign)
├── DATASET/                  ← clone reale ARC-AGI-2 (1000 train + 120 eval) + dataset-guide.md (task annotati)
├── DESIGN/                   ← artefatti di progetto che COSTRUIAMO noi (es. il DSL) — non fonti esterne
├── CONVERSATIONS/            ← il MEGLIO di ogni sessione, distillato (vedi §6)
└── FLYWHEEL/                 ← come usiamo Flywheel per tracciare/eseguire gli esperimenti
```

### I quattro tipi di contenuto (non confonderli)
- **SOURCES/** = fonti esterne verificate (raw + riassunto, stesso slug).
- **METHODS/** + **AGENTS/syntheses/** = ragionamento *sulle* fonti (niente dati nuovi: ogni numero rimanda a uno slug).
- **DESIGN/** = roba **nostra** in costruzione (il DSL, architetture proposte). Può contenere ipotesi non ancora validate, ma **etichettate come tali**.
- **CONVERSATIONS/** = distillato delle sessioni (decisioni, intuizioni, prossimi passi), così il sapere non evapora.

---

## 3. Come LEGGERE la KB
1. `README.md` per l'onboarding. 2. `METHODS/taxonomy` → mappa approcci. 3. `METHODS/leaderboard` → dove siamo (con split). 4. `METHODS/failure-modes` → dove cercare il record. 5. `SOURCES/_index.md` → tutte le fonti; scendi sui singoli `.md`. 6. `CONVERSATIONS/` → cosa abbiamo già capito nelle sessioni passate. 7. `DESIGN/` → cosa stiamo costruendo.

## 4. Naming
- **Slug paper arXiv**: `<arxiv_id>-<titolo-kebab>` (es. `2510.04871-less-is-more-tiny-recursive-networks`).
- **Slug blog/report**: `<YYYY-MM>-<fonte>-<titolo-kebab>` (es. `2024-12-arcprize-oai-o3-breakthrough`).
- Raw e riassunto condividono lo slug (associazione 1:1).
- Conversazioni: `CONVERSATIONS/<YYYY-MM-DD>-<topic-kebab>.md`.

## 5. Come AGGIUNGERE una fonte (procedura obbligatoria)
1. **Verifica** l'URL reale → titolo/autori/data. Se 404 o titolo diverso, trova quello giusto o NON aggiungere.
2. **Scarica il raw**: `curl -L -A "Mozilla/5.0" -o "<folder>/<slug>.pdf" "https://arxiv.org/pdf/<id>"` (verifica `head -c5` = `%PDF`, >50KB); blog → `.html` (>5KB). PDF binari: leggi il corpo con `pdftotext`. Se il download fallisce, **dichiaralo** nel `.md` e tieni il riassunto verificato.
3. **Scrivi** `<slug>.md` col template a 3 livelli (`TEMPLATE.md`): prosa italiana, termini tecnici inglesi.
4. **Aggiorna** `SOURCES/<folder>/_index.md` e, se cambia il quadro, `METHODS/`.

## 6. ⭐ Salvare il MEGLIO di ogni chat (convenzione permanente)
> Regola di Mario: **ogni sessione lascia una traccia.** Le idee migliori non restano in chat.

Alla fine di una sessione significativa (o quando emerge un'intuizione forte), crea/aggiorna **`CONVERSATIONS/<YYYY-MM-DD>-<topic>.md`** con questo formato:
```markdown
---
date: <YYYY-MM-DD>
topic: <topic>
participants: [mario, <agente>]
status: insight | decision | open
---
# <Titolo>
## In una riga
## Cosa abbiamo capito        # le intuizioni chiave, falsificabili
## Decisioni prese
## Domande aperte / prossimi passi
## Dove vive in KB             # link a SOURCES/METHODS/DESIGN/synthesis prodotti
```
Regole: **distilla, non incollare il transcript.** Se l'intuizione è tematica e attraversa più fonti → diventa anche una `AGENTS/syntheses/<tema>/`. Se è un artefatto da costruire → va in `DESIGN/`. Se diventa un esperimento → nodo Flywheel (`FLYWHEEL/usage.md`). Il file in `CONVERSATIONS/` resta il **puntatore** che lega tutto e dice "qui ci siamo arrivati".

## 7. Lo "stormo" (pattern di lavoro)
Per coprire un'area si lanciano **agenti in parallelo**, ognuno **proprietario di UNA sola cartella** `SOURCES/NN-*` (niente scritture in conflitto), che seguono `AGENTS/roles/researcher.md` + `summarizer.md` e la procedura §5. Poi un **curator** assembla `SOURCES/_index.md` + `METHODS/`, e uno **strategist** aggiorna `failure-modes` e le syntheses. Ogni agente lascia un **manifest** (file creati, fonti verificate, candidati non verificati, download falliti).

## 8. Stato
- 9 filoni `SOURCES/` · **76 fonti** verificate · ~105 MB · dataset clonato (1000+120) · METHODS assemblati · 2 syntheses (neurosymbolic-reasoning, dsl-verifier-codesign) · DESIGN attivo (DSL v0).
- Candidati non verificati: in fondo a ogni `_index.md` sotto "Da verificare" — **non citarli come fatti**.
