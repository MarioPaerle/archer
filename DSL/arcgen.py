"""arcgen — funzioni di GENERAZIONE (ritornano Grid Object) + generatori di task
stile ARC-AGI-2. Ogni generatore ritorna (pairs, solve, rule_normal, rule_dsl):
  pairs = lista di (input Obj, output Obj)
  solve = la SOLUZIONE come funzione grid->grid (usa il DSL a oggetti)
  rule_normal = descrizione a parole ; rule_dsl = la regola in forma DSL (dict)
Validazione = solve(input) == output per ogni pair (regola unica che spiega tutto).
"""
import random
from arcdsl import Obj

# ---------- primitive di generazione (Grid Object) ----------
def empty(H, W): return Obj({}, canvas=(H, W))
def filled_rect(h, w, color): return Obj({(i, j): color for i in range(h) for j in range(w)})
def hollow_rect(h, w, color):
    return Obj({(i, j): color for i in range(h) for j in range(w) if i in (0, h-1) or j in (0, w-1)})
def dot(color): return Obj({(0, 0): color})

def _place_nonoverlap(rng, H, W, shapes, pad=2):
    g = empty(H, W); used = set(); placed = 0
    for shp in shapes:
        h, w = shp.height, shp.width
        for _ in range(120):
            r = rng.randint(pad, H - h - pad); c = rng.randint(pad, W - w - pad)
            region = {(r+i, c+j) for i in range(-pad, h+pad) for j in range(-pad, w+pad)}
            if not (region & used):
                g = shp.translate(r - shp.topleft[0], c - shp.topleft[1]).placeover(g)
                used |= region; placed += 1; break
    return g, placed

def _gen_pairs(seed, make_input, solve_obj, n, ok):
    """Genera n pair (input,output) ritentando finche' `ok(inp,out,nplaced)` e' True."""
    rng = random.Random(seed); pairs = []; guard = 0
    while len(pairs) < n and guard < 1000:
        guard += 1
        inp, nplaced = make_input(rng)
        out = solve_obj(inp)
        if ok(inp, out, nplaced):
            pairs.append((inp, out))
    return pairs

# ---------- generatori di task (input + regola applicata = output) ----------
def gen_external_contour(seed, marker=4, n=4):
    H, W = 14, 14; pal = [1, 2, 3, 8, 6, 7]
    def mk(rng):
        shapes = [filled_rect(rng.randint(1, 3), rng.randint(1, 3), rng.choice(pal)) for _ in range(rng.randint(2, 3))]
        return _place_nonoverlap(rng, H, W, shapes)
    pairs = _gen_pairs(seed, mk, lambda g: _solve_contour_obj(g, marker), n,
                       lambda i, o, k: k >= 2 and o.to_grid() != i.to_grid())
    def solve(grid): return _solve_contour_obj(Obj.from_grid(grid), marker).to_grid()
    return pairs, solve, f"per ogni oggetto disegna il contorno ESTERNO (alone) di colore {marker}", \
        {"op": "for_each_object", "apply": {"op": "draw_external_contour", "color": marker}}

def _solve_contour_obj(G, marker):
    out = G
    for O in G.split():
        out = O.get_external_contour(color=marker).exclusive_placeover(out)
    return out

def gen_fill_holes(seed, fill=2, n=4):
    H, W = 14, 14; pal = [1, 3, 8, 6, 7]
    def mk(rng):
        shapes = [hollow_rect(rng.randint(3, 5), rng.randint(3, 5), rng.choice(pal)) for _ in range(rng.randint(2, 2))]
        return _place_nonoverlap(rng, H, W, shapes)
    pairs = _gen_pairs(seed, mk, lambda g: _solve_fill_obj(g, fill), n,
                       lambda i, o, k: k >= 2 and o.to_grid() != i.to_grid())
    def solve(grid): return _solve_fill_obj(Obj.from_grid(grid), fill).to_grid()
    return pairs, solve, f"riempi i BUCHI interni di ogni oggetto col colore {fill}", \
        {"op": "for_each_object", "apply": {"op": "fill_holes", "color": fill}}

def _solve_fill_obj(G, fill):
    out = G
    for O in G.split():
        out = O.get_holes(color=fill).exclusive_placeover(out)
    return out

