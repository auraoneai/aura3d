# usage: python3 retake.py <frames-root> <desk-run> <card-run> <phone-run> <repo-root>
# GU47 phase 3: rewrite evidence/splat-rush-port/screens/final (same names and sizes) and this game's index posters from
# the decoded frames of a remote run of tests/browser/audit-fix/splat-rush-port.spec.ts (decode-luma names <target>--<shot>.jpg).
import sys, os
from PIL import Image
frames, desk, card, phone, root = sys.argv[1:6]
dst = os.path.join(root, "evidence/splat-rush-port/screens/final")
pairs = {}
for state in ("title", "early", "roll", "mid-action", "results"):
    pairs[f"{state}-1280.jpg"] = os.path.join(frames, desk, f"desk--{state}-settled.jpg")
    pairs[f"{state}-390.jpg"] = os.path.join(frames, phone, f"phone--{state}-settled.jpg")
cardSrc = os.path.join(frames, card, "card--roll-60s.jpg")
pairs["card@2x.jpg"] = cardSrc
for out, inp in pairs.items():
    old = Image.open(os.path.join(dst, out)).size
    im = Image.open(inp).convert("RGB")
    assert im.size == old, (out, im.size, old)
    im.save(os.path.join(dst, out), quality=90)
card2 = Image.open(cardSrc).convert("RGB")
card2.resize((720, 450), Image.LANCZOS).save(os.path.join(dst, "card.jpg"), quality=90)
for prev in ("public/previews/showcase-index", "marketing/public/previews/showcase-index"):
    p = os.path.join(root, prev)
    if not os.path.isdir(p): continue
    card2.save(os.path.join(p, "splat-rush-port@2x.webp"), quality=82)
    card2.resize((720, 450), Image.LANCZOS).save(os.path.join(p, "splat-rush-port.webp"), quality=82)
print("wrote", len(pairs) + 1, "screens and the posters")
