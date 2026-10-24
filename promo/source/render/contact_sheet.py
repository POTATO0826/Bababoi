"""Build promo/previews/keyframe-0N.png and contact-sheet.png from rendered preview frames.
usage: python3 contact_sheet.py <raw_dir> <previews_dir>"""
import shutil, sys
from PIL import Image, ImageDraw, ImageFont

RAW, OUT = sys.argv[1], sys.argv[2]
FRAMES = [18, 57, 105, 153, 210, 273]
LABELS = [
    "Hook — the real warehouse twin assembles; identity",
    "Capture — DN-2291 checked, cursor on Post to stock",
    "Detect — product click: zoom in on ageing batch B-2140-A",
    "Coordinate — task to sales, buyer brief, quote comparison",
    "Dispatch — after approval, collected units leave A-1-01",
    "Brand — floor recedes under the WareOrb end card",
]
F = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 26)
M = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf", 22)
for i, f in enumerate(FRAMES, 1):
    shutil.copy(f"{RAW}/frame-{f:04d}.png", f"{OUT}/keyframe-{i:02d}.png")
tw, th, pad, head = 960, 540, 28, 60
W, H = tw * 2 + pad * 3, (th + head) * 3 + pad * 4 + 70
sheet = Image.new("RGB", (W, H), (12, 12, 15))
d = ImageDraw.Draw(sheet)
d.text((pad, 24), "WareOrb promo — preview gate · 1920×1080 · 30 fps · frames 0–299 (10.0 s)", fill=(250, 250, 250), font=F)
for i, f in enumerate(FRAMES):
    r, c = divmod(i, 2)
    x, y = pad + c * (tw + pad), 70 + pad + r * (th + head + pad)
    d.text((x, y + 4), f"keyframe-{i+1:02d} · frame {f} · {f/30:.1f} s", fill=(141, 177, 243), font=M)
    d.text((x, y + 31), LABELS[i], fill=(212, 212, 216), font=M)
    im = Image.open(f"{OUT}/keyframe-{i+1:02d}.png").convert("RGB").resize((tw, th), Image.LANCZOS)
    sheet.paste(im, (x, y + head))
sheet.save(f"{OUT}/contact-sheet.png")
print("contact sheet", sheet.size)
