#!/usr/bin/env python3
"""Materialize real LFS object bytes over pointer files for g2's four games.

For each asset in src/aura-assets.ts belonging to the four g2 games, if
public/aura-assets/<file> is a Git LFS pointer, search the worktree for a
real file whose SHA256 matches the pointer's oid, and copy it over.
SHA256-verified: only exact matches are copied.
"""
import hashlib
import json
import os
import re
import shutil
import sys

WORKTREE = "/home/hatch/workspace/aura3d-g2"
MANIFEST = os.path.join(WORKTREE, "src/aura-assets.ts")
PUBLIC = os.path.join(WORKTREE, "public/aura-assets")

PREFIXES = ("turbo", "skyline", "courier", "patrol", "showcase")

def sha256_of(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()

def is_lfs_pointer(path):
    try:
        with open(path, "rb") as f:
            head = f.read(200)
        return b"git-lfs.github.com/spec/v1" in head
    except OSError:
        return False

def pointer_oid(path):
    with open(path) as f:
        for line in f:
            m = re.match(r"oid sha256:([0-9a-f]{64})", line.strip())
            if m:
                return m.group(1)
    return None

# 1. Parse manifest: "name": { ... "url": "/aura-assets/<file>", "hash": "sha256-<hex>", ... }
text = open(MANIFEST).read()
assets = []
for m in re.finditer(r'"([A-Za-z0-9_]+)": \{\s*\n\s*type: "(model|audio)",\s*\n\s*format: "(glb|wav|ogg)",\s*\n\s*url: "(/aura-assets/[^"]+)",\s*\n\s*hash: "sha256-([0-9a-f]{64})"', text):
    name, atype, fmt, url, hx = m.groups()
    if name.startswith(PREFIXES):
        assets.append((name, url, hx))
print(f"found {len(assets)} g2 assets in manifest")

# 2. Build SHA256 index of candidate real files (generated/ dirs + app asset dirs, skip pointers)
print("indexing real files by sha256 ...")
index = {}
count = 0
for root, dirs, files in os.walk(WORKTREE):
    if "/.git/" in root or "/node_modules/" in root:
        continue
    for fn in files:
        if not fn.endswith((".glb", ".wav", ".ogg")):
            continue
        p = os.path.join(root, fn)
        # skip known pointer locations
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
            count += 1
        except OSError:
            pass
print(f"indexed {count} real files")

# 3. Materialize
fixed, missing, ok = 0, [], 0
for name, url, hx in assets:
    target = os.path.join(PUBLIC, os.path.basename(url))
    if not os.path.exists(target):
        missing.append((name, url, "target missing"))
        continue
    if not is_lfs_pointer(target):
        ok += 1
        continue
    oid = pointer_oid(target)
    if oid != hx:
        missing.append((name, url, f"pointer oid {oid} != manifest {hx}"))
        continue
    srcs = index.get(hx, [])
    if not srcs:
        missing.append((name, url, "no real bytes found in worktree"))
        continue
    shutil.copyfile(srcs[0], target)
    # verify
    if sha256_of(target) != hx:
        missing.append((name, url, "copy verification FAILED"))
        continue
    fixed += 1

print(f"already-real: {ok}, materialized: {fixed}, missing: {len(missing)}")
for name, url, reason in missing[:30]:
    print(f"  MISSING {name} {url}: {reason}")
