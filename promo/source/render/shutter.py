# Merges the shutter sub-frames written by render-frames.mjs --shutter: averages each frame's captures in linear light
# (the integral a real shutter takes), then writes frame-NNNN.png next to the single-capture frames.
#   python3 shutter.py <frames dir> [processes]
import os, sys, glob, shutil
from multiprocessing import Pool
import numpy as np
from PIL import Image

LUT = None


def to_lin_lut():
    c = np.arange(256, dtype=np.float32) / 255.0
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4).astype(np.float32)


def to_srgb(l):
    l = np.clip(l, 0, 1)
    return np.where(l <= 0.0031308, l * 12.92, 1.055 * np.power(l, 1 / 2.4) - 0.055) * 255.0


def merge(d):
    lut = to_lin_lut()
    files = sorted(glob.glob(os.path.join(d, "*.png")))
    acc = None
    for f in files:
        a = lut[np.asarray(Image.open(f).convert("RGB"))]
        acc = a if acc is None else acc + a
    img = to_srgb(acc / len(files))
    # fixed sub-LSB dither (the same pattern every frame), so averaged gradients don't band
    rng = np.random.default_rng(7)
    img += rng.uniform(-0.5, 0.5, img.shape[:2] + (1,)).astype(np.float32)
    Image.fromarray(np.clip(np.round(img), 0, 255).astype(np.uint8)).save(os.path.join(os.path.dirname(os.path.dirname(d)), os.path.basename(d) + ".png"))
    shutil.rmtree(d)
    return os.path.basename(d), len(files)


if __name__ == "__main__":
    out = sys.argv[1]
    procs = int(sys.argv[2]) if len(sys.argv) > 2 else max(1, (os.cpu_count() or 2) - 1)
    subs = sorted(glob.glob(os.path.join(out, ".sub", "frame-*")))
    with Pool(procs) as pool:
        for name, n in pool.imap_unordered(merge, subs):
            pass
    sub_root = os.path.join(out, ".sub")
    if os.path.isdir(sub_root) and not os.listdir(sub_root):
        os.rmdir(sub_root)
    print(f"merged {len(subs)} blurred frames")
