---
title: "RED-TEAM — ARC-AGI-2 è anti-DSL? Il nostro approccio regge?"
status: red-team
type: adversarial-review
updated: 2026-06-14
author: red-team agent (stormo)
disclaimer: "Documento ADVERSARIAL. Scopo: far CROLLARE l'approccio, non confermarlo. Fatti = citati con URL verificato; inferenze = etichettate [INFERENZA]."
approccio_red-teamato: "modello trainato da zero + euristiche forti apprese → neural-guided search in un DSL tipato object-centric (oggetti/sotto-oggetti/link) + verificatore-al-commit + value head + MCTS; data-gen = LLM che scrive nel DSL"
---

# RED-TEAM: ARC-AGI-2 è "fatto apposta" contro i DSL? E il nostro approccio regge?

> Regola d'oro applicata: ogni claim 2025–2026 è verificato sull'URL reale (cutoff modello = gen 2026). I PDF arXiv sono stati letti pagina-per-pagina (il render testuale via fetch falliva sul binario; ho letto il PDF reale). Distinguo **FATTO [fonte]** da **[INFERENZA]**.

---

## D1 — È vero che ARC-AGI-2 è progettato per distruggere chi cerca regole in uno spazio DSL/program-synthesis simbolico?

### Verdetto secco
**NO — non contro i DSL in sé. SÌ — contro la FORZA BRUTA (neurale o simbolica) e contro l'inefficienza.** Il design intent dichiarato prende di mira *exhaustive/brute-force program search* e premia *efficient adaptation*; NON dichiara mai i DSL o il neural-guided program synthesis come bersaglio. Anzi, la posizione ufficiale di ARC Prize **raccomanda esplicitamente** la DL-guided discrete program search su DSL come la strada per battere ARC-AGI. Questo è la migliore notizia possibile per Mario su D1 — ma non chiude D2.

### Prove (verbatim dal paper ufficiale)
Dal technical report **ARC-AGI-2, Chollet et al., arXiv:2505.11831 v2 (19 gen 2026)** — letto direttamente dal PDF, §2 e §3:

- **Cosa è stato preso di mira** (§2, "Task susceptibility to non-generalizable strategies"): «49% of the Private Evaluation set was successfully solved by at least one team. Crucially, the dominant techniques employed by these successful submissions were reported to be variations of **brute-force program search**.» E: «It may reward computational power over the development of more general cognitive architectures. A robust AGI benchmark should ideally minimize susceptibility to such non-generalizable solution strategies.»
- **Il goal di design esplicito** (§3, Goal 3): «**Less brute-forcible.** Intentionally design tasks to minimize susceptibility to naive or computationally intensive **brute-force program search** techniques, since such tasks provide no signal with regard to AGI progress. **This shifts focus further towards efficient adaptation.**»
- **Nessuna menzione di "DSL", "program synthesis guidata", "neural-guided search" come bersaglio** in tutto §2–§3. Il bersaglio nominato è sempre e solo *brute-force / exhaustive search* e l'efficienza. [FATTO: assenza verificata leggendo §1–§6 del PDF.]

