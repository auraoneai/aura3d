import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createExternalParityHdrIblReadinessReport } from "../../../tools/external-parity-hdr-ibl-readiness/index";

const temporaryRoots: string[] = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("external parity HDR/IBL readiness", () => {
  it("reads flagship IBL evidence from its dedicated report without consuming the gallery visual review", () => {
    const root = mkdtempSync(join(tmpdir(), "a3d-hdr-ibl-readiness-"));
    temporaryRoots.push(root);
    const reportDir = join(root, "tests/reports");
    mkdirSync(reportDir, { recursive: true });

    writeJson(join(root, "tests/reports/external-parity-asset-material-fidelity.json"), {
      ok: true,
      validations: [{
        name: "external-parity-material-fidelity-card",
        ok: true,
        evidence: {
          environmentResourceSet: "generated-local-linear-hdr-environment",
          hdrSource: true,
          maxLinearValue: 2,
          specularMipCount: 4,
          brdfLutValidated: true,
          diffuseIrradiance: true,
          drawCalls: 1
        }
      }]
    });
    writeJson(join(reportDir, "advanced-examples-gallery/visual-review-report.json"), {
      schema: "a3d-advanced-gallery-visual-review",
      pass: false,
      entries: []
    });
    writeJson(join(root, "tests/reports/external-parity-flagship-ibl-states.json"), {
      schema: "a3d-external-parity-flagship-ibl-states/1.0",
      entries: ["product-configurator", "architecture-viewer", "game-showcase"].map((id) => ({
        id,
        featureEvidence: {
          generatedEnvironmentMap: true,
          environmentResourceSet: "generated-local-linear-hdr-environment",
          environmentReflectionEvidence: true,
          brdfLutValidated: true
        },
        metrics: {
          environmentTextureMipCount: 4,
          environmentBrdfLutValidated: true,
          environmentDiffuseIrradiance: true,
          environmentSpecularIntensity: 1,
          drawCalls: 1
        }
      }))
    });

    const report = createExternalParityHdrIblReadinessReport(root);

    expect(report.ok).toBe(true);
    expect(report.boundedHdrIblEvidence).toBe(true);
    expect(report.validations.find((entry) => entry.id === "flagship-linear-hdr-ibl-state")).toMatchObject({
      passed: true,
      evidence: "tests/reports/external-parity-flagship-ibl-states.json"
    });
  });
});

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}
