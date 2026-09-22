#!/usr/bin/env python3
"""Tile probe screenshots into one labelled contact sheet (see game-contact-sheets.mjs)."""
import argparse
from PIL import Image, ImageDraw, ImageFont

ap = argparse.ArgumentParser()
ap.add_argument("--out", required=True)
ap.add_argument("--title", default="")
ap.add_argument("--cols", type=int, default=3)
ap.add_argument("--rows", type=int, default=0)
ap.add_argument("--tw", type=int, default=560)
ap.add_argument("--th", type=int, default=315)
ap.add_argument("--labelh", type=int, default=22)
ap.add_argument("files", nargs="+")
a = ap.parse_args()

BG, FG, DIM = (11, 14, 20), (232, 238, 252), (150, 165, 195)
try:
    font = ImageFont.load_default()
except Exception:
    font = None

cols = max(1, a.cols)
rows = a.rows or max(1, -(-len(a.files) // cols))
pad, head = 6, 30
W = pad + cols * (a.tw + pad)
H = head + pad + rows * (a.th + a.labelh + pad)
sheet = Image.new("RGB", (W, H), BG)
d = ImageDraw.Draw(sheet)
d.text((pad + 2, 8), a.title, fill=FG, font=font)

for i, f in enumerate(a.files):
    r, c = divmod(i, cols)
    x = pad + c * (a.tw + pad)
    y = head + pad + r * (a.th + a.labelh + pad)
    try:
        im = Image.open(f).convert("RGB")
        im.thumbnail((a.tw, a.th))
    except Exception:
        im = Image.new("RGB", (a.tw, a.th), (40, 40, 46))
    ox = x + (a.tw - im.width) // 2
    oy = y + (a.th - im.height) // 2
    sheet.paste(im, (ox, oy))
    d.rectangle([x, y, x + a.tw - 1, y + a.th - 1], outline=(50, 58, 74))
    name = f.rsplit("/", 1)[-1]
    d.text((x + 2, y + a.th + 4), name, fill=DIM, font=font)

sheet.save(a.out, optimize=True)
print(a.out)
