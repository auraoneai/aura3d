import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtempSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { auditExampleTruth } from "../../../tools/example-truth-audit/index.js";
import { validateV3ClaimGates } from "../../../tools/foundation-claim-gates/index.js";
import { validateV3ReportFreshness, writeJson, baseReport } from "../../../tools/foundation-reporting/index.js";

function fixtureRoot(): string {
  return mkdtempSync(join(tmpdir(), "g3d-v3-validation-"));
}

describe("v3 validation tools", () => {
  it("blocks unscoped v3 competitor and production claims", () => {
    const root = fixtureRoot();
    mkdirSync(join(root, "examples", "bad"), { recursive: true });
    writeFileSync(join(root, "examples", "bad", "README.md"), "Galileo3D is better than Three.js.\n");
    writeFileSync(join(root, "README.md"), "Galileo3D is not production-ready.\n");

    const report = validateV3ClaimGates(root);

    expect(report.ok).toBe(false);
    expect(report.blockedOccurrences).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "examples/bad/README.md", claim: "broad better-than-Three.js language" }),
    ]));
    expect(report.scopedOccurrences).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "README.md", claim: "production-ready language", scoped: true }),
    ]));
  });

  it("audits portfolio cards for screenshot, browser test, and caveat evidence", () => {
    const root = fixtureRoot();
    mkdirSync(join(root, "examples", "portfolio", "screenshots"), { recursive: true });
    mkdirSync(join(root, "tests", "browser"), { recursive: true });
    writeFileSync(join(root, "examples", "portfolio", "screenshots", "demo.png"), "png");
    writeFileSync(join(root, "tests", "browser", "demo.spec.ts"), "test('demo', () => 'demo');\n");
    writeFileSync(join(root, "examples", "portfolio", "main.ts"), `
const examples = [{
  id: "demo",
  title: "Demo",
  href: "./demo/index.html",
  caveat: "This is not production-ready and remains bounded."
}];
`);

    const report = auditExampleTruth(root);

    expect(report.ok).toBe(true);
    expect(report.examples).toEqual([
      expect.objectContaining({ id: "demo", screenshotPath: "examples/portfolio/screenshots/demo.png", hasKnownLimitNote: true }),
    ]);
  });

  it("detects stale v3 reports by source hash", () => {
    const root = fixtureRoot();
    mkdirSync(join(root, "docs", "v3"), { recursive: true });
    writeFileSync(join(root, "docs", "v3", "README.md"), "before\n");
    const report = baseReport(root, {
      ok: true,
      command: "test",
      runIdPrefix: "test",
      sourceFiles: ["docs/project/v3-readme.md"],
    });
    writeJson(root, "tests/reports/foundation-current-capability.json", report);
    writeFileSync(join(root, "docs", "v3", "README.md"), "after\n");

    const issues = validateV3ReportFreshness(root, ["tests/reports/foundation-current-capability.json"]);

    expect(issues).toEqual([
      expect.objectContaining({ path: "tests/reports/foundation-current-capability.json", message: expect.stringContaining("Freshness source changed") }),
    ]);
  });
});
