import { createStudioLighting } from "@galileo3d/engine/production-runtime";
import { createLightingRig, type CollectedLight } from "@galileo3d/rendering";
import type { SceneFrame } from "./sceneBuilderPrimitives";

export type ProductConfiguratorLightingControl = "studio" | "inspection" | string;
export type ProductConfiguratorShowroomLightingPreset = "production-runtime-product-studio" | "production-runtime-inspection-studio";

export interface ProductConfiguratorShowroomLighting {
  readonly preset: ProductConfiguratorShowroomLightingPreset;
  readonly collectedLights: readonly CollectedLight[];
  readonly diagnostics: ReturnType<typeof createLightingRig>["diagnostics"];
}

export function createProductConfiguratorShowroomLighting(
  lightingControl: ProductConfiguratorLightingControl = "studio"
): ProductConfiguratorShowroomLighting {
  const inspection = lightingControl === "inspection";
  const lightingRig = createLightingRig({
    preset: inspection ? "product-detail" : "product-shot",
    intensityScale: 1,
    shadows: false
  });
  return {
    preset: inspection ? "production-runtime-inspection-studio" : "production-runtime-product-studio",
    collectedLights: createStudioLighting({
      preset: inspection ? "inspection" : "product",
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
