---
title: "Emulare la verificabilità di Lean per ARC-AGI-2: i proxy di generalizzazione"
project: arc-agi-2-record
updated: 2026-06-09
type: design
status: bozza / ipotesi di lavoro (NON validato)
tags: [verifier, mdl, solomonoff, airv, induction-transduction, learned-verifier, calibration, pass@2, reward-hacking, leave-one-out, arc-agi-2, design]
---

# Emulare la "verificabilità di Lean" per ARC-AGI-2

> **Status: bozza / ipotesi.** Questo è un artefatto `DESIGN/` — roba *nostra* in costruzione. I **fatti** sono citati con slug KB o URL verificato; le **congetture** sono marcate `[CONGETTURA]`. Nulla qui è ancora stato misurato sui 120 eval. È un piano di ricerca, non un risultato.
>
> Punto di partenza: [[../AGENTS/syntheses/dsl-verifier-codesign/synthesis]] (la verificabilità ARC si spacca in *consistency check locale sui demo*, gratis, vs *garanzia di generalizzazione*, impossibile da verificare direttamente → serve un PROXY). Questo file **approfondisce il proxy**.

---

## 0. La domanda in una riga
Lean dà ad AlphaProof un verificatore **globale e perfetto**: se la prova type-checka, è vera per tutti i casi → reward non ingannabile, RL self-bootstrapping ([[../SOURCES/08-alphaproof/_deepdive]]). ARC NON ce l'ha: i demo verificano solo *localmente* e la regola va indotta da 2–5 esempi. **Domanda:** dato un programma/regola candidato che riproduce tutti i demo, con quali segnali — e con quale combinazione calibrata — stimiamo la probabilità che generalizzi al test nascosto, e come riduciamo il reward-hacking?

---

## 1. Inquadramento teorico onesto: perché la garanzia globale è impossibile (e qual è il meglio raggiungibile)

### 1.1 Perché Lean non si trasferisce
In Lean la **spec è data** (un teorema) e il kernel decide *meccanicamente* se la prova la soddisfa **per ogni caso**. In ARC la spec **non è data**: va *indotta* da 2–5 coppie demo. Questo è il problema dell'**induzione**, non della verifica: nessun oracolo può certificare che una regola indotta da pochi esempi sia "quella giusta", perché **infinite regole diverse riproducono gli stessi demo e divergono solo sul test nascosto** (few-shot underdetermination). Non è un limite ingegneristico da chiudere: è la natura del problema. Quindi *non esiste* l'analogo del kernel di Lean per ARC; il massimo raggiungibile è un **proxy probabilistico di generalizzazione**.

Conferma in KB: l'oracolo-demo è esplicitamente "parziale e locale … più simile a un test unitario che a una dimostrazione" ([[../SOURCES/08-alphaproof/_deepdive]] §3). E la misura empirica del danno: in BARC ~**9% dei programmi che fittano gli esempi sono false-positive** (passano i demo, sbagliano il test) ([[../SOURCES/02-llm-induction-transduction-and-o3/2411.02272-combining-induction-and-transduction]], "Full → Setup"). Quel 9% **è esattamente il gap** che nessun consistency-check locale può chiudere.

