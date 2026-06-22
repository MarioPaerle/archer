"""demo_world — USA arcworld su task reali + un round-trip di generazione.
Uso:  python3 demo_world.py
"""
from arcworld import (Obj, Scene, Global, Canvas, render, load_task, check,
                      auto_links, render_grid)

# =====================================================================
# (A) SOLVING di un task reale rappresentandolo a oggetti — 4258a5f9
#     Regola: per ogni "dot" (cella di colore 5) stampa una cornice 3x3
#     di colore 1, tenendo il 5 al centro.
# =====================================================================
def solve_4258a5f9(grid):
    scene = Scene(grid)
    cv = Canvas.from_grid(grid)              # parto dalla griglia input
    for obj in scene.objects():              # ogni dot grigio = un oggetto
        r, c = obj.topleft                   # (single cell)
        cv.stamp_frame((r, c), ring_color=1, center_color=obj.color)
    return cv.grid()

# =====================================================================
# (B) GENERAZIONE + SOLVING (round-trip): costruisco un task con la
#     rappresentazione, poi lo risolvo con un solver basato sugli oggetti.
#     Regola del task: ricolora ogni oggetto col colore dell'oggetto piu' GRANDE.
# =====================================================================
def generate_recolor_task():
    objs = [
        Obj({(1, 1): 2, (1, 2): 2, (2, 1): 2, (2, 2): 2}),   # quadrato rosso 2x2 (size 4 = il piu' grande)
        Obj({(5, 6): 3}),                                    # punto verde (size 1)
        Obj({(7, 2): 8, (7, 3): 8, (8, 2): 8}),              # L ciano (size 3)
    ]
    inp = render(10, 10, objs)
    biggest = max(objs, key=lambda o: o.size)               # il rosso
    out = render(10, 10, [o.recolor(biggest.color) for o in objs])
    return inp, out

def solve_recolor(grid):
    scene = Scene(grid)
    objs = scene.objects()
    target = max(objs, key=lambda o: o.size).color          # colore dell'oggetto piu' grande
    return render(*scene.dims, [o.recolor(target) for o in objs])

# =====================================================================
def main():
    print("=== (A) task reale 4258a5f9 ===")
    task = load_task("4258a5f9")
    demo, gen, err = check(solve_4258a5f9, task)
    print(f"demo_ok={demo}  gen_ok={gen}  {err or ''}")
    # mostra la RAPPRESENTAZIONE del primo input
    s = Scene(task["train"][0][0])
    print(f"  rappresentazione input0: {s}  oggetti={s.named()}")
    a = s.A
    print(f"  scene.A -> {a}  cells_rc_color={a.cells_rc_color()}  topleft={a.topleft}")

    print("\n=== (B) round-trip: genero un task e lo risolvo ===")
    inp, out = generate_recolor_task()
    gtask = {"train": [(inp, out)], "test": [(inp, out)]}
    demo, gen, err = check(solve_recolor, gtask)
    print(f"solve_recolor: demo_ok={demo}  gen_ok={gen}  {err or ''}")
    # mostra i LINK auto-derivati input->output (corrispondenza per forma)
    links = auto_links(Scene(inp), Scene(out), by="shape")
    print("  link auto-derivati (in->out):")
    for l in links:
        print(f"    {l}")
    print("\n  input generato:");  print(render_grid(inp))
    print("  output (regola applicata):"); print(render_grid(out))

if __name__ == "__main__":
    main()
