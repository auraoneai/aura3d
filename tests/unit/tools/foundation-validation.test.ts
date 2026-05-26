import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtempSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { validateFoundationClaimGates } from "../../../tools/foundation-claim-gates/index.js";
import { validateFoundationReportFreshness, writeJson, baseReport } from "../../../tools/foundation-reporting/index.js";

function fixtureRoot(): string {
  return mkdtempSync(join(tmpdir(), "a3d-foundation-validation-"));
}

describe("foundation validation tools", () => {
  it("blocks unscoped foundation competitor and production claims", () => {
    const root = fixtureRoot();
    mkdirSync(join(root, "docs", "examples", "bad"), { recursive: true });
    writeFileSync(join(root, "docs", "examples", "bad", "README.md"), "Aura3D is better than Three.js.\n");
    writeFileSync(join(root, "README.md"), "Aura3D is not production-ready.\n");

    const report = validateFoundationClaimGates(root);

    expect(report.ok).toBe(false);
    expect(report.blockedOccurrences).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "docs/examples/bad/README.md", claim: "broad better-than-Three.js language" }),
    ]));
    expect(report.scopedOccurrences).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "README.md", claim: "production-ready language", scoped: true }),
    ]));
  });

  it("detects stale foundation reports by source hash", () => {
    const root = fixtureRoot();
    mkdirSync(join(root, "docs", "project"), { recursive: true });
    writeFileSync(join(root, "docs", "project", "documentation-index.md"), "before\n");
    const report = baseReport(root, {
      ok: true,
      command: "test",
      runIdPrefix: "test",
      sourceFiles: ["docs/project/documentation-index.md"],
    });
    writeJson(root, "tests/reports/foundation-current-capability.json", report);
    writeFileSync(join(root, "docs", "project", "documentation-index.md"), "after\n");

    const issues = validateFoundationReportFreshness(root, ["tests/reports/foundation-current-capability.json"]);

    expect(issues).toEqual([
      expect.objectContaining({ path: "tests/reports/foundation-current-capability.json", message: expect.stringContaining("Freshness source changed") }),
    ]);
  });
});