### 1.2 Qual è il "meglio raggiungibile" — tre lenti teoriche (fatti citati)
- **Solomonoff / MDL (Occam formalizzato).** Tra le ipotesi *consistenti con l'evidenza*, la più corta è la più probabile a priori: il prior di Solomonoff pesa un programma `p` per `2^(−|p|)`, quindi programmi più corti contribuiscono di più (verificato: [grokipedia/Solomonoff](https://grokipedia.com/page/Solomonoff's_theory_of_inductive_inference)). È il fondamento teorico del "programma più corto generalizza meglio". CompressARC ne è l'incarnazione su ARC: niente pretraining, si **minimizza la description length del singolo puzzle** → 20% pass@2 su ARC-AGI-1 eval ([[../SOURCES/05-dsl-neurosymbolic-on-agi2/2512.06104-arc-agi-without-pretraining]]). **Limite onesto:** Solomonoff è *incomputabile*; il MDL pratico dipende dalle primitive scelte ("corto" è informativo solo se le primitive sono gli oggetti giusti — tesi del co-design DSL↔verifier). Su ARC-AGI-2 CompressARC crolla a ~4% (report ARC Prize 2025): la sola compressione per-puzzle non cattura la composizionalità di AGI-2.
- **PAC-Bayes / compression bounds.** I bound di generalizzazione PAC-Bayes sono "un'espressione di Occam: descrizioni più semplici dei dati generalizzano meglio"; un'ipotesi che costa `log₂(1/P(h))` bit dà un termine di complessità più piccolo se è semplice (verificato: [arXiv 2211.13609, PAC-Bayes Compression Bounds](https://arxiv.org/abs/2211.13609); [arXiv 2503.02113](https://arxiv.org/abs/2503.02113)). **Limite:** i bound PAC-Bayes sono significativi nel regime con dati sufficienti; con 2–5 demo per task sono **vacui in pratica** — utili come *intuizione di ranking* (preferisci ipotesi a basso costo di descrizione), non come garanzia numerica. `[CONGETTURA]` il valore per noi è qualitativo: giustifica MDL come segnale di ranking, non fornisce una soglia di confidenza affidabile a 3 esempi.
- **Identificabilità.** Una regola è *identificabile* dai demo solo se i demo sono abbastanza diversi da escludere le alternative. Quando i demo **sottodeterminano** la regola (più candidati ugualmente brevi e consistenti), nessun proxy può scegliere con certezza → la risposta corretta dell'ingegneria è **non collassare a 1 candidato**, ma sfruttare i due tentativi (pass@2) e l'astensione (§3, §6).

> **Sintesi §1:** il meglio raggiungibile è un **punteggio di confidenza calibrato** che combina (a) fit esatto sui demo [necessario, non sufficiente] e (b) un prior di generalizzazione (MDL + invarianza + agreement + verificatore appreso). Lean dà `P(corretto)=1` quando type-checka; noi puntiamo a un `P̂(generalizza)` *ben calibrato* da usare per il ranking → submit top-2.

---

## 2. Catalogo dei segnali di verifica-proxy

Per ciascuno: **cosa misura · costo · quanto è ingannabile (reward-hacking) · evidenza**. La regola d'oro: nessun segnale è un oracolo; il valore sta nella **diversità** (§3, §4).

### (a) Demo-consistency esatta
- **Cosa misura:** il candidato riproduce *esattamente* tutti gli output dei demo (`output == demo` cella per cella). È l'analogo del "checking" cheap di Lean.
- **Costo:** quasi nullo se l'esecutore DSL è veloce (modello-costo da imitare: DDAR di AlphaGeometry, ~secondi, non Lean a giorni — [[../SOURCES/08-alphaproof/_deepdive]] §4e).
- **Ingannabilità:** **alta da solo.** È un *gate necessario ma non sufficiente*: il 9% false-positive di BARC sono tutti demo-consistent. È la metà *gratis* della verificabilità; la garanzia di generalizzazione resta fuori.
- **Evidenza:** cuore dell'induction in BARC ([[.../2411.02272-...]]); "verifier-in-the-loop con i demo come reward" ([[../SOURCES/08-alphaproof/_deepdive]] §4a).

