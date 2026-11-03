#!/usr/bin/env python3
"""Tolerance-bounded RGBE requantiser for the 1k catalogue HDRIs (GU47 E-A budget tool).

An asset-pipeline tool, not a test or a gate. It keeps the exponent plane of a Radiance `.hdr` exact and moves
mantissa bytes only inside a per-texel interval that is derived, not guessed: for every (exponent, mantissa) pair the
interval is the set of mantissas whose tone-mapped 8-bit output stays within `--levels` of the original at EVERY
exposure of the ladder (so the bound is exact for the exposures listed, per texel and per channel). A dynamic
programme then picks, per scanline plane, the cheapest Radiance run-length encoding whose run values lie inside
those intervals (runs of 2..127 and literal blocks of 1..128, which every Radiance reader accepts; the repo's
writer uses runs of 4 or more only). `--alpha` shrinks every interval towards the original byte, so the least
lossy file that fits a byte budget is found by bisection (`--target-bytes`).

  requantize-hdr.py quantize IN OUT --ladder aces:0.05:3.4:12 [--ladder linear:0.25:2:12] [--levels 1]
                                    [--target-bytes 1572864] [--comment TEXT]
  requantize-hdr.py verify OLD NEW  --ladder ... [--full-ladder aces:0.2:12:8] [--json OUT]

Ladder spec `curve:min:max:steps_per_octave`; curve is `aces` (Narkowicz filmic, the shader tone map used by
a3dPbrEncodeOutput, then the sRGB OETF) or `linear` (clip then sRGB OETF, the `toneMapping: none` games).
The decode convention is the renderer's: value = m * 2^(E-128) / 255, E = 0 is black. Deterministic: the same
inputs give the same bytes. Needs numpy.
"""
import argparse, hashlib, json, re, sys
import numpy as np

W_EXPECT = 1024
INF = 30000


# ------------------------------------------------------------------ Radiance RGBE (new-style RLE) -----------
def parse_header(b):
    p = 0

    def line():
        nonlocal p
        nl = b.index(b"\n", p)
        s = b[p:nl]
        p = nl + 1
        return s

    line()
    while len(line()) != 0:
        pass
    res = line().decode("latin1")
    m = re.match(r"\s*-Y\s+(\d+)\s+\+X\s+(\d+)", res)
    if not m:
        raise ValueError("unsupported resolution line: " + res)
    return p, int(m.group(2)), int(m.group(1))


def decode(b):
    """-> (header_bytes, planes uint8 [H, 4, W]) for a new-style RLE file (scanline marker 2,2,hi,lo)."""
    p0, W, H = parse_header(b)
    p = p0
    planes = np.zeros((H, 4, W), dtype=np.uint8)
    for y in range(H):
        if not (b[p] == 2 and b[p + 1] == 2 and (b[p + 2] << 8 | b[p + 3]) == W):
            raise ValueError("scanline %d is not new-style RLE" % y)
        p += 4
        for c in range(4):
            w = 0
            while w < W:
                n = b[p]
                p += 1
                if n > 128:
                    n -= 128
                    planes[y, c, w:w + n] = b[p]
                    p += 1
                else:
                    planes[y, c, w:w + n] = np.frombuffer(b, dtype=np.uint8, count=n, offset=p)
                    p += n
                w += n
    if p != len(b):
        raise ValueError("trailing bytes")
    return b[:p0], planes


def rle_repo(src, out):
    """Exact port of writeRleChannel (packages/aura3d-cli/src/commands/assets/optimize.ts): runs of >= 4 only."""
    n = len(src)
    cursor = 0
    while cursor < n:
        run_start = cursor
        run_len = 0
        while run_start < n:
            run_len = 1
            v = src[run_start]
            while run_len < 127 and run_start + run_len < n and src[run_start + run_len] == v:
                run_len += 1
            if run_len >= 4:
                break
            run_start += run_len
        if run_start >= n:
            run_start = n
            run_len = 0
        while cursor < run_start:
            count = min(128, run_start - cursor)
            out.append(count)
            out.extend(src[cursor:cursor + count])
            cursor += count
        if run_len >= 4:
            out.append(128 + run_len)
            out.append(src[run_start])
            cursor = run_start + run_len


