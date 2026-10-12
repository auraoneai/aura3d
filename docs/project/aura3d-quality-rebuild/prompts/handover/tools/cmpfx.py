import json, os, sys
import numpy as np
from PIL import Image

def load(p):
    a = np.asarray(Image.open(p).convert('RGB')).astype(np.float32)
    return a, 0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2]

def runs(base):
    r = json.load(open(os.path.join(base, 'report.json')))
    out = {}
    for g in r['games']:
        for run in g['runs']:
            if run['run'].startswith('desktop'):
                fps = (run.get('fps') or {}).get('fps')
                errs = run.get('errors') or run.get('consoleErrors') or []
                pe = run.get('pageErrors') or []
                out[g['id']] = (run, fps, len(errs) if isinstance(errs, list) else errs, len(pe) if isinstance(pe, list) else pe)
    return out

A, B = sys.argv[1], sys.argv[2]
ra, rb = runs(A), runs(B)
for gid in sorted(ra):
    if gid not in rb: print(gid, 'missing in B'); continue
    (runa, fpa, ea, pa), (runb, fpb, eb, pb) = ra[gid], rb[gid]
    fa = {s['file']: s for s in runa['shots']}
    fb = {s['file']: s for s in runb['shots']}
    print(f"== {gid} fps {fpa}->{fpb} ({(fpb or 0)/(fpa or 1)*100:.0f}%) errs {ea}/{pa} -> {eb}/{pb}")
    for f in sorted(set(fa) & set(fb)):
        pa_, pb_ = os.path.join(A, f), os.path.join(B, f)
        if not (os.path.exists(pa_) and os.path.exists(pb_)): continue
        a, la = load(pa_); b, lb = load(pb_)
        if a.shape != b.shape: print(' ', f, 'shape mismatch'); continue
        d = np.abs(a - b).mean(-1)
        h, w = d.shape
        # breadth: share of 8x8 grid cells whose mean diff > 6
        cells = d[:h - h % 8, :w - w % 8].reshape(8, h // 8, 8, w // 8).mean((1, 3))
        lit = la > 40
        print(f"  {os.path.basename(f)[:34]:34s} mad={d.mean():5.1f} broad={(cells > 6).mean() * 100:3.0f}% "
              f"luma {la.mean():5.1f}->{lb.mean():5.1f} ({(lb.mean() / max(la.mean(), 1e-3) - 1) * 100:+4.0f}%) "
              f"lit {la[lit].mean() if lit.any() else 0:5.1f}->{lb[lit].mean() if lit.any() else 0:5.1f} "
              f"clip {(a.max(-1) >= 250).mean() * 100:4.1f}->{(b.max(-1) >= 250).mean() * 100:4.1f}%")
