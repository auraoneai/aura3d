"""base (5.0.2) vs branchfixed (lane HEAD authoring, no shape/shapeSize) near-camera diffs, next to the base-vs-base2 noise.
usage: python3 mad-fixed.py <frameDir> <out.json>"""
import sys, json, os
import numpy as np
from PIL import Image
d, outp = sys.argv[1], sys.argv[2]
load = lambda p: np.asarray(Image.open(p).convert("RGB"), dtype=np.float32)
res = {}
for s in ["cross-hop-diorama-t0-pollen-near", "cross-hop-diorama-t2-fireflies-near", "cross-hop-diorama-t5-confetti-near"]:
    r = {}
    for a, b in [("base", "branchfixed"), ("base", "base2"), ("branch", "branchfixed"), ("branchfixed", "branchnoamb")]:
        x, y = load(os.path.join(d, f"{s}-{a}.png")), load(os.path.join(d, f"{s}-{b}.png"))
        diff = np.abs(x - y)[32:]
        r[f"{a}-vs-{b}"] = {"meanAbsDiff": round(float(diff.mean()), 4), "pctPixelsOver8": round(float((diff.max(axis=2) > 8).mean() * 100), 3)}
    res[s] = r
print(json.dumps(res, indent=1))
json.dump(res, open(outp, "w"), indent=1)
