# Pixel comparison of two renders: compare.py <a.png> <b.png> [diff.png]
# Prints mean/max absolute difference and the share of pixels that differ by more than 8/255.
import sys
import numpy as np
from PIL import Image
a = np.asarray(Image.open(sys.argv[1]).convert("RGB")).astype(np.int16)
b = np.asarray(Image.open(sys.argv[2]).convert("RGB")).astype(np.int16)
d = np.abs(a - b).max(axis=2)
print(f"mean {d.mean():.2f}  max {d.max()}  >8: {(d > 8).mean() * 100:.2f}%  >32: {(d > 32).mean() * 100:.2f}%")
if len(sys.argv) > 3:
    Image.fromarray(np.clip(d * 4, 0, 255).astype(np.uint8)).save(sys.argv[3])
