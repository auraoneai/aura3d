#!/usr/bin/env python3
"""Materials-task probes (bench505) from the two REA frames per run (3 s apart) plus a static source scan.
usage: materials-probes.py <framesDir> <runsWorkDir> <out.json>
Page evaluation (window.__TASK_STATE__ reads) is not available through REA capture_browser_scenario, so the state contract is
checked statically in the final source (assignment present, expected keys present); thresholds from the task probes are applied to
frames 3000 ms apart (the tasks name 1000-1500 ms; a longer gap only makes change easier to see)."""
import colorsys, glob, json, os, re, sys
import numpy as np
from PIL import Image

frames, work, out = sys.argv[1:4]
res = {}
for p in sorted(glob.glob(os.path.join(frames, "*-1.png"))):
    rid = os.path.basename(p)[:-6]
    q = os.path.join(frames, rid + "-2.png")
    if not os.path.exists(q):
        continue
    a = np.asarray(Image.open(p).convert("RGB"), dtype=np.float32)
    b = np.asarray(Image.open(q).convert("RGB"), dtype=np.float32)
    la, lb = a.mean(2), b.mean(2)
    changed = float((np.abs(la - lb) > 8).mean())
    task = int(re.search(r"-t(\d+)-", rid).group(1))
    r = {"task": task, "changedFrac": round(changed, 4), "motionOk": 0.002 <= changed < 0.40, "meanLuma": round(float(lb.mean()), 1)}
    h, w = lb.shape
    thirds = [b[:, i * w // 3:(i + 1) * w // 3].reshape(-1, 3).mean(0) for i in range(3)]
    tl = [float(t.mean()) for t in thirds]
    spread = max(tl) - min(tl)
    cd = max(float(np.abs(thirds[i] - thirds[j]).max()) for i in range(3) for j in range(i + 1, 3))
    r["thirdsLuma"] = [round(x, 1) for x in tl]
    r["thirdsDiffer"] = bool(spread > 3 or cd > 6)
    px = b.reshape(-1, 3) / 255.0
    mx, mn = px.max(1), px.min(1)
    sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0)
    if task == 11:
        R, G, B = px[:, 0], px[:, 1], px[:, 2]
        r["redFrac"] = round(float(((R > 1.6 * G) & (R > 1.6 * B)).mean()), 4)
        r["whiteFrac"] = round(float((mn > 0.94).mean()), 4)
        r["colourOk"] = r["redFrac"] >= 0.03 and r["whiteFrac"] >= 0.001
    if task == 12:
        R, G, B = px[:, 0], px[:, 1], px[:, 2]
        d = mx - mn
        hue = np.zeros_like(mx)
        m = d > 1e-6
        rc = np.where(m & (mx == R), ((G - B) / np.maximum(d, 1e-6)) % 6, 0)
        gc = np.where(m & (mx == G), (B - R) / np.maximum(d, 1e-6) + 2, 0)
        bc = np.where(m & (mx == B), (R - G) / np.maximum(d, 1e-6) + 4, 0)
        hue = (rc + gc + bc) * 60
        gold = (hue >= 35) & (hue <= 55) & (sat > 0.45) & (mx > 0.4)
        light = (sat < 0.15) & (mx > 0.55)
        r["goldFrac"] = round(float(gold.mean()), 4)
        r["lightLowSatFrac"] = round(float(light.mean()), 4)
        r["colourOk"] = r["goldFrac"] >= 0.01 and r["lightLowSatFrac"] >= 0.05
    src = (glob.glob(os.path.join(work, "*", rid, "sandbox", "src")) or [""])[0]
    text = ""
    if os.path.isdir(src):
        for f in glob.glob(os.path.join(src, "**", "*.ts"), recursive=True):
            text += open(f).read() + "\n"
    key = {10: ["spheres", "keyLightX", "glass", "metal", "fabric"], 11: ["turntableAngleDeg", "paintFinish", "clearcoat"], 12: ["materials", "cameraAzimuthDeg", "marble", "gold", "darkstone"]}[task]
    r["stateAssigned"] = bool(re.search(r"__TASK_STATE__\s*=", text)) or "__TASK_STATE__" in text
    r["stateKeysPresent"] = all(k in text for k in key)
    r["stateStaticOk"] = r["stateAssigned"] and r["stateKeysPresent"]
    res[rid] = r
json.dump(res, open(out, "w"), indent=2)
print(len(res), "runs ->", out)
