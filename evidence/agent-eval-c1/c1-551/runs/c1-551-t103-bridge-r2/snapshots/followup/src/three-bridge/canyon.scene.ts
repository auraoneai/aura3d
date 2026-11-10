// Native Aura3D scene for the bridged canyon: sky, sun, haze and the shadow-casting terrain.
import { createAuraApp, effects, lights, scene, sky, type AuraSceneBuilder } from "@aura3d/engine";
import { canyonModel, canyonOutput } from "./canyon.bridge";

export const SUN_AZIMUTH_DEG = 38; // measured from +z toward +x
export const SUN_ELEVATION_DEG = 7;
const az = (SUN_AZIMUTH_DEG * Math.PI) / 180;
const el = (SUN_ELEVATION_DEG * Math.PI) / 180;
const sunDir: [number, number, number] = [Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)];

export function createCanyonScene(): AuraSceneBuilder {
  return scene()
    .add(
      sky.gradient({
        name: "dusk-sky",
        zenith: "#24348f",
        horizon: "#d9748a",
        ground: "#7a4a5e",
        exponent: 1.3,
        horizonGlow: 0.9,
        bands: [
          { elevationDeg: 2, widthDeg: 7, color: "#ff8a4a", intensity: 0.8 },
          { elevationDeg: 10, widthDeg: 14, color: "#c04a95", intensity: 0.5 }
        ],
        sun: { elevationDeg: SUN_ELEVATION_DEG, azimuthDeg: SUN_AZIMUTH_DEG, intensity: 1 },
        affectsFog: true
      })
    )
    .add(lights.hemisphere({ name: "sky-fill", skyColor: "#6f78d0", groundColor: "#c46f4a", intensity: 1.2 }))
    .add(
      lights.directional({
        name: "sun",
        position: [sunDir[0] * 200, sunDir[1] * 200, sunDir[2] * 200],
        target: [0, 0, 0],
        color: "#ff9a52",
        intensity: 3.0,
        shadow: { cascades: 3, maxDistance: 170, mapSize: 4096, filter: "pcf", softness: 2.5, bias: 0.003, normalBias: 0.12, fit: "camera" }
      })
    )
    .add(canyonModel({ castShadow: true, receiveShadow: true }))
    .add(effects.fog({ color: "sky", density: 0.0045, affectsBackground: false }));
}

export function mountCanyon(selector = "#app") {
  return createAuraApp(selector, { scene: createCanyonScene(), output: canyonOutput });
}
