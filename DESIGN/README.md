# DESIGN/ — artefatti che costruiamo noi

A differenza di `SOURCES/` (fonti esterne verificate) e `METHODS/` (ragionamento sulle fonti), qui vivono le **cose nostre in costruzione**: il DSL, le architetture proposte, gli schemi di pipeline. Possono contenere **ipotesi non ancora validate**, ma devono essere **etichettate come tali** (la regola d'oro vale: niente numeri inventati spacciati per risultati).

## Artefatti
| Artefatto | Stato | Nota |
|-----------|-------|------|
| [[dsl-v0]] | bozza v0.1 (2026-06-08) | DSL tipato a due strati + verificatore co-progettato; primitive aggiornate dai task reali |
| [[dsl-from-real-tasks]] | analisi empirica (2026-06-08) | 8 task di training risolti a mano → primitive necessarie; conferma "buco = selettore" |
| [[verifiability-emulation]] | bozza/ipotesi (2026-06-09) | come emulare la verificabilità di Lean: 7+1 segnali-proxy, `P̂(generalizza)` calibrato, leave-one-out pseudo-kernel, anti-Goodhart |
| [[redteam-is-agi2-anti-dsl]] | red-team (2026-06-14) | AGI-2 è anti-DSL? NO (anti-brute-force). Il nostro approccio regge come scommessa; minaccia #1 = espressività del DSL (test prima dell'MCTS) |

Razionale e quadro d'insieme: [[../AGENTS/syntheses/dsl-verifier-codesign/synthesis]].
Le due metà del co-design: **DSL** = `dsl-v0` + `dsl-from-real-tasks`; **verificatore** = `verifiability-emulation`.
