"""Esegue i solver scritti a mano contro i task reali e stampa demo-consistency
+ generalizzazione. È il primo mattone dell'error-slicing espressività-vs-search.
Uso:  python3 run_check.py
"""
from arc_dsl.task import load_task, check
from arc_dsl.solvers import SOLVERS

def main():
    ok = 0
    print(f"{'task':<10} {'demo':<6} {'gen':<6} note")
    print("-" * 40)
    for tid, solver in SOLVERS.items():
        task = load_task(tid, "training")
        demo, gen, err = check(solver, task)
        note = err or ("ESPRIMIBILE + generalizza" if gen else "demo ok, NON generalizza" if demo else "")
        print(f"{tid:<10} {str(demo):<6} {str(gen):<6} {note}")
        ok += int(gen)
    print("-" * 40)
    print(f"generalizzano: {ok}/{len(SOLVERS)}")

if __name__ == "__main__":
    main()