def gen_recolor_by_largest(seed, n=4):
    H, W = 14, 14; pal = [1, 2, 3, 8, 6, 7]
    sizebag = [(1, 1), (2, 2), (2, 3), (3, 3), (1, 3), (3, 1), (2, 1)]
    def mk(rng):
        k = rng.randint(2, 3)
        shapes = [filled_rect(h, w, col) for (h, w), col in zip(rng.sample(sizebag, k), rng.sample(pal, k))]
        return _place_nonoverlap(rng, H, W, shapes)
    def good(i, o, k):
        objs = i.split()
        if k < 2 or len(objs) < 2: return False
        mx = max(x.size for x in objs)
        if sum(x.size == mx for x in objs) != 1: return False     # largest unico
        return o.to_grid() != i.to_grid()
    pairs = _gen_pairs(seed, mk, _solve_largest_obj, n, good)
    def solve(grid): return _solve_largest_obj(Obj.from_grid(grid)).to_grid()
    return pairs, solve, "ricolora ogni oggetto col colore dell'oggetto piu' GRANDE", \
        {"op": "for_each_object", "apply": {"op": "recolor", "color_selector": "color_of_largest_object"}}

def _solve_largest_obj(G):
    objs = G.split()
    if not objs: return G
    target = max(objs, key=lambda o: o.size).color
    out = G
    for O in objs:
        out = O.recolor(target).placeover(out)
    return out

# ---------- task COMPOSTO/CONTESTUALE: il marker detta l'operazione (per-oggetto) ----------
# Ogni oggetto = rettangolo cavo grigio(5) con UNA cella-marker d'angolo di colore diverso.
# Il marker detta la trasformazione:  rosso(2)->ricolora il corpo di giallo(4);
# blu(1)->contorno esterno ciano(8);  verde(3)->riempi i buchi di magenta(6).
_BODY = 5
def _solve_marker_obj(G):
    out = G
    for O in G.split(same_color=False):                 # oggetto = ring + marker (stessa componente)
        nong = [c for c in O.cells.values() if c != _BODY]
        if not nong:
            continue
        marker = nong[0]                                # il sub-object: la cella non-grigia
        if marker == 2:                                 # rosso -> ricolora il CORPO di giallo
            body = Obj({p: c for p, c in O.cells.items() if c == _BODY}, canvas=G.canvas)
            out = body.recolor(4).placeover(out)
        elif marker == 1:                               # blu -> contorno ESTERNO ciano
            out = O.get_external_contour(color=8).exclusive_placeover(out)
        elif marker == 3:                               # verde -> riempi i BUCHI di magenta
            out = O.get_holes(color=6).exclusive_placeover(out)
    return out

def gen_marker_dispatch(seed, n=4):
    H, W = 16, 16
    def mk(rng):
        k = rng.randint(2, 3); shapes = []
        for _ in range(k):
            o = hollow_rect(rng.randint(3, 5), rng.randint(3, 5), _BODY)
            o.cells[(0, 0)] = rng.choice([1, 2, 3])      # marker nell'angolo alto-sx
            shapes.append(o)
        return _place_nonoverlap(rng, H, W, shapes, pad=2)
    pairs = _gen_pairs(seed, mk, _solve_marker_obj, n,
                       lambda i, o, k: k >= 2 and o.to_grid() != i.to_grid())
    def solve(grid): return _solve_marker_obj(Obj.from_grid(grid)).to_grid()
    rule_normal = ("ogni oggetto ha un MARKER d'angolo che ne detta la trasformazione: "
                   "rosso(2)->ricolora il corpo di giallo(4); blu(1)->contorno esterno ciano(8); "
                   "verde(3)->riempi i buchi di magenta(6)")
    rule_dsl = {"op": "for_each_object", "apply": {"op": "dispatch_by_marker", "map": {
        "2": {"op": "recolor", "target": "body", "color": 4},
        "1": {"op": "draw_external_contour", "color": 8},
        "3": {"op": "fill_holes", "color": 6}}}}
    return pairs, solve, rule_normal, rule_dsl

GENERATORS = {
    "external_contour": gen_external_contour,
    "fill_holes": gen_fill_holes,
    "recolor_by_largest": gen_recolor_by_largest,
    "marker_dispatch": gen_marker_dispatch,
}
