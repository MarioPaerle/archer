"""arcworld — libreria di RAPPRESENTAZIONE object-centric per ARC-AGI-2
(generazione + solving), nello spirito del design di Mario:

    Global → Scene(Input_i / Output_i) → Obj (con sub-oggetti, proprietà) ;
    Link(in_obj, out_obj, prop) come meta-rappresentazione ; operazioni sugli
    oggetti (translate/recolor/rotate/reflect) ; Canvas/render per ricostruire
    la griglia. Generare = costruire oggetti + applicare op + render.
    Risolvere = parsare la griglia in oggetti + manipolarli + render.

Codice volutamente semplice e leggibile (niente search/MDL qui).
"""
import json, os
from collections import Counter, deque

# ---------------------------------------------------------------- griglia base
def to_tuple(g):
    return tuple(tuple(int(v) for v in row) for row in g)

def render_grid(g):
    return "\n".join("".join(str(v) for v in row) for row in g)

# ---------------------------------------------------------------- Obj
class Obj:
    """Un oggetto = celle {(r,c): color}, con proprietà e sotto-oggetti.
    Le operazioni restituiscono un NUOVO Obj (immutabile-friendly)."""
    def __init__(self, cells, props=None, sub=None):
        # cells: dict {(r,c): color}  oppure  lista di (r,c,color)
        if isinstance(cells, dict):
            self.cells = dict(cells)
        else:
            self.cells = {(r, c): col for (r, c, col) in cells}
        self.props = dict(props or {})     # proprietà custom: obj.props['p1'] = True
        self.sub = dict(sub or {})         # sotto-oggetti: name -> Obj

    # --- viste / proprietà calcolate ---
    @property
    def coords(self):
        return set(self.cells)
    @property
    def colors(self):
        return set(self.cells.values())
    @property
    def color(self):
        vals = list(self.cells.values())
        return vals[0] if len(set(vals)) == 1 else Counter(vals).most_common(1)[0][0]
    @property
    def size(self):
        return len(self.cells)
    @property
    def bbox(self):
        rs = [r for r, _ in self.cells]; cs = [c for _, c in self.cells]
        return (min(rs), min(cs), max(rs), max(cs))
    @property
    def topleft(self):
        r0, c0, _, _ = self.bbox
        return (r0, c0)
    @property
    def height(self):
        r0, _, r1, _ = self.bbox; return r1 - r0 + 1
    @property
    def width(self):
        _, c0, _, c1 = self.bbox; return c1 - c0 + 1
    @property
    def shape(self):
        """forma normalizzata (traslazione-invariante): set di offset dal topleft."""
        r0, c0 = self.topleft
        return frozenset((r - r0, c - c0) for (r, c) in self.cells)

    def cells_rc_color(self):
        """formato di Mario: lista ordinata di (r, c, color)."""
        return sorted((r, c, col) for (r, c), col in self.cells.items())

    # --- operazioni (ritornano nuovo Obj) ---
    def translate(self, dr, dc):
        return Obj({(r + dr, c + dc): col for (r, c), col in self.cells.items()}, self.props, self.sub)
    def recolor(self, color):
        return Obj({k: color for k in self.cells}, self.props, self.sub)
    def reflect(self, axis="h"):
        r0, c0, r1, c1 = self.bbox
        if axis == "h":   # specchia orizzontale entro il bbox
            return Obj({(r, c1 - (c - c0)): col for (r, c), col in self.cells.items()}, self.props)
        return Obj({(r1 - (r - r0), c): col for (r, c), col in self.cells.items()}, self.props)
    def rotate90(self):
        r0, c0 = self.topleft
        # (r,c) -> (c, -r) poi ri-ancora al topleft
        rot = {(c - c0, -(r - r0)): col for (r, c), col in self.cells.items()}
        mnr = min(r for r, _ in rot); mnc = min(c for _, c in rot)
        return Obj({(r - mnr + r0, c - mnc + c0): col for (r, c), col in rot.items()}, self.props)

    def __repr__(self):
        return f"Obj(color={self.color}, size={self.size}, topleft={self.topleft})"

