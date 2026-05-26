import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

interface AuditReport {
  readonly summary: {
    readonly expectedRouteReports: number;
    readonly presentRouteReports: number;
    readonly missingRouteReports: number;
    readonly unexpectedRouteReports: number;
  };
  readonly blockers: readonly string[];
  readonly warnings: readonly string[];
  readonly routeAudits: readonly {
    readonly routeId: string;
    readonly evidenceMode?: string;
    readonly fullGalleryEvidence: boolean;
    readonly telemetry?: {
      readonly hasCurrentScreenshotArtifacts?: boolean;
    };
    readonly specializedEvidence: readonly string[];
    readonly blockers: readonly string[];
  }[];
}

describe("ThreejsParity advanced gallery report audit", () => {
  it("fails partial report folders instead of treating focused captures as complete gallery evidence", () => {
    const root = resolve(".");
    const reportDir = mkdtempSync(join(tmpdir(), "a3d-threejs-parity-report-audit-"));
    try {
      writeFileSync(join(reportDir, "product-configurator.json"), JSON.stringify(minimalRouteReport("product-configurator"), null, 2));
      writeFileSync(join(reportDir, "data-galaxy.json"), JSON.stringify(minimalRouteReport("data-galaxy"), null, 2));
      writeFileSync(join(reportDir, "visual-regression-inventory.json"), JSON.stringify({
        schema: "a3d-threejs-parity-advanced-gallery-visual-regression-inventory",
        demos: []
      }, null, 2));

      const result = spawnSync("pnpm", [
        "exec",
        "tsx",
        "--tsconfig",
        "tsconfig.base.json",
        "tools/advanced-gallery-report-audit/index.ts",
        "--report-dir",
        reportDir
      ], {
        cwd: root,
        encoding: "utf8"
      });

      expect(result.status).toBe(1);
      expect(result.stdout).toContain("2/10 expected route reports present");
      expect(result.stdout).toContain("Missing route reports: 8");

      const outputPath = join(reportDir, "reusable-systems-disclosure-audit.json");
      expect(existsSync(outputPath)).toBe(true);
      const audit = JSON.parse(readFileSync(outputPath, "utf8")) as AuditReport;
      expect(audit.summary).toMatchObject({
        expectedRouteReports: 10,
        presentRouteReports: 2,
        missingRouteReports: 8,
        unexpectedRouteReports: 0
      });
      expect(audit.blockers[0]).toContain("report folder is partial");
      expect(audit.blockers[0]).toContain("water-lab");
    } finally {
      rmSync(reportDir, { recursive: true, force: true });
    }
  }, 15_000);

  it("surfaces no-texture scaffold/support GLBs as asset-quality warnings", () => {
    const root = resolve(".");
    const reportDir = mkdtempSync(join(tmpdir(), "a3d-threejs-parity-report-audit-assets-"));
    try {
      writeFileSync(join(reportDir, "product-configurator.json"), JSON.stringify({
        ...minimalRouteReport("product-configurator"),
        authored: {
          status: "ready",
          assetIds: ["product-configurator-studio-blender", "car-concept-batched"],
          assets: ["Authored Premium Product Configurator Studio", "Car Concept Batched"],
          drawItems: 334,
          materialDiagnostics: [
            {
              assetId: "product-configurator-studio-blender",
              drawItems: 229,
              texturedDrawItems: 0,
              fallbackWhiteDrawItems: 0,
              missingGeometryDrawItems: 0,
              missingMaterialDrawItems: 0,
              renderableBindingCount: 229,
              materialOverrideTargetCount: 7,
              materialOverrideSource: "GLTFRenderResources.collectMaterialOverrideTargets"
            },
            {
              assetId: "car-concept-batched",
              drawItems: 105,
              texturedDrawItems: 97,
              baseColorTextureDrawItems: 8,
              colorBearingTextureDrawItems: 8,
              surfaceDetailTextureDrawItems: 97,
              effectiveTextureBackedDrawItems: 97,
              fallbackWhiteDrawItems: 0,
              missingGeometryDrawItems: 0,
              missingMaterialDrawItems: 0,
              textureBackedMaterialNames: ["Paint", "Tire"]
            }
          ]
        }
      }, null, 2));
      writeFileSync(join(reportDir, "data-galaxy.json"), JSON.stringify({
        ...minimalRouteReport("data-galaxy"),
        dataGalaxyEvidence: dataGalaxyStructuredEvidence({ generatedNoTextureAuthoredGlb: true }),
        authored: {
          status: "ready",
          assetIds: ["data-galaxy-core-blender", "animated-morph-cube"],
          assets: ["Authored AI Data Galaxy Core", "Animated Morph Core"],
          drawItems: 11,
          materialDiagnostics: [
            {
              assetId: "data-galaxy-core-blender",
              drawItems: 10,
              texturedDrawItems: 0,
              fallbackWhiteDrawItems: 0,
              missingGeometryDrawItems: 0,
              missingMaterialDrawItems: 0
            },
            {
              assetId: "animated-morph-cube",
              drawItems: 1,
              texturedDrawItems: 0,
              fallbackWhiteDrawItems: 0,
              missingGeometryDrawItems: 0,
              missingMaterialDrawItems: 0
            }
          ]
        }
      }, null, 2));

      const result = spawnSync("pnpm", [
        "exec",
        "tsx",
        "--tsconfig",
        "tsconfig.base.json",
        "tools/advanced-gallery-report-audit/index.ts",
        "--report-dir",
        reportDir
      ], {
        cwd: root,
        encoding: "utf8"
      });

      expect(result.status).toBe(1);
      const outputPath = join(reportDir, "reusable-systems-disclosure-audit.json");
      const audit = JSON.parse(readFileSync(outputPath, "utf8")) as AuditReport;
      expect(audit.warnings.join("\n")).toContain("product-configurator still has active no-texture product-studio scaffold draw items");
      expect(audit.warnings.join("\n")).toContain("data-galaxy active authored GLBs have draw items but zero effective texture-contribution evidence");
      expect(audit.blockers.join("\n")).toContain("product-configurator support/scaffold draw items dominate authored evidence (229/334)");
      expect(audit.blockers.join("\n")).toContain("product-configurator no-texture authored draw items dominate Product evidence (229/334)");
      expect(audit.blockers.join("\n")).toContain("data-galaxy generated/no-texture authored draw items dominate evidence (10/11)");
      expect(audit.blockers.join("\n")).toContain("product-configurator-studio-blender active generated/support asset lacks structured runtime provenance disclosure");
      expect(audit.blockers.join("\n")).toContain("data-galaxy-core-blender active generated/support asset lacks structured runtime provenance disclosure");
    } finally {
      rmSync(reportDir, { recursive: true, force: true });
    }
  }, 15_000);

  it("does not block accepted route reports merely because visual review already accepted them", () => {
    const root = resolve(".");
    const reportDir = mkdtempSync(join(tmpdir(), "a3d-threejs-parity-report-audit-accepted-status-"));
    try {
      for (const routeId of expectedRouteIdsForAuditTest()) {
        writeFileSync(join(reportDir, `${routeId}.json`), JSON.stringify({
          ...minimalRouteReport(routeId),
          visualReviewStatus: "accepted"
        }, null, 2));
      }

      const result = spawnSync("pnpm", [
        "exec",
        "tsx",
        "--tsconfig",
        "tsconfig.base.json",
        "tools/advanced-gallery-report-audit/index.ts",
        "--report-dir",
        reportDir
      ], {
        cwd: root,
        encoding: "utf8"
      });

      expect(result.status).toBe(1);
      const outputPath = join(reportDir, "reusable-systems-disclosure-audit.json");
      const audit = JSON.parse(readFileSync(outputPath, "utf8")) as AuditReport;
      expect(audit.blockers.join("\n")).not.toContain("route report claims accepted/hero status");
    } finally {
      rmSync(reportDir, { recursive: true, force: true });
    }
  });

  it("blocks generated/support Product and Data assets when manifest provenance is missing or stale", () => {
    const root = resolve(".");
    const reportDir = mkdtempSync(join(tmpdir(), "a3d-threejs-parity-report-audit-generated-assets-"));
    const assetRoot = mkdtempSync(join(tmpdir(), "a3d-threejs-parity-report-audit-asset-root-"));
    try {
      for (const routeId of expectedRouteIdsForAuditTest()) {
        writeFileSync(join(reportDir, `${routeId}.json`), JSON.stringify(routeId === "product-configurator"
          ? {
              ...minimalRouteReport(routeId),
              authored: productAuthoredEvidence({
                includeMaterialControlBindings: true,
                includeGeneratedSupportAssets: true
              })
            }
          : routeId === "data-galaxy"
            ? {
                ...minimalRouteReport(routeId),
                authored: dataGalaxyAuthoredEvidenceWithProvenance(),
                dataGalaxyEvidence: dataGalaxyStructuredEvidence()
              }
            : minimalRouteReport(routeId), null, 2));
      }

      const studioGlbDir = join(assetRoot, "fixtures/advanced-gallery/assets/product-configurator-studio-blender");
      mkdirSync(studioGlbDir, { recursive: true });
      writeFileSync(join(studioGlbDir, "product-configurator-studio-blender.glb"), "not-a-real-glb-but-hashable");
      writeFileSync(join(studioGlbDir, "manifest.json"), JSON.stringify({
        id: "product-configurator-studio-blender",
        routeLinkage: { routeId: "product-configurator" },
        source: {
          sourceScript: "tools/advanced-gallery-assets/generate-product-configurator-studio-blender.py",
          inputAssets: [],
          derivativeOfExternalAsset: false
        },
        outputs: {
          glb: {
            path: "fixtures/advanced-gallery/assets/product-configurator-studio-blender/product-configurator-studio-blender.glb",
            byteSize: 1,
            sha256: "0".repeat(64)
          }
        },
        status: {
          generated: true,
          derivative: false,
          textureBacked: false,
          generatedNoTexture: true,
          supportOnly: true,
          acceptableAsFocalHero: false
        },
        exportedGlb: {
          materialCount: 25,
          textureCount: 0,
          imageCount: 0,
          meshCount: 651,
          nodeCount: 655,
          textureBackedMaterialCount: 0
        }
      }, null, 2));

      const result = spawnSync("pnpm", [
        "exec",
        "tsx",
        "--tsconfig",
        "tsconfig.base.json",
        "tools/advanced-gallery-report-audit/index.ts",
        "--report-dir",
        reportDir,
        "--asset-root",
        assetRoot
      ], {
        cwd: root,
        encoding: "utf8"
      });

      expect(result.status).toBe(1);
      const audit = JSON.parse(readFileSync(join(reportDir, "reusable-systems-disclosure-audit.json"), "utf8")) as AuditReport;
      const blockers = audit.blockers.join("\n");
      expect(blockers).toContain("product-configurator-studio-blender generated asset manifest glb hash/size does not match current file");
      expect(blockers).toContain("product-configurator-car-batched generated asset manifest is missing or unreadable");
      expect(blockers).toContain("data-galaxy-core-blender generated asset manifest is missing or unreadable");
    } finally {
      rmSync(reportDir, { recursive: true, force: true });
      rmSync(assetRoot, { recursive: true, force: true });
    }
  });

  it("requires Product material-variant evidence to include metadata-backed material-control bindings", () => {
    const root = resolve(".");
    const reportDir = mkdtempSync(join(tmpdir(), "a3d-threejs-parity-report-audit-product-variants-"));
    try {
      for (const routeId of expectedRouteIdsForAuditTest()) {
        writeFileSync(join(reportDir, `${routeId}.json`), JSON.stringify(routeId === "product-configurator"
          ? {
              ...minimalRouteReport("product-configurator"),
              authored: productAuthoredEvidence({
                includeMaterialControlBindings: false
              })
            }
          : minimalRouteReport(routeId), null, 2));
      }

      const missingControlResult = spawnSync("pnpm", [
        "exec",
        "tsx",
        "--tsconfig",
        "tsconfig.base.json",
        "tools/advanced-gallery-report-audit/index.ts",
        "--report-dir",
        reportDir
      ], {
        cwd: root,
        encoding: "utf8"
      });

      expect(missingControlResult.status).toBe(1);
      const missingControlAudit = JSON.parse(readFileSync(join(reportDir, "reusable-systems-disclosure-audit.json"), "utf8")) as AuditReport;
      const productMissingControl = missingControlAudit.routeAudits.find((route) => route.routeId === "product-configurator");
      expect(productMissingControl?.blockers.join("\n")).toContain("product-configurator lacks texture-backed imported material-variant evidence for real product assets");

      writeFileSync(join(reportDir, "product-configurator.json"), JSON.stringify({
        ...minimalRouteReport("product-configurator"),
        authored: productAuthoredEvidence({
          includeMaterialControlBindings: true
        })
      }, null, 2));

      const withControlResult = spawnSync("pnpm", [
        "exec",
        "tsx",
        "--tsconfig",
        "tsconfig.base.json",
        "tools/advanced-gallery-report-audit/index.ts",
        "--report-dir",
        reportDir
      ], {
        cwd: root,
        encoding: "utf8"
      });

      expect(withControlResult.status).toBe(1);
      const withControlAudit = JSON.parse(readFileSync(join(reportDir, "reusable-systems-disclosure-audit.json"), "utf8")) as AuditReport;
      const productWithControl = withControlAudit.routeAudits.find((route) => route.routeId === "product-configurator");
      expect(productWithControl?.blockers.join("\n")).not.toContain("product-configurator lacks texture-backed imported material-variant evidence for real product assets");
    } finally {
      rmSync(reportDir, { recursive: true, force: true });
    }
  }, 15_000);

  it("blocks Product material evidence when runtime-bound texture slots are inactive in the selected shader variant", () => {
    const root = resolve(".");
    const reportDir = mkdtempSync(join(tmpdir(), "a3d-threejs-parity-report-audit-product-shader-slots-"));
    try {
      for (const routeId of expectedRouteIdsForAuditTest()) {
        writeFileSync(join(reportDir, `${routeId}.json`), JSON.stringify(routeId === "product-configurator"
          ? {
              ...minimalRouteReport("product-configurator"),
              authored: productAuthoredEvidence({
                includeMaterialControlBindings: true,
                includeShaderInactiveTextureSlots: true
              })
            }
          : minimalRouteReport(routeId), null, 2));
      }

      const result = spawnSync("pnpm", [
        "exec",
        "tsx",
        "--tsconfig",
        "tsconfig.base.json",
        "tools/advanced-gallery-report-audit/index.ts",
        "--report-dir",
        reportDir
      ], {
        cwd: root,
        encoding: "utf8"
      });

      expect(result.status).toBe(1);
      const audit = JSON.parse(readFileSync(join(reportDir, "reusable-systems-disclosure-audit.json"), "utf8")) as AuditReport;
      const product = audit.routeAudits.find((route) => route.routeId === "product-configurator");
      expect(product?.blockers.join("\n")).toContain("product-configurator has runtime-bound texture slots that are inactive in the selected textured-PBR shader variant (car-concept:specular:3)");
    } finally {
      rmSync(reportDir, { recursive: true, force: true });
    }
  });

  it("blocks focused route reports even when the report folder has every route JSON", () => {
    const root = resolve(".");
    const reportDir = mkdtempSync(join(tmpdir(), "a3d-threejs-parity-report-audit-focused-"));
    try {
      for (const routeId of expectedRouteIdsForAuditTest()) {
        writeFileSync(join(reportDir, `${routeId}.json`), JSON.stringify(minimalRouteReport(routeId, routeId === "product-configurator" ? "focused-route" : "full-gallery"), null, 2));
      }

      const result = spawnSync("pnpm", [
        "exec",
        "tsx",
        "--tsconfig",
        "tsconfig.base.json",
        "tools/advanced-gallery-report-audit/index.ts",
        "--report-dir",
        reportDir
      ], {
        cwd: root,
        encoding: "utf8"
      });

      expect(result.status).toBe(1);
      const outputPath = join(reportDir, "reusable-systems-disclosure-audit.json");
      const audit = JSON.parse(readFileSync(outputPath, "utf8")) as AuditReport;
      const product = audit.routeAudits.find((route) => route.routeId === "product-configurator");
      expect(product).toMatchObject({
        evidenceMode: "focused-route",
        fullGalleryEvidence: false
      });
      expect(product?.blockers.join("\n")).toContain("focused/partial evidence");
    } finally {
      rmSync(reportDir, { recursive: true, force: true });
    }
  });

  it("blocks JSON-only screenshot hashes when current full/viewport/hero artifacts are absent", () => {
    const root = resolve(".");
    const reportDir = mkdtempSync(join(tmpdir(), "a3d-threejs-parity-report-audit-artifacts-missing-"));
    try {
      writeFileSync(join(reportDir, "product-configurator.json"), JSON.stringify(minimalRouteReport("product-configurator"), null, 2));

      const result = spawnSync("pnpm", [
        "exec",
        "tsx",
        "--tsconfig",
        "tsconfig.base.json",
        "tools/advanced-gallery-report-audit/index.ts",
        "--report-dir",
        reportDir
      ], {
        cwd: root,
        encoding: "utf8"
      });

      expect(result.status).toBe(1);
      const outputPath = join(reportDir, "reusable-systems-disclosure-audit.json");
      const audit = JSON.parse(readFileSync(outputPath, "utf8")) as AuditReport;
      const product = audit.routeAudits.find((route) => route.routeId === "product-configurator");
      expect(product?.telemetry?.hasCurrentScreenshotArtifacts).toBe(false);
      expect(product?.blockers.join("\n")).toContain("screenshot evidence hashes do not match current full, viewport, and hero artifacts on disk");
    } finally {
      rmSync(reportDir, { recursive: true, force: true });
    }
  });

  it("accepts current screenshot artifact evidence only when files exist and hashes match", () => {
    const root = resolve(".");
    const reportDir = mkdtempSync(join(tmpdir(), "a3d-threejs-parity-report-audit-artifacts-current-"));
    try {
      const screenshotEvidence = writeCurrentScreenshotArtifacts(reportDir, "product-configurator");
      writeFileSync(join(reportDir, "product-configurator.json"), JSON.stringify({
        ...minimalRouteReport("product-configurator"),
        ...screenshotEvidence
      }, null, 2));

      const result = spawnSync("pnpm", [
        "exec",
        "tsx",
        "--tsconfig",
        "tsconfig.base.json",
        "tools/advanced-gallery-report-audit/index.ts",
        "--report-dir",
        reportDir
      ], {
        cwd: root,
        encoding: "utf8"
      });

      expect(result.status).toBe(1);
      const outputPath = join(reportDir, "reusable-systems-disclosure-audit.json");
      const audit = JSON.parse(readFileSync(outputPath, "utf8")) as AuditReport;
      const product = audit.routeAudits.find((route) => route.routeId === "product-configurator");
      expect(product?.telemetry?.hasCurrentScreenshotArtifacts).toBe(true);
      expect(product?.blockers.join("\n")).not.toContain("screenshot evidence hashes do not match current full, viewport, and hero artifacts on disk");
    } finally {
      rmSync(reportDir, { recursive: true, force: true });
    }
  });

  it("requires Data Galaxy structured CPU/static and generated support-asset evidence", () => {
    const root = resolve(".");
    const reportDir = mkdtempSync(join(tmpdir(), "a3d-threejs-parity-report-audit-data-evidence-"));
    try {
      const routeIds = [
        "water-lab",
        "ocean-observatory",
        "reactor-post",
        "smart-city",
        "data-galaxy",
        "product-configurator",
        "robotics-lab",
        "physics-playground",
        "fog-cathedral",
        "digital-twin"
      ];
      for (const routeId of routeIds) {
        writeFileSync(join(reportDir, `${routeId}.json`), JSON.stringify({
          ...minimalRouteReport(routeId),
          ...(routeId === "data-galaxy" ? { dataGalaxyEvidence: dataGalaxyStructuredEvidence() } : {})
        }, null, 2));
      }

      const result = spawnSync("pnpm", [
        "exec",
        "tsx",
        "--tsconfig",
        "tsconfig.base.json",
        "tools/advanced-gallery-report-audit/index.ts",
        "--report-dir",
        reportDir
      ], {
        cwd: root,
        encoding: "utf8"
      });

      expect(result.status).toBe(1);
      const outputPath = join(reportDir, "reusable-systems-disclosure-audit.json");
      const audit = JSON.parse(readFileSync(outputPath, "utf8")) as AuditReport;
      const data = audit.routeAudits.find((route) => route.routeId === "data-galaxy");
      expect(data?.specializedEvidence).toContain("dataGalaxyEvidence");
      expect(data?.blockers.join("\n")).not.toContain("data-galaxy lacks structured dataGalaxyEvidence");
      expect(data?.blockers.join("\n")).not.toContain("data-galaxy-core-blender active generated/support asset lacks structured runtime provenance disclosure");
    } finally {
      rmSync(reportDir, { recursive: true, force: true });
    }
  });

  it("blocks Data Galaxy structured evidence that treats generated no-texture authored GLB as focal proof", () => {
    const root = resolve(".");
    const reportDir = mkdtempSync(join(tmpdir(), "a3d-threejs-parity-report-audit-data-focal-"));
    try {
      const routeIds = [
        "water-lab",
        "ocean-observatory",
        "reactor-post",
        "smart-city",
        "data-galaxy",
        "product-configurator",
        "robotics-lab",
        "physics-playground",
        "fog-cathedral",
        "digital-twin"
      ];
      for (const routeId of routeIds) {
        const report = minimalRouteReport(routeId);
        writeFileSync(join(reportDir, `${routeId}.json`), JSON.stringify({
          ...report,
          ...(routeId === "data-galaxy" ? {
            authored: {
              status: "ready",
              assetIds: ["data-galaxy-core-blender", "texture-backed-data-core"],
              drawItems: 10,
              materialDiagnostics: [
                { assetId: "data-galaxy-core-blender", drawItems: 2, texturedDrawItems: 0 },
                { assetId: "texture-backed-data-core", drawItems: 8, texturedDrawItems: 8 }
              ]
            },
            dataGalaxyEvidence: {
              ...dataGalaxyStructuredEvidence({ generatedNoTextureAuthoredGlb: true }),
              focalHierarchy: {
                centralSubject: "texture-backed particles",
                primaryLayerRole: "particle system is primary",
                supportLayerRole: "secondary rings",
                authoredGlbRole: "generated/no-texture data-galaxy-core-blender is the focal hero proof"
              }
            }
          } : {})
        }, null, 2));
      }

      const result = spawnSync("pnpm", [
        "exec",
        "tsx",
        "--tsconfig",
        "tsconfig.base.json",
        "tools/advanced-gallery-report-audit/index.ts",
        "--report-dir",
        reportDir
      ], {
        cwd: root,
        encoding: "utf8"
      });

      expect(result.status).toBe(1);
      const outputPath = join(reportDir, "reusable-systems-disclosure-audit.json");
      const audit = JSON.parse(readFileSync(outputPath, "utf8")) as AuditReport;
      expect(audit.blockers.join("\n")).toContain("data-galaxy generated/no-texture authored GLB is described as focal or premium proof");
    } finally {
      rmSync(reportDir, { recursive: true, force: true });
    }
  });
});

