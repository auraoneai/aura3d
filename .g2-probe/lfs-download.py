#!/usr/bin/env python3
"""Download Git LFS objects for g2's missing assets via the public LFS batch API.
No auth needed (repo is public). Places objects and copies to public/aura-assets."""
import hashlib
import json
import os
import re
import urllib.request

WORKTREE = "/home/hatch/workspace/aura3d-g2"
MANIFEST = os.path.join(WORKTREE, "src/aura-assets.ts")
PUBLIC = os.path.join(WORKTREE, "public/aura-assets")
LFS_URL = "https://github.com/auraoneai/aura3d.git/info/lfs/objects/batch"

NAMES = {
    "showcaseCc0FormulaRaceCar", "showcaseCcByFormulaOpponent", "showcaseTsukubaCircuit",
    "turboCircuitEnvironmentV2",
    "propPineTree", "propRockB", "showcaseTeaHouse", "skylineHeroRunner",
    "courierParcel", "courierTrafficHatch", "courierTrafficSedan", "courierVan",
    "courierVanMeshyV2Decimated", "courierZoneAwning", "courierZoneBollard",
    "patrolAircraftMeshy", "patrolWingDroneA", "patrolWingDroneB", "patrolWingPadBeacon",
}

def is_pointer(path):
    with open(path, "rb") as f:
        return b"git-lfs.github.com/spec/v1" in f.read(200)

def pointer_info(path):
    oid, size = None, None
    with open(path) as f:
        for line in f:
            line = line.strip()
            m = re.match(r"oid sha256:([0-9a-f]{64})", line)
            if m: oid = m.group(1)
            m = re.match(r"size (\d+)", line)
            if m: size = int(m.group(1))
    return oid, size

text = open(MANIFEST).read()
needed = []  # (name, target_path, oid, size)
for m in re.finditer(r'"([A-Za-z0-9_]+)": \{\s*\n\s*type: "(?:model|audio)",\s*\n\s*format: "(?:glb|wav|ogg)",\s*\n\s*url: "(/aura-assets/[^"]+)"', text):
    name, url = m.groups()
    if name not in NAMES:
        continue
    target = os.path.join(PUBLIC, os.path.basename(url))
    if os.path.exists(target) and is_pointer(target):
        oid, size = pointer_info(target)
        if oid:
            needed.append((name, target, oid, size))
print(f"need to download: {len(needed)}")

# Batch request (public repo, no auth)
objs = [{"oid": oid, "size": size} for _, _, oid, size in needed]
req = urllib.request.Request(
    LFS_URL,
    data=json.dumps({"operation": "download", "objects": objs}).encode(),
    headers={"Content-Type": "application/json", "Accept": "application/vnd.git-lfs+json"},
)
with urllib.request.urlopen(req, timeout=60) as resp:
    batch = json.load(resp)

dl_map = {}
for o in batch.get("objects", []):
    acts = o.get("actions", {}).get("download", {})
    if acts.get("href"):
        dl_map[o["oid"]] = (acts["href"], acts.get("header", {}))

print(f"got download URLs for {len(dl_map)} objects")

ok = 0
for name, target, oid, size in needed:
    if oid not in dl_map:
        print(f"  NO URL {name}")
        continue
    href, headers = dl_map[oid]
    try:
        r = urllib.request.Request(href, headers=headers)
        with urllib.request.urlopen(r, timeout=120) as resp:
            data = resp.read()
        if len(data) != size:
            print(f"  SIZE MISMATCH {name}: got {len(data)}, want {size}")
            continue
        if hashlib.sha256(data).hexdigest() != oid:
            print(f"  HASH MISMATCH {name}")
            continue
        with open(target, "wb") as f:
            f.write(data)
        ok += 1
        print(f"  OK {name} ({len(data)} bytes)")
    except Exception as e:
        print(f"  FAIL {name}: {e}")

print(f"\ndownloaded {ok}/{len(needed)}")
