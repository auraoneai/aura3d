import { describe, expect, it } from "vitest";
import type { RenderItem } from "@galileo3d/rendering";
import type { AuthoredAssetRuntimeState } from "../../../apps/v9-advanced-examples-gallery/src/authoredLayer";
import type { SceneFrame } from "../../../apps/v9-advanced-examples-gallery/src/sceneBuilders";
import {
  applyGalleryRouteCameraPolicy,
  applyGalleryRoutePostprocessPolicy,
  composeGalleryRouteRenderItems,
  maxCanvasBackingEdgeForRoute,
  rendererEnvironmentLightingCompositionOptionsForRoute,
  routeReceivesWaterRipples,
  usesProductConfiguratorHotspotPicking,
  visibleProceduralItemsForRoute
} from "../../../apps/v9-advanced-examples-gallery/src/galleryRoutePolicies";

describe("v9 advanced gallery route policies", () => {
  it("keeps product and data postprocess bounded while reactor stays opt-in", () => {
    const base = {
      bloom: { threshold: 0.2, intensity: 0.5, radius: 4 },
      colorGrade: { contrast: 1.1, saturation: 1.2 },
      fxaa: true
    } as const;

    expect(applyGalleryRoutePostprocessPolicy("product-configurator", base, {})).toMatchObject({
      bloom: false,
      fxaa: { edgeThreshold: 0.1, subpixelBlend: 0.24 }
    });
    expect(applyGalleryRoutePostprocessPolicy("data-galaxy", { ...base, fxaa: undefined }, {})).toMatchObject({
      bloom: false,
      fxaa: { edgeThreshold: 0.11, subpixelBlend: 0.2 }
    });
    expect(applyGalleryRoutePostprocessPolicy("smart-city", base, {})).toBe(false);
    expect(applyGalleryRoutePostprocessPolicy("reactor-post", base, { bloom: false })).toMatchObject({
      bloom: false,
      targetFormat: "rgba8"
    });
    expect(applyGalleryRoutePostprocessPolicy("reactor-post", base, { bloom: true })).toMatchObject({
      bloom: base.bloom
    });
  });

  it("preserves explicit route FXAA settings while normalizing boolean defaults", () => {
    const explicitFxaa = { edgeThreshold: 0.06, subpixelBlend: 0.36 };

    expect(applyGalleryRoutePostprocessPolicy("product-configurator", {
      bloom: false,
      colorGrade: { contrast: 1.08, saturation: 1.04 },
      fxaa: explicitFxaa
    }, {})).toMatchObject({
      bloom: false,
      fxaa: explicitFxaa
    });
    expect(applyGalleryRoutePostprocessPolicy("data-galaxy", {
      bloom: false,
      colorGrade: { contrast: 1.12, saturation: 1.04 },
      fxaa: true
    }, {})).toMatchObject({
      bloom: false,
      fxaa: { edgeThreshold: 0.11, subpixelBlend: 0.2 }
    });
  });

  it("keeps renderer environment-lighting composition floors in route policy instead of main orchestration", () => {
    expect(rendererEnvironmentLightingCompositionOptionsForRoute("product-configurator")).toEqual({
      minimumEnvironmentMapIntensity: 0.78,
      minimumEnvironmentMapSpecularIntensity: 0.76
    });
    expect(rendererEnvironmentLightingCompositionOptionsForRoute("data-galaxy")).toEqual({});
    expect(rendererEnvironmentLightingCompositionOptionsForRoute("reactor-post")).toEqual({});
  });

  it("centralizes named route hero camera policies outside main orchestration", () => {
    const product = applyGalleryRouteCameraPolicy(baseCameraPolicyInput({
      demoId: "product-configurator",
      cameraPreset: "hero",
      time: 10,
      authored: readyAuthored()
    }));
    expect(product.paddingRatio).toBe(0.012);
    expect(product.pitchRadians).toBeCloseTo(-0.13 + Math.cos(1.6) * 0.004, 6);
    expect(product.bounds).toEqual({ min: [-1.36, -1.02, -0.84], max: [1.36, 0.5, 0.94] });

    const data = applyGalleryRouteCameraPolicy(baseCameraPolicyInput({
      demoId: "data-galaxy",
      cameraPreset: "hero",
      time: 10,
      authored: loadingAuthored()
    }));
    expect(data.pitchRadians).toBe(-0.12);
    expect(data.paddingRatio).toBe(0.014);
    expect(data.bounds).toEqual({ min: [-0.32, -0.3, -0.3], max: [0.34, 0.38, 0.34] });

    const fog = applyGalleryRouteCameraPolicy(baseCameraPolicyInput({
      demoId: "fog-cathedral",
      cameraPreset: "hero",
      time: 10,
      authored: readyAuthored()
    }));
    expect(fog.yawRadians).toBeCloseTo(-0.72 + Math.sin(1.8) * 0.01, 6);
    expect(fog.paddingRatio).toBe(0.012);
    expect(fog.bounds).toEqual({ min: [-2.65, -0.82, -3.35], max: [2.65, 2.42, 1.45] });
  });

  it("keeps smart-city fly camera policy separate from hero camera policy", () => {
    const fly = applyGalleryRouteCameraPolicy(baseCameraPolicyInput({
      demoId: "smart-city",
      cameraPreset: "wide",
      time: 10,
      controls: { fly: true }
    }));
    expect(fly.yawRadians).toBeCloseTo(0.4 + Math.sin(2.2) * 0.34, 6);
    expect(fly.pitchRadians).toBeCloseTo(-0.3 + Math.sin(1.7) * 0.08, 6);
    expect(fly.paddingRatio).toBe(0.24);

    const hero = applyGalleryRouteCameraPolicy(baseCameraPolicyInput({
      demoId: "smart-city",
      cameraPreset: "hero",
      time: 10,
      controls: { fly: true }
    }));
    expect(hero.yawRadians).toBe(-0.72);
    expect(hero.pitchRadians).toBe(-0.21);
    expect(hero.paddingRatio).toBe(0.045);
  });

  it("keeps procedural support hidden for ready product GLBs", () => {
    const scene = sceneWithLabels(["studio plinth", "hotspot", "continuous animated water mesh"]);

    expect(visibleProceduralItemsForRoute(scene, "product-configurator", readyAuthored())).toEqual([]);
    expect(visibleProceduralItemsForRoute(scene, "product-configurator", loadingAuthored())).toHaveLength(3);
  });

  it("applies route-specific procedural visibility through a shared policy module", () => {
    const scene = sceneWithLabels([
      "continuous animated water mesh",
      "shore rocks",
      "unsupported decoration",
      "data pulse route",
      "instanced district tower",
      "workstation",
      "lab floor"
    ]);

    expect(labels(visibleProceduralItemsForRoute(scene, "water-lab", readyAuthored()))).toEqual([
      "continuous animated water mesh",
      "shore rocks"
    ]);
    expect(labels(visibleProceduralItemsForRoute(scene, "smart-city", readyAuthored()))).toEqual([
      "data pulse route",
      "instanced district tower"
    ]);
    expect(labels(visibleProceduralItemsForRoute(scene, "robotics-lab", readyAuthored()))).toEqual(["lab floor"]);
    expect(labels(visibleProceduralItemsForRoute(scene, "robotics-lab", loadingAuthored()))).toEqual(scene.items.map((item) => String(item.label)));
  });

  it("centralizes remaining route orchestration decisions outside main", () => {
    const procedural = sceneWithLabels(["procedural"]).items;
    const authored = sceneWithLabels(["authored"]).items;

    expect(labels(composeGalleryRouteRenderItems("product-configurator", procedural, authored))).toEqual(["procedural", "authored"]);
    expect(labels(composeGalleryRouteRenderItems("digital-twin", procedural, authored))).toEqual(["authored", "procedural"]);
    expect(labels(composeGalleryRouteRenderItems("data-galaxy", procedural, []))).toEqual(["procedural"]);

    expect(usesProductConfiguratorHotspotPicking("product-configurator")).toBe(true);
    expect(usesProductConfiguratorHotspotPicking("data-galaxy")).toBe(false);

    expect(routeReceivesWaterRipples("water-lab")).toBe(true);
    expect(routeReceivesWaterRipples("ocean-observatory")).toBe(true);
    expect(routeReceivesWaterRipples("product-configurator")).toBe(false);

    expect(maxCanvasBackingEdgeForRoute("reactor-post")).toBe(2160);
    expect(maxCanvasBackingEdgeForRoute("product-configurator")).toBe(2560);
  });
});

