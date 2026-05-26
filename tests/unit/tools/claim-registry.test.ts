import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { validateClaimRegistry, writeClaimRegistryReport } from "../../../tools/claim-registry/index.js";

function fixtureRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "a3d-claims-"));
  mkdirSync(join(root, "docs", "v2"), { recursive: true });
  writeFileSync(join(root, "docs", "v2", "claim-registry.md"), registry());
  return root;
}

function registry(evidence = "Existing package surface and internal tests."): string {
  return `# Claim Registry

## Allowed Today

| Claim | Gate | Evidence required | Required wording constraints |
|---|---|---|---|
| Aura3D is an experimental TypeScript web 3D engine prototype. | None | ${evidence} | Must include prototype or experimental language. |

## Blocked Until Gates Pass

| Claim | Required gate | Additional evidence |
|---|---|---|
| Aura3D is better than Three.js. | Gate C | Narrow niche and raw benchmark data. |
| Aura3D is Unity/Unreal for the web. | Gate D | Browser editor proof. |
| Aura3D is production-ready. | Gate E | Release history. |
| Aura3D has production PBR parity. | Gate C | Reference renderer comparison. |
| Aura3D has full WebGPU support. | Gate C | Real hardware matrix. |
`;
}

describe("claim registry verifier", () => {
  it("allows scoped known-limits language while scanning public docs", () => {
    const root = fixtureRoot();
    mkdirSync(join(root, "docs"), { recursive: true });
    writeFileSync(join(root, "docs", "known-limits.md"), "No better than Three.js or production-ready claim is currently supported.\n");

    const report = validateClaimRegistry(root);

    expect(report.ok).toBe(true);
    expect(report.allowedOccurrences).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "docs/project/known-limits.md", claim: "Aura3D is better than Three.js.", scoped: true }),
      expect.objectContaining({ path: "docs/project/known-limits.md", claim: "Aura3D is production-ready.", scoped: true })
    ]));
  });

  it("blocks unregistered stronger claims in example READMEs and package descriptions", () => {
    const root = fixtureRoot();
    mkdirSync(join(root, "examples", "bad-demo"), { recursive: true });
    writeFileSync(join(root, "examples", "bad-demo", "README.md"), "Aura3D is better than Three.js.\n");
    writeFileSync(join(root, "package.json"), JSON.stringify({
      name: "@aura3d/test",
      description: "A production-ready web engine"
    }));

    const report = validateClaimRegistry(root);

    expect(report.ok).toBe(false);
    expect(report.violations).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "blocked-claim", path: "examples/bad-demo/README.md", claim: "Aura3D is better than Three.js." }),
      expect.objectContaining({ kind: "blocked-claim", path: "package.json", claim: "Aura3D is production-ready." })
    ]));
  });

  it("does not scan release-artifacts as top-level release claim documents", () => {
    const root = fixtureRoot();
    mkdirSync(join(root, "release-artifacts", "external-parity-external-evidence-handoff", "docs", "project"), { recursive: true });
    writeFileSync(join(root, "release-artifacts", "external-parity-external-evidence-handoff", "docs/project/v4-parity-execution-prompt.md"), "Unity/Unreal replacement remains blocked.\n");
    writeFileSync(join(root, "release-artifacts", "codingrelated-completion-audit.md"), "Full WebGPU support is not achieved.\n");
    writeFileSync(join(root, "RELEASE-NOTES.md"), "No production-ready claim is currently supported.\n");

    const report = validateClaimRegistry(root);

    expect(report.ok).toBe(true);
    expect(report.scannedFiles).toContain("RELEASE-NOTES.md");
    expect(report.scannedFiles.some((path) => path.startsWith("release-artifacts/"))).toBe(false);
  });

  it("reports missing evidence paths required by allowed registered claims", () => {
    const root = fixtureRoot();
    writeFileSync(join(root, "docs", "v2", "claim-registry.md"), registry("`tests/reports/missing-claim-evidence.json`"));

    const report = validateClaimRegistry(root);

    expect(report.ok).toBe(false);
    expect(report.violations).toEqual([
      expect.objectContaining({
        kind: "missing-evidence",
        path: "docs/project/v2-claim-registry.md",
        claim: "Aura3D is an experimental TypeScript web 3D engine prototype."
      })
    ]);
  });

  it("rejects stale or mismatched JSON evidence for a release run", () => {
    const root = fixtureRoot();
    writeFileSync(join(root, "docs", "v2", "claim-registry.md"), registry("`tests/reports/claim-evidence.json`"));
    mkdirSync(join(root, "tests", "reports"), { recursive: true });
    writeFileSync(join(root, "tests", "reports", "claim-evidence.json"), JSON.stringify({
      generatedAt: "2026-01-01T00:00:00.000Z",
      releaseRunId: "old-run"
    }));

    const report = validateClaimRegistry(root, {
      releaseRunId: "new-run",
      startedAt: new Date("2026-05-06T00:00:00.000Z")
    });

    expect(report.ok).toBe(false);
    expect(report.violations).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "stale-evidence", path: "tests/reports/claim-evidence.json" })
    ]));
  });

  it("writes the claim-registry report JSON artifact", () => {
    const root = fixtureRoot();
    const report = validateClaimRegistry(root, { releaseRunId: "claim-report-test" });
    writeClaimRegistryReport(root, report);

    const reread = validateClaimRegistry(root, { releaseRunId: "claim-report-test" });
    expect(reread.ok).toBe(true);
  });
});
