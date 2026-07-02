# gridvid studio — 2D grid-video generator + editor

Make **2dgridvid**: short videos that are lists of 2D grids, every cell an **ARC
color 0–9**. Objects move, fall, collide, bounce, show interior vs exterior, sort
themselves into shaped holes; plus **Voronoi** region fields, **shooters/beams**,
**spinning** objects, and **liquid** sources. Author by hand in a zero-install
**studio** UI, or drive everything from a **CLI** built for agents. Built-in
**augmentation** turns one video into many.

## Why this exists (ARC-AGI-2)
Grid-native **world-prior pretraining data**: objectness, geometry, gravity,
collision, inside/outside, goal-directed shape-fitting, segmentation (Voronoi),
causality (beams), fluids. Official ARC palette (matches `DSL/arcplot.py`), so
frames round-trip into the ARC tooling. `gridvid_io.to_arc_task_like` turns a
video into next-frame-prediction samples.

## Quick start
- **Desktop app (Tauri 2):** `npm install` once, then `npm run app` (dev window) or
  `npm run app:build` → a real `gridvid.app` in `src-tauri/target/release/bundle/macos/`.
  Self-contained: fonts + engine are inlined, works fully offline.
- **Studio (web):** double-click `index.html` (zero install) — or `node serve.js` → `http://localhost:8137`.
  Tool rail (left), live inspector (right), transport + timeline, Export menu. Keys:
  `V` select · `B` paint · `S` stamp · `H` hole · `T` shooter · `L` source · `O` voronoi · `E` erase · `space` play.
- **CLI (agents):**
  ```bash
  node cli.js dsl                                   # print the scene grammar
  node cli.js new myscene sorter                    # scaffold a scene
  node cli.js gen scenes/*.txt -o out/ --gif        # generate (one JSON+GIF per scene)
  node cli.js gen scenes/x.txt --seeds 50 --augment 8 --wild   # 50 seeds × 8 wild augments
  node cli.js augment out/x.json -o out/ --n 16 --zoom-aug      # 16 ARC-style variants of a video
  node cli.js augment out/x.json -o out/ --materialize --n 3 --gif # block-by-block final-object reveal
  node cli.js render out/x.json --gif --cell 16     # re-render a saved video
  node cli.js validate out/*.json                   # check format
  node cli.js self-test                             # engine sanity checks
  ```
- **Python:** `import gridvid_io as gv; vid = gv.load("out/x.json"); gv.next_frame_pairs(vid)`
- **2D tokens:** `node tokenizer/shape2d.js` checks exact ordered semantic shape tokens (`SQUARE`, `RECT`,
  `LINE`, `FRAME`, `PLUS`, `LSHAPE`, `CELLS` fallback, `ORDER:TLBR`). `node tokenizer/patch2d.js` checks low-level
  exact patch fallback for grids and videos.

## Scene-DSL (the prompt surface)
One command per line, `#` = comment, commas = spaces. Coords are `row col`
(0,0 = top-left); `+row`=down, `+col`=right. (Run `node cli.js dsl` for the live list.)

| Command | Meaning |
|---|---|
| `grid W H` · `bg C` · `seed N` | size, background, RNG seed |
| `walls box\|floor\|none` | solid borders |
| `gravity DIR [N]` / `gravity GR GC` | gravity (down/up/left/right) |
| `spawn SHAPE [a..] at R C [opts]` | a movable object |
| `hole SHAPE [a..] at R C id NAME color C` | sorter socket |
| `board H W at R C color C` + `sort on` | shape-sorter board + routing |
| `voronoi N [metric euclid\|manhattan] [drift] [borders C] [colors C..]` | region field |
| `noise uniform [colors C..] [probs P..]` | random grid (per-color probability) |
| `noise perlin [scale S] [colors C..]` | smooth Perlin field mapped to colors |
| `shooter at R C dir DIR every K beam bolt\|ray\|spread color C [speed S]` | emitter |
| `source at R C color C [rate K] [amount K]` | liquid source; `amount` = cells per fill tick |
| `liquid [viscosity 0..1] [turbulence 0..1] [flow K]` | cellular stream + pressure/spread/spill; `flow` = default cells per fill tick |
| `counter at R C base B colors C0 C1 C2.. [every K] [gap G]` | modular-counting odometer (every B of C0 carries into one C1, …) |
| `hidelayer N` | hide every object on layer N |
| `mark_enclosed C` | color background enclosed by shapes (inside/outside) |
| `run N` · `hold N` | simulate N frames · freeze current frame |