Le tre capacità che AGI-2 stressa (symbolic interpretation, compositional reasoning, contextual rule application — dal blog [arc-agi-2-technical-report](https://arcprize.org/blog/arc-agi-2-technical-report), verbatim: «symbols to be interpreted as having meaning beyond their visual patterns», «simultaneous application of multiple rules… that interact», «rules must be applied differently based on context») sono **failure-mode contro il pattern-matching superficiale e la ricerca cieca**, non contro la rappresentazione simbolica. [INFERENZA, ma robusta:] un DSL *object-centric con binding contestuale* è semmai allineato a queste capacità, non antagonista.

### La controprova più forte a favore di Mario su D1
ARC Prize pubblica un manifesto, [How to Beat ARC-AGI by Combining Deep Learning and Program Synthesis](https://arcprize.org/blog/beat-arc-agi-deep-learning-and-program-synthesis), che è quasi una descrizione del nostro approccio. Verbatim:
- «you have to leverage **discrete program search** as opposed to purely manipulating continuous and interpolative embedding spaces learned with gradient descent»
- DL «to **inform discrete search and improve its efficiency**» tramite «intuitive program sketches to guide your search» (= esattamente il nostro neural prior + value head)
- Program synthesis = «combinatorial search over graphs of operators taken from a **domain-specific language, or a DSL**» — descritto come il metodo *giusto*, non come l'errore.
- Sul brute-force: «To beat ARC-AGI this way, you'd need to generate over 100+ million solution programs per task… Practicality rules out O(x^n) search… efficiency matters for intelligence.» → il nemico è l'enumerazione, **non** il DSL.

**Conclusione D1:** la tesi di Mario su D1 è confermata dalla fonte primaria. AGI-2 punisce la *forza bruta* e l'*inefficienza*. Un DSL tipato con search guidata euristicamente NON è il bersaglio del design — è la ricetta che ARC Prize stessa raccomanda. **MA: "ARC Prize raccomanda l'approccio" non implica "l'approccio funziona". Nessuno l'ha ancora portato a record con un DSL fisso. Vedi D2.**

---

## D2 — Cosa invaliderebbe il nostro intero approccio? (minacce ordinate per gravità)

Premessa onesta: la tesi di Mario è *"se il problema è SOLO la search brute-force in uno spazio che esplode, allora trainando da 0 con euristiche forti non abbiamo né il problema della profondità (la trainiamo) né dello spazio (cerchiamo solo in direzioni buone)."* Il punto debole della tesi è l'**implicito "se il problema è SOLO la search"**. Le minacce sotto attaccano proprio quel "SOLO".

---

### MINACCIA #1 — Il muro NON è la search: è l'ESPRESSIVITÀ del DSL. Euristiche perfette non aiutano se la regola non è esprimibile. (gravità: FATALE se non mitigata)

**Tesi:** la nostra ottimizzazione ("cerchiamo solo in direzioni buone") risolve il problema della *search*. Ma i dati dicono che il collo di bottiglia su AGI-2 è a monte: un DSL fisso **non esprime la regola**. Una value head e un MCTS perfetti che guidano la ricerca in uno spazio che *non contiene la soluzione* trovano, con efficienza ottimale, niente.

**Evidenza (verificata):**
- **Ouellette, "Towards Efficient Neurally-Guided Program Induction for ARC-AGI", arXiv:2411.17708** (letto dal PDF, §"The Problem"): l'intero paradigma neural-guided assume l'espressività: «We assume that the Domain Specific Language (DSL) includes all the necessary primitives to solve each test task. The goal is to search… as efficiently as possible.» E, devastante per chi crede che basti la search: «if it were not the case [che il test sia OOD rispetto al train], a neural network would be sufficient to solve this problem domain.» → il valore del program-synthesis sta *tutto* nell'OOD, ma l'OOD è proprio dove un DSL fisso può non contenere il primitivo necessario.
- **GridCoder2 / Ouellette, arXiv:2507.15877**: sul *training* set reale di AGI-2 **solo ~1.5% dei task (~18) è esprimibile nel suo DSL** (poi ne risolve l'83% — cioè *quando esprimibile la search funziona benissimo*). Il collo è l'espressività, non la search. [FATTO via KB + survey 2603.13372; il PDF non si è decodificato via fetch ma il numero è triangolato da due fonti.]
- Survey/blog (via [arc-prize-2025-results-analysis](https://arcprize.org/blog/arc-prize-2025-results-analysis)): i sistemi che *non* usano un DSL fisso vincono. Il paper award 2°, SOAR, fa «52% **without human-engineered DSLs**» (programmi in Python/NL). Il 1° Kaggle (NVARC, 24%) usa TTT + TRM, **nessun DSL**.

**Quanto è fatale:** molto. È la critica n.1 in KB (`dsl-verifier-codesign/synthesis.md §5`) e i dati la confermano dall'esterno. Se il DSL non scala in espressività, la qualità delle euristiche è irrilevante.

**Come la mitighiamo (o no):** la KB ha già la risposta giusta in teoria (`synthesis.md §4`): **core operativo granulare e "totipotente" sulle griglie** (alla Lean: kernel minimo in cui *tutto* è esprimibile) + type-layer semantico + library learning che fa *crescere* le primitive. → MITIGABILE **solo se** il DSL è davvero Turing-completo/totipotente al livello-base e le astrazioni emergono, NON se è un set fisso di ~22 unit-pattern alla CoreThink. **Rischio residuo non chiuso:** "granulare ma semantico in cui corto=naturale" è esattamente il punto dove icecuber/Hodel/ARGA hanno fatto plateau per 5 anni. Nessuno ha dimostrato che library learning lo sblocchi a scala su AGI-2. **Questa è la scommessa centrale, non un dettaglio implementativo.**

---

### MINACCIA #2 — Il problema vero è l'INDUZIONE da pochi demo (few-shot underdetermination), non la generazione del programma. La nostra pipeline ottimizza la parte facile. (gravità: ALTA, strutturale)

**Tesi:** noi trattiamo ARC come "trova un programma che riproduce i demo, guidato da euristiche". Ma riprodurre 2–5 demo è *sotto-determinato*: infiniti programmi (anche corti, anche type-validi) li riproducono e sbagliano il test nascosto. Il MCTS + value head + verificatore-al-commit ottimizzano la **demo-consistency**, che è un *proxy* di generalizzazione, non la generalizzazione. AlphaProof ha un kernel esatto (reward perfetto); noi no.

**Evidenza (verificata):**
- Paper AGI-2 §3 Goal 3: il design «shifts focus towards **efficient adaptation**» — cioè *inferire la regola*, non *cercare programmi*.
- Survey 2603.13372 (via search verificata) sull'underdetermination: «a candidate program may execute correctly while encoding the wrong abstraction — e.g. a reachability hypothesis may define reachable as a two-hop relation rather than as transitive closure.» → demo-consistent ma sbagliato. Questo è **reward-hacking del proxy** (Goodhart), già marcato come residuo onesto in `synthesis.md §6`.
- Il verificatore-al-commit dà garanzia **locale** (sui demo), non **globale** (sul test). La KB lo riconosce esplicitamente (`synthesis.md §2`): «la globalità non trasferisce».

**Quanto è fatale:** strutturale ma non fatale. È il muro *irriducibile* condiviso da TUTTI i metodi su ARC (anche gli LLM). Non invalida noi più degli altri — ma invalida la parte "ottimista" della tesi di Mario: anche con search perfetta e DSL espressivo, il sistema può convergere fiducioso sulla regola sbagliata. La search efficiente *non* è sufficiente.

**Come la mitighiamo:** la KB ha un piano serio (`verifiability-emulation`: 7+1 segnali, MDL, invarianza/AIRV, agreement induction/transduction, leave-one-out come pseudo-kernel, gate duro anti-Goodhart, pass@2). → MITIGABILE ma **mai chiudibile**: il proxy non sarà mai il kernel di Lean. È l'unico punto irriducibilmente diverso dalla matematica e va accettato, non "risolto".

---

### MINACCIA #3 — "Trainare da zero + dati sintetici" è proprio la modalità che ARC Prize segnala come NON generalizzante. Il bias da imparare potrebbe non venire dai dati sintetici. (gravità: ALTA)

**Tesi:** il nostro data-gen è "un LLM che scrive nel DSL". Quindi le euristiche forti si imparano da una distribuzione *generata da noi*. AGI-2 è OOD *per design* (test qualitativamente distinto dal train). Se il modello impara la distribuzione del nostro generatore, ha imparato il nostro bias, non quello di AGI-2.

**Evidenza (verificata):**
- [arc-prize-2025-results-analysis](https://arcprize.org/blog/arc-prize-2025-results-analysis), verbatim: «Current AI reasoning performance is tied to model knowledge.» Il report 2025 (via search verificata su arxiv 2601.10904): i vincitori hanno avuto bisogno di *centinaia di migliaia* di esempi sintetici per arrivare al 24%, e questo è descritto come «reasoning remains **knowledge-bound**… a new form of overfitting», distinto dalla generalizzazione umana.
- Ouellette 2411.17708 (dal PDF): i dati sintetici generati per addestrare la value/distance head **contengono ground-truth sovrastimate** (es. "rotate 90 ×3" ha distanza-1, non 3) → «This is arguably one of the weaknesses of applying supervised learning to a cost-to-go type of approach.» Cioè la *nostra* value head, allenata su trasformazioni sintetiche, può imparare una metrica sbagliata. [FATTO, fonte primaria.]
- Tesi "open-world" di Chollet (manifesto + Ouellette abstract, verbatim): «ARC-AGI is an **open-world problem domain**… interpolation-based techniques like Deep Learning can be **sub-optimal**.» → un modello trainato da zero su dati sintetici è interpolazione su una distribuzione che noi definiamo; l'extrapolation OOD è ciò che AGI-2 misura.

**Quanto è fatale:** alta. È un attacco diretto al cuore "trainato da zero con euristiche apprese". Se le euristiche generalizzano solo *dentro* la distribuzione del nostro LLM-generator, AGI-2 (OOD by design) le buca.

**Come la mitighiamo (o no):** parzialmente. La leva è (a) un DSL/core-knowledge prior abbastanza *generale* da rendere il bias appreso quello dei prior cognitivi (objectness, geometria, conteggio) e non quello del generatore; (b) la ricetta AlphaProof/AlphaGeometry di **RL su varianti auto-generate a difficoltà crescente** per spingere la distribuzione verso l'OOD. **Rischio residuo:** non c'è prova che un generatore-LLM-nel-DSL produca la *novelty compositiva* di AGI-2; potrebbe produrre solo ricombinazioni note. Questo è non-validato e va testato presto.

---

### MINACCIA #4 — Costo/efficienza: MCTS + value head + LLM-data-gen rischiano di violare il vincolo che è LA metrica di AGI-2. (gravità: MEDIA-ALTA, ma fatale per l'eleggibilità)

**Tesi:** AGI-2 ha promosso "efficient adaptation" e "cost per task" a *metrica di design* (paper §3). Il record eleggibile è 4×L4, ~12h, no-internet, pass@2 (KB cartella 04). Un MCTS profondo + value head + (peggio) un LLM nel loop per data-gen può sforare. NVARC fa 24% a **$0.20/task** senza nulla di tutto questo.

**Evidenza (verificata):** paper §3 Goal 3 promuove l'efficienza come segnale di AGI; manifesto ARC Prize: «efficiency matters for intelligence». KB cartella 04: Grand Prize garantito alla migliore OSS *dentro i vincoli compute*; un metodo è leva «solo se sta nel budget».

**Quanto è fatale:** non invalida l'*idea*, invalida l'*eleggibilità al record* se mal progettato. L'LLM-data-gen va fatto **offline** (pre-training), non a test time — se è chiaro questo, la minaccia scende. Il MCTS a test-time è il vero rischio di budget.

**Come la mitighiamo:** data-gen rigorosamente offline; MCTS con budget capato e neural prior forte che riduce la profondità necessaria (è esattamente il senso di "euristiche forti" di Mario). MITIGABILE by design.

---

### MINACCIA #5 (la più subdola) — Il successo di chi NON usa un DSL fisso suggerisce che il DSL sia il vincolo sbagliato. (gravità: MEDIA, strategica)

**Tesi:** i due migliori risultati program-synthesis-like del 2025 evitano il DSL fisso: SOAR «52% without human-engineered DSLs» (Python evolutivo) e Berman 29.4% AGI-2 (programmi in *natural language*). Lo spazio "programmi in linguaggio naturale / Python aperto" non ha tetto di espressività. Stiamo scegliendo, per controllabilità (typing, verificatore), la rappresentazione che storicamente fa plateau.

**Evidenza (verificata):** [arc-prize-2025-results-analysis](https://arcprize.org/blog/arc-prize-2025-results-analysis): paper award 2° = SOAR 52% senza DSL; honorable mention = evolutionary test-time compute su programmi NL; survey 2603.13372: Berman 29.4% (NL programs) è il *top* AGI-2 noto. Nessun sistema basato su DSL-fisso-tipato è in cima.

**Quanto è fatale:** strategica. Il typing/verificatore ci dà MDL e invarianza calibrate (vantaggio reale su underdetermination, Minaccia #2) ma ci costa espressività (Minaccia #1). È un trade-off, non una condanna — *purché* il core sia totipotente. [INFERENZA] Il DSL tipato batte i programmi-NL **solo se** il type-layer compra più (anti-Goodhart) di quanto l'espressività perda. Non dimostrato.

---

## BOTTOM LINE onesto

**D1: regge.** ARC-AGI-2 è progettato contro la **forza bruta** (neurale e simbolica) e contro l'**inefficienza**, non contro i DSL. Fonte primaria (arXiv:2505.11831 §2–§3) + manifesto ARC Prize che *raccomanda* DL-guided program search su DSL. La premessa di Mario ("il nemico è la brute-force search") è **corretta**.

**D2: il nostro lavoro regge come SCOMMESSA ben posta, NON come tesi dimostrata.** La tesi di Mario contiene un assunto nascosto — *"il problema è SOLO la search"* — che è **falso o incompleto**. Le prove dicono che ci sono almeno due problemi più profondi della search:
1. **Espressività del DSL (Minaccia #1)** — euristiche perfette non trovano ciò che il DSL non esprime. È IL muro, con dati (1.5% esprimibile).
2. **Induzione da pochi demo / underdetermination (Minaccia #2)** — anche con DSL espressivo e search perfetta, demo-consistent ≠ corretto. Manca il kernel esatto di Lean.

**Cosa farebbe CROLLARE il lavoro, concretamente:**
- Se il DSL "granulare-ma-totipotente + library learning" **non** sblocca l'espressività a scala (cioè se replichiamo il plateau icecuber/Hodel/ARGA): crollo per Minaccia #1. → **da falsificare SUBITO** con l'error-slicing espressività-vs-selezione-vs-search sui 120 eval (già in `synthesis.md §8`). Se la maggioranza dei fallimenti è "non esprimibile", il neural-guided search non è la leva giusta e va ripensata la rappresentazione (verso programmi aperti, vedi Minaccia #5).
- Se le euristiche apprese dal LLM-data-gen generalizzano solo in-distribution (Minaccia #3): crollo silenzioso su AGI-2 OOD. → testare la generalizzazione OOD del prior PRIMA di costruire tutto il MCTS.

**La minaccia più seria: #1 (espressività).** Non perché sia la più probabile, ma perché è quella su cui la tesi di Mario è *strutturalmente cieca*: la sua argomentazione ottimizza la search e l'espressività è ortogonale alla search. È anche l'unica con un numero esterno schiacciante (1.5%). Tutto l'approccio sta in piedi o cade sul fatto che il *core operativo sia davvero totipotente e le astrazioni emergano* — e quello è ancora non dimostrato da nessuno su AGI-2.

**Raccomandazione red-team:** prima di investire nel MCTS/value head (la parte che la KB stessa chiama "il pezzo meno trasferibile di AlphaProof"), chiudere l'esperimento falsificabile §8: misurare quanta parte del gap è espressività. Se è espressività, l'intera architettura va riorientata. Se è selezione/search, allora — e solo allora — la tesi di Mario è pienamente in piedi.

---

## Fonti verificate (URL reale aperto/letto)
- ARC-AGI-2 technical report — Chollet et al., **arXiv:2505.11831 v2** (PDF letto pagine 1–6): https://arxiv.org/pdf/2505.11831 — §2 (49% brute-force) e §3 Goal 3 ("Less brute-forcible", "efficient adaptation") VERBATIM.
- ARC-AGI-2 technical report (blog) — https://arcprize.org/blog/arc-agi-2-technical-report — 3 capacità VERBATIM; "minimize susceptibility to brute-force program search".
- ARC Prize manifesto — https://arcprize.org/blog/beat-arc-agi-deep-learning-and-program-synthesis — DL-guided discrete program search su DSL raccomandata; "100+ million programs / efficiency matters" VERBATIM.
- ARC Prize 2025 Results & Analysis — https://arcprize.org/blog/arc-prize-2025-results-analysis — "reasoning tied to model knowledge"; SOAR 52% senza DSL; vincitori TTT/TRM senza DSL.
- Ouellette, "Towards Efficient Neurally-Guided Program Induction for ARC-AGI" — **arXiv:2411.17708** (PDF letto pp.1–2): "we assume the DSL includes all necessary primitives"; open-world / DL sub-optimal; ground-truth sintetiche sovrastimate VERBATIM.
- Ouellette, "OOD Generalization… Execution-Guided NPS vs TTFT" — **arXiv:2507.15877** (~1.5% AGI-2 esprimibile; triangolato KB + survey; PDF non decodificato via fetch).
- The ARC of Progress (Living Survey) — **arXiv:2603.13372** (via search verificata): underdetermination "two-hop vs transitive closure"; mediana AGI-2 26%; Berman 29.4% NL programs.
- ARC Prize 2025 Technical Report — **arXiv:2601.10904** (via search verificata): knowledge-bound, sintetici a scala, nuovo overfitting.

## Note di metodo / limiti onesti
- 2505.11831 e 2411.17708 letti dal PDF reale (render testuale del fetch falliva sul binario → ho usato il file scaricato). Quote marcate VERBATIM sono trascritte dal PDF.
- 2507.15877, 2603.13372, 2601.10904: i PDF non si sono decodificati via fetch; i numeri usati sono **triangolati** tra search verificata e KB esistente, e marcati come tali. Il claim "1.5% esprimibile" è in KB da due fonti ma **non l'ho ri-letto verbatim dal PDF in questa sessione** → [da ri-verificare verbatim se diventa load-bearing per una decisione].
- "Berman 29.4% / SOAR 52% senza DSL" da blog/search; blog primari Berman non aperti in questa sessione.
