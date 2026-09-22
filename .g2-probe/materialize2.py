#!/usr/bin/env python3
"""Materialize real LFS object bytes over pointer files for g2's exact assets.
SHA256-verified: only exact matches are copied."""
import hashlib
import os
import re
import shutil

WORKTREE = "/home/hatch/workspace/aura3d-g2"
MANIFEST = os.path.join(WORKTREE, "src/aura-assets.ts")
PUBLIC = os.path.join(WORKTREE, "public/aura-assets")

NAMES = {
    # turbo
    "showcaseCc0FormulaRaceCar", "showcaseCcByFormulaOpponent", "showcaseTsukubaCircuit",
    "turboAlpineVenueBackdrop", "turboCircuitEnvironmentV2", "turboFormulaCircuit", "turboHairpinVenueKit",
    # skyline
    "propPineTree", "propRockB", "showcaseExpressiveRobot", "showcaseKenneyVerdantPlatformerWorld",
    "showcaseTeaHouse", "skylineArcticRunnerHero", "skylineHeroRunner",
    "skylineIceLedgeCompact", "skylineIceLedgeLong", "skylineIceLedgeMedium", "skylineWinterParallaxBackdrop",
    # courier
    "courierParcel", "courierTrafficHatch", "courierTrafficSedan", "courierVan",
    "courierVanMeshyV2Decimated", "courierZoneAwning", "courierZoneBollard",
    # patrol
    "patrolAircraftMeshy", "patrolWingDroneA", "patrolWingDroneB", "patrolWingPadBeacon",
}

def sha256_of(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()

def is_pointer(path):
    with open(path, "rb") as f:
        return b"git-lfs.github.com/spec/v1" in f.read(200)

text = open(MANIFEST).read()
assets = []
for m in re.finditer(r'"([A-Za-z0-9_]+)": \{\s*\n\s*type: "(?:model|audio)",\s*\n\s*format: "(?:glb|wav|ogg)",\s*\n\s*url: "(/aura-assets/[^"]+)",\s*\n\s*hash: "sha256-([0-9a-f]{64})"', text):
    name, url, hx = m.groups()
    if name in NAMES:
        assets.append((name, url, hx))
print(f"target assets: {len(assets)}")

print("indexing real files ...")
index = {}
for root, dirs, files in os.walk(WORKTREE):
    if "/.git/" in root or "/node_modules/" in root:
        continue
    for fn in files:
        if not fn.endswith((".glb", ".wav", ".ogg")):
            continue
        p = os.path.join(root, fn)
        if p.startswith(PUBLIC + "/"):
            continue
        try:
            if os.path.getsize(p) < 500:
                continue
            with open(p, "rb") as f:
                if b"git-lfs.github.com/spec/v1" in f.read(200):
                    continue
            hx = sha256_of(p)
            index.setdefault(hx, []).append(p)
        except OSError:
            pass
print(f"indexed {sum(len(v) for v in index.values())} real files")

fixed, missing, ok = 0, [], 0
for name, url, hx in sorted(assets):
    target = os.path.join(PUBLIC, os.path.basename(url))
    if not os.path.exists(target):
        missing.append((name, "target file missing"))
        continue
    if not is_pointer(target):
        ok += 1
        continue
    srcs = index.get(hx, [])
    if not srcs:
        missing.append((name, "no matching real bytes in worktree"))
        continue
    shutil.copyfile(srcs[0], target)
    assert sha256_of(target) == hx, "verify failed"
    fixed += 1
    print(f"  FIXED {name} <- {srcs[0]}")

print(f"\nreal: {ok}, fixed: {fixed}, missing: {len(missing)}")
for name, reason in missing:
    print(f"  MISSING {name}: {reason}")