# ---------------------------------------------------------------- segmentazione
_NEIGH = {4: ((1, 0), (-1, 0), (0, 1), (0, -1)),
          8: ((1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (1, -1), (-1, 1), (-1, -1))}

def segment(grid, bg=0, conn=4, same_color=True):
    """Uno dei tanti parse possibili: componenti connesse (ignora lo sfondo bg)."""
    g = to_tuple(grid); R, C = len(g), len(g[0]); seen = set(); objs = []
    for r in range(R):
        for c in range(C):
            if (r, c) in seen or g[r][c] == bg:
                continue
            col = g[r][c]; cells = {}; dq = deque([(r, c)]); seen.add((r, c))
            while dq:
                cr, cc = dq.popleft(); cells[(cr, cc)] = g[cr][cc]
                for dr, dc in _NEIGH[conn]:
                    nr, nc = cr + dr, cc + dc
                    if (0 <= nr < R and 0 <= nc < C and (nr, nc) not in seen
                            and g[nr][nc] != bg and (not same_color or g[nr][nc] == col)):
                        seen.add((nr, nc)); dq.append((nr, nc))
            objs.append(Obj(cells))
    return objs

# ---------------------------------------------------------------- Scene
class Scene:
    """Una griglia + i suoi oggetti. scene.A / scene.B = oggetti in ordine di lettura."""
    def __init__(self, grid, bg=0):
        self.grid = to_tuple(grid); self.bg = bg; self._objs = None
    @property
    def dims(self):
        return (len(self.grid), len(self.grid[0]))
    def objects(self, conn=4, same_color=True):
        if self._objs is None:
            self._objs = segment(self.grid, self.bg, conn, same_color)
        return self._objs
    def by_color(self, color):
        return [o for o in self.objects() if o.color == color]
    def named(self):
        return {chr(65 + i): o for i, o in enumerate(self.objects())}
    def __getattr__(self, name):           # scene.A -> oggetto "A"
        if name.startswith("__") or len(name) != 1 or not name.isupper():
            raise AttributeError(name)
        d = self.named()
        if name in d:
            return d[name]
        raise AttributeError(name)
    def __repr__(self):
        return f"Scene(dims={self.dims}, n_objects={len(self.objects())})"

# ---------------------------------------------------------------- Global + Link
class Link:
    """Meta-rappresentazione: corrispondenza tra un oggetto input e uno output.
    prop = la proprietà condivisa/cambiata (es. 'color')."""
    def __init__(self, src, dst, prop=None):
        self.src, self.dst, self.prop = src, dst, prop
    def __repr__(self):
        return f"Link({self.src} -> {self.dst}, prop={self.prop})"

def auto_links(in_scene, out_scene, by="shape"):
    """Auto-deriva le corrispondenze in->out (per forma o per posizione)."""
    links = []; outs = list(out_scene.objects())
    for a in in_scene.objects():
        match = None
        for b in outs:
            if (by == "shape" and a.shape == b.shape) or (by == "pos" and a.topleft == b.topleft):
                match = b; break
        if match is not None:
            prop = "color" if a.color != match.color else ("move" if a.topleft != match.topleft else "same")
            links.append(Link(a, match, prop))
    return links

class Global:
    """Contenitore di tutti gli esempi + variabili condivise + link."""
    def __init__(self, task):
        self.inputs = [Scene(i) for i, _ in task["train"]]
        self.outputs = [Scene(o) for _, o in task["train"]]
        self.tests = [Scene(i) for i, _ in task["test"]]
        self.vars = {}; self.links = []
    def input(self, i):  return self.inputs[i]
    def output(self, i): return self.outputs[i]
    def derive_links(self, by="shape"):
        self.links = [auto_links(self.inputs[i], self.outputs[i], by) for i in range(len(self.inputs))]
        return self.links

# ---------------------------------------------------------------- Canvas / render
class Canvas:
    def __init__(self, h, w, bg=0):
        self.h, self.w, self.bg = h, w, bg
        self.cells = [[bg] * w for _ in range(h)]
    @classmethod
    def from_grid(cls, grid):
        g = to_tuple(grid); cv = cls(len(g), len(g[0])); cv.cells = [list(row) for row in g]; return cv
    def set(self, r, c, color):
        if 0 <= r < self.h and 0 <= c < self.w:
            self.cells[r][c] = color
    def paint(self, obj):
        for (r, c), col in obj.cells.items():
            self.set(r, c, col)
    def stamp_frame(self, center, ring_color, center_color=None, size=3):
        r, c = center; rad = size // 2
        for dr in range(-rad, rad + 1):
            for dc in range(-rad, rad + 1):
                if dr == 0 and dc == 0:
                    if center_color is not None:
                        self.set(r, c, center_color)
                else:
                    self.set(r + dr, c + dc, ring_color)
    def grid(self):
        return tuple(tuple(row) for row in self.cells)

def render(h, w, objs, bg=0):
    cv = Canvas(h, w, bg)
    for o in objs:
        cv.paint(o)
    return cv.grid()

# ---------------------------------------------------------------- task IO + check
_DATA = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", "DATASET", "ARC-AGI-2", "data"))

def load_task(tid, split="training"):
    with open(os.path.join(_DATA, split, f"{tid}.json")) as f:
        d = json.load(f)
    return {"train": [(to_tuple(p["input"]), to_tuple(p["output"])) for p in d["train"]],
            "test":  [(to_tuple(p["input"]), to_tuple(p["output"])) for p in d["test"]]}

def check(solver, task):
    try:
        demo = all(solver(i) == o for i, o in task["train"])
        gen = all(solver(i) == o for i, o in task["test"])
        return demo, gen, None
    except Exception as e:
        return False, False, f"{type(e).__name__}: {e}"
