import sys, os, re, base64, json
log, out = sys.argv[1], sys.argv[2]
os.makedirs(out, exist_ok=True)
chunks, metas = {}, []
for line in open(log, errors="replace"):
    i = line.find("GL_JPG ")
    if i >= 0:
        p = line[i:].strip().split(" ")
        if len(p) < 5: continue
        k = (p[1], p[2]); a, n = map(int, p[3].split("/"))
        chunks.setdefault(k, {})[a] = p[4]; chunks[k]["n"] = n
    i = line.find("GL_META ")
    if i >= 0:
        try: metas.append(json.loads(line[i+8:].strip()))
        except Exception: pass
for (t, s), c in chunks.items():
    n = c.pop("n")
    if len(c) != n: print("incomplete", t, s, len(c), n); continue
    open(f"{out}/{t}-{s}.jpg", "wb").write(base64.b64decode("".join(c[j] for j in range(1, n+1))))
with open(f"{out}/meta.jsonl", "w") as f:
    for m in metas: f.write(json.dumps(m) + "\n")
print(len(chunks), "frames", len(metas), "metas")
