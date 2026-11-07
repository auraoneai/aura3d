"""Pairwise frame diffs for capture-games3 output: main-vs-branch plus noise floors (main-vs-main2, branch-vs-branch2).
usage: python3 mad3.py <frameDir> <out.json> [shot ...]; diff is RGB mean abs diff (0-255) and % pixels with any channel > 8.
X-vs-Xnorain is the rain curtains' own pixel contribution (Hoops ?qaNoRain=1)."""
import sys, json, os
import numpy as np
from PIL import Image
d, outp = sys.argv[1], sys.argv[2]
shots = sys.argv[3:]
PAIRS = [("main", "branch"), ("main", "main2"), ("branch", "branch2"), ("main2", "branch2"), ("main", "branchhead"),
         ("main", "mainnorain"), ("branch", "branchnorain"), ("branchhead", "branchnorain"), ("mainnorain", "branchnorain")]
def load(p):
    return np.asarray(Image.open(p).convert("RGB"), dtype=np.float32)
res = {}
for s in shots:
    r = {}
    for a, b in PAIRS:
        pa, pb = os.path.join(d, f"{s}-{a}.png"), os.path.join(d, f"{s}-{b}.png")
        if not (os.path.exists(pa) and os.path.exists(pb)): continue
        x, y = load(pa), load(pb)
        diff = np.abs(x - y)
        r[f"{a}-vs-{b}"] = {"meanAbsDiff": round(float(diff.mean()), 4), "pctPixelsOver8": round(float((diff.max(axis=2) > 8).mean() * 100), 3)}
    res[s] = r
print(json.dumps(res, indent=1))
json.dump(res, open(outp, "w"), indent=1)
