import { createStudioLighting } from "@aura3d/engine/production-runtime";
import { createLightingRig, type CollectedLight } from "@aura3d/rendering";
import type { SceneFrame } from "./sceneBuilderPrimitives";

export type ProductConfiguratorLightingControl = "studio" | "environment" | "inspection" | string;
export type ProductConfiguratorShowroomLightingPreset =
  | "production-runtime-product-studio"
  | "production-runtime-environment-studio"
  | "production-runtime-inspection-studio";

export interface ProductConfiguratorShowroomLighting {
  readonly preset: ProductConfiguratorShowroomLightingPreset;
  readonly collectedLights: readonly CollectedLight[];
  readonly diagnostics: ReturnType<typeof createLightingRig>["diagnostics"];
}

export function createProductConfiguratorShowroomLighting(
  lightingControl: ProductConfiguratorLightingControl = "studio"
): ProductConfiguratorShowroomLighting {
  if (lightingControl === "inspection") {
    const lightingRig = createLightingRig({
      preset: "product-detail",
      intensityScale: 1,
      shadows: false
    });
    return {
      preset: "production-runtime-inspection-studio",
      collectedLights: createStudioLighting({
        preset: "inspection",
        shadows: false,
        intensityScale: 1
      }),
      diagnostics: lightingRig.diagnostics
    };
  }
  if (lightingControl === "environment") {
    const lightingRig = createLightingRig({
      preset: "urban-neon",
      intensityScale: 1.05,
      shadows: false
    });
    return {
      preset: "production-runtime-environment-studio",
      collectedLights: createStudioLighting({
        preset: "softbox",
        shadows: false,
        intensityScale: 0.82
      }).map((light) => {
        if (/key/i.test(light.source.name)) return adjustProductLight(light, [0.42, 0.62, 1], 0.86);
        if (/fill/i.test(light.source.name)) return adjustProductLight(light, [0.28, 0.72, 0.82], 1.35);
        return adjustProductLight(light, [0.72, 0.38, 0.95], 1.12);
      }),
      diagnostics: lightingRig.diagnostics
    };
  }
  const lightingRig = createLightingRig({
    preset: "product-shot",
    intensityScale: 1,
    shadows: false
  });
  return {
    preset: "production-runtime-product-studio",
    collectedLights: createStudioLighting({
      preset: "product",
      shadows: false,
      intensityScale: 1
    }),
    diagnostics: lightingRig.diagnostics
  };
}

export function productConfiguratorShowroomLights(lights: readonly CollectedLight[]): readonly CollectedLight[] {
  return lights.map((light) => {
    const sourceName = light.source.name;
    if (/warm-edge/i.test(sourceName)) {
      return adjustProductLight(light, [0.74, 0.36, 0.24], 0.32);
    }
    if (/cool-edge|rim/i.test(sourceName)) {
      return adjustProductLight(light, [0.38, 0.4, 0.38], 0.38);
    }
    if (/key/i.test(sourceName)) {
      return adjustProductLight(light, [0.96, 0.84, 0.72], 0.98);
    }
    if (/fill/i.test(sourceName)) {
      return adjustProductLight(light, [0.5, 0.56, 0.64], 1.18);
    }
    return light;
  });
}

export function productConfiguratorCarPaintEnvironment(
  proceduralMap: SceneFrame["environment"]["proceduralMap"]
): SceneFrame["environment"]["proceduralMap"] {
  return {
    ...proceduralMap,
    skyColor: [0.024, 0.025, 0.024],
    horizonColor: [0.058, 0.052, 0.046],
    groundColor: [0.018, 0.016, 0.015],
    specularColor: [0.105, 0.093, 0.082],
    intensity: Math.min(proceduralMap.intensity, 0.58),
    specularIntensity: Math.min(proceduralMap.specularIntensity, 0.105)
  };
}

function adjustProductLight(
  light: CollectedLight,
  color: readonly [number, number, number],
  intensityScale: number
): CollectedLight {
  return {
    ...light,
    color,
    intensity: round3(light.intensity * intensityScale)
  };
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}
