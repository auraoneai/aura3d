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
    __EVAL_READY__?: boolean;
    __TASK_STATE__?: { spheres: { name: string }[]; keyLightX: number };
  }
}

// ---- Seamless studio sweep (floor curving up into the backdrop) ----
const SWEEP_HALF_WIDTH = 16;
const FRONT_Z = 10;
const CURVE_Z = -2.2; // where the flat floor starts to curve
const CURVE_R = 3.2;
const WALL_TOP = 10;
const ARC_STEPS = 20;

const profile: { z: number; y: number; nz: number; ny: number }[] = [];
profile.push({ z: FRONT_Z, y: 0, nz: 0, ny: 1 });
for (let k = 0; k <= ARC_STEPS; k += 1) {
  const th = (k / ARC_STEPS) * (Math.PI / 2);
  profile.push({
    z: CURVE_Z - CURVE_R * Math.sin(th),
    y: CURVE_R - CURVE_R * Math.cos(th),
    nz: Math.sin(th),
    ny: Math.cos(th)
  });
}
profile.push({ z: CURVE_Z - CURVE_R, y: WALL_TOP, nz: 1, ny: 0 });

const XS = 8;
const sweepPositions: number[] = [];
const sweepNormals: number[] = [];
const sweepIndices: number[] = [];
for (let j = 0; j < profile.length; j += 1) {
  const p = profile[j]!;
  for (let i = 0; i <= XS; i += 1) {
    const x = (i / XS - 0.5) * 2 * SWEEP_HALF_WIDTH;
    sweepPositions.push(x, p.y, p.z);
    sweepNormals.push(0, p.ny, p.nz);
  }
}
for (let j = 0; j < profile.length - 1; j += 1) {
  for (let i = 0; i < XS; i += 1) {
    const a = j * (XS + 1) + i;
    const b = a + 1;
    const c = a + XS + 1;
    const d = c + 1;
    sweepIndices.push(a, b, c, b, d, c);
  }
}

const sweepMaterial = material.pbr({ color: "#d4d4d2", roughness: 0.88, metallic: 0, envMapIntensity: 0.7 });

// ---- Spheres ----
const R = 0.6;
const SPACING = 1.65;

const glassMaterial = material.clearGlass({
  color: "#d6f2f6",
  roughness: 0.02,
  opacity: 0.25,
  transmission: 1,
  thickness: 0.9,
  ior: 1.5,
  envMapIntensity: 2.4
});

const metalMaterial = material.brushedMetal({
  color: "#cfd5dc",
  metallic: 1,
  metalness: 1,
  roughness: 0.34,
  anisotropy: 0.9,
  envMapIntensity: 1.6
});

const fabricMaterial = material.fabric({
  color: "#7a0f1f",
  roughness: 1,
  metallic: 0,
  metalness: 0,
  envMapIntensity: 0.18,
  sheen: 1,
  sheenRoughness: 0.55,
  sheenColor: "#ff7a86",
  normal: material.proceduralTexture("fabric-normal", { scale: 70, strength: 0.8, contrast: 0.8 })
});

const KEY_Y = 5.5;
const KEY_Z = 5;
const keyX = (t: number): number => -1.2 + 3.6 * Math.sin(t * 0.45);

const sc = scene({ background: "#cfcfcd" })
  .camera(camera.perspective({ position: [1.4, 2.5, 6.6], target: [0, 0.55, 0], fov: 33, near: 0.5, far: 80 }))
  .add(environments.neutral({ intensity: 1.0, background: false }))
  .add(lights.hemisphere({ skyColor: "#ffffff", groundColor: "#bdbdbd", intensity: 0.45 }))
  // key: large soft light, drifts side to side
  .add(
    lights
      .directional({
        name: "key",
        position: [keyX(0), KEY_Y, KEY_Z],
        target: [0, 0.4, 0],
        intensity: 3.2,
        color: "#fff4e6",
        shadow: { filter: "pcss", softness: 2, lightSize: 3, mapSize: 2048, intensity: 0.85 }
      })
      .runtime({ id: "key", mutable: true })
  )
  // fill: dimmer, opposite side
  .add(lights.directional({ name: "fill", position: [5.5, 2.8, 4.5], target: [0, 0.5, 0], intensity: 0.9, color: "#e4ecff" }))
  // rim: from behind
  .add(lights.directional({ name: "rim", position: [-1.5, 3.5, -4.5], target: [0, 0.6, 0], intensity: 2.6, color: "#ffffff" }))
  .add(
    geometry.custom(
      geometry.define({
        positions: new Float32Array(sweepPositions),
        normals: new Float32Array(sweepNormals),
        indices: sweepIndices,
        bounds: { min: [-SWEEP_HALF_WIDTH, 0, CURVE_Z - CURVE_R], max: [SWEEP_HALF_WIDTH, WALL_TOP, FRONT_Z] }
      }),
      { name: "sweep", material: sweepMaterial, castShadow: false, receiveShadow: true }
    )
  )
  .add(primitives.sphere({ name: "glass", size: R * 2, material: glassMaterial, castShadow: true }).position(-SPACING, R, 0))
  .add(primitives.sphere({ name: "metal", size: R * 2, material: metalMaterial, castShadow: true }).position(0, R, 0))
  .add(primitives.sphere({ name: "fabric", size: R * 2, material: fabricMaterial, castShadow: true }).position(SPACING, R, 0))
  .add(effects.contactShadows({ intensity: 1, length: 0.5 }))
  .add(effects.bloom({ intensity: 0.2, threshold: 0.92, radius: 0.4 }));

window.__TASK_STATE__ = {
  spheres: [{ name: "glass" }, { name: "metal" }, { name: "fabric" }],
  keyLightX: keyX(0)
};

const app = createAuraApp("#app", { scene: sc });

let t = 0;
app.onFrame((f) => {
  t += f.dt;
  const x = keyX(t);
  app.nodes.require("key").setPosition(x, KEY_Y, KEY_Z);
  window.__TASK_STATE__ = {
    spheres: [{ name: "glass" }, { name: "metal" }, { name: "fabric" }],
    keyLightX: x
  };
});

await app.ready();
window.__EVAL_READY__ = true;
