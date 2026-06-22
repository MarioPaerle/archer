"""demo_save_augment — il flywheel in piccolo:
  1) regole dichiarative dei task risolti, verificate sui dati reali;
  2) salva/carica (rappresentazione + regola) in JSON;
  3) augmentation: stessa regola + input perturbati → mega-dataset JSON.
Uso:  python3 demo_save_augment.py
"""
import os, json
from arcworld import load_task, check
from dsl_rules import apply_rule, perturb_rule
from dsl_store import (scene_to_json, save_library, load_library,
                       save_dataset, load_dataset, augment_recolor)

os.makedirs("solutions", exist_ok=True)

# (rappresentazione giusta + regola) di ogni task risolto — TUTTO serializzabile
LIBRARY = [
    {"task": "e69241bd", "rep": "holes-as-objects + colored sub-object",
     "rule": {"op": "recolor_holes_by_subobject", "params": {"wall": 5}}},
    {"task": "5582e5ca", "rep": "whole grid, color histogram",
     "rule": {"op": "fill_grid", "params": {"selector": "most_common"}}},
    {"task": "007bbfb7", "rep": "self-similar tiling, per-cell predicate",
     "rule": {"op": "self_tile", "params": {"pred": {"op": "neq", "value": 0}}}},
    {"task": "cce03e0d", "rep": "self-similar tiling, per-cell predicate",
     "rule": {"op": "self_tile", "params": {"pred": {"op": "eq", "value": 2}}}},
    {"task": "00576224", "rep": "tile RxC with per-row transform",
     "rule": {"op": "tile_alt", "params": {"rows": 3, "cols": 3, "row_alternation": ["id", "reflect_h"]}}},
    {"task": "4258a5f9", "rep": "per-seed stamp",
     "rule": {"op": "frame_each", "params": {"ring_color": 1, "size": 3}}},
]

def main():
    print("=== 1) verifica regole dichiarative sui dati reali ===")
    for e in LIBRARY:
        t = load_task(e["task"])
        demo, gen, err = check(lambda g, r=e["rule"]: apply_rule(r, g), t)
        print(f"  {e['task']}: demo={demo} gen={gen} {err or ''}   rule={e['rule']['op']}")

    print("\n=== 2) save/load JSON (libreria di soluzioni: rappresentazione+regola) ===")
    save_library("solutions/library.json", LIBRARY)
    lib = load_library("solutions/library.json")
    t = load_task(lib[0]["task"])
    demo, gen, _ = check(lambda g, r=lib[0]["rule"]: apply_rule(r, g), t)
    print(f"  ricaricata library.json ({len(lib)} regole); re-verifico {lib[0]['task']}: demo={demo} gen={gen}")
    # rappresentazione di un input in JSON
    rep = scene_to_json(load_task("e69241bd")["train"][0][0])
    print(f"  scene_to_json(e69241bd in0): {len(rep['objects'])} oggetti, dims={rep['dims']}, primo={rep['objects'][0]}")

    print("\n=== 3) AUGMENTATION: stessa regola, input perturbati → dataset JSON ===")
    rule = LIBRARY[0]["rule"]                      # recolor_holes_by_subobject
    base = load_task("e69241bd")["train"][0][0]
    aug = augment_recolor(base, rule, n=200)       # 200 nuovi pair validi
    save_dataset("solutions/e69241bd_aug.json", aug, rule=rule)
    re = load_dataset("solutions/e69241bd_aug.json")
    valid = sum(apply_rule(rule, i) == o for i, o in re)   # ogni pair e' coerente con la regola
    print(f"  generati+salvati {len(aug)} pair (solutions/e69241bd_aug.json); ricaricati {len(re)}; coerenti={valid}/{len(re)}")

    print("\n=== 4) perturbazione di REGOLA (cambia un po' la regola) ===")
    for r in (LIBRARY[2]["rule"], LIBRARY[4]["rule"]):
        print(f"  {r}  ->  varianti: {perturb_rule(r)}")

if __name__ == "__main__":
    main()
