import { describe, expect, it } from "vitest";
import {
  CubeCameraReflectionCapture,
  MockRenderDevice,
  PBRMaterial,
  Texture,
  TextureBinding,
  composeEnvironmentLighting
} from "../../../packages/rendering/src";
import {
  createEnvironmentPresetReport,
  createNamedEnvironmentPreset,
  listNamedEnvironmentPresets
} from "../../../packages/rendering/src/EnvironmentPreset";
import {
  createLightingRig,
  listLightingRigPresets
} from "../../../packages/rendering/src/LightingRig";
import { createExternalParityContactShadowPlan } from "../../../packages/rendering/src/shadows/ContactShadows";
import {
  createReflectiveFloorSurface,
  createReflectionSurface,
  listReflectionSurfaceKinds
} from "../../../packages/rendering/src/ReflectionSurfaces";

describe("named environment preset reports", () => {
  it("builds reusable named presets with structured report boundaries", () => {
    expect(listNamedEnvironmentPresets().map((preset) => preset.id)).toEqual([
      "studio",
      "outdoor",
      "city",
      "warehouse",
      "deep-space",
      "ocean",
      "clean-void"
    ]);

    const studio = createNamedEnvironmentPreset("studio", { size: 6 });
    const ocean = createNamedEnvironmentPreset("ocean", { requestedFeatures: ["fft-webgpu-water"] });
    const studioReport = createEnvironmentPresetReport(studio, "studio");
    const oceanReport = createEnvironmentPresetReport(ocean, "ocean");

    expect(studio.type).toBe("studio");
    expect(studio.lightingPreset).toBe("softbox");
    expect(studio.fog).toBeUndefined();
    expect(studioReport.renderItemCount).toBe(studio.items.length);
    expect(studioReport.visibleBackgroundSeparatedFromLighting).toBe(true);
    expect(studioReport.productionReady).toBe(false);
    expect(studioReport.claimBoundary).toMatch(/route acceptance still requires browser screenshot/i);

    expect(ocean.type).toBe("ocean");
    expect(ocean.fog?.preset).toBe("marine-layer");
    expect(ocean.unsupportedRequests.join(" ")).toMatch(/FFT\/WebGPU water/i);
    expect(oceanReport.hasFogProfile).toBe(true);
    expect(oceanReport.capabilityIds).toContain("dynamic-ocean-plane");
  });
});

