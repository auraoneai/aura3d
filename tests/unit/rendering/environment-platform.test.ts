import { describe, expect, it } from "vitest";
import {
  createEnvironmentCapabilityReport,
  createEnvironmentFogProfile,
  createEnvironmentPreset,
  createEnvironmentStage,
  createEnvironmentUnsupportedRequestDisclosures,
  createInfiniteGroundGrid,
  createProceduralSkyDome,
  applyEnvironmentFogToColor,
  listEnvironmentCapabilities,
  PBRMaterial,
  sampleEnvironmentFogFactor,
  UnlitMaterial,
  type EnvironmentStagePresetId
} from "../../../packages/rendering/src";

describe("environment platform capability inventory", () => {
  it("keeps the requested Three.js-style environment backlog explicit", () => {
    const report = createEnvironmentCapabilityReport();

    expect(report.requestedCount).toBe(20);
    expect(report.implementedCount).toBe(0);
    expect(report.partialCount).toBe(6);
    expect(report.helperCount).toBe(11);
    expect(report.missingCount).toBe(3);
    expect(report.productionReadyCount).toBe(0);
    expect(report.nonProductionReadyCount).toBe(20);
    expect(report.productionReady).toEqual([]);
    expect(report.backlog).toHaveLength(20);
    expect(report.capabilities.map((capability) => capability.id)).toEqual([
      "cubemap-renderer",
      "equirectangular-projection",
      "pmrem-generator",
      "atmospheric-scattering",
      "analytical-studio-box",
      "linear-fog",
      "exponential-fog",
      "rgbe-hdr-parser",
      "exr-parser",
      "cube-camera-reflections",
      "dynamic-ocean-plane",
      "procedural-sky-dome",
      "volumetric-weather-enclosure",
      "infinite-ground-grid",
      "indoor-studio-stage",
      "outdoor-nature-backdrop",
      "urban-city-shell",
      "industrial-warehouse-void",
      "deep-space-box",
      "clean-void-backdrop"
    ]);
  });

  it("does not mask missing production systems as implemented helpers", () => {
    const byId = new Map(listEnvironmentCapabilities().map((capability) => [capability.id, capability]));

    expect(byId.get("exr-parser")?.status).toBe("missing");
    expect(byId.get("cube-camera-reflections")?.status).toBe("missing");
    expect(byId.get("linear-fog")?.status).toBe("partial");
    expect(byId.get("linear-fog")?.gap).toMatch(/no accepted gallery route\/screenshot/i);
    expect(byId.get("exponential-fog")?.status).toBe("partial");
    expect(byId.get("exponential-fog")?.gap).toMatch(/no accepted gallery route\/screenshot/i);
    expect(byId.get("dynamic-ocean-plane")?.status).toBe("helper");
    expect(byId.get("pmrem-generator")?.status).toBe("partial");
    expect(byId.get("pmrem-generator")?.gap).toMatch(/not Three\.js parity/i);
  });
});