### (b) MDL / parsimonia
- **Cosa misura:** lunghezza di descrizione del programma (+ del residuo) come prior di generalizzazione. Tra i demo-consistent, preferisci il più corto.
- **Costo:** basso (conteggio token/nodi DSL) se la search è già MDL-guidata.
- **Ingannabilità:** **media.** Goodhart: il modello trova *codice-golf* artificialmente corto ma semanticamente sbagliato (primitive opache, costanti hard-coded che "comprimono" l'output di test). Mitigazione: MDL su un **DSL semantico** (le primitive = core-knowledge priors) e penalizzazione delle costanti non derivate dai demo.
- **Evidenza:** Solomonoff/Occam (sopra); CompressARC ([[.../2512.06104-...]]); "greedy MDL" come obiettivo di search ([lewish.io, How to beat ARC-AGI-2](https://lewish.io/posts/how-to-beat-arc-agi-2) — blog, secondario); ranking Solomonoff-inspired con LLM che pesa le ipotesi per *simplicity × predictive fit* su Mini-ARC ([arXiv 2512.17145](https://arxiv.org/abs/2512.17145), verificato — Barber et al., QUT, dic 2025).

### (c) Invarianza/equivarianza sotto augmentation (AIRV)
- **Cosa misura:** una regola *vera* è coerente fra viste trasformate (rotazioni, flip/transpose = gruppo diedrale D₄, permutazioni di colore, shuffle ordine demo). Si applica la trasformazione all'input, si predice, si **inverte** la trasformazione sulla predizione, e si **vota** la griglia più frequente.
- **Costo:** medio (N forward per N augmentations), ma parallelizzabile.
- **Ingannabilità:** **medio-bassa**, ed è proprio il punto di forza: un programma che fitta i demo "per caso" tende a *rompersi* sotto augmentation (predizioni incoerenti dopo il reverse) → il voting lo filtra. Resta gabbabile da bug *equivarianti* (un errore che commuta con D₄).
- **Evidenza:** AIRV di MindsAI/Tufa: zero-shot 5% → +AIRV 13% → +TTFT+AIRV 39% su test privato 100-task AGI-1 ([[../SOURCES/01-test-time-training/2506.14276-dont-throw-baby-out-deep-learning-arc]]). Analogia esplicita col clustering di AlphaCode. CompressARC costruisce l'invarianza *nell'architettura* (equivariant_NN) anziché a valle ([[.../2512.06104-...]]).

### (d) Agreement tra derivazioni indipendenti
- **Cosa misura:** quanto convergono *fonti causali diverse*: induction (programma `f`) vs transduction (predizione diretta di `y_test`); oppure N programmi sintatticamente diversi che producono lo **stesso** output di test. Convergenza indipendente ⇒ evidenza forte (è improbabile che due derivazioni *diverse* sbaglino *allo stesso modo*).
- **Costo:** alto (servono ≥2 pipeline distinte o molti campioni), ma è il segnale con la migliore base teorica anti-hacking.
- **Ingannabilità:** **bassa SE le derivazioni sono davvero indipendenti.** Trappola: se induction e transduction condividono base model + dati sintetici, condividono i *bias* → l'agreement non è indipendente e può concordare su un errore. La complementarità di BARC (risolvono insiemi *disgiunti*) suggerisce indipendenza reale, ma va verificata per-famiglia-di-task.
- **Evidenza:** complementarità induction↔transduction, ensemble 56.75% AGI-1 ([[.../2411.02272-...]], Fig. 5A: i risolti sono largamente disgiunti, stabile su seed). Voting su molti programmi (majority vote di Greenblatt) e Product-of-Experts (sotto). Pattern AlphaProof: "generare-e-verificare > generare-e-fidarsi" ([[../SOURCES/08-alphaproof/_deepdive]] §4d).

### (e) Verificatore / critic NEURALE appreso (value net "passerà il test?")
- **Cosa misura:** una rete addestrata a predire `P(generalizza)` da `(demo, programma/output candidato)`, oltre il voto a livello di risposta. È l'analogo del **value network** di AlphaProof/AlphaZero, o di un **process/outcome reward model**.
- **Costo:** alto in training (servono label: program × {generalizza/no}, ottenibili a costo zero dai 1000 train task perché la soluzione è nota), basso in inference.
- **Ingannabilità:** **alta** — è un modello statistico, *gabbabile per costruzione* (Goodhart sul reward model). MA: i reward model **calibrati** sono meno soggetti a reward-hacking, perché meno dipendenti da correlazioni spurie (verificato: discussione in [arXiv 2402.15610](https://arxiv.org/abs/2402.15610) e affini). Va quindi usato **calibrato** e **mai da solo** (vincolo: pesarlo dentro un ensemble con segnali simbolici non-gabbabili come MDL+tipi).
- **Evidenza:** i learned process rewards "migliorano significativamente la Best-of-N selection oltre il voto a livello di risposta" (letteratura PRM/VPRM verificata: [arXiv 2601.17223 VPRM](https://arxiv.org/abs/2601.17223), [arXiv 2603.01025 One-Token Verification](https://arxiv.org/abs/2603.01025)). Su ARC nessun learned-verifier dedicato è ancora SOTA pubblico `[CONGETTURA: leva poco esplorata]`. Distinzione utile da rubare: **VPRM** = step verificati da check *deterministici esterni* (sul DSL si può fare: ogni primitiva è eseguibile e type-checkabile) vs giudice neurale puro.

### (f) Astensione / calibrazione + uso dei 2 tentativi (pass@2)
- **Cosa misura:** non un programma, ma il **meta-segnale** di confidenza dell'intero stack su quel task. Permette di (i) ordinare i candidati, (ii) decidere *quanto* compute spendere (più budget dove la confidenza è bassa/incerta), (iii) sfruttare pass@2: i due tentativi NON devono essere i due "più probabili" ma i due che **massimizzano la copertura** (es. il top-1 + il miglior candidato di una *modalità diversa* — vedi §3).
- **Costo:** basso (è post-processing sui segnali a–e).
- **Ingannabilità:** la calibrazione *è* la difesa: un punteggio sovra-confidente è il sintomo di hacking. La selective prediction può però **astenersi troppo** se mal tarata ([arXiv 2402.15610](https://arxiv.org/abs/2402.15610), verificato).
- **Evidenza:** la metrica ufficiale è pass@2 ovunque in KB (BARC, CompressARC, PoE: tutti "2 tries"). [CONGETTURA] trattare i 2 tentativi come un **problema di copertura/diversità**, non di top-2-per-probabilità, è una leva sottoutilizzata.

### (g) Consistenza interna del programma (totale? deterministico? type-valido?)
- **Cosa misura:** proprietà *sintattico-semantiche* indipendenti dai demo: il programma è **totale** (definito su tutti gli input plausibili, non va in errore/timeout sul test grid), **deterministico** (nessuna dipendenza da randomness), **type-valido** rispetto all'ontologia oggetti del DSL (objectness, geometria, topologia, conteggio, agency).
- **Costo:** basso (analisi statica + una/poche esecuzioni dry-run).
- **Ingannabilità:** **molto bassa** — sono vincoli *duri*, non statistici, quindi sono il contrappeso anti-Goodhart dei segnali neurali. Il type-system *è parte del verificatore* (tesi del co-design).
- **Evidenza:** il type-layer come parte del verificatore ([[../AGENTS/syntheses/dsl-verifier-codesign/synthesis]] §3.4); VPRM con check deterministici esterni (sopra). [CONGETTURA] un programma che *crasha o è non-totale* sul test grid è un fortissimo segnale negativo, oggi raramente usato come feature di ranking esplicita.

### (h) Auto-simmetria / regolarità interna del task come oracolo
- **Cosa misura:** molti task hanno una **regolarità attesa** (simmetria D₄, periodicità, ripetizione) che la soluzione deve rispettare o completare; a volte la *deviazione* da essa **è** la regola. Quando il task possiede una simmetria/periodicità *propria e osservabile*, un output candidato che la **rompe** è quasi certamente sbagliato → la regolarità di *quel* task diventa un check di verifica per-task.
- **Costo:** basso (detect symmetry/period sui demo e sull'output candidato; primitive `detect_symmetry/complete` del DSL).
- **Ingannabilità:** **bassa** quando la regolarità è forte e osservabile; **assente** (non falso) quando il task non ne ha una.
- **Evidenza:** task di training `4612dd53` (la regola è *marcare le deviazioni dalla simmetria*) → [[dsl-from-real-tasks]] §5; CompressARC costruisce l'equivarianza *nell'architettura* ([[../SOURCES/05-dsl-neurosymbolic-on-agi2/2512.06104-arc-agi-without-pretraining]]).
- **Distinzione da (c):** (c) testa l'equivarianza del *programma* sotto augmentation **esterne**; (h) testa che l'*output* rispetti una regolarità **intrinseca** del task. Complementari — (h) è un proxy *specifico-del-task*, non un prior generico, quindi più vicino a un "check" che a una scommessa. (Aggiunto dal curator integrando l'analisi dei task reali, 2026-06-09.)

---

## 3. Come COMBINARE i segnali in un punteggio di confidenza calibrato

### 3.1 Pipeline a tre stadi
1. **Gate duro (booleano, AND).** Scarta tutto ciò che non è: demo-consistent (a) **AND** type-valido/totale/deterministico (g). Questi sono i segnali **non-gabbabili**: definiscono l'insieme ammissibile `C`. (Niente trade-off qui: un programma che crasha o viola i tipi è fuori, anche se "corto".)
2. **Scoring soft (sui sopravvissuti `C`).** Per ogni candidato calcola un punteggio di confidenza
   `s(c) = w_mdl·MDL(c) + w_inv·Invarianza_AIRV(c) + w_agr·Agreement(c) + w_nn·Critic(c)`
   dove i pesi `w` sono **appresi/calibrati** sui 1000 train task (label note → si può fare regressione/logistica su "ha generalizzato?"). `[CONGETTURA]` un semplice **logistic stacking** dei 4 segnali è probabilmente già meglio di qualsiasi singolo segnale, ed è onesto sul calibrare.
3. **Calibrazione → probabilità.** Mappa `s(c)` in `P̂(generalizza | c)` con isotonic/Platt scaling tarata sui train task tenuti fuori dalla calibrazione (hygiene: split train per la calibrazione, eval *solo* per il giudizio finale). Riporta **reliability diagram** (vedi §6).

### 3.2 Selezione dei 2 tentativi (NON top-2-per-probabilità)
Quando i demo **sottodeterminano** la regola, l'insieme `C` contiene cluster di candidati ugualmente buoni. La mossa giusta `[CONGETTURA, ma con base teorica]`:
- **Tentativo 1** = il candidato con `P̂` massima.
- **Tentativo 2** = il miglior candidato che produce un **output di test diverso** dal Tentativo 1 *e* proviene da una **modalità di derivazione diversa** (es. se T1 è induction, T2 è il miglior transduction; o il rappresentante del secondo cluster di output). Razionale: con pass@2 non vuoi due scommesse correlate sulla stessa ipotesi; vuoi **coprire le due ipotesi più plausibili e distinte**. È l'uso della complementarità (d) come *politica di copertura*, non solo come segnale.
- **Aggregazione output** (quando molti programmi diversi danno output): voto **per-cella** ponderato da `P̂`, in stile Product-of-Experts ([arXiv 2505.07859](https://arxiv.org/abs/2505.07859), Franzen-Disselhoff-Hartmann, 71.6% AGI-1 eval, verificato): combinare gli score *attraverso le augmentation* funziona finché la soluzione vera non riceve probabilità zero sotto *nessuna* augmentation. PoE = realizzazione concreta di "(c) invarianza × (d) agreement" come scorer.

### 3.3 Cosa fare nella sottodeterminazione (più candidati ugualmente buoni)
- **Non collassare** a 1: tieni i cluster, usa pass@2 per coprirne 2.
- **Cerca un demo che discrimini** (§5, leave-one-out): se due candidati concordano su tutti i demo ma divergono su un demo-tenuto-fuori, quello è informativo per il ranking.
- **Astieniti dallo spendere compute extra** dove l'incertezza tra cluster è alta e i tentativi sono già "spesi" bene: meglio allocare budget ai task dove un terzo candidato distinto potrebbe emergere.

---

## 4. Reward-hacking / Goodhart: come ogni segnale è gabbabile e come difendersi

| Segnale | Come si gabba | Difesa |
|---|---|---|
| (a) Demo-consistency | Memorizza i demo, hard-coda l'output per ogni input visto | È solo un **gate**; non entra nello scoring soft. Il vero test è il grid nascosto |
| (b) MDL | Code-golf opaco; costanti hard-coded che "comprimono" un output sbagliato | MDL su **DSL semantico**; penalizza costanti non derivabili dai demo; conta nodi *semantici* non token raw |
| (c) Invarianza | Bug che **commuta** con D₄ (errore equivariante) | Aug. eterogenee (colore + spaziale + ordine demo): un bug raramente è invariante a *tutte* |
| (d) Agreement | Derivazioni che condividono bias (stesso base model/dati) → concordano sull'errore | Forzare **indipendenza**: pipeline davvero diverse (induction simbolica vs transduction neurale); misurare la correlazione degli errori, non assumerla |
| (e) Critic neurale | Goodhart diretto sul reward model | **Calibrazione** (riduce dipendenza da spurie); peso limitato; mai da solo; ancorarlo ai segnali duri (a,g) |
| (f) Calibrazione | Sovra-confidenza sistematica | La calibrazione *è* la metrica di salute; monitora ECE; astieniti se mal tarata |
| (g) Type/totalità | Difficile da gabbare (vincoli duri) | È il **contrappeso**: gli altri segnali soft restano onesti perché filtrati da vincoli non-statistici |

**Principio anti-Goodhart centrale:** la difesa NON è un segnale perfetto, è la **diversità + i vincoli duri**. Un candidato deve passare un gate non-gabbabile (a,g) *e* segnare alto su segnali **eterogenei e poco correlati** (b,c,d,e). Goodhart morde quando si ottimizza *un* proxy; un ensemble di proxy con failure-mode scorrelati è molto più robusto. AlphaProof non ha questo problema (Lean esatto); noi lo mitighiamo, non lo eliminiamo — e **pass@2 è la rete di sicurezza** (basta che la regola giusta sia nei top-2). Questo è coerente con i "residui onesti" della synthesis ([[../AGENTS/syntheses/dsl-verifier-codesign/synthesis]] §6).

---

## 5. Idea forte: il leave-one-out interno come "pseudo-kernel"

**L'idea.** Costruire l'analogo locale di un kernel di verifica tenendo **fuori UN demo come pseudo-test** (leave-one-out, LOO interno). Per ogni candidato `c` demo-consistent:
1. Riaddestra/riinduce `c'` usando solo `k−1` demo;
2. **Verifica `c'` sul demo tenuto fuori** (che ha ground truth nota);
3. Stima `LOO-accuracy(c)` = frazione di fold in cui il candidato indotto dai `k−1` predice correttamente il demo escluso.

Questo è l'**unico segnale che misura direttamente la generalizzazione a un esempio non visto** — qualitativamente diverso da MDL/invarianza, che sono *prior*. È il più vicino che si arriva a un "kernel": un test su dati realmente held-out *dello stesso task*.

**Perché è forte.** Distingue il false-positive dal vero: un programma overfittato ai `k` demo spesso fallisce sul demo escluso. Conferma in letteratura TTT: "leave-one-out tasks" (tieni fuori 1 delle ~3 coppie e predici, con le altre come contesto) sono già usati come obiettivo di test-time training (verificato: [lewish.io research review](https://lewish.io/posts/arc-agi-2025-research-review) — blog secondario; principio coerente con TTFT/demo-loss di MindsAI [[.../2506.14276-...]]). La novità che proponiamo `[CONGETTURA]` è usarlo **come segnale di RANKING/CONFIDENZA**, non solo come dato di training.

**Limiti onesti (perché NON è un kernel vero).**
- **Pochi demo → LOO rumoroso.** Con `k=3` hai 3 fold; con `k=2` ne hai 2 e ogni fold induce da *un solo* esempio (quasi inutile). La varianza della stima è alta. `[CONGETTURA]` LOO è affidabile principalmente per `k≥4`; per `k=2–3` va trattato come segnale *debole*, da pesare meno.
- **Distribution shift demo↔test.** ARC-AGI-2 a volte mette nel test un caso *sistematicamente* fuori dal range dei demo (griglia più grande, più oggetti). Il LOO sui demo non lo cattura → può essere **sovra-ottimista**.
- **Costo.** `k` re-induzioni per candidato → moltiplica il compute. Va riservato ai candidati top-`m` dopo lo scoring §3, non a tutto `C`.
- **Non è globale.** Resta un test su 1 esempio, non su "tutti i casi": è un *pseudo*-kernel, non il kernel di Lean. La sottodeterminazione che divide due candidati *solo* sul test reale non viene risolta dal LOO.

**Variante più ricca `[CONGETTURA]`:** invece di LOO classico, generare **pseudo-test sintetici** col `generate_input` del DSL (stile BARC/ReARC: ogni seed ha un generatore di input) e applicare i candidati lì — più dati held-out, ma con il rischio che la distribuzione sintetica non somigli al test reale.

---

## 6. Piano di valutazione falsificabile

**Obiettivo:** misurare *quale combinazione di segnali predice meglio la generalizzazione*, con igiene di split.

**Igiene di dati (critica).** Sviluppa/calibra sui **1000 train task** (soluzioni note → label di generalizzazione gratis). Usa i **120 eval** SOLO per il giudizio finale, una volta, alla fine. Mai tarare pesi/calibrazione sull'eval. (Coerente con AGENT.md §1.)

**Protocollo.**
1. **Genera il dataset di candidati.** Su ogni train task, produci N programmi demo-consistent (induction + transduction) con la pipeline reale. Etichetta ciascuno `y ∈ {generalizza, no}` eseguendolo sul test (ground truth nota). Questo è il dataset supervisionato per i segnali (e) e per i pesi (§3).
2. **Calcola i 6 segnali** (b–g) per ogni candidato; (a,g) come gate.
3. **Predittività marginale.** Per ogni segnale, AUC/AUPRC nel predire `y`. *Falsificabile:* se un segnale ha AUC ≈ 0.5, è inutile → scartalo.
4. **Predittività combinata.** Stacking logistico dei segnali; confronta con il miglior singolo segnale via AUC e via **task risolti @ pass@2** (la metrica che conta). *Falsificabile:* se la combinazione non batte "MDL + AIRV-voting" da soli, il critic neurale e il resto non valgono la complessità.
5. **Calibrazione.** ECE + reliability diagram di `P̂`. *Falsificabile:* `P̂` mal calibrato ⇒ astensione/allocazione-budget inaffidabili.
6. **Ablation anti-hacking.** Costruisci candidati *adversarial* (code-golf opaco; bug equivarianti) e verifica che la diversità dei segnali li respinga. *Falsificabile:* se un adversarial passa lo scoring, manca un vincolo duro.
7. **Valore del LOO.** Confronta lo scoring con/senza `LOO-accuracy`, **stratificato per `k`** (numero demo). *Ipotesi falsificabile:* LOO aiuta per `k≥4`, è rumore per `k≤3`.
8. **Politica pass@2.** A/B tra "top-2 per `P̂`" vs "top-1 + miglior-candidato-modalità-diversa" (§3.2). *Falsificabile:* se la politica di copertura non aumenta i task risolti, è teoria a vuoto.
9. **Transfer train→eval.** Solo alla fine: la combinazione vincente sui train, applicata ai 120 eval, mantiene il ranking? *Il vero test* di tutta l'impalcatura.

**Error-slicing** (collega a [[../AGENTS/syntheses/dsl-verifier-codesign/synthesis]] §7): per i fallimenti su eval, attribuisci la causa — *espressività* (la regola giusta non era in `C`), *selezione* (era in `C` ma `P̂` l'ha messa fuori dai top-2), *search* (non l'abbiamo generata). Solo il secondo è "colpa del verificatore-proxy"; gli altri due dicono di investire altrove.

---

## 7. Bottom line
Non esiste un kernel di Lean per ARC perché la spec è *indotta*, non *data*: la garanzia globale è teoricamente impossibile (underdetermination). Il meglio raggiungibile è un **`P̂(generalizza)` calibrato** che fonde un **gate duro non-gabbabile** (demo-consistency + type/totalità) con uno **scoring soft di segnali eterogenei** (MDL, invarianza/AIRV, agreement induction↔transduction, critic neurale calibrato), e usa **pass@2 come politica di copertura** più un **LOO interno** come pseudo-test (forte ma rumoroso a pochi demo). La difesa da Goodhart non è un segnale perfetto: è la **diversità dei segnali + i vincoli duri**. Tutto qui è `[bozza/ipotesi]` finché non passa il piano §6 sui train con transfer onesto ai 120 eval.

---

## Fonti
**Verificate in questa sessione (URL reale):**
- [arXiv 2603.20334](https://arxiv.org/abs/2603.20334) — Qiu, Zou, Wang, Yuan, Dai, *Procedural Refinement by LLM-driven Algorithmic Debugging for ARC-AGI-2* (mar 2026). ABPR: candidati = ipotesi dichiarative eseguibili, proof-tree + algorithmic debugging di Shapiro per la *verifica semantica* (quale astrazione/relazione giustifica l'output), non solo outcome. ⚠️ I 98.33% pass@2 sono con GPT-5.5 xHigh su *public eval* (frontier model): contributo rilevante è il **meccanismo** di refinement, non il numero.
- [arXiv 2505.07859](https://arxiv.org/abs/2505.07859) — Franzen, Disselhoff, Hartmann, *Product of Experts with LLMs* (mag 2025). 71.6% AGI-1 *public eval*; scoring PoE su augmentation; serve che la soluzione vera non abbia prob. zero sotto nessuna aug.
- [arXiv 2512.17145](https://arxiv.org/abs/2512.17145) — Barber, Young, Coombe, Browne (QUT/CSIRO), *Solomonoff-Inspired Hypothesis Ranking with LLMs* (dic 2025). Pesa ipotesi per *simplicity × predictive fit*; dimostrato su Mini-ARC.
- [arXiv 2211.13609](https://arxiv.org/abs/2211.13609) (PAC-Bayes Compression Bounds) e [arXiv 2503.02113](https://arxiv.org/abs/2503.02113) — Occam/PAC-Bayes: descrizioni più semplici generalizzano meglio (intuizione di ranking, non garanzia a 3 esempi).
- [grokipedia: Solomonoff](https://grokipedia.com/page/Solomonoff's_theory_of_inductive_inference) — prior `2^(−|p|)`, incomputabilità (riferimento concettuale, fonte enciclopedica → secondaria).
- [arXiv 2601.17223](https://arxiv.org/abs/2601.17223) (VPRM), [arXiv 2603.01025](https://arxiv.org/abs/2603.01025) (One-Token Verification), [arXiv 2402.15610](https://arxiv.org/abs/2402.15610) (selective prediction / abstention) — learned/process verifier, calibrazione anti-reward-hacking, astensione.
- [lewish.io](https://lewish.io/posts/how-to-beat-arc-agi-2) e [research review](https://lewish.io/posts/arc-agi-2025-research-review) — blog **secondari**: greedy-MDL come obiettivo di search, leave-one-out come obiettivo TTT.

**Da SOURCES KB (già verificate):**
- [[../SOURCES/08-alphaproof/_deepdive]] — Lean = oracolo globale; oracolo-demo = locale/parziale; verifier-in-the-loop; generare-e-verificare.
- [[../SOURCES/05-dsl-neurosymbolic-on-agi2/2512.06104-arc-agi-without-pretraining]] — CompressARC, MDL, equivarianza; 20% AGI-1 eval, ~4% AGI-2 (report ARC Prize).
- [[../SOURCES/01-test-time-training/2506.14276-dont-throw-baby-out-deep-learning-arc]] — AIRV (augment-inference-reverse-vote), TTFT.
- [[../SOURCES/02-llm-induction-transduction-and-o3/2411.02272-combining-induction-and-transduction]] — induction↔transduction complementari (56.75% AGI-1); **~9% false-positive** (fittano i demo, sbagliano il test).
- [[../AGENTS/syntheses/dsl-verifier-codesign/synthesis]] — il proxy = MDL + invarianza + agreement + type-consistency; DSL e verificatore co-progettati.

**Resta congettura (non validato):** i pesi/calibrazione del logistic stacking; che LOO aiuti solo per `k≥4`; che la politica pass@2 "copertura" batta "top-2 probabilità"; che un learned-verifier dedicato per ARC sia una leva sottoesplorata; il valore della variante pseudo-test sintetici. Tutto da decidere col piano §6.
