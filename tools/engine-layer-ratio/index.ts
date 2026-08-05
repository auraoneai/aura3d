/**
 * §B.4 — the engine-layer fix ratio, enforcing R3 mechanically.
 *
 * R3 says fix at the lowest correct layer (`packages/`), never in `apps/*\/src/main.ts`. Without a
 * measurement the pull toward patching examples is irresistible — it is what produced the situation
 * this PRD exists to reverse. A route-local patch makes the screenshot correct and leaves every other
 * consumer of the same defect broken, and it is always the faster option in the moment.
 *
 * Release condition: **>= 90% of changed source lines live under `packages/`**.
 *
 * Excluded from the denominator, with the justification recorded in the report rather than assumed:
 * route deletions (Tier 4), tier reclassification, and generated asset maps. Those are legitimate
 * `apps/` churn that says nothing about where defects were fixed.
 */
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { writeReport, type ReleaseCheck } from "../check-common";

const repoRoot = resolve(import.meta.dirname, "..", "..");
const REPORT_PATH = "tests/reports/engine-layer-ratio.json";
const THRESHOLD = 0.9;
const BASE_REF = process.env.A3D_ENGINE_LAYER_BASE ?? "v1.5.2";

interface FileChange {
  readonly path: string;
  readonly added: number;
  readonly deleted: number;
  readonly changed: number;
}

/** Source only. Reports, snapshots, lockfiles and docs are not "where a defect was fixed". */
function isSource(path: string): boolean {
  if (!/\.(ts|tsx|js|jsx|mjs|cjs|glsl|wgsl)$/.test(path)) return false;
  if (path.includes("/dist/") || path.includes("/node_modules/")) return false;
  if (path.startsWith("tests/reports/") || path.startsWith("release-artifacts/")) return false;
  return true;
}

/**
 * Generated files, excluded with a recorded reason.
 *
 * `src/aura-assets.ts` and each route's `generated/` output are written by the CLI. Counting them as
 * hand-authored route fixes would let a large regeneration mask a genuine route patch, or vice versa.
 */
function isGenerated(path: string): boolean {
  return path.endsWith("src/aura-assets.ts") || path.includes("/generated/") || path.endsWith("aura.assets.json");
}

function numstat(): readonly FileChange[] {
  const output = execFileSync("git", ["diff", "--numstat", `${BASE_REF}..HEAD`], { cwd: repoRoot, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const changes: FileChange[] = [];
  for (const line of output.split("\n")) {
    const parts = line.split("\t");
    if (parts.length < 3) continue;
    const [addedRaw, deletedRaw, path] = parts as [string, string, string];
    // Binary files report "-".
    const added = addedRaw === "-" ? 0 : Number(addedRaw);
    const deleted = deletedRaw === "-" ? 0 : Number(deletedRaw);
    changes.push({ path, added, deleted, changed: added + deleted });
  }
  return changes;
}

/** Was this file deleted outright? A Tier 4 route removal is excluded from the denominator. */
function deletedPaths(): ReadonlySet<string> {
  const output = execFileSync("git", ["diff", "--diff-filter=D", "--name-only", `${BASE_REF}..HEAD`], { cwd: repoRoot, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  return new Set(output.split("\n").filter(Boolean));
}

function main(): void {
  const changes = numstat().filter((change) => isSource(change.path));
  const deleted = deletedPaths();
  const excluded: { readonly path: string; readonly changed: number; readonly reason: string }[] = [];
  let packageLines = 0;
  let routeLines = 0;
  let otherLines = 0;
  const routeFiles: FileChange[] = [];

  for (const change of changes) {
    const isRoute = change.path.startsWith("apps/") || change.path.startsWith("examples/");
    if (isGenerated(change.path)) {
      excluded.push({ path: change.path, changed: change.changed, reason: "generated asset map or generated route output — written by the CLI, not a hand-authored fix" });
      continue;
    }
    if (isRoute && deleted.has(change.path)) {
      excluded.push({ path: change.path, changed: change.changed, reason: "route deleted outright (Tier 4 removal), which says nothing about where a defect was fixed" });
      continue;
    }
    if (change.path.startsWith("packages/")) packageLines += change.changed;
    else if (isRoute) {
      routeLines += change.changed;
      routeFiles.push(change);
    } else otherLines += change.changed;
  }

  const denominator = packageLines + routeLines;
  const ratio = denominator === 0 ? 1 : packageLines / denominator;
  const checks: ReleaseCheck[] = [{
    id: "engine-layer-ratio",
    pass: ratio >= THRESHOLD,
    detail: `${(ratio * 100).toFixed(2)}% of changed source lines are under packages/ (${packageLines} package vs ${routeLines} route, threshold ${THRESHOLD * 100}%)`
  }];

  writeReport(REPORT_PATH, "a3d-engine-layer-ratio", checks, {
    rule: "§B.4 / R3 — fix at the lowest correct layer. >= 90% of changed source lines must live under packages/. A route-only fix for a defect reproducible in two routes is a failure of this gate regardless of the ratio; that judgement is human and is recorded in the PRD, not automated here.",
    baseRef: BASE_REF,
    threshold: THRESHOLD,
    ratio: Number(ratio.toFixed(4)),
    packageChangedLines: packageLines,
    routeChangedLines: routeLines,
    otherChangedLines: otherLines,
    excludedFromDenominator: excluded,
    /** The largest route-side changes, so a reviewer can judge whether any is a symptom patch. */
    largestRouteChanges: [...routeFiles].sort((a, b) => b.changed - a.changed).slice(0, 20)
  });
  for (const check of checks) console.log(`${check.pass ? "ok  " : "FAIL"} ${check.detail}`);
  console.log(`report: ${REPORT_PATH}`);
}

main();
