# Saves chosen frames of an encoded film as PNG (decoded through ffmpeg, so they show exactly what viewers see).
#   python3 extract_frames.py <film.mp4> <out dir> <frames: "0,15,30" or "a-b:step,...">
import os, subprocess, sys
import numpy as np
from PIL import Image

film, out, spec = sys.argv[1], sys.argv[2], sys.argv[3]
want = set()
for part in spec.split(","):
    if "-" in part:
        rng, _, step = part.partition(":")
        a, b = map(int, rng.split("-"))
        want.update(range(a, b + 1, int(step or 1)))
    else:
        want.add(int(part))
os.makedirs(out, exist_ok=True)
W, H = 1920, 1080
p = subprocess.Popen(["ffmpeg", "-v", "error", "-i", film, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], stdout=subprocess.PIPE)
n = 0
while True:
    buf = p.stdout.read(W * H * 3)
    if len(buf) < W * H * 3:
        break
    if n in want:
        Image.fromarray(np.frombuffer(buf, np.uint8).reshape(H, W, 3)).save(f"{out}/frame-{n:04d}.png")
    n += 1
print(f"decoded {n} frames, saved {len(want & set(range(n)))}")
