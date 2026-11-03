import { createHash } from "node:crypto";
import { lstatSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readPackagePayload } from "../../tools/native-runtime-audit/dependency-graph.js";
import { inspectMathArchive, type MathArchiveKind, type MathArchiveReport } from "../../tools/native-math-archive-audit/index.js";
import { loadValidatedReleasePlan, type ExactReleasePlan } from "../../tools/release/exact-release-plan.mjs";

// Source-phase integration only: the plan must already identify built, packed
// candidate archives. This test never builds, installs or launches a browser.
let plan: ExactReleasePlan;
let sourceDigests: Record<string, string>;
const reports: { archive: string; sha256: string; report: MathArchiveReport }[] = [];

function stagedMathDigests(): Record<string, string> {
  const root = process.cwd(), result: Record<string, string> = {};
  const visit = (path: string) => {
    const stat = lstatSync(path);
    if (stat.isSymbolicLink()) throw new Error(`Math source contains a symlink: ${path}`);
    if (stat.isDirectory()) {
      for (const name of readdirSync(path).sort()) visit(join(path, name));
    } else if (stat.isFile() && /\.tsx?$/.test(path)) {
      result[relative(root, path).replaceAll("\\", "/")] = createHash("sha256").update(readFileSync(path)).digest("hex");
    }
  };
  visit(resolve(root, "packages/math/src"));
  return result;
}

describe("exact candidate math archive retirement", () => {
  beforeAll(() => {
    const candidate = loadValidatedReleasePlan();
    if (!candidate) throw new Error("A3D_RELEASE_PLAN is required for the exact math archive audit");
    plan = candidate;
    sourceDigests = stagedMathDigests();
  });

  afterAll(() => {
    const reportDir = process.env.NATIVE_REPORT_DIR;
    if (!reportDir || !plan) return;
    if (!/^tests\/reports\/native-capabilities\/[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(reportDir)) throw new Error("Invalid source report directory");
    mkdirSync(reportDir, { recursive: true });
    writeFileSync(join(reportDir, "native-math-archive-audit.json"), `${JSON.stringify({
      schema: "aura3d.native-math-archive-audit/1", phase: "source", independence: "not-established",
      candidatePlan: plan.reference, source: plan.source, archives: reports
    }, null, 2)}\n`);
  });

  it.each([
    ["engine", "@aura3d/engine"],
    ["math", "@aura3d/math"]
  ] as const)("inspects the identified replacements in the exact %s archive", (kind: MathArchiveKind, name: string) => {
    const matches = plan.packages.filter((entry) => entry.name === name);
    expect(matches).toHaveLength(1);
    const archive = matches[0]!;
    const report = inspectMathArchive({ kind, entries: readPackagePayload(resolve(archive.tarball)), sourceDigests });
    reports.push({ archive: archive.tarball, sha256: archive.sha256, report });
    expect(report.packageName).toBe(name);
    expect(report.independence).toBe("not-established");
    expect(report.files.length).toBeGreaterThan(0);
    expect(report.issues).toEqual([]);
  });
});
