// Native Aura3D source for the bridged "canyon" asset (terrain, boulders, shrubs come from recipes/canyon.mjs).
// Sky, light, haze and the flythrough camera are native.
import { createAuraApp, effects, lights, scene, sky, type AuraSceneBuilder } from "@aura3d/engine";
import { canyonCamera, canyonModel, canyonOutput } from "./canyon.bridge";

// Sun: low, in front and to the left of the canyon axis (azimuth measured from +z towards +x).
export const SUN = { elevationDeg: 10, azimuthDeg: 192 } as const;
const sunDir = (): [number, number, number] => {
  const el = (SUN.elevationDeg * Math.PI) / 180;
  const az = (SUN.azimuthDeg * Math.PI) / 180;
  return [Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)];
};
const HORIZON = "#d9728c";

export function createCanyonScene(): AuraSceneBuilder {
  const d = sunDir();
  return scene({ background: HORIZON })
    .add(
      sky.gradient({
        name: "dusk-sky",
        zenith: "#1a2f96",
        horizon: HORIZON,
        ground: "#6b3a45",
        exponent: 0.8,
        horizonGlow: 0.25,
        sun: { ...SUN, color: "#ffb060", intensity: 1.5, discSize: 2.5 },
        bands: [
          { elevationDeg: 2, widthDeg: 9, color: "#ff8a3a", intensity: 0.8 },
          { elevationDeg: 8, widthDeg: 10, color: "#c4408f", intensity: 0.3 }
        ],
        captureEnvironment: true,
        affectsFog: false
      })
    )
    .add(lights.hemisphere({ name: "dusk-fill", skyColor: "#8a84d8", groundColor: "#c46e44", intensity: 1.3 }))
    .add(
      lights.directional({
        name: "sun",
        position: [d[0] * 200, d[1] * 200, d[2] * 200],
        target: [0, 0, 0],
        intensity: 3.6,
        color: "#ff9a4e",
        shadow: { cascades: 3, maxDistance: 220, fit: "camera", mapSize: 2048 }
      })
    )
    .add(effects.fog({ name: "haze", color: HORIZON, mode: "exp2", density: 0.0085, affectsBackground: false }))
    .add(effects.bloom({ intensity: 0.35, threshold: 0.85, radius: 0.6 }))
    .add(canyonModel({ castShadow: true, receiveShadow: true }).runtime({ id: "canyon" }))
    .camera(canyonCamera);
}

export function mountCanyon(selector = "#app") {
  return createAuraApp(selector, { scene: createCanyonScene(), output: { ...canyonOutput, exposure: 1.5 } });
}
