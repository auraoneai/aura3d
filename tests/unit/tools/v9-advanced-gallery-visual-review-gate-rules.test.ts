import { describe, expect, it } from "vitest";
import { acceptedMetadataBlockers, acceptedRuntimeEvidenceBlockers } from "../../../tools/v9-advanced-gallery-visual-review/gateRules";

const validAcceptedMetadata = {
  status: "accepted" as const,
  screenshot: "tests/reports/v9/advanced-examples-gallery/product-configurator.png",
  screenshotSha256: "a".repeat(64),
  reviewedBy: "human-reviewer",
  reviewedAt: "2026-05-20T00:00:00.000Z",
  notes: "Accepted against the comparable Three.js product configurator reference with bounded unsupported material limits documented.",
  knownGaps: ["Known limit: no scene-space refraction parity; transparent product material remains a bounded approximation."]
};

describe("V9 advanced gallery visual review gate rules", () => {
  it("blocks failed and candidate metadata before accepted review evidence is considered", () => {
    expect(acceptedMetadataBlockers({
      ...validAcceptedMetadata,
      status: "failed"
    })).toContain("Screenshot is marked failed, not accepted; smoke/runtime pass is not visual acceptance.");

    expect(acceptedMetadataBlockers({
      ...validAcceptedMetadata,
      status: "candidate"
    })).toContain("Screenshot is marked candidate, not accepted; smoke/runtime pass is not visual acceptance.");
  });

  it("requires accepted metadata to include reviewer, current screenshot hash, timestamp, comparison basis, and known-gap acknowledgement", () => {
    const blockers = acceptedMetadataBlockers({
      status: "accepted",
      screenshot: "tmp/product.png",
      screenshotSha256: "ABC",
      reviewedBy: "x",
      reviewedAt: "2026-05-20",
      notes: "Looks good.",
      knownGaps: ["Known limit: no full physical glass path."]
    });

    expect(blockers).toContain("Accepted review screenshot must live under tests/reports/v9/advanced-examples-gallery and be a PNG.");
    expect(blockers).toContain("Accepted review screenshotSha256 is not a lowercase SHA-256 hex digest.");
    expect(blockers).toContain("Accepted review reviewedBy is too short to identify a reviewer.");
    expect(blockers).toContain("Accepted review reviewedAt must be a valid ISO timestamp.");
    expect(blockers).toContain("Accepted review notes are too short to be a detailed human verdict.");
    expect(blockers).toContain("Accepted review notes must mention the comparison basis.");
    expect(blockers).toContain("Accepted review notes must explicitly acknowledge known gaps, unsupported boundaries, or scoped approximations.");
  });

  it("keeps accepted metadata blocked when notes still contain rejection or scaffold language", () => {
    expect(acceptedMetadataBlockers({
      ...validAcceptedMetadata,
      notes: "Accepted against a Three.js reference, but this candidate still contains scaffold content and is not accepted."
    })).toContain("Accepted review notes still contain rejection language.");
  });

  it("allows accepted metadata only when the review is detailed, scoped, and evidence-shaped", () => {
    expect(acceptedMetadataBlockers(validAcceptedMetadata)).toEqual([]);
  });

  it("blocks accepted runtime evidence with unhealthy capture cadence", () => {
    const blockers = acceptedRuntimeEvidenceBlockers({
      ...validAcceptedMetadata,
      demoId: "product-configurator",
      runtime: {
        fps: 4,
        frameMs: 250
      }
    });

    expect(blockers).toContain("product-configurator accepted review FPS cadence 4 is below the 12 FPS presentation floor.");
    expect(blockers).toContain("product-configurator accepted review frameMs cadence 250 exceeds the 12 FPS presentation ceiling.");
  });

  it("allows accepted runtime cadence to use measured loop/render work when RAF frameMs is explicitly non-acceptance evidence", () => {
    const blockers = acceptedRuntimeEvidenceBlockers({
      ...validAcceptedMetadata,
      demoId: "data-galaxy",
      runtime: {
        fps: 4,
        frameMs: 250
      },
      performanceEvidence: {
        acceptanceUsesRafFrameMs: false,
        loopMs: 17.7,
        renderMs: 14.8,
        budgetMs: 34,
        loopWithinBudget: true,
        renderWithinBudget: true
      }
    });

    expect(blockers).not.toContain("data-galaxy accepted review FPS cadence 4 is below the 12 FPS presentation floor.");
    expect(blockers).not.toContain("data-galaxy accepted review frameMs cadence 250 exceeds the 12 FPS presentation ceiling.");
  });

  it("blocks accepted runtime evidence when measured loop/render work is outside the presentation budget", () => {
    const blockers = acceptedRuntimeEvidenceBlockers({
      ...validAcceptedMetadata,
      demoId: "product-configurator",
      runtime: {
        fps: 24,
        frameMs: 40
      },
      performanceEvidence: {
        acceptanceUsesRafFrameMs: false,
        loopMs: 48,
        renderMs: 42,
        budgetMs: 34,
        loopWithinBudget: false,
        renderWithinBudget: false
      }
    });

    expect(blockers).toContain("product-configurator accepted review measured loop work 48ms is not within the 34ms presentation budget.");
    expect(blockers).toContain("product-configurator accepted review measured render work 42ms is not within the 34ms presentation budget.");
  });

  it("blocks accepted authored material evidence with fallback or missing resources", () => {
    const blockers = acceptedRuntimeEvidenceBlockers({
      ...validAcceptedMetadata,
      demoId: "product-configurator",
      runtime: { fps: 24, frameMs: 40 },
      authored: {
        drawItems: 12,
        materialDiagnostics: [
          {
            assetId: "car-concept",
            drawItems: 12,
            texturedDrawItems: 8,
            fallbackWhiteDrawItems: 1,
            missingGeometryDrawItems: 2,
            missingMaterialDrawItems: 3
          }
        ]
      }
    });

    expect(blockers).toContain("product-configurator accepted authored GLB evidence still has 1 fallback/default white material draw items.");
    expect(blockers).toContain("product-configurator accepted authored GLB evidence still has 2 missing geometry draw items.");
    expect(blockers).toContain("product-configurator accepted authored GLB evidence still has 3 missing material draw items.");
  });

  it("blocks accepted authored GLB evidence when material diagnostics are absent", () => {
    expect(acceptedRuntimeEvidenceBlockers({
      ...validAcceptedMetadata,
      demoId: "digital-twin",
      runtime: { fps: 24, frameMs: 40 },
      authored: {
        drawItems: 8,
        materialDiagnostics: []
      }
    })).toContain("digital-twin accepted authored GLB evidence has draw items but no material diagnostics.");
  });

  it("blocks accepted Product Configurator when support/scaffold draw items dominate", () => {
    const blockers = acceptedRuntimeEvidenceBlockers({
      ...validAcceptedMetadata,
      demoId: "product-configurator",
      runtime: { fps: 24, frameMs: 40 },
      authored: {
        drawItems: 100,
        assetIds: ["product-configurator-studio-blender", "car-concept"],
        materialDiagnostics: [
          { assetId: "product-configurator-studio-blender", drawItems: 52, texturedDrawItems: 0 },
          {
            assetId: "car-concept",
            drawItems: 48,
            texturedDrawItems: 48,
            colorBearingTextureDrawItems: 24,
            effectiveTextureBackedDrawItems: 48
          }
        ]
      }
    });

    expect(blockers).toContain("product-configurator accepted review has support/scaffold draw-item dominance (52/100); generated studio support cannot carry product acceptance.");
    expect(blockers).toContain("product-configurator accepted review has no-texture authored draw-item dominance (52/100); support/no-texture fixtures cannot carry product acceptance.");
  });

  it("blocks accepted Product Configurator when texture proof is broad-only", () => {
    const blockers = acceptedRuntimeEvidenceBlockers({
      ...validAcceptedMetadata,
      demoId: "product-configurator",
      runtime: { fps: 24, frameMs: 40 },
      authored: {
        drawItems: 48,
        assetIds: ["car-concept"],
        materialDiagnostics: [
          { assetId: "car-concept", drawItems: 48, texturedDrawItems: 48 }
        ]
      }
    });

    expect(blockers).toContain("product-configurator accepted review is missing effective texture-contribution diagnostics for non-studio product GLBs (car-concept); broad texturedDrawItems cannot carry acceptance.");
    expect(blockers).toContain("product-configurator accepted review has no effective texture-backed non-studio product material evidence; broad texture bindings cannot carry acceptance.");
    expect(blockers).toContain("product-configurator accepted review has no color-bearing texture contribution on non-studio product GLBs; scalar/detail-only texture bindings cannot carry acceptance.");
  });

  it("blocks accepted Data Galaxy when generated scaffold dominance lacks a support-only boundary", () => {
    const blockers = acceptedRuntimeEvidenceBlockers({
      ...validAcceptedMetadata,
      demoId: "data-galaxy",
      runtime: { fps: 24, frameMs: 40 },
      authored: {
        drawItems: 100,
        assetIds: ["data-galaxy-core-blender"],
        materialDiagnostics: [
          { assetId: "data-galaxy-core-blender", drawItems: 70, texturedDrawItems: 0 },
          {
            assetId: "texture-backed-data-core",
            drawItems: 30,
            texturedDrawItems: 30,
            colorBearingTextureDrawItems: 30,
            effectiveTextureBackedDrawItems: 30
          }
        ]
      },
      dataGalaxyEvidence: {
        updateMode: "static-geometry",
        gpuBackend: { supported: false, backend: "none", nativeGpuComputeDispatches: 0 },
        authoredAssetDisclosure: {
          activeGeneratedAssetIds: ["data-galaxy-core-blender"],
          generatedNoTextureAuthoredGlb: true,
          premiumTextureBackedAuthoredHero: false,
          supportOnlyUntilVisualReview: true
        }
      }
    });

    expect(blockers).toContain("data-galaxy accepted review has generated/scaffold authored draw-item dominance (70/100) without a procedural/support-only acceptance boundary.");
    expect(blockers).toContain("data-galaxy accepted review has generated/support authored draw-item dominance (70/100); support-only authored GLBs must stay subordinate to particle/data-system proof.");
    expect(blockers).toContain("data-galaxy accepted review uses generated/no-texture authored GLB evidence without explicitly accepting it as support-only procedural context.");
  });

  it("blocks accepted Data Galaxy when generated no-texture authored GLB is treated as focal proof", () => {
    const blockers = acceptedRuntimeEvidenceBlockers({
      ...validAcceptedMetadata,
      demoId: "data-galaxy",
      notes: "Accepted against a comparable Three.js particle reference with bounded unsupported CPU/static limits and support-only generated context.",
      runtime: { fps: 24, frameMs: 40 },
      authored: {
        drawItems: 10,
        assetIds: ["data-galaxy-core-blender"],
        materialDiagnostics: [
          { assetId: "data-galaxy-core-blender", drawItems: 2, texturedDrawItems: 0 },
          {
            assetId: "texture-backed-data-core",
            drawItems: 8,
            texturedDrawItems: 8,
            colorBearingTextureDrawItems: 8,
            effectiveTextureBackedDrawItems: 8
          }
        ]
      },
      dataGalaxyEvidence: {
        updateMode: "static-geometry",
        gpuBackend: { supported: false, backend: "none", nativeGpuComputeDispatches: 0 },
        focalHierarchy: {
          authoredGlbRole: "generated/no-texture data-galaxy-core-blender is the primary focal hero proof"
        },
        authoredAssetDisclosure: {
          activeGeneratedAssetIds: ["data-galaxy-core-blender"],
          generatedNoTextureAuthoredGlb: true,
          premiumTextureBackedAuthoredHero: false,
          supportOnlyUntilVisualReview: true
        }
      }
    });

    expect(blockers).toContain("data-galaxy accepted review uses generated/no-texture authored GLB as focal or premium proof; current disclosure only allows support-only context.");
  });

  it("blocks accepted Data Galaxy when generated texture-backed support GLB dominates the authored proof", () => {
    const blockers = acceptedRuntimeEvidenceBlockers({
      ...validAcceptedMetadata,
      demoId: "data-galaxy",
      notes: "Accepted against a comparable Three.js particle reference with bounded unsupported CPU/static limits and generated support-only procedural context.",
      runtime: { fps: 24, frameMs: 40 },
      authored: {
        drawItems: 100,
        assetIds: ["data-galaxy-core-blender"],
        materialDiagnostics: [
          { assetId: "data-galaxy-core-blender", drawItems: 70, texturedDrawItems: 3, effectiveTextureBackedDrawItems: 3 },
          {
            assetId: "texture-backed-data-core",
            drawItems: 30,
            texturedDrawItems: 30,
            colorBearingTextureDrawItems: 30,
            effectiveTextureBackedDrawItems: 30
          }
        ]
      },
      dataGalaxyEvidence: {
        updateMode: "static-geometry",
        gpuBackend: { supported: false, backend: "none", nativeGpuComputeDispatches: 0 },
        focalHierarchy: {
          authoredGlbRole: "generated texture-backed data-galaxy-core-blender remains disclosed support-only content"
        },
        authoredAssetDisclosure: {
          activeGeneratedAssetIds: ["data-galaxy-core-blender"],
          generatedNoTextureAuthoredGlb: false,
          premiumTextureBackedAuthoredHero: false,
          supportOnlyUntilVisualReview: true
        }
      }
    });

    expect(blockers).toContain("data-galaxy accepted review has generated/support authored draw-item dominance (70/100); support-only authored GLBs must stay subordinate to particle/data-system proof.");
    expect(blockers).toContain("data-galaxy accepted review has generated support GLB dominance (70/100) while only 3 draw items have effective texture contribution.");
    expect(blockers.join("\n")).not.toContain("generated/no-texture authored GLB as focal");
  });

  it("blocks accepted Data Galaxy when generated support GLB has broad texture bindings but no effective contribution", () => {
    const blockers = acceptedRuntimeEvidenceBlockers({
      ...validAcceptedMetadata,
      demoId: "data-galaxy",
      notes: "Accepted against a comparable Three.js particle reference with bounded unsupported CPU/static limits and generated support-only procedural context.",
      runtime: { fps: 24, frameMs: 40 },
      authored: {
        drawItems: 100,
        assetIds: ["data-galaxy-core-blender"],
        materialDiagnostics: [
          { assetId: "data-galaxy-core-blender", drawItems: 70, texturedDrawItems: 3 },
          {
            assetId: "texture-backed-data-core",
            drawItems: 30,
            texturedDrawItems: 30,
            colorBearingTextureDrawItems: 30,
            effectiveTextureBackedDrawItems: 30
          }
        ]
      },
      dataGalaxyEvidence: {
        updateMode: "static-geometry",
        gpuBackend: { supported: false, backend: "none", nativeGpuComputeDispatches: 0 },
        authoredAssetDisclosure: {
          activeGeneratedAssetIds: ["data-galaxy-core-blender"],
          generatedNoTextureAuthoredGlb: false,
          premiumTextureBackedAuthoredHero: false,
          supportOnlyUntilVisualReview: true
        }
      }
    });

    expect(blockers).toContain("data-galaxy accepted review has generated authored GLB broad texture bindings (3 draw items) but zero effective texture-contribution draw items.");
    expect(blockers).toContain("data-galaxy accepted review has generated support GLB dominance (70/100) while only 0 draw items have effective texture contribution.");
  });

  it("blocks accepted crop and stage-edge artifact risk", () => {
    const blockers = acceptedRuntimeEvidenceBlockers({
      ...validAcceptedMetadata,
      demoId: "fog-cathedral",
      notes: "Accepted against a comparable Three.js reference with bounded unsupported fog limits, but crop boundary risk remains near the frame edge.",
      runtime: { fps: 24, frameMs: 40 },
      pngStats: {
        foregroundBoundsCoverage: 0.991
      }
    });

    expect(blockers).toContain("fog-cathedral accepted review metadata still mentions crop, clipping, boundary, or stage-edge artifact risk.");
    expect(blockers).toContain("fog-cathedral accepted screenshot foregroundBoundsCoverage 0.991 is pinned to the frame while crop/boundary risk is documented.");
  });

  it("blocks Product/Data accepted status when current visual-quality metrics are below the premium floor", () => {
    const productBlockers = acceptedRuntimeEvidenceBlockers({
      ...validAcceptedMetadata,
      demoId: "product-configurator",
      runtime: { fps: 24, frameMs: 40 },
      pngStats: {
        detailEdgeDensity: 0.008396,
        localContrast: 20.817365
      }
    });

    expect(productBlockers).toContain("product-configurator accepted screenshot localContrast 20.817365 is below the 35 premium visual floor.");
    expect(productBlockers).toContain("product-configurator accepted screenshot detailEdgeDensity 0.008396 is below the 0.028 product material/detail floor.");
    expect(acceptedRuntimeEvidenceBlockers({
      ...validAcceptedMetadata,
      demoId: "product-configurator",
      runtime: { fps: 24, frameMs: 40 },
      pngStats: {
        detailEdgeDensity: 0.034286,
        localContrast: 32.850988
      }
    })).toContain("product-configurator accepted screenshot localContrast 32.850988 is below the 35 premium visual floor.");

    expect(acceptedRuntimeEvidenceBlockers({
      ...validAcceptedMetadata,
      demoId: "data-galaxy",
      runtime: { fps: 24, frameMs: 40 },
      pngStats: {
        localContrast: 31.041188
      }
    })).toContain("data-galaxy accepted screenshot localContrast 31.041188 is below the 35 premium visual floor.");
  });

  it("blocks generated asset and GPU particle overclaim", () => {
    const blockers = acceptedRuntimeEvidenceBlockers({
      ...validAcceptedMetadata,
      demoId: "data-galaxy",
      notes: "Accepted against a comparable Three.js GPGPU particle reference with native GPU compute parity.",
      knownGaps: ["Known limit: route keeps bounded unsupported non-textured generated data fixture context."],
      runtime: {
        fps: 24,
        frameMs: 40,
        approximations: ["CPU/static particles with 0 native GPU compute dispatches"]
      },
      authored: {
        assetIds: ["data-galaxy-core-blender"],
        drawItems: 0,
        materialDiagnostics: []
      },
      dataGalaxyEvidence: {
        updateMode: "static-geometry",
        gpuBackend: { supported: false, backend: "none", nativeGpuComputeDispatches: 0 },
        authoredAssetDisclosure: {
          activeGeneratedAssetIds: ["data-galaxy-core-blender"],
          generatedNoTextureAuthoredGlb: true,
          premiumTextureBackedAuthoredHero: false,
          supportOnlyUntilVisualReview: true
        }
      }
    });

    expect(blockers).toContain("data-galaxy accepted review claims GPU/GPGPU particle capability while runtime evidence reports CPU/static particles and 0 native GPU compute dispatches.");
  });
});
