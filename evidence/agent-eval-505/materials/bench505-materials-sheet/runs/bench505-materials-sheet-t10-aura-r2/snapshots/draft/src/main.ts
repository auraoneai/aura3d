import { camera, createAuraApp, environments, geometry, lights, material, primitives, scene } from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
    __TASK_STATE__?: { spheres: { name: string }[]; keyLightX: number };
  }
}

// ---- Seamless cyclorama: flat floor that curves up into the backdrop ----
const NX = 24;
const HALF_W = 16;
const Z_FRONT = 14;
const Z_WALL = -7;
const RADIUS = 4;
const WALL_TOP = 14;
const FLAT_END = Z_WALL + RADIUS; // z where the curve begins

// Profile points (z, y, normalZ, normalY) from the front edge to the top of the backdrop.
const profile: [number, number, number, number][] = [];
for (let k = 0; k <= 8; k += 1) {
  const z = Z_FRONT + ((FLAT_END - Z_FRONT) * k) / 8;
  profile.push([z, 0, 0, 1]);
}
const ARC = 16;
for (let k = 1; k <= ARC; k += 1) {
  const a = (k / ARC) * (Math.PI / 2);
  profile.push([FLAT_END - Math.sin(a) * RADIUS, RADIUS - Math.cos(a) * RADIUS, Math.sin(a), Math.cos(a)]);
}
for (let k = 1; k <= 4; k += 1) {
  profile.push([Z_WALL, RADIUS + ((WALL_TOP - RADIUS) * k) / 4, 1, 0]);
}

const positions = new Float32Array(profile.length * (NX + 1) * 3);
const normals = new Float32Array(positions.length);
const indices: number[] = [];
profile.forEach(([z, y, nz, ny], p) => {
  for (let i = 0; i <= NX; i += 1) {
    const v = p * (NX + 1) + i;
    positions.set([(i / NX - 0.5) * 2 * HALF_W, y, z], v * 3);
    normals.set([0, ny, nz], v * 3);
    if (p < profile.length - 1 && i < NX) {
      const a = v, b = v + 1, c = v + NX + 1, d = v + NX + 2;
      indices.push(a, b, c, b, d, c);
    }
  }
});

const floor = geometry.custom(
  geometry.define({ positions, normals, indices, bounds: { min: [-HALF_W, 0, Z_WALL], max: [HALF_W, WALL_TOP, Z_FRONT] } }),
  { name: "cyclorama", material: material.pbr({ color: "#d4d5d8", roughness: 0.85, metallic: 0 }), castShadow: false, receiveShadow: true }
);

// ---- Materials ----
const glass = material.glass({
  color: "#eaf7ff",
  roughness: 0.02,
  metallic: 0,
  ior: 1.5,
  thickness: 1.2,
  envMapIntensity: 2
});

const steel = material.brushedMetal({
  color: "#c8cbd0",
  metallic: 1,
  roughness: 0.34,
  anisotropy: 0.9,
  anisotropyRotation: 0,
  normal: material.proceduralTextures.brushedMetal({ scale: 24, strength: 0.6, direction: [1, 0, 0] }),
  normalScale: 0.6,
  envMapIntensity: 1.3
});

const velvet = material.fabric({
  color: "#5e0c18",
  roughness: 1,
  metallic: 0,
  sheen: 1,
  sheenColor: "#e0566a",
  sheenRoughness: 0.45,
  normal: material.proceduralTextures.fabric({ scale: 60, strength: 1 }),
  normalScale: 1.2,
  envMapIntensity: 0.35
});

const R = 0.9;
const X = 2.5;
const KEY_Y = 7;
const KEY_Z = 6;

const sc = scene({ background: "#d4d5d8" })
  .camera(camera.perspective({ position: [4.2, 3.0, 9.6], target: [0, 0.75, 0], fov: 34, near: 0.5, far: 80 }))
  .add(environments.studio({ intensity: 1.0, background: false }))
  .add(lights.hemisphere({ skyColor: "#ffffff", groundColor: "#bdbdc2", intensity: 0.35 }))
  // large soft key (front-left, high), drifts side to side
  .add(
    lights.directional({
      name: "key",
      position: [-4, KEY_Y, KEY_Z],
      target: [0, 0.5, 0],
      intensity: 3.2,
      color: "#fff3e4",
      shadow: { filter: "pcss", softness: 1, lightSize: 1, mapSize: 2048 }
    }).runtime({ id: "key", mutable: true })
  )
  // dimmer fill from the opposite side
  .add(lights.directional({ name: "fill", position: [7, 3.5, 5], target: [0, 0.8, 0], intensity: 0.9, color: "#dfe8ff" }))
  // rim from behind
  .add(lights.directional({ name: "rim", position: [0, 4.5, -6], target: [0, 1, 0], intensity: 2.2, color: "#ffffff" }))
  .add(floor)
  .add(primitives.sphere({ name: "glass", size: R * 2, material: glass }).position(-X, R, 0))
  .add(primitives.sphere({ name: "metal", size: R * 2, material: steel }).position(0, R, 0))
  .add(primitives.sphere({ name: "fabric", size: R * 2, material: velvet }).position(X, R, 0));

const app = createAuraApp("#app", { scene: sc });

window.__TASK_STATE__ = { spheres: [{ name: "glass" }, { name: "metal" }, { name: "fabric" }], keyLightX: -4 };

let t = 0;
app.onFrame((f) => {
  t += f.dt;
  const x = Math.sin(t * 0.5) * 5;
  app.nodes.require("key").setPosition(x, KEY_Y, KEY_Z);
  window.__TASK_STATE__ = { spheres: [{ name: "glass" }, { name: "metal" }, { name: "fabric" }], keyLightX: x };
});

await app.ready();
requestAnimationFrame(() => {
  window.__EVAL_READY__ = true;
});