describe("lighting rig platform helpers", () => {
  it("composes route stage lighting with sampled HDR texture bindings", () => {
    const equirect = new Texture({ width: 2, height: 1, data: new Uint8Array(8), colorSpace: "linear" });
    const cube = new Texture({
      width: 1,
      height: 1,
      dimension: "cube",
      cubeFaces: ["px", "nx", "py", "ny", "pz", "nz"].map((face) => ({
        face: face as "px" | "nx" | "py" | "ny" | "pz" | "nz",
        mipLevels: [{ width: 1, height: 1, data: new Uint8Array(4) }]
      }))
    });
    const brdf = new Texture({ width: 2, height: 2, data: new Uint8Array(16), colorSpace: "linear" });
    const base = {
      color: [0.12, 0.14, 0.18] as const,
      intensity: 0.92,
      proceduralMap: {
        skyColor: [0.05, 0.08, 0.12] as const,
        horizonColor: [0.18, 0.16, 0.13] as const,
        groundColor: [0.01, 0.012, 0.016] as const,
        specularColor: [0.7, 0.82, 1] as const,
        intensity: 0.48,
        specularIntensity: 0.42
      }
    };
    const sampled = {
      color: [1, 1, 1] as const,
      intensity: 0.08,
      proceduralMap: {
        skyColor: [0.2, 0.24, 0.32] as const,
        horizonColor: [0.22, 0.2, 0.18] as const,
        groundColor: [0.03, 0.035, 0.045] as const,
        specularColor: [1, 1, 1] as const,
        intensity: 0.06,
        specularIntensity: 0.1
      },
      environmentMapTexture: new TextureBinding({ name: "u_environmentMapTexture", texture: equirect }),
      environmentCubeMapTexture: new TextureBinding({ name: "u_environmentCubeMapTexture", texture: cube }),
      environmentBrdfLutTexture: new TextureBinding({ name: "u_environmentBrdfLutTexture", texture: brdf }),
      environmentMapIntensity: 0.68,
      environmentMapSpecularIntensity: 0.2584,
      environmentMapRotation: 0.18,
      environmentMapMipCount: 5,
      environmentMapEncoding: "linear" as const
    };

    const composed = composeEnvironmentLighting(base, sampled, {
      minimumEnvironmentMapIntensity: 0.78,
      minimumEnvironmentMapSpecularIntensity: 0.76
    });

    expect(composed.color).toEqual(base.color);
    expect(composed.intensity).toBe(base.intensity);
    expect(composed.proceduralMap).toEqual(base.proceduralMap);
    expect(composed.environmentMapTexture).toBe(sampled.environmentMapTexture);
    expect(composed.environmentCubeMapTexture).toBe(sampled.environmentCubeMapTexture);
    expect(composed.environmentBrdfLutTexture).toBe(sampled.environmentBrdfLutTexture);
    expect(composed.environmentMapIntensity).toBe(0.78);
    expect(composed.environmentMapSpecularIntensity).toBe(0.76);
    expect(composed.environmentMapRotation).toBe(0.18);
    expect(composed.environmentMapMipCount).toBe(5);
    expect(composed.environmentMapEncoding).toBe("linear");
  });

  it("can replace route procedural lighting with sampled HDR procedural fallback", () => {
    const base = {
      color: [0.12, 0.14, 0.18] as const,
      intensity: 0.92,
      proceduralMap: {
        skyColor: [0.05, 0.08, 0.12] as const,
        horizonColor: [0.18, 0.16, 0.13] as const,
        groundColor: [0.01, 0.012, 0.016] as const,
        specularColor: [0.7, 0.82, 1] as const,
        intensity: 0.48,
        specularIntensity: 0.42
      }
    };
    const sampled = {
      color: [1, 1, 1] as const,
      intensity: 0.08,
      proceduralMap: {
        skyColor: [0.2, 0.24, 0.32] as const,
        horizonColor: [0.22, 0.2, 0.18] as const,
        groundColor: [0.03, 0.035, 0.045] as const,
        specularColor: [1, 1, 1] as const,
        intensity: 0.06,
        specularIntensity: 0.1
      },
      environmentMapIntensity: 0.68,
      environmentMapSpecularIntensity: 0.2584
    };

    const composed = composeEnvironmentLighting(base, sampled, {
      sampledReplacesProceduralMap: true,
      environmentMapSpecularIntensity: 0.012
    });

    expect(composed.color).toEqual(base.color);
    expect(composed.intensity).toBe(base.intensity);
    expect(composed.proceduralMap).toEqual(sampled.proceduralMap);
    expect(composed.proceduralMap).not.toEqual(base.proceduralMap);
    expect(composed.environmentMapIntensity).toBe(0.68);
    expect(composed.environmentMapSpecularIntensity).toBe(0.012);
  });

  it("creates reusable direct-light rigs and keeps unsupported lighting claims explicit", () => {
    expect(listLightingRigPresets()).toEqual([
      "key-fill-rim",
      "studio-softbox",
      "sun",
      "industrial",
      "urban-neon",
      "product-detail",
      "product-shot"
    ]);

    const product = createLightingRig({ preset: "product-shot", intensityScale: 1.5 });
    const productDetail = createLightingRig({ preset: "product-detail" });
    const sun = createLightingRig({ preset: "sun", shadows: false });

    expect(product.lights).toHaveLength(3);
    expect(product.softboxes).toHaveLength(3);
    expect(product.collectedLights).toHaveLength(3);
    expect(product.collectedLights[0]?.source.name).toBe("product-key");
    expect(product.lights[0]).toMatchObject({ kind: "rect-area", intensity: 24, width: 2.4, height: 1.35 });
    expect(product.softboxes[0]).toMatchObject({
      id: "product-key-softbox",
      role: "key",
      intensity: 2.325,
      size: [2.4, 1.35],
      linkedLightIds: ["product-key"]
    });
    expect(product.softboxes.map((softbox) => softbox.role)).toEqual(["key", "fill", "rim"]);
    expect(product.softboxes.every((softbox) => softbox.claimBoundary.match(/proxy|direct light|GI|area-light/i))).toBe(true);
    expect(product.diagnostics.shadowCastingLightCount).toBe(0);
    expect(product.diagnostics.softboxProxyCount).toBe(3);
    expect(product.diagnostics.unsupportedFeatures).not.toContain("rectangular-area-light");
    expect(product.diagnostics.disclosures.join(" ")).toMatch(/IES photometric profiles are unsupported/i);
    expect(product.diagnostics.claimBoundary).toMatch(/finite rectangular emitters/i);
    expect(productDetail.lights.map((light) => light.id)).toEqual([
      "product-detail-key",
      "product-detail-cool-edge",
      "product-detail-warm-edge",
      "product-detail-fill"
    ]);
    expect(productDetail.softboxes.map((softbox) => softbox.id)).toEqual([
      "product-detail-key-strip",
      "product-detail-cool-rim",
      "product-detail-fill-card"
    ]);
    expect(productDetail.lights.find((light) => light.id === "product-detail-fill")?.intensity).toBeLessThan(0.2);
    expect(productDetail.lights[0]?.kind).toBe("rect-area");
    expect(productDetail.diagnostics.unsupportedFeatures).not.toContain("rectangular-area-light");

    expect(sun.diagnostics.shadowCastingLightCount).toBe(0);
    expect(sun.diagnostics.softboxProxyCount).toBe(0);
    expect(sun.diagnostics.unsupportedFeatures).toContain("cascaded-shadow-map");
    expect(sun.collectedLights.every((light) => light.castsShadow === false)).toBe(true);
    expect(() => createLightingRig({ intensityScale: 0 })).toThrow(/intensityScale/);
  });

  it("creates layered contact-shadow plans without claiming a renderer contact pass", () => {
    const plan = createExternalParityContactShadowPlan({
      casterRadius: 0.8,
      receiverDistance: 0.22,
      softness: 0.6,
      opacity: 0.36,
      layerCount: 4,
      anisotropy: 1.5
    });

    expect(plan.fallback).toBe("layered-receiver-geometry");
    expect(plan.shadow.radius).toBe(1.28);
    expect(plan.shadow.anchorStrength).toBeGreaterThan(0);
    expect(plan.layers).toHaveLength(4);
    expect(plan.layers[0]).toMatchObject({
      index: 0,
      radius: 1.28,
      scale: [1.92, 0.8533],
      opacity: 0.36
    });
    expect(plan.layers[3]?.radius).toBeGreaterThan(plan.layers[0]?.radius ?? 0);
    expect(plan.layers[3]?.opacity).toBeLessThan(plan.layers[0]?.opacity ?? 1);
    expect(plan.unsupportedRendererFeatures).toContain("screen-space-contact-shadow");
    expect(plan.claimBoundary).toMatch(/not a renderer contact-shadow pass/i);
    expect(() => createExternalParityContactShadowPlan({ casterRadius: 0.8, receiverDistance: 0.22, layerCount: 7 })).toThrow(/layerCount/);
  });
});

