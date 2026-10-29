# usage: retake.py <decoded-run-dir> <repo-root>
# RH-05: rewrite evidence/splat-rush-port/screens/final (same names and sizes) and the index posters from a remote run.
import sys, os
from PIL import Image
src, root = sys.argv[1], sys.argv[2]
dst = os.path.join(root, "evidence/splat-rush-port/screens/final")
pairs = {}
for state in ("title", "early", "roll", "mid-action", "results"):
    pairs[f"{state}-1280.jpg"] = f"desk-{state}-settled.jpg"
    pairs[f"{state}-390.jpg"] = f"phone-{state}-settled.jpg"
pairs["card@2x.jpg"] = "card-roll-60s.jpg"
for out, inp in pairs.items():
    old = Image.open(os.path.join(dst, out)).size
    im = Image.open(os.path.join(src, inp)).convert("RGB")
    assert im.size == old, (out, im.size, old)
    im.save(os.path.join(dst, out), quality=90)
card2 = Image.open(os.path.join(src, "card-roll-60s.jpg")).convert("RGB")
card2.resize((720, 450), Image.LANCZOS).save(os.path.join(dst, "card.jpg"), quality=90)
prev = os.path.join(root, "public/previews/showcase-index")
card2.save(os.path.join(prev, "splat-rush-port@2x.webp"), quality=86)
card2.resize((720, 450), Image.LANCZOS).save(os.path.join(prev, "splat-rush-port.webp"), quality=86)
print("wrote", len(pairs) + 1, "screens and 2 posters")
