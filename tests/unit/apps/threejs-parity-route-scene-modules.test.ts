import { describe, expect, it } from "vitest";
import { DEMOS } from "../../../apps/advanced-examples-gallery/src/metadata";
import { buildDataGalaxyScene } from "../../../apps/advanced-examples-gallery/src/dataGalaxyScene";
import { buildProductConfiguratorScene } from "../../../apps/advanced-examples-gallery/src/productConfiguratorScene";
import { buildReactorPostScene } from "../../../apps/advanced-examples-gallery/src/reactorPostScene";
import { buildScene, createResources, type GalleryState } from "../../../apps/advanced-examples-gallery/src/sceneBuilders";

describe("threejsParity route-owned scene modules", () => {
  it("builds the product configurator scene through its route-owned module", () => {
    const frame = buildProductConfiguratorScene(createResources(), 1.25, state({
      explode: true,
      turntable: true,
      finish: "copper",
      focusPart: "sensor",
      lighting: "studio"
    }));

    expect(frame.animatedSystems).toContain("texture-backed concept vehicle hero");
    expect(frame.animatedSystems).toContain("reusable indoor studio stage");
    expect(frame.animatedSystems).toContain("bounded production-runtime-product-studio showroom lighting");
    expect(frame.animatedSystems).toContain("environment stage shell");
    expect(frame.animatedSystems).toContain("ground grid disabled");
    expect(frame.animatedSystems).toContain("stage accent panels disabled");
    expect(frame.animatedSystems).toContain("contact grounding helper");
    expect(frame.animatedSystems).toContain("car-concept turntable enabled");
    expect(frame.animatedSystems).toContain("route-owned car-only showroom staging around original car hero");
    expect(frame.animatedSystems).toContain("route-owned car paint lighting uses a bounded product-shot rig for red body-paint shape");
    expect(frame.animatedSystems).toContain("route-owned car paint lighting limits cool rim energy around roof, glass, trim, and side panels");
    expect(frame.animatedSystems).toContain("route-owned car paint environment suppresses blue-gray specular halo");
    expect(frame.animatedSystems).toContain("route-owned Product proof uses original car plus controlled configurator platform etch and material swatch tray");
    expect(frame.animatedSystems).toContain("route-owned compact material selector panel");
    expect(frame.approximations.some((entry) => entry.includes("original texture-backed car-concept GLB as the visual subject"))).toBe(true);
    expect(frame.approximations.some((entry) => entry.includes("route-owned product-shot/product-detail lighting rig"))).toBe(true);
    expect(frame.approximations.some((entry) => entry.includes("bounded direct key/fill/rim energy"))).toBe(true);
    expect(frame.approximations.some((entry) => entry.includes("blue-gray product environment creates pale Fresnel shading"))).toBe(true);
    expect(frame.approximations.some((entry) => entry.includes("fine configurator platform etch"))).toBe(true);
    expect(frame.labels).toContain("KHR variants");
    expect(frame.labels).toContain("Product lighting production-runtime-product-studio");
    expect(frame.labels).toContain("Car-only showroom staging");
    expect(frame.labels).toContain("Material controls");
    expect(frame.labels).toContain("Precision platform etch");
    expect(frame.labels).toContain("Material swatch tray");
    expect(frame.labels).toContain("Visible material selector");
    const productKey = frame.lights.find((light) => light.source.name === "product-key");
    const fill = frame.lights.find((light) => light.source.name === "product-fill");
    const rim = frame.lights.find((light) => light.source.name === "product-rim");
    expect(frame.lights.map((light) => light.source.name)).toEqual([
      "a3d-production-runtime-product-key-shadow",
      "a3d-production-runtime-product-fill",
      "a3d-production-runtime-product-rim"
    ]);
    const productionRuntimeProductKey = frame.lights.find((light) => light.source.name === "a3d-production-runtime-product-key-shadow");
    const productionRuntimeFill = frame.lights.find((light) => light.source.name === "a3d-production-runtime-product-fill");
    const productionRuntimeRim = frame.lights.find((light) => light.source.name === "a3d-production-runtime-product-rim");
    expect(productKey).toBeUndefined();
    expect(fill).toBeUndefined();
    expect(rim).toBeUndefined();
    expect(productionRuntimeProductKey?.color).toEqual([1, 0.95, 0.86]);
    expect(productionRuntimeProductKey?.intensity).toBe(2.75);
    expect(productionRuntimeFill?.color).toEqual([0.55, 0.68, 1]);
    expect(productionRuntimeFill?.intensity).toBe(0.48);
    expect(productionRuntimeRim?.color).toEqual([1, 0.82, 0.55]);
    expect(productionRuntimeRim?.intensity).toBe(1.05);
    expect(frame.environment.color).toEqual([0.074, 0.071, 0.067]);
    expect(frame.environment.intensity).toBe(0.88);
    expect(frame.environment.proceduralMap.specularColor).toEqual([0.105, 0.093, 0.082]);
    expect(frame.environment.proceduralMap.specularIntensity).toBe(0.105);
    expect(frame.approximations.join(" ")).toMatch(/true area lights/i);
    expect(frame.items.some((item) => item.label === "overhead product strip light")).toBe(false);
    expect(frame.items.some((item) => item.label === "studio reflection streak")).toBe(false);
    expect(frame.items.some((item) => item.label === "indoor-studio floor/catch plane")).toBe(true);
    const floor = frame.items.find((item) => item.label === "indoor-studio floor/catch plane");
    const wall = frame.items.find((item) => item.label === "indoor-studio rear infinity wall");
    expect(floor).toBeDefined();
    expect(wall).toBeUndefined();
    expect(frame.items.filter((item) => String(item.label).startsWith("indoor-studio product grounding contact shadow layer"))).toHaveLength(3);
    expect(frame.bounds).toEqual({ min: [-1.82, -0.96, -0.94], max: [1.82, 0.68, 0.96] });
    expect(frame.items.some((item) => item.label === "product studio floor contour rail")).toBe(false);
    expect(frame.items.some((item) => item.label === "product studio graphite reflection platform")).toBe(false);
    expect(frame.items.some((item) => item.label === "product studio seamless rear cove")).toBe(false);
    expect(frame.items.some((item) => item.label === "product studio softbox reflection strip")).toBe(false);
    expect(frame.items.some((item) => item.label === "car material low showroom chip")).toBe(false);
    expect(frame.items.some((item) => item.label === "indoor-studio ground grid")).toBe(false);
    expect(frame.items.filter((item) => item.label === "product configurator precision platform etch")).toHaveLength(1);
    expect(frame.items.filter((item) => item.label === "product configurator precision platform perimeter")).toHaveLength(1);
    expect(frame.items.filter((item) => item.label === "product configurator material swatch chip")).toHaveLength(7);
    expect(frame.items.filter((item) => item.label === "product configurator material selector backplate")).toHaveLength(1);
    expect(frame.items.filter((item) => item.label === "product configurator material selector swatch")).toHaveLength(10);
    expect(frame.items.filter((item) => item.label === "product configurator material selector value rail")).toHaveLength(11);
    expect(frame.items.filter((item) => item.label === "product configurator material selector response meter")).toHaveLength(6);
    expect(frame.items.filter((item) => item.label === "product configurator imported part callout lines")).toHaveLength(0);
    expect(frame.items.filter((item) => item.label === "product configurator imported part status chip")).toHaveLength(0);
    expect(frame.items.filter((item) => item.label === "product configurator imported part value bar")).toHaveLength(0);
    expect(frame.items.filter((item) => String(item.label).startsWith("product configurator clean showroom grounding contact shadow layer"))).toHaveLength(0);
    expect(frame.items.some((item) => item.label === "product studio luminous floor grid")).toBe(false);
    expect(frame.items.some((item) => item.label === "product studio luminous floor inlay")).toBe(false);
    expect(frame.items.some((item) => item.label === "product studio vertical softbox meter")).toBe(false);
    expect(frame.items.filter((item) => item.label === "product turntable tick")).toHaveLength(0);
    expect(frame.items.some((item) => item.label === "main chassis")).toBe(false);
    expect(frame.items.some((item) => item.label === "hotspot")).toBe(false);
    expect(frame.postprocess).toBe(false);
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
    expect(focalInstances).toBeGreaterThanOrEqual(100);
    expect(frame.objectCount).toBeGreaterThanOrEqual(150);
    expect(frame.items.some((item) => item.label === "particle batch telemetry bar")).toBe(false);
    expect(frame.items.some((item) => item.label === "animated attractor solid")).toBe(false);
    expect(frame.items.some((item) => item.label === "batched attractor field vectors")).toBe(false);
    expect(frame.items.some((item) => item.label === "batched telemetry latitude rings")).toBe(false);
    expect(frame.items.some((item) => item.label === "particle-count budget ladder")).toBe(false);
    expect(frame.dataGalaxyEvidence?.budget.defaultShowcaseMode).toBe(true);
    expect(frame.dataGalaxyEvidence?.budget.effectiveParticles).toBe(900);
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

  it("makes Product, City, Digital Twin, and Robotics controls visibly change route state", () => {
    const resources = createResources();
    const product = demoById("product-configurator");
    const productPaused = buildScene(product, resources, 4.2, state({
      turntable: false,
      finish: "carmine",
      focusPart: "body",
      lighting: "studio"
    }));
    const productTurntable = buildScene(product, resources, 4.2, state({
      turntable: true,
      finish: "carmine",
      focusPart: "body",
      lighting: "studio"
    }));
    expect(productPaused.animatedSystems).toContain("car-concept turntable paused");
    expect(productTurntable.animatedSystems).toContain("car-concept turntable enabled");

    const city = demoById("smart-city");
    const cityBase = buildScene(city, resources, 5.4, state({
      count: "low",
      traffic: false,
      wire: false,
      fly: false,
      district: "all"
    }));
    const cityDebug = buildScene(city, resources, 5.4, state({
      count: "extreme",
      traffic: true,
      wire: true,
      fly: true,
      district: "harbor"
    }));
    expect(countLabel(cityBase, "debug grid")).toBe(0);
    expect(countLabel(cityDebug, "debug grid")).toBeGreaterThan(0);
    expect(cityDebug.labels).toContain("Flythrough");

    const robotics = demoById("robotics-lab");
    const roboticsBase = buildScene(robotics, resources, 2.2, state({
      playing: true,
      state: "training",
      timeline: 0,
      skeleton: false,
      follow: false
    }));
    const roboticsControlled = buildScene(robotics, resources, 2.2, state({
      playing: false,
      state: "inspect",
      timeline: 0.6,
      skeleton: true,
      follow: true
    }, { selected: "expressive primary robot" }));
    expect(countLabel(roboticsBase, "skeleton path no IK")).toBe(0);
    expect(countLabel(roboticsControlled, "skeleton path no IK")).toBeGreaterThan(0);
    expect(countLabel(roboticsControlled, "robotics follow camera body")).toBeGreaterThan(0);
    expect(roboticsControlled.labels.join(" ")).toContain("selected primary robot");

    const digitalTwin = demoById("digital-twin");
    const digitalMuted = buildScene(digitalTwin, resources, 6.1, state({
      running: false,
      speed: 1,
      sensors: false,
      safety: false,
      heatmap: false,
      zone: "all"
    }));
    const digitalFocused = buildScene(digitalTwin, resources, 6.1, state({
      running: true,
      speed: 1.8,
      sensors: true,
      safety: true,
      heatmap: true,
      zone: "qa"
    }));
    expect(countLabel(digitalMuted, "central sensor sweep")).toBe(0);
    expect(countLabel(digitalFocused, "central sensor sweep")).toBeGreaterThan(0);
    expect(countLabel(digitalFocused, "quality heatmap")).toBeGreaterThan(0);
    expect(digitalFocused.labels).toContain("Zone qa");
  });

  it("keeps ocean observatory route-owned foam and deck detail visible for the hero gate", () => {
    const demo = DEMOS.find((entry) => entry.id === "ocean-observatory");
    expect(demo).toBeDefined();
    const frame = buildScene(demo!, createResources(), 7.2, state({
      mode: "cinematic",
      wind: 1.2,
      scale: 1.1,
      paths: true,
      lighting: "dusk"
    }));

    expect(frame.animatedSystems).toContain("foam and spray bands");
    expect(frame.approximations.join(" ")).toContain("WebGPU/FFT ocean path is not used");
    expect(frame.items.some((item) => item.label === "continuous multi-frequency ocean mesh")).toBe(true);
    expect(frame.items.filter((item) => item.label === "subtle foam crest").length).toBeGreaterThanOrEqual(3);
    expect(frame.items.some((item) => item.label === "drone navigation glint")).toBe(true);
    expect(frame.waterTelemetry?.visualLayerTelemetry?.crestFoamCueCount).toBeGreaterThan(0);
    expect(frame.waterTelemetry?.visualLayerTelemetry?.specularCueCount).toBeGreaterThan(0);
  });
});

function demoById(id: typeof DEMOS[number]["id"]): typeof DEMOS[number] {
  const demo = DEMOS.find((entry) => entry.id === id);
  expect(demo).toBeDefined();
  return demo!;
}

function countLabel(frame: ReturnType<typeof buildScene>, label: string): number {
  return frame.items.filter((item) => item.label === label).length;
}

function state(controls: GalleryState["controls"], overrides: Partial<GalleryState> = {}): GalleryState {
  return {
    controls,
    ripples: [],
    selected: "overview",
    cameraPreset: "hero",
    pointer: { x: 0.5, y: 0.5 },
    pulse: 0,
    ...overrides
  };
}
