import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const subprocesses = vi.hoisted(() => ({
  spawnSync: vi.fn(() => { throw new Error("unexpected matrix subprocess"); })
}));
vi.mock("node:child_process", async importOriginal => ({
  ...(await importOriginal<typeof import("node:child_process")>()),
  spawnSync: subprocesses.spawnSync
}));

import {
  matrixCells, projectManifest, restoreMatrixProject, restoreReactConsumers, runBrowser, runSource,
  validateMatrixCandidateReviews, type MatrixCandidateReview, type MatrixReport
} from "../../../tools/native-consumer-matrix/index";
import * as admissions from "../../../tools/release/archive-admission.mjs";
import * as npmGraph from "../../../tools/release/portable-npm-lock.mjs";
import * as pnpmGraph from "../../../tools/release/portable-pnpm-lock.mjs";

const roots: string[] = [];
function temporaryRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "matrix-admission-test-"));
  roots.push(root);
  return root;
}
const sha = (bytes: string | Buffer): string => createHash("sha256").update(bytes).digest("hex");
function write(root: string, path: string, bytes: string | Buffer): void {
  const file = join(root, path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, bytes);
}
function reviewFixture(root: string, runId: string, contents: string[]): MatrixCandidateReview[] {
  const base = `tests/reports/native-source-inputs/${runId}`;
  const refs = contents.map(value => {
    const digest = sha(value), path = `${base}/candidate-reviews/${digest}.json`;
    write(root, path, value);
    return { path, sha256: digest };
  }).sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  write(root, `${base}/inputs.json`, JSON.stringify({ schema: "aura3d.native-portable-inputs/1", runId, candidateReviews: refs }));
  return refs;
}
beforeEach(() => {
  subprocesses.spawnSync.mockClear();
  vi.stubEnv("NATIVE_MATRIX_BUNDLE_INPUT", "");
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("matrix dependency admission", () => {
  it("binds the exact ordered review references to retained run-scoped bytes", () => {
    const root = temporaryRoot(), run = "reviews";
    const refs = reviewFixture(root, run, ['{"synthetic":1}', '{"synthetic":2}']);
    expect(validateMatrixCandidateReviews(root, run, refs)).toEqual(refs);
    expect(() => validateMatrixCandidateReviews(root, run, [...refs].reverse())).toThrow(/unsorted/);
    expect(() => validateMatrixCandidateReviews(root, run, [refs[0], refs[0]])).toThrow(/duplicate/);
    expect(() => validateMatrixCandidateReviews(root, "other-run", refs)).toThrow(/out-of-run/);
    expect(() => validateMatrixCandidateReviews(root, run, refs.slice(0, 1))).toThrow(/envelope/);
    write(root, refs[0].path, '{"tampered":true}');
    expect(() => validateMatrixCandidateReviews(root, run, refs)).toThrow(/review changed/);
  });

  it("accepts an empty review list only when the retained envelope has the same list", () => {
    const root = temporaryRoot(), run = "no-reviews";
    reviewFixture(root, run, []);
    expect(validateMatrixCandidateReviews(root, run, [])).toEqual([]);
    expect(() => validateMatrixCandidateReviews(root, run, null)).toThrow(/inventory/);
  });

  it("forwards the identical retained refs to npm and pnpm admission before any subprocess", async () => {
    const root = temporaryRoot(), run = "forward-reviews";
    const sourceManifestPath = `tests/reports/native-capabilities/${run}/source-manifest.json`;
    const sourceManifest = '{"synthetic":"source"}\n', sourceLock = "source lock\n";
    write(root, "staged-manifest.json", sourceManifest);
    write(root, sourceManifestPath, sourceManifest);
    write(root, "pnpm-lock.yaml", sourceLock);
    const packages = ["@aura3d/engine", "@aura3d/react", "@aura3d/assets", "@aura3d/navigation-recast"].map((name, index) => {
      const bytes = Buffer.from("candidate " + index), tarball = `archives/${index}.tgz`;
      write(root, tarball, bytes);
      return { name, version: "1.0.0", tarball, sha256: sha(bytes), integrity: "sha512-" + createHash("sha512").update(bytes).digest("base64") };
    });
    const plan = { schema: "aura3d-release-plan/1.0", version: "1.0.0",
      source: { commit: "synthetic", fingerprint: "a".repeat(64), lockfileSha256: sha(sourceLock) }, packages };
    const planBytes = JSON.stringify(plan);
    write(root, "candidate.json", planBytes);
    const reviews = reviewFixture(root, run, ['{"synthetic":"review-reference"}']);
    const prefix = `tests/reports/native-source-inputs/${run}/matrix/`;
    const archiveBytes = Buffer.from("candidate 0"), archiveSha = sha(archiveBytes);
    const archivePath = `${prefix}archives/${archiveSha}.tgz`;
    write(root, archivePath, archiveBytes);
    const archive = { resolved: "file:./tarballs/0.tgz", path: archivePath, size: archiveBytes.length, sha256: archiveSha,
      integrity: "sha512-" + createHash("sha512").update(archiveBytes).digest("base64") };
    const cells = matrixCells().map(cell => {
      const directory = `${prefix}cells/${cell.id}/`;
      const manifestBytes = JSON.stringify(projectManifest(root, cell, plan));
      const lockBytes = cell.manager === "npm" ? '{"packages":{}}' : "lockfileVersion: '9.0'\n";
      const manifestPath = `${directory}package.json`;
      const lockPath = directory + (cell.manager === "npm" ? "package-lock.json" : "pnpm-lock.yaml");
      write(root, manifestPath, manifestBytes); write(root, lockPath, lockBytes);
      return { id: cell.id, manager: cell.manager,
        manifest: { path: manifestPath, size: Buffer.byteLength(manifestBytes), sha256: sha(manifestBytes) },
        lockfile: { path: lockPath, size: Buffer.byteLength(lockBytes), sha256: sha(lockBytes) }, archives: [archive] };
    });
    const bundlePath = `${prefix}bundle.json`;
    const bundle = JSON.stringify({ schema: "aura3d.native-matrix-input/1", candidatePlanSha256: sha(planBytes),
      sourceManifest: { path: sourceManifestPath, sha256: sha(sourceManifest) }, cells });
    write(root, bundlePath, bundle);
    write(root, `tests/reports/native-source-inputs/${run}/inputs.json`, JSON.stringify({
      schema: "aura3d.native-portable-inputs/1", runId: run,
      sourceManifest: { path: sourceManifestPath, sha256: sha(sourceManifest) },
      candidatePlan: { path: "candidate.json", sha256: sha(planBytes) },
      matrixBundle: { path: bundlePath, sha256: sha(bundle) }, candidateReviews: reviews
    }));
    vi.stubEnv("NATIVE_MATRIX_BUNDLE_INPUT", bundlePath);
    vi.stubEnv("AURA3D_SOURCE_MANIFEST", "staged-manifest.json");
    vi.stubEnv("AURA3D_CANDIDATE_REVIEWS_JSON", JSON.stringify(reviews));
    const npmAdmission = vi.spyOn(admissions, "verifyArchiveAdmission").mockReturnValue({ capability: {} as never, receipt: {} as never });
    const pnpmAdmission = vi.spyOn(admissions, "verifyPnpmArchiveAdmission").mockReturnValue({ capability: {} as never, receipt: {} as never });
    vi.spyOn(npmGraph, "assertIndependentNpmConsumer").mockReturnValue({ inputPaths: [] });
    vi.spyOn(pnpmGraph, "assertIndependentPnpmConsumer").mockReturnValue({ inputPaths: [] });
    // The admission functions above are orchestration stubs, not a trust policy.
    vi.spyOn(npmGraph, "inspectNpmArchive").mockReturnValue({ manifest: { name: "synthetic" }, files: [] });

    await expect(runSource(root, run, "candidate.json")).rejects.toThrow(/MATRIX_PNPM_STORE_UNAVAILABLE/);
    expect(npmAdmission).toHaveBeenCalledTimes(4);
    expect(pnpmAdmission).toHaveBeenCalledTimes(4);
    for (const [input] of [...npmAdmission.mock.calls, ...pnpmAdmission.mock.calls]) expect(input.candidateReviews).toEqual(reviews);
    expect(subprocesses.spawnSync).not.toHaveBeenCalled();
    npmAdmission.mockClear(); pnpmAdmission.mockClear();
    vi.stubEnv("AURA3D_CANDIDATE_REVIEWS_JSON", "[]");
    await expect(runSource(root, run, "candidate.json")).rejects.toThrow(/retained input envelope/);
    expect(npmAdmission).not.toHaveBeenCalled();
    expect(pnpmAdmission).not.toHaveBeenCalled();
    expect(subprocesses.spawnSync).not.toHaveBeenCalled();
  });

  it("refuses source production before resolving a candidate or starting a subprocess", async () => {
    const root = temporaryRoot();
    await expect(runSource(root, "source-test", "missing-candidate.json")).rejects.toThrow(/MATRIX_ADMISSION_UNAVAILABLE/);
    expect(subprocesses.spawnSync).not.toHaveBeenCalled();
    expect(existsSync(join(root, "tests/reports"))).toBe(false);
  });

  it("rejects an incomplete caller-supplied bundle before any subprocess", async () => {
    const root = temporaryRoot(), run = "incomplete";
    const manifest = '{"source":"synthetic"}\n', sourceLock = "synthetic lock\n";
    const manifestPath = `tests/reports/native-capabilities/${run}/source-manifest.json`;
    write(root, "staged-manifest.json", manifest);
    write(root, manifestPath, manifest);
    write(root, "pnpm-lock.yaml", sourceLock);
    const packages = ["@aura3d/engine", "@aura3d/react", "@aura3d/assets", "@aura3d/navigation-recast"].map((name, index) => {
      const bytes = Buffer.from("synthetic archive " + index), tarball = `archives/${index}.tgz`;
      write(root, tarball, bytes);
      return { name, version: "1.0.0", tarball, sha256: sha(bytes), integrity: "sha512-" + createHash("sha512").update(bytes).digest("base64") };
    });
    const plan = JSON.stringify({ schema: "aura3d-release-plan/1.0", version: "1.0.0",
      source: { commit: "synthetic", fingerprint: "a".repeat(64), lockfileSha256: sha(sourceLock) }, packages });
    write(root, "candidate.json", plan);
    const bundlePath = `tests/reports/native-source-inputs/${run}/matrix/bundle.json`;
    write(root, bundlePath, JSON.stringify({ schema: "aura3d.native-matrix-input/1", candidatePlanSha256: sha(plan),
      sourceManifest: { path: manifestPath, sha256: sha(manifest) }, cells: [] }));
    vi.stubEnv("NATIVE_MATRIX_BUNDLE_INPUT", bundlePath);
    vi.stubEnv("AURA3D_SOURCE_MANIFEST", "staged-manifest.json");
    await expect(runSource(root, run, "candidate.json")).rejects.toThrow(/complete candidate and cell inventory/);
    expect(subprocesses.spawnSync).not.toHaveBeenCalled();
    expect(existsSync(join(root, "tests/reports/native-consumer-matrix", run))).toBe(false);
  });

  it("refuses every npm and pnpm restore before reading a report or creating a project", async () => {
    const root = temporaryRoot();
    const report = {} as MatrixReport;
    for (const cell of matrixCells()) {
      const destination = join(root, cell.id);
      await expect(restoreMatrixProject(root, report, cell.id, destination)).rejects.toThrow(/MATRIX_ADMISSION_UNAVAILABLE/);
      expect(existsSync(destination)).toBe(false);
    }
    expect(subprocesses.spawnSync).not.toHaveBeenCalled();
  });

  it("refuses the React and browser entrypoints before gate or browser provisioning", async () => {
    const root = temporaryRoot();
    const destination = join(root, "react");
    await expect(restoreReactConsumers(root, "missing-source.json", "missing-gate.json", destination))
      .rejects.toThrow(/MATRIX_ADMISSION_UNAVAILABLE/);
    await expect(runBrowser(root, "browser-test", "missing-source.json", "missing-gate.json"))
      .rejects.toThrow(/MATRIX_ADMISSION_UNAVAILABLE/);
    expect(existsSync(destination)).toBe(false);
    expect(existsSync(join(root, "tests/reports"))).toBe(false);
    expect(subprocesses.spawnSync).not.toHaveBeenCalled();
  });
});
