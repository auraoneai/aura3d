import sys, json, os, glob
import numpy as np
from PIL import Image
d = sys.argv[1]
res = {}
for b in sorted(glob.glob(os.path.join(d, "*-before.png"))):
    name = os.path.basename(b)[:-len("-before.png")]
    a = b.replace("-before", "-after")
    if not os.path.exists(a): continue
    x = np.asarray(Image.open(b).convert("RGB"), dtype=np.float32)
    y = np.asarray(Image.open(a).convert("RGB"), dtype=np.float32)
    diff = np.abs(x - y)
    # canvas area only (skip top bar and HUD is the same in both)
    res[name] = {"meanAbsDiff": round(float(diff.mean()), 4), "pctPixelsOver8": round(float((diff.max(axis=2) > 8).mean() * 100), 3),
                 "meanLumaBefore": round(float(x.mean()), 3), "meanLumaAfter": round(float(y.mean()), 3)}
print(json.dumps(res, indent=1))
if len(sys.argv) > 2: json.dump(res, open(sys.argv[2], "w"), indent=1)