function minimalRouteReport(routeId: string, evidenceMode: "full-gallery" | "focused-route" = "full-gallery"): Record<string, unknown> {
  return {
    schema: "a3d-threejs-parity-advanced-gallery-route-report",
    capturedAt: "2026-05-19T00:00:00.000Z",
    evidenceMode,
    evidenceScope: {
      mode: evidenceMode,
      routeId,
      expectedRouteCount: 10,
      fullGalleryRun: evidenceMode === "full-gallery",
      focusedRouteOnly: evidenceMode !== "full-gallery"
    },
    visualReviewStatus: "candidate",
    runtime: {
      status: "running",
      systems: ["system-a", "system-b", "system-c", "system-d", "system-e"],
      approximations: ["candidate route with unsupported parity claims explicitly blocked"],
      timings: {
        renderMs: 1,
        totalLoopMs: 2
      }
    },
    performanceEvidence: {
      source: "app-runtime-timings",
      measuredFields: ["runtime.timings.totalLoopMs", "runtime.timings.renderMs"],
      acceptanceUsesRafFrameMs: false
    },
    motion: {
      changedRatio: 0.01,
      meanDelta: 1
    },
    captureReadiness: {
      full: { frameCount: 2 },
      viewport: { frameCount: 2 },
      hero: { frameCount: 2 }
    },
    screenshots: {
      full: { path: `${routeId}.png`, sha256: "a".repeat(64), sizeBytes: 100_000 },
      viewport: { path: `${routeId}-viewport.png`, sha256: "b".repeat(64), sizeBytes: 100_000 },
      hero: { path: `${routeId}-hero.png`, sha256: "c".repeat(64), sizeBytes: 100_000 }
    },
    screenshotSha256: "d".repeat(64),
    viewportScreenshotSha256: "e".repeat(64),
    heroScreenshotSha256: "f".repeat(64),
    pngStats: {
      detailEdgeDensity: 0.05,
      localContrast: 0.2,
      uniqueColorBuckets: 500
    }
  };
}

