import json, glob, os, subprocess, sys

# usage: flk.py RUN_A RUN_B [games...] -> per-game flicker metrics A vs B
def load(rid):
    d = f'/tmp/qrq/flk/{rid}'
    if not glob.glob(f'{d}/*/summary.json'):
        os.makedirs(d, exist_ok=True)
        subprocess.run(['gh', 'run', 'download', rid, '-R', 'auraoneai/aura3d', '-D', d], capture_output=True)
    out = {}
    for f in glob.glob(f'{d}/*/summary.json'):
        for g, v in json.load(open(f))['games'].items():
            out[g] = v.get('default') or next(iter(v.values()))
    return out, d

a, da = load(sys.argv[1]); b, db = load(sys.argv[2])
games = sys.argv[3:] or sorted(a)
for g in games:
    if g not in a or g not in b: print(g, 'missing'); continue
    x, y = a[g], b[g]
    print(f"{g:28s} deltaStd {x['deltaStd']:.3f}->{y['deltaStd']:.3f}  lumaMin {x['lumaMin']:.1f}->{y['lumaMin']:.1f}  "
          f"lumaMean {x['lumaMean']:.1f}->{y['lumaMean']:.1f}  madMax {x['madMax']:.1f}->{y['madMax']:.1f}  hfStd {x['hfStd']:.3f}->{y['hfStd']:.3f}")
