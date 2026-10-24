# Crops the real WareOrb captures (captured/ui, 2x DPR) into the before/after card states used by promo v3.
# Every state is an unedited rectangle from one screenshot of the real app; before/after pairs come from
# consecutive captures around a single real click (see capture/capture-flow.mjs).
import json, os
from PIL import Image
HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "../captured/ui")
OUT = os.path.join(HERE, "public/ui3")
os.makedirs(OUT, exist_ok=True)
crops = {
    # Receiving (J. Lim): line item unchecked → checked → Post to stock pressed → posted, history row recorded
    "r0-unchecked": ("c01-receipt-review", (14, 508, 786, 948)),
    "r1-checked": ("c02-receipt-checked", (14, 520, 786, 960)),
    "r2-posted": ("c03-receipt-posted", (14, 408, 786, 848)),
    # Ageing batch (Mei): Hand to Arif → Finding buyer
    "a0-ageing": ("c05-ageing-batch", None),
    "a1-handed": ("c05b-handed", None),
    # Approval (Mei): Approve → Approved by Mei
    "p0-approval": ("c08-approval", None),
    "p1-decision": ("c09-decision", None),
    # Collection (J. Lim): Confirm 2 left the warehouse → 2 collected
    "q0-confirm": ("c10b-collect-confirm", None),
    "q1-collected": ("c10c-collected", None),
}
meta = {}
for name, (src, box) in crops.items():
    im = Image.open(os.path.join(SRC, src + ".png"))
    if box:
        im = im.crop(box)
    im.save(os.path.join(OUT, name + ".png"))
    meta[name] = {"src": src, "box": box, "size": im.size}
# Button rectangles (in the state image's own pixels), found by thresholding the white button.
meta["buttons"] = {
    "r1-checked": [26 - 14, 876 - 520, 773 - 14, 947 - 520],
    "a0-ageing": [26, 634, 773, 705],
    "p0-approval": [12, 523, 575, 594],
    "q0-confirm": [12, 132, 591, 203],
    # the "Counted and checked" checkbox centre in r0
    "r0-checkbox": [58, 177],
}
json.dump(meta, open(os.path.join(OUT, "ui3.json"), "w"), indent=1)
print(json.dumps(meta, indent=1))
