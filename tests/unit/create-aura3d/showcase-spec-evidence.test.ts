import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { compileShowcaseSpec } from "../../../packages/create-aura3d/src/showcase-spec-compiler";

const SHOWCASE_SPEC_COMPILER_TEST_TIMEOUT_MS = 15000;

describe("showcase spec evidence validation", () => {
  it("demotes forged release specs with true booleans but missing evidence artifacts", () => {
    const baseSpec = JSON.parse(readFileSync("tests/fixtures/showcase-spec/product-configurator.json", "utf8"));
    const outputDir = mkdtempSync(join(tmpdir(), "aura3d-showcase-spec-"));

    try {
      const report = compileShowcaseSpec({
        ...baseSpec,
        evidence: {
          ...baseSpec.evidence,
          routePrimaryProbe: "tests/reports/__missing_security_probe__/probe.json",
          routePrimaryScreenshot: "tests/reports/__missing_security_probe__/probe.png",
          deployCommand: "echo fake-deploy-pass",
          deployEvidence: "tests/reports/__missing_security_probe__/deploy.json",
          deployPassed: true,
          routePrimaryPassed: true
        },
        capabilities: [{
          name: "native-webgpu",
          status: "root-proven",
          evidence: "tests/reports/__missing_security_probe__/native-webgpu.json"
        }]
      }, { outputDir });

      expect(report.ok).toBe(false);
      expect(report.finalStatus).toBe("prototype-blocked");
      expect(report.blockers).toEqual(expect.arrayContaining([
        "evidence:route-primary-probe:missing-file",
        "evidence:route-primary-screenshot:missing-file",
        "evidence:deploy-command:not-release-check-deploy",
        "evidence:deploy-artifact:missing-file",
        "capability:native-webgpu:evidence:missing-file"
      ]));
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });

  it("demotes racing specs when gameplay proof lacks meaningful lap length and visual review", () => {
    const baseSpec = JSON.parse(readFileSync("tests/fixtures/showcase-spec/turbo-drift-circuit.json", "utf8"));
    const outputDir = mkdtempSync(join(tmpdir(), "aura3d-showcase-spec-"));
    const proofDir = `tests/reports/showcase-spec-evidence-unit-${process.pid}-${Date.now()}-racing`;
    mkdirSync(proofDir, { recursive: true });
    const gameplayProof = join(proofDir, "quick-racing-proof.json");
    writeFileSync(gameplayProof, `${JSON.stringify({
      schema: "aura3d-showcase-gameplay-proof",
      appId: "showcase-turbo-drift-circuit",
      pass: true,
      screenshots: {
        beforeInput: { bytes: 12, sha256: "a".repeat(64) },
        afterInput: { bytes: 12, sha256: "b".repeat(64) }
      },
      categoryProof: {
        racing: {
          inputChangesSpeed: true,
          inputChangesHeading: true,
          checkpointOrLapProgression: true,
          resetWorks: true,
          authoredLapSeconds: 5,
          routeAlignedToVisibleTrack: false,
          noDebugLocatorDisk: false,
          visualReviewPass: false
        }
      }
    }, null, 2)}\n`);

    try {
      const report = compileShowcaseSpec({
        ...baseSpec,
        evidence: {
          ...baseSpec.evidence,
          gameplayProof
        }
      }, { outputDir });

      expect(report.ok).toBe(false);
      expect(report.finalStatus).toBe("prototype-blocked");
      expect(report.blockers).toEqual(expect.arrayContaining([
        "evidence:gameplay-proof:racing:visual-review-missing",
        "evidence:gameplay-proof:racing:visual-review-evidence-missing",
        "evidence:gameplay-proof:racing:route-alignment-missing",
        "evidence:gameplay-proof:racing:debug-locator-disk-present",
        "evidence:gameplay-proof:racing:authored-lap-seconds-too-low:5"
      ]));
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
      rmSync(proofDir, { recursive: true, force: true });
    }
  }, SHOWCASE_SPEC_COMPILER_TEST_TIMEOUT_MS);

  it("demotes platformer specs when gameplay proof only shows movement and jump", () => {
    const baseSpec = JSON.parse(readFileSync("tests/fixtures/showcase-spec/skyline-runner.json", "utf8"));
    const outputDir = mkdtempSync(join(tmpdir(), "aura3d-showcase-spec-"));
    const proofDir = `tests/reports/showcase-spec-evidence-unit-${process.pid}-${Date.now()}-platformer`;
    mkdirSync(proofDir, { recursive: true });
    const gameplayProof = join(proofDir, "quick-platformer-proof.json");
    writeFileSync(gameplayProof, `${JSON.stringify({
      schema: "aura3d-showcase-gameplay-proof",
      appId: "showcase-skyline-runner",
      pass: true,
      screenshots: {
        beforeInput: { bytes: 12, sha256: "c".repeat(64) },
        afterInput: { bytes: 12, sha256: "d".repeat(64) }
      },
      categoryProof: {
        platformer: {
          movementChangesPosition: true,
          jumpChangesState: true,
          checkpointProgression: false,
          hazardRespawn: false,
          finishProgression: false,
          authoredPlayableSeconds: 6,
          styleCompatible: false,
          scaleCompatible: false,
          visualReviewPass: false
        }
      }
    }, null, 2)}\n`);

    try {
      const report = compileShowcaseSpec({
        ...baseSpec,
        evidence: {
          ...baseSpec.evidence,
          gameplayProof
        }
      }, { outputDir });

      expect(report.ok).toBe(false);
      expect(report.finalStatus).toBe("prototype-blocked");
      expect(report.blockers).toEqual(expect.arrayContaining([
        "evidence:gameplay-proof:platformer:checkpoint-missing",
        "evidence:gameplay-proof:platformer:hazard-respawn-missing",
        "evidence:gameplay-proof:platformer:finish-missing",
        "evidence:gameplay-proof:platformer:visual-review-missing",
        "evidence:gameplay-proof:platformer:visual-review-evidence-missing",
        "evidence:gameplay-proof:platformer:style-fit-missing",
        "evidence:gameplay-proof:platformer:scale-fit-missing",
        "evidence:gameplay-proof:platformer:authored-playable-seconds-too-low:6"
      ]));
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
      rmSync(proofDir, { recursive: true, force: true });
    }
  }, SHOWCASE_SPEC_COMPILER_TEST_TIMEOUT_MS);
});