function expectedRouteIdsForAuditTest(): readonly string[] {
  return [
    "water-lab",
    "ocean-observatory",
    "reactor-post",
    "smart-city",
    "data-galaxy",
    "product-configurator",
    "robotics-lab",
    "physics-playground",
    "fog-cathedral",
    "digital-twin"
  ];
}

function productAuthoredEvidence(options: {
  readonly includeMaterialControlBindings: boolean;
  readonly includeShaderInactiveTextureSlots?: boolean;
  readonly includeGeneratedSupportAssets?: boolean;
}): Record<string, unknown> {
  const withMaterialControl = (
    assetId: string,
    controlKey: string,
    selectedVariant: string,
    materialControlTargetCount: number,
    materialControlUniqueMaterialCount: number
  ): Record<string, unknown> => options.includeMaterialControlBindings
    ? {
        materialControlTargetCount,
        materialControlUniqueMaterialCount,
        materialControlSource: "GLTFRenderResources.materialVariants",
        materialControlSelectedVariant: selectedVariant,
        materialControlControlKey: controlKey
      }
    : {};
  const authored = {
    status: "ready",
    assetIds: ["chronograph-watch", "car-concept", "sunglasses-khronos", "materials-variants-shoe"],
    assets: ["Chronograph Watch", "Car Concept", "Sunglasses Khronos", "Materials Variants Shoe"],
    drawItems: 137,
    materialVariants: [
      { assetId: "chronograph-watch", selected: "Khronos Red", available: ["Khronos Red"] },
      { assetId: "car-concept", selected: "Carmine Candy", available: ["Carmine Candy"] },
      { assetId: "materials-variants-shoe", selected: "street", available: ["street"] }
    ],
    materialDiagnostics: [
      {
        assetId: "chronograph-watch",
        drawItems: 19,
        texturedDrawItems: 10,
        baseColorTextureDrawItems: 3,
        colorBearingTextureDrawItems: 3,
        surfaceDetailTextureDrawItems: 10,
        effectiveTextureBackedDrawItems: 10,
        textureCount: 3,
        fallbackWhiteDrawItems: 0,
        missingGeometryDrawItems: 0,
        missingMaterialDrawItems: 0,
        ...withMaterialControl("chronograph-watch", "watchVariant", "Khronos Red", 7, 6)
      },
      {
        assetId: "car-concept",
        drawItems: 109,
        texturedDrawItems: 101,
        baseColorTextureDrawItems: 9,
        colorBearingTextureDrawItems: 9,
        surfaceDetailTextureDrawItems: 101,
        effectiveTextureBackedDrawItems: 101,
        textureCount: 15,
        fallbackWhiteDrawItems: 0,
        missingGeometryDrawItems: 0,
        missingMaterialDrawItems: 0,
        ...(options.includeShaderInactiveTextureSlots ? {
          shaderInactiveTextureSlotDiagnostics: [{
            slot: "specular",
            drawItems: 3,
            materialNames: ["Paint 1 Carmine"],
            labels: ["car-concept:Body"]
          }]
        } : {}),
        ...withMaterialControl("car-concept", "carVariant", "Carmine Candy", 25, 3)
      },
      {
        assetId: "sunglasses-khronos",
        drawItems: 8,
        texturedDrawItems: 2,
        baseColorTextureDrawItems: 1,
        colorBearingTextureDrawItems: 1,
        surfaceDetailTextureDrawItems: 2,
        effectiveTextureBackedDrawItems: 2,
        textureCount: 1,
        fallbackWhiteDrawItems: 0,
        missingGeometryDrawItems: 0,
        missingMaterialDrawItems: 0
      },
      {
        assetId: "materials-variants-shoe",
        drawItems: 1,
        texturedDrawItems: 1,
        baseColorTextureDrawItems: 1,
        colorBearingTextureDrawItems: 1,
        surfaceDetailTextureDrawItems: 0,
        effectiveTextureBackedDrawItems: 1,
        textureCount: 1,
        fallbackWhiteDrawItems: 0,
        missingGeometryDrawItems: 0,
        missingMaterialDrawItems: 0,
        ...withMaterialControl("materials-variants-shoe", "shoeVariant", "street", 1, 1)
      }
    ]
  };
  if (!options.includeGeneratedSupportAssets) return authored;
  return {
    ...authored,
    assetIds: [
      "product-configurator-studio-blender",
      "product-configurator-car-batched",
      ...authored.assetIds
    ],
    assets: [
      "Authored Premium Product Configurator Studio",
      "Car Concept Batched",
      ...authored.assets
    ],
    drawItems: authored.drawItems + 334,
    materialDiagnostics: [
      {
        assetId: "product-configurator-studio-blender",
        drawItems: 229,
        texturedDrawItems: 0,
        fallbackWhiteDrawItems: 0,
        missingGeometryDrawItems: 0,
        missingMaterialDrawItems: 0
      },
      {
        assetId: "product-configurator-car-batched",
        drawItems: 105,
        texturedDrawItems: 97,
        baseColorTextureDrawItems: 8,
        colorBearingTextureDrawItems: 8,
        surfaceDetailTextureDrawItems: 97,
        effectiveTextureBackedDrawItems: 97,
        textureCount: 15,
        fallbackWhiteDrawItems: 0,
        missingGeometryDrawItems: 0,
        missingMaterialDrawItems: 0
      },
      ...authored.materialDiagnostics
    ]
  };
}

