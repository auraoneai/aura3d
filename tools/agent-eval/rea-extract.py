#!/usr/bin/env python3
"""Pull screenshots out of a saved REA capture_browser_scenario result (the MCP result is saved to a file when it is large).
usage: rea-extract.py <result.json> <outDir>
Every step whose step_id ends in -1 or -2 (e.g. b504-A-t2-aura-r1-1) is written to <outDir>/<step_id>.png.
Screenshots live at normalized_result.steps[*].artifacts.screenshot.value.data_base64."""
import base64
import json
import os
import re
import sys

src, out = sys.argv[1], sys.argv[2]
os.makedirs(out, exist_ok=True)
data = json.load(open(src))
n = 0
for step in data["normalized_result"]["steps"]:
    sid = step.get("step_id") or ""
    value = ((step.get("artifacts") or {}).get("screenshot") or {}).get("value") or {}
    if re.search(r"-[12]$", sid) and value.get("data_base64"):
        open(os.path.join(out, sid + ".png"), "wb").write(base64.b64decode(value["data_base64"]))
        n += 1
print(f"{n} frames -> {out}")
