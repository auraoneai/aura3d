import { describe, expect, it } from "vitest";
import {
  DATA_GALAXY_DEFAULT_PARTICLES,
  DATA_GALAXY_SHOWCASE_PARTICLES,
  DATA_GALAXY_STRESS_PARTICLES,
  createDataGalaxyBudgetPlan,
  createDataGalaxyCompositionProfile
} from "../../../apps/v9-advanced-examples-gallery/src/dataGalaxyBudgets";
import { createDataGalaxyEvidence, createDataGalaxyRuntimeEvidence } from "../../../apps/v9-advanced-examples-gallery/src/dataGalaxyEvidence";
import { getAuthoredAssetCandidate } from "../../../apps/v9-advanced-examples-gallery/src/authoredAssets";

describe("v9 data galaxy budgets", () => {
  it("keeps the active generated authored GLB catalogued as support-only provenance", () => {
    expect(getAuthoredAssetCandidate("data-galaxy-core-blender").provenance).toMatchObject({
      sourceKind: "generated-local-fixture",
      manifestPath: "fixtures/v9/assets/data-galaxy-core-blender/manifest.json",
      sourceScript: "tools/v9-advanced-gallery-assets/generate-data-galaxy-core-blender.py",
      generated: true,
      derivative: false,
      supportOnly: true,
      acceptableAsFocalHero: false,
      textureBacked: true,
      generatedNoTexture: false,
      semanticRoles: expect.arrayContaining(["focal-core", "semantic-cluster", "signal-bead"]),
      supportScaffoldRoles: [],
      defaultExcludedRoles: expect.arrayContaining(["focal-core", "support-scaffold", "debug-axis"]),
      textureBackedFocalMaterials: expect.arrayContaining(["cyan neural emission"])
    });
  });

  it("uses the route-owned 6k showcase tier as the default focal hierarchy path", () => {
    const plan = createDataGalaxyBudgetPlan({
      requestedParticles: DATA_GALAXY_DEFAULT_PARTICLES,
      connections: true
    });

    expect(DATA_GALAXY_DEFAULT_PARTICLES).toBe(DATA_GALAXY_SHOWCASE_PARTICLES);
    expect(plan.mode).toBe("showcase");
    expect(plan.requestedParticles).toBe(6000);
    expect(plan.effectiveParticles).toBe(6000);
    expect(plan.primaryCount + plan.vortexCount + plan.networkCount + plan.waveCount).toBe(6000);
    expect(plan.primaryCount).toBeGreaterThan(plan.vortexCount + plan.networkCount);
    expect(plan.densityTier).toBe("6k showcase");
    expect(plan.overlay.connectionSegments).toBeGreaterThan(0);
    expect(plan.nativeGpuComputeDispatches).toBe(0);

    const composition = createDataGalaxyCompositionProfile(plan);
    expect(composition.primary.scale[0]).toBeGreaterThan(composition.vortex.scale[0]);
    expect(composition.network.position[0]).toBeLessThan(0);
    expect(composition.wave.position[0]).toBeGreaterThan(0);
    expect(composition.boundsMax[0] - composition.boundsMin[0]).toBeLessThan(3.8);
    expect(composition.telemetryBars).toBe(false);
    expect(composition.evidenceLabelBudget).toBe(10);
  });

  it("keeps the explicit 4k route path available as low-noise interactive density mode", () => {
    const plan = createDataGalaxyBudgetPlan({
      requestedParticles: 4000,
      connections: true
    });

    expect(plan.mode).toBe("interactive");
    expect(plan.requestedParticles).toBe(4000);
    expect(plan.effectiveParticles).toBe(4000);
    expect(plan.primaryCount + plan.vortexCount + plan.networkCount + plan.waveCount).toBe(4000);
    expect(plan.primaryCount).toBe(3680);
    expect(plan.vortexCount).toBe(140);
    expect(plan.networkCount).toBe(120);
    expect(plan.waveCount).toBe(60);
    expect(plan.densityTier).toBe("4k interactive");
    expect(plan.overlay.connectionSegments).toBeGreaterThan(0);
    expect(plan.nativeGpuComputeDispatches).toBe(0);

    const composition = createDataGalaxyCompositionProfile(plan);
    expect(composition.primary.scale[0]).toBeGreaterThan(composition.vortex.scale[0]);
    expect(composition.telemetryBars).toBe(false);
    expect(composition.evidenceLabelBudget).toBe(9);
  });

  it("keeps the selectable 6k route path in showcase density mode", () => {
    const plan = createDataGalaxyBudgetPlan({
      requestedParticles: DATA_GALAXY_SHOWCASE_PARTICLES,
      connections: true
    });

    expect(plan.mode).toBe("showcase");
    expect(plan.requestedParticles).toBe(6000);
    expect(plan.effectiveParticles).toBe(6000);
    expect(plan.primaryCount + plan.vortexCount + plan.networkCount + plan.waveCount).toBe(6000);
    expect(plan.densityTier).toBe("6k showcase");
    expect(plan.overlay.sparkPoints + plan.overlay.coreSparkPoints + plan.overlay.focalClusterPoints).toBe(65);
    expect(plan.overlay.trailSegments + plan.overlay.connectionSegments + plan.overlay.contourSegments + plan.overlay.telemetryRingSegments + plan.overlay.budgetLadderSegments).toBe(25);
    expect(plan.overlay.connectionSegments).toBeGreaterThan(0);
    expect(plan.nativeGpuComputeDispatches).toBe(0);

    expect(createDataGalaxyCompositionProfile(plan).telemetryBars).toBe(false);
  });

  it("separates 24k and 50k requests into explicit stress mode", () => {
    const balancedStress = createDataGalaxyBudgetPlan({
      requestedParticles: DATA_GALAXY_STRESS_PARTICLES,
      connections: true
    });
    const maxStress = createDataGalaxyBudgetPlan({
      requestedParticles: 50000,
      connections: false
    });

    expect(balancedStress.mode).toBe("stress");
    expect(balancedStress.densityTier).toBe("24k stress");
    expect(balancedStress.overlay.connectionSegments).toBe(11);
    expect(maxStress.mode).toBe("stress");
    expect(maxStress.densityTier).toBe("50k stress");
    expect(maxStress.overlay.connectionSegments).toBe(0);
    expect(maxStress.effectiveParticles).toBe(50000);
  });

  it("sanitizes invalid and out-of-range particle requests without enabling GPU claims", () => {
    const invalid = createDataGalaxyBudgetPlan({
      requestedParticles: Number.NaN,
      connections: true
    });
    const belowMin = createDataGalaxyBudgetPlan({
      requestedParticles: 10,
      connections: true
    });
    const aboveMax = createDataGalaxyBudgetPlan({
      requestedParticles: 999999,
      connections: true
    });

    expect(invalid.effectiveParticles).toBe(DATA_GALAXY_DEFAULT_PARTICLES);
    expect(invalid.mode).toBe("showcase");
    expect(belowMin.effectiveParticles).toBe(4000);
    expect(aboveMax.effectiveParticles).toBe(50000);
    expect(invalid.nativeGpuComputeDispatches).toBe(0);
    expect(belowMin.nativeGpuComputeDispatches).toBe(0);
    expect(aboveMax.nativeGpuComputeDispatches).toBe(0);
  });

  it("emits structured runtime proof for CPU/static particles with generated GLB inactive in hero mode", () => {
    const geometryStats = {
      pointCount: 34,
      pointDrawBatches: 4,
      lineSegmentCount: 60,
      lineDrawBatches: 8,
      drawBatches: 12,
      trailSegmentCount: 18,
      connectionSegmentCount: 12,
      telemetryRingSegmentCount: 20
    };
    const options = {
      time: 1,
      requestedParticles: DATA_GALAXY_DEFAULT_PARTICLES,
      formation: "galaxy",
      speed: 1,
      turbulence: 0.7,
      connections: true,
      geometryStats
    };
    const evidence = createDataGalaxyEvidence(options);
    const runtimeEvidence = createDataGalaxyRuntimeEvidence(options, geometryStats, evidence);

    expect(runtimeEvidence).toMatchObject({
      source: "dataGalaxyBudgets+dataGalaxyEvidence",
      routeId: "data-galaxy",
      updateMode: "static-geometry",
      gpuBackend: {
        supported: false,
        backend: "none",
        nativeGpuComputeDispatches: 0
      },
      budget: {
        defaultShowcaseMode: true,
        requestedParticles: 6000,
        effectiveParticles: 6000,
        primaryCount: 5520,
        vortexCount: 211,
        networkCount: 180,
        waveCount: 89
      },
      focalHierarchy: {
        authoredGlbRole: "generated data-galaxy-core-blender is cataloged for support inspection but inactive in hero mode"
      },
      geometry: geometryStats,
      authoredAssetDisclosure: {
        activeGeneratedAssetIds: [],
        generatedSupportGlbActiveInHero: false,
        generatedNoTextureAuthoredGlb: false,
        premiumTextureBackedAuthoredHero: false,
        supportOnlyUntilVisualReview: true
      }
    });
    expect(runtimeEvidence.unsupportedGaps.join("\n")).toContain("No renderer-side particle solver");
    expect(runtimeEvidence.integrationSteps.join("\n")).toContain("Do not mark GPU particles accepted");
  });
});
