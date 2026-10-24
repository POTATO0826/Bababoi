# Per-frame QA of a rendered film: every frame is decoded and checked, and the numbers are written to a JSON + Markdown
# report. Works on a PNG frame folder or on an encoded MP4 (decoded with ffmpeg).
#   python3 qa_frames.py <frames dir | film.mp4> <report prefix> [--expect 630] [--holds 34-45,391-401,...]
#
# Checks (thresholds are printed in the report):
#   count / resolution   exactly --expect frames, all 1920×1080
#   black / blank        mean luma < 2 (black) or luma std-dev < 1.5 (flat) — the film never cuts to black
#   duplicates / frozen  byte-identical (PNG) or near-identical (MP4) neighbours; runs of them are listed, and runs
#                        outside the declared holds are flagged
#   flicker              a luma jump between neighbours that reverses on the next frame (a one-frame pop)
#   clipping             share of pixels at 0 or 255 in all channels (crushed / blown), per frame
#   edges                bright content touching the frame border (something cut off at the edge), per side
import json, os, subprocess, sys, glob
import numpy as np
from PIL import Image

src, prefix = sys.argv[1], sys.argv[2]
opts = dict(zip(sys.argv[3::2], sys.argv[4::2]))
EXPECT = int(opts.get("--expect", 630))
HOLDS = [tuple(map(int, r.split("-"))) for r in opts.get("--holds", "").split(",") if r]
W, H = 1920, 1080


def frames():
    if os.path.isdir(src):
        for f in sorted(glob.glob(os.path.join(src, "frame-*.png"))):
            im = Image.open(f)
            yield os.path.basename(f), im.size, np.asarray(im.convert("RGB"))
    else:
        probe = json.loads(subprocess.check_output(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "json", src]))
        w, h = probe["streams"][0]["width"], probe["streams"][0]["height"]
        p = subprocess.Popen(["ffmpeg", "-v", "error", "-i", src, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], stdout=subprocess.PIPE)
        i = 0
        while True:
            buf = p.stdout.read(w * h * 3)
            if len(buf) < w * h * 3:
                break
            yield f"frame-{i:04d}", (w, h), np.frombuffer(buf, np.uint8).reshape(h, w, 3)
            i += 1


rows = []
prev = None
for name, size, a in frames():
    y = (0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2]).astype(np.float32)
    small = y[::4, ::4]
    r = {
        "frame": name,
        "size": list(size),
        "luma": float(y.mean()),
        "std": float(small.std()),
        "crushed": float(((a <= 0).all(axis=2)).mean()),
        "blown": float(((a >= 255).all(axis=2)).mean()),
    }
    # bright content on each border row/column (2 px), as a share of that edge
    for side, strip in (("top", y[:2]), ("bottom", y[-2:]), ("left", y[:, :2]), ("right", y[:, -2:])):
        r["edge_" + side] = float((strip > 60).mean())
    if prev is not None:
        d = np.abs(small - prev)
        r["diff"] = float(d.mean())
        r["identical"] = bool(d.max() == 0)
    prev = small
    rows.append(r)

n = len(rows)
issues = []
if n != EXPECT:
    issues.append(f"frame count {n}, expected {EXPECT}")
bad = [r["frame"] for r in rows if tuple(r["size"]) != (W, H)]
if bad:
    issues.append(f"{len(bad)} frames not {W}×{H}: {bad[:5]}")
black = [r["frame"] for r in rows if r["luma"] < 2]
flat = [r["frame"] for r in rows if r["std"] < 1.5]
if black:
    issues.append(f"black frames: {black}")
if flat:
    issues.append(f"flat frames: {flat}")

# frozen runs (identical/near-identical neighbours)
runs, start = [], None
for i in range(1, n):
    same = rows[i].get("diff", 1) < 0.02
    if same and start is None:
        start = i - 1
    if not same and start is not None:
        runs.append((start, i - 1))
        start = None
if start is not None:
    runs.append((start, n - 1))
in_hold = lambda a, b: any(h0 <= a and b <= h1 + 1 for h0, h1 in HOLDS)
frozen_flagged = [(a, b) for a, b in runs if b - a >= 2 and not in_hold(a, b)]
if frozen_flagged:
    issues.append(f"frozen runs outside declared holds: {frozen_flagged}")

# one-frame pops: a big luma jump that comes back on the next frame
pops = []
for i in range(1, n - 1):
    d1 = rows[i]["luma"] - rows[i - 1]["luma"]
    d2 = rows[i + 1]["luma"] - rows[i]["luma"]
    if abs(d1) > 3 and abs(d2) > 3 and np.sign(d1) != np.sign(d2):
        pops.append((rows[i]["frame"], round(d1, 2), round(d2, 2)))
if pops:
    issues.append(f"luma pops (flicker): {pops}")

clip = [(r["frame"], round(r["blown"] * 100, 2)) for r in rows if r["blown"] > 0.02]
if clip:
    issues.append(f"frames with >2% blown pixels: {clip[:10]}")

edges = {}
for side in ("top", "bottom", "left", "right"):
    hit = [r["frame"] for r in rows if r["edge_" + side] > 0.08]
    if hit:
        edges[side] = hit

report = {
    "source": src,
    "frames": n,
    "expected": EXPECT,
    "issues": issues,
    "frozen_runs": runs,
    "declared_holds": HOLDS,
    "edge_contact": {k: len(v) for k, v in edges.items()},
    "edge_frames": edges,
    "luma": {"min": min(r["luma"] for r in rows), "max": max(r["luma"] for r in rows), "mean": float(np.mean([r["luma"] for r in rows]))},
    "max_neighbour_diff": max((r.get("diff", 0), r["frame"]) for r in rows),
    "rows": rows,
}
json.dump(report, open(prefix + ".json", "w"), indent=1)
with open(prefix + ".md", "w") as md:
    md.write(f"# Per-frame QA — `{src}`\n\n")
    md.write(f"* Frames decoded: **{n}** (expected {EXPECT}); resolution check: {'all 1920×1080' if not bad else 'FAIL'}\n")
    md.write(f"* Mean luma per frame: min {report['luma']['min']:.1f}, max {report['luma']['max']:.1f} (black threshold 2.0)\n")
    md.write(f"* Largest neighbour change: {report['max_neighbour_diff'][0]:.1f} at {report['max_neighbour_diff'][1]}\n")
    md.write(f"* Frozen runs (neighbours identical): {runs if runs else 'none'}\n")
    md.write(f"* Declared holds: {HOLDS if HOLDS else 'none'}\n")
    md.write(f"* Bright content touching an edge (frames per side): {report['edge_contact'] or 'none'}\n\n")
    md.write("## Issues\n\n" + ("\n".join(f"* {x}" for x in issues) if issues else "* none") + "\n")
print(f"{n} frames · issues: {len(issues)}")
for x in issues:
    print(" -", x)
print("edge contact:", report["edge_contact"])
