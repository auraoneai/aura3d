# usage: analyze.py <before-dir> <after-dir> [wave2-cal-dir] [card@2x.jpg]
# Per shot: whole-frame luma, pure-white share and draw calls (from meta.jsonl), and for the 1440x900 roll shot the
# GLB-region luma on the wave-2 mask (pixels the neutral environment moves by > 10 luma) against the pre-4.5.0 card.
import sys, json, os
from PIL import Image
import numpy as np
b, a = sys.argv[1], sys.argv[2]
cal = sys.argv[3] if len(sys.argv) > 3 else None
card = sys.argv[4] if len(sys.argv) > 4 else None
def metas(d):
    out = {}
    for line in open(os.path.join(d, "meta.jsonl")):
        m = json.loads(line); out[(m["target"], m["id"])] = m
    return out
mb, ma = metas(b), metas(a)
def tex(m):
    return m["info"]["diag"].get("frameAllocations.device.textureBytes")
print(f"{'shot':28s} {'luma b':>7s} {'luma a':>7s} {'white% b':>8s} {'white% a':>8s} {'draws b':>7s} {'draws a':>7s} {'texMB b':>7s} {'texMB a':>7s}")
for k in ma:
    if k not in mb: continue
    x, y = mb[k], ma[k]
    tb, ta = tex(x), tex(y)
    print(f"{k[0]+'/'+k[1]:28s} {x['mean']:7.1f} {y['mean']:7.1f} {x['whitePct']:8.2f} {y['whitePct']:8.2f} {x['info']['diag'].get('drawCalls')!s:>7s} {y['info']['diag'].get('drawCalls')!s:>7s} {tb/1e6 if tb else 0:7.1f} {ta/1e6 if ta else 0:7.1f}")
if cal and card:
    L = lambda p: np.asarray(Image.open(p).convert("RGB"), dtype=np.float64) @ np.array([0.2126, 0.7152, 0.0722])
    mask = np.abs(L(f"{cal}/n1-settle-60s.jpg") - L(f"{cal}/ship-settle-60s.jpg")) > 10
    ref = L(card)
    for name, d in (("before", b), ("after", a)):
        f = L(f"{d}/card-roll-60s.jpg")
        print(f"GLB mask ({mask.sum()} px) {name}: {f[mask].mean():.1f} = {f[mask].mean()/ref[mask].mean()*100:.1f}% of card ({ref[mask].mean():.1f})")
