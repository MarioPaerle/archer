"""dsl_store — save/load ESTERNO in JSON: rappresentazione, regole, soluzioni, dataset.

E' il pezzo che permette il flywheel: risolvi → salvi (rappresentazione + regola)
in JSON → perturbi → generi un mega-dataset (sempre JSON, compatibile col formato ARC).
"""
import json, random
import arcworld as W
from dsl_rules import apply_rule

# ---- griglie ----
def grid_to_json(g): return [list(r) for r in g]
def grid_from_json(j): return tuple(tuple(int(v) for v in r) for r in j)

# ---- RAPPRESENTAZIONE (oggetti) ↔ JSON ----
def scene_to_json(grid):
    s = W.Scene(grid)
    return {"dims": list(s.dims), "bg": s.bg,
            "objects": [{"color": o.color, "size": o.size, "topleft": list(o.topleft),
                         "cells": o.cells_rc_color()} for o in s.objects()]}

# ---- SOLUZIONE (task id + rappresentazione + regola) ↔ JSON ----
def save_solution(path, tid, rule, representation=None, note=""):
    with open(path, "w") as f:
        json.dump({"task": tid, "rule": rule, "representation": representation, "note": note}, f, indent=2)
    return path

def load_solution(path):
    with open(path) as f: return json.load(f)

def save_library(path, entries):
    with open(path, "w") as f: json.dump(entries, f, indent=2)
def load_library(path):
    with open(path) as f: return json.load(f)

# ---- DATASET (pairs input/output) ↔ JSON (formato compatibile ARC) ----
def save_dataset(path, pairs, rule=None):
    with open(path, "w") as f:
        json.dump({"rule": rule,
                   "data": [{"input": grid_to_json(i), "output": grid_to_json(o)} for i, o in pairs]},
                  f, indent=2)
def load_dataset(path):
    with open(path) as f: d = json.load(f)
    return [(grid_from_json(x["input"]), grid_from_json(x["output"])) for x in d["data"]]

# ---- AUGMENTATION: stessa regola, input perturbati (recolor dei "semi"/colori liberi) ----
def augment_recolor(grid, rule, n, fixed=(0, 5), seed=0):
    """Rimappa i colori 'liberi' (non in `fixed`) → n nuovi (input,output) validi sotto la stessa regola."""
    rng = random.Random(seed)
    free = sorted({v for row in grid for v in row if v not in fixed})
    palette = [c for c in range(1, 10) if c not in fixed]
    pairs = []
    for _ in range(n):
        newcols = rng.sample(palette, len(free))
        m = dict(zip(free, newcols))
        inp = tuple(tuple(m.get(v, v) for v in row) for row in grid)
        pairs.append((inp, apply_rule(rule, inp)))
    return pairs
