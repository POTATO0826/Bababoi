# Quick review sheet: sheet.py <dir> <out.png> [cols] [tile_w] [frames]
#   frames: optional comma list ("180,182,186") or range ("170-190") to pick from <dir>/frame-NNNN.png
import sys, glob, os
from PIL import Image, ImageDraw
d, out = sys.argv[1], sys.argv[2]
cols = int(sys.argv[3]) if len(sys.argv) > 3 else 4
tw = int(sys.argv[4]) if len(sys.argv) > 4 else 480
th = tw * 9 // 16
if len(sys.argv) > 5:
    spec = sys.argv[5]
    if "-" in spec and "," not in spec:
        a, b = map(int, spec.split("-"))
        nums = range(a, b + 1)
    else:
        nums = [int(x) for x in spec.split(",")]
    fs = [f"{d}/frame-{n:04d}.png" for n in nums if os.path.exists(f"{d}/frame-{n:04d}.png")]
else:
    fs = sorted(glob.glob(d + "/*.png"))
rows = (len(fs) + cols - 1) // cols
o = Image.new("RGB", (cols * tw, rows * th), (0, 0, 0))
dr = ImageDraw.Draw(o)
for i, f in enumerate(fs):
    im = Image.open(f).convert("RGB").resize((tw, th), Image.LANCZOS)
    x, y = (i % cols) * tw, (i // cols) * th
    o.paste(im, (x, y))
    dr.text((x + 6, y + 4), f.split("-")[-1][:-4], fill=(255, 255, 0))
o.save(out)
