#!/usr/bin/env python3
"""Structural look metrics between a reference frame and port frames (luma/RGB histogram JSD, palette, edges).

Usage: python3 -I tools/crayon-capture/strange-orbit-art-metrics.py <reference.jpg> <label=frame.jpg>... > metrics.json
The reference is a local-only third-party screenshot; only the numbers are written out.
"""
import json
import sys

import numpy as np
from PIL import Image


def load(path):
    return np.asarray(Image.open(path).convert("RGB").resize((640, 360), Image.BILINEAR), dtype=np.float32)


def luma(a):
    return 0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2]


def hist(v, bins=32, hi=255.0):
    idx = np.minimum((np.asarray(v, dtype=np.float64) / hi * bins).astype(np.int64), bins - 1).ravel()
    h = np.bincount(idx, minlength=bins).astype(np.float64) + 1e-9
    return h / h.sum()


def jsd(p, q):
    m = 0.5 * (p + q)
    kl = lambda a, b: float(np.sum(a * np.log2(a / b)))
    return 0.5 * kl(p, m) + 0.5 * kl(q, m)


def edge_density(a, thr=24.0):
    l = luma(a)
    gx = np.abs(np.diff(l, axis=1))[:-1, :]
    gy = np.abs(np.diff(l, axis=0))[:, :-1]
    return float(np.mean(np.hypot(gx, gy) > thr))


def palette(a, k=6):
    q = (a // 32).astype(np.int32).reshape(-1, 3)
    keys, counts = np.unique(q[:, 0] * 64 + q[:, 1] * 8 + q[:, 2], return_counts=True)
    order = np.argsort(-counts)[:k]
    out = []
    for i in order:
        key = int(keys[i])
        out.append([(key // 64) * 32 + 16, ((key // 8) % 8) * 32 + 16, (key % 8) * 32 + 16])
    return out


def palette_distance(pa, pb):
    return float(np.mean([min(np.linalg.norm(np.array(x) - np.array(y)) for y in pb) for x in pa]))


def sat(a):
    mx, mn = a.max(axis=2), a.min(axis=2)
    return float(np.mean((mx - mn) / np.maximum(mx, 1.0)))


def describe(a):
    return {"lumaMean": round(float(luma(a).mean()), 2), "lumaStd": round(float(luma(a).std()), 2), "saturation": round(sat(a), 3), "edgeDensity": round(edge_density(a), 4), "meanRGB": [round(float(a[..., c].mean()), 1) for c in range(3)]}


def main():
    ref = load(sys.argv[1])
    ref_l = hist(luma(ref))
    ref_rgb = [hist(ref[..., c]) for c in range(3)]
    ref_pal = palette(ref)
    result = {"reference": describe(ref), "frames": {}}
    for arg in sys.argv[2:]:
        label, path = arg.split("=", 1)
        a = load(path)
        rgb = [hist(a[..., c]) for c in range(3)]
        result["frames"][label] = {
            **describe(a),
            "lumaJSD": round(jsd(ref_l, hist(luma(a))), 4),
            "rgbJSD": round(float(np.mean([jsd(ref_rgb[c], rgb[c]) for c in range(3)])), 4),
            "paletteDistance": round(palette_distance(ref_pal, palette(a)), 1),
            "palette": palette(a),
        }
    json.dump(result, sys.stdout, indent=1)
    sys.stdout.write("\n")


main()
