# Encode fidelity: decoded MP4 frame n vs source PNG n — alignment (no off-by-one: n must match better than n±1 on
# moving frames) and colour (mean signed difference per channel ≈ 0 means no matrix/range shift).
#   python3 qa_encode.py <film.mp4> <frames dir> <report.md>
import subprocess, sys
import numpy as np
from PIL import Image

film, src, report = sys.argv[1], sys.argv[2], sys.argv[3]
W, H = 1920, 1080
p = subprocess.Popen(["ffmpeg", "-v", "error", "-i", film, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], stdout=subprocess.PIPE)
dec = {}
for n in range(630):
    buf = p.stdout.read(W * H * 3)
    if n % 30 == 0 or n in (181, 182, 300, 301, 390, 391, 465, 466):
        dec[n] = np.frombuffer(buf, np.uint8).reshape(H, W, 3).astype(np.int16)
png = lambda n: np.asarray(Image.open(f"{src}/frame-{n:04d}.png").convert("RGB")).astype(np.int16)
lines = ["| frame | mean abs diff | mean signed R / G / B | best match among n−1, n, n+1 |", "|---|---|---|---|"]
signed = []
for n in sorted(dec):
    d = dec[n] - png(n)
    s = d.reshape(-1, 3).mean(0)
    signed.append(s)
    cands = {k: float(np.abs(dec[n] - png(k)).mean()) for k in (n - 1, n, n + 1) if 0 <= k < 630}
    best = min(cands, key=cands.get)
    lines.append(f"| {n} | {np.abs(d).mean():.2f} | {s[0]:+.2f} / {s[1]:+.2f} / {s[2]:+.2f} | {best}{' ✓' if best == n else ' ✗'} |")
avg = np.mean(signed, 0)
txt = f"# Encode fidelity — `{film}` vs `{src}`\n\n" + "\n".join(lines) + f"\n\nOverall mean signed difference R/G/B: {avg[0]:+.2f} / {avg[1]:+.2f} / {avg[2]:+.2f} (code values; 0 = no colour shift).\n"
open(report, "w").write(txt)
print(txt)
