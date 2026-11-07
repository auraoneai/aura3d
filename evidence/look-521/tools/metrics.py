import sys, json, numpy as np
from PIL import Image
res = {}
for p in sys.argv[1:]:
    a = np.asarray(Image.open(p).convert("RGB")).astype(np.float32) / 255.0
    l = (0.2126*a[...,0] + 0.7152*a[...,1] + 0.0722*a[...,2]) * 255
    mx = a.max(-1); mn = a.min(-1); s = np.where(mx > 0, (mx-mn)/np.maximum(mx,1e-6), 0)
    res[p] = dict(mean=round(float(l.mean()),1), p5=round(float(np.percentile(l,5)),1), p50=round(float(np.percentile(l,50)),1), p95=round(float(np.percentile(l,95)),1), sat=round(float(s.mean()),3))
print(json.dumps(res))
