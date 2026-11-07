"""Contact sheet: one row per shot, one column per variant, each frame downscaled (for viewing every frame).
usage: python3 sheet.py <frameDir> <out.png> <width> <variants,comma> <shot> ..."""
import sys, os
from PIL import Image, ImageDraw
d, out, width = sys.argv[1], sys.argv[2], int(sys.argv[3])
variants = sys.argv[4].split(",")
shots = sys.argv[5:]
h = width * 720 // 1280 + 14
sheet = Image.new("RGB", (width * len(variants), h * len(shots)), (20, 20, 20))
dr = ImageDraw.Draw(sheet)
for r, s in enumerate(shots):
    for c, v in enumerate(variants):
        p = os.path.join(d, f"{s}-{v}.png")
        if not os.path.exists(p): continue
        im = Image.open(p).convert("RGB").resize((width, width * 720 // 1280), Image.LANCZOS)
        sheet.paste(im, (c * width, r * h + 14))
        dr.text((c * width + 3, r * h + 1), f"{s.replace('cross-hop-diorama-', '')} {v}", fill=(255, 255, 255))
sheet.save(out)
