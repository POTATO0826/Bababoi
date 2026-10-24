"""v3b review gate: six keyframes + contact sheet, a sheet of every press transition, and a v3 → v3b comparison.
usage: python3 contact_sheet_v3b.py <raw_dir> <previews_v3b_dir> <previews_v3_dir>
<raw_dir> holds frame-NNNN.png for the keyframes and for the transition windows (rendered at dpr 2, 180° shutter)."""
import os, shutil, sys
from PIL import Image, ImageDraw, ImageFont

RAW, OUT, V3 = sys.argv[1], sys.argv[2], sys.argv[3]
os.makedirs(OUT, exist_ok=True)
FRAMES = [86, 181, 312, 401, 475, 615]
LABELS = [
    "Opening — the app's own twin assembles inside the mark's silhouette",
    "Capture — Post to stock pressed; the next real state rolls in from the button",
    "Hand off — Hand to Arif → \"Finding buyer\"; the camera holds, then chases the line",
    "Approve — \"Approved by Mei\"; the pen rests on the card's corner (no orphan loop)",
    "Collect — Confirm → \"2 collected\" (simulated booking SIM-7001); the units lift off",
    "Brand — WareOrb · Every move, one live ledger · WareOrb — by Team Bababoi",
]
PRESSES = [("Counted and checked (tick)", 165), ("Post to stock", 180), ("Hand to Arif", 300), ("Approve", 390), ("Confirm 2 left the warehouse", 465)]
OFFS = [-6, 0, 2, 4, 10]
V3_FRAMES = [92, 181, 301, 404, 482, 615]


def font(names, size):
    for n in names:
        for path in (n, f"/System/Library/Fonts/{n}", f"/usr/share/fonts/truetype/dejavu/{n}"):
            try:
                return ImageFont.truetype(path, size)
            except OSError:
                pass
    return ImageFont.load_default()


F = font(["HelveticaNeue.ttc", "Helvetica.ttc", "DejaVuSans.ttf"], 30)
M = font(["Menlo.ttc", "SFNSMono.ttf", "DejaVuSansMono.ttf"], 22)
S = font(["Menlo.ttc", "SFNSMono.ttf", "DejaVuSansMono.ttf"], 19)
BG, WHITE, BLUE, GREY, DIM = (12, 12, 15), (250, 250, 250), (141, 177, 243), (212, 212, 216), (113, 113, 122)

for i, f in enumerate(FRAMES, 1):
    shutil.copy(f"{RAW}/frame-{f:04d}.png", f"{OUT}/keyframe-{i:02d}.png")

# 1 · six keyframes
tw, th, pad, head = 960, 540, 28, 62
W, H = tw * 2 + pad * 3, (th + head) * 3 + pad * 4 + 76
sheet = Image.new("RGB", (W, H), BG)
d = ImageDraw.Draw(sheet)
d.text((pad, 26), "WareOrb promo v3b — \"One line\", 21 s · review gate · 1920×1080 · 30 fps · frames 0–629 · dpr 2, 180° shutter", fill=WHITE, font=F)
for i, f in enumerate(FRAMES):
    r, c = divmod(i, 2)
    x, y = pad + c * (tw + pad), 76 + pad + r * (th + head + pad)
    d.text((x, y + 4), f"keyframe-{i+1:02d} · frame {f} · {f/30:.2f} s", fill=BLUE, font=M)
    d.text((x, y + 33), LABELS[i], fill=GREY, font=S)
    sheet.paste(Image.open(f"{OUT}/keyframe-{i+1:02d}.png").convert("RGB").resize((tw, th), Image.LANCZOS), (x, y + head))
sheet.save(f"{OUT}/contact-sheet.png")

# 2 · every press: before, the press, the wave, settled
tw, th = 600, 338
W = pad * (len(OFFS) + 1) + tw * len(OFFS)
H = 90 + len(PRESSES) * (th + 70) + pad
tr = Image.new("RGB", (W, H), BG)
d = ImageDraw.Draw(tr)
d.text((pad, 26), "Every real button press: before · press · wave (+2, +4) · settled (+10)", fill=WHITE, font=F)
for r, (name, p) in enumerate(PRESSES):
    y = 90 + r * (th + 70)
    d.text((pad, y), f"{name} · press at frame {p} ({p/30:.2f} s)", fill=BLUE, font=M)
    for c, o in enumerate(OFFS):
        x = pad + c * (tw + pad)
        f = p + o
        d.text((x, y + 32), f"{'+' if o > 0 else ''}{o if o else 'press'} · f{f}", fill=DIM, font=S)
        tr.paste(Image.open(f"{RAW}/frame-{f:04d}.png").convert("RGB").resize((tw, th), Image.LANCZOS), (x, y + 60))
tr.save(f"{OUT}/transitions-sheet.png")

# 3 · v3 (as handed over) next to v3b
tw, th = 720, 405
W, H = pad * 3 + tw * 2, 120 + 6 * (th + 46) + pad
cmp = Image.new("RGB", (W, H), BG)
d = ImageDraw.Draw(cmp)
d.text((pad, 24), "v3 as handed over (left) vs v3b (right)", fill=WHITE, font=F)
d.text((pad, 74), "v3 · previews-v3 (cloud, SwiftShader)", fill=(161, 161, 170), font=M)
d.text((pad * 2 + tw, 74), "v3b · this review", fill=BLUE, font=M)
for i, f in enumerate(FRAMES):
    y = 120 + i * (th + 46)
    d.text((pad, y), f"frame {V3_FRAMES[i]} · {V3_FRAMES[i]/30:.2f} s", fill=DIM, font=S)
    d.text((pad * 2 + tw, y), f"frame {f} · {f/30:.2f} s", fill=DIM, font=S)
    cmp.paste(Image.open(f"{V3}/keyframe-{i+1:02d}.png").convert("RGB").resize((tw, th), Image.LANCZOS), (pad, y + 28))
    cmp.paste(Image.open(f"{OUT}/keyframe-{i+1:02d}.png").convert("RGB").resize((tw, th), Image.LANCZOS), (pad * 2 + tw, y + 28))
cmp.save(f"{OUT}/compare-v3-v3b.png")
print("ok", sheet.size, tr.size, cmp.size)
