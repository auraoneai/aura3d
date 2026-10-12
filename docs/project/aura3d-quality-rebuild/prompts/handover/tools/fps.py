import json, os, subprocess, sys, glob

# usage: fps.py RUNID[=label] ... -> desktop/mobile fps per game for each run
for arg in sys.argv[1:]:
    rid, _, label = arg.partition('=')
    d = f'/tmp/qrq/g/{rid}'
    os.makedirs(d, exist_ok=True)
    if not glob.glob(f'{d}/**/report.json', recursive=True):
        subprocess.run(['gh', 'run', 'download', rid, '-R', 'auraoneai/aura3d', '-p', 'qr-gpu-games-*', '-D', d], capture_output=True)
    reps = glob.glob(f'{d}/**/report.json', recursive=True)
    if not reps:
        print(rid, label, 'no report'); continue
    r = json.load(open(reps[0]))
    for g in r['games']:
        vals = []
        for run in g['runs']:
            f = (run.get('fps') or {})
            vals.append(f"{run['run'][:7]} fps={f.get('fps')} p50={f.get('frameMsP50')}")
        print(f"{rid} {label:6s} {g['id']:28s} " + ' | '.join(vals))
