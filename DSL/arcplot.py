"""arcplot — plotting facile delle griglie ARC (palette ufficiale).

Funzioni pensate per essere usate a mano:
    from arcplot import show_grid, show_task, show_solution
    from arcworld import load_task
    t = load_task("4258a5f9")
    show_task(t, save="task.png")              # tutti i pair train + test
    show_solution(my_solver, t, save="sol.png")# input / atteso / predetto / diff, con PASS/FAIL

Se `save` è dato salva un PNG; altrimenti prova plt.show() (utile in locale).
"""
import matplotlib
matplotlib.use("Agg")                       # backend senza display (salva PNG)
import matplotlib.pyplot as plt
from matplotlib.colors import ListedColormap, BoundaryNorm

# palette ARC ufficiale (0..9)
_ARC = ["#000000", "#0074D9", "#FF4136", "#2ECC40", "#FFDC00",
        "#AAAAAA", "#F012BE", "#FF851B", "#7FDBFF", "#870C25"]
_CMAP = ListedColormap(_ARC)
_NORM = BoundaryNorm(range(11), _CMAP.N)

def _draw(ax, grid, title=None):
    ax.imshow(grid, cmap=_CMAP, norm=_NORM)
    ax.set_xticks([]); ax.set_yticks([])
    h, w = len(grid), len(grid[0])
    ax.set_xticks([x - 0.5 for x in range(1, w)], minor=True)
    ax.set_yticks([y - 0.5 for y in range(1, h)], minor=True)
    ax.grid(which="minor", color="#333", linewidth=0.5)
    if title:
        ax.set_title(title, fontsize=9)

def _finish(fig, save):
    fig.tight_layout()
    if save:
        fig.savefig(save, dpi=110, bbox_inches="tight"); plt.close(fig); return save
    try:
        plt.show()
    finally:
        plt.close(fig)

def show_grid(grid, title=None, save=None):
    fig, ax = plt.subplots(figsize=(3, 3)); _draw(ax, grid, title); return _finish(fig, save)

def show_task(task, save=None):
    """Tutti i pair: una colonna per pair, riga 0 = input, riga 1 = output."""
    pairs = [("train", i, p) for i, p in enumerate(task["train"])] + \
            [("test", i, p) for i, p in enumerate(task["test"])]
    n = len(pairs)
    fig, axes = plt.subplots(2, n, figsize=(2.4 * n, 5))
    if n == 1:
        axes = axes.reshape(2, 1)
    for col, (split, i, (inp, out)) in enumerate(pairs):
        _draw(axes[0, col], inp, f"{split}{i} in")
        _draw(axes[1, col], out, f"{split}{i} out")
    return _finish(fig, save)

def show_solution(solver, task, save=None):
    """Per ogni pair test: input / atteso / predetto / diff (rosso=errore), con PASS/FAIL."""
    tests = task["test"]
    fig, axes = plt.subplots(len(tests), 4, figsize=(11, 3 * len(tests)))
    if len(tests) == 1:
        axes = axes.reshape(1, 4)
    for r, (inp, exp) in enumerate(tests):
        pred = solver(inp)
        ok = pred == exp
        diff = [[0 if pred[y][x] == exp[y][x] else 2 for x in range(len(exp[0]))]
                for y in range(len(exp))]
        _draw(axes[r, 0], inp, "input")
        _draw(axes[r, 1], exp, "atteso")
        _draw(axes[r, 2], pred, f"predetto [{'PASS' if ok else 'FAIL'}]")
        _draw(axes[r, 3], diff, "diff (rosso=err)")
    return _finish(fig, save)
