import { DirectionalLight } from "@aura3d/scene";
import { createLightingDefault } from "@aura3d/rendering";
import type { CollectedLight } from "@aura3d/rendering";
import type { ProductLightingConfig, ProductLightingPreset } from "./ProductTypes";

export function createProductLightingPreset(preset: ProductLightingPreset = "catalog-softbox"): ProductLightingConfig {
  const base = createLightingDefault(preset === "inspection-bay" ? "interiorGallery" : preset === "hero-contrast" ? "gameNight" : "studioProduct");
  const key = makeDirectionalLight("product-key-light", [1, 0.92, 0.82], preset === "hero-contrast" ? 3.6 : 2.8, [0.42, -0.72, -0.55], true);
  const rim = makeDirectionalLight("product-rim-light", [0.58, 0.68, 1], preset === "inspection-bay" ? 0.8 : 1.15, [-0.56, -0.28, 0.78], false);
  return {
    preset,
    environmentLighting: base.environmentLighting,
    postprocess: base.postprocess,
    shadow: {
      ...base.shadow,
      light: key.source,
      strength: preset === "inspection-bay" ? 0.32 : preset === "hero-contrast" ? 0.5 : 0.38
    },
    lights: [key, rim]
  };
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
