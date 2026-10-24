# Compares two renders of the film frame by frame: which frames are byte-identical, which differ only in the
# screen-fixed type zones (captions bottom-left, footer bottom-right), and which differ in the world (twin, line, UI).
#   python3 compare_runs.py <frames dir A> <frames dir B> [frames=630]
import sys
import numpy as np
from PIL import Image
from concurrent.futures import ProcessPoolExecutor

A, B = sys.argv[1], sys.argv[2]
N = int(sys.argv[3]) if len(sys.argv) > 3 else 630


def diff(f):
    a = np.asarray(Image.open(f"{A}/frame-{f:04d}.png").convert("RGB")).astype(np.int16)
    b = np.asarray(Image.open(f"{B}/frame-{f:04d}.png").convert("RGB")).astype(np.int16)
    d = np.abs(a - b).max(axis=2)
    m = d.copy()
    m[820:1010, 60:1200] = 0  # caption block
    m[1000:1060, 1300:1900] = 0  # disclosure footer
    return f, int(d.max()), float((m > 8).mean() * 100)


if __name__ == "__main__":
    with ProcessPoolExecutor(7) as ex:
        rows = list(ex.map(diff, range(N)))
    same = [r for r in rows if r[1] == 0]
    hud = [r for r in rows if r[1] > 0 and r[2] < 0.01]
    world = [r for r in rows if r[2] >= 0.01]
    print(f"byte-identical: {len(same)} · differ only in type zones: {len(hud)} · differ in the world: {len(world)}")
    if world:
        print("world differences (frame, % of pixels > 8/255):", [(r[0], round(r[2], 3)) for r in world][:30])
