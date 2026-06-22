"""dsl_rules — REGOLE DICHIARATIVE serializzabili (JSON-able) + esecuzione + perturbazione.

Una regola e' un dict:  {"op": <nome>, "params": {...}}  → salvabile in JSON,
eseguibile (apply_rule), e perturbabile (perturb_rule) per l'augmentation.
Le op sono primitive riusabili (le regole dei task risolti, generalizzate).
Costruito sopra arc_dsl.core (le primitive su griglia).
"""
from collections import deque
from arc_dsl import core as C

# ---- predicati serializzabili (per i "buchi" dei selettori) ----
def _pred(spec):
    if spec["op"] == "eq":  return lambda v: v == spec["value"]
    if spec["op"] == "neq": return lambda v: v != spec["value"]
    raise ValueError(spec)

# ---- op (ognuna: grid + params -> grid) ----
def op_recolor_holes_by_subobject(grid, wall=5):
    """e69241bd: ogni buco (comp. connessa non-muro) -> colore del suo sub-object."""
    R, W = len(grid), len(grid[0]); out = [list(r) for r in grid]; seen = set()
    for r in range(R):
        for c in range(W):
            if grid[r][c] != wall and (r, c) not in seen:
                comp = []; dq = deque([(r, c)]); seen.add((r, c))
                while dq:
                    cr, cc = dq.popleft(); comp.append((cr, cc))
                    for dr, dc in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                        nr, nc = cr + dr, cc + dc
                        if 0 <= nr < R and 0 <= nc < W and (nr, nc) not in seen and grid[nr][nc] != wall:
                            seen.add((nr, nc)); dq.append((nr, nc))
                sub = {grid[cr][cc] for cr, cc in comp if grid[cr][cc] != 0}
                if sub:
                    col = next(iter(sub))
                    for cr, cc in comp: out[cr][cc] = col
    return tuple(tuple(x) for x in out)

def op_fill_grid(grid, selector="most_common"):
    """5582e5ca: riempi tutta la griglia con un colore selezionato."""
    sel = {"most_common": C.most_common_color, "least_common": C.least_common_color,
           "unique": C.unique_color}[selector]
    return C.full(*C.dims(grid), sel(grid))

def op_self_tile(grid, pred):
    """007bbfb7 / cce03e0d: fractal self-tile dove pred(cell) e' vero."""
    return C.self_tile(grid, _pred(pred))

_TF = {"id": lambda g: g, "reflect_h": C.reflect_h, "reflect_v": C.reflect_v,
       "rotate90": C.rotate90, "transpose": C.transpose}
def op_tile_alt(grid, rows, cols, row_alternation):
    """00576224: tiling rows x cols con trasformazione alternata per tile-row."""
    alt = [_TF[n] for n in row_alternation]
    return C.tile(grid, rows, cols, lambda r, c, gg: alt[r % len(alt)](gg))

def op_frame_each(grid, ring_color=1, size=3):
    """4258a5f9: per ogni seme (cella non-sfondo) stampa una cornice size x size."""
    R, W = len(grid), len(grid[0]); out = [list(r) for r in grid]; rad = size // 2
    seeds = [(r, c) for r in range(R) for c in range(W) if grid[r][c] != 0]
    for (r, c) in seeds:
        for dr in range(-rad, rad + 1):
            for dc in range(-rad, rad + 1):
                nr, nc = r + dr, c + dc
                if 0 <= nr < R and 0 <= nc < W and not (dr == 0 and dc == 0):
                    out[nr][nc] = ring_color
    return tuple(tuple(x) for x in out)

RULES = {
    "recolor_holes_by_subobject": op_recolor_holes_by_subobject,
    "fill_grid": op_fill_grid,
    "self_tile": op_self_tile,
    "tile_alt": op_tile_alt,
    "frame_each": op_frame_each,
}

def apply_rule(rule, grid):
    return RULES[rule["op"]](grid, **rule["params"])

# ---- perturbazione (per "cambiare un po' ogni regola" = mega augmentation) ----
def perturb_rule(rule):
    op, p = rule["op"], rule["params"]; out = []
    if op == "self_tile":
        for v in range(1, 6):
            if v != p["pred"]["value"]:
                out.append({"op": op, "params": {"pred": {"op": p["pred"]["op"], "value": v}}})
    elif op == "fill_grid":
        for s in ("most_common", "least_common", "unique"):
            if s != p["selector"]: out.append({"op": op, "params": {"selector": s}})
    elif op == "frame_each":
        for rc in (2, 3, 4, 6, 8):
            if rc != p["ring_color"]: out.append({"op": op, "params": {"ring_color": rc, "size": p["size"]}})
    elif op == "tile_alt":
        for alt in (["id", "reflect_v"], ["id", "rotate90"], ["reflect_h", "id"]):
            if alt != p["row_alternation"]:
                out.append({"op": op, "params": {"rows": p["rows"], "cols": p["cols"], "row_alternation": alt}})
    return out
