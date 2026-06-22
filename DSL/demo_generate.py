"""demo_generate — genera task stile ARC-AGI-2 col DSL a oggetti, li VALIDA,
li PLOTTA, e stampa rappresentazione + soluzione (normale e in forma DSL).
Uso:  python3 demo_generate.py
"""
import os
from arcdsl import Obj
from arcgen import GENERATORS
from arcplot import show_task

os.makedirs("plots", exist_ok=True)

def main():
    for name, gen in GENERATORS.items():
        pairs, solve, rule_normal, rule_dsl = gen(seed=7)
        # task in formato grid (train = primi pairs, test = ultimo)
        gridpairs = [(i.to_grid(), o.to_grid()) for i, o in pairs]
        task = {"train": gridpairs[:-1], "test": gridpairs[-1:]}

        # VALIDAZIONE: una sola regola (solve) spiega tutti i pair? + non banale?
        ok = all(solve(i) == o for i, o in gridpairs)
        nontrivial = all(i != o for i, o in gridpairs)
        save = f"plots/gen_{name}.png"; show_task(task, save=save)

        # RAPPRESENTAZIONE del primo input (oggetti)
        G = Obj.from_grid(task["train"][0][0]); objs = G.split()

        print(f"===== TASK GENERATO: {name} =====")
        print(f"  valido (1 regola spiega tutto): {ok}   non-banale: {nontrivial}   plot: {save}")
        print(f"  RAPPRESENTAZIONE input0: {G}  -> {len(objs)} oggetti:")
        for nm, o in G.sub.items():
            print(f"     {nm}: color={o.color} size={o.size} topleft={o.topleft}")
        print(f"  SOLUZIONE (normale): {rule_normal}")
        print(f"  SOLUZIONE (DSL)    : {rule_dsl}")
        print()

if __name__ == "__main__":
    main()
