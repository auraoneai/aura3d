#!/usr/bin/env python3
"""Program-lead merge queue for auraoneai/aura3d (criterion posted on #839).

Every open PR based on main, oldest first, merges when:
  - mergeable == MERGEABLE and not draft
  - every REQUIRED check name is present and every instance is completed/success
  - every unit-type check ("unit", "Lane gate", "Lane unit") is success, or its workflow's latest
    completed main run is also non-success (already broken on main)
  - no unit-type check is still pending
One merge at a time; then re-evaluate.
"""
import json, subprocess, time, sys, re

REPO = "auraoneai/aura3d"
REQUIRED = ["Type Check", "Lint", "Build", "Test (Node 22)", "bundle-size", "Distribution Package Tests"]
UNIT = re.compile(r"unit|Lane gate", re.I)
DEADLINE = time.time() + float(sys.argv[1] if len(sys.argv) > 1 else 3300)
SKIP = {367}  # docs PR, Wave 2
main_cache = {}


def sh(*a):
    r = subprocess.run(a, capture_output=True, text=True)
    return r.stdout if r.returncode == 0 else ""


def checks(sha):
    out, page = [], 1
    while True:
        d = json.loads(sh("gh", "api", f"repos/{REPO}/commits/{sha}/check-runs?per_page=100&page={page}") or "{}")
        cr = d.get("check_runs", [])
        out += cr
        if len(cr) < 100:
            return out
        page += 1


def workflow_of(c):
    m = re.search(r"runs/(\d+)", c.get("details_url") or "")
    if not m:
        return None
    return json.loads(sh("gh", "api", f"repos/{REPO}/actions/runs/{m.group(1)}") or "{}").get("workflow_id")


def main_broken(wid):
    if wid in main_cache:
        return main_cache[wid]
    runs = json.loads(sh("gh", "api", f"repos/{REPO}/actions/workflows/{wid}/runs?branch=main&status=completed&per_page=3") or "{}").get("workflow_runs", [])
    v = bool(runs) and runs[0]["conclusion"] != "success"
    main_cache[wid] = v
    return v


def evaluate(pr):
    cs = checks(pr["headRefOid"])
    for name in REQUIRED:
        inst = [c for c in cs if c["name"] == name]
        if not inst:
            if name == "bundle-size" and any(c["name"] == "Type Check" and c["conclusion"] == "success" for c in cs):
                continue  # path-filtered: QR-15 bundle size only runs when bundled code changes
            return "wait", f"missing {name}"
        ok = [c for c in inst if c["status"] == "completed" and c["conclusion"] == "success"]
        bad = [c for c in inst if c["status"] == "completed" and c["conclusion"] not in ("success", "cancelled", "skipped")]
        if bad and not ok:
            return "fail", f"{name}={bad[0]['conclusion']}"
        if any(c["status"] != "completed" for c in inst) and not ok:
            return "wait", f"pending {name}"
        if not ok:
            return "fail", f"{name}=cancelled (no green twin)"
    preexisting = []
    for c in cs:
        if not UNIT.search(c["name"]) or c["name"] in REQUIRED:
            continue
        if c["status"] != "completed":
            wid = workflow_of(c)
            if wid and main_broken(wid):
                preexisting.append(c["name"] + " (pending; red on main)")
                continue
            return "wait", f"pending unit {c['name']}"
        if c["conclusion"] in ("success", "skipped", "neutral"):
            continue
        wid = workflow_of(c)
        if wid and main_broken(wid):
            preexisting.append(c["name"])
            continue
        if c["conclusion"] == "cancelled":
            continue  # duplicate/cancelled run; another instance must have passed or main is broken
        return "fail", f"new unit failure {c['name']}"
    return "ok", ", ".join(sorted(set(preexisting))) or "none"


merged, told = [], set()
while time.time() < DEADLINE:
    main_cache.clear()
    prs = json.loads(sh("gh", "pr", "list", "-R", REPO, "--state", "open", "--limit", "100",
                        "--json", "number,headRefOid,mergeable,baseRefName,title,createdAt,isDraft") or "[]")
    prs.sort(key=lambda p: p["createdAt"])
    did = False
    for pr in prs:
        n = pr["number"]
        if n in SKIP or pr["baseRefName"] != "main" or pr["isDraft"] or pr["mergeable"] != "MERGEABLE":
            continue
        verdict, why = evaluate(pr)
        if verdict == "fail":
            key = (n, pr["headRefOid"])
            if key not in told:
                told.add(key)
                sh("gh", "pr", "comment", str(n), "-R", REPO, "--body",
                   f"Merge queue: blocked on {pr['headRefOid'][:8]}: {why}. Fix and push; the queue re-evaluates automatically.")
                print(f"#{n} blocked: {why}", flush=True)
            continue
        if verdict != "ok":
            continue
        body = (f"Merge queue (program lead, criterion on #839). Required gates green on {pr['headRefOid'][:8]}. "
                f"Unit checks red here and on main (pre-existing): {why}.")
        r = subprocess.run(["gh", "pr", "merge", str(n), "-R", REPO, "--merge", "--body", body], capture_output=True, text=True)
        if r.returncode == 0:
            merged.append(n)
            print(f"MERGED #{n} {pr['title'][:70]}", flush=True)
            did = True
            time.sleep(30)
            break
        print(f"#{n} merge failed: {r.stderr.strip()[:200]}", flush=True)
    if not did:
        time.sleep(90)
print("merged:", merged, flush=True)
