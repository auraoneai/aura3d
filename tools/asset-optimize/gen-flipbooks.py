#!/usr/bin/env python3
"""K9 VFX flipbook generator — deterministic procedural 8x8 sheets.

Each effect renders 64 frames into a 2048x2048 premultiplied-alpha RGBA PNG
(256x256 cells, row-major). Deterministic under a fixed --seed. Source PNGs
admit to assets/library/vfx/flipbooks/ as `format: "image"` candidates; the
<=6MB KTX2 budget applies to the derived pipeline, not these sources.

Usage: python3 gen-flipbooks.py --out <dir> [--size 2048] [--seed 0x...]
       python3 gen-flipbooks.py --list
"""
import argparse
import math

import numpy as np
from PIL import Image

CELL = 256
GRID = 8  # 8x8 cells = 64 frames


def _rng(seed, name):
    return np.random.default_rng(seed ^ (sum(ord(c) for c in name) << 4))


def _grid(size):
    """Normalized [0,1) pixel coordinates and polar frame helpers."""
    lin = np.linspace(0.0, 1.0, size, endpoint=False)
    x, y = np.meshgrid(lin, lin)
    cx, cy = x - 0.5, y - 0.5
    r = np.sqrt(cx * cx + cy * cy)
    return x, y, cx, cy, r


def _premul(frame):
    """frame: (S,S,4) un-premultiplied float 0..1 -> premultiplied uint8."""
    a = frame[..., 3:4]
    out = frame.copy()
    out[..., :3] = np.minimum(np.clip(out[..., :3], 0.0, 1.0) * a, a)
    return (np.clip(out, 0.0, 1.0) * 255.0).astype(np.uint8)


