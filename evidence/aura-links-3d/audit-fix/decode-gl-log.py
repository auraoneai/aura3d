import sys, json, base64, os, collections
log, out = sys.argv[1], sys.argv[2]
os.makedirs(out, exist_ok=True)
chunks = collections.defaultdict(dict); metas = []; states = []
for line in open(log, errors="replace"):
    line = line.rstrip("\n")
    i = line.find("GL_JPG ")
    if i >= 0:
        parts = line[i:].split(" ", 4)
        if len(parts) == 5:
            _, tgt, sid, idx, b64 = parts
            k, n = idx.split("/")
            chunks[(tgt, sid)][int(k)] = (int(n), b64.strip())
        continue
    for tag, dest in (("GL_META ", metas), ("GL_STATE ", states)):
        i = line.find(tag)
        if i >= 0:
            try: dest.append(json.loads(line[i+len(tag):]))
            except Exception: pass
for (tgt, sid), parts in chunks.items():
    n = next(iter(parts.values()))[0]
    if len(parts) != n: print("incomplete", tgt, sid, len(parts), n); continue
    open(os.path.join(out, f"{tgt}-{sid}.jpg"), "wb").write(base64.b64decode("".join(parts[k][1] for k in range(1, n+1))))
with open(os.path.join(out, "meta.jsonl"), "w") as f:
    for m in metas: f.write(json.dumps(m) + "\n")
    for s in states: f.write(json.dumps({"state": s}) + "\n")
for m in metas: print(m["target"], m["id"], "mean", m.get("mean"), "dark", m.get("darkFrac"), "p50", m.get("p50"), "p95", m.get("p95"))
for s in states: print("STATE", json.dumps(s)[:600])
