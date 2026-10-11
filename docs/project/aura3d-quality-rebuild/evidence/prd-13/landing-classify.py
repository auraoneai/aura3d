#!/usr/bin/env python3
"""Hunk-level classification of stacked lane-13 PRs against a target ref.

For each PR, take its own diff (base...head) at default context, and for each hunk:
  present     - every significant '+' line exists in the target's copy of the file and every
                significant '-' line that is not re-added elsewhere in the head file is absent.
  relocated   - missing '+' lines all exist elsewhere in the target tree (git grep -F).
  superseded  - target history shows a later commit removed the '+' line (or re-added a '-' line);
                the newest such commit is cited.
  lost        - the '+' content never appeared on target for that path and is not elsewhere, or the
                '-' deletion was never applied and no target commit touched that line.
"""
import json, re, subprocess, sys

REPO = sys.argv[1]
TARGET = sys.argv[2]
PRS = json.loads(open(sys.argv[3]).read())  # [{number, base, head}]

def git(*a, check=True):
    r = subprocess.run(["git", "-C", REPO, *a], capture_output=True, text=True, errors="replace")
    if check and r.returncode not in (0, 1):
        raise RuntimeError(r.stderr)
    return r.stdout

def significant(line):
    s = line.strip()
    if len(s) < 6:
        return False
    if re.fullmatch(r"[\s\{\}\(\)\[\];,`|:\-#*>]+", s):
        return False
    return True

file_cache = {}
def target_file(path):
    if path not in file_cache:
        r = subprocess.run(["git", "-C", REPO, "show", f"{TARGET}:{path}"], capture_output=True, text=True, errors="replace")
        file_cache[path] = None if r.returncode else set(l.strip() for l in r.stdout.splitlines())
    return file_cache[path]

head_cache = {}
def head_file(head, path):
    k = (head, path)
    if k not in head_cache:
        r = subprocess.run(["git", "-C", REPO, "show", f"{head}:{path}"], capture_output=True, text=True, errors="replace")
        head_cache[k] = set() if r.returncode else set(l.strip() for l in r.stdout.splitlines())
    return head_cache[k]

def grep_elsewhere(s):
    r = subprocess.run(["git", "-C", REPO, "grep", "-F", "-l", "-e", s, TARGET, "--"], capture_output=True, text=True, errors="replace")
    return [l.split(":", 1)[1] for l in r.stdout.splitlines()][:3]

def pickaxe(s, path):
    out = git("log", TARGET, "--format=%h %cs %s", "-S", s, "--", path)
    return [l for l in out.splitlines() if l]

def parse(diff):
    files, cur, hunk = [], None, None
    for line in diff.splitlines():
        if line.startswith("diff --git "):
            m = re.match(r"diff --git a/(.*) b/(.*)$", line)
            cur = {"path": m.group(2), "old": m.group(1), "hunks": []}; files.append(cur); hunk = None
        elif cur is not None and line.startswith("--- "):
            cur["old"] = None if line[4:] == "/dev/null" else line[6:]
        elif cur is not None and line.startswith("+++ "):
            cur["path"] = cur["old"] if line[4:] == "/dev/null" else line[6:]
            cur["deleted"] = line[4:] == "/dev/null"
        elif line.startswith("@@"):
            hunk = {"header": line.split("@@")[1].strip(), "add": [], "rem": []}; cur["hunks"].append(hunk)
        elif hunk is not None and line.startswith("+"):
            hunk["add"].append(line[1:])
        elif hunk is not None and line.startswith("-"):
            hunk["rem"].append(line[1:])
        elif line.startswith("Binary files") and cur is not None:
            cur["binary"] = True
    return files

def classify(pr):
    base, head = pr["base"], pr["head"]
    mb = git("merge-base", base, head).strip()
    diff = git("diff", "--no-renames", f"{mb}", head)
    out = []
    for f in parse(diff):
        path = f["path"]
        tf = target_file(path)
        if f.get("binary"):
            r = subprocess.run(["git", "-C", REPO, "diff", "--quiet", head, TARGET, "--", path])
            cls = "present" if r.returncode == 0 else ("lost" if tf is None else "superseded")
            ev = "binary identical" if r.returncode == 0 else " | ".join(pickaxe_path(path)[:1])
            out.append({"path": path, "hunk": "binary", "class": cls, "evidence": ev}); continue
        for h in f["hunks"]:
            hf = head_file(head, path)
            adds = [l.strip() for l in h["add"] if significant(l)]
            rems = [l.strip() for l in h["rem"] if significant(l) and l.strip() not in hf]
            if f.get("deleted"):
                cls, ev = ("present", "file absent on target") if tf is None else ("lost?", "file still on target")
                if tf is not None:
                    pk = pickaxe(h["rem"][0], path) if h["rem"] else []
                    cls, ev = classify_missing([], [path], pk, path)
                out.append({"path": path, "hunk": h["header"], "class": cls, "evidence": ev}); break
            tset = tf or set()
            miss_add = [l for l in adds if l not in tset]
            miss_rem = [l for l in rems if l in tset]
            if not miss_add and not miss_rem:
                out.append({"path": path, "hunk": h["header"], "class": "present", "evidence": f"{len(adds)}+/{len(rems)}- lines match"}); continue
            reloc = [l for l in miss_add if grep_elsewhere(l)]
            if miss_add and len(reloc) == len(miss_add) and not miss_rem:
                where = grep_elsewhere(miss_add[0])
                pk = next((p[0] for p in (pickaxe(l, path) for l in miss_add[:4]) if p), None)
                last = pk or git("log", "-1", TARGET, "--format=%h %cs %s", "--", path).strip()
                out.append({"path": path, "hunk": h["header"], "class": "relocated", "evidence": last,
                            "where": ", ".join(where), "missing": len(miss_add)}); continue
            # supersession evidence: newest target commit changing occurrence count of a missing line
            cites, never = [], []
            for l in (miss_add[:4] + miss_rem[:2]):
                pk = pickaxe(l, path)
                (cites if pk else never).append((l, pk[0] if pk else None))
            if cites and not never:
                out.append({"path": path, "hunk": h["header"], "class": "superseded", "evidence": cites[0][1], "missing": len(miss_add) + len(miss_rem)})
            else:
                last = git("log", "-1", TARGET, "--format=%h %cs %s", "--", path).strip()
                out.append({"path": path, "hunk": h["header"], "class": "lost?", "evidence": f"line never on target path; last target touch: {last or 'file absent'}",
                            "sample": never[0][0][:120] if never else "", "missing": len(miss_add) + len(miss_rem),
                            "partial_cite": cites[0][1] if cites else None})
    return out

def pickaxe_path(path):
    return [git("log", "-1", TARGET, "--format=%h %cs %s", "--", path).strip()]

def classify_missing(adds, paths, pk, path):
    return ("superseded", pk[0]) if pk else ("lost?", "deleted by PR but target still has file; no target commit touched it")

res = {}
for pr in PRS:
    res[pr["number"]] = classify(pr)
json.dump(res, sys.stdout, indent=1)
