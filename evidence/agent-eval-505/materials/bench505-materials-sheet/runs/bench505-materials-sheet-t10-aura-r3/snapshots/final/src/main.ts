import { camera, createAuraApp, effects, environments, geometry, lights, material, primitives, scene } from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
    __TASK_STATE__?: { spheres: { name: string }[]; keyLightX: number };
  }
}

// Seamless studio sweep: a wall that curves down into the floor, extruded along X.
// Profile runs from the top of the wall down to the front of the floor so the normals face the camera.
const WALL_Z = -6, RADIUS = 4, WALL_TOP = 10, FLOOR_FRONT = 16, HALF_W = 24;
const profile: { y: number; z: number; ny: number; nz: number }[] = [{ y: WALL_TOP, z: WALL_Z, ny: 0, nz: 1 }];
const ARC = 16;
for (let i = 0; i <= ARC; i += 1) {
  const th = (i / ARC) * Math.PI * 0.5;
  profile.push({ y: RADIUS - RADIUS * Math.sin(th), z: WALL_Z + RADIUS - RADIUS * Math.cos(th), ny: Math.sin(th), nz: Math.cos(th) });
}
profile.push({ y: 0, z: FLOOR_FRONT, ny: 1, nz: 0 });

const positions = new Float32Array(profile.length * 2 * 3);
const normals = new Float32Array(positions.length);
const indices: number[] = [];
profile.forEach((p, j) => {
  for (let i = 0; i < 2; i += 1) {
    const v = j * 2 + i;
    positions.set([i === 0 ? -HALF_W : HALF_W, p.y, p.z], v * 3);
    normals.set([0, p.ny, p.nz], v * 3);
    if (i === 0 && j < profile.length - 1) indices.push(v, v + 2, v + 1, v + 1, v + 2, v + 3);
  }
});
const sweep = geometry.custom(
  geometry.define({ positions, normals, indices, bounds: { min: [-HALF_W, 0, WALL_Z], max: [HALF_W, WALL_TOP, FLOOR_FRONT] } }),
  { name: "sweep", material: material.pbr({ color: "#c4c6c9", roughness: 0.85 }), castShadow: false }
);

const R = 0.8; // sphere radius
const glass = material.clearGlass({ color: "#dff4ff", opacity: 0.3, ior: 1.5, thickness: 1.2, attenuationColor: "#bfe6f2", attenuationDistance: 2 });
const metal = material.brushedMetal({ color: "#cfd6de", metallic: 1, roughness: 0.34, anisotropy: 0.9 });
const fabric = material.fabric({
  color: "#6e0f1c",
  roughness: 1,
  metallic: 0,
  sheen: 1,
  sheenColor: "#ff7a86",
  sheenRoughness: 0.5,
  envMapIntensity: 0.25,
  normal: material.proceduralTexture("fabric-normal", { scale: 60, strength: 0.9, contrast: 0.8 })
});

const sc = scene({ background: "#bcbfc4" })
  .camera(camera.perspective({ position: [3.4, 2.7, 7.6], target: [0, 0.75, 0], fov: 34, near: 0.5, far: 80 }))
  .add(environments.studio({ intensity: 1.0, background: false }))
  .add(lights.hemisphere({ skyColor: "#ffffff", groundColor: "#b5b7ba", intensity: 0.35 }))
  .add(
    lights.directional({
      name: "key",
      position: [-2, 7, 6],
      target: [0, 0.5, 0],
      intensity: 3.2,
      color: "#fff3e4",
      shadow: { mapSize: 2048, filter: "pcss", softness: 3, lightSize: 6, intensity: 0.8, bias: -0.0004, normalBias: 0.03 }
    }).runtime({ id: "key", mutable: true })
  )
  .add(lights.directional({ name: "fill", position: [7, 3, 4], target: [0, 0.6, 0], intensity: 0.9, color: "#d6e4ff" }))
  .add(lights.directional({ name: "rim", position: [0, 4.5, -7], target: [0, 0.8, 0], intensity: 2.6, color: "#ffffff" }))
  .add(sweep)
  .add(primitives.sphere({ name: "glass", size: R * 2, material: glass }).position(-2.2, R, 0))
  .add(primitives.sphere({ name: "metal", size: R * 2, material: metal }).position(0, R, 0))
  .add(primitives.sphere({ name: "fabric", size: R * 2, material: fabric }).position(2.2, R, 0))
  .add(effects.contactShadows({ length: 0.6, intensity: 0.7 }));

const app = createAuraApp("#app", { scene: sc });

const state: { spheres: { name: string }[]; keyLightX: number } = {
  spheres: [{ name: "glass" }, { name: "metal" }, { name: "fabric" }],
  keyLightX: -2
};
window.__TASK_STATE__ = state;

let t = 0;
app.onFrame((f) => {
  t += f.dt;
  const x = -2 + Math.sin(t * 0.5) * 4.5; // slow side-to-side drift
  app.nodes.require("key").setPosition(x, 7, 6);
  state.keyLightX = x;
  window.__TASK_STATE__ = state;
});

await app.ready();
window.__EVAL_READY__ = true;
