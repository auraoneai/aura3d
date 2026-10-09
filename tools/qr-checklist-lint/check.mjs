#!/usr/bin/env node
/**
 * tools/qr-checklist-lint/check.mjs — §4b (PRD-16 Track P).
 *
 * Every `- [x]` (ticked) row in the quality-rebuild docs must carry a
 * `run:<id>` or `capture:<id>` citation that resolves to a SUCCESSFUL remote
 * run on main. A tick without one is the over-claim pattern this track
 * removes.
 *
 *   node tools/qr-checklist-lint/check.mjs                 # diff scope (merge-base vs origin/main)
 *   node tools/qr-checklist-lint/check.mjs --all           # whole corpus (nightly/audit)
 *   node tools/qr-checklist-lint/check.mjs <file>...       # explicit files
 *   node tools/qr-checklist-lint/check.mjs --no-verify     # format only, no remote resolution
 *
 * Resolution: `run:<id>` -> gh api actions/runs/<id> must be
 * conclusion==success on head_branch==main. `capture:<id>` -> GitLab pipeline
 * <id> status==success (needs GITLAB_QR_API_TOKEN). An id that cannot be
 * resolved to green FAILS the lint — no tolerated states.
 */
import { execFileSync, execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
const args = process.argv.slice(2);
const all = args.includes("--all");
const noVerify = args.includes("--no-verify");
const explicit = args.filter((a) => !a.startsWith("--"));
const TICK = /^\s*[-*]\s+\[x\]/i;
const CITE = /\b(?:run|capture):(\d+)\b/g;

function run(cmd, argv) {
  try {
    return execFileSync(cmd, argv, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  } catch {
    return null;
  }
}

function filesInScope() {
  if (explicit.length) return explicit;
  if (all) {
    const out = run("git", ["ls-files", "docs/project/aura3d-quality-rebuild"]) ?? "";
    return out.split("\n").filter((f) => /\.md$/.test(f));
  }
  // Diff scope: docs touched on this branch vs merge-base with origin/main.
  const base = run("git", ["merge-base", "origin/main", "HEAD"]) ?? "origin/main";
  const out = run("git", ["diff", "--name-only", "--diff-filter=AM", `${base}...HEAD`]) ?? "";
  return out.split("\n").filter((f) => /docs\/project\/aura3d-quality-rebuild\/.*\.md$/.test(f));
}

function violationsFor(file) {
  const text = existsSync(file) ? readFileSync(file, "utf8") : "";
  const out = [];
  text.split("\n").forEach((line, i) => {
    if (!TICK.test(line)) return;
    const cites = [...line.matchAll(CITE)].map((m) => ({ kind: line.slice(m.index).startsWith("run:") ? "run" : "capture", id: m[1] }));
    if (cites.length === 0) out.push({ file, line: i + 1, text: line.trim().slice(0, 140), cites });
    else out.push({ file, line: i + 1, text: line.trim().slice(0, 140), cites });
  });
  return out;
}

function verifyRun(id) {
  const json = run("gh", ["api", `repos/auraoneai/aura3d/actions/runs/${id}`]);
  if (!json) return { ok: false, why: "gh api failed (missing GH_TOKEN or bad id)" };
  try {
    const r = JSON.parse(json);
    if (r.head_branch !== "main") return { ok: false, why: `head_branch=${r.head_branch} (must be main)` };
    if (r.conclusion !== "success") return { ok: false, why: `conclusion=${r.conclusion}` };
    return { ok: true };
  } catch {
    return { ok: false, why: "unparseable run response" };
  }
}

function verifyCapture(id) {
  const token = process.env.GITLAB_QR_API_TOKEN;
  if (!token) return { ok: false, why: "GITLAB_QR_API_TOKEN unset — cannot verify GitLab pipeline" };
  const json = run("curl", ["-fsS", "-H", `PRIVATE-TOKEN: ${token}`, `https://gitlab.com/api/v4/projects/87152020/pipelines/${id}`]);
  if (!json) return { ok: false, why: "pipeline not found" };
  try {
    const p = JSON.parse(json);
    return p.status === "success" ? { ok: true } : { ok: false, why: `status=${p.status}` };
  } catch {
    return { ok: false, why: "unparseable pipeline response" };
  }
}

const files = filesInScope();
const rows = files.flatMap(violationsFor);
let bad = 0;
const seen = new Map();
for (const row of rows) {
  if (row.cites.length === 0) {
    console.log(`FAIL ${row.file}:${row.line}  tick without run:/capture: — ${row.text}`);
    bad++;
    continue;
  }
  if (noVerify) continue;
  for (const c of row.cites) {
    const key = `${c.kind}:${c.id}`;
    if (!seen.has(key)) seen.set(key, c.kind === "run" ? verifyRun(c.id) : verifyCapture(c.id));
    const v = seen.get(key);
    if (!v.ok) {
      console.log(`FAIL ${row.file}:${row.line}  ${key} -> ${v.why}`);
      bad++;
    }
  }
}
console.log(`${rows.length} ticked row(s) in scope, ${bad} violation(s)${noVerify ? " (format-only)" : ""}.`);
process.exit(bad ? 1 : 0);
