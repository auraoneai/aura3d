import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runBrowserAudit, summarizeSourceEvidence } from "../../../tools/native-runtime-audit/index";
import { inspectSourceEntries } from "../../../tools/native-runtime-audit/source-evidence";
import type { DependencyGraphReport } from "../../../tools/native-runtime-audit/dependency-graph";
import type { AcceptanceGate, CandidateIdentity } from "../../../tools/performance/native-benchmark";

const gate: AcceptanceGate & { matrixSourceReport: { path: string; sha256: string } } = { runId: "source-1", sourceInputDigest: "a".repeat(64), lockfileSha256: "b".repeat(64),
  matrixSourceReport: { path: "matrix-source.json", sha256: "e".repeat(64) },
  candidatePlan: { sha256: "c".repeat(64) }, archives: [{ path: "artifacts/engine.tgz", sha256: "d".repeat(64) }] };
const candidate: CandidateIdentity = { sourceSha256: gate.sourceInputDigest, sourceRunId: gate.runId,
  lockfileSha256: gate.lockfileSha256, candidatePlanSha256: gate.candidatePlan.sha256, archives: gate.archives };
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

function graph(): DependencyGraphReport {
  return { files: [], manifests: [], lockPackages: [], lockSnapshots: [], npmLockPackages: [], installProfiles: [],
    payloadEntries: [], edges: [], findings: [], limitations: [] };
}
function directory(): string { const root = mkdtempSync(join(tmpdir(), "aura-native-audit-")); roots.push(root); return root; }
function writeObservation(root: string, overrides: Record<string, unknown> = {}): string {
  const path = join(root, "network.json");
  writeFileSync(path, JSON.stringify({ schema: "aura3d.native-runtime-network/1", runId: "acceptance-1", candidate,
    tests: [{ id: "native-offline-independence", status: "passed", offline: true, negativeControlBlocked: true,
      negativeControlEvent: { url: "https://aura3d-offline-probe.invalid/control", resourceType: "fetch", method: "GET", failure: "failed" },
      projectSha256: "e".repeat(64), fixtureSha256: "f".repeat(64), bundleSha256: "9".repeat(64),
      browserName: "chromium", browserVersion: "123", browserProject: "chromium-automation", backend: "webgl2" }], events: [], ...overrides }));
  return path;
}
const options = (root: string, networkReport: string) => ({ root, gatePath: "gate.json", sourceReport: "matrix-source.json", networkReport, runId: "acceptance-1" });

describe("native runtime audit orchestration", () => {
  it("marks unresolved fingerprint leads and unlocked profiles for review rather than asserting authorship", () => {
    const source = inspectSourceEntries([{ path: "runtime.js", bytes: Buffer.from('const note = "three";') }]);
    const result = summarizeSourceEvidence(graph(), source);
    expect(result.status).toBe("review-required");
    expect(result.unresolvedReviewCandidates).toBeGreaterThan(0);
    expect(source.limitations.join(" ")).toContain("neither a match nor its absence proves authorship");
    const clean = inspectSourceEntries([{ path: "runtime.js", bytes: Buffer.from("export const answer = 42;") }]);
    expect(summarizeSourceEvidence(graph(), clean).status).toBe("scan-complete");
    const unlocked = { ...graph(), installProfiles: [{ path: "template", lockfile: null, lockVersion: null }] };
    expect(summarizeSourceEvidence(unlocked, clean)).toMatchObject({ status: "review-required", unlockedProfiles: ["template"] });
    const projection = { path: "template", resolution: "workspace-lock-projection" as const, directFields: [], nodes: [], edgeCount: 0, unresolved: [], prohibited: [] };
    expect(summarizeSourceEvidence({ ...unlocked, projectedProfiles: [{ ...projection, complete: true }] }, clean))
      .toMatchObject({ status: "scan-complete", unlockedProfiles: ["template"], unprojectedProfiles: [] });
    expect(summarizeSourceEvidence({ ...unlocked, projectedProfiles: [{ ...projection, complete: false, unresolved: [{ owner: "template", name: "x", specifier: "1" }] }] }, clean))
      .toMatchObject({ status: "review-required", unprojectedProfiles: ["template"] });
  });

  it("validates the gate and source report before opening runtime observations", async () => {
    let selected = "";
    await expect(runBrowserAudit(options("/missing", "network.json"), ({ sourceReport }) => {
      selected = sourceReport;
      throw new Error("invalid gate");
    })).rejects.toThrow("invalid gate");
    expect(selected).toBe("matrix-source.json");
  });

  it("accepts a complete offline result only for the exact frozen candidate", async () => {
    const root = directory(), path = writeObservation(root);
    const result = await runBrowserAudit(options(root, path), () => gate);
    expect(result).toMatchObject({ phase: "browser", status: "passed", runId: "acceptance-1" });
    expect(result.limitations.join(" ")).toContain("not all code paths");
    writeObservation(root, { candidate: { ...candidate, sourceSha256: "f".repeat(64) } });
    await expect(runBrowserAudit(options(root, path), () => gate)).rejects.toThrow(/candidate identity/);
  });

  it("rejects missing, duplicated, or uncontrolled offline test results", async () => {
    const root = directory();
    const cases = [
      { tests: [] },
      { tests: [{ id: "native-offline-independence", status: "passed" }, { id: "native-offline-independence", status: "passed" }] },
      { tests: [{ id: "native-offline-independence", status: "passed", offline: true, negativeControlBlocked: false }] }
    ];
    for (const testCase of cases) {
      const path = writeObservation(root, testCase);
      await expect(runBrowserAudit(options(root, path), () => gate)).rejects.toThrow(/inventory|control/);
    }
  });

  it("requires the recorded failed control request before accepting an offline observation", async () => {
    const root = directory();
    const valid = { id: "native-offline-independence", status: "passed", offline: true, negativeControlBlocked: true,
      projectSha256: "e".repeat(64), fixtureSha256: "f".repeat(64), bundleSha256: "9".repeat(64),
      browserName: "chromium", browserVersion: "123", browserProject: "chromium-automation", backend: "webgl2" };
    for (const negativeControlEvent of [undefined,
      { url: "https://aura3d-offline-probe.invalid/control", resourceType: "fetch", method: "GET" },
      { url: "https://elsewhere.invalid/control", resourceType: "fetch", method: "GET", failure: "failed" },
      { url: "https://aura3d-offline-probe.invalid/control", resourceType: "script", method: "GET", failure: "failed" }]) {
      const path = writeObservation(root, { tests: [{ ...valid, negativeControlEvent }] });
      await expect(runBrowserAudit(options(root, path), () => gate)).rejects.toThrow(/negative control request/);
    }
  });

  it("fails even otherwise permitted fixture requests because the offline fixture requires none", async () => {
    const root = directory();
    const path = writeObservation(root, { events: [{ url: "data:text/javascript;base64,YQ==", resourceType: "script" }] });
    const result = await runBrowserAudit(options(root, path), () => gate);
    expect(result.network.unexpected).toEqual([]);
    expect(result.status).toBe("failed");
  });

  it("fails denied external requests and redacts sensitive URL components", async () => {
    const root = directory();
    const path = writeObservation(root, { events: [{ url: "https://user:password@example.com/runtime.js?token=secret#x", resourceType: "script", failure: "blocked" }] });
    const result = await runBrowserAudit(options(root, path), () => gate);
    expect(result.status).toBe("failed");
    expect(result.network.events[0]!.url).toBe("https://example.com/runtime.js");
    expect(JSON.stringify(result)).not.toContain("password");
    expect(JSON.stringify(result)).not.toContain("secret");
  });
});
