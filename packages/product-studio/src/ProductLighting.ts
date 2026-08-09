import { DirectionalLight } from "@aura3d/scene";
import { createLightingDefault } from "@aura3d/rendering";
import type { CollectedLight, EnvironmentLightingOptions } from "@aura3d/rendering";
import type { ProductLightingConfig, ProductLightingPreset } from "./ProductTypes";

export function createProductLightingPreset(preset: ProductLightingPreset = "catalog-softbox"): ProductLightingConfig {
  const base = createLightingDefault(preset === "inspection-bay" ? "interiorGallery" : preset === "hero-contrast" ? "gameNight" : "studioProduct");
  const key = makeDirectionalLight(
    "product-key-light",
    preset === "inspection-bay" ? [1, 0.62, 0.32] : preset === "hero-contrast" ? [0.72, 0.86, 1] : [1, 0.96, 0.9],
    preset === "hero-contrast" ? 4.2 : preset === "inspection-bay" ? 2.15 : 3.1,
    preset === "inspection-bay" ? [-0.62, -0.54, -0.56] : [0.42, -0.72, -0.55],
    true
  );
  const rim = makeDirectionalLight(
    "product-rim-light",
    preset === "inspection-bay" ? [0.28, 0.66, 1] : preset === "hero-contrast" ? [1, 0.36, 0.16] : [0.72, 0.82, 1],
    preset === "inspection-bay" ? 1.35 : preset === "hero-contrast" ? 1.5 : 0.9,
    [-0.56, -0.28, 0.78],
    false
  );
  return {
    preset,
    environmentLighting: productEnvironment(preset, base.environmentLighting),
    postprocess: base.postprocess,
    shadow: {
      ...base.shadow,
      light: key.source,
      strength: preset === "inspection-bay" ? 0.32 : preset === "hero-contrast" ? 0.5 : 0.38
    },
    lights: [key, rim]
  };
}

function productEnvironment(preset: ProductLightingPreset, fallback: EnvironmentLightingOptions): EnvironmentLightingOptions {
  if (preset === "inspection-bay") {
    return {
      color: [1, 0.62, 0.34],
      intensity: 0.5,
      proceduralMap: {
        skyColor: [0.42, 0.68, 1],
        horizonColor: [1, 0.52, 0.24],
        groundColor: [0.045, 0.055, 0.075],
        specularColor: [1, 0.74, 0.42],
        intensity: 0.62,
        specularIntensity: 0.78
      }
    };
  }
  if (preset === "hero-contrast") {
    return {
      color: [0.38, 0.56, 0.92],
      intensity: 0.36,
      proceduralMap: {
        skyColor: [0.12, 0.24, 0.5],
        horizonColor: [0.84, 0.28, 0.12],
        groundColor: [0.012, 0.018, 0.035],
        specularColor: [0.72, 0.88, 1],
        intensity: 0.48,
        specularIntensity: 0.86
      }
    };
  }
  return fallback;
}

function makeDirectionalLight(
  name: string,
  color: readonly [number, number, number],
  intensity: number,
  direction: readonly [number, number, number],
  castsShadow: boolean
): CollectedLight {
  const source = new DirectionalLight(name);
  source.color = [...color] as [number, number, number];
  source.intensity = intensity;
  source.castsShadow = castsShadow;
  return {
    kind: "directional",
    color,
    intensity,
    position: [0, 0, 0],
    direction: normalize(direction),
    range: 0,
    spotAngle: 0,
    penumbra: 0,
    castsShadow,
    layerMask: 0xffffffff,
    source
  };
}

function normalize(value: readonly [number, number, number]): readonly [number, number, number] {
  const length = Math.hypot(value[0], value[1], value[2]);
  return length === 0 ? [0, -1, -1] : [value[0] / length, value[1] / length, value[2] / length];
}
