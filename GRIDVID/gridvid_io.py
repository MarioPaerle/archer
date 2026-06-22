"""gridvid_io — read 2dgridvid JSON into the ARC pipeline.

A 2dgridvid is a list of ARC-palette grids (a small video). This module is the
Python side of the bridge: the JS engine/editor produce the videos, Python
consumes them for world-prior pretraining (objectness, gravity, collision,
inside/outside, goal-directed shape-fitting — see SOURCES/09 and the README).

    import gridvid_io as gv
    vid = gv.load("out/sorter.json")
    for grid in gv.frames(vid):        # each grid = list[list[int]] of colors 0..9
        ...
    pairs = gv.next_frame_pairs(vid)   # [(grid_t, grid_t+1), ...] next-frame prediction
    gv.save_gif_frames_png(vid, "preview/")   # optional matplotlib preview (Agg)

Palette matches DSL/arcplot.py (official ARC 0..9).
"""
from __future__ import annotations
import json
import os
from typing import List, Tuple, Iterator, Dict, Any

Grid = List[List[int]]

ARC_PALETTE = [
    "#000000", "#0074D9", "#FF4136", "#2ECC40", "#FFDC00",
    "#AAAAAA", "#F012BE", "#FF851B", "#7FDBFF", "#870C25",
]


def load(path: str) -> Dict[str, Any]:
    """Load a 2dgridvid JSON file and validate the basic shape."""
    with open(path, "r") as f:
        vid = json.load(f)
    if vid.get("format") != "2dgridvid" or "frames" not in vid:
        raise ValueError(f"{path}: not a 2dgridvid")
    return vid


def frames(vid: Dict[str, Any]) -> List[Grid]:
    """The list of grids (frames)."""
    return vid["frames"]


def iter_frames(vid: Dict[str, Any]) -> Iterator[Grid]:
    yield from vid["frames"]


def shape(vid: Dict[str, Any]) -> Tuple[int, int, int]:
    """(num_frames, height, width)."""
    return len(vid["frames"]), vid["height"], vid["width"]


def next_frame_pairs(vid: Dict[str, Any], stride: int = 1) -> List[Tuple[Grid, Grid]]:
    """Consecutive (input, target) frame pairs — next-frame-prediction supervision
    for a grid-native world model. `stride` skips ahead for coarser dynamics."""
    fs = vid["frames"]
    return [(fs[i], fs[i + stride]) for i in range(len(fs) - stride)]


def as_numpy(vid: Dict[str, Any]):
    """Frames as an int array of shape (T, H, W). Requires numpy."""
    import numpy as np
    return np.array(vid["frames"], dtype=np.int64)


def to_arc_task_like(vid: Dict[str, Any], stride: int = 1) -> Dict[str, Any]:
    """Reshape a video into an ARC-task-like dict of {input,output} pairs (the last
    pair held out as 'test'). Lets a video double as a synthetic dynamics task."""
    pairs = next_frame_pairs(vid, stride)
    train = [{"input": a, "output": b} for a, b in pairs[:-1]]
    test = [{"input": pairs[-1][0], "output": pairs[-1][1]}] if pairs else []
    return {"train": train, "test": test, "source": vid.get("meta", {}).get("scene")}


def save_gif_frames_png(vid: Dict[str, Any], out_dir: str, cell: int = 16) -> None:
    """Render each frame to a PNG using the ARC palette (matplotlib Agg).
    Optional convenience for eyeballing a video inside the Python toolchain."""
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from matplotlib.colors import ListedColormap, BoundaryNorm

    cmap = ListedColormap(ARC_PALETTE)
    norm = BoundaryNorm(list(range(11)), cmap.N)
    os.makedirs(out_dir, exist_ok=True)
    for i, g in enumerate(vid["frames"]):
        h, w = len(g), len(g[0])
        fig, ax = plt.subplots(figsize=(w * cell / 100, h * cell / 100), dpi=100)
        ax.imshow(g, cmap=cmap, norm=norm)
        ax.set_xticks([]); ax.set_yticks([])
        fig.savefig(os.path.join(out_dir, f"frame_{i:03d}.png"), bbox_inches="tight", pad_inches=0)
        plt.close(fig)


if __name__ == "__main__":
    import sys
    if len(sys.argv) < 2:
        print("usage: python3 gridvid_io.py <video.json>")
        sys.exit(1)
    v = load(sys.argv[1])
    t, h, w = shape(v)
    print(f"2dgridvid '{v.get('meta', {}).get('scene')}': {t} frames, {h}x{w}, palette={v.get('palette')}")
    print(f"next-frame pairs: {len(next_frame_pairs(v))}")
