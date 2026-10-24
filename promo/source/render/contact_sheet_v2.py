"""Six v2 keyframes + contact sheet + a v1/v2 comparison sheet.
usage: python3 contact_sheet_v2.py <raw_dir> <previews_v2_dir> <previews_v1_dir>"""
import shutil, sys
from PIL import Image, ImageDraw, ImageFont

RAW, OUT, V1 = sys.argv[1], sys.argv[2], sys.argv[3]
FRAMES = [18, 57, 105, 153, 210, 273]
LABELS = [
    "Hook — one line draws the mark, which opens into the real twin",
    "Capture — the line closes the dock, reveals the note, ticks the check",
    "Spot — two violet laps lock onto ageing batch B-2140-A (product zoom)",
    "Hand off & quote — the line leaves by the door; quotes (synthetic)",
    "Dispatch — units ride the line out; the bay is outlined as freed",
    "Brand — the trail is reeled into the mark, which fills with colour",
]
F = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 26)
M = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf", 22)
S = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf", 20)
for i, f in enumerate(FRAMES, 1):
    shutil.copy(f"{RAW}/frame-{f:04d}.png", f"{OUT}/keyframe-{i:02d}.png")

tw, th, pad, head = 960, 540, 28, 60
W, H = tw * 2 + pad * 3, (th + head) * 3 + pad * 4 + 70
sheet = Image.new("RGB", (W, H), (12, 12, 15))
d = ImageDraw.Draw(sheet)
d.text((pad, 24), "WareOrb promo v2 — \"One line\" · preview gate · 1920×1080 · 30 fps · frames 0–299", fill=(250, 250, 250), font=F)
for i, f in enumerate(FRAMES):
    r, c = divmod(i, 2)
    x, y = pad + c * (tw + pad), 70 + pad + r * (th + head + pad)
    d.text((x, y + 4), f"keyframe-{i+1:02d} · frame {f} · {f/30:.1f} s", fill=(141, 177, 243), font=M)
    d.text((x, y + 31), LABELS[i], fill=(212, 212, 216), font=S)
    sheet.paste(Image.open(f"{OUT}/keyframe-{i+1:02d}.png").convert("RGB").resize((tw, th), Image.LANCZOS), (x, y + head))
sheet.save(f"{OUT}/contact-sheet.png")

# side-by-side: v1 (left) vs v2 (right), same timestamps
tw, th = 720, 405
W, H = pad * 3 + tw * 2, 120 + 6 * (th + 46) + pad
cmp = Image.new("RGB", (W, H), (12, 12, 15))
d = ImageDraw.Draw(cmp)
d.text((pad, 24), "Same timestamps, two directions", fill=(250, 250, 250), font=F)
d.text((pad, 74), "v1 · isometric twin + glass UI panels", fill=(161, 161, 170), font=M)
d.text((pad * 2 + tw, 74), "v2 · \"One line\"", fill=(141, 177, 243), font=M)
for i, f in enumerate(FRAMES):
    y = 120 + i * (th + 46)
    d.text((pad, y), f"frame {f} · {f/30:.1f} s", fill=(113, 113, 122), font=S)
    cmp.paste(Image.open(f"{V1}/keyframe-{i+1:02d}.png").convert("RGB").resize((tw, th), Image.LANCZOS), (pad, y + 28))
    cmp.paste(Image.open(f"{OUT}/keyframe-{i+1:02d}.png").convert("RGB").resize((tw, th), Image.LANCZOS), (pad * 2 + tw, y + 28))
cmp.save(f"{OUT}/compare-v1-v2.png")
print("ok", sheet.size, cmp.size)
