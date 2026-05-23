import { describe, expect, it } from "vitest";
import { PBRMaterial } from "../../../packages/rendering/src";
import { buildDataGalaxyScene } from "../../../apps/v9-advanced-examples-gallery/src/dataGalaxyScene";
import { buildProductConfiguratorScene } from "../../../apps/v9-advanced-examples-gallery/src/productConfiguratorScene";
import { buildReactorPostScene } from "../../../apps/v9-advanced-examples-gallery/src/reactorPostScene";
import { createResources, type GalleryState } from "../../../apps/v9-advanced-examples-gallery/src/sceneBuilders";

describe("v9 route-owned scene modules", () => {
  it("builds the product configurator scene through its route-owned module", () => {
    const frame = buildProductConfiguratorScene(createResources(), 1.25, state({
      explode: true,
      turntable: true,
      finish: "copper",
      focusPart: "sensor",
      lighting: "inspection"
    }));

    expect(frame.animatedSystems).toContain("texture-backed concept vehicle hero");
    expect(frame.animatedSystems).toContain("reusable indoor studio stage");
    expect(frame.animatedSystems).toContain("reusable product-detail LightingRig");
    expect(frame.animatedSystems).toContain("environment stage shell");
    expect(frame.animatedSystems).toContain("car-concept turntable enabled");
    expect(frame.animatedSystems).toContain("route-owned studio inspection rails around original car hero");
    expect(frame.approximations.some((entry) => entry.includes("original texture-backed car-concept GLB as the visual subject"))).toBe(true);
    expect(frame.labels).toContain("KHR variants");
    expect(frame.labels).toContain("LightingRig product-detail");
    expect(frame.labels).toContain("Car-only studio inspection rails");
    expect(frame.labels).toContain("Material swatches");
    expect(frame.lights.map((light) => light.source.name)).toEqual([
      "product-detail-key",
      "product-detail-cool-edge",
      "product-detail-warm-edge",
      "product-detail-fill"
    ]);
    expect(frame.approximations.join(" ")).toMatch(/true area lights/i);
    expect(frame.items.some((item) => item.label === "overhead product strip light")).toBe(false);
    expect(frame.items.some((item) => item.label === "studio reflection streak")).toBe(false);
    expect(frame.items.some((item) => item.label === "indoor-studio floor/catch plane")).toBe(true);
    const floor = frame.items.find((item) => item.label === "indoor-studio floor/catch plane");
    const wall = frame.items.find((item) => item.label === "indoor-studio rear infinity wall");
    expect((floor?.material as PBRMaterial | undefined)?.getParameter("u_baseColor")).toEqual([0.00132, 0.00176, 0.00264, 1]);
    expect(wall).toBeUndefined();
    expect(frame.bounds).toEqual({ min: [-1.56, -1.04, -1.02], max: [1.56, 0.72, 1.16] });
    expect(frame.items.some((item) => item.label === "product studio floor inspection rail")).toBe(true);
    expect(frame.items.some((item) => item.label === "product studio vertical softbox meter")).toBe(true);
    expect(frame.items.some((item) => item.label === "car material swatch control chip")).toBe(true);
    expect(frame.items.filter((item) => item.label === "product turntable tick")).toHaveLength(0);
    expect(frame.items.some((item) => item.label === "main chassis")).toBe(false);
    expect(frame.items.some((item) => item.label === "hotspot")).toBe(false);
    const bloom = frame.postprocess && typeof frame.postprocess.bloom === "object" ? frame.postprocess.bloom : undefined;
    expect(bloom?.intensity).toBe(0.24);
    expect(frame.objectCount).toBe(frame.items.length);
  });

  it("builds the data galaxy scene through its route-owned module with bounded CPU mode evidence", () => {
    const resources = createResources();
    const frame = buildDataGalaxyScene(resources, 2.5, state({
      formation: "galaxy",
      speed: 1,
      turbulence: 0.7,
      connections: true
    }));

    expect(frame.animatedSystems).toContain("reusable deep-space environment stage");
    expect(frame.animatedSystems).toContain("environment stage shell disabled");
    expect(frame.animatedSystems).toContain("route-owned focal data hierarchy");
    expect(frame.animatedSystems).toContain("DataGalaxyFocalSystem central data core");
    expect(frame.animatedSystems).toContain("DataGalaxyFocalSystem transparent data shell");
    expect(frame.animatedSystems).toContain("DataGalaxyFocalSystem layered orbit arcs");
    expect(frame.animatedSystems).toContain("DataGalaxyFocalSystem clustered node lattice");
    expect(frame.animatedSystems).toContain("DataGalaxyFocalSystem organic orbit streams and halo nodes");
    expect(frame.animatedSystems).toContain("default showcase CPU/static density");
    expect(frame.animatedSystems).toContain("separated CPU point-cloud layers");
    expect(frame.approximations.some((entry) => entry.includes("renderer-side compute dispatch count"))).toBe(true);
    expect(frame.approximations.some((entry) => entry.includes("cached overlay vertex-buffer draws"))).toBe(true);
    expect(frame.approximations.some((entry) => entry.includes("bright CPU/static data nucleus"))).toBe(true);
    expect(frame.approximations.some((entry) => entry.includes("DataGalaxyFocalSystem is route-owned CPU/static focal geometry"))).toBe(true);
    expect(frame.approximations.some((entry) => entry.includes("no cuboid scaffold, grid panel, debug axis, or object-count filler"))).toBe(true);
    expect(frame.approximations.some((entry) => entry.includes("generated Data Galaxy GLB is cataloged but inactive in hero mode"))).toBe(true);
    expect(frame.labels).toContain("Mode showcase");
    expect(frame.labels).toContain("Default showcase");
    expect(frame.labels).toContain("DataGalaxyFocalSystem");
    expect(frame.labels).toContain("Central nucleus");
    expect(frame.labels).toContain("Layered arcs");
    expect(frame.labels).toContain("Spherical clusters");
    expect(frame.labels).toContain("Curved streams");
    expect(frame.labels).toHaveLength(10);
    expect(frame.items.some((item) => item.label === "primary particle cloud")).toBe(true);
    expect(frame.items.some((item) => item.label === "bright central inference nucleus")).toBe(true);
    expect(frame.items.some((item) => item.label === "foreground focal data cluster anchor")).toBe(true);
    expect(frame.items.some((item) => item.label === "warm secondary attractor cluster anchor")).toBe(true);
    expect(frame.items.some((item) => item.label === "focal inference orbit bar")).toBe(false);
    expect(frame.items.some((item) => item.label === "focal attractor orbit bar")).toBe(false);
    expect(frame.items.some((item) => item.label === "foreground data-system contour chord")).toBe(false);
    expect(frame.items.some((item) => item.label === "central data-system vertical spine")).toBe(false);
    expect(frame.items.some((item) => String(item.label).includes("tick"))).toBe(false);
    expect(frame.items.some((item) => String(item.label).includes("panel"))).toBe(false);
    expect(frame.items.some((item) => /depth-rail|DataGalaxyFocalSystem .*rail/i.test(String(item.label)))).toBe(false);
    expect(frame.items.some((item) => String(item.label).includes("facet-rib"))).toBe(false);
    expect(frame.items.some((item) => item.label === "intentional core orbit arcs")).toBe(true);
    expect(frame.items.some((item) => item.label === "short intentional cluster transfer links")).toBe(true);
    expect(frame.items.some((item) => item.label === "DataGalaxyFocalSystem luminous data nucleus")).toBe(true);
    expect(frame.items.some((item) => item.label === "DataGalaxyFocalSystem transparent data shell")).toBe(true);
    expect(frame.items.some((item) => item.label === "DataGalaxyFocalSystem layered core-orbit")).toBe(true);
    expect(frame.items.some((item) => item.label === "DataGalaxyFocalSystem cyan-halo-nodes")).toBe(true);
    expect(frame.items.some((item) => item.label === "DataGalaxyFocalSystem curved-transfer-streams")).toBe(true);
    expect(frame.items.some((item) => item.label === "DataGalaxyFocalSystem organic foreground-cyan-stream")).toBe(true);
    expect(frame.items.some((item) => item.label === "DataGalaxyFocalSystem cyan-clustered-data-nodes")).toBe(true);
    expect(frame.items.some((item) => item.label === "semantic data node")).toBe(false);
    const focalItems = frame.items.filter((item) => String(item.label).startsWith("DataGalaxyFocalSystem"));
    const focalInstances = focalItems.reduce((sum, item) => sum + ((item.instanceTransforms?.length ?? 0) / 16), 0);
    expect(focalItems.length).toBeGreaterThanOrEqual(12);
    expect(focalInstances).toBeGreaterThanOrEqual(118);
    expect(frame.objectCount).toBeGreaterThanOrEqual(150);
    expect(frame.items.some((item) => item.label === "particle batch telemetry bar")).toBe(false);
    expect(frame.items.some((item) => item.label === "animated attractor solid")).toBe(false);
    expect(frame.items.some((item) => item.label === "batched attractor field vectors")).toBe(false);
    expect(frame.items.some((item) => item.label === "batched telemetry latitude rings")).toBe(false);
    expect(frame.items.some((item) => item.label === "particle-count budget ladder")).toBe(false);
    expect(frame.dataGalaxyEvidence?.budget.defaultShowcaseMode).toBe(true);
    expect(frame.dataGalaxyEvidence?.budget.effectiveParticles).toBe(6000);
    expect(frame.dataGalaxyEvidence?.geometry.telemetryRingSegmentCount).toBe(0);
    expect(frame.dataGalaxyEvidence?.gpuBackend.nativeGpuComputeDispatches).toBe(0);
    expect(frame.dataGalaxyEvidence?.authoredAssetDisclosure.activeGeneratedAssetIds).toEqual([]);
    expect(frame.dataGalaxyEvidence?.authoredAssetDisclosure.generatedSupportGlbActiveInHero).toBe(false);
    expect(frame.dataGalaxyEvidence?.authoredAssetDisclosure.generatedNoTextureAuthoredGlb).toBe(false);

    const firstOverlay = frame.items.find((item) => item.label === "batched cyan inference spark points")?.geometry;
    const firstTrail = frame.items.find((item) => item.label === "intentional core orbit arcs")?.geometry;
    const firstFocalArc = frame.items.find((item) => item.label === "DataGalaxyFocalSystem layered core-orbit")?.geometry;
    const firstStarField = frame.items.find((item) => item.label === "deep space reusable star field");
    const nextFrame = buildDataGalaxyScene(resources, 2.75, state({
      formation: "galaxy",
      speed: 1,
      turbulence: 0.7,
      connections: true
    }));
    expect(nextFrame.items.find((item) => item.label === "batched cyan inference spark points")?.geometry).toBe(firstOverlay);
    expect(nextFrame.items.find((item) => item.label === "intentional core orbit arcs")?.geometry).toBe(firstTrail);
    expect(nextFrame.items.find((item) => item.label === "DataGalaxyFocalSystem layered core-orbit")?.geometry).toBe(firstFocalArc);
    const nextStarField = nextFrame.items.find((item) => item.label === "deep space reusable star field");
    expect(nextStarField?.geometry).toBe(firstStarField?.geometry);
    expect(nextStarField?.material).toBe(firstStarField?.material);
    expect(nextFrame.approximations.some((entry) => entry.includes("Deep-space environment stage geometry/material resources are cached"))).toBe(true);
  });

  it("builds reactor post through its route-owned module with bounded postprocess claims", () => {
    const frame = buildReactorPostScene(createResources(), 3.2, state({
      bloom: false,
      debug: false,
      paused: false,
      grade: "teal",
      vignette: 0.28
    }));

    expect(frame.animatedSystems).toContain("reactor core");
    expect(frame.animatedSystems).toContain("tone-map/color-grade/fxaa stack");
    expect(frame.animatedSystems).toContain("bounded bloom toggle");
    expect(frame.approximations.join(" ")).toContain("bloom remains opt-in");
    expect(frame.approximations.join(" ")).toContain("Depth-of-field and motion blur are not enabled");
    expect(frame.labels).toEqual(["Core", "Raw input", "Post stack", "Tone map", "Color grade", "FXAA", "Bloom opt-in"]);
    expect(frame.items.some((item) => item.label === "reactor core")).toBe(true);
    expect(frame.items.some((item) => item.label === "reactor purposeful floor etch batch")).toBe(true);
    expect(frame.items.some((item) => item.label === "reactor postprocess evidence line batch")).toBe(true);
    expect(frame.items.some((item) => item.label === "high-contrast command wall status strip")).toBe(false);
    expect(frame.postprocess && typeof frame.postprocess.bloom === "object" ? frame.postprocess.bloom : false).toBe(false);
  });
});

function state(controls: GalleryState["controls"]): GalleryState {
  return {
    controls,
    ripples: [],
    selected: "overview",
    cameraPreset: "hero",
    pointer: { x: 0.5, y: 0.5 },
    pulse: 0
  };
}
