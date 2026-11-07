"""Pairwise frame diffs for capture-crosshop-ambient output.
usage: python3 mad-ambient.py <frameDir> <out.json> [shot ...]
meanAbsDiff = RGB mean abs diff (0-255); pctPixelsOver8 = % pixels with any channel > 8.
X-vs-Xnoamb is the ambient emitter's own pixel contribution (?diag=1&qaNoAmbient=1)."""
import sys, json, os
import numpy as np
from PIL import Image
d, outp = sys.argv[1], sys.argv[2]
shots = sys.argv[3:]
PAIRS = [("base", "base2"), ("branch", "branch2"), ("base", "branch"), ("base", "branchpoint"), ("branch", "branchpoint"),
         ("base", "basenoamb"), ("branch", "branchnoamb"), ("branchpoint", "branchnoamb"), ("basenoamb", "branchnoamb")]
def load(p):
    return np.asarray(Image.open(p).convert("RGB"), dtype=np.float32)
res = {}
for s in shots:
    r = {}
    for a, b in PAIRS:
        pa, pb = os.path.join(d, f"{s}-{a}.png"), os.path.join(d, f"{s}-{b}.png")
        if not (os.path.exists(pa) and os.path.exists(pb)): continue
        x, y = load(pa), load(pb)
        # Ignore the HUD strip (top 32 px) where the diag/quickbar chrome lives; the game canvas is below it.
        diff = np.abs(x - y)[32:]
        r[f"{a}-vs-{b}"] = {"meanAbsDiff": round(float(diff.mean()), 4), "pctPixelsOver8": round(float((diff.max(axis=2) > 8).mean() * 100), 3)}
    res[s] = r
print(json.dumps(res, indent=1))
json.dump(res, open(outp, "w"), indent=1)
