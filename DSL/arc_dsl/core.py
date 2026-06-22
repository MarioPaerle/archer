"""ARC-DSL v0 — core interpreter.

Design (vedi ../../DESIGN/dsl-v0.md):
- Grid = tuple di tuple di int (immutabile, hashabile, confronti esatti).
- Due strati: core operativo (totipotente: cellmap/rewrite ci sono come escape)
  + layer semantico object-centric (segmentazione, selettori, trasformazioni).
- Function creation: registry `FUNCTIONS` + decorator `define` → qui si innesta
  la library learning / le funzioni create dal modello a runtime.
Niente search/MDL qui: questo è solo l'INTERPRETE eseguibile (per l'error-slicing
espressività-vs-search). Cheap by design: esecuzione su griglia ~istantanea.
"""
from collections import Counter, deque

Grid = tuple  # tuple[tuple[int,...],...]

# ---------- base ----------
def to_grid(lol):
    return tuple(tuple(int(v) for v in row) for row in lol)

def dims(g):
    return (len(g), len(g[0]))

def render(g):
    return "\n".join("".join(str(v) for v in row) for row in g)

def full(h, w, color):
    return tuple(tuple(color for _ in range(w)) for _ in range(h))

def zeros_like(g):
    h, w = dims(g)
    return full(h, w, 0)

# ---------- selettori / riduzioni colore (riempiono i "buchi") ----------
def cell_counts(g, ignore=None):
    c = Counter(v for row in g for v in row)
    if ignore is not None:
        c.pop(ignore, None)
    return c

def most_common_color(g, ignore=None):
    return cell_counts(g, ignore).most_common(1)[0][0]

def least_common_color(g, ignore=None):
    return min(cell_counts(g, ignore).items(), key=lambda kv: kv[1])[0]

def unique_color(g, ignore=None):
    """Il colore che appare esattamente una volta (concetto ARC frequente)."""
    c = cell_counts(g, ignore)
    ones = [k for k, n in c.items() if n == 1]
    return ones[0] if len(ones) == 1 else None

def palette(g):
    return set(v for row in g for v in row)

# ---------- geometria (core) ----------
def rotate90(g):
    return tuple(tuple(row) for row in zip(*g[::-1]))

def reflect_h(g):       # flip orizzontale (specchia le colonne)
    return tuple(tuple(reversed(row)) for row in g)

def reflect_v(g):       # flip verticale (specchia le righe)
    return tuple(g[::-1])

def transpose(g):
    return tuple(tuple(r) for r in zip(*g))

# ---------- assemblaggio / tiling ----------
def assemble(blocks):
    """blocks: lista RxC di griglie di pari dimensione → un'unica griglia."""
    R, C = len(blocks), len(blocks[0])
    bh, bw = dims(blocks[0][0])
    out = []
    for br in range(R):
        for i in range(bh):
            row = []
            for bc in range(C):
                row.extend(blocks[br][bc][i])
            out.append(tuple(row))
    return tuple(out)

def tile(g, R, C, transform=None):
    """Tassella g in una griglia RxC di blocchi; transform(r,c,g)->blocco (stessa dim di g)."""
    if transform is None:
        transform = lambda r, c, gg: gg
    return assemble([[transform(r, c, g) for c in range(C)] for r in range(R)])

def self_tile(g, pred):
    """Fractal: blocco(r,c) = g se pred(g[r][c]) altrimenti vuoto. (007bbfb7, cce03e0d)"""
    R, C = dims(g)
    z = zeros_like(g)
    return assemble([[(g if pred(g[r][c]) else z) for c in range(C)] for r in range(R)])

# ---------- topologia ----------
def flood_from_border(g, through):
    """Insieme di celle di colore `through` raggiungibili dal bordo (4-conn)."""
    R, C = dims(g)
    seen, dq = set(), deque()
    for r in range(R):
        for c in (0, C - 1):
            if g[r][c] == through and (r, c) not in seen:
                seen.add((r, c)); dq.append((r, c))
    for c in range(C):
        for r in (0, R - 1):
            if g[r][c] == through and (r, c) not in seen:
                seen.add((r, c)); dq.append((r, c))
    while dq:
        r, c = dq.popleft()
        for dr, dc in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nr, nc = r + dr, c + dc
            if 0 <= nr < R and 0 <= nc < C and g[nr][nc] == through and (nr, nc) not in seen:
                seen.add((nr, nc)); dq.append((nr, nc))
    return seen

def recolor_where(g, pred, to):
    """pred(r,c,val)->bool: ricolora le celle che soddisfano pred."""
    return tuple(
        tuple(to if pred(r, c, v) else v for c, v in enumerate(row))
        for r, row in enumerate(g)
    )

# ---------- segmentation kit (object-centric) ----------
class Object:
    __slots__ = ("cells", "color", "bbox", "area")
    def __init__(self, cells, color):
        self.cells = frozenset(cells)              # {(r,c),...}
        self.color = color
        rs = [r for r, _ in cells]; cs = [c for _, c in cells]
        self.bbox = (min(rs), min(cs), max(rs), max(cs))
        self.area = len(self.cells)
    def __repr__(self):
        return f"Object(color={self.color}, area={self.area}, bbox={self.bbox})"

_NEIGH = {4: ((1, 0), (-1, 0), (0, 1), (0, -1)),
          8: ((1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (1, -1), (-1, 1), (-1, -1))}

def connected_components(g, conn=4, ignore=0, same_color=True):
    """Segmentazione per componenti connesse (uno dei tanti parse possibili)."""
    R, C = dims(g); seen = set(); comps = []
    for r in range(R):
        for c in range(C):
            if (r, c) in seen or g[r][c] == ignore:
                continue
            col = g[r][c]; cells = []; dq = deque([(r, c)]); seen.add((r, c))
            while dq:
                cr, cc = dq.popleft(); cells.append((cr, cc))
                for dr, dc in _NEIGH[conn]:
                    nr, nc = cr + dr, cc + dc
                    if (0 <= nr < R and 0 <= nc < C and (nr, nc) not in seen
                            and g[nr][nc] != ignore
                            and (not same_color or g[nr][nc] == col)):
                        seen.add((nr, nc)); dq.append((nr, nc))
            comps.append(Object(cells, col))
    return comps

def objects_by_color(g, ignore=0):
    out = []
    for col in palette(g):
        if col == ignore:
            continue
        cells = [(r, c) for r, row in enumerate(g) for c, v in enumerate(row) if v == col]
        if cells:
            out.append(Object(cells, col))
    return out

# ---------- function creation (hook per library learning / funzioni del modello) ----------
FUNCTIONS = {}

def define(name):
    """Decorator: registra una funzione DSL creata al volo (dal modello o da noi)."""
    def deco(fn):
        FUNCTIONS[name] = fn
        return fn
    return deco

def compose(*fns):
    """Composizione f1∘f2∘…: utile per programmi come catene di operazioni."""
    def run(x):
        for f in reversed(fns):
            x = f(x)
        return x
    return run

# ---------- escape totipotente (ultima risorsa, penalizzato da MDL quando ci sarà) ----------
def cellmap(g, fn):
    """fn(r,c,val,g)->new_val. Garantisce totipotenza punto-a-punto."""
    return tuple(tuple(fn(r, c, v, g) for c, v in enumerate(row)) for r, row in enumerate(g))
