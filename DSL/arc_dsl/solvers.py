"""Solver scritti a mano per 5 task di training reali (i 5 analizzati a mano).

Scopo: (1) provare che l'interprete gira sui dati veri; (2) primo dato di
ESPRESSIVITÀ — questi 5 sono esprimibili nel DSL come programmi CORTI?
Le costanti "inferite dai demo" (colore di fill, reps di tiling) sono qui
hard-coded: rappresentano il programma DOPO il riempimento dei buchi
(l'inferenza dei buchi è un layer separato; qui testiamo l'espressività).
"""
from . import core as C

# 5582e5ca — riempi tutta la griglia col colore più frequente
def solve_5582e5ca(g):
    h, w = C.dims(g)
    return C.full(h, w, C.most_common_color(g))

# 00576224 — tiling 3x3; le tile-row dispari sono riflesse orizzontalmente
def solve_00576224(g):
    return C.tile(g, 3, 3, lambda r, c, gg: C.reflect_h(gg) if r % 2 else gg)

# 00d62c1b — riempi di 4 le regioni di sfondo RACCHIUSE (non connesse al bordo)
def solve_00d62c1b(g):
    bg = C.most_common_color(g)            # 0
    ext = C.flood_from_border(g, bg)       # sfondo connesso al bordo
    return C.recolor_where(g, lambda r, c, v: v == bg and (r, c) not in ext, 4)

# 007bbfb7 — fractal/self-tile: blocco = g dove la cella è non-vuota (canvas=0)
# NB: lo "sfondo" qui è lo 0 vuoto, NON il colore più frequente (in 660/600/066 il
# piu' frequente e' 6). Il demo-check ha scartato il selettore sbagliato → buco
# disambiguato dai demo. Il canvas vuoto è 0 by convention ARC.
def solve_007bbfb7(g):
    return C.self_tile(g, lambda v: v != 0)

# cce03e0d — fractal/self-tile: blocco = g dove la cella == 2
def solve_cce03e0d(g):
    return C.self_tile(g, lambda v: v == 2)

# e69241bd (AGI-2-hard) — versione object-centric (idea di Mario, la piu' pulita):
#   ogni BUCO = componente connessa di celle non-muro (grigio=5 e' il muro);
#   il SEME colorato dentro = il sub-object;  for O: recolor(O, O.sub.color).
# Sui dati: nessun buco ha >1 seme → equivale alla Voronoi ma e' una regola sola.
def solve_e69241bd(grid, wall=5):
    from collections import deque
    R, Cc = len(grid), len(grid[0])
    out = [list(row) for row in grid]; seen = set()
    for r in range(R):
        for c in range(Cc):
            if grid[r][c] != wall and (r, c) not in seen:     # un buco (oggetto)
                comp = []; dq = deque([(r, c)]); seen.add((r, c))
                while dq:
                    cr, cc = dq.popleft(); comp.append((cr, cc))
                    for dr, dc in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                        nr, nc = cr + dr, cc + dc
                        if 0 <= nr < R and 0 <= nc < Cc and (nr, nc) not in seen and grid[nr][nc] != wall:
                            seen.add((nr, nc)); dq.append((nr, nc))
                sub = {grid[cr][cc] for cr, cc in comp if grid[cr][cc] != 0}   # il sub-object colorato
                if sub:                                          # for O: recolor(O, O.sub.color)
                    col = next(iter(sub))
                    for cr, cc in comp:
                        out[cr][cc] = col
    return tuple(tuple(x) for x in out)

SOLVERS = {
    "e69241bd": solve_e69241bd,
    "5582e5ca": solve_5582e5ca,
    "00576224": solve_00576224,
    "00d62c1b": solve_00d62c1b,
    "007bbfb7": solve_007bbfb7,
    "cce03e0d": solve_cce03e0d,
}