function dataGalaxyAuthoredEvidenceWithProvenance(): Record<string, unknown> {
  return {
    status: "ready",
    assetIds: ["data-galaxy-core-blender"],
    assets: ["Authored AI Data Galaxy Core"],
    drawItems: 148,
    assetProvenance: [{
      assetId: "data-galaxy-core-blender",
      assetTitle: "Authored AI Data Galaxy Core",
      routeUse: "data-galaxy",
      visualRole: "showcase environment",
      sourceKind: "generated-local-fixture",
      localUrl: "/fixtures/advanced-gallery/assets/data-galaxy-core-blender/data-galaxy-core-blender.glb",
      manifestPath: "fixtures/advanced-gallery/assets/data-galaxy-core-blender/manifest.json",
      sourceScript: "tools/advanced-gallery-assets/generate-data-galaxy-core-blender.py",
      generated: true,
      derivative: false,
      supportOnly: true,
      acceptableAsFocalHero: false,
      textureBacked: true,
      generatedNoTexture: false,
      semanticRoles: [
        "focal-core",
        "semantic-cluster",
        "signal-bead"
      ],
      supportScaffoldRoles: [],
      defaultExcludedRoles: [],
      textureBackedFocalMaterials: [
        "cyan neural emission",
        "violet model-state emission",
        "amber anomaly emission"
      ],
      knownLimitations: [
        "Generated texture-backed support-only authored GLB."
      ]
    }],
    materialDiagnostics: [{
      assetId: "data-galaxy-core-blender",
      drawItems: 148,
      texturedDrawItems: 3,
      fallbackWhiteDrawItems: 0,
      missingGeometryDrawItems: 0,
      missingMaterialDrawItems: 0
    }]
  };
}

