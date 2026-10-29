import sys, json, base64, re, os
log, out = sys.argv[1], sys.argv[2]
os.makedirs(out, exist_ok=True)
chunks = {}
metas = []
for line in open(log, errors="replace"):
    i = line.find("E3_META ")
    if i >= 0:
        try: metas.append(json.loads(line[i+8:].strip()))
        except Exception: pass
        continue
    i = line.find("E3_JPG ")
    if i >= 0:
        parts = line[i+7:].strip().split(" ", 3)
        if len(parts) < 4: continue
        t, shot, idx, b64 = parts
        try: k, n = map(int, idx.split("/"))
        except ValueError: continue
        chunks.setdefault((t, shot), {})[k] = (n, b64)
for (t, shot), d in chunks.items():
    n = next(iter(d.values()))[0]
    if len(d) != n: print("incomplete", t, shot, len(d), n); continue
    data = "".join(d[k][1] for k in range(1, n + 1))
    open(os.path.join(out, f"{t}-{shot}.jpg"), "wb").write(base64.b64decode(data))
json.dump(metas, open(os.path.join(out, "meta.json"), "w"), indent=1)
for m in metas:
    sh = (m.get("info") or {}).get("shadows")
    sun = next((r for r in (sh or []) if r.get("light") == "sun"), None)
    print(m["target"], m["id"], "mean", m["mean"], "p50", m["p50"], "dark", m["darkFrac"], "grid", m.get("grid"), "sun", json.dumps(sun) if sun else None)