**spawn opts:** `color C` · `vel DR DC` · `grav 0\|1` · `bounce 0..1` ·
`spin K` (rotate 90° every K) · `fill solid\|outline` · `interior C` · `layer N` ·
`ghost 0\|1` (ignore collisions; useful for occlusion) · `magnet K` · `id NAME` ·
`target HOLEID` · `random [R0 C0 R1 C1]`.

## Studio editing
Multi-**layer** z-ordering (Layers panel: per-layer show/hide). **Undo/redo** (⌘Z / ⇧⌘Z),
**copy / cut / paste** (⌘C/⌘X/⌘V) and **Clear**. Select an object → its **full properties**
open in the inspector (color, velocity, gravity, bounce, spin, interior, fill, layer); drag to
move. Sources & shooters show as **dotted markers** while editing and vanish on Run. In the
desktop app, **Export** opens a native **Save dialog** and reveals the file in Finder; in the
browser it downloads.

**shapes:** dot · square S · rect H W · line LEN [v] · plus S · Lshape S · Tshape S ·
triangle S · diamond R · disc R · ring S · frame H W.

## Augmentation
Two modes:
- **Pixel** (`augmentVid` / `cli.js augment`): random **D4 transforms** + **color permutations** + **framerate** (`--rate`: random fps & frame stride) on the finished frames.
- **Wild / scene** (`augmentScene` / `cli.js gen --wild`): **re-simulates** the scene with perturbed **seed + fluid (viscosity/turbulence/flow)**, then random D4 + color + framerate + external zoom-in/zoom-out on top — genuinely different dynamics, not just pixels. Works great on shape-sorter scenes (color perm keeps piece↔hole consistent; seed varies layout). Use `--zoom` for a fixed external zoom; use `--zoom-aug` to opt pixel augmentation into random zoom variants.
- **Materialize** (`materializeVid` / `cli.js augment --materialize`): instead of translating an object to its solution, reveal the final object cells block-by-block in place. Useful for shape-hole construction tasks. Use `--materialize-cells K` to reveal K cells per frame.
- **Exact socket caution:** use `--zoom-in-only` with `--zoom-aug` for tiny holes/sockets. Zoom-out downsampling is intentionally destructive and can erase exact small shapes.
```bash
node cli.js gen scenes/liquid.txt -o out/ --augment 20 --wild --gif   # 20 crazy variants + GIFs
node cli.js gallery out/                                              # → render all to GIF + open a gallery to show a friend
```
Or Export ▸ "augmented batch" in the studio.

## Task layer — the dataset unit is a triple `(EXAMPLES, IN, OUT)`
A single video is not a training sample. The sample is a **`prodigy-task`**: K demonstration pairs (the *teaching*)
plus a held-out test pair. **The JSON is the truth; the montage GIF is only for the eye.**
```json
{ "format":"prodigy-task", "version":1, "width":W, "height":H, "palette":"arc10", "fps":F,
  "examples":[ {"in":[..frames..], "out":[..frames..]}, ... ],   // demonstrations
  "in":[..frames..], "out":[..frames..],                          // held-out test (video; OUT can be a continuation)
  "meta":{ "rule", "concepts", "dsl", "seeds", "vary_axes", "augment_applied",
           "representation":{program,in_objects,out_objects}, "teaching":{ok,examplesVary,...} } }
```
One scene = one instance; the family comes from re-running it across seeds. Author with `rule`/`concept`, mark the
IN|OUT split with `cut`. **The demonstrations must be GENUINELY DIVERSE, not near-copies.** A good task shows the *same
rule* over *visibly different inputs* — different layouts, counts, shapes, sizes and colours each example — so the model
must abstract the rule. **Avoid the near-copy trap:** demos that look almost identical with only a tiny change teach
nothing (the model just copies the example output). Push intra-example variation *high*:
- **vary every feature that is not the rule** — `random [box]` positions, `color rand`, `rand LO HI` sizes, varied counts;
- **`examples N | rand LO HI`** sets the number of demonstrations (`n_examples`) — `rand` varies it per task, like real ARC;
- for hard / interesting tasks the generator can **author each example by hand** (MANUAL mode): write blocks separated by
  `=== example ===` / `=== test ===`, each a full self-contained scene sharing the rule — maximal diversity, no reseeding.

