import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { compileShowcaseSpec, compileShowcaseSpecFile } from "../../../packages/create-aura3d/src/showcase-spec-compiler";
import { expectStrictGeneratedSource } from "./generated-source-assertions";

describe("showcase spec compiler", () => {
  it("emits a release-ready candidate artifact set when required evidence is present", () => {
    const outputDir = mkdtempSync(join(tmpdir(), "aura3d-showcase-spec-"));
    const proofDir = `tests/reports/showcase-spec-compiler-unit-${process.pid}-${Date.now()}`;
    mkdirSync(proofDir, { recursive: true });
    try {
      const spec = readProductConfiguratorSpec();
      const deployEvidencePath = join(proofDir, "product-deploy-evidence.json");
      writeFileSync(deployEvidencePath, `${JSON.stringify(createPassingDeployEvidence(spec), null, 2)}\n`);
      const report = compileShowcaseSpec({
        ...spec,
        evidence: {
          ...spec.evidence,
          deployEvidence: deployEvidencePath
        }
      }, { outputDir });

      expect(report.blockers).toEqual([]);
      expect(report.ok).toBe(true);
      expect(report.finalStatus).toBe("release-ready candidate");
      expect(report.generatedFiles).toEqual(expect.arrayContaining([
        "README.md",
        "route-gate.patch.json",
        "route-health.json",
        "src/main.ts",
        "showcase-evidence-checklist.json",
        "showcase-spec-compile-report.json"
      ]));

      const routeGatePatch = JSON.parse(readFileSync(join(outputDir, "route-gate.patch.json"), "utf8"));
      expect(routeGatePatch).toMatchObject({
        route: {
          primaryAssets: ["showcaseHeadphones"],
          routePrimaryHeroAsset: "showcaseHeadphones",
          requiresTypedPrimaryAssets: true
        }
      });

      const source = readFileSync(join(outputDir, "src", "main.ts"), "utf8");
      expect(source).toContain("model(assets.showcaseHeadphones)");
      expect(source).toContain("Object.defineProperty(window, \"__AURA3D_SHOWCASE_GENERATED_HEADPHONES__\"");
      expect(source).not.toContain("as unknown");
      expect(source).not.toContain("window.__AURA3D_SHOWCASE_GENERATED_HEADPHONES__ =");
      expect(source).not.toContain("unsafeModelUrl");
      expect(source).not.toContain("from \"three\"");
      expectStrictGeneratedSource(source);

      const routeHealth = JSON.parse(readFileSync(join(outputDir, "route-health.json"), "utf8"));
      expect(routeHealth).toMatchObject({
        classification: "release-ready candidate",
        publicShowcase: true,
        renderer: {
          path: "createAuraApp root safe API",
          mode: "safe-basic",
          nativeWebGPU: false,
          productionRuntime: false
        },
        primitiveStatus: {
          sourceOccurrences: 0,
          primitiveBudget: 0,
          status: "no-primitive-primary-subjects-generated"
        },
        claimStatus: {
          status: "release-ready candidate",
          label: "createAuraApp",
          allowed: [
            "typed-product-asset: tests/fixtures/showcase-spec/evidence/showcase-route-primary-probes/showcase-product-configurator.json",
            "configurator-ui: apps/showcase-product-configurator/README.md"
          ],
          notAllowed: []
        },
        evidence: {
          global: "window.__AURA3D_SHOWCASE_GENERATED_HEADPHONES__",
          sourceReview: "apps/showcase-generated-headphones/src/main.ts",
          routePrimaryProbe: "tests/fixtures/showcase-spec/evidence/showcase-route-primary-probes/showcase-product-configurator.json",
          routePrimaryScreenshot: "tests/fixtures/showcase-spec/evidence/showcase-route-primary-probes/showcase-product-configurator.png",
          desktopScreenshot: "tests/fixtures/showcase-spec/evidence/showcase-route-primary-probes/showcase-product-configurator.png",
          mobileScreenshot: "tests/fixtures/showcase-spec/evidence/showcase-route-primary-probes/showcase-product-configurator.png"
        }
      });
      expect(routeHealth.primaryAssets).toEqual([{
        typedRef: "assets.showcaseHeadphones",
        role: "product",
        status: "typed-primary-asset",
        quality: "release"
      }]);
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
      rmSync(proofDir, { recursive: true, force: true });
    }
  }, 30_000);

  it("replaces a stale composition report with current geometry and screenshot evidence in one invocation", () => {
    const outputDir = `tests/reports/showcase-spec-one-pass-${process.pid}-${Date.now()}`;
    const compositionPath = join(outputDir, "game-template", "showcase-turbo-drift-circuit-asset-pair-composition.json");
    const baseSpec = JSON.parse(readFileSync("tests/fixtures/showcase-spec/turbo-drift-circuit.json", "utf8"));
    mkdirSync(join(outputDir, "game-template"), { recursive: true });
    writeFileSync(compositionPath, `${JSON.stringify({
      schema: "aura3d-showcase-asset-pair-composition/1.0",
      routeId: baseSpec.routeId,
      category: "racing",
      verdict: "fail",
      pass: false,
      screenshot: {
        path: baseSpec.evidence.routePrimaryScreenshot,
        sha256: "sha256-0000000000000000000000000000000000000000000000000000000000000000",
        width: 1440,
        height: 900
      },
      geometry: {
        report: "stale-geometry.json",
        assetId: "showcaseMiniRaceTrack",
        assetHash: "sha256-0000000000000000000000000000000000000000000000000000000000000000",
        source: "asset-mesh-extracted",
        modelAnchorCount: 1
      },
      assets: [],
      thresholds: {},
      checks: [],
      blockers: ["stale"]
    }, null, 2)}\n`);

    try {
      const report = compileShowcaseSpec({
        ...baseSpec,
        evidence: {
          ...baseSpec.evidence,
          assetPairCompositionReport: compositionPath
        }
      }, { outputDir });
      const composition = JSON.parse(readFileSync(compositionPath, "utf8"));
      const routeProbe = JSON.parse(readFileSync(baseSpec.evidence.routePrimaryProbe, "utf8"));

      expect(report.assetPairComposition?.report).toBe(compositionPath);
      expect(composition.geometry.assetId).toBe(baseSpec.racing.trackAsset);
      expect(composition.geometry.report).toBe(join(outputDir, "game-template", "showcase-turbo-drift-circuit-racing-track-topology.json"));
      expect(composition.screenshot.sha256).toBe(routeProbe.renderedProbe.sha256);
      expect(composition.screenshot.sha256).not.toBe("sha256-0000000000000000000000000000000000000000000000000000000000000000");
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  }, 30_000);

  it("demotes overclaimed specs and records evidence blockers instead of fake-green release status", () => {
    const outputDir = mkdtempSync(join(tmpdir(), "aura3d-showcase-spec-"));
    try {
      const report = compileShowcaseSpecFile({
        specPath: "tests/fixtures/showcase-spec/webgpu-overclaim.json",
        outputDir
      });

      expect(report.ok).toBe(false);
      expect(report.finalStatus).toBe("prototype-blocked");
      expect(report.blockers).toEqual(expect.arrayContaining([
        "asset:showcaseParticleCore:quality-not-release",
        "asset:showcaseParticleCore:missing-durable-provenance",
        "asset:showcaseParticleCore:missing-rendered-probe",
        "asset:showcaseParticleCore:missing-orientation-evidence",
        "asset:showcaseParticleCore:missing-foreground-bounds",
        "evidence:deploy-not-passed",
        "evidence:route-primary-not-passed",
        "capability:native-webgpu:unsupported",
        "capability:compute-dispatch:unsupported"
      ]));

      const routeHealth = JSON.parse(readFileSync(join(outputDir, "route-health.json"), "utf8"));
      expect(routeHealth).toMatchObject({
        classification: "prototype-blocked",
        publicShowcase: false,
        promotionStatus: "blocked-by-showcase-spec-compiler",
        evidence: {
          global: "window.__AURA3D_SHOWCASE_GENERATED_WEBGPU_LAB__",
          sourceReview: "apps/showcase-generated-webgpu-lab/src/main.ts"
        }
      });
      expect(routeHealth.primaryAssets).toEqual([{
        typedRef: "assets.showcaseParticleCore",
        role: "effect-core",
        status: "typed-primary-asset",
        quality: "candidate"
      }]);
      expect(routeHealth.claimStatus.notAllowed).toEqual(expect.arrayContaining([
        "native-webgpu: unsupported",
        "compute-dispatch: unsupported",
        "evidence:deploy-not-passed",
        "evidence:route-primary-not-passed"
      ]));
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });

  it("requires release-ready capabilities to carry explicit evidence", () => {
    const baseSpec = JSON.parse(readFileSync("tests/fixtures/showcase-spec/product-configurator.json", "utf8"));
    const outputDir = mkdtempSync(join(tmpdir(), "aura3d-showcase-spec-"));
    try {
      const missingCapabilityReport = compileShowcaseSpec({
        ...baseSpec,
        capabilities: []
      }, { outputDir });

      expect(missingCapabilityReport.ok).toBe(false);
      expect(missingCapabilityReport.finalStatus).toBe("prototype-blocked");
      expect(missingCapabilityReport.blockers).toContain("capability:missing-bounded-claim-evidence");

      const partialCapabilityReport = compileShowcaseSpec({
        ...baseSpec,
        capabilities: [{
          name: "configurator-ui",
          status: "partial"
        }]
      }, { outputDir });

      expect(partialCapabilityReport.ok).toBe(false);
      expect(partialCapabilityReport.finalStatus).toBe("prototype-blocked");
      expect(partialCapabilityReport.blockers).toContain("capability:configurator-ui:missing-evidence");
      expect(partialCapabilityReport.blockers).toContain("capability:configurator-ui:not-release-safe:partial");
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });

  it("demotes release-ready specs with non-release route claim labels", () => {
    const baseSpec = JSON.parse(readFileSync("tests/fixtures/showcase-spec/product-configurator.json", "utf8"));
    const outputDir = mkdtempSync(join(tmpdir(), "aura3d-showcase-spec-"));
    try {
      for (const claimLabel of ["prototype", "roadmap"] as const) {
        const report = compileShowcaseSpec({
          ...baseSpec,
          claimLabel
        }, { outputDir });

        expect(report.ok).toBe(false);
        expect(report.finalStatus).toBe("prototype-blocked");
        expect(report.blockers).toContain(`claim-label:${claimLabel}:not-release-safe`);
      }
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });

});

function readProductConfiguratorSpec(): {
  readonly evidence: Readonly<Record<string, unknown>>;
  readonly primaryAssets: readonly { readonly id: string }[];
} & Readonly<Record<string, unknown>> {
  return JSON.parse(readFileSync("tests/fixtures/showcase-spec/product-configurator.json", "utf8")) as {
    readonly evidence: Readonly<Record<string, unknown>>;
    readonly primaryAssets: readonly { readonly id: string }[];
  } & Readonly<Record<string, unknown>>;
}

function createPassingDeployEvidence(spec: {
  readonly evidence: Readonly<Record<string, unknown>>;
  readonly primaryAssets: readonly { readonly id: string }[];
}) {
  return {
    routes: [
      {
        deployCheckCommand: spec.evidence.deployCommand,
        deployCheckOk: true,
        deployWarnings: [],
        deployFailures: [],
        primaryAssetEvidence: spec.primaryAssets.map((asset) => ({ id: asset.id }))
      }
    ]
  };
}
