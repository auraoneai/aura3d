import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { compileShowcaseSpec, compileShowcaseSpecFile } from "../../../packages/create-aura3d/src/showcase-spec-compiler";

describe("showcase spec compiler safety", () => {
  it("rejects malformed specs before writing route artifacts", () => {
    const outputDir = mkdtempSync(join(tmpdir(), "aura3d-showcase-spec-"));
    try {
      expect(() => compileShowcaseSpec({
        schema: "aura3d-showcase-spec/1.0",
        routeId: "bad id",
        label: "Bad",
        category: "product-configurator",
        path: "/apps/bad/",
        globalName: "__BAD__",
        claimLabel: "createAuraApp",
        publicStatus: "release-ready candidate",
        layout: { heroAsset: "missing", uiPlacement: "right-panel" },
        primaryAssets: [],
        evidence: {
          routePrimaryProbe: "missing.json",
          routePrimaryScreenshot: "missing.png",
          deployCommand: "pnpm check",
          deployPassed: true,
          routePrimaryPassed: true
        },
        capabilities: []
      }, { outputDir })).toThrow(/routeId/);
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });

  it("rejects typed asset references that would generate unsafe route source", () => {
    const baseSpec = readProductSpec();
    const outputDir = mkdtempSync(join(tmpdir(), "aura3d-showcase-spec-"));
    try {
      expect(() => compileShowcaseSpec({
        ...baseSpec,
        layout: { ...baseSpec.layout, heroAsset: "showcaseHeadphones); unsafeModelUrl(\"/bad.glb\")" },
        primaryAssets: [{
          ...baseSpec.primaryAssets[0],
          id: "showcaseHeadphones); unsafeModelUrl(\"/bad.glb\")",
          typedRef: "assets.showcaseHeadphones); unsafeModelUrl(\"/bad.glb\")"
        }]
      }, { outputDir })).toThrow(/asset id/);

      expect(() => compileShowcaseSpec({
        ...baseSpec,
        primaryAssets: [{
          ...baseSpec.primaryAssets[0],
          typedRef: "model(\"/raw.glb\")"
        }]
      }, { outputDir })).toThrow(/typedRef/);
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });

  it("rejects malformed evidence global names before generating route code", () => {
    const baseSpec = readProductSpec();
    const outputDir = mkdtempSync(join(tmpdir(), "aura3d-showcase-spec-"));
    try {
      for (const globalName of [
        "window.location",
        "__proto__",
        "prototype",
        "constructor",
        "location",
        "eval",
        "onerror",
        "AURA3D_UNWRAPPED"
      ]) {
        expect(() => compileShowcaseSpec({
          ...baseSpec,
          globalName
        }, { outputDir })).toThrow(/globalName/);
      }
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });

  it("fails loudly for malformed replacement evidence JSON", () => {
    const proofDir = mkdtempSync(join(tmpdir(), "aura3d-malformed-evidence-"));
    const outputDir = mkdtempSync(join(tmpdir(), "aura3d-showcase-spec-"));
    try {
      const malformedProbe = join(proofDir, "bad-probe.json");
      writeFileSync(malformedProbe, "{");
      const spec = {
        ...readProductSpec(),
        primaryAssets: [{
          id: "showcaseHeadphones",
          role: "product",
          typedRef: "assets.showcaseHeadphones",
          quality: "candidate",
          hasDurableProvenance: true,
          hasRenderedProbe: false,
          hasOrientationEvidence: true,
          hasForegroundBounds: false,
          assetPolicy: {
            allowReplacement: true,
            replacementQuery: "headphones product",
            requiredRole: "environment",
            minQuality: "release",
            requireRenderedProbe: true,
            requireDeployPass: true
          }
        }],
        evidence: {
          ...readProductSpec().evidence,
          releaseAssetProbes: {
            showcaseHeadphones: malformedProbe
          }
        }
      };
      expect(() => compileShowcaseSpec(spec, { outputDir })).toThrow(/Failed to parse JSON evidence/);
    } finally {
      rmSync(proofDir, { recursive: true, force: true });
      rmSync(outputDir, { recursive: true, force: true });
    }
  });
});

interface ProductSpecFixture extends Readonly<Record<string, unknown>> {
  readonly layout: Readonly<Record<string, unknown>>;
  readonly primaryAssets: readonly Readonly<Record<string, unknown>>[];
  readonly evidence: Readonly<Record<string, unknown>>;
}

function readProductSpec(): ProductSpecFixture {
  return JSON.parse(readFileSync("tests/fixtures/showcase-spec/product-configurator.json", "utf8")) as ProductSpecFixture;
}