function dataGalaxyStructuredEvidence(options: { readonly generatedNoTextureAuthoredGlb?: boolean } = {}): Record<string, unknown> {
  return {
    source: "dataGalaxyBudgets+dataGalaxyEvidence",
    routeId: "data-galaxy",
    updateMode: "static-geometry",
    gpuBackend: {
      supported: false,
      backend: "none",
      nativeGpuComputeDispatches: 0,
      claimBoundary: "This route reports CPU/static point-buffer animation only; it is not native GPGPU/WebGPU particle compute evidence."
    },
    budget: {
      requestedParticles: 4000,
      effectiveParticles: 4000,
      primaryCount: 1840,
      vortexCount: 1120,
      networkCount: 720,
      waveCount: 320
    },
    geometry: {
      pointCount: 34,
      pointDrawBatches: 4,
      lineSegmentCount: 60,
      lineDrawBatches: 8,
      drawBatches: 12
    },
    authoredAssetDisclosure: {
      activeGeneratedAssetIds: [],
      generatedSupportGlbActiveInHero: false,
      generatedNoTextureAuthoredGlb: options.generatedNoTextureAuthoredGlb ?? false,
      premiumTextureBackedAuthoredHero: false,
      supportOnlyUntilVisualReview: true
    },
    unsupportedGaps: ["No native GPU-compute particle solver is bound to this route."],
    integrationSteps: ["Do not mark GPU particles accepted unless a real compute-backed update path replaces this CPU/static point-buffer mode."]
  };
}

function writeCurrentScreenshotArtifacts(reportDir: string, routeId: string): Record<string, unknown> {
  const full = writeScreenshotArtifact(join(reportDir, `${routeId}.png`), "full");
  const viewport = writeScreenshotArtifact(join(reportDir, `${routeId}-viewport.png`), "viewport");
  const hero = writeScreenshotArtifact(join(reportDir, `${routeId}-hero.png`), "hero");
  return {
    screenshots: { full, viewport, hero },
    screenshotSha256: full.sha256,
    viewportScreenshotSha256: viewport.sha256,
    heroScreenshotSha256: hero.sha256
  };
}

function writeScreenshotArtifact(path: string, label: string): Record<string, unknown> {
  const content = Buffer.alloc(31_000, label);
  writeFileSync(path, content);
  return {
    path,
    sha256: createHash("sha256").update(content).digest("hex"),
    sizeBytes: content.length
  };
}