function sceneWithLabels(labelValues: readonly string[]): SceneFrame {
  return {
    items: labelValues.map((label) => ({ label } as RenderItem))
  } as unknown as SceneFrame;
}

function labels(items: readonly RenderItem[]): string[] {
  return items.map((item) => String(item.label));
}

function readyAuthored(): AuthoredAssetRuntimeState {
  return { status: "ready", drawItems: 2 } as AuthoredAssetRuntimeState;
}

function loadingAuthored(): AuthoredAssetRuntimeState {
  return { status: "loading", drawItems: 0 } as AuthoredAssetRuntimeState;
}

function baseCameraPolicyInput(overrides: {
  readonly demoId?: Parameters<typeof applyGalleryRouteCameraPolicy>[0]["demoId"];
  readonly cameraPreset?: string;
  readonly time?: number;
  readonly frameCount?: number;
  readonly controls?: Record<string, number | boolean | string>;
  readonly authored?: AuthoredAssetRuntimeState;
} = {}): Parameters<typeof applyGalleryRouteCameraPolicy>[0] {
  return {
    demoId: overrides.demoId ?? "water-lab",
    cameraPreset: overrides.cameraPreset ?? "gallery",
    time: overrides.time ?? 0,
    frameCount: overrides.frameCount ?? 0,
    controls: overrides.controls ?? {},
    authored: overrides.authored ?? loadingAuthored(),
    sceneBounds: { min: [-1, -1, -1], max: [1, 1, 1] },
    yawRadians: 0.4,
    pitchRadians: -0.2,
    paddingRatio: 0.1
  };
}