def encode_repo(header, planes):
    H, _, W = planes.shape
    out = bytearray(header)
    for y in range(H):
        out.extend([2, 2, W >> 8, W & 255])
        for c in range(4):
            rle_repo(planes[y, c].tolist(), out)
    return bytes(out)


# ------------------------------------------------------------------ tone maps and the interval table --------
def srgb_oetf(x):
    # Explicit ufunc calls on purpose: with NumPy 2.2 on Python 3.14 an operator expression such as `x * 12.92` on a large
    # local array can be elided in place and silently overwrite `x` (borrowed local references defeat NumPy's refcount
    # check), so none of the numeric code in this tool uses operators on big arrays. `_selftest` guards it.
    x = np.minimum(np.maximum(x, 0.0), 1.0)
    low = np.multiply(x, 12.92)
    high = np.subtract(np.multiply(np.power(x, 1.0 / 2.4), 1.055), 0.055)
    return np.where(np.less_equal(x, 0.0031308), low, high)


def aces(x):
    num = np.multiply(x, np.add(np.multiply(x, 2.51), 0.03))
    den = np.add(np.multiply(x, np.add(np.multiply(x, 2.43), 0.59)), 0.14)
    return np.minimum(np.maximum(np.divide(num, den), 0.0), 1.0)


def out_level(curve, v):
    """8-bit sRGB level of a linear value (already multiplied by exposure)."""
    y = aces(v) if curve == "aces" else np.minimum(np.maximum(v, 0.0), 1.0)
    return np.rint(np.multiply(srgb_oetf(y), 255.0)).astype(np.int16)


def _scalar_level(curve, v):
    import math
    if curve == "aces":
        v = (v * (2.51 * v + 0.03)) / (v * (2.43 * v + 0.59) + 0.14)
    v = min(1.0, max(0.0, v))
    s = v * 12.92 if v <= 0.0031308 else 1.055 * v ** (1.0 / 2.4) - 0.055
    return int(round(s * 255.0))                          # banker's rounding, like np.rint


def _selftest():
    """The vectorised level table must equal a plain-Python evaluation (guards the NumPy/Python 3.14 elision bug)."""
    v = value_table()
    rng = np.random.RandomState(3)
    for curve, X in (("aces", 0.31), ("aces", 2.0), ("linear", 0.9)):
        lev = out_level(curve, np.multiply(v, X))
        if int(lev.max()) > 255 or int(lev.min()) < 0:
            raise SystemExit("self-test failed: level table out of range")
        for _ in range(400):
            e = int(rng.randint(1, 256))
            m = int(rng.randint(0, 256))
            ref = _scalar_level(curve, float(v[e, m]) * X)
            if abs(int(lev[e, m]) - ref) > 0:
                raise SystemExit("self-test failed at E=%d m=%d %s %.2f: %d vs %d" % (e, m, curve, X, int(lev[e, m]), ref))
        for e in (1, 60, 120, 128, 140, 255):
            if not bool(np.all(np.diff(lev[e]) >= 0)):
                raise SystemExit("self-test failed: level table not monotone at E=%d" % e)


def parse_ladder(specs):
    """['aces:0.05:3.4:12', ...] -> list of (curve, exposure) sorted deterministically."""
    out = []
    for spec in specs:
        curve, lo, hi, per = spec.split(":")
        lo, hi, per = float(lo), float(hi), int(per)
        if curve not in ("aces", "linear"):
            raise ValueError("curve must be aces or linear: " + spec)
        n = max(1, int(round(np.log2(hi / lo) * per)))
        for i in range(n + 1):
            out.append((curve, float(lo * (hi / lo) ** (i / n))))
    return out


def value_table():
    """v[E, m] = m * 2^(E-128) / 255 (renderer decode); E = 0 is black."""
    E = np.arange(256, dtype=np.float64)[:, None]
    m = np.arange(256, dtype=np.float64)[None, :]
    scale = np.divide(np.power(2.0, np.subtract(E, 128.0)), 255.0)
    v = np.multiply(m, scale)
    v[0, :] = 0.0
    return v


