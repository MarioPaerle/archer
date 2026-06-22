"""arcvm — il DSL come INSTRUCTION SET cercabile da MCTS (non piu' API Python).

Un PROGRAMMA = lista di istruzioni `(op, *args)` → e' una TRAIETTORIA: l'MCTS
sceglie la prossima istruzione da un menu finito (OPS), lo STATO e' un Env.
Gli op mappano IMPLICITAMENTE sul working-set di oggetti; `filter`/`restore`
danno il dispatch contestuale SENZA control-flow Python. Esecuzione cheap.

Env = {grid: Obj (canvas/output che si costruisce), all: [Obj], work: [Obj]}
"""
from arcdsl import Obj

def _marker_of(o):
    """Il sub-object: il colore di una cella != colore-corpo (maggioranza)."""
    body = o.color
    for col in o.cells.values():
        if col != body:
            return col
    return None

# ---- op: ognuno prende (env, *args) e ritorna env ----
def _segment(env, same_color):
    objs = env["grid"].split(same_color=same_color)
    env["all"] = objs; env["work"] = list(objs); return env

def _filter_marker(env, m):
    env["work"] = [o for o in env["all"] if _marker_of(o) == m]; return env

def _restore(env):
    env["work"] = list(env["all"]); return env

def _ext_contour(env, color):
    g = env["grid"]
    for o in env["work"]:
        g = o.get_external_contour(color=color).exclusive_placeover(g)
    env["grid"] = g; return env

def _fill_holes(env, color):
    g = env["grid"]
    for o in env["work"]:
        g = o.get_holes(color=color).exclusive_placeover(g)
    env["grid"] = g; return env

def _recolor_body(env, color):
    g = env["grid"]
    for o in env["work"]:
        body = Obj({p: c for p, c in o.cells.items() if c == o.color}, canvas=g.canvas)
        g = body.recolor(color).placeover(g)
    env["grid"] = g; return env

def _recolor_to_largest(env):
    if env["work"]:
        target = max(env["work"], key=lambda o: o.size).color
        g = env["grid"]
        for o in env["work"]:
            g = o.recolor(target).placeover(g)
        env["grid"] = g
    return env

# ---- il MENU di azioni dell'MCTS (op-name -> funzione) ----
OPS = {
    "segment":          lambda env, *a: _segment(env, True),
    "segment_cc":       lambda env, *a: _segment(env, False),
    "filter_marker":    lambda env, m: _filter_marker(env, m),
    "restore":          lambda env, *a: _restore(env),
    "ext_contour":      lambda env, c: _ext_contour(env, c),
    "fill_holes":       lambda env, c: _fill_holes(env, c),
    "recolor_body":     lambda env, c: _recolor_body(env, c),
    "recolor_to_largest": lambda env, *a: _recolor_to_largest(env),
}

def step(env, instr):
    """Transizione MCTS: applica UNA istruzione allo stato."""
    return OPS[instr[0]](env, *instr[1:])

def run(program, grid):
    env = {"grid": Obj.from_grid(grid), "all": [], "work": []}
    for instr in program:
        env = step(env, instr)
    return env["grid"].to_grid()

# ---- i programmi (TRAIETTORIE) dei 4 task, come DATI ----
PROGRAMS = {
    "external_contour":  [("segment",), ("ext_contour", 4)],
    "fill_holes":        [("segment",), ("fill_holes", 2)],
    "recolor_by_largest":[("segment",), ("recolor_to_largest",)],
    "marker_dispatch":   [("segment_cc",),
                          ("filter_marker", 2), ("recolor_body", 4), ("restore",),
                          ("filter_marker", 1), ("ext_contour", 8), ("restore",),
                          ("filter_marker", 3), ("fill_holes", 6)],
}