describe("environment stage helpers", () => {
  const presets: readonly EnvironmentStagePresetId[] = [
    "clean-void",
    "indoor-studio",
    "outdoor-nature",
    "urban-city",
    "industrial-warehouse",
    "deep-space"
  ];

  it("creates reusable stage shells for every preset", () => {
    for (const preset of presets) {
      const stage = createEnvironmentStage({ preset, size: 10, timeSeconds: 1.25 });

      expect(stage.preset).toBe(preset);
      expect(stage.items.length).toBeGreaterThanOrEqual(4);
      expect(stage.systems).toEqual([
        "environment stage shell",
        "procedural sky/backdrop",
        "ground grid/catch plane",
        "preset environment lighting",
        "stage accent panels"
      ]);
      expect(stage.capabilityIds).toContain("procedural-sky-dome");
      expect(stage.capabilityIds).toContain("infinite-ground-grid");
      expect(stage.limitations.join(" ")).toMatch(/not proof of full Three\.js environment parity/i);
      expect(stage.bounds.min).toEqual([-10, -0.08, -10]);
      expect(stage.bounds.max).toEqual([10, 7.4, 10]);
      expect(stage.lighting.proceduralMap?.intensity).toBeGreaterThan(0);
    }
  });

  it("returns real A3D render items for grids, sky domes, floors, walls, and accents", () => {
    const stage = createEnvironmentStage({ preset: "indoor-studio", size: 8, gridDivisions: 8 });

    expect(stage.items.some((item) => item.label?.includes("procedural sky dome") && item.material instanceof UnlitMaterial)).toBe(true);
    expect(stage.items.some((item) => item.label?.includes("ground grid") && item.geometry.topology === "lines")).toBe(true);
    expect(stage.items.some((item) => item.label?.includes("floor/catch plane") && item.material instanceof PBRMaterial)).toBe(true);
    expect(stage.items.filter((item) => item.label?.includes("reusable light panel"))).toHaveLength(6);
    expect(stage.capabilityIds).toContain("analytical-studio-box");
    expect(stage.capabilityIds).toContain("indoor-studio-stage");
  });

  it("can place a reusable stage floor below imported authored assets", () => {
    const stage = createEnvironmentStage({ preset: "indoor-studio", size: 4.8, floorY: -0.95, includeGroundGrid: false });
    const floor = stage.items.find((item) => item.label === "indoor-studio floor/catch plane");
    const wall = stage.items.find((item) => item.label === "indoor-studio rear infinity wall");
    const panel = stage.items.find((item) => item.label === "indoor-studio reusable light panel");

    expect(stage.bounds.min).toEqual([-4.8, -1.03, -4.8]);
    expect(stage.bounds.max[0]).toBe(4.8);
    expect(stage.bounds.max[1]).toBeCloseTo(2.602, 5);
    expect(stage.bounds.max[2]).toBe(4.8);
    expect(floor?.modelMatrix?.[13]).toBeCloseTo(-0.985, 5);
    expect(wall?.modelMatrix?.[13]).toBeCloseTo(0.778, 5);
    expect(panel?.modelMatrix?.[13]).toBeCloseTo(2.026, 5);
    expect((floor?.material as PBRMaterial | undefined)?.getParameter("u_baseColor")).toEqual([0.035, 0.039, 0.044, 1]);
    expect((wall?.material as PBRMaterial | undefined)?.getParameter("u_baseColor")).toEqual([0.026, 0.03, 0.038, 1]);
    expect((floor?.material as PBRMaterial | undefined)?.getParameter("u_environmentIntensity")).toBe(0.24);
    expect((wall?.material as PBRMaterial | undefined)?.getParameter("u_environmentIntensity")).toBe(0.16);
  });

  it("supports a darker premium product studio shell without dropping catch-plane geometry", () => {
    const standard = createEnvironmentStage({ preset: "indoor-studio", size: 3.25, floorY: -0.95, includeGroundGrid: false });
    const premium = createEnvironmentStage({ preset: "indoor-studio", size: 3.25, floorY: -0.95, studioTone: "premium-dark", includeGroundGrid: false });
    const standardFloor = standard.items.find((item) => item.label === "indoor-studio floor/catch plane");
    const premiumFloor = premium.items.find((item) => item.label === "indoor-studio floor/catch plane");
    const standardWall = standard.items.find((item) => item.label === "indoor-studio rear infinity wall");
    const premiumWall = premium.items.find((item) => item.label === "indoor-studio rear infinity wall");
    const premiumPanels = premium.items.filter((item) => (item.label ?? "").startsWith("indoor-studio reusable ") && (item.label ?? "").includes("softbox"));

    expect(premiumFloor).toBeDefined();
    expect(premiumWall).toBeUndefined();
    expect(premiumPanels).toHaveLength(2);
    expect((premiumFloor?.material as PBRMaterial | undefined)?.getParameter("u_baseColor")).toEqual([0.006, 0.008, 0.012, 1]);
    expect((premiumFloor?.material as PBRMaterial | undefined)?.getParameter("u_environmentIntensity")).toBe(0);
    expect((premiumPanels[0]?.material as PBRMaterial | undefined)?.getParameter("u_emissiveStrength")).toBe(0.16);
    expect(standardWall).toBeDefined();
    expect((premiumFloor?.modelMatrix?.[0] ?? 0)).toBeGreaterThan(standardFloor?.modelMatrix?.[0] ?? 0);
  });

  it("exposes a compact product-premium studio tone that reduces catch-plane dominance", () => {
    const standard = createEnvironmentStage({ preset: "indoor-studio", size: 3.25, floorY: -0.95, includeGroundGrid: false });
    const productPremium = createEnvironmentStage({ preset: "indoor-studio", size: 3.25, floorY: -0.95, studioTone: "product-premium", includeGroundGrid: false });
    const standardFloor = standard.items.find((item) => item.label === "indoor-studio floor/catch plane");
    const productFloor = productPremium.items.find((item) => item.label === "indoor-studio floor/catch plane");
    const productWall = productPremium.items.find((item) => item.label === "indoor-studio rear infinity wall");
    const productPanels = productPremium.items.filter((item) => (item.label ?? "").startsWith("indoor-studio reusable ") && (item.label ?? "").includes("softbox"));
    const contactLayers = productPremium.items.filter((item) => (item.label ?? "").startsWith("indoor-studio product grounding contact shadow layer"));

    expect(productFloor).toBeDefined();
    expect(productWall).toBeUndefined();
    expect(productPanels).toHaveLength(2);
    expect(contactLayers).toHaveLength(3);
    expect(productPremium.systems).toContain("contact grounding helper");
    expect(productPremium.contactGrounding?.plan.fallback).toBe("layered-receiver-geometry");
    expect(productPremium.contactGrounding?.plan.unsupportedRendererFeatures).toEqual([
      "screen-space-contact-shadow",
      "blurred-depth-contact-shadow-map",
      "true-area-light-penumbra"
    ]);
    expect(productPremium.contactGrounding?.receiverLabel).toBe("indoor-studio floor/catch plane");
    expect(productFloor?.includeInAutoFrame).toBe(false);
    expect(contactLayers.every((item) => item.includeInAutoFrame === false)).toBe(true);
    expect((productFloor?.modelMatrix?.[0] ?? 0)).toBeLessThan(standardFloor?.modelMatrix?.[0] ?? Number.POSITIVE_INFINITY);
    expect((productFloor?.modelMatrix?.[10] ?? 0)).toBeLessThan(standardFloor?.modelMatrix?.[10] ?? Number.POSITIVE_INFINITY);
    expect((productFloor?.modelMatrix?.[0] ?? 0)).toBeCloseTo(3.25 * 0.94, 5);
    expect((productFloor?.modelMatrix?.[10] ?? 0)).toBeCloseTo(3.25 * 0.52, 5);
    expect((productFloor?.material as PBRMaterial | undefined)?.getParameter("u_baseColor")).toEqual([0.06, 0.064, 0.067, 1]);
    expect((productFloor?.material as PBRMaterial | undefined)?.getParameter("u_environmentIntensity")).toBe(0.012);
    expect((contactLayers[0]?.modelMatrix?.[0] ?? 0)).toBeLessThan(productFloor?.modelMatrix?.[0] ?? Number.POSITIVE_INFINITY);
    expect((contactLayers[0]?.modelMatrix?.[10] ?? 0)).toBeLessThan(productFloor?.modelMatrix?.[10] ?? Number.POSITIVE_INFINITY);
    expect((contactLayers[0]?.material as PBRMaterial | undefined)?.renderState.blend).toBe(true);
    expect((contactLayers[0]?.material as PBRMaterial | undefined)?.renderState.depthWrite).toBe(false);
    expect((contactLayers[0]?.material as PBRMaterial | undefined)?.getParameter("u_baseColor")).toEqual([0, 0, 0, 0.3]);
    expect((productPanels[0]?.material as PBRMaterial | undefined)?.getParameter("u_emissiveStrength")).toBeLessThan(0.08);
    expect((productPanels[0]?.modelMatrix?.[13] ?? 0)).toBeGreaterThan(2.3);
    expect(Math.abs(productPanels[0]?.modelMatrix?.[0] ?? 0)).toBeLessThan(0.32);
    expect(productPremium.limitations.join(" ")).toMatch(/compact analytical catch planes/i);
    expect(productPremium.limitations.join(" ")).toMatch(/without camera reframing or floor expansion/i);
    expect(productPremium.limitations.join(" ")).toMatch(/not a renderer contact-shadow pass/i);
  });

  it("can disable product studio accent panels without dropping the catch plane", () => {
    const productPremium = createEnvironmentStage({
      preset: "indoor-studio",
      size: 3.25,
      floorY: -0.95,
      studioTone: "product-premium",
      includeGroundGrid: false,
      includeStageAccents: false
    });
    const productFloor = productPremium.items.find((item) => item.label === "indoor-studio floor/catch plane");
    const productPanels = productPremium.items.filter((item) => (item.label ?? "").startsWith("indoor-studio reusable ") && (item.label ?? "").includes("softbox"));

    expect(productFloor).toBeDefined();
    expect(productPanels).toHaveLength(0);
    expect(productPremium.systems).toContain("stage accent panels disabled");
    expect(productPremium.limitations.join(" ")).toMatch(/Stage accent panel rendering is disabled/i);
  });

  it("keeps product contact grounding configurable without widening the stage slab", () => {
    const grounded = createEnvironmentStage({
      preset: "indoor-studio",
      size: 4,
      floorY: -0.8,
      studioTone: "product-premium",
      includeGroundGrid: false,
      contactGrounding: {
        casterRadius: 0.72,
        receiverDistance: 0.16,
        softness: 0.5,
        opacity: 0.28,
        layerCount: 2,
        anisotropy: 1.6,
        label: "watch support"
      }
    });
    const disabled = createEnvironmentStage({
      preset: "indoor-studio",
      size: 4,
      floorY: -0.8,
      studioTone: "product-premium",
      includeGroundGrid: false,
      contactGrounding: "off"
    });
    const layers = grounded.items.filter((item) => (item.label ?? "").startsWith("watch support contact shadow layer"));
    const floor = grounded.items.find((item) => item.label === "indoor-studio floor/catch plane");

    expect(layers).toHaveLength(2);
    expect(disabled.contactGrounding).toBeUndefined();
    expect(disabled.systems).not.toContain("contact grounding helper");
    expect(grounded.contactGrounding?.plan.shadow.anchorStrength).toBeGreaterThan(0);
    expect(grounded.contactGrounding?.plan.layers.map((layer) => layer.opacity)).toEqual([0.28, 0.0784]);
    expect((layers[0]?.modelMatrix?.[0] ?? 0)).toBeCloseTo(0.72 * 1.5 * 1.6, 4);
    expect((layers[0]?.modelMatrix?.[13] ?? 0)).toBeCloseTo(-0.797, 5);
    expect((layers[0]?.modelMatrix?.[0] ?? 0)).toBeLessThan(floor?.modelMatrix?.[0] ?? Number.POSITIVE_INFINITY);
    expect((layers[0]?.modelMatrix?.[10] ?? 0)).toBeLessThan(floor?.modelMatrix?.[10] ?? Number.POSITIVE_INFINITY);
  });

  it("can disable physical stage shells for infinite backdrop routes", () => {
    const stage = createEnvironmentStage({
      preset: "deep-space",
      size: 6,
      includeStageShell: false,
      includeGroundGrid: false,
      timeSeconds: 2
    });

    expect(stage.systems).toEqual([
      "environment stage shell disabled",
      "procedural sky/backdrop",
      "ground grid disabled",
      "preset environment lighting",
      "stage accent panels"
    ]);
    expect(stage.items.some((item) => item.label?.includes("procedural sky dome"))).toBe(true);
    expect(stage.items.some((item) => item.label === "deep space reusable star field")).toBe(true);
    expect(stage.items.some((item) => item.label?.includes("floor/catch plane"))).toBe(false);
    expect(stage.items.some((item) => item.label?.includes("rear infinity wall"))).toBe(false);
    expect(stage.items.some((item) => item.label?.includes("ground grid"))).toBe(false);
    expect(stage.limitations.join(" ")).toMatch(/Physical stage shell is disabled/i);
    expect(stage.limitations.join(" ")).toMatch(/Ground grid\/catch-plane rendering is disabled/i);
  });

  it("validates reusable ground-grid and sky-dome inputs", () => {
    const grid = createInfiniteGroundGrid({ size: 4, divisions: 4 });
    const sky = createProceduralSkyDome({ preset: "deep-space", radius: 20 });

    expect(grid.geometry.topology).toBe("lines");
    expect(grid.geometry.vertexBuffer.vertexCount).toBe((4 + 1) * 4);
    expect(grid.material).toBeInstanceOf(UnlitMaterial);
    expect(sky.geometry.topology).toBe("triangles");
    expect(sky.material).toBeInstanceOf(UnlitMaterial);
    expect(() => createInfiniteGroundGrid({ size: 0 })).toThrow(/positive/);
    expect(() => createInfiniteGroundGrid({ divisions: 1 })).toThrow(/integer/);
    expect(() => createProceduralSkyDome({ radius: -1 })).toThrow(/positive/);
  });

  it("exposes one-call environment presets with honest unsupported requests", () => {
    const studio = createEnvironmentPreset({
      type: "studio",
      lighting: "softbox",
      background: "procedural",
      ground: "reflective-floor",
      size: 7
    });
    const ocean = createEnvironmentPreset({
      type: "ocean",
      lighting: "sunset",
      background: "equirect",
      ground: "terrain",
      size: 9
    });

    expect(studio.preset).toBe("indoor-studio");
    expect(studio.capabilityIds).toContain("indoor-studio-stage");
    expect(studio.capabilityIds).toContain("cube-camera-reflections");
    expect(studio.unsupportedRequests.join(" ")).toMatch(/reflective floor/i);
    expect(studio.unsupportedRequests.join(" ")).toMatch(/rectangular area-light/i);
    expect(ocean.preset).toBe("outdoor-nature");
    expect(ocean.capabilityIds).toContain("dynamic-ocean-plane");
    expect(ocean.capabilityIds).toContain("equirectangular-projection");
    expect(ocean.fog?.preset).toBe("marine-layer");
    expect(ocean.capabilityIds).toContain("exponential-fog");
    expect(ocean.systems).toContain("environment fog profile");
    expect(ocean.unsupportedRequests.join(" ")).toMatch(/FFT\/WebGPU water/i);
    expect(ocean.unsupportedRequests.join(" ")).toMatch(/terrain\/heightfield/i);
    expect(ocean.unsupportedRequests).toEqual(ocean.unsupportedRequestDetails.map((request) => request.disclosure));
    expect(ocean.unsupportedRequestDetails.every((request) => request.supported === false)).toBe(true);
  });

  it("creates reusable linear and exponential fog profiles with uniform-ready telemetry", () => {
    const linear = createEnvironmentFogProfile({
      mode: "linear",
      color: [0.5, 0.6, 0.7],
      near: 10,
      far: 110,
      density: 0.01,
      maxOpacity: 0.8,
      sampleDistances: [0, 10, 60, 110, 150]
    });
    const marine = createEnvironmentFogProfile("marine-layer");

    expect(linear.capabilityIds).toEqual(["linear-fog"]);
    expect(linear.uniforms).toMatchObject({
      u_environmentFogEnabled: 1,
      u_environmentFogMode: 1,
      u_environmentFogColor: [0.5, 0.6, 0.7],
      u_environmentFogNear: 10,
      u_environmentFogFar: 110,
      u_environmentFogMaxOpacity: 0.8
    });
    expect(linear.telemetry.sampleFactors).toEqual([0, 0, 0.4, 0.8, 0.8]);
    expect(linear.telemetry.monotonicDistanceResponse).toBe(true);
    expect(linear.telemetry.claimBoundary).toMatch(/not an accepted volumetric fog/i);

    expect(marine.capabilityIds).toEqual(["exponential-fog"]);
    expect(marine.uniforms.u_environmentFogMode).toBe(3);
    expect(sampleEnvironmentFogFactor(marine, 0)).toBe(0);
    expect(sampleEnvironmentFogFactor(marine, 120)).toBeGreaterThan(sampleEnvironmentFogFactor(marine, 30));
    expect(sampleEnvironmentFogFactor(marine, 120, 20)).toBeLessThan(sampleEnvironmentFogFactor(marine, 120, 0));
    expect(applyEnvironmentFogToColor([0.1, 0.2, 0.3], linear, 60)).toEqual([0.26, 0.36, 0.46]);
    expect(() => createEnvironmentFogProfile({ near: 10, far: 5 })).toThrow(/far must be greater/);
    expect(() => createEnvironmentFogProfile({ color: [1.2, 0, 0] })).toThrow(/fog color/);
  });

  it("discloses reflection, refraction, volumetric fog, and water gaps as structured unsupported requests", () => {
    const preset = createEnvironmentPreset({
      type: "ocean",
      lighting: "sunset",
      background: "cubemap",
      ground: "reflective-floor",
      fog: { mode: "linear", near: 8, far: 90, color: [0.58, 0.68, 0.76] },
      requestedFeatures: [
        "cube-camera-reflection",
        "linear-fog",
        "exponential-fog",
        "volumetric-fog"
      ]
    });
    const standalone = createEnvironmentUnsupportedRequestDisclosures({
      type: "ocean",
      lighting: "sunset",
      background: "cubemap",
      ground: "reflective-floor",
      fog: { mode: "linear", near: 8, far: 90, color: [0.58, 0.68, 0.76] },
      requestedFeatures: [
        "cube-camera-reflection",
        "linear-fog",
        "exponential-fog",
        "volumetric-fog"
      ]
    });
    const byRequest = new Map(preset.unsupportedRequestDetails.map((request) => [request.request, request]));

    expect(preset.unsupportedRequestDetails).toEqual(standalone);
    expect(preset.unsupportedRequestDetails.map((request) => request.request)).toEqual([
      "cube-camera-reflection",
      "exponential-fog",
      "volumetric-fog",
      "cubemap-background",
      "reflective-floor",
      "planar-reflection",
      "fft-webgpu-water",
      "transmission-refraction",
      "water-caustics",
      "underwater-volume"
    ]);
    expect(byRequest.get("cube-camera-reflection")?.capabilityIds).toEqual(["cube-camera-reflections"]);
    expect(byRequest.get("planar-reflection")?.disclosure).toMatch(/does not create reflector render targets/i);
    expect(byRequest.get("transmission-refraction")?.disclosure).toMatch(/Scene-space refraction requests remain unsupported/i);
    expect(byRequest.has("linear-fog")).toBe(false);
    expect(byRequest.get("exponential-fog")?.disclosure).toMatch(/Renderer exponential fog support exists/i);
    expect(byRequest.get("volumetric-fog")?.fallback).toMatch(/mist\/dust helper geometry/i);
    expect(byRequest.get("fft-webgpu-water")?.disclosure).toMatch(/does not provide FFT\/WebGPU water/i);
    expect(byRequest.get("water-caustics")?.disclosure).toMatch(/caustic projection/i);
    expect(byRequest.get("underwater-volume")?.disclosure).toMatch(/Underwater volume rendering remains unsupported/i);
    expect(preset.capabilityIds).toEqual(expect.arrayContaining([
      "cube-camera-reflections",
      "linear-fog",
      "exponential-fog",
      "volumetric-weather-enclosure",
      "dynamic-ocean-plane"
    ]));
  });
});