def interval_tables(ladder, levels):
    """lo[E, m], hi[E, m] (int16): the widest mantissa interval around m that stays within `levels` at every ladder point."""
    v = value_table()
    lo = np.zeros((256, 256), dtype=np.int16)
    hi = np.full((256, 256), 255, dtype=np.int16)
    m_idx = np.arange(256)
    lo[:] = 0
    for curve, X in ladder:
        lev = out_level(curve, np.multiply(v, X))          # [E, m], non-decreasing in m
        for e in range(1, 256):
            row = lev[e]
            lo_e = np.searchsorted(row, np.subtract(row, levels), side="left")
            hi_e = np.subtract(np.searchsorted(row, np.add(row, levels), side="right"), 1)
            lo[e] = np.maximum(lo[e], lo_e)
            hi[e] = np.minimum(hi[e], hi_e)
    lo[0, :] = 0
    hi[0, :] = 255                                          # E = 0 decodes to black whatever the mantissa
    return lo, hi


def scale_tables(lo, hi, alpha):
    m = np.arange(256, dtype=np.int16)[None, :]
    if alpha >= 1.0:
        return lo.copy(), hi.copy()
    dl = np.subtract(m, lo).astype(np.float64)
    dh = np.subtract(hi, m).astype(np.float64)
    lo_a = np.subtract(m, np.floor(np.multiply(dl, alpha))).astype(np.int16)
    hi_a = np.add(m, np.floor(np.multiply(dh, alpha))).astype(np.int16)
    return lo_a, hi_a


def lift_tables(ladder, levels, max_lift):
    """Exact-value-preserving exponent lifts. A texel stored as (E, m) can be re-expressed at E' = E + d with the
    mantissa halved d times (coarser grid, never a finer one: m * 2^(E-128) must stay representable). For every
    (E, m) and d = 1..max_lift this gives the interval of mantissas m' at E + d whose tone-mapped level stays within
    `levels` of the ORIGINAL (E, m) at every ladder point (lo > hi marks an empty interval)."""
    v = value_table()
    lev = [out_level(c, np.multiply(v, x)) for c, x in ladder]
    lo = np.zeros((max_lift + 1, 256, 256), dtype=np.int16)
    hi = np.full((max_lift + 1, 256, 256), 255, dtype=np.int16)
    for d in range(1, max_lift + 1):
        lo[d] = 0
        hi[d] = 255
        for e in range(1, 256 - d):
            for lv in lev:
                row_new = lv[e + d]
                row_old = lv[e]
                lo[d, e] = np.maximum(lo[d, e], np.searchsorted(row_new, np.subtract(row_old, levels), side="left"))
                hi[d, e] = np.minimum(hi[d, e], np.subtract(np.searchsorted(row_new, np.add(row_old, levels), side="right"), 1))
        for e in range(256 - d, 256):
            lo[d, e] = 1
            hi[d, e] = 0                                    # no room above 255
        lo[d, 0] = 1
        hi[d, 0] = 0                                        # black stays as is
    return lo, hi


def scale_lift(lo, hi, d, alpha):
    """alpha-shrink a lifted interval towards the ideal (real-valued) mantissa m / 2^d; alpha 0 keeps exact lifts only."""
    ideal = np.divide(np.arange(256, dtype=np.float64), float(2 ** d))[None, :]
    lo_f = lo.astype(np.float64)
    hi_f = hi.astype(np.float64)
    if alpha >= 1.0:
        return lo.copy(), hi.copy()
    lo_a = np.maximum(lo_f, np.ceil(np.subtract(ideal, np.multiply(np.maximum(np.subtract(ideal, lo_f), 0.0), alpha))))
    hi_a = np.minimum(hi_f, np.floor(np.add(ideal, np.multiply(np.maximum(np.subtract(hi_f, ideal), 0.0), alpha))))
    return lo_a.astype(np.int16), hi_a.astype(np.int16)


