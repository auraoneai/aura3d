"""Before/after metrics for the Apex Overdrive art pass: luma JSD, RGB JSD, edge density, mean luma, and a contact sheet.
usage: python3 -I tools/apex/art-metrics.py <before_dir> <after_dir> <out_dir>"""
import json, os, sys
import numpy as np
from PIL import Image, ImageDraw
before, after, out = sys.argv[1:4]
os.makedirs(out, exist_ok=True)
def load(p): return np.asarray(Image.open(p).convert("RGB"), dtype=np.float64)
def luma(a): return 0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2]
def hist(v, bins=64):
    idx = np.clip((np.asarray(v).ravel() * bins / 256.0).astype(np.int64), 0, bins - 1)
    h = np.bincount(idx, minlength=bins).astype(np.float64) + 1e-9
    return h / h.sum()
def jsd(p, q):
    m = 0.5 * (p + q); kl = lambda a, b: float(np.sum(a * np.log2(a / b))); return 0.5 * kl(p, m) + 0.5 * kl(q, m)
def edge(a):
    l = luma(a); gx = np.abs(np.diff(l, axis=1))[:-1, :]; gy = np.abs(np.diff(l, axis=0))[:, :-1]; return float(np.mean(np.hypot(gx, gy) > 24))
rows, sheet = [], []
names = sorted(f[:-4] for f in os.listdir(after) if f.endswith(".jpg") and os.path.exists(os.path.join(before, f)))
for n in names:
    a, b = load(os.path.join(before, n + ".jpg")), load(os.path.join(after, n + ".jpg"))
    rgb = float(np.mean([jsd(hist(a[..., c]), hist(b[..., c])) for c in range(3)]))
    rows.append({"frame": n, "lumaJSD": round(jsd(hist(luma(a)), hist(luma(b))), 4), "rgbJSD": round(rgb, 4),
                 "meanLuma": {"before": round(float(luma(a).mean()), 1), "after": round(float(luma(b).mean()), 1)},
                 "edgeDensity": {"before": round(edge(a), 4), "after": round(edge(b), 4)}})
    A, B = Image.open(os.path.join(before, n + ".jpg")).convert("RGB").resize((640, 360)), Image.open(os.path.join(after, n + ".jpg")).convert("RGB").resize((640, 360))
    row = Image.new("RGB", (1280, 380), (12, 12, 16)); row.paste(A, (0, 20)); row.paste(B, (640, 20))
    ImageDraw.Draw(row).text((6, 4), f"{n}   before (left) | after (right)", fill=(235, 235, 240)); sheet.append(row)
if sheet:
    S = Image.new("RGB", (1280, 380 * len(sheet)), (12, 12, 16))
    for i, r in enumerate(sheet): S.paste(r, (0, 380 * i))
    S.save(os.path.join(out, "compare-before-vs-art.jpg"), quality=85)
mean = lambda k, s=None: round(float(np.mean([(r[k][s] if s else r[k]) for r in rows])), 4)
summary = {"frames": len(rows), "meanLumaJSD": mean("lumaJSD"), "meanRgbJSD": mean("rgbJSD"), "meanEdgeBefore": mean("edgeDensity", "before"), "meanEdgeAfter": mean("edgeDensity", "after"),
           "meanLumaBefore": mean("meanLuma", "before"), "meanLumaAfter": mean("meanLuma", "after")}
json.dump({"summary": summary, "frames": rows}, open(os.path.join(out, "metrics.json"), "w"), indent=1)
print(json.dumps(summary))
