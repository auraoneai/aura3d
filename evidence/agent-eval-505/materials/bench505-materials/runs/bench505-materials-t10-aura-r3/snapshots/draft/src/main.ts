import { camera, createAuraApp, effects, environments, geometry, lights, material, primitives, scene } from "@aura3d/engine";

declare global {
  interface Window {
    __TASK_STATE__: { spheres: { name: string }[]; keyLightX: number };
    __EVAL_READY__?: boolean;
  }
}

// ---------------------------------------------------------------------------
// Seamless cyclorama: flat floor that curves up (quarter circle) into a vertical backdrop.
// Profile runs from the top of the wall down to the front edge so the standard
// (v, v+cols, v+1) winding faces up on the floor and towards the camera on the wall.
// ---------------------------------------------------------------------------
type ProfilePoint = { y: number; z: number; ny: number; nz: number };
const profile: ProfilePoint[] = [];
const WALL_TOP = 12;
const CURVE_R = 4;
const WALL_Z = -6.5;
const CURVE_CENTER_Z = WALL_Z + CURVE_R;
const FRONT_Z = 16;
profile.push({ y: WALL_TOP, z: WALL_Z, ny: 0, nz: 1 });
profile.push({ y: CURVE_R + 2, z: WALL_Z, ny: 0, nz: 1 });
profile.push({ y: CURVE_R, z: WALL_Z, ny: 0, nz: 1 });
const CURVE_STEPS = 24;
for (let i = 1; i <= CURVE_STEPS; i += 1) {
  const th = Math.PI + (i / CURVE_STEPS) * (Math.PI / 2);
  profile.push({
    y: CURVE_R + CURVE_R * Math.sin(th),
    z: CURVE_CENTER_Z + CURVE_R * Math.cos(th),
    ny: -Math.sin(th),
    nz: -Math.cos(th)
  });
}
profile.push({ y: 0, z: 4, ny: 1, nz: 0 });
profile.push({ y: 0, z: FRONT_Z, ny: 1, nz: 0 });

const COLS = 5;
const HALF_W = 40;
const positions: number[] = [];
const normals: number[] = [];
const uvs: number[] = [];
const indices: number[] = [];
profile.forEach((p, j) => {
  for (let i = 0; i < COLS; i += 1) {
    const u = i / (COLS - 1);
    positions.push((u * 2 - 1) * HALF_W, p.y, p.z);
    normals.push(0, p.ny, p.nz);
    uvs.push(u, j / (profile.length - 1));
  }
});
for (let j = 0; j < profile.length - 1; j += 1) {
  for (let i = 0; i < COLS - 1; i += 1) {
    const v = j * COLS + i;
    indices.push(v, v + COLS, v + 1, v + 1, v + COLS, v + COLS + 1);
  }
}
const cycloramaSpec = geometry.define({
  positions: new Float32Array(positions),
  normals: new Float32Array(normals),
  uvs: new Float32Array(uvs),
  indices,
  bounds: { min: [-HALF_W, 0, WALL_Z], max: [HALF_W, WALL_TOP, FRONT_Z] }
});

const SPHERE_D = 1.7;
const SPACING = 2.2;
const SPHERE_Y = SPHERE_D / 2;
const KEY_Y = 7;
const KEY_Z = 6;

const app = createAuraApp("#app", {
  scene: scene({ background: "#c9ccd1" })
    .add(environments.studio({ intensity: 1.15, background: false }))
    // Large soft key light (moves side to side), with soft PCSS shadow.
    .add(
      lights
        .directional({
          name: "key",
          position: [0, KEY_Y, KEY_Z],
          target: [0, 0.6, 0],
          intensity: 3.4,
          color: "#fff3e4",
          shadow: { filter: "pcss", mapSize: 2048, softness: 2.5, lightSize: 2.5 }
        })
        .runtime({ id: "key", mutable: true })
    )
    // Dimmer fill from the opposite side.
    .add(lights.directional({ name: "fill", position: [-6, 3.2, 4], target: [0, 0.8, 0], intensity: 0.9, color: "#d3e0ff" }))
    // Rim from behind.
    .add(lights.directional({ name: "rim", position: [1.5, 4.5, -6], target: [0, 0.9, 0], intensity: 2.0, color: "#ffffff" }))
    // Overhead rectangular softbox (gives a rectangular catchlight on glass/metal).
    .add(lights.softbox({ name: "softbox", position: [-2.5, 6.5, 3.5], target: [0, 0.8, 0], intensity: 5, width: 4, height: 2.5, color: "#ffffff" }))
    // Floor + backdrop.
    .add(
      geometry.custom(cycloramaSpec, {
        name: "cyclorama",
        material: material.pbr({ color: "#d3d5d8", roughness: 0.75, metallic: 0, envMapIntensity: 0.6 }),
        castShadow: false,
        receiveShadow: true
      })
    )
    // Left: clear glass
    .add(
      primitives
        .sphere({
          name: "glass",
          size: SPHERE_D,
          material: material.clearGlass({
            color: "#d6f4ff",
            opacity: 0.22,
            transmission: 1,
            thickness: 1.2,
            ior: 1.5,
            roughness: 0.01,
            attenuationColor: "#bfe9f2",
            attenuationDistance: 2,
            envMapIntensity: 2.6,
            specularIntensity: 1
          }),
          params: { widthSegments: 96, heightSegments: 64 }
        })
        .position(-SPACING, SPHERE_Y, 0)
    )
    // Centre: brushed aluminium
    .add(
      primitives
        .sphere({
          name: "metal",
          size: SPHERE_D,
          material: material.brushedMetal({
            color: "#d8dde3",
            metallic: 1,
            roughness: 0.34,
            anisotropy: 0.9,
            envMapIntensity: 1.7
          }),
          params: { widthSegments: 96, heightSegments: 64 }
        })
        .position(0, SPHERE_Y, 0)
    )
    // Right: dark red velvet / wool
    .add(
      primitives
        .sphere({
          name: "fabric",
          size: SPHERE_D,
          material: material.fabric({
            color: "#5c0b18",
            roughness: 1,
            metallic: 0,
            sheen: 1,
            sheenColor: "#ff6b7d",
            sheenRoughness: 0.45,
            normal: material.proceduralTexture("fabric-normal", { scale: 70, strength: 0.85, contrast: 0.8 }),
            normalScale: 1.2,
            envMapIntensity: 0.25
          }),
          params: { widthSegments: 96, heightSegments: 64 }
        })
        .position(SPACING, SPHERE_Y, 0)
    )
    .add(effects.contactShadows({ intensity: 0.9, length: 0.6 }))
    .camera(camera.perspective({ position: [2.6, 2.7, 8.2], target: [0, 0.75, 0], fov: 32, near: 0.1, far: 120 }))
});

window.__TASK_STATE__ = {
  spheres: [{ name: "glass" }, { name: "metal" }, { name: "fabric" }],
  keyLightX: 0
};

const t0 = performance.now();
const AMPLITUDE = 4.5;
const OMEGA = 0.38; // rad/s, one sweep cycle ~16.5 s
let first = true;

const update = (): void => {
  const t = (performance.now() - t0) / 1000;
  const x = Math.sin(t * OMEGA) * AMPLITUDE;
  app.nodes.require("key").setPosition(x, KEY_Y, KEY_Z);
  window.__TASK_STATE__.keyLightX = x;
};

app.onFrame(() => {
  update();
  if (first) {
    first = false;
    window.__EVAL_READY__ = true;
  }
});

await app.ready();
update();
requestAnimationFrame(() => {
  window.__EVAL_READY__ = true;
});
