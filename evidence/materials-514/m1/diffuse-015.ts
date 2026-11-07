import {
  camera,
  createAuraApp,
  effects,
  environments,
  geometry,
  lights,
  material,
  primitives,
  scene
} from "@aura3d/engine";

declare global {
  interface Window {
    __TASK_STATE__?: { spheres: { name: string }[]; keyLightX: number };
    __EVAL_READY__?: boolean;
  }
}

// ---------------------------------------------------------------------------
// Seamless studio cove: flat floor that sweeps up through a quarter circle into a vertical backdrop.
// ---------------------------------------------------------------------------
function buildCove() {
  const halfWidth = 40;
  const zFront = 30;
  const zFlatEnd = -3.5;
  const radius = 5;
  const wallHeight = 30;

  type P = { y: number; z: number; ny: number; nz: number; v: number };
  const profile: P[] = [];
  profile.push({ y: 0, z: zFront, ny: 1, nz: 0, v: 0 });
  profile.push({ y: 0, z: zFlatEnd, ny: 1, nz: 0, v: 0.3 });
  const arcSteps = 32;
  for (let i = 1; i <= arcSteps; i++) {
    const th = (i / arcSteps) * (Math.PI / 2);
    profile.push({
      y: radius - radius * Math.cos(th),
      z: zFlatEnd - radius * Math.sin(th),
      ny: Math.cos(th),
      nz: Math.sin(th),
      v: 0.3 + 0.2 * (i / arcSteps)
    });
  }
  profile.push({ y: radius + wallHeight, z: zFlatEnd - radius, ny: 0, nz: 1, v: 1 });

  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (const p of profile) {
    for (const x of [-halfWidth, halfWidth]) {
      positions.push(x, p.y, p.z);
      normals.push(0, p.ny, p.nz);
      uvs.push(x < 0 ? 0 : 1, p.v);
    }
  }
  for (let i = 0; i < profile.length - 1; i++) {
    const v00 = i * 2;
    const v10 = i * 2 + 1;
    const v01 = (i + 1) * 2;
    const v11 = (i + 1) * 2 + 1;
    indices.push(v00, v10, v01, v10, v11, v01);
  }
  return geometry.define({
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    uvs: new Float32Array(uvs),
    indices: new Uint32Array(indices),
    bounds: { min: [-halfWidth, 0, zFlatEnd - radius], max: [halfWidth, radius + wallHeight, zFront] }
  });
}

const SPHERE_SIZE = 1.5; // diameter, identical for all three
const SPACING = 2.05;
const SPHERE_Y = SPHERE_SIZE / 2;

const KEY_CENTER = 1.2;
const KEY_AMPLITUDE = 3.6;
const keyX = (t: number): number => KEY_CENTER + KEY_AMPLITUDE * Math.sin(t * 0.45);

const state: { spheres: { name: string }[]; keyLightX: number } = {
  spheres: [{ name: "glass" }, { name: "metal" }, { name: "fabric" }],
  keyLightX: keyX(0)
};
window.__TASK_STATE__ = state;

const KEY_Y = 6.5;
const KEY_Z = 5;

const stage = scene({ background: "#c9cccf" })
  .add(environments.studio({ preset: "softbox", intensity: 1.05, background: false, diffuseIntensity: 0.15 }))
  // Big soft key (shadow caster) that drifts side to side.
  .add(
    lights
      .directional({
        name: "key",
        position: [keyX(0), KEY_Y, KEY_Z],
        target: [0, 0.6, 0],
        intensity: 2.6,
        color: "#fff3e4",
        shadow: { mapSize: 2048, filter: "pcss", softness: 1.4, lightSize: 1.6, intensity: 0.8, bias: 0.0005, normalBias: 0.02 }
      })
      .runtime({ id: "key-light", mutable: true })
  )
  // Large softbox travelling with the key: broad reflections on glass and metal.
  .add(
    lights
      .softbox({
        name: "key-softbox",
        position: [keyX(0), KEY_Y - 0.5, KEY_Z + 1],
        target: [0, 0.6, 0],
        intensity: 3,
        width: 4,
        height: 2.4,
        color: "#fff6ec"
      })
      .runtime({ id: "key-softbox", mutable: true })
  )
  // Dimmer, cooler fill from the opposite side.
  .add(lights.directional({ name: "fill", position: [-6, 3, 4], target: [0, 0.6, 0], intensity: 0.8, color: "#d3e0ff" }))
  // Rim light from behind.
  .add(lights.directional({ name: "rim", position: [1, 4, -7], target: [0, 0.8, 0], intensity: 2.0, color: "#ffffff" }))
  // Cove floor / backdrop.
  .add(
    geometry
      .custom(buildCove(), {
        name: "cove",
        material: material.pbr({ color: "#cfd1d4", roughness: 0.75, metallic: 0, envMapIntensity: 0.6 }),
        castShadow: false,
        receiveShadow: true
      })
  )
  // Left: clear glass.
  .add(
    primitives
      .sphere({
        name: "glass-sphere",
        size: SPHERE_SIZE,
        material: material.studioGlass({ tint: "#b5e4f5", ior: 1.5, thickness: 1.4 }),
        castShadow: true,
        receiveShadow: false
      })
      .position(-SPACING, SPHERE_Y, 0)
  )
  // Centre: brushed steel.
  .add(
    primitives
      .sphere({
        name: "metal-sphere",
        size: SPHERE_SIZE,
        material: material.studioMetal({ color: "#c8cdd4", roughness: 0.32 }),
        castShadow: true,
        receiveShadow: true
      })
      .position(0, SPHERE_Y, 0)
  )
  // Right: dark red velvet / wool.
  .add(
    primitives
      .sphere({
        name: "fabric-sphere",
        size: SPHERE_SIZE,
        material: material.fabric({
          color: "#6e0f1c",
          roughness: 1,
          metallic: 0,
          metalness: 0,
          envMapIntensity: 0.25,
          sheen: 1,
          sheenColor: "#e0566c",
          sheenRoughness: 0.45,
          normal: material.proceduralTexture("fabric-normal", { scale: 120, strength: 0.85, contrast: 0.8 })
        }),
        castShadow: true,
        receiveShadow: true
      })
      .position(SPACING, SPHERE_Y, 0)
  )
  .add(effects.contactShadows({ intensity: 0.9, length: 0.6 }))
  .add(effects.antiAlias())
  .camera(camera.perspective({ position: [2.4, 2.5, 7.6], target: [0, 0.65, 0], fov: 36, near: 0.1, far: 120 }));

const app = createAuraApp("#app", { scene: stage });

let time = 0;
let firstFrameDone = false;
app.onFrame((frame) => {
  time += frame.dt;
  const x = keyX(time);
  app.nodes.require("key-light").setPosition(x, KEY_Y, KEY_Z);
  app.nodes.require("key-softbox").setPosition(x, KEY_Y - 0.5, KEY_Z + 1);
  state.keyLightX = x;
  window.__TASK_STATE__ = state;
  if (!firstFrameDone) {
    firstFrameDone = true;
    window.__EVAL_READY__ = true;
  }
});

void app.ready().then(() => {
  requestAnimationFrame(() => {
    window.__EVAL_READY__ = true;
  });
});
