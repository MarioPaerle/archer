"""arcshow — VEDERE la rappresentazione: una griglia parsata in oggetti del DSL,
mostrata come struttura (testo) e visivamente (ogni oggetto + i suoi metodi)."""
import math
import matplotlib.pyplot as plt
from arcplot import _draw, _finish
from arcdsl import Obj

def representation_text(grid):
    G = Obj.from_grid(grid); objs = G.split(same_color=False)
    lines = [f"Global  canvas={G.canvas}  oggetti={len(objs)}"]
    for i, o in enumerate(objs):
        subs = o.split(same_color=True)
        lines.append(f"  obj {chr(65+i)}: color={o.color} size={o.size} bbox={o.bbox} "
                     f"border={o.get_border().size} holes={o.get_holes().size} sub_objects={len(subs)}")
        if len(subs) > 1:
            for j, s in enumerate(subs):
                lines.append(f"        sub {chr(97+j)}: color={s.color} size={s.size} topleft={s.topleft}")
    return "\n".join(lines)

def show_representation(grid, save=None, methods_on=None):
    G = Obj.from_grid(grid); objs = G.split(same_color=False)
    panels = [("Global (grid)", G.to_grid())]
    for i, o in enumerate(objs):
        panels.append((f"obj {chr(65+i)}  col{o.color} sz{o.size} holes{o.get_holes().size}", o.to_grid()))
    A = methods_on if methods_on is not None else max(objs, key=lambda o: o.get_holes().size)
    panels += [
        ("A = get_border()", A.get_border().to_grid()),
        ("A + get_external_contour(4)", A.get_external_contour(color=4).placeover(A).to_grid()),
        ("A + get_holes(6)", A.get_holes(color=6).placeover(A).to_grid()),
    ]
    ncols = 4; nrows = math.ceil(len(panels) / ncols)
    fig, axes = plt.subplots(nrows, ncols, figsize=(2.7 * ncols, 2.9 * nrows))
    axes = axes.flatten()
    for ax, (t, g) in zip(axes, panels): _draw(ax, g, t)
    for ax in axes[len(panels):]: ax.axis("off")
    return _finish(fig, save)
