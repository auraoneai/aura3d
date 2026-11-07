"""Side-by-side crops (nearest-neighbour upscaled) of the same region from several frames, labelled.
usage: python3 crop.py <out.png> <x0> <y0> <x1> <y1> <scale> <label=frame.png> ..."""
import sys
from PIL import Image, ImageDraw
out, x0, y0, x1, y1, scale = sys.argv[1], *map(int, sys.argv[2:6]), int(sys.argv[6])
tiles = []
for arg in sys.argv[7:]:
    label, path = arg.split("=", 1)
    im = Image.open(path).convert("RGB").crop((x0, y0, x1, y1))
    im = im.resize(((x1 - x0) * scale, (y1 - y0) * scale), Image.NEAREST)
    canvas = Image.new("RGB", (im.width, im.height + 18), (0, 0, 0))
    canvas.paste(im, (0, 18))
    ImageDraw.Draw(canvas).text((4, 3), label, fill=(255, 255, 255))
    tiles.append(canvas)
w = sum(t.width for t in tiles) + 6 * (len(tiles) - 1)
sheet = Image.new("RGB", (w, tiles[0].height), (40, 40, 40))
x = 0
for t in tiles:
    sheet.paste(t, (x, 0)); x += t.width + 6
sheet.save(out)
