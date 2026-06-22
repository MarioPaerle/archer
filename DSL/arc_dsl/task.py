"""Caricamento task ARC-AGI-2 reali + check di un solver (demo-consistency + generalizzazione).

I task di TRAINING hanno anche il test output → possiamo misurare la generalizzazione
(serve per l'error-slicing espressività-vs-selezione-vs-search e per il test MDL).
"""
import json, os
from .core import to_grid

_DATA = os.path.normpath(os.path.join(
    os.path.dirname(__file__), "..", "..", "DATASET", "ARC-AGI-2", "data"))

def load_task(tid, split="training"):
    with open(os.path.join(_DATA, split, f"{tid}.json")) as f:
        d = json.load(f)
    return {
        "train": [(to_grid(p["input"]), to_grid(p["output"])) for p in d["train"]],
        "test":  [(to_grid(p["input"]), to_grid(p["output"])) for p in d["test"]],
    }

def check(solver, task):
    """Ritorna (demo_ok, gen_ok, err). demo_ok = riproduce tutti i demo;
    gen_ok = riproduce anche tutti i test (generalizza)."""
    try:
        demo_ok = all(solver(i) == o for i, o in task["train"])
        gen_ok = all(solver(i) == o for i, o in task["test"])
        return demo_ok, gen_ok, None
    except Exception as e:                       # un programma che crasha = candidato scartato
        return False, False, f"{type(e).__name__}: {e}"
