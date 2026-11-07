import json, os, sys
import numpy as np
from PIL import Image, ImageDraw

E = "/Users/gurbakshchahal/platforms/aura3d/.claude/worktrees/wf_7dd4990d-317-2/evidence/look-521"


def metrics(path):
    import subprocess
    return json.loads(subprocess.check_output(["python3", "/tmp/look521/tools/metrics.py", path]))[path]


out = {}
for game in sorted(os.listdir(E)):
    d = os.path.join(E, game)
    if not os.path.isdir(d) or game == "controls":
        continue
    row = {}
    for f in ["4718.png", "503.png", "branch.png", "4718-play.png", "503-play.png", "branch-play.png"]:
        p = os.path.join(d, f)
        if os.path.exists(p):
            row[f[:-4]] = metrics(p)
    out[game] = row
    S = Image.new("RGB", (1920, 740), "white"); dr = ImageDraw.Draw(S)
    for i, (f, lab) in enumerate([("4718.png", "4.7.18 load"), ("503.png", "5.0.3 load"), ("branch.png", "lane 521 load"),
                                  ("4718-play.png", "4.7.18 after play"), ("503-play.png", "5.0.3 after play"), ("branch-play.png", "lane 521 after play")]):
        p = os.path.join(d, f)
        if not os.path.exists(p):
            continue
        im = Image.open(p).convert("RGB").resize((640, 360))
        x, y = (i % 3) * 640, (i // 3) * 380
        S.paste(im, (x, y + 18))
        m = metrics(p)
        dr.text((x + 4, y + 3), f"{game}  {lab}  luma mean {m['mean']} p5/p50/p95 {m['p5']}/{m['p50']}/{m['p95']} sat {m['sat']}", fill="black")
    S.save(os.path.join(d, "sheet.png"))

ctrl = os.path.join(E, "controls")
if os.path.isdir(ctrl):
    rows = {}
    for f in sorted(os.listdir(os.path.join(ctrl, "base"))):
        if not f.endswith(".png"):
            continue
        b = os.path.join(ctrl, "base", f); r = os.path.join(ctrl, "branch", f)
        A = np.asarray(Image.open(b).convert("RGB")).astype(np.float32); B = np.asarray(Image.open(r).convert("RGB")).astype(np.float32)
        rows[f[:-4]] = dict(base=metrics(b), branch=metrics(r), meanAbsDiff=round(float(np.abs(A - B).mean()), 3),
                            pixelsOver8=round(float((np.abs(A - B).max(-1) > 8).mean()), 4))
    out["controls"] = rows
json.dump(out, open(os.path.join(E, "metrics.json"), "w"), indent=1)
print(json.dumps(out, indent=1)[:6000])
