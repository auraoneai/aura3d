import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { compileShowcaseSpecFile } from "../../../packages/create-aura3d/src/showcase-spec-compiler";
import { expectStrictGeneratedSource } from "./generated-source-assertions";

const specs = {
  architecture: "tests/fixtures/showcase-spec/cinematic-architecture.json",
  digitalTwin: "tests/fixtures/showcase-spec/digital-twin-ops.json",
  particleDiagnostic: "tests/fixtures/showcase-spec/webgpu-particle-lab.json",
  dataDiagnostic: "tests/fixtures/showcase-spec/data-galaxy.json"
} as const;

describe("showcase non-game spec compiler", () => {
  it("selects a proven architecture replacement for clipped primary evidence", () => {
    const { report, outputDir } = compileFixture(specs.architecture);
    try {
      expect(report.finalStatus).toBe("prototype-blocked");
      expect(report.rejectedAssets).toHaveLength(1);
      expect(report.rejectedAssets[0]).toEqual(expect.objectContaining({
        id: "showcaseTeaHouse",
        evidence: "tests/reports/showcase-route-primary-probes/showcase-cinematic-architecture.json"
      }));
      expect(["route-primary-clipped", "route-primary-missing"]).toContain(report.rejectedAssets[0]?.reason);
      expect(report.replacementCandidates.length).toBeGreaterThan(0);
      expect(report.blockers).not.toContain("replacement:showcaseTeaHouse:no-suitable-candidate");
      expect(report.selectedReplacement).toMatchObject({
        replaces: "showcaseTeaHouse",
        id: "showcaseVoxelBuilding",
        role: "environment"
      });
      expect(report.selectedReplacement?.score).toBeGreaterThan(0);
      expect(report.replacementCandidates.find((candidate) => candidate.id === "showcaseVoxelBuilding")).toMatchObject({
        accepted: true,
        selected: true,
        evidence: "tests/reports/showcase-release-asset-probes/showcaseVoxelBuilding.json"
      });
      expect(readJson(outputDir, "route-health.json")).toMatchObject({
        categoryPlan: {
          kind: "architecture-environment",
          cameraIntent: "architecture-hero"
        }
      });
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });

  it("selects a proven industrial replacement while demoting simulation claims", () => {
    const { report, outputDir } = compileFixture(specs.digitalTwin);
    try {
      expect(report.finalStatus).toBe("prototype-blocked");
      expect(report.rejectedAssets.map((asset) => asset.id)).toContain("showcaseAssemblyLine");
      expect(report.blockers).not.toContain("replacement:showcaseAssemblyLine:no-suitable-candidate");
      expect(report.selectedReplacement).toMatchObject({
        replaces: "showcaseAssemblyLine",
        id: "showcaseOrangeIndustrialRobot",
        role: "prop"
      });
      const routeHealth = readJson(outputDir, "route-health.json");
      expect(routeHealth).toMatchObject({
        publicShowcase: false,
        categoryPlan: {
          kind: "industrial-digital-twin"
        }
      });
      expect(record(routeHealth.claimStatus).notAllowed).toEqual(expect.arrayContaining([
        "real-facility-simulation: unsupported"
      ]));
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });

  it("keeps particle WebGPU route internal-diagnostic without promoting native WebGPU", () => {
    const { report, outputDir } = compileFixture(specs.particleDiagnostic);
    try {
      expect(report.ok).toBe(false);
      expect(report.finalStatus).toBe("internal-diagnostic");
      expect(report.selectedReplacement).toBeUndefined();
      const routeHealth = readJson(outputDir, "route-health.json");
      expect(routeHealth).toMatchObject({
        classification: "internal-diagnostic",
        publicShowcase: false,
        categoryPlan: {
          kind: "particle-diagnostic",
          backendClaim: "fallback"
        }
      });
      expect(record(routeHealth.claimStatus).notAllowed).toEqual(expect.arrayContaining([
        "native-webgpu: unsupported"
      ]));
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });

  it("selects a proven diagnostic anchor for unreadable data station evidence", () => {
      const { report, outputDir } = compileFixture(specs.dataDiagnostic);
      try {
      expect(report.finalStatus).toBe("internal-diagnostic");
      expect(report.rejectedAssets).toHaveLength(1);
      expect(report.rejectedAssets[0]).toEqual(expect.objectContaining({
        id: "showcaseDataStation",
        evidence: "tests/reports/showcase-route-primary-probes/showcase-data-galaxy.json"
      }));
      expect(["route-primary-missing", "route-primary-unreadable"]).toContain(report.rejectedAssets[0]?.reason);
      expect(report.blockers).not.toContain("replacement:showcaseDataStation:no-suitable-candidate");
      expect(report.selectedReplacement).toMatchObject({
        replaces: "showcaseDataStation",
        id: "showcaseParticleCore",
        role: "abstract"
      });
      expect(readJson(outputDir, "route-health.json")).toMatchObject({
        categoryPlan: {
          kind: "data-diagnostic",
          cameraIntent: "data-observatory"
        }
      });
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });

  it("generates non-game source through public engine imports and typed assets only", () => {
    for (const specPath of Object.values(specs)) {
      const { outputDir } = compileFixture(specPath);
      try {
        const source = readFileSync(join(outputDir, "src", "main.ts"), "utf8");
        expect(source).toContain("from \"@aura3d/engine\"");
        expect(source).toContain("from \"../../../src/aura-assets\"");
        expect(source).toContain("Object.defineProperty(window,");
        expect(source).not.toContain("from \"three\"");
        expect(source).not.toContain("unsafeModelUrl");
        expect(source).not.toContain("model(\"");
        expectStrictGeneratedSource(source);
      } finally {
        rmSync(outputDir, { recursive: true, force: true });
      }
    }
  }, 20_000);

  it("emits role-aware evidence framing for generated non-game categories", () => {
    const expectedFrames = [
      { specPath: specs.architecture, intent: "architecture-hero", targetMaxDimension: "2.2", evidenceMargin: "0.18" },
      { specPath: specs.digitalTwin, intent: "industrial-overview", targetMaxDimension: "1.6", evidenceMargin: "0.16" },
      { specPath: specs.particleDiagnostic, intent: "diagnostic-core", targetMaxDimension: "1.45", evidenceMargin: "0.2" },
      { specPath: specs.dataDiagnostic, intent: "data-observatory", targetMaxDimension: "1.55", evidenceMargin: "0.22" }
    ] as const;

    for (const expected of expectedFrames) {
      const { outputDir } = compileFixture(expected.specPath);
      try {
        const source = readFileSync(join(outputDir, "src", "main.ts"), "utf8");
        expect(source).toContain("const routeFrame = {");
        expect(source).toContain(`cameraIntent: "${expected.intent}"`);
        expect(source).toContain(`evidenceMargin: ${expected.evidenceMargin}`);
        expect(source).toContain(`targetMaxDimension: ${expected.targetMaxDimension}`);
        expect(source).toContain("targetMaxDimension: routeFrame.targetMaxDimension");
        expect(source).toContain("routeFrame,");
        expectStrictGeneratedSource(source);
      } finally {
        rmSync(outputDir, { recursive: true, force: true });
      }
    }
  }, 20_000);
});

function compileFixture(specPath: string) {
  const outputDir = mkdtempSync(join(tmpdir(), "aura3d-non-game-spec-"));
  const report = compileShowcaseSpecFile({ specPath, outputDir });
  return { outputDir, report };
}

function readJson(outputDir: string, relativePath: string): Readonly<Record<string, unknown>> {
  const parsed: unknown = JSON.parse(readFileSync(join(outputDir, relativePath), "utf8"));
  return record(parsed);
}

function record(value: unknown): Readonly<Record<string, unknown>> {
  if (!isRecord(value)) throw new Error("expected JSON object");
  return value;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
