// Scene authoring layer.
//
// The whole 3D scene is DESCRIBED with the public @aura3d/engine API:
// `scene()`, `primitives.box`/`primitives.plane`, `lights`, `material`,
// `camera`, `interactions` and `timeline`. This produces a portable
// AuraSceneSnapshot (the engine's public "source code is the scene
// description" contract) which the renderer in `main.ts` then brings to life.

import {
  camera,
  interactions,
  lights,
  material,
  primitives,
  scene,
  timeline,
  type AuraSceneSnapshot,
} from "@aura3d/engine";

import {
  createBars,
  FOOTPRINT,
  HALF_EXTENT,
  MAX_HEIGHT,
  type BarDatum,
  valueToHeight,
} from "./barData";
import { heightToHex } from "./palette";

export const BACKGROUND = "#0a0f1f";
export const ORBIT_TARGET: [number, number, number] = [0, 1.35, 0];
export const ORBIT_DISTANCE = 10.5;

export interface AuraScene {
  /** The engine-authored scene description, consumed by the renderer. */
  readonly snapshot: AuraSceneSnapshot;
  /** Mutable bar models (shared with the renderer for animation + hover). */
  readonly bars: BarDatum[];
}

/**
 * Compose the data-visualization scene with the @aura3d/engine public API.
 * Returns both the immutable snapshot and the live bar data array.
 */
export function buildAuraScene(): AuraScene {
  const bars = createBars();

  const builder = scene()
    .background(BACKGROUND)
    // Studio-ish lighting: soft ambient fill + a key and a cool rim light.
    .add(lights.ambient({ intensity: 0.45, color: "#cfe0ff" }))
    .add(lights.directional({ position: [6, 9, 5], intensity: 1.45, color: "#ffffff" }))
    .add(lights.directional({ position: [-7, 5, -6], intensity: 0.6, color: "#7aa2ff" }))
    // Ground plane the bars sit on.
    .add(
      primitives
        .plane({
          name: "floor",
          size: [HALF_EXTENT * 2 + 2.4, HALF_EXTENT * 2 + 2.4, 1],
          material: material.pbr({ color: "#0e1530", roughness: 0.95, metallic: 0 }),
        })
        .position(0, 0, 0),
    );

  // One box primitive per data point. The box is authored at its initial
  // height/color; the renderer animates height and recolors per frame.
  for (const bar of bars) {
    const height = valueToHeight(bar.value);
    builder.add(
      primitives
        .box({
          name: bar.name,
          size: [FOOTPRINT, height, FOOTPRINT],
          material: material.pbr({
            color: heightToHex(bar.value),
            roughness: 0.4,
            metallic: 0.08,
          }),
        })
        .position(bar.x, height / 2, bar.z),
    );
  }

  builder
    .camera(camera.orbit({ target: ORBIT_TARGET, distance: ORBIT_DISTANCE, fov: 50 }))
    .add(interactions.orbit())
    .timeline(timeline.loop({ seconds: 6 }))
    .diagnostics(true);

  return { snapshot: builder.toJSON(), bars };
}

export { MAX_HEIGHT };