# ------------------------------------------------------------------ dynamic programme ----------------------
def max_run(lo, hi):
    """Mx[b, x]: longest n <= 127 with a non-empty intersection of [lo, hi] over x..x+n-1 (0 when n = 1 only)."""
    B, W = lo.shape
    ml = lo.copy()
    mh = hi.copy()
    Mx = np.ones((B, W), dtype=np.int16)
    for n in range(2, 128):
        # window [x, x+n): extend by position x+n-1
        sl = slice(0, W - n + 1)
        sh = slice(n - 1, W)
        ml[:, sl] = np.maximum(ml[:, sl], lo[:, sh])
        mh[:, sl] = np.minimum(mh[:, sl], hi[:, sh])
        ok = np.zeros((B, W), dtype=bool)
        ok[:, sl] = ml[:, sl] <= mh[:, sl]
        Mx[ok] = n
        if not ok.any():
            break
    return Mx


def plan_chunk(lo, hi, want_plan):
    """Exact-cost DP over plane scanlines [B, W]. Returns total cost per row (bytes, excluding the 4-byte marker) and,
    when requested, the segmentation as lists of (start, length) runs per row."""
    B, W = lo.shape
    Mx = max_run(lo, hi)
    F = np.zeros((W + 1, B, 128), dtype=np.int16) if want_plan else None
    Fx1 = np.zeros((B, 128), dtype=np.int16)                # F[W]
    F0 = np.zeros((W + 1, B), dtype=np.int16)               # F[x][0]
    for x in range(W - 1, -1, -1):
        lit = np.empty((B, 128), dtype=np.int16)
        lit[:, 1:127] = Fx1[:, 2:128] + 1
        lit[:, 127] = Fx1[:, 0] + 1
        lit[:, 0] = Fx1[:, 1] + 2
        R = np.full(B, INF, dtype=np.int16)
        top = int(min(127, W - x))
        mxx = Mx[:, x]
        for n in range(2, top + 1):
            cand = F0[x + n] + 2
            R = np.where(mxx >= n, np.minimum(R, cand), R)
        Fx = np.minimum(lit, R[:, None])
        F0[x] = Fx[:, 0]
        if want_plan:
            F[x] = Fx
        Fx1 = Fx
    total = F0[0].astype(np.int64)
    if not want_plan:
        return total, None, Mx
    return total, F, Mx


def reconstruct(F, Mx, lo, hi, orig, row, prefer_low=False):
    """Forward walk for one row: the (start, length, value) runs and the literal flags of the chosen segmentation."""
    W = lo.shape[1]
    F0 = F[:, row, 0]
    runs = []
    x = 0
    k = 0
    mx = Mx[row]
    while x < W:
        if k == 0:
            lit_cost = 2 + int(F[x + 1, row, 1])
        elif k == 127:
            lit_cost = 1 + int(F[x + 1, row, 0])
        else:
            lit_cost = 1 + int(F[x + 1, row, k + 1])
        best_run = INF
        best_n = 0
        top = int(min(127, W - x, mx[x]))
        if top >= 2:
            seg = F0[x + 2:x + top + 1].astype(np.int32) + 2
            j = int(np.argmin(seg))                         # first minimum: the shortest run on ties
            best_n = j + 2
            best_run = int(seg[j])
        if best_n >= 2 and best_run < lit_cost:
            seg_lo = int(lo[row, x:x + best_n].max())
            seg_hi = int(hi[row, x:x + best_n].min())
            if prefer_low:
                val = seg_lo                                 # exponent plane: keep the finest grid the run allows
            else:
                med = int(np.floor(np.median(orig[row, x:x + best_n]) + 0.5))
                val = min(max(med, seg_lo), seg_hi)
            runs.append((x, best_n, val))
            x += best_n
            k = 0
        else:
            x += 1
            k = 0 if k == 127 else k + 1
    return runs


def plan_plane(lo, hi, orig, want_plan, prefer_low=False, chunk=256):
    """DP over every scanline of one plane. -> (total payload bytes, runs per row or None)."""
    H = lo.shape[0]
    total = 0
    runs_all = [None] * H if want_plan else None
    for r0 in range(0, H, chunk):
        r1 = min(H, r0 + chunk)
        cost, F, Mx = plan_chunk(lo[r0:r1], hi[r0:r1], want_plan)
        total += int(cost.sum())
        if want_plan:
            for r in range(r1 - r0):
                runs_all[r0 + r] = reconstruct(F, Mx, lo[r0:r1], hi[r0:r1], orig[r0:r1], r, prefer_low)
    return total, runs_all