def _smooth(a, b, t):
    t = np.clip((t - a) / max(b - a, 1e-6), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def _emit(name, fn, seed):
    """fn(cx, cy, r, t, rng) -> (S,S,4) float RGBA for frame phase t in [0,1)."""
    size = CELL
    sheet = np.zeros((CELL * GRID, CELL * GRID, 4), dtype=np.uint8)
    rng = _rng(seed, name)
    for f in range(GRID * GRID):
        t = f / float(GRID * GRID)
        frame = _premul(fn(*( _grid(size)[2:5] ), t, rng))
        gy, gx = divmod(f, GRID)
        sheet[gy * CELL:(gy + 1) * CELL, gx * CELL:(gx + 1) * CELL] = frame
    return Image.fromarray(sheet, "RGBA")


def spark(cx, cy, r, t, rng):
    n = 90
    ang = rng.uniform(0, 2 * np.pi, n)
    speed = rng.uniform(0.25, 0.95, n)
    d = speed * t
    px = np.abs(cx[..., None] - np.cos(ang) * d) + np.abs(cy[..., None] - np.sin(ang) * d)
    glow = np.clip(1.0 - px / 0.015, 0, 1).max(axis=-1)
    fade = 1.0 - t
    col = np.zeros(cx.shape + (4,))
    col[..., 0], col[..., 1], col[..., 2] = 1.0, 0.75, 0.25
    col[..., 3] = glow * fade
    return col


def smoke(cx, cy, r, t, rng):
    drift = t * 0.35
    puff = np.clip(1.0 - np.sqrt(cx**2 + (cy + 0.25 - drift) ** 2) / (0.12 + t * 0.45), 0, 1)
    noise = rng.uniform(0.85, 1.0, cx.shape)
    a = puff * noise * _smooth(0.0, 0.15, t) * (1.0 - t) ** 0.7
    col = np.zeros(cx.shape + (4,))
    col[..., :3] = 0.45
    col[..., 3] = a * 0.55
    return col


def dust(cx, cy, r, t, rng):
    ring = np.exp(-((r - 0.15 - t * 0.55) ** 2) / (2 * 0.05**2))
    grain = rng.uniform(0.7, 1.0, cx.shape)
    col = np.zeros(cx.shape + (4,))
    col[..., :3] = 0.6
    col[..., 3] = ring * grain * (1.0 - t) * 0.5
    return col


def _explosion(scale, hues):
    def fn(cx, cy, r, t, rng):
        core = np.clip(1.0 - r / (0.08 + t * 0.30 * scale), 0, 1)
        fireball = np.clip(1.0 - r / (0.15 + t * 0.55 * scale), 0, 1) * (1.0 - t * 0.6)
        edge = np.exp(-((r - t * 0.6 * scale) ** 2) / (2 * 0.03**2)) * (1 - t)
        col = np.zeros(cx.shape + (4,))
        h0, h1 = hues
        col[..., 0] = core * h0[0] + fireball * h1[0] * 0.8
        col[..., 1] = core * h0[1] + fireball * h1[1] * 0.55 + edge * 0.15
        col[..., 2] = core * h0[2] + fireball * h1[2] * 0.2
        col[..., 3] = np.clip(core * 1.2 + fireball * 0.85 + edge * 0.5, 0, 1) * _smooth(0.0, 0.04, t) * (1.0 - t * 0.75)
        return col
    return fn


def muzzle(cx, cy, r, t, rng):
    arms = np.abs(np.cos(np.arctan2(cy, cx) * 3.0))  # 6-point star
    flash = np.clip(1.0 - r / (0.4 - t * 0.25), 0, 1) * (1.0 - t) ** 1.5
    star = np.clip(arms * (1.0 - r * 2.2), 0, 1) * (1.0 - t)
    col = np.zeros(cx.shape + (4,))
    col[..., 0], col[..., 1], col[..., 2] = 1.0, 0.85, 0.4
    col[..., 3] = np.clip(flash + star * 0.7, 0, 1)
    return col


def splash(cx, cy, r, t, rng):
    ring = np.exp(-((r - t * 0.55) ** 2) / (2 * 0.02**2)) * (1.0 - t * 0.8)
    drops = (rng.uniform(0, 1, cx.shape) > 0.995) * np.clip(1.0 - r / 0.5, 0, 1) * _smooth(0.1, 0.3, t) * (1 - t)
    col = np.zeros(cx.shape + (4,))
    col[..., 0], col[..., 1], col[..., 2] = 0.55, 0.75, 0.95
    col[..., 3] = np.clip(ring + drops, 0, 1) * 0.9
    return col


def bubble(cx, cy, r, t, rng):
    rim = np.exp(-((r - 0.28 - t * 0.08) ** 2) / (2 * 0.015**2))
    spec = np.clip(1.0 - np.sqrt((cx + 0.1) ** 2 + (cy + 0.1) ** 2) / 0.08, 0, 1)
    col = np.zeros(cx.shape + (4,))
    col[..., :3] = rim[..., None] * np.array([0.5, 0.7, 1.0]) + spec[..., None] * 0.8
    col[..., 3] = np.clip(rim * 0.7 + spec * 0.5, 0, 1) * _smooth(0.0, 0.1, t) * (1.0 - _smooth(0.85, 1.0, t))
    return col


def arc(cx, cy, r, t, rng):
    # Lightning bolt: horizontal path with jittered midpoint offsets per frame.
    pts = np.linspace(-0.45, 0.45, 9)
    jit = rng.uniform(-0.12, 0.12, 9); jit[0] = jit[-1] = 0.0
    glow = np.zeros(cx.shape)
    for i in range(8):
        x0, x1 = pts[i], pts[i + 1]
        y0, y1 = jit[i], jit[i + 1]
        seg = np.clip(1.0 - np.abs(cy - (y0 + (y1 - y0) * _smooth(x0, x1, cx))) / 0.008, 0, 1)
        inx = (cx >= min(x0, x1) - 0.01) & (cx <= max(x0, x1) + 0.01)
        glow = np.maximum(glow, seg * inx)
    col = np.zeros(cx.shape + (4,))
    col[..., 0], col[..., 1], col[..., 2] = 0.75, 0.85, 1.0
    col[..., 3] = np.clip(glow, 0, 1) * (0.6 + 0.4 * np.sin(t * 40.0))
    return col


def confetti(cx, cy, r, t, rng):
    n = 60
    ox = rng.uniform(-0.45, 0.45, n); vy = rng.uniform(0.3, 0.8, n)
    hue = rng.uniform(0, 1, n)
    px = np.abs(cx[..., None] - (ox + np.sin(t * 6 + hue * 9) * 0.05))
    py = np.abs(cy[..., None] - (-0.5 + vy * t))
    bits = ((px < 0.012) & (py < 0.02)).any(axis=-1)
    col = np.zeros(cx.shape + (4,))
    # simple hue rotation: three offset channels
    col[..., 0] = bits * (0.5 + 0.5 * np.sin(hue.mean() * 20))
    col[..., 1] = bits * 0.8
    col[..., 2] = bits * (0.5 + 0.5 * np.cos(hue.mean() * 20))
    col[..., 3] = bits * 0.95
    return col


EFFECTS = {
    "spark": spark,
    "smoke": smoke,
    "dust": dust,
    "explosion-flash": _explosion(1.0, ((1.0, 0.9, 0.5), (1.0, 0.4, 0.1))),
    "explosion-fireball": _explosion(1.3, ((1.0, 0.7, 0.2), (0.9, 0.2, 0.05))),
    "explosion-smokeburst": _explosion(1.6, ((1.0, 0.6, 0.3), (0.4, 0.4, 0.4))),
    "muzzle-flash": muzzle,
    "splash": splash,
    "bubble": bubble,
    "electric-arc": arc,
    "confetti": confetti,
}


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--out", help="Output directory for PNG sheets")
    ap.add_argument("--size", type=int, default=2048)
    ap.add_argument("--seed", type=lambda s: int(s, 0), default=0xA3D9)
    ap.add_argument("--list", action="store_true")
    args = ap.parse_args()

    if args.list:
        for k in EFFECTS:
            print(k)
        return

    if not args.out:
        ap.error("--out is required unless --list")

    global CELL
    if args.size != 2048:
        CELL = args.size // GRID

    import os
    os.makedirs(args.out, exist_ok=True)
    for name, fn in EFFECTS.items():
        img = _emit(name, fn, args.seed)
        path = os.path.join(args.out, f"flipbook-{name}.png")
        img.save(path, optimize=True)
        print(f"wrote {path} ({os.path.getsize(path)} bytes)")


if __name__ == "__main__":
    main()
