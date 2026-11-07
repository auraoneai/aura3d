#!/usr/bin/env python3
"""Environment-task frame probes (bench505). usage: env-probes.py <framesDir> <out.json>
Frames <id>-1/2/3.png: captured at t=2s, t=5s (3 s later) and t=6.5s (1.5 s later), viewport 640x360. Thresholds from the task probe text, applied to these timings."""
import colorsys, glob, json, os, sys
import numpy as np
from PIL import Image
frames, out = sys.argv[1], sys.argv[2]
ids = sorted({os.path.basename(p).rsplit("-", 1)[0] for p in glob.glob(os.path.join(frames, "*-1.png"))})
TH = {10: (0.5, 25), 11: (0.2, 25), 12: (1, 35), 13: (0.5, 30)}
res = {}
for rid in ids:
    ps = [os.path.join(frames, f"{rid}-{i}.png") for i in (1, 2, 3)]
    if not all(os.path.exists(p) for p in ps): continue
    im = [np.asarray(Image.open(p).convert("RGB"), dtype=np.float32) for p in ps]
    task = int(rid.split("-t")[1].split("-")[0])
    d = lambda a, b: float(np.abs(a - b).mean() / 255 * 100)
    d12, d23 = d(im[0], im[1]), d(im[1], im[2])
    f = im[2]; L = f @ np.array([0.299, 0.587, 0.114], dtype=np.float32)
    small = np.asarray(Image.fromarray(f.astype(np.uint8)).resize((32, 32)), dtype=np.uint8) >> 3
    distinct = len({tuple(p) for p in small.reshape(-1, 3)})
    R, G, B = f[..., 0], f[..., 1], f[..., 2]
    warm = float(((R > 200) & (B < 120)).mean() * 100)
    hs = np.asarray(Image.fromarray(f.astype(np.uint8)).convert("HSV"), dtype=np.float32)
    mask = (hs[..., 1] > 0.3 * 255) & (hs[..., 2] > 0.2 * 255)
    bins = np.bincount((hs[..., 0][mask] / 256 * 12).astype(int).clip(0, 11), minlength=12)
    clusters = int((bins > 0.005 * f.shape[0] * f.shape[1]).sum())
    lo, hi = TH[task]
    motion = lo < d12 < hi and lo < d23 < hi
    s = dict(d12=round(d12, 2), d23=round(d23, 2), lumMean=round(float(L.mean()), 1), lumStd=round(float(L.std()), 1), distinct32=distinct, warmPct=round(warm, 3), bgOverR=round(float((G.mean() + B.mean()) / max(R.mean(), 1e-6)), 2), hueClusters=clusters, motionOk=bool(motion))
    extra = {10: distinct >= 200, 11: s["lumStd"] > 12, 12: 120 <= s["lumMean"] <= 235 and warm >= 0.05, 13: s["bgOverR"] > 1.3 and s["lumStd"] > 15 and clusters >= 5}[task]
    s["probeOk"] = bool(motion and extra and s["lumStd"] > 3)
    res[rid] = s
json.dump(res, open(out, "w"), indent=1)
print(len(res), "runs")