def apply_runs(vals, runs_all):
    out = vals.copy()
    for y, runs in enumerate(runs_all):
        for (s, n, v) in runs:
            out[y, s:s + n] = v
    return out


class Tables:
    """alpha-scaled interval tables: same-exponent (lo0, hi0) and exponent lifts (lifts[d-1] = (lo, hi))."""

    def __init__(self, lo_full, hi_full, lift_full, alpha):
        self.lo0, self.hi0 = scale_tables(lo_full, hi_full, alpha)
        self.lifts = []
        if lift_full is not None:
            llo, lhi = lift_full
            for d in range(1, llo.shape[0]):
                self.lifts.append(scale_lift(llo[d], lhi[d], d, alpha))


def quantize_planes(planes, tabs, want_plan=True):
    """-> (payload bytes, new planes uint8 [H,4,W], runs per (plane index, row) or None)."""
    H, _, W = planes.shape
    E = planes[:, 3, :]
    L = len(tabs.lifts)
    new = planes.copy()
    # per-texel maximum exponent lift: every channel must have a non-empty lifted interval at each step
    dmax = np.zeros((H, W), dtype=np.int16)
    if L > 0:
        alive = np.not_equal(E, 0)
        for d in range(1, L + 1):
            llo, lhi = tabs.lifts[d - 1]
            ok = alive.copy()
            for c in range(3):
                Pm = planes[:, c, :]
                ok = np.logical_and(ok, np.less_equal(llo[E, Pm], lhi[E, Pm]))
            alive = ok
            dmax = np.where(alive, d, dmax).astype(np.int16)
    total = 0
    runs = {}
    E16 = E.astype(np.int16)
    if L > 0:
        tE, rE = plan_plane(E16, np.add(E16, dmax), E16, True, prefer_low=True)
        E2 = apply_runs(E16, rE).astype(np.int16)
        total += tE
        runs[3] = rE
        new[:, 3, :] = E2.astype(np.uint8)
    else:
        tE, rE = plan_plane(E16, E16, E16, want_plan)
        total += tE
        E2 = E16
        if want_plan:
            runs[3] = rE
    delta = np.subtract(E2, E16)                              # >= 0, <= dmax
    for c in range(3):
        P = planes[:, c, :]
        lo = tabs.lo0[E, P].copy()
        hi = tabs.hi0[E, P].copy()
        adj = P.astype(np.int16)
        for d in range(1, L + 1):
            sel = np.equal(delta, d)
            if sel.any():
                llo, lhi = tabs.lifts[d - 1]
                lo = np.where(sel, llo[E, P], lo)
                hi = np.where(sel, lhi[E, P], hi)
                ideal = np.floor(np.add(np.divide(P.astype(np.float64), float(2 ** d)), 0.5)).astype(np.int16)
                adj = np.where(sel, np.minimum(np.maximum(ideal, lo), hi), adj)
        tc, rc = plan_plane(lo, hi, adj, want_plan)
        total += tc
        if want_plan:
            runs[c] = rc
            new[:, c, :] = apply_runs(adj, rc).astype(np.uint8)
    return total, new, (runs if want_plan else None)


def build_file(header, new_planes, runs, base_planes):
    """Emit the file from the realised planes: runs are re-derived so the byte layout equals the plan."""
    H, _, W = new_planes.shape
    out = bytearray(header)
    for y in range(H):
        out.extend([2, 2, W >> 8, W & 255])
        for c in range(4):
            vals = new_planes[y, c].tolist()
            emit_runs(vals, runs[c][y] if c in runs else [], out)
    return bytes(out)


def emit_runs(vals, runs, out):
    """Write one plane scanline: the planned runs (value already realised in `vals`), literals in blocks of <= 128."""
    W = len(vals)
    pos = 0
    ri = 0
    lit = []

    def flush():
        i = 0
        while i < len(lit):
            blk = lit[i:i + 128]
            out.append(len(blk))
            out.extend(blk)
            i += 128
        lit.clear()

    while pos < W:
        if ri < len(runs) and runs[ri][0] == pos:
            flush()
            s, n, v = runs[ri]
            out.append(128 + n)
            out.append(vals[pos])
            pos += n
            ri += 1
        else:
            lit.append(vals[pos])
            pos += 1
    flush()