`meta.representation` is the simulator's object list (for a grid→representation head). `validateTask` guarantees a
*teaching* (every pair changes IN→OUT) and **lints weak tasks** (`examplesVary=false` ⇒ the demos are identical — fix it).
```bash
node cli.js task scenes/tasks/*.txt -o out/ --examples 4 --gif   # build task families (+montage)
node showcase.js corpus <f.jsonl>   # IN→OUT gallery  ·  node showcase.js trace <f.jsonl>  # thinking-grids
node showcase.js builder            # god-builder menus ·  node cli.js gallery out/ --open  # GIF folder gallery
```
**Procedural augmentation** is declared in the DSL: `vary flip rot zoom shift color` lists the rule-safe axes; one random
subset (one transform per task) is applied to every example+test, preserving the rule. Only the generator declares safe axes.

**Composition:** `def NAME p.. / body / end` + `use NAME args` (nestable) + `repeat N idx / body / end`, with `$p` and
`$p+K / $p*K` arithmetic. Macros compile to flat primitives (visible in `meta.representation.program`).

**Task primitives** (beyond physics): selection/extraction, `copy`/`mirror`/`recolor`/`move`/`zoom` (object scale in/out, also the `vary zoom` aug), `corrupt`/`break`/`repair`
(find-the-error & reconstruction), `tally`/`keep_bigger` (counting & comparison), `lattice`/`fill`/`mesh` (grids, holes, the
coloured-line inverse), `turtle`/`drive` (program execution), `scatter`/`paint` (free content). Full list: `node cli.js dsl`.

## 2dgridvid format
```json
{ "format":"2dgridvid", "version":2, "width":W, "height":H,
  "palette":"arc10", "fps":6, "meta":{...}, "frames":[ [[..ints 0-9..]], ... ] }
```
`frames` is the video. Any consumer just reads `frames`.

## Files
- `engine.js` — pure engine (shapes, physics, voronoi, shooters, liquid, spin, DSL, augmentation, JSON). Browser + Node.
- `gif.js` — minimal animated-GIF89a encoder (indexed, ARC palette).
- `index.html` — the studio editor (scripts inlined for double-click). Edit `engine.js`/`gif.js` then `node build.js` to refresh it.
- `cli.js` — full agent CLI (`gen·task·generate-dataset·generate-llm·propose·prompt·augment·render·gallery·dsl·validate·self-test`).
- `builder.js` — the GOD BUILDER: hierarchical families + admits-graph + difficulty-budgeted menus (feeds `proposeMenu`).
- `program.js` — object-level typed combinator AST + the deep rules (legend/containment/bands, `--compose`).
- `gridgen.js` — the single verified family registry + `task <family>` spec-DSL (pulls `gen2–5`/`gen_deep`/`gen_iq`/`gen_logic`).
- `showcase.js` — the single showcase entry point (`corpus·trace·builder·construct`).
- `gridvid_io.py` — Python loader/bridge into the ARC pipeline.
- `tokenizer/shape2d.js` — exact ordered semantic 2D tokenizer for common shapes plus `CELLS` fallback.
- `tokenizer/patch2d.js` — exact low-level patch fallback (2×2 serpentine patches + video `SAME` deltas).
- `serve.js` · `build.js` — local server · inliner. `scenes/` examples · `out/` artifacts.

## Scale-up
The DSL is the prompt: hand an LLM `node cli.js dsl`, ask for N scenes, drop them in
`scenes/`, then `node cli.js gen scenes/*.txt -o out/ --seeds K --augment M`. Seeded
RNG ⇒ every video reproduces exactly from its scene + seed.
