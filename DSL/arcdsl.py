"""arcdsl — il DSL a OGGETTI: ogni Obj ha metodi, e una Grid e' essa stessa un Obj.

Obj = celle non-sfondo {(r,c): color} + canvas (H,W) + sub-oggetti + proprieta'.
Metodi richiesti da Mario:
  place(obj, topleft, relative)  count_sons  recolor(color, mask)
  get_border()  get_internal_contour()  get_external_contour()
Layer ops: placeover, exclusive_placeover.
to_grid() rende una tuple-grid (compatibile coi plot e col resto del DSL).
"""
from collections import deque

_N4 = ((1, 0), (-1, 0), (0, 1), (0, -1))
_N8 = _N4 + ((1, 1), (1, -1), (-1, 1), (-1, -1))


class Obj:
    def __init__(self, cells=None, canvas=None, props=None, sub=None):
        self.cells = dict(cells or {})        # {(r,c): color}, solo non-sfondo
        self.canvas = canvas                  # (H, W) oppure None
        self.props = dict(props or {})
        self.sub = dict(sub or {})            # nome -> Obj (sotto-oggetti)

    # ---------- viste ----------
    @property
    def coords(self): return set(self.cells)
    @property
    def colors(self): return set(self.cells.values())
    @property
    def color(self):
        if not self.cells: return None
        vals = list(self.cells.values())
        return max(set(vals), key=vals.count)
    @property
    def size(self): return len(self.cells)
    @property
    def count_sons(self): return len(self.sub)
    @property
    def bbox(self):
        rs = [r for r, _ in self.cells]; cs = [c for _, c in self.cells]
        return (min(rs), min(cs), max(rs), max(cs))
    @property
    def topleft(self):
        r0, c0, _, _ = self.bbox; return (r0, c0)
    @property
    def height(self):
        r0, _, r1, _ = self.bbox; return r1 - r0 + 1
    @property
    def width(self):
        _, c0, _, c1 = self.bbox; return c1 - c0 + 1
    @property
    def shape(self):
        r0, c0 = self.topleft
        return frozenset((r - r0, c - c0) for r, c in self.cells)

    def _clone(self, cells): return Obj(cells, self.canvas, self.props, dict(self.sub))

    # ---------- rappresentazione ----------
    def cells_rc_color(self):
        return sorted((r, c, col) for (r, c), col in self.cells.items())

    @classmethod
    def from_grid(cls, grid, bg=0):
        g = [list(r) for r in grid]; H, W = len(g), len(g[0])
        cells = {(r, c): g[r][c] for r in range(H) for c in range(W) if g[r][c] != bg}
        return cls(cells, canvas=(H, W))

    def to_grid(self, bg=0):
        if self.canvas: H, W = self.canvas
        elif self.cells: r0, c0, r1, c1 = self.bbox; H, W = r1 + 1, c1 + 1
        else: H, W = 1, 1
        g = [[bg] * W for _ in range(H)]
        for (r, c), col in self.cells.items():
            if 0 <= r < H and 0 <= c < W: g[r][c] = col
        return tuple(tuple(row) for row in g)

    # ---------- segmentazione in sotto-oggetti ----------
    def split(self, conn=4, same_color=True):
        cs = self.cells; seen = set(); comps = []; off = _N4 if conn == 4 else _N8
        for start in cs:
            if start in seen: continue
            col = cs[start]; comp = {}; dq = deque([start]); seen.add(start)
            while dq:
                p = dq.popleft(); comp[p] = cs[p]
                for dr, dc in off:
                    nb = (p[0] + dr, p[1] + dc)
                    if nb in cs and nb not in seen and (not same_color or cs[nb] == col):
                        seen.add(nb); dq.append(nb)
            comps.append(Obj(comp, self.canvas))
        self.sub = {chr(65 + i): o for i, o in enumerate(comps)}   # A, B, C...
        return comps

    # ---------- operazioni base ----------
    def translate(self, dr, dc):
        return self._clone({(r + dr, c + dc): col for (r, c), col in self.cells.items()})

    def recolor(self, color, mask=True):
        """mask: True = tutte le celle; Obj = solo le celle nelle coords di mask."""
        if mask is True:
            keep = self.coords
        elif isinstance(mask, Obj):
            keep = self.coords & mask.coords
        else:
            keep = set()
        return self._clone({p: (color if p in keep else col) for p, col in self.cells.items()})

    def place(self, obj, topleft, relative=False):
        """Ritorna un nuovo Obj con `obj` piazzato (topleft assoluto, o relativo a self.topleft)."""
        base = self.topleft if (relative and self.cells) else (0, 0)
        tr, tc = base[0] + topleft[0], base[1] + topleft[1]
        dr, dc = tr - obj.topleft[0], tc - obj.topleft[1]
        moved = obj.translate(dr, dc)
        cells = dict(self.cells); cells.update(moved.cells)     # obj vince sugli overlap
        return Obj(cells, self.canvas or obj.canvas, self.props, dict(self.sub))

    # ---------- bordi / contorni ----------
    def get_border(self):
        """Celle dell'oggetto sul perimetro della sua forma (≥1 vicino-4 fuori)."""
        cs = self.coords
        b = {p: self.cells[p] for p in cs
             if any((p[0] + dr, p[1] + dc) not in cs for dr, dc in _N4)}
        return Obj(b, self.canvas)

    def _contours(self, color):
        """Ritorna (external_cells, internal_cells, hole_cells) come dict {pos:color}."""
        cs = self.coords
        r0, c0, r1, c1 = self.bbox
        R0, C0, R1, C1 = r0 - 1, c0 - 1, r1 + 1, c1 + 1
        if self.canvas:                                  # clip al canvas
            H, W = self.canvas; R0, C0 = max(R0, 0), max(C0, 0); R1, C1 = min(R1, H - 1), min(C1, W - 1)
        empty = {(r, c) for r in range(R0, R1 + 1) for c in range(C0, C1 + 1) if (r, c) not in cs}
        outside = set(); dq = deque()
        for r in range(R0, R1 + 1):
            for c in (C0, C1):
                if (r, c) in empty and (r, c) not in outside: outside.add((r, c)); dq.append((r, c))
        for c in range(C0, C1 + 1):
            for r in (R0, R1):
                if (r, c) in empty and (r, c) not in outside: outside.add((r, c)); dq.append((r, c))
        while dq:
            r, c = dq.popleft()
            for dr, dc in _N4:
                nb = (r + dr, c + dc)
                if nb in empty and nb not in outside: outside.add(nb); dq.append(nb)
        inside = empty - outside
        ext = {p: color for p in outside if any((p[0]+dr, p[1]+dc) in cs for dr, dc in _N8)}
        intc = {p: color for p in inside if any((p[0]+dr, p[1]+dc) in cs for dr, dc in _N8)}
        hole = {p: color for p in inside}
        return ext, intc, hole

    def get_external_contour(self, color=None):
        color = self.color if color is None else color
        ext, _, _ = self._contours(color); return Obj(ext, self.canvas)

    def get_internal_contour(self, color=None):
        color = self.color if color is None else color
        _, intc, _ = self._contours(color); return Obj(intc, self.canvas)

    def get_holes(self, color=None):
        """Tutte le celle vuote racchiuse (interno), non solo il contorno."""
        color = self.color if color is None else color
        _, _, hole = self._contours(color); return Obj(hole, self.canvas)

    # ---------- layer ops ----------
    def placeover(self, other):
        """self sopra other (self vince sugli overlap)."""
        cells = dict(other.cells); cells.update(self.cells)
        return Obj(cells, self.canvas or other.canvas)

    def exclusive_placeover(self, other):
        """self su other SOLO dove other e' vuoto (niente sovrascrittura)."""
        cells = dict(other.cells)
        for p, col in self.cells.items():
            if p not in cells: cells[p] = col
        return Obj(cells, self.canvas or other.canvas)

    def __repr__(self):
        return f"Obj(color={self.color}, size={self.size}, sons={self.count_sons}, canvas={self.canvas})"