def add_comment(header, comment):
    """Insert `# comment` before the FORMAT line (keeps the magic line first)."""
    if not comment:
        return header
    i = header.index(b"\n") + 1
    lines = header[i:]
    # keep existing comments, then ours, then the rest
    j = 0
    while lines[j:j + 1] == b"#":
        j = lines.index(b"\n", j) + 1
    return header[:i] + lines[:j] + b"# " + comment.encode("latin1") + b"\n" + lines[j:]


# ------------------------------------------------------------------ commands -------------------------------
def cmd_quantize(a):
    _selftest()
    b = open(a.inp, "rb").read()
    header, planes = decode(b)
    ladder = parse_ladder(a.ladder)
    lo_full, hi_full = interval_tables(ladder, a.levels)
    lift_full = lift_tables(ladder, a.levels, a.max_lift) if a.max_lift > 0 else None
    header_out = add_comment(header, a.comment)
    marker = 4 * planes.shape[0]

    def size_for(alpha, want_plan=False):
        tabs = Tables(lo_full, hi_full, lift_full, alpha)
        total, new, runs = quantize_planes(planes, tabs, want_plan=want_plan)
        return len(header_out) + marker + total, new, runs

    s0, _, _ = size_for(0.0)
    s1, _, _ = size_for(1.0)
    report = {"input_bytes": len(b), "lossless_optimal_rle_bytes": s0, "alpha_1_bytes": s1, "max_lift": a.max_lift}
    alpha = 1.0
    if a.target_bytes is not None:
        if s0 <= a.target_bytes:
            alpha = 0.0
        elif s1 > a.target_bytes:
            report["status"] = "target not reachable at alpha 1"
            print(json.dumps(report))
            return 2
        else:
            lo_a, hi_a = 0.0, 1.0
            for _ in range(a.bisect_steps):
                mid = (lo_a + hi_a) / 2.0
                sm, _, _ = size_for(mid)
                if sm <= a.target_bytes:
                    hi_a = mid
                else:
                    lo_a = mid
            alpha = hi_a
    if a.alpha is not None:
        alpha = a.alpha
    est, new_planes, runs = size_for(alpha, want_plan=True)
    data = build_file(header_out, new_planes, runs, planes)
    open(a.out, "wb").write(data)
    report.update({"alpha": alpha, "levels": a.levels, "ladder_points": len(ladder), "output_bytes": len(data),
                   "planned_bytes": est, "sha256": hashlib.sha256(data).hexdigest()})
    # the bytes must decode to exactly the realised planes
    h2, p2 = decode(data)
    report["decodes_to_plan"] = bool(np.array_equal(p2, new_planes))
    print(json.dumps(report))
    return 0


def linear_image(planes):
    E = planes[:, 3, :].astype(np.float64)
    scale = np.where(np.equal(E, 0), 0.0, np.divide(np.power(2.0, np.subtract(E, 128.0)), 255.0))
    return np.stack([np.multiply(planes[:, c, :].astype(np.float64), scale) for c in range(3)], axis=-1)   # [H, W, 3]


def gaussian_blur(img, sigma):
    """Separable Gaussian: wrap in x (equirect), reflect in y. Explicit ufuncs only."""
    rad = int(np.ceil(3 * sigma))
    k = np.exp(np.divide(np.multiply(np.arange(-rad, rad + 1, dtype=np.float64) ** 2, -0.5), sigma * sigma))
    k = np.divide(k, k.sum())
    H, W, C = img.shape
    pad = np.concatenate([img[:, W - rad:, :], img, img[:, :rad, :]], axis=1)
    out = np.zeros((H, W, C))
    for i, kv in enumerate(k):
        out = np.add(out, np.multiply(pad[:, i:i + W, :], kv))
    top = img[1:rad + 1][::-1]
    bot = img[H - rad - 1:H - 1][::-1]
    pad = np.concatenate([top, out, bot], axis=0)
    res = np.zeros((H, W, C))
    for i, kv in enumerate(k):
        res = np.add(res, np.multiply(pad[i:i + H], kv))
    return res


def rel_change(old, new, floor):
    return np.divide(np.abs(np.subtract(new, old)), np.maximum(old, floor))