describe("reflection surface contracts", () => {
  it("creates a staged reflective floor without claiming true reflection support", () => {
    expect(listReflectionSurfaceKinds()).toEqual([
      "planar-reflector",
      "reflective-floor",
      "refractor-glass",
      "water-refraction",
      "cube-probe",
      "screen-space-reflection"
    ]);

    const floor = createReflectiveFloorSurface("showroom-floor", {
      size: [8, 10],
      roughness: 0.18,
      metallic: 0.12,
      intensity: 0.65
    });

    expect(floor.kind).toBe("reflective-floor");
    expect(floor.item?.material).toBeInstanceOf(PBRMaterial);
    expect(floor.item?.label).toBe("showroom-floor staged reflective floor");
    expect(floor.report.status).toBe("helper");
    expect(floor.report.trueReflection).toBe(false);
    expect(floor.report.requiresRendererPath).toContain("planar-reflector-render-target");
    expect(floor.report.claimBoundary).toMatch(/not proof of planar reflection/i);
  });

  it("returns unsupported descriptors for SSR, refraction, and planar reflector claims while requiring a capture owner for cube probes", () => {
    const ssr = createReflectionSurface({ id: "hero-ssr", kind: "screen-space-reflection" });
    const glass = createReflectionSurface({ id: "glass", kind: "refractor-glass" });
    const planar = createReflectionSurface({ id: "mirror", kind: "planar-reflector" });
    const probe = createReflectionSurface({ id: "probe", kind: "cube-probe", probe: { id: "unit-probe", position: [1, 2, 3], radius: 4, intensity: 0.8 } });

    expect(ssr.report.status).toBe("unsupported");
    expect(ssr.report.requiresRendererPath).toContain("ssr-ray-march-pass");
    expect(ssr.report.unsupportedRequests.join(" ")).toMatch(/SSR is unsupported/i);
    expect(glass.report.unsupportedRequests.join(" ")).toMatch(/scene-space refraction/i);
    expect(planar.report.requiresRendererPath).toContain("mirror-camera-render-target");
    expect(probe.probe).toEqual({ id: "unit-probe", position: [1, 2, 3], radius: 4, intensity: 0.8 });
    expect(probe.report.status).toBe("helper");
    expect(probe.report.unsupportedRequests.join(" ")).toMatch(/provide CubeCameraReflectionCapture/i);
    expect(() => createReflectionSurface({ id: "", kind: "reflective-floor" })).toThrow(/id is required/);
    expect(() => createReflectiveFloorSurface("bad-floor", { size: [0, 2] })).toThrow(/width/);
  });

  it("captures six live faces, refreshes moving pixels, and binds the cubemap to a reflective PBR surface", () => {
    const device = new MockRenderDevice();
    const probe = { id: "live-probe", position: [0, 1, 0] as const, radius: 12, intensity: 0.85 };
    const capture = new CubeCameraReflectionCapture(device, probe, {
      resolution: 4,
      sampleCount: 4
    });
    let movingObjectFace = 4;

    const renderCapture = () => capture.capture((face) => {
      const pixels = new Uint8Array(4 * 4 * 4);
      for (let index = 0; index < 16; index += 1) {
        const offset = index * 4;
        pixels[offset] = face.index === movingObjectFace ? 240 : 8;
        pixels[offset + 1] = face.index === movingObjectFace ? 64 : 12;
        pixels[offset + 2] = face.index === movingObjectFace ? 24 : 16;
        pixels[offset + 3] = 255;
      }
      device.writeRenderTargetPixels?.(face.renderTarget, pixels);
    });

    const first = renderCapture();
    movingObjectFace = 0;
    const second = renderCapture();
    const surface = createReflectionSurface({ id: "live-surface", kind: "cube-probe", probe, capture });

    expect(first.texture.dimension).toBe("cube");
    expect(first.texture.cubeFaces.map((face) => face.face)).toEqual(["px", "nx", "py", "ny", "pz", "nz"]);
    expect(first.capturedPixelCount).toBe(96);
    expect(first.revision).toBe(1);
    expect(first.changedFaceCount).toBe(6);
    expect(first.texture.disposed).toBe(true);
    expect(second.revision).toBe(2);
    expect(second.changedFaceCount).toBe(2);
    expect(second.binding.validate()).toEqual({ ok: true, diagnostics: [], warnings: [] });
    expect(second.environmentLighting.environmentCubeMapTexture).toBe(second.binding);
    expect(second.environmentLighting.environmentMapSpecularIntensity).toBe(0.85);
    expect(surface.capture).toBe(capture);
    expect(surface.report.status).toBe("implemented");
    expect(surface.report.trueReflection).toBe(true);
    expect(surface.report.requiresRendererPath).toEqual([]);
    const mismatchedCapture = new CubeCameraReflectionCapture(
      device,
      { ...probe, id: "different-probe" },
      { resolution: 1 }
    );
    expect(() => createReflectionSurface({
      id: "mismatch",
      kind: "cube-probe",
      probe,
      capture: mismatchedCapture
    })).toThrow(/does not match/);
    mismatchedCapture.dispose();

    capture.dispose();
    expect(second.texture.disposed).toBe(true);
    expect(() => renderCapture()).toThrow(/disposed/);
  });
});
