#!/usr/bin/env python3
"""Like rea-extract.py but step ids are short (r07-1) and mapped to run ids through a JSON map. usage: rea-extract-short.py <result.json> <outDir> <map.json> [<eventsOut.json>]"""
import base64, json, os, re, sys
src, out, mp = sys.argv[1:4]
m = json.load(open(mp)); os.makedirs(out, exist_ok=True)
d = json.load(open(src))["normalized_result"]; n = 0
for s in d["steps"]:
    sid = s.get("step_id") or ""; v = ((s.get("artifacts") or {}).get("screenshot") or {}).get("value") or {}
    r = re.match(r"(r\d\d)-([123])$", sid)
    if r and v.get("data_base64"):
        open(os.path.join(out, f"{m[r.group(1)]}-{r.group(2)}.png"), "wb").write(base64.b64decode(v["data_base64"])); n += 1
if len(sys.argv) > 4: json.dump(d["events"]["items"], open(sys.argv[4], "w"))
print(n, "frames")
