/**
 * Benchmark materials-1 rebuilt: a glass, a brushed-steel and a fabric sphere on a light studio sweep.
 *
 * The scene authors no `environments.*` node and no lights, so the engine's default reflection environment (the
 * structured room generated in code) is what gives the glass edges and the steel its bands. Query parameters switch
 * to the variants the benchmark agents wrote, for paired captures:
 *   ?lights=1      key / fill / rim directional lights and a hemisphere (still no environment node)
 *   ?env=studio    `environments.studio()`: with no /aura-environments files served (a bare app, the benchmark
 *                  sandbox) the preset fails to load and degrades to the structured room with a console warning
 *   ?env=neutral   an explicit `environments.neutral()` (the author chose: unchanged by the default)
 *   ?env=softbox   the structured room requested explicitly, `environments.studio({ preset: "softbox" })`
 */
import { camera, createAuraApp, environments, geometry, lights, material, primitives, scene } from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
  }
}

const params = new URLSearchParams(location.search);
const withLights = params.get("lights") === "1";
const env = params.get("env");

// Seamless studio sweep: a flat floor that curves up into the backdrop.
const HALF_WIDTH = 16;
const FRONT_Z = 10;
const CURVE_Z = -2.2;
const CURVE_R = 3.2;
const WALL_TOP = 10;
const ARC_STEPS = 20;
const profile: { z: number; y: number; nz: number; ny: number }[] = [{ z: FRONT_Z, y: 0, nz: 0, ny: 1 }];
for (let k = 0; k <= ARC_STEPS; k += 1) {
  const th = (k / ARC_STEPS) * (Math.PI / 2);
  profile.push({ z: CURVE_Z - CURVE_R * Math.sin(th), y: CURVE_R - CURVE_R * Math.cos(th), nz: Math.sin(th), ny: Math.cos(th) });
}
profile.push({ z: CURVE_Z - CURVE_R, y: WALL_TOP, nz: 1, ny: 0 });
const XS = 8;
const positions: number[] = [];
const normals: number[] = [];
const indices: number[] = [];
for (const p of profile) {
  for (let i = 0; i <= XS; i += 1) {
    positions.push((i / XS - 0.5) * 2 * HALF_WIDTH, p.y, p.z);
    normals.push(0, p.ny, p.nz);
  }
}
for (let j = 0; j < profile.length - 1; j += 1) {
  for (let i = 0; i < XS; i += 1) {
    const a = j * (XS + 1) + i;
    indices.push(a, a + 1, a + XS + 1, a + 1, a + XS + 2, a + XS + 1);
  }
}

const R = 0.6;
const SPACING = 1.65;
// Materials as the benchmark agents wrote them (bench505 materials-1 sources).
const glass = material.clearGlass({ color: "#d6f2f6", roughness: 0.02, opacity: 0.25, transmission: 1, thickness: 0.9, ior: 1.5, envMapIntensity: 2.4 });
const steel = material.brushedMetal({ color: "#cfd5dc", metallic: 1, roughness: 0.34, anisotropy: 0.9, envMapIntensity: 1.6 });
const fabric = material.fabric({ color: "#7a0f1f", roughness: 1, metallic: 0, envMapIntensity: 0.18, sheen: 1, sheenRoughness: 0.55, sheenColor: "#ff7a86" });

let sc = scene({ background: "#cfcfcd" })
  .camera(camera.perspective({ position: [1.4, 2.5, 6.6], target: [0, 0.55, 0], fov: 33, near: 0.5, far: 80 }));
if (env === "neutral") sc = sc.add(environments.neutral({ intensity: 1, background: false }));
if (env === "studio") sc = sc.add(environments.studio({ intensity: 1.05, background: false }));
if (env === "softbox") sc = sc.add(environments.studio({ preset: "softbox" }));
if (withLights) {
  sc = sc
    .add(lights.hemisphere({ skyColor: "#ffffff", groundColor: "#bdbdbd", intensity: 0.45 }))
    .add(lights.directional({ name: "key", position: [-1.2, 5.5, 5], target: [0, 0.4, 0], intensity: 3.2, color: "#fff4e6", shadow: true }))
    .add(lights.directional({ name: "fill", position: [5.5, 2.8, 4.5], target: [0, 0.5, 0], intensity: 0.9, color: "#e4ecff" }))
    .add(lights.directional({ name: "rim", position: [-1.5, 3.5, -4.5], target: [0, 0.6, 0], intensity: 2.6 }));
}
sc = sc
  .add(geometry.custom(
    geometry.define({
      positions: new Float32Array(positions),
      normals: new Float32Array(normals),
      indices,
      bounds: { min: [-HALF_WIDTH, 0, CURVE_Z - CURVE_R], max: [HALF_WIDTH, WALL_TOP, FRONT_Z] }
    }),
    { name: "sweep", material: material.pbr({ color: "#d4d4d2", roughness: 0.88, metallic: 0 }), receiveShadow: true }
  ))
  .add(primitives.sphere({ name: "glass", size: R * 2, material: glass, castShadow: true }).position(-SPACING, R, 0))
  .add(primitives.sphere({ name: "steel", size: R * 2, material: steel, castShadow: true }).position(0, R, 0))
  .add(primitives.sphere({ name: "fabric", size: R * 2, material: fabric, castShadow: true }).position(SPACING, R, 0));

const app = createAuraApp("#app", { scene: sc });
void app.ready().then(() => { window.__EVAL_READY__ = true; });