def cmd_verify(a):
    _selftest()
    old = open(a.old, "rb").read()
    new = open(a.new, "rb").read()
    _, po = decode(old)
    _, pn = decode(new)
    res = {"old_bytes": len(old), "new_bytes": len(new), "old_sha256": hashlib.sha256(old).hexdigest(),
           "new_sha256": hashlib.sha256(new).hexdigest(),
           "exponent_plane_identical": bool(np.array_equal(po[:, 3, :], pn[:, 3, :])),
           "exponent_texels_lifted": int(np.not_equal(po[:, 3, :], pn[:, 3, :]).sum()),
           "texels": int(po.shape[0] * po.shape[2])}
    lin_changed = np.not_equal(linear_image(po), linear_image(pn)).any(-1)
    res["texels_with_changed_value"] = int(lin_changed.sum())
    res["changed_value_fraction"] = res["texels_with_changed_value"] / res["texels"]
    v = value_table()
    Eo = po[:, 3, :]
    En = pn[:, 3, :]

    def sweep(ladder):
        worst = {}
        stats = []
        for curve, X in ladder:
            lev = out_level(curve, np.multiply(v, X))          # [E, m]
            lo_img = np.stack([lev[Eo, po[:, c, :]] for c in range(3)], axis=-1).astype(np.int16)
            ln_img = np.stack([lev[En, pn[:, c, :]] for c in range(3)], axis=-1).astype(np.int16)
            d = np.abs(np.subtract(lo_img, ln_img))
            n2 = int((d >= 2).sum())
            n1 = int((d == 1).sum())
            # banding: new horizontal/vertical output steps of >= 2 levels where the original step was <= 1
            bands = 0
            smooth = 0
            for axis in (1, 0):
                go = np.abs(np.diff(lo_img, axis=axis))
                gn = np.abs(np.diff(ln_img, axis=axis))
                smooth += int((go <= 1).sum())
                bands += int(np.logical_and(gn >= 2, go <= 1).sum())
            stats.append({"curve": curve, "exposure": round(X, 4), "max_diff": int(d.max()), "texels_diff_1": n1,
                          "texels_diff_ge2": n2, "diff1_fraction": n1 / d.size, "new_steps_ge2_where_old_le1": bands,
                          "band_fraction": bands / max(1, smooth)})
            worst[curve] = max(worst.get(curve, 0), int(d.max()))
        return worst, stats

    used = parse_ladder(a.ladder)
    w_used, s_used = sweep(used)
    res["used_ladder"] = {"points": len(used), "max_diff_by_curve": w_used,
                          "worst_band_fraction": max(s["band_fraction"] for s in s_used),
                          "worst_diff1_fraction": max(s["diff1_fraction"] for s in s_used),
                          "texels_diff_ge2": sum(s["texels_diff_ge2"] for s in s_used)}
    if a.full_ladder:
        full = parse_ladder(a.full_ladder)
        w_full, s_full = sweep(full)
        res["full_ladder"] = {"points": len(full), "max_diff_by_curve": w_full,
                              "texels_diff_ge2": sum(s["texels_diff_ge2"] for s in s_full),
                              "samples": int(len(full) * po[:, :3, :].size),
                              "worst_band_fraction": max(s["band_fraction"] for s in s_full),
                              "worst_diff1_fraction": max(s["diff1_fraction"] for s in s_full)}
        res["full_ladder_by_exposure"] = [(s["curve"], s["exposure"], s["max_diff"], s["texels_diff_ge2"]) for s in s_full[::6]]
    # unseen exposures: a deterministic random set inside each curve's used range (not on the ladder grid)
    rng = np.random.RandomState(7)
    unseen = []
    for c in sorted({c for c, _ in used}):
        xs = [x for cc, x in used if cc == c]
        for _ in range(a.unseen):
            unseen.append((c, float(np.exp(rng.uniform(np.log(min(xs)), np.log(max(xs)))))))
    w_un, s_un = sweep(unseen)
    res["unseen_exposures"] = {"points": len(unseen), "max_diff_by_curve": w_un,
                               "texels_diff_ge2": sum(s["texels_diff_ge2"] for s in s_un)}
    # linear-light change per texel (only texels above 1e-3 of the peak, where a relative change means something)
    lo_img = linear_image(po)
    ln_img = linear_image(pn)
    peak = float(lo_img.max())
    rc = rel_change(lo_img, ln_img, 1e-12)
    sig = lo_img > peak * 1e-3
    res["linear_relative_change"] = {"peak": peak, "p99": float(np.percentile(rc[sig], 99)) if sig.any() else 0.0,
                                     "p99_9": float(np.percentile(rc[sig], 99.9)) if sig.any() else 0.0,
                                     "max": float(rc[sig].max()) if sig.any() else 0.0}
    # diffuse irradiance: cosine-weighted sphere integral toward the six axes; box 32x16; Gaussian blurs (specular proxy)
    H, W = lo_img.shape[:2]
    th = np.multiply(np.divide(np.add(np.arange(H), 0.5), H), np.pi)
    ph = np.multiply(np.divide(np.add(np.arange(W), 0.5), W), 2 * np.pi)
    sa = np.multiply(np.sin(th)[:, None], (np.pi / H) * (2 * np.pi / W))
    dirs = np.stack([np.multiply(np.sin(th)[:, None], np.cos(ph)[None, :]),
                     np.multiply(np.cos(th)[:, None], np.ones((1, W))),
                     np.multiply(np.sin(th)[:, None], np.sin(ph)[None, :])], axis=-1)    # [H, W, 3]
    irr = []
    for axis in np.eye(3):
        for sgn in (1.0, -1.0):
            n = np.multiply(axis, sgn)
            cosv = np.multiply(np.maximum(np.multiply(dirs, n).sum(-1), 0.0), sa)
            a_old = np.multiply(lo_img, cosv[..., None]).sum((0, 1))
            a_new = np.multiply(ln_img, cosv[..., None]).sum((0, 1))
            irr.append(float(np.max(rel_change(a_old, a_new, 1e-12))))
    res["irradiance_max_relative_change_pct"] = 100.0 * max(irr)
    box_o = lo_img.reshape(16, H // 16, 32, W // 32, 3).mean((1, 3))
    box_n = ln_img.reshape(16, H // 16, 32, W // 32, 3).mean((1, 3))
    res["box32x16_max_relative_change_pct"] = 100.0 * float(np.max(rel_change(box_o, box_n, 1e-9)))
    blur = {}
    for sigma in (1.0, 2.0, 4.0, 8.0):
        bo = gaussian_blur(lo_img, sigma)
        bn = gaussian_blur(ln_img, sigma)
        keep = bo > peak * 1e-3
        blur["sigma_%g_px_max_relative_change_pct" % sigma] = 100.0 * float(rel_change(bo, bn, 1e-12)[keep].max()) if keep.any() else 0.0
    res["blur_relative_change"] = blur
    e_old = float(np.multiply(lo_img, sa[..., None]).sum())
    e_new = float(np.multiply(ln_img, sa[..., None]).sum())
    res["total_energy_change_pct"] = 100.0 * (e_new - e_old) / e_old
    print(json.dumps(res, indent=1 if a.json is None else None))
    if a.json:
        json.dump(res, open(a.json, "w"), indent=1)
    return 0


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    q = sub.add_parser("quantize")
    q.add_argument("inp")
    q.add_argument("out")
    q.add_argument("--ladder", action="append", required=True)
    q.add_argument("--levels", type=int, default=1)
    q.add_argument("--target-bytes", type=int, default=None)
    q.add_argument("--bisect-steps", type=int, default=7)
    q.add_argument("--max-lift", type=int, default=0)
    q.add_argument("--alpha", type=float, default=None)
    q.add_argument("--comment", default="")
    v = sub.add_parser("verify")
    v.add_argument("old")
    v.add_argument("new")
    v.add_argument("--ladder", action="append", required=True)
    v.add_argument("--full-ladder", action="append", default=[])
    v.add_argument("--unseen", type=int, default=40)
    v.add_argument("--json", default=None)
    a = ap.parse_args()
    return cmd_quantize(a) if a.cmd == "quantize" else cmd_verify(a)


if __name__ == "__main__":
    sys.exit(main())
